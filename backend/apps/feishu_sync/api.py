"""
飞书数据同步 API

端点：
- GET  /sync/configs          同步配置列表
- POST /sync/configs           创建同步配置
- GET  /sync/configs/{id}       同步配置详情
- PUT  /sync/configs/{id}      更新同步配置
- POST /sync/run/{config_id}   手动触发同步
- GET  /sync/logs              同步日志列表
"""
from ninja import Router, Schema, Query
from typing import Optional, Dict, List
from datetime import datetime
import json
import logging
import hashlib
import os
from apps.identity.decorators import require_permission
from django.core.cache import cache
from libs.db_utils import sanitize_pagination

router = Router()
logger = logging.getLogger(__name__)


CALLBACK_TTL_SECONDS = 3600


def _parse_body(request):
    try:
        return json.loads(request.body) if request.body else {}
    except Exception:
        return None


def _extract_challenge(body: dict):
    if 'challenge' in body:
        return body['challenge']
    if body.get('type') == 'url_verification' and body.get('challenge'):
        return body['challenge']
    return None


def _extract_event_id(body: dict) -> str:
    header = body.get('header', {})
    event = body.get('event', {})
    return str(
        header.get('event_id')
        or header.get('message_id')
        or event.get('uuid')
        or event.get('instance_code')
        or ''
    )


def _idempotent_guard(prefix: str, event_id: str) -> bool:
    if not event_id:
        return True
    key = f'feishu:{prefix}:{event_id}'
    if cache.get(key):
        return False
    cache.set(key, '1', timeout=CALLBACK_TTL_SECONDS)
    return True


# ============================================================================
# Schema
# ============================================================================
class SyncConfigOut(Schema):
    id: int
    table_name: str
    bitable_app_token: str
    bitable_table_id: str
    direction: str
    field_mapping: Dict
    unique_key_fields: List[str]
    enabled: bool
    sync_interval_minutes: int
    last_sync_time: Optional[datetime] = None
    create_time: datetime
    update_time: datetime


class SyncConfigIn(Schema):
    table_name: str
    bitable_app_token: str
    bitable_table_id: str
    direction: str = 'bidirectional'
    field_mapping: Dict = {}
    unique_key_fields: List[str] = []
    auto_fill_unique_keys: bool = False
    enabled: bool = True
    sync_interval_minutes: int = 60


class SyncConfigUpdateIn(Schema):
    bitable_app_token: Optional[str] = None
    bitable_table_id: Optional[str] = None
    direction: Optional[str] = None
    field_mapping: Optional[Dict] = None
    unique_key_fields: Optional[List[str]] = None
    auto_fill_unique_keys: bool = False
    enabled: Optional[bool] = None
    sync_interval_minutes: Optional[int] = None


class SyncLogOut(Schema):
    id: int
    config_id: int
    status: str
    records_synced: int
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


class SyncLogQueryParams(Schema):
    config_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 端点
# ============================================================================
@router.get('/configs', summary='同步配置列表')
@require_permission('system.sync.manage')
def list_sync_configs(request, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    """分页查询同步配置列表"""
    from .models import SyncConfig

    queryset = SyncConfig.objects.all()
    paging = sanitize_pagination(page, page_size, max_page_size=100)
    total = queryset.count()
    items = queryset[paging['offset']:paging['offset'] + paging['limit']]
    
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': item.id,
                    'table_name': item.table_name,
                    'bitable_app_token': item.bitable_app_token,
                    'bitable_table_id': item.bitable_table_id,
                    'direction': item.direction,
                    'field_mapping': item.field_mapping,
                    'unique_key_fields': item.unique_key_fields,
                    'enabled': item.enabled,
                    'sync_interval_minutes': item.sync_interval_minutes,
                    'last_sync_time': item.last_sync_time.isoformat() if item.last_sync_time else None,
                    'create_time': item.create_time.isoformat(),
                    'update_time': item.update_time.isoformat(),
                }
                for item in items
            ],
            'total': total,
            'page': paging['page'],
            'page_size': paging['page_size'],
        },
    }


@router.post('/configs', summary='创建同步配置')
@require_permission('system.sync.manage')
def create_sync_config(request, data: SyncConfigIn):
    """创建新的同步配置"""
    from .models import SyncConfig
    from .services import recommend_unique_key_fields

    unique_key_fields = data.unique_key_fields
    if data.direction in ('from_feishu', 'bidirectional') and not unique_key_fields and data.auto_fill_unique_keys:
        unique_key_fields = recommend_unique_key_fields(data.table_name)

    if data.direction in ('from_feishu', 'bidirectional') and not unique_key_fields:
        return 400, {
            'code': 400,
            'msg': 'from_feishu/bidirectional 必须配置 unique_key_fields（业务唯一键）',
        }

    config = SyncConfig.objects.create(
        table_name=data.table_name,
        bitable_app_token=data.bitable_app_token,
        bitable_table_id=data.bitable_table_id,
        direction=data.direction,
        field_mapping=data.field_mapping,
        unique_key_fields=unique_key_fields,
        enabled=data.enabled,
        sync_interval_minutes=data.sync_interval_minutes,
    )

    return {
        'code': 200,
        'msg': '创建成功',
        'data': {
            'id': config.id,
            'table_name': config.table_name,
            'direction': config.direction,
        },
    }


@router.get('/configs/{config_id}', summary='同步配置详情')
@require_permission('system.sync.manage')
def get_sync_config(request, config_id: int):
    """获取同步配置详细信息"""
    from .models import SyncConfig

    config = SyncConfig.objects.filter(id=config_id).first()
    if not config:
        return 404, {'code': 404, 'msg': '同步配置不存在'}

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': config.id,
            'table_name': config.table_name,
            'bitable_app_token': config.bitable_app_token,
            'bitable_table_id': config.bitable_table_id,
            'direction': config.direction,
            'field_mapping': config.field_mapping,
            'unique_key_fields': config.unique_key_fields,
            'enabled': config.enabled,
            'sync_interval_minutes': config.sync_interval_minutes,
            'last_sync_time': config.last_sync_time.isoformat() if config.last_sync_time else None,
            'create_time': config.create_time.isoformat(),
            'update_time': config.update_time.isoformat(),
        },
    }


@router.put('/configs/{config_id}', summary='更新同步配置')
@require_permission('system.sync.manage')
def update_sync_config(request, config_id: int, data: SyncConfigUpdateIn):
    """更新同步配置"""
    from .models import SyncConfig

    config = SyncConfig.objects.filter(id=config_id).first()
    if not config:
        return 404, {'code': 404, 'msg': '同步配置不存在'}
    from .services import recommend_unique_key_fields

    resolved_unique_key_fields = data.unique_key_fields
    if (
        resolved_unique_key_fields is None and data.auto_fill_unique_keys
        and (data.direction in (None, 'from_feishu', 'bidirectional'))
    ):
        resolved_unique_key_fields = recommend_unique_key_fields(config.table_name)

    next_direction = data.direction if data.direction is not None else config.direction
    next_unique_key_fields = (
        resolved_unique_key_fields if resolved_unique_key_fields is not None else config.unique_key_fields
    )
    if next_direction in ('from_feishu', 'bidirectional') and not next_unique_key_fields:
        return 400, {
            'code': 400,
            'msg': 'from_feishu/bidirectional 必须配置 unique_key_fields（业务唯一键）',
        }

    update_fields = []
    if data.bitable_app_token is not None:
        config.bitable_app_token = data.bitable_app_token
        update_fields.append('bitable_app_token')
    if data.bitable_table_id is not None:
        config.bitable_table_id = data.bitable_table_id
        update_fields.append('bitable_table_id')
    if data.direction is not None:
        config.direction = data.direction
        update_fields.append('direction')
    if data.field_mapping is not None:
        config.field_mapping = data.field_mapping
        update_fields.append('field_mapping')
    if resolved_unique_key_fields is not None:
        config.unique_key_fields = resolved_unique_key_fields
        update_fields.append('unique_key_fields')
    if data.enabled is not None:
        config.enabled = data.enabled
        update_fields.append('enabled')
    if data.sync_interval_minutes is not None:
        config.sync_interval_minutes = data.sync_interval_minutes
        update_fields.append('sync_interval_minutes')

    if update_fields:
        config.save(update_fields=update_fields)

    return {
        'code': 200,
        'msg': '更新成功',
        'data': {
            'id': config.id,
            'table_name': config.table_name,
        },
    }


@router.get('/recommend-keys', summary='推荐业务唯一键')
@require_permission('system.sync.manage')
def recommend_sync_keys(request, table_name: str):
    """根据模型结构推荐 from_feishu 幂等键字段。"""
    from .services import recommend_unique_key_fields
    keys = recommend_unique_key_fields(table_name)
    if not keys:
        return 404, {'code': 404, 'msg': '未找到模型或无可推荐字段'}
    return {'code': 200, 'msg': 'OK', 'data': {'table_name': table_name, 'recommended_keys': keys}}


@router.post('/run/{config_id}', summary='手动触发同步')
@require_permission('system.sync.manage')
def run_sync_endpoint(request, config_id: int):
    """手动触发同步任务执行"""
    from .services import run_sync

    try:
        log = run_sync(config_id)
        return {
            'code': 200,
            'msg': '同步任务已启动',
            'data': {
                'log_id': log.id,
                'status': log.status,
                'records_synced': log.records_synced,
            },
        }
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    except Exception as e:
        return 500, {'code': 500, 'msg': f'同步失败: {str(e)}'}


# ============================================================================
# 飞书审批回调（对应 FEISHU_NATIVE_SETUP.md 3.x）
# ============================================================================
@router.post('/approval-callback', summary='飞书审批回调')
def approval_callback(request):
    """
    飞书审批状态变更回调端点

    飞书审批通过/拒绝时自动调用此端点，更新对应的业务记录状态。
    配置方式：在飞书开放平台 → 事件订阅 → 审批实例状态变更 → 请求地址指向此端点。
    """
    body = _parse_body(request)
    if body is None:
        return {'code': 400, 'msg': '请求体解析失败'}

    challenge = _extract_challenge(body)
    if challenge:
        return {'challenge': challenge}

    if not _idempotent_guard('approval', _extract_event_id(body)):
        return {'code': 200, 'msg': '幂等命中，已忽略重复事件'}

    # 解析事件数据
    event = body.get('event', {})
    if not event:
        return {'code': 400, 'msg': '缺少 event 数据'}

    from libs.feishu_approval import handle_approval_callback
    success = handle_approval_callback(event)

    return {
        'code': 200 if success else 500,
        'msg': '处理成功' if success else '处理失败',
    }


# ============================================================================
# AnyCross Webhook 回调（对应 FEISHU_NATIVE_SETUP.md 6.x）
# ============================================================================
@router.post('/anycross-callback', summary='AnyCross 回调')
def anycross_callback(request):
    """
    AnyCross 工作流回调端点

    AnyCross 工作流执行完成后回调此端点，更新后端数据。
    配置方式：在 AnyCross 工作流中添加 HTTP 请求节点，指向此端点。
    """
    body = _parse_body(request)
    if body is None:
        return {'code': 400, 'msg': '请求体解析失败'}

    challenge = _extract_challenge(body)
    if challenge:
        return {'challenge': challenge}

    if not _idempotent_guard('anycross', _extract_event_id(body)):
        return {'code': 200, 'msg': '幂等命中，已忽略重复事件'}

    from .services import handle_anycross_callback
    success = handle_anycross_callback(body)

    return {
        'code': 200 if success else 500,
        'msg': '处理成功' if success else '处理失败',
    }


# ============================================================================
# 飞书卡片交互回调（消息卡片按钮点击）
# ============================================================================

def _verify_card_callback_signature(request) -> bool:
    """
    验证飞书卡片回调签名

    飞书在卡片回调请求的 header 中携带签名信息：
    - X-Lark-Request-Timestamp: 请求时间戳
    - X-Lark-Request-Nonce: 随机串
    - X-Lark-Signature: HMAC-SHA1 签名

    签名算法：SHA1(timestamp + nonce + Encrypt Key + body)

    如果 FEISHU_ENCRYPT_KEY 未配置，跳过验证（开发阶段兼容）。

    Returns:
        True 签名验证通过或未配置密钥，False 验证失败
    """
    encrypt_key = os.getenv('FEISHU_ENCRYPT_KEY', '')
    if not encrypt_key:
        from django.conf import settings
        if not settings.DEBUG:
            logger.error('FEISHU_ENCRYPT_KEY 未配置，生产环境拒绝未签名的卡片回调')
            return False
        logger.warning('FEISHU_ENCRYPT_KEY 未配置，开发模式跳过签名验证')
        return True

    timestamp = request.META.get('HTTP_X_LARK_REQUEST_TIMESTAMP', '')
    nonce = request.META.get('HTTP_X_LARK_REQUEST_NONCE', '')
    signature = request.META.get('HTTP_X_LARK_SIGNATURE', '')

    if not timestamp or not nonce or not signature:
        return False

    body = request.body.decode('utf-8') if request.body else ''
    verify_str = timestamp + nonce + encrypt_key + body
    computed = hashlib.sha1(verify_str.encode('utf-8')).hexdigest()

    return computed == signature


@router.post('/card-callback', summary='飞书卡片交互回调', auth=None)
def card_callback(request):
    """
    飞书消息卡片按钮回调端点

    当用户在飞书中点击工单卡片的"接受"/"完成"按钮时，
    飞书向此端点发送 POST 请求。

    配置方式：飞书开放平台 → 应用功能 → 机器人 → 消息卡片请求网址
    URL: https://{domain}/api/v1/sync/card-callback

    安全性：通过 X-Lark-Signature 签名验证防止伪造（AC-4）。
    回调返回新卡片 JSON 以替换原卡片（展示更新后的状态）。
    """
    card_logger = logging.getLogger(__name__)

    # AC-4：签名验证
    if not _verify_card_callback_signature(request):
        card_logger.warning("卡片回调签名验证失败，拒绝请求")
        return 403, {'code': 403, 'msg': '签名验证失败'}

    body = _parse_body(request)
    if body is None:
        return {'code': 400, 'msg': '请求体解析失败'}

    challenge = _extract_challenge(body)
    if challenge:
        return {'challenge': challenge}

    if not _idempotent_guard('card', _extract_event_id(body)):
        return {'code': 200, 'msg': '幂等命中，已忽略重复事件'}

    open_id = body.get('open_id', '')
    action = body.get('action', {})
    action_value = action.get('value', {})
    action_type = action_value.get('action', '')
    workorder_id_str = action_value.get('workorder_id', '')

    if not action_type or not workorder_id_str:
        card_logger.warning(f"卡片回调缺少参数: action={action_type}, workorder_id={workorder_id_str}")
        return {}

    try:
        workorder_id = int(workorder_id_str)
    except (ValueError, TypeError):
        card_logger.warning(f"卡片回调工单ID无效: {workorder_id_str}")
        return {}

    from apps.workorder import services as wo_services
    from libs.notification import build_work_order_updated_card

    wo = None
    action_text = ''

    if action_type == 'accept_workorder':
        wo = wo_services.start_work_order(workorder_id)
        action_text = '已接受'
    elif action_type == 'complete_workorder':
        wo = wo_services.complete_work_order(workorder_id)
        action_text = '已完成'
    else:
        card_logger.warning(f"未知的卡片操作类型: {action_type}")
        return {}

    if not wo:
        card_logger.warning(
            f"卡片回调操作失败: action={action_type}, workorder_id={workorder_id}, "
            f"open_id={open_id}"
        )
        return {"toast": {"type": "error", "content": "操作失败：工单状态不允许此操作"}}

    card_logger.info(f"卡片回调成功: action={action_type}, workorder_id={workorder_id}, open_id={open_id}")

    updated_card = build_work_order_updated_card(wo, action_text)
    return json.loads(updated_card)


@router.get('/logs', summary='同步日志列表')
@require_permission('system.sync.manage')
def list_sync_logs(request, params: SyncLogQueryParams = Query(...)):
    """分页查询同步日志列表"""
    from .models import SyncLog

    queryset = SyncLog.objects.all()
    
    if params.config_id:
        queryset = queryset.filter(config_id=params.config_id)
    if params.status:
        queryset = queryset.filter(status=params.status)
    
    paging = sanitize_pagination(params.page, params.page_size, max_page_size=200)
    total = queryset.count()
    items = queryset[paging['offset']:paging['offset'] + paging['limit']]
    
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': item.id,
                    'config_id': item.config_id,
                    'status': item.status,
                    'records_synced': item.records_synced,
                    'error_message': item.error_message if item.error_message else None,
                    'started_at': item.started_at.isoformat(),
                    'completed_at': item.completed_at.isoformat() if item.completed_at else None,
                }
                for item in items
            ],
            'total': total,
            'page': paging['page'],
            'page_size': paging['page_size'],
        },
    }


# ============================================================================
# S4-7：飞书事件订阅端点
# ============================================================================
@router.post('/event-callback', summary='飞书事件订阅回调')
def event_callback(request):
    """
    飞书事件订阅回调端点

    处理飞书推送的各类事件，包括：
    - 任务完成/更新
    - 日历变更
    - 通讯录变动
    - 审批状态变更
    """
    body = _parse_body(request)
    if body is None:
        return 400, {'code': 400, 'msg': 'invalid body'}

    challenge = _extract_challenge(body)
    if challenge:
        return {'challenge': challenge}

    if not _idempotent_guard('event', _extract_event_id(body)):
        return {'code': 200, 'msg': '幂等命中，已忽略重复事件'}

    # 解析事件
    header = body.get('header', {})
    event_type = header.get('event_type', '')
    event_data = body.get('event', {})

    from apps.feishu_sync.event_handler import handle_event
    result = handle_event(event_type, event_data)
    return result
