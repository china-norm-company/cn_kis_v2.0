"""
研究台 · 日记管理 API（采苓）

供研究台「日记管理」模块使用：配置、条目查询/导出、填写进度。
与受试者端 /my/ 接口分离；数据模型见 SubjectDiaryConfig、SubjectDiary。

前缀：/api/v1/research/diary/
"""
# 不使用 from __future__ import annotations：与 django-ninja + Pydantic v2 组合时
# 会导致请求体 Schema 以字符串前向引用形式存在，触发 QueryParams「未完全定义」500。

import copy
import csv
import io
from datetime import date, timedelta
from typing import Any, List, Optional

from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from ninja import Router, Query
from pydantic import BaseModel, Field

from apps.identity.decorators import _get_account_from_request, require_permission
from apps.project_full_link.models import Project
from apps.protocol.models import Protocol, ProtocolStatus

from .diary_text import diary_symptom_fields_for_api, normalize_diary_text_field
from .models_diary_config import SubjectDiaryConfig, SubjectDiaryConfigStatus
from .models_loyalty import SubjectDiary
from .models import Enrollment, EnrollmentStatus, Subject
from .services.enrollment_service import enroll_subject
from .services.subject_service import create_subject

router = Router()


def _cfg_to_dict(cfg: SubjectDiaryConfig) -> dict:
    return {
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
    }


def _ensure_project_exists(project_id: int) -> Optional[Project]:
    return Project.objects.filter(id=project_id, is_delete=False).first()


def _mask_phone(phone: str) -> str:
    p = (phone or '').strip()
    if len(p) >= 11:
        return f'{p[:3]}****{p[-4:]}'
    if len(p) >= 7:
        return f'{p[:2]}****{p[-2:]}'
    return p or '—'


def _enrollment_status_label(status: str) -> str:
    for choice in EnrollmentStatus:
        if choice.value == status:
            return str(choice.label)
    return status or '—'


class DiaryConfigCreateIn(BaseModel):
    """使用 pydantic.BaseModel，避免 ninja.Schema 在 Pydantic v2 下与 Body 合并时报未定义错误。"""

    project_id: int
    project_no: Optional[str] = ''
    config_version_label: Optional[str] = ''
    form_definition_json: List[Any] = Field(default_factory=list)
    rule_json: dict = Field(default_factory=dict)
    status: Optional[str] = SubjectDiaryConfigStatus.DRAFT


class DiaryConfigUpdateIn(BaseModel):
    project_no: Optional[str] = None
    config_version_label: Optional[str] = None
    form_definition_json: Optional[List[Any]] = None
    rule_json: Optional[dict] = None
    status: Optional[str] = None


class DiarySetupProjectIn(BaseModel):
    """研究台日记场景：新建全链路项目并创建与项目编号一致的研究协议（供入组匹配）。"""

    project_no: str
    project_name: str


class DiaryRegisterSubjectIn(BaseModel):
    """研究台日记验证：按项目登记受试者并入组（协议编号与项目编号一致）。"""

    project_id: int
    subject_no: str
    phone: str
    name: Optional[str] = None


class DiaryConfigFromTemplateIn(BaseModel):
    """从模板项目复制最新日记配置；无模板时使用系统内置（与前端默认一致）。"""

    project_id: int
    template_project_no: Optional[str] = 'W26000000'
    config_version_label: Optional[str] = 'v1'


def _builtin_default_form_and_rule() -> tuple[List[Any], dict]:
    """与 apps/research 中 DEFAULT_FORM + DEFAULT_RULE_STATE / stateToRuleJson 一致。"""
    form: List[Any] = [
        {
            'id': 'medication_taken',
            'type': 'boolean',
            'label': '是否按要求使用产品',
            'required': True,
            'order': 10,
        },
    ]
    rule = {
        'timezone': 'Asia/Shanghai',
        'diary_period': {'start': '', 'end': ''},
        'fill_time_window': {'start': '09:00', 'end': '18:00'},
        'frequency': 'daily',
        'retrospective_days_max': 7,
        'late_reason_required_when_retrospective': True,
    }
    return form, rule


