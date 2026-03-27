"""
秘书工作台服务

1. 飞书信息扫描：从 personal_context 或 feishu-connector 获取，经大模型提炼关键信息
2. 项目/客户分析：关联账号的项目与客户，扩展跟踪并分析
3. 热点话题：从飞书信息中提取客户/项目/公司内部热点与趋势
"""
import json
import logging
import os
import random
import string
import uuid
import hashlib
from pathlib import Path
from datetime import datetime, timedelta, date
from typing import Optional, Dict, List, Any
from collections import defaultdict

from django.conf import settings
from django.utils import timezone
from django.core.cache import cache

from apps.identity.models import Account
from apps.protocol.models import Protocol
from apps.crm.models import Client, Opportunity
from apps.workorder.models import WorkOrder
from apps.agent_gateway.services import quick_chat
from apps.agent_gateway.models import AgentProvider

from .models import (
    FeishuUserToken,
    PersonalContext,
    DashboardOverviewCache,
    AssistantContextSnapshot,
    AssistantSummaryDraft,
    AssistantActionPlan,
    AssistantActionExecution,
    AssistantActionFeedback,
    AssistantActionPolicy,
    AssistantUserPreference,
)
from libs.feishu_client import feishu_client
from libs.feishu_client import FeishuAPIError

logger = logging.getLogger(__name__)

# 八源权限预检能力键（与 plan 一致）
# 前 4 项：API 实探；后 4 项：先 API 实探 wiki，其余用 scope 字符串校验
PREFLIGHT_CAPABILITIES = ('mail', 'im', 'calendar', 'task', 'wiki', 'docx', 'drive_file')

# 后 4 项预检所需的 feishu_scope 关键字映射（子串匹配即视为已授权）
PREFLIGHT_SCOPE_REQUIRED = {
    'docx': 'docx:document',
    'drive_file': 'drive:file',
}

# 缓存有效期（分钟）
CACHE_TTL_MINUTES = 30
LEARNING_SUMMARY_CACHE_TTL_SECONDS = 300
LEARNING_WIDGET_CACHE_TTL_SECONDS = 180
ASSISTANT_CACHE_METRIC_TTL_SECONDS = 15 * 24 * 60 * 60
ASSISTANT_CACHE_ENDPOINTS = ['summary', 'widget']
ASSISTANT_CACHE_STATUSES = ['HIT', 'MISS', 'REVALIDATED']
ASSISTANT_ROUTE_METRIC_TTL_SECONDS = 15 * 24 * 60 * 60
ASSISTANT_ROUTE_SOURCES = ['default', 'learning', 'override', 'unknown']
ASSISTANT_ROUTE_EVENTS = ['applied', 'success', 'failed', 'fallback']
DASHBOARD_LLM_ENABLED = os.getenv('SECRETARY_DASHBOARD_LLM_ENABLED', 'false').strip().lower() in ('1', 'true', 'yes', 'on')
ASSISTANT_ACTION_DEFAULT_POLICIES: Dict[str, Dict[str, Any]] = {
    'notification_triage': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['low'],
        'min_priority_score': 0,
        'min_confidence_score': 0,
    },
    'mail_intent_brief': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['low', 'medium'],
        'min_priority_score': 0,
        'min_confidence_score': 0,
    },
    'crm_ticket_draft': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['low', 'medium'],
        'min_priority_score': 50,
        'min_confidence_score': 55,
    },
    'risk_followup_plan': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['low', 'medium'],
        'min_priority_score': 55,
        'min_confidence_score': 60,
    },
    'workorder_followup_comment': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['low'],
        'min_priority_score': 45,
        'min_confidence_score': 50,
    },
    'daily_digest_prepare': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['low'],
        'min_priority_score': 40,
        'min_confidence_score': 55,
    },
    'agent_channel_alert': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['medium', 'high'],
        'min_priority_score': 60,
        'min_confidence_score': 70,
    },
    'research_insight_followup': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['low', 'medium'],
        'min_priority_score': 50,
        'min_confidence_score': 55,
    },
    'research_route_governance_alert': {
        'enabled': True,
        'requires_confirmation': True,
        'allowed_risk_levels': ['medium', 'high'],
        'min_priority_score': 60,
        'min_confidence_score': 70,
    },
}
DEFAULT_ALLOWED_RISK_LEVELS = ['low', 'medium']
ASSISTANT_PREFERENCE_KEY = 'assistant_preferences'
ASSISTANT_DEFAULT_PREFERENCES: Dict[str, Any] = {
    'summary_tone': 'ops',
    'focus_action_types': [],
    'blocked_action_types': [],
    'daily_digest_hour': 18,
    'chat_default_provider': 'kimi',
    'chat_allow_fallback': True,
    'chat_fallback_provider': 'auto',
    'research_route_overrides': {},
    'route_governance_auto_execute_enabled': False,
    'route_governance_auto_execute_max_risk': 'medium',
    'route_governance_auto_execute_min_confidence': 75,
    'route_governance_auto_execute_min_priority': 70,
    'route_governance_auto_execute_approval_mode': 'graded',
    'route_governance_thresholds': {
        'coverage_rate_min': 0.5,
        'applied_7d_min': 1,
        'alert_days': 30,
        'override_hit_rate_threshold': 0.6,
        'override_success_rate_threshold': 0.5,
        'fallback_rate_threshold': 0.25,
        'min_applied_threshold': 5,
        'cooldown_hours': 12,
    },
}
RESEARCH_ROUTE_OPTIONS = {'confirm_only', 'execute_direct', 'delegate_claw'}
RESEARCH_CARD_TYPES = {'product', 'market', 'competition', 'paper_method', 'client_execution'}
KIMI_CLAW_DELEGABLE_ACTION_TYPES = {
    'notification_triage',
    'mail_intent_brief',
    'risk_followup_plan',
    'daily_digest_prepare',
    'agent_channel_alert',
    'research_insight_followup',
    'research_route_governance_alert',
}
ASSISTANT_DEFAULT_OPERATOR_MODE = 'copilot_confirm'
ASSISTANT_EXECUTION_TARGETS = {'feishu', 'cn_kis', 'kimi_claw'}
ASSISTANT_ACTION_EXPECTED_SKILLS_DEFAULTS: Dict[str, List[str]] = {
    'notification_triage': ['morning-email-rollup', 'daily-report'],
    'mail_intent_brief': ['morning-email-rollup', 'customer-success-manager'],
    'crm_ticket_draft': ['customer-success-manager', 'meeting-prep'],
    'workorder_followup_comment': ['daily-report'],
    'daily_digest_prepare': ['daily-report'],
    'risk_followup_plan': ['daily-report', 'competitive-analysis'],
    'agent_channel_alert': ['daily-report'],
    'research_insight_followup': ['market-research', 'competitive-analysis'],
    'research_route_governance_alert': ['market-research', 'daily-report'],
    'feishu_im_message_send': ['meeting-prep'],
    'feishu_calendar_event_create': ['meeting-prep'],
    'feishu_task_create': ['meeting-prep'],
}
ASSISTANT_ACTION_MIN_CONTEXT_DEFAULTS: Dict[str, List[str]] = {
    'notification_triage': ['feishu.im.recent'],
    'mail_intent_brief': ['feishu.mail.recent'],
    'crm_ticket_draft': ['feishu.mail.recent', 'cn_kis.crm.client_link'],
    'workorder_followup_comment': ['cn_kis.workorder.pending'],
    'daily_digest_prepare': ['feishu.mail.recent', 'feishu.calendar.recent', 'feishu.task.recent'],
    'risk_followup_plan': ['cn_kis.project.analysis'],
    'agent_channel_alert': ['cn_kis.agent.fallback_metrics'],
    'research_insight_followup': ['research.insight.cards'],
    'research_route_governance_alert': ['research.route.metrics'],
    'feishu_im_message_send': ['feishu.im.recent'],
    'feishu_calendar_event_create': ['feishu.calendar.recent'],
    'feishu_task_create': ['feishu.task.recent'],
}
ASSISTANT_CAPABILITY_REGISTRY: Dict[str, Dict[str, Any]] = {
    'notification_triage': {
        'capability_key': 'feishu.inbox.triage',
        'target_system': 'feishu',
        'executor': 'feishu_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': ['im:message:read_as_user'],
    },
    'mail_intent_brief': {
        'capability_key': 'feishu.mail.intent_brief',
        'target_system': 'feishu',
        'executor': 'feishu_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': ['mail:user_mailbox'],
    },
    'crm_ticket_draft': {
        'capability_key': 'cn_kis.crm.ticket_draft',
        'target_system': 'cn_kis',
        'executor': 'cn_kis_adapter',
        'required_permissions': ['crm.ticket.create'],
        'required_feishu_scopes': [],
    },
    'workorder_followup_comment': {
        'capability_key': 'cn_kis.workorder.followup_comment',
        'target_system': 'cn_kis',
        'executor': 'cn_kis_adapter',
        'required_permissions': ['workorder.workorder.update'],
        'required_feishu_scopes': [],
    },
    'daily_digest_prepare': {
        'capability_key': 'cn_kis.assistant.daily_digest',
        'target_system': 'cn_kis',
        'executor': 'cn_kis_adapter',
        'required_permissions': ['assistant.summary.generate'],
        'required_feishu_scopes': [],
    },
    'risk_followup_plan': {
        'capability_key': 'cn_kis.assistant.risk_followup',
        'target_system': 'cn_kis',
        'executor': 'cn_kis_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': [],
    },
    'agent_channel_alert': {
        'capability_key': 'cn_kis.assistant.channel_alert',
        'target_system': 'cn_kis',
        'executor': 'cn_kis_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': [],
    },
    'research_insight_followup': {
        'capability_key': 'cn_kis.research.insight_followup',
        'target_system': 'cn_kis',
        'executor': 'cn_kis_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': [],
    },
    'research_route_governance_alert': {
        'capability_key': 'cn_kis.research.route_governance',
        'target_system': 'cn_kis',
        'executor': 'cn_kis_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': [],
    },
    # 预留给动作箱直接下发的飞书执行能力（Phase 1 双轨）
    'feishu_im_message_send': {
        'capability_key': 'feishu.im.message_send',
        'target_system': 'feishu',
        'executor': 'feishu_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': ['im:message:read_as_user'],
    },
    'feishu_calendar_event_create': {
        'capability_key': 'feishu.calendar.event_create',
        'target_system': 'feishu',
        'executor': 'feishu_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': ['calendar:calendar:readonly'],
    },
    'feishu_task_create': {
        'capability_key': 'feishu.task.create',
        'target_system': 'feishu',
        'executor': 'feishu_adapter',
        'required_permissions': ['assistant.automation.execute'],
        'required_feishu_scopes': ['task:task:readonly'],
    },
}

KIMI_CLAW_ROLE_TEMPLATE_LIBRARY: Dict[str, List[Dict[str, Any]]] = {
    'management': [
        {'template_id': 'mgmt_daily_brief', 'name': '管理日报简报', 'use_case': '自动汇总项目健康/风险/回款要点'},
        {'template_id': 'mgmt_risk_review', 'name': '风险复盘清单', 'use_case': '输出风险TopN与处置顺序'},
    ],
    'operation': [
        {'template_id': 'ops_todo_triage', 'name': '执行待办分拣', 'use_case': '聚合未读通知与待办并重排优先级'},
        {'template_id': 'ops_followup_draft', 'name': '跟进草稿生成', 'use_case': '生成工单跟进备注或客户跟进草稿'},
    ],
    'support': [
        {'template_id': 'support_report_pack', 'name': '支持报表拼装', 'use_case': '多表数据对齐并输出周报草稿'},
        {'template_id': 'support_reminder_batch', 'name': '批量提醒草稿', 'use_case': '按规则生成内部提醒草稿'},
    ],
    'technical': [
        {'template_id': 'tech_quality_digest', 'name': '质量指标摘要', 'use_case': '聚合偏差/CAPA/校准状态形成排障摘要'},
        {'template_id': 'tech_data_checklist', 'name': '数据核查清单', 'use_case': '生成EDC核查与疑点跟进清单'},
    ],
}
KIMI_CLAW_ROLE_PRESETS: Dict[str, Dict[str, Any]] = {
    'management': {
        'summary_tone': 'exec',
        'daily_digest_hour': 8,
        'focus_action_types': ['daily_digest_prepare', 'risk_followup_plan', 'agent_channel_alert'],
        'blocked_action_types': [],
        'chat_default_provider': 'kimi',
        'chat_allow_fallback': True,
        'chat_fallback_provider': 'auto',
    },
    'operation': {
        'summary_tone': 'ops',
        'daily_digest_hour': 9,
        'focus_action_types': ['notification_triage', 'workorder_followup_comment', 'mail_intent_brief'],
        'blocked_action_types': [],
        'chat_default_provider': 'kimi',
        'chat_allow_fallback': True,
        'chat_fallback_provider': 'auto',
    },
    'support': {
        'summary_tone': 'detail',
        'daily_digest_hour': 9,
        'focus_action_types': ['daily_digest_prepare', 'notification_triage', 'mail_intent_brief'],
        'blocked_action_types': [],
        'chat_default_provider': 'kimi',
        'chat_allow_fallback': True,
        'chat_fallback_provider': 'auto',
    },
    'technical': {
        'summary_tone': 'detail',
        'daily_digest_hour': 10,
        'focus_action_types': ['risk_followup_plan', 'agent_channel_alert', 'daily_digest_prepare'],
        'blocked_action_types': [],
        'chat_default_provider': 'kimi',
        'chat_allow_fallback': True,
        'chat_fallback_provider': 'auto',
    },
}
KIMI_CLAW_ROLE_SKILL_BUNDLES: Dict[str, List[Dict[str, Any]]] = {
    'management': [
        {'slug': 'daily-report', 'value': '管理日报/周报自动汇总'},
        {'slug': 'market-research', 'value': '市场规模与机会判断'},
        {'slug': 'competitive-analysis', 'value': '竞品拆解与差异化定位'},
    ],
    'operation': [
        {'slug': 'meeting-prep', 'value': '会前准备与跟进清单'},
        {'slug': 'morning-email-rollup', 'value': '晨间邮件与日程优先级'},
        {'slug': 'daily-report', 'value': '执行日报自动草稿'},
    ],
    'support': [
        {'slug': 'customer-success-manager', 'value': '客户健康度与流失预警'},
        {'slug': 'daily-report', 'value': '客户项目跟进报表'},
        {'slug': 'meeting-prep', 'value': '客户会议准备与复盘'},
    ],
    'technical': [
        {'slug': 'research-paper-kb', 'value': '论文与方法知识库沉淀'},
        {'slug': 'market-research', 'value': '技术路线与产业趋势研究'},
        {'slug': 'competitive-analysis', 'value': '技术竞品能力对比'},
    ],
}
ROUTE_GOVERNANCE_ROLE_PRESETS: Dict[str, Dict[str, Any]] = {
    'management': {
        'route_governance_auto_execute_enabled': True,
        'route_governance_auto_execute_approval_mode': 'graded',
        'route_governance_auto_execute_max_risk': 'high',
        'route_governance_auto_execute_min_confidence': 70,
        'route_governance_auto_execute_min_priority': 65,
    },
    'operation': {
        'route_governance_auto_execute_enabled': True,
        'route_governance_auto_execute_approval_mode': 'direct',
        'route_governance_auto_execute_max_risk': 'medium',
        'route_governance_auto_execute_min_confidence': 75,
        'route_governance_auto_execute_min_priority': 70,
    },
    'support': {
        'route_governance_auto_execute_enabled': False,
        'route_governance_auto_execute_approval_mode': 'graded',
        'route_governance_auto_execute_max_risk': 'low',
        'route_governance_auto_execute_min_confidence': 80,
        'route_governance_auto_execute_min_priority': 75,
    },
    'technical': {
        'route_governance_auto_execute_enabled': True,
        'route_governance_auto_execute_approval_mode': 'graded',
        'route_governance_auto_execute_max_risk': 'medium',
        'route_governance_auto_execute_min_confidence': 80,
        'route_governance_auto_execute_min_priority': 75,
    },
}


def _build_default_claw_artifacts(action_row: AssistantActionPlan, message: str = '') -> List[Dict[str, Any]]:
    """
    当托管执行返回 partial 且缺少产物时，补齐标准化产物模板，便于直接回放与交付。
    """
    prefix = f"assistant_action_{action_row.id}"
    return [
        {
            'type': 'doc',
            'name': f'{prefix}_daily_brief.md',
            'title': '日报草稿',
            'content_hint': message or action_row.description or action_row.title,
        },
        {
            'type': 'json',
            'name': f'{prefix}_risk_checklist.json',
            'title': '风险清单',
            'content_hint': '包含风险点、影响范围、建议处理顺序',
        },
        {
            'type': 'sheet',
            'name': f'{prefix}_todo_queue.csv',
            'title': '待办队列',
            'content_hint': '包含优先级、负责人、截止时间建议',
        },
    ]


def _has_today_digest_action(account_id: int) -> bool:
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return AssistantActionPlan.objects.filter(
        account_id=account_id,
        action_type='daily_digest_prepare',
        created_at__gte=today_start,
        status__in=[
            AssistantActionPlan.Status.PENDING_CONFIRM,
            AssistantActionPlan.Status.CONFIRMED,
            AssistantActionPlan.Status.EXECUTED,
        ],
    ).exists()


def _has_permission(account: Account, permission_code: str) -> bool:
    from apps.identity.authz import get_authz_service
    authz = get_authz_service()
    return authz.has_permission(account, permission_code)


def _has_feishu_user_token(account_id: int) -> bool:
    token = FeishuUserToken.objects.filter(account_id=account_id).order_by('-updated_at').first()
    if not token:
        return False
    if token.token_expires_at and token.token_expires_at <= timezone.now():
        return False
    return bool((token.access_token or '').strip())


def _resolve_action_capability(action_type: str) -> Dict[str, Any]:
    cfg = ASSISTANT_CAPABILITY_REGISTRY.get(action_type, {})
    target_system = str(cfg.get('target_system') or 'cn_kis').strip()
    if target_system not in ASSISTANT_EXECUTION_TARGETS:
        target_system = 'cn_kis'
    executor = str(cfg.get('executor') or 'cn_kis_adapter').strip()
    return {
        'action_type': action_type,
        'capability_key': str(cfg.get('capability_key') or f'cn_kis.assistant.{action_type}'),
        'target_system': target_system,
        'executor': executor,
        'required_permissions': [str(p).strip() for p in (cfg.get('required_permissions') or []) if str(p).strip()],
        'required_feishu_scopes': [str(s).strip() for s in (cfg.get('required_feishu_scopes') or []) if str(s).strip()],
        'expected_skills': [str(s).strip() for s in (
            cfg.get('expected_skills')
            or ASSISTANT_ACTION_EXPECTED_SKILLS_DEFAULTS.get(action_type, [])
        ) if str(s).strip()],
        'minimum_context_requirements': [str(c).strip() for c in (
            cfg.get('minimum_context_requirements')
            or ASSISTANT_ACTION_MIN_CONTEXT_DEFAULTS.get(action_type, [])
        ) if str(c).strip()],
        'operator_mode': ASSISTANT_DEFAULT_OPERATOR_MODE,
    }


def _merge_unique_strings(base: List[str], extra: List[str]) -> List[str]:
    merged: List[str] = []
    for value in (base or []) + (extra or []):
        s = str(value or '').strip()
        if s and s not in merged:
            merged.append(s)
    return merged


def _resolve_personal_context_open_id(account: Account) -> str:
    if str(getattr(account, 'feishu_open_id', '') or '').strip():
        return str(account.feishu_open_id).strip()
    token = FeishuUserToken.objects.filter(account_id=account.id).order_by('-updated_at').first()
    return str(getattr(token, 'open_id', '') or '').strip()


def _infer_granted_feishu_scopes(account: Account) -> List[str]:
    # Scope 无法从 OAuth token 直接完整读出时，使用“token + 已采集上下文”保守推断。
    if not _has_feishu_user_token(account.id):
        return []
    granted = ['feishu:user_access_token']
    open_id = _resolve_personal_context_open_id(account)
    if not open_id:
        return granted
    source_types = set(
        PersonalContext.objects.filter(user_id=open_id).values_list('source_type', flat=True).distinct()
    )
    if 'mail' in source_types:
        granted.append('mail:user_mailbox')
    if 'calendar' in source_types:
        granted.append('calendar:calendar:readonly')
    if 'task' in source_types:
        granted.append('task:task:readonly')
    if 'im' in source_types:
        granted.append('im:message:read_as_user')
    return granted


def _resolve_scope_proof(account: Account, capability: Dict[str, Any]) -> Dict[str, List[str]]:
    required = [str(s).strip() for s in (capability.get('required_feishu_scopes') or []) if str(s).strip()]
    granted = _infer_granted_feishu_scopes(account)
    missing = [scope for scope in required if scope not in set(granted)]
    return {
        'required': required,
        'granted': granted,
        'missing': missing,
    }


def _build_context_coverage(
    account: Account,
    payload: Dict[str, Any],
    capability: Dict[str, Any],
) -> Dict[str, Any]:
    required = _merge_unique_strings(
        capability.get('minimum_context_requirements') or [],
        (payload.get('minimum_context_requirements') if isinstance(payload, dict) else []) or [],
    )
    open_id = _resolve_personal_context_open_id(account)
    context_qs = PersonalContext.objects.none()
    if open_id:
        context_qs = PersonalContext.objects.filter(
            user_id=open_id,
            created_at__gte=timezone.now() - timedelta(days=14),
        )
    source_set = set(context_qs.values_list('source_type', flat=True).distinct())
    latest_created = context_qs.order_by('-created_at').values_list('created_at', flat=True).first()
    staleness_seconds = None
    if latest_created:
        staleness_seconds = max(0, int((timezone.now() - latest_created).total_seconds()))

    def _satisfied(req: str) -> bool:
        if req.startswith('feishu.mail'):
            return 'mail' in source_set
        if req.startswith('feishu.calendar'):
            return 'calendar' in source_set
        if req.startswith('feishu.task'):
            return 'task' in source_set
        if req.startswith('feishu.im'):
            return 'im' in source_set
        if req.startswith('cn_kis.workorder'):
            return WorkOrder.objects.filter(is_deleted=False).exists()
        if req.startswith('cn_kis.crm'):
            return Client.objects.filter(is_deleted=False).exists() or Opportunity.objects.filter(is_deleted=False).exists()
        if req.startswith('cn_kis.project'):
            return Protocol.objects.filter(is_deleted=False).exists()
        if req.startswith('cn_kis.agent'):
            return True
        if req.startswith('research.'):
            return True
        return True

    satisfied = [req for req in required if _satisfied(req)]
    missing = [req for req in required if req not in set(satisfied)]
    total = len(required)
    score = 100 if total == 0 else int(round((len(satisfied) / total) * 100))
    return {
        'score': score,
        'required_count': total,
        'satisfied_count': len(satisfied),
        'required_items': required,
        'satisfied_items': satisfied,
        'missing_items': missing,
        'staleness_seconds': staleness_seconds,
    }


