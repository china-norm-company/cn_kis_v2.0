"""
客户服务服务

封装客户档案、商机跟踪、售后工单的业务逻辑。

飞书集成：
- 商机创建/阶段变更时同步到飞书多维表格看板（替代原飞书项目工作项）
"""
import logging
from typing import Optional, List
from datetime import date
from decimal import Decimal
from django.db import IntegrityError

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
def _apply_opportunity_filters(
    qs,
    client_id: int = None,
    stage: str = None,
    stages: list = None,
    owner: str = None,
    owner_id: int = None,
    research_group: str = None,
    research_groups: list = None,
    business_segment: str = None,
    business_segments: list = None,
    key_opportunity: str = None,
):
    if client_id:
        qs = qs.filter(client_id=client_id)
    if stages:
        clean = [s for s in stages if s]
        if clean:
            qs = qs.filter(stage__in=clean)
    elif stage:
        qs = qs.filter(stage=stage)
    if owner_id:
        qs = qs.filter(owner_id=owner_id)
    elif owner:
        qs = qs.filter(owner__icontains=owner)
    if research_groups:
        clean_rg = [x for x in research_groups if x]
        if clean_rg:
            qs = qs.filter(research_group__in=clean_rg)
    elif research_group:
        qs = qs.filter(research_group=research_group)
    if business_segments:
        clean_bs = [x for x in business_segments if x]
        if clean_bs:
            qs = qs.filter(business_segment__in=clean_bs)
    elif business_segment:
        qs = qs.filter(business_segment=business_segment)
    if key_opportunity is not None and str(key_opportunity).strip() != '':
        ko = str(key_opportunity).strip().lower()
        if ko in ('yes', 'true', '1', 'y'):
            qs = qs.filter(key_opportunity=True)
        elif ko in ('no', 'false', '0', 'n'):
            qs = qs.filter(key_opportunity=False)
    return qs


