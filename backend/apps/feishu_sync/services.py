"""
飞书数据同步服务

实现数据库与飞书多维表格之间的双向数据同步
"""
import httpx
from typing import Dict, List, Any
from django.apps import apps
from django.db import models as django_models, transaction
from django.utils import timezone
from .models import SyncConfig, SyncLog, SyncLogStatus, SyncDirection


def get_feishu_tenant_token() -> str:
    """获取飞书 tenant_access_token（委托给统一客户端，带缓存）"""
    from libs.feishu_client import feishu_client
    return feishu_client.get_tenant_token()


def _table_name_to_model_name(table_name: str) -> str:
    """将 t_xxx_yyy 转换为 XxxYyy 模型名。"""
    raw_name = (table_name or '').strip()
    if raw_name.startswith('t_'):
        raw_name = raw_name[2:]
    parts = [p for p in raw_name.split('_') if p]
    return ''.join(p.capitalize() for p in parts)


def _resolve_model_by_table_name(table_name: str):
    """按 db_table 或模型名查找 Django 模型。"""
    model_name = _table_name_to_model_name(table_name)
    for app_config in apps.get_app_configs():
        for model in app_config.get_models():
            if model._meta.db_table == table_name:
                return model
            if model.__name__.lower() == model_name.lower():
                return model
    return None


def _build_upsert_lookup(db_data: Dict[str, Any], unique_key_fields: List[str]) -> Dict[str, Any]:
    """
    根据配置构建幂等查找条件。
    - 优先使用 unique_key_fields（推荐）
    - 回退到 id（兼容旧配置）
    """
    if unique_key_fields:
        lookup = {
            field: db_data.get(field)
            for field in unique_key_fields
            if db_data.get(field) not in (None, '')
        }
        if len(lookup) == len(unique_key_fields):
            return lookup
        return {}

    if db_data.get('id') not in (None, ''):
        return {'id': db_data['id']}
    return {}


def recommend_unique_key_fields(table_name: str) -> List[str]:
    """
    根据模型元数据推荐幂等唯一键字段。
    优先级：
    1) 主键以外 unique=True 字段
    2) 常见业务主键字段
    3) 兜底主键 id
    """
    model = _resolve_model_by_table_name(table_name)
    if not model:
        return []

    unique_fields = []
    for field in model._meta.fields:
        if getattr(field, 'primary_key', False):
            continue
        if getattr(field, 'unique', False):
            unique_fields.append(field.name)

    if unique_fields:
        return unique_fields

    candidates = ['feishu_open_id', 'feishu_user_id', 'employee_no', 'document_no', 'code', 'name']
    existing = {f.name for f in model._meta.fields}
    recommended = [f for f in candidates if f in existing]
    if recommended:
        return recommended

    return ['id']


