#!/usr/bin/env python3
"""测试飞书机器人凭证能否调用飞书开放平台 API

用法：
  cd CN_KIS_V1.0
  python scripts/test_feishu_api_integration.py

从 deploy/.env.volcengine.plan-a 或 deploy/.env.volcengine.plan-a.example 读取 FEISHU_APP_ID、FEISHU_APP_SECRET
"""

import json
import os
import sys
from pathlib import Path

# 加载环境变量
PROJECT_ROOT = Path(__file__).resolve().parent.parent
for env_file in [
    PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a",
    PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a.example",
]:
    if env_file.exists():
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    v = v.strip().strip("'\"")
                    if k == "FEISHU_APP_ID" and "FINANCE" not in line:
                        os.environ.setdefault("FEISHU_APP_ID", v)
                    elif k == "FEISHU_APP_SECRET" and "FINANCE" not in line:
                        os.environ.setdefault("FEISHU_APP_SECRET", v)
        break

APP_ID = os.getenv("FEISHU_APP_ID")
APP_SECRET = os.getenv("FEISHU_APP_SECRET")


def get_tenant_access_token() -> str:
    """获取 tenant_access_token"""
    import urllib.request

    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    data = json.dumps({"app_id": APP_ID, "app_secret": APP_SECRET}).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")

    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode())
    if body.get("code") != 0:
        raise RuntimeError(f"获取 token 失败: {body}")
    return body["tenant_access_token"]


def main():
    print("=== 飞书开放平台 API 集成测试 ===\n")

    if not APP_ID or not APP_SECRET:
        print("FAIL: 未找到 FEISHU_APP_ID 或 FEISHU_APP_SECRET")
        print("  请确保 deploy/.env.volcengine.plan-a 中存在配置")
        sys.exit(1)
    print(f"OK: 已加载凭证 (App ID: {APP_ID[:12]}...)")

    try:
        token = get_tenant_access_token()
        print("OK: tenant_access_token 获取成功")
        print("\n=== 测试完成：飞书机器人凭证可正常调用飞书开放平台 API ===")
    except Exception as e:
        print(f"FAIL: 获取 tenant_access_token 失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
