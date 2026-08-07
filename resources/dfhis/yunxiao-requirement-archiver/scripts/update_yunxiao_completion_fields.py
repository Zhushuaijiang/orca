#!/usr/bin/env python3
"""Update Yunxiao completion fields after a DFHIS branch is pushed."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request


DEFAULT_STATUS_NAME = "开发测试"
DEFAULT_NONE_TEXT = "无"
FIELD_CLIENT_CHANGE = "客户端变更"
FIELD_SERVER_CHANGE = "服务端变更"
FIELD_DATA_CHANGE = "数据变更"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--requirement-dir", required=True, help="Local requirement directory containing raw.json."
    )
    parser.add_argument(
        "--client-change",
        default=DEFAULT_NONE_TEXT,
        help="Client/frontend branch summary, e.g. repo: branch (commit). FULL-REPLACES the field. Use --append-client to merge.",
    )
    parser.add_argument(
        "--server-change", default=DEFAULT_NONE_TEXT, help="Server/backend branch summary. FULL-REPLACES the field. Use --append-server to merge."
    )
    parser.add_argument(
        "--data-change", default=DEFAULT_NONE_TEXT, help="SQL/data migration summary. FULL-REPLACES the field. Use --append-data to merge."
    )
    parser.add_argument(
        "--append-client", default=None,
        help="Append/merge a client change entry into the existing field value instead of replacing it.",
    )
    parser.add_argument(
        "--append-server", default=None,
        help="Append/merge a server change entry into the existing field value instead of replacing it.",
    )
    parser.add_argument(
        "--append-data", default=None,
        help="Append/merge a data change entry into the existing field value instead of replacing it.",
    )
    parser.add_argument("--status-name", default=DEFAULT_STATUS_NAME, help="Target Yunxiao status display name.")
    parser.add_argument("--work-item-id", default="", help="Explicit Yunxiao work item unique id. Defaults to raw.json workitem.id.")
    parser.add_argument("--organization-id", default="", help="Explicit organization id. Defaults to current token organization.")
    parser.add_argument("--project-id", default="", help="Explicit project id. Defaults to get_work_item space.id.")
    parser.add_argument("--workitem-type-id", default="", help="Explicit work item type id. Defaults to get_work_item workitemType.id.")
    parser.add_argument("--participant", action="append", default=[], help="Additional participant user id. Repeatable.")
    parser.add_argument("--no-add-assignee", action="store_true", help="Do not automatically add current assignee as participant.")
    parser.add_argument("--no-add-current-user", action="store_true", help="Do not automatically add current token user as participant.")
    parser.add_argument("--mcp-url", default="", help="Yunxiao MCP URL. Defaults to env/config.")
    parser.add_argument("--token-env", default="YUNXIAO_ACCESS_TOKEN", help="Environment variable containing Yunxiao token.")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument(
        "--force-overwrite", action="store_true",
        help="Suppress overwrite warning when replacing non-empty fields. Use only when you have verified the old values are obsolete.",
    )
    return parser


def merge_field_value(existing: str, new_entry: str, none_text: str = DEFAULT_NONE_TEXT) -> str:
    """Merge a new entry into an existing field value, preserving prior entries."""
    existing = (existing or "").strip()
    new_entry = (new_entry or "").strip()
    if not new_entry:
        return existing or none_text
    if not existing or existing == none_text:
        return new_entry
    if new_entry in existing:
        return existing
    return f"{existing}；{new_entry}"


def get_current_field_value(work_item: dict, field_name: str) -> str:
    """Extract the current text value of a named custom field from a work item."""
    values = get_values_by_field(work_item, field_name)
    return "；".join(v for v in values if v) if values else ""


def load_dfhis_config() -> dict:
    paths = []
    if os.environ.get("ORCA_USER_DATA_PATH"):
        paths.append(Path(os.environ["ORCA_USER_DATA_PATH"]) / "dfhis-environment.json")
    home = Path.home()
    paths.extend(
        [
            home / "Library/Application Support/orca-dev/dfhis-environment.json",
            home / "Library/Application Support/orca/dfhis-environment.json",
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
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return parse_mcp_body(resp.read().decode("utf-8", errors="replace"))

    def call_tool(self, name: str, arguments: dict, request_id: int = 1) -> dict:
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
            structured = (response.get("result") or {}).get("structuredContent")
            if structured:
                return structured
            return response
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


def get_values_by_field(work_item: dict, field_name: str) -> list[str]:
    for field in work_item.get("customFieldValues") or []:
        if field.get("fieldName") != field_name:
            continue
        return [
            str(value.get("displayValue") or value.get("identifier") or "")
            for value in field.get("values") or []
        ]
    return []


def find_status_id(workflow: dict, status_name: str) -> str:
    for status in workflow.get("statuses") or []:
        names = {status.get("displayName"), status.get("name"), status.get("nameEn")}
        if status_name in names:
            return str(status.get("id") or "")
    raise RuntimeError(f"status {status_name!r} not found in workflow")


def find_field_id(field_config: list[dict], field_name: str) -> str:
    for field in field_config:
        if field.get("name") == field_name:
            return str(field.get("id") or "")
    raise RuntimeError(f"custom field {field_name!r} not found in field config")


def user_id(value: object) -> str:
    if isinstance(value, dict):
        return str(value.get("id") or "")
    return ""


def main() -> int:
    args = build_parser().parse_args()
    requirement_dir = Path(args.requirement_dir).expanduser().resolve()
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
        work_item_id = args.work_item_id or str(raw.get("id") or "")
        if not work_item_id:
            raise RuntimeError("work item unique id missing; pass --work-item-id")

        client = YunxiaoMcp(mcp_url, token, args.timeout)
        current_org = client.call_tool("get_current_organization_info", {}, 1)
        current_user = client.call_tool("get_current_user", {}, 2)
        organization_id = args.organization_id or str(
            current_org.get("lastOrganization") or current_user.get("lastOrganization") or ""
        )
        if not organization_id:
            raise RuntimeError("organization id missing; pass --organization-id")

        before = client.call_tool("get_work_item", {"organizationId": organization_id, "workItemId": work_item_id}, 3)
        project_id = args.project_id or str((before.get("space") or {}).get("id") or "")
        workitem_type_id = args.workitem_type_id or str((before.get("workitemType") or {}).get("id") or "")
        if not project_id or not workitem_type_id:
            raise RuntimeError("project id or work item type id missing")

        field_config = client.call_tool(
            "get_work_item_type_field_config",
            {"organizationId": organization_id, "projectId": project_id, "workItemTypeId": workitem_type_id},
            4,
        )
        workflow = client.call_tool(
            "get_work_item_workflow",
            {"organizationId": organization_id, "projectId": project_id, "workItemTypeId": workitem_type_id},
            5,
        )

        status_id = find_status_id(workflow, args.status_name)
        client_field_id = find_field_id(field_config, FIELD_CLIENT_CHANGE)
        server_field_id = find_field_id(field_config, FIELD_SERVER_CHANGE)
        data_field_id = find_field_id(field_config, FIELD_DATA_CHANGE)

        # Read current field values before deciding update targets
        current_client = get_current_field_value(before, FIELD_CLIENT_CHANGE)
        current_server = get_current_field_value(before, FIELD_SERVER_CHANGE)
        current_data = get_current_field_value(before, FIELD_DATA_CHANGE)

        # Determine final values: append mode merges with existing; explicit args replace
        if args.append_client is not None:
            final_client = merge_field_value(current_client, args.append_client)
        else:
            final_client = args.client_change
        if args.append_server is not None:
            final_server = merge_field_value(current_server, args.append_server)
        else:
            final_server = args.server_change
        if args.append_data is not None:
            final_data = merge_field_value(current_data, args.append_data)
        else:
            final_data = args.data_change

        # Overwrite safety: warn when replacing a non-empty value with something different
        overwrite_warnings: list[str] = []
        for field_name, old_val, new_val in [
            (FIELD_CLIENT_CHANGE, current_client, final_client),
            (FIELD_SERVER_CHANGE, current_server, final_server),
            (FIELD_DATA_CHANGE, current_data, final_data),
        ]:
            old_clean = (old_val or "").strip()
            new_clean = (new_val or "").strip()
            if not old_clean or old_clean == DEFAULT_NONE_TEXT:
                continue
            if new_clean == old_clean:
                continue
            overwrite_warnings.append(
                f"  {field_name}: '{old_clean}' → '{new_clean}'"
            )
        if overwrite_warnings:
            if not args.force_overwrite:
                print(
                    "⚠️  OVERWRITE WARNING — the following non-empty field values will be DESTROYED:\n"
                    + "\n".join(overwrite_warnings)
                    + "\n  To merge instead, use --append-client/--append-server/--append-data."
                    + "\n  To confirm full replacement, re-run with --force-overwrite.",
                    file=sys.stderr,
                )
                return 1
            else:
                print(
                    "⚠️  Overwrite confirmed (--force-overwrite):\n" + "\n".join(overwrite_warnings),
                    file=sys.stderr,
                )

        participants = {user_id(item) for item in before.get("participants") or []}
        participants.update(uid for uid in args.participant if uid)
        if not args.no_add_assignee:
            participants.add(user_id(before.get("assignedTo")))
        if not args.no_add_current_user:
            participants.add(str(current_user.get("id") or current_org.get("userId") or ""))
        participants.discard("")

        update_fields = {
            "status": status_id,
            "participants": sorted(participants),
            "customFieldValues": {
                client_field_id: final_client,
                server_field_id: final_server,
                data_field_id: final_data,
            },
        }
        update_result = client.call_tool(
            "update_work_item",
            {
                "organizationId": organization_id,
                "workItemId": work_item_id,
                "updateWorkItemFields": update_fields,
            },
            6,
        )
        after = client.call_tool("get_work_item", {"organizationId": organization_id, "workItemId": work_item_id}, 7)

        verification = {
            "status": (after.get("status") or {}).get("displayName") == args.status_name,
            "participants": sorted(user_id(item) for item in after.get("participants") or []) == sorted(participants),
            FIELD_CLIENT_CHANGE: get_values_by_field(after, FIELD_CLIENT_CHANGE) == [final_client],
            FIELD_SERVER_CHANGE: get_values_by_field(after, FIELD_SERVER_CHANGE) == [final_server],
            FIELD_DATA_CHANGE: get_values_by_field(after, FIELD_DATA_CHANGE) == [final_data],
        }
        ok = all(verification.values())
        print(
            json.dumps(
                {
                    "ok": ok,
                    "workItemId": work_item_id,
                    "serialNumber": after.get("serialNumber") or raw.get("serialNumber"),
                    "organizationId": organization_id,
                    "projectId": project_id,
                    "updateResult": update_result,
                    "target": {
                        "status": args.status_name,
                        "participants": sorted(participants),
                        FIELD_CLIENT_CHANGE: final_client,
                        FIELD_SERVER_CHANGE: final_server,
                        FIELD_DATA_CHANGE: final_data,
                    },
                    "previous": {
                        FIELD_CLIENT_CHANGE: current_client or DEFAULT_NONE_TEXT,
                        FIELD_SERVER_CHANGE: current_server or DEFAULT_NONE_TEXT,
                        FIELD_DATA_CHANGE: current_data or DEFAULT_NONE_TEXT,
                    },
                    "actual": {
                        "status": after.get("status"),
                        "participants": after.get("participants"),
                        FIELD_CLIENT_CHANGE: get_values_by_field(after, FIELD_CLIENT_CHANGE),
                        FIELD_SERVER_CHANGE: get_values_by_field(after, FIELD_SERVER_CHANGE),
                        FIELD_DATA_CHANGE: get_values_by_field(after, FIELD_DATA_CHANGE),
                    },
                    "verification": verification,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0 if ok else 1
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        print(f"error: Yunxiao MCP HTTP {exc.code}: {body[:1000]}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
