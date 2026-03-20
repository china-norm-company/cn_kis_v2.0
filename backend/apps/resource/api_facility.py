"""
设施环境管理 API

路由前缀：/api/v1/facility/
覆盖约 22 个端点：仪表盘、场地管理、预约管理、环境监控、不合规事件、清洁记录
"""
from ninja import Router, Schema, File
from ninja.files import UploadedFile
from typing import Optional
from datetime import date

from django.http import HttpResponse

from apps.identity.decorators import require_permission, _get_account_from_request
from . import services_facility as svc

router = Router()


# ============================================================================
# Schema 定义
# ============================================================================

class VenueCreateIn(Schema):
    name: str
    code: str
    center: Optional[str] = ''
    area: Optional[float] = 0
    venue_type: Optional[str] = ''
    env_requirements: Optional[str] = ''
    status: Optional[str] = 'active'
    floor: Optional[str] = ''
    building: Optional[str] = ''
    capacity: Optional[int] = 0
    control_level: Optional[str] = 'basic'
    target_temp: Optional[float] = 22
    temp_tolerance: Optional[float] = 2
    target_humidity: Optional[float] = 50
    humidity_tolerance: Optional[float] = 10
    description: Optional[str] = ''


class VenueChangeIn(Schema):
    """场地信息变更（场地编号不可变更）"""
    venue_id: int
    name: Optional[str] = None
    center: Optional[str] = None
    area: Optional[float] = None
    venue_type: Optional[str] = None
    env_requirements: Optional[str] = None
    status: Optional[str] = None
    floor: Optional[str] = None
    building: Optional[str] = None
    capacity: Optional[int] = None
    description: Optional[str] = None
    target_temp: Optional[float] = None
    temp_tolerance: Optional[float] = None
    target_humidity: Optional[float] = None
    humidity_tolerance: Optional[float] = None
    control_level: Optional[str] = None


class ReservationCreateIn(Schema):
    venue_id: int
    start_time: str
    end_time: str
    purpose: Optional[str] = ''
    project_name: Optional[str] = ''


class EnvironmentLogCreateIn(Schema):
    venue_id: int
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    airflow: Optional[float] = None
    illuminance: Optional[float] = None
    recorder_name: Optional[str] = ''


class IncidentCreateIn(Schema):
    title: str
    venue_id: int
    severity: Optional[str] = 'minor'
    description: Optional[str] = ''
    deviation_param: Optional[str] = ''


class IncidentUpdateIn(Schema):
    status: Optional[str] = None
    root_cause: Optional[str] = None
    corrective_action: Optional[str] = None
    preventive_action: Optional[str] = None
    assigned_to_name: Optional[str] = None


class CleaningCreateIn(Schema):
    venue_id: int
    cleaning_type: Optional[str] = 'daily'
    cleaner_name: Optional[str] = ''
    cleaning_agents: Optional[str] = ''


class CleaningUpdateIn(Schema):
    status: Optional[str] = None
    verifier_name: Optional[str] = None
    env_confirmed: Optional[bool] = None


class VenueUsageScheduleCreateIn(Schema):
    venue_id: int
    schedule_type: str = 'recurring'  # recurring | specific
    days_of_week: Optional[list] = None  # [0,1,2,3,4] 周一到周五, [0-6] 每天
    specific_date: Optional[str] = None  # YYYY-MM-DD 当 schedule_type=specific
    start_time: str = '08:00'
    end_time: str = '18:00'
    is_enabled: bool = True


class VenueUsageScheduleUpdateIn(Schema):
    schedule_type: Optional[str] = None
    days_of_week: Optional[list] = None
    specific_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    is_enabled: Optional[bool] = None


class VenueMonitorAddIn(Schema):
    venue_id: int
    monitor_account_id: int
    is_primary: bool = False


# ============================================================================
# 仪表盘
# ============================================================================

@router.get('/dashboard', summary='设施全景统计')
@require_permission('resource.venue.read')
def facility_dashboard(request):
    data = svc.get_dashboard()
    return {'code': 0, 'msg': 'ok', 'data': data}


