"""
设备管理工作台（器衡）业务服务

覆盖设备台账、校准管理、维护工单、使用记录、操作授权、检测方法的完整业务逻辑。
"""
import logging
from datetime import date, timedelta, datetime
from typing import Optional
from django.db.models import Q, Count, Avg, F, Value, CharField
from django.db.models.functions import Coalesce
from django.utils import timezone

from ..models import (
    ResourceItem, ResourceCategory, ResourceStatus, ResourceType,
    EquipmentCalibration, EquipmentVerification, EquipmentMaintenance, EquipmentUsage,
    EquipmentAuthorization,
)
from ..models_detection_method import (
    DetectionMethodTemplate, DetectionMethodResource, DetectionMethodPersonnel,
    MethodStatus, MethodCategory,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 辅助：设备基础查询集
# ============================================================================
def _equipment_qs():
    """返回设备类型的 ResourceItem 基础查询集"""
    return ResourceItem.objects.filter(
        is_deleted=False,
        category__resource_type=ResourceType.EQUIPMENT,
    ).select_related('category')


# ============================================================================
# 仪表盘
# ============================================================================
def get_dashboard() -> dict:
    """设备管理总览面板"""
    today = timezone.now().date()
    eq_qs = _equipment_qs()

    total = eq_qs.count()
    status_counts = dict(
        eq_qs.values_list('status').annotate(c=Count('id')).values_list('status', 'c')
    )

    # 校准预警
    overdue = eq_qs.filter(
        next_calibration_date__isnull=False,
        next_calibration_date__lt=today,
    ).count()
    due_7 = eq_qs.filter(
        next_calibration_date__isnull=False,
        next_calibration_date__gte=today,
        next_calibration_date__lte=today + timedelta(days=7),
    ).count()
    due_30 = eq_qs.filter(
        next_calibration_date__isnull=False,
        next_calibration_date__gte=today,
        next_calibration_date__lte=today + timedelta(days=30),
    ).count()

    # 维护工单概览
    maint_pending = EquipmentMaintenance.objects.filter(status='pending').count()
    maint_in_progress = EquipmentMaintenance.objects.filter(status='in_progress').count()
    maint_completed_month = EquipmentMaintenance.objects.filter(
        status='completed',
        completed_at__month=today.month,
        completed_at__year=today.year,
    ).count()
    maint_sla_overdue = EquipmentMaintenance.objects.filter(
        status__in=['pending', 'in_progress'],
        create_time__lt=timezone.now() - timedelta(hours=48),
    ).count()

    # 最近活动
    recent_cals = EquipmentCalibration.objects.select_related('equipment').order_by('-create_time')[:3]
    recent_maints = EquipmentMaintenance.objects.select_related('equipment').order_by('-create_time')[:3]

    recent_activities = []
    for c in recent_cals:
        recent_activities.append({
            'type': 'calibration',
            'equipment_name': c.equipment.name,
            'description': f'校准完成，结果：{c.get_result_display() if hasattr(c, "get_result_display") else c.result}',
            'time': c.create_time.isoformat(),
        })
    for m in recent_maints:
        recent_activities.append({
            'type': 'maintenance',
            'equipment_name': m.equipment.name,
            'description': m.title or m.description[:50],
            'time': m.create_time.isoformat(),
        })
    recent_activities.sort(key=lambda x: x['time'], reverse=True)

    # 今日使用
    today_usages = EquipmentUsage.objects.filter(usage_date=today).count()
    active_usages = EquipmentUsage.objects.filter(
        start_time__isnull=False, end_time__isnull=True,
    ).count()

    return {
        'summary': {
            'total': total,
            'active': status_counts.get('active', 0),
            'maintenance': status_counts.get('maintenance', 0),
            'calibrating': status_counts.get('calibrating', 0),
            'idle': status_counts.get('idle', 0),
            'retired': status_counts.get('retired', 0),
        },
        'calibration_alerts': {
            'overdue': overdue,
            'due_in_7_days': due_7,
            'due_in_30_days': due_30,
        },
        'maintenance_overview': {
            'pending': maint_pending,
            'in_progress': maint_in_progress,
            'completed_this_month': maint_completed_month,
            'sla_overdue_count': maint_sla_overdue,
        },
        'recent_activities': recent_activities[:5],
        'usage_today': {
            'total_uses': today_usages,
            'active_now': active_usages,
        },
        'sla': {
            'maintenance_response_hours_target': 48,
            'maintenance_overdue_count': maint_sla_overdue,
        },
    }


# ============================================================================
# 设备台账
# ============================================================================
def list_equipment(
    keyword: str = None,
    category_id: int = None,
    status: str = None,
    calibration_status: str = None,
    location: str = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = '-create_time',
    lims_only: bool = None,
) -> dict:
    """设备列表（增强筛选，支持 lims_only 过滤 LIMS 导入数据）"""
    today = timezone.now().date()
    qs = _equipment_qs()

    if keyword:
        qs = qs.filter(
            Q(name__icontains=keyword) |
            Q(code__icontains=keyword) |
            Q(model_number__icontains=keyword) |
            Q(serial_number__icontains=keyword)
        )
    if category_id:
        qs = qs.filter(category_id=category_id)
    if status:
        qs = qs.filter(status=status)
    if location:
        qs = qs.filter(location__icontains=location)
    if calibration_status:
        if calibration_status == 'overdue':
            qs = qs.filter(next_calibration_date__lt=today)
        elif calibration_status == 'expiring':
            qs = qs.filter(
                next_calibration_date__gte=today,
                next_calibration_date__lte=today + timedelta(days=30),
            )
        elif calibration_status == 'valid':
            qs = qs.filter(next_calibration_date__gt=today + timedelta(days=30))

    # LIMS 来源过滤：通过 properties 字段的 _lims_source 标记
    if lims_only is True:
        qs = qs.filter(properties__contains={'_lims_source': True})
    elif lims_only is False:
        qs = qs.exclude(properties__contains={'_lims_source': True})

    # 排序
    allowed_sorts = {
        'name', '-name', 'code', '-code', 'create_time', '-create_time',
        'next_calibration_date', '-next_calibration_date', 'status', '-status',
    }
    if sort_by not in allowed_sorts:
        sort_by = '-create_time'
    qs = qs.order_by(sort_by)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    # 批量获取授权人数和 30 天使用次数
    item_ids = [i.id for i in items]
    auth_counts = dict(
        EquipmentAuthorization.objects.filter(
            equipment_id__in=item_ids, is_active=True,
        ).values_list('equipment_id').annotate(c=Count('id')).values_list('equipment_id', 'c')
    )
    usage_counts = dict(
        EquipmentUsage.objects.filter(
            equipment_id__in=item_ids,
            usage_date__gte=today - timedelta(days=30),
        ).values_list('equipment_id').annotate(c=Count('id')).values_list('equipment_id', 'c')
    )

    result_items = []
    for item in items:
        cal_info = _get_calibration_info(item, today)
        attrs = item.attributes or {}
        result_items.append({
            'id': item.id,
            'name': item.name,
            'code': item.code,
            'category_id': item.category_id,
            'category_name': item.category.name if item.category else '',
            'status': item.status,
            'status_display': item.get_status_display(),
            'location': item.location,
            'manufacturer': item.manufacturer,
            'model_number': item.model_number,
            'serial_number': item.serial_number,
            'purchase_date': str(item.purchase_date) if item.purchase_date else None,
            'warranty_expiry': str(item.warranty_expiry) if item.warranty_expiry else None,
            'calibration_info': cal_info,
            'authorized_operators_count': auth_counts.get(item.id, 0),
            'usage_count_30d': usage_counts.get(item.id, 0),
            'manager_id': item.manager_id,
            'create_time': item.create_time.isoformat(),
            'attributes': attrs,
            'organization': attrs.get('organization', ''),
            'lims_code': attrs.get('lims_code', ''),
            'unit': attrs.get('unit', ''),
            'quantity': attrs.get('quantity'),
            'initial_value': attrs.get('initial_value'),
            'group': attrs.get('group', ''),
        })

    return {'items': result_items, 'total': total, 'page': page, 'page_size': page_size}


def _get_calibration_info(item: ResourceItem, today: date) -> dict:
    """计算设备校准状态信息"""
    if not item.next_calibration_date:
        return {'last_date': None, 'next_due_date': None, 'days_remaining': None, 'status': 'unknown'}

    days_remaining = (item.next_calibration_date - today).days
    if days_remaining < 0:
        cal_status = 'overdue'
    elif days_remaining <= 7:
        cal_status = 'urgent'
    elif days_remaining <= 30:
        cal_status = 'expiring'
    else:
        cal_status = 'valid'

    return {
        'last_date': str(item.last_calibration_date) if item.last_calibration_date else None,
        'next_due_date': str(item.next_calibration_date),
        'days_remaining': days_remaining,
        'status': cal_status,
    }


def get_equipment_detail(equipment_id: int) -> Optional[dict]:
    """设备详情（含校准/维护/使用历史摘要）"""
    item = _equipment_qs().filter(id=equipment_id).first()
    if not item:
        return None

    today = timezone.now().date()
    cal_info = _get_calibration_info(item, today)

    recent_calibrations = list(
        EquipmentCalibration.objects.filter(equipment=item).order_by('-calibration_date')[:5].values(
            'id', 'calibration_type', 'calibration_date', 'next_due_date',
            'calibrator', 'certificate_no', 'certificate_file_url', 'result', 'notes', 'create_time',
        )
    )
    recent_maintenances = list(
        EquipmentMaintenance.objects.filter(equipment=item).order_by('-maintenance_date')[:5].values(
            'id', 'title', 'maintenance_type', 'status', 'maintenance_date',
            'description', 'performed_by', 'cost', 'create_time',
        )
    )
    recent_usages = list(
        EquipmentUsage.objects.filter(equipment=item).order_by('-usage_date')[:5].values(
            'id', 'usage_type', 'usage_date', 'start_time', 'end_time',
            'duration_minutes', 'operator_id', 'operator_name', 'notes', 'create_time',
        )
    )
    authorizations = list(
        EquipmentAuthorization.objects.filter(equipment=item, is_active=True).values(
            'id', 'operator_id', 'operator_name', 'authorized_at', 'expires_at', 'notes',
        )
    )

    return {
        'id': item.id,
        'name': item.name,
        'code': item.code,
        'category_id': item.category_id,
        'category_name': item.category.name if item.category else '',
        'category_path': item.category.full_path if item.category else '',
        'status': item.status,
        'status_display': item.get_status_display(),
        'location': item.location,
        'manufacturer': item.manufacturer,
        'model_number': item.model_number,
        'serial_number': item.serial_number,
        'purchase_date': str(item.purchase_date) if item.purchase_date else None,
        'warranty_expiry': str(item.warranty_expiry) if item.warranty_expiry else None,
        'calibration_cycle_days': item.calibration_cycle_days,
        'calibration_info': cal_info,
        'manager_id': item.manager_id,
        'attributes': item.attributes,
        'create_time': item.create_time.isoformat(),
        'recent_calibrations': recent_calibrations,
        'recent_maintenances': recent_maintenances,
        'recent_usages': recent_usages,
        'authorizations': authorizations,
    }


def create_equipment(
    name: str, code: str, category_id: int, **kwargs,
) -> ResourceItem:
    """新增设备"""
    return ResourceItem.objects.create(
        name=name, code=code, category_id=category_id,
        status=kwargs.pop('status', ResourceStatus.ACTIVE),
        **kwargs,
    )


def update_equipment(equipment_id: int, **kwargs) -> Optional[ResourceItem]:
    """更新设备信息"""
    item = _equipment_qs().filter(id=equipment_id).first()
    if not item:
        return None
    for k, v in kwargs.items():
        if hasattr(item, k):
            setattr(item, k, v)
    item.save()
    return item


def retire_equipment(equipment_id: int) -> Optional[dict]:
    """设备报废"""
    item = _equipment_qs().filter(id=equipment_id).first()
    if not item:
        return {'error': '设备不存在'}
    if item.status == ResourceStatus.RETIRED:
        return {'error': '设备已报废'}
    item.status = ResourceStatus.RETIRED
    item.save(update_fields=['status', 'update_time'])
    return {'id': item.id, 'status': item.status}


def change_equipment_status(equipment_id: int, new_status: str, reason: str = '') -> Optional[dict]:
    """变更设备状态"""
    item = _equipment_qs().filter(id=equipment_id).first()
    if not item:
        return {'error': '设备不存在'}
    valid_statuses = [s[0] for s in ResourceStatus.choices]
    if new_status not in valid_statuses:
        return {'error': f'无效状态: {new_status}'}
    old_status = item.status
    item.status = new_status
    item.save(update_fields=['status', 'update_time'])
    logger.info(f'设备 {item.code} 状态变更: {old_status} → {new_status}, 原因: {reason}')
    return {'id': item.id, 'old_status': old_status, 'new_status': new_status}


# ============================================================================
# 校准管理
# ============================================================================
def _month_start(d: date) -> date:
    """当月1日"""
    return date(d.year, d.month, 1)


def _end_of_next_month(d: date) -> date:
    """下月末。例如 2月1日 -> 3月31日"""
    if d.month == 12:
        return date(d.year + 1, 1, 31)  # 次年1月31
    return date(d.year, d.month + 2, 1) - timedelta(days=1)  # 下下月1日-1


def get_pending_calibration_work_orders(reference_date: date = None) -> list:
    """
    获取待发起校准工单的设备列表。

    规则：每月初（参考日=当月1日），校准下次到期日 <= 下月末 的设备，
    且尚未存在待处理/处理中的校准工单。
    例如：2月1日应收到 校准下次到期日为3月31日之前 的所有未发起工单。
    """
    ref = reference_date or _month_start(timezone.now().date())
    cutoff = _end_of_next_month(ref)

    eq_qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_calibration_date__isnull=False,
        next_calibration_date__lte=cutoff,
    )

    # 已有校准工单（pending/in_progress）的设备+到期日组合
    existing = set(
        EquipmentMaintenance.objects.filter(
            maintenance_type='calibration',
            status__in=['pending', 'in_progress'],
            calibration_due_date__isnull=False,
        ).values_list('equipment_id', 'calibration_due_date')
    )

    items = []
    for eq in eq_qs:
        due = eq.next_calibration_date
        if (eq.id, due) in existing:
            continue
        items.append({
            'id': eq.id,
            'name': eq.name,
            'code': eq.code,
            'next_calibration_date': str(due),
            'location': eq.location or '',
        })
    return items


