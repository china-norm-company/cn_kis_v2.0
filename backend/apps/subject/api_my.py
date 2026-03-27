"""
受试者自助 API

路由前缀：/my/
所有端点从 JWT 解出 account_id -> 查找 Subject -> 仅返回自己的数据。
用于微信小程序 C 端。
"""
from ninja import Router, Schema, Body, Query
from pydantic import field_validator
from typing import Optional
from datetime import date, datetime as dt_datetime, timedelta
import logging

from django.db import transaction
from django.utils import timezone
from django.db.models import Q

logger = logging.getLogger(__name__)
from apps.identity.decorators import require_permission, _get_account_from_request
from apps.identity.phone_session import get_phone_from_request
from .services.identity_provider_service import (
    get_identity_provider_payload,
    get_identity_provider_config_state,
    query_verify_result,
)

router = Router()


def _get_subject_from_request(request):
    """从请求中获取当前受试者（优先 JWT phone，兼容 account）。
    同手机号多条档案时，解析为与当日预约一致的 canonical Subject，避免扫码签到写到错误 subject_id。
    """
    from .models import Subject
    from .services import subject_service as subject_svc

    # 方法1: 尝试从 phone_session JWT 提取 phone
    phone = get_phone_from_request(request)
    if phone:
        subject = subject_svc.resolve_subject_for_mobile_session(phone, timezone.localdate())
        if subject:
            return subject

    # 方法2: 兼容旧逻辑（account-based token）
    account = _get_account_from_request(request)
    if account:
        sub = Subject.objects.filter(account_id=account.id, is_deleted=False).first()
        if sub and (sub.phone or '').strip():
            canonical = subject_svc.resolve_subject_for_mobile_session(
                sub.phone, timezone.localdate()
            )
            if canonical:
                return canonical
        return sub

    return None


# ============================================================================
# Schema
# ============================================================================
class MyProfileUpdateIn(Schema):
    phone_backup: Optional[str] = None
    email: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    consent_data_sharing: Optional[bool] = None
    consent_rwe_usage: Optional[bool] = None
    consent_follow_up: Optional[bool] = None


class MyWechatDisplayNameIn(Schema):
    """登录后可选：同步微信昵称到账号 display_name，仅影响问候展示优先级中的 wechat_nickname 档（§2.2）。"""
    display_name: str


class MyAppointmentIn(Schema):
    enrollment_id: Optional[int] = None
    appointment_date: date
    appointment_time: Optional[str] = None
    purpose: Optional[str] = ''
    visit_point: Optional[str] = ''


class MyQuestionnaireSubmitIn(Schema):
    answers: dict
    score: Optional[float] = None


class MySupportTicketIn(Schema):
    category: Optional[str] = 'question'
    title: str
    content: str


class MyRegistrationIn(Schema):
    plan_id: int
    gender: Optional[str] = ''
    age: Optional[int] = None
    email: Optional[str] = ''
    medical_history: Optional[str] = ''
    skin_type: Optional[str] = ''
    referrer_code: Optional[str] = ''


class MyWithdrawIn(Schema):
    reason: str
    reason_detail: Optional[str] = ''


class ScanCheckinIn(Schema):
    """扫码签到可选请求体，小程序传 qr_content 兼容"""
    qr_content: Optional[str] = None


class IdentityVerifyStartIn(Schema):
    provider: Optional[str] = 'volcengine_cert'


class IdentityVerifyCompleteIn(Schema):
    verify_id: str
    status: str  # verified | rejected
    id_card_encrypted: Optional[str] = ''
    reject_reason: Optional[str] = ''


class ConsentFaceSignIn(Schema):
    face_verify_token: str
    reading_duration_seconds: Optional[int] = 0
    comprehension_quiz_passed: Optional[bool] = True


def _mask_phone(s: str) -> str:
    """手机号脱敏：138****1234"""
    if not s or len(s) < 7:
        return s or ''
    return s[:3] + '****' + s[-4:]


def _mask_id_card(s: str) -> str:
    """身份证号脱敏：前3后4"""
    if not s or len(s) < 8:
        return s or ''
    return s[:3] + '*' * (len(s) - 7) + s[-4:]


def _compute_auth_level(subject) -> str:
    """L2=已实名时间存在, L1=有账号且手机号, L0=其他"""
    from .models import AuthLevel
    if subject.identity_verified_at:
        return AuthLevel.IDENTITY_VERIFIED
    if subject.account_id and (subject.phone or '').strip():
        return AuthLevel.PHONE_VERIFIED
    return subject.auth_level or AuthLevel.GUEST


def _trace_id():
    """生成请求级追踪 ID，便于审计与日志关联"""
    import uuid
    return uuid.uuid4().hex[:16]


def _identity_provider_payload(subject=None) -> dict:
    """调用 SDK 获取 byted_token。"""
    idcard_name = ''
    idcard_no = ''
    if subject:
        idcard_name = str(getattr(subject, 'name', '') or '').strip()
    payload = get_identity_provider_payload(
        idcard_name=idcard_name, idcard_no=idcard_no,
    )
    return {'byted_token': payload.byted_token, 'h5_config_id': payload.h5_config_id}


def _identity_provider_config_state() -> dict:
    """实名服务关键配置自检（只返回配置状态，不泄露密钥值）。"""
    from django.conf import settings
    state = get_identity_provider_config_state()
    manual_complete_enabled = bool(
        getattr(settings, 'DEBUG', False) and getattr(settings, 'IDENTITY_VERIFY_ALLOW_MANUAL_COMPLETE', False)
    )
    state['manual_complete_enabled'] = manual_complete_enabled
    state['provider_ready'] = state.get('sdk_ready', False)
    return state


def _is_identity_callback_authorized(request) -> bool:
    """
    实名结果回写授权：
    - 生产：必须提供并匹配 X-Identity-Callback-Token
    - 开发：仅 DEBUG + IDENTITY_VERIFY_ALLOW_MANUAL_COMPLETE=true 时允许手动回写
    """
    from django.conf import settings
    import secrets
    expected = str(getattr(settings, 'IDENTITY_VERIFY_CALLBACK_TOKEN', '') or '').strip()
    provided = str(request.META.get('HTTP_X_IDENTITY_CALLBACK_TOKEN', '') or '').strip()
    if expected and provided and secrets.compare_digest(provided, expected):
        return True
    return bool(getattr(settings, 'DEBUG', False) and getattr(settings, 'IDENTITY_VERIFY_ALLOW_MANUAL_COMPLETE', False))


# ============================================================================
# 认证状态（L0/L1/L2）
# ============================================================================
@router.get('/identity/status', summary='认证等级与实名状态')
@require_permission('my.profile.read')
def get_my_identity_status(request):
    """受试者查询当前认证等级；前端必须据此做门禁，禁止仅凭 code===200 判断"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    auth_level = _compute_auth_level(subject)
    data = {
        'auth_level': auth_level,
        'identity_verified_at': subject.identity_verified_at.isoformat() if subject.identity_verified_at else None,
        'identity_verify_status': subject.identity_verify_status or None,
        'phone_masked': _mask_phone(subject.phone or ''),
        'id_card_masked': '***********1234' if (subject.id_card_encrypted or '').strip() else None,
        'trace_id': _trace_id(),
    }
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/identity/provider/config-check', summary='实名服务配置自检（只读）')
@require_permission('my.profile.read')
def get_identity_provider_config_check(request):
    """返回实名服务关键配置是否就绪（仅状态，不返回敏感值）。"""
    state = _identity_provider_config_state()
    data = {
        **state,
        'trace_id': _trace_id(),
    }
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/identity/verify/start', summary='发起实名认证')
@require_permission('my.profile.update')
def start_identity_verify(request, data: IdentityVerifyStartIn):
    """发起实名核验，返回 verify_id / provider / expire_at；仅 L1 可调用。同一用户未过期的 pending 会话复用（幂等）。"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import AuthLevel
    if _compute_auth_level(subject) == AuthLevel.IDENTITY_VERIFIED:
        return 400, {'code': 400, 'msg': '您已完成实名认证', 'data': None}
    if _compute_auth_level(subject) != AuthLevel.PHONE_VERIFIED:
        return 403, {
            'code': 403,
            'msg': '请先完成手机号认证',
            'data': None,
            'error_code': '403_AUTH_LEVEL_REQUIRED',
        }
    from .models_identity import IdentityVerifySession
    from datetime import timedelta
    now = timezone.now()
    # 幂等：已有未过期的 pending 会话则直接返回
    existing = IdentityVerifySession.objects.filter(
        subject=subject,
        status='pending',
        expire_at__gt=now,
    ).order_by('-requested_at').first()
    if existing:
        provider_payload = _identity_provider_payload(subject=subject)
        if not (existing.byted_token or '').strip() and provider_payload['byted_token']:
            existing.byted_token = provider_payload['byted_token']
            existing.save(update_fields=['byted_token', 'update_time'])
        if not (existing.byted_token or '').strip():
            return 503, {
                'code': 503,
                'msg': '实名认证服务未配置，请联系管理员',
                'data': None,
                'error_code': 'IDENTITY_PROVIDER_UNAVAILABLE',
            }
        data_out = {
            'verify_id': existing.verify_id,
            'provider': existing.provider,
            'expire_at': existing.expire_at.isoformat(),
            'byted_token': existing.byted_token or '',
            'h5_config_id': provider_payload['h5_config_id'],
            'trace_id': _trace_id(),
        }
        return {'code': 200, 'msg': 'OK', 'data': data_out}
    import uuid
    verify_id = str(uuid.uuid4()).replace('-', '')[:24]
    expire_at = now + timedelta(minutes=10)
    session = IdentityVerifySession.objects.create(
        subject=subject,
        verify_id=verify_id,
        provider=data.provider or 'volcengine_cert',
        status='pending',
        expire_at=expire_at,
    )
    provider_payload = _identity_provider_payload(subject=subject)
    if provider_payload['byted_token']:
        session.byted_token = provider_payload['byted_token']
        session.save(update_fields=['byted_token', 'update_time'])
    if not session.byted_token:
        return 503, {
            'code': 503,
            'msg': '实名认证服务未配置，请联系管理员',
            'data': None,
            'error_code': 'IDENTITY_PROVIDER_UNAVAILABLE',
        }
    data_out = {
        'verify_id': session.verify_id,
        'provider': session.provider,
        'expire_at': session.expire_at.isoformat(),
        'byted_token': session.byted_token or '',
        'h5_config_id': provider_payload['h5_config_id'],
        'trace_id': _trace_id(),
    }
    return {'code': 200, 'msg': 'OK', 'data': data_out}


