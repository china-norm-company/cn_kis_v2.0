"""
审计管理 API

端点：
- GET  /quality/audits/list        审计列表
- POST /quality/audits/create      创建审计
- GET  /quality/audits/{id}        审计详情
- POST /quality/audits/{id}/start  开始审计
- POST /quality/audits/{id}/complete 完成审计
- POST /quality/audits/{id}/close  关闭审计
- POST /quality/audits/{id}/findings/create  添加发现项
- GET  /quality/audits/{id}/findings  发现项列表
- GET  /quality/audits/{id}/report 审计报告
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import date

from apps.identity.decorators import require_permission
from .services import audit_management_service as svc

router = Router()


# ============================================================================
# Schema
# ============================================================================
class AuditQueryParams(Schema):
    audit_type: Optional[str] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class AuditCreateIn(Schema):
    code: str
    title: str
    audit_type: str
    scope: str = ''
    auditor: str
    planned_date: date
    auditor_org: str = ''
    checklist: list = []


class AuditCompleteIn(Schema):
    summary: str = ''


class FindingCreateIn(Schema):
    title: str
    severity: str
    clause: str = ''
    corrective_requirement: str = ''
    corrective_deadline: Optional[date] = None


class AuditAdvanceIn(Schema):
    new_status: str


# ============================================================================
# Serializer
# ============================================================================
def _audit_to_dict(a) -> dict:
    return {
        'id': a.id, 'code': a.code, 'title': a.title,
        'audit_type': a.audit_type, 'scope': a.scope,
        'auditor': a.auditor, 'auditor_org': a.auditor_org,
        'planned_date': a.planned_date.isoformat(),
        'actual_date': a.actual_date.isoformat() if a.actual_date else None,
        'status': a.status, 'summary': a.summary,
        'checklist': a.checklist,
        'create_time': a.create_time.isoformat(),
    }


def _finding_to_dict(f) -> dict:
    return {
        'id': f.id, 'audit_id': f.audit_id,
        'sequence': f.sequence, 'title': f.title,
        'severity': f.severity, 'status': f.status,
        'clause': f.clause,
        'corrective_requirement': f.corrective_requirement,
        'corrective_deadline': f.corrective_deadline.isoformat() if f.corrective_deadline else None,
        'deviation_id': f.deviation_id,
        'create_time': f.create_time.isoformat(),
    }


# ============================================================================
# API
# ============================================================================
@router.get('/audits/list', summary='审计列表')
@require_permission('quality.audit.read')
def list_audits(request, params: AuditQueryParams = Query(...)):
    result = svc.list_audits(
        audit_type=params.audit_type, status=params.status,
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_audit_to_dict(a) for a in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.post('/audits/create', summary='创建审计')
@require_permission('quality.audit.manage')
def create_audit(request, data: AuditCreateIn):
    audit = svc.create_audit(
        code=data.code, title=data.title, audit_type=data.audit_type,
        scope=data.scope, auditor=data.auditor, planned_date=data.planned_date,
        auditor_org=data.auditor_org, checklist=data.checklist,
    )
    return {'code': 200, 'msg': 'OK', 'data': _audit_to_dict(audit)}


@router.get('/audits/{audit_id}', summary='审计详情')
@require_permission('quality.audit.read')
def get_audit(request, audit_id: int):
    audit = svc.get_audit(audit_id)
    if not audit:
        return 404, {'code': 404, 'msg': '审计不存在'}
    result = _audit_to_dict(audit)
    result['findings'] = [_finding_to_dict(f) for f in svc.list_findings(audit_id)]
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/audits/{audit_id}/start', summary='开始审计')
@require_permission('quality.audit.manage')
def start_audit(request, audit_id: int):
    audit = svc.start_audit(audit_id)
    if not audit:
        return 400, {'code': 400, 'msg': '无法开始审计'}
    return {'code': 200, 'msg': '审计已开始', 'data': _audit_to_dict(audit)}


@router.post('/audits/{audit_id}/complete', summary='完成审计')
@require_permission('quality.audit.manage')
def complete_audit(request, audit_id: int, data: AuditCompleteIn):
    audit = svc.complete_audit(audit_id, summary=data.summary)
    if not audit:
        return 400, {'code': 400, 'msg': '无法完成审计'}
    return {'code': 200, 'msg': '审计已完成', 'data': _audit_to_dict(audit)}


@router.post('/audits/{audit_id}/close', summary='关闭审计')
@require_permission('quality.audit.manage')
def close_audit(request, audit_id: int):
    audit = svc.close_audit(audit_id)
    if not audit:
        return 400, {'code': 400, 'msg': '无法关闭审计'}
    return {'code': 200, 'msg': '审计已关闭', 'data': _audit_to_dict(audit)}


@router.post('/audits/{audit_id}/findings/create', summary='添加发现项')
@require_permission('quality.audit.manage')
def add_finding(request, audit_id: int, data: FindingCreateIn):
    finding = svc.add_finding(
        audit_id, title=data.title, severity=data.severity,
        clause=data.clause,
        corrective_requirement=data.corrective_requirement,
        corrective_deadline=data.corrective_deadline,
    )
    if not finding:
        return 400, {'code': 400, 'msg': '添加发现项失败'}
    return {'code': 200, 'msg': '发现项已添加', 'data': _finding_to_dict(finding)}


@router.get('/audits/{audit_id}/findings', summary='发现项列表')
@require_permission('quality.audit.read')
def get_findings(request, audit_id: int):
    findings = svc.list_findings(audit_id)
    return {'code': 200, 'msg': 'OK', 'data': [_finding_to_dict(f) for f in findings]}


@router.get('/audits/{audit_id}/report', summary='审计报告')
@require_permission('quality.audit.read')
def get_audit_report(request, audit_id: int):
    report = svc.generate_audit_report(audit_id)
    if not report:
        return 404, {'code': 404, 'msg': '审计不存在'}
    return {'code': 200, 'msg': 'OK', 'data': report}
