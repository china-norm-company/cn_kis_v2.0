"""
伦理管理服务

创建伦理申请 → 提交飞书审批 → 审批通过 → 上传批件
AC-4: 访视计划生成时检查有效伦理批件
"""
import logging
from typing import Optional
from django.db import transaction
from django.utils import timezone

from apps.ethics.models import (
    EthicsCommittee, EthicsApplication, ApprovalDocument,
    EthicsApplicationStatus,
)

logger = logging.getLogger(__name__)


def create_application(
    protocol_id: int,
    committee_id: int,
    application_number: str,
    version: str = 'v1.0',
    remarks: str = '',
    created_by_id: int = None,
) -> EthicsApplication:
    return EthicsApplication.objects.create(
        protocol_id=protocol_id,
        committee_id=committee_id,
        application_number=application_number,
        version=version,
        remarks=remarks,
        status=EthicsApplicationStatus.DRAFT,
        created_by_id=created_by_id,
    )


def get_application(app_id: int) -> Optional[EthicsApplication]:
    return EthicsApplication.objects.filter(id=app_id).first()


def list_applications(protocol_id: int = None, status: str = None,
                      page: int = 1, page_size: int = 20) -> dict:
    qs = EthicsApplication.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


@transaction.atomic
def submit_application(app_id: int, open_id: str = '') -> Optional[EthicsApplication]:
    """提交伦理申请 → 飞书审批"""
    app = get_application(app_id)
    if not app or app.status != EthicsApplicationStatus.DRAFT:
        return None

    app.status = EthicsApplicationStatus.SUBMITTED
    app.submission_date = timezone.now().date()
    app.save(update_fields=['status', 'submission_date', 'update_time'])

    if open_id:
        _create_feishu_approval(app, open_id)

    return app


@transaction.atomic
def approve_application(app_id: int) -> Optional[EthicsApplication]:
    """审批通过"""
    app = get_application(app_id)
    if not app or app.status not in (
        EthicsApplicationStatus.SUBMITTED, EthicsApplicationStatus.REVIEWING
    ):
        return None

    app.status = EthicsApplicationStatus.APPROVED
    app.save(update_fields=['status', 'update_time'])
    return app


@transaction.atomic
def reject_application(app_id: int, reason: str = '') -> Optional[EthicsApplication]:
    """审批驳回"""
    app = get_application(app_id)
    if not app or app.status not in (
        EthicsApplicationStatus.SUBMITTED, EthicsApplicationStatus.REVIEWING
    ):
        return None

    app.status = EthicsApplicationStatus.REJECTED
    app.save(update_fields=['status', 'update_time'])
    logger.info(f'伦理申请#{app_id} 已驳回: {reason}')
    return app


@transaction.atomic
def withdraw_application(app_id: int) -> Optional[EthicsApplication]:
    """撤回伦理申请"""
    app = get_application(app_id)
    if not app or app.status not in (
        EthicsApplicationStatus.SUBMITTED, EthicsApplicationStatus.REVIEWING
    ):
        return None

    app.status = EthicsApplicationStatus.WITHDRAWN
    app.save(update_fields=['status', 'update_time'])
    logger.info(f'伦理申请#{app_id} 已撤回')
    return app


@transaction.atomic
def upload_approval_document(
    app_id: int,
    document_number: str,
    approved_date,
    expiry_date=None,
    file_url: str = '',
    file_path: str = '',
) -> Optional[ApprovalDocument]:
    """上传伦理批件"""
    app = get_application(app_id)
    if not app or app.status != EthicsApplicationStatus.APPROVED:
        return None

    doc, _ = ApprovalDocument.objects.update_or_create(
        application=app,
        defaults={
            'document_number': document_number,
            'approved_date': approved_date,
            'expiry_date': expiry_date,
            'file_url': file_url,
            'file_path': file_path,
            'is_active': True,
        },
    )
    return doc


def check_valid_ethics(protocol_id: int) -> dict:
    """
    检查协议是否有有效伦理批件（AC-4）

    返回：
    - has_valid: 是否有有效批件
    - warning: 警告信息（无有效批件时）
    """
    from django.utils.timezone import now
    today = now().date()

    approved_apps = EthicsApplication.objects.filter(
        protocol_id=protocol_id,
        status=EthicsApplicationStatus.APPROVED,
    )
    for app in approved_apps:
        try:
            doc = app.approval_document
            if doc.is_active:
                if doc.expiry_date is None or doc.expiry_date >= today:
                    return {'has_valid': True, 'warning': ''}
        except ApprovalDocument.DoesNotExist:
            pass

    return {
        'has_valid': False,
        'warning': f'协议#{protocol_id} 无有效伦理批件，请先完成伦理审批后再生成访视计划。',
    }


def _create_feishu_approval(app: EthicsApplication, open_id: str):
    """伦理审批 → 飞书审批"""
    try:
        from libs.feishu_approval import create_ethics_approval
        instance_code = create_ethics_approval(
            open_id=open_id,
            protocol_title=str(app.protocol),
            committee_name=app.committee.name,
            application_number=app.application_number,
        )
        if instance_code:
            app.feishu_approval_instance_id = instance_code
            app.status = EthicsApplicationStatus.REVIEWING
            app.save(update_fields=['feishu_approval_instance_id', 'status', 'update_time'])
    except Exception as e:
        logger.error(f'伦理申请#{app.id} 飞书审批创建失败: {e}')
