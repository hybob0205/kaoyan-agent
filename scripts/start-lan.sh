#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
python_bin="$project_dir/backend/.venv/bin/python"
if [[ ! -x "$python_bin" ]]; then
  echo "未找到后端虚拟环境。请先按 README 安装后端依赖。"
  exit 1
fi
exec "$python_bin" "$project_dir/scripts/start_lan.py"