def _resolve_diary_template_content(template_project_no: str) -> tuple[List[Any], dict, str]:
    """
    优先使用模板项目下最新一条日记配置的 form/rule；
    若模板项目不存在或无配置，则返回内置默认与说明文案。
    """
    tn = (template_project_no or '').strip() or 'W26000000'
    builtin_form, builtin_rule = _builtin_default_form_and_rule()
    tpl_proj = Project.objects.filter(project_no=tn, is_delete=False).first()
    if not tpl_proj:
        return (
            copy.deepcopy(builtin_form),
            copy.deepcopy(builtin_rule),
            f'未找到模板项目 {tn}，已使用系统内置题目与规则（每日一条、补填等）',
        )
    cfg = (
        SubjectDiaryConfig.objects.filter(project_id=tpl_proj.id)
        .order_by('-id')
        .first()
    )
    raw_form = (cfg.form_definition_json if cfg else None) or []
    if not raw_form:
        return (
            copy.deepcopy(builtin_form),
            copy.deepcopy(builtin_rule),
            f'项目 {tn} 尚无日记配置，已使用系统内置题目与规则',
        )
    form_def = copy.deepcopy(list(raw_form))
    raw_rule = cfg.rule_json if cfg else None
    if isinstance(raw_rule, dict) and raw_rule:
        rule = copy.deepcopy(raw_rule)
    else:
        rule = copy.deepcopy(builtin_rule)
    return form_def, rule, f'已复制自项目 {tn} 的最新日记配置（题目与规则）'


@router.post('/setup-project', summary='新建研究项目与匹配用研究协议（日记场景）')
@require_permission('subject.subject.update')
def setup_diary_project(request, payload: DiarySetupProjectIn):
    """
    创建 project_full_link.Project，并创建 t_protocol 记录，protocol.code 与 project_no 一致，
    便于受试者入组后按编号匹配日记配置。不触发飞书协议创建等重流程。

    """
    pn = (payload.project_no or '').strip()
    name = (payload.project_name or '').strip()
    if not pn:
        return 400, {'code': 400, 'msg': '请填写正式项目编号', 'data': None}
    if len(pn) > 100:
        return 400, {'code': 400, 'msg': '项目编号过长', 'data': None}
    if not name:
        return 400, {'code': 400, 'msg': '请填写项目名称', 'data': None}
    if len(name) > 500:
        return 400, {'code': 400, 'msg': '项目名称过长', 'data': None}

    if Project.objects.filter(project_no=pn, is_delete=False).exists():
        return 400, {'code': 400, 'msg': '该正式项目编号已存在，请更换编号或从上方列表选择已有项目', 'data': None}

    dup_proto = Protocol.objects.filter(code=pn, is_deleted=False).first()
    if dup_proto:
        return 400, {
            'code': 400,
            'msg': '系统中已存在相同编号的研究协议，无法重复创建。请联系管理员或更换项目编号。',
            'data': {'existing_protocol_id': dup_proto.id},
        }

    account = _get_account_from_request(request)
    aid = account.id if account else None

    with transaction.atomic():
        proj = Project.objects.create(
            project_no=pn,
            project_name=name,
            execution_status='pending_execution',
            created_by=aid,
            updated_by=aid,
        )
        proto = Protocol.objects.create(
            title=f'{name}（研究协议）',
            code=pn,
            status=ProtocolStatus.ACTIVE,
            created_by_id=aid,
        )

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'project_id': proj.id,
            'project_no': proj.project_no,
            'project_name': proj.project_name,
            'protocol_id': proto.id,
        },
    }


