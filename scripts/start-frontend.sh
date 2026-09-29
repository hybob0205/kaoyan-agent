#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir/frontend"

vite_entry="$project_dir/frontend/node_modules/vite/bin/vite.js"
bundled_node="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"

if [[ ! -f "$vite_entry" ]]; then
  echo "未找到前端依赖，请先在 frontend 目录安装依赖。"
  exit 1
fi

if [[ -x "$bundled_node" ]]; then
  node_bin="$bundled_node"
elif command -v node >/dev/null 2>&1; then
  node_bin="$(command -v node)"
else
  echo "未找到 Node.js。请安装 Node.js 18 或更高版本。"
  exit 1
fi

exec "$node_bin" "$vite_entry" --host 127.0.0.1 --port "${FRONTEND_PORT:-5175}" --strictPort
