"""
协议管理 API

端点：
- GET  /protocol/list           协议列表
- GET  /protocol/{id}           协议详情
- POST /protocol/create         创建协议
- POST /protocol/upload         上传协议文件
- POST /protocol/{id}/parse     触发 AI 解析
- GET  /protocol/{id}/logs      解析日志
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import datetime
from . import services
from .models import Protocol
from apps.identity.decorators import _get_account_from_request, require_permission
from apps.identity.filters import get_visible_object

router = Router()


# ============================================================================
# Schema
# ============================================================================
class ProtocolOut(Schema):
    id: int
    title: str
    code: Optional[str] = None
    file_path: Optional[str] = None
    status: str
    parsed_data: Optional[dict] = None
    efficacy_type: Optional[str] = None
    sample_size: Optional[int] = None
    create_time: datetime
    update_time: datetime


class ProtocolCreateIn(Schema):
    title: str
    code: Optional[str] = None
    efficacy_type: Optional[str] = None
    sample_size: Optional[int] = None


class ProtocolQueryParams(Schema):
    status: Optional[str] = None
    title: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ProtocolUploadIn(Schema):
    protocol_id: int
    file_path: str


def _protocol_to_dict(p) -> dict:
    return {
        'id': p.id,
        'title': p.title,
        'code': p.code,
        'file_path': p.file_path,
        'status': p.status,
        'parsed_data': p.parsed_data,
        'efficacy_type': p.efficacy_type,
        'sample_size': p.sample_size,
        'create_time': p.create_time.isoformat(),
        'update_time': p.update_time.isoformat(),
    }


# ============================================================================
# 端点
# ============================================================================
@router.get('/list', summary='协议列表')
@require_permission('protocol.protocol.read')
def list_protocols(request, params: ProtocolQueryParams = Query(...)):
    """分页查询协议列表（数据权限过滤）"""
    account = _get_account_from_request(request)
    result = services.list_protocols(
        status=params.status,
        title=params.title,
        page=params.page,
        page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_protocol_to_dict(item) for item in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/create', summary='创建协议')
@require_permission('protocol.protocol.create')
def create_protocol(request, data: ProtocolCreateIn):
    """创建新协议"""
    protocol = services.create_protocol(
        title=data.title,
        code=data.code or '',
        efficacy_type=data.efficacy_type or '',
        sample_size=data.sample_size,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'id': protocol.id, 'title': protocol.title, 'status': protocol.status},
    }


@router.post('/upload', summary='上传协议文件')
@require_permission('protocol.protocol.update')
def upload_protocol(request, data: ProtocolUploadIn):
    """上传协议文件"""
    protocol = services.upload_protocol_file(data.protocol_id, data.file_path)
    if not protocol:
        return 404, {'code': 404, 'msg': '协议不存在'}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'id': protocol.id, 'file_path': protocol.file_path, 'status': protocol.status},
    }


@router.get('/{protocol_id}', summary='协议详情')
@require_permission('protocol.protocol.read')
def get_protocol(request, protocol_id: int):
    """获取协议详细信息；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    protocol = get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account)
    if not protocol:
        return 404, {'code': 404, 'msg': '协议不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _protocol_to_dict(protocol)}


@router.post('/{protocol_id}/parse', summary='触发 AI 解析')
@require_permission('protocol.protocol.update')
def trigger_parse(request, protocol_id: int):
    """触发协议 AI 解析；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    if not get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '协议不存在'}
    account_id = account.id if account else None
    parse_log = services.trigger_parse(protocol_id, account_id=account_id)
    if not parse_log:
        return 400, {'code': 400, 'msg': '无法解析：协议不存在或未上传文件'}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'parse_log_id': parse_log.id, 'status': parse_log.status},
    }


@router.post('/{protocol_id}/accept-parsed', summary='采纳 AI 解析结果写入协议')
@require_permission('protocol.protocol.update')
def accept_parsed(request, protocol_id: int):
    """
    数字员工流程内嵌：把 AI 解析或编排产出的结构化数据写入协议 parsed_data。
    前端动作卡片点击"采纳写入协议"时调用。
    """
    import json
    account = _get_account_from_request(request)
    protocol = get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account)
    if not protocol:
        return 404, {'code': 404, 'msg': '协议不存在'}

    body = {}
    try:
        body = json.loads(request.body) if request.body else {}
    except Exception:
        pass

    parsed_data = body.get('parsed_data') or protocol.parsed_data
    if not parsed_data or not isinstance(parsed_data, dict):
        return 400, {'code': 400, 'msg': 'parsed_data 不可为空'}

    try:
        result = services.set_parsed_data(protocol_id, parsed_data)
        if not result:
            return 400, {'code': 400, 'msg': '写入失败'}
    except ValueError as exc:
        return 400, {'code': 400, 'msg': str(exc)}

    try:
        from apps.secretary.runtime_plane import create_execution_task, finalize_execution_task
        task_id = create_execution_task(
            runtime_type='service',
            name='accept-parsed-result',
            target='protocol.accept_parsed',
            account_id=getattr(account, 'id', None),
            input_payload={'protocol_id': protocol_id},
            role_code='solution_designer',
            workstation_key='research',
            business_object_type='protocol',
            business_object_id=str(protocol_id),
        )
        finalize_execution_task(task_id, ok=True, output={'protocol_id': protocol_id, 'status': 'parsed'})
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': {'protocol_id': protocol_id, 'status': 'parsed'}}


@router.get('/{protocol_id}/dashboard', summary='项目级仪表板')
@require_permission('protocol.protocol.read')
def protocol_dashboard(request, protocol_id: int):
    """项目级聚合仪表板：入组/工单/访视/偏差/CAPA/财务"""
    from datetime import date
    from django.db.models import Count, Q

    account = _get_account_from_request(request)
    protocol = get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account)
    if not protocol:
        return 404, {'code': 404, 'msg': '协议不存在'}

    today = date.today()
    result = {'protocol': _protocol_to_dict(protocol)}

    # Enrollment stats
    try:
        from apps.subject.models import Enrollment
        enrollments = Enrollment.objects.filter(protocol_id=protocol_id)
        enrollment_stats = list(enrollments.values('status').annotate(count=Count('id')))
        enrolled_count = enrollments.filter(status='enrolled').count()
        result['enrollment'] = {
            'by_status': enrollment_stats,
            'enrolled': enrolled_count,
            'total': enrollments.count(),
            'rate': round(enrolled_count / protocol.sample_size * 100, 1) if protocol.sample_size else 0,
        }
    except Exception:
        result['enrollment'] = {'by_status': [], 'enrolled': 0, 'total': 0, 'rate': 0}

    # WorkOrder stats
    try:
        from apps.workorder.models import WorkOrder
        wo_qs = WorkOrder.objects.filter(enrollment__protocol_id=protocol_id, is_deleted=False)
        wo_status = list(wo_qs.values('status').annotate(count=Count('id')))
        wo_total = wo_qs.count()
        wo_done = wo_qs.filter(status__in=['completed', 'approved']).count()
        wo_overdue = wo_qs.filter(due_date__lt=today).exclude(
            status__in=['completed', 'approved', 'cancelled'],
        ).count()

        by_assignee = list(
            wo_qs.exclude(assigned_to__isnull=True)
            .values('assigned_to')
            .annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(status__in=['completed', 'approved'])),
            )
            .order_by('-total')[:10]
        )

        result['workorders'] = {
            'by_status': wo_status,
            'total': wo_total,
            'completed': wo_done,
            'completion_rate': round(wo_done / wo_total * 100, 1) if wo_total else 0,
            'overdue': wo_overdue,
            'by_assignee': by_assignee,
        }
    except Exception:
        result['workorders'] = {'by_status': [], 'total': 0, 'completed': 0, 'completion_rate': 0, 'overdue': 0, 'by_assignee': []}

    # Visit compliance
    try:
        from apps.visit.models import VisitPlan
        plans = VisitPlan.objects.filter(protocol_id=protocol_id)
        if plans.exists():
            plan = plans.first()
            from apps.visit.services.compliance_service import ComplianceAnalysisService
            compliance = ComplianceAnalysisService.analyze_visit_completeness(plan.id)
            result['visit_compliance'] = compliance
        else:
            result['visit_compliance'] = None
    except Exception:
        result['visit_compliance'] = None

    # Quality: deviations + CAPA
    try:
        from apps.quality.models import Deviation, CAPA
        dev_qs = Deviation.objects.filter(project_id=protocol_id)
        dev_stats = list(dev_qs.values('status').annotate(count=Count('id')))
        dev_severity = list(dev_qs.values('severity').annotate(count=Count('id')))
        capa_qs = CAPA.objects.filter(deviation__project_id=protocol_id)
        capa_stats = list(capa_qs.values('status').annotate(count=Count('id')))
        result['quality'] = {
            'deviation_by_status': dev_stats,
            'deviation_by_severity': dev_severity,
            'deviation_total': dev_qs.count(),
            'capa_by_status': capa_stats,
            'capa_total': capa_qs.count(),
        }
    except Exception:
        result['quality'] = {'deviation_by_status': [], 'deviation_by_severity': [], 'deviation_total': 0, 'capa_by_status': [], 'capa_total': 0}

    # Finance summary
    try:
        from apps.finance.models import Contract, Invoice, Payment
        contracts = Contract.objects.filter(protocol_id=protocol_id)
        contract_amount = sum(float(c.amount or 0) for c in contracts)
        invoices = Invoice.objects.filter(contract__protocol_id=protocol_id)
        invoiced = sum(float(i.total or 0) for i in invoices)
        payments = Payment.objects.filter(invoice__contract__protocol_id=protocol_id)
        received = sum(float(p.actual_amount or 0) for p in payments)
        result['finance'] = {
            'contract_amount': contract_amount,
            'invoiced': invoiced,
            'received': received,
            'outstanding': round(invoiced - received, 2),
        }
    except Exception:
        result['finance'] = {'contract_amount': 0, 'invoiced': 0, 'received': 0, 'outstanding': 0}

    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/{protocol_id}/startup-package', summary='生成启动包')
@require_permission('protocol.protocol.update')
def generate_startup_package(request, protocol_id: int):
    """B3：一键生成项目启动包（访视计划/资源需求/eTMF/CRF/伦理/预算/里程碑/飞书群）"""
    account = _get_account_from_request(request)
    if not get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '协议不存在'}
    from .services.startup_package_service import generate_startup_package as gen_pkg
    result = gen_pkg(protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/{protocol_id}/publish-status', summary='发布项目状态通报')
@require_permission('protocol.protocol.read')
def publish_status(request, protocol_id: int):
    """E2：一键发布项目状态到飞书群（含数字员工门禁）"""
    account = _get_account_from_request(request)
    if not get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '协议不存在'}
    try:
        from apps.secretary.evidence_gate_service import check_business_gate
        passed, reason, _ = check_business_gate(
            'release_digital_worker',
            {'skill_id': 'efficacy-report-generator', 'role_code': 'report_generator'},
        )
        if not passed:
            return 400, {'code': 400, 'msg': f'数字员工门禁未通过，禁止发布：{reason}'}
    except ImportError:
        pass
    from apps.notification.card_template_service import publish_status_report
    result = publish_status_report(protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/{protocol_id}/logs', summary='解析日志')
@require_permission('protocol.protocol.read')
def get_parse_logs(request, protocol_id: int):
    """获取协议的解析日志；按数据权限校验协议可见性"""
    account = _get_account_from_request(request)
    if not get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '协议不存在'}
    logs = services.get_parse_logs(protocol_id)
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': log.id,
                    'status': log.status,
                    'error_message': log.error_message,
                    'create_time': log.create_time.isoformat(),
                    'finish_time': log.finish_time.isoformat() if log.finish_time else None,
                }
                for log in logs
            ],
        },
    }


# ============================================================================
# 协议状态变更
# ============================================================================
@router.post('/{protocol_id}/activate', summary='激活协议', response={200: dict, 400: dict, 404: dict})
@require_permission('protocol.protocol.update')
def activate_protocol(request, protocol_id: int):
    """将协议状态变更为 active（生效中）。草稿/已上传状态可激活。"""
    account = _get_account_from_request(request)
    if not get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '协议不存在'}
    p = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if p.status == 'active':
        return {'code': 200, 'msg': '协议已处于生效状态', 'data': {'id': p.id, 'status': p.status}}

    # 数字员工启动门禁：激活协议前通过 EvidenceGate 检查
    try:
        from apps.secretary.evidence_gate_service import check_business_gate
        passed, reason, gate_run_id = check_business_gate(
            'release_digital_worker',
            {'protocol_id': protocol_id, 'role_code': 'startup_gate_assistant'},
        )
        if not passed:
            return 400, {
                'code': 400,
                'msg': f'数字员工启动门禁未通过，无法激活协议：{reason}',
                'data': {'gate_run_id': gate_run_id, 'gate_blocked': True},
            }
    except ImportError:
        pass
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).debug('activate_protocol gate check skipped: %s', exc)

    updated = services.update_protocol(protocol_id, status='active')
    if not updated:
        return 400, {'code': 400, 'msg': '激活失败'}
    return {'code': 200, 'msg': '协议已激活', 'data': {'id': updated.id, 'status': updated.status}}


@router.post('/{protocol_id}/deactivate', summary='归档协议', response={200: dict, 400: dict, 404: dict})
@require_permission('protocol.protocol.update')
def deactivate_protocol(request, protocol_id: int):
    """将协议状态变更为 archived（已归档）。"""
    account = _get_account_from_request(request)
    if not get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '协议不存在'}
    readiness = services.evaluate_archive_readiness(protocol_id)
    if not readiness.get('passed'):
        return 400, {
            'code': 400,
            'msg': '协议未满足归档前置条件，请先完成结项链路',
            'data': readiness,
        }
    updated = services.update_protocol(protocol_id, status='archived')
    if not updated:
        return 400, {'code': 400, 'msg': '归档失败'}
    return {'code': 200, 'msg': '协议已归档', 'data': {'id': updated.id, 'status': updated.status}}


# ============================================================================
# 全景成本快照
# ============================================================================
@router.get('/{protocol_id}/cost-summary', summary='协议全景成本汇总',
            response={200: dict, 404: dict})
@require_permission('protocol.protocol.read')
def get_cost_summary(request, protocol_id: int):
    """
    返回该协议下来自三个来源的成本数据汇总：
    - 易快报报销单（差旅/采购/耗材等运营费用）
    - 受试者礼金支付
    - 预算申请总额

    数据来自 ProtocolCostSnapshot；若无快照则实时计算（较慢）。
    """
    from django.db import connection as _conn
    from .models import ProtocolCostSnapshot

    account = _get_account_from_request(request)
    proto = get_visible_object(Protocol.objects.filter(id=protocol_id, is_deleted=False), account)
    if not proto:
        return 404, {'code': 404, 'msg': '协议不存在'}

    snapshot = ProtocolCostSnapshot.objects.filter(protocol_code=proto.code).first()

    if snapshot:
        data = {
            'protocol_code': snapshot.protocol_code,
            'protocol_title': snapshot.protocol_title,
            'protocol_status': snapshot.protocol_status,
            'ekb': {
                'expense_count': snapshot.ekb_expense_count,
                'expense_total': float(snapshot.ekb_expense_total),
                'approved_total': float(snapshot.ekb_approved_total),
                'expense_types': snapshot.ekb_expense_types,
            },
            'subject_payment': {
                'payment_count': snapshot.subject_payment_count,
                'paid_count': snapshot.subject_paid_count,
                'payment_total': float(snapshot.subject_payment_total),
                'paid_total': float(snapshot.subject_paid_total),
                'subject_count': snapshot.subject_count,
            },
            'budget': {
                'budget_count': snapshot.budget_count,
                'budget_total': float(snapshot.budget_total),
            },
            'computed_at': snapshot.computed_at.isoformat() if snapshot.computed_at else None,
            'source': 'snapshot',
        }
    else:
        # 实时计算（无快照时降级）
        cur = _conn.cursor()
        cur.execute("""
            SELECT COUNT(*), COALESCE(SUM(amount),0),
                   COALESCE(SUM(CASE WHEN approval_status IN ('approved','reimbursed') THEN amount ELSE 0 END),0)
            FROM t_expense_request WHERE project_name = %s
        """, [proto.code])
        e = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*), COUNT(CASE WHEN status='paid' THEN 1 END),
                   COALESCE(SUM(amount),0), COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0),
                   COUNT(DISTINCT subject_id)
            FROM t_subject_payment WHERE project_code = %s
        """, [proto.code])
        s = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*), COALESCE(SUM(total_income),0)
            FROM t_project_budget WHERE project_name = %s
        """, [proto.code])
        b = cur.fetchone()

        data = {
            'protocol_code': proto.code,
            'protocol_title': proto.title,
            'protocol_status': proto.status,
            'ekb': {
                'expense_count': e[0], 'expense_total': float(e[1]),
                'approved_total': float(e[2]), 'expense_types': {},
            },
            'subject_payment': {
                'payment_count': s[0], 'paid_count': s[1],
                'payment_total': float(s[2]), 'paid_total': float(s[3]),
                'subject_count': s[4],
            },
            'budget': {'budget_count': b[0], 'budget_total': float(b[1])},
            'computed_at': None,
            'source': 'realtime',
        }

    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/cost-summary/top', summary='成本排行榜（Top N 项目）',
            response={200: dict})
@require_permission('protocol.protocol.read')
def get_cost_summary_top(request, by: str = 'ekb_expense_total', limit: int = 20):
    """
    按指定维度排序返回 Top N 项目的成本快照。

    by 可选值：
      ekb_expense_total       按报销金额
      subject_payment_total   按礼金支付金额
      budget_total            按预算金额
      subject_count           按受试者数量
    """
    from .models import ProtocolCostSnapshot
    ALLOWED = {
        'ekb_expense_total', 'subject_payment_total',
        'budget_total', 'subject_count',
    }
    if by not in ALLOWED:
        by = 'ekb_expense_total'
    limit = min(max(limit, 1), 100)

    snapshots = ProtocolCostSnapshot.objects.order_by(f'-{by}')[:limit]
    items = [
        {
            'protocol_code': s.protocol_code,
            'protocol_title': s.protocol_title,
            'protocol_status': s.protocol_status,
            'ekb_expense_total': float(s.ekb_expense_total),
            'subject_payment_total': float(s.subject_payment_total),
            'budget_total': float(s.budget_total),
            'subject_count': s.subject_count,
            'ekb_expense_count': s.ekb_expense_count,
            'subject_payment_count': s.subject_payment_count,
        }
        for s in snapshots
    ]
    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'total': len(items)}}
