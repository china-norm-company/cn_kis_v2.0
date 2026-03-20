"""
叫号队列服务

管理前台等候排队、叫号、排位查询。
基于 SubjectCheckin 的签到状态实现队列管理。
"""
import logging
from datetime import timedelta
from typing import Optional

from django.utils import timezone
from django.db.models import Avg, F

logger = logging.getLogger(__name__)


def call_next(station_id: str = 'default') -> dict:
    """
    叫号：取下一位 checked_in 状态的受试者，更新为 in_progress
    """
    from ..models_execution import SubjectCheckin

    today = timezone.now().date()
    next_in_line = SubjectCheckin.objects.filter(
        checkin_date=today,
        status='checked_in',
    ).order_by('checkin_time').select_related('subject').first()

    if not next_in_line:
        return {'called': False, 'message': '当前无等候受试者'}

    next_in_line.status = 'in_progress'
    next_in_line.save(update_fields=['status', 'update_time'])

    subject = next_in_line.subject
    subject_info = {
        'subject_id': subject.id,
        'subject_no': subject.subject_no,
        'name': subject.name,
        'checkin_id': next_in_line.id,
        'checkin_time': next_in_line.checkin_time.strftime('%H:%M') if next_in_line.checkin_time else '',
    }

    # 通知评估员（飞书卡片 + 旧逻辑）
    try:
        from ..services.recruitment_notify import notify_subject_checkin
        notify_subject_checkin(subject, next_in_line)
    except Exception:
        logger.warning('叫号评估员通知失败', exc_info=True)
    try:
        from libs.notification import notify_next_subject
        if hasattr(next_in_line, 'evaluator') and next_in_line.evaluator:
            open_id = getattr(next_in_line.evaluator, 'feishu_open_id', '')
            if open_id:
                notify_next_subject(open_id, subject_info)
    except Exception:
        logger.warning('叫号飞书卡片通知失败', exc_info=True)

    # 通知受试者（微信）
    try:
        from libs.wechat_notification import notify_queue_call
        notify_queue_call(subject, station_id)
    except Exception:
        logger.warning('叫号微信通知失败', exc_info=True)

    return {'called': True, 'subject': subject_info, 'station': station_id}


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
        'checkin_time': checkin.checkin_time.strftime('%H:%M') if checkin.checkin_time else '',
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
            'checkin_time': ci.checkin_time.strftime('%H:%M') if ci.checkin_time else '',
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