@router.get('/identity/verify/result', summary='查询实名核验结果')
@require_permission('my.profile.read')
def get_identity_verify_result(request, verify_id: str):
    """轮询核验结果；仅 status=verified 时前端可视为 L2。过期会话统一经 complete_verify 标记为 expired。"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_identity import IdentityVerifySession
    session = IdentityVerifySession.objects.filter(verify_id=verify_id, subject=subject).first()
    if not session:
        return 404, {'code': 404, 'msg': '无效的核验会话'}
    now = timezone.now()
    if session.status == 'pending' and session.expire_at and now > session.expire_at:
        from .services.identity_service import complete_verify
        complete_verify(verify_id, 'expired')
        session.refresh_from_db()
    elif session.status == 'pending' and (session.byted_token or '').strip():
        # 查询火山核验结果并持久化审计证据
        provider_result = query_verify_result(session.byted_token)
        if provider_result.get('result') is True:
            from .services.identity_service import complete_verify
            complete_verify(
                verify_id,
                'verified',
                extra_data={
                    'provider': 'volcengine_cert',
                    'request_id': provider_result.get('request_id', ''),
                    'images': provider_result.get('images', {}),
                    'verify_score': provider_result.get('verify_score'),
                    'verify_thresholds': provider_result.get('verify_thresholds', {}),
                    'risk_result': provider_result.get('risk_result', ''),
                    'raw_status': provider_result.get('raw_status'),
                    'queried_at': timezone.now().isoformat(),
                },
            )
            session.refresh_from_db()
        elif provider_result.get('error'):
            session.extra_data = {
                'provider': 'volcengine_cert',
                'request_id': provider_result.get('request_id', ''),
                'raw_status': provider_result.get('raw_status'),
                'last_query_error': provider_result.get('error', ''),
                'queried_at': timezone.now().isoformat(),
            }
            session.save(update_fields=['extra_data', 'update_time'])
    data_out = {
        'verify_id': session.verify_id,
        'status': session.status,
        'verified_at': session.completed_at.isoformat() if session.completed_at else None,
        'reject_reason': session.reject_reason or None,
        'trace_id': _trace_id(),
    }
    return {'code': 200, 'msg': 'OK', 'data': data_out}


@router.post('/identity/verify/complete', summary='回写实名核验结果')
@require_permission('my.profile.update')
def complete_identity_verify(request, data: IdentityVerifyCompleteIn):
    """核验完成回调或测试用：将会话标记为 verified/rejected 并更新 Subject"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    if not _is_identity_callback_authorized(request):
        return 403, {
            'code': 403,
            'msg': '实名认证回写未授权',
            'data': None,
            'error_code': 'IDENTITY_CALLBACK_UNAUTHORIZED',
        }
    from .models_identity import IdentityVerifySession
    session = IdentityVerifySession.objects.filter(
        verify_id=data.verify_id,
        subject=subject,
        status='pending',
    ).first()
    if not session:
        return 404, {'code': 404, 'msg': '无效或已处理的核验会话'}
    if session.expire_at and timezone.now() > session.expire_at:
        from .services.identity_service import complete_verify
        complete_verify(data.verify_id, 'expired')
        return 400, {'code': 400, 'msg': '核验已过期'}
    if data.status not in ('verified', 'rejected'):
        return 400, {'code': 400, 'msg': '无效的 status'}
    from .services.identity_service import complete_verify
    complete_verify(
        data.verify_id,
        data.status,
        id_card_encrypted=data.id_card_encrypted or '',
        reject_reason=data.reject_reason or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': {'status': data.status, 'trace_id': _trace_id()}}


# ============================================================================
# 手机号绑定（微信登录后与 Subject 关联）
# ============================================================================
class BindPhoneIn(Schema):
    phone: str


@router.get('/binding/status', summary='获取手机号绑定状态')
@require_permission('my.profile.read')
def get_binding_status(request):
    """判断当前微信账号是否已绑定 Subject（手机号关联）。
    is_bound=false 时前端应引导用户进入手机号绑定页。
    """
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'is_bound': subject is not None,
            'phone_masked': _mask_phone(subject.phone or '') if subject else None,
        },
    }


@router.post('/binding/bind-phone', summary='首次绑定手机号（微信账号关联 Subject）')
@require_permission('my.profile.update')
def bind_phone(request, data: BindPhoneIn):
    """受试者首次登录时绑定手机号，与招募台预约数据打通。
    按手机号查询已有 Subject，若找到则将 account_id 设为当前账号。
    若未找到则自动创建 Subject（为临时无预约场景兜底）。
    """
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权'}
    phone = (data.phone or '').strip()
    if not phone or len(phone) != 11 or not phone.startswith('1'):
        return 400, {'code': 400, 'msg': '请输入正确的11位手机号'}

    from .models import Subject, AuthLevel
    from .services.subject_service import (
        generate_subject_no,
        normalize_subject_phone,
        find_subjects_by_mobile_normalized,
        resolve_subject_for_mobile_session,
    )

    # 检查当前账号是否已绑定
    existing_subject = Subject.objects.filter(account_id=account.id, is_deleted=False).first()
    if existing_subject:
        return {
            'code': 200,
            'msg': '手机号已绑定',
            'data': {
                'subject_id': existing_subject.id,
                'phone_masked': _mask_phone(existing_subject.phone or ''),
                'is_new': False,
            },
        }

    n = normalize_subject_phone(phone)

    # 查找已有 Subject；同号多条时绑定到与当日预约一致的 canonical，避免再建「微信用户」重复档
    subject = None
    if n and find_subjects_by_mobile_normalized(n).exists():
        subject = resolve_subject_for_mobile_session(phone, timezone.localdate())
    if subject is None:
        subject = Subject.objects.filter(phone=phone, is_deleted=False).first()
    if subject:
        if subject.account_id and subject.account_id != account.id:
            return 409, {'code': 409, 'msg': '该手机号已被其他账号绑定，请联系工作人员'}
        subject.account_id = account.id
        if not subject.auth_level or subject.auth_level == AuthLevel.GUEST:
            subject.auth_level = AuthLevel.PHONE_VERIFIED
        subject.save(update_fields=['account_id', 'auth_level', 'update_time'])
        return {
            'code': 200,
            'msg': '绑定成功',
            'data': {
                'subject_id': subject.id,
                'phone_masked': _mask_phone(phone),
                'is_new': False,
            },
        }

    # 未找到，自动创建 Subject（防御：规范化后应仍无同号档）
    if n and find_subjects_by_mobile_normalized(n).exists():
        return 400, {
            'code': 400,
            'msg': '该手机号已有受试者档案，请稍后再试或联系前台处理重复档案。',
            'data': None,
        }
    subject = Subject.objects.create(
        subject_no=generate_subject_no(),
        account_id=account.id,
        name='受试者',
        phone=n if n else phone,
        auth_level=AuthLevel.PHONE_VERIFIED,
    )
    return {
        'code': 200,
        'msg': '绑定成功（新建受试者档案）',
        'data': {
            'subject_id': subject.id,
            'phone_masked': _mask_phone(phone),
            'is_new': True,
        },
    }


# ============================================================================
# 我的档案
# ============================================================================
@router.get('/profile', summary='查看我的档案')
@require_permission('my.profile.read')
def get_my_profile(request):
    """受试者查看自己的档案"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.profile_service import get_profile_dict
    from .models_execution import SubjectAppointment
    from django.utils import timezone

    profile = get_profile_dict(subject.id, include_sensitive=False)
    from .models import Subject
    from .services.home_dashboard_service import compute_subject_display_name

    sub_full = Subject.objects.filter(pk=subject.id, is_deleted=False).select_related('account').first()
    display_name, display_name_source = ('受试者', 'fallback')
    if sub_full:
        display_name, display_name_source = compute_subject_display_name(sub_full, timezone.localdate())

    data = {
        'subject_id': subject.id,
        'subject_no': subject.subject_no,
        'name': subject.name,
        'gender': subject.gender,
        'age': subject.age,
        'phone': subject.phone,
        'profile': profile,
        'display_name': display_name,
        'display_name_source': display_name_source,
    }
    # 无入组时，从预约记录取项目名称供小程序首页展示
    next_appt = SubjectAppointment.objects.filter(
        subject=subject,
        appointment_date__gte=timezone.localdate(),
    ).exclude(status='cancelled').order_by('appointment_date').first()
    if next_appt and (getattr(next_appt, 'project_name', '') or getattr(next_appt, 'project_code', '')):
        data['project_name_from_appointment'] = getattr(next_appt, 'project_name', '') or ''
        data['project_code_from_appointment'] = getattr(next_appt, 'project_code', '') or ''
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.put('/profile', summary='更新我的档案')
@require_permission('my.profile.update')
def update_my_profile(request, data: MyProfileUpdateIn):
    """受试者更新自己的基本信息（限制可修改字段）"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.profile_service import update_profile
    update_profile(subject.id, **data.dict(exclude_unset=True))
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.post('/profile/wechat-display-name', summary='（可选）同步微信昵称用于问候展示')
@require_permission('my.profile.update')
def post_my_wechat_display_name(request, data: MyWechatDisplayNameIn):
    """写入关联账号的 display_name，不阻塞登录；无档案/预约名时仍优先于 fallback（附录 A §4）。"""
    from .models import Subject

    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息', 'data': None}
    sub_full = Subject.objects.filter(pk=subject.id, is_deleted=False).select_related('account').first()
    if not sub_full or not sub_full.account_id:
        return 400, {'code': 400, 'msg': '当前受试者未关联登录账号，无法保存称呼', 'data': None}
    raw = (data.display_name or '').strip()
    if not raw:
        return 400, {'code': 400, 'msg': 'display_name 不能为空', 'data': None}
    acc = sub_full.account
    acc.display_name = raw[:100]
    acc.save(update_fields=['display_name'])
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/home-dashboard', summary='首页聚合（主项目+多项目卡片，附录 A）')
@require_permission('my.profile.read')
def get_home_dashboard(request, date: Optional[str] = None):
    """小程序首页一次拉齐：问候展示名、多项目块、入组/SC/当日队列签到态（GET /api/v1/my/home-dashboard）。"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息', 'data': None}

    as_of = timezone.localdate()
    if date and str(date).strip():
        try:
            as_of = dt_datetime.strptime(str(date).strip()[:10], '%Y-%m-%d').date()
        except ValueError:
            return 400, {'code': 400, 'msg': 'date 参数须为 YYYY-MM-DD', 'data': None}

    from .models import Subject
    from .services.home_dashboard_service import build_home_dashboard_data

    sub = Subject.objects.filter(pk=subject.id).select_related('account').first()
    if not sub:
        return 404, {'code': 404, 'msg': '未找到受试者信息', 'data': None}

    data = build_home_dashboard_data(sub, as_of)
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 我的项目
# ============================================================================
@router.get('/enrollments', summary='我参与的项目', response={200: dict, 404: dict})
@require_permission('my.profile.read')
def get_my_enrollments(request):
    """查看受试者参与的所有项目（含访视计划ID）。
    若无 Enrollment 则返回 items 为空并附带 has_appointment 字段，
    供前端展示「待入组」或「预约待确认」状态。
    """
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import Enrollment
    from apps.visit.models import VisitPlan
    enrollments = Enrollment.objects.filter(subject=subject).select_related('protocol').order_by('-create_time')
    items = []
    for e in enrollments:
        plan_id = None
        if e.protocol_id:
            vp = VisitPlan.objects.filter(
                protocol_id=e.protocol_id, is_deleted=False, status='active'
            ).first()
            if vp:
                plan_id = vp.id
        items.append({
            'id': e.id,
            'protocol_id': e.protocol_id,
            'protocol_title': e.protocol.title if e.protocol else '',
            'project_code': (e.protocol.code or '').strip() if e.protocol else '',
            'plan_id': plan_id,
            'status': e.status,
            'enrolled_at': e.enrolled_at.isoformat() if e.enrolled_at else None,
        })

    pending_appointment_info = None
    if not items:
        from .models_execution import SubjectAppointment
        from django.utils import timezone
        today = timezone.localdate()
        upcoming_appt = SubjectAppointment.objects.filter(
            subject=subject,
            appointment_date__gte=today,
        ).exclude(status='cancelled').order_by('appointment_date', 'appointment_time').first()
        if upcoming_appt:
            pending_appointment_info = {
                'appointment_date': str(upcoming_appt.appointment_date),
                'appointment_time': upcoming_appt.appointment_time.strftime('%H:%M') if upcoming_appt.appointment_time else None,
                'project_name': upcoming_appt.project_name or '',
                'project_code': upcoming_appt.project_code or '',
                'visit_point': upcoming_appt.visit_point or '',
                'status': upcoming_appt.status,
            }

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': items,
        'has_appointment': pending_appointment_info is not None,
        'pending_appointment': pending_appointment_info,
    }}


# ============================================================================
# 我的预约
# ============================================================================
@router.get('/appointments', summary='我的预约列表')
@require_permission('my.appointment.read')
def get_my_appointments(request):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.execution_service import list_appointments
    items = list_appointments(subject.id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': a.id, 'appointment_date': a.appointment_date.isoformat(),
            'appointment_time': a.appointment_time.isoformat() if a.appointment_time else None,
            'purpose': a.purpose, 'status': a.status,
        } for a in items],
    }}


@router.post('/appointments', summary='创建预约')
@require_permission('my.appointment.create')
def create_my_appointment(request, data: MyAppointmentIn):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.execution_service import create_appointment
    from datetime import time
    appt_time = None
    if data.appointment_time:
        parts = data.appointment_time.split(':')
        appt_time = time(int(parts[0]), int(parts[1]))
    appt = create_appointment(
        subject.id, data.appointment_date, appt_time,
        data.purpose or '', data.enrollment_id,
        visit_point=data.visit_point or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': appt.id}}


@router.post('/appointments/{appointment_id}/cancel', summary='取消预约')
@require_permission('my.appointment.create')
def cancel_my_appointment(request, appointment_id: int):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.execution_service import cancel_appointment
    from .models_execution import SubjectAppointment
    appt = SubjectAppointment.objects.filter(id=appointment_id, subject=subject).first()
    if not appt:
        return 404, {'code': 404, 'msg': '预约不存在'}
    cancel_appointment(appointment_id)
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 我的问卷
# ============================================================================
@router.get('/questionnaires', summary='我的问卷列表')
@require_permission('my.questionnaire.read')
def get_my_questionnaires(request, status: Optional[str] = None):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.execution_service import list_questionnaires
    items = list_questionnaires(subject.id, status)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': q.id, 'title': q.title, 'questionnaire_type': q.questionnaire_type,
            'status': q.status,
            'due_date': q.due_date.isoformat() if q.due_date else None,
        } for q in items],
    }}


@router.post('/questionnaires/{questionnaire_id}/submit', summary='提交问卷')
@require_permission('my.questionnaire.submit')
def submit_my_questionnaire(request, questionnaire_id: int, data: MyQuestionnaireSubmitIn):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.execution_service import submit_questionnaire
    from .models_execution import SubjectQuestionnaire
    q = SubjectQuestionnaire.objects.filter(id=questionnaire_id, subject=subject).first()
    if not q:
        return 404, {'code': 404, 'msg': '问卷不存在'}
    result = submit_questionnaire(questionnaire_id, data.answers, data.score)
    try:
        from apps.audit.models import AuditLog, AuditAction
        account = _get_account_from_request(request)
        if account:
            AuditLog.objects.create(
                account_id=account.id,
                account_name=account.display_name or account.username,
                account_type=account.account_type,
                action=AuditAction.UPDATE,
                description='受试者提交自评问卷（化妆品临床场景默认无需手写签名）',
                resource_type='subject_questionnaire',
                resource_id=str(result.id),
                resource_name=result.title or '',
                new_value={'status': result.status, 'submitted_at': result.submitted_at.isoformat() if result.submitted_at else None},
                changed_fields=['status', 'submitted_at'],
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
            )
    except Exception:
        pass
    return {'code': 200, 'msg': 'OK', 'data': {'id': result.id, 'status': result.status}}


# ============================================================================
# 我的知情同意
# ============================================================================
@router.get('/consents', summary='我的知情同意列表')
@require_permission('my.consent.read')
def get_my_consents(request):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.consent_service import get_subject_consents
    from django.conf import settings
    items = get_subject_consents(subject.id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': c.id,
            'icf_version_id': c.icf_version_id,
            'icf_version': c.icf_version.version if c.icf_version else '',
            'is_signed': c.is_signed,
            'signed_at': c.signed_at.isoformat() if c.signed_at else None,
            'receipt_no': c.receipt_no or None,
            'receipt_pdf_path': (c.signature_data or {}).get('receipt_pdf_path') if c.signature_data else None,
            'receipt_pdf_url': (
                f"{settings.MEDIA_URL}{(c.signature_data or {}).get('receipt_pdf_path')}"
                if (c.signature_data or {}).get('receipt_pdf_path') else None
            ),
        } for c in items],
    }}


@router.get('/consents/icf/{icf_version_id}', summary='获取 ICF 内容（动态加载）')
@require_permission('my.consent.read')
def get_icf_content(request, icf_version_id: int):
    """返回单条 ICF 版本内容，供知情同意页动态加载"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import ICFVersion
    icf = ICFVersion.objects.filter(id=icf_version_id).select_related('protocol').first()
    if not icf:
        return 404, {'code': 404, 'msg': 'ICF 版本不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': icf.id,
        'version': icf.version,
        'content': icf.content or '',
        'file_path': icf.file_path or '',
        'protocol_title': icf.protocol.title if icf.protocol else '',
    }}


