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
    SubjectProjectSC,
    ReceptionBoardCheckin,
    ReceptionBoardProjectSc,
)

logger = logging.getLogger(__name__)


def _local_today() -> date:
    """
    当前「本地」日历日。

    在 USE_TZ=True 时，timezone.now() 应为 aware；若环境异常得到 naive，
    再调用 timezone.localdate() 会触发
    ValueError: localtime() cannot be applied to a naive datetime。
    此处对 naive+USE_TZ 退化为 date.today()，其余走 localtime。
    """
    from django.conf import settings

    now = timezone.now()
    if timezone.is_naive(now):
        if getattr(settings, 'USE_TZ', True):
            return date.today()
        return now.date()
    return timezone.localtime(now).date()


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

        if item_rank > current_rank:
            preferred = item.copy()
            fallback = current
        elif item_rank < current_rank:
            preferred = current.copy()
            fallback = item
        elif item_time and (not current_time or item_time < current_time):
            preferred = item.copy()
            fallback = current
        elif current_time and (not item_time or current_time < item_time):
            preferred = current.copy()
            fallback = item
        else:
            # 状态、时间相同：优先展示最新导入（appointment_id 越大越新）
            item_id = item.get('appointment_id') or 0
            current_id = current.get('appointment_id') or 0
            if item_id >= current_id:
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

        for field in ('subject_name', 'subject_no', 'visit_point', 'project_name', 'project_code', 'purpose', 'name_pinyin_initials', 'liaison', 'notes', 'phone', 'sc_number', 'rd_number', 'enrollment_status'):
            if not merged.get(field) and fallback.get(field):
                merged[field] = fallback[field]
        if not merged.get('appointment_id') and fallback.get('appointment_id'):
            merged['appointment_id'] = fallback['appointment_id']
        deduped[key] = merged

    items = list(deduped.values())
    for item in items:
        item.pop('_subject_phone', None)
    return items


def _determine_board_queue_status(appt: SubjectAppointment, board_rec: Optional[ReceptionBoardCheckin]) -> str:
    """接待看板队列状态：根据 ReceptionBoardCheckin 的 checkout_time 推断。"""
    if board_rec:
        if board_rec.checkout_time:
            return 'checked_out'
        return 'checked_in'
    if appt.status == AppointmentStatus.NO_SHOW:
        return 'no_show'
    return 'waiting'


