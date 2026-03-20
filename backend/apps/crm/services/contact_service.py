"""
关键联系人管理服务

管理者在进思定义关键人矩阵和关系策略；
研究经理在采苓记录沟通时选择联系人，系统自动更新 last_contact_date。
"""
import logging
from datetime import date, timedelta
from typing import Optional, List

from django.db.models import F, Q
from django.utils import timezone

from apps.crm.models import ClientContact, ClientOrgMap, Client

logger = logging.getLogger(__name__)


def list_contacts(client_id: int) -> List[ClientContact]:
    return list(
        ClientContact.objects.filter(client_id=client_id, is_deleted=False)
        .order_by('role_type', 'name')
    )


def get_contact(contact_id: int) -> Optional[ClientContact]:
    return ClientContact.objects.filter(id=contact_id, is_deleted=False).first()


def create_contact(client_id: int, **kwargs) -> ClientContact:
    return ClientContact.objects.create(client_id=client_id, **kwargs)


def update_contact(contact_id: int, **kwargs) -> Optional[ClientContact]:
    c = get_contact(contact_id)
    if not c:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(c, k):
            setattr(c, k, v)
    c.save()
    return c


def delete_contact(contact_id: int) -> bool:
    c = get_contact(contact_id)
    if not c:
        return False
    c.is_deleted = True
    c.save(update_fields=['is_deleted', 'update_time'])
    return True


def record_contact(contact_id: int) -> Optional[ClientContact]:
    """记录一次联系（更新 last_contact_date 为今天）"""
    c = get_contact(contact_id)
    if not c:
        return None
    c.last_contact_date = date.today()
    c.save(update_fields=['last_contact_date', 'update_time'])
    return c


def get_overdue_contacts(days_threshold: int = 0) -> list:
    """
    获取超期未联系的关键人列表。

    如果 days_threshold > 0，返回超过该天数未联系的；
    否则按每个联系人自身的 contact_frequency_days 判断。
    """
    today = date.today()
    qs = ClientContact.objects.filter(
        is_deleted=False, client__is_deleted=False,
    ).select_related('client')

    if days_threshold > 0:
        cutoff = today - timedelta(days=days_threshold)
        qs = qs.filter(
            Q(last_contact_date__lt=cutoff) | Q(last_contact_date__isnull=True)
        )
    else:
        results = []
        for contact in qs:
            if contact.last_contact_date is None:
                results.append(contact)
            else:
                days_since = (today - contact.last_contact_date).days
                if days_since > contact.contact_frequency_days:
                    results.append(contact)
        return results

    return list(qs.order_by('last_contact_date'))


def get_org_map(client_id: int) -> Optional[dict]:
    org = ClientOrgMap.objects.filter(client_id=client_id).first()
    if not org:
        return None
    return {
        'id': org.id,
        'client_id': org.client_id,
        'org_structure': org.org_structure,
        'decision_chain': org.decision_chain,
        'budget_authority': org.budget_authority,
        'update_time': org.update_time.isoformat(),
    }


def update_org_map(client_id: int, **kwargs) -> dict:
    org, created = ClientOrgMap.objects.update_or_create(
        client_id=client_id, defaults=kwargs,
    )
    return {
        'id': org.id,
        'client_id': org.client_id,
        'org_structure': org.org_structure,
        'decision_chain': org.decision_chain,
        'budget_authority': org.budget_authority,
        'update_time': org.update_time.isoformat(),
    }
