"""
耗材管理 API

路由前缀：/api/v1/material/（或独立前缀）
Consumable CRUD、批次管理、出入库、退库、报废、流水、预警、统计
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from ninja import Query, Router, Schema

from apps.identity.decorators import _get_account_from_request, require_permission

from .services.consumable_service import (
    acknowledge_alert,
    check_and_generate_alerts,
    create_batch,
    create_consumable,
    delete_consumable,
    get_batch,
    get_consumable,
    get_consumable_stats,
    inbound_consumable,
    issue_consumable,
    list_alerts,
    list_batches,
    list_consumables,
    list_transactions,
    resolve_alert,
    return_consumable,
    scrap_consumable,
    update_consumable,
)

router = Router()


# ============================================================================
# Schema 定义
# ============================================================================


class ConsumableCreateIn(Schema):
    name: str
    code: str
    specification: Optional[str] = ''
    unit: Optional[str] = ''
    safety_stock: Optional[int] = 0
    storage_condition: Optional[str] = ''
    category: Optional[str] = ''
    supplier: Optional[str] = ''
    manufacturer: Optional[str] = ''
    unit_price: Optional[float] = None
    has_expiry: Optional[bool] = True
    shelf_life: Optional[int] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = ''


class ConsumableUpdateIn(Schema):
    name: Optional[str] = None
    code: Optional[str] = None
    specification: Optional[str] = None
    unit: Optional[str] = None
    safety_stock: Optional[int] = None
    storage_condition: Optional[str] = None
    storage_location_text: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    unit_price: Optional[float] = None
    has_expiry: Optional[bool] = None
    default_shelf_life_days: Optional[int] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None


class ConsumableListQuery(Schema):
    category: Optional[str] = ''
    status: Optional[str] = ''
    keyword: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class BatchCreateIn(Schema):
    consumable_id: int
    batch_number: Optional[str] = None
    production_date: Optional[date] = None
    expiry_date: Optional[date] = None
    inbound_date: Optional[date] = None
    inbound_qty: int = 0
    inbound_price: Optional[float] = None
    location_text: Optional[str] = ''


class BatchListQuery(Schema):
    consumable_id: Optional[int] = None
    status: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class TransactionInboundIn(Schema):
    consumable_id: int
    batch_id: int
    quantity: int
    remarks: Optional[str] = ''


class TransactionIssueIn(Schema):
    consumable_id: int
    batch_id: int
    quantity: int
    purpose: Optional[str] = ''
    project_code: Optional[str] = ''
    work_order_id: Optional[int] = None
    remarks: Optional[str] = ''


class TransactionReturnIn(Schema):
    consumable_id: int
    batch_id: int
    quantity: int
    remarks: Optional[str] = ''


class TransactionScrapIn(Schema):
    consumable_id: int
    batch_id: int
    quantity: int
    remarks: Optional[str] = ''


class TransactionListQuery(Schema):
    consumable_id: Optional[int] = None
    type: Optional[str] = ''
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    page: int = 1
    page_size: int = 20


class AlertListQuery(Schema):
    consumable_id: Optional[int] = None
    alert_type: Optional[str] = ''
    status: Optional[str] = ''
    page: int = 1
    page_size: int = 20


class AlertResolveIn(Schema):
    note: Optional[str] = ''


# ============================================================================
# 序列化辅助
# ============================================================================


def _consumable_to_dict(c) -> dict:
    return {
        'id': c.id,
        'name': c.name,
        'code': c.code,
        'specification': c.specification or '',
        'unit': c.unit or '',
        'current_stock': c.current_stock,
        'safety_stock': c.safety_stock,
        'storage_condition': c.storage_condition or '',
        'storage_location_text': getattr(c, 'storage_location_text', '') or '',
        'expiry_date': str(c.expiry_date) if c.expiry_date else None,
        'status': c.status,
        'status_display': c.status_display,
        'category': c.category or '',
        'supplier': c.supplier or '',
        'manufacturer': c.manufacturer or '',
        'unit_price': float(c.unit_price) if c.unit_price is not None else None,
        'has_expiry': c.has_expiry,
        'default_shelf_life_days': c.default_shelf_life_days,
        'manager_id': c.manager_id,
        'manager_name': c.manager_name or '',
        'last_issue_date': str(c.last_issue_date) if c.last_issue_date else None,
        'create_time': c.create_time.isoformat() if c.create_time else '',
        'update_time': c.update_time.isoformat() if c.update_time else '',
    }


def _batch_to_dict(b) -> dict:
    return {
        'id': b.id,
        'consumable_id': b.consumable_id,
        'consumable_name': b.consumable.name if b.consumable else '',
        'consumable_code': b.consumable.code if b.consumable else '',
        'batch_number': b.batch_number,
        'production_date': str(b.production_date) if b.production_date else None,
        'expiry_date': str(b.expiry_date) if b.expiry_date else None,
        'inbound_date': str(b.inbound_date) if b.inbound_date else None,
        'inbound_quantity': b.inbound_quantity,
        'inbound_price': float(b.inbound_price) if b.inbound_price is not None else None,
        'remaining_quantity': b.remaining_quantity,
        'status': b.status,
        'storage_location_text': b.storage_location_text or '',
        'create_time': b.create_time.isoformat() if b.create_time else '',
        'update_time': b.update_time.isoformat() if b.update_time else '',
    }


def _transaction_to_dict(t) -> dict:
    return {
        'id': t.id,
        'consumable_id': t.consumable_id,
        'consumable_name': t.consumable.name if t.consumable else '',
        'consumable_code': t.consumable.code if t.consumable else '',
        'batch_id': t.batch_id,
        'batch_number': t.batch.batch_number if t.batch else '',
        'transaction_type': t.transaction_type,
        'quantity': t.quantity,
        'operator_id': t.operator_id,
        'operator_name': t.operator_name or '',
        'purpose': t.purpose or '',
        'project_code': t.project_code or '',
        'work_order_id': t.work_order_id,
        'unit_cost': float(t.unit_cost) if t.unit_cost is not None else None,
        'total_cost': float(t.total_cost) if t.total_cost is not None else None,
        'remarks': t.remarks or '',
        'create_time': t.create_time.isoformat() if t.create_time else '',
    }


def _alert_to_dict(a) -> dict:
    return {
        'id': a.id,
        'consumable_id': a.consumable_id,
        'consumable_name': a.consumable.name if a.consumable else '',
        'consumable_code': a.consumable.code if a.consumable else '',
        'batch_id': a.batch_id,
        'batch_number': a.batch.batch_number if a.batch else '',
        'alert_type': a.alert_type,
        'alert_message': a.alert_message or '',
        'severity': a.severity,
        'status': a.status,
        'acknowledged_by_id': a.acknowledged_by_id,
        'acknowledged_by_name': a.acknowledged_by_name or '',
        'acknowledged_at': a.acknowledged_at.isoformat() if a.acknowledged_at else None,
        'resolution_note': a.resolution_note or '',
        'create_time': a.create_time.isoformat() if a.create_time else '',
        'update_time': a.update_time.isoformat() if a.update_time else '',
    }


# ============================================================================
# Consumable CRUD (prefix consumable-items/)
# ============================================================================


@router.post('/consumable-items/create', summary='创建耗材')
@require_permission('resource.material.write')
def consumable_create(request, data: ConsumableCreateIn):
    unit_price = Decimal(str(data.unit_price)) if data.unit_price is not None else None
    c = create_consumable(
        name=data.name,
        code=data.code,
        specification=data.specification or '',
        unit=data.unit or '',
        safety_stock=data.safety_stock or 0,
        storage_condition=data.storage_condition or '',
        category=data.category or '',
        supplier=data.supplier or '',
        manufacturer=data.manufacturer or '',
        unit_price=unit_price,
        has_expiry=data.has_expiry if data.has_expiry is not None else True,
        shelf_life=data.shelf_life,
        manager_id=data.manager_id,
        manager_name=data.manager_name or '',
    )
    return {'code': 0, 'msg': 'ok', 'data': _consumable_to_dict(c)}


@router.get('/consumable-items', summary='耗材列表')
@require_permission('resource.material.read')
def consumable_list(request, params: ConsumableListQuery = Query(...)):
    result = list_consumables(
        category=params.category or '',
        status=params.status or '',
        keyword=params.keyword or '',
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0,
        'msg': 'ok',
        'data': {
            'items': [_consumable_to_dict(c) for c in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.get('/consumable-items/{consumable_id}', summary='耗材详情')
@require_permission('resource.material.read')
def consumable_detail(request, consumable_id: int):
    c = get_consumable(consumable_id)
    if not c:
        return 404, {'code': 404, 'msg': '耗材不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _consumable_to_dict(c)}


@router.put('/consumable-items/{consumable_id}', summary='更新耗材')
@require_permission('resource.material.write')
def consumable_update(request, consumable_id: int, data: ConsumableUpdateIn):
    kwargs = {k: v for k, v in data.dict().items() if v is not None}
    if 'unit_price' in kwargs and kwargs['unit_price'] is not None:
        kwargs['unit_price'] = Decimal(str(kwargs['unit_price']))
    c = update_consumable(consumable_id, **kwargs)
    if not c:
        return 404, {'code': 404, 'msg': '耗材不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _consumable_to_dict(c)}


@router.delete('/consumable-items/{consumable_id}', summary='软删除耗材')
@require_permission('resource.material.write')
def consumable_delete(request, consumable_id: int):
    ok = delete_consumable(consumable_id)
    if not ok:
        return 404, {'code': 404, 'msg': '耗材不存在'}
    return {'code': 0, 'msg': 'ok', 'data': {'id': consumable_id}}


# ============================================================================
# Consumable Batch (prefix consumable-batches/)
# ============================================================================


@router.post('/consumable-batches/create', summary='创建耗材批次')
@require_permission('resource.material.write')
def batch_create(request, data: BatchCreateIn):
    inbound_price = (
        Decimal(str(data.inbound_price)) if data.inbound_price is not None else None
    )
    batch = create_batch(
        consumable_id=data.consumable_id,
        batch_number=data.batch_number,
        production_date=data.production_date,
        expiry_date=data.expiry_date,
        inbound_date=data.inbound_date,
        inbound_qty=data.inbound_qty,
        inbound_price=inbound_price,
        location_text=data.location_text or '',
    )
    if not batch:
        return 400, {'code': 400, 'msg': '创建失败（耗材不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _batch_to_dict(batch)}


@router.get('/consumable-batches', summary='批次列表')
@require_permission('resource.material.read')
def batch_list(request, params: BatchListQuery = Query(...)):
    result = list_batches(
        consumable_id=params.consumable_id,
        status=params.status or '',
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0,
        'msg': 'ok',
        'data': {
            'items': [_batch_to_dict(b) for b in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.get('/consumable-batches/{batch_id}', summary='批次详情')
@require_permission('resource.material.read')
def batch_detail(request, batch_id: int):
    b = get_batch(batch_id)
    if not b:
        return 404, {'code': 404, 'msg': '批次不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _batch_to_dict(b)}


# ============================================================================
# Transactions (prefix consumable-transactions/)
# ============================================================================


@router.post('/consumable-transactions/inbound', summary='入库')
@require_permission('resource.material.write')
def transaction_inbound(request, data: TransactionInboundIn):
    account = _get_account_from_request(request)
    tx = inbound_consumable(
        consumable_id=data.consumable_id,
        batch_id=data.batch_id,
        quantity=data.quantity,
        operator_id=account.id if account else None,
        operator_name=account.display_name if account else '',
        remarks=data.remarks or '',
    )
    if not tx:
        return 400, {'code': 400, 'msg': '入库失败（耗材/批次不存在或数量无效）'}
    return {'code': 0, 'msg': 'ok', 'data': _transaction_to_dict(tx)}


@router.post('/consumable-transactions/issue', summary='领用/出库')
@require_permission('resource.material.write')
def transaction_issue(request, data: TransactionIssueIn):
    account = _get_account_from_request(request)
    tx = issue_consumable(
        consumable_id=data.consumable_id,
        batch_id=data.batch_id,
        quantity=data.quantity,
        operator_id=account.id if account else None,
        operator_name=account.display_name if account else '',
        purpose=data.purpose or '',
        project_code=data.project_code or '',
        work_order_id=data.work_order_id,
        remarks=data.remarks or '',
    )
    if not tx:
        return 400, {'code': 400, 'msg': '领用失败（库存不足或耗材/批次不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _transaction_to_dict(tx)}


@router.post('/consumable-transactions/return', summary='退库')
@require_permission('resource.material.write')
def transaction_return(request, data: TransactionReturnIn):
    account = _get_account_from_request(request)
    tx = return_consumable(
        consumable_id=data.consumable_id,
        batch_id=data.batch_id,
        quantity=data.quantity,
        operator_id=account.id if account else None,
        operator_name=account.display_name if account else '',
        remarks=data.remarks or '',
    )
    if not tx:
        return 400, {'code': 400, 'msg': '退库失败（耗材/批次不存在或数量无效）'}
    return {'code': 0, 'msg': 'ok', 'data': _transaction_to_dict(tx)}


@router.post('/consumable-transactions/scrap', summary='报废')
@require_permission('resource.material.write')
def transaction_scrap(request, data: TransactionScrapIn):
    account = _get_account_from_request(request)
    tx = scrap_consumable(
        consumable_id=data.consumable_id,
        batch_id=data.batch_id,
        quantity=data.quantity,
        operator_id=account.id if account else None,
        operator_name=account.display_name if account else '',
        remarks=data.remarks or '',
    )
    if not tx:
        return 400, {'code': 400, 'msg': '报废失败（库存不足或耗材/批次不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _transaction_to_dict(tx)}


@router.get('/consumable-transactions', summary='流水列表')
@require_permission('resource.material.read')
def transaction_list(request, params: TransactionListQuery = Query(...)):
    result = list_transactions(
        consumable_id=params.consumable_id,
        transaction_type=params.type or '',
        start_date=params.start_date,
        end_date=params.end_date,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0,
        'msg': 'ok',
        'data': {
            'items': [_transaction_to_dict(t) for t in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


# ============================================================================
# Alerts (prefix consumable-alerts/)
# ============================================================================


@router.get('/consumable-alerts', summary='预警列表')
@require_permission('resource.material.read')
def alert_list(request, params: AlertListQuery = Query(...)):
    result = list_alerts(
        consumable_id=params.consumable_id,
        alert_type=params.alert_type or '',
        status=params.status or '',
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0,
        'msg': 'ok',
        'data': {
            'items': [_alert_to_dict(a) for a in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.post('/consumable-alerts/{alert_id}/acknowledge', summary='确认预警')
@require_permission('resource.material.write')
def alert_acknowledge(request, alert_id: int):
    account = _get_account_from_request(request)
    alert = acknowledge_alert(
        alert_id=alert_id,
        by_id=account.id if account else None,
        by_name=account.display_name if account else '',
    )
    if not alert:
        return 404, {'code': 404, 'msg': '预警不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _alert_to_dict(alert)}


@router.post('/consumable-alerts/{alert_id}/resolve', summary='解决预警')
@require_permission('resource.material.write')
def alert_resolve(request, alert_id: int, data: AlertResolveIn = None):
    account = _get_account_from_request(request)
    note = data.note if data else ''
    alert = resolve_alert(
        alert_id=alert_id,
        by_id=account.id if account else None,
        by_name=account.display_name if account else '',
        note=note or '',
    )
    if not alert:
        return 404, {'code': 404, 'msg': '预警不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _alert_to_dict(alert)}


@router.post('/consumable-alerts/check', summary='触发预警检查')
@require_permission('resource.material.write')
def alert_check(request):
    created = check_and_generate_alerts()
    return {'code': 0, 'msg': 'ok', 'data': {'created_count': created}}


# ============================================================================
# Stats (consumable-stats)
# ============================================================================


@router.get('/consumable-stats', summary='耗材统计')
@require_permission('resource.material.read')
def consumable_stats(request):
    data = get_consumable_stats()
    return {'code': 0, 'msg': 'ok', 'data': data}
