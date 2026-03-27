"""
前台接待聚合服务

提供今日受试者队列、统计、快速签到签出、待处理提醒等聚合查询。
前台面板作为执行台子界面，数据来源于 scheduling、subject、workorder 等模块。
"""
from __future__ import annotations

import logging
from calendar import monthrange
from collections import defaultdict, deque
from datetime import date, datetime, time, timedelta
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


def _visit_point_allocates_sc(visit_point: str) -> bool:
    """
    签到时是否应分配 SC 排队号（与接待台访视点选项对齐）。
    仅匹配大写「V1」会漏掉中文「初筛」等，导致队列无 SC、叫号异常。
    """
    raw = (visit_point or '').strip()
    if not raw:
        return False
    u = raw.upper()
    if u in ('V0', 'V1'):
        return True
    if raw in ('初筛', '粗筛', '基线'):
        return True
    return False


def _map_appointments_to_checkins(
    appointments: list[SubjectAppointment],
    checkin_rows: list[SubjectCheckin],
) -> dict[int, Optional[SubjectCheckin]]:
    """
    每条当日预约映射至多一条签到：优先 project_code 与预约一致（同日同项目多条取 id 最大）；
    无匹配时按预约时间顺序 FIFO 消费「project_code 为空」的历史记录。
    """
    explicit: dict[tuple[int, str], SubjectCheckin] = {}
    for c in checkin_rows:
        pc = (c.project_code or '').strip().lower()
        if not pc:
            continue
        key = (c.subject_id, pc)
        prev = explicit.get(key)
        if prev is None or c.id > prev.id:
            explicit[key] = c

    by_subject_legacy: dict[int, deque[SubjectCheckin]] = defaultdict(deque)
    for c in checkin_rows:
        if (c.project_code or '').strip():
            continue
        by_subject_legacy[c.subject_id].append(c)
    for sid, dq in by_subject_legacy.items():
        sorted_rows = sorted(dq, key=lambda x: x.id)
        by_subject_legacy[sid] = deque(sorted_rows)

    def _appt_sort_key(a: SubjectAppointment):
        t = a.appointment_time
        if t is not None:
            return (0, t, a.id)
        return (1, time(0, 0), a.id)

    out: dict[int, Optional[SubjectCheckin]] = {}
    for appt in sorted(appointments, key=_appt_sort_key):
        sid = appt.subject_id
        pcp = (appt.project_code or '').strip().lower()
        chosen: Optional[SubjectCheckin] = None
        if pcp:
            chosen = explicit.get((sid, pcp))
        if chosen is None:
            leg = by_subject_legacy.get(sid)
            if leg:
                chosen = leg.popleft()
        out[appt.id] = chosen
    return out


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
        if _queue_status_rank(str(merged.get('status') or '')) < _queue_status_rank(str(fallback.get('status') or '')):
            merged['status'] = fallback['status']
        for _ck in ('checkin_id', 'checkin_time', 'checkout_time'):
            if not merged.get(_ck) and fallback.get(_ck):
                merged[_ck] = fallback[_ck]
        deduped[key] = merged

    items = list(deduped.values())
    for item in items:
        item.pop('_subject_phone', None)
    return items


def _determine_board_queue_status(appt: SubjectAppointment, board_rec: Optional[ReceptionBoardCheckin]) -> str:
    """接待看板队列状态：须有签到时间才算已签到；仅清空时间但保留行时视为待签到。"""
    if board_rec:
        if board_rec.checkout_time:
            return 'checked_out'
        if board_rec.checkin_time:
            return 'checked_in'
        return 'waiting'
    if appt.status == AppointmentStatus.NO_SHOW:
        return 'no_show'
    return 'waiting'


# 工单执行队列内存缓存（与 board 无关）：同一日历日内 stats + 多分页请求只构建一次全日队列
EXECUTION_QUEUE_CACHE_TTL = 10


def _execution_queue_cache_key(day: date) -> str:
    return f'cn_kis:v2:reception:exec_queue:{day.isoformat()}'


def invalidate_execution_queue_cache_for_date(day: Optional[date] = None) -> None:
    """签到/签出/过号等变更后丢弃当日执行队列缓存，避免卡片与表格短暂不一致。"""
    from django.core.cache import cache

    d = day or _local_today()
    cache.delete(_execution_queue_cache_key(d))


def _normalize_sc_for_queue_sort(raw: object) -> str:
    s = str(raw or '').strip()
    if not s or s in ('-', '—', '－'):
        return ''
    return s


def _today_queue_sort_key(item: dict) -> tuple:
    pc = (item.get('project_code') or '').strip()
    sc = _normalize_sc_for_queue_sort(item.get('sc_number'))
    has_sc_rank = 1 if not sc else 0
    appt_t = str(item.get('appointment_time') or '').strip()
    return (pc, has_sc_rank, sc, appt_t)


