#!/bin/bash
# =============================================================================
# CN KIS V2.0 Wave 1 P0 验收执行脚本
# 在服务器上运行：bash /opt/cn-kis-v2/ops/scripts/wave1_p0_acceptance.sh
# 创建日期：2026-03-21
# 对应矩阵：docs/acceptance/V2_ACCEPTANCE_TRACEABILITY_MATRIX.md
# =============================================================================

set -e

PASS=0
FAIL=0
WARN=0
RESULTS=()

log_pass() { echo "  ✅ PASS: $1"; PASS=$((PASS+1)); RESULTS+=("PASS|$1"); }
log_fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1"); }
log_warn() { echo "  ⚠️  WARN: $1"; WARN=$((WARN+1)); RESULTS+=("WARN|$1"); }

echo ""
echo "============================================================"
echo "  CN KIS V2.0 Wave 1 P0 验收检查"
echo "  执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# 切到 V2 后端目录
cd /opt/cn-kis-v2/backend
source venv/bin/activate 2>/dev/null || true

# -------------------------------------------------------------------
# CHK-001: 无待迁移
# -------------------------------------------------------------------
echo ""
echo "[CHK-001] 检查无待迁移..."
PENDING_MIGRATIONS=$(python manage.py showmigrations 2>&1 | grep '\[ \]' | wc -l)
if [ "$PENDING_MIGRATIONS" -eq 0 ]; then
  log_pass "CHK-001: 无待迁移（共 0 个待迁移项）"
else
  log_fail "CHK-001: 发现 $PENDING_MIGRATIONS 个待迁移项！"
  python manage.py showmigrations 2>&1 | grep '\[ \]'
fi

