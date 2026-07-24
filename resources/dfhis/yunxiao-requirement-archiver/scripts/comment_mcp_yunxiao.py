#!/usr/bin/env python3
"""Comment on a Yunxiao/DFHIS work item through HIS MCP."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_MCP_URL = "http://192.168.1.10:9020/mcp"
DEFAULT_EXPERT = "云效需求归档专家"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work_item_id", help="DFHIS work item id, such as DFHIS-31684.")
    parser.add_argument("--content", default="", help="Markdown comment content. If omitted, stdin is used.")
    parser.add_argument("--content-file", default="", help="Read Markdown comment content from this file.")
    parser.add_argument("--mcp-url", default=os.environ.get("HIS_MCP_URL", DEFAULT_MCP_URL))
    parser.add_argument("--token-env", default="HIS_MCP_TOKEN")
    parser.add_argument("--expert", default=DEFAULT_EXPERT)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--json", action="store_true", help="Print the raw MCP JSON wrapper.")
    return parser


def parse_sse_json(body: str) -> dict:
    for line in reversed(body.splitlines()):
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data:
            continue
        try:
            return json.loads(data)
        except json.JSONDecodeError:
            continue
    return {}


def resolve_mcp_auth(url: str, token_env: str) -> tuple[str, str]:
    token = os.environ.get(token_env, "").strip()
    parts = urllib.parse.urlsplit(url)
    query_pairs = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    url_token = ""
    kept_pairs = []
    for key, value in query_pairs:
        if key in {"t", "token", "access_token", "mcp_token"} and value and not url_token:
            url_token = value.strip()
            continue
        kept_pairs.append((key, value))
    clean_url = urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(kept_pairs), parts.fragment)
    )
    return clean_url, token or url_token


def mcp_post(url: str, token: str, payload: dict, timeout: int, session_id: str = "") -> tuple[dict, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        return parse_sse_json(body), resp.headers.get("Mcp-Session-Id", "")


def extract_tool_text(response: dict) -> str:
    result = response.get("result") or {}
    content = result.get("content") or []
    if isinstance(content, list):
        parts = [x.get("text") for x in content if isinstance(x, dict) and x.get("text")]
        if parts:
            return "\n".join(parts)
    structured = result.get("structuredContent") or {}
    if isinstance(structured, dict) and structured.get("result"):
        return str(structured.get("result"))
    return json.dumps(response, ensure_ascii=False)


def read_content(args: argparse.Namespace) -> str:
    if args.content_file:
        with open(args.content_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    if args.content:
        return args.content.strip()
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    return ""


def main() -> int:
    args = build_parser().parse_args()
    mcp_url, token = resolve_mcp_auth(args.mcp_url, args.token_env)
    if not token:
        print(f"error: set {args.token_env} or pass --mcp-url with ?t=<token> for HIS MCP authorization", file=sys.stderr)
        return 2
    work_item_id = (args.work_item_id or "").strip().upper()
    content = read_content(args)
    if not work_item_id:
        print("error: work_item_id is required", file=sys.stderr)
        return 2
    if not content:
        print("error: comment content is required", file=sys.stderr)
        return 2

    try:
        init_response, session_id = mcp_post(
            mcp_url,
            token,
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "codex-yunxiao-commenter", "version": "0.1"},
                },
            },
            min(args.timeout, 60),
        )
        if not session_id:
            raise RuntimeError(f"MCP initialize did not return Mcp-Session-Id: {init_response}")
        mcp_post(
            mcp_url,
            token,
            {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            min(args.timeout, 60),
            session_id=session_id,
        )
        response, _ = mcp_post(
            mcp_url,
            token,
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "comment_yunxiao_workitem",
                    "arguments": {
                        "work_item_id": work_item_id,
                        "content": content,
                        "expert_name": args.expert,
                    },
                },
            },
            args.timeout,
            session_id=session_id,
        )
        if args.json:
            print(json.dumps(response, ensure_ascii=False, indent=2))
        else:
            print(extract_tool_text(response))
        payload = json.loads(extract_tool_text(response))
        return 0 if payload.get("ok") else 1
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        print(f"error: MCP HTTP {exc.code}: {body[:1000]}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
