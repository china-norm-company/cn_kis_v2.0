"""
项目监察（协议维度）

执行周期起止：优先存库字段，创建时从 protocol.parsed_data 解析，缺省为协议创建日。
监察状态：待计划 / 异常 / 待执行 / 已完成
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from dateutil.relativedelta import relativedelta
from django.db.models import Q, F
from django.utils import timezone

from apps.protocol.models import Protocol
from apps.protocol.services.protocol_service import _apply_data_scope
from apps.quality.models import ProtocolProjectSupervision, QualityProjectRegistry


def _parse_date_str(s: Any) -> Optional[date]:
    if not s or not isinstance(s, str):
        return None
    s = s.strip()[:10]
    if len(s) < 10:
        return None
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except ValueError:
        return None


def derive_execution_dates(protocol: Protocol) -> Tuple[Optional[date], Optional[date]]:
    """从协议解析数据或创建时间推断执行周期起止。"""
    pd = protocol.parsed_data if isinstance(protocol.parsed_data, dict) else {}
    start: Optional[date] = None
    end: Optional[date] = None

    for key in ('execution_start', 'study_start', 'trial_start', 'screening_start', 'first_visit_date'):
        start = _parse_date_str(pd.get(key))
        if start:
            break
    if start is None and isinstance(pd.get('visits'), list) and len(pd['visits']) > 0:
        v0 = pd['visits'][0]
        if isinstance(v0, dict):
            start = _parse_date_str(v0.get('date') or v0.get('window_start') or v0.get('planned_date'))

    if start is None and protocol.create_time:
        start = protocol.create_time.date()

    for key in ('execution_end', 'study_end', 'trial_end', 'last_visit_date'):
        end = _parse_date_str(pd.get(key))
        if end:
            break
    if end is None and isinstance(pd.get('visits'), list) and len(pd['visits']) > 1:
        v_last = pd['visits'][-1]
        if isinstance(v_last, dict):
            end = _parse_date_str(v_last.get('date') or v_last.get('window_end') or v_last.get('planned_date'))

    return start, end


def compute_supervision_status(sup: ProtocolProjectSupervision) -> str:
    """
    pending_plan: 待计划 — 尚未提交监察计划，且未触发「异常」条件
    abnormal: 异常 — 已超过执行结束日仍未提交监察计划
    pending_execution: 待执行 — 已提交计划，尚未提交实际监察
    completed: 已完成 — 已提交实际监察
    """
    today = timezone.now().date()
    if sup.actual_submitted_at is not None:
        return 'completed'
    if sup.plan_submitted_at is not None:
        return 'pending_execution'
    if sup.execution_end_date is not None and today > sup.execution_end_date:
        return 'abnormal'
    return 'pending_plan'


STATUS_LABEL = {
    'pending_plan': '待计划',
    'abnormal': '异常',
    'pending_execution': '待执行',
    'completed': '已完成',
}


def ensure_supervision_row(protocol: Protocol) -> ProtocolProjectSupervision:
    """为协议创建或补齐监察行，并写入解析得到的执行周期（仅新建时填充日期）。"""
    start, end = derive_execution_dates(protocol)
    obj, created = ProtocolProjectSupervision.objects.get_or_create(
        protocol=protocol,
        defaults={
            'execution_start_date': start,
            'execution_end_date': end,
        },
    )
    if created:
        return obj
    # 与协议解析/录入数据保持同步：derive 结果变化时更新监察表日期
    changed = False
    if start is not None and obj.execution_start_date != start:
        obj.execution_start_date = start
        changed = True
    if end is not None and obj.execution_end_date != end:
        obj.execution_end_date = end
        changed = True
    if changed:
        obj.save(update_fields=['execution_start_date', 'execution_end_date', 'update_time'])
    return obj


def enrich_protocol_display(protocol: Protocol) -> Dict[str, str]:
    """与质量台原项目监察页一致的展示字段（来自 parsed_data / team_members）。"""
    pd = protocol.parsed_data if isinstance(protocol.parsed_data, dict) else {}
    group = '—'
    g = pd.get('study_arms') or pd.get('arms') or pd.get('groups') or pd.get('组别') or pd.get('group_label') or pd.get('arm')
    if isinstance(g, str) and g.strip():
        group = g.strip()
    elif isinstance(g, list) and g:
        parts = []
        for x in g:
            if isinstance(x, dict) and x.get('name'):
                parts.append(str(x['name']))
            else:
                parts.append(str(x))
        group = '；'.join(parts) if parts else '—'

    backup = '—'
    b = pd.get('backup_sample_size') or pd.get('spare_samples') or pd.get('备份样本量') or pd.get('backup_samples')
    if b is not None and str(b).strip():
        backup = str(b)

    visits = '—'
    if isinstance(pd.get('visits'), list) and pd['visits']:
        vis = pd['visits'][:12]
        parts = []
        for v in vis:
            if isinstance(v, dict):
                parts.append(str(v.get('name') or v.get('visit_name') or v.get('timepoint') or v.get('label') or v.get('window') or '·'))
            else:
                parts.append(str(v))
        visits = '；'.join([p for p in parts if p]) or '—'
        if len(pd['visits']) > 12:
            visits += '…'

    period = '—'
    dur = pd.get('study_duration') or pd.get('execution_period') or pd.get('执行周期') or pd.get('trial_duration')
    if isinstance(dur, str) and dur.strip():
        period = dur.strip()
    elif isinstance(pd.get('visits'), list) and len(pd['visits']) > 1:
        first = pd['visits'][0]
        last = pd['visits'][-1]
        if isinstance(first, dict) and isinstance(last, dict):
            a = first.get('day') or first.get('visit_name')
            b_ = last.get('day') or last.get('visit_name')
            if a is not None and b_ is not None:
                period = f'{a} → {b_}'

    researcher = '—'
    tm = getattr(protocol, 'team_members', None) or []
    if isinstance(tm, list) and tm:
        pi = next(
            (
                m
                for m in tm
                if isinstance(m, dict)
                and m.get('role')
                and re.search(r'主要|PI|研究者|研究员', str(m.get('role')))
            ),
            None,
        )
        if pi:
            researcher = str(pi.get('name') or '—')
        else:
            researcher = str(tm[0].get('name') if isinstance(tm[0], dict) else '—')
    else:
        inv = pd.get('principal_investigator') or pd.get('pi') or pd.get('investigator') or pd.get('主要研究者')
        if isinstance(inv, str) and inv.strip():
            researcher = inv.strip()

    return {
        'group_label': group,
        'backup_label': backup,
        'visits_label': visits,
        'period_label': period,
        'researcher_label': researcher,
        'sample_size': str(protocol.sample_size) if protocol.sample_size is not None else '—',
    }


def _supervision_to_item(protocol: Protocol, sup: ProtocolProjectSupervision) -> Dict[str, Any]:
    st = compute_supervision_status(sup)
    plan_preview = (sup.plan_content or '').strip()
    if len(plan_preview) > 80:
        plan_preview = plan_preview[:80] + '…'
    actual_preview = (sup.actual_content or '').strip()
    if len(actual_preview) > 80:
        actual_preview = actual_preview[:80] + '…'
    record_summary = []
    if sup.plan_submitted_at:
        record_summary.append('监察计划已提交')
    if sup.actual_submitted_at:
        record_summary.append('实际监察已提交')
    if not record_summary:
        record_summary.append('暂无监察记录')

    disp = enrich_protocol_display(protocol)

    return {
        'protocol_id': protocol.id,
        'project_code': protocol.code or '',
        'project_title': protocol.title,
        'protocol_status': protocol.status,
        'group_label': disp['group_label'],
        'backup_label': disp['backup_label'],
        'visits_label': disp['visits_label'],
        'period_label': disp['period_label'],
        'researcher_label': disp['researcher_label'],
        'sample_size_label': disp['sample_size'],
        'execution_start_date': sup.execution_start_date.isoformat() if sup.execution_start_date else None,
        'execution_end_date': sup.execution_end_date.isoformat() if sup.execution_end_date else None,
        'plan_content': sup.plan_content or '',
        'plan_submitted_at': sup.plan_submitted_at.isoformat() if sup.plan_submitted_at else None,
        'actual_content': sup.actual_content or '',
        'actual_submitted_at': sup.actual_submitted_at.isoformat() if sup.actual_submitted_at else None,
        'supervision_status': st,
        'supervision_status_label': STATUS_LABEL.get(st, st),
        'record_summary': ' / '.join(record_summary),
        'plan_preview': plan_preview or '—',
        'actual_preview': actual_preview or '—',
    }


def _apply_supervision_main_tab_filter(sup_qs, today: date):
    """
    项目监察主表：执行启动月为本月或下月且监察未完成
    ∪ 全部历史「已完成监察」
    ∪ 全部历史「监察异常」（超过执行结束日仍未提交监察计划，即未执行监察）。
    """
    cur_start = today.replace(day=1)
    next_start = cur_start + relativedelta(months=1)
    y0, m0 = cur_start.year, cur_start.month
    y1, m1 = next_start.year, next_start.month
    window_q = Q(execution_start_date__year=y0, execution_start_date__month=m0) | Q(
        execution_start_date__year=y1, execution_start_date__month=m1
    )
    set_a = sup_qs.filter(window_q).filter(actual_submitted_at__isnull=True)
    set_b = sup_qs.filter(actual_submitted_at__isnull=False)
    set_c = sup_qs.filter(
        execution_end_date__isnull=False,
        execution_end_date__lt=today,
        plan_submitted_at__isnull=True,
        actual_submitted_at__isnull=True,
    )
    ids: Set[int] = set()
    ids.update(set_a.values_list('id', flat=True))
    ids.update(set_b.values_list('id', flat=True))
    ids.update(set_c.values_list('id', flat=True))
    if not ids:
        return sup_qs.none()
    return sup_qs.filter(id__in=ids)


def _backfill_missing_supervision(allowed_ids: List[int]) -> None:
    if not allowed_ids:
        return
    existing = set(
        ProtocolProjectSupervision.objects.filter(protocol_id__in=allowed_ids).values_list(
            'protocol_id', flat=True
        )
    )
    missing = [i for i in allowed_ids if i not in existing]
    if not missing:
        return
    for p in Protocol.objects.filter(id__in=missing, is_deleted=False):
        ensure_supervision_row(p)


def list_project_supervision(
    account,
    year_month: Optional[str] = None,
    keyword: Optional[str] = None,
    researcher_keyword: Optional[str] = None,
    list_mode: str = 'supervision',
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    list_mode=management：仅维周来源登记（项目管理页签），逻辑与原列表一致，可按年月/关键词筛选。
    list_mode=supervision：项目监察主表 — 本月/下月未完成 ∪ 历史已完成 ∪ 历史监察异常；可按年月/关键词/研究员缩小范围。
    """
    proto_qs = Protocol.objects.filter(is_deleted=False)
    proto_qs = _apply_data_scope(proto_qs, account)
    allowed_ids = list(proto_qs.values_list('id', flat=True))
    empty_stats = {
        'pending_supervision': 0,
        'supervised': 0,
        'no_supervision_record': 0,
    }
    if not allowed_ids:
        return {
            'items': [],
            'total': 0,
            'page': page,
            'page_size': page_size,
            'stats': empty_stats,
            'list_mode': list_mode,
        }

    _backfill_missing_supervision(allowed_ids)

    sup_qs = ProtocolProjectSupervision.objects.filter(protocol_id__in=allowed_ids).select_related('protocol')

    mode = (list_mode or 'supervision').strip().lower()
    if mode == 'management':
        wz_ids = QualityProjectRegistry.objects.filter(
            source=QualityProjectRegistry.Source.WEIZHOU,
            protocol_id__in=allowed_ids,
        ).values_list('protocol_id', flat=True)
        sup_qs = sup_qs.filter(protocol_id__in=list(wz_ids))
    else:
        sup_qs = _apply_supervision_main_tab_filter(sup_qs, timezone.now().date())

    ym = (year_month or '').strip()
    if ym and len(ym) >= 7:
        try:
            parts = ym.split('-')
            y, m = int(parts[0]), int(parts[1])
            sup_qs = sup_qs.filter(
                execution_start_date__year=y,
                execution_start_date__month=m,
            ).exclude(execution_start_date__isnull=True)
        except (ValueError, IndexError):
            pass

    kw = (keyword or '').strip()
    if kw:
        sup_qs = sup_qs.filter(
            Q(protocol__title__icontains=kw) | Q(protocol__code__icontains=kw)
        )

    rk = (researcher_keyword or '').strip()
    if rk:
        sup_qs = sup_qs.filter(
            Q(protocol__team_members__icontains=rk) | Q(protocol__parsed_data__icontains=rk)
        )

    sup_qs = sup_qs.order_by(F('execution_start_date').asc(nulls_last=True), 'protocol_id')
    total = sup_qs.count()

    supervised_count = sup_qs.filter(actual_submitted_at__isnull=False).count()
    no_record_count = sup_qs.filter(
        plan_submitted_at__isnull=True,
        actual_submitted_at__isnull=True,
    ).count()
    pending_count = sup_qs.filter(
        actual_submitted_at__isnull=True,
        plan_submitted_at__isnull=False,
    ).count()

    offset = (page - 1) * page_size
    rows = list(sup_qs[offset : offset + page_size])

    items: List[Dict[str, Any]] = []
    for sup in rows:
        p = sup.protocol
        if p.is_deleted:
            continue
        items.append(_supervision_to_item(p, sup))

    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
        'stats': {
            'pending_supervision': pending_count,
            'supervised': supervised_count,
            'no_supervision_record': no_record_count,
        },
        'list_mode': mode,
    }