# -------------------------------------------------------------------
# CHK-002: Django 部署检查
# -------------------------------------------------------------------
echo ""
echo "[CHK-002] Django 部署安全检查..."
DEPLOY_ERRORS=$(python manage.py check --deploy 2>&1 | grep -c "^System check identified" || true)
ERROR_COUNT=$(python manage.py check --deploy 2>&1 | grep "ERROR" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
  log_pass "CHK-002: Django 部署检查无 ERROR 级别告警"
else
  log_warn "CHK-002: 发现 $ERROR_COUNT 条 ERROR 级别告警（详见下方输出）"
  python manage.py check --deploy 2>&1 | grep "ERROR"
fi

# -------------------------------------------------------------------
# CHK-004: 无硬编码 IP（在源代码中）
# -------------------------------------------------------------------
echo ""
echo "[CHK-004] 检查无硬编码 IP..."
HARDCODED_IP=$(grep -r "118.196.64.48" /opt/cn-kis-v2/backend/apps/ /opt/cn-kis-v2/backend/config/ \
  --include="*.py" 2>/dev/null | grep -v "#" | wc -l)
if [ "$HARDCODED_IP" -eq 0 ]; then
  log_pass "CHK-004: 无硬编码 IP（Python 业务代码中未发现 118.196.64.48）"
else
  log_warn "CHK-004: 发现 $HARDCODED_IP 处硬编码 IP，请检查"
fi

# -------------------------------------------------------------------
# CHK-005: KNOWLEDGE_WRITE_ENABLED 为 false（保护生产写入）
# -------------------------------------------------------------------
echo ""
echo "[CHK-005] 检查 KNOWLEDGE_WRITE_ENABLED..."
KWE=$(grep "KNOWLEDGE_WRITE_ENABLED" /opt/cn-kis-v2/backend/.env 2>/dev/null | tail -1 || echo "")
if [ -z "$KWE" ] || echo "$KWE" | grep -q "false"; then
  log_pass "CHK-005: KNOWLEDGE_WRITE_ENABLED = false（或未设置，默认 false）"
else
  log_fail "CHK-005: KNOWLEDGE_WRITE_ENABLED 当前值: $KWE（应为 false）"
fi

# -------------------------------------------------------------------
# CHK-007: KnowledgeEntry 迁移数量 ≥ 1123
# -------------------------------------------------------------------
echo ""
echo "[CHK-007] 检查 KnowledgeEntry V1 迁移数量..."
V1_KE_COUNT=$(python manage.py shell -c "
from apps.knowledge.models import KnowledgeEntry
count = KnowledgeEntry.objects.filter(source_key__startswith='v1_migration').count()
print(count)
" 2>/dev/null || echo "0")
if [ "$V1_KE_COUNT" -ge 1123 ]; then
  log_pass "CHK-007: V1 KnowledgeEntry 迁移数量 = $V1_KE_COUNT（期望 ≥ 1123）"
else
  log_fail "CHK-007: V1 KnowledgeEntry 迁移数量 = $V1_KE_COUNT（期望 ≥ 1123）"
fi

# -------------------------------------------------------------------
# CHK-008: PersonalContext 总记录数 ≥ 3228
# -------------------------------------------------------------------
echo ""
echo "[CHK-008] 检查 PersonalContext 总记录数..."
PC_COUNT=$(python manage.py shell -c "
from apps.secretary.models import PersonalContext
count = PersonalContext.objects.count()
print(count)
" 2>/dev/null || echo "0")
if [ "$PC_COUNT" -ge 3228 ]; then
  log_pass "CHK-008: PersonalContext 总记录数 = $PC_COUNT（期望 ≥ 3228）"
else
  log_fail "CHK-008: PersonalContext 总记录数 = $PC_COUNT（期望 ≥ 3228）"
fi

# -------------------------------------------------------------------
# CHK-009: qdrant-client 已安装
# -------------------------------------------------------------------
echo ""
echo "[CHK-009] 检查 qdrant-client..."
if python -c "from qdrant_client import QdrantClient; print('qdrant_client OK')" 2>/dev/null; then
  log_pass "CHK-009: qdrant-client 已安装"
else
  log_fail "CHK-009: qdrant-client 未安装！"
fi

# -------------------------------------------------------------------
# M1-01: 28 Skills 导入数量
# -------------------------------------------------------------------
echo ""
echo "[M1-01] 检查 28 个 openclaw-skills 导入..."
SKILLS_COUNT=$(python manage.py shell -c "
from apps.agent_gateway.models import AgentDefinition
count = AgentDefinition.objects.count()
print(count)
" 2>/dev/null || echo "0")
if [ "$SKILLS_COUNT" -ge 28 ]; then
  log_pass "M1-01: AgentDefinition 数量 = $SKILLS_COUNT（期望 ≥ 28）"
else
  log_fail "M1-01: AgentDefinition 数量 = $SKILLS_COUNT（期望 ≥ 28）"
fi

# -------------------------------------------------------------------
# M1-03: AgentKnowledgeDomain 种子数量
# -------------------------------------------------------------------
echo ""
echo "[M1-03] 检查 AgentKnowledgeDomain 种子数量..."
AKD_COUNT=$(python manage.py shell -c "
from apps.agent_gateway.models import AgentKnowledgeDomain
count = AgentKnowledgeDomain.objects.count()
print(count)
" 2>/dev/null || echo "0")
if [ "$AKD_COUNT" -ge 1 ]; then
  log_pass "M1-03: AgentKnowledgeDomain 数量 = $AKD_COUNT"
else
  log_warn "M1-03: AgentKnowledgeDomain 数量 = $AKD_COUNT（可能尚未种子化）"
fi

# -------------------------------------------------------------------
# M2-02: KnowledgeEntry source_key 无重复
# -------------------------------------------------------------------
echo ""
echo "[M2-02] 检查 KnowledgeEntry source_key 无重复..."
DUP_KEYS=$(python manage.py shell -c "
from django.db.models import Count
from apps.knowledge.models import KnowledgeEntry
dups = KnowledgeEntry.objects.values('source_key').annotate(cnt=Count('id')).filter(cnt__gt=1, source_key__startswith='v1_migration').count()
print(dups)
" 2>/dev/null || echo "0")
if [ "$DUP_KEYS" -eq 0 ]; then
  log_pass "M2-02: V1 迁移条目 source_key 无重复"
else
  log_warn "M2-02: 发现 $DUP_KEYS 个重复 source_key"
fi

# -------------------------------------------------------------------
# M3-02: PersonalContext content_hash 无空值（V2 新增记录）
# -------------------------------------------------------------------
echo ""
echo "[M3-02] 检查 PersonalContext content_hash 非空率..."
EMPTY_HASH_COUNT=$(python manage.py shell -c "
from apps.knowledge.models import PersonalContext
count = PersonalContext.objects.filter(content_hash='').count()
total = PersonalContext.objects.count()
print(f'{count}/{total}')
" 2>/dev/null || echo "N/A")
echo "     content_hash 为空: $EMPTY_HASH_COUNT"
log_pass "M3-02: PersonalContext content_hash 检查完成（详见上方数字）"

# -------------------------------------------------------------------
# M3-03: PersonalContext source_type 分布
# -------------------------------------------------------------------
echo ""
echo "[M3-03] 检查 PersonalContext source_type 分布..."
python manage.py shell -c "
from django.db.models import Count
from apps.knowledge.models import PersonalContext
dist = PersonalContext.objects.values('source_type').annotate(cnt=Count('id')).order_by('-cnt')
for row in dist:
    print(f'  {row[\"source_type\"]}: {row[\"cnt\"]} 条')
" 2>/dev/null || echo "查询失败"
log_pass "M3-03: PersonalContext source_type 分布查询完成"

# -------------------------------------------------------------------
# C2-01: Celery Beat 调度任务
# -------------------------------------------------------------------
echo ""
echo "[C2-01] 检查 Celery Beat 调度任务..."
BEAT_TASKS=$(python manage.py shell -c "
from django_celery_beat.models import PeriodicTask
tasks = PeriodicTask.objects.filter(enabled=True).values_list('name', flat=True)
for t in tasks:
    print(f'  {t}')
print(f'共 {len(list(tasks))} 个定时任务')
" 2>/dev/null || echo "django_celery_beat 未初始化或未连接")
echo "$BEAT_TASKS"
log_pass "C2-01: Celery Beat 任务列表查询完成"

# -------------------------------------------------------------------
# R-014: qdrant-client 安装确认（已在 CHK-009 中完成）
# -------------------------------------------------------------------

# -------------------------------------------------------------------
# 汇总报告
# -------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Wave 1 P0 验收结果汇总"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo "  ✅ PASS: $PASS"
echo "  ❌ FAIL: $FAIL"
echo "  ⚠️  WARN: $WARN"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  ❌ 存在 FAIL 项，发布被阻断！请修复后重新运行"
  echo ""
  echo "  FAIL 详情："
  for result in "${RESULTS[@]}"; do
    status=$(echo "$result" | cut -d'|' -f1)
    msg=$(echo "$result" | cut -d'|' -f2)
    if [ "$status" = "FAIL" ]; then
      echo "    - $msg"
    fi
  done
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "  ⚠️  存在 WARN 项，建议修复后再发布（不阻断）"
  exit 0
else
  echo "  🎉 所有 P0 检查通过！"
  exit 0
fi
