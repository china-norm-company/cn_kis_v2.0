"""
收付款计划服务

FIN004：回款计划、到账记录、逾期跟踪
"""
import logging
from typing import Optional
from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.db.models import Sum

from apps.finance.models import (
    PaymentPlan, PaymentPlanStatus, PaymentRecord,
    PaymentRecordStatus, OverdueFollowup, CashFlowRecord, CashFlowType,
    CashFlowCategory,
)

logger = logging.getLogger(__name__)


def create_payment_plan(
    plan_no: str, protocol_id: int, planned_date, planned_amount: Decimal,
    project_name: str = '', contract_id: int = None,
    client_id: int = None, client_name: str = '',
    milestone: str = '', responsible_id: int = None, responsible_name: str = '',
    invoice_id: int = None, created_by_id: int = None, notes: str = '',
) -> PaymentPlan:
    return PaymentPlan.objects.create(
        plan_no=plan_no, protocol_id=protocol_id,
        project_name=project_name, contract_id=contract_id,
        client_id=client_id, client_name=client_name,
        planned_date=planned_date, planned_amount=planned_amount,
        remaining_amount=planned_amount, milestone=milestone,
        responsible_id=responsible_id, responsible_name=responsible_name,
        invoice_id=invoice_id, created_by_id=created_by_id, notes=notes,
    )


def record_payment(
    record_no: str, plan_id: int, payment_date, amount: Decimal,
    payment_method: str = 'bank_transfer',
    bank_name: str = '', bank_account: str = '', bank_serial: str = '',
    invoice_id: int = None, created_by_id: int = None, notes: str = '',
) -> Optional[PaymentRecord]:
    """记录实际回款"""
    plan = PaymentPlan.objects.filter(id=plan_id).first()
    if not plan:
        return None

    record = PaymentRecord.objects.create(
        record_no=record_no, payment_plan=plan,
        protocol_id=plan.protocol_id, project_name=plan.project_name,
        client_id=plan.client_id, client_name=plan.client_name,
        payment_date=payment_date, amount=amount,
        payment_method=payment_method,
        bank_name=bank_name, bank_account=bank_account, bank_serial=bank_serial,
        invoice_id=invoice_id, created_by_id=created_by_id, notes=notes,
    )

    # 更新计划
    plan.received_amount += amount
    plan.remaining_amount = plan.planned_amount - plan.received_amount
    if plan.remaining_amount <= 0:
        plan.status = PaymentPlanStatus.COMPLETED
    else:
        plan.status = PaymentPlanStatus.PARTIAL
    plan.save(update_fields=['received_amount', 'remaining_amount', 'status', 'update_time'])

    # 记录现金流入
    CashFlowRecord.objects.create(
        record_date=payment_date, flow_type=CashFlowType.INFLOW,
        category=CashFlowCategory.OPERATING, amount=amount,
        protocol_id=plan.protocol_id, project_name=plan.project_name,
        description=f'回款: {plan.plan_no}', reference_no=record_no,
        reference_type='payment_record',
    )

    return record


def confirm_payment_record(record_id: int, confirmed_by_id: int = None) -> Optional[PaymentRecord]:
    record = PaymentRecord.objects.filter(id=record_id, status=PaymentRecordStatus.PENDING).first()
    if not record:
        return None
    record.status = PaymentRecordStatus.CONFIRMED
    record.confirmed_by_id = confirmed_by_id
    record.confirmed_at = timezone.now()
    record.save(update_fields=['status', 'confirmed_by_id', 'confirmed_at', 'update_time'])
    return record


def add_followup(
    plan_id: int, followup_date, followup_type: str,
    content: str, result: str,
    contact_person: str = '', promise_date=None, promise_amount: Decimal = None,
    next_followup_date=None, next_followup_plan: str = '',
    followed_by_id: int = None,
) -> Optional[OverdueFollowup]:
    plan = PaymentPlan.objects.filter(id=plan_id).first()
    if not plan:
        return None
    followup = OverdueFollowup.objects.create(
        payment_plan=plan, followup_date=followup_date,
        followup_type=followup_type, contact_person=contact_person,
        content=content, result=result,
        promise_date=promise_date, promise_amount=promise_amount,
        next_followup_date=next_followup_date, next_followup_plan=next_followup_plan,
        followed_by_id=followed_by_id,
    )
    plan.last_followup_date = followup_date
    plan.save(update_fields=['last_followup_date', 'update_time'])
    return followup


def detect_overdue_plans() -> list:
    """检测逾期计划并更新状态，发送飞书通知"""
    today = date.today()
    overdue_plans = PaymentPlan.objects.filter(
        status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL],
        planned_date__lt=today,
    )
    updated = []
    for plan in overdue_plans:
        plan.status = PaymentPlanStatus.OVERDUE
        plan.overdue_days = (today - plan.planned_date).days
        plan.save(update_fields=['status', 'overdue_days', 'update_time'])
        updated.append(plan)

        # 发送逾期通知
        _notify_overdue(plan)

    logger.info(f'逾期检测完成: {len(updated)} 条计划标记为逾期')
    return updated


def _notify_overdue(plan: PaymentPlan):
    """发送逾期通知"""
    try:
        if plan.responsible_id:
            from apps.notification.services import send_notification
            send_notification(
                recipient_id=plan.responsible_id,
                title=f'回款逾期提醒: {plan.plan_no}',
                content=f'客户: {plan.client_name}\n计划金额: ¥{plan.planned_amount}\n逾期: {plan.overdue_days}天',
                priority='high',
                source_type='payment_overdue',
                source_id=plan.id,
            )
    except Exception as e:
        logger.error(f'逾期通知失败: {e}')
