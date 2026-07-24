#!/usr/bin/env python3
"""Download a server-side Yunxiao archive through the HIS MCP download tool."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile


DEFAULT_MCP_URL = "http://192.168.1.10:9020/mcp"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work_item_id", nargs="?", help="DFHIS work item id, such as DFHIS-31691.")
    parser.add_argument("--archive-dir", default="", help="Explicit server archive directory under /opt/workspace/df-his/yunxiao.")
    parser.add_argument("--output-dir", default="", help="Local directory to extract into. Defaults to ./<work_item_id>.")
    parser.add_argument("--mcp-url", default=os.environ.get("HIS_MCP_URL", DEFAULT_MCP_URL))
    parser.add_argument("--token-env", default="HIS_MCP_TOKEN")
    parser.add_argument("--chunk-size", type=int, default=768 * 1024)
    parser.add_argument("--max-bytes", type=int, default=50 * 1024 * 1024)
    parser.add_argument("--no-attachments", action="store_true", help="Skip files under attachments/ directories.")
    parser.add_argument("--keep-zip", action="store_true", help="Keep the downloaded zip inside the requirement output directory.")
    parser.add_argument("--require-complete", action="store_true", help="Exit non-zero if core archive evidence files are missing.")
    parser.add_argument("--wait-complete", action="store_true", help="Poll until archive_quality is complete or --wait-timeout expires.")
    parser.add_argument("--wait-timeout", type=int, default=1800, help="Seconds to wait with --wait-complete.")
    parser.add_argument("--poll-interval", type=int, default=10, help="Seconds between --wait-complete download attempts.")
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


def safe_extract_zip(zip_bytes: bytes, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    root = output_dir.resolve()
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            target = (root / info.filename).resolve()
            if not str(target).startswith(str(root) + os.sep) and target != root:
                raise RuntimeError(f"unsafe zip member path: {info.filename}")
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(info))


def archive_quality(output_dir: Path, files: list[dict]) -> dict:
    paths = {str(item.get("path") or "") for item in files}
    core_expected = [
        "raw.json",
        "requirement.md",
        "description.md",
        "context.txt",
        "analysis.md",
        "attachments_manifest.json",
    ]
    missing = [name for name in core_expected if name not in paths and not (output_dir / name).exists()]
    attachment_paths = [p for p in paths if p.startswith("attachments/")]
    has_parent = any(p.startswith("original/") for p in paths)
    if not missing:
        level = "complete"
    elif {"requirement.md", "analysis.md", "description.md"}.issubset(paths):
        level = "minimal"
    else:
        level = "incomplete"
    return {
        "level": level,
        "missing_expected_files": missing,
        "has_attachments": bool(attachment_paths),
        "attachment_count": len(attachment_paths),
        "has_parent_requirements": has_parent,
    }


def ensure_local_attachment_manifest(output_dir: Path, files: list[dict]) -> None:
    manifest_path = output_dir / "attachments_manifest.json"
    if manifest_path.exists():
        return
    attachment_files = [
        item
        for item in files
        if str(item.get("path") or "").startswith("attachments/")
        and not str(item.get("path") or "").endswith("/")
    ]
    if not attachment_files:
        return
    manifest = {
        "generated_by": "download_mcp_archive.py",
        "source": "download_yunxiao_archive file list",
        "note": "Server archive did not include root attachments_manifest.json; this local manifest was generated from the verified MCP archive file list.",
        "attachment_count": len(attachment_files),
        "attachments": [
            {
                "path": item.get("path"),
                "local_path": str(output_dir / str(item.get("path") or "")),
                "size": item.get("size"),
            }
            for item in attachment_files
        ],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    args = build_parser().parse_args()
    mcp_url, token = resolve_mcp_auth(args.mcp_url, args.token_env)
    if not token:
        print(f"error: set {args.token_env} or pass --mcp-url with ?t=<token> for HIS MCP authorization", file=sys.stderr)
        return 2
    work_item_id = (args.work_item_id or "").strip().upper()
    if not work_item_id and not args.archive_dir:
        print("error: work_item_id or --archive-dir is required", file=sys.stderr)
        return 2
    output_dir = Path(args.output_dir or Path.cwd() / (work_item_id or Path(args.archive_dir).name)).expanduser()

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
                    "clientInfo": {"name": "codex-yunxiao-archive-downloader", "version": "0.1"},
                },
            },
            60,
        )
        if not session_id:
            raise RuntimeError(f"MCP initialize did not return Mcp-Session-Id: {init_response}")
        mcp_post(
            mcp_url,
            token,
            {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            60,
            session_id=session_id,
        )

        deadline = time.time() + max(1, args.wait_timeout)
        attempt = 0
        while True:
            attempt += 1
            chunks = []
            metadata = {}
            chunk_index = 0
            while True:
                response, _ = mcp_post(
                    mcp_url,
                    token,
                    {
                        "jsonrpc": "2.0",
                        "id": 10 + chunk_index,
                        "method": "tools/call",
                        "params": {
                            "name": "download_yunxiao_archive",
                            "arguments": {
                                "work_item_id": work_item_id,
                                "archive_dir": args.archive_dir,
                                "include_attachments": not args.no_attachments,
                                "chunk_index": chunk_index,
                                "chunk_size": args.chunk_size,
                                "max_bytes": args.max_bytes,
                            },
                        },
                    },
                    300,
                    session_id=session_id,
                )
                payload = json.loads(extract_tool_text(response))
                if not payload.get("ok"):
                    print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)
                    return 1
                if not metadata:
                    metadata = {k: v for k, v in payload.items() if k != "data_base64"}
                chunks.append(payload.get("data_base64") or "")
                if int(payload.get("chunk_index") or 0) + 1 >= int(payload.get("chunk_count") or 1):
                    break
                chunk_index += 1

            zip_bytes = base64.b64decode("".join(chunks))
            actual_sha = hashlib.sha256(zip_bytes).hexdigest()
            expected_sha = str(metadata.get("zip_sha256") or "")
            if expected_sha and actual_sha != expected_sha:
                message = f"sha256 mismatch on attempt {attempt}; archive may still be changing"
                if args.wait_complete and time.time() < deadline:
                    print(f"{message}; retrying...", file=sys.stderr)
                    time.sleep(max(1, args.poll_interval))
                    continue
                raise RuntimeError(f"{message}: expected {expected_sha}, got {actual_sha}")
            safe_extract_zip(zip_bytes, output_dir)
            ensure_local_attachment_manifest(output_dir, metadata.get("files") or [])
            if args.keep_zip:
                zip_path = output_dir / f"{output_dir.name}.zip"
                zip_path.write_bytes(zip_bytes)
                metadata["local_zip"] = str(zip_path)
            metadata["local_dir"] = str(output_dir)
            metadata["downloaded_chunks"] = len(chunks)
            metadata["archive_quality"] = archive_quality(output_dir, metadata.get("files") or [])
            (output_dir / "_mcp_download_manifest.json").write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            if metadata["archive_quality"]["level"] == "complete" or not args.wait_complete:
                print(json.dumps(metadata, ensure_ascii=False, indent=2))
                if args.require_complete and metadata["archive_quality"]["level"] != "complete":
                    return 1
                return 0
            if time.time() >= deadline:
                print(json.dumps(metadata, ensure_ascii=False, indent=2))
                return 1 if args.require_complete else 0
            print(
                f"archive_quality={metadata['archive_quality']['level']} on attempt {attempt}; waiting for complete archive...",
                file=sys.stderr,
            )
            time.sleep(max(1, args.poll_interval))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        print(f"error: MCP HTTP {exc.code}: {body[:1000]}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