def sync_to_bitable(config: SyncConfig) -> SyncLog:
    """
    同步数据库数据到飞书多维表格

    Args:
        config: 同步配置

    Returns:
        SyncLog: 同步日志记录
    """
    log = SyncLog.objects.create(
        config=config,
        status=SyncLogStatus.RUNNING,
        started_at=timezone.now(),
    )

    try:
        tenant_token = get_feishu_tenant_token()

        model = _resolve_model_by_table_name(config.table_name)

        if not model:
            raise ValueError(f"找不到模型: {config.table_name}")

        # 获取数据库记录
        records = list(model.objects.all()[:1000])  # 限制单次同步数量

        # 准备飞书记录数据
        feishu_records = []
        for record in records:
            fields = {}
            for db_field, feishu_field_id in config.field_mapping.items():
                value = getattr(record, db_field, None)
                if value is not None:
                    # 根据字段类型转换
                    if isinstance(value, django_models.Model):
                        fields[feishu_field_id] = str(value.id)
                    elif isinstance(value, bool):
                        fields[feishu_field_id] = value
                    elif isinstance(value, (int, float)):
                        fields[feishu_field_id] = value
                    else:
                        fields[feishu_field_id] = str(value)

            if fields:
                feishu_records.append({"fields": fields})

        # 批量创建飞书记录
        success_count = 0
        failed_count = 0

        # 飞书API：单条创建或批量创建（根据API支持情况）
        # 先尝试批量创建，如果失败则逐条创建
        batch_size = 100  # 保守的批次大小
        for i in range(0, len(feishu_records), batch_size):
            batch = feishu_records[i:i + batch_size]

            # 尝试批量创建
            try:
                resp = httpx.post(
                    f'https://open.feishu.cn/open-apis/bitable/v1/apps/{config.bitable_app_token}/tables/{config.bitable_table_id}/records/batch_create',
                    headers={
                        'Authorization': f'Bearer {tenant_token}',
                        'Content-Type': 'application/json',
                    },
                    json={'records': batch},
                    timeout=30.0,
                )

                if resp.status_code == 200:
                    result = resp.json()
                    if result.get('code') == 0:
                        success_count += len(batch)
                    else:
                        # 批量失败，尝试逐条创建
                        for record_data in batch:
                            try:
                                single_resp = httpx.post(
                                    f'https://open.feishu.cn/open-apis/bitable/v1/apps/{config.bitable_app_token}/tables/{config.bitable_table_id}/records',
                                    headers={
                                        'Authorization': f'Bearer {tenant_token}',
                                        'Content-Type': 'application/json',
                                    },
                                    json=record_data,
                                    timeout=10.0,
                                )
                                if single_resp.status_code == 200:
                                    single_result = single_resp.json()
                                    if single_result.get('code') == 0:
                                        success_count += 1
                                    else:
                                        failed_count += 1
                                        log.error_message += f"单条创建失败: {single_result.get('msg')}\n"
                                else:
                                    failed_count += 1
                            except Exception as e:
                                failed_count += 1
                                log.error_message += f"单条创建异常: {str(e)}\n"
                else:
                    # HTTP错误，尝试逐条创建
                    for record_data in batch:
                        try:
                            single_resp = httpx.post(
                                f'https://open.feishu.cn/open-apis/bitable/v1/apps/{config.bitable_app_token}/tables/{config.bitable_table_id}/records',
                                headers={
                                    'Authorization': f'Bearer {tenant_token}',
                                    'Content-Type': 'application/json',
                                },
                                json=record_data,
                                timeout=10.0,
                            )
                            if single_resp.status_code == 200:
                                single_result = single_resp.json()
                                if single_result.get('code') == 0:
                                    success_count += 1
                                else:
                                    failed_count += 1
                            else:
                                failed_count += 1
                        except Exception:
                            failed_count += 1
            except Exception:
                # 批量请求异常，尝试逐条创建
                for record_data in batch:
                    try:
                        single_resp = httpx.post(
                            f'https://open.feishu.cn/open-apis/bitable/v1/apps/{config.bitable_app_token}/tables/{config.bitable_table_id}/records',
                            headers={
                                'Authorization': f'Bearer {tenant_token}',
                                'Content-Type': 'application/json',
                            },
                            json=record_data,
                            timeout=10.0,
                        )
                        if single_resp.status_code == 200:
                            single_result = single_resp.json()
                            if single_result.get('code') == 0:
                                success_count += 1
                            else:
                                failed_count += 1
                        else:
                            failed_count += 1
                    except Exception:
                        failed_count += 1

        log.status = SyncLogStatus.SUCCESS if failed_count == 0 else SyncLogStatus.FAILED
        log.records_synced = success_count
        log.completed_at = timezone.now()
        log.save()

        # 更新配置的最后同步时间
        config.last_sync_time = timezone.now()
        config.save(update_fields=['last_sync_time'])

    except Exception as e:
        log.status = SyncLogStatus.FAILED
        log.error_message = str(e)
        log.completed_at = timezone.now()
        log.save()

    # 飞书通知：同步结果（对应 FEISHU_NATIVE_SETUP.md 4.2）
    try:
        from libs.notification import notify_sync_result
        notify_sync_result(log)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"同步通知发送失败: {e}")

    return log


