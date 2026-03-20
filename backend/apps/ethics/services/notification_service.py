"""
伦理通知服务

基于 feishu_client 统一客户端实现：
- SAE 事件通知（紧急卡片）
- 批件到期预警（分级卡片 30/15/7 天）
- 审查意见到达通知
- 整改催办消息
- 项目群消息推送
- 伦理状态变更通知
- 法规更新通知
- 培训通知
"""
import json
import logging
from datetime import date
from typing import Optional

from django.utils import timezone

logger = logging.getLogger(__name__)


def _get_feishu_client():
    from libs.feishu_client import feishu_client
    return feishu_client


def _get_open_id_for_account(account_id: int) -> str:
    try:
        from apps.identity.models import Account
        account = Account.objects.filter(id=account_id).first()
        if account:
            return getattr(account, 'feishu_open_id', None) or ''
    except Exception:
        pass
    return ''


# ============================================================================
# 卡片构建辅助
# ============================================================================

def _build_card(title: str, color: str, fields: list, actions: list = None) -> dict:
    """构建飞书消息卡片"""
    elements = [
        {
            'tag': 'div',
            'fields': [
                {'is_short': f.get('short', True), 'text': {'tag': 'lark_md', 'content': f'**{f["label"]}**\n{f["value"]}'}}
                for f in fields
            ],
        },
    ]
    if actions:
        elements.append({
            'tag': 'action',
            'actions': [
                {
                    'tag': 'button',
                    'text': {'tag': 'plain_text', 'content': a['text']},
                    'type': a.get('type', 'primary'),
                    'url': a['url'],
                }
                for a in actions
            ],
        })
    return {
        'config': {'wide_screen_mode': True},
        'header': {
            'title': {'tag': 'plain_text', 'content': title},
            'template': color,
        },
        'elements': elements,
    }


def _send_card_to_user(open_id: str, card: dict) -> Optional[str]:
    """发送卡片消息给用户"""
    if not open_id:
        return None
    try:
        client = _get_feishu_client()
        data = client.send_card_message(receive_id=open_id, card=card)
        return data.get('message_id', '')
    except Exception as e:
        logger.error(f'卡片消息发送失败 (open_id={open_id}): {e}')
        return None


def _send_card_to_chat(chat_id: str, card: dict) -> Optional[str]:
    """发送卡片消息到群聊"""
    if not chat_id:
        return None
    try:
        client = _get_feishu_client()
        data = client.send_card_message(
            receive_id=chat_id, card=card, receive_id_type='chat_id',
        )
        return data.get('message_id', '')
    except Exception as e:
        logger.error(f'群聊卡片消息发送失败 (chat_id={chat_id}): {e}')
        return None


# ============================================================================
# SAE 通知
# ============================================================================

def notify_ethics_sae(protocol_id: int, ae_id: int, severity: str):
    """SAE 创建后通知伦理台（紧急卡片 → 项目群 + 伦理专员）"""
    try:
        logger.info(
            f'[伦理通知] 收到 SAE 通知：protocol_id={protocol_id}, ae_id={ae_id}, severity={severity}'
        )

        card = _build_card(
            title='🚨 严重不良事件(SAE)通知',
            color='red',
            fields=[
                {'label': '事件ID', 'value': str(ae_id)},
                {'label': '严重程度', 'value': severity},
                {'label': '要求', 'value': '请伦理专员立即评估是否需上报伦理委员会'},
            ],
            actions=[
                {'text': '查看详情', 'url': '/ethics/supervisions', 'type': 'danger'},
            ],
        )

        _notify_project_group(protocol_id, card=card)
    except Exception as e:
        logger.error(f'SAE通知发送失败: {e}')


# ============================================================================
# 批件到期预警
# ============================================================================

def check_expiring_approvals(days: int = 30) -> list:
    """检查即将到期的批件"""
    from apps.ethics.models import ApprovalDocument
    deadline = timezone.now().date()
    deadline_future = deadline + timezone.timedelta(days=days)

    expiring = ApprovalDocument.objects.filter(
        is_active=True,
        expiry_date__isnull=False,
        expiry_date__lte=deadline_future,
        expiry_date__gte=deadline,
    ).select_related('application', 'application__protocol')

    results = []
    for doc in expiring:
        remaining = (doc.expiry_date - deadline).days
        results.append({
            'document_number': doc.document_number,
            'expiry_date': str(doc.expiry_date),
            'days_remaining': remaining,
            'protocol_title': str(doc.application.protocol),
            'application_number': doc.application.application_number,
            'created_by_id': doc.application.created_by_id,
        })

    return results


