"""
审批流程通用引擎服务

S4-9：创建流程定义、发起审批、审批操作
"""
import logging
from typing import Optional, Dict
from django.utils import timezone

from apps.workflow.models import (
    WorkflowDefinition, WorkflowInstance, ApprovalRecord,
    InstanceStatus, WorkflowStatus,
)

logger = logging.getLogger(__name__)


def create_definition(
    name: str, code: str, business_type: str,
    steps: list, description: str = '',
    feishu_approval_code: str = '',
) -> WorkflowDefinition:
    return WorkflowDefinition.objects.create(
        name=name, code=code, business_type=business_type,
        steps=steps, description=description,
        feishu_approval_code=feishu_approval_code,
    )


def start_workflow(
    definition_code: str,
    business_type: str,
    business_id: int,
    title: str,
    initiator_id: int,
    form_data: dict = None,
) -> Optional[WorkflowInstance]:
    """
    发起审批流程

    1. 查找流程定义
    2. 创建实例
    3. 如有飞书审批定义，同步创建飞书审批
    4. 通知第一步审批人
    """
    defn = WorkflowDefinition.objects.filter(
        code=definition_code, status=WorkflowStatus.ACTIVE,
    ).first()
    if not defn:
        logger.error(f'流程定义 {definition_code} 不存在或已停用')
        return None

    instance = WorkflowInstance.objects.create(
        definition=defn,
        business_type=business_type,
        business_id=business_id,
        title=title,
        initiator_id=initiator_id,
        form_data=form_data or {},
        current_step=1,
    )

    # 飞书审批联动
    if defn.feishu_approval_code:
        _create_feishu_approval(instance, defn)

    # 通知审批人
    _notify_current_step_approvers(instance, defn)

    logger.info(f'审批流程#{instance.id} 已发起: {title}')
    return instance


def approve(
    instance_id: int, approver_id: int, comment: str = '',
) -> Optional[WorkflowInstance]:
    """审批通过"""
    instance = WorkflowInstance.objects.filter(
        id=instance_id, status=InstanceStatus.PENDING,
    ).first()
    if not instance:
        return None

    # 校验审批人授权（approver_id=0 为系统/飞书回调自动操作）
    if approver_id and not _is_authorized_approver(instance, approver_id):
        logger.warning(f'用户#{approver_id} 不是流程#{instance_id} 当前步骤的审批人')
        return None

    ApprovalRecord.objects.create(
        instance=instance, step=instance.current_step,
        approver_id=approver_id, action='approve',
        comment=comment, approved_at=timezone.now(),
    )

    defn = instance.definition
    steps = defn.steps or []

    if instance.current_step < len(steps):
        instance.current_step += 1
        instance.save(update_fields=['current_step', 'update_time'])
        _notify_current_step_approvers(instance, defn)
    else:
        instance.status = InstanceStatus.APPROVED
        instance.save(update_fields=['status', 'update_time'])
        _on_workflow_complete(instance, 'approved')

    return instance


def reject(
    instance_id: int, approver_id: int, comment: str = '',
) -> Optional[WorkflowInstance]:
    """审批驳回"""
    instance = WorkflowInstance.objects.filter(
        id=instance_id, status=InstanceStatus.PENDING,
    ).first()
    if not instance:
        return None

    ApprovalRecord.objects.create(
        instance=instance, step=instance.current_step,
        approver_id=approver_id, action='reject',
        comment=comment, approved_at=timezone.now(),
    )

    instance.status = InstanceStatus.REJECTED
    instance.save(update_fields=['status', 'update_time'])
    _on_workflow_complete(instance, 'rejected')
    return instance


def get_instance_detail(instance_id: int) -> Optional[Dict]:
    instance = WorkflowInstance.objects.filter(id=instance_id).select_related(
        'definition',
    ).first()
    if not instance:
        return None
    records = ApprovalRecord.objects.filter(instance=instance).order_by('step', 'create_time')
    return {
        'id': instance.id,
        'title': instance.title,
        'status': instance.status,
        'current_step': instance.current_step,
        'business_type': instance.business_type,
        'business_id': instance.business_id,
        'definition': {'id': instance.definition.id, 'name': instance.definition.name},
        'records': [{
            'step': r.step, 'approver_id': r.approver_id,
            'action': r.action, 'comment': r.comment,
            'approved_at': r.approved_at.isoformat() if r.approved_at else None,
        } for r in records],
    }


def _is_authorized_approver(instance: WorkflowInstance, user_id: int) -> bool:
    """检查用户是否为当前步骤的授权审批人"""
    defn = instance.definition
    steps = defn.steps or []
    if instance.current_step > len(steps):
        return False
    step_config = steps[instance.current_step - 1]
    approvers = step_config.get('approvers', [])
    for approver in approvers:
        if approver.get('user_id') == user_id:
            return True
        # 支持角色型审批人
        role = approver.get('role')
        if role:
            try:
                from apps.identity.models import Account
                account = Account.objects.filter(id=user_id).first()
                if account and account.account_type == role:
                    return True
            except Exception:
                pass
    return False


def _create_feishu_approval(instance: WorkflowInstance, defn: WorkflowDefinition):
    """创建飞书审批实例"""
    try:
        import json
        from libs.feishu_client import feishu_client
        result = feishu_client._request('POST', 'approval/v4/instances', json={
            'approval_code': defn.feishu_approval_code,
            'form': json.dumps(instance.form_data, ensure_ascii=False) if instance.form_data else '[]',
        })
        if result:
            inst_id = result.get('data', {}).get('instance_code', '')
            if inst_id:
                instance.feishu_approval_instance_id = inst_id
                instance.save(update_fields=['feishu_approval_instance_id'])
    except Exception as e:
        logger.error(f'创建飞书审批失败: {e}')


def _notify_current_step_approvers(instance: WorkflowInstance, defn: WorkflowDefinition):
    """通知当前步骤审批人"""
    steps = defn.steps or []
    if instance.current_step > len(steps):
        return

    step_config = steps[instance.current_step - 1]
    approvers = step_config.get('approvers', [])

    for approver in approvers:
        user_ids_to_notify = []
        user_id = approver.get('user_id')
        if user_id:
            user_ids_to_notify.append(user_id)
        else:
            # 角色型审批人：解析角色查找对应用户
            role = approver.get('role')
            if role:
                try:
                    from apps.identity.models import Account
                    role_users = Account.objects.filter(
                        account_type=role, is_deleted=False,
                    ).values_list('id', flat=True)
                    user_ids_to_notify.extend(role_users)
                except Exception as e:
                    logger.warning(f'解析角色审批人 {role} 失败: {e}')

        for uid in user_ids_to_notify:
            try:
                from apps.notification.services import send_notification
                send_notification(
                    recipient_id=uid,
                    title=f'待审批: {instance.title}',
                    content=f'步骤 {instance.current_step}: {step_config.get("name", "")}',
                    source_type='workflow',
                    source_id=instance.id,
                )
            except Exception as e:
                logger.error(f'通知审批人#{uid}失败: {e}')


def _on_workflow_complete(instance: WorkflowInstance, result: str):
    """流程完成后回调"""
    logger.info(f'审批流程#{instance.id} 完成: {result}')
    try:
        from apps.notification.services import send_notification
        send_notification(
            recipient_id=instance.initiator_id,
            title=f'审批完成: {instance.title}',
            content=f'结果: {"已通过" if result == "approved" else "已驳回"}',
            source_type='workflow',
            source_id=instance.id,
        )
    except Exception as e:
        logger.error(f'通知发起人失败: {e}')
