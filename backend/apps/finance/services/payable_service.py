"""
应付管理服务
"""
import logging
from typing import Optional
from decimal import Decimal
from django.utils import timezone

from apps.finance.models_payable import PayableRecord, PayableStatus

logger = logging.getLogger(__name__)


def create_payable(
    record_no: str, supplier_name: str, amount: Decimal,
    due_date=None, protocol_id: int = None, project_name: str = '',
    supplier_id: int = None, invoice_no: str = '',
    tax_amount: Decimal = Decimal('0'), cost_type: str = '',
    budget_item_id: int = None, notes: str = '',
    created_by_id: int = None,
) -> PayableRecord:
    return PayableRecord.objects.create(
        record_no=record_no, supplier_name=supplier_name, amount=amount,
        due_date=due_date, protocol_id=protocol_id, project_name=project_name,
        supplier_id=supplier_id, invoice_no=invoice_no,
        tax_amount=tax_amount, cost_type=cost_type,
        budget_item_id=budget_item_id, notes=notes,
        created_by_id=created_by_id,
    )


def approve_payable(record_id: int) -> Optional[PayableRecord]:
    record = PayableRecord.objects.filter(
        id=record_id, payment_status=PayableStatus.PENDING,
    ).first()
    if not record:
        return None
    record.payment_status = PayableStatus.APPROVED
    record.save(update_fields=['payment_status', 'update_time'])
    return record


def pay_payable(record_id: int, paid_amount: Decimal = None, paid_date=None) -> Optional[PayableRecord]:
    record = PayableRecord.objects.filter(
        id=record_id, payment_status=PayableStatus.APPROVED,
    ).first()
    if not record:
        return None
    record.payment_status = PayableStatus.PAID
    record.paid_amount = paid_amount or record.amount
    record.paid_date = paid_date or timezone.now().date()
    record.save(update_fields=['payment_status', 'paid_amount', 'paid_date', 'update_time'])

    if record.budget_item_id:
        from apps.finance.services.budget_service import update_budget_actuals
        if record.budget_item and record.budget_item.budget_id:
            update_budget_actuals(record.budget_item.budget_id)

    return record


def list_payables(protocol_id: int = None, status: str = None,
                  page: int = 1, page_size: int = 20) -> dict:
    qs = PayableRecord.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(payment_status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}