@router.post('/register-subject', summary='登记受试者并入组（日记验证用）')
@require_permission('subject.subject.update')
def register_subject_for_diary(request, payload: DiaryRegisterSubjectIn):
    """
    创建受试者（可指定编号）、并入组到当前项目对应的研究协议。
    用于研究台 2.0 与小程序日记联调；不扩展其他业务联动。
    """
    proj = _ensure_project_exists(payload.project_id)
    if not proj:
        return JsonResponse({'code': 404, 'msg': '项目不存在', 'data': None}, status=404)
    code = (proj.project_no or '').strip()
    if not code:
        return JsonResponse(
            {'code': 400, 'msg': '该项目缺少正式项目编号，无法入组', 'data': None},
            status=400,
        )
    proto = Protocol.objects.filter(code=code, is_deleted=False).order_by('-id').first()
    if not proto:
        return JsonResponse(
            {
                'code': 400,
                'msg': '未找到与该项目编号一致的研究协议，请先使用「新建研究项目」或联系管理员补录。',
                'data': None,
            },
            status=400,
        )

    sn = (payload.subject_no or '').strip()[:20]
    if not sn:
        return JsonResponse({'code': 400, 'msg': '请填写受试者编号', 'data': None}, status=400)
    phone = (payload.phone or '').strip()
    if not phone:
        return JsonResponse({'code': 400, 'msg': '请填写手机号码', 'data': None}, status=400)
    display_name = (payload.name or '').strip() or f'受试者({sn})'

    account = _get_account_from_request(request)
    try:
        subject = create_subject(
            name=display_name,
            phone=phone,
            explicit_subject_no=sn,
            risk_level='low',
            account=account,
        )
    except ValueError as e:
        return JsonResponse({'code': 400, 'msg': str(e), 'data': None}, status=400)

    enrollment = enroll_subject(subject.id, proto.id, account=account)
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'subject_id': subject.id,
            'subject_no': subject.subject_no,
            'name': subject.name,
            'protocol_id': proto.id,
            'enrollment_id': enrollment.id,
            'enrollment_status': enrollment.status,
        },
    }


@router.get('/linked-protocol', summary='按全链路项目解析对应研究协议 ID')
@require_permission('subject.subject.read')
def get_diary_linked_protocol(request, project_id: int = Query(...)):
    """protocol.code 与 Project.project_no 一致时，返回用于入组的研究协议主键。"""
    proj = _ensure_project_exists(project_id)
    if not proj:
        return JsonResponse({'code': 404, 'msg': '项目不存在', 'data': None}, status=404)
    code = (proj.project_no or '').strip()
    if not code:
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'protocol_id': None,
                'hint': '该项目尚未填写正式项目编号，无法关联研究协议。请先在项目管理中补全编号。',
            },
        }
    proto = Protocol.objects.filter(code=code, is_deleted=False).order_by('-id').first()
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'protocol_id': proto.id if proto else None,
            'project_no': code,
            'hint': None if proto else '未找到与该项目编号一致的研究协议。可使用「新建研究项目」创建，或联系管理员补录协议。',
        },
    }


