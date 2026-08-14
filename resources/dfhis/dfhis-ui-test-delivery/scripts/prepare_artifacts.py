from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path


CATEGORIES = (
    "requirements",
    "code-context",
    "testcases",
    "automation",
    "evidence/screenshots",
    "evidence/videos",
    "evidence/network",
    "reports",
    "logs",
)


def normalize_work_item(value: str) -> str:
    work_item = value.strip().upper()
    if not re.fullmatch(r"DFHIS-\d+", work_item):
        raise ValueError("work item must look like DFHIS-31774")
    return work_item


def default_root() -> Path:
    configured = os.getenv("TEST_ARTIFACT_ROOT", "").strip()
    return Path(configured).expanduser() if configured else Path.cwd() / "test-output"


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare DFHIS UI evidence directories")
    parser.add_argument("work_item_id")
    parser.add_argument("--root", type=Path)
    args = parser.parse_args()

    work_item = normalize_work_item(args.work_item_id)
    target = (args.root or default_root()).expanduser().resolve() / work_item
    paths = {}
    for category in CATEGORIES:
        path = target / category
        path.mkdir(parents=True, exist_ok=True)
        paths[category] = str(path)

    print(json.dumps({"workItemId": work_item, "root": str(target), "paths": paths}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
