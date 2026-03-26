"""
伦理台仪表盘服务
"""
from django.utils import timezone
from django.db.models import Q

from apps.ethics.models import (
    EthicsApplication, ApprovalDocument, EthicsApplicationStatus,
)
from apps.ethics.models_review import EthicsReviewOpinion
from apps.ethics.models_supervision import EthicsSupervision
from apps.ethics.models_compliance import ComplianceFinding, FindingStatus


def get_dashboard_stats() -> dict:
    today = timezone.now().date()
    thirty_days = today + timezone.timedelta(days=30)

    application_count = EthicsApplication.objects.count()
    pending_count = EthicsApplication.objects.filter(
        status__in=[
            EthicsApplicationStatus.SUBMITTED,
            EthicsApplicationStatus.REVIEWING,
        ]
    ).count()

    valid_approval_count = ApprovalDocument.objects.filter(
        is_active=True,
    ).filter(
        Q(expiry_date__isnull=True) | Q(expiry_date__gte=today)
    ).count()

    expiring_count = ApprovalDocument.objects.filter(
        is_active=True,
        expiry_date__isnull=False,
        expiry_date__lte=thirty_days,
        expiry_date__gte=today,
    ).count()

    pending_response_count = EthicsReviewOpinion.objects.filter(
        response_required=True,
        response_received=False,
    ).count()

    supervision_count = EthicsSupervision.objects.filter(
        status__in=['planned', 'in_progress'],
    ).count()

    compliance_finding_count = ComplianceFinding.objects.filter(
        status__in=[FindingStatus.OPEN, FindingStatus.IN_PROGRESS],
    ).count()

    todo_items = _build_todo_items(today, thirty_days)

    return {
        'application_count': application_count,
        'pending_count': pending_count,
        'valid_approval_count': valid_approval_count,
        'expiring_count': expiring_count,
        'pending_response_count': pending_response_count,
        'supervision_count': supervision_count,
        'compliance_finding_count': compliance_finding_count,
        'todo_items': todo_items,
    }


def _build_todo_items(today, thirty_days) -> list:
    """汇总近期待办：过期批件、待回复意见、待整改监督"""
    items = []

    expiring_docs = ApprovalDocument.objects.filter(
        is_active=True, expiry_date__isnull=False,
        expiry_date__lte=thirty_days, expiry_date__gte=today,
    ).select_related('application')[:5]
    for doc in expiring_docs:
        remaining = (doc.expiry_date - today).days
        items.append({
            'type': 'expiring_approval',
            'title': f'批件 {doc.document_number} 将在 {remaining} 天后到期',
            'urgency': 'high' if remaining <= 7 else ('medium' if remaining <= 15 else 'low'),
            'link': '/ethics/approvals',
        })

    pending_opinions = EthicsReviewOpinion.objects.filter(
        response_required=True, response_received=False,
    ).select_related('application')[:5]
    for op in pending_opinions:
        overdue = op.response_deadline and op.response_deadline < today
        items.append({
            'type': 'pending_response',
            'title': f'审查意见 {op.opinion_no} 待回复' + (' (已逾期)' if overdue else ''),
            'urgency': 'high' if overdue else 'medium',
            'link': f'/ethics/review-opinions/{op.id}',
        })

    active_sups = EthicsSupervision.objects.filter(
        status='in_progress',
        corrective_completed=False,
        corrective_deadline__isnull=False,
    ).select_related('protocol')[:5]
    for sup in active_sups:
        overdue = sup.corrective_deadline < today
        items.append({
            'type': 'pending_corrective',
            'title': f'监督 {sup.supervision_no} 整改待完成' + (' (已逾期)' if overdue else ''),
            'urgency': 'high' if overdue else 'medium',
            'link': '/ethics/supervisions',
        })

    items.sort(key=lambda x: {'high': 0, 'medium': 1, 'low': 2}.get(x['urgency'], 3))
    return items
