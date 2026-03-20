"""
项目全链路服务层

提供项目与方案的 CRUD 及列表查询。
"""
from typing import Optional, Any
from django.db.models import Q, QuerySet
from django.core.files.uploadedfile import UploadedFile
import os
from django.conf import settings

from .models import Project, ProjectProtocol


def list_projects(
    keyword: Optional[str] = None,
    execution_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页获取项目列表"""
    qs = Project.objects.filter(is_delete=False).order_by('-created_at')
    if keyword:
        qs = qs.filter(
            Q(project_name__icontains=keyword)
            | Q(project_no__icontains=keyword)
            | Q(opportunity_no__icontains=keyword)
            | Q(sponsor_no__icontains=keyword)
            | Q(sponsor_name__icontains=keyword)
        )
    if execution_status:
        qs = qs.filter(execution_status=execution_status)

    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start : start + page_size])

    # 统计 execution_status 与 schedule_status（与 KIS 对齐）
    from django.db.models import Count
    status_qs = Project.objects.filter(is_delete=False)
    exec_counts = dict(status_qs.values('execution_status').annotate(c=Count('id')).values_list('execution_status', 'c'))
    sched_counts = dict(status_qs.values('schedule_status').annotate(c=Count('id')).values_list('schedule_status', 'c'))

    return {
        'list': items,
        'total': total,
        'page': page,
        'pageSize': page_size,
        'executionStatusCounts': {
            'all': total,
            'pending_execution': exec_counts.get('pending_execution', 0),
            'in_progress': exec_counts.get('in_progress', 0),
            'completed': exec_counts.get('completed', 0),
            'cancelled': exec_counts.get('cancelled', 0),
        },
        'scheduleStatusCounts': {
            'all': total,
            'pending_visit_plan': sched_counts.get('pending_visit_plan', 0),
            'pending_resource_review': sched_counts.get('pending_resource_review', 0),
            'resource_rejected': sched_counts.get('resource_rejected', 0),
            'pending_schedule': sched_counts.get('pending_schedule', 0),
            'pending_researcher_confirm': sched_counts.get('pending_researcher_confirm', 0),
            'pending_publish': sched_counts.get('pending_publish', 0),
            'published': sched_counts.get('published', 0),
            'cancelled': sched_counts.get('cancelled', 0),
        },
    }


def get_project(project_id: int) -> Optional[Project]:
    """获取单个项目"""
    return Project.objects.filter(id=project_id, is_delete=False).first()


def update_project(project_id: int, account_id: Optional[int], **kwargs) -> Optional[Project]:
    """更新项目"""
    project = get_project(project_id)
    if not project:
        return None
    for k, v in kwargs.items():
        if hasattr(project, k):
            setattr(project, k, v)
    if account_id is not None:
        project.updated_by = account_id
    project.save()
    return project


def list_protocols(project_id: int, page: int = 1, page_size: int = 20, keyword: Optional[str] = None) -> dict:
    """分页获取项目下的方案列表"""
    if not get_project(project_id):
        return {'list': [], 'total': 0, 'page': page, 'pageSize': page_size}
    qs = ProjectProtocol.objects.filter(project_id=project_id, is_delete=False).order_by('-created_at')
    if keyword:
        qs = qs.filter(
            Q(protocol_name__icontains=keyword) | Q(protocol_no__icontains=keyword)
        )
    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start : start + page_size])
    return {'list': items, 'total': total, 'page': page, 'pageSize': page_size}


def get_protocol(protocol_id: int) -> Optional[ProjectProtocol]:
    """获取单个方案（含 parsed_data）"""
    return ProjectProtocol.objects.filter(id=protocol_id, is_delete=False).select_related('project').first()


def create_protocol(
    project_id: int,
    protocol_name: str,
    protocol_version: Optional[str] = None,
    description: Optional[str] = None,
    file_path: Optional[str] = None,
    file_id: Optional[int] = None,
    created_by: Optional[int] = None,
) -> Optional[ProjectProtocol]:
    """创建方案（上传文件后调用，传入存储路径或 file_id）"""
    if not get_project(project_id):
        return None
    protocol = ProjectProtocol(
        project_id=project_id,
        protocol_name=protocol_name or '未命名方案',
        protocol_version=protocol_version or '',
        description=description or '',
        file_path=file_path,
        file_id=file_id,
        created_by=created_by,
    )
    protocol.save()
    return protocol


def save_uploaded_file(uploaded_file: UploadedFile, project_id: int, protocol_id: Optional[int] = None) -> str:
    """将上传文件保存到 MEDIA_ROOT/project_full_link/ 并返回相对路径"""
    base_dir = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    dest_dir = os.path.join(base_dir, 'project_full_link', str(project_id))
    os.makedirs(dest_dir, exist_ok=True)
    name = uploaded_file.name or 'upload'
    if protocol_id:
        name = f"p{protocol_id}_{name}"
    path = os.path.join(dest_dir, name)
    with open(path, 'wb') as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)
    # 返回相对 MEDIA_ROOT 的路径，便于后续下载
    return os.path.join('project_full_link', str(project_id), name)


def update_protocol(
    protocol_id: int,
    account_id: Optional[int] = None,
    protocol_name: Optional[str] = None,
    protocol_version: Optional[str] = None,
    description: Optional[str] = None,
    parsed_data: Optional[dict] = None,
    parse_error: Optional[str] = None,
    parse_progress: Optional[dict] = None,
    parse_logs: Optional[list] = None,
) -> Optional[ProjectProtocol]:
    """更新方案（含 AI 解析回写）"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None
    if protocol_name is not None:
        protocol.protocol_name = protocol_name
    if protocol_version is not None:
        protocol.protocol_version = protocol_version
    if description is not None:
        protocol.description = description
    if parsed_data is not None:
        protocol.parsed_data = parsed_data
    if parse_error is not None:
        protocol.parse_error = parse_error
    if parse_progress is not None:
        protocol.parse_progress = parse_progress
    if parse_logs is not None:
        protocol.parse_logs = parse_logs
    if account_id is not None:
        protocol.updated_by = account_id
    protocol.save()
    return protocol


def delete_protocol(protocol_id: int) -> bool:
    """软删除方案"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return False
    protocol.is_delete = True
    protocol.save()
    return True