@router.post('/consents/{icf_version_id}/sign', summary='签署知情同意书（手写/通用）')
@require_permission('my.consent.sign')
def sign_my_consent(request, icf_version_id: int):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.consent_service import sign_consent
    consent = sign_consent(subject.id, icf_version_id)
    from django.conf import settings
    receipt_pdf_path = (consent.signature_data or {}).get('receipt_pdf_path') if consent.signature_data else None
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': consent.id,
        'is_signed': consent.is_signed,
        'signed_at': consent.signed_at.isoformat() if consent.signed_at else None,
        'receipt_no': consent.receipt_no,
        'receipt_pdf_path': receipt_pdf_path,
        'receipt_pdf_url': f"{settings.MEDIA_URL}{receipt_pdf_path}" if receipt_pdf_path else None,
        'status': 'signed' if consent.is_signed else 'pending',
    }}


@router.post('/consents/{icf_version_id}/face-sign', summary='人脸核身签署知情同意书')
@require_permission('my.consent.sign')
def face_sign_my_consent(request, icf_version_id: int, data: ConsentFaceSignIn):
    """L2 实名用户方可签署；写入审计用 signature_data 并返回回执号"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import AuthLevel
    if _compute_auth_level(subject) != AuthLevel.IDENTITY_VERIFIED:
        return 403, {
            'code': 403,
            'msg': '签署知情同意书需先完成实名认证',
            'data': None,
            'error_code': '403_IDENTITY_REQUIRED',
        }
    from .models import ICFVersion
    if not ICFVersion.objects.filter(id=icf_version_id).exists():
        return 404, {'code': 404, 'msg': 'ICF 版本不存在'}
    from .services.consent_service import sign_consent
    signature_data = {
        'verification_method': 'face_recognition',
        'face_verify_token': data.face_verify_token,
        'reading_duration_seconds': data.reading_duration_seconds or 0,
        'comprehension_quiz_passed': data.comprehension_quiz_passed is not False,
        'signed_at': timezone.now().isoformat(),
    }
    consent = sign_consent(subject.id, icf_version_id, signature_data=signature_data)
    from django.conf import settings
    receipt_pdf_path = (consent.signature_data or {}).get('receipt_pdf_path') if consent.signature_data else None
    return {'code': 200, 'msg': 'OK', 'data': {
        'consent_id': consent.id,
        'signed_at': consent.signed_at.isoformat() if consent.signed_at else None,
        'receipt_no': consent.receipt_no,
        'receipt_pdf_path': receipt_pdf_path,
        'receipt_pdf_url': f"{settings.MEDIA_URL}{receipt_pdf_path}" if receipt_pdf_path else None,
        'status': 'signed',
        'trace_id': None,
    }}


# ============================================================================
# 我的客服工单
# ============================================================================
@router.get('/support-tickets', summary='我的客服工单')
@require_permission('my.support.read')
def get_my_tickets(request):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.execution_service import list_support_tickets, calc_ticket_sla
    items = list_support_tickets(subject_id=subject.id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': t.id, 'ticket_no': t.ticket_no, 'category': t.category,
            'title': t.title, 'status': t.status,
            'priority': t.priority,
            'sla': calc_ticket_sla(t),
            'reply': t.reply, 'create_time': t.create_time.isoformat(),
        } for t in items],
    }}


@router.post('/support-tickets', summary='创建客服工单')
@require_permission('my.support.create')
def create_my_ticket(request, data: MySupportTicketIn):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .services.execution_service import create_support_ticket
    ticket = create_support_ticket(subject.id, data.title, data.content, data.category or 'question')
    return {'code': 200, 'msg': 'OK', 'data': {'id': ticket.id, 'ticket_no': ticket.ticket_no}}


# ============================================================================
# 我的礼金（仅 L2 实名用户可访问）
# ============================================================================
@router.get('/payments', summary='我的礼金记录')
@require_permission('my.payment.read')
def get_my_payments(request):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import AuthLevel
    if _compute_auth_level(subject) != AuthLevel.IDENTITY_VERIFIED:
        return 403, {
            'code': 403,
            'msg': '请先完成实名认证后再查看礼金',
            'data': None,
            'error_code': '403_IDENTITY_REQUIRED',
        }
    from .services.payment_service import list_payments
    items = list_payments(subject_id=subject.id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': p.id, 'payment_no': p.payment_no,
            'payment_type': p.payment_type, 'amount': str(p.amount),
            'status': p.status,
            'paid_at': p.paid_at.isoformat() if p.paid_at else None,
        } for p in items],
    }}


# ============================================================================
# 报名（C 端自助报名）
# ============================================================================
def _validate_registration(data: MyRegistrationIn):
    """报名入参校验，返回 (None, None) 或 (code, body)。"""
    import re
    if data.gender and data.gender not in ('male', 'female'):
        return 400, {'code': 400, 'msg': '请选择有效性别', 'error_code': 'INVALID_GENDER'}
    if data.age is not None and (data.age < 1 or data.age > 120):
        return 400, {'code': 400, 'msg': '年龄须在 1-120 之间', 'error_code': 'INVALID_AGE'}
    if data.email and not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', data.email.strip()):
        return 400, {'code': 400, 'msg': '请填写正确邮箱格式', 'error_code': 'INVALID_EMAIL'}
    from .models import SubjectSkinType
    if data.skin_type and data.skin_type not in dict(SubjectSkinType.choices):
        return 400, {'code': 400, 'msg': '请选择有效皮肤类型', 'error_code': 'INVALID_SKIN_TYPE'}
    return None, None


@router.post('/register', summary='受试者自助报名')
@require_permission('my.profile.update')
def register_for_plan(request, data: MyRegistrationIn):
    """受试者通过自助端报名参加招募计划；入参校验后落库。"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    err_code, err_body = _validate_registration(data)
    if err_body:
        return err_code, err_body
    from .models import Subject
    from .models_recruitment import RecruitmentPlan
    from .services.recruitment_service import create_registration
    plan = RecruitmentPlan.objects.filter(id=data.plan_id, is_deleted=False, status='active').first()
    if not plan:
        return 404, {'code': 404, 'msg': '招募计划不存在或已结束', 'error_code': 'PLAN_NOT_FOUND'}
    reg = create_registration(
        plan_id=data.plan_id, name=subject.name, phone=subject.phone,
        gender=data.gender or subject.gender, age=data.age or subject.age,
        email=(data.email or '').strip(), medical_history=(data.medical_history or '').strip(),
    )
    if data.skin_type:
        subject.skin_type = data.skin_type
        subject.save(update_fields=['skin_type', 'update_time'])
    # 处理推荐人
    if data.referrer_code:
        try:
            from .models_loyalty import SubjectReferral
            referrer = Subject.objects.filter(subject_no=data.referrer_code, is_deleted=False).first()
            if referrer and referrer.id != subject.id:
                SubjectReferral.objects.get_or_create(
                    referrer_id=referrer.id,
                    referred_id=subject.id,
                    plan_id=data.plan_id,
                    defaults={'status': 'active'},
                )
        except Exception:
            pass
    return {'code': 200, 'msg': 'OK', 'data': {'id': reg.id, 'registration_no': reg.registration_no}}


# ============================================================================
# AE 上报记录
# ============================================================================
@router.get('/adverse-events', summary='我的AE上报记录')
@require_permission('my.profile.read')
def get_my_adverse_events(request):
    """受试者查看自己的 AE 上报记录"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.safety.models import AdverseEvent
    aes = AdverseEvent.objects.filter(
        enrollment__subject=subject
    ).order_by('-report_date')
    items = [{
        'id': ae.id,
        'description': ae.description,
        'severity': ae.severity,
        'status': ae.status,
        'is_sae': ae.is_sae,
        'start_date': str(ae.start_date),
        'report_date': str(ae.report_date) if ae.report_date else '',
        'outcome': ae.outcome,
    } for ae in aes]
    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'total': len(items)}}


@router.get('/adverse-events/{ae_id}', summary='我的AE详情')
@require_permission('my.profile.read')
def get_my_adverse_event_detail(request, ae_id: int):
    """受试者查看自己的 AE 详情（含随访记录）"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.safety.models import AdverseEvent
    ae = AdverseEvent.objects.filter(
        id=ae_id, enrollment__subject=subject
    ).first()
    if not ae:
        return 404, {'code': 404, 'msg': 'AE不存在'}
    follow_ups = [{
        'id': f.id, 'sequence': f.sequence,
        'followup_date': str(f.followup_date),
        'current_status': f.current_status,
        'outcome_update': f.outcome_update,
        'requires_further_followup': f.requires_further_followup,
        'next_followup_date': str(f.next_followup_date) if f.next_followup_date else None,
    } for f in ae.follow_ups.all()]
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': ae.id, 'description': ae.description,
        'severity': ae.severity, 'status': ae.status,
        'is_sae': ae.is_sae, 'start_date': str(ae.start_date),
        'report_date': str(ae.report_date) if ae.report_date else '',
        'action_taken': ae.action_taken, 'outcome': ae.outcome,
        'follow_ups': follow_ups,
    }}


