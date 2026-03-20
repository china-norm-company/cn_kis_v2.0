"""
飞书任务业务封装

将 feishu_client 的通用任务 API 封装为业务级方法，
对应 DEVELOPMENT_PLAN_V2.md S0-2 中 AC-4 要求。

使用方式：
    from libs.feishu_task import create_workorder_task, complete_workorder_task
    task_guid = create_workorder_task(work_order)
    complete_workorder_task(work_order)
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _get_open_id_for_account(account_id: int) -> str:
    """根据 Account ID 获取飞书 open_id"""
    try:
        from apps.identity.models import Account
        account = Account.objects.filter(id=account_id).first()
        if account:
            return getattr(account, 'feishu_open_id', None) or ''
    except Exception:
        pass
    return ''


def create_workorder_task(
    work_order=None,
    *,
    title=None,
    assignee_open_id=None,
    due_date=None,
    description=None,
) -> Optional[str]:
    """
    为工单创建飞书任务（支持两种调用方式）

    方式1 - 工单对象:
        create_workorder_task(work_order)
        work_order: WorkOrder 模型实例，需有 assigned_to, title, description, due_date

    方式2 - 直接参数（设备/CRM/HR 集成）:
        create_workorder_task(title='...', assignee_open_id='ou_xxx', due_date='2025-03-01', description='...')

    Returns:
        飞书任务 GUID（成功时），None（失败或无分配人时）
    """
    if work_order is not None and title is None and assignee_open_id is None:
        # 方式1: 工单对象
        if not work_order.assigned_to:
            logger.warning(f"工单#{work_order.id} 无分配人，跳过飞书任务创建")
            return None

        assignee_open_id = _get_open_id_for_account(work_order.assigned_to)
        if not assignee_open_id:
            logger.warning(f"工单#{work_order.id} 分配人#{work_order.assigned_to} 无 open_id")
            return None

        title = f"[工单] {work_order.title}"
        description = work_order.description or ''
        due_date = work_order.due_date
        extra = json.dumps({
            'workorder_id': work_order.id,
            'source': 'cn_kis',
            'type': 'workorder',
        })
    elif title is not None and assignee_open_id is not None:
        # 方式2: 直接参数
        description = description or ''
        extra = json.dumps({'source': 'cn_kis', 'type': 'integration'})
    else:
        logger.warning("create_workorder_task: 参数无效，需 work_order 或 (title, assignee_open_id)")
        return None

    if not assignee_open_id:
        return None

    try:
        from libs.feishu_client import feishu_client
        from datetime import datetime

        due_ts = None
        if due_date:
            if hasattr(due_date, 'timestamp'):
                due_ts = int(due_date.timestamp())
            elif isinstance(due_date, str):
                try:
                    dt = datetime.strptime(due_date[:10], '%Y-%m-%d')
                    due_ts = int(dt.timestamp())
                except (ValueError, TypeError):
                    pass

        data = feishu_client.create_task(
            summary=title,
            description=description,
            due_timestamp=due_ts,
            member_open_ids=[assignee_open_id],
            extra=extra,
        )

        task_guid = data.get('task', {}).get('guid', '')
        if task_guid:
            log_id = getattr(work_order, 'id', None) or 'integration'
            logger.info(f"飞书任务已创建: {task_guid} (source={log_id})")
            return task_guid
        else:
            logger.warning("飞书任务创建响应中无 guid")
            return None
    except Exception as e:
        logger.error(f"飞书任务创建失败: {e}")
        return None


def complete_workorder_task(work_order) -> bool:
    """
    标记工单对应的飞书任务为完成

    Args:
        work_order: WorkOrder 模型实例，需有 feishu_task_id

    Returns:
        True 成功，False 失败或无关联任务
    """
    if not work_order.feishu_task_id:
        return False

    try:
        from libs.feishu_client import feishu_client
        feishu_client.complete_task(work_order.feishu_task_id)
        logger.info(f"工单#{work_order.id} 飞书任务已完成: {work_order.feishu_task_id}")
        return True
    except Exception as e:
        logger.error(f"工单#{work_order.id} 飞书任务完成失败: {e}")
        return False


def create_visit_task(
    visit_node,
    assignee_account_id: int,
    subject_code: str = '',
) -> Optional[str]:
    """
    为访视节点创建飞书任务（预留，S1 阶段使用）

    Args:
        visit_node: VisitNode 模型实例
        assignee_account_id: 负责人 Account ID
        subject_code: 受试者编号

    Returns:
        飞书任务 GUID
    """
    assignee_open_id = _get_open_id_for_account(assignee_account_id)
    if not assignee_open_id:
        return None

    try:
        from libs.feishu_client import feishu_client

        data = feishu_client.create_task(
            summary=f"[访视] {visit_node.name} - {subject_code}",
            description=f"基准日: D{visit_node.baseline_day}",
            member_open_ids=[assignee_open_id],
            extra=json.dumps({
                'visit_node_id': visit_node.id,
                'subject_code': subject_code,
                'source': 'cn_kis',
                'type': 'visit',
            }),
        )

        task_guid = data.get('task', {}).get('guid', '')
        if task_guid:
            logger.info(f"访视节点#{visit_node.id} 飞书任务已创建: {task_guid}")
        return task_guid or None
    except Exception as e:
        logger.error(f"访视节点#{visit_node.id} 飞书任务创建失败: {e}")
        return None
