"""
工单质量审计服务

来源：cn_kis_test workorder/services/enhanced_quality_audit_service.py
S2-3：工单完成后自动创建质量审计记录

规则引擎：
- 数据完整度 ≥95% 且无异常 → auto_pass
- 数据完整度 <70% → auto_reject
- 其他 → manual_review
"""
import logging
from typing import Optional

from django.db import transaction

from apps.workorder.models import WorkOrder

logger = logging.getLogger(__name__)


class AuditResult:
    AUTO_PASS = 'auto_pass'
    AUTO_REJECT = 'auto_reject'
    MANUAL_REVIEW = 'manual_review'


class EnhancedQualityAuditService:
    """工单质量审计服务"""

    # 阈值配置
    AUTO_PASS_THRESHOLD = 0.95
    AUTO_REJECT_THRESHOLD = 0.70

    @classmethod
    @transaction.atomic
    def auto_audit(cls, work_order_id: int) -> Optional[dict]:
        """
        自动质量审计

        计算数据完整度 + 检查异常记录 → 自动判定结果。
        """
        from apps.workorder.models import WorkOrderQualityAudit

        wo = WorkOrder.objects.filter(id=work_order_id, is_deleted=False).first()
        if not wo:
            return None

        # 计算完整度
        completeness = cls._calculate_completeness(wo)

        # 检查异常
        has_anomaly = cls._check_anomalies(wo)

        # 判定
        if completeness >= cls.AUTO_PASS_THRESHOLD and not has_anomaly:
            result = AuditResult.AUTO_PASS
        elif completeness < cls.AUTO_REJECT_THRESHOLD:
            result = AuditResult.AUTO_REJECT
        else:
            result = AuditResult.MANUAL_REVIEW

        audit = WorkOrderQualityAudit.objects.create(
            work_order=wo,
            completeness=completeness,
            has_anomaly=has_anomaly,
            result=result,
            details={
                'completeness': completeness,
                'has_anomaly': has_anomaly,
                'auto_pass_threshold': cls.AUTO_PASS_THRESHOLD,
                'auto_reject_threshold': cls.AUTO_REJECT_THRESHOLD,
            },
        )

        logger.info(
            f'质量审计: wo_id={work_order_id}, completeness={completeness:.2%}, '
            f'anomaly={has_anomaly}, result={result}'
        )
        return {
            'audit_id': audit.id,
            'result': result,
            'completeness': completeness,
            'has_anomaly': has_anomaly,
        }

    @classmethod
    def _calculate_completeness(cls, wo: WorkOrder) -> float:
        """
        计算数据完整度

        基于 CRF 记录：已提交字段数 / 总必填字段数
        """
        from apps.edc.models import CRFRecord
        records = CRFRecord.objects.filter(work_order_id=wo.id)

        if not records.exists():
            return 0.0

        total_fields = 0
        filled_fields = 0

        for record in records:
            schema = record.template.schema or {}
            required_fields = schema.get('required', [])
            properties = schema.get('properties', {})

            # 如果没有定义 required，统计所有 properties 字段
            fields_to_check = required_fields if required_fields else list(properties.keys())
            total_fields += len(fields_to_check)

            data = record.data or {}
            for field in fields_to_check:
                val = data.get(field)
                if val is not None and str(val).strip() != '':
                    filled_fields += 1

        if total_fields == 0:
            return 1.0

        return filled_fields / total_fields

    @classmethod
    def _check_anomalies(cls, wo: WorkOrder) -> bool:
        """
        检查是否有异常记录

        异常定义：
        - CRF 验证失败（有未解决的 validation_results）
        - 关联了不良事件
        """
        from apps.edc.models import CRFValidationResult
        has_validation_errors = CRFValidationResult.objects.filter(
            record__work_order_id=wo.id,
            is_resolved=False,
            severity='error',
        ).exists()

        from apps.safety.models import AdverseEvent
        has_ae = AdverseEvent.objects.filter(work_order=wo).exists()

        return has_validation_errors or has_ae
