"""
知情同意书管理服务

包含：ICF 版本管理、受试者签署。
"""
import logging
import os

from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.db import connection
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from pathlib import Path
import re
from datetime import date, datetime
from typing import Dict, Iterable, Optional, List, Tuple
import zipfile
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from ..models import Enrollment, ICFVersion, Subject, SubjectConsent

logger = logging.getLogger(__name__)


def safe_subject_consent_icf_version(consent: SubjectConsent) -> Optional[ICFVersion]:
    """
    安全读取 consent.icf_version。FK 目标缺失或数据不一致时 Django 会抛 RelatedObjectDoesNotExist，
    直接访问会导致执行台签署列表等接口 500。
    """
    if not getattr(consent, 'icf_version_id', None):
        return None
    try:
        return consent.icf_version
    except ObjectDoesNotExist:
        return None


def safe_icf_protocol(icf: Optional[ICFVersion]):
    """安全读取 icf.protocol，避免协议行缺失时抛错。"""
    if not icf:
        return None
    try:
        return icf.protocol
    except ObjectDoesNotExist:
        return None

# 执行台工作人员审核（与 staff_audit_status 字段一致）
STAFF_AUDIT_PENDING_REVIEW = 'pending_review'
STAFF_AUDIT_APPROVED = 'approved'
STAFF_AUDIT_RETURNED = 'returned'


def _dt_to_local_date(dt) -> Optional[date]:
    """DateTime → 本地日历日（兼容 naive/aware）。"""
    if dt is None:
        return None
    try:
        return timezone.localtime(dt).date()
    except Exception:
        try:
            return dt.date()
        except Exception:
            return None


def signing_staff_name_for_screening_date(screening_schedule: Optional[list], ref_date: Optional[date]) -> str:
    """
    知情配置 screening_schedule 中与 ref_date 同日条目的 signing_staff_name
    （现场筛选计划「每一天」对应的知情签署工作人员）。
    """
    if not screening_schedule or not ref_date:
        return ''
    ds = ref_date.isoformat()
    for item in screening_schedule:
        if not isinstance(item, dict):
            continue
        d = str(item.get('date') or '')[:10]
        if d == ds:
            return (item.get('signing_staff_name') or '').strip()
    return ''


def screening_signing_staff_for_consent_list(
    screening_schedule: Optional[list],
    ref_day: Optional[date],
    settings_data: Optional[dict],
    signature_data: Optional[dict],
    *,
    protocol_id: Optional[int] = None,
    signed_at: Optional[datetime] = None,
) -> Tuple[str, Optional[str]]:
    """
    签署记录「知情签署人员」及（知情测试 H5 时）对应邮件「签名授权」时间戳。

    1) 知情测试 H5 + 测试类型：优先使用签署写入 signature_data 时冻结的 witness_staff_name /
       witness_staff_auth_at（列表与 PDF 与生成时刻一致，不随后续令牌变更而变）
    2) 无冻结字段的旧数据：再按 signed_at 查邮件授权快照
    3) 否则回退 signature_data.witness_staff_name（联调等）
    4) 协议级 consent_verify_test_staff_name、现场筛选计划 signing_staff_name
    """
    sig = signature_data if isinstance(signature_data, dict) else {}
    is_test_scan = bool(sig.get('consent_test_scan_h5')) and (sig.get('signing_kind') or '').strip() == 'test'

    if is_test_scan:
        wn = (sig.get('witness_staff_name') or '').strip()
        if wn:
            auth_iso = sig.get('witness_staff_auth_at')
            return wn, auth_iso if isinstance(auth_iso, str) else None

    if is_test_scan and protocol_id and signed_at:
        from apps.protocol.services import witness_staff_service as ws_svc

        snap = ws_svc.witness_staff_snapshot_for_consent_signing(protocol_id, signed_at)
        wn = (snap.get('witness_staff_name') or '').strip()
        if wn:
            auth_iso = snap.get('witness_staff_auth_at')
            return wn, auth_iso if isinstance(auth_iso, str) else None

    wn = (sig.get('witness_staff_name') or '').strip()
    if wn:
        auth_iso = sig.get('witness_staff_auth_at')
        return wn, auth_iso if isinstance(auth_iso, str) else None

    sd = settings_data if isinstance(settings_data, dict) else {}
    cv = (sd.get('consent_verify_test_staff_name') or '').strip()
    if cv:
        return cv, None
    row = signing_staff_name_for_screening_date(screening_schedule, ref_day) if ref_day else ''
    return row, None


def _table_has_column(table_name: str, column_name: str) -> bool:
    """兼容本地迁移未完成场景：运行时判断列是否存在。"""
    try:
        with connection.cursor() as cursor:
            desc = connection.introspection.get_table_description(cursor, table_name)
        return any(getattr(col, 'name', None) == column_name for col in desc)
    except Exception:
        return False


def get_effective_mini_sign_rules(protocol, icf: ICFVersion) -> dict:
    """
    小程序端生效的签署规则：节点已保存 mini_sign_rules 时以节点为准，否则沿用协议 consent_settings。
    返回 dict 含 require_*、min_reading_duration_seconds、dual_sign_staffs、collect_*（不含 screening / launched）。
    """
    from apps.protocol.api import (
        _clamp_1_or_2,
        _get_consent_settings,
        _merge_witness_staff_verification,
        _normalize_dual_sign_staffs,
    )

    proto = _get_consent_settings(protocol)

    def _base_from_proto() -> dict:
        pr = proto
        mr = max(0, int(pr.get('min_reading_duration_seconds') or 0))
        if mr <= 0:
            mr = 30
        return {
            # 人脸认证签署暂未开放，生效侧固定关闭
            'require_face_verify': False,
            'require_dual_sign': bool(pr.get('require_dual_sign', False)),
            'require_comprehension_quiz': bool(pr.get('require_comprehension_quiz', False)),
            'enable_min_reading_duration': pr.get('enable_min_reading_duration') is not False,
            'min_reading_duration_seconds': mr,
            'dual_sign_staffs': list(pr.get('dual_sign_staffs') or []),
            'collect_id_card': bool(pr.get('collect_id_card', False)),
            'collect_screening_number': bool(pr.get('collect_screening_number', False)),
            'collect_initials': bool(pr.get('collect_initials', False)),
            'collect_subject_name': bool(pr.get('collect_subject_name', False)),
            'collect_other_information': bool(pr.get('collect_other_information', False)),
            'supplemental_collect_labels': [],
            'enable_checkbox_recognition': bool(pr.get('enable_checkbox_recognition', False)),
            'enable_staff_signature': bool(pr.get('enable_staff_signature', False)),
            'staff_signature_times': _clamp_1_or_2(pr.get('staff_signature_times'), 1),
            'enable_subject_signature': bool(pr.get('enable_subject_signature', False)),
            'subject_signature_times': _clamp_1_or_2(pr.get('subject_signature_times'), 1),
            'enable_guardian_signature': bool(pr.get('enable_guardian_signature', False)),
            'guardian_parent_count': _clamp_1_or_2(pr.get('guardian_parent_count'), 1),
            'guardian_signature_times': _clamp_1_or_2(pr.get('guardian_signature_times'), 1),
            'enable_auto_sign_date': bool(pr.get('enable_auto_sign_date', False)),
        }

    if not _table_has_column('t_icf_version', 'mini_sign_rules_saved'):
        out = _base_from_proto()
        out['require_face_verify'] = False
        out['dual_sign_staffs'] = _merge_witness_staff_verification(_normalize_dual_sign_staffs(out['dual_sign_staffs']))
        return out

    if not getattr(icf, 'mini_sign_rules_saved', False):
        out = _base_from_proto()
        out['require_face_verify'] = False
        out['dual_sign_staffs'] = _merge_witness_staff_verification(_normalize_dual_sign_staffs(out['dual_sign_staffs']))
        return out

    raw = icf.mini_sign_rules if isinstance(icf.mini_sign_rules, dict) else {}
    out = _base_from_proto()
    if 'require_dual_sign' in raw:
        out['require_dual_sign'] = bool(raw.get('require_dual_sign'))
    if 'require_comprehension_quiz' in raw:
        out['require_comprehension_quiz'] = bool(raw.get('require_comprehension_quiz'))
    if 'enable_min_reading_duration' in raw:
        out['enable_min_reading_duration'] = bool(raw.get('enable_min_reading_duration'))
    if 'enable_checkbox_recognition' in raw:
        out['enable_checkbox_recognition'] = bool(raw.get('enable_checkbox_recognition'))
    if 'min_reading_duration_seconds' in raw:
        mr = max(0, int(raw.get('min_reading_duration_seconds') or 0))
        out['min_reading_duration_seconds'] = mr if mr > 0 else 30
    for k in (
        'collect_id_card',
        'collect_screening_number',
        'collect_initials',
        'collect_subject_name',
        'collect_other_information',
    ):
        if k in raw:
            out[k] = bool(raw.get(k))
    for k in ('enable_staff_signature', 'enable_subject_signature', 'enable_guardian_signature', 'enable_auto_sign_date'):
        if k in raw:
            out[k] = bool(raw.get(k))
    for k in (
        'staff_signature_times',
        'subject_signature_times',
        'guardian_parent_count',
        'guardian_signature_times',
    ):
        if k in raw:
            out[k] = _clamp_1_or_2(raw.get(k), out.get(k, 1))
    lbl_raw = raw.get('supplemental_collect_labels')
    sup_labels = []
    if isinstance(lbl_raw, list):
        sup_labels = [str(x).strip() for x in lbl_raw if str(x).strip()][:20]
    out['supplemental_collect_labels'] = sup_labels
    if sup_labels:
        out['collect_other_information'] = True
    if 'dual_sign_staffs' in raw:
        out['dual_sign_staffs'] = _merge_witness_staff_verification(_normalize_dual_sign_staffs(raw.get('dual_sign_staffs')))
    else:
        out['dual_sign_staffs'] = _merge_witness_staff_verification(_normalize_dual_sign_staffs(out['dual_sign_staffs']))
    out['require_face_verify'] = False
    return out


def normalize_phone_digits(phone: str) -> str:
    return ''.join(c for c in (phone or '') if c.isdigit())


def mini_sign_supplement_error_message(subject, consent_settings: dict, data) -> Optional[str]:
    """
    执行台配置的「小程序签署前采集」：姓名/身份证/手机号/SC 等。
    若任一项开启，则必须校验「确认手机号」与当前 Subject.phone 一致，并校验已填字段。
    """
    cs = consent_settings or {}
    need_any = any(
        [
            cs.get('collect_subject_name'),
            cs.get('collect_id_card'),
            cs.get('collect_screening_number'),
            cs.get('collect_initials'),
        ]
    )
    if not need_any:
        return None

    dphone = (getattr(data, 'declared_phone', None) or '').strip()
    if not normalize_phone_digits(dphone):
        return '请填写用于确认身份的手机号'
    if normalize_phone_digits(dphone) != normalize_phone_digits(getattr(subject, 'phone', None) or ''):
        return '确认手机号与当前登录账号绑定手机号不一致，请核对后重试'

    if cs.get('collect_subject_name') and not (getattr(data, 'declared_subject_name', None) or '').strip():
        return '请填写姓名'
    if cs.get('collect_id_card'):
        idc = ''.join(c for c in (getattr(data, 'declared_id_card', None) or '') if c.isdigit() or c in 'Xx')
        if len(idc) < 15:
            return '请填写正确的身份证号'
    if cs.get('collect_screening_number') and not (getattr(data, 'declared_screening_number', None) or '').strip():
        return '请填写 SC 编号'
    if cs.get('collect_initials') and not (getattr(data, 'declared_initials', None) or '').strip():
        return '请填写拼音首字母'
    return None


def apply_mini_sign_supplement_to_signature(
    subject,
    consent_settings: dict,
    data,
    signature_data: dict,
    old_reception_sync: Optional[dict],
) -> None:
    """
    将小程序签署前确认的字段写入 signature_data.mini_sign_confirm，并与接待台 reception_sync 对齐（SC/拼音首字母）。
    若姓名为占位符，回写 Subject.name，便于与接待导入姓名一致。
    """
    cs = consent_settings or {}
    need_any = any(
        [
            cs.get('collect_subject_name'),
            cs.get('collect_id_card'),
            cs.get('collect_screening_number'),
            cs.get('collect_initials'),
        ]
    )
    if not need_any:
        return

    mc: dict = {}
    if cs.get('collect_subject_name'):
        mc['subject_name'] = (getattr(data, 'declared_subject_name', None) or '').strip()[:100]
    if cs.get('collect_id_card'):
        idc = ''.join(c for c in (getattr(data, 'declared_id_card', None) or '') if c.isdigit() or c in 'Xx')
        if len(idc) >= 15:
            mc['id_card_last4'] = idc[-4:]
    if cs.get('collect_screening_number'):
        mc['screening_number'] = (getattr(data, 'declared_screening_number', None) or '').strip()[:64]
    if cs.get('collect_initials'):
        mc['initials'] = (getattr(data, 'declared_initials', None) or '').strip()[:32]
    ph = normalize_phone_digits(getattr(subject, 'phone', None) or '')
    if ph:
        mc['phone_last4'] = ph[-4:]
    sn = (getattr(subject, 'subject_no', None) or '').strip()
    if sn:
        mc['subject_no'] = sn[:32]
    if mc:
        signature_data['mini_sign_confirm'] = mc

    if cs.get('collect_subject_name') and mc.get('subject_name'):
        cur = (subject.name or '').strip()
        if cur in ('', '微信用户', '受试者', '临时受试者'):
            subject.name = mc['subject_name']
            subject.save(update_fields=['name', 'update_time'])

    rs = dict(old_reception_sync or {})
    if mc.get('screening_number') and not (rs.get('sc_number') or '').strip():
        rs['sc_number'] = str(mc['screening_number'])[:64]
    if mc.get('initials') and not (rs.get('name_pinyin_initials') or '').strip():
        rs['name_pinyin_initials'] = str(mc['initials'])[:32]
    if rs:
        signature_data['reception_sync'] = rs


def effective_required_reading_seconds_for_icf(icf: ICFVersion, protocol) -> int:
    """
    与小程序签署页一致：执行台「每节点阅读最短时长」保存在 mini_sign_rules.min_reading_duration_seconds
    （见 PUT …/mini-sign-rules），而非仅依赖 ICF 表列 required_reading_duration_seconds。
    因此必须以 get_effective_mini_sign_rules 合并后的 enable_* / min_reading_duration_seconds 为准。
    """
    rules = get_effective_mini_sign_rules(protocol, icf)
    if not rules.get('enable_min_reading_duration', True):
        return 0
    return max(0, int(rules.get('min_reading_duration_seconds') or 0))


def get_icf_versions(protocol_id: int) -> list:
    """获取协议的所有 ICF 版本，按签署顺序 display_order 排序。"""
    qs = ICFVersion.objects.filter(protocol_id=protocol_id)
    if _table_has_column('t_icf_version', 'display_order'):
        qs = qs.order_by('display_order', '-create_time')
    else:
        qs = qs.order_by('-create_time')
    if not _table_has_column('t_icf_version', 'required_reading_duration_seconds'):
        return list(qs.values('id', 'protocol_id', 'version', 'file_path', 'content', 'is_active', 'create_time', 'update_time'))
    return list(qs)


