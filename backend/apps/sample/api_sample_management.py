"""
样品管理 API

路由前缀：/api/v1/sample-management/
覆盖：接收验收、存储、分发、检测、回收、销毁、盘点、温度监控
"""
from ninja import Router, Schema, Query
from typing import Optional, List, Dict, Any
from datetime import date

from apps.identity.decorators import require_permission, _get_account_from_request
from .services.sample_management_service import (
    create_receipt, inspect_receipt, list_receipts, get_receipt,
    store_sample, retrieve_sample, list_storage_records,
    create_distribution, approve_distribution, execute_distribution,
    confirm_distribution, list_distributions,
    create_test, start_test, complete_test, review_test, list_tests,
    create_return, execute_return, inspect_return, process_return, list_returns,
    create_destruction, approve_destruction, execute_destruction, list_destructions,
    create_count, start_count, submit_count, review_count, list_counts,
    record_temperature, list_temperature_logs, handle_alarm,
)

router = Router()


# ============================================================================
# Schema 定义
# ============================================================================

# --- Receipt ---
class ReceiptCreateIn(Schema):
    product_id: int
    supplier: Optional[str] = ''
    courier: Optional[str] = ''
    tracking_no: Optional[str] = ''
    expected_qty: int = 0
    batch_no: Optional[str] = ''
    expiry_date: Optional[date] = None
    shipment_no: Optional[str] = ''
    manufacture_date: Optional[date] = None
    received_by_name: Optional[str] = ''
    storage_location_id: Optional[int] = None


class ReceiptInspectIn(Schema):
    packaging_ok: Optional[bool] = None
    label_ok: Optional[bool] = None
    quantity_ok: Optional[bool] = None
    document_ok: Optional[bool] = None
    temperature_ok: Optional[bool] = None
    appearance_ok: Optional[bool] = None
    arrival_temp: Optional[float] = None
    accepted_qty: int = 0
    rejected_qty: int = 0
    inspected_by_name: Optional[str] = ''
    inspection_notes: Optional[str] = ''
    rejection_reason: Optional[str] = ''
    storage_location_id: Optional[int] = None


class ReceiptQueryParams(Schema):
    status: Optional[str] = None
    product_id: Optional[int] = None
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 20


# --- Storage ---
class StorageStoreIn(Schema):
    sample_id: int
    location_id: int
    stored_by_name: Optional[str] = ''
    temp: Optional[str] = ''
    conditions: Optional[str] = ''
    notes: Optional[str] = ''


class StorageRetrieveIn(Schema):
    retrieved_by_name: Optional[str] = ''
    reason: Optional[str] = ''


class StorageQueryParams(Schema):
    sample_id: Optional[int] = None
    location_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# --- Distribution ---
class DistributionCreateIn(Schema):
    product_id: int
    dist_type: str
    quantity: int
    recipient_type: Optional[str] = ''
    recipient_id: Optional[int] = None
    recipient_name: Optional[str] = ''
    is_randomized: bool = False
    randomization_code: Optional[str] = ''
    kit_number: Optional[str] = ''
    planned_date: Optional[date] = None
    planned_by_name: Optional[str] = ''
    notes: Optional[str] = ''


class DistributionApproveIn(Schema):
    approved_by_name: Optional[str] = ''


class DistributionExecuteIn(Schema):
    executed_by_name: Optional[str] = ''
    sample_codes: Optional[List[str]] = None


class DistributionConfirmIn(Schema):
    confirmed_by_name: Optional[str] = ''


class DistributionQueryParams(Schema):
    status: Optional[str] = None
    product_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


# --- Test ---
class TestCreateIn(Schema):
    sample_id: int
    test_type: str
    method: Optional[str] = ''
    standard: Optional[str] = ''
    planned_date: Optional[date] = None
    test_items: Optional[List[str]] = None
    notes: Optional[str] = ''


class TestStartIn(Schema):
    tested_by_name: Optional[str] = ''


class TestCompleteIn(Schema):
    result_status: Optional[str] = ''
    result_data: Optional[Dict[str, Any]] = None
    summary: Optional[str] = ''
    equipment_used: Optional[str] = ''
    deviation_found: bool = False
    deviation_description: Optional[str] = ''


class TestReviewIn(Schema):
    reviewer_name: Optional[str] = ''
    notes: Optional[str] = ''


