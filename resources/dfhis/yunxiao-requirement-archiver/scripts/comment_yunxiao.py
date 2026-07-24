#!/usr/bin/env python3
"""Comment on a Yunxiao/DFHIS work item through the official Yunxiao MCP."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import urllib.request


DEFAULT_MCP_URL = "https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=organization-management,project-management"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work_item_id")
    parser.add_argument("--content", default="")
    parser.add_argument("--content-file", default="")
    parser.add_argument("--organization-id", default="")
    parser.add_argument("--mcp-url", default="")
    parser.add_argument("--token-env", default="YUNXIAO_ACCESS_TOKEN")
    parser.add_argument("--timeout", type=int, default=120)
    return parser


def load_dfhis_config() -> dict:
    paths = []
    if os.environ.get("ORCA_USER_DATA_PATH"):
        paths.append(Path(os.environ["ORCA_USER_DATA_PATH"]) / "dfhis-environment.json")
    home = Path.home()
    paths.extend(
        [
            home / "Library/Application Support/orca-dev/dfhis-environment.json",
            home / "Library/Application Support/orca/dfhis-environment.json",
            home / "AppData/Roaming/orca-dev/dfhis-environment.json",
            home / "AppData/Roaming/orca/dfhis-environment.json",
            home / "AppData/Roaming/Orca/dfhis-environment.json",
        ]
    )
    for path in paths:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
    return {}


def parse_mcp_body(body: str) -> dict:
    events = []
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data:
            continue
        try:
            events.append(json.loads(data))
        except json.JSONDecodeError:
            continue
    if events:
        return events[-1]
    return json.loads(body)


class YunxiaoMcp:
    def __init__(self, url: str, token: str, timeout: int) -> None:
        self.url = url
        self.token = token
        self.timeout = timeout
        self.session_id = ""

    def post(self, payload: dict) -> dict:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            if response.headers.get("Mcp-Session-Id"):
                self.session_id = response.headers.get("Mcp-Session-Id") or ""
            return parse_mcp_body(response.read().decode("utf-8", errors="replace"))

    def initialize(self) -> None:
        self.post(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "orca-direct-yunxiao-commenter", "version": "0.1"},
                },
            }
        )
        if self.session_id:
            self.post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def call_tool(self, name: str, arguments: dict, request_id: int) -> dict:
        response = self.post(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
        )
        if response.get("error"):
            raise RuntimeError(json.dumps(response["error"], ensure_ascii=False))
        return response


def main() -> int:
    args = build_parser().parse_args()
    config = load_dfhis_config()
    token = os.environ.get(args.token_env, "").strip() or config.get("yunxiaoAccessToken", "")
    mcp_url = args.mcp_url or os.environ.get("YUNXIAO_MCP_URL", "").strip() or config.get("yunxiaoMcpUrl", "") or DEFAULT_MCP_URL
    content = args.content
    if args.content_file:
        content = Path(args.content_file).read_text(encoding="utf-8")
    if not token:
        print(f"error: Yunxiao token not found; set {args.token_env} or DFHIS Setup.", file=sys.stderr)
        return 2
    if not args.work_item_id.strip():
        print("error: work_item_id is required", file=sys.stderr)
        return 2
    if not content.strip():
        print("error: content or --content-file is required", file=sys.stderr)
        return 2
    try:
        client = YunxiaoMcp(mcp_url, token, args.timeout)
        client.initialize()
        organization_id = args.organization_id or os.environ.get("YUNXIAO_ORGANIZATION_ID", "")
        if not organization_id:
            current = client.call_tool("get_current_organization_info", {}, 2)
            payload = current.get("result", {}).get("structuredContent") if isinstance(current.get("result"), dict) else {}
            organization_id = str((payload or {}).get("lastOrganization") or (payload or {}).get("organizationId") or "")
        if not organization_id:
            organization_id = "64cc7343a0c93ee7446892d5"
        result = client.call_tool(
            "create_work_item_comment",
            {
                "organizationId": organization_id,
                "workItemId": args.work_item_id.strip().upper(),
                "content": content.strip(),
            },
            3,
        )
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
