"""
安全管理服务

不良事件上报、审批、随访、加急消息。
"""
import logging
from typing import Optional, List
from django.db import transaction

from .models import AdverseEvent, AEFollowUp, AEStatus

logger = logging.getLogger(__name__)


def create_adverse_event(
    enrollment_id: int,
    description: str,
    start_date,
    severity: str,
    relation: str,
    work_order_id: int = None,
    action_taken: str = '',
    outcome: str = 'unknown',
    is_sae: bool = False,
    reported_by_id: int = None,
    open_id: str = '',
) -> AdverseEvent:
    """
    上报不良事件

    1. 创建 AE 记录
    2. 发起飞书审批
    3. 若 SAE → 发送加急消息
    """
    ae = AdverseEvent.objects.create(
        enrollment_id=enrollment_id,
        work_order_id=work_order_id,
        description=description,
        start_date=start_date,
        severity=severity,
        relation=relation,
        action_taken=action_taken,
        outcome=outcome,
        is_sae=is_sae,
        status=AEStatus.REPORTED,
        reported_by_id=reported_by_id,
    )

    # 发起飞书审批
    if open_id:
        _create_feishu_approval(ae, open_id)

    # SAE 加急消息 + 自动创建偏差和变更请求
    if is_sae:
        _send_urgent_notification(ae)
        _notify_ethics_sae(ae)
        try:
            deviation_id = _create_deviation_for_sae(ae)
            if deviation_id:
                ae.deviation_id = deviation_id
        except Exception:
            logger.warning('SAE 自动创建偏差失败', exc_info=True)
        try:
            change_id = _create_change_request_for_sae(ae)
            if change_id:
                ae.change_request_id = change_id
        except Exception:
            logger.warning('SAE 自动创建变更请求失败', exc_info=True)
        if ae.deviation_id or ae.change_request_id:
            ae.save(update_fields=['deviation_id', 'change_request_id', 'update_time'])

    logger.info(f'AE 上报: ae_id={ae.id}, is_sae={is_sae}, severity={severity}')
    return ae


def get_adverse_event(ae_id: int) -> Optional[AdverseEvent]:
    return (
        AdverseEvent.objects.select_related('enrollment__subject', 'enrollment__protocol')
        .filter(id=ae_id)
        .first()
    )


def list_adverse_events(
    enrollment_id: int = None,
    status: str = None,
    is_sae: bool = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = AdverseEvent.objects.select_related('enrollment__subject', 'enrollment__protocol').all()
    if enrollment_id:
        qs = qs.filter(enrollment_id=enrollment_id)
    if status:
        qs = qs.filter(status=status)
    if is_sae is not None:
        qs = qs.filter(is_sae=is_sae)

    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total,
            'page': page, 'page_size': page_size}


def add_follow_up(
    ae_id: int,
    followup_date,
    current_status: str,
    outcome_update: str = '',
    severity_change: str = '',
    treatment_update: str = '',
    requires_further_followup: bool = True,
    next_followup_date=None,
    recorded_by_id: int = None,
    notes: str = '',
) -> Optional[AEFollowUp]:
    """添加 AE 随访记录"""
    ae = get_adverse_event(ae_id)
    if not ae:
        return None

    # 计算序号
    last_seq = AEFollowUp.objects.filter(adverse_event=ae).count()

    followup = AEFollowUp.objects.create(
        adverse_event=ae,
        sequence=last_seq + 1,
        followup_date=followup_date,
        current_status=current_status,
        outcome_update=outcome_update,
        severity_change=severity_change,
        treatment_update=treatment_update,
        requires_further_followup=requires_further_followup,
        next_followup_date=next_followup_date,
        recorded_by_id=recorded_by_id,
        notes=notes,
    )

    # 更新 AE 状态为随访中
    if ae.status == AEStatus.APPROVED:
        ae.status = AEStatus.FOLLOWING
        ae.save(update_fields=['status', 'update_time'])

    if not requires_further_followup and outcome_update:
        ae.status = AEStatus.CLOSED
        ae.outcome = outcome_update
        ae.save(update_fields=['status', 'outcome', 'update_time'])

    try:
        from libs.wechat_notification import notify_ae_followup
        subject = ae.enrollment.subject if ae.enrollment else None
        if subject:
            notify_ae_followup(subject, ae, followup)
    except Exception:
        logger.warning('微信 AE 随访通知发送失败', exc_info=True)

    return followup


