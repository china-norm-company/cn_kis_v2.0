"""
二维码生成与解析服务

使用 hashlib 生成唯一短哈希，结合系统 URL 构成完整二维码内容。
支持单个生成和批量生成。

实体类型：
- subject:   受试者（一人一码，终身有效）
- station:   场所/工位（半永久，受试者自助签到用）
- sample:    样品（一管一码）
- asset:     资产，包含设备与耗材
- workorder: 工单
"""
import hashlib
import logging
from typing import Optional, List
from django.conf import settings

from .models import QRCodeRecord, EntityType, ScanAuditLog, ScanAction

logger = logging.getLogger(__name__)

BASE_URL = getattr(settings, 'QR_BASE_URL', 'https://kis.example.com')


def _generate_hash(entity_type: str, entity_id: int) -> str:
    """生成实体的唯一短哈希"""
    raw = f'cn-kis:{entity_type}:{entity_id}'
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _get_entity_label(entity_type: str, entity_id: int) -> str:
    """获取实体的显示标签"""
    try:
        if entity_type == EntityType.SUBJECT:
            from apps.subject.models import Subject
            sub = Subject.objects.filter(id=entity_id).first()
            if sub:
                return sub.name[:1] + '**' if sub.name else f'受试者#{entity_id}'
        elif entity_type == EntityType.STATION:
            return f'签到点#{entity_id}'
        elif entity_type in (EntityType.ASSET, 'equipment'):
            try:
                from apps.resource.models import ResourceItem
                item = ResourceItem.objects.filter(id=entity_id).first()
                if item:
                    return f'{item.name}({item.code})'
            except Exception:
                pass
            return f'资产#{entity_id}'
        elif entity_type == EntityType.SAMPLE:
            from apps.sample.models import Sample
            s = Sample.objects.filter(id=entity_id).first()
            if s:
                return f'样品#{s.code}' if hasattr(s, 'code') else f'样品#{entity_id}'
        elif entity_type == EntityType.WORKORDER:
            from apps.workorder.models import WorkOrder
            wo = WorkOrder.objects.filter(id=entity_id).first()
            if wo:
                return f'WO#{wo.id}: {wo.title[:20]}'
    except Exception as e:
        logger.warning(f'获取实体标签失败: {entity_type}#{entity_id}: {e}')
    return f'{entity_type}#{entity_id}'


def generate_qrcode(entity_type: str, entity_id: int, generated_by: int = None) -> dict:
    """
    为指定实体生成二维码记录。如果已存在则返回已有记录。
    """
    existing = QRCodeRecord.objects.filter(
        entity_type=entity_type, entity_id=entity_id, is_active=True,
    ).first()
    if existing:
        return _record_to_dict(existing)

    qr_hash = _generate_hash(entity_type, entity_id)
    qr_data = f'{BASE_URL}/qr/{qr_hash}'
    label = _get_entity_label(entity_type, entity_id)

    record = QRCodeRecord.objects.create(
        entity_type=entity_type,
        entity_id=entity_id,
        qr_data=qr_data,
        qr_hash=qr_hash,
        label=label,
        generated_by=generated_by,
    )
    return _record_to_dict(record)


def batch_generate(entity_type: str, entity_ids: List[int], generated_by: int = None) -> List[dict]:
    """批量生成二维码"""
    results = []
    for eid in entity_ids:
        try:
            result = generate_qrcode(entity_type, eid, generated_by)
            results.append(result)
        except Exception as e:
            logger.error(f'批量生成二维码失败: {entity_type}#{eid}: {e}')
            results.append({'entity_type': entity_type, 'entity_id': eid, 'error': str(e)})
    return results