class TestQueryParams(Schema):
    sample_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# --- Return ---
class ReturnCreateIn(Schema):
    sample_id: int
    reason: str
    detail: Optional[str] = ''
    from_type: Optional[str] = ''
    from_id: Optional[int] = None
    from_name: Optional[str] = ''
    notes: Optional[str] = ''


class ReturnExecuteIn(Schema):
    returned_by_name: Optional[str] = ''
    condition: Optional[str] = ''
    remaining: Optional[str] = ''


class ReturnInspectIn(Schema):
    inspected_by_name: Optional[str] = ''
    notes: Optional[str] = ''


class ReturnProcessIn(Schema):
    method: str
    processed_by_name: Optional[str] = ''
    location_id: Optional[int] = None


class ReturnQueryParams(Schema):
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# --- Destruction ---
class DestructionCreateIn(Schema):
    sample_ids: List[int]
    reason: str
    method: str
    location: Optional[str] = ''
    requested_by_name: Optional[str] = ''
    notes: Optional[str] = ''


class DestructionApproveIn(Schema):
    approved_by_name: Optional[str] = ''
    notes: Optional[str] = ''


class DestructionExecuteIn(Schema):
    destroyed_by_name: Optional[str] = ''
    witness: Optional[str] = ''
    photos: Optional[List[str]] = None
    certificate: Optional[str] = ''


class DestructionQueryParams(Schema):
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# --- Inventory Count ---
class CountCreateIn(Schema):
    count_type: str
    planned_date: date
    location_id: Optional[int] = None
    product_id: Optional[int] = None
    planned_by_name: Optional[str] = ''
    notes: Optional[str] = ''


class CountStartIn(Schema):
    counted_by_name: Optional[str] = ''


class CountSubmitIn(Schema):
    actual_qty: int
    variance_details: Optional[List[Dict]] = None


class CountReviewIn(Schema):
    reviewed_by_name: Optional[str] = ''
    notes: Optional[str] = ''
    adjust: bool = False
    adjustment_reason: Optional[str] = ''


class CountQueryParams(Schema):
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# --- Temperature ---
class TemperatureRecordIn(Schema):
    location_id: int
    temperature: float
    humidity: Optional[float] = None
    source: Optional[str] = ''
    device_id: Optional[str] = ''


class TemperatureHandleAlarmIn(Schema):
    handled_by_name: Optional[str] = ''
    notes: Optional[str] = ''


class TemperatureQueryParams(Schema):
    location_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 序列化辅助
# ============================================================================

def _receipt_to_dict(r) -> dict:
    return {
        'id': r.id, 'receipt_no': r.receipt_no, 'status': r.status,
        'product_id': r.product_id, 'product_name': r.product.name if r.product else '',
        'product_code': r.product.code if r.product else '',
        'supplier': r.supplier, 'shipment_no': r.shipment_no,
        'courier': r.courier, 'tracking_no': r.tracking_no,
        'expected_quantity': r.expected_quantity, 'received_quantity': r.received_quantity,
        'accepted_quantity': r.accepted_quantity, 'rejected_quantity': r.rejected_quantity,
        'batch_no': r.batch_no,
        'manufacture_date': str(r.manufacture_date) if r.manufacture_date else None,
        'expiry_date': str(r.expiry_date) if r.expiry_date else None,
        'received_at': r.received_at.isoformat() if r.received_at else None,
        'received_by_name': r.received_by_name,
        'inspected_at': r.inspected_at.isoformat() if r.inspected_at else None,
        'inspected_by_name': r.inspected_by_name,
        'packaging_ok': r.packaging_ok, 'label_ok': r.label_ok,
        'quantity_ok': r.quantity_ok, 'document_ok': r.document_ok,
        'temperature_ok': r.temperature_ok, 'appearance_ok': r.appearance_ok,
        'arrival_temperature': float(r.arrival_temperature) if r.arrival_temperature else None,
        'inspection_notes': r.inspection_notes, 'rejection_reason': r.rejection_reason,
        'storage_location_id': r.storage_location_id,
        'storage_location_name': r.storage_location.name if r.storage_location else None,
        'create_time': r.create_time.isoformat() if r.create_time else '',
    }