@router.get('/project-subjects', summary='本项目入组受试者（日记场景）')
@require_permission('subject.subject.read')
def list_diary_project_subjects(request, project_id: int = Query(...)):
    """
    列出与当前全链路项目正式编号一致的研究协议下的入组记录，供研究台核对「谁已入组」。
    手机号为脱敏展示。
    """
    proj = _ensure_project_exists(project_id)
    if not proj:
        return JsonResponse({'code': 404, 'msg': '项目不存在', 'data': None}, status=404)
    code = (proj.project_no or '').strip()
    if not code:
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'project_no': '',
                'protocol_id': None,
                'hint': '该项目尚未填写正式项目编号，无法列出入组受试者。',
                'items': [],
                'total': 0,
            },
        }
    proto = Protocol.objects.filter(code=code, is_deleted=False).order_by('-id').first()
    if not proto:
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'project_no': code,
                'protocol_id': None,
                'hint': '未找到与该项目编号一致的研究协议，暂无入组数据。请先「新建研究项目」或联系管理员补录协议。',
                'items': [],
                'total': 0,
            },
        }
    qs = (
        Enrollment.objects.filter(protocol_id=proto.id)
        .select_related('subject')
        .order_by('-create_time')[:500]
    )
    items = []
    for e in qs:
        sub = e.subject
        items.append(
            {
                'enrollment_id': e.id,
                'subject_id': e.subject_id,
                'subject_no': (sub.subject_no if sub else '') or '',
                'name': (sub.name if sub else '') or '',
                'phone_masked': _mask_phone(sub.phone if sub else ''),
                'enrollment_status': e.status,
                'enrollment_status_label': _enrollment_status_label(e.status),
                'protocol_code': code,
            }
        )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'project_no': code,
            'protocol_id': proto.id,
            'hint': None,
            'items': items,
            'total': len(items),
        },
    }


@router.get('/configs', summary='按项目列出日记配置')
@require_permission('subject.subject.read')
def list_diary_configs(request, project_id: int = Query(...)):
    if not _ensure_project_exists(project_id):
        return 404, {'code': 404, 'msg': '项目不存在', 'data': None}
    qs = SubjectDiaryConfig.objects.filter(project_id=project_id).order_by('-id')
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'items': [_cfg_to_dict(c) for c in qs]},
    }


@router.post('/configs/from-template', summary='从模板项目生成草稿配置')
@require_permission('subject.subject.update')
def create_diary_config_from_template(request, payload: DiaryConfigFromTemplateIn):
    """
    默认从模板项目（默认正式编号 W26000000）的**最新一条**日记配置复制题目与规则；
    若模板项目不存在或无配置，则使用系统内置（每日一条、补填等）。
    """
    proj = _ensure_project_exists(payload.project_id)
    if not proj:
        return JsonResponse({'code': 404, 'msg': '项目不存在', 'data': None}, status=404)
    form_def, rule, source_desc = _resolve_diary_template_content(
        (payload.template_project_no or 'W26000000').strip() or 'W26000000'
    )
    label = (payload.config_version_label or 'v1')[:50]
    cfg = SubjectDiaryConfig.objects.create(
        project_id=payload.project_id,
        project_no=(proj.project_no or '')[:100],
        config_version_label=label,
        form_definition_json=form_def,
        rule_json=rule,
        status=SubjectDiaryConfigStatus.DRAFT,
    )
    out = _cfg_to_dict(cfg)
    out['template_source'] = source_desc
    return {'code': 200, 'msg': '已创建', 'data': out}


