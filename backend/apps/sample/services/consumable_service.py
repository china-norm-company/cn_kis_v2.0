"""
耗材管理服务层

Consumable CRUD、批次管理、出入库、退库、报废、流水、库存统计、预警
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from ..models_material import (
    Consumable,
    ConsumableAlert,
    ConsumableBatch,
    ConsumableTransaction,
    ConsumableTransactionType,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 批号生成
# ============================================================================


def _generate_batch_number() -> str:
    """生成批号：CB-YYYYMMDD-XXXX"""
    today = timezone.now().strftime('%Y%m%d')
    prefix = f'CB-{today}-'
    last = (
        ConsumableBatch.objects.filter(batch_number__startswith=prefix)
        .order_by('-batch_number')
        .values_list('batch_number', flat=True)
        .first()
    )
    if last:
        try:
            seq = int(last.split('-')[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f'{prefix}{seq:04d}'


# ============================================================================
# Consumable CRUD
# ============================================================================


def create_consumable(
    name: str,
    code: str,
    specification: str = '',
    unit: str = '',
    safety_stock: int = 0,
    storage_condition: str = '',
    category: str = '',
    supplier: str = '',
    manufacturer: str = '',
    unit_price: Optional[Decimal] = None,
    has_expiry: bool = True,
    shelf_life: Optional[int] = None,
    manager_id: Optional[int] = None,
    manager_name: str = '',
) -> Consumable:
    """创建耗材"""
    consumable = Consumable.objects.create(
        name=name,
        code=code,
        specification=specification,
        unit=unit,
        safety_stock=safety_stock,
        storage_condition=storage_condition,
        category=category,
        supplier=supplier,
        manufacturer=manufacturer,
        unit_price=unit_price,
        has_expiry=has_expiry,
        default_shelf_life_days=shelf_life,
        manager_id=manager_id,
        manager_name=manager_name,
    )
    logger.info('Created consumable id=%s code=%s', consumable.id, code)
    return consumable


def update_consumable(consumable_id: int, **kwargs: Any) -> Optional[Consumable]:
    """更新耗材"""
    consumable = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    if not consumable:
        return None

    allowed = {
        'name', 'code', 'specification', 'unit', 'safety_stock',
        'storage_condition', 'storage_location_text', 'category',
        'supplier', 'manufacturer', 'unit_price', 'has_expiry',
        'default_shelf_life_days', 'manager_id', 'manager_name',
    }
    for k, v in kwargs.items():
        if k in allowed:
            setattr(consumable, k, v)
    consumable.save(update_fields=[k for k in kwargs if k in allowed])
    logger.info('Updated consumable id=%s', consumable_id)
    return consumable


def delete_consumable(consumable_id: int) -> bool:
    """软删除耗材"""
    consumable = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    if not consumable:
        return False
    consumable.is_deleted = True
    consumable.save(update_fields=['is_deleted', 'update_time'])
    logger.info('Deleted consumable id=%s', consumable_id)
    return True


def get_consumable(consumable_id: int) -> Optional[Consumable]:
    """获取耗材详情"""
    return Consumable.objects.filter(id=consumable_id, is_deleted=False).first()


def list_consumables(
    category: str = '',
    status: str = '',
    keyword: str = '',
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页列表耗材"""
    qs = Consumable.objects.filter(is_deleted=False)
    if category:
        qs = qs.filter(category=category)
    if keyword:
        qs = qs.filter(
            Q(name__icontains=keyword) | Q(code__icontains=keyword)
        )
    items = list(qs)
    if status:
        items = [c for c in items if c.status == status]
    total = len(items)
    offset = (page - 1) * page_size
    return {'items': items[offset:offset + page_size], 'total': total}


# ============================================================================
# ConsumableBatch
# ============================================================================


