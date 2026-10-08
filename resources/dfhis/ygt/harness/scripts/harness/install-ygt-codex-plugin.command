#!/bin/bash

set -euo pipefail

pause() {
  if [[ -t 0 && "${YGT_INSTALL_NO_PAUSE:-}" != "1" ]]; then
    echo
    read -r -n 1 -p "按任意键关闭窗口..." _
    echo
  fi
}

trap 'status=$?; if [[ $status -ne 0 ]]; then echo; echo "安装失败，退出码：$status"; fi; pause' EXIT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "正在安装 YGT Codex plugin..."
echo "仓库目录：$REPO_ROOT"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node，请先安装 Node.js 或确认 node 在 PATH 中。"
  exit 1
fi

# codex CLI 是可选的：未安装时（如仅使用 Codex 桌面版），
# 安装脚本会自动改用本地 skill 方式安装到 ~/.codex/skills/ygt。
if ! command -v codex >/dev/null 2>&1; then
  echo "提示：PATH 中未找到 codex CLI（Codex 桌面版无需 CLI），将改用本地 skill 方式安装。"
  echo
fi

node "$SCRIPT_DIR/install-ygt-codex-plugin.mjs" "$@"

echo
echo "安装完成。请新开一个 Codex 会话后使用："
echo '  $ygt 菜单接口返回不完整，请排查并修复'