def create_icf_version(
    protocol_id: int,
    version: str,
    file_path: str = '',
    content: str = '',
    is_active: bool = True,
    required_reading_duration_seconds: int = 0,
    node_title: str = '',
    display_order: int = None,
) -> ICFVersion:
    """创建新的 ICF 版本（签署节点）"""
    kwargs = {
        'protocol_id': protocol_id,
        'version': version,
        'file_path': file_path or '',
        'content': content or '',
        'is_active': is_active,
    }
    if _table_has_column('t_icf_version', 'required_reading_duration_seconds'):
        kwargs['required_reading_duration_seconds'] = max(0, required_reading_duration_seconds)
    if _table_has_column('t_icf_version', 'node_title'):
        kwargs['node_title'] = (node_title or '').strip()
    if _table_has_column('t_icf_version', 'display_order'):
        if display_order is None:
            from django.db.models import Max
            m = ICFVersion.objects.filter(protocol_id=protocol_id).aggregate(m=Max('display_order'))['m']
            kwargs['display_order'] = (m or 0) + 1
        else:
            kwargs['display_order'] = display_order
    return ICFVersion.objects.create(**kwargs)


def reorder_icf_versions(protocol_id: int, id_order: list) -> bool:
    """按 id_order 更新 ICF 版本的 display_order"""
    if not _table_has_column('t_icf_version', 'display_order'):
        return False
    qs = ICFVersion.objects.filter(protocol_id=protocol_id, id__in=id_order)
    by_id = {icf.id: icf for icf in qs}
    for i, pk in enumerate(id_order):
        if pk in by_id:
            by_id[pk].display_order = i
            by_id[pk].save(update_fields=['display_order', 'update_time'])
    return True


def delete_icf_version(protocol_id: int, icf_id: int) -> tuple[bool, str]:
    """
    删除签署节点（ICF 版本）。
    若存在受试者已签署或研究者已见证的记录，则禁止删除（合规审计）。
    """
    icf = ICFVersion.objects.filter(id=icf_id, protocol_id=protocol_id).first()
    if not icf:
        return False, 'ICF 版本不存在'

    qs = SubjectConsent.objects.filter(icf_version_id=icf_id)
    if qs.filter(is_signed=True).exists():
        return False, '该节点已有签署或见证记录，无法删除'
    if _table_has_column('t_subject_consent', 'investigator_signed_at'):
        if qs.filter(investigator_signed_at__isnull=False).exists():
            return False, '该节点已有签署或见证记录，无法删除'

    from apps.protocol.models import WitnessDualSignAuthToken

    media_rel = (getattr(icf, 'file_path', None) or '').strip()

    @transaction.atomic
    def _do_delete():
        WitnessDualSignAuthToken.objects.filter(protocol_id=protocol_id, icf_version_id=icf_id).delete()
        icf.delete()

    _do_delete()

    if media_rel and '..' not in media_rel and not os.path.isabs(media_rel):
        from apps.protocol.services import protocol_service as protocol_sv

        media_root = os.path.abspath(os.path.normpath(settings.MEDIA_ROOT))
        abs_path = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel)))
        if abs_path.startswith(media_root + os.sep) and os.path.isfile(abs_path):
            try:
                os.remove(abs_path)
            except OSError:
                pass
        ext = os.path.splitext(media_rel)[1].lower()
        if ext in ('.doc', '.docx'):
            prev_rel = protocol_sv.icf_preview_pdf_relative_path(media_rel)
            if prev_rel and '..' not in prev_rel:
                abs_prev = os.path.abspath(os.path.normpath(os.path.join(media_root, prev_rel)))
                if abs_prev.startswith(media_root + os.sep) and os.path.isfile(abs_prev):
                    try:
                        os.remove(abs_prev)
                    except OSError:
                        pass
            if ext == '.docx':
                html_rel = protocol_sv.icf_preview_html_relative_path(media_rel)
                if html_rel and '..' not in html_rel:
                    abs_html = os.path.abspath(os.path.normpath(os.path.join(media_root, html_rel)))
                    if abs_html.startswith(media_root + os.sep) and os.path.isfile(abs_html):
                        try:
                            os.remove(abs_html)
                        except OSError:
                            pass

    return True, ''


def update_icf_version(
    icf_id: int,
    version: str = None,
    content: str = None,
    is_active: bool = None,
    required_reading_duration_seconds: int = None,
    node_title: str = None,
) -> ICFVersion | None:
    """更新 ICF 版本（版本号、内容、是否激活、要求阅读时长）"""
    icf = ICFVersion.objects.filter(id=icf_id).first()
    if not icf:
        return None
    update_fields = ['update_time']
    if version is not None:
        icf.version = version
        update_fields.append('version')
    if content is not None:
        icf.content = content
        update_fields.append('content')
    if is_active is not None:
        icf.is_active = is_active
        update_fields.append('is_active')
    if required_reading_duration_seconds is not None and _table_has_column('t_icf_version', 'required_reading_duration_seconds'):
        icf.required_reading_duration_seconds = max(0, required_reading_duration_seconds)
        update_fields.append('required_reading_duration_seconds')
    if node_title is not None and _table_has_column('t_icf_version', 'node_title'):
        icf.node_title = (node_title or '').strip()
        update_fields.append('node_title')
    icf.save(update_fields=update_fields)
    return icf


def _merge_date_subject_map(*maps: dict) -> dict:
    """合并多个 {date: set(subject_id)}，同日并集受试者。"""
    out = {}
    for m in maps:
        if not m:
            continue
        for d, sids in m.items():
            if d is None:
                continue
            out.setdefault(d, set()).update(sids)
    return out


def _subject_map_from_pre_screening(protocol_id: int) -> dict:
    """粗筛到场日 -> 受试者集合（主数据源）。"""
    try:
        from apps.subject.models_recruitment import PreScreeningRecord
    except Exception:
        return {}
    dm = {}
    for row in PreScreeningRecord.objects.filter(protocol_id=protocol_id).values('pre_screening_date', 'subject_id'):
        d, sid = row['pre_screening_date'], row['subject_id']
        if d and sid:
            dm.setdefault(d, set()).add(sid)
    return dm


def _subject_map_from_screening_records(protocol_id: int) -> dict:
    """
    正式筛选 ScreeningRecord：按筛选日（screened_at 或创建日）分组。
    受试者优先从同协议 PreScreening 同 registration 关联；否则用手机号匹配 Subject。
    """
    try:
        from apps.subject.models_recruitment import ScreeningRecord, PreScreeningRecord
        from ..models import Subject
    except Exception:
        return {}
    dm = {}
    qs = ScreeningRecord.objects.filter(registration__plan__protocol_id=protocol_id).select_related('registration')
    for sr in qs.iterator():
        reg = sr.registration
        d = _dt_to_local_date(sr.screened_at) or _dt_to_local_date(sr.create_time)
        if not d:
            continue
        sids = set(
            PreScreeningRecord.objects.filter(
                registration_id=reg.id, protocol_id=protocol_id
            ).values_list('subject_id', flat=True)
        )
        if not sids and reg.phone:
            sids = set(Subject.objects.filter(phone=reg.phone).values_list('id', flat=True))
        for sid in sids:
            dm.setdefault(d, set()).add(sid)
    return dm


def _subject_map_from_consent_first_activity(protocol_id: int) -> dict:
    """
    兜底：无现场筛选数据时，按受试者在本协议下「首条知情记录创建日」分组，
    便于列表展示多日期进度（不等同于现场筛选日，仅作数据可见性补充）。
    """
    from django.db.models import Min

    dm = {}
    rows = (
        SubjectConsent.objects.filter(icf_version__protocol_id=protocol_id)
        .values('subject_id')
        .annotate(first_at=Min('create_time'))
    )
    for row in rows:
        sid = row['subject_id']
        fa = row['first_at']
        if not sid or not fa:
            continue
        d = _dt_to_local_date(fa)
        if not d:
            continue
        dm.setdefault(d, set()).add(sid)
    return dm


def _normalize_planned_dates_for_stats(items) -> List[date]:
    """协议配置的计划现场日：最多 4 条、合法 YYYY-MM-DD、升序去重。"""
    date_re = re.compile(r'^\d{4}-\d{2}-\d{2}$')
    out: List[date] = []
    seen = set()
    for x in items or []:
        s = str(x).strip()[:10]
        if not date_re.match(s):
            continue
        try:
            d = datetime.strptime(s, '%Y-%m-%d').date()
        except ValueError:
            continue
        if d in seen:
            continue
        seen.add(d)
        out.append(d)
    out.sort()
    return out[:4]


def _normalize_screening_schedule_for_stats(raw) -> List[dict]:
    """
    screening_schedule: [{date, target_count, is_test_screening?}, ...]
    最多 16 条；目标筛选量 >= 1（人数，分母按 人数×ICF数 换算为文档任务数）。
    is_test_screening=True 表示测试筛选（须早于最早正式筛选日；不参与「最早现场筛选日期」计算）。
    """
    date_re = re.compile(r'^\d{4}-\d{2}-\d{2}$')
    out: List[dict] = []
    seen = set()
    for x in raw or []:
        if not isinstance(x, dict):
            continue
        ds = str(x.get('date', '')).strip()[:10]
        if not date_re.match(ds):
            continue
        try:
            datetime.strptime(ds, '%Y-%m-%d')
        except ValueError:
            continue
        try:
            tc = int(x.get('target_count', 0) or 0)
        except (TypeError, ValueError):
            tc = 0
        if tc < 1:
            tc = 1
        if ds in seen:
            continue
        seen.add(ds)
        is_test = bool(x.get('is_test_screening') or x.get('is_test'))
        entry = {'date': ds, 'target_count': tc, 'is_test_screening': is_test}
        raw_sn = x.get('signing_staff_name')
        if raw_sn is not None:
            sn = str(raw_sn).strip()[:64]
            if sn:
                entry['signing_staff_name'] = sn
        out.append(entry)
    out.sort(key=lambda z: z['date'])
    return out[:16]


def _formal_screening_schedule_only(sched: List[dict]) -> List[dict]:
    """仅正式筛选行（用于最早现场筛选日等）。"""
    return [x for x in (sched or []) if not x.get('is_test_screening')]


def validate_screening_schedule_test_rules(sched: List[dict]) -> Optional[str]:
    """
    测试筛选行须早于最早一条正式筛选日；须至少有一条正式筛选日才能勾选测试。
    返回错误文案或 None。
    """
    if not sched:
        return None
    formal = _formal_screening_schedule_only(sched)
    formal_dates: List[date] = []
    for x in formal:
        try:
            formal_dates.append(datetime.strptime(x['date'], '%Y-%m-%d').date())
        except ValueError:
            continue
    has_test = any(x.get('is_test_screening') for x in sched)
    if has_test and not formal_dates:
        return '勾选测试筛选前，请先至少添加一条「正式筛选」计划（含日期与预约人数）'
    if not formal_dates:
        return None
    min_formal = min(formal_dates)
    for x in sched:
        if not x.get('is_test_screening'):
            continue
        try:
            d = datetime.strptime(x['date'], '%Y-%m-%d').date()
        except ValueError:
            return '测试筛选日期格式无效'
        if d >= min_formal:
            return '测试筛选日期须早于最早正式筛选日（{}）'.format(min_formal.isoformat())
    return None


def _schedule_to_targets_and_dates(sched: List[dict]) -> Tuple[dict, List[date]]:
    target_by: dict = {}
    dates: List[date] = []
    for x in sched:
        ds = x['date']
        target_by[ds] = x['target_count']
        dates.append(datetime.strptime(ds, '%Y-%m-%d').date())
    return target_by, dates


def _apply_progress_denominator(batch: dict, target_by: dict, icf_n: int) -> None:
    """合计分母：配置的目标筛选量×ICF 份数；未配置则用 max(1, 预期文档, 实际行数)。"""
    ds = batch['screening_date'][:10]
    signed = int(batch.get('signed_count') or 0)
    tc_people = target_by.get(ds)
    icf_m = max(int(icf_n or 0), 1)
    if tc_people is not None:
        denom = max(1, int(tc_people) * icf_m)
    else:
        exp = int(batch.get('expected_consent_rows') or 0)
        tot = int(batch.get('total') or 0)
        denom = max(1, exp, tot)
    batch['progress_signed'] = signed
    batch['progress_total'] = denom
    batch['pending_progress'] = max(0, denom - signed)


def get_screening_batch_consent_stats(
    protocol_id: int,
    screening_schedule: Optional[list] = None,
    planned_screening_dates: Optional[list] = None,
    *,
    icf_n: Optional[int] = None,
) -> dict:
    """
    按「现场筛选相关日期」分批次统计知情签署进度。

    数据来源（依次合并同日受试者并集）：
    1. 粗筛 PreScreeningRecord.pre_screening_date
    2. 正式筛选 ScreeningRecord（到场日=screened_at/创建日）+ registration 关联受试者
    3. 若仍无任何日期：兜底为各受试者首条 SubjectConsent.create_time 所在日

    另：协议 **screening_schedule**（日期+目标筛选人数）中尚未有到场映射的日期，追加占位行。
    每批返回 progress_signed / progress_total（合计分子/分母，分母来自目标×ICF 数或兜底）。

    **最早现场筛选日期** 与知情配置 screening_schedule 升序第一日一致（有配置时）；否则取实际到场数据最早日。
    """
    if icf_n is not None:
        icf_n = int(icf_n)
    else:
        icf_n = ICFVersion.objects.filter(protocol_id=protocol_id).count()
    sched = _normalize_screening_schedule_for_stats(screening_schedule)
    if not sched and planned_screening_dates:
        sched = [
            {'date': str(x).strip()[:10], 'target_count': 1}
            for x in (planned_screening_dates or [])
            if str(x).strip()[:10]
        ]
        sched = _normalize_screening_schedule_for_stats(sched)

    target_by, _ = _schedule_to_targets_and_dates(sched) if sched else ({}, [])
    planned_date_strs = [x['date'] for x in sched]
    sched_by_date = {x['date']: x for x in sched}

    # 无粗筛/正式筛选数据时跳过全表扫描，直接走兜底（知情首活日），显著降低列表页 N 协议成本。
    from apps.subject.models_recruitment import PreScreeningRecord, ScreeningRecord

    pre_map: dict = {}
    sr_map: dict = {}
    if PreScreeningRecord.objects.filter(protocol_id=protocol_id).exists():
        pre_map = _subject_map_from_pre_screening(protocol_id)
    if ScreeningRecord.objects.filter(registration__plan__protocol_id=protocol_id).exists():
        sr_map = _subject_map_from_screening_records(protocol_id)
    dm = _merge_date_subject_map(pre_map, sr_map)
    used_fallback = False
    if not dm:
        dm = _subject_map_from_consent_first_activity(protocol_id)
        used_fallback = bool(dm)

    date_list_from_dm = sorted(dm.keys()) if dm else []
    batches = []
    dates_with_subjects_iso = {d.isoformat() for d in date_list_from_dm}

    # 合并按日期的多次 count 为单次查询 + 内存聚合（每协议仍 1 次 SQL，替代 2×日期数次）。
    consent_totals_by_sid: dict = {}
    consent_signed_by_sid: dict = {}
    if date_list_from_dm:
        all_sids: set = set()
        for d in date_list_from_dm:
            all_sids.update(dm[d])
        if all_sids:
            for sid, signed in SubjectConsent.objects.filter(
                icf_version__protocol_id=protocol_id,
                subject_id__in=all_sids,
            ).values_list('subject_id', 'is_signed'):
                consent_totals_by_sid[sid] = consent_totals_by_sid.get(sid, 0) + 1
                if signed:
                    consent_signed_by_sid[sid] = consent_signed_by_sid.get(sid, 0) + 1

    for d in date_list_from_dm:
        subject_ids = dm[d]
        cohort_n = len(subject_ids)
        total_docs = sum(consent_totals_by_sid.get(sid, 0) for sid in subject_ids)
        signed_docs = sum(consent_signed_by_sid.get(sid, 0) for sid in subject_ids)
        pending_docs = total_docs - signed_docs
        expected = cohort_n * icf_n if icf_n else 0
        ds_iso = d.isoformat()
        batch = {
            'screening_date': ds_iso,
            'cohort_subject_count': cohort_n,
            'total': total_docs,
            'signed_count': signed_docs,
            'pending_count': pending_docs,
            'icf_count': icf_n,
            'expected_consent_rows': expected,
            'is_planned_placeholder': False,
            # 与占位行一致：有实际到场/知情数据时也要带上测试筛选标记，供执行台签署进度区分展示
            'is_test_screening': bool(sched_by_date.get(ds_iso, {}).get('is_test_screening')),
        }
        _apply_progress_denominator(batch, target_by, icf_n)
        batches.append(batch)

    for ds in planned_date_strs:
        if ds in dates_with_subjects_iso:
            continue
        batch = {
            'screening_date': ds,
            'cohort_subject_count': 0,
            'total': 0,
            'signed_count': 0,
            'pending_count': 0,
            'icf_count': icf_n,
            'expected_consent_rows': 0,
            'is_planned_placeholder': True,
            'is_test_screening': bool(sched_by_date.get(ds, {}).get('is_test_screening')),
        }
        _apply_progress_denominator(batch, target_by, icf_n)
        batches.append(batch)

    batches.sort(key=lambda b: b['screening_date'])

    # 「最早现场筛选日期」仅看正式筛选行（不含测试筛选）；无正式计划时退回实际到场最早日
    formal_sched = _formal_screening_schedule_only(sched)
    if formal_sched:
        earliest_screening_date = formal_sched[0]['date']
    elif date_list_from_dm:
        earliest_screening_date = date_list_from_dm[0].isoformat()
    else:
        earliest_screening_date = None

    if batches:
        latest_screening_date = batches[-1]['screening_date'][:10]
    elif sched:
        latest_screening_date = sched[-1]['date']
    else:
        latest_screening_date = None

    if not batches:
        batch_source = 'none'
    elif date_list_from_dm:
        batch_source = 'consent_activity_fallback' if used_fallback else 'screening'
    else:
        batch_source = 'planned_config'

    return {
        'batches': batches,
        'batch_count': len(batches),
        'earliest_screening_date': earliest_screening_date,
        'latest_screening_date': latest_screening_date,
        'batch_source': batch_source,
    }


