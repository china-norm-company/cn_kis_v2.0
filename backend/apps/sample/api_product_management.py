"""
产品管理 API

路由前缀：/api/v1/product-management/（或由主路由挂载决定）
覆盖：批次、入库、库存、套件、分发、使用、回收、销毁、召回。
"""
from datetime import date
from typing import Optional, List, Any

from ninja import Router, Schema, Query

from apps.identity.decorators import require_permission, _get_account_from_request
from .services.product_management_service import (
    create_batch,
    receive_batch,
    release_batch,
    list_batches,
    get_batch,
    create_product_receipt,
    inspect_product_receipt,
    list_product_receipts,
    get_inventory_summary,
    list_inventories,
    create_kit,
    assign_kit,
    distribute_kit,
    list_kits,
    get_kit,
    create_dispensing,
    check_existing_active_dispensing,
    prepare_dispensing,
    execute_dispensing,
    confirm_dispensing,
    list_dispensings,
    create_usage,
    list_usages,
    create_product_return,
    execute_product_return,
    inspect_product_return,
    process_product_return,
    list_product_returns,
    create_product_destruction,
    approve_product_destruction,
    execute_product_destruction,
    list_product_destructions,
    create_recall,
    add_recall_action,
    execute_recall_action,
    complete_recall,
    list_recalls,
)

router = Router()


# ============================================================================
# Schema 定义
# ============================================================================

class BatchCreateIn(Schema):
    product_id: int
    batch_no: str
    manufacture_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity: int = 0
    unit: str = '个'
    supplier: str = ''
    coa_number: str = ''
    location_id: Optional[int] = None


class BatchReceiveIn(Schema):
    name: Optional[str] = ''


class BatchReleaseIn(Schema):
    name: Optional[str] = ''
    notes: Optional[str] = ''


class BatchQueryParams(Schema):
    product_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ProductReceiptCreateIn(Schema):
    product_id: int
    batch_id: Optional[int] = None
    expected_qty: int = 0
    source_type: str = ''
    supplier: str = ''
    po_number: str = ''
    delivery_note: str = ''


class ProductReceiptInspectIn(Schema):
    packaging_intact: Optional[bool] = None
    label_correct: Optional[bool] = None
    quantity_match: Optional[bool] = None
    documents_complete: Optional[bool] = None
    temperature_compliant: Optional[bool] = None
    appearance_normal: Optional[bool] = None
    arrival_temp: Optional[float] = None
    accepted_qty: int = 0
    rejected_qty: int = 0
    notes: Optional[str] = ''
    location_id: Optional[int] = None


class ProductReceiptQueryParams(Schema):
    product_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ProductInventoryQueryParams(Schema):
    product_id: int
    page: int = 1
    page_size: int = 20


class KitCreateIn(Schema):
    product_id: int
    batch_id: Optional[int] = None
    randomization_code: str = ''
    treatment_group: str = ''
    blinding_code: str = ''
    quantity: int = 1
    location_id: Optional[int] = None


class KitAssignIn(Schema):
    subject_id: int
    subject_code: str
    name: Optional[str] = ''


class KitDistributeIn(Schema):
    name: Optional[str] = ''
    visit: Optional[str] = ''


class KitQueryParams(Schema):
    product_id: Optional[int] = None
    status: Optional[str] = None
    subject_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


class DispensingCreateIn(Schema):
    subject_id: int
    subject_code: str
    visit_code: str = ''
    visit_date: Optional[date] = None
    kit_id: Optional[int] = None
    product_id: int
    batch_id: Optional[int] = None
    quantity: int = 0
    work_order_id: Optional[int] = None


class DispensingPrepareIn(Schema):
    name: Optional[str] = ''


class DispensingExecuteIn(Schema):
    name: Optional[str] = ''


class DispensingQueryParams(Schema):
    subject_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class UsageCreateIn(Schema):
    dispensing_id: int
    period_start: date
    period_end: date
    expected_usage: int = 0
    actual_usage: Optional[int] = None
    remaining: Optional[int] = None
    compliance_status: str = 'not_assessed'
    compliance_rate: Optional[float] = None
    usage_log: Optional[List[Any]] = None
    deviation: str = ''
    adverse_event: str = ''
    name: Optional[str] = ''


