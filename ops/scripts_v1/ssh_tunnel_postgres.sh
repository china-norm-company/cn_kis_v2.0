#!/bin/bash
# 建立 SSH 隧道：本机 5433 -> 服务器 PostgreSQL 5432
# 使用前请保持 backend/.env 中 DB_HOST=127.0.0.1 DB_PORT=5433（勿设置 USE_SQLITE）
# 用法：在项目根目录执行 ./scripts/ssh_tunnel_postgres.sh，保持终端不关；另开终端跑 migrate/runserver

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -f "$DEPLOY_DIR/deploy/secrets.env" ]; then
  set -a
  source "$DEPLOY_DIR/deploy/secrets.env"
  set +a
fi

USER="${VOLCENGINE_SSH_USER:-root}"
HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
KEY="${VOLCENGINE_SSH_KEY:-}"

echo "隧道: 本机 5433 -> $USER@$HOST 的 PostgreSQL (5432)"
echo "保持本窗口打开；另开终端执行: cd backend && python manage.py migrate subject"
echo "退出隧道请按 Ctrl+C"
echo ""

# ServerAliveInterval=30 每 30 秒发保活包；ServerAliveCountMax=10 连续 10 次无响应才断开；TCPKeepAlive=yes 启用 TCP 保活
SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o TCPKeepAlive=yes"
if [ -n "$KEY" ] && [ -f "$KEY" ]; then
  exec ssh -N -L 5433:localhost:5432 -i "$KEY" $SSH_OPTS "$USER@$HOST"
else
  exec ssh -N -L 5433:localhost:5432 $SSH_OPTS "$USER@$HOST"
fi
