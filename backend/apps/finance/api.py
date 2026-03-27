"""
财务管理 API

端点：
- 报价: /finance/quotes/list|create|{id}|stats
- 合同: /finance/contracts/list|create|{id}
- 发票: /finance/invoices/list|create|{id}|stats
- 回款: /finance/payments/list|create|{id}|stats
"""
from ninja import Router, Query
from typing import Optional
from datetime import date

from . import services
from .models import Quote, Contract, Invoice, Payment, Client, InvoiceRequest
from .schema import (
    QuoteQueryParams, QuoteCreateIn, QuoteUpdateIn,
    QuoteItemIn,
    ContractQueryParams, ContractCreateIn, ContractUpdateIn,
    ContractPaymentTermIn, ContractChangeIn,
    InvoiceQueryParams, InvoiceCreateIn, InvoiceUpdateIn,
    InvoiceItemIn,
    PaymentQueryParams, PaymentCreateIn, PaymentUpdateIn,
    BudgetCategoryCreateIn, BudgetCreateIn, BudgetItemCreateIn,
    CostRecordCreateIn,
    PaymentPlanCreateIn, PaymentRecordCreateIn, OverdueFollowupCreateIn,
    FinReportCreateIn,
    CustomerQueryParams, CustomerCreateIn, CustomerUpdateIn,
    InvoiceRequestQueryParams, InvoiceRequestCreateIn, InvoiceRequestUpdateIn,
    OverdueReminderBatchSendIn,
)
from apps.identity.decorators import _get_account_from_request, require_permission, require_any_permission
from apps.identity.filters import get_visible_object

# 发票管理（新）— 与前端 GET /finance/invoices 对接，返回全部发票（团队共享，无按人过滤）
from .api_legacy_invoices import (
    list_legacy_invoices,
    create_legacy_invoice,
    get_legacy_invoice,
    update_legacy_invoice,
    delete_legacy_invoice,
    list_overdue_reminders_payload,
    LegacyInvoiceQueryParams,
    LegacyInvoiceCreateIn,
    LegacyInvoiceUpdateIn,
)
from .models_legacy_invoice import LegacyInvoice

router = Router()

from .api_payable import router as payable_router
from .api_expense import router as expense_router
from .api_settlement import router as settlement_router
from .api_notifications import router as notifications_router
router.add_router('/payables/', payable_router, tags=['应付管理'])
router.add_router('/expenses/', expense_router, tags=['费用报销'])
router.add_router('/settlements/', settlement_router, tags=['项目决算'])
router.add_router('/notifications/', notifications_router, tags=['财务通知'])


# ============================================================================
# 辅助函数
# ============================================================================
def _quote_to_dict(q) -> dict:
    return {
        'id': q.id, 'code': q.code, 'project': q.project,
        'client': q.client, 'total_amount': str(q.total_amount),
        'status': q.status, 'created_at': q.created_at.isoformat(),
        'valid_until': q.valid_until.isoformat() if q.valid_until else '',
        'create_time': q.create_time.isoformat(),
    }


def _contract_to_dict(c) -> dict:
    return {
        'id': c.id, 'code': c.code, 'project': c.project,
        'client': c.client, 'amount': str(c.amount),
        'signed_date': c.signed_date.isoformat() if c.signed_date else '',
        'start_date': c.start_date.isoformat() if c.start_date else '',
        'end_date': c.end_date.isoformat() if c.end_date else '',
        'status': c.status,
        'create_time': c.create_time.isoformat(),
    }


def _invoice_to_dict(inv) -> dict:
    return {
        'id': inv.id, 'code': inv.code,
        'contract_id': inv.contract_id,
        'contract_code': inv.contract.code if inv.contract else '',
        'client': inv.client, 'amount': str(inv.amount),
        'tax_amount': str(inv.tax_amount), 'total': str(inv.total),
        'type': inv.type, 'status': inv.status,
        'invoice_date': inv.invoice_date.isoformat() if inv.invoice_date else '',
        'create_time': inv.create_time.isoformat(),
    }


def _payment_to_dict(p) -> dict:
    return {
        'id': p.id, 'code': p.code,
        'invoice_id': p.invoice_id,
        'invoice_code': p.invoice.code if p.invoice else '',
        'client': p.client,
        'expected_amount': str(p.expected_amount),
        'actual_amount': str(p.actual_amount) if p.actual_amount is not None else '',
        'payment_date': p.payment_date.isoformat() if p.payment_date else '',
        'method': p.method, 'status': p.status,
        'days_overdue': p.days_overdue,
        'create_time': p.create_time.isoformat(),
    }


def _item_amount_inclusive(amount, amount_type: str, tax_rate) -> float:
    from decimal import Decimal
    am = float(amount)
    rate = float(tax_rate) if tax_rate is not None else 0.06
    if amount_type == 'inclusive_of_tax':
        return am
    return am * (1 + rate)


def _linked_electronic_meta_for_request(req) -> dict:
    """根据 invoice_ids 关联 LegacyInvoice（优先取列表最后一项，与处理申请创建发票顺序一致）。"""
    from .models_legacy_invoice import LegacyInvoice
    empty = {
        'linked_invoice_id': None,
        'electronic_invoice_file': None,
        'electronic_invoice_file_name': None,
    }
    ids = req.invoice_ids or []
    if not ids:
        return empty
    id_list = []
    for x in ids:
        try:
            id_list.append(int(x))
        except (TypeError, ValueError):
            continue
    for iid in reversed(id_list):
        inv = LegacyInvoice.objects.filter(id=iid, is_deleted=False).first()
        if inv:
            ef = (inv.electronic_invoice_file or '').strip() or None
            en = (inv.electronic_invoice_file_name or '').strip() or None
            return {
                'linked_invoice_id': inv.id,
                'electronic_invoice_file': ef,
                'electronic_invoice_file_name': en,
            }
    return empty


def _batch_linked_electronic_meta(requests: list) -> dict:
    """req.id -> 电子发票摘要，批量查询避免列表 N+1。"""
    from .models_legacy_invoice import LegacyInvoice
    empty = {
        'linked_invoice_id': None,
        'electronic_invoice_file': None,
        'electronic_invoice_file_name': None,
    }
    if not requests:
        return {}
    all_ids = set()
    for req in requests:
        for x in (req.invoice_ids or []):
            try:
                all_ids.add(int(x))
            except (TypeError, ValueError):
                continue
    if not all_ids:
        return {req.id: dict(empty) for req in requests}
    inv_map = {
        inv.id: inv
        for inv in LegacyInvoice.objects.filter(id__in=all_ids, is_deleted=False)
    }
    out = {}
    for req in requests:
        meta = dict(empty)
        for x in reversed(req.invoice_ids or []):
            try:
                iid = int(x)
            except (TypeError, ValueError):
                continue
            inv = inv_map.get(iid)
            if inv:
                ef = (inv.electronic_invoice_file or '').strip() or None
                en = (inv.electronic_invoice_file_name or '').strip() or None
                meta = {
                    'linked_invoice_id': inv.id,
                    'electronic_invoice_file': ef,
                    'electronic_invoice_file_name': en,
                }
                break
        out[req.id] = meta
    return out


def _invoice_request_to_dict(req, electronic_meta: Optional[dict] = None) -> dict:
    amount_type = getattr(req, 'amount_type', None) or 'inclusive_of_tax'
    tax_rate = getattr(req, 'tax_rate', None)
    rate_val = float(tax_rate) if tax_rate is not None else 0.06
    items = []
    for i in req.items.all():
        am = float(i.amount)
        am_inclusive = _item_amount_inclusive(i.amount, amount_type, tax_rate)
        items.append({
            'id': i.id, 'project_code': i.project_code, 'project_id': i.project_id,
            'amount': am,
            'amount_inclusive_of_tax': round(am_inclusive, 2),
            'service_content': i.service_content or '',
        })
    base = {
        'id': req.id,
        'request_date': req.request_date.isoformat(),
        'customer_name': req.customer_name,
        'invoice_type': getattr(req, 'invoice_type', 'full_elec_special') or 'full_elec_special',
        'amount_type': amount_type,
        'tax_rate': rate_val,
        'items': items,
        'po': req.po or '',
        'total_amount': float(req.total_amount),
        'request_by': req.request_by or '',
        'request_by_id': req.request_by_id,
        'status': req.status,
        'invoice_ids': req.invoice_ids or [],
        'notes': req.notes or '',
        'processed_by': req.processed_by or '',
        'processed_at': req.processed_at.isoformat() if req.processed_at else '',
        'created_at': req.create_time.isoformat(),
        'updated_at': req.update_time.isoformat(),
    }
    if electronic_meta is None:
        electronic_meta = _linked_electronic_meta_for_request(req)
    base.update(electronic_meta)
    return base


