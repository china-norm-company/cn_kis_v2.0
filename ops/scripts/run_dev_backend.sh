#!/usr/bin/env bash
# CN KIS V2 — 本地启动 Django（默认 8001，与 workstations/*/vite 中 /api 代理一致）
#
# 为何不能只「按端口 kill」：
# runserver + StatReloader 时，监听端口的一般是子进程；只杀子进程时父进程会立刻拉起新子进程，
# 端口仍被占用，另一个终端再启会报 "That port is already in use"。
# 因此必须先按「本仓库 manage.py runserver」结束整条进程树，再对残留监听 PID 强杀兜底。
#
# 用法：
#   仓库根：./ops/scripts/run_dev_backend.sh
#   或：pnpm dev:backend
# 换端口：DJANGO_DEV_PORT=8002 ./ops/scripts/run_dev_backend.sh（需同步改前端 Vite 代理）
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$REPO_ROOT/backend"
PORT="${DJANGO_DEV_PORT:-8001}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "未找到 python3。请安装 Python 3（例如: brew install python@3.12）" >&2
  exit 1
fi

# 1) 结束本仓库已存在的 runserver（匹配 backend/manage.py，避免误杀其他项目）
if command -v pkill >/dev/null 2>&1; then
  pkill -f "${BACKEND}/manage.py runserver" 2>/dev/null || true
fi
sleep 0.4

# 2) 端口仍被占用则强杀监听进程（兜底：其他方式起的、或仅残留 listener）
if command -v lsof >/dev/null 2>&1; then
  for _ in 1 2 3; do
    PIDS=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
    if [[ -z "${PIDS:-}" ]]; then
      break
    fi
    for pid in $PIDS; do
      echo "[run_dev_backend] 释放端口 ${PORT}：kill -9 ${pid}" >&2
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 0.3
  done
fi

if command -v lsof >/dev/null 2>&1 && lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[run_dev_backend] 错误：端口 ${PORT} 仍被占用，请手动检查: lsof -nP -iTCP:${PORT} -sTCP:LISTEN" >&2
  exit 1
fi

cd "$BACKEND"
echo "工作目录: $BACKEND"
echo "Python: $(command -v python3) ($(python3 --version 2>&1))"
echo "监听: http://127.0.0.1:${PORT}/"
exec python3 manage.py runserver "$PORT"
