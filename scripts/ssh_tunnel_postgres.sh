#!/bin/bash
# 建立 SSH 隧道：本机 $LOCAL_PORT -> 服务器 PostgreSQL 5432
# 使用前请保持 backend/.env 中 DB_HOST=127.0.0.1 DB_PORT 与 LOCAL_PORT 一致（勿设置 USE_SQLITE）
# 用法：在项目根目录执行 ./scripts/ssh_tunnel_postgres.sh，保持终端不关；另开终端跑 migrate/runserver
#
# 本机端口（本机 5432 被占用时可改为 5433）：
#   SSH_TUNNEL_LOCAL_PORT=5433 ./scripts/ssh_tunnel_postgres.sh
# 并在 backend/.env 中设置 DB_PORT=5433
#
# 调试模式（查看认证后是否成功建立端口转发）：
#   SSH_TUNNEL_DEBUG=1 ./scripts/ssh_tunnel_postgres.sh

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
LOCAL_PORT="${SSH_TUNNEL_LOCAL_PORT:-5432}"
DEBUG="${SSH_TUNNEL_DEBUG:-0}"

echo "隧道: 本机 ${LOCAL_PORT} -> $USER@$HOST 的 PostgreSQL (远端 5432)"
echo "保持本窗口打开；另开终端执行: cd backend && python manage.py migrate"
echo "退出隧道请按 Ctrl+C"
echo ""

# ServerAliveInterval=30 每 30 秒发保活包；ServerAliveCountMax=10 连续 10 次无响应才断开；TCPKeepAlive=yes 启用 TCP 保活
SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o TCPKeepAlive=yes -o ExitOnForwardFailure=yes"
SSH_DEBUG_FLAG=""
if [ "$DEBUG" = "1" ]; then
  SSH_DEBUG_FLAG="-vvv"
  echo "[DEBUG] 已开启 SSH 调试日志 (-vvv)"
  echo "[DEBUG] 目标: $USER@$HOST"
  echo "[DEBUG] 本地端口: $LOCAL_PORT -> 远端 localhost:5432"
  if [ -n "$KEY" ]; then
    if [ -f "$KEY" ]; then
      echo "[DEBUG] 使用密钥: $KEY"
    else
      echo "[DEBUG] 配置了密钥但文件不存在: $KEY"
    fi
  else
    echo "[DEBUG] 未配置密钥，将使用密码认证"
  fi
  echo "[DEBUG] 提示: 看到 'Authenticated to' 且连接不退出，表示密码正确且隧道已建立。"
fi
if [ -n "$KEY" ] && [ -f "$KEY" ]; then
  exec ssh $SSH_DEBUG_FLAG -N -L "${LOCAL_PORT}:localhost:5432" -i "$KEY" $SSH_OPTS "$USER@$HOST"
else
  exec ssh $SSH_DEBUG_FLAG -N -L "${LOCAL_PORT}:localhost:5432" $SSH_OPTS "$USER@$HOST"
fi