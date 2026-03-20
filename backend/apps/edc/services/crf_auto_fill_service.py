"""
F5: 检测数据 → eCRF 自动映射服务

工作原理：
1. InstrumentDetection 完成后调用 auto_fill_crf_from_detection(detection_id)
2. 查找关联的 InstrumentInterface.mapping 配置
3. 按映射规则从 InstrumentDetection.result_values 提取字段
4. 创建或更新对应的 CRFRecord（status=draft，data_source=instrument_auto）

映射配置格式（存于 InstrumentInterface.mapping）：
{
    "instrument_type": "Corneometer",
    "crf_template_id": 1,          // 可选，不填则从工单推断
    "field_mappings": [
        {
            "source_key": "result_values.moisture_value",  // 点路径，支持嵌套
            "target_crf_field": "skin_moisture_au",
            "unit": "AU",                                  // 可选，用于验证
            "precision": 2,                               // 可选，浮点精度
            "transform": "round"                          // 可选：round / int / str / abs
        }
    ]
}
"""
import logging

from django.db import transaction

logger = logging.getLogger(__name__)


@transaction.atomic
def auto_fill_crf_from_detection(detection_id: int) -> dict:
    """
    检测完成后自动创建/更新 CRFRecord

    验收标准：
    1. CRFRecord 自动创建，data 包含映射字段，status='draft'，data_source='instrument_auto'
    2. 无映射配置时不创建 CRF（不报错），返回 skipped=True
    3. 同一工单同模板重复检测时更新已有记录
    4. 浮点精度到小数点后2位

    Returns:
        {"created": bool, "skipped": bool, "crf_record_id": int, "mapped_fields": dict}
    """
    from apps.workorder.models_execution import InstrumentDetection
    from apps.edc.models import CRFRecord, CRFRecordStatus, InstrumentInterface

    try:
        detection = InstrumentDetection.objects.select_related('work_order').get(pk=detection_id)
    except InstrumentDetection.DoesNotExist:
        return {'error': f'检测记录 {detection_id} 不存在'}

    if detection.is_voided:
        return {'skipped': True, 'reason': '检测记录已作废'}

    # 查找匹配的 InstrumentInterface 配置
    interface = _find_instrument_interface(detection)
    if not interface:
        logger.debug(f'检测 #{detection_id} 无对应的仪器接口映射配置，跳过 CRF 自动填充')
        return {'skipped': True, 'reason': '无仪器接口映射配置'}

    mapping_config = interface.mapping
    if not mapping_config or not mapping_config.get('field_mappings'):
        return {'skipped': True, 'reason': '映射配置为空'}

    # 解析并应用映射规则
    mapped_fields, mapping_errors = _apply_mapping_rules(
        result_values=detection.result_values or {},
        raw_data=detection.raw_data or {},
        processed_data=detection.processed_data or {},
        field_mappings=mapping_config.get('field_mappings', []),
    )

    if not mapped_fields:
        return {
            'skipped': True,
            'reason': '映射后无有效字段',
            'mapping_errors': mapping_errors,
        }

    # 确定 CRF 模板
    crf_template = _resolve_crf_template(detection, mapping_config)
    if not crf_template:
        return {'skipped': True, 'reason': '无法确定目标 CRF 模板'}

    # 查找或创建 CRFRecord（同一工单+同模板只保留一条，更新已有）
    existing_record = CRFRecord.objects.filter(
        work_order=detection.work_order,
        template=crf_template,
        data_source='instrument_auto',
    ).first()

    if existing_record:
        # 更新已有记录（合并字段值）
        merged_data = {**(existing_record.data or {}), **mapped_fields}
        existing_record.data = merged_data
        existing_record.source_detection_id = detection.id
        existing_record.save(update_fields=['data', 'source_detection_id', 'update_time'])
        logger.info(f'CRFRecord #{existing_record.id} 已更新（来自检测 #{detection_id}）')
        return {
            'created': False,
            'updated': True,
            'skipped': False,
            'crf_record_id': existing_record.id,
            'mapped_fields': mapped_fields,
            'mapping_errors': mapping_errors,
        }
    else:
        # 创建新记录
        new_record = CRFRecord.objects.create(
            template=crf_template,
            work_order=detection.work_order,
            data=mapped_fields,
            status=CRFRecordStatus.DRAFT,
            data_source='instrument_auto',
            source_detection_id=detection.id,
        )
        logger.info(f'CRFRecord #{new_record.id} 已创建（来自检测 #{detection_id}）')
        return {
            'created': True,
            'updated': False,
            'skipped': False,
            'crf_record_id': new_record.id,
            'mapped_fields': mapped_fields,
            'mapping_errors': mapping_errors,
        }


def preview_crf_mapping(detection_id: int) -> dict:
    """
    预览检测数据将被映射到哪些 CRF 字段（不创建任何记录）

    验收标准：
    - 返回预览数据，前端可展示"将同步到 eCRF 的字段"
    """
    from apps.workorder.models_execution import InstrumentDetection
    from apps.edc.models import InstrumentInterface

    try:
        detection = InstrumentDetection.objects.select_related('work_order').get(pk=detection_id)
    except InstrumentDetection.DoesNotExist:
        return {'error': f'检测记录 {detection_id} 不存在'}

    interface = _find_instrument_interface(detection)
    if not interface or not interface.mapping:
        return {
            'has_mapping': False,
            'reason': '无仪器接口映射配置，数据不会自动同步到 eCRF',
        }

    mapping_config = interface.mapping
    field_mappings = mapping_config.get('field_mappings', [])

    preview_fields = []
    for rule in field_mappings:
        source_key = rule.get('source_key', '')
        target_field = rule.get('target_crf_field', '')
        current_value = _extract_value(
            source_key=source_key,
            result_values=detection.result_values or {},
            raw_data=detection.raw_data or {},
            processed_data=detection.processed_data or {},
        )
        preview_fields.append({
            'source_key': source_key,
            'target_crf_field': target_field,
            'current_value': current_value,
            'unit': rule.get('unit', ''),
            'will_be_mapped': current_value is not None,
        })

    crf_template = _resolve_crf_template(detection, mapping_config)

    return {
        'has_mapping': True,
        'detection_id': detection_id,
        'crf_template_id': crf_template.id if crf_template else None,
        'crf_template_name': crf_template.name if crf_template else None,
        'field_count': len([f for f in preview_fields if f['will_be_mapped']]),
        'fields': preview_fields,
    }


