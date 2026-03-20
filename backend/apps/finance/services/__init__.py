"""
财务管理服务

封装报价、合同、发票、回款的业务逻辑。
"""
import logging
from typing import Optional
from datetime import date
from decimal import Decimal
from django.db.models import Q
from ..models import Quote, Contract, Invoice, Payment, Client, InvoiceRequest, InvoiceRequestItem

logger = logging.getLogger(__name__)


def _apply_data_scope(qs, account=None, scope_override=None):
    """应用数据权限过滤（若提供 account）。scope_override 可强制 global/project/personal"""
    if account is None:
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account, scope_override=scope_override)


# ============================================================================
# 报价管理
# ============================================================================
def list_quotes(status: str = None, client: str = None, page: int = 1, page_size: int = 20, account=None) -> dict:
    qs = Quote.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if client:
        qs = qs.filter(client__icontains=client)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_quote(quote_id: int) -> Optional[Quote]:
    return Quote.objects.filter(id=quote_id, is_deleted=False).first()


def create_quote(code: str, project: str, client: str, total_amount: Decimal,
                 created_at: date, valid_until: date = None, notes: str = '') -> Quote:
    return Quote.objects.create(
        code=code, project=project, client=client, total_amount=total_amount,
        created_at=created_at, valid_until=valid_until, notes=notes,
    )


def update_quote(quote_id: int, **kwargs) -> Optional[Quote]:
    q = get_quote(quote_id)
    if not q:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(q, k):
            setattr(q, k, v)
    q.save()
    return q


def delete_quote(quote_id: int) -> bool:
    q = get_quote(quote_id)
    if not q:
        return False
    q.is_deleted = True
    q.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_quote_stats() -> dict:
    from django.db.models import Count, Sum
    qs = Quote.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    total_amount = qs.filter(status='accepted').aggregate(total=Sum('total_amount'))['total'] or 0
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'total': qs.count(),
        'accepted_amount': float(total_amount),
    }


# ============================================================================
# 合同管理
# ============================================================================
def list_contracts(status: str = None, client: str = None, page: int = 1, page_size: int = 20, account=None) -> dict:
    qs = Contract.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if client:
        qs = qs.filter(client__icontains=client)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_contract(contract_id: int) -> Optional[Contract]:
    return Contract.objects.filter(id=contract_id, is_deleted=False).first()


def create_contract(code: str, project: str, client: str, amount: Decimal,
                    signed_date: date = None, start_date: date = None,
                    end_date: date = None, notes: str = '',
                    creator_open_id: str = '') -> Contract:
    """
    创建合同并发起飞书审批

    飞书集成：创建合同后自动发起飞书合同审批，审批结果通过回调更新状态。
    """
    contract = Contract.objects.create(
        code=code, project=project, client=client, amount=amount,
        signed_date=signed_date, start_date=start_date, end_date=end_date, notes=notes,
    )

    if creator_open_id:
        try:
            from libs.feishu_approval import create_contract_approval
            instance_code = create_contract_approval(
                open_id=creator_open_id,
                contract_code=code,
                project_name=project,
                client=client,
                amount=str(amount),
            )
            if instance_code:
                contract.feishu_approval_id = instance_code
                contract.save(update_fields=['feishu_approval_id'])
                logger.info(f"合同#{contract.id} 飞书审批已发起: {instance_code}")
        except Exception as e:
            logger.error(f"合同#{contract.id} 飞书审批发起失败: {e}")

    return contract


def update_contract(contract_id: int, **kwargs) -> Optional[Contract]:
    c = get_contract(contract_id)
    if not c:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(c, k):
            setattr(c, k, v)
    c.save()
    return c


def delete_contract(contract_id: int) -> bool:
    c = get_contract(contract_id)
    if not c:
        return False
    c.is_deleted = True
    c.save(update_fields=['is_deleted', 'update_time'])
    return True


