#!/usr/bin/env bash
# =============================================================================
# deploy_and_run_integration_test.sh
#
# 功能：将最新代码和测试脚本部署到生产服务器，并执行全量集成测试
#
# 用法（在本地 /Users/aksu/Cursor/CN_KIS_V2.0 目录运行）：
#   bash ops/scripts/deploy_and_run_integration_test.sh [选项]
#
# 选项：
#   --dry-run        只做断言验收，不执行注入命令
#   --skip-phase N   跳过指定 Phase（可多次使用）
#   --token JWT      传入 E2E smoke test 的 JWT Token
#   --phase N        只运行指定 Phase（0-5）
#
# 生产服务器：118.196.64.48
# 报告路径：服务器 /tmp/integration_test_YYYYMMDD_HHMMSS.md
#           本地    docs/acceptance/DATA_INTEGRATION_TEST_REPORT_YYYYMMDD.md
# =============================================================================

set -euo pipefail

SSH_KEY="$HOME/.ssh/openclaw1.1.pem"
SERVER="root@118.196.64.48"
SERVER_BACKEND="/opt/cn-kis-v2/backend"
SERVER_SCRIPTS="/opt/cn-kis-v2/ops/scripts"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DRY_RUN=false
PHASE=""
TOKEN=""

# ── 颜色 ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

# ── 参数解析 ──────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)   DRY_RUN=true; shift ;;
        --phase)     PHASE="$2"; shift 2 ;;
        --token)     TOKEN="$2"; shift 2 ;;
        *) warn "未知参数: $1"; shift ;;
    esac
done

EXTRA_ARGS=""
[[ "$DRY_RUN" == "true" ]] && EXTRA_ARGS="$EXTRA_ARGS --dry-run"
[[ -n "$PHASE" ]] && EXTRA_ARGS="$EXTRA_ARGS --phase $PHASE"
[[ -n "$TOKEN" ]] && EXTRA_ARGS="$EXTRA_ARGS --token $TOKEN"

log "=== CN KIS V2.0 全量集成测试部署 + 执行 ==="
log "服务器: $SERVER"
log "时间戳: $TIMESTAMP"
log "DRY_RUN: $DRY_RUN"

# ── Step 1: 同步关键文件到服务器 ──────────────────────────────────────────────
log "Step 1: 同步测试脚本到服务器..."

# 同步 ops/scripts 目录（测试脚本）
rsync -avz --progress \
    -e "ssh -i $SSH_KEY" \
    --include="full_integration_validation.py" \
    --include="import_nas_comprehensive.py" \
    --include="import_nas_honorarium_standalone.py" \
    --include="import_nas_project_appointments.py" \
    --include="inject_system_full.py" \
    --include="link_global_integration.py" \
    --include="activate_im_data.sh" \
    --include="verify_knowledge_assets.py" \
    --include="e2e_smoke_test.py" \
    --exclude="*" \
    ops/scripts/ \
    "$SERVER:$SERVER_SCRIPTS/"

# 同步后端新增管理命令
log "Step 1b: 同步后端管理命令..."
rsync -avz \
    -e "ssh -i $SSH_KEY" \
    backend/apps/data_intake/learning_runner.py \
    "$SERVER:$SERVER_BACKEND/apps/data_intake/"

rsync -avz \
    -e "ssh -i $SSH_KEY" \
    backend/apps/knowledge/api_system_pulse.py \
    "$SERVER:$SERVER_BACKEND/apps/knowledge/"

rsync -avz \
    -e "ssh -i $SSH_KEY" \
    backend/apps/secretary/management/commands/reconcile_mail_signals.py \
    backend/apps/secretary/management/commands/sync_learning_to_agent.py \
    "$SERVER:$SERVER_BACKEND/apps/secretary/management/commands/"

rsync -avz \
    -e "ssh -i $SSH_KEY" \
    backend/apps/subject/management/commands/build_subject_intelligence.py \
    "$SERVER:$SERVER_BACKEND/apps/subject/management/commands/"

log "Step 1 完成"

# ── Step 2: 检查服务器 Django 环境 ────────────────────────────────────────────
log "Step 2: 检查服务器 Django 环境..."
ssh -i "$SSH_KEY" "$SERVER" << 'REMOTE_CHECK'
    set -e
    cd /opt/cn-kis-v2/backend
    source .venv/bin/activate 2>/dev/null || source venv/bin/activate 2>/dev/null || true
    python manage.py check --deploy 2>&1 | tail -5
REMOTE_CHECK
log "Step 2 完成"

# ── Step 3: 运行数据库迁移（如有新迁移文件）──────────────────────────────────
log "Step 3: 检查并应用迁移..."
ssh -i "$SSH_KEY" "$SERVER" << 'REMOTE_MIGRATE'
    set -e
    cd /opt/cn-kis-v2/backend
    source .venv/bin/activate 2>/dev/null || source venv/bin/activate 2>/dev/null || true
    python manage.py migrate --check && echo "无待应用迁移" || (echo "发现待迁移，正在应用..." && python manage.py migrate --noinput)
REMOTE_MIGRATE
log "Step 3 完成"

# ── Step 4: 执行全量集成测试 ──────────────────────────────────────────────────
log "Step 4: 启动全量集成测试 (${EXTRA_ARGS:-全部 Phase})..."
REPORT_FILE="/tmp/integration_test_${TIMESTAMP}.md"
LOG_FILE="/tmp/integration_test_${TIMESTAMP}.log"

# 远程执行测试并实时流式输出日志
ssh -i "$SSH_KEY" "$SERVER" "
    set -e
    cd /opt/cn-kis-v2/backend
    source .venv/bin/activate 2>/dev/null || source venv/bin/activate 2>/dev/null || true
    python /opt/cn-kis-v2/ops/scripts/full_integration_validation.py \
        --output $REPORT_FILE \
        $EXTRA_ARGS \
        2>&1 | tee $LOG_FILE
    echo 'EXIT_CODE:'\$?
" | tee /tmp/remote_execution_${TIMESTAMP}.log
REMOTE_EXIT=${PIPESTATUS[0]}

log "Step 4 完成，远程退出码: $REMOTE_EXIT"

# ── Step 5: 下载报告到本地 ────────────────────────────────────────────────────
log "Step 5: 下载测试报告到本地..."
LOCAL_REPORT="docs/acceptance/DATA_INTEGRATION_TEST_REPORT_${TIMESTAMP:0:8}.md"
mkdir -p docs/acceptance

scp -i "$SSH_KEY" \
    "$SERVER:$REPORT_FILE" \
    "$LOCAL_REPORT" && log "报告已保存: $LOCAL_REPORT" || warn "报告下载失败，请手动从服务器获取: $REPORT_FILE"

# ── Step 6: 输出摘要 ──────────────────────────────────────────────────────────
log ""
log "=== 执行完毕 ==="
log "报告（本地）: $LOCAL_REPORT"
log "日志（远程）: $LOG_FILE"
log "日志（本地）: /tmp/remote_execution_${TIMESTAMP}.log"

if [[ $REMOTE_EXIT -eq 0 ]]; then
    log "${GREEN}✅ 全量集成测试通过${NC}"
else
    err "❌ 集成测试有失败项，请查看报告: $LOCAL_REPORT"
    exit 1
fi
