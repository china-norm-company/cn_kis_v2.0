#!/usr/bin/env python3
"""
架构重构验收测试脚本

验收范围：
  1. OAuth 统一授权 — 18 个工作台 VITE_FEISHU_APP_ID 统一
  2. 工作台注册完整性 — workstations.yaml / settings.py / nginx / feishu.yaml
  3. 子衿瘦身 — AI 和 admin 路由/导航已移除
  4. 鹿鸣·治理台 — 命名更新、配置注册
  5. 中书·智能台 — 配置注册、角色映射
  6. 文档口径一致 — 18 台统一口径
  7. 后端权限体系 — ROLE_WORKBENCH_MAP / MODULE_MENU_MAP / VALID_WORKSTATION_KEYS

用法:
    python scripts/test_arch_restructure_acceptance.py
"""

import os
import re
import sys
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIJIN_APP_ID = 'cli_a98b0babd020500e'

ALL_18_KEYS = [
    'secretary', 'finance', 'research', 'execution', 'quality',
    'hr', 'crm', 'recruitment', 'equipment', 'material',
    'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
    'control-plane', 'admin', 'digital-workforce',
]

BUSINESS_KEYS = ALL_18_KEYS[:15]
PLATFORM_KEYS = ALL_18_KEYS[15:]


class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.details = []
        self._section = ''

    def section(self, name):
        self._section = name
        self.details.append(('section', name))

    def ok(self, desc):
        self.passed += 1
        self.details.append(('pass', desc))

    def fail(self, desc):
        self.failed += 1
        self.details.append(('fail', desc))

    def check(self, condition, desc):
        if condition:
            self.ok(desc)
        else:
            self.fail(desc)

    def report(self):
        print()
        print('=' * 72)
        print('  CN KIS V1.0 架构重构验收测试报告')
        print('=' * 72)
        print()

        for kind, text in self.details:
            if kind == 'section':
                print(f'  [{text}]')
            elif kind == 'pass':
                print(f'    \033[32mPASS\033[0m  {text}')
            elif kind == 'fail':
                print(f'    \033[31mFAIL\033[0m  {text}')

        print()
        print('-' * 72)
        total = self.passed + self.failed
        print(f'  总计: {total}  通过: {self.passed}  失败: {self.failed}')
        if self.failed == 0:
            print('  \033[32m验收通过\033[0m')
        else:
            print('  \033[31m验收未通过 — 请修复以上 FAIL 项\033[0m')
        print('-' * 72)
        return 0 if self.failed == 0 else 1


def read(rel_path):
    full = os.path.join(ROOT, rel_path)
    if not os.path.exists(full):
        return None
    with open(full, encoding='utf-8') as f:
        return f.read()


def test_oauth_unified(t: TestResult):
    """1. OAuth 统一授权"""
    t.section('1. OAuth 统一授权 — 所有工作台使用子衿 App ID')

    for key in ALL_18_KEYS:
        env = read(f'apps/{key}/.env')
        if env is None:
            t.fail(f'apps/{key}/.env 不存在')
            continue
        m = re.search(r'^VITE_FEISHU_APP_ID=(.+)$', env, re.MULTILINE)
        if not m:
            t.fail(f'apps/{key}/.env 缺少 VITE_FEISHU_APP_ID')
        elif m.group(1).strip() == ZIJIN_APP_ID:
            t.ok(f'{key}: VITE_FEISHU_APP_ID = {ZIJIN_APP_ID}')
        else:
            t.fail(f'{key}: VITE_FEISHU_APP_ID = {m.group(1).strip()} (应为 {ZIJIN_APP_ID})')


def test_workstations_yaml(t: TestResult):
    """2. workstations.yaml 完整性"""
    t.section('2. workstations.yaml — 18 个工作台注册')

    content = read('config/workstations.yaml')
    t.check(content is not None, 'config/workstations.yaml 存在')
    if not content:
        return

    keys_in_yaml = re.findall(r'^\s+- key:\s+(\S+)', content, re.MULTILINE)
    t.check(len(keys_in_yaml) == 18, f'工作台数量: {len(keys_in_yaml)}/18')

    for key in ALL_18_KEYS:
        t.check(key in keys_in_yaml, f'{key} 已注册')

    ports = re.findall(r'port:\s+(\d+)', content)
    t.check(len(ports) == len(set(ports)), f'端口无冲突 ({len(ports)} 个端口全部唯一)')