def get_today_queue(
    target_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 10,
    project_code: Optional[str] = None,
    source: str = 'execution',
) -> dict:
    """
    今日受试者队列：聚合预约 + 签到状态；排序为项目编号升序，同项目内先排有 SC 号的记录再排无 SC 的，再按 SC 号升序。
    支持分页（每页默认10条）、按项目编号筛选。
    source: execution=工单执行（SubjectCheckin+SubjectProjectSC），board=接待看板（ReceptionBoardCheckin+ReceptionBoardProjectSc）
    两套数据完全独立，SC/RD号、签到签出时间互不影响。
    """
    today = target_date or _local_today()
    use_board = (source or 'execution').strip().lower() == 'board'

    appointments_qs = SubjectAppointment.objects.filter(
        appointment_date=today,
    ).exclude(
        status=AppointmentStatus.CANCELLED,
    ).select_related('subject', 'enrollment', 'enrollment__protocol').order_by('appointment_time')

    if project_code:
        appointments_qs = appointments_qs.filter(project_code=project_code)

    appointments = list(appointments_qs)

    if use_board:
        board_checkins_today = {
            c.subject_id: c for c in
            ReceptionBoardCheckin.objects.filter(checkin_date=today).select_related('subject')
        }
    else:
        checkins_today = {
            c.subject_id: c for c in
            SubjectCheckin.objects.filter(checkin_date=today).select_related('subject')
        }

    queue = []
    for appt in appointments:
        if use_board:
            board_rec = board_checkins_today.get(appt.subject_id)
            task_type = _determine_task_type(appt)
            status = _determine_board_queue_status(appt, board_rec)
            checkin_id = board_rec.id if board_rec else None
            checkin_time = board_rec.checkin_time.isoformat() if board_rec and board_rec.checkin_time else None
            checkout_time = board_rec.checkout_time.isoformat() if board_rec and board_rec.checkout_time else None
        else:
            checkin = checkins_today.get(appt.subject_id)
            task_type = _determine_task_type(appt)
            status = _determine_queue_status(appt, checkin)
            checkin_id = checkin.id if checkin else None
            checkin_time = checkin.checkin_time.isoformat() if checkin and checkin.checkin_time else None
            checkout_time = checkin.checkout_time.isoformat() if checkin and checkin.checkout_time else None

        project_name = getattr(appt, 'project_name', '') or ''
        project_code_val = getattr(appt, 'project_code', '') or ''
        if not project_name and appt.enrollment_id and appt.enrollment and hasattr(appt.enrollment, 'protocol') and appt.enrollment.protocol:
            p = appt.enrollment.protocol
            project_name = p.title or ''
            project_code_val = (p.code or '').strip()
        subj = appt.subject
        _phone = getattr(subj, 'phone', '') or '' if subj else ''
        queue.append({
            'appointment_id': appt.id,
            'subject_id': appt.subject_id,
            'subject_name': subj.name if subj else '',
            'subject_no': subj.subject_no if subj else '',
            '_subject_phone': _phone,
            'phone': _phone,
            'name_pinyin_initials': (getattr(appt, 'name_pinyin_initials', '') or '').strip(),
            'liaison': (getattr(appt, 'liaison', '') or '').strip(),
            'notes': (getattr(appt, 'notes', '') or '').strip(),
            'sc_number': '',
            'rd_number': '',
            'gender': getattr(subj, 'gender', '') or '' if subj else '',
            'age': getattr(subj, 'age', None) if subj else None,
            'appointment_time': appt.appointment_time.strftime('%H:%M') if appt.appointment_time else '',
            'purpose': appt.purpose,
            'visit_point': getattr(appt, 'visit_point', '') or '',
            'project_name': project_name,
            'project_code': project_code_val,
            'task_type': task_type,
            'status': status,
            'checkin_id': checkin_id,
            'checkin_time': checkin_time,
            'checkout_time': checkout_time,
            'enrollment_id': appt.enrollment_id,
        })

    # 无预约签到（临时到访）
    if use_board:
        unscheduled = ReceptionBoardCheckin.objects.filter(checkin_date=today).exclude(
            subject_id__in=[a.subject_id for a in appointments],
        ).select_related('subject')
        enrollment_protocol_map = {}
        enr_ids = [c.appointment_id for c in unscheduled if c.appointment_id]
        if enr_ids:
            appts_by_id = {a.id: a for a in appointments}
            for aid in enr_ids:
                a = appts_by_id.get(aid)
                if a and a.enrollment_id and getattr(a.enrollment, 'protocol', None):
                    p = a.enrollment.protocol
                    enrollment_protocol_map[aid] = (p.title or '', (p.code or '').strip())
                else:
                    enrollment_protocol_map[aid] = ('', '')
        for board_rec in unscheduled:
            project_name = ''
            project_code_val = ''
            subj = board_rec.subject
            _phone = getattr(subj, 'phone', '') or '' if subj else ''
            queue.append({
                'appointment_id': board_rec.appointment_id,
                'subject_id': board_rec.subject_id,
                'subject_name': subj.name if subj else '',
                'subject_no': subj.subject_no if subj else '',
                '_subject_phone': _phone,
                'phone': _phone,
                'name_pinyin_initials': '',
                'liaison': '',
                'notes': '',
                'sc_number': '',
                'rd_number': '',
                'gender': getattr(subj, 'gender', '') or '' if subj else '',
                'age': getattr(subj, 'age', None) if subj else None,
                'appointment_time': '',
                'purpose': '临时到访',
                'visit_point': '',
                'project_name': project_name,
                'project_code': project_code_val,
                'task_type': 'walk_in',
                'status': 'checked_out' if board_rec.checkout_time else 'checked_in',
                'checkin_id': board_rec.id,
                'checkin_time': board_rec.checkin_time.isoformat() if board_rec.checkin_time else None,
                'checkout_time': board_rec.checkout_time.isoformat() if board_rec.checkout_time else None,
                'enrollment_id': None,
            })
    else:
        unscheduled_checkins = SubjectCheckin.objects.filter(
            checkin_date=today,
        ).exclude(
            subject_id__in=[a.subject_id for a in appointments],
        ).select_related('subject')
        enrollment_protocol_map = {}
        enr_ids = [c.enrollment_id for c in unscheduled_checkins if c.enrollment_id]
        if enr_ids:
            for enr in Enrollment.objects.filter(id__in=enr_ids).select_related('protocol'):
                if enr.protocol:
                    enrollment_protocol_map[enr.id] = (enr.protocol.title or '', (enr.protocol.code or '').strip())
                else:
                    enrollment_protocol_map[enr.id] = ('', '')

        for checkin in unscheduled_checkins:
            project_name = ''
            project_code_val = ''
            if checkin.enrollment_id:
                project_name, project_code_val = enrollment_protocol_map.get(checkin.enrollment_id, ('', ''))
            subj = checkin.subject
            _phone = getattr(subj, 'phone', '') or '' if subj else ''
            queue.append({
                'appointment_id': None,
                'subject_id': checkin.subject_id,
                'subject_name': subj.name if subj else '',
                'subject_no': subj.subject_no if subj else '',
                '_subject_phone': _phone,
                'phone': _phone,
                'name_pinyin_initials': '',
                'liaison': '',
                'notes': '',
                'sc_number': '',
                'rd_number': '',
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

    # SC号/RD号：source=execution 用 SubjectProjectSC，source=board 用 ReceptionBoardProjectSc
    keys = [(item.get('subject_id'), (item.get('project_code') or '').strip()) for item in queue]
    keys = [(s, p) for s, p in keys if s is not None and p]
    sc_map = {}
    if keys:
        if use_board:
            for rec in ReceptionBoardProjectSc.objects.filter(
                subject_id__in={s for s, _ in keys},
                project_code__in={p for _, p in keys},
            ):
                k = (rec.subject_id, (rec.project_code or '').strip())
                if k not in sc_map:
                    sc_map[k] = rec
        else:
            for rec in SubjectProjectSC.objects.filter(is_deleted=False).filter(
                subject_id__in={s for s, _ in keys},
                project_code__in={p for _, p in keys},
            ):
                k = (rec.subject_id, (rec.project_code or '').strip())
                if k not in sc_map:
                    sc_map[k] = rec
    for item in queue:
        k = (item.get('subject_id'), (item.get('project_code') or '').strip())
        rec = sc_map.get(k)
        if rec:
            sn = (rec.sc_number or '').strip()
            item['sc_number'] = f'SC{sn}' if sn.isdigit() else (sn or '')
            item['rd_number'] = (rec.rd_number or '').strip()
            item['enrollment_status'] = (rec.enrollment_status or '').strip()
        else:
            item['sc_number'] = item.get('sc_number') or ''
            item['rd_number'] = item.get('rd_number') or ''
            item['enrollment_status'] = item.get('enrollment_status') or ''

    if project_code and str(project_code).strip():
        pc_lower = str(project_code).strip().lower()
        queue = [i for i in queue if (i.get('project_code') or '').strip().lower() == pc_lower]

    def _normalize_sc_for_sort(raw: object) -> str:
        s = str(raw or '').strip()
        if not s or s in ('-', '—', '－'):
            return ''
        return s

    def _today_queue_sort_key(item: dict) -> tuple:
        pc = (item.get('project_code') or '').strip()
        sc = _normalize_sc_for_sort(item.get('sc_number'))
        # 同项目内：有有效 SC 在前、无 SC 在后；再按 SC 号升序；最后按预约时间
        has_sc_rank = 1 if not sc else 0
        appt_t = str(item.get('appointment_time') or '').strip()
        return (pc, has_sc_rank, sc, appt_t)

    queue.sort(key=_today_queue_sort_key)

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
    source: str = 'execution',
) -> dict:
    """
    今日队列导出数据：按日期/项目/状态筛选，含项目名称、项目编号、SC号、性别、年龄、手机号等（与 get_today_queue 条目一致）。
    返回完整列表（不分页）供前端生成 CSV/Excel。
    source: execution=工单执行，board=接待看板。
    """
    full = get_today_queue(target_date=target_date, page=1, page_size=99999, project_code=project_code, source=source)
    items = full.get('items', [])
    if status and str(status).strip().lower() not in ('', 'all'):
        status_lower = str(status).strip().lower()
        items = [i for i in items if (i.get('status') or '').lower() == status_lower]
    return {'items': items, 'date': full.get('date', ''), 'total': len(items)}


def get_appointment_calendar(target_month: Optional[str] = None) -> dict:
    """按月返回每天的预约数，供接待台月历展示。"""
    today = _local_today()
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
    today = target_date or _local_today()

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

    # 入组情况各状态数量（工单执行页卡片用）：从今日队列聚合
    queue_full = get_today_queue(target_date=today, page=1, page_size=99999, project_code=project_code, source='execution')
    items = queue_full.get('items', [])
    enrollment_status_counts = {
        '初筛合格': 0,
        '正式入组': 0,
        '不合格': 0,
        '复筛不合格': 0,
        '退出': 0,
        '缺席': 0,
    }
    for it in items:
        s = (it.get('enrollment_status') or '').strip()
        if s in enrollment_status_counts:
            enrollment_status_counts[s] = enrollment_status_counts[s] + 1

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
        'enrollment_status_counts': enrollment_status_counts,
    }


