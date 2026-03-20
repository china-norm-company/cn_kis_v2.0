"""
时序数据服务

包含：时序数据 CRUD、时间线聚合查询、RWE 数据脱敏导出。
"""
import logging
from typing import Optional
from datetime import datetime, timedelta
from itertools import chain
from django.utils import timezone

from ..models_timeseries import (
    VitalSignRecord, BodyMetricRecord,
    LabResultRecord, SkinMeasurementRecord,
)

logger = logging.getLogger(__name__)

TIMESERIES_MODELS = {
    'vital_sign': VitalSignRecord,
    'body_metric': BodyMetricRecord,
    'lab_result': LabResultRecord,
    'skin_measurement': SkinMeasurementRecord,
}


# ============================================================================
# 通用 CRUD
# ============================================================================
def create_record(record_type: str, subject_id: int, measured_at, **kwargs):
    """创建时序数据记录"""
    model = TIMESERIES_MODELS.get(record_type)
    if not model:
        raise ValueError(f'不支持的记录类型: {record_type}')
    return model.objects.create(subject_id=subject_id, measured_at=measured_at, **kwargs)


def list_records(record_type: str, subject_id: int, enrollment_id: int = None,
                 date_from: datetime = None, date_to: datetime = None) -> list:
    """查询时序数据"""
    model = TIMESERIES_MODELS.get(record_type)
    if not model:
        return []
    qs = model.objects.filter(subject_id=subject_id)
    if enrollment_id:
        qs = qs.filter(enrollment_id=enrollment_id)
    if date_from:
        qs = qs.filter(measured_at__gte=date_from)
    if date_to:
        qs = qs.filter(measured_at__lte=date_to)
    return list(qs.order_by('-measured_at'))


# ============================================================================
# 时间线聚合查询
# ============================================================================
def get_subject_timeline(subject_id: int, date_from: datetime = None,
                         date_to: datetime = None, limit: int = 100) -> list:
    """
    获取受试者时间线（跨项目、跨数据类型聚合）

    返回按时间倒序排列的所有时序数据事件。
    """
    events = []

    for record_type, model in TIMESERIES_MODELS.items():
        qs = model.objects.filter(subject_id=subject_id)
        if date_from:
            qs = qs.filter(measured_at__gte=date_from)
        if date_to:
            qs = qs.filter(measured_at__lte=date_to)
        for record in qs.order_by('-measured_at')[:limit]:
            event = {
                'type': record_type,
                'id': record.id,
                'measured_at': record.measured_at.isoformat(),
                'source': record.source,
                'enrollment_id': record.enrollment_id,
                'work_order_id': record.work_order_id,
            }
            if record_type == 'vital_sign':
                event['summary'] = f'BP {record.systolic_bp}/{record.diastolic_bp}, HR {record.heart_rate}'
            elif record_type == 'body_metric':
                event['summary'] = f'H {record.height}cm, W {record.weight}kg, BMI {record.bmi}'
            elif record_type == 'lab_result':
                flag = ' [异常]' if record.is_abnormal else ''
                event['summary'] = f'{record.test_name}: {record.result_value} {record.unit}{flag}'
            elif record_type == 'skin_measurement':
                event['summary'] = f'{record.measurement_site} - {record.instrument}'
            events.append(event)

    events.sort(key=lambda e: e['measured_at'], reverse=True)
    return events[:limit]


