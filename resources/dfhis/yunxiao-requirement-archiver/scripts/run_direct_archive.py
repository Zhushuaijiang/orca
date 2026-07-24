#!/usr/bin/env python3
"""Archive a Yunxiao/DFHIS work item directly through the official Yunxiao MCP."""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path


DEFAULT_MCP_URL = "https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=organization-management,project-management"
DEFAULT_ORGANIZATION_ID = "64cc7343a0c93ee7446892d5"
CORE_FILES = (
    "raw.json",
    "requirement.md",
    "description.md",
    "context.txt",
    "analysis_input.md",
    "analysis.md",
    "attachments_manifest.json",
    "original_requirements.json",
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", nargs="*", help="DFHIS id or Yunxiao URL.")
    parser.add_argument("--output-dir", default="", help="Archive root or exact work-item directory.")
    parser.add_argument("--mcp-url", default="", help="Yunxiao MCP URL. Defaults to env/config.")
    parser.add_argument("--organization-id", default="", help="Yunxiao organization id.")
    parser.add_argument("--token-env", default="YUNXIAO_ACCESS_TOKEN")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--no-attachments", action="store_true")
    parser.add_argument("--json", action="store_true", help="Print machine-readable result.")
    return parser


def load_dfhis_config() -> dict:
    paths: list[Path] = []
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


def extract_work_item_id(text: str) -> str:
    match = re.search(r"\b([A-Z][A-Z0-9]+-\d+)\b", text or "", flags=re.I)
    return match.group(1).upper() if match else ""


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


def tool_payload(response: dict) -> object:
    result = response.get("result") if isinstance(response, dict) else {}
    result = result if isinstance(result, dict) else {}
    structured = result.get("structuredContent")
    if structured:
        return structured
    content = result.get("content") or []
    parts = [item.get("text", "") for item in content if isinstance(item, dict) and item.get("text")]
    text = "\n".join(parts).strip()
    if not text:
        return response
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw_text": text}


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
                    "clientInfo": {"name": "orca-direct-yunxiao-archiver", "version": "0.1"},
                },
            }
        )
        if self.session_id:
            self.post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def call_tool(self, name: str, arguments: dict, request_id: int) -> object:
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
        return tool_payload(response)


def clean_text(value: object, max_chars: int = 60000) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        raw = json.dumps(value, ensure_ascii=False)
    else:
        raw = str(value)
    raw = html.unescape(raw)
    raw = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", raw, flags=re.I)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = re.sub(r"\\[rnt]", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:max_chars]


def display_name(value: object) -> str:
    if isinstance(value, dict):
        for key in ("displayName", "displayValue", "name", "identifier", "id"):
            if value.get(key):
                return str(value.get(key))
    return str(value or "")


def normalize_list(value: object) -> list[dict]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    for key in ("items", "data", "result", "results", "list", "records"):
        nested = value.get(key)
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        items = normalize_list(nested)
        if items:
            return items
    return []


def extract_images(value: object) -> list[dict]:
    images: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    def add(node: dict, source_path: str) -> None:
        url = str(
            node.get("url")
            or node.get("downloadUrl")
            or node.get("signedUrl")
            or node.get("ossUrl")
            or node.get("src")
            or ""
        ).strip()
        file_id = str(node.get("fileIdentifier") or node.get("fileId") or node.get("id") or "").strip()
        name = str(
            node.get("name")
            or node.get("fileName")
            or node.get("filename")
            or node.get("title")
            or node.get("alt")
            or "image"
        ).strip()
        text = " ".join([url, name, str(node.get("contentType") or node.get("mimeType") or "")]).lower()
        if not (file_id or url):
            return
        if "image" not in text and not re.search(r"\.(png|jpe?g|webp|bmp|gif)(\?|$)", text):
            return
        key = (file_id, url, name)
        if key in seen:
            return
        seen.add(key)
        images.append(
            {
                "id": file_id,
                "name": name,
                "urls": [url] if url else [],
                "mime": node.get("contentType") or node.get("mimeType") or "",
                "source_path": source_path,
            }
        )

    def walk(node: object, path: str) -> None:
        if isinstance(node, dict):
            add(node, path)
            for key, child in node.items():
                walk(child, f"{path}.{key}" if path else str(key))
        elif isinstance(node, list):
            for index, child in enumerate(node[:300]):
                walk(child, f"{path}[{index}]")
        elif isinstance(node, str) and "fileIdentifier=" in node:
            for match in re.finditer(r"fileIdentifier=([A-Za-z0-9_-]+)", node):
                add({"fileIdentifier": match.group(1), "name": "image"}, path)

    walk(value, "")
    return images[:200]