class UsageQueryParams(Schema):
    dispensing_id: int
    compliance_status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ProductReturnCreateIn(Schema):
    dispensing_id: Optional[int] = None
    subject_id: Optional[int] = None
    subject_code: str = ''
    product_id: int
    kit_id: Optional[int] = None
    return_reason: str = ''
    detail: str = ''
    returned_qty: int = 0
    unused_qty: Optional[int] = None
    used_qty: Optional[int] = None


class ProductReturnExecuteIn(Schema):
    name: Optional[str] = ''
    condition: Optional[str] = ''


class ProductReturnInspectIn(Schema):
    name: Optional[str] = ''
    notes: Optional[str] = ''


class ProductReturnProcessIn(Schema):
    method: str
    name: Optional[str] = ''


class ProductReturnQueryParams(Schema):
    subject_id: Optional[int] = None
    product_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class DestructionItemIn(Schema):
    product_id: int
    batch_id: Optional[int] = None
    kit_id: Optional[int] = None
    quantity: int


class ProductDestructionCreateIn(Schema):
    items_data: List[DestructionItemIn]
    reason: str
    method: str
    location: str = ''
    name: Optional[str] = ''


class ProductDestructionApproveIn(Schema):
    name: Optional[str] = ''
    notes: Optional[str] = ''


class ProductDestructionExecuteIn(Schema):
    name: Optional[str] = ''
    witness: str = ''
    photos: Optional[List[str]] = None
    certificate: str = ''


class ProductDestructionQueryParams(Schema):
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class RecallCreateIn(Schema):
    product_id: int
    batch_ids: Optional[List[int]] = None
    recall_level: str = ''
    reason: str = ''
    description: str = ''
    health_hazard: str = ''
    strategy: str = ''
    notification_method: str = ''
    name: Optional[str] = ''


class RecallActionCreateIn(Schema):
    action_type: str
    description: str
    target_subject_id: Optional[int] = None
    target_subject_code: str = ''
    target_kit_id: Optional[int] = None
    planned_date: Optional[date] = None
    name: Optional[str] = ''


class RecallActionExecuteIn(Schema):
    name: Optional[str] = ''
    result: Optional[str] = ''


class RecallCompleteIn(Schema):
    notes: Optional[str] = ''
    effectiveness: Optional[str] = ''


class RecallQueryParams(Schema):
    product_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 序列化辅助
# ============================================================================

def _batch_to_dict(b) -> dict:
    return {
        'id': b.id,
        'batch_no': b.batch_no,
        'product_id': b.product_id,
        'product_name': b.product.name if b.product else None,
        'status': b.status,
        'manufacture_date': str(b.manufacture_date) if b.manufacture_date else None,
        'expiry_date': str(b.expiry_date) if b.expiry_date else None,
        'quantity': b.quantity,
        'unit': b.unit,
        'supplier': b.supplier,
        'coa_number': b.coa_number,
        'location_id': b.storage_location_id,
        'received_at': b.received_at.isoformat() if b.received_at else None,
        'released_at': b.released_at.isoformat() if b.released_at else None,
        'create_time': b.create_time.isoformat() if b.create_time else None,
    }


def _receipt_to_dict(r) -> dict:
    return {
        'id': r.id,
        'receipt_no': r.receipt_no,
        'product_id': r.product_id,
        'product_name': r.product.name if r.product else None,
        'batch_id': r.batch_id,
        'status': r.status,
        'expected_quantity': r.expected_quantity,
        'accepted_quantity': r.accepted_quantity,
        'rejected_quantity': r.rejected_quantity,
        'supplier': r.supplier,
        'create_time': r.create_time.isoformat() if r.create_time else None,
    }


def _inventory_to_dict(i) -> dict:
    return {
        'id': i.id,
        'product_id': i.product_id,
        'batch_id': i.batch_id,
        'batch_no': i.batch.batch_no if i.batch else None,
        'location_id': i.location_id,
        'quantity': i.quantity,
        'available_quantity': i.available_quantity,
        'reserved_quantity': i.reserved_quantity,
    }