def _storage_to_dict(s) -> dict:
    return {
        'id': s.id, 'sample_id': s.sample_id,
        'sample_code': s.sample.unique_code if s.sample else '',
        'location_id': s.location_id,
        'location_name': str(s.location) if s.location else '',
        'status': s.status,
        'stored_at': s.stored_at.isoformat() if s.stored_at else None,
        'stored_by_id': s.stored_by_id, 'stored_by_name': s.stored_by_name,
        'retrieved_at': s.retrieved_at.isoformat() if s.retrieved_at else None,
        'retrieved_by_id': s.retrieved_by_id, 'retrieved_by_name': s.retrieved_by_name,
        'retrieve_reason': s.retrieve_reason,
        'storage_temperature': s.storage_temperature,
        'special_conditions': s.special_conditions, 'notes': s.notes,
        'create_time': s.create_time.isoformat() if s.create_time else '',
    }


def _distribution_to_dict(d) -> dict:
    return {
        'id': d.id, 'distribution_no': d.distribution_no,
        'distribution_type': d.distribution_type, 'status': d.status,
        'product_id': d.product_id, 'product_name': d.product.name if d.product else '',
        'product_code': d.product.code if d.product else '',
        'quantity': d.quantity,
        'recipient_type': d.recipient_type, 'recipient_id': d.recipient_id,
        'recipient_name': d.recipient_name,
        'is_randomized': d.is_randomized, 'randomization_code': d.randomization_code,
        'kit_number': d.kit_number,
        'planned_date': str(d.planned_date) if d.planned_date else None,
        'planned_by_name': d.planned_by_name,
        'approved_at': d.approved_at.isoformat() if d.approved_at else None,
        'approved_by_name': d.approved_by_name,
        'distributed_at': d.distributed_at.isoformat() if d.distributed_at else None,
        'distributed_by_name': d.distributed_by_name,
        'confirmed_at': d.confirmed_at.isoformat() if d.confirmed_at else None,
        'confirmed_by_name': d.confirmed_by_name,
        'sample_codes': d.sample_codes or [],
        'notes': d.notes,
        'create_time': d.create_time.isoformat() if d.create_time else '',
    }


def _test_to_dict(t) -> dict:
    return {
        'id': t.id, 'test_no': t.test_no, 'status': t.status,
        'sample_id': t.sample_id, 'sample_code': t.sample.unique_code if t.sample else '',
        'test_type': t.test_type, 'test_method': t.test_method,
        'test_standard': t.test_standard, 'test_items': t.test_items or [],
        'planned_date': str(t.planned_date) if t.planned_date else None,
        'started_at': t.started_at.isoformat() if t.started_at else None,
        'completed_at': t.completed_at.isoformat() if t.completed_at else None,
        'tested_by_name': t.tested_by_name,
        'result_status': t.result_status, 'result_data': t.result_data or {},
        'result_summary': t.result_summary, 'equipment_used': t.equipment_used,
        'deviation_found': t.deviation_found, 'deviation_description': t.deviation_description,
        'reviewed_at': t.reviewed_at.isoformat() if t.reviewed_at else None,
        'reviewed_by_name': t.reviewed_by_name, 'review_notes': t.review_notes,
        'notes': t.notes,
        'create_time': t.create_time.isoformat() if t.create_time else '',
    }


def _return_to_dict(r) -> dict:
    return {
        'id': r.id, 'return_no': r.return_no, 'status': r.status,
        'sample_id': r.sample_id, 'sample_code': r.sample.unique_code if r.sample else '',
        'return_reason': r.return_reason, 'return_reason_detail': r.return_reason_detail,
        'return_from_type': r.return_from_type, 'return_from_id': r.return_from_id,
        'return_from_name': r.return_from_name,
        'returned_at': r.returned_at.isoformat() if r.returned_at else None,
        'returned_by_name': r.returned_by_name,
        'condition_on_return': r.condition_on_return,
        'remaining_quantity': r.remaining_quantity,
        'inspected_at': r.inspected_at.isoformat() if r.inspected_at else None,
        'inspected_by_name': r.inspected_by_name, 'inspection_notes': r.inspection_notes,
        'disposal_method': r.disposal_method,
        'processed_at': r.processed_at.isoformat() if r.processed_at else None,
        'processed_by_name': r.processed_by_name,
        'storage_location_id': r.storage_location_id,
        'notes': r.notes,
        'create_time': r.create_time.isoformat() if r.create_time else '',
    }


