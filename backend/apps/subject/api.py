"""
受试者管理 API

端点：
- GET  /subject/list           受试者列表
- GET  /subject/{id}           受试者详情
- POST /subject/create         创建受试者
- PUT  /subject/{id}/update    更新受试者
- POST /subject/{id}/delete    软删除受试者
- GET  /subject/enrollments    入组记录列表
- POST /subject/enroll         入组
- GET  /subject/stats          状态统计
- GET  /subject/enrollment-stats  入组统计
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from datetime import datetime
from .services import (
    list_subjects as svc_list_subjects,
    get_subject as svc_get_subject,
    create_subject as svc_create_subject,
    update_subject as svc_update_subject,
    delete_subject as svc_delete_subject,
    list_enrollments as svc_list_enrollments,
    enroll_subject as svc_enroll_subject,
)
from .models import Subject
from apps.identity.decorators import require_permission, _get_account_from_request
from apps.identity.filters import get_visible_object, filter_queryset_by_scope

router = Router()


def _pick_keep_subject_id_for_merge(subject_ids: list[int]) -> int:
    """同号多条时选取主档 id：预约数多 > 入组数多 > id 小（与合并脚本一致）。"""
    from .models import Enrollment
    from .models_execution import AppointmentStatus, SubjectAppointment

    ids = sorted({int(i) for i in subject_ids})
    if not ids:
        raise ValueError('empty subject_ids')
    if len(ids) == 1:
        return ids[0]

    def appt_count(sid: int) -> int:
        return SubjectAppointment.objects.filter(subject_id=sid).exclude(
            status=AppointmentStatus.CANCELLED
        ).count()

    def enr_count(sid: int) -> int:
        return Enrollment.objects.filter(subject_id=sid).count()

    return sorted(ids, key=lambda sid: (-appt_count(sid), -enr_count(sid), sid))[0]


# ============================================================================
# Schema
# ============================================================================
class SubjectOut(Schema):
    id: int
    subject_no: str
    name: str
    gender: Optional[str] = None
    age: Optional[int] = None
    phone: str
    skin_type: Optional[str] = None
    risk_level: str
    source_channel: Optional[str] = None
    status: str
    create_time: datetime
    update_time: datetime


class SubjectCreateIn(Schema):
    name: str
    gender: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    skin_type: Optional[str] = None
    risk_level: Optional[str] = None
    source_channel: Optional[str] = None


class SubjectUpdateIn(Schema):
    name: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    skin_type: Optional[str] = None
    risk_level: Optional[str] = None
    source_channel: Optional[str] = None


class SubjectQueryParams(Schema):
    status: Optional[str] = None
    phone: Optional[str] = None
    search: Optional[str] = None
    page: int = 1
    page_size: int = 20


class EnrollmentOut(Schema):
    id: int
    subject_id: int
    protocol_id: int
    status: str
    enrolled_at: Optional[datetime] = None
    create_time: datetime


class EnrollIn(Schema):
    subject_id: int
    protocol_id: int


def _subject_to_dict(s) -> dict:
    return {
        'id': s.id,
        'subject_no': s.subject_no or '',
        'name': s.name,
        'gender': s.gender,
        'age': s.age,
        'phone': s.phone,
        'skin_type': s.skin_type,
        'risk_level': s.risk_level,
        'source_channel': s.source_channel or '',
        'status': s.status,
        'create_time': s.create_time.isoformat(),
        'update_time': s.update_time.isoformat(),
    }


# ============================================================================
# 端点
# ============================================================================
@router.get('/list', summary='受试者列表')
@require_permission('subject.subject.read')
def list_subjects(request, params: SubjectQueryParams = Query(...)):
    """分页查询受试者列表"""
    account = _get_account_from_request(request)
    result = svc_list_subjects(
        status=params.status,
        phone=params.phone,
        search=params.search,
        page=params.page,
        page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_subject_to_dict(item) for item in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/resolve-by-phone', summary='按手机号解析受试者（接待台新建预约匹配主档）')
@require_permission('subject.subject.read')
def resolve_subject_by_phone(request, phone: str = Query(..., min_length=1)):
    """
    规范化手机号后匹配 t_subject；多条时与小程序/合并脚本相同规则取主档。
    仅返回当前账号数据权限下可见的那条。
    """
    from django.utils import timezone as dj_timezone
    from .services.subject_service import (
        normalize_subject_phone,
        find_subjects_by_mobile_normalized,
        resolve_subject_for_mobile_session,
    )

    n = normalize_subject_phone(phone)
    if not n:
        return 400, {'code': 400, 'msg': '请输入有效11位手机号', 'data': None}

    candidate_ids = list(find_subjects_by_mobile_normalized(n).values_list('id', flat=True))
    if not candidate_ids:
        return 404, {'code': 404, 'msg': '未找到该手机号的受试者', 'data': None}

    qs = Subject.objects.filter(id__in=candidate_ids, is_deleted=False)
    account = _get_account_from_request(request)
    if account:
        qs = filter_queryset_by_scope(
            qs,
            account,
            field_mapping={'project': 'enrollments__protocol_id'},
        )
    visible_ids = list(qs.values_list('id', flat=True))
    if not visible_ids:
        return 403, {'code': 403, 'msg': '当前账号不可见该手机号下的受试者档案', 'data': None}

    canonical = resolve_subject_for_mobile_session(phone, dj_timezone.localdate())
    if canonical and canonical.id in visible_ids:
        chosen_id = canonical.id
    else:
        chosen_id = _pick_keep_subject_id_for_merge(visible_ids)

    subject = get_visible_object(Subject.objects.filter(id=chosen_id, is_deleted=False), account)
    if not subject:
        return 404, {'code': 404, 'msg': '受试者不存在或不可见', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _subject_to_dict(subject)}


@router.post('/create', summary='创建受试者')
@require_permission('subject.subject.create')
def create_subject(request, data: SubjectCreateIn):
    """创建新受试者"""
    account = _get_account_from_request(request)
    try:
        subject = svc_create_subject(
            name=data.name,
            gender=data.gender or '',
            age=data.age,
            phone=data.phone or '',
            skin_type=data.skin_type or '',
            risk_level=data.risk_level or 'low',
            source_channel=data.source_channel or '',
            account=account,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': subject.id,
            'subject_no': subject.subject_no,
            'name': subject.name,
            'status': subject.status,
        },
    }


@router.get('/enrollments', summary='入组记录列表')
@require_permission('subject.enrollment.read')
def list_enrollments(request, subject_id: Optional[int] = None):
    """查询入组记录"""
    account = _get_account_from_request(request)
    result = svc_list_enrollments(subject_id=subject_id, account=account)
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': item.id,
                    'subject_id': item.subject_id,
                    'protocol_id': item.protocol_id,
                    'status': item.status,
                    'enrolled_at': item.enrolled_at.isoformat() if item.enrolled_at else None,
                    'create_time': item.create_time.isoformat(),
                }
                for item in result['items']
            ],
        },
    }


@router.post('/enroll', summary='受试者入组')
@require_permission('subject.enrollment.create')
def enroll_subject(request, data: EnrollIn):
    """受试者入组"""
    account = _get_account_from_request(request)
    enrollment = svc_enroll_subject(data.subject_id, data.protocol_id, account=account)
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': enrollment.id,
            'subject_id': enrollment.subject_id,
            'protocol_id': enrollment.protocol_id,
            'status': enrollment.status,
        },
    }


# ============================================================================
# 受试者统计
# ============================================================================
@router.get('/stats', summary='受试者状态统计')
@require_permission('subject.subject.read')
def subject_stats(request):
    """返回各状态的受试者数量，供仪表盘使用"""
    from .models import Subject as SubjectModel
    from django.db.models import Count
    account = _get_account_from_request(request)
    qs = SubjectModel.objects.filter(is_deleted=False)
    counts = qs.values('status').annotate(count=Count('id'))
    result = {row['status']: row['count'] for row in counts}
    result['total'] = sum(result.values())
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/enrollment-stats', summary='入组统计（按项目）')
@require_permission('subject.enrollment.read')
def enrollment_stats(request, protocol_id: Optional[int] = None):
    """入组状态统计，可按项目筛选"""
    from .models import Enrollment as EnrollmentModel
    from django.db.models import Count
    qs = EnrollmentModel.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    counts = qs.values('status').annotate(count=Count('id'))
    result = {row['status']: row['count'] for row in counts}
    result['total'] = sum(result.values())
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/enrollments-detail', summary='入组记录列表（带受试者和协议信息）')
@require_permission('subject.enrollment.read')
def list_enrollments_detail(
    request,
    protocol_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """分页查询入组记录，包含受试者姓名和协议标题"""
    from .models import Enrollment as EnrollmentModel, ICFVersion, SubjectConsent
    qs = EnrollmentModel.objects.select_related('subject', 'protocol').order_by('-create_time')
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    protocol_ids = {e.protocol_id for e in items if e.protocol_id}
    subject_ids = {e.subject_id for e in items if e.subject_id}

    active_protocol_ids = set(
        ICFVersion.objects.filter(protocol_id__in=protocol_ids, is_active=True)
        .values_list('protocol_id', flat=True)
    )
    signed_pairs = set(
        SubjectConsent.objects.filter(
            subject_id__in=subject_ids,
            icf_version__protocol_id__in=protocol_ids,
            icf_version__is_active=True,
            is_signed=True,
        ).values_list('subject_id', 'icf_version__protocol_id')
    )

    def _icf_payload(enrollment):
        icf_required = enrollment.protocol_id in active_protocol_ids
        icf_signed = (enrollment.subject_id, enrollment.protocol_id) in signed_pairs
        if not icf_required:
            status_label = '未配置 ICF'
        elif icf_signed:
            status_label = '已签 ICF'
        else:
            status_label = '未签 ICF'
        return {
            'icf_required': icf_required,
            'icf_signed': icf_signed,
            'icf_status_label': status_label,
        }

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': e.id,
            'subject_id': e.subject_id,
            'subject_name': e.subject.name if e.subject else '',
            'subject_status': e.subject.status if e.subject else '',
            'protocol_id': e.protocol_id,
            'protocol_title': e.protocol.title if e.protocol else '',
            'status': e.status,
            'enrolled_at': e.enrolled_at.isoformat() if e.enrolled_at else None,
            'create_time': e.create_time.isoformat(),
            **_icf_payload(e),
        } for e in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }}


# 参数路径放在最后，避免与固定路径冲突
@router.get('/{subject_id}', summary='受试者详情')
@require_permission('subject.subject.read')
def get_subject(request, subject_id: int):
    """获取受试者详细信息；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    subject = get_visible_object(Subject.objects.filter(id=subject_id, is_deleted=False), account)
    if not subject:
        return 404, {'code': 404, 'msg': '受试者不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _subject_to_dict(subject)}


@router.put('/{subject_id}/update', summary='更新受试者')
@require_permission('subject.subject.update')
def update_subject(request, subject_id: int, data: SubjectUpdateIn):
    """更新受试者信息；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    if not get_visible_object(Subject.objects.filter(id=subject_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '受试者不存在'}
    try:
        subject = svc_update_subject(subject_id, **data.dict(exclude_unset=True))
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    if not subject:
        return 404, {'code': 404, 'msg': '受试者不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _subject_to_dict(subject)}


@router.post('/{subject_id}/delete', summary='删除受试者')
@require_permission('subject.subject.update')
def delete_subject(request, subject_id: int):
    """软删除受试者；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    if not get_visible_object(Subject.objects.filter(id=subject_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '受试者不存在'}
    ok = svc_delete_subject(subject_id)
    if not ok:
        return 404, {'code': 404, 'msg': '受试者不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# P1: 档案 API
# ============================================================================
class ProfileUpdateIn(Schema):
    birth_date: Optional[str] = None
    ethnicity: Optional[str] = None
    education: Optional[str] = None
    occupation: Optional[str] = None
    marital_status: Optional[str] = None
    name_pinyin: Optional[str] = None
    id_card: Optional[str] = None
    phone_backup: Optional[str] = None
    email: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    privacy_level: Optional[str] = None
    consent_data_sharing: Optional[bool] = None
    consent_rwe_usage: Optional[bool] = None
    consent_biobank: Optional[bool] = None
    consent_follow_up: Optional[bool] = None


class MedicalHistoryIn(Schema):
    condition_name: str
    condition_code: Optional[str] = None
    body_system: Optional[str] = None
    is_ongoing: bool = False
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    severity: Optional[str] = None
    notes: Optional[str] = None


class AllergyIn(Schema):
    allergen: str
    allergen_type: Optional[str] = None
    reaction: Optional[str] = None
    severity: Optional[str] = None
    is_confirmed: bool = False


class MedicationIn(Schema):
    medication_name: str
    generic_name: Optional[str] = None
    indication: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    is_ongoing: bool = False


@router.get('/{subject_id}/profile', summary='获取受试者完整档案')
@require_permission('subject.subject.read')
def get_subject_profile(request, subject_id: int):
    """获取受试者主档案（敏感字段默认脱敏）"""
    from .services.profile_service import get_profile_dict
    account = _get_account_from_request(request)
    if not get_visible_object(Subject.objects.filter(id=subject_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '受试者不存在'}
    data = get_profile_dict(subject_id, include_sensitive=False)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.put('/{subject_id}/profile', summary='更新受试者档案')
@require_permission('subject.subject.update')
def update_subject_profile(request, subject_id: int, data: ProfileUpdateIn):
    """更新受试者主档案"""
    from .services.profile_service import update_profile
    account = _get_account_from_request(request)
    if not get_visible_object(Subject.objects.filter(id=subject_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '受试者不存在'}
    profile = update_profile(subject_id, **data.dict(exclude_unset=True))
    if not profile:
        return 404, {'code': 404, 'msg': '更新失败'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': profile.id}}


@router.get('/{subject_id}/medical-history', summary='获取医学史')
@require_permission('subject.subject.read')
def get_medical_history(request, subject_id: int):
    """获取受试者病史记录列表"""
    from .services.profile_service import list_medical_histories
    items = list_medical_histories(subject_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'condition_name': r.condition_name,
            'condition_code': r.condition_code, 'body_system': r.body_system,
            'is_ongoing': r.is_ongoing, 'severity': r.severity,
            'start_date': r.start_date.isoformat() if r.start_date else None,
            'end_date': r.end_date.isoformat() if r.end_date else None,
            'notes': r.notes,
        } for r in items],
    }}


@router.post('/{subject_id}/medical-history', summary='新增医学史')
@require_permission('subject.subject.update')
def add_medical_history(request, subject_id: int, data: MedicalHistoryIn):
    """新增受试者病史记录"""
    from .services.profile_service import create_medical_history
    record = create_medical_history(subject_id, **data.dict(exclude_unset=True))
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id}}


@router.get('/{subject_id}/allergies', summary='获取过敏记录')
@require_permission('subject.subject.read')
def get_allergies(request, subject_id: int):
    """获取受试者过敏记录列表"""
    from .services.profile_service import list_allergies
    items = list_allergies(subject_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'allergen': r.allergen,
            'allergen_type': r.allergen_type, 'reaction': r.reaction,
            'severity': r.severity, 'is_confirmed': r.is_confirmed,
        } for r in items],
    }}


