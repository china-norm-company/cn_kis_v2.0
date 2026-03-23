"""
叫号队列服务

管理前台等候排队、叫号、过号、排位查询。
- 叫号：按项目编号筛选，项目内按 SC 号顺序；过号者按顺延 3 位插入。
- 过号：将 in_progress 改回 checked_in，记录过号时刻及当时队首 SC 序号（叫号序 = 该值 + 3）。
"""
import logging
from collections import defaultdict
from datetime import date
from typing import Optional

from django.utils import timezone
from django.db.models import Avg, F

from libs.time_format import format_local_hhmm

logger = logging.getLogger(__name__)

# 过号顺延位数（插在即将被叫的下一位之后 N 位）
MISSED_CALL_DELAY_SLOTS = 3


def _get_project_code_for_checkin(checkin, today: date) -> str:
    """为签到解析项目编号：优先当日预约，否则 enrollment.protocol.code。"""
    from ..models_execution import SubjectAppointment

    appt = (
        SubjectAppointment.objects.filter(
            subject_id=checkin.subject_id,
            appointment_date=today,
        )
        .exclude(status='cancelled')
        .order_by('appointment_time')
        .first()
    )
    if appt and getattr(appt, 'project_code', None):
        return (appt.project_code or '').strip()
    if checkin.enrollment_id:
        try:
            enr = checkin.enrollment
            if enr and getattr(enr, 'protocol', None) and enr.protocol:
                return (getattr(enr.protocol, 'code', None) or '').strip()
        except Exception:
            pass
    return ''


def _build_call_order_list(today: date, project_code_filter: Optional[str] = None):
    """
    构建当日 checked_in 的叫号序列表。
    返回 [(checkin, project_code, sc_rank, call_order), ...]，按 call_order 升序排好。
    """
    from ..models_execution import SubjectCheckin

    checkins = list(
        SubjectCheckin.objects.filter(
            checkin_date=today,
            status='checked_in',
        ).select_related('subject', 'enrollment', 'enrollment__protocol')
    )
    if not checkins:
        return []

    # 为每条签到解析 project_code
    rows = []
    for c in checkins:
        pc = _get_project_code_for_checkin(c, today) or '_'
        rows.append((c, pc))

    # 按项目分组，同项目内按 subject_id 赋 SC 序号（与 get_today_queue 一致）
    by_project = defaultdict(list)
    for c, pc in rows:
        by_project[pc].append(c)

    sid_to_sc_rank = {}
    for pc, group in by_project.items():
        unique_sids = sorted({c.subject_id for c in group})
        for r, sid in enumerate(unique_sids, start=1):
            sid_to_sc_rank[(pc, sid)] = r

    # 计算 call_order：未过号 = sc_rank；过号 = missed_after_sc_rank + MISSED_CALL_DELAY_SLOTS
    result = []
    for c, pc in rows:
        sc_rank = sid_to_sc_rank.get((pc, c.subject_id), 999)
        if getattr(c, 'missed_after_sc_rank', None) is not None:
            call_order = (c.missed_after_sc_rank or 0) + MISSED_CALL_DELAY_SLOTS
            missed_at = getattr(c, 'missed_call_at', None)
            result.append((c, pc, sc_rank, call_order, missed_at))
        else:
            result.append((c, pc, sc_rank, sc_rank, None))

    # 筛选项目
    if project_code_filter and str(project_code_filter).strip():
        pc_lower = str(project_code_filter).strip().lower()
        result = [(c, pc, sr, co, ma) for c, pc, sr, co, ma in result if (pc or '_').strip().lower() == pc_lower]

    # 排序：call_order 升序，同序时过号者按 missed_call_at 升序，再按 checkin_time
    result.sort(key=lambda x: (x[3], x[4] or timezone.now(), x[0].checkin_time or timezone.now()))

    return result


def call_next(station_id: str = 'default', project_code: Optional[str] = None) -> dict:
    """
    叫号：按项目内叫号序取下一名 checked_in，更新为 in_progress。
    若传 project_code 则仅在该项目内取；否则全局按叫号序（项目+SC+过号顺延）。
    """
    from ..models_execution import SubjectCheckin

    today = timezone.now().date()
    ordered = _build_call_order_list(today, project_code_filter=project_code)

    if not ordered:
        msg = '该项目下无等候受试者' if project_code else '当前无等候受试者'
        return {'called': False, 'message': msg}

    next_checkin = ordered[0][0]
    sc_rank = ordered[0][2]
    sc_number = f'SC{sc_rank:03d}'

    next_checkin.status = 'in_progress'
    next_checkin.save(update_fields=['status', 'update_time'])

    subject = next_checkin.subject
    subject_info = {
        'subject_id': subject.id,
        'subject_no': subject.subject_no,
        'name': subject.name,
        'sc_number': sc_number,
        'checkin_id': next_checkin.id,
        'checkin_time': format_local_hhmm(next_checkin.checkin_time),
    }

    try:
        from ..services.recruitment_notify import notify_subject_checkin
        notify_subject_checkin(subject, next_checkin)
    except Exception:
        logger.warning('叫号评估员通知失败', exc_info=True)
    try:
        from libs.notification import notify_next_subject
        if hasattr(next_checkin, 'evaluator') and next_checkin.evaluator:
            open_id = getattr(next_checkin.evaluator, 'feishu_open_id', '')
            if open_id:
                notify_next_subject(open_id, subject_info)
    except Exception:
        logger.warning('叫号飞书卡片通知失败', exc_info=True)
    try:
        from libs.wechat_notification import notify_queue_call
        notify_queue_call(subject, station_id)
    except Exception:
        logger.warning('叫号微信通知失败', exc_info=True)

    return {'called': True, 'subject': subject_info, 'station': station_id}


