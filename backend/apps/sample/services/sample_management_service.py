"""
样品管理服务

包含：接收验收、存储、分发、检测、回收、销毁、盘点、温度监控等操作。
"""
import logging
from decimal import Decimal
from typing import Optional, List, Dict, Any

from django.utils import timezone

from apps.sample.models import Product, SampleInstance, SampleStatus
from apps.sample.models_management import (
    SampleReceipt, SampleStorage, SampleDistribution, SampleTest,
    SampleReturn, SampleDestruction, InventoryCount, TemperatureLog,
)
from apps.sample.models_material import StorageLocation

logger = logging.getLogger(__name__)


# ============================================================================
# 序号生成
# ============================================================================

def _generate_receipt_no() -> str:
    """SR-YYYYMMDD-XXXX"""
    now = timezone.now()
    prefix = f'SR-{now.strftime("%Y%m%d")}-'
    last = (
        SampleReceipt.objects.filter(receipt_no__startswith=prefix)
        .order_by('-receipt_no')
        .values_list('receipt_no', flat=True)
        .first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _generate_distribution_no() -> str:
    """SD-YYYYMMDD-XXXX"""
    now = timezone.now()
    prefix = f'SD-{now.strftime("%Y%m%d")}-'
    last = (
        SampleDistribution.objects.filter(distribution_no__startswith=prefix)
        .order_by('-distribution_no')
        .values_list('distribution_no', flat=True)
        .first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _generate_test_no() -> str:
    """ST-YYYYMMDD-XXXX"""
    now = timezone.now()
    prefix = f'ST-{now.strftime("%Y%m%d")}-'
    last = (
        SampleTest.objects.filter(test_no__startswith=prefix)
        .order_by('-test_no')
        .values_list('test_no', flat=True)
        .first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _generate_return_no() -> str:
    """RET-YYYYMMDD-XXXX"""
    now = timezone.now()
    prefix = f'RET-{now.strftime("%Y%m%d")}-'
    last = (
        SampleReturn.objects.filter(return_no__startswith=prefix)
        .order_by('-return_no')
        .values_list('return_no', flat=True)
        .first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _generate_destruction_no() -> str:
    """DES-YYYYMMDD-XXXX"""
    now = timezone.now()
    prefix = f'DES-{now.strftime("%Y%m%d")}-'
    last = (
        SampleDestruction.objects.filter(destruction_no__startswith=prefix)
        .order_by('-destruction_no')
        .values_list('destruction_no', flat=True)
        .first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _generate_count_no() -> str:
    """IC-YYYYMMDD-XXXX"""
    now = timezone.now()
    prefix = f'IC-{now.strftime("%Y%m%d")}-'
    last = (
        InventoryCount.objects.filter(count_no__startswith=prefix)
        .order_by('-count_no')
        .values_list('count_no', flat=True)
        .first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


# ============================================================================
# SampleReceipt
# ============================================================================

def create_receipt(
    product_id: int,
    supplier: str = '',
    courier: str = '',
    tracking_no: str = '',
    expected_qty: int = 0,
    batch_no: str = '',
    expiry_date=None,
    shipment_no: str = '',
    manufacture_date=None,
    received_by_id: int = None,
    received_by_name: str = '',
    storage_location_id: int = None,
    **kwargs,
) -> SampleReceipt:
    """创建样品接收单"""
    product = Product.objects.filter(id=product_id, is_deleted=False).first()
    if not product:
        raise ValueError(f'Product {product_id} not found')

    receipt = SampleReceipt.objects.create(
        receipt_no=_generate_receipt_no(),
        status='pending',
        product=product,
        supplier=supplier,
        shipment_no=shipment_no or kwargs.get('shipment_no', ''),
        courier=courier,
        tracking_no=tracking_no,
        expected_quantity=expected_qty,
        batch_no=batch_no,
        manufacture_date=manufacture_date,
        expiry_date=expiry_date,
        received_at=timezone.now() if received_by_id else None,
        received_by_id=received_by_id,
        received_by_name=received_by_name,
        received_quantity=expected_qty if received_by_id else 0,
        storage_location_id=storage_location_id,
    )
    logger.info(f'Created receipt {receipt.receipt_no} for product {product.code}')
    return receipt


def inspect_receipt(
    receipt_id: int,
    checks_dict: Dict[str, bool],
    arrival_temp=None,
    accepted_qty: int = 0,
    rejected_qty: int = 0,
    inspected_by_id: int = None,
    inspected_by_name: str = '',
    inspection_notes: str = '',
    rejection_reason: str = '',
    storage_location_id: int = None,
) -> Optional[SampleReceipt]:
    """验收样品接收单"""
    receipt = SampleReceipt.objects.filter(id=receipt_id).first()
    if not receipt:
        return None
    if receipt.status not in ('pending', 'inspecting'):
        logger.warning(f'Receipt {receipt.receipt_no} status={receipt.status}, cannot inspect')
        return None

    receipt.packaging_ok = checks_dict.get('packaging_ok')
    receipt.label_ok = checks_dict.get('label_ok')
    receipt.quantity_ok = checks_dict.get('quantity_ok')
    receipt.document_ok = checks_dict.get('document_ok')
    receipt.temperature_ok = checks_dict.get('temperature_ok')
    receipt.appearance_ok = checks_dict.get('appearance_ok')
    receipt.arrival_temperature = Decimal(str(arrival_temp)) if arrival_temp is not None else None
    receipt.accepted_quantity = accepted_qty
    receipt.rejected_quantity = rejected_qty
    receipt.received_quantity = accepted_qty + rejected_qty
    receipt.inspected_at = timezone.now()
    receipt.inspected_by_id = inspected_by_id
    receipt.inspected_by_name = inspected_by_name
    receipt.inspection_notes = inspection_notes
    receipt.rejection_reason = rejection_reason
    if storage_location_id:
        receipt.storage_location_id = storage_location_id

    if rejected_qty > 0 and accepted_qty == 0:
        receipt.status = 'rejected'
    elif rejected_qty > 0:
        receipt.status = 'partial'
    else:
        receipt.status = 'accepted'
    receipt.save()
    logger.info(f'Inspected receipt {receipt.receipt_no}, status={receipt.status}')
    return receipt


def list_receipts(
    status: str = None,
    product_id: int = None,
    keyword: str = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询接收单"""
    qs = SampleReceipt.objects.all().select_related('product', 'storage_location')
    if status:
        qs = qs.filter(status=status)
    if product_id:
        qs = qs.filter(product_id=product_id)
    if keyword:
        from django.db.models import Q
        qs = qs.filter(
            Q(receipt_no__icontains=keyword) |
            Q(product__name__icontains=keyword) |
            Q(supplier__icontains=keyword) |
            Q(tracking_no__icontains=keyword) |
            Q(batch_no__icontains=keyword)
        )
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


def get_receipt(receipt_id: int) -> Optional[SampleReceipt]:
    """获取单个接收单"""
    return SampleReceipt.objects.filter(id=receipt_id).select_related(
        'product', 'storage_location'
    ).first()


# ============================================================================
# SampleStorage
# ============================================================================

def store_sample(
    sample_id: int,
    location_id: int,
    stored_by_id: int = None,
    stored_by_name: str = '',
    temp: str = '',
    conditions: str = '',
    notes: str = '',
) -> Optional[SampleStorage]:
    """存储样品"""
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample:
        return None
    location = StorageLocation.objects.filter(id=location_id).first()
    if not location:
        return None

    record = SampleStorage.objects.create(
        sample=sample,
        location=location,
        status='stored',
        stored_at=timezone.now(),
        stored_by_id=stored_by_id,
        stored_by_name=stored_by_name,
        storage_temperature=temp,
        special_conditions=conditions,
        notes=notes,
    )
    sample.storage_location = location.name or str(location)
    sample.save(update_fields=['storage_location', 'update_time'])
    logger.info(f'Stored sample {sample.unique_code} at location {location_id}')
    return record


def retrieve_sample(
    storage_id: int,
    retrieved_by_id: int = None,
    reason: str = '',
) -> Optional[SampleStorage]:
    """取出样品"""
    record = SampleStorage.objects.filter(id=storage_id).select_related('sample').first()
    if not record:
        return None
    if record.status != 'stored':
        logger.warning(f'Storage record {storage_id} status={record.status}, cannot retrieve')
        return None

    record.status = 'retrieved'
    record.retrieved_at = timezone.now()
    record.retrieved_by_id = retrieved_by_id
    record.retrieve_reason = reason
    record.save()
    sample = record.sample
    sample.storage_location = ''
    sample.save(update_fields=['storage_location', 'update_time'])
    logger.info(f'Retrieved sample {sample.unique_code} from storage {storage_id}')
    return record


def list_storage_records(
    sample_id: int = None,
    location_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询存储记录"""
    qs = SampleStorage.objects.all().select_related('sample', 'location')
    if sample_id:
        qs = qs.filter(sample_id=sample_id)
    if location_id:
        qs = qs.filter(location_id=location_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-stored_at')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# SampleDistribution
# ============================================================================

def create_distribution(
    product_id: int,
    dist_type: str,
    quantity: int,
    recipient_info: Dict[str, Any] = None,
    randomization_info: Dict[str, Any] = None,
    planned_date=None,
    planned_by_id: int = None,
    planned_by_name: str = '',
    notes: str = '',
    **kwargs,
) -> Optional[SampleDistribution]:
    """创建分发计划"""
    product = Product.objects.filter(id=product_id, is_deleted=False).first()
    if not product:
        return None

    recipient_info = recipient_info or {}
    randomization_info = randomization_info or {}

    dist = SampleDistribution.objects.create(
        distribution_no=_generate_distribution_no(),
        distribution_type=dist_type,
        status='planned',
        product=product,
        quantity=quantity,
        recipient_type=recipient_info.get('recipient_type', ''),
        recipient_id=recipient_info.get('recipient_id'),
        recipient_name=recipient_info.get('recipient_name', ''),
        is_randomized=randomization_info.get('is_randomized', False),
        randomization_code=randomization_info.get('randomization_code', ''),
        kit_number=randomization_info.get('kit_number', ''),
        planned_date=planned_date,
        planned_by_id=planned_by_id,
        planned_by_name=planned_by_name,
        notes=notes,
    )
    logger.info(f'Created distribution {dist.distribution_no} for product {product.code}')
    return dist


def approve_distribution(
    dist_id: int,
    approved_by_id: int = None,
    name: str = '',
) -> Optional[SampleDistribution]:
    """批准分发"""
    dist = SampleDistribution.objects.filter(id=dist_id).first()
    if not dist:
        return None
    if dist.status != 'planned':
        logger.warning(f'Distribution {dist.distribution_no} status={dist.status}, cannot approve')
        return None

    dist.status = 'approved'
    dist.approved_at = timezone.now()
    dist.approved_by_id = approved_by_id
    dist.approved_by_name = name
    dist.save()
    logger.info(f'Approved distribution {dist.distribution_no}')
    return dist


def execute_distribution(
    dist_id: int,
    executed_by_id: int = None,
    name: str = '',
    sample_codes: List[str] = None,
) -> Optional[SampleDistribution]:
    """执行分发"""
    dist = SampleDistribution.objects.filter(id=dist_id).first()
    if not dist:
        return None
    if dist.status != 'approved':
        logger.warning(f'Distribution {dist.distribution_no} status={dist.status}, cannot execute')
        return None

    dist.status = 'distributed'
    dist.distributed_at = timezone.now()
    dist.distributed_by_id = executed_by_id
    dist.distributed_by_name = name
    dist.sample_codes = sample_codes or []
    dist.save()
    logger.info(f'Executed distribution {dist.distribution_no}')
    return dist


def confirm_distribution(
    dist_id: int,
    confirmed_by_id: int = None,
    name: str = '',
) -> Optional[SampleDistribution]:
    """确认分发"""
    dist = SampleDistribution.objects.filter(id=dist_id).first()
    if not dist:
        return None
    if dist.status != 'distributed':
        logger.warning(f'Distribution {dist.distribution_no} status={dist.status}, cannot confirm')
        return None

    dist.status = 'confirmed'
    dist.confirmed_at = timezone.now()
    dist.confirmed_by_id = confirmed_by_id
    dist.confirmed_by_name = name
    dist.save()
    logger.info(f'Confirmed distribution {dist.distribution_no}')
    return dist


def list_distributions(
    status: str = None,
    product_id: int = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询分发记录"""
    qs = SampleDistribution.objects.all().select_related('product')
    if status:
        qs = qs.filter(status=status)
    if product_id:
        qs = qs.filter(product_id=product_id)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# SampleTest
# ============================================================================

def create_test(
    sample_id: int,
    test_type: str,
    method: str = '',
    standard: str = '',
    planned_date=None,
    test_items: List[str] = None,
    notes: str = '',
) -> Optional[SampleTest]:
    """创建检测任务"""
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample:
        return None

    test = SampleTest.objects.create(
        test_no=_generate_test_no(),
        status='pending',
        sample=sample,
        test_type=test_type,
        test_method=method,
        test_standard=standard,
        test_items=test_items or [],
        planned_date=planned_date,
        notes=notes,
    )
    logger.info(f'Created test {test.test_no} for sample {sample.unique_code}')
    return test


def start_test(
    test_id: int,
    tested_by_id: int = None,
    name: str = '',
) -> Optional[SampleTest]:
    """开始检测"""
    test = SampleTest.objects.filter(id=test_id).first()
    if not test:
        return None
    if test.status != 'pending':
        logger.warning(f'Test {test.test_no} status={test.status}, cannot start')
        return None

    test.status = 'in_progress'
    test.started_at = timezone.now()
    test.tested_by_id = tested_by_id
    test.tested_by_name = name
    test.save()
    logger.info(f'Started test {test.test_no}')
    return test


def complete_test(
    test_id: int,
    result_status: str = '',
    result_data: Dict[str, Any] = None,
    summary: str = '',
    equipment_used: str = '',
    deviation_found: bool = False,
    deviation_description: str = '',
) -> Optional[SampleTest]:
    """完成检测"""
    test = SampleTest.objects.filter(id=test_id).first()
    if not test:
        return None
    if test.status != 'in_progress':
        logger.warning(f'Test {test.test_no} status={test.status}, cannot complete')
        return None

    test.status = 'completed' if result_status != 'fail' else 'failed'
    test.completed_at = timezone.now()
    test.result_status = result_status
    test.result_data = result_data or {}
    test.result_summary = summary
    test.equipment_used = equipment_used
    test.deviation_found = deviation_found
    test.deviation_description = deviation_description
    test.save()
    logger.info(f'Completed test {test.test_no}, result={result_status}')
    return test


def review_test(
    test_id: int,
    reviewer_id: int = None,
    name: str = '',
    notes: str = '',
) -> Optional[SampleTest]:
    """审核检测结果"""
    test = SampleTest.objects.filter(id=test_id).first()
    if not test:
        return None

    test.reviewed_at = timezone.now()
    test.reviewed_by_id = reviewer_id
    test.reviewed_by_name = name
    test.review_notes = notes
    test.save()
    logger.info(f'Reviewed test {test.test_no}')
    return test


def list_tests(
    sample_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询检测记录"""
    qs = SampleTest.objects.all().select_related('sample')
    if sample_id:
        qs = qs.filter(sample_id=sample_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# SampleReturn
# ============================================================================

def create_return(
    sample_id: int,
    reason: str,
    detail: str = '',
    from_type: str = '',
    from_id: int = None,
    from_name: str = '',
    notes: str = '',
) -> Optional[SampleReturn]:
    """创建回收单"""
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample:
        return None

    ret = SampleReturn.objects.create(
        return_no=_generate_return_no(),
        status='pending',
        sample=sample,
        return_reason=reason,
        return_reason_detail=detail,
        return_from_type=from_type,
        return_from_id=from_id,
        return_from_name=from_name,
        notes=notes,
    )
    logger.info(f'Created return {ret.return_no} for sample {sample.unique_code}')
    return ret


def execute_return(
    return_id: int,
    returned_by_id: int = None,
    name: str = '',
    condition: str = '',
    remaining: str = '',
) -> Optional[SampleReturn]:
    """执行回收"""
    ret = SampleReturn.objects.filter(id=return_id).first()
    if not ret:
        return None
    if ret.status != 'pending':
        logger.warning(f'Return {ret.return_no} status={ret.status}, cannot execute')
        return None

    ret.status = 'returned'
    ret.returned_at = timezone.now()
    ret.returned_by_id = returned_by_id
    ret.returned_by_name = name
    ret.condition_on_return = condition
    ret.remaining_quantity = remaining
    ret.save()
    logger.info(f'Executed return {ret.return_no}')
    return ret


def inspect_return(
    return_id: int,
    inspected_by_id: int = None,
    name: str = '',
    notes: str = '',
) -> Optional[SampleReturn]:
    """检验回收样品"""
    ret = SampleReturn.objects.filter(id=return_id).first()
    if not ret:
        return None
    if ret.status != 'returned':
        logger.warning(f'Return {ret.return_no} status={ret.status}, cannot inspect')
        return None

    ret.status = 'inspected'
    ret.inspected_at = timezone.now()
    ret.inspected_by_id = inspected_by_id
    ret.inspected_by_name = name
    ret.inspection_notes = notes
    ret.save()
    logger.info(f'Inspected return {ret.return_no}')
    return ret


def process_return(
    return_id: int,
    method: str,
    processed_by_id: int = None,
    name: str = '',
    location_id: int = None,
) -> Optional[SampleReturn]:
    """处理回收样品（入库/销毁等）"""
    ret = SampleReturn.objects.filter(id=return_id).first()
    if not ret:
        return None
    if ret.status != 'inspected':
        logger.warning(f'Return {ret.return_no} status={ret.status}, cannot process')
        return None

    ret.status = 'processed'
    ret.disposal_method = method
    ret.processed_at = timezone.now()
    ret.processed_by_id = processed_by_id
    ret.processed_by_name = name
    ret.storage_location_id = location_id
    ret.save()
    logger.info(f'Processed return {ret.return_no}, method={method}')
    return ret


def list_returns(
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询回收记录"""
    qs = SampleReturn.objects.all().select_related('sample', 'storage_location')
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# SampleDestruction
# ============================================================================

def create_destruction(
    sample_ids: List[int],
    reason: str,
    method: str,
    location: str = '',
    requested_by_id: int = None,
    name: str = '',
    notes: str = '',
) -> Optional[SampleDestruction]:
    """创建销毁申请"""
    samples = list(SampleInstance.objects.filter(id__in=sample_ids))
    if not samples:
        return None

    dest = SampleDestruction.objects.create(
        destruction_no=_generate_destruction_no(),
        status='pending',
        destruction_reason=reason,
        destruction_method=method,
        destruction_location=location,
        sample_count=len(samples),
        requested_by_id=requested_by_id,
        requested_by_name=name,
        notes=notes,
    )
    dest.samples.set(samples)
    logger.info(f'Created destruction {dest.destruction_no}, {len(samples)} samples')
    return dest


def approve_destruction(
    destruction_id: int,
    approved_by_id: int = None,
    name: str = '',
    notes: str = '',
) -> Optional[SampleDestruction]:
    """批准销毁"""
    dest = SampleDestruction.objects.filter(id=destruction_id).first()
    if not dest:
        return None
    if dest.status != 'pending':
        logger.warning(f'Destruction {dest.destruction_no} status={dest.status}, cannot approve')
        return None

    dest.status = 'approved'
    dest.approved_at = timezone.now()
    dest.approved_by_id = approved_by_id
    dest.approved_by_name = name
    dest.approval_notes = notes
    dest.save()
    logger.info(f'Approved destruction {dest.destruction_no}')
    return dest


def execute_destruction(
    destruction_id: int,
    destroyed_by_id: int = None,
    name: str = '',
    witness: str = '',
    photos: List[str] = None,
    certificate: str = '',
) -> Optional[SampleDestruction]:
    """执行销毁"""
    dest = SampleDestruction.objects.filter(id=destruction_id).first()
    if not dest:
        return None
    if dest.status != 'approved':
        logger.warning(f'Destruction {dest.destruction_no} status={dest.status}, cannot execute')
        return None

    dest.status = 'destroyed'
    dest.destroyed_at = timezone.now()
    dest.destroyed_by_id = destroyed_by_id
    dest.destroyed_by_name = name
    dest.witness = witness
    dest.destruction_photos = photos or []
    dest.destruction_certificate = certificate
    dest.save()

    for sample in dest.samples.all():
        sample.status = SampleStatus.DESTROYED
        sample.save(update_fields=['status', 'update_time'])

    logger.info(f'Executed destruction {dest.destruction_no}')
    return dest


def list_destructions(
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询销毁记录"""
    qs = SampleDestruction.objects.all().prefetch_related('samples')
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# InventoryCount
# ============================================================================

def create_count(
    count_type: str,
    planned_date,
    location_id: int = None,
    product_id: int = None,
    planned_by_id: int = None,
    name: str = '',
    notes: str = '',
) -> InventoryCount:
    """创建盘点计划"""
    count = InventoryCount.objects.create(
        count_no=_generate_count_no(),
        count_type=count_type,
        status='planned',
        location_id=location_id,
        product_id=product_id,
        planned_date=planned_date,
        planned_by_id=planned_by_id,
        planned_by_name=name,
        notes=notes,
    )
    logger.info(f'Created count {count.count_no}')
    return count


def start_count(
    count_id: int,
    counted_by_id: int = None,
    name: str = '',
) -> Optional[InventoryCount]:
    """开始盘点"""
    count = InventoryCount.objects.filter(id=count_id).first()
    if not count:
        return None
    if count.status != 'planned':
        logger.warning(f'Count {count.count_no} status={count.status}, cannot start')
        return None

    count.status = 'in_progress'
    count.started_at = timezone.now()
    count.counted_by_id = counted_by_id
    count.counted_by_name = name
    if count.product_id and count.location_id:
        count.system_quantity = SampleStorage.objects.filter(
            sample__product_id=count.product_id,
            location_id=count.location_id,
            status='stored',
        ).count()
    elif count.product_id:
        count.system_quantity = SampleInstance.objects.filter(
            product_id=count.product_id,
            status='in_stock',
        ).count()
    count.save()
    logger.info(f'Started count {count.count_no}')
    return count


def submit_count(
    count_id: int,
    actual_qty: int,
    variance_details: List[Dict] = None,
) -> Optional[InventoryCount]:
    """提交盘点结果"""
    count = InventoryCount.objects.filter(id=count_id).first()
    if not count:
        return None
    if count.status != 'in_progress':
        logger.warning(f'Count {count.count_no} status={count.status}, cannot submit')
        return None

    count.status = 'completed'
    count.completed_at = timezone.now()
    count.actual_quantity = actual_qty
    count.variance = actual_qty - count.system_quantity
    count.variance_details = variance_details or []
    if count.system_quantity:
        from decimal import Decimal
        count.variance_rate = Decimal(str(round(
            abs(count.variance) / count.system_quantity * 100, 2
        )))
    count.save()
    logger.info(f'Submitted count {count.count_no}, variance={count.variance}')
    return count


def review_count(
    count_id: int,
    reviewed_by_id: int = None,
    name: str = '',
    notes: str = '',
    adjust: bool = False,
    adjustment_reason: str = '',
) -> Optional[InventoryCount]:
    """审核盘点"""
    count = InventoryCount.objects.filter(id=count_id).first()
    if not count:
        return None
    if count.status != 'completed':
        logger.warning(f'Count {count.count_no} status={count.status}, cannot review')
        return None

    count.status = 'reviewed'
    count.reviewed_at = timezone.now()
    count.reviewed_by_id = reviewed_by_id
    count.reviewed_by_name = name
    count.review_notes = notes
    count.adjustment_made = adjust
    count.adjustment_reason = adjustment_reason
    count.save()
    logger.info(f'Reviewed count {count.count_no}')
    return count


def list_counts(
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询盘点记录"""
    qs = InventoryCount.objects.all().select_related('location', 'product')
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-planned_date')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# TemperatureLog
# ============================================================================

def record_temperature(
    location_id: int,
    temperature,
    humidity=None,
    source: str = '',
    device_id: str = '',
) -> Optional[TemperatureLog]:
    """记录温度"""
    location = StorageLocation.objects.filter(id=location_id).first()
    if not location:
        return None

    status = 'normal'
    alarm_triggered = False
    if location.temperature_min is not None or location.temperature_max is not None:
        temp_val = float(temperature)
        if location.temperature_min is not None and temp_val < float(location.temperature_min):
            status = 'alarm'
            alarm_triggered = True
        elif location.temperature_max is not None and temp_val > float(location.temperature_max):
            status = 'alarm'
            alarm_triggered = True

    log = TemperatureLog.objects.create(
        location=location,
        temperature=Decimal(str(temperature)),
        humidity=Decimal(str(humidity)) if humidity is not None else None,
        status=status,
        recorded_at=timezone.now(),
        source=source,
        device_id=device_id,
        alarm_triggered=alarm_triggered,
    )
    logger.debug(f'Recorded temperature {temperature} at location {location_id}')
    return log


def handle_alarm(
    log_id: int,
    handled_by_id: int = None,
    name: str = '',
    notes: str = '',
) -> Optional[TemperatureLog]:
    """处理温度报警"""
    log = TemperatureLog.objects.filter(id=log_id).first()
    if not log:
        return None

    log.alarm_handled = True
    log.handled_by_id = handled_by_id
    log.handled_by_name = name
    log.handled_at = timezone.now()
    log.handling_notes = notes
    log.save()
    logger.info(f'Handled temperature alarm log {log_id}')
    return log


def link_sample_to_test_task(sample_id: int, workorder_id: int) -> Dict[str, Any]:
    """
    将样品流转事件与检测任务关联。

    查找样品对应的检测任务和工单，建立双向关联关系。
    如果检测任务不存在则自动创建。

    Args:
        sample_id: 样品实例 ID
        workorder_id: 工单 ID

    Returns:
        {'sample_id': ..., 'test_id': ..., 'workorder_id': ..., 'status': ..., 'message': ...}
    """
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample:
        raise ValueError(f'样品不存在: id={sample_id}')

    try:
        from apps.workorder.models import WorkOrder
        workorder = WorkOrder.objects.filter(id=workorder_id, is_deleted=False).first()
        if not workorder:
            raise ValueError(f'工单不存在: id={workorder_id}')
    except ImportError:
        raise ValueError('工单模块不可用')

    existing_test = SampleTest.objects.filter(
        sample=sample,
        notes__icontains=f'workorder#{workorder_id}',
    ).first()

    if existing_test:
        return {
            'sample_id': sample_id,
            'test_id': existing_test.id,
            'test_no': existing_test.test_no,
            'workorder_id': workorder_id,
            'status': 'already_linked',
            'message': f'样品已与检测任务 {existing_test.test_no} 关联',
        }

    test = SampleTest.objects.create(
        test_no=_generate_test_no(),
        status='pending',
        sample=sample,
        test_type='workorder_linked',
        test_method='',
        test_standard='',
        test_items=[],
        planned_date=workorder.scheduled_date,
        notes=f'workorder#{workorder_id} 关联检测 | 工单: {workorder.title}',
    )

    sample.status = SampleStatus.IN_USE if hasattr(SampleStatus, 'IN_USE') else sample.status
    sample.save(update_fields=['status', 'update_time'])

    logger.info(
        f'样品检测关联已创建: sample={sample.unique_code}, '
        f'test={test.test_no}, workorder={workorder_id}'
    )

    return {
        'sample_id': sample_id,
        'sample_code': sample.unique_code,
        'test_id': test.id,
        'test_no': test.test_no,
        'workorder_id': workorder_id,
        'status': 'linked',
        'message': f'样品 {sample.unique_code} 已与工单 #{workorder_id} 通过检测任务 {test.test_no} 关联',
    }


def list_temperature_logs(
    location_id: int = None,
    start_date=None,
    end_date=None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """列表查询温度日志"""
    qs = TemperatureLog.objects.all().select_related('location')
    if location_id:
        qs = qs.filter(location_id=location_id)
    if start_date:
        qs = qs.filter(recorded_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(recorded_at__date__lte=end_date)
    qs = qs.order_by('-recorded_at')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}
