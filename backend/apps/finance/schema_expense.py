"""
费用报销 Schema
"""
from ninja import Schema
from typing import Optional, List
from decimal import Decimal


class ExpenseCreateIn(Schema):
    request_no: str
    applicant_id: int
    expense_type: str
    amount: Decimal
    description: str
    applicant_name: Optional[str] = ''
    protocol_id: Optional[int] = None
    project_name: Optional[str] = ''
    receipt_count: int = 0
    receipt_images: Optional[List[str]] = None
    budget_item_id: Optional[int] = None
    notes: Optional[str] = ''
