"""
开票申请写入权限与「商务仅维护本人待处理申请」校验。
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict

if TYPE_CHECKING:
    from apps.identity.models import Account

from apps.identity.authz import get_authz_service

PERM_INVOICE_CREATE = 'finance.invoice.create'
PERM_INVOICE_REQUEST_SUBMIT = 'finance.invoice_request.submit'


def invoice_request_owned_by_account(req: Any, account: 'Account') -> bool:
    if not account or not req:
        return False
    rid = getattr(req, 'request_by_id', None)
    if rid and rid == account.id:
        return True
    rb = (getattr(req, 'request_by', None) or '').strip()
    if not rb:
        return False
    uname = (getattr(account, 'username', None) or '').strip()
    dname = (getattr(account, 'display_name', None) or '').strip()
    return rb == uname or rb == dname


def account_may_update_invoice_request(account: 'Account', req: Any, payload: Dict[str, Any]) -> bool:
    """财务拥有 invoice.create 可任意更新；商务仅 submit 可更新本人待处理申请，且不得改状态/发票关联/处理人。"""
    authz = get_authz_service()
    if authz.has_permission(account, PERM_INVOICE_CREATE):
        return True
    if not authz.has_permission(account, PERM_INVOICE_REQUEST_SUBMIT):
        return False
    forbidden = {'status', 'invoice_ids', 'processed_by', 'processed_at'}
    if forbidden.intersection(payload.keys()):
        return False
    status = getattr(req, 'status', '') or ''
    if status in ('completed', 'cancelled'):
        return False
    return invoice_request_owned_by_account(req, account)


def account_may_delete_invoice_request(account: 'Account', req: Any) -> bool:
    authz = get_authz_service()
    if authz.has_permission(account, PERM_INVOICE_CREATE):
        return True
    if not authz.has_permission(account, PERM_INVOICE_REQUEST_SUBMIT):
        return False
    status = getattr(req, 'status', '') or ''
    if status in ('completed', 'cancelled'):
        return False
    return invoice_request_owned_by_account(req, account)


def legacy_invoice_linked_to_account_invoice_requests(account: 'Account', invoice_id: int) -> bool:
    """电子发票上传：限与本人开票申请关联的 Legacy 发票。"""
    from apps.finance.models import InvoiceRequest

    for req in InvoiceRequest.objects.filter(invoice_ids__contains=[invoice_id]):
        if invoice_request_owned_by_account(req, account):
            return True
    return False
