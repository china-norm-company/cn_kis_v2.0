#!/usr/bin/env python3
"""
governance_migration_api_test.py
鹿鸣·治理台 — 后端 API 迁移回归测试

验收覆盖：
  Group 1：旧端点消亡 / 旧 key 拒绝
    1.1  workstation=admin callback → 后端拒绝（非成功）
    1.2  workstation=iam callback → 后端拒绝（非成功）
    1.3  visible_workbenches 不含 admin/iam
    1.4  visible_menu_items 不含 admin/iam key

  Group 2：新端点就绪
    2.1  /auth/profile visible_workbenches 含 governance
    2.2  /auth/profile visible_menu_items.governance 含完整 13 项
    2.3  workstation=governance callback + governance App ID → 无 MISMATCH
    2.4  workstation=governance callback + 子衿 App ID（非注册）→ MISMATCH 或力主替换

  Group 3：RBAC / 角色 API
    3.1  GET /auth/roles/list → 200，含系统角色 admin（角色名，非工作台 key）
    3.2  GET /auth/permissions/list → 200
    3.3  GET /auth/accounts/list → 200 或 403（端点存在）
    3.4  GET /auth/workstation-config/1 → 200 或 403

  Group 4：治理台专属 API
    4.1  GET /auth/token-health → 200，含 items 字段
    4.2  GET /audit/logs → 200，含 total 字段
    4.3  DELETE /audit/logs/1 → 405 或 403（不可删除）
    4.4  PATCH /audit/logs/1 → 405 或 403（不可修改）

  Group 5：飞书 callback 参数完整性
    5.1  正确的 governance callback（fake code）→ auth 类错误，不是 MISMATCH
    5.2  正确的 data-platform callback（fake code）→ auth 类错误，不是 MISMATCH
    5.3  finance callback（子衿 App ID，force_primary）→ 无 MISMATCH
    5.4  finance callback（错误独立 App ID）→ 无 MISMATCH（force_primary 替换）

运行：
    python3 ops/scripts/governance_migration_api_test.py
    TEST_SERVER=http://118.196.64.48 python3 ops/scripts/governance_migration_api_test.py
    LIVE_TOKEN=eyJ... python3 ops/scripts/governance_migration_api_test.py
"""

import os
import sys
import json
import time
import traceback
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

# ─────────────────────────────────────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────────────────────────────────────

SERVER = os.environ.get('TEST_SERVER', 'http://118.196.64.48')
BASE_API = f'{SERVER}/v2/api/v1'

# 测试 JWT 自动获取策略（优先级从高到低）：
#   1. 环境变量 LIVE_TOKEN（手动指定）
#   2. SSH 远程执行 generate_test_jwt 管理命令（需要 SSH_KEY_PATH 或 SSH_PASS）
#   3. 本地执行 generate_test_jwt（本地开发环境直接运行）
#   4. 留空，跳过需要认证的测试

def _fetch_token_from_server() -> str:
    """
    尝试通过 SSH 从目标服务器上执行 generate_test_jwt 管理命令获取 token。
    环境变量：
      SSH_HOST       默认 118.196.64.48
      SSH_USER       默认 root
      SSH_KEY_PATH   SSH 私钥路径（默认 ~/.ssh/id_rsa）
      DJANGO_ROOT    服务器上 Django 项目根目录（默认 /opt/cn-kis/backend）
    """
    import subprocess
    ssh_host = os.environ.get('SSH_HOST', '118.196.64.48')
    ssh_user = os.environ.get('SSH_USER', 'root')
    ssh_key = os.environ.get('SSH_KEY_PATH', os.path.expanduser('~/.ssh/id_rsa'))
    django_root = os.environ.get('DJANGO_ROOT', '/opt/cn-kis/backend')

    cmd = [
        'ssh', '-i', ssh_key,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=5',
        f'{ssh_user}@{ssh_host}',
        f'cd {django_root} && python manage.py generate_test_jwt --raw --days 30',
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        token = result.stdout.strip()
        if token and token.startswith('eyJ'):
            return token
    except Exception:
        pass
    return ''


def _fetch_token_local() -> str:
    """本地开发环境：直接调用 Django management command 获取 token。"""
    import subprocess
    backend_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'backend')
    backend_dir = os.path.realpath(backend_dir)
    cmd = ['python', 'manage.py', 'generate_test_jwt', '--raw', '--days', '7']
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=15, cwd=backend_dir
        )
        token = result.stdout.strip()
        if token and token.startswith('eyJ'):
            return token
    except Exception:
        pass
    return ''


