"""
产品管理服务

覆盖：批次、入库、库存、套件、分发、使用、回收、销毁、召回。
"""
import logging
from decimal import Decimal
from typing import Optional, List, Dict, Any

from django.db import transaction
from django.utils import timezone

from apps.sample.models import Product
from apps.sample.models_product import (
    ProductBatch,
    ProductReceipt,
    ProductInventory,
    ProductKit,
    ProductDispensing,
    ProductUsage,
    ProductReturn,
    ProductDestruction,
    ProductDestructionItem,
    ProductRecall,
    RecallAction,
)
from apps.sample.models_material import StorageLocation

logger = logging.getLogger(__name__)


# =============================================================================
# 编号生成
# =============================================================================

def _generate_receipt_no() -> str:
    now = timezone.now()
    prefix = f'PR-{now.strftime("%Y%m%d")}-'
    count = ProductReceipt.objects.filter(receipt_no__startswith=prefix).count()
    return f'{prefix}{count + 1:04d}'


def _generate_kit_no() -> str:
    last = ProductKit.objects.order_by('-id').values_list('kit_number', flat=True).first()
    if last and last.startswith('KIT-'):
        try:
            seq = int(last.split('-')[1]) + 1
        except (ValueError, IndexError):
            seq = ProductKit.objects.count() + 1
    else:
        seq = ProductKit.objects.count() + 1
    return f'KIT-{seq:04d}'


def _generate_dispensing_no() -> str:
    now = timezone.now()
    prefix = f'PD-{now.strftime("%Y%m%d")}-'
    count = ProductDispensing.objects.filter(dispensing_no__startswith=prefix).count()
    return f'{prefix}{count + 1:04d}'


def _generate_return_no() -> str:
    now = timezone.now()
    prefix = f'PRET-{now.strftime("%Y%m%d")}-'
    count = ProductReturn.objects.filter(return_no__startswith=prefix).count()
    return f'{prefix}{count + 1:04d}'


def _generate_destruction_no() -> str:
    now = timezone.now()
    prefix = f'PDES-{now.strftime("%Y%m%d")}-'
    count = ProductDestruction.objects.filter(destruction_no__startswith=prefix).count()
    return f'{prefix}{count + 1:04d}'


def _generate_recall_no() -> str:
    now = timezone.now()
    prefix = f'RC-{now.strftime("%Y%m%d")}-'
    count = ProductRecall.objects.filter(recall_no__startswith=prefix).count()
    return f'{prefix}{count + 1:04d}'


# =============================================================================
# ProductBatch
# =============================================================================

def create_batch(
    product_id: int,
    batch_no: str,
    manufacture_date=None,
    expiry_date=None,
    quantity: int = 0,
    unit: str = '个',
    supplier: str = '',
    coa_number: str = '',
    location_id: int = None,
) -> ProductBatch:
    product = Product.objects.filter(id=product_id).first()
    if not product:
        raise ValueError(f'Product {product_id} not found')
    location = StorageLocation.objects.filter(id=location_id).first() if location_id else None
    return ProductBatch.objects.create(
        product=product,
        batch_no=batch_no,
        manufacture_date=manufacture_date,
        expiry_date=expiry_date,
        quantity=quantity,
        unit=unit,
        supplier=supplier,
        coa_number=coa_number,
        storage_location=location,
        status='pending',
    )


def receive_batch(batch_id: int, received_by_id: int, name: str) -> Optional[ProductBatch]:
    batch = ProductBatch.objects.filter(id=batch_id).first()
    if not batch:
        return None
    batch.received_at = timezone.now()
    batch.received_by_id = received_by_id
    batch.received_by_name = name or ''
    batch.status = 'received'
    batch.save(update_fields=['received_at', 'received_by_id', 'received_by_name', 'status', 'update_time'])
    return batch


def release_batch(
    batch_id: int,
    released_by_id: int,
    name: str,
    notes: str = '',
) -> Optional[ProductBatch]:
    batch = ProductBatch.objects.filter(id=batch_id).first()
    if not batch:
        return None
    batch.released_at = timezone.now()
    batch.released_by_id = released_by_id
    batch.released_by_name = name or ''
    batch.release_notes = notes or ''
    batch.status = 'released'
    batch.save(update_fields=[
        'released_at', 'released_by_id', 'released_by_name', 'release_notes', 'status', 'update_time'
    ])
    return batch