def _client_to_dict(c) -> dict:
    return {
        'id': c.id,
        'customer_code': c.customer_code,
        'customer_name': c.customer_name,
        'short_name': c.short_name or '',
        'payment_term_days': c.payment_term_days,
        'payment_term_description': c.payment_term_description or '',
        'remark': c.remark or '',
        'is_active': c.is_active,
        'created_at': c.create_time.isoformat(),
        'updated_at': c.update_time.isoformat(),
    }


# ============================================================================
# 报价 API
# ============================================================================
@router.get('/quotes/list', summary='报价列表')
@require_permission('finance.quote.read')
def list_quotes(request, params: QuoteQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_quotes(status=params.status, client=params.client, page=params.page, page_size=params.page_size, account=account)
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_quote_to_dict(q) for q in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/quotes/stats', summary='报价统计')
@require_permission('finance.quote.read')
def quote_stats(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_quote_stats()}


@router.post('/quotes/create', summary='创建报价')
@require_permission('finance.quote.create')
def create_quote(request, data: QuoteCreateIn):
    q = services.create_quote(
        code=data.code, project=data.project, client=data.client,
        total_amount=data.total_amount, created_at=data.created_at,
        valid_until=data.valid_until, notes=data.notes or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _quote_to_dict(q)}


@router.get('/quotes/{quote_id}', summary='报价详情')
@require_permission('finance.quote.read')
def get_quote(request, quote_id: int):
    account = _get_account_from_request(request)
    q = get_visible_object(Quote.objects.filter(id=quote_id), account)
    if not q:
        return 404, {'code': 404, 'msg': '报价不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _quote_to_dict(q)}


@router.put('/quotes/{quote_id}', summary='更新报价')
@require_permission('finance.quote.create')
def update_quote(request, quote_id: int, data: QuoteUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Quote.objects.filter(id=quote_id), account):
        return 404, {'code': 404, 'msg': '报价不存在'}
    q = services.update_quote(quote_id, **data.dict(exclude_unset=True))
    if not q:
        return 404, {'code': 404, 'msg': '报价不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _quote_to_dict(q)}


@router.delete('/quotes/{quote_id}', summary='删除报价')
@require_permission('finance.quote.create')
def delete_quote(request, quote_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Quote.objects.filter(id=quote_id), account):
        return 404, {'code': 404, 'msg': '报价不存在'}
    ok = services.delete_quote(quote_id)
    if not ok:
        return 404, {'code': 404, 'msg': '报价不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/quotes/{quote_id}/items', summary='报价明细列表')
@require_permission('finance.quote.read')
def list_quote_items(request, quote_id: int):
    from apps.finance.services.quote_service import list_quote_items as svc
    items = svc(quote_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': i.id, 'item_name': i.item_name, 'specification': i.specification,
            'unit': i.unit, 'quantity': str(i.quantity), 'unit_price': str(i.unit_price),
            'amount': str(i.amount),
            'cost_estimate': str(i.cost_estimate) if i.cost_estimate else None,
        } for i in items],
    }}


@router.post('/quotes/{quote_id}/items/create', summary='添加报价明细')
@require_permission('finance.quote.create')
def add_quote_item(request, quote_id: int, data: QuoteItemIn):
    from apps.finance.services.quote_service import add_quote_item as svc
    item = svc(
        quote_id=quote_id, item_name=data.item_name,
        quantity=data.quantity, unit_price=data.unit_price,
        specification=data.specification, unit=data.unit,
        cost_estimate=data.cost_estimate,
    )
    if not item:
        return 404, {'code': 404, 'msg': '报价不存在'}
    return {'code': 200, 'msg': '明细已添加', 'data': {
        'id': item.id, 'amount': str(item.amount),
    }}


@router.delete('/quote-items/{item_id}', summary='删除报价明细')
@require_permission('finance.quote.create')
def delete_quote_item(request, item_id: int):
    from apps.finance.services.quote_service import delete_quote_item as svc
    if not svc(item_id):
        return 404, {'code': 404, 'msg': '明细不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.post('/quotes/{quote_id}/revise', summary='创建报价修订版')
@require_permission('finance.quote.create')
def revise_quote(request, quote_id: int):
    from apps.finance.services.quote_service import revise_quote as svc
    revised = svc(quote_id)
    if not revised:
        return 404, {'code': 404, 'msg': '报价不存在'}
    return {'code': 200, 'msg': '修订版已创建', 'data': _quote_to_dict(revised)}


@router.post('/quotes/{quote_id}/convert-to-contract', summary='报价转合同')
@require_permission('finance.contract.create')
def convert_quote_to_contract(request, quote_id: int):
    from apps.finance.services.quote_service import convert_quote_to_contract as svc
    result = svc(quote_id)
    if not result:
        return {'code': 400, 'msg': '报价不是已接受状态', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# 合同 API
# ============================================================================
@router.get('/contracts/list', summary='合同列表')
@require_permission('finance.contract.read')
def list_contracts(request, params: ContractQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_contracts(status=params.status, client=params.client, page=params.page, page_size=params.page_size, account=account)
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_contract_to_dict(c) for c in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.post('/contracts/create', summary='创建合同')
@require_permission('finance.contract.create')
def create_contract(request, data: ContractCreateIn):
    account = _get_account_from_request(request)
    creator_open_id = getattr(account, 'feishu_open_id', '') if account else ''
    c = services.create_contract(
        code=data.code, project=data.project, client=data.client,
        amount=data.amount, signed_date=data.signed_date,
        start_date=data.start_date, end_date=data.end_date, notes=data.notes or '',
        creator_open_id=creator_open_id,
    )
    return {'code': 200, 'msg': 'OK', 'data': _contract_to_dict(c)}


@router.get('/contracts/{contract_id}', summary='合同详情')
@require_permission('finance.contract.read')
def get_contract(request, contract_id: int):
    account = _get_account_from_request(request)
    c = get_visible_object(Contract.objects.filter(id=contract_id), account)
    if not c:
        return 404, {'code': 404, 'msg': '合同不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _contract_to_dict(c)}


@router.put('/contracts/{contract_id}', summary='更新合同')
@require_permission('finance.contract.create')
def update_contract(request, contract_id: int, data: ContractUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Contract.objects.filter(id=contract_id), account):
        return 404, {'code': 404, 'msg': '合同不存在'}
    c = services.update_contract(contract_id, **data.dict(exclude_unset=True))
    if not c:
        return 404, {'code': 404, 'msg': '合同不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _contract_to_dict(c)}


@router.delete('/contracts/{contract_id}', summary='删除合同')
@require_permission('finance.contract.create')
def delete_contract(request, contract_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Contract.objects.filter(id=contract_id), account):
        return 404, {'code': 404, 'msg': '合同不存在'}
    ok = services.delete_contract(contract_id)
    if not ok:
        return 404, {'code': 404, 'msg': '合同不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/contracts/{contract_id}/payment-terms', summary='合同付款条款列表')
@require_permission('finance.contract.read')
def list_contract_payment_terms(request, contract_id: int):
    from apps.finance.services.contract_service import list_payment_terms
    terms = list_payment_terms(contract_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': t.id, 'milestone': t.milestone,
            'percentage': str(t.percentage), 'amount': str(t.amount),
            'payment_days': t.payment_days, 'trigger_condition': t.trigger_condition,
        } for t in terms],
    }}


@router.post('/contracts/{contract_id}/payment-terms/create', summary='添加付款条款')
@require_permission('finance.contract.create')
def add_contract_payment_term(request, contract_id: int, data: ContractPaymentTermIn):
    from apps.finance.services.contract_service import add_payment_term
    term = add_payment_term(
        contract_id=contract_id, milestone=data.milestone,
        percentage=data.percentage, amount=data.amount,
        payment_days=data.payment_days, trigger_condition=data.trigger_condition,
    )
    if not term:
        return 404, {'code': 404, 'msg': '合同不存在'}
    return {'code': 200, 'msg': '条款已添加', 'data': {
        'id': term.id, 'milestone': term.milestone,
    }}


@router.delete('/contract-payment-terms/{term_id}', summary='删除付款条款')
@require_permission('finance.contract.create')
def delete_contract_payment_term(request, term_id: int):
    from apps.finance.services.contract_service import delete_payment_term
    if not delete_payment_term(term_id):
        return 404, {'code': 404, 'msg': '条款不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/contracts/{contract_id}/changes', summary='合同变更列表')
@require_permission('finance.contract.read')
def list_contract_changes(request, contract_id: int):
    from apps.finance.services.contract_service import list_contract_changes as svc
    changes = svc(contract_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': ch.id, 'change_no': ch.change_no, 'change_type': ch.change_type,
            'original_amount': str(ch.original_amount) if ch.original_amount else None,
            'new_amount': str(ch.new_amount) if ch.new_amount else None,
            'reason': ch.reason, 'approval_status': ch.approval_status,
            'create_time': ch.create_time.isoformat(),
        } for ch in changes],
    }}


