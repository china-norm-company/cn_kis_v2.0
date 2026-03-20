#!/usr/bin/env python3
"""
工作台健康检查脚本 — 自动检测所有工作台的配置完整性

从 config/workstations.yaml（唯一真相源）读取工作台列表，
逐项检查各配置文件是否包含所有工作台，报告缺失和不一致。

用法:
    python scripts/workstation_health_check.py
    python scripts/workstation_health_check.py --fix  # 显示修复建议
"""

import os
import re
import sys
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOW_FIX = '--fix' in sys.argv
CI_MODE = os.getenv('CI', '').lower() == 'true' or os.getenv('GITHUB_ACTIONS', '').lower() == 'true'
DEPLOY_ENV_PATH = 'deploy/.env.volcengine.plan-a'
DEPLOY_ENV_EXAMPLE_PATH = 'deploy/.env.volcengine.plan-a.example'


def _parse_only_filter():
    """解析 --only key1,key2 参数，返回要检查的工作台 key 集合，空表示全部"""
    for arg in sys.argv[1:]:
        if arg.startswith('--only='):
            return set(k.strip() for k in arg[7:].split(',') if k.strip())
        if arg == '--only' and len(sys.argv) > sys.argv.index(arg) + 1:
            return set(k.strip() for k in sys.argv[sys.argv.index(arg) + 1].split(',') if k.strip())
    return None


def load_workstations():
    path = os.path.join(ROOT, 'config', 'workstations.yaml')
    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    return data['workstations']


def read_file(rel_path):
    full = os.path.join(ROOT, rel_path)
    if not os.path.exists(full):
        return None
    with open(full, 'r', encoding='utf-8') as f:
        return f.read()


def parse_env(content):
    data = {}
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        data[key.strip()] = value.strip()
    return data


def read_deploy_env_content():
    content = read_file(DEPLOY_ENV_PATH)
    if content:
        return content, DEPLOY_ENV_PATH
    if CI_MODE:
        example = read_file(DEPLOY_ENV_EXAMPLE_PATH)
        if example:
            return example, DEPLOY_ENV_EXAMPLE_PATH
    return None, ''


def check_frontend_app(ws, errors, warnings):
    key = ws['key']
    app_dir = os.path.join(ROOT, 'apps', key)

    if not os.path.isdir(app_dir):
        errors.append(f"前端目录不存在: apps/{key}/")
        return

    required_files = [
        f'apps/{key}/index.html',
        f'apps/{key}/package.json',
        f'apps/{key}/.env',
        f'apps/{key}/src/main.tsx',
        f'apps/{key}/src/App.tsx',
        f'apps/{key}/src/layouts/AppLayout.tsx',
        f'apps/{key}/vite.config.ts',
    ]
    for f in required_files:
        if not os.path.exists(os.path.join(ROOT, f)):
            errors.append(f"前端文件缺失: {f}")

    env_content = read_file(f'apps/{key}/.env')
    if env_content:
        if 'VITE_FEISHU_APP_ID=' not in env_content:
            errors.append(f"apps/{key}/.env 缺少 VITE_FEISHU_APP_ID")
        if 'VITE_API_BASE_URL=' not in env_content:
            warnings.append(f"apps/{key}/.env 缺少 VITE_API_BASE_URL（建议添加）")

    vite_content = read_file(f'apps/{key}/vite.config.ts')
    if vite_content:
        expected_base = f"base: '/{key}/'"
        if expected_base not in vite_content and f"'{key}/'" not in vite_content:
            errors.append(f"apps/{key}/vite.config.ts base 路径可能不匹配（期望: /{key}/）")


def check_deploy_env(ws, errors, warnings):
    """部署环境变量检查。全工作台统一使用子衿时，仅要求 deploy 有 FEISHU_APP_ID / FEISHU_APP_SECRET。"""
    key = ws['key']
    env_var = ws['app_id_env']
    content, source_path = read_deploy_env_content()
    if not content:
        errors.append(f"{DEPLOY_ENV_PATH} 文件不存在")
        return
    if source_path != DEPLOY_ENV_PATH:
        warnings.append(f"{DEPLOY_ENV_PATH} 不存在，当前使用 {source_path} 仅做结构校验")

    deploy_env = parse_env(content)
    has_primary = bool(deploy_env.get('FEISHU_APP_ID') and deploy_env.get('FEISHU_APP_SECRET'))
    if not has_primary:
        errors.append(f"{source_path} 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET（子衿主应用凭证）")
        return

    # 全工作台统一子衿：仅主应用凭证必填，各工作台独立 FEISHU_APP_ID_XXX 不再强制
    if env_var == 'FEISHU_APP_ID':
        if not deploy_env.get('FEISHU_APP_ID') or not deploy_env.get('FEISHU_APP_SECRET'):
            errors.append(f"{source_path} 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET")
        return
    # app_id_env 为 FEISHU_APP_ID_FINANCE 等时，统一子衿模式下不要求单独配置
    # （后端用 FEISHU_PRIMARY_APP_ID 等逻辑，deploy 只需主凭证）


