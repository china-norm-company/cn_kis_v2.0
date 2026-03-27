"""
初筛状态变更后，与预约管理（SubjectAppointment）及按项目 SC（SubjectProjectSC）对齐的可选钩子。

环境变量 PRESCREEN_APPOINTMENT_SYNC=1（或 true/yes）时，在初筛完成、PI 复核等路径调用本模块；
默认关闭，避免未完成联调时误写预约/项目行。

实现约定：
- Protocol.code 与 SubjectAppointment.project_code 一致后再写入预约与 SubjectProjectSC；
- 失败仅打日志，不向上抛出，避免阻断初筛主流程。
"""
from __future__ import annotations

import logging
from django.conf import settings

from ..models_recruitment import PreScreeningRecord, PreScreeningResult
from ..models_execution import (
    AppointmentStatus,
    EnrollmentStatusSC,
    SubjectAppointment,
    SubjectProjectSC,
)
from .execution_service import create_appointment

logger = logging.getLogger(__name__)

# 与接待台 / 执行模块展示一致：正式筛选预约
PURPOSE_FORMAL_SCREENING = '正式筛选（初筛通过）'
VISIT_POINT_SCREENING = '筛选'


def sync_after_prescreening_state_change(
    record: PreScreeningRecord,
    *,
    source: str,
) -> None:
    """
    在 PreScreeningRecord 及相关 Registration/Subject 已保存后调用。

    :param source: 调用来源，如 complete / review，便于审计与排障。
    """
    if not getattr(settings, 'PRESCREEN_APPOINTMENT_SYNC', False):
        return

    rid = record.pk
    try:
        record = PreScreeningRecord.objects.select_related('protocol', 'subject').get(pk=rid)
        if record.result == PreScreeningResult.PASS:
            _sync_pass(record, source=source)
        elif record.result in (PreScreeningResult.FAIL, PreScreeningResult.REFER):
            _sync_fail_or_refer(record, source=source)
    except Exception:
        logger.exception(
            'PRESCREEN_APPOINTMENT_SYNC failed record_id=%s source=%s',
            rid,
            source,
        )


def _project_code(record: PreScreeningRecord) -> str:
    if not record.protocol_id or not record.protocol:
        return ''
    return (record.protocol.code or '').strip()


def _sync_pass(record: PreScreeningRecord, *, source: str) -> None:
    pc = _project_code(record)
    if not pc:
        logger.warning(
            'PRESCREEN_APPOINTMENT_SYNC: 协议编号为空，跳过预约/SC 同步 record=%s',
            record.pre_screening_no,
        )
        return

    protocol = record.protocol
    subject = record.subject
    title = (protocol.title or '').strip() if protocol else ''

    appt: SubjectAppointment | None = None
    if record.screening_appointment_id:
        appt = SubjectAppointment.objects.filter(id=record.screening_appointment_id).first()

    if appt is None:
        appt = (
            SubjectAppointment.objects.filter(
                subject_id=subject.id,
                project_code=pc,
                visit_point=VISIT_POINT_SCREENING,
                purpose=PURPOSE_FORMAL_SCREENING,
            )
            .order_by('-id')
            .first()
        )

    if appt is None:
        appt = create_appointment(
            subject_id=subject.id,
            appointment_date=record.pre_screening_date,
            purpose=PURPOSE_FORMAL_SCREENING,
            visit_point=VISIT_POINT_SCREENING,
            project_code=pc,
            project_name=title,
        )
        appt.status = AppointmentStatus.CONFIRMED
        appt.save(update_fields=['status', 'update_time'])
    else:
        update_fields: list[str] = []
        if (appt.project_name or '') != title:
            appt.project_name = title
            update_fields.append('project_name')
        if (appt.project_code or '') != pc:
            appt.project_code = pc
            update_fields.append('project_code')
        if appt.visit_point != VISIT_POINT_SCREENING:
            appt.visit_point = VISIT_POINT_SCREENING
            update_fields.append('visit_point')
        if appt.purpose != PURPOSE_FORMAL_SCREENING:
            appt.purpose = PURPOSE_FORMAL_SCREENING
            update_fields.append('purpose')
        if appt.status == AppointmentStatus.CANCELLED:
            appt.status = AppointmentStatus.CONFIRMED
            update_fields.append('status')
        if update_fields:
            update_fields.append('update_time')
            appt.save(update_fields=update_fields)

    if record.screening_appointment_id != appt.id:
        record.screening_appointment_id = appt.id
        record.save(update_fields=['screening_appointment_id', 'update_time'])

    sc, _created = SubjectProjectSC.objects.get_or_create(
        subject_id=subject.id,
        project_code=pc,
        defaults={
            'enrollment_status': EnrollmentStatusSC.PRE_SCREEN_PASS,
        },
    )
    if sc.enrollment_status != EnrollmentStatusSC.PRE_SCREEN_PASS:
        sc.enrollment_status = EnrollmentStatusSC.PRE_SCREEN_PASS
        sc.save(update_fields=['enrollment_status', 'update_time'])

    logger.info(
        'PRESCREEN_APPOINTMENT_SYNC: pass record=%s source=%s appointment_id=%s project_code=%s',
        record.pre_screening_no,
        source,
        appt.id,
        pc,
    )


def _sync_fail_or_refer(record: PreScreeningRecord, *, source: str) -> None:
    pc = _project_code(record)
    if not pc:
        logger.warning(
            'PRESCREEN_APPOINTMENT_SYNC: 协议编号为空，跳过不合格 SC 同步 record=%s',
            record.pre_screening_no,
        )
        return

    subject = record.subject

    if record.screening_appointment_id:
        appt = SubjectAppointment.objects.filter(id=record.screening_appointment_id).first()
        if appt and appt.status in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
            appt.status = AppointmentStatus.CANCELLED
            appt.save(update_fields=['status', 'update_time'])

    sc, created = SubjectProjectSC.objects.get_or_create(
        subject_id=subject.id,
        project_code=pc,
        defaults={'enrollment_status': EnrollmentStatusSC.DISQUALIFIED},
    )
    if not created and sc.enrollment_status != EnrollmentStatusSC.DISQUALIFIED:
        sc.enrollment_status = EnrollmentStatusSC.DISQUALIFIED
        sc.save(update_fields=['enrollment_status', 'update_time'])

    logger.info(
        'PRESCREEN_APPOINTMENT_SYNC: fail/refer record=%s source=%s result=%s project_code=%s',
        record.pre_screening_no,
        source,
        record.result,
        pc,
    )
