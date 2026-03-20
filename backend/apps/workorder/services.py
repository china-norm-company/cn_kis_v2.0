"""
工单管理服务

封装工单的 CRUD、分配、状态流转等业务逻辑。
工单连接受试者入组与访视节点，是执行层面的核心调度单元。

飞书集成：
- 工单派发时创建飞书任务（task/v2），CRC 可在飞书中直接查看和操作工单
- 工单逾期时通过飞书机器人发送通知
- 工单提交审核时发起飞书审批
- 工单完成时标记飞书任务完成
"""
import logging
from typing import Optional
from datetime import datetime
from django.conf import settings
from django.utils import timezone
from django.db import transaction, models

from .models import WorkOrder, WorkOrderStatus
from .query_utils import filter_by_assignee

logger = logging.getLogger(__name__)


# ============================================================================
# 状态机定义
# ============================================================================
VALID_TRANSITIONS = {
    WorkOrderStatus.PENDING: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
    WorkOrderStatus.ASSIGNED: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
    WorkOrderStatus.IN_PROGRESS: [WorkOrderStatus.COMPLETED, WorkOrderStatus.REVIEW, WorkOrderStatus.CANCELLED],
    WorkOrderStatus.COMPLETED: [WorkOrderStatus.REVIEW],
    WorkOrderStatus.REVIEW: [WorkOrderStatus.APPROVED, WorkOrderStatus.REJECTED],
    WorkOrderStatus.REJECTED: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
    WorkOrderStatus.APPROVED: [],  # 终态
    WorkOrderStatus.CANCELLED: [],  # 终态
}


def _safe_account_fk_id(account_id: Optional[int]) -> Optional[int]:
    """仅当账号存在时返回可写入 FK 的 account_id。"""
    if not account_id:
        return None
    try:
        from apps.identity.models import Account
        exists = Account.objects.filter(id=account_id, is_deleted=False).exists()
        return account_id if exists else None
    except Exception:
        return None


def _is_workorder_legacy_write_frozen() -> bool:
    """是否冻结 WorkOrder legacy 字段写入。"""
    return bool(getattr(settings, 'WORKORDER_FREEZE_LEGACY_WRITE', False))


def _is_workorder_freeze_observe_enabled() -> bool:
    """是否开启冻结期观测日志。"""
    return bool(getattr(settings, 'WORKORDER_FREEZE_OBSERVE_LOG_ENABLED', True))


def _log_workorder_freeze_observation(event: str, wo_id: Optional[int], **payload) -> None:
    """
    统一输出冻结期观测日志，便于按 event 聚合检索。
    仅在观测开关开启时输出，避免日志噪音不可控。
    """
    if not _is_workorder_freeze_observe_enabled():
        return
    mode = 'freeze' if _is_workorder_legacy_write_frozen() else 'dual_write'
    parts = [f'event={event}', f'mode={mode}', f'work_order_id={wo_id}']
    for key, value in payload.items():
        parts.append(f'{key}={value}')
    logger.info('workorder_legacy_transition %s', ' '.join(parts))


def _build_workorder_create_identity_fields(
    assigned_to: Optional[int],
    created_by_id: Optional[int],
) -> dict:
    """
    生成 WorkOrder 创建时的身份字段写入 payload。
    - 默认双写（legacy + FK）
    - 冻结期开关打开后仅写 FK，legacy 置空
    """
    payload = {
        'assigned_to_account_id': _safe_account_fk_id(assigned_to),
        'created_by_account_id': _safe_account_fk_id(created_by_id),
    }
    if _is_workorder_legacy_write_frozen():
        payload['assigned_to'] = None
        payload['created_by_id'] = None
    else:
        payload['assigned_to'] = assigned_to
        payload['created_by_id'] = created_by_id
    return payload