def _normalize_sc_number(raw: str) -> str:
    """将 SC001、001、1 等格式统一为 001。"""
    s = (raw or '').strip().upper()
    if not s:
        return ''
    if s.startswith('SC'):
        s = s[2:].strip()
    if s.isdigit():
        return f'{int(s):03d}'
    return s


def ensure_project_sc_from_import(
    subject_id: int,
    project_code: str,
    sc_number: Optional[str] = None,
    rd_number: Optional[str] = None,
    operator_id: Optional[int] = None,
) -> None:
    """
    导入预约时若 SC/RD 非空，创建或更新 SubjectProjectSC，使页面直接显示导入数据。
    仅填充空字段，不覆盖已有值。
    """
    if not project_code:
        return
    sc_val = _normalize_sc_number(sc_number) if sc_number else ''
    rd_val = (rd_number or '').strip()
    rec, created = SubjectProjectSC.objects.get_or_create(
        subject_id=subject_id,
        project_code=project_code,
        is_deleted=False,
        defaults={
            'sc_number': sc_val or '',
            'rd_number': rd_val if rd_val else '',
            'enrollment_status': '正式入组' if rd_val else '',
            'created_by_id': operator_id,
            'updated_by_id': operator_id,
        },
    )
    if not created:
        update_fields = ['update_time', 'updated_by_id']
        if operator_id is not None:
            rec.updated_by_id = operator_id
        if sc_val and not (rec.sc_number or '').strip():
            rec.sc_number = sc_val
            update_fields.append('sc_number')
        if rd_val and not (rec.rd_number or '').strip():
            rec.rd_number = rd_val
            rec.enrollment_status = '正式入组'
            update_fields.extend(['rd_number', 'enrollment_status'])
        rec.save(update_fields=update_fields)


