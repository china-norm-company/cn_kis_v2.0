"""
报价服务增强

报价明细行管理、版本修订、报价转合同。
"""
import logging
from typing import Optional
from decimal import Decimal

from apps.finance.models import Quote, QuoteItem, QuoteStatus

logger = logging.getLogger(__name__)


def add_quote_item(
    quote_id: int, item_name: str, quantity: Decimal, unit_price: Decimal,
    specification: str = '', unit: str = '', cost_estimate: Decimal = None,
    sort_order: int = 0,
) -> Optional[QuoteItem]:
    quote = Quote.objects.filter(id=quote_id, is_deleted=False).first()
    if not quote:
        return None
    amount = quantity * unit_price
    item = QuoteItem.objects.create(
        quote=quote, item_name=item_name, specification=specification,
        unit=unit, quantity=quantity, unit_price=unit_price,
        amount=amount, cost_estimate=cost_estimate, sort_order=sort_order,
    )
    _recalc_quote_total(quote)
    return item


def update_quote_item(
    item_id: int, **kwargs
) -> Optional[QuoteItem]:
    item = QuoteItem.objects.filter(id=item_id).select_related('quote').first()
    if not item:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(item, k):
            setattr(item, k, v)
    if 'quantity' in kwargs or 'unit_price' in kwargs:
        item.amount = item.quantity * item.unit_price
    item.save()
    _recalc_quote_total(item.quote)
    return item


def delete_quote_item(item_id: int) -> bool:
    item = QuoteItem.objects.filter(id=item_id).select_related('quote').first()
    if not item:
        return False
    quote = item.quote
    item.delete()
    _recalc_quote_total(quote)
    return True


def list_quote_items(quote_id: int) -> list:
    return list(QuoteItem.objects.filter(quote_id=quote_id).order_by('sort_order'))


def _recalc_quote_total(quote: Quote):
    """根据明细行重新计算报价总金额"""
    from django.db.models import Sum
    total = QuoteItem.objects.filter(quote=quote).aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')
    quote.total_amount = total
    quote.save(update_fields=['total_amount', 'update_time'])


def revise_quote(quote_id: int) -> Optional[Quote]:
    """创建报价修订版本（复制报价和明细行，关联原版本）"""
    original = Quote.objects.filter(id=quote_id, is_deleted=False).first()
    if not original:
        return None

    new_version = original.version + 1
    new_code = f'{original.code}-V{new_version}'

    revised = Quote.objects.create(
        code=new_code,
        project=original.project,
        client=original.client,
        total_amount=original.total_amount,
        status=QuoteStatus.DRAFT,
        created_at=original.created_at,
        valid_until=original.valid_until,
        notes=original.notes,
        protocol_id=original.protocol_id,
        client_id=original.client_id,
        created_by_id=original.created_by_id,
        version=new_version,
        parent_quote=original,
    )

    for item in QuoteItem.objects.filter(quote=original):
        QuoteItem.objects.create(
            quote=revised,
            item_name=item.item_name,
            specification=item.specification,
            unit=item.unit,
            quantity=item.quantity,
            unit_price=item.unit_price,
            amount=item.amount,
            cost_estimate=item.cost_estimate,
            sort_order=item.sort_order,
        )

    return revised


def convert_quote_to_contract(quote_id: int) -> Optional[dict]:
    """报价确认后转合同（返回预填数据供前端确认）"""
    quote = Quote.objects.filter(
        id=quote_id, is_deleted=False, status=QuoteStatus.ACCEPTED
    ).first()
    if not quote:
        return None

    return {
        'project': quote.project,
        'client': quote.client,
        'amount': quote.total_amount,
        'quote_id': quote.id,
        'protocol_id': quote.protocol_id,
        'client_id': quote.client_id,
    }