# ============================================================================
# RWE 数据导出（脱敏）
# ============================================================================
def export_rwe_data(subject_ids: list = None, date_from: datetime = None,
                    date_to: datetime = None) -> dict:
    """
    导出 RWE 就绪的脱敏数据

    规则：
    - 仅导出 consent_rwe_usage=True 的受试者
    - L1 字段（姓名、身份证、手机号）完全移除
    - L2 字段（地址）移除
    - 使用 subject_no 作为唯一标识（非 id）
    """
    from ..models import Subject
    from ..models_profile import SubjectProfile

    qs = SubjectProfile.objects.filter(consent_rwe_usage=True)
    if subject_ids:
        qs = qs.filter(subject_id__in=subject_ids)
    consented_subject_ids = list(qs.values_list('subject_id', flat=True))

    if not consented_subject_ids:
        return {'subjects': [], 'records': {}}

    subjects_data = []
    for s in Subject.objects.filter(id__in=consented_subject_ids, is_deleted=False):
        profile = SubjectProfile.objects.filter(subject_id=s.id).first()
        subjects_data.append({
            'subject_no': s.subject_no,
            'gender': s.gender,
            'age': profile.age if profile else s.age,
            'ethnicity': profile.ethnicity if profile else '',
            'education': profile.education if profile else '',
            'occupation': profile.occupation if profile else '',
        })

    records_data = {}
    for record_type, model in TIMESERIES_MODELS.items():
        qs = model.objects.filter(subject_id__in=consented_subject_ids)
        if date_from:
            qs = qs.filter(measured_at__gte=date_from)
        if date_to:
            qs = qs.filter(measured_at__lte=date_to)

        items = []
        subject_no_map = dict(
            Subject.objects.filter(id__in=consented_subject_ids).values_list('id', 'subject_no')
        )
        for record in qs.order_by('measured_at'):
            data = {'subject_no': subject_no_map.get(record.subject_id, '')}
            data['measured_at'] = record.measured_at.isoformat()
            data['source'] = record.source

            for field in record._meta.get_fields():
                if field.name in ('id', 'subject', 'subject_id', 'enrollment', 'enrollment_id',
                                  'work_order', 'work_order_id', 'operator_id', 'notes',
                                  'create_time', 'update_time', 'measured_at', 'source'):
                    continue
                if hasattr(field, 'attname'):
                    val = getattr(record, field.attname, None)
                    if val is not None:
                        if hasattr(val, 'isoformat'):
                            val = val.isoformat()
                        data[field.name] = val
            items.append(data)

        if items:
            records_data[record_type] = items

    return {'subjects': subjects_data, 'records': records_data}


STAGE_ORDER = [
    'registration', 'pre_screening', 'screening', 'enrollment',
    'appointment', 'checkin', 'execution', 'checkout',
    'questionnaire', 'support', 'followup', 'completion', 'withdrawal',
]