def _ensure_project_sc_on_checkin(
    subject_id: int,
    project_code: str,
    visit_point: str,
    operator_id: Optional[int],
) -> None:
    """确保受试者在该项目下有 SubjectProjectSC；V1 时若 SC 为空才分配，否则仅确保记录存在。"""
    if not project_code:
        return
    visit_point = (visit_point or '').strip().upper()
    if visit_point == 'V1':
        rec, created = SubjectProjectSC.objects.get_or_create(
            subject_id=subject_id,
            project_code=project_code,
            is_deleted=False,
            defaults={
                'sc_number': _next_sc_number_for_project(project_code),
                'created_by_id': operator_id,
                'updated_by_id': operator_id,
            },
        )
        if not created:
            # 已有记录（如导入创建）：仅当 SC 为空时才生成
            existing_sc = (rec.sc_number or '').strip()
            if not existing_sc:
                rec.sc_number = _next_sc_number_for_project(project_code)
                rec.updated_by_id = operator_id
                rec.save(update_fields=['sc_number', 'updated_by_id', 'update_time'])
            else:
                rec.updated_by_id = operator_id
                rec.save(update_fields=['update_time', 'updated_by_id'])
    else:
        rec = SubjectProjectSC.objects.filter(
            subject_id=subject_id,
            project_code=project_code,
            is_deleted=False,
        ).first()
        if rec:
            rec.updated_by_id = operator_id
            rec.save(update_fields=['update_time', 'updated_by_id'])
        else:
            SubjectProjectSC.objects.get_or_create(
                subject_id=subject_id,
                project_code=project_code,
                is_deleted=False,
                defaults={'updated_by_id': operator_id},
            )