def get_consents_stats(protocol_id: int) -> dict:
    """按协议统计签署数量。与「签署记录」列表一致：每受试者合并为一行（多知情节点一行），不按文档条数重复计数。"""
    from django.db.models import Count

    rows = _filtered_consent_list(
        protocol_id,
        status_filter='all',
        icf_version_id=None,
        date_from=None,
        date_to=None,
        search=None,
    )
    units = _merge_witness_dev_batch_units(rows)
    subject_map = _group_units_by_subject_sorted(units, protocol_id)
    groups = list(subject_map.values())

    rows_signed_or_approved = 0
    rows_pending = 0
    rows_return_resign = 0
    signed_result_no_rows = 0
    for grp in groups:
        agg_sr = _aggregate_signing_result_from_consents(grp)
        status = _aggregate_consent_status_label(grp)
        if status in ('已签署', '已通过审核'):
            rows_signed_or_approved += 1
        elif status == '待签署':
            rows_pending += 1
        elif status == '退回重签中':
            rows_return_resign += 1
        if agg_sr == '否':
            signed_result_no_rows += 1

    qs = SubjectConsent.objects.filter(icf_version__protocol_id=protocol_id)
    signed_qs = qs.filter(is_signed=True)
    unique_subjects_signed = signed_qs.values('subject_id').distinct().count()
    icf_count = ICFVersion.objects.filter(protocol_id=protocol_id).count()
    if icf_count > 0:
        subjects_all_signed = (
            signed_qs.values('subject_id').annotate(cnt=Count('id')).filter(cnt=icf_count).count()
        )
    else:
        subjects_all_signed = 0

    return {
        'total': rows_signed_or_approved,
        'signed_count': rows_signed_or_approved,
        'pending_count': rows_pending,
        'unique_subjects_signed': unique_subjects_signed,
        'subjects_all_signed': subjects_all_signed,
        'icf_count': icf_count,
        'signed_result_no_count': signed_result_no_rows,
        'returned_resign_row_count': rows_return_resign,
    }


def consent_staff_display_status(consent: SubjectConsent) -> str:
    """执行台列表「签署状态」：待签署 / 已签署 / 退回重签中 / 已通过审核。"""
    st = (getattr(consent, 'staff_audit_status', None) or '').strip()
    if not consent.is_signed:
        if st == STAFF_AUDIT_RETURNED:
            return '退回重签中'
        return '待签署'
    if st == STAFF_AUDIT_APPROVED:
        return '已通过审核'
    if st == STAFF_AUDIT_RETURNED:
        return '退回重签中'
    return '已签署'


def subject_no_display_for_consent(c: SubjectConsent) -> str:
    """
    与小程序「编号」一致：优先 t_subject.subject_no；若关联对象未带最新值则补查库；
    仍空时回退 signature_data / reception_sync 中的镜像（历史或离线补写）。
    """
    subj = getattr(c, 'subject', None)
    if subj is not None:
        sn = (getattr(subj, 'subject_no', None) or '').strip()
        if sn:
            return sn
        try:
            fresh = Subject.objects.filter(pk=subj.pk, is_deleted=False).only('subject_no').first()
            if fresh and (fresh.subject_no or '').strip():
                return (fresh.subject_no or '').strip()
        except Exception:
            pass
    sig = c.signature_data if isinstance(c.signature_data, dict) else {}
    mc = sig.get('mini_sign_confirm') or {}
    if isinstance(mc, dict) and (mc.get('subject_no') or '').strip():
        return mc['subject_no'].strip()
    for key in ('subject_no', 'subjectNo'):
        v = sig.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    rs = sig.get('reception_sync') or {}
    if isinstance(rs, dict):
        v = rs.get('subject_no') or rs.get('subjectNo')
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ''


def subject_name_display_for_consent(c: SubjectConsent) -> str:
    """
    与「受试者姓名」列一致：优先 t_subject.name；补查库；仍空则回退 signature_data / reception_sync 镜像。
    """
    sig = c.signature_data if isinstance(c.signature_data, dict) else {}
    mc = sig.get('mini_sign_confirm') or {}
    if isinstance(mc, dict) and (mc.get('subject_name') or '').strip():
        return mc['subject_name'].strip()
    subj = getattr(c, 'subject', None)
    if subj is not None:
        nm = (getattr(subj, 'name', None) or '').strip()
        if nm:
            return nm
        try:
            fresh = Subject.objects.filter(pk=subj.pk, is_deleted=False).only('name').first()
            if fresh and (fresh.name or '').strip():
                return (fresh.name or '').strip()
        except Exception:
            pass
    for key in ('subject_name', 'subject_display_name'):
        v = sig.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    rs = sig.get('reception_sync') or {}
    if isinstance(rs, dict):
        v = rs.get('subject_name') or rs.get('name')
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ''


def _mask_phone(s: str) -> str:
    """手机号脱敏：132****1234。"""
    raw = (s or '').strip()
    if not raw:
        return ''
    if len(raw) < 7:
        return raw
    return f'{raw[:3]}****{raw[-4:]}'


def _mask_id_card(s: str) -> str:
    """身份证脱敏：310110********3920（前6后4，中间按原长度补 *）。"""
    raw = (s or '').strip()
    if not raw:
        return ''
    if len(raw) < 10:
        return raw
    return f'{raw[:6]}{"*" * (len(raw) - 10)}{raw[-4:]}'


def subject_phone_display_for_consent(c: SubjectConsent) -> str:
    """列表手机号优先主表，缺失时回退签署镜像字段。"""
    subj = getattr(c, 'subject', None)
    if subj is not None:
        phone = (getattr(subj, 'phone', None) or '').strip()
        if phone:
            return phone
    sig = c.signature_data if isinstance(c.signature_data, dict) else {}
    cti = sig.get('consent_test_scan_identity') if isinstance(sig.get('consent_test_scan_identity'), dict) else {}
    if (cti.get('declared_phone') or '').strip():
        return (cti.get('declared_phone') or '').strip()
    mc = sig.get('mini_sign_confirm') or {}
    if isinstance(mc, dict):
        for key in ('phone', 'mobile'):
            v = mc.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    rs = sig.get('reception_sync') or {}
    if isinstance(rs, dict):
        for key in ('phone', 'mobile'):
            v = rs.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    for key in ('phone', 'mobile', 'subject_phone'):
        v = sig.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ''


def subject_id_card_display_for_consent(c: SubjectConsent) -> str:
    """列表身份证优先签署镜像，其次尝试解密主表。"""
    sig = c.signature_data if isinstance(c.signature_data, dict) else {}
    cti = sig.get('consent_test_scan_identity') if isinstance(sig.get('consent_test_scan_identity'), dict) else {}
    if (cti.get('declared_id_card') or '').strip():
        return (cti.get('declared_id_card') or '').strip()
    mc = sig.get('mini_sign_confirm') or {}
    if isinstance(mc, dict):
        for key in ('id_card', 'idCard'):
            v = mc.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    subj = getattr(c, 'subject', None)
    enc = (getattr(subj, 'id_card_encrypted', None) or '').strip() if subj is not None else ''
    if not enc:
        return ''
    try:
        from apps.subject.services.profile_service import decrypt_id_card

        return (decrypt_id_card(enc) or '').strip()
    except Exception:
        return ''


CONSENT_LIST_SORT_FIELDS = frozenset({
    'signed_at',
    'create_time',
    'subject_no',
    'subject_name',
    'sc_number',
    'name_pinyin_initials',
    'signing_result',
    'signing_type',
    'node_title',
    'icf_version',
    'consent_status',
    'staff_audit_status',
    'auth_verified_at',
    'receipt_no',
})


def _consent_row_search_blob(c: SubjectConsent) -> str:
    """用于签署记录关键字筛选：多字段拼接后做子串匹配（大小写不敏感）。"""
    ex = consent_list_display_fields(c, None)
    sig = (c.signature_data or {}).get('investigator_sign') or {}
    subj = getattr(c, 'subject', None)
    phone_for_search = (subject_phone_display_for_consent(c) or '').strip()
    icfv = safe_subject_consent_icf_version(c)
    parts = [
        subject_no_display_for_consent(c),
        subject_name_display_for_consent(c),
        phone_for_search,
        ex.get('sc_number') or '',
        ex.get('name_pinyin_initials') or '',
        ex.get('signing_result') or '',
        ex.get('signing_type') or '',
        c.receipt_no or '',
        (getattr(icfv, 'node_title', None) or '') if icfv else '',
        str(icfv.version) if icfv else '',
        consent_staff_display_status(c),
        getattr(c, 'staff_audit_status', '') or '',
        sig.get('staff_name') or '',
    ]
    return ' '.join(str(p) for p in parts).lower()


def _consent_row_matches_search(c: SubjectConsent, q: str) -> bool:
    qq = (q or '').strip().lower()
    if not qq:
        return True
    blob = _consent_row_search_blob(c)
    return qq in blob


def _filtered_consent_list(
    protocol_id: int,
    status_filter: str = 'all',
    icf_version_id: int = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
) -> List[SubjectConsent]:
    """按协议筛选后的签署记录（不含排序；用于导出或再排序分页）。"""
    qs = (
        SubjectConsent.objects.filter(icf_version__protocol_id=protocol_id)
        .select_related('subject', 'icf_version', 'icf_version__protocol')
    )
    if icf_version_id:
        qs = qs.filter(icf_version_id=icf_version_id)
    if not _table_has_column('t_subject_consent', 'investigator_signed_at'):
        qs = qs.defer('investigator_signed_at')
    qs = _apply_consent_row_date_filter(qs, date_from, date_to)
    if status_filter == 'signed':
        qs = qs.filter(is_signed=True)
    elif status_filter == 'pending':
        qs = qs.filter(is_signed=False)
    elif status_filter == 'result_no':
        pass
    rows = list(qs)
    if status_filter == 'result_no':
        sids = {c.subject_id for c in rows}
        agg = batch_protocol_subject_signing_results(protocol_id, sids)
        rows = [c for c in rows if agg.get(c.subject_id) == '否']
    if search and search.strip():
        rows = [c for c in rows if _consent_row_matches_search(c, search)]
    return rows


def _consent_sort_tuple(c: SubjectConsent, field: str) -> tuple:
    """稳定可比较的排序键（含 id 作 tie-breaker）；签署结果按单条 SubjectConsent 计。"""
    f = field if field in CONSENT_LIST_SORT_FIELDS else 'signed_at'
    ex = consent_list_display_fields(c, None)
    sid = c.id
    if f == 'signed_at':
        dt = c.signed_at or c.create_time
        ts = dt.timestamp() if dt else float('-inf')
        return (ts, sid)
    if f == 'create_time':
        dt = c.create_time
        ts = dt.timestamp() if dt else float('-inf')
        return (ts, sid)
    if f == 'subject_no':
        return (subject_no_display_for_consent(c).lower(), sid)
    if f == 'subject_name':
        return (subject_name_display_for_consent(c).lower(), sid)
    if f == 'sc_number':
        return ((ex.get('sc_number') or '-').lower(), sid)
    if f == 'name_pinyin_initials':
        return ((ex.get('name_pinyin_initials') or '-').lower(), sid)
    if f == 'signing_result':
        return ((ex.get('signing_result') or '-').lower(), sid)
    if f == 'signing_type':
        return ((ex.get('signing_type') or '正式').lower(), sid)
    if f == 'node_title':
        icfv = safe_subject_consent_icf_version(c)
        return ((getattr(icfv, 'node_title', None) or '').lower(), sid)
    if f == 'icf_version':
        icfv = safe_subject_consent_icf_version(c)
        return ((icfv.version if icfv else '').lower(), sid)
    if f == 'consent_status':
        return (consent_staff_display_status(c), sid)
    if f == 'staff_audit_status':
        return ((getattr(c, 'staff_audit_status', None) or '').lower(), sid)
    if f == 'auth_verified_at':
        dt = getattr(c.subject, 'identity_verified_at', None)
        ts = dt.timestamp() if dt else float('-inf')
        return (ts, sid)
    if f == 'receipt_no':
        return ((c.receipt_no or '').lower(), sid)
    dt = c.signed_at or c.create_time
    ts = dt.timestamp() if dt else float('-inf')
    return (ts, sid)


def _get_icf_version_order_map(protocol_id: int) -> Dict[int, int]:
    """display_order、id 升序 → 0..n-1，用于同一受试者多节点排序。"""
    order: Dict[int, int] = {}
    for i, v in enumerate(ICFVersion.objects.filter(protocol_id=protocol_id).order_by('display_order', 'id')):
        order[v.id] = i
    return order