def get_supervision_detail(account, protocol_id: int) -> Optional[Dict[str, Any]]:
    proto = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not proto:
        return None
    scoped = Protocol.objects.filter(id=protocol_id, is_deleted=False)
    scoped = _apply_data_scope(scoped, account)
    if not scoped.exists():
        return None
    sup = ensure_supervision_row(proto)
    out = _supervision_to_item(proto, sup)
    out['plan_content_full'] = sup.plan_content or ''
    out['actual_content_full'] = sup.actual_content or ''
    return out


def submit_plan(account, protocol_id: int, plan_content: str) -> Dict[str, Any]:
    from apps.identity.models import Account as AccountModel

    proto = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not proto:
        raise ValueError('协议不存在')
    scoped = Protocol.objects.filter(id=protocol_id, is_deleted=False)
    scoped = _apply_data_scope(scoped, account)
    if not scoped.exists():
        raise ValueError('无权限访问该协议')

    sup = ensure_supervision_row(proto)
    if sup.actual_submitted_at is not None:
        raise ValueError('已完成实际监察，不可再修改计划')
    text = (plan_content or '').strip()
    if not text:
        raise ValueError('请填写监察内容')
    sup.plan_content = text
    sup.plan_submitted_at = timezone.now()
    if account and isinstance(account, AccountModel):
        sup.updated_by_id = account.id
    sup.save(update_fields=['plan_content', 'plan_submitted_at', 'updated_by_id', 'update_time'])
    return get_supervision_detail(account, protocol_id)  # type: ignore


def submit_actual(account, protocol_id: int, actual_content: str) -> Dict[str, Any]:
    from apps.identity.models import Account as AccountModel

    proto = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not proto:
        raise ValueError('协议不存在')
    scoped = Protocol.objects.filter(id=protocol_id, is_deleted=False)
    scoped = _apply_data_scope(scoped, account)
    if not scoped.exists():
        raise ValueError('无权限访问该协议')

    sup = ensure_supervision_row(proto)
    if sup.plan_submitted_at is None:
        raise ValueError('请先提交监察计划')
    text = (actual_content or '').strip()
    if not text:
        raise ValueError('请填写实际监察内容')
    sup.actual_content = text
    sup.actual_submitted_at = timezone.now()
    if account and isinstance(account, AccountModel):
        sup.updated_by_id = account.id
    sup.save(update_fields=['actual_content', 'actual_submitted_at', 'updated_by_id', 'update_time'])
    return get_supervision_detail(account, protocol_id)  # type: ignore
