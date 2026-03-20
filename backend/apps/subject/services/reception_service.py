"""
前台接待聚合服务

提供今日受试者队列、统计、快速签到签出、待处理提醒等聚合查询。
前台面板作为执行台子界面，数据来源于 scheduling、subject、workorder 等模块。
"""
from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Optional
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Count
from django.db.models import Avg, F

from ..models import Subject, Enrollment
from ..models_execution import (
    SubjectCheckin, CheckinStatus,
    SubjectAppointment, AppointmentStatus,
)

logger = logging.getLogger(__name__)


def _name_pinyin_initials(name: str) -> str:
    """受试者姓名中每一个字的首字母：李雯雯→LWW，吕玥→LY。中文用拼音首字母，英文字母保留，数字保留。"""
    if not (name or '').strip():
        return ''
    s = name.strip()
    result = []
    try:
        from pypinyin import lazy_pinyin, Style
        for char in s:
            if not char:
                continue
            if '\u4e00' <= char <= '\u9fff':
                py = lazy_pinyin(char, style=Style.FIRST_LETTER)
                if py:
                    result.append(py[0].upper())
            elif 'A' <= char <= 'Z' or 'a' <= char <= 'z':
                result.append(char.upper())
            elif '0' <= char <= '9':
                result.append(char)
    except Exception:
        try:
            from pypinyin import lazy_pinyin, Style
            py_list = lazy_pinyin(s, style=Style.FIRST_LETTER)
            return ''.join(py_list).upper() if py_list else (s[0].upper() if s else '')
        except Exception:
            return (s[0] or '').upper() if s else ''
    return ''.join(result)


def _queue_status_rank(status: str) -> int:
    ranks = {
        'waiting': 0,
        'pending': 0,
        'no_show': 1,
        'checked_in': 2,
        'in_progress': 3,
        'checked_out': 4,
    }
    return ranks.get((status or '').strip().lower(), 0)


def _queue_dedupe_key(item: dict, target_date: date) -> str:
    phone = str(item.get('_subject_phone') or '').strip()
    subject_id = item.get('subject_id')
    subject_no = str(item.get('subject_no') or '').strip()
    project_code = str(item.get('project_code') or '').strip().lower()
    identity = phone or (f'id:{subject_id}' if subject_id is not None else subject_no)
    return f'{identity}|{project_code}|{target_date.isoformat()}'


def _merge_duplicate_queue_items(queue: list[dict], target_date: date) -> list[dict]:
    deduped: dict[str, dict] = {}
    for item in queue:
        key = _queue_dedupe_key(item, target_date)
        current = deduped.get(key)
        if current is None:
            deduped[key] = item.copy()
            continue

        current_time = str(current.get('appointment_time') or '')
        item_time = str(item.get('appointment_time') or '')
        current_rank = _queue_status_rank(str(current.get('status') or ''))
        item_rank = _queue_status_rank(str(item.get('status') or ''))

        if item_rank > current_rank or (item_rank == current_rank and item_time and (not current_time or item_time < current_time)):
            preferred = item.copy()
            fallback = current
        else:
            preferred = current.copy()
            fallback = item

        merged = preferred
        if current_time and item_time:
            merged['appointment_time'] = min(current_time, item_time)
        else:
            merged['appointment_time'] = current_time or item_time

        for field in ('subject_name', 'subject_no', 'visit_point', 'project_name', 'project_code', 'purpose'):
            if not merged.get(field) and fallback.get(field):
                merged[field] = fallback[field]
        if not merged.get('appointment_id') and fallback.get('appointment_id'):
            merged['appointment_id'] = fallback['appointment_id']
        deduped[key] = merged

    items = list(deduped.values())
    for item in items:
        item.pop('_subject_phone', None)
    return items


