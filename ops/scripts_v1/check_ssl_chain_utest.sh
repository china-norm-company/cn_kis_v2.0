#!/bin/bash
# 在服务器上检查 www.utest.cc 的 SSL 证书链是否完整（含中间证书）
# 用法：bash scripts/check_ssl_chain_utest.sh  或  SSH_HOST=user@ip bash ...
set -e

SSH_HOST="${SSH_HOST:-root@118.196.64.48}"
SSH_KEY="${VOLCENGINE_SSH_KEY:-}"
[ -z "$SSH_KEY" ] && [ -f "/Users/aksu/Downloads/openclaw1.1.pem" ] && SSH_KEY="/Users/aksu/Downloads/openclaw1.1.pem"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
[ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"

echo "检查 118.196.64.48 上 www.utest.cc 的证书链..."
echo ""

ssh $SSH_OPTS "$SSH_HOST" 'bash -s' << 'REMOTE'
C=0
while read -r line; do
  if [[ "$line" == "-----BEGIN CERTIFICATE-----" ]]; then ((C++)); fi
done < /etc/nginx/ssl/utest.cc/fullchain.pem 2>/dev/null || true

echo "fullchain.pem 中证书数量: $C"
if [[ "$C" -lt 2 ]]; then
  echo "建议: 链中仅 1 张证书，手机/微信可能 TLS 握手失败。请将「中间证书」拼入 fullchain："
  echo "  cat 站点证书.pem 中间证书.pem [根证书.crt] > fullchain.pem"
  echo "然后重新上传并 systemctl reload nginx"
fi

echo ""
echo "首张证书（站点）SAN（应含 www.utest.cc / utest.cc）："
openssl s_client -connect 127.0.0.1:443 -servername www.utest.cc </dev/null 2>/dev/null | \
  openssl x509 -noout -ext subjectAltName 2>/dev/null || echo "（无法连接 443）"
echo ""
echo "首张证书 issuer（应为中间 CA，非根）："
openssl s_client -connect 127.0.0.1:443 -servername www.utest.cc </dev/null 2>/dev/null | \
  openssl x509 -noout -issuer 2>/dev/null
REMOTE

echo ""
echo "完成。若证书数量≥2 且含中间证书，手机端 TLS 应可建立。"
echo ""