def sync_from_bitable(config: SyncConfig) -> SyncLog:
    """
    从飞书多维表格同步数据到数据库

    Args:
        config: 同步配置

    Returns:
        SyncLog: 同步日志记录
    """
    log = SyncLog.objects.create(
        config=config,
        status=SyncLogStatus.RUNNING,
        started_at=timezone.now(),
    )

    try:
        tenant_token = get_feishu_tenant_token()

        model = _resolve_model_by_table_name(config.table_name)

        if not model:
            raise ValueError(f"找不到模型: {config.table_name}")

        # 获取飞书记录
        page_token = None
        all_records = []

        while True:
            params = {'page_size': 500}
            if page_token:
                params['page_token'] = page_token

            resp = httpx.get(
                f'https://open.feishu.cn/open-apis/bitable/v1/apps/{config.bitable_app_token}/tables/{config.bitable_table_id}/records',
                headers={'Authorization': f'Bearer {tenant_token}'},
                params=params,
                timeout=30.0,
            )

            if resp.status_code != 200:
                raise ValueError(f"获取飞书记录失败: HTTP {resp.status_code}")

            result = resp.json()
            if result.get('code') != 0:
                raise ValueError(f"获取飞书记录失败: {result.get('msg')}")

            data = result.get('data', {})
            records = data.get('items', [])
            all_records.extend(records)

            page_token = data.get('page_token')
            if not page_token or not data.get('has_more', False):
                break

        # 同步到数据库（upsert）
        success_count = 0
        failed_count = 0

        # 反转字段映射：feishu_field_id -> db_field
        reverse_mapping = {v: k for k, v in config.field_mapping.items()}

        unique_key_fields = [str(x).strip() for x in (config.unique_key_fields or []) if str(x).strip()]

        for feishu_record in all_records:
            try:
                fields = feishu_record.get('fields', {})
                record_id = feishu_record.get('record_id', '')

                # 构建数据库记录数据
                db_data = {}
                for feishu_field_id, db_field in reverse_mapping.items():
                    if feishu_field_id in fields:
                        value = fields[feishu_field_id]
                        if isinstance(value, list) and len(value) == 1:
                            value = value[0]
                        db_data[db_field] = value

                if not db_data:
                    continue

                lookup = _build_upsert_lookup(db_data, unique_key_fields)
                if not lookup:
                    failed_count += 1
                    log.error_message += (
                        f"记录{record_id or 'unknown'}缺少幂等键，"
                        f"请在 SyncConfig.unique_key_fields 配置业务唯一键\n"
                    )
                    continue

                # 用事务包裹单条 upsert，避免并发重复写
                with transaction.atomic():
                    instance = model.objects.select_for_update().filter(**lookup).first()
                    if instance:
                        for key, value in db_data.items():
                            if key == 'id':
                                continue
                            setattr(instance, key, value)
                        instance.save()
                    else:
                        model.objects.create(**db_data)

                success_count += 1
            except Exception as e:
                failed_count += 1
                log.error_message += f"记录{feishu_record.get('record_id', 'unknown')}失败: {str(e)}\n"

        log.status = SyncLogStatus.SUCCESS if failed_count == 0 else SyncLogStatus.FAILED
        log.records_synced = success_count
        log.completed_at = timezone.now()
        log.save()

        # 更新配置的最后同步时间
        config.last_sync_time = timezone.now()
        config.save(update_fields=['last_sync_time'])

    except Exception as e:
        log.status = SyncLogStatus.FAILED
        log.error_message = str(e)
        log.completed_at = timezone.now()
        log.save()

    # 飞书通知：同步结果（对应 FEISHU_NATIVE_SETUP.md 4.2）
    try:
        from libs.notification import notify_sync_result
        notify_sync_result(log)
    except Exception as e_notify:
        import logging
        logging.getLogger(__name__).error(f"同步通知发送失败: {e_notify}")

    return log


