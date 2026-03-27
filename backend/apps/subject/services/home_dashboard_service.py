"""
小程序首页聚合：GET /my/home-dashboard（附录 A）

主项目规则、项目块字段、display_name 与文档 §1～§6 对齐。
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Tuple

from django.utils import timezone

from ..models import Enrollment, EnrollmentStatus, Subject
from ..models_execution import (
    AppointmentStatus,
    SubjectAppointment,
    ReceptionBoardCheckin,
    ReceptionBoardProjectSc,
)


def _appt_time_sort_key(appt: SubjectAppointment) -> Tuple[int, time]:
    """当日预约排序：有具体时间的在前（升序），无时间的在后（NULLS LAST）。"""
    t = appt.appointment_time
    if t is not None:
        return (0, t)
    return (1, time(0, 0))


def _latest_pinyin_initials_for_pc(subject_id: int, pc: str) -> str:
    """同一项目下最近一条非空预约的拼音首字母（与接待台/扫码登记一致）。"""
    pc = (pc or '').strip()
    if not pc:
        return ''
    for a in (
        SubjectAppointment.objects.filter(subject_id=subject_id, project_code=pc)
        .order_by('-appointment_date', '-id')
        .only('name_pinyin_initials')[:30]
    ):
        raw = (getattr(a, 'name_pinyin_initials', None) or '').strip()
        if raw:
            return raw
    return ''


def _format_sc_display(raw: str) -> str:
    s = (raw or '').strip()
    if not s:
        return ''
    u = s.upper()
    if u.startswith('SC'):
        rest = s[2:].strip()
        if rest.isdigit():
            return 'SC' + rest.zfill(3)
        return 'SC' + rest if rest else 'SC'
    if s.isdigit():
        return 'SC' + s.zfill(3)
    return s


def _queue_checkin_today(subject_id: int, as_of: date) -> str:
    rows = list(
        ReceptionBoardCheckin.objects.filter(subject_id=subject_id, checkin_date=as_of).order_by(
            '-checkin_time', '-id'
        )
    )
    if not rows:
        return 'none'
    for r in rows:
        if r.checkin_time and not r.checkout_time:
            return 'checked_in'
    top = rows[0]
    if top.checkout_time:
        return 'checked_out'
    return 'none'


def _appointments_on_and_after(subject_id: int, as_of: date) -> List[SubjectAppointment]:
    return list(
        SubjectAppointment.objects.filter(
            subject_id=subject_id,
            appointment_date__gte=as_of,
        )
        .exclude(status=AppointmentStatus.CANCELLED)
        .select_related('enrollment', 'enrollment__protocol')
    )


def _primary_project_code(subject_id: int, as_of: date, appts_all: List[SubjectAppointment]) -> Optional[str]:
    """附录 A §3，按优先级短路。"""
    # 1) 当日进行中签到 → 当日预约映射 project_code
    active_exists = ReceptionBoardCheckin.objects.filter(
        subject_id=subject_id,
        checkin_date=as_of,
        checkin_time__isnull=False,
        checkout_time__isnull=True,
    ).exists()
    if active_exists:
        day_appts = [a for a in appts_all if a.appointment_date == as_of]
        completed = [
            a
            for a in day_appts
            if a.status == AppointmentStatus.COMPLETED and (a.project_code or '').strip()
        ]
        if completed:
            completed.sort(key=_appt_time_sort_key)
            return (completed[0].project_code or '').strip()
        with_code = [a for a in day_appts if (a.project_code or '').strip()]
        if with_code:
            with_code.sort(key=_appt_time_sort_key)
            return (with_code[0].project_code or '').strip()
        # 无法映射则进入 2)

    # 2) 当日有效预约（非 cancelled 已在 appts_all 过滤，当日子集）
    day_appts = [a for a in appts_all if a.appointment_date == as_of]
    if day_appts:
        day_appts = [a for a in day_appts if (a.project_code or '').strip()]
        if day_appts:
            day_appts.sort(key=_appt_time_sort_key)
            return (day_appts[0].project_code or '').strip()

    # 3) 未来预约
    future = [a for a in appts_all if a.appointment_date > as_of and (a.project_code or '').strip()]
    if future:
        future.sort(key=lambda a: (a.appointment_date, _appt_time_sort_key(a)))
        return (future[0].project_code or '').strip()

    # 4) ReceptionBoardProjectSc 最新 update_time
    sc = (
        ReceptionBoardProjectSc.objects.filter(subject_id=subject_id)
        .order_by('-update_time', '-id')
        .first()
    )
    if sc and (sc.project_code or '').strip():
        return (sc.project_code or '').strip()

    # 5) 仅 Enrollment enrolled，最近 enrolled_at
    en = (
        Enrollment.objects.filter(subject_id=subject_id, status=EnrollmentStatus.ENROLLED)
        .select_related('protocol')
        .order_by('-enrolled_at', '-id')
        .first()
    )
    if en and en.protocol and (en.protocol.code or '').strip():
        return (en.protocol.code or '').strip()

    return None


def _compute_display_name(subject: Subject, appts_today: List[SubjectAppointment]) -> Tuple[str, str]:
    """附录 A §4 / §2.2：档案名 → 当日预约 liaison → 账号微信昵称 → fallback。"""
    name = (subject.name or '').strip()
    if name and name != '微信用户':
        return name, 'subject'

    if appts_today:
        sorted_ap = sorted(appts_today, key=_appt_time_sort_key)
        first = sorted_ap[0]
        liaison = (getattr(first, 'liaison', '') or '').strip()
        if liaison:
            return liaison, 'appointment'
        return '受试者', 'appointment'

    account = getattr(subject, 'account', None)
    if account is not None:
        nick = (getattr(account, 'display_name', '') or '').strip()
        if nick:
            return nick, 'wechat_nickname'

    return '受试者', 'fallback'


def compute_subject_display_name(subject: Subject, as_of: date) -> Tuple[str, str]:
    """与 GET /my/home-dashboard、GET /my/profile 共用的问候展示名（§2.2、附录 A §4）。"""
    appts_today = list(
        SubjectAppointment.objects.filter(
            subject_id=subject.pk,
            appointment_date=as_of,
        ).exclude(status=AppointmentStatus.CANCELLED)
    )
    return _compute_display_name(subject, appts_today)


def _resolve_enrollment_for_block(
    pc: str,
    ap_pc: List[SubjectAppointment],
    enroll_map: Dict[str, Enrollment],
) -> Optional[Enrollment]:
    """预约里可能填错 project_code（如手写简称）；优先按 code 命中入组，否则用预约关联的 enrollment。"""
    e = enroll_map.get(pc)
    if e is not None:
        return e
    for a in ap_pc:
        en = getattr(a, 'enrollment', None)
        if en is not None:
            return en
    return None


def _resolve_sc_rec(
    pc: str,
    sc_map: Dict[str, ReceptionBoardProjectSc],
    en: Optional[Enrollment],
) -> Optional[ReceptionBoardProjectSc]:
    r = sc_map.get(pc)
    if r is not None:
        return r
    if en and en.protocol and (en.protocol.code or '').strip():
        return sc_map.get((en.protocol.code or '').strip())
    return None


def _display_project_code(pc: str, en: Optional[Enrollment]) -> str:
    """对外展示以方案 Protocol.code 为准，避免预约/导入里填成「测6065004」等错误编号。"""
    if en and en.protocol and (en.protocol.code or '').strip():
        return (en.protocol.code or '').strip()
    return pc


def _dashboard_enrollment_status_label(sc_rec: Optional[ReceptionBoardProjectSc], en: Optional[Enrollment]) -> str:
    """入组状态：优先接待看板 ReceptionBoardProjectSc（初筛合格/正式入组等），无 SC 时用入组记录状态文案。"""
    if sc_rec and (sc_rec.enrollment_status or '').strip():
        return (sc_rec.enrollment_status or '').strip()
    if en:
        return (en.get_status_display() or '').strip()
    return ''


def _enrollment_by_project_map(subject_id: int) -> Dict[str, Enrollment]:
    """每个 project_code 一条：优先 enrolled，否则 pending；同状态取最近 enrolled_at / create_time。"""
    rows = list(
        Enrollment.objects.filter(
            subject_id=subject_id,
            status__in=[EnrollmentStatus.ENROLLED, EnrollmentStatus.PENDING],
        ).select_related('protocol')
    )
    best: Dict[str, Enrollment] = {}
    for e in rows:
        if not e.protocol:
            continue
        pc = (e.protocol.code or '').strip()
        if not pc:
            continue
        cur = best.get(pc)
        if cur is None:
            best[pc] = e
            continue
        if cur.status != EnrollmentStatus.ENROLLED and e.status == EnrollmentStatus.ENROLLED:
            best[pc] = e
            continue
        if cur.status == EnrollmentStatus.ENROLLED and e.status != EnrollmentStatus.ENROLLED:
            continue
        cur_t = cur.enrolled_at or cur.create_time
        e_t = e.enrolled_at or e.create_time
        if e_t and (not cur_t or e_t > cur_t):
            best[pc] = e
    return best


def build_home_dashboard_data(subject: Subject, as_of: date) -> Dict[str, Any]:
    subject_id = subject.id
    appts_all = _appointments_on_and_after(subject_id, as_of)
    appts_today = [a for a in appts_all if a.appointment_date == as_of]

    display_name, display_name_source = _compute_display_name(subject, appts_today)

    # 全量 project_code 集合
    codes: set[str] = set()
    for a in appts_all:
        c = (a.project_code or '').strip()
        if c:
            codes.add(c)
    sc_rows = list(ReceptionBoardProjectSc.objects.filter(subject_id=subject_id))
    for rec in sc_rows:
        c = (rec.project_code or '').strip()
        if c:
            codes.add(c)
    sc_map = {(r.project_code or '').strip(): r for r in sc_rows if (r.project_code or '').strip()}

    enroll_map = _enrollment_by_project_map(subject_id)
    for pc in enroll_map:
        if (pc or '').strip():
            codes.add(pc.strip())

    q_today = _queue_checkin_today(subject_id, as_of)
    primary_pc = _primary_project_code(subject_id, as_of, appts_all)

    # 按项目 code 索引预约，便于取「当日 / 最近未来」
    def appts_for_pc(pc: str) -> List[SubjectAppointment]:
        return [a for a in appts_all if (a.project_code or '').strip() == pc]

    blocks_by_pc: Dict[str, Dict[str, Any]] = {}

    for pc in sorted(codes):
        ap_pc = appts_for_pc(pc)
        day_list = [a for a in ap_pc if a.appointment_date == as_of]
        day_list.sort(key=_appt_time_sort_key)
        ap_day = day_list[0] if day_list else None

        future_list = [a for a in ap_pc if a.appointment_date > as_of]
        future_list.sort(key=lambda a: (a.appointment_date, _appt_time_sort_key(a)))
        ap_future = future_list[0] if future_list else None

        en = _resolve_enrollment_for_block(pc, ap_pc, enroll_map)
        sc_rec = _resolve_sc_rec(pc, sc_map, en)

        if ap_day:
            visit_point = (ap_day.visit_point or '').strip()
            appointment_id = ap_day.id
            project_name = (ap_day.project_name or '').strip()
        elif ap_future:
            visit_point = ''
            appointment_id = None
            project_name = (ap_future.project_name or '').strip()
        else:
            visit_point = ''
            appointment_id = None
            project_name = ''

        if not project_name and en and en.protocol:
            project_name = (en.protocol.title or '').strip()
        if not project_name:
            project_name = pc

        enrollment_status = _dashboard_enrollment_status_label(sc_rec, en)
        sc_number = (sc_rec.sc_number or '').strip() if sc_rec else ''
        name_pinyin_initials = _latest_pinyin_initials_for_pc(subject_id, pc)

        blocks_by_pc[pc] = {
            'project_code': _display_project_code(pc, en),
            'project_name': project_name,
            'visit_point': visit_point,
            'appointment_id': appointment_id,
            'enrollment_status': enrollment_status,
            'sc_number': sc_number,
            'sc_display': _format_sc_display(sc_number),
            'name_pinyin_initials': name_pinyin_initials,
            'queue_checkin_today': q_today,
            'enrollment_id': en.id if en else None,
            'protocol_id': en.protocol_id if en else None,
        }

    ordered_codes = sorted(codes)
    project_blocks: List[Dict[str, Any]] = [blocks_by_pc[c] for c in ordered_codes]

    primary_block: Optional[Dict[str, Any]] = None
    if primary_pc and primary_pc in blocks_by_pc:
        primary_block = {**blocks_by_pc[primary_pc]}

    if primary_pc:
        other_projects = [dict(b) for b in project_blocks if b['project_code'] != primary_pc]
    else:
        other_projects = [dict(b) for b in project_blocks]

    projects_ordered: List[Dict[str, Any]] = []
    if primary_pc and primary_pc in blocks_by_pc:
        projects_ordered.append({**blocks_by_pc[primary_pc], 'is_primary': True})
        for b in project_blocks:
            if b['project_code'] == primary_pc:
                continue
            projects_ordered.append({**b, 'is_primary': False})
    else:
        for b in project_blocks:
            projects_ordered.append({**b, 'is_primary': False})

    return {
        'as_of_date': as_of.isoformat(),
        'display_name': display_name,
        'display_name_source': display_name_source,
        'primary_project': primary_block,
        'other_projects': other_projects,
        'projects_ordered': projects_ordered,
    }
