"""
财务通知 API — 开票完成、收款完成、催款 发送飞书消息给客户经理

架构原则：业务判断在各工作台（如管仲），消息发送执行由具备完整权限的机器人完成。
- 业务触发：管仲工作台（开票完成等）
- 执行发送：智能开发助手（FEISHU_APP_ID_DEV_ASSISTANT），具备 im:message、contact 权限
- 不依赖管仲工作台的消息权限，避免给所有工作台开放最大权限
"""

import json
import logging
from ninja import Router
from pydantic import BaseModel
from typing import Optional

from django.conf import settings
from libs.feishu_client import feishu_client, FeishuAPIError

logger = logging.getLogger(__name__)

router = Router()


class InvoiceCreatedIn(BaseModel):
    invoice_id: int
    recipient: str
    channels: list = ["feishu", "system"]
    content: str
    electronic_invoice_file: Optional[str] = None
    electronic_invoice_file_name: Optional[str] = None


class PaymentReceivedIn(BaseModel):
    payment_id: Optional[int] = None
    invoice_id: Optional[int] = None
    recipient: str
    channels: list = ["feishu", "system"]
    content: str


class OverdueReminderIn(BaseModel):
    reminder_id: int
    invoice_id: Optional[int] = None
    recipient: str
    channels: list = ["feishu", "system"]
    content: str


def _get_notification_bot_credentials():
    """获取具备消息发送权限的机器人凭证（智能开发助手），用于执行飞书消息发送"""
    app_id = getattr(settings, "FEISHU_APP_ID_DEV_ASSISTANT", "") or ""
    app_secret = getattr(settings, "FEISHU_APP_SECRET_DEV_ASSISTANT", "") or ""
    if not app_id or not app_secret:
        app_id = getattr(settings, "FEISHU_APP_ID", "") or ""
        app_secret = getattr(settings, "FEISHU_APP_SECRET", "") or ""
    return app_id, app_secret


def _resolve_recipient_to_open_id(recipient: str, app_id: str = None, app_secret: str = None) -> Optional[str]:
    """尝试将接收人（姓名）解析为 open_id"""
    if not recipient:
        return None
    # 1. 若已是 open_id 格式
    if recipient.startswith("ou_"):
        return recipient
    # 2. 从 identity Account 查找（display_name / username 匹配，且已绑定飞书）
    try:
        from apps.identity.models import Account

        acc = (
            Account.objects.filter(display_name=recipient).first()
            or Account.objects.filter(display_name__icontains=recipient).first()
            or Account.objects.filter(username__icontains=recipient).first()
        )
        if acc and acc.feishu_open_id:
            return acc.feishu_open_id
    except Exception as e:
        logger.warning(f"[财务通知] Account 查找失败: {e}")

    # 3. 从飞书通讯录按姓名查找（需 app 有通讯录权限）
    if app_id and app_secret:
        try:
            # 3a. 先尝试根部门+子部门一次性获取（fetch_child=True）
            users_data = feishu_client.list_users(
                department_id="0", page_size=100, fetch_child=True,
                app_id=app_id, app_secret=app_secret,
            )
            for u in users_data.get("items", []):
                name = (u.get("name") or u.get("en_name") or "").strip()
                if name == recipient or recipient in name:
                    oid = u.get("open_id") or u.get("user_id")
                    if oid:
                        logger.info(f"[财务通知] 通讯录匹配: {recipient} -> {oid[:20]}...")
                        return oid
            # 3b. 若根部门无结果，递归遍历子部门
            seen = set()
            dept_queue = ["0"]
            max_depts = 80
            while dept_queue and len(seen) < max_depts:
                parent_id = dept_queue.pop(0)
                if parent_id in seen:
                    continue
                seen.add(parent_id)
                depts = feishu_client.list_departments(
                    parent_department_id=parent_id, page_size=50,
                    app_id=app_id, app_secret=app_secret,
                )
                for item in depts.get("items", []):
                    dept_id = item.get("department_id")
                    if dept_id and dept_id not in seen:
                        dept_queue.append(dept_id)
                users_data = feishu_client.list_users(
                    department_id=parent_id, page_size=100, fetch_child=False,
                    app_id=app_id, app_secret=app_secret,
                )
                for u in users_data.get("items", []):
                    name = (u.get("name") or u.get("en_name") or "").strip()
                    if name == recipient or recipient in name:
                        oid = u.get("open_id") or u.get("user_id")
                        if oid:
                            logger.info(f"[财务通知] 通讯录匹配: {recipient} -> {oid[:20]}...")
                            return oid
        except Exception as e:
            logger.warning(f"[财务通知] 飞书通讯录查找失败: {e}")
    return None


def _send_feishu_text(recipient: str, content: str) -> tuple[bool, str]:
    """返回 (是否成功, 错误码)。使用智能开发助手凭证发送，不依赖管仲工作台权限"""
    app_id, app_secret = _get_notification_bot_credentials()
    if not app_id or not app_secret:
        logger.warning("[财务通知] 未配置智能开发助手凭证 FEISHU_APP_ID_DEV_ASSISTANT / FEISHU_APP_SECRET_DEV_ASSISTANT")
        return False, "feishu_not_configured"
    open_id = _resolve_recipient_to_open_id(recipient, app_id, app_secret)
    if not open_id:
        logger.warning(f"[财务通知] 无法解析接收人 open_id: recipient={recipient}")
        return False, "recipient_not_found"
    try:
        feishu_client.send_message(
            receive_id=open_id,
            msg_type="text",
            content=json.dumps({"text": content}),
            receive_id_type="open_id",
            app_id=app_id,
            app_secret=app_secret,
        )
        logger.info(f"[财务通知] 飞书消息已发送: recipient={recipient}, open_id={open_id[:20]}...")
        return True, ""
    except FeishuAPIError as e:
        logger.error(f"[财务通知] 飞书发送失败: {e}")
        return False, "feishu_api_error"


@router.post("/invoice-created", auth=None)
def notify_invoice_created(request, data: InvoiceCreatedIn):
    """开票完成通知"""
    ok, error_code = _send_feishu_text(data.recipient, data.content)
    payload = {"code": 0, "msg": "ok" if ok else "send_failed", "data": {"sent": ok}}
    if not ok and error_code:
        payload["data"]["error_code"] = error_code
    return payload


@router.post("/payment-received", auth=None)
def notify_payment_received(request, data: PaymentReceivedIn):
    """收款完成通知"""
    ok, error_code = _send_feishu_text(data.recipient, data.content)
    payload = {"code": 0, "msg": "ok" if ok else "send_failed", "data": {"sent": ok}}
    if not ok and error_code:
        payload["data"]["error_code"] = error_code
    return payload


@router.post("/overdue-reminder", auth=None)
def notify_overdue_reminder(request, data: OverdueReminderIn):
    """催款通知"""
    ok, error_code = _send_feishu_text(data.recipient, data.content)
    payload = {"code": 0, "msg": "ok" if ok else "send_failed", "data": {"sent": ok}}
    if not ok and error_code:
        payload["data"]["error_code"] = error_code
    return payload