def list_batches(
    product_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductBatch.objects.select_related('product', 'storage_location').all()
    if product_id:
        qs = qs.filter(product_id=product_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


def get_batch(batch_id: int) -> Optional[ProductBatch]:
    return ProductBatch.objects.select_related('product', 'storage_location').filter(id=batch_id).first()


# =============================================================================
# ProductReceipt
# =============================================================================

@transaction.atomic
def create_product_receipt(
    product_id: int,
    batch_id: int = None,
    expected_qty: int = 0,
    source_type: str = '',
    supplier: str = '',
    po_number: str = '',
    delivery_note: str = '',
) -> ProductReceipt:
    product = Product.objects.filter(id=product_id).first()
    if not product:
        raise ValueError(f'Product {product_id} not found')
    batch = ProductBatch.objects.filter(id=batch_id).first() if batch_id else None
    return ProductReceipt.objects.create(
        receipt_no=_generate_receipt_no(),
        product=product,
        batch=batch,
        expected_quantity=expected_qty,
        source_type=source_type,
        supplier=supplier,
        po_number=po_number,
        delivery_note=delivery_note,
        status='pending',
    )


def inspect_product_receipt(
    receipt_id: int,
    checks_dict: dict = None,
    arrival_temp=None,
    accepted_qty: int = 0,
    rejected_qty: int = 0,
    inspected_by_id: int = None,
    name: str = '',
    notes: str = '',
    location_id: int = None,
) -> Optional[ProductReceipt]:
    receipt = ProductReceipt.objects.filter(id=receipt_id).first()
    if not receipt:
        return None
    checks = checks_dict or {}
    receipt.packaging_intact = checks.get('packaging_intact')
    receipt.label_correct = checks.get('label_correct')
    receipt.quantity_match = checks.get('quantity_match')
    receipt.documents_complete = checks.get('documents_complete')
    receipt.temperature_compliant = checks.get('temperature_compliant')
    receipt.appearance_normal = checks.get('appearance_normal')
    receipt.arrival_temperature = Decimal(str(arrival_temp)) if arrival_temp is not None else None
    receipt.accepted_quantity = accepted_qty
    receipt.rejected_quantity = rejected_qty
    receipt.received_quantity = accepted_qty + rejected_qty
    receipt.inspected_at = timezone.now()
    receipt.inspected_by_id = inspected_by_id
    receipt.inspected_by_name = name or ''
    receipt.inspection_notes = notes or ''
    if location_id:
        receipt.storage_location = StorageLocation.objects.filter(id=location_id).first()
    if rejected_qty > 0 and accepted_qty > 0:
        receipt.status = 'partial'
    elif rejected_qty > 0 and accepted_qty == 0:
        receipt.status = 'rejected'
    else:
        receipt.status = 'accepted'
    receipt.save()
    return receipt


def list_product_receipts(
    product_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductReceipt.objects.select_related('product', 'batch', 'storage_location').all()
    if product_id:
        qs = qs.filter(product_id=product_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


# =============================================================================
# ProductInventory
# =============================================================================

@transaction.atomic
def update_inventory(
    product_id: int,
    batch_id: int = None,
    location_id: int = None,
    quantity_change: int = 0,
) -> Optional[ProductInventory]:
    product = Product.objects.filter(id=product_id).first()
    if not product:
        return None
    batch = ProductBatch.objects.filter(id=batch_id).first() if batch_id else None
    location = StorageLocation.objects.filter(id=location_id).first() if location_id else None
    inv, created = ProductInventory.objects.get_or_create(
        product=product,
        batch=batch,
        location=location,
        defaults={'quantity': 0, 'available_quantity': 0, 'reserved_quantity': 0},
    )
    inv.quantity = (inv.quantity or 0) + quantity_change
    inv.available_quantity = (inv.available_quantity or 0) + quantity_change
    if inv.quantity < 0:
        inv.quantity = 0
    if inv.available_quantity < 0:
        inv.available_quantity = 0
    inv.save(update_fields=['quantity', 'available_quantity', 'last_updated'])
    return inv


def get_inventory_summary(product_id: int) -> dict:
    invs = ProductInventory.objects.filter(product_id=product_id).select_related('batch', 'location')
    total_qty = sum(i.quantity or 0 for i in invs)
    total_available = sum(i.available_quantity or 0 for i in invs)
    total_reserved = sum(i.reserved_quantity or 0 for i in invs)
    return {
        'product_id': product_id,
        'total_quantity': total_qty,
        'total_available': total_available,
        'total_reserved': total_reserved,
        'locations': [
            {
                'batch_id': i.batch_id,
                'batch_no': i.batch.batch_no if i.batch else None,
                'location_id': i.location_id,
                'quantity': i.quantity,
                'available_quantity': i.available_quantity,
            }
            for i in invs
        ],
    }


def list_inventories(
    product_id: int,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductInventory.objects.filter(product_id=product_id).select_related('batch', 'location')
    qs = qs.order_by('-quantity')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


# =============================================================================
# ProductKit
# =============================================================================

def create_kit(
    product_id: int,
    batch_id: int = None,
    randomization_code: str = '',
    treatment_group: str = '',
    blinding_code: str = '',
    quantity: int = 1,
    location_id: int = None,
) -> ProductKit:
    product = Product.objects.filter(id=product_id).first()
    if not product:
        raise ValueError(f'Product {product_id} not found')
    batch = ProductBatch.objects.filter(id=batch_id).first() if batch_id else None
    location = StorageLocation.objects.filter(id=location_id).first() if location_id else None
    return ProductKit.objects.create(
        kit_number=_generate_kit_no(),
        product=product,
        batch=batch,
        randomization_code=randomization_code,
        treatment_group=treatment_group,
        blinding_code=blinding_code,
        quantity=quantity,
        storage_location=location,
        status='available',
    )


def assign_kit(
    kit_id: int,
    subject_id: int,
    subject_code: str,
    assigned_by_id: int,
    name: str = '',
) -> Optional[ProductKit]:
    kit = ProductKit.objects.filter(id=kit_id).first()
    if not kit:
        return None
    kit.subject_id = subject_id
    kit.subject_code = subject_code or ''
    kit.assigned_at = timezone.now()
    kit.assigned_by_id = assigned_by_id
    kit.assigned_by_name = name or ''
    kit.status = 'assigned'
    kit.save(update_fields=[
        'subject_id', 'subject_code', 'assigned_at', 'assigned_by_id', 'assigned_by_name', 'status', 'update_time'
    ])
    return kit


def distribute_kit(
    kit_id: int,
    distributed_by_id: int,
    name: str = '',
    visit: str = '',
) -> Optional[ProductKit]:
    kit = ProductKit.objects.filter(id=kit_id).first()
    if not kit:
        return None
    kit.distributed_at = timezone.now()
    kit.distributed_by_id = distributed_by_id
    kit.distributed_by_name = name or ''
    kit.distribution_visit = visit or ''
    kit.status = 'distributed'
    kit.save(update_fields=[
        'distributed_at', 'distributed_by_id', 'distributed_by_name', 'distribution_visit', 'status', 'update_time'
    ])
    return kit


def list_kits(
    product_id: int = None,
    status: str = None,
    subject_id: int = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductKit.objects.select_related('product', 'batch', 'storage_location').all()
    if product_id:
        qs = qs.filter(product_id=product_id)
    if status:
        qs = qs.filter(status=status)
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    qs = qs.order_by('kit_number')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


def get_kit(kit_id: int) -> Optional[ProductKit]:
    return ProductKit.objects.select_related('product', 'batch', 'storage_location').filter(id=kit_id).first()


# =============================================================================
# ProductDispensing
# =============================================================================

DISPENSING_ACTIVE_STATUSES = ('planned', 'prepared', 'dispensed', 'confirmed')


def check_existing_active_dispensing(
    work_order_id: Optional[int],
    subject_id: int,
    visit_code: str,
    exclude_id: Optional[int] = None,
) -> Optional[ProductDispensing]:
    """
    检查"同工单（项目）+ 受试者（RD）+ 访视编号"是否已有活跃的分发记录。
    活跃状态：planned / prepared / dispensed / confirmed，排除 cancelled。
    返回已存在的记录，无则返回 None。
    """
    qs = ProductDispensing.objects.filter(
        work_order_id=work_order_id,
        subject_id=subject_id,
        visit_code=visit_code,
        status__in=DISPENSING_ACTIVE_STATUSES,
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs.first()


def create_dispensing(
    subject_id: int,
    subject_code: str,
    visit_code: str = '',
    visit_date=None,
    kit_id: int = None,
    product_id: int = None,
    batch_id: int = None,
    quantity: int = 0,
    work_order_id: int = None,
) -> ProductDispensing:
    product = Product.objects.filter(id=product_id).first()
    if not product:
        raise ValueError(f'Product {product_id} not found')

    # 唯一性校验：同工单+受试者+访视点不允许重复创建活跃分发记录
    if visit_code:
        existing = check_existing_active_dispensing(
            work_order_id=work_order_id,
            subject_id=subject_id,
            visit_code=visit_code,
        )
        if existing:
            raise ValueError(
                f'该访视点已有活跃的分发记录（{existing.dispensing_no}），'
                f'请勿重复创建。如需重新发放，请先取消原记录。'
            )

    kit = ProductKit.objects.filter(id=kit_id).first() if kit_id else None
    batch = ProductBatch.objects.filter(id=batch_id).first() if batch_id else None
    return ProductDispensing.objects.create(
        dispensing_no=_generate_dispensing_no(),
        subject_id=subject_id,
        subject_code=subject_code or '',
        visit_code=visit_code or '',
        visit_date=visit_date,
        kit=kit,
        product=product,
        batch=batch,
        quantity_dispensed=quantity,
        work_order_id=work_order_id,
        status='planned',
    )


def prepare_dispensing(
    dispensing_id: int,
    prepared_by_id: int,
    name: str = '',
) -> Optional[ProductDispensing]:
    dispensing = ProductDispensing.objects.filter(id=dispensing_id).first()
    if not dispensing:
        return None
    dispensing.prepared_at = timezone.now()
    dispensing.prepared_by_id = prepared_by_id
    dispensing.prepared_by_name = name or ''
    dispensing.status = 'prepared'
    dispensing.save(update_fields=[
        'prepared_at', 'prepared_by_id', 'prepared_by_name', 'status', 'update_time'
    ])
    return dispensing


def execute_dispensing(
    dispensing_id: int,
    dispensed_by_id: int,
    name: str = '',
) -> Optional[ProductDispensing]:
    dispensing = ProductDispensing.objects.filter(id=dispensing_id).first()
    if not dispensing:
        return None
    dispensing.dispensed_at = timezone.now()
    dispensing.dispensed_by_id = dispensed_by_id
    dispensing.dispensed_by_name = name or ''
    dispensing.status = 'dispensed'
    dispensing.save(update_fields=[
        'dispensed_at', 'dispensed_by_id', 'dispensed_by_name', 'status', 'update_time'
    ])
    return dispensing


def confirm_dispensing(dispensing_id: int) -> Optional[ProductDispensing]:
    dispensing = ProductDispensing.objects.filter(id=dispensing_id).first()
    if not dispensing:
        return None
    dispensing.confirmed_at = timezone.now()
    dispensing.status = 'confirmed'
    dispensing.save(update_fields=['confirmed_at', 'status', 'update_time'])
    return dispensing


def list_dispensings(
    subject_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductDispensing.objects.select_related('product', 'batch', 'kit').all()
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


# =============================================================================
# ProductUsage
# =============================================================================

def create_usage(
    dispensing_id: int,
    period_start,
    period_end,
    expected_usage: int = 0,
    actual_usage: int = None,
    remaining: int = None,
    compliance_status: str = 'not_assessed',
    compliance_rate=None,
    usage_log: list = None,
    deviation: str = '',
    adverse_event: str = '',
    recorded_by_id: int = None,
    name: str = '',
) -> Optional[ProductUsage]:
    dispensing = ProductDispensing.objects.filter(id=dispensing_id).first()
    if not dispensing:
        return None
    usage = ProductUsage.objects.create(
        dispensing=dispensing,
        period_start=period_start,
        period_end=period_end,
        expected_usage=expected_usage,
        actual_usage=actual_usage,
        remaining_quantity=remaining,
        compliance_status=compliance_status,
        compliance_rate=Decimal(str(compliance_rate)) if compliance_rate is not None else None,
        usage_log=usage_log or [],
        deviation_reported=bool(deviation),
        deviation_description=deviation or '',
        adverse_event_reported=bool(adverse_event),
        adverse_event_description=adverse_event or '',
        recorded_at=timezone.now(),
        recorded_by_id=recorded_by_id,
        recorded_by_name=name or '',
    )
    return usage


def list_usages(
    dispensing_id: int,
    compliance_status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductUsage.objects.filter(dispensing_id=dispensing_id)
    if compliance_status:
        qs = qs.filter(compliance_status=compliance_status)
    qs = qs.order_by('-period_start')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


# =============================================================================
# ProductReturn
# =============================================================================

def create_product_return(
    dispensing_id: int = None,
    subject_id: int = None,
    subject_code: str = '',
    product_id: int = None,
    kit_id: int = None,
    return_reason: str = '',
    detail: str = '',
    returned_qty: int = 0,
    unused_qty: int = None,
    used_qty: int = None,
) -> Optional[ProductReturn]:
    product = Product.objects.filter(id=product_id).first()
    if not product:
        return None
    dispensing = ProductDispensing.objects.filter(id=dispensing_id).first() if dispensing_id else None
    kit = ProductKit.objects.filter(id=kit_id).first() if kit_id else None
    return ProductReturn.objects.create(
        return_no=_generate_return_no(),
        dispensing=dispensing,
        subject_id=subject_id or (dispensing.subject_id if dispensing else None),
        subject_code=subject_code or (dispensing.subject_code if dispensing else ''),
        product=product,
        kit=kit,
        return_reason=return_reason,
        return_reason_detail=detail or '',
        returned_quantity=returned_qty,
        unused_quantity=unused_qty,
        used_quantity=used_qty,
        status='pending',
    )


def execute_product_return(
    return_id: int,
    returned_by_id: int,
    name: str = '',
    condition: str = '',
) -> Optional[ProductReturn]:
    ret = ProductReturn.objects.filter(id=return_id).first()
    if not ret:
        return None
    ret.returned_at = timezone.now()
    ret.returned_by_id = returned_by_id
    ret.returned_by_name = name or ''
    ret.condition_on_return = condition or ''
    ret.status = 'returned'
    ret.save(update_fields=[
        'returned_at', 'returned_by_id', 'returned_by_name', 'condition_on_return', 'status', 'update_time'
    ])
    return ret


def inspect_product_return(
    return_id: int,
    inspected_by_id: int,
    name: str = '',
    notes: str = '',
) -> Optional[ProductReturn]:
    ret = ProductReturn.objects.filter(id=return_id).first()
    if not ret:
        return None
    ret.inspected_at = timezone.now()
    ret.inspected_by_id = inspected_by_id
    ret.inspected_by_name = name or ''
    ret.inspection_notes = notes or ''
    ret.status = 'inspected'
    ret.save(update_fields=[
        'inspected_at', 'inspected_by_id', 'inspected_by_name', 'inspection_notes', 'status', 'update_time'
    ])
    return ret


def process_product_return(
    return_id: int,
    method: str,
    processed_by_id: int,
    name: str = '',
) -> Optional[ProductReturn]:
    ret = ProductReturn.objects.filter(id=return_id).first()
    if not ret:
        return None
    ret.disposal_method = method
    ret.processed_at = timezone.now()
    ret.processed_by_id = processed_by_id
    ret.processed_by_name = name or ''
    ret.status = 'processed'
    ret.save(update_fields=[
        'disposal_method', 'processed_at', 'processed_by_id', 'processed_by_name', 'status', 'update_time'
    ])
    return ret


def list_product_returns(
    subject_id: int = None,
    product_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductReturn.objects.select_related('product', 'kit', 'dispensing').all()
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if product_id:
        qs = qs.filter(product_id=product_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


# =============================================================================
# ProductDestruction
# =============================================================================

@transaction.atomic
def create_product_destruction(
    items_data: List[Dict[str, Any]],
    reason: str,
    method: str,
    location: str = '',
    requested_by_id: int = None,
    name: str = '',
) -> ProductDestruction:
    total_qty = sum(item.get('quantity', 0) for item in items_data)
    destruction = ProductDestruction.objects.create(
        destruction_no=_generate_destruction_no(),
        destruction_reason=reason,
        destruction_method=method,
        destruction_location=location or '',
        total_quantity=total_qty,
        requested_by_id=requested_by_id,
        requested_by_name=name or '',
        status='pending',
    )
    for item in items_data:
        product = Product.objects.filter(id=item.get('product_id')).first()
        if not product:
            continue
        batch = ProductBatch.objects.filter(id=item.get('batch_id')).first() if item.get('batch_id') else None
        kit = ProductKit.objects.filter(id=item.get('kit_id')).first() if item.get('kit_id') else None
        ProductDestructionItem.objects.create(
            destruction=destruction,
            product=product,
            batch=batch,
            kit=kit,
            quantity=item.get('quantity', 0),
        )
    return destruction


def approve_product_destruction(
    destruction_id: int,
    approved_by_id: int,
    name: str = '',
    notes: str = '',
) -> Optional[ProductDestruction]:
    destruction = ProductDestruction.objects.filter(id=destruction_id).first()
    if not destruction:
        return None
    destruction.approved_at = timezone.now()
    destruction.approved_by_id = approved_by_id
    destruction.approved_by_name = name or ''
    destruction.approval_notes = notes or ''
    destruction.status = 'approved'
    destruction.save(update_fields=[
        'approved_at', 'approved_by_id', 'approved_by_name', 'approval_notes', 'status', 'update_time'
    ])
    return destruction


def execute_product_destruction(
    destruction_id: int,
    destroyed_by_id: int,
    name: str = '',
    witness: str = '',
    photos: list = None,
    certificate: str = '',
) -> Optional[ProductDestruction]:
    destruction = ProductDestruction.objects.filter(id=destruction_id).first()
    if not destruction:
        return None
    destruction.destroyed_at = timezone.now()
    destruction.destroyed_by_id = destroyed_by_id
    destruction.destroyed_by_name = name or ''
    destruction.witness = witness or ''
    destruction.destruction_photos = photos or []
    destruction.destruction_certificate = certificate or ''
    destruction.status = 'destroyed'
    destruction.save(update_fields=[
        'destroyed_at', 'destroyed_by_id', 'destroyed_by_name', 'witness',
        'destruction_photos', 'destruction_certificate', 'status', 'update_time'
    ])
    return destruction


def list_product_destructions(
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductDestruction.objects.prefetch_related('items').all()
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


# =============================================================================
# ProductRecall
# =============================================================================

@transaction.atomic
def create_recall(
    product_id: int,
    batch_ids: List[int] = None,
    recall_level: str = '',
    reason: str = '',
    description: str = '',
    health_hazard: str = '',
    strategy: str = '',
    notification_method: str = '',
    initiated_by_id: int = None,
    name: str = '',
) -> ProductRecall:
    product = Product.objects.filter(id=product_id).first()
    if not product:
        raise ValueError(f'Product {product_id} not found')
    recall_title = (description[:200] + '...') if len(description or '') > 200 else (description or f'{product.name} 召回')
    recall = ProductRecall.objects.create(
        recall_no=_generate_recall_no(),
        recall_title=recall_title,
        product=product,
        recall_level=recall_level,
        recall_reason=reason,
        recall_description=description or '',
        health_hazard=health_hazard or '',
        recall_strategy=strategy or '',
        notification_method=notification_method or '',
        initiated_by_id=initiated_by_id,
        initiated_by_name=name or '',
        status='initiated',
    )
    if batch_ids:
        batches = ProductBatch.objects.filter(id__in=batch_ids)
        recall.affected_batches.set(batches)
    return recall


def add_recall_action(
    recall_id: int,
    action_type: str,
    description: str,
    target_subject_id: int = None,
    target_subject_code: str = '',
    target_kit_id: int = None,
    planned_date=None,
    assigned_to_id: int = None,
    name: str = '',
) -> Optional[RecallAction]:
    recall = ProductRecall.objects.filter(id=recall_id).first()
    if not recall:
        return None
    target_kit = ProductKit.objects.filter(id=target_kit_id).first() if target_kit_id else None
    return RecallAction.objects.create(
        recall=recall,
        action_type=action_type,
        action_description=description,
        target_subject_id=target_subject_id,
        target_subject_code=target_subject_code or '',
        target_kit=target_kit,
        planned_date=planned_date,
        assigned_to_id=assigned_to_id,
        assigned_to_name=name or '',
        status='pending',
    )


def execute_recall_action(
    action_id: int,
    executed_by_id: int,
    name: str = '',
    result: str = '',
) -> Optional[RecallAction]:
    action = RecallAction.objects.filter(id=action_id).first()
    if not action:
        return None
    action.executed_at = timezone.now()
    action.executed_by_id = executed_by_id
    action.executed_by_name = name or ''
    action.result = result or ''
    action.status = 'completed'
    action.save(update_fields=[
        'executed_at', 'executed_by_id', 'executed_by_name', 'result', 'status', 'update_time'
    ])
    return action


def complete_recall(
    recall_id: int,
    notes: str = '',
    effectiveness: str = '',
) -> Optional[ProductRecall]:
    recall = ProductRecall.objects.filter(id=recall_id).first()
    if not recall:
        return None
    recall.completed_at = timezone.now()
    recall.completion_notes = notes or ''
    recall.effectiveness_assessment = effectiveness or ''
    recall.status = 'completed'
    recall.save(update_fields=[
        'completed_at', 'completion_notes', 'effectiveness_assessment', 'status', 'update_time'
    ])
    return recall


def list_recalls(
    product_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductRecall.objects.select_related('product').prefetch_related('affected_batches').all()
    if product_id:
        qs = qs.filter(product_id=product_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}