@transaction.atomic
def quick_checkin(
    subject_id: int,
    method: str = 'manual',
    location: str = '',
    operator_id: Optional[int] = None,
    project_code: Optional[str] = None,
) -> dict:
    """
    快速签到：创建 SubjectCheckin 记录 + 触发通知。
    project_code: 多项目同天时，指定为哪个项目生成 SC 号；已有签到时，仍会为该项目确保 SC 记录。
    """
    today = _local_today()
    pc = (project_code or '').strip() or None

    existing = SubjectCheckin.objects.filter(
        subject_id=subject_id, checkin_date=today,
    ).exclude(status=CheckinStatus.CHECKED_OUT).first()
    if existing:
        # 已有签到：若指定了 project_code，确保该项目有 SC 记录（同天多项目各自独立）
        if pc:
            appt = SubjectAppointment.objects.filter(
                subject_id=subject_id,
                appointment_date=today,
                project_code=pc,
                status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING, AppointmentStatus.COMPLETED],
            ).first()
            if appt:
                visit_point = (getattr(appt, 'visit_point', '') or '').strip()
                _ensure_project_sc_on_checkin(subject_id, pc, visit_point, operator_id)
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

    # 优先用 project_code 定位预约；否则取当日第一条
    appt_qs = SubjectAppointment.objects.filter(
        subject_id=subject_id, appointment_date=today,
        status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
    )
    if pc:
        appt = appt_qs.filter(project_code=pc).first() or appt_qs.first()
    else:
        appt = appt_qs.first()
    if appt:
        appt.status = AppointmentStatus.COMPLETED
        appt.save(update_fields=['status', 'update_time'])
        # SC 号仅在访视点为 V1 时分配；同项目后续访视复用该 SC 号
        project_code = (appt.project_code or '').strip()
        visit_point = (getattr(appt, 'visit_point', '') or '').strip().upper()
        if project_code:
            if visit_point == 'V1':
                rec, created = SubjectProjectSC.objects.get_or_create(
                    subject_id=subject_id,
                    project_code=project_code,
                    is_deleted=False,
                    defaults={
                        'sc_number': _next_sc_number_for_project(project_code),
                        'created_by_id': operator_id,
                        'updated_by_id': operator_id,
                    },
                )
                if not created:
                    # 已有记录（如导入创建）：仅当 SC 为空时才生成
                    existing_sc = (rec.sc_number or '').strip()
                    if not existing_sc:
                        rec.sc_number = _next_sc_number_for_project(project_code)
                        rec.updated_by_id = operator_id
                        rec.save(update_fields=['sc_number', 'updated_by_id', 'update_time'])
                    else:
                        rec.updated_by_id = operator_id
                        rec.save(update_fields=['update_time', 'updated_by_id'])
            else:
                rec = SubjectProjectSC.objects.filter(
                    subject_id=subject_id,
                    project_code=project_code,
                    is_deleted=False,
                ).first()
                if rec:
                    rec.updated_by_id = operator_id
                    rec.save(update_fields=['update_time', 'updated_by_id'])

    try:
        from .recruitment_notify import notify_subject_checkin
        notify_subject_checkin(subject, checkin)
    except Exception:
        logger.warning('签到通知发送失败', exc_info=True)

    logger.info('快速签到: subject=%s method=%s', subject.subject_no, method)
    return _checkin_to_dict(checkin)


