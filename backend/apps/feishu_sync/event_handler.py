"""
飞书事件订阅处理器

S4-7：处理来自飞书的事件回调
- 任务完成：同步工单状态
- 日历变更：更新排程
- 通讯录变动：同步人员
- 审批状态变更：更新审批流程
- 增量采集：新邮件/新文件/新消息 → 自动入 PersonalContext
"""
import logging

logger = logging.getLogger(__name__)


def handle_event(event_type: str, event_data: dict) -> dict:
    """统一事件处理入口"""
    handlers = {
        'task.task.updated_v1': _handle_task_updated,
        'task.task.comment.updated_v1': _handle_task_comment,
        'calendar.calendar.event.changed_v1': _handle_calendar_changed,
        'contact.user.updated_v1': _handle_contact_user_updated,
        'contact.department.updated_v1': _handle_contact_dept_updated,
        'approval.approval.updated': _handle_approval_updated,
        # 知识采集相关事件
        'meeting.meeting.ended_v1': _handle_meeting_ended,
        'docx.document.updated_v1': _handle_doc_updated,
        'wiki.doc.updated_v1': _handle_doc_updated,
        # 增量采集新事件
        'im.message.receive_v1': _handle_im_message_received,
        'mail.user.message.created_v1': _handle_mail_message_created,
        'drive.file.created_v1': _handle_drive_file_created,
        'drive.file.edited_v1': _handle_drive_file_created,
    }

    handler = handlers.get(event_type)
    if handler:
        try:
            return handler(event_data)
        except Exception as e:
            logger.error(f'处理事件 {event_type} 失败: {e}')
            return {'code': 500, 'msg': str(e)}
    else:
        logger.info(f'未注册的事件类型: {event_type}')
        return {'code': 200, 'msg': 'ignored'}


def _handle_task_updated(data: dict) -> dict:
    """飞书任务完成 → 同步工单状态 + 入知识库"""
    task_id = data.get('task_id', '')
    if not task_id:
        return {'code': 200, 'msg': 'no task_id'}

    from apps.workorder.models import WorkOrder, WorkOrderStatus
    wo = WorkOrder.objects.filter(feishu_task_id=task_id, is_deleted=False).first()
    if not wo:
        return {'code': 200, 'msg': 'work order not found'}

    # 检查任务是否完成
    is_completed = data.get('object', {}).get('completed_at', '')
    if is_completed and wo.status != WorkOrderStatus.COMPLETED:
        from apps.workorder.services import complete_work_order
        complete_work_order(wo.id)
        logger.info(f'飞书任务完成 → 工单#{wo.id} 已同步完成')

    # 增量采集：任务变更写入 PersonalContext
    try:
        _deposit_incremental_item(
            source_type='task',
            source_id=task_id,
            summary=f'[任务变更] {data.get("object", {}).get("summary", task_id)}',
            raw_content=str(data)[:5000],
            metadata={'task_id': task_id, 'event': 'task.task.updated_v1'},
        )
    except Exception as e:
        logger.debug('任务增量采集失败(非关键): %s', e)

    return {'code': 200, 'msg': 'ok'}


def _handle_task_comment(data: dict) -> dict:
    """任务评论事件"""
    return {'code': 200, 'msg': 'ok'}


def _handle_calendar_changed(data: dict) -> dict:
    """日历事件变更 → 更新排程 ScheduleSlot"""
    event_id = data.get('event_id', '') or data.get('object', {}).get('event_id', '')
    if not event_id:
        logger.info(f'日历变更事件无 event_id: {data}')
        return {'code': 200, 'msg': 'no event_id'}

    try:
        from apps.scheduling.models import ScheduleSlot
        slot = ScheduleSlot.objects.filter(feishu_calendar_event_id=event_id).first()
        if not slot:
            logger.info(f'未找到关联排程: event_id={event_id}')
            return {'code': 200, 'msg': 'slot not found'}

        event_obj = data.get('object', {})
        start_time = event_obj.get('start_time', {}).get('date', '')
        if start_time:
            from datetime import date as dt_date
            new_date = dt_date.fromisoformat(start_time)
            if new_date != slot.scheduled_date:
                old_date = slot.scheduled_date
                slot.scheduled_date = new_date
                slot.save(update_fields=['scheduled_date', 'update_time'])
                logger.info(f'排程#{slot.id} 日期从 {old_date} 更新为 {new_date}')
        return {'code': 200, 'msg': 'ok'}
    except Exception as e:
        logger.error(f'处理日历变更失败: {e}')
        return {'code': 500, 'msg': str(e)}


