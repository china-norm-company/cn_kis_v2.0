"""
工单派发服务

封装资质校验派工的 5 项规则逻辑：
1. GCP 证书有效性（硬拦截）
2. 检测方法资质 >= independent（硬拦截）
3. 设备操作授权有效（硬拦截）
4. 排班时间冲突（软预警）
5. 工时超负荷（软预警）
"""
import logging
from typing import Optional
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum, Q

from apps.hr.models import Staff, GCPStatus
from apps.workorder.models import WorkOrder, WorkOrderAssignment
from apps.lab_personnel.models import (
    LabStaffProfile, StaffCertificate, MethodQualification,
    CertificateStatus, MethodQualLevel,
)
from apps.lab_personnel.models_scheduling import ShiftSlot
from apps.lab_personnel.models_worktime import WorkTimeSummary

logger = logging.getLogger(__name__)


def _check_gcp_valid(staff: Staff) -> dict:
    """校验 1：GCP 证书有效性"""
    if staff.gcp_status in (GCPStatus.EXPIRED, GCPStatus.NONE):
        return {
            'rule': 'gcp_certificate',
            'passed': False,
            'severity': 'error',
            'message': f'GCP证书{"已过期" if staff.gcp_status == GCPStatus.EXPIRED else "不存在"}',
        }

    # 也检查 StaffCertificate 中的 GCP 是否被锁定
    locked_gcp = StaffCertificate.objects.filter(
        staff=staff, cert_type='gcp', is_locked=True
    ).exists()
    if locked_gcp:
        return {
            'rule': 'gcp_certificate',
            'passed': False,
            'severity': 'error',
            'message': 'GCP证书已锁定（过期/撤销）',
        }

    return {
        'rule': 'gcp_certificate',
        'passed': True,
        'severity': 'ok',
        'message': 'GCP证书有效',
    }


def _check_method_qualification(staff: Staff, workorder: WorkOrder) -> dict:
    """校验 2：检测方法资质 >= independent"""
    # 从工单关联的活动中获取所需方法
    if not workorder.visit_activity_id:
        return {
            'rule': 'method_qualification',
            'passed': True,
            'severity': 'ok',
            'message': '工单无方法要求（跳过）',
        }

    # 获取工单关联的检测方法
    from apps.resource.models_detection_method import DetectionMethodPersonnel
    method_reqs = DetectionMethodPersonnel.objects.filter(
        method__activity_templates__visit_activities__id=workorder.visit_activity_id,
        level='required',
    ).select_related('method')

    if not method_reqs.exists():
        return {
            'rule': 'method_qualification',
            'passed': True,
            'severity': 'ok',
            'message': '工单无方法资质要求',
        }

    missing_methods = []
    for req in method_reqs:
        has_qual = MethodQualification.objects.filter(
            staff=staff,
            method=req.method,
            level__in=[MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR],
        ).exists()
        if not has_qual:
            missing_methods.append(req.method.name)

    if missing_methods:
        return {
            'rule': 'method_qualification',
            'passed': False,
            'severity': 'error',
            'message': f'缺少以下方法独立执行资质：{", ".join(missing_methods)}',
        }

    return {
        'rule': 'method_qualification',
        'passed': True,
        'severity': 'ok',
        'message': '方法资质满足',
    }


def _check_equipment_authorization(staff: Staff, workorder: WorkOrder) -> dict:
    """校验 3：设备操作授权有效"""
    if not staff.account_id:
        return {
            'rule': 'equipment_authorization',
            'passed': True,
            'severity': 'ok',
            'message': '人员无关联账户（跳过设备授权检查）',
        }

    from apps.resource.models import EquipmentAuthorization

    # 获取工单所需的设备（通过活动 BOM）
    if not workorder.visit_activity_id:
        return {
            'rule': 'equipment_authorization',
            'passed': True,
            'severity': 'ok',
            'message': '工单无设备要求（跳过）',
        }

    from apps.resource.models import ActivityBOM
    required_equipment = ActivityBOM.objects.filter(
        template__visit_activities__id=workorder.visit_activity_id,
        resource_category__resource_type='equipment',
        is_mandatory=True,
    ).select_related('resource_category')

    if not required_equipment.exists():
        return {
            'rule': 'equipment_authorization',
            'passed': True,
            'severity': 'ok',
            'message': '工单无设备授权要求',
        }

    today = date.today()
    unauthorized = []
    for bom in required_equipment:
        auth_exists = EquipmentAuthorization.objects.filter(
            operator_id=staff.account_id,
            equipment__category=bom.resource_category,
            is_active=True,
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gte=today)
        ).exists()

        if not auth_exists:
            unauthorized.append(bom.resource_category.name)

    if unauthorized:
        return {
            'rule': 'equipment_authorization',
            'passed': False,
            'severity': 'error',
            'message': f'缺少以下设备操作授权：{", ".join(unauthorized)}',
        }

    return {
        'rule': 'equipment_authorization',
        'passed': True,
        'severity': 'ok',
        'message': '设备授权满足',
    }