def test_settings_py(t: TestResult):
    """3. backend/settings.py"""
    t.section('3. backend/settings.py — 工作台映射与主授权配置')

    content = read('backend/settings.py')
    t.check(content is not None, 'backend/settings.py 存在')
    if not content:
        return

    m = re.search(r'FEISHU_WORKSTATION_APP_IDS\s*=\s*\{([^}]+)\}', content, re.DOTALL)
    t.check(m is not None, 'FEISHU_WORKSTATION_APP_IDS 已定义')
    if m:
        keys = re.findall(r"'([^']+)'\s*:", m.group(1))
        for key in ALL_18_KEYS:
            t.check(key in keys, f'WORKSTATION_APP_IDS 包含 {key}')

    t.check("FEISHU_PRIMARY_APP_ID" in content, 'FEISHU_PRIMARY_APP_ID 已定义')
    t.check("cli_a98b0babd020500e" in content, 'FEISHU_PRIMARY_APP_ID 默认值为子衿')
    t.check("FEISHU_PRIMARY_AUTH_FORCE" in content, 'FEISHU_PRIMARY_AUTH_FORCE 开关存在')


def test_nginx(t: TestResult):
    """4. deploy/nginx.conf"""
    t.section('4. deploy/nginx.conf — 路由与缓存覆盖')

    content = read('deploy/nginx.conf')
    t.check(content is not None, 'deploy/nginx.conf 存在')
    if not content:
        return

    for key in ALL_18_KEYS:
        t.check(f'location /{key}' in content, f'location /{key} 存在')

    assets_re = re.search(r'location ~\*.*?/assets/\s*\{', content)
    if assets_re:
        assets_line = content[assets_re.start():content.index('{', assets_re.start())]
        for key in ALL_18_KEYS:
            t.check(key in assets_line, f'静态资源缓存规则包含 {key}')

    t.check('/login' in content, '/login OAuth 回调路由存在')
    t.check('no-store' in content, 'index.html 禁缓存规则存在')


def test_feishu_yaml(t: TestResult):
    """5. config/feishu.yaml"""
    t.section('5. config/feishu.yaml — redirect_uri 与应用定义')

    content = read('config/feishu.yaml')
    t.check(content is not None, 'config/feishu.yaml 存在')
    if not content:
        return

    uris = re.findall(r'http://118\.196\.64\.48/[^\s]+', content)
    t.check(len(uris) >= 18, f'redirect_uri 数量: {len(uris)} (>=18)')

    path_map = {
        'secretary': '/login',
        'finance': '/finance/',
        'admin': '/admin/',
        'digital-workforce': '/digital-workforce/',
        'control-plane': '/control-plane/',
        'reception': '/reception/',
    }
    for key, path in path_map.items():
        t.check(f'118.196.64.48{path}' in content, f'redirect_uri 包含 {path} ({key})')

    for app_key in ['admin', 'digital_workforce', 'control_plane']:
        t.check(f'  {app_key}:' in content, f'飞书应用定义包含 {app_key}')


