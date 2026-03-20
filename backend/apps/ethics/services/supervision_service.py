"""
伦理监督服务

核心逻辑：
- 创建监督计划时自动读取 Protocol 信息
- 状态流转：planned → in_progress → completed
- 整改跟踪和验证
"""
import logging
from typing import Optional
from django.db import transaction
from django.utils import timezone

from apps.ethics.models_supervision import EthicsSupervision, SupervisionStatus

logger = logging.getLogger(__name__)


def _generate_supervision_no() -> str:
    now = timezone.now()
    prefix = f'SUP-{now.strftime("%Y%m%d")}'
    count = EthicsSupervision.objects.filter(
        supervision_no__startswith=prefix
    ).count()
    return f'{prefix}-{count + 1:03d}'


@transaction.atomic
def create_supervision(
    protocol_id: int,
    supervision_type: str,
    planned_date=None,
    scope: str = '',
    notes: str = '',
    supervisor_names: list = None,
    created_by_id: int = None,
) -> Optional[EthicsSupervision]:
    """创建监督计划，自动读取 Protocol 信息"""
    from apps.protocol.models import Protocol
    try:
        protocol = Protocol.objects.get(id=protocol_id)
    except Protocol.DoesNotExist:
        return None

    supervision = EthicsSupervision.objects.create(
        supervision_no=_generate_supervision_no(),
        protocol=protocol,
        supervision_type=supervision_type,
        planned_date=planned_date,
        scope=scope,
        notes=notes,
        supervisor_names=supervisor_names or [],
        feishu_chat_id=getattr(protocol, 'feishu_chat_id', '') or '',
        created_by_id=created_by_id,
    )

    logger.info(f'监督计划 {supervision.supervision_no} 已创建，关联项目 {protocol.title}')
    return supervision


def get_supervision(supervision_id: int) -> Optional[EthicsSupervision]:
    return EthicsSupervision.objects.select_related('protocol').filter(id=supervision_id).first()


def list_supervisions(
    protocol_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = EthicsSupervision.objects.select_related('protocol')
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


@transaction.atomic
def update_supervision_status(
    supervision_id: int,
    new_status: str,
    findings: str = '',
    corrective_actions: str = '',
    corrective_deadline=None,
    verification_notes: str = '',
) -> Optional[EthicsSupervision]:
    """更新监督状态"""
    supervision = get_supervision(supervision_id)
    if not supervision:
        return None

    supervision.status = new_status
    update_fields = ['status', 'update_time']

    if new_status == SupervisionStatus.IN_PROGRESS:
        supervision.actual_date = timezone.now().date()
        update_fields.append('actual_date')

    if new_status == SupervisionStatus.COMPLETED:
        supervision.completed_date = timezone.now().date()
        update_fields.append('completed_date')
        if findings:
            supervision.findings = findings
            update_fields.append('findings')
        if corrective_actions:
            supervision.corrective_actions = corrective_actions
            update_fields.append('corrective_actions')
        if corrective_deadline:
            supervision.corrective_deadline = corrective_deadline
            update_fields.append('corrective_deadline')

    if verification_notes:
        supervision.verification_notes = verification_notes
        supervision.corrective_completed = True
        update_fields.extend(['verification_notes', 'corrective_completed'])

    supervision.save(update_fields=update_fields)
    return supervision
