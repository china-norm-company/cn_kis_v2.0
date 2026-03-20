"""
实名核验服务：会话完成时回写 Subject 状态
"""
from django.utils import timezone
from django.db import transaction

from ..models import Subject, AuthLevel, IdentityVerifyStatus
from ..models_identity import IdentityVerifySession


@transaction.atomic
def complete_verify(
    verify_id: str,
    status: str,
    id_card_encrypted: str = '',
    reject_reason: str = '',
    extra_data=None,
):
    """
    核验完成时调用（由第三方回调或轮询结果更新后调用）。
    status: verified | rejected | expired
    """
    session = IdentityVerifySession.objects.select_for_update().filter(verify_id=verify_id).first()
    if not session:
        return None
    if session.status != IdentityVerifyStatus.PENDING:
        return session
    now = timezone.now()
    session.status = status
    session.completed_at = now
    session.reject_reason = reject_reason or ''
    if id_card_encrypted:
        session.id_card_encrypted = id_card_encrypted
    if extra_data:
        session.extra_data = extra_data
    session.save(update_fields=['status', 'completed_at', 'reject_reason', 'id_card_encrypted', 'extra_data', 'update_time'])

    subject = Subject.objects.select_for_update().get(id=session.subject_id)
    subject.identity_verify_status = status
    if status == IdentityVerifyStatus.VERIFIED:
        subject.identity_verified_at = now
        subject.auth_level = AuthLevel.IDENTITY_VERIFIED
        if id_card_encrypted:
            subject.id_card_encrypted = id_card_encrypted
    subject.save(update_fields=['identity_verify_status', 'identity_verified_at', 'auth_level', 'id_card_encrypted', 'update_time'])
    try:
        from apps.audit.models import AuditLog, AuditAction
        AuditLog.objects.create(
            account_id=subject.account_id or 0,
            account_name=subject.name or subject.subject_no or 'subject',
            account_type='subject',
            action=AuditAction.UPDATE,
            description='实名认证状态更新',
            resource_type='identity_verify_session',
            resource_id=str(session.verify_id),
            resource_name='身份认证',
            new_value={
                'status': status,
                'subject_id': subject.id,
                'identity_verified_at': subject.identity_verified_at.isoformat() if subject.identity_verified_at else None,
                'extra_data': session.extra_data or {},
            },
            changed_fields=['status', 'identity_verified_at', 'auth_level', 'identity_verify_status'],
        )
    except Exception:
        pass
    return session