def _enrich_action_payload_contract(
    action_type: str,
    payload: Dict[str, Any],
    capability: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    enriched = dict(payload or {})
    cap = capability or _resolve_action_capability(action_type)
    enriched['expected_skills'] = _merge_unique_strings(
        cap.get('expected_skills') or [],
        (enriched.get('expected_skills') if isinstance(enriched.get('expected_skills'), list) else []),
    )
    enriched['minimum_context_requirements'] = _merge_unique_strings(
        cap.get('minimum_context_requirements') or [],
        (enriched.get('minimum_context_requirements') if isinstance(enriched.get('minimum_context_requirements'), list) else []),
    )
    enriched['required_feishu_scopes'] = _merge_unique_strings(
        cap.get('required_feishu_scopes') or [],
        (enriched.get('required_feishu_scopes') if isinstance(enriched.get('required_feishu_scopes'), list) else []),
    )
    return enriched


def _evaluate_execution_gates(
    account: Account,
    row: AssistantActionPlan,
    payload: Dict[str, Any],
    policy: Dict[str, Any],
    capability: Dict[str, Any],
) -> Dict[str, Any]:
    scope_proof = _resolve_scope_proof(account, capability)
    context_coverage = _build_context_coverage(account, payload, capability)
    min_context_coverage = _clamp_int(payload.get('min_context_coverage', 60), 0, 100)

    if not policy.get('enabled', True):
        return {
            'ok': False,
            'message': '该动作类型已被策略禁用',
            'failed_step': 'policy',
            'why_blocked': 'policy_disabled',
            'missing_scopes': [],
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    if row.risk_level not in set(policy.get('allowed_risk_levels', DEFAULT_ALLOWED_RISK_LEVELS)):
        return {
            'ok': False,
            'message': f'该风险等级不在策略允许范围内: {row.risk_level}',
            'failed_step': 'policy',
            'why_blocked': 'risk_not_allowed',
            'missing_scopes': [],
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    if int(payload.get('priority_score', 0) or 0) < int(policy.get('min_priority_score', 0) or 0):
        return {
            'ok': False,
            'message': '动作优先级低于策略阈值，禁止执行',
            'failed_step': 'policy',
            'why_blocked': 'priority_below_threshold',
            'missing_scopes': [],
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    if int(payload.get('confidence_score', 0) or 0) < int(policy.get('min_confidence_score', 0) or 0):
        return {
            'ok': False,
            'message': '动作置信度低于策略阈值，禁止执行',
            'failed_step': 'policy',
            'why_blocked': 'confidence_below_threshold',
            'missing_scopes': [],
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    if policy.get('requires_confirmation', True) and row.status != AssistantActionPlan.Status.CONFIRMED:
        return {
            'ok': False,
            'message': '策略要求先确认后执行',
            'failed_step': 'confirmation',
            'why_blocked': 'confirmation_required',
            'missing_scopes': [],
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    for permission_code in capability.get('required_permissions', []):
        if not _has_permission(account, permission_code):
            return {
                'ok': False,
                'message': f'缺少权限: {permission_code}',
                'failed_step': 'permission',
                'why_blocked': 'missing_permission',
                'missing_scopes': [],
                'required_vs_granted_scopes': scope_proof,
                'context_coverage': context_coverage,
            }
    if capability.get('target_system') == 'feishu' and not _has_feishu_user_token(account.id):
        missing = scope_proof.get('required') or []
        return {
            'ok': False,
            'message': '缺少有效飞书用户授权，请先重新登录飞书完成授权',
            'failed_step': 'scope',
            'why_blocked': 'missing_feishu_token',
            'missing_scopes': missing,
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    if scope_proof.get('missing'):
        return {
            'ok': False,
            'message': f"缺少飞书权限范围: {', '.join(scope_proof.get('missing') or [])}",
            'failed_step': 'scope',
            'why_blocked': 'missing_scope',
            'missing_scopes': scope_proof.get('missing', []),
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    if int(context_coverage.get('required_count', 0) or 0) > 0 and int(context_coverage.get('score', 0) or 0) < min_context_coverage:
        return {
            'ok': False,
            'message': (
                f"上下文完整性不足（{context_coverage.get('score', 0)} < {min_context_coverage}），"
                "请先补齐缺失上下文后重试"
            ),
            'failed_step': 'context',
            'why_blocked': 'context_insufficient',
            'missing_scopes': [],
            'required_vs_granted_scopes': scope_proof,
            'context_coverage': context_coverage,
        }
    return {
        'ok': True,
        'message': 'ok',
        'failed_step': '',
        'why_blocked': '',
        'missing_scopes': [],
        'required_vs_granted_scopes': scope_proof,
        'context_coverage': context_coverage,
    }


def _check_execution_gates(
    account: Account,
    row: AssistantActionPlan,
    payload: Dict[str, Any],
    policy: Dict[str, Any],
    capability: Dict[str, Any],
) -> Optional[str]:
    gate = _evaluate_execution_gates(
        account=account,
        row=row,
        payload=payload,
        policy=policy,
        capability=capability,
    )
    if gate.get('ok'):
        return None
    return str(gate.get('message') or '执行门禁未通过')


def _build_execution_result(
    status: str,
    message: str,
    capability: Dict[str, Any],
    trace_id: str,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    result = {
        'status': status,
        'message': message,
        'capability_key': capability.get('capability_key', ''),
        'target_system': capability.get('target_system', 'cn_kis'),
        'operator_mode': capability.get('operator_mode', ASSISTANT_DEFAULT_OPERATOR_MODE),
        'trace_id': trace_id,
        'execution_path': capability.get('executor', ''),
    }
    if extra:
        result.update(extra)
    return result


def _normalized_action_types(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    normalized = []
    for item in values:
        s = str(item or '').strip()
        if s and s not in normalized:
            normalized.append(s)
    return normalized


def _normalize_research_route_overrides(values: Any) -> Dict[str, str]:
    if not isinstance(values, dict):
        return {}
    normalized: Dict[str, str] = {}
    for card_type, route in values.items():
        card = str(card_type or '').strip()
        route_value = str(route or '').strip()
        if card not in RESEARCH_CARD_TYPES:
            continue
        if route_value not in RESEARCH_ROUTE_OPTIONS:
            continue
        normalized[card] = route_value
    return normalized


def _normalize_risk_level(value: Any, default: str = 'medium') -> str:
    v = str(value or default).strip().lower()
    return v if v in {'low', 'medium', 'high'} else default


def _normalize_approval_mode(value: Any, default: str = 'graded') -> str:
    v = str(value or default).strip().lower()
    return v if v in {'graded', 'direct'} else default


def _normalize_route_governance_thresholds(values: Any) -> Dict[str, Any]:
    base = dict((ASSISTANT_DEFAULT_PREFERENCES.get('route_governance_thresholds') or {}))
    incoming = values if isinstance(values, dict) else {}
    merged = {**base, **incoming}
    merged['coverage_rate_min'] = max(0.0, min(1.0, float(merged.get('coverage_rate_min', 0.5) or 0.5)))
    merged['applied_7d_min'] = max(0, int(merged.get('applied_7d_min', 1) or 1))
    merged['alert_days'] = max(7, min(90, int(merged.get('alert_days', 30) or 30)))
    merged['override_hit_rate_threshold'] = max(0.0, min(1.0, float(merged.get('override_hit_rate_threshold', 0.6) or 0.6)))
    merged['override_success_rate_threshold'] = max(0.0, min(1.0, float(merged.get('override_success_rate_threshold', 0.5) or 0.5)))
    merged['fallback_rate_threshold'] = max(0.0, min(1.0, float(merged.get('fallback_rate_threshold', 0.25) or 0.25)))
    merged['min_applied_threshold'] = max(1, int(merged.get('min_applied_threshold', 5) or 5))
    merged['cooldown_hours'] = max(1, min(72, int(merged.get('cooldown_hours', 12) or 12)))
    return merged


def get_assistant_preferences(account: Account) -> Dict[str, Any]:
    row = AssistantUserPreference.objects.filter(
        account_id=account.id,
        preference_key=ASSISTANT_PREFERENCE_KEY,
    ).first()
    value = dict(ASSISTANT_DEFAULT_PREFERENCES)
    if row and isinstance(row.preference_value, dict):
        merged = dict(value)
        merged.update(row.preference_value)
        value = merged
    value['focus_action_types'] = _normalized_action_types(value.get('focus_action_types'))
    value['blocked_action_types'] = _normalized_action_types(value.get('blocked_action_types'))
    value['daily_digest_hour'] = _clamp_int(value.get('daily_digest_hour', 18), 0, 23)
    default_provider = str(value.get('chat_default_provider') or 'auto').strip().lower()
    if default_provider not in ['auto', 'ark', 'kimi']:
        default_provider = 'auto'
    fallback_provider = str(value.get('chat_fallback_provider') or 'auto').strip().lower()
    if fallback_provider not in ['auto', 'ark', 'kimi']:
        fallback_provider = 'auto'
    value['chat_default_provider'] = default_provider
    value['chat_allow_fallback'] = bool(value.get('chat_allow_fallback', True))
    value['chat_fallback_provider'] = fallback_provider
    value['research_route_overrides'] = _normalize_research_route_overrides(value.get('research_route_overrides', {}))
    value['route_governance_auto_execute_enabled'] = bool(value.get('route_governance_auto_execute_enabled', False))
    value['route_governance_auto_execute_max_risk'] = _normalize_risk_level(
        value.get('route_governance_auto_execute_max_risk', 'medium'),
        default='medium',
    )
    value['route_governance_auto_execute_min_confidence'] = _clamp_int(
        value.get('route_governance_auto_execute_min_confidence', 75), 1, 100
    )
    value['route_governance_auto_execute_min_priority'] = _clamp_int(
        value.get('route_governance_auto_execute_min_priority', 70), 1, 100
    )
    value['route_governance_auto_execute_approval_mode'] = _normalize_approval_mode(
        value.get('route_governance_auto_execute_approval_mode', 'graded'),
        default='graded',
    )
    value['route_governance_thresholds'] = _normalize_route_governance_thresholds(
        value.get('route_governance_thresholds', {})
    )
    return {
        'preference_key': ASSISTANT_PREFERENCE_KEY,
        'value': value,
        'updated_at': row.updated_at.isoformat() if row else None,
    }


def upsert_assistant_preferences(account: Account, payload: Dict[str, Any]) -> Dict[str, Any]:
    current = get_assistant_preferences(account).get('value', {})
    merged = dict(current)
    merged.update(payload or {})
    merged['summary_tone'] = str(merged.get('summary_tone') or 'ops').strip() or 'ops'
    merged['focus_action_types'] = _normalized_action_types(merged.get('focus_action_types'))
    merged['blocked_action_types'] = _normalized_action_types(merged.get('blocked_action_types'))
    merged['daily_digest_hour'] = _clamp_int(merged.get('daily_digest_hour', 18), 0, 23)
    merged['chat_default_provider'] = str(merged.get('chat_default_provider') or 'auto').strip().lower()
    if merged['chat_default_provider'] not in ['auto', 'ark', 'kimi']:
        merged['chat_default_provider'] = 'auto'
    merged['chat_allow_fallback'] = bool(merged.get('chat_allow_fallback', True))
    merged['chat_fallback_provider'] = str(merged.get('chat_fallback_provider') or 'auto').strip().lower()
    if merged['chat_fallback_provider'] not in ['auto', 'ark', 'kimi']:
        merged['chat_fallback_provider'] = 'auto'
    merged['research_route_overrides'] = _normalize_research_route_overrides(merged.get('research_route_overrides', {}))
    merged['route_governance_auto_execute_enabled'] = bool(merged.get('route_governance_auto_execute_enabled', False))
    merged['route_governance_auto_execute_max_risk'] = _normalize_risk_level(
        merged.get('route_governance_auto_execute_max_risk', 'medium'),
        default='medium',
    )
    merged['route_governance_auto_execute_min_confidence'] = _clamp_int(
        merged.get('route_governance_auto_execute_min_confidence', 75), 1, 100
    )
    merged['route_governance_auto_execute_min_priority'] = _clamp_int(
        merged.get('route_governance_auto_execute_min_priority', 70), 1, 100
    )
    merged['route_governance_auto_execute_approval_mode'] = _normalize_approval_mode(
        merged.get('route_governance_auto_execute_approval_mode', 'graded'),
        default='graded',
    )
    merged['route_governance_thresholds'] = _normalize_route_governance_thresholds(
        merged.get('route_governance_thresholds', {})
    )

    row, _ = AssistantUserPreference.objects.update_or_create(
        account_id=account.id,
        preference_key=ASSISTANT_PREFERENCE_KEY,
        defaults={
            'preference_value': merged,
            'updated_by': account.id,
        },
    )
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.UPDATE,
            resource_type='assistant_preference',
            resource_id=str(row.id),
            resource_name=ASSISTANT_PREFERENCE_KEY,
            description='更新子衿个人偏好',
            new_value=merged,
        )
    except Exception as e:
        logger.warning(f'偏好审计写入失败: {e}')

    return {
        'ok': True,
        'message': '偏好已保存',
        'preference_key': ASSISTANT_PREFERENCE_KEY,
        'value': merged,
        'updated_at': row.updated_at.isoformat(),
    }


def get_research_route_preferences(account: Account) -> Dict[str, Any]:
    value = get_assistant_preferences(account).get('value', {})
    return {
        'overrides': _normalize_research_route_overrides(value.get('research_route_overrides', {})),
    }


def upsert_research_route_preferences(account: Account, overrides: Dict[str, Any]) -> Dict[str, Any]:
    current = get_assistant_preferences(account).get('value', {})
    merged_overrides = _normalize_research_route_overrides(current.get('research_route_overrides', {}))
    if isinstance(overrides, dict):
        for card_type, route in overrides.items():
            card = str(card_type or '').strip()
            route_value = str(route or '').strip().lower()
            if card not in RESEARCH_CARD_TYPES:
                continue
            if route_value in ['', 'auto', 'none']:
                merged_overrides.pop(card, None)
                continue
            if route_value in RESEARCH_ROUTE_OPTIONS:
                merged_overrides[card] = route_value
    save_result = upsert_assistant_preferences(
        account=account,
        payload={'research_route_overrides': merged_overrides},
    )
    return {
        'ok': bool(save_result.get('ok')),
        'message': save_result.get('message', ''),
        'overrides': _normalize_research_route_overrides((save_result.get('value') or {}).get('research_route_overrides', {})),
    }


def get_route_governance_thresholds(account: Account) -> Dict[str, Any]:
    value = get_assistant_preferences(account).get('value', {})
    thresholds = _normalize_route_governance_thresholds(value.get('route_governance_thresholds', {}))
    return {'thresholds': thresholds}


def upsert_route_governance_thresholds(account: Account, payload: Dict[str, Any]) -> Dict[str, Any]:
    current = get_route_governance_thresholds(account).get('thresholds', {})
    merged = _normalize_route_governance_thresholds({**current, **(payload or {})})
    save_result = upsert_assistant_preferences(
        account=account,
        payload={'route_governance_thresholds': merged},
    )
    changed_fields = [k for k in merged.keys() if current.get(k) != merged.get(k)]
    if changed_fields:
        try:
            from apps.audit.services import log_audit
            from apps.audit.models import AuditAction
            log_audit(
                account_id=account.id,
                account_name=account.display_name or account.username,
                account_type=account.account_type,
                action=AuditAction.UPDATE,
                resource_type='assistant_route_governance_threshold',
                resource_id=f'{account.id}:route_governance_thresholds',
                resource_name='route_governance_thresholds',
                description='更新路径治理告警阈值',
                old_value=current,
                new_value=merged,
                changed_fields=changed_fields,
            )
        except Exception as e:
            logger.warning(f'路径治理阈值审计写入失败: {e}')
    return {
        'ok': bool(save_result.get('ok')),
        'message': save_result.get('message', ''),
        'changed_fields': changed_fields,
        'thresholds': _normalize_route_governance_thresholds((save_result.get('value') or {}).get('route_governance_thresholds', {})),
    }


def create_daily_digest_action_if_due(account: Account, force: bool = False) -> Dict[str, Any]:
    """
    P3.4：按个人节律生成“日报准备”动作（进入动作箱待确认）
    """
    preference = get_assistant_preferences(account).get('value', {})
    digest_hour = _clamp_int(preference.get('daily_digest_hour', 18), 0, 23)
    now = timezone.now()
    if not force and now.hour < digest_hour:
        return {'created': False, 'message': f'尚未到日报触发时段（{digest_hour}:00）'}
    if _has_today_digest_action(account.id):
        return {'created': False, 'message': '今日已存在日报动作'}

    policy = _get_action_policy(account.id, 'daily_digest_prepare')
    if not policy.get('enabled', True):
        return {'created': False, 'message': '日报动作被策略禁用'}

    priority_score = max(40, int(policy.get('min_priority_score', 0) or 0))
    confidence_score = max(70, int(policy.get('min_confidence_score', 0) or 0))
    payload = {
        'source': 'assistant_scheduler',
        'intent': 'routine_ops',
        'reason': f'已到达个人日报时段 {digest_hour}:00，建议先生成日报草稿',
        'evidence': [{'module': 'assistant_preference', 'metric': 'daily_digest_hour', 'value': digest_hour}],
        'priority_score': _clamp_int(priority_score, 1, 100),
        'confidence_score': _clamp_int(confidence_score, 1, 100),
        'conflict_key': f'digest:daily:{now.date().isoformat()}',
        'summary_type': 'daily',
    }
    payload = _enrich_action_payload_contract('daily_digest_prepare', payload)

    row = AssistantActionPlan.objects.create(
        account_id=account.id,
        context_snapshot_id=None,
        action_type='daily_digest_prepare',
        title='生成今日日报草稿',
        description='基于当前上下文生成日报草稿（执行后可继续编辑/发送）',
        action_payload=payload,
        risk_level=AssistantActionPlan.RiskLevel.LOW,
        status=AssistantActionPlan.Status.PENDING_CONFIRM,
        requires_confirmation=bool(policy.get('requires_confirmation', True)),
    )
    return {
        'created': True,
        'message': '已生成日报动作',
        'item': {
            'id': row.id,
            'action_type': row.action_type,
            'title': row.title,
            'status': row.status,
            'created_at': row.created_at.isoformat(),
        },
    }


def run_daily_digest_scheduler(
    force: bool = False,
    dry_run: bool = False,
    account_ids: Optional[List[int]] = None,
    limit: int = 200,
) -> Dict[str, Any]:
    """
    P3.5：批量扫描账号并触发日报动作生成
    """
    from apps.identity.models import AccountStatus, AccountType

    limit = max(1, min(1000, int(limit or 200)))
    qs = Account.objects.filter(
        is_deleted=False,
        status=AccountStatus.ACTIVE,
        account_type__in=[AccountType.INTERNAL, 'staff'],  # 兼容历史 staff 账号类型
    ).order_by('id')
    if account_ids:
        qs = qs.filter(id__in=account_ids)
    accounts = list(qs[:limit])

    summary = {
        'scanned': len(accounts),
        'eligible': 0,
        'created': 0,
        'skipped': 0,
        'errors': 0,
    }
    details = []
    for account in accounts:
        # 仅对具备 assistant.summary.generate 权限的账号执行
        if not _has_permission(account, 'assistant.summary.generate'):
            summary['skipped'] += 1
            details.append({'account_id': account.id, 'status': 'skipped', 'reason': 'missing_permission'})
            continue
        summary['eligible'] += 1
        if dry_run:
            details.append({'account_id': account.id, 'status': 'dry_run'})
            continue
        try:
            result = create_daily_digest_action_if_due(account=account, force=force)
            if result.get('created'):
                summary['created'] += 1
                details.append({'account_id': account.id, 'status': 'created'})
            else:
                summary['skipped'] += 1
                details.append({'account_id': account.id, 'status': 'skipped', 'reason': result.get('message', '')})
        except Exception as e:
            summary['errors'] += 1
            details.append({'account_id': account.id, 'status': 'error', 'reason': str(e)})
            logger.exception('daily digest scheduler failed for account=%s', account.id)

    return {
        'force': force,
        'dry_run': dry_run,
        'limit': limit,
        'account_ids': account_ids or [],
        'summary': summary,
        'details': details,
    }


def run_assistant_scheduler(
    force: bool = False,
    dry_run: bool = False,
    account_ids: Optional[List[int]] = None,
    limit: int = 200,
    enable_daily_digest: bool = True,
    enable_route_governance: bool = True,
    route_days: int = 30,
    route_override_hit_rate_threshold: float = 0.6,
    route_override_success_rate_threshold: float = 0.5,
    route_fallback_rate_threshold: float = 0.25,
    route_min_applied_threshold: int = 5,
    route_cooldown_hours: int = 12,
    auto_execute_route_governance_alert: bool = False,
    auto_execute_max_risk: str = 'medium',
    auto_execute_min_confidence: int = 75,
    auto_execute_min_priority: int = 70,
    auto_execute_approval_mode: str = 'graded',
) -> Dict[str, Any]:
    """
    P3.25：统一调度入口（日报动作 + 路径治理告警巡检）。
    """
    from apps.identity.models import AccountStatus, AccountType

    limit = max(1, min(1000, int(limit or 200)))
    qs = Account.objects.filter(
        is_deleted=False,
        status=AccountStatus.ACTIVE,
        account_type__in=[AccountType.INTERNAL, 'staff'],  # 兼容历史 staff 账号类型
    ).order_by('id')
    if account_ids:
        qs = qs.filter(id__in=account_ids)
    accounts = list(qs[:limit])

    summary = {
        'scanned': len(accounts),
        'eligible': 0,
        'created': 0,
        'skipped': 0,
        'errors': 0,
        'jobs': {
            'daily_digest': {'enabled': bool(enable_daily_digest), 'created': 0, 'skipped': 0, 'errors': 0},
            'route_governance_alert': {
                'enabled': bool(enable_route_governance),
                'created': 0,
                'skipped': 0,
                'errors': 0,
                'auto_confirmed': 0,
                'auto_executed': 0,
                'auto_feedback_written': 0,
                'auto_execute_skipped': 0,
                'auto_execute_errors': 0,
            },
        },
    }
    risk_rank = {'low': 1, 'medium': 2, 'high': 3}
    cli_max_risk = _normalize_risk_level(auto_execute_max_risk, default='medium')
    cli_min_conf = _clamp_int(auto_execute_min_confidence, 1, 100)
    cli_min_pri = _clamp_int(auto_execute_min_priority, 1, 100)
    cli_mode = _normalize_approval_mode(auto_execute_approval_mode, default='graded')
    details = []
    for account in accounts:
        if not _has_permission(account, 'assistant.summary.generate'):
            summary['skipped'] += 1
            details.append({'account_id': account.id, 'status': 'skipped', 'reason': 'missing_permission'})
            continue
        summary['eligible'] += 1
        account_detail: Dict[str, Any] = {'account_id': account.id, 'jobs': []}
        if dry_run:
            if enable_daily_digest:
                account_detail['jobs'].append({'job': 'daily_digest', 'status': 'dry_run'})
            if enable_route_governance:
                account_detail['jobs'].append({'job': 'route_governance_alert', 'status': 'dry_run'})
            details.append(account_detail)
            continue

        if enable_daily_digest:
            try:
                digest_result = create_daily_digest_action_if_due(account=account, force=force)
                if digest_result.get('created'):
                    summary['created'] += 1
                    summary['jobs']['daily_digest']['created'] += 1
                    account_detail['jobs'].append({'job': 'daily_digest', 'status': 'created'})
                else:
                    summary['skipped'] += 1
                    summary['jobs']['daily_digest']['skipped'] += 1
                    account_detail['jobs'].append({
                        'job': 'daily_digest',
                        'status': 'skipped',
                        'reason': digest_result.get('message', ''),
                    })
            except Exception as e:
                summary['errors'] += 1
                summary['jobs']['daily_digest']['errors'] += 1
                account_detail['jobs'].append({'job': 'daily_digest', 'status': 'error', 'reason': str(e)})
                logger.exception('assistant scheduler daily_digest failed for account=%s', account.id)

        if enable_route_governance:
            try:
                route_result = create_route_governance_alert_action_if_due(
                    account=account,
                    days=route_days,
                    override_hit_rate_threshold=route_override_hit_rate_threshold,
                    override_success_rate_threshold=route_override_success_rate_threshold,
                    fallback_rate_threshold=route_fallback_rate_threshold,
                    min_applied_threshold=route_min_applied_threshold,
                    cooldown_hours=route_cooldown_hours,
                    force=force,
                )
                if route_result.get('created'):
                    summary['created'] += 1
                    summary['jobs']['route_governance_alert']['created'] += 1
                    route_job = {'job': 'route_governance_alert', 'status': 'created'}
                    if auto_execute_route_governance_alert:
                        action_id = int(((route_result.get('item') or {}).get('id') or 0))
                        row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first() if action_id else None
                        if not row:
                            summary['jobs']['route_governance_alert']['auto_execute_errors'] += 1
                            route_job['auto_execute'] = {'status': 'error', 'reason': 'action_not_found'}
                        elif not _has_permission(account, 'assistant.automation.execute'):
                            summary['jobs']['route_governance_alert']['auto_execute_skipped'] += 1
                            route_job['auto_execute'] = {'status': 'skipped', 'reason': 'missing_permission'}
                        else:
                            preference = get_assistant_preferences(account).get('value', {})
                            pref_enabled = bool(preference.get('route_governance_auto_execute_enabled', False))
                            effective_auto_execute = bool(auto_execute_route_governance_alert or pref_enabled)
                            effective_max_risk = (
                                cli_max_risk if auto_execute_route_governance_alert
                                else _normalize_risk_level(preference.get('route_governance_auto_execute_max_risk', 'medium'))
                            )
                            effective_min_conf = (
                                cli_min_conf if auto_execute_route_governance_alert
                                else _clamp_int(preference.get('route_governance_auto_execute_min_confidence', 75), 1, 100)
                            )
                            effective_min_pri = (
                                cli_min_pri if auto_execute_route_governance_alert
                                else _clamp_int(preference.get('route_governance_auto_execute_min_priority', 70), 1, 100)
                            )
                            effective_mode = (
                                cli_mode if auto_execute_route_governance_alert
                                else _normalize_approval_mode(preference.get('route_governance_auto_execute_approval_mode', 'graded'))
                            )
                            if not effective_auto_execute:
                                summary['jobs']['route_governance_alert']['auto_execute_skipped'] += 1
                                route_job['auto_execute'] = {'status': 'skipped', 'reason': 'auto_execute_disabled'}
                                account_detail['jobs'].append(route_job)
                                continue
                            payload = row.action_payload or {}
                            row_risk = str(row.risk_level or '').strip().lower()
                            priority = int(payload.get('priority_score', 0) or 0)
                            confidence = int(payload.get('confidence_score', 0) or 0)
                            if risk_rank.get(row_risk, 99) > risk_rank.get(effective_max_risk, 2):
                                summary['jobs']['route_governance_alert']['auto_execute_skipped'] += 1
                                route_job['auto_execute'] = {'status': 'skipped', 'reason': f'risk>{effective_max_risk}'}
                            else:
                                confirm_result = confirm_action(account=account, action_id=row.id)
                                if not confirm_result.get('ok'):
                                    summary['jobs']['route_governance_alert']['auto_execute_errors'] += 1
                                    route_job['auto_execute'] = {
                                        'status': 'error',
                                        'reason': f'confirm_failed:{confirm_result.get("message", "")}',
                                    }
                                else:
                                    summary['jobs']['route_governance_alert']['auto_confirmed'] += 1
                                    should_execute = True
                                    if effective_mode == 'graded' and row_risk == 'high':
                                        should_execute = False
                                    if priority < effective_min_pri or confidence < effective_min_conf:
                                        should_execute = False
                                    if not should_execute:
                                        summary['jobs']['route_governance_alert']['auto_execute_skipped'] += 1
                                        route_job['auto_execute'] = {
                                            'status': 'confirmed_only',
                                            'reason': 'graded_gate_or_threshold',
                                        }
                                    else:
                                        execute_result = execute_action(account=account, action_id=row.id, override_payload={})
                                        if execute_result.get('ok'):
                                            summary['jobs']['route_governance_alert']['auto_executed'] += 1
                                            route_job['auto_execute'] = {'status': 'executed'}
                                            # 分级模式下：低风险自动补写一条高分反馈
                                            if effective_mode == 'graded' and row_risk == 'low':
                                                has_feedback = AssistantActionFeedback.objects.filter(
                                                    action_plan_id=row.id,
                                                    account_id=account.id,
                                                ).exists()
                                                if not has_feedback:
                                                    fb = submit_action_feedback(
                                                        account=account,
                                                        action_id=row.id,
                                                        adopted=True,
                                                        score=5,
                                                        note='auto:scheduler:route_governance:low_risk_executed',
                                                    )
                                                    if fb.get('ok'):
                                                        summary['jobs']['route_governance_alert']['auto_feedback_written'] += 1
                                        else:
                                            summary['jobs']['route_governance_alert']['auto_execute_errors'] += 1
                                            route_job['auto_execute'] = {
                                                'status': 'error',
                                                'reason': f'execute_failed:{execute_result.get("message", "")}',
                                            }
                    account_detail['jobs'].append(route_job)
                else:
                    summary['skipped'] += 1
                    summary['jobs']['route_governance_alert']['skipped'] += 1
                    account_detail['jobs'].append({
                        'job': 'route_governance_alert',
                        'status': 'skipped',
                        'reason': route_result.get('message', ''),
                    })
            except Exception as e:
                summary['errors'] += 1
                summary['jobs']['route_governance_alert']['errors'] += 1
                account_detail['jobs'].append({'job': 'route_governance_alert', 'status': 'error', 'reason': str(e)})
                logger.exception('assistant scheduler route_governance failed for account=%s', account.id)

        details.append(account_detail)

    return {
        'force': force,
        'dry_run': dry_run,
        'limit': limit,
        'account_ids': account_ids or [],
        'summary': summary,
        'details': details,
    }


def create_fallback_alert_action_if_due(
    account: Account,
    days: int = 7,
    fallback_failed_threshold: int = 3,
    fallback_rate_threshold: float = 0.08,
    cooldown_hours: int = 12,
    force: bool = False,
) -> Dict[str, Any]:
    """
    P3.9：当智能体通道回退失败率超过阈值时，写入子衿动作箱告警动作。
    """
    from apps.agent_gateway.services import get_fallback_metrics

    days = max(1, min(30, int(days or 7)))
    fallback_failed_threshold = max(1, int(fallback_failed_threshold or 3))
    fallback_rate_threshold = max(0.0, min(1.0, float(fallback_rate_threshold or 0.08)))
    cooldown_hours = max(1, min(72, int(cooldown_hours or 12)))
    now = timezone.now()

    metrics = get_fallback_metrics(days=days)
    summary = metrics.get('summary', {}) or {}
    total_calls = int(summary.get('total_calls', 0) or 0)
    fallback_failed = int(summary.get('fallback_failed', 0) or 0)
    fallback_rate = float(summary.get('fallback_rate', 0.0) or 0.0)

    if total_calls <= 0:
        return {'created': False, 'message': '窗口期内无智能体调用数据'}
    if not force:
        if fallback_failed < fallback_failed_threshold and fallback_rate < fallback_rate_threshold:
            return {
                'created': False,
                'message': (
                    f'未达到告警阈值（failed={fallback_failed}/{fallback_failed_threshold}, '
                    f'rate={fallback_rate:.1%}/{fallback_rate_threshold:.1%}）'
                ),
            }

    conflict_key = f'agent:fallback_alert:d{days}'
    cooldown_cutoff = now - timedelta(hours=cooldown_hours)
    exists = AssistantActionPlan.objects.filter(
        account_id=account.id,
        action_type='agent_channel_alert',
        created_at__gte=cooldown_cutoff,
        status__in=[
            AssistantActionPlan.Status.SUGGESTED,
            AssistantActionPlan.Status.PENDING_CONFIRM,
            AssistantActionPlan.Status.CONFIRMED,
            AssistantActionPlan.Status.EXECUTED,
        ],
        action_payload__conflict_key=conflict_key,
    ).exists()
    if exists and not force:
        return {'created': False, 'message': f'冷却期内已存在通道告警动作（{cooldown_hours}h）'}

    top_errors = (metrics.get('error_types') or [])[:3]
    top_agents = (metrics.get('by_agent') or [])[:3]
    over_failed = fallback_failed >= fallback_failed_threshold
    over_rate = fallback_rate >= fallback_rate_threshold
    severity = 'high' if (fallback_failed >= fallback_failed_threshold * 2 or fallback_rate >= fallback_rate_threshold * 2) else 'medium'
    risk_level = (
        AssistantActionPlan.RiskLevel.HIGH if severity == 'high' else AssistantActionPlan.RiskLevel.MEDIUM
    )
    priority_score = 60 + min(35, fallback_failed * 3 + int(fallback_rate * 100))
    confidence_score = 78 if (over_failed or over_rate) else 65

    payload = {
        'source': 'agent_gateway_fallback_monitor',
        'intent': 'stability_ops',
        'window_days': days,
        'severity': severity,
        'reason': (
            f'检测到智能体通道稳定性异常：近{days}天回退失败 {fallback_failed} 次，'
            f'回退触发率 {fallback_rate:.1%}'
        ),
        'evidence': [
            {'module': 'agent_gateway', 'metric': 'fallback_failed', 'value': fallback_failed},
            {'module': 'agent_gateway', 'metric': 'fallback_rate', 'value': round(fallback_rate, 4)},
            {'module': 'agent_gateway', 'metric': 'total_calls', 'value': total_calls},
            {'module': 'agent_gateway', 'metric': 'error_types_top3', 'value': top_errors},
            {'module': 'agent_gateway', 'metric': 'by_agent_top3', 'value': top_agents},
        ],
        'priority_score': _clamp_int(priority_score, 1, 100),
        'confidence_score': _clamp_int(confidence_score, 1, 100),
        'conflict_key': conflict_key,
        'threshold': {
            'fallback_failed': fallback_failed_threshold,
            'fallback_rate': fallback_rate_threshold,
        },
    }
    payload = _enrich_action_payload_contract('agent_channel_alert', payload)

    policy = _get_action_policy(account.id, 'agent_channel_alert')
    if not policy.get('enabled', True):
        return {'created': False, 'message': '通道告警动作被策略禁用'}
    if risk_level not in set(policy.get('allowed_risk_levels', DEFAULT_ALLOWED_RISK_LEVELS)):
        return {'created': False, 'message': '通道告警风险等级不在策略允许范围'}
    if int(payload.get('priority_score', 0) or 0) < int(policy.get('min_priority_score', 0) or 0):
        return {'created': False, 'message': '通道告警优先级低于策略阈值'}
    if int(payload.get('confidence_score', 0) or 0) < int(policy.get('min_confidence_score', 0) or 0):
        return {'created': False, 'message': '通道告警置信度低于策略阈值'}

    row = AssistantActionPlan.objects.create(
        account_id=account.id,
        context_snapshot_id=None,
        action_type='agent_channel_alert',
        title='智能体通道稳定性告警',
        description='检测到 ARK/Kimi 通道回退异常，建议优先排查模型配置、配额与网络状态',
        action_payload=payload,
        risk_level=risk_level,
        status=AssistantActionPlan.Status.PENDING_CONFIRM,
        requires_confirmation=bool(policy.get('requires_confirmation', True)),
    )
    return {
        'created': True,
        'message': '已生成通道稳定性告警动作',
        'item': {
            'id': row.id,
            'action_type': row.action_type,
            'title': row.title,
            'risk_level': row.risk_level,
            'status': row.status,
            'created_at': row.created_at.isoformat(),
        },
        'trigger': {
            'total_calls': total_calls,
            'fallback_failed': fallback_failed,
            'fallback_rate': round(fallback_rate, 4),
            'threshold': {
                'fallback_failed': fallback_failed_threshold,
                'fallback_rate': fallback_rate_threshold,
            },
        },
    }


def create_route_governance_alert_action_if_due(
    account: Account,
    days: int = 30,
    override_hit_rate_threshold: float = 0.6,
    override_success_rate_threshold: float = 0.5,
    fallback_rate_threshold: float = 0.25,
    min_applied_threshold: int = 5,
    cooldown_hours: int = 12,
    force: bool = False,
) -> Dict[str, Any]:
    """
    P3.24：当路径治理指标异常时，写入动作箱治理告警。
    """
    days = max(7, min(90, int(days or 30)))
    override_hit_rate_threshold = max(0.0, min(1.0, float(override_hit_rate_threshold or 0.6)))
    override_success_rate_threshold = max(0.0, min(1.0, float(override_success_rate_threshold or 0.5)))
    fallback_rate_threshold = max(0.0, min(1.0, float(fallback_rate_threshold or 0.25)))
    min_applied_threshold = max(1, int(min_applied_threshold or 5))
    cooldown_hours = max(1, min(72, int(cooldown_hours or 12)))
    now = timezone.now()

    metrics = get_assistant_route_metrics(days=days)
    totals = metrics.get('totals', {}) or {}
    applied = int(totals.get('applied', 0) or 0)
    override_hit_rate = float(metrics.get('override_hit_rate', 0.0) or 0.0)
    override_success_rate = float(metrics.get('override_success_rate', 0.0) or 0.0)
    fallback_rate = float(totals.get('fallback_rate', 0.0) or 0.0)

    if applied < min_applied_threshold:
        return {
            'created': False,
            'message': f'样本不足（applied={applied}，阈值={min_applied_threshold}）',
        }

    over_override_hit = override_hit_rate >= override_hit_rate_threshold
    under_override_success = override_success_rate <= override_success_rate_threshold
    over_fallback = fallback_rate >= fallback_rate_threshold
    if not force and not (over_override_hit or under_override_success or over_fallback):
        return {
            'created': False,
            'message': (
                f'未达到治理告警阈值（override_hit={override_hit_rate:.1%}/{override_hit_rate_threshold:.1%}, '
                f'override_success={override_success_rate:.1%}/{override_success_rate_threshold:.1%}, '
                f'fallback={fallback_rate:.1%}/{fallback_rate_threshold:.1%}）'
            ),
        }

    conflict_key = f'research:route_governance_alert:d{days}'
    cooldown_cutoff = now - timedelta(hours=cooldown_hours)
    exists = AssistantActionPlan.objects.filter(
        account_id=account.id,
        action_type='research_route_governance_alert',
        created_at__gte=cooldown_cutoff,
        status__in=[
            AssistantActionPlan.Status.SUGGESTED,
            AssistantActionPlan.Status.PENDING_CONFIRM,
            AssistantActionPlan.Status.CONFIRMED,
            AssistantActionPlan.Status.EXECUTED,
        ],
        action_payload__conflict_key=conflict_key,
    ).exists()
    if exists and not force:
        return {'created': False, 'message': f'冷却期内已存在治理告警动作（{cooldown_hours}h）'}

    high = (
        fallback_rate >= min(1.0, fallback_rate_threshold * 1.8)
        or (over_override_hit and under_override_success)
    )
    risk_level = AssistantActionPlan.RiskLevel.HIGH if high else AssistantActionPlan.RiskLevel.MEDIUM
    severity = 'high' if high else 'medium'
    priority_score = 62 + int(min(30, fallback_rate * 100 * 0.5 + override_hit_rate * 100 * 0.3))
    confidence_score = 80 if high else 72
    payload = {
        'source': 'assistant_route_governance_monitor',
        'intent': 'route_governance_ops',
        'window_days': days,
        'severity': severity,
        'reason': '路径治理指标异常，建议审查覆写策略并收敛推荐路径。',
        'evidence': [
            {'module': 'assistant_route', 'metric': 'applied', 'value': applied},
            {'module': 'assistant_route', 'metric': 'override_hit_rate', 'value': round(override_hit_rate, 4)},
            {'module': 'assistant_route', 'metric': 'override_success_rate', 'value': round(override_success_rate, 4)},
            {'module': 'assistant_route', 'metric': 'fallback_rate', 'value': round(fallback_rate, 4)},
        ],
        'priority_score': _clamp_int(priority_score, 1, 100),
        'confidence_score': _clamp_int(confidence_score, 1, 100),
        'conflict_key': conflict_key,
        'threshold': {
            'override_hit_rate': override_hit_rate_threshold,
            'override_success_rate': override_success_rate_threshold,
            'fallback_rate': fallback_rate_threshold,
            'min_applied': min_applied_threshold,
        },
    }
    payload = _enrich_action_payload_contract('research_route_governance_alert', payload)

    policy = _get_action_policy(account.id, 'research_route_governance_alert')
    if not policy.get('enabled', True):
        return {'created': False, 'message': '路径治理告警动作被策略禁用'}
    if risk_level not in set(policy.get('allowed_risk_levels', DEFAULT_ALLOWED_RISK_LEVELS)):
        return {'created': False, 'message': '路径治理告警风险等级不在策略允许范围'}
    if int(payload.get('priority_score', 0) or 0) < int(policy.get('min_priority_score', 0) or 0):
        return {'created': False, 'message': '路径治理告警优先级低于策略阈值'}
    if int(payload.get('confidence_score', 0) or 0) < int(policy.get('min_confidence_score', 0) or 0):
        return {'created': False, 'message': '路径治理告警置信度低于策略阈值'}

    row = AssistantActionPlan.objects.create(
        account_id=account.id,
        context_snapshot_id=None,
        action_type='research_route_governance_alert',
        title='研究路径治理告警',
        description='检测到覆写命中率/成功率/回退率异常，建议审查路径策略与人工覆写。',
        action_payload=payload,
        risk_level=risk_level,
        status=AssistantActionPlan.Status.PENDING_CONFIRM,
        requires_confirmation=bool(policy.get('requires_confirmation', True)),
    )
    return {
        'created': True,
        'message': '已生成路径治理告警动作',
        'item': {
            'id': row.id,
            'action_type': row.action_type,
            'title': row.title,
            'risk_level': row.risk_level,
            'status': row.status,
            'created_at': row.created_at.isoformat(),
        },
        'trigger': {
            'applied': applied,
            'override_hit_rate': round(override_hit_rate, 4),
            'override_success_rate': round(override_success_rate, 4),
            'fallback_rate': round(fallback_rate, 4),
        },
    }


def _make_etag(payload: Dict[str, Any]) -> str:
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.md5(serialized.encode('utf-8')).hexdigest()  # nosec B324


def _assistant_cache_metric_key(metric_date: date, endpoint: str, status: str) -> str:
    return f"assistant:cache:metric:{metric_date.isoformat()}:{endpoint}:{status}"


def _assistant_route_metric_key(metric_date: date, source: str, event: str) -> str:
    return f"assistant:route:metric:{metric_date.isoformat()}:{source}:{event}"


def record_assistant_cache_metric(endpoint: str, status: str) -> None:
    """
    P2.16：记录缓存观测计数（按日/端点/状态）
    """
    if endpoint not in ASSISTANT_CACHE_ENDPOINTS:
        return
    if status not in ASSISTANT_CACHE_STATUSES:
        return
    today = timezone.now().date()
    key = _assistant_cache_metric_key(today, endpoint, status)
    # Django cache 可能不支持原子 incr 初始化，做兼容处理
    try:
        cache.incr(key)
    except Exception:
        if cache.get(key) is None:
            cache.set(key, 1, ASSISTANT_CACHE_METRIC_TTL_SECONDS)
        else:
            try:
                cache.set(key, int(cache.get(key) or 0) + 1, ASSISTANT_CACHE_METRIC_TTL_SECONDS)
            except Exception:
                pass


_ROUTE_EVENT_TO_DB_TYPE = {
    'applied': 'route_applied',
    'success': 'route_success',
    'failed': 'route_failed',
    'fallback': 'route_fallback',
}


def record_assistant_route_metric(source: str, event: str) -> None:
    if source not in ASSISTANT_ROUTE_SOURCES:
        source = 'unknown'
    if event not in ASSISTANT_ROUTE_EVENTS:
        return
    today = timezone.now().date()
    key = _assistant_route_metric_key(today, source, event)
    try:
        cache.incr(key)
    except Exception:
        if cache.get(key) is None:
            cache.set(key, 1, ASSISTANT_ROUTE_METRIC_TTL_SECONDS)
        else:
            try:
                cache.set(key, int(cache.get(key) or 0) + 1, ASSISTANT_ROUTE_METRIC_TTL_SECONDS)
            except Exception:
                pass
    # 持久化到 DB（治理指标事件流，见 GOVERNANCE_METRICS_PERSISTENCE_DESIGN）
    db_event_type = _ROUTE_EVENT_TO_DB_TYPE.get(event)
    if db_event_type:
        try:
            from .models_governance import GovernanceMetricEvent
            GovernanceMetricEvent.objects.create(
                event_type=db_event_type,
                source=source,
                payload={},
            )
        except Exception as e:
            logger.warning('record_assistant_route_metric db write failed: %s', e)


def _get_assistant_route_metrics_from_cache(days: int) -> Dict[str, Any]:
    """从 cache 聚合路径治理指标（过渡期 fallback）。"""
    days = max(1, min(90, int(days)))
    today = timezone.now().date()
    by_source = {}
    totals = {e: 0 for e in ASSISTANT_ROUTE_EVENTS}
    totals['total'] = 0
    for source in ASSISTANT_ROUTE_SOURCES:
        row = {e: 0 for e in ASSISTANT_ROUTE_EVENTS}
        for offset in range(days - 1, -1, -1):
            d = today - timedelta(days=offset)
            for e in ASSISTANT_ROUTE_EVENTS:
                row[e] += int(cache.get(_assistant_route_metric_key(d, source, e)) or 0)
        row['total'] = row['applied']
        row['success_rate'] = round(row['success'] / row['applied'], 3) if row['applied'] > 0 else 0.0
        row['fallback_rate'] = round(row['fallback'] / row['applied'], 3) if row['applied'] > 0 else 0.0
        by_source[source] = row
        for e in ASSISTANT_ROUTE_EVENTS:
            totals[e] += row[e]
    totals['total'] = totals['applied']
    totals['success_rate'] = round(totals['success'] / totals['applied'], 3) if totals['applied'] > 0 else 0.0
    totals['fallback_rate'] = round(totals['fallback'] / totals['applied'], 3) if totals['applied'] > 0 else 0.0
    override_applied = int(by_source.get('override', {}).get('applied', 0))
    override_hit_rate = round(override_applied / totals['applied'], 3) if totals['applied'] > 0 else 0.0
    return {
        'window_days': days,
        'totals': totals,
        'by_source': by_source,
        'override_hit_rate': override_hit_rate,
        'override_success_rate': by_source.get('override', {}).get('success_rate', 0.0),
    }


def get_assistant_route_metrics_from_db(days: int = 30) -> Dict[str, Any]:
    """从 GovernanceMetricEvent 表聚合路径治理指标（持久化，支持长期趋势与审计）。"""
    from django.db.models import Count
    from .models_governance import GovernanceMetricEvent

    days = max(1, min(90, int(days or 30)))
    since = timezone.now() - timedelta(days=days)
    route_types = [
        GovernanceMetricEvent.EventType.ROUTE_APPLIED,
        GovernanceMetricEvent.EventType.ROUTE_SUCCESS,
        GovernanceMetricEvent.EventType.ROUTE_FAILED,
        GovernanceMetricEvent.EventType.ROUTE_FALLBACK,
    ]
    qs = (
        GovernanceMetricEvent.objects.filter(
            created_at__gte=since,
            event_type__in=route_types,
        )
        .values('source', 'event_type')
        .annotate(cnt=Count('id'))
    )
    by_source = {s: {e: 0 for e in ASSISTANT_ROUTE_EVENTS} for s in ASSISTANT_ROUTE_SOURCES}
    event_db_to_short = {
        'route_applied': 'applied',
        'route_success': 'success',
        'route_failed': 'failed',
        'route_fallback': 'fallback',
    }
    for row in qs:
        source = row['source'] if row['source'] in ASSISTANT_ROUTE_SOURCES else 'unknown'
        short = event_db_to_short.get(row['event_type'])
        if source not in by_source:
            by_source[source] = {e: 0 for e in ASSISTANT_ROUTE_EVENTS}
        if short:
            by_source[source][short] = row['cnt']
    totals = {e: 0 for e in ASSISTANT_ROUTE_EVENTS}
    totals['total'] = 0
    for source in ASSISTANT_ROUTE_SOURCES:
        row = by_source[source]
        row['total'] = row['applied']
        row['success_rate'] = round(row['success'] / row['applied'], 3) if row['applied'] > 0 else 0.0
        row['fallback_rate'] = round(row['fallback'] / row['applied'], 3) if row['applied'] > 0 else 0.0
        for e in ASSISTANT_ROUTE_EVENTS:
            totals[e] += row[e]
    totals['total'] = totals['applied']
    totals['success_rate'] = round(totals['success'] / totals['applied'], 3) if totals['applied'] > 0 else 0.0
    totals['fallback_rate'] = round(totals['fallback'] / totals['applied'], 3) if totals['applied'] > 0 else 0.0
    override_applied = int(by_source.get('override', {}).get('applied', 0))
    override_hit_rate = round(override_applied / totals['applied'], 3) if totals['applied'] > 0 else 0.0
    return {
        'window_days': days,
        'totals': totals,
        'by_source': by_source,
        'override_hit_rate': override_hit_rate,
        'override_success_rate': by_source.get('override', {}).get('success_rate', 0.0),
    }


def get_assistant_route_metrics(days: int = 30) -> Dict[str, Any]:
    """路径治理指标：优先从 DB 聚合，无数据时 fallback cache（双写过渡）。"""
    try:
        result = get_assistant_route_metrics_from_db(days)
        if result['totals']['applied'] > 0:
            return result
    except Exception as e:
        logger.warning('get_assistant_route_metrics_from_db failed: %s', e)
    return _get_assistant_route_metrics_from_cache(days)


def get_assistant_cache_metrics(days: int = 7) -> Dict[str, Any]:
    """
    P2.16：获取缓存观测指标
    """
    days = max(1, min(30, int(days or 7)))
    today = timezone.now().date()
    daily = []
    totals = {
        'HIT': 0,
        'MISS': 0,
        'REVALIDATED': 0,
        'total': 0,
    }
    endpoint_totals: Dict[str, Dict[str, int]] = {
        ep: {'HIT': 0, 'MISS': 0, 'REVALIDATED': 0, 'total': 0}
        for ep in ASSISTANT_CACHE_ENDPOINTS
    }

    for offset in range(days - 1, -1, -1):
        d = today - timedelta(days=offset)
        row = {'date': d.isoformat(), 'endpoints': {}, 'totals': {'HIT': 0, 'MISS': 0, 'REVALIDATED': 0, 'total': 0}}

        for ep in ASSISTANT_CACHE_ENDPOINTS:
            ep_row = {'HIT': 0, 'MISS': 0, 'REVALIDATED': 0, 'total': 0, 'hit_rate': 0.0}
            for st in ASSISTANT_CACHE_STATUSES:
                val = int(cache.get(_assistant_cache_metric_key(d, ep, st)) or 0)
                ep_row[st] = val
                ep_row['total'] += val
                row['totals'][st] += val
            ep_row['hit_rate'] = round(ep_row['HIT'] / ep_row['total'], 3) if ep_row['total'] > 0 else 0.0
            row['endpoints'][ep] = ep_row

        row['totals']['total'] = row['totals']['HIT'] + row['totals']['MISS'] + row['totals']['REVALIDATED']
        row['totals']['hit_rate'] = (
            round(row['totals']['HIT'] / row['totals']['total'], 3)
            if row['totals']['total'] > 0 else 0.0
        )
        daily.append(row)

        totals['HIT'] += row['totals']['HIT']
        totals['MISS'] += row['totals']['MISS']
        totals['REVALIDATED'] += row['totals']['REVALIDATED']
        totals['total'] += row['totals']['total']

        for ep in ASSISTANT_CACHE_ENDPOINTS:
            endpoint_totals[ep]['HIT'] += row['endpoints'][ep]['HIT']
            endpoint_totals[ep]['MISS'] += row['endpoints'][ep]['MISS']
            endpoint_totals[ep]['REVALIDATED'] += row['endpoints'][ep]['REVALIDATED']
            endpoint_totals[ep]['total'] += row['endpoints'][ep]['total']

    totals['hit_rate'] = round(totals['HIT'] / totals['total'], 3) if totals['total'] > 0 else 0.0
    for ep in ASSISTANT_CACHE_ENDPOINTS:
        et = endpoint_totals[ep]
        et['hit_rate'] = round(et['HIT'] / et['total'], 3) if et['total'] > 0 else 0.0

    return {
        'window_days': days,
        'totals': totals,
        'endpoint_totals': endpoint_totals,
        'daily': daily,
    }


def _clamp_int(value: float, min_value: int, max_value: int) -> int:
    return max(min_value, min(max_value, int(round(value))))


def _normalize_risk_levels(levels: Any) -> List[str]:
    valid = {'low', 'medium', 'high'}
    if not isinstance(levels, list):
        return []
    normalized = []
    for level in levels:
        lv = str(level or '').strip().lower()
        if lv in valid and lv not in normalized:
            normalized.append(lv)
    return normalized


def _get_action_policy(account_id: int, action_type: str) -> Dict[str, Any]:
    default = ASSISTANT_ACTION_DEFAULT_POLICIES.get(action_type, {})
    policy_row = AssistantActionPolicy.objects.filter(
        account_id=account_id,
        action_type=action_type,
    ).first()
    if policy_row:
        allowed = _normalize_risk_levels(policy_row.allowed_risk_levels)
        if not allowed:
            allowed = default.get('allowed_risk_levels') or DEFAULT_ALLOWED_RISK_LEVELS
        return {
            'action_type': action_type,
            'enabled': bool(policy_row.enabled),
            'requires_confirmation': bool(policy_row.requires_confirmation),
            'allowed_risk_levels': allowed,
            'min_priority_score': _clamp_int(policy_row.min_priority_score, 0, 100),
            'min_confidence_score': _clamp_int(policy_row.min_confidence_score, 0, 100),
            'source': 'custom',
        }
    return {
        'action_type': action_type,
        'enabled': bool(default.get('enabled', True)),
        'requires_confirmation': bool(default.get('requires_confirmation', True)),
        'allowed_risk_levels': default.get('allowed_risk_levels', DEFAULT_ALLOWED_RISK_LEVELS),
        'min_priority_score': _clamp_int(default.get('min_priority_score', 0), 0, 100),
        'min_confidence_score': _clamp_int(default.get('min_confidence_score', 0), 0, 100),
        'source': 'default',
    }


def get_assistant_policies(account: Account) -> Dict[str, Any]:
    rows = AssistantActionPolicy.objects.filter(account_id=account.id).order_by('action_type')
    custom_map = {r.action_type: r for r in rows}
    action_types = sorted(set(list(ASSISTANT_ACTION_DEFAULT_POLICIES.keys()) + list(custom_map.keys())))
    items = []
    for action_type in action_types:
        merged = _get_action_policy(account.id, action_type)
        capability = _resolve_action_capability(action_type)
        row = custom_map.get(action_type)
        items.append({
            **merged,
            'capability_key': capability.get('capability_key', ''),
            'target_system': capability.get('target_system', 'cn_kis'),
            'executor': capability.get('executor', 'cn_kis_adapter'),
            'operator_mode': capability.get('operator_mode', ASSISTANT_DEFAULT_OPERATOR_MODE),
            'required_permissions': capability.get('required_permissions', []),
            'required_feishu_scopes': capability.get('required_feishu_scopes', []),
            'expected_skills': capability.get('expected_skills', []),
            'minimum_context_requirements': capability.get('minimum_context_requirements', []),
            'policy_id': row.id if row else None,
            'updated_at': row.updated_at.isoformat() if row else None,
        })
    return {'items': items}


def upsert_assistant_policy(
    account: Account,
    action_type: str,
    enabled: bool,
    requires_confirmation: bool,
    allowed_risk_levels: List[str],
    min_priority_score: int,
    min_confidence_score: int,
) -> Dict[str, Any]:
    action_type = (action_type or '').strip()
    if not action_type:
        return {'ok': False, 'message': 'action_type 不能为空'}
    allowed = _normalize_risk_levels(allowed_risk_levels)
    if not allowed:
        allowed = DEFAULT_ALLOWED_RISK_LEVELS
    min_priority_score = _clamp_int(min_priority_score, 0, 100)
    min_confidence_score = _clamp_int(min_confidence_score, 0, 100)
    row, _ = AssistantActionPolicy.objects.update_or_create(
        account_id=account.id,
        action_type=action_type,
        defaults={
            'enabled': bool(enabled),
            'requires_confirmation': bool(requires_confirmation),
            'allowed_risk_levels': allowed,
            'min_priority_score': min_priority_score,
            'min_confidence_score': min_confidence_score,
            'updated_by': account.id,
            'created_by': account.id,
        },
    )
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.UPDATE,
            resource_type='assistant_policy',
            resource_id=str(row.id),
            resource_name=action_type,
            description='更新子衿动作策略',
            new_value={
                'enabled': row.enabled,
                'requires_confirmation': row.requires_confirmation,
                'allowed_risk_levels': row.allowed_risk_levels,
                'min_priority_score': row.min_priority_score,
                'min_confidence_score': row.min_confidence_score,
            },
        )
    except Exception as e:
        logger.warning(f'动作策略审计写入失败: {e}')
    return {
        'capability': _resolve_action_capability(action_type),
        'ok': True,
        'message': '策略已保存',
        'item': {
            'policy_id': row.id,
            'action_type': row.action_type,
            'enabled': row.enabled,
            'requires_confirmation': row.requires_confirmation,
            'allowed_risk_levels': row.allowed_risk_levels,
            'min_priority_score': row.min_priority_score,
            'min_confidence_score': row.min_confidence_score,
            'updated_at': row.updated_at.isoformat(),
        },
    }


def _get_action_learning_signal(account_id: int, action_type: str) -> Dict[str, Any]:
    """
    根据历史反馈生成动作类型学习信号（P2.8）

    返回：
    - boost: 对 priority_score 的增减（-25 ~ +25）
    - confidence_delta: 对 confidence_score 的增减（-12 ~ +12）
    - sample_size / adoption_rate / avg_score: 可解释指标
    """
    lookback_days = 90
    cutoff = timezone.now() - timedelta(days=lookback_days)

    plan_ids = list(
        AssistantActionPlan.objects.filter(
            account_id=account_id,
            action_type=action_type,
            created_at__gte=cutoff,
        ).values_list('id', flat=True)[:500]
    )
    if not plan_ids:
        return {
            'boost': 0,
            'confidence_delta': 0,
            'sample_size': 0,
            'adoption_rate': 0.0,
            'avg_score': None,
        }

    feedback_qs = AssistantActionFeedback.objects.filter(
        action_plan_id__in=plan_ids,
        created_at__gte=cutoff,
    )
    sample_size = feedback_qs.count()
    if sample_size == 0:
        return {
            'boost': 0,
            'confidence_delta': 0,
            'sample_size': 0,
            'adoption_rate': 0.0,
            'avg_score': None,
        }

    adopted_count = feedback_qs.filter(adopted=True).count()
    scored_qs = feedback_qs.exclude(score__isnull=True)
    scored_size = scored_qs.count()
    avg_score = None
    if scored_size > 0:
        total_score = sum(scored_qs.values_list('score', flat=True))
        avg_score = float(total_score) / float(scored_size)

    adoption_rate = float(adopted_count) / float(sample_size)

    # 基础偏移：采纳率高则正向，低则负向
    adoption_component = (adoption_rate - 0.5) * 24  # -12 ~ +12
    # 评分偏移：评分高则正向，低则负向
    score_component = 0.0
    if avg_score is not None:
        score_component = (avg_score - 3.0) * 6  # 1~5 -> -12 ~ +12

    # 样本越多，信号越可信；样本少时适度衰减
    reliability = min(1.0, sample_size / 10.0)
    raw_boost = (adoption_component + score_component) * reliability
    boost = _clamp_int(raw_boost, -25, 25)

    raw_confidence_delta = (adoption_rate - 0.5) * 24 * reliability
    confidence_delta = _clamp_int(raw_confidence_delta, -12, 12)

    return {
        'boost': boost,
        'confidence_delta': confidence_delta,
        'sample_size': sample_size,
        'adoption_rate': round(adoption_rate, 3),
        'avg_score': round(avg_score, 2) if avg_score is not None else None,
    }


def _get_research_route_learning(account_id: int, days: int = 90) -> Dict[str, Any]:
    """
    P3.21：统计 research_insight_followup 的路径学习效果。
    """
    days = max(7, min(180, int(days or 90)))
    cutoff = timezone.now() - timedelta(days=days)
    plans = list(
        AssistantActionPlan.objects.filter(
            account_id=account_id,
            action_type='research_insight_followup',
            created_at__gte=cutoff,
        ).values('id', 'action_payload')
    )
    if not plans:
        return {'window_days': days, 'card_type_routes': {}, 'global_routes': {}, 'recommended_by_card_type': {}}

    plan_map: Dict[int, Dict[str, str]] = {}
    for p in plans:
        payload = p.get('action_payload') or {}
        plan_map[p['id']] = {
            'card_type': str(payload.get('card_type') or 'unknown').strip() or 'unknown',
            'route': str(payload.get('recommended_route') or 'execute_direct').strip() or 'execute_direct',
        }

    plan_ids = list(plan_map.keys())
    feedbacks = list(
        AssistantActionFeedback.objects.filter(
            action_plan_id__in=plan_ids,
            created_at__gte=cutoff,
        ).values('action_plan_id', 'adopted', 'score')
    )
    if not feedbacks:
        return {'window_days': days, 'card_type_routes': {}, 'global_routes': {}, 'recommended_by_card_type': {}}

    route_stats: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(
        lambda: defaultdict(
            lambda: {'sample_size': 0, 'adopted_count': 0, 'scored_count': 0, 'score_sum': 0.0}
        )
    )
    global_stats: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {'sample_size': 0, 'adopted_count': 0, 'scored_count': 0, 'score_sum': 0.0}
    )

    for fb in feedbacks:
        ref = plan_map.get(fb['action_plan_id'])
        if not ref:
            continue
        card_type = ref['card_type']
        route = ref['route']
        card_route = route_stats[card_type][route]
        card_route['sample_size'] += 1
        global_stats[route]['sample_size'] += 1
        if fb.get('adopted'):
            card_route['adopted_count'] += 1
            global_stats[route]['adopted_count'] += 1
        if fb.get('score') is not None:
            score_value = float(fb.get('score') or 0)
            card_route['scored_count'] += 1
            card_route['score_sum'] += score_value
            global_stats[route]['scored_count'] += 1
            global_stats[route]['score_sum'] += score_value

    def _finalize(stat: Dict[str, Any]) -> Dict[str, Any]:
        sample = int(stat.get('sample_size', 0))
        adopted = int(stat.get('adopted_count', 0))
        scored = int(stat.get('scored_count', 0))
        adoption_rate = (adopted / sample) if sample > 0 else 0.0
        avg_score = (float(stat.get('score_sum', 0.0)) / scored) if scored > 0 else None
        score_norm = ((avg_score or 3.0) / 5.0)
        reliability = min(1.0, sample / 8.0)
        weighted = (0.7 * adoption_rate + 0.3 * score_norm) * reliability
        return {
            'sample_size': sample,
            'adoption_rate': round(adoption_rate, 3),
            'avg_score': round(avg_score, 2) if avg_score is not None else None,
            'weighted_score': round(weighted, 3),
            'reliability': round(reliability, 3),
        }

    finalized_card_routes: Dict[str, Dict[str, Dict[str, Any]]] = {}
    recommended_by_card_type: Dict[str, str] = {}
    for card_type, routes in route_stats.items():
        route_map = {route: _finalize(stat) for route, stat in routes.items()}
        finalized_card_routes[card_type] = route_map
        enough = {k: v for k, v in route_map.items() if int(v.get('sample_size', 0)) >= 3}
        if enough:
            best_route = sorted(
                enough.items(),
                key=lambda x: (x[1].get('weighted_score', 0), x[1].get('sample_size', 0)),
                reverse=True,
            )[0][0]
            recommended_by_card_type[card_type] = best_route

    finalized_global = {route: _finalize(stat) for route, stat in global_stats.items()}
    return {
        'window_days': days,
        'card_type_routes': finalized_card_routes,
        'global_routes': finalized_global,
        'recommended_by_card_type': recommended_by_card_type,
    }


def _resolve_research_route_recommendation(
    card_type: str,
    route_learning: Dict[str, Any],
    route_overrides: Dict[str, str],
) -> Dict[str, str]:
    recommended_route = 'execute_direct'
    recommended_reason = '建议先确认后直接执行，快速形成可追溯执行记录。'
    recommended_source = 'default'
    if card_type in {'client_execution', 'market'}:
        recommended_route = 'delegate_claw'
        recommended_reason = '该类任务更适合委派 Kimi Claw 执行连续化跟进。'
    elif card_type == 'paper_method':
        recommended_route = 'confirm_only'
        recommended_reason = '建议先转为待办确认，再决定是否执行或委派。'

    learned_route = (route_learning.get('recommended_by_card_type', {}) or {}).get(card_type)
    learned_detail = ((route_learning.get('card_type_routes', {}) or {}).get(card_type, {}) or {}).get(learned_route or '', {})
    if learned_route:
        recommended_route = learned_route
        recommended_source = 'learning'
        recommended_reason = (
            f"基于近{route_learning.get('window_days', 90)}天学习数据自适应推荐："
            f"采纳率{int(float(learned_detail.get('adoption_rate', 0))*100)}%"
            f"，样本{int(learned_detail.get('sample_size', 0))}。"
        )

    override_route = str(route_overrides.get(card_type) or '').strip()
    if override_route in RESEARCH_ROUTE_OPTIONS:
        recommended_route = override_route
        recommended_source = 'override'
        recommended_reason = '已应用手动覆写路径。'
    return {'route': recommended_route, 'reason': recommended_reason, 'source': recommended_source}


def _resolve_default_action_route(action_type: str, risk_level: str) -> Dict[str, str]:
    """
    为通用动作提供兜底推荐路径，避免 route-recommended 无法执行。
    """
    risk = str(risk_level or '').strip().lower()
    if risk == AssistantActionPlan.RiskLevel.HIGH:
        return {
            'route': 'confirm_only',
            'reason': '高风险动作默认仅确认，建议人工复核后再执行。',
            'source': 'default',
        }

    delegate_preferred_types = {
        'risk_followup_plan',
        'daily_digest_prepare',
        'agent_channel_alert',
        'research_insight_followup',
        'research_route_governance_alert',
    }
    if action_type in delegate_preferred_types:
        return {
            'route': 'delegate_claw',
            'reason': '该动作适合委派 Kimi Claw 进行连续化执行。',
            'source': 'default',
        }

    return {
        'route': 'execute_direct',
        'reason': '默认推荐确认后直接执行，减少人工重复操作。',
        'source': 'default',
    }


def _get_account_from_request(request) -> Optional[Account]:
    """从请求中解析当前账号"""
    from apps.identity.services import verify_jwt_token
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return None
    payload = verify_jwt_token(auth_header[7:])
    if not payload:
        return None
    return Account.objects.filter(id=payload['user_id'], is_deleted=False).first()


def get_dashboard_stats(account: Account) -> Dict[str, Any]:
    """
    获取工作台统计（项目数、进行中、待处理工单、AI对话数）

    数据权限过滤：
    - global 角色看到全局统计
    - project 角色看到已分配项目的统计
    - personal 角色看到自己创建的统计
    """
    from apps.agent_gateway.models import AgentCall
    from apps.identity.filters import filter_queryset_by_scope

    protocols = Protocol.objects.filter(is_deleted=False)
    protocols = filter_queryset_by_scope(protocols, account)
    project_count = protocols.count()
    active_count = protocols.filter(status='active').count()

    workorders = WorkOrder.objects.filter(is_deleted=False)
    workorders = filter_queryset_by_scope(workorders, account)
    pending_workorders = workorders.filter(
        status__in=['pending', 'in_progress'],
    ).count()

    recent = timezone.now() - timedelta(days=7)
    ai_chat_count = AgentCall.objects.filter(
        session__account_id=account.id,
        created_at__gte=recent,
        status='success',
    ).count()

    return {
        'project_count': project_count,
        'active_count': active_count,
        'pending_workorders': pending_workorders,
        'ai_chat_count': ai_chat_count,
    }


def get_dashboard_activities(account_id: int, limit: int = 20) -> List[Dict]:
    """获取最近动态"""
    from apps.audit.models import AuditLog

    logs = AuditLog.objects.filter(
        account_id=account_id,
    ).order_by('-create_time')[:limit]

    return [
        {
            'id': str(log.id),
            'title': log.description or log.action or '操作',
            'type': log.resource_type or '系统',
            'time': log.create_time.strftime('%Y-%m-%d %H:%M') if log.create_time else '',
        }
        for log in logs
    ]


def _trigger_feishu_connector_sync(user_id: str, days: int = 7) -> Optional[Dict]:
    """触发 feishu-connector 同步（若配置了连接器 URL）"""
    conn_url = getattr(settings, 'FEISHU_CONNECTOR_URL', None) or os.getenv('FEISHU_CONNECTOR_URL')
    if not conn_url:
        return None
    try:
        import httpx
        url = f'{conn_url.rstrip("/")}/api/v1/agents/feishu-connector/chat'
        payload = {
            'message': {
                'action': 'sync_baseline',
                'payload': {'user_id': user_id, 'days': days},
            }
        }
        resp = httpx.post(url, json=payload, timeout=60.0)
        return resp.json() if resp.status_code == 200 else None
    except Exception as e:
        logger.warning(f'feishu-connector 调用失败: {e}')
        return None


def _get_personal_context_by_source(user_id: str, days: int = 7) -> Dict[str, List[Dict]]:
    """从 personal_context 按 source_type 分组获取"""
    since = timezone.now() - timedelta(days=days)
    qs = PersonalContext.objects.filter(
        user_id=user_id,
        created_at__gte=since,
    ).order_by('-created_at')

    result = {'mail': [], 'im': [], 'calendar': [], 'task': [], 'approval': []}
    source_map = {
        'mail': 'mail', 'email': 'mail',
        'im': 'im', 'chat': 'im', 'message': 'im',
        'calendar': 'calendar', 'event': 'calendar',
        'task': 'task', 'todo': 'task',
        'approval': 'approval',
    }
    for item in qs:
        key = source_map.get(item.source_type.lower(), item.source_type.lower())
        if key in result and len(result[key]) < 10:
            result[key].append({
                'summary': item.summary or item.raw_content[:200] if item.raw_content else '',
                'metadata': item.metadata or {},
            })
    return result


def _llm_extract_key_info(source_data: Dict[str, List[Dict]]) -> Dict[str, List[str]]:
    """使用大模型提炼各来源的关键信息"""
    prompt = """你是一个专业的信息提炼助手。根据以下用户飞书各渠道的原始信息摘要，提炼出关键信息点。
按来源分类输出，每条关键信息简洁明了（不超过50字）。
若某来源无数据，输出空列表。

输入数据（JSON格式）：
{input}

请以 JSON 格式输出，格式如下：
{{
  "mail": ["关键信息1", "关键信息2"],
  "im": ["关键信息1"],
  "calendar": ["关键信息1"],
  "task": ["关键信息1"]
}}
只输出 JSON，不要其他说明。"""

    input_str = json.dumps(source_data, ensure_ascii=False, indent=2)
    try:
        out = quick_chat(
            message=prompt.format(input=input_str),
            provider=AgentProvider.KIMI,
            model_id='moonshot-v1-32k',
            system_prompt='你是信息提炼助手。只输出有效的 JSON，不要 markdown 或解释。',
            temperature=0.3,
            max_tokens=2048,
        )
        out = out.strip()
        if out.startswith('```'):
            out = out.split('```')[1]
            if out.startswith('json'):
                out = out[4:]
        return json.loads(out)
    except Exception as e:
        logger.warning(f'LLM 提炼失败: {e}')
        return {k: [] for k in ['mail', 'im', 'calendar', 'task']}


def _rule_extract_key_info(source_data: Dict[str, List[Dict]]) -> Dict[str, List[str]]:
    result: Dict[str, List[str]] = {}
    for source in ['mail', 'im', 'calendar', 'task']:
        items = source_data.get(source, []) or []
        seen = set()
        lines: List[str] = []
        for item in items:
            summary = str(item.get('summary') or '').strip().replace('\n', ' ')
            if not summary:
                continue
            summary = summary[:50]
            if summary in seen:
                continue
            seen.add(summary)
            lines.append(summary)
            if len(lines) >= 5:
                break
        result[source] = lines
    return result


def _rule_project_analysis(context: Dict[str, Any]) -> str:
    project_count = len(context.get('projects') or [])
    client_count = len(context.get('clients') or [])
    opportunity_count = len(context.get('opportunities') or [])
    active_projects = sum(1 for p in (context.get('projects') or []) if str(p.get('status') or '') == 'active')
    lines = [
        f'当前可见项目 {project_count} 个，活跃项目 {active_projects} 个。',
        f'当前可见客户 {client_count} 个，商机 {opportunity_count} 个。',
    ]
    if active_projects > 0:
        lines.append('建议优先跟进活跃项目的里程碑、风险和客户反馈。')
    elif project_count > 0:
        lines.append('当前项目以非活跃状态为主，建议复核推进节奏和转化机会。')
    else:
        lines.append('当前缺少项目数据，建议先补齐项目与客户关联。')
    return '\n'.join(lines)


def _rule_hot_topics(all_items: List[str]) -> Dict[str, Any]:
    normalized: List[str] = []
    seen = set()
    for item in all_items:
        text = str(item or '').strip().replace('\n', ' ')
        if not text:
            continue
        text = text[:30]
        if text in seen:
            continue
        seen.add(text)
        normalized.append(text)
        if len(normalized) >= 8:
            break
    topics = normalized[:5]
    trends = []
    if topics:
        trends.append('近期沟通热点集中在已有高频事项，建议按主题持续跟进。')
    if len(topics) >= 3:
        trends.append('跨邮件、日历、任务重复出现的话题应优先沉淀为标准动作。')
    return {'topics': topics, 'trends': trends, 'message': ''}


def run_feishu_preflight(account: Account) -> Dict[str, Any]:
    """
    登录后四源权限预检：并发探测 mail / calendar / task / im 是否可用。

    四源请求并发执行（ThreadPoolExecutor），将总耗时从串行 ~4×RTT 降为 ~1×RTT。
    wiki 通过实际 API 探测；docx / drive_file / minutes 通过存储的 feishu_scope 字符串校验
    （无法在无数据的账号上做 API 探测，scope 字符串在每次 OAuth 登录时持久化）。

    返回: {
        'passed': bool,
        'granted_capabilities': {
            'mail': bool, 'im': bool, 'calendar': bool, 'task': bool,
            'wiki': bool, 'docx': bool, 'drive_file': bool, 'minutes': bool,
        },
        'missing': ['mail', ...],
        'message': str,
        'requires_reauth': bool,
        'auth_source': 'feishu' | 'non_feishu' | 'feishu_expired',
        # auth_source 说明：
        #   feishu        — 飞书 OAuth 登录且 token 有效，正常做探测
        #   non_feishu    — 微信/短信等非飞书登录，无飞书 token，跳过探测（不应展示重授权）
        #   feishu_expired — 曾经飞书登录但 token 已失效，需重授权
    }
    """
    from .feishu_fetcher import get_valid_user_token
    from concurrent.futures import ThreadPoolExecutor, as_completed

    result = {
        'passed': False,
        'granted_capabilities': {k: False for k in PREFLIGHT_CAPABILITIES},
        'missing': list(PREFLIGHT_CAPABILITIES),
        'message': '',
        'requires_reauth': False,
        'auth_source': 'feishu',
    }
    user_token = get_valid_user_token(account.id)
    if not user_token:
        # 区分"从未有飞书 token（微信/短信登录）"和"曾有但已失效"
        token_record = FeishuUserToken.objects.filter(account_id=account.id).first()
        if not token_record:
            # 非飞书身份登录，无需预检，不展示重授权按钮
            result['auth_source'] = 'non_feishu'
            result['passed'] = True   # 对非飞书账号视为"通过"，避免前端拦截
            result['missing'] = []
            result['message'] = ''
            return result
        # 有 token 记录但无法获取有效 token（已过期 + 刷新失败）
        result['auth_source'] = 'feishu_expired'
        result['message'] = '飞书授权已失效，请使用子衿重新登录'
        result['requires_reauth'] = True
        token_record.requires_reauth = True
        token_record.save(update_fields=['requires_reauth'])
        return result

    token_record = FeishuUserToken.objects.filter(account_id=account.id).first()
    now = timezone.now()

    # ── 存储的 scope 字符串（用于 docx/drive_file/minutes 的 scope 校验）────────────
    stored_scope = (getattr(token_record, 'feishu_scope', '') or '') if token_record else ''

    def _scope_granted(required: str) -> bool:
        """检查 stored_scope 中是否包含指定 scope 关键字。"""
        if not stored_scope:
            # 历史 token 尚无 scope 记录 → 保守地视为"未授权"，提示用户重新登录
            return False
        return required in stored_scope

    # ── 四源 API 探测函数 ────────────────────────────────────────────────────────
    def _probe_mail():
        try:
            feishu_client.list_user_mails(user_token, page_size=1)
            return 'mail', True, None
        except FeishuAPIError as e:
            return 'mail', False, str(e.code)
        except Exception:
            return 'mail', False, None

    def _probe_calendar():
        try:
            feishu_client._user_request(
                'GET', 'calendar/v4/calendars', user_token, params={'page_size': 50}
            )
            return 'calendar', True, None
        except FeishuAPIError as e:
            return 'calendar', False, str(e.code)
        except Exception:
            return 'calendar', False, None

    def _probe_task():
        try:
            feishu_client.list_user_tasks(user_token, page_size=1)
            return 'task', True, None
        except FeishuAPIError as e:
            return 'task', False, str(e.code)
        except Exception:
            return 'task', False, None

    def _probe_im():
        try:
            feishu_client.list_user_chats(user_token, page_size=1)
            return 'im', True, None
        except FeishuAPIError as e:
            return 'im', False, str(e.code)
        except Exception:
            return 'im', False, None

    def _probe_wiki():
        """尝试用 user_access_token 列举知识库空间，检测 wiki:wiki scope。"""
        try:
            feishu_client._user_request(
                'GET', 'wiki/v2/spaces', user_token, params={'page_size': 1}
            )
            return 'wiki', True, None
        except FeishuAPIError as e:
            return 'wiki', False, str(e.code)
        except Exception:
            return 'wiki', False, None

    api_probes = [_probe_mail, _probe_calendar, _probe_task, _probe_im, _probe_wiki]
    granted = {}
    first_error_code = None

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(probe): probe for probe in api_probes}
        for future in as_completed(futures):
            cap, ok, err_code = future.result()
            granted[cap] = ok
            if not ok and err_code and first_error_code is None:
                first_error_code = err_code

    # ── Scope 字符串校验（docx / drive_file / minutes）────────────────────────
    for cap, required_scope in PREFLIGHT_SCOPE_REQUIRED.items():
        ok = _scope_granted(required_scope)
        granted[cap] = ok
        if not ok and first_error_code is None:
            first_error_code = f'scope_missing:{required_scope}'

    result['granted_capabilities'] = granted
    result['missing'] = [k for k in PREFLIGHT_CAPABILITIES if not granted.get(k)]
    result['passed'] = len(result['missing']) == 0
    result['requires_reauth'] = not result['passed']
    result['auth_source'] = 'feishu'

    if token_record:
        token_record.granted_capabilities = granted
        token_record.last_preflight_at = now
        token_record.requires_reauth = result['requires_reauth']
        if result['passed']:
            token_record.last_error_code = ''
        elif first_error_code:
            token_record.last_error_code = str(first_error_code)[:32]
        token_record.save(update_fields=['granted_capabilities', 'last_preflight_at', 'requires_reauth', 'last_error_code'])

    if not result['passed']:
        missing_labels = {
            'mail': '邮件', 'im': 'IM消息', 'calendar': '日历', 'task': '任务',
            'wiki': '知识库', 'docx': '文档', 'drive_file': '云盘文件',
        }
        missing_cn = [missing_labels.get(k, k) for k in result['missing']]
        result['message'] = '部分飞书权限不可用，请使用子衿重新授权：' + '、'.join(missing_cn)
    return result


def get_feishu_auth_monitor_stats() -> Dict[str, Any]:
    """
    飞书授权健康监控：聚合统计 t_feishu_user_token 关键指标。

    指标：
    - total：token 总数
    - requires_reauth_count / requires_reauth_rate：需重授权数量及比率
    - error_code_distribution：各 last_error_code 出现次数（前 10）
    - scope_error_count：99991672（scope/auth 错误）总数
    - issuer_distribution：各 issuer_app_id 签发数量
    - never_preflight_count：从未做过预检（last_preflight_at 为空）的数量
    - missing_capability_breakdown：按缺失能力分类统计（mail/im/calendar/task/wiki/docx/drive_file/minutes）
    """
    from django.db.models import Count

    qs = FeishuUserToken.objects.all()
    total = qs.count()
    if total == 0:
        return {'total': 0, 'message': '暂无 token 数据'}

    requires_reauth_count = qs.filter(requires_reauth=True).count()
    requires_reauth_rate = round(requires_reauth_count / total * 100, 2) if total else 0

    # error_code 分布（非空）
    error_code_dist = (
        qs.exclude(last_error_code='')
        .values('last_error_code')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]
    )
    error_code_distribution = {row['last_error_code']: row['count'] for row in error_code_dist}
    scope_error_count = error_code_distribution.get('99991672', 0)

    # issuer_app_id 签发分布
    issuer_dist = (
        qs.values('issuer_app_id')
        .annotate(count=Count('id'))
        .order_by('-count')
    )
    issuer_distribution = {(row['issuer_app_id'] or '(未记录)'): row['count'] for row in issuer_dist}

    # 从未做过预检
    never_preflight_count = qs.filter(last_preflight_at__isnull=True).count()

    # 缺失能力分类：遍历 granted_capabilities JSONField
    # 用 Python 侧统计（避免跨数据库 JSON 查询兼容性问题）
    missing_breakdown: Dict[str, int] = {cap: 0 for cap in PREFLIGHT_CAPABILITIES}
    for token in qs.only('granted_capabilities', 'requires_reauth').filter(requires_reauth=True):
        caps = token.granted_capabilities or {}
        for cap in PREFLIGHT_CAPABILITIES:
            if not caps.get(cap):
                missing_breakdown[cap] += 1

    now = timezone.now()
    return {
        'total': total,
        'requires_reauth_count': requires_reauth_count,
        'requires_reauth_rate_pct': requires_reauth_rate,
        'scope_error_count': scope_error_count,
        'error_code_distribution': error_code_distribution,
        'issuer_distribution': issuer_distribution,
        'never_preflight_count': never_preflight_count,
        'missing_capability_breakdown': missing_breakdown,
        'generated_at': now.isoformat(),
    }


def _ensure_personal_context(account: Account, user_id: str) -> None:
    """
    确保 personal_context 各数据源有数据

    检查 mail/im/calendar/task 四个源是否都有近 7 天数据；
    如果任一源缺失则重新拉取。
    """
    since = timezone.now() - timedelta(days=7)
    from django.db.models import Count
    by_type = dict(
        PersonalContext.objects.filter(
            user_id=user_id, created_at__gte=since,
        ).values_list('source_type').annotate(c=Count('id')).values_list('source_type', 'c')
    )
    required_sources = {'mail', 'calendar', 'task'}
    missing = required_sources - set(by_type.keys())

    if not missing:
        return

    logger.info(
        f'personal_context 数据源不完整 (missing={missing}, existing={by_type}), '
        f'尝试补充飞书数据: user_id={user_id}'
    )

    # 子衿主授权：优先尝试 connector 同步，失败再走 direct fetch 兜底
    conn_result = _trigger_feishu_connector_sync(user_id, days=7)
    if conn_result:
        logger.info('feishu-connector 同步已触发: user_id=%s', user_id)
    from .feishu_fetcher import sync_feishu_data_direct
    counts = sync_feishu_data_direct(account.id, user_id)
    total = sum(v for k, v in counts.items() if k != 'error')
    if total > 0:
        logger.info(f'飞书数据补充拉取完成: {counts}')
    else:
        logger.info(f'飞书数据补充拉取无新增: {counts}')


def get_feishu_scan_overview(account: Account, force_refresh: bool = False) -> Dict[str, Any]:
    """
    第一部分：飞书信息全面扫描，提炼关键信息
    返回：邮件、聊天、日历、任务 各自的关键信息列表

    数据获取策略（优先级）：
    1. personal_context 已有数据 → 直接用
    2. feishu-connector 同步 → 写入 personal_context
    3. 直接从飞书 API 用 user_access_token 拉取 → 写入 personal_context
    """
    user_id = account.feishu_open_id or account.feishu_user_id or ''
    if not user_id:
        return {
            'mail': [],
            'im': [],
            'calendar': [],
            'task': [],
            'message': '未绑定飞书账号，请先完成飞书登录',
        }

    # 检查缓存
    if not force_refresh:
        cache = DashboardOverviewCache.objects.filter(
            account_id=account.id,
            cache_type=DashboardOverviewCache.CacheType.FEISHU_SCAN,
            expires_at__gt=timezone.now(),
        ).first()
        if cache:
            return cache.content

    # 子衿主授权：扫描入口强制预检（可关闭 FEISHU_PREFLIGHT_BLOCK_SCAN 仅观测不拦截）
    # non_feishu 账号（微信/短信登录）直接跳过预检，不展示重授权拦截页
    preflight = run_feishu_preflight(account)
    block_scan = getattr(settings, 'FEISHU_PREFLIGHT_BLOCK_SCAN', True)
    auth_source = preflight.get('auth_source', 'feishu')
    if block_scan and not preflight.get('passed') and auth_source != 'non_feishu':
        return {
            'mail': [],
            'im': [],
            'calendar': [],
            'task': [],
            'message': preflight.get('message', '飞书权限不足，请重新授权'),
            'preflight': {
                'granted_capabilities': preflight.get('granted_capabilities', {}),
                'missing': preflight.get('missing', []),
                'requires_reauth': preflight.get('requires_reauth', True),
                'auth_source': auth_source,
            },
        }

    # 确保 personal_context 有数据（自动从飞书获取）
    _ensure_personal_context(account, user_id)

    # 获取 personal_context 数据
    source_data = _get_personal_context_by_source(user_id, days=7)

    # 若仍无数据
    has_data = any(len(v) > 0 for v in source_data.values())
    if not has_data:
        # 检查是否有存储的 token
        from .models import FeishuUserToken
        has_token = FeishuUserToken.objects.filter(account_id=account.id).exists()
        if has_token:
            msg = '飞书 Token 已过期或权限不足，请重新登录飞书'
        else:
            msg = '请先登录飞书以获取授权，系统将自动拉取您的飞书信息'
        result = {
            'mail': [],
            'im': [],
            'calendar': [],
            'task': [],
            'message': msg,
        }
    else:
        extracted = _llm_extract_key_info(source_data) if DASHBOARD_LLM_ENABLED else _rule_extract_key_info(source_data)
        result = {
            'mail': extracted.get('mail', []),
            'im': extracted.get('im', []),
            'calendar': extracted.get('calendar', []),
            'task': extracted.get('task', []),
            'message': '',
        }

    # 写缓存
    DashboardOverviewCache.objects.update_or_create(
        account_id=account.id,
        cache_type=DashboardOverviewCache.CacheType.FEISHU_SCAN,
        defaults={
            'content': result,
            'expires_at': timezone.now() + timedelta(minutes=CACHE_TTL_MINUTES),
        },
    )
    return result


def get_project_analysis_overview(account: Account, force_refresh: bool = False) -> Dict[str, Any]:
    """
    第二部分：项目/客户历史与现状分析

    关联账号到项目、客户，扩展跟踪相关信息，大模型分析
    """
    # 检查缓存
    if not force_refresh:
        cache = DashboardOverviewCache.objects.filter(
            account_id=account.id,
            cache_type=DashboardOverviewCache.CacheType.PROJECT_ANALYSIS,
            expires_at__gt=timezone.now(),
        ).first()
        if cache:
            return cache.content

    from apps.identity.filters import filter_queryset_by_scope

    # 收集项目与客户数据（应用数据权限过滤）
    protocols = Protocol.objects.filter(is_deleted=False).order_by('-create_time')
    protocols = filter_queryset_by_scope(protocols, account)[:20]

    clients = Client.objects.filter(is_deleted=False).order_by('-create_time')
    clients = filter_queryset_by_scope(clients, account)[:20]

    opportunities = Opportunity.objects.filter(is_deleted=False).select_related('client')
    opportunities = filter_queryset_by_scope(opportunities, account)[:20]

    context = {
        'projects': [
            {'id': p.id, 'name': p.title, 'status': p.status, 'created': str(p.create_time)[:10]}
            for p in protocols
        ],
        'clients': [
            {'id': c.id, 'name': c.name, 'level': c.level}
            for c in clients
        ],
        'opportunities': [
            {'id': o.id, 'title': o.title, 'stage': o.stage, 'client': o.client.name if o.client else ''}
            for o in opportunities
        ],
    }

    if DASHBOARD_LLM_ENABLED:
        prompt = """你是一个临床研究项目管理专家。根据以下项目、客户、商机数据，分析：
1. 项目与客户的历史与现状概览
2. 需要重点跟踪的项目或客户
3. 简要建议（下一步行动）

数据：
{context}

请用简洁的中文输出分析报告，分点列出，每条不超过80字。"""

        try:
            analysis = quick_chat(
                message=prompt.format(context=json.dumps(context, ensure_ascii=False, indent=2)),
                provider=AgentProvider.KIMI,
                model_id='moonshot-v1-32k',
                system_prompt='你是项目管理分析专家。输出简洁、专业。',
                temperature=0.5,
                max_tokens=1024,
            )
            result = {
                'analysis': analysis.strip(),
                'summary': context,
                'message': '',
            }
        except Exception as e:
            logger.warning(f'项目分析 LLM 失败: {e}')
            result = {
                'analysis': _rule_project_analysis(context),
                'summary': context,
                'message': str(e),
            }
    else:
        result = {
            'analysis': _rule_project_analysis(context),
            'summary': context,
            'message': '',
        }

    DashboardOverviewCache.objects.update_or_create(
        account_id=account.id,
        cache_type=DashboardOverviewCache.CacheType.PROJECT_ANALYSIS,
        defaults={
            'content': result,
            'expires_at': timezone.now() + timedelta(minutes=CACHE_TTL_MINUTES),
        },
    )
    return result


def get_hot_topics_overview(
    account: Account,
    feishu_scan: Optional[Dict] = None,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    第三部分：热点话题与趋势跟进

    从客户、项目、公司内部、同事提及的话题中提取热点
    """
    # 检查缓存
    if not force_refresh:
        cache = DashboardOverviewCache.objects.filter(
            account_id=account.id,
            cache_type=DashboardOverviewCache.CacheType.HOT_TOPICS,
            expires_at__gt=timezone.now(),
        ).first()
        if cache:
            return cache.content

    # 若未传入 feishu_scan，先获取
    if feishu_scan is None:
        feishu_scan = get_feishu_scan_overview(account, force_refresh=True)

    all_items = [
        *feishu_scan.get('mail', []),
        *feishu_scan.get('im', []),
        *feishu_scan.get('calendar', []),
        *feishu_scan.get('task', []),
    ]

    if not all_items:
        result = {
            'topics': [],
            'trends': [],
            'message': '暂无足够的飞书信息来提取热点话题，请确保已登录飞书',
        }
    else:
        if DASHBOARD_LLM_ENABLED:
            prompt = """你是一个商业情报分析专家。根据以下来自邮件、聊天、日历、任务的关键信息，提炼：
1. 最近客户、项目、公司内部或同事提到的热点话题（列表，每条不超过30字）
2. 可能的发展趋势（2-3条）

关键信息：
{items}

请以 JSON 格式输出：
{{
  "topics": ["话题1", "话题2"],
  "trends": ["趋势1", "趋势2"]
}}
只输出 JSON。"""

            try:
                out = quick_chat(
                    message=prompt.format(items=json.dumps(all_items, ensure_ascii=False)),
                    provider=AgentProvider.KIMI,
                    model_id='moonshot-v1-32k',
                    system_prompt='只输出有效 JSON。',
                    temperature=0.5,
                    max_tokens=1024,
                )
                out = out.strip()
                if '```' in out:
                    out = out.split('```')[1]
                    if out.startswith('json'):
                        out = out[4:]
                result = json.loads(out)
                result['message'] = ''
            except Exception as e:
                logger.warning(f'热点话题 LLM 失败: {e}')
                result = _rule_hot_topics(all_items)
                result['message'] = str(e)
        else:
            result = _rule_hot_topics(all_items)

    DashboardOverviewCache.objects.update_or_create(
        account_id=account.id,
        cache_type=DashboardOverviewCache.CacheType.HOT_TOPICS,
        defaults={
            'content': result,
            'expires_at': timezone.now() + timedelta(minutes=CACHE_TTL_MINUTES),
        },
    )
    return result


def get_full_dashboard_overview(account: Account, force_refresh: bool = False) -> Dict[str, Any]:
    """获取完整工作台总览（三部分）"""
    try:
        feishu_scan = get_feishu_scan_overview(account, force_refresh=force_refresh)
    except Exception as e:
        logger.exception('get_feishu_scan_overview failed: account=%s', account.id)
        feishu_scan = {
            'mail': [],
            'im': [],
            'calendar': [],
            'task': [],
            'message': f'飞书信息扫描失败: {str(e)}',
        }

    try:
        project_analysis = get_project_analysis_overview(account, force_refresh=force_refresh)
    except Exception as e:
        logger.exception('get_project_analysis_overview failed: account=%s', account.id)
        project_analysis = {
            'analysis': '暂无分析结果',
            'summary': {},
            'message': f'项目分析失败: {str(e)}',
        }

    try:
        hot_topics = get_hot_topics_overview(
            account, feishu_scan=feishu_scan, force_refresh=force_refresh
        )
    except Exception as e:
        logger.exception('get_hot_topics_overview failed: account=%s', account.id)
        hot_topics = {
            'topics': [],
            'trends': [],
            'message': f'热点分析失败: {str(e)}',
        }
    return {
        'feishu_scan': feishu_scan,
        'project_analysis': project_analysis,
        'hot_topics': hot_topics,
    }


def _resolve_since_by_time_range(time_range: str) -> datetime:
    now = timezone.now()
    mapping = {
        'today': now - timedelta(days=1),
        '7d': now - timedelta(days=7),
        '30d': now - timedelta(days=30),
    }
    return mapping.get(time_range, mapping['7d'])


def build_assistant_context_snapshot(
    account: Account,
    time_range: str = '7d',
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    生成子衿上下文快照（P1）

    仅聚合当前账号在权限范围内的只读信息。
    """
    ttl_minutes = 30
    now = timezone.now()

    if not force_refresh:
        cached = AssistantContextSnapshot.objects.filter(
            account_id=account.id,
            time_range=time_range,
            expires_at__gt=now,
        ).first()
        if cached:
            return {
                'snapshot_id': cached.id,
                'permission_snapshot': cached.permission_snapshot,
                'scope_snapshot': cached.scope_snapshot,
                'context_payload': cached.context_payload,
                'source_trace': cached.source_trace,
                'expires_at': cached.expires_at.isoformat(),
            }

    from apps.identity.authz import get_authz_service
    from apps.identity.filters import get_data_scope
    from apps.identity.models import Role
    from apps.notification.models import NotificationRecord

    authz = get_authz_service()
    perm_map = authz.get_account_permissions(account.id)
    perm_codes = sorted(perm_map.keys())
    scope = get_data_scope(account)
    since = _resolve_since_by_time_range(time_range)

    # 只取必要的聚合指标，避免跨模块大对象拼装导致性能抖动
    workorder_total = WorkOrder.objects.filter(
        is_deleted=False,
        create_time__gte=since,
    ).count()
    protocol_total = Protocol.objects.filter(
        is_deleted=False,
        create_time__gte=since,
    ).count()
    client_total = Client.objects.filter(
        is_deleted=False,
        create_time__gte=since,
    ).count()
    notification_total = NotificationRecord.objects.filter(
        recipient_id=account.id,
        create_time__gte=since,
    ).count()
    unread_notification_total = NotificationRecord.objects.filter(
        recipient_id=account.id,
        status__in=['sent', 'delivered'],
        create_time__gte=since,
    ).count()

    role_names = list(
        Role.objects.filter(
            id__in=[r.id for r in authz.get_account_roles(account.id)]
        ).values_list('name', flat=True)
    )

    try:
        dashboard_stats = get_dashboard_stats(account)
    except Exception as e:
        logger.exception('get_dashboard_stats failed in assistant context: account=%s', account.id)
        dashboard_stats = {
            'total_projects': 0,
            'active_projects': 0,
            'pending_workorders': 0,
            'ai_conversations': 0,
            'message': f'统计构建失败: {str(e)}',
        }

    try:
        dashboard_overview = get_full_dashboard_overview(account, force_refresh=force_refresh)
    except Exception as e:
        logger.exception('get_full_dashboard_overview failed in assistant context: account=%s', account.id)
        dashboard_overview = {
            'feishu_scan': {'mail': [], 'im': [], 'calendar': [], 'task': [], 'message': f'总览失败: {str(e)}'},
            'project_analysis': {'analysis': '暂无分析结果', 'summary': {}, 'message': f'总览失败: {str(e)}'},
            'hot_topics': {'topics': [], 'trends': [], 'message': f'总览失败: {str(e)}'},
        }

    context_payload = {
        'window': time_range,
        'stats': {
            'protocol_total': protocol_total,
            'workorder_total': workorder_total,
            'client_total': client_total,
            'notification_total': notification_total,
            'unread_notification_total': unread_notification_total,
        },
        'dashboard_stats': dashboard_stats,
        'dashboard': dashboard_overview,
    }
    source_trace = [
        {'module': 'protocol', 'query': 'Protocol recent count'},
        {'module': 'workorder', 'query': 'WorkOrder recent count'},
        {'module': 'crm', 'query': 'Client recent count'},
        {'module': 'notification', 'query': 'NotificationRecord recent count'},
        {'module': 'secretary', 'query': 'dashboard overview aggregate'},
    ]

    row = AssistantContextSnapshot.objects.create(
        account_id=account.id,
        time_range=time_range,
        permission_snapshot={
            'role_names': sorted(role_names),
            'permission_count': len(perm_codes),
            'permissions': perm_codes,
        },
        scope_snapshot={'data_scope': scope},
        context_payload=context_payload,
        source_trace=source_trace,
        expires_at=now + timedelta(minutes=ttl_minutes),
    )
    return {
        'snapshot_id': row.id,
        'permission_snapshot': row.permission_snapshot,
        'scope_snapshot': row.scope_snapshot,
        'context_payload': row.context_payload,
        'source_trace': row.source_trace,
        'expires_at': row.expires_at.isoformat(),
    }


def generate_assistant_summary(
    account: Account,
    summary_type: str = 'daily',
    context_snapshot_id: Optional[int] = None,
    tone: str = 'ops',
) -> Dict[str, Any]:
    """
    生成子衿摘要草稿（P1）
    """
    if context_snapshot_id:
        snapshot = AssistantContextSnapshot.objects.filter(
            id=context_snapshot_id,
            account_id=account.id,
        ).first()
    else:
        snapshot = AssistantContextSnapshot.objects.filter(account_id=account.id).first()
    if not snapshot:
        return {
            'draft_id': None,
            'content_markdown': '',
            'highlights': [],
            'risk_points': [],
            'suggested_actions': [],
            'message': '未找到可用上下文，请先调用 assistant/context',
        }

    payload = snapshot.context_payload or {}
    preference = get_assistant_preferences(account).get('value', {})
    preferred_tone = str(preference.get('summary_tone') or '').strip()
    if tone == 'ops' and preferred_tone:
        tone = preferred_tone
    prompt = """你是企业个人业务助理。请基于输入上下文，输出 JSON：
{
  "content_markdown": "...",
  "highlights": ["..."],
  "risk_points": ["..."],
  "suggested_actions": ["..."]
}

要求：
1) content_markdown 适配 {summary_type} 风格，语气 {tone}。
2) highlights/risk_points/suggested_actions 各 3-6 条，简洁可执行。
3) 仅输出 JSON。"""

    try:
        out = quick_chat(
            message=prompt.format(summary_type=summary_type, tone=tone) + "\n\n上下文:\n" + json.dumps(payload, ensure_ascii=False),
            provider=AgentProvider.KIMI,
            model_id='moonshot-v1-32k',
            system_prompt='你是子衿工作台摘要助手，只输出 JSON。',
            temperature=0.4,
            max_tokens=2048,
        ).strip()
        if '```' in out:
            out = out.split('```')[1]
            if out.startswith('json'):
                out = out[4:]
        parsed = json.loads(out)
    except Exception as e:
        logger.warning(f'assistant summary 生成失败: {e}')
        parsed = {
            'content_markdown': '暂无可用摘要，请稍后重试。',
            'highlights': [],
            'risk_points': [],
            'suggested_actions': [],
        }

    row = AssistantSummaryDraft.objects.create(
        account_id=account.id,
        summary_type=summary_type,
        context_snapshot_id=snapshot.id,
        content_markdown=parsed.get('content_markdown', ''),
        highlights=parsed.get('highlights', []) or [],
        risk_points=parsed.get('risk_points', []) or [],
        suggested_actions=parsed.get('suggested_actions', []) or [],
        model_provider='kimi',
        model_id='moonshot-v1-32k',
        prompt_version='v1',
    )
    return {
        'draft_id': row.id,
        'context_snapshot_id': snapshot.id,
        'content_markdown': row.content_markdown,
        'highlights': row.highlights,
        'risk_points': row.risk_points,
        'suggested_actions': row.suggested_actions,
        'message': '',
    }


def suggest_assistant_actions(
    account: Account,
    context_snapshot_id: Optional[int] = None,
    intent: str = 'routine_ops',
    include_explanation: bool = True,
) -> Dict[str, Any]:
    """
    P2：根据上下文生成动作建议，并进入待确认动作箱
    """
    snapshot = None
    if context_snapshot_id:
        snapshot = AssistantContextSnapshot.objects.filter(
            id=context_snapshot_id, account_id=account.id
        ).first()
    if snapshot is None:
        snapshot = AssistantContextSnapshot.objects.filter(account_id=account.id).first()
    if snapshot is None:
        return {'items': [], 'message': '未找到可用上下文，请先调用 assistant/context'}
    preference = get_assistant_preferences(account).get('value', {})
    focus_action_types = set(_normalized_action_types(preference.get('focus_action_types')))
    blocked_action_types = set(_normalized_action_types(preference.get('blocked_action_types')))
    digest_hour = _clamp_int(preference.get('daily_digest_hour', 18), 0, 23)
    now = timezone.now()

    payload = snapshot.context_payload or {}
    stats = payload.get('stats', {})
    dashboard = payload.get('dashboard', {})
    dashboard_stats = payload.get('dashboard_stats', {}) or {}
    unread = int(stats.get('unread_notification_total', 0) or 0)
    pending_workorders = int(dashboard_stats.get('pending_workorders', 0) or 0)
    risk_points = (dashboard.get('project_analysis', {}) or {}).get('analysis', '')
    feishu_scan = dashboard.get('feishu_scan', {}) or {}
    has_mail_signal = len(feishu_scan.get('mail', []) or []) > 0

    # 规则优先，保证稳定输出；LLM 仅作为补充可选项（后续扩展）
    candidates: List[Dict[str, Any]] = []
    if unread > 0:
        candidates.append({
            'action_type': 'notification_triage',
            'title': f'处理未读通知（{unread}条）',
            'description': '按优先级整理未读通知并生成处理队列',
            'risk_level': AssistantActionPlan.RiskLevel.LOW,
            'action_payload': {
                'source': 'notification',
                'count': unread,
                'intent': intent,
                'reason': f'近窗口内仍有 {unread} 条未读通知，可能影响响应时效',
                'evidence': [{'module': 'notification', 'metric': 'unread_notification_total', 'value': unread}],
                'priority_score': min(100, 50 + unread * 2),
                'confidence_score': min(95, 60 + unread),
                'conflict_key': 'notification:triage',
            },
        })
    if has_mail_signal:
        candidates.append({
            'action_type': 'mail_intent_brief',
            'title': '生成客户邮件需求摘要',
            'description': '从近期邮件提取客户需求并生成跟进草稿',
            'risk_level': AssistantActionPlan.RiskLevel.MEDIUM,
            'action_payload': {
                'source': 'feishu_mail',
                'intent': intent,
                'reason': '检测到近期邮件信号，建议先做需求摘要以减少遗漏',
                'evidence': [{'module': 'feishu_scan', 'metric': 'mail_items_count', 'value': len(feishu_scan.get('mail', []) or [])}],
                'priority_score': 70,
                'confidence_score': 72,
                'conflict_key': 'mail:intent_brief',
            },
        })
        candidates.append({
            'action_type': 'crm_ticket_draft',
            'title': '创建客户跟进工单草稿',
            'description': '根据邮件线索创建 CRM 售后工单草稿（执行时补充 client_id）',
            'risk_level': AssistantActionPlan.RiskLevel.MEDIUM,
            'action_payload': {
                'source': 'feishu_mail',
                'intent': intent,
                'category': 'assistant_followup',
                'missing_fields': ['client_id'],
                'reason': '邮件线索通常对应客户跟进行动，建议先生成可确认工单草稿',
                'evidence': [{'module': 'feishu_scan', 'metric': 'mail_signal', 'value': True}],
                'priority_score': 68,
                'confidence_score': 66,
                'conflict_key': 'crm:ticket_draft',
            },
        })
    if risk_points:
        candidates.append({
            'action_type': 'risk_followup_plan',
            'title': '输出风险跟进清单',
            'description': '从项目分析中提取风险点并生成责任分配建议',
            'risk_level': AssistantActionPlan.RiskLevel.MEDIUM,
            'action_payload': {
                'source': 'project_analysis',
                'intent': intent,
                'reason': '项目分析中检测到风险相关内容，建议形成可执行跟进清单',
                'evidence': [{'module': 'project_analysis', 'metric': 'analysis_present', 'value': True}],
                'priority_score': 78,
                'confidence_score': 75,
                'conflict_key': 'risk:followup_plan',
            },
        })
    if pending_workorders > 0:
        candidates.append({
            'action_type': 'workorder_followup_comment',
            'title': '创建工单跟进备注',
            'description': '为指定工单创建跟进备注（执行时补充 work_order_id）',
            'risk_level': AssistantActionPlan.RiskLevel.LOW,
            'action_payload': {
                'source': 'workorder',
                'intent': intent,
                'comment': '子衿自动提醒：请确认截止时间、资源与风险。',
                'missing_fields': ['work_order_id'],
                'reason': f'当前待处理工单 {pending_workorders} 条，建议增加跟进提醒避免堆积',
                'evidence': [{'module': 'dashboard_stats', 'metric': 'pending_workorders', 'value': pending_workorders}],
                'priority_score': min(100, 55 + pending_workorders * 2),
                'confidence_score': min(90, 55 + pending_workorders),
                'conflict_key': 'workorder:followup_comment',
            },
        })
    if now.hour >= digest_hour and not _has_today_digest_action(account.id):
        candidates.append({
            'action_type': 'daily_digest_prepare',
            'title': '生成今日日报草稿',
            'description': '已到达日报时段，建议生成并确认今日业务摘要',
            'risk_level': AssistantActionPlan.RiskLevel.LOW,
            'action_payload': {
                'source': 'assistant_scheduler',
                'intent': intent,
                'summary_type': 'daily',
                'reason': f'当前时间已超过偏好日报时段 {digest_hour}:00',
                'evidence': [{'module': 'assistant_preference', 'metric': 'daily_digest_hour', 'value': digest_hour}],
                'priority_score': 65,
                'confidence_score': 80,
                'conflict_key': f'digest:daily:{now.date().isoformat()}',
            },
        })

    if include_explanation and candidates:
        try:
            explain_input = [
                {
                    'action_type': c['action_type'],
                    'title': c['title'],
                    'reason': c['action_payload'].get('reason', ''),
                    'priority_score': c['action_payload'].get('priority_score', 50),
                }
                for c in candidates
            ]
            explain_prompt = """你是子衿工作台动作解释器。请对每个动作生成更易读的一句话解释，并给出 1-100 的优先级建议。
仅输出 JSON 数组，每项格式：
{"action_type":"...","explanation":"...","priority_score":80}
输入：
{input}
"""
            out = quick_chat(
                message=explain_prompt.format(input=json.dumps(explain_input, ensure_ascii=False)),
                provider=AgentProvider.KIMI,
                model_id='moonshot-v1-32k',
                system_prompt='仅输出有效 JSON，不要 markdown。',
                temperature=0.2,
                max_tokens=1024,
            ).strip()
            if '```' in out:
                out = out.split('```')[1]
                if out.startswith('json'):
                    out = out[4:]
            parsed = json.loads(out)
            explain_map = {i.get('action_type'): i for i in parsed if isinstance(i, dict)}
            for c in candidates:
                e = explain_map.get(c['action_type'])
                if not e:
                    continue
                if isinstance(e.get('explanation'), str) and e['explanation'].strip():
                    c['action_payload']['reason'] = e['explanation'].strip()
                if isinstance(e.get('priority_score'), int):
                    c['action_payload']['priority_score'] = max(1, min(100, e['priority_score']))
        except Exception as e:
            logger.warning(f'动作解释生成失败，回退规则解释: {e}')

    if blocked_action_types:
        candidates = [c for c in candidates if (c.get('action_type') or '') not in blocked_action_types]

    # P2.8：基于历史反馈做自学习排序微调（按动作类型）
    learning_cache: Dict[str, Dict[str, Any]] = {}
    for c in candidates:
        payload = c.get('action_payload') or {}
        action_type = c.get('action_type') or ''
        if action_type not in learning_cache:
            learning_cache[action_type] = _get_action_learning_signal(account.id, action_type)
        signal = learning_cache[action_type]
        base_priority = int(payload.get('priority_score', 50))
        base_confidence = int(payload.get('confidence_score', 60))
        payload['priority_score'] = _clamp_int(base_priority + int(signal.get('boost', 0)), 1, 100)
        payload['confidence_score'] = _clamp_int(
            base_confidence + int(signal.get('confidence_delta', 0)),
            1,
            100,
        )
        payload['learning_boost'] = int(signal.get('boost', 0))
        payload['feedback_sample_size'] = int(signal.get('sample_size', 0))
        payload['feedback_adoption_rate'] = float(signal.get('adoption_rate', 0.0))
        if signal.get('avg_score') is not None:
            payload['feedback_avg_score'] = signal.get('avg_score')
        if action_type in focus_action_types:
            payload['priority_score'] = _clamp_int(int(payload.get('priority_score', 50)) + 10, 1, 100)
            payload['confidence_score'] = _clamp_int(int(payload.get('confidence_score', 60)) + 5, 1, 100)

    # 先按优先级降序，再执行同冲突键去重（保留优先级高者）
    candidates.sort(
        key=lambda x: int((x.get('action_payload') or {}).get('priority_score', 50)),
        reverse=True,
    )
    deduped: List[Dict[str, Any]] = []
    seen_conflict_keys = set()
    for c in candidates:
        key = (c.get('action_payload') or {}).get('conflict_key') or c.get('action_type')
        if key in seen_conflict_keys:
            continue
        seen_conflict_keys.add(key)
        deduped.append(c)
    candidates = deduped

    created = []
    recent_cutoff = timezone.now() - timedelta(hours=24)
    for item in candidates:
        payload = _enrich_action_payload_contract(item['action_type'], item['action_payload'])
        if not str(payload.get('recommended_route') or '').strip():
            route_info = _resolve_default_action_route(item['action_type'], item['risk_level'])
            payload['recommended_route'] = route_info['route']
            payload['recommended_reason'] = route_info['reason']
            payload['recommended_source'] = route_info['source']
        conflict_key = payload.get('conflict_key', item['action_type'])
        policy = _get_action_policy(account.id, item['action_type'])
        if not policy.get('enabled', True):
            continue
        if item['risk_level'] not in set(policy.get('allowed_risk_levels', DEFAULT_ALLOWED_RISK_LEVELS)):
            continue
        if int(payload.get('priority_score', 0) or 0) < int(policy.get('min_priority_score', 0) or 0):
            continue
        if int(payload.get('confidence_score', 0) or 0) < int(policy.get('min_confidence_score', 0) or 0):
            continue
        # 重复拦截：24h 内同用户同冲突键且未终态，不重复创建
        duplicate_exists = AssistantActionPlan.objects.filter(
            account_id=account.id,
            created_at__gte=recent_cutoff,
            status__in=[
                AssistantActionPlan.Status.SUGGESTED,
                AssistantActionPlan.Status.PENDING_CONFIRM,
                AssistantActionPlan.Status.CONFIRMED,
            ],
            action_payload__conflict_key=conflict_key,
        ).exists()
        if duplicate_exists:
            continue

        row = AssistantActionPlan.objects.create(
            account_id=account.id,
            context_snapshot_id=snapshot.id,
            action_type=item['action_type'],
            title=item['title'],
            description=item['description'],
            action_payload=payload,
            risk_level=item['risk_level'],
            status=AssistantActionPlan.Status.PENDING_CONFIRM,
            requires_confirmation=bool(policy.get('requires_confirmation', True)),
        )
        created.append({
            'id': row.id,
            'action_type': row.action_type,
            'title': row.title,
            'description': row.description,
            'risk_level': row.risk_level,
            'status': row.status,
            'requires_confirmation': row.requires_confirmation,
            'reason': payload.get('reason', ''),
            'evidence': payload.get('evidence', []),
            'priority_score': payload.get('priority_score', 50),
            'confidence_score': payload.get('confidence_score', 60),
            'conflict_key': payload.get('conflict_key', row.action_type),
            'learning_boost': payload.get('learning_boost', 0),
            'feedback_sample_size': payload.get('feedback_sample_size', 0),
            'feedback_adoption_rate': payload.get('feedback_adoption_rate', 0.0),
            'feedback_avg_score': payload.get('feedback_avg_score'),
            'created_at': row.created_at.isoformat(),
        })

    if created:
        try:
            from apps.audit.services import log_audit
            from apps.audit.models import AuditAction
            log_audit(
                account_id=account.id,
                account_name=account.display_name or account.username,
                account_type=account.account_type,
                action=AuditAction.CREATE,
                resource_type='assistant_action_batch',
                resource_id=f"{account.id}:{timezone.now().isoformat()}",
                resource_name='assistant_actions_suggested',
                description='子衿动作建议批次生成',
                new_value={'count': len(created), 'intent': intent},
            )
        except Exception as e:
            logger.warning(f'动作建议审计写入失败: {e}')

    return {'items': created, 'message': ''}


def get_action_inbox(account: Account, status: str = 'pending_confirm') -> Dict[str, Any]:
    """
    P2：待确认动作箱
    """
    qs = AssistantActionPlan.objects.filter(account_id=account.id)
    if status and status != 'all':
        qs = qs.filter(status=status)
    items = qs.order_by('-created_at')[:100]
    item_ids = [i.id for i in items]
    latest_exec_map: Dict[int, AssistantActionExecution] = {}
    if item_ids:
        exec_rows = AssistantActionExecution.objects.filter(
            action_plan_id__in=item_ids
        ).order_by('-started_at')
        for row in exec_rows:
            if row.action_plan_id not in latest_exec_map:
                latest_exec_map[row.action_plan_id] = row
    result_items: List[Dict[str, Any]] = []
    for i in items:
        capability = _resolve_action_capability(i.action_type)
        payload = _enrich_action_payload_contract(i.action_type, i.action_payload or {}, capability=capability)
        scope_proof = _resolve_scope_proof(account, capability)
        coverage = _build_context_coverage(account, payload, capability)
        latest_execution = None
        if i.id in latest_exec_map:
            latest_row = latest_exec_map[i.id]
            latest_execution = {
                'execution_id': latest_row.id,
                'result': latest_row.execution_result or {},
                'target_refs': latest_row.target_refs or [],
                'started_at': latest_row.started_at.isoformat() if latest_row.started_at else None,
                'finished_at': latest_row.finished_at.isoformat() if latest_row.finished_at else None,
            }
        result_items.append({
            'id': i.id,
            'action_type': i.action_type,
            'title': i.title,
            'description': i.description,
            'risk_level': i.risk_level,
            'status': i.status,
            'requires_confirmation': i.requires_confirmation,
            'reason': payload.get('reason', ''),
            'evidence': payload.get('evidence', []),
            'next_actions': payload.get('next_actions', []),
            'recommended_route': payload.get('recommended_route', ''),
            'recommended_reason': payload.get('recommended_reason', ''),
            'recommended_source': payload.get('recommended_source', ''),
            'priority_score': payload.get('priority_score', 50),
            'confidence_score': payload.get('confidence_score', 60),
            'can_delegate_to_claw': i.action_type in KIMI_CLAW_DELEGABLE_ACTION_TYPES,
            'conflict_key': payload.get('conflict_key', i.action_type),
            'learning_boost': payload.get('learning_boost', 0),
            'feedback_sample_size': payload.get('feedback_sample_size', 0),
            'feedback_adoption_rate': payload.get('feedback_adoption_rate', 0.0),
            'feedback_avg_score': payload.get('feedback_avg_score'),
            'expected_skills': payload.get('expected_skills', []),
            'minimum_context_requirements': payload.get('minimum_context_requirements', []),
            'context_coverage': coverage,
            'missing_context_items': coverage.get('missing_items', []),
            'required_vs_granted_scopes': scope_proof,
            'latest_execution': latest_execution,
            'created_at': i.created_at.isoformat(),
            'updated_at': i.updated_at.isoformat(),
            **capability,
        })
    return {'items': result_items}


def batch_confirm_actions(account: Account, action_ids: List[int]) -> Dict[str, Any]:
    """
    P3.10：批量确认可执行动作，减少人工重复确认负担。
    """
    ids = sorted({int(i) for i in (action_ids or []) if int(i) > 0})
    if not ids:
        return {'ok': False, 'message': 'action_ids 不能为空', 'confirmed': 0, 'failed': 0, 'details': []}

    details = []
    confirmed = 0
    failed = 0
    for action_id in ids:
        result = confirm_action(account=account, action_id=action_id)
        ok = bool(result.get('ok'))
        if ok:
            confirmed += 1
        else:
            failed += 1
        details.append({'action_id': action_id, 'ok': ok, 'message': result.get('message', '')})

    return {
        'ok': confirmed > 0 and failed == 0,
        'message': f'批量确认完成，成功 {confirmed}，失败 {failed}',
        'confirmed': confirmed,
        'failed': failed,
        'details': details,
    }


def get_kimi_claw_templates(account: Account) -> Dict[str, Any]:
    """
    P3.10：按角色分类返回 Kimi Claw 可用执行模板。
    """
    from apps.identity.authz import get_authz_service
    authz = get_authz_service()
    roles = authz.get_account_roles(account.id)
    categories = sorted({(r.category or '').strip() for r in roles if (r.category or '').strip()})
    if not categories:
        categories = ['operation']

    templates: List[Dict[str, Any]] = []
    seen = set()
    for cat in categories:
        for t in KIMI_CLAW_ROLE_TEMPLATE_LIBRARY.get(cat, []):
            key = t.get('template_id')
            if key and key not in seen:
                seen.add(key)
                templates.append({
                    **t,
                    'category': cat,
                    'delegable_action_types': sorted(list(KIMI_CLAW_DELEGABLE_ACTION_TYPES)),
                })
    return {
        'categories': categories,
        'templates': templates,
        'delegable_action_types': sorted(list(KIMI_CLAW_DELEGABLE_ACTION_TYPES)),
    }


def _detect_primary_role_category(account: Account) -> str:
    from apps.identity.authz import get_authz_service
    authz = get_authz_service()
    roles = authz.get_account_roles(account.id)
    if not roles:
        return 'operation'
    primary = sorted(roles, key=lambda r: int(getattr(r, 'level', 0) or 0), reverse=True)[0]
    category = str(getattr(primary, 'category', '') or '').strip()
    if category in KIMI_CLAW_ROLE_PRESETS:
        return category
    return 'operation'


def _get_openclaw_skill_root() -> Path:
    """
    OpenClaw skills 统一安装目录（项目根/openclaw-skills）。
    """
    default_root = Path(settings.BASE_DIR).resolve().parent / 'openclaw-skills'
    configured = os.getenv('OPENCLAW_SKILLS_DIR', '').strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return default_root


def _get_installed_skill_slugs() -> List[str]:
    root = _get_openclaw_skill_root()
    if not root.exists() or not root.is_dir():
        return []
    result = []
    for child in root.iterdir():
        if child.is_dir() and (child / 'SKILL.md').exists():
            result.append(child.name)
    return sorted(result)


def list_kimi_claw_presets(account: Account) -> Dict[str, Any]:
    detected = _detect_primary_role_category(account)
    items = []
    for preset_id, cfg in KIMI_CLAW_ROLE_PRESETS.items():
        items.append({
            'preset_id': preset_id,
            'label': f'Claw角色预设-{preset_id}',
            'config': cfg,
            'recommended': preset_id == detected,
        })
    return {
        'detected_preset': detected,
        'items': items,
    }


def list_kimi_claw_skill_bundles(account: Account) -> Dict[str, Any]:
    """
    P3.16：返回按角色推荐的 skills 包，并标记安装状态。
    """
    detected = _detect_primary_role_category(account)
    installed = set(_get_installed_skill_slugs())
    bundles = []
    for role, skills in KIMI_CLAW_ROLE_SKILL_BUNDLES.items():
        items = []
        for s in skills:
            slug = s.get('slug', '')
            items.append({
                'slug': slug,
                'value': s.get('value', ''),
                'installed': slug in installed,
            })
        bundles.append({
            'role': role,
            'recommended': role == detected,
            'items': items,
        })
    recommended_items = next((b['items'] for b in bundles if b['role'] == detected), [])
    missing_slugs = [i['slug'] for i in recommended_items if not i.get('installed')]
    install_cmd = (
        "clawhub install " + " && clawhub install ".join(missing_slugs)
    ) if missing_slugs else ''
    if install_cmd and missing_slugs:
        install_cmd += " --workdir \"$PWD\" --dir openclaw-skills --no-input --force"
    return {
        'detected_role': detected,
        'installed_skill_slugs': sorted(list(installed)),
        'bundles': bundles,
        'recommended_install_command': install_cmd,
    }


def get_research_insight_cards(account: Account, include_llm: bool = False) -> Dict[str, Any]:
    """
    P3.17：行业研究中台化洞察卡片（角色+技能驱动）。
    """
    role = _detect_primary_role_category(account)
    skill_info = list_kimi_claw_skill_bundles(account=account)
    installed = skill_info.get('installed_skill_slugs', []) or []
    overview = get_full_dashboard_overview(account, force_refresh=False)
    hot_topics = ((overview.get('hot_topics') or {}).get('topics') or [])[:5]
    trends = ((overview.get('hot_topics') or {}).get('trends') or [])[:5]
    mail_signals = ((overview.get('feishu_scan') or {}).get('mail') or [])[:5]
    project_analysis_text = str((overview.get('project_analysis') or {}).get('analysis') or '')[:2000]

    cards = [
        {'type': 'product', 'title': '产品机会与定位', 'summary': '', 'actions': []},
        {'type': 'market', 'title': '市场趋势与增量窗口', 'summary': '', 'actions': []},
        {'type': 'competition', 'title': '竞品对比与差异策略', 'summary': '', 'actions': []},
        {'type': 'paper_method', 'title': '论文方法与可借鉴路径', 'summary': '', 'actions': []},
        {'type': 'client_execution', 'title': '客户执行跟进与预判服务', 'summary': '', 'actions': []},
    ]

    default_summary_map = {
        'product': '基于近期信号优先聚焦可快速验证的产品方向，并明确下一轮验证指标。',
        'market': '关注高频需求与支付意愿信号，优先选择可快速闭环的细分场景。',
        'competition': '建议围绕响应速度、交付质量和专业解释能力做差异化定位。',
        'paper_method': '优先吸收可复现实验方法与行业共识指标，降低试错成本。',
        'client_execution': '对在执行项目建立风险前置跟进机制，提升客户体感与交付确定性。',
    }
    default_actions_map = {
        'product': ['整理本周TOP3需求假设', '输出最小可行验证方案', '明确结果判定门槛'],
        'market': ['更新细分市场机会清单', '补充目标客户画像', '形成下周调研样本计划'],
        'competition': ['建立竞品能力对照表', '提炼差异化话术', '跟踪竞品新功能变动'],
        'paper_method': ['维护论文方法清单', '标注可复现步骤', '输出可落地方法建议'],
        'client_execution': ['按项目输出风险跟进清单', '提前准备客户沟通要点', '设置关键节点预警提醒'],
    }

    for c in cards:
        c['summary'] = default_summary_map.get(c['type'], '')
        c['actions'] = default_actions_map.get(c['type'], [])

    if include_llm:
        try:
            prompt = """你是子衿研究中台分析师。请输出 JSON：
{
  "cards": [
    {"type":"product|market|competition|paper_method|client_execution","summary":"...","actions":["...","...","..."]}
  ]
}
要求：
1) summary 每条不超过80字，强调可执行与预判性服务；
2) actions 每条3项，动词开头；
3) 仅输出 JSON。"""
            llm_input = {
                'role': role,
                'installed_skills': installed,
                'hot_topics': hot_topics,
                'trends': trends,
                'mail_signals': mail_signals,
                'project_analysis': project_analysis_text,
            }
            out = quick_chat(
                message=prompt + "\n\n输入:\n" + json.dumps(llm_input, ensure_ascii=False),
                provider=AgentProvider.KIMI,
                model_id='moonshot-v1-32k',
                system_prompt='你是研究洞察助手，只输出 JSON。',
                temperature=0.2,
                max_tokens=1200,
            ).strip()
            if '```' in out:
                out = out.split('```')[1]
                if out.startswith('json'):
                    out = out[4:]
            parsed = json.loads(out)
            parsed_cards = parsed.get('cards', []) if isinstance(parsed, dict) else []
            parsed_map = {str(i.get('type') or '').strip(): i for i in parsed_cards if isinstance(i, dict)}
            for c in cards:
                i = parsed_map.get(c['type'])
                if not i:
                    continue
                summary = str(i.get('summary') or '').strip()
                actions = i.get('actions') if isinstance(i.get('actions'), list) else []
                if summary:
                    c['summary'] = summary
                if actions:
                    c['actions'] = [str(a).strip() for a in actions if str(a).strip()][:3]
        except Exception as e:
            logger.warning('research insight cards llm failed: %s', e)

    route_learning = _get_research_route_learning(account_id=account.id, days=90)
    route_overrides = get_research_route_preferences(account=account).get('overrides', {})
    for c in cards:
        route_info = _resolve_research_route_recommendation(
            card_type=str(c.get('type') or ''),
            route_learning=route_learning,
            route_overrides=route_overrides,
        )
        c['recommended_route'] = route_info['route']
        c['recommended_reason'] = route_info['reason']
        c['recommended_source'] = route_info['source']

    return {
        'role': role,
        'installed_skill_slugs': installed,
        'cards': cards,
        'route_learning': route_learning,
        'route_overrides': route_overrides,
        'signals': {
            'hot_topics': hot_topics,
            'trends': trends,
            'mail_signal_count': len(mail_signals),
        },
    }


def push_research_insights_to_action_inbox(
    account: Account,
    card_types: Optional[List[str]] = None,
    include_llm: bool = False,
) -> Dict[str, Any]:
    """
    P3.18：将研究洞察卡片一键写入动作箱（pending_confirm）。
    """
    insight = get_research_insight_cards(account=account, include_llm=include_llm)
    route_learning = _get_research_route_learning(account_id=account.id, days=90)
    route_overrides = get_research_route_preferences(account=account).get('overrides', {})
    cards = insight.get('cards', []) or []
    if card_types:
        wanted = {str(i or '').strip() for i in card_types if str(i or '').strip()}
        cards = [c for c in cards if str(c.get('type') or '').strip() in wanted]

    if not cards:
        return {'items': [], 'message': '未找到可入箱的洞察卡片'}

    snapshot = AssistantContextSnapshot.objects.filter(account_id=account.id).order_by('-created_at').first()
    now = timezone.now()
    recent_cutoff = now - timedelta(hours=24)
    created: List[Dict[str, Any]] = []

    for card in cards:
        card_type = str(card.get('type') or '').strip() or 'unknown'
        title = str(card.get('title') or '研究洞察跟进')
        summary = str(card.get('summary') or '').strip()
        actions = [str(a).strip() for a in (card.get('actions') or []) if str(a).strip()][:3]
        if not actions and not summary:
            continue

        route_info = _resolve_research_route_recommendation(
            card_type=card_type,
            route_learning=route_learning,
            route_overrides=route_overrides,
        )
        recommended_route = route_info['route']
        recommended_reason = route_info['reason']
        recommended_source = route_info['source']

        base_priority = 60
        base_confidence = 70
        if card_type in {'client_execution', 'market'}:
            base_priority = 72
            base_confidence = 74
        elif card_type in {'competition', 'product'}:
            base_priority = 66
            base_confidence = 70

        policy = _get_action_policy(account.id, 'research_insight_followup')
        payload = {
            'source': 'assistant_research_insight',
            'card_type': card_type,
            'card_title': title,
            'summary': summary,
            'next_actions': actions,
            'reason': f'已生成「{title}」洞察，建议转为可确认动作进入执行闭环',
            'evidence': [
                {'module': 'assistant_research_insight', 'metric': 'card_type', 'value': card_type},
                {'module': 'assistant_research_insight', 'metric': 'actions_count', 'value': len(actions)},
            ],
            'recommended_route': recommended_route,
            'recommended_reason': recommended_reason,
            'recommended_source': recommended_source,
            'priority_score': base_priority,
            'confidence_score': base_confidence,
            'conflict_key': f'research:insight:{card_type}:{now.date().isoformat()}',
        }
        payload = _enrich_action_payload_contract('research_insight_followup', payload)
        if int(payload['priority_score']) < int(policy.get('min_priority_score', 0) or 0):
            continue
        if int(payload['confidence_score']) < int(policy.get('min_confidence_score', 0) or 0):
            continue
        if not policy.get('enabled', True):
            continue

        duplicate_exists = AssistantActionPlan.objects.filter(
            account_id=account.id,
            created_at__gte=recent_cutoff,
            status__in=[
                AssistantActionPlan.Status.SUGGESTED,
                AssistantActionPlan.Status.PENDING_CONFIRM,
                AssistantActionPlan.Status.CONFIRMED,
            ],
            action_payload__conflict_key=payload['conflict_key'],
        ).exists()
        if duplicate_exists:
            continue

        row = AssistantActionPlan.objects.create(
            account_id=account.id,
            context_snapshot_id=(snapshot.id if snapshot else None),
            action_type='research_insight_followup',
            title=f'研究洞察跟进：{title}',
            description=summary or '将洞察转化为可执行跟进事项',
            action_payload=payload,
            risk_level=AssistantActionPlan.RiskLevel.LOW,
            status=AssistantActionPlan.Status.PENDING_CONFIRM,
            requires_confirmation=bool(policy.get('requires_confirmation', True)),
        )
        created.append({
            'id': row.id,
            'action_type': row.action_type,
            'title': row.title,
            'description': row.description,
            'status': row.status,
            'risk_level': row.risk_level,
            'card_type': card_type,
            'priority_score': payload.get('priority_score', 0),
            'confidence_score': payload.get('confidence_score', 0),
            'recommended_route': recommended_route,
            'recommended_source': recommended_source,
            'created_at': row.created_at.isoformat(),
        })

    if created:
        try:
            from apps.audit.services import log_audit
            from apps.audit.models import AuditAction
            log_audit(
                account_id=account.id,
                account_name=account.display_name or account.username,
                account_type=account.account_type,
                action=AuditAction.CREATE,
                resource_type='assistant_research_insight_actions',
                resource_id=f"{account.id}:{now.isoformat()}",
                resource_name='research_insight_followup',
                description='研究洞察一键入箱',
                new_value={'count': len(created), 'card_types': [i.get('card_type') for i in created]},
            )
        except Exception as e:
            logger.warning('研究洞察入箱审计写入失败: %s', e)

    return {
        'items': created,
        'message': '' if created else '无新增动作（可能已在24小时内入箱）',
    }


def apply_kimi_claw_preset(account: Account, preset_id: str = 'auto') -> Dict[str, Any]:
    """
    P3.15：一键应用角色化 Claw 预设（偏好中心）。
    """
    selected = (preset_id or 'auto').strip().lower()
    if selected == 'auto':
        selected = _detect_primary_role_category(account)
    if selected not in KIMI_CLAW_ROLE_PRESETS:
        return {'ok': False, 'message': f'未知预设: {selected}'}

    cfg = dict(KIMI_CLAW_ROLE_PRESETS[selected])
    save_result = upsert_assistant_preferences(account=account, payload=cfg)
    if not save_result.get('ok'):
        return {'ok': False, 'message': save_result.get('message', '预设应用失败')}

    return {
        'ok': True,
        'message': f'已应用 Claw 预设: {selected}',
        'preset_id': selected,
        'value': save_result.get('value', cfg),
    }


def list_route_governance_presets(account: Account) -> Dict[str, Any]:
    detected = _detect_primary_role_category(account)
    items = []
    for preset_id, cfg in ROUTE_GOVERNANCE_ROLE_PRESETS.items():
        items.append({
            'preset_id': preset_id,
            'label': preset_id,
            'recommended': preset_id == detected,
            'config': cfg,
        })
    return {'detected_preset': detected, 'items': items}


def apply_route_governance_preset(account: Account, preset_id: str = 'auto') -> Dict[str, Any]:
    selected = (preset_id or 'auto').strip().lower()
    if selected == 'auto':
        selected = _detect_primary_role_category(account)
    if selected not in ROUTE_GOVERNANCE_ROLE_PRESETS:
        return {'ok': False, 'message': f'未知预设: {selected}'}
    cfg = dict(ROUTE_GOVERNANCE_ROLE_PRESETS[selected])
    save_result = upsert_assistant_preferences(account=account, payload=cfg)
    if not save_result.get('ok'):
        return {'ok': False, 'message': save_result.get('message', '预设应用失败')}
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.UPDATE,
            resource_type='assistant_route_governance_preset',
            resource_id=f'{account.id}:{selected}',
            resource_name=selected,
            description='应用路径治理角色预设',
            new_value={'preset_id': selected, 'config': cfg},
        )
    except Exception as e:
        logger.warning(f'路径治理预设审计写入失败: {e}')
    return {
        'ok': True,
        'message': f'已应用路径治理预设: {selected}',
        'preset_id': selected,
        'value': save_result.get('value', cfg),
    }


def submit_claw_execution_receipt(
    account: Account,
    action_id: int,
    run_id: str = '',
    status: str = 'success',
    retry_count: int = 0,
    output_artifacts: Optional[List[Dict[str, Any]]] = None,
    screenshot_refs: Optional[List[str]] = None,
    message: str = '',
    skills_used: Optional[List[str]] = None,
    step_traces: Optional[List[Dict[str, Any]]] = None,
    error_taxonomy: Optional[Dict[str, Any]] = None,
    failed_step: str = '',
    context_coverage: Optional[Dict[str, Any]] = None,
    required_vs_granted_scopes: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    P3.11：回写 Kimi Claw 执行回执（run_id/产物/截图/重试）。
    """
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在'}
    if row.requires_confirmation and row.status not in [
        AssistantActionPlan.Status.CONFIRMED,
        AssistantActionPlan.Status.EXECUTED,
    ]:
        return {'ok': False, 'message': '动作尚未确认，不能回写Claw回执'}

    normalized_status = str(status or 'success').strip().lower()
    if normalized_status not in ['success', 'failed', 'partial']:
        normalized_status = 'success'

    run_id = (run_id or '').strip() or f'claw-{uuid.uuid4().hex[:12]}'
    retry_count = max(0, int(retry_count or 0))
    artifacts = output_artifacts if isinstance(output_artifacts, list) else []
    screenshots = screenshot_refs if isinstance(screenshot_refs, list) else []
    skills = [str(s).strip() for s in (skills_used or []) if str(s).strip()]
    traces = step_traces if isinstance(step_traces, list) else []
    taxonomy = error_taxonomy if isinstance(error_taxonomy, dict) else {}
    coverage = context_coverage if isinstance(context_coverage, dict) else {}
    scope_proof = required_vs_granted_scopes if isinstance(required_vs_granted_scopes, dict) else {}

    capability = _resolve_action_capability(row.action_type)
    trace_id = f"assistant-claw-{row.id}-{uuid.uuid4().hex[:8]}"
    execution = AssistantActionExecution.objects.create(
        action_plan_id=row.id,
        executor_id=account.id,
        execution_result=_build_execution_result(
            status=normalized_status,
            message=(message or '').strip(),
            capability=capability,
            trace_id=trace_id,
            extra={
                'channel': 'kimi_claw',
                'run_id': run_id,
                'retry_count': retry_count,
                'output_artifact_count': len(artifacts),
                'screenshot_count': len(screenshots),
                'skills_used': skills,
                'step_traces': traces,
                'error_taxonomy': taxonomy,
                'failed_step': str(failed_step or ''),
                'context_coverage': coverage,
                'required_vs_granted_scopes': scope_proof,
            },
        ),
        target_refs=[
            {'type': 'artifact', 'items': artifacts},
            {'type': 'screenshot', 'items': screenshots},
        ],
        finished_at=timezone.now(),
    )

    if normalized_status == 'success':
        row.status = AssistantActionPlan.Status.EXECUTED
    elif normalized_status == 'failed':
        row.status = AssistantActionPlan.Status.FAILED
    row.save(update_fields=['status', 'updated_at'])

    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.UPDATE,
            resource_type='assistant_claw_execution',
            resource_id=str(execution.id),
            resource_name=f'action:{row.id}',
            description='回写Kimi Claw执行回执',
            new_value={
                'run_id': run_id,
                'status': normalized_status,
                'retry_count': retry_count,
                'output_artifact_count': len(artifacts),
                'screenshot_count': len(screenshots),
            },
        )
    except Exception as e:
        logger.warning(f'Claw回执审计写入失败: {e}')

    return {
        'ok': True,
        'message': 'Claw执行回执已记录',
        'execution_id': execution.id,
        'action_status': row.status,
        'run_id': run_id,
        'trace_id': trace_id,
        'capability_key': capability.get('capability_key', ''),
        'target_system': capability.get('target_system', 'kimi_claw'),
        'skills_used': skills,
        'failed_step': str(failed_step or ''),
        'context_coverage': coverage,
        'required_vs_granted_scopes': scope_proof,
    }


def delegate_action_to_kimi_claw(
    account: Account,
    action_id: int,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    P3.13：将动作委派给 Kimi Claw 执行，并自动回写回执。
    """
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在'}
    if row.action_type not in KIMI_CLAW_DELEGABLE_ACTION_TYPES:
        return {'ok': False, 'message': f'动作类型暂不支持委派Claw: {row.action_type}'}
    if row.requires_confirmation and row.status != AssistantActionPlan.Status.CONFIRMED:
        return {'ok': False, 'message': '动作尚未确认，不能委派Claw执行'}

    kimi_api_key = (
        getattr(settings, 'KIMI_API_KEY', None)
        or os.getenv('KIMI_API_KEY')
        or os.getenv('KIMI_PLUGIN_API_KEY')
        or ''
    ).strip()
    task_template_id = (
        getattr(settings, 'KIMI_CLAW_TASK_TEMPLATE_ID', None)
        or os.getenv('KIMI_CLAW_TASK_TEMPLATE_ID')
        or '19c8d565-df92-8fdc-8000-0000c6875563'
    )
    task_template_id = str(task_template_id).strip()
    claw_project_id = str(
        getattr(settings, 'KIMI_CLAW_PROJECT_ID', None)
        or os.getenv('KIMI_CLAW_PROJECT_ID')
        or ''
    ).strip()
    claw_org_id = str(
        getattr(settings, 'KIMI_CLAW_ORG_ID', None)
        or os.getenv('KIMI_CLAW_ORG_ID')
        or ''
    ).strip()
    trace_id = f"assistant-claw-{row.id}-{uuid.uuid4().hex[:8]}"
    capability = _resolve_action_capability(row.action_type)
    contract_payload = _enrich_action_payload_contract(row.action_type, row.action_payload or {}, capability=capability)
    policy = _get_action_policy(account.id, row.action_type)
    gate_report = _evaluate_execution_gates(
        account=account,
        row=row,
        payload=contract_payload,
        policy=policy,
        capability=capability,
    )
    if not gate_report.get('ok'):
        return {
            'ok': False,
            'message': str(gate_report.get('message') or '委派门禁未通过'),
            'failed_step': gate_report.get('failed_step', ''),
            'missing_scopes': gate_report.get('missing_scopes', []),
            'required_vs_granted_scopes': gate_report.get('required_vs_granted_scopes', {}),
            'context_coverage': gate_report.get('context_coverage', {}),
        }
    scope_proof = _resolve_scope_proof(account, capability)
    coverage = _build_context_coverage(account, contract_payload, capability)
    task_payload = {
        'task_type': row.action_type,
        'title': row.title,
        'description': row.description,
        'action_id': row.id,
        'account_id': account.id,
        'trace_id': trace_id,
        'context': contract_payload,
        'context_coverage': coverage,
        'required_vs_granted_scopes': scope_proof,
        'expected_skills': capability.get('expected_skills', []),
        'expected_output': {
            'artifacts': True,
            'screenshots': True,
            'summary': True,
        },
        'task_template_id': task_template_id,
        'provider_context': {
            'project_id': claw_project_id,
            'org_id': claw_org_id,
        },
    }
    if not kimi_api_key:
        return {'ok': False, 'message': '未配置 KIMI_API_KEY/KIMI_PLUGIN_API_KEY，无法委派执行'}
    from .kimi_claw_runtime import execute_kimi_claw_task
    runtime_result = execute_kimi_claw_task(
        task=task_payload,
        trace_id=trace_id,
        idempotency_key=f'action-{row.id}-{row.updated_at.timestamp()}',
        api_key=kimi_api_key,
        dry_run=bool(dry_run),
    )
    if not runtime_result.get('ok'):
        receipt = submit_claw_execution_receipt(
            account=account,
            action_id=row.id,
            run_id=f'claw-failed-{uuid.uuid4().hex[:8]}',
            status='failed',
            retry_count=0,
            output_artifacts=[],
            screenshot_refs=[],
            message=str(runtime_result.get('message') or 'KimiClaw runtime 调用失败'),
            skills_used=[],
            step_traces=[],
            error_taxonomy={'type': 'runtime_error', 'source': 'kimi_claw_runtime_http'},
            failed_step='runtime_call',
            context_coverage=coverage,
            required_vs_granted_scopes=scope_proof,
        )
        return {
            'ok': False,
            'message': str(runtime_result.get('message') or 'KimiClaw runtime 调用失败'),
            'delegate': {
                'dry_run': bool(dry_run),
                'mode': 'kimi_claw_runtime_http',
                'status': 'failed',
                'task_template_id': task_template_id,
                'project_id': claw_project_id,
                'org_id': claw_org_id,
            },
            'receipt': receipt,
        }

    run_id = str(runtime_result.get('run_id') or '').strip() or f'claw-{uuid.uuid4().hex[:12]}'
    status = str(runtime_result.get('status') or 'partial').strip().lower()
    retry_count = int(runtime_result.get('retry_count') or 0)
    artifacts = runtime_result.get('output_artifacts') or []
    screenshots = runtime_result.get('screenshot_refs') or []
    skills_used = runtime_result.get('skills_used') or []
    step_traces = runtime_result.get('step_traces') or []
    error_taxonomy = runtime_result.get('error_taxonomy') or {}
    failed_step = str(runtime_result.get('failed_step') or '').strip()
    message = str(runtime_result.get('message') or 'KimiClaw runtime 已返回')
    if status == 'partial' and not artifacts:
        artifacts = _build_default_claw_artifacts(row, message=message)
    if status == 'partial' and not screenshots:
        screenshots = [f'placeholder://{row.id}/claw_partial_screenshot_1.png']

    receipt = submit_claw_execution_receipt(
        account=account,
        action_id=row.id,
        run_id=run_id,
        status=status,
        retry_count=retry_count,
        output_artifacts=artifacts,
        screenshot_refs=screenshots,
        message=message,
        skills_used=skills_used,
        step_traces=step_traces,
        error_taxonomy=error_taxonomy,
        failed_step=failed_step,
        context_coverage=coverage,
        required_vs_granted_scopes=scope_proof,
    )
    delegate_ok = bool(receipt.get('ok')) and status != 'failed'
    return {
        'ok': delegate_ok,
        'message': message or receipt.get('message', ''),
        'delegate': {
            'dry_run': bool(dry_run),
            'mode': 'kimi_claw_runtime_http',
            'run_id': receipt.get('run_id', ''),
            'status': status,
            'task_template_id': task_template_id,
            'project_id': claw_project_id,
            'org_id': claw_org_id,
        },
        'receipt': receipt,
    }


def get_action_execution_replay(account: Account, action_id: int) -> Dict[str, Any]:
    """
    P3.12：获取动作执行回放数据（执行记录 + 产物/截图引用）。
    """
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在', 'action': None, 'executions': []}

    executions = AssistantActionExecution.objects.filter(
        action_plan_id=row.id
    ).order_by('-started_at')[:50]

    capability = _resolve_action_capability(row.action_type)
    payload = _enrich_action_payload_contract(row.action_type, row.action_payload or {}, capability=capability)
    scope_proof = _resolve_scope_proof(account, capability)
    coverage = _build_context_coverage(account, payload, capability)
    permission_proofs = []
    for code in capability.get('required_permissions', []):
        permission_proofs.append({'permission': code, 'granted': _has_permission(account, code)})
    return {
        'ok': True,
        'message': 'OK',
        'action': {
            'id': row.id,
            'action_type': row.action_type,
            'title': row.title,
            'description': row.description,
            'status': row.status,
            'risk_level': row.risk_level,
            'can_delegate_to_claw': row.action_type in KIMI_CLAW_DELEGABLE_ACTION_TYPES,
            'capability_key': capability.get('capability_key', ''),
            'target_system': capability.get('target_system', 'cn_kis'),
            'executor': capability.get('executor', 'cn_kis_adapter'),
            'operator_mode': capability.get('operator_mode', ASSISTANT_DEFAULT_OPERATOR_MODE),
            'permission_proofs': permission_proofs,
            'required_feishu_scopes': capability.get('required_feishu_scopes', []),
            'required_vs_granted_scopes': scope_proof,
            'expected_skills': payload.get('expected_skills', []),
            'minimum_context_requirements': payload.get('minimum_context_requirements', []),
            'context_coverage': coverage,
            'missing_context_items': coverage.get('missing_items', []),
        },
        'executions': [
            {
                'execution_id': ex.id,
                'result': ex.execution_result or {},
                'target_refs': ex.target_refs or [],
                'started_at': ex.started_at.isoformat() if ex.started_at else None,
                'finished_at': ex.finished_at.isoformat() if ex.finished_at else None,
            }
            for ex in executions
        ],
    }


def confirm_action(account: Account, action_id: int) -> Dict[str, Any]:
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在'}
    if row.status in [AssistantActionPlan.Status.EXECUTED, AssistantActionPlan.Status.REJECTED]:
        return {'ok': False, 'message': f'当前状态不允许确认: {row.status}'}
    row.status = AssistantActionPlan.Status.CONFIRMED
    row.confirmed_by = account.id
    row.confirmed_at = timezone.now()
    row.save(update_fields=['status', 'confirmed_by', 'confirmed_at', 'updated_at'])
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.APPROVE,
            resource_type='assistant_action',
            resource_id=str(row.id),
            resource_name=row.title,
            description='确认子衿动作',
            new_value={'status': row.status},
        )
    except Exception as e:
        logger.warning(f'动作确认审计写入失败: {e}')
    return {'ok': True, 'message': '已确认'}


def reject_action(account: Account, action_id: int, reason: str = '') -> Dict[str, Any]:
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在'}
    if row.status == AssistantActionPlan.Status.EXECUTED:
        return {'ok': False, 'message': '已执行动作不可拒绝'}
    row.status = AssistantActionPlan.Status.REJECTED
    payload = row.action_payload or {}
    if reason:
        payload['reject_reason'] = reason
        row.action_payload = payload
    row.save(update_fields=['status', 'action_payload', 'updated_at'])
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.REJECT,
            resource_type='assistant_action',
            resource_id=str(row.id),
            resource_name=row.title,
            description='拒绝子衿动作',
            new_value={'status': row.status, 'reason': reason},
        )
    except Exception as e:
        logger.warning(f'动作拒绝审计写入失败: {e}')
    return {'ok': True, 'message': '已拒绝'}


def _gen_ticket_code() -> str:
    ts = timezone.now().strftime('%Y%m%d%H%M%S')
    suffix = ''.join(random.choices(string.digits, k=4))
    return f'AST-{ts}-{suffix}'


def _execute_feishu_adapter(
    account: Account,
    row: AssistantActionPlan,
    payload: Dict[str, Any],
    trace_id: str,
    capability: Dict[str, Any],
) -> Dict[str, Any]:
    refs: List[Dict[str, Any]] = []
    action_type = row.action_type

    # 新增：飞书消息发送（chat_id 必填）
    if action_type == 'feishu_im_message_send':
        chat_id = str(payload.get('chat_id') or '').strip()
        text = str(payload.get('text') or row.description or row.title).strip()
        if not chat_id:
            return {'status': 'failed', 'message': '缺少必要参数: chat_id', 'target_refs': refs}
        if not text:
            return {'status': 'failed', 'message': '缺少必要参数: text', 'target_refs': refs}
        msg = feishu_client.send_text_to_chat(chat_id=chat_id, text=text)
        message_id = ((msg or {}).get('message') or {}).get('message_id', '')
        refs.append({'type': 'feishu_im_message', 'chat_id': chat_id, 'message_id': message_id, 'trace_id': trace_id})
        return {'status': 'success', 'message': '飞书消息已发送', 'target_refs': refs}

    # 新增：飞书日历事件创建（calendar_id 可选，缺省仅降级提示）
    if action_type == 'feishu_calendar_event_create':
        calendar_id = str(payload.get('calendar_id') or '').strip()
        summary = str(payload.get('summary') or row.title or '子衿自动创建日程').strip()
        start_ts = int(payload.get('start_timestamp') or 0)
        end_ts = int(payload.get('end_timestamp') or 0)
        if not calendar_id:
            return {'status': 'failed', 'message': '缺少必要参数: calendar_id', 'target_refs': refs}
        if start_ts <= 0 or end_ts <= 0 or end_ts <= start_ts:
            return {'status': 'failed', 'message': 'start_timestamp/end_timestamp 不合法', 'target_refs': refs}
        data = feishu_client.create_calendar_event(
            calendar_id=calendar_id,
            summary=summary,
            start_time=start_ts,
            end_time=end_ts,
            description=str(payload.get('description') or row.description or ''),
            location=str(payload.get('location') or ''),
            attendee_ids=[str(i).strip() for i in (payload.get('attendee_open_ids') or []) if str(i).strip()],
        )
        event_id = ((data or {}).get('event') or {}).get('event_id', '')
        refs.append({'type': 'feishu_calendar_event', 'calendar_id': calendar_id, 'event_id': event_id, 'trace_id': trace_id})
        return {'status': 'success', 'message': '飞书日程已创建', 'target_refs': refs}

    # 新增：飞书任务创建
    if action_type == 'feishu_task_create':
        summary = str(payload.get('summary') or row.title or '子衿自动创建任务').strip()
        if not summary:
            return {'status': 'failed', 'message': '缺少必要参数: summary', 'target_refs': refs}
        due_ts = int(payload.get('due_timestamp') or 0) or None
        task = feishu_client.create_task(
            summary=summary,
            description=str(payload.get('description') or row.description or ''),
            due_timestamp=due_ts,
            member_open_ids=[str(i).strip() for i in (payload.get('member_open_ids') or []) if str(i).strip()],
            extra=json.dumps({'action_id': row.id, 'trace_id': trace_id}, ensure_ascii=False),
        )
        guid = ((task or {}).get('task') or {}).get('guid', '')
        refs.append({'type': 'feishu_task', 'task_guid': guid, 'trace_id': trace_id})
        return {'status': 'success', 'message': '飞书任务已创建', 'target_refs': refs}

    # 兼容旧动作：通知类按系统通知落地
    from apps.notification.models import NotificationRecord, NotificationChannel, NotificationPriority, NotificationStatus
    content = row.description or '系统已按确认执行该动作（P2骨架）'
    note = NotificationRecord.objects.create(
        title=f'子衿动作执行：{row.title}',
        content=content,
        channel=NotificationChannel.SYSTEM,
        priority=NotificationPriority.NORMAL,
        recipient_id=account.id,
        source_type='assistant_action',
        source_id=row.id,
        source_workstation='secretary',
        status=NotificationStatus.DELIVERED,
    )
    refs.append({'type': 'notification', 'id': note.id, 'trace_id': trace_id})
    return {'status': 'success', 'message': '飞书侧动作已执行（系统通知落地）', 'target_refs': refs}


def _execute_cnkis_adapter(
    account: Account,
    row: AssistantActionPlan,
    payload: Dict[str, Any],
    trace_id: str,
    capability: Dict[str, Any],
) -> Dict[str, Any]:
    refs: List[Dict[str, Any]] = []

    if row.action_type == 'crm_ticket_draft':
        client_id = payload.get('client_id')
        if client_id:
            from apps.crm.models import Ticket, Client, TicketPriority, TicketStatus
            client = Client.objects.filter(id=client_id, is_deleted=False).first()
            if not client:
                return {'status': 'failed', 'message': 'client_id 不存在或已删除', 'target_refs': refs}
            ticket = Ticket.objects.create(
                code=_gen_ticket_code(),
                title=payload.get('title') or row.title or '子衿自动创建跟进工单',
                client=client,
                category=payload.get('category') or 'assistant_followup',
                priority=payload.get('priority') or TicketPriority.MEDIUM,
                status=TicketStatus.OPEN,
                description=payload.get('description') or row.description,
                created_by_id=account.id,
            )
            refs.append({'type': 'crm_ticket', 'id': ticket.id, 'code': ticket.code, 'trace_id': trace_id})
            return {'status': 'success', 'message': '已创建 CRM 工单草稿', 'target_refs': refs}
        else:
            return _fallback_to_llm_summary(account, row, payload, trace_id, refs,
                task_desc='基于邮件线索整理客户跟进要点，输出待创建工单的标题、描述、跟进建议')

    if row.action_type == 'mail_intent_brief':
        return _fallback_to_llm_summary(account, row, payload, trace_id, refs,
            task_desc='从近期邮件信息中提取客户需求意图，按优先级列出摘要和建议跟进动作')

    if row.action_type == 'workorder_followup_comment':
        work_order_id = payload.get('work_order_id')
        if work_order_id:
            from apps.workorder.models import WorkOrder, WorkOrderComment
            wo = WorkOrder.objects.filter(id=work_order_id, is_deleted=False).first()
            if not wo:
                return {'status': 'failed', 'message': 'work_order_id 不存在或已删除', 'target_refs': refs}
            comment = WorkOrderComment.objects.create(
                work_order=wo,
                author_id=account.id,
                content=payload.get('comment') or '子衿自动跟进提醒',
            )
            refs.append({'type': 'workorder_comment', 'id': comment.id, 'work_order_id': wo.id, 'trace_id': trace_id})
            return {'status': 'success', 'message': '已创建工单跟进备注', 'target_refs': refs}
        else:
            return _fallback_to_llm_summary(account, row, payload, trace_id, refs,
                task_desc='分析待处理工单状况，给出跟进建议和优先级排序')

    if row.action_type == 'daily_digest_prepare':
        summary_type = str(payload.get('summary_type') or 'daily')
        preferred_tone = get_assistant_preferences(account).get('value', {}).get('summary_tone', 'ops')
        digest = generate_assistant_summary(
            account=account,
            summary_type=summary_type,
            context_snapshot_id=None,
            tone=str(preferred_tone or 'ops'),
        )
        draft_id = digest.get('draft_id')
        if not draft_id:
            return {'status': 'failed', 'message': digest.get('message') or '日报草稿生成失败', 'target_refs': refs}
        refs.append({'type': 'assistant_summary_draft', 'id': draft_id, 'trace_id': trace_id})
        return {'status': 'success', 'message': '已生成日报草稿', 'target_refs': refs}

    if row.action_type in ('risk_followup_plan', 'agent_channel_alert', 'research_insight_followup', 'research_route_governance_alert'):
        return _fallback_to_llm_summary(account, row, payload, trace_id, refs,
            task_desc=f'针对「{row.title}」，输出风险评估、跟进要点和可执行建议清单')

    from apps.notification.models import NotificationRecord, NotificationChannel, NotificationPriority, NotificationStatus
    note = NotificationRecord.objects.create(
        title=f'子衿动作执行：{row.title}',
        content=row.description or '系统已按确认执行该动作',
        channel=NotificationChannel.SYSTEM,
        priority=NotificationPriority.NORMAL,
        recipient_id=account.id,
        source_type='assistant_action',
        source_id=row.id,
        source_workstation='secretary',
        status=NotificationStatus.DELIVERED,
    )
    refs.append({'type': 'notification', 'id': note.id, 'trace_id': trace_id})
    return {'status': 'success', 'message': 'CN_KIS 侧动作已执行', 'target_refs': refs}


def _fallback_to_llm_summary(
    account: Account,
    row: AssistantActionPlan,
    payload: Dict[str, Any],
    trace_id: str,
    refs: List[Dict[str, Any]],
    task_desc: str = '',
) -> Dict[str, Any]:
    """
    当动作缺少具体业务参数（如 client_id）时，
    降级为用 LLM 基于上下文生成可执行摘要并以系统通知送达用户。
    """
    context_snippet = {
        'action_type': row.action_type,
        'title': row.title,
        'description': row.description,
        'payload_reason': payload.get('reason', ''),
        'payload_evidence': payload.get('evidence', []),
    }

    try:
        snapshot = AssistantContextSnapshot.objects.filter(account_id=account.id).order_by('-id').first()
        if snapshot:
            sp = snapshot.context_payload or {}
            fs = (sp.get('dashboard', {}) or {}).get('feishu_scan', {}) or {}
            context_snippet['feishu_mail'] = (fs.get('mail') or [])[:5]
            context_snippet['feishu_im'] = (fs.get('im') or [])[:5]
            context_snippet['feishu_task'] = (fs.get('task') or [])[:5]
            context_snippet['stats'] = sp.get('stats', {})
    except Exception:
        pass

    prompt = f"""你是子衿工作台执行助手。请根据以下上下文完成任务。

任务要求：{task_desc}

上下文数据：
{json.dumps(context_snippet, ensure_ascii=False, indent=2)}

请直接输出可执行的分析结果（Markdown 格式），不要输出 JSON。"""

    try:
        result_text = quick_chat(
            message=prompt,
            provider=AgentProvider.KIMI,
            model_id='moonshot-v1-32k',
            system_prompt='你是子衿执行助手。直接输出分析与建议，简洁专业。',
            temperature=0.3,
            max_tokens=1500,
        ).strip()
    except Exception as e:
        logger.warning(f'LLM 降级执行失败: {e}')
        result_text = f'自动分析暂不可用（{str(e)[:80]}），请手动处理。'

    from apps.notification.models import NotificationRecord, NotificationChannel, NotificationPriority, NotificationStatus
    note = NotificationRecord.objects.create(
        title=f'子衿执行结果：{row.title}',
        content=result_text[:2000],
        channel=NotificationChannel.SYSTEM,
        priority=NotificationPriority.NORMAL,
        recipient_id=account.id,
        source_type='assistant_action',
        source_id=row.id,
        source_workstation='secretary',
        status=NotificationStatus.DELIVERED,
    )
    refs.append({'type': 'notification', 'id': note.id, 'trace_id': trace_id, 'llm_fallback': True})
    return {'status': 'success', 'message': '已生成分析结果并推送到通知中心', 'target_refs': refs}


def _execute_kimi_claw_adapter(
    account: Account,
    row: AssistantActionPlan,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    dry_run = bool(payload.get('dry_run', True))
    delegated = delegate_action_to_kimi_claw(account=account, action_id=row.id, dry_run=dry_run)
    if not delegated.get('ok'):
        return {'status': 'failed', 'message': delegated.get('message', 'Kimi Claw 委派失败'), 'target_refs': []}
    receipt = delegated.get('receipt', {}) if isinstance(delegated.get('receipt'), dict) else {}
    target_refs = receipt.get('target_refs', []) if isinstance(receipt.get('target_refs'), list) else []
    return {
        'status': 'success',
        'message': delegated.get('message', 'Kimi Claw 委派执行完成'),
        'target_refs': target_refs,
        'channel': 'kimi_claw',
        'run_id': (delegated.get('delegate', {}) or {}).get('run_id', ''),
    }


def _execute_via_executor_hub(
    account: Account,
    row: AssistantActionPlan,
    payload: Dict[str, Any],
    trace_id: str,
    capability: Dict[str, Any],
) -> Dict[str, Any]:
    executor = str(capability.get('executor') or 'cn_kis_adapter').strip()
    if executor == 'feishu_adapter':
        return _execute_feishu_adapter(account=account, row=row, payload=payload, trace_id=trace_id, capability=capability)
    if executor == 'kimi_claw_adapter':
        return _execute_kimi_claw_adapter(account=account, row=row, payload=payload)
    return _execute_cnkis_adapter(account=account, row=row, payload=payload, trace_id=trace_id, capability=capability)


def execute_action(
    account: Account,
    action_id: int,
    override_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    P2：动作执行（默认确认后执行）
    当前版本先落地可审计执行骨架，具体跨模块执行器后续逐项接入。
    """
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在'}
    if row.requires_confirmation and row.status != AssistantActionPlan.Status.CONFIRMED:
        return {'ok': False, 'message': '动作尚未确认，不能执行'}
    if row.status == AssistantActionPlan.Status.EXECUTED:
        return {'ok': False, 'message': '动作已执行'}

    trace_id = f"assistant-exec-{row.id}-{uuid.uuid4().hex[:8]}"
    capability = _resolve_action_capability(row.action_type)
    execution = AssistantActionExecution.objects.create(
        action_plan_id=row.id,
        executor_id=account.id,
        execution_result=_build_execution_result(
            status='started',
            message='执行已开始',
            capability=capability,
            trace_id=trace_id,
            extra={
                'required_permissions': capability.get('required_permissions', []),
                'required_feishu_scopes': capability.get('required_feishu_scopes', []),
            },
        ),
        target_refs=[],
    )
    payload = dict(row.action_payload or {})
    if override_payload:
        payload.update(override_payload)
    payload = _enrich_action_payload_contract(row.action_type, payload, capability=capability)
    policy = _get_action_policy(account.id, row.action_type)
    gate_report = _evaluate_execution_gates(
        account=account,
        row=row,
        payload=payload,
        policy=policy,
        capability=capability,
    )
    if not gate_report.get('ok'):
        gate_error = str(gate_report.get('message') or '执行门禁未通过')
        fail_result = _build_execution_result(
            status='failed',
            message=gate_error,
            capability=capability,
            trace_id=trace_id,
            extra={
                'failed_step': gate_report.get('failed_step', ''),
                'why_blocked': gate_report.get('why_blocked', ''),
                'missing_scopes': gate_report.get('missing_scopes', []),
                'required_vs_granted_scopes': gate_report.get('required_vs_granted_scopes', {}),
                'context_coverage': gate_report.get('context_coverage', {}),
            },
        )
        execution.execution_result = fail_result
        execution.finished_at = timezone.now()
        execution.save(update_fields=['execution_result', 'finished_at'])
        row.status = AssistantActionPlan.Status.FAILED
        row.save(update_fields=['status', 'updated_at'])
        return {
            'ok': False,
            'message': gate_error,
            'execution_id': execution.id,
            'status': row.status,
            'failed_step': gate_report.get('failed_step', ''),
            'missing_scopes': gate_report.get('missing_scopes', []),
            'required_vs_granted_scopes': gate_report.get('required_vs_granted_scopes', {}),
            'context_coverage': gate_report.get('context_coverage', {}),
            'target_refs': [],
        }

    adapter_result = _execute_via_executor_hub(
        account=account,
        row=row,
        payload=payload,
        trace_id=trace_id,
        capability=capability,
    )
    refs = adapter_result.get('target_refs', []) if isinstance(adapter_result.get('target_refs'), list) else []
    status = str(adapter_result.get('status') or 'failed').strip().lower()
    if status not in {'success', 'failed', 'partial'}:
        status = 'failed'
    message = str(adapter_result.get('message') or '执行完成').strip()
    result = _build_execution_result(
        status=status,
        message=message,
        capability=capability,
        trace_id=trace_id,
        extra={
            'channel': str(adapter_result.get('channel') or capability.get('target_system') or 'cn_kis'),
            'run_id': str(adapter_result.get('run_id') or ''),
            'output_artifact_count': sum(1 for r in refs if isinstance(r, dict) and r.get('type') in {'artifact', 'doc', 'sheet', 'json'}),
            'screenshot_count': sum(1 for r in refs if isinstance(r, dict) and r.get('type') == 'screenshot'),
            'required_permissions': capability.get('required_permissions', []),
            'required_feishu_scopes': capability.get('required_feishu_scopes', []),
            'required_vs_granted_scopes': gate_report.get('required_vs_granted_scopes', {}),
            'context_coverage': gate_report.get('context_coverage', {}),
            'skills_used': adapter_result.get('skills_used') or [],
            'step_traces': adapter_result.get('step_traces') or [],
            'error_taxonomy': adapter_result.get('error_taxonomy') or {},
            'failed_step': adapter_result.get('failed_step') or '',
        },
    )

    execution.execution_result = result
    execution.target_refs = refs
    execution.finished_at = timezone.now()
    execution.save(update_fields=['execution_result', 'target_refs', 'finished_at'])

    if result.get('status') == 'success':
        row.status = AssistantActionPlan.Status.EXECUTED
    else:
        row.status = AssistantActionPlan.Status.FAILED
    row.save(update_fields=['status', 'updated_at'])

    # 审计留痕
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.UPDATE,
            resource_type='assistant_action',
            resource_id=str(row.id),
            resource_name=row.title,
            description=f"执行子衿动作: {row.action_type}",
            new_value={'status': row.status, 'execution_result': result, 'target_refs': refs},
        )
    except Exception as e:
        logger.warning(f'写入审计失败: {e}')

    return {
        'ok': result.get('status') == 'success',
        'message': result.get('message', ''),
        'execution_id': execution.id,
        'status': row.status,
        'failed_step': result.get('failed_step', ''),
        'missing_scopes': (gate_report.get('required_vs_granted_scopes', {}) or {}).get('missing', []),
        'required_vs_granted_scopes': gate_report.get('required_vs_granted_scopes', {}),
        'context_coverage': gate_report.get('context_coverage', {}),
        'target_refs': refs,
        'trace_id': trace_id,
        'capability_key': capability.get('capability_key', ''),
        'target_system': capability.get('target_system', 'cn_kis'),
    }


def submit_action_feedback(
    account: Account,
    action_id: int,
    adopted: bool,
    score: Optional[int] = None,
    note: str = '',
) -> Dict[str, Any]:
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在'}

    if score is not None:
        score = max(1, min(5, int(score)))

    fb = AssistantActionFeedback.objects.create(
        action_plan_id=row.id,
        account_id=account.id,
        adopted=adopted,
        score=score,
        note=note or '',
    )
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.UPDATE,
            resource_type='assistant_action_feedback',
            resource_id=str(fb.id),
            resource_name=f'action:{row.id}',
            description='提交子衿动作反馈',
            new_value={'adopted': adopted, 'score': score, 'note': note},
        )
    except Exception as e:
        logger.warning(f'动作反馈审计写入失败: {e}')
    learning_result = {'written': False}
    try:
        from .feedback_loop_service import record_feedback_learning_cycle

        payload = row.action_payload or {}
        worker_code = (
            str(payload.get('worker_code') or '').strip()
            or str(payload.get('role_code') or '').strip()
            or str(payload.get('agent_id') or '').strip()
            or 'secretary-assistant'
        )
        if adopted:
            outcome = f'动作「{row.action_type}」被采纳'
            root_cause = note or '用户认可当前建议路径'
            if score is not None and score >= 4:
                better_policy = '继续保持当前建议结构，优先给出可直接执行的下一步动作。'
                replay_score = 0.92
            elif score is not None and score <= 2:
                better_policy = '保留建议方向，但缩短建议链路，并补充更明确的执行前提。'
                replay_score = 0.55
            else:
                better_policy = '继续输出当前类型建议，并在必要时补充简短依据与预期收益。'
                replay_score = 0.8
        else:
            outcome = f'动作「{row.action_type}」未被采纳'
            root_cause = note or '用户认为建议时机、粒度或说明不足'
            better_policy = (
                '降低同类建议的主动推送频率，增加触发条件说明、风险依据和人工确认边界，'
                '优先输出更聚焦且更可落地的建议。'
            )
            replay_score = 0.35 if score is None else max(0.1, min(0.7, score / 10.0))

        learning = record_feedback_learning_cycle(
            account_id=account.id,
            agent_id=worker_code,
            action_type=row.action_type,
            outcome=outcome,
            root_cause=root_cause,
            better_policy=better_policy,
            replay_score=replay_score,
            evidence={
                'action_id': row.id,
                'feedback_id': fb.id,
                'risk_level': row.risk_level,
                'score': score,
                'title': row.title,
            },
        )
        learning_result = {
            'written': True,
            'policy_update_id': learning.get('id'),
            'policy_status': learning.get('status', ''),
            'worker_code': worker_code,
        }
    except Exception as e:
        logger.warning(f'动作反馈策略学习写入失败: {e}')
    return {
        'ok': True,
        'message': '反馈已记录',
        'feedback_id': fb.id,
        'learning': learning_result,
    }


def apply_recommended_route(
    account: Account,
    action_id: int,
    dry_run_preferred: bool = True,
) -> Dict[str, Any]:
    """
    P3.20：按推荐路径处理动作，并自动沉淀反馈（若尚未有反馈）。
    """
    row = AssistantActionPlan.objects.filter(id=action_id, account_id=account.id).first()
    if not row:
        return {'ok': False, 'message': '动作不存在'}

    payload = row.action_payload or {}
    route = str(payload.get('recommended_route') or '').strip()
    route_source = str(payload.get('recommended_source') or 'unknown').strip() or 'unknown'
    if not route:
        route_info = _resolve_default_action_route(row.action_type, row.risk_level)
        payload['recommended_route'] = route_info['route']
        payload['recommended_reason'] = route_info['reason']
        payload['recommended_source'] = route_info['source']
        row.action_payload = payload
        row.save(update_fields=['action_payload'])
        route = route_info['route']
        route_source = route_info['source']
    if row.status in [AssistantActionPlan.Status.REJECTED, AssistantActionPlan.Status.CANCELLED]:
        return {'ok': False, 'message': f'当前状态不支持推荐处理: {row.status}'}

    steps: List[Dict[str, Any]] = []
    if row.status == AssistantActionPlan.Status.PENDING_CONFIRM:
        confirm_result = confirm_action(account=account, action_id=action_id)
        steps.append({'step': 'confirm', 'ok': bool(confirm_result.get('ok')), 'message': confirm_result.get('message', '')})
        if not confirm_result.get('ok'):
            return {
                'ok': False,
                'message': confirm_result.get('message', '确认失败'),
                'route': route,
                'steps': steps,
            }

    result: Dict[str, Any]
    if route == 'confirm_only':
        result = {'ok': True, 'message': '已按推荐路径完成确认', 'route': route}
        steps.append({'step': 'confirm_only', 'ok': True, 'message': result['message']})
    elif route == 'delegate_claw':
        delegate_result = delegate_action_to_kimi_claw(
            account=account,
            action_id=action_id,
            dry_run=bool(dry_run_preferred),
        )
        result = {
            'ok': bool(delegate_result.get('ok')),
            'message': delegate_result.get('message', ''),
            'route': route,
            'delegate': delegate_result.get('delegate', {}),
            'failed_step': (
                delegate_result.get('failed_step')
                or (delegate_result.get('receipt', {}) or {}).get('failed_step', '')
            ),
            'missing_scopes': (
                delegate_result.get('missing_scopes')
                or ((delegate_result.get('receipt', {}) or {}).get('required_vs_granted_scopes', {}).get('missing', []))
            ),
            'required_vs_granted_scopes': (
                delegate_result.get('required_vs_granted_scopes')
                or (delegate_result.get('receipt', {}) or {}).get('required_vs_granted_scopes', {})
            ),
            'context_coverage': (
                delegate_result.get('context_coverage')
                or (delegate_result.get('receipt', {}) or {}).get('context_coverage', {})
            ),
        }
        steps.append({'step': 'delegate_claw', 'ok': result['ok'], 'message': result['message']})
    else:
        execute_result = execute_action(account=account, action_id=action_id, override_payload={})
        result = {
            'ok': bool(execute_result.get('ok')),
            'message': execute_result.get('message', ''),
            'route': route,
            'execution_id': execute_result.get('execution_id'),
            'status': execute_result.get('status'),
            'failed_step': execute_result.get('failed_step', ''),
            'missing_scopes': execute_result.get('missing_scopes', []),
            'required_vs_granted_scopes': execute_result.get('required_vs_granted_scopes', {}),
            'context_coverage': execute_result.get('context_coverage', {}),
        }
        steps.append({'step': 'execute_direct', 'ok': result['ok'], 'message': result['message']})

    # 自动反馈：每个动作每人只自动写一次，避免污染人工反馈链路。
    has_feedback = AssistantActionFeedback.objects.filter(
        action_plan_id=row.id,
        account_id=account.id,
    ).exists()
    auto_feedback = {'written': False, 'feedback_id': None}
    if not has_feedback:
        score = 4 if route == 'confirm_only' else (5 if result.get('ok') else 2)
        note = f'auto:{route}:{"success" if result.get("ok") else "failed"}'
        fb = submit_action_feedback(
            account=account,
            action_id=row.id,
            adopted=bool(result.get('ok')),
            score=score,
            note=note,
        )
        auto_feedback = {'written': bool(fb.get('ok')), 'feedback_id': fb.get('feedback_id')}

    result['steps'] = steps
    result['auto_feedback'] = auto_feedback
    record_assistant_route_metric(source=route_source, event='applied')
    record_assistant_route_metric(source=route_source, event='success' if bool(result.get('ok')) else 'failed')
    if route in {'delegate_claw', 'execute_direct'} and not bool(result.get('ok')):
        record_assistant_route_metric(source=route_source, event='fallback')
    result['route_source'] = route_source
    return result


def get_action_learning_insights(account: Account, days: int = 90) -> Dict[str, Any]:
    """
    P2.9：动作学习洞察

    返回每类动作的反馈统计、学习增益以及近4周趋势，
    用于前端可视化和策略调优。
    """
    days = max(7, min(180, int(days or 90)))
    cutoff = timezone.now() - timedelta(days=days)

    plans = list(
        AssistantActionPlan.objects.filter(
            account_id=account.id,
            created_at__gte=cutoff,
        ).values('id', 'action_type', 'created_at')
    )
    if not plans:
        pref_value = get_assistant_preferences(account).get('value', {})
        return {
            'window_days': days,
            'total_actions': 0,
            'insights': [],
            'trend_weeks': [],
        }

    plan_map = {p['id']: p for p in plans}
    plan_ids = list(plan_map.keys())
    feedbacks = list(
        AssistantActionFeedback.objects.filter(
            action_plan_id__in=plan_ids,
            created_at__gte=cutoff,
        ).values('action_plan_id', 'adopted', 'score', 'created_at')
    )

    by_type: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {
            'suggested_count': 0,
            'feedback_count': 0,
            'adopted_count': 0,
            'scored_count': 0,
            'score_sum': 0.0,
        }
    )

    for p in plans:
        by_type[p['action_type']]['suggested_count'] += 1
    research_route_learning = _get_research_route_learning(account_id=account.id, days=days)

    for f in feedbacks:
        action_type = plan_map.get(f['action_plan_id'], {}).get('action_type')
        if not action_type:
            continue
        bucket = by_type[action_type]
        bucket['feedback_count'] += 1
        if f.get('adopted'):
            bucket['adopted_count'] += 1
        if f.get('score') is not None:
            bucket['scored_count'] += 1
            bucket['score_sum'] += float(f['score'])

    # 近4周趋势（周采纳率）
    now = timezone.now()
    week_boundaries = []
    for i in range(4, 0, -1):
        end = now - timedelta(days=(i - 1) * 7)
        start = end - timedelta(days=7)
        week_boundaries.append((start, end))

    trend_weeks = []
    for start, end in week_boundaries:
        week_feedback = [
            f for f in feedbacks if start <= f['created_at'] < end
        ]
        if not week_feedback:
            trend_weeks.append({
                'start': start.date().isoformat(),
                'end': end.date().isoformat(),
                'feedback_count': 0,
                'adoption_rate': 0.0,
            })
            continue
        adopted = sum(1 for f in week_feedback if f.get('adopted'))
        total = len(week_feedback)
        trend_weeks.append({
            'start': start.date().isoformat(),
            'end': end.date().isoformat(),
            'feedback_count': total,
            'adoption_rate': round(adopted / total, 3),
        })

    insights = []
    for action_type, stat in by_type.items():
        feedback_count = stat['feedback_count']
        adopted_count = stat['adopted_count']
        scored_count = stat['scored_count']
        adoption_rate = (adopted_count / feedback_count) if feedback_count else 0.0
        avg_score = (stat['score_sum'] / scored_count) if scored_count else None

        signal = _get_action_learning_signal(account.id, action_type)
        insights.append({
            'action_type': action_type,
            'suggested_count': stat['suggested_count'],
            'feedback_count': feedback_count,
            'adopted_count': adopted_count,
            'adoption_rate': round(adoption_rate, 3),
            'avg_score': round(avg_score, 2) if avg_score is not None else None,
            'learning_boost': signal.get('boost', 0),
            'confidence_delta': signal.get('confidence_delta', 0),
            'sample_size': signal.get('sample_size', 0),
            'route_learning': (
                (research_route_learning.get('card_type_routes', {}) or {})
                if action_type == 'research_insight_followup'
                else {}
            ),
        })

    insights.sort(key=lambda x: (x['adoption_rate'], x['feedback_count']), reverse=True)
    return {
        'window_days': days,
        'total_actions': len(plans),
        'insights': insights,
        'trend_weeks': trend_weeks,
        'research_route_learning': research_route_learning,
    }


def get_claw_iteration_metrics(account: Account, days: int = 7) -> Dict[str, Any]:
    """
    Claw 执行复盘指标（周维度）。
    """
    days = max(1, min(90, int(days or 7)))
    since = timezone.now() - timedelta(days=days)
    action_ids = list(
        AssistantActionPlan.objects.filter(account_id=account.id).values_list('id', flat=True)
    )
    if not action_ids:
        return {
            'window_days': days,
            'runtime_success_rate': 0.0,
            'runtime_total': 0,
            'scope_gap_top': [],
            'context_gap_top': [],
            'skills_success_rate': [],
        }

    exec_rows = AssistantActionExecution.objects.filter(
        action_plan_id__in=action_ids,
        started_at__gte=since,
    ).order_by('-started_at')[:2000]

    runtime_total = 0
    runtime_success = 0
    scope_gap_counter: Dict[str, int] = defaultdict(int)
    context_gap_counter: Dict[str, int] = defaultdict(int)
    skill_stats: Dict[str, Dict[str, int]] = defaultdict(lambda: {'success': 0, 'total': 0})

    for row in exec_rows:
        result = row.execution_result or {}
        channel = str(result.get('channel') or '').strip()
        if channel != 'kimi_claw':
            continue
        runtime_total += 1
        status = str(result.get('status') or '').strip().lower()
        if status == 'success':
            runtime_success += 1

        missing_scopes = ((result.get('required_vs_granted_scopes') or {}).get('missing') or [])
        for scope in missing_scopes:
            s = str(scope or '').strip()
            if s:
                scope_gap_counter[s] += 1

        missing_context = ((result.get('context_coverage') or {}).get('missing_items') or [])
        for ctx in missing_context:
            c = str(ctx or '').strip()
            if c:
                context_gap_counter[c] += 1

        skills_used = result.get('skills_used') or []
        for skill in skills_used:
            k = str(skill or '').strip()
            if not k:
                continue
            skill_stats[k]['total'] += 1
            if status == 'success':
                skill_stats[k]['success'] += 1

    def _top_items(counter: Dict[str, int], limit: int = 5) -> List[Dict[str, Any]]:
        return [
            {'name': name, 'count': count}
            for name, count in sorted(counter.items(), key=lambda x: x[1], reverse=True)[:limit]
        ]

    skills_success_rate: List[Dict[str, Any]] = []
    for skill, stat in skill_stats.items():
        total = int(stat.get('total', 0))
        success = int(stat.get('success', 0))
        rate = round((success / total), 3) if total > 0 else 0.0
        skills_success_rate.append({'skill': skill, 'success': success, 'total': total, 'rate': rate})
    skills_success_rate.sort(key=lambda x: (x.get('rate', 0), x.get('total', 0)), reverse=True)

    return {
        'window_days': days,
        'runtime_success_rate': round((runtime_success / runtime_total), 3) if runtime_total > 0 else 0.0,
        'runtime_total': runtime_total,
        'scope_gap_top': _top_items(scope_gap_counter),
        'context_gap_top': _top_items(context_gap_counter),
        'skills_success_rate': skills_success_rate[:10],
    }


def get_action_learning_summary(
    account: Account,
    days: int = 90,
    include_llm: bool = False,
    action_types: Optional[List[str]] = None,
    top_n: int = 5,
) -> Dict[str, Any]:
    """
    P2.10：学习洞察管理摘要

    输出管理视角结论：
    - 采纳率下滑动作
    - 低评分动作
    - 高潜机会动作
    - 建议动作（改进清单）
    """
    base = get_action_learning_insights(account=account, days=days)
    insights = base.get('insights', []) or []
    if action_types:
        action_set = {a.strip() for a in action_types if a and a.strip()}
        if action_set:
            insights = [i for i in insights if i.get('action_type') in action_set]

    top_n = max(1, min(20, int(top_n or 5)))
    trend_weeks = base.get('trend_weeks', []) or []

    total_feedback = sum(int(i.get('feedback_count', 0) or 0) for i in insights)
    weighted_adoption_num = sum(
        float(i.get('adoption_rate', 0.0) or 0.0) * int(i.get('feedback_count', 0) or 0)
        for i in insights
    )
    overall_adoption_rate = (
        round(weighted_adoption_num / total_feedback, 3) if total_feedback > 0 else 0.0
    )

    # 趋势：最后一周 vs 前一周
    wow_adoption_delta = 0.0
    if len(trend_weeks) >= 2:
        prev_week = float(trend_weeks[-2].get('adoption_rate', 0.0) or 0.0)
        curr_week = float(trend_weeks[-1].get('adoption_rate', 0.0) or 0.0)
        wow_adoption_delta = round(curr_week - prev_week, 3)

    # 规则识别
    declining_actions = []
    low_score_actions = []
    opportunity_actions = []
    recommendations = []

    for item in insights:
        action_type = item.get('action_type', '')
        adoption_rate = float(item.get('adoption_rate', 0.0) or 0.0)
        avg_score = item.get('avg_score')
        sample_size = int(item.get('sample_size', 0) or 0)
        learning_boost = int(item.get('learning_boost', 0) or 0)
        feedback_count = int(item.get('feedback_count', 0) or 0)

        # 下滑候选：有反馈样本且学习增益为负
        if sample_size >= 3 and learning_boost <= -5:
            declining_actions.append({
                'action_type': action_type,
                'adoption_rate': adoption_rate,
                'learning_boost': learning_boost,
                'sample_size': sample_size,
            })
            recommendations.append({
                'action_type': action_type,
                'priority': 'high',
                'advice': '优化触发条件与建议文案，减少无效提醒，必要时降低默认优先级',
            })

        # 低评分候选
        if avg_score is not None and feedback_count >= 3 and float(avg_score) < 3.0:
            low_score_actions.append({
                'action_type': action_type,
                'avg_score': float(avg_score),
                'feedback_count': feedback_count,
            })
            recommendations.append({
                'action_type': action_type,
                'priority': 'medium',
                'advice': '补充上下文证据与前置参数，提升可执行性与结果可解释性',
            })

        # 机会候选：高采纳高评分
        if feedback_count >= 3 and adoption_rate >= 0.7 and (avg_score is None or float(avg_score) >= 4.0):
            opportunity_actions.append({
                'action_type': action_type,
                'adoption_rate': adoption_rate,
                'avg_score': float(avg_score) if avg_score is not None else None,
                'feedback_count': feedback_count,
            })
            recommendations.append({
                'action_type': action_type,
                'priority': 'medium',
                'advice': '可尝试提升默认优先级，或在低风险场景下试点半自动执行',
            })

    # 去重建议（按 action_type 保留优先级更高一条）
    priority_rank = {'high': 3, 'medium': 2, 'low': 1}
    rec_map: Dict[str, Dict[str, Any]] = {}
    for r in recommendations:
        key = r['action_type']
        if key not in rec_map or priority_rank.get(r['priority'], 1) > priority_rank.get(rec_map[key]['priority'], 1):
            rec_map[key] = r
    recommendations = list(rec_map.values())

    recommendations.sort(key=lambda x: priority_rank.get(x.get('priority', 'low'), 1), reverse=True)
    declining_actions.sort(key=lambda x: x.get('learning_boost', 0))
    low_score_actions.sort(key=lambda x: x.get('avg_score', 5.0))
    opportunity_actions.sort(key=lambda x: x.get('adoption_rate', 0.0), reverse=True)

    declining_actions = declining_actions[:top_n]
    low_score_actions = low_score_actions[:top_n]
    opportunity_actions = opportunity_actions[:top_n]
    recommendations = recommendations[:top_n]

    narrative = ''
    if include_llm and insights:
        try:
            prompt = """你是子衿工作台运营分析师。请基于输入数据输出 3-5 句话管理摘要，包含：
1) 当前采纳率水平
2) 主要风险动作类型
3) 优先改进方向
4) 可放大的机会动作
只输出中文纯文本，不要 markdown。"""
            llm_input = {
                'overall_adoption_rate': overall_adoption_rate,
                'wow_adoption_delta': wow_adoption_delta,
                'declining_actions': declining_actions[:5],
                'low_score_actions': low_score_actions[:5],
                'opportunity_actions': opportunity_actions[:5],
                'recommendations': recommendations[:8],
            }
            narrative = quick_chat(
                message=prompt + "\n\n输入:\n" + json.dumps(llm_input, ensure_ascii=False),
                provider=AgentProvider.KIMI,
                model_id='moonshot-v1-32k',
                system_prompt='你是管理摘要助手，输出简洁可执行结论。',
                temperature=0.2,
                max_tokens=512,
            ).strip()
        except Exception as e:
            logger.warning(f'学习摘要 LLM 生成失败: {e}')

    if not narrative:
        trend_word = '上升' if wow_adoption_delta > 0 else ('下降' if wow_adoption_delta < 0 else '持平')
        narrative = (
            f"近{days}天建议整体采纳率为 {overall_adoption_rate:.1%}，周环比{trend_word} {abs(wow_adoption_delta):.1%}。"
            f"建议优先优化 {len(declining_actions)} 类下滑动作，并放大 {len(opportunity_actions)} 类高采纳动作。"
        )

    return {
        'window_days': days,
        'filters': {
            'action_types': action_types or [],
            'top_n': top_n,
        },
        'overall_adoption_rate': overall_adoption_rate,
        'wow_adoption_delta': wow_adoption_delta,
        'declining_actions': declining_actions,
        'low_score_actions': low_score_actions,
        'opportunity_actions': opportunity_actions,
        'recommendations': recommendations,
        'narrative': narrative,
    }


def get_action_learning_widget_data(
    account: Account,
    days: int = 30,
    action_types: Optional[List[str]] = None,
    top_n: int = 3,
) -> Dict[str, Any]:
    """
    P2.11：首页小组件数据

    返回轻量卡片化结构，供子衿首页快速渲染。
    """
    summary = get_action_learning_summary(
        account=account,
        days=days,
        include_llm=False,
        action_types=action_types,
        top_n=top_n,
    )
    overall = float(summary.get('overall_adoption_rate', 0.0) or 0.0)
    wow = float(summary.get('wow_adoption_delta', 0.0) or 0.0)

    if overall >= 0.7 and wow >= 0:
        health_level = 'green'
        health_label = '健康'
    elif overall >= 0.5:
        health_level = 'yellow'
        health_label = '关注'
    else:
        health_level = 'red'
        health_label = '告警'

    if wow > 0.05:
        trend_level = 'up'
        trend_label = '上升'
    elif wow < -0.05:
        trend_level = 'down'
        trend_label = '下降'
    else:
        trend_level = 'flat'
        trend_label = '持平'

    recommendations = summary.get('recommendations', []) or []
    recommendation_top = []
    for r in recommendations:
        action_type = r.get('action_type', '')
        recommendation_top.append({
            'action_type': action_type,
            'priority': r.get('priority', 'low'),
            'advice': r.get('advice', ''),
            # 前端可直接使用的跳转目标：统一跳转到动作箱并按类型筛选
            'cta': {
                'label': '查看并处理',
                'path': '/assistant/actions',
                'query': {
                    'action_type': action_type,
                    'status': 'pending_confirm',
                },
            },
        })

    return {
        'window_days': summary.get('window_days', days),
        'overall_adoption_rate': summary.get('overall_adoption_rate', 0.0),
        'wow_adoption_delta': summary.get('wow_adoption_delta', 0.0),
        'health': {
            'level': health_level,
            'label': health_label,
        },
        'trend': {
            'level': trend_level,
            'label': trend_label,
        },
        'cards': {
            'declining_top': summary.get('declining_actions', []),
            'opportunity_top': summary.get('opportunity_actions', []),
            'recommendation_top': recommendation_top,
        },
        'cta': {
            'label': '查看学习洞察详情',
            'path': '/dashboard',
            'query': {
                'assistant_view': 'learning_insights',
                'days': days,
            },
        },
        'narrative': summary.get('narrative', ''),
    }


def get_cached_action_learning_summary(
    account: Account,
    days: int = 90,
    include_llm: bool = False,
    action_types: Optional[List[str]] = None,
    top_n: int = 5,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    P2.13：学习摘要缓存封装（含 etag）
    """
    normalized_types = sorted([a.strip() for a in (action_types or []) if a and a.strip()])
    key = (
        f"assistant:learning:summary:{account.id}:d{days}:llm{int(include_llm)}:"
        f"top{top_n}:types{','.join(normalized_types)}"
    )
    if not force_refresh:
        cached = cache.get(key)
        if isinstance(cached, dict):
            return {**cached, '_cache_hit': True, '_cache_key': key}

    payload = get_action_learning_summary(
        account=account,
        days=days,
        include_llm=include_llm,
        action_types=normalized_types,
        top_n=top_n,
    )
    etag = _make_etag(payload)
    wrapped = {
        **payload,
        'etag': etag,
        'cache_ttl_seconds': LEARNING_SUMMARY_CACHE_TTL_SECONDS,
        '_cache_hit': False,
        '_cache_key': key,
    }
    cache.set(key, wrapped, LEARNING_SUMMARY_CACHE_TTL_SECONDS)
    return wrapped


def get_cached_action_learning_widget_data(
    account: Account,
    days: int = 30,
    action_types: Optional[List[str]] = None,
    top_n: int = 3,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    P2.13：学习小组件缓存封装（含 etag）
    """
    normalized_types = sorted([a.strip() for a in (action_types or []) if a and a.strip()])
    key = (
        f"assistant:learning:widget:{account.id}:d{days}:top{top_n}:types{','.join(normalized_types)}"
    )
    if not force_refresh:
        cached = cache.get(key)
        if isinstance(cached, dict):
            return {**cached, '_cache_hit': True, '_cache_key': key}

    payload = get_action_learning_widget_data(
        account=account,
        days=days,
        action_types=normalized_types,
        top_n=top_n,
    )
    etag = _make_etag(payload)
    wrapped = {
        **payload,
        'etag': etag,
        'cache_ttl_seconds': LEARNING_WIDGET_CACHE_TTL_SECONDS,
        '_cache_hit': False,
        '_cache_key': key,
    }
    cache.set(key, wrapped, LEARNING_WIDGET_CACHE_TTL_SECONDS)
    return wrapped


def get_assistant_effect_metrics(account: Account, days: int = 30) -> Dict[str, Any]:
    """
    P3.2：子衿策略效果指标

    指标包含：
    - 估算节省时长（分钟）
    - 建议采纳率
    - 自动化执行成功率
    - 按动作类型拆分与近 7 天趋势
    """
    days = max(7, min(180, int(days or 30)))
    cutoff = timezone.now() - timedelta(days=days)
    pref_value = get_assistant_preferences(account).get('value', {})

    plans = list(
        AssistantActionPlan.objects.filter(
            account_id=account.id,
            created_at__gte=cutoff,
        ).values('id', 'action_type', 'created_at', 'status')
    )
    if not plans:
        return {
            'window_days': days,
            'overview': {
                'time_saved_minutes': 0,
                'suggestion_count': 0,
                'feedback_count': 0,
                'adopted_count': 0,
                'suggestion_accept_rate': 0.0,
                'execution_count': 0,
                'execution_success_count': 0,
                'automation_success_rate': 0.0,
                'on_time_task_rate': 0.0,
            },
            'by_action_type': [],
            'daily': [],
            'research_route_metrics': {},
            'research_route_governance': get_assistant_route_metrics(days=days),
            'research_route_profile': {
                'auto_execute_enabled': bool(pref_value.get('route_governance_auto_execute_enabled', False)),
                'approval_mode': str(pref_value.get('route_governance_auto_execute_approval_mode', 'graded')),
                'max_risk': str(pref_value.get('route_governance_auto_execute_max_risk', 'medium')),
                'min_confidence': int(pref_value.get('route_governance_auto_execute_min_confidence', 75) or 75),
                'min_priority': int(pref_value.get('route_governance_auto_execute_min_priority', 70) or 70),
            },
        }

    plan_ids = [p['id'] for p in plans]
    plan_map = {p['id']: p for p in plans}
    feedbacks = list(
        AssistantActionFeedback.objects.filter(
            action_plan_id__in=plan_ids,
            created_at__gte=cutoff,
        ).values('action_plan_id', 'adopted', 'created_at')
    )
    executions = list(
        AssistantActionExecution.objects.filter(
            action_plan_id__in=plan_ids,
            started_at__gte=cutoff,
        ).values('action_plan_id', 'execution_result', 'started_at')
    )

    # 动作节省时长估算（分钟）
    saved_minutes_map = {
        'notification_triage': 3,
        'mail_intent_brief': 8,
        'crm_ticket_draft': 12,
        'risk_followup_plan': 15,
        'workorder_followup_comment': 6,
        'daily_digest_prepare': 10,
    }

    suggestion_count = len(plans)
    feedback_count = len(feedbacks)
    adopted_count = sum(1 for f in feedbacks if f.get('adopted'))
    suggestion_accept_rate = round(adopted_count / feedback_count, 3) if feedback_count > 0 else 0.0

    execution_count = len(executions)
    execution_success_count = sum(
        1 for ex in executions if ((ex.get('execution_result') or {}).get('status') == 'success')
    )
    automation_success_rate = (
        round(execution_success_count / execution_count, 3) if execution_count > 0 else 0.0
    )

    adopted_plan_ids = {f['action_plan_id'] for f in feedbacks if f.get('adopted')}
    time_saved_minutes = 0
    for plan_id in adopted_plan_ids:
        action_type = plan_map.get(plan_id, {}).get('action_type', '')
        time_saved_minutes += int(saved_minutes_map.get(action_type, 5))

    # 近 7 天趋势（采纳率、执行成功率）
    today = timezone.now().date()
    daily: List[Dict[str, Any]] = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        day_feedback = [f for f in feedbacks if f['created_at'].date() == day]
        day_executions = [e for e in executions if e['started_at'].date() == day]
        day_feedback_total = len(day_feedback)
        day_adopted = sum(1 for f in day_feedback if f.get('adopted'))
        day_exec_total = len(day_executions)
        day_exec_success = sum(
            1 for e in day_executions if ((e.get('execution_result') or {}).get('status') == 'success')
        )
        daily.append({
            'date': day.isoformat(),
            'feedback_count': day_feedback_total,
            'adopted_count': day_adopted,
            'suggestion_accept_rate': round(day_adopted / day_feedback_total, 3) if day_feedback_total > 0 else 0.0,
            'execution_count': day_exec_total,
            'execution_success_count': day_exec_success,
            'automation_success_rate': round(day_exec_success / day_exec_total, 3) if day_exec_total > 0 else 0.0,
        })

    by_action: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        'suggestion_count': 0,
        'feedback_count': 0,
        'adopted_count': 0,
        'execution_count': 0,
        'execution_success_count': 0,
    })
    for p in plans:
        by_action[p['action_type']]['suggestion_count'] += 1
    for f in feedbacks:
        action_type = plan_map.get(f['action_plan_id'], {}).get('action_type')
        if not action_type:
            continue
        by_action[action_type]['feedback_count'] += 1
        if f.get('adopted'):
            by_action[action_type]['adopted_count'] += 1
    for e in executions:
        action_type = plan_map.get(e['action_plan_id'], {}).get('action_type')
        if not action_type:
            continue
        by_action[action_type]['execution_count'] += 1
        if ((e.get('execution_result') or {}).get('status') == 'success'):
            by_action[action_type]['execution_success_count'] += 1

    by_action_type = []
    for action_type, stat in by_action.items():
        fb = int(stat['feedback_count'])
        ex = int(stat['execution_count'])
        adopted = int(stat['adopted_count'])
        ex_success = int(stat['execution_success_count'])
        by_action_type.append({
            'action_type': action_type,
            'suggestion_count': int(stat['suggestion_count']),
            'feedback_count': fb,
            'adopted_count': adopted,
            'suggestion_accept_rate': round(adopted / fb, 3) if fb > 0 else 0.0,
            'execution_count': ex,
            'execution_success_count': ex_success,
            'automation_success_rate': round(ex_success / ex, 3) if ex > 0 else 0.0,
            'estimated_time_saved_minutes': adopted * int(saved_minutes_map.get(action_type, 5)),
        })
    by_action_type.sort(
        key=lambda x: (x.get('estimated_time_saved_minutes', 0), x.get('suggestion_count', 0)),
        reverse=True,
    )

    # 当前版本没有明确 SLA 截止字段，先用自动化成功率代理 on_time_task_rate
    on_time_task_rate = automation_success_rate
    research_route_metrics = _get_research_route_learning(account_id=account.id, days=days)
    research_route_governance = get_assistant_route_metrics(days=days)

    return {
        'window_days': days,
        'overview': {
            'time_saved_minutes': time_saved_minutes,
            'suggestion_count': suggestion_count,
            'feedback_count': feedback_count,
            'adopted_count': adopted_count,
            'suggestion_accept_rate': suggestion_accept_rate,
            'execution_count': execution_count,
            'execution_success_count': execution_success_count,
            'automation_success_rate': automation_success_rate,
            'on_time_task_rate': on_time_task_rate,
        },
        'by_action_type': by_action_type,
        'daily': daily,
        'research_route_metrics': research_route_metrics,
        'research_route_governance': research_route_governance,
        'research_route_profile': {
            'auto_execute_enabled': bool(pref_value.get('route_governance_auto_execute_enabled', False)),
            'approval_mode': str(pref_value.get('route_governance_auto_execute_approval_mode', 'graded')),
            'max_risk': str(pref_value.get('route_governance_auto_execute_max_risk', 'medium')),
            'min_confidence': int(pref_value.get('route_governance_auto_execute_min_confidence', 75) or 75),
            'min_priority': int(pref_value.get('route_governance_auto_execute_min_priority', 70) or 70),
        },
    }
