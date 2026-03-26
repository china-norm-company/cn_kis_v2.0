"""
二维码管理 API

端点：
- POST /qrcode/generate            生成二维码
- GET  /qrcode/image               返回二维码 PNG（免第三方域名）
- POST /qrcode/resolve             解析二维码
- POST /qrcode/smart-resolve       情境感知解析（角色+状态→推荐动作）
- POST /qrcode/batch-generate      批量生成
- GET  /qrcode/list                二维码列表
- POST /qrcode/station/generate    生成场所码
- GET  /qrcode/station/list        场所码列表
- GET  /qrcode/scan-logs           扫码审计日志
"""
import io
from ninja import Router, Schema
from ninja.responses import Response
from typing import Optional, List
from django.http import HttpResponse

from apps.identity.decorators import _get_account_from_request, require_permission

from . import services

router = Router()


class QRGenerateIn(Schema):
    entity_type: str
    entity_id: int


class QRResolveIn(Schema):
    qr_hash: str


class QRSmartResolveIn(Schema):
    qr_hash: str
    workstation: Optional[str] = ''


class QRBatchGenerateIn(Schema):
    entity_type: str
    entity_ids: List[int]


class QRRegenerateIn(Schema):
    record_id: int


class StationGenerateIn(Schema):
    station_id: int
    label: str


