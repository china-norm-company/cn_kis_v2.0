"""
资源管理服务

封装资源类别、资源实例、活动模板、活动 BOM 的 CRUD 业务逻辑。
来源：cn_kis_test backend/apps/resource/services/
"""
import logging
from typing import Optional
from ..models import (
    ResourceCategory, ResourceItem, ActivityTemplate, ActivityBOM,
    ResourceType, ResourceStatus,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 资源类别 CRUD
# ============================================================================
def list_categories(
    resource_type: str = None,
    parent_id: int = None,
    is_active: bool = None,
    keyword: str = None,
) -> list:
    """
    查询资源类别列表（支持按类型、父级、关键词筛选）

    返回平铺列表。前端可根据 parent_id 构建树形结构。
    """
    qs = ResourceCategory.objects.all()
    if resource_type:
        qs = qs.filter(resource_type=resource_type)
    if parent_id is not None:
        qs = qs.filter(parent_id=parent_id)
    elif parent_id is None and resource_type is None and keyword is None:
        pass  # 返回全部
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    if keyword:
        qs = qs.filter(name__icontains=keyword)
    return list(qs)


def get_category(category_id: int) -> Optional[ResourceCategory]:
    return ResourceCategory.objects.filter(id=category_id).first()


def create_category(
    name: str,
    code: str,
    resource_type: str,
    parent_id: int = None,
    description: str = '',
) -> ResourceCategory:
    """创建资源类别"""
    return ResourceCategory.objects.create(
        name=name,
        code=code,
        resource_type=resource_type,
        parent_id=parent_id,
        description=description,
    )


def update_category(category_id: int, **kwargs) -> Optional[ResourceCategory]:
    cat = get_category(category_id)
    if not cat:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(cat, k):
            setattr(cat, k, v)
    cat.save()
    return cat


def get_category_tree(resource_type: str = None) -> list:
    """
    获取资源类别树形结构

    返回嵌套字典列表，每个节点含 children 字段。
    """
    qs = ResourceCategory.objects.filter(is_active=True)
    if resource_type:
        qs = qs.filter(resource_type=resource_type)

    categories = list(qs)
    cat_map = {c.id: {
        'id': c.id, 'name': c.name, 'code': c.code,
        'resource_type': c.resource_type,
        'parent_id': c.parent_id,
        'description': c.description,
        'children': [],
    } for c in categories}

    roots = []
    for c in categories:
        node = cat_map[c.id]
        if c.parent_id and c.parent_id in cat_map:
            cat_map[c.parent_id]['children'].append(node)
        else:
            roots.append(node)
    return roots


# ============================================================================
# 资源实例 CRUD
# ============================================================================
def list_items(
    category_id: int = None,
    status: str = None,
    keyword: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页查询资源实例"""
    qs = ResourceItem.objects.filter(is_deleted=False)
    if category_id:
        qs = qs.filter(category_id=category_id)
    if status:
        qs = qs.filter(status=status)
    if keyword:
        qs = qs.filter(name__icontains=keyword)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_item(item_id: int) -> Optional[ResourceItem]:
    return ResourceItem.objects.filter(id=item_id, is_deleted=False).first()


def create_item(
    name: str,
    code: str,
    category_id: int,
    status: str = ResourceStatus.ACTIVE,
    location: str = '',
    **kwargs,
) -> ResourceItem:
    """创建资源实例"""
    return ResourceItem.objects.create(
        name=name,
        code=code,
        category_id=category_id,
        status=status,
        location=location,
        **kwargs,
    )


def update_item(item_id: int, **kwargs) -> Optional[ResourceItem]:
    item = get_item(item_id)
    if not item:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(item, k):
            setattr(item, k, v)
    item.save()
    return item


def delete_item(item_id: int) -> bool:
    item = get_item(item_id)
    if not item:
        return False
    item.is_deleted = True
    item.save(update_fields=['is_deleted', 'update_time'])
    return True


# ============================================================================
# 活动模板 CRUD
# ============================================================================
def list_templates(
    keyword: str = None,
    sop_id: int = None,
    is_active: bool = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页查询活动模板"""
    qs = ActivityTemplate.objects.filter(is_deleted=False)
    if keyword:
        qs = qs.filter(name__icontains=keyword)
    if sop_id:
        qs = qs.filter(sop_id=sop_id)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_template(template_id: int) -> Optional[ActivityTemplate]:
    return ActivityTemplate.objects.filter(id=template_id, is_deleted=False).first()


def get_template_with_bom(template_id: int) -> Optional[dict]:
    """获取活动模板详情，含完整 BOM 列表"""
    tpl = get_template(template_id)
    if not tpl:
        return None

    bom_items = ActivityBOM.objects.filter(
        template=tpl
    ).select_related('resource_category')

    return {
        'template': tpl,
        'bom': list(bom_items),
    }


def create_template(
    name: str,
    code: str,
    description: str = '',
    duration: int = 30,
    sop_id: int = None,
    crf_template_id: int = None,
    qualification_requirements: list = None,
) -> ActivityTemplate:
    """创建活动模板"""
    return ActivityTemplate.objects.create(
        name=name,
        code=code,
        description=description,
        duration=duration,
        sop_id=sop_id,
        crf_template_id=crf_template_id,
        qualification_requirements=qualification_requirements or [],
    )


def update_template(template_id: int, **kwargs) -> Optional[ActivityTemplate]:
    tpl = get_template(template_id)
    if not tpl:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(tpl, k):
            setattr(tpl, k, v)
    tpl.save()
    return tpl


def delete_template(template_id: int) -> bool:
    tpl = get_template(template_id)
    if not tpl:
        return False
    tpl.is_deleted = True
    tpl.save(update_fields=['is_deleted', 'update_time'])
    return True


# ============================================================================
# 活动 BOM CRUD
# ============================================================================
def list_bom(template_id: int) -> list:
    """获取活动模板的 BOM 清单"""
    return list(
        ActivityBOM.objects.filter(template_id=template_id)
        .select_related('resource_category')
    )


def add_bom_item(
    template_id: int,
    resource_category_id: int,
    quantity: int = 1,
    is_mandatory: bool = True,
    notes: str = '',
) -> Optional[ActivityBOM]:
    """为活动模板添加 BOM 条目"""
    tpl = get_template(template_id)
    if not tpl:
        return None

    bom, created = ActivityBOM.objects.update_or_create(
        template_id=template_id,
        resource_category_id=resource_category_id,
        defaults={
            'quantity': quantity,
            'is_mandatory': is_mandatory,
            'notes': notes,
        },
    )
    return bom


def update_bom_item(bom_id: int, **kwargs) -> Optional[ActivityBOM]:
    bom = ActivityBOM.objects.filter(id=bom_id).first()
    if not bom:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(bom, k):
            setattr(bom, k, v)
    bom.save()
    return bom


def remove_bom_item(bom_id: int) -> bool:
    deleted, _ = ActivityBOM.objects.filter(id=bom_id).delete()
    return deleted > 0


# ============================================================================
# S3-1：设备全生命周期服务
# ============================================================================
from ..models import EquipmentCalibration, EquipmentMaintenance, EquipmentUsage


def add_calibration(
    equipment_id: int,
    calibration_date,
    next_due_date,
    calibrator: str = '',
    certificate_no: str = '',
    result: str = 'pass',
    notes: str = '',
) -> Optional[EquipmentCalibration]:
    """记录校准信息（AC-1），更新 ResourceItem 校准字段"""
    equip = ResourceItem.objects.filter(id=equipment_id, is_deleted=False).first()
    if not equip:
        return None

    cal = EquipmentCalibration.objects.create(
        equipment=equip,
        calibration_date=calibration_date,
        next_due_date=next_due_date,
        calibrator=calibrator,
        certificate_no=certificate_no,
        result=result,
        notes=notes,
    )

    # 同步更新 ResourceItem 校准字段
    equip.last_calibration_date = calibration_date
    equip.next_calibration_date = next_due_date
    equip.save(update_fields=['last_calibration_date', 'next_calibration_date', 'update_time'])

    # 创建飞书日历提醒
    _create_calibration_reminder(equip, cal)
    return cal


def create_equipment_usage(
    equipment_id: int,
    work_order_id: int,
    usage_date=None,
    duration_minutes: int = None,
    operator_id: int = None,
) -> Optional[EquipmentUsage]:
    """创建设备使用记录（工单完成时自动调用）"""
    from django.utils import timezone
    return EquipmentUsage.objects.create(
        equipment_id=equipment_id,
        work_order_id=work_order_id,
        usage_date=usage_date or timezone.now().date(),
        duration_minutes=duration_minutes,
        operator_id=operator_id,
    )


def check_equipment_calibration_valid(equipment_id: int) -> dict:
    """
    检查设备校准有效性（AC-4）

    排程冲突检测时使用。
    """
    from django.utils import timezone
    equip = ResourceItem.objects.filter(id=equipment_id, is_deleted=False).first()
    if not equip:
        return {'valid': False, 'reason': '设备不存在'}

    if not equip.next_calibration_date:
        return {'valid': False, 'reason': f'{equip.name} 无校准记录'}

    today = timezone.now().date()
    if equip.next_calibration_date < today:
        return {
            'valid': False,
            'reason': f'{equip.name} 校准已过期（到期日: {equip.next_calibration_date}）',
        }

    return {'valid': True, 'reason': ''}


def get_calibration_expiring_equipment(days_ahead: int = 30) -> list:
    """获取即将到期的设备列表（定时任务用）"""
    from django.utils import timezone
    from datetime import timedelta
    today = timezone.now().date()
    deadline = today + timedelta(days=days_ahead)
    return list(ResourceItem.objects.filter(
        is_deleted=False,
        category__resource_type='equipment',
        next_calibration_date__lte=deadline,
        next_calibration_date__gte=today,
    ))


def _create_calibration_reminder(equip: ResourceItem, cal: EquipmentCalibration):
    """校准到期前创建飞书日历提醒（AC-2）"""
    try:
        from libs.feishu_client import feishu_client
        import os
        calendar_id = os.getenv('FEISHU_PRIMARY_CALENDAR_ID', '')
        if not calendar_id:
            logger.warning('FEISHU_PRIMARY_CALENDAR_ID 未配置，校准提醒跳过')
            return

        event = feishu_client.create_calendar_event(
            calendar_id=calendar_id,
            summary=f'[设备校准提醒] {equip.name}({equip.code})',
            start_time=str(cal.next_due_date),
            description=f'设备 {equip.name} 校准到期，请安排校准。\n'
                        f'上次校准: {cal.calibration_date}\n'
                        f'证书编号: {cal.certificate_no}',
        )
        if event:
            event_id = event.get('event', {}).get('event_id', '')
            if event_id:
                cal.feishu_calendar_event_id = event_id
                cal.save(update_fields=['feishu_calendar_event_id'])
    except Exception as e:
        logger.error(f'设备#{equip.id} 校准日历提醒创建失败: {e}')
