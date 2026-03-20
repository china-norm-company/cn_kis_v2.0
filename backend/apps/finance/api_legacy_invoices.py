"""
发票管理（新）— Legacy Invoice API

与前端「发票管理（新）」对接，路径 /finance/invoices（与合同关联的 Invoice 使用 /finance/invoices/list）。
数据存 t_legacy_invoice，多用户共享。
"""
from datetime import date
from decimal import Decimal
from ninja import Router, Query
from pydantic import BaseModel
from typing import Optional, List

from .models_legacy_invoice import LegacyInvoice
from apps.identity.decorators import _get_account_from_request, require_login, require_any_permission

router = Router()

# 发票管理（新）为共享数据，读操作仅需登录；写操作需 finance 权限
LEGACY_INVOICE_WRITE_PERMS = ['finance.invoice.create', 'finance.*']


# ============================================================================
# Schema
# ============================================================================
class LegacyInvoiceQueryParams(BaseModel):
    page: int = 1
    page_size: int = 20
    project_code: Optional[str] = None
    customer_name: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    revenue_amount: Optional[float] = None


class LegacyInvoiceItemIn(BaseModel):
    project_code: str
    project_id: Optional[int] = None
    amount: float
    service_content: Optional[str] = None


class LegacyInvoiceCreateIn(BaseModel):
    invoice_no: str
    invoice_date: str
    customer_name: str
    invoice_content: str = ''
    invoice_currency: Optional[str] = 'CNY'
    invoice_amount_tax_included: Optional[float] = None
    revenue_amount: float
    invoice_type: str = '专票'
    company_name: str = ''
    project_code: str = ''
    project_id: Optional[int] = None
    po: Optional[str] = None
    payment_term: Optional[int] = None
    sales_manager: str = ''
    invoice_items: Optional[List[LegacyInvoiceItemIn]] = None
    invoice_request_id: Optional[int] = None
    electronic_invoice_file: Optional[str] = None
    electronic_invoice_file_name: Optional[str] = None


class LegacyInvoiceUpdateIn(BaseModel):
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    customer_name: Optional[str] = None
    invoice_content: Optional[str] = None
    invoice_currency: Optional[str] = None
    invoice_amount_tax_included: Optional[float] = None
    revenue_amount: Optional[float] = None
    invoice_type: Optional[str] = None
    company_name: Optional[str] = None
    project_code: Optional[str] = None
    project_id: Optional[int] = None
    po: Optional[str] = None
    payment_term: Optional[int] = None
    sales_manager: Optional[str] = None
    payment_date: Optional[str] = None
    payment_amount: Optional[float] = None
    status: Optional[str] = None
    electronic_invoice_file: Optional[str] = None
    electronic_invoice_file_name: Optional[str] = None
    invoice_items: Optional[List[LegacyInvoiceItemIn]] = None