def create_calibration_work_orders(equipment_ids: list, reference_date: date = None) -> dict:
    """
    为指定设备批量发起校准工单。
    仅对在 get_pending_calibration_work_orders 范围内的设备创建。
    """
    ref = reference_date or _month_start(timezone.now().date())
    pending = {p['id']: p for p in get_pending_calibration_work_orders(ref)}
    created = []
    skipped = []

    for eid in equipment_ids:
        if eid not in pending:
            skipped.append(eid)
            continue
        p = pending[eid]
        equip = _equipment_qs().filter(id=eid).first()
        if not equip:
            skipped.append(eid)
            continue

        due = date.fromisoformat(p['next_calibration_date']) if isinstance(p['next_calibration_date'], str) else p['next_calibration_date']
        m = EquipmentMaintenance.objects.create(
            equipment=equip,
            maintenance_type='calibration',
            title=f'校准计划：{equip.name} - 到期日 {due}',
            description=f'设备 {equip.code} 校准到期日 {due}，请安排校准。',
            maintenance_date=ref,
            status='pending',
            calibration_due_date=due,
        )
        created.append({'id': m.id, 'equipment_id': eid, 'calibration_due_date': str(due)})
        pending.pop(eid, None)  # 避免重复

    return {'created': created, 'skipped': skipped}


