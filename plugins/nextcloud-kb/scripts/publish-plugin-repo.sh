#!/bin/bash
# Publish the plugin subtree to its standalone install repository.
#
#   scripts/publish-plugin-repo.sh           push plugins/nextcloud-kb → orca-plugin-nextcloud-kb:main
#   scripts/publish-plugin-repo.sh v0.6.0    also create and push a version tag (bump orca-plugin.json first)
#
# Installers resolve the newest version tag when no ref is given, so tag every release.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PLUGIN_PREFIX='plugins/nextcloud-kb'
PLUGIN_REPO='git@github.com:Zhushuaijiang/orca-plugin-nextcloud-kb.git'
SPLIT_BRANCH='kb-plugin-export'
TAG="${1:-}"

cd "$REPO_ROOT"
git subtree split --prefix="$PLUGIN_PREFIX" -b "$SPLIT_BRANCH"
git push --force "$PLUGIN_REPO" "$SPLIT_BRANCH:main"

if [[ -n "$TAG" ]]; then
  git tag -f "$TAG" "$SPLIT_BRANCH"
  git push --force "$PLUGIN_REPO" "$TAG"
  echo "Published $PLUGIN_PREFIX @ $TAG to $PLUGIN_REPO"
else
  echo "Published $PLUGIN_PREFIX to $PLUGIN_REPO (no tag; pass one to publish a release)"
fi
