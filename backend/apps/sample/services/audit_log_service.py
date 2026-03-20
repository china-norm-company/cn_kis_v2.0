"""物料操作审计日志服务"""
import json
import logging
from django.utils import timezone


# 物料相关资源类型，用于按模块筛选
MATERIAL_RESOURCE_TYPES = frozenset([
    'ConsumableTransaction', 'Consumable', 'SampleReceipt', 'ProductBatch',
    'InventoryCount', 'SampleDestruction', 'StorageLocation', 'Product',
    'SampleDistribution', 'SampleReturn', 'TemperatureLog',
])


class _MaterialAuditService:
    """将物料关键操作写入审计模块"""

    AUDITABLE_ACTIONS = [
        'sample_receipt', 'sample_inspection', 'sample_storage',
        'sample_distribution', 'sample_return', 'sample_destruction',
        'batch_create', 'batch_receive', 'batch_release',
        'kit_create', 'kit_assign', 'kit_distribute',
        'dispensing_create', 'dispensing_prepare', 'dispensing_execute', 'dispensing_confirm',
        'consumable_inbound', 'consumable_issue', 'consumable_return', 'consumable_scrap',
        'inventory_initiate', 'inventory_submit', 'inventory_approve',
        'temperature_excursion',
    ]

    def log_action(
        self,
        action: str,
        operator_id: int,
        operator_name: str,
        target_type: str,
        target_id: int,
        target_code: str,
        details: dict = None,
        ip_address: str = None,
    ) -> dict:
        """记录一条审计日志"""
        try:
            from apps.audit.models import AuditLog, AuditAction

            # 映射到 AuditLog 模型字段（account_id, account_name, resource_type, resource_id, resource_name）
            action_map = {
                'sample_receipt': AuditAction.CREATE,
                'sample_inspection': AuditAction.UPDATE,
                'batch_create': AuditAction.CREATE,
                'batch_release': AuditAction.APPROVE,
                'sample_destruction': AuditAction.DELETE,
                'consumable_inbound': AuditAction.CREATE,
                'consumable_issue': AuditAction.UPDATE,
                'consumable_return': AuditAction.UPDATE,
                'consumable_scrap': AuditAction.DELETE,
                'inventory_initiate': AuditAction.CREATE,
                'inventory_submit': AuditAction.UPDATE,
                'inventory_approve': AuditAction.APPROVE,
                'temperature_excursion': AuditAction.VIEW,
            }
            audit_action = action_map.get(action, AuditAction.UPDATE)

            details_str = json.dumps(details or {}, ensure_ascii=False)
            log = AuditLog.objects.create(
                account_id=operator_id,
                account_name=operator_name,
                account_type='',
                action=audit_action,
                description=f'{action}: {target_code}',
                resource_type=target_type,
                resource_id=str(target_id),
                resource_name=target_code,
                new_value={'material_action': action, 'details': details or {}},
                ip_address=ip_address or None,
                create_time=timezone.now(),
            )
            return {'id': log.id, 'action': action, 'status': 'logged'}
        except Exception:
            return self._fallback_log(
                action, operator_name, target_type, target_id, target_code, details
            )

    def _fallback_log(
        self, action, operator_name, target_type, target_id, target_code, details
    ):
        """如果 audit 模块不可用，使用 Django logging"""
        logger = logging.getLogger('material.audit')
        logger.info(
            f'AUDIT: {action} by {operator_name} on {target_type}#{target_id} ({target_code})',
            extra={'details': details},
        )
        return {'action': action, 'status': 'logged_fallback'}

    def log_receipt_created(
        self, operator_id: int, operator_name: str, receipt_no: str, receipt_id: int, details: dict = None
    ):
        return self.log_action(
            'sample_receipt', operator_id, operator_name, 'SampleReceipt', receipt_id, receipt_no, details
        )

    def log_receipt_inspected(
        self, operator_id: int, operator_name: str, receipt_no: str, receipt_id: int,
        result: str, details: dict = None
    ):
        d = {**(details or {}), 'result': result}
        return self.log_action(
            'sample_inspection', operator_id, operator_name, 'SampleReceipt', receipt_id, receipt_no, d
        )

    def log_batch_created(
        self, operator_id: int, operator_name: str, batch_no: str, batch_id: int, details: dict = None
    ):
        return self.log_action(
            'batch_create', operator_id, operator_name, 'ProductBatch', batch_id, batch_no, details
        )

    def log_batch_released(
        self, operator_id: int, operator_name: str, batch_no: str, batch_id: int, details: dict = None
    ):
        return self.log_action(
            'batch_release', operator_id, operator_name, 'ProductBatch', batch_id, batch_no, details
        )

    def log_destruction(
        self, operator_id: int, operator_name: str, destruction_no: str, destruction_id: int,
        action_type: str, details: dict = None
    ):
        d = {**(details or {}), 'action_type': action_type}
        return self.log_action(
            'sample_destruction', operator_id, operator_name,
            'SampleDestruction', destruction_id, destruction_no, d
        )

    def log_consumable_transaction(
        self, operator_id: int, operator_name: str, tx_no: str, tx_id: int,
        tx_type: str, details: dict = None
    ):
        action_map = {
            'inbound': 'consumable_inbound', 'issue': 'consumable_issue',
            'return': 'consumable_return', 'scrap': 'consumable_scrap',
        }
        action = action_map.get(tx_type, f'consumable_{tx_type}')
        return self.log_action(
            action, operator_id, operator_name,
            'ConsumableTransaction', tx_id, tx_no, details
        )

    def log_inventory_action(
        self, operator_id: int, operator_name: str, check_no: str, check_id: int,
        action_type: str, details: dict = None
    ):
        action_map = {
            'initiate': 'inventory_initiate',
            'submit': 'inventory_submit',
            'approve': 'inventory_approve',
        }
        action = action_map.get(action_type, f'inventory_{action_type}')
        return self.log_action(
            action, operator_id, operator_name, 'InventoryCount', check_id, check_no, details
        )

    def log_temperature_excursion(
        self, location_code: str, temperature: float,
        limit_upper: float, limit_lower: float, details: dict = None
    ):
        d = {
            **(details or {}),
            'temperature': temperature,
            'limit_upper': limit_upper,
            'limit_lower': limit_lower,
        }
        return self.log_action(
            'temperature_excursion', 0, 'SYSTEM',
            'StorageLocation', 0, location_code, d
        )

    def get_audit_trail(
        self,
        target_type: str = None,
        target_id: int = None,
        module: str = 'material',
        limit: int = 50,
    ) -> list:
        """查询审计日志"""
        try:
            from apps.audit.models import AuditLog

            qs = AuditLog.objects.all()
            if module == 'material':
                qs = qs.filter(resource_type__in=MATERIAL_RESOURCE_TYPES)
            if target_type:
                qs = qs.filter(resource_type=target_type)
            if target_id is not None:
                qs = qs.filter(resource_id=str(target_id))

            items = []
            for log in qs.order_by('-create_time')[:limit]:
                new_val = log.new_value or {}
                material_action = new_val.get('material_action', log.action)
                details = new_val.get('details', {})
                if isinstance(details, dict):
                    details_str = json.dumps(details, ensure_ascii=False)
                else:
                    details_str = str(details)
                items.append({
                    'id': log.id,
                    'action': material_action,
                    'operator_name': log.account_name,
                    'target_type': log.resource_type,
                    'target_id': log.resource_id,
                    'target_code': log.resource_name,
                    'details': details_str,
                    'create_time': log.create_time.isoformat() if log.create_time else '',
                })
            return items
        except Exception:
            return []


material_audit_service = _MaterialAuditService()
