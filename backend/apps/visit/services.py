"""
访视管理服务

封装访视计划、节点、活动的 CRUD 与状态管理。

飞书集成：
- 创建/更新访视节点时同步到飞书日历（对应 FEISHU_NATIVE_SETUP.md 5.1）
"""
import os
import logging
from typing import Optional, List
from django.db import transaction

from .models import (
    VisitPlan, VisitPlanStatus,
    VisitNode,
    VisitActivity, ActivityType,
)

logger = logging.getLogger(__name__)

FEISHU_CALENDAR_VISIT_ID = os.getenv('FEISHU_CALENDAR_VISIT_ID', '')


# ============================================================================
# 访视计划
# ============================================================================
def _apply_data_scope(qs, account=None):
    """应用数据权限过滤（若提供 account）；DEBUG 模式下跳过，与项目全链路权限一致"""
    if account is None:
        return qs
    from django.conf import settings
    if getattr(settings, 'DEBUG', False):
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account)


def list_visit_plans(
    protocol_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    """分页查询访视计划（支持按数据权限过滤）；DEBUG 模式下与项目全链路一致，不过滤"""
    qs = VisitPlan.objects.filter(is_deleted=False)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    if account:
        qs = _apply_data_scope(qs, account)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_visit_plan(plan_id: int) -> Optional[VisitPlan]:
    """获取访视计划详情（含节点列表）"""
    return VisitPlan.objects.filter(id=plan_id, is_deleted=False).first()


def get_plan_with_nodes(plan_id: int) -> Optional[dict]:
    """获取访视计划详情（含节点和活动）"""
    plan = get_visit_plan(plan_id)
    if not plan:
        return None
    nodes = list(
        plan.nodes.all()
        .prefetch_related('activities')
        .order_by('order', 'baseline_day')
    )
    return {'plan': plan, 'nodes': nodes}


@transaction.atomic
def create_visit_plan(
    protocol_id: int,
    name: str,
    description: str = '',
    account=None,
) -> VisitPlan:
    """创建访视计划"""
    kw = dict(protocol_id=protocol_id, name=name, description=description)
    if account:
        kw['created_by_id'] = account.id
    return VisitPlan.objects.create(**kw)


def update_visit_plan(plan_id: int, **kwargs) -> Optional[VisitPlan]:
    """更新访视计划"""
    plan = get_visit_plan(plan_id)
    if not plan:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(plan, key):
            setattr(plan, key, value)
    plan.save()
    return plan


def delete_visit_plan(plan_id: int) -> bool:
    """软删除访视计划"""
    plan = get_visit_plan(plan_id)
    if not plan:
        return False
    plan.is_deleted = True
    plan.save(update_fields=['is_deleted', 'update_time'])
    return True


def activate_visit_plan(plan_id: int) -> Optional[VisitPlan]:
    """激活访视计划"""
    plan = get_visit_plan(plan_id)
    if not plan:
        return None
    if plan.status == VisitPlanStatus.DRAFT:
        plan.status = VisitPlanStatus.ACTIVE
        plan.save(update_fields=['status', 'update_time'])
    return plan


# ============================================================================
# 访视节点
# ============================================================================
def list_visit_nodes(
    plan_id: int = None,
    status: str = None,
    account=None,
) -> list:
    """查询访视节点列表（支持按数据权限过滤）；DEBUG 模式下与项目全链路一致，不过滤"""
    qs = VisitNode.objects.all()
    if plan_id:
        if account:
            allowed_plans_qs = _apply_data_scope(
                VisitPlan.objects.filter(is_deleted=False), account
            )
            allowed_plan_ids = set(allowed_plans_qs.values_list('id', flat=True))
            if plan_id not in allowed_plan_ids:
                return []
        qs = qs.filter(plan_id=plan_id)
    else:
        if account:
            allowed_plans_qs = _apply_data_scope(
                VisitPlan.objects.filter(is_deleted=False), account
            )
            allowed_plan_ids = list(allowed_plans_qs.values_list('id', flat=True))
            if not allowed_plan_ids:
                return []
            qs = qs.filter(plan_id__in=allowed_plan_ids)
    if status:
        qs = qs.filter(status=status)
    return list(qs.order_by('order', 'baseline_day'))


def _sync_node_to_calendar(node: VisitNode, subject_code: str = '') -> None:
    """
    同步访视节点到飞书日历

    对应 FEISHU_NATIVE_SETUP.md 5.1：访视排程日历
    包含：受试者编号、访视名称、时间窗口
    """
    if not FEISHU_CALENDAR_VISIT_ID:
        return

    try:
        from libs.feishu_client import feishu_client
        import time

        # 用基线天数计算日历事件时间（相对今天）
        now = int(time.time())
        day_seconds = 86400
        start = now + node.baseline_day * day_seconds
        end = start + day_seconds  # 默认 1 天

        summary = f"[访视] {node.name}"
        if subject_code:
            summary = f"[访视] {subject_code} - {node.name}"

        description = (
            f"访视节点: {node.name}\n"
            f"基线天数: Day {node.baseline_day}\n"
            f"窗口期: -{node.window_before} ~ +{node.window_after} 天"
        )

        if node.feishu_event_id:
            # 更新已有事件
            feishu_client.update_calendar_event(
                calendar_id=FEISHU_CALENDAR_VISIT_ID,
                event_id=node.feishu_event_id,
                summary=summary,
                start_time=start,
                end_time=end,
                description=description,
            )
            logger.info(f"访视节点#{node.id} 日历事件已更新")
        else:
            # 创建新事件
            data = feishu_client.create_calendar_event(
                calendar_id=FEISHU_CALENDAR_VISIT_ID,
                summary=summary,
                start_time=start,
                end_time=end,
                description=description,
            )
            event_id = data.get('event', {}).get('event_id', '')
            if event_id:
                node.feishu_event_id = event_id
                node.save(update_fields=['feishu_event_id'])
                logger.info(f"访视节点#{node.id} 日历事件已创建: {event_id}")
    except Exception as e:
        logger.error(f"访视节点#{node.id} 日历同步失败: {e}")


def create_visit_node(
    plan_id: int,
    name: str,
    baseline_day: int = 0,
    window_before: int = 0,
    window_after: int = 0,
    order: int = 0,
) -> VisitNode:
    """创建访视节点并同步到飞书日历"""
    node = VisitNode.objects.create(
        plan_id=plan_id,
        name=name,
        baseline_day=baseline_day,
        window_before=window_before,
        window_after=window_after,
        order=order,
    )
    # 飞书日历同步
    _sync_node_to_calendar(node)
    return node


@transaction.atomic
def batch_create_nodes(plan_id: int, nodes_data: List[dict]) -> list:
    """批量创建访视节点"""
    nodes = []
    for idx, nd in enumerate(nodes_data):
        node = VisitNode(
            plan_id=plan_id,
            name=nd['name'],
            baseline_day=nd.get('baseline_day', 0),
            window_before=nd.get('window_before', 0),
            window_after=nd.get('window_after', 0),
            order=nd.get('order', idx),
        )
        nodes.append(node)
    return VisitNode.objects.bulk_create(nodes)


def update_visit_node(node_id: int, **kwargs) -> Optional[VisitNode]:
    """更新访视节点并同步飞书日历"""
    node = VisitNode.objects.filter(id=node_id).first()
    if not node:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(node, key):
            setattr(node, key, value)
    node.save()
    # 飞书日历同步更新
    _sync_node_to_calendar(node)
    return node


# ============================================================================
# 访视活动
# ============================================================================
def list_activities(node_id: int) -> list:
    """查询节点下的活动列表"""
    return list(VisitActivity.objects.filter(node_id=node_id).order_by('order'))


def create_activity(
    node_id: int,
    name: str,
    activity_type: str = ActivityType.OTHER,
    description: str = '',
    is_required: bool = True,
    order: int = 0,
) -> VisitActivity:
    """创建访视活动"""
    return VisitActivity.objects.create(
        node_id=node_id,
        name=name,
        activity_type=activity_type,
        description=description,
        is_required=is_required,
        order=order,
    )
