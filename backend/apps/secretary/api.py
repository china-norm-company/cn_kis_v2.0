"""
秘书工作台 API

端点：
- GET  /dashboard/stats              工作台统计
- GET  /dashboard/activities         最近动态
- GET  /dashboard/overview           完整工作台总览（三部分）
- GET  /dashboard/feishu-scan       飞书信息扫描
- GET  /dashboard/project-analysis  项目客户分析
- GET  /dashboard/hot-topics        热点话题
- POST /context/ingest              飞书数据接入（feishu-connector 推送）

数据权限：
- stats / project-analysis 中的项目、客户、工单数据根据角色自动过滤
- feishu-scan / activities 始终仅返回当前用户自己的数据（personal scope）
"""
from ninja import Router, Schema, Query
from typing import Optional, List, Any
from django.http import JsonResponse, HttpResponseNotModified
import logging

from apps.identity.decorators import require_permission

router = Router()
mail_router = Router()
logger = logging.getLogger('cn_kis.api')


def _json_response_with_etag(
    payload: dict,
    etag: str,
    cache_ttl_seconds: int = 0,
    status: int = 200,
    x_cache: str = 'MISS',
):
    """
    返回带 ETag/Cache-Control 的 JSON 响应。
    """
    resp = JsonResponse(payload, status=status, json_dumps_params={'ensure_ascii': False})
    if etag:
        resp['ETag'] = f'"{etag}"'
    if cache_ttl_seconds and cache_ttl_seconds > 0:
        resp['Cache-Control'] = f'private, max-age={int(cache_ttl_seconds)}'
    else:
        resp['Cache-Control'] = 'private, no-cache'
    resp['X-Cache'] = x_cache
    return resp


# ============================================================================
# 认证
# ============================================================================
def _get_account(request):
    from apps.identity.services import verify_jwt_token
    from django.conf import settings
    user_id = getattr(request, 'user_id', None)
    if user_id:
        from apps.identity.models import Account
        account = Account.objects.filter(id=user_id, is_deleted=False).first()
        if account:
            return account

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header[7:]
    # 开发旁路：DEBUG 模式下 dev-bypass-token 返回 dev-bypass 账号
    if getattr(settings, 'DEBUG', False) and token == 'dev-bypass-token':
        from apps.identity.models import Account
        bypass_id = getattr(settings, 'DEV_BYPASS_ACCOUNT_ID', None)
        if bypass_id:
            acc = Account.objects.filter(id=bypass_id, is_deleted=False).first()
            if acc:
                return acc
        # 优先找 username=dev-bypass 的账号（与 seed_e2e_data.py 一致）
        acc = Account.objects.filter(username='dev-bypass', is_deleted=False).first()
        if acc:
            return acc
        return Account.objects.filter(is_deleted=False).first()
    payload = verify_jwt_token(token)
    if not payload:
        return None
    from apps.identity.models import Account
    return Account.objects.filter(id=payload.get('user_id'), is_deleted=False).first()


# ============================================================================
# Schema
# ============================================================================
class ContextIngestItem(Schema):
    """单条上下文接入"""
    source_type: str  # mail, im, calendar, task, approval
    source_id: Optional[str] = ''
    summary: Optional[str] = ''
    raw_content: Optional[str] = ''
    metadata: Optional[dict] = {}


class ContextIngestIn(Schema):
    """飞书数据接入请求（feishu-connector 推送）"""
    user_id: str  # 飞书 open_id
    items: List[ContextIngestItem]

class AssistantSummaryGenerateIn(Schema):
    """子衿摘要生成请求"""
    summary_type: str = 'daily'  # daily | weekly | risk | project
    context_snapshot_id: Optional[int] = None
    tone: str = 'ops'  # ops | exec | detail


class AssistantActionSuggestIn(Schema):
    """子衿动作建议请求"""
    context_snapshot_id: Optional[int] = None
    intent: str = 'routine_ops'
    include_explanation: bool = True


class AssistantActionRejectIn(Schema):
    """子衿动作拒绝请求"""
    reason: Optional[str] = ''


class AssistantActionExecuteIn(Schema):
    """子衿动作执行补充参数"""
    override_payload: Optional[dict] = None


class AssistantActionFeedbackIn(Schema):
    """子衿动作反馈请求"""
    adopted: bool
    score: Optional[int] = None
    note: Optional[str] = ''


class AssistantClawReceiptIn(Schema):
    """Kimi Claw 执行回执"""
    run_id: Optional[str] = ''
    status: str = 'success'  # success | failed | partial
    retry_count: int = 0
    output_artifacts: Optional[List[dict]] = []
    screenshot_refs: Optional[List[str]] = []
    message: Optional[str] = ''
    skills_used: Optional[List[str]] = []
    step_traces: Optional[List[dict]] = []
    error_taxonomy: Optional[dict] = {}
    failed_step: Optional[str] = ''
    context_coverage: Optional[dict] = {}
    required_vs_granted_scopes: Optional[dict] = {}


class AssistantClawDelegateIn(Schema):
    """委派给 Kimi Claw 执行"""
    dry_run: bool = False


class AssistantClawPresetApplyIn(Schema):
    """应用 Kimi Claw 角色预设"""
    preset_id: str = 'auto'  # auto|management|operation|support|technical


class AssistantActionBatchConfirmIn(Schema):
    """子衿动作批量确认请求"""
    action_ids: List[int]


class AssistantPolicyUpsertIn(Schema):
    """子衿动作策略更新请求"""
    enabled: bool = True
    requires_confirmation: bool = True
    allowed_risk_levels: List[str] = ['low', 'medium']
    min_priority_score: int = 0
    min_confidence_score: int = 0


class AssistantPreferenceUpsertIn(Schema):
    """子衿个人偏好更新请求"""
    summary_tone: str = 'ops'
    focus_action_types: List[str] = []
    blocked_action_types: List[str] = []
    daily_digest_hour: int = 18
    chat_default_provider: str = 'auto'
    chat_allow_fallback: bool = True
    chat_fallback_provider: str = 'auto'
    route_governance_auto_execute_enabled: bool = False
    route_governance_auto_execute_max_risk: str = 'medium'
    route_governance_auto_execute_min_confidence: int = 75
    route_governance_auto_execute_min_priority: int = 70
    route_governance_auto_execute_approval_mode: str = 'graded'


class AssistantDigestTriggerIn(Schema):
    """日报动作触发请求"""
    force: bool = False


class AssistantFallbackAlertTriggerIn(Schema):
    """通道回退告警触发请求"""
    days: int = 7
    fallback_failed_threshold: int = 3
    fallback_rate_threshold: float = 0.08
    cooldown_hours: int = 12
    force: bool = False


class AssistantRouteGovernanceAlertTriggerIn(Schema):
    """路径治理告警触发请求"""
    days: Optional[int] = None
    override_hit_rate_threshold: Optional[float] = None
    override_success_rate_threshold: Optional[float] = None
    fallback_rate_threshold: Optional[float] = None
    min_applied_threshold: Optional[int] = None
    cooldown_hours: Optional[int] = None
    force: bool = False


class AssistantResearchInsightPushIn(Schema):
    """研究洞察入箱请求"""
    card_types: Optional[List[str]] = []
    include_llm: bool = True


class AssistantRecommendedRouteIn(Schema):
    """按推荐路径处理请求"""
    dry_run_preferred: bool = True


class AssistantResearchRouteOverrideIn(Schema):
    """研究路径手动覆写请求"""
    overrides: Optional[dict] = {}


class AssistantRouteGovernancePresetApplyIn(Schema):
    """路径治理角色预设应用请求"""
    preset_id: str = 'auto'


class AssistantRouteGovernanceThresholdUpsertIn(Schema):
    """路径治理阈值配置更新请求"""
    coverage_rate_min: Optional[float] = None
    applied_7d_min: Optional[int] = None
    alert_days: Optional[int] = None
    override_hit_rate_threshold: Optional[float] = None
    override_success_rate_threshold: Optional[float] = None
    fallback_rate_threshold: Optional[float] = None
    min_applied_threshold: Optional[int] = None
    cooldown_hours: Optional[int] = None


# ============================================================================
# 端点
# ============================================================================
@router.get('/stats', summary='工作台统计')
@require_permission('dashboard.stats.read')
def dashboard_stats(request):
    """项目数、进行中、待处理工单、AI对话数（数据权限过滤）"""
    from .services import get_dashboard_stats
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    data = get_dashboard_stats(account)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/activities', summary='最近动态')
@require_permission('dashboard.activities.read')
def dashboard_activities(request):
    """系统最新操作记录（仅当前用户）"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_dashboard_activities
    data = get_dashboard_activities(account.id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/overview', summary='完整工作台总览')
@require_permission('dashboard.overview.read')
def dashboard_overview(request, refresh: bool = False):
    """三部分：飞书扫描、项目分析、热点话题"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_full_dashboard_overview
    data = get_full_dashboard_overview(account, force_refresh=refresh)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/feishu-preflight', summary='飞书四源权限预检')
@require_permission('dashboard.feishu_scan.read')
def feishu_preflight(request):
    """登录后预检 mail/im/calendar/task 权限，失败时前端展示一键重授权（子衿）"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import run_feishu_preflight
    data = run_feishu_preflight(account)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/feishu-auth-monitor', summary='飞书授权健康监控（管理员）')
@require_permission('admin.monitor.read')
def feishu_auth_monitor(request):
    """
    聚合统计 t_feishu_user_token 中 last_error_code 分布、requires_reauth 率、
    issuer_app_id 签发源分布，供运营排查授权问题。

    仅允许 admin/superadmin 访问。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_feishu_auth_monitor_stats
    data = get_feishu_auth_monitor_stats()
    return {'code': 200, 'msg': 'OK', 'data': data}



@require_permission('dashboard.feishu_scan.read')
def dashboard_feishu_scan(request, refresh: bool = False):
    """第一部分：邮件、聊天、日历、任务关键信息"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_feishu_scan_overview
    data = get_feishu_scan_overview(account, force_refresh=refresh)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/project-analysis', summary='项目客户分析')
@require_permission('dashboard.project_analysis.read')
def dashboard_project_analysis(request, refresh: bool = False):
    """第二部分：项目/客户历史与现状分析（数据权限过滤）"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_project_analysis_overview
    data = get_project_analysis_overview(account, force_refresh=refresh)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/hot-topics', summary='热点话题')