@router.post('/{subject_id}/allergies', summary='新增过敏记录')
@require_permission('subject.subject.update')
def add_allergy(request, subject_id: int, data: AllergyIn):
    """新增受试者过敏记录"""
    from .services.profile_service import create_allergy
    record = create_allergy(subject_id, **data.dict(exclude_unset=True))
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id}}


@router.get('/{subject_id}/medications', summary='获取合并用药')
@require_permission('subject.subject.read')
def get_medications(request, subject_id: int):
    """获取受试者合并用药列表"""
    from .services.profile_service import list_medications
    items = list_medications(subject_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'medication_name': r.medication_name,
            'generic_name': r.generic_name, 'indication': r.indication,
            'dose': r.dose, 'frequency': r.frequency, 'route': r.route,
            'is_ongoing': r.is_ongoing,
        } for r in items],
    }}


@router.post('/{subject_id}/medications', summary='新增合并用药')
@require_permission('subject.subject.update')
def add_medication(request, subject_id: int, data: MedicationIn):
    """新增受试者合并用药"""
    from .services.profile_service import create_medication
    record = create_medication(subject_id, **data.dict(exclude_unset=True))
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id}}


@router.get('/{subject_id}/domain-profile/{domain}', summary='获取领域档案')
@require_permission('subject.subject.read')
def get_subject_domain_profile(request, subject_id: int, domain: str):
    """获取领域专属档案（skin/oral/nutrition/exposure）"""
    from .services.profile_service import get_domain_profile, DOMAIN_PROFILE_MAP
    if domain not in DOMAIN_PROFILE_MAP:
        return 400, {'code': 400, 'msg': f'不支持的领域: {domain}，可选: {",".join(DOMAIN_PROFILE_MAP.keys())}'}
    data = get_domain_profile(subject_id, domain)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.put('/{subject_id}/domain-profile/{domain}', summary='更新领域档案')