@router.post('/contracts/{contract_id}/changes/create', summary='创建合同变更')
@require_permission('finance.contract.create')
def create_contract_change(request, contract_id: int, data: ContractChangeIn):
    from apps.finance.services.contract_service import create_contract_change as svc
    account = _get_account_from_request(request)
    change = svc(
        contract_id=contract_id, change_type=data.change_type,
        reason=data.reason, original_amount=data.original_amount,
        new_amount=data.new_amount, description=data.description,
        created_by_id=account.id if account else None,
    )
    if not change:
        return 404, {'code': 404, 'msg': '合同不存在'}
    return {'code': 200, 'msg': '变更已创建', 'data': {
        'id': change.id, 'change_no': change.change_no,
    }}


@router.post('/contract-changes/{change_id}/approve', summary='批准合同变更')
@require_permission('finance.contract.create')
def approve_contract_change(request, change_id: int):
    from apps.finance.services.contract_service import approve_contract_change as svc
    change = svc(change_id)
    if not change:
        return {'code': 400, 'msg': '审批失败', 'data': None}
    return {'code': 200, 'msg': '已批准', 'data': {
        'id': change.id, 'approval_status': change.approval_status,
    }}


@router.post('/contract-changes/{change_id}/reject', summary='驳回合同变更')
@require_permission('finance.contract.create')
def reject_contract_change(request, change_id: int):
    from apps.finance.services.contract_service import reject_contract_change as svc
    change = svc(change_id)
    if not change:
        return {'code': 400, 'msg': '驳回失败', 'data': None}
    return {'code': 200, 'msg': '已驳回', 'data': {
        'id': change.id, 'approval_status': change.approval_status,
    }}


@router.post('/contracts/{contract_id}/generate-payment-plans', summary='根据条款生成回款计划')
@require_permission('finance.payment.create')
def generate_payment_plans(request, contract_id: int):
    from apps.finance.services.contract_service import generate_payment_plans_from_contract
    plans = generate_payment_plans_from_contract(contract_id)
    return {'code': 200, 'msg': f'已生成 {len(plans)} 个回款计划', 'data': {
        'count': len(plans),
        'plans': [{'id': p.id, 'plan_no': p.plan_no, 'milestone': p.milestone,
                    'planned_date': str(p.planned_date),
                    'planned_amount': str(p.planned_amount)} for p in plans],
    }}


# ============================================================================
# 发票 API（发票管理（新）与前端 GET /finance/invoices 对接，团队共享）
# ============================================================================

@router.get('/invoices', summary='发票列表（新，团队共享）')
@require_permission('finance.invoice.read')
def list_legacy_invoices_route(request, params: LegacyInvoiceQueryParams = Query(...)):
    """与前端「发票管理（新）」对接，返回全部发票，不做按人过滤。"""
    return list_legacy_invoices(request, params)


@router.post('/invoices', summary='创建发票（新）')
@require_permission('finance.invoice.create')
def create_legacy_invoice_route(request, data: LegacyInvoiceCreateIn):
    """与前端「发票管理（新）」对接。"""
    return create_legacy_invoice(request, data)


@router.get('/overdue-reminders', summary='逾期催款提醒（基于新发票台账）')
@require_permission('finance.invoice.read')
def list_overdue_reminders_route(
    request,
    page: int = 1,
    page_size: int = 20,
    customer_name: Optional[str] = None,
    sales_manager: Optional[str] = None,
    min_overdue_days: Optional[int] = None,
):
    return list_overdue_reminders_payload(
        page=page,
        page_size=page_size,
        customer_name=customer_name,
        sales_manager=sales_manager,
        min_overdue_days=min_overdue_days,
    )


@router.post('/overdue-reminders/batch-send', summary='批量催款（占位，可后续接飞书）')
@require_permission('finance.invoice.read')
def overdue_reminders_batch_send(request, data: OverdueReminderBatchSendIn):
    ids = list(data.reminder_ids or [])
    return {
        'code': 200,
        'msg': 'OK',
        'success': True,
        'data': {
            'success_count': len(ids),
            'failed_count': 0,
            'failed_ids': [],
        },
    }


@router.post('/overdue-reminders/{reminder_id}/send', summary='单笔催款（占位）')
@require_permission('finance.invoice.read')
def overdue_reminder_send(request, reminder_id: int):
    return {'code': 200, 'msg': 'OK', 'success': True, 'data': {'sent': True}}


