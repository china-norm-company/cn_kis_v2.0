"""物料导出、审计日志、电子签名 API"""
from ninja import Router, Schema
from typing import Optional

from apps.sample.services.export_service import export_service
from apps.sample.services.audit_log_service import material_audit_service
from apps.sample.services.signature_service import signature_service

router = Router(tags=['物料-导出/审计/签名'])


# ===== 导出 =====

class ExportFilterIn(Schema):
    transaction_type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    consumable_id: Optional[int] = None
    format: str = 'csv'


@router.post('/export/transactions', summary='导出出入库流水')
def export_transactions(request, payload: ExportFilterIn):
    """导出出入库流水"""
    filters = payload.dict(exclude_none=True)
    fmt = filters.pop('format', 'csv')

    if fmt == 'csv':
        return export_service.export_transactions_excel(filters)
    elif fmt == 'pdf':
        result = export_service.export_transactions_pdf(filters)
        return {'code': 0, 'msg': 'ok', 'data': result}
    else:
        return {'code': 400, 'msg': f'不支持的格式: {fmt}'}


@router.post('/export/evidence-package', summary='导出证据包')
def export_evidence_package(request, payload: ExportFilterIn):
    """导出证据包（ZIP）"""
    result = export_service.export_evidence_package(payload.dict(exclude_none=True))
    return {'code': 0, 'msg': 'ok', 'data': result}


# ===== 审计日志 =====

@router.get('/audit/trail', summary='查询物料审计日志')
def get_audit_trail(
    request,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    limit: int = 50,
):
    """查询物料审计日志"""
    trail = material_audit_service.get_audit_trail(
        target_type=target_type, target_id=target_id, limit=limit
    )
    return {'code': 0, 'msg': 'ok', 'data': {'items': trail, 'total': len(trail)}}


# ===== 电子签名 =====

class SignatureRequestIn(Schema):
    operation_type: str
    operation_id: int
    password: str


class VerifySignatureIn(Schema):
    signature_id: str
    password: str


@router.post('/signature/sign', summary='对关键操作进行电子签名')
def sign_operation(request, payload: SignatureRequestIn):
    """对关键操作进行电子签名"""
    sign_methods = {
        'destruction': signature_service.sign_destruction,
        'inventory_check': signature_service.sign_inventory_check,
        'dispensing': signature_service.sign_dispensing,
        'batch_release': signature_service.sign_batch_release,
    }

    sign_fn = sign_methods.get(payload.operation_type)
    if not sign_fn:
        return {'code': 400, 'msg': f'不支持的操作类型: {payload.operation_type}'}

    result = sign_fn(payload.operation_id, 0, '当前用户', payload.password)
    return {'code': 0, 'msg': '签名成功', 'data': result}


@router.post('/signature/verify', summary='验证电子签名')
def verify_signature(request, payload: VerifySignatureIn):
    """验证电子签名"""
    result = signature_service.verify_signature(
        payload.signature_id, 0, payload.password
    )
    return {'code': 0, 'msg': 'ok', 'data': result}


@router.get('/signature/history', summary='查询操作签名历史')
def get_signature_history(
    request,
    operation_type: str = '',
    operation_id: int = 0,
):
    """查询操作签名历史"""
    result = signature_service.get_signatures_for_operation(
        operation_type, operation_id
    )
    return {'code': 0, 'msg': 'ok', 'data': result}