# ============================================================================
# 发票管理
# ============================================================================
def list_invoices(status: str = None, contract_id: int = None, page: int = 1, page_size: int = 20, account=None) -> dict:
    qs = Invoice.objects.filter(is_deleted=False).select_related('contract')
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if contract_id:
        qs = qs.filter(contract_id=contract_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_invoice(invoice_id: int) -> Optional[Invoice]:
    return Invoice.objects.filter(id=invoice_id, is_deleted=False).select_related('contract').first()


def create_invoice(code: str, contract_id: int, client: str, amount: Decimal,
                   tax_amount: Decimal, total: Decimal, type: str,
                   invoice_date: date = None, notes: str = '') -> Invoice:
    return Invoice.objects.create(
        code=code, contract_id=contract_id, client=client,
        amount=amount, tax_amount=tax_amount, total=total, type=type,
        invoice_date=invoice_date, notes=notes,
    )


def update_invoice(invoice_id: int, **kwargs) -> Optional[Invoice]:
    inv = get_invoice(invoice_id)
    if not inv:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(inv, k):
            setattr(inv, k, v)
    inv.save()
    return inv


def delete_invoice(invoice_id: int) -> bool:
    inv = get_invoice(invoice_id)
    if not inv:
        return False
    inv.is_deleted = True
    inv.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_invoice_stats() -> dict:
    from django.db.models import Count, Sum
    qs = Invoice.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    paid_total = qs.filter(status='paid').aggregate(total=Sum('total'))['total'] or 0
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'total': qs.count(),
        'paid_total': float(paid_total),
    }


# ============================================================================
# 回款管理
# ============================================================================
def list_payments(status: str = None, invoice_id: int = None, page: int = 1, page_size: int = 20, account=None) -> dict:
    qs = Payment.objects.filter(is_deleted=False).select_related('invoice')
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if invoice_id:
        qs = qs.filter(invoice_id=invoice_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_payment(payment_id: int) -> Optional[Payment]:
    return Payment.objects.filter(id=payment_id, is_deleted=False).select_related('invoice').first()


def create_payment(code: str, invoice_id: int, client: str, expected_amount: Decimal,
                   actual_amount: Decimal = None, payment_date: date = None,
                   method: str = '', notes: str = '') -> Payment:
    return Payment.objects.create(
        code=code, invoice_id=invoice_id, client=client,
        expected_amount=expected_amount, actual_amount=actual_amount,
        payment_date=payment_date, method=method, notes=notes,
    )


def update_payment(payment_id: int, **kwargs) -> Optional[Payment]:
    p = get_payment(payment_id)
    if not p:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(p, k):
            setattr(p, k, v)
    p.save()
    return p


def delete_payment(payment_id: int) -> bool:
    p = get_payment(payment_id)
    if not p:
        return False
    p.is_deleted = True
    p.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_payment_stats() -> dict:
    from django.db.models import Count, Sum
    qs = Payment.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    total_received = qs.filter(status='full').aggregate(total=Sum('actual_amount'))['total'] or 0
    overdue_count = qs.filter(status='overdue').count()
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'total': qs.count(),
        'total_received': float(total_received),
        'overdue_count': overdue_count,
    }


