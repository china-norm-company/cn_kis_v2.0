"""
合规检查服务

核心逻辑：
- 检查计划 → 执行 → 问题发现 → 关联偏差/CAPA → 验证关闭
"""
import logging
from typing import Optional
from django.db import transaction
from django.utils import timezone

from apps.ethics.models_compliance import (
    ComplianceCheck, ComplianceFinding,
    CheckStatus, FindingStatus,
)

logger = logging.getLogger(__name__)


def _generate_check_no() -> str:
    now = timezone.now()
    prefix = f'CC-{now.strftime("%Y%m%d")}'
    count = ComplianceCheck.objects.filter(check_no__startswith=prefix).count()
    return f'{prefix}-{count + 1:03d}'


def _generate_finding_no(check_no: str) -> str:
    count = ComplianceFinding.objects.filter(finding_no__startswith=check_no).count()
    return f'{check_no}-F{count + 1:02d}'


def create_compliance_check(
    check_type: str,
    scope: str,
    check_date=None,
    lead_auditor: str = '',
    team_members: list = None,
    protocol_id: int = None,
    notes: str = '',
    created_by_id: int = None,
) -> ComplianceCheck:
    return ComplianceCheck.objects.create(
        check_no=_generate_check_no(),
        check_type=check_type,
        scope=scope,
        check_date=check_date,
        lead_auditor=lead_auditor,
        team_members=team_members or [],
        protocol_id=protocol_id,
        notes=notes,
        created_by_id=created_by_id,
    )


def get_compliance_check(check_id: int) -> Optional[ComplianceCheck]:
    return ComplianceCheck.objects.filter(id=check_id).first()


def list_compliance_checks(
    check_type: str = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ComplianceCheck.objects.all()
    if check_type:
        qs = qs.filter(check_type=check_type)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


@transaction.atomic
def complete_check(check_id: int) -> Optional[ComplianceCheck]:
    """完成检查，自动更新发现统计"""
    check = get_compliance_check(check_id)
    if not check:
        return None
    check.status = CheckStatus.COMPLETED
    check.completed_date = timezone.now().date()
    check.save(update_fields=['status', 'completed_date', 'update_time'])
    check.update_finding_counts()
    return check


@transaction.atomic
def create_finding(
    check_id: int,
    severity: str,
    description: str,
    evidence: str = '',
    corrective_action: str = '',
    corrective_deadline=None,
    related_deviation_id: int = None,
    related_capa_id: int = None,
    created_by_id: int = None,
) -> Optional[ComplianceFinding]:
    check = get_compliance_check(check_id)
    if not check:
        return None

    finding = ComplianceFinding.objects.create(
        compliance_check=check,
        finding_no=_generate_finding_no(check.check_no),
        severity=severity,
        description=description,
        evidence=evidence,
        corrective_action=corrective_action,
        corrective_deadline=corrective_deadline,
        related_deviation_id=related_deviation_id,
        related_capa_id=related_capa_id,
        created_by_id=created_by_id,
    )

    check.update_finding_counts()
    return finding


def list_findings(check_id: int) -> list:
    return list(ComplianceFinding.objects.filter(compliance_check_id=check_id))


@transaction.atomic
def close_finding(finding_id: int, verified_by: str) -> Optional[ComplianceFinding]:
    """验证关闭发现"""
    try:
        finding = ComplianceFinding.objects.get(id=finding_id)
    except ComplianceFinding.DoesNotExist:
        return None

    finding.status = FindingStatus.VERIFIED
    finding.verified_by = verified_by
    finding.verified_at = timezone.now()
    finding.save(update_fields=['status', 'verified_by', 'verified_at', 'update_time'])

    finding.compliance_check.update_finding_counts()
    return finding