def get_calibration_plan() -> dict:
    """校准计划视图 — 本月待校准/逾期/即将到期 + 待办校准工单"""
    today = timezone.now().date()
    month_end = date(today.year, today.month + 1, 1) - timedelta(days=1) if today.month < 12 \
        else date(today.year, 12, 31)

    eq_qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED)

    overdue_items = list(eq_qs.filter(
        next_calibration_date__isnull=False,
        next_calibration_date__lt=today,
    ).values('id', 'name', 'code', 'next_calibration_date', 'location'))

    due_7_items = list(eq_qs.filter(
        next_calibration_date__gte=today,
        next_calibration_date__lte=today + timedelta(days=7),
    ).values('id', 'name', 'code', 'next_calibration_date', 'location'))

    due_month_items = list(eq_qs.filter(
        next_calibration_date__gte=today,
        next_calibration_date__lte=month_end,
    ).values('id', 'name', 'code', 'next_calibration_date', 'location'))

    # 待办校准工单：提前1个月，每月初应发起的工单（下次到期日<=下月末）
    pending_work_orders = get_pending_calibration_work_orders(today)

    return {
        'overdue': {'count': len(overdue_items), 'items': overdue_items},
        'due_in_7_days': {'count': len(due_7_items), 'items': due_7_items},
        'due_this_month': {'count': len(due_month_items), 'items': due_month_items},
        'pending_work_orders': {'count': len(pending_work_orders), 'items': pending_work_orders},
    }


