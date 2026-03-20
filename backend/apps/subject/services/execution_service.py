"""
执行管理服务

包含：签到签出、预约管理、问卷管理。
"""
import logging
from typing import Optional
from django.utils import timezone
from datetime import datetime, timedelta, time

from ..models_execution import (
    SubjectCheckin, CheckinStatus,
    SubjectQuestionnaire, QuestionnaireStatus,
    SubjectAppointment, AppointmentStatus,
    SubjectSupportTicket, SupportTicketStatus,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 签到签出
# ============================================================================
def checkin(subject_id: int, enrollment_id: int = None, work_order_id: int = None,
            location: str = '', account=None) -> SubjectCheckin:
    """受试者签到"""
    now = timezone.now()
    return SubjectCheckin.objects.create(
        subject_id=subject_id,
        enrollment_id=enrollment_id,
        work_order_id=work_order_id,
        checkin_date=now.date(),
        checkin_time=now,
        location=location,
        status=CheckinStatus.CHECKED_IN,
        created_by_id=account.id if account else None,
    )


def checkout(checkin_id: int) -> Optional[SubjectCheckin]:
    """受试者签出"""
    record = SubjectCheckin.objects.filter(id=checkin_id).first()
    if not record:
        return None
    record.checkout_time = timezone.now()
    record.status = CheckinStatus.CHECKED_OUT
    record.save(update_fields=['checkout_time', 'status', 'update_time'])
    return record


def list_checkins(subject_id: int = None, enrollment_id: int = None,
                  date_from=None, date_to=None) -> list:
    qs = SubjectCheckin.objects.all()
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if enrollment_id:
        qs = qs.filter(enrollment_id=enrollment_id)
    if date_from:
        qs = qs.filter(checkin_date__gte=date_from)
    if date_to:
        qs = qs.filter(checkin_date__lte=date_to)
    return list(qs.order_by('-checkin_date'))


# ============================================================================
# 预约
# ============================================================================
def create_appointment(subject_id: int, appointment_date, appointment_time=None,
                       purpose: str = '', enrollment_id: int = None,
                       visit_point: str = '', project_code: str = '',
                       project_name: str = '', name_pinyin_initials: str = '',
                       liaison: str = '') -> SubjectAppointment:
    return SubjectAppointment.objects.create(
        subject_id=subject_id, enrollment_id=enrollment_id,
        appointment_date=appointment_date, appointment_time=appointment_time,
        purpose=purpose, visit_point=visit_point or '',
        project_code=(project_code or '').strip(),
        project_name=(project_name or '').strip(),
        name_pinyin_initials=(name_pinyin_initials or '').strip()[:50],
        liaison=(liaison or '').strip()[:100],
    )


def confirm_appointment(appointment_id: int, account=None) -> Optional[SubjectAppointment]:
    appt = SubjectAppointment.objects.filter(id=appointment_id).first()
    if not appt:
        return None
    appt.status = AppointmentStatus.CONFIRMED
    appt.confirmed_by_id = account.id if account else None
    appt.save(update_fields=['status', 'confirmed_by_id', 'update_time'])
    return appt


def cancel_appointment(appointment_id: int) -> Optional[SubjectAppointment]:
    appt = SubjectAppointment.objects.filter(id=appointment_id).first()
    if not appt:
        return None
    appt.status = AppointmentStatus.CANCELLED
    appt.save(update_fields=['status', 'update_time'])
    return appt


def list_appointments(subject_id: int) -> list:
    return list(SubjectAppointment.objects.filter(subject_id=subject_id).order_by('-appointment_date'))


def reschedule_appointment(
    appointment_id: int,
    new_date,
    new_time=None,
    account=None,
) -> Optional[SubjectAppointment]:
    """改期：更新预约日期与可选时间。"""
    appt = SubjectAppointment.objects.filter(id=appointment_id).first()
    if not appt:
        return None
    if appt.status == AppointmentStatus.CANCELLED:
        return None
    appt.appointment_date = new_date
    appt.appointment_time = new_time
    appt.save(update_fields=['appointment_date', 'appointment_time', 'update_time'])
    return appt


def mark_appointment_no_show(appointment_id: int, account=None) -> Optional[SubjectAppointment]:
    """标记预约为 No-show（缺席），用于接待台与补位逻辑。"""
    appt = SubjectAppointment.objects.filter(id=appointment_id).first()
    if not appt:
        return None
    appt.status = AppointmentStatus.NO_SHOW
    appt.save(update_fields=['status', 'update_time'])
    return appt


def suggest_time_slots(
    project_code: str = '',
    target_date=None,
    limit: int = 10,
    interval_minutes: int = 30,
) -> list:
    """
    智能时段推荐：返回当日可选时段，并按已有预约数排序（优先推荐较空闲时段，避峰）。
    """
    from datetime import time, datetime
    target_date = target_date or timezone.localdate()
    start = time(8, 0)
    end = time(17, 0)
    slots = []
    current = datetime.combine(target_date, start)
    end_dt = datetime.combine(target_date, end)
    while current < end_dt:
        t = current.time()
        t_end = (datetime.combine(target_date, t) + timedelta(minutes=interval_minutes)).time()
        qs = SubjectAppointment.objects.filter(
            appointment_date=target_date,
            appointment_time__isnull=False,
        ).exclude(status__in=(AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW))
        if project_code:
            qs = qs.filter(project_code=project_code)
        same_slot = qs.filter(
            appointment_time__gte=t,
            appointment_time__lt=t_end,
        ).count()
        slots.append({
            'time': t.strftime('%H:%M'),
            'existing_count': same_slot,
            'recommended': same_slot < 3,
        })
        current += timedelta(minutes=interval_minutes)
    slots.sort(key=lambda x: (x['existing_count'], x['time']))
    return slots[:limit]


def list_no_show_slots_for_fill(
    target_date=None,
    project_code: Optional[str] = None,
) -> list:
    """当日 No-show 的预约列表，用于补位展示与填充。"""
    target_date = target_date or timezone.localdate()
    qs = SubjectAppointment.objects.filter(
        appointment_date=target_date,
        status=AppointmentStatus.NO_SHOW,
    ).select_related('subject', 'enrollment')
    if project_code:
        qs = qs.filter(project_code=project_code)
    return [
        {
            'appointment_id': a.id,
            'subject_id': a.subject_id,
            'subject_name': a.subject.name if a.subject else '',
            'appointment_time': a.appointment_time.strftime('%H:%M') if a.appointment_time else '',
            'visit_point': a.visit_point or '',
            'project_code': a.project_code or '',
        }
        for a in qs.order_by('appointment_time')
    ]


def fill_no_show_slot(
    appointment_id: int,
    fill_with_subject_id: Optional[int] = None,
    account=None,
) -> Optional[SubjectAppointment]:
    """
    No-show 补位：将原 No-show 预约改为已取消，释放时段；若提供 fill_with_subject_id 则为该受试者创建新预约占用该时段。
    """
    from django.db import transaction
    appt = SubjectAppointment.objects.filter(id=appointment_id).first()
    if not appt or appt.status != AppointmentStatus.NO_SHOW:
        return None
    with transaction.atomic():
        appt.status = AppointmentStatus.CANCELLED
        appt.save(update_fields=['status', 'update_time'])
        if fill_with_subject_id:
            from apps.subject.models import Subject
            if Subject.objects.filter(id=fill_with_subject_id).exists():
                new_appt = SubjectAppointment.objects.create(
                    subject_id=fill_with_subject_id,
                    enrollment_id=appt.enrollment_id,
                    appointment_date=appt.appointment_date,
                    appointment_time=appt.appointment_time,
                    purpose=appt.purpose or '补位',
                    visit_point=appt.visit_point or '',
                    project_code=appt.project_code or '',
                    project_name=appt.project_name or '',
                    status=AppointmentStatus.PENDING,
                )
                return new_appt
        return None


# ============================================================================
# 问卷
# ============================================================================
def assign_questionnaire(subject_id: int, title: str, questionnaire_type: str,
                         form_definition: dict = None, enrollment_id: int = None,
                         due_date=None) -> SubjectQuestionnaire:
    return SubjectQuestionnaire.objects.create(
        subject_id=subject_id, enrollment_id=enrollment_id,
        questionnaire_type=questionnaire_type, title=title,
        form_definition=form_definition, assigned_at=timezone.now(),
        due_date=due_date,
    )


def submit_questionnaire(questionnaire_id: int, answers: dict, score=None) -> Optional[SubjectQuestionnaire]:
    q = SubjectQuestionnaire.objects.filter(id=questionnaire_id).first()
    if not q:
        return None
    q.answers = answers
    q.score = score
    q.status = QuestionnaireStatus.SUBMITTED
    q.submitted_at = timezone.now()
    q.save()
    return q


def list_questionnaires(subject_id: int, status: str = None) -> list:
    qs = SubjectQuestionnaire.objects.filter(subject_id=subject_id)
    if status:
        qs = qs.filter(status=status)
    return list(qs.order_by('-create_time'))


# ============================================================================
# 客服工单
# ============================================================================
def _generate_ticket_no() -> str:
    now = timezone.now()
    prefix = f'TKT-{now.strftime("%Y%m")}-'
    last = (
        SubjectSupportTicket.objects.filter(ticket_no__startswith=prefix)
        .order_by('-ticket_no').values_list('ticket_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:06d}'


def create_support_ticket(subject_id: int, title: str, content: str,
                          category: str = 'question') -> SubjectSupportTicket:
    now = timezone.now()
    priority = 'normal'
    if category in ('complaint', 'payment'):
        priority = 'high'
    sla_hours = 24 if priority == 'high' else 48
    return SubjectSupportTicket.objects.create(
        subject_id=subject_id, ticket_no=_generate_ticket_no(),
        category=category, title=title, content=content,
        priority=priority,
        sla_due_at=now + timedelta(hours=sla_hours),
    )


def reply_support_ticket(ticket_id: int, reply: str, account=None) -> Optional[SubjectSupportTicket]:
    ticket = SubjectSupportTicket.objects.filter(id=ticket_id).first()
    if not ticket:
        return None
    ticket.reply = reply
    now = timezone.now()
    ticket.replied_at = now
    if not ticket.first_response_at:
        ticket.first_response_at = now
    ticket.replied_by_id = account.id if account else None
    ticket.status = SupportTicketStatus.REPLIED
    ticket.save()
    return ticket


def assign_support_ticket(ticket_id: int, assigned_to_id: int, account=None) -> Optional[SubjectSupportTicket]:
    ticket = SubjectSupportTicket.objects.filter(id=ticket_id).first()
    if not ticket:
        return None
    ticket.assigned_to_id = assigned_to_id
    if ticket.status == SupportTicketStatus.OPEN:
        ticket.status = SupportTicketStatus.IN_PROGRESS
    ticket.save(update_fields=['assigned_to_id', 'status', 'update_time'])
    return ticket


def close_support_ticket(ticket_id: int, account=None) -> Optional[SubjectSupportTicket]:
    ticket = SubjectSupportTicket.objects.filter(id=ticket_id).first()
    if not ticket:
        return None
    ticket.status = SupportTicketStatus.CLOSED
    ticket.closed_at = timezone.now()
    ticket.save(update_fields=['status', 'closed_at', 'update_time'])
    return ticket


def list_support_tickets(subject_id: int = None, status: str = None) -> list:
    qs = SubjectSupportTicket.objects.all()
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if status:
        qs = qs.filter(status=status)
    return list(qs.order_by('-create_time'))


def calc_ticket_sla(ticket: SubjectSupportTicket) -> dict:
    now = timezone.now()
    due_at = ticket.sla_due_at
    is_overdue = bool(due_at and now > due_at and ticket.status != SupportTicketStatus.CLOSED)
    remaining_minutes = None
    if due_at:
        remaining_minutes = int((due_at - now).total_seconds() / 60)
    first_response_minutes = None
    if ticket.first_response_at:
        first_response_minutes = int((ticket.first_response_at - ticket.create_time).total_seconds() / 60)
    return {
        'due_at': due_at.isoformat() if due_at else None,
        'remaining_minutes': remaining_minutes,
        'is_overdue': is_overdue,
        'first_response_minutes': first_response_minutes,
    }
