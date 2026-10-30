#!/usr/bin/env python3
"""DFHIS「数据变更」交付门禁：在把脚本发到云效（附件/评论/字段回写）之前跑。

检查项（任一不通过即 exit 1）：
  1. 禁用包裹：begin; / commit; / do $$ 匿名块 / raise exception / create function|procedure / execute 拼接
  2. 字段长度：> 16,000 字符（云效字段上限，实测 400）
  3. 只写指针：字段只出现 xxx.sql / 见附件 / 脚本在附件，且没有任何 SQL 语句
  4. 空字段但挂了 .sql 附件（work-item 模式）
  5. 非 PostgreSQL 方言：varchar2 / number( / sysdate / from dual / nvl(

用法：
  python3 check_data_change.py --file sql/DFHIS-12345.sql
  python3 check_data_change.py --dir /path/to/DFHIS-12345          # 检查目录内 sql/*.sql
  python3 check_data_change.py --work-item DFHIS-12345             # 直连云效查字段+附件（只读）
  python3 check_data_change.py --field-text "$(cat x.sql)"          # 只查一段文本
  python3 check_data_change.py --file a.sql --strict-pointer        # 指针字样也判失败
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import re
import sys

FORBIDDEN = [
    ("begin-commit", re.compile(r"(?im)^\s*(begin|commit|start\s+transaction)\s*;")),
    ("do-block", re.compile(r"(?i)\bdo\s*\$")),
    ("raise-exception", re.compile(r"(?i)\braise\s+exception")),
    ("function/procedure", re.compile(r"(?i)create\s+(or\s+replace\s+)?(function|procedure|trigger)")),
    ("dynamic-execute", re.compile(r"(?i)\bexecute\s+'")),
]
DIALECT = re.compile(r"(?i)\b(varchar2|sysdate|from\s+dual|nvl\s*\()|\bnumber\s*\(")
POINTER = re.compile(r"(?i)(\.sql\b|见附件|脚本在附件|已上传云效附件|详见附件)")
OVER_CAP_NOTE = re.compile(r"(超过.{0,12}(字段|长度).{0,8}上限|16000|16,000|16，000)")
SQL_STMT = re.compile(
    r"(?im)^\s*(alter|insert|update|delete|create|comment|grant|select|truncate|drop|with|set)\b")
MAX_CHARS = 16000
SKILL_DIR = pathlib.Path(__file__).resolve().parent.parent
MCP_HELPER = pathlib.Path.home() / ".agents/skills/yunxiao-requirement-archiver/scripts/comment_yunxiao.py"
ORG = "64cc7343a0c93ee7446892d5"


def check_text(text: str, label: str, strict_pointer: bool = False) -> list[str]:
    problems: list[str] = []
    for name, pat in FORBIDDEN:
        m = pat.search(text)
        if m:
            line = text[: m.start()].count("\n") + 1
            snippet = (text.splitlines()[line - 1].strip() or m.group(0).strip())[:90]
            problems.append(f"[{label}] 命中禁用写法 {name}（第 {line} 行）: {snippet}")
    m = DIALECT.search(text)
    if m:
        line = text[: m.start()].count("\n") + 1
        problems.append(f"[{label}] 出现非 PostgreSQL 方言（第 {line} 行）: {m.group(0)}")
    n = len(text)
    if n > MAX_CHARS:
        problems.append(
            f"[{label}] 超过数据变更字段上限 {MAX_CHARS} 字符（当前 {n}）：无法内联，字段里只能写"
            f"「超过字段上限 + 摘要 + 附件名」，并在评论说明原因")
    stripped = text.strip()
    if stripped and not SQL_STMT.search(stripped):
        over_cap_fallback = bool(OVER_CAP_NOTE.search(stripped) and POINTER.search(stripped))
        if over_cap_fallback:
            return problems  # 明确写了「超过字段上限 + 附件名」，属规范允许的唯一例外
        if POINTER.search(stripped) or strict_pointer:
            problems.append(
                f"[{label}] 字段/文本只是指针（提到 .sql 或「见附件」）但没有任何可执行 SQL："
                f"必须把脚本正文写进「数据变更」字段")
    if re.match(r"^\s*存在脚本[，,]?\s*脚本在附件", stripped) and n <= MAX_CHARS:
        problems.append(f"[{label}] 写了「脚本在附件」但长度未超上限：应直接内联正文")
    return problems


def check_file(path: pathlib.Path, strict_pointer: bool = False) -> list[str]:
    if not path.exists():
        return [f"[{path}] 文件不存在"]
    return check_text(path.read_text(errors="replace"), str(path), strict_pointer)


def load_mcp():
    spec = importlib.util.spec_from_file_location("cm", MCP_HELPER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    cfg = mod.load_dfhis_config()
    client = mod.YunxiaoMcp(cfg["yunxiaoMcpUrl"], cfg["yunxiaoAccessToken"], 120)
    client.initialize()
    return mod, client


def mcp_call(client, name, args, rid=3):
    raw = client.call_tool(name, args, rid)
    res = raw.get("result", raw)
    content = res.get("content") if isinstance(res, dict) else None
    txt = "\n".join(i.get("text", "") for i in content) if content else json.dumps(res, ensure_ascii=False)
    try:
        return json.loads(txt)
    except Exception:
        return {"raw_text": txt}


def check_work_item(serial: str) -> list[str]:
    if not MCP_HELPER.exists():
        return [f"找不到云效 MCP 辅助脚本：{MCP_HELPER}"]
    mod, client = load_mcp()
    cfg = mod.load_dfhis_config()
    root = pathlib.Path(cfg.get("archiveWorkspacePath") or pathlib.Path.home() / "workspace/yunxiao")
    raw_path = root / serial / "raw.json"
    wid = ""
    if raw_path.exists():
        raw = json.loads(raw_path.read_text())
        wid = raw.get("id") or (raw.get("workitem") or {}).get("id") or ""
    if not wid:
        return [f"{serial}: 本地归档 {raw_path} 不存在或无 id；先跑 run_direct_archive.py {serial}"]
    it = mcp_call(client, "get_work_item", {"organizationId": ORG, "workItemId": wid})
    fields = {f.get("fieldName"): f for f in (it.get("customFieldValues") or [])}
    problems: list[str] = []
    att = mcp_call(client, "list_workitem_attachments", {"organizationId": ORG, "workItemId": wid})
    res = att if isinstance(att, list) else (att.get("attachments") or att.get("items") or [])
    sqls = [a for a in (res or []) if str(a.get("fileName") or "").endswith(".sql")]
    if "数据变更" not in fields:
        problems.append(
            f"{serial}: 该工作项类型（{(it.get('workitemType') or {}).get('name')}）没有「数据变更」字段 -> "
            f"把脚本正文贴到评论里，并在评论说明原因")
        return problems
    text = "\n".join(str(v.get("displayValue") or "") for v in (fields["数据变更"].get("values") or []))
    if not text.strip() and sqls:
        problems.append(f"{serial}: 「数据变更」字段为空但挂了 .sql 附件（{[a.get('fileName') for a in sqls]}）-> 正文必须进字段")
    elif text.strip():
        problems.extend(check_text(text, f"{serial} 数据变更字段"))
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="DFHIS 数据变更交付门禁")
    ap.add_argument("--file", action="append", default=[])
    ap.add_argument("--dir", default="")
    ap.add_argument("--field-text", default="")
    ap.add_argument("--work-item", action="append", default=[])
    ap.add_argument("--strict-pointer", action="store_true")
    args = ap.parse_args()

    if not (args.file or args.dir or args.field_text or args.work_item):
        print("至少给一个：--file / --dir / --field-text / --work-item", file=sys.stderr)
        return 2

    problems: list[str] = []
    for f in args.file:
        problems += check_file(pathlib.Path(f), args.strict_pointer)
    if args.dir:
        d = pathlib.Path(args.dir)
        seen = set()
        for pattern in ("sql/*.sql", "docs/sql/*.sql", "*/sql/*.sql"):
            for p in sorted(d.glob(pattern)):
                if p in seen:
                    continue
                seen.add(p)
                problems += check_file(p, args.strict_pointer)
        if not seen:
            print(f"note: {d} 下没有找到 sql/*.sql 或 docs/sql/*.sql（纯前端需求可忽略）", file=sys.stderr)
    if args.field_text:
        problems += check_text(args.field_text, "field-text", args.strict_pointer)
    for serial in args.work_item:
        problems += check_work_item(serial)

    if problems:
        print(f"FAIL: {len(problems)} 个问题（交付前必须修掉）")
        for p in problems:
            print("  -", p)
        return 1
    print("PASS: 数据变更格式与长度符合规范（普通 PostgreSQL DDL/DML，字段可直接执行）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
