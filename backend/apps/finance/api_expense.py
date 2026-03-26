"""
费用报销 API
"""
from ninja import Router
from typing import Optional

from .schema_expense import ExpenseCreateIn
from apps.identity.decorators import _get_account_from_request, require_permission

router = Router()


@router.post('/create', summary='创建费用报销')
@require_permission('finance.expense.create')
def create_expense(request, data: ExpenseCreateIn):
    from apps.finance.services.expense_service import create_expense_request as svc
    account = _get_account_from_request(request)
    req = svc(
        request_no=data.request_no, applicant_id=data.applicant_id,
        expense_type=data.expense_type, amount=data.amount,
        description=data.description, applicant_name=data.applicant_name or '',
        protocol_id=data.protocol_id, project_name=data.project_name or '',
        receipt_count=data.receipt_count, receipt_images=data.receipt_images,
        budget_item_id=data.budget_item_id, notes=data.notes or '',
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '报销申请已创建', 'data': {
        'id': req.id, 'request_no': req.request_no,
    }}


@router.get('/list', summary='费用报销列表')
@require_permission('finance.expense.read')
def list_expenses(request, applicant_id: Optional[int] = None,
                   protocol_id: Optional[int] = None,
                   status: Optional[str] = None,
                   page: int = 1, page_size: int = 20):
    from apps.finance.services.expense_service import list_expenses as svc
    result = svc(applicant_id=applicant_id, protocol_id=protocol_id,
                  status=status, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'request_no': r.request_no,
            'applicant_name': r.applicant_name, 'expense_type': r.expense_type,
            'amount': str(r.amount), 'approval_status': r.approval_status,
            'description': r.description,
        } for r in result['items']],
        'total': result['total'],
    }}


@router.post('/{request_id}/submit', summary='提交报销')
@require_permission('finance.expense.create')
def submit_expense(request, request_id: int):
    from apps.finance.services.expense_service import submit_expense as svc
    req = svc(request_id)
    if not req:
        return {'code': 400, 'msg': '提交失败', 'data': None}
    return {'code': 200, 'msg': '已提交', 'data': {'id': req.id, 'approval_status': req.approval_status}}


@router.post('/{request_id}/approve', summary='审批报销')
@require_permission('finance.expense.create')
def approve_expense(request, request_id: int):
    from apps.finance.services.expense_service import approve_expense as svc
    account = _get_account_from_request(request)
    req = svc(request_id, approved_by_id=account.id if account else None)
    if not req:
        return {'code': 400, 'msg': '审批失败', 'data': None}
    return {'code': 200, 'msg': '已审批', 'data': {'id': req.id, 'approval_status': req.approval_status}}


@router.post('/{request_id}/reject', summary='驳回报销')
@require_permission('finance.expense.create')
def reject_expense(request, request_id: int):
    from apps.finance.services.expense_service import reject_expense as svc
    req = svc(request_id)
    if not req:
        return {'code': 400, 'msg': '驳回失败', 'data': None}
    return {'code': 200, 'msg': '已驳回', 'data': {'id': req.id, 'approval_status': req.approval_status}}


@router.post('/{request_id}/reimburse', summary='确认报销')
@require_permission('finance.expense.create')
def reimburse_expense(request, request_id: int):
    from apps.finance.services.expense_service import reimburse_expense as svc
    req = svc(request_id)
    if not req:
        return {'code': 400, 'msg': '报销失败', 'data': None}
    return {'code': 200, 'msg': '已报销', 'data': {'id': req.id, 'approval_status': req.approval_status}}