def send_expiry_warnings():
    """发送批件到期预警（定时任务调用）"""
    for threshold in [30, 15, 7]:
        items = check_expiring_approvals(threshold)
        for item in items:
            if item['days_remaining'] <= threshold:
                days_left = item['days_remaining']
                urgency = '紧急' if days_left <= 7 else ('注意' if days_left <= 15 else '提醒')
                color = 'red' if days_left <= 7 else ('orange' if days_left <= 15 else 'blue')

                card = _build_card(
                    title=f'[{urgency}] 伦理批件到期预警',
                    color=color,
                    fields=[
                        {'label': '批件号', 'value': item['document_number']},
                        {'label': '项目', 'value': item['protocol_title']},
                        {'label': '到期日', 'value': item['expiry_date']},
                        {'label': '剩余天数', 'value': f'{days_left} 天'},
                    ],
                    actions=[
                        {'text': '查看批件', 'url': '/ethics/approvals'},
                    ],
                )

                logger.warning(
                    f'[批件到期预警] {item["document_number"]} 将在 {days_left} 天后到期，'
                    f'项目：{item["protocol_title"]}'
                )

                if item.get('created_by_id'):
                    open_id = _get_open_id_for_account(item['created_by_id'])
                    _send_card_to_user(open_id, card)


# ============================================================================
# 项目群消息推送
# ============================================================================

def _notify_project_group(protocol_id: int, message: str = '', card: dict = None):
    """通过项目群 ID 推送消息（优先发卡片，无卡片则发文本）"""
    try:
        from apps.protocol.models import Protocol
        protocol = Protocol.objects.get(id=protocol_id)
        chat_id = getattr(protocol, 'feishu_chat_id', '')
        if not chat_id:
            logger.debug(f'项目 {protocol_id} 无飞书群聊ID，跳过推送')
            return

        if card:
            _send_card_to_chat(chat_id, card)
        elif message:
            try:
                client = _get_feishu_client()
                client.send_text_to_chat(chat_id, message)
            except Exception as e:
                logger.error(f'项目群文本消息发送失败: {e}')
    except Exception as e:
        logger.error(f'推送项目群消息失败: {e}')


# ============================================================================
# 伦理状态变更通知
# ============================================================================

def notify_ethics_status_change(application_id: int, new_status: str, message: str = ''):
    """伦理状态变更时推送项目群（卡片消息）"""
    try:
        from apps.ethics.models import EthicsApplication
        app = EthicsApplication.objects.select_related('protocol').get(id=application_id)
        status_display = app.get_status_display()

        status_color_map = {
            'approved': 'green',
            'rejected': 'red',
            'submitted': 'blue',
            'reviewing': 'orange',
            'withdrawn': 'grey',
        }
        color = status_color_map.get(new_status, 'blue')

        card = _build_card(
            title='伦理审查状态更新',
            color=color,
            fields=[
                {'label': '申请编号', 'value': app.application_number},
                {'label': '新状态', 'value': status_display},
                {'label': '项目', 'value': str(app.protocol)},
            ] + ([{'label': '说明', 'value': message, 'short': False}] if message else []),
            actions=[
                {'text': '查看申请', 'url': f'/ethics/applications/{application_id}'},
            ],
        )

        _notify_project_group(app.protocol_id, card=card)
    except Exception as e:
        logger.error(f'伦理状态变更通知失败: {e}')


# ============================================================================
# 审查意见到达通知
# ============================================================================

def notify_review_opinion_received(opinion_id: int):
    """收到伦理委员会审查意见时通知"""
    try:
        from apps.ethics.models_review import EthicsReviewOpinion
        opinion = EthicsReviewOpinion.objects.select_related(
            'application', 'application__protocol'
        ).get(id=opinion_id)

        opinion_type_display = opinion.get_opinion_type_display()
        color = 'green' if opinion.opinion_type == 'approve' else (
            'red' if opinion.opinion_type in ('reject', 'terminate', 'suspend') else 'orange'
        )

        fields = [
            {'label': '意见编号', 'value': opinion.opinion_no},
            {'label': '意见类型', 'value': opinion_type_display},
            {'label': '申请编号', 'value': opinion.application.application_number},
        ]
        if opinion.response_required and opinion.response_deadline:
            fields.append({'label': '回复截止', 'value': str(opinion.response_deadline)})

        card = _build_card(
            title='伦理审查意见到达',
            color=color,
            fields=fields,
            actions=[
                {'text': '查看意见', 'url': f'/ethics/review-opinions/{opinion_id}'},
            ],
        )

        _notify_project_group(opinion.application.protocol_id, card=card)

        if opinion.application.created_by_id:
            open_id = _get_open_id_for_account(opinion.application.created_by_id)
            _send_card_to_user(open_id, card)

    except Exception as e:
        logger.error(f'审查意见通知失败: {e}')


# ============================================================================
# 超期催办
# ============================================================================