@router.get('/configs/{config_id}', summary='日记配置详情')
@require_permission('subject.subject.read')
def get_diary_config_detail(request, config_id: int):
    cfg = SubjectDiaryConfig.objects.filter(id=config_id).select_related('project').first()
    if not cfg:
        return 404, {'code': 404, 'msg': '配置不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _cfg_to_dict(cfg)}


@router.post('/configs', summary='新建日记配置')
@require_permission('subject.subject.update')
def create_diary_config(request, payload: DiaryConfigCreateIn):
    proj = _ensure_project_exists(payload.project_id)
    if not proj:
        return 404, {'code': 404, 'msg': '项目不存在', 'data': None}
    st = payload.status or SubjectDiaryConfigStatus.DRAFT
    if st not in (SubjectDiaryConfigStatus.DRAFT, SubjectDiaryConfigStatus.PUBLISHED):
        st = SubjectDiaryConfigStatus.DRAFT
    cfg = SubjectDiaryConfig.objects.create(
        project_id=payload.project_id,
        project_no=(payload.project_no or proj.project_no or '')[:100],
        config_version_label=(payload.config_version_label or '')[:50],
        form_definition_json=payload.form_definition_json or [],
        rule_json=payload.rule_json or {},
        status=st,
    )
    return {'code': 200, 'msg': '已创建', 'data': _cfg_to_dict(cfg)}


@router.put('/configs/{config_id}', summary='更新日记配置')
@require_permission('subject.subject.update')
def update_diary_config(request, config_id: int, payload: DiaryConfigUpdateIn):
    cfg = SubjectDiaryConfig.objects.filter(id=config_id).first()
    if not cfg:
        return 404, {'code': 404, 'msg': '配置不存在', 'data': None}
    if payload.project_no is not None:
        cfg.project_no = payload.project_no[:100]
    if payload.config_version_label is not None:
        cfg.config_version_label = payload.config_version_label[:50]
    if payload.form_definition_json is not None:
        cfg.form_definition_json = payload.form_definition_json
    if payload.rule_json is not None:
        cfg.rule_json = payload.rule_json
    if payload.status is not None:
        if payload.status in (SubjectDiaryConfigStatus.DRAFT, SubjectDiaryConfigStatus.PUBLISHED):
            cfg.status = payload.status
    cfg.save()
    return {'code': 200, 'msg': '已保存', 'data': _cfg_to_dict(cfg)}


@router.post('/configs/{config_id}/publish', summary='发布配置')
@require_permission('subject.subject.update')
def publish_diary_config(request, config_id: int):
    cfg = SubjectDiaryConfig.objects.filter(id=config_id).first()
    if not cfg:
        return 404, {'code': 404, 'msg': '配置不存在', 'data': None}
    cfg.status = SubjectDiaryConfigStatus.PUBLISHED
    cfg.save(update_fields=['status', 'update_time'])
    return {'code': 200, 'msg': '已发布', 'data': _cfg_to_dict(cfg)}


@router.post('/configs/{config_id}/confirm-researcher', summary='研究员确认（2.0 门禁）')
@require_permission('subject.subject.update')
def confirm_researcher_diary_config(request, config_id: int):
    cfg = SubjectDiaryConfig.objects.filter(id=config_id).first()
    if not cfg:
        return 404, {'code': 404, 'msg': '配置不存在', 'data': None}
    cfg.researcher_confirmed_at = timezone.now()
    cfg.save(update_fields=['researcher_confirmed_at', 'update_time'])
    return {'code': 200, 'msg': '已确认', 'data': _cfg_to_dict(cfg)}


@router.post('/configs/{config_id}/draft', summary='撤回为草稿')
@require_permission('subject.subject.update')
def draft_diary_config(request, config_id: int):
    cfg = SubjectDiaryConfig.objects.filter(id=config_id).first()
    if not cfg:
        return 404, {'code': 404, 'msg': '配置不存在', 'data': None}
    cfg.status = SubjectDiaryConfigStatus.DRAFT
    cfg.save(update_fields=['status', 'update_time'])
    return {'code': 200, 'msg': '已设为草稿', 'data': _cfg_to_dict(cfg)}


def _parse_date(s: str) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _diary_has_adverse(d: SubjectDiary, sym: dict) -> bool:
    """与小程序「是否发生不良情况」一致：心情为不适、有症状描述，或存在症状程度/时间等拆分字段。"""
    m = normalize_diary_text_field(d.mood)
    s = normalize_diary_text_field(d.symptoms)
    if m == '不适' or bool(s):
        return True
    if sym.get('symptom_severity') or sym.get('symptom_onset') or sym.get('symptom_duration'):
        return True
    return False


def _project_no_name_for_subject(sub: Optional[Subject]) -> tuple[str, str]:
    """
    导出用：优先与受试者端「日记任务」所属全链路项目一致（api_my._resolve_diary_project_id_for_subject）；
    若无可用日记配置命中，则退化为当前已入组协议编号对应的项目。
    """
    if not sub:
        return '', ''
    from .api_my import _resolve_diary_project_id_for_subject

    pid = _resolve_diary_project_id_for_subject(sub)
    if pid:
        proj = Project.objects.filter(id=pid, is_delete=False).first()
        if proj:
            return (proj.project_no or '').strip(), (proj.project_name or '').strip()
    e = (
        Enrollment.objects.filter(subject=sub, status=EnrollmentStatus.ENROLLED)
        .select_related('protocol')
        .order_by('-create_time')
        .first()
    )
    if e and e.protocol and (e.protocol.code or '').strip():
        code = (e.protocol.code or '').strip()
        proj = Project.objects.filter(project_no=code, is_delete=False).first()
        if proj:
            return (proj.project_no or '').strip(), (proj.project_name or '').strip()
    return '', ''


def _format_diary_export_datetime(dt) -> str:
    """与研究台 formatDiarySubmitTime 一致：本地时区 YYYY-MM-DD HH:mm:ss"""
    if not dt:
        return ''
    local = timezone.localtime(dt) if timezone.is_aware(dt) else dt
    return local.strftime('%Y-%m-%d %H:%M:%S')


def _diary_export_text_cell(s: str) -> str:
    """与研究台症状类列「空则 —」一致；换行转空格。"""
    t = (s or '').replace('\n', ' ').strip()
    return t if t else '—'


def _daterange_inclusive(start: date, end: date) -> List[date]:
    out = []
    d = start
    while d <= end:
        out.append(d)
        d += timedelta(days=1)
    return out


@router.get('/entries', summary='日记条目列表（工作台）')
@require_permission('subject.subject.read')
def list_diary_entries(
    request,
    subject_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
):
    qs = SubjectDiary.objects.filter(is_deleted=False).order_by('-entry_date', '-id')
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    total = qs.count()
    start = (page - 1) * page_size
    rows = list(qs[start : start + page_size])
    subject_ids = {d.subject_id for d in rows}
    subjects_by_id = {s.id: s for s in Subject.objects.filter(id__in=subject_ids, is_deleted=False)}
    items = []
    for d in rows:
        sub = subjects_by_id.get(d.subject_id)
        sym = diary_symptom_fields_for_api(d)
        items.append({
            'id': d.id,
            'subject_id': d.subject_id,
            'subject_no': sub.subject_no if sub else '',
            'subject_name': sub.name if sub else '',
            'subject_phone': (sub.phone or '').strip() if sub else '',
            'entry_date': d.entry_date.isoformat(),
            'symptoms': normalize_diary_text_field(d.symptoms),
            'medication_taken': d.medication_taken,
            'has_adverse': _diary_has_adverse(d, sym),
            'symptom_severity': sym['symptom_severity'],
            'symptom_onset': sym['symptom_onset'],
            'symptom_duration': sym['symptom_duration'],
            'create_time': d.create_time.isoformat(),
            'update_time': d.update_time.isoformat(),
        })
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'items': items, 'total': total, 'page': page, 'page_size': page_size},
    }


