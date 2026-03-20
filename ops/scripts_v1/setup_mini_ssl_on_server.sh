#!/bin/bash
# ============================================================================
# 在服务器 118.196.64.48 上为 mini.utest.cc 配置 HTTPS（443）
# 步骤：上传 Nginx 配置 → 启用 ACME 目录 → 申请证书 → 启用 443 → 重载 Nginx
# 前置：域名 mini.utest.cc 已解析到服务器 IP；防火墙/安全组已放行 80、443
# ============================================================================
set -e

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$DEPLOY_DIR"

# ---- SSH 凭据 ----
if [ -f deploy/secrets.env ]; then
  set -a
  source deploy/secrets.env
  set +a
fi
SSH_HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
SSH_USER="${VOLCENGINE_SSH_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
DOMAIN="${DOMAIN:-mini.utest.cc}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@mini.utest.cc}"

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
if [ -z "$SSH_KEY" ] || [ ! -f "$SSH_KEY" ]; then
  echo "提示: 未配置 SSH 密钥，请设置 VOLCENGINE_SSH_KEY 或 VOLCENGINE_SSH_PASS（需 sshpass）"
fi

echo "=========================================="
echo "  服务器上配置 mini.utest.cc HTTPS"
echo "  目标: $SSH_USER@$SSH_HOST"
echo "=========================================="

# ---- 1. 上传 Nginx 配置 ----
echo ""
echo "[1/5] 上传 Nginx 配置..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST 'mkdir -p $REMOTE_DIR/deploy'"
eval "$SCP_CMD deploy/nginx.conf deploy/nginx-mini-ssl.conf $SSH_USER@$SSH_HOST:$REMOTE_DIR/deploy/"
echo "  已上传 nginx.conf、nginx-mini-ssl.conf"

# ---- 2. 服务器端：应用 80 配置并创建 ACME 目录 ----
echo ""
echo "[2/5] 应用 Nginx 80 配置并创建 ACME 目录..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST \"REMOTE_DIR=$REMOTE_DIR DOMAIN=$DOMAIN bash -s\"" << 'REMOTE1'
set -e
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
DOMAIN="${DOMAIN:-mini.utest.cc}"

cp "$REMOTE_DIR/deploy/nginx.conf" /etc/nginx/sites-available/cn-kis.conf
sed -i "s/server_name localhost;/server_name 118.196.64.48 $DOMAIN;/" /etc/nginx/sites-available/cn-kis.conf
grep -q 'access_log /var/log/nginx/cn-kis-access' /etc/nginx/sites-available/cn-kis.conf || \
  sed -i '/charset utf-8;/a\    access_log /var/log/nginx/cn-kis-access.log;\n    error_log /var/log/nginx/cn-kis-error.log;' /etc/nginx/sites-available/cn-kis.conf
ln -sf /etc/nginx/sites-available/cn-kis.conf /etc/nginx/sites-enabled/cn-kis.conf
mkdir -p /var/www/letsencrypt
chown www-data:www-data /var/www/letsencrypt 2>/dev/null || chown nginx:nginx /var/www/letsencrypt 2>/dev/null || true
nginx -t && systemctl reload nginx
echo "  Nginx 80 已重载，ACME 目录已就绪"
REMOTE1

# ---- 3. 申请证书（certbot） ----
echo ""
echo "[3/5] 申请 Let's Encrypt 证书（certbot）..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST \"DOMAIN=$DOMAIN EMAIL=$EMAIL bash -s\"" << 'REMOTE2'
set -e
DOMAIN="${DOMAIN:-mini.utest.cc}"
EMAIL="${EMAIL:-admin@mini.utest.cc}"
if command -v certbot >/dev/null 2>&1; then
  certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" 2>/dev/null || \
  certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" --non-interactive --register-unsafely-without-email 2>/dev/null || true
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "  证书已签发: /etc/letsencrypt/live/$DOMAIN/"
  else
    echo "  certbot 未成功签发证书，请检查域名解析与 80 端口可达性"
    exit 1
  fi
else
  echo "  未检测到 certbot，尝试安装..."
  (apt-get update -qq && apt-get install -y -qq certbot) 2>/dev/null || (yum install -y -q certbot 2>/dev/null) || true
  if command -v certbot >/dev/null 2>&1; then
    certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" 2>/dev/null || \
    certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" --non-interactive --register-unsafely-without-email 2>/dev/null || true
    [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] && echo "  证书已签发" || exit 1
  else
    echo "  无法安装 certbot，请手动在服务器上安装并运行: certbot certonly --webroot -w /var/www/letsencrypt -d $DOMAIN"
    exit 1
  fi
fi
REMOTE2

# ---- 4. 启用 443 站点并重载 ----
echo ""
echo "[4/5] 启用 mini.utest.cc 的 443 配置..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST \"REMOTE_DIR=$REMOTE_DIR bash -s\"" << 'REMOTE3'
set -e
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
cp "$REMOTE_DIR/deploy/nginx-mini-ssl.conf" /etc/nginx/sites-available/cn-kis-mini-ssl.conf
ln -sf /etc/nginx/sites-available/cn-kis-mini-ssl.conf /etc/nginx/sites-enabled/cn-kis-mini-ssl.conf
nginx -t && systemctl reload nginx
echo "  443 已启用并重载 Nginx"
REMOTE3

# ---- 5. 验证 ----
echo ""
echo "[5/5] 验证 HTTPS..."
if curl -sI --max-time 10 "https://$DOMAIN/api/v1/health" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
  echo "  OK: https://$DOMAIN/api/v1/health 可达"
else
  echo "  请本地执行: bash scripts/check_wechat_network_chain.sh"
fi
echo ""
echo "服务器上 HTTPS 配置已完成。"
echo "小程序 request 域名请使用: https://$DOMAIN/api/v1"
echo ""
