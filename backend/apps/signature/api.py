"""
电子签名 API

端点：
- GET  /signature/list              签名记录列表
- GET  /signature/{id}              签名记录详情
- POST /signature/create            创建签名记录
- GET  /signature/{id}/verify       验证签名完整性
- GET  /signature/resource          查询资源签名
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import datetime
from . import services
from apps.identity.decorators import require_permission

router = Router()


# ============================================================================
# Schema
# ============================================================================
class ElectronicSignatureOut(Schema):
    id: int
    account_id: int
    account_name: str
    account_type: Optional[str] = None
    resource_type: str
    resource_id: str
    resource_name: Optional[str] = None
    signature_data: dict
    reason: Optional[str] = None
    ip_address: Optional[str] = None
    signed_at: datetime


class SignatureCreateIn(Schema):
    account_id: int
    account_name: str
    account_type: Optional[str] = None
    resource_type: str
    resource_id: str
    resource_name: Optional[str] = None
    signature_data: dict
    reason: Optional[str] = None


class SignatureQueryParams(Schema):
    account_id: Optional[int] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    page: int = 1
    page_size: int = 20


class SignatureImageUploadIn(Schema):
    image_base64: str


def _sig_to_dict(s) -> dict:
    return {
        'id': s.id,
        'account_id': s.account_id,
        'account_name': s.account_name,
        'account_type': s.account_type,
        'resource_type': s.resource_type,
        'resource_id': s.resource_id,
        'resource_name': s.resource_name,
        'signature_data': s.signature_data,
        'reason': s.reason,
        'ip_address': str(s.ip_address) if s.ip_address else None,
        'signed_at': s.signed_at.isoformat(),
    }


# ============================================================================
# 端点
# ============================================================================
@router.get('/list', summary='签名记录列表')
@require_permission('signature.signature.read')
def list_signatures(request, params: SignatureQueryParams = Query(...)):
    """分页查询电子签名记录列表"""
    result = services.list_signatures(
        account_id=params.account_id,
        resource_type=params.resource_type,
        resource_id=params.resource_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_sig_to_dict(item) for item in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/resource', summary='查询资源签名')
@require_permission('signature.signature.read')
def get_resource_signatures(request, resource_type: str, resource_id: str):
    """获取特定资源的所有签名"""
    sigs = services.get_resource_signatures(resource_type, resource_id)
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'items': [_sig_to_dict(s) for s in sigs]},
    }


@router.post('/create', summary='创建签名记录')
@require_permission('signature.signature.create')
def create_signature(request, data: SignatureCreateIn):
    """创建电子签名记录（符合21 CFR Part 11）"""
    sig = services.create_signature(
        account_id=data.account_id,
        account_name=data.account_name,
        resource_type=data.resource_type,
        resource_id=data.resource_id,
        signature_data=data.signature_data,
        account_type=data.account_type or '',
        resource_name=data.resource_name or '',
        reason=data.reason or '',
        ip_address=request.META.get('REMOTE_ADDR'),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': sig.id,
            'resource_type': sig.resource_type,
            'resource_id': sig.resource_id,
            'signed_at': sig.signed_at.isoformat(),
        },
    }


@router.post('/upload-base64', summary='上传签名图片（base64）')
@require_permission('signature.signature.create')
def upload_signature_base64(request, data: SignatureImageUploadIn):
    """持久化签名图片并返回存储键。"""
    try:
        result = services.persist_signature_image(data.image_base64)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/{signature_id}', summary='签名记录详情')
@require_permission('signature.signature.read')
def get_signature(request, signature_id: int):
    """获取电子签名记录详细信息"""
    sig = services.get_signature(signature_id)
    if not sig:
        return 404, {'code': 404, 'msg': '签名记录不存在'}

    data = _sig_to_dict(sig)
    data['user_agent'] = sig.user_agent
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/{signature_id}/verify', summary='验证签名完整性')
@require_permission('signature.signature.read')
def verify_signature(request, signature_id: int):
    """验证电子签名数据完整性"""
    result = services.verify_signature_integrity(signature_id)
    code = 200 if result['valid'] else 400
    return {'code': code, 'msg': result['message'], 'data': result}