def _build_full_execution_queue_uncached(today: date) -> list[dict]:
    """构建当日 execution 源队列（未按项目筛选、已排序），供缓存与分页共用。"""
    appointments_qs = SubjectAppointment.objects.filter(
        appointment_date=today,
    ).exclude(
        status=AppointmentStatus.CANCELLED,
    ).select_related('subject', 'enrollment', 'enrollment__protocol').order_by('appointment_time')

    appointments = list(appointments_qs)

    _checkin_rows = list(
        SubjectCheckin.objects.filter(checkin_date=today).select_related('subject'),
    )
    appt_checkin_map = _map_appointments_to_checkins(appointments, _checkin_rows)

    queue: list[dict] = []
    for appt in appointments:
        checkin = appt_checkin_map.get(appt.id)
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

    unscheduled_checkins = SubjectCheckin.objects.filter(
        checkin_date=today,
    ).exclude(
        subject_id__in=[a.subject_id for a in appointments],
    ).select_related('subject')
    enrollment_protocol_map: dict[int, tuple[str, str]] = {}
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

    keys = [(item.get('subject_id'), (item.get('project_code') or '').strip()) for item in queue]
    keys = [(s, p) for s, p in keys if s is not None and p]
    sc_map: dict[tuple[int, str], SubjectProjectSC] = {}
    if keys:
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

    queue.sort(key=_today_queue_sort_key)
    return queue


def _name_pinyin_initials(name: str) -> str:
    """
    中文/混合姓名 → 拼音首字母（大写），与预约表 name_pinyin_initials 展示习惯一致。
    consent_service 补全列表字段时依赖此函数；勿删或改名。
    """
    raw = (name or '').strip()
    if not raw:
        return ''
    try:
        from pypinyin import Style, lazy_pinyin

        return ''.join(lazy_pinyin(raw, style=Style.FIRST_LETTER)).upper()[:50]
    except Exception:
        return ''


def _get_cached_full_execution_queue(today: date) -> list[dict]:
    """读取缓存的当日全日排序队列；返回每行浅拷贝，避免调用方原地修改污染缓存。"""
    from django.core.cache import cache

    key = _execution_queue_cache_key(today)
    hit = cache.get(key)
    if hit is not None:
        return [{**row} for row in hit]
    built = _build_full_execution_queue_uncached(today)
    cache.set(key, built, EXECUTION_QUEUE_CACHE_TTL)
    return [{**row} for row in built]