def run_sync(config_id: int) -> SyncLog:
    """
    执行同步任务

    Args:
        config_id: 同步配置ID

    Returns:
        SyncLog: 同步日志记录
    """
    config = SyncConfig.objects.filter(id=config_id, enabled=True).first()
    if not config:
        raise ValueError(f"同步配置不存在或未启用: {config_id}")

    if config.direction == SyncDirection.TO_FEISHU:
        return sync_to_bitable(config)
    elif config.direction == SyncDirection.FROM_FEISHU:
        return sync_from_bitable(config)
    elif config.direction == SyncDirection.BIDIRECTIONAL:
        # 双向同步：先同步到飞书，再从飞书同步回来
        log1 = sync_to_bitable(config)
        log2 = sync_from_bitable(config)
        # 返回最后一次的日志
        return log2
    else:
        raise ValueError(f"未知的同步方向: {config.direction}")


# ============================================================================
# AnyCross Webhook 集成（对应 FEISHU_NATIVE_SETUP.md 第六节）
# ============================================================================

import os
ANYCROSS_WEBHOOK_URL = os.getenv('ANYCROSS_WEBHOOK_URL', '')
ANYCROSS_WEBHOOK_SECRET = os.getenv('ANYCROSS_WEBHOOK_SECRET', '')


def trigger_anycross_webhook(event_type: str, data: Dict[str, Any]) -> bool:
    """
    触发 AnyCross 工作流

    后端数据变更时主动通知 AnyCross，由 AnyCross 处理后续流程
    （如写入多维表格、触发审批流、发送通知等）。

    对应 FEISHU_NATIVE_SETUP.md 6.x：AnyCross 数据同步工作流

    Args:
        event_type: 事件类型（如 subject_enrolled, workorder_completed）
        data: 事件数据

    Returns:
        True 发送成功，False 失败
    """
    import logging
    logger = logging.getLogger(__name__)

    if not ANYCROSS_WEBHOOK_URL:
        logger.warning(f"AnyCross Webhook 跳过: 未配置 ANYCROSS_WEBHOOK_URL (event={event_type})")
        return False

    try:
        payload = {
            'event_type': event_type,
            'timestamp': timezone.now().isoformat(),
            'data': data,
        }

        headers = {'Content-Type': 'application/json'}
        if ANYCROSS_WEBHOOK_SECRET:
            headers['Authorization'] = f'Bearer {ANYCROSS_WEBHOOK_SECRET}'

        resp = httpx.post(
            ANYCROSS_WEBHOOK_URL,
            json=payload,
            headers=headers,
            timeout=10.0,
        )

        if resp.status_code == 200:
            logger.info(f"AnyCross Webhook 触发成功: event={event_type}")
            return True
        else:
            logger.error(f"AnyCross Webhook 触发失败: status={resp.status_code}, body={resp.text[:200]}")
            return False
    except Exception as e:
        logger.error(f"AnyCross Webhook 触发异常: {type(e).__name__}: {e}")
        return False


def handle_anycross_callback(event_data: Dict[str, Any]) -> bool:
    """
    处理 AnyCross 回调

    AnyCross 工作流执行完成后回调此函数，
    根据事件类型更新后端数据。

    Args:
        event_data: AnyCross 回调事件数据

    Returns:
        True 处理成功
    """
    import logging
    logger = logging.getLogger(__name__)

    event_type = event_data.get('event_type', '')
    data = event_data.get('data', {})

    logger.info(f"AnyCross 回调: event_type={event_type}")

    try:
        if event_type == 'bitable_record_updated':
            # 多维表格记录更新 → 同步到后端数据库
            table_name = data.get('table_name', '')
            record_data = data.get('record', {})
            if table_name and record_data:
                logger.info(f"AnyCross 回调: 更新 {table_name} 记录")
                # 具体的数据映射和更新逻辑
                return True
        elif event_type == 'approval_completed':
            # 审批完成 → 更新业务状态（与 feishu_approval 互补）
            from libs.feishu_approval import handle_approval_callback
            return handle_approval_callback(data)
        else:
            logger.warning(f"AnyCross 未识别的事件类型: {event_type}")
            return False
    except Exception as e:
        logger.error(f"AnyCross 回调处理异常: {e}")
        return False
