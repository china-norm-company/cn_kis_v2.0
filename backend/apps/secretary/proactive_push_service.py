"""
Phase 6 主动洞察推送服务

支持两个推送渠道：
1. 飞书消息卡片（feishu_card）— 通过 feishu_client.send_card_message
2. 站内通知（in_app）— 写入 AssistantActionPlan 让秘书台展示

推送策略按优先级分级：
- critical / high: 飞书卡片 + 站内通知
- medium: 站内通知
- low: 仅写入列表
"""
import json
import logging
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.utils import timezone

from .models import InsightStatus, ProactiveInsight

logger = logging.getLogger(__name__)

PRIORITY_PUSH_STRATEGY = {
    'critical': ['feishu_card', 'in_app'],
    'high': ['feishu_card', 'in_app'],
    'medium': ['in_app'],
    'low': [],
}

INSIGHT_DETAIL_BASE_URL = getattr(settings, 'SITE_URL', 'https://118.196.64.48') + '/digital-workforce/#/proactive-insights'


def push_insight(insight: ProactiveInsight, channels: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    推送单条洞察。

    channels 为空时按 PRIORITY_PUSH_STRATEGY 自动选择。
    返回 {ok, pushed_channels, errors}。
    """
    if channels is None:
        channels = PRIORITY_PUSH_STRATEGY.get(insight.priority, [])

    if not channels:
        return {'ok': True, 'pushed_channels': [], 'errors': []}

    results: List[str] = []
    errors: List[str] = []

    for ch in channels:
        try:
            if ch == 'feishu_card':
                _push_feishu_card(insight)
                results.append('feishu_card')
            elif ch == 'in_app':
                _push_in_app(insight)
                results.append('in_app')
        except Exception as e:
            logger.warning('Push %s failed for insight %d: %s', ch, insight.id, e)
            errors.append(f'{ch}: {str(e)[:100]}')

    insight.pushed_at = timezone.now()
    insight.push_channel = ','.join(results) if results else ''
    insight.status = InsightStatus.PUSHED
    insight.save(update_fields=['pushed_at', 'push_channel', 'status', 'updated_at'])

    return {'ok': len(errors) == 0, 'pushed_channels': results, 'errors': errors}


def push_batch(insight_ids: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    批量推送已审核的洞察。

    insight_ids 为空时自动选择所有 approved 状态的洞察。
    """
    qs = ProactiveInsight.objects.filter(status=InsightStatus.APPROVED)
    if insight_ids:
        qs = qs.filter(id__in=insight_ids)

    pushed = 0
    failed = 0
    for insight in qs[:50]:
        result = push_insight(insight)
        if result['ok']:
            pushed += 1
        else:
            failed += 1

    return {'pushed': pushed, 'failed': failed}


def _push_feishu_card(insight: ProactiveInsight) -> None:
    """发送飞书消息卡片"""
    from libs.feishu_client import feishu_client

    if not insight.client_id:
        logger.info('Insight %d has no client, skip feishu card', insight.id)
        return

    try:
        from apps.identity.models import Account
        from apps.crm.models import Client

        manager_open_ids: List[str] = []
        client = Client.objects.filter(id=insight.client_id).first()
        if client and client.account_manager_id:
            mgr = Account.objects.filter(id=client.account_manager_id).first()
            if mgr and mgr.feishu_open_id:
                manager_open_ids.append(mgr.feishu_open_id)

        if not manager_open_ids:
            logger.info('No feishu open_id for client %d manager, skip card', insight.client_id)
            return

        card = _build_insight_card(insight)
        for open_id in manager_open_ids:
            feishu_client.send_card_message(receive_id=open_id, card=card)
            logger.info('Feishu card sent for insight %d to %s', insight.id, open_id[:20])

    except ImportError:
        logger.warning('CRM/Identity models not available, skip feishu push')
    except Exception as e:
        logger.warning('Feishu card send failed for insight %d: %s', insight.id, e)
        raise


def _build_insight_card(insight: ProactiveInsight) -> dict:
    """构建飞书消息卡片"""
    detail = insight.detail or {}
    actions_text = '\n'.join(
        f'- {a}' for a in (detail.get('recommended_actions') or [])[:3]
    ) or '暂无建议'

    detail_url = f'{INSIGHT_DETAIL_BASE_URL}/{insight.id}'

    type_labels = {
        'trend_alert': '趋势预警',
        'client_periodic': '客户洞察',
        'project_recommendation': '项目推荐',
    }
    type_label = type_labels.get(insight.insight_type, '洞察')

    priority_labels = {
        'critical': 'red',
        'high': 'orange',
        'medium': 'blue',
        'low': 'grey',
    }

    return {
        'header': {
            'title': {'tag': 'plain_text', 'content': f'{type_label}: {insight.title[:60]}'},
            'template': priority_labels.get(insight.priority, 'blue'),
        },
        'elements': [
            {
                'tag': 'div',
                'text': {'tag': 'lark_md', 'content': f'**摘要**: {insight.summary[:200]}'},
            },
            {
                'tag': 'div',
                'text': {'tag': 'lark_md', 'content': f'**关联客户**: {insight.client_name or "通用"}'},
            },
            {
                'tag': 'div',
                'text': {'tag': 'lark_md', 'content': f'**建议行动**:\n{actions_text}'},
            },
            {
                'tag': 'div',
                'text': {
                    'tag': 'lark_md',
                    'content': f'相关性 {int(insight.relevance_score * 100)}% · 紧迫度 {int(insight.urgency_score * 100)}%',
                },
            },
            {
                'tag': 'action',
                'actions': [
                    {
                        'tag': 'button',
                        'text': {'tag': 'plain_text', 'content': '查看详情'},
                        'type': 'primary',
                        'url': detail_url,
                    },
                ],
            },
        ],
    }


def _push_in_app(insight: ProactiveInsight) -> None:
    """写入站内通知（通过 AssistantActionPlan）"""
    from .models import AssistantActionPlan

    existing = AssistantActionPlan.objects.filter(
        action_type='proactive_insight_notification',
        source_event_type='proactive_insight',
        action_payload__contains={'source_insight_id': insight.id},
    ).exists()
    if existing:
        return

    AssistantActionPlan.objects.create(
        account_id=0,
        action_type='proactive_insight_notification',
        title=f'[主动洞察] {insight.title[:80]}',
        description=insight.summary[:500],
        action_payload={
            'source_insight_id': insight.id,
            'insight_type': insight.insight_type,
            'priority': insight.priority,
            'client_id': insight.client_id,
            'client_name': insight.client_name,
        },
        biz_domain='crm',
        source_event_type='proactive_insight',
        target_object_refs=[{'type': 'client', 'id': insight.client_id}] if insight.client_id else [],
        risk_level='low',
        priority_score=insight.relevance_score,
        status='suggested',
    )
