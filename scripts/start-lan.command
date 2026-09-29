#!/usr/bin/env bash
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
"$project_dir/scripts/start-lan.sh"
status=$?
if [[ $status -ne 0 ]]; then
  echo "按回车键关闭此窗口。"
  read -r
fi
exit "$status"
