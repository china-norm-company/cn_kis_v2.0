"""
礼金计算与支付服务
"""
import logging
from decimal import Decimal
from typing import Optional
from django.utils import timezone

from ..models_execution import SubjectPayment, PaymentStatus

logger = logging.getLogger(__name__)


def _generate_payment_no() -> str:
    now = timezone.now()
    prefix = f'PAY-{now.strftime("%Y%m")}-'
    last = (
        SubjectPayment.objects.filter(payment_no__startswith=prefix)
        .order_by('-payment_no').values_list('payment_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:06d}'


def calculate_payment(
    payment_type: str,
    visit_count: int = 1,
    base_amount: Decimal = Decimal('200'),
    bonus_rate: Decimal = Decimal('0'),
) -> Decimal:
    """
    计算礼金金额

    默认：每次到访 200 元基准，可叠加完成奖励比例。
    """
    subtotal = base_amount * visit_count
    bonus = subtotal * bonus_rate
    return subtotal + bonus


def create_payment(
    subject_id: int,
    payment_type: str,
    amount: Decimal,
    enrollment_id: int = None,
    notes: str = '',
    account=None,
) -> SubjectPayment:
    """创建礼金支付记录"""
    return SubjectPayment.objects.create(
        subject_id=subject_id,
        enrollment_id=enrollment_id,
        payment_no=_generate_payment_no(),
        payment_type=payment_type,
        amount=amount,
        notes=notes,
        created_by_id=account.id if account else None,
    )


def initiate_payment(payment_id: int) -> Optional[SubjectPayment]:
    """发起支付"""
    payment = SubjectPayment.objects.filter(id=payment_id).first()
    if not payment or payment.status != PaymentStatus.PENDING:
        return None
    payment.status = PaymentStatus.INITIATED
    payment.initiated_at = timezone.now()
    payment.save(update_fields=['status', 'initiated_at', 'update_time'])
    return payment


def confirm_payment(payment_id: int, transaction_id: str = '', payment_method: str = '') -> Optional[SubjectPayment]:
    """确认支付完成"""
    payment = SubjectPayment.objects.filter(id=payment_id).first()
    if not payment:
        return None
    payment.status = PaymentStatus.PAID
    payment.paid_at = timezone.now()
    payment.transaction_id = transaction_id
    payment.payment_method = payment_method
    payment.save()

    try:
        from libs.wechat_notification import notify_payment_arrival
        subject = payment.subject
        notify_payment_arrival(subject, payment)
    except Exception:
        import logging
        logging.getLogger(__name__).warning('微信礼金到账通知发送失败', exc_info=True)

    return payment


def list_payments(subject_id: int = None, status: str = None) -> list:
    qs = SubjectPayment.objects.all()
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if status:
        qs = qs.filter(status=status)
    return list(qs.order_by('-create_time'))


def get_payment_summary() -> dict:
    """支付汇总统计"""
    from django.db.models import Sum, Count, Q
    qs = SubjectPayment.objects.all()
    total = qs.aggregate(
        total_count=Count('id'),
        total_amount=Sum('amount'),
        paid_count=Count('id', filter=Q(status=PaymentStatus.PAID)),
        paid_amount=Sum('amount', filter=Q(status=PaymentStatus.PAID)),
        pending_count=Count('id', filter=Q(status=PaymentStatus.PENDING)),
        pending_amount=Sum('amount', filter=Q(status=PaymentStatus.PENDING)),
        initiated_count=Count('id', filter=Q(status=PaymentStatus.INITIATED)),
        initiated_amount=Sum('amount', filter=Q(status=PaymentStatus.INITIATED)),
    )
    return {k: str(v) if isinstance(v, Decimal) else (v or 0) for k, v in total.items()}


def batch_create_payments(
    subject_ids: list,
    payment_type: str,
    amount: Decimal,
    notes: str = '',
    account=None,
) -> list:
    """批量创建支付记录"""
    created_ids = []
    for sid in subject_ids:
        p = create_payment(
            subject_id=sid,
            payment_type=payment_type,
            amount=amount,
            notes=notes,
            account=account,
        )
        created_ids.append(p.id)
    return created_ids
