#!/bin/bash
# ============================================================================
# 在服务器上为 mini.china-norm.com 配置 HTTPS（443）
# 步骤：上传 Nginx 配置 → 启用 ACME 目录 → 申请证书 → 启用 443 → 重载 Nginx
# 前置：域名 mini.china-norm.com 已 A 记录解析到服务器 IP；ICP 备案已通过
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

# 默认部署到腾讯云（与云托管同机房，延迟更低）；可改为火山云
SSH_HOST="${CHINA_NORM_SSH_HOST:-${TENCENT_SSH_HOST:-118.25.182.215}}"
SSH_USER="${CHINA_NORM_SSH_USER:-${TENCENT_SSH_USER:-root}}"
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
DOMAIN="mini.china-norm.com"
EMAIL="${LETSENCRYPT_EMAIL:-admin@china-norm.com}"

SSH_KEY="${CHINA_NORM_SSH_KEY:-${TENCENT_SSH_KEY:-}}"
[ -z "$SSH_KEY" ] && [ -f "/Users/aksu/Downloads/utest.pem" ] && SSH_KEY="/Users/aksu/Downloads/utest.pem"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
[ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"
SSH_CMD="ssh $SSH_OPTS"
SCP_CMD="scp $SSH_OPTS"

echo "=========================================="
echo "  服务器上配置 ${DOMAIN} HTTPS"
echo "  目标: ${SSH_USER}@${SSH_HOST}"
echo "=========================================="

# ---- 1. 上传 Nginx 配置 ----
echo ""
echo "[1/5] 上传 Nginx 配置..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST 'mkdir -p $REMOTE_DIR/deploy'"
eval "$SCP_CMD deploy/nginx.conf deploy/nginx-china-norm-ssl.conf $SSH_USER@$SSH_HOST:$REMOTE_DIR/deploy/"
echo "  已上传 nginx.conf、nginx-china-norm-ssl.conf"

# ---- 2. 服务器端：应用 80 配置并创建 ACME 目录 ----
echo ""
echo "[2/5] 应用 Nginx 80 配置并创建 ACME 目录..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST \"REMOTE_DIR=$REMOTE_DIR DOMAIN=$DOMAIN bash -s\"" << 'REMOTE1'
set -e
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
DOMAIN="${DOMAIN:-mini.china-norm.com}"

cp "$REMOTE_DIR/deploy/nginx.conf" /etc/nginx/sites-available/cn-kis.conf 2>/dev/null || \
  cp "$REMOTE_DIR/deploy/nginx.conf" /etc/nginx/conf.d/cn-kis.conf
CONF_PATH="/etc/nginx/sites-available/cn-kis.conf"
[ ! -f "$CONF_PATH" ] && CONF_PATH="/etc/nginx/conf.d/cn-kis.conf"

sed -i "s/server_name localhost;/server_name $DOMAIN;/" "$CONF_PATH"
[ -d /etc/nginx/sites-enabled ] && ln -sf "$CONF_PATH" /etc/nginx/sites-enabled/cn-kis.conf
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
DOMAIN="${DOMAIN:-mini.china-norm.com}"
EMAIL="${EMAIL:-admin@china-norm.com}"
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
echo "[4/5] 启用 ${DOMAIN} 的 443 配置..."
eval "$SSH_CMD $SSH_USER@$SSH_HOST \"REMOTE_DIR=$REMOTE_DIR bash -s\"" << 'REMOTE3'
set -e
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis}"
SSL_CONF="$REMOTE_DIR/deploy/nginx-china-norm-ssl.conf"
if [ -d /etc/nginx/sites-available ]; then
  cp "$SSL_CONF" /etc/nginx/sites-available/cn-kis-china-norm-ssl.conf
  ln -sf /etc/nginx/sites-available/cn-kis-china-norm-ssl.conf /etc/nginx/sites-enabled/cn-kis-china-norm-ssl.conf
else
  cp "$SSL_CONF" /etc/nginx/conf.d/cn-kis-china-norm-ssl.conf
fi
nginx -t && systemctl reload nginx
echo "  443 已启用并重载 Nginx"
REMOTE3

# ---- 5. 验证 ----
echo ""
echo "[5/5] 验证 HTTPS..."
if curl -sI --max-time 10 "https://$DOMAIN/api/v1/health" 2>/dev/null | head -1 | grep -q "200\|301\|302"; then
  echo "  OK: https://$DOMAIN/api/v1/health 可达"
else
  echo "  HTTPS 验证未通过（可能 DNS 尚未完全生效），请稍后执行:"
  echo "  DOMAIN=$DOMAIN bash scripts/check_wechat_network_chain.sh"
fi
echo ""
echo "服务器上 HTTPS 配置已完成。"
echo "小程序 request 域名: https://$DOMAIN"
echo ""