def _legacy_invoice_to_dict(inv: LegacyInvoice) -> dict:
    """将 LegacyInvoice 转为前端期望的格式"""
    items = []
    if inv.invoice_items_json:
        for it in inv.invoice_items_json:
            items.append({
                'project_code': it.get('project_code', ''),
                'project_id': it.get('project_id'),
                'amount': float(it.get('amount', 0)),
                'service_content': it.get('service_content'),
            })
    return {
        'id': inv.id,
        'invoice_no': inv.invoice_no,
        'invoice_date': inv.invoice_date.isoformat() if inv.invoice_date else '',
        'customer_name': inv.customer_name,
        'invoice_content': inv.invoice_content or '',
        'invoice_currency': inv.invoice_currency or 'CNY',
        'invoice_amount_tax_included': float(inv.invoice_amount_tax_included) if inv.invoice_amount_tax_included else None,
        'revenue_amount': float(inv.revenue_amount),
        'invoice_type': inv.invoice_type or '专票',
        'company_name': inv.company_name or '',
        'project_code': inv.project_code or '',
        'project_id': inv.project_id,
        'po': inv.po or None,
        'payment_date': inv.payment_date.isoformat() if inv.payment_date else None,
        'payment_amount': float(inv.payment_amount) if inv.payment_amount else None,
        'payment_term': inv.payment_term,
        'expected_payment_date': inv.expected_payment_date.isoformat() if inv.expected_payment_date else None,
        'receivable_date': inv.receivable_date.isoformat() if inv.receivable_date else None,
        'sales_manager': inv.sales_manager or '',
        'invoice_year': inv.invoice_year or None,
        'invoice_month': inv.invoice_month or None,
        'payment_year': inv.payment_year or None,
        'payment_month': inv.payment_month or None,
        'status': inv.status or 'issued',
        'lims_report_submitted_at': inv.lims_report_submitted_at.isoformat() if inv.lims_report_submitted_at else None,
        'electronic_invoice_file': inv.electronic_invoice_file or None,
        'electronic_invoice_file_name': inv.electronic_invoice_file_name or None,
        'invoice_items': items if items else None,
        'created_at': inv.create_time.isoformat() if inv.create_time else '',
        'updated_at': inv.update_time.isoformat() if inv.update_time else '',
    }


# ============================================================================
# API
# ============================================================================
@router.get('/list', summary='发票列表（新）')
@require_login()
def list_legacy_invoices(request, params: LegacyInvoiceQueryParams = Query(...)):
    """与前端「发票管理（新）」对接，返回 invoices/total_records/total_pages/current_page"""
    qs = LegacyInvoice.objects.filter(is_deleted=False)
    if params.project_code:
        clean_code = params.project_code.split('-')[0].strip()
        qs = qs.filter(project_code__icontains=clean_code)
    if params.customer_name:
        qs = qs.filter(customer_name__icontains=params.customer_name)
    if params.status:
        qs = qs.filter(status=params.status)
    if params.start_date:
        qs = qs.filter(invoice_date__gte=params.start_date)
    if params.end_date:
        qs = qs.filter(invoice_date__lte=params.end_date)
    if params.revenue_amount is not None:
        qs = qs.filter(revenue_amount=Decimal(str(params.revenue_amount)))
    qs = qs.order_by('-invoice_date', '-id')
    total = qs.count()
    page = max(1, params.page)
    page_size = max(1, min(100, params.page_size))
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    total_pages = (total + page_size - 1) // page_size if page_size else 1
    return {
        'code': 200,
        'msg': 'OK',
        'success': True,
        'data': {
            'invoices': [_legacy_invoice_to_dict(i) for i in items],
            'total_records': total,
            'total_pages': total_pages,
            'current_page': page,
        },
    }


@router.get('/{invoice_id}', summary='发票详情（新）')
@require_login()
def get_legacy_invoice(request, invoice_id: int):
    inv = LegacyInvoice.objects.filter(id=invoice_id, is_deleted=False).first()
    if not inv:
        return 404, {'code': 404, 'msg': '发票不存在', 'data': None}
    return {
        'code': 200,
        'msg': 'OK',
        'success': True,
        'data': _legacy_invoice_to_dict(inv),
    }


