"""
费用报销服务
"""
import logging
from typing import Optional
from decimal import Decimal
from django.utils import timezone

from apps.finance.models_expense import ExpenseRequest, ExpenseApprovalStatus

logger = logging.getLogger(__name__)


def create_expense_request(
    request_no: str, applicant_id: int, expense_type: str,
    amount: Decimal, description: str,
    applicant_name: str = '', protocol_id: int = None,
    project_name: str = '', receipt_count: int = 0,
    receipt_images: list = None, budget_item_id: int = None,
    notes: str = '', created_by_id: int = None,
) -> ExpenseRequest:
    return ExpenseRequest.objects.create(
        request_no=request_no, applicant_id=applicant_id,
        applicant_name=applicant_name, expense_type=expense_type,
        amount=amount, description=description,
        protocol_id=protocol_id, project_name=project_name,
        receipt_count=receipt_count, receipt_images=receipt_images or [],
        budget_item_id=budget_item_id, notes=notes,
        created_by_id=created_by_id,
    )


def submit_expense(request_id: int) -> Optional[ExpenseRequest]:
    req = ExpenseRequest.objects.filter(
        id=request_id, approval_status=ExpenseApprovalStatus.DRAFT,
    ).first()
    if not req:
        return None
    req.approval_status = ExpenseApprovalStatus.SUBMITTED
    req.save(update_fields=['approval_status', 'update_time'])
    return req


def approve_expense(request_id: int, approved_by_id: int = None) -> Optional[ExpenseRequest]:
    req = ExpenseRequest.objects.filter(
        id=request_id, approval_status=ExpenseApprovalStatus.SUBMITTED,
    ).first()
    if not req:
        return None
    req.approval_status = ExpenseApprovalStatus.APPROVED
    req.approved_by_id = approved_by_id
    req.approved_at = timezone.now()
    req.save(update_fields=['approval_status', 'approved_by_id', 'approved_at', 'update_time'])
    return req


def reject_expense(request_id: int) -> Optional[ExpenseRequest]:
    req = ExpenseRequest.objects.filter(
        id=request_id, approval_status=ExpenseApprovalStatus.SUBMITTED,
    ).first()
    if not req:
        return None
    req.approval_status = ExpenseApprovalStatus.REJECTED
    req.save(update_fields=['approval_status', 'update_time'])
    return req


def reimburse_expense(request_id: int) -> Optional[ExpenseRequest]:
    req = ExpenseRequest.objects.filter(
        id=request_id, approval_status=ExpenseApprovalStatus.APPROVED,
    ).first()
    if not req:
        return None
    req.approval_status = ExpenseApprovalStatus.REIMBURSED
    req.save(update_fields=['approval_status', 'update_time'])

    if req.budget_item_id:
        from apps.finance.services.budget_service import update_budget_actuals
        if req.budget_item and req.budget_item.budget_id:
            update_budget_actuals(req.budget_item.budget_id)

    return req


def list_expenses(applicant_id: int = None, protocol_id: int = None,
                  status: str = None, import_source: str = None,
                  keyword: str = None,
                  page: int = 1, page_size: int = 20) -> dict:
    qs = ExpenseRequest.objects.all()
    if applicant_id:
        qs = qs.filter(applicant_id=applicant_id)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(approval_status=status)
    if import_source:
        qs = qs.filter(import_source=import_source)
    if keyword:
        from django.db.models import Q
        qs = qs.filter(
            Q(request_no__icontains=keyword)
            | Q(applicant_name__icontains=keyword)
            | Q(description__icontains=keyword)
            | Q(ekuaibao_no__icontains=keyword)
        )
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}