# ============================================================================
# 受试者自助 AE 上报
# ============================================================================
class MyAEReportIn(Schema):
    symptom_description: str
    severity: str = 'mild'
    occur_date: Optional[str] = None
    # 多项目并存时由小程序传入；不传则取最近一条「已入组」记录
    enrollment_id: Optional[int] = None


@router.post(
    '/report-ae',
    summary='受试者自助上报不良反应',
    response={200: dict, 400: dict, 404: dict},
)
@require_permission('my.profile.update')
def report_adverse_event(request, data: MyAEReportIn):
    """受试者通过小程序直接上报 AE，自动创建 safety.AdverseEvent 记录"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}

    from apps.subject.models import Enrollment
    qs = Enrollment.objects.filter(subject=subject, status='enrolled')
    if data.enrollment_id is not None:
        enrollment = qs.filter(id=data.enrollment_id).first()
        if not enrollment:
            return 400, {
                'code': 400,
                'msg': '无效的入组记录或该项目尚未完成入组，请重新选择项目后再试',
            }
    else:
        enrollment = qs.order_by('-enrolled_at', '-id').first()
    if not enrollment:
        return 400, {
            'code': 400,
            'msg': '未找到有效入组记录：您可能仍处于「待入组审批」或未入组，完成后即可上报',
        }

    from apps.safety.services import create_adverse_event
    from datetime import date as date_type
    start_date = data.occur_date or str(date_type.today())
    ae = create_adverse_event(
        enrollment_id=enrollment.id,
        description=data.symptom_description,
        severity=data.severity,
        start_date=start_date,
        relation='possible',
        is_sae=(data.severity in ('severe', 'very_severe')),
    )
    return {'code': 200, 'msg': '上报成功', 'data': {
        'id': ae.id, 'severity': ae.severity, 'status': ae.status,
    }}


# ============================================================================
# 检测结果、样品签收、推荐、依从性、退出研究
# ============================================================================
@router.get('/results', summary='我的检测结果')
@require_permission('my.profile.read')
def get_my_results(request):
    """获取受试者最近的检测结果摘要"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.edc.models import CRFRecord
    from apps.workorder.models import WorkOrder
    wo_ids = list(WorkOrder.objects.filter(
        schedule_slot__subject=subject
    ).values_list('id', flat=True))
    records = CRFRecord.objects.filter(
        work_order_id__in=wo_ids, status='completed'
    ).select_related('template').order_by('-create_time')[:10]
    items = [{
        'id': r.id,
        'template_name': r.template.template_name if r.template else '',
        'completed_at': r.create_time.isoformat(),
    } for r in records]
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.post('/sample-confirm', summary='确认样品签收')
@require_permission('my.profile.update')
def confirm_my_sample(request, dispensing_id: int):
    """受试者确认产品领用"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    try:
        from apps.sample.models_product import ProductDispensing
        dispensing = ProductDispensing.objects.filter(
            id=dispensing_id, subject_id=subject.id
        ).first()
        if not dispensing:
            return 404, {'code': 404, 'msg': '分发记录不存在'}
        dispensing.status = 'confirmed'
        dispensing.confirmed_at = timezone.now()
        dispensing.subject_signature = True
        dispensing.save(update_fields=['status', 'confirmed_at', 'subject_signature', 'update_time'])
        try:
            from apps.audit.models import AuditLog, AuditAction
            account = _get_account_from_request(request)
            if account:
                AuditLog.objects.create(
                    account_id=account.id,
                    account_name=account.display_name or account.username,
                    account_type=account.account_type,
                    action=AuditAction.SIGN,
                    description='受试者样品领用确认（布尔确认，符合化妆品临床最小审计要求）',
                    resource_type='product_dispensing',
                    resource_id=str(dispensing.id),
                    resource_name=getattr(dispensing, 'dispensing_no', '') or '',
                    new_value={
                        'status': dispensing.status,
                        'subject_signature': True,
                        'confirmed_at': dispensing.confirmed_at.isoformat() if dispensing.confirmed_at else None,
                    },
                    changed_fields=['status', 'subject_signature', 'confirmed_at'],
                    ip_address=request.META.get('REMOTE_ADDR'),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                )
        except Exception:
            pass
        return {'code': 200, 'msg': '签收确认成功'}
    except Exception as e:
        return 500, {'code': 500, 'msg': str(e)}


def _build_product_lifecycle(subject_id: int, dispensing):
    from apps.sample.models_product import ProductUsage, ProductReturn, ProductRecall

    usages = list(ProductUsage.objects.filter(dispensing_id=dispensing.id).order_by('-period_end', '-create_time'))
    returns = list(ProductReturn.objects.filter(dispensing_id=dispensing.id).order_by('-create_time'))
    latest_usage = usages[0] if usages else None
    latest_return = returns[0] if returns else None

    recalls_qs = ProductRecall.objects.filter(
        product_id=dispensing.product_id,
        status__in=['initiated', 'in_progress'],
    )
    if dispensing.batch_id:
        recalls_qs = recalls_qs.filter(
            Q(affected_batches__id=dispensing.batch_id) | Q(affected_batches__isnull=True)
        )
    recalls = list(recalls_qs.distinct().order_by('-create_time')[:5])

    is_returned = latest_return is not None and latest_return.status in ['returned', 'inspected', 'processed']
    active_state = dispensing.status in ['prepared', 'dispensed', 'confirmed'] and not is_returned

    return {
        'dispensing_id': dispensing.id,
        'dispensing_no': dispensing.dispensing_no,
        'product_id': dispensing.product_id,
        'product_name': dispensing.product.name if dispensing.product else '',
        'product_code': dispensing.product.code if getattr(dispensing.product, 'code', None) else '',
        'status': dispensing.status,
        'subject_signature': dispensing.subject_signature,
        'quantity_dispensed': dispensing.quantity_dispensed,
        'visit_code': dispensing.visit_code,
        'visit_date': str(dispensing.visit_date) if dispensing.visit_date else None,
        'next_visit_date': str(dispensing.next_visit_date) if dispensing.next_visit_date else None,
        'usage_instructions': dispensing.usage_instructions or '',
        'batch_no': dispensing.batch.batch_no if dispensing.batch else '',
        'kit_number': dispensing.kit.kit_number if dispensing.kit else '',
        'dispensed_at': dispensing.dispensed_at.isoformat() if dispensing.dispensed_at else None,
        'confirmed_at': dispensing.confirmed_at.isoformat() if dispensing.confirmed_at else None,
        'latest_usage': {
            'id': latest_usage.id,
            'period_start': str(latest_usage.period_start),
            'period_end': str(latest_usage.period_end),
            'expected_usage': latest_usage.expected_usage,
            'actual_usage': latest_usage.actual_usage,
            'remaining_quantity': latest_usage.remaining_quantity,
            'compliance_status': latest_usage.compliance_status,
            'compliance_rate': float(latest_usage.compliance_rate) if latest_usage.compliance_rate is not None else None,
            'notes': latest_usage.notes or '',
        } if latest_usage else None,
        'latest_return': {
            'id': latest_return.id,
            'return_no': latest_return.return_no,
            'status': latest_return.status,
            'return_reason': latest_return.return_reason,
            'returned_quantity': latest_return.returned_quantity,
            'unused_quantity': latest_return.unused_quantity,
            'used_quantity': latest_return.used_quantity,
            'returned_at': latest_return.returned_at.isoformat() if latest_return.returned_at else None,
            'notes': latest_return.notes or '',
        } if latest_return else None,
        'active_recalls': [{
            'id': r.id,
            'recall_no': r.recall_no,
            'recall_title': r.recall_title,
            'recall_level': r.recall_level,
            'recall_reason': r.recall_reason,
            'status': r.status,
        } for r in recalls],
        'active_state': active_state,
    }


@router.get('/products', summary='我的产品列表')
@require_permission('my.profile.read')
def get_my_products(request, status: Optional[str] = 'all'):
    """受试者查看产品领用全生命周期列表"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.sample.models_product import ProductDispensing

    dispensings = ProductDispensing.objects.filter(
        subject_id=subject.id
    ).select_related('product', 'batch', 'kit').order_by('-dispensed_at', '-create_time')

    items = [_build_product_lifecycle(subject.id, d) for d in dispensings]
    if status == 'active':
        items = [i for i in items if i['active_state']]
    elif status == 'closed':
        items = [i for i in items if not i['active_state']]

    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'total': len(items)}}


@router.get('/products/{dispensing_id}', summary='我的产品详情')
@require_permission('my.profile.read')
def get_my_product_detail(request, dispensing_id: int):
    """受试者查看单个产品的领用-使用-归还-召回详情"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.sample.models_product import ProductDispensing, ProductUsage, ProductReturn

    dispensing = ProductDispensing.objects.filter(
        id=dispensing_id, subject_id=subject.id
    ).select_related('product', 'batch', 'kit').first()
    if not dispensing:
        return 404, {'code': 404, 'msg': '产品领用记录不存在'}

    lifecycle = _build_product_lifecycle(subject.id, dispensing)
    usages = ProductUsage.objects.filter(dispensing_id=dispensing.id).order_by('-period_end', '-create_time')
    returns = ProductReturn.objects.filter(dispensing_id=dispensing.id).order_by('-create_time')
    timeline = []
    if dispensing.dispensed_at:
        timeline.append({
            'type': 'dispensed',
            'time': dispensing.dispensed_at.isoformat(),
            'title': '已领用',
            'description': f"领用数量 {dispensing.quantity_dispensed}",
        })
    if dispensing.confirmed_at:
        timeline.append({
            'type': 'confirmed',
            'time': dispensing.confirmed_at.isoformat(),
            'title': '已签收确认',
            'description': '受试者已完成签收',
        })
    for u in usages:
        timeline.append({
            'type': 'usage',
            'time': u.create_time.isoformat(),
            'title': '使用记录',
            'description': f"实际使用 {u.actual_usage or 0}，依从性 {u.get_compliance_status_display()}",
        })
    for r in returns:
        timeline.append({
            'type': 'return',
            'time': r.create_time.isoformat(),
            'title': '归还记录',
            'description': f"状态 {r.get_status_display()}，归还数量 {r.returned_quantity}",
        })
    timeline = sorted(timeline, key=lambda x: x['time'] or '', reverse=True)

    return {'code': 200, 'msg': 'OK', 'data': {
        **lifecycle,
        'usages': [{
            'id': u.id,
            'period_start': str(u.period_start),
            'period_end': str(u.period_end),
            'expected_usage': u.expected_usage,
            'actual_usage': u.actual_usage,
            'remaining_quantity': u.remaining_quantity,
            'compliance_status': u.compliance_status,
            'compliance_status_display': u.get_compliance_status_display(),
            'compliance_rate': float(u.compliance_rate) if u.compliance_rate is not None else None,
            'notes': u.notes or '',
            'create_time': u.create_time.isoformat(),
        } for u in usages],
        'returns': [{
            'id': r.id,
            'return_no': r.return_no,
            'status': r.status,
            'status_display': r.get_status_display(),
            'return_reason': r.return_reason,
            'return_reason_display': r.get_return_reason_display(),
            'returned_quantity': r.returned_quantity,
            'unused_quantity': r.unused_quantity,
            'used_quantity': r.used_quantity,
            'notes': r.notes or '',
            'create_time': r.create_time.isoformat(),
        } for r in returns],
        'timeline': timeline,
    }}


@router.get('/products-reminders', summary='我的产品依从提醒')
@require_permission('my.profile.read')
def get_my_product_reminders(request):
    """受试者依从性与召回提醒汇总"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.sample.models_product import ProductDispensing

    dispensings = ProductDispensing.objects.filter(
        subject_id=subject.id
    ).select_related('product', 'batch', 'kit').order_by('-create_time')[:20]
    reminders = []
    today = timezone.now().date()
    for d in dispensings:
        lifecycle = _build_product_lifecycle(subject.id, d)
        if lifecycle['active_recalls']:
            reminders.append({
                'level': 'high',
                'type': 'recall',
                'dispensing_id': d.id,
                'title': f"{lifecycle['product_name']} 存在召回提醒",
                'description': lifecycle['active_recalls'][0]['recall_title'],
            })
        latest_usage = lifecycle.get('latest_usage')
        if lifecycle['active_state'] and not latest_usage:
            reminders.append({
                'level': 'medium',
                'type': 'usage_missing',
                'dispensing_id': d.id,
                'title': f"{lifecycle['product_name']} 需补充使用记录",
                'description': '建议今日完成一次使用记录填报',
            })
        nvd = d.next_visit_date
        if nvd and 0 <= (nvd - today).days <= 3:
            reminders.append({
                'level': 'medium',
                'type': 'return_window',
                'dispensing_id': d.id,
                'title': f"{lifecycle['product_name']} 临近访视窗口",
                'description': f"下次访视 {nvd}，请准备产品与包装用于归还/核验",
            })
    return {'code': 200, 'msg': 'OK', 'data': {'items': reminders, 'total': len(reminders)}}


