#!/bin/bash
# ============================================================================
# 将本地的 utest.cc 证书上传到服务器并启用 www.utest.cc HTTPS
# 用法: CERT_DIR=/path/to/cert/dir bash scripts/upload_utest_cert_and_enable.sh
#       该目录下需有 fullchain.pem 与 privkey.pem（或 证书.pem + 私钥.pem）
# ============================================================================
set -e

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$DEPLOY_DIR"
CERT_DIR="${CERT_DIR:?请设置 CERT_DIR=证书所在目录，目录内需有 fullchain.pem 与 privkey.pem}"

if [ ! -f "$CERT_DIR/fullchain.pem" ] && [ ! -f "$CERT_DIR/证书.pem" ]; then
  echo "未找到 $CERT_DIR/fullchain.pem 或 证书.pem"
  exit 1
fi
if [ ! -f "$CERT_DIR/privkey.pem" ] && [ ! -f "$CERT_DIR/私钥.pem" ]; then
  echo "未找到 $CERT_DIR/privkey.pem 或 私钥.pem"
  exit 1
fi

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
  SCP_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' scp $SSH_OPTS"
  SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS"
else
  SCP_CMD="scp $SSH_OPTS"
  SSH_CMD="ssh $SSH_OPTS"
fi

FULLCHAIN="$CERT_DIR/fullchain.pem"
PRIVKEY="$CERT_DIR/privkey.pem"
[ ! -f "$FULLCHAIN" ] && FULLCHAIN="$CERT_DIR/证书.pem"
[ ! -f "$PRIVKEY" ] && PRIVKEY="$CERT_DIR/私钥.pem"

REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
echo "上传证书与 Nginx 配置到 $SSH_USER@$SSH_HOST ..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST 'mkdir -p /etc/nginx/ssl/utest.cc $REMOTE_DIR/deploy'"
eval "$SCP_CMD \"$FULLCHAIN\" $SSH_USER@$SSH_HOST:/etc/nginx/ssl/utest.cc/fullchain.pem"
eval "$SCP_CMD \"$PRIVKEY\" $SSH_USER@$SSH_HOST:/etc/nginx/ssl/utest.cc/privkey.pem"
eval "$SCP_CMD deploy/nginx-utest-ssl.conf $SSH_USER@$SSH_HOST:$REMOTE_DIR/deploy/"
eval "$SSH_CMD $SSH_USER@$SSH_HOST \"chmod 644 /etc/nginx/ssl/utest.cc/fullchain.pem && chmod 600 /etc/nginx/ssl/utest.cc/privkey.pem\""
echo "证书已上传，正在应用配置并启用 443..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST" \"cp $REMOTE_DIR/deploy/nginx-utest-ssl.conf /etc/nginx/sites-available/cn-kis-utest-ssl.conf \&\& ln -sf /etc/nginx/sites-available/cn-kis-utest-ssl.conf /etc/nginx/sites-enabled/ \&\& nginx -t \&\& systemctl reload nginx\"
echo "完成。请验证: curl -sI https://www.utest.cc/api/v1/health"
echo ""
