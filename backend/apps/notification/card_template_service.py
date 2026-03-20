"""
消息卡片模板服务 (E2)

构建飞书消息卡片，用于项目周报、里程碑、预警等场景。
"""
import logging
from datetime import date
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def build_weekly_report_card(protocol_id: int) -> Dict[str, Any]:
    """项目周报消息卡片"""
    from apps.protocol.models import Protocol
    from apps.subject.models import Enrollment
    from apps.workorder.models import WorkOrder
    from apps.quality.models import Deviation
    from datetime import timedelta

    try:
        protocol = Protocol.objects.get(id=protocol_id, is_deleted=False)
    except Protocol.DoesNotExist:
        return {'error': '协议不存在'}

    today = date.today()
    week_ago = today - timedelta(days=7)

    enrolled = Enrollment.objects.filter(protocol=protocol, status='enrolled').count()
    sample_size = protocol.sample_size or 0
    rate = round(enrolled / sample_size * 100, 1) if sample_size > 0 else 0

    wo_qs = WorkOrder.objects.filter(enrollment__protocol=protocol, is_deleted=False)
    wo_completed_week = wo_qs.filter(
        status__in=['completed', 'approved'],
        completed_at__date__gte=week_ago,
    ).count()
    wo_total = wo_qs.count()
    wo_done = wo_qs.filter(status__in=['completed', 'approved']).count()

    dev_open = Deviation.objects.filter(
        project_id=protocol_id,
    ).exclude(status='closed').count()

    return {
        'msg_type': 'interactive',
        'card': {
            'header': {
                'title': {'tag': 'plain_text', 'content': f'📋 项目周报 | {protocol.title}'},
                'template': 'blue',
            },
            'elements': [
                {
                    'tag': 'div',
                    'text': {'tag': 'lark_md', 'content': f'**项目编号**: {protocol.code or "N/A"}'},
                },
                {
                    'tag': 'div',
                    'fields': [
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**入组进度**\n{enrolled}/{sample_size} ({rate}%)'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**本周完成工单**\n{wo_completed_week}'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**工单完成率**\n{wo_done}/{wo_total}'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**未关闭偏差**\n{dev_open}'}},
                    ],
                },
                {
                    'tag': 'hr',
                },
                {
                    'tag': 'div',
                    'text': {'tag': 'lark_md', 'content': f'📅 报告周期: {week_ago.isoformat()} ~ {today.isoformat()}'},
                },
            ],
        },
    }


def build_milestone_card(milestone) -> Dict[str, Any]:
    """里程碑达成消息卡片"""
    return {
        'msg_type': 'interactive',
        'card': {
            'header': {
                'title': {'tag': 'plain_text', 'content': f'🎯 里程碑达成 | {milestone.name}'},
                'template': 'green',
            },
            'elements': [
                {
                    'tag': 'div',
                    'fields': [
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**计划日期**\n{milestone.target_date}'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**实际日期**\n{milestone.actual_date or "待确认"}'}},
                    ],
                },
            ],
        },
    }


def build_alert_card(alert: Dict) -> Dict[str, Any]:
    """预警消息卡片"""
    severity_config = {
        'high': {'template': 'red', 'icon': '🚨'},
        'medium': {'template': 'orange', 'icon': '⚠️'},
        'low': {'template': 'blue', 'icon': 'ℹ️'},
    }
    config = severity_config.get(alert.get('severity', 'low'), severity_config['low'])

    return {
        'msg_type': 'interactive',
        'card': {
            'header': {
                'title': {'tag': 'plain_text', 'content': f'{config["icon"]} {alert.get("title", "预警")}'},
                'template': config['template'],
            },
            'elements': [
                {
                    'tag': 'div',
                    'text': {'tag': 'lark_md', 'content': alert.get('detail', '')},
                },
                {
                    'tag': 'div',
                    'text': {'tag': 'lark_md', 'content': f'类型: {alert.get("type", "")}'},
                },
            ],
        },
    }


def publish_status_report(protocol_id: int) -> Dict[str, Any]:
    """一键发布项目状态通报到飞书群"""
    from apps.protocol.models import Protocol

    try:
        protocol = Protocol.objects.get(id=protocol_id, is_deleted=False)
    except Protocol.DoesNotExist:
        return {'success': False, 'message': '协议不存在'}

    if not protocol.feishu_chat_id:
        return {'success': False, 'message': '项目未关联飞书群'}

    card = build_weekly_report_card(protocol_id)

    try:
        from libs.feishu_client import feishu_client
        feishu_client.send_card_message(
            receive_id=protocol.feishu_chat_id,
            card=card['card'],
            receive_id_type='chat_id',
        )
        return {'success': True, 'message': '已推送到飞书群'}
    except Exception as e:
        logger.warning(f'飞书群推送失败: {e}')
        return {'success': False, 'message': str(e)}
