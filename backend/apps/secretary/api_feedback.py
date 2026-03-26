"""
用户反馈群飞书 Webhook 接收器

接收来自「CN KIS 用户反馈群」的飞书消息回调，
触发反馈分类和 Issue 创建流程。

飞书 Event Callback v2.0 格式：
  POST /api/v1/secretary/feishu/feedback-webhook/
  Body: {"schema": "2.0", "header": {...}, "event": {...}}

配置要求（环境变量）：
  FEISHU_FEEDBACK_GROUP_CHAT_ID  反馈群 chat_id
  FEISHU_VERIFICATION_TOKEN      飞书事件验证 token（可选，建议配置）
  GITHUB_TOKEN                   GitHub PAT（用于创建 Issue）
  GITHUB_REPO_OWNER              仓库 owner
  GITHUB_REPO_NAME               仓库名
"""
import json
import logging
import os

from ninja import Router
from django.http import JsonResponse, HttpRequest

logger = logging.getLogger(__name__)

router = Router()


@router.post('/feishu/feedback-webhook/', auth=None)
def feishu_feedback_webhook(request: HttpRequest):
    """
    飞书 Event Callback 入口。

    飞书事件推送验证（URL Verification）和消息事件处理。
    """
    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({'code': 400, 'msg': 'invalid json'}, status=400)

    # ── 1. URL 验证（飞书首次配置 Webhook 时的 challenge 请求）────────
    if body.get('type') == 'url_verification':
        logger.info('飞书 Webhook URL 验证请求')
        return JsonResponse({'challenge': body.get('challenge', '')})

    # ── 2. 验证签名（如果配置了 verification token）─────────────────
    verification_token = os.environ.get('FEISHU_VERIFICATION_TOKEN', '')
    if verification_token:
        token_in_body = body.get('header', {}).get('token', '') or body.get('token', '')
        if token_in_body != verification_token:
            logger.warning('飞书 Webhook 签名验证失败')
            return JsonResponse({'code': 403, 'msg': 'forbidden'}, status=403)

    # ── 3. 解析事件类型 ──────────────────────────────────────────────
    header = body.get('header', {})
    event_type = header.get('event_type', '') or body.get('event', {}).get('type', '')

    if event_type not in ('im.message.receive_v1', 'message'):
        # 非消息事件，静默忽略
        return JsonResponse({'code': 0})

    # ── 4. 解析消息内容 ──────────────────────────────────────────────
    event = body.get('event', {})
    message = event.get('message', {})
    sender = event.get('sender', {})

    message_id = message.get('message_id', '')
    chat_id = message.get('chat_id', '')
    msg_type = message.get('message_type', '')

    # 只处理来自反馈群的消息
    expected_chat_id = os.environ.get('FEISHU_FEEDBACK_GROUP_CHAT_ID', '')
    if expected_chat_id and chat_id != expected_chat_id:
        return JsonResponse({'code': 0})  # 不是反馈群，忽略

    # 只处理文本消息
    if msg_type not in ('text', ''):
        return JsonResponse({'code': 0})

    try:
        content = json.loads(message.get('content', '{}'))
        text = content.get('text', '').strip()
    except Exception:
        text = message.get('content', '')

    if not text or not message_id:
        return JsonResponse({'code': 0})

    # 获取发送人信息
    sender_open_id = sender.get('sender_id', {}).get('open_id', '') or sender.get('open_id', '')
    sender_name = ''
    try:
        from libs.feishu_client import FeishuClient
        client = FeishuClient()
        user_info = client.get_user_info(sender_open_id)
        sender_name = user_info.get('name', '') if user_info else ''
    except Exception:
        pass

    # ── 5. 异步处理（避免超时）──────────────────────────────────────
    try:
        from .tasks import process_user_feedback_async
        process_user_feedback_async.delay(
            message_id=message_id,
            sender_open_id=sender_open_id,
            sender_name=sender_name,
            text=text,
        )
        logger.info('反馈消息已入队处理: %s', message_id)
    except Exception as e:
        # 降级为同步处理
        logger.warning('Celery 不可用，同步处理反馈: %s', e)
        try:
            from .feedback_service import process_feedback_message
            process_feedback_message(message_id, sender_open_id, sender_name, text)
        except Exception as sync_err:
            logger.error('反馈同步处理失败: %s', sync_err)

    # 立即返回 200（飞书要求 3 秒内响应）
    return JsonResponse({'code': 0})
