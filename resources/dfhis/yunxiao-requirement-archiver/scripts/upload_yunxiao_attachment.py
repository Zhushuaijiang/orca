#!/usr/bin/env python3
"""Upload a real local file as a Yunxiao work-item attachment."""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requirement-dir", required=True, help="Local requirement directory containing raw.json.")
    parser.add_argument("--file", required=True, help="Local file to upload.")
    parser.add_argument("--file-name", default="", help="Attachment file name. Defaults to the local file name.")
    parser.add_argument("--work-item-id", default="", help="Explicit work item id. Defaults to serialNumber/raw id.")
    parser.add_argument("--organization-id", default="", help="Explicit organization id. Defaults to current token organization.")
    parser.add_argument("--mcp-url", default="", help="Yunxiao MCP URL. Defaults to env/config.")
    parser.add_argument("--token-env", default="YUNXIAO_ACCESS_TOKEN", help="Environment variable containing Yunxiao token.")
    parser.add_argument("--force", action="store_true", help="Upload even when a same-name same-size attachment already exists.")
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

    def post(self, payload: dict) -> dict:
        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return parse_mcp_body(response.read().decode("utf-8", errors="replace"))

    def call_tool(self, name: str, arguments: dict, request_id: int = 1) -> dict | list:
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
        content = (response.get("result") or {}).get("content") or []
        text = "\n".join(item.get("text", "") for item in content if isinstance(item, dict))
        if not text:
            return (response.get("result") or {}).get("structuredContent") or response
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw_text": text}


def raw_work_item(requirement_dir: Path) -> dict:
    raw_path = requirement_dir / "raw.json"
    if not raw_path.exists():
        raise RuntimeError(f"raw.json not found under requirement dir: {requirement_dir}")
    data = json.loads(raw_path.read_text(encoding="utf-8"))
    return data.get("workitem") or data


def attachment_name(item: dict) -> str:
    return str(item.get("fileName") or item.get("name") or "")


def attachment_size(item: dict) -> int:
    try:
        return int(item.get("size") or -1)
    except Exception:
        return -1


def attachment_id(item: dict) -> str:
    if not isinstance(item, dict):
        return ""
    for key in ("id", "fileIdentifier", "identifier", "fileId"):
        value = item.get(key)
        if value:
            return str(value)
    return ""


def embed_markdown(file_name: str, item: dict) -> str:
    ident = attachment_id(item)
    if not ident:
        return ""
    return f"![{file_name}](https://devops.aliyun.com/projex/api/workitem/file/url?fileIdentifier={ident})"


def main() -> int:
    args = build_parser().parse_args()
    requirement_dir = Path(args.requirement_dir).expanduser().resolve()
    file_path = Path(args.file).expanduser().resolve()
    if not file_path.is_file():
        print(f"error: upload file not found: {file_path}", file=sys.stderr)
        return 2

    config = load_dfhis_config()
    mcp_url = args.mcp_url or os.environ.get("YUNXIAO_MCP_URL", "").strip() or config.get("yunxiaoMcpUrl", "")
    token = os.environ.get(args.token_env, "").strip() or config.get("yunxiaoAccessToken", "")
    if not mcp_url:
        print(
            "error: Yunxiao MCP URL not found; set --mcp-url, YUNXIAO_MCP_URL, or dfhis-environment.json yunxiaoMcpUrl",
            file=sys.stderr,
        )
        return 2
    if not token:
        print(
            f"error: Yunxiao token not found; set {args.token_env} or dfhis-environment.json yunxiaoAccessToken",
            file=sys.stderr,
        )
        return 2

    try:
        raw = raw_work_item(requirement_dir)
        work_item_id = args.work_item_id or str(raw.get("serialNumber") or raw.get("identifier") or raw.get("id") or "")
        if not work_item_id:
            raise RuntimeError("work item id missing; pass --work-item-id")

        client = YunxiaoMcp(mcp_url, token, args.timeout)
        current_org = client.call_tool("get_current_organization_info", {}, 1)
        current_user = client.call_tool("get_current_user", {}, 2)
        organization_id = args.organization_id or str(
            current_org.get("lastOrganization") or current_user.get("lastOrganization") or ""
        )
        if not organization_id:
            raise RuntimeError("organization id missing; pass --organization-id")

        file_name = args.file_name or file_path.name
        file_bytes = file_path.read_bytes()
        file_size = len(file_bytes)
        before = client.call_tool(
            "list_workitem_attachments",
            {"organizationId": organization_id, "workItemId": work_item_id},
            3,
        )
        matching = [
            item
            for item in before or []
            if isinstance(item, dict) and attachment_name(item) == file_name and attachment_size(item) == file_size
        ]
        upload_result = None
        if matching and not args.force:
            uploaded = False
            attachment = matching[-1]
        else:
            upload_result = client.call_tool(
                "create_workitem_attachment",
                {
                    "organizationId": organization_id,
                    "workItemId": work_item_id,
                    "fileContent": base64.b64encode(file_bytes).decode("ascii"),
                    "fileName": file_name,
                },
                4,
            )
            uploaded = True
            attachment = upload_result

        after = client.call_tool(
            "list_workitem_attachments",
            {"organizationId": organization_id, "workItemId": work_item_id},
            5,
        )
        verified_item = next(
            (
                item
                for item in after or []
                if isinstance(item, dict) and attachment_name(item) == file_name and attachment_size(item) == file_size
            ),
            None,
        )
        verified = verified_item is not None
        embed = embed_markdown(file_name, verified_item or attachment)
        print(
            json.dumps(
                {
                    "ok": verified,
                    "uploaded": uploaded,
                    "workItemId": work_item_id,
                    "organizationId": organization_id,
                    "fileName": file_name,
                    "size": file_size,
                    "attachmentId": attachment_id(verified_item or attachment),
                    "embedMarkdown": embed,
                    "attachment": attachment,
                    "uploadResult": upload_result,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0 if verified else 1
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        print(f"error: Yunxiao MCP HTTP {exc.code}: {body[:1000]}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