def _merge_witness_dev_batch_units(rows: List[SubjectConsent]) -> List[List[SubjectConsent]]:
    """与执行台 buildConsentTableDisplayRows 一致：联调测试同批次多节点合并为单元再分组。"""
    out: List[List[SubjectConsent]] = []
    consumed = set()
    for c in rows:
        if c.id in consumed:
            continue
        sig = c.signature_data or {}
        kind = (sig.get('signing_kind') or '').strip()
        bid = (sig.get('witness_dev_batch_id') or '').strip()
        if bid and kind == 'test':
            batch = [
                r
                for r in rows
                if (
                    ((r.signature_data or {}).get('witness_dev_batch_id') or '').strip() == bid
                    and ((r.signature_data or {}).get('signing_kind') or '').strip() == 'test'
                    and r.subject_id == c.subject_id
                )
            ]
            for r in batch:
                consumed.add(r.id)
            batch.sort(key=lambda x: x.icf_version_id or 0)
            out.append(batch)
        else:
            consumed.add(c.id)
            out.append([c])
    return out


def _group_units_by_subject_sorted(
    units: List[List[SubjectConsent]], protocol_id: int
) -> Dict[int, List[SubjectConsent]]:
    """按受试者合并单元内全部 SubjectConsent，节点顺序与配置 display_order 一致。"""
    icf_order = _get_icf_version_order_map(protocol_id)
    m: Dict[int, Dict[int, SubjectConsent]] = {}
    for unit in units:
        for c in unit:
            sid = c.subject_id
            if sid not in m:
                m[sid] = {}
            m[sid][c.id] = c
    out: Dict[int, List[SubjectConsent]] = {}
    for sid, cmap in m.items():
        lst = list(cmap.values())
        lst.sort(
            key=lambda x: (icf_order.get(x.icf_version_id, 10**9), x.icf_version_id or 0, x.id),
        )
        out[sid] = lst
    return out


def _aggregate_consent_status_label(consents: List[SubjectConsent]) -> str:
    """同一受试者多节点汇总「签署状态」。"""
    if any(not c.is_signed for c in consents):
        if any(
            not c.is_signed and (getattr(c, 'staff_audit_status', None) or '').strip() == STAFF_AUDIT_RETURNED
            for c in consents
        ):
            return '退回重签中'
        return '待签署'
    if all((getattr(c, 'staff_audit_status', None) or '').strip() == STAFF_AUDIT_APPROVED for c in consents):
        return '已通过审核'
    if any((getattr(c, 'staff_audit_status', None) or '').strip() == STAFF_AUDIT_RETURNED for c in consents):
        return '退回重签中'
    return '已签署'


def _consent_group_sort_tuple(grp: List[SubjectConsent], field: str) -> tuple:
    """受试者分组排序键（与列表列含义对齐）。"""
    f = field if field in CONSENT_LIST_SORT_FIELDS else 'signed_at'
    grp = sorted(grp, key=lambda x: x.id)
    c0 = grp[0]
    sid = c0.subject_id
    if f == 'signed_at':
        dts = [c.signed_at or c.create_time for c in grp]
        dt = max(dts) if dts else None
        ts = dt.timestamp() if dt else float('-inf')
        return (ts, sid)
    if f == 'create_time':
        dt = min((c.create_time for c in grp), default=c0.create_time)
        ts = dt.timestamp() if dt else float('-inf')
        return (ts, sid)
    if f == 'signing_result':
        agg = _aggregate_signing_result_from_consents(grp)
        order = {'否': 0, '是': 1, '-': 2}.get(agg, 3)
        return (order, sid)
    if f == 'consent_status':
        return (_aggregate_consent_status_label(grp), sid)
    return _consent_sort_tuple(c0, f)


def consent_list_api_rows_from_subject_groups(
    groups: List[List[SubjectConsent]],
    settings_data: dict,
    sched: list,
    single_ref_date: Optional[date],
    media_url: str,
    protocol_id: int,
) -> List[dict]:
    """将按受试者分组的 SubjectConsent 列表转为执行台知情管理 API 行（含 consent_ids、group_by_subject）。"""
    rows: List[dict] = []
    for grp in groups:
        agg_sr = _aggregate_signing_result_from_consents(grp)
        c0 = grp[0]
        extra = consent_list_display_fields(c0, aggregate_signing_result=agg_sr)
        consent_ids = [c.id for c in grp]
        any_test = any(((c.signature_data or {}).get('signing_kind') or '').strip() == 'test' for c in grp)
        signing_type = '测试' if any_test else '正式'
        signed_at_max = None
        for c in grp:
            if c.signed_at:
                if signed_at_max is None or c.signed_at > signed_at_max:
                    signed_at_max = c.signed_at
        # 同受试者、同协议一行展示：唯一回执号取知情节点顺序下第一个非空号（与 _allocate_receipt_no_for_subject_protocol 一致）
        receipt_only = ''
        for c in grp:
            rno = (c.receipt_no or '').strip()
            if rno:
                receipt_only = rno
                break
        n_nodes = len(grp)
        if n_nodes > 1:
            node_title = f'共 {n_nodes} 个知情节点'
            ver_labels: List[str] = []
            for c in grp:
                icfv = safe_subject_consent_icf_version(c)
                v = icfv.version if icfv else ''
                if v and v not in ver_labels:
                    ver_labels.append(v)
            icf_version_str = '、'.join(ver_labels)
        else:
            ic0 = safe_subject_consent_icf_version(c0)
            node_title = (getattr(ic0, 'node_title', None) or '') if ic0 else ''
            icf_version_str = ic0.version if ic0 else ''
        if single_ref_date:
            ref_day = single_ref_date
        else:
            ref_day = None
            for c in grp:
                d = _dt_to_local_date(c.signed_at) or _dt_to_local_date(c.create_time)
                if d and (ref_day is None or d > ref_day):
                    ref_day = d
        sig_for_row = c0.signature_data or {}
        screening_signing_staff, witness_staff_auth_at = screening_signing_staff_for_consent_list(
            sched,
            ref_day,
            settings_data,
            sig_for_row,
            protocol_id=protocol_id,
            signed_at=signed_at_max,
        )
        witness_batch = None
        for c in grp:
            wb = ((c.signature_data or {}).get('witness_dev_batch_id') or '') or None
            if wb:
                witness_batch = wb
                break
        inv_at = None
        for c in grp:
            if getattr(c, 'investigator_signed_at', None):
                if inv_at is None or c.investigator_signed_at > inv_at:
                    inv_at = c.investigator_signed_at
        investigator_signed_at = inv_at.isoformat() if inv_at else None
        first_receipt_path = None
        for c in grp:
            rp = (c.signature_data or {}).get('receipt_pdf_path') if c.signature_data else None
            if rp:
                first_receipt_path = rp
                break
        receipt_pdf_url = f"{media_url}{first_receipt_path}" if first_receipt_path else None
        witness_meta = ((c0.signature_data or {}).get('investigator_sign') if c0.signature_data else None) or {}
        rows.append(
            {
                'id': consent_ids[0],
                'consent_ids': consent_ids,
                'group_by_subject': True,
                'subject_id': c0.subject_id,
                'subject_no': subject_no_display_for_consent(c0),
                'subject_name': subject_name_display_for_consent(c0),
                'phone': extra.get('phone_masked') or '-',
                'id_card': extra.get('id_card_masked') or '-',
                'sc_number': extra.get('sc_number') or '-',
                'name_pinyin_initials': extra.get('name_pinyin_initials') or '-',
                'signing_result': extra.get('signing_result') or '-',
                'signing_type': signing_type,
                'icf_version_id': c0.icf_version_id,
                'icf_version': icf_version_str,
                'node_title': node_title,
                'is_signed': all(c.is_signed for c in grp),
                'signed_at': signed_at_max.isoformat() if signed_at_max else None,
                'investigator_signed_at': investigator_signed_at,
                'investigator_sign_staff_name': witness_meta.get('staff_name') or '',
                'screening_signing_staff': screening_signing_staff,
                'witness_staff_auth_at': witness_staff_auth_at,
                'receipt_no': receipt_only,
                'receipt_pdf_path': first_receipt_path,
                'receipt_pdf_url': receipt_pdf_url,
                'create_time': min(c.create_time for c in grp).isoformat(),
                'require_dual_sign': settings_data.get('require_dual_sign', False),
                'consent_status_label': _aggregate_consent_status_label(grp),
                'staff_audit_status': getattr(c0, 'staff_audit_status', '') or '',
                'auth_verified_at': (
                    c0.subject.identity_verified_at.isoformat()
                    if getattr(c0.subject, 'identity_verified_at', None)
                    else None
                ),
                'witness_dev_batch_id': witness_batch,
            }
        )
    return rows


def list_consents_grouped_by_subject_page(
    protocol_id: int,
    status_filter: str = 'all',
    icf_version_id: int = None,
    page: int = 1,
    page_size: int = 20,
    sort_field: str = 'signed_at',
    sort_order: str = 'desc',
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
) -> Tuple[int, List[List[SubjectConsent]]]:
    """
    按受试者合并后的分页：每行对应一名受试者在本协议下全部知情节点（顺序与 display_order 一致）。
    返回 (分组总数, 当前页每组为 SubjectConsent 列表)。
    """
    rows = _filtered_consent_list(
        protocol_id,
        status_filter=status_filter,
        icf_version_id=icf_version_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    units = _merge_witness_dev_batch_units(rows)
    subject_map = _group_units_by_subject_sorted(units, protocol_id)
    groups = list(subject_map.values())
    reverse = (sort_order or 'desc').strip().lower() != 'asc'
    sf = (sort_field or 'signed_at').strip() or 'signed_at'
    groups.sort(key=lambda g: _consent_group_sort_tuple(g, sf), reverse=reverse)
    total = len(groups)
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 20)))
    start = (page - 1) * page_size
    return total, groups[start : start + page_size]


def list_consents_page_for_protocol(
    protocol_id: int,
    status_filter: str = 'all',
    icf_version_id: int = None,
    page: int = 1,
    page_size: int = 20,
    sort_field: str = 'signed_at',
    sort_order: str = 'desc',
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
) -> Tuple[int, List[SubjectConsent]]:
    """
    分页签署记录：默认按签署时间（无则创建时间）新到旧。
    返回 (total, 当前页模型列表)。
    """
    rows = _filtered_consent_list(
        protocol_id,
        status_filter=status_filter,
        icf_version_id=icf_version_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    reverse = (sort_order or 'desc').strip().lower() != 'asc'
    sf = (sort_field or 'signed_at').strip() or 'signed_at'
    rows.sort(key=lambda c: _consent_sort_tuple(c, sf), reverse=reverse)
    total = len(rows)
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 20)))
    start = (page - 1) * page_size
    return total, rows[start : start + page_size]


def get_consents_by_protocol(
    protocol_id: int,
    status_filter: str = 'all',
    icf_version_id: int = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
) -> list:
    """按协议获取签署记录（导出等全量场景）；默认按签署时间新到旧。"""
    rows = _filtered_consent_list(
        protocol_id,
        status_filter=status_filter,
        icf_version_id=icf_version_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    rows.sort(key=lambda c: _consent_sort_tuple(c, 'signed_at'), reverse=True)
    return rows


def _sanitize_zip_path_component(s: str, max_len: int = 80) -> str:
    """压缩包内路径片段：去除非法字符，空则占位「无」。"""
    s = (s or '').strip()
    if not s:
        return '无'
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f\r\n]', '_', s)
    s = re.sub(r'\s+', '_', s).strip('_') or '无'
    return s[:max_len]


def _subject_id_card_plain_for_export(subject: Subject, consent: SubjectConsent) -> str:
    """导出用身份证号：主表解密优先，否则知情测试 H5 填报。"""
    from apps.subject.services.profile_service import decrypt_id_card

    enc = (getattr(subject, 'id_card_encrypted', None) or '').strip()
    if enc:
        try:
            return decrypt_id_card(enc) or ''
        except Exception as e:
            logger.warning(
                'consent_export: 身份证解密失败，已回退为空（subject_id=%s, consent_id=%s）: %s',
                getattr(subject, 'id', None),
                getattr(consent, 'id', None),
                e,
            )
            return ''
    sig = consent.signature_data or {}
    cti = sig.get('consent_test_scan_identity') if isinstance(sig.get('consent_test_scan_identity'), dict) else {}
    return (cti.get('declared_id_card') or '').strip()


def _subject_phone_plain_for_export(subject: Subject, consent: SubjectConsent) -> str:
    """导出用手机号：优先扫码/知情测试 H5 基础信息页 declared_phone，否则受试者主表。"""
    sig = consent.signature_data or {}
    cti = sig.get('consent_test_scan_identity') if isinstance(sig.get('consent_test_scan_identity'), dict) else {}
    dp = normalize_phone_digits(cti.get('declared_phone') or '')
    if dp:
        return dp
    if subject is None:
        return ''
    sp = (getattr(subject, 'phone', None) or '').strip()
    return normalize_phone_digits(sp) or sp


def _sc_number_export_sort_key(sc_raw: str) -> tuple:
    """受试者基础信息导出：按 SC 号升序（空排后；含数字时按首个数字段数值比）。"""
    s = (sc_raw or '').strip()
    if not s:
        return (2, 0, '')
    if s.isdigit():
        return (0, int(s), '')
    nums = re.findall(r'\d+', s)
    if nums:
        try:
            return (0, int(nums[0]), s)
        except ValueError:
            pass
    return (1, 0, s)


def _pick_representative_consent_for_export(group: list) -> SubjectConsent:
    """同一受试者多节点时：优先选带扫码填报身份证的节点，便于导出。"""
    for c in group:
        sig = c.signature_data or {}
        cti = sig.get('consent_test_scan_identity') if isinstance(sig.get('consent_test_scan_identity'), dict) else {}
        if (cti.get('declared_id_card') or '').strip():
            return c
    return group[0]


