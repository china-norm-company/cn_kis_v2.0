#!/bin/bash
# ============================================================================
# 在服务器上为 www.utest.cc / utest.cc 配置 HTTPS（443）- 小程序 API 域名
# 使用付费证书（utest.cc + www.utest.cc），证书需已置于 /etc/nginx/ssl/utest.cc/
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
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"

SSH_KEY="${VOLCENGINE_SSH_KEY:-}"
[ -z "$SSH_KEY" ] && [ -f "/Users/aksu/Downloads/openclaw1.1.pem" ] && SSH_KEY="/Users/aksu/Downloads/openclaw1.1.pem"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
[ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"
if [ -n "$VOLCENGINE_SSH_PASS" ] && command -v sshpass >/dev/null 2>&1; then
  SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS"
  SCP_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' scp $SSH_OPTS"
else
  SSH_CMD="ssh $SSH_OPTS"
  SCP_CMD="scp $SSH_OPTS"
fi

echo "=========================================="
echo "  服务器上配置 www.utest.cc / utest.cc HTTPS"
echo "  目标: $SSH_USER@$SSH_HOST"
echo "=========================================="

echo ""
echo "[1/3] 上传 Nginx 配置..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST 'mkdir -p $REMOTE_DIR/deploy'"
eval "$SCP_CMD deploy/nginx-utest-ssl.conf $SSH_USER@$SSH_HOST:$REMOTE_DIR/deploy/"
echo "  已上传 nginx-utest-ssl.conf"

echo ""
echo "[2/3] 应用配置并启用 443（证书存在时）..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST \"REMOTE_DIR=$REMOTE_DIR bash -s\"" << 'REMOTE'
set -e
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
CERT_DIR="/etc/nginx/ssl/utest.cc"
mkdir -p "$CERT_DIR"
cp "$REMOTE_DIR/deploy/nginx-utest-ssl.conf" /etc/nginx/sites-available/cn-kis-utest-ssl.conf
if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
  ln -sf /etc/nginx/sites-available/cn-kis-utest-ssl.conf /etc/nginx/sites-enabled/cn-kis-utest-ssl.conf
  nginx -t && systemctl reload nginx
  echo "  www.utest.cc / utest.cc HTTPS (443) 已启用"
else
  rm -f /etc/nginx/sites-enabled/cn-kis-utest-ssl.conf 2>/dev/null || true
  echo "  未找到证书，已跳过启用。请将付费证书放到服务器："
  echo "    $CERT_DIR/fullchain.pem"
  echo "    $CERT_DIR/privkey.pem"
  echo "  然后执行: ln -sf /etc/nginx/sites-available/cn-kis-utest-ssl.conf /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
  exit 1
fi
REMOTE

echo ""
echo "[3/3] 验证..."
if eval "$SSH_CMD $SSH_USER@$SSH_HOST" "curl -sI -o /dev/null -w '%{http_code}' --max-time 5 https://127.0.0.1/api/v1/health -k -H 'Host: www.utest.cc'" 2>/dev/null | grep -q 200; then
  echo "  OK: 本机 https://www.utest.cc/api/v1/health 返回 200"
else
  echo "  请在服务器外执行: curl -sI https://www.utest.cc/api/v1/health"
fi
echo ""
echo "服务器端 www.utest.cc 配置已完成。"
echo "小程序 request 域名: https://www.utest.cc"
echo ""
