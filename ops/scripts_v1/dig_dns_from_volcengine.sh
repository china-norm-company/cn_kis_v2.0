#!/bin/bash
# ============================================================================
# 在火山云服务器上执行 dig，验证 utest.cc / utest.chat 的 DNS 解析
# 用法: bash scripts/dig_dns_from_volcengine.sh
# ============================================================================
set -e

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$DEPLOY_DIR"

if [ -f deploy/secrets.env ]; then
  set -a
  source deploy/secrets.env
  set +a
fi
SSH_HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
SSH_USER="${VOLCENGINE_SSH_USER:-root}"

SSH_KEY="${VOLCENGINE_SSH_KEY:-}"
[ -z "$SSH_KEY" ] && [ -f "/Users/aksu/Downloads/openclaw1.1.pem" ] && SSH_KEY="/Users/aksu/Downloads/openclaw1.1.pem"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
[ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"
if [ -n "$VOLCENGINE_SSH_PASS" ] && command -v sshpass >/dev/null 2>&1; then
  SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS"
else
  SSH_CMD="ssh $SSH_OPTS"
fi

echo "=========================================="
echo "  火山云服务器上执行 dig（utest.cc / utest.chat）"
echo "  目标: $SSH_USER@$SSH_HOST"
echo "  预期 A 记录: 118.196.64.48"
echo "=========================================="
echo ""

eval "$SSH_CMD $SSH_USER@$SSH_HOST" 'bash -s' << 'REMOTE'
echo "=== 1. 递归解析（使用服务器默认 DNS）==="
for d in utest.cc www.utest.cc utest.chat; do
  echo "--- $d ---"
  dig +short A "$d" 2>/dev/null || nslookup "$d" 2>/dev/null || echo "(dig/nslookup 不可用)"
done

echo ""
echo "=== 2. 权威 NS 查询 ==="
for d in utest.cc utest.chat; do
  echo "--- $d NS ---"
  dig +short NS "$d" 2>/dev/null || echo "(dig 不可用)"
done

echo ""
echo "=== 3. 向公网 DNS 直接查询（8.8.8.8）==="
for d in utest.cc www.utest.cc utest.chat; do
  echo "--- $d @8.8.8.8 ---"
  dig +short @"8.8.8.8" A "$d" 2>/dev/null || echo "(dig 不可用)"
done

echo ""
echo "=== 4. 向阿里 DNS 直接查询（223.5.5.5）==="
for d in utest.cc www.utest.cc utest.chat; do
  echo "--- $d @223.5.5.5 ---"
  dig +short @"223.5.5.5" A "$d" 2>/dev/null || echo "(dig 不可用)"
done

echo ""
echo "=== 5. 本机 curl 验证（若解析正确应返回 200）==="
curl -sI -o /dev/null -w "www.utest.cc/api/v1/health: HTTP %{http_code}\n" --max-time 5 https://www.utest.cc/api/v1/health 2>/dev/null || echo "curl 失败"
REMOTE

echo ""
echo "=========================================="
echo "  执行完成。若 A 记录为 118.196.64.48 则解析正确；"
echo "  若为 198.18.x.x 则说明权威或递归 DNS 异常。"
echo "=========================================="
