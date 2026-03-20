#!/usr/bin/env python3
"""
火山云原生 SMS 验证码测试脚本

使用火山引擎 SDK 的 send_sms_verify_code / check_sms_verify_code
平台自动管理验证码的生成、发送、过期、校验——不需要本地数据库。

用法：
  1. 发送验证码:  python test_volc_sms_native.py send 138xxxxxxxx
  2. 校验验证码:  python test_volc_sms_native.py check 138xxxxxxxx 123456
  3. 通用短信:    python test_volc_sms_native.py raw 138xxxxxxxx

需要环境变量：
  VOLC_ACCESSKEY / VOLC_SECRETKEY （或 VOLC_SUB_ACCESSKEY / VOLC_SUB_SECRETKEY）
  SMS_ACCOUNT   — 火山引擎短信消息组 SmsAccount
  SMS_SIGN_NAME — 签名
  SMS_TPL_VERIFY_CODE — 验证码短信模板 ID（如 ST_xxxx）

如果环境变量未设置，脚本也能用于发现调用问题（会打印错误信息）。
"""

import json
import os
import sys

# 可从 deploy/.env.volcengine.plan-a 加载
env_file = os.path.join(os.path.dirname(__file__), '..', 'deploy', '.env.volcengine.plan-a')
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            os.environ.setdefault(key.strip(), val.strip())

from volcengine.sms.SmsService import SmsService


def get_sms_service():
    ak = os.getenv('VOLC_ACCESSKEY', '')
    sk = os.getenv('VOLC_SECRETKEY', '')
    print(f'[config] AK: {ak[:8]}... SK: {sk[:8]}...')

    svc = SmsService()
    svc.set_ak(ak)
    svc.set_sk(sk)
    return svc


def test_send_verify_code(phone: str):
    """调用 send_sms_verify_code — 平台自动生成+发送验证码"""
    svc = get_sms_service()
    sms_account = os.getenv('SMS_ACCOUNT', '')
    sign_name = os.getenv('SMS_SIGN_NAME', '')
    template_id = os.getenv('SMS_TPL_VERIFY_CODE', '')

    print(f'\n=== send_sms_verify_code ===')
    print(f'  SmsAccount : {sms_account}')
    print(f'  Sign       : {sign_name}')
    print(f'  TemplateID : {template_id}')
    print(f'  PhoneNumber: {phone}')
    print(f'  CodeType   : 6  (6位数字)')
    print(f'  TryCount   : 3')
    print(f'  ExpireTime : 300 (秒)')
    print(f'  Scene      : cn_kis_login')

    body = {
        'SmsAccount': sms_account,
        'Sign': sign_name,
        'TemplateID': template_id,
        'PhoneNumber': phone,
        'CodeType': 6,
        'TryCount': 3,
        'ExpireTime': 300,
        'Scene': 'cn_kis_login',
    }

    print(f'\n[request body]\n{json.dumps(body, ensure_ascii=False, indent=2)}')
    resp = svc.send_sms_verify_code(json.dumps(body))
    print(f'\n[response]\n{json.dumps(resp if isinstance(resp, dict) else json.loads(resp), ensure_ascii=False, indent=2)}')
    return resp


def test_check_verify_code(phone: str, code: str):
    """调用 check_sms_verify_code — 平台校验验证码"""
    svc = get_sms_service()
    sms_account = os.getenv('SMS_ACCOUNT', '')

    print(f'\n=== check_sms_verify_code ===')
    print(f'  SmsAccount : {sms_account}')
    print(f'  PhoneNumber: {phone}')
    print(f'  Code       : {code}')
    print(f'  Scene      : cn_kis_login')

    body = {
        'SmsAccount': sms_account,
        'PhoneNumber': phone,
        'Scene': 'cn_kis_login',
        'Code': code,
    }

    print(f'\n[request body]\n{json.dumps(body, ensure_ascii=False, indent=2)}')
    resp = svc.check_sms_verify_code(json.dumps(body))
    print(f'\n[response]\n{json.dumps(resp if isinstance(resp, dict) else json.loads(resp), ensure_ascii=False, indent=2)}')
    return resp


def test_raw_send(phone: str):
    """调用 send_sms — 通用发送（非验证码专用）"""
    svc = get_sms_service()
    sms_account = os.getenv('SMS_ACCOUNT', '')
    sign_name = os.getenv('SMS_SIGN_NAME', '')
    template_id = os.getenv('SMS_TPL_VERIFY_CODE', '')

    print(f'\n=== send_sms (raw) ===')
    body = {
        'SmsAccount': sms_account,
        'Sign': sign_name,
        'TemplateID': template_id,
        'TemplateParam': json.dumps({'code': '888888'}),
        'PhoneNumbers': phone,
        'Tag': 'cn_kis_test',
    }
    print(f'\n[request body]\n{json.dumps(body, ensure_ascii=False, indent=2)}')
    resp = svc.send_sms(json.dumps(body))
    print(f'\n[response]\n{json.dumps(resp if isinstance(resp, dict) else json.loads(resp), ensure_ascii=False, indent=2)}')
    return resp


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1]
    phone = sys.argv[2]

    if action == 'send':
        test_send_verify_code(phone)
    elif action == 'check':
        if len(sys.argv) < 4:
            print('用法: python test_volc_sms_native.py check <phone> <code>')
            sys.exit(1)
        test_check_verify_code(phone, sys.argv[3])
    elif action == 'raw':
        test_raw_send(phone)
    else:
        print(f'未知操作: {action}  (可选: send / check / raw)')
        sys.exit(1)


if __name__ == '__main__':
    main()
