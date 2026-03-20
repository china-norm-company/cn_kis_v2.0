from django.db.models import Q, IntegerField
from django.db.models.functions import Coalesce
from django.db.models import F


def filter_by_assignee(qs, account_id: int):
    """双轨兼容：按执行人过滤工单。"""
    return qs.filter(
        Q(assigned_to_account_id=account_id) | Q(assigned_to=account_id)
    )


def filter_unassigned(qs):
    """双轨兼容：筛选未分配工单。"""
    return qs.filter(
        Q(assigned_to_account_id__isnull=True) & Q(assigned_to__isnull=True)
    )


def annotate_effective_assignee(qs, field_name: str = 'effective_assignee'):
    """为聚合统计注入统一执行人字段。"""
    return qs.annotate(
        **{
            field_name: Coalesce(
                F('assigned_to_account_id'),
                F('assigned_to'),
                output_field=IntegerField(),
            )
        }
    )
