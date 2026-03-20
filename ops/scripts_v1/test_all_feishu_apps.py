#!/usr/bin/env python3
"""
测试全部 15 个飞书工作台应用凭证

验证每个 app_id + app_secret 是否可以成功获取 tenant_access_token。
"""
import sys
import os
import httpx

# 加载 .env
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from pathlib import Path
from dotenv import load_dotenv

env_file = Path(__file__).resolve().parent.parent / 'deploy' / '.env.volcengine.plan-a'
load_dotenv(env_file)

FEISHU_TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'

APPS = [
    ('子衿·秘书台',   'FEISHU_APP_ID',           'FEISHU_APP_SECRET'),
    ('管仲·财务台',   'FEISHU_APP_ID_FINANCE',    'FEISHU_APP_SECRET_FINANCE'),
    ('采苓·研究台',   'FEISHU_APP_ID_RESEARCH',   'FEISHU_APP_SECRET_RESEARCH'),
    ('维周·执行台',   'FEISHU_APP_ID_EXECUTION',  'FEISHU_APP_SECRET_EXECUTION'),
    ('怀瑾·质量台',   'FEISHU_APP_ID_QUALITY',    'FEISHU_APP_SECRET_QUALITY'),
    ('时雨·人事台',   'FEISHU_APP_ID_HR',         'FEISHU_APP_SECRET_HR'),
    ('进思·客户台',   'FEISHU_APP_ID_CRM',        'FEISHU_APP_SECRET_CRM'),
    ('招招·招募台',   'FEISHU_APP_ID_RECRUITMENT', 'FEISHU_APP_SECRET_RECRUITMENT'),
    ('器衡·设备台',   'FEISHU_APP_ID_EQUIPMENT',  'FEISHU_APP_SECRET_EQUIPMENT'),
    ('度支·物料台',   'FEISHU_APP_ID_MATERIAL',   'FEISHU_APP_SECRET_MATERIAL'),
    ('坤元·设施台',   'FEISHU_APP_ID_FACILITY',   'FEISHU_APP_SECRET_FACILITY'),
    ('衡技·评估台',   'FEISHU_APP_ID_EVALUATOR',  'FEISHU_APP_SECRET_EVALUATOR'),
    ('共济·人员台',   'FEISHU_APP_ID_LAB_PERSONNEL', 'FEISHU_APP_SECRET_LAB_PERSONNEL'),
    ('御史·伦理台',   'FEISHU_APP_ID_ETHICS',     'FEISHU_APP_SECRET_ETHICS'),
    ('和序·接待台',   'FEISHU_APP_ID_RECEPTION',  'FEISHU_APP_SECRET_RECEPTION'),
]


def test_app(name: str, app_id_key: str, app_secret_key: str) -> bool:
    app_id = os.getenv(app_id_key, '')
    app_secret = os.getenv(app_secret_key, '')

    if not app_id or not app_secret:
        print(f'  ✗ {name}: 凭证未配置 ({app_id_key})')
        return False

    try:
        resp = httpx.post(
            FEISHU_TOKEN_URL,
            json={'app_id': app_id, 'app_secret': app_secret},
            timeout=10.0,
        )
        data = resp.json()
        code = data.get('code', -1)
        if code == 0:
            expire = data.get('expire', 0)
            print(f'  ✓ {name} ({app_id}): tenant_access_token 获取成功, expire={expire}s')
            return True
        else:
            print(f'  ✗ {name} ({app_id}): code={code} msg={data.get("msg", "")}')
            return False
    except Exception as e:
        print(f'  ✗ {name} ({app_id}): 网络错误 {e}')
        return False


def main():
    print('=' * 60)
    print('飞书 15 工作台应用凭证验证')
    print('=' * 60)

    results = []
    for name, id_key, secret_key in APPS:
        ok = test_app(name, id_key, secret_key)
        results.append((name, ok))

    print()
    print('=' * 60)
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f'结果: {passed}/{total} 通过')

    if passed == total:
        print('全部凭证验证通过！')
    else:
        print('以下应用凭证有问题:')
        for name, ok in results:
            if not ok:
                print(f'  - {name}')

    print('=' * 60)
    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