def get_today_queue(
    target_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 10,
    project_code: Optional[str] = None,
    visit_point: Optional[str] = None,
    source: str = 'execution',
) -> dict:
    """
    今日受试者队列：聚合预约 + 签到状态；排序为项目编号升序，同项目内先排有 SC 号的记录再排无 SC 的，再按 SC 号升序。
    支持分页（每页默认10条）、按项目编号筛选、按访视点精确筛选（去空白后与 visit_point 一致）。
    source: execution=工单执行（SubjectCheckin+SubjectProjectSC），board=接待看板（ReceptionBoardCheckin+ReceptionBoardProjectSc）
    两套数据完全独立，SC/RD号、签到签出时间互不影响。
    """
    today = target_date or _local_today()
    use_board = (source or 'execution').strip().lower() == 'board'

    # 工单执行：全日队列由缓存构建一次，分页与统计接口共用
    if not use_board:
        queue = _get_cached_full_execution_queue(today)
        # 今日队列仅展示有项目编号的记录（工单执行 / 接待看板统一口径）
        queue = [i for i in queue if (i.get('project_code') or '').strip()]
        if project_code and str(project_code).strip():
            pc_lower = str(project_code).strip().lower()
            queue = [i for i in queue if (i.get('project_code') or '').strip().lower() == pc_lower]
        if visit_point and str(visit_point).strip():
            vp = str(visit_point).strip()
            queue = [i for i in queue if (i.get('visit_point') or '').strip() == vp]
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

    # 接待看板（board）：与 execution 数据完全独立，不走路径缓存
    appointments_qs = SubjectAppointment.objects.filter(
        appointment_date=today,
    ).exclude(
        status=AppointmentStatus.CANCELLED,
    ).select_related('subject', 'enrollment', 'enrollment__protocol').order_by('appointment_time')

    if project_code:
        appointments_qs = appointments_qs.filter(project_code=project_code)
    if visit_point and str(visit_point).strip():
        appointments_qs = appointments_qs.filter(visit_point=str(visit_point).strip())

    appointments = list(appointments_qs)

    board_checkins_today = {
        c.subject_id: c for c in
        ReceptionBoardCheckin.objects.filter(checkin_date=today).select_related('subject')
    }

    queue: list[dict] = []
    for appt in appointments:
        board_rec = board_checkins_today.get(appt.subject_id)
        task_type = _determine_task_type(appt)
        status = _determine_board_queue_status(appt, board_rec)
        checkin_id = board_rec.id if board_rec else None
        checkin_time = board_rec.checkin_time.isoformat() if board_rec and board_rec.checkin_time else None
        checkout_time = board_rec.checkout_time.isoformat() if board_rec and board_rec.checkout_time else None

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

    unscheduled = ReceptionBoardCheckin.objects.filter(checkin_date=today).exclude(
        subject_id__in=[a.subject_id for a in appointments],
    ).select_related('subject')
    enrollment_protocol_map: dict[int, tuple[str, str]] = {}
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
            'status': (
                'checked_out'
                if board_rec.checkout_time
                else ('checked_in' if board_rec.checkin_time else 'waiting')
            ),
            'checkin_id': board_rec.id,
            'checkin_time': board_rec.checkin_time.isoformat() if board_rec.checkin_time else None,
            'checkout_time': board_rec.checkout_time.isoformat() if board_rec.checkout_time else None,
            'enrollment_id': None,
        })

    queue = _merge_duplicate_queue_items(queue, today)
    # 今日队列仅展示有项目编号的记录（工单执行 / 接待看板统一口径）
    queue = [i for i in queue if (i.get('project_code') or '').strip()]

    keys = [(item.get('subject_id'), (item.get('project_code') or '').strip()) for item in queue]
    keys = [(s, p) for s, p in keys if s is not None and p]
    sc_map: dict[tuple[int, str], ReceptionBoardProjectSc] = {}
    if keys:
        for rec in ReceptionBoardProjectSc.objects.filter(
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
    if visit_point and str(visit_point).strip():
        vp = str(visit_point).strip()
        queue = [i for i in queue if (i.get('visit_point') or '').strip() == vp]

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


def _build_queue_list_items(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    visit_point: Optional[str] = None,
) -> list[dict]:
    """
    预约队列明细（与 get_today_queue 同源字段），不含项目/状态/入组筛选。
    项目编号以预约+协议解析后的最终 project_code 为准（不在 DB 层按 project_code 过滤）。
    """
    appointments_qs = SubjectAppointment.objects.exclude(
        status=AppointmentStatus.CANCELLED,
    ).select_related('subject', 'enrollment', 'enrollment__protocol').order_by('-appointment_date', 'appointment_time', 'id')

    if date_from:
        appointments_qs = appointments_qs.filter(appointment_date__gte=date_from)
    if date_to:
        appointments_qs = appointments_qs.filter(appointment_date__lte=date_to)
    if visit_point and str(visit_point).strip():
        appointments_qs = appointments_qs.filter(visit_point=str(visit_point).strip())

    appointments = list(appointments_qs)
    if not appointments:
        return []

    subject_ids = {a.subject_id for a in appointments}
    date_keys = {a.appointment_date for a in appointments}
    checkin_rows = list(
        SubjectCheckin.objects.filter(
            subject_id__in=subject_ids,
            checkin_date__in=date_keys,
        ).select_related('subject'),
    )
    checkins_by_date: dict[date, list[SubjectCheckin]] = defaultdict(list)
    for c in checkin_rows:
        checkins_by_date[c.checkin_date].append(c)

    queue: list[dict] = []
    appts_by_date: dict[date, list[SubjectAppointment]] = defaultdict(list)
    for appt in appointments:
        appts_by_date[appt.appointment_date].append(appt)

    for d, appts in appts_by_date.items():
        appt_checkin_map = _map_appointments_to_checkins(appts, checkins_by_date.get(d, []))
        for appt in appts:
            checkin = appt_checkin_map.get(appt.id)
            project_name = getattr(appt, 'project_name', '') or ''
            project_code_val = getattr(appt, 'project_code', '') or ''
            if (
                not project_name
                and appt.enrollment_id
                and appt.enrollment
                and hasattr(appt.enrollment, 'protocol')
                and appt.enrollment.protocol
            ):
                p = appt.enrollment.protocol
                project_name = p.title or ''
                project_code_val = (p.code or '').strip()
            subj = appt.subject
            _phone = getattr(subj, 'phone', '') or '' if subj else ''
            queue.append({
                'appointment_id': appt.id,
                'appointment_date': appt.appointment_date.isoformat() if appt.appointment_date else '',
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
                'task_type': _determine_task_type(appt),
                'status': _determine_queue_status(appt, checkin),
                'checkin_id': checkin.id if checkin else None,
                'checkin_time': checkin.checkin_time.isoformat() if checkin and checkin.checkin_time else None,
                'checkout_time': checkin.checkout_time.isoformat() if checkin and checkin.checkout_time else None,
                'enrollment_id': appt.enrollment_id,
            })

    keys = [(item.get('subject_id'), (item.get('project_code') or '').strip()) for item in queue]
    keys = [(s, p) for s, p in keys if s is not None and p]
    sc_map: dict[tuple[int, str], SubjectProjectSC] = {}
    if keys:
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
            item['enrollment_status'] = ''

    queue.sort(key=lambda x: (
        str(x.get('appointment_date') or ''),
        str(x.get('project_code') or ''),
        str(x.get('appointment_time') or ''),
        int(x.get('appointment_id') or 0),
    ), reverse=True)
    return queue


def _filter_queue_list_items(
    queue: list[dict],
    project_code: Optional[str] = None,
    project_code_exact: bool = False,
    status: Optional[str] = None,
    enrollment_status: Optional[str] = None,
) -> list[dict]:
    """在已构建的队列条目上应用项目/状态/入组筛选（与 get_queue_list 一致）。"""
    out = queue
    if project_code and str(project_code).strip():
        pc = str(project_code).strip()
        if project_code_exact:
            out = [i for i in out if (i.get('project_code') or '').strip() == pc]
        else:
            ql = pc.lower()
            out = [i for i in out if ql in (i.get('project_code') or '').lower()]
    if status and str(status).strip().lower() not in ('', 'all'):
        st = str(status).strip().lower()
        out = [i for i in out if (i.get('status') or '').lower() == st]
    if enrollment_status is not None:
        es = str(enrollment_status).strip()
        if es and es.lower() not in ('all',):
            if es == '__none__':
                out = [i for i in out if not (i.get('enrollment_status') or '').strip()]
            else:
                out = [i for i in out if (i.get('enrollment_status') or '').strip() == es]
    return out


def get_queue_list(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    page_size: int = 10,
    project_code: Optional[str] = None,
    project_code_exact: bool = False,
    visit_point: Optional[str] = None,
    status: Optional[str] = None,
    enrollment_status: Optional[str] = None,
) -> dict:
    """
    队列明细（历史可查）：
    - 日期为空 => 全部日期
    - 项目编号：默认包含匹配（解析后 project_code）；project_code_exact=True 时为精确匹配
    - 可选 status / enrollment_status（enrollment_status=__none__ 表示无入组情况）
    """
    queue = _build_queue_list_items(date_from, date_to, visit_point)
    if not queue:
        return {
            'items': [],
            'total': 0,
            'page': page,
            'page_size': page_size,
            'date_from': str(date_from) if date_from else '',
            'date_to': str(date_to) if date_to else '',
        }

    queue = _filter_queue_list_items(
        queue,
        project_code=project_code,
        project_code_exact=project_code_exact,
        status=status,
        enrollment_status=enrollment_status,
    )

    total = len(queue)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = queue[start:end]
    for it in page_items:
        it.pop('_subject_phone', None)
    return {
        'items': page_items,
        'total': total,
        'page': page,
        'page_size': page_size,
        'date_from': str(date_from) if date_from else '',
        'date_to': str(date_to) if date_to else '',
    }


def get_queue_list_project_codes(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    visit_point: Optional[str] = None,
) -> dict:
    """当前日期范围/访视点下，队列中出现的去重项目编号（解析后），用于下拉选项。"""
    queue = _build_queue_list_items(date_from, date_to, visit_point)
    codes = sorted(
        {(i.get('project_code') or '').strip() for i in queue if (i.get('project_code') or '').strip()},
        key=lambda x: x.lower(),
    )
    return {'project_codes': codes}


def get_today_queue_export(
    target_date: Optional[date] = None,
    project_code: Optional[str] = None,
    visit_point: Optional[str] = None,
    status: Optional[str] = None,
    source: str = 'execution',
) -> dict:
    """
    今日队列导出数据：按日期/项目/状态筛选，含项目名称、项目编号、SC号、性别、年龄、手机号等（与 get_today_queue 条目一致）。
    返回完整列表（不分页）供前端生成 CSV/Excel。
    source: execution=工单执行，board=接待看板。
    """
    full = get_today_queue(
        target_date=target_date, page=1, page_size=99999,
        project_code=project_code, visit_point=visit_point, source=source,
    )
    items = full.get('items', [])
    if status and str(status).strip().lower() not in ('', 'all'):
        status_lower = str(status).strip().lower()
        items = [i for i in items if (i.get('status') or '').lower() == status_lower]
    return {'items': items, 'date': full.get('date', ''), 'total': len(items)}


def get_today_queue_project_summary(
    target_date: Optional[date] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    visit_point: Optional[str] = None,
    project_code: Optional[str] = None,
    page: int = 1,
    page_size: int = 10,
    source: str = 'execution',
    status: Optional[str] = None,
    enrollment_status: Optional[str] = None,
) -> dict:
    """
    按项目编号汇总当日队列：
    - 预约人数：该项目下队列条数
    - 状态：waiting/checked_in/in_progress/checked_out/no_show 计数
    - 入组情况：按 enrollment_status 文本计数
    与 get_queue_list 同源筛选（日期、访视点、项目含匹配、状态、入组情况）。
    """
    effective_from = date_from
    effective_to = date_to
    if target_date:
        effective_from = target_date
        effective_to = target_date
    full = get_queue_list(
        date_from=effective_from,
        date_to=effective_to,
        page=1,
        page_size=999999,
        project_code=project_code,
        project_code_exact=False,
        visit_point=visit_point,
        status=status,
        enrollment_status=enrollment_status,
    )
    items = full.get('items', [])
    summary_date = str(target_date) if target_date else ''
    grouped: dict[str, dict] = {}

    for it in items:
        project_code = (it.get('project_code') or '').strip()
        if not project_code:
            continue
        project_name = (it.get('project_name') or '').strip()
        rec = grouped.get(project_code)
        if rec is None:
            rec = {
                'project_code': project_code,
                'project_name': project_name,
                'appointment_count': 0,
                'status_counts': {
                    'waiting': 0,
                    'checked_in': 0,
                    'in_progress': 0,
                    'checked_out': 0,
                    'no_show': 0,
                },
                'enrollment_status_counts': {},
            }
            grouped[project_code] = rec

        rec['appointment_count'] += 1
        status = (it.get('status') or '').strip()
        if status in rec['status_counts']:
            rec['status_counts'][status] += 1

        enroll_st = (it.get('enrollment_status') or '').strip()
        if enroll_st:
            rec['enrollment_status_counts'][enroll_st] = rec['enrollment_status_counts'].get(enroll_st, 0) + 1

    summary_items = [grouped[k] for k in sorted(grouped.keys(), key=lambda x: x.lower())]
    total = len(summary_items)
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, int(page_size or 10))
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    page_items = summary_items[start:end]

    return {
        'date': summary_date,
        'total_projects': total,
        'total': total,
        'page': safe_page,
        'page_size': safe_page_size,
        'items': page_items,
    }


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