@require_permission('subject.subject.update')
def update_subject_domain_profile(request, subject_id: int, domain: str, data: dict):
    """更新领域专属档案"""
    from .services.profile_service import update_domain_profile, DOMAIN_PROFILE_MAP
    if domain not in DOMAIN_PROFILE_MAP:
        return 400, {'code': 400, 'msg': f'不支持的领域: {domain}'}
    result = update_domain_profile(subject_id, domain, **data)
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# P4: 时间线与 RWE
# ============================================================================
@router.get('/{subject_id}/timeline', summary='受试者时间线')
@require_permission('subject.subject.read')
def get_subject_timeline(request, subject_id: int, limit: int = 50):
    """获取受试者跨项目时间线（时序数据聚合）"""
    from .services.timeseries_service import get_subject_timeline as svc_timeline
    account = _get_account_from_request(request)
    if not get_visible_object(Subject.objects.filter(id=subject_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '受试者不存在'}
    events = svc_timeline(subject_id, limit=limit)
    return {'code': 200, 'msg': 'OK', 'data': {'events': events}}


class TimeseriesCreateIn(Schema):
    record_type: str
    measured_at: datetime
    enrollment_id: Optional[int] = None
    work_order_id: Optional[int] = None
    source: Optional[str] = 'manual'
    data: dict


@router.post('/{subject_id}/timeseries', summary='录入时序数据')
@require_permission('subject.subject.update')
def create_timeseries_record(request, subject_id: int, data: TimeseriesCreateIn):
    """录入时序数据（vital_sign/body_metric/lab_result/skin_measurement）"""
    from .services.timeseries_service import create_record, TIMESERIES_MODELS
    if data.record_type not in TIMESERIES_MODELS:
        return 400, {'code': 400, 'msg': f'不支持的类型，可选: {",".join(TIMESERIES_MODELS.keys())}'}
    account = _get_account_from_request(request)
    kwargs = dict(data.data)
    kwargs['enrollment_id'] = data.enrollment_id
    kwargs['work_order_id'] = data.work_order_id
    kwargs['source'] = data.source or 'manual'
    kwargs['operator_id'] = account.id if account else None
    record = create_record(data.record_type, subject_id, data.measured_at, **kwargs)
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id, 'type': data.record_type}}


