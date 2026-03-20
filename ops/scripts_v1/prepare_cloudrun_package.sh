#!/bin/bash
# 准备微信云托管上传包（仅 backend + Dockerfile，避免整仓 node_modules 超限）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="${1:-/tmp/cloudrun-cnkis-deploy}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$PROJECT_ROOT/backend" "$OUT/"
cp "$PROJECT_ROOT/Dockerfile" "$OUT/"

# 云托管容器内无 PostgreSQL，必须使用 SQLite（避免 OperationalError: connection to localhost:5432 refused）
# 写入 backend/.env，供 Django load_dotenv 加载
mkdir -p "$OUT/backend"
cat > "$OUT/backend/.env" << 'ENVEOF'
USE_SQLITE=true
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=*
ENVEOF
# 若项目根或 deploy 有 WECHAT_APPID/SECRET 可在此追加（可选）
if [ -n "${WECHAT_APPID:-}" ]; then echo "WECHAT_APPID=$WECHAT_APPID" >> "$OUT/backend/.env"; fi
if [ -n "${WECHAT_SECRET:-}" ]; then echo "WECHAT_SECRET=$WECHAT_SECRET" >> "$OUT/backend/.env"; fi

# 精简 backend：排除明显不需要的
find "$OUT/backend" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find "$OUT/backend" -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
find "$OUT/backend" -type f -name "*.pyc" -delete 2>/dev/null || true
find "$OUT/backend" -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

echo "$OUT"
du -sh "$OUT" 2>/dev/null || true
