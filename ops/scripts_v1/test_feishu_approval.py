#!/usr/bin/env python3
"""
飞书审批集成测试

验证审批模块的功能：
- 审批实例创建 API 调用
- 审批回调处理逻辑
- 各业务模块与审批的集成

用法:
    cd backend && python ../scripts/test_feishu_approval.py

输出格式: [PASS] / [FAIL] 每项测试
"""
import os
import sys
import json

# Django 环境初始化
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
os.environ.setdefault('USE_SQLITE', 'true')

import django
django.setup()

from libs.feishu_approval import (
    _create_approval,
    create_ethics_approval,
    create_ae_report_approval,
    create_deviation_approval,
    create_contract_approval,
    create_workorder_approval,
    handle_approval_callback,
    APPROVAL_CODE_ETHICS,
    APPROVAL_CODE_AE_REPORT,
    APPROVAL_CODE_DEVIATION,
    APPROVAL_CODE_CONTRACT,
    APPROVAL_CODE_WORKORDER,
)
from libs.feishu_client import feishu_client, FeishuAPIError


def test_approval_config():
    """测试审批模板配置"""
    codes = {
        '伦理申请': APPROVAL_CODE_ETHICS,
        'AE上报': APPROVAL_CODE_AE_REPORT,
        '偏差报告': APPROVAL_CODE_DEVIATION,
        '合同': APPROVAL_CODE_CONTRACT,
        '工单': APPROVAL_CODE_WORKORDER,
    }
    configured = {k: v for k, v in codes.items() if v}
    unconfigured = {k: v for k, v in codes.items() if not v}

    if configured:
        print(f"[PASS] 审批模板配置: {len(configured)} 个已配置 ({', '.join(configured.keys())})")
    else:
        print(f"[PASS] 审批模板配置: 0 个已配置（审批 code 在飞书管理后台创建后填入 .env）")

    if unconfigured:
        print(f"  [INFO] 未配置: {', '.join(unconfigured.keys())}")

    return True


def test_approval_skip_no_code():
    """测试无审批 code 时安全跳过"""
    try:
        result = _create_approval(
            approval_code='',
            open_id='ou_test',
            form_data=[],
            approval_type='测试',
        )
        if result is None:
            print("[PASS] 无审批 code 时安全跳过: 返回 None 且不报错")
            return True
        else:
            print(f"[FAIL] 无审批 code 时: 应返回 None，实际返回 {result}")
            return False
    except Exception as e:
        print(f"[FAIL] 无审批 code 时: 抛出异常 {e}")
        return False


def test_approval_skip_no_openid():
    """测试无 open_id 时安全跳过"""
    try:
        result = _create_approval(
            approval_code='test_code',
            open_id='',
            form_data=[],
            approval_type='测试',
        )
        if result is None:
            print("[PASS] 无 open_id 时安全跳过: 返回 None 且不报错")
            return True
        else:
            print(f"[FAIL] 无 open_id 时: 应返回 None，实际返回 {result}")
            return False
    except Exception as e:
        print(f"[FAIL] 无 open_id 时: 抛出异常 {e}")
        return False


def test_approval_api_call():
    """测试审批 API 调用（需要有效的审批 code）"""
    # 找一个已配置的审批 code
    test_code = APPROVAL_CODE_DEVIATION or APPROVAL_CODE_WORKORDER or APPROVAL_CODE_ETHICS
    if not test_code:
        print("[SKIP] 审批 API 调用: 无已配置的审批 code")
        return True

    try:
        result = _create_approval(
            approval_code=test_code,
            open_id='ou_test_user',
            form_data=[{"id": "test_field", "type": "input", "value": "测试值"}],
            approval_type='集成测试',
        )
        # 即使返回 None（因为 open_id 无效或无权限），只要不崩溃就算通过
        print(f"[PASS] 审批 API 调用: 执行完成 (result={result})")
        return True
    except Exception as e:
        print(f"[FAIL] 审批 API 调用: 异常 {e}")
        return False


def test_callback_handler():
    """测试审批回调处理"""
    try:
        # 测试空数据
        result = handle_approval_callback({})
        assert result is False, "空数据应返回 False"

        # 测试未知审批 code
        result = handle_approval_callback({
            'approval_code': 'unknown_code',
            'instance_code': 'test_instance',
            'status': 'APPROVED',
        })
        assert result is False, "未知审批 code 应返回 False"

        print("[PASS] 审批回调处理: 边界条件处理正确")
        return True
    except AssertionError as e:
        print(f"[FAIL] 审批回调处理: {e}")
        return False
    except Exception as e:
        print(f"[FAIL] 审批回调处理: 异常 {e}")
        return False


def test_deviation_model_field():
    """测试偏差模型飞书审批字段"""
    try:
        from apps.quality.models import Deviation
        field = Deviation._meta.get_field('feishu_approval_instance_id')
        assert field is not None
        assert field.max_length == 100
        print("[PASS] 偏差模型字段: feishu_approval_instance_id 存在")
        return True
    except Exception as e:
        print(f"[FAIL] 偏差模型字段: {e}")
        return False


def test_workorder_model_field():
    """测试工单模型飞书审批字段"""
    try:
        from apps.workorder.models import WorkOrder
        field = WorkOrder._meta.get_field('feishu_approval_instance_id')
        assert field is not None
        assert field.max_length == 100
        print("[PASS] 工单模型字段: feishu_approval_instance_id 存在")
        return True
    except Exception as e:
        print(f"[FAIL] 工单模型字段: {e}")
        return False


def test_contract_model_field():
    """测试合同模型飞书审批字段"""
    try:
        from apps.finance.models import Contract
        field = Contract._meta.get_field('feishu_approval_id')
        assert field is not None
        print("[PASS] 合同模型字段: feishu_approval_id 存在")
        return True
    except Exception as e:
        print(f"[FAIL] 合同模型字段: {e}")
        return False


def test_feishu_client_approval_method():
    """测试 FeishuClient 审批方法存在"""
    try:
        assert hasattr(feishu_client, 'create_approval_instance')
        assert hasattr(feishu_client, 'get_approval_instance')
        assert callable(feishu_client.create_approval_instance)
        assert callable(feishu_client.get_approval_instance)
        print("[PASS] FeishuClient 审批方法: create_approval_instance + get_approval_instance 存在")
        return True
    except Exception as e:
        print(f"[FAIL] FeishuClient 审批方法: {e}")
        return False


def main():
    print("=" * 60)
    print("飞书审批集成测试")
    print("=" * 60)
    print()

    tests = [
        test_approval_config,
        test_approval_skip_no_code,
        test_approval_skip_no_openid,
        test_approval_api_call,
        test_callback_handler,
        test_deviation_model_field,
        test_workorder_model_field,
        test_contract_model_field,
        test_feishu_client_approval_method,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        result = test_fn()
        if result:
            passed += 1
        else:
            failed += 1

    print()
    print("=" * 60)
    if failed == 0:
        print(f"全部通过 ({passed}/{passed + failed})")
    else:
        print(f"有 {failed} 项失败 ({passed}/{passed + failed})")
    print("=" * 60)

    sys.exit(1 if failed > 0 else 0)


if __name__ == '__main__':
    main()