class RWEExportParams(Schema):
    subject_ids: Optional[List[int]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


@router.post('/rwe/export', summary='RWE 数据脱敏导出')
@require_permission('subject.subject.read')
def export_rwe_data(request, params: RWEExportParams):
    """导出 RWE 就绪的脱敏数据（仅 consent_rwe_usage=True 的受试者）"""
    from .services.timeseries_service import export_rwe_data as svc_export
    data = svc_export(
        subject_ids=params.subject_ids,
        date_from=params.date_from,
        date_to=params.date_to,
    )
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/{subject_id}/journey', summary='受试者13阶段轨迹')
@require_permission('subject.subject.read')
def get_subject_journey(request, subject_id: int):
    """获取受试者全链路阶段轨迹。"""
    from .services.timeseries_service import get_subject_journey as svc_journey
    account = _get_account_from_request(request)
    if not get_visible_object(Subject.objects.filter(id=subject_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '受试者不存在'}
    data = svc_journey(subject_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/journey/stats', summary='受试者旅程阶段统计')
@require_permission('subject.subject.read')
def get_journey_stats(request):
    """获取旅程全局统计。"""
    from .services.timeseries_service import get_journey_stage_stats
    data = get_journey_stage_stats()
    return {'code': 200, 'msg': 'OK', 'data': data}
