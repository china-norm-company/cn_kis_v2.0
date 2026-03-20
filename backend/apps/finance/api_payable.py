"""
应付管理 API
"""
from ninja import Router
from typing import Optional

from .schema_payable import PayableCreateIn, PayablePayIn
from apps.identity.decorators import _get_account_from_request, require_permission

router = Router()


@router.post('/create', summary='创建应付记录')
@require_permission('finance.payable.create')
def create_payable(request, data: PayableCreateIn):
    from apps.finance.services.payable_service import create_payable as svc
    account = _get_account_from_request(request)
    record = svc(
        record_no=data.record_no, supplier_name=data.supplier_name,
        amount=data.amount, due_date=data.due_date,
        protocol_id=data.protocol_id, project_name=data.project_name or '',
        supplier_id=data.supplier_id, invoice_no=data.invoice_no or '',
        tax_amount=data.tax_amount, cost_type=data.cost_type or '',
        budget_item_id=data.budget_item_id, notes=data.notes or '',
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '应付记录已创建', 'data': {
        'id': record.id, 'record_no': record.record_no,
    }}


@router.get('/list', summary='应付记录列表')
@require_permission('finance.payable.read')
def list_payables(request, protocol_id: Optional[int] = None,
                   status: Optional[str] = None,
                   page: int = 1, page_size: int = 20):
    from apps.finance.services.payable_service import list_payables as svc
    result = svc(protocol_id=protocol_id, status=status, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'record_no': r.record_no, 'supplier_name': r.supplier_name,
            'amount': str(r.amount), 'due_date': str(r.due_date),
            'payment_status': r.payment_status, 'protocol_id': r.protocol_id,
            'paid_amount': str(r.paid_amount), 'paid_date': str(r.paid_date) if r.paid_date else '',
        } for r in result['items']],
        'total': result['total'],
    }}


@router.post('/{record_id}/approve', summary='审批应付')
@require_permission('finance.payable.create')
def approve_payable(request, record_id: int):
    from apps.finance.services.payable_service import approve_payable as svc
    record = svc(record_id)
    if not record:
        return {'code': 400, 'msg': '审批失败', 'data': None}
    return {'code': 200, 'msg': '已审批', 'data': {'id': record.id, 'payment_status': record.payment_status}}


@router.post('/{record_id}/pay', summary='确认付款')
@require_permission('finance.payable.create')
def pay_payable(request, record_id: int, data: PayablePayIn):
    from apps.finance.services.payable_service import pay_payable as svc
    record = svc(record_id, paid_amount=data.paid_amount, paid_date=data.paid_date)
    if not record:
        return {'code': 400, 'msg': '付款失败（需先审批）', 'data': None}
    return {'code': 200, 'msg': '已付款', 'data': {
        'id': record.id, 'payment_status': record.payment_status,
        'paid_amount': str(record.paid_amount),
    }}
