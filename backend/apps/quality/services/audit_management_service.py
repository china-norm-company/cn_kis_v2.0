"""
审计管理服务

包含审计计划CRUD、发现项管理、审计报告生成。
"""
import logging
from datetime import date
from django.db import transaction

from ..models_audit import (
    QualityAudit, AuditStatus, AuditFinding, FindingSeverity, FindingStatus,
)

logger = logging.getLogger(__name__)


def list_audits(audit_type=None, status=None, page=1, page_size=20, **kwargs):
    qs = QualityAudit.objects.filter(is_deleted=False)
    if audit_type:
        qs = qs.filter(audit_type=audit_type)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_audit(audit_id):
    try:
        return QualityAudit.objects.get(id=audit_id, is_deleted=False)
    except QualityAudit.DoesNotExist:
        return None


def create_audit(code, title, audit_type, scope, auditor, planned_date,
                 auditor_org='', checklist=None):
    audit = QualityAudit.objects.create(
        code=code, title=title, audit_type=audit_type,
        scope=scope, auditor=auditor, planned_date=planned_date,
        auditor_org=auditor_org, checklist=checklist or [],
    )

    try:
        from libs.feishu_calendar import create_calendar_event
        event_id = create_calendar_event(
            summary=f'[审计] {title}',
            start_date=str(planned_date),
            description=f'审计编号: {code}\n范围: {scope}\n审计员: {auditor}',
        )
        if event_id:
            audit.feishu_calendar_event_id = event_id
            audit.save(update_fields=['feishu_calendar_event_id'])
    except Exception as e:
        logger.warning(f'Failed to create calendar event for audit {code}: {e}')

    return audit


def start_audit(audit_id):
    audit = get_audit(audit_id)
    if not audit or audit.status != AuditStatus.PLANNED:
        return None
    audit.status = AuditStatus.IN_PROGRESS
    audit.actual_date = date.today()
    audit.save(update_fields=['status', 'actual_date', 'update_time'])
    return audit


def complete_audit(audit_id, summary=''):
    audit = get_audit(audit_id)
    if not audit or audit.status != AuditStatus.IN_PROGRESS:
        return None
    audit.status = AuditStatus.COMPLETED
    audit.summary = summary
    audit.save(update_fields=['status', 'summary', 'update_time'])
    return audit


def close_audit(audit_id):
    audit = get_audit(audit_id)
    if not audit or audit.status != AuditStatus.COMPLETED:
        return None
    audit.status = AuditStatus.CLOSED
    audit.save(update_fields=['status', 'update_time'])
    return audit


@transaction.atomic
def add_finding(audit_id, title, severity, clause='',
                corrective_requirement='', corrective_deadline=None):
    audit = get_audit(audit_id)
    if not audit:
        return None

    last_seq = AuditFinding.objects.filter(audit_id=audit_id).count()
    finding = AuditFinding.objects.create(
        audit=audit, sequence=last_seq + 1,
        title=title, severity=severity, clause=clause,
        corrective_requirement=corrective_requirement,
        corrective_deadline=corrective_deadline,
    )

    if severity in (FindingSeverity.CRITICAL, FindingSeverity.MAJOR):
        try:
            from ..models import Deviation, DeviationStatus, DeviationSeverity
            sev = DeviationSeverity.CRITICAL if severity == FindingSeverity.CRITICAL else DeviationSeverity.MAJOR
            dev = Deviation.objects.create(
                code=f'DEV-AUD-{finding.id}',
                title=f'审计发现: {title}',
                category='审计发现',
                severity=sev,
                status=DeviationStatus.IDENTIFIED,
                reporter=audit.auditor,
                reported_at=date.today(),
                project='',
                description=f'来源审计: {audit.code}\n条款: {clause}\n{corrective_requirement}',
                source='audit_finding',
                source_record_id=str(finding.id),
            )
            finding.deviation_id = dev.id
            finding.save(update_fields=['deviation_id'])
            logger.info(f'Auto-created deviation {dev.code} from audit finding {finding.id}')
        except Exception as e:
            logger.error(f'Failed to auto-create deviation from finding: {e}')

    return finding


def list_findings(audit_id):
    return list(AuditFinding.objects.filter(audit_id=audit_id).order_by('sequence'))


def generate_audit_report(audit_id):
    """生成审计报告的结构化数据"""
    audit = get_audit(audit_id)
    if not audit:
        return None

    findings = AuditFinding.objects.filter(audit_id=audit_id).order_by('sequence')
    by_severity = {}
    for f in findings:
        by_severity.setdefault(f.severity, []).append({
            'sequence': f.sequence, 'title': f.title,
            'clause': f.clause, 'status': f.status,
            'corrective_requirement': f.corrective_requirement,
        })

    return {
        'audit': {
            'code': audit.code, 'title': audit.title,
            'type': audit.audit_type, 'scope': audit.scope,
            'auditor': audit.auditor, 'auditor_org': audit.auditor_org,
            'planned_date': str(audit.planned_date),
            'actual_date': str(audit.actual_date) if audit.actual_date else '',
        },
        'summary': audit.summary,
        'findings_count': {
            'total': findings.count(),
            'critical': findings.filter(severity=FindingSeverity.CRITICAL).count(),
            'major': findings.filter(severity=FindingSeverity.MAJOR).count(),
            'minor': findings.filter(severity=FindingSeverity.MINOR).count(),
            'observation': findings.filter(severity=FindingSeverity.OBSERVATION).count(),
        },
        'findings_by_severity': by_severity,
    }