def _kit_to_dict(k) -> dict:
    return {
        'id': k.id,
        'kit_number': k.kit_number,
        'product_id': k.product_id,
        'product_name': k.product.name if k.product else None,
        'batch_id': k.batch_id,
        'status': k.status,
        'randomization_code': k.randomization_code,
        'treatment_group': k.treatment_group,
        'subject_id': k.subject_id,
        'subject_code': k.subject_code,
        'create_time': k.create_time.isoformat() if k.create_time else None,
    }


def _dispensing_to_dict(d) -> dict:
    return {
        'id': d.id,
        'dispensing_no': d.dispensing_no,
        'subject_id': d.subject_id,
        'subject_code': d.subject_code,
        'product_id': d.product_id,
        'product_name': d.product.name if d.product else None,
        'kit_id': d.kit_id,
        'quantity_dispensed': d.quantity_dispensed,
        'status': d.status,
        'visit_code': d.visit_code,
        'create_time': d.create_time.isoformat() if d.create_time else None,
    }


def _usage_to_dict(u) -> dict:
    return {
        'id': u.id,
        'dispensing_id': u.dispensing_id,
        'period_start': str(u.period_start) if u.period_start else None,
        'period_end': str(u.period_end) if u.period_end else None,
        'expected_usage': u.expected_usage,
        'actual_usage': u.actual_usage,
        'remaining_quantity': u.remaining_quantity,
        'compliance_status': u.compliance_status,
        'compliance_rate': float(u.compliance_rate) if u.compliance_rate is not None else None,
        'create_time': u.create_time.isoformat() if u.create_time else None,
    }


def _return_to_dict(r) -> dict:
    return {
        'id': r.id,
        'return_no': r.return_no,
        'product_id': r.product_id,
        'product_name': r.product.name if r.product else None,
        'subject_id': r.subject_id,
        'subject_code': r.subject_code,
        'status': r.status,
        'return_reason': r.return_reason,
        'returned_quantity': r.returned_quantity,
        'create_time': r.create_time.isoformat() if r.create_time else None,
    }


def _destruction_to_dict(d) -> dict:
    items = [
        {
            'product_id': i.product_id,
            'batch_id': i.batch_id,
            'kit_id': i.kit_id,
            'quantity': i.quantity,
        }
        for i in getattr(d, 'items', []) or []
    ]
    return {
        'id': d.id,
        'destruction_no': d.destruction_no,
        'status': d.status,
        'destruction_reason': d.destruction_reason,
        'destruction_method': d.destruction_method,
        'total_quantity': d.total_quantity,
        'items': items,
        'create_time': d.create_time.isoformat() if d.create_time else None,
    }


def _recall_to_dict(r) -> dict:
    return {
        'id': r.id,
        'recall_no': r.recall_no,
        'recall_title': r.recall_title,
        'product_id': r.product_id,
        'product_name': r.product.name if r.product else None,
        'status': r.status,
        'recall_level': r.recall_level,
        'recall_reason': r.recall_reason,
        'create_time': r.create_time.isoformat() if r.create_time else None,
    }


def _recall_action_to_dict(a) -> dict:
    return {
        'id': a.id,
        'recall_id': a.recall_id,
        'action_type': a.action_type,
        'action_description': a.action_description,
        'status': a.status,
        'target_subject_id': a.target_subject_id,
        'target_kit_id': a.target_kit_id,
        'create_time': a.create_time.isoformat() if a.create_time else None,
    }


# ============================================================================
# Batch endpoints (batches/)
# ============================================================================

@router.post('/batches/create', summary='创建批次')
@require_permission('resource.material.write')
def batch_create(request, data: BatchCreateIn):
    try:
        batch = create_batch(
            product_id=data.product_id,
            batch_no=data.batch_no,
            manufacture_date=data.manufacture_date,
            expiry_date=data.expiry_date,
            quantity=data.quantity,
            unit=data.unit,
            supplier=data.supplier,
            coa_number=data.coa_number,
            location_id=data.location_id,
        )
        return {'code': 0, 'msg': 'ok', 'data': _batch_to_dict(batch)}
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}