def test_secretary_slim(t: TestResult):
    """6. 子衿瘦身验证"""
    t.section('6. 子衿瘦身 — AI/admin 路由与导航已移除')

    app_tsx = read('apps/secretary/src/App.tsx')
    t.check(app_tsx is not None, 'apps/secretary/src/App.tsx 存在')
    if app_tsx:
        removed_routes = ['/chat', '/assistant', '/admin/roles', '/admin/accounts', '/audit-logs']
        for route in removed_routes:
            t.check(route not in app_tsx, f'App.tsx 不含路由 {route}')

        kept_routes = ['/portal', '/dashboard', '/todo', '/notifications', '/alerts', '/manager']
        for route in kept_routes:
            t.check(route in app_tsx, f'App.tsx 保留路由 {route}')

        removed_imports = ['ChatPage', 'AssistantActionsPage', 'AssistantReplayPage',
                           'AssistantPolicyPage', 'AssistantPreferencePage',
                           'RolesPage', 'AccountsPage', 'AuditLogPage']
        for imp in removed_imports:
            t.check(imp not in app_tsx, f'App.tsx 不含 import {imp}')

    layout = read('apps/secretary/src/layouts/AppLayout.tsx')
    if layout:
        t.check("AI助手" not in layout, '导航不含 "AI助手" 组')
        t.check("系统管理" not in layout, '导航不含 "系统管理" 组')
        t.check("审计日志" not in layout, '导航不含 "审计日志"')

        t.check("门户" in layout, '导航保留 "门户" 组')
        t.check("工作中心" in layout, '导航保留 "工作中心" 组')
        t.check("管理视图" in layout, '导航保留 "管理视图" 组')


def test_admin_luming(t: TestResult):
    """7. 鹿鸣·治理台命名"""
    t.section('7. 鹿鸣·治理台 — 命名一致性')

    layout = read('apps/admin/src/layouts/AppLayout.tsx')
    t.check(layout is not None, 'apps/admin/src/layouts/AppLayout.tsx 存在')
    if layout:
        t.check('鹿鸣·治理台' in layout, '前端标题为 "鹿鸣·治理台"')
        t.check('典正' not in layout, '无 "典正" 残留')
        t.check('御史·管理台' not in layout, '无 "御史·管理台" 残留')

    pkg = read('apps/admin/package.json')
    if pkg:
        t.check('鹿鸣' in pkg, 'package.json description 包含 "鹿鸣"')
        t.check('御史' not in pkg, 'package.json 无 "御史" 残留')

    env = read('apps/admin/.env')
    t.check(env is not None, 'apps/admin/.env 存在')

    ws_yaml = read('config/workstations.yaml')
    if ws_yaml:
        t.check('鹿鸣·治理台' in ws_yaml, 'workstations.yaml 名称为 "鹿鸣·治理台"')


def test_digital_workforce(t: TestResult):
    """8. 中书·智能台注册"""
    t.section('8. 中书·智能台 — 配置注册完整性')

    env = read('apps/digital-workforce/.env')
    t.check(env is not None, 'apps/digital-workforce/.env 存在')
    if env:
        m = re.search(r'^VITE_FEISHU_APP_ID=(.+)$', env, re.MULTILINE)
        t.check(m and m.group(1).strip() == ZIJIN_APP_ID, f'VITE_FEISHU_APP_ID = {ZIJIN_APP_ID}')

    ws_yaml = read('config/workstations.yaml')
    if ws_yaml:
        t.check('中书·智能台' in ws_yaml, 'workstations.yaml 包含 "中书·智能台"')
        t.check('3018' in ws_yaml, '端口 3018 已分配')

    nginx = read('deploy/nginx.conf')
    if nginx:
        t.check('location /digital-workforce' in nginx, 'nginx 路由已配置')


def test_portal_page(t: TestResult):
    """9. 子衿门户页工作台卡片"""
    t.section('9. 子衿门户 — 18 个工作台卡片')

    portal = read('apps/secretary/src/pages/PortalPage.tsx')
    t.check(portal is not None, 'PortalPage.tsx 存在')
    if not portal:
        return

    card_keys = re.findall(r"key:\s*'([^']+)'", portal)
    t.check(len(card_keys) == 18, f'卡片数量: {len(card_keys)}/18')

    for key in ALL_18_KEYS:
        t.check(key in card_keys, f'卡片包含 {key}')

    t.check('鹿鸣·治理台' in portal, '卡片名为 "鹿鸣·治理台"')
    t.check('中书·智能台' in portal, '卡片名为 "中书·智能台"')
    t.check('天工·统管台' in portal, '卡片名为 "天工·统管台"')

    t.check('platformKeys' in portal or 'isAdmin' in portal,
            '平台台卡片按管理员权限过滤')


