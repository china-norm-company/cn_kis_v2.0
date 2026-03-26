"""
受试者 CRUD 服务

包含：列表查询、创建（含自动编号）、更新、软删除、状态变更。
"""
import logging
from typing import Optional
from django.utils import timezone

from ..models import Subject, SubjectRiskLevel

logger = logging.getLogger(__name__)


def generate_subject_no() -> str:
    """
    生成全局唯一受试者编号

    格式：SUB-YYYYMM-NNNN（如 SUB-202602-0001）
    每月序号独立递增。
    """
    now = timezone.now()
    prefix = f'SUB-{now.strftime("%Y%m")}-'
    last = (
        Subject.objects.filter(subject_no__startswith=prefix)
        .order_by('-subject_no')
        .values_list('subject_no', flat=True)
        .first()
    )
    if last:
        try:
            seq = int(last.split('-')[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f'{prefix}{seq:04d}'


def list_subjects(
    status: str = None,
    phone: str = None,
    risk_level: str = None,
    search: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    """分页查询受试者列表（支持按数据权限过滤）"""
    from apps.identity.filters import filter_queryset_by_scope

    qs = Subject.objects.filter(is_deleted=False)
    if status:
        qs = qs.filter(status=status)
    if phone:
        qs = qs.filter(phone__icontains=phone)
    if risk_level:
        qs = qs.filter(risk_level=risk_level)
    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(name__icontains=search) |
            Q(phone__icontains=search) |
            Q(subject_no__icontains=search)
        )
    if account:
        # Subject 无直接 protocol_id 字段，通过 enrollments__protocol_id 关联到项目。
        # 传入 field_mapping 确保项目级角色（CRC）正确过滤到所属项目的受试者，
        # 而非退化为个人级过滤（仅看 created_by 的记录）。
        qs = filter_queryset_by_scope(
            qs,
            account,
            field_mapping={'project': 'enrollments__protocol_id'},
        )

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_subject(subject_id: int) -> Optional[Subject]:
    """获取受试者详情"""
    return Subject.objects.filter(id=subject_id, is_deleted=False).first()


def create_subject(
    name: str,
    gender: str = '',
    age: int = None,
    phone: str = '',
    skin_type: str = '',
    risk_level: str = SubjectRiskLevel.LOW,
    source_channel: str = '',
    account=None,
) -> Subject:
    """创建受试者（自动生成 subject_no）"""
    subject_no = generate_subject_no()
    kw = dict(
        subject_no=subject_no,
        name=name,
        gender=gender,
        age=age,
        phone=phone,
        skin_type=skin_type,
        risk_level=risk_level or SubjectRiskLevel.LOW,
        source_channel=source_channel,
    )
    if account:
        kw['created_by_id'] = account.id
    return Subject.objects.create(**kw)


def update_subject(subject_id: int, **kwargs) -> Optional[Subject]:
    """更新受试者信息"""
    subject = get_subject(subject_id)
    if not subject:
        return None
    allowed_fields = {
        'name', 'gender', 'age', 'phone', 'skin_type',
        'risk_level', 'source_channel',
    }
    for key, value in kwargs.items():
        if value is not None and key in allowed_fields:
            setattr(subject, key, value)
    subject.save()
    return subject


def delete_subject(subject_id: int) -> bool:
    """软删除受试者"""
    subject = get_subject(subject_id)
    if not subject:
        return False
    subject.is_deleted = True
    subject.save(update_fields=['is_deleted', 'update_time'])
    return True


def change_subject_status(subject_id: int, new_status: str) -> Optional[Subject]:
    """变更受试者状态"""
    subject = get_subject(subject_id)
    if not subject:
        return None
    subject.status = new_status
    subject.save(update_fields=['status', 'update_time'])
    return subject