def get_today_queue(
    target_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 10,
    project_code: Optional[str] = None,
) -> dict:
    """
    今日受试者队列：聚合预约 + 签到状态，按时间排序。
    支持分页（每页默认10条）、按项目编号筛选。
    """
    today = target_date or timezone.localdate()

    appointments_qs = SubjectAppointment.objects.filter(
        appointment_date=today,
    ).exclude(
        status=AppointmentStatus.CANCELLED,
    ).select_related('subject', 'enrollment', 'enrollment__protocol').order_by('appointment_time')

    if project_code:
        appointments_qs = appointments_qs.filter(project_code=project_code)

    appointments = appointments_qs

    checkins_today = {
        c.subject_id: c for c in
        SubjectCheckin.objects.filter(checkin_date=today).select_related('subject')
    }

    queue = []
    for appt in appointments:
        checkin = checkins_today.get(appt.subject_id)
        task_type = _determine_task_type(appt)
        status = _determine_queue_status(appt, checkin)

        project_name = getattr(appt, 'project_name', '') or ''
        project_code_val = getattr(appt, 'project_code', '') or ''
        if not project_name and appt.enrollment_id and appt.enrollment and hasattr(appt.enrollment, 'protocol') and appt.enrollment.protocol:
            p = appt.enrollment.protocol
            project_name = p.title or ''
            project_code_val = (p.code or '').strip()
        subj = appt.subject
        queue.append({
            'appointment_id': appt.id,
            'subject_id': appt.subject_id,
            'subject_name': subj.name if subj else '',
            'subject_no': subj.subject_no if subj else '',
            '_subject_phone': getattr(subj, 'phone', '') or '' if subj else '',
            'sc_number': '',  # 待按项目统一赋值为 SC001, SC002...
            'gender': getattr(subj, 'gender', '') or '' if subj else '',
            'age': getattr(subj, 'age', None) if subj else None,
            'appointment_time': appt.appointment_time.strftime('%H:%M') if appt.appointment_time else '',
            'purpose': appt.purpose,
            'visit_point': getattr(appt, 'visit_point', '') or '',
            'project_name': project_name,
            'project_code': project_code_val,
            'task_type': task_type,
            'status': status,
            'checkin_id': checkin.id if checkin else None,
            'checkin_time': checkin.checkin_time.isoformat() if checkin and checkin.checkin_time else None,
            'checkout_time': checkin.checkout_time.isoformat() if checkin and checkin.checkout_time else None,
            'enrollment_id': appt.enrollment_id,
        })

    unscheduled_checkins = SubjectCheckin.objects.none()
    if not project_code:
        unscheduled_checkins = SubjectCheckin.objects.filter(
            checkin_date=today,
        ).exclude(
            subject_id__in=[a.subject_id for a in appointments],
        ).select_related('subject')

    for checkin in unscheduled_checkins:
        project_name = ''
        project_code_val = ''
        if checkin.enrollment_id:
            enr = Enrollment.objects.select_related('protocol').filter(id=checkin.enrollment_id).first()
            if enr and enr.protocol:
                p = enr.protocol
                project_name = p.title or ''
                project_code_val = (p.code or '').strip()
        subj = checkin.subject
        queue.append({
            'appointment_id': None,
            'subject_id': checkin.subject_id,
            'subject_name': subj.name if subj else '',
            'subject_no': subj.subject_no if subj else '',
            '_subject_phone': getattr(subj, 'phone', '') or '' if subj else '',
            'sc_number': '',
            'gender': getattr(subj, 'gender', '') or '' if subj else '',
            'age': getattr(subj, 'age', None) if subj else None,
            'appointment_time': '',
            'purpose': '临时到访',
            'visit_point': '',
            'project_name': project_name,
            'project_code': project_code_val,
            'task_type': 'walk_in',
            'status': checkin.status,
            'checkin_id': checkin.id,
            'checkin_time': checkin.checkin_time.isoformat() if checkin.checkin_time else None,
            'checkout_time': checkin.checkout_time.isoformat() if checkin.checkout_time else None,
            'enrollment_id': checkin.enrollment_id,
        })

    queue = _merge_duplicate_queue_items(queue, today)

    for item in queue:
        item['name_pinyin_initials'] = _name_pinyin_initials(item.get('subject_name') or '')

    # SC号：仅对已签到（有 checkin_id）的按项目内签到顺序赋 SC001, SC002...；未签到不产生 SC 号
    from collections import defaultdict
    by_project = defaultdict(list)
    for item in queue:
        pc = (item.get('project_code') or '').strip() or '_'
        by_project[pc].append(item)
    for pc, items in by_project.items():
        signed_in = [i for i in items if i.get('checkin_id') is not None]
        signed_in.sort(key=lambda x: (x.get('checkin_time') or '', x.get('subject_id') or 0))
        seen_sid = set()
        sid_to_sc = {}
        for r, i in enumerate(signed_in, start=1):
            sid = i.get('subject_id')
            if sid is not None and sid not in seen_sid:
                seen_sid.add(sid)
                sid_to_sc[sid] = f'SC{r:03d}'
        for item in items:
            if item.get('checkin_id') is not None:
                item['sc_number'] = sid_to_sc.get(item.get('subject_id'), '') or (item.get('subject_no') or '')
            else:
                item['sc_number'] = ''

    if project_code and str(project_code).strip():
        pc_lower = str(project_code).strip().lower()
        queue = [i for i in queue if (i.get('project_code') or '').strip().lower() == pc_lower]
    total = len(queue)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = queue[start:end]
    return {
        'items': page_items,
        'date': str(today),
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def get_today_queue_export(
    target_date: Optional[date] = None,
    project_code: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    """
    今日队列导出数据：按日期/项目/状态筛选，含项目名称、项目编号、SC号、性别、年龄等，不含手机号。
    返回完整列表（不分页）供前端生成 CSV。
    """
    full = get_today_queue(target_date=target_date, page=1, page_size=99999, project_code=project_code)
    items = full.get('items', [])
    if status and str(status).strip().lower() not in ('', 'all'):
        status_lower = str(status).strip().lower()
        items = [i for i in items if (i.get('status') or '').lower() == status_lower]
    return {'items': items, 'date': full.get('date', ''), 'total': len(items)}


def get_appointment_calendar(target_month: Optional[str] = None) -> dict:
    """按月返回每天的预约数，供接待台月历展示。"""
    today = timezone.localdate()
    year = today.year
    month = today.month

    if target_month:
        try:
            year_str, month_str = str(target_month).strip().split('-', 1)
            parsed_year = int(year_str)
            parsed_month = int(month_str)
            if 1 <= parsed_month <= 12:
                year = parsed_year
                month = parsed_month
        except (TypeError, ValueError):
            pass

    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    appointments = SubjectAppointment.objects.filter(
        appointment_date__gte=first_day,
        appointment_date__lte=last_day,
    ).exclude(
        status=AppointmentStatus.CANCELLED,
    ).select_related('subject')

    counts_by_day: dict[str, int] = {}
    dedupe_keys = set()
    for appt_date, subject_id, phone, project_code in appointments.values_list(
        'appointment_date', 'subject_id', 'subject__phone', 'project_code',
    ):
        identity = (phone or '').strip() or f'id:{subject_id}'
        dedupe_key = (
            appt_date.isoformat(),
            identity,
            (project_code or '').strip().lower(),
        )
        if dedupe_key in dedupe_keys:
            continue
        dedupe_keys.add(dedupe_key)
        day_key = appt_date.isoformat()
        counts_by_day[day_key] = counts_by_day.get(day_key, 0) + 1

    items = []
    for day in range(1, monthrange(year, month)[1] + 1):
        day_date = date(year, month, day).isoformat()
        items.append({
            'date': day_date,
            'total': counts_by_day.get(day_date, 0),
        })

    return {
        'month': f'{year:04d}-{month:02d}',
        'items': items,
    }


def get_today_stats(target_date: Optional[date] = None, project_code: Optional[str] = None) -> dict:
    """今日统计：预约数/已签到/执行中/已签出/缺席。支持按 project_code 过滤。"""
    today = target_date or timezone.localdate()

    appt_qs = SubjectAppointment.objects.filter(
        appointment_date=today,
    ).exclude(status=AppointmentStatus.CANCELLED)
    if project_code:
        appt_qs = appt_qs.filter(project_code=project_code)
    dedupe_keys = set()
    for subject_id, phone, appt_project_code in appt_qs.select_related('subject').values_list('subject_id', 'subject__phone', 'project_code'):
        identity = (phone or '').strip() or f'id:{subject_id}'
        dedupe_keys.add((identity, (appt_project_code or '').strip().lower(), today.isoformat()))
    total_appointments = len(dedupe_keys)

    checkins = SubjectCheckin.objects.filter(checkin_date=today)
    if project_code:
        # 通过预约反查当日该项目的 subject_ids
        project_subject_ids = list(appt_qs.values_list('subject_id', flat=True))
        checkins = checkins.filter(subject_id__in=project_subject_ids)

    checkin_stats = checkins.aggregate(
        checked_in=Count('id', filter=Q(status=CheckinStatus.CHECKED_IN)),
        in_progress=Count('id', filter=Q(status=CheckinStatus.IN_PROGRESS)),
        checked_out=Count('id', filter=Q(status=CheckinStatus.CHECKED_OUT)),
        no_show=Count('id', filter=Q(status=CheckinStatus.NO_SHOW)),
    )
    # 执行中 = 已签到未签出
    execution_count = (checkin_stats['checked_in'] or 0) + (checkin_stats['in_progress'] or 0)

    # 曾签到过的总人数（签出不减）
    signed_in_count = (
        (checkin_stats['checked_in'] or 0)
        + (checkin_stats['in_progress'] or 0)
        + (checkin_stats['checked_out'] or 0)
    )

    # 临时到访人数（无预约当日签到）
    all_appt_subject_ids = list(
        SubjectAppointment.objects.filter(appointment_date=today)
        .exclude(status=AppointmentStatus.CANCELLED)
        .values_list('subject_id', flat=True)
    )
    walk_in_count = SubjectCheckin.objects.filter(
        checkin_date=today,
    ).exclude(subject_id__in=all_appt_subject_ids).count()

    return {
        'date': str(today),
        'total_appointments': total_appointments,
        'checked_in': checkin_stats['checked_in'],
        'in_progress': execution_count,  # 前端“执行中”展示为未签出人数
        'checked_out': checkin_stats['checked_out'],
        'no_show': checkin_stats['no_show'],
        'total_signed_in': checkins.count(),
        'signed_in_count': signed_in_count,
        'walk_in_count': walk_in_count,
    }


@transaction.atomic
def quick_checkin(
    subject_id: int,
    method: str = 'manual',
    location: str = '',
    operator_id: Optional[int] = None,
) -> dict:
    """
    快速签到：创建 SubjectCheckin 记录 + 触发通知。
    method: manual / qrcode
    """
    today = timezone.localdate()
    existing = SubjectCheckin.objects.filter(
        subject_id=subject_id, checkin_date=today,
    ).exclude(status=CheckinStatus.CHECKED_OUT).first()
    if existing:
        return _checkin_to_dict(existing)

    subject = Subject.objects.get(id=subject_id)
    checkin = SubjectCheckin.objects.create(
        subject=subject,
        checkin_date=today,
        checkin_time=timezone.now(),
        status=CheckinStatus.CHECKED_IN,
        location=location,
        notes=f'签到方式: {method}',
        created_by_id=operator_id,
    )

    appt = SubjectAppointment.objects.filter(
        subject_id=subject_id, appointment_date=today,
        status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
    ).first()
    if appt:
        appt.status = AppointmentStatus.COMPLETED
        appt.save(update_fields=['status', 'update_time'])

    try:
        from .recruitment_notify import notify_subject_checkin
        notify_subject_checkin(subject, checkin)
    except Exception:
        logger.warning('签到通知发送失败', exc_info=True)

    logger.info('快速签到: subject=%s method=%s', subject.subject_no, method)
    return _checkin_to_dict(checkin)


@transaction.atomic
def quick_checkout(checkin_id: int) -> dict:
    """
    快速签出：核验工单完成状态后签出。
    返回中包含 warnings 字段提示未完成的工单。
    """
    checkin = SubjectCheckin.objects.select_related('subject').get(id=checkin_id)
    if checkin.status == CheckinStatus.CHECKED_OUT:
        return {**_checkin_to_dict(checkin), 'warnings': []}
    if checkin.status == CheckinStatus.NO_SHOW:
        raise ValueError('缺席记录不允许签出')

    warnings = []
    try:
        from apps.workorder.models import WorkOrder
        pending_orders = WorkOrder.objects.filter(
            enrollment__subject_id=checkin.subject_id,
            status__in=['assigned', 'in_progress'],
        )
        for wo in pending_orders:
            warnings.append(f'工单 {wo.work_order_no} 状态为 {wo.get_status_display()}，尚未完成')
    except Exception:
        logger.warning('签出时工单状态检查失败', exc_info=True)

    checkin.checkout_time = timezone.now()
    checkin.status = CheckinStatus.CHECKED_OUT
    checkin.save(update_fields=['checkout_time', 'status', 'update_time'])

    logger.info('快速签出: checkin=%s subject=%s', checkin_id, checkin.subject.subject_no)
    return {**_checkin_to_dict(checkin), 'warnings': warnings}


def get_pending_alerts(target_date: Optional[date] = None) -> dict:
    """待处理提醒：超时/缺席/ICF待签署"""
    today = target_date or timezone.localdate()
    now = timezone.now()
    alerts = []

    overdue_appointments = SubjectAppointment.objects.filter(
        appointment_date=today,
        status=AppointmentStatus.CONFIRMED,
    ).select_related('subject')

    for appt in overdue_appointments:
        if appt.appointment_time:
            scheduled = datetime.combine(today, appt.appointment_time)
            scheduled = timezone.make_aware(scheduled) if timezone.is_naive(scheduled) else scheduled
            if now > scheduled + timedelta(minutes=15):
                if not SubjectCheckin.objects.filter(
                    subject_id=appt.subject_id, checkin_date=today,
                ).exists():
                    alerts.append({
                        'type': 'no_show',
                        'level': 'warning',
                        'subject_name': appt.subject.name,
                        'subject_no': appt.subject.subject_no,
                        'message': f'{appt.subject.name} 预约 {appt.appointment_time.strftime("%H:%M")} 未到场',
                        'appointment_id': appt.id,
                    })

    long_checkins = SubjectCheckin.objects.filter(
        checkin_date=today,
        status__in=[CheckinStatus.CHECKED_IN, CheckinStatus.IN_PROGRESS],
    ).select_related('subject')

    for checkin in long_checkins:
        if checkin.checkin_time and now > checkin.checkin_time + timedelta(hours=3):
            alerts.append({
                'type': 'overtime',
                'level': 'info',
                'subject_name': checkin.subject.name,
                'subject_no': checkin.subject.subject_no,
                'message': f'{checkin.subject.name} 签到超过 3 小时，请确认是否需要签出',
                'checkin_id': checkin.id,
            })

    return {'items': alerts, 'total': len(alerts)}


def mark_no_show(appointment_id: int) -> dict:
    """手工标记预约缺席，写入签到轨迹便于后续分析。"""
    appt = SubjectAppointment.objects.select_related('subject').get(id=appointment_id)
    appt.status = AppointmentStatus.NO_SHOW
    appt.save(update_fields=['status', 'update_time'])
    checkin, _ = SubjectCheckin.objects.get_or_create(
        subject_id=appt.subject_id,
        checkin_date=appt.appointment_date,
        defaults={
            'status': CheckinStatus.NO_SHOW,
            'notes': f'预约缺席自动标记，预约ID={appt.id}',
            'enrollment_id': appt.enrollment_id,
        },
    )
    if checkin.status != CheckinStatus.NO_SHOW:
        checkin.status = CheckinStatus.NO_SHOW
        checkin.notes = (checkin.notes or '') + f'\n预约缺席自动标记，预约ID={appt.id}'
        checkin.save(update_fields=['status', 'notes', 'update_time'])
    return {
        'appointment_id': appt.id,
        'subject_id': appt.subject_id,
        'subject_name': appt.subject.name if appt.subject else '',
        'status': CheckinStatus.NO_SHOW,
    }


def register_walk_in(
    name: str,
    phone: str,
    gender: str = '',
    purpose: str = '临时到访',
    auto_checkin: bool = True,
    operator_id: Optional[int] = None,
) -> dict:
    """
    无预约临时到访补登：
    1. 按手机号查找 Subject，若不存在则自动创建
    2. 创建当日预约（purpose 标记 walk-in/临时到访，task_type 推导为 walk_in）
    3. auto_checkin=True 时立即签到
    """
    from ..models import Subject
    from ..services.subject_service import generate_subject_no
    from ..models import AuthLevel

    phone = (phone or '').strip()
    today = timezone.localdate()

    subject = Subject.objects.filter(phone=phone, is_deleted=False).first()
    is_new_subject = False
    if not subject:
        subject = Subject.objects.create(
            subject_no=generate_subject_no(),
            name=name or '临时受试者',
            phone=phone,
            gender=gender or '',
            auth_level=AuthLevel.GUEST,
        )
        is_new_subject = True
    else:
        if not subject.name or subject.name == '受试者':
            subject.name = name or subject.name
        if gender:
            subject.gender = gender
        subject.save(update_fields=['name', 'gender', 'update_time'])

    # 创建当日临时到访预约（避免重复）
    appt, appt_created = SubjectAppointment.objects.get_or_create(
        subject=subject,
        appointment_date=today,
        purpose=purpose,
        defaults={
            'status': AppointmentStatus.CONFIRMED,
            'notes': '接待台临时到访补登',
        },
    )
    if not appt_created and appt.status == AppointmentStatus.CANCELLED:
        appt.status = AppointmentStatus.CONFIRMED
        appt.save(update_fields=['status', 'update_time'])

    checkin_result = None
    if auto_checkin:
        checkin_result = quick_checkin(
            subject_id=subject.id,
            method='manual',
            location='接待台补登',
            operator_id=operator_id,
        )

    return {
        'subject_id': subject.id,
        'subject_no': subject.subject_no,
        'subject_name': subject.name,
        'phone_masked': subject.phone[:3] + '****' + subject.phone[-4:] if subject.phone and len(subject.phone) >= 8 else subject.phone or '',
        'appointment_id': appt.id,
        'is_new_subject': is_new_subject,
        'checkin': checkin_result,
    }


def generate_flowcard(checkin_id: int) -> dict:
    """生成流程卡数据（用于打印/预览）。"""
    checkin = SubjectCheckin.objects.select_related('subject', 'enrollment').get(id=checkin_id)
    from apps.workorder.models import WorkOrder
    workorders = list(
        WorkOrder.objects.filter(
            enrollment_id=checkin.enrollment_id,
            is_deleted=False,
            status__in=['pending', 'assigned', 'in_progress', 'completed'],
        ).order_by('scheduled_date', 'id')
    )
    steps = []
    for idx, wo in enumerate(workorders, start=1):
        step_status = 'pending'
        if wo.status == 'completed':
            step_status = 'done'
        elif wo.status == 'in_progress':
            step_status = 'doing'
        steps.append({
            'sequence': idx,
            'workorder_id': wo.id,
            'workorder_no': getattr(wo, 'work_order_no', '') or f'WO-{wo.id}',
            'title': wo.title,
            'status': step_status,
            'scheduled_date': str(wo.scheduled_date) if wo.scheduled_date else None,
            'visit_node_id': wo.visit_node_id,
            'visit_activity_id': wo.visit_activity_id,
        })
    estimate_minutes = max(15, len(steps) * 18) if steps else 15
    return {
        'checkin_id': checkin.id,
        'subject_id': checkin.subject_id,
        'subject_no': checkin.subject.subject_no if checkin.subject else '',
        'subject_name': checkin.subject.name if checkin.subject else '',
        'checkin_time': checkin.checkin_time.isoformat() if checkin.checkin_time else None,
        'enrollment_id': checkin.enrollment_id,
        'steps': steps,
        'estimate_minutes': estimate_minutes,
        'message': '流程卡已生成',
    }


def get_flowcard_progress(checkin_id: int) -> dict:
    """流程卡进度摘要。"""
    flowcard = generate_flowcard(checkin_id)
    steps = flowcard['steps']
    total = len(steps)
    done = len([s for s in steps if s['status'] == 'done'])
    doing = len([s for s in steps if s['status'] == 'doing'])
    pending = total - done - doing
    current_step = next((s for s in steps if s['status'] == 'doing'), None)
    return {
        'checkin_id': checkin_id,
        'total_steps': total,
        'done_steps': done,
        'doing_steps': doing,
        'pending_steps': pending,
        'progress_percent': round((done / total) * 100, 1) if total else 0,
        'current_step': current_step,
        'steps': steps,
    }


def get_analytics(target_date: Optional[date] = None, days: int = 7) -> dict:
    """接待分析指标聚合。"""
    today = target_date or timezone.localdate()
    start = today - timedelta(days=max(days - 1, 0))

    appointments = SubjectAppointment.objects.filter(
        appointment_date__gte=start,
        appointment_date__lte=today,
    ).exclude(status=AppointmentStatus.CANCELLED)

    checkins = SubjectCheckin.objects.filter(checkin_date__gte=start, checkin_date__lte=today)
    total_appt = appointments.count()
    checked_in_count = checkins.exclude(status=CheckinStatus.NO_SHOW).count()
    no_show_count = checkins.filter(status=CheckinStatus.NO_SHOW).count()
    checkout_count = checkins.filter(status=CheckinStatus.CHECKED_OUT).count()

    completed = checkins.filter(
        status=CheckinStatus.CHECKED_OUT,
        checkin_time__isnull=False,
        checkout_time__isnull=False,
    ).annotate(duration=F('checkout_time') - F('checkin_time'))
    avg_duration = completed.aggregate(avg=Avg('duration'))['avg']
    avg_wait_minutes = round(avg_duration.total_seconds() / 60, 1) if avg_duration else 0

    trend = []
    cursor = start
    while cursor <= today:
        day_checkins = SubjectCheckin.objects.filter(checkin_date=cursor)
        day_appt = SubjectAppointment.objects.filter(appointment_date=cursor).exclude(status=AppointmentStatus.CANCELLED)
        day_total = day_appt.count()
        day_checked_out = day_checkins.filter(status=CheckinStatus.CHECKED_OUT).count()
        day_no_show = day_checkins.filter(status=CheckinStatus.NO_SHOW).count()
        trend.append({
            'date': str(cursor),
            'appointments': day_total,
            'checked_out': day_checked_out,
            'no_show': day_no_show,
            'completion_rate': round((day_checked_out / day_total) * 100, 1) if day_total else 0,
        })
        cursor += timedelta(days=1)

    return {
        'window': {'from': str(start), 'to': str(today)},
        'metrics': {
            'total_appointments': total_appt,
            'sign_in_rate': round((checked_in_count / total_appt) * 100, 1) if total_appt else 0,
            'no_show_rate': round((no_show_count / total_appt) * 100, 1) if total_appt else 0,
            'avg_wait_minutes': avg_wait_minutes,
            'process_completion_rate': round((checkout_count / total_appt) * 100, 1) if total_appt else 0,
            'ticket_closure_rate': _ticket_closure_rate(start, today),
        },
        'trend': trend,
    }


def _ticket_closure_rate(start: date, end: date) -> float:
    from ..models_execution import SubjectSupportTicket
    total = SubjectSupportTicket.objects.filter(create_time__date__gte=start, create_time__date__lte=end).count()
    if total == 0:
        return 0.0
    closed = SubjectSupportTicket.objects.filter(
        create_time__date__gte=start,
        create_time__date__lte=end,
        status='closed',
    ).count()
    return round((closed / total) * 100, 1)


def get_insights(target_date: Optional[date] = None, days: int = 7) -> dict:
    """规则型洞察输出（建议级）。"""
    analytics = get_analytics(target_date=target_date, days=days)
    metrics = analytics['metrics']
    hints = []
    if metrics['no_show_rate'] >= 15:
        hints.append('缺席率偏高，建议在预约前 24 小时与 2 小时双提醒，并补充候补名单策略。')
    if metrics['avg_wait_minutes'] >= 45:
        hints.append('平均等待时间较长，建议增加签到分流与高峰时段弹性排班。')
    if metrics['ticket_closure_rate'] < 80:
        hints.append('答疑工单闭环率低于目标，建议按优先级设置 24/48 小时SLA并执行逾期提醒。')
    if not hints:
        hints.append('当前指标整体平稳，建议继续保持并观察异常个案。')
    return {'generated_at': timezone.now().isoformat(), 'insights': hints, 'metrics': metrics}


def sync_cross_workstation(
    enrollment_id: int,
    reception_status: str,
    recruitment_status: Optional[str] = None,
    workorder_status: Optional[str] = None,
    quality_event_id: Optional[int] = None,
) -> dict:
    """接待态同步到招募/执行/质量，并写通知记录。"""
    from ..models import Enrollment
    from apps.workorder.models import WorkOrder
    from apps.notification.services import send_notification

    enrollment = Enrollment.objects.filter(id=enrollment_id).first()
    if not enrollment:
        raise ValueError('入组记录不存在')

    changes = {'reception_status': reception_status}
    if recruitment_status:
        enrollment.status = recruitment_status
        enrollment.save(update_fields=['status', 'update_time'])
        changes['recruitment_status'] = recruitment_status

    if workorder_status:
        updated = WorkOrder.objects.filter(enrollment_id=enrollment_id, is_deleted=False).update(status=workorder_status)
        changes['workorder_status'] = workorder_status
        changes['workorder_updated'] = updated

    if quality_event_id:
        changes['quality_event_id'] = quality_event_id

    if enrollment.subject and enrollment.subject.account_id:
        try:
            send_notification(
                recipient_id=enrollment.subject.account_id,
                title='接待流程状态已更新',
                content=f'当前状态：{reception_status}',
                source_type='reception_sync',
                source_id=enrollment_id,
            )
        except Exception:
            logger.warning('跨台同步通知发送失败', exc_info=True)

    return {'enrollment_id': enrollment_id, 'changes': changes}


def _determine_task_type(appt: SubjectAppointment) -> str:
    """根据预约信息判断任务类型（purpose + visit_point）"""
    purpose = (appt.purpose or '').lower()
    visit_point = (getattr(appt, 'visit_point', '') or '').lower()
    combined = f'{purpose} {visit_point}'
    if '粗筛' in combined or 'pre_screening' in combined:
        return 'pre_screening'
    if '筛选' in combined or 'v0' in combined:
        return 'screening'
    if '加访' in combined or '补检' in combined:
        return 'extra_visit'
    return 'visit'


def _determine_queue_status(appt: SubjectAppointment, checkin: Optional[SubjectCheckin]) -> str:
    """根据预约和签到信息确定队列状态"""
    if checkin:
        return checkin.status
    if appt.status == AppointmentStatus.NO_SHOW:
        return 'no_show'
    return 'waiting'


def scan_checkin_or_checkout(subject_id: int, qr_content: str = '') -> dict:
    """
    统一签到/签出接口：根据受试者当日状态智能判断执行签到或签出。
    返回格式：{ 'action': 'checkin'|'checkout'|'already_checked_out', ... }
    """
    from .checkin_qrcode_service import validate_daily_checkin_qrcode
    if qr_content:
        valid, err = validate_daily_checkin_qrcode(qr_content)
        if not valid:
            raise ValueError(err)

    today = timezone.localdate()
    existing = SubjectCheckin.objects.filter(
        subject_id=subject_id, checkin_date=today,
    ).select_related('subject').first()

    if not existing:
        result = quick_checkin(subject_id, method='qr_scan', location='', operator_id=None)
        # 供小程序签到成功展示：项目名称、访视点
        appt = SubjectAppointment.objects.filter(
            subject_id=subject_id, appointment_date=today,
        ).exclude(status=AppointmentStatus.CANCELLED).order_by('appointment_time').first()
        if appt:
            result['project_name'] = getattr(appt, 'project_name', '') or ''
            result['visit_point'] = getattr(appt, 'visit_point', '') or ''
        else:
            result['project_name'] = ''
            result['visit_point'] = ''
        return {'action': 'checkin', **result}

    if existing.status == CheckinStatus.CHECKED_OUT:
        return {
            'action': 'already_checked_out',
            'id': existing.id,
            'subject_id': existing.subject_id,
            'subject_name': existing.subject.name if existing.subject else '',
            'subject_no': existing.subject.subject_no if existing.subject else '',
            'checkin_date': str(existing.checkin_date),
            'checkin_time': existing.checkin_time.isoformat() if existing.checkin_time else None,
            'checkout_time': existing.checkout_time.isoformat() if existing.checkout_time else None,
            'status': existing.status,
        }

    result = quick_checkout(existing.id)
    return {'action': 'checkout', **result}


def _checkin_to_dict(checkin: SubjectCheckin) -> dict:
    return {
        'id': checkin.id,
        'subject_id': checkin.subject_id,
        'subject_name': checkin.subject.name if checkin.subject else '',
        'subject_no': checkin.subject.subject_no if checkin.subject else '',
        'checkin_date': str(checkin.checkin_date),
        'checkin_time': checkin.checkin_time.isoformat() if checkin.checkin_time else None,
        'checkout_time': checkin.checkout_time.isoformat() if checkin.checkout_time else None,
        'status': checkin.status,
        'location': checkin.location,
        'notes': checkin.notes,
    }
