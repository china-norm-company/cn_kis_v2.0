"""
SDV（源数据核查）服务

来源：cn_kis_test edc/services/sdv_service.py
S2-4：字段级/表单级 SDV 完成度跟踪
"""
import logging
from typing import Optional
from django.utils import timezone

from apps.edc.models import CRFRecord, CRFRecordStatus, SDVRecord, SDVStatus

logger = logging.getLogger(__name__)


class SDVService:
    """SDV 核查服务"""

    @classmethod
    def init_sdv_for_record(cls, crf_record_id: int) -> list:
        """
        为 CRF 记录初始化字段级 SDV 条目

        根据 CRF 模板 schema 的 properties 自动创建待核查项。
        """
        record = CRFRecord.objects.filter(id=crf_record_id).first()
        if not record:
            return []

        schema = record.template.schema or {}
        fields = list(schema.get('properties', {}).keys())
        if not fields:
            return []

        existing_fields = set(
            SDVRecord.objects.filter(crf_record=record).values_list('field_name', flat=True)
        )

        new_items = []
        for fname in fields:
            if fname not in existing_fields:
                new_items.append(SDVRecord(
                    crf_record=record,
                    field_name=fname,
                    status=SDVStatus.PENDING,
                ))

        if new_items:
            SDVRecord.objects.bulk_create(new_items)

        return new_items

    @classmethod
    def verify_field(
        cls, crf_record_id: int, field_name: str,
        verified_by_id: int = None, notes: str = '',
    ) -> Optional[SDVRecord]:
        """标记单个字段 SDV 完成"""
        sdv = SDVRecord.objects.filter(
            crf_record_id=crf_record_id, field_name=field_name,
        ).first()
        if not sdv:
            return None

        sdv.status = SDVStatus.VERIFIED
        sdv.verified_by_id = verified_by_id
        sdv.verified_at = timezone.now()
        sdv.notes = notes
        sdv.save()

        # 检查是否全部完成
        cls._check_sdv_complete(crf_record_id)
        return sdv

    @classmethod
    def get_sdv_progress(cls, crf_record_id: int) -> dict:
        """查询 SDV 进度"""
        qs = SDVRecord.objects.filter(crf_record_id=crf_record_id)
        total = qs.count()
        verified = qs.filter(status=SDVStatus.VERIFIED).count()
        return {
            'total': total,
            'verified': verified,
            'percentage': round(verified / total * 100, 1) if total else 0,
            'is_complete': total > 0 and verified == total,
        }

    @classmethod
    def _check_sdv_complete(cls, crf_record_id: int):
        """
        所有 SDV 完成后自动更新 CRF 记录状态

        AC-5: CRF status → sdv_completed
        """
        progress = cls.get_sdv_progress(crf_record_id)
        if progress['is_complete']:
            record = CRFRecord.objects.filter(id=crf_record_id).first()
            if record and record.status != CRFRecordStatus.SDV_COMPLETED:
                record.status = CRFRecordStatus.SDV_COMPLETED
                record.save(update_fields=['status', 'update_time'])
                logger.info(f'CRF#{crf_record_id} SDV 全部完成，状态更新为 {CRFRecordStatus.SDV_COMPLETED}')
