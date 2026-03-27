"""
物料管理服务层

覆盖：仪表盘、产品统计、耗材 CRUD、库存管理、效期预警、样品追溯
"""
import logging
from datetime import date, timedelta
from typing import Optional

from django.db.models import Count, Q as models_Q

from .models import Product, SampleInstance, SampleTransaction, SampleStatus, TransactionType
from .models_material import (
    Consumable, ConsumableTransaction, ConsumableTransactionType,
    StorageLocation, InventoryCheck, InventoryCheckStatus,
    ExpiryAlert, ExpiryAlertStatus,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 仪表盘
# ============================================================================

def get_material_dashboard() -> dict:
    """物料总览仪表盘"""
    today = date.today()

    products = Product.objects.filter(is_deleted=False)
    total_products = products.count()
    expired = products.filter(expiry_date__lt=today).count()
    expiring_soon = products.filter(
        expiry_date__gte=today,
        expiry_date__lte=today + timedelta(days=30),
    ).count()
    active_batches = total_products - expired

    consumables = Consumable.objects.filter(is_deleted=False)
    csm_total_types = consumables.count()
    csm_total_qty = sum(c.current_stock for c in consumables)
    csm_low_stock = sum(1 for c in consumables if c.current_stock < c.safety_stock)
    csm_expiring = consumables.filter(
        expiry_date__lte=today + timedelta(days=30),
        expiry_date__gte=today,
    ).count()

    samples = SampleInstance.objects.all()
    sample_stats = {
        'total': samples.count(),
        'in_stock': samples.filter(status=SampleStatus.IN_STOCK).count(),
        'distributed': samples.filter(status=SampleStatus.DISTRIBUTED).count(),
        'returned': samples.filter(status=SampleStatus.RETURNED).count(),
        'consumed': samples.filter(status=SampleStatus.CONSUMED).count(),
        'destroyed': samples.filter(status=SampleStatus.DESTROYED).count(),
        'retention': samples.filter(retention=True).count(),
    }

    tx_today = SampleTransaction.objects.filter(create_time__date=today)

    alerts = ExpiryAlert.objects.exclude(status=ExpiryAlertStatus.HANDLED)
    red_count = sum(1 for a in alerts if a.days_remaining <= 7)
    orange_count = sum(1 for a in alerts if 7 < a.days_remaining <= 30)
    yellow_count = sum(1 for a in alerts if 30 < a.days_remaining <= 90)

    last_check = InventoryCheck.objects.first()

    return {
        'products': {
            'total_products': total_products,
            'active_batches': active_batches,
            'expiring_soon': expiring_soon,
            'expired': expired,
        },
        'consumables': {
            'total_types': csm_total_types,
            'total_quantity': csm_total_qty,
            'low_stock_count': csm_low_stock,
            'expiring_count': csm_expiring,
        },
        'samples': sample_stats,
        'transactions': {
            'today_inbound': tx_today.filter(transaction_type=TransactionType.INBOUND).count(),
            'today_outbound': tx_today.exclude(transaction_type=TransactionType.INBOUND).count(),
            'month_total': SampleTransaction.objects.filter(
                create_time__year=today.year, create_time__month=today.month,
            ).count(),
            'abnormal_count': 0,
        },
        'expiry': {
            'red_count': red_count,
            'orange_count': orange_count,
            'yellow_count': yellow_count,
        },
        'inventory': {
            'cold_count': StorageLocation.objects.filter(zone='cold').count(),
            'cool_count': StorageLocation.objects.filter(zone='cool').count(),
            'room_count': StorageLocation.objects.filter(zone='room').count(),
            'last_check_date': str(last_check.check_date) if last_check else None,
            'check_result': (
                f'{last_check.matched_items}/{last_check.total_items} 一致'
                if last_check else '无盘点记录'
            ),
        },
    }


# ============================================================================
# 产品管理
# ============================================================================

def get_product_stats() -> dict:
    today = date.today()
    products = Product.objects.filter(is_deleted=False)
    return {
        'total_products': products.count(),
        'active_batches': products.exclude(expiry_date__lt=today).count(),
        'expiring_soon': products.filter(
            expiry_date__gte=today, expiry_date__lte=today + timedelta(days=30),
        ).count(),
        'expired': products.filter(expiry_date__lt=today).count(),
    }


def list_products(
    keyword: str = '', product_type: str = '',
    storage_condition: str = '', expiry_status: str = '',
    protocol_bound: str = '',
    stock_kind: str = '',
    study_project_type: str = '',
    page: int = 1, page_size: int = 20,
) -> dict:
    today = date.today()
    qs = Product.objects.filter(is_deleted=False)

    if keyword:
        qs = qs.filter(
            models_Q(name__icontains=keyword) |
            models_Q(code__icontains=keyword) |
            models_Q(batch_number__icontains=keyword) |
            models_Q(sponsor__icontains=keyword)
        )
    if product_type:
        qs = qs.filter(product_type=product_type)
    if storage_condition:
        qs = qs.filter(storage_condition__icontains=storage_condition)
    if expiry_status == 'expired':
        qs = qs.filter(expiry_date__lt=today)
    elif expiry_status == 'active':
        qs = qs.exclude(expiry_date__lt=today)
    elif expiry_status == 'expiring':
        qs = qs.filter(
            expiry_date__gte=today,
            expiry_date__lte=today + timedelta(days=30),
        )

    if protocol_bound == 'yes':
        qs = qs.filter(protocol_id__isnull=False)
    elif protocol_bound == 'no':
        qs = qs.filter(protocol_id__isnull=True)

    if study_project_type:
        qs = qs.filter(study_project_type=study_project_type)

    if stock_kind == 'has_in_stock':
        qs = qs.annotate(
            _in_stock_n=Count(
                'instances',
                filter=models_Q(instances__status=SampleStatus.IN_STOCK),
            ),
        ).filter(_in_stock_n__gt=0)
    elif stock_kind == 'no_instances':
        qs = qs.annotate(_inst_n=Count('instances')).filter(_inst_n=0)
    elif stock_kind == 'no_in_stock':
        qs = qs.annotate(
            _inst_n=Count('instances'),
            _in_stock_n=Count(
                'instances',
                filter=models_Q(instances__status=SampleStatus.IN_STOCK),
            ),
        ).filter(_inst_n__gt=0, _in_stock_n=0)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


def get_product_detail(product_id: int) -> Optional[dict]:
    product = Product.objects.filter(id=product_id, is_deleted=False).first()
    if not product:
        return None

    instances = SampleInstance.objects.filter(product=product)
    sample_summary = {
        'total': instances.count(),
        'in_stock': instances.filter(status=SampleStatus.IN_STOCK).count(),
        'distributed': instances.filter(status=SampleStatus.DISTRIBUTED).count(),
        'returned': instances.filter(status=SampleStatus.RETURNED).count(),
        'destroyed': instances.filter(status=SampleStatus.DESTROYED).count(),
    }
    retention_instances = instances.filter(retention=True)
    retention_info = None
    if retention_instances.exists():
        r = retention_instances.first()
        retention_info = {
            'required': True,
            'quantity': retention_instances.count(),
            'location': r.storage_location or '',
            'release_date': '',
        }

    return {
        'product': product,
        'sample_summary': sample_summary,
        'retention_info': retention_info,
    }


# ============================================================================
# 耗材管理
# ============================================================================

def get_consumable_stats() -> dict:
    consumables = Consumable.objects.filter(is_deleted=False)
    return {
        'total_types': consumables.count(),
        'total_quantity': sum(c.current_stock for c in consumables),
        'low_stock_count': sum(1 for c in consumables if c.current_stock < c.safety_stock),
        'expiring_count': consumables.filter(
            expiry_date__lte=date.today() + timedelta(days=30),
            expiry_date__gte=date.today(),
        ).count(),
    }


def list_consumables(
    category: str = '', status: str = '', keyword: str = '',
    page: int = 1, page_size: int = 20,
) -> dict:
    qs = Consumable.objects.filter(is_deleted=False)
    if category:
        qs = qs.filter(category=category)
    if keyword:
        from django.db.models import Q
        qs = qs.filter(Q(name__icontains=keyword) | Q(code__icontains=keyword))

    items = list(qs)
    if status:
        items = [c for c in items if c.status == status]

    total = len(items)
    offset = (page - 1) * page_size
    return {'items': items[offset:offset + page_size], 'total': total}


def create_consumable(
    name: str, code: str, specification: str = '',
    unit: str = '', safety_stock: int = 0,
    storage_condition: str = '', category: str = '',
) -> Consumable:
    return Consumable.objects.create(
        name=name, code=code, specification=specification,
        unit=unit, safety_stock=safety_stock,
        storage_condition=storage_condition, category=category,
    )


def issue_consumable(
    consumable_id: int, quantity: int,
    operator_name: str = '', operator_id: int = None,
    purpose: str = '', work_order_id: int = None,
) -> Optional[Consumable]:
    c = Consumable.objects.filter(id=consumable_id, is_deleted=False).first()
    if not c or c.current_stock < quantity:
        return None

    c.current_stock -= quantity
    c.last_issue_date = date.today()
    c.save(update_fields=['current_stock', 'last_issue_date', 'update_time'])

    ConsumableTransaction.objects.create(
        consumable=c,
        transaction_type=ConsumableTransactionType.ISSUE,
        quantity=quantity,
        operator_name=operator_name,
        operator_id=operator_id,
        purpose=purpose,
        work_order_id=work_order_id,
    )
    return c


# ============================================================================
# 库存管理
# ============================================================================

def get_inventory_overview() -> dict:
    zones = {
        'cold': {'zone': '冷藏区 (2-8°C)', 'item_count': 0, 'capacity_usage': '0%', 'temperature': '', 'humidity': ''},
        'cool': {'zone': '阴凉区 (≤20°C)', 'item_count': 0, 'capacity_usage': '0%', 'temperature': '', 'humidity': ''},
        'room': {'zone': '常温区 (10-30°C)', 'item_count': 0, 'capacity_usage': '0%', 'temperature': '', 'humidity': ''},
    }
    for loc in StorageLocation.objects.all():
        if loc.zone in zones:
            zones[loc.zone]['item_count'] += 1
            if loc.temperature:
                zones[loc.zone]['temperature'] = f'{loc.temperature}°C'
            if loc.humidity:
                zones[loc.zone]['humidity'] = f'{loc.humidity}%'

    return {
        'cold_storage': zones['cold'],
        'cool_storage': zones['cool'],
        'room_storage': zones['room'],
    }


def list_inventory(
    zone: str = '', status: str = '', keyword: str = '',
    page: int = 1, page_size: int = 20,
) -> dict:
    items = []

    products = Product.objects.filter(is_deleted=False)
    for p in products:
        in_stock = SampleInstance.objects.filter(
            product=p, status=SampleStatus.IN_STOCK,
        ).count()
        if in_stock == 0:
            continue

        sample = SampleInstance.objects.filter(
            product=p, status=SampleStatus.IN_STOCK,
        ).first()

        item_zone = 'room'
        if '冷藏' in p.storage_condition:
            item_zone = 'cold'
        elif '阴凉' in p.storage_condition:
            item_zone = 'cool'

        item_status = 'normal'
        if p.status == 'expired':
            item_status = 'locked'

        items.append({
            'id': p.id,
            'material_name': p.name,
            'material_code': p.code,
            'batch_number': p.batch_number,
            'location': sample.storage_location if sample else '',
            'zone': item_zone,
            'quantity': in_stock,
            'unit': '份',
            'status': item_status,
        })

    if zone:
        items = [i for i in items if i['zone'] == zone]
    if status:
        items = [i for i in items if i['status'] == status]
    if keyword:
        kw = keyword.lower()
        items = [i for i in items if kw in i['material_name'].lower() or kw in i['material_code'].lower()]

    total = len(items)
    offset = (page - 1) * page_size
    return {'items': items[offset:offset + page_size], 'total': total}


def start_inventory_check(checker_name: str = '', checker_id: int = None) -> InventoryCheck:
    return InventoryCheck.objects.create(
        check_date=date.today(),
        status=InventoryCheckStatus.IN_PROGRESS,
        checker_name=checker_name,
        checker_id=checker_id,
    )


def get_latest_check() -> Optional[InventoryCheck]:
    return InventoryCheck.objects.first()


# ============================================================================
# 效期预警
# ============================================================================

def get_expiry_alerts() -> dict:
    alerts = ExpiryAlert.objects.exclude(status=ExpiryAlertStatus.HANDLED)
    red, orange, yellow = [], [], []

    for a in alerts:
        item = {
            'id': a.id,
            'material_name': a.material_name,
            'material_code': a.material_code,
            'batch_number': a.batch_number,
            'expiry_date': str(a.expiry_date),
            'days_remaining': a.days_remaining,
            'material_type': a.material_type,
            'status': a.status,
            'status_display': a.get_status_display(),
            'location': a.location,
        }
        if a.days_remaining <= 7:
            red.append(item)
        elif a.days_remaining <= 30:
            orange.append(item)
        elif a.days_remaining <= 90:
            yellow.append(item)

    return {
        'red': red,
        'orange': orange,
        'yellow': yellow,
        'stats': {
            'red_count': len(red),
            'orange_count': len(orange),
            'yellow_count': len(yellow),
        },
    }


def handle_expiry_alert(alert_id: int, action: str, remarks: str = '') -> Optional[ExpiryAlert]:
    alert = ExpiryAlert.objects.filter(id=alert_id).first()
    if not alert:
        return None

    from django.utils import timezone
    alert.handle_action = action
    alert.handle_remarks = remarks
    alert.handled_at = timezone.now()

    if action == 'lock':
        alert.status = ExpiryAlertStatus.LOCKED
    else:
        alert.status = ExpiryAlertStatus.HANDLED

    alert.save()
    return alert


# ============================================================================
# 出入库流水
# ============================================================================

def get_transaction_stats() -> dict:
    today = date.today()
    tx_today = SampleTransaction.objects.filter(create_time__date=today)
    return {
        'today_inbound': tx_today.filter(transaction_type=TransactionType.INBOUND).count(),
        'today_outbound': tx_today.exclude(transaction_type=TransactionType.INBOUND).count(),
        'month_total': SampleTransaction.objects.filter(
            create_time__year=today.year, create_time__month=today.month,
        ).count(),
        'abnormal_count': 0,
    }


def list_transactions(
    transaction_type: str = '', operator: str = '',
    start_date: str = '', end_date: str = '',
    page: int = 1, page_size: int = 20,
) -> dict:
    qs = SampleTransaction.objects.select_related('sample', 'sample__product').all()

    if transaction_type:
        qs = qs.filter(transaction_type=transaction_type)
    if operator:
        qs = qs.filter(operator_name__icontains=operator)
    if start_date:
        qs = qs.filter(create_time__date__gte=start_date)
    if end_date:
        qs = qs.filter(create_time__date__lte=end_date)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total}


