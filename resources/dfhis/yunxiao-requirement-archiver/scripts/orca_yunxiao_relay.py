#!/usr/bin/env python3
"""Orca Yunxiao model-relay coordinator.

Drives one DFHIS requirement through a stage DAG on Orca orchestration,
pinning each stage to a model by launching `kimi --yolo -m <model>` workers.

Model mapping (2026-08-04 user rule):
  doc/PRD -> k3, visual -> k3, review -> k3 (configurable), everything else -> deepseek-v4-flash.

Usage:
  python3 orca_yunxiao_relay.py DFHIS-31894
  python3 orca_yunxiao_relay.py DFHIS-31894 --stages verify,deliver
  python3 orca_yunxiao_relay.py DFHIS-31894 --from-stage review --dry-run
  python3 orca_yunxiao_relay.py --check [--probe]            # new-machine bootstrap check
  python3 orca_yunxiao_relay.py --check --fix --api-key sk-...  # add deepseek provider to kimi config

New machine without deepseek configured: run --check --fix (or set YX_RELAY_MODEL_EXEC=kimi-code/k3
to degrade the whole relay to single-model k3).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

ORCA = os.environ.get("ORCA_CLI_COMMAND", "orca")
SKILL_DIR = Path(__file__).resolve().parent.parent
ARCHIVE_ROOT = Path(os.environ.get("YUNXIAO_ARCHIVE_WORKSPACE", str(Path.home() / "workspace" / "yunxiao")))

MODEL_DOC = os.environ.get("YX_RELAY_MODEL_DOC", "kimi-code/k3")
MODEL_VISUAL = os.environ.get("YX_RELAY_MODEL_VISUAL", "kimi-code/k3")
MODEL_REVIEW = os.environ.get("YX_RELAY_MODEL_REVIEW", "kimi-code/k3")
MODEL_EXEC = os.environ.get("YX_RELAY_MODEL_EXEC", "deepseek/deepseek-v4-flash")

# --- Worker profiles: role -> "cli:model". Per-CLI differences live in ADAPTERS (code), not user config.
DEFAULT_ROLE_PROFILES = {
    "doc": "kimi:kimi-code/k3",
    "exec": "kimi:deepseek/deepseek-v4-flash",
    "visual": "kimi:kimi-code/k3",
    "review": "kimi:kimi-code/k3",
}

ADAPTERS = {
    "kimi": {
        "launch": "kimi --yolo -m {model}",
        "probe": ["kimi", "-m", "{model}", "-p", "{prompt}"],
        "binary": "kimi",
    },
    "claude": {
        "launch": "claude --model {model} --permission-mode bypassPermissions",
        "probe": ["claude", "--model", "{model}", "-p", "{prompt}"],
        "binary": "claude",
    },
    "codex": {
        "launch": "codex --model {model} -a never -s danger-full-access",
        "probe": ["codex", "exec", "--model", "{model}", "-a", "never", "-s", "danger-full-access", "{prompt}"],
        "binary": "codex",
    },
    "opencode": {
        "launch": "opencode -m {model}",
        "probe": ["opencode", "run", "-m", "{model}", "{prompt}"],
        "binary": "opencode",
    },
}

CHECK_WAIT_TIMEOUT_MS = 900000
STAGE_HARD_TIMEOUT_S = 7200

KIMI_HOME = Path(os.environ.get("KIMI_CODE_HOME", Path.home() / ".kimi-code"))

DEEPSEEK_PROVIDER_BLOCK = """
[providers.deepseek]
type = "openai"
base_url = "https://api.deepseek.com/v1"
api_key = "{api_key}"
"""

DEEPSEEK_MODEL_BLOCK = """
[models."deepseek/deepseek-v4-flash"]
provider = "deepseek"
model = "deepseek-v4-flash"
max_context_size = 1000000
max_output_size = 384000
capabilities = ["thinking", "tool_use"]
"""

DFHIS_CONFIG_CANDIDATES = [
    Path.home() / "Library/Application Support/orca-dev/dfhis-environment.json",
    Path.home() / "Library/Application Support/orca/dfhis-environment.json",
    Path.home() / "AppData/Roaming/orca-dev/dfhis-environment.json",
    Path.home() / "AppData/Roaming/orca/dfhis-environment.json",
    Path.home() / "AppData/Roaming/Orca/dfhis-environment.json",
]


def load_dfhis_env() -> dict:
    for p in DFHIS_CONFIG_CANDIDATES:
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
    return {}


def parse_profile(raw: str, role: str) -> tuple[str, str]:
    cli, sep, model = raw.partition(":")
    if not sep:  # bare alias defaults to kimi (backward compat)
        cli, model = "kimi", cli
    if cli not in ADAPTERS:
        raise SystemExit(f"role {role}: unknown cli '{cli}' in profile '{raw}'; known: {sorted(ADAPTERS)}")
    return cli, model


def resolve_profiles() -> dict[str, tuple[str, str]]:
    env_cfg = load_dfhis_env()
    mapping = env_cfg.get("relayModels") or {}
    if "exec" not in mapping and env_cfg.get("relayExecModel"):
        # DFHIS Setup stores a bare kimi alias; relayModels wins when both exist
        mapping = {**mapping, "exec": f"kimi:{env_cfg['relayExecModel']}"}
    out: dict[str, tuple[str, str]] = {}
    for role, default in DEFAULT_ROLE_PROFILES.items():
        raw = os.environ.get(f"YX_RELAY_MODEL_{role.upper()}") or mapping.get(role) or default
        out[role] = parse_profile(raw, role)
    return out


PROFILES: dict[str, tuple[str, str]] = {}  # resolved in main()


def relay_check(fix: bool, api_key: str, probe: bool) -> int:
    ok = True

    def report(good: bool, label: str, hint: str = "") -> None:
        nonlocal ok
        ok = ok and good
        print(("PASS" if good else "FAIL"), label, f"-> {hint}" if hint and not good else "")

    profiles = PROFILES or resolve_profiles()

    for cli in sorted({c for c, _ in profiles.values()}):
        binary = ADAPTERS[cli]["binary"]
        path = shutil.which(binary)
        if not path and cli == "kimi" and (KIMI_HOME / "bin" / "kimi").exists():
            path = str(KIMI_HOME / "bin" / "kimi")
        report(bool(path), f"{cli} CLI", f"install/login {cli} first")

    kimi_roles = {role: model for role, (cli, model) in profiles.items() if cli == "kimi"}
    if kimi_roles:
        cfg = KIMI_HOME / "config.toml"
        text = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
        for role, model in sorted(kimi_roles.items()):
            present = f'[models."{model}"]' in text or model.startswith("kimi-code/")
            report(present, f"kimi alias for {role}: {model}",
                   f"add it in kimi (/provider or config.toml), or repoint role: YX_RELAY_MODEL_{role.upper()}=cli:model")
        exec_model = kimi_roles.get("exec")
        if fix and exec_model == "deepseek/deepseek-v4-flash" and cfg.exists() \
                and ('[models."deepseek/deepseek-v4-flash"]' not in text or "[providers.deepseek]" not in text):
            key = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
            if not key:
                print("FAIL --fix requires --api-key or DEEPSEEK_API_KEY (never invent one)")
                return 1
            backup = cfg.with_name(cfg.name + f".bak.{time.strftime('%Y%m%d-%H%M%S')}")
            backup.write_text(text, encoding="utf-8")
            with cfg.open("a", encoding="utf-8") as f:
                if "[providers.deepseek]" not in text:
                    f.write(DEEPSEEK_PROVIDER_BLOCK.format(api_key=key))
                if '[models."deepseek/deepseek-v4-flash"]' not in text:
                    f.write(DEEPSEEK_MODEL_BLOCK)
            print(f"patched {cfg} (backup {backup}); orca-managed hooks untouched")

    try:
        st = orca_json(["status"])
        report(bool(st.get("ok")) and st.get("result", {}).get("runtime", {}).get("reachable", False),
               "orca runtime")
    except Exception as exc:
        report(False, "orca runtime", f"{exc}; start with `orca open`")

    token_ok = bool(os.environ.get("YUNXIAO_ACCESS_TOKEN")) or any(p.exists() for p in DFHIS_CONFIG_CANDIDATES)
    report(token_ok, "yunxiao token", "run DFHIS Setup or export YUNXIAO_ACCESS_TOKEN")

    if probe:
        seen: set[tuple[str, str]] = set()
        for role, (cli, model) in sorted(profiles.items()):
            if (cli, model) in seen:
                continue
            seen.add((cli, model))
            argv = [a.format(model=model, prompt="只回复两个字:正常") for a in ADAPTERS[cli]["probe"]]
            try:
                r = subprocess.run(argv, capture_output=True, text=True, timeout=180)
                report(r.returncode == 0, f"live probe {role}={cli}:{model}", (r.stderr or r.stdout)[-200:])
            except FileNotFoundError:
                report(False, f"live probe {role}={cli}:{model}", "binary not found")
            except subprocess.TimeoutExpired:
                report(False, f"live probe {role}={cli}:{model}", "probe timed out after 180s")

    return 0 if ok else 1



def orca_json(args: list[str]) -> dict:
    out = subprocess.run([ORCA, *args, "--json"], capture_output=True, text=True).stdout
    start = out.find("{")
    if start < 0:
        raise RuntimeError(f"orca {' '.join(args)}: no JSON in output: {out[:300]}")
    obj, _ = json.JSONDecoder().raw_decode(out[start:])
    return obj


def orca_text(args: list[str], timeout_s: int | None = None) -> str:
    return subprocess.run([ORCA, *args], capture_output=True, text=True, timeout=timeout_s).stdout


def task_list() -> dict[str, str]:
    data = orca_json(["orchestration", "task-list", "--brief"])
    return {t["id"]: t.get("status", "") for t in data.get("result", {}).get("tasks", [])}


def wait_worker_done(dispatch_ids: set[str], hard_timeout_s: int) -> dict:
    """Rolling check/ack loop. Returns the first worker_done matching any dispatch in the set."""
    deadline = time.time() + hard_timeout_s
    ack: str | None = None
    while time.time() < deadline:
        args = ["orchestration", "check"]
        if ack:
            args += ["--ack", ack]
        args += ["--wait", "--types", "worker_done,escalation,question", "--timeout-ms", str(CHECK_WAIT_TIMEOUT_MS)]
        out = orca_text(args, timeout_s=CHECK_WAIT_TIMEOUT_MS / 1000 + 60)
        lines = [ln for ln in out.splitlines() if ln.strip() and not ln.startswith('{"_keepalive"')]
        delivery = next((ln.split()[1] for ln in lines if ln.startswith("Delivery ")), None)
        msg_ids = [ln.split()[0] for ln in lines if ln.startswith("msg_")]
        if not delivery:
            continue  # timeout checkpoint, keep waiting
        for mid in msg_ids:
            inbox = orca_json(["orchestration", "inbox"])
            for m in inbox.get("result", {}).get("messages", []):
                if m.get("id") != mid:
                    continue
                payload = {}
                try:
                    payload = json.loads(m.get("payload") or "{}")
                except json.JSONDecodeError:
                    pass
                if m.get("type") == "worker_done" and payload.get("dispatchId") in dispatch_ids:
                    orca_text(["orchestration", "check", "--ack", delivery])
                    return m
                if m.get("type") in ("escalation", "question"):
                    orca_text(["orchestration", "check", "--ack", delivery])
                    raise RuntimeError(f"worker {m['type']}: {m.get('subject')} / {(m.get('body') or '')[:400]}")
        ack = delivery
    raise TimeoutError(f"dispatches {sorted(dispatch_ids)} did not settle within {hard_timeout_s}s")


def start_worker(task_id: str, profile: tuple[str, str], title: str) -> tuple[str, str]:
    cli, model = profile
    command = ADAPTERS[cli]["launch"].format(model=model)
    handle = orca_json(["terminal", "create", "--worktree", "current", "--title", title,
                        "--command", command])["result"]["terminal"]["handle"]
    orca_json(["terminal", "wait", "--terminal", handle, "--for", "tui-idle", "--timeout-ms", "90000"])
    for attempt in range(2):
        res = orca_json(["orchestration", "worker-start", "--task", task_id, "--terminal", handle])
        if res.get("ok"):
            return res["result"]["dispatchId"], handle
        msg = res.get("error", {}).get("message", "")
        if attempt == 0 and "pending" in msg:
            # readiness can lag behind dep completion; coordinator nudge
            orca_json(["orchestration", "task-update", "--id", task_id, "--status", "ready"])
            continue
        orca_text(["terminal", "close", "--terminal", handle])
        raise RuntimeError(f"worker-start failed for {task_id}: {msg}")
    raise RuntimeError(f"worker-start failed for {task_id} after ready nudge")


WORKER_PREAMBLE = (
    "调度约束：后台任务（build/install/git）完成后通知自动到达，禁止用 TaskOutput 轮询；"
    "完成即发 worker_done，不等待不轮询。"
)


def build_stages(req_id: str, req_dir: Path) -> list[dict]:
    d = str(req_dir)
    skill = str(SKILL_DIR)
    p = WORKER_PREAMBLE
    return [
        {
            "key": "archive_prd", "profile": PROFILES["doc"], "deps": [],
            "title": f"{req_id}-归档PRD",
            "spec": (p + f"【{req_id} 阶段·归档+分析+PRD】严格按 {skill}/SKILL.md 执行："
                     f"①python3 {skill}/scripts/run_direct_archive.py {req_id} --output-dir {d} --json；"
                     f"②阅读归档与截图附件，按技能规则定位真实代码仓库（含页面归属追踪）；"
                     f"③在 {d}/PRD_AND_CODE_ANALYSIS.md 顶部创建精简 Requirement Contract 并完成风险分级；"
                     f"合同为 needs_clarification 时写出 1-3 个阻断选择题后停止，不得开始代码编辑。"
                     "全部人类可读内容用中文。worker_done body 报告合同状态与目标仓库清单。"),
            "gate_file": d + "/PRD_AND_CODE_ANALYSIS.md",
        },
        {
            "key": "implement", "profile": PROFILES["exec"], "deps": ["archive_prd"],
            "title": f"{req_id}-实现",
            "spec": (p + f"【{req_id} 阶段·代码实现】读 {d}/PRD_AND_CODE_ANALYSIS.md，仅当合同为 ready_to_build 才动手，"
                     f"否则如实报告阻断。严格按 {skill}/SKILL.md 第7-9步：prepare_local_worktree 建隔离 worktree、"
                     f"每次编辑前跑 guard_code_edit.py、最小改动、禁止改构建/依赖/项目本地API模块。"
                     "不改 PRD 合同结论，实现偏差需记入决策台账。worker_done body 报告改动文件清单与自验结果。"),
        },
        {
            "key": "review", "profile": PROFILES["review"], "deps": ["implement"],
            "title": f"{req_id}-复核",
            "spec": (p + f"【{req_id} 阶段·实现复核·只读】你是 implementation_reviewer。读 {d}/PRD_AND_CODE_ANALYSIS.md 合同/计划/验收标准，"
                     "对 code/ 下各仓库未提交或已提交 diff 逐行复核：实现与合同及决策台账一致性、异步/时序风险、"
                     "是否误改构建/依赖/API。输出中文结论（通过/阻断/通过但存在非阻断限制）+问题清单，"
                     "追加到 PRD 1.5 reviewChecks 表（注明 dispatch 来源）。禁止修改业务代码。worker_done body 给出结论。"),
            "block_on": "阻断",
        },
        {
            "key": "verify", "profile": PROFILES["exec"], "deps": ["implement"],
            "title": f"{req_id}-验证",
            "spec": (p + f"【{req_id} 阶段·lint+build 验证】按 {d}/PRD_AND_CODE_ANALYSIS.md 第8节与 HIS intake 选定的工具链"
                     "（不得用宿主机默认 Node）在隔离 worktree 复跑 lint 与 build；确认 package.json/锁文件/生成配置无残留 diff。"
                     "禁止修改业务代码；失败如实报告不自行修复。证据中文更新到 PRD 8.4（注明接龙复跑）。worker_done body 报告各项结果。"),
        },
        {
            "key": "screenshot", "profile": PROFILES["visual"], "deps": ["verify"],
            "title": f"{req_id}-截图",
            "spec": (p + f"【{req_id} 阶段·业务页截图验收】为 PRD 验收标准涉及的业务页面采集真实截图，存 {d}/evidence/。"
                     "先 orca computer permissions --json 确认授权；不可用或环境不可达时，不得用登录页/构建产物/代码冒充证据，"
                     "把精确阻断原因（缺失权限名、负责人）写入 PRD 8.3/8.4。worker_done body 给出截图清单或精确阻断原因。"),
            "allow_env_block": True,
        },
        {
            "key": "deliver", "profile": PROFILES["exec"], "deps": ["review", "verify", "screenshot"],
            "title": f"{req_id}-交付",
            "spec": (p + f"【{req_id} 阶段·交付+云效回写】严格按 {skill}/SKILL.md 第11-14步完整执行，缺一不可："
                     "①按仓库惯例 commit 并 push 需求分支，git status -sb 核实跟踪；"
                     f"②python3 {skill}/scripts/comment_yunxiao.py 发中文评论（仓库/分支/commit/改动文件/修复要点/验证结果/阻断如实写，"
                     "前端改动且有截图时先上传并嵌入截图）；"
                     "③有 SQL/数据/配置脚本时 upload_yunxiao_attachment.py 上传并核实；"
                     f"④必须运行 python3 {skill}/scripts/update_yunxiao_completion_fields.py 回写 客户端变更/服务端变更/数据变更 "
                     "并流转状态为待测试（评论不能替代字段回写），脚本回读校验不一致视为失败；"
                     "⑤更新 PRD 第2节 Current conclusion、8.4、第10节 checklist。worker_done body 给出 commit、push、评论id、字段值与状态。"),
        },
    ]


def build_probe_stages(mode: str) -> list[dict]:
    def probe_spec(key: str, body: str) -> str:
        return (f"调度器连通性探测（{key}）：不要读取或修改任何文件，不要执行其他命令，"
                f"立即按注入 preamble 的指示，用注入的 taskId/dispatchId 发送 worker_done"
                f"（--outcome succeeded --subject probe-{key} --body '{body}'），然后停止。")
    stages = [
        {"key": "p_root", "profile": PROFILES["exec"], "deps": [], "title": "probe-root",
         "spec": probe_spec("p_root", "root")},
        {"key": "p_a", "profile": PROFILES["exec"], "deps": ["p_root"], "title": "probe-a",
         "spec": probe_spec("p_a", "A")},
        {"key": "p_b", "profile": PROFILES["exec"], "deps": ["p_root"], "title": "probe-b",
         "spec": probe_spec("p_b", "B")},
        {"key": "p_leaf", "profile": PROFILES["exec"], "deps": ["p_a", "p_b"], "title": "probe-leaf",
         "spec": probe_spec("p_leaf", "leaf")},
    ]
    if mode == "abort":
        stages[1]["spec"] = probe_spec("p_a", "结论：阻断（probe 故意触发）")
        stages[1]["block_on"] = "阻断"
    return stages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("requirement_id", nargs="?", default="")
    parser.add_argument("--stages", default="", help="Comma-separated stage keys; default all.")
    parser.add_argument("--from-stage", default="", help="Start from this stage key (inclusive).")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout-s", type=int, default=STAGE_HARD_TIMEOUT_S)
    parser.add_argument("--check", action="store_true", help="Bootstrap environment check and exit.")
    parser.add_argument("--fix", action="store_true", help="With --check: append missing deepseek provider/model to kimi config.")
    parser.add_argument("--api-key", default="", help="DeepSeek API key for --fix (or DEEPSEEK_API_KEY).")
    parser.add_argument("--probe", action="store_true", help="With --check: live-call the exec model.")
    parser.add_argument("--probe-dag", default="",
                        help="E2E self-test of the parallel scheduler with synthetic no-op stages: happy|abort")
    args = parser.parse_args()

    global PROFILES
    PROFILES = resolve_profiles()
    if args.check:
        return relay_check(args.fix, args.api_key, args.probe)
    if args.probe_dag:
        return execute_pipeline(build_probe_stages(args.probe_dag), f"probe-dag {args.probe_dag}", 1800)
    if not args.requirement_id:
        parser.error("requirement_id is required unless --check is given")

    req_dir = ARCHIVE_ROOT / args.requirement_id
    stages = build_stages(args.requirement_id, req_dir)
    selected = [s["key"] for s in stages]
    if args.stages:
        wanted = args.stages.split(",")
        stages = [s for s in stages if s["key"] in wanted]
    elif args.from_stage:
        stages = stages[selected.index(args.from_stage):]
    selected_keys = {s["key"] for s in stages}
    for s in stages:  # prune deps pointing outside the selection so the scheduler cannot deadlock
        s["deps"] = [d for d in s["deps"] if d in selected_keys]

    if args.dry_run:
        for s in stages:
            print(f"{s['key']:12s} worker={s['profile'][0]}:{s['profile'][1]:30s} deps={s['deps']}")
        return 0

    return execute_pipeline(stages, f"{args.requirement_id} 并行执行: {' / '.join(s['key'] for s in stages)}", args.timeout_s)


def execute_pipeline(stages: list[dict], objective: str, timeout_s: int) -> int:
    run = orca_json(["orchestration", "run-create", "--objective", objective])
    run_id = run["result"]["run"]["id"]
    print(f"Run: {run_id}")

    task_by_key: dict[str, str] = {}
    for s in stages:
        deps = [task_by_key[d] for d in s["deps"] if d in task_by_key]
        res = orca_json(["orchestration", "task-create", "--spec", s["spec"],
                         *(["--deps", json.dumps(deps)] if deps else [])])
        task_by_key[s["key"]] = res["result"]["task"]["id"]
        print(f"Task {s['key']}: {task_by_key[s['key']]} deps={s['deps']}")

    pending = {s["key"]: s for s in stages}
    settled: dict[str, str] = {}
    active: dict[str, tuple[str, str, dict]] = {}  # dispatch_id -> (task_id, handle, stage)
    started_at = time.time()

    def abort(reason: str) -> int:
        print(f"ABORT: {reason}", file=sys.stderr)
        for dispatch_id, (_, h, st) in active.items():
            print(f"stopping in-flight stage {st['key']} ({dispatch_id})", file=sys.stderr)
            orca_text(["terminal", "close", "--terminal", h])
        return 1

    while pending or active:
        for key, s in list(pending.items()):
            if not all(d in settled for d in s["deps"]):
                continue
            print(f"\n=== {key} (worker={s['profile'][0]}:{s['profile'][1]}) dispatching ===", flush=True)
            try:
                dispatch_id, handle = start_worker(task_by_key[key], s["profile"], s["title"])
            except RuntimeError as exc:
                return abort(str(exc))
            active[dispatch_id] = (task_by_key[key], handle, s)
            del pending[key]
            print(f"dispatch {dispatch_id} on {handle} ({len(active)} in flight)", flush=True)
        if not active:
            return abort(f"no runnable stages; unsettled deps among {sorted(pending)}")
        remaining = timeout_s - (time.time() - started_at)
        if remaining <= 0:
            return abort(f"pipeline exceeded --timeout-s {timeout_s}")
        try:
            msg = wait_worker_done(set(active), remaining)
        except TimeoutError as exc:
            return abort(str(exc))
        payload = json.loads(msg.get("payload") or "{}")
        done_dispatch = payload.get("dispatchId", "")
        task_id, handle, s = active.pop(done_dispatch, (None, None, {"key": done_dispatch}))
        if handle:
            orca_text(["terminal", "close", "--terminal", handle])
        outcome = payload.get("outcome", "succeeded")
        print(f"\nworker_done {s['key']} outcome={outcome} ({len(active)} still in flight): {msg.get('subject')}")
        print((msg.get("body") or "")[:600])
        body = msg.get("body") or ""
        block_on = s.get("block_on")
        if block_on and block_on in body.replace("非阻断", ""):
            return abort(f"stage {s['key']} returned blocking verdict ({block_on})")
        if outcome != "succeeded":
            if s.get("allow_env_block"):
                orca_json(["orchestration", "task-update", "--id", task_id, "--status", "completed",
                           "--result", json.dumps({"结论": "环境阻断已确认并如实记录", "worker_subject": msg.get("subject")},
                                                  ensure_ascii=False)])
                print(f"coordinator override: {s['key']} marked completed (env block allowed)")
            else:
                return abort(f"stage {s['key']} failed")
        gate_file = s.get("gate_file")
        if gate_file and not Path(gate_file).exists():
            return abort(f"gate file missing: {gate_file}")
        settled[s["key"]] = outcome

    print(f"\nAll stages settled in {int(time.time() - started_at)}s. Run {run_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
