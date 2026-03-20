"""
LIMS 集成 API

端点：
- GET  /lims/connections              连接列表
- POST /lims/connections/check        检查连接状态
- POST /lims/sync/calibration         同步校准数据
- POST /lims/sync/environment         同步环境数据
- GET  /lims/sync/logs                同步日志
- POST /lims/instrument/upload        仪器数据上传（I1）
- GET  /lims/instrument/history       受试者仪器数据历史
- GET  /lims/instrument/trend         指标趋势
- POST /lims/instrument/compare       会话比对
"""
from ninja import Router, Schema, File, UploadedFile
from typing import List, Optional
from apps.identity.decorators import require_permission

from .services import LIMSService

router = Router()


@router.get('/connections', summary='LIMS连接列表')
@require_permission('lims.connection.read')
def list_connections(request):
    """获取所有 LIMS 连接配置"""
    from .models import LIMSConnection
    conns = LIMSConnection.objects.all()
    return {'code': 200, 'msg': 'OK', 'data': [{
        'id': c.id,
        'name': c.name,
        'api_base_url': c.api_base_url,
        'status': c.status,
        'last_sync_at': c.last_sync_at.isoformat() if c.last_sync_at else None,
        'sync_interval_minutes': c.sync_interval_minutes,
        'is_active': c.is_active,
    } for c in conns]}


class ConnectionCheckIn(Schema):
    connection_id: int


@router.post('/connections/check', summary='检查LIMS连接')
@require_permission('lims.connection.read')
def check_connection(request, data: ConnectionCheckIn):
    """检查指定 LIMS 系统连接状态"""
    result = LIMSService.check_connection(data.connection_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


class SyncIn(Schema):
    connection_id: int


@router.post('/sync/calibration', summary='同步校准数据')
@require_permission('lims.sync.execute')
def sync_calibration(request, data: SyncIn):
    """从 LIMS 同步仪器校准数据"""
    result = LIMSService.sync_calibration_data(data.connection_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/sync/environment', summary='同步环境数据')
@require_permission('lims.sync.execute')
def sync_environment(request, data: SyncIn):
    """从 LIMS 同步环境监控数据"""
    result = LIMSService.sync_environment_data(data.connection_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/sync/logs', summary='同步日志')
@require_permission('lims.sync.read')
def list_sync_logs(request, connection_id: int, limit: int = 20):
    """获取同步日志列表"""
    logs = LIMSService.get_sync_logs(connection_id, limit)
    return {'code': 200, 'msg': 'OK', 'data': logs}


# ── I1: 仪器数据采集中间件 ──

class InstrumentUploadIn(Schema):
    instrument_type: str = 'visia'
    subject_id: int
    visit_id: Optional[int] = None
    work_order_id: Optional[int] = None


@router.post('/instrument/upload', summary='上传仪器数据文件（I1）')
@require_permission('lims.sync.execute')
def instrument_upload(request, data: InstrumentUploadIn, file: UploadedFile = File(...)):
    """
    上传仪器导出文件，自动解析并存储测量数据。
    支持 VISIA CSV/XML、Corneometer CSV 等格式。
    """
    from .instrument_middleware import InstrumentMiddleware
    from apps.identity.decorators import get_current_account

    account = get_current_account(request)
    operator_id = account.id if account else None

    content = file.read()
    result = InstrumentMiddleware.parse_and_store(
        instrument_type=data.instrument_type,
        file_content=content,
        file_name=file.name or 'unknown',
        subject_id=data.subject_id,
        operator_id=operator_id,
        visit_id=data.visit_id,
        work_order_id=data.work_order_id,
    )
    code = 200 if result.get('success') else 400
    return {'code': code, 'msg': result.get('message', 'OK'), 'data': result}


@router.get('/instrument/history', summary='受试者仪器数据历史（I1）')
@require_permission('lims.sync.read')
def instrument_history(
    request,
    subject_id: int,
    instrument_type: Optional[str] = None,
    limit: int = 50,
):
    """查询受试者的仪器检测历史记录及测量数据"""
    from .instrument_middleware import InstrumentMiddleware

    data = InstrumentMiddleware.get_subject_history(
        subject_id=subject_id,
        instrument_type=instrument_type,
        limit=min(limit, 200),
    )
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/instrument/trend', summary='指标趋势（I1）')
@require_permission('lims.sync.read')
def instrument_trend(
    request,
    subject_id: int,
    metric_name: str,
    instrument_type: str = 'visia',
    zone: str = 'full_face',
    days: int = 365,
):
    """获取受试者特定指标在时间维度上的趋势数据"""
    from .instrument_middleware import InstrumentMiddleware

    data = InstrumentMiddleware.get_metric_trend(
        subject_id=subject_id,
        metric_name=metric_name,
        instrument_type=instrument_type,
        zone=zone,
        days=min(days, 1095),
    )
    return {'code': 200, 'msg': 'OK', 'data': data}


class InstrumentCompareIn(Schema):
    session_id_before: int
    session_id_after: int


@router.post('/instrument/compare', summary='采集会话比对（I1）')
@require_permission('lims.sync.read')
def instrument_compare(request, data: InstrumentCompareIn):
    """比较两次仪器采集会话的指标差异"""
    from .instrument_middleware import InstrumentMiddleware

    result = InstrumentMiddleware.compare_sessions(
        session_id_before=data.session_id_before,
        session_id_after=data.session_id_after,
    )
    code = 200 if result.get('success') else 400
    return {'code': code, 'msg': result.get('message', 'OK'), 'data': result}
