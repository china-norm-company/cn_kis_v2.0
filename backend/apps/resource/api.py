"""
资源管理 API

端点：
- 资源类别：GET/POST /resource/categories
- 资源实例：GET/POST /resource/items
- 活动模板：GET/POST /resource/templates
- 活动 BOM：GET/POST /resource/templates/{id}/bom
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from pydantic import ConfigDict
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services

router = Router()


# ============================================================================
# Schema
# ============================================================================
class CategoryCreateIn(Schema):
    name: str
    code: str
    resource_type: str
    parent_id: Optional[int] = None
    description: Optional[str] = ''


class CategoryOut(Schema):
    id: int
    name: str
    code: str
    resource_type: str
    parent_id: Optional[int] = None
    description: str
    is_active: bool


class ItemCreateIn(Schema):
    model_config = ConfigDict(protected_namespaces=())

    name: str
    code: str
    category_id: int
    status: Optional[str] = 'active'
    location: Optional[str] = ''
    manufacturer: Optional[str] = ''
    model_number: Optional[str] = ''
    serial_number: Optional[str] = ''


class ItemQueryParams(Schema):
    category_id: Optional[int] = None
    status: Optional[str] = None
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 20


class TemplateCreateIn(Schema):
    name: str
    code: str
    description: Optional[str] = ''
    duration: Optional[int] = 30
    sop_id: Optional[int] = None
    crf_template_id: Optional[int] = None
    qualification_requirements: Optional[List[dict]] = None


class TemplateQueryParams(Schema):
    keyword: Optional[str] = None
    sop_id: Optional[int] = None
    is_active: Optional[bool] = None
    page: int = 1
    page_size: int = 20


class BOMCreateIn(Schema):
    resource_category_id: int
    quantity: Optional[int] = 1
    is_mandatory: Optional[bool] = True
    notes: Optional[str] = ''


# ============================================================================
# 辅助函数
# ============================================================================
def _cat_to_dict(c) -> dict:
    return {
        'id': c.id, 'name': c.name, 'code': c.code,
        'resource_type': c.resource_type,
        'parent_id': c.parent_id,
        'description': c.description,
        'is_active': c.is_active,
    }


def _item_to_dict(item) -> dict:
    return {
        'id': item.id, 'name': item.name, 'code': item.code,
        'category_id': item.category_id, 'status': item.status,
        'location': item.location,
        'manufacturer': item.manufacturer,
        'model_number': item.model_number,
        'serial_number': item.serial_number,
        'purchase_date': str(item.purchase_date) if item.purchase_date else None,
        'next_calibration_date': str(item.next_calibration_date) if item.next_calibration_date else None,
        'create_time': item.create_time.isoformat(),
    }


def _tpl_to_dict(tpl) -> dict:
    return {
        'id': tpl.id, 'name': tpl.name, 'code': tpl.code,
        'description': tpl.description, 'duration': tpl.duration,
        'sop_id': tpl.sop_id, 'crf_template_id': tpl.crf_template_id,
        'qualification_requirements': tpl.qualification_requirements,
        'is_active': tpl.is_active,
        'create_time': tpl.create_time.isoformat(),
    }


def _bom_to_dict(bom) -> dict:
    return {
        'id': bom.id,
        'template_id': bom.template_id,
        'resource_category_id': bom.resource_category_id,
        'resource_category_name': bom.resource_category.name if bom.resource_category else '',
        'resource_category_code': bom.resource_category.code if bom.resource_category else '',
        'resource_type': bom.resource_category.resource_type if bom.resource_category else '',
        'quantity': bom.quantity,
        'is_mandatory': bom.is_mandatory,
        'notes': bom.notes,
    }


# ============================================================================
# 资源类别端点
# ============================================================================
@router.get('/categories', summary='资源类别列表')
@require_permission('resource.category.read')
def list_categories(
    request,
    resource_type: Optional[str] = None,
    parent_id: Optional[int] = None,
    keyword: Optional[str] = None,
):
    """查询资源类别（支持按类型、父级筛选）"""
    items = services.list_categories(
        resource_type=resource_type, parent_id=parent_id, keyword=keyword,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': [_cat_to_dict(c) for c in items],
    }


@router.get('/categories/tree', summary='资源类别树')
@require_permission('resource.category.read')
def get_category_tree(request, resource_type: Optional[str] = None):
    """获取资源类别树形结构"""
    tree = services.get_category_tree(resource_type=resource_type)
    return {'code': 200, 'msg': 'OK', 'data': tree}


@router.post('/categories/create', summary='创建资源类别')
@require_permission('resource.category.create')
def create_category(request, data: CategoryCreateIn):
    """创建资源类别"""
    cat = services.create_category(
        name=data.name, code=data.code,
        resource_type=data.resource_type,
        parent_id=data.parent_id,
        description=data.description or '',
    )
    return {'code': 200, 'msg': '创建成功', 'data': _cat_to_dict(cat)}


# ============================================================================
# 资源实例端点
# ============================================================================
@router.get('/items', summary='资源实例列表')
@require_permission('resource.item.read')
def list_items(request, params: ItemQueryParams = Query(...)):
    """分页查询资源实例"""
    result = services.list_items(
        category_id=params.category_id,
        status=params.status,
        keyword=params.keyword,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_item_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/items/create', summary='创建资源实例')
@require_permission('resource.item.create')
def create_item(request, data: ItemCreateIn):
    """创建资源实例"""
    item = services.create_item(
        name=data.name, code=data.code,
        category_id=data.category_id,
        status=data.status or 'active',
        location=data.location or '',
        manufacturer=data.manufacturer or '',
        model_number=data.model_number or '',
        serial_number=data.serial_number or '',
    )
    return {'code': 200, 'msg': '创建成功', 'data': _item_to_dict(item)}


@router.get('/items/{item_id}', summary='资源实例详情')
@require_permission('resource.item.read')
def get_item(request, item_id: int):
    item = services.get_item(item_id)
    if not item:
        return 404, {'code': 404, 'msg': '资源不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _item_to_dict(item)}


# ============================================================================
# 活动模板端点
# ============================================================================
@router.get('/templates', summary='活动模板列表')
@require_permission('resource.template.read')
def list_templates(request, params: TemplateQueryParams = Query(...)):
    """分页查询活动模板"""
    result = services.list_templates(
        keyword=params.keyword,
        sop_id=params.sop_id,
        is_active=params.is_active,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_tpl_to_dict(t) for t in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/templates/create', summary='创建活动模板')
@require_permission('resource.template.create')
def create_template(request, data: TemplateCreateIn):
    """创建活动模板"""
    tpl = services.create_template(
        name=data.name, code=data.code,
        description=data.description or '',
        duration=data.duration or 30,
        sop_id=data.sop_id,
        crf_template_id=data.crf_template_id,
        qualification_requirements=data.qualification_requirements,
    )
    return {'code': 200, 'msg': '创建成功', 'data': _tpl_to_dict(tpl)}


@router.get('/templates/{template_id}', summary='活动模板详情（含BOM）')
@require_permission('resource.template.read')
def get_template_detail(request, template_id: int):
    """获取活动模板详情，包含完整 BOM 列表"""
    detail = services.get_template_with_bom(template_id)
    if not detail:
        return 404, {'code': 404, 'msg': '活动模板不存在'}

    tpl_dict = _tpl_to_dict(detail['template'])
    tpl_dict['bom'] = [_bom_to_dict(b) for b in detail['bom']]
    return {'code': 200, 'msg': 'OK', 'data': tpl_dict}


# ============================================================================
# 活动 BOM 端点
# ============================================================================
@router.get('/templates/{template_id}/bom', summary='活动BOM清单')
@require_permission('resource.template.read')
def list_bom(request, template_id: int):
    """获取活动模板的 BOM 清单"""
    items = services.list_bom(template_id)
    return {
        'code': 200, 'msg': 'OK',
        'data': [_bom_to_dict(b) for b in items],
    }


@router.post('/templates/{template_id}/bom/create', summary='添加BOM条目')
@require_permission('resource.template.create')
def add_bom_item(request, template_id: int, data: BOMCreateIn):
    """为活动模板添加 BOM 条目（资源类别+数量）"""
    bom = services.add_bom_item(
        template_id=template_id,
        resource_category_id=data.resource_category_id,
        quantity=data.quantity or 1,
        is_mandatory=data.is_mandatory if data.is_mandatory is not None else True,
        notes=data.notes or '',
    )
    if not bom:
        return 404, {'code': 404, 'msg': '活动模板不存在'}
    return {'code': 200, 'msg': '添加成功', 'data': _bom_to_dict(bom)}


@router.delete('/bom/{bom_id}', summary='删除BOM条目')
@require_permission('resource.template.create')
def remove_bom_item(request, bom_id: int):
    """删除 BOM 条目"""
    ok = services.remove_bom_item(bom_id)
    if not ok:
        return 404, {'code': 404, 'msg': 'BOM条目不存在'}
    return {'code': 200, 'msg': '删除成功', 'data': None}


# ============================================================================
# S3-1：设备全生命周期
# ============================================================================
class CalibrationCreateIn(Schema):
    equipment_id: int
    calibration_date: str
    next_due_date: str
    calibrator: Optional[str] = ''
    certificate_no: Optional[str] = ''
    result: Optional[str] = 'pass'
    notes: Optional[str] = ''


@router.post('/equipment/calibrations/create', summary='记录设备校准')
@require_permission('resource.item.create')
def add_calibration(request, data: CalibrationCreateIn):
    from datetime import date as dt_date
    cal = services.add_calibration(
        equipment_id=data.equipment_id,
        calibration_date=dt_date.fromisoformat(data.calibration_date),
        next_due_date=dt_date.fromisoformat(data.next_due_date),
        calibrator=data.calibrator or '',
        certificate_no=data.certificate_no or '',
        result=data.result or 'pass',
        notes=data.notes or '',
    )
    if not cal:
        return 404, {'code': 404, 'msg': '设备不存在'}
    return {'code': 200, 'msg': '校准记录已添加', 'data': {
        'id': cal.id, 'equipment_id': cal.equipment_id,
        'calibration_date': str(cal.calibration_date),
        'next_due_date': str(cal.next_due_date),
    }}


@router.get('/equipment/{equipment_id}/calibrations', summary='设备校准记录')
@require_permission('resource.item.read')
def list_calibrations(request, equipment_id: int):
    from .models import EquipmentCalibration
    cals = EquipmentCalibration.objects.filter(equipment_id=equipment_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': c.id, 'calibration_date': str(c.calibration_date),
            'next_due_date': str(c.next_due_date), 'result': c.result,
            'calibrator': c.calibrator,
        } for c in cals],
    }}


@router.get('/equipment/{equipment_id}/check-calibration', summary='检查校准有效性')
@require_permission('resource.item.read')
def check_calibration(request, equipment_id: int):
    result = services.check_equipment_calibration_valid(equipment_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# S3-3：场地环境监控
# ============================================================================
class EnvLogCreateIn(Schema):
    venue_id: int
    recorded_at: str
    temperature: Optional[float] = None
    humidity: Optional[float] = None


@router.post('/venue/environment-logs/create', summary='记录环境数据')
@require_permission('resource.item.create')
def create_env_log(request, data: EnvLogCreateIn):
    from .models import VenueEnvironmentLog
    from datetime import datetime
    account = _get_account_from_request(request)

    # 合规性检查（可扩展为配置化）
    is_compliant = True
    reasons = []
    if data.temperature is not None:
        if data.temperature < 15 or data.temperature > 30:
            is_compliant = False
            reasons.append(f'温度 {data.temperature}°C 超出 15-30°C 范围')
    if data.humidity is not None:
        if data.humidity < 30 or data.humidity > 70:
            is_compliant = False
            reasons.append(f'湿度 {data.humidity}% 超出 30-70% 范围')

    log = VenueEnvironmentLog.objects.create(
        venue_id=data.venue_id,
        recorded_at=datetime.fromisoformat(data.recorded_at),
        temperature=data.temperature,
        humidity=data.humidity,
        is_compliant=is_compliant,
        non_compliance_reason='; '.join(reasons),
        recorder_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': log.id, 'is_compliant': log.is_compliant,
        'non_compliance_reason': log.non_compliance_reason,
    }}


@router.get('/venue/{venue_id}/environment-logs', summary='环境记录列表')
@require_permission('resource.item.read')
def list_env_logs(request, venue_id: int):
    from .models import VenueEnvironmentLog
    logs = VenueEnvironmentLog.objects.filter(venue_id=venue_id)[:50]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': l.id, 'recorded_at': l.recorded_at.isoformat(),
            'temperature': l.temperature, 'humidity': l.humidity,
            'is_compliant': l.is_compliant,
        } for l in logs],
    }}


# ============================================================================
# 人机料法环状态概览
# ============================================================================
@router.get('/status-overview', summary='人机料法环状态概览')
@require_permission('resource.item.read')
def resource_status_overview(request):
    """
    聚合人机料法环五个维度的状态概览，供执行仪表盘使用。
    """
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Count

    today = timezone.now().date()
    result = {}

    # 人 (Personnel)
    try:
        from apps.hr.models import Staff
        staff_qs = Staff.objects.filter(is_deleted=False)
        total_staff = staff_qs.count()
        gcp_expiring = staff_qs.filter(
            gcp_expiry_date__isnull=False,
            gcp_expiry_date__lte=today + timedelta(days=30),
        ).count()
        result['personnel'] = {
            'total': total_staff,
            'available': staff_qs.filter(training_status='qualified').count(),
            'gcp_expiring': gcp_expiring,
        }
    except Exception:
        result['personnel'] = {'total': 0, 'available': 0, 'gcp_expiring': 0}

    # 机 (Equipment)
    try:
        from .models import ResourceItem
        eq_qs = ResourceItem.objects.filter(
            is_deleted=False, category__resource_type='equipment',
        )
        total_eq = eq_qs.count()
        active_eq = eq_qs.filter(status='active').count()
        calibration_expiring = eq_qs.filter(
            next_calibration_date__isnull=False,
            next_calibration_date__lte=today + timedelta(days=30),
        ).count()
        maintenance = eq_qs.filter(status='maintenance').count()
        result['equipment'] = {
            'total': total_eq,
            'active': active_eq,
            'calibration_expiring': calibration_expiring,
            'maintenance': maintenance,
        }
    except Exception:
        result['equipment'] = {'total': 0, 'active': 0, 'calibration_expiring': 0, 'maintenance': 0}

    # 料 (Material)
    try:
        from apps.sample.models import Product, SampleInstance
        product_qs = Product.objects.filter(is_deleted=False)
        total_products = product_qs.count()
        in_stock = SampleInstance.objects.filter(status='in_stock').count()
        expiring_soon = product_qs.filter(
            expiry_date__isnull=False,
            expiry_date__lte=today + timedelta(days=30),
        ).count()
        result['material'] = {
            'total': total_products,
            'in_stock': in_stock,
            'expiring_soon': expiring_soon,
            'low_stock': 0,
        }
    except Exception:
        result['material'] = {'total': 0, 'in_stock': 0, 'expiring_soon': 0, 'low_stock': 0}

    # 法 (Method/SOP)
    try:
        from apps.quality.models import SOP
        sop_qs = SOP.objects.filter(is_deleted=False)
        total_sops = sop_qs.count()
        effective = sop_qs.filter(status='effective').count()
        under_review = sop_qs.filter(status='under_review').count()
        result['method'] = {
            'total_sops': total_sops,
            'effective': effective,
            'under_review': under_review,
            'training_completion_rate': 0,
        }
    except Exception:
        result['method'] = {'total_sops': 0, 'effective': 0, 'under_review': 0, 'training_completion_rate': 0}

    # 环 (Environment)
    try:
        from .models import VenueEnvironmentLog, ResourceItem as RI
        venue_count = RI.objects.filter(
            is_deleted=False, category__resource_type='environment',
        ).count()
        recent_logs = VenueEnvironmentLog.objects.filter(
            recorded_at__gte=timezone.now() - timedelta(days=7),
        )
        total_logs = recent_logs.count()
        compliant_logs = recent_logs.filter(is_compliant=True).count()
        compliance_rate = round(compliant_logs / total_logs * 100, 1) if total_logs > 0 else 100
        result['environment'] = {
            'total_venues': venue_count,
            'compliant': compliant_logs,
            'non_compliant': total_logs - compliant_logs,
            'recent_compliance_rate': compliance_rate,
        }
    except Exception:
        result['environment'] = {'total_venues': 0, 'compliant': 0, 'non_compliant': 0, 'recent_compliance_rate': 100}

    return {'code': 200, 'msg': 'OK', 'data': result}
