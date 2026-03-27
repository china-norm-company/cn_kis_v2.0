#!/usr/bin/env bash
# =============================================================================
# activate_im_data.sh — IM 数据激活命令序列
#
# 功能：
#   在生产服务器上按正确顺序运行 IM 数据激活命令序列，
#   将 940K 条 IM PersonalContext 转化为可检索的项目协作图谱。
#
# A1 Gate 验收目标：
#   - KnowledgeRelation.collaborates_with 数量：251 → 3,000+
#   - IM KnowledgeEntry published 数：0 → 150,000+
#   - 项目生命周期阶段节点：0 → 500+
#
# 使用方式（在服务器上运行）：
#   ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48
#   cd /opt/cn-kis-v2/backend
#   bash /path/to/activate_im_data.sh [--dry-run] [--limit N]
#
# 或从本地通过 SSH 远程执行：
#   ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48 \
#     "cd /opt/cn-kis-v2/backend && bash ops/scripts/activate_im_data.sh"
# =============================================================================

set -euo pipefail

MANAGE="python manage.py"
LOG_DIR="/tmp/cn_kis_activation_logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DRY_RUN=false
LIMIT=""

# 解析参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --limit)
            LIMIT="--limit $2"
            shift 2
            ;;
        *)
            echo "未知参数: $1" >&2
            exit 1
            ;;
    esac
done

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_DIR/activate_im_${TIMESTAMP}.log"
}

run_cmd() {
    local cmd="$*"
    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY-RUN] 跳过: $cmd"
        return 0
    fi
    log "运行: $cmd"
    eval "$cmd" 2>&1 | tee -a "$LOG_DIR/activate_im_${TIMESTAMP}.log"
    log "完成: $cmd"
}

# ── 前置检查 ──────────────────────────────────────────────────────────────────
log "═══════════════════════════════════════════════════════"
log "IM 数据激活序列 — 开始"
log "目标：940K IM PersonalContext → 项目协作图谱 + KnowledgeEntry"
log "日志文件：$LOG_DIR/activate_im_${TIMESTAMP}.log"
log "DRY_RUN：$DRY_RUN"
log "═══════════════════════════════════════════════════════"

# 检查是否在正确目录
if [[ ! -f "manage.py" ]]; then
    log "错误：请在 backend/ 目录下运行此脚本（需要 manage.py 文件）"
    exit 1
fi

# ── 基线快照 ──────────────────────────────────────────────────────────────────
log ""
log "── 基线快照（运行前）────────────────────────────────────"
$MANAGE evaluate_knowledge_health --skip-retrieval --json 2>/dev/null \
    | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    s = r.get('scale', {})
    i = r.get('integrity', {})
    print(f'  知识条目：{s.get(\"entry_count\", \"?\"):,} 总 / {s.get(\"published_count\", \"?\"):,} 已发布')
    print(f'  图谱关系：{s.get(\"relation_count\", \"?\"):,}')
    print(f'  向量化率：{i.get(\"vector_rate\", \"?\")}%')
except Exception as e:
    print(f'  (快照解析失败: {e})')
" || true

# IM PersonalContext 数量
python3 -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from apps.secretary.models import PersonalContext
im_total = PersonalContext.objects.filter(source_type='im').count()
print(f'  IM PersonalContext 总数：{im_total:,}')
from apps.knowledge.models import KnowledgeRelation
cw = KnowledgeRelation.objects.filter(relation_type='collaborates_with').count()
print(f'  collaborates_with 关系：{cw:,}（基线）')
" 2>/dev/null || log "  (Django 快照失败，请确认虚拟环境已激活)"

log ""

# ── Step 1：IM PersonalContext → KnowledgeEntry ───────────────────────────────
log "── Step 1/4：IM PersonalContext → KnowledgeEntry ────────"
log "将 IM 原始消息批量过 ingestion_pipeline 生成结构化知识条目"
log "预计处理：最多 200,000 条 | 批大小：500"
log "预计耗时：2-4 小时（后台运行）"
log ""