def get_subject_journey(subject_id: int, date_from: datetime = None, date_to: datetime = None) -> dict:
    """受试者 13 阶段轨迹聚合。"""
    from ..models import Enrollment, Subject
    from ..models_execution import SubjectAppointment, SubjectCheckin, SubjectSupportTicket, SubjectQuestionnaire
    from ..models_recruitment import SubjectRegistration, PreScreeningRecord, ScreeningRecord
    from apps.workorder.models import WorkOrder

    def _in_range(dt):
        if not dt:
            return False
        if date_from and dt < date_from:
            return False
        if date_to and dt > date_to:
            return False
        return True

    events = []
    subject = Subject.objects.filter(id=subject_id, is_deleted=False).first()
    regs = SubjectRegistration.objects.filter(phone=subject.phone) if subject and subject.phone else SubjectRegistration.objects.none()
    for reg in regs:
        if _in_range(reg.create_time):
            events.append({
                'stage': 'registration',
                'time': reg.create_time.isoformat(),
                'title': f'提交报名 {reg.registration_no}',
                'status': reg.status,
            })
        pre = PreScreeningRecord.objects.filter(registration=reg).order_by('-create_time').first()
        if pre and _in_range(pre.create_time):
            events.append({
                'stage': 'pre_screening',
                'time': pre.create_time.isoformat(),
                'title': '粗筛结果',
                'status': pre.result,
            })
        scr = ScreeningRecord.objects.filter(registration=reg).order_by('-create_time').first()
        if scr and _in_range(scr.create_time):
            events.append({
                'stage': 'screening',
                'time': scr.create_time.isoformat(),
                'title': '筛选结果',
                'status': scr.result,
            })

    enrollments = Enrollment.objects.filter(subject_id=subject_id).order_by('create_time')
    enrollment_ids = list(enrollments.values_list('id', flat=True))
    for en in enrollments:
        if _in_range(en.create_time):
            events.append({
                'stage': 'enrollment',
                'time': en.create_time.isoformat(),
                'title': f'入组 #{en.id}',
                'status': en.status,
            })

    for appt in SubjectAppointment.objects.filter(subject_id=subject_id).order_by('create_time'):
        if _in_range(appt.create_time):
            events.append({
                'stage': 'appointment',
                'time': appt.create_time.isoformat(),
                'title': f'预约 {appt.appointment_date}',
                'status': appt.status,
            })

    checkins = SubjectCheckin.objects.filter(subject_id=subject_id).order_by('checkin_time')
    for ci in checkins:
        if ci.checkin_time and _in_range(ci.checkin_time):
            events.append({'stage': 'checkin', 'time': ci.checkin_time.isoformat(), 'title': '签到', 'status': ci.status})
        if ci.checkout_time and _in_range(ci.checkout_time):
            events.append({'stage': 'checkout', 'time': ci.checkout_time.isoformat(), 'title': '签出', 'status': ci.status})

    for wo in WorkOrder.objects.filter(enrollment_id__in=enrollment_ids, is_deleted=False).order_by('create_time'):
        if _in_range(wo.create_time):
            events.append({
                'stage': 'execution',
                'time': wo.create_time.isoformat(),
                'title': f'工单 {wo.title}',
                'status': wo.status,
            })

    for q in SubjectQuestionnaire.objects.filter(subject_id=subject_id).order_by('create_time'):
        if _in_range(q.create_time):
            events.append({
                'stage': 'questionnaire',
                'time': q.create_time.isoformat(),
                'title': q.title,
                'status': q.status,
            })

    for t in SubjectSupportTicket.objects.filter(subject_id=subject_id).order_by('create_time'):
        if _in_range(t.create_time):
            events.append({
                'stage': 'support',
                'time': t.create_time.isoformat(),
                'title': t.title,
                'status': t.status,
            })

    for en in enrollments:
        if en.status == 'completed':
            ts = en.update_time if hasattr(en, 'update_time') else en.create_time
            if _in_range(ts):
                events.append({'stage': 'completion', 'time': ts.isoformat(), 'title': '项目结项', 'status': 'completed'})
    if subject and subject.status == 'withdrawn' and _in_range(subject.update_time):
        events.append({'stage': 'withdrawal', 'time': subject.update_time.isoformat(), 'title': '主动退出', 'status': 'withdrawn'})

    events.sort(key=lambda x: x['time'])
    stage_stats = {stage: 0 for stage in STAGE_ORDER}
    for event in events:
        stage_stats[event['stage']] = stage_stats.get(event['stage'], 0) + 1

    return {'events': events, 'stage_stats': stage_stats}


def get_journey_stage_stats(date_from: datetime = None, date_to: datetime = None) -> dict:
    """全局阶段统计，供分析看板使用。"""
    from ..models_execution import SubjectCheckin, SubjectSupportTicket
    from ..models import Subject
    now = timezone.now()
    start = date_from or (now - timedelta(days=30))
    end = date_to or now

    checkins = SubjectCheckin.objects.filter(checkin_time__gte=start, checkin_time__lte=end)
    support = SubjectSupportTicket.objects.filter(create_time__gte=start, create_time__lte=end)
    subjects = Subject.objects.filter(is_deleted=False)
    return {
        'window': {'from': start.isoformat(), 'to': end.isoformat()},
        'checkin_count': checkins.count(),
        'checkout_count': checkins.filter(status='checked_out').count(),
        'no_show_count': checkins.filter(status='no_show').count(),
        'support_open': support.exclude(status='closed').count(),
        'support_closed': support.filter(status='closed').count(),
        'withdrawn_subjects': subjects.filter(status='withdrawn').count(),
    }