def resolve_qrcode(qr_hash: str) -> Optional[dict]:
    """
    解析二维码哈希，返回关联的实体信息。
    扫码后调用此方法获取实体类型和相关信息。
    """
    normalized_hash = _extract_hash(qr_hash)
    record = QRCodeRecord.objects.filter(qr_hash=normalized_hash, is_active=True).first()
    if not record:
        return None

    result = _record_to_dict(record)

    try:
        if record.entity_type == EntityType.SUBJECT:
            from apps.subject.models import Subject
            sub = Subject.objects.filter(id=record.entity_id).first()
            if sub:
                result['entity_detail'] = {
                    'id': sub.id,
                    'name': sub.name[:1] + '**' if sub.name else '',
                    'skin_type': sub.skin_type,
                    'risk_level': sub.risk_level,
                    'gender': sub.gender,
                }
                from apps.workorder.models import WorkOrder
                from datetime import date
                today_wos = WorkOrder.objects.filter(
                    is_deleted=False,
                    enrollment__subject_id=sub.id,
                    scheduled_date=date.today(),
                ).values('id', 'title', 'status', 'enrollment_id')
                result['today_work_orders'] = list(today_wos)

        elif record.entity_type == EntityType.STATION:
            result['entity_detail'] = {
                'id': record.entity_id,
                'label': record.label,
                'station_type': 'reception',
            }

        elif record.entity_type in (EntityType.ASSET, 'equipment'):
            try:
                from apps.resource.models import ResourceItem
                item = ResourceItem.objects.filter(id=record.entity_id).first()
                if item:
                    result['entity_detail'] = {
                        'id': item.id,
                        'name': item.name,
                        'code': item.code,
                        'status': item.status,
                        'next_calibration_date': str(item.next_calibration_date) if item.next_calibration_date else None,
                    }
            except Exception:
                pass

        elif record.entity_type == EntityType.SAMPLE:
            try:
                from apps.sample.models import Sample
                s = Sample.objects.filter(id=record.entity_id).first()
                if s:
                    result['entity_detail'] = {
                        'id': s.id,
                        'code': getattr(s, 'code', ''),
                        'status': getattr(s, 'status', ''),
                    }
            except Exception:
                pass

    except Exception as e:
        logger.warning(f'获取实体详情失败: {e}')

    return result


def smart_resolve(qr_hash: str, scanner_role: str, workstation: str, scanner_id: int = None) -> Optional[dict]:
    """
    情境感知解析：根据扫码人角色和当前工作台，返回推荐动作。

    recommended_action 取值：
    - checkin:           签到（接待员 → 受试者未签到）
    - checkout:          签出（接待员 → 受试者已签到）
    - jump_to_workorder: 跳转工单（评估员/CRC → 受试者有唯一今日工单）
    - show_workorder_list: 展示工单列表（有多个工单）
    - show_profile:      展示受试者档案（无工单或通用场景）
    - station_checkin:   场所码签到（受试者扫场所码）
    - record_ae:         上报不良反应
    - record_dropout:    记录脱落
    - stipend_pay:       礼金发放确认
    - asset_use:         资产使用登记
    - sample_collect:    样品采集
    - material_issue:    物料出库
    - unknown:           未知场景，展示原始信息
    """
    entity = resolve_qrcode(qr_hash)
    if not entity:
        return None

    entity_type = entity.get('entity_type', '')
    today_wos = entity.get('today_work_orders', [])

    action = 'unknown'
    action_data: dict = {}
    alternative_actions: list = []

    if entity_type == EntityType.SUBJECT:
        if workstation == 'reception' or scanner_role in ('receptionist', 'reception_staff'):
            checkin_info = _get_subject_checkin_status(entity.get('entity_id'))
            if checkin_info['status'] == 'checked_in':
                action = 'checkout'
                action_data = {
                    'subject_id': entity['entity_id'],
                    'checkin_id': checkin_info['checkin_id'],
                }
                alternative_actions = ['show_profile']
            else:
                action = 'checkin'
                action_data = {'subject_id': entity['entity_id']}
                alternative_actions = ['show_profile']

        elif workstation in ('evaluator', 'execution') or scanner_role in ('evaluator', 'crc'):
            if len(today_wos) == 1:
                action = 'jump_to_workorder'
                action_data = {'work_order_id': today_wos[0]['id'], 'subject_id': entity['entity_id']}
                alternative_actions = ['show_profile', 'record_ae']
            elif len(today_wos) > 1:
                action = 'show_workorder_list'
                action_data = {'subject_id': entity['entity_id'], 'work_orders': today_wos}
                alternative_actions = ['show_profile', 'record_ae']
            else:
                action = 'show_profile'
                action_data = {'subject_id': entity['entity_id']}
                alternative_actions = ['record_ae', 'record_dropout']

        elif workstation == 'finance' or scanner_role == 'finance_staff':
            action = 'stipend_pay'
            action_data = {'subject_id': entity['entity_id']}
            alternative_actions = ['show_profile']

        elif workstation == 'recruitment' or scanner_role == 'recruiter':
            action = 'show_profile'
            action_data = {'subject_id': entity['entity_id']}
            alternative_actions = ['record_dropout']

        elif workstation == 'execution' or scanner_role == 'crc':
            action = 'sample_collect'
            action_data = {'subject_id': entity['entity_id']}
            alternative_actions = ['show_profile', 'record_ae', 'record_dropout']

        else:
            action = 'show_profile'
            action_data = {'subject_id': entity['entity_id']}
            alternative_actions = ['record_ae']

    elif entity_type == EntityType.STATION:
        action = 'station_checkin'
        action_data = {'station_id': entity['entity_id'], 'station_label': entity.get('label', '')}

    elif entity_type in (EntityType.ASSET, 'equipment'):
        if workstation in ('evaluator', 'execution'):
            action = 'asset_use'
        elif workstation == 'material':
            action = 'material_issue'
        else:
            action = 'asset_use'
        action_data = {'asset_id': entity['entity_id']}

    elif entity_type == EntityType.SAMPLE:
        action = 'sample_collect'
        action_data = {'sample_id': entity['entity_id']}

    elif entity_type == EntityType.WORKORDER:
        action = 'jump_to_workorder'
        action_data = {'work_order_id': entity['entity_id']}

    log_scan_event(
        qr_record_id=entity.get('id'),
        scanner_id=scanner_id,
        workstation=workstation,
        action=action,
    )

    return {
        'entity': entity,
        'recommended_action': action,
        'action_data': action_data,
        'alternative_actions': alternative_actions,
    }