def _destruction_to_dict(d) -> dict:
    samples = list(d.samples.values('id', 'unique_code'))
    return {
        'id': d.id, 'destruction_no': d.destruction_no, 'status': d.status,
        'destruction_reason': d.destruction_reason,
        'destruction_method': d.destruction_method,
        'destruction_location': d.destruction_location,
        'sample_count': d.sample_count, 'samples': samples,
        'requested_at': d.requested_at.isoformat() if d.requested_at else None,
        'requested_by_name': d.requested_by_name,
        'approved_at': d.approved_at.isoformat() if d.approved_at else None,
        'approved_by_name': d.approved_by_name, 'approval_notes': d.approval_notes,
        'destroyed_at': d.destroyed_at.isoformat() if d.destroyed_at else None,
        'destroyed_by_name': d.destroyed_by_name, 'witness': d.witness,
        'destruction_certificate': d.destruction_certificate,
        'destruction_photos': d.destruction_photos or [],
        'notes': d.notes,
        'create_time': d.create_time.isoformat() if d.create_time else '',
    }


def _count_to_dict(c) -> dict:
    return {
        'id': c.id, 'count_no': c.count_no, 'count_type': c.count_type,
        'status': c.status,
        'location_id': c.location_id,
        'location_name': str(c.location) if c.location else '',
        'product_id': c.product_id,
        'product_name': c.product.name if c.product else '',
        'planned_date': str(c.planned_date) if c.planned_date else '',
        'planned_by_name': c.planned_by_name,
        'started_at': c.started_at.isoformat() if c.started_at else None,
        'counted_by_name': c.counted_by_name,
        'system_quantity': c.system_quantity, 'actual_quantity': c.actual_quantity,
        'variance': c.variance,
        'variance_rate': float(c.variance_rate) if c.variance_rate else None,
        'variance_details': c.variance_details or [],
        'reviewed_at': c.reviewed_at.isoformat() if c.reviewed_at else None,
        'reviewed_by_name': c.reviewed_by_name, 'review_notes': c.review_notes,
        'adjustment_made': c.adjustment_made, 'adjustment_reason': c.adjustment_reason,
        'notes': c.notes,
        'create_time': c.create_time.isoformat() if c.create_time else '',
    }


def _temperature_log_to_dict(l) -> dict:
    return {
        'id': l.id, 'location_id': l.location_id,
        'location_name': str(l.location) if l.location else '',
        'temperature': float(l.temperature) if l.temperature else None,
        'humidity': float(l.humidity) if l.humidity else None,
        'status': l.status,
        'recorded_at': l.recorded_at.isoformat() if l.recorded_at else '',
        'source': l.source, 'device_id': l.device_id,
        'alarm_triggered': l.alarm_triggered, 'alarm_handled': l.alarm_handled,
        'handled_by_name': l.handled_by_name,
        'handled_at': l.handled_at.isoformat() if l.handled_at else None,
        'handling_notes': l.handling_notes,
    }


# ============================================================================
# Receipt endpoints
# ============================================================================