def _next_sc_number_for_project(project_code: str) -> str:
    """该项目下已有 SC 号的最大序号+1，格式 001、002..."""
    existing = SubjectProjectSC.objects.filter(
        project_code=project_code, is_deleted=False
    ).values_list('sc_number', flat=True)
    nums = []
    for s in existing:
        s = (s or '').strip()
        if s.isdigit():
            nums.append(int(s))
        elif s.upper().startswith('SC') and s[2:].strip().isdigit():
            nums.append(int(s[2:].strip()))
    next_num = (max(nums) + 1) if nums else 1
    return f'{next_num:03d}'


# 入组情况可选值（与 SubjectProjectSC.enrollment_status 一致）
ENROLLMENT_STATUS_ENROLLED = '正式入组'
ENROLLMENT_STATUS_ABSENT = '缺席'


def _has_execution_checkin_today(subject_id: int) -> bool:
    """当日是否有过执行台签到记录（含已签出），用于非「缺席」入组情况的前置条件。"""
    today = _local_today()
    return SubjectCheckin.objects.filter(subject_id=subject_id, checkin_date=today).exists()


def _next_rd_number_for_project(project_code: str) -> str:
    """该项目下已有正式入组的 RD 号的最大序号+1，格式 RD001、RD002..."""
    existing = SubjectProjectSC.objects.filter(
        project_code=project_code,
        is_deleted=False,
        enrollment_status=ENROLLMENT_STATUS_ENROLLED,
    ).exclude(rd_number='').values_list('rd_number', flat=True)
    nums = []
    for s in existing:
        s = (s or '').strip().upper()
        if s.startswith('RD') and len(s) > 2:
            suffix = s[2:].strip()
            if suffix.isdigit():
                nums.append(int(suffix))
    next_num = (max(nums) + 1) if nums else 1
    return f'RD{next_num:03d}'


def update_project_sc(
    subject_id: int,
    project_code: str,
    enrollment_status: Optional[str] = None,
    rd_number: Optional[str] = None,
    operator_id: Optional[int] = None,
) -> dict:
    """
    更新受试者-项目 SC 记录的入组情况与 RD 号。
    仅当入组情况为「正式入组」时允许写入 rd_number；否则忽略或清空 rd_number。
    无 SC 记录时：仅允许将入组情况设为「缺席」（自动创建一条空 SC 记录）；
    设为初筛合格/正式入组/不合格/复筛不合格/退出前须当日已有执行台签到。
    """
    project_code = (project_code or '').strip()
    if not project_code:
        raise ValueError('项目编号不能为空')
    rec = SubjectProjectSC.objects.filter(
        subject_id=subject_id,
        project_code=project_code,
        is_deleted=False,
    ).first()
    if not rec:
        want = (enrollment_status or '').strip() if enrollment_status is not None else ''
        if want == ENROLLMENT_STATUS_ABSENT:
            rec, _ = SubjectProjectSC.objects.get_or_create(
                subject_id=subject_id,
                project_code=project_code,
                is_deleted=False,
                defaults={
                    'sc_number': '',
                    'rd_number': '',
                    'enrollment_status': ENROLLMENT_STATUS_ABSENT,
                    'created_by_id': operator_id,
                    'updated_by_id': operator_id,
                },
            )
        else:
            raise ValueError('未找到该受试者在当前项目下的 SC 记录，请先完成签到')
    update_fields = []
    if enrollment_status is not None:
        new_st = (enrollment_status or '').strip()
        if new_st and new_st != ENROLLMENT_STATUS_ABSENT and not _has_execution_checkin_today(subject_id):
            raise ValueError('请先完成签到后再设置该入组情况')
        rec.enrollment_status = new_st
        update_fields.append('enrollment_status')
    need_rd_update = enrollment_status is not None or rd_number is not None
    if need_rd_update:
        effective_status = (rec.enrollment_status or '').strip()
        if effective_status == ENROLLMENT_STATUS_ENROLLED:
            val = (rd_number or '').strip() if rd_number is not None else ''
            existing_rd = (rec.rd_number or '').strip()
            # 仅当无已有 RD 号且传入值为空或仅 "RD" 时自动生成
            if (not val or val.upper() == 'RD') and not existing_rd:
                rec.rd_number = _next_rd_number_for_project(project_code)
            elif val and val.upper() != 'RD':
                # 用户输入了有效 RD（如 RD003），使用用户值；若仅传 "RD" 且已有 RD 则保留
                rec.rd_number = val
        else:
            rec.rd_number = ''
        update_fields.append('rd_number')
    if operator_id is not None:
        rec.updated_by_id = operator_id
        update_fields.append('updated_by_id')
    if update_fields:
        rec.save(update_fields=set(update_fields) | {'update_time'})
    return {
        'subject_id': rec.subject_id,
        'project_code': rec.project_code,
        'enrollment_status': (rec.enrollment_status or '').strip(),
        'rd_number': (rec.rd_number or '').strip(),
    }


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
    today = target_date or _local_today()
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
    today = _local_today()

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
    today = target_date or _local_today()
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

    today = _local_today()
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


