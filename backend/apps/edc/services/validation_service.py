"""
CRF 数据验证服务

来源：cn_kis_test edc/services/data_validation_service.py

规则引擎：
- RequiredRule：必填检查
- RangeRule：数值范围检查
- PatternRule：正则表达式检查
- DateRangeRule：日期范围检查
- CrossFieldRule：跨字段逻辑检查
"""
import re
import logging
from datetime import datetime
from typing import List

from apps.edc.models import (
    CRFRecord, CRFValidationRule, CRFValidationResult,
    ValidationRuleType, ValidationSeverity,
)

logger = logging.getLogger(__name__)


class DataValidationService:
    """CRF 数据验证引擎"""

    @classmethod
    def validate_record(cls, record_id: int) -> List[CRFValidationResult]:
        """
        对 CRF 记录执行全部验证规则

        Args:
            record_id: CRFRecord ID

        Returns:
            验证结果列表（仅包含失败项）
        """
        record = CRFRecord.objects.filter(id=record_id).select_related('template').first()
        if not record:
            raise ValueError(f'CRF 记录不存在: id={record_id}')

        # 清除旧的验证结果
        CRFValidationResult.objects.filter(record=record).delete()

        rules = CRFValidationRule.objects.filter(
            template=record.template, is_active=True
        )

        data = record.data or {}
        results = []

        for rule in rules:
            errors = cls._execute_rule(rule, data)
            for err in errors:
                result = CRFValidationResult.objects.create(
                    record=record,
                    rule=rule,
                    field_name=rule.field_name,
                    severity=ValidationSeverity.ERROR,
                    message=err['message'],
                    field_value=str(err.get('value', '')),
                )
                results.append(result)

        logger.info(
            f'CRF 验证完成: record_id={record_id}, '
            f'rules={rules.count()}, errors={len(results)}'
        )
        return results

    @classmethod
    def _execute_rule(cls, rule: CRFValidationRule, data: dict) -> List[dict]:
        """执行单条规则"""
        rule_type = rule.rule_type
        field = rule.field_name
        config = rule.rule_config or {}
        value = data.get(field)

        handler = {
            ValidationRuleType.REQUIRED: cls._check_required,
            ValidationRuleType.RANGE: cls._check_range,
            ValidationRuleType.PATTERN: cls._check_pattern,
            ValidationRuleType.DATE_RANGE: cls._check_date_range,
            ValidationRuleType.CROSS_FIELD: cls._check_cross_field,
        }.get(rule_type)

        if not handler:
            logger.warning(f'未知规则类型: {rule_type}')
            return []

        return handler(field, value, config, data, rule.error_message)

    @classmethod
    def _check_required(cls, field, value, config, data, custom_msg) -> List[dict]:
        """必填检查"""
        if value is None or (isinstance(value, str) and value.strip() == ''):
            return [{'message': custom_msg or f'{field} 为必填项', 'value': value}]
        return []

    @classmethod
    def _check_range(cls, field, value, config, data, custom_msg) -> List[dict]:
        """数值范围检查"""
        if value is None or value == '':
            return []
        try:
            num = float(value)
        except (ValueError, TypeError):
            return [{'message': custom_msg or f'{field} 必须为数字', 'value': value}]

        min_val = config.get('min')
        max_val = config.get('max')

        if min_val is not None and num < float(min_val):
            return [{
                'message': custom_msg or f'{field} 值 {num} 小于最小值 {min_val}',
                'value': value,
            }]
        if max_val is not None and num > float(max_val):
            return [{
                'message': custom_msg or f'{field} 值 {num} 大于最大值 {max_val}',
                'value': value,
            }]
        return []

    @classmethod
    def _check_pattern(cls, field, value, config, data, custom_msg) -> List[dict]:
        """正则表达式检查"""
        if value is None or value == '':
            return []
        pattern = config.get('pattern', '')
        if not pattern:
            return []
        if not re.match(pattern, str(value)):
            return [{
                'message': custom_msg or f'{field} 格式不正确（需匹配 {pattern}）',
                'value': value,
            }]
        return []

    @classmethod
    def _check_date_range(cls, field, value, config, data, custom_msg) -> List[dict]:
        """日期范围检查"""
        if value is None or value == '':
            return []
        try:
            dt = datetime.fromisoformat(str(value))
        except (ValueError, TypeError):
            return [{'message': custom_msg or f'{field} 日期格式不正确', 'value': value}]

        min_date = config.get('min_date')
        max_date = config.get('max_date')

        if min_date:
            try:
                if dt < datetime.fromisoformat(min_date):
                    return [{'message': custom_msg or f'{field} 早于最早日期 {min_date}', 'value': value}]
            except ValueError:
                pass
        if max_date:
            try:
                if dt > datetime.fromisoformat(max_date):
                    return [{'message': custom_msg or f'{field} 晚于最晚日期 {max_date}', 'value': value}]
            except ValueError:
                pass
        return []

    @classmethod
    def _check_cross_field(cls, field, value, config, data, custom_msg) -> List[dict]:
        """
        跨字段逻辑检查

        config 格式：
        {
            "operator": "gt",  // gt/gte/lt/lte/eq/ne
            "compare_field": "start_date"
        }

        示例：结束日期 > 开始日期
        """
        compare_field = config.get('compare_field', '')
        operator = config.get('operator', 'gt')

        if not compare_field:
            return []

        compare_value = data.get(compare_field)
        if value is None or compare_value is None:
            return []

        try:
            # 尝试数值比较
            v1 = float(value) if not isinstance(value, (int, float)) else value
            v2 = float(compare_value) if not isinstance(compare_value, (int, float)) else compare_value
        except (ValueError, TypeError):
            # 字符串比较（日期等）
            v1 = str(value)
            v2 = str(compare_value)

        ops = {
            'gt': lambda a, b: a > b,
            'gte': lambda a, b: a >= b,
            'lt': lambda a, b: a < b,
            'lte': lambda a, b: a <= b,
            'eq': lambda a, b: a == b,
            'ne': lambda a, b: a != b,
        }

        check = ops.get(operator)
        if not check:
            return []

        if not check(v1, v2):
            op_display = {
                'gt': '大于', 'gte': '大于等于', 'lt': '小于',
                'lte': '小于等于', 'eq': '等于', 'ne': '不等于',
            }
            return [{
                'message': (
                    custom_msg or
                    f'{field} 必须{op_display.get(operator, operator)} {compare_field}'
                ),
                'value': value,
            }]
        return []