@router.post('/receipts/create', summary='创建接收单')
@require_permission('resource.material.write')
def receipt_create(request, data: ReceiptCreateIn):
    account = _get_account_from_request(request)
    try:
        r = create_receipt(
            product_id=data.product_id,
            supplier=data.supplier or '',
            courier=data.courier or '',
            tracking_no=data.tracking_no or '',
            expected_qty=data.expected_qty,
            batch_no=data.batch_no or '',
            expiry_date=data.expiry_date,
            shipment_no=data.shipment_no or '',
            manufacture_date=data.manufacture_date,
            received_by_id=account.id if account else None,
            received_by_name=data.received_by_name or (account.display_name if account else ''),
            storage_location_id=data.storage_location_id,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    return {'code': 0, 'msg': 'ok', 'data': _receipt_to_dict(r)}


@router.get('/receipts', summary='接收单列表')
@require_permission('resource.material.read')
def receipt_list(request, params: ReceiptQueryParams = Query(...)):
    result = list_receipts(
        status=params.status,
        product_id=params.product_id,
        keyword=params.keyword,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_receipt_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.get('/receipts/{receipt_id}', summary='接收单详情')
@require_permission('resource.material.read')
def receipt_detail(request, receipt_id: int):
    r = get_receipt(receipt_id)
    if not r:
        return 404, {'code': 404, 'msg': '接收单不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _receipt_to_dict(r)}


@router.post('/receipts/{receipt_id}/inspect', summary='验收接收单')
@require_permission('resource.material.write')
def receipt_inspect(request, receipt_id: int, data: ReceiptInspectIn):
    account = _get_account_from_request(request)
    checks = {
        'packaging_ok': data.packaging_ok,
        'label_ok': data.label_ok,
        'quantity_ok': data.quantity_ok,
        'document_ok': data.document_ok,
        'temperature_ok': data.temperature_ok,
        'appearance_ok': data.appearance_ok,
    }
    r = inspect_receipt(
        receipt_id=receipt_id,
        checks_dict=checks,
        arrival_temp=data.arrival_temp,
        accepted_qty=data.accepted_qty,
        rejected_qty=data.rejected_qty,
        inspected_by_id=account.id if account else None,
        inspected_by_name=data.inspected_by_name or (account.display_name if account else ''),
        inspection_notes=data.inspection_notes or '',
        rejection_reason=data.rejection_reason or '',
        storage_location_id=data.storage_location_id,
    )
    if not r:
        return 400, {'code': 400, 'msg': '验收失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _receipt_to_dict(r)}


# ============================================================================
# Storage endpoints
# ============================================================================

@router.post('/storage/store', summary='存储样品')
@require_permission('resource.material.write')
def storage_store(request, data: StorageStoreIn):
    account = _get_account_from_request(request)
    s = store_sample(
        sample_id=data.sample_id,
        location_id=data.location_id,
        stored_by_id=account.id if account else None,
        stored_by_name=data.stored_by_name or (account.display_name if account else ''),
        temp=data.temp or '',
        conditions=data.conditions or '',
        notes=data.notes or '',
    )
    if not s:
        return 400, {'code': 400, 'msg': '存储失败（样品或库位不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _storage_to_dict(s)}


@router.post('/storage/{storage_id}/retrieve', summary='取出样品')
@require_permission('resource.material.write')
def storage_retrieve(request, storage_id: int, data: StorageRetrieveIn = None):
    account = _get_account_from_request(request)
    data = data or StorageRetrieveIn()
    s = retrieve_sample(
        storage_id=storage_id,
        retrieved_by_id=account.id if account else None,
        reason=data.reason or '',
    )
    if not s:
        return 400, {'code': 400, 'msg': '取出失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _storage_to_dict(s)}


@router.get('/storage', summary='存储记录列表')
@require_permission('resource.material.read')
def storage_list(request, params: StorageQueryParams = Query(...)):
    result = list_storage_records(
        sample_id=params.sample_id,
        location_id=params.location_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_storage_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


# ============================================================================
# Distribution endpoints
# ============================================================================

@router.post('/distributions/create', summary='创建分发计划')
@require_permission('resource.material.write')
def distribution_create(request, data: DistributionCreateIn):
    account = _get_account_from_request(request)
    recipient_info = {
        'recipient_type': data.recipient_type or '',
        'recipient_id': data.recipient_id,
        'recipient_name': data.recipient_name or '',
    }
    randomization_info = {
        'is_randomized': data.is_randomized,
        'randomization_code': data.randomization_code or '',
        'kit_number': data.kit_number or '',
    }
    d = create_distribution(
        product_id=data.product_id,
        dist_type=data.dist_type,
        quantity=data.quantity,
        recipient_info=recipient_info,
        randomization_info=randomization_info,
        planned_date=data.planned_date,
        planned_by_id=account.id if account else None,
        planned_by_name=data.planned_by_name or (account.display_name if account else ''),
        notes=data.notes or '',
    )
    if not d:
        return 400, {'code': 400, 'msg': '创建失败（产品不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _distribution_to_dict(d)}


@router.get('/distributions', summary='分发列表')
@require_permission('resource.material.read')
def distribution_list(request, params: DistributionQueryParams = Query(...)):
    result = list_distributions(
        status=params.status,
        product_id=params.product_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_distribution_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.post('/distributions/{dist_id}/approve', summary='批准分发')
@require_permission('resource.material.write')
def distribution_approve(request, dist_id: int, data: DistributionApproveIn = None):
    account = _get_account_from_request(request)
    data = data or DistributionApproveIn()
    d = approve_distribution(
        dist_id=dist_id,
        approved_by_id=account.id if account else None,
        name=data.approved_by_name or (account.display_name if account else ''),
    )
    if not d:
        return 400, {'code': 400, 'msg': '批准失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _distribution_to_dict(d)}


@router.post('/distributions/{dist_id}/execute', summary='执行分发')
@require_permission('resource.material.write')
def distribution_execute(request, dist_id: int, data: DistributionExecuteIn = None):
    account = _get_account_from_request(request)
    data = data or DistributionExecuteIn()
    d = execute_distribution(
        dist_id=dist_id,
        executed_by_id=account.id if account else None,
        name=data.executed_by_name or (account.display_name if account else ''),
        sample_codes=data.sample_codes,
    )
    if not d:
        return 400, {'code': 400, 'msg': '执行失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _distribution_to_dict(d)}


@router.post('/distributions/{dist_id}/confirm', summary='确认分发')
@require_permission('resource.material.write')
def distribution_confirm(request, dist_id: int, data: DistributionConfirmIn = None):
    account = _get_account_from_request(request)
    data = data or DistributionConfirmIn()
    d = confirm_distribution(
        dist_id=dist_id,
        confirmed_by_id=account.id if account else None,
        name=data.confirmed_by_name or (account.display_name if account else ''),
    )
    if not d:
        return 400, {'code': 400, 'msg': '确认失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _distribution_to_dict(d)}


# ============================================================================
# Test endpoints
# ============================================================================

@router.post('/tests/create', summary='创建检测任务')
@require_permission('resource.material.write')
def test_create(request, data: TestCreateIn):
    t = create_test(
        sample_id=data.sample_id,
        test_type=data.test_type,
        method=data.method or '',
        standard=data.standard or '',
        planned_date=data.planned_date,
        test_items=data.test_items or [],
        notes=data.notes or '',
    )
    if not t:
        return 400, {'code': 400, 'msg': '创建失败（样品不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _test_to_dict(t)}


@router.get('/tests', summary='检测列表')
@require_permission('resource.material.read')
def test_list(request, params: TestQueryParams = Query(...)):
    result = list_tests(
        sample_id=params.sample_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_test_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.post('/tests/{test_id}/start', summary='开始检测')
@require_permission('resource.material.write')
def test_start(request, test_id: int, data: TestStartIn = None):
    account = _get_account_from_request(request)
    data = data or TestStartIn()
    t = start_test(
        test_id=test_id,
        tested_by_id=account.id if account else None,
        name=data.tested_by_name or (account.display_name if account else ''),
    )
    if not t:
        return 400, {'code': 400, 'msg': '开始失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _test_to_dict(t)}


@router.post('/tests/{test_id}/complete', summary='完成检测')
@require_permission('resource.material.write')
def test_complete(request, test_id: int, data: TestCompleteIn):
    t = complete_test(
        test_id=test_id,
        result_status=data.result_status or '',
        result_data=data.result_data,
        summary=data.summary or '',
        equipment_used=data.equipment_used or '',
        deviation_found=data.deviation_found,
        deviation_description=data.deviation_description or '',
    )
    if not t:
        return 400, {'code': 400, 'msg': '完成失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _test_to_dict(t)}


@router.post('/tests/{test_id}/review', summary='审核检测')
@require_permission('resource.material.write')
def test_review(request, test_id: int, data: TestReviewIn = None):
    account = _get_account_from_request(request)
    data = data or TestReviewIn()
    t = review_test(
        test_id=test_id,
        reviewer_id=account.id if account else None,
        name=data.reviewer_name or (account.display_name if account else ''),
        notes=data.notes or '',
    )
    if not t:
        return 400, {'code': 400, 'msg': '审核失败（不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _test_to_dict(t)}


# ============================================================================
# Return endpoints
# ============================================================================

@router.post('/returns/create', summary='创建回收单')
@require_permission('resource.material.write')
def return_create(request, data: ReturnCreateIn):
    r = create_return(
        sample_id=data.sample_id,
        reason=data.reason,
        detail=data.detail or '',
        from_type=data.from_type or '',
        from_id=data.from_id,
        from_name=data.from_name or '',
        notes=data.notes or '',
    )
    if not r:
        return 400, {'code': 400, 'msg': '创建失败（样品不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(r)}


@router.get('/returns', summary='回收列表')
@require_permission('resource.material.read')
def return_list(request, params: ReturnQueryParams = Query(...)):
    result = list_returns(
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_return_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.post('/returns/{return_id}/execute', summary='执行回收')
@require_permission('resource.material.write')
def return_execute(request, return_id: int, data: ReturnExecuteIn = None):
    account = _get_account_from_request(request)
    data = data or ReturnExecuteIn()
    r = execute_return(
        return_id=return_id,
        returned_by_id=account.id if account else None,
        name=data.returned_by_name or (account.display_name if account else ''),
        condition=data.condition or '',
        remaining=data.remaining or '',
    )
    if not r:
        return 400, {'code': 400, 'msg': '执行失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(r)}


@router.post('/returns/{return_id}/inspect', summary='检验回收样品')
@require_permission('resource.material.write')
def return_inspect(request, return_id: int, data: ReturnInspectIn = None):
    account = _get_account_from_request(request)
    data = data or ReturnInspectIn()
    r = inspect_return(
        return_id=return_id,
        inspected_by_id=account.id if account else None,
        name=data.inspected_by_name or (account.display_name if account else ''),
        notes=data.notes or '',
    )
    if not r:
        return 400, {'code': 400, 'msg': '检验失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(r)}


@router.post('/returns/{return_id}/process', summary='处理回收样品')
@require_permission('resource.material.write')
def return_process(request, return_id: int, data: ReturnProcessIn):
    account = _get_account_from_request(request)
    r = process_return(
        return_id=return_id,
        method=data.method,
        processed_by_id=account.id if account else None,
        name=data.processed_by_name or (account.display_name if account else ''),
        location_id=data.location_id,
    )
    if not r:
        return 400, {'code': 400, 'msg': '处理失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _return_to_dict(r)}


# ============================================================================
# Destruction endpoints
# ============================================================================

@router.post('/destructions/create', summary='创建销毁申请')
@require_permission('resource.sample.destroy')
def destruction_create(request, data: DestructionCreateIn):
    account = _get_account_from_request(request)
    d = create_destruction(
        sample_ids=data.sample_ids,
        reason=data.reason,
        method=data.method,
        location=data.location or '',
        requested_by_id=account.id if account else None,
        name=data.requested_by_name or (account.display_name if account else ''),
        notes=data.notes or '',
    )
    if not d:
        return 400, {'code': 400, 'msg': '创建失败（样品不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _destruction_to_dict(d)}


@router.get('/destructions', summary='销毁列表')
@require_permission('resource.sample.destroy')
def destruction_list(request, params: DestructionQueryParams = Query(...)):
    result = list_destructions(
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_destruction_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.post('/destructions/{destruction_id}/approve', summary='批准销毁')
@require_permission('resource.sample.destroy')
def destruction_approve(request, destruction_id: int, data: DestructionApproveIn = None):
    account = _get_account_from_request(request)
    data = data or DestructionApproveIn()
    d = approve_destruction(
        destruction_id=destruction_id,
        approved_by_id=account.id if account else None,
        name=data.approved_by_name or (account.display_name if account else ''),
        notes=data.notes or '',
    )
    if not d:
        return 400, {'code': 400, 'msg': '批准失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _destruction_to_dict(d)}


@router.post('/destructions/{destruction_id}/execute', summary='执行销毁')
@require_permission('resource.sample.destroy')
def destruction_execute(request, destruction_id: int, data: DestructionExecuteIn = None):
    account = _get_account_from_request(request)
    data = data or DestructionExecuteIn()
    d = execute_destruction(
        destruction_id=destruction_id,
        destroyed_by_id=account.id if account else None,
        name=data.destroyed_by_name or (account.display_name if account else ''),
        witness=data.witness or '',
        photos=data.photos or [],
        certificate=data.certificate or '',
    )
    if not d:
        return 400, {'code': 400, 'msg': '执行失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _destruction_to_dict(d)}


# ============================================================================
# Inventory Count endpoints
# ============================================================================

@router.post('/counts/create', summary='创建盘点计划')
@require_permission('resource.material.write')
def count_create(request, data: CountCreateIn):
    account = _get_account_from_request(request)
    c = create_count(
        count_type=data.count_type,
        planned_date=data.planned_date,
        location_id=data.location_id,
        product_id=data.product_id,
        planned_by_id=account.id if account else None,
        name=data.planned_by_name or (account.display_name if account else ''),
        notes=data.notes or '',
    )
    return {'code': 0, 'msg': 'ok', 'data': _count_to_dict(c)}


@router.get('/counts', summary='盘点列表')
@require_permission('resource.material.read')
def count_list(request, params: CountQueryParams = Query(...)):
    result = list_counts(
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_count_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.post('/counts/{count_id}/start', summary='开始盘点')
@require_permission('resource.material.write')
def count_start(request, count_id: int, data: CountStartIn = None):
    account = _get_account_from_request(request)
    data = data or CountStartIn()
    c = start_count(
        count_id=count_id,
        counted_by_id=account.id if account else None,
        name=data.counted_by_name or (account.display_name if account else ''),
    )
    if not c:
        return 400, {'code': 400, 'msg': '开始失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _count_to_dict(c)}


@router.post('/counts/{count_id}/submit', summary='提交盘点结果')
@require_permission('resource.material.write')
def count_submit(request, count_id: int, data: CountSubmitIn):
    c = submit_count(
        count_id=count_id,
        actual_qty=data.actual_qty,
        variance_details=data.variance_details,
    )
    if not c:
        return 400, {'code': 400, 'msg': '提交失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _count_to_dict(c)}


@router.post('/counts/{count_id}/review', summary='审核盘点')
@require_permission('resource.material.write')
def count_review(request, count_id: int, data: CountReviewIn = None):
    account = _get_account_from_request(request)
    data = data or CountReviewIn()
    c = review_count(
        count_id=count_id,
        reviewed_by_id=account.id if account else None,
        name=data.reviewed_by_name or (account.display_name if account else ''),
        notes=data.notes or '',
        adjust=data.adjust,
        adjustment_reason=data.adjustment_reason or '',
    )
    if not c:
        return 400, {'code': 400, 'msg': '审核失败（状态不允许或不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _count_to_dict(c)}


# ============================================================================
# Temperature endpoints
# ============================================================================

@router.post('/temperature/record', summary='记录温度')
@require_permission('resource.material.write')
def temperature_record(request, data: TemperatureRecordIn):
    log = record_temperature(
        location_id=data.location_id,
        temperature=data.temperature,
        humidity=data.humidity,
        source=data.source or '',
        device_id=data.device_id or '',
    )
    if not log:
        return 400, {'code': 400, 'msg': '记录失败（库位不存在）'}
    return {'code': 0, 'msg': 'ok', 'data': _temperature_log_to_dict(log)}


@router.get('/temperature/logs', summary='温度日志列表')
@require_permission('resource.material.read')
def temperature_logs(request, params: TemperatureQueryParams = Query(...)):
    start_d = None
    end_d = None
    if params.start_date:
        try:
            start_d = date.fromisoformat(params.start_date)
        except (ValueError, TypeError):
            pass
    if params.end_date:
        try:
            end_d = date.fromisoformat(params.end_date)
        except (ValueError, TypeError):
            pass
    result = list_temperature_logs(
        location_id=params.location_id,
        start_date=start_d,
        end_date=end_d,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'items': [_temperature_log_to_dict(i) for i in result['items']],
            'total': result['total'],
            'page': params.page,
            'page_size': params.page_size,
        },
    }


@router.post('/temperature/{log_id}/handle-alarm', summary='处理温度报警')
@require_permission('resource.material.write')
def temperature_handle_alarm(request, log_id: int, data: TemperatureHandleAlarmIn = None):
    account = _get_account_from_request(request)
    data = data or TemperatureHandleAlarmIn()
    log = handle_alarm(
        log_id=log_id,
        handled_by_id=account.id if account else None,
        name=data.handled_by_name or (account.display_name if account else ''),
        notes=data.notes or '',
    )
    if not log:
        return 404, {'code': 404, 'msg': '温度日志不存在'}
    return {'code': 0, 'msg': 'ok', 'data': _temperature_log_to_dict(log)}
