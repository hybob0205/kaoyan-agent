#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir/backend"
python_bin="$project_dir/backend/.venv/bin/python"

if [[ ! -x "$python_bin" ]]; then
  echo "未找到后端虚拟环境：$python_bin"
  echo "请先在 backend 目录创建 .venv 并安装 requirements.txt。"
  exit 1
fi

"$python_bin" -m alembic upgrade head
exec "$python_bin" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "${APP_PORT:-8003}"
