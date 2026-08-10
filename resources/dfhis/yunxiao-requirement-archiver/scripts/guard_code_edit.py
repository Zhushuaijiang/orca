#!/usr/bin/env python3
"""Reject DFHIS code edits outside a requirement-specific worktree."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


WORK_ITEM_RE = re.compile(r"DFHIS-\d+", re.IGNORECASE)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--requirement-dir",
        default="",
        help="Requirement archive directory. Defaults to the nearest DFHIS-* ancestor of cwd.",
    )
    parser.add_argument(
        "--work-item",
        default="",
        help="DFHIS work item id. Defaults to the id inferred from --requirement-dir or cwd.",
    )
    parser.add_argument(
        "paths",
        nargs="+",
        help="Code file or directory paths that are about to be edited.",
    )
    return parser


def run_stdout(cmd: list[str], cwd: Path) -> str:
    return subprocess.check_output(cmd, cwd=str(cwd), text=True).strip()


def nearest_requirement_dir(start: Path) -> Path:
    for path in [start, *start.parents]:
        if WORK_ITEM_RE.fullmatch(path.name):
            return path
    raise ValueError("could not infer requirement directory; pass --requirement-dir")


def infer_work_item(requirement_dir: Path, explicit: str) -> str:
    if explicit:
        if not WORK_ITEM_RE.fullmatch(explicit):
            raise ValueError(f"invalid work item id: {explicit}")
        return explicit.upper()
    match = WORK_ITEM_RE.fullmatch(requirement_dir.name)
    if not match:
        raise ValueError("could not infer DFHIS work item from requirement directory")
    return match.group(0).upper()


def git_root_for(path: Path) -> Path:
    cwd = path if path.is_dir() else path.parent
    return Path(run_stdout(["git", "rev-parse", "--show-toplevel"], cwd)).resolve()


def validate_path(path: Path, requirement_dir: Path, work_item: str) -> None:
    path = path.expanduser().resolve()
    requirement_dir = requirement_dir.expanduser().resolve()
    code_dir = requirement_dir / "code"

    if not path.exists():
        raise ValueError(f"path does not exist: {path}")
    if not path.is_relative_to(code_dir):
        raise ValueError(f"refusing to edit outside {code_dir}: {path}")

    root = git_root_for(path)
    if not root.is_relative_to(code_dir):
        raise ValueError(f"git root is outside requirement code dir: {root}")

    branch = run_stdout(["git", "branch", "--show-current"], root)
    allowed = {f"feature-{work_item}", f"hotfix-{work_item}"}
    if branch not in allowed:
        raise ValueError(f"branch must be one of {sorted(allowed)}, got {branch!r} in {root}")


def main() -> int:
    args = build_parser().parse_args()
    try:
        requirement_dir = (
            Path(args.requirement_dir).expanduser().resolve()
            if args.requirement_dir
            else nearest_requirement_dir(Path.cwd().resolve())
        )
        work_item = infer_work_item(requirement_dir, args.work_item)
        for item in args.paths:
            validate_path(Path(item), requirement_dir, work_item)
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"ok: code edit allowed under {requirement_dir / 'code'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