def get_subjects_basic_export_rows(
    protocol_id: int,
    status_filter: str = 'all',
    icf_version_id: int = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    protocol_code: str = '',
    protocol_title: str = '',
) -> list[dict]:
    """
    签署记录导出：按受试者去重一行。
    含项目编号/名称、SC号、姓名、手机号（优先扫码基础信息页 declared_phone）、拼音首字母、身份证号；按 SC 号升序。
    """
    from collections import defaultdict

    items = get_consents_by_protocol(
        protocol_id,
        status_filter=status_filter,
        icf_version_id=icf_version_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    by_subj: dict[int, list] = defaultdict(list)
    for c in items:
        by_subj[c.subject_id].append(c)
    rows: list[dict] = []
    for _sid, group in by_subj.items():
        group.sort(key=lambda x: x.signed_at or x.create_time, reverse=True)
        rep = _pick_representative_consent_for_export(group)
        try:
            subj = rep.subject
        except Exception:
            subj = None

        try:
            extra = consent_list_display_fields(rep, None) or {}
        except Exception as e:
            logger.warning('consent_export: 解析扩展字段失败，已回退为空（consent_id=%s）: %s', getattr(rep, 'id', None), e)
            extra = {}

        try:
            sc = (extra.get('sc_number') or '').strip()
            if sc == '-':
                sc = ''
        except Exception:
            sc = ''

        try:
            name = subject_name_display_for_consent(rep)
        except Exception as e:
            logger.warning('consent_export: 解析姓名失败，已回退为空（consent_id=%s）: %s', getattr(rep, 'id', None), e)
            name = ''

        try:
            phone = _subject_phone_plain_for_export(subj, rep)
        except Exception as e:
            logger.warning('consent_export: 解析手机号失败，已回退为空（consent_id=%s）: %s', getattr(rep, 'id', None), e)
            phone = ''

        try:
            py_raw = (extra.get('name_pinyin_initials') or '').strip()
            if py_raw == '-':
                py_raw = ''
        except Exception:
            py_raw = ''

        try:
            idc = _subject_id_card_plain_for_export(subj, rep) if subj is not None else ''
        except Exception as e:
            logger.warning('consent_export: 解析身份证号失败，已回退为空（consent_id=%s）: %s', getattr(rep, 'id', None), e)
            idc = ''
        rows.append(
            {
                'project_code': (protocol_code or '').strip(),
                'project_title': (protocol_title or '').strip(),
                'sc_number': sc,
                'subject_name': name,
                'phone': phone,
                'name_pinyin_initials': py_raw,
                'id_card': idc,
            }
        )
    rows.sort(key=lambda r: _sc_number_export_sort_key(r.get('sc_number') or ''))
    return rows


def zip_consent_receipt_pdfs_for_protocol(
    protocol_id: int,
    status_filter: str = 'all',
    icf_version_id: int = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    protocol_code: Optional[str] = None,
) -> Tuple[Optional[BytesIO], Optional[str]]:
    """
    将当前筛选下已有回执 PDF 的签署记录打包为 zip（批量导出）。
    结构：每人一个子文件夹「项目编号_拼音首字母_SC号_YYYYMMDDHHMMSS」，内为 PDF 文件
    「知情节点名称_项目编号_拼音首字母_SC号.pdf」。
    返回 (buffer, error_msg)；error_msg 非空表示无可导出文件。
    """
    from collections import defaultdict

    items = get_consents_by_protocol(
        protocol_id,
        status_filter=status_filter,
        icf_version_id=icf_version_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    pcode = (protocol_code or '').strip() or str(protocol_id)
    by_subj: dict[int, list] = defaultdict(list)
    for c in items:
        by_subj[c.subject_id].append(c)
    buf = BytesIO()
    count = 0
    used_arcnames: set[str] = set()
    used_folders: set[str] = set()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for _sid, group in by_subj.items():
            group.sort(key=lambda x: (x.signed_at or x.create_time or timezone.now()))
            rep = _pick_representative_consent_for_export(group)
            extra = consent_list_display_fields(rep, None)
            sc_raw = (extra.get('sc_number') or '').strip()
            if sc_raw == '-':
                sc_raw = ''
            py_raw = (extra.get('name_pinyin_initials') or '').strip()
            if py_raw == '-':
                py_raw = ''
            if not py_raw:
                try:
                    from apps.subject.services.reception_service import _name_pinyin_initials

                    nm = (subject_name_display_for_consent(rep) or '').strip()
                    if nm:
                        py_raw = _name_pinyin_initials(nm)
                except Exception:
                    pass
            times = [c.signed_at or c.create_time for c in group if c.signed_at or c.create_time]
            t0 = min(times) if times else timezone.now()
            if timezone.is_aware(t0):
                t0 = timezone.localtime(t0)
            ts_str = t0.strftime('%Y%m%d%H%M%S')
            folder_base = '_'.join(
                [
                    _sanitize_zip_path_component(pcode),
                    _sanitize_zip_path_component(py_raw),
                    _sanitize_zip_path_component(sc_raw),
                    ts_str,
                ]
            )
            folder = folder_base
            suf = 0
            while folder in used_folders:
                suf += 1
                folder = f'{folder_base}_{suf}'
            used_folders.add(folder)
            for c in group:
                sig = dict(c.signature_data or {})
                rel = sig.get('receipt_pdf_path') if sig else None
                # 无回执、或仍为简易 stub（含历史 data 未写 receipt_stub）时生成完整回执
                needs_receipt = getattr(c, 'is_signed', False) and (
                    not rel or sig.get('receipt_stub') is not False
                )
                if needs_receipt:
                    _ensure_receipt_pdf_safe(c)
                    rel = (c.signature_data or {}).get('receipt_pdf_path')
                    if rel:
                        c.save(update_fields=['signature_data', 'update_time'])
                if not rel:
                    continue
                rel_s = str(rel).replace('\\', '/').strip()
                if '..' in rel_s or rel_s.startswith('/'):
                    continue
                abs_path = os.path.join(settings.MEDIA_ROOT, rel_s)
                if not os.path.isfile(abs_path):
                    continue
                icfv_zip = safe_subject_consent_icf_version(c)
                node_title = (getattr(icfv_zip, 'node_title', None) or '').strip() or '知情节点'
                pdf_base = '_'.join(
                    [
                        _sanitize_zip_path_component(node_title, 120),
                        _sanitize_zip_path_component(pcode),
                        _sanitize_zip_path_component(py_raw),
                        _sanitize_zip_path_component(sc_raw),
                    ]
                )
                pdf_name = f'{pdf_base}.pdf'
                arcname = f'{folder}/{pdf_name}'
                dup = 0
                while arcname in used_arcnames:
                    dup += 1
                    stem, ext = os.path.splitext(pdf_name)
                    pdf_name = f'{stem}_{c.id}_{dup}{ext}'
                    arcname = f'{folder}/{pdf_name}'
                    if dup > 500:
                        break
                used_arcnames.add(arcname)
                zf.write(abs_path, arcname)
                count += 1
    if count == 0:
        return None, '当前筛选下没有可导出的回执 PDF，请确认记录已签署且已生成回执文件'
    buf.seek(0)
    return buf, None


def _generate_receipt_no() -> str:
    from django.db.models import Max
    from datetime import datetime
    now = datetime.now().strftime('%Y%m%d')
    last = SubjectConsent.all_objects.filter(receipt_no__startswith=f'ICF-RCP-{now}-').aggregate(Max('receipt_no'))['receipt_no__max']
    if last:
        try:
            n = int(last.split('-')[-1]) + 1
        except (ValueError, IndexError):
            n = 1
    else:
        n = 1
    return f'ICF-RCP-{now}-{n:04d}'


def _allocate_receipt_no_for_subject_protocol(subject_id: int, icf_version_id: int) -> str:
    """
    同受试者、同协议下全部知情节点共用同一回执号。
    在 transaction 内对已存在的同协议签署行 select_for_update，避免并发签署各生成新号。
    """
    icf = ICFVersion.objects.filter(pk=icf_version_id).only('protocol_id').first()
    if not icf:
        return _generate_receipt_no()
    pid = icf.protocol_id
    rows = list(
        SubjectConsent.all_objects.select_for_update()
        .filter(subject_id=subject_id, icf_version__protocol_id=pid)
        .order_by('id')
    )
    for c in rows:
        r = (c.receipt_no or '').strip()
        if r:
            return r
    return _generate_receipt_no()


def _merge_signature_preserving_reception(old_sig: Optional[dict], new_sig: Optional[dict]) -> dict:
    """合并签署载荷时保留接待台同步的 reception_sync（SC号/拼音等）。"""
    merged = dict(new_sig or {})
    rs = (old_sig or {}).get('reception_sync')
    if rs and isinstance(rs, dict):
        merged['reception_sync'] = {**rs, **(merged.get('reception_sync') or {})}
    return merged


def _attach_subject_snapshot_to_signature(sig: Optional[dict], subject_id: int) -> dict:
    """签署落库时写入 subject_no / subject_name 快照，便于列表与主表一致（主表为空时仍可展示）。"""
    d = dict(sig or {})
    subj = Subject.objects.filter(pk=subject_id, is_deleted=False).only('subject_no', 'name').first()
    if not subj:
        return d
    if not (d.get('subject_no') or '').strip() and (subj.subject_no or '').strip():
        d['subject_no'] = (subj.subject_no or '').strip()
    if not (d.get('subject_name') or '').strip() and (subj.name or '').strip():
        d['subject_name'] = (subj.name or '').strip()
    return d


def _resolved_consent_signed_at_datetime(sig_payload: Optional[dict]) -> datetime:
    """
    SubjectConsent.signed_at 落库时间。
    - 完整 ISO 日期时间字符串：解析为 aware datetime；
    - 仅为 YYYY-MM-DD（自动签署日）：历史上用当日 0 点会导致列表/导出时分秒恒为 00:00:00，改为当前时刻；
    - 未提供或无法解析：当前时刻。
    """
    raw = (sig_payload or {}).get('signed_at')
    if isinstance(raw, str):
        s = raw.strip()
        if len(s) >= 16:
            try:
                from django.utils.dateparse import parse_datetime

                norm = s.replace(' ', 'T', 1) if ' ' in s[:19] and 'T' not in s[:19] else s
                dt = parse_datetime(norm)
                if dt:
                    if timezone.is_naive(dt):
                        dt = timezone.make_aware(dt, timezone.get_current_timezone())
                    return dt
            except Exception:
                pass
        if len(s) >= 10 and s[4] == '-' and s[7] == '-':
            try:
                datetime.strptime(s[:10], '%Y-%m-%d')
                return timezone.now()
            except ValueError:
                pass
    return timezone.now()


@transaction.atomic
def sign_consent(subject_id: int, icf_version_id: int, signature_data: dict = None) -> SubjectConsent:
    """受试者签署知情同意书；支持人脸核身签署时传入 signature_data（含 face_verify_token 等）"""
    sig_payload = signature_data or {}
    signed_at_dt = _resolved_consent_signed_at_datetime(sig_payload)
    consent = (
        SubjectConsent.all_objects.select_for_update()
        .filter(subject_id=subject_id, icf_version_id=icf_version_id)
        .first()
    )
    if consent is None:
        consent = SubjectConsent.objects.create(
            subject_id=subject_id,
            icf_version_id=icf_version_id,
            is_signed=True,
            signed_at=signed_at_dt,
            signature_data=_attach_subject_snapshot_to_signature(sig_payload, subject_id),
            receipt_no=_allocate_receipt_no_for_subject_protocol(subject_id, icf_version_id),
            staff_audit_status=STAFF_AUDIT_PENDING_REVIEW,
        )
        _ensure_receipt_pdf_safe(consent)
        consent.save(update_fields=['signature_data', 'staff_audit_status', 'update_time'])
        return consent

    if consent.is_deleted:
        consent.is_deleted = False
        consent.is_signed = True
        consent.signed_at = signed_at_dt
        consent.staff_audit_status = STAFF_AUDIT_PENDING_REVIEW
        consent.signature_data = _attach_subject_snapshot_to_signature(
            _merge_signature_preserving_reception(consent.signature_data, sig_payload),
            subject_id,
        )
        if not consent.receipt_no:
            consent.receipt_no = _allocate_receipt_no_for_subject_protocol(subject_id, icf_version_id)
        _ensure_receipt_pdf_safe(consent)
        consent.save(
            update_fields=[
                'is_deleted',
                'is_signed',
                'signed_at',
                'signature_data',
                'receipt_no',
                'staff_audit_status',
                'update_time',
            ]
        )
        return consent

    if consent.is_signed:
        return consent

    consent.is_signed = True
    consent.signed_at = signed_at_dt
    consent.staff_audit_status = STAFF_AUDIT_PENDING_REVIEW
    consent.signature_data = _attach_subject_snapshot_to_signature(
        _merge_signature_preserving_reception(consent.signature_data, sig_payload),
        subject_id,
    )
    if not consent.receipt_no:
        consent.receipt_no = _allocate_receipt_no_for_subject_protocol(subject_id, icf_version_id)
    _ensure_receipt_pdf_safe(consent)
    consent.save(
        update_fields=['is_signed', 'signed_at', 'signature_data', 'receipt_no', 'staff_audit_status', 'update_time']
    )
    return consent


def get_subject_consents(subject_id: int) -> list:
    """获取受试者的所有知情同意记录"""
    return list(
        SubjectConsent.objects.filter(subject_id=subject_id)
        .select_related('icf_version', 'icf_version__protocol')
        .order_by('-create_time')
    )


def _serialize_subject_consent_for_my_api(c: SubjectConsent) -> dict:
    """小程序 GET /my/consents 单条结构（仅含已发布项目的知情任务）。"""
    from django.conf import settings

    icf = safe_subject_consent_icf_version(c)
    proto = safe_icf_protocol(icf)
    sig = c.signature_data if isinstance(c.signature_data, dict) else {}
    rules = get_effective_mini_sign_rules(proto, icf) if proto and icf else {}
    rd = effective_required_reading_seconds_for_icf(icf, proto) if icf and proto else 0
    receipt_pdf_path = (sig.get('receipt_pdf_path') or '').strip() if sig else ''
    return {
        'id': c.id,
        'icf_version_id': c.icf_version_id,
        'icf_version': icf.version if icf else '',
        'node_title': (getattr(icf, 'node_title', None) or '').strip() if icf else '',
        'display_order': int(getattr(icf, 'display_order', 0) or 0) if icf else 0,
        'required_reading_duration_seconds': rd,
        'protocol_id': proto.id if proto else None,
        'protocol_code': (proto.code or '').strip() if proto else '',
        'protocol_title': (proto.title or '').strip() if proto else '',
        'is_signed': c.is_signed,
        'signed_at': c.signed_at.isoformat() if c.signed_at else None,
        'receipt_no': c.receipt_no or None,
        'receipt_pdf_path': receipt_pdf_path or None,
        'receipt_pdf_url': f"{settings.MEDIA_URL}{receipt_pdf_path}" if receipt_pdf_path else None,
        'staff_audit_status': (getattr(c, 'staff_audit_status', None) or '').strip(),
        'staff_return_reason': (sig.get('staff_return_reason') or '').strip() or None,
        'consent_status_label': consent_staff_display_status(c),
    }


def list_subject_consents_for_mini_program(subject_id: int) -> list:
    """
    小程序「我的知情」列表：仅返回执行台已「发布」知情配置的项目下、未软删的签署任务；
    排序与执行台节点顺序一致（协议 consent_display_order → 节点 display_order）。
    """
    from apps.protocol.api import _is_consent_launched

    qs = (
        SubjectConsent.objects.filter(subject_id=subject_id, is_deleted=False)
        .select_related('icf_version', 'icf_version__protocol')
    )
    rows: List[SubjectConsent] = []
    for c in qs:
        icf = safe_subject_consent_icf_version(c)
        proto = safe_icf_protocol(icf)
        if not icf or not proto:
            continue
        if not getattr(icf, 'is_active', True):
            continue
        if not _is_consent_launched(proto):
            continue
        rows.append(c)

    def _sort_key(c: SubjectConsent) -> tuple:
        icf = safe_subject_consent_icf_version(c)
        proto = safe_icf_protocol(icf)
        p_order = int(getattr(proto, 'consent_display_order', 0) or 0) if proto else 0
        pid = proto.id if proto else 0
        d_order = int(getattr(icf, 'display_order', 0) or 0) if icf else 0
        iid = icf.id if icf else 0
        return (p_order, pid, d_order, iid)

    rows.sort(key=_sort_key)
    return [_serialize_subject_consent_for_my_api(c) for c in rows]


def subject_face_sign_consent(subject_id: int, icf_version_id: int, raw: dict) -> dict:
    """
    小程序人脸核身 + 手写签名 + 补充信息签署（正式流程，非知情测试扫码）。
    返回 {'ok': True, 'consent': SubjectConsent, 'status': 'signed'|'signed_pending_investigator', ...}
    或 {'ok': False, 'code': int, 'msg': str, 'error_code': str|None}
    """
    from types import SimpleNamespace

    from apps.protocol.api import _is_consent_launched

    subject = Subject.objects.filter(pk=subject_id, is_deleted=False).first()
    if not subject:
        return {'ok': False, 'code': 404, 'msg': '未找到受试者信息', 'error_code': None}

    icf = ICFVersion.objects.filter(id=icf_version_id).select_related('protocol').first()
    if not icf:
        return {'ok': False, 'code': 404, 'msg': 'ICF 版本不存在', 'error_code': None}
    protocol = safe_icf_protocol(icf)
    if not protocol:
        return {'ok': False, 'code': 404, 'msg': '协议不存在', 'error_code': None}
    if not _is_consent_launched(protocol):
        return {
            'ok': False,
            'code': 403,
            'msg': '知情配置尚未发布，请待研究方在执行台知情管理中发布后再签署',
            'error_code': 'CONSENT_NOT_LAUNCHED',
        }

    consent = SubjectConsent.objects.filter(subject_id=subject_id, icf_version_id=icf_version_id).first()
    if consent is None:
        return {
            'ok': False,
            'code': 404,
            'msg': '暂无该知情签署任务，请完成现场签到或联系研究方',
            'error_code': None,
        }
    if consent.is_signed:
        return {'ok': False, 'code': 409, 'msg': '您已签署过该版本', 'error_code': None}

    rules = get_effective_mini_sign_rules(protocol, icf)
    ns = SimpleNamespace(
        declared_phone=raw.get('declared_phone'),
        declared_subject_name=raw.get('declared_subject_name'),
        declared_id_card=raw.get('declared_id_card'),
        declared_screening_number=raw.get('declared_screening_number'),
        declared_initials=raw.get('declared_initials'),
    )
    err = mini_sign_supplement_error_message(subject, rules, ns)
    if err:
        return {'ok': False, 'code': 400, 'msg': err, 'error_code': None}

    sig: dict = {
        'verification_method': 'face_recognition',
        'face_verify_token': (raw.get('face_verify_token') or '').strip(),
        'reading_duration_seconds': max(0, int(raw.get('reading_duration_seconds') or 0)),
        'comprehension_quiz_passed': raw.get('comprehension_quiz_passed') is not False,
        'signed_at': raw.get('signed_at'),
        'signing_kind': 'formal',
    }
    if rules.get('enable_subject_signature'):
        from apps.protocol.api import _clamp_1_or_2

        st = _clamp_1_or_2(rules.get('subject_signature_times'), 1)
        if st > 0:
            imgs = raw.get('signature_images')
            if st >= 2:
                if isinstance(imgs, list) and len([x for x in imgs if str(x).strip()]) >= 2:
                    sig['signature_images'] = [str(x).strip() for x in imgs if str(x).strip()][:2]
                else:
                    return {'ok': False, 'code': 400, 'msg': '请完成两处手写签名', 'error_code': None}
            else:
                one = (raw.get('signature_image') or '').strip()
                if not one:
                    return {'ok': False, 'code': 400, 'msg': '请完成手写签名', 'error_code': None}
                sig['signature_image'] = one

    if rules.get('collect_other_information') and (raw.get('other_information_text') or '').strip():
        sig['other_information_text'] = str(raw.get('other_information_text')).strip()[:4000]

    if rules.get('enable_checkbox_recognition'):
        ans = raw.get('icf_checkbox_answers')
        if isinstance(ans, list) and ans:
            sig['icf_checkbox_answers'] = ans

    old_rs = (consent.signature_data or {}).get('reception_sync') if isinstance(consent.signature_data, dict) else {}
    apply_mini_sign_supplement_to_signature(subject, rules, ns, sig, old_rs if isinstance(old_rs, dict) else {})

    consent = sign_consent(subject_id, icf_version_id, signature_data=sig)

    rules2 = get_effective_mini_sign_rules(protocol, icf)
    need_inv = bool(rules2.get('require_dual_sign'))
    inv_at = getattr(consent, 'investigator_signed_at', None) if need_inv else True
    status = 'signed_pending_investigator' if need_inv and not inv_at else 'signed'
    return {'ok': True, 'consent': consent, 'status': status}


def _resolve_icf_source_pdf_relative_path(icf) -> Optional[str]:
    """MEDIA 下可合并进回执的知情原文：上传 PDF 或 Word 已生成的 *_preview.pdf。"""
    import os

    rel = (getattr(icf, 'file_path', None) or '').strip()
    if not rel or '..' in rel:
        return None
    low = rel.lower()
    media_root = os.path.abspath(os.path.normpath(str(settings.MEDIA_ROOT)))

    def safe_abs(r: str) -> Optional[str]:
        ap = os.path.abspath(os.path.normpath(os.path.join(media_root, r.replace('\\', '/'))))
        if not ap.startswith(media_root + os.sep):
            return None
        return ap if os.path.isfile(ap) else None

    if low.endswith('.pdf'):
        return rel.replace('\\', '/') if safe_abs(rel) else None

    from apps.protocol.services import protocol_service as ps

    try:
        if low.endswith('.docx'):
            ps.ensure_icf_preview_for_http_request(rel)
            pr = ps.icf_preview_pdf_relative_path(rel)
        elif low.endswith('.doc'):
            ps.ensure_icf_preview(rel)
            autoconv = ps.icf_autoconv_docx_relative_path(rel)
            pr = ps.icf_preview_pdf_relative_path(autoconv) if autoconv else ''
            if not pr or not safe_abs(pr):
                pr = ps.icf_preview_pdf_relative_path(rel)
        else:
            return None
    except Exception:
        pr = ''
    if pr and safe_abs(pr):
        return pr.replace('\\', '/')
    return None


def _witness_staff_signature_bytes_for_protocol(protocol, max_n: int) -> list:
    """双签名单顺序取首个已登记 signature_file 的工作人员；max_n>1 时为同一人签名图重复（与占位符一致）。"""
    if not protocol or max_n <= 0:
        return []
    from apps.protocol.api import _get_consent_settings
    from apps.protocol.models import WitnessStaff

    try:
        settings_json = _get_consent_settings(protocol)
        rows = list(settings_json.get('dual_sign_staffs') or [])
    except Exception:
        return []
    first_bytes: Optional[bytes] = None
    for row in rows:
        sid = row.get('staff_id')
        if not sid:
            continue
        ws = WitnessStaff.objects.filter(id=int(sid), is_deleted=False).only('signature_file').first()
        if not ws:
            continue
        rel = (ws.signature_file or '').strip()
        if not rel:
            continue
        b = _load_signature_image_bytes(rel)
        if b:
            first_bytes = b
            break
    if not first_bytes:
        return []
    return [first_bytes] * max_n


def _witness_staff_signature_bytes_by_staff_ids(staff_ids: Optional[list], max_n: int) -> list:
    """仅使用快照中授权工作人员（列表首项 id）的签名图；max_n>1 时重复同图，不取多名工作人员。"""
    if not staff_ids or max_n <= 0:
        return []
    from apps.protocol.models import WitnessStaff

    first_id = None
    for sid in staff_ids:
        try:
            first_id = int(sid)
            break
        except (TypeError, ValueError):
            continue
    if first_id is None:
        return []
    ws = WitnessStaff.objects.filter(id=first_id, is_deleted=False).only('signature_file').first()
    if not ws:
        return []
    rel = (ws.signature_file or '').strip()
    if not rel:
        return []
    b = _load_signature_image_bytes(rel)
    if not b:
        return []
    return [b] * max_n


def _load_signature_image_bytes(sig_ref: str) -> Optional[bytes]:
    """手写签名：支持 base64 或 MEDIA 下 storage_key 相对路径。"""
    import base64
    import os
    from pathlib import Path

    ref = (sig_ref or '').strip()
    if not ref:
        return None
    try:
        raw = base64.b64decode(ref, validate=True)
        if raw:
            return raw
    except Exception:
        pass
    if '..' in ref or ref.startswith('/'):
        return None
    mr = os.path.abspath(os.path.normpath(str(settings.MEDIA_ROOT)))
    ap = os.path.abspath(os.path.normpath(os.path.join(mr, ref.replace('\\', '/'))))
    if not ap.startswith(mr + os.sep) or not os.path.isfile(ap):
        return None
    try:
        return Path(ap).read_bytes()
    except OSError:
        return None


def _build_full_consent_receipt_pdf(consent: SubjectConsent) -> None:
    """
    知情签署回执 PDF：合并知情原文 PDF（若节点已上传且可解析）+ 签署摘要页
    （项目/节点信息、受试者填报、勾选结果、手写签名等）。适用于小程序正式签署与知情测试 H5。
    """
    import base64
    import os
    import re
    from io import BytesIO
    from xml.sax.saxutils import escape as xml_escape

    from django.utils.html import strip_tags
    from PIL import Image
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.platypus import Image as RLImage
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    data = dict(consent.signature_data or {})
    icf = ICFVersion.objects.select_related('protocol').filter(pk=consent.icf_version_id).first()
    if not icf:
        _ensure_stub_receipt_pdf(consent)
        return

    is_test_scan = bool(data.get('consent_test_scan_h5'))
    proto_early = getattr(icf, 'protocol', None)
    if is_test_scan and proto_early and consent.signed_at:
        need_snap = (
            not data.get('witness_staff_signature_order_ids')
            or not (data.get('witness_staff_name') or '').strip()
            or not data.get('witness_staff_auth_at')
        )
        if need_snap:
            from apps.protocol.services import witness_staff_service as ws_svc

            snap = ws_svc.witness_staff_snapshot_for_consent_signing(proto_early.id, consent.signed_at)
            data = dict(data)
            if not data.get('witness_staff_signature_order_ids') and snap.get('witness_staff_signature_order_ids'):
                data['witness_staff_signature_order_ids'] = snap['witness_staff_signature_order_ids']
            if not (data.get('witness_staff_name') or '').strip() and snap.get('witness_staff_name'):
                data['witness_staff_name'] = snap['witness_staff_name']
            if not data.get('witness_staff_auth_at') and snap.get('witness_staff_auth_at'):
                data['witness_staff_auth_at'] = snap['witness_staff_auth_at']

    signed_at = consent.signed_at or timezone.now()
    rel_dir = Path('consent') / f'{signed_at:%Y}' / f'{signed_at:%m}'
    abs_dir = Path(settings.MEDIA_ROOT) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    file_name = f'icf_receipt_{consent.id}_{signed_at:%Y%m%d%H%M%S}.pdf'
    abs_path = abs_dir / file_name
    rel_path = str((rel_dir / file_name).as_posix())

    writer = PdfWriter()
    merged_doc = False
    doc_rel = _resolve_icf_source_pdf_relative_path(icf)
    if doc_rel:
        try:
            abs_doc = os.path.abspath(os.path.normpath(os.path.join(str(settings.MEDIA_ROOT), doc_rel)))
            mr = os.path.abspath(os.path.normpath(str(settings.MEDIA_ROOT)))
            if abs_doc.startswith(mr + os.sep) and os.path.isfile(abs_doc):
                reader = PdfReader(open(abs_doc, 'rb'))
                for page in reader.pages[:250]:
                    writer.add_page(page)
                merged_doc = True
        except Exception as exc:
            logger.warning('consent test: merge ICF source PDF failed consent_id=%s: %s', consent.id, exc)

    try:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    except Exception:
        pass

    styles = getSampleStyleSheet()
    title_cn = ParagraphStyle(
        'title_cn',
        parent=styles['Title'],
        fontName='STSong-Light',
        fontSize=16,
        leading=22,
        spaceAfter=8,
    )
    body_cn = ParagraphStyle(
        'body_cn',
        parent=styles['Normal'],
        fontName='STSong-Light',
        fontSize=10,
        leading=14,
    )
    small_cn = ParagraphStyle(
        'small_cn',
        parent=styles['Normal'],
        fontName='STSong-Light',
        fontSize=9,
        leading=12,
    )

    story: list = []
    story.append(
        Paragraph(
            xml_escape('知情签署核验（测试）' if is_test_scan else '知情同意签署回执'),
            title_cn,
        )
    )
    story.append(Spacer(1, 4 * mm))
    proto = getattr(icf, 'protocol', None)
    pcode = (getattr(proto, 'code', None) or '').strip()
    ptitle = (getattr(proto, 'title', None) or '').strip()
    node_title = (getattr(icf, 'node_title', None) or '').strip() or '签署节点'
    ver = (getattr(icf, 'version', None) or '').strip()
    story.append(Paragraph(xml_escape(f'项目：{ptitle}（{pcode}）'), body_cn))
    story.append(Paragraph(xml_escape(f'节点：{node_title}  版本：{ver}'), body_cn))
    story.append(Paragraph(xml_escape(f'回执号：{consent.receipt_no or ""}'), body_cn))
    ident = data.get('consent_test_scan_identity') if isinstance(data.get('consent_test_scan_identity'), dict) else {}
    if ident:
        nm = (ident.get('declared_name') or '').strip()
        if nm:
            story.append(Paragraph(xml_escape(f'姓名：{nm}'), body_cn))
        idc = (ident.get('declared_id_card') or '').strip()
        if idc:
            story.append(Paragraph(xml_escape(f'身份证：{idc}'), body_cn))
        ph = (ident.get('declared_phone') or '').strip()
        if ph:
            story.append(Paragraph(xml_escape(f'手机：{ph}'), body_cn))
        sc = (ident.get('declared_screening_number') or '').strip()
        if sc:
            story.append(Paragraph(xml_escape(f'SC 编号：{sc}'), body_cn))
    mc = data.get('mini_sign_confirm') if isinstance(data.get('mini_sign_confirm'), dict) else {}
    if mc and not is_test_scan:
        sn = (mc.get('subject_name') or '').strip()
        if sn:
            story.append(Paragraph(xml_escape(f'受试者姓名：{sn}'), body_cn))
        scr = (mc.get('screening_number') or '').strip()
        if scr:
            story.append(Paragraph(xml_escape(f'筛选号/SC：{scr}'), body_cn))
        ini = (mc.get('initials') or '').strip()
        if ini:
            story.append(Paragraph(xml_escape(f'拼音首字母：{ini}'), body_cn))
        last4 = (mc.get('id_card_last4') or '').strip()
        if last4:
            story.append(Paragraph(xml_escape(f'身份证后四位：{last4}'), body_cn))
        pl4 = (mc.get('phone_last4') or '').strip()
        if pl4:
            story.append(Paragraph(xml_escape(f'手机后四位：{pl4}'), body_cn))
    eff_rules = get_effective_mini_sign_rules(proto, icf)
    from apps.protocol.api import _clamp_1_or_2

    answers = data.get('icf_checkbox_answers') or data.get('checkbox_answers') or []
    if not isinstance(answers, list):
        answers = []

    auto_sign_date = bool(eff_rules.get('enable_auto_sign_date'))
    subj_sig_times = _clamp_1_or_2(eff_rules.get('subject_signature_times'), 1) if eff_rules.get('enable_subject_signature') else 0
    if auto_sign_date:
        story.append(
            Paragraph(
                xml_escape(f'签署日期（按配置自动签署日）：{signed_at.date().isoformat()}'),
                body_cn,
            )
        )
        story.append(Paragraph(xml_escape(f'签署时刻：{signed_at.isoformat()}'), body_cn))
    else:
        story.append(Paragraph(xml_escape(f'签署时间：{signed_at.isoformat()}'), body_cn))
    if subj_sig_times > 0:
        story.append(
            Paragraph(
                xml_escape(f'受试者手写签名次数（配置）：{subj_sig_times} 次'),
                small_cn,
            )
        )
    story.append(Spacer(1, 3 * mm))

    if not merged_doc:
        from apps.protocol.services.protocol_service import resolve_icf_body_html_for_execution

        raw_html = ''
        try:
            raw_html = (resolve_icf_body_html_for_execution(icf) if icf else '').strip()
        except Exception as exc:
            logger.warning(
                'consent receipt: resolve_icf_body_html_for_execution failed consent_id=%s: %s',
                consent.id,
                exc,
            )
        if raw_html:
            try:
                from apps.subject.services.icf_checkbox_receipt import apply_checkbox_answers_inline_to_html
                from apps.subject.services.icf_placeholders import (
                    apply_icf_placeholders,
                    build_icf_placeholder_map_for_consent_record,
                )

                if eff_rules.get('enable_checkbox_recognition') and answers:
                    raw_html = apply_checkbox_answers_inline_to_html(raw_html, answers)
                pcode_ph = str((getattr(proto, 'code', None) or '') if proto else '')
                ptitle_ph = str((getattr(proto, 'title', None) or '') if proto else '')
                nt = str((getattr(icf, 'node_title', None) or '') if icf else '')
                ver = str((getattr(icf, 'version', None) or '') if icf else '')
                pmap = build_icf_placeholder_map_for_consent_record(
                    signature_data=data,
                    protocol_code=pcode_ph,
                    protocol_title=ptitle_ph,
                    node_title=nt,
                    version_label=ver,
                    signed_at=signed_at,
                    receipt_no=str(consent.receipt_no or ''),
                    protocol=proto,
                    icf=icf,
                )
                _sig_tokens = (
                    '{{ICF_SUBJECT_SIG_1}}',
                    '{{ICF_SUBJECT_SIG_2}}',
                    '{{ICF_STAFF_SIG_1}}',
                    '{{ICF_STAFF_SIG_2}}',
                )
                raw_sig = {k: pmap[k] for k in _sig_tokens if pmap.get(k)}
                pmap_rest = {k: v for k, v in pmap.items() if k not in raw_sig}
                raw_html = apply_icf_placeholders(
                    raw_html, pmap_rest, escape_values=True, raw_html_by_token=raw_sig
                )
            except Exception:
                pass
            plain = strip_tags(raw_html)
            plain = re.sub(r'\s+', ' ', plain).strip()
            if len(plain) > 12000:
                plain = plain[:12000] + '…'
            if plain:
                story.append(Paragraph(xml_escape('【正文摘要】（节点未生成可合并的 PDF 时展示）'), body_cn))
                for chunk in re.findall(r'.{1,800}', plain):
                    story.append(Paragraph(xml_escape(chunk), small_cn))
    elif merged_doc and eff_rules.get('enable_checkbox_recognition') and answers:
        from apps.protocol.services.protocol_service import resolve_icf_body_html_for_execution
        from apps.subject.services.icf_checkbox_receipt import apply_checkbox_answers_inline_to_html

        try:
            raw_html_for_merged_cb = (resolve_icf_body_html_for_execution(icf) if icf else '').strip()
        except Exception as exc:
            logger.warning(
                'consent receipt: merged checkbox trace resolve failed consent_id=%s: %s',
                consent.id,
                exc,
            )
            raw_html_for_merged_cb = ''
        if raw_html_for_merged_cb:
            try:
                raw_html_for_merged_cb = apply_checkbox_answers_inline_to_html(
                    raw_html_for_merged_cb, answers
                )
                from apps.subject.services.icf_placeholders import (
                    apply_icf_placeholders,
                    build_icf_placeholder_map_for_consent_record,
                )

                pcode_m = str((getattr(proto, 'code', None) or '') if proto else '')
                ptitle_m = str((getattr(proto, 'title', None) or '') if proto else '')
                nt_m = str((getattr(icf, 'node_title', None) or '') if icf else '')
                ver_m = str((getattr(icf, 'version', None) or '') if icf else '')
                pmap_m = build_icf_placeholder_map_for_consent_record(
                    signature_data=data,
                    protocol_code=pcode_m,
                    protocol_title=ptitle_m,
                    node_title=nt_m,
                    version_label=ver_m,
                    signed_at=signed_at,
                    receipt_no=str(consent.receipt_no or ''),
                    protocol=proto,
                    icf=icf,
                )
                _sig_tok = (
                    '{{ICF_SUBJECT_SIG_1}}',
                    '{{ICF_SUBJECT_SIG_2}}',
                    '{{ICF_STAFF_SIG_1}}',
                    '{{ICF_STAFF_SIG_2}}',
                )
                raw_sig_m = {k: pmap_m[k] for k in _sig_tok if pmap_m.get(k)}
                pmap_rest_m = {k: v for k, v in pmap_m.items() if k not in raw_sig_m}
                raw_html_for_merged_cb = apply_icf_placeholders(
                    raw_html_for_merged_cb,
                    pmap_rest_m,
                    escape_values=True,
                    raw_html_by_token=raw_sig_m,
                )
                plain_m = strip_tags(raw_html_for_merged_cb)
                plain_m = re.sub(r'\s+', ' ', plain_m).strip()
                if len(plain_m) > 12000:
                    plain_m = plain_m[:12000] + '…'
                if plain_m:
                    story.append(
                        Paragraph(
                            xml_escape('【正文勾选与占位符留痕】（与原文顺序一致，已合并知情原文 PDF 时仅附此摘要）'),
                            body_cn,
                        )
                    )
                    for chunk in re.findall(r'.{1,800}', plain_m):
                        story.append(Paragraph(xml_escape(chunk), small_cn))
            except Exception:
                pass

    sig_refs: list[str] = []
    if isinstance(data.get('consent_test_scan_signature_images'), list) and data.get('consent_test_scan_signature_images'):
        sig_refs = [str(x).strip() for x in data['consent_test_scan_signature_images'] if str(x).strip()]
    elif isinstance(data.get('signature_images'), list) and data.get('signature_images'):
        sig_refs = [str(x).strip() for x in data['signature_images'] if str(x).strip()]
    else:
        for k in ('signature_image', 'signature_image_2'):
            v = (data.get(k) or '').strip()
            if v:
                sig_refs.append(v)
    # strip_tags 会去掉正文内嵌 img，故附录始终输出受试者签名大图，避免回执仅余空白占位
    skip_sig_appendix = False
    if sig_refs and not skip_sig_appendix:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph(xml_escape('【手写签名】'), body_cn))
        for idx, sref in enumerate(sig_refs[:8], 1):
            raw_bytes = _load_signature_image_bytes(sref)
            if not raw_bytes:
                logger.warning('consent receipt: signature ref unreadable idx=%s', idx)
                continue
            try:
                im = Image.open(BytesIO(raw_bytes))
                w, h = im.size
                max_w = 420
                scale = min(max_w / float(w or 1), 1.0)
                rw, rh = int(w * scale), int(h * scale)
                buf = BytesIO(raw_bytes)
                buf.seek(0)
                lab = f'受试者签名 {idx}'
                if subj_sig_times and subj_sig_times > 1:
                    lab += f' / {subj_sig_times}'
                story.append(Paragraph(xml_escape(lab), small_cn))
                story.append(RLImage(buf, width=rw, height=rh))
                story.append(Spacer(1, 2 * mm))
            except Exception as exc:
                logger.warning('consent receipt: embed signature image failed: %s', exc)

    staff_sig_times = _clamp_1_or_2(eff_rules.get('staff_signature_times'), 1) if eff_rules.get('enable_staff_signature') else 0
    if staff_sig_times > 0 and proto:
        snap_ids = data.get('witness_staff_signature_order_ids')
        if isinstance(snap_ids, list) and snap_ids:
            staff_bytes_list = _witness_staff_signature_bytes_by_staff_ids(snap_ids, staff_sig_times)
        else:
            staff_bytes_list = _witness_staff_signature_bytes_for_protocol(proto, staff_sig_times)
        if staff_bytes_list:
            story.append(Spacer(1, 4 * mm))
            story.append(Paragraph(xml_escape('【工作人员签名】（与知情配置次数一致）'), body_cn))
            for idx, raw_bytes in enumerate(staff_bytes_list[:8], 1):
                try:
                    im = Image.open(BytesIO(raw_bytes))
                    w, h = im.size
                    max_w = 420
                    scale = min(max_w / float(w or 1), 1.0)
                    rw, rh = int(w * scale), int(h * scale)
                    buf = BytesIO(raw_bytes)
                    buf.seek(0)
                    lab = f'工作人员签名 {idx}'
                    if staff_sig_times > 1:
                        lab += f' / {staff_sig_times}'
                    story.append(Paragraph(xml_escape(lab), small_cn))
                    story.append(RLImage(buf, width=rw, height=rh))
                    story.append(Spacer(1, 2 * mm))
                except Exception as exc:
                    logger.warning('consent receipt: embed staff signature image failed: %s', exc)

    if data.get('comprehension_quiz_passed') is False:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(xml_escape('知情测验：未通过'), body_cn))
    elif data.get('comprehension_quiz_passed') is True:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(xml_escape('知情测验：通过'), body_cn))

    oi = (data.get('other_information_text') or '').strip()
    if oi:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(xml_escape('其他补充说明：'), body_cn))
        for chunk in re.findall(r'.{1,800}', oi[:8000]):
            story.append(Paragraph(xml_escape(chunk), small_cn))

    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            xml_escape(
                '说明：前几页为知情原文（若节点已上传 PDF/Word 并生成预览）；其后为回执摘要页：正文勾选在原文句式位置以「已选：是/否」展示，并与受试者/工作人员手写签名留痕。'
                if not is_test_scan
                else '说明：前几页为知情原文（若节点已上传 PDF/Word 预览）；其后为回执摘要页：正文勾选在原文位置展示，并附受试者与工作人员签名留痕。'
            ),
            small_cn,
        ),
    )

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    try:
        doc.build(story)
    except Exception as exc:
        logger.exception('consent test: build summary PDF failed consent_id=%s', consent.id)
        _ensure_stub_receipt_pdf(consent)
        return

    buf.seek(0)
    try:
        summary_reader = PdfReader(buf)
        for page in summary_reader.pages:
            writer.add_page(page)
    except Exception as exc:
        logger.warning('consent test: parse summary pdf failed: %s', exc)
        _ensure_stub_receipt_pdf(consent)
        return

    out_buf = BytesIO()
    try:
        writer.write(out_buf)
        out_buf.seek(0)
        with open(abs_path, 'wb') as f:
            f.write(out_buf.getvalue())
    except Exception as exc:
        logger.exception('consent test: write receipt pdf failed consent_id=%s', consent.id)
        _ensure_stub_receipt_pdf(consent)
        return

    data['receipt_pdf_path'] = rel_path
    data['receipt_stub'] = False
    consent.signature_data = data


