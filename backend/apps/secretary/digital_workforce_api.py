"""
中书·数字员工中心聚合 API

端点：
- GET /portal          门户数据：DomainWorkerBlueprint + AgentDefinition + 最近执行统计
- GET /value-metrics  价值指标：SkillExecutionLog + GovernanceMetricEvent + 人工成本基准
- GET /my-assistants  当前用户工作台绑定的 Agent 列表 + 7 天任务数
- GET /my-activity    当前用户 UnifiedExecutionTask 时间线

管理端（需 dashboard.admin.manage 权限）：
- GET/PUT /agents/{agent_id}     Agent 配置读写
- GET/POST/PUT/DELETE /skills/  技能 CRUD
- GET/PUT /routing/             编排路由
- GET/PUT /workstation-bindings/ 工作台绑定
- POST /reload-config           配置热刷新
"""
import logging
from ninja import Router, Schema
from django.utils import timezone
from datetime import timedelta
from typing import Any, List, Optional
from django.db.models import Avg, Count, Q

from apps.identity.decorators import require_permission
from .api import _get_account

router = Router()
logger = logging.getLogger(__name__)


class ApiEnvelope(Schema):
    code: int
    msg: str
    data: Optional[Any] = None

# 默认工作台→Agent 映射（DB 无数据时使用；sync_workstation_bindings 会导入到 DB）
_DEFAULT_WORKSTATION_AGENTS = {
    'secretary': ['general-assistant', 'orchestration-agent', 'knowledge-agent'],
    'research': ['protocol-agent', 'knowledge-agent'],
    'quality': ['quality-guardian', 'knowledge-agent'],
    'finance': ['finance-agent'],
    'execution': ['execution-agent'],
    'hr': ['talent-agent'],
    'crm': ['crm-agent'],
    'recruitment': ['recruitment-bot'],
    'equipment': ['equipment-agent'],
    'material': ['execution-agent'],
    'facility': ['execution-agent'],
    'evaluator': ['execution-agent', 'knowledge-agent'],
    'lab-personnel': ['talent-agent'],
    'ethics': ['ethics-agent', 'knowledge-agent'],
    'reception': ['reception-assistant'],
}


def _get_workstation_bindings():
    """工作台绑定（Agent 列表等），优先从 DB 读取"""
    try:
        from .models_workstation_binding import WorkstationBinding
        if WorkstationBinding.objects.exists():
            return {
                b.workstation_key: {
                    'agent_ids': list(b.agent_ids or []),
                    'skill_ids': list(b.skill_ids or []),
                    'quick_actions': list(b.quick_actions or []),
                    'display_name': b.display_name or b.workstation_key,
                }
                for b in WorkstationBinding.objects.all()
            }
    except Exception as exc:
        logger.warning('load workstation bindings from db failed: %s', exc)
    return {
        ws: {
            'agent_ids': agents,
            'skill_ids': [],
            'quick_actions': [],
            'display_name': ws,
        }
        for ws, agents in _DEFAULT_WORKSTATION_AGENTS.items()
    }


def _require_account(request):
    """返回当前账号，未授权时返回 (None, response_tuple)。"""
    account = _get_account(request)
    if not account:
        return None, (401, {'code': 401, 'msg': '未授权', 'data': None})
    return account, None


def _bad_request(message: str):
    return 400, {'code': 400, 'msg': message, 'data': None}


def _validate_days(days: int, *, default: int, min_days: int = 1, max_days: int = 365) -> int:
    if days is None:
        return default
    if days < min_days or days > max_days:
        raise ValueError(f'days 必须在 {min_days}-{max_days} 之间')
    return days


def _normalize_limit(limit: int, *, default: int = 50, max_limit: int = 100) -> int:
    limit = default if limit is None else limit
    if limit < 1 or limit > max_limit:
        raise ValueError(f'limit 必须在 1-{max_limit} 之间')
    return limit


def _validate_skill_payload(data: dict):
    from .models_skills import SkillExecutor

    executor = data.get('executor') or SkillExecutor.SCRIPT
    valid_executors = {choice for choice, _ in SkillExecutor.choices}
    if executor not in valid_executors:
        raise ValueError(f'executor 必须是 {", ".join(sorted(valid_executors))}')

    risk_level = (data.get('risk_level') or 'medium').lower()
    if risk_level not in {'low', 'medium', 'high'}:
        raise ValueError('risk_level 必须是 low / medium / high')
    data['risk_level'] = risk_level

    timeout = int(data.get('timeout') or 0)
    if timeout < 1 or timeout > 3600:
        raise ValueError('timeout 必须在 1-3600 秒之间')
    data['timeout'] = timeout

    if executor == SkillExecutor.AGENT and not (data.get('agent_id') or '').strip():
        raise ValueError('executor=agent 时 agent_id 必填')

    for field in ('agent_tools', 'bound_workstations'):
        value = data.get(field)
        if value is not None and not isinstance(value, list):
            raise ValueError(f'{field} 必须是数组')


def _validate_routing_rows(rows: list, required_keys: List[str], label: str):
    normalized = []
    for idx, raw in enumerate(rows or [], start=1):
        if not isinstance(raw, dict):
            raise ValueError(f'{label} 第 {idx} 项必须是对象')
        row = {key: raw.get(key) for key in required_keys}
        missing = [key for key in required_keys if not str(row.get(key) or '').strip()]
        if missing:
            raise ValueError(f'{label} 第 {idx} 项缺少字段: {", ".join(missing)}')
        normalized.append(raw)
    return normalized


def _validate_role_payload(data: dict):
    from .models_roles import AutomationLevel

    list_fields = (
        'service_targets',
        'core_scenarios',
        'input_contract',
        'output_contract',
        'human_confirmation_points',
        'kpi_metrics',
        'mapped_agent_ids',
        'mapped_skill_ids',
        'workstation_scope',
    )
    for field in list_fields:
        value = data.get(field)
        if value is not None and not isinstance(value, list):
            raise ValueError(f'{field} 必须是数组')

    automation_level = data.get('automation_level')
    if automation_level is not None:
        valid_levels = {choice for choice, _ in AutomationLevel.choices}
        if automation_level not in valid_levels and automation_level != '':
            raise ValueError(f'automation_level 必须是 {", ".join(sorted(valid_levels))}')

    baseline_minutes = data.get('baseline_manual_minutes')
    if baseline_minutes is not None:
        baseline_minutes = int(baseline_minutes)
        if baseline_minutes < 1 or baseline_minutes > 1440:
            raise ValueError('baseline_manual_minutes 必须在 1-1440 之间')
        data['baseline_manual_minutes'] = baseline_minutes


@router.get('/portal', summary='数字员工门户数据', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_portal(request):
    """
    聚合 DomainWorkerBlueprint、AgentDefinition 与今日执行统计，供中书门户页使用。
    """
    _, err = _require_account(request)
    if err:
        return err

    from .models_workers import DomainWorkerBlueprint
    from apps.agent_gateway.models import AgentDefinition, AgentCall

    blueprints = list(
        DomainWorkerBlueprint.objects.filter(enabled=True).order_by('domain_code').values(
            'domain_code', 'display_name', 'lead_agent_id', 'workstation_hint', 'responsibilities'
        )
    )

    agents = list(
        AgentDefinition.objects.filter(is_active=True).order_by('agent_id').values(
            'agent_id', 'name', 'description', 'capabilities', 'provider',
            'role_title', 'tier', 'avatar_url', 'phase', 'is_editable_via_ui',
        )
    )

    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = timezone.now() - timedelta(days=7)
    today_calls = (
        AgentCall.objects.filter(created_at__gte=today_start)
        .values('agent_id')
        .annotate(total=Count('id'), success=Count('id', filter=Q(status='success')))
    )
    execution_today = {row['agent_id']: {'total': row['total'], 'success': row['success']} for row in today_calls}
    week_calls = (
        AgentCall.objects.filter(created_at__gte=seven_days_ago)
        .values('agent_id')
        .annotate(total=Count('id'), success=Count('id', filter=Q(status='success')))
    )
    execution_7d = {row['agent_id']: {'total': row['total'], 'success': row['success']} for row in week_calls}

    from .models_roles import WorkerRoleDefinition

    roles = list(
        WorkerRoleDefinition.objects.filter(enabled=True).order_by('role_cluster', 'role_code').values(
            'role_code', 'role_name', 'role_cluster', 'service_targets', 'core_scenarios',
            'automation_level', 'human_confirmation_points', 'kpi_metrics',
            'mapped_agent_ids', 'mapped_skill_ids', 'workstation_scope', 'baseline_manual_minutes',
        )
    )

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'blueprints': blueprints,
            'agents': agents,
            'roles': roles,
            'execution_today': execution_today,
            'execution_7d': execution_7d,
        },
    }


@router.get('/roles', summary='岗位定义列表', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_roles_list(request, include_disabled: bool = False):
    """岗位定义列表，供门户/花名册按岗位视角展示。"""
    _, err = _require_account(request)
    if err:
        return err
    from .models_roles import WorkerRoleDefinition
    qs = WorkerRoleDefinition.objects.all()
    if not include_disabled:
        qs = qs.filter(enabled=True)
    items = list(
        qs.order_by('role_cluster', 'role_code').values(
            'role_code', 'role_name', 'role_cluster', 'service_targets', 'core_scenarios',
            'input_contract', 'output_contract', 'automation_level', 'human_confirmation_points',
            'kpi_metrics', 'mapped_agent_ids', 'mapped_skill_ids', 'workstation_scope',
            'baseline_manual_minutes', 'enabled',
        )
    )
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/roles/{role_code}', summary='岗位定义详情', response={200: ApiEnvelope, 401: ApiEnvelope, 404: ApiEnvelope})
def digital_workforce_role_detail(request, role_code: str, include_disabled: bool = False):
    """岗位定义详情。"""
    _, err = _require_account(request)
    if err:
        return err
    from .models_roles import WorkerRoleDefinition
    qs = WorkerRoleDefinition.objects.filter(role_code=role_code)
    if not include_disabled:
        qs = qs.filter(enabled=True)
    obj = qs.first()
    if not obj:
        return 404, {'code': 404, 'msg': '岗位不存在', 'data': None}
    data = {
        'role_code': obj.role_code,
        'role_name': obj.role_name,
        'role_cluster': obj.role_cluster,
        'service_targets': list(obj.service_targets or []),
        'core_scenarios': list(obj.core_scenarios or []),
        'input_contract': list(obj.input_contract or []),
        'output_contract': list(obj.output_contract or []),
        'automation_level': obj.automation_level or '',
        'human_confirmation_points': list(obj.human_confirmation_points or []),
        'kpi_metrics': list(obj.kpi_metrics or []),
        'mapped_agent_ids': list(obj.mapped_agent_ids or []),
        'mapped_skill_ids': list(obj.mapped_skill_ids or []),
        'workstation_scope': list(obj.workstation_scope or []),
        'baseline_manual_minutes': obj.baseline_manual_minutes,
        'enabled': obj.enabled,
    }
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get(
    '/replay-runs',
    summary='编排回放列表（支持按工作台/岗位/业务对象过滤）',
    response={200: ApiEnvelope, 401: ApiEnvelope},
)
def digital_workforce_replay_list(
    request,
    limit: int = 50,
    workstation_key: str = '',
    role_code: str = '',
    business_object_type: str = '',
):
    """列表 OrchestrationRun，供回放中心按岗位/工作台/业务对象筛选。"""
    _, err = _require_account(request)
    if err:
        return err
    limit = _normalize_limit(limit, default=50, max_limit=100)
    from .models_orchestration import OrchestrationRun
    qs = OrchestrationRun.objects.all().order_by('-created_at')
    if (workstation_key or '').strip():
        qs = qs.filter(workstation_key=workstation_key.strip())
    if (role_code or '').strip():
        qs = qs.filter(role_code=role_code.strip())
    if (business_object_type or '').strip():
        qs = qs.filter(business_object_type=business_object_type.strip())
    runs = list(
        qs[:limit].values(
            'task_id', 'business_run_id', 'role_code', 'domain_code', 'workstation_key',
            'business_object_type', 'business_object_id', 'status', 'query', 'sub_task_count',
            'duration_ms', 'created_at', 'completed_at',
        )
    )
    for r in runs:
        if r.get('created_at'):
            r['created_at'] = r['created_at'].isoformat()
        if r.get('completed_at'):
            r['completed_at'] = r['completed_at'].isoformat()
        if r.get('query'):
            r['query_snippet'] = (r['query'][:80] + '…') if len(r['query']) > 80 else r['query']
    return {'code': 200, 'msg': 'OK', 'data': {'items': runs}}


@router.get('/replay/{task_id}', summary='回放详情（编排运行 + 子任务 + 结构化产物）', response={200: ApiEnvelope, 401: ApiEnvelope, 404: ApiEnvelope})
def digital_workforce_replay_detail(request, task_id: str):
    """按 task_id 返回编排运行详情，含子任务列表与结构化产物（如有）。"""
    _, err = _require_account(request)
    if err:
        return err
    from .models_orchestration import OrchestrationRun, OrchestrationSubTask
    run = OrchestrationRun.objects.filter(task_id=task_id).first()
    if not run:
        return 404, {'code': 404, 'msg': '运行记录不存在', 'data': None}
    sub_tasks = list(
        OrchestrationSubTask.objects.filter(run=run).order_by('index').values(
            'index', 'domain', 'agent_id', 'task_text', 'status', 'output', 'error', 'duration_ms', 'token_usage',
        )
    )
    data = {
        'task_id': run.task_id,
        'business_run_id': run.business_run_id or run.task_id,
        'role_code': getattr(run, 'role_code', '') or '',
        'domain_code': getattr(run, 'domain_code', '') or '',
        'workstation_key': getattr(run, 'workstation_key', '') or '',
        'business_object_type': getattr(run, 'business_object_type', '') or '',
        'business_object_id': getattr(run, 'business_object_id', '') or '',
        'account_id': run.account_id,
        'query': run.query,
        'context_json': run.context_json,
        'status': run.status,
        'sub_task_count': run.sub_task_count,
        'aggregated_output': run.aggregated_output,
        'duration_ms': run.duration_ms,
        'errors_json': run.errors_json,
        'dispatched_claws': list(run.dispatched_claws or []),
        'structured_artifacts': run.structured_artifacts or {},
        'sub_tasks': sub_tasks,
        'created_at': run.created_at.isoformat() if run.created_at else None,
        'completed_at': run.completed_at.isoformat() if run.completed_at else None,
    }
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/agent-observability', summary='Agent 观测指标（延迟/Token/工具调用）', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_agent_observability(request, days: int = 7):
    """
    按 Agent 聚合调用指标，供绩效仪表盘展示。与 AgentKit 全链路观测可并行（此处为 DB 聚合）。
    """
    _, err = _require_account(request)
    if err:
        return err
    try:
        days = _validate_days(days, default=7)
    except ValueError as exc:
        return _bad_request(str(exc))

    from apps.agent_gateway.models import AgentCall
    from .models_governance import GovernanceMetricEvent

    cutoff = timezone.now() - timedelta(days=days)
    aggregates = AgentCall.objects.filter(created_at__gte=cutoff).values('agent_id').annotate(
        total=Count('id'),
        success=Count('id', filter=Q(status='success')),
        avg_duration_ms=Avg('duration_ms'),
    )
    by_agent = {
        row['agent_id']: {
            'total': row['total'],
            'success': row['success'],
            'avg_duration_ms': round(row['avg_duration_ms'] or 0),
            'total_tokens': 0,
            'tool_calls_count': 0,
            'agentkit_reports': 0,
            'agentkit_last_reported_at': None,
        }
        for row in aggregates
    }
    extras = AgentCall.objects.filter(created_at__gte=cutoff).values('agent_id', 'token_usage', 'tool_calls_log')
    for row in extras:
        aid = row['agent_id']
        if row.get('token_usage') and isinstance(row['token_usage'], dict):
            by_agent[aid]['total_tokens'] += int(row['token_usage'].get('total_tokens') or 0)
        if row.get('tool_calls_log') and isinstance(row['tool_calls_log'], list):
            by_agent[aid]['tool_calls_count'] += len(row['tool_calls_log'])
    agentkit_rows = (
        GovernanceMetricEvent.objects.filter(created_at__gte=cutoff, source='agentkit')
        .values('dimension_1')
        .annotate(total=Count('id'))
    )
    for row in agentkit_rows:
        aid = row.get('dimension_1') or ''
        if not aid:
            continue
        by_agent.setdefault(
            aid,
            {
                'total': 0,
                'success': 0,
                'avg_duration_ms': 0,
                'total_tokens': 0,
                'tool_calls_count': 0,
                'agentkit_reports': 0,
                'agentkit_last_reported_at': None,
            },
        )
        by_agent[aid]['agentkit_reports'] = int(row.get('total') or 0)
    latest_rows = (
        GovernanceMetricEvent.objects.filter(created_at__gte=cutoff, source='agentkit')
        .order_by('dimension_1', '-created_at')
        .values('dimension_1', 'created_at')
    )
    seen_latest = set()
    for row in latest_rows:
        aid = row.get('dimension_1') or ''
        if not aid or aid in seen_latest:
            continue
        seen_latest.add(aid)
        by_agent.setdefault(
            aid,
            {
                'total': 0,
                'success': 0,
                'avg_duration_ms': 0,
                'total_tokens': 0,
                'tool_calls_count': 0,
                'agentkit_reports': 0,
                'agentkit_last_reported_at': None,
            },
        )
        created_at = row.get('created_at')
        by_agent[aid]['agentkit_last_reported_at'] = created_at.isoformat() if created_at else None
    items = [{'agent_id': aid, **data} for aid, data in sorted(by_agent.items())]
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'days': days, 'items': items},
    }


