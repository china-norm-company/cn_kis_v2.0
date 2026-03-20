#!/bin/bash
# 在火山云服务器上运行 Aily 测试（免部署：仅同步脚本后执行）
# 用法: ./scripts/run_aily_test_via_ssh.sh
# 前置: deploy/secrets.env 已配置 SSH 凭据

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -f deploy/secrets.env ]; then
  set -a
  source deploy/secrets.env
  set +a
fi

SSH_HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
SSH_USER="${VOLCENGINE_SSH_USER:-root}"
REMOTE_DIR="/root/CN_KIS_V1.0"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
[ -n "$VOLCENGINE_SSH_KEY" ] && [ -f "$VOLCENGINE_SSH_KEY" ] && SSH_OPTS="$SSH_OPTS -i $VOLCENGINE_SSH_KEY"

SSH_CMD="ssh $SSH_OPTS"
SCP_CMD="scp $SSH_OPTS"
[ -n "$VOLCENGINE_SSH_PASS" ] && command -v sshpass >/dev/null 2>&1 && {
  SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS"
  SCP_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' scp $SSH_OPTS"
}

echo "=== 在火山云 $SSH_HOST 上运行 Aily 测试（免完整部署）==="
eval "$SSH_CMD $SSH_USER@$SSH_HOST 'mkdir -p $REMOTE_DIR/scripts $REMOTE_DIR/deploy'" 2>/dev/null || {
  echo "FAIL: SSH 连接失败，请检查 deploy/secrets.env"
  exit 1
}

[ -f deploy/.env.volcengine.plan-a ] && eval "$SCP_CMD deploy/.env.volcengine.plan-a $SSH_USER@$SSH_HOST:$REMOTE_DIR/deploy/"
eval "$SCP_CMD scripts/test_aily_calendar_query.py $SSH_USER@$SSH_HOST:$REMOTE_DIR/scripts/"

echo ""
eval "$SSH_CMD $SSH_USER@$SSH_HOST 'cd $REMOTE_DIR && python3 scripts/test_aily_calendar_query.py'"
echo ""
echo "=== 完成 ==="
