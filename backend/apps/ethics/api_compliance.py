"""
合规检查 API (REG002)
"""
from ninja import Router, Query
from apps.identity.decorators import require_permission, _get_account_from_request
from .schemas import (
    ComplianceCheckCreateIn, ComplianceFindingCreateIn,
    FindingCloseIn, ComplianceCheckQueryParams, ErrorOut,
)
from .services import compliance_service as service

router = Router()


def _check_to_dict(c) -> dict:
    return {
        'id': c.id,
        'check_no': c.check_no,
        'check_type': c.check_type,
        'check_type_display': c.get_check_type_display(),
        'status': c.status,
        'status_display': c.get_status_display(),
        'scope': c.scope,
        'check_date': str(c.check_date) if c.check_date else None,
        'completed_date': str(c.completed_date) if c.completed_date else None,
        'lead_auditor': c.lead_auditor,
        'team_members': c.team_members,
        'finding_count': c.finding_count,
        'critical_count': c.critical_count,
        'protocol_id': c.protocol_id,
        'notes': c.notes,
        'created_at': c.create_time.isoformat(),
    }


def _finding_to_dict(f) -> dict:
    return {
        'id': f.id,
        'check_id': f.compliance_check_id,
        'finding_no': f.finding_no,
        'severity': f.severity,
        'severity_display': f.get_severity_display(),
        'description': f.description,
        'evidence': f.evidence,
        'root_cause': f.root_cause,
        'corrective_action': f.corrective_action,
        'corrective_deadline': str(f.corrective_deadline) if f.corrective_deadline else None,
        'status': f.status,
        'status_display': f.get_status_display(),
        'related_deviation_id': f.related_deviation_id,
        'related_capa_id': f.related_capa_id,
        'verified_by': f.verified_by,
        'verified_at': f.verified_at.isoformat() if f.verified_at else None,
        'created_at': f.create_time.isoformat(),
    }


@router.post('/compliance-checks', summary='创建合规检查')
@require_permission('ethics.compliance.create')
def create_compliance_check(request, data: ComplianceCheckCreateIn):
    account = _get_account_from_request(request)
    check = service.create_compliance_check(
        check_type=data.check_type,
        scope=data.scope,
        check_date=data.check_date,
        lead_auditor=data.lead_auditor or '',
        team_members=data.team_members or [],
        protocol_id=data.protocol_id,
        notes=data.notes or '',
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '合规检查创建成功', 'data': _check_to_dict(check)}


@router.get('/compliance-checks', summary='合规检查列表')
@require_permission('ethics.compliance.read')
def list_compliance_checks(request, params: ComplianceCheckQueryParams = Query(...)):
    result = service.list_compliance_checks(
        check_type=params.check_type,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_check_to_dict(c) for c in result['items']],
            'total': result['total'],
        },
    }


@router.get('/compliance-checks/{check_id}', summary='合规检查详情', response={200: dict, 404: ErrorOut})
@require_permission('ethics.compliance.read')
def get_compliance_check(request, check_id: int):
    check = service.get_compliance_check(check_id)
    if not check:
        return 404, {'code': 404, 'msg': '检查记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _check_to_dict(check)}


@router.post('/compliance-checks/{check_id}/complete', summary='完成合规检查', response={200: dict, 400: ErrorOut})
@require_permission('ethics.compliance.create')
def complete_check(request, check_id: int):
    check = service.complete_check(check_id)
    if not check:
        return 400, {'code': 400, 'msg': '操作失败'}
    return {'code': 200, 'msg': '检查已完成', 'data': _check_to_dict(check)}


@router.get('/compliance-checks/{check_id}/findings', summary='检查发现列表')
@require_permission('ethics.compliance.read')
def list_findings(request, check_id: int):
    findings = service.list_findings(check_id)
    return {'code': 200, 'msg': 'OK', 'data': [_finding_to_dict(f) for f in findings]}


@router.post('/compliance-findings', summary='创建检查发现', response={200: dict, 400: ErrorOut})
@require_permission('ethics.compliance.create')
def create_finding(request, data: ComplianceFindingCreateIn):
    account = _get_account_from_request(request)
    finding = service.create_finding(
        check_id=data.check_id,
        severity=data.severity,
        description=data.description,
        evidence=data.evidence or '',
        corrective_action=data.corrective_action or '',
        corrective_deadline=data.corrective_deadline,
        related_deviation_id=data.related_deviation_id,
        related_capa_id=data.related_capa_id,
        created_by_id=account.id if account else None,
    )
    if not finding:
        return 400, {'code': 400, 'msg': '创建失败：检查记录不存在'}
    return {'code': 200, 'msg': '发现已记录', 'data': _finding_to_dict(finding)}


@router.post('/compliance-findings/{finding_id}/close', summary='验证关闭发现', response={200: dict, 400: ErrorOut})
@require_permission('ethics.compliance.create')
def close_finding(request, finding_id: int, data: FindingCloseIn):
    finding = service.close_finding(finding_id, data.verified_by)
    if not finding:
        return 400, {'code': 400, 'msg': '关闭失败'}
    return {'code': 200, 'msg': '发现已验证关闭', 'data': _finding_to_dict(finding)}
