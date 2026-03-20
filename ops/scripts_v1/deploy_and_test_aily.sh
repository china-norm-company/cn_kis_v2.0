#!/bin/bash
# 部署到火山云并运行 Aily 测试
# 用法: ./scripts/deploy_and_test_aily.sh [SSH_HOST]
# 前置: deploy/secrets.env 已配置 SSH 凭据（或通过参数传入主机）
# 火山云服务器 IP 118.196.64.48 已在飞书 IP 白名单中

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 加载 SSH 凭据
if [ -f deploy/secrets.env ]; then
  set -a
  source deploy/secrets.env
  set +a
else
  echo "FAIL: deploy/secrets.env 不存在"
  echo "  复制 deploy/secrets.env.example 为 deploy/secrets.env 并填入 VOLCENGINE_SSH_HOST、VOLCENGINE_SSH_PASS"
  exit 1
fi

SSH_HOST="${1:-$VOLCENGINE_SSH_HOST}"
SSH_HOST="${SSH_HOST:-118.196.64.48}"

if [ "$VOLCENGINE_SSH_PASS" = "请填入服务器root密码" ] || [ -z "$VOLCENGINE_SSH_PASS" ]; then
  if [ -z "$VOLCENGINE_SSH_KEY" ] || [ ! -f "$VOLCENGINE_SSH_KEY" ]; then
    echo "提示: 请在 deploy/secrets.env 中填入 VOLCENGINE_SSH_PASS 或配置 VOLCENGINE_SSH_KEY"
  fi
fi
SSH_USER="${VOLCENGINE_SSH_USER:-root}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
if [ -n "$VOLCENGINE_SSH_KEY" ] && [ -f "$VOLCENGINE_SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $VOLCENGINE_SSH_KEY"
fi

# 密码认证时使用 sshpass（需安装: brew install sshpass）
SSH_CMD="ssh $SSH_OPTS"
SCP_CMD="scp $SSH_OPTS"
if [ -n "$VOLCENGINE_SSH_PASS" ] && command -v sshpass >/dev/null 2>&1; then
  SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS"
  SCP_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' scp $SSH_OPTS"
fi

echo "=== 部署到火山云并运行 Aily 测试 ==="
echo "目标: $SSH_USER@$SSH_HOST"
echo ""

# 1. 同步必要文件到服务器
REMOTE_DIR="/root/CN_KIS_V1.0"
echo ">>> 同步项目文件..."
if ! eval "$SSH_CMD $SSH_USER@$SSH_HOST 'mkdir -p $REMOTE_DIR/scripts $REMOTE_DIR/deploy'" 2>/dev/null; then
  echo ""
  echo "FAIL: SSH 连接失败（Permission denied）"
  echo "  请检查 deploy/secrets.env 中的 VOLCENGINE_SSH_PASS 或 VOLCENGINE_SSH_KEY"
  echo ""
  echo "手动测试方式："
  echo "  1. ssh root@$SSH_HOST"
  echo "  2. 在服务器上: cd $REMOTE_DIR && python3 scripts/test_aily_calendar_query.py"
  echo "  或从本地上传后运行: scp -r scripts deploy root@$SSH_HOST:$REMOTE_DIR/"
  echo ""
  exit 1
fi

if [ -f deploy/.env.volcengine.plan-a ]; then
  eval "$SCP_CMD deploy/.env.volcengine.plan-a $SSH_USER@$SSH_HOST:$REMOTE_DIR/deploy/"
else
  echo "WARN: deploy/.env.volcengine.plan-a 不存在，将使用服务器已有配置"
fi

eval "$SCP_CMD scripts/test_aily_calendar_query.py $SSH_USER@$SSH_HOST:$REMOTE_DIR/scripts/"

# 2. 在服务器上运行测试
echo ""
echo ">>> 在火山云服务器上运行 Aily 测试..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST 'cd $REMOTE_DIR && python3 scripts/test_aily_calendar_query.py'"

echo ""
echo "=== 完成 ==="