@require_permission('dashboard.hot_topics.read')
def dashboard_hot_topics(request, refresh: bool = False):
    """第三部分：热点话题与趋势跟进"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_hot_topics_overview
    data = get_hot_topics_overview(account, force_refresh=refresh)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/digital-worker-release-gate', summary='数字员工试点发布门禁')
@require_permission('dashboard.overview.read')
def dashboard_digital_worker_release_gate(request):
    """返回最近一轮真实能力验收的发布结论（可试点/需整改/禁止上线）与运营指标，供试点发布流程使用。"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .digital_worker_release_gate_service import get_latest_release_verdict
    data = get_latest_release_verdict()
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/manager-overview', summary='管理驾驶舱总览')
@require_permission('dashboard.overview.read')
def manager_overview(
    request,
    preset_trend_days: int = 30,
    threshold_timeline_days: int = 30,
    threshold_timeline_limit: int = 20,
):
    """研究经理管理驾驶舱：项目健康度 + 风险预警 + 财务摘要 + KPI"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from datetime import date, timedelta
    from decimal import Decimal
    from django.db.models import Count, Q, Sum, DecimalField
    from django.db.models.functions import Coalesce

    today = date.today()
    week_ago = today - timedelta(days=7)
    trend_days = 7 if int(preset_trend_days or 30) <= 7 else (90 if int(preset_trend_days or 30) >= 90 else 30)
    timeline_days = 7 if int(threshold_timeline_days or 30) <= 7 else (90 if int(threshold_timeline_days or 30) >= 90 else 30)
    timeline_limit = max(5, min(100, int(threshold_timeline_limit or 20)))

    # --- KPI ---
    try:
        from apps.protocol.models import Protocol
        active_projects = Protocol.objects.filter(status='active', is_deleted=False).count()
    except Exception:
        active_projects = 0

    try:
        from apps.subject.models import Enrollment
        total_subjects = Enrollment.objects.filter(status='enrolled').count()
    except Exception:
        total_subjects = 0

    try:
        from apps.workorder.models import WorkOrder
        wo_qs = WorkOrder.objects.filter(is_deleted=False)
        week_completed = wo_qs.filter(
            status__in=['completed', 'approved'],
            completed_at__date__gte=week_ago,
        ).count()
        overdue_wo = wo_qs.filter(
            due_date__lt=today,
        ).exclude(status__in=['completed', 'approved', 'cancelled']).count()
    except Exception:
        week_completed = 0
        overdue_wo = 0

    try:
        from apps.quality.models import Deviation
        open_deviations = Deviation.objects.exclude(
            status__in=['closed', 'capa_complete'],
        ).count()
    except Exception:
        open_deviations = 0

    try:
        from apps.finance.models import PaymentPlan
        pending_payment = PaymentPlan.objects.filter(
            status__in=['pending', 'overdue'],
        ).aggregate(total=Coalesce(Sum('remaining_amount'), Decimal('0'), output_field=DecimalField()))['total']
    except Exception:
        pending_payment = 0

    kpi = {
        'active_projects': active_projects,
        'total_subjects': total_subjects,
        'week_completed': week_completed,
        'overdue_workorders': overdue_wo,
        'pending_payment': float(pending_payment) if pending_payment else 0,
        'open_deviations': open_deviations,
    }

    # --- Project Health ---
    project_health = []
    try:
        from apps.protocol.models import Protocol
        from apps.subject.models import Enrollment
        from apps.workorder.models import WorkOrder
        from apps.quality.models import Deviation, CAPA

        protocols = Protocol.objects.filter(status='active', is_deleted=False)[:20]
        for p in protocols:
            enrolled = Enrollment.objects.filter(protocol=p, status='enrolled').count()
            total_enrollment = Enrollment.objects.filter(protocol=p).count()
            sample_size = p.sample_size or 0
            enrollment_rate = round(enrolled / sample_size * 100, 1) if sample_size > 0 else 0

            wo_total = WorkOrder.objects.filter(enrollment__protocol=p, is_deleted=False).count()
            wo_done = WorkOrder.objects.filter(
                enrollment__protocol=p, is_deleted=False,
                status__in=['completed', 'approved'],
            ).count()
            completion_rate = round(wo_done / wo_total * 100, 1) if wo_total > 0 else 0

            dev_count = Deviation.objects.filter(project_id=p.id).exclude(status='closed').count()
            capa_count = CAPA.objects.filter(deviation__project_id=p.id).exclude(status='closed').count()

            wo_overdue = WorkOrder.objects.filter(
                enrollment__protocol=p, is_deleted=False,
                due_date__lt=today,
            ).exclude(status__in=['completed', 'approved', 'cancelled']).count()

            risk_score = wo_overdue * 3 + dev_count * 2 + capa_count
            if risk_score >= 6:
                health = 'critical'
            elif risk_score >= 3:
                health = 'warning'
            else:
                health = 'healthy'

            project_health.append({
                'id': p.id,
                'title': p.title,
                'code': p.code or '',
                'product_category': getattr(p, 'product_category', '') or '',
                'sample_size': sample_size,
                'enrolled': enrolled,
                'enrollment_rate': enrollment_rate,
                'wo_total': wo_total,
                'wo_done': wo_done,
                'completion_rate': completion_rate,
                'deviation_count': dev_count,
                'capa_count': capa_count,
                'overdue_wo': wo_overdue,
                'health': health,
                'risk_score': risk_score,
            })
        project_health.sort(key=lambda x: -x['risk_score'])
    except Exception as e:
        project_health = []

    # --- Risk Alerts ---
    alerts = []
    try:
        from apps.workorder.models import WorkOrder
        overdue_wos = WorkOrder.objects.filter(
            due_date__lt=today, is_deleted=False,
        ).exclude(status__in=['completed', 'approved', 'cancelled']).order_by('due_date')[:5]
        for wo in overdue_wos:
            due = wo.due_date.date() if hasattr(wo.due_date, 'date') else wo.due_date
            overdue_days = (today - due).days if due else 0
            alerts.append({
                'type': 'overdue_workorder',
                'severity': 'high',
                'title': f'工单逾期: {wo.title}',
                'detail': f'截止 {due}，已逾期 {overdue_days} 天',
                'entity_id': wo.id,
            })
    except Exception:
        pass

    try:
        from apps.quality.models import CAPA
        overdue_capas = CAPA.objects.filter(
            status='overdue',
        ).order_by('due_date')[:5]
        for c in overdue_capas:
            alerts.append({
                'type': 'overdue_capa',
                'severity': 'high',
                'title': f'CAPA逾期: {c.title}',
                'detail': f'截止 {c.due_date}',
                'entity_id': c.id,
            })
    except Exception:
        pass

    try:
        from apps.resource.models import ResourceItem
        expiring_equipment = ResourceItem.objects.filter(
            next_calibration_date__lte=today + timedelta(days=7),
            next_calibration_date__gte=today,
            is_deleted=False,
        )[:5]
        for eq in expiring_equipment:
            alerts.append({
                'type': 'calibration_expiring',
                'severity': 'medium',
                'title': f'设备校准即将到期: {eq.name}',
                'detail': f'到期日 {eq.next_calibration_date}',
                'entity_id': eq.id,
            })
    except Exception:
        pass

    # 路径治理预设覆盖率（P3.32）
    route_governance_coverage = {
        'total_accounts': 0,
        'enabled_accounts': 0,
        'coverage_rate': 0.0,
        'approval_modes': {'graded': 0, 'direct': 0},
    }
    route_governance_preset_trend = {
        'window_days': trend_days,
        'applied_window': 0,
        'applied_7d': 0,
        'applied_30d': 0,
        'daily_window': [],
    }
    route_governance_preset_alert = {
        'enabled': False,
        'level': 'healthy',
        'message': '',
        'thresholds': {'coverage_rate_min': 0.5, 'applied_7d_min': 1},
    }
    route_governance_threshold_change_timeline = {
        'window_days': timeline_days,
        'limit': timeline_limit,
        'items': [],
    }
    route_governance_threshold_change_summary = {
        'window_days': timeline_days,
        'total_changes': 0,
        'operators_count': 0,
        'top_changed_fields': [],
    }
    try:
        from apps.identity.models import Account, AccountStatus, AccountType
        from .models import AssistantUserPreference
        from apps.audit.models import AuditLog
        from .services import get_route_governance_thresholds
        threshold_cfg = get_route_governance_thresholds(account).get('thresholds', {})
        route_governance_preset_alert['thresholds'] = {
            'coverage_rate_min': float(threshold_cfg.get('coverage_rate_min', 0.5) or 0.5),
            'applied_7d_min': int(threshold_cfg.get('applied_7d_min', 1) or 1),
        }
        account_ids = list(
            Account.objects.filter(
                is_deleted=False,
                status=AccountStatus.ACTIVE,
                account_type=AccountType.INTERNAL,
            ).values_list('id', flat=True)
        )
        route_governance_coverage['total_accounts'] = len(account_ids)
        pref_rows = AssistantUserPreference.objects.filter(
            account_id__in=account_ids,
            preference_key='assistant_preferences',
        ).values('account_id', 'preference_value')
        enabled = 0
        graded = 0
        direct = 0
        for r in pref_rows:
            value = r.get('preference_value') or {}
            if not isinstance(value, dict):
                continue
            if bool(value.get('route_governance_auto_execute_enabled', False)):
                enabled += 1
            mode = str(value.get('route_governance_auto_execute_approval_mode') or 'graded').strip().lower()
            if mode == 'direct':
                direct += 1
            else:
                graded += 1
        route_governance_coverage['enabled_accounts'] = enabled
        route_governance_coverage['approval_modes'] = {'graded': graded, 'direct': direct}
        total = int(route_governance_coverage['total_accounts'] or 0)
        route_governance_coverage['coverage_rate'] = round(enabled / total, 3) if total > 0 else 0.0

        # 预设变更趋势（窗口可配置）
        now_dt = timezone.now()
        day_trend = now_dt - timedelta(days=trend_days)
        day30 = now_dt - timedelta(days=30)
        day7 = now_dt - timedelta(days=7)
        logs = list(
            AuditLog.objects.filter(
                resource_type='assistant_route_governance_preset',
                create_time__gte=day_trend,
            ).values('create_time')
        )
        route_governance_preset_trend['applied_window'] = len(logs)
        route_governance_preset_trend['applied_7d'] = sum(1 for x in logs if x['create_time'] >= day7)
        route_governance_preset_trend['applied_30d'] = (
            AuditLog.objects.filter(
                resource_type='assistant_route_governance_preset',
                create_time__gte=day30,
            ).count()
        )
        by_day = {}
        for i in range(trend_days - 1, -1, -1):
            d = (now_dt - timedelta(days=i)).date()
            by_day[d.isoformat()] = 0
        for x in logs:
            d = x['create_time'].date().isoformat()
            if d in by_day:
                by_day[d] += 1
        route_governance_preset_trend['daily_window'] = [
            {'date': k, 'applied': v}
            for k, v in by_day.items()
        ]

        # 阈值变更审计时间线（窗口/条数可配置）
        day_timeline = now_dt - timedelta(days=timeline_days)
        threshold_logs = list(
            AuditLog.objects.filter(
                resource_type='assistant_route_governance_threshold',
                create_time__gte=day_timeline,
            )
            .order_by('-create_time')[:timeline_limit]
            .values(
                'create_time',
                'account_id',
                'account_name',
                'description',
                'changed_fields',
                'old_value',
                'new_value',
            )
        )
        route_governance_threshold_change_summary['total_changes'] = len(threshold_logs)
        route_governance_threshold_change_summary['operators_count'] = len({x.get('account_id') for x in threshold_logs if x.get('account_id')})
        field_counter = {}
        for x in threshold_logs:
            for f in (x.get('changed_fields') or []):
                key = str(f or '').strip()
                if not key:
                    continue
                field_counter[key] = int(field_counter.get(key, 0) or 0) + 1
        route_governance_threshold_change_summary['top_changed_fields'] = [
            {'field': k, 'count': v}
            for k, v in sorted(field_counter.items(), key=lambda t: t[1], reverse=True)[:5]
        ]
        route_governance_threshold_change_timeline['items'] = [
            {
                'at': x['create_time'].isoformat() if x.get('create_time') else '',
                'operator_id': x.get('account_id'),
                'operator_name': x.get('account_name') or '',
                'description': x.get('description') or '',
                'changed_fields': x.get('changed_fields') or [],
                'old_value': x.get('old_value') or {},
                'new_value': x.get('new_value') or {},
            }
            for x in threshold_logs
        ]

        # 覆盖率阈值告警
        coverage_min = float(route_governance_preset_alert['thresholds']['coverage_rate_min'])
        applied_7d_min = int(route_governance_preset_alert['thresholds']['applied_7d_min'])
        coverage_rate = float(route_governance_coverage.get('coverage_rate', 0.0) or 0.0)
        applied_7d = int(route_governance_preset_trend.get('applied_7d', 0) or 0)
        if coverage_rate < coverage_min or applied_7d < applied_7d_min:
            route_governance_preset_alert['enabled'] = True
            route_governance_preset_alert['level'] = 'warning' if coverage_rate >= (coverage_min * 0.7) else 'critical'
            route_governance_preset_alert['message'] = (
                f'路径治理预设覆盖率/活跃度偏低：覆盖率 {coverage_rate:.1%}（阈值 {coverage_min:.1%}），'
                f'近7天应用 {applied_7d} 次（阈值 {applied_7d_min} 次）'
            )
        else:
            route_governance_preset_alert['message'] = '路径治理预设覆盖率与应用活跃度正常'
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': {
        'kpi': kpi,
        'project_health': project_health,
        'alerts': alerts,
        'route_governance_preset_coverage': route_governance_coverage,
        'route_governance_preset_trend': route_governance_preset_trend,
        'route_governance_preset_alert': route_governance_preset_alert,
        'route_governance_threshold_change_timeline': route_governance_threshold_change_timeline,
        'route_governance_threshold_change_summary': route_governance_threshold_change_summary,
    }}


@router.get('/trends', summary='趋势分析')
@require_permission('dashboard.overview.read')
def dashboard_trends(request, protocol_id: Optional[int] = None,
                     granularity: str = 'day'):
    """A1：趋势分析引擎 — 入组/工单/偏差/营收趋势 + 完成日期预测"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .trend_service import get_all_trends
    data = get_all_trends(protocol_id=protocol_id, granularity=granularity)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/alerts', summary='多维预警中心')
@require_permission('dashboard.overview.read')
def dashboard_alerts(request):
    """A2：多维预警中心 — 8 种预警类型聚合"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .alert_service import generate_all_alerts
    data = generate_all_alerts(account)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/team-overview', summary='团队全景')
@require_permission('dashboard.overview.read')
def dashboard_team(request):
    """E1：团队负荷视图"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .team_service import get_team_overview
    data = get_team_overview(account.id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/team-capacity', summary='团队产能')
@require_permission('dashboard.overview.read')
def dashboard_team_capacity(request, start_date: Optional[str] = None,
                            end_date: Optional[str] = None):
    """E1：团队产能分析"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from datetime import date as date_type
    from .team_service import get_team_capacity
    sd = date_type.fromisoformat(start_date) if start_date else None
    ed = date_type.fromisoformat(end_date) if end_date else None
    data = get_team_capacity(account.id, start_date=sd, end_date=ed)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/portfolio', summary='项目组合看板')
@require_permission('dashboard.overview.read')
def dashboard_portfolio(request):
    """A3：项目组合看板 — 多项目里程碑 + 健康度 + 财务聚合"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from decimal import Decimal
    from apps.protocol.models import Protocol
    from apps.scheduling.models import ScheduleMilestone, SchedulePlan
    from apps.subject.models import Enrollment
    from apps.finance.models import Contract
    from django.db.models import Sum, DecimalField
    from django.db.models.functions import Coalesce

    projects = []
    protocols = Protocol.objects.filter(status='active', is_deleted=False)[:30]
    for p in protocols:
        enrolled = Enrollment.objects.filter(protocol=p, status='enrolled').count()
        contract_amount = Contract.objects.filter(
            protocol_id=p.id,
        ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

        milestones = []
        plans = SchedulePlan.objects.filter(visit_plan__protocol=p)
        for plan in plans:
            for ms in ScheduleMilestone.objects.filter(schedule_plan=plan).order_by('target_date'):
                milestones.append({
                    'type': ms.milestone_type,
                    'name': ms.name,
                    'target_date': ms.target_date.isoformat(),
                    'actual_date': ms.actual_date.isoformat() if ms.actual_date else None,
                    'is_achieved': ms.is_achieved,
                })

        projects.append({
            'id': p.id,
            'title': p.title,
            'code': p.code or '',
            'enrolled': enrolled,
            'sample_size': p.sample_size or 0,
            'contract_amount': float(contract_amount),
            'milestones': milestones,
        })

    return {'code': 200, 'msg': 'OK', 'data': {'projects': projects}}


@router.get('/resource-conflicts', summary='资源冲突检测')
@require_permission('dashboard.overview.read')
def resource_conflicts(request, start_date: Optional[str] = None,
                       end_date: Optional[str] = None):
    """A3：跨项目资源冲突检测"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from datetime import date as date_type
    from apps.scheduling.models import ScheduleSlot
    from django.db.models import Count

    sd = date_type.fromisoformat(start_date) if start_date else date_type.today()
    from datetime import timedelta as td
    ed = date_type.fromisoformat(end_date) if end_date else sd + td(days=14)

    # Find resources assigned to multiple slots on the same date
    conflicts = (
        ScheduleSlot.objects.filter(
            scheduled_date__gte=sd,
            scheduled_date__lte=ed,
            status__in=['planned', 'confirmed'],
            assigned_to_id__isnull=False,
        )
        .values('assigned_to_id', 'scheduled_date')
        .annotate(slot_count=Count('id'))
        .filter(slot_count__gt=1)
        .order_by('scheduled_date')
    )

    conflict_list = []
    for c in conflicts:
        slots = ScheduleSlot.objects.filter(
            assigned_to_id=c['assigned_to_id'],
            scheduled_date=c['scheduled_date'],
            status__in=['planned', 'confirmed'],
        ).select_related('visit_node')
        conflict_list.append({
            'person_id': c['assigned_to_id'],
            'date': c['scheduled_date'].isoformat(),
            'count': c['slot_count'],
            'slots': [
                {
                    'id': s.id,
                    'visit_node': s.visit_node.name if s.visit_node else '',
                    'start_time': s.start_time.isoformat() if s.start_time else None,
                    'end_time': s.end_time.isoformat() if s.end_time else None,
                }
                for s in slots
            ],
        })

    return {'code': 200, 'msg': 'OK', 'data': {'conflicts': conflict_list}}


@router.get('/my-todo', summary='个人待办聚合')
def my_todo(request):
    """聚合当前用户跨工作台待办：工单、审批、CAPA、培训、伦理 + 未读通知

    仅需登录；数据已按 account_id 隔离，不依赖 dashboard.overview.read（避免种子未同步时工作台首页不可用）。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services.todo_service import UnifiedTodoService

    todos = UnifiedTodoService.get_my_todos(account.id)

    # 未读通知数
    try:
        from apps.notification.models import NotificationRecord
        unread_count = NotificationRecord.objects.filter(
            recipient_id=account.id,
            status__in=['sent', 'delivered'],
        ).count()
    except Exception:
        unread_count = 0

    # 汇总计数（按 type 聚合）
    summary = {
        'workorders': sum(1 for t in todos if t.get('type') == 'workorder'),
        'overdue_workorders': sum(1 for t in todos if t.get('type') == 'overdue_workorder'),
        'approvals': sum(1 for t in todos if t.get('type') == 'approval'),
        'pending_changes': sum(1 for t in todos if t.get('type') == 'pending_change'),
        'upcoming_visits': sum(1 for t in todos if t.get('type') == 'upcoming_visit'),
        'capa': sum(1 for t in todos if t.get('type') == 'capa'),
        'training': sum(1 for t in todos if t.get('type') == 'training'),
        'ethics': sum(1 for t in todos if t.get('type') == 'ethics'),
        'unread_notifications': unread_count,
        'total': len(todos),
    }

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': todos,
        'summary': summary,
    }}