@router.get('/invoices/list', summary='发票列表')
@require_permission('finance.invoice.read')
def list_invoices(request, params: InvoiceQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_invoices(status=params.status, contract_id=params.contract_id, page=params.page, page_size=params.page_size, account=account)
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_invoice_to_dict(inv) for inv in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/invoices/stats', summary='发票统计')
@require_permission('finance.invoice.read')
def invoice_stats(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_invoice_stats()}


@router.post('/invoices/create', summary='创建发票')
@require_permission('finance.invoice.create')
def create_invoice(request, data: InvoiceCreateIn):
    inv = services.create_invoice(
        code=data.code, contract_id=data.contract_id, client=data.client,
        amount=data.amount, tax_amount=data.tax_amount, total=data.total,
        type=data.type, invoice_date=data.invoice_date, notes=data.notes or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _invoice_to_dict(inv)}


@router.get('/invoices/{invoice_id}', summary='发票详情')
@require_permission('finance.invoice.read')
def get_invoice(request, invoice_id: int):
    # 优先按「发票（新）」查，与列表一致，团队共享
    legacy_inv = LegacyInvoice.objects.filter(id=invoice_id, is_deleted=False).first()
    if legacy_inv:
        return get_legacy_invoice(request, invoice_id)
    account = _get_account_from_request(request)
    inv = get_visible_object(Invoice.objects.filter(id=invoice_id), account)
    if not inv:
        return 404, {'code': 404, 'msg': '发票不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _invoice_to_dict(inv)}


@router.put('/invoices/{invoice_id}', summary='更新发票')
@require_permission('finance.invoice.create')
def update_invoice(request, invoice_id: int, data: LegacyInvoiceUpdateIn):
    legacy_inv = LegacyInvoice.objects.filter(id=invoice_id, is_deleted=False).first()
    if legacy_inv:
        return update_legacy_invoice(request, invoice_id, data)
    account = _get_account_from_request(request)
    if not get_visible_object(Invoice.objects.filter(id=invoice_id), account):
        return 404, {'code': 404, 'msg': '发票不存在'}
    # 合同发票仅更新部分字段
    payload = {k: v for k, v in data.dict(exclude_unset=True).items() if k in ('status', 'invoice_date')}
    inv = services.update_invoice(invoice_id, **payload)
    if not inv:
        return 404, {'code': 404, 'msg': '发票不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _invoice_to_dict(inv)}


@router.delete('/invoices/{invoice_id}', summary='删除发票')
@require_permission('finance.invoice.create')
def delete_invoice(request, invoice_id: int):
    legacy_inv = LegacyInvoice.objects.filter(id=invoice_id, is_deleted=False).first()
    if legacy_inv:
        return delete_legacy_invoice(request, invoice_id)
    account = _get_account_from_request(request)
    if not get_visible_object(Invoice.objects.filter(id=invoice_id), account):
        return 404, {'code': 404, 'msg': '发票不存在'}
    ok = services.delete_invoice(invoice_id)
    if not ok:
        return 404, {'code': 404, 'msg': '发票不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 开票申请 API（发票管理新）
# ============================================================================
@router.get('/invoice-requests', summary='开票申请列表')
@require_permission('finance.invoice.read')
def list_invoice_requests(request, params: InvoiceRequestQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_invoice_requests(
        page=params.page, page_size=params.page_size,
        request_by=params.request_by, customer_name=params.customer_name,
        start_date=params.start_date, end_date=params.end_date, status=params.status,
        account=account,
    )
    total = result['total']
    page_size = result['page_size']
    total_pages = (total + page_size - 1) // page_size if page_size else 0
    items = result['items']
    batch_electronic = _batch_linked_electronic_meta(items)
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'requests': [
                _invoice_request_to_dict(r, electronic_meta=batch_electronic.get(r.id))
                for r in items
            ],
            'total_records': total,
            'total_pages': total_pages,
            'current_page': result['page'],
        },
    }


@router.get('/invoice-requests/{req_id}', summary='开票申请详情')
@require_permission('finance.invoice.read')
def get_invoice_request(request, req_id: int):
    account = _get_account_from_request(request)
    req = get_visible_object(InvoiceRequest.objects.filter(id=req_id), account, scope_override='global')
    if not req:
        return 404, {'code': 404, 'msg': '开票申请不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _invoice_request_to_dict(req)}


@router.post('/invoice-requests', summary='创建开票申请')
@require_any_permission(['finance.invoice.create', 'finance.invoice_request.submit'])
def create_invoice_request(request, data: InvoiceRequestCreateIn):
    account = _get_account_from_request(request)
    items = [it.dict() for it in data.items]
    req = services.create_invoice_request(
        request_date=data.request_date,
        customer_name=data.customer_name,
        invoice_type=getattr(data, 'invoice_type', 'full_elec_special') or 'full_elec_special',
        amount_type=getattr(data, 'amount_type', 'inclusive_of_tax') or 'inclusive_of_tax',
        tax_rate=getattr(data, 'tax_rate', None),
        items=items,
        po=data.po or '',
        request_by=data.request_by,
        request_by_id=account.id if account else None,
        notes=data.notes or '',
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': _invoice_request_to_dict(req)}


@router.put('/invoice-requests/{req_id}', summary='更新开票申请')
@require_any_permission(['finance.invoice.create', 'finance.invoice_request.submit'])
def update_invoice_request(request, req_id: int, data: InvoiceRequestUpdateIn):
    account = _get_account_from_request(request)
    req = get_visible_object(InvoiceRequest.objects.filter(id=req_id), account, scope_override='global')
    if not req:
        return 404, {'code': 404, 'msg': '开票申请不存在'}
    payload = data.dict(exclude_unset=True)
    if 'items' in payload and payload['items'] is not None:
        payload['items'] = [it.dict() if hasattr(it, 'dict') else it for it in payload['items']]
    from .invoice_request_access import account_may_update_invoice_request
    if not account_may_update_invoice_request(account, req, payload):
        return 403, {'code': 403, 'msg': '无权限更新该开票申请（商务仅能修改本人待处理申请，且不可修改处理状态/关联发票）'}
    updated = services.update_invoice_request(req_id, **payload)
    if not updated:
        return 404, {'code': 404, 'msg': '开票申请不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _invoice_request_to_dict(updated)}


@router.delete('/invoice-requests/{req_id}', summary='删除开票申请')
@require_any_permission(['finance.invoice.create', 'finance.invoice_request.submit'])
def delete_invoice_request(request, req_id: int):
    account = _get_account_from_request(request)
    req = get_visible_object(InvoiceRequest.objects.filter(id=req_id), account, scope_override='global')
    if not req:
        return 404, {'code': 404, 'msg': '开票申请不存在'}
    from .invoice_request_access import account_may_delete_invoice_request
    if not account_may_delete_invoice_request(account, req):
        return 403, {'code': 403, 'msg': '无权限删除该开票申请'}
    ok = services.delete_invoice_request(req_id)
    if not ok:
        return 404, {'code': 404, 'msg': '开票申请不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 客户 API（发票管理新）
# ============================================================================
@router.get('/customers', summary='客户列表')
@require_permission('finance.invoice.read')
def list_customers(request, params: CustomerQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_customers(
        page=params.page, page_size=params.page_size,
        keyword=params.keyword, is_active=params.is_active,
        account=account,
    )
    total = result['total']
    page_size = result['page_size']
    total_pages = (total + page_size - 1) // page_size if page_size else 0
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'customers': [_client_to_dict(c) for c in result['items']],
            'total_records': total,
            'total_pages': total_pages,
            'current_page': result['page'],
        },
    }


@router.get('/customers/find-by-name', summary='按名称查客户')
@require_permission('finance.invoice.read')
def find_customer_by_name(request, name: str = Query(..., alias='name')):
    account = _get_account_from_request(request)
    c = services.find_client_by_name(name, account=account)
    if not c:
        return {'code': 200, 'msg': 'OK', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _client_to_dict(c)}


@router.get('/customers/{client_id}', summary='客户详情')
@require_permission('finance.invoice.read')
def get_customer(request, client_id: int):
    account = _get_account_from_request(request)
    c = get_visible_object(Client.objects.filter(id=client_id), account, scope_override='global')
    if not c:
        return 404, {'code': 404, 'msg': '客户不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _client_to_dict(c)}


@router.post('/customers', summary='创建客户')
@require_permission('finance.invoice.create')
def create_customer(request, data: CustomerCreateIn):
    account = _get_account_from_request(request)
    c = services.create_client(
        customer_code=data.customer_code or '',
        customer_name=data.customer_name,
        short_name=data.short_name or '',
        payment_term_days=data.payment_term_days,
        payment_term_description=data.payment_term_description or '',
        remark=data.remark or '',
        is_active=data.is_active,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': _client_to_dict(c)}


@router.put('/customers/{client_id}', summary='更新客户')
@require_permission('finance.invoice.create')
def update_customer(request, client_id: int, data: CustomerUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Client.objects.filter(id=client_id), account, scope_override='global'):
        return 404, {'code': 404, 'msg': '客户不存在'}
    c = services.update_client(client_id, **data.dict(exclude_unset=True))
    if not c:
        return 404, {'code': 404, 'msg': '客户不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _client_to_dict(c)}


@router.delete('/customers/{client_id}', summary='删除客户')
@require_permission('finance.invoice.create')
def delete_customer(request, client_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Client.objects.filter(id=client_id), account, scope_override='global'):
        return 404, {'code': 404, 'msg': '客户不存在'}
    ok = services.delete_client(client_id)
    if not ok:
        return 404, {'code': 404, 'msg': '客户不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/invoices/{invoice_id}/items', summary='发票明细列表')
@require_permission('finance.invoice.read')
def list_invoice_items(request, invoice_id: int):
    from apps.finance.services.invoice_service import list_invoice_items as svc
    items = svc(invoice_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': i.id, 'item_name': i.item_name, 'specification': i.specification,
            'unit': i.unit, 'quantity': str(i.quantity), 'unit_price': str(i.unit_price),
            'amount': str(i.amount), 'tax_rate': str(i.tax_rate),
            'tax_amount': str(i.tax_amount),
        } for i in items],
    }}


@router.post('/invoices/{invoice_id}/items/create', summary='添加发票明细')
@require_permission('finance.invoice.create')
def add_invoice_item(request, invoice_id: int, data: InvoiceItemIn):
    from apps.finance.services.invoice_service import add_invoice_item as svc
    item = svc(
        invoice_id=invoice_id, item_name=data.item_name,
        unit_price=data.unit_price, specification=data.specification,
        unit=data.unit, quantity=data.quantity, tax_rate=data.tax_rate,
    )
    if not item:
        return 404, {'code': 404, 'msg': '发票不存在'}
    return {'code': 200, 'msg': '明细已添加', 'data': {
        'id': item.id, 'amount': str(item.amount), 'tax_amount': str(item.tax_amount),
    }}


@router.delete('/invoice-items/{item_id}', summary='删除发票明细')
@require_permission('finance.invoice.create')
def delete_invoice_item(request, item_id: int):
    from apps.finance.services.invoice_service import delete_invoice_item as svc
    if not svc(item_id):
        return 404, {'code': 404, 'msg': '明细不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.post('/invoices/{invoice_id}/void', summary='作废发票')
@require_permission('finance.invoice.create')
def void_invoice(request, invoice_id: int):
    from apps.finance.services.invoice_service import void_invoice as svc
    inv = svc(invoice_id)
    if not inv:
        return {'code': 400, 'msg': '作废失败（仅草稿/已提交可作废）', 'data': None}
    return {'code': 200, 'msg': '已作废', 'data': _invoice_to_dict(inv)}


@router.post('/invoices/{invoice_id}/credit', summary='红冲发票')
@require_permission('finance.invoice.create')
def credit_invoice(request, invoice_id: int):
    from apps.finance.services.invoice_service import credit_invoice as svc
    result = svc(invoice_id)
    if not result:
        return {'code': 400, 'msg': '红冲失败（仅已审批/已寄出/已回款可红冲）', 'data': None}
    return {'code': 200, 'msg': '已红冲', 'data': result}


# ============================================================================
# 回款 API
# ============================================================================
def _list_payments_response(request, data: PaymentQueryParams):
    account = _get_account_from_request(request)
    result = services.list_payments(
        status=data.status,
        invoice_id=data.invoice_id,
        page=data.page,
        page_size=data.page_size,
        account=account,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    return {
        'code': 200, 'msg': 'OK',
        'success': True,
        'data': {
            'items': [_payment_to_dict(p) for p in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/payments', summary='回款列表（与 /payments/list 一致）')
@require_permission('finance.payment.read')
def list_payments_root(request, data: PaymentQueryParams = Query(...)):
    """兼容前端 GET /finance/payments。"""
    return _list_payments_response(request, data)


@router.get('/payments/list', summary='回款列表')
@require_permission('finance.payment.read')
def list_payments(request, data: PaymentQueryParams = Query(...)):
    return _list_payments_response(request, data)


@router.get('/payments/stats', summary='回款统计')
@require_permission('finance.payment.read')
def payment_stats(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_payment_stats()}


@router.post('/payments/create', summary='创建回款')
@require_permission('finance.payment.create')
def create_payment(request, data: PaymentCreateIn):
    p = services.create_payment(
        code=data.code, invoice_id=data.invoice_id, client=data.client,
        expected_amount=data.expected_amount, actual_amount=data.actual_amount,
        payment_date=data.payment_date, method=data.method or '', notes=data.notes or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _payment_to_dict(p)}


@router.get('/payments/{payment_id}', summary='回款详情')
@require_permission('finance.payment.read')
def get_payment(request, payment_id: int):
    account = _get_account_from_request(request)
    p = get_visible_object(Payment.objects.filter(id=payment_id), account)
    if not p:
        return 404, {'code': 404, 'msg': '回款不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _payment_to_dict(p)}


@router.put('/payments/{payment_id}', summary='更新回款')
@require_permission('finance.payment.create')
def update_payment(request, payment_id: int, data: PaymentUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Payment.objects.filter(id=payment_id), account):
        return 404, {'code': 404, 'msg': '回款不存在'}
    p = services.update_payment(payment_id, **data.dict(exclude_unset=True))
    if not p:
        return 404, {'code': 404, 'msg': '回款不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _payment_to_dict(p)}


@router.delete('/payments/{payment_id}', summary='删除回款')
@require_permission('finance.payment.create')
def delete_payment(request, payment_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Payment.objects.filter(id=payment_id), account):
        return 404, {'code': 404, 'msg': '回款不存在'}
    ok = services.delete_payment(payment_id)
    if not ok:
        return 404, {'code': 404, 'msg': '回款不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 预算管理 API（FIN001）
# ============================================================================
@router.post('/budget-categories/create', summary='创建预算科目')
@require_permission('finance.budget.create')
def create_budget_category(request, data: BudgetCategoryCreateIn):
    from apps.finance.services.budget_service import create_budget_category as svc
    cat = svc(code=data.code, name=data.name, category_type=data.category_type,
              parent_id=data.parent_id, description=data.description or '')
    return {'code': 200, 'msg': '科目已创建', 'data': {
        'id': cat.id, 'code': cat.code, 'name': cat.name,
    }}


@router.get('/budget-categories/list', summary='预算科目列表')
@require_permission('finance.budget.read')
def list_budget_categories(request, category_type: Optional[str] = None):
    from apps.finance.services.budget_service import list_budget_categories as svc
    items = svc(category_type)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{'id': c.id, 'code': c.code, 'name': c.name,
                    'category_type': c.category_type, 'level': c.level,
                    'parent_id': c.parent_id} for c in items],
    }}


@router.post('/budgets/create', summary='创建项目预算')
@require_permission('finance.budget.create')
def create_budget(request, data: BudgetCreateIn):
    from apps.finance.services.budget_service import create_project_budget
    account = _get_account_from_request(request)
    b = create_project_budget(
        budget_no=data.budget_no, budget_name=data.budget_name,
        protocol_id=data.protocol_id, project_name=data.project_name or '',
        budget_year=data.budget_year, start_date=data.start_date, end_date=data.end_date,
        total_income=data.total_income, total_cost=data.total_cost, total_expense=data.total_expense,
        client_id=data.client_id, client_name=data.client_name or '',
        created_by_id=account.id if account else None, notes=data.notes or '',
    )
    return {'code': 200, 'msg': '预算已创建', 'data': {'id': b.id, 'budget_no': b.budget_no}}


@router.post('/budgets/{budget_id}/items/create', summary='添加预算明细')
@require_permission('finance.budget.create')
def add_budget_item(request, budget_id: int, data: BudgetItemCreateIn):
    from apps.finance.services.budget_service import add_budget_item as svc
    item = svc(budget_id=budget_id, category_id=data.category_id,
               budget_amount=data.budget_amount, description=data.description or '')
    if not item:
        return 404, {'code': 404, 'msg': '预算不存在'}
    return {'code': 200, 'msg': '明细已添加', 'data': {'id': item.id}}


@router.post('/budgets/{budget_id}/submit', summary='提交预算审批')
@require_permission('finance.budget.create')
def submit_budget(request, budget_id: int):
    from apps.finance.services.budget_service import submit_budget as svc
    b = svc(budget_id)
    if not b:
        return {'code': 400, 'msg': '提交失败（非草稿状态）', 'data': None}
    return {'code': 200, 'msg': '已提交审批', 'data': {'id': b.id, 'status': b.status}}


@router.post('/budgets/{budget_id}/approve', summary='审批通过')
@require_permission('finance.budget.approve')
def approve_budget(request, budget_id: int):
    from apps.finance.services.budget_service import approve_budget as svc
    account = _get_account_from_request(request)
    b = svc(budget_id, approved_by_id=account.id if account else None)
    if not b:
        return {'code': 400, 'msg': '审批失败', 'data': None}
    return {'code': 200, 'msg': '已通过', 'data': {'id': b.id, 'status': b.status}}


@router.post('/budgets/{budget_id}/start', summary='开始执行')
@require_permission('finance.budget.create')
def start_budget(request, budget_id: int):
    from apps.finance.services.budget_service import start_execution
    b = start_execution(budget_id)
    if not b:
        return {'code': 400, 'msg': '执行失败', 'data': None}
    return {'code': 200, 'msg': '执行中', 'data': {'id': b.id, 'status': b.status}}


@router.get('/budgets/list', summary='预算列表')
@require_permission('finance.budget.read')
def list_budgets(request, protocol_id: Optional[int] = None, status: Optional[str] = None):
    from apps.finance.models import ProjectBudget
    qs = ProjectBudget.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': b.id, 'budget_no': b.budget_no, 'budget_name': b.budget_name,
            'status': b.status, 'protocol_id': b.protocol_id,
            'total_income': str(b.total_income), 'total_cost': str(b.total_cost),
            'actual_cost': str(b.actual_cost), 'budget_year': b.budget_year,
        } for b in qs[:50]],
    }}


@router.get('/budgets/alerts', summary='预算预警')
@require_permission('finance.budget.read')
def budget_alerts(request, budget_id: Optional[int] = None):
    from apps.finance.services.alert_service import check_budget_alerts
    alerts = check_budget_alerts(budget_id)
    return {'code': 200, 'msg': 'OK', 'data': {'alerts': alerts, 'count': len(alerts)}}


@router.get('/budgets/{budget_id}', summary='预算详情')
@require_permission('finance.budget.read')
def get_budget_detail(request, budget_id: int):
    from apps.finance.models import ProjectBudget
    from apps.identity.filters import get_visible_object
    account = _get_account(request)
    if not get_visible_object(ProjectBudget.objects.filter(id=budget_id), account):
        return 404, {'code': 404, 'msg': '预算不存在'}
    from apps.finance.services.budget_service import get_budget_detail as svc
    detail = svc(budget_id)
    if not detail:
        return 404, {'code': 404, 'msg': '预算不存在'}
    return {'code': 200, 'msg': 'OK', 'data': detail}


@router.post('/budget-adjustments/create', summary='创建预算调整')
@require_permission('finance.budget.create')
def create_budget_adjustment(request, budget_id: int, budget_item_id: int,
                              adjusted_amount: str, reason: str):
    from apps.finance.models import BudgetItem, BudgetAdjustment
    from decimal import Decimal
    item = BudgetItem.objects.filter(id=budget_item_id, budget_id=budget_id).first()
    if not item:
        return 404, {'code': 404, 'msg': '预算明细不存在'}
    account = _get_account_from_request(request)
    count = BudgetAdjustment.objects.filter(budget_id=budget_id).count()
    adj = BudgetAdjustment.objects.create(
        adjustment_no=f'ADJ-{item.budget.budget_no}-{count + 1:03d}',
        budget_id=budget_id, budget_item=item,
        original_amount=item.budget_amount,
        adjusted_amount=Decimal(adjusted_amount),
        reason=reason,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '调整申请已创建', 'data': {
        'id': adj.id, 'adjustment_no': adj.adjustment_no,
    }}


@router.post('/budget-adjustments/{adj_id}/approve', summary='审批预算调整')
@require_permission('finance.budget.approve')
def approve_budget_adjustment(request, adj_id: int):
    from apps.finance.models import BudgetAdjustment
    from django.utils import timezone
    adj = BudgetAdjustment.objects.filter(id=adj_id, status='submitted').first()
    if not adj:
        return {'code': 400, 'msg': '审批失败', 'data': None}
    account = _get_account_from_request(request)
    adj.status = 'approved'
    adj.approved_by_id = account.id if account else None
    adj.approved_at = timezone.now()
    adj.save(update_fields=['status', 'approved_by_id', 'approved_at', 'update_time'])
    adj.budget_item.budget_amount = adj.adjusted_amount
    adj.budget_item.save(update_fields=['budget_amount', 'update_time'])
    return {'code': 200, 'msg': '已批准', 'data': {'id': adj.id}}


# ============================================================================
# 成本记录 API（FIN002）
# ============================================================================
@router.post('/costs/create', summary='创建成本记录')
@require_permission('finance.cost.create')
def create_cost_record(request, data: CostRecordCreateIn):
    from apps.finance.services.cost_service import create_cost_record as svc
    account = _get_account_from_request(request)
    r = svc(
        record_no=data.record_no, protocol_id=data.protocol_id,
        cost_type=data.cost_type, cost_date=data.cost_date, amount=data.amount,
        description=data.description or '', project_name=data.project_name or '',
        budget_id=data.budget_id, budget_item_id=data.budget_item_id,
        reference_no=data.reference_no or '', reference_type=data.reference_type or '',
        staff_id=data.staff_id, staff_name=data.staff_name or '',
        work_hours=data.work_hours, hourly_rate=data.hourly_rate,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '成本记录已创建', 'data': {
        'id': r.id, 'record_no': r.record_no, 'status': r.status,
    }}


@router.post('/costs/{record_id}/confirm', summary='确认成本记录')
@require_permission('finance.cost.create')
def confirm_cost(request, record_id: int):
    from apps.finance.services.cost_service import confirm_cost as svc
    account = _get_account_from_request(request)
    r = svc(record_id, confirmed_by_id=account.id if account else None)
    if not r:
        return {'code': 400, 'msg': '确认失败', 'data': None}
    return {'code': 200, 'msg': '已确认', 'data': {'id': r.id, 'status': r.status}}


@router.get('/costs/list', summary='成本记录列表')
@require_permission('finance.cost.read')
def list_costs(request, protocol_id: Optional[int] = None, cost_type: Optional[str] = None,
               status: Optional[str] = None, page: int = 1, page_size: int = 20):
    from apps.finance.services.cost_service import list_costs as svc
    result = svc(protocol_id=protocol_id, cost_type=cost_type, status=status,
                 page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'record_no': r.record_no, 'cost_type': r.cost_type,
            'cost_date': str(r.cost_date), 'amount': str(r.amount),
            'status': r.status, 'protocol_id': r.protocol_id,
        } for r in result['items']],
        'total': result['total'],
    }}


@router.get('/costs/summary/{protocol_id}', summary='项目成本汇总')
@require_permission('finance.cost.read')
def cost_summary(request, protocol_id: int):
    from apps.finance.services.cost_service import get_cost_summary
    return {'code': 200, 'msg': 'OK', 'data': get_cost_summary(protocol_id)}


# ============================================================================
# 回款计划 API（FIN004）
# ============================================================================
@router.post('/payment-plans/create', summary='创建回款计划')
@require_permission('finance.payment.create')
def create_payment_plan(request, data: PaymentPlanCreateIn):
    from apps.finance.services.payment_plan_service import create_payment_plan as svc
    account = _get_account_from_request(request)
    plan = svc(
        plan_no=data.plan_no, protocol_id=data.protocol_id,
        planned_date=data.planned_date, planned_amount=data.planned_amount,
        project_name=data.project_name or '', contract_id=data.contract_id,
        client_id=data.client_id, client_name=data.client_name or '',
        milestone=data.milestone or '',
        responsible_id=data.responsible_id, responsible_name=data.responsible_name or '',
        invoice_id=data.invoice_id,
        created_by_id=account.id if account else None, notes=data.notes or '',
    )
    return {'code': 200, 'msg': '计划已创建', 'data': {
        'id': plan.id, 'plan_no': plan.plan_no, 'status': plan.status,
    }}


@router.get('/payment-plans/list', summary='回款计划列表')
@require_permission('finance.payment.read')
def list_payment_plans(request, protocol_id: Optional[int] = None, status: Optional[str] = None):
    from apps.finance.models import PaymentPlan
    qs = PaymentPlan.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': p.id, 'plan_no': p.plan_no, 'status': p.status,
            'milestone': p.milestone, 'planned_date': str(p.planned_date),
            'planned_amount': str(p.planned_amount),
            'received_amount': str(p.received_amount),
            'remaining_amount': str(p.remaining_amount),
            'overdue_days': p.overdue_days, 'client_name': p.client_name,
            'last_followup_date': str(p.last_followup_date) if p.last_followup_date else None,
        } for p in qs[:50]],
    }}


