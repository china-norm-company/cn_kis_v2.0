"""
系统脉搏内部 API（供 GitHub Actions 早晚报调用）

端点：
  GET /internal/system-pulse/   — 返回知识库健康度 + 学习循环 KPI + 待处理 Insights

认证：内部服务调用（通过 SYSTEM_PULSE_TOKEN 环境变量验证），无需用户登录。
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from ninja import Router, Schema
from ninja.security import HttpBearer

logger = logging.getLogger(__name__)

router = Router()


# ── 内部 API 认证 ────────────────────────────────────────────────────────────

class InternalTokenAuth(HttpBearer):
    """简单 Bearer Token 认证（内部使用，无需走用户体系）。"""

    def authenticate(self, request, token: str) -> Optional[str]:
        expected = os.environ.get('SYSTEM_PULSE_TOKEN', 'cn_kis_pulse_2026')
        if token == expected:
            return token
        return None


_auth = InternalTokenAuth()


# ── 响应 Schema ──────────────────────────────────────────────────────────────

class SystemPulseOut(Schema):
    ok: bool
    generated_at: str
    knowledge_health: Dict[str, Any]
    learning_loop_kpis: Dict[str, Any]
    pending_insights: list
    recommended_actions: list


# ── 端点 ─────────────────────────────────────────────────────────────────────

@router.get('/system-pulse/', auth=_auth, response={200: Dict[str, Any]})
def get_system_pulse(request):
    """
    聚合系统脉搏数据，供 GitHub Actions 早晚报和 Cursor AI check-system-pulse 技能调用。

    返回：
      - knowledge_health：知识库规模 + 完整性 + 图谱统计
      - learning_loop_kpis：A1/A2/A3/B 各 Track KPI 实际值 vs 目标值
      - pending_insights：待处理的 data-insight 类信息（ProactiveInsight draft）
      - recommended_actions：系统自动生成的今日推荐行动
    """
    from django.utils import timezone

    now_str = timezone.now().strftime('%Y-%m-%d %H:%M UTC')

    knowledge_health = _get_knowledge_health()
    kpis = _get_learning_kpis()
    pending_insights = _get_pending_insights()
    recommended_actions = _build_recommended_actions(kpis, pending_insights)

    return {
        'ok': True,
        'generated_at': now_str,
        'knowledge_health': knowledge_health,
        'learning_loop_kpis': kpis,
        'pending_insights': pending_insights,
        'recommended_actions': recommended_actions,
    }


# ── 内部实现 ─────────────────────────────────────────────────────────────────

def _get_knowledge_health() -> dict:
    """知识库健康度数据。"""
    try:
        from apps.knowledge.models import KnowledgeEntry, KnowledgeRelation, KnowledgeEntity
        from apps.secretary.models import PersonalContext

        entry_total = KnowledgeEntry.objects.count()
        entry_published = KnowledgeEntry.objects.filter(is_published=True).count()
        entry_vectorized = KnowledgeEntry.objects.filter(
            embedding_id__isnull=False
        ).exclude(embedding_id='').count()
        relation_total = KnowledgeRelation.objects.count()
        entity_total = KnowledgeEntity.objects.count()
        collab_relations = KnowledgeRelation.objects.filter(
            relation_type='collaborates_with'
        ).count()
        context_total = PersonalContext.objects.count()

        vector_rate = round(entry_vectorized / entry_total * 100, 1) if entry_total > 0 else 0
        publish_rate = round(entry_published / entry_total * 100, 1) if entry_total > 0 else 0

        return {
            'entry_total': entry_total,
            'entry_published': entry_published,
            'entry_vectorized': entry_vectorized,
            'publish_rate': publish_rate,
            'vector_rate': vector_rate,
            'relation_total': relation_total,
            'entity_total': entity_total,
            'collaborates_with': collab_relations,
            'personal_context_total': context_total,
        }
    except Exception as e:
        logger.error('获取知识库健康度失败: %s', e)
        return {'error': str(e)}


def _get_learning_kpis() -> dict:
    """学习循环 KPI 实际值（对照 LEARNING_LOOP_STATUS.md 的第 8 周目标）。"""
    kpis = {}

    # A1: IM 协作网络
    try:
        from apps.knowledge.models import KnowledgeRelation, KnowledgeEntry
        kpis['a1_collaborates_with'] = {
            'value': KnowledgeRelation.objects.filter(
                relation_type='collaborates_with'
            ).count(),
            'target': 10000,
            'label': 'collaborates_with 关系数',
            'gate': 'a1',
        }
        kpis['a1_im_entries_published'] = {
            'value': KnowledgeEntry.objects.filter(
                source_type__in=['feishu_im', 'im'], is_published=True
            ).count(),
            'target': 200000,
            'label': 'IM KnowledgeEntry published 数',
            'gate': 'a1',
        }
    except Exception as e:
        kpis['a1_error'] = str(e)

    # A2: 邮件信号激活
    try:
        from apps.secretary.models import MailSignalEvent, MailSignalType
        total = MailSignalEvent.objects.count()
        unknown = MailSignalEvent.objects.filter(
            mail_signal_type=MailSignalType.UNKNOWN
        ).count()
        unknown_pct = round(unknown / total * 100, 1) if total > 0 else 0
        kpis['a2_mail_signal_unknown_pct'] = {
            'value': unknown_pct,
            'target': 15,
            'label': 'MailSignalEvent unknown%',
            'unit': '%',
            'lower_is_better': True,
            'gate': 'a2',
        }
    except Exception as e:
        kpis['a2_error'] = str(e)

    # A3: 受试者智能层
    try:
        from apps.knowledge.models import KnowledgeRelation, KnowledgeEntry
        participation = KnowledgeRelation.objects.filter(
            predicate_uri='has_participation_pattern'
        ).count()
        subject_entries = KnowledgeEntry.objects.filter(
            source_type='subject_intelligence'
        ).count()
        kpis['a3_participation_relations'] = {
            'value': participation,
            'target': 2000,
            'label': 'has_participation_pattern 关系数',
            'gate': 'a3',
        }
        kpis['a3_subject_knowledge_entries'] = {
            'value': subject_entries,
            'target': 0,
            'label': '受试者智能知识条目数',
            'gate': 'a3',
        }
    except Exception as e:
        kpis['a3_error'] = str(e)

    # B: 学习导入框架
    try:
        from apps.knowledge.models import KnowledgeEntry
        import_learning_entries = KnowledgeEntry.objects.filter(
            source_type='import_learning'
        ).count()
        kpis['b_learning_entries'] = {
            'value': import_learning_entries,
            'target': 6,
            'label': 'import_learning KnowledgeEntry（每个脚本至少1条）',
            'gate': 'b',
        }
    except Exception as e:
        kpis['b_error'] = str(e)

    # C: 智能体进化
    try:
        from apps.secretary.models import ProactiveInsight
        data_insights = ProactiveInsight.objects.filter(
            trigger_source__startswith='GapReporter'
        ).count()
        kpis['c_data_insights'] = {
            'value': data_insights,
            'target': 200,
            'label': 'ProactiveInsight 自动生成数',
            'gate': 'c',
        }
    except Exception as e:
        kpis['c_error'] = str(e)

    try:
        from apps.secretary.models_memory import WorkerPolicyUpdate
        policy_updates = WorkerPolicyUpdate.objects.filter(
            status__in=['active', 'evaluating']
        ).count()
        kpis['c_worker_policy_updates'] = {
            'value': policy_updates,
            'target': 20,
            'label': 'WorkerPolicyUpdate 累计数',
            'gate': 'c',
        }
    except Exception as e:
        kpis['c5_error'] = str(e)

    return kpis


def _get_pending_insights() -> list:
    """获取待处理的数据洞察（ProactiveInsight status=draft，来自 GapReporter）。"""
    try:
        from apps.secretary.models import ProactiveInsight
        from django.utils import timezone

        qs = ProactiveInsight.objects.filter(
            trigger_source__startswith='GapReporter',
            status='draft',
        ).order_by('-created_at')[:10]

        return [
            {
                'id': i.id,
                'title': i.title,
                'summary': (i.summary or '')[:200],
                'created_at': i.created_at.strftime('%Y-%m-%d'),
                'days_pending': (timezone.now() - i.created_at).days,
            }
            for i in qs
        ]
    except Exception as e:
        logger.error('获取待处理洞察失败: %s', e)
        return []


def _build_recommended_actions(kpis: dict, pending_insights: list) -> list:
    """基于当前 KPI 状态生成推荐行动列表。"""
    actions = []

    # 检查各 KPI 的达标情况
    def pct_to_target(kpi_item: dict) -> float:
        """计算当前值占目标的百分比。"""
        val = kpi_item.get('value', 0)
        target = kpi_item.get('target', 1)
        if target == 0:
            return 1.0
        lower = kpi_item.get('lower_is_better', False)
        if lower:
            return val / target if target > 0 else 1.0  # 越低越好，越接近目标越好
        return val / target if target > 0 else 1.0

    a1_cw = kpis.get('a1_collaborates_with', {})
    if isinstance(a1_cw, dict) and a1_cw.get('value', 0) < 3000:
        actions.append({
            'priority': 1,
            'action': '运行 A1 IM 激活序列（服务器）',
            'command': 'bash ops/scripts/activate_im_data.sh',
            'reason': f'collaborates_with 关系 {a1_cw.get("value", 0):,} < 3,000（A1 Gate 未达标）',
        })

    a2_pct = kpis.get('a2_mail_signal_unknown_pct', {})
    if isinstance(a2_pct, dict) and a2_pct.get('value', 100) > 30:
        actions.append({
            'priority': 2,
            'action': '运行邮件信号重分类命令（服务器）',
            'command': 'python manage.py reconcile_mail_signals --limit 10000',
            'reason': f'MailSignalEvent unknown {a2_pct.get("value", 100)}% > 30%（A2 Gate 未达标）',
        })

    b_entries = kpis.get('b_learning_entries', {})
    if isinstance(b_entries, dict) and b_entries.get('value', 0) < 6:
        remaining = 6 - b_entries.get('value', 0)
        actions.append({
            'priority': 3,
            'action': f'继续改造 {remaining} 个导入脚本接入 LearningRunner（B Track）',
            'command': '查看 docs/LEARNING_LOOP_STATUS.md B2 Gate 表格',
            'reason': f'仍有 {remaining} 个导入脚本未接入学习框架',
        })

    a3_rel = kpis.get('a3_participation_relations', {})
    if isinstance(a3_rel, dict) and a3_rel.get('value', 0) < 2000:
        actions.append({
            'priority': 4,
            'action': '运行受试者智能层构建命令（服务器）',
            'command': 'python manage.py build_subject_intelligence --phase all',
            'reason': f'参与关系图谱 {a3_rel.get("value", 0):,} < 2,000（A3 Gate 未达标）',
        })

    if pending_insights:
        old_insights = [i for i in pending_insights if i.get('days_pending', 0) >= 3]
        if old_insights:
            actions.append({
                'priority': 2,
                'action': f'处理 {len(old_insights)} 条超 3 天的待处理数据洞察',
                'command': '访问 ProactiveInsight 管理界面或运行 gh issue list --label data-insight',
                'reason': f'{old_insights[0]["title"][:50]}... 等待决策',
            })

    # 如果一切良好
    if not actions:
        actions.append({
            'priority': 5,
            'action': '运行每周智能体训练',
            'command': 'python manage.py train_agent general-assistant -n 2',
            'reason': '系统状态良好，建议保持智能体策略持续进化',
        })

    return sorted(actions, key=lambda x: x['priority'])