@router.get('/batches', summary='批次列表')
@require_permission('resource.material.read')
def batch_list(request, params: BatchQueryParams = Query(...)):
    result = list_batches(
        product_id=params.product_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_batch_to_dict(b) for b in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/batches/{batch_id}', summary='批次详情')
@require_permission('resource.material.read')
def batch_detail(request, batch_id: int):
    batch = get_batch(batch_id)
    if not batch:
        return 404, {'code': 404, 'msg': '批次不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _batch_to_dict(batch)}


@router.post('/batches/{batch_id}/receive', summary='标记批次已入库')
@require_permission('resource.material.write')
def batch_receive(request, batch_id: int, data: BatchReceiveIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    batch = receive_batch(
        batch_id=batch_id,
        received_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username),
    )
    if not batch:
        return 404, {'code': 404, 'msg': '批次不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _batch_to_dict(batch)}


@router.post('/batches/{batch_id}/release', summary='放行批次')
@require_permission('resource.material.write')
def batch_release(request, batch_id: int, data: BatchReleaseIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    batch = release_batch(
        batch_id=batch_id,
        released_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
        notes=data.notes or '' if data else '',
    )
    if not batch:
        return 404, {'code': 404, 'msg': '批次不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _batch_to_dict(batch)}


# ============================================================================
# Product Receipt endpoints (product-receipts/)
# ============================================================================

@router.post('/product-receipts/create', summary='创建入库单')
@require_permission('resource.material.write')
def product_receipt_create(request, data: ProductReceiptCreateIn):
    try:
        receipt = create_product_receipt(
            product_id=data.product_id,
            batch_id=data.batch_id,
            expected_qty=data.expected_qty,
            source_type=data.source_type,
            supplier=data.supplier,
            po_number=data.po_number,
            delivery_note=data.delivery_note,
        )
        return {'code': 0, 'msg': 'ok', 'data': _receipt_to_dict(receipt)}
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}


@router.get('/product-receipts', summary='入库单列表')
@require_permission('resource.material.read')
def product_receipt_list(request, params: ProductReceiptQueryParams = Query(...)):
    result = list_product_receipts(
        product_id=params.product_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_receipt_to_dict(r) for r in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/product-receipts/{receipt_id}/inspect', summary='验收入库单')
@require_permission('resource.material.write')
def product_receipt_inspect(request, receipt_id: int, data: ProductReceiptInspectIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    checks = {}
    if data:
        if data.packaging_intact is not None:
            checks['packaging_intact'] = data.packaging_intact
        if data.label_correct is not None:
            checks['label_correct'] = data.label_correct
        if data.quantity_match is not None:
            checks['quantity_match'] = data.quantity_match
        if data.documents_complete is not None:
            checks['documents_complete'] = data.documents_complete
        if data.temperature_compliant is not None:
            checks['temperature_compliant'] = data.temperature_compliant
        if data.appearance_normal is not None:
            checks['appearance_normal'] = data.appearance_normal
    receipt = inspect_product_receipt(
        receipt_id=receipt_id,
        checks_dict=checks or None,
        arrival_temp=data.arrival_temp if data else None,
        accepted_qty=data.accepted_qty if data else 0,
        rejected_qty=data.rejected_qty if data else 0,
        inspected_by_id=account.id,
        name=account.display_name if hasattr(account, 'display_name') else account.username,
        notes=data.notes or '' if data else '',
        location_id=data.location_id if data else None,
    )
    if not receipt:
        return 404, {'code': 404, 'msg': '入库单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _receipt_to_dict(receipt)}


# ============================================================================
# Product Inventory endpoints (product-inventory/)
# ============================================================================

@router.get('/product-inventory/{product_id}', summary='产品库存汇总')
@require_permission('resource.material.read')
def product_inventory_summary(request, product_id: int):
    data = get_inventory_summary(product_id)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/product-inventory', summary='产品库存列表')
@require_permission('resource.material.read')
def product_inventory_list(request, params: ProductInventoryQueryParams = Query(...)):
    result = list_inventories(
        product_id=params.product_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_inventory_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


# ============================================================================
# Kit endpoints (kits/)
# ============================================================================

@router.post('/kits/create', summary='创建套件')
@require_permission('resource.material.write')
def kit_create(request, data: KitCreateIn):
    try:
        kit = create_kit(
            product_id=data.product_id,
            batch_id=data.batch_id,
            randomization_code=data.randomization_code,
            treatment_group=data.treatment_group,
            blinding_code=data.blinding_code,
            quantity=data.quantity,
            location_id=data.location_id,
        )
        return {'code': 0, 'msg': 'ok', 'data': _kit_to_dict(kit)}
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}


@router.get('/kits', summary='套件列表')
@require_permission('resource.material.read')
def kit_list(request, params: KitQueryParams = Query(...)):
    result = list_kits(
        product_id=params.product_id,
        status=params.status,
        subject_id=params.subject_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_kit_to_dict(k) for k in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/kits/{kit_id}', summary='套件详情')
@require_permission('resource.material.read')
def kit_detail(request, kit_id: int):
    kit = get_kit(kit_id)
    if not kit:
        return 404, {'code': 404, 'msg': '套件不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _kit_to_dict(kit)}


@router.post('/kits/{kit_id}/assign', summary='分配套件给受试者')
@require_permission('resource.material.write')
def kit_assign(request, kit_id: int, data: KitAssignIn):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    kit = assign_kit(
        kit_id=kit_id,
        subject_id=data.subject_id,
        subject_code=data.subject_code,
        assigned_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username),
    )
    if not kit:
        return 404, {'code': 404, 'msg': '套件不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _kit_to_dict(kit)}


@router.post('/kits/{kit_id}/distribute', summary='分发套件')
@require_permission('resource.material.write')
def kit_distribute(request, kit_id: int, data: KitDistributeIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    kit = distribute_kit(
        kit_id=kit_id,
        distributed_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
        visit=data.visit or '' if data else '',
    )
    if not kit:
        return 404, {'code': 404, 'msg': '套件不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _kit_to_dict(kit)}


# ============================================================================
# Dispensing endpoints (dispensings/)
# ============================================================================

@router.post('/dispensings/create', summary='创建分发单')
@require_permission('resource.sample.dispense')
def dispensing_create(request, data: DispensingCreateIn):
    try:
        dispensing = create_dispensing(
            subject_id=data.subject_id,
            subject_code=data.subject_code,
            visit_code=data.visit_code,
            visit_date=data.visit_date,
            kit_id=data.kit_id,
            product_id=data.product_id,
            batch_id=data.batch_id,
            quantity=data.quantity,
            work_order_id=data.work_order_id,
        )
        return {'code': 0, 'msg': 'ok', 'data': _dispensing_to_dict(dispensing)}
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}


@router.get('/dispensings', summary='分发单列表')
@require_permission('resource.material.read')
def dispensing_list(request, params: DispensingQueryParams = Query(...)):
    result = list_dispensings(
        subject_id=params.subject_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_dispensing_to_dict(d) for d in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/dispensings/{dispensing_id}/prepare', summary='备货')
@require_permission('resource.material.write')
def dispensing_prepare(request, dispensing_id: int, data: DispensingPrepareIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    dispensing = prepare_dispensing(
        dispensing_id=dispensing_id,
        prepared_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
    )
    if not dispensing:
        return 404, {'code': 404, 'msg': '分发单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _dispensing_to_dict(dispensing)}


@router.post('/dispensings/{dispensing_id}/execute', summary='执行分发')
@require_permission('resource.material.write')
def dispensing_execute(request, dispensing_id: int, data: DispensingExecuteIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    dispensing = execute_dispensing(
        dispensing_id=dispensing_id,
        dispensed_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
    )
    if not dispensing:
        return 404, {'code': 404, 'msg': '分发单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _dispensing_to_dict(dispensing)}


@router.post('/dispensings/{dispensing_id}/confirm', summary='确认分发')
@require_permission('resource.material.write')
def dispensing_confirm(request, dispensing_id: int):
    dispensing = confirm_dispensing(dispensing_id)
    if not dispensing:
        return 404, {'code': 404, 'msg': '分发单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _dispensing_to_dict(dispensing)}


# ============================================================================
# Usage endpoints (usages/)
# ============================================================================

@router.post('/usages/create', summary='创建使用记录')
@require_permission('resource.material.write')
def usage_create(request, data: UsageCreateIn):
    account = _get_account_from_request(request)
    usage = create_usage(
        dispensing_id=data.dispensing_id,
        period_start=data.period_start,
        period_end=data.period_end,
        expected_usage=data.expected_usage,
        actual_usage=data.actual_usage,
        remaining=data.remaining,
        compliance_status=data.compliance_status,
        compliance_rate=data.compliance_rate,
        usage_log=data.usage_log,
        deviation=data.deviation,
        adverse_event=data.adverse_event,
        recorded_by_id=account.id if account else None,
        name=data.name or (account.display_name if account and hasattr(account, 'display_name') else (account.username if account else '')),
    )
    if not usage:
        return 404, {'code': 404, 'msg': '分发记录不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _usage_to_dict(usage)}


@router.get('/usages', summary='使用记录列表')
@require_permission('resource.material.read')
def usage_list(request, params: UsageQueryParams = Query(...)):
    result = list_usages(
        dispensing_id=params.dispensing_id,
        compliance_status=params.compliance_status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_usage_to_dict(u) for u in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


# ============================================================================
# Product Return endpoints (product-returns/)
# ============================================================================

@router.post('/product-returns/create', summary='创建回收单')
@require_permission('resource.material.write')
def product_return_create(request, data: ProductReturnCreateIn):
    ret = create_product_return(
        dispensing_id=data.dispensing_id,
        subject_id=data.subject_id,
        subject_code=data.subject_code,
        product_id=data.product_id,
        kit_id=data.kit_id,
        return_reason=data.return_reason,
        detail=data.detail,
        returned_qty=data.returned_qty,
        unused_qty=data.unused_qty,
        used_qty=data.used_qty,
    )
    if not ret:
        return 400, {'code': 400, 'msg': '产品不存在或创建失败'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(ret)}


@router.get('/product-returns', summary='回收单列表')
@require_permission('resource.material.read')
def product_return_list(request, params: ProductReturnQueryParams = Query(...)):
    result = list_product_returns(
        subject_id=params.subject_id,
        product_id=params.product_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_return_to_dict(r) for r in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/product-returns/{return_id}/execute', summary='执行回收')
@require_permission('resource.material.write')
def product_return_execute(request, return_id: int, data: ProductReturnExecuteIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    ret = execute_product_return(
        return_id=return_id,
        returned_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
        condition=data.condition or '' if data else '',
    )
    if not ret:
        return 404, {'code': 404, 'msg': '回收单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(ret)}


@router.post('/product-returns/{return_id}/inspect', summary='检验回收')
@require_permission('resource.material.write')
def product_return_inspect(request, return_id: int, data: ProductReturnInspectIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    ret = inspect_product_return(
        return_id=return_id,
        inspected_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
        notes=data.notes or '' if data else '',
    )
    if not ret:
        return 404, {'code': 404, 'msg': '回收单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(ret)}


@router.post('/product-returns/{return_id}/process', summary='处理回收')
@require_permission('resource.material.write')
def product_return_process(request, return_id: int, data: ProductReturnProcessIn):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    ret = process_product_return(
        return_id=return_id,
        method=data.method,
        processed_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username),
    )
    if not ret:
        return 404, {'code': 404, 'msg': '回收单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(ret)}


# ============================================================================
# Product Destruction endpoints (product-destructions/)
# ============================================================================

@router.post('/product-destructions/create', summary='创建销毁单')
@require_permission('resource.material.write')
def product_destruction_create(request, data: ProductDestructionCreateIn):
    account = _get_account_from_request(request)
    items_data = [{'product_id': i.product_id, 'batch_id': i.batch_id, 'kit_id': i.kit_id, 'quantity': i.quantity} for i in data.items_data]
    try:
        destruction = create_product_destruction(
            items_data=items_data,
            reason=data.reason,
            method=data.method,
            location=data.location,
            requested_by_id=account.id if account else None,
            name=data.name or (account.display_name if account and hasattr(account, 'display_name') else (account.username if account else '')),
        )
        return {'code': 0, 'msg': 'ok', 'data': _destruction_to_dict(destruction)}
    except Exception as e:
        return 400, {'code': 400, 'msg': str(e)}


@router.get('/product-destructions', summary='销毁单列表')
@require_permission('resource.material.read')
def product_destruction_list(request, params: ProductDestructionQueryParams = Query(...)):
    result = list_product_destructions(
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_destruction_to_dict(d) for d in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/product-destructions/{destruction_id}/approve', summary='批准销毁')
@require_permission('resource.material.write')
def product_destruction_approve(request, destruction_id: int, data: ProductDestructionApproveIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    destruction = approve_product_destruction(
        destruction_id=destruction_id,
        approved_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
        notes=data.notes or '' if data else '',
    )
    if not destruction:
        return 404, {'code': 404, 'msg': '销毁单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _destruction_to_dict(destruction)}


@router.post('/product-destructions/{destruction_id}/execute', summary='执行销毁')
@require_permission('resource.material.write')
def product_destruction_execute(request, destruction_id: int, data: ProductDestructionExecuteIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    destruction = execute_product_destruction(
        destruction_id=destruction_id,
        destroyed_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
        witness=data.witness or '' if data else '',
        photos=data.photos if data else None,
        certificate=data.certificate or '' if data else '',
    )
    if not destruction:
        return 404, {'code': 404, 'msg': '销毁单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _destruction_to_dict(destruction)}


# ============================================================================
# Recall endpoints (recalls/)
# ============================================================================

@router.post('/recalls/create', summary='创建召回')
@require_permission('resource.material.write')
def recall_create(request, data: RecallCreateIn):
    account = _get_account_from_request(request)
    try:
        recall = create_recall(
            product_id=data.product_id,
            batch_ids=data.batch_ids,
            recall_level=data.recall_level,
            reason=data.reason,
            description=data.description,
            health_hazard=data.health_hazard,
            strategy=data.strategy,
            notification_method=data.notification_method,
            initiated_by_id=account.id if account else None,
            name=data.name or (account.display_name if account and hasattr(account, 'display_name') else (account.username if account else '')),
        )
        return {'code': 0, 'msg': 'ok', 'data': _recall_to_dict(recall)}
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}


@router.get('/recalls', summary='召回列表')
@require_permission('resource.material.read')
def recall_list(request, params: RecallQueryParams = Query(...)):
    result = list_recalls(
        product_id=params.product_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_recall_to_dict(r) for r in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/recalls/{recall_id}/actions/create', summary='创建召回行动')
@require_permission('resource.material.write')
def recall_action_create(request, recall_id: int, data: RecallActionCreateIn):
    account = _get_account_from_request(request)
    action = add_recall_action(
        recall_id=recall_id,
        action_type=data.action_type,
        description=data.description,
        target_subject_id=data.target_subject_id,
        target_subject_code=data.target_subject_code,
        target_kit_id=data.target_kit_id,
        planned_date=data.planned_date,
        assigned_to_id=account.id if account else None,
        name=data.name or (account.display_name if account and hasattr(account, 'display_name') else account.username if account else ''),
    )
    if not action:
        return 404, {'code': 404, 'msg': '召回不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _recall_action_to_dict(action)}


@router.post('/recalls/actions/{action_id}/execute', summary='执行召回行动')
@require_permission('resource.material.write')
def recall_action_execute(request, action_id: int, data: RecallActionExecuteIn = None):
    account = _get_account_from_request(request)
    if not account:
        return 400, {'code': 400, 'msg': '请先登录'}
    action = execute_recall_action(
        action_id=action_id,
        executed_by_id=account.id,
        name=data.name or (account.display_name if hasattr(account, 'display_name') else account.username) if data else '',
        result=data.result or '' if data else '',
    )
    if not action:
        return 404, {'code': 404, 'msg': '召回行动不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _recall_action_to_dict(action)}


@router.post('/recalls/{recall_id}/complete', summary='完成召回')
@require_permission('resource.material.write')
def recall_complete(request, recall_id: int, data: RecallCompleteIn = None):
    recall = complete_recall(
        recall_id=recall_id,
        notes=data.notes or '' if data else '',
        effectiveness=data.effectiveness or '' if data else '',
    )
    if not recall:
        return 404, {'code': 404, 'msg': '召回不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _recall_to_dict(recall)}