def _get_today_stats_board(today: date, project_code: Optional[str] = None) -> dict:
    """接待看板专用统计：与 get_today_queue(source=board) 同源，与工单执行 SubjectCheckin/SubjectProjectSC 无关。"""
    full = get_today_queue(
        target_date=today,
        page=1,
        page_size=99999,
        project_code=project_code,
        source='board',
    )
    items = full.get('items') or []
    total_appointments = int(full.get('total') or len(items))

    st_checked_in = sum(1 for i in items if (i.get('status') or '') == 'checked_in')
    st_in_progress = sum(1 for i in items if (i.get('status') or '') == 'in_progress')
    st_checked_out = sum(1 for i in items if (i.get('status') or '') == 'checked_out')
    st_no_show = sum(1 for i in items if (i.get('status') or '') == 'no_show')
    execution_count = st_checked_in + st_in_progress
    signed_in_count = st_checked_in + st_in_progress + st_checked_out

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
            enrollment_status_counts[s] += 1

    project_name_by_code: dict[str, str] = {}
    for it in items:
        pc = (it.get('project_code') or '').strip()
        if not pc:
            continue
        pname = (it.get('project_name') or pc or '').strip()
        project_name_by_code[pc] = pname or pc
    project_options = [
        {'code': c, 'name': project_name_by_code[c]}
        for c in sorted(
            project_name_by_code.keys(),
            key=lambda x: (project_name_by_code[x].lower(), x.lower()),
        )
    ]

    return {
        'date': str(today),
        'total_appointments': total_appointments,
        'checked_in': st_checked_in,
        'in_progress': execution_count,
        'checked_out': st_checked_out,
        'no_show': st_no_show,
        'total_signed_in': signed_in_count,
        'signed_in_count': signed_in_count,
        'walk_in_count': 0,
        'enrollment_status_counts': enrollment_status_counts,
        'project_options': project_options,
    }