def test_backend_rbac(t: TestResult):
    """10. 后端权限体系"""
    t.section('10. 后端权限体系 — RBAC 完整性')

    # ROLE_WORKBENCH_MAP
    seed = read('backend/apps/identity/management/commands/seed_roles.py')
    t.check(seed is not None, 'seed_roles.py 存在')
    if seed:
        m = re.search(r'ROLE_WORKBENCH_MAP\s*=\s*\{([^}]+)\}', seed, re.DOTALL)
        if m:
            block = m.group(1)
            for key in PLATFORM_KEYS:
                t.check(f"'{key}'" in block, f'ROLE_WORKBENCH_MAP 包含 {key}')

            sa_block = re.search(r"'superadmin':\s*\[([^\]]+)\]", block)
            if sa_block:
                t.check('digital-workforce' in sa_block.group(1),
                        'superadmin 可访问 digital-workforce')

    # MODULE_MENU_MAP & VALID_WORKSTATION_KEYS
    api = read('backend/apps/identity/api.py')
    t.check(api is not None, 'identity/api.py 存在')
    if api:
        m = re.search(r'MODULE_MENU_MAP\s*=\s*\{(.+?)\n    \}', api, re.DOTALL)
        if m:
            menu_keys = re.findall(r"'([^']+)'\s*:\s*\{", m.group(1))
            t.check(len(menu_keys) >= 18, f'MODULE_MENU_MAP 工作台数: {len(menu_keys)}/18')
            t.check('digital-workforce' in menu_keys, 'MODULE_MENU_MAP 包含 digital-workforce')
            t.check('admin' in menu_keys, 'MODULE_MENU_MAP 包含 admin')

        m = re.search(r'VALID_WORKSTATION_KEYS\s*=\s*\{([^}]+)\}', api, re.DOTALL)
        if m:
            valid_keys = re.findall(r"'([^']+)'", m.group(1))
            t.check(len(valid_keys) >= 18, f'VALID_WORKSTATION_KEYS 数: {len(valid_keys)}/18')
            for key in PLATFORM_KEYS:
                t.check(key in valid_keys, f'VALID_WORKSTATION_KEYS 包含 {key}')


def test_docs_consistency(t: TestResult):
    """11. 文档口径一致性"""
    t.section('11. 文档口径 — 18 台统一')

    md = read('docs/WORKSTATION_INDEPENDENCE.md')
    if md:
        rows = re.findall(r'^\| \d+', md, re.MULTILINE)
        t.check(len(rows) == 18, f'WORKSTATION_INDEPENDENCE.md 工作台行数: {len(rows)}/18')
        t.check('18 个' in md, '文档声明 "18 个" 工作台')
        t.check('鹿鸣·治理台' in md, '文档包含 "鹿鸣·治理台"')
        t.check('中书·智能台' in md, '文档包含 "中书·智能台"')
        t.check('典正' not in md, '文档无 "典正" 残留')

    mdc = read('.cursor/rules/workstation-independence.mdc')
    if mdc:
        rows = re.findall(r'^\| \d+', mdc, re.MULTILINE)
        t.check(len(rows) == 18, f'workstation-independence.mdc 工作台行数: {len(rows)}/18')
        t.check('18 个' in mdc, 'mdc 声明 "18 个" 工作台')
        t.check('典正' not in mdc, 'mdc 无 "典正" 残留')

    scope = read('docs/WORKSTATION_SCOPE_CANONICAL.md')
    if scope:
        t.check('18' in scope, 'SCOPE_CANONICAL 声明 18 台')
        active_old = [ln for ln in scope.splitlines()
                      if '15 个工作台 + 1' in ln and '~~' not in ln]
        t.check(len(active_old) == 0, 'SCOPE_CANONICAL 无旧口径 "15+1"（删除线标注除外）')

    ctx = read('.cursor/rules/00-project-context.mdc')
    if ctx:
        t.check('cli_a98b0babd020500e' in ctx, '00-project-context 子衿 App ID 正确')
        t.check('cli_a907f21f0723dbce' not in ctx, '00-project-context 无旧错误 App ID')


