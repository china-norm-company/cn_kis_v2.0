"""
审计日志 API

端点：
- GET /audit/logs       查询审计日志
- GET /audit/logs/export 导出审计日志（JSON）
- GET /audit/logs/{id}  审计日志详情
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import datetime
from apps.identity.decorators import require_permission

router = Router()


def _log_to_dict(log, include_values=True):
    d = {
        'id': log.id,
        'account_id': log.account_id,
        'account_name': log.account_name,
        'action': log.action,
        'resource_type': log.resource_type,
        'resource_id': log.resource_id,
        'resource_name': log.resource_name,
        'description': log.description,
        'create_time': log.create_time.isoformat(),
    }
    if include_values:
        d['old_value'] = log.old_value
        d['new_value'] = log.new_value
        d['changed_fields'] = log.changed_fields
    return d


class AuditLogOut(Schema):
    id: int
    account_id: int
    account_name: str
    action: str
    resource_type: str
    resource_id: str
    resource_name: str
    description: str
    create_time: datetime


class AuditQueryParams(Schema):
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    account_id: Optional[int] = None
    account_name: Optional[str] = None
    action: Optional[str] = None
    project_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    page: int = 1
    page_size: int = 20


class AuditExportParams(Schema):
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    account_id: Optional[int] = None
    account_name: Optional[str] = None
    action: Optional[str] = None
    project_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


@router.get('/logs', summary='查询审计日志')
@require_permission('system.audit.read')
def list_audit_logs(request, params: AuditQueryParams = Query(...)):
    """分页查询审计日志（支持多条件筛选）"""
    from .services import query_audit_logs

    result = query_audit_logs(
        resource_type=params.resource_type,
        resource_id=params.resource_id,
        account_id=params.account_id,
        account_name=params.account_name,
        action=params.action,
        project_id=params.project_id,
        start_time=params.start_time,
        end_time=params.end_time,
        page=params.page,
        page_size=params.page_size,
    )

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_log_to_dict(log) for log in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/logs/export', summary='导出审计日志')
@require_permission('system.audit.read')
def export_audit_logs(request, params: AuditExportParams = Query(...)):
    """导出审计日志（使用与列表相同的筛选参数，返回结构化 JSON）"""
    from .services import export_audit_logs as export_svc

    items = export_svc(
        resource_type=params.resource_type,
        resource_id=params.resource_id,
        account_id=params.account_id,
        account_name=params.account_name,
        action=params.action,
        project_id=params.project_id,
        start_time=params.start_time,
        end_time=params.end_time,
    )

    rows = [_log_to_dict(log) for log in items]

    return {
        'code': 200,
        'msg': 'OK',
        'data': {'items': rows},
    }


@router.get('/logs/{log_id}', summary='审计日志详情')
@require_permission('system.audit.read')
def get_audit_log(request, log_id: int):
    """获取审计日志详情（包含变更前后值）"""
    from .models import AuditLog

    log = AuditLog.objects.filter(id=log_id).first()
    if not log:
        return 404, {'code': 404, 'msg': '日志不存在'}

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': log.id,
            'account_id': log.account_id,
            'account_name': log.account_name,
            'account_type': log.account_type,
            'action': log.action,
            'description': log.description,
            'resource_type': log.resource_type,
            'resource_id': log.resource_id,
            'resource_name': log.resource_name,
            'old_value': log.old_value,
            'new_value': log.new_value,
            'changed_fields': log.changed_fields,
            'ip_address': log.ip_address,
            'user_agent': log.user_agent,
            'request_id': log.request_id,
            'project_id': log.project_id,
            'create_time': log.create_time.isoformat(),
        },
    }