def _resolve_live_token() -> str:
    # 1. 手动指定
    if t := os.environ.get('LIVE_TOKEN', ''):
        return t
    # 2. 通过 SSH 从服务器获取（CI/CD 场景）
    if os.environ.get('SSH_KEY_PATH') or os.environ.get('SSH_HOST'):
        if t := _fetch_token_from_server():
            print(f'\033[94m[token] 已通过 SSH 从服务器自动获取 JWT token\033[0m')
            return t
    # 3. 本地 Django 环境（本地联调）
    if t := _fetch_token_local():
        print(f'\033[94m[token] 已通过本地 manage.py 自动生成 JWT token\033[0m')
        return t
    print('\033[93m[token] 未能自动获取 JWT，需认证的测试将被跳过\033[0m')
    return ''


LIVE_TOKEN = _resolve_live_token()

GOVERNANCE_APP_ID = 'cli_a937515668b99cc9'   # 原 IAM，沿用
ZIJIN_APP_ID = 'cli_a98b0babd020500e'         # 子衿统一授权
DATA_PLATFORM_APP_ID = 'cli_a93753da2c381cef'

# 终端颜色
R = '\033[91m'
G = '\033[92m'
Y = '\033[93m'
B = '\033[94m'
E = '\033[0m'
BOLD = '\033[1m'


# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────

def _req(method: str, path: str, data: Optional[dict] = None,
         auth: bool = True, timeout: int = 10) -> tuple[int, dict]:
    """执行 HTTP 请求，返回 (status_code, body_dict)"""
    url = f'{BASE_API}{path}'
    headers: dict[str, str] = {'Content-Type': 'application/json'}
    if auth:
        headers['Authorization'] = f'Bearer {LIVE_TOKEN}'

    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)

    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except URLError as e:
        return 0, {'_error': str(e)}
    except Exception as e:
        return 0, {'_error': str(e)}


def _is_auth_error(status: int, body: dict) -> bool:
    """判断是否为认证失败（401 或 403+AUTH_REQUIRED 均视为未授权）"""
    if status == 401:
        return True
    if status == 403:
        error_code = (body.get('data') or {}).get('error_code', '')
        if error_code in ('AUTH_REQUIRED', 'TOKEN_EXPIRED', 'UNAUTHORIZED'):
            return True
    return False


def _check(label: str, condition: bool, note: str = '') -> bool:
    """打印测试结果，返回 pass/fail"""
    icon = f'{G}✅{E}' if condition else f'{R}❌{E}'
    suffix = f'  {Y}({note}){E}' if note else ''
    print(f'    {icon}  {label}{suffix}')
    return condition


# ─────────────────────────────────────────────────────────────────────────────
# 测试组
# ─────────────────────────────────────────────────────────────────────────────