def test_oauth_flow_e2e(t: TestResult):
    """12. OAuth 端到端流程一致性"""
    t.section('12. OAuth 端到端流程 — code/credential 匹配验证')

    config_ts = read('packages/feishu-sdk/src/config.ts')
    t.check(config_ts is not None, 'feishu-sdk config.ts 存在')
    if config_ts:
        t.check('import.meta.env.VITE_FEISHU_APP_ID' in config_ts,
                'config.ts 从 VITE_FEISHU_APP_ID 读取 appId')
        t.check("normalized === 'secretary'" in config_ts,
                'secretary 使用 /login 作为 redirect_uri')
        t.check('/${normalized}/' in config_ts,
                '其他工作台使用 /${key}/ 作为 redirect_uri')

    auth_ts = read('packages/feishu-sdk/src/auth.ts')
    if auth_ts:
        t.check('app_id: this.config.appId' in auth_ts,
                'exchangeCode 发送 app_id = config.appId（即 VITE_FEISHU_APP_ID）')
        t.check('workstation: this.config.workstation' in auth_ts,
                'exchangeCode 发送 workstation 标识')

    api = read('backend/apps/identity/api.py')
    if api:
        t.check('FEISHU_PRIMARY_AUTH_FORCE' in api,
                '后端 callback 含 FEISHU_PRIMARY_AUTH_FORCE 逻辑')
        t.check("force_primary and primary_app_id" in api,
                '后端在 force_primary 时替换 app_id 为子衿')

    settings = read('backend/settings.py')
    if settings:
        t.check("'1', 'true', 'yes'" in settings and 'FEISHU_PRIMARY_AUTH_FORCE' in settings,
                'FEISHU_PRIMARY_AUTH_FORCE 默认开启')

    for key in ['admin', 'digital-workforce', 'control-plane', 'finance', 'research']:
        ws_appLayout = read(f'apps/{key}/src/layouts/AppLayout.tsx')
        if ws_appLayout:
            m = re.search(r"createWorkstationFeishuConfig\('([^']+)'\)", ws_appLayout)
            if m:
                t.check(m.group(1) == key,
                        f'{key} AppLayout 调用 createWorkstationFeishuConfig(\'{key}\')')


def test_secretary_cleanup(t: TestResult):
    """13. 子衿清理完整性"""
    t.section('13. 子衿清理 — 孤立文件与菜单映射')

    orphan_files = [
        'ChatPage.tsx', 'AuditLogPage.tsx',
        'AssistantActionsPage.tsx', 'AssistantReplayPage.tsx',
        'AssistantPolicyPage.tsx', 'AssistantPreferencePage.tsx',
    ]
    for f in orphan_files:
        t.check(not os.path.exists(os.path.join(ROOT, f'apps/secretary/src/pages/{f}')),
                f'孤立文件已清理: {f}')

    t.check(not os.path.isdir(os.path.join(ROOT, 'apps/secretary/src/pages/admin')),
            '孤立目录已清理: pages/admin/')

    kept_pages = [
        'PortalPage.tsx', 'DashboardPage.tsx', 'TodoCenterPage.tsx',
        'NotificationCenterPage.tsx', 'AlertCenterPage.tsx', 'ManagerDashboardPage.tsx',
    ]
    for f in kept_pages:
        t.check(os.path.exists(os.path.join(ROOT, f'apps/secretary/src/pages/{f}')),
                f'保留页面存在: {f}')

    api = read('backend/apps/identity/api.py')
    if api:
        m = re.search(r"'secretary':\s*\{([^}]+)\}", api)
        if m:
            sec_menus = m.group(1)
            migrated = ['chat', 'audit-logs', 'admin/roles', 'admin/accounts',
                        'actions', 'replay', 'policies', 'preferences']
            for item in migrated:
                t.check(f"'{item}'" not in sec_menus,
                        f'MODULE_MENU_MAP secretary 不含已迁移项 {item}')

            kept = ['portal', 'dashboard', 'todo', 'notifications', 'alerts', 'manager']
            for item in kept:
                t.check(f"'{item}'" in sec_menus,
                        f'MODULE_MENU_MAP secretary 保留 {item}')