# ============================================================================
# 接待看板独立签到/签出（与工单执行 SubjectCheckin 分离）
# ============================================================================
def get_board_checkins(target_date: Optional[date] = None) -> list[dict]:
    """按日期返回接待看板签到记录，供前端与今日队列合并展示。"""
    day = target_date or _local_today()
    qs = ReceptionBoardCheckin.objects.filter(checkin_date=day).select_related('subject')
    return [
        {
            'id': r.id,
            'subject_id': r.subject_id,
            'appointment_id': r.appointment_id,
            'checkin_time': r.checkin_time.isoformat() if r.checkin_time else None,
            'checkout_time': r.checkout_time.isoformat() if r.checkout_time else None,
        }
        for r in qs
    ]


def _next_board_sc_number_for_project(project_code: str) -> str:
    """接待看板该项目下已有 SC 号的最大序号+1，格式 001、002..."""
    existing = ReceptionBoardProjectSc.objects.filter(project_code=project_code).values_list('sc_number', flat=True)
    nums = []
    for s in existing:
        s = (s or '').strip()
        if s.isdigit():
            nums.append(int(s))
        elif s.upper().startswith('SC') and len(s) > 2 and s[2:].strip().isdigit():
            nums.append(int(s[2:].strip()))
    next_num = (max(nums) + 1) if nums else 1
    return f'{next_num:03d}'


def _ensure_board_project_sc_on_checkin(
    subject_id: int,
    project_code: str,
    visit_point: str,
) -> None:
    """确保受试者在该项目下有 ReceptionBoardProjectSc；V1 时分配 SC 号，否则仅确保记录存在。"""
    if not project_code:
        return
    visit_point = (visit_point or '').strip().upper()
    if visit_point == 'V1':
        ReceptionBoardProjectSc.objects.get_or_create(
            subject_id=subject_id,
            project_code=project_code,
            defaults={'sc_number': _next_board_sc_number_for_project(project_code)},
        )
    else:
        ReceptionBoardProjectSc.objects.get_or_create(
            subject_id=subject_id,
            project_code=project_code,
            defaults={'sc_number': ''},
        )