def collect_attachment_candidates(raw_data: dict, attachments: list[dict], desc_images: list[dict]) -> list[dict]:
    candidates: list[dict] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()

    def add(item: dict, source_path: str) -> None:
        urls = [
            str(item.get(key)).strip()
            for key in ("url", "downloadUrl", "signedUrl", "ossUrl", "src")
            if item.get(key)
        ]
        file_id = str(
            item.get("fileIdentifier")
            or item.get("fileId")
            or item.get("id")
            or item.get("identifier")
            or ""
        ).strip()
        name = str(
            item.get("name")
            or item.get("fileName")
            or item.get("filename")
            or item.get("title")
            or item.get("displayName")
            or item.get("originalName")
            or ""
        ).strip()
        if not name and urls:
            name = urls[0].split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1]
        if not (file_id or urls):
            return
        key = (file_id, name, tuple(urls))
        if key in seen:
            return
        seen.add(key)
        candidates.append(
            {
                "id": file_id,
                "name": name or "attachment",
                "urls": urls,
                "size": item.get("size") or item.get("fileSize") or item.get("length"),
                "mime": item.get("mimeType") or item.get("contentType") or item.get("type") or "",
                "source_path": source_path,
            }
        )

    def walk(node: object, path: str) -> None:
        if isinstance(node, dict):
            lower_path = path.lower()
            in_file_area = any(x in lower_path for x in ("attachment", "file", "jsonmlvalue", "children"))
            if any(node.get(k) for k in ("url", "downloadUrl", "signedUrl", "ossUrl", "src", "fileIdentifier", "fileId")) or (
                in_file_area and node.get("id") and any(node.get(k) for k in ("name", "fileName", "filename", "title"))
            ):
                add(node, path)
            for key, child in node.items():
                walk(child, f"{path}.{key}" if path else str(key))
        elif isinstance(node, list):
            for index, child in enumerate(node[:500]):
                walk(child, f"{path}[{index}]")

    walk(raw_data, "raw")
    for index, item in enumerate(attachments):
        add(item, f"workitem.attachments[{index}]")
        walk(item, f"workitem.attachments[{index}]")
    for image in desc_images:
        add(image, image.get("source_path") or "description.images")
    return candidates[:200]


def safe_filename(name: str, fallback: str) -> str:
    value = urllib.parse.unquote((name or "").strip() or fallback)
    value = re.sub(r"[\\/:*?\"<>|\r\n\t]+", "_", value)
    value = re.sub(r"\s+", " ", value).strip(" .")
    return (value or fallback)[:180]


def redacted_url(value: str) -> str:
    try:
        parts = urllib.parse.urlsplit(value)
        return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    except Exception:
        return ""


def download_url(url: str, dest: Path, token: str, timeout: int) -> tuple[bool, str, int]:
    headers = {"User-Agent": "Orca-Yunxiao-Archiver/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["x-yunxiao-token"] = token
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            dest.parent.mkdir(parents=True, exist_ok=True)
            total = 0
            with dest.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 256)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > 300 * 1024 * 1024:
                        return False, "file too large over 300MB", total
                    handle.write(chunk)
            return True, "", total
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}", 0
    except Exception as exc:
        return False, str(exc)[:300], 0


def extract_docx_text(path: Path, max_chars: int = 80000) -> str:
    try:
        chunks: list[str] = []
        with zipfile.ZipFile(path) as archive:
            names = [name for name in archive.namelist() if name.startswith("word/") and name.endswith(".xml")]
            for name in ["word/document.xml", *[item for item in names if item != "word/document.xml"]]:
                if name not in names:
                    continue
                root = ET.fromstring(archive.read(name))
                for node in root.iter():
                    if node.tag.endswith("}t") and node.text:
                        chunks.append(node.text)
                    elif node.tag.endswith("}tab"):
                        chunks.append("\t")
                    elif node.tag.endswith("}br") or node.tag.endswith("}p"):
                        chunks.append("\n")
                if sum(len(item) for item in chunks) >= max_chars:
                    break
        return re.sub(r"\n{3,}", "\n\n", "".join(chunks)).strip()[:max_chars]
    except Exception as exc:
        return f"[docx text extraction failed: {exc}]"


