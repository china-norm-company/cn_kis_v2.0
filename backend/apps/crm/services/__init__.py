"""
客户服务服务

封装客户档案、商机跟踪、售后工单的业务逻辑。

飞书集成：
- 商机创建/阶段变更时同步到飞书多维表格看板（替代原飞书项目工作项）
"""
import logging
from typing import Optional
from datetime import date
from decimal import Decimal
from apps.crm.models import Client, Opportunity, Ticket

logger = logging.getLogger(__name__)


def _apply_data_scope(qs, account=None):
    """应用数据权限过滤（若提供 account）"""
    if account is None:
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account)


# ============================================================================
# 客户管理
# ============================================================================
def list_clients(
    level: str = None,
    industry: str = None,
    company_type: str = None,
    partnership_tier: str = None,
    keyword: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    qs = Client.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if level:
        qs = qs.filter(level=level)
    if industry:
        qs = qs.filter(industry__icontains=industry)
    if company_type:
        qs = qs.filter(company_type=company_type)
    if partnership_tier:
        qs = qs.filter(partnership_tier=partnership_tier)
    if keyword:
        from django.db.models import Q
        qs = qs.filter(Q(name__icontains=keyword) | Q(short_name__icontains=keyword))
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_client(client_id: int) -> Optional[Client]:
    return Client.objects.filter(id=client_id, is_deleted=False).first()


def create_client(**kwargs) -> Client:
    return Client.objects.create(**kwargs)


def update_client(client_id: int, **kwargs) -> Optional[Client]:
    c = get_client(client_id)
    if not c:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(c, k):
            setattr(c, k, v)
    c.save()
    return c


def delete_client(client_id: int) -> bool:
    c = get_client(client_id)
    if not c:
        return False
    c.is_deleted = True
    c.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_client_stats() -> dict:
    from django.db.models import Count, Sum
    qs = Client.objects.filter(is_deleted=False)
    by_level = qs.values('level').annotate(count=Count('id'))
    total_revenue = qs.aggregate(total=Sum('total_revenue'))['total'] or 0
    return {
        'by_level': {item['level']: item['count'] for item in by_level},
        'total': qs.count(),
        'total_revenue': float(total_revenue),
    }


# ============================================================================
# 商机管理
# ============================================================================
def list_opportunities(
    client_id: int = None,
    stage: str = None,
    owner: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    qs = Opportunity.objects.filter(is_deleted=False).select_related('client')
    qs = _apply_data_scope(qs, account)
    if client_id:
        qs = qs.filter(client_id=client_id)
    if stage:
        qs = qs.filter(stage=stage)
    if owner:
        qs = qs.filter(owner__icontains=owner)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_opportunity(opp_id: int) -> Optional[Opportunity]:
    return Opportunity.objects.filter(id=opp_id, is_deleted=False).select_related('client').first()


def _sync_opportunity_to_bitable(opp: Opportunity) -> None:
    """
    同步商机状态到飞书多维表格看板

    替代原飞书项目工作项同步。通过 feishu_sync 的 SyncConfig 查找
    t_opportunity 表对应的多维表格配置，将单条商机记录同步过去。
    如未配置则静默跳过。
    """
    try:
        from apps.feishu_sync.models import SyncConfig
        config = SyncConfig.objects.filter(
            table_name='t_opportunity', enabled=True
        ).first()
        if not config:
            return

        from libs.feishu_client import feishu_client

        fields = {}
        for db_field, feishu_field_id in config.field_mapping.items():
            value = getattr(opp, db_field, None)
            if value is not None:
                fields[feishu_field_id] = str(value)

        if not fields:
            return

        feishu_client.upsert_bitable_record(
            app_token=config.bitable_app_token,
            table_id=config.bitable_table_id,
            fields=fields,
        )
        logger.info(f"商机#{opp.id} 已同步到飞书多维表格")
    except Exception as e:
        logger.error(f"商机#{opp.id} 多维表格同步失败: {e}")


_ORCHESTRATION_TRIGGER_STAGES = {'evaluation', 'proposal'}


def _trigger_orchestration_if_needed(opp: Opportunity, stage: str) -> None:
    """当商机进入 evaluation 或 proposal 阶段时，自动触发数字员工编排。"""
    if stage not in _ORCHESTRATION_TRIGGER_STAGES:
        return
    try:
        from apps.secretary.orchestration_service import trigger_orchestration_run
        trigger_orchestration_run(
            trigger_source='crm_opportunity',
            trigger_ref=f'opportunity:{opp.id}',
            context={
                'opportunity_id': opp.id,
                'title': opp.title,
                'client_id': opp.client_id,
                'stage': stage,
                'demand_version': opp.demand_version or '',
            },
        )
        logger.info('Orchestration triggered for opportunity #%s stage=%s', opp.id, stage)
    except Exception as e:
        logger.warning('Orchestration trigger failed for opportunity #%s: %s', opp.id, e)


def create_opportunity(title: str, client_id: int, stage: str = 'lead',
                       estimated_amount: Decimal = None, probability: int = 0,
                       owner: str = '', expected_close_date: date = None,
                       description: str = '',
                       demand_version: str = '',
                       source_mail_signal_id: int = None) -> Opportunity:
    """创建商机并同步到飞书多维表格，evaluation/proposal 阶段自动触发编排"""
    opp = Opportunity.objects.create(
        title=title, client_id=client_id, stage=stage,
        estimated_amount=estimated_amount, probability=probability,
        owner=owner, expected_close_date=expected_close_date,
        description=description, demand_version=demand_version,
        source_mail_signal_id=source_mail_signal_id,
    )
    _sync_opportunity_to_bitable(opp)
    _trigger_orchestration_if_needed(opp, stage)
    return opp


def update_opportunity(opp_id: int, **kwargs) -> Optional[Opportunity]:
    """更新商机并同步飞书多维表格，阶段变为 evaluation/proposal 时触发编排"""
    o = get_opportunity(opp_id)
    if not o:
        return None
    old_stage = o.stage
    for k, v in kwargs.items():
        if v is not None and hasattr(o, k):
            setattr(o, k, v)
    o.save()
    new_stage = kwargs.get('stage')
    if new_stage:
        _sync_opportunity_to_bitable(o)
        if new_stage != old_stage:
            _trigger_orchestration_if_needed(o, new_stage)
    return o


def delete_opportunity(opp_id: int) -> bool:
    o = get_opportunity(opp_id)
    if not o:
        return False
    o.is_deleted = True
    o.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_opportunity_stats() -> dict:
    from django.db.models import Count, Sum
    qs = Opportunity.objects.filter(is_deleted=False)
    by_stage = qs.values('stage').annotate(count=Count('id'))
    pipeline_value = qs.exclude(stage__in=['won', 'lost']).aggregate(total=Sum('estimated_amount'))['total'] or 0
    return {
        'by_stage': {item['stage']: item['count'] for item in by_stage},
        'total': qs.count(),
        'pipeline_value': float(pipeline_value),
    }


# ============================================================================
# 售后工单
# ============================================================================
def list_tickets(
    client_id: int = None,
    status: str = None,
    priority: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    qs = Ticket.objects.filter(is_deleted=False).select_related('client')
    qs = _apply_data_scope(qs, account)
    if client_id:
        qs = qs.filter(client_id=client_id)
    if status:
        qs = qs.filter(status=status)
    if priority:
        qs = qs.filter(priority=priority)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_ticket(ticket_id: int) -> Optional[Ticket]:
    return Ticket.objects.filter(id=ticket_id, is_deleted=False).select_related('client').first()


def create_ticket(code: str, title: str, client_id: int, category: str,
                  priority: str = 'medium', description: str = '',
                  assignee: str = '') -> Ticket:
    return Ticket.objects.create(
        code=code, title=title, client_id=client_id, category=category,
        priority=priority, description=description, assignee=assignee,
    )


def update_ticket(ticket_id: int, **kwargs) -> Optional[Ticket]:
    t = get_ticket(ticket_id)
    if not t:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(t, k):
            setattr(t, k, v)
    t.save()
    return t


def delete_ticket(ticket_id: int) -> bool:
    t = get_ticket(ticket_id)
    if not t:
        return False
    t.is_deleted = True
    t.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_ticket_stats() -> dict:
    from django.db.models import Count
    qs = Ticket.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    by_priority = qs.values('priority').annotate(count=Count('id'))
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'by_priority': {item['priority']: item['count'] for item in by_priority},
        'total': qs.count(),
    }
