"""
物料管理 API

路由前缀：/api/v1/material/
覆盖约 20 个端点：仪表盘、产品台账、耗材、样品、流水、效期预警、库存
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import date

from apps.identity.decorators import require_permission, _get_account_from_request
from . import services_material as svc
from .models import SampleStatus

router = Router()


# ============================================================================
# Schema 定义
# ============================================================================

class ProductCreateIn(Schema):
    name: str
    code: str
    batch_number: Optional[str] = ''
    specification: Optional[str] = ''
    storage_condition: Optional[str] = ''
    expiry_date: Optional[date] = None
    product_type: Optional[str] = 'test_sample'
    sponsor: Optional[str] = ''
    description: Optional[str] = ''


class ConsumableCreateIn(Schema):
    name: str
    code: str
    specification: Optional[str] = ''
    unit: Optional[str] = ''
    safety_stock: Optional[int] = 0
    storage_condition: Optional[str] = ''
    category: Optional[str] = ''


class ConsumableIssueIn(Schema):
    quantity: int
    operator_name: Optional[str] = ''
    purpose: Optional[str] = ''
    work_order_id: Optional[int] = None


class SampleDistributeIn(Schema):
    holder: Optional[str] = ''
    enrollment_id: Optional[int] = None
    remarks: Optional[str] = ''


class SampleReturnIn(Schema):
    remarks: Optional[str] = ''
    weight: Optional[float] = None


class SampleDestroyIn(Schema):
    remarks: Optional[str] = ''
    approval_id: Optional[str] = ''


class ExpiryHandleIn(Schema):
    action: str
    remarks: Optional[str] = ''


class ProductQueryParams(Schema):
    keyword: Optional[str] = ''
    product_type: Optional[str] = ''
    storage_condition: Optional[str] = ''
    expiry_status: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class ConsumableQueryParams(Schema):
    category: Optional[str] = ''
    status: Optional[str] = ''
    keyword: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class SampleQueryParams(Schema):
    status: Optional[str] = ''
    product_id: Optional[int] = None
    keyword: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class TransactionQueryParams(Schema):
    transaction_type: Optional[str] = ''
    operator: Optional[str] = ''
    start_date: Optional[str] = ''
    end_date: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class InventoryQueryParams(Schema):
    zone: Optional[str] = ''
    status: Optional[str] = ''
    keyword: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class TraceQueryParams(Schema):
    code: Optional[str] = ''
    subject_id: Optional[str] = ''


# ============================================================================
# 序列化辅助
# ============================================================================

def _product_to_dict(p) -> dict:
    return {
        'id': p.id, 'name': p.name, 'code': p.code,
        'batch_number': p.batch_number, 'specification': p.specification,
        'storage_condition': p.storage_condition,
        'expiry_date': str(p.expiry_date) if p.expiry_date else None,
        'product_type': p.product_type,
        'product_type_display': p.product_type_display,
        'sponsor': p.sponsor, 'protocol_name': p.protocol_name,
        'sample_count': p.instances.count() if hasattr(p, 'instances') else 0,
        'in_stock_count': p.instances.filter(status=SampleStatus.IN_STOCK).count() if hasattr(p, 'instances') else 0,
        'distributed_count': p.instances.filter(status=SampleStatus.DISTRIBUTED).count() if hasattr(p, 'instances') else 0,
        'status': p.status,
        'create_time': p.create_time.isoformat() if p.create_time else '',
    }


def _consumable_to_dict(c) -> dict:
    return {
        'id': c.id, 'name': c.name, 'code': c.code,
        'specification': c.specification, 'unit': c.unit,
        'current_stock': c.current_stock, 'safety_stock': c.safety_stock,
        'storage_condition': c.storage_condition,
        'expiry_date': str(c.expiry_date) if c.expiry_date else None,
        'status': c.status, 'status_display': c.status_display,
        'category': c.category,
        'last_issue_date': str(c.last_issue_date) if c.last_issue_date else None,
    }


def _sample_to_dict(s) -> dict:
    return {
        'id': s.id, 'unique_code': s.unique_code,
        'product_id': s.product_id, 'product_name': s.product.name,
        'product_code': s.product.code,
        'status': s.status, 'status_display': s.get_status_display(),
        'current_holder': s.current_holder_name or None,
        'protocol_name': s.protocol.title if s.protocol else '',
        'storage_location': s.storage_location or None,
        'retention': s.retention,
        'create_time': s.create_time.isoformat() if s.create_time else '',
    }


def _transaction_to_dict(t) -> dict:
    TYPE_DISPLAY = {
        'inbound': '样品入库', 'distribute': '样品分发',
        'return': '样品回收', 'destroy': '样品销毁',
    }
    return {
        'id': t.id,
        'transaction_type': t.transaction_type,
        'type_display': TYPE_DISPLAY.get(t.transaction_type, t.get_transaction_type_display()),
        'material_name': t.sample.product.name if t.sample else '',
        'material_code': t.sample.product.code if t.sample else '',
        'batch_number': t.sample.product.batch_number if t.sample else '',
        'quantity': 1,
        'unit': '份',
        'operator_name': t.operator_name,
        'related_document': f'受试者 S{t.enrollment_id:03d}' if t.enrollment_id else (
            f'工单 WO-{t.work_order_id}' if t.work_order_id else ''
        ),
        'remarks': t.remarks,
        'create_time': t.create_time.isoformat() if t.create_time else '',
    }


# ============================================================================
# 仪表盘
# ============================================================================

@router.get('/dashboard', summary='物料总览仪表盘')
@require_permission('resource.material.read')
def dashboard(request):
    data = svc.get_material_dashboard()
    return {'code': 0, 'msg': 'ok', 'data': data}


# ============================================================================
# 产品台账
# ============================================================================

@router.get('/products/stats', summary='产品统计')
@require_permission('resource.material.read')
def product_stats(request):
    return {'code': 0, 'msg': 'ok', 'data': svc.get_product_stats()}


@router.get('/products', summary='产品列表')
@require_permission('resource.material.read')
def list_products(request, params: ProductQueryParams = Query(...)):
    result = svc.list_products(
        keyword=params.keyword or '', product_type=params.product_type or '',
        storage_condition=params.storage_condition or '',
        expiry_status=params.expiry_status or '',
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_product_to_dict(p) for p in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.get('/products/{product_id}', summary='产品详情')
@require_permission('resource.material.read')
def get_product(request, product_id: int):
    detail = svc.get_product_detail(product_id)
    if not detail:
        return 404, {'code': 404, 'msg': '产品不存在'}

    product = detail['product']
    data = _product_to_dict(product)
    data['description'] = product.description
    data['batches'] = [{
        'batch_number': product.batch_number,
        'quantity': product.instances.count(),
        'received_date': str(product.create_time.date()) if product.create_time else '',
        'expiry_date': str(product.expiry_date) if product.expiry_date else None,
    }]
    data['sample_summary'] = detail['sample_summary']
    data['retention_info'] = detail['retention_info']
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/products/create', summary='创建产品')
@require_permission('resource.material.write')
def create_product(request, data: ProductCreateIn):
    from .services import create_product as _create
    p = _create(
        name=data.name, code=data.code,
        batch_number=data.batch_number or '',
        specification=data.specification or '',
        storage_condition=data.storage_condition or '',
        expiry_date=data.expiry_date,
        description=data.description or '',
    )
    if data.product_type:
        p.product_type = data.product_type
    if data.sponsor:
        p.sponsor = data.sponsor
    p.save()
    return {'code': 0, 'msg': '产品创建成功', 'data': {'id': p.id, 'code': p.code, 'name': p.name}}


# ============================================================================
# 耗材管理
# ============================================================================

@router.get('/consumables/stats', summary='耗材统计')
@require_permission('resource.material.read')
def consumable_stats(request):
    return {'code': 0, 'msg': 'ok', 'data': svc.get_consumable_stats()}


@router.get('/consumables', summary='耗材列表')
@require_permission('resource.material.read')
def list_consumables(request, params: ConsumableQueryParams = Query(...)):
    result = svc.list_consumables(
        category=params.category or '', status=params.status or '',
        keyword=params.keyword or '',
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_consumable_to_dict(c) for c in result['items']],
            'total': result['total'],
        },
    }


@router.post('/consumables/create', summary='新增耗材')
@require_permission('resource.material.write')
def create_consumable(request, data: ConsumableCreateIn):
    c = svc.create_consumable(
        name=data.name, code=data.code,
        specification=data.specification or '',
        unit=data.unit or '',
        safety_stock=data.safety_stock or 0,
        storage_condition=data.storage_condition or '',
        category=data.category or '',
    )
    return {'code': 0, 'msg': '耗材创建成功', 'data': {'id': c.id, 'code': c.code, 'name': c.name}}


@router.post('/consumables/{consumable_id}/issue', summary='耗材领用')
@require_permission('resource.material.write')
def issue_consumable(request, consumable_id: int, data: ConsumableIssueIn):
    account = _get_account_from_request(request)
    c = svc.issue_consumable(
        consumable_id, data.quantity,
        operator_name=data.operator_name or (account.display_name if account else ''),
        operator_id=account.id if account else None,
        purpose=data.purpose or '',
        work_order_id=data.work_order_id,
    )
    if not c:
        return 400, {'code': 400, 'msg': '领用失败（库存不足或耗材不存在）'}
    return {'code': 0, 'msg': '领用成功', 'data': {'id': c.id, 'issued_quantity': data.quantity}}


# ============================================================================
# 样品管理
# ============================================================================

@router.get('/samples/stats', summary='样品统计')
@require_permission('resource.sample.read')
def sample_stats(request):
    return {'code': 0, 'msg': 'ok', 'data': svc.get_sample_stats()}


@router.get('/samples/trace', summary='追溯查询')
@require_permission('resource.sample.read')
def trace_sample(request, params: TraceQueryParams = Query(...)):
    result = svc.trace_sample(code=params.code or '', subject_id=params.subject_id or '')
    if not result:
        return 404, {'code': 404, 'msg': '未找到匹配样品'}
    return {'code': 0, 'msg': 'ok', 'data': result}


@router.get('/samples', summary='样品列表')
@require_permission('resource.sample.read')
def list_samples(request, params: SampleQueryParams = Query(...)):
    from .models import SampleInstance
    qs = SampleInstance.objects.select_related('product', 'protocol').all()

    if params.status:
        qs = qs.filter(status=params.status)
    if params.product_id:
        qs = qs.filter(product_id=params.product_id)
    if params.keyword:
        from django.db.models import Q
        qs = qs.filter(
            Q(unique_code__icontains=params.keyword) |
            Q(product__name__icontains=params.keyword)
        )

    total = qs.count()
    offset = (params.page - 1) * params.page_size
    items = list(qs[offset:offset + params.page_size])
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_sample_to_dict(s) for s in items],
            'total': total,
        },
    }


@router.get('/samples/{sample_id}', summary='样品详情')
@require_permission('resource.sample.read')
def get_sample(request, sample_id: int):
    from .models import SampleInstance, SampleTransaction
    sample = SampleInstance.objects.select_related('product', 'protocol').filter(id=sample_id).first()
    if not sample:
        return 404, {'code': 404, 'msg': '样品不存在'}

    data = _sample_to_dict(sample)
    txs = SampleTransaction.objects.filter(sample=sample).order_by('create_time')
    data['transactions'] = [{
        'id': t.id,
        'transaction_type': t.transaction_type,
        'transaction_type_display': t.get_transaction_type_display(),
        'operator_name': t.operator_name,
        'remarks': t.remarks,
        'create_time': t.create_time.isoformat(),
        'enrollment_id': t.enrollment_id,
    } for t in txs]

    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/samples/{sample_id}/distribute', summary='分发样品')
@require_permission('resource.sample.write')
def distribute_sample(request, sample_id: int, data: SampleDistributeIn):
    from .services import distribute_sample as _dist
    account = _get_account_from_request(request)
    s = _dist(
        sample_id,
        enrollment_id=data.enrollment_id,
        operator_name=account.display_name if account else '',
        operator_id=account.id if account else None,
        remarks=data.remarks or '',
    )
    if not s:
        return 400, {'code': 400, 'msg': '分发失败'}
    if data.holder:
        s.current_holder_name = data.holder
        s.save(update_fields=['current_holder_name'])
    return {'code': 0, 'msg': '已分发', 'data': _sample_to_dict(s)}


@router.post('/samples/{sample_id}/return', summary='回收样品')
@require_permission('resource.sample.write')
def return_sample(request, sample_id: int, data: SampleReturnIn = None):
    from .services import return_sample as _ret
    account = _get_account_from_request(request)
    s = _ret(
        sample_id,
        operator_name=account.display_name if account else '',
        operator_id=account.id if account else None,
        remarks=data.remarks if data else '',
    )
    if not s:
        return 400, {'code': 400, 'msg': '回收失败'}
    # 样品追踪员记忆写入：样品回收事件沉淀为情景记忆
    try:
        from apps.secretary.memory_service import remember
        remember(
            worker_code='sample_tracker',
            memory_type='episodic',
            content=f'样品 {s.unique_code} 已回收，操作人 {account.display_name if account else "系统"}',
            summary=f'样品回收: {s.unique_code}',
            subject_type='sample',
            subject_key=str(s.id),
            importance_score=60,
        )
    except Exception:
        pass
    return {'code': 0, 'msg': '已回收', 'data': _sample_to_dict(s)}


@router.post('/samples/{sample_id}/destroy', summary='销毁样品')
@require_permission('resource.sample.destroy')
def destroy_sample(request, sample_id: int, data: SampleDestroyIn = None):
    from .services import destroy_sample as _des
    account = _get_account_from_request(request)
    s = _des(
        sample_id,
        operator_name=account.display_name if account else '',
        operator_id=account.id if account else None,
        remarks=data.remarks if data else '',
    )
    if not s:
        return 400, {'code': 400, 'msg': '销毁失败'}
    # 样品追踪员记忆写入：样品销毁事件沉淀
    try:
        from apps.secretary.memory_service import remember
        remember(
            worker_code='sample_tracker',
            memory_type='episodic',
            content=f'样品 {s.unique_code} 已销毁，操作人 {account.display_name if account else "系统"}',
            summary=f'样品销毁: {s.unique_code}',
            subject_type='sample',
            subject_key=str(s.id),
            importance_score=65,
        )
    except Exception:
        pass
    return {'code': 0, 'msg': '已销毁', 'data': _sample_to_dict(s)}


# ============================================================================
# 出入库流水
# ============================================================================

@router.get('/transactions/stats', summary='流水统计')
@require_permission('resource.material.read')
def transaction_stats(request):
    return {'code': 0, 'msg': 'ok', 'data': svc.get_transaction_stats()}


@router.get('/transactions', summary='出入库流水列表')
@require_permission('resource.material.read')
def list_transactions(request, params: TransactionQueryParams = Query(...)):
    result = svc.list_transactions(
        transaction_type=params.transaction_type or '',
        operator=params.operator or '',
        start_date=params.start_date or '',
        end_date=params.end_date or '',
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_transaction_to_dict(t) for t in result['items']],
            'total': result['total'],
        },
    }


# ============================================================================
# 效期预警
# ============================================================================

@router.get('/expiry-alerts', summary='效期预警列表')
@require_permission('resource.material.read')
def get_expiry_alerts(request):
    data = svc.get_expiry_alerts()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/expiry-alerts/{alert_id}/handle', summary='处置效期预警')
@require_permission('resource.material.write')
def handle_expiry_alert(request, alert_id: int, data: ExpiryHandleIn):
    alert = svc.handle_expiry_alert(alert_id, action=data.action, remarks=data.remarks or '')
    if not alert:
        return 404, {'code': 404, 'msg': '预警不存在'}
    return {'code': 0, 'msg': '处置成功', 'data': {'id': alert.id, 'status': alert.status}}


# ============================================================================
# 库存管理
# ============================================================================

@router.get('/inventory/overview', summary='库存概况')
@require_permission('resource.inventory.read')
def inventory_overview(request):
    data = svc.get_inventory_overview()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/inventory', summary='库存列表')
@require_permission('resource.inventory.read')
def list_inventory(request, params: InventoryQueryParams = Query(...)):
    result = svc.list_inventory(
        zone=params.zone or '', status=params.status or '',
        keyword=params.keyword or '',
        page=params.page, page_size=params.page_size,
    )
    return {'code': 0, 'msg': 'ok', 'data': result}


@router.post('/inventory/check', summary='发起盘点')
@require_permission('resource.inventory.write')
def start_check(request):
    account = _get_account_from_request(request)
    check = svc.start_inventory_check(
        checker_name=account.display_name if account else '',
        checker_id=account.id if account else None,
    )
    return {'code': 0, 'msg': '盘点已发起', 'data': {'id': check.id, 'status': check.status}}


@router.get('/inventory/check', summary='最近盘点记录')
@require_permission('resource.inventory.read')
def get_check(request):
    check = svc.get_latest_check()
    if not check:
        return {'code': 0, 'msg': 'ok', 'data': None}
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'id': check.id,
            'check_date': str(check.check_date),
            'status': check.status,
            'status_display': check.get_status_display(),
            'checker': check.checker_name,
            'total_items': check.total_items,
            'matched_items': check.matched_items,
            'discrepancy_items': check.discrepancy_items,
            'discrepancies': check.discrepancy_details,
        },
    }


@router.get('/storage-locations', summary='库位列表')
@require_permission('resource.inventory.read')
def get_storage_locations(request):
    from .models_material import StorageLocation
    locations = StorageLocation.objects.all()
    zone_data = {}
    for loc in locations:
        if loc.zone not in zone_data:
            zone_data[loc.zone] = {
                'id': loc.id,
                'zone': loc.zone,
                'zone_display': loc.get_zone_display(),
                'shelf': loc.shelf,
                'positions': [],
            }
        zone_data[loc.zone]['positions'].append(loc.position)

    return {'code': 0, 'msg': 'ok', 'data': list(zone_data.values())}
