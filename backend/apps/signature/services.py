"""
电子签名服务

封装电子签名的创建、验证逻辑，符合 21 CFR Part 11 标准。
电子签名记录一旦创建，不可修改、不可删除（合规要求）。
"""
import hashlib
import json
import logging
from typing import Optional
from datetime import datetime
import base64
from pathlib import Path
from uuid import uuid4

from django.conf import settings

from .models import ElectronicSignature

logger = logging.getLogger(__name__)


# ============================================================================
# 签名记录查询
# ============================================================================
def list_signatures(
    account_id: int = None,
    resource_type: str = None,
    resource_id: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页查询电子签名记录"""
    qs = ElectronicSignature.objects.all()
    if account_id:
        qs = qs.filter(account_id=account_id)
    if resource_type:
        qs = qs.filter(resource_type=resource_type)
    if resource_id:
        qs = qs.filter(resource_id=resource_id)

    qs = qs.order_by('-signed_at')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_signature(signature_id: int) -> Optional[ElectronicSignature]:
    """获取签名记录详情"""
    return ElectronicSignature.objects.filter(id=signature_id).first()


def get_resource_signatures(resource_type: str, resource_id: str) -> list:
    """获取特定资源的所有签名"""
    return list(
        ElectronicSignature.objects.filter(
            resource_type=resource_type,
            resource_id=str(resource_id),
        ).order_by('-signed_at')
    )


# ============================================================================
# 签名创建（不可逆操作）
# ============================================================================
def create_signature(
    account_id: int,
    account_name: str,
    resource_type: str,
    resource_id: str,
    signature_data: dict,
    account_type: str = '',
    resource_name: str = '',
    reason: str = '',
    ip_address: str = None,
    user_agent: str = '',
) -> ElectronicSignature:
    """创建电子签名记录

    此操作不可逆，创建后不可修改或删除。
    signature_data 应包含签名图像/证书/哈希等数据。
    """
    # 计算签名数据的哈希（防篡改）
    data_hash = _compute_hash(signature_data)
    enriched_data = {
        **signature_data,
        '_hash': data_hash,
    }

    signature = ElectronicSignature.objects.create(
        account_id=account_id,
        account_name=account_name,
        account_type=account_type,
        resource_type=resource_type,
        resource_id=str(resource_id),
        resource_name=resource_name,
        signature_data=enriched_data,
        reason=reason,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    logger.info(
        f'Electronic signature created: id={signature.id}, '
        f'account={account_name}({account_id}), '
        f'resource={resource_type}:{resource_id}'
    )
    return signature


# ============================================================================
# 签名验证
# ============================================================================
def verify_signature_integrity(signature_id: int) -> dict:
    """验证签名记录完整性

    通过重新计算哈希值，确认签名数据未被篡改。
    返回 {'valid': bool, 'message': str}
    """
    sig = get_signature(signature_id)
    if not sig:
        return {'valid': False, 'message': '签名记录不存在'}

    stored_hash = sig.signature_data.get('_hash', '')
    if not stored_hash:
        return {'valid': False, 'message': '签名数据缺少哈希值'}

    # 去掉 _hash 字段后重新计算
    data_without_hash = {k: v for k, v in sig.signature_data.items() if k != '_hash'}
    computed_hash = _compute_hash(data_without_hash)

    if computed_hash == stored_hash:
        return {'valid': True, 'message': '签名完整性验证通过'}
    else:
        logger.warning(f'Signature integrity check failed: id={signature_id}')
        return {'valid': False, 'message': '签名数据已被篡改'}


def has_valid_signature(resource_type: str, resource_id: str) -> bool:
    """检查资源是否有有效签名"""
    return ElectronicSignature.objects.filter(
        resource_type=resource_type,
        resource_id=str(resource_id),
    ).exists()


# ============================================================================
# 工具函数
# ============================================================================
def _compute_hash(data: dict) -> str:
    """计算字典数据的 SHA256 哈希"""
    serialized = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode('utf-8')).hexdigest()


def persist_signature_image(image_base64: str) -> dict:
    """
    持久化 Canvas 签名图片，返回存储键和摘要。

    image_base64 支持 data URL 或纯 base64。
    """
    if not image_base64:
        raise ValueError('签名图片不能为空')

    raw = image_base64.strip()
    if raw.startswith('data:image/'):
        _, raw = raw.split(',', 1)

    try:
        binary = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValueError('签名图片格式无效') from exc
    if not binary:
        raise ValueError('签名图片内容为空')

    now = datetime.now()
    rel_dir = Path('signature') / f'{now:%Y}' / f'{now:%m}'
    abs_dir = Path(settings.MEDIA_ROOT) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    file_name = f'sig_{now:%Y%m%d_%H%M%S}_{uuid4().hex[:8]}.png'
    abs_path = abs_dir / file_name
    abs_path.write_bytes(binary)

    storage_key = str((rel_dir / file_name).as_posix())
    return {
        'storage_key': storage_key,
        'file_size': len(binary),
        'sha256': hashlib.sha256(binary).hexdigest(),
    }