def _create_feishu_approval(ae: AdverseEvent, open_id: str):
    """AE 上报飞书审批"""
    try:
        from libs.feishu_approval import create_ae_report_approval
        instance_code = create_ae_report_approval(
            open_id=open_id,
            subject_code=f'入组#{ae.enrollment_id}',
            event_description=ae.description[:200],
            severity=ae.get_severity_display(),
            occurrence_time=str(ae.start_date),
            treatment=ae.action_taken[:200],
        )
        if instance_code:
            ae.feishu_approval_instance_id = instance_code
            ae.status = AEStatus.UNDER_REVIEW
            ae.save(update_fields=['feishu_approval_instance_id', 'status', 'update_time'])
    except Exception as e:
        logger.error(f'AE#{ae.id} 飞书审批创建失败: {e}')


def _send_urgent_notification(ae: AdverseEvent):
    """SAE 加急消息通知"""
    try:
        from libs.notification import notify_adverse_event
        notify_adverse_event(ae)
    except Exception as e:
        logger.error(f'AE#{ae.id} 加急通知发送失败: {e}')


def _notify_ethics_sae(ae: AdverseEvent):
    """SAE 创建后通知伦理台"""
    try:
        from apps.ethics.services.notification_service import notify_ethics_sae
        protocol_id = ae.enrollment.protocol_id if hasattr(ae, 'enrollment') and ae.enrollment else None
        if protocol_id:
            notify_ethics_sae(
                protocol_id=protocol_id,
                ae_id=ae.id,
                severity=ae.severity,
            )
    except Exception as e:
        logger.error(f'AE#{ae.id} 伦理通知失败: {e}')


def _create_deviation_for_sae(ae: AdverseEvent) -> Optional[int]:
    """SAE 自动创建偏差记录"""
    try:
        from apps.quality.models import Deviation
        protocol_id = ae.enrollment.protocol_id if ae.enrollment else None
        dev = Deviation.objects.create(
            title=f'SAE 触发偏差 - AE#{ae.id}',
            deviation_type='safety',
            severity='major',
            description=f'严重不良事件(SAE)自动生成偏差。\n\n'
                        f'事件描述：{ae.description}\n'
                        f'严重程度：{ae.get_severity_display()}\n'
                        f'因果关系：{ae.get_relation_display()}',
            protocol_id=protocol_id,
            status='open',
            reported_by_id=ae.reported_by_id,
        )
        return dev.id
    except Exception as e:
        logger.warning(f'SAE 创建偏差失败: {e}')
        return None


def _create_change_request_for_sae(ae: AdverseEvent) -> Optional[int]:
    """SAE 自动创建变更请求（草稿状态）"""
    try:
        from apps.workflow.models import ChangeRequest
        protocol_id = ae.enrollment.protocol_id if ae.enrollment else None
        cr = ChangeRequest.objects.create(
            title=f'SAE 触发变更评估 - AE#{ae.id}',
            change_type='safety',
            priority='urgent',
            description=f'严重不良事件(SAE)自动触发。\n\n'
                        f'事件描述：{ae.description}\n'
                        f'严重程度：{ae.get_severity_display()}\n'
                        f'因果关系：{ae.get_relation_display()}\n'
                        f'处理措施：{ae.action_taken or "待评估"}',
            protocol_id=protocol_id,
            status='draft',
            initiated_by_id=ae.reported_by_id,
        )
        return cr.id
    except Exception as e:
        logger.warning(f'SAE 创建变更请求失败: {e}')
        return None