@router.get('/business-pipeline', summary='商务管线概览')
@require_permission('dashboard.overview.read')
def business_pipeline(request):
    """研究经理商务管线：商机 + 报价 + 合同 + 回款聚合"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from decimal import Decimal
    from django.db.models import Sum, Count, Q, DecimalField
    from django.db.models.functions import Coalesce

    funnel = {
        'opportunities': {'count': 0, 'amount': 0},
        'quotes': {'count': 0, 'amount': 0},
        'contracts': {'count': 0, 'amount': 0},
        'payments': {'count': 0, 'amount': 0},
    }
    project_business = []

    # 当前用户负责的项目 ID（公共过滤器）
    try:
        from apps.protocol.models import Protocol
        my_protocol_ids = set(Protocol.objects.filter(
            created_by_id=account.id, is_deleted=False,
        ).values_list('id', flat=True))
        try:
            team_ids = Protocol.objects.filter(
                team_members__contains=[{'id': account.id}],
                is_deleted=False,
            ).values_list('id', flat=True)
            my_protocol_ids |= set(team_ids)
        except Exception:
            pass
        my_protocol_ids = list(my_protocol_ids)
    except Exception:
        my_protocol_ids = []

    # 商机：按 owner_id 过滤
    try:
        from apps.crm.models import Opportunity
        opp_stats = Opportunity.objects.filter(
            is_deleted=False, owner_id=account.id,
        ).aggregate(
            count=Count('id'),
            amount=Coalesce(Sum('estimated_amount'), Decimal('0'), output_field=DecimalField()),
        )
        funnel['opportunities'] = {
            'count': opp_stats['count'],
            'amount': float(opp_stats['amount']),
        }
    except Exception:
        pass

    # 报价：按项目关联过滤
    try:
        from apps.finance.models import Quote
        quote_stats = Quote.objects.filter(
            is_deleted=False, protocol_id__in=my_protocol_ids,
        ).aggregate(
            count=Count('id'),
            amount=Coalesce(Sum('total_amount'), Decimal('0'), output_field=DecimalField()),
        )
        funnel['quotes'] = {
            'count': quote_stats['count'],
            'amount': float(quote_stats['amount']),
        }
    except Exception:
        pass

    # 合同：按项目关联过滤
    try:
        from apps.finance.models import Contract
        contract_stats = Contract.objects.filter(
            is_deleted=False, protocol_id__in=my_protocol_ids,
        ).aggregate(
            count=Count('id'),
            amount=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()),
        )
        funnel['contracts'] = {
            'count': contract_stats['count'],
            'amount': float(contract_stats['amount']),
        }
    except Exception:
        pass

    # 回款：按项目关联过滤
    try:
        from apps.finance.models import Payment
        payment_stats = Payment.objects.filter(
            is_deleted=False, invoice__contract__protocol_id__in=my_protocol_ids,
        ).aggregate(
            count=Count('id'),
            amount=Coalesce(Sum('actual_amount'), Decimal('0'), output_field=DecimalField()),
        )
        funnel['payments'] = {
            'count': payment_stats['count'],
            'amount': float(payment_stats['amount']),
        }
    except Exception:
        pass

    # Per-project business status（仅返回当前用户负责的项目）
    try:
        from apps.protocol.models import Protocol
        from apps.finance.models import Contract, Invoice, Payment
        protocols = Protocol.objects.filter(
            status='active', is_deleted=False, id__in=my_protocol_ids,
        )[:20]
        for p in protocols:
            contract_amount = Contract.objects.filter(
                protocol_id=p.id, is_deleted=False,
            ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

            invoiced = Invoice.objects.filter(
                contract__protocol_id=p.id, is_deleted=False,
            ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

            received = Payment.objects.filter(
                invoice__contract__protocol_id=p.id, is_deleted=False,
            ).aggregate(total=Coalesce(Sum('actual_amount'), Decimal('0'), output_field=DecimalField()))['total']

            outstanding = float(contract_amount) - float(received)

            project_business.append({
                'project_id': p.id,
                'project_title': p.title,
                'project_code': p.code or '',
                'contract_amount': float(contract_amount),
                'invoiced': float(invoiced),
                'received': float(received),
                'outstanding': max(outstanding, 0),
                'collection_rate': round(float(received) / float(contract_amount) * 100, 1) if contract_amount > 0 else 0,
                'overdue': outstanding > 0 and float(invoiced) > float(received),
            })
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': {
        'funnel': funnel,
        'projects': project_business,
    }}


@router.post('/context/ingest', summary='飞书数据接入（feishu-connector 推送）', auth=None)
def context_ingest(request, data: ContextIngestIn):
    """
    feishu-connector 推送飞书采集数据到此端点，写入 personal_context 表
    完整路径：POST /api/v1/dashboard/context/ingest
    """
    from .models import PersonalContext
    from .mail_signal_ingest import upsert_mail_signal_event_from_context
    created = 0
    for item in data.items:
        row = PersonalContext.objects.create(
            user_id=data.user_id,
            source_type=item.source_type,
            source_id=item.source_id or '',
            summary=item.summary or '',
            raw_content=item.raw_content or '',
            metadata=item.metadata or {},
        )
        if row.source_type == 'mail':
            upsert_mail_signal_event_from_context(
                user_id=row.user_id,
                source_id=row.source_id,
                summary=row.summary,
                raw_content=row.raw_content,
                metadata=row.metadata,
                context_id=row.id,
            )
        created += 1
    return {'code': 200, 'msg': 'OK', 'data': {'created': created}}


@router.get('/assistant/context', summary='子衿上下文快照')
@require_permission('assistant.context.read')
def assistant_context(request, time_range: str = '7d', force_refresh: bool = False):
    """
    P1：按权限生成子衿上下文快照
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import build_assistant_context_snapshot
    data = build_assistant_context_snapshot(
        account=account,
        time_range=time_range,
        force_refresh=force_refresh,
    )
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/assistant/summary/generate', summary='子衿摘要草稿生成')
@require_permission('assistant.summary.generate')
def assistant_summary_generate(request, data: AssistantSummaryGenerateIn):
    """
    P1：基于上下文快照生成摘要草稿
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import generate_assistant_summary
    result = generate_assistant_summary(
        account=account,
        summary_type=data.summary_type,
        context_snapshot_id=data.context_snapshot_id,
        tone=data.tone,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/actions/suggest', summary='子衿动作建议生成')
@require_permission('assistant.summary.generate')
def assistant_actions_suggest(request, data: AssistantActionSuggestIn):
    """
    P2：从上下文生成动作建议并进入待确认动作箱
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import suggest_assistant_actions
    result = suggest_assistant_actions(
        account=account,
        context_snapshot_id=data.context_snapshot_id,
        intent=data.intent,
        include_explanation=data.include_explanation,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/assistant/actions/inbox', summary='子衿待确认动作箱')
@require_permission('assistant.context.read')
def assistant_actions_inbox(request, status: str = 'pending_confirm'):
    """
    P2：查看动作建议与执行状态
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_action_inbox
    result = get_action_inbox(account=account, status=status)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/actions/{action_id}/confirm', summary='确认子衿动作')
@require_permission('assistant.automation.execute')
def assistant_action_confirm(request, action_id: int):
    """
    P2：确认动作（执行前置）
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import confirm_action
    result = confirm_action(account=account, action_id=action_id)
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/actions/{action_id}/reject', summary='拒绝子衿动作')
@require_permission('assistant.automation.execute')
def assistant_action_reject(request, action_id: int, data: AssistantActionRejectIn):
    """
    P2：拒绝动作
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import reject_action
    result = reject_action(account=account, action_id=action_id, reason=data.reason or '')
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/actions/{action_id}/execute', summary='执行子衿动作')
@require_permission('assistant.automation.execute')
def assistant_action_execute(request, action_id: int, data: Optional[AssistantActionExecuteIn] = None):
    """
    P2：执行动作（默认需先确认）
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import execute_action
    result = execute_action(
        account=account,
        action_id=action_id,
        override_payload=(data.override_payload if data else {}) or {},
    )
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/actions/{action_id}/route-recommended', summary='按推荐路径处理动作')
@require_permission('assistant.automation.execute')
def assistant_action_route_recommended(request, action_id: int, data: Optional[AssistantRecommendedRouteIn] = None):
    """
    P3.20：后端统一执行“确认->分流处理”，并自动写入反馈。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import apply_recommended_route
    result = apply_recommended_route(
        account=account,
        action_id=action_id,
        dry_run_preferred=bool(data.dry_run_preferred) if data else True,
    )
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/actions/{action_id}/feedback', summary='提交子衿动作反馈')
@require_permission('assistant.summary.generate')
def assistant_action_feedback(request, action_id: int, data: AssistantActionFeedbackIn):
    """
    P2.7：记录建议采纳反馈，用于后续策略优化
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import submit_action_feedback
    result = submit_action_feedback(
        account=account,
        action_id=action_id,
        adopted=data.adopted,
        score=data.score,
        note=data.note or '',
    )
    from .feedback_loop_service import invalidate_profile_cache
    invalidate_profile_cache(account.id)
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.get('/assistant/learning/profile', summary='用户行为画像（D7）')
@require_permission('assistant.summary.generate')
def assistant_learning_profile(request, days: int = 90):
    """
    D7：返回用户的 AI 学习行为画像，包含各动作类型的采纳率、权重和策略建议。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .feedback_loop_service import build_user_behavior_profile
    profile = build_user_behavior_profile(account.id, days=max(7, min(180, days)))
    return {'code': 200, 'msg': 'OK', 'data': profile}


@router.get('/assistant/learning/summary', summary='反馈学习摘要（D7）')
@require_permission('assistant.summary.generate')
def assistant_learning_summary(request, days: int = 30):
    """
    D7：用户反馈学习摘要，用于前端学习状态仪表盘。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .feedback_loop_service import get_user_feedback_summary
    summary = get_user_feedback_summary(account.id, days=max(7, min(180, days)))
    return {'code': 200, 'msg': 'OK', 'data': summary}


@router.get('/assistant/learning/agent-context', summary='Agent 学习上下文注入（D7）')
@require_permission('assistant.summary.generate')
def assistant_learning_agent_context(request, agent_id: str = 'general-assistant'):
    """
    D7：为指定 Agent 生成个性化学习上下文（system prompt 注入片段）。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .feedback_loop_service import generate_agent_learning_context
    context = generate_agent_learning_context(account.id, agent_id)
    return {'code': 200, 'msg': 'OK', 'data': {'agent_id': agent_id, 'learning_context': context}}


@router.post('/assistant/actions/{action_id}/claw-receipt', summary='回写Kimi Claw执行回执')
@require_permission('assistant.automation.execute')
def assistant_action_claw_receipt(request, action_id: int, data: AssistantClawReceiptIn):
    """
    P3.11：记录 Kimi Claw 执行回执（run_id/产物/截图/重试次数）。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import submit_claw_execution_receipt
    result = submit_claw_execution_receipt(
        account=account,
        action_id=action_id,
        run_id=(data.run_id or '').strip(),
        status=data.status,
        retry_count=data.retry_count,
        output_artifacts=data.output_artifacts or [],
        screenshot_refs=data.screenshot_refs or [],
        message=data.message or '',
        skills_used=data.skills_used or [],
        step_traces=data.step_traces or [],
        error_taxonomy=data.error_taxonomy or {},
        failed_step=data.failed_step or '',
        context_coverage=data.context_coverage or {},
        required_vs_granted_scopes=data.required_vs_granted_scopes or {},
    )
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/actions/{action_id}/delegate-claw', summary='委派Kimi Claw执行动作')
@require_permission('assistant.automation.execute')
def assistant_action_delegate_claw(request, action_id: int, data: Optional[AssistantClawDelegateIn] = None):
    """
    P3.13：下发动作到 Kimi Claw 执行，并自动记录回执。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import delegate_action_to_kimi_claw
    result = delegate_action_to_kimi_claw(
        account=account,
        action_id=action_id,
        dry_run=bool(data.dry_run) if data else False,
    )
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.get('/assistant/actions/{action_id}/replay', summary='获取动作执行回放')
@require_permission('assistant.context.read')
def assistant_action_replay(request, action_id: int):
    """
    P3.12：查看动作执行历史与回执资产（run_id/产物/截图）。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_action_execution_replay
    result = get_action_execution_replay(account=account, action_id=action_id)
    return {'code': 200 if result.get('ok') else 404, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/actions/batch-confirm', summary='批量确认子衿动作')
@require_permission('assistant.automation.execute')
def assistant_actions_batch_confirm(request, data: AssistantActionBatchConfirmIn):
    """
    P3.10：批量确认动作，降低人工重复确认成本。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import batch_confirm_actions
    result = batch_confirm_actions(account=account, action_ids=data.action_ids or [])
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.get('/assistant/claw/templates', summary='Kimi Claw 角色模板库')
@require_permission('assistant.context.read')
def assistant_claw_templates(request):
    """
    P3.10：按当前账号角色返回可用 Kimi Claw 执行模板。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_kimi_claw_templates
    result = get_kimi_claw_templates(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/assistant/claw/presets', summary='Kimi Claw 角色预设列表')
@require_permission('assistant.preference.manage')
def assistant_claw_presets(request):
    """
    P3.15：返回可应用的角色预设及推荐项。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import list_kimi_claw_presets
    result = list_kimi_claw_presets(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/assistant/claw/skills/bundles', summary='Kimi Claw 角色技能包')
@require_permission('assistant.preference.manage')
def assistant_claw_skill_bundles(request):
    """
    P3.16：返回角色技能包与安装状态。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import list_kimi_claw_skill_bundles
    result = list_kimi_claw_skill_bundles(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/assistant/claw/iteration-metrics', summary='Kimi Claw 复盘迭代指标')
@require_permission('assistant.context.read')
def assistant_claw_iteration_metrics(request, days: int = 7):
    """
    周维度复盘指标：成功率、scope缺口、上下文缺口、skills成功率。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_claw_iteration_metrics
    result = get_claw_iteration_metrics(account=account, days=days)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/assistant/research/insights', summary='研究中台洞察卡片')
@require_permission('assistant.context.read')
def assistant_research_insights(request, include_llm: bool = False):
    """
    P3.17：产品/市场/竞品/论文方法/客户执行预判洞察。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_research_insight_cards
    result = get_research_insight_cards(account=account, include_llm=bool(include_llm))
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/research/insights/actions', summary='研究洞察一键入箱')
@require_permission('assistant.summary.generate')
def assistant_research_insights_push_actions(request, data: AssistantResearchInsightPushIn):
    """
    P3.18：将研究洞察卡片转为 pending_confirm 动作。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import push_research_insights_to_action_inbox
    result = push_research_insights_to_action_inbox(
        account=account,
        card_types=data.card_types or [],
        include_llm=bool(data.include_llm),
    )
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.get('/assistant/research/routes/preferences', summary='研究路径覆写偏好')
@require_permission('assistant.preference.manage')
def assistant_research_route_preferences(request):
    """
    P3.22：获取研究洞察路径手动覆写配置。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_research_route_preferences
    result = get_research_route_preferences(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/research/routes/preferences', summary='保存研究路径覆写偏好')
@require_permission('assistant.preference.manage')
def assistant_research_route_preferences_upsert(request, data: AssistantResearchRouteOverrideIn):
    """
    P3.22：保存研究洞察路径手动覆写配置。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import upsert_research_route_preferences
    result = upsert_research_route_preferences(account=account, overrides=data.overrides or {})
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.get('/assistant/route-governance/presets', summary='路径治理角色预设列表')
@require_permission('assistant.preference.manage')
def assistant_route_governance_presets(request):
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import list_route_governance_presets
    result = list_route_governance_presets(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/route-governance/presets/apply', summary='应用路径治理角色预设')
@require_permission('assistant.preference.manage')
def assistant_route_governance_presets_apply(request, data: AssistantRouteGovernancePresetApplyIn):
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import apply_route_governance_preset
    result = apply_route_governance_preset(account=account, preset_id=data.preset_id)
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/claw/presets/apply', summary='应用 Kimi Claw 角色预设')
@require_permission('assistant.preference.manage')
def assistant_claw_presets_apply(request, data: AssistantClawPresetApplyIn):
    """
    P3.15：一键应用角色化 Claw 偏好预设。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import apply_kimi_claw_preset
    result = apply_kimi_claw_preset(account=account, preset_id=data.preset_id)
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.get('/assistant/preferences', summary='子衿个人偏好')
@require_permission('assistant.preference.manage')
def assistant_preferences(request):
    """
    P3.3：获取个人偏好配置
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_assistant_preferences
    result = get_assistant_preferences(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/preferences', summary='更新子衿个人偏好')
@require_permission('assistant.preference.manage')
def assistant_preferences_upsert(request, data: AssistantPreferenceUpsertIn):
    """
    P3.3：保存个人偏好配置
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import upsert_assistant_preferences
    result = upsert_assistant_preferences(
        account=account,
        payload={
            'summary_tone': data.summary_tone,
            'focus_action_types': data.focus_action_types or [],
            'blocked_action_types': data.blocked_action_types or [],
            'daily_digest_hour': data.daily_digest_hour,
            'chat_default_provider': data.chat_default_provider,
            'chat_allow_fallback': data.chat_allow_fallback,
            'chat_fallback_provider': data.chat_fallback_provider,
            'route_governance_auto_execute_enabled': data.route_governance_auto_execute_enabled,
            'route_governance_auto_execute_max_risk': data.route_governance_auto_execute_max_risk,
            'route_governance_auto_execute_min_confidence': data.route_governance_auto_execute_min_confidence,
            'route_governance_auto_execute_min_priority': data.route_governance_auto_execute_min_priority,
            'route_governance_auto_execute_approval_mode': data.route_governance_auto_execute_approval_mode,
        },
    )
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.get('/assistant/route-governance-alert/thresholds', summary='获取路径治理阈值配置')
@require_permission('assistant.preference.manage')
def assistant_route_governance_alert_thresholds(request):
    """
    P3.34：读取路径治理告警阈值配置（账号级）。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_route_governance_thresholds
    result = get_route_governance_thresholds(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/route-governance-alert/thresholds', summary='更新路径治理阈值配置')
@require_permission('assistant.preference.manage')
def assistant_route_governance_alert_thresholds_upsert(request, data: AssistantRouteGovernanceThresholdUpsertIn):
    """
    P3.34：更新路径治理告警阈值配置（账号级）。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import upsert_route_governance_thresholds
    payload = {
        k: v for k, v in {
            'coverage_rate_min': data.coverage_rate_min,
            'applied_7d_min': data.applied_7d_min,
            'alert_days': data.alert_days,
            'override_hit_rate_threshold': data.override_hit_rate_threshold,
            'override_success_rate_threshold': data.override_success_rate_threshold,
            'fallback_rate_threshold': data.fallback_rate_threshold,
            'min_applied_threshold': data.min_applied_threshold,
            'cooldown_hours': data.cooldown_hours,
        }.items() if v is not None
    }
    result = upsert_route_governance_thresholds(account=account, payload=payload)
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.post('/assistant/digest/trigger', summary='触发日报动作生成')
@require_permission('assistant.summary.generate')
def assistant_digest_trigger(request, data: AssistantDigestTriggerIn):
    """
    P3.4：按偏好节律触发日报动作（进入动作箱）
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import create_daily_digest_action_if_due
    result = create_daily_digest_action_if_due(account=account, force=bool(data.force))
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/assistant/fallback-alert/trigger', summary='触发通道回退告警动作')
@require_permission('assistant.summary.generate')
def assistant_fallback_alert_trigger(request, data: AssistantFallbackAlertTriggerIn):
    """
    P3.9：当回退失败/回退率超阈值时，写入通道告警动作到动作箱。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import create_fallback_alert_action_if_due
    result = create_fallback_alert_action_if_due(
        account=account,
        days=data.days,
        fallback_failed_threshold=data.fallback_failed_threshold,
        fallback_rate_threshold=data.fallback_rate_threshold,
        cooldown_hours=data.cooldown_hours,
        force=bool(data.force),
    )
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/assistant/route-governance-alert/trigger', summary='触发路径治理告警动作')
@require_permission('assistant.summary.generate')
def assistant_route_governance_alert_trigger(request, data: AssistantRouteGovernanceAlertTriggerIn):
    """
    P3.24：当覆写命中率/成功率/回退率异常时，写入治理告警动作。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import create_route_governance_alert_action_if_due, get_route_governance_thresholds
    cfg = get_route_governance_thresholds(account=account).get('thresholds', {})
    result = create_route_governance_alert_action_if_due(
        account=account,
        days=int(data.days if data.days is not None else cfg.get('alert_days', 30)),
        override_hit_rate_threshold=float(
            data.override_hit_rate_threshold
            if data.override_hit_rate_threshold is not None
            else cfg.get('override_hit_rate_threshold', 0.6)
        ),
        override_success_rate_threshold=float(
            data.override_success_rate_threshold
            if data.override_success_rate_threshold is not None
            else cfg.get('override_success_rate_threshold', 0.5)
        ),
        fallback_rate_threshold=float(
            data.fallback_rate_threshold
            if data.fallback_rate_threshold is not None
            else cfg.get('fallback_rate_threshold', 0.25)
        ),
        min_applied_threshold=int(
            data.min_applied_threshold
            if data.min_applied_threshold is not None
            else cfg.get('min_applied_threshold', 5)
        ),
        cooldown_hours=int(
            data.cooldown_hours
            if data.cooldown_hours is not None
            else cfg.get('cooldown_hours', 12)
        ),
        force=bool(data.force),
    )
    return {'code': 200, 'msg': result.get('message', 'OK'), 'data': result}


@router.get('/assistant/policies', summary='子衿动作策略列表')
@require_permission('assistant.policy.manage')
def assistant_policies(request):
    """
    P3：获取当前账号动作策略（默认策略 + 自定义覆盖）
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import get_assistant_policies
    result = get_assistant_policies(account=account)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/assistant/policies/{action_type}', summary='更新子衿动作策略')
@require_permission('assistant.policy.manage')
def assistant_policy_upsert(request, action_type: str, data: AssistantPolicyUpsertIn):
    """
    P3：按动作类型写入策略
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .services import upsert_assistant_policy
    result = upsert_assistant_policy(
        account=account,
        action_type=action_type,
        enabled=data.enabled,
        requires_confirmation=data.requires_confirmation,
        allowed_risk_levels=data.allowed_risk_levels or [],
        min_priority_score=data.min_priority_score,
        min_confidence_score=data.min_confidence_score,
    )
    return {'code': 200 if result.get('ok') else 400, 'msg': result.get('message', ''), 'data': result}


@router.get('/assistant/actions/insights', summary='子衿动作学习洞察')
@require_permission('assistant.context.read')
def assistant_action_insights(request, days: int = 90):
    """
    P2.9：输出动作采纳率/评分/学习增益与近4周趋势
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_action_learning_insights
    result = get_action_learning_insights(account=account, days=days)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/assistant/actions/insights/summary', summary='子衿动作学习管理摘要')
@require_permission('assistant.context.read')
def assistant_action_insights_summary(
    request,
    days: int = 90,
    include_llm: bool = False,
    action_types: str = '',
    top_n: int = 5,
    if_none_match: str = '',
    force_refresh: bool = False,
):
    """
    P2.10：输出学习洞察管理摘要（下滑动作、机会动作、改进建议）
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_cached_action_learning_summary, record_assistant_cache_metric
    action_type_list = [s.strip() for s in action_types.split(',') if s.strip()] if action_types else []
    result = get_cached_action_learning_summary(
        account=account,
        days=days,
        include_llm=include_llm,
        action_types=action_type_list,
        top_n=top_n,
        force_refresh=force_refresh,
    )
    cache_hit = bool(result.pop('_cache_hit', False))
    cache_key = result.pop('_cache_key', '')
    request_if_none_match = (if_none_match or request.META.get('HTTP_IF_NONE_MATCH', '')).strip().strip('"')
    if request_if_none_match and request_if_none_match == result.get('etag', ''):
        not_modified = HttpResponseNotModified()
        not_modified['ETag'] = f'"{result.get("etag", "")}"'
        if result.get('cache_ttl_seconds'):
            not_modified['Cache-Control'] = f'private, max-age={int(result.get("cache_ttl_seconds"))}'
        not_modified['X-Cache'] = 'REVALIDATED'
        record_assistant_cache_metric(endpoint='summary', status='REVALIDATED')
        logger.info(
            "assistant_cache endpoint=summary status=304 account_id=%s cache_hit=%s key=%s",
            account.id,
            cache_hit,
            cache_key,
        )
        return not_modified
    payload = {'code': 200, 'msg': 'OK', 'data': result}
    resp = _json_response_with_etag(
        payload=payload,
        etag=result.get('etag', ''),
        cache_ttl_seconds=int(result.get('cache_ttl_seconds', 0) or 0),
        x_cache='HIT' if cache_hit else 'MISS',
    )
    logger.info(
        "assistant_cache endpoint=summary status=200 account_id=%s cache_hit=%s key=%s",
        account.id,
        cache_hit,
        cache_key,
    )
    record_assistant_cache_metric(endpoint='summary', status='HIT' if cache_hit else 'MISS')
    return resp


@router.get('/assistant/actions/widget', summary='子衿动作学习小组件')
@require_permission('assistant.context.read')
def assistant_action_widget(
    request,
    days: int = 30,
    action_types: str = '',
    top_n: int = 3,
    if_none_match: str = '',
    force_refresh: bool = False,
):
    """
    P2.11：返回首页可直接消费的小组件数据结构
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_cached_action_learning_widget_data, record_assistant_cache_metric
    action_type_list = [s.strip() for s in action_types.split(',') if s.strip()] if action_types else []
    result = get_cached_action_learning_widget_data(
        account=account,
        days=days,
        action_types=action_type_list,
        top_n=top_n,
        force_refresh=force_refresh,
    )
    cache_hit = bool(result.pop('_cache_hit', False))
    cache_key = result.pop('_cache_key', '')
    request_if_none_match = (if_none_match or request.META.get('HTTP_IF_NONE_MATCH', '')).strip().strip('"')
    if request_if_none_match and request_if_none_match == result.get('etag', ''):
        not_modified = HttpResponseNotModified()
        not_modified['ETag'] = f'"{result.get("etag", "")}"'
        if result.get('cache_ttl_seconds'):
            not_modified['Cache-Control'] = f'private, max-age={int(result.get("cache_ttl_seconds"))}'
        not_modified['X-Cache'] = 'REVALIDATED'
        record_assistant_cache_metric(endpoint='widget', status='REVALIDATED')
        logger.info(
            "assistant_cache endpoint=widget status=304 account_id=%s cache_hit=%s key=%s",
            account.id,
            cache_hit,
            cache_key,
        )
        return not_modified
    payload = {'code': 200, 'msg': 'OK', 'data': result}
    resp = _json_response_with_etag(
        payload=payload,
        etag=result.get('etag', ''),
        cache_ttl_seconds=int(result.get('cache_ttl_seconds', 0) or 0),
        x_cache='HIT' if cache_hit else 'MISS',
    )
    logger.info(
        "assistant_cache endpoint=widget status=200 account_id=%s cache_hit=%s key=%s",
        account.id,
        cache_hit,
        cache_key,
    )
    record_assistant_cache_metric(endpoint='widget', status='HIT' if cache_hit else 'MISS')
    return resp


@router.get('/assistant/cache/metrics', summary='子衿缓存命中率指标')
@require_permission('assistant.context.read')
def assistant_cache_metrics(request, days: int = 7):
    """
    P2.16：返回 summary/widget 的缓存命中指标与趋势
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_assistant_cache_metrics
    result = get_assistant_cache_metrics(days=days)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/assistant/metrics', summary='子衿策略效果指标')
@require_permission('assistant.context.read')
def assistant_effect_metrics(request, days: int = 30):
    """
    P3.2：返回策略效果核心指标与趋势
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .services import get_assistant_effect_metrics
    result = get_assistant_effect_metrics(account=account, days=days)
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# Claw 注册表 API — 工作台 × 技能 × Agent 绑定查询
# ============================================================================

@router.get('/claw/registry', summary='Claw 注册表（全部工作台）')
def claw_registry_full(request):
    """返回全部工作台的 Claw 技能和 Agent 绑定信息（静态配置；仅需登录）"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .claw_registry import get_full_registry, get_shared_skills
    return {'code': 200, 'msg': 'OK', 'data': {
        'shared_skills': get_shared_skills(),
        'workstations': get_full_registry(),
    }}


@router.get('/claw/registry/{workstation_key}', summary='Claw 注册表（单工作台）')
def claw_registry_by_workstation(request, workstation_key: str):
    """返回指定工作台的 Claw 技能、Agent 和快捷操作；异常时返回空配置避免前端整页报错（仅需登录）"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    try:
        from .claw_registry import get_workstation_config
        config = get_workstation_config(workstation_key)
        if not config:
            return {'code': 200, 'msg': 'OK', 'data': {
                'key': workstation_key,
                'display_name': workstation_key,
                'agents': [],
                'skills': [],
                'quick_actions': [],
            }}
        return {'code': 200, 'msg': 'OK', 'data': config}
    except Exception as e:
        logger.exception('claw_registry_by_workstation failed: %s', e)
        return {'code': 200, 'msg': 'OK', 'data': {
            'key': workstation_key,
            'display_name': workstation_key,
            'agents': [],
            'skills': [],
            'quick_actions': [],
        }}


@router.post('/claw/registry/reload', summary='重载 Claw 注册表')
@require_permission('assistant.policy.manage')
def claw_registry_reload(request):
    """重新加载 claw_registry.yaml，用于配置变更后刷新"""
    from .claw_registry import reload_registry, get_all_workstation_keys
    reload_registry()
    keys = get_all_workstation_keys()
    return {'code': 200, 'msg': f'已重载，{len(keys)} 个工作台', 'data': {
        'workstation_count': len(keys),
        'workstation_keys': keys,
    }}


# ============================================================================
# 编排器 API — 多 Agent 协同调度 (D6)
# ============================================================================

class OrchestrationIn(Schema):
    query: str
    context: dict = {}
    max_parallel: int = 4


@router.post('/orchestrate', summary='多 Agent 编排执行')
@require_permission('assistant.automation.execute')
def orchestrate_task(request, data: OrchestrationIn):
    """
    将复合请求分解为子任务，派发到多个 Agent 并行执行，聚合结果。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .orchestration_service import orchestrate
    result = orchestrate(
        account_id=account.id,
        query=data.query,
        context=data.context or None,
        max_parallel=min(data.max_parallel, 8),
    )
    return {'code': 200, 'msg': 'OK', 'data': result.to_dict()}


class EmergencyDispatchIn(Schema):
    event_type: str
    source_module: str
    severity: str = 'critical'
    payload: dict = {}


@router.post('/orchestrate/emergency', summary='紧急事件编排')
@require_permission('assistant.automation.execute')
def orchestrate_emergency(request, data: EmergencyDispatchIn):
    """
    处理 CRITICAL 级别紧急事件，分析影响范围并生成跨台协调方案。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .orchestration_service import emergency_dispatch
    result = emergency_dispatch(
        account_id=account.id,
        event_type=data.event_type,
        source_module=data.source_module,
        severity=data.severity,
        payload=data.payload,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


class DailyBriefIn(Schema):
    target_role: str = 'all'
    focus_areas: list = []


@router.post('/orchestrate/daily-brief', summary='生成角色化每日简报')
@require_permission('assistant.summary.generate')
def orchestrate_daily_brief(request, data: DailyBriefIn):
    """
    聚合全域 KPI 和预警，通过多 Agent 协作生成角色化工作简报。
    """
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .orchestration_service import generate_daily_brief
    try:
        result = generate_daily_brief(
            account_id=account.id,
            target_role=data.target_role,
            focus_areas=data.focus_areas or None,
        )
    except Exception as exc:
        # 日报生成失败时自动写策略学习草稿
        try:
            from apps.secretary.memory_service import learn_policy
            learn_policy(
                worker_code='business_analyst',
                domain_code='daily_brief',
                policy_key='daily_brief_generation_failure',
                outcome='经营日报生成失败',
                root_cause=str(exc)[:300],
                better_policy=(
                    '检查编排服务和数据源可用性；'
                    '日报失败时优先降级到基础 KPI 摘要，不应直接返回空内容。'
                ),
                replay_score=0.0,
                evidence={'account_id': account.id, 'target_role': data.target_role},
            )
        except Exception:
            pass
        return 500, {'code': 500, 'msg': f'日报生成失败: {exc}', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# Claw 执行仪表盘 API
# ============================================================================

@router.get('/claw/execution/stats', summary='Claw 技能执行统计')
@require_permission('dashboard.stats.read')
def claw_execution_stats(request, days: int = 7):
    """返回技能执行成功率、平均耗时、调用次数"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .models_orchestration import SkillExecutionLog, OrchestrationRun
    from django.utils import timezone as tz
    from datetime import timedelta
    from django.db.models import Count, Avg, Q

    cutoff = tz.now() - timedelta(days=days)

    skill_stats = list(
        SkillExecutionLog.objects.filter(created_at__gte=cutoff)
        .values('skill_id')
        .annotate(
            total=Count('id'),
            success=Count('id', filter=Q(status='success')),
            avg_ms=Avg('duration_ms'),
        )
        .order_by('-total')
    )

    orch_stats = OrchestrationRun.objects.filter(created_at__gte=cutoff).aggregate(
        total=Count('id'),
        success=Count('id', filter=Q(status='success')),
        partial=Count('id', filter=Q(status='partial')),
        failed=Count('id', filter=Q(status='failed')),
        avg_ms=Avg('duration_ms'),
    )

    return {'code': 200, 'msg': 'OK', 'data': {
        'window_days': days,
        'skill_stats': skill_stats,
        'orchestration_stats': orch_stats,
    }}


@router.get('/claw/execution/history', summary='Claw 编排执行历史')
@require_permission('dashboard.stats.read')
def claw_execution_history(request, limit: int = 20):
    """返回最近的编排执行记录"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .models_orchestration import OrchestrationRun

    runs = OrchestrationRun.objects.order_by('-created_at')[:min(limit, 50)]
    items = []
    for run in runs:
        items.append({
            'task_id': run.task_id,
            'query': run.query[:200],
            'status': run.status,
            'sub_task_count': run.sub_task_count,
            'duration_ms': run.duration_ms,
            'errors': run.errors_json,
            'created_at': run.created_at.isoformat(),
        })

    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


# ============================================================================
# 紧急编排方案审核 API
# ============================================================================

@router.post('/orchestrate/emergency/{task_id}/review', summary='紧急编排方案审核')
@require_permission('assistant.automation.execute')
def orchestrate_emergency_review(request, task_id: str, approved: bool = True, notes: str = ''):
    """管理员审核紧急编排方案"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .models_orchestration import OrchestrationRun
    try:
        run = OrchestrationRun.objects.get(task_id=task_id)
    except OrchestrationRun.DoesNotExist:
        return {'code': 404, 'msg': '编排记录不存在', 'data': None}

    reviewer_name = getattr(account, 'name', str(account.id))
    if approved:
        run.status = 'approved'
        run.aggregated_output += f'\n\n[审核通过] {reviewer_name}: {notes}'
    else:
        run.status = 'rejected'
        run.aggregated_output += f'\n\n[审核拒绝] {reviewer_name}: {notes}'
    run.save()

    return {'code': 200, 'msg': 'OK', 'data': {
        'task_id': task_id,
        'status': run.status,
        'reviewer': reviewer_name,
    }}


# ============================================================================
# 统一执行任务审批 API（P0 可信执行内核）
# ============================================================================

class ExecutionTaskApproveIn(Schema):
    approved: bool = True
    notes: str = ''


@router.post('/execution-tasks/{task_id}/approve', summary='审批执行任务')
@require_permission('assistant.automation.execute')
def execution_task_approve(request, task_id: str, data: ExecutionTaskApproveIn):
    """审批通过后执行；拒绝则取消任务。仅 SUGGESTED 状态可审批。"""
    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .runtime_plane import approve_and_run_execution_task
    from .models_runtime import UnifiedExecutionTask

    task = UnifiedExecutionTask.objects.filter(task_id=task_id).first()
    if not task:
        return 404, {'code': 404, 'msg': '任务不存在', 'data': None}
    if task.status != UnifiedExecutionTask.Status.SUGGESTED:
        return 400, {'code': 400, 'msg': f'仅「已建议」任务可审批，当前状态: {task.status}', 'data': None}

    if not data.approved:
        from .runtime_plane import transition_execution_task
        transition_execution_task(task_id, UnifiedExecutionTask.Status.CANCELLED, note='rejected', payload={'approver_id': account.id, 'notes': data.notes})
        task.refresh_from_db()
        return {'code': 200, 'msg': '已拒绝', 'data': {'task_id': task_id, 'status': task.status}}
    result = approve_and_run_execution_task(task_id=task_id, approver_id=account.id)
    if not result.get('ok'):
        return 400, {'code': 400, 'msg': result.get('error', '执行失败'), 'data': result}
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# Mail Signal API — Phase 1
# ============================================================================

class MailSignalIgnoreIn(Schema):
    reason: str
    note: Optional[str] = ''


class MailSignalReparseIn(Schema):
    force: bool = False
    parse_version: Optional[str] = None


class MailSignalLinkConfirmItemIn(Schema):
    link_type: str
    target_id: int
    confirmed: bool
    is_primary: bool = False
    note: Optional[str] = ''


class MailSignalLinkConfirmIn(Schema):
    links: List[MailSignalLinkConfirmItemIn]


class MailSignalTaskGenerateIn(Schema):
    task_keys: List[str]
    force_regenerate: bool = False
    owner_account_id: Optional[int] = None
    note: Optional[str] = ''


class MailSignalWritebackOperationIn(Schema):
    type: str
    payload: dict = {}


class MailSignalWritebackIn(Schema):
    operations: List[MailSignalWritebackOperationIn]
    confirm_required: bool = True
    override_payload: Optional[dict] = None


def _mail_signal_primary_ref(event_id: int, link_type: str) -> Optional[dict]:
    from .models import MailSignalLink

    link = MailSignalLink.objects.filter(
        mail_signal_event_id=event_id,
        link_type=link_type,
        is_primary=True,
    ).order_by('-confirmed', '-match_score', 'id').first()
    if not link:
        return None

    label = f'{link_type}#{link.target_id}'
    try:
        if link_type == 'client':
            from apps.crm.models import Client
            obj = Client.objects.filter(id=link.target_id, is_deleted=False).first()
            if obj:
                label = obj.name
        elif link_type == 'contact':
            from apps.crm.models import ClientContact
            obj = ClientContact.objects.filter(id=link.target_id, is_deleted=False).first()
            if obj:
                label = obj.name
        elif link_type == 'opportunity':
            from apps.crm.models import Opportunity
            obj = Opportunity.objects.filter(id=link.target_id, is_deleted=False).first()
            if obj:
                label = obj.title
    except Exception:
        pass

    return {'id': link.target_id, 'label': label, 'type': link_type}


def _mail_signal_link_label(link_type: str, target_id: int) -> str:
    label = f'{link_type}#{target_id}'
    try:
        if link_type == 'client':
            from apps.crm.models import Client
            obj = Client.objects.filter(id=target_id, is_deleted=False).first()
            if obj:
                return obj.name
        elif link_type == 'contact':
            from apps.crm.models import ClientContact
            obj = ClientContact.objects.filter(id=target_id, is_deleted=False).first()
            if obj:
                return obj.name
        elif link_type == 'opportunity':
            from apps.crm.models import Opportunity
            obj = Opportunity.objects.filter(id=target_id, is_deleted=False).first()
            if obj:
                return obj.title
        elif link_type == 'protocol':
            from apps.protocol.models import Protocol
            obj = Protocol.objects.filter(id=target_id, is_deleted=False).first()
            if obj:
                return getattr(obj, 'title', None) or getattr(obj, 'name', None) or label
    except Exception:
        pass
    return label


def _mail_signal_task_title(task_key: str, subject: str) -> str:
    mapping = {
        'opportunity_draft': '创建商机草稿',
        'client_profile_update': '更新客户画像',
        'research_context_sync': '同步研究上下文',
        'client_risk_alert': '客户风险提醒',
        'followup_action_draft': '生成跟进动作草稿',
        'market_trend_brief': '生成品类趋势简报',
        'competitive_intel_brief': '生成竞品情报简报',
        'claim_strategy_brief': '生成宣称策略建议',
    }
    prefix = mapping.get(task_key, '邮件任务')
    return f'{prefix} · {subject or "(无主题)"}'


def _mail_signal_task_risk(task_key: str) -> str:
    if task_key in {'client_profile_update', 'research_context_sync'}:
        return 'low'
    if task_key in {'client_risk_alert', 'opportunity_draft'}:
        return 'medium'
    return 'medium'


def _mail_signal_task_priority(event, task_key: str) -> int:
    base = event.importance_score or 50
    if task_key == 'client_risk_alert':
        return min(100, base + 10)
    if task_key == 'research_context_sync':
        return min(100, base + 5)
    return base


def _mail_signal_task_confidence(event, task_key: str) -> int:
    base = event.confidence_score or 60
    if task_key in {'opportunity_draft', 'research_context_sync'}:
        return min(100, base + 10)
    return base


def _suggest_task_keys_for_event(event) -> List[str]:
    from .mail_signal_task_service import suggest_task_keys
    return suggest_task_keys(event.mail_signal_type)


def _get_linked_opportunities_for_event(signal_id: int) -> list:
    """从 AssistantActionPlan.action_payload 中提取已创建的关联商机摘要"""
    from .models import AssistantActionPlan
    from apps.crm.models import Opportunity
    result = []
    plans = AssistantActionPlan.objects.filter(
        source_event_id=signal_id,
        task_key='opportunity_draft',
        status=AssistantActionPlan.Status.EXECUTED,
    ).values('action_payload')
    seen_ids = set()
    for p in plans:
        payload = p.get('action_payload') or {}
        opp_id = payload.get('opportunity_id')
        if opp_id and opp_id not in seen_ids:
            seen_ids.add(opp_id)
            opp = Opportunity.objects.filter(id=opp_id, is_deleted=False).values(
                'id', 'title', 'stage', 'estimated_amount', 'create_time',
            ).first()
            if opp:
                result.append({
                    'id': opp['id'],
                    'title': opp['title'],
                    'stage': opp['stage'],
                    'estimated_amount': str(opp['estimated_amount']) if opp['estimated_amount'] else None,
                    'create_time': opp['create_time'].isoformat() if opp['create_time'] else None,
                })
    return result


def _get_intent_field(event, field: str, default=None):
    """从 extracted_intents 中安全取意图分析字段"""
    if default is None:
        default = ''
    intents = event.extracted_intents
    if not intents or not isinstance(intents, list):
        return default
    first = intents[0] if intents else {}
    if not isinstance(first, dict):
        return default
    return first.get(field, default)


@mail_router.get('/mail-signals', summary='邮件信号列表')
@require_permission('assistant.context.read')
def mail_signal_list(
    request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    mail_signal_type: Optional[str] = None,
    is_external: Optional[bool] = None,
    task_key: Optional[str] = None,
    keyword: Optional[str] = None,
    all_accounts: Optional[bool] = None,
    account_id: Optional[int] = None,
):
    from django.core.paginator import Paginator
    from django.db.models import Q
    from .models import MailSignalEvent, AssistantActionPlan
    

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    # admin 角色（JWT 中含 admin，或 dev-bypass-token）：可查看全部信号
    is_admin = False
    try:
        from apps.identity.services import verify_jwt_token
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Bearer '):
            token_str = auth_header[7:]
            if token_str == 'dev-bypass-token':
                # dev-bypass 在 DEBUG 下默认为 admin
                is_admin = getattr(settings, 'DEBUG', False)
            else:
                payload = verify_jwt_token(token_str) or {}
                is_admin = 'admin' in (payload.get('roles') or [])
    except Exception:
        pass
    if account_id:
        qs = MailSignalEvent.objects.filter(account_id=account_id).order_by('-received_at', '-created_at')
    elif all_accounts or is_admin:
        qs = MailSignalEvent.objects.all().order_by('-received_at', '-created_at')
    else:
        qs = MailSignalEvent.objects.filter(account_id=account.id).order_by('-received_at', '-created_at')
    if status:
        qs = qs.filter(status=status)
    if mail_signal_type:
        qs = qs.filter(mail_signal_type=mail_signal_type)
    if is_external is not None:
        qs = qs.filter(is_external=is_external)
    if keyword:
        qs = qs.filter(Q(subject__icontains=keyword) | Q(body_preview__icontains=keyword) | Q(body_text__icontains=keyword))
    if task_key:
        task_event_ids = AssistantActionPlan.objects.filter(task_key=task_key).exclude(source_event_id__isnull=True).values_list('source_event_id', flat=True)
        qs = qs.filter(id__in=list(task_event_ids))

    paginator = Paginator(qs, page_size)
    page_obj = paginator.page(page)
    items = []
    for event in page_obj.object_list:
        task_qs = AssistantActionPlan.objects.filter(source_event_id=event.id)
        items.append({
            'id': event.id,
            'subject': event.subject,
            'sender_name': event.sender_name,
            'sender_email': event.sender_email,
            'received_at': event.received_at.isoformat() if event.received_at else event.created_at.isoformat() if event.created_at else None,
            'is_external': event.is_external,
            'mail_signal_type': event.mail_signal_type,
            'importance_score': event.importance_score,
            'sentiment_score': event.sentiment_score,
            'status': event.status,
            'primary_client': _mail_signal_primary_ref(event.id, 'client'),
            'primary_contact': _mail_signal_primary_ref(event.id, 'contact'),
            'task_count': task_qs.count(),
            'pending_confirm_count': task_qs.filter(status='pending_confirm').count(),
        })
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': items,
        'pagination': {'page': page, 'page_size': page_size, 'total': paginator.count},
    }}


@mail_router.get('/mail-signals/{signal_id}', summary='邮件信号详情')
@require_permission('assistant.context.read')
def mail_signal_detail(request, signal_id: int):
    from .models import MailSignalEvent, MailSignalAttachment, MailSignalLink, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    attachments = list(MailSignalAttachment.objects.filter(mail_signal_event_id=event.id).values(
        'id', 'filename', 'content_type', 'file_size', 'extract_status', 'extract_summary',
    ))
    links = list(MailSignalLink.objects.filter(mail_signal_event_id=event.id).values(
        'id', 'link_type', 'target_id', 'match_method', 'match_score', 'is_primary', 'confirmed', 'note',
    ))
    for link in links:
        link['target_label'] = _mail_signal_link_label(link['link_type'], link['target_id'])
    tasks = list(AssistantActionPlan.objects.filter(source_event_id=event.id).values(
        'id', 'task_key', 'title', 'risk_level', 'status',
        'requires_confirmation', 'priority_score', 'confidence_score', 'created_at',
    ))
    for task in tasks:
        if task.get('created_at'):
            task['created_at'] = task['created_at'].isoformat()

    return {'code': 200, 'msg': 'OK', 'data': {
        'id': event.id,
        'source_mail_id': event.source_mail_id,
        'thread_id': event.thread_id,
        'subject': event.subject,
        'body_preview': event.body_preview,
        'body_text': event.body_text,
        'sender_name': event.sender_name,
        'sender_email': event.sender_email,
        'sender_domain': event.sender_domain,
        'recipient_emails': event.recipient_emails or [],
        'cc_emails': event.cc_emails or [],
        'attachments': attachments,
        'is_external': event.is_external,
        'external_classification': event.external_classification,
        'mail_signal_type': event.mail_signal_type,
        'importance_score': event.importance_score,
        'sentiment_score': event.sentiment_score,
        'urgency_score': event.urgency_score,
        'confidence_score': event.confidence_score,
        'extracted_entities': event.extracted_entities or {},
        'extracted_people': event.extracted_people or [],
        # 评测改进（业务价值评估 + 意图理解）
        'business_value': event.business_value or '',
        'urgency_level': event.urgency_level or '',
        'key_intent': _get_intent_field(event, 'key_intent'),
        'concrete_actions': _get_intent_field(event, 'suggested_actions', default=[]),
        'risk_or_opportunity': _get_intent_field(event, 'risk_or_opportunity'),
        'links': links,
        'tasks': tasks,
        'suggested_task_keys': _suggest_task_keys_for_event(event),
        'linked_opportunities': _get_linked_opportunities_for_event(event.id),
        'status': event.status,
        'parse_version': event.parse_version,
        'received_at': event.received_at.isoformat() if event.received_at else None,
    }}


@mail_router.get('/mail-signals/{signal_id}/tasks', summary='邮件信号关联任务')
@require_permission('assistant.context.read')
def mail_signal_tasks(request, signal_id: int):
    from .models import MailSignalEvent, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    if not MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).exists():
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    items = list(AssistantActionPlan.objects.filter(source_event_id=signal_id).values(
        'id', 'task_key', 'title', 'risk_level', 'status',
        'requires_confirmation', 'priority_score', 'confidence_score', 'created_at',
    ))
    for item in items:
        if item.get('created_at'):
            item['created_at'] = item['created_at'].isoformat()
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@mail_router.get('/mail-task-plans', summary='邮件任务草稿列表')
@require_permission('assistant.context.read')
def mail_task_plans(request, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    from django.core.paginator import Paginator
    from .models import AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    qs = AssistantActionPlan.objects.filter(
        account_id=account.id,
        source_event_type='mail_signal',
    ).order_by('-created_at')

    paginator = Paginator(qs, page_size)
    page_obj = paginator.page(page)
    items = []
    for row in page_obj.object_list:
        items.append({
            'id': row.id,
            'task_key': row.task_key,
            'title': row.title,
            'risk_level': row.risk_level,
            'status': row.status,
            'requires_confirmation': row.requires_confirmation,
            'priority_score': row.priority_score,
            'confidence_score': row.confidence_score,
            'source_event_id': row.source_event_id,
            'created_at': row.created_at.isoformat(),
            'ai_analysis_status': (row.action_payload or {}).get('ai_analysis_status', 'pending'),
            'has_result': bool(row.draft_artifact_refs),
        })
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': items,
        'pagination': {'page': page, 'page_size': page_size, 'total': paginator.count},
    }}


@mail_router.post('/mail-signals/{signal_id}/ignore', summary='忽略邮件事件')
@require_permission('assistant.automation.execute')
def ignore_mail_signal(request, signal_id: int, data: MailSignalIgnoreIn):
    from .models import MailSignalEvent, MailSignalStatus

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}
    if event.status == MailSignalStatus.COMPLETED:
        return {'code': 4003, 'msg': '已完成事件不可忽略', 'data': None}

    event.status = MailSignalStatus.IGNORED
    event.error_note = f'ignored:{data.reason}:{data.note or ""}'.strip(':')
    event.save(update_fields=['status', 'error_note', 'updated_at'])
    return {'code': 200, 'msg': 'OK', 'data': {'id': event.id, 'status': event.status}}


@mail_router.post('/mail-signals/{signal_id}/reparse', summary='重新解析邮件事件')
@require_permission('assistant.automation.execute')
def reparse_mail_signal(request, signal_id: int, data: MailSignalReparseIn):
    from .models import MailSignalEvent, MailSignalStatus

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    if data.parse_version:
        event.parse_version = data.parse_version
    event.status = MailSignalStatus.PARSED if event.body_text or event.body_preview else MailSignalStatus.ERROR
    event.error_note = '' if event.status != MailSignalStatus.ERROR else 'reparse:no_body'
    event.save(update_fields=['parse_version', 'status', 'error_note', 'updated_at'])
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': event.id,
        'status': event.status,
        'parse_version': event.parse_version,
    }}


@mail_router.post('/mail-signals/{signal_id}/links/confirm', summary='确认邮件关联')
@require_permission('assistant.automation.execute')
def confirm_mail_signal_links(request, signal_id: int, data: MailSignalLinkConfirmIn):
    from django.utils import timezone
    from .models import MailSignalEvent, MailSignalLink, MailSignalMatchMethod, MailSignalStatus

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    updated: List[dict[str, Any]] = []
    for item in data.links:
        if item.is_primary:
            MailSignalLink.objects.filter(
                mail_signal_event_id=event.id,
                link_type=item.link_type,
                is_primary=True,
            ).update(is_primary=False)
        row, _ = MailSignalLink.objects.update_or_create(
            mail_signal_event_id=event.id,
            link_type=item.link_type,
            target_id=item.target_id,
            defaults={
                'match_method': MailSignalMatchMethod.MANUAL,
                'confirmed': item.confirmed,
                'is_primary': item.is_primary if item.confirmed else False,
                'confirmed_by': account.id if item.confirmed else None,
                'confirmed_at': timezone.now() if item.confirmed else None,
                'note': item.note or '',
            },
        )
        updated.append({
            'id': row.id,
            'link_type': row.link_type,
            'target_id': row.target_id,
            'confirmed': row.confirmed,
            'is_primary': row.is_primary,
        })

    event.status = MailSignalStatus.LINKED
    event.save(update_fields=['status', 'updated_at'])
    return {'code': 200, 'msg': 'OK', 'data': {'links': updated, 'status': event.status}}


@mail_router.post('/mail-signals/{signal_id}/tasks/generate', summary='生成邮件任务草稿')
@require_permission('assistant.automation.execute')
def generate_mail_signal_tasks(request, signal_id: int, data: MailSignalTaskGenerateIn):
    from .models import MailSignalEvent, AssistantActionPlan, MailSignalStatus
    from .mail_signal_task_service import validate_task_keys, check_confirmed_link_requirement

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    if not data.task_keys:
        return {'code': 4001, 'msg': 'task_keys 不能为空', 'data': None}

    # 校验 task_key 合法性与场景匹配（宽松模式：仅校验合法性，不强制场景匹配）
    valid_keys, key_errors = validate_task_keys(
        data.task_keys,
        event.mail_signal_type,
        strict_scene=False,
    )
    if key_errors:
        return {'code': 4002, 'msg': key_errors[0]['reason'], 'data': {'rejected': key_errors}}
    if not valid_keys:
        return {'code': 4002, 'msg': '所有 task_key 均不合法', 'data': {'rejected': key_errors}}

    # 前置关联确认检查（Phase 2 任务和 opportunity_draft 要求先确认客户/联系人）
    link_err = check_confirmed_link_requirement(event.id, valid_keys)
    if link_err:
        return {'code': 4003, 'msg': link_err, 'data': None}

    created_tasks = []
    duplicate_tasks = []
    for task_key in valid_keys:
        open_row = AssistantActionPlan.objects.filter(
            source_event_id=event.id,
            task_key=task_key,
            status__in=[
                AssistantActionPlan.Status.SUGGESTED,
                AssistantActionPlan.Status.PENDING_CONFIRM,
                AssistantActionPlan.Status.CONFIRMED,
            ],
        ).first()
        if open_row and not data.force_regenerate:
            duplicate_tasks.append({'id': open_row.id, 'task_key': task_key})
            continue

        row = AssistantActionPlan.objects.create(
            account_id=account.id,
            source_event_id=event.id,
            source_event_type='mail_signal',
            biz_domain='mail_signal',
            task_key=task_key,
            action_type=task_key,
            title=_mail_signal_task_title(task_key, event.subject),
            description=data.note or f'由邮件事件 #{event.id} 生成',
            action_payload={
                'mail_signal_id': event.id,
                'subject': event.subject,
                'sender_email': event.sender_email,
            },
            target_object_refs=[
                ref for ref in [
                    _mail_signal_primary_ref(event.id, 'client'),
                    _mail_signal_primary_ref(event.id, 'contact'),
                    _mail_signal_primary_ref(event.id, 'protocol'),
                ] if ref
            ],
            risk_level=_mail_signal_task_risk(task_key),
            priority_score=_mail_signal_task_priority(event, task_key),
            confidence_score=_mail_signal_task_confidence(event, task_key),
            requires_confirmation=True,
            status=AssistantActionPlan.Status.PENDING_CONFIRM,
            owner_account_id=data.owner_account_id,
            source_trace=[{
                'source': 'mail_signal',
                'mail_signal_id': event.id,
                'mail_signal_type': event.mail_signal_type,
                'subject': event.subject,
            }],
        )
        created_tasks.append({
            'id': row.id,
            'task_key': row.task_key,
            'title': row.title,
            'status': row.status,
            'priority_score': row.priority_score,
            'confidence_score': row.confidence_score,
        })

    event.status = MailSignalStatus.TASKED
    event.save(update_fields=['status', 'updated_at'])
    return {'code': 200, 'msg': 'OK', 'data': {
        'created_tasks': created_tasks,
        'duplicate_tasks': duplicate_tasks,
        'skipped_tasks': [],
    }}


@mail_router.post('/mail-signals/{signal_id}/writeback', summary='邮件信号正式回写')
@require_permission('assistant.automation.execute')
def writeback_mail_signal(request, signal_id: int, data: MailSignalWritebackIn):
    from django.utils import timezone
    from .models import MailSignalEvent, AssistantActionPlan, MailSignalStatus

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    if data.confirm_required:
        from .models import MailSignalLink
        has_confirmed_link = MailSignalLink.objects.filter(
            mail_signal_event_id=event.id,
            confirmed=True,
        ).exists()
        if not has_confirmed_link:
            return {'code': 4007, 'msg': '缺少必要确认，禁止回写', 'data': None}

    results = []
    for op in data.operations or []:
        payload = op.payload or {}
        if op.type == 'create_opportunity_draft':
            client_ref = _mail_signal_primary_ref(event.id, 'client')
            client_id = payload.get('client_id') or (client_ref or {}).get('id')
            if not client_id:
                results.append({'type': op.type, 'ok': False, 'error': '缺少 client_id'})
                continue
            from apps.crm.services import create_opportunity
            opp = create_opportunity(
                title=payload.get('title') or (event.subject or '邮件触发商机草稿'),
                client_id=int(client_id),
                owner=getattr(account, 'name', '') or str(account.id),
                description=payload.get('description') or event.body_preview or event.body_text[:300],
            )
            AssistantActionPlan.objects.filter(
                source_event_id=event.id,
                task_key='opportunity_draft',
            ).update(
                status=AssistantActionPlan.Status.EXECUTED,
                confirmed_by=account.id,
                confirmed_at=timezone.now(),
            )
            results.append({
                'type': op.type,
                'ok': True,
                'opportunity_id': opp.id,
                'title': opp.title,
                'client_id': client_id,
                'written_fields': ['title', 'client_id', 'owner', 'description'],
            })
            continue

        if op.type == 'sync_research_context':
            from apps.proposal.services import add_communication_log
            protocol_ref = _mail_signal_primary_ref(event.id, 'protocol')
            log = add_communication_log(
                comm_type='email',
                subject=event.subject or '邮件沟通同步',
                summary=payload.get('summary') or event.body_preview or event.body_text[:300],
                client_id=( _mail_signal_primary_ref(event.id, 'client') or {}).get('id'),
                protocol_id=payload.get('protocol_id') or (protocol_ref or {}).get('id'),
                participants=[event.sender_name] if event.sender_name else [],
                occurred_at=event.received_at or timezone.now(),
                created_by_id=account.id,
            )
            AssistantActionPlan.objects.filter(
                source_event_id=event.id,
                task_key='research_context_sync',
            ).update(
                status=AssistantActionPlan.Status.EXECUTED,
                confirmed_by=account.id,
                confirmed_at=timezone.now(),
            )
            results.append({
                'type': op.type,
                'ok': True,
                'communication_log_id': log.id,
                'protocol_id': payload.get('protocol_id') or (protocol_ref or {}).get('id'),
                'written_fields': ['client_id', 'protocol_id', 'subject', 'summary', 'participants'],
            })
            continue

        if op.type == 'update_client_profile':
            from apps.crm.models import Client
            client_ref = _mail_signal_primary_ref(event.id, 'client')
            client_id = payload.get('client_id') or (client_ref or {}).get('id')
            client = Client.objects.filter(id=client_id, is_deleted=False).first() if client_id else None
            if not client:
                results.append({'type': op.type, 'ok': False, 'error': '客户不存在'})
                continue
            changed_fields = []
            if payload.get('industry'):
                client.industry = payload['industry']
                changed_fields.append('industry')
            if payload.get('contact_name'):
                client.contact_name = payload['contact_name']
                changed_fields.append('contact_name')
            if payload.get('contact_email'):
                client.contact_email = payload['contact_email']
                changed_fields.append('contact_email')
            if changed_fields:
                changed_fields.append('update_time')
                client.save(update_fields=changed_fields)
            AssistantActionPlan.objects.filter(
                source_event_id=event.id,
                task_key='client_profile_update',
            ).update(
                status=AssistantActionPlan.Status.EXECUTED,
                confirmed_by=account.id,
                confirmed_at=timezone.now(),
            )
            results.append({
                'type': op.type,
                'ok': True,
                'client_id': client.id,
                'changed_fields': changed_fields,
                'written_fields': changed_fields,
            })
            continue

        results.append({'type': op.type, 'ok': False, 'error': '不支持的操作类型'})

    if any(item.get('ok') for item in results):
        event.status = MailSignalStatus.COMPLETED
        event.save(update_fields=['status', 'updated_at'])
    return {'code': 200, 'msg': 'OK', 'data': {'results': results, 'status': event.status}}


# ============================================================================
# Mail Signal API — Phase 2：专项分析执行与结果读取
# ============================================================================

@mail_router.post(
    '/mail-signals/{signal_id}/tasks/{task_id}/execute-analysis',
    summary='执行邮件专项分析任务（Phase 2）',
)
@require_permission('assistant.automation.execute')
def execute_mail_signal_analysis(request, signal_id: int, task_id: int):
    """
    执行指定专项分析任务（当前支持 market_trend_brief）。

    - 需要事先通过 tasks/generate 生成草稿任务，再通过本接口触发执行
    - 产物写入 AssistantActionPlan.evidence_refs / draft_artifact_refs
    - 产物默认 governance_level=internal_draft，不对客自动发送
    - 强制人工审核后才能转为正式版
    """
    from .models import MailSignalEvent, AssistantActionPlan
    from .mail_signal_task_service import PHASE2_TASK_KEYS

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在或不属于该邮件事件', 'data': None}

    if plan.task_key not in PHASE2_TASK_KEYS:
        # Phase 1 任务中 opportunity_draft 支持直接执行（改进 D）
        if plan.task_key == 'opportunity_draft':
            from .mail_signal_analysis_service import execute_opportunity_draft
            result = execute_opportunity_draft(plan.id)
            if not result.get('ok'):
                return {'code': 400, 'msg': result.get('error', '商机草稿创建失败'), 'data': result}
            return {'code': 200, 'msg': 'OK', 'data': result}
        return {
            'code': 4005,
            'msg': f'任务 "{plan.task_key}" 不是 Phase 2 专项分析任务，无法执行分析',
            'data': None,
        }

    if plan.task_key == 'market_trend_brief':
        from .mail_signal_analysis_service import execute_market_trend_brief
        result = execute_market_trend_brief(plan.id)
    elif plan.task_key == 'competitive_intel_brief':
        from .mail_signal_analysis_service import execute_competitive_intel_brief
        result = execute_competitive_intel_brief(plan.id)
    elif plan.task_key == 'claim_strategy_brief':
        from .mail_signal_analysis_service import execute_claim_strategy_brief
        result = execute_claim_strategy_brief(plan.id)
    else:
        return {
            'code': 4006,
            'msg': f'专项分析 "{plan.task_key}" 暂未实现执行器，将在后续版本中支持',
            'data': None,
        }

    if not result.get('ok'):
        return {'code': 400, 'msg': result.get('error', '执行失败'), 'data': result}

    return {'code': 200, 'msg': 'OK', 'data': result}


@mail_router.get(
    '/mail-signals/{signal_id}/tasks/{task_id}/analysis-result',
    summary='读取专项分析结果（Phase 2）',
)
@require_permission('assistant.context.read')
def get_mail_signal_analysis_result(request, signal_id: int, task_id: int):
    """
    读取专项分析任务的执行结果（evidence_refs / draft_artifact_refs）。

    - 任务必须处于 CONFIRMED 或 EXECUTED 状态才有结果
    - 结果仅限内部查看，不对客展示
    """
    from .models import MailSignalEvent, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在', 'data': None}

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': plan.id,
            'task_key': plan.task_key,
            'title': plan.title,
            'status': plan.status,
            'evidence_refs': plan.evidence_refs or [],
            'draft_artifact_refs': plan.draft_artifact_refs or [],
            'has_result': bool(plan.draft_artifact_refs),
            'governance_level': (
                (plan.draft_artifact_refs[0] or {}).get('governance_level', 'internal_draft')
                if plan.draft_artifact_refs else 'internal_draft'
            ),
            'ai_status': (plan.action_payload or {}).get('ai_analysis_status', 'pending'),
            'review_required': True,
        },
    }


# ============================================================================
# Mail Signal API — Phase 3：知识沉淀确认接口
# ============================================================================

class MailSignalDepositKnowledgeIn(Schema):
    candidate_indices: List[int]
    note: Optional[str] = ''


@mail_router.post(
    '/mail-signals/{signal_id}/tasks/{task_id}/deposit-knowledge',
    summary='将专项分析候选结论沉淀到知识库（Phase 3）',
)
@require_permission('assistant.automation.execute')
def deposit_knowledge_from_analysis(
    request, signal_id: int, task_id: int, data: MailSignalDepositKnowledgeIn
):
    """
    Phase 3：把 knowledge_deposit_candidates 中人工确认的候选结论
    通过 ingestion_pipeline 写入 KnowledgeEntry，实现真正的知识沉淀。

    - 利用 source_type + source_id + source_key 幂等：同一结论重复提交不重复创建
    - 写入成功后更新候选 deposit_ready='deposited'
    - 治理层面：产物仍限内部，不对客发送
    """
    import hashlib
    from django.utils import timezone as dj_tz
    from .models import MailSignalEvent, AssistantActionPlan
    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
    from .mail_signal_external_evidence_service import evidence_to_knowledge_content

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在', 'data': None}

    if not plan.draft_artifact_refs:
        return {'code': 4010, 'msg': '任务尚未执行分析，无可沉淀内容', 'data': None}

    artifact = (plan.draft_artifact_refs[0] or {})
    detail = artifact.get('detail') or {}
    candidates = list(detail.get('knowledge_deposit_candidates') or [])
    if not candidates:
        return {'code': 4011, 'msg': '当前任务没有可沉淀的候选结论', 'data': None}

    indices = data.candidate_indices or []
    deposited = []
    skipped = []
    errors = []

    evidence_hits: list[dict] = []
    for er in (plan.evidence_refs or []):
        if isinstance(er, dict) and er.get('quality') == 'catalog_match':
            for item in (er.get('items') or []):
                evidence_hits.extend(item.get('hits') or [])

    for idx in indices:
        if idx < 0 or idx >= len(candidates):
            errors.append({'index': idx, 'reason': f'下标 {idx} 超出候选范围 [0,{len(candidates)-1}]'})
            continue
        candidate = candidates[idx]
        if candidate.get('deposit_ready') == 'deposited':
            skipped.append({'index': idx, 'reason': '已沉淀，跳过'})
            continue

        conclusion = str(candidate.get('conclusion') or '')
        task_key = str(candidate.get('task_key') or plan.task_key)
        entry_type = str(candidate.get('entry_type') or 'market_insight')
        conclusion_type = str(candidate.get('conclusion_type') or 'general')

        source_key = f'{task_key}:{hashlib.md5(conclusion.encode()).hexdigest()[:12]}'
        content = evidence_to_knowledge_content(
            task_key=task_key,
            conclusion=conclusion,
            conclusion_type=conclusion_type,
            evidence_hits=evidence_hits,
            subject=event.subject or '',
            client_label=detail.get('client_hint') or '',
        )
        subject_label = (event.subject or '')[:60]
        title = f'[{task_key}] {conclusion[:80]}'

        raw = RawKnowledgeInput(
            content=content,
            title=title,
            entry_type=entry_type,
            source_type='mail_signal_analysis',
            source_id=plan.id,
            source_key=source_key,
            tags=[task_key, conclusion_type, 'mail_signal', 'phase3_deposit'],
            summary=f'{conclusion}（来源：{subject_label}）',
            created_by_id=account.id,
        )
        try:
            result = run_pipeline(raw)
            if result.entry_id:
                candidates[idx] = dict(candidate)
                candidates[idx]['deposit_ready'] = 'deposited'
                candidates[idx]['knowledge_entry_id'] = result.entry_id
                deposited.append({
                    'index': idx,
                    'entry_id': result.entry_id,
                    'conclusion': conclusion,
                    'source_key': source_key,
                })
            else:
                errors.append({'index': idx, 'reason': f'pipeline 未返回 entry_id: {result.skipped_reason}'})
        except Exception as exc:
            errors.append({'index': idx, 'reason': str(exc)})

    if deposited:
        detail['knowledge_deposit_candidates'] = candidates
        plan.draft_artifact_refs[0]['detail'] = detail
        plan.save(update_fields=['draft_artifact_refs', 'updated_at'])

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'deposited': deposited,
            'skipped': skipped,
            'errors': errors,
            'total_deposited': len(deposited),
        },
    }


# ============================================================================
# Mail Signal API — Phase 4：报告输出与人工审核状态流
# ============================================================================

class MailSignalGenerateReportIn(Schema):
    report_type: str = 'internal_brief'  # internal_brief | specialist_report | proposal_outline
    note: Optional[str] = ''


class MailSignalReviewReportIn(Schema):
    action: str  # submit_review | approve_internal | approve_external | send | archive | reject
    note: Optional[str] = ''


@mail_router.post(
    '/mail-signals/{signal_id}/tasks/{task_id}/generate-report',
    summary='生成专项报告输出物（Phase 4）',
)
@require_permission('assistant.automation.execute')
def generate_report_from_analysis(
    request, signal_id: int, task_id: int, data: MailSignalGenerateReportIn
):
    """
    Phase 4：基于专项分析草稿生成结构化报告输出物。

    支持三种报告类型：
    - internal_brief：内部简报（研究经理 / 客户经理决策使用）
    - specialist_report：专项分析报告（含外部证据分节）
    - proposal_outline：建议书提纲（需通过审核才能对客使用）

    所有输出物默认 governance_level=internal_draft、review_state=pending_review。
    """
    from .models import MailSignalEvent, AssistantActionPlan
    from .mail_signal_report_service import (
        generate_internal_brief,
        generate_specialist_report,
        generate_proposal_outline,
        REPORT_TYPE_LABELS,
    )

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在', 'data': None}

    if not plan.draft_artifact_refs:
        return {'code': 4020, 'msg': '任务尚未执行分析，无可生成报告的内容', 'data': None}

    artifact = (plan.draft_artifact_refs[0] or {})
    detail = artifact.get('detail') or {}
    referenced_evidence = list(detail.get('referenced_evidence') or [])
    external_evidence_results = list(detail.get('external_evidence_results') or [])
    task_key = plan.task_key
    subject = event.subject or ''
    client_label = detail.get('client_hint') or ''

    report_type = (data.report_type or 'internal_brief').strip()
    if report_type == 'internal_brief':
        report = generate_internal_brief(
            task_key, detail, referenced_evidence, subject, client_label,
        )
    elif report_type == 'specialist_report':
        report = generate_specialist_report(
            task_key, detail, referenced_evidence, external_evidence_results, subject, client_label,
        )
    elif report_type == 'proposal_outline':
        report = generate_proposal_outline(
            task_key, detail, referenced_evidence, subject, client_label,
        )
    else:
        return {'code': 4021, 'msg': f'不支持的报告类型: {report_type}，请使用 internal_brief / specialist_report / proposal_outline', 'data': None}

    reports = list(detail.get('generated_reports') or [])
    reports.append(report)
    detail['generated_reports'] = reports
    plan.draft_artifact_refs[0]['detail'] = detail
    plan.save(update_fields=['draft_artifact_refs', 'updated_at'])

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'report': report,
            'report_index': len(reports) - 1,
            'report_label': REPORT_TYPE_LABELS.get(report_type, report_type),
            'governance_level': 'internal_draft',
            'review_state': 'draft',
        },
    }


@mail_router.post(
    '/mail-signals/{signal_id}/tasks/{task_id}/reports/{report_index}/review',
    summary='审核专项报告（Phase 4）',
)
@require_permission('assistant.automation.execute')
def review_report(
    request, signal_id: int, task_id: int, report_index: int, data: MailSignalReviewReportIn
):
    """
    Phase 4：完整审核状态流。

    状态机：
    draft / revision_required -> submit_review -> under_review
    under_review -> approve_internal | reject(revision_required)
    approved_internal -> approve_external
    approved_external -> send
    sent -> archive

    兼容旧动作：
    approve -> approve_internal
    reject -> revision_required
    """
    from django.utils import timezone as dj_tz
    from .models import MailSignalEvent, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在', 'data': None}

    artifact = (plan.draft_artifact_refs[0] or {}) if plan.draft_artifact_refs else {}
    detail = artifact.get('detail') or {}
    reports = list(detail.get('generated_reports') or [])

    if report_index < 0 or report_index >= len(reports):
        return {'code': 404, 'msg': f'报告索引 {report_index} 不存在，当前共 {len(reports)} 份报告', 'data': None}

    action = (data.action or '').strip()
    if action == 'approve':
        action = 'approve_internal'
    elif action == 'reject':
        action = 'revision_required'

    allowed_actions = {'submit_review', 'approve_internal', 'approve_external', 'revision_required', 'send', 'archive'}
    if action not in allowed_actions:
        return {'code': 4022, 'msg': 'action 必须为 submit_review / approve_internal / approve_external / revision_required / send / archive', 'data': None}

    report = dict(reports[report_index])
    current_state = str(report.get('review_state') or 'draft')
    transitions = {
        'draft': {'submit_review': 'under_review'},
        'revision_required': {'submit_review': 'under_review'},
        'under_review': {'approve_internal': 'approved_internal', 'revision_required': 'revision_required'},
        'approved_internal': {'approve_external': 'approved_external'},
        'approved_external': {'send': 'sent'},
        'sent': {'archive': 'archived'},
    }

    next_state = transitions.get(current_state, {}).get(action)
    if not next_state:
        return {'code': 4023, 'msg': f'当前状态 {current_state} 不允许执行动作 {action}', 'data': None}

    reviewer_name = getattr(account, 'display_name', None) or getattr(account, 'name', '') or str(account.id)
    review_at = dj_tz.now().strftime('%Y-%m-%d %H:%M')
    report['review_state'] = next_state
    report['reviewed_by'] = reviewer_name
    report['reviewed_at'] = review_at
    report['review_note'] = data.note or ''
    if next_state == 'sent':
        report['sent_at'] = review_at
    if next_state == 'archived':
        report['archived_at'] = review_at

    reports[report_index] = report
    detail['generated_reports'] = reports
    plan.draft_artifact_refs[0]['detail'] = detail
    plan.save(update_fields=['draft_artifact_refs', 'updated_at'])

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'report_index': report_index,
            'review_state': report['review_state'],
            'reviewed_by': reviewer_name,
            'reviewed_at': review_at,
            'auto_send_to_client': False,
        },
    }


# ============================================================================
# Mail Signal API — Phase 5：动作执行与反馈闭环
# ============================================================================

class MailSignalAdoptIn(Schema):
    adopted: bool
    adoption_note: Optional[str] = ''
    report_index: Optional[int] = None


class MailSignalLinkOpportunityIn(Schema):
    opportunity_id: int
    note: Optional[str] = ''


class MailSignalFeedbackIn(Schema):
    source: str = 'customer'  # customer | internal
    satisfaction_score: Optional[int] = None  # 1-5
    reused: bool = False
    feedback_text: Optional[str] = ''
    report_index: Optional[int] = None


@mail_router.post(
    '/mail-signals/{signal_id}/tasks/{task_id}/adopt',
    summary='记录建议采纳情况（Phase 5）',
)
@require_permission('assistant.automation.execute')
def record_adoption(request, signal_id: int, task_id: int, data: MailSignalAdoptIn):
    """
    Phase 5：记录研究经理对分析建议的采纳情况。

    采纳 (adopted=True) → AssistantActionPlan.Status.CONFIRMED
    不采纳 (adopted=False) → AssistantActionPlan.Status.REJECTED
    """
    from django.utils import timezone as dj_tz
    from .models import MailSignalEvent, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在', 'data': None}

    new_status = AssistantActionPlan.Status.CONFIRMED if data.adopted else AssistantActionPlan.Status.REJECTED
    plan.status = new_status
    plan.confirmed_by = account.id
    plan.confirmed_at = dj_tz.now()

    action_payload = dict(plan.action_payload or {})
    action_payload['adoption_record'] = {
        'adopted': data.adopted,
        'adoption_note': data.adoption_note or '',
        'adopted_by': account.id,
        'adopted_at': dj_tz.now().isoformat(),
        'report_index': data.report_index,
    }
    plan.action_payload = action_payload
    plan.save(update_fields=['status', 'confirmed_by', 'confirmed_at', 'action_payload', 'updated_at'])

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'task_id': plan.id,
            'status': plan.status,
            'adopted': data.adopted,
        },
    }


@mail_router.post(
    '/mail-signals/{signal_id}/tasks/{task_id}/link-opportunity',
    summary='关联商机推进（Phase 5）',
)
@require_permission('assistant.automation.execute')
def link_opportunity(request, signal_id: int, task_id: int, data: MailSignalLinkOpportunityIn):
    """
    Phase 5：将分析任务与已有商机关联，追踪分析结果对商机推进的贡献。
    """
    from .models import MailSignalEvent, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在', 'data': None}

    try:
        from apps.crm.models import Opportunity
        opp = Opportunity.objects.filter(id=data.opportunity_id, is_deleted=False).first()
        if not opp:
            return {'code': 404, 'msg': f'商机 #{data.opportunity_id} 不存在', 'data': None}
        opp_label = str(opp.title or f'商机#{data.opportunity_id}')
    except Exception:
        opp_label = f'商机#{data.opportunity_id}'

    refs = list(plan.target_object_refs or [])
    existing_opp_ids = {r.get('id') for r in refs if r.get('type') == 'opportunity'}
    if data.opportunity_id not in existing_opp_ids:
        refs.append({
            'type': 'opportunity',
            'id': data.opportunity_id,
            'label': opp_label,
            'linked_note': data.note or '',
        })
        plan.target_object_refs = refs
        plan.save(update_fields=['target_object_refs', 'updated_at'])

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'task_id': plan.id,
            'opportunity_id': data.opportunity_id,
            'opportunity_label': opp_label,
            'target_object_refs': plan.target_object_refs,
        },
    }


@mail_router.post(
    '/mail-signals/{signal_id}/tasks/{task_id}/feedback',
    summary='记录客户/内部反馈（Phase 5）',
)
@require_permission('assistant.automation.execute')
def record_task_feedback(request, signal_id: int, task_id: int, data: MailSignalFeedbackIn):
    """
    Phase 5：记录客户或内部反馈。

    - source=customer 时可携带 satisfaction_score（1-5）
    - reused=True 代表该报告/建议已被复用
    """
    from django.utils import timezone as dj_tz
    from .models import MailSignalEvent, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    event = MailSignalEvent.objects.filter(id=signal_id, account_id=account.id).first()
    if not event:
        return {'code': 404, 'msg': '邮件事件不存在', 'data': None}

    plan = AssistantActionPlan.objects.filter(
        id=task_id,
        source_event_id=event.id,
        account_id=account.id,
    ).first()
    if not plan:
        return {'code': 404, 'msg': '任务草稿不存在', 'data': None}

    score = data.satisfaction_score
    if score is not None and not (1 <= int(score) <= 5):
        return {'code': 4024, 'msg': 'satisfaction_score 必须在 1-5 之间', 'data': None}

    payload = dict(plan.action_payload or {})
    records = list(payload.get('feedback_records') or [])
    records.append({
        'source': data.source or 'customer',
        'satisfaction_score': int(score) if score is not None else None,
        'reused': bool(data.reused),
        'feedback_text': data.feedback_text or '',
        'report_index': data.report_index,
        'created_by': account.id,
        'created_at': dj_tz.now().isoformat(),
    })
    payload['feedback_records'] = records
    plan.action_payload = payload
    plan.save(update_fields=['action_payload', 'updated_at'])

    return {
        'code': 200,
        'msg': 'OK',
        'data': {'feedback_count': len(records)},
    }


@mail_router.get(
    '/mail-signal-analytics',
    summary='邮件信号分析效果复盘看板（Phase 5）',
)
@require_permission('assistant.context.read')
def mail_signal_analytics(request, days: int = 30):
    """
    Phase 5：复盘看板数据源。

    返回指定天数内的采纳率、任务分布、商机贡献等统计数据。
    """
    from django.utils import timezone as dj_tz
    from django.db.models import Count, Q
    from .models import MailSignalEvent, AssistantActionPlan

    account = _get_account(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    days = max(1, min(180, int(days or 30)))
    since = dj_tz.now() - dj_tz.timedelta(days=days)

    signal_qs = MailSignalEvent.objects.filter(account_id=account.id, created_at__gte=since)
    total_signals = signal_qs.count()
    signal_by_type = list(
        signal_qs.values('mail_signal_type').annotate(count=Count('id')).order_by('-count')
    )
    signal_by_status = list(
        signal_qs.values('status').annotate(count=Count('id')).order_by('-count')
    )

    plan_qs = AssistantActionPlan.objects.filter(
        account_id=account.id,
        source_event_type='mail_signal',
        created_at__gte=since,
    )
    total_plans = plan_qs.count()
    adopted_count = plan_qs.filter(status=AssistantActionPlan.Status.CONFIRMED).count()
    rejected_count = plan_qs.filter(status=AssistantActionPlan.Status.REJECTED).count()
    executed_count = plan_qs.filter(status=AssistantActionPlan.Status.EXECUTED).count()
    plan_by_task_key = list(
        plan_qs.values('task_key').annotate(count=Count('id')).order_by('-count')
    )

    phase2_task_keys = {'market_trend_brief', 'competitive_intel_brief', 'claim_strategy_brief'}
    phase2_plans = plan_qs.filter(task_key__in=phase2_task_keys)
    phase2_total = phase2_plans.count()
    phase2_adopted = phase2_plans.filter(status=AssistantActionPlan.Status.CONFIRMED).count()

    opportunity_linked_candidates = plan_qs.exclude(
        target_object_refs__isnull=True,
    )
    opportunity_linked = sum(
        1 for p in opportunity_linked_candidates.only('target_object_refs')
        if any(
            isinstance(ref, dict) and ref.get('type') == 'opportunity'
            for ref in (p.target_object_refs or [])
        )
    )

    feedback_records = []
    for row in plan_qs.only('action_payload'):
        payload = row.action_payload or {}
        feedback_records.extend(payload.get('feedback_records') or [])

    customer_feedback = [r for r in feedback_records if (r.get('source') or 'customer') == 'customer']
    scored_feedback = [int(r['satisfaction_score']) for r in customer_feedback if r.get('satisfaction_score') is not None]
    reused_records = [r for r in feedback_records if r.get('reused') is True]

    adoption_rate = round(adopted_count / total_plans * 100, 1) if total_plans > 0 else 0
    phase2_adoption_rate = round(phase2_adopted / phase2_total * 100, 1) if phase2_total > 0 else 0
    report_reuse_rate = round(len(reused_records) / total_plans * 100, 1) if total_plans > 0 else 0
    satisfaction_avg = round(sum(scored_feedback) / len(scored_feedback), 2) if scored_feedback else None

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'period_days': days,
            'signals': {
                'total': total_signals,
                'by_type': signal_by_type,
                'by_status': signal_by_status,
            },
            'tasks': {
                'total': total_plans,
                'adopted': adopted_count,
                'rejected': rejected_count,
                'executed': executed_count,
                'adoption_rate_pct': adoption_rate,
                'by_task_key': plan_by_task_key,
            },
            'phase2_specialist': {
                'total': phase2_total,
                'adopted': phase2_adopted,
                'adoption_rate_pct': phase2_adoption_rate,
            },
            'opportunity_contribution': {
                'tasks_linked_to_opportunity': opportunity_linked,
            },
            'feedback': {
                'total_records': len(feedback_records),
                'customer_records': len(customer_feedback),
                'report_reuse_rate_pct': report_reuse_rate,
                'customer_satisfaction_avg': satisfaction_avg,
            },
        },
    }


# ============================================================================
# Phase 6：主动洞察 API
# ============================================================================


@mail_router.get('/proactive-insights')
def list_proactive_insights(request, insight_type: str = None, status: str = None,
                            client_id: int = None, priority: str = None,
                            page: int = 1, page_size: int = 20):
    """Phase 6 洞察列表"""
    from .models import ProactiveInsight

    qs = ProactiveInsight.objects.all()
    if insight_type:
        qs = qs.filter(insight_type=insight_type)
    if status:
        qs = qs.filter(status=status)
    if client_id:
        qs = qs.filter(client_id=client_id)
    if priority:
        qs = qs.filter(priority=priority)

    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start:start + page_size].values(
        'id', 'insight_type', 'title', 'summary', 'priority',
        'relevance_score', 'client_id', 'client_name', 'status',
        'created_at', 'expires_at', 'scan_batch_id',
    ))

    return {'code': 0, 'msg': 'ok', 'data': {'total': total, 'items': items}}


@mail_router.get('/proactive-insights/{insight_id}')
def get_proactive_insight(request, insight_id: int):
    """Phase 6 洞察详情"""
    from .models import ProactiveInsight

    insight = ProactiveInsight.objects.filter(id=insight_id).first()
    if not insight:
        return {'code': 404, 'msg': 'not_found', 'data': None}

    data = {
        'id': insight.id,
        'insight_type': insight.insight_type,
        'title': insight.title,
        'summary': insight.summary,
        'detail': insight.detail,
        'client_id': insight.client_id,
        'client_name': insight.client_name,
        'related_categories': insight.related_categories,
        'related_claim_types': insight.related_claim_types,
        'trigger_source': insight.trigger_source,
        'scan_batch_id': insight.scan_batch_id,
        'source_evidence_refs': insight.source_evidence_refs,
        'priority': insight.priority,
        'relevance_score': insight.relevance_score,
        'urgency_score': insight.urgency_score,
        'impact_score': insight.impact_score,
        'status': insight.status,
        'reviewed_by': insight.reviewed_by,
        'reviewed_at': str(insight.reviewed_at) if insight.reviewed_at else None,
        'pushed_at': str(insight.pushed_at) if insight.pushed_at else None,
        'push_channel': insight.push_channel,
        'expires_at': str(insight.expires_at) if insight.expires_at else None,
        'action_taken': insight.action_taken,
        'action_result': insight.action_result,
        'linked_opportunity_id': insight.linked_opportunity_id,
        'feedback_score': insight.feedback_score,
        'feedback_note': insight.feedback_note,
        'governance_level': insight.governance_level,
        'created_at': str(insight.created_at),
        'updated_at': str(insight.updated_at),
    }
    return {'code': 0, 'msg': 'ok', 'data': data}


@mail_router.post('/proactive-insights/{insight_id}/review')
def review_proactive_insight(request, insight_id: int):
    """Phase 6 审核洞察（approve / dismiss / submit_review / push）"""
    from .proactive_insight_service import review_insight

    import json as _json
    body = _json.loads(request.body) if request.body else {}
    action = body.get('action', '')
    note = body.get('note', '')
    reviewer_id = getattr(getattr(request, 'auth', None), 'id', None)

    result = review_insight(insight_id, action, reviewer_id=reviewer_id, note=note)
    if not result.get('ok'):
        return {'code': 400, 'msg': result.get('error', 'failed'), 'data': None}
    return {'code': 0, 'msg': 'ok', 'data': result}


@mail_router.post('/proactive-insights/{insight_id}/act')
def act_proactive_insight(request, insight_id: int):
    """Phase 6 记录洞察行动"""
    from .proactive_insight_service import record_action

    import json as _json
    body = _json.loads(request.body) if request.body else {}
    result = record_action(
        insight_id,
        action_taken=body.get('action_taken', ''),
        action_result=body.get('action_result', ''),
        opportunity_id=body.get('opportunity_id'),
    )
    if not result.get('ok'):
        return {'code': 400, 'msg': result.get('error', 'failed'), 'data': None}
    return {'code': 0, 'msg': 'ok', 'data': result}


@mail_router.post('/proactive-insights/{insight_id}/feedback')
def feedback_proactive_insight(request, insight_id: int):
    """Phase 6 洞察反馈评分"""
    from .proactive_insight_service import record_feedback

    import json as _json
    body = _json.loads(request.body) if request.body else {}
    result = record_feedback(insight_id, score=body.get('score', 3), note=body.get('note', ''))
    if not result.get('ok'):
        return {'code': 400, 'msg': result.get('error', 'failed'), 'data': None}
    return {'code': 0, 'msg': 'ok', 'data': result}


@mail_router.post('/proactive-insights/{insight_id}/convert-to-action')
def convert_insight_to_action(request, insight_id: int):
    """Phase 6 将洞察转为 AssistantActionPlan"""
    from .proactive_insight_service import convert_to_action_plan

    account_id = getattr(getattr(request, 'auth', None), 'id', 0)
    result = convert_to_action_plan(insight_id, account_id=account_id)
    if not result.get('ok'):
        return {'code': 400, 'msg': result.get('error', 'failed'), 'data': None}
    return {'code': 0, 'msg': 'ok', 'data': result}


@mail_router.get('/proactive-insight-analytics')
def proactive_insight_analytics(request):
    """Phase 6 洞察效果分析"""
    from .proactive_insight_service import get_insight_analytics
    return {'code': 0, 'msg': 'ok', 'data': get_insight_analytics()}


@mail_router.get('/proactive-scan-configs')
def list_scan_configs(request):
    """Phase 6 扫描配置列表"""
    from .models import ProactiveScanConfig

    configs = list(ProactiveScanConfig.objects.all().values(
        'id', 'name', 'scan_type', 'enabled', 'frequency',
        'data_sources', 'last_run_at', 'run_count', 'created_at',
    ))
    return {'code': 0, 'msg': 'ok', 'data': configs}


@mail_router.post('/proactive-scan-configs/{config_id}/trigger')
def trigger_scan(request, config_id: int):
    """Phase 6 手动触发一次扫描"""
    from .models import ProactiveScanConfig
    from .proactive_scan_engine import (
        ClientPeriodicPipeline,
        ProjectScoutPipeline,
        TrendMonitorPipeline,
    )

    config = ProactiveScanConfig.objects.filter(id=config_id).first()
    if not config:
        return {'code': 404, 'msg': 'config_not_found', 'data': None}

    pipeline_map = {
        'trend_monitor': TrendMonitorPipeline,
        'client_periodic': ClientPeriodicPipeline,
        'project_scout': ProjectScoutPipeline,
    }
    pipeline_cls = pipeline_map.get(config.scan_type)
    if not pipeline_cls:
        return {'code': 400, 'msg': f'unknown_scan_type: {config.scan_type}', 'data': None}

    result = pipeline_cls().execute(config)
    return {'code': 0, 'msg': 'ok', 'data': result}


@mail_router.get('/proactive-scan-configs/{config_id}/runs')
def list_scan_runs(request, config_id: int, page: int = 1, page_size: int = 20):
    """Phase 6 扫描运行历史"""
    from .models import ProactiveScanRun

    qs = ProactiveScanRun.objects.filter(config_id=config_id)
    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start:start + page_size].values(
        'id', 'batch_id', 'status', 'started_at', 'completed_at',
        'duration_seconds', 'raw_signals_count', 'insights_generated',
        'insights_deduplicated', 'created_at',
    ))
    return {'code': 0, 'msg': 'ok', 'data': {'total': total, 'items': items}}
