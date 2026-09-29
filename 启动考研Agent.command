#!/usr/bin/env bash
project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

./scripts/start-local.sh
status=$?
if [[ "$status" -ne 0 ]]; then
  read -r -p "启动未完成。按回车关闭此窗口。"
fi
exit "$status"
