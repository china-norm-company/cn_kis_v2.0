"""
发票服务增强

发票明细行管理、红冲/作废、里程碑触发开票提醒。
"""
import logging
from typing import Optional
from decimal import Decimal

from apps.finance.models import (
    Invoice, InvoiceStatus, InvoiceItem,
    Contract,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 发票明细行
# ============================================================================
def add_invoice_item(
    invoice_id: int, item_name: str, unit_price: Decimal,
    specification: str = '', unit: str = '',
    quantity: Decimal = Decimal('1'), tax_rate: Decimal = Decimal('6'),
) -> Optional[InvoiceItem]:
    invoice = Invoice.objects.filter(id=invoice_id, is_deleted=False).first()
    if not invoice:
        return None
    amount = quantity * unit_price
    tax_amount = amount * tax_rate / Decimal('100')
    item = InvoiceItem.objects.create(
        invoice=invoice, item_name=item_name, specification=specification,
        unit=unit, quantity=quantity, unit_price=unit_price,
        amount=amount, tax_rate=tax_rate, tax_amount=tax_amount,
    )
    _recalc_invoice_totals(invoice)
    return item


def update_invoice_item(item_id: int, **kwargs) -> Optional[InvoiceItem]:
    item = InvoiceItem.objects.filter(id=item_id).select_related('invoice').first()
    if not item:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(item, k):
            setattr(item, k, v)
    if 'quantity' in kwargs or 'unit_price' in kwargs:
        item.amount = item.quantity * item.unit_price
    if 'quantity' in kwargs or 'unit_price' in kwargs or 'tax_rate' in kwargs:
        item.tax_amount = item.amount * item.tax_rate / Decimal('100')
    item.save()
    _recalc_invoice_totals(item.invoice)
    return item


def delete_invoice_item(item_id: int) -> bool:
    item = InvoiceItem.objects.filter(id=item_id).select_related('invoice').first()
    if not item:
        return False
    invoice = item.invoice
    item.delete()
    _recalc_invoice_totals(invoice)
    return True


def list_invoice_items(invoice_id: int) -> list:
    return list(InvoiceItem.objects.filter(invoice_id=invoice_id))


def _recalc_invoice_totals(invoice: Invoice):
    """根据明细行重新计算发票金额"""
    from django.db.models import Sum
    items = InvoiceItem.objects.filter(invoice=invoice)
    totals = items.aggregate(
        sum_amount=Sum('amount'),
        sum_tax=Sum('tax_amount'),
    )
    invoice.amount = totals['sum_amount'] or Decimal('0')
    invoice.tax_amount = totals['sum_tax'] or Decimal('0')
    invoice.total = invoice.amount + invoice.tax_amount
    invoice.save(update_fields=['amount', 'tax_amount', 'total', 'update_time'])


# ============================================================================
# 红冲 / 作废
# ============================================================================
def void_invoice(invoice_id: int) -> Optional[Invoice]:
    """作废发票（仅草稿/已提交可作废）"""
    invoice = Invoice.objects.filter(
        id=invoice_id, is_deleted=False,
        status__in=[InvoiceStatus.DRAFT, InvoiceStatus.SUBMITTED],
    ).first()
    if not invoice:
        return None
    invoice.status = InvoiceStatus.VOIDED
    invoice.save(update_fields=['status', 'update_time'])
    logger.info(f"发票#{invoice.id} ({invoice.code}) 已作废")
    return invoice


def credit_invoice(invoice_id: int) -> Optional[dict]:
    """
    红冲发票：创建一张负数发票用于冲销。
    仅已审批/已寄出/已回款的发票可红冲。
    返回原发票和红冲发票。
    """
    original = Invoice.objects.filter(
        id=invoice_id, is_deleted=False,
        status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
    ).first()
    if not original:
        return None

    credit_code = f'{original.code}-CR'
    credit_inv = Invoice.objects.create(
        code=credit_code,
        contract=original.contract,
        client=original.client,
        amount=-original.amount,
        tax_amount=-original.tax_amount,
        total=-original.total,
        type=original.type,
        status=InvoiceStatus.APPROVED,
        invoice_date=original.invoice_date,
        notes=f'红冲发票，原发票编号：{original.code}',
        created_by_id=original.created_by_id,
    )

    for item in InvoiceItem.objects.filter(invoice=original):
        InvoiceItem.objects.create(
            invoice=credit_inv,
            item_name=item.item_name,
            specification=item.specification,
            unit=item.unit,
            quantity=-item.quantity,
            unit_price=item.unit_price,
            amount=-item.amount,
            tax_rate=item.tax_rate,
            tax_amount=-item.tax_amount,
        )

    original.status = InvoiceStatus.CREDITED
    original.save(update_fields=['status', 'update_time'])

    logger.info(f"发票#{original.id} ({original.code}) 已红冲 → {credit_inv.code}")
    return {
        'original_id': original.id,
        'credit_id': credit_inv.id,
        'credit_code': credit_inv.code,
    }