def get_today_stats(
    target_date: Optional[date] = None,
    project_code: Optional[str] = None,
    source: str = 'execution',
) -> dict:
    """今日统计：预约数/已签到/执行中/已签出/缺席。支持按 project_code 过滤。
    source=execution 用工单执行数据；source=board 用接待看板数据（与工单执行独立）。
    """
    today = target_date or _local_today()
    if (source or 'execution').strip().lower() == 'board':
        return _get_today_stats_board(today, project_code)

    appt_qs = SubjectAppointment.objects.filter(
        appointment_date=today,
    ).exclude(status=AppointmentStatus.CANCELLED).exclude(
        Q(project_code__isnull=True) | Q(project_code=''),
    )
    if project_code:
        appt_qs = appt_qs.filter(project_code=project_code)
    dedupe_keys = set()
    for subject_id, phone, appt_project_code in appt_qs.select_related('subject').values_list('subject_id', 'subject__phone', 'project_code'):
        identity = (phone or '').strip() or f'id:{subject_id}'
        dedupe_keys.add((identity, (appt_project_code or '').strip().lower(), today.isoformat()))
    total_appointments = len(dedupe_keys)

    checkins = SubjectCheckin.objects.filter(checkin_date=today).exclude(
        Q(project_code__isnull=True) | Q(project_code=''),
    )
    if project_code and str(project_code).strip():
        # 与队列行一致：按签到记录上的 project_code 统计，避免同人多项目时串项
        checkins = checkins.filter(project_code__iexact=str(project_code).strip())

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
        .exclude(Q(project_code__isnull=True) | Q(project_code=''))
        .values_list('subject_id', flat=True)
    )
    walk_in_count = SubjectCheckin.objects.filter(
        checkin_date=today,
    ).exclude(
        Q(project_code__isnull=True) | Q(project_code=''),
    ).exclude(subject_id__in=all_appt_subject_ids).count()

    # 入组情况各状态数量（工单执行页卡片用）：与 today-queue（execution）共用缓存队列，避免重复构建
    items = _get_cached_full_execution_queue(today)
    items = [i for i in items if (i.get('project_code') or '').strip()]
    if project_code and str(project_code).strip():
        pc_lower = str(project_code).strip().lower()
        items = [i for i in items if (i.get('project_code') or '').strip().lower() == pc_lower]
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

    # 工单执行页项目筛选项：与 queue_full 同源，避免前端再发一次大包 today-queue 仅取项目列表
    project_name_by_code: dict[str, str] = {}
    for it in items:
        pc = (it.get('project_code') or '').strip()
        if not pc:
            continue
        pname = (it.get('project_name') or pc or '').strip()
        project_name_by_code[pc] = pname or pc
    project_options = [
        {'code': c, 'name': project_name_by_code[c]}
        for c in sorted(
            project_name_by_code.keys(),
            key=lambda x: (project_name_by_code[x].lower(), x.lower()),
        )
    ]

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
        'project_options': project_options,
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
    invalidate_execution_queue_cache_for_date(_local_today())