@transaction.atomic
def board_checkin(
    subject_id: int,
    target_date: Optional[date] = None,
    project_code: Optional[str] = None,
) -> dict:
    """接待看板签到：创建或更新 ReceptionBoardCheckin，分配 SC 号（ReceptionBoardProjectSc），不影响工单执行。
    project_code: 多项目同天时，指定为哪个项目生成 SC 号；已有签到时，仍会为该项目确保 SC 记录。
    """
    day = target_date or _local_today()
    now = timezone.now()
    pc = (project_code or '').strip() or None

    appt_qs = SubjectAppointment.objects.filter(
        subject_id=subject_id,
        appointment_date=day,
        status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
    )
    appt = appt_qs.filter(project_code=pc).first() if pc else appt_qs.first()
    if not appt and pc:
        appt = appt_qs.first()

    defaults = {'checkin_time': now}
    if appt:
        defaults['appointment_id'] = appt.id

    rec, created = ReceptionBoardCheckin.objects.update_or_create(
        subject_id=subject_id,
        checkin_date=day,
        defaults=defaults,
    )

    # 已有签到时：若指定了 project_code，确保该项目有 SC 记录（同天多项目各自独立）
    if not created and pc:
        appt_for_pc = SubjectAppointment.objects.filter(
            subject_id=subject_id,
            appointment_date=day,
            project_code=pc,
            status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING, AppointmentStatus.COMPLETED],
        ).first()
        if appt_for_pc:
            visit_point = (getattr(appt_for_pc, 'visit_point', '') or '').strip()
            _ensure_board_project_sc_on_checkin(subject_id, pc, visit_point)
    elif appt and created:
        # 新建签到：分配 SC 号
        proj = (appt.project_code or '').strip()
        visit_point = (getattr(appt, 'visit_point', '') or '').strip().upper()
        if proj:
            if visit_point == 'V1':
                ReceptionBoardProjectSc.objects.get_or_create(
                    subject_id=subject_id,
                    project_code=proj,
                    defaults={'sc_number': _next_board_sc_number_for_project(proj)},
                )
            else:
                ReceptionBoardProjectSc.objects.get_or_create(
                    subject_id=subject_id,
                    project_code=proj,
                    defaults={'sc_number': ''},
                )

    return {
        'id': rec.id,
        'subject_id': rec.subject_id,
        'checkin_date': str(rec.checkin_date),
        'checkin_time': rec.checkin_time.isoformat() if rec.checkin_time else None,
        'checkout_time': rec.checkout_time.isoformat() if rec.checkout_time else None,
    }


def board_checkout(subject_id: int, target_date: Optional[date] = None) -> dict:
    """接待看板签出：更新 ReceptionBoardCheckin 的签出时间，不影响工单执行。"""
    day = target_date or _local_today()
    now = timezone.now()
    rec = ReceptionBoardCheckin.objects.filter(subject_id=subject_id, checkin_date=day).first()
    if not rec:
        raise ValueError('该受试者当日尚无接待看板签到记录，请先签到')
    rec.checkout_time = now
    rec.save(update_fields=['checkout_time', 'update_time'])
    return {
        'id': rec.id,
        'subject_id': rec.subject_id,
        'checkin_date': str(rec.checkin_date),
        'checkin_time': rec.checkin_time.isoformat() if rec.checkin_time else None,
        'checkout_time': rec.checkout_time.isoformat() if rec.checkout_time else None,
    }


def get_board_project_sc_list() -> list[dict]:
    """返回接待看板专用 SC/入组/RD 列表，按 subject_id+project_code 供前端合并队列。"""
    qs = ReceptionBoardProjectSc.objects.all().select_related('subject')
    return [
        {
            'subject_id': r.subject_id,
            'project_code': r.project_code,
            'sc_number': r.sc_number or '',
            'enrollment_status': r.enrollment_status or '',
            'rd_number': r.rd_number or '',
        }
        for r in qs
    ]


def update_board_project_sc(
    subject_id: int,
    project_code: str,
    enrollment_status: Optional[str] = None,
    rd_number: Optional[str] = None,
    sc_number: Optional[str] = None,
) -> dict:
    """更新接待看板专用 SC/入组/RD，与工单执行独立。"""
    project_code = (project_code or '').strip()
    if not project_code:
        raise ValueError('项目编号不能为空')
    rec, _ = ReceptionBoardProjectSc.objects.get_or_create(
        subject_id=subject_id,
        project_code=project_code,
        defaults={'sc_number': '', 'enrollment_status': '', 'rd_number': ''},
    )
    update_fields = []
    if enrollment_status is not None:
        rec.enrollment_status = (enrollment_status or '').strip()
        update_fields.append('enrollment_status')
    if rd_number is not None:
        rec.rd_number = (rd_number or '').strip()
        update_fields.append('rd_number')
    if sc_number is not None:
        rec.sc_number = (sc_number or '').strip()
        update_fields.append('sc_number')
    if update_fields:
        update_fields.append('update_time')
        rec.save(update_fields=update_fields)
    return {
        'subject_id': rec.subject_id,
        'project_code': rec.project_code,
        'sc_number': rec.sc_number or '',
        'enrollment_status': rec.enrollment_status or '',
        'rd_number': rec.rd_number or '',
    }