def _ensure_stub_receipt_pdf(consent: SubjectConsent) -> None:
    """最小回执（英文行），用于异常回退或非知情测试路径。"""
    data = dict(consent.signature_data or {})
    if data.get('receipt_pdf_path'):
        return

    signed_at = consent.signed_at or timezone.now()
    rel_dir = Path('consent') / f'{signed_at:%Y}' / f'{signed_at:%m}'
    abs_dir = Path(settings.MEDIA_ROOT) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    file_name = f'icf_receipt_{consent.id}_{signed_at:%Y%m%d%H%M%S}.pdf'
    abs_path = abs_dir / file_name
    rel_path = str((rel_dir / file_name).as_posix())

    c = canvas.Canvas(str(abs_path), pagesize=A4)
    y = A4[1] - 72
    lines = [
        'CN_KIS ICF Receipt',
        f'Receipt No: {consent.receipt_no or ""}',
        f'Consent ID: {consent.id}',
        f'Subject ID: {consent.subject_id}',
        f'ICF Version ID: {consent.icf_version_id}',
        f'Signed At: {signed_at.isoformat()}',
    ]
    for line in lines:
        c.drawString(72, y, line)
        y -= 24
    c.showPage()
    c.save()

    data['receipt_pdf_path'] = rel_path
    data['receipt_stub'] = True
    consent.signature_data = data