def check_nginx_conf(ws, errors, warnings):
    key = ws['key']
    content = read_file('deploy/nginx.conf')
    if not content:
        errors.append("deploy/nginx.conf 文件不存在")
        return

    if f'location /{key}' not in content:
        errors.append(f"deploy/nginx.conf 缺少 location /{key}")

    cache_pattern = re.search(r'location ~\*.*?/assets/', content)
    if cache_pattern:
        cache_line = content[cache_pattern.start():content.index('\n', cache_pattern.start())]
        if key not in cache_line:
            warnings.append(f"deploy/nginx.conf 静态资源缓存规则可能未包含 {key}")


def check_deploy_script_global(errors, warnings):
    """全局检查：部署脚本是否使用动态工作台列表"""
    content = read_file('scripts/deploy_volcengine.sh')
    if not content:
        errors.append("scripts/deploy_volcengine.sh 文件不存在")
        return

    if 'workstations.yaml' not in content:
        errors.append("deploy_volcengine.sh 未从 workstations.yaml 动态读取工作台列表")

    if '$WORKSTATIONS' not in content and '${WORKSTATIONS}' not in content:
        errors.append("deploy_volcengine.sh 未使用动态工作台变量 $WORKSTATIONS")

    if "cat > /etc/nginx" in content:
        errors.append("deploy_volcengine.sh 仍包含内联 Nginx 配置，应使用 deploy/nginx.conf")


def check_quality_gate_global(errors, warnings):
    """全局检查：质量门禁脚本完整性"""
    content = read_file('scripts/quality_gate.sh')
    if not content:
        warnings.append("scripts/quality_gate.sh 文件不存在")
        return

    if 'workstations.yaml' not in content:
        errors.append("quality_gate.sh 未从 workstations.yaml 动态读取工作台列表")

    if 'workstation_health_check' not in content:
        errors.append("quality_gate.sh 未集成工作台健康检查")


def check_docker_compose(ws, errors, warnings):
    key = ws['key']
    content = read_file('docker-compose.yml')
    if not content:
        warnings.append("docker-compose.yml 文件不存在")
        return

    if f'apps/{key}/dist:/var/www/cn-kis/{key}' not in content:
        errors.append(f"docker-compose.yml 缺少 {key} 的 volume 映射")


def check_package_json(ws, errors, warnings):
    key = ws['key']
    pkg = ws['package']
    content = read_file('package.json')
    if not content:
        return

    if f'"build:{key}"' not in content:
        warnings.append(f"package.json 缺少 build:{key} 命令")
    if f'"dev:{key}"' not in content:
        warnings.append(f"package.json 缺少 dev:{key} 命令")


def check_backend_settings(ws, errors, warnings):
    env_var = ws['app_id_env']
    content = read_file('backend/settings.py')
    if not content:
        errors.append("backend/settings.py 文件不存在")
        return

    if env_var not in content:
        errors.append(f"backend/settings.py 未引用 {env_var}")


def check_app_id_consistency(ws, errors, warnings):
    """检查前端 .env 的 App ID 与 deploy 主应用一致。全工作台统一子衿时均与 FEISHU_APP_ID 比对。"""
    key = ws['key']
    content, source_path = read_deploy_env_content()
    if not content:
        return
    deploy_env = parse_env(content)
    primary_app_id = (deploy_env.get('FEISHU_APP_ID') or '').strip()
    if not primary_app_id:
        return

    frontend_env = read_file(f'apps/{key}/.env')
    if not frontend_env:
        return
    fe_match = re.search(r'VITE_FEISHU_APP_ID=(.+)', frontend_env)
    if not fe_match:
        return
    fe_id = fe_match.group(1).strip()
    if fe_id != primary_app_id:
        errors.append(
            f"App ID 不一致！apps/{key}/.env: {fe_id} vs deploy 主应用 (FEISHU_APP_ID): {primary_app_id}"
        )


def check_nginx_security(errors, warnings):
    """检查 Nginx 安全头配置"""
    content = read_file('deploy/nginx.conf')
    if not content:
        return

    if 'X-Frame-Options' in content:
        if 'SAMEORIGIN' in content:
            errors.append(
                "deploy/nginx.conf 设置了 X-Frame-Options: SAMEORIGIN，"
                "可能阻止飞书客户端加载。飞书 H5 应用建议移除此头或改用 CSP frame-ancestors"
            )

    deploy_script = read_file('scripts/deploy_volcengine.sh')
    if deploy_script and re.search(r'^\s*add_header\s+X-Frame-Options', deploy_script, re.MULTILINE):
        if 'SAMEORIGIN' in deploy_script:
            errors.append(
                "deploy_volcengine.sh 中生成的 Nginx 配置包含 X-Frame-Options: SAMEORIGIN，"
                "飞书 H5 应用中此头可能导致页面无法加载"
            )