def _handle_contact_user_updated(data: dict) -> dict:
    """通讯录人员变更 → 触发同步"""
    logger.info('通讯录人员变更，触发增量同步')
    try:
        from apps.hr.services.sync_service import FeishuContactSyncService
        FeishuContactSyncService.sync_all()
    except Exception as e:
        logger.error(f'增量同步失败: {e}')
    return {'code': 200, 'msg': 'ok'}


def _handle_contact_dept_updated(data: dict) -> dict:
    """通讯录部门变更"""
    logger.info('通讯录部门变更')
    return {'code': 200, 'msg': 'ok'}


def _handle_approval_updated(data: dict) -> dict:
    """审批状态变更"""
    instance_code = data.get('instance_code', '')
    status = data.get('status', '')
    logger.info(f'审批变更: {instance_code} → {status}')

    if instance_code:
        from apps.workflow.models import WorkflowInstance, InstanceStatus
        instance = WorkflowInstance.objects.filter(
            feishu_approval_instance_id=instance_code,
        ).first()
        if instance and instance.status == InstanceStatus.PENDING:
            # 飞书回调直接更新实例状态（不走 approve/reject 的审批人校验）
            from apps.workflow.models import ApprovalRecord
            from django.utils import timezone as tz
            ApprovalRecord.objects.create(
                instance=instance,
                step=instance.current_step,
                approver_id=None,
                action='approve' if status == 'APPROVED' else 'reject',
                comment=f'飞书审批回调: {status}',
                approved_at=tz.now(),
            )
            if status == 'APPROVED':
                instance.status = InstanceStatus.APPROVED
            elif status == 'REJECTED':
                instance.status = InstanceStatus.REJECTED
            instance.save(update_fields=['status', 'update_time'])
            logger.info(f'审批流程#{instance.id} 飞书回调更新为 {status}')

    # 审批通过时触发知识提取
    if status == 'APPROVED':
        try:
            from apps.knowledge.feishu_knowledge_fetcher import handle_approval_passed_event
            handle_approval_passed_event(data)
        except Exception as e:
            logger.debug('Approval knowledge harvest failed (non-critical): %s', e)

    return {'code': 200, 'msg': 'ok'}


def _handle_meeting_ended(data: dict) -> dict:
    """会议结束事件 → 触发知识提炼"""
    try:
        from apps.knowledge.feishu_knowledge_fetcher import handle_meeting_ended_event
        return handle_meeting_ended_event(data)
    except Exception as e:
        logger.error('Meeting ended knowledge harvest failed: %s', e)
        return {'code': 200, 'msg': 'ok'}


def _handle_doc_updated(data: dict) -> dict:
    """飞书文档更新事件 → 触发文档知识化"""
    try:
        from apps.knowledge.tasks import queue_feishu_document_knowledge_harvest

        doc_token = (
            data.get('doc_token')
            or data.get('document_id')
            or data.get('token')
            or data.get('obj_token')
            or data.get('object', {}).get('doc_token', '')
            or data.get('object', {}).get('document_id', '')
            or data.get('object', {}).get('token', '')
        )
        if not doc_token:
            return {'code': 200, 'msg': 'no doc token'}

        queue_feishu_document_knowledge_harvest(
            feishu_doc_token=doc_token,
            trigger='event',
            event_data=data,
        )
        logger.info('Queued feishu document knowledge harvest for token=%s', doc_token)
        return {'code': 200, 'msg': 'queued'}
    except Exception as e:
        logger.error('Document knowledge harvest queue failed: %s', e)
        return {'code': 200, 'msg': 'ok'}


# ============================================================================
# 增量采集新事件处理器
# ============================================================================

