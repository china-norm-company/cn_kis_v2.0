"""
法规跟踪服务
"""
import logging
from typing import Optional
from django.utils import timezone

from apps.ethics.models_regulation import Regulation

logger = logging.getLogger(__name__)


def create_regulation(
    title: str,
    regulation_type: str,
    publish_date=None,
    effective_date=None,
    issuing_authority: str = '',
    document_number: str = '',
    summary: str = '',
    key_requirements: str = '',
    impact_level: str = 'medium',
    affected_areas: list = None,
    impact_analysis: str = '',
    action_items: str = '',
    action_deadline=None,
    created_by_id: int = None,
) -> Regulation:
    return Regulation.objects.create(
        title=title,
        regulation_type=regulation_type,
        publish_date=publish_date,
        effective_date=effective_date,
        issuing_authority=issuing_authority,
        document_number=document_number,
        summary=summary,
        key_requirements=key_requirements,
        impact_level=impact_level,
        affected_areas=affected_areas or [],
        impact_analysis=impact_analysis,
        action_items=action_items,
        action_deadline=action_deadline,
        created_by_id=created_by_id,
    )


def get_regulation(regulation_id: int) -> Optional[Regulation]:
    return Regulation.objects.filter(id=regulation_id).first()


def list_regulations(
    regulation_type: str = None,
    status: str = None,
    impact_level: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = Regulation.objects.all()
    if regulation_type:
        qs = qs.filter(regulation_type=regulation_type)
    if status:
        qs = qs.filter(status=status)
    if impact_level:
        qs = qs.filter(impact_level=impact_level)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


def update_regulation(regulation_id: int, **kwargs) -> Optional[Regulation]:
    regulation = get_regulation(regulation_id)
    if not regulation:
        return None
    for field, value in kwargs.items():
        if hasattr(regulation, field) and value is not None:
            setattr(regulation, field, value)
    regulation.save()
    return regulation