@router.get('/referrals', summary='我的推荐记录')
@require_permission('my.profile.read')
def get_my_referrals(request):
    """获取推荐记录及奖励状态"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import Subject
    from .models_loyalty import SubjectReferral
    referrals = SubjectReferral.objects.filter(
        referrer_id=subject.id, is_deleted=False,
    ).order_by('-create_time')
    referred_ids = [r.referred_id for r in referrals if r.referred_id]
    referred_map = {
        s.id: s for s in Subject.objects.filter(id__in=referred_ids, is_deleted=False)
    } if referred_ids else {}
    items = []
    for r in referrals:
        referred = referred_map.get(r.referred_id)
        items.append({
            'id': r.id,
            'referred_name': referred.name if referred else '',
            'status': r.status,
            'reward_payment_id': r.reward_payment_id,
            'create_time': r.create_time.isoformat(),
        })
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.post('/referral', summary='创建推荐')
@require_permission('my.profile.update')
def create_my_referral(request):
    """生成推荐码"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    return {'code': 200, 'msg': 'OK', 'data': {'referral_code': subject.subject_no}}


@router.get('/compliance', summary='我的依从性评估')
@require_permission('my.profile.read')
def get_my_compliance(request):
    """获取依从性评估历史"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_execution import ComplianceRecord
    records = ComplianceRecord.objects.filter(
        subject=subject
    ).order_by('-evaluation_date')[:10]
    latest = records.first()
    history = [{
        'id': r.id,
        'overall_score': float(r.overall_score) if r.overall_score else 0,
        'rating': r.rating,
        'evaluation_date': str(r.evaluation_date),
    } for r in records]
    return {'code': 200, 'msg': 'OK', 'data': {
        'latest_score': float(latest.overall_score) if latest and latest.overall_score else 0,
        'latest_rating': latest.rating if latest else '',
        'history': history,
    }}


@router.post('/withdraw', summary='主动退出研究')
@require_permission('my.profile.update')
def withdraw_from_study(request, data: MyWithdrawIn):
    """受试者主动退出研究"""
    from django.utils import timezone as tz
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}

    subject.status = 'withdrawn'
    subject.save(update_fields=['status', 'update_time'])

    # 取消未执行的工单
    from apps.workorder.models import WorkOrder
    WorkOrder.objects.filter(
        schedule_slot__subject=subject,
        status__in=['pending', 'assigned'],
    ).update(status='cancelled', update_time=tz.now())

    # 释放排程时间槽
    from apps.scheduling.models import ScheduleSlot
    ScheduleSlot.objects.filter(
        subject=subject, status='booked',
    ).update(status='released', update_time=tz.now())

    # 通知项目团队
    try:
        from libs.notification import NOTIFICATION_CHAT_ID, _safe_send, _build_card
        card = _build_card(
            title='受试者主动退出研究',
            color='red',
            fields=[
                {'name': '受试者', 'value': f'{subject.name} ({subject.subject_no})'},
                {'name': '退出原因', 'value': data.reason},
                {'name': '详细说明', 'value': data.reason_detail or '无'},
            ],
            note='维周·执行台 - 请及时处理退出相关事宜',
        )
        _safe_send(NOTIFICATION_CHAT_ID, 'interactive', card)
    except Exception:
        pass

    return {'code': 200, 'msg': '退出申请已提交', 'data': {'status': 'withdrawn'}}


@router.get('/queue-position', summary='我的排队位置')
@require_permission('my.profile.read')
def get_my_queue_position(request):
    """查询受试者当前排队位置"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    try:
        from .models_execution import ReceptionBoardCheckin
        from .services.queue_service import format_local_hhmm

        today = timezone.localdate()
        rows = list(
            ReceptionBoardCheckin.objects.filter(
                subject_id=subject.id,
                checkin_date=today,
                checkin_time__isnull=False,
            ).order_by('-checkin_time', '-id')
        )
        if not rows:
            return {'code': 200, 'msg': 'OK', 'data': {'position': 0, 'ahead_count': 0, 'wait_minutes': 0, 'status': 'none'}}

        latest = rows[0]
        if latest.checkout_time:
            return {'code': 200, 'msg': 'OK', 'data': {'position': 0, 'ahead_count': 0, 'wait_minutes': 0, 'status': 'completed'}}

        open_rows = list(
            ReceptionBoardCheckin.objects.filter(
                checkin_date=today,
                checkin_time__isnull=False,
                checkout_time__isnull=True,
            ).order_by('checkin_time', 'id')
        )
        ahead_count = sum(1 for r in open_rows if r.subject_id != subject.id and (r.checkin_time or dt_datetime.min) < (latest.checkin_time or dt_datetime.min))
        position = ahead_count + 1
        wait_minutes = ahead_count * 10
        result = {
            'position': position,
            'ahead_count': ahead_count,
            'wait_minutes': wait_minutes,
            'status': 'waiting',
            'checkin_time': format_local_hhmm(latest.checkin_time),
        }
        return {'code': 200, 'msg': 'OK', 'data': result}
    except Exception:
        return {'code': 200, 'msg': 'OK', 'data': {'position': 0, 'wait_minutes': 0, 'status': 'none'}}


@router.post('/scan-checkin', summary='受试者扫码签到/签出（智能判断）')
@require_permission('my.profile.update')
def my_scan_checkin(request, data: Optional[ScanCheckinIn] = Body(default=None)):
    """受试者扫接待台大屏场所码自助签到或签出。
    - 当日首次扫：签到
    - 已签到/执行中再扫：签出
    - 已签出再扫：重复签出提示
    - 非当日码：过期提示
    """
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {
            'code': 404,
            'msg': '未找到受试者信息，请先在首页绑定预约时登记的手机号',
            'data': None,
        }

    qr_content = (data.qr_content or '').strip() if data else ''

    location = ''
    if qr_content:
        # 1) 新式当日动态码（ckiss-station:...）
        from apps.qrcode.services import parse_daily_station_qr_content
        daily_info = parse_daily_station_qr_content(qr_content)
        if daily_info is not None:
            if not daily_info.get('is_valid'):
                return 400, {'code': 400, 'msg': '二维码已过期，请扫描现场当日二维码', 'data': None}
            location = f"签到点#{daily_info['station_id']}"
            try:
                from apps.qrcode.models import QRCodeRecord, EntityType
                station_rec = QRCodeRecord.objects.filter(
                    entity_type=EntityType.STATION,
                    entity_id=daily_info['station_id'],
                    is_active=True,
                ).first()
                if station_rec:
                    location = station_rec.label or location
            except Exception:
                pass
        else:
            # 2) CN-KIS-CHECKIN-YYYYMMDD 格式（与 checkin_qrcode_service 一致）
            from .services.checkin_qrcode_service import validate_daily_checkin_qrcode
            valid, qr_err = validate_daily_checkin_qrcode(qr_content)
            if valid:
                location = '签到码'
            elif qr_err and '过期' in qr_err:
                return 400, {'code': 400, 'msg': '二维码已过期，请扫描现场当日二维码', 'data': None}
            else:
                # 3) 旧式 hash URL 场所码（向后兼容）
                from apps.qrcode.services import resolve_qrcode, log_scan_event
                qr_info = resolve_qrcode(qr_content)
                if not qr_info:
                    return 400, {
                        'code': 400,
                        'msg': qr_err or '无效的签到码，请扫描接待台展示的当日二维码',
                        'data': None,
                    }
                if qr_info.get('entity_type') != 'station':
                    return 400, {'code': 400, 'msg': '该二维码不是签到码', 'data': None}
                location = qr_info.get('label', '')
                log_scan_event(
                    qr_record_id=qr_info.get('id'),
                    scanner_id=subject.id,
                    workstation='reception',
                    action='self_checkin',
                )

    from .services import reception_service as reception_svc
    from .models_execution import ReceptionBoardCheckin

    today = reception_svc._local_today()

    open_board = (
        ReceptionBoardCheckin.objects.filter(
            subject_id=subject.id,
            checkin_date=today,
            checkin_time__isnull=False,
            checkout_time__isnull=True,
        )
        .order_by('checkin_time', 'id')
        .first()
    )
    if open_board is not None:
        # 小程序扫码仅影响接待看板，不写工单执行 SubjectCheckin。
        result = reception_svc.board_checkout(subject.id, target_date=today)
        return {'code': 200, 'msg': '签出成功', 'data': {**result, 'action': 'checkout'}}

    # 仅「签到/签出时间曾写过」算有过看板记录；两行均为 NULL 的空壳（如库内批量清空）视为可再次签到
    has_meaningful_board_today = ReceptionBoardCheckin.objects.filter(
        subject_id=subject.id,
        checkin_date=today,
    ).filter(Q(checkin_time__isnull=False) | Q(checkout_time__isnull=False)).exists()
    if (not has_meaningful_board_today) or reception_svc.has_pending_appointments_for_checkin(
        subject.id, today
    ):
        # 首次签到，或同日仍有待到访预约时再次签到：仅写接待看板链路。
        appt_ctx = reception_svc.resolve_today_appointment_for_quick_checkin(subject.id, None, today)
        project_code = (appt_ctx.project_code or '').strip() if appt_ctx else None
        result = reception_svc.board_checkin(
            subject_id=subject.id,
            target_date=today,
            project_code=project_code or None,
        )
        return {
            'code': 200,
            'msg': '签到成功',
            'data': {
                **result,
                'action': 'checkin',
                'location': location,
                'project_name': (getattr(appt_ctx, 'project_name', '') or '').strip() if appt_ctx else '',
                'visit_point': (getattr(appt_ctx, 'visit_point', '') or '').strip() if appt_ctx else '',
            },
        }

    last_done = (
        ReceptionBoardCheckin.objects.filter(
            subject_id=subject.id,
            checkin_date=today,
            checkout_time__isnull=False,
        )
        .order_by('-checkout_time', '-id')
        .first()
    )
    return {
        'code': 200,
        'msg': '您今日已完成签出，无需重复操作',
        'data': {
            'action': 'already_checked_out',
            'checkin_id': last_done.id if last_done else None,
            'checkout_time': last_done.checkout_time.isoformat() if last_done and last_done.checkout_time else None,
        },
    }


# ============================================================================
# NPS 评分
# ============================================================================
class NpsSubmitIn(Schema):
    plan_id: int = 0
    score: int
    comment: Optional[str] = ''


@router.post('/nps', summary='提交 NPS 评分')
@require_permission('my.profile.update')
def submit_nps(request, data: NpsSubmitIn):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    if not (0 <= data.score <= 10):
        return 400, {'code': 400, 'msg': '评分范围 0-10'}
    from .models_loyalty import SubjectNPS
    nps = SubjectNPS.objects.create(
        subject_id=subject.id,
        plan_id=data.plan_id or None,
        score=data.score,
        comment=data.comment or '',
    )
    return {'code': 200, 'msg': '感谢您的反馈', 'data': {'id': nps.id, 'score': nps.score}}