def _build_workorder_assignee_update_fields(assigned_to: Optional[int]) -> tuple:
    """
    生成 WorkOrder 分配人更新 payload 与 update_fields。
    冻结期仅写 FK；非冻结期保持双写。
    """
    payload = {'assigned_to_account_id': _safe_account_fk_id(assigned_to)}
    update_fields = ['assigned_to_account', 'update_time']
    if _is_workorder_legacy_write_frozen():
        payload['assigned_to'] = None
    else:
        payload['assigned_to'] = assigned_to
    update_fields.insert(0, 'assigned_to')
    return payload, update_fields


# ============================================================================
# 工单 CRUD
# ============================================================================
def _apply_data_scope(qs, account=None):
    """
    应用数据权限过滤（若提供 account）

    WorkOrder 无直接 protocol_id 字段，通过 enrollment__protocol_id 关联到项目，
    需传入 field_mapping 以确保项目级角色（CRC）能正确过滤到所属项目的工单，
    而非退化为个人级过滤。
    """
    if account is None:
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(
        qs,
        account,
        field_mapping={'project': 'enrollment__protocol_id'},
    )


def list_work_orders(
    enrollment_id: int = None,
    visit_node_id: int = None,
    assigned_to: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    """分页查询工单列表"""
    qs = WorkOrder.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if enrollment_id:
        qs = qs.filter(enrollment_id=enrollment_id)
    if visit_node_id:
        qs = qs.filter(visit_node_id=visit_node_id)
    if assigned_to:
        qs = filter_by_assignee(qs, assigned_to)
    if status:
        qs = qs.filter(status=status)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_work_order(work_order_id: int) -> Optional[WorkOrder]:
    """获取工单详情"""
    return WorkOrder.objects.filter(id=work_order_id, is_deleted=False).first()


def get_my_today_work_orders(account_id: int) -> list:
    """
    获取当前用户今日工单，包含受试者和项目关联信息

    返回结构丰富的工单列表，包含关联的受试者、项目、访视节点、活动、资源需求信息，
    方便前端一次请求获取技术员工作所需的完整上下文。
    """
    from datetime import date
    today = date.today()

    qs = WorkOrder.objects.filter(
        is_deleted=False,
    )
    qs = filter_by_assignee(qs, account_id).filter(
        # 今日排程 或 状态为进行中/已分配（可能跨天未完成）
        models.Q(scheduled_date=today) |
        models.Q(status__in=[WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS])
    ).select_related(
        'enrollment', 'visit_node',
    ).order_by('scheduled_date', 'create_time')

    result = []
    for wo in qs:
        item = {
            'id': wo.id,
            'title': wo.title,
            'description': wo.description,
            'work_order_type': wo.work_order_type,
            'status': wo.status,
            'scheduled_date': str(wo.scheduled_date) if wo.scheduled_date else None,
            'actual_date': str(wo.actual_date) if wo.actual_date else None,
            'assigned_to': wo.effective_assigned_to,
            'effective_assigned_to': wo.effective_assigned_to,
            'legacy_assigned_to': wo.assigned_to,
            'due_date': wo.due_date.isoformat() if wo.due_date else None,
            'create_time': wo.create_time.isoformat(),
            'update_time': wo.update_time.isoformat(),
            'completed_at': wo.completed_at.isoformat() if wo.completed_at else None,
            'enrollment_id': wo.enrollment_id,
            'visit_node_id': wo.visit_node_id,
            'visit_activity_id': wo.visit_activity_id,
        }

        # 受试者信息
        try:
            enrollment = wo.enrollment
            if enrollment:
                subject = enrollment.subject
                item['subject_id'] = subject.id
                item['subject_name'] = subject.name[:1] + '**' if subject.name else ''
                item['subject_skin_type'] = subject.skin_type
                item['subject_risk_level'] = subject.risk_level
                item['protocol_id'] = enrollment.protocol_id
                item['protocol_title'] = enrollment.protocol.title if enrollment.protocol else ''
        except Exception:
            pass

        # 访视节点信息
        try:
            if wo.visit_node:
                item['visit_node_name'] = wo.visit_node.name
                item['visit_node_code'] = wo.visit_node.code
        except Exception:
            pass

        # 访视活动及关联的 CRF 模板
        try:
            if wo.visit_activity_id:
                from apps.visit.models import VisitActivity
                activity = VisitActivity.objects.select_related('activity_template').filter(
                    id=wo.visit_activity_id
                ).first()
                if activity:
                    item['activity_name'] = activity.name
                    if activity.activity_template:
                        item['activity_template_id'] = activity.activity_template.id
                        item['crf_template_id'] = activity.activity_template.crf_template_id
                        item['sop_id'] = activity.activity_template.sop_id
        except Exception:
            pass

        # 资源需求
        try:
            from .models import WorkOrderResource
            resources = WorkOrderResource.objects.select_related(
                'resource_category', 'resource_item'
            ).filter(work_order=wo)
            item['resources'] = [{
                'id': r.id,
                'resource_category_name': r.resource_category.name if r.resource_category else '',
                'resource_item_name': r.resource_item.name if r.resource_item else '',
                'resource_item_id': r.resource_item_id,
                'required_quantity': r.required_quantity,
                'is_mandatory': r.is_mandatory,
                'next_calibration_date': str(r.resource_item.next_calibration_date) if r.resource_item and r.resource_item.next_calibration_date else None,
            } for r in resources]
        except Exception:
            item['resources'] = []

        result.append(item)

    return result


def create_work_order(
    enrollment_id: int,
    title: str,
    visit_node_id: int = None,
    description: str = '',
    assigned_to: int = None,
    created_by_id: int = None,
    due_date: datetime = None,
) -> WorkOrder:
    """
    创建工单

    如果指定了分配人（assigned_to），同时创建飞书任务。
    """
    identity_fields = _build_workorder_create_identity_fields(
        assigned_to=assigned_to,
        created_by_id=created_by_id,
    )
    wo = WorkOrder.objects.create(
        enrollment_id=enrollment_id,
        visit_node_id=visit_node_id,
        title=title,
        description=description,
        **identity_fields,
        due_date=due_date,
    )
    _log_workorder_freeze_observation(
        event='create_work_order',
        wo_id=wo.id,
        assigned_to_legacy=wo.assigned_to,
        assigned_to_fk=wo.assigned_to_account_id,
        created_by_legacy=wo.created_by_id,
        created_by_fk=wo.created_by_account_id,
    )
    if assigned_to:
        _create_feishu_task_for_workorder(wo)
        _send_workorder_card(wo)
        try:
            from apps.notification.services import send_notification
            send_notification(
                recipient_id=assigned_to,
                title=f'新委派任务: {title}',
                content=description[:200] if description else '',
                source_type='workorder',
                source_id=wo.id,
            )
        except Exception:
            pass
    return wo


def update_work_order(work_order_id: int, **kwargs) -> Optional[WorkOrder]:
    """更新工单信息（非状态字段）— P2-3: 锁定后拒绝修改"""
    wo = get_work_order(work_order_id)
    if not wo:
        return None
    if wo.is_locked:
        raise ValueError(f'工单#{work_order_id} 已锁定（审批通过），不可修改')
    if _is_workorder_legacy_write_frozen() and 'assigned_to' in kwargs and kwargs.get('assigned_to') is not None:
        kwargs['assigned_to_account_id'] = _safe_account_fk_id(kwargs.get('assigned_to'))
        kwargs['assigned_to'] = None
    for key, value in kwargs.items():
        if value is not None and hasattr(wo, key) and key != 'status':
            setattr(wo, key, value)
    wo.save()
    if 'assigned_to_account_id' in kwargs or 'assigned_to' in kwargs:
        _log_workorder_freeze_observation(
            event='update_work_order_assignee',
            wo_id=wo.id,
            assigned_to_legacy=wo.assigned_to,
            assigned_to_fk=wo.assigned_to_account_id,
        )
    return wo


def delete_work_order(work_order_id: int) -> bool:
    """软删除工单"""
    wo = get_work_order(work_order_id)
    if not wo:
        return False
    wo.is_deleted = True
    wo.save(update_fields=['is_deleted', 'update_time'])
    return True


# ============================================================================
# 分配（含飞书任务创建）
# ============================================================================
def _get_assignee_open_id(account_id: int) -> Optional[str]:
    """根据 Account ID 获取用户的飞书 open_id"""
    try:
        from apps.identity.models import Account
        account = Account.objects.filter(id=account_id).first()
        if account:
            return getattr(account, 'feishu_open_id', None) or ''
    except Exception as e:
        logger.warning(f'获取用户#{account_id} 飞书 open_id 失败: {e}')
    return ''


def _send_workorder_card(wo: WorkOrder) -> None:
    """向被分配人发送带操作按钮的工单交互卡片"""
    assignee_id = wo.effective_assigned_to
    if not assignee_id:
        return
    assignee_open_id = _get_assignee_open_id(assignee_id)
    if not assignee_open_id:
        return
    try:
        from libs.notification import notify_work_order_assigned
        notify_work_order_assigned(wo, assignee_open_id)
        logger.info(f"工单#{wo.id} 交互卡片已发送给 {assignee_open_id}")
    except Exception as e:
        logger.error(f"工单#{wo.id} 交互卡片发送失败: {e}")


def _create_feishu_task_for_workorder(wo: WorkOrder) -> None:
    """
    为工单创建飞书任务（委托给 libs.feishu_task 业务封装）

    在工单分配时调用，为被分配人创建飞书任务，
    任务出现在其飞书"任务"列表中，从"通知"变为"可操作"。
    """
    try:
        from libs.feishu_task import create_workorder_task
        task_guid = create_workorder_task(wo)
        if task_guid:
            wo.feishu_task_id = task_guid
            wo.save(update_fields=['feishu_task_id'])
    except Exception as e:
        logger.error(f"工单#{wo.id} 飞书任务创建失败: {e}")


def _complete_feishu_task(wo: WorkOrder) -> None:
    """标记工单对应的飞书任务为完成（委托给 libs.feishu_task）"""
    try:
        from libs.feishu_task import complete_workorder_task
        complete_workorder_task(wo)
    except Exception as e:
        logger.error(f"工单#{wo.id} 飞书任务完成标记失败: {e}")


# Bitable 字段映射常量（避免硬编码中文字段名）
BITABLE_WO_FIELDS = {
    'id': '工单ID',
    'title': '标题',
    'type': '类型',
    'status': '状态',
    'assignee': '执行人',
    'created': '创建时间',
}


def _sync_workorder_to_bitable(wo: WorkOrder) -> None:
    """S1-7：工单状态同步到飞书多维表格看板"""
    try:
        import os
        from libs.feishu_client import feishu_client
        app_token = os.getenv('FEISHU_BITABLE_APP_TOKEN', '')
        table_id = os.getenv('FEISHU_BITABLE_WORKORDER_TABLE_ID', '')
        if not app_token or not table_id:
            return

        F = BITABLE_WO_FIELDS
        status_map = dict(WorkOrderStatus.choices)
        feishu_client.upsert_bitable_record(
            app_token=app_token,
            table_id=table_id,
            record_id=str(wo.id),
            fields={
                F['id']: wo.id,
                F['title']: wo.title,
                F['type']: getattr(wo, 'work_order_type', 'visit'),
                F['status']: status_map.get(wo.status, wo.status),
                F['assignee']: str(wo.effective_assigned_to) if wo.effective_assigned_to else '',
                F['created']: wo.create_time.isoformat() if wo.create_time else '',
            },
        )
    except Exception as e:
        logger.error(f'工单#{wo.id} 多维表格同步失败: {e}')


def assign_work_order(work_order_id: int, assigned_to: int, due_date: datetime = None) -> Optional[WorkOrder]:
    """
    分配工单

    分配时自动：
    1. 为被分配人创建飞书任务（出现在飞书任务列表中）
    2. 发送带"接受"/"完成"按钮的交互卡片（可直接在飞书中操作）
    """
    wo = get_work_order(work_order_id)
    if not wo:
        return None
    assignee_updates, update_fields = _build_workorder_assignee_update_fields(assigned_to)
    for key, value in assignee_updates.items():
        setattr(wo, key, value)
    if due_date:
        wo.due_date = due_date
        update_fields = update_fields + ['due_date']
    wo.save(update_fields=update_fields)
    _log_workorder_freeze_observation(
        event='assign_work_order',
        wo_id=wo.id,
        assigned_to_legacy=wo.assigned_to,
        assigned_to_fk=wo.assigned_to_account_id,
    )

    _create_feishu_task_for_workorder(wo)
    _send_workorder_card(wo)
    return wo


# ============================================================================
# 状态流转
# ============================================================================
def _check_overdue_and_notify(wo: WorkOrder) -> None:
    """检查工单是否逾期，逾期则发送飞书通知"""
    if not wo.due_date:
        return
    today = timezone.now().date()
    due = wo.due_date.date() if hasattr(wo.due_date, 'date') and callable(wo.due_date.date) else wo.due_date
    if today > due:
        try:
            from libs.notification import notify_work_order_overdue
            notify_work_order_overdue(wo)
            logger.info(f"工单#{wo.id} 逾期通知已发送")
        except Exception as e:
            logger.error(f"工单#{wo.id} 逾期通知发送失败: {e}")


def _change_status(work_order_id: int, new_status: str) -> Optional[WorkOrder]:
    """通用状态变更（内部使用）"""
    wo = get_work_order(work_order_id)
    if not wo:
        return None

    allowed = VALID_TRANSITIONS.get(wo.status, [])
    if new_status not in allowed:
        raise ValueError(
            f'工单#{work_order_id} 状态转换非法: {wo.status} -> {new_status}。'
            f'允许的目标状态: {[s.value for s in allowed]}'
        )

    wo.status = new_status
    if new_status in (WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED):
        wo.completed_at = timezone.now()
    wo.save()

    # 飞书通知：状态变更后检查逾期
    _check_overdue_and_notify(wo)

    # S1-7：工单状态同步到多维表格看板
    _sync_workorder_to_bitable(wo)

    return wo


def check_calibration_before_start(work_order_id: int) -> dict:
    """
    P2.3: 工单开始前检查所有关联仪器的校准状态

    返回：{'can_start': bool, 'issues': [...], 'warnings': [...]}
    """
    from datetime import date, timedelta
    from .models import WorkOrderResource
    from apps.resource.models import ResourceItem

    today = date.today()
    issues = []
    warnings = []

    resources = WorkOrderResource.objects.select_related(
        'resource_category', 'resource_item',
    ).filter(work_order_id=work_order_id)

    for res in resources:
        if not res.resource_item:
            continue
        item = res.resource_item
        # 仅检查设备类（需要校准的资源）
        if res.resource_category and res.resource_category.resource_type != 'equipment':
            continue
        if not item.next_calibration_date:
            continue

        days_left = (item.next_calibration_date - today).days

        if days_left < 0:
            # 已过期
            msg = f'仪器 {item.name}（{item.code}）校准已过期（过期 {abs(days_left)} 天），请联系设备管理员'
            if res.is_mandatory:
                issues.append(msg)
            else:
                warnings.append(msg)
        elif days_left < 30:
            warnings.append(
                f'仪器 {item.name}（{item.code}）校准即将到期（剩余 {days_left} 天）'
            )

    return {
        'can_start': len(issues) == 0,
        'issues': issues,
        'warnings': warnings,
    }


def start_work_order(work_order_id: int) -> Optional[WorkOrder]:
    """
    开始处理工单

    P2.3: 自动检查仪器校准状态，必须仪器过期时阻止开始
    P2-2: 检查 SOP 确认状态
    """
    wo = get_work_order(work_order_id)
    if not wo:
        return None

    # P2-2: SOP 确认前置检查（有关联 SOP 时强制）
    if not wo.sop_confirmed:
        has_sop = False
        try:
            if wo.visit_activity_id:
                from apps.visit.models import VisitActivity
                activity = VisitActivity.objects.select_related('activity_template').filter(
                    id=wo.visit_activity_id,
                ).first()
                if activity and activity.activity_template and activity.activity_template.sop_id:
                    has_sop = True
        except Exception:
            pass
        if has_sop:
            raise ValueError('工单无法开始：请先确认已阅读操作规范（SOP）')

    # 校准前置检查
    cal_check = check_calibration_before_start(work_order_id)
    if not cal_check['can_start']:
        raise ValueError(
            '工单无法开始：' + '；'.join(cal_check['issues'])
        )
    if cal_check['warnings']:
        logger.warning(f'工单#{work_order_id} 校准警告: {cal_check["warnings"]}')

    return _change_status(work_order_id, WorkOrderStatus.IN_PROGRESS)


def confirm_sop(work_order_id: int) -> Optional[WorkOrder]:
    """P2-2: 确认已阅读 SOP"""
    wo = get_work_order(work_order_id)
    if not wo:
        return None
    wo.sop_confirmed = True
    wo.save(update_fields=['sop_confirmed', 'update_time'])
    return wo


def _verify_signature_for_completion(work_order_id: int) -> bool:
    """P2-1: 验证工单完成前是否有有效的电子签名"""
    try:
        from apps.signature.models import ElectronicSignature
        return ElectronicSignature.objects.filter(
            resource_type='workorder',
            resource_id=str(work_order_id),
        ).exists()
    except Exception:
        return True


def complete_work_order(work_order_id: int, skip_signature_check: bool = False) -> Optional[WorkOrder]:
    """
    完成工单

    P2-1: 电子签名校验
    飞书集成：
    - 标记对应飞书任务完成
    - 触发 AnyCross Webhook
    """
    if not skip_signature_check and not _verify_signature_for_completion(work_order_id):
        raise ValueError('工单无法完成：请先完成电子签名确认')

    wo = _change_status(work_order_id, WorkOrderStatus.COMPLETED)
    if wo:
        _complete_feishu_task(wo)
        try:
            from apps.feishu_sync.services import trigger_anycross_webhook
            trigger_anycross_webhook('workorder_completed', {
                'workorder_id': wo.id,
                'title': wo.title,
                'status': wo.status,
                'completed_at': wo.completed_at.isoformat() if wo.completed_at else '',
            })
        except Exception as e:
            logger.error(f"工单完成 AnyCross Webhook 触发失败: {e}")

        # S2-3：自动质量审计
        try:
            from apps.workorder.services.quality_audit_service import EnhancedQualityAuditService
            audit_result = EnhancedQualityAuditService.auto_audit(work_order_id)
            if audit_result:
                logger.info(f'工单#{work_order_id} 质量审计结果: {audit_result["result"]}')
        except Exception as e:
            logger.error(f'工单#{work_order_id} 质量审计失败: {e}')

        # S3-1 AC-3：自动创建设备使用记录
        try:
            _create_equipment_usage_records(wo)
        except Exception as e:
            logger.error(f'工单#{work_order_id} 设备使用记录创建失败: {e}')

        # P1-3：工单完成通知 CRC 主管
        try:
            _notify_supervisor_on_completion(wo)
        except Exception as e:
            logger.error(f'工单#{work_order_id} 完成通知发送失败: {e}')
    return wo


def submit_for_review(work_order_id: int, submitter_open_id: str = '') -> Optional[WorkOrder]:
    """
    提交审核

    飞书集成：提交审核时发起飞书审批（FEISHU_NATIVE_SETUP.md 3.x）。
    飞书审批通过/拒绝后通过回调更新工单状态。
    """
    wo = _change_status(work_order_id, WorkOrderStatus.REVIEW)
    if wo and submitter_open_id:
        try:
            from libs.feishu_approval import create_workorder_approval
            instance_code = create_workorder_approval(
                open_id=submitter_open_id,
                workorder_title=wo.title,
                workorder_id=wo.id,
                description=wo.description,
            )
            if instance_code:
                wo.feishu_approval_instance_id = instance_code
                wo.save(update_fields=['feishu_approval_instance_id'])
                logger.info(f"工单#{wo.id} 飞书审批已发起: {instance_code}")
        except Exception as e:
            logger.error(f"工单#{wo.id} 飞书审批发起失败: {e}")
    return wo


def approve_work_order(work_order_id: int) -> Optional[WorkOrder]:
    """批准工单 — P2-3: 审批通过后锁定数据"""
    wo = _change_status(work_order_id, WorkOrderStatus.APPROVED)
    if wo:
        wo.is_locked = True
        wo.save(update_fields=['is_locked', 'update_time'])
    return wo


def reject_work_order(work_order_id: int) -> Optional[WorkOrder]:
    """拒绝工单"""
    return _change_status(work_order_id, WorkOrderStatus.REJECTED)


def cancel_work_order(work_order_id: int) -> Optional[WorkOrder]:
    """取消工单"""
    return _change_status(work_order_id, WorkOrderStatus.CANCELLED)


# ============================================================================
# 统计
# ============================================================================
def get_work_order_stats(enrollment_id: int = None, assigned_to: int = None) -> dict:
    """工单统计"""
    qs = WorkOrder.objects.filter(is_deleted=False)
    if enrollment_id:
        qs = qs.filter(enrollment_id=enrollment_id)
    if assigned_to:
        qs = filter_by_assignee(qs, assigned_to)

    from django.db.models import Count
    stats = qs.values('status').annotate(count=Count('id'))
    result = {item['status']: item['count'] for item in stats}
    result['total'] = sum(result.values())
    return result


def _create_equipment_usage_records(wo: WorkOrder):
    """
    S3-1 AC-3：工单完成时自动创建设备使用记录

    关联工单的 BOM 中所有设备资源自动生成使用记录。
    """
    if not wo.visit_activity_id:
        return

    from apps.visit.models import VisitActivity
    from apps.resource.models import ActivityBOM, ResourceItem
    from apps.resource.services import create_equipment_usage

    activity = VisitActivity.objects.filter(id=wo.visit_activity_id).first()
    if not activity or not activity.activity_template_id:
        return

    bom_items = ActivityBOM.objects.filter(
        template_id=activity.activity_template_id,
        resource_category__resource_type='equipment',
    )
    for bom in bom_items:
        equipment_list = ResourceItem.objects.filter(
            category=bom.resource_category,
            is_deleted=False,
            status='active',
        )[:bom.quantity]

        for equip in equipment_list:
            create_equipment_usage(
                equipment_id=equip.id,
                work_order_id=wo.id,
                operator_id=wo.effective_assigned_to,
            )
            logger.info(f'设备使用记录已创建: equipment={equip.name}, wo={wo.id}')


def _notify_supervisor_on_completion(wo: WorkOrder) -> None:
    """
    P1-3：工单完成后通知 CRC 主管

    通过 notification service 发送飞书卡片消息，告知主管工单已完成。
    """
    from apps.notification.services import send_notification

    supervisor_ids = _get_supervisor_account_ids()
    if not supervisor_ids:
        logger.warning(f'工单#{wo.id} 完成通知: 未找到 CRC 主管')
        return

    assignee_name = ''
    try:
        from apps.identity.models import Account
        acct = Account.objects.filter(id=wo.effective_assigned_to).first()
        if acct:
            assignee_name = acct.display_name or acct.username
    except Exception:
        pass

    title = f'✅ 工单已完成: {wo.title}'
    content = (
        f'**工单**: {wo.title} (#{wo.id})\n'
        f'**执行人**: {assignee_name or f"用户#{wo.effective_assigned_to}"}\n'
        f'**完成时间**: {wo.completed_at.strftime("%Y-%m-%d %H:%M") if wo.completed_at else "-"}'
    )

    for sid in supervisor_ids:
        try:
            send_notification(
                recipient_id=sid,
                title=title,
                content=content,
                source_type='workorder_completed',
                source_id=wo.id,
            )
            logger.info(f'工单#{wo.id} 完成通知已发送给主管#{sid}')
        except Exception as e:
            logger.error(f'工单#{wo.id} 通知主管#{sid} 失败: {e}')


def detect_overdue_workorders(threshold_hours: int = 24) -> list:
    """
    检测超过阈值时间未完成的工单，并自动创建升级通知。

    Args:
        threshold_hours: 逾期阈值（小时），默认 24 小时

    Returns:
        逾期工单列表，每项包含 id、title、hours_overdue、assigned_to、notification_sent
    """
    from datetime import timedelta

    now = timezone.now()
    cutoff = now - timedelta(hours=threshold_hours)

    overdue_statuses = [
        WorkOrderStatus.PENDING,
        WorkOrderStatus.ASSIGNED,
        WorkOrderStatus.IN_PROGRESS,
    ]
    overdue_qs = WorkOrder.objects.filter(
        is_deleted=False,
        status__in=overdue_statuses,
    ).filter(
        models.Q(due_date__lt=now) |
        models.Q(due_date__isnull=True, create_time__lt=cutoff)
    ).order_by('create_time')

    result = []
    for wo in overdue_qs:
        if wo.due_date:
            due_dt = wo.due_date if isinstance(wo.due_date, datetime) else datetime.combine(
                wo.due_date, datetime.min.time(), tzinfo=timezone.utc,
            )
            hours_overdue = (now - due_dt).total_seconds() / 3600
        else:
            hours_overdue = (now - wo.create_time).total_seconds() / 3600

        notification_sent = False
        try:
            from apps.notification.services import send_notification
            assignee_id = wo.effective_assigned_to
            if assignee_id:
                send_notification(
                    recipient_id=assignee_id,
                    title=f'⚠️ 工单逾期提醒: {wo.title}',
                    content=(
                        f'工单 #{wo.id}「{wo.title}」已逾期 {hours_overdue:.1f} 小时，'
                        f'请尽快处理。'
                    ),
                    source_type='workorder_overdue',
                    source_id=wo.id,
                )
                notification_sent = True

            supervisor_ids = _get_supervisor_account_ids()
            for sid in supervisor_ids:
                send_notification(
                    recipient_id=sid,
                    title=f'⚠️ 工单逾期升级: {wo.title}',
                    content=(
                        f'工单 #{wo.id}「{wo.title}」已逾期 {hours_overdue:.1f} 小时。'
                        f'执行人: #{assignee_id or "未分配"}'
                    ),
                    source_type='workorder_overdue_escalation',
                    source_id=wo.id,
                )
        except Exception as e:
            logger.warning(f'逾期通知发送失败: wo={wo.id}, error={e}')

        result.append({
            'id': wo.id,
            'title': wo.title,
            'status': wo.status,
            'hours_overdue': round(hours_overdue, 1),
            'assigned_to': wo.effective_assigned_to,
            'due_date': wo.due_date.isoformat() if wo.due_date else None,
            'create_time': wo.create_time.isoformat(),
            'notification_sent': notification_sent,
        })

    logger.info(f'逾期工单检测: threshold={threshold_hours}h, found={len(result)}')
    return result


def _get_supervisor_account_ids() -> list:
    """获取所有 CRC 主管的 account ID"""
    try:
        from apps.identity.models import AccountRole
        return list(
            AccountRole.objects.filter(
                role__name='crc_supervisor',
            ).values_list('account_id', flat=True).distinct()
        )
    except Exception as e:
        logger.warning(f'获取 CRC 主管列表失败: {e}')
        return []