def _ensure_project_sc_on_checkin(
    subject_id: int,
    project_code: str,
    visit_point: str,
    operator_id: Optional[int],
) -> None:
    """确保受试者在该项目下有 SubjectProjectSC；初筛/V0/V1 等若 SC 为空则分配排队号。"""
    if not project_code:
        return
    if _visit_point_allocates_sc(visit_point):
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


def resolve_today_appointment_for_quick_checkin(
    subject_id: int,
    project_code: Optional[str] = None,
    target_date: Optional[date] = None,
) -> Optional[SubjectAppointment]:
    """与 quick_checkin 选取当日预约规则一致（CONFIRMED/PENDING）。在预约被标为 COMPLETED 之前调用，供小程序看板镜像带上下文。"""
    day = target_date or timezone.localdate()
    pc = (project_code or '').strip() or None
    appt_qs = SubjectAppointment.objects.filter(
        subject_id=subject_id,
        appointment_date=day,
        status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
    ).order_by('appointment_time', 'id')
    if pc:
        hit = appt_qs.filter(project_code__iexact=pc).first()
        return hit or appt_qs.first()
    return appt_qs.first()


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
    project_code: 多项目同天时，按项目区分签到记录；未传时从当日首条有效预约推导 project_code。
    """
    today = _local_today()
    arg_pc = (project_code or '').strip() or None
    appt = resolve_today_appointment_for_quick_checkin(subject_id, arg_pc, today)
    effective_pc = (arg_pc or (appt.project_code if appt else '') or '').strip()

    qs_open = SubjectCheckin.objects.filter(
        subject_id=subject_id,
        checkin_date=today,
    ).exclude(status=CheckinStatus.CHECKED_OUT)

    existing: Optional[SubjectCheckin] = None
    if effective_pc:
        existing = qs_open.filter(project_code__iexact=effective_pc).first()
    if existing is None:
        legacy_qs = qs_open.filter(Q(project_code='') | Q(project_code__isnull=True)).order_by('id')
        existing = legacy_qs.first()
        if existing is None and not effective_pc and qs_open.count() == 1:
            existing = qs_open.first()

    if existing is not None:
        if effective_pc:
            appt_sc = SubjectAppointment.objects.filter(
                subject_id=subject_id,
                appointment_date=today,
                project_code__iexact=effective_pc,
                status__in=[
                    AppointmentStatus.CONFIRMED,
                    AppointmentStatus.PENDING,
                    AppointmentStatus.COMPLETED,
                ],
            ).first()
            if appt_sc:
                visit_point_raw = (getattr(appt_sc, 'visit_point', '') or '').strip()
                _ensure_project_sc_on_checkin(subject_id, effective_pc, visit_point_raw, operator_id)
        invalidate_execution_queue_cache_for_date(today)
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
        project_code=effective_pc or '',
    )

    if appt:
        ap_pc = (appt.project_code or '').strip().lower()
        c_pc = (checkin.project_code or '').strip().lower()
        if ap_pc == c_pc or (not ap_pc and not c_pc):
            appt.status = AppointmentStatus.COMPLETED
            appt.save(update_fields=['status', 'update_time'])
            # SC 号：初筛/基线/V0/V1 等到院访视分配；同项目后续访视复用该 SC 号
            appt_project = (appt.project_code or '').strip()
            visit_point_raw = (getattr(appt, 'visit_point', '') or '').strip()
            if appt_project:
                if _visit_point_allocates_sc(visit_point_raw):
                    rec, created = SubjectProjectSC.objects.get_or_create(
                        subject_id=subject_id,
                        project_code=appt_project,
                        is_deleted=False,
                        defaults={
                            'sc_number': _next_sc_number_for_project(appt_project),
                            'created_by_id': operator_id,
                            'updated_by_id': operator_id,
                        },
                    )
                    if not created:
                        # 已有记录（如导入创建）：仅当 SC 为空时才生成
                        existing_sc = (rec.sc_number or '').strip()
                        if not existing_sc:
                            rec.sc_number = _next_sc_number_for_project(appt_project)
                            rec.updated_by_id = operator_id
                            rec.save(update_fields=['sc_number', 'updated_by_id', 'update_time'])
                        else:
                            rec.updated_by_id = operator_id
                            rec.save(update_fields=['update_time', 'updated_by_id'])
                else:
                    rec = SubjectProjectSC.objects.filter(
                        subject_id=subject_id,
                        project_code=appt_project,
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
    invalidate_execution_queue_cache_for_date(today)
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
ENROLLMENT_STATUS_WITHDRAWN = '退出'

# 未执行台签到时仍允许在队列中标记（接待台工单执行场景）
_ENROLLMENT_WITHOUT_CHECKIN = frozenset({ENROLLMENT_STATUS_ABSENT, ENROLLMENT_STATUS_WITHDRAWN})


def _has_execution_checkin_today_for_project(subject_id: int, project_code: str) -> bool:
    """当日该项目是否有过执行台签到（含已签出）；project_code 为空时退化为「当日任一条签到」。"""
    today = _local_today()
    pc = (project_code or '').strip()
    if not pc:
        return SubjectCheckin.objects.filter(subject_id=subject_id, checkin_date=today).exists()
    return SubjectCheckin.objects.filter(
        subject_id=subject_id,
        checkin_date=today,
    ).filter(
        Q(project_code__iexact=pc) | Q(project_code='') | Q(project_code__isnull=True),
    ).exists()


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
    无 SC 记录时：允许将入组情况设为「缺席」或「退出」（自动创建一条空 SC 记录）；
    其余状态须当日已有该项目执行台签到（或历史空 project_code 签到）。
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
        if want in _ENROLLMENT_WITHOUT_CHECKIN:
            rec, _ = SubjectProjectSC.objects.get_or_create(
                subject_id=subject_id,
                project_code=project_code,
                is_deleted=False,
                defaults={
                    'sc_number': '',
                    'rd_number': '',
                    'enrollment_status': want,
                    'created_by_id': operator_id,
                    'updated_by_id': operator_id,
                },
            )
        else:
            raise ValueError('未找到该受试者在当前项目下的 SC 记录，请先完成签到')
    update_fields = []
    if enrollment_status is not None:
        new_st = (enrollment_status or '').strip()
        if new_st and new_st not in _ENROLLMENT_WITHOUT_CHECKIN and not _has_execution_checkin_today_for_project(
            subject_id, project_code
        ):
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
    invalidate_execution_queue_cache_for_date(_local_today())
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
    invalidate_execution_queue_cache_for_date(checkin.checkin_date)
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
    appt_pc = (appt.project_code or '').strip()
    checkin, _ = SubjectCheckin.objects.get_or_create(
        subject_id=appt.subject_id,
        checkin_date=appt.appointment_date,
        project_code=appt_pc,
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
    invalidate_execution_queue_cache_for_date(appt.appointment_date)
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
    from ..services.subject_service import (
        create_subject as svc_create_subject,
        find_subjects_by_mobile_normalized,
        normalize_subject_phone,
        resolve_subject_for_mobile_session,
    )

    phone = (phone or '').strip()
    today = _local_today()

    subject = None
    n = normalize_subject_phone(phone)
    if n and find_subjects_by_mobile_normalized(n).exists():
        subject = resolve_subject_for_mobile_session(phone, today)
    if subject is None:
        subject = Subject.objects.filter(phone=phone, is_deleted=False).first()
    is_new_subject = False
    if not subject:
        try:
            subject = svc_create_subject(
                name=name or '临时受试者',
                gender=gender or '',
                phone=phone,
            )
            is_new_subject = True
        except ValueError:
            subject = resolve_subject_for_mobile_session(phone, today) or Subject.objects.filter(
                phone=phone, is_deleted=False
            ).first()
            if not subject:
                raise ValueError(
                    '该手机号已有受试者档案但无法自动关联，请从已有档案补录或联系管理员合并重复档。'
                ) from None
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
    if '初筛' in combined or '粗筛' in combined or 'pre_screening' in combined:
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


def first_open_execution_checkin_today(
    subject_id: int, target_date: Optional[date] = None
) -> Optional[SubjectCheckin]:
    """当日首条未结束执行台签到（非签出、非缺席），按签到时间 FIFO。"""
    day = target_date or _local_today()
    return (
        SubjectCheckin.objects.filter(subject_id=subject_id, checkin_date=day)
        .exclude(status__in=[CheckinStatus.CHECKED_OUT, CheckinStatus.NO_SHOW])
        .order_by('checkin_time', 'id')
        .select_related('subject')
        .first()
    )


def has_pending_appointments_for_checkin(subject_id: int, target_date: Optional[date] = None) -> bool:
    """当日是否仍有待到访预约（已确认/待确认），用于多项目场景下「上一项已签出」后仍可签下一项。"""
    day = target_date or _local_today()
    return SubjectAppointment.objects.filter(
        subject_id=subject_id,
        appointment_date=day,
        status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
    ).exists()


def scan_checkin_or_checkout(subject_id: int, qr_content: str = '', location: str = '') -> dict:
    """
    统一签到/签出接口：根据受试者当日状态智能判断执行签到或签出。
    多项目均未签出时，签出按签到时间 FIFO 最前一条。
    返回格式：{ 'action': 'checkin'|'checkout'|'already_checked_out', ... }
    """
    from .checkin_qrcode_service import validate_daily_checkin_qrcode
    if qr_content:
        valid, err = validate_daily_checkin_qrcode(qr_content)
        if not valid:
            raise ValueError(err)

    today = _local_today()
    first_open = first_open_execution_checkin_today(subject_id, today)

    if first_open is not None:
        result = quick_checkout(first_open.id)
        return {'action': 'checkout', **result}

    has_any = SubjectCheckin.objects.filter(subject_id=subject_id, checkin_date=today).exists()
    if not has_any or has_pending_appointments_for_checkin(subject_id, today):
        result = quick_checkin(
            subject_id, method='qr_scan', location=location or '', operator_id=None,
        )
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

    last_done = (
        SubjectCheckin.objects.filter(
            subject_id=subject_id,
            checkin_date=today,
            status=CheckinStatus.CHECKED_OUT,
        )
        .select_related('subject')
        .order_by('-checkout_time', '-id')
        .first()
    )
    ex = last_done
    return {
        'action': 'already_checked_out',
        'id': ex.id if ex else None,
        'subject_id': ex.subject_id if ex else subject_id,
        'subject_name': ex.subject.name if ex and ex.subject else '',
        'subject_no': ex.subject.subject_no if ex and ex.subject else '',
        'checkin_date': str(ex.checkin_date) if ex else str(today),
        'checkin_time': ex.checkin_time.isoformat() if ex and ex.checkin_time else None,
        'checkout_time': ex.checkout_time.isoformat() if ex and ex.checkout_time else None,
        'status': ex.status if ex else CheckinStatus.CHECKED_OUT,
    }


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
        'project_code': (getattr(checkin, 'project_code', None) or '').strip(),
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


def _next_board_rd_number_for_project(project_code: str) -> str:
    """接待看板该项目下正式入组 RD 号最大序号+1，格式 RD001、RD002...（与工单执行独立）。"""
    existing = ReceptionBoardProjectSc.objects.filter(
        project_code=project_code,
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


def _ensure_board_project_sc_on_checkin(
    subject_id: int,
    project_code: str,
    visit_point: str,
) -> None:
    """确保受试者在该项目下有 ReceptionBoardProjectSc；规则与工单执行 _visit_point_allocates_sc 一致（初筛/V0/V1 等分配 SC）。"""
    if not project_code:
        return
    if _visit_point_allocates_sc(visit_point):
        rec, created = ReceptionBoardProjectSc.objects.get_or_create(
            subject_id=subject_id,
            project_code=project_code,
            defaults={'sc_number': _next_board_sc_number_for_project(project_code)},
        )
        if not created:
            existing_sc = (rec.sc_number or '').strip()
            if not existing_sc:
                rec.sc_number = _next_board_sc_number_for_project(project_code)
                rec.save(update_fields=['sc_number', 'update_time'])
    else:
        ReceptionBoardProjectSc.objects.get_or_create(
            subject_id=subject_id,
            project_code=project_code,
            defaults={'sc_number': ''},
        )


def mirror_reception_board_after_miniprogram_checkin(
    subject_id: int,
    target_date: date,
    appt: Optional[SubjectAppointment],
) -> dict:
    """小程序 quick_checkin 成功后镜像接待看板（附录 B）。appt 须为签到前 resolve 的当日预约，可为 None（无预约签到）。"""
    now = timezone.now()
    defaults: dict = {'checkin_time': now}
    if appt is not None:
        defaults['appointment_id'] = appt.id

    rec, created = ReceptionBoardCheckin.objects.update_or_create(
        subject_id=subject_id,
        checkin_date=target_date,
        defaults=defaults,
    )

    if appt is not None:
        proj = (appt.project_code or '').strip()
        visit_point_raw = (getattr(appt, 'visit_point', '') or '').strip()
        if proj:
            _ensure_board_project_sc_on_checkin(subject_id, proj, visit_point_raw)

    return {
        'id': rec.id,
        'subject_id': rec.subject_id,
        'checkin_date': str(rec.checkin_date),
        'checkin_time': rec.checkin_time.isoformat() if rec.checkin_time else None,
        'checkout_time': rec.checkout_time.isoformat() if rec.checkout_time else None,
    }


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

    # 看板队列会展示非 CANCELLED 预约（含 COMPLETED），签到时取预约上下文也需覆盖 COMPLETED，
    # 否则会出现“有签到时间但无法分配 SC”的情况。
    appt_qs = SubjectAppointment.objects.filter(
        subject_id=subject_id,
        appointment_date=day,
        status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING, AppointmentStatus.COMPLETED],
    )
    appt = appt_qs.filter(project_code__iexact=pc).first() if pc else appt_qs.first()
    if not appt and pc:
        appt = appt_qs.first()

    # 二次签到时显式清空 checkout_time，避免保留上一次签出状态。
    defaults = {
        'checkin_time': now,
        'checkout_time': None,
        'appointment_id': appt.id if appt else None,
    }

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
            project_code__iexact=pc,
            status__in=[AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING, AppointmentStatus.COMPLETED],
        ).first()
        if appt_for_pc:
            visit_point = (getattr(appt_for_pc, 'visit_point', '') or '').strip()
            _ensure_board_project_sc_on_checkin(subject_id, pc, visit_point)
    elif appt and created:
        proj = (appt.project_code or '').strip()
        visit_point_raw = (getattr(appt, 'visit_point', '') or '').strip()
        if proj:
            _ensure_board_project_sc_on_checkin(subject_id, proj, visit_point_raw)

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
    need_rd_update = enrollment_status is not None or rd_number is not None
    if need_rd_update:
        effective_status = (rec.enrollment_status or '').strip()
        if effective_status == ENROLLMENT_STATUS_ENROLLED:
            val = (rd_number or '').strip() if rd_number is not None else ''
            existing_rd = (rec.rd_number or '').strip()
            # 与工单执行页一致：正式入组时，空值/仅 RD 且无已有值 => 自动生成 RD00x
            if (not val or val.upper() == 'RD') and not existing_rd:
                rec.rd_number = _next_board_rd_number_for_project(project_code)
            elif val and val.upper() != 'RD':
                rec.rd_number = val
        else:
            rec.rd_number = ''
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