def test_admin_menu_completeness(t: TestResult):
    """14. 鹿鸣菜单映射与前端匹配"""
    t.section('14. 鹿鸣 MODULE_MENU_MAP — 与前端路由匹配')

    api = read('backend/apps/identity/api.py')
    if not api:
        return

    m = re.search(r"'admin':\s*\{([^}]+)\}", api)
    if not m:
        t.fail('MODULE_MENU_MAP 无 admin 条目')
        return

    admin_menus = re.findall(r"'([^']+)'\s*:", m.group(1))

    admin_app = read('apps/admin/src/App.tsx')
    if admin_app:
        frontend_routes = re.findall(r'path="(/[^"]+)"', admin_app)
        frontend_keys = [r.strip('/') for r in frontend_routes if r != '/']
        for route in frontend_keys:
            t.check(route in admin_menus,
                    f'admin 前端路由 /{route} 在 MODULE_MENU_MAP 中有映射')


def test_docstring_consistency(t: TestResult):
    """15. 关键 docstring 与注释口径"""
    t.section('15. 代码注释口径 — 无过时数字')

    api = read('backend/apps/identity/api.py')
    if api:
        t.check('支持 15 个' not in api, 'identity/api.py 无 "支持 15 个" 过时注释')
        t.check('18 个工作台' in api, 'feishu_callback docstring 更新为 18 台')

    settings = read('backend/settings.py')
    if settings:
        has_15_comment = bool(re.search(r'#.*15 个', settings))
        t.check(not has_15_comment, 'settings.py 无 "15 个" 过时注释')


def test_no_stale_references(t: TestResult):
    """16. 全局无陈旧引用"""
    t.section('16. 全局检查 — 无冲突标记、无陈旧命名')

    scan_dirs = ['apps/secretary/src', 'apps/admin/src', 'config', 'deploy',
                 'backend/settings.py', 'backend/apps/identity']
    stale_found = []
    conflict_found = []

    for scan_path in scan_dirs:
        full_path = os.path.join(ROOT, scan_path)
        if os.path.isfile(full_path):
            files = [full_path]
        elif os.path.isdir(full_path):
            files = []
            for dirpath, _, filenames in os.walk(full_path):
                for fn in filenames:
                    if fn.endswith(('.py', '.tsx', '.ts', '.yaml', '.yml', '.md', '.mdc', '.conf')):
                        files.append(os.path.join(dirpath, fn))
        else:
            continue

        for fpath in files:
            try:
                with open(fpath, encoding='utf-8') as f:
                    content = f.read()
            except Exception:
                continue

            rel = os.path.relpath(fpath, ROOT)

            if '<<<<<<< ' in content:
                conflict_found.append(rel)

            if '典正' in content:
                stale_found.append(f'{rel}: 包含 "典正"')

    t.check(len(conflict_found) == 0,
            f'无冲突标记 ({len(conflict_found)} 处)' if conflict_found else '无冲突标记残留')
    t.check(len(stale_found) == 0,
            f'无 "典正" 残留 ({len(stale_found)} 处)' if stale_found else '关键目录无 "典正" 残留')

    for item in stale_found:
        t.fail(f'  → {item}')


def main():
    t = TestResult()

    test_oauth_unified(t)
    test_workstations_yaml(t)
    test_settings_py(t)
    test_nginx(t)
    test_feishu_yaml(t)
    test_secretary_slim(t)
    test_admin_luming(t)
    test_digital_workforce(t)
    test_portal_page(t)
    test_backend_rbac(t)
    test_docs_consistency(t)
    test_oauth_flow_e2e(t)
    test_secretary_cleanup(t)
    test_admin_menu_completeness(t)
    test_docstring_consistency(t)
    test_no_stale_references(t)

    return t.report()


if __name__ == '__main__':
    sys.exit(main())