# ============================================================================
# 受试者日记 (eDiary)
# ============================================================================
def _resolve_diary_project_id_for_subject(subject):
    """
    不传 project_id 时：按手机号对应受试者的入组/项目编号，对齐全链路 project_no，
    找到存在「已发布且研究员已确认」日记配置的全链路项目 ID。

    优先级（同项目多条来源取最高优先级）：已入组 enrollment > 待入组 enrollment >
    受试者项目 SC 记录 > 预约中的 project_code。
    匹配规则：protocol.code / project_code 与 project_full_link.Project.project_no 一致（去空格后全等）。
    """
    from apps.project_full_link.models import Project
    from .models import Enrollment, EnrollmentStatus
    from .models_diary_config import SubjectDiaryConfig, SubjectDiaryConfigStatus
    from .models_execution import SubjectAppointment, SubjectProjectSC

    def _has_usable_diary(pid: int) -> bool:
        return SubjectDiaryConfig.objects.filter(
            project_id=pid,
            status=SubjectDiaryConfigStatus.PUBLISHED,
            researcher_confirmed_at__isnull=False,
        ).exists()

    def _pid_for_code(code: str):
        c = (code or '').strip()
        if not c:
            return None
        proj = Project.objects.filter(project_no=c, is_delete=False).first()
        if not proj or not _has_usable_diary(proj.id):
            return None
        return proj.id

    best: dict[int, tuple[int, object]] = {}

    def _consider(pid: int, priority: int, sort_time):
        prev = best.get(pid)
        st = sort_time
        if prev is None:
            best[pid] = (priority, st)
            return
        pr_prev, st_prev = prev
        if priority > pr_prev:
            best[pid] = (priority, st)
            return
        if priority < pr_prev:
            return
        if st_prev is None and st is not None:
            best[pid] = (priority, st)
        elif st_prev is not None and st is not None and st > st_prev:
            best[pid] = (priority, st)

    enrollments = Enrollment.objects.filter(subject=subject).select_related('protocol').order_by('-create_time')
    for e in enrollments:
        pid = _pid_for_code(e.protocol.code if e.protocol else '')
        if pid is None:
            continue
        if e.status == EnrollmentStatus.ENROLLED:
            pri = 100
        elif e.status == EnrollmentStatus.PENDING:
            pri = 80
        elif e.status == EnrollmentStatus.COMPLETED:
            pri = 60
        else:
            pri = 40
        sort_t = e.enrolled_at or e.create_time
        _consider(pid, pri, sort_t)

    for rec in SubjectProjectSC.objects.filter(subject=subject, is_deleted=False).order_by('-update_time'):
        pid = _pid_for_code(rec.project_code)
        if pid is None:
            continue
        _consider(pid, 50, rec.update_time)

    for a in SubjectAppointment.objects.filter(subject=subject).order_by('-create_time'):
        pid = _pid_for_code(a.project_code)
        if pid is None:
            continue
        _consider(pid, 30, a.create_time)

    if not best:
        return None
    return max(
        best.keys(),
        key=lambda p: (
            best[p][0],
            best[p][1].timestamp() if getattr(best[p][1], 'timestamp', None) else 0.0,
        ),
    )


@router.get('/diary/config', summary='日记表单配置（2.0 项目级）')
@require_permission('my.profile.read')
def get_diary_config(
    request,
    project_id: Optional[int] = Query(
        None,
        description='全链路项目主键；不传则按入组/项目编号与全链路 project_no 自动匹配',
    ),
):
    """
    拉取指定项目下已发布且研究员已确认的最新日记配置。
    project_id 与 project_full_link.Project.id 一致；省略时由后端根据受试者入组等自动解析。
    """
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_diary_config import SubjectDiaryConfig, SubjectDiaryConfigStatus

    resolved = project_id
    if resolved is None or resolved <= 0:
        resolved = _resolve_diary_project_id_for_subject(subject)
        if resolved is None:
            return 404, {
                'code': 404,
                'msg': (
                    '未能自动匹配日记项目：请确认协议编号与全链路项目编号一致且已发布日记配置，'
                    '或在请求中指定 project_id'
                ),
                'data': None,
            }

    cfg = (
        SubjectDiaryConfig.objects.filter(
            project_id=resolved,
            status=SubjectDiaryConfigStatus.PUBLISHED,
            researcher_confirmed_at__isnull=False,
        )
        .order_by('-id')
        .first()
    )
    if not cfg:
        return 404, {
            'code': 404,
            'msg': '该项目暂无可用日记配置（未发布或未确认）',
            'data': {'project_id': resolved},
        }
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': cfg.id,
            'project_id': cfg.project_id,
            'project_no': cfg.project_no or '',
            'config_version_label': cfg.config_version_label or '',
            'form_definition_json': cfg.form_definition_json,
            'rule_json': cfg.rule_json,
            'status': cfg.status,
            'researcher_confirmed_at': (
                cfg.researcher_confirmed_at.isoformat() if cfg.researcher_confirmed_at else None
            ),
            'supervisor_confirmed_at': (
                cfg.supervisor_confirmed_at.isoformat() if cfg.supervisor_confirmed_at else None
            ),
            'create_time': cfg.create_time.isoformat(),
            'update_time': cfg.update_time.isoformat(),
        },
    }


class DiaryEntryIn(Schema):
    mood: Optional[str] = ''
    symptoms: Optional[str] = ''
    medication_taken: bool = True
    symptom_severity: Optional[str] = ''
    symptom_onset: Optional[str] = ''
    symptom_duration: Optional[str] = ''
    notes: Optional[str] = ''
    """规定使用日期 YYYY-MM-DD；不传则使用服务端当日（TIME_ZONE 本地日历）"""
    entry_date: Optional[date] = None

    @field_validator('mood', 'symptoms', 'notes', 'symptom_severity', 'symptom_onset', 'symptom_duration', mode='before')
    @classmethod
    def _normalize_diary_text_fields(cls, v):
        from .diary_text import normalize_diary_text_field

        return normalize_diary_text_field(v)


def _subject_diary_match_codes(subject) -> list:
    """
    入组 / SC / 预约 侧的项目编号（去重保序）。
    用于在「全链表 project_no 与协议编号略有偏差」时，仍能靠 SubjectDiaryConfig.project_no 命中配置并得到 diary_period。
    """
    from .models import Enrollment
    from .models_execution import SubjectProjectSC, SubjectAppointment

    codes = []
    seen = set()
    for e in Enrollment.objects.filter(subject=subject).select_related('protocol'):
        if e.protocol and e.protocol.code:
            c = (e.protocol.code or '').strip()
            if c and c not in seen:
                seen.add(c)
                codes.append(c)
    for rec in SubjectProjectSC.objects.filter(subject=subject, is_deleted=False):
        c = (rec.project_code or '').strip()
        if c and c not in seen:
            seen.add(c)
            codes.append(c)
    for a in SubjectAppointment.objects.filter(subject=subject):
        c = (a.project_code or '').strip()
        if c and c not in seen:
            seen.add(c)
            codes.append(c)
    return codes


def _project_ids_for_subject_codes(codes: list) -> list:
    if not codes:
        return []
    from apps.project_full_link.models import Project

    ids = []
    seen = set()
    for c in codes:
        proj = Project.objects.filter(project_no=c, is_delete=False).first()
        if proj and proj.id not in seen:
            seen.add(proj.id)
            ids.append(proj.id)
    return ids


def _extract_diary_period_from_rule_json(rj) -> Optional[dict]:
    if not isinstance(rj, dict):
        return None
    dp = rj.get('diary_period')
    start, end = None, None
    if isinstance(dp, dict):
        start = dp.get('start')
        end = dp.get('end')
    elif isinstance(dp, list) and dp and isinstance(dp[0], dict):
        start = dp[0].get('start')
        end = dp[0].get('end')

    def _norm(v):
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

    start_s, end_s = _norm(start), _norm(end)
    if not start_s and not end_s:
        return None
    return {'start': start_s, 'end': end_s}


def _extract_retrospective_days_max_from_rule_json(rj) -> int:
    """rule_json.retrospective_days_max：研究台「允许补填最多回溯天数」；非法或缺失时默认 7。"""
    if not isinstance(rj, dict):
        return 7
    v = rj.get('retrospective_days_max')
    try:
        n = int(v)
    except (TypeError, ValueError):
        return 7
    if n < 0:
        return 0
    if n > 366:
        return 366
    return n


def _diary_period_and_rule_from_entry_coverage(subject):
    """
    入组等路径拿不到编号时：若受试者已有日记行，则从「能覆盖其全部已填日期」的已发布配置中取 diary_period；
    多配置并存时取 period.start 最晚者（通常对应当前生效的研究窗），避免历史列表落回固定 N 天而出现周期外日期。
    """
    from .models_loyalty import SubjectDiary
    from .models_diary_config import SubjectDiaryConfig, SubjectDiaryConfigStatus

    dates = list(
        SubjectDiary.objects.filter(
            subject_id=subject.id,
            is_deleted=False,
        ).values_list('entry_date', flat=True)
    )
    if not dates:
        return None, None

    def ymd(d) -> str:
        if hasattr(d, 'isoformat'):
            return d.isoformat()[:10]
        return str(d)[:10]

    date_strs = sorted({ymd(d) for d in dates})

    best_meta = None
    best_rj = None
    best_start = ''
    best_cfg_id = -1

    qs = SubjectDiaryConfig.objects.filter(
        status=SubjectDiaryConfigStatus.PUBLISHED,
        researcher_confirmed_at__isnull=False,
    ).order_by('-id')

    for cfg in qs:
        meta = _extract_diary_period_from_rule_json(cfg.rule_json)
        if not meta or not meta.get('start'):
            continue
        s = meta['start']
        e_raw = (meta.get('end') or '').strip() if meta.get('end') else ''
        ok = True
        for ds in date_strs:
            if ds < s:
                ok = False
                break
            if e_raw and ds > e_raw:
                ok = False
                break
        if not ok:
            continue
        cid = cfg.id
        if best_meta is None or s > best_start or (s == best_start and cid > best_cfg_id):
            best_meta = meta
            best_start = s
            best_cfg_id = cid
            best_rj = cfg.rule_json if isinstance(cfg.rule_json, dict) else {}

    return best_meta, best_rj


def _diary_list_meta_bundle(subject, explicit_project_id: Optional[int] = None):
    """
    与 /my/diary 列表一并返回：应填周期 + 研究台配置的补填回溯天数（rule_json.retrospective_days_max）。
    解析顺序与历史逻辑一致；无任何命中周期时 retrospective_days_max 仍返回默认值 7。
    """
    from .models_diary_config import SubjectDiaryConfig, SubjectDiaryConfigStatus

    default_retro = 7

    if explicit_project_id is not None and int(explicit_project_id) > 0:
        cfg0 = (
            SubjectDiaryConfig.objects.filter(
                project_id=int(explicit_project_id),
                status=SubjectDiaryConfigStatus.PUBLISHED,
                researcher_confirmed_at__isnull=False,
            )
            .order_by('-id')
            .first()
        )
        if cfg0:
            rj0 = cfg0.rule_json if isinstance(cfg0.rule_json, dict) else {}
            meta0 = _extract_diary_period_from_rule_json(rj0)
            if meta0:
                return meta0, _extract_retrospective_days_max_from_rule_json(rj0)

    pid = _resolve_diary_project_id_for_subject(subject)
    if pid:
        cfg = (
            SubjectDiaryConfig.objects.filter(
                project_id=pid,
                status=SubjectDiaryConfigStatus.PUBLISHED,
                researcher_confirmed_at__isnull=False,
            )
            .order_by('-id')
            .first()
        )
        if cfg:
            rj = cfg.rule_json if isinstance(cfg.rule_json, dict) else {}
            meta = _extract_diary_period_from_rule_json(rj)
            if meta:
                return meta, _extract_retrospective_days_max_from_rule_json(rj)

    codes = _subject_diary_match_codes(subject)
    if codes:
        proj_ids = _project_ids_for_subject_codes(codes)
        cfg = (
            SubjectDiaryConfig.objects.filter(
                Q(project_no__in=codes) | Q(project_id__in=proj_ids),
                status=SubjectDiaryConfigStatus.PUBLISHED,
                researcher_confirmed_at__isnull=False,
            )
            .order_by('-id')
            .first()
        )
        if cfg:
            rj = cfg.rule_json if isinstance(cfg.rule_json, dict) else {}
            meta = _extract_diary_period_from_rule_json(rj)
            if meta:
                return meta, _extract_retrospective_days_max_from_rule_json(rj)

    meta, rj = _diary_period_and_rule_from_entry_coverage(subject)
    if meta:
        return meta, _extract_retrospective_days_max_from_rule_json(rj or {})
    return None, default_retro


def _diary_period_meta_for_subject(subject, explicit_project_id: Optional[int] = None):
    """
    与 /my/diary/config 尽量同源：可选 explicit_project_id（列表查询参数）优先；
    再全链路 project 解析；再按入组等编号匹配配置；最后用已有日记行反推可覆盖全部已填日期的配置周期。
    """
    period, _ = _diary_list_meta_bundle(subject, explicit_project_id)
    return period


