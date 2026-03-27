"""
团队负荷服务 (E1)

为研究经理提供团队成员工作负荷和产能分析。
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Any, Optional

from django.db.models import Count

logger = logging.getLogger(__name__)


def get_team_overview(manager_account_id: int) -> List[Dict[str, Any]]:
    """
    获取研究经理团队成员列表及基础信息。

    基于 Protocol.team_members 和 WorkOrder.assigned_to 推断团队成员。
    """
    from apps.identity.models import Account
    from apps.protocol.models import Protocol
    from apps.workorder.models import WorkOrder

    member_ids = set()

    # From protocol team_members
    protocols = Protocol.objects.filter(
        status='active', is_deleted=False,
        created_by_id=manager_account_id,
    )
    for p in protocols:
        if p.team_members:
            for member in p.team_members:
                if isinstance(member, dict) and 'id' in member:
                    member_ids.add(member['id'])

    # From work orders assigned by manager
    assigned_ids = WorkOrder.objects.filter(
        is_deleted=False,
        created_by_id=manager_account_id,
        assigned_to__isnull=False,
    ).values_list('assigned_to', flat=True).distinct()
    member_ids.update(assigned_ids)

    # Include the manager themselves
    member_ids.add(manager_account_id)

    # Get account info
    accounts = Account.objects.filter(id__in=member_ids, is_deleted=False)
    members = []
    for acc in accounts:
        workload = get_member_workload(acc.id)
        members.append({
            'id': acc.id,
            'name': getattr(acc, 'display_name', None) or getattr(acc, 'name', None) or acc.email or f'用户#{acc.id}',
            'avatar': getattr(acc, 'avatar', ''),
            'role': getattr(acc, 'position', '') or '团队成员',
            **workload,
        })

    # Sort by workload descending
    members.sort(key=lambda m: m.get('active_count', 0), reverse=True)
    return members


def get_member_workload(account_id: int) -> Dict[str, Any]:
    """
    统计单个成员的工作负荷。

    返回: active_count, week_completed, overdue_count, load_rate
    """
    from apps.workorder.models import WorkOrder

    today = date.today()
    week_ago = today - timedelta(days=7)

    wo_qs = WorkOrder.objects.filter(
        assigned_to=account_id, is_deleted=False,
    )

    active_count = wo_qs.filter(
        status__in=['assigned', 'in_progress', 'review'],
    ).count()

    week_completed = wo_qs.filter(
        status__in=['completed', 'approved'],
        completed_at__date__gte=week_ago,
    ).count()

    overdue_count = wo_qs.filter(
        due_date__lt=today,
    ).exclude(
        status__in=['completed', 'approved', 'cancelled'],
    ).count()

    # Load rate: active work orders / standard capacity (8 per person)
    standard_capacity = 8
    load_rate = round(active_count / standard_capacity * 100, 1) if standard_capacity > 0 else 0

    return {
        'active_count': active_count,
        'week_completed': week_completed,
        'overdue_count': overdue_count,
        'load_rate': load_rate,
    }


def get_team_capacity(manager_account_id: int,
                      start_date: Optional[date] = None,
                      end_date: Optional[date] = None) -> Dict[str, Any]:
    """团队整体产能和空闲率"""
    from apps.scheduling.models import ScheduleSlot

    if not start_date:
        start_date = date.today()
    if not end_date:
        end_date = start_date + timedelta(days=14)

    members = get_team_overview(manager_account_id)
    member_ids = [m['id'] for m in members]

    # Get scheduled slots per member per day
    slots = ScheduleSlot.objects.filter(
        assigned_to_id__in=member_ids,
        scheduled_date__gte=start_date,
        scheduled_date__lte=end_date,
        status__in=['planned', 'confirmed'],
    ).values('assigned_to_id', 'scheduled_date').annotate(
        slot_count=Count('id'),
    )

    # Build heatmap data
    heatmap = {}
    for slot in slots:
        uid = slot['assigned_to_id']
        d = slot['scheduled_date'].isoformat()
        if uid not in heatmap:
            heatmap[uid] = {}
        heatmap[uid][d] = slot['slot_count']

    total_capacity = len(member_ids) * ((end_date - start_date).days + 1) * 8
    total_scheduled = sum(
        count
        for user_data in heatmap.values()
        for count in user_data.values()
    )
    utilization = round(total_scheduled / total_capacity * 100, 1) if total_capacity > 0 else 0

    return {
        'members': members,
        'heatmap': heatmap,
        'total_members': len(member_ids),
        'utilization_rate': utilization,
        'period': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
    }