def _ensure_receipt_pdf(consent: SubjectConsent) -> None:
    """生成签署回执 PDF；已存在完整版（receipt_stub=False）则跳过。旧版简易 stub 会在下次生成时升级为完整版。"""
    data = dict(consent.signature_data or {})
    if data.get('receipt_pdf_path') and data.get('receipt_stub') is False:
        return
    _build_full_consent_receipt_pdf(consent)


def _ensure_receipt_pdf_safe(consent: SubjectConsent) -> None:
    """签署落库时生成回执；任一步骤失败则降级为 stub，避免整笔签署事务失败（多节点批量提交时尤为关键）。"""
    try:
        _ensure_receipt_pdf(consent)
    except Exception:
        logger.exception('consent receipt: _ensure_receipt_pdf failed consent_id=%s', consent.id)
        try:
            _ensure_stub_receipt_pdf(consent)
        except Exception:
            logger.exception('consent receipt: stub fallback failed consent_id=%s', consent.id)


def _signed_consent_outcome_yes_no(signature_data: Optional[dict]) -> str:
    """
    已签署文档：根据 signature_data 汇总为「yes」或「no」。
    规则与 consent_signing_result_label 中已签署分支一致（用于统计与列表展示）。
    """
    d = signature_data if isinstance(signature_data, dict) else {}
    answers = d.get('icf_checkbox_answers') or d.get('checkbox_answers')
    if isinstance(answers, list) and len(answers) > 0:

        def _is_no(x) -> bool:
            if isinstance(x, dict):
                v = x.get('value', x.get('answer', x.get('selected')))
                s = str(v if v is not None else '').strip().lower()
                return s in ('no', 'n', 'false', '0', '否')
            s = str(x).strip().lower()
            return s in ('no', 'n', 'false', '0', '否')

        def _is_yes(x) -> bool:
            if isinstance(x, dict):
                v = x.get('value', x.get('answer', x.get('selected')))
                s = str(v if v is not None else '').strip().lower()
                return s in ('yes', 'y', 'true', '1', '是')
            s = str(x).strip().lower()
            return s in ('yes', 'y', 'true', '1', '是')

        if any(_is_no(a) for a in answers):
            return 'no'
        if all(_is_yes(a) for a in answers):
            return 'yes'
        return 'no'
    if d.get('comprehension_quiz_passed') is False:
        return 'no'
    return 'yes'


def _aggregate_signing_result_from_consents(consents: List[SubjectConsent]) -> str:
    """
    跨本协议全部签署节点汇总展示用：
    任一节点未签 →「-」；任一已签节点勾选/汇总为否则「否」；全部节点已签且均为是 →「是」。
    """
    if not consents:
        return '-'
    if any(not c.is_signed for c in consents):
        return '-'
    if any(_signed_consent_outcome_yes_no(c.signature_data) == 'no' for c in consents):
        return '否'
    return '是'


def batch_protocol_subject_signing_results(protocol_id: int, subject_ids: Iterable[int]) -> Dict[int, str]:
    """批量计算受试者在本协议下跨节点的汇总「签署结果」标签。"""
    ids = list({int(x) for x in subject_ids if x is not None})
    if not ids:
        return {}
    qs = SubjectConsent.objects.filter(icf_version__protocol_id=protocol_id, subject_id__in=ids)
    by_subj: Dict[int, List[SubjectConsent]] = {}
    for c in qs:
        by_subj.setdefault(c.subject_id, []).append(c)
    return {sid: _aggregate_signing_result_from_consents(lst) for sid, lst in by_subj.items()}


def _apply_consent_row_date_filter(qs, date_from: Optional[date], date_to: Optional[date]):
    """按签署日（signed_at）或未签时的创建日（create_time）落在区间内筛选。"""
    if not date_from and not date_to:
        return qs
    if date_from and date_to:
        return qs.filter(
            Q(signed_at__date__gte=date_from, signed_at__date__lte=date_to)
            | Q(
                signed_at__isnull=True,
                create_time__date__gte=date_from,
                create_time__date__lte=date_to,
            )
        )
    if date_from:
        return qs.filter(
            Q(signed_at__date__gte=date_from)
            | Q(signed_at__isnull=True, create_time__date__gte=date_from)
        )
    return qs.filter(
        Q(signed_at__date__lte=date_to)
        | Q(signed_at__isnull=True, create_time__date__lte=date_to)
    )