def _get_subject_checkin_status(subject_id: int) -> dict:
    """获取受试者今日签到状态，返回状态和 checkin_id"""
    try:
        from apps.subject.models import SubjectCheckin
        from django.utils import timezone
        today = timezone.localdate()
        checkin = SubjectCheckin.objects.filter(
            subject_id=subject_id, checkin_date=today,
        ).exclude(status='checked_out').first()
        if checkin:
            return {'status': 'checked_in', 'checkin_id': checkin.id}
        return {'status': 'not_checked_in', 'checkin_id': None}
    except Exception:
        return {'status': 'unknown', 'checkin_id': None}


def log_scan_event(
    qr_record_id: int = None,
    scanner_id: int = None,
    workstation: str = '',
    action: str = ScanAction.RESOLVE,
    ip_address: str = None,
    extra: dict = None,
) -> None:
    """记录扫码审计日志。不抛出异常，确保主流程不受影响。"""
    try:
        qr_record = QRCodeRecord.objects.filter(id=qr_record_id).first() if qr_record_id else None
        ScanAuditLog.objects.create(
            qr_record=qr_record,
            scanner_id=scanner_id,
            workstation=workstation,
            action=action,
            ip_address=ip_address,
            extra=extra or {},
        )
    except Exception as e:
        logger.warning(f'记录扫码日志失败: {e}')


def deactivate_qrcode(record_id: int) -> Optional[dict]:
    """停用二维码"""
    record = QRCodeRecord.objects.filter(id=record_id).first()
    if not record:
        return None
    record.is_active = False
    record.save(update_fields=['is_active'])
    return _record_to_dict(record)


def reactivate_qrcode(record_id: int) -> Optional[dict]:
    """启用二维码"""
    record = QRCodeRecord.objects.filter(id=record_id).first()
    if not record:
        return None
    record.is_active = True
    record.save(update_fields=['is_active'])
    return _record_to_dict(record)