if [[ "$DRY_RUN" == "false" ]]; then
    nohup $MANAGE process_pending_contexts \
        --source-type im \
        --batch-size 500 \
        ${LIMIT:-"--limit 200000"} \
        > "$LOG_DIR/step1_process_im_${TIMESTAMP}.log" 2>&1 &
    STEP1_PID=$!
    log "Step 1 已在后台启动，PID: $STEP1_PID"
    log "监控日志：tail -f $LOG_DIR/step1_process_im_${TIMESTAMP}.log"
    log "等待 Step 1 完成..."
    wait "$STEP1_PID" || { log "Step 1 失败！请查看日志后重试。"; exit 1; }
else
    log "[DRY-RUN] 跳过 Step 1"
fi
log "Step 1 完成 ✓"
log ""

# ── Step 2：从 IM 群聊提取项目协作图谱 ───────────────────────────────────────
log "── Step 2/4：build_im_project_graph ─────────────────────"
log "从 IM 群聊提取项目生命周期节点和人员参与关系"
log "过滤条件：只处理消息数 >= 5 的群"
log ""

run_cmd "$MANAGE build_im_project_graph --min-msgs 5"
log "Step 2 完成 ✓"
log ""

# ── Step 3：IM 项目图谱深度富化 ──────────────────────────────────────────────
log "── Step 3/4：enrich_im_project_relations ─────────────────"
log "关联 project_profile、提取里程碑、构建协作统计"
log ""

run_cmd "$MANAGE enrich_im_project_relations"
log "Step 3 完成 ✓"
log ""

# ── Step 4：骨干用户信息补齐 ─────────────────────────────────────────────────
log "── Step 4/4：enrich_core_users ───────────────────────────"
log "核心骨干用户三阶段信息补齐（KG 实体、项目关联、角色标注）"
log ""

run_cmd "$MANAGE enrich_core_users"
log "Step 4 完成 ✓"
log ""

# ── 验收快照 ──────────────────────────────────────────────────────────────────
log "── 验收快照（运行后）─────────────────────────────────────"
$MANAGE evaluate_knowledge_health --skip-retrieval --json 2>/dev/null \
    | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    s = r.get('scale', {})
    i = r.get('integrity', {})
    print(f'  知识条目：{s.get(\"entry_count\", \"?\"):,} 总 / {s.get(\"published_count\", \"?\"):,} 已发布')
    print(f'  图谱关系：{s.get(\"relation_count\", \"?\"):,}')
    print(f'  向量化率：{i.get(\"vector_rate\", \"?\")}%')
except Exception as e:
    print(f'  (快照解析失败: {e})')
" || true

python3 -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from apps.knowledge.models import KnowledgeRelation, KnowledgeEntry
cw = KnowledgeRelation.objects.filter(relation_type='collaborates_with').count()
im_pub = KnowledgeEntry.objects.filter(source_type='feishu_im', is_published=True).count()
lc = KnowledgeRelation.objects.filter(predicate_uri__startswith='lifecycle:').count()
print(f'  collaborates_with 关系：{cw:,}（目标 3,000+）', '✅' if cw >= 3000 else '⚠️  未达标')
print(f'  IM KnowledgeEntry published：{im_pub:,}（目标 150,000+）', '✅' if im_pub >= 150000 else '⚠️  未达标')
print(f'  lifecycle 节点数：{lc:,}（目标 500+）', '✅' if lc >= 500 else '⚠️  未达标')
if cw >= 3000 and im_pub >= 150000 and lc >= 500:
    print()
    print('  🎉 A1 Gate 验收通过！可继续 A2 里程碑。')
else:
    print()
    print('  ⚠️  A1 Gate 未完全达标，检查各 Step 日志排查问题。')
" 2>/dev/null || log "  (验收检查失败，请手动查询数据库)"

log ""
log "═══════════════════════════════════════════════════════"
log "IM 数据激活序列 — 完成"
log "日志保存于：$LOG_DIR/activate_im_${TIMESTAMP}.log"
log "下一步：更新 docs/LEARNING_LOOP_STATUS.md 中的 A1 Gate 验收记录"
log "═══════════════════════════════════════════════════════"