@router.post('', summary='创建发票（新）')
@require_any_permission(LEGACY_INVOICE_WRITE_PERMS)
def create_legacy_invoice(request, data: LegacyInvoiceCreateIn):
    account = _get_account_from_request(request)
    created_by_id = account.id if account else None
    invoice_date = date.fromisoformat(data.invoice_date) if data.invoice_date else date.today()
    main_project_code = data.project_code
    invoice_items = []
    if data.invoice_items and len(data.invoice_items) > 0:
        main_project_code = data.invoice_items[0].project_code
        for it in data.invoice_items:
            invoice_items.append({
                'project_code': it.project_code,
                'project_id': it.project_id,
                'amount': it.amount,
                'service_content': it.service_content,
            })
    inv = LegacyInvoice.objects.create(
        invoice_no=data.invoice_no,
        invoice_date=invoice_date,
        customer_name=data.customer_name,
        invoice_content=data.invoice_content or '',
        invoice_currency=data.invoice_currency or 'CNY',
        invoice_amount_tax_included=Decimal(str(data.invoice_amount_tax_included)) if data.invoice_amount_tax_included else None,
        revenue_amount=Decimal(str(data.revenue_amount)),
        invoice_type=data.invoice_type or '专票',
        company_name=data.company_name or '',
        project_code=main_project_code,
        project_id=data.project_id,
        po=data.po or '',
        payment_term=data.payment_term,
        sales_manager=data.sales_manager or '',
        invoice_year=f'{invoice_date.year}年' if invoice_date else '',
        invoice_month=f'{invoice_date.month}月' if invoice_date else '',
        status='issued',
        invoice_items_json=invoice_items,
        electronic_invoice_file=data.electronic_invoice_file or '',
        electronic_invoice_file_name=data.electronic_invoice_file_name or '',
        created_by_id=created_by_id,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'success': True,
        'data': _legacy_invoice_to_dict(inv),
    }


@router.put('/{invoice_id}', summary='更新发票（新）')
@require_any_permission(LEGACY_INVOICE_WRITE_PERMS)
def update_legacy_invoice(request, invoice_id: int, data: LegacyInvoiceUpdateIn):
    inv = LegacyInvoice.objects.filter(id=invoice_id, is_deleted=False).first()
    if not inv:
        return 404, {'code': 404, 'msg': '发票不存在', 'data': None}
    updates = data.dict(exclude_unset=True)
    for k, v in updates.items():
        if k == 'invoice_date' and v:
            inv.invoice_date = date.fromisoformat(v)
        elif k == 'payment_date' and v:
            inv.payment_date = date.fromisoformat(v)
        elif k == 'payment_amount' and v is not None:
            inv.payment_amount = Decimal(str(v))
        elif k == 'revenue_amount' and v is not None:
            inv.revenue_amount = Decimal(str(v))
        elif k == 'invoice_amount_tax_included' and v is not None:
            inv.invoice_amount_tax_included = Decimal(str(v))
        elif k == 'invoice_items' and v is not None:
            inv.invoice_items_json = [
                {'project_code': it['project_code'], 'project_id': it.get('project_id'), 'amount': it['amount'], 'service_content': it.get('service_content')}
                for it in v
            ]
        elif k in ('invoice_no', 'customer_name', 'invoice_content', 'invoice_currency', 'invoice_type',
                   'company_name', 'project_code', 'project_id', 'po', 'payment_term', 'sales_manager',
                   'status', 'electronic_invoice_file', 'electronic_invoice_file_name'):
            setattr(inv, k, v or getattr(inv, k, ''))
    if updates.get('payment_date'):
        inv.payment_year = f'{inv.payment_date.year}年' if inv.payment_date else ''
        inv.payment_month = f'{inv.payment_date.month}月' if inv.payment_date else ''
    if updates.get('payment_amount') is not None and updates.get('status') is None:
        rev = float(inv.revenue_amount)
        pay = float(inv.payment_amount or 0)
        if pay >= rev:
            inv.status = 'paid'
        elif pay > 0:
            inv.status = 'partial'
    inv.save()
    return {
        'code': 200,
        'msg': 'OK',
        'success': True,
        'data': _legacy_invoice_to_dict(inv),
    }


@router.delete('/{invoice_id}', summary='删除发票（新）')
@require_any_permission(LEGACY_INVOICE_WRITE_PERMS)
def delete_legacy_invoice(request, invoice_id: int):
    inv = LegacyInvoice.objects.filter(id=invoice_id, is_deleted=False).first()
    if not inv:
        return 404, {'code': 404, 'msg': '发票不存在', 'data': None}
    inv.is_deleted = True
    inv.save(update_fields=['is_deleted', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'success': True, 'data': None}