def regenerate_qrcode(record_id: int, generated_by: int = None) -> Optional[dict]:
    """重置二维码数据：保留实体关联，刷新 hash/data，旧码立即失效。"""
    record = QRCodeRecord.objects.filter(id=record_id).first()
    if not record:
        return None
    seed = f'{record.entity_type}:{record.entity_id}:{record.create_time.isoformat()}:{generated_by or 0}'
    new_hash = hashlib.sha256(seed.encode()).hexdigest()[:16]
    record.qr_hash = new_hash
    record.qr_data = f'{BASE_URL}/qr/{new_hash}'
    record.is_active = True
    record.generated_by = generated_by
    record.save(update_fields=['qr_hash', 'qr_data', 'is_active', 'generated_by'])
    return _record_to_dict(record)


def _extract_hash(raw: str) -> str:
    """兼容 hash 或 URL 输入。"""
    value = (raw or '').strip()
    if '/qr/' in value:
        return value.rstrip('/').split('/qr/')[-1]
    return value


def _record_to_dict(record: QRCodeRecord) -> dict:
    return {
        'id': record.id,
        'entity_type': record.entity_type,
        'entity_id': record.entity_id,
        'qr_data': record.qr_data,
        'qr_hash': record.qr_hash,
        'label': record.label,
        'is_active': record.is_active,
        'create_time': record.create_time.isoformat(),
    }


# ============================================================================
# 当日动态场所签到码
# ============================================================================
_DAILY_QR_SECRET = None


def _get_daily_qr_secret() -> str:
    """从 Django settings 读取每日签到码 HMAC 密钥，缺省使用固定盐。"""
    global _DAILY_QR_SECRET
    if _DAILY_QR_SECRET is None:
        try:
            from django.conf import settings
            _DAILY_QR_SECRET = str(getattr(settings, 'DAILY_QR_HMAC_SECRET', 'cn-kis-daily-qr-2026'))
        except Exception:
            _DAILY_QR_SECRET = 'cn-kis-daily-qr-2026'
    return _DAILY_QR_SECRET


def generate_daily_station_qr_content(station_id: int, valid_date: str = None) -> str:
    """生成当日有效的场所签到码内容（格式：ckiss-station:{id}:{YYYYMMDD}:{hmac8}）。
    valid_date: YYYY-MM-DD 格式，缺省为今日。
    """
    import hmac as _hmac
    from django.utils import timezone
    today_str = valid_date or str(timezone.localdate())
    date_nodash = today_str.replace('-', '')
    secret = _get_daily_qr_secret()
    mac = _hmac.new(secret.encode(), f'station:{station_id}:{date_nodash}'.encode(), 'sha256').hexdigest()[:8]
    return f'ckiss-station:{station_id}:{date_nodash}:{mac}'


def parse_daily_station_qr_content(content: str) -> dict:
    """解析当日场所签到码，返回 {'station_id', 'valid_date', 'is_valid'} 或 None。
    格式：ckiss-station:{id}:{YYYYMMDD}:{hmac8}
    """
    import hmac as _hmac
    from django.utils import timezone
    content = (content or '').strip()
    if not content.startswith('ckiss-station:'):
        return None
    parts = content.split(':')
    if len(parts) != 4:
        return None
    try:
        _, station_id_str, date_nodash, provided_mac = parts
        station_id = int(station_id_str)
        secret = _get_daily_qr_secret()
        expected_mac = _hmac.new(secret.encode(), f'station:{station_id}:{date_nodash}'.encode(), 'sha256').hexdigest()[:8]
        if not _hmac.compare_digest(provided_mac, expected_mac):
            return {'station_id': station_id, 'valid_date': date_nodash, 'is_valid': False, 'reason': 'mac_mismatch'}
        today_nodash = str(timezone.localdate()).replace('-', '')
        is_today = (date_nodash == today_nodash)
        valid_date_formatted = f'{date_nodash[:4]}-{date_nodash[4:6]}-{date_nodash[6:8]}'
        return {
            'station_id': station_id,
            'valid_date': valid_date_formatted,
            'is_valid': is_today,
            'reason': 'ok' if is_today else 'expired',
        }
    except Exception:
        return None