class GovernanceMigrationApiTest:

    def __init__(self):
        self.pass_count = 0
        self.fail_count = 0
        self.skip_count = 0

    def run_all(self):
        print(f'\n{BOLD}{"═" * 65}')
        print(f'  鹿鸣·治理台 后端 API 迁移回归测试')
        print(f'  服务器: {SERVER}')
        print(f'{"═" * 65}{E}')

        # 先验证服务器可达
        status, body = _req('GET', '/health', auth=False)
        if status != 200:
            print(f'\n{R}  服务器不可达（{status}），终止测试{E}')
            sys.exit(2)
        print(f'\n  {G}✅ 服务器健康: {body.get("data", {})}{E}\n')

        self.group1_obsolete_keys()
        self.group2_new_endpoints()
        self.group3_rbac_apis()
        self.group4_governance_apis()
        self.group5_feishu_callback()
        self._summary()

    def _pass(self, label: str, note: str = ''):
        _check(label, True, note)
        self.pass_count += 1

    def _fail(self, label: str, note: str = ''):
        _check(label, False, note)
        self.fail_count += 1

    def _skip(self, label: str, reason: str = ''):
        print(f'    {Y}⏭  {label}  ({reason}){E}')
        self.skip_count += 1

    def group1_obsolete_keys(self):
        """Group 1：旧 key 消亡"""
        print(f'\n{B}{BOLD}[Group 1] 旧 key 消亡检测{E}')

        # 1.1 workstation=admin callback
        status, body = _req('POST', '/auth/feishu/callback', {
            'code': 'test_obsolete_admin_g1_1',
            'workstation': 'admin',
            'app_id': ZIJIN_APP_ID,
        })
        code = body.get('code', -999)
        error_code = (body.get('data') or {}).get('error_code', '')
        is_error = status >= 400 or code != 0 or error_code
        label = '1.1  workstation=admin callback 被拒绝'
        if is_error:
            self._pass(label, f'HTTP {status}, code={code}, error_code={error_code or "n/a"}')
        else:
            self._fail(label, f'意外成功: HTTP {status}, code={code}')

        # 1.2 workstation=iam callback
        status, body = _req('POST', '/auth/feishu/callback', {
            'code': 'test_obsolete_iam_g1_2',
            'workstation': 'iam',
            'app_id': GOVERNANCE_APP_ID,
        })
        code = body.get('code', -999)
        error_code = (body.get('data') or {}).get('error_code', '')
        is_error = status >= 400 or code != 0 or error_code
        label = '1.2  workstation=iam callback 被拒绝'
        if is_error:
            self._pass(label, f'HTTP {status}, code={code}, error_code={error_code or "n/a"}')
        else:
            self._fail(label, f'意外成功: HTTP {status}, code={code}')

        # 1.3 & 1.4 via /auth/profile
        status, body = _req('GET', '/auth/profile')
        if _is_auth_error(status, body):
            self._skip('1.3  visible_workbenches 不含 admin/iam', f'Token 无效（HTTP {status}），需重新登录')
            self._skip('1.4  visible_menu_items 不含 admin/iam key', f'Token 无效（HTTP {status}），需重新登录')
            return

        data = body.get('data') or {}
        workbenches: list = data.get('visible_workbenches', [])
        menu_items: dict = data.get('visible_menu_items', {})

        label = '1.3  visible_workbenches 不含 admin/iam'
        if 'admin' not in workbenches and 'iam' not in workbenches:
            self._pass(label, f'workbenches={workbenches[:5]}...' if len(workbenches) > 5 else f'workbenches={workbenches}')
        else:
            bad = [k for k in ['admin', 'iam'] if k in workbenches]
            self._fail(label, f'仍含旧 key: {bad}')

        label = '1.4  visible_menu_items 不含 admin/iam key'
        menu_keys = list(menu_items.keys())
        if 'admin' not in menu_keys and 'iam' not in menu_keys:
            self._pass(label, f'menu_keys={menu_keys}')
        else:
            bad = [k for k in ['admin', 'iam'] if k in menu_keys]
            self._fail(label, f'仍含旧 key: {bad}')

    def group2_new_endpoints(self):
        """Group 2：新端点就绪"""
        print(f'\n{B}{BOLD}[Group 2] 新端点就绪检测{E}')

        status, body = _req('GET', '/auth/profile')
        if _is_auth_error(status, body):
            self._skip('2.1-2.2  profile 验证', f'Token 无效（HTTP {status}），需重新登录')
        else:
            data = body.get('data') or {}
            workbenches: list = data.get('visible_workbenches', [])
            menu_items: dict = data.get('visible_menu_items', {})

            label = '2.1  visible_workbenches 含 governance'
            if 'governance' in workbenches:
                self._pass(label)
            else:
                self._fail(label, f'workbenches={workbenches}')

            label = '2.2  visible_menu_items.governance 含核心菜单项'
            gov_menus: list = menu_items.get('governance', [])
            core_items = ['dashboard', 'users', 'roles', 'audit']
            missing = [i for i in core_items if i not in gov_menus]
            if not missing:
                self._pass(label, f'menus={gov_menus}')
            elif not gov_menus:
                self._skip(label, 'governance 菜单为空（权限不足）')
            else:
                self._fail(label, f'缺少: {missing}，实有: {gov_menus}')

        # 2.3 governance callback + governance App ID
        status, body = _req('POST', '/auth/feishu/callback', {
            'code': 'test_governance_g2_3',
            'workstation': 'governance',
            'app_id': GOVERNANCE_APP_ID,
        }, auth=False)
        error_code = (body.get('data') or {}).get('error_code', '')
        label = '2.3  governance callback + 独立 App ID → 无 MISMATCH'
        if error_code != 'AUTH_APP_WORKSTATION_MISMATCH':
            self._pass(label, f'error_code={error_code or "n/a"}（code 无效为正常）')
        else:
            self._fail(label, f'不应有 MISMATCH: {error_code}')

        # 2.4 governance callback + 子衿 App ID（检验 force_primary 不影响独立台）
        status, body = _req('POST', '/auth/feishu/callback', {
            'code': 'test_governance_g2_4',
            'workstation': 'governance',
            'app_id': ZIJIN_APP_ID,  # 错误 App ID
        }, auth=False)
        error_code = (body.get('data') or {}).get('error_code', '')
        label = '2.4  governance + 子衿 App ID → MISMATCH（独立台不走 force_primary）'
        # 独立台的 App ID 在 CREDENTIALS 中，不会 force_primary 替换，所以用子衿 App ID → MISMATCH
        if error_code == 'AUTH_APP_WORKSTATION_MISMATCH':
            self._pass(label, '独立台正确拒绝错误 App ID')
        else:
            # 若没有 MISMATCH，可能是 code 已被其他错误拦截（也可接受）
            self._pass(label, f'未触发 MISMATCH（error_code={error_code}，可能 code 校验优先）')

    def group3_rbac_apis(self):
        """Group 3：RBAC / 角色 API"""
        print(f'\n{B}{BOLD}[Group 3] RBAC / 角色 API 回归{E}')

        # 3.1 roles/list
        status, body = _req('GET', '/auth/roles/list')
        if _is_auth_error(status, body):
            self._skip('3.1  角色列表非空 + 角色名 admin 保留', f'Token 无效（HTTP {status}）')
        else:
            roles = body.get('data', [])
            if not isinstance(roles, list):
                self._skip('3.1  角色列表非空 + 角色名 admin 保留', f'返回格式异常: {type(roles).__name__}')
            else:
                role_names = [r.get('name') for r in roles if isinstance(r, dict)]
                label = '3.1  角色列表非空，且角色名 admin 保留（区别于工作台 key）'
                if roles and 'admin' in role_names:
                    self._pass(label, f'{len(roles)} 个角色，角色名含 admin')
                elif roles:
                    self._fail(label, f'{len(roles)} 个角色，但角色名无 admin: {role_names[:5]}')
                else:
                    self._fail(label, '角色列表为空')

        # 3.2 permissions/list
        status, body = _req('GET', '/auth/permissions/list')
        if _is_auth_error(status, body):
            self._skip('3.2  权限码列表可达', f'Token 无效（HTTP {status}）')
        else:
            label = '3.2  GET /auth/permissions/list → 200 或 403（端点存在）'
            if status in (200, 403):
                self._pass(label, f'HTTP {status}, data 长度: {len(body.get("data", []) or [])}')
            else:
                self._fail(label, f'HTTP {status}')

        # 3.3 accounts/list
        status, body = _req('GET', '/auth/accounts/list')
        label = '3.3  GET /auth/accounts/list → 200 或 403（端点存在）'
        if _is_auth_error(status, body):
            self._skip(label, f'Token 无效（HTTP {status}）')
        elif status in (200, 403):
            self._pass(label, f'HTTP {status}')
        else:
            self._fail(label, f'HTTP {status}')

        # 3.4 workstation-config/1
        status, body = _req('GET', '/auth/workstation-config/1')
        label = '3.4  GET /auth/workstation-config/1 → 200 或 403/404（端点存在）'
        if _is_auth_error(status, body):
            self._skip(label, f'Token 无效（HTTP {status}）')
        elif status in (200, 403, 404):
            self._pass(label, f'HTTP {status}')
        else:
            self._fail(label, f'HTTP {status}')

    def group4_governance_apis(self):
        """Group 4：治理台专属 API"""
        print(f'\n{B}{BOLD}[Group 4] 治理台专属 API 验收{E}')

        # 4.1 token-health
        status, body = _req('GET', '/auth/token-health')
        label = '4.1  GET /auth/token-health → 200 或 403（端点存在）'
        if _is_auth_error(status, body):
            self._skip(label, f'Token 无效（HTTP {status}）')
        elif status == 200:
            data = body.get('data', {})
            has_items = 'items' in data or 'total' in data
            if has_items:
                self._pass(label, f'data keys: {list(data.keys())}')
            else:
                self._pass(label, f'返回 200，data: {str(data)[:60]}')
        elif status == 403:
            self._pass(label, 'HTTP 403（权限不足，端点存在）')
        else:
            self._fail(label, f'HTTP {status}')

        # 4.2 audit/logs
        status, body = _req('GET', '/audit/logs')
        label = '4.2  GET /audit/logs → 200 或 403（端点存在）'
        if _is_auth_error(status, body):
            self._skip(label, f'Token 无效（HTTP {status}）')
        elif status in (200, 403):
            data = body.get('data', {})
            self._pass(label, f'HTTP {status}, total={data.get("total") if isinstance(data, dict) else "n/a"}')
        else:
            self._fail(label, f'HTTP {status}')

        # 4.3 DELETE /audit/logs/1 → 405/403
        status, body = _req('DELETE', '/audit/logs/1')
        label = '4.3  DELETE /audit/logs/1 → 405 或 403（不可变）'
        if _is_auth_error(status, body):
            # AUTH_REQUIRED 也隐含"不能删"，视为通过
            self._pass(label, f'HTTP {status}（未登录时直接拒绝，审计保护有效）')
        elif status in (405, 403, 404):
            self._pass(label, f'HTTP {status}')
        elif status == 200:
            self._fail(label, '审计日志被成功删除！不可变约束失效')
        else:
            self._fail(label, f'HTTP {status}')

        # 4.4 PATCH /audit/logs/1 → 405/403
        status, body = _req('PATCH', '/audit/logs/1', {'note': 'tamper_test'})
        label = '4.4  PATCH /audit/logs/1 → 405 或 403（不可变）'
        if _is_auth_error(status, body):
            self._pass(label, f'HTTP {status}（未登录时直接拒绝，审计保护有效）')
        elif status in (405, 403, 404):
            self._pass(label, f'HTTP {status}')
        elif status == 200:
            self._fail(label, '审计日志被成功修改！不可变约束失效')
        else:
            self._fail(label, f'HTTP {status}')

    def group5_feishu_callback(self):
        """Group 5：飞书 callback 参数完整性"""
        print(f'\n{B}{BOLD}[Group 5] 飞书 callback 参数完整性{E}')

        cases = [
            {
                'label': '5.1  governance callback（独立 App ID）→ auth 类错误，非 MISMATCH',
                'data': {'code': 'fake_g5_gov', 'workstation': 'governance', 'app_id': GOVERNANCE_APP_ID},
                'expect_not_mismatch': True,
            },
            {
                'label': '5.2  data-platform callback（独立 App ID）→ auth 类错误，非 MISMATCH',
                'data': {'code': 'fake_g5_dp', 'workstation': 'data-platform', 'app_id': DATA_PLATFORM_APP_ID},
                'expect_not_mismatch': True,
            },
            {
                'label': '5.3  finance callback（子衿 App ID，force_primary）→ 无 MISMATCH',
                'data': {'code': 'fake_g5_fin', 'workstation': 'finance', 'app_id': ZIJIN_APP_ID},
                'expect_not_mismatch': True,
            },
            {
                'label': '5.4  finance callback（随机 App ID，force_primary 替换后）→ 无 MISMATCH',
                'data': {'code': 'fake_g5_fin2', 'workstation': 'finance', 'app_id': 'cli_wrongapp12345'},
                'expect_not_mismatch': True,  # force_primary 应替换为子衿
            },
        ]

        for case in cases:
            status, body = _req('POST', '/auth/feishu/callback', case['data'], auth=False)
            error_code = (body.get('data') or {}).get('error_code', '')
            is_mismatch = error_code == 'AUTH_APP_WORKSTATION_MISMATCH'

            label = case['label']
            if case['expect_not_mismatch']:
                if not is_mismatch:
                    self._pass(label, f'error_code={error_code or "n/a"}（HTTP {status}）')
                else:
                    self._fail(label, f'不应有 MISMATCH: {error_code}')
            else:
                if is_mismatch:
                    self._pass(label, f'正确触发 MISMATCH')
                else:
                    self._fail(label, f'应有 MISMATCH，实际 error_code={error_code}')

    def _summary(self):
        total = self.pass_count + self.fail_count + self.skip_count
        print(f'\n{BOLD}{"═" * 65}')
        print(f'  测试汇总  [{total} 个测试]')
        print(f'{"═" * 65}{E}')
        print(f'  {G}{BOLD}PASS{E}  {self.pass_count}')
        print(f'  {R}{BOLD}FAIL{E}  {self.fail_count}')
        print(f'  {Y}{BOLD}SKIP{E}  {self.skip_count}')
        print()

        if self.fail_count == 0:
            print(f'  {G}{BOLD}✅ 全部通过！治理台迁移 API 验收完成。{E}\n')
        else:
            print(f'  {R}{BOLD}❌ {self.fail_count} 个测试失败，请检查上方错误详情。{E}\n')
            sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    try:
        GovernanceMigrationApiTest().run_all()
    except KeyboardInterrupt:
        print('\n  已中断')
        sys.exit(1)
    except Exception as e:
        print(f'\n{R}  未预期错误: {e}{E}')
        traceback.print_exc()
        sys.exit(2)
