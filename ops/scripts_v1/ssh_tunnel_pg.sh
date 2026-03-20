#!/usr/bin/env bash
# 建立到远程 PostgreSQL 的 SSH 隧道，供研究台 backend 连接远程库使用。
# 使用前请先建立隧道，再在 backend/.env 中设置 USE_SQLITE=false 且 DB_HOST=localhost DB_PORT=5433。
# 详见：docs/研究台-接入远程PostgreSQL.md

set -e
REMOTE_USER="${SSH_PG_USER:-root}"
REMOTE_HOST="${SSH_PG_HOST:-118.196.64.48}"
REMOTE_PG_PORT="${SSH_PG_REMOTE_PORT:-5432}"
LOCAL_PORT="${SSH_PG_LOCAL_PORT:-5433}"

echo "Starting SSH tunnel: localhost:${LOCAL_PORT} -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PG_PORT}"
echo "Keep this terminal open. Use DB_HOST=localhost DB_PORT=${LOCAL_PORT} in backend/.env"
exec ssh -N -L "${LOCAL_PORT}:localhost:${REMOTE_PG_PORT}" "${REMOTE_USER}@${REMOTE_HOST}"