def miss_call(checkin_id: int) -> dict:
    """
    过号：将 in_progress 的签到改回 checked_in，并记录过号时刻及当时该项目内即将被叫的 SC 序号（顺延 3 位）。
    """
    from ..models_execution import SubjectCheckin

    today = timezone.now().date()
    checkin = SubjectCheckin.objects.filter(
        id=checkin_id,
        checkin_date=today,
        status='in_progress',
    ).select_related('subject', 'enrollment', 'enrollment__protocol').first()

    if not checkin:
        return {'ok': False, 'message': '未找到当日执行中的签到记录或已过号/已签出'}

    project_code = _get_project_code_for_checkin(checkin, today) or '_'

    # 当前该项目内 checked_in 排序列表（不含本条，因本条仍是 in_progress），队首的 sc_rank 即为「即将被叫的 SC 序号」
    filter_pc = project_code if project_code != '_' else None
    ordered = _build_call_order_list(today, project_code_filter=filter_pc)
    missed_after_sc_rank = ordered[0][2] if ordered else 1

    now = timezone.now()
    checkin.status = 'checked_in'
    checkin.missed_call_at = now
    checkin.missed_after_sc_rank = missed_after_sc_rank
    checkin.save(update_fields=['status', 'missed_call_at', 'missed_after_sc_rank', 'update_time'])

    logger.info('过号: checkin_id=%s subject=%s missed_after_sc_rank=%s', checkin_id, checkin.subject_id, missed_after_sc_rank)
    return {
        'ok': True,
        'checkin_id': checkin_id,
        'message': '已过号，已按该项目顺延 3 位重新排队',
    }


def get_queue_position(subject_id: int) -> dict:
    """查询受试者当前排队位置和预估等候时间"""
    from ..models_execution import SubjectCheckin

    today = timezone.now().date()
    checkin = SubjectCheckin.objects.filter(
        subject_id=subject_id,
        checkin_date=today,
    ).order_by('-checkin_time').first()

    if not checkin:
        return {'position': 0, 'wait_minutes': 0, 'status': 'none'}

    if checkin.status == 'in_progress':
        return {'position': 0, 'wait_minutes': 0, 'status': 'serving'}

    if checkin.status == 'checked_out':
        return {'position': 0, 'wait_minutes': 0, 'status': 'completed'}

    ahead_count = SubjectCheckin.objects.filter(
        checkin_date=today,
        status='checked_in',
        checkin_time__lt=checkin.checkin_time,
    ).count()
    position = ahead_count + 1

    avg_wait = estimate_wait_time(position)

    return {
        'position': position,
        'ahead_count': ahead_count,
        'wait_minutes': avg_wait,
        'status': 'waiting',
        'checkin_time': format_local_hhmm(checkin.checkin_time),
    }


def get_display_board(target_date=None) -> dict:
    """大屏展示数据（含当日签到二维码）"""
    from ..models_execution import SubjectCheckin
    from .checkin_qrcode_service import generate_daily_checkin_qrcode

    if not target_date:
        target_date = timezone.now().date()

    checkins = SubjectCheckin.objects.filter(
        checkin_date=target_date,
    ).select_related('subject').order_by('checkin_time')

    serving = []
    waiting = []
    completed_count = 0

    for ci in checkins:
        entry = {
            'subject_no_tail': ci.subject.subject_no[-4:] if ci.subject.subject_no else str(ci.subject_id),
            'name_masked': ci.subject.name[0] + '**' if ci.subject.name else '***',
            'checkin_time': format_local_hhmm(ci.checkin_time),
            'status': ci.status,
        }
        if ci.status == 'in_progress':
            serving.append(entry)
        elif ci.status == 'checked_in':
            if len(waiting) < 10:
                waiting.append(entry)
        elif ci.status == 'checked_out':
            completed_count += 1

    checkin_qrcode = None
    try:
        from apps.qrcode.models import QRCodeRecord, EntityType
        from apps.qrcode.services import generate_daily_station_qr_content
        station_record = QRCodeRecord.objects.filter(
            entity_type=EntityType.STATION, is_active=True,
        ).order_by('entity_id').first()
        if station_record:
            today_str = str(target_date)
            content = generate_daily_station_qr_content(station_record.entity_id, valid_date=today_str)
            checkin_qrcode = {
                'content': content,
                'valid_date': today_str,
                'station_label': station_record.label or f'签到点#{station_record.entity_id}',
            }
    except Exception as _e:
        logger.warning('大屏签到码生成失败: %s', _e)

    return {
        'serving': serving,
        'waiting': waiting,
        'waiting_total': SubjectCheckin.objects.filter(
            checkin_date=target_date, status='checked_in',
        ).count(),
        'completed_count': completed_count,
        'date': str(target_date),
        'checkin_qrcode': checkin_qrcode,
    }


def estimate_wait_time(position: int) -> int:
    """基于当日历史平均服务时长估算等候分钟数"""
    from ..models_execution import SubjectCheckin

    today = timezone.now().date()
    completed_today = SubjectCheckin.objects.filter(
        checkin_date=today,
        status='checked_out',
        checkin_time__isnull=False,
        checkout_time__isnull=False,
    ).annotate(
        service_duration=F('checkout_time') - F('checkin_time'),
    )

    if completed_today.exists():
        avg = completed_today.aggregate(avg_dur=Avg('service_duration'))['avg_dur']
        if avg:
            avg_minutes = avg.total_seconds() / 60
            return max(1, int(avg_minutes * position))

    return position * 15  # default 15min per person