# ============================================================================
# 客户管理 (Client)
# ============================================================================
def list_customers(page: int = 1, page_size: int = 20, keyword: str = None, is_active: bool = None, account=None) -> dict:
    qs = Client.objects.all()
    qs = _apply_data_scope(qs, account, scope_override='global')  # 客户为团队共享，所有有权限者可见
    if keyword:
        qs = qs.filter(
            Q(customer_name__icontains=keyword) |
            Q(short_name__icontains=keyword) |
            Q(customer_code__icontains=keyword)
        )
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs.order_by('customer_code')[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_client(client_id: int) -> Optional[Client]:
    return Client.objects.filter(id=client_id).first()


def find_client_by_name(customer_name: str, account=None) -> Optional[Client]:
    qs = Client.objects.filter(customer_name=customer_name, is_active=True)
    qs = _apply_data_scope(qs, account, scope_override='global')
    return qs.first()


def create_client(customer_code: str, customer_name: str, short_name: str = '', payment_term_days: int = 30,
                  payment_term_description: str = '', remark: str = '', is_active: bool = True, created_by_id: int = None) -> Client:
    return Client.objects.create(
        customer_code=customer_code or f'CUST{Client.objects.count() + 1:04d}',
        customer_name=customer_name,
        short_name=short_name,
        payment_term_days=payment_term_days,
        payment_term_description=payment_term_description,
        remark=remark,
        is_active=is_active,
        created_by_id=created_by_id,
    )


def update_client(client_id: int, **kwargs) -> Optional[Client]:
    c = get_client(client_id)
    if not c:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(c, k):
            setattr(c, k, v)
    c.save()
    return c


def delete_client(client_id: int) -> bool:
    c = get_client(client_id)
    if not c:
        return False
    c.delete()
    return True


# ============================================================================
# 开票申请 (InvoiceRequest)
# ============================================================================
def list_invoice_requests(page: int = 1, page_size: int = 20, request_by: str = None, customer_name: str = None,
                          start_date=None, end_date=None, status: str = None, account=None) -> dict:
    qs = InvoiceRequest.objects.all().prefetch_related('items')
    qs = _apply_data_scope(qs, account, scope_override='global')  # 开票申请为团队共享，所有有权限者可见
    if request_by:
        qs = qs.filter(request_by__icontains=request_by)
    if customer_name:
        qs = qs.filter(customer_name__icontains=customer_name)
    if start_date:
        qs = qs.filter(request_date__gte=start_date)
    if end_date:
        qs = qs.filter(request_date__lte=end_date)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs.order_by('-request_date', '-create_time')[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_invoice_request(req_id: int) -> Optional[InvoiceRequest]:
    return InvoiceRequest.objects.filter(id=req_id).prefetch_related('items').first()


def _amount_inclusive(amount, amount_type: str, tax_rate) -> 'Decimal':
    from decimal import Decimal
    am = Decimal(str(amount))
    rate = Decimal(str(tax_rate)) if tax_rate is not None else Decimal('0.06')
    if amount_type == 'inclusive_of_tax':
        return am
    return am * (1 + rate)


def create_invoice_request(request_date, customer_name: str, items: list, po: str = '', request_by: str = '',
                           request_by_id: int = None, notes: str = '', created_by_id: int = None,
                           invoice_type: str = 'vat_special', amount_type: str = 'inclusive_of_tax',
                           tax_rate=None) -> InvoiceRequest:
    from decimal import Decimal
    rate = Decimal(str(tax_rate)) if tax_rate is not None else Decimal('0.06')
    total_inclusive = sum(
        _amount_inclusive(it.get('amount', 0), amount_type or 'inclusive_of_tax', rate)
        for it in items
    )
    req = InvoiceRequest.objects.create(
        request_date=request_date,
        customer_name=customer_name,
        invoice_type=invoice_type or 'vat_special',
        amount_type=amount_type or 'inclusive_of_tax',
        tax_rate=rate,
        po=po or '',
        total_amount=total_inclusive,
        request_by=request_by or '',
        request_by_id=request_by_id,
        notes=notes or '',
        created_by_id=created_by_id,
    )
    for i, it in enumerate(items):
        InvoiceRequestItem.objects.create(
            invoice_request=req,
            project_code=it.get('project_code', ''),
            project_id=it.get('project_id'),
            amount=Decimal(str(it.get('amount', 0))),
            service_content=it.get('service_content', ''),
            sort_order=i,
        )
    return req


def update_invoice_request(req_id: int, **kwargs) -> Optional[InvoiceRequest]:
    req = get_invoice_request(req_id)
    if not req:
        return None
    items_data = kwargs.pop('items', None)
    for k, v in kwargs.items():
        if v is not None and hasattr(req, k):
            if k == 'processed_at' and isinstance(v, str):
                from django.utils.dateparse import parse_datetime
                v = parse_datetime(v)
            setattr(req, k, v)
    req.save()
    # 若仅更新了 amount_type / tax_rate，用当前明细重新计算含税总金额
    if items_data is None and ('amount_type' in kwargs or 'tax_rate' in kwargs):
        at = getattr(req, 'amount_type', None) or 'inclusive_of_tax'
        tr = getattr(req, 'tax_rate', None)
        total_inclusive = sum(_amount_inclusive(i.amount, at, tr) for i in req.items.all())
        req.total_amount = total_inclusive
        req.save(update_fields=['total_amount', 'update_time'])
    if items_data is not None:
        req.items.all().delete()
        from decimal import Decimal
        at = getattr(req, 'amount_type', None) or 'inclusive_of_tax'
        tr = getattr(req, 'tax_rate', None) or Decimal('0.06')
        for i, it in enumerate(items_data):
            InvoiceRequestItem.objects.create(
                invoice_request=req,
                project_code=it.get('project_code', ''),
                project_id=it.get('project_id'),
                amount=Decimal(str(it.get('amount', 0))),
                service_content=it.get('service_content', ''),
                sort_order=i,
            )
        total_inclusive = sum(
            _amount_inclusive(i.amount, at, tr) for i in req.items.all()
        )
        req.total_amount = total_inclusive
        req.save(update_fields=['total_amount', 'update_time'])
    return get_invoice_request(req_id)


def delete_invoice_request(req_id: int) -> bool:
    req = get_invoice_request(req_id)
    if not req:
        return False
    req.delete()
    return True
