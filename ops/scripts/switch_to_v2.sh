#!/bin/bash
# =============================================================
# CN KIS V2.0 — 火山云生产环境切换脚本
# 用途：将 Nginx 流量从 V1（端口 8001）切换到 V2（端口 8002）
# 使用：bash ops/scripts/switch_to_v2.sh
# 回滚：bash ops/scripts/switch_to_v2.sh --rollback
# =============================================================
set -euo pipefail

NGINX_CONF="/etc/nginx/sites-available/cn-kis.conf"
V2_BACKEND_PORT=8002
V1_BACKEND_PORT=8001
V2_DEPLOY_PATH="/opt/cn-kis-v2/backend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

ROLLBACK=false
[[ "${1:-}" == "--rollback" ]] && ROLLBACK=true

# ─── 回滚模式 ────────────────────────────────────────────────
if $ROLLBACK; then
    warn "执行回滚：将 Nginx upstream 切回 V1（端口 $V1_BACKEND_PORT）"
    sudo sed -i "s/server 127.0.0.1:$V2_BACKEND_PORT/server 127.0.0.1:$V1_BACKEND_PORT/" "$NGINX_CONF"
    sudo nginx -t && sudo systemctl reload nginx
    info "回滚完成。V1 接管流量（端口 $V1_BACKEND_PORT）。"
    exit 0
fi

# ─── 切换前检查 ───────────────────────────────────────────────
info "=== 切换前检查 ==="

# 1. 检查 V2 进程是否运行
if ! curl -sf "http://127.0.0.1:$V2_BACKEND_PORT/api/v1/health" > /dev/null 2>&1; then
    error "V2 后端（端口 $V2_BACKEND_PORT）健康检查失败。请先启动 V2 服务再切换。"
fi
info "✅ V2 后端健康检查通过（端口 $V2_BACKEND_PORT）"

# 2. 检查生产 .env 不含测试专用开关
ENV_FILE="$V2_DEPLOY_PATH/.env"
if [[ -f "$ENV_FILE" ]]; then
    if grep -q "CELERY_PRODUCTION_TASKS_DISABLED=true" "$ENV_FILE"; then
        error ".env 中仍有 CELERY_PRODUCTION_TASKS_DISABLED=true，生产环境必须删除此行。"
    fi
    info "✅ .env 检查通过（无测试专用禁用开关）"

    REDIS_URL=$(grep "^REDIS_URL=" "$ENV_FILE" | cut -d'=' -f2-)
    if [[ "$REDIS_URL" == *"/1"* ]]; then
        warn "REDIS_URL 仍在使用 DB 1（测试库），建议改为 /0"
    fi

    KB_COLLECTION=$(grep "^VOLCENGINE_KB_COLLECTION=" "$ENV_FILE" | cut -d'=' -f2-)
    if [[ "$KB_COLLECTION" == *"test"* ]]; then
        warn "VOLCENGINE_KB_COLLECTION=$KB_COLLECTION 包含 'test'，确认生产集合名正确"
    fi
else
    error ".env 文件不存在：$ENV_FILE"
fi

# 3. 检查 Celery Worker 和 Beat 是否运行
if ! systemctl is-active --quiet cn-kis-v2-celery-worker 2>/dev/null; then
    warn "Celery Worker 未运行（cn-kis-v2-celery-worker），飞书采集/token 健康检查将不可用"
fi
if ! systemctl is-active --quiet cn-kis-v2-celery-beat 2>/dev/null; then
    warn "Celery Beat 未运行（cn-kis-v2-celery-beat），定时任务将不可用"
fi

# ─── 执行切换 ────────────────────────────────────────────────
info ""
info "=== 开始切换 ==="

# 备份 Nginx 配置
sudo cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d_%H%M%S)"
info "✅ Nginx 配置已备份"

# 修改 upstream 端口
sudo sed -i "s/server 127.0.0.1:$V1_BACKEND_PORT/server 127.0.0.1:$V2_BACKEND_PORT/" "$NGINX_CONF"

# 测试配置有效性
if ! sudo nginx -t 2>/dev/null; then
    # 回滚 Nginx
    sudo cp "${NGINX_CONF}.bak.$(date +%Y%m%d_%H%M%S)" "$NGINX_CONF" 2>/dev/null || true
    error "Nginx 配置测试失败，已中止切换"
fi

sudo systemctl reload nginx
info "✅ Nginx 已重载，V2（端口 $V2_BACKEND_PORT）接管流量"

# ─── 切换后验证 ───────────────────────────────────────────────
info ""
info "=== 切换后验证 ==="
sleep 2

HEALTH=$(curl -sf "https://china-norm.com/api/v1/health" 2>/dev/null || \
         curl -sf "http://118.196.64.48/api/v1/health" 2>/dev/null || echo "FAIL")

if echo "$HEALTH" | grep -q "healthy"; then
    info "✅ 生产健康检查通过：$HEALTH"
else
    warn "⚠️  健康检查返回异常，请手动检查："
    warn "   curl -f http://118.196.64.48/api/v1/health"
fi

echo ""
info "=== 切换完成 ==="
info "流量已切换到 V2（端口 $V2_BACKEND_PORT）"
info "如需回滚：bash ops/scripts/switch_to_v2.sh --rollback"
