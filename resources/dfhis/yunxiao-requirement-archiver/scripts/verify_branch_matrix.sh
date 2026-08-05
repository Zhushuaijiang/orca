#!/usr/bin/env bash
# Build-verify a fix across multiple DFHIS requirement-branch worktrees in one pass.
# Replaces the anti-pattern of launching one background build per branch and polling each.
#
# Usage:
#   scripts/verify_branch_matrix.sh <requirement-dir> [-- <build-cmd> ...]
#
# Default build command is detected per worktree from lock files (yarn > pnpm > npm).
# Override with a trailing -- e.g.: verify_branch_matrix.sh ./DFHIS-12345 -- yarn build:prod
#
# Exits non-zero if any branch fails. Prints a summary table at the end.
set -euo pipefail

req_dir="${1:?usage: verify_branch_matrix.sh <requirement-dir> [-- <build-cmd> ...]}"
shift

build_cmd=()
if [[ "${1:-}" == "--" ]]; then
  shift
  build_cmd=("$@")
fi

code_dir="$req_dir/code"
if [[ ! -d "$code_dir" ]]; then
  echo "FAIL: $code_dir not found — run prepare_local_worktree.py first" >&2
  exit 1
fi

shopt -s nullglob
worktrees=("$code_dir"/*/)
if [[ ${#worktrees[@]} -eq 0 ]]; then
  echo "FAIL: no worktrees under $code_dir" >&2
  exit 1
fi

detect_build_cmd() {
  local wt="$1"
  if [[ -f "$wt/yarn.lock" ]]; then
    echo "yarn"
  elif [[ -f "$wt/pnpm-lock.yaml" ]]; then
    echo "pnpm"
  elif [[ -f "$wt/package-lock.json" ]]; then
    echo "npm"
  else
    echo ""
  fi
}

detect_install_cmd() {
  local mgr="$1"
  case "$mgr" in
    yarn) echo "yarn install --frozen-lockfile" ;;
    pnpm) echo "pnpm install --frozen-lockfile" ;;
    npm)  echo "npm ci" ;;
    *)    echo "" ;;
  esac
}

log_dir="$req_dir/evidence/branch-matrix"
mkdir -p "$log_dir"

declare -a results
fail_count=0

for wt in "${worktrees[@]}"; do
  wt="${wt%/}"
  name="$(basename "$wt")"
  log="$log_dir/$name.log"

  if [[ ${#build_cmd[@]} -gt 0 ]]; then
    cmd="${build_cmd[*]}"
  else
    mgr="$(detect_build_cmd "$wt")"
    if [[ -z "$mgr" ]]; then
      results+=("SKIP|$name|no lock file (not a JS frontend worktree)")
      continue
    fi
    install_cmd="$(detect_install_cmd "$mgr")"
    cmd="$install_cmd && $mgr run build 2>/dev/null || $mgr build"
  fi

  echo "=== Building $name ==="
  if bash -c "cd '$wt' && $cmd" >"$log" 2>&1; then
    results+=("PASS|$name|see $log")
    echo "  PASS"
  else
    results+=("FAIL|$name|see $log")
    fail_count=$((fail_count + 1))
    echo "  FAIL (last 5 lines):"
    tail -5 "$log" | sed 's/^/    /'
  fi
done

echo ""
echo "=== Branch Matrix Summary ==="
for r in "${results[@]}"; do
  IFS='|' read -r status name detail <<<"$r"
  printf "  %-6s %s  (%s)\n" "$status" "$name" "$detail"
done
echo ""

if [[ $fail_count -gt 0 ]]; then
  echo "FAIL: $fail_count branch(es) failed"
  exit 1
fi
echo "PASS: all branches built successfully"