def consent_signing_result_label(signature_data: Optional[dict], is_signed: bool) -> str:
    """
    签署结果展示：待签署为「-」；
    已签署时优先根据 icf_checkbox_answers / checkbox_answers 汇总（任一为否则「否」，全部为是则「是」）；
    否则根据 comprehension_quiz_passed；默认「是」。
    """
    if not is_signed:
        return '-'
    o = _signed_consent_outcome_yes_no(signature_data)
    return '是' if o == 'yes' else '否'


def consent_list_display_fields(consent: SubjectConsent, aggregate_signing_result: Optional[str] = None) -> dict:
    """执行台签署列表扩展字段：SC号、拼音首字母、签署结果（可传入跨节点汇总结果）。"""
    sig = consent.signature_data or {}
    rs = sig.get('reception_sync') or {}
    mc = sig.get('mini_sign_confirm') or {}
    sc = (rs.get('sc_number') or '').strip()
    if not sc and isinstance(mc, dict) and (mc.get('screening_number') or '').strip():
        sc = (mc.get('screening_number') or '').strip()
    py = (rs.get('name_pinyin_initials') or '').strip()
    if not py and isinstance(mc, dict) and (mc.get('initials') or '').strip():
        py = (mc.get('initials') or '').strip()
    # 知情测试 H5：扫码页填写的 SC、姓名 → 列表 SC号 / 拼音首字母（signature_data.consent_test_scan_identity）
    if sig.get('consent_test_scan_h5'):
        cti = sig.get('consent_test_scan_identity')
        if isinstance(cti, dict):
            if not sc:
                sn = (cti.get('declared_screening_number') or '').strip()
                if sn:
                    sc = sn
            pin = (cti.get('declared_pinyin_initials') or '').strip()
            if pin:
                py = pin.upper()[:50]
            elif not py:
                dn = (cti.get('declared_name') or '').strip()
                if dn:
                    from apps.subject.services.reception_service import _name_pinyin_initials

                    py = _name_pinyin_initials(dn)
    icfv = safe_subject_consent_icf_version(consent)
    prot = safe_icf_protocol(icfv)
    pcode = (rs.get('project_code') or (getattr(prot, 'code', None) or '')).strip()
    sid = consent.subject_id
    if (not sc or not py) and pcode and sid:
        from apps.subject.models_execution import SubjectAppointment
        from apps.subject.services.reception_service import get_today_queue, _name_pinyin_initials

        today = timezone.localdate()
        try:
            if not sc:
                qdata = get_today_queue(target_date=today, page=1, page_size=10000, project_code=pcode)
                for item in qdata.get('items') or []:
                    if item.get('subject_id') == sid:
                        sc = (item.get('sc_number') or '').strip()
                        break
            if not py:
                appt = SubjectAppointment.objects.filter(
                    subject_id=sid, appointment_date=today, project_code=pcode
                ).first()
                subj = getattr(consent, 'subject', None) or Subject.objects.filter(id=sid).first()
                if appt and (appt.name_pinyin_initials or '').strip():
                    py = appt.name_pinyin_initials.strip()
                elif subj:
                    py = _name_pinyin_initials(subj.name or '')
        except Exception as e:
            logger.warning('consent_list_display_fields: 补全 SC/拼音首字母失败（已跳过）: %s', e)
    if not py:
        nm = (subject_name_display_for_consent(consent) or '').strip()
        if nm:
            from apps.subject.services.reception_service import _name_pinyin_initials

            py = _name_pinyin_initials(nm)
    signing_kind = (sig.get('signing_kind') or '').strip()
    signing_type = '测试' if signing_kind == 'test' else '正式'
    phone_masked = _mask_phone(subject_phone_display_for_consent(consent))
    id_card_masked = _mask_id_card(subject_id_card_display_for_consent(consent))
    sr = (
        aggregate_signing_result
        if aggregate_signing_result is not None
        else consent_signing_result_label(sig, consent.is_signed)
    )
    return {
        'sc_number': sc or '-',
        'name_pinyin_initials': py or '-',
        'signing_result': sr,
        'signing_type': signing_type,
        'phone_masked': phone_masked or '-',
        'id_card_masked': id_card_masked or '-',
    }


@transaction.atomic
def sync_pending_consents_after_checkin(subject_id: int) -> dict:
    """
    接待台「已签到」后：按项目协议创建/更新待签署知情记录（与今日队列 SC/拼音 对齐）。
    """
    from apps.protocol.models import Protocol
    from apps.subject.models_execution import SubjectAppointment

    today = timezone.localdate()
    subject = Subject.objects.filter(id=subject_id).first()
    if not subject:
        return {'ok': False, 'reason': 'no_subject'}

    appt = SubjectAppointment.objects.filter(
        subject_id=subject_id, appointment_date=today
    ).order_by('-update_time').first()
    project_code = (appt.project_code or '').strip() if appt else ''
    if not project_code:
        enr = (
            Enrollment.objects.filter(subject_id=subject_id)
            .exclude(status='withdrawn')
            .select_related('protocol')
            .order_by('-id')
            .first()
        )
        if enr and enr.protocol:
            project_code = (enr.protocol.code or '').strip()

    if not project_code:
        return {'ok': False, 'reason': 'no_project_code'}

    protocol = Protocol.objects.filter(code=project_code, is_deleted=False).first()
    if not protocol:
        return {'ok': False, 'reason': 'no_protocol'}

    from apps.subject.services.reception_service import get_today_queue, _name_pinyin_initials

    data = get_today_queue(target_date=today, page=1, page_size=10000, project_code=project_code)
    sc_number = ''
    for item in data.get('items') or []:
        if item.get('subject_id') == subject_id:
            sc_number = (item.get('sc_number') or '').strip()
            break

    py = ''
    if appt and (appt.name_pinyin_initials or '').strip():
        py = appt.name_pinyin_initials.strip()
    if not py:
        py = _name_pinyin_initials(subject.name or '')

    sync_meta = {
        'project_code': project_code,
        'sc_number': sc_number,
        'name_pinyin_initials': py,
        'subject_no': (subject.subject_no or '').strip(),
        'subject_name': (subject.name or '').strip(),
        'synced_at': timezone.now().isoformat(),
    }

    icf_qs = ICFVersion.objects.filter(protocol_id=protocol.id, is_active=True).order_by('display_order', 'id')
    created_n = 0
    updated_n = 0
    for icf in icf_qs:
        consent = SubjectConsent.all_objects.filter(subject_id=subject_id, icf_version_id=icf.id).first()
        if consent is None:
            SubjectConsent.objects.create(
                subject_id=subject_id,
                icf_version_id=icf.id,
                is_signed=False,
                signature_data={'reception_sync': sync_meta},
            )
            created_n += 1
            continue
        if consent.is_deleted:
            continue
        if consent.is_signed:
            continue
        sig = dict(consent.signature_data or {})
        sig['reception_sync'] = {**(sig.get('reception_sync') or {}), **sync_meta}
        consent.signature_data = sig
        consent.save(update_fields=['signature_data', 'update_time'])
        updated_n += 1

    return {'ok': True, 'project_code': project_code, 'created': created_n, 'updated': updated_n}


@transaction.atomic
def staff_return_consent_for_resign(
    protocol_id: int,
    consent_id: int,
    *,
    reason: Optional[str] = None,
) -> SubjectConsent:
    """执行台：退回重签，签署状态变为退回重签中（清空本次签署与回执，保留 voided 信息于 signature_data）。"""
    consent = (
        SubjectConsent.objects.select_for_update()
        .filter(id=consent_id, icf_version__protocol_id=protocol_id, is_signed=True)
        .first()
    )
    if not consent:
        raise ValueError('记录不存在或未签署')
    st = (getattr(consent, 'staff_audit_status', None) or '').strip()
    if st == STAFF_AUDIT_APPROVED:
        raise ValueError('已通过审核的记录无法退回重签')
    sig = dict(consent.signature_data or {})
    sig['staff_returned_at'] = timezone.now().isoformat()
    if reason is not None and str(reason).strip():
        sig['staff_return_reason'] = str(reason).strip()[:500]
    else:
        sig.pop('staff_return_reason', None)
    if consent.receipt_no:
        sig['voided_receipt_no'] = consent.receipt_no
    sig.pop('investigator_sign', None)
    consent.is_signed = False
    consent.signed_at = None
    consent.receipt_no = None
    consent.signature_data = sig
    consent.staff_audit_status = STAFF_AUDIT_RETURNED
    uf = ['is_signed', 'signed_at', 'receipt_no', 'signature_data', 'staff_audit_status', 'update_time']
    if _table_has_column('t_subject_consent', 'investigator_signed_at'):
        consent.investigator_signed_at = None
        uf.insert(-1, 'investigator_signed_at')
    consent.save(update_fields=uf)
    return consent


@transaction.atomic
def staff_approve_consent(protocol_id: int, consent_id: int) -> SubjectConsent:
    """执行台：通过审核，签署状态变为已通过审核。"""
    consent = (
        SubjectConsent.objects.select_for_update()
        .filter(id=consent_id, icf_version__protocol_id=protocol_id, is_signed=True)
        .first()
    )
    if not consent:
        raise ValueError('记录不存在或未签署')
    st = (getattr(consent, 'staff_audit_status', None) or '').strip()
    if st == STAFF_AUDIT_APPROVED:
        raise ValueError('该记录已是已通过审核')
    consent.staff_audit_status = STAFF_AUDIT_APPROVED
    consent.save(update_fields=['staff_audit_status', 'update_time'])
    return consent


@transaction.atomic
def soft_delete_consent_for_execution(protocol_id: int, consent_id: int) -> SubjectConsent:
    """执行台：软删除签署记录（列表不再展示，库中保留 is_deleted=True）。"""
    consent = (
        SubjectConsent.objects.select_for_update()
        .filter(id=consent_id, icf_version__protocol_id=protocol_id)
        .first()
    )
    if not consent:
        raise ValueError('记录不存在')
    if consent.is_deleted:
        raise ValueError('记录已删除')
    consent.is_deleted = True
    consent.save(update_fields=['is_deleted', 'update_time'])
    return consent


def get_consent_preview_for_execution(protocol_id: int, consent_id: int) -> Optional[dict]:
    """执行台预览：ICF 正文摘要 + 签署元数据（脱敏）。"""
    c = (
        SubjectConsent.objects.filter(id=consent_id, icf_version__protocol_id=protocol_id)
        .select_related('subject', 'icf_version', 'icf_version__protocol')
        .first()
    )
    if not c:
        return None
    # 与小程序「下载签署文件」同源：预览前尽量生成完整回执 PDF（合并原文 + 摘要页）
    if c.is_signed:
        _sd0 = dict(c.signature_data or {})
        if not _sd0.get('receipt_pdf_path') or _sd0.get('receipt_stub') is not False:
            _ensure_receipt_pdf_safe(c)
            c.save(update_fields=['signature_data', 'update_time'])
    icf = safe_subject_consent_icf_version(c)
    protocol = safe_icf_protocol(icf)
    from apps.protocol.services.protocol_service import resolve_icf_body_html_for_execution

    content = resolve_icf_body_html_for_execution(icf) if icf else ''
    sig = dict(c.signature_data or {})
    try:
        from apps.subject.services.icf_placeholders import (
            apply_icf_placeholders,
            build_icf_placeholder_map_for_consent_record,
        )

        pcode = (getattr(protocol, 'code', None) or '') if protocol else ''
        ptitle = (getattr(protocol, 'title', None) or '') if protocol else ''
        nt = (getattr(icf, 'node_title', None) or '') if icf else ''
        ver = (getattr(icf, 'version', None) or '') if icf else ''
        pmap = build_icf_placeholder_map_for_consent_record(
            signature_data=sig,
            protocol_code=str(pcode),
            protocol_title=str(ptitle),
            node_title=str(nt),
            version_label=str(ver),
            signed_at=c.signed_at,
            receipt_no=str(c.receipt_no or ''),
            protocol=protocol,
            icf=icf,
        )
        _sig_tok = (
            '{{ICF_SUBJECT_SIG_1}}',
            '{{ICF_SUBJECT_SIG_2}}',
            '{{ICF_STAFF_SIG_1}}',
            '{{ICF_STAFF_SIG_2}}',
        )
        raw_sig = {k: pmap[k] for k in _sig_tok if pmap.get(k)}
        pmap_rest = {k: v for k, v in pmap.items() if k not in raw_sig}
        content = apply_icf_placeholders(content, pmap_rest, escape_values=True, raw_html_by_token=raw_sig)
    except Exception:
        pass
    pub_sig = {k: v for k, v in sig.items() if k not in ('face_verify_token',)}
    mini_rules: dict = {}
    if protocol is not None and icf is not None:
        mr = get_effective_mini_sign_rules(protocol, icf)
        sup = mr.get('supplemental_collect_labels')
        if not isinstance(sup, list):
            sup = []
        en_sub = bool(mr.get('enable_subject_signature', True))
        try:
            st_raw = int(mr.get('subject_signature_times') or 1)
        except (TypeError, ValueError):
            st_raw = 1
        subj_times = 0 if not en_sub else (2 if st_raw >= 2 else 1)
        en_staff = bool(mr.get('enable_staff_signature', False))
        try:
            staff_raw = int(mr.get('staff_signature_times') or 1)
        except (TypeError, ValueError):
            staff_raw = 1
        staff_times = 0 if not en_staff else (2 if staff_raw >= 2 else 1)
        mini_rules = {
            'enable_checkbox_recognition': bool(mr.get('enable_checkbox_recognition', False)),
            'supplemental_collect_labels': [str(x).strip() for x in sup if str(x).strip()][:20],
            'collect_other_information': bool(mr.get('collect_other_information', False)),
            'enable_subject_signature': en_sub,
            'subject_signature_times': subj_times,
            'enable_staff_signature': en_staff,
            'staff_signature_times': staff_times,
            'enable_auto_sign_date': bool(mr.get('enable_auto_sign_date', False)),
        }
    from django.conf import settings as _django_settings

    _rp = (sig.get('receipt_pdf_path') or '').strip()
    _receipt_pdf_path = _rp or None
    _receipt_pdf_url = f'{_django_settings.MEDIA_URL}{_receipt_pdf_path}' if _receipt_pdf_path else None
    return {
        'subject_no': subject_no_display_for_consent(c),
        'subject_name': subject_name_display_for_consent(c),
        'protocol_code': (getattr(protocol, 'code', None) or '') if protocol else '',
        'protocol_title': (getattr(protocol, 'title', None) or '') if protocol else '',
        'icf_version': icf.version if icf else '',
        'node_title': (getattr(icf, 'node_title', None) or '') if icf else '',
        'icf_content_html': content,
        'is_signed': c.is_signed,
        'signed_at': c.signed_at.isoformat() if c.signed_at else None,
        'receipt_no': c.receipt_no or '',
        'receipt_pdf_path': _receipt_pdf_path,
        'receipt_pdf_url': _receipt_pdf_url,
        'signing_result': consent_signing_result_label(sig, c.is_signed),
        'consent_status_label': consent_staff_display_status(c),
        'staff_audit_status': getattr(c, 'staff_audit_status', '') or '',
        'signature_summary': pub_sig,
        'mini_sign_rules_preview': mini_rules,
    }
