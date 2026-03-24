"""
前台接待 API

路由前缀：/reception/
提供前台工作面板所需的聚合查询和快捷操作端点。
"""
from ninja import Router, Schema
from typing import Optional
from datetime import date
from apps.identity.decorators import require_permission, _get_account_from_request
from .services import reception_service as svc

router = Router()


# ============================================================================
# Schema
# ============================================================================
class QuickCheckinIn(Schema):
    subject_id: int
    method: str = 'manual'
    location: str = ''
    project_code: Optional[str] = None  # 可选，同一天多项目时指定为哪个项目分配 SC 号


class QuickCheckoutIn(Schema):
    checkin_id: int


class MarkNoShowIn(Schema):
    appointment_id: int


class CrossSyncIn(Schema):
    enrollment_id: int
    reception_status: str
    recruitment_status: Optional[str] = None
    workorder_status: Optional[str] = None
    quality_event_id: Optional[int] = None


class WalkInRegisterIn(Schema):
    name: str
    phone: str
    gender: Optional[str] = ''
    purpose: Optional[str] = '临时到访'
    auto_checkin: bool = True


class UpdateProjectScIn(Schema):
    """更新受试者-项目 SC 记录的入组情况与 RD 号。仅当入组情况为正式入组时可写 RD 号。"""
    subject_id: int
    project_code: str
    enrollment_status: Optional[str] = None
    rd_number: Optional[str] = None


class BoardCheckinIn(Schema):
    """接待看板签到（与工单执行签到独立）。project_code 可选，同天多项目时指定为哪个项目分配 SC 号。"""
    subject_id: int
    target_date: Optional[date] = None
    project_code: Optional[str] = None


class BoardCheckoutIn(Schema):
    """接待看板签出（与工单执行签出独立）"""
    subject_id: int
    target_date: Optional[date] = None


class BoardProjectScIn(Schema):
    """接待看板 SC/入组/RD（与工单执行独立）"""
    subject_id: int
    project_code: str
    enrollment_status: Optional[str] = None
    rd_number: Optional[str] = None
    sc_number: Optional[str] = None