# ============================================================================
# 场地管理
# ============================================================================

@router.get('/venues', summary='场地列表')
@require_permission('resource.venue.read')
def list_venues(request, keyword: str = '', venue_type: str = '', status: str = '',
                page: int = 1, page_size: int = 20):
    data = svc.list_venues(keyword=keyword, venue_type=venue_type, status=status,
                           page=page, page_size=page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/venues/stats', summary='场地统计')
@require_permission('resource.venue.read')
def venue_stats(request):
    data = svc.get_venue_stats()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/venues/import/template', summary='下载场地导入模板')
@require_permission('resource.venue.read')
def download_venue_import_template(request, format: str = 'xlsx'):
    """返回场地导入模板，支持 xlsx 或 csv"""
    from .services.venue_import_service import build_template_excel, build_template_csv
    if format == 'csv':
        content = build_template_csv()
        resp = HttpResponse(content, content_type='text/csv; charset=utf-8')
        resp['Content-Disposition'] = 'attachment; filename="venue_import_template.csv"'
    else:
        content = build_template_excel()
        resp = HttpResponse(
            content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = 'attachment; filename="venue_import_template.xlsx"'
    return resp


@router.post('/venues/import', summary='批量导入场地')
@require_permission('resource.venue.write')
def import_venues(request, file: File[UploadedFile] = File(...)):
    """从 CSV 或 Excel 批量导入场地"""
    import logging
    logger = logging.getLogger(__name__)
    try:
        from .services.venue_import_service import parse_and_import
        name_lower = (file.name or '').lower()
        if not any(name_lower.endswith(ext) for ext in ('.csv', '.xlsx')):
            return {'code': 400, 'msg': '仅支持 .csv、.xlsx 文件', 'data': None}
        content = file.read()
        if not content:
            return {'code': 400, 'msg': '文件为空，请选择有效的 CSV 或 Excel 文件', 'data': None}
        result = parse_and_import(content, file.name or '')
        if result['total'] == 0 and not result['errors']:
            return {
                'code': 400,
                'msg': '未能识别到有效数据。请确保表头包含「场地名称」「场地编码」等列，且数据从第2行开始',
                'data': result,
            }
        return {'code': 0, 'msg': '导入完成', 'data': result}
    except Exception as e:
        logger.exception('venue import failed')
        return {'code': 500, 'msg': f'导入失败: {str(e)}', 'data': None}


@router.post('/venues/change', summary='场地信息变更')
@require_permission('resource.venue.write')
def change_venue(request, data: VenueChangeIn):
    """变更场地信息并记录变更历史，场地编号不可变更"""
    account = _get_account_from_request(request)
    payload = data.dict(exclude_unset=True)
    venue_id = payload.pop('venue_id')
    changed_by_name = (account.display_name or account.username) if account else ''
    result = svc.change_venue(venue_id, payload, changed_by_id=account.id if account else None, changed_by_name=changed_by_name)
    return {'code': 0, 'msg': '变更已生效', 'data': result}


@router.get('/venues/change-logs', summary='场地变更历史')
@require_permission('resource.venue.read')
def list_venue_change_logs(request, venue_id: int = None, page: int = 1, page_size: int = 20):
    """场地信息变更历史记录"""
    data = svc.list_venue_change_logs(venue_id=venue_id, page=page, page_size=page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/venues/{venue_id}', summary='场地详情')
@require_permission('resource.venue.read')
def venue_detail(request, venue_id: int):
    data = svc.get_venue_detail(venue_id)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/venues/create', summary='新增场地')
@require_permission('resource.venue.write')
def create_venue(request, data: VenueCreateIn):
    result = svc.create_venue(data.dict())
    return {'code': 0, 'msg': '场地创建成功', 'data': result}


@router.put('/venues/{venue_id}', summary='更新场地')
@require_permission('resource.venue.write')
def update_venue(request, venue_id: int, data: VenueCreateIn):
    result = svc.update_venue(venue_id, data.dict(exclude_unset=True))
    return {'code': 0, 'msg': '更新成功', 'data': result}


# ============================================================================
# 预约管理
# ============================================================================

@router.get('/reservations', summary='预约列表')
@require_permission('resource.venue.read')
def list_reservations(request, status: str = '', venue_id: int = None,
                      page: int = 1, page_size: int = 20):
    data = svc.list_reservations(status=status, venue_id=venue_id, page=page, page_size=page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/reservations/stats', summary='预约统计')
@require_permission('resource.venue.read')
def reservation_stats(request):
    data = svc.get_reservation_stats()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/reservations/calendar', summary='日历视图数据')
@require_permission('resource.venue.read')
def reservation_calendar(request):
    data = svc.get_calendar()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/reservations/create', summary='新建预约')
@require_permission('resource.venue.write')
def create_reservation(request, data: ReservationCreateIn):
    account = _get_account_from_request(request)
    result = svc.create_reservation(data.dict(), account=account)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '预约创建成功', 'data': result}


@router.put('/reservations/{reservation_id}/confirm', summary='确认预约')
@require_permission('resource.venue.write')
def confirm_reservation(request, reservation_id: int):
    result = svc.confirm_reservation(reservation_id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '预约已确认', 'data': result}


@router.put('/reservations/{reservation_id}/cancel', summary='取消预约')
@require_permission('resource.venue.write')
def cancel_reservation(request, reservation_id: int):
    result = svc.cancel_reservation(reservation_id)
    return {'code': 0, 'msg': '预约已取消', 'data': result}


# ============================================================================
# 环境监控
# ============================================================================

@router.get('/environment/current', summary='各场地最新环境数据')
@require_permission('resource.environment.read')
def current_environment(request):
    data = svc.get_current_environment()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/environment/logs', summary='环境记录列表')
@require_permission('resource.environment.read')
def list_environment_logs(request, venue_id: int = None, is_compliant: str = '',
                          page: int = 1, page_size: int = 50):
    compliant = None
    if is_compliant == 'true':
        compliant = True
    elif is_compliant == 'false':
        compliant = False
    data = svc.list_environment_logs(venue_id=venue_id, is_compliant=compliant,
                                     page=page, page_size=page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/environment/compliance', summary='合规率统计')
@require_permission('resource.environment.read')
def compliance_stats(request):
    data = svc.get_compliance_stats()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/environment/logs/create', summary='新增环境记录')
@require_permission('resource.environment.write')
def create_environment_log(request, data: EnvironmentLogCreateIn):
    account = _get_account_from_request(request)
    result = svc.create_environment_log(data.dict(), account=account)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '记录已创建', 'data': result}


# ============================================================================
# 房间使用时段
# ============================================================================

@router.get('/venue-usage-schedules', summary='房间使用时段列表')
@require_permission('resource.environment.read')
def list_venue_usage_schedules(request, venue_id: int = None):
    data = svc.list_venue_usage_schedules(venue_id=venue_id)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/venue-usage-schedules/create', summary='新增使用时段')
@require_permission('resource.environment.write')
def create_venue_usage_schedule(request, data: VenueUsageScheduleCreateIn):
    result = svc.create_venue_usage_schedule(data.dict())
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '已添加', 'data': result}


@router.put('/venue-usage-schedules/{schedule_id}', summary='更新使用时段')
@require_permission('resource.environment.write')
def update_venue_usage_schedule(request, schedule_id: int, data: VenueUsageScheduleUpdateIn):
    result = svc.update_venue_usage_schedule(schedule_id, data.dict(exclude_unset=True))
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '已更新', 'data': result}


@router.delete('/venue-usage-schedules/{schedule_id}', summary='删除使用时段')
@require_permission('resource.environment.write')
def delete_venue_usage_schedule(request, schedule_id: int):
    result = svc.delete_venue_usage_schedule(schedule_id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '已删除', 'data': result}


# ============================================================================
# 场地监控人
# ============================================================================

@router.get('/venue-monitors', summary='场地监控人列表')
@require_permission('resource.environment.read')
def list_venue_monitors(request, venue_id: int = None):
    data = svc.list_venue_monitors(venue_id=venue_id)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/venue-monitors/add', summary='添加监控人')
@require_permission('resource.environment.write')
def add_venue_monitor(request, data: VenueMonitorAddIn):
    result = svc.add_venue_monitor(data.dict())
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '已添加', 'data': result}


