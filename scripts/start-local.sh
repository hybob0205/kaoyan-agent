#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
run_dir="$project_dir/.run"
backend_port="${APP_PORT:-8003}"
frontend_port="${FRONTEND_PORT:-5175}"
backend_url="http://127.0.0.1:${backend_port}"
frontend_url="http://127.0.0.1:${frontend_port}"

mkdir -p "$run_dir"

if [[ ! -x "$project_dir/backend/.venv/bin/python" ]]; then
  echo "未找到后端虚拟环境。请先按照 README 的后端安装说明创建 backend/.venv 并安装依赖。"
  exit 1
fi

if [[ ! -f "$project_dir/frontend/node_modules/vite/bin/vite.js" ]]; then
  echo "未找到前端依赖。请先进入 frontend 目录运行 pnpm install 或 npm install。"
  exit 1
fi

if ! curl --silent --fail "$backend_url/api/health" >/dev/null; then
  if curl --silent "$backend_url/api/health" >/dev/null; then
    echo "端口 ${backend_port} 已被占用，但不是可用的考研 Agent 后端。请检查占用该端口的程序。"
    exit 1
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    "$project_dir/scripts/start-backend.sh" >"$run_dir/backend.log" 2>&1 &
  else
    nohup "$project_dir/scripts/start-backend.sh" >"$run_dir/backend.log" 2>&1 < /dev/null &
  fi
  echo $! >"$run_dir/backend.pid"
  echo "正在启动后端（${backend_port}）…"
else
  echo "后端已运行（${backend_port}），继续使用现有服务。"
fi

backend_ready=false
for _ in {1..30}; do
  if curl --silent --fail "$backend_url/api/health" >/dev/null; then
    backend_ready=true
    break
  fi
  sleep 1
done
if [[ "$backend_ready" != true ]]; then
  echo "后端未能在 30 秒内就绪。日志位置：$run_dir/backend.log"
  exit 1
fi

if ! curl --silent --fail "$frontend_url/" >/dev/null; then
  if curl --silent "$frontend_url/" >/dev/null; then
    echo "端口 ${frontend_port} 已被占用，但不是可用的前端页面。请检查占用该端口的程序。"
    exit 1
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    FRONTEND_PORT="$frontend_port" "$project_dir/scripts/start-frontend.sh" >"$run_dir/frontend.log" 2>&1 &
  else
    FRONTEND_PORT="$frontend_port" nohup "$project_dir/scripts/start-frontend.sh" >"$run_dir/frontend.log" 2>&1 < /dev/null &
  fi
  echo $! >"$run_dir/frontend.pid"
  echo "正在启动前端（${frontend_port}）…"
else
  echo "前端已运行（${frontend_port}），继续使用现有页面。"
fi

frontend_ready=false
for _ in {1..30}; do
  if curl --silent --fail "$frontend_url/" >/dev/null; then
    frontend_ready=true
    break
  fi
  sleep 1
done
if [[ "$frontend_ready" != true ]]; then
  echo "前端未能在 30 秒内就绪。日志位置：$run_dir/frontend.log"
  exit 1
fi

echo "考研 Agent 已就绪：$frontend_url"
if [[ "$(uname -s)" == "Darwin" ]]; then
  open "$frontend_url"
  if jobs -pr | grep -q .; then
    echo "服务正在运行；关闭此终端窗口即可停止本次启动的服务。"
    wait
  fi
fi