# 价值看板全局默认：技能未配置 baseline_manual_minutes 时使用
_DEFAULT_BASELINE_MINUTES_PER_SKILL_RUN = 5


def _collect_role_kpi_stats(cutoff) -> list:
    """
    岗位定义驱动的 KPI 自动采集。
    遍历所有启用的 WorkerRoleDefinition，为每个岗位自动统计通用指标 +
    根据 kpi_metrics 字段中的定义采集专项指标。

    优先读取最近的 RoleKPISnapshot（避免每次请求重算），若无快照则实时计算。
    """
    from .models_roles import WorkerRoleDefinition, RoleKPISnapshot
    from .models_runtime import UnifiedExecutionTask
    from .models_governance import EvidenceGateRun
    from .models_memory import WorkerMemoryRecord

    today = timezone.now().date()

    result = []
    roles = WorkerRoleDefinition.objects.filter(enabled=True).order_by('role_cluster', 'role_code')

    for role in roles:
        # 优先读快照
        snapshot = RoleKPISnapshot.objects.filter(
            role_code=role.role_code,
            snapshot_date=today,
        ).first()
        if snapshot:
            result.append({
                'role_code': role.role_code,
                'role_name': role.role_name,
                'kpis': snapshot.kpis,
                'source': 'snapshot',
            })
            continue

        # 实时计算通用指标
        try:
            tasks = UnifiedExecutionTask.objects.filter(
                role_code=role.role_code,
                status__in=[UnifiedExecutionTask.Status.SUCCEEDED, UnifiedExecutionTask.Status.PARTIAL],
                completed_at__gte=cutoff,
            )
            total = tasks.count()
            succeeded = tasks.filter(status=UnifiedExecutionTask.Status.SUCCEEDED).count()
            success_rate = round(succeeded / total, 3) if total else 0.0

            by_object = list(
                tasks.values('business_object_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )

            memory_count = WorkerMemoryRecord.objects.filter(
                worker_code=role.role_code,
                created_at__gte=cutoff,
            ).count()

            kpis = {
                'total_executions': total,
                'success_rate': success_rate,
                'memory_records': memory_count,
                'by_business_object': by_object,
            }

            # 门禁相关岗位补充门禁通过率
            if role.role_code in ('quality_guardian', 'compliance_reviewer'):
                gate_runs = EvidenceGateRun.objects.filter(created_at__gte=cutoff)
                gate_total = gate_runs.count()
                gate_passed = gate_runs.filter(status='passed').count()
                kpis['gate_pass_rate'] = round(gate_passed / gate_total, 3) if gate_total else 0.0

            # 从 kpi_metrics 定义中生成标签
            kpi_defs = role.kpi_metrics if isinstance(role.kpi_metrics, list) else []
            kpis['kpi_definitions'] = kpi_defs

            result.append({
                'role_code': role.role_code,
                'role_name': role.role_name,
                'kpis': kpis,
                'source': 'realtime',
            })
        except Exception as exc:
            logger.debug('_collect_role_kpi_stats for %s failed: %s', role.role_code, exc)

    return result


def _collect_knowledge_deposit_stats(cutoff) -> dict:
    """
    统计最近 N 天由数字员工各路径沉淀的知识条目数，用于价值看板"知识工厂"维度。
    """
    try:
        from apps.knowledge.models import KnowledgeEntry, EntryStatus

        dw_source_types = (
            'project_retrospective',
            'evergreen_watch',
            'digital_worker_asset',
        )
        qs = KnowledgeEntry.objects.filter(
            source_type__in=dw_source_types,
            is_deleted=False,
            create_time__gte=cutoff,
        )
        total = qs.count()
        pending_review = qs.filter(status=EntryStatus.PENDING_REVIEW).count()
        published = qs.filter(status=EntryStatus.PUBLISHED).count()
        by_source = list(
            qs.values('source_type').annotate(count=Count('id')).order_by('source_type')
        )
        return {
            'total_deposited': total,
            'pending_review': pending_review,
            'published': published,
            'by_source': by_source,
        }
    except Exception as exc:
        logger.debug('_collect_knowledge_deposit_stats failed: %s', exc)
        return {
            'total_deposited': 0,
            'pending_review': 0,
            'published': 0,
            'by_source': [],
        }


@router.get('/value-metrics', summary='数字员工价值指标', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_value_metrics(request, days: int = 30):
    """
    聚合 SkillExecutionLog、UnifiedExecutionTask、GovernanceMetricEvent。
    支持按岗位(role_code)、工作台(workstation_key)、业务对象(business_object_type)聚合，
    并按技能人工替代基准估算节省工时。
    """
    _, err = _require_account(request)
    if err:
        return err
    try:
        days = _validate_days(days, default=30)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_orchestration import SkillExecutionLog
    from .models_governance import GovernanceMetricEvent
    from .models_skills import SkillDefinition
    from .models_runtime import UnifiedExecutionTask

    cutoff = timezone.now() - timedelta(days=days)

    skill_logs = (
        SkillExecutionLog.objects.filter(created_at__gte=cutoff)
        .aggregate(
            total=Count('id'),
            success=Count('id', filter=Q(status='success')),
        )
    )
    success_by_skill = list(
        SkillExecutionLog.objects.filter(created_at__gte=cutoff, status='success')
        .values('skill_id')
        .annotate(cnt=Count('id'))
    )
    skill_baselines = {
        s['skill_id']: (s['baseline_manual_minutes'] if s['baseline_manual_minutes'] is not None else _DEFAULT_BASELINE_MINUTES_PER_SKILL_RUN)
        for s in SkillDefinition.objects.filter(is_active=True).values('skill_id', 'baseline_manual_minutes')
    }
    default_baseline = _DEFAULT_BASELINE_MINUTES_PER_SKILL_RUN
    saved_minutes = sum(
        row['cnt'] * skill_baselines.get(row['skill_id'], default_baseline)
        for row in success_by_skill
    )
    saved_hours = round(saved_minutes / 60.0, 2)

    gov_events = (
        GovernanceMetricEvent.objects.filter(created_at__gte=cutoff)
        .values('event_type')
        .annotate(cnt=Count('id'))
    )
    governance_summary = {row['event_type']: row['cnt'] for row in gov_events}

    # 二轮收口：按岗位、工作台、业务对象聚合（基于 UnifiedExecutionTask）
    claw_tasks = UnifiedExecutionTask.objects.filter(
        runtime_type='claw',
        status__in=[UnifiedExecutionTask.Status.SUCCEEDED, UnifiedExecutionTask.Status.PARTIAL],
        completed_at__gte=cutoff,
    ).values('role_code', 'workstation_key', 'business_object_type', 'name')

    by_role: dict = {}
    by_workstation: dict = {}
    by_business_object: dict = {}
    for t in claw_tasks:
        mins = skill_baselines.get(t['name'], default_baseline)
        role = (t['role_code'] or '').strip() or '_unknown'
        ws = (t['workstation_key'] or '').strip() or '_unknown'
        obj = (t['business_object_type'] or '').strip() or '_unknown'
        by_role[role] = by_role.get(role, {'count': 0, 'saved_minutes': 0.0})
        by_role[role]['count'] += 1
        by_role[role]['saved_minutes'] += mins
        by_workstation[ws] = by_workstation.get(ws, {'count': 0, 'saved_minutes': 0.0})
        by_workstation[ws]['count'] += 1
        by_workstation[ws]['saved_minutes'] += mins
        by_business_object[obj] = by_business_object.get(obj, {'count': 0, 'saved_minutes': 0.0})
        by_business_object[obj]['count'] += 1
        by_business_object[obj]['saved_minutes'] += mins

    def _to_series(d: dict, key_name: str):
        return [
            {key_name: k, 'count': v['count'], 'saved_hours_estimate': round(v['saved_minutes'] / 60.0, 2)}
            for k, v in sorted(d.items()) if k != '_unknown' or v['count'] > 0
        ]

    # KPI 自动采集：为重点岗位补充专项指标
    role_kpi_stats = _collect_role_kpi_stats(cutoff)

    # 知识沉淀维度：统计最近 N 天由数字员工路径沉淀的知识条目数
    knowledge_stats = _collect_knowledge_deposit_stats(cutoff)

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'window_days': days,
            'skill_execution_total': skill_logs.get('total') or 0,
            'skill_execution_success': skill_logs.get('success') or 0,
            'governance_summary': governance_summary,
            'saved_hours_estimate': saved_hours,
            'baseline_minutes_per_skill_run': _DEFAULT_BASELINE_MINUTES_PER_SKILL_RUN,
            'by_role': _to_series(by_role, 'role_code'),
            'by_workstation': _to_series(by_workstation, 'workstation_key'),
            'by_business_object_type': _to_series(by_business_object, 'business_object_type'),
            'by_role_kpi': role_kpi_stats,
            'knowledge_deposit': knowledge_stats,
        },
    }


def _get_account_workstations(account_id: int):
    """返回该账号有权限的工作台列表（非 blank 的）。无配置视为 full。"""
    from apps.identity.models import AccountWorkstationConfig
    configs = {
        c.workstation: c.mode
        for c in AccountWorkstationConfig.objects.filter(account_id=account_id).values('workstation', 'mode')
    }
    bindings = _get_workstation_bindings()
    return [
        ws for ws in bindings
        if configs.get(ws, 'full') != 'blank'
    ]


@router.get('/my-assistants', summary='我的助手列表', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_my_assistants(request):
    """当前用户工作台绑定的 Agent 列表，含最近 7 天为我完成的任务数。"""
    account, err = _require_account(request)
    if err:
        return err

    from apps.agent_gateway.models import AgentDefinition, AgentCall

    workstations = _get_account_workstations(account.id)
    bindings = _get_workstation_bindings()
    agent_ids = set()
    for ws in workstations:
        agent_ids.update(bindings.get(ws, {}).get('agent_ids', []))

    seven_days_ago = timezone.now() - timedelta(days=7)
    call_counts = (
        AgentCall.objects.filter(
            session__account_id=account.id,
            created_at__gte=seven_days_ago,
            status='success',
        )
        .values('agent_id')
        .annotate(count=Count('id'))
    )
    task_counts = {r['agent_id']: r['count'] for r in call_counts}

    agents = list(
        AgentDefinition.objects.filter(agent_id__in=agent_ids, is_active=True).order_by('agent_id').values(
            'agent_id', 'name', 'description', 'capabilities'
        )
    )
    out = []
    for a in agents:
        out.append({
            **a,
            'tasks_last_7_days': task_counts.get(a['agent_id'], 0),
        })
    return {'code': 200, 'msg': 'OK', 'data': {'assistants': out}}


@router.get('/tools', summary='工具清单', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_tools(request):
    """返回 Agent 可调用的工具名称与描述（来自 tool_registry）。"""
    _, err = _require_account(request)
    if err:
        return err
    try:
        from apps.agent_gateway.tool_registry import TOOL_DEFINITIONS
    except ImportError:
        return {'code': 200, 'msg': 'OK', 'data': {'tools': []}}
    tools = []
    for name, defn in TOOL_DEFINITIONS.items():
        func = (defn or {}).get('function') or {}
        desc = func.get('description') or ''
        tools.append({'name': name, 'description': desc})
    return {'code': 200, 'msg': 'OK', 'data': {'tools': tools}}


@router.get('/memory-archive', summary='记忆档案列表', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_memory_archive(request, limit: int = 50):
    """最近记忆记录（WorkerMemoryRecord），按创建时间倒序。"""
    _, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_memory import WorkerMemoryRecord

    records = (
        WorkerMemoryRecord.objects.order_by('-created_at')[:limit]
        .values(
            'id', 'worker_code', 'memory_type', 'subject_type', 'subject_key',
            'summary', 'importance_score', 'source_task_id', 'created_at',
            'is_core', 'compressed', 'visibility',
        )
    )
    items = [dict(r) for r in records]
    for r in items:
        if r.get('created_at'):
            r['created_at'] = r['created_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


class SetCoreMemoryIn(Schema):
    worker_code: str
    content: str
    subject_type: Optional[str] = 'persona'
    summary: Optional[str] = ''


@router.post('/memory-archive/set-core', summary='[管理] 设置核心记忆', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_set_core_memory(request, payload: SetCoreMemoryIn):
    """设置 Agent 的核心记忆（始终注入到 system prompt）。"""
    _, err = _require_account(request)
    if err:
        return err
    from .memory_service import set_core_memory
    record_id = set_core_memory(
        worker_code=payload.worker_code,
        content=payload.content,
        subject_type=payload.subject_type or 'persona',
        summary=payload.summary or '',
    )
    return {'code': 200, 'msg': '核心记忆已设置', 'data': {'id': record_id}}


@router.post('/memory-archive/compress', summary='[管理] 手动触发记忆压缩', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_compress_memories(request, worker_code: str = '', subject_key: str = '', threshold: int = 10):
    """手动触发记忆压缩：将堆积的 episodic 记忆合并为 semantic 摘要。"""
    _, err = _require_account(request)
    if err:
        return err
    if not worker_code:
        return _bad_request('worker_code 不能为空')
    from .memory_service import compress_memories
    new_id = compress_memories(worker_code=worker_code, subject_key=subject_key, threshold=threshold)
    if new_id:
        return {'code': 200, 'msg': f'记忆压缩完成，生成摘要 ID={new_id}', 'data': {'new_memory_id': new_id}}
    return {'code': 200, 'msg': '记忆数量未达到压缩阈值，无需压缩', 'data': None}


@router.get('/policy-learning', summary='策略学习列表', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_policy_learning(request, limit: int = 50):
    """最近策略升级记录（WorkerPolicyUpdate）。"""
    _, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_memory import WorkerPolicyUpdate

    updates = (
        WorkerPolicyUpdate.objects.order_by('-created_at')[:limit]
        .values(
            'id', 'worker_code', 'domain_code', 'policy_key', 'outcome',
            'root_cause', 'better_policy', 'replay_score', 'status',
            'created_at', 'activated_at',
        )
    )
    items = [dict(u) for u in updates]
    for u in items:
        if u.get('created_at'):
            u['created_at'] = u['created_at'].isoformat()
        if u.get('activated_at'):
            u['activated_at'] = u['activated_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


class LifecycleActionIn(Schema):
    reason: Optional[str] = ''


@router.post('/policy-learning/{update_id}/activate', summary='[管理] 激活策略升级记录', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_activate_policy_learning(request, update_id: int):
    account, err = _require_account(request)
    if err:
        return err
    from .memory_service import activate_policy_update

    result = activate_policy_update(update_id, operator_id=account.id)
    if not result.get('ok'):
        code = 404 if '不存在' in result.get('message', '') else 400
        return code, {'code': code, 'msg': result.get('message', ''), 'data': None}
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/policy-learning/{update_id}/retire', summary='[管理] 退役策略升级记录', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_retire_policy_learning(request, update_id: int, payload: LifecycleActionIn):
    account, err = _require_account(request)
    if err:
        return err
    from .memory_service import retire_policy_update

    result = retire_policy_update(update_id, operator_id=account.id, reason=payload.reason or '')
    if not result.get('ok'):
        code = 404 if '不存在' in result.get('message', '') else 400
        return code, {'code': code, 'msg': result.get('message', ''), 'data': None}
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/policy-learning/{update_id}/rollback', summary='[管理] 回滚策略升级记录', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_rollback_policy_learning(request, update_id: int, payload: LifecycleActionIn):
    account, err = _require_account(request)
    if err:
        return err
    from .memory_service import rollback_policy_update

    result = rollback_policy_update(update_id, operator_id=account.id, reason=payload.reason or '')
    if not result.get('ok'):
        code = 404 if '不存在' in result.get('message', '') else 400
        return code, {'code': code, 'msg': result.get('message', ''), 'data': None}
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/policy-learning/{update_id}/submit-evaluation', summary='[管理] 提交策略评测', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_submit_policy_evaluation(request, update_id: int):
    account, err = _require_account(request)
    if err:
        return err
    from .memory_service import submit_policy_for_evaluation

    result = submit_policy_for_evaluation(update_id, operator_id=account.id)
    if not result.get('ok'):
        code = 404 if '不存在' in result.get('message', '') else 400
        return code, {'code': code, 'msg': result.get('message', ''), 'data': None}
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/policy-learning/{update_id}/approve', summary='[管理] 批准策略生效', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_approve_policy_evaluation(request, update_id: int):
    account, err = _require_account(request)
    if err:
        return err
    from .memory_service import approve_policy_evaluation

    result = approve_policy_evaluation(update_id, operator_id=account.id)
    if not result.get('ok'):
        code = 404 if '不存在' in result.get('message', '') else 400
        return code, {'code': code, 'msg': result.get('message', ''), 'data': None}
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/policy-learning/{update_id}/reject', summary='[管理] 驳回策略评测', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_reject_policy_evaluation(request, update_id: int, payload: LifecycleActionIn):
    account, err = _require_account(request)
    if err:
        return err
    from .memory_service import reject_policy_evaluation

    result = reject_policy_evaluation(update_id, operator_id=account.id, reason=payload.reason or '')
    if not result.get('ok'):
        code = 404 if '不存在' in result.get('message', '') else 400
        return code, {'code': code, 'msg': result.get('message', ''), 'data': None}
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/orchestrate/resume/{task_id}', summary='恢复中断的编排', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope, 404: ApiEnvelope})
def digital_workforce_resume_orchestration(request, task_id: str):
    """从断点恢复中断/失败的编排。"""
    account, err = _require_account(request)
    if err:
        return err
    try:
        from .orchestration_service import resume_orchestration
        result = resume_orchestration(task_id, account.id)
        return {
            'code': 200, 'msg': '编排已恢复并完成',
            'data': {
                'new_task_id': result.task_id,
                'original_task_id': task_id,
                'status': result.status,
                'aggregated_output': result.aggregated_output[:500],
                'errors': result.errors,
            },
        }
    except ValueError as exc:
        return 400, {'code': 400, 'msg': str(exc), 'data': None}
    except Exception as exc:
        logger.error('resume_orchestration failed for %s: %s', task_id, exc)
        return 400, {'code': 400, 'msg': f'恢复失败: {exc}', 'data': None}


@router.get('/l2-eval-latest', summary='最近一次 L2 真实验收结论', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_l2_eval_latest(request):
    """返回最近一次 L2 真实验收的发布结论。"""
    _, err = _require_account(request)
    if err:
        return err

    from .digital_worker_release_gate_service import get_latest_release_verdict

    verdict = get_latest_release_verdict()
    return {'code': 200, 'msg': 'OK', 'data': verdict}


@router.get('/l2-eval-results/{run_id}', summary='L2 验收报告详情', response={200: ApiEnvelope, 401: ApiEnvelope, 404: ApiEnvelope})
def digital_workforce_l2_eval_results(request, run_id: str):
    """返回指定 run_id 的 L2 验收报告详情。"""
    _, err = _require_account(request)
    if err:
        return err

    import json as _json
    from .digital_worker_release_gate_service import get_report_root

    report_path = get_report_root() / run_id / 'summary.json'
    if not report_path.exists():
        return 404, {'code': 404, 'msg': '验收报告不存在', 'data': None}

    try:
        data = _json.loads(report_path.read_text(encoding='utf-8'))
    except Exception as exc:
        return 404, {'code': 404, 'msg': f'报告解析失败: {exc}', 'data': None}

    return {'code': 200, 'msg': 'OK', 'data': data}


class JudgeOutputIn(Schema):
    agent_output: str
    task_description: str
    judge_focus: Optional[str] = ''
    scenario_id: Optional[str] = ''


@router.post('/judge-output', summary='[管理] LLM Judge 对 Agent 输出打分', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def digital_workforce_judge_output(request, payload: JudgeOutputIn):
    """
    LLM-as-Judge 评分接口：对任意 Agent 输出按 7 维度打分（0-100）。
    只允许传入初始上下文，不允许传入期望答案，评判标准为规模化生产可行性。
    """
    import os
    account, err = _require_account(request)
    if err:
        return err
    if not payload.agent_output or not payload.task_description:
        return _bad_request('agent_output 和 task_description 均不可为空')
    if not os.getenv('KIMI_API_KEY') and not os.getenv('ARK_API_KEY'):
        return 400, {'code': 400, 'msg': 'AI Judge 不可用：需配置 KIMI_API_KEY 或 ARK_API_KEY', 'data': None}

    try:
        import sys
        import os as _os
        backend_root = _os.path.join(_os.path.dirname(__file__), '..', '..', '..')
        if backend_root not in sys.path:
            sys.path.insert(0, backend_root)
        from tests.ai_eval.digital_worker_real_eval_judge import run_llm_judge

        judge_focus_list = [f.strip() for f in payload.judge_focus.split('|') if f.strip()] if payload.judge_focus else \
            ['整体质量', '专业性', '可执行性', '忠实度（不编造）', '风险控制', '完整性', '清晰度']

        class _FakeScenario:
            scenario_id = payload.scenario_id or 'CUSTOM-JUDGE-001'
            title = payload.task_description[:80]
            role_name = 'admin'
            agent_name = 'custom'
            user_message = payload.task_description
            judge_focus = judge_focus_list

        result = run_llm_judge(_FakeScenario(), payload.agent_output)
        overall = result.get('overall_score', 0)
        dims = result.get('dimension_scores', {})
        critical = result.get('critical_issues', [])

        suggestions = []
        if dims.get('correctness', 30) < 24:
            suggestions.append('正确性不足：检查事实准确性和逻辑一致性')
        if dims.get('faithfulness', 10) < 8:
            suggestions.append('忠实度不足：可能包含超出知识库依据的内容')
        if dims.get('completeness', 15) < 10:
            suggestions.append('完整性不足：关键信息点可能缺失')
        if dims.get('actionability', 10) < 6:
            suggestions.append('可执行性不足：建议更具体，可直接指导下一步行动')
        if dims.get('risk_control', 10) < 6:
            suggestions.append('风险控制不足：高风险场景应明确人类确认边界')

        readiness = '已可生产' if overall >= 90 and not critical else \
            '试点可用' if overall >= 80 and not critical else \
            '需整改' if overall >= 70 else '不可用'

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'overall_score': overall,
                'passed': result.get('pass', False),
                'production_readiness': readiness,
                'dimension_scores': dims,
                'critical_issues': critical,
                'minor_issues': result.get('minor_issues', []),
                'judge_summary': result.get('judge_summary', ''),
                'improvement_suggestions': suggestions,
                'scenario_id': result.get('scenario_id', payload.scenario_id or 'CUSTOM'),
            },
        }
    except Exception as exc:
        logger.error('judge-output failed: %s', exc)
        return 400, {'code': 400, 'msg': f'Judge 执行失败: {exc}', 'data': None}


@router.get('/evidence-gate-runs', summary='验收门禁运行记录', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_evidence_gate_runs(request, limit: int = 50):
    """最近 EvidenceGateRun 列表。"""
    _, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_governance import EvidenceGateRun

    runs = (
        EvidenceGateRun.objects.order_by('-created_at')[:limit]
        .values('id', 'gate_type', 'scope', 'status', 'score', 'summary', 'created_at')
    )
    items = [dict(r) for r in runs]
    for r in items:
        if r.get('created_at'):
            r['created_at'] = r['created_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/knowledge-quality-trend', summary='知识质量趋势', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_knowledge_quality_trend(request, package_id: str = '', days: int = 30):
    """按专题包查询知识质量快照时间序列。"""
    _, err = _require_account(request)
    if err:
        return err
    try:
        days = _validate_days(days, default=30)
    except ValueError as exc:
        return _bad_request(str(exc))

    from apps.knowledge.models import KnowledgeQualitySnapshot

    cutoff_date = (timezone.now() - timedelta(days=days)).date()
    qs = KnowledgeQualitySnapshot.objects.filter(snapshot_date__gte=cutoff_date).order_by('package_id', 'snapshot_date')
    if package_id:
        qs = qs.filter(package_id=package_id)
    items = list(qs.values(
        'package_id', 'package_label', 'snapshot_date', 'total_entries',
        'published_entries', 'avg_quality_score', 'expired_count', 'rag_cite_total', 'coverage_rate',
    ))
    for item in items:
        item['snapshot_date'] = item['snapshot_date'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'window_days': days}}


@router.get('/knowledge-quality-summary', summary='知识质量汇总', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_knowledge_quality_summary(request):
    """返回所有专题包最新一天的质量汇总（覆盖率/质量分/引用率/过期率）。"""
    _, err = _require_account(request)
    if err:
        return err

    from apps.knowledge.models import KnowledgeQualitySnapshot

    latest_date = KnowledgeQualitySnapshot.objects.order_by('-snapshot_date').values_list('snapshot_date', flat=True).first()
    if not latest_date:
        return {'code': 200, 'msg': 'OK', 'data': {'summaries': [], 'snapshot_date': None}}

    snapshots = KnowledgeQualitySnapshot.objects.filter(snapshot_date=latest_date).order_by('package_id')
    summaries = []
    for s in snapshots:
        expiry_rate = round(s.expired_count / s.total_entries, 3) if s.total_entries else 0.0
        cite_rate = round(s.rag_cite_total / s.total_entries, 1) if s.total_entries else 0.0
        summaries.append({
            'package_id': s.package_id,
            'package_label': s.package_label,
            'total_entries': s.total_entries,
            'published_entries': s.published_entries,
            'avg_quality_score': s.avg_quality_score,
            'coverage_rate': s.coverage_rate,
            'expiry_rate': expiry_rate,
            'cite_rate_per_entry': cite_rate,
        })
    return {'code': 200, 'msg': 'OK', 'data': {'summaries': summaries, 'snapshot_date': latest_date.isoformat()}}


@router.get('/skill-templates', summary='技能进化模板列表', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_skill_templates(request, status: str = 'draft', limit: int = 50):
    """返回技能进化模板草稿列表（自动提取 + 失败经验）。"""
    _, err = _require_account(request)
    if err:
        return err
    from .models_skills import SkillTemplate
    qs = SkillTemplate.objects.all()
    if status:
        qs = qs.filter(status=status)
    items = list(qs.order_by('-created_at')[:limit].values(
        'id', 'template_id', 'source', 'skill_id_hint', 'worker_code',
        'trigger_condition', 'description', 'confidence_score',
        'status', 'promoted_skill_id', 'created_at',
    ))
    for r in items:
        if r.get('created_at'):
            r['created_at'] = r['created_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.post('/skill-templates/{template_id}/promote', summary='[管理] 提升技能模板为正式技能', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_promote_skill_template(request, template_id: str):
    """将技能进化模板提升为正式 SkillDefinition。"""
    _, err = _require_account(request)
    if err:
        return err
    from .models_skills import SkillTemplate, SkillDefinition
    import uuid as _uuid

    tpl = SkillTemplate.objects.filter(template_id=template_id).first()
    if not tpl:
        return 404, {'code': 404, 'msg': '模板不存在', 'data': None}
    if tpl.status != 'draft':
        return 400, {'code': 400, 'msg': '只有草稿状态的模板可以提升', 'data': None}

    skill_id = tpl.skill_id_hint or f'evolved-{_uuid.uuid4().hex[:8]}'
    obj, created = SkillDefinition.objects.get_or_create(
        skill_id=skill_id,
        defaults={
            'display_name': tpl.description[:50] or f'进化技能-{skill_id}',
            'description': tpl.description,
            'executor': 'agent',
            'risk_level': 'medium',
            'is_active': False,
        },
    )
    tpl.status = 'approved'
    tpl.promoted_skill_id = skill_id
    tpl.save(update_fields=['status', 'promoted_skill_id', 'updated_at'])
    return {'code': 200, 'msg': f'已提升为技能 {skill_id}', 'data': {'skill_id': skill_id, 'created': created}}


@router.post('/skill-templates/{template_id}/reject', summary='[管理] 拒绝技能模板', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_reject_skill_template(request, template_id: str):
    """拒绝技能进化模板。"""
    _, err = _require_account(request)
    if err:
        return err
    from .models_skills import SkillTemplate

    tpl = SkillTemplate.objects.filter(template_id=template_id).first()
    if not tpl:
        return 404, {'code': 404, 'msg': '模板不存在', 'data': None}
    tpl.status = 'rejected'
    tpl.save(update_fields=['status', 'updated_at'])
    return {'code': 200, 'msg': '模板已拒绝', 'data': None}


@router.get('/kpi-trend', summary='岗位 KPI 趋势', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_kpi_trend(request, role_code: str = '', days: int = 30):
    """
    返回 RoleKPISnapshot 时间序列，支持按岗位查询 KPI 趋势。
    不传 role_code 时返回所有岗位的趋势。
    """
    _, err = _require_account(request)
    if err:
        return err
    try:
        days = _validate_days(days, default=30)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_roles import RoleKPISnapshot

    cutoff_date = (timezone.now() - timedelta(days=days)).date()
    qs = RoleKPISnapshot.objects.filter(snapshot_date__gte=cutoff_date).order_by('role_code', 'snapshot_date')
    if role_code:
        qs = qs.filter(role_code=role_code)
    items = []
    for s in qs.values('role_code', 'snapshot_date', 'period_days', 'kpis'):
        items.append({
            'role_code': s['role_code'],
            'snapshot_date': s['snapshot_date'].isoformat(),
            'period_days': s['period_days'],
            'kpis': s['kpis'],
        })
    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'window_days': days}}


@router.get('/kpi-trend/summary', summary='岗位 KPI 环比汇总', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_kpi_trend_summary(request):
    """返回所有岗位最近 7 天与前 7 天的环比变化。"""
    _, err = _require_account(request)
    if err:
        return err

    from .models_roles import RoleKPISnapshot, WorkerRoleDefinition

    today = timezone.now().date()
    recent_7 = today - timedelta(days=7)
    prev_7 = today - timedelta(days=14)

    roles = WorkerRoleDefinition.objects.filter(enabled=True).values_list('role_code', 'role_name')
    summaries = []
    for code, name in roles:
        recent = RoleKPISnapshot.objects.filter(role_code=code, snapshot_date__gte=recent_7).order_by('-snapshot_date').first()
        prev = RoleKPISnapshot.objects.filter(role_code=code, snapshot_date__gte=prev_7, snapshot_date__lt=recent_7).order_by('-snapshot_date').first()
        recent_exec = (recent.kpis or {}).get('total_executions', 0) if recent else 0
        prev_exec = (prev.kpis or {}).get('total_executions', 0) if prev else 0
        delta = recent_exec - prev_exec
        summaries.append({
            'role_code': code,
            'role_name': name,
            'recent_7d_executions': recent_exec,
            'prev_7d_executions': prev_exec,
            'delta': delta,
            'trend': 'up' if delta > 0 else ('down' if delta < 0 else 'flat'),
        })
    return {'code': 200, 'msg': 'OK', 'data': {'summaries': summaries}}


@router.get('/evergreen-watch-reports', summary='持续升级哨塔报告', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_evergreen_watch_reports(request, limit: int = 50):
    """最近 EvergreenWatchReport 列表。"""
    _, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_governance import EvergreenWatchReport

    reports = (
        EvergreenWatchReport.objects.order_by('-created_at')[:limit]
        .values('id', 'watch_type', 'source_name', 'source_url', 'status', 'headline', 'findings', 'created_at')
    )
    items = [dict(r) for r in reports]
    for r in items:
        if r.get('created_at'):
            r['created_at'] = r['created_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/evergreen-watch-reports/{report_id}', summary='哨塔报告详情', response={200: ApiEnvelope, 401: ApiEnvelope, 404: ApiEnvelope})
def digital_workforce_evergreen_watch_report_detail(request, report_id: int):
    """返回单条哨塔报告的完整内容，包括 findings、推荐动作、关联知识条目。"""
    _, err = _require_account(request)
    if err:
        return err

    from .models_governance import EvergreenWatchReport

    report = EvergreenWatchReport.objects.filter(id=report_id).first()
    if not report:
        return 404, {'code': 404, 'msg': '哨塔报告不存在', 'data': None}

    linked_knowledge = []
    try:
        from apps.knowledge.models import KnowledgeEntry
        entries = KnowledgeEntry.objects.filter(
            source_type='evergreen_watch',
            source_key__contains=str(report_id),
            is_deleted=False,
        ).values('id', 'title', 'status', 'entry_type')[:20]
        linked_knowledge = list(entries)
    except Exception:
        pass

    data = {
        'id': report.id,
        'watch_type': report.watch_type,
        'source_name': report.source_name,
        'source_url': report.source_url,
        'status': report.status,
        'headline': report.headline,
        'findings': report.findings,
        'candidates': getattr(report, 'candidates', None) or {},
        'raw_payload': getattr(report, 'raw_payload', None) or {},
        'lifecycle_stages': getattr(report, 'lifecycle_stages', None) or [],
        'role_codes': getattr(report, 'role_codes', None) or [],
        'knowledge_tags': getattr(report, 'knowledge_tags', None) or [],
        'created_at': report.created_at.isoformat() if report.created_at else None,
        'linked_knowledge': linked_knowledge,
    }
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/evergreen-watch-reports/{report_id}/deposit-to-knowledge', summary='[管理] 哨塔报告沉淀为知识条目', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_deposit_watch_report_to_knowledge(request, report_id: int):
    account, err = _require_account(request)
    if err:
        return err
    from .evergreen_watchtower import deposit_watch_report_to_knowledge

    result = deposit_watch_report_to_knowledge(report_id, created_by_id=account.id)
    if not result.get('ok'):
        code = 404 if '不存在' in result.get('message', '') else 400
        return code, {'code': code, 'msg': result.get('message', ''), 'data': None}
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.get('/my-activity', summary='工作动态', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_my_activity(request, limit: int = 50):
    """当前用户的 UnifiedExecutionTask 时间线。"""
    account, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_runtime import UnifiedExecutionTask

    tasks = (
        UnifiedExecutionTask.objects.filter(account_id=account.id)
        .order_by('-created_at')[:limit]
        .values('task_id', 'name', 'target', 'runtime_type', 'status', 'created_at', 'completed_at')
    )
    items = []
    for t in tasks:
        items.append({
            'task_id': t['task_id'],
            'name': t['name'] or t['target'] or '-',
            'agent_or_target': t['target'],
            'runtime_type': t['runtime_type'],
            'status': t['status'],
            'created_at': t['created_at'].isoformat() if t.get('created_at') else None,
            'completed_at': t['completed_at'].isoformat() if t.get('completed_at') else None,
        })
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


# =============================================================================
# 管理 API（需 dashboard.admin.manage）
# =============================================================================

class AgentUpdateSchema(Schema):
    name: Optional[str] = None
    description: Optional[str] = None
    role_title: Optional[str] = None
    system_prompt: Optional[str] = None
    tools: Optional[List[str]] = None
    tier: Optional[str] = None
    avatar_url: Optional[str] = None
    phase: Optional[str] = None
    knowledge_enabled: Optional[bool] = None
    knowledge_top_k: Optional[int] = None
    is_editable_via_ui: Optional[bool] = None
    is_active: Optional[bool] = None


@router.get('/agents/{agent_id}', summary='获取 Agent 配置（花名册详情/编辑用）', response={200: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def get_agent(request, agent_id: str):
    from apps.agent_gateway.models import AgentDefinition
    obj = AgentDefinition.objects.filter(agent_id=agent_id).first()
    if not obj:
        return 404, {'code': 404, 'msg': 'Agent 不存在', 'data': None}
    data = {
        'agent_id': obj.agent_id,
        'name': obj.name,
        'description': obj.description,
        'role_title': obj.role_title,
        'system_prompt': obj.system_prompt,
        'tools': list(obj.tools or []),
        'tier': obj.tier or '',
        'avatar_url': obj.avatar_url or '',
        'phase': obj.phase or '',
        'knowledge_enabled': obj.knowledge_enabled,
        'knowledge_top_k': obj.knowledge_top_k,
        'is_editable_via_ui': obj.is_editable_via_ui,
        'is_active': obj.is_active,
        'provider': obj.provider,
        'model_id': obj.model_id,
        'temperature': obj.temperature,
        'max_tokens': obj.max_tokens,
        'capabilities': list(obj.capabilities or []),
        'paused': getattr(obj, 'paused', False),
        'paused_reason': getattr(obj, 'paused_reason', ''),
        'monthly_budget_usd': float(obj.monthly_budget_usd) if getattr(obj, 'monthly_budget_usd', None) else None,
        'current_month_spend_usd': float(getattr(obj, 'current_month_spend_usd', 0) or 0),
        'parent_agent_id': getattr(obj, 'parent_agent_id', ''),
        'boundaries': getattr(obj, 'boundaries', []) or [],
        'escalation_targets': getattr(obj, 'escalation_targets', []) or [],
    }
    return {'code': 200, 'msg': 'OK', 'data': data}


class AgentPauseIn(Schema):
    reason: Optional[str] = ''


class AgentTrainFeedbackIn(Schema):
    scenario_id: str
    agent_output: str
    score: float = 0.5
    feedback: Optional[str] = ''


@router.post('/agents/{agent_id}/train', summary='[管理] 启动训练会话', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_start_agent_training(request, agent_id: str):
    """启动 Agent 训练会话：返回 session_id 和第一个训练场景的 Agent 输出。"""
    account, err = _require_account(request)
    if err:
        return err
    from apps.agent_gateway.models import AgentDefinition
    agent_def = AgentDefinition.objects.filter(agent_id=agent_id).first()
    if not agent_def:
        return 404, {'code': 404, 'msg': 'Agent 不存在', 'data': None}

    try:
        from tests.ai_eval.digital_worker_real_eval_scenarios import list_core_scenarios
        scenarios = list_core_scenarios()[:3]
        if not scenarios:
            return 400, {'code': 400, 'msg': '无可用训练场景', 'data': None}

        from apps.agent_gateway.services import call_agent
        import uuid as _uuid
        session_id = _uuid.uuid4().hex[:16]

        scenario = scenarios[0]
        call_result = call_agent(account_id=account.id, agent_id=agent_id, message=scenario.user_message, context=scenario.context)

        return {
            'code': 200, 'msg': 'OK',
            'data': {
                'session_id': session_id,
                'agent_id': agent_id,
                'scenario_id': scenario.scenario_id,
                'scenario_title': scenario.title,
                'agent_output': call_result.output_text or '',
                'total_scenarios': len(scenarios),
            },
        }
    except Exception as exc:
        logger.error('start_agent_training failed: %s', exc)
        return 400, {'code': 400, 'msg': f'训练启动失败: {exc}', 'data': None}


@router.post('/agents/{agent_id}/train/{session_id}/feedback', summary='[管理] 提交训练反馈', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_submit_training_feedback(request, agent_id: str, session_id: str, payload: AgentTrainFeedbackIn):
    """提交单轮训练反馈，将修正写入 WorkerPolicyUpdate。"""
    account, err = _require_account(request)
    if err:
        return err
    if not payload.feedback and payload.score >= 0.8:
        return {'code': 200, 'msg': '评分良好，无需修正', 'data': {'saved': False}}

    from apps.secretary.memory_service import learn_policy
    result = learn_policy(
        worker_code=agent_id,
        policy_key=f'{payload.scenario_id}_train_{session_id[:8]}',
        outcome=f'训练场景 {payload.scenario_id} 输出',
        root_cause=f'评分 {payload.score:.1f}/1.0；反馈: {(payload.feedback or "无")[:200]}',
        better_policy=payload.feedback or f'当前输出质量评分 {payload.score:.1f}，继续保持',
        replay_score=payload.score,
        domain_code='training',
    )
    return {'code': 200, 'msg': '反馈已保存', 'data': {'policy_id': result.get('id'), 'saved': True}}


@router.get('/agents/{agent_id}/train/history', summary='[管理] 训练历史', response={200: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_get_training_history(request, agent_id: str):
    """返回 Agent 的训练历史（来自 WorkerPolicyUpdate）。"""
    _, err = _require_account(request)
    if err:
        return err
    from apps.secretary.models_memory import WorkerPolicyUpdate
    items = list(
        WorkerPolicyUpdate.objects.filter(worker_code=agent_id, domain_code='training')
        .order_by('-created_at')[:50]
        .values('id', 'policy_key', 'outcome', 'root_cause', 'better_policy', 'replay_score', 'status', 'created_at')
    )
    for r in items:
        if r.get('created_at'):
            r['created_at'] = r['created_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.post('/agents/{agent_id}/pause', summary='[管理] 暂停 Agent', response={200: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_pause_agent(request, agent_id: str, payload: AgentPauseIn):
    """暂停指定 Agent，暂停后该 Agent 的所有调用请求将被前置拒绝。"""
    from apps.agent_gateway.models import AgentDefinition
    obj = AgentDefinition.objects.filter(agent_id=agent_id).first()
    if not obj:
        return 404, {'code': 404, 'msg': 'Agent 不存在', 'data': None}
    obj.paused = True
    obj.paused_reason = payload.reason or '管理员手动暂停'
    obj.save(update_fields=['paused', 'paused_reason', 'update_time'])
    return {'code': 200, 'msg': f'Agent {agent_id} 已暂停', 'data': {'agent_id': agent_id, 'paused': True}}


@router.post('/agents/{agent_id}/resume', summary='[管理] 恢复 Agent', response={200: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_resume_agent(request, agent_id: str):
    """恢复已暂停的 Agent。"""
    from apps.agent_gateway.models import AgentDefinition
    obj = AgentDefinition.objects.filter(agent_id=agent_id).first()
    if not obj:
        return 404, {'code': 404, 'msg': 'Agent 不存在', 'data': None}
    obj.paused = False
    obj.paused_reason = ''
    obj.save(update_fields=['paused', 'paused_reason', 'update_time'])
    return {'code': 200, 'msg': f'Agent {agent_id} 已恢复', 'data': {'agent_id': agent_id, 'paused': False}}


@router.post('/agents/{agent_id}/set-budget', summary='[管理] 设置 Agent 月预算', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_set_agent_budget(request, agent_id: str, monthly_budget_usd: float = 0):
    """设置 Agent 的月预算上限（USD）。设为 0 表示无限制。"""
    from apps.agent_gateway.models import AgentDefinition
    obj = AgentDefinition.objects.filter(agent_id=agent_id).first()
    if not obj:
        return 404, {'code': 404, 'msg': 'Agent 不存在', 'data': None}
    if monthly_budget_usd < 0:
        return _bad_request('预算不能为负')
    from decimal import Decimal
    obj.monthly_budget_usd = Decimal(str(monthly_budget_usd)) if monthly_budget_usd > 0 else None
    obj.save(update_fields=['monthly_budget_usd', 'update_time'])
    return {'code': 200, 'msg': f'Agent {agent_id} 月预算已设置为 {monthly_budget_usd} USD', 'data': {'agent_id': agent_id, 'monthly_budget_usd': monthly_budget_usd}}


@router.get('/org-chart', summary='数字员工组织架构图', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_org_chart(request):
    """返回 Agent 层级关系树，供前端渲染 Org Chart。"""
    _, err = _require_account(request)
    if err:
        return err
    from apps.agent_gateway.models import AgentDefinition

    agents = AgentDefinition.objects.filter(is_active=True).order_by('agent_id')
    nodes = []
    for a in agents:
        nodes.append({
            'agent_id': a.agent_id,
            'name': a.name,
            'role_title': a.role_title or '',
            'tier': a.tier or '',
            'parent_agent_id': getattr(a, 'parent_agent_id', '') or '',
            'paused': getattr(a, 'paused', False),
            'provider': a.provider,
            'capabilities': list(a.capabilities or [])[:5],
        })
    return {'code': 200, 'msg': 'OK', 'data': {'nodes': nodes}}


@router.get('/handoff-records', summary='Agent 转交记录', response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_handoff_records(request, limit: int = 50):
    """最近 HandoffRecord 列表。"""
    _, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit)
    except ValueError as exc:
        return _bad_request(str(exc))

    from .models_runtime import HandoffRecord

    records = HandoffRecord.objects.order_by('-created_at')[:limit].values(
        'handoff_id', 'from_agent_id', 'to_agent_id', 'handoff_type',
        'reason', 'status', 'task_id', 'created_at',
    )
    items = [dict(r) for r in records]
    for r in items:
        if r.get('created_at'):
            r['created_at'] = r['created_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/agent-cost-overview', summary='Agent 成本概览', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_agent_cost_overview(request):
    """返回所有 Agent 的预算/已用/剩余汇总。"""
    _, err = _require_account(request)
    if err:
        return err
    from apps.agent_gateway.models import AgentDefinition

    agents = AgentDefinition.objects.filter(is_active=True).order_by('agent_id')
    items = []
    for a in agents:
        budget = float(a.monthly_budget_usd) if getattr(a, 'monthly_budget_usd', None) else None
        spent = float(getattr(a, 'current_month_spend_usd', 0) or 0)
        items.append({
            'agent_id': a.agent_id,
            'name': a.name,
            'paused': getattr(a, 'paused', False),
            'monthly_budget_usd': budget,
            'current_month_spend_usd': spent,
            'remaining_usd': round(budget - spent, 2) if budget else None,
            'utilization_pct': round(spent / budget * 100, 1) if budget and budget > 0 else 0,
        })
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.put('/agents/{agent_id}', summary='[管理] 更新 Agent 配置', response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_put_agent(request, agent_id: str, payload: AgentUpdateSchema):
    from apps.agent_gateway.models import AgentDefinition
    obj = AgentDefinition.objects.filter(agent_id=agent_id).first()
    if not obj:
        return 404, {'code': 404, 'msg': 'Agent 不存在', 'data': None}
    if not obj.is_editable_via_ui:
        return 403, {'code': 403, 'msg': '该 Agent 不允许通过 UI 修改', 'data': None}
    updates = payload.dict(exclude_unset=True)
    for key in list(updates.keys()):
        if not hasattr(obj, key):
            del updates[key]
    for key, value in updates.items():
        setattr(obj, key, value)
    try:
        obj.full_clean()
    except Exception as exc:
        return _bad_request(str(exc))
    obj.save()
    return {'code': 200, 'msg': 'OK', 'data': {'agent_id': obj.agent_id}}


class SkillCreateSchema(Schema):
    skill_id: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    executor: str = 'script'
    agent_id: Optional[str] = None
    script_path: Optional[str] = None
    service_path: Optional[str] = None
    service_function: Optional[str] = 'execute'
    timeout: int = 60
    requires_llm: bool = False
    risk_level: str = 'medium'
    requires_approval: bool = False
    agent_tools: Optional[List[str]] = None
    fallback_script: Optional[str] = None
    is_active: bool = True
    bound_workstations: Optional[List[str]] = None


class SkillUpdateSchema(Schema):
    display_name: Optional[str] = None
    description: Optional[str] = None
    executor: Optional[str] = None
    agent_id: Optional[str] = None
    script_path: Optional[str] = None
    service_path: Optional[str] = None
    service_function: Optional[str] = None
    timeout: Optional[int] = None
    requires_llm: Optional[bool] = None
    risk_level: Optional[str] = None
    requires_approval: Optional[bool] = None
    agent_tools: Optional[List[str]] = None
    fallback_script: Optional[str] = None
    is_active: Optional[bool] = None
    bound_workstations: Optional[List[str]] = None


@router.get('/skills', summary='[管理] 技能列表')
@require_permission('dashboard.admin.manage')
def admin_list_skills(request):
    from .models_skills import SkillDefinition
    items = list(
        SkillDefinition.objects.all().order_by('skill_id').values(
            'skill_id', 'display_name', 'description', 'executor', 'agent_id',
            'script_path', 'service_path', 'timeout', 'requires_llm', 'risk_level',
            'requires_approval', 'agent_tools', 'fallback_script', 'is_active', 'bound_workstations',
        )
    )
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.post('/skills', summary='[管理] 新建技能', response={200: ApiEnvelope, 400: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_create_skill(request, payload: SkillCreateSchema):
    from .models_skills import SkillDefinition
    d = payload.dict()
    skill_id = d.pop('skill_id')
    if SkillDefinition.objects.filter(skill_id=skill_id).exists():
        return 400, {'code': 400, 'msg': f'技能 ID 已存在: {skill_id}', 'data': None}
    try:
        _validate_skill_payload(d)
    except ValueError as exc:
        return _bad_request(str(exc))
    obj = SkillDefinition(skill_id=skill_id, **d)
    try:
        obj.full_clean()
    except Exception as exc:
        return _bad_request(str(exc))
    obj.save()
    return {'code': 200, 'msg': 'OK', 'data': {'skill_id': skill_id}}


@router.put('/skills/{skill_id}', summary='[管理] 更新技能', response={200: ApiEnvelope, 400: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_put_skill(request, skill_id: str, payload: SkillUpdateSchema):
    from .models_skills import SkillDefinition
    obj = SkillDefinition.objects.filter(skill_id=skill_id).first()
    if not obj:
        return 404, {'code': 404, 'msg': '技能不存在', 'data': None}
    updates = payload.dict(exclude_unset=True)
    candidate = {
        'executor': updates.get('executor', obj.executor),
        'agent_id': updates.get('agent_id', obj.agent_id),
        'timeout': updates.get('timeout', obj.timeout),
        'risk_level': updates.get('risk_level', obj.risk_level),
        'agent_tools': updates.get('agent_tools', obj.agent_tools),
        'bound_workstations': updates.get('bound_workstations', obj.bound_workstations),
    }
    try:
        _validate_skill_payload(candidate)
    except ValueError as exc:
        return _bad_request(str(exc))
    for key, value in updates.items():
        if hasattr(obj, key):
            setattr(obj, key, value)
    try:
        obj.full_clean()
    except Exception as exc:
        return _bad_request(str(exc))
    obj.save()
    return {'code': 200, 'msg': 'OK', 'data': {'skill_id': skill_id}}


@router.delete('/skills/{skill_id}', summary='[管理] 删除技能')
@require_permission('dashboard.admin.manage')
def admin_delete_skill(request, skill_id: str):
    from .models_skills import SkillDefinition
    obj = SkillDefinition.objects.filter(skill_id=skill_id).first()
    if not obj:
        return 404, {'code': 404, 'msg': '技能不存在', 'data': None}
    obj.delete()
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/routing', summary='[管理] 编排路由配置', response={200: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_get_routing(request):
    from .models_orchestration_config import DomainAgentMapping, DomainSkillMapping, KeywordDomainMapping
    domain_agent = [
        {'domain_code': m.domain_code, 'agent_id': m.agent_id, 'display_name': m.display_name, 'priority': m.priority}
        for m in DomainAgentMapping.objects.all().order_by('domain_code')
    ]
    domain_skill = [
        {'domain_code': m.domain_code, 'skill_id': m.skill_id, 'priority': m.priority}
        for m in DomainSkillMapping.objects.all().order_by('domain_code', '-priority')
    ]
    keyword_domain = [
        {'keyword': m.keyword, 'domain_code': m.domain_code}
        for m in KeywordDomainMapping.objects.all().order_by('keyword')
    ]
    return {'code': 200, 'msg': 'OK', 'data': {'domain_agent': domain_agent, 'domain_skill': domain_skill, 'keyword_domain': keyword_domain}}


class RoutingUpdateSchema(Schema):
    domain_agent: Optional[List[dict]] = None
    domain_skill: Optional[List[dict]] = None
    keyword_domain: Optional[List[dict]] = None


@router.put('/routing', summary='[管理] 更新编排路由', response={200: ApiEnvelope, 400: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_put_routing(request, payload: RoutingUpdateSchema):
    from .models_orchestration_config import DomainAgentMapping, DomainSkillMapping, KeywordDomainMapping
    from .orchestration_service import reload_orchestration_config
    d = payload.dict(exclude_unset=True)
    if 'domain_agent' in d:
        try:
            rows = _validate_routing_rows(d['domain_agent'], ['domain_code'], 'domain_agent')
        except ValueError as exc:
            return _bad_request(str(exc))
        DomainAgentMapping.objects.all().delete()
        for row in rows:
            DomainAgentMapping.objects.update_or_create(
                domain_code=str(row.get('domain_code')).strip(),
                defaults={
                    'agent_id': str(row.get('agent_id') or '').strip(),
                    'display_name': str(row.get('display_name') or '').strip(),
                    'priority': int(row.get('priority', 0)),
                },
            )
    if 'domain_skill' in d:
        try:
            rows = _validate_routing_rows(d['domain_skill'], ['domain_code', 'skill_id'], 'domain_skill')
        except ValueError as exc:
            return _bad_request(str(exc))
        DomainSkillMapping.objects.all().delete()
        for row in rows:
            DomainSkillMapping.objects.update_or_create(
                domain_code=str(row.get('domain_code')).strip(),
                skill_id=str(row.get('skill_id')).strip(),
                defaults={'priority': int(row.get('priority', 0))},
            )
    if 'keyword_domain' in d:
        try:
            rows = _validate_routing_rows(d['keyword_domain'], ['keyword', 'domain_code'], 'keyword_domain')
        except ValueError as exc:
            return _bad_request(str(exc))
        KeywordDomainMapping.objects.all().delete()
        for row in rows:
            KeywordDomainMapping.objects.update_or_create(
                keyword=str(row.get('keyword')).strip(),
                defaults={'domain_code': str(row.get('domain_code')).strip()},
            )
    reload_orchestration_config()
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/workstation-bindings', summary='[管理] 工作台绑定列表', response={200: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_get_workstation_bindings(request):
    from .models_workstation_binding import WorkstationBinding
    items = list(
        WorkstationBinding.objects.all().order_by('workstation_key').values(
            'workstation_key', 'display_name', 'agent_ids', 'skill_ids', 'quick_actions',
        )
    )
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


class WorkstationBindingUpdateSchema(Schema):
    items: List[dict]


@router.put('/workstation-bindings', summary='[管理] 更新工作台绑定', response={200: ApiEnvelope, 400: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_put_workstation_bindings(request, payload: WorkstationBindingUpdateSchema):
    from .models_workstation_binding import WorkstationBinding
    from .claw_registry import reload_registry
    for idx, row in enumerate(payload.items, start=1):
        key = row.get('workstation_key')
        if not key:
            return _bad_request(f'items 第 {idx} 项缺少 workstation_key')
        WorkstationBinding.objects.update_or_create(
            workstation_key=key,
            defaults={
                'display_name': (row.get('display_name') or key)[:120],
                'agent_ids': list(row.get('agent_ids') or []),
                'skill_ids': list(row.get('skill_ids') or []),
                'quick_actions': list(row.get('quick_actions') or []),
            },
        )
    reload_registry()
    return {'code': 200, 'msg': 'OK', 'data': None}


class RoleCreateSchema(Schema):
    role_code: str
    role_name: str
    role_cluster: Optional[str] = None
    service_targets: Optional[List[str]] = None
    core_scenarios: Optional[List[str]] = None
    input_contract: Optional[List[str]] = None
    output_contract: Optional[List[str]] = None
    automation_level: Optional[str] = None
    human_confirmation_points: Optional[List[str]] = None
    kpi_metrics: Optional[List[str]] = None
    mapped_agent_ids: Optional[List[str]] = None
    mapped_skill_ids: Optional[List[str]] = None
    workstation_scope: Optional[List[str]] = None
    baseline_manual_minutes: Optional[int] = None
    enabled: bool = True


class RoleUpdateSchema(Schema):
    role_name: Optional[str] = None
    role_cluster: Optional[str] = None
    service_targets: Optional[List[str]] = None
    core_scenarios: Optional[List[str]] = None
    input_contract: Optional[List[str]] = None
    output_contract: Optional[List[str]] = None
    automation_level: Optional[str] = None
    human_confirmation_points: Optional[List[str]] = None
    kpi_metrics: Optional[List[str]] = None
    mapped_agent_ids: Optional[List[str]] = None
    mapped_skill_ids: Optional[List[str]] = None
    workstation_scope: Optional[List[str]] = None
    baseline_manual_minutes: Optional[int] = None
    enabled: Optional[bool] = None


@router.post('/roles', summary='[管理] 新建岗位定义', response={200: ApiEnvelope, 400: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_create_role(request, payload: RoleCreateSchema):
    from .models_roles import WorkerRoleDefinition

    data = payload.dict()
    role_code = (data.pop('role_code') or '').strip()
    role_name = (data.get('role_name') or '').strip()
    if not role_code:
        return _bad_request('role_code 不能为空')
    if not role_name:
        return _bad_request('role_name 不能为空')
    if WorkerRoleDefinition.objects.filter(role_code=role_code).exists():
        return _bad_request(f'岗位编码已存在: {role_code}')
    try:
        _validate_role_payload(data)
    except ValueError as exc:
        return _bad_request(str(exc))
    for field in (
        'service_targets',
        'core_scenarios',
        'input_contract',
        'output_contract',
        'human_confirmation_points',
        'kpi_metrics',
        'mapped_agent_ids',
        'mapped_skill_ids',
        'workstation_scope',
    ):
        if data.get(field) is None:
            data[field] = []
    if data.get('role_cluster') is None:
        data['role_cluster'] = ''
    if data.get('automation_level') is None:
        data['automation_level'] = ''
    obj = WorkerRoleDefinition(role_code=role_code, **data)
    try:
        obj.full_clean()
    except Exception as exc:
        return _bad_request(str(exc))
    obj.save()
    return {'code': 200, 'msg': 'OK', 'data': {'role_code': obj.role_code}}


@router.put('/roles/{role_code}', summary='[管理] 更新岗位定义', response={200: ApiEnvelope, 400: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_put_role(request, role_code: str, payload: RoleUpdateSchema):
    from .models_roles import WorkerRoleDefinition

    obj = WorkerRoleDefinition.objects.filter(role_code=role_code).first()
    if not obj:
        return 404, {'code': 404, 'msg': '岗位不存在', 'data': None}
    updates = payload.dict(exclude_unset=True)
    try:
        _validate_role_payload(updates)
    except ValueError as exc:
        return _bad_request(str(exc))
    for key, value in updates.items():
        if hasattr(obj, key):
            setattr(obj, key, value)
    try:
        obj.full_clean()
    except Exception as exc:
        return _bad_request(str(exc))
    obj.save()
    return {'code': 200, 'msg': 'OK', 'data': {'role_code': obj.role_code}}


@router.delete('/roles/{role_code}', summary='[管理] 删除岗位定义', response={200: ApiEnvelope, 404: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_delete_role(request, role_code: str):
    from .models_roles import WorkerRoleDefinition

    obj = WorkerRoleDefinition.objects.filter(role_code=role_code).first()
    if not obj:
        return 404, {'code': 404, 'msg': '岗位不存在', 'data': None}
    obj.delete()
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.post('/reload-config', summary='[管理] 刷新配置缓存', response={200: ApiEnvelope})
@require_permission('dashboard.admin.manage')
def admin_reload_config(request):
    from .runtime_plane import load_skill_registry
    from .orchestration_service import reload_orchestration_config
    from .claw_registry import reload_registry
    load_skill_registry(force_reload=True)
    reload_orchestration_config()
    reload_registry()
    return {'code': 200, 'msg': 'OK', 'data': {'reloaded': True}}


# =============================================================================
# 数字员工主动建议（流程内嵌）
# =============================================================================

def _build_suggestions_for_workstation(workstation_key: str) -> list:
    """按工作台生成待处理建议列表，供仪表盘主动推送栏使用。"""
    items = []

    if workstation_key == 'research':
        try:
            from apps.protocol.models import Protocol, ProtocolStatus
            unparsed = Protocol.objects.filter(
                status__in=[ProtocolStatus.DRAFT, ProtocolStatus.UPLOADED],
                is_deleted=False,
            ).order_by('-create_time')[:5]
            for p in unparsed:
                items.append({
                    'suggestion_id': f'research-parse-{p.id}',
                    'type': 'parse_protocol',
                    'title': f'协议「{p.title[:40]}」待解析',
                    'summary': '协议解析员已就绪，可一键启动 AI 解析并生成结构化入排标准、访视计划。',
                    'business_object_type': 'protocol',
                    'business_object_id': str(p.id),
                    'role_code': 'solution_designer',
                    'actions': [
                        {'action_id': 'parse', 'label': '开始解析', 'endpoint': f'/api/v1/protocol/{p.id}/trigger-parse'},
                        {'action_id': 'view', 'label': '查看协议', 'endpoint': f'/research/#/protocols/{p.id}'},
                    ],
                })
        except Exception:
            pass

        # 项目资料统筹员：启动包未生成的已激活协议 + 资料版本核查建议
        try:
            from apps.protocol.models import Protocol, ProtocolStatus
            activated = Protocol.objects.filter(
                status=ProtocolStatus.ACTIVE,
                is_deleted=False,
            ).order_by('-create_time')[:5]
            for p in activated:
                # 启动包建议
                items.append({
                    'suggestion_id': f'research-startup-{p.id}',
                    'type': 'generate_startup_pack',
                    'title': f'协议「{p.title[:40]}」可生成启动包',
                    'summary': '项目资料统筹员可一键生成包含 SOP、模板、资质要求的项目启动包。',
                    'business_object_type': 'protocol',
                    'business_object_id': str(p.id),
                    'role_code': 'project_docs_coordinator',
                    'actions': [
                        {'action_id': 'startup_pack', 'label': '生成启动包', 'endpoint': f'/api/v1/protocol/{p.id}/startup-package'},
                        {'action_id': 'view', 'label': '查看协议', 'endpoint': f'/research/#/protocols/{p.id}'},
                    ],
                })
                # 版本一致性核查建议
                items.append({
                    'suggestion_id': f'research-version-{p.id}',
                    'type': 'version_consistency_check',
                    'title': f'协议「{p.title[:40]}」建议进行版本一致性核查',
                    'summary': '版本守护员可检查协议、SOP、模板之间的版本一致性，识别旧版引用。',
                    'business_object_type': 'protocol',
                    'business_object_id': str(p.id),
                    'role_code': 'version_guardian',
                    'actions': [
                        {'action_id': 'view', 'label': '查看协议', 'endpoint': f'/research/#/protocols/{p.id}'},
                    ],
                })
        except Exception:
            pass

    elif workstation_key == 'quality':
        try:
            from apps.quality.models import Deviation, DeviationStatus
            open_devs = Deviation.objects.filter(
                status__in=[DeviationStatus.IDENTIFIED, DeviationStatus.REPORTED, DeviationStatus.INVESTIGATING],
                is_deleted=False,
            ).exclude(capas__is_deleted=False).order_by('-reported_at')[:5]
            for d in open_devs:
                items.append({
                    'suggestion_id': f'quality-capa-{d.id}',
                    'type': 'create_capa_draft',
                    'title': f'偏差「{d.code}」建议创建 CAPA',
                    'summary': f'质量守护员发现偏差「{d.title[:30]}」尚无关联 CAPA，建议创建 CAPA 草稿。',
                    'business_object_type': 'deviation',
                    'business_object_id': str(d.id),
                    'role_code': 'quality_reviewer',
                    'actions': [
                        {'action_id': 'create_capa', 'label': '创建 CAPA 草稿', 'endpoint': f'/api/v1/quality/deviations/{d.id}/create-capa-draft'},
                        {'action_id': 'view', 'label': '查看偏差', 'endpoint': f'/quality/#/deviations/{d.id}'},
                    ],
                })
        except Exception:
            pass

    elif workstation_key == 'execution':
        try:
            from apps.workorder.models import WorkOrder, WorkOrderStatus
            from django.utils import timezone as tz
            today = tz.now().date()
            unassigned = WorkOrder.objects.filter(
                status=WorkOrderStatus.PENDING,
                assigned_to__isnull=True,
            ).order_by('-create_time')[:3]
            for wo in unassigned:
                items.append({
                    'suggestion_id': f'execution-assign-{wo.id}',
                    'type': 'auto_assign',
                    'title': f'工单「{wo.title[:30]}」待分配',
                    'summary': '工单匹配员可推荐执行人与设备，一键完成派单。',
                    'business_object_type': 'workorder',
                    'business_object_id': str(wo.id),
                    'role_code': 'workorder_matcher',
                    'actions': [
                        {'action_id': 'assign', 'label': '智能派单', 'endpoint': f'/api/v1/workorder/{wo.id}/auto-assign'},
                        {'action_id': 'view', 'label': '查看工单', 'endpoint': f'/execution/#/workorders/{wo.id}'},
                    ],
                })
            overdue = WorkOrder.objects.filter(
                status__in=[WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS],
                due_date__lt=today,
            ).order_by('due_date')[:3]
            for wo in overdue:
                items.append({
                    'suggestion_id': f'execution-overdue-{wo.id}',
                    'type': 'overdue_alert',
                    'title': f'工单「{wo.title[:30]}」已逾期',
                    'summary': f'该工单原定 {wo.due_date} 完成，工单跟踪员建议关注。',
                    'business_object_type': 'workorder',
                    'business_object_id': str(wo.id),
                    'role_code': 'workorder_matcher',
                    'actions': [
                        {'action_id': 'view', 'label': '查看工单', 'endpoint': f'/execution/#/workorders/{wo.id}'},
                    ],
                })
        except Exception:
            pass

    elif workstation_key == 'finance':
        try:
            from .models_orchestration import OrchestrationRun
            runs_with_quotes = OrchestrationRun.objects.filter(
                structured_artifacts__has_key='quote_inputs',
            ).exclude(structured_artifacts__quote_inputs=[]).order_by('-created_at')[:5]
            for run in runs_with_quotes:
                items.append({
                    'suggestion_id': f'finance-quote-{run.task_id}',
                    'type': 'create_quote_draft',
                    'title': '报价输入项已就绪',
                    'summary': f'报价助手从编排「{run.task_id[:20]}」中提取了报价输入项，可一键创建报价草稿。',
                    'business_object_type': 'orchestration_run',
                    'business_object_id': run.task_id,
                    'role_code': 'solution_designer',
                    'actions': [
                        {'action_id': 'create_quote', 'label': '创建报价草稿', 'endpoint': f'/api/v1/finance/quotes/create-from-run/{run.task_id}'},
                        {'action_id': 'view', 'label': '查看回放', 'endpoint': f'/digital-workforce/#/replay/{run.task_id}'},
                    ],
                })
        except Exception:
            pass

    elif workstation_key == 'crm':
        try:
            from apps.crm.models import ClientRiskAlert
            open_alerts = ClientRiskAlert.objects.filter(is_resolved=False).order_by('-created_at')[:5]
            for alert in open_alerts:
                items.append({
                    'suggestion_id': f'crm-alert-{alert.id}',
                    'type': 'client_alert',
                    'title': f'客户预警：{getattr(alert, "alert_type", "风险")}',
                    'summary': getattr(alert, 'description', '客户需求分析员建议关注该预警并及时跟进。')[:100],
                    'business_object_type': 'client',
                    'business_object_id': str(getattr(alert, 'client_id', '')),
                    'role_code': 'customer_demand_analyst',
                    'actions': [{'action_id': 'view', 'label': '查看预警', 'endpoint': f'/crm/#/alerts/{alert.id}'}],
                })
        except Exception:
            pass

    elif workstation_key == 'hr':
        try:
            from apps.hr.models import Staff, GCPStatus
            from django.utils import timezone as tz
            from datetime import timedelta
            expiring = Staff.objects.filter(
                gcp_status=GCPStatus.VALID,
                gcp_expiry_date__lte=tz.now().date() + timedelta(days=30),
                gcp_expiry_date__gte=tz.now().date(),
            ).order_by('gcp_expiry_date')[:5]
            for s in expiring:
                items.append({
                    'suggestion_id': f'hr-gcp-{s.id}',
                    'type': 'gcp_expiring',
                    'title': f'{s.name} GCP 证书即将到期',
                    'summary': f'到期日 {s.gcp_expiry_date}，建议安排续证培训。',
                    'business_object_type': 'staff',
                    'business_object_id': str(s.id),
                    'role_code': 'hr_assistant',
                    'actions': [{'action_id': 'view', 'label': '查看人员', 'endpoint': f'/hr/#/staff/{s.id}'}],
                })
        except Exception:
            pass

    elif workstation_key == 'recruitment':
        try:
            from apps.recruitment.models import SubjectRegistration
            pending = SubjectRegistration.objects.filter(status='pending').order_by('-created_at')[:5]
            for reg in pending:
                items.append({
                    'suggestion_id': f'recruitment-screen-{reg.id}',
                    'type': 'pending_screening',
                    'title': f'报名「{getattr(reg, "name", "")}」待筛选',
                    'summary': '招募助理建议尽快完成初筛。',
                    'business_object_type': 'registration',
                    'business_object_id': str(reg.id),
                    'role_code': 'recruitment_screener',
                    'actions': [{'action_id': 'view', 'label': '查看报名', 'endpoint': f'/recruitment/#/registrations/{reg.id}'}],
                })
        except Exception:
            pass

    elif workstation_key == 'equipment':
        try:
            from apps.resource.models import ResourceItem
            from django.utils import timezone as tz
            from datetime import timedelta
            expiring = ResourceItem.objects.filter(
                next_calibration_date__lte=tz.now().date() + timedelta(days=14),
                next_calibration_date__gte=tz.now().date(),
                is_deleted=False,
            ).order_by('next_calibration_date')[:5]
            for r in expiring:
                items.append({
                    'suggestion_id': f'equipment-cal-{r.id}',
                    'type': 'calibration_due',
                    'title': f'设备「{r.name[:20]}」校准即将到期',
                    'summary': f'到期日 {r.next_calibration_date}，建议安排校准。',
                    'business_object_type': 'equipment',
                    'business_object_id': str(r.id),
                    'role_code': 'equipment_manager',
                    'actions': [{'action_id': 'view', 'label': '查看设备', 'endpoint': f'/equipment/#/items/{r.id}'}],
                })
        except Exception:
            pass

    elif workstation_key == 'ethics':
        try:
            from apps.ethics.models import EthicsApplication, EthicsApplicationStatus
            pending = EthicsApplication.objects.filter(
                status__in=[EthicsApplicationStatus.SUBMITTED, EthicsApplicationStatus.UNDER_REVIEW],
            ).order_by('-created_at')[:5]
            for app in pending:
                items.append({
                    'suggestion_id': f'ethics-app-{app.id}',
                    'type': 'ethics_pending',
                    'title': f'伦理申请「{app.application_number}」待处理',
                    'summary': '伦理资料助理建议尽快审核。',
                    'business_object_type': 'ethics_application',
                    'business_object_id': str(app.id),
                    'role_code': 'ethics_liaison',
                    'actions': [{'action_id': 'view', 'label': '查看申请', 'endpoint': f'/ethics/#/applications/{app.id}'}],
                })
        except Exception:
            pass

    elif workstation_key == 'reception':
        try:
            from apps.subject.models_execution import SubjectAppointment, AppointmentStatus
            from django.utils import timezone as tz
            today = tz.now().date()
            pending_checkin = SubjectAppointment.objects.filter(
                appointment_date=today,
                status=AppointmentStatus.PENDING,
            ).order_by('appointment_time')[:5]
            for appt in pending_checkin:
                items.append({
                    'suggestion_id': f'reception-checkin-{appt.id}',
                    'type': 'pending_checkin',
                    'title': f'受试者 #{appt.subject_id} 待签到',
                    'summary': f'预约时间 {appt.appointment_time}，接待助理建议关注。',
                    'business_object_type': 'appointment',
                    'business_object_id': str(appt.id),
                    'role_code': 'reception_assistant',
                    'actions': [{'action_id': 'view', 'label': '查看预约', 'endpoint': f'/reception/#/appointments/{appt.id}'}],
                })
        except Exception:
            pass

    elif workstation_key == 'material':
        # 样品追踪员：效期预警 + 分发超期未回收样品追踪（含真实写回动作）
        try:
            from apps.sample.models import Product, SampleInstance, SampleStatus
            from django.utils import timezone as tz
            from datetime import timedelta
            today = tz.now().date()
            expiring_products = Product.objects.filter(
                expiry_date__lte=today + timedelta(days=30),
                expiry_date__gte=today,
                is_deleted=False,
            ).order_by('expiry_date')[:5]
            for p in expiring_products:
                items.append({
                    'suggestion_id': f'material-expiry-{p.id}',
                    'type': 'expiry_alert',
                    'title': f'物料「{p.name[:30]}」即将过期',
                    'summary': f'到期日 {p.expiry_date}，样品追踪员建议及时处置或申请延期。',
                    'business_object_type': 'material',
                    'business_object_id': str(p.id),
                    'role_code': 'sample_tracker',
                    'actions': [
                        {'action_id': 'view', 'label': '查看物料', 'endpoint': f'/material/#/products/{p.id}'},
                    ],
                })
            overdue_samples = SampleInstance.objects.filter(
                status=SampleStatus.DISTRIBUTED,
                update_time__lt=tz.now() - timedelta(days=7),
            ).order_by('update_time')[:3]
            for s in overdue_samples:
                items.append({
                    'suggestion_id': f'material-sample-{s.id}',
                    'type': 'sample_tracking',
                    'title': f'样品「{s.unique_code}」已分发超 7 天未回收',
                    'summary': '样品追踪员建议核实样品状态并更新流转记录。',
                    'business_object_type': 'sample',
                    'business_object_id': str(s.id),
                    'role_code': 'sample_tracker',
                    'actions': [
                        {'action_id': 'return', 'label': '标记回收', 'endpoint': f'/api/v1/material/samples/{s.id}/return'},
                        {'action_id': 'destroy', 'label': '申请销毁', 'endpoint': f'/api/v1/material/samples/{s.id}/destroy'},
                        {'action_id': 'view', 'label': '查看样品', 'endpoint': f'/material/#/samples/{s.id}'},
                    ],
                })
        except Exception:
            pass

        # 样品追踪员：工单关联样品缺口（PENDING 工单中 SampleTransaction 无入库记录的）
        try:
            from apps.workorder.models import WorkOrder, WorkOrderStatus
            from apps.sample.models import SampleTransaction
            pending_wo = WorkOrder.objects.filter(
                status__in=[WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED],
            ).order_by('-create_time')[:10]
            for wo in pending_wo:
                has_sample_tx = SampleTransaction.objects.filter(work_order=wo).exists()
                if not has_sample_tx:
                    items.append({
                        'suggestion_id': f'material-wo-sample-{wo.id}',
                        'type': 'workorder_sample_gap',
                        'title': f'工单「{wo.title[:30]}」无关联样品流转记录',
                        'summary': '样品追踪员建议在执行前确认样品已出库并完成样品流转记录，避免实验执行时无样品可用。',
                        'business_object_type': 'workorder',
                        'business_object_id': str(wo.id),
                        'role_code': 'sample_tracker',
                        'actions': [
                            {'action_id': 'view', 'label': '查看工单', 'endpoint': f'/execution/#/workorders/{wo.id}'},
                            {'action_id': 'view_samples', 'label': '查看样品', 'endpoint': f'/material/#/samples'},
                        ],
                    })
                    if len([i for i in items if i.get('type') == 'workorder_sample_gap']) >= 3:
                        break
        except Exception:
            pass

    elif workstation_key == 'facility':
        # 测试执行助理：执行前场地条件核验建议
        try:
            from apps.workorder.models import WorkOrder, WorkOrderStatus
            from django.utils import timezone as tz
            from datetime import timedelta
            today = tz.now().date()
            upcoming = WorkOrder.objects.filter(
                status=WorkOrderStatus.PENDING,
                due_date__gte=today,
                due_date__lte=today + timedelta(days=1),
            ).order_by('due_date')[:3]
            for wo in upcoming:
                items.append({
                    'suggestion_id': f'facility-precheck-{wo.id}',
                    'type': 'pre_execution_check',
                    'title': f'工单「{wo.title[:30]}」即将执行，建议确认场地条件',
                    'summary': '测试执行助理建议在执行前核验环境温湿度、清洁状态和设备可用性。',
                    'business_object_type': 'workorder',
                    'business_object_id': str(wo.id),
                    'role_code': 'test_executor',
                    'actions': [
                        {'action_id': 'view', 'label': '查看工单', 'endpoint': f'/facility/#/workorders/{wo.id}'},
                    ],
                })
        except Exception:
            pass

    elif workstation_key == 'evaluator':
        # 访视依从性链路 1：未来 3 天访视节点提醒
        try:
            from apps.scheduling.models import ScheduleSlot, SlotStatus
            from django.utils import timezone as tz
            from datetime import timedelta
            today = tz.now().date()
            upcoming_slots = ScheduleSlot.objects.filter(
                scheduled_date__gte=today,
                scheduled_date__lte=today + timedelta(days=3),
                status=SlotStatus.CONFIRMED,
            ).select_related('visit_node', 'schedule_plan').order_by('scheduled_date', 'start_time')[:5]
            for slot in upcoming_slots:
                node_name = getattr(slot.visit_node, 'name', str(slot.id)) if slot.visit_node else str(slot.id)
                items.append({
                    'suggestion_id': f'evaluator-visit-{slot.id}',
                    'type': 'upcoming_visit_reminder',
                    'title': f'访视节点「{node_name[:30]}」{slot.scheduled_date} 即将到来',
                    'summary': '访视提醒助理建议提前确认受试者状态、执行人可用性及检测前置条件。',
                    'business_object_type': 'schedule_slot',
                    'business_object_id': str(slot.id),
                    'role_code': 'visit_reminder_assistant',
                    'actions': [
                        {'action_id': 'view', 'label': '查看排程', 'endpoint': f'/evaluator/#/schedule/{slot.id}'},
                    ],
                })
                # 依从性助理记忆写入
                try:
                    from apps.secretary.memory_service import remember
                    remember(
                        worker_code='visit_reminder_assistant',
                        memory_type='episodic',
                        content=f'访视节点 {node_name} 排程于 {slot.scheduled_date}，已生成提醒建议',
                        summary=f'访视提醒: {node_name} @ {slot.scheduled_date}',
                        subject_type='schedule_slot',
                        subject_key=str(slot.id),
                        importance_score=55,
                    )
                except Exception:
                    pass
        except Exception:
            pass

        # 访视依从性链路 2：超窗依从性风险预警（已排程但超过 7 天未执行的 CONFIRMED 节点）
        try:
            from apps.scheduling.models import ScheduleSlot, SlotStatus
            from django.utils import timezone as tz
            from datetime import timedelta
            today = tz.now().date()
            overdue_slots = ScheduleSlot.objects.filter(
                scheduled_date__lt=today - timedelta(days=7),
                status=SlotStatus.CONFIRMED,  # 已确认但未完成
            ).select_related('visit_node', 'schedule_plan').order_by('scheduled_date')[:5]
            for slot in overdue_slots:
                node_name = getattr(slot.visit_node, 'name', str(slot.id)) if slot.visit_node else str(slot.id)
                overdue_days = (today - slot.scheduled_date).days
                items.append({
                    'suggestion_id': f'evaluator-overdue-{slot.id}',
                    'type': 'visit_compliance_risk',
                    'title': f'访视节点「{node_name[:30]}」已超窗 {overdue_days} 天未执行',
                    'summary': f'依从性监测助理检测到该访视节点超过窗口期 {overdue_days} 天仍为「已确认」状态，存在失访风险，建议立即核查。',
                    'business_object_type': 'schedule_slot',
                    'business_object_id': str(slot.id),
                    'role_code': 'visit_reminder_assistant',
                    'actions': [
                        {'action_id': 'view', 'label': '查看排程', 'endpoint': f'/evaluator/#/schedule/{slot.id}'},
                    ],
                })
        except Exception:
            pass

    elif workstation_key in ('lab-personnel', 'secretary'):
        pass

    return items


@router.get('/suggestions', summary='数字员工主动建议（流程内嵌）', response={200: ApiEnvelope, 401: ApiEnvelope})
def digital_workforce_suggestions(request, workstation_key: str = ''):
    """
    按工作台返回数字员工已准备好但用户尚未采纳的建议列表。
    供仪表盘 DigitalWorkerSuggestionBar 使用。
    """
    _, err = _require_account(request)
    if err:
        return err
    if not workstation_key:
        return {'code': 200, 'msg': 'OK', 'data': {'items': []}}
    items = _build_suggestions_for_workstation(workstation_key.strip())
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


# =============================================================================
# 知识条目批量审核（数字员工知识委员会）
# =============================================================================

@router.get(
    '/knowledge-review',
    summary='待审核知识条目列表（含来源分类）',
    response={200: ApiEnvelope, 400: ApiEnvelope, 401: ApiEnvelope},
)
@require_permission('dashboard.admin.manage')
def digital_workforce_knowledge_review_list(request, limit: int = 50, source_type: str = ''):
    """
    列出 status=pending_review 的 KnowledgeEntry，并按来源分类汇总。
    用于数字员工知识委员会（管理员/知识管家）批量审核入库。
    """
    _, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit, default=50, max_limit=100)
    except ValueError as exc:
        return _bad_request(str(exc))

    try:
        from apps.knowledge.models import EntryStatus, KnowledgeEntry

        qs = KnowledgeEntry.objects.filter(
            status=EntryStatus.PENDING_REVIEW,
            is_deleted=False,
        ).order_by('-create_time')

        if source_type.strip():
            qs = qs.filter(source_type=source_type.strip())

        items = list(
            qs[:limit].values(
                'id', 'entry_type', 'title', 'summary', 'tags',
                'source_type', 'source_id', 'source_key',
                'uri', 'namespace', 'quality_score',
                'create_time', 'update_time',
            )
        )
        for item in items:
            if item.get('create_time'):
                item['create_time'] = item['create_time'].isoformat()
            if item.get('update_time'):
                item['update_time'] = item['update_time'].isoformat()

        # 来源分类统计
        from django.db.models import Count
        source_stats = list(
            KnowledgeEntry.objects.filter(
                status=EntryStatus.PENDING_REVIEW,
                is_deleted=False,
            )
            .values('source_type')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'items': items,
                'total': qs.count(),
                'source_stats': source_stats,
            },
        }
    except Exception as exc:
        logger.warning('knowledge-review list failed: %s', exc)
        return _bad_request(f'知识审核列表查询失败: {exc}')


class KnowledgeBatchPublishIn(Schema):
    entry_ids: List[int]
    action: str = 'publish'  # publish | reject


@router.post(
    '/knowledge-review/batch-action',
    summary='[管理] 批量发布或拒绝待审核知识条目',
    response={200: ApiEnvelope, 400: ApiEnvelope, 403: ApiEnvelope},
)
@require_permission('dashboard.admin.manage')
def digital_workforce_knowledge_review_batch(request, payload: KnowledgeBatchPublishIn):
    """
    批量审核：发布（publish）或拒绝（reject）pending_review 状态的知识条目。
    """
    _, err = _require_account(request)
    if err:
        return err

    if payload.action not in ('publish', 'reject'):
        return _bad_request('action 必须是 publish 或 reject')
    if not payload.entry_ids:
        return _bad_request('entry_ids 不能为空')
    if len(payload.entry_ids) > 100:
        return _bad_request('单次最多批量处理 100 条')

    try:
        from apps.knowledge.models import EntryStatus, KnowledgeEntry

        qs = KnowledgeEntry.objects.filter(
            id__in=payload.entry_ids,
            status=EntryStatus.PENDING_REVIEW,
            is_deleted=False,
        )
        count = qs.count()

        if payload.action == 'publish':
            # 先取 ID 列表，再 update（update 后 status 已变，queryset 过滤条件可能失效）
            to_publish_ids = list(qs.values_list('id', flat=True))
            qs.update(
                status=EntryStatus.PUBLISHED,
                is_published=True,
                index_status='pending',  # 触发重新索引
            )
            # 补全 search_vector_text 为空的条目（确保全文检索降级路径可用）
            from apps.knowledge.search_index import build_search_vector_text as _bsvt
            for entry_obj in KnowledgeEntry.objects.filter(id__in=to_publish_ids, search_vector_text=''):
                svt = _bsvt(entry_obj.title or '', entry_obj.summary or '', entry_obj.content or '')
                if svt:
                    KnowledgeEntry.objects.filter(id=entry_obj.id).update(search_vector_text=svt)
            # 发布后异步触发向量索引（Celery 任务；不可用时只记日志）
            for eid in to_publish_ids:
                try:
                    from apps.knowledge.tasks import vectorize_knowledge_entry
                    vectorize_knowledge_entry.apply_async(
                        args=[eid],
                        countdown=2,
                        queue='default',
                    )
                except Exception as celery_exc:
                    logger.info(
                        'vectorize_knowledge_entry enqueue skipped (Celery may be unavailable): entry=%s err=%s',
                        eid,
                        celery_exc,
                    )
            msg = f'已发布 {count} 条知识条目，向量索引任务已提交'
        else:
            qs.update(status=EntryStatus.REJECTED, is_published=False)
            msg = f'已拒绝 {count} 条知识条目'

        return {
            'code': 200,
            'msg': msg,
            'data': {
                'action': payload.action,
                'processed': count,
                'entry_ids': payload.entry_ids,
            },
        }
    except Exception as exc:
        logger.warning('knowledge-review batch-action failed: %s', exc)
        return _bad_request(f'批量操作失败: {exc}')


@router.get(
    '/knowledge-review/quality-report',
    summary='知识条目质量抽查报告',
    response={200: ApiEnvelope, 401: ApiEnvelope},
)
@require_permission('dashboard.admin.manage')
def digital_workforce_knowledge_quality_report(request, limit: int = 100):
    """
    对 pending_review 知识条目做质量抽查：
    - 按来源分类统计平均质量分
    - 列出质量分低于阈值（< 50）的条目，建议人工关注
    - 列出 search_vector_text 为空的条目（全文检索降级路径风险）
    - 列出 summary 为空的条目（RAG 摘要覆盖率风险）
    """
    _, err = _require_account(request)
    if err:
        return err
    try:
        limit = _normalize_limit(limit, default=100, max_limit=200)
    except ValueError as exc:
        return _bad_request(str(exc))

    try:
        from django.db.models import Avg, Count
        from apps.knowledge.models import EntryStatus, KnowledgeEntry

        qs = KnowledgeEntry.objects.filter(
            is_deleted=False,
            status=EntryStatus.PENDING_REVIEW,
        )

        # 来源分类质量分均值
        by_source_quality = list(
            qs.values('source_type')
            .annotate(count=Count('id'), avg_quality=Avg('quality_score'))
            .order_by('source_type')
        )

        # 低质量条目（quality_score 不为 null 且 < 50）
        low_quality = list(
            qs.filter(quality_score__lt=50)
            .order_by('quality_score')[:20]
            .values('id', 'title', 'source_type', 'quality_score', 'create_time')
        )
        for item in low_quality:
            if item.get('create_time'):
                item['create_time'] = item['create_time'].isoformat()

        # search_vector_text 为空的条目
        no_svt = list(
            qs.filter(search_vector_text='')[:20]
            .values('id', 'title', 'source_type', 'quality_score')
        )

        # summary 为空的条目
        no_summary = list(
            qs.filter(summary='')[:20]
            .values('id', 'title', 'source_type', 'quality_score')
        )

        total_pending = qs.count()
        total_no_quality = qs.filter(quality_score__isnull=True).count()

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'total_pending_review': total_pending,
                'total_without_quality_score': total_no_quality,
                'by_source_quality': by_source_quality,
                'low_quality_entries': low_quality,
                'no_search_vector_entries': no_svt,
                'no_summary_entries': no_summary,
                'recommendations': [
                    f'共 {len(low_quality)} 条质量分低于 50，建议人工审查或拒绝',
                    f'共 {len(no_svt)} 条无全文检索文本，发布时将自动回填',
                    f'共 {len(no_summary)} 条无摘要，建议在发布前补充以提高 RAG 命中率',
                ] if (low_quality or no_svt or no_summary) else ['所有待审条目质量指标正常'],
            },
        }
    except Exception as exc:
        logger.warning('knowledge-quality-report failed: %s', exc)
        return _bad_request(f'质量报告生成失败: {exc}')