def _handle_im_message_received(data: dict) -> dict:
    """
    收到 IM 消息 → 过滤噪声，项目群消息写入 PersonalContext。
    飞书事件：im.message.receive_v1
    """
    try:
        msg = data.get('message', {}) or data.get('event', {}).get('message', {}) or data
        msg_id = msg.get('message_id', '')
        chat_id = msg.get('chat_id', '')
        chat_type = msg.get('chat_type', '')  # p2p / group
        msg_type = msg.get('message_type', msg.get('msg_type', 'text'))
        sender = data.get('sender', {}) or data.get('event', {}).get('sender', {}) or {}
        sender_id = sender.get('sender_id', {}).get('open_id', '') if isinstance(sender.get('sender_id'), dict) else ''

        # 仅采集群聊（非私聊），过滤机器人自身消息
        if chat_type == 'p2p':
            return {'code': 200, 'msg': 'p2p skipped'}

        # 解析消息内容
        content_str = msg.get('content', '')
        text = ''
        if content_str:
            try:
                import json
                parsed = json.loads(content_str)
                text = parsed.get('text', '') or str(parsed)
            except Exception:
                text = content_str

        if not text or len(text.strip()) < 5:
            return {'code': 200, 'msg': 'empty message'}

        # 过滤纯表情/系统消息
        if msg_type not in ('text', 'post', 'interactive'):
            return {'code': 200, 'msg': f'msg_type {msg_type} skipped'}

        _deposit_incremental_item(
            source_type='im',
            source_id=msg_id,
            summary=f'[IM消息] {text[:80]}',
            raw_content=text[:5000],
            metadata={
                'chat_id': chat_id,
                'chat_type': chat_type,
                'sender_id': sender_id,
                'msg_type': msg_type,
                'message_id': msg_id,
                'event': 'im.message.receive_v1',
            },
            user_open_id=sender_id,
            batch_id='incremental',
        )

        # 更新 checkpoint 的 last_timestamp
        _update_checkpoint_timestamp(sender_id, 'im')

        return {'code': 200, 'msg': 'ok'}
    except Exception as e:
        logger.error('IM 消息增量采集失败: %s', e)
        return {'code': 200, 'msg': 'ok'}


def _handle_mail_message_created(data: dict) -> dict:
    """
    收到新邮件 → 异步触发邮件采集。
    飞书事件：mail.user.message.created_v1
    """
    try:
        msg_id = (
            data.get('message_id')
            or data.get('event', {}).get('message_id', '')
        )
        mailbox = (
            data.get('mailbox_id')
            or data.get('event', {}).get('mailbox_id', '')
        )
        owner_open_id = (
            data.get('owner_user_id')
            or data.get('event', {}).get('owner_user_id', '')
        )

        logger.info('新邮件事件: mailbox=%s msg_id=%s', mailbox, msg_id)

        # 异步触发邮件采集
        try:
            from celery import current_app
            current_app.send_task(
                'apps.secretary.tasks.incremental_mail_harvest',
                kwargs={
                    'open_id': owner_open_id,
                    'mailbox': mailbox,
                    'message_id': msg_id,
                },
                countdown=5,
            )
        except Exception as e:
            # Celery 不可用时，直接同步采集
            logger.debug('Celery 不可用，同步采集邮件: %s', e)
            _sync_collect_mail(owner_open_id, mailbox, msg_id)

        return {'code': 200, 'msg': 'queued'}
    except Exception as e:
        logger.error('邮件增量采集事件处理失败: %s', e)
        return {'code': 200, 'msg': 'ok'}