def check_overdue_responses():
    """检查超期未回复的审查意见 → 发送飞书催办消息"""
    from apps.ethics.models_review import EthicsReviewOpinion
    today = timezone.now().date()
    overdue = EthicsReviewOpinion.objects.filter(
        response_required=True,
        response_received=False,
        response_deadline__lt=today,
    ).select_related('application', 'application__protocol')

    for opinion in overdue:
        overdue_days = (today - opinion.response_deadline).days
        logger.warning(
            f'[回复超期] 审查意见 {opinion.opinion_no} 已超期 {overdue_days} 天'
        )

        card = _build_card(
            title='🔴 审查意见回复超期催办',
            color='red',
            fields=[
                {'label': '意见编号', 'value': opinion.opinion_no},
                {'label': '申请编号', 'value': opinion.application.application_number},
                {'label': '回复截止', 'value': str(opinion.response_deadline)},
                {'label': '超期天数', 'value': f'{overdue_days} 天'},
            ],
            actions=[
                {'text': '立即处理', 'url': f'/ethics/review-opinions/{opinion.id}', 'type': 'danger'},
            ],
        )

        if opinion.application.created_by_id:
            open_id = _get_open_id_for_account(opinion.application.created_by_id)
            _send_card_to_user(open_id, card)


def check_overdue_corrective_actions():
    """检查超期未完成的整改项 → 发送飞书催办消息"""
    from apps.ethics.models_supervision import EthicsSupervision
    today = timezone.now().date()
    overdue = EthicsSupervision.objects.filter(
        corrective_completed=False,
        corrective_deadline__lt=today,
        corrective_deadline__isnull=False,
    ).select_related('protocol')

    for sup in overdue:
        overdue_days = (today - sup.corrective_deadline).days
        logger.warning(
            f'[整改超期] 监督 {sup.supervision_no} 已超期 {overdue_days} 天'
        )

        card = _build_card(
            title='🔴 伦理整改超期催办',
            color='red',
            fields=[
                {'label': '监督编号', 'value': sup.supervision_no},
                {'label': '项目', 'value': str(sup.protocol)},
                {'label': '整改截止', 'value': str(sup.corrective_deadline)},
                {'label': '超期天数', 'value': f'{overdue_days} 天'},
            ],
            actions=[
                {'text': '查看详情', 'url': '/ethics/supervisions', 'type': 'danger'},
            ],
        )

        if sup.created_by_id:
            open_id = _get_open_id_for_account(sup.created_by_id)
            _send_card_to_user(open_id, card)


# ============================================================================
# 法规更新通知
# ============================================================================

def notify_regulation_update(regulation_id: int):
    """新法规录入/状态变更时通知相关人员"""
    try:
        from apps.ethics.models_regulation import Regulation
        reg = Regulation.objects.get(id=regulation_id)

        impact_color = {'high': 'red', 'medium': 'orange', 'low': 'blue'}
        color = impact_color.get(reg.impact_level, 'blue')

        card = _build_card(
            title='📋 法规更新通知',
            color=color,
            fields=[
                {'label': '法规名称', 'value': reg.title, 'short': False},
                {'label': '类型', 'value': reg.get_regulation_type_display()},
                {'label': '影响级别', 'value': reg.get_impact_level_display()},
                {'label': '生效日期', 'value': str(reg.effective_date) if reg.effective_date else '待定'},
            ],
            actions=[
                {'text': '查看详情', 'url': f'/ethics/regulations'},
            ],
        )

        if reg.created_by_id:
            open_id = _get_open_id_for_account(reg.created_by_id)
            _send_card_to_user(open_id, card)

    except Exception as e:
        logger.error(f'法规更新通知失败: {e}')


# ============================================================================
# 培训通知
# ============================================================================

def notify_training_published(training_id: int):
    """培训计划发布时通知参与者"""
    try:
        from apps.ethics.models_training import ComplianceTraining
        training = ComplianceTraining.objects.get(id=training_id)

        card = _build_card(
            title='📚 合规培训通知',
            color='blue',
            fields=[
                {'label': '培训主题', 'value': training.title, 'short': False},
                {'label': '类型', 'value': training.get_training_type_display()},
                {'label': '日期', 'value': str(training.training_date) if training.training_date else '待定'},
                {'label': '地点', 'value': training.location or '待定'},
                {'label': '讲师', 'value': training.trainer or '待定'},
                {'label': '时长', 'value': f'{training.duration_hours} 小时'},
            ],
            actions=[
                {'text': '查看详情', 'url': '/ethics/trainings'},
            ],
        )

        for participant in training.participants.all():
            if participant.staff_id:
                open_id = _get_open_id_for_account(participant.staff_id)
                _send_card_to_user(open_id, card)

    except Exception as e:
        logger.error(f'培训通知发送失败: {e}')


# ============================================================================
# 监督计划通知
# ============================================================================

def notify_supervision_planned(supervision_id: int):
    """监督计划创建时通知项目群"""
    try:
        from apps.ethics.models_supervision import EthicsSupervision
        sup = EthicsSupervision.objects.select_related('protocol').get(id=supervision_id)

        card = _build_card(
            title='🔍 伦理监督计划通知',
            color='blue',
            fields=[
                {'label': '监督编号', 'value': sup.supervision_no},
                {'label': '类型', 'value': sup.get_supervision_type_display()},
                {'label': '项目', 'value': str(sup.protocol)},
                {'label': '计划日期', 'value': str(sup.planned_date) if sup.planned_date else '待定'},
            ],
        )

        _notify_project_group(sup.protocol_id, card=card)

    except Exception as e:
        logger.error(f'监督计划通知失败: {e}')