# ============================================================================
# 前台接待 API
# ============================================================================
@router.get('/today-queue', summary='今日受试者队列')
@require_permission('subject.subject.read')
def today_queue(
    request,
    target_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 10,
    project_code: Optional[str] = None,
    source: str = 'execution',
):
    """source: execution=工单执行独立数据，board=接待看板独立数据。SC/RD/签到签出时间两套互不影响。"""
    result = svc.get_today_queue(
        target_date=target_date, page=page, page_size=page_size,
        project_code=project_code, source=source,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/today-queue/export', summary='今日队列导出数据')
@require_permission('subject.subject.read')
def today_queue_export(
    request,
    target_date: Optional[date] = None,
    project_code: Optional[str] = None,
    status: Optional[str] = None,
    source: str = 'execution',
):
    result = svc.get_today_queue_export(
        target_date=target_date, project_code=project_code, status=status, source=source,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/appointment-calendar', summary='预约月历统计')
@require_permission('subject.subject.read')
def appointment_calendar(request, target_month: Optional[str] = None):
    result = svc.get_appointment_calendar(target_month=target_month)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/today-stats', summary='今日统计')
@require_permission('subject.subject.read')
def today_stats(request, target_date: Optional[date] = None, project_code: Optional[str] = None):
    result = svc.get_today_stats(target_date, project_code=project_code)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/quick-checkin', summary='快速签到')
@require_permission('subject.subject.update')
def quick_checkin(request, payload: QuickCheckinIn):
    account = _get_account_from_request(request)
    try:
        result = svc.quick_checkin(
            subject_id=payload.subject_id,
            method=payload.method,
            location=payload.location,
            operator_id=account.id,
            project_code=(payload.project_code or '').strip() or None,
        )
        return {'code': 200, 'msg': 'OK', 'data': result}
    except Exception as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.post('/quick-checkout', summary='快速签出')
@require_permission('subject.subject.update')
def quick_checkout(request, payload: QuickCheckoutIn):
    try:
        result = svc.quick_checkout(payload.checkin_id)
        return {'code': 200, 'msg': 'OK', 'data': result}
    except Exception as e:
        return {'code': 400, 'msg': str(e), 'data': None}


# ============================================================================
# 接待看板独立签到/签出（与工单执行互不影响）
# ============================================================================
@router.get('/board-checkins', summary='接待看板签到记录')
@require_permission('subject.subject.read')
def board_checkins_list(request, target_date: Optional[date] = None):
    """按日期返回接待看板签到/签出记录，供接待看板队列与工单执行队列合并展示。"""
    result = svc.get_board_checkins(target_date=target_date)
    return {'code': 200, 'msg': 'OK', 'data': {'items': result}}


@router.post('/board-checkin', summary='接待看板签到')
@require_permission('subject.subject.update')
def board_checkin(request, payload: BoardCheckinIn):
    """接待看板签到，仅写入接待看板专用表，不影响工单执行。"""
    if payload is None:
        return {'code': 400, 'msg': '请求体不能为空', 'data': None}
    try:
        result = svc.board_checkin(
            subject_id=payload.subject_id,
            target_date=payload.target_date,
            project_code=(payload.project_code or '').strip() or None,
        )
        return {'code': 200, 'msg': 'OK', 'data': result}
    except Exception as e:
        err_msg = str(e)
        if 'no such table' in err_msg.lower() or 't_reception_board_checkin' in err_msg.lower():
            err_msg = '接待看板签到表未创建，请先执行: python manage.py migrate subject'
        return {'code': 400, 'msg': err_msg, 'data': None}


@router.post('/board-checkout', summary='接待看板签出')
@require_permission('subject.subject.update')
def board_checkout(request, payload: BoardCheckoutIn):
    """接待看板签出，仅更新接待看板专用表，不影响工单执行。"""
    if payload is None:
        return {'code': 400, 'msg': '请求体不能为空', 'data': None}
    try:
        result = svc.board_checkout(subject_id=payload.subject_id, target_date=payload.target_date)
        return {'code': 200, 'msg': 'OK', 'data': result}
    except Exception as e:
        err_msg = str(e)
        if 'no such table' in err_msg.lower() or 't_reception_board_checkin' in err_msg.lower():
            err_msg = '接待看板签到表未创建，请先执行: python manage.py migrate subject'
        return {'code': 400, 'msg': err_msg, 'data': None}


@router.get('/board-project-sc', summary='接待看板 SC/入组/RD 列表')
@require_permission('subject.subject.read')
def board_project_sc_list(request):
    """返回接待看板专用 SC/入组情况/RD，与工单执行独立。"""
    result = svc.get_board_project_sc_list()
    return {'code': 200, 'msg': 'OK', 'data': {'items': result}}


@router.patch('/board-project-sc', summary='更新接待看板 SC/入组/RD')
@require_permission('subject.subject.update')
def board_project_sc_update(request, payload: BoardProjectScIn):
    """更新接待看板专用 SC/入组/RD，与工单执行独立。"""
    try:
        result = svc.update_board_project_sc(
            subject_id=payload.subject_id,
            project_code=payload.project_code,
            enrollment_status=payload.enrollment_status,
            rd_number=payload.rd_number,
            sc_number=payload.sc_number,
        )
        return {'code': 200, 'msg': 'OK', 'data': result}
    except Exception as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.patch('/project-sc', summary='更新入组情况与RD号')
@require_permission('subject.subject.update')
def update_project_sc(request, payload: UpdateProjectScIn):
    account = _get_account_from_request(request)
    try:
        result = svc.update_project_sc(
            subject_id=payload.subject_id,
            project_code=payload.project_code,
            enrollment_status=payload.enrollment_status,
            rd_number=payload.rd_number,
            operator_id=account.id,
        )
        return {'code': 200, 'msg': 'OK', 'data': result}
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}
    except Exception as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.get('/pending-alerts', summary='待处理提醒')
@require_permission('subject.subject.read')
def pending_alerts(request, target_date: Optional[date] = None):
    result = svc.get_pending_alerts(target_date)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/print-flowcard/{checkin_id}', summary='生成流程卡')
@require_permission('subject.subject.read')
def print_flowcard(request, checkin_id: int):
    result = svc.generate_flowcard(checkin_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/flowcard/{checkin_id}/progress', summary='流程卡进度')
@require_permission('subject.subject.read')
def flowcard_progress(request, checkin_id: int):
    result = svc.get_flowcard_progress(checkin_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/mark-no-show', summary='标记缺席')
@require_permission('subject.subject.update')
def mark_no_show(request, payload: MarkNoShowIn):
    result = svc.mark_no_show(payload.appointment_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/walk-in-register', summary='无预约临时到访补登')
@require_permission('subject.subject.update')
def walk_in_register(request, payload: WalkInRegisterIn):
    """接待台为无预约的临时到访受试者补登预约并可选自动签到。
    若手机号已有对应 Subject 则复用，否则自动创建新 Subject。
    """
    account = _get_account_from_request(request)
    result = svc.register_walk_in(
        name=payload.name,
        phone=payload.phone,
        gender=payload.gender or '',
        purpose=payload.purpose or '临时到访',
        auto_checkin=payload.auto_checkin,
        operator_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/cross-workstation-sync', summary='跨工作台状态回写')
@require_permission('subject.subject.update')
def cross_workstation_sync(request, payload: CrossSyncIn):
    result = svc.sync_cross_workstation(
        enrollment_id=payload.enrollment_id,
        reception_status=payload.reception_status,
        recruitment_status=payload.recruitment_status,
        workorder_status=payload.workorder_status,
        quality_event_id=payload.quality_event_id,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# 叫号队列 API
# ============================================================================

class ScanCheckinIn(Schema):
    qr_data: str


@router.post('/call-next', summary='叫号')
@require_permission('subject.subject.update')
def call_next(request, station_id: str = 'default', project_code: Optional[str] = None):
    """叫下一位等候受试者；可选 project_code 仅在该项目内按 SC 号顺序叫号。"""
    from .services.queue_service import call_next as do_call_next
    result = do_call_next(station_id=station_id, project_code=project_code)
    return {'code': 200, 'msg': 'OK', 'data': result}


class MissCallIn(Schema):
    checkin_id: int


@router.post('/miss-call', summary='过号')
@require_permission('subject.subject.update')
def miss_call(request, payload: MissCallIn):
    """过号：将执行中的签到改回等候，按该项目顺延 3 位重新排队。"""
    from .services.queue_service import miss_call as do_miss_call
    result = do_miss_call(payload.checkin_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/queue-position/{subject_id}', summary='查询排位')
@require_permission('subject.subject.read')
def queue_position(request, subject_id: int):
    """查询受试者当前排队位置"""
    from .services.queue_service import get_queue_position
    result = get_queue_position(subject_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/display-board', summary='大屏展示数据')
@require_permission('subject.subject.read')
def display_board(request, target_date: Optional[date] = None):
    """叫号大屏展示数据"""
    from .services.queue_service import get_display_board
    result = get_display_board(target_date)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/display-board-data', summary='大屏展示数据（兼容路径）')
def display_board_data(request, target_date: Optional[date] = None):
    """兼容路径：用于规避客户端缓存旧 301 导致的大屏加载失败（大屏数据已脱敏，可匿名访问）"""
    from .services.queue_service import get_display_board
    result = get_display_board(target_date)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/scan-checkin', summary='扫码签到')
@require_permission('subject.subject.update')
def scan_checkin(request, payload: ScanCheckinIn):
    """扫描受试者 QR 码完成签到"""
    from .services.reception_service import quick_checkin
    account = _get_account_from_request(request)
    try:
        from apps.qrcode.services import resolve_qrcode, log_scan_event
        qr_info = resolve_qrcode(payload.qr_data)
        if not qr_info:
            return {'code': 400, 'msg': '无效的二维码或二维码已停用', 'data': None}
        if qr_info.get('entity_type') != 'subject':
            return {'code': 400, 'msg': '该二维码不是受试者码，无法签到', 'data': None}
        subject_id = qr_info.get('entity_id')
        if not subject_id:
            return {'code': 400, 'msg': '无效的二维码', 'data': None}
        log_scan_event(
            qr_record_id=qr_info.get('id'),
            scanner_id=account.id if account else None,
            workstation='reception',
            action='checkin',
        )
        result = quick_checkin(
            subject_id=subject_id,
            method='qr_scan',
            operator_id=account.id if account else None,
        )
        return {'code': 200, 'msg': '扫码签到成功', 'data': result}
    except Exception as e:
        return {'code': 400, 'msg': str(e), 'data': None}


# ============================================================================
# 等候统计
# ============================================================================
@router.get('/wait-stats', summary='等候时长统计')
@require_permission('subject.subject.read')
def wait_stats(request, target_date: Optional[date] = None, days: int = 7):
    """等候时长统计（单日 + 趋势）"""
    from django.utils import timezone
    from django.db.models import Avg, Max, Min, Count, F
    from datetime import timedelta
    from .models_execution import SubjectCheckin

    if not target_date:
        target_date = timezone.now().date()

    def _minutes(td):
        return round(td.total_seconds() / 60, 1) if td else 0

    completed = SubjectCheckin.objects.filter(
        checkin_date=target_date,
        status='checked_out',
        checkin_time__isnull=False,
        checkout_time__isnull=False,
    ).annotate(wait_duration=F('checkout_time') - F('checkin_time'))

    agg = completed.aggregate(
        avg_wait=Avg('wait_duration'),
        max_wait=Max('wait_duration'),
        min_wait=Min('wait_duration'),
        total=Count('id'),
    )

    today_stats = {
        'date': str(target_date),
        'avg_wait_minutes': _minutes(agg['avg_wait']),
        'max_wait_minutes': _minutes(agg['max_wait']),
        'min_wait_minutes': _minutes(agg['min_wait']),
        'total_served': agg['total'],
    }

    trends = []
    for i in range(days):
        d = target_date - timedelta(days=i)
        day_completed = SubjectCheckin.objects.filter(
            checkin_date=d, status='checked_out',
            checkin_time__isnull=False, checkout_time__isnull=False,
        ).annotate(wait_duration=F('checkout_time') - F('checkin_time'))
        day_agg = day_completed.aggregate(avg_w=Avg('wait_duration'), cnt=Count('id'))
        trends.append({
            'date': str(d),
            'avg_wait_minutes': _minutes(day_agg['avg_w']),
            'served_count': day_agg['cnt'],
        })

    trends.reverse()
    return {'code': 200, 'msg': 'OK', 'data': {
        'today': today_stats, 'trends': trends,
    }}


@router.get('/analytics', summary='接待全景分析')
@require_permission('subject.subject.read')
def analytics(request, target_date: Optional[date] = None, days: int = 7):
    data = svc.get_analytics(target_date=target_date, days=days)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/insights', summary='接待智能洞察')
@require_permission('subject.subject.read')
def insights(request, target_date: Optional[date] = None, days: int = 7):
    data = svc.get_insights(target_date=target_date, days=days)
    return {'code': 200, 'msg': 'OK', 'data': data}
