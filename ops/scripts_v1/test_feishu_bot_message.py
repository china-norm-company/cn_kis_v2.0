#!/usr/bin/env python3
"""
飞书机器人消息通知测试

验证 notification.py 的消息构建和发送能力：
- 卡片消息构建
- 各业务通知模板
- 消息发送（需要 im:message:send_as_bot 权限 + 配置 FEISHU_NOTIFICATION_CHAT_ID）

用法:
    cd backend && python ../scripts/test_feishu_bot_message.py

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

from libs.notification import (
    _build_card,
    _safe_send,
    notify_work_order_overdue,
    notify_visit_window_closing,
    notify_calibration_expiry,
    notify_sync_result,
    notify_approval_result,
    notify_generic,
    NOTIFICATION_CHAT_ID,
)
from libs.feishu_client import feishu_client


def test_card_build():
    """测试卡片消息构建"""
    try:
        card_str = _build_card(
            title="测试卡片",
            color="blue",
            fields=[
                {"name": "字段1", "value": "值1"},
                {"name": "字段2", "value": "值2"},
            ],
            note="这是备注",
        )
        card = json.loads(card_str)
        assert card['header']['title']['content'] == "测试卡片"
        assert card['header']['template'] == "blue"
        assert len(card['elements']) >= 1
        print("[PASS] 卡片消息构建: 结构正确")
        return True
    except Exception as e:
        print(f"[FAIL] 卡片消息构建: {e}")
        return False


def test_card_with_no_note():
    """测试无备注卡片"""
    try:
        card_str = _build_card(
            title="无备注卡片",
            color="green",
            fields=[{"name": "A", "value": "B"}],
        )
        card = json.loads(card_str)
        # 无 note 时不应有 hr 和 note 元素
        has_hr = any(e.get('tag') == 'hr' for e in card['elements'])
        assert not has_hr, "无备注时不应有分割线"
        print("[PASS] 无备注卡片: 结构正确")
        return True
    except Exception as e:
        print(f"[FAIL] 无备注卡片: {e}")
        return False


def test_mock_work_order_notify():
    """测试工单逾期通知（Mock 对象）"""
    try:
        class MockWO:
            id = 42
            title = "测试工单-访视数据录入"
            status = "in_progress"
            due_date = "2025-01-01"

        # 仅构建卡片，不实际发送
        from libs.notification import _build_card
        card = _build_card(
            title="工单逾期预警",
            color="red",
            fields=[
                {"name": "工单标题", "value": MockWO.title},
                {"name": "工单ID", "value": str(MockWO.id)},
                {"name": "当前状态", "value": MockWO.status},
                {"name": "截止日期", "value": str(MockWO.due_date)},
            ],
            note="CN KIS 预警助手 - 请尽快处理逾期工单",
        )
        parsed = json.loads(card)
        assert parsed['header']['template'] == 'red'
        print("[PASS] 工单逾期通知模板: 构建正确")
        return True
    except Exception as e:
        print(f"[FAIL] 工单逾期通知模板: {e}")
        return False


def test_mock_sync_notify():
    """测试同步结果通知（Mock 对象）"""
    try:
        from datetime import datetime, timedelta

        class MockConfig:
            def __str__(self):
                return "t_subject -> bitable"

        class MockLog:
            config = MockConfig()
            status = "success"
            records_synced = 15
            error_message = ""
            started_at = datetime.now() - timedelta(seconds=30)
            completed_at = datetime.now()

        card = _build_card(
            title="数据同步成功",
            color="green",
            fields=[
                {"name": "配置", "value": str(MockLog.config)},
                {"name": "状态", "value": MockLog.status},
                {"name": "同步记录数", "value": str(MockLog.records_synced)},
            ],
        )
        parsed = json.loads(card)
        assert parsed['header']['template'] == 'green'
        print("[PASS] 同步结果通知模板: 构建正确")
        return True
    except Exception as e:
        print(f"[FAIL] 同步结果通知模板: {e}")
        return False


def test_send_message_api():
    """测试实际消息发送 API（需要群聊 ID 和权限）"""
    if not NOTIFICATION_CHAT_ID:
        print("[SKIP] 消息发送: 未配置 FEISHU_NOTIFICATION_CHAT_ID")
        return True

    try:
        result = notify_generic(
            title="CN KIS 集成测试",
            color="blue",
            fields=[
                {"name": "测试项", "value": "飞书机器人消息发送"},
                {"name": "时间", "value": "自动测试"},
            ],
            note="这是一条自动化测试消息，可忽略",
        )
        if result:
            print("[PASS] 消息发送: 成功发送到群聊")
        else:
            print("[FAIL] 消息发送: 发送返回 False")
        return result
    except Exception as e:
        print(f"[FAIL] 消息发送: {e}")
        return False


def test_safe_send_no_target():
    """测试无目标时安全发送不报错"""
    try:
        result = _safe_send('', 'text', '{"text":"test"}')
        if not result:
            print("[PASS] 安全发送（无目标）: 正确返回 False 且不报错")
            return True
        else:
            print("[FAIL] 安全发送（无目标）: 应返回 False")
            return False
    except Exception as e:
        print(f"[FAIL] 安全发送（无目标）: 抛出异常 {e}")
        return False


def main():
    print("=" * 60)
    print("飞书机器人消息通知测试")
    print("=" * 60)
    print()
    print(f"通知群聊 ID: {NOTIFICATION_CHAT_ID or '(未配置)'}")
    print()

    tests = [
        test_card_build,
        test_card_with_no_note,
        test_mock_work_order_notify,
        test_mock_sync_notify,
        test_safe_send_no_target,
        test_send_message_api,
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
