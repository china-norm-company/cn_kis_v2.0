"""
结构化通知服务

S4-8：统一管理多渠道通知，记录通知历史
"""
import logging
from typing import Optional
from django.utils import timezone
from django.db.models import Q

from .models import (
    NotificationRecord, NotificationPreference,
    NotificationChannel, NotificationPriority, NotificationStatus,
)

logger = logging.getLogger(__name__)


def send_notification(
    recipient_id: int,
    title: str,
    content: str = '',
    channel: str = NotificationChannel.FEISHU_CARD,
    priority: str = NotificationPriority.NORMAL,
    source_type: str = '',
    source_id: int = None,
    recipient_open_id: str = '',
) -> NotificationRecord:
    """
    发送通知（统一入口）

    1. 检查用户通知偏好
    2. 创建通知记录
    3. 实际发送
    4. 更新状态
    """
    # 检查偏好
    pref = NotificationPreference.objects.filter(
        user_id=recipient_id,
        notification_type=source_type,
    ).first()
    if pref and not pref.enabled:
        logger.info(f'用户#{recipient_id} 已关闭 {source_type} 通知')
        return NotificationRecord.objects.create(
            title=title, content=content, channel=channel,
            priority=priority, recipient_id=recipient_id,
            source_type=source_type, source_id=source_id,
            status=NotificationStatus.FAILED,
            error_message='用户已关闭此类通知',
        )
    if pref:
        channel = pref.preferred_channel

    record = NotificationRecord.objects.create(
        title=title, content=content, channel=channel,
        priority=priority, recipient_id=recipient_id,
        recipient_open_id=recipient_open_id,
        source_type=source_type, source_id=source_id,
        status=NotificationStatus.PENDING,
    )

    # 实际发送
    try:
        msg_id = _dispatch(record)
        record.status = NotificationStatus.SENT
        record.sent_at = timezone.now()
        if msg_id:
            record.feishu_message_id = msg_id
        record.save(update_fields=['status', 'sent_at', 'feishu_message_id', 'update_time'])
    except Exception as e:
        record.status = NotificationStatus.FAILED
        record.error_message = str(e)
        record.save(update_fields=['status', 'error_message', 'update_time'])
        logger.error(f'通知#{record.id} 发送失败: {e}')

    return record


def _dispatch(record: NotificationRecord) -> Optional[str]:
    """根据渠道分发通知"""
    import json

    # 微信订阅消息走独立通道，不需要飞书 open_id
    if record.channel == NotificationChannel.WECHAT_SUBSCRIBE:
        return _dispatch_wechat(record)

    # 短信走独立通道
    if record.channel == NotificationChannel.SMS:
        return _dispatch_sms(record)

    from libs.feishu_client import feishu_client

    open_id = record.recipient_open_id
    if not open_id:
        try:
            from apps.hr.models import Staff
            staff = Staff.objects.filter(
                Q(account_fk_id=record.recipient_id) | Q(account_id=record.recipient_id)
            ).first()
            if staff:
                open_id = staff.feishu_open_id
        except Exception:
            pass

    if not open_id:
        raise ValueError('无法获取接收人飞书 Open ID')

    if record.channel == NotificationChannel.FEISHU_MESSAGE:
        result = feishu_client.send_message(
            receive_id=open_id, msg_type='text',
            content=json.dumps({'text': f'{record.title}\n{record.content}'}),
            receive_id_type='open_id',
        )
        return result.get('data', {}).get('message_id', '') if result else ''

    elif record.channel == NotificationChannel.FEISHU_CARD:
        card = {
            'config': {'wide_screen_mode': True},
            'header': {'title': {'content': record.title, 'tag': 'plain_text'}},
            'elements': [{'tag': 'div', 'text': {
                'content': record.content, 'tag': 'lark_md',
            }}],
        }
        result = feishu_client.send_message(
            receive_id=open_id, msg_type='interactive',
            content=json.dumps(card), receive_id_type='open_id',
        )
        return result.get('data', {}).get('message_id', '') if result else ''

    elif record.channel == NotificationChannel.FEISHU_URGENT:
        result = feishu_client.send_message(
            receive_id=open_id, msg_type='text',
            content=json.dumps({'text': f'🚨 {record.title}\n{record.content}'}),
            receive_id_type='open_id',
        )
        msg_id = result.get('data', {}).get('message_id', '') if result else ''
        if msg_id:
            try:
                # urgent_app 需要 user_id_list 和 user_id_type
                feishu_client._request(
                    'PATCH', f'im/v1/messages/{msg_id}/urgent_app',
                    json={'user_id_list': [open_id], 'user_id_type': 'open_id'},
                )
            except Exception:
                pass
        return msg_id

    elif record.channel == NotificationChannel.FEISHU_GROUP:
        # 发送到飞书群
        import os
        chat_id = os.getenv('FEISHU_NOTIFICATION_CHAT_ID', '')
        if not chat_id:
            raise ValueError('FEISHU_NOTIFICATION_CHAT_ID 未配置')
        result = feishu_client.send_message(
            receive_id=chat_id, msg_type='text',
            content=json.dumps({'text': f'{record.title}\n{record.content}'}),
            receive_id_type='chat_id',
        )
        return result.get('data', {}).get('message_id', '') if result else ''

    elif record.channel == NotificationChannel.SYSTEM:
        logger.info(f'系统内通知#{record.id}: {record.title}')
        return None

    return None


def _dispatch_wechat(record: NotificationRecord) -> Optional[str]:
    """分发微信订阅消息"""
    wechat_openid = ''
    try:
        from apps.identity.models import Account
        account = Account.objects.filter(id=record.recipient_id).first()
        if account:
            wechat_openid = getattr(account, 'wechat_openid', '') or ''
    except Exception:
        pass

    if not wechat_openid:
        raise ValueError('无法获取接收人微信 openid')

    from libs.wechat_notification import send_subscribe_message
    import json

    template_data = {}
    try:
        template_data = json.loads(record.content) if record.content else {}
    except (json.JSONDecodeError, TypeError):
        template_data = {'thing1': {'value': record.content[:20] if record.content else ''}}

    template_id = template_data.pop('_template_id', '')
    page = template_data.pop('_page', '')

    success = send_subscribe_message(
        openid=wechat_openid,
        template_id=template_id,
        data=template_data,
        page=page,
    )
    return 'wechat_sent' if success else None


def _dispatch_sms(record: NotificationRecord) -> Optional[str]:
    """分发短信通知"""
    try:
        from libs.sms_notification import send_sms
        phone = ''
        try:
            from apps.subject.models import Subject
            subject = Subject.objects.filter(account_id=record.recipient_id).first()
            if subject:
                phone = subject.phone
        except Exception:
            pass

        if not phone:
            raise ValueError('无法获取接收人手机号')

        success = send_sms(phone, record.title, record.content)
        return 'sms_sent' if success else None
    except ImportError:
        logger.warning('短信服务模块未安装，跳过短信发送')
        return None


def list_notifications(
    recipient_id: int, page: int = 1, page_size: int = 20,
) -> dict:
    qs = NotificationRecord.objects.filter(recipient_id=recipient_id)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}