@router.get('/diary', summary='日记列表')
@require_permission('my.profile.read')
def list_diary(
    request,
    page: int = 1,
    page_size: int = 30,
    project_id: Optional[int] = Query(
        None,
        description='可选。传入全链路 project_id 时优先用该项目已发布日记配置的 diary_period（无入组编号也能裁剪历史）',
    ),
):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_loyalty import SubjectDiary
    qs = SubjectDiary.objects.filter(
        subject_id=subject.id, is_deleted=False,
    ).order_by('-entry_date')
    total = qs.count()
    start = (page - 1) * page_size
    items = qs[start:start + page_size]
    diary_period, retrospective_days_max = _diary_list_meta_bundle(subject, explicit_project_id=project_id)
    from .diary_text import diary_symptom_fields_for_api, normalize_diary_text_field

    def _item(d):
        sym = diary_symptom_fields_for_api(d)
        return {
            'id': d.id,
            'entry_date': d.entry_date.isoformat(),
            'mood': normalize_diary_text_field(d.mood),
            'symptoms': normalize_diary_text_field(d.symptoms),
            'medication_taken': d.medication_taken,
            'symptom_severity': sym['symptom_severity'],
            'symptom_onset': sym['symptom_onset'],
            'symptom_duration': sym['symptom_duration'],
            'notes': sym['notes'],
        }

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_item(d) for d in items],
        'total': total,
        'diary_period': diary_period,
        'retrospective_days_max': retrospective_days_max,
    }}


@router.post('/diary', summary='新增日记')
@require_permission('my.profile.update')
def create_diary(request, data: DiaryEntryIn):
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from django.utils import timezone
    from .models_loyalty import SubjectDiary
    target_date = data.entry_date if data.entry_date is not None else timezone.localdate()
    existing = SubjectDiary.objects.filter(
        subject_id=subject.id, entry_date=target_date, is_deleted=False,
    ).first()
    if existing:
        return 400, {'code': 400, 'msg': '该日期已提交日记，不可重复提交', 'data': None}
    entry = SubjectDiary.objects.create(
        subject_id=subject.id,
        entry_date=target_date,
        mood=data.mood or '良好',
        symptoms=data.symptoms or '',
        medication_taken=data.medication_taken,
        symptom_severity=data.symptom_severity or '',
        symptom_onset=data.symptom_onset or '',
        symptom_duration=data.symptom_duration or '',
        notes=data.notes or '',
    )
    return {'code': 200, 'msg': '记录成功', 'data': {
        'id': entry.id, 'entry_date': entry.entry_date.isoformat(),
    }}


# ============================================================================
# 阶段10: 我的排程/随访 — 受试者查看自己的完整排程时间表
# ============================================================================
@router.get('/schedule', summary='我的排程时间表')
@require_permission('my.profile.read')
def get_my_schedule(request):
    """返回受试者所有入组项目的排程时间槽"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import Enrollment
    from apps.workorder.models import WorkOrder
    enrollments = Enrollment.objects.filter(subject=subject).values_list('id', flat=True)
    wo_qs = WorkOrder.objects.filter(
        enrollment_id__in=enrollments, is_deleted=False,
    ).select_related('visit_activity', 'schedule_slot').order_by('schedule_slot__scheduled_date', 'schedule_slot__start_time')

    items = []
    for wo in wo_qs:
        slot = wo.schedule_slot
        items.append({
            'id': wo.id,
            'title': wo.title,
            'status': wo.status,
            'visit_name': wo.visit_activity.node.name if wo.visit_activity and wo.visit_activity.node else '',
            'activity_name': wo.visit_activity.activity_template.name if wo.visit_activity and wo.visit_activity.activity_template else '',
            'scheduled_date': slot.scheduled_date.isoformat() if slot else None,
            'start_time': slot.start_time.isoformat() if slot and slot.start_time else None,
            'slot_status': slot.status if slot else '',
        })
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/upcoming-visits', summary='即将到来的访视')
@require_permission('my.profile.read')
def get_upcoming_visits(request, days: int = 30):
    """近N天即将到来的访视/随访安排"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from django.utils import timezone
    from datetime import timedelta
    from .models_execution import SubjectAppointment
    today = timezone.now().date()
    end = today + timedelta(days=days)

    appts = list(
        SubjectAppointment.objects.filter(
            subject=subject,
            appointment_date__gte=today,
            appointment_date__lte=end,
            status__in=['pending', 'confirmed'],
        ).order_by('appointment_date', 'appointment_time')
    )

    # 排除「今天但预约时点已过」的条目，避免首页「下次访视」展示过期时段（仍保留无具体时间的当日预约）
    now_local = timezone.localtime(timezone.now())
    today_local = now_local.date()
    now_t = now_local.time()
    upcoming: list = []
    for a in appts:
        d = a.appointment_date
        if d > today_local:
            upcoming.append(a)
        elif d < today_local:
            continue
        else:
            if a.appointment_time is None or a.appointment_time >= now_t:
                upcoming.append(a)

    items = []
    for a in upcoming:
        tstr = None
        if a.appointment_time:
            tstr = a.appointment_time.strftime('%H:%M')
        items.append({
            'id': a.id,
            'date': a.appointment_date.isoformat(),
            'time': tstr,
            'purpose': a.purpose,
            'status': a.status,
        })

    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'total': len(items)}}


# ============================================================================
# 阶段5: 我的筛选结果
# ============================================================================
@router.get('/screening-status', summary='我的筛选状态')
@require_permission('my.profile.read')
def get_my_screening_status(request):
    """受试者查看自己的报名→粗筛→筛选→入组状态"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_recruitment import SubjectRegistration, ScreeningRecord, PreScreeningRecord, EnrollmentRecord

    regs = SubjectRegistration.objects.filter(phone=subject.phone).order_by('-create_time')
    result = []
    for reg in regs:
        entry = {
            'registration_id': reg.id,
            'registration_no': reg.registration_no,
            'plan_id': reg.plan_id,
            'reg_status': reg.status,
            'reg_date': reg.create_time.isoformat(),
            'pre_screening': None,
            'screening': None,
            'enrollment': None,
        }
        pre = PreScreeningRecord.objects.filter(registration=reg).order_by('-create_time').first()
        if pre:
            entry['pre_screening'] = {
                'id': pre.id, 'result': pre.result,
                'date': pre.pre_screening_date.isoformat() if pre.pre_screening_date else None,
                'notes': pre.notes or '',
            }
        screening = ScreeningRecord.objects.filter(registration=reg).order_by('-create_time').first()
        if screening:
            entry['screening'] = {
                'id': screening.id, 'result': screening.result,
                'date': screening.screened_at.isoformat() if screening.screened_at else None,
                'notes': screening.notes or '',
            }
        enrollment = EnrollmentRecord.objects.filter(registration=reg).order_by('-create_time').first()
        if enrollment:
            entry['enrollment'] = {
                'id': enrollment.id, 'status': enrollment.status,
                'enrollment_no': enrollment.enrollment_no,
                'date': enrollment.enrollment_date.isoformat() if enrollment.enrollment_date else None,
            }
        result.append(entry)

    return {'code': 200, 'msg': 'OK', 'data': {'items': result}}


# ============================================================================
# 阶段7: 我的工单进度（受试者可查看与自己相关的工单状态）
# ============================================================================
@router.get('/workorder-progress', summary='我的工单进度')
@require_permission('my.profile.read')
def get_my_workorder_progress(request):
    """受试者查看与自己入组项目相关的工单进度"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import Enrollment
    from apps.workorder.models import WorkOrder
    enrollment_ids = list(Enrollment.objects.filter(subject=subject).values_list('id', flat=True))
    wos = WorkOrder.objects.filter(
        enrollment_id__in=enrollment_ids, is_deleted=False,
    ).order_by('-create_time')[:50]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': wo.id, 'title': wo.title, 'status': wo.status,
            'due_date': wo.due_date.isoformat() if wo.due_date else None,
            'create_time': wo.create_time.isoformat(),
        } for wo in wos],
    }}


# ============================================================================
# 阶段7: 产品使用记录
# ============================================================================
class ProductUsageIn(Schema):
    dispensing_id: int
    usage_date: Optional[str] = None
    used_amount: Optional[str] = ''
    notes: Optional[str] = ''


class MyProductUsageIn(Schema):
    actual_usage: int
    period_days: int = 1
    notes: Optional[str] = ''
    adverse_event: Optional[str] = ''
    deviation: Optional[str] = ''


class MyProductReturnIn(Schema):
    return_reason: str = 'completion'
    return_reason_detail: Optional[str] = ''
    returned_quantity: int = 0
    unused_quantity: Optional[int] = None
    used_quantity: Optional[int] = None
    notes: Optional[str] = ''


@router.post('/product-usage', summary='记录产品使用')
@require_permission('my.profile.update')
def record_product_usage(request, data: ProductUsageIn):
    """受试者记录日常产品使用情况"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.sample.models_product import ProductDispensing
    dispensing = ProductDispensing.objects.filter(id=data.dispensing_id).first()
    if not dispensing:
        return 404, {'code': 404, 'msg': '领用记录不存在'}
    from .models_loyalty import SubjectDiary
    today = timezone.now().date()
    entry, _ = SubjectDiary.objects.get_or_create(
        subject_id=subject.id, entry_date=today,
        defaults={'mood': '', 'medication_taken': True},
    )
    usage_note = f'产品使用: dispensing#{data.dispensing_id}, 用量: {data.used_amount or "标准"}'
    if data.notes:
        usage_note += f', {data.notes}'
    entry.notes = (entry.notes or '') + '\n' + usage_note
    entry.medication_taken = True
    entry.save(update_fields=['notes', 'medication_taken', 'update_time'])
    return {'code': 200, 'msg': '使用记录已保存', 'data': {'diary_id': entry.id}}


@router.post('/products/{dispensing_id}/usage', summary='记录我的产品使用')
@require_permission('my.profile.update')
def create_my_product_usage(request, dispensing_id: int, data: MyProductUsageIn):
    """受试者记录产品使用与依从性"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.sample.models_product import ProductDispensing, ProductUsage

    dispensing = ProductDispensing.objects.filter(id=dispensing_id, subject_id=subject.id).first()
    if not dispensing:
        return 404, {'code': 404, 'msg': '产品领用记录不存在'}
    if data.actual_usage < 0:
        return 400, {'code': 400, 'msg': '实际使用量不能小于0'}

    period_days = max(1, min(30, data.period_days))
    period_end = timezone.now().date()
    period_start = period_end - timedelta(days=period_days - 1)
    expected_usage = max(1, dispensing.quantity_dispensed)
    remaining = max(0, dispensing.quantity_dispensed - data.actual_usage)
    compliance_rate = round((data.actual_usage / expected_usage) * 100, 2)
    if compliance_rate >= 95:
        compliance_status = 'full'
    elif compliance_rate >= 70:
        compliance_status = 'partial'
    else:
        compliance_status = 'non_compliant'

    usage = ProductUsage.objects.create(
        dispensing_id=dispensing.id,
        period_start=period_start,
        period_end=period_end,
        expected_usage=expected_usage,
        actual_usage=data.actual_usage,
        remaining_quantity=remaining,
        compliance_status=compliance_status,
        compliance_rate=compliance_rate,
        deviation_reported=bool(data.deviation),
        deviation_description=data.deviation or '',
        adverse_event_reported=bool(data.adverse_event),
        adverse_event_description=data.adverse_event or '',
        notes=data.notes or '',
        recorded_at=timezone.now(),
        recorded_by_id=subject.id,
        recorded_by_name=subject.name or subject.subject_no,
    )
    return {'code': 200, 'msg': '使用记录已保存', 'data': {
        'id': usage.id,
        'compliance_rate': float(usage.compliance_rate or 0),
        'compliance_status': usage.compliance_status,
        'compliance_status_display': usage.get_compliance_status_display(),
    }}