def list_calibration_plans(
    keyword: str = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    校准计划列表 — 展示已导入的校准计划（有 next_calibration_date 的设备）
    包含：设备编号、设备名称、设备状态、设备规格/型号、出厂编号、溯源方式、
    校准方式、校准机构、校准方法、校准周期、上次/下次校准时间、
    校准提前提醒天数、校准提醒人员、量值溯源参数
    """
    qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_calibration_date__isnull=False,
    ).order_by('next_calibration_date')

    if keyword:
        qs = qs.filter(
            Q(name__icontains=keyword) |
            Q(code__icontains=keyword) |
            Q(model_number__icontains=keyword) |
            Q(serial_number__icontains=keyword)
        )

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    attrs_keys = [
        'traceability', 'calibration_method', 'calibration_institution',
        'calibration_procedure', 'reminder_days', 'reminder_person', 'traceability_params',
    ]

    result = []
    for eq in items:
        attrs = eq.attributes or {}
        result.append({
            'id': eq.id,
            'code': eq.code,
            'name': eq.name,
            'status': eq.status,
            'status_display': eq.get_status_display(),
            'model_number': eq.model_number or '/',
            'serial_number': eq.serial_number or '/',
            'traceability': attrs.get('traceability', '') or '校准',
            'calibration_method': attrs.get('calibration_method', '') or '-',
            'calibration_institution': attrs.get('calibration_institution', '') or '-',
            'calibration_procedure': attrs.get('calibration_procedure', '') or '-',
            'calibration_cycle_days': eq.calibration_cycle_days or 365,
            'last_calibration_date': str(eq.last_calibration_date) if eq.last_calibration_date else '-',
            'next_calibration_date': str(eq.next_calibration_date),
            'reminder_days': attrs.get('reminder_days') or 30,
            'reminder_person': attrs.get('reminder_person', '') or '-',
            'traceability_params': attrs.get('traceability_params', '') or '明细',
        })

    return {'items': result, 'total': total, 'page': page, 'page_size': page_size}


def list_calibrations(
    equipment_id: int = None,
    result: str = None,
    date_from: str = None,
    date_to: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """校准记录列表"""
    qs = EquipmentCalibration.objects.select_related('equipment').all()
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    if result:
        qs = qs.filter(result=result)
    if date_from:
        qs = qs.filter(calibration_date__gte=date_from)
    if date_to:
        qs = qs.filter(calibration_date__lte=date_to)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {
        'items': [{
            'id': c.id,
            'equipment_id': c.equipment_id,
            'equipment_name': c.equipment.name,
            'equipment_code': c.equipment.code,
            'calibration_type': c.calibration_type,
            'calibration_date': str(c.calibration_date),
            'next_due_date': str(c.next_due_date),
            'calibrator': c.calibrator,
            'certificate_no': c.certificate_no,
            'certificate_file_url': c.certificate_file_url,
            'result': c.result,
            'notes': c.notes,
            'create_time': c.create_time.isoformat(),
        } for c in items],
        'total': total, 'page': page, 'page_size': page_size,
    }


def create_calibration(
    equipment_id: int,
    calibration_date: str,
    next_due_date: str,
    calibration_type: str = 'internal',
    calibrator: str = '',
    certificate_no: str = '',
    certificate_file_url: str = '',
    result: str = 'pass',
    notes: str = '',
) -> Optional[dict]:
    """新增校准记录，同步更新设备状态"""
    equip = _equipment_qs().filter(id=equipment_id).first()
    if not equip:
        return {'error': '设备不存在'}

    cal_date = date.fromisoformat(calibration_date)
    due_date = date.fromisoformat(next_due_date)

    cal = EquipmentCalibration.objects.create(
        equipment=equip,
        calibration_type=calibration_type,
        calibration_date=cal_date,
        next_due_date=due_date,
        calibrator=calibrator,
        certificate_no=certificate_no,
        certificate_file_url=certificate_file_url,
        result=result,
        notes=notes,
    )

    # 更新设备校准字段
    equip.last_calibration_date = cal_date
    equip.next_calibration_date = due_date
    update_fields = ['last_calibration_date', 'next_calibration_date', 'update_time']

    # 校准不通过 → 设备进入维护状态
    if result == 'fail':
        equip.status = ResourceStatus.MAINTENANCE
        update_fields.append('status')

    # 校准通过且设备处于校准中 → 恢复在用
    if result == 'pass' and equip.status == ResourceStatus.CALIBRATING:
        equip.status = ResourceStatus.ACTIVE
        update_fields.append('status')

    equip.save(update_fields=update_fields)
    try:
        from .feishu_integration_service import EquipmentFeishuService
        EquipmentFeishuService.sync_calibration_to_calendar(equip)
    except Exception as e:
        logger.warning(f'同步校准计划到飞书失败: {e}')

    return {
        'id': cal.id,
        'equipment_id': equip.id,
        'calibration_date': str(cal.calibration_date),
        'next_due_date': str(cal.next_due_date),
        'result': cal.result,
        'equipment_status': equip.status,
    }


def get_calibration_detail(calibration_id: int) -> Optional[dict]:
    """校准记录详情"""
    cal = EquipmentCalibration.objects.select_related('equipment').filter(id=calibration_id).first()
    if not cal:
        return None
    return {
        'id': cal.id,
        'equipment_id': cal.equipment_id,
        'equipment_name': cal.equipment.name,
        'equipment_code': cal.equipment.code,
        'calibration_type': cal.calibration_type,
        'calibration_date': str(cal.calibration_date),
        'next_due_date': str(cal.next_due_date),
        'calibrator': cal.calibrator,
        'certificate_no': cal.certificate_no,
        'certificate_file_url': cal.certificate_file_url,
        'result': cal.result,
        'notes': cal.notes,
        'create_time': cal.create_time.isoformat(),
    }


# ============================================================================
# 核查计划
# ============================================================================
def get_verification_plan() -> dict:
    """核查计划视图 — 逾期/7日内/本月到期 + 待办核查工单"""
    today = timezone.now().date()
    month_end = date(today.year, today.month + 1, 1) - timedelta(days=1) if today.month < 12 \
        else date(today.year, 12, 31)

    eq_qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_verification_date__isnull=False,
    )

    overdue_items = list(eq_qs.filter(next_verification_date__lt=today).values(
        'id', 'name', 'code', 'next_verification_date', 'location'))
    due_7_items = list(eq_qs.filter(
        next_verification_date__gte=today,
        next_verification_date__lte=today + timedelta(days=7),
    ).values('id', 'name', 'code', 'next_verification_date', 'location'))
    due_month_items = list(eq_qs.filter(
        next_verification_date__gte=today,
        next_verification_date__lte=month_end,
    ).values('id', 'name', 'code', 'next_verification_date', 'location'))
    pending_work_orders = get_pending_verification_work_orders(today)

    return {
        'overdue': {'count': len(overdue_items), 'items': overdue_items},
        'due_in_7_days': {'count': len(due_7_items), 'items': due_7_items},
        'due_this_month': {'count': len(due_month_items), 'items': due_month_items},
        'pending_work_orders': {'count': len(pending_work_orders), 'items': pending_work_orders},
    }


def get_pending_verification_work_orders(reference_date: date = None) -> list:
    """待发起核查工单：下次核查日<=下月末，且尚未发起"""
    ref = reference_date or _month_start(timezone.now().date())
    cutoff = _end_of_next_month(ref)
    eq_qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_verification_date__isnull=False,
        next_verification_date__lte=cutoff,
    )
    existing = set(
        EquipmentMaintenance.objects.filter(
            maintenance_type='verification',
            status__in=['pending', 'in_progress'],
            verification_due_date__isnull=False,
        ).values_list('equipment_id', 'verification_due_date')
    )
    items = []
    for eq in eq_qs:
        due = eq.next_verification_date
        if (eq.id, due) in existing:
            continue
        items.append({
            'id': eq.id, 'name': eq.name, 'code': eq.code,
            'next_verification_date': str(due), 'location': eq.location or '',
        })
    return items


def create_verification_work_orders(equipment_ids: list, reference_date: date = None) -> dict:
    """为指定设备批量发起核查工单"""
    ref = reference_date or _month_start(timezone.now().date())
    pending = {p['id']: p for p in get_pending_verification_work_orders(ref)}
    created, skipped = [], []
    for eid in equipment_ids:
        if eid not in pending:
            skipped.append(eid)
            continue
        p = pending[eid]
        equip = _equipment_qs().filter(id=eid).first()
        if not equip:
            skipped.append(eid)
            continue
        due = date.fromisoformat(p['next_verification_date']) if isinstance(p['next_verification_date'], str) else p['next_verification_date']
        m = EquipmentMaintenance.objects.create(
            equipment=equip,
            maintenance_type='verification',
            title=f'核查计划：{equip.name} - 到期日 {due}',
            description=f'设备 {equip.code} 核查到期日 {due}，请安排核查。',
            maintenance_date=ref,
            status='pending',
            verification_due_date=due,
        )
        created.append({'id': m.id, 'equipment_id': eid, 'verification_due_date': str(due)})
        pending.pop(eid, None)
    return {'created': created, 'skipped': skipped}


def list_verification_plans(keyword: str = None, page: int = 1, page_size: int = 50) -> dict:
    """核查计划列表 — 有 next_verification_date 的设备"""
    qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_verification_date__isnull=False,
    ).order_by('next_verification_date')
    if keyword:
        qs = qs.filter(
            Q(name__icontains=keyword) | Q(code__icontains=keyword) |
            Q(model_number__icontains=keyword) | Q(serial_number__icontains=keyword)
        )
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    result = []
    for eq in items:
        attrs = eq.attributes or {}
        result.append({
            'id': eq.id, 'code': eq.code, 'name': eq.name,
            'status': eq.status, 'status_display': eq.get_status_display(),
            'model_number': eq.model_number or '/', 'serial_number': eq.serial_number or '/',
            'verification_cycle_days': eq.verification_cycle_days or 180,
            'last_verification_date': str(eq.last_verification_date) if eq.last_verification_date else '-',
            'next_verification_date': str(eq.next_verification_date),
            'reminder_days': attrs.get('verification_reminder_days') or 30,
            'reminder_person': attrs.get('verification_reminder_person', '') or '-',
            'verification_method': attrs.get('verification_method', '') or '-',
        })
    return {'items': result, 'total': total, 'page': page, 'page_size': page_size}


def list_verifications(
    equipment_id: int = None,
    result: str = None,
    date_from: str = None,
    date_to: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """核查记录列表"""
    qs = EquipmentVerification.objects.select_related('equipment').all()
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    if result:
        qs = qs.filter(result=result)
    if date_from:
        qs = qs.filter(verification_date__gte=date_from)
    if date_to:
        qs = qs.filter(verification_date__lte=date_to)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {
        'items': [{
            'id': v.id, 'equipment_id': v.equipment_id,
            'equipment_name': v.equipment.name, 'equipment_code': v.equipment.code,
            'verification_date': str(v.verification_date), 'next_due_date': str(v.next_due_date),
            'verifier': v.verifier, 'result': v.result,
            'method_notes': v.method_notes, 'notes': v.notes,
            'create_time': v.create_time.isoformat(),
        } for v in items],
        'total': total, 'page': page, 'page_size': page_size,
    }


def create_verification(
    equipment_id: int,
    verification_date: str,
    next_due_date: str,
    verifier: str = '',
    result: str = 'pass',
    method_notes: str = '',
    notes: str = '',
) -> Optional[dict]:
    """新增核查记录，同步更新设备"""
    equip = _equipment_qs().filter(id=equipment_id).first()
    if not equip:
        return {'error': '设备不存在'}
    ver_date = date.fromisoformat(verification_date)
    due_date = date.fromisoformat(next_due_date)
    v = EquipmentVerification.objects.create(
        equipment=equip,
        verification_date=ver_date,
        next_due_date=due_date,
        verifier=verifier,
        result=result,
        method_notes=method_notes,
        notes=notes,
    )
    equip.last_verification_date = ver_date
    equip.next_verification_date = due_date
    equip.save(update_fields=['last_verification_date', 'next_verification_date', 'update_time'])
    return {
        'id': v.id, 'equipment_id': equip.id,
        'verification_date': str(v.verification_date),
        'next_due_date': str(v.next_due_date),
        'result': v.result,
    }


def get_verification_detail(verification_id: int) -> Optional[dict]:
    """核查记录详情"""
    v = EquipmentVerification.objects.select_related('equipment').filter(id=verification_id).first()
    if not v:
        return None
    return {
        'id': v.id, 'equipment_id': v.equipment_id,
        'equipment_name': v.equipment.name, 'equipment_code': v.equipment.code,
        'verification_date': str(v.verification_date), 'next_due_date': str(v.next_due_date),
        'verifier': v.verifier, 'result': v.result,
        'method_notes': v.method_notes, 'notes': v.notes,
        'create_time': v.create_time.isoformat(),
    }


# ============================================================================
# 维护计划
# ============================================================================
def get_maintenance_plan() -> dict:
    """维护计划视图 — 逾期/7日内/本月到期 + 待办维护工单"""
    today = timezone.now().date()
    month_end = date(today.year, today.month + 1, 1) - timedelta(days=1) if today.month < 12 \
        else date(today.year, 12, 31)
    eq_qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_maintenance_date__isnull=False,
    )
    overdue_items = list(eq_qs.filter(next_maintenance_date__lt=today).values(
        'id', 'name', 'code', 'next_maintenance_date', 'location'))
    due_7_items = list(eq_qs.filter(
        next_maintenance_date__gte=today,
        next_maintenance_date__lte=today + timedelta(days=7),
    ).values('id', 'name', 'code', 'next_maintenance_date', 'location'))
    due_month_items = list(eq_qs.filter(
        next_maintenance_date__gte=today,
        next_maintenance_date__lte=month_end,
    ).values('id', 'name', 'code', 'next_maintenance_date', 'location'))
    pending_work_orders = get_pending_maintenance_work_orders(today)
    return {
        'overdue': {'count': len(overdue_items), 'items': overdue_items},
        'due_in_7_days': {'count': len(due_7_items), 'items': due_7_items},
        'due_this_month': {'count': len(due_month_items), 'items': due_month_items},
        'pending_work_orders': {'count': len(pending_work_orders), 'items': pending_work_orders},
    }


def get_pending_maintenance_work_orders(reference_date: date = None) -> list:
    """待发起维护工单：下次维护日<=下月末，且尚未发起"""
    ref = reference_date or _month_start(timezone.now().date())
    cutoff = _end_of_next_month(ref)
    eq_qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_maintenance_date__isnull=False,
        next_maintenance_date__lte=cutoff,
    )
    existing = set(
        EquipmentMaintenance.objects.filter(
            maintenance_type='preventive',
            status__in=['pending', 'in_progress'],
            maintenance_due_date__isnull=False,
        ).values_list('equipment_id', 'maintenance_due_date')
    )
    items = []
    for eq in eq_qs:
        due = eq.next_maintenance_date
        if (eq.id, due) in existing:
            continue
        items.append({
            'id': eq.id, 'name': eq.name, 'code': eq.code,
            'next_maintenance_date': str(due), 'location': eq.location or '',
        })
    return items


def create_maintenance_work_orders(equipment_ids: list, reference_date: date = None) -> dict:
    """为指定设备批量发起维护工单（预防性）"""
    ref = reference_date or _month_start(timezone.now().date())
    pending = {p['id']: p for p in get_pending_maintenance_work_orders(ref)}
    created, skipped = [], []
    for eid in equipment_ids:
        if eid not in pending:
            skipped.append(eid)
            continue
        p = pending[eid]
        equip = _equipment_qs().filter(id=eid).first()
        if not equip:
            skipped.append(eid)
            continue
        due = date.fromisoformat(p['next_maintenance_date']) if isinstance(p['next_maintenance_date'], str) else p['next_maintenance_date']
        m = EquipmentMaintenance.objects.create(
            equipment=equip,
            maintenance_type='preventive',
            title=f'维护计划：{equip.name} - 到期日 {due}',
            description=f'设备 {equip.code} 维护到期日 {due}，请安排维护。',
            maintenance_date=ref,
            status='pending',
            maintenance_due_date=due,
        )
        created.append({'id': m.id, 'equipment_id': eid, 'maintenance_due_date': str(due)})
        pending.pop(eid, None)
    return {'created': created, 'skipped': skipped}


def list_maintenance_plans(keyword: str = None, page: int = 1, page_size: int = 50) -> dict:
    """维护计划列表 — 有 next_maintenance_date 的设备"""
    qs = _equipment_qs().exclude(status=ResourceStatus.RETIRED).filter(
        next_maintenance_date__isnull=False,
    ).order_by('next_maintenance_date')
    if keyword:
        qs = qs.filter(
            Q(name__icontains=keyword) | Q(code__icontains=keyword) |
            Q(model_number__icontains=keyword) | Q(serial_number__icontains=keyword)
        )
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    result = []
    for eq in items:
        attrs = eq.attributes or {}
        result.append({
            'id': eq.id, 'code': eq.code, 'name': eq.name,
            'status': eq.status, 'status_display': eq.get_status_display(),
            'model_number': eq.model_number or '/', 'serial_number': eq.serial_number or '/',
            'maintenance_cycle_days': eq.maintenance_cycle_days or 180,
            'last_maintenance_date': str(eq.last_maintenance_date) if eq.last_maintenance_date else '-',
            'next_maintenance_date': str(eq.next_maintenance_date),
            'reminder_days': attrs.get('maintenance_reminder_days') or 30,
            'reminder_person': attrs.get('maintenance_reminder_person', '') or '-',
            'maintenance_method': attrs.get('maintenance_method', '') or '-',
        })
    return {'items': result, 'total': total, 'page': page, 'page_size': page_size}


# ============================================================================
# 维护工单
# ============================================================================
def list_maintenance(
    equipment_id: int = None,
    status: str = None,
    maintenance_type: str = None,
    date_from: str = None,
    date_to: str = None,
    assigned_to_id: int = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """维护工单列表"""
    qs = EquipmentMaintenance.objects.select_related('equipment').all()
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    if status:
        qs = qs.filter(status=status)
    if maintenance_type:
        qs = qs.filter(maintenance_type=maintenance_type)
    if date_from:
        qs = qs.filter(maintenance_date__gte=date_from)
    if date_to:
        qs = qs.filter(maintenance_date__lte=date_to)
    if assigned_to_id:
        qs = qs.filter(assigned_to_id=assigned_to_id)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {
        'items': [_maintenance_to_dict(m) for m in items],
        'total': total, 'page': page, 'page_size': page_size,
    }


def _maintenance_to_dict(m: EquipmentMaintenance) -> dict:
    return {
        'id': m.id,
        'equipment_id': m.equipment_id,
        'equipment_name': m.equipment.name,
        'equipment_code': m.equipment.code,
        'title': m.title,
        'maintenance_type': m.maintenance_type,
        'maintenance_type_display': m.get_maintenance_type_display(),
        'status': m.status,
        'status_display': m.get_status_display(),
        'maintenance_date': str(m.maintenance_date),
        'description': m.description,
        'performed_by': m.performed_by,
        'cost': float(m.cost) if m.cost else None,
        'next_maintenance_date': str(m.next_maintenance_date) if m.next_maintenance_date else None,
        'calibration_due_date': str(m.calibration_due_date) if m.calibration_due_date else None,
        'verification_due_date': str(m.verification_due_date) if m.verification_due_date else None,
        'maintenance_due_date': str(m.maintenance_due_date) if m.maintenance_due_date else None,
        'reported_by_id': m.reported_by_id,
        'assigned_to_id': m.assigned_to_id,
        'completed_at': m.completed_at.isoformat() if m.completed_at else None,
        'result_notes': m.result_notes,
        'requires_recalibration': m.requires_recalibration,
        'create_time': m.create_time.isoformat(),
    }


def get_maintenance_stats() -> dict:
    """维护统计"""
    today = timezone.now().date()
    qs = EquipmentMaintenance.objects.all()
    pending = qs.filter(status='pending').count()
    in_progress = qs.filter(status='in_progress').count()
    completed_month = qs.filter(
        status='completed',
        completed_at__month=today.month,
        completed_at__year=today.year,
    ).count()

    # 平均响应时间：从创建到开始处理（status 变为 in_progress）
    # 简化：计算本月已完成工单从创建到完成的平均天数
    completed_this_month = qs.filter(
        status='completed',
        completed_at__isnull=False,
        completed_at__month=today.month,
    )
    avg_hours = None
    if completed_this_month.exists():
        total_hours = 0
        count = 0
        for m in completed_this_month:
            delta = m.completed_at - m.create_time
            total_hours += delta.total_seconds() / 3600
            count += 1
        avg_hours = round(total_hours / count, 1) if count > 0 else None

    return {
        'pending': pending,
        'in_progress': in_progress,
        'completed_this_month': completed_month,
        'avg_response_hours': avg_hours,
        'sla_target_hours': 48,
        'sla_overdue_count': qs.filter(
            status__in=['pending', 'in_progress'],
            create_time__lt=timezone.now() - timedelta(hours=48),
        ).count(),
    }


def create_maintenance(
    equipment_id: int,
    maintenance_type: str,
    title: str,
    description: str,
    maintenance_date: str = None,
    assigned_to_id: int = None,
    reported_by_id: int = None,
) -> Optional[dict]:
    """创建维护工单"""
    equip = _equipment_qs().filter(id=equipment_id).first()
    if not equip:
        return {'error': '设备不存在'}

    m_date = date.fromisoformat(maintenance_date) if maintenance_date else timezone.now().date()

    m = EquipmentMaintenance.objects.create(
        equipment=equip,
        title=title,
        maintenance_type=maintenance_type,
        status='pending',
        maintenance_date=m_date,
        description=description,
        assigned_to_id=assigned_to_id,
        reported_by_id=reported_by_id,
    )

    # 纠正性/紧急维护 → 设备状态变为维护中
    if maintenance_type in ('corrective', 'emergency'):
        equip.status = ResourceStatus.MAINTENANCE
        equip.save(update_fields=['status', 'update_time'])
    try:
        from apps.notification.services import send_notification
        if assigned_to_id:
            send_notification(
                recipient_id=assigned_to_id,
                title=f'新维护工单：{title}',
                content=f'设备 {equip.name}({equip.code}) 已创建维护工单，请及时处理。',
                source_type='equipment_maintenance',
                source_id=m.id,
            )
    except Exception as e:
        logger.warning(f'维护工单通知发送失败: {e}')

    return _maintenance_to_dict(m)


def get_maintenance_detail(maintenance_id: int) -> Optional[dict]:
    """维护工单详情"""
    m = EquipmentMaintenance.objects.select_related('equipment').filter(id=maintenance_id).first()
    if not m:
        return None
    return _maintenance_to_dict(m)


def update_maintenance(maintenance_id: int, **kwargs) -> Optional[dict]:
    """更新维护工单"""
    m = EquipmentMaintenance.objects.select_related('equipment').filter(id=maintenance_id).first()
    if not m:
        return {'error': '维护工单不存在'}
    for k, v in kwargs.items():
        if hasattr(m, k):
            setattr(m, k, v)
    m.save()
    return _maintenance_to_dict(m)


def assign_maintenance(maintenance_id: int, assigned_to_id: int) -> Optional[dict]:
    """分配维护任务"""
    m = EquipmentMaintenance.objects.select_related('equipment').filter(id=maintenance_id).first()
    if not m:
        return {'error': '维护工单不存在'}
    if m.status not in ('pending',):
        return {'error': f'当前状态 {m.get_status_display()} 不允许分配'}
    m.assigned_to_id = assigned_to_id
    m.status = 'in_progress'
    m.save(update_fields=['assigned_to_id', 'status', 'update_time'])
    return _maintenance_to_dict(m)


def start_maintenance(maintenance_id: int) -> Optional[dict]:
    """开始维护"""
    m = EquipmentMaintenance.objects.select_related('equipment').filter(id=maintenance_id).first()
    if not m:
        return {'error': '维护工单不存在'}
    if m.status != 'pending':
        return {'error': f'当前状态 {m.get_status_display()} 不允许开始'}
    m.status = 'in_progress'
    m.save(update_fields=['status', 'update_time'])
    return _maintenance_to_dict(m)


def complete_maintenance(
    maintenance_id: int,
    result_notes: str = '',
    cost: float = None,
    requires_recalibration: bool = False,
    next_maintenance_date: str = None,
    performed_by: str = '',
) -> Optional[dict]:
    """完成维护"""
    m = EquipmentMaintenance.objects.select_related('equipment').filter(id=maintenance_id).first()
    if not m:
        return {'error': '维护工单不存在'}
    if m.status != 'in_progress':
        return {'error': f'当前状态 {m.get_status_display()} 不允许完成'}

    m.status = 'completed'
    m.completed_at = timezone.now()
    m.result_notes = result_notes
    m.requires_recalibration = requires_recalibration
    if cost is not None:
        m.cost = cost
    if next_maintenance_date:
        m.next_maintenance_date = date.fromisoformat(next_maintenance_date)
    if performed_by:
        m.performed_by = performed_by
    m.save()

    # 预防性维护完成：更新设备 last_maintenance_date、next_maintenance_date
    equip = m.equipment
    if m.maintenance_type == 'preventive' and m.maintenance_due_date:
        equip.last_maintenance_date = m.maintenance_date
        if m.next_maintenance_date:
            equip.next_maintenance_date = m.next_maintenance_date
        else:
            cycle = equip.maintenance_cycle_days or 180
            equip.next_maintenance_date = m.maintenance_date + timedelta(days=cycle)
        equip.save(update_fields=['last_maintenance_date', 'next_maintenance_date', 'update_time'])
    # 核查工单完成：由用户通过「新增核查」填写核查记录并更新设备日期

    # 设备状态恢复
    if requires_recalibration:
        equip.status = ResourceStatus.CALIBRATING
        # 维护完成后需要复校时，自动生成待执行校准任务记录，避免人工遗漏。
        due_date = timezone.now().date() + timedelta(days=1)
        EquipmentCalibration.objects.create(
            equipment=equip,
            calibration_type='internal',
            calibration_date=timezone.now().date(),
            next_due_date=due_date,
            calibrator='system-auto',
            result='conditional',
            notes=f'由维护工单#{m.id}自动创建复校任务',
        )
    else:
        equip.status = ResourceStatus.ACTIVE
    equip.save(update_fields=['status', 'update_time'])
    if requires_recalibration:
        try:
            from .feishu_integration_service import EquipmentFeishuService
            EquipmentFeishuService.send_calibration_expiry_alert(equip, days_remaining=1)
        except Exception as e:
            logger.warning(f'复校准预警发送失败: {e}')

    return _maintenance_to_dict(m)


def cancel_maintenance(maintenance_id: int, reason: str = '') -> Optional[dict]:
    """取消维护工单"""
    m = EquipmentMaintenance.objects.select_related('equipment').filter(id=maintenance_id).first()
    if not m:
        return {'error': '维护工单不存在'}
    if m.status in ('completed', 'cancelled'):
        return {'error': f'当前状态 {m.get_status_display()} 不允许取消'}

    m.status = 'cancelled'
    m.result_notes = f'取消原因: {reason}' if reason else m.result_notes
    m.save(update_fields=['status', 'result_notes', 'update_time'])

    # 如果设备因此工单进入维护状态，恢复为在用
    equip = m.equipment
    if equip.status == ResourceStatus.MAINTENANCE:
        other_active = EquipmentMaintenance.objects.filter(
            equipment=equip, status__in=('pending', 'in_progress'),
        ).exclude(id=maintenance_id).exists()
        if not other_active:
            equip.status = ResourceStatus.ACTIVE
            equip.save(update_fields=['status', 'update_time'])

    return _maintenance_to_dict(m)


# ============================================================================
# 使用记录
# ============================================================================
def list_usage(
    equipment_id: int = None,
    operator_id: int = None,
    usage_type: str = None,
    date_from: str = None,
    date_to: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """使用记录列表"""
    qs = EquipmentUsage.objects.select_related('equipment').all()
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    if operator_id:
        qs = qs.filter(operator_id=operator_id)
    if usage_type:
        qs = qs.filter(usage_type=usage_type)
    if date_from:
        qs = qs.filter(usage_date__gte=date_from)
    if date_to:
        qs = qs.filter(usage_date__lte=date_to)

    qs = qs.order_by('-usage_date', '-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {
        'items': [{
            'id': u.id,
            'equipment_id': u.equipment_id,
            'equipment_name': u.equipment.name,
            'equipment_code': u.equipment.code,
            'work_order_id': u.work_order_id,
            'usage_type': u.usage_type,
            'usage_date': str(u.usage_date),
            'start_time': u.start_time.isoformat() if u.start_time else None,
            'end_time': u.end_time.isoformat() if u.end_time else None,
            'duration_minutes': u.duration_minutes,
            'operator_id': u.operator_id,
            'operator_name': u.operator_name,
            'notes': u.notes,
            'is_active': u.start_time is not None and u.end_time is None,
            'create_time': u.create_time.isoformat(),
        } for u in items],
        'total': total, 'page': page, 'page_size': page_size,
    }


def get_usage_stats(days: int = 30) -> dict:
    """使用统计"""
    today = timezone.now().date()
    since = today - timedelta(days=days)
    qs = EquipmentUsage.objects.filter(usage_date__gte=since)

    today_count = qs.filter(usage_date=today).count()
    active_count = EquipmentUsage.objects.filter(
        start_time__isnull=False, end_time__isnull=True,
    ).count()

    total_duration = 0
    for u in qs.filter(duration_minutes__isnull=False):
        total_duration += u.duration_minutes

    # 按设备使用次数排名
    by_equipment = list(
        qs.values('equipment_id', 'equipment__name', 'equipment__code')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]
    )

    # 按操作人排名
    by_operator = list(
        qs.exclude(operator_name='').values('operator_id', 'operator_name')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]
    )

    return {
        'today_count': today_count,
        'active_now': active_count,
        'total_duration_minutes': total_duration,
        'period_days': days,
        'by_equipment': [{
            'equipment_id': e['equipment_id'],
            'equipment_name': e['equipment__name'],
            'equipment_code': e['equipment__code'],
            'count': e['count'],
        } for e in by_equipment],
        'by_operator': [{
            'operator_id': e['operator_id'],
            'operator_name': e['operator_name'],
            'count': e['count'],
        } for e in by_operator],
    }


def register_usage(
    equipment_id: int,
    operator_id: int = None,
    operator_name: str = '',
    usage_type: str = 'manual',
    notes: str = '',
) -> Optional[dict]:
    """手动登记使用（开始使用）"""
    if not operator_id:
        return {'error': '缺少操作人信息，请重新登录后重试'}
    equip = _equipment_qs().filter(id=equipment_id).first()
    if not equip:
        return {'error': '设备不存在'}
    if equip.status not in (ResourceStatus.ACTIVE, ResourceStatus.RESERVED):
        return {'error': f'设备当前状态为 {equip.get_status_display()}，不允许使用'}
    auth_result = check_authorization(equipment_id=equipment_id, operator_id=operator_id)
    if not auth_result.get('authorized'):
        return {'error': f'未授权使用该设备：{auth_result.get("reason", "")}'.strip()}

    now = timezone.now()
    usage = EquipmentUsage.objects.create(
        equipment=equip,
        usage_type=usage_type,
        usage_date=now.date(),
        start_time=now,
        operator_id=operator_id,
        operator_name=operator_name,
        notes=notes,
    )

    return {
        'id': usage.id,
        'equipment_id': equip.id,
        'equipment_name': equip.name,
        'start_time': usage.start_time.isoformat(),
    }


def end_usage(usage_id: int) -> Optional[dict]:
    """结束使用"""
    usage = EquipmentUsage.objects.select_related('equipment').filter(id=usage_id).first()
    if not usage:
        return {'error': '使用记录不存在'}
    if usage.end_time:
        return {'error': '使用已结束'}

    now = timezone.now()
    usage.end_time = now
    if usage.start_time:
        usage.duration_minutes = int((now - usage.start_time).total_seconds() / 60)
    usage.save(update_fields=['end_time', 'duration_minutes'])

    return {
        'id': usage.id,
        'end_time': usage.end_time.isoformat(),
        'duration_minutes': usage.duration_minutes,
    }


# ============================================================================
# 操作授权
# ============================================================================
def list_authorizations(
    equipment_id: int = None,
    operator_id: int = None,
    is_active: bool = None,
) -> list:
    """授权列表"""
    qs = EquipmentAuthorization.objects.select_related('equipment').all()
    if equipment_id:
        qs = qs.filter(equipment_id=equipment_id)
    if operator_id:
        qs = qs.filter(operator_id=operator_id)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)

    return [{
        'id': a.id,
        'equipment_id': a.equipment_id,
        'equipment_name': a.equipment.name,
        'equipment_code': a.equipment.code,
        'operator_id': a.operator_id,
        'operator_name': a.operator_name,
        'authorized_at': str(a.authorized_at),
        'expires_at': str(a.expires_at) if a.expires_at else None,
        'is_active': a.is_active,
        'training_record': a.training_record,
        'authorized_by_id': a.authorized_by_id,
        'notes': a.notes,
    } for a in qs]


def grant_authorization(
    equipment_id: int,
    operator_id: int,
    operator_name: str = '',
    authorized_at: str = None,
    expires_at: str = None,
    training_record: str = '',
    authorized_by_id: int = None,
    notes: str = '',
) -> Optional[dict]:
    """授予操作授权"""
    equip = _equipment_qs().filter(id=equipment_id).first()
    if not equip:
        return {'error': '设备不存在'}

    auth_date = date.fromisoformat(authorized_at) if authorized_at else timezone.now().date()
    exp_date = date.fromisoformat(expires_at) if expires_at else None

    auth, created = EquipmentAuthorization.objects.update_or_create(
        equipment=equip,
        operator_id=operator_id,
        defaults={
            'operator_name': operator_name,
            'authorized_at': auth_date,
            'expires_at': exp_date,
            'is_active': True,
            'training_record': training_record,
            'authorized_by_id': authorized_by_id,
            'notes': notes,
        },
    )

    return {
        'id': auth.id,
        'equipment_id': equip.id,
        'operator_id': operator_id,
        'operator_name': operator_name,
        'created': created,
    }


def revoke_authorization(authorization_id: int) -> Optional[dict]:
    """撤销授权"""
    auth = EquipmentAuthorization.objects.filter(id=authorization_id).first()
    if not auth:
        return {'error': '授权记录不存在'}
    auth.is_active = False
    auth.save(update_fields=['is_active', 'update_time'])
    return {'id': auth.id, 'is_active': False}


def check_authorization(equipment_id: int, operator_id: int) -> dict:
    """检查操作授权"""
    today = timezone.now().date()
    auth = EquipmentAuthorization.objects.filter(
        equipment_id=equipment_id,
        operator_id=operator_id,
        is_active=True,
    ).first()

    if not auth:
        return {'authorized': False, 'reason': '未找到有效授权'}
    if auth.expires_at and auth.expires_at < today:
        return {'authorized': False, 'reason': f'授权已于 {auth.expires_at} 过期'}

    return {'authorized': True, 'reason': '', 'authorization_id': auth.id}


# ============================================================================
# 检测方法
# ============================================================================
def list_detection_methods(
    category: str = None,
    status: str = None,
    keyword: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """检测方法列表"""
    qs = DetectionMethodTemplate.objects.filter(is_deleted=False)
    if category:
        qs = qs.filter(category=category)
    if status:
        qs = qs.filter(status=status)
    if keyword:
        qs = qs.filter(
            Q(name__icontains=keyword) |
            Q(name_en__icontains=keyword) |
            Q(code__icontains=keyword) |
            Q(keywords__contains=[keyword])
        )

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {
        'items': [{
            'id': m.id,
            'code': m.code,
            'name': m.name,
            'name_en': m.name_en,
            'category': m.category,
            'category_display': m.get_category_display(),
            'description': m.description,
            'estimated_duration_minutes': m.estimated_duration_minutes,
            'preparation_time_minutes': m.preparation_time_minutes,
            'temperature_range': f'{m.temperature_min}~{m.temperature_max}°C'
                if m.temperature_min and m.temperature_max else None,
            'humidity_range': f'{m.humidity_min}~{m.humidity_max}%'
                if m.humidity_min and m.humidity_max else None,
            'status': m.status,
            'status_display': m.get_status_display(),
            'resource_count': m.resource_requirements.count(),
            'personnel_count': m.personnel_requirements.count(),
        } for m in items],
        'total': total, 'page': page, 'page_size': page_size,
    }


def get_detection_method_detail(method_id: int) -> Optional[dict]:
    """检测方法详情（含资源需求和人员要求）"""
    m = DetectionMethodTemplate.objects.filter(id=method_id, is_deleted=False).first()
    if not m:
        return None

    resources = list(
        DetectionMethodResource.objects.filter(method=m)
        .select_related('resource_category')
        .values(
            'id', 'resource_type', 'resource_category_id',
            'resource_category__name', 'resource_category__code',
            'quantity', 'is_mandatory', 'recommended_models', 'usage_notes',
        )
    )
    personnel = list(
        DetectionMethodPersonnel.objects.filter(method=m).values(
            'id', 'qualification_name', 'qualification_code',
            'level', 'min_experience_months', 'notes',
        )
    )

    return {
        'id': m.id,
        'code': m.code,
        'name': m.name,
        'name_en': m.name_en,
        'category': m.category,
        'category_display': m.get_category_display(),
        'description': m.description,
        'standard_procedure': m.standard_procedure,
        'sop_reference': m.sop_reference,
        'sop_id': m.sop_id,
        'estimated_duration_minutes': m.estimated_duration_minutes,
        'preparation_time_minutes': m.preparation_time_minutes,
        'temperature_min': float(m.temperature_min) if m.temperature_min else None,
        'temperature_max': float(m.temperature_max) if m.temperature_max else None,
        'humidity_min': float(m.humidity_min) if m.humidity_min else None,
        'humidity_max': float(m.humidity_max) if m.humidity_max else None,
        'environment_notes': m.environment_notes,
        'keywords': m.keywords,
        'normal_range': m.normal_range,
        'measurement_points': m.measurement_points,
        'status': m.status,
        'status_display': m.get_status_display(),
        'resources': resources,
        'personnel': personnel,
        'create_time': m.create_time.isoformat(),
    }


def create_detection_method(
    code: str, name: str, category: str, **kwargs,
) -> Optional[dict]:
    """创建检测方法"""
    m = DetectionMethodTemplate.objects.create(
        code=code, name=name, category=category,
        **kwargs,
    )
    return {'id': m.id, 'code': m.code, 'name': m.name}


def update_detection_method(method_id: int, **kwargs) -> Optional[dict]:
    """更新检测方法"""
    m = DetectionMethodTemplate.objects.filter(id=method_id, is_deleted=False).first()
    if not m:
        return {'error': '检测方法不存在'}
    for k, v in kwargs.items():
        if hasattr(m, k):
            setattr(m, k, v)
    m.save()
    return {'id': m.id, 'code': m.code, 'name': m.name}


def add_method_resource(method_id: int, **kwargs) -> Optional[dict]:
    """添加检测方法资源需求"""
    m = DetectionMethodTemplate.objects.filter(id=method_id, is_deleted=False).first()
    if not m:
        return {'error': '检测方法不存在'}
    res = DetectionMethodResource.objects.create(method=m, **kwargs)
    return {'id': res.id}


def add_method_personnel(method_id: int, **kwargs) -> Optional[dict]:
    """添加检测方法人员要求"""
    m = DetectionMethodTemplate.objects.filter(id=method_id, is_deleted=False).first()
    if not m:
        return {'error': '检测方法不存在'}
    per = DetectionMethodPersonnel.objects.create(method=m, **kwargs)
    return {'id': per.id}


def remove_method_resource(resource_id: int) -> bool:
    """删除检测方法资源需求"""
    deleted, _ = DetectionMethodResource.objects.filter(id=resource_id).delete()
    return deleted > 0


def remove_method_personnel(personnel_id: int) -> bool:
    """删除检测方法人员要求"""
    deleted, _ = DetectionMethodPersonnel.objects.filter(id=personnel_id).delete()
    return deleted > 0