def create_batch(
    consumable_id: int,
    batch_number: Optional[str] = None,
    production_date: Optional[date] = None,
    expiry_date: Optional[date] = None,
    inbound_date: Optional[date] = None,
    inbound_qty: int = 0,
    inbound_price: Optional[Decimal] = None,
    location_text: str = '',
) -> Optional[ConsumableBatch]:
    """创建耗材批次"""
    consumable = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    if not consumable:
        return None

    if not batch_number:
        batch_number = _generate_batch_number()
    if not inbound_date:
        inbound_date = date.today()

    with transaction.atomic():
        batch = ConsumableBatch.objects.create(
            consumable=consumable,
            batch_number=batch_number,
            production_date=production_date,
            expiry_date=expiry_date,
            inbound_date=inbound_date,
            inbound_quantity=inbound_qty,
            inbound_price=inbound_price,
            remaining_quantity=inbound_qty,
            storage_location_text=location_text,
            status='in_stock' if inbound_qty > 0 else 'depleted',
        )
        consumable.current_stock += inbound_qty
        consumable.save(update_fields=['current_stock', 'update_time'])

    logger.info('Created batch id=%s batch_number=%s consumable_id=%s', batch.id, batch_number, consumable_id)
    return batch


def list_batches(
    consumable_id: Optional[int] = None,
    status: str = '',
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页列表批次"""
    qs = ConsumableBatch.objects.select_related('consumable')
    if consumable_id is not None:
        qs = qs.filter(consumable_id=consumable_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('expiry_date')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


def get_batch(batch_id: int) -> Optional[ConsumableBatch]:
    """获取批次详情"""
    return ConsumableBatch.objects.filter(id=batch_id).select_related('consumable').first()


# ============================================================================
# Inbound / Issue / Return / Scrap
# ============================================================================


def inbound_consumable(
    consumable_id: int,
    batch_id: int,
    quantity: int,
    operator_id: Optional[int] = None,
    operator_name: str = '',
    remarks: str = '',
) -> Optional[ConsumableTransaction]:
    """入库：增加批次剩余数量及耗材总库存"""
    consumable = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    batch = ConsumableBatch.objects.filter(id=batch_id, consumable_id=consumable_id).first()
    if not consumable or not batch or quantity <= 0:
        return None

    unit_cost = batch.inbound_price
    with transaction.atomic():
        batch.remaining_quantity += quantity
        batch.save(update_fields=['remaining_quantity', 'update_time'])
        consumable.current_stock += quantity
        consumable.save(update_fields=['current_stock', 'update_time'])

        tx = ConsumableTransaction.objects.create(
            consumable=consumable,
            batch=batch,
            transaction_type=ConsumableTransactionType.INBOUND,
            quantity=quantity,
            operator_id=operator_id,
            operator_name=operator_name,
            unit_cost=unit_cost,
            remarks=remarks,
        )
    logger.info('Inbound consumable_id=%s batch_id=%s qty=%s', consumable_id, batch_id, quantity)
    return tx


def issue_consumable(
    consumable_id: int,
    batch_id: int,
    quantity: int,
    operator_id: Optional[int] = None,
    operator_name: str = '',
    purpose: str = '',
    project_code: str = '',
    work_order_id: Optional[int] = None,
    remarks: str = '',
) -> Optional[ConsumableTransaction]:
    """领用/出库：减少批次剩余数量及耗材总库存"""
    consumable = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    batch = ConsumableBatch.objects.filter(id=batch_id, consumable_id=consumable_id).first()
    if not consumable or not batch or quantity <= 0:
        return None
    if batch.remaining_quantity < quantity:
        logger.warning('Insufficient batch stock: batch_id=%s remaining=%s requested=%s',
                       batch_id, batch.remaining_quantity, quantity)
        return None

    unit_cost = batch.inbound_price
    with transaction.atomic():
        batch.remaining_quantity -= quantity
        batch.status = 'depleted' if batch.remaining_quantity <= 0 else 'in_stock'
        batch.save(update_fields=['remaining_quantity', 'status', 'update_time'])
        consumable.current_stock -= quantity
        consumable.last_issue_date = date.today()
        consumable.save(update_fields=['current_stock', 'last_issue_date', 'update_time'])

        tx = ConsumableTransaction.objects.create(
            consumable=consumable,
            batch=batch,
            transaction_type=ConsumableTransactionType.ISSUE,
            quantity=quantity,
            operator_id=operator_id,
            operator_name=operator_name,
            purpose=purpose,
            project_code=project_code,
            work_order_id=work_order_id,
            unit_cost=unit_cost,
            remarks=remarks,
        )
    logger.info('Issue consumable_id=%s batch_id=%s qty=%s', consumable_id, batch_id, quantity)
    return tx


def return_consumable(
    consumable_id: int,
    batch_id: int,
    quantity: int,
    operator_id: Optional[int] = None,
    operator_name: str = '',
    remarks: str = '',
) -> Optional[ConsumableTransaction]:
    """退库：增加批次剩余数量及耗材总库存"""
    consumable = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    batch = ConsumableBatch.objects.filter(id=batch_id, consumable_id=consumable_id).first()
    if not consumable or not batch or quantity <= 0:
        return None

    unit_cost = batch.inbound_price
    with transaction.atomic():
        batch.remaining_quantity += quantity
        batch.status = 'in_stock'
        batch.save(update_fields=['remaining_quantity', 'status', 'update_time'])
        consumable.current_stock += quantity
        consumable.save(update_fields=['current_stock', 'update_time'])

        tx = ConsumableTransaction.objects.create(
            consumable=consumable,
            batch=batch,
            transaction_type=ConsumableTransactionType.RETURN,
            quantity=quantity,
            operator_id=operator_id,
            operator_name=operator_name,
            unit_cost=unit_cost,
            remarks=remarks,
        )
    logger.info('Return consumable_id=%s batch_id=%s qty=%s', consumable_id, batch_id, quantity)
    return tx


def scrap_consumable(
    consumable_id: int,
    batch_id: int,
    quantity: int,
    operator_id: Optional[int] = None,
    operator_name: str = '',
    remarks: str = '',
) -> Optional[ConsumableTransaction]:
    """报废：减少批次剩余数量及耗材总库存"""
    consumable = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    batch = ConsumableBatch.objects.filter(id=batch_id, consumable_id=consumable_id).first()
    if not consumable or not batch or quantity <= 0:
        return None
    if batch.remaining_quantity < quantity:
        logger.warning('Insufficient batch stock for scrap: batch_id=%s remaining=%s requested=%s',
                       batch_id, batch.remaining_quantity, quantity)
        return None

    unit_cost = batch.inbound_price
    with transaction.atomic():
        batch.remaining_quantity -= quantity
        batch.status = 'depleted' if batch.remaining_quantity <= 0 else 'in_stock'
        batch.save(update_fields=['remaining_quantity', 'status', 'update_time'])
        consumable.current_stock -= quantity
        consumable.save(update_fields=['current_stock', 'update_time'])

        tx = ConsumableTransaction.objects.create(
            consumable=consumable,
            batch=batch,
            transaction_type=ConsumableTransactionType.SCRAP,
            quantity=quantity,
            operator_id=operator_id,
            operator_name=operator_name,
            unit_cost=unit_cost,
            remarks=remarks,
        )
    logger.info('Scrap consumable_id=%s batch_id=%s qty=%s', consumable_id, batch_id, quantity)
    return tx


# ============================================================================
# Transactions
# ============================================================================


def list_transactions(
    consumable_id: Optional[int] = None,
    transaction_type: str = '',
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页列表耗材流水"""
    qs = ConsumableTransaction.objects.select_related('consumable', 'batch')
    if consumable_id:
        qs = qs.filter(consumable_id=consumable_id)
    if transaction_type:
        qs = qs.filter(transaction_type=transaction_type)
    if start_date:
        qs = qs.filter(create_time__date__gte=start_date)
    if end_date:
        qs = qs.filter(create_time__date__lte=end_date)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# Inventory
# ============================================================================


def get_consumable_stats() -> dict:
    """耗材库存统计"""
    today = date.today()
    consumables = Consumable.objects.filter(is_deleted=False)
    return {
        'total_types': consumables.count(),
        'total_quantity': sum(c.current_stock for c in consumables),
        'low_stock_count': sum(1 for c in consumables if c.current_stock < c.safety_stock),
        'expiring_count': consumables.filter(
            expiry_date__gte=today,
            expiry_date__lte=today + timedelta(days=30),
        ).count(),
    }


def check_and_generate_alerts() -> int:
    """
    检查库存与效期，生成 ConsumableAlert。
    返回本次新增预警数量。
    """
    today = date.today()
    expiring_threshold = today + timedelta(days=30)
    created = 0

    consumables = Consumable.objects.filter(is_deleted=False).prefetch_related('batches')
    for c in consumables:
        # 库存不足 / 缺货
        if c.current_stock <= 0:
            if not ConsumableAlert.objects.filter(
                consumable=c, alert_type='out_of_stock', status='pending'
            ).exists():
                ConsumableAlert.objects.create(
                    consumable=c,
                    alert_type='out_of_stock',
                    alert_message=f'耗材 [{c.name}] 已缺货',
                    severity='critical',
                )
                created += 1
        elif c.current_stock < c.safety_stock:
            if not ConsumableAlert.objects.filter(
                consumable=c, alert_type='low_stock', status='pending'
            ).exists():
                ConsumableAlert.objects.create(
                    consumable=c,
                    alert_type='low_stock',
                    alert_message=f'耗材 [{c.name}] 库存不足：当前 {c.current_stock}，安全库存 {c.safety_stock}',
                    severity='high',
                )
                created += 1

        # 批次效期
        for batch in c.batches.filter(remaining_quantity__gt=0):
            if batch.expiry_date:
                if batch.expiry_date < today:
                    if not ConsumableAlert.objects.filter(
                        consumable=c, batch=batch, alert_type='expired', status='pending'
                    ).exists():
                        ConsumableAlert.objects.create(
                            consumable=c,
                            batch=batch,
                            alert_type='expired',
                            alert_message=f'耗材 [{c.name}] 批次 [{batch.batch_number}] 已过期',
                            severity='critical',
                        )
                        created += 1
                elif batch.expiry_date <= expiring_threshold:
                    if not ConsumableAlert.objects.filter(
                        consumable=c, batch=batch, alert_type='expiring_soon', status='pending'
                    ).exists():
                        days = (batch.expiry_date - today).days
                        ConsumableAlert.objects.create(
                            consumable=c,
                            batch=batch,
                            alert_type='expiring_soon',
                            alert_message=f'耗材 [{c.name}] 批次 [{batch.batch_number}] 将于 {days} 天后过期',
                            severity='medium' if days <= 7 else 'low',
                        )
                        created += 1

    if created:
        logger.info('Generated %s consumable alerts', created)
    return created


# ============================================================================
# Alerts
# ============================================================================


def list_alerts(
    consumable_id: Optional[int] = None,
    alert_type: str = '',
    status: str = '',
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页列表耗材预警"""
    qs = ConsumableAlert.objects.select_related('consumable', 'batch')
    if consumable_id:
        qs = qs.filter(consumable_id=consumable_id)
    if alert_type:
        qs = qs.filter(alert_type=alert_type)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


def acknowledge_alert(
    alert_id: int,
    by_id: Optional[int] = None,
    by_name: str = '',
) -> Optional[ConsumableAlert]:
    """确认预警"""
    alert = ConsumableAlert.objects.filter(id=alert_id).first()
    if not alert:
        return None
    alert.status = 'acknowledged'
    alert.acknowledged_by_id = by_id
    alert.acknowledged_by_name = by_name
    alert.acknowledged_at = timezone.now()
    alert.save(update_fields=['status', 'acknowledged_by_id', 'acknowledged_by_name', 'acknowledged_at', 'update_time'])
    logger.info('Acknowledged alert id=%s', alert_id)
    return alert


def resolve_alert(
    alert_id: int,
    by_id: Optional[int] = None,
    by_name: str = '',
    note: str = '',
) -> Optional[ConsumableAlert]:
    """解决预警"""
    alert = ConsumableAlert.objects.filter(id=alert_id).first()
    if not alert:
        return None
    resolution = note
    if by_name:
        resolution = f'由 {by_name} 处理：{note}' if note else f'由 {by_name} 处理'
    alert.status = 'resolved'
    alert.resolution_note = resolution
    if not alert.acknowledged_at:
        alert.acknowledged_by_id = by_id
        alert.acknowledged_by_name = by_name
        alert.acknowledged_at = timezone.now()
    alert.save(update_fields=[
        'status', 'resolution_note', 'acknowledged_by_id', 'acknowledged_by_name',
        'acknowledged_at', 'update_time',
    ])
    logger.info('Resolved alert id=%s', alert_id)
    return alert