@router.get('/entries/export', summary='导出日记条目 CSV')
@require_permission('subject.subject.read')
def export_diary_entries(request, subject_id: Optional[int] = Query(None)):
    qs = SubjectDiary.objects.filter(is_deleted=False).order_by('-entry_date', '-id')
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    # 列顺序与采苓研究台「数据查看」表格一致，并前置项目编号/名称
    w.writerow([
        '项目编号',
        '项目名称',
        '受试者编号',
        '姓名',
        '手机号',
        '规定使用日期',
        '提交时间',
        '是否按要求使用产品',
        '是否发生任何不良情况',
        '症状',
        '症状程度',
        '症状开始时间',
        '症状持续时长',
    ])
    project_cache: dict[int, tuple[str, str]] = {}
    rows = list(qs[:5000])
    subject_ids = {d.subject_id for d in rows}
    subjects_by_id = {s.id: s for s in Subject.objects.filter(id__in=subject_ids, is_deleted=False)}
    for d in rows:
        sub = subjects_by_id.get(d.subject_id)
        if d.subject_id not in project_cache:
            project_cache[d.subject_id] = _project_no_name_for_subject(sub)
        proj_no, proj_name = project_cache[d.subject_id]
        sym = diary_symptom_fields_for_api(d)
        has_adv = _diary_has_adverse(d, sym)
        w.writerow([
            proj_no or '—',
            proj_name or '—',
            sub.subject_no if sub else '',
            sub.name if sub else '',
            _diary_export_text_cell((sub.phone or '').strip() if sub else ''),
            d.entry_date.isoformat(),
            _format_diary_export_datetime(d.create_time),
            '是' if d.medication_taken else '否',
            '是' if has_adv else '否',
            _diary_export_text_cell(normalize_diary_text_field(d.symptoms)),
            _diary_export_text_cell(sym['symptom_severity']),
            _diary_export_text_cell(sym['symptom_onset']),
            _diary_export_text_cell(sym['symptom_duration']),
        ])
    resp = HttpResponse(buf.getvalue().encode('utf-8-sig'), content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = 'attachment; filename="diary_entries.csv"'
    return resp


@router.get('/progress', summary='应填进度（按配置周期与受试者）')
@require_permission('subject.subject.read')
def diary_progress(
    request,
    project_id: int = Query(...),
    subject_ids: str = Query(..., description='逗号分隔受试者 ID，如 1,2,3'),
):
    """
    根据项目下最新一条日记配置的 rule_json.diary_period，计算每名受试者在区间内的已填/缺失日。
    """
    proj = _ensure_project_exists(project_id)
    if not proj:
        return 404, {'code': 404, 'msg': '项目不存在', 'data': None}
    cfg = (
        SubjectDiaryConfig.objects.filter(project_id=project_id)
        .order_by('-id')
        .first()
    )
    if not cfg:
        return 404, {'code': 404, 'msg': '该项目暂无日记配置', 'data': None}
    rule = cfg.rule_json or {}
    period = rule.get('diary_period') or {}
    start = _parse_date(period.get('start', '') or '')
    end = _parse_date(period.get('end', '') or '')
    if not start or not end or end < start:
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'config_id': cfg.id,
                'project_id': project_id,
                'expected_days_total': 0,
                'subjects': [],
                'hint': '请在配置中的 rule_json.diary_period 填写 start/end（YYYY-MM-DD）',
            },
        }
    all_days = _daterange_inclusive(start, end)
    expected = len(all_days)
    day_set = set(all_days)

    ids_raw = [x.strip() for x in subject_ids.split(',') if x.strip()]
    try:
        sid_list = [int(x) for x in ids_raw]
    except ValueError:
        return 400, {'code': 400, 'msg': 'subject_ids 格式无效', 'data': None}

    subjects_out = []
    for sid in sid_list:
        sub = Subject.objects.filter(id=sid).first()
        filled_dates = set(
            SubjectDiary.objects.filter(
                subject_id=sid,
                is_deleted=False,
                entry_date__gte=start,
                entry_date__lte=end,
            ).values_list('entry_date', flat=True)
        )
        filled_in_window = len(filled_dates & day_set)
        missing = sorted(day_set - filled_dates)
        subjects_out.append({
            'subject_id': sid,
            'subject_no': sub.subject_no if sub else '',
            'subject_name': sub.name if sub else '',
            'expected_days': expected,
            'filled_days': filled_in_window,
            'completion_rate': round(filled_in_window / expected, 4) if expected else 0,
            'missing_dates': [d.isoformat() for d in missing[:60]],
            'missing_count': len(missing),
        })

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'config_id': cfg.id,
            'project_id': project_id,
            'period_start': start.isoformat(),
            'period_end': end.isoformat(),
            'expected_days_total': expected,
            'subjects': subjects_out,
        },
    }