@router.post('/payment-records/create', summary='登记回款')
@require_permission('finance.payment.create')
def create_payment_record(request, data: PaymentRecordCreateIn):
    from apps.finance.services.payment_plan_service import record_payment
    account = _get_account_from_request(request)
    record = record_payment(
        record_no=data.record_no, plan_id=data.plan_id,
        payment_date=data.payment_date, amount=data.amount,
        payment_method=data.payment_method or 'bank_transfer',
        bank_name=data.bank_name or '', bank_serial=data.bank_serial or '',
        invoice_id=data.invoice_id,
        created_by_id=account.id if account else None, notes=data.notes or '',
    )
    if not record:
        return {'code': 400, 'msg': '回款计划不存在', 'data': None}
    return {'code': 200, 'msg': '回款已登记', 'data': {
        'id': record.id, 'record_no': record.record_no,
    }}


@router.post('/payment-records/{record_id}/confirm', summary='确认回款')
@require_permission('finance.payment.create')
def confirm_payment_record(request, record_id: int):
    from apps.finance.services.payment_plan_service import confirm_payment_record as svc
    account = _get_account_from_request(request)
    r = svc(record_id, confirmed_by_id=account.id if account else None)
    if not r:
        return {'code': 400, 'msg': '确认失败', 'data': None}
    return {'code': 200, 'msg': '已确认', 'data': {'id': r.id, 'status': r.status}}


