"""
变更控制服务

管理变更申请的全生命周期：
draft → submitted → reviewing → approved → implementing → verified → closed
"""
import logging

from ..models_change import ChangeRequest, ChangeStatus

logger = logging.getLogger(__name__)

CHANGE_TRANSITIONS = {
    ChangeStatus.DRAFT: [ChangeStatus.SUBMITTED],
    ChangeStatus.SUBMITTED: [ChangeStatus.REVIEWING],
    ChangeStatus.REVIEWING: [ChangeStatus.APPROVED, ChangeStatus.REJECTED],
    ChangeStatus.APPROVED: [ChangeStatus.IMPLEMENTING],
    ChangeStatus.REJECTED: [ChangeStatus.DRAFT],
    ChangeStatus.IMPLEMENTING: [ChangeStatus.VERIFIED],
    ChangeStatus.VERIFIED: [ChangeStatus.CLOSED],
}


def list_change_requests(change_type=None, status=None, risk_level=None,
                         page=1, page_size=20, **kwargs):
    qs = ChangeRequest.objects.filter(is_deleted=False)
    if change_type:
        qs = qs.filter(change_type=change_type)
    if status:
        qs = qs.filter(status=status)
    if risk_level:
        qs = qs.filter(risk_level=risk_level)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_change_request(cr_id):
    try:
        return ChangeRequest.objects.get(id=cr_id, is_deleted=False)
    except ChangeRequest.DoesNotExist:
        return None


def create_change_request(code, title, change_type, description, risk_level,
                          applicant, applicant_id=None, impact_assessment=''):
    return ChangeRequest.objects.create(
        code=code, title=title, change_type=change_type,
        description=description, risk_level=risk_level,
        applicant=applicant, applicant_id=applicant_id,
        impact_assessment=impact_assessment,
    )


def advance_status(cr_id, new_status):
    cr = get_change_request(cr_id)
    if not cr:
        return None
    allowed = CHANGE_TRANSITIONS.get(cr.status, [])
    if new_status not in allowed:
        return None
    cr.status = new_status
    cr.save(update_fields=['status', 'update_time'])
    return cr


def submit_change_request(cr_id):
    cr = advance_status(cr_id, ChangeStatus.SUBMITTED)
    if not cr:
        return None

    try:
        from libs.feishu_approval import create_change_request_approval
        instance_id = create_change_request_approval(
            code=cr.code, title=cr.title,
            change_type=cr.get_change_type_display(),
            risk_level=cr.get_risk_level_display(),
            description=cr.description,
            impact_assessment=cr.impact_assessment,
            applicant=cr.applicant,
        )
        if instance_id:
            cr.feishu_approval_instance_id = instance_id
            cr.save(update_fields=['feishu_approval_instance_id'])
            cr = advance_status(cr.id, ChangeStatus.REVIEWING)
    except Exception as e:
        logger.warning(f'Failed to create Feishu approval for CR {cr.code}: {e}')

    return cr


def approve_change_request(cr_id, reviewer='', reviewer_id=None):
    cr = get_change_request(cr_id)
    if not cr:
        return None
    cr.reviewer = reviewer
    cr.reviewer_id = reviewer_id
    cr.save(update_fields=['reviewer', 'reviewer_id', 'update_time'])
    return advance_status(cr_id, ChangeStatus.APPROVED)


def reject_change_request(cr_id, reviewer='', reviewer_id=None):
    cr = get_change_request(cr_id)
    if not cr:
        return None
    cr.reviewer = reviewer
    cr.reviewer_id = reviewer_id
    cr.save(update_fields=['reviewer', 'reviewer_id', 'update_time'])
    return advance_status(cr_id, ChangeStatus.REJECTED)


def start_implementation(cr_id, implementation_plan=''):
    cr = get_change_request(cr_id)
    if not cr:
        return None
    if implementation_plan:
        cr.implementation_plan = implementation_plan
        cr.save(update_fields=['implementation_plan', 'update_time'])
    return advance_status(cr_id, ChangeStatus.IMPLEMENTING)


def verify_change(cr_id, verification_note=''):
    cr = get_change_request(cr_id)
    if not cr:
        return None
    if verification_note:
        cr.verification_note = verification_note
        cr.save(update_fields=['verification_note', 'update_time'])
    return advance_status(cr_id, ChangeStatus.VERIFIED)


def close_change(cr_id):
    return advance_status(cr_id, ChangeStatus.CLOSED)


def get_change_stats():
    from django.db.models import Count
    qs = ChangeRequest.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'total': qs.count(),
    }
