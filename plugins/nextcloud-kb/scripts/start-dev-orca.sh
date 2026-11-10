#!/bin/bash
# One-step launcher for the nextcloud-kb plugin's Orca dev instance.
#
#   scripts/start-dev-orca.sh          start (or reuse) the dev instance + load the plugin
#   scripts/start-dev-orca.sh --stop   stop this instance
#
# Requires the origin/main worktree (default ../orca-main-kb, override with
# ORCA_DEV_WORKTREE) to have been pnpm-installed and CLI-built. The plugin
# approval lives in the dev profile, so no re-approval is needed unless its
# capabilities change.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE="${ORCA_DEV_WORKTREE:-$(cd "$PLUGIN_DIR/.." && pwd)/orca-main-kb}"
CLI="node $WORKTREE/out/cli/index.js"

# Linked-worktree dev profile: <AppSupport>/orca-dev-wt/<sha1(worktree)[:10]>
PROFILE_DIR="$HOME/Library/Application Support/orca-dev-wt/$(printf %s "$WORKTREE" | shasum -a 1 | cut -c1-10)"
export ORCA_USER_DATA_PATH="$PROFILE_DIR"
LOG_FILE="$PROFILE_DIR/dev-orca.log"

if [[ ! -d "$WORKTREE/out/cli" ]]; then
  echo "Missing CLI build: run 'pnpm install && pnpm build:cli' in $WORKTREE first" >&2
  exit 1
fi

if [[ "${1:-}" == "--stop" ]]; then
  pkill -f "$WORKTREE/out/electron-dev" 2>/dev/null || true
  sleep 2
  rm -rf "$PROFILE_DIR/daemon" 2>/dev/null || true
  echo "Stopped the dev Orca instance."
  exit 0
fi

mkdir -p "$PROFILE_DIR"

if ! $CLI plugin dev request . kb.status --data '{}' >/dev/null 2>&1; then
  # Stale metadata from a killed instance makes the CLI think Orca is up; clear it first.
  rm -f "$PROFILE_DIR/orca-runtime.json"
  rm -rf "$PROFILE_DIR/daemon" 2>/dev/null || true
  echo "Starting the dev Orca instance (first build takes 1-2 minutes)..."
  (
    cd "$WORKTREE"
    nohup env ORCA_BACKGROUND_LAUNCH=1 pnpm dev >"$LOG_FILE" 2>&1 &
    disown
  )
  for _ in $(seq 1 60); do
    sleep 5
    [[ -f "$PROFILE_DIR/orca-runtime.json" ]] && break
  done
  # Approval is persisted per profile; a capability change prints --approve below.
  $CLI plugin dev load "$PLUGIN_DIR" >/dev/null 2>&1 || true
fi

echo "Loading the plugin..."
if $CLI plugin dev load "$PLUGIN_DIR" 2>&1 | grep -qE 'local\.nextcloud-kb.*(running|idle)'; then
  echo "OK: nextcloud-kb is loaded (profile: $PROFILE_DIR)"
else
  $CLI plugin dev load "$PLUGIN_DIR" 2>&1 | tail -5
  echo "If an approval is requested, run the printed '--approve <fingerprint>' once." >&2
  exit 1
fi

$CLI plugin dev request . kb.status --data '{}' | tail -8
echo
echo "Open the Orca window and pick the Knowledge Base panel in the right sidebar."
echo "Log: $LOG_FILE"
