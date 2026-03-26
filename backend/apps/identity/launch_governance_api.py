"""
鹿鸣·上线治理 API（CN KIS V2.0）

前缀挂载在 /auth/ 下，例如：
  GET  /auth/workstations/registry
  GET  /auth/governance/launch/overview
  ...
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.db.models import Count
from django.utils import timezone
from ninja import Router, Schema

from apps.core.workstation_registry import load_workstations_registry, registry_total_count

from .decorators import require_permission
from .models import Account, AccountWorkstationConfig
from .models_launch_governance import (
    LaunchGapStatus,
    LaunchGoalScope,
    LaunchGoalStatus,
    LaunchGovernanceGap,
    LaunchGovernanceGoal,
)

launch_governance_router = Router(tags=['上线治理'])


def _ok(data: Any) -> dict:
    return {'code': 200, 'msg': 'OK', 'data': data}


def _node_status(count: int, recent: int) -> str:
    if count <= 0:
        return 'blocked'
    if recent > 0:
        return 'ready'
    return 'partial'


@launch_governance_router.get('/workstations/registry', summary='工作台注册表（YAML 真相源）')
@require_permission('system.role.manage')
def get_workstations_registry(request):
    items = load_workstations_registry()
    return _ok({'items': items, 'total': len(items)})


@launch_governance_router.get('/governance/launch/overview', summary='V2 上线治理总览')
@require_permission('system.role.manage')
def launch_overview(request):
    from apps.secretary.briefing_tasks import _collect_v2_adoption_metrics

    adoption = _collect_v2_adoption_metrics()
    knowledge_health: Dict[str, Any] = {}
    learning_kpis: Dict[str, Any] = {}
    pending_insights: List[dict] = []
    recommended_actions: List[dict] = []
    try:
        from apps.knowledge.api_system_pulse import (
            _get_knowledge_health,
            _get_learning_kpis,
            _get_pending_insights,
            _build_recommended_actions,
        )
        knowledge_health = _get_knowledge_health()
        learning_kpis = _get_learning_kpis()
        pending_insights = _get_pending_insights()
        recommended_actions = _build_recommended_actions(learning_kpis, pending_insights)
    except Exception:
        pass

    open_gaps = LaunchGovernanceGap.objects.filter(status=LaunchGapStatus.OPEN).count()
    blocking_gaps = LaunchGovernanceGap.objects.filter(
        status=LaunchGapStatus.OPEN, blocked_loop=True,
    ).count()
    active_goals = LaunchGovernanceGoal.objects.filter(status=LaunchGoalStatus.ACTIVE).count()

    maturity = adoption.get('maturity_label') or '未知'
    l2 = adoption.get('l2_breakdown') or {}

    return _ok({
        'generated_at': timezone.now().isoformat(),
        'adoption': adoption,
        'knowledge_health': knowledge_health,
        'learning_loop_kpis': learning_kpis,
        'pending_insights': pending_insights[:8],
        'recommended_actions': recommended_actions[:8],
        'governance_counts': {
            'open_gaps': open_gaps,
            'blocking_gaps': blocking_gaps,
            'active_goals': active_goals,
        },
        'current_stage': {
            'label': 'CN KIS V2.0 上线实施',
            'summary': (
                f"上线成熟度：{maturity}；L2 动作拆分为 "
                f"工单 {l2.get('workorders', 0)} / 签到 {l2.get('checkins', 0)} / 偏差 {l2.get('deviations', 0)}"
            ),
            'today_focus': '优先跑通 Protocol→排程发布→工单→入组→现场签到→质量闭环',
        },
    })


@launch_governance_router.get('/governance/launch/lifecycle', summary='最小项目闭环节点指标')
@require_permission('system.role.manage')
def launch_lifecycle(request):
    now = timezone.now()
    week_ago = now - timedelta(days=7)

    protocol_total = protocol_recent = 0
    try:
        from apps.protocol.models import Protocol
        protocol_total = Protocol.objects.filter(is_deleted=False).count()
        protocol_recent = Protocol.objects.filter(is_deleted=False, create_time__gte=week_ago).count()
    except Exception:
        pass

    schedule_published = 0
    schedule_recent = 0
    try:
        from apps.scheduling.models import SchedulePlan, SchedulePlanStatus
        schedule_published = SchedulePlan.objects.filter(status=SchedulePlanStatus.PUBLISHED).count()
        schedule_recent = SchedulePlan.objects.filter(
            status=SchedulePlanStatus.PUBLISHED, update_time__gte=week_ago,
        ).count()
    except Exception:
        pass

    wo_total = wo_recent = 0
    try:
        from apps.workorder.models import WorkOrder
        wo_total = WorkOrder.objects.filter(is_deleted=False).count()
        wo_recent = WorkOrder.objects.filter(is_deleted=False, create_time__gte=week_ago).count()
    except Exception:
        pass

    enr_total = enr_recent = 0
    try:
        from apps.subject.models import Enrollment, EnrollmentStatus
        enr_total = Enrollment.objects.filter(status=EnrollmentStatus.ENROLLED).count()
        enr_recent = Enrollment.objects.filter(
            status=EnrollmentStatus.ENROLLED, create_time__gte=week_ago,
        ).count()
    except Exception:
        pass

    checkin_total = checkin_recent = 0
    try:
        from apps.subject.models_execution import SubjectCheckin
        checkin_total = SubjectCheckin.objects.count()
        checkin_recent = SubjectCheckin.objects.filter(create_time__gte=week_ago).count()
    except Exception:
        pass

    dev_total = dev_recent = 0
    try:
        from apps.quality.models import Deviation
        dev_total = Deviation.objects.filter(is_deleted=False).count()
        dev_recent = Deviation.objects.filter(
            is_deleted=False,
            create_time__gte=week_ago,
        ).count()
    except Exception:
        pass

    nodes = [
        {
            'key': 'protocol',
            'name': '项目/方案',
            'status': _node_status(protocol_total, protocol_recent),
            'total': protocol_total,
            'recent_7d': protocol_recent,
            'primary_workstations': ['research', 'secretary'],
        },
        {
            'key': 'schedule',
            'name': '排程发布',
            'status': _node_status(schedule_published, schedule_recent),
            'total': schedule_published,
            'recent_7d': schedule_recent,
            'primary_workstations': ['execution', 'lab-personnel'],
        },
        {
            'key': 'workorder',
            'name': '工单',
            'status': _node_status(wo_total, wo_recent),
            'total': wo_total,
            'recent_7d': wo_recent,
            'primary_workstations': ['execution', 'evaluator'],
        },
        {
            'key': 'enrollment',
            'name': '招募/入组',
            'status': _node_status(enr_total, enr_recent),
            'total': enr_total,
            'recent_7d': enr_recent,
            'primary_workstations': ['recruitment', 'research'],
        },
        {
            'key': 'checkin',
            'name': '现场签到',
            'status': _node_status(checkin_total, checkin_recent),
            'total': checkin_total,
            'recent_7d': checkin_recent,
            'primary_workstations': ['reception', 'execution'],
        },
        {
            'key': 'quality',
            'name': '偏差/质量闭环',
            'status': _node_status(dev_total, dev_recent),
            'total': dev_total,
            'recent_7d': dev_recent,
            'primary_workstations': ['quality'],
        },
    ]
    return _ok({'nodes': nodes, 'generated_at': now.isoformat()})


@launch_governance_router.get('/governance/launch/workstations', summary='19 台上线地图数据')
@require_permission('system.role.manage')
def launch_workstations_map(request):
    registry = load_workstations_registry()
    now = timezone.now()
    week_ago = now - timedelta(days=7)

    assigned = dict(
        AccountWorkstationConfig.objects.values('workstation')
        .annotate(c=Count('account_id', distinct=True))
        .values_list('workstation', 'c'),
    )
    active = dict(
        AccountWorkstationConfig.objects.filter(
            account__last_login_time__gte=week_ago,
            account__is_deleted=False,
        )
        .values('workstation')
        .annotate(c=Count('account_id', distinct=True))
        .values_list('workstation', 'c'),
    )

    items = []
    for w in registry:
        key = w['key']
        a = assigned.get(key, 0) or 0
        act = active.get(key, 0) or 0
        stage = 'S0'
        if a > 0:
            stage = 'S2'
        if act > 0:
            stage = 'S3'
        if a > 0 and act > 0:
            stage = 'S3'
        items.append({
            **w,
            'accounts_assigned': a,
            'active_7d': act,
            'stage_level': stage,
            'stage_label': {
                'S0': '仅注册',
                'S2': '已配置账号',
                'S3': '近7天有活跃',
            }.get(stage, stage),
        })

    return _ok({
        'items': items,
        'total': len(items),
        'registry_total': registry_total_count(),
    })


# --- Gaps ---

class LaunchGapIn(Schema):
    title: str
    description: str = ''
    gap_type: str = ''
    severity: str = 'medium'
    related_node: str = ''
    related_workstation: str = ''
    blocked_loop: bool = False
    owner_domain: str = ''
    github_issue_url: str = ''
    feishu_ref: str = ''
    next_action: str = ''
    verification_status: str = 'pending'


class LaunchGapPatchIn(Schema):
    title: Optional[str] = None
    description: Optional[str] = None
    gap_type: Optional[str] = None
    severity: Optional[str] = None
    related_node: Optional[str] = None
    related_workstation: Optional[str] = None
    blocked_loop: Optional[bool] = None
    status: Optional[str] = None
    owner_domain: Optional[str] = None
    github_issue_url: Optional[str] = None
    feishu_ref: Optional[str] = None
    next_action: Optional[str] = None
    verification_status: Optional[str] = None


@launch_governance_router.get('/governance/launch/gaps', summary='问题与缺口列表')
@require_permission('system.role.manage')
def list_launch_gaps(request, status: str = '', blocked_loop: Optional[bool] = None):
    qs = LaunchGovernanceGap.objects.all()
    if status:
        qs = qs.filter(status=status)
    if blocked_loop is not None:
        qs = qs.filter(blocked_loop=blocked_loop)
    total = qs.count()
    items = []
    now = timezone.now()
    for g in qs.order_by('-update_time')[:200]:
        days_open = (now - g.create_time).days
        items.append({
            'id': g.id,
            'title': g.title,
            'description': g.description,
            'gap_type': g.gap_type,
            'severity': g.severity,
            'related_node': g.related_node,
            'related_workstation': g.related_workstation,
            'blocked_loop': g.blocked_loop,
            'status': g.status,
            'owner_domain': g.owner_domain,
            'github_issue_url': g.github_issue_url,
            'feishu_ref': g.feishu_ref,
            'next_action': g.next_action,
            'verification_status': g.verification_status,
            'days_open': days_open,
            'create_time': g.create_time.isoformat(),
            'update_time': g.update_time.isoformat(),
        })
    return _ok({'items': items, 'total': total})


@launch_governance_router.post('/governance/launch/gaps', summary='创建缺口')
@require_permission('system.role.manage')
def create_launch_gap(request, data: LaunchGapIn):
    uid = getattr(request, 'user_id', None)
    g = LaunchGovernanceGap.objects.create(
        title=data.title,
        description=data.description,
        gap_type=data.gap_type,
        severity=data.severity,
        related_node=data.related_node,
        related_workstation=data.related_workstation,
        blocked_loop=data.blocked_loop,
        owner_domain=data.owner_domain,
        github_issue_url=data.github_issue_url,
        feishu_ref=data.feishu_ref,
        next_action=data.next_action,
        verification_status=data.verification_status,
        created_by_id=int(uid) if uid else None,
    )
    return _ok({'id': g.id})


@launch_governance_router.put('/governance/launch/gaps/{gap_id}', summary='更新缺口')
@require_permission('system.role.manage')
def patch_launch_gap(request, gap_id: int, data: LaunchGapPatchIn):
    g = LaunchGovernanceGap.objects.filter(id=gap_id).first()
    if not g:
        return {'code': 404, 'msg': '缺口不存在', 'data': None}
    payload = data.dict(exclude_unset=True)
    for k, v in payload.items():
        setattr(g, k, v)
    g.save()
    return _ok({'id': g.id})


# --- Goals ---

class LaunchGoalIn(Schema):
    title: str
    description: str = ''
    scope: str = LaunchGoalScope.PHASE
    target_date: Optional[str] = None
    progress_percent: int = 0
    gap_links: List[int] = []
    rhythm_notes: str = ''


class LaunchGoalPatchIn(Schema):
    title: Optional[str] = None
    description: Optional[str] = None
    scope: Optional[str] = None
    target_date: Optional[str] = None
    progress_percent: Optional[int] = None
    status: Optional[str] = None
    gap_links: Optional[List[int]] = None
    rhythm_notes: Optional[str] = None


@launch_governance_router.get('/governance/launch/goals', summary='目标与节奏列表')
@require_permission('system.role.manage')
def list_launch_goals(request, scope: str = '', status: str = ''):
    qs = LaunchGovernanceGoal.objects.all()
    if scope:
        qs = qs.filter(scope=scope)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    items = []
    for g in qs.order_by('-update_time')[:100]:
        items.append({
            'id': g.id,
            'title': g.title,
            'description': g.description,
            'scope': g.scope,
            'target_date': g.target_date.isoformat() if g.target_date else None,
            'progress_percent': g.progress_percent,
            'status': g.status,
            'gap_links': g.gap_links or [],
            'rhythm_notes': g.rhythm_notes,
            'create_time': g.create_time.isoformat(),
            'update_time': g.update_time.isoformat(),
        })
    return _ok({'items': items, 'total': total})


@launch_governance_router.post('/governance/launch/goals', summary='创建目标')
@require_permission('system.role.manage')
def create_launch_goal(request, data: LaunchGoalIn):
    uid = getattr(request, 'user_id', None)
    td = None
    if data.target_date:
        from datetime import datetime as dt
        td = dt.strptime(data.target_date[:10], '%Y-%m-%d').date()
    g = LaunchGovernanceGoal.objects.create(
        title=data.title,
        description=data.description,
        scope=data.scope or LaunchGoalScope.PHASE,
        target_date=td,
        progress_percent=min(100, max(0, data.progress_percent)),
        gap_links=data.gap_links or [],
        rhythm_notes=data.rhythm_notes,
        created_by_id=int(uid) if uid else None,
    )
    return _ok({'id': g.id})


@launch_governance_router.put('/governance/launch/goals/{goal_id}', summary='更新目标')
@require_permission('system.role.manage')
def patch_launch_goal(request, goal_id: int, data: LaunchGoalPatchIn):
    g = LaunchGovernanceGoal.objects.filter(id=goal_id).first()
    if not g:
        return {'code': 404, 'msg': '目标不存在', 'data': None}
    payload = data.dict(exclude_unset=True)
    if 'target_date' in payload and payload['target_date']:
        from datetime import datetime as dt
        payload['target_date'] = dt.strptime(payload['target_date'][:10], '%Y-%m-%d').date()
    for k, v in payload.items():
        setattr(g, k, v)
    g.save()
    return _ok({'id': g.id})