@router.post('/products/{dispensing_id}/return', summary='提交我的产品归还')
@require_permission('my.profile.update')
def create_my_product_return(request, dispensing_id: int, data: MyProductReturnIn):
    """受试者提交产品归还申请/登记"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from apps.sample.models_product import ProductDispensing, ProductReturn

    dispensing = ProductDispensing.objects.filter(id=dispensing_id, subject_id=subject.id).first()
    if not dispensing:
        return 404, {'code': 404, 'msg': '产品领用记录不存在'}

    returned_quantity = data.returned_quantity or dispensing.quantity_dispensed
    if returned_quantity <= 0:
        return 400, {'code': 400, 'msg': '归还数量必须大于0'}

    ret = ProductReturn.objects.create(
        return_no=f'RTN-{timezone.now().strftime("%Y%m%d%H%M%S")}-{subject.id}',
        status='pending',
        dispensing_id=dispensing.id,
        subject_id=subject.id,
        subject_code=subject.subject_no or '',
        product_id=dispensing.product_id,
        kit_id=dispensing.kit_id,
        return_reason=data.return_reason or 'completion',
        return_reason_detail=data.return_reason_detail or '',
        returned_quantity=returned_quantity,
        unused_quantity=data.unused_quantity,
        used_quantity=data.used_quantity,
        notes=data.notes or '',
    )
    return {'code': 200, 'msg': '归还申请已提交', 'data': {'id': ret.id, 'return_no': ret.return_no, 'status': ret.status}}


# ============================================================================
# 阶段11: 结项反馈
# ============================================================================
class CompletionFeedbackIn(Schema):
    enrollment_id: int
    overall_rating: int = 5
    service_rating: int = 5
    suggestions: Optional[str] = ''


@router.post('/completion-feedback', summary='结项满意度反馈')
@require_permission('my.profile.update')
def submit_completion_feedback(request, data: CompletionFeedbackIn):
    """受试者在项目结束后提交满意度反馈"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_loyalty import SubjectNPS
    SubjectNPS.objects.create(
        subject_id=subject.id,
        plan_id=data.enrollment_id,
        score=data.overall_rating,
        comment=f'服务评分:{data.service_rating}/5 建议:{data.suggestions or "无"}',
    )
    return {'code': 200, 'msg': '感谢您的反馈', 'data': None}


# ============================================================================
# 阶段12: 礼金明细（增强版）
# ============================================================================
@router.get('/payment-summary', summary='礼金汇总')
@require_permission('my.profile.read')
def get_my_payment_summary(request):
    """受试者礼金汇总: 总计/已发/待发/按类型分组；仅 L2 实名用户可访问"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models import AuthLevel
    if _compute_auth_level(subject) != AuthLevel.IDENTITY_VERIFIED:
        return 403, {
            'code': 403,
            'msg': '请先完成实名认证后再查看礼金',
            'data': None,
            'error_code': '403_IDENTITY_REQUIRED',
        }
    from django.db.models import Sum, Count
    from .models_execution import SubjectPayment
    payments = SubjectPayment.objects.filter(subject_id=subject.id, is_deleted=False)
    total = payments.aggregate(total=Sum('amount'))['total'] or 0
    paid = payments.filter(status='paid').aggregate(total=Sum('amount'))['total'] or 0
    pending = payments.filter(status='pending').aggregate(total=Sum('amount'))['total'] or 0

    by_type = payments.values('payment_type').annotate(
        count=Count('id'), amount=Sum('amount'),
    )

    return {'code': 200, 'msg': 'OK', 'data': {
        'total_amount': str(total),
        'paid_amount': str(paid),
        'pending_amount': str(pending),
        'by_type': [{
            'type': t['payment_type'],
            'count': t['count'],
            'amount': str(t['amount'] or 0),
        } for t in by_type],
    }}


# ============================================================================
# 阶段3: 我的消息/通知
# ============================================================================
@router.get('/notifications', summary='我的通知列表')
@require_permission('my.profile.read')
def get_my_notifications(request, page: int = 1, page_size: int = 20):
    """受试者查看系统发给自己的通知"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    account = _get_account_from_request(request)
    if not account:
        return {'code': 200, 'msg': 'OK', 'data': {'items': [], 'total': 0, 'unread': 0}}
    from apps.notification.models import NotificationRecord
    qs = NotificationRecord.objects.filter(
        recipient_id=account.id,
    ).order_by('-create_time')
    total = qs.count()
    unread = qs.filter(status__in=['sent', 'delivered']).count()
    start = (page - 1) * page_size
    items = qs[start:start + page_size]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': n.id, 'title': n.title, 'content': n.content[:200],
            'status': n.status, 'channel': n.channel,
            'sent_at': n.sent_at.isoformat() if n.sent_at else None,
            'create_time': n.create_time.isoformat(),
        } for n in items],
        'total': total,
        'unread': unread,
    }}


@router.post('/notifications/{nid}/read', summary='标记通知已读')
@require_permission('my.profile.update')
def mark_my_notification_read(request, nid: int):
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未登录'}
    from apps.notification.models import NotificationRecord
    record = NotificationRecord.objects.filter(id=nid, recipient_id=account.id).first()
    if record and record.status in ('sent', 'delivered'):
        record.status = 'read'
        record.save(update_fields=['status'])
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 阶段1/4: 项目详情 + 粗筛到场确认
# ============================================================================
def _serialize_available_plan_item(plan):
    start_date = plan.start_date.isoformat() if plan.start_date else None
    end_date = plan.end_date.isoformat() if plan.end_date else None
    target_count = int(plan.target_count or 0)
    enrolled_count = int(plan.enrolled_count or 0)
    completion_rate = round((enrolled_count / target_count) * 100, 2) if target_count > 0 else 0
    return {
        'id': plan.id,
        'title': plan.title,
        'description': plan.description,
        'protocol_title': plan.protocol.title if plan.protocol else '',
        'target_count': target_count,
        'enrolled_count': enrolled_count,
        'start_date': start_date,
        'end_date': end_date,
        'completion_rate': str(completion_rate),
        'remaining_slots': max(0, target_count - enrolled_count),
    }


def _build_plan_detail_data(plan):
    from .models_recruitment import EligibilityCriteria
    criteria_filter = {'plan': plan}
    if any(getattr(f, 'name', '') == 'is_deleted' for f in EligibilityCriteria._meta.get_fields()):
        criteria_filter['is_deleted'] = False
    criteria = EligibilityCriteria.objects.filter(**criteria_filter).order_by('sequence')
    start_date = plan.start_date.isoformat() if plan.start_date else None
    end_date = plan.end_date.isoformat() if plan.end_date else None
    return {
        'id': plan.id,
        'title': plan.title,
        'description': plan.description,
        'protocol_title': plan.protocol.title if plan.protocol else '',
        'start_date': start_date,
        'end_date': end_date,
        'target_count': int(plan.target_count or 0),
        'enrolled_count': int(plan.enrolled_count or 0),
        'criteria': [{
            'type': c.criteria_type,
            'description': c.description,
            'is_mandatory': c.is_mandatory,
        } for c in criteria],
    }


def _get_active_plans(limit: int = 20):
    from .models_recruitment import RecruitmentPlan
    filters = {'status': 'active'}
    if any(getattr(f, 'name', '') == 'is_deleted' for f in RecruitmentPlan._meta.get_fields()):
        filters['is_deleted'] = False
    return RecruitmentPlan.objects.filter(
        **filters,
    ).select_related('protocol').order_by('-create_time')[:limit]


def _get_plan_by_id(plan_id: int):
    from .models_recruitment import RecruitmentPlan
    filters = {'id': plan_id}
    if any(getattr(f, 'name', '') == 'is_deleted' for f in RecruitmentPlan._meta.get_fields()):
        filters['is_deleted'] = False
    return RecruitmentPlan.objects.filter(**filters).select_related('protocol').first()


@router.get('/public/plans', summary='游客可浏览项目列表')
def get_public_plans(request):
    """游客态可查看公开招募项目列表（不含个人信息）。"""
    plans = _get_active_plans()
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_serialize_available_plan_item(p) for p in plans],
    }}


@router.get('/public/plans/{plan_id}', summary='游客可浏览项目详情')
def get_public_plan_detail(request, plan_id: int):
    """游客态可查看公开项目详情与入排标准（不含个人信息）。"""
    plan = _get_plan_by_id(plan_id)
    if not plan:
        return 404, {'code': 404, 'msg': '项目不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _build_plan_detail_data(plan)}


@router.get('/available-plans', summary='可报名项目列表')
@require_permission('my.profile.read')
def get_available_plans(request):
    """受试者查看可报名的招募计划（含项目详情）"""
    plans = _get_active_plans()
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_serialize_available_plan_item(p) for p in plans],
    }}


@router.get('/plans/{plan_id}/detail', summary='项目详情')
@require_permission('my.profile.read')
def get_plan_detail(request, plan_id: int):
    """受试者查看单个招募计划详情（含入排标准）"""
    plan = _get_plan_by_id(plan_id)
    if not plan:
        return 404, {'code': 404, 'msg': '项目不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _build_plan_detail_data(plan)}


@router.get('/registration-status', summary='我的报名状态')
@require_permission('my.profile.read')
def get_my_registration_status(request):
    """查看受试者所有报名的当前处理状态"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_recruitment import SubjectRegistration
    regs = SubjectRegistration.objects.filter(phone=subject.phone).select_related('plan').order_by('-create_time')
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'registration_no': r.registration_no,
            'plan_title': r.plan.title if r.plan else '',
            'status': r.status,
            'create_time': r.create_time.isoformat(),
        } for r in regs],
    }}


@router.post('/confirm-arrival', summary='粗筛到场确认')
@require_permission('my.profile.update')
def confirm_arrival(request):
    """受试者扫码确认到场，更新报名状态为已到场"""
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}
    from .models_recruitment import SubjectRegistration
    reg = SubjectRegistration.objects.filter(
        phone=subject.phone,
        status__in=['registered', 'confirmed'],
    ).order_by('-create_time').first()
    if not reg:
        return 400, {'code': 400, 'msg': '无待处理的报名'}
    from django.utils import timezone
    reg.contacted_at = timezone.now()
    reg.contact_notes = (reg.contact_notes or '') + '\n受试者已到场确认'
    reg.save(update_fields=['contacted_at', 'contact_notes', 'update_time'])
    return {'code': 200, 'msg': '到场确认成功', 'data': {'registration_id': reg.id}}


@router.get('/recommended-projects', summary='获取智能推荐项目列表（P3.1）')
@require_permission('my.profile.read')
def get_recommended_projects(request):
    """
    根据受试者档案（肤质、过敏史、健康史、参与偏好）
    匹配当前可报名项目并返回匹配分数与原因。
    """
    subject = _get_subject_from_request(request)
    if not subject:
        return 404, {'code': 404, 'msg': '未找到受试者信息'}

    from apps.protocol.models import Protocol
    from django.db.models import Q
    import datetime

    # 获取受试者已参与的项目（排除推荐重复）
    enrolled_protocol_ids = set(
        subject.enrollments.values_list('protocol_id', flat=True)
    )

    protocols = Protocol.objects.filter(
        status__in=['active', 'recruiting'],
    ).exclude(id__in=enrolled_protocol_ids)[:20]

    # 简单规则引擎：过敏史匹配、皮肤类型匹配（未来可接 ARK 大模型）
    allergy_keywords = []
    try:
        for a in subject.allergy_records.all():
            allergy_keywords.append((a.allergen or '').lower())
    except Exception:
        pass

    recommendations = []
    for p in protocols:
        match_score = 60
        match_reasons = []
        exclusion_warnings = []

        # 招募中协议加分
        if p.status == 'recruiting':
            match_score += 15
            match_reasons.append('当前正在招募')

        # 过敏排除检查（简单关键词）
        title_lower = (p.title or '').lower()
        for allergen in allergy_keywords:
            if allergen and allergen in title_lower:
                exclusion_warnings.append(f'项目可能含 {allergen} 相关物质，请确认')
                match_score -= 20

        if not exclusion_warnings:
            match_reasons.append('无过敏风险')

        enroll_deadline = None
        try:
            if hasattr(p, 'end_date') and p.end_date:
                enroll_deadline = p.end_date.isoformat()
                if p.end_date < datetime.date.today():
                    continue  # 跳过已截止
        except Exception:
            pass

        recommendations.append({
            'project_id': p.id,
            'project_name': p.title,
            'study_type': getattr(p, 'study_type', ''),
            'compensation': 0,
            'match_score': max(0, min(100, match_score)),
            'match_reasons': match_reasons,
            'exclusion_warnings': exclusion_warnings,
            'enroll_deadline': enroll_deadline,
            'is_expired': False,
        })

    recommendations.sort(key=lambda x: x['match_score'], reverse=True)
    return {'code': 200, 'msg': 'OK', 'data': {'items': recommendations[:10]}}
