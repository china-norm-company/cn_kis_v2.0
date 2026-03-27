"""
审计日志服务

提供统一的审计记录接口，所有业务模块通过此服务记录操作日志。
"""
from .models import AuditLog, AuditAction


def log_audit(
    account_id: int,
    account_name: str,
    action: str,
    resource_type: str,
    resource_id: str,
    resource_name: str = '',
    description: str = '',
    old_value: dict = None,
    new_value: dict = None,
    changed_fields: list = None,
    ip_address: str = '',
    user_agent: str = '',
    request_id: str = '',
    project_id: int = None,
    account_type: str = '',
) -> AuditLog:
    """记录一条审计日志"""
    return AuditLog.objects.create(
        account_id=account_id,
        account_name=account_name,
        account_type=account_type,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        resource_name=resource_name,
        description=description,
        old_value=old_value,
        new_value=new_value,
        changed_fields=changed_fields,
        ip_address=ip_address or None,
        user_agent=user_agent,
        request_id=request_id,
        project_id=project_id,
    )


def log_create(account_id: int, account_name: str, resource_type: str, resource_id, resource_name: str = '', new_value: dict = None, **kwargs):
    return log_audit(account_id, account_name, AuditAction.CREATE, resource_type, resource_id, resource_name, new_value=new_value, **kwargs)


def log_update(account_id: int, account_name: str, resource_type: str, resource_id, old_value: dict = None, new_value: dict = None, changed_fields: list = None, **kwargs):
    return log_audit(account_id, account_name, AuditAction.UPDATE, resource_type, resource_id, old_value=old_value, new_value=new_value, changed_fields=changed_fields, **kwargs)


def log_delete(account_id: int, account_name: str, resource_type: str, resource_id, old_value: dict = None, **kwargs):
    return log_audit(account_id, account_name, AuditAction.DELETE, resource_type, resource_id, old_value=old_value, **kwargs)


def query_audit_logs(
    resource_type: str = None,
    resource_id: str = None,
    account_id: int = None,
    account_name: str = None,
    action: str = None,
    project_id: int = None,
    start_time=None,
    end_time=None,
    page: int = 1,
    page_size: int = 20,
):
    """查询审计日志"""
    qs = AuditLog.objects.all()
    if resource_type:
        qs = qs.filter(resource_type__icontains=resource_type)
    if resource_id:
        qs = qs.filter(resource_id=str(resource_id))
    if account_id:
        qs = qs.filter(account_id=account_id)
    if account_name:
        qs = qs.filter(account_name__icontains=account_name)
    if action:
        qs = qs.filter(action=action)
    if project_id:
        qs = qs.filter(project_id=project_id)
    if start_time:
        if isinstance(start_time, str) and len(start_time) <= 10:
            start_time = f"{start_time}T00:00:00"
        qs = qs.filter(create_time__gte=start_time)
    if end_time:
        if isinstance(end_time, str) and len(end_time) <= 10:
            end_time = f"{end_time}T23:59:59"
        qs = qs.filter(create_time__lte=end_time)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}