# ============================================================================
# 样品追溯
# ============================================================================

def trace_sample(code: str = '', subject_id: str = '') -> Optional[dict]:
    sample = None
    if code:
        sample = SampleInstance.objects.filter(unique_code=code).first()
    if not sample and subject_id:
        sample = SampleInstance.objects.filter(
            current_holder_name__icontains=subject_id,
        ).first()
    if not sample:
        return None

    transactions = SampleTransaction.objects.filter(sample=sample).order_by('create_time')
    timeline = []
    for i, tx in enumerate(transactions, 1):
        timeline.append({
            'step': i,
            'action': tx.get_transaction_type_display(),
            'operator': tx.operator_name,
            'date': tx.create_time.strftime('%Y-%m-%d %H:%M'),
            'detail': tx.remarks,
        })

    related = SampleInstance.objects.filter(
        product=sample.product,
    ).exclude(id=sample.id)[:5]

    return {
        'sample': {
            'id': sample.id,
            'unique_code': sample.unique_code,
            'product_name': sample.product.name,
            'status': sample.status,
            'status_display': sample.get_status_display(),
            'current_holder': sample.current_holder_name,
        },
        'timeline': timeline,
        'related_samples': [
            {'unique_code': s.unique_code, 'status': s.get_status_display()}
            for s in related
        ],
    }


def get_sample_stats() -> dict:
    samples = SampleInstance.objects.all()
    return {
        'total': samples.count(),
        'in_stock': samples.filter(status=SampleStatus.IN_STOCK).count(),
        'distributed': samples.filter(status=SampleStatus.DISTRIBUTED).count(),
        'returned': samples.filter(status=SampleStatus.RETURNED).count(),
        'consumed': samples.filter(status=SampleStatus.CONSUMED).count(),
        'destroyed': samples.filter(status=SampleStatus.DESTROYED).count(),
        'retention': samples.filter(retention=True).count(),
    }


# ============================================================================
# 私有辅助
# ============================================================================