def list_opportunities(
    client_id: int = None,
    stage: str = None,
    stages: list = None,
    owner: str = None,
    owner_id: int = None,
    research_group: str = None,
    research_groups: list = None,
    business_segment: str = None,
    business_segments: list = None,
    key_opportunity: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    qs = Opportunity.objects.filter(is_deleted=False).select_related('client')
    qs = _apply_data_scope(qs, account)
    qs = _apply_opportunity_filters(
        qs,
        client_id=client_id,
        stage=stage,
        stages=stages,
        owner=owner,
        owner_id=owner_id,
        research_group=research_group,
        research_groups=research_groups,
        business_segment=business_segment,
        business_segments=business_segments,
        key_opportunity=key_opportunity,
    )
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


def _max_opportunity_seq_for_year(year: int) -> int:
    """解析商机编号 商机YYYY#### 中的年度序号最大值。"""
    prefix = f'商机{year}'
    best = 0
    qs = Opportunity.objects.filter(code__startswith=prefix).exclude(code__isnull=True).exclude(code='').only('code')
    for o in qs:
        c = o.code or ''
        if len(c) < 10 or not c.startswith('商机'):
            continue
        try:
            y = int(c[2:6])
            s = int(c[6:10])
        except ValueError:
            continue
        if y == year and s > best:
            best = s
    return best


def peek_next_opportunity_code() -> str:
    """预览下一个商机编号（并发下可能与实际落库差 1）。"""
    from django.utils import timezone

    year = timezone.now().year
    nxt = _max_opportunity_seq_for_year(year) + 1
    if nxt > 9999:
        nxt = 9999
    return f'商机{year}{nxt:04d}'


def allocate_opportunity_code() -> str:
    """生成下一个商机编号；并发冲突由调用方重试。"""
    from django.utils import timezone

    year = timezone.now().year
    nxt = _max_opportunity_seq_for_year(year) + 1
    if nxt > 9999:
        raise ValueError('本年度商机编号序号已满（9999）')
    return f'商机{year}{nxt:04d}'


def list_opportunity_owner_candidates(q: str = '', limit: int = 80) -> List[dict]:
    """商务负责人下拉：固定名单顺序；有账号用正 id，无账号用负 id 占位。"""
    from django.db.models import Q
    from apps.crm.opportunity_constants import COMMERCIAL_OWNER_NAME_ORDER
    from apps.identity.models import Account

    items = []
    for i, name in enumerate(COMMERCIAL_OWNER_NAME_ORDER):
        acc = (
            Account.objects.filter(is_deleted=False, status='active')
            .filter(Q(display_name=name) | Q(username=name))
            .order_by('id')
            .first()
        )
        oid = acc.id if acc else -(i + 1)
        items.append(
            {
                'id': oid,
                'display_name': name,
                'username': acc.username if acc else '',
            }
        )
    if q and q.strip():
        kw = q.strip().lower()
        items = [
            x
            for x in items
            if kw in (x.get('display_name') or '').lower()
            or kw in (x.get('username') or '').lower()
        ]
    return items[: max(1, min(limit, 200))]


def resolve_commercial_owner_pick(commercial_owner_id: int) -> tuple:
    """返回 (owner 展示名, owner_id, commercial_owner_name)。支持负 id 占位（名单顺序）。"""
    from django.db.models import Q
    from apps.crm.opportunity_constants import COMMERCIAL_OWNER_NAME_ORDER
    from apps.identity.models import Account

    names = COMMERCIAL_OWNER_NAME_ORDER
    if commercial_owner_id is None:
        raise ValueError('请选择商务负责人')
    if commercial_owner_id > 0:
        acc = Account.objects.filter(id=commercial_owner_id, is_deleted=False).first()
        if not acc:
            raise ValueError('商务负责人不存在')
        nm = acc.display_name or acc.username
        return nm, acc.id, nm
    idx = -commercial_owner_id - 1
    if idx < 0 or idx >= len(names):
        raise ValueError('无效的商务负责人')
    name = names[idx]
    if name == '未确认':
        return '未确认', None, '未确认'
    acc = (
        Account.objects.filter(is_deleted=False, status='active')
        .filter(Q(display_name=name) | Q(username=name))
        .order_by('id')
        .first()
    )
    if acc:
        nm = acc.display_name or acc.username
        return nm, acc.id, name
    return name, None, name


def get_opportunity_form_meta() -> dict:
    from django.utils import timezone
    from apps.crm.opportunity_constants import (
        RESEARCH_GROUPS,
        BUSINESS_SEGMENTS,
        DEMAND_STAGE_OPTIONS,
        SALES_STAGE_OPTIONS,
    )

    return {
        'next_code_preview': peek_next_opportunity_code(),
        'sales_stage_options': SALES_STAGE_OPTIONS,
        'research_groups': RESEARCH_GROUPS,
        'business_segments': BUSINESS_SEGMENTS,
        'demand_stage_options': DEMAND_STAGE_OPTIONS,
        'server_time': timezone.now().isoformat(),
    }


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


def create_opportunity(
    title: str = None,
    client_id: int = None,
    stage: str = 'lead',
    estimated_amount: Decimal = None,
    probability: int = 0,
    owner: str = '',
    owner_id: int = None,
    expected_close_date: date = None,
    planned_start_date: date = None,
    demand_name: str = '',
    sales_amount_total: Decimal = None,
    sales_by_year: dict = None,
    description: str = '',
    remark: str = '',
    demand_version: str = '',
    source_mail_signal_id: int = None,
    commercial_owner_id: int = None,
    commercial_owner_name: str = '',
    research_group: str = '',
    business_segment: str = '',
    business_type: str = '',
    key_opportunity: bool = False,
    client_pm: str = '',
    client_contact_info: str = '',
    client_department_line: str = '',
    is_decision_maker: str = '',
    actual_decision_maker: str = '',
    actual_decision_maker_department_line: str = '',
    actual_decision_maker_level: str = '',
    demand_stages: List[str] = None,
    project_elements: str = '',
    project_detail: dict = None,
    necessity_pct: int = None,
    urgency_pct: int = None,
    uniqueness_pct: int = None,
    cancel_reason: str = '',
    lost_reason: str = '',
    created_by_id: int = None,
) -> Opportunity:
    """创建商机（自动生成商机编号），并同步飞书多维表格 / 编排。"""
    client = Client.objects.filter(id=client_id, is_deleted=False).first()
    if not client:
        raise ValueError('客户不存在')

    resolved_owner = owner or ''
    resolved_owner_id = owner_id
    resolved_commercial_name = commercial_owner_name or ''

    if commercial_owner_id is not None:
        resolved_owner, resolved_owner_id, resolved_commercial_name = resolve_commercial_owner_pick(
            commercial_owner_id
        )

    demand_stages = demand_stages if demand_stages is not None else []

    last_err: Optional[Exception] = None
    for _ in range(25):
        code = allocate_opportunity_code()
        effective_title = (title and str(title).strip()) or f'{code} · {client.name}'
        try:
            opp = Opportunity.objects.create(
                code=code,
                title=effective_title,
                client_id=client_id,
                stage=stage,
                estimated_amount=estimated_amount,
                probability=probability,
                owner=resolved_owner,
                owner_id=resolved_owner_id,
                commercial_owner_name=resolved_commercial_name,
                research_group=research_group or '',
                business_segment=business_segment or '',
                business_type=business_type or '',
                key_opportunity=key_opportunity,
                client_pm=client_pm or '',
                client_contact_info=client_contact_info or '',
                client_department_line=client_department_line or '',
                is_decision_maker=is_decision_maker or '',
                actual_decision_maker=actual_decision_maker or '',
                actual_decision_maker_department_line=actual_decision_maker_department_line or '',
                actual_decision_maker_level=actual_decision_maker_level or '',
                demand_stages=list(demand_stages),
                project_elements=project_elements or '',
                project_detail=dict(project_detail or {}),
                necessity_pct=necessity_pct,
                urgency_pct=urgency_pct,
                uniqueness_pct=uniqueness_pct,
                expected_close_date=expected_close_date,
                planned_start_date=planned_start_date,
                demand_name=demand_name or '',
                sales_amount_total=sales_amount_total,
                sales_by_year=dict(sales_by_year or {}),
                description=description or '',
                remark=remark or '',
                cancel_reason=cancel_reason or '',
                lost_reason=lost_reason or '',
                demand_version=demand_version or '',
                source_mail_signal_id=source_mail_signal_id,
                created_by_id=created_by_id,
            )
            _sync_opportunity_to_bitable(opp)
            _trigger_orchestration_if_needed(opp, stage)
            return opp
        except IntegrityError as e:
            last_err = e
            continue
    if last_err:
        raise ValueError('商机编号占用冲突，请重试一次') from last_err
    raise RuntimeError('商机编号分配失败，请重试')


def update_opportunity(opp_id: int, **kwargs) -> Optional[Opportunity]:
    """更新商机并同步飞书多维表格，阶段变为 evaluation/proposal 时触发编排"""
    from apps.identity.models import Account

    o = get_opportunity(opp_id)
    if not o:
        return None
    old_stage = o.stage

    if 'client_id' in kwargs:
        cid = kwargs.get('client_id')
        if cid is not None:
            client = Client.objects.filter(id=cid, is_deleted=False).first()
            if not client:
                raise ValueError('客户不存在')

    if 'commercial_owner_id' in kwargs:
        cid_owner = kwargs.pop('commercial_owner_id', None)
        if cid_owner is not None:
            ow, ow_id, cname = resolve_commercial_owner_pick(cid_owner)
            kwargs['owner'] = ow
            kwargs['owner_id'] = ow_id
            kwargs['commercial_owner_name'] = cname

    if 'sales_amount_total' in kwargs and kwargs.get('sales_amount_total') is not None:
        from decimal import Decimal as D
        old_v = o.sales_amount_total
        new_v = kwargs['sales_amount_total']
        d_new = D(str(new_v))
        d_old = D(str(old_v)) if old_v is not None else D('0')
        kwargs['sales_amount_change'] = d_new - d_old

    field_names = {f.name for f in Opportunity._meta.concrete_fields}
    for k, v in kwargs.items():
        if k not in field_names:
            continue
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


def get_opportunity_stats(
    account=None,
    client_id: int = None,
    stage: str = None,
    stages: list = None,
    owner: str = None,
    owner_id: int = None,
    research_group: str = None,
    research_groups: list = None,
    business_segment: str = None,
    business_segments: list = None,
    key_opportunity: str = None,
) -> dict:
    """商机列表/驾驶舱统计：按阶段计数、储备商机（阶段=deal 的预估金额）、本年与次年分年度销售额（sales_by_year）。"""
    from django.db.models import Count, Sum
    from django.utils import timezone as dj_tz

    qs = Opportunity.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    qs = _apply_opportunity_filters(
        qs,
        client_id=client_id,
        stage=stage,
        stages=stages,
        owner=owner,
        owner_id=owner_id,
        research_group=research_group,
        research_groups=research_groups,
        business_segment=business_segment,
        business_segments=business_segments,
        key_opportunity=key_opportunity,
    )

    by_stage = qs.values('stage').annotate(count=Count('id'))
    by_stage_dict = {item['stage']: item['count'] for item in by_stage}
    total_count = qs.count()

    reserve_amount = qs.filter(stage='deal').aggregate(total=Sum('estimated_amount'))['total'] or 0
    reserve_amount = float(reserve_amount)

    y = dj_tz.now().year
    cy_key = str(y)
    ny_key = str(y + 1)
    sales_cy = Decimal('0')
    sales_ny = Decimal('0')
    for o in qs.only('sales_by_year'):
        d = o.sales_by_year
        if not isinstance(d, dict):
            continue
        if cy_key in d and d[cy_key] not in (None, ''):
            try:
                sales_cy += Decimal(str(d[cy_key]))
            except Exception:
                pass
        if ny_key in d and d[ny_key] not in (None, ''):
            try:
                sales_ny += Decimal(str(d[ny_key]))
            except Exception:
                pass

    return {
        'by_stage': by_stage_dict,
        'total': total_count,
        'reserve_amount': reserve_amount,
        'pipeline_value': reserve_amount,
        'stats_year': y,
        'stats_next_year': y + 1,
        'sales_current_year': float(sales_cy),
        'sales_next_year': float(sales_ny),
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