def resolve_output_dir(base: str, work_item_id: str, config: dict) -> Path:
    explicit = Path(base).expanduser() if base else None
    if explicit and explicit.name.upper() == work_item_id:
        return explicit.resolve()
    root_value = (
        str(explicit) if explicit else os.environ.get("YUNXIAO_ARCHIVE_WORKSPACE") or config.get("archiveWorkspacePath") or os.getcwd()
    )
    return (Path(root_value).expanduser() / work_item_id).resolve()


def build_context(raw_data: dict, comments: list[dict], attachments: list[dict], desc_text: str) -> str:
    fields = [
        f"ID: {raw_data.get('serialNumber') or raw_data.get('identifier') or raw_data.get('id') or ''}",
        f"Title: {raw_data.get('subject') or raw_data.get('title') or ''}",
        f"Type: {display_name(raw_data.get('workitemType')) or raw_data.get('categoryId') or ''}",
        f"Status: {display_name(raw_data.get('status'))}",
        f"Assignee: {display_name(raw_data.get('assignedTo'))}",
        f"Creator: {display_name(raw_data.get('creator'))}",
        f"Sprint: {display_name(raw_data.get('sprint'))}",
        f"Project: {display_name(raw_data.get('space'))}",
    ]
    custom = []
    for item in raw_data.get("customFieldValues") or []:
        if not isinstance(item, dict):
            continue
        values = ", ".join(display_name(value) for value in (item.get("values") or [])[:4] if display_name(value))
        if values:
            custom.append(f"{item.get('fieldName')}: {values}")
    if custom:
        fields.append("Custom fields: " + "; ".join(custom[:12]))
    if desc_text:
        fields.append("Description: " + desc_text[:5000])
    if attachments:
        fields.append(f"Attachments: {len(attachments)} item(s)")
    if comments:
        fields.append("Comments/activities:")
        for item in comments[:20]:
            fields.append(clean_text(item, 1200))
    return "\n".join(item for item in fields if item.strip())[:60000]