@router.post('/generate', summary='生成二维码')
@require_permission('qrcode.record.create')
def generate_qrcode(request, data: QRGenerateIn):
    """为指定实体生成唯一二维码"""
    account = _get_account_from_request(request)
    result = services.generate_qrcode(
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        generated_by=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/image', summary='二维码 PNG 图片', auth=None)
def qrcode_image(request, data: str):
    """
    根据 data 参数生成二维码 PNG，供小程序 <Image src> 与 downloadFile 使用。
    使用本接口可避免配置第三方 downloadFile 合法域名。
    """
    if not data or len(data) > 2048:
        return Response('Bad Request', status=400)
    try:
        import qrcode
        buf = io.BytesIO()
        qr = qrcode.QRCode(version=1, box_size=10, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')
        img.save(buf, format='PNG')
        buf.seek(0)
        return HttpResponse(buf.getvalue(), content_type='image/png')
    except Exception:
        return Response('Internal Server Error', status=500)


@router.post('/resolve', summary='解析二维码')
@require_permission('qrcode.record.read')
def resolve_qrcode(request, data: QRResolveIn):
    """扫码后解析二维码内容，返回实体信息"""
    account = _get_account_from_request(request)
    result = services.resolve_qrcode(data.qr_hash)
    if not result:
        return 404, {'code': 404, 'msg': '二维码无效或已停用'}
    services.log_scan_event(
        qr_record_id=result.get('id'),
        scanner_id=account.id if account else None,
        workstation='',
        action='resolve',
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/smart-resolve', summary='情境感知解析')
@require_permission('qrcode.record.read')
def smart_resolve(request, data: QRSmartResolveIn):
    """
    情境感知解析：根据扫码人角色和当前工作台，返回推荐动作。

    Response.data:
    - entity:               原始实体信息
    - recommended_action:   推荐动作（如 checkin / jump_to_workorder 等）
    - action_data:          动作所需参数（如 subject_id / work_order_id）
    - alternative_actions:  可选的备选动作列表
    """
    account = _get_account_from_request(request)
    role = getattr(account, 'role', '') if account else ''
    result = services.smart_resolve(
        qr_hash=data.qr_hash,
        scanner_role=role,
        workstation=data.workstation or '',
        scanner_id=account.id if account else None,
    )
    if not result:
        return 404, {'code': 404, 'msg': '二维码无效或已停用'}
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/batch-generate', summary='批量生成二维码')
@require_permission('qrcode.record.create')
def batch_generate(request, data: QRBatchGenerateIn):
    """批量为同类实体生成二维码"""
    account = _get_account_from_request(request)
    results = services.batch_generate(
        entity_type=data.entity_type,
        entity_ids=data.entity_ids,
        generated_by=account.id if account else None,
    )
    return {'code': 200, 'msg': f'生成 {len(results)} 个二维码', 'data': results}


@router.get('/list', summary='二维码列表')
@require_permission('qrcode.record.read')
def list_qrcodes(
    request,
    entity_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    is_active: Optional[bool] = True,
):
    """查询二维码记录"""
    from .models import QRCodeRecord
    qs = QRCodeRecord.objects.all()
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    if entity_type:
        qs = qs.filter(entity_type=entity_type)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [services._record_to_dict(r) for r in items],
            'total': total, 'page': page, 'page_size': page_size,
        },
    }


@router.post('/deactivate/{record_id}', summary='停用二维码')
@require_permission('qrcode.record.update')
def deactivate_qrcode(request, record_id: int):
    result = services.deactivate_qrcode(record_id)
    if not result:
        return 404, {'code': 404, 'msg': '二维码不存在', 'data': None}
    return {'code': 200, 'msg': '二维码已停用', 'data': result}


@router.post('/reactivate/{record_id}', summary='启用二维码')
@require_permission('qrcode.record.update')
def reactivate_qrcode(request, record_id: int):
    result = services.reactivate_qrcode(record_id)
    if not result:
        return 404, {'code': 404, 'msg': '二维码不存在', 'data': None}
    return {'code': 200, 'msg': '二维码已启用', 'data': result}


@router.post('/regenerate', summary='重置二维码')
@require_permission('qrcode.record.update')
def regenerate_qrcode(request, data: QRRegenerateIn):
    account = _get_account_from_request(request)
    result = services.regenerate_qrcode(data.record_id, generated_by=account.id if account else None)
    if not result:
        return 404, {'code': 404, 'msg': '二维码不存在', 'data': None}
    return {'code': 200, 'msg': '二维码已重置', 'data': result}


@router.post('/station/generate', summary='生成场所码')
@require_permission('qrcode.record.create')
def generate_station_qrcode(request, data: StationGenerateIn):
    """为指定场所/工位生成二维码（接待台管理员使用）"""
    account = _get_account_from_request(request)
    from .models import QRCodeRecord, EntityType
    from .services import BASE_URL, _generate_hash

    entity_type = EntityType.STATION
    entity_id = data.station_id

    existing = QRCodeRecord.objects.filter(
        entity_type=entity_type, entity_id=entity_id,
    ).first()
    if existing:
        if data.label and existing.label != data.label:
            existing.label = data.label
            existing.save(update_fields=['label'])
        return {'code': 200, 'msg': 'OK', 'data': services._record_to_dict(existing)}

    qr_hash = _generate_hash(entity_type, entity_id)
    qr_data = f'{BASE_URL}/qr/{qr_hash}'
    record = QRCodeRecord.objects.create(
        entity_type=entity_type,
        entity_id=entity_id,
        qr_data=qr_data,
        qr_hash=qr_hash,
        label=data.label or f'签到点#{entity_id}',
        generated_by=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': services._record_to_dict(record)}


@router.get('/station/list', summary='场所码列表')
@require_permission('qrcode.record.read')
def list_station_qrcodes(request):
    """查询所有场所码（接待台使用）"""
    from .models import QRCodeRecord, EntityType
    records = QRCodeRecord.objects.filter(entity_type=EntityType.STATION, is_active=True)
    return {
        'code': 200, 'msg': 'OK',
        'data': [services._record_to_dict(r) for r in records],
    }


@router.get('/scan-logs', summary='扫码审计日志')
@require_permission('qrcode.record.read')
def scan_logs(
    request,
    qr_record_id: Optional[int] = None,
    scanner_id: Optional[int] = None,
    workstation: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    """查询扫码审计日志，满足 GCP 合规追溯要求"""
    from .models import ScanAuditLog
    qs = ScanAuditLog.objects.all()
    if qr_record_id:
        qs = qs.filter(qr_record_id=qr_record_id)
    if scanner_id:
        qs = qs.filter(scanner_id=scanner_id)
    if workstation:
        qs = qs.filter(workstation=workstation)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs.select_related('qr_record')[offset:offset + page_size])
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': log.id,
                    'qr_record_id': log.qr_record_id,
                    'entity_type': log.qr_record.entity_type if log.qr_record else None,
                    'entity_id': log.qr_record.entity_id if log.qr_record else None,
                    'scanner_id': log.scanner_id,
                    'workstation': log.workstation,
                    'action': log.action,
                    'scan_time': log.scan_time.isoformat(),
                    'ip_address': log.ip_address,
                }
                for log in items
            ],
            'total': total, 'page': page, 'page_size': page_size,
        },
    }
