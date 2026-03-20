"""
项目全链路 API

与 KIS 项目管理接口对齐：
- GET  /projects/                      项目列表（分页、关键词、状态）
- GET  /projects/{id}                 项目详情
- PUT  /projects/{id}                 更新项目
- GET  /projects/{project_id}/protocols  方案列表
- GET  /projects/protocols/{id}       方案详情（含 parsed_data）
- POST /projects/{project_id}/protocols  上传文件创建方案
- PUT  /projects/protocols/{id}       更新方案（含解析结果）
- DELETE /projects/protocols/{id}     删除方案（软删除）
- POST /projects/protocol-extract     AI 解析代理（后端直连解析服务，避免前端 401）

DEBUG 下：任意已登录用户可访问读接口，便于本地查看种子数据。
"""
import logging
from urllib.parse import quote

import requests
from functools import wraps
from ninja import Router, Schema, Query, File, Form
from ninja.files import UploadedFile
from typing import Optional, Any, Callable
from datetime import date, datetime
import os
from django.conf import settings
from django.http import HttpRequest, JsonResponse, FileResponse, Http404, HttpResponse

from . import services
from .models import Project, ProjectProtocol
from apps.identity.decorators import _get_account_from_request, _is_dev_test_account, require_any_permission, require_permission
from apps.identity.authz import get_authz_service

router = Router()


def _require_project_full_link_read(view_func: Callable) -> Callable:
    """读接口：DEBUG 下任意已登录用户可访问，否则需 protocol.protocol.read"""
    @wraps(view_func)
    def wrapper(request: HttpRequest, *args, **kwargs):
        account = _get_account_from_request(request)
        if not account:
            return JsonResponse(
                {'code': 401, 'msg': '请先登录', 'data': {'error_code': 'AUTH_REQUIRED'}},
                status=401,
            )
        if getattr(settings, 'DEBUG', False):
            return view_func(request, *args, **kwargs)
        # 非 DEBUG：走权限校验
        authz = get_authz_service()
        if not authz.has_permission(account, 'protocol.protocol.read', project_id=None):
            return JsonResponse(
                {'code': 403, 'msg': '缺少权限: protocol.protocol.read', 'data': {'required_permission': 'protocol.protocol.read'}},
                status=403,
            )
        return view_func(request, *args, **kwargs)
    return wrapper


# ============================================================================
# 序列化
# ============================================================================
def _date_iso(d):
    return d.isoformat() if d else None


def _dt_iso(dt):
    return dt.isoformat() if dt else None


def _project_to_dict(p: Project) -> dict:
    return {
        'id': p.id,
        'opportunity_no': p.opportunity_no or '',
        'inquiry_no': p.inquiry_no,
        'project_no': p.project_no,
        'project_name': p.project_name,
        'business_type': p.business_type or '',
        'sponsor_no': p.sponsor_no,
        'sponsor_name': p.sponsor_name,
        'research_institution': p.research_institution,
        'principal_investigator': p.principal_investigator,
        'priority': p.priority,
        'execution_status': p.execution_status,
        'schedule_status': p.schedule_status,
        'total_samples': p.total_samples,
        'expected_start_date': _date_iso(p.expected_start_date),
        'expected_end_date': _date_iso(p.expected_end_date),
        'actual_start_date': _date_iso(p.actual_start_date),
        'actual_end_date': _date_iso(p.actual_end_date),
        'recruitment_start_date': _date_iso(p.recruitment_start_date),
        'test_start_date': _date_iso(p.test_start_date),
        'test_end_date': _date_iso(p.test_end_date),
        'report_deadline': _date_iso(p.report_deadline),
        'description': p.description,
        'remark': p.remark,
        'created_by': p.created_by,
        'updated_by': p.updated_by,
        'created_at': _dt_iso(p.created_at),
        'updated_at': _dt_iso(p.updated_at),
    }


def _protocol_to_dict(p: ProjectProtocol, project_id: Optional[int] = None) -> dict:
    out = {
        'id': p.id,
        'project_id': project_id or p.project_id,
        'protocol_no': p.protocol_no,
        'protocol_name': p.protocol_name,
        'protocol_version': p.protocol_version,
        'description': p.description,
        'file_id': p.file_id,
        'file_name': None,
        'file_url': None,
        'parsed_data': p.parsed_data,
        'parse_error': p.parse_error,
        'parse_progress': getattr(p, 'parse_progress', None),
        'parse_logs': getattr(p, 'parse_logs', None) or [],
        'created_by': p.created_by,
        'updated_by': p.updated_by,
        'created_at': _dt_iso(p.created_at),
        'updated_at': _dt_iso(p.updated_at),
    }
    return out