def write_markdown_files(
    target_dir: Path,
    work_item_id: str,
    source: str,
    raw_data: dict,
    context: str,
    desc_text: str,
    manifest: list[dict],
    extracted_docs: list[dict],
) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    title = raw_data.get("subject") or raw_data.get("title") or ""
    (target_dir / "raw.json").write_text(json.dumps(raw_data, ensure_ascii=False, indent=2), encoding="utf-8")
    (target_dir / "description.md").write_text(desc_text or "", encoding="utf-8")
    (target_dir / "context.txt").write_text(context or "", encoding="utf-8")
    (target_dir / "attachments_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (target_dir / "original_requirements.json").write_text("[]\n", encoding="utf-8")
    requirement_md = [
        f"# {work_item_id} {title}".strip(),
        "",
        f"- Source: {source}",
        f"- Archived at: {datetime.now().isoformat()}",
        f"- Target directory: `{target_dir}`",
        f"- Status: {display_name(raw_data.get('status')) or '-'}",
        f"- Assignee: {display_name(raw_data.get('assignedTo')) or '-'}",
        f"- Creator: {display_name(raw_data.get('creator')) or '-'}",
        "",
        "## Description",
        "",
        desc_text or "No description text was returned.",
        "",
        "## Yunxiao Context",
        "",
        "```text",
        (context or "")[:30000],
        "```",
    ]
    (target_dir / "requirement.md").write_text("\n".join(requirement_md), encoding="utf-8")
    analysis_input = [
        f"# {work_item_id} Requirement Analysis Input",
        "",
        "## Yunxiao Description",
        "",
        (desc_text or "No description text was returned.")[:30000],
        "",
        "## Yunxiao Context",
        "",
        (context or "No context was returned.")[:30000],
        "",
        "## Attachment Manifest",
        "",
        json.dumps(manifest, ensure_ascii=False, indent=2)[:20000],
        "",
        "## Attachment Text",
    ]
    if extracted_docs:
        for doc in extracted_docs:
            text_path = Path(doc["text"])
            analysis_input.extend(
                [
                    "",
                    f"### {Path(doc['source']).name}",
                    "",
                    text_path.read_text(encoding="utf-8", errors="replace")[:50000] if text_path.exists() else "",
                ]
            )
    else:
        analysis_input.append("No extractable docx attachment text was found.")
    (target_dir / "analysis_input.md").write_text("\n".join(analysis_input), encoding="utf-8")
    (target_dir / "analysis.md").write_text(
        "Direct Yunxiao archive completed. Use analysis_input.md and the downloaded evidence for deep code review.\n",
        encoding="utf-8",
    )


def archive_one(client: YunxiaoMcp, source: str, args: argparse.Namespace, config: dict, token: str) -> dict:
    work_item_id = extract_work_item_id(source)
    if not work_item_id:
        raise RuntimeError(f"Could not find a DFHIS-style work item id in: {source}")
    organization_id = args.organization_id or os.environ.get("YUNXIAO_ORGANIZATION_ID") or config.get("yunxiaoOrganizationId") or ""
    if not organization_id:
        try:
            current = client.call_tool("get_current_organization_info", {}, 10)
            if isinstance(current, dict):
                organization_id = str(current.get("lastOrganization") or current.get("organizationId") or "")
        except Exception:
            organization_id = ""
    organization_id = organization_id or DEFAULT_ORGANIZATION_ID
    target_dir = resolve_output_dir(args.output_dir, work_item_id, config)
    target_dir.mkdir(parents=True, exist_ok=True)
    raw = client.call_tool("get_work_item", {"organizationId": organization_id, "workItemId": work_item_id}, 11)
    raw_data = raw if isinstance(raw, dict) else {"value": raw}
    desc_text = clean_text(raw_data.get("description"))
    desc_images = extract_images(raw_data.get("description"))
    attachments_raw: object = []
    attachment_items: list[dict] = []
    attachment_error = ""
    if not args.no_attachments:
        try:
            attachments_raw = client.call_tool("list_workitem_attachments", {"organizationId": organization_id, "workItemId": work_item_id}, 12)
            attachment_items = normalize_list(attachments_raw)
        except Exception as exc:
            attachment_error = str(exc)[:500]
    (target_dir / "attachments_raw.json").write_text(json.dumps(attachments_raw, ensure_ascii=False, indent=2), encoding="utf-8")
    comments: list[dict] = []
    try:
        comments_raw = client.call_tool("list_work_item_comments", {"organizationId": organization_id, "workItemId": work_item_id}, 13)
        comments = normalize_list(comments_raw)
        (target_dir / "comments_raw.json").write_text(json.dumps(comments_raw, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        comments = []
    context = build_context(raw_data, comments, attachment_items, desc_text)
    candidates = collect_attachment_candidates(raw_data, attachment_items, desc_images)
    attachments_dir = target_dir / "attachments"
    if attachments_dir.exists() and attachments_dir.is_dir():
        shutil.rmtree(attachments_dir)
    attachments_dir.mkdir(exist_ok=True)
    manifest: list[dict] = []
    saved_files: list[str] = []
    extracted_docs: list[dict] = []
    internal_id = str(raw_data.get("id") or raw_data.get("identifier") or "").strip()
    for index, candidate in enumerate(candidates[:100], 1):
        urls = list(candidate.get("urls") or [])
        if not urls and candidate.get("id") and internal_id:
            try:
                file_result = client.call_tool(
                    "get_workitem_file",
                    {"organizationId": organization_id, "workitemId": internal_id, "id": str(candidate.get("id"))},
                    100 + index,
                )
                if isinstance(file_result, dict):
                    urls.extend(str(file_result.get(key) or "").strip() for key in ("url", "downloadUrl", "signedUrl", "ossUrl"))
                elif isinstance(file_result, str):
                    urls.append(file_result)
            except Exception:
                pass
        urls = [url for url in urls if url.startswith(("http://", "https://"))]
        filename = safe_filename(candidate.get("name") or f"attachment-{index}", f"attachment-{index}")
        if "." not in filename:
            guessed = ""
            for url in urls:
                guessed = mimetypes.guess_extension(mimetypes.guess_type(url.split("?", 1)[0])[0] or "")
                if guessed:
                    break
            filename += guessed or ".bin"
        dest = attachments_dir / f"{index:02d}-{filename}"
        item = {
            "index": index,
            "id": candidate.get("id") or "",
            "name": candidate.get("name") or "",
            "source_path": candidate.get("source_path") or "",
            "url_count": len(urls),
            "urls_redacted": [redacted_url(url) for url in urls],
            "saved": False,
            "path": str(dest),
            "error": "",
            "bytes": 0,
        }
        if urls and not args.no_attachments:
            ok, error, byte_count = download_url(urls[0], dest, token, args.timeout)
            item.update({"saved": ok, "error": error, "bytes": byte_count})
            if ok:
                saved_files.append(str(dest))
                if dest.suffix.lower() == ".docx":
                    text = extract_docx_text(dest)
                    text_path = dest.with_suffix(dest.suffix + ".txt")
                    text_path.write_text(text, encoding="utf-8")
                    extracted_docs.append({"source": str(dest), "text": str(text_path), "chars": len(text)})
        elif not urls:
            item["error"] = "no downloadable url"
        manifest.append(item)
    write_markdown_files(target_dir, work_item_id, source, raw_data, context, desc_text, manifest, extracted_docs)
    files = [str(target_dir / name) for name in CORE_FILES if (target_dir / name).exists()]
    files.extend(saved_files)
    files.extend(doc["text"] for doc in extracted_docs)
    message = f"归档完成：{work_item_id}，目录：{target_dir}，附件候选 {len(manifest)} 个，成功下载 {len(saved_files)} 个"
    if attachment_error:
        message += f"，附件列表读取失败：{attachment_error}"
    return {
        "id": work_item_id,
        "status": "success",
        "dir": str(target_dir),
        "message": message,
        "files": files,
        "attachment_count": len(manifest),
        "saved_count": len(saved_files),
    }


def build_answer(rows: list[dict]) -> str:
    lines = ["# 云效需求直连归档结果", "", "| 需求 | 状态 | 目录 | 说明 |", "|---|---|---|---|"]
    for row in rows:
        lines.append(f"| `{row['id']}` | {row['status']} | `{row['dir']}` | {row['message']} |")
    lines.extend(["", "## 文件清单"])
    for row in rows:
        lines.append(f"### {row['id']}")
        for file_path in row.get("files") or []:
            lines.append(f"- `{file_path}`")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    args = build_parser().parse_args()
    config = load_dfhis_config()
    token = os.environ.get(args.token_env, "").strip() or config.get("yunxiaoAccessToken", "")
    mcp_url = args.mcp_url or os.environ.get("YUNXIAO_MCP_URL", "").strip() or config.get("yunxiaoMcpUrl", "") or DEFAULT_MCP_URL
    target_text = " ".join(args.target).strip() or os.environ.get("YUNXIAO_WORK_ITEM_ID", "").strip()
    if not token:
        print(f"error: Yunxiao token not found; set {args.token_env} or DFHIS Setup.", file=sys.stderr)
        return 2
    if not target_text:
        print("error: DFHIS id or Yunxiao URL is required", file=sys.stderr)
        return 2
    rows: list[dict] = []
    started = time.time()
    try:
        client = YunxiaoMcp(mcp_url, token, args.timeout)
        client.initialize()
        sources = [target_text]
        ids = re.findall(r"\b[A-Z][A-Z0-9]+-\d+\b", target_text, flags=re.I)
        if len(ids) > 1:
            sources = list(dict.fromkeys(item.upper() for item in ids))
        for source in sources[:8]:
            rows.append(archive_one(client, source, args, config, token))
        answer = build_answer(rows)
        payload = {
            "ok": all(row.get("status") == "success" for row in rows),
            "source": "direct-yunxiao-mcp",
            "work_item_id": rows[0]["id"] if rows else "",
            "output_dir": rows[0]["dir"] if rows else "",
            "elapsed_ms": int((time.time() - started) * 1000),
            "rows": rows,
            "message": answer,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else answer)
        return 0 if payload["ok"] else 1
    except Exception as exc:
        payload = {
            "ok": False,
            "source": "direct-yunxiao-mcp",
            "error": str(exc),
            "elapsed_ms": int((time.time() - started) * 1000),
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
