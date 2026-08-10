#!/usr/bin/env python3
"""Prepare a local clone and worktree branch for a DFHIS code fix."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remote", required=True, help="Git remote URL to clone/fetch.")
    parser.add_argument("--repo-dir", required=True, help="Local bare or normal clone cache directory.")
    parser.add_argument("--worktree-dir", required=True, help="Local worktree directory for the fix branch.")
    parser.add_argument("--base-ref", required=True, help="Base ref, usually origin/<release-branch>.")
    parser.add_argument("--branch", required=True, help="Local fix branch to create or reuse.")
    parser.add_argument("--known-hosts", default="", help="Optional workspace-local SSH known_hosts file.")
    parser.add_argument("--identity-file", default="", help="Optional SSH identity file.")
    parser.add_argument("--force-existing-worktree", action="store_true", help="Allow an existing worktree directory.")
    return parser


def git_env(args: argparse.Namespace) -> dict:
    env = os.environ.copy()
    ssh_parts = []
    if args.identity_file:
        ssh_parts.extend(["-i", args.identity_file, "-o", "IdentitiesOnly=yes"])
    if args.known_hosts:
        ssh_parts.extend(["-o", f"UserKnownHostsFile={args.known_hosts}", "-o", "StrictHostKeyChecking=yes"])
    if ssh_parts:
        env["GIT_SSH_COMMAND"] = "ssh " + " ".join(ssh_parts)
    return env


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, check=True)


def infer_work_item(*values: str) -> str:
    for value in values:
        match = re.search(r"DFHIS-\d+", value, re.IGNORECASE)
        if match:
            return match.group(0).upper()
    raise ValueError("could not infer DFHIS work item from --branch or --worktree-dir")


def validate_requirement_worktree_path(worktree_dir: Path, branch: str) -> None:
    work_item = infer_work_item(branch, str(worktree_dir))
    expected_parts = (work_item, "code")
    parts = worktree_dir.parts
    for index in range(len(parts) - 1):
        if parts[index] == expected_parts[0] and parts[index + 1] == expected_parts[1]:
            if len(parts) > index + 2:
                return
    raise ValueError(
        "worktree-dir must be inside the requirement archive code directory, "
        f"for example .../{work_item}/code/<repo>: {worktree_dir}"
    )


def main() -> int:
    args = build_parser().parse_args()
    repo_dir = Path(args.repo_dir).expanduser().resolve()
    worktree_dir = Path(args.worktree_dir).expanduser().resolve()
    env = git_env(args)

    try:
        validate_requirement_worktree_path(worktree_dir, args.branch)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if repo_dir.exists() and not (repo_dir / ".git").exists():
        print(f"error: repo-dir exists but is not a normal Git clone: {repo_dir}", file=sys.stderr)
        return 2

    if not repo_dir.exists():
        repo_dir.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", args.remote, str(repo_dir)], env=env)
    else:
        run(["git", "remote", "set-url", "origin", args.remote], cwd=repo_dir, env=env)
        run(["git", "fetch", "--prune", "origin"], cwd=repo_dir, env=env)

    if worktree_dir.exists():
        if not args.force_existing_worktree:
            print(f"error: worktree-dir already exists: {worktree_dir}", file=sys.stderr)
            return 2
        run(["git", "worktree", "list"], cwd=repo_dir, env=env)
        print(f"worktree already exists: {worktree_dir}")
        return 0

    refs = subprocess.run(
        ["git", "show-ref", "--verify", f"refs/heads/{args.branch}"],
        cwd=str(repo_dir),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    worktree_dir.parent.mkdir(parents=True, exist_ok=True)
    if refs.returncode == 0:
        run(["git", "worktree", "add", str(worktree_dir), args.branch], cwd=repo_dir, env=env)
    else:
        run(["git", "worktree", "add", "-b", args.branch, str(worktree_dir), args.base_ref], cwd=repo_dir, env=env)

    run(["git", "status", "--short"], cwd=worktree_dir, env=env)
    run(["git", "branch", "--show-current"], cwd=worktree_dir, env=env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