def check_deploy_nginx_sync(errors, warnings):
    """检查本地 nginx.conf 与部署脚本中生成的 Nginx 配置是否同步"""
    deploy_script = read_file('scripts/deploy_volcengine.sh')
    if not deploy_script:
        return

    if "cat > /etc/nginx" in deploy_script:
        warnings.append(
            "deploy_volcengine.sh 中内联生成 Nginx 配置，未使用 deploy/nginx.conf。"
            "两处各自维护容易不同步，建议改为直接使用 deploy/nginx.conf"
        )


def check_runtime_env_alignment(workstations, errors, warnings):
    """
    检查运行时 backend/.env 与 deploy/.env 的关键配置对齐情况。
    目的：避免“部署后后端实际加载了旧环境变量”导致飞书登录整体异常。
    """
    deploy_content = read_file(DEPLOY_ENV_PATH)
    runtime_content = read_file('backend/.env')
    if not deploy_content or not runtime_content:
        if CI_MODE and not deploy_content:
            warnings.append(f"{DEPLOY_ENV_PATH} 不存在，跳过运行时环境对齐校验")
        return

    deploy_env = parse_env(deploy_content)
    runtime_env = parse_env(runtime_content)

    for ws in workstations:
        app_id_env = ws['app_id_env']
        app_secret_env = app_id_env.replace('APP_ID', 'APP_SECRET')
        for env_key in (app_id_env, app_secret_env):
            deploy_v = deploy_env.get(env_key, '')
            runtime_v = runtime_env.get(env_key, '')
            if deploy_v and runtime_v and deploy_v != runtime_v:
                errors.append(
                    f"backend/.env 与 deploy/.env 的 {env_key} 不一致（可能导致运行时飞书登录异常）"
                )

    if 'REDIS_URL' not in runtime_env:
        warnings.append("backend/.env 缺少 REDIS_URL，缓存不可用时 OAuth 防重放将降级为进程内存模式")


def main():
    workstations = load_workstations()
    only_filter = _parse_only_filter()
    if only_filter:
        workstations = [ws for ws in workstations if ws['key'] in only_filter]
        if not workstations:
            print(f"错误: --only 指定的工作台不存在")
            return 1
        print(f"仅检查工作台: {', '.join(ws['key'] for ws in workstations)}")
        print()
    total_errors = 0
    total_warnings = 0
    ws_results = []

    print("=" * 64)
    print("  CN KIS V1.0 工作台健康检查")
    print(f"  工作台数量: {len(workstations)}")
    print("=" * 64)
    print()

    for ws in workstations:
        errors = []
        warnings = []

        check_frontend_app(ws, errors, warnings)
        check_deploy_env(ws, errors, warnings)
        check_nginx_conf(ws, errors, warnings)
        check_docker_compose(ws, errors, warnings)
        check_package_json(ws, errors, warnings)
        check_backend_settings(ws, errors, warnings)
        check_app_id_consistency(ws, errors, warnings)

        status = "PASS" if not errors else "FAIL"
        icon = "✓" if not errors else "✗"
        ws_results.append((ws, errors, warnings, status))
        total_errors += len(errors)
        total_warnings += len(warnings)

        print(f"[{icon}] {ws['name']} ({ws['key']})")
        if errors:
            for e in errors:
                print(f"    ✗ {e}")
        if warnings:
            for w in warnings:
                print(f"    ⚠ {w}")
        if not errors and not warnings:
            print(f"    ✓ 全部检查通过")
        print()

    global_errors = []
    global_warnings = []
    check_nginx_security(global_errors, global_warnings)
    check_deploy_nginx_sync(global_errors, global_warnings)
    check_deploy_script_global(global_errors, global_warnings)
    check_quality_gate_global(global_errors, global_warnings)
    check_runtime_env_alignment(workstations, global_errors, global_warnings)

    if global_errors or global_warnings:
        print("-" * 64)
        print("  全局检查")
        print("-" * 64)
        for e in global_errors:
            print(f"  ✗ {e}")
            total_errors += 1
        for w in global_warnings:
            print(f"  ⚠ {w}")
            total_warnings += 1
        print()

    print("=" * 64)
    passed = sum(1 for _, e, _, _ in ws_results if not e)
    failed = len(ws_results) - passed
    print(f"  结果: {passed} 通过, {failed} 失败")
    print(f"  错误: {total_errors}, 警告: {total_warnings}")
    if total_errors > 0:
        print("  状态: 未通过 — 请修复以上错误后再部署")
    else:
        print("  状态: 通过")
    print("=" * 64)

    return 1 if total_errors > 0 else 0


if __name__ == '__main__':
    sys.exit(main())