@router.post('/overdue-followups/create', summary='添加逾期跟进')
@require_permission('finance.payment.create')
def create_overdue_followup(request, data: OverdueFollowupCreateIn):
    from apps.finance.services.payment_plan_service import add_followup
    account = _get_account_from_request(request)
    fu = add_followup(
        plan_id=data.plan_id, followup_date=data.followup_date,
        followup_type=data.followup_type, content=data.content, result=data.result,
        contact_person=data.contact_person or '',
        promise_date=data.promise_date, promise_amount=data.promise_amount,
        next_followup_date=data.next_followup_date,
        next_followup_plan=data.next_followup_plan or '',
        followed_by_id=account.id if account else None,
    )
    if not fu:
        return {'code': 400, 'msg': '回款计划不存在', 'data': None}
    return {'code': 200, 'msg': '跟进已记录', 'data': {'id': fu.id}}


@router.post('/overdue/detect', summary='逾期检测')
@require_permission('finance.payment.create')
def detect_overdue(request):
    from apps.finance.services.payment_plan_service import detect_overdue_plans
    updated = detect_overdue_plans()
    return {'code': 200, 'msg': f'{len(updated)} 条逾期', 'data': {'count': len(updated)}}


# ============================================================================
# 财务分析 API（FIN005）
# ============================================================================
@router.post('/reports/generate', summary='生成财务报表')
@require_permission('finance.report.create')
def generate_fin_report(request, data: FinReportCreateIn):
    from apps.finance.services.analysis_service import generate_financial_report
    account = _get_account_from_request(request)
    rpt = generate_financial_report(
        report_no=data.report_no, report_name=data.report_name,
        report_type=data.report_type,
        period_start=data.period_start, period_end=data.period_end,
        protocol_id=data.protocol_id,
        generated_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '报表已生成', 'data': {
        'id': rpt.id, 'report_no': rpt.report_no, 'status': rpt.status,
        'gross_profit': str(rpt.gross_profit),
    }}


@router.get('/reports/list', summary='财务报表列表')
@require_permission('finance.report.read')
def list_fin_reports(request, report_type: Optional[str] = None):
    from apps.finance.models import FinancialReport
    qs = FinancialReport.objects.all()
    if report_type:
        qs = qs.filter(report_type=report_type)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'report_no': r.report_no, 'report_name': r.report_name,
            'report_type': r.report_type, 'status': r.status,
            'period_start': str(r.period_start), 'period_end': str(r.period_end),
            'gross_profit': str(r.gross_profit), 'gross_margin': str(r.gross_margin),
        } for r in qs[:50]],
    }}


