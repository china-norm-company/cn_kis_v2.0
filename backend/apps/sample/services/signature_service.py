"""物料关键操作电子签名服务"""
import hashlib
import json
from django.utils import timezone


class _SignatureService:
    """为销毁、盘点、分发等关键操作提供电子签名验证"""

    def create_signature_request(
        self,
        operation_type: str,
        operation_id: int,
        operator_id: int,
        operator_name: str,
        content_summary: str,
    ) -> dict:
        """创建电子签名请求"""
        sig_data = {
            'operation_type': operation_type,
            'operation_id': operation_id,
            'operator_id': operator_id,
            'operator_name': operator_name,
            'content_summary': content_summary,
            'timestamp': timezone.now().isoformat(),
        }

        content_hash = hashlib.sha256(
            json.dumps(sig_data, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()

        return {
            'signature_id': (
                f'SIG-{operation_type.upper()}-{operation_id}-'
                f'{timezone.now().strftime("%Y%m%d%H%M%S")}'
            ),
            'operation_type': operation_type,
            'operation_id': operation_id,
            'operator_name': operator_name,
            'content_hash': content_hash,
            'content_summary': content_summary,
            'status': 'pending',
            'created_at': timezone.now().isoformat(),
        }

    def verify_signature(
        self, signature_id: str, operator_id: int, password_or_token: str
    ) -> dict:
        """验证电子签名（模拟身份验证）"""
        if not password_or_token:
            return {'valid': False, 'message': '签名验证失败：未提供认证信息'}

        return {
            'signature_id': signature_id,
            'valid': True,
            'verified_at': timezone.now().isoformat(),
            'operator_id': operator_id,
            'message': '电子签名验证通过',
        }

    def sign_destruction(
        self, destruction_id: int, operator_id: int, operator_name: str, password: str
    ) -> dict:
        """销毁操作签名"""
        sig = self.create_signature_request(
            'destruction', destruction_id, operator_id, operator_name,
            f'销毁操作 #{destruction_id}',
        )
        verification = self.verify_signature(sig['signature_id'], operator_id, password)
        if verification['valid']:
            sig['status'] = 'signed'
            sig['signed_at'] = verification['verified_at']
        return sig

    def sign_inventory_check(
        self, check_id: int, operator_id: int, operator_name: str, password: str
    ) -> dict:
        """盘点审核签名"""
        sig = self.create_signature_request(
            'inventory_check', check_id, operator_id, operator_name,
            f'盘点审核 #{check_id}',
        )
        verification = self.verify_signature(sig['signature_id'], operator_id, password)
        if verification['valid']:
            sig['status'] = 'signed'
            sig['signed_at'] = verification['verified_at']
        return sig

    def sign_dispensing(
        self, dispensing_id: int, operator_id: int, operator_name: str, password: str
    ) -> dict:
        """分发确认签名"""
        sig = self.create_signature_request(
            'dispensing', dispensing_id, operator_id, operator_name,
            f'分发确认 #{dispensing_id}',
        )
        verification = self.verify_signature(sig['signature_id'], operator_id, password)
        if verification['valid']:
            sig['status'] = 'signed'
            sig['signed_at'] = verification['verified_at']
        return sig

    def sign_batch_release(
        self, batch_id: int, operator_id: int, operator_name: str, password: str
    ) -> dict:
        """批次放行签名"""
        sig = self.create_signature_request(
            'batch_release', batch_id, operator_id, operator_name,
            f'批次放行 #{batch_id}',
        )
        verification = self.verify_signature(sig['signature_id'], operator_id, password)
        if verification['valid']:
            sig['status'] = 'signed'
            sig['signed_at'] = verification['verified_at']
        return sig

    def get_signatures_for_operation(
        self, operation_type: str, operation_id: int
    ) -> list:
        """获取某操作的所有签名记录"""
        return [
            {
                'operation_type': operation_type,
                'operation_id': operation_id,
                'message': '签名记录查询功能待数据库表实现',
            }
        ]


signature_service = _SignatureService()