def _handle_drive_file_created(data: dict) -> dict:
    """
    云空间新建/编辑文件 → 按类型触发知识提取。
    飞书事件：drive.file.created_v1 / drive.file.edited_v1
    """
    try:
        obj = data.get('object', data)
        file_token = obj.get('file_token', obj.get('token', ''))
        file_type = obj.get('file_type', obj.get('type', ''))
        file_name = obj.get('file_name', obj.get('name', ''))
        operator = data.get('operator', {})
        operator_id = operator.get('open_id', '') if isinstance(operator, dict) else ''

        if not file_token:
            return {'code': 200, 'msg': 'no file_token'}

        logger.info('云空间文件事件: type=%s name=%s token=%s', file_type, file_name, file_token)

        # docx/doc → 已有文档知识化通道
        if file_type in ('docx', 'doc'):
            from apps.knowledge.tasks import queue_feishu_document_knowledge_harvest
            queue_feishu_document_knowledge_harvest(
                feishu_doc_token=file_token,
                trigger='event',
                event_data=data,
            )
            return {'code': 200, 'msg': 'queued_doc'}

        # 其他类型 → 写入 PersonalContext 待后续处理
        _deposit_incremental_item(
            source_type='drive_file',
            source_id=file_token,
            summary=f'[云空间文件] {file_name}',
            raw_content=f'文件名: {file_name}\n类型: {file_type}\nToken: {file_token}',
            metadata={
                'file_token': file_token,
                'file_type': file_type,
                'file_name': file_name,
                'operator_id': operator_id,
                'event': data.get('event_type', 'drive.file.created_v1'),
            },
            user_open_id=operator_id,
            batch_id='incremental',
        )
        return {'code': 200, 'msg': 'ok'}
    except Exception as e:
        logger.error('云空间文件事件处理失败: %s', e)
        return {'code': 200, 'msg': 'ok'}


# ============================================================================
# 增量采集公共工具函数
# ============================================================================

def _deposit_incremental_item(
    source_type: str,
    source_id: str,
    summary: str,
    raw_content: str,
    metadata: dict,
    user_open_id: str = '',
    batch_id: str = 'incremental',
) -> bool:
    """将单条增量数据写入 PersonalContext（带内容哈希去重）。"""
    import hashlib
    from apps.secretary.models import PersonalContext

    content = raw_content or summary
    if not content or len(content.strip()) < 10:
        return False

    content_hash = hashlib.sha1(content.encode('utf-8')).hexdigest()

    if PersonalContext.objects.filter(
        source_type=source_type,
        source_id=source_id,
        content_hash=content_hash,
    ).exists():
        return False

    PersonalContext.objects.create(
        user_id=user_open_id,
        source_type=source_type,
        source_id=source_id or '',
        summary=summary[:500],
        raw_content=content[:50000],
        metadata=metadata or {},
        content_hash=content_hash,
        batch_id=batch_id,
    )
    return True


def _update_checkpoint_timestamp(open_id: str, source_type: str):
    """更新对应 checkpoint 的 last_timestamp（供增量采集使用）。"""
    try:
        from apps.secretary.models import FeishuMigrationCheckpoint
        from django.utils import timezone
        FeishuMigrationCheckpoint.objects.filter(
            user_open_id=open_id,
            source_type=source_type,
            status='completed',
        ).update(last_timestamp=timezone.now())
    except Exception as e:
        logger.debug('更新 checkpoint timestamp 失败: %s', e)


def _sync_collect_mail(open_id: str, mailbox: str, message_id: str):
    """同步方式采集单封邮件（Celery 不可用时的降级）。"""
    try:
        from libs.feishu_client import feishu_client
        from apps.secretary.feishu_fetcher import get_valid_user_token
        from apps.identity.models import Account

        account = Account.objects.filter(feishu_open_id=open_id, is_deleted=False).first()
        if not account:
            return

        user_token = get_valid_user_token(account.id)
        if user_token and message_id:
            mail_detail = feishu_client.get_user_mail(user_token, message_id)
            body = mail_detail.get('body', {})
            body_text = body.get('text', '') if isinstance(body, dict) else ''
            subject = mail_detail.get('subject', '(无主题)')

            _deposit_incremental_item(
                source_type='mail',
                source_id=message_id,
                summary=f'[邮件] {subject}',
                raw_content=f'主题: {subject}\n\n{body_text}'[:10000],
                metadata={'message_id': message_id, 'subject': subject},
                user_open_id=open_id,
                batch_id='incremental',
            )
            _update_checkpoint_timestamp(open_id, 'mail')
    except Exception as e:
        logger.warning('同步采集邮件失败: %s', e)