@router.post('/profit-analysis/generate/{protocol_id}', summary='生成盈利分析')
@require_permission('finance.report.create')
def generate_profit(request, protocol_id: int, period_type: Optional[str] = 'month'):
    from apps.finance.services.analysis_service import generate_profit_analysis
    pa = generate_profit_analysis(protocol_id, period_type=period_type or 'month')
    if not pa:
        return {'code': 400, 'msg': '生成失败', 'data': None}
    return {'code': 200, 'msg': '分析已生成', 'data': {
        'protocol_id': pa.protocol_id,
        'contract_amount': str(pa.contract_amount),
        'total_cost': str(pa.total_cost),
        'gross_profit': str(pa.gross_profit),
        'gross_margin': str(pa.gross_margin),
        'cost_variance': str(pa.cost_variance),
    }}


@router.get('/cash-flow/summary', summary='现金流汇总')
@require_permission('finance.report.read')
def cash_flow_summary(request, start_date: Optional[date] = None,
                       end_date: Optional[date] = None,
                       protocol_id: Optional[int] = None):
    from apps.finance.services.analysis_service import get_cash_flow_summary
    result = get_cash_flow_summary(start_date, end_date, protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/ar-aging', summary='应收账龄')
@require_permission('finance.report.read')
def ar_aging(request):
    from apps.finance.services.analysis_service import get_ar_aging
    return {'code': 200, 'msg': 'OK', 'data': get_ar_aging()}


@router.get('/dashboard', summary='财务看板')
@require_permission('finance.report.read')
def finance_dashboard(request):
    try:
        from apps.finance.services.analysis_service import get_finance_dashboard
        return {'code': 200, 'msg': 'OK', 'data': get_finance_dashboard()}
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception('finance_dashboard failed: %s', e)
        return {'code': 200, 'msg': 'OK', 'data': {}}


@router.get('/dashboard/trends', summary='看板趋势数据')
@require_permission('finance.report.read')
def dashboard_trends(request, months: int = 6):
    """月度收入/成本/利润趋势数据"""
    from apps.finance.services.analysis_service import get_finance_dashboard
    data = get_finance_dashboard()
    return {'code': 200, 'msg': 'OK', 'data': data.get('trends', [])}


@router.get('/dashboard/alerts', summary='看板预警列表')
@require_permission('finance.report.read')
def dashboard_alerts(request):
    """预算超支/逾期/客户风险预警"""
    from apps.finance.services.analysis_service import get_finance_dashboard
    data = get_finance_dashboard()
    return {'code': 200, 'msg': 'OK', 'data': data.get('alerts', [])}


@router.get('/dashboard/todos', summary='看板待办事项')
@require_permission('finance.report.read')
def dashboard_todos(request):
    """待审批/待开票/待确认/待催收"""
    from apps.finance.services.analysis_service import get_finance_dashboard
    data = get_finance_dashboard()
    return {'code': 200, 'msg': 'OK', 'data': data.get('todos', [])}


@router.get('/dashboard/expiring', summary='近期到期项')
@require_permission('finance.report.read')
def dashboard_expiring(request):
    """7天内到期的合同/发票"""
    from apps.finance.services.analysis_service import get_finance_dashboard
    data = get_finance_dashboard()
    return {'code': 200, 'msg': 'OK', 'data': data.get('expiring', [])}


# ============================================================================
# 分析引擎 API（Phase 4）
# ============================================================================

# --- 营收分析 ---
@router.get('/analytics/revenue/pipeline', summary='营收管道')
@require_permission('finance.report.read')
def analytics_revenue_pipeline(request):
    from apps.finance.services.revenue_analytics import get_revenue_pipeline
    return {'code': 200, 'msg': 'OK', 'data': get_revenue_pipeline()}


@router.get('/analytics/revenue/trend', summary='营收趋势')
@require_permission('finance.report.read')
def analytics_revenue_trend(request, period: str = 'month', months: int = 12):
    from apps.finance.services.revenue_analytics import get_revenue_trend
    return {'code': 200, 'msg': 'OK', 'data': get_revenue_trend(period=period, months=months)}


@router.get('/analytics/revenue/concentration', summary='营收集中度')
@require_permission('finance.report.read')
def analytics_revenue_concentration(request, top_n: int = 10):
    try:
        from apps.finance.services.revenue_analytics import get_revenue_concentration
        return {'code': 200, 'msg': 'OK', 'data': get_revenue_concentration(top_n=top_n)}
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception('analytics_revenue_concentration failed: %s', e)
        return {'code': 200, 'msg': 'OK', 'data': []}


@router.get('/analytics/revenue/recognition', summary='收入确认跟踪')
@require_permission('finance.report.read')
def analytics_revenue_recognition(request):
    from apps.finance.services.revenue_analytics import get_revenue_recognition
    return {'code': 200, 'msg': 'OK', 'data': get_revenue_recognition()}


@router.get('/analytics/revenue/forecast', summary='营收预测')
@require_permission('finance.report.read')
def analytics_revenue_forecast(request, months: int = 12):
    from apps.finance.services.revenue_analytics import get_revenue_forecast
    return {'code': 200, 'msg': 'OK', 'data': get_revenue_forecast(months=months)}


# --- 成本分析 ---
@router.get('/analytics/cost/structure', summary='成本结构')
@require_permission('finance.report.read')
def analytics_cost_structure(request, protocol_id: Optional[int] = None):
    try:
        from apps.finance.services.cost_analytics import get_cost_structure
        return {'code': 200, 'msg': 'OK', 'data': get_cost_structure(protocol_id=protocol_id)}
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception('analytics_cost_structure failed: %s', e)
        return {'code': 200, 'msg': 'OK', 'data': []}


@router.get('/analytics/cost/unit/{protocol_id}', summary='单位成本分析')
@require_permission('finance.report.read')
def analytics_cost_unit(request, protocol_id: int):
    from apps.finance.services.cost_analytics import get_unit_cost_analysis
    return {'code': 200, 'msg': 'OK', 'data': get_unit_cost_analysis(protocol_id)}


@router.get('/analytics/cost/variance/{protocol_id}', summary='成本偏差分析')
@require_permission('finance.report.read')
def analytics_cost_variance(request, protocol_id: int):
    from apps.finance.services.cost_analytics import get_cost_variance
    return {'code': 200, 'msg': 'OK', 'data': get_cost_variance(protocol_id)}


@router.get('/analytics/cost/benchmark', summary='成本基准对标')
@require_permission('finance.report.read')
def analytics_cost_benchmark(request):
    from apps.finance.services.cost_analytics import get_cost_benchmark
    return {'code': 200, 'msg': 'OK', 'data': get_cost_benchmark()}


@router.get('/analytics/cost/trend', summary='成本趋势')
@require_permission('finance.report.read')
def analytics_cost_trend(request, months: int = 12):
    from apps.finance.services.cost_analytics import get_cost_trend
    return {'code': 200, 'msg': 'OK', 'data': get_cost_trend(months=months)}


# --- 现金流分析 ---
@router.get('/analytics/cashflow/forecast', summary='现金流预测')
@require_permission('finance.report.read')
def analytics_cashflow_forecast(request, months: int = 12):
    from apps.finance.services.cashflow_analytics import get_cashflow_forecast
    return {'code': 200, 'msg': 'OK', 'data': get_cashflow_forecast(months=months)}


@router.get('/analytics/cashflow/cycle', summary='现金转换周期')
@require_permission('finance.report.read')
def analytics_cashflow_cycle(request):
    from apps.finance.services.cashflow_analytics import get_cash_conversion_cycle
    return {'code': 200, 'msg': 'OK', 'data': get_cash_conversion_cycle()}


@router.get('/analytics/cashflow/waterfall', summary='现金流瀑布')
@require_permission('finance.report.read')
def analytics_cashflow_waterfall(request, months: int = 6):
    from apps.finance.services.cashflow_analytics import get_cashflow_waterfall
    return {'code': 200, 'msg': 'OK', 'data': get_cashflow_waterfall(months=months)}


@router.get('/analytics/cashflow/ar-ap-matching', summary='应收应付配比')
@require_permission('finance.report.read')
def analytics_cashflow_ar_ap_matching(request, months: int = 6):
    from apps.finance.services.cashflow_analytics import get_ar_ap_matching
    return {'code': 200, 'msg': 'OK', 'data': get_ar_ap_matching(months=months)}


# --- 风险分析 ---
@router.get('/analytics/risk/dashboard', summary='风险看板')
@require_permission('finance.report.read')
def analytics_risk_dashboard(request):
    from apps.finance.services.risk_analytics import get_risk_dashboard
    return {'code': 200, 'msg': 'OK', 'data': get_risk_dashboard()}


@router.get('/analytics/risk/revenue', summary='营收风险')
@require_permission('finance.report.read')
def analytics_risk_revenue(request):
    from apps.finance.services.risk_analytics import get_revenue_at_risk
    return {'code': 200, 'msg': 'OK', 'data': get_revenue_at_risk()}


@router.get('/analytics/risk/budget', summary='预算超支风险')
@require_permission('finance.report.read')
def analytics_risk_budget(request):
    from apps.finance.services.risk_analytics import get_budget_overrun_risks
    return {'code': 200, 'msg': 'OK', 'data': get_budget_overrun_risks()}


@router.post('/analytics/risk/credit-scores', summary='计算信用评分')
@require_permission('finance.report.create')
def analytics_calculate_credit_scores(request):
    from apps.finance.services.risk_analytics import calculate_credit_scores
    scores = calculate_credit_scores()
    return {'code': 200, 'msg': f'已计算 {len(scores)} 个客户评分', 'data': {
        'count': len(scores),
        'scores': [{
            'client_id': s.client_id, 'client_name': s.client_name,
            'score': s.score, 'grade': s.grade,
            'on_time_rate': str(s.on_time_rate),
        } for s in scores],
    }}


# --- 效率分析 ---
@router.get('/analytics/efficiency/operational', summary='运营效率')
@require_permission('finance.report.read')
def analytics_efficiency_operational(request):
    from apps.finance.services.efficiency_analytics import get_operational_efficiency
    return {'code': 200, 'msg': 'OK', 'data': get_operational_efficiency()}


@router.get('/analytics/efficiency/collection', summary='回款效率')
@require_permission('finance.report.read')
def analytics_efficiency_collection(request):
    from apps.finance.services.efficiency_analytics import get_collection_efficiency
    return {'code': 200, 'msg': 'OK', 'data': get_collection_efficiency()}


@router.get('/analytics/efficiency/budget-accuracy', summary='预算准确率')
@require_permission('finance.report.read')
def analytics_efficiency_budget_accuracy(request):
    from apps.finance.services.efficiency_analytics import get_budget_accuracy
    return {'code': 200, 'msg': 'OK', 'data': get_budget_accuracy()}


@router.get('/analytics/efficiency/comparison', summary='同期对比')
@require_permission('finance.report.read')
def analytics_efficiency_comparison(request, start_date: Optional[date] = None,
                                     end_date: Optional[date] = None):
    from apps.finance.services.efficiency_analytics import get_period_comparison
    return {'code': 200, 'msg': 'OK', 'data': get_period_comparison(
        current_start=start_date, current_end=end_date,
    )}


# ============================================================================
# 盈利分析增强 API
# ============================================================================
@router.get('/analytics/profit/ranking', summary='项目盈利排行')
@require_permission('finance.report.read')
def analytics_profit_ranking(request, limit: int = 20):
    try:
        from apps.finance.services.analysis_service import get_profit_ranking
        return {'code': 200, 'msg': 'OK', 'data': get_profit_ranking(limit=limit)}
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception('analytics_profit_ranking failed: %s', e)
        return {'code': 200, 'msg': 'OK', 'data': []}


@router.get('/analytics/profit/by-client', summary='客户盈利分析')
@require_permission('finance.report.read')
def analytics_profit_by_client(request):
    from apps.finance.services.analysis_service import get_profit_by_client
    return {'code': 200, 'msg': 'OK', 'data': get_profit_by_client()}


@router.get('/analytics/profit/contribution', summary='贡献边际分析')
@require_permission('finance.report.read')
def analytics_profit_contribution(request):
    from apps.finance.services.analysis_service import get_contribution_margin
    return {'code': 200, 'msg': 'OK', 'data': get_contribution_margin()}


@router.get('/analytics/profit/estimate-accuracy', summary='估算准确度')
@require_permission('finance.report.read')
def analytics_profit_estimate_accuracy(request):
    from apps.finance.services.analysis_service import get_estimate_accuracy
    return {'code': 200, 'msg': 'OK', 'data': get_estimate_accuracy()}


@router.get('/analytics/profit/trend', summary='盈利趋势')
@require_permission('finance.report.read')
def analytics_profit_trend(request, months: int = 12):
    from apps.finance.services.analysis_service import get_profit_trend
    return {'code': 200, 'msg': 'OK', 'data': get_profit_trend(months=months)}


@router.get('/analytics/profit/matrix', summary='客户价值矩阵')
@require_permission('finance.report.read')
def analytics_profit_matrix(request):
    from apps.finance.services.analysis_service import get_profit_matrix
    return {'code': 200, 'msg': 'OK', 'data': get_profit_matrix()}


# ============================================================================
# 报表导出 API
# ============================================================================
@router.get('/reports/{report_id}/export/excel', summary='导出Excel报表')
@require_permission('finance.report.read')
def export_report_excel(request, report_id: int):
    from apps.finance.models import FinancialReport
    from apps.finance.services.report_engine import (
        collect_project_profit_report, collect_monthly_operation_report,
        export_report_excel as do_export,
    )
    from django.http import HttpResponse

    report = FinancialReport.objects.filter(id=report_id).first()
    if not report:
        return {'code': 404, 'msg': '报表不存在', 'data': None}

    report_data = report.report_data or {}
    if not report_data:
        if report.protocol_id:
            report_data = collect_project_profit_report(
                report.protocol_id, report.period_start, report.period_end,
            )
        else:
            year = report.period_start.year if report.period_start else date.today().year
            month = report.period_start.month if report.period_start else date.today().month
            report_data = collect_monthly_operation_report(year, month)

    excel_bytes = do_export(report_data)
    response = HttpResponse(
        excel_bytes,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{report.report_no}.xlsx"'
    return response


@router.get('/reports/{report_id}/export/pdf', summary='导出PDF报表')
@require_permission('finance.report.read')
def export_report_pdf(request, report_id: int):
    from apps.finance.models import FinancialReport
    from apps.finance.services.report_engine import (
        collect_project_profit_report, collect_monthly_operation_report,
        export_report_pdf as do_export,
    )
    from django.http import HttpResponse

    report = FinancialReport.objects.filter(id=report_id).first()
    if not report:
        return {'code': 404, 'msg': '报表不存在', 'data': None}

    report_data = report.report_data or {}
    if not report_data:
        if report.protocol_id:
            report_data = collect_project_profit_report(
                report.protocol_id, report.period_start, report.period_end,
            )
        else:
            year = report.period_start.year if report.period_start else date.today().year
            month = report.period_start.month if report.period_start else date.today().month
            report_data = collect_monthly_operation_report(year, month)

    pdf_bytes = do_export(report_data)
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{report.report_no}.pdf"'
    return response


# --- 快照 ---
@router.post('/analytics/snapshot/take', summary='生成每日快照')
@require_permission('finance.report.create')
def analytics_take_snapshot(request):
    from apps.finance.services.snapshot_service import take_daily_snapshot
    snapshots = take_daily_snapshot()
    return {'code': 200, 'msg': f'已生成 {len(snapshots)} 个指标快照', 'data': {
        'count': len(snapshots),
    }}


@router.get('/analytics/snapshot/trend', summary='指标趋势')
@require_permission('finance.report.read')
def analytics_metric_trend(request, metric_type: str, months: int = 12):
    from apps.finance.services.snapshot_service import get_metric_trend
    return {'code': 200, 'msg': 'OK', 'data': get_metric_trend(metric_type, months=months)}


@router.post('/analytics/ai-insight', summary='AI 分析洞察')
@require_permission('finance.report.read')
def analytics_ai_insight(request, scene: str = 'general'):
    """调用 AI 智能体生成财务洞察"""
    account = _get_account_from_request(request)
    from apps.finance.services.ai_insights import generate_monthly_insight, generate_settlement_insight, generate_risk_briefing
    from apps.finance.services.analysis_service import get_finance_dashboard
    from apps.finance.services.risk_analytics import get_risk_dashboard

    account_id = account.id if account else 0

    if scene == 'monthly':
        data = get_finance_dashboard()
        insight = generate_monthly_insight(data, account_id=account_id)
    elif scene == 'risk':
        data = get_risk_dashboard()
        insight = generate_risk_briefing(data, account_id=account_id)
    else:
        data = get_finance_dashboard()
        insight = generate_monthly_insight(data, account_id=account_id)

    return {'code': 200, 'msg': 'OK', 'data': {'scene': scene, 'insight': insight}}