@router.delete('/venue-monitors/{monitor_id}', summary='移除监控人')
@require_permission('resource.environment.write')
def remove_venue_monitor(request, monitor_id: int):
    result = svc.remove_venue_monitor(monitor_id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '已移除', 'data': result}


@router.put('/venue-monitors/{monitor_id}/set-primary', summary='设为主监控人')
@require_permission('resource.environment.write')
def set_venue_primary_monitor(request, monitor_id: int):
    result = svc.set_venue_primary_monitor(monitor_id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '已设置', 'data': result}


@router.get('/accounts/for-monitor', summary='监控人选择器账号列表')
@require_permission('resource.environment.write')
def list_accounts_for_monitor(request, keyword: str = '', page: int = 1, page_size: int = 50):
    data = svc.list_accounts_for_monitor(keyword=keyword, page=page, page_size=page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


# ============================================================================
# 不合规事件
# ============================================================================

@router.get('/incidents', summary='事件列表')
@require_permission('resource.environment.read')
def list_incidents(request, severity: str = '', status: str = '',
                   page: int = 1, page_size: int = 20):
    data = svc.list_incidents(severity=severity, status=status, page=page, page_size=page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/incidents/stats', summary='事件统计')
@require_permission('resource.environment.read')
def incident_stats(request):
    data = svc.get_incident_stats()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/incidents/{incident_id}', summary='事件详情')
@require_permission('resource.environment.read')
def incident_detail(request, incident_id: int):
    data = svc.get_incident_detail(incident_id)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/incidents/create', summary='创建事件')
@require_permission('resource.environment.write')
def create_incident(request, data: IncidentCreateIn):
    account = _get_account_from_request(request)
    result = svc.create_incident(data.dict(), account=account)
    return {'code': 0, 'msg': '事件已创建', 'data': result}


@router.put('/incidents/{incident_id}/update', summary='更新事件状态')
@require_permission('resource.environment.write')
def update_incident(request, incident_id: int, data: IncidentUpdateIn):
    result = svc.update_incident(incident_id, data.dict(exclude_unset=True))
    return {'code': 0, 'msg': '更新成功', 'data': result}


# ============================================================================
# 清洁记录
# ============================================================================

@router.get('/cleaning', summary='清洁记录列表')
@require_permission('resource.venue.read')
def list_cleaning_records(request, cleaning_type: str = '', venue_id: int = None,
                          status: str = '', page: int = 1, page_size: int = 20):
    data = svc.list_cleaning_records(cleaning_type=cleaning_type, venue_id=venue_id,
                                     status=status, page=page, page_size=page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/cleaning/stats', summary='清洁统计')
@require_permission('resource.venue.read')
def cleaning_stats(request):
    data = svc.get_cleaning_stats()
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.post('/cleaning/create', summary='新增清洁记录')
@require_permission('resource.venue.write')
def create_cleaning_record(request, data: CleaningCreateIn):
    account = _get_account_from_request(request)
    result = svc.create_cleaning_record(data.dict(), account=account)
    return {'code': 0, 'msg': '清洁记录已创建', 'data': result}


@router.put('/cleaning/{cleaning_id}/update', summary='更新清洁记录')
@require_permission('resource.venue.write')
def update_cleaning_record(request, cleaning_id: int, data: CleaningUpdateIn):
    account = _get_account_from_request(request)
    result = svc.update_cleaning_record(cleaning_id, data.dict(exclude_unset=True), account=account)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '更新成功', 'data': result}
