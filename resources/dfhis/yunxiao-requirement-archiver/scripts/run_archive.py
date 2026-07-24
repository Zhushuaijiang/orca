#!/usr/bin/env python3
"""Run the Bot Manager Yunxiao requirement archive expert through SSH."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path


DEFAULT_HOST = "192.168.1.10"
DEFAULT_USER = "root"
DEFAULT_REMOTE_PROJECT = "/opt/workspace/github/hermes-agent-260623/bot_manager"
DEFAULT_PYTHON = "/opt/workspace/github/hermes-agent-260623/venv311/bin/python3.11"
DEFAULT_BOT = "bot1"
DEFAULT_EXPERT_ID = 261
DEFAULT_EXPERT_NAME = "云效需求归档专家"


REMOTE_CODE = r'''
import json
import os
import sys
import time
import traceback

mode, bot_name, expert_id_raw, expert_name, message = sys.argv[1:6]
expert_id = int(expert_id_raw or 0)

def emit(payload):
    print(json.dumps(payload, ensure_ascii=False))

try:
    import app
    import pg_storage

    app._ensure_expert_runs_schema()
    with pg_storage.connect() as conn:
        expert = None
        if expert_id:
            expert = conn.execute(
                "SELECT * FROM bot_experts WHERE bot_name=? AND id=? LIMIT 1",
                (bot_name, expert_id),
            ).fetchone()
        if not expert:
            expert = conn.execute(
                "SELECT * FROM bot_experts WHERE bot_name=? AND name=? LIMIT 1",
                (bot_name, expert_name),
            ).fetchone()
        if not expert:
            raise RuntimeError(f"未找到专家：{bot_name}/{expert_name or expert_id}")
        expert = dict(expert)

    if mode == "check":
        integrations = app._normalize_expert_integrations(expert.get("integrations") or "{}")
        yunxiao_profiles = [
            {
                "name": x.get("name") or "",
                "base_url": x.get("base_url") or "",
                "enabled": bool(x.get("enabled")),
                "default": bool(x.get("default")),
                "has_access_token": bool(x.get("access_token")),
            }
            for x in integrations.get("yunxiao", [])
        ]
        emit({
            "ok": True,
            "mode": "check",
            "expert": {
                "id": expert.get("id"),
                "bot_name": expert.get("bot_name"),
                "name": expert.get("name"),
                "enabled": expert.get("enabled"),
                "hermes_skills": expert.get("hermes_skills"),
                "builtin_key": expert.get("builtin_key"),
                "yunxiao_profiles": yunxiao_profiles,
            },
        })
        raise SystemExit(0)

    if not message.strip():
        raise RuntimeError("message is required")

    expert["_manual_user_message"] = message
    metadata = {
        "review_mode": "deep",
        "review_mode_label": "深度审查",
        "queue_source": "codex_skill",
        "review_date": "",
        "skills": app._split_csv(expert.get("hermes_skills") or ""),
        "repo_paths": expert.get("repo_paths") or "",
        "branches": expert.get("branches") or "",
        "schedule_cron": expert.get("schedule_cron") or "",
        "user_message": message,
        "manual_message": message,
        "async": False,
        "codex_skill": "yunxiao-requirement-archiver",
    }
    prompt = f"Codex skill 调用云效需求归档专家：{message[:2000]}"
    with pg_storage.connect() as conn:
        cur = conn.execute(
            "INSERT INTO expert_runs (bot_name, expert_id, expert_name, status, prompt, metadata, started_at) VALUES (?, ?, ?, 'running', ?, ?::jsonb, now()) RETURNING id",
            (bot_name, int(expert.get("id") or expert_id), expert.get("name") or expert_name, prompt, json.dumps(metadata, ensure_ascii=False)),
        )
        row = cur.fetchone()
        run_id = int(row["id"] if row else cur.lastrowid)

    started = time.time()
    try:
        app._finish_yunxiao_archive_run(
            run_id,
            bot_name,
            int(expert.get("id") or expert_id),
            expert,
            message,
            "deep",
            "",
            started,
        )
    except Exception as exc:
        with pg_storage.connect() as conn:
            conn.execute(
                "UPDATE expert_runs SET status='failed', error=?, elapsed_ms=?, finished_at=now(), updated_at=now() WHERE id=?",
                (str(exc), int((time.time() - started) * 1000), run_id),
            )
        raise

    with pg_storage.connect() as conn:
        run = conn.execute("SELECT * FROM expert_runs WHERE id=? LIMIT 1", (run_id,)).fetchone()
    emit({
        "ok": run.get("status") == "success",
        "mode": "archive",
        "run_id": run_id,
        "status": run.get("status"),
        "result_md": run.get("result_md") or "",
        "error": run.get("error") or "",
        "elapsed_ms": run.get("elapsed_ms"),
        "metadata": run.get("metadata") or {},
    })
except SystemExit:
    raise
except Exception as exc:
    emit({
        "ok": False,
        "mode": mode,
        "error": str(exc),
        "traceback": traceback.format_exc(limit=8),
    })
    raise SystemExit(1)
'''


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message", nargs="*", help="User archive request containing a DFHIS id or Yunxiao link.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--user", default=DEFAULT_USER)
    parser.add_argument("--remote-project", default=DEFAULT_REMOTE_PROJECT)
    parser.add_argument("--remote-python", default=DEFAULT_PYTHON)
    parser.add_argument("--bot", default=DEFAULT_BOT)
    parser.add_argument("--expert-id", type=int, default=DEFAULT_EXPERT_ID)
    parser.add_argument("--expert-name", default=DEFAULT_EXPERT_NAME)
    parser.add_argument("--password-env", default="YUNXIAO_ARCHIVE_SSH_PASSWORD")
    parser.add_argument("--timeout", type=int, default=3600)
    parser.add_argument("--check", action="store_true", help="Verify remote expert lookup without creating an archive run.")
    parser.add_argument("--json", action="store_true", help="Print the raw JSON response wrapper.")
    return parser


def find_sshpass() -> str | None:
    for candidate in ("sshpass", "/opt/homebrew/bin/sshpass", "/usr/bin/sshpass"):
        found = subprocess.run(
            ["which", candidate] if "/" not in candidate else ["test", "-x", candidate],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if found.returncode == 0:
            return candidate
    return None


def main() -> int:
    args = build_parser().parse_args()
    message = " ".join(args.message).strip()
    if not args.check and not message:
        print("error: message is required unless --check is used", file=sys.stderr)
        return 2

    env = os.environ.copy()
    cmd = ["ssh"]
    password = env.get(args.password_env, "")
    if password:
        sshpass = find_sshpass()
        if not sshpass:
            print(f"error: {args.password_env} is set but sshpass is not installed", file=sys.stderr)
            return 2
        env["SSHPASS"] = password
        cmd = [sshpass, "-e", *cmd]

    remote_db_url = '$(tr "\\0" "\\n" < /proc/$(pgrep -f "hermes-agent-260623.*/bot_manager/app.py" | head -n1)/environ | sed -n "s/^BOT_MANAGER_DATABASE_URL=//p")'
    remote_cmd = (
        f"cd {shlex.quote(args.remote_project)} && "
        f"BOT_MANAGER_DATABASE_URL=\"{remote_db_url}\" "
        f"{shlex.quote(args.remote_python)} - "
        f"{shlex.quote('check' if args.check else 'archive')} "
        f"{shlex.quote(args.bot)} "
        f"{shlex.quote(str(args.expert_id))} "
        f"{shlex.quote(args.expert_name)} "
        f"{shlex.quote(message)}"
    )
    cmd.extend([
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        f"{args.user}@{args.host}",
        remote_cmd,
    ])

    proc = subprocess.run(
        cmd,
        input=REMOTE_CODE,
        text=True,
        capture_output=True,
        timeout=args.timeout,
        env=env,
    )
    stdout = proc.stdout.strip()
    stderr = proc.stderr.strip()
    payload = None
    if stdout:
        for line in reversed(stdout.splitlines()):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    payload = json.loads(line)
                    break
                except json.JSONDecodeError:
                    pass

    if args.json:
        print(json.dumps(payload or {"ok": False, "stdout": stdout, "stderr": stderr}, ensure_ascii=False, indent=2))
    elif payload and payload.get("ok") and payload.get("mode") == "archive":
        print(payload.get("result_md") or "")
    elif payload and payload.get("ok"):
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    elif payload:
        print(f"error: {payload.get('error') or 'remote archive failed'}", file=sys.stderr)
        if payload.get("traceback"):
            print(payload["traceback"], file=sys.stderr)
    else:
        if stdout:
            print(stdout)
        if stderr:
            print(stderr, file=sys.stderr)

    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
