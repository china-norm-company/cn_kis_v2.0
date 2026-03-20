#!/usr/bin/env python3
"""
测试设备台（器衡）飞书凭证 - 验证本机能否调用飞书 API

若 IP 白名单未包含本机公网 IP，此脚本会失败。
"""
import sys
import os
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from pathlib import Path
from dotenv import load_dotenv

env_file = Path(__file__).resolve().parent.parent / 'deploy' / '.env.volcengine.plan-a'
load_dotenv(env_file)

APP_ID = os.getenv('FEISHU_APP_ID_EQUIPMENT', '')
APP_SECRET = os.getenv('FEISHU_APP_SECRET_EQUIPMENT', '')
URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'

def main():
    print("=" * 50)
    print("Equipment Feishu Credential Test (器衡)")
    print("=" * 50)
    if not APP_ID or not APP_SECRET:
        print("[FAIL] FEISHU_APP_ID_EQUIPMENT or FEISHU_APP_SECRET_EQUIPMENT not configured")
        return 1
    print(f"App ID: {APP_ID}")
    try:
        resp = httpx.post(URL, json={'app_id': APP_ID, 'app_secret': APP_SECRET}, timeout=10.0)
        data = resp.json()
        code = data.get('code', -1)
        if code == 0:
            print("[OK] tenant_access_token obtained successfully")
            print("     -> Feishu API is reachable from this machine")
            print("     -> IP whitelist likely includes your public IP")
            return 0
        else:
            print(f"[FAIL] Feishu API returned code={code} msg={data.get('msg', '')}")
            if code == 99991668 or 'IP' in str(data.get('msg', '')):
                print("     -> Check: Add your public IP to Feishu Security Settings")
            return 1
    except Exception as e:
        print(f"[FAIL] Network error: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())
