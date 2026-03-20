#!/bin/bash
# 微信云托管 cnkis 服务部署（使用 deploy/secrets.env 中的 CLI 凭据，自动登录 + 非交互部署）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -f deploy/secrets.env ]; then
  set -a
  source deploy/secrets.env
  set +a
fi

CLOUDRUN_ENV_ID="${CLOUDRUN_ENV_ID:-prod-3gfhkz1551e76534}"
CLOUDRUN_SERVICE="${CLOUDRUN_SERVICE:-utest}"

if ! command -v wxcloud &>/dev/null; then
  echo "FAIL: 未找到 wxcloud，请先安装: npm install -g @wxcloud/cli"
  exit 1
fi

# 使用 secrets.env 中的凭据登录（若已配置）
if [ -n "${CLOUDRUN_APP_ID:-}" ] && [ -n "${CLOUDRUN_PRIVATE_KEY:-}" ]; then
  echo "使用 deploy/secrets.env 中的云托管凭据登录..."
  wxcloud login -a "$CLOUDRUN_APP_ID" -k "$CLOUDRUN_PRIVATE_KEY" || true
fi

echo "=== 微信云托管部署 ==="
echo "环境: $CLOUDRUN_ENV_ID  服务: $CLOUDRUN_SERVICE"

# 精简部署包（仅 backend + Dockerfile），避免整仓上传超 maxBodyLength
CLOUDRUN_PKG="/tmp/cloudrun-cnkis-deploy"
bash "$SCRIPT_DIR/prepare_cloudrun_package.sh" "$CLOUDRUN_PKG"
echo "从精简包上传: $CLOUDRUN_PKG"
echo ""

# 在部署包目录下执行 deploy（expect 里 spawn 的 . 即为此目录）
chmod +x "$SCRIPT_DIR/cloudrun_deploy_expect.sh"
cd "$CLOUDRUN_PKG"
exec "$SCRIPT_DIR/cloudrun_deploy_expect.sh" "$CLOUDRUN_ENV_ID" "$CLOUDRUN_SERVICE"