# ============================================================================
# Schema
# ============================================================================
class ProjectListQuery(Schema):
    keyword: Optional[str] = None
    execution_status: Optional[str] = None
    page: int = 1
    pageSize: int = 20


class ProjectUpdateIn(Schema):
    project_name: Optional[str] = None
    business_type: Optional[str] = None
    sponsor_no: Optional[str] = None
    sponsor_name: Optional[str] = None
    research_institution: Optional[str] = None
    principal_investigator: Optional[str] = None
    priority: Optional[str] = None
    execution_status: Optional[str] = None
    schedule_status: Optional[str] = None
    total_samples: Optional[int] = None
    expected_start_date: Optional[str] = None
    expected_end_date: Optional[str] = None
    actual_start_date: Optional[str] = None
    actual_end_date: Optional[str] = None
    recruitment_start_date: Optional[str] = None
    test_start_date: Optional[str] = None
    test_end_date: Optional[str] = None
    report_deadline: Optional[str] = None
    description: Optional[str] = None
    remark: Optional[str] = None


class ProtocolListQuery(Schema):
    page: int = 1
    pageSize: int = 20
    keyword: Optional[str] = None


class ProtocolUpdateIn(Schema):
    protocol_name: Optional[str] = None
    protocol_version: Optional[str] = None
    description: Optional[str] = None
    parsed_data: Optional[dict] = None
    parse_error: Optional[str] = None
    parse_progress: Optional[dict] = None
    parse_logs: Optional[list] = None


# ============================================================================
# 项目
# ============================================================================
@router.get('', summary='项目列表')
@_require_project_full_link_read
def list_projects(request, params: ProjectListQuery = Query(...)):
    """分页获取项目列表，支持关键词与执行状态筛选"""
    result = services.list_projects(
        keyword=params.keyword,
        execution_status=params.execution_status,
        page=params.page,
        page_size=params.pageSize,
    )
    # 调试：runserver 终端会打印，便于确认是否与 seed 同库
    print(f'[project_full_link] list_projects: total={result["total"]} db={settings.DATABASES["default"].get("NAME")}', flush=True)
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'list': [_project_to_dict(p) for p in result['list']],
            'total': result['total'],
            'page': result['page'],
            'pageSize': result['pageSize'],
            'executionStatusCounts': result['executionStatusCounts'],
            'scheduleStatusCounts': result['scheduleStatusCounts'],
        },
    }