# ============================================================================
# 辅助函数
# ============================================================================

def _find_instrument_interface(detection):
    """根据检测记录找到对应的 InstrumentInterface 配置"""
    from apps.edc.models import InstrumentInterface

    # 方式1：通过 detection.detection_method 名称匹配
    if detection.detection_name:
        iface = InstrumentInterface.objects.filter(
            name__icontains=detection.detection_name,
            is_active=True,
        ).first()
        if iface:
            return iface

    # 方式2：通过工单关联的活动模板查找
    try:
        if detection.work_order and detection.work_order.visit_activity:
            activity = detection.work_order.visit_activity
            if hasattr(activity, 'activity_template_id'):
                iface = InstrumentInterface.objects.filter(
                    activity_template_id=activity.activity_template_id,
                    is_active=True,
                ).first()
                if iface:
                    return iface
    except Exception:
        pass

    # 方式3：通过关联设备
    if detection.equipment_id:
        iface = InstrumentInterface.objects.filter(
            equipment_id=detection.equipment_id,
            is_active=True,
        ).first()
        if iface:
            return iface

    return None


def _extract_value(
    source_key: str,
    result_values: dict,
    raw_data: dict,
    processed_data: dict,
) -> object:
    """
    从数据源中提取字段值，支持点路径

    source_key 格式：
    - "result_values.moisture_value"  → 从 result_values 中取 moisture_value
    - "raw_data.ch1"                  → 从 raw_data 中取 ch1
    - "processed_data.avg"            → 从 processed_data 中取 avg
    - "moisture_value"                → 直接从 result_values 中取（默认）
    """
    parts = source_key.split('.')
    if len(parts) >= 2:
        source_name = parts[0]
        field_path = parts[1:]
        if source_name == 'result_values':
            data = result_values
        elif source_name == 'raw_data':
            data = raw_data
        elif source_name == 'processed_data':
            data = processed_data
        else:
            data = result_values
            field_path = parts  # 整个 key 视作路径
    else:
        data = result_values
        field_path = parts

    # 递归提取嵌套路径
    current = data
    for key in field_path:
        if isinstance(current, dict):
            current = current.get(key)
            if current is None:
                return None
        else:
            return None
    return current


def _apply_transform(value, transform: str, precision: int) -> object:
    """应用字段转换规则"""
    if value is None:
        return None
    try:
        if transform == 'round' or (transform is None and isinstance(value, float)):
            return round(float(value), precision)
        elif transform == 'int':
            return int(float(value))
        elif transform == 'str':
            return str(value)
        elif transform == 'abs':
            return abs(float(value))
        else:
            if isinstance(value, float):
                return round(value, precision)
            return value
    except (ValueError, TypeError):
        return value


def _apply_mapping_rules(
    result_values: dict,
    raw_data: dict,
    processed_data: dict,
    field_mappings: list,
) -> tuple:
    """
    应用映射规则，返回 (mapped_fields: dict, errors: list)

    验收标准：浮点精度到小数点后2位
    """
    mapped = {}
    errors = []

    for rule in field_mappings:
        source_key = rule.get('source_key', '')
        target_field = rule.get('target_crf_field', '')
        transform = rule.get('transform')
        precision = rule.get('precision', 2)

        if not source_key or not target_field:
            errors.append(f'无效映射规则：{rule}')
            continue

        raw_value = _extract_value(
            source_key=source_key,
            result_values=result_values,
            raw_data=raw_data,
            processed_data=processed_data,
        )

        if raw_value is None:
            errors.append(f'源字段 {source_key} 无数据')
            continue

        final_value = _apply_transform(raw_value, transform, precision)
        mapped[target_field] = final_value

    return mapped, errors


def _resolve_crf_template(detection, mapping_config: dict):
    """确定目标 CRF 模板"""
    from apps.edc.models import CRFTemplate

    # 方式1：映射配置中直接指定
    template_id = mapping_config.get('crf_template_id')
    if template_id:
        try:
            return CRFTemplate.objects.get(pk=template_id)
        except CRFTemplate.DoesNotExist:
            pass

    # 方式2：从工单关联的访视活动推断
    try:
        if detection.work_order and detection.work_order.visit_activity:
            activity = detection.work_order.visit_activity
            # 查找与该活动关联的 CRF 模板
            if hasattr(activity, 'activity_template_id'):
                template = CRFTemplate.objects.filter(
                    activity_template_id=activity.activity_template_id,
                ).first()
                if template:
                    return template
    except Exception:
        pass

    # 方式3：从 InstrumentInterface 关联的模板
    if hasattr(detection, 'detection_name'):
        template = CRFTemplate.objects.filter(
            name__icontains=mapping_config.get('instrument_type', detection.detection_name),
        ).first()
        if template:
            return template

    return None
