"""
应付管理 Schema
"""
from ninja import Schema
from typing import Optional
from datetime import date
from decimal import Decimal


class PayableCreateIn(Schema):
    record_no: str
    supplier_name: str
    amount: Decimal
    due_date: date
    protocol_id: Optional[int] = None
    project_name: Optional[str] = ''
    supplier_id: Optional[int] = None
    invoice_no: Optional[str] = ''
    tax_amount: Decimal = Decimal('0')
    cost_type: Optional[str] = ''
    budget_item_id: Optional[int] = None
    notes: Optional[str] = ''


class PayablePayIn(Schema):
    paid_amount: Optional[Decimal] = None
    paid_date: Optional[date] = None
