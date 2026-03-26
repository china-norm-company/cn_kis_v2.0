"""
EDC 数据采集服务

封装 CRF 模板管理、CRF 记录 CRUD、状态流转、数据验证等业务逻辑。
符合 21 CFR Part 11 审计要求。
"""
import logging
from typing import Optional
from django.utils import timezone

from .models import CRFTemplate, CRFRecord, CRFRecordStatus, InstrumentInterface

logger = logging.getLogger(__name__)


# ============================================================================
# CRF 模板管理
# ============================================================================
def list_crf_templates(
    is_active: bool = None,
    name: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页查询 CRF 模板"""
    qs = CRFTemplate.objects.filter(is_deleted=False)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    if name:
        qs = qs.filter(name__icontains=name)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_crf_template(template_id: int) -> Optional[CRFTemplate]:
    """获取 CRF 模板详情"""
    return CRFTemplate.objects.filter(id=template_id, is_deleted=False).first()


def create_crf_template(
    name: str,
    schema: dict,
    version: str = '1.0',
    description: str = '',
) -> CRFTemplate:
    """创建 CRF 模板"""
    return CRFTemplate.objects.create(
        name=name,
        schema=schema,
        version=version,
        description=description,
    )


def update_crf_template(template_id: int, **kwargs) -> Optional[CRFTemplate]:
    """更新 CRF 模板"""
    template = get_crf_template(template_id)
    if not template:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(template, key):
            setattr(template, key, value)
    template.save()
    return template


# ============================================================================
# CRF 记录管理
# ============================================================================
def list_crf_records(
    template_id: int = None,
    work_order_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页查询 CRF 记录"""
    qs = CRFRecord.objects.select_related('template').all()
    if template_id:
        qs = qs.filter(template_id=template_id)
    if work_order_id:
        qs = qs.filter(work_order_id=work_order_id)
    if status:
        qs = qs.filter(status=status)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_crf_record(record_id: int) -> Optional[CRFRecord]:
    """获取 CRF 记录详情"""
    return CRFRecord.objects.select_related('template').filter(id=record_id).first()


def create_crf_record(
    template_id: int,
    work_order_id: int,
    data: dict,
) -> CRFRecord:
    """创建 CRF 记录"""
    return CRFRecord.objects.create(
        template_id=template_id,
        work_order_id=work_order_id,
        data=data,
    )


def update_crf_record_data(record_id: int, data: dict) -> Optional[CRFRecord]:
    """更新 CRF 记录数据（仅草稿状态可更新）"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status != CRFRecordStatus.DRAFT:
        logger.warning(f'Cannot update CRF record {record_id}: status is {record.status}')
        return None
    record.data = data
    record.save(update_fields=['data', 'update_time'])
    return record


# ============================================================================
# CRF 状态流转（21 CFR Part 11 合规）
# ============================================================================
VALID_TRANSITIONS = {
    CRFRecordStatus.DRAFT: [CRFRecordStatus.SUBMITTED],
    CRFRecordStatus.SUBMITTED: [CRFRecordStatus.VERIFIED, CRFRecordStatus.QUERIED, CRFRecordStatus.DRAFT],
    CRFRecordStatus.QUERIED: [CRFRecordStatus.SUBMITTED],
    CRFRecordStatus.VERIFIED: [CRFRecordStatus.LOCKED, CRFRecordStatus.QUERIED],
    CRFRecordStatus.LOCKED: [],  # 锁定后不可修改
}


def submit_crf_record(record_id: int, submitted_by: int) -> Optional[CRFRecord]:
    """提交 CRF 记录"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status not in (CRFRecordStatus.DRAFT, CRFRecordStatus.QUERIED):
        return None
    record.status = CRFRecordStatus.SUBMITTED
    record.submitted_by = submitted_by
    record.submitted_at = timezone.now()
    record.save(update_fields=['status', 'submitted_by', 'submitted_at', 'update_time'])
    return record


def verify_crf_record(record_id: int, verified_by: int) -> Optional[CRFRecord]:
    """核实 CRF 记录"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status != CRFRecordStatus.SUBMITTED:
        return None
    record.status = CRFRecordStatus.VERIFIED
    record.verified_by = verified_by
    record.verified_at = timezone.now()
    record.save(update_fields=['status', 'verified_by', 'verified_at', 'update_time'])
    return record


def query_crf_record(record_id: int) -> Optional[CRFRecord]:
    """质疑 CRF 记录"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status not in (CRFRecordStatus.SUBMITTED, CRFRecordStatus.VERIFIED):
        return None
    record.status = CRFRecordStatus.QUERIED
    record.save(update_fields=['status', 'update_time'])
    return record


def lock_crf_record(record_id: int) -> Optional[CRFRecord]:
    """锁定 CRF 记录（不可逆）"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status != CRFRecordStatus.VERIFIED:
        return None
    record.status = CRFRecordStatus.LOCKED
    record.save(update_fields=['status', 'update_time'])
    return record


# ============================================================================
# 仪器接口管理
# ============================================================================
def list_instrument_interfaces(is_active: bool = None) -> list:
    """查询仪器接口列表"""
    qs = InstrumentInterface.objects.filter(is_deleted=False)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    return list(qs.order_by('name'))


def get_instrument_interface(interface_id: int) -> Optional[InstrumentInterface]:
    """获取仪器接口详情"""
    return InstrumentInterface.objects.filter(id=interface_id, is_deleted=False).first()
