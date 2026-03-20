"""
监管沟通服务
"""
import logging
from typing import Optional
from django.utils import timezone

from apps.ethics.models_correspondence import (
    RegulatoryCorrespondence, CorrespondenceStatus,
)

logger = logging.getLogger(__name__)


def _generate_correspondence_no() -> str:
    now = timezone.now()
    prefix = f'RC-{now.strftime("%Y%m%d")}'
    count = RegulatoryCorrespondence.objects.filter(
        correspondence_no__startswith=prefix
    ).count()
    return f'{prefix}-{count + 1:03d}'


def create_correspondence(
    direction: str,
    subject: str,
    content: str = '',
    counterpart: str = '',
    contact_person: str = '',
    correspondence_date=None,
    reply_deadline=None,
    parent_id: int = None,
    protocol_id: int = None,
    attachment_urls: list = None,
    created_by_id: int = None,
) -> RegulatoryCorrespondence:
    corr = RegulatoryCorrespondence.objects.create(
        correspondence_no=_generate_correspondence_no(),
        direction=direction,
        subject=subject,
        content=content,
        counterpart=counterpart,
        contact_person=contact_person,
        correspondence_date=correspondence_date or timezone.now().date(),
        reply_deadline=reply_deadline,
        parent_id=parent_id,
        protocol_id=protocol_id,
        attachment_urls=attachment_urls or [],
        created_by_id=created_by_id,
    )

    if parent_id:
        try:
            parent = RegulatoryCorrespondence.objects.get(id=parent_id)
            parent.status = CorrespondenceStatus.REPLIED
            parent.save(update_fields=['status', 'update_time'])
        except RegulatoryCorrespondence.DoesNotExist:
            pass

    return corr


def list_correspondences(
    direction: str = None,
    status: str = None,
    protocol_id: int = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = RegulatoryCorrespondence.objects.all()
    if direction:
        qs = qs.filter(direction=direction)
    if status:
        qs = qs.filter(status=status)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


def get_correspondence(corr_id: int) -> Optional[RegulatoryCorrespondence]:
    return RegulatoryCorrespondence.objects.filter(id=corr_id).first()
