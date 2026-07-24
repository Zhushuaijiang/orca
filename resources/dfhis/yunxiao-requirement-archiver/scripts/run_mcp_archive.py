#!/usr/bin/env python3
"""Archive a Yunxiao/DFHIS work item through the HIS MCP dfhis_agent_chat tool."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


DEFAULT_MCP_URL = "http://192.168.1.10:9020/mcp"
DEFAULT_EXPERT = "云效需求归档专家"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message", nargs="*", help="Archive request containing a DFHIS id or Yunxiao link.")
    parser.add_argument("--mcp-url", default=os.environ.get("HIS_MCP_URL", DEFAULT_MCP_URL))
    parser.add_argument("--token-env", default="HIS_MCP_TOKEN")
    parser.add_argument("--expert", default=DEFAULT_EXPERT)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--session-id", default="", help="Explicit dfhis_agent_chat session id. Defaults to a fresh isolated session.")
    parser.add_argument("--dispatch", action="store_true", help="Trigger Bot Manager server-side review through /expert instead of ordinary expert chat.")
    parser.add_argument("--review-mode", choices=["deep", "quick"], default="deep", help="Review mode used with --dispatch.")
    parser.add_argument("--check", action="store_true", help="Initialize MCP and list tools without archiving.")
    parser.add_argument("--expert-check-retries", type=int, default=3, help="Retries when Bot Manager reports no enabled experts.")
    parser.add_argument("--expert-check-delay", type=float, default=2.0, help="Seconds between expert route retries.")
    parser.add_argument("--json", action="store_true", help="Print the raw JSON wrapper.")
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


def is_expert_route_missing(text: str) -> bool:
    return "未找到专家" in text or "没有启用的专家" in text or "当前没有启用的专家" in text


def build_expert_list_payload(agent_session_id: str, token: str, timeout: int) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "dfhis_agent_chat",
            "arguments": {
                "message": "/expert",
                "session_id": agent_session_id,
                "mcp_token": token,
                "debug": False,
                "timeout_seconds": max(300, min(timeout, 600)),
            },
        },
    }


def main() -> int:
    args = build_parser().parse_args()
    mcp_url, token = resolve_mcp_auth(args.mcp_url, args.token_env)
    if not token:
        print(f"error: set {args.token_env} or pass --mcp-url with ?t=<token> for HIS MCP authorization", file=sys.stderr)
        return 2

    message = " ".join(args.message).strip()
    if not args.check and not message:
        print("error: message is required unless --check is used", file=sys.stderr)
        return 2
    agent_session_id = (args.session_id or f"codex-yunxiao-archive-{uuid.uuid4().hex}").strip()

    try:
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "codex-yunxiao-archiver", "version": "0.1"},
            },
        }
        init_response, session_id = mcp_post(mcp_url, token, init_payload, min(args.timeout, 60))
        if not session_id:
            raise RuntimeError("MCP initialize did not return Mcp-Session-Id")

        mcp_post(
            mcp_url,
            token,
            {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            min(args.timeout, 60),
            session_id=session_id,
        )

        if args.check:
            tools_response, _ = mcp_post(
                mcp_url,
                token,
                {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
                min(args.timeout, 60),
                session_id=session_id,
            )
            experts_text = ""
            expert_attempts = max(1, args.expert_check_retries)
            for attempt in range(1, expert_attempts + 1):
                experts_response, _ = mcp_post(
                    mcp_url,
                    token,
                    build_expert_list_payload(agent_session_id, token, args.timeout),
                    max(300, min(args.timeout, 600)),
                    session_id=session_id,
                )
                experts_text = extract_tool_text(experts_response)
                if args.expert in experts_text or not is_expert_route_missing(experts_text):
                    break
                if attempt < expert_attempts:
                    time.sleep(max(0.1, args.expert_check_delay))
            output = {
                "ok": args.expert in experts_text,
                "initialize": init_response,
                "tools": tools_response,
                "experts": experts_text,
                "expert_check_attempts": attempt,
            }
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return 0 if output["ok"] else 1

        if args.dispatch:
            mode_label = "深度审查" if args.review_mode == "deep" else "日报"
            tool_message = f"/expert {args.expert} {mode_label} {message}"
            tool_args = {
                "message": tool_message,
                "session_id": agent_session_id,
                "mcp_token": token,
                "debug": False,
                "timeout_seconds": max(300, min(args.timeout, 600)),
            }
            request_timeout = max(300, min(args.timeout, 600))
        else:
            tool_args = {
                "message": message,
                "session_id": agent_session_id,
                "mcp_token": token,
                "expert": args.expert,
                "debug": False,
                "timeout_seconds": args.timeout,
            }
            request_timeout = args.timeout

        call_payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "dfhis_agent_chat",
                "arguments": tool_args,
            },
        }
        call_response, _ = mcp_post(mcp_url, token, call_payload, request_timeout, session_id=session_id)
        answer = extract_tool_text(call_response)
        if args.json:
            print(json.dumps(call_response, ensure_ascii=False, indent=2))
        else:
            print(answer)
        if is_expert_route_missing(answer):
            for attempt in range(1, max(1, args.expert_check_retries) + 1):
                experts_response, _ = mcp_post(
                    mcp_url,
                    token,
                    build_expert_list_payload(f"{agent_session_id}-expert-check-{attempt}", token, args.timeout),
                    max(300, min(args.timeout, 600)),
                    session_id=session_id,
                )
                experts_text = extract_tool_text(experts_response)
                if args.expert in experts_text:
                    retry_args = dict(tool_args)
                    retry_args["session_id"] = f"{agent_session_id}-retry-{uuid.uuid4().hex}"
                    retry_response, _ = mcp_post(
                        mcp_url,
                        token,
                        {
                            "jsonrpc": "2.0",
                            "id": 4,
                            "method": "tools/call",
                            "params": {"name": "dfhis_agent_chat", "arguments": retry_args},
                        },
                        request_timeout,
                        session_id=session_id,
                    )
                    retry_answer = extract_tool_text(retry_response)
                    if not args.json:
                        print(retry_answer)
                    answer = retry_answer
                    break
                if attempt < max(1, args.expert_check_retries):
                    time.sleep(max(0.1, args.expert_check_delay))
        if is_expert_route_missing(answer):
            return 1
        return 0
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        print(f"error: MCP HTTP {exc.code}: {body[:1000]}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