def _check_shift_conflict(staff: Staff, workorder: WorkOrder) -> dict:
    """校验 4：排班时间冲突"""
    scheduled_date = workorder.scheduled_date
    if not scheduled_date:
        return {
            'rule': 'shift_conflict',
            'passed': True,
            'severity': 'ok',
            'message': '工单无排程日期（跳过）',
        }

    existing_slots = ShiftSlot.objects.filter(
        staff=staff, shift_date=scheduled_date,
    ).count()

    if existing_slots > 0:
        return {
            'rule': 'shift_conflict',
            'passed': True,
            'severity': 'warning',
            'message': f'该日已有 {existing_slots} 个排班时间槽，请注意时间安排',
        }

    return {
        'rule': 'shift_conflict',
        'passed': True,
        'severity': 'ok',
        'message': '无排班冲突',
    }


def _check_workload(staff: Staff) -> dict:
    """校验 5：工时超负荷"""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    summary = WorkTimeSummary.objects.filter(
        staff=staff, week_start_date=week_start,
    ).first()

    if not summary:
        return {
            'rule': 'workload',
            'passed': True,
            'severity': 'ok',
            'message': '本周无工时记录',
        }

    if summary.utilization_rate > 85:
        return {
            'rule': 'workload',
            'passed': True,
            'severity': 'warning',
            'message': f'本周工时利用率已达 {summary.utilization_rate}%，接近超负荷',
        }

    return {
        'rule': 'workload',
        'passed': True,
        'severity': 'ok',
        'message': f'工时利用率 {summary.utilization_rate}%，正常',
    }


def dispatch_assign(
    workorder_id: int,
    staff_id: int,
    force: bool = False,
    assigned_by_id: int = None,
) -> dict:
    """
    资质校验派工

    执行 5 项校验规则后分配工单。
    """
    workorder = WorkOrder.objects.filter(id=workorder_id).first()
    if not workorder:
        return {'success': False, 'msg': '工单不存在', 'checks': []}

    staff = Staff.objects.filter(id=staff_id, is_deleted=False).first()
    if not staff:
        return {'success': False, 'msg': '人员不存在', 'checks': []}

    # 执行 5 项校验
    checks = [
        _check_gcp_valid(staff),
        _check_method_qualification(staff, workorder),
        _check_equipment_authorization(staff, workorder),
        _check_shift_conflict(staff, workorder),
        _check_workload(staff),
    ]

    # 检查硬拦截
    errors = [c for c in checks if c['severity'] == 'error']
    warnings = [c for c in checks if c['severity'] == 'warning']

    if errors and not force:
        return {
            'success': False,
            'msg': f'资质校验未通过：{errors[0]["message"]}',
            'checks': checks,
        }

    if warnings and not force:
        return {
            'success': False,
            'msg': f'存在预警：{warnings[0]["message"]}（可强制分配）',
            'checks': checks,
        }

    # 创建分配记录
    assignment = WorkOrderAssignment.objects.create(
        work_order=workorder,
        assigned_to_id=staff.account_id or staff.id,
        assigned_by_id=assigned_by_id,
        reason='qualified_dispatch',
    )

    # 更新工单状态
    workorder.assigned_to = staff.account_id or staff.id
    workorder.status = 'assigned'
    workorder.save(update_fields=['assigned_to', 'status', 'update_time'])

    # 飞书集成：创建工单执行任务
    from .feishu_integration_service import create_workorder_task
    try:
        create_workorder_task(workorder_id, staff)
    except Exception as e:
        logger.error(f'工单#{workorder_id} 飞书任务创建失败（派工已完成）: {e}')

    return {
        'success': True,
        'msg': '派工成功',
        'checks': checks,
        'data': {
            'assignment_id': assignment.id,
            'workorder_id': workorder.id,
            'staff_id': staff.id,
            'staff_name': staff.name,
        },
    }


def get_dispatch_candidates(workorder_id: int) -> dict:
    """获取工单候选执行人（自动过滤不合格人员）"""
    workorder = WorkOrder.objects.filter(id=workorder_id).first()
    if not workorder:
        return {'candidates': [], 'workorder_not_found': True}

    profiles = LabStaffProfile.objects.filter(
        is_active=True, staff__is_deleted=False,
    ).select_related('staff')

    candidates = []
    for profile in profiles:
        staff = profile.staff

        # 基础校验：GCP 必须有效
        gcp_check = _check_gcp_valid(staff)
        if not gcp_check['passed']:
            continue

        candidates.append({
            'staff_id': staff.id,
            'name': staff.name,
            'position': staff.position,
            'lab_role': profile.lab_role,
            'competency_level': profile.competency_level,
            'gcp_status': staff.gcp_status,
        })

    return {'candidates': candidates, 'total': len(candidates)}


def get_dispatch_monitor() -> dict:
    """执行监控面板"""
    from apps.workorder.models import WorkOrderStatus

    today = date.today()

    # 今日工单状态统计
    today_orders = WorkOrder.objects.filter(scheduled_date=today)
    pending = today_orders.filter(status=WorkOrderStatus.PENDING).count()
    assigned = today_orders.filter(status=WorkOrderStatus.ASSIGNED).count()
    in_progress = today_orders.filter(status=WorkOrderStatus.IN_PROGRESS).count()
    completed = today_orders.filter(status=WorkOrderStatus.COMPLETED).count()

    return {
        'date': today.isoformat(),
        'total_today': today_orders.count(),
        'pending': pending,
        'assigned': assigned,
        'in_progress': in_progress,
        'completed': completed,
    }
