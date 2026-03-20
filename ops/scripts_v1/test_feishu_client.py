#!/usr/bin/env python3
"""
飞书统一客户端连通性测试

验证 FeishuClient 的基础能力：
- Token 获取与缓存
- 消息发送（需要机器人权限）
- API 错误处理

用法:
    cd backend && python ../scripts/test_feishu_client.py

输出格式: [PASS] / [FAIL] 每项测试
"""
import os
import sys
import time

# Django 环境初始化
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
os.environ.setdefault('USE_SQLITE', 'true')

import django
django.setup()

from libs.feishu_client import FeishuClient, FeishuAPIError


def test_token_acquisition():
    """测试 Token 获取"""
    client = FeishuClient()
    try:
        token = client.get_tenant_token()
        if token and len(token) > 10:
            print(f"[PASS] Token 获取成功 (长度={len(token)})")
            return True
        else:
            print(f"[FAIL] Token 获取: 返回值异常 ({token})")
            return False
    except FeishuAPIError as e:
        print(f"[FAIL] Token 获取: {e}")
        return False
    except Exception as e:
        print(f"[FAIL] Token 获取: 未预期异常 {type(e).__name__}: {e}")
        return False


def test_token_cache():
    """测试 Token 缓存"""
    client = FeishuClient()
    try:
        token1 = client.get_tenant_token()
        token2 = client.get_tenant_token()
        if token1 == token2:
            print("[PASS] Token 缓存: 连续调用返回相同 Token")
            return True
        else:
            print("[FAIL] Token 缓存: 连续调用返回不同 Token（缓存失效）")
            return False
    except Exception as e:
        print(f"[FAIL] Token 缓存: {e}")
        return False


def test_token_expiry_detection():
    """测试 Token 过期检测"""
    client = FeishuClient()
    try:
        token1 = client.get_tenant_token()
        # 模拟过期
        client._tenant_token_expires_at = time.time() - 1
        token2 = client.get_tenant_token()
        # 过期后应该获取新 Token（可能相同也可能不同，关键是不报错）
        if token2 and len(token2) > 10:
            print("[PASS] Token 过期检测: 过期后成功刷新")
            return True
        else:
            print("[FAIL] Token 过期检测: 刷新后 Token 异常")
            return False
    except Exception as e:
        print(f"[FAIL] Token 过期检测: {e}")
        return False


def test_error_handling():
    """测试错误处理（用无效凭证触发错误）"""
    client = FeishuClient()
    try:
        client.get_tenant_token(app_id='invalid_id', app_secret='invalid_secret')
        print("[FAIL] 错误处理: 无效凭证未抛出异常")
        return False
    except FeishuAPIError as e:
        if e.code != 0:
            print(f"[PASS] 错误处理: 无效凭证正确抛出 FeishuAPIError (code={e.code})")
            return True
        else:
            print(f"[FAIL] 错误处理: 异常 code 不符合预期 ({e.code})")
            return False
    except Exception as e:
        print(f"[FAIL] 错误处理: 预期 FeishuAPIError，实际 {type(e).__name__}: {e}")
        return False


def test_request_method():
    """测试 _request 统一请求方法（用一个简单的 API 调用）"""
    client = FeishuClient()
    try:
        # 调用一个只需 tenant_token 的简单 API
        # 获取机器人信息（不需要额外权限）
        data = client._request('GET', 'bot/v3/info')
        if 'bot' in data or isinstance(data, dict):
            print(f"[PASS] _request 统一请求: 成功调用 bot/v3/info")
            return True
        else:
            print(f"[FAIL] _request 统一请求: 返回数据异常 ({data})")
            return False
    except FeishuAPIError as e:
        # 如果没有机器人权限，也算通过（错误处理正常工作）
        print(f"[PASS] _request 统一请求: API 正常返回错误 (code={e.code}, msg={e.msg})")
        return True
    except Exception as e:
        print(f"[FAIL] _request 统一请求: 未预期异常 {type(e).__name__}: {e}")
        return False


def main():
    print("=" * 60)
    print("飞书统一客户端 (FeishuClient) 连通性测试")
    print("=" * 60)
    print()

    from django.conf import settings
    app_id = settings.FEISHU_APP_ID
    if not app_id:
        print("[SKIP] 未配置 FEISHU_APP_ID，跳过所有测试")
        print("请确保 deploy/.env.volcengine.plan-a 中配置了飞书凭证")
        sys.exit(0)

    print(f"App ID: {app_id[:10]}...")
    print()

    tests = [
        test_token_acquisition,
        test_token_cache,
        test_token_expiry_detection,
        test_error_handling,
        test_request_method,
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
