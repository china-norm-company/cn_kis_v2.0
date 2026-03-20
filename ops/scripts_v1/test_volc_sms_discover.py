#!/usr/bin/env python3
"""
火山云 SMS 配置发现脚本

查询当前账号已有的消息组、签名、模板，确定 send_sms_verify_code 所需参数。
"""
import json
import os

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

ak = os.getenv('VOLC_ACCESSKEY', '')
sk = os.getenv('VOLC_SECRETKEY', '')
print(f'Using root AK: {ak[:12]}...')

svc = SmsService()
svc.set_ak(ak)
svc.set_sk(sk)

print('\n' + '='*60)
print('1. 查询消息组 (SubAccountList)')
print('='*60)
try:
    body = json.dumps({'PageIndex': 1, 'PageSize': 20})
    resp = svc.get_sub_account_list(body)
    if isinstance(resp, str):
        resp = json.loads(resp)
    print(json.dumps(resp, ensure_ascii=False, indent=2))
except Exception as e:
    print(f'ERROR: {e}')

print('\n' + '='*60)
print('2. 查询签名列表 (SignatureAndOrderList)')
print('='*60)
try:
    body = json.dumps({'PageIndex': 1, 'PageSize': 20})
    resp = svc.get_signature_and_order_list(body)
    if isinstance(resp, str):
        resp = json.loads(resp)
    print(json.dumps(resp, ensure_ascii=False, indent=2))
except Exception as e:
    print(f'ERROR: {e}')

print('\n' + '='*60)
print('3. 查询签名资质列表 (SignatureIdentList)')
print('='*60)
try:
    body = json.dumps({'PageIndex': 1, 'PageSize': 20})
    resp = svc.get_signature_ident_list(body)
    if isinstance(resp, str):
        resp = json.loads(resp)
    print(json.dumps(resp, ensure_ascii=False, indent=2))
except Exception as e:
    print(f'ERROR: {e}')

print('\n' + '='*60)
print('4. 查询模板列表 (SmsTemplateAndOrderList)')
print('='*60)
try:
    body = json.dumps({'PageIndex': 1, 'PageSize': 20})
    resp = svc.get_sms_template_and_order_list(body)
    if isinstance(resp, str):
        resp = json.loads(resp)
    print(json.dumps(resp, ensure_ascii=False, indent=2))
except Exception as e:
    print(f'ERROR: {e}')