# 方案按 id 的路由必须放在 /{project_id} 之前，否则 /projects/protocols/1 会被当作 project_id
@router.get('/protocols/{protocol_id}', summary='方案详情')
@_require_project_full_link_read
def get_protocol(request, protocol_id: int):
    """获取方案详情（含 parsed_data）"""
    protocol = services.get_protocol(protocol_id)
    if not protocol:
        return 404, {'code': 404, 'msg': '方案不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _protocol_to_dict(protocol, protocol.project_id)}


@router.get('/protocols/{protocol_id}/download', summary='方案文件下载')
@_require_project_full_link_read
def download_protocol_file(request, protocol_id: int):
    """按方案 ID 下载方案文件（使用 file_path 本地存储），与 KIS 单独解析时取文件行为一致"""
    protocol = services.get_protocol(protocol_id)
    if not protocol:
        raise Http404('方案不存在')
    file_path = (protocol.file_path or '').strip() if protocol.file_path else ''
    if not file_path:
        raise Http404('方案未关联文件')
    media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    full_path = os.path.normpath(os.path.abspath(os.path.join(media_root, file_path)))
    media_root_abs = os.path.abspath(media_root)
    if not full_path.startswith(media_root_abs):
        raise Http404('非法路径')
    if not os.path.isfile(full_path):
        raise Http404('文件不存在')
    filename = os.path.basename(full_path) or (protocol.protocol_name or 'protocol.pdf')
    return FileResponse(open(full_path, 'rb'), as_attachment=True, filename=filename)


def _check_protocol_update_permission(request: HttpRequest, protocol: ProjectProtocol):
    """校验当前用户对方案所属项目是否有写权限（与创建方案接口策略一致）。未登录返回 401，无权限返回 403。"""
    _required_perms = ['protocol.protocol.update', 'protocol.protocol.create', 'protocol.protocol.read']
    account = _get_account_from_request(request)
    if not account:
        return JsonResponse(
            {'code': 401, 'msg': '请先登录', 'data': {'error_code': 'AUTH_REQUIRED'}},
            status=401,
        )
    if getattr(settings, 'DEBUG', False):
        return None
    if _is_dev_test_account(account):
        return None
    authz = get_authz_service()
    pid = getattr(protocol, 'project_id', None)
    if authz.has_any_permission(account, _required_perms, project_id=pid):
        return None
    auth_logger = logging.getLogger('cn_kis.auth')
    if getattr(settings, 'AUTH_TRACE_ENABLED', False):
        auth_logger.warning(
            'permission_denied '
            f'request_id={getattr(request, "request_id", "-")} '
            f'user_id={account.id} username={account.username} '
            f'permission=protocol.protocol.update project_id={pid} '
            f'method={request.method} path={request.path}'
        )
    return JsonResponse(
        {'code': 403, 'msg': '缺少权限: protocol.protocol.update', 'data': {'required_permission': 'protocol.protocol.update', 'project_id': pid}},
        status=403,
    )


@router.put('/protocols/{protocol_id}', summary='更新方案')
def update_protocol(request, protocol_id: int, data: ProtocolUpdateIn):
    """更新方案（含 AI 解析回写 parsed_data/parse_progress/parse_logs）"""
    protocol = services.get_protocol(protocol_id)
    if not protocol:
        return 404, {'code': 404, 'msg': '方案不存在'}
    err = _check_protocol_update_permission(request, protocol)
    if err is not None:
        return err
    account = _get_account_from_request(request)
    account_id = getattr(account, 'id', None) if account else None
    payload = data.dict(exclude_none=True)
    protocol = services.update_protocol(protocol_id, account_id, **payload)
    if not protocol:
        return 404, {'code': 404, 'msg': '方案不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _protocol_to_dict(protocol, protocol.project_id)}


@router.delete('/protocols/{protocol_id}', summary='删除方案')
def delete_protocol(request, protocol_id: int):
    """软删除方案（按方案所属项目校验 protocol.protocol.update 权限）"""
    protocol = services.get_protocol(protocol_id)
    if not protocol:
        return 404, {'code': 404, 'msg': '方案不存在'}
    err = _check_protocol_update_permission(request, protocol)
    if err is not None:
        return err
    if not services.delete_protocol(protocol_id):
        return 404, {'code': 404, 'msg': '方案不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# AI 解析代理：后端直连 ProtocolExtractV2 服务，避免前端静态部署时直连导致 401
@router.post('/protocol-extract', summary='AI 解析代理')
@_require_project_full_link_read
def protocol_extract_proxy(request, file: UploadedFile = File(...), subagent: str = Query(...)):
    """接收方案文件与 subagent，转发到配置的 ProtocolExtractV2 服务并原样返回响应（含状态码与 body）。"""
    import time as _time
    logger = logging.getLogger('cn_kis.api')
    base_url = (getattr(settings, 'PROTOCOL_EXTRACT_V2_BASE_URL', '') or '').strip()
    token = (getattr(settings, 'PROTOCOL_EXTRACT_V2_TOKEN', '') or '').strip()
    if not base_url or not token:
        logger.error('protocol_extract_proxy: PROTOCOL_EXTRACT_V2_BASE_URL 或 TOKEN 未配置')
        return JsonResponse(
            {'code': 500, 'msg': '未配置 PROTOCOL_EXTRACT_V2_BASE_URL 或 PROTOCOL_EXTRACT_V2_TOKEN'},
            status=500,
        )
    extract_path = '/ProtocolExtractV2/api/v1/protocol-extract-v2/extract'
    url = f'{base_url.rstrip("/")}{extract_path}?subagent={quote(subagent, safe="")}'
    headers = {'Authorization': token if token.lower().startswith('bearer ') else f'Bearer {token}'}
    try:
        file_content = file.read()
        file_size = len(file_content)
        files = {'file': (file.name or 'file', file_content, file.content_type or 'application/octet-stream')}
        logger.info(
            'protocol_extract_proxy: subagent=%s file=%s size=%d url=%s — 开始转发请求',
            subagent, file.name, file_size, url,
        )
        session = requests.Session()
        session.trust_env = False
        t0 = _time.monotonic()
        resp = session.post(url, files=files, headers=headers, timeout=(15, 180))
        elapsed = round((_time.monotonic() - t0) * 1000)
        logger.info(
            'protocol_extract_proxy: subagent=%s status=%d elapsed_ms=%d content_length=%d',
            subagent, resp.status_code, elapsed, len(resp.content),
        )
    except requests.ConnectionError as e:
        logger.exception('protocol_extract_proxy connect failed (subagent=%s): %s', subagent, e)
        return JsonResponse(
            {'code': 502, 'msg': f'无法连接解析服务（请检查 PROTOCOL_EXTRACT_V2_BASE_URL 配置及网络）: {e!s}'},
            status=502,
        )
    except requests.Timeout as e:
        logger.error('protocol_extract_proxy timeout (subagent=%s): %s', subagent, e)
        return JsonResponse(
            {'code': 504, 'msg': f'解析服务响应超时（subagent={subagent}），请稍后重试或检查服务状态: {e!s}'},
            status=504,
        )
    except requests.RequestException as e:
        logger.exception('protocol_extract_proxy request failed (subagent=%s): %s', subagent, e)
        return JsonResponse(
            {'code': 502, 'msg': f'解析服务请求失败: {e!s}'},
            status=502,
        )
    body = resp.content
    content_type = resp.headers.get('Content-Type') or 'application/json'
    return HttpResponse(body, status=resp.status_code, content_type=content_type)


@router.get('/{project_id}', summary='项目详情')
@_require_project_full_link_read
def get_project(request, project_id: int):
    """获取项目详情"""
    project = services.get_project(project_id)
    if not project:
        return 404, {'code': 404, 'msg': '项目不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _project_to_dict(project)}


@router.put('/{project_id}', summary='更新项目')
@require_permission('protocol.protocol.update')
def update_project(request, project_id: int, data: ProjectUpdateIn):
    """更新项目基本信息"""
    account = _get_account_from_request(request)
    account_id = getattr(account, 'id', None) if account else None
    payload = data.dict(exclude_none=True)
    for date_field in (
        'expected_start_date', 'expected_end_date', 'actual_start_date', 'actual_end_date',
        'recruitment_start_date', 'test_start_date', 'test_end_date', 'report_deadline',
    ):
        if date_field in payload and payload[date_field]:
            from datetime import datetime as dt
            try:
                payload[date_field] = dt.strptime(payload[date_field], '%Y-%m-%d').date()
            except Exception:
                pass
        elif date_field in payload:
            payload[date_field] = None
    project = services.update_project(project_id, account_id, **payload)
    if not project:
        return 404, {'code': 404, 'msg': '项目不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _project_to_dict(project)}


@router.get('/{project_id}/protocols', summary='项目方案列表')
@_require_project_full_link_read
def list_protocols(request, project_id: int, params: ProtocolListQuery = Query(...)):
    """分页获取项目下方案列表"""
    result = services.list_protocols(
        project_id=project_id,
        page=params.page,
        page_size=params.pageSize,
        keyword=params.keyword,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'list': [_protocol_to_dict(p, project_id) for p in result['list']],
            'total': result['total'],
            'page': result['page'],
            'pageSize': result['pageSize'],
        },
    }


@router.post('/{project_id}/protocols', summary='上传方案')
@require_any_permission(
    ['protocol.protocol.create', 'protocol.protocol.read'],
    project_param='project_id',
)
def create_protocol(
    request,
    project_id: int,
    file: UploadedFile = File(...),
    protocol_name: Optional[str] = Form(None),
    protocol_version: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
):
    """上传文件创建方案"""
    account = _get_account_from_request(request)
    account_id = getattr(account, 'id', None) if account else None
    if not services.get_project(project_id):
        return 404, {'code': 404, 'msg': '项目不存在'}
    file_path = services.save_uploaded_file(file, project_id)
    protocol = services.create_protocol(
        project_id=project_id,
        protocol_name=protocol_name or (file.name or '未命名方案'),
        protocol_version=protocol_version,
        description=description,
        file_path=file_path,
        created_by=account_id,
    )
    if not protocol:
        return 400, {'code': 400, 'msg': '创建方案失败'}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': protocol.id,
            'protocol_no': protocol.protocol_no,
            'protocol_name': protocol.protocol_name,
            'created_at': _dt_iso(protocol.created_at),
        },
    }
