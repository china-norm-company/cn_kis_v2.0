"""
入组管理服务

包含：入组记录查询、受试者入组、入组状态更新。
飞书集成：入组成功后触发 AnyCross Webhook。
"""
import logging
from typing import Optional
from django.utils import timezone
from django.db import transaction

from ..models import (
    Subject, SubjectStatus,
    Enrollment, EnrollmentStatus,
)

logger = logging.getLogger(__name__)


def list_enrollments(
    subject_id: int = None,
    protocol_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 50,
    account=None,
) -> dict:
    """查询入组记录（支持按数据权限过滤）"""
    from apps.identity.filters import filter_queryset_by_scope

    qs = Enrollment.objects.select_related('subject', 'protocol').all()
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    if account:
        qs = filter_queryset_by_scope(qs, account)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


@transaction.atomic
def enroll_subject(subject_id: int, protocol_id: int, account=None) -> Enrollment:
    """
    受试者入组

    飞书集成：入组成功后触发 AnyCross Webhook（FEISHU_NATIVE_SETUP.md 6.x），
    由 AnyCross 完成后续流程（写入多维表格、发送通知等）。
    """
    defaults = {'status': EnrollmentStatus.PENDING}
    if account:
        defaults['created_by_id'] = account.id
    enrollment, created = Enrollment.objects.get_or_create(
        subject_id=subject_id,
        protocol_id=protocol_id,
        defaults=defaults,
    )
    if created:
        Subject.objects.filter(id=subject_id).update(
            status=SubjectStatus.ENROLLED,
            update_time=timezone.now(),
        )
        try:
            from apps.feishu_sync.services import trigger_anycross_webhook
            subject = Subject.objects.filter(id=subject_id).first()
            trigger_anycross_webhook('subject_enrolled', {
                'enrollment_id': enrollment.id,
                'subject_id': subject_id,
                'subject_name': subject.name if subject else '',
                'protocol_id': protocol_id,
                'enrolled_at': timezone.now().isoformat(),
            })
        except Exception as e:
            logger.error(f"入组 AnyCross Webhook 触发失败: {e}")
    return enrollment


def update_enrollment_status(enrollment_id: int, new_status: str) -> Optional[Enrollment]:
    """更新入组状态"""
    enrollment = Enrollment.objects.filter(id=enrollment_id).first()
    if not enrollment:
        return None
    enrollment.status = new_status
    if new_status == EnrollmentStatus.ENROLLED:
        enrollment.enrolled_at = timezone.now()
    enrollment.save()
    return enrollment
