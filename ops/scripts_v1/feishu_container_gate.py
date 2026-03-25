#!/usr/bin/env python3
"""
飞书容器一致性门禁：
1) config/feishu.yaml 与 config/workstations.yaml 的工作台映射一致
2) app_id_env 必须一致
3) redirect_path 与工作台 path 语义一致（秘书台与其它台相同，为 /secretary）
4) 前端 App.tsx 使用 HashRouter
5) feishu-sdk auth.ts 保留端内免登能力（tt.requestAuthCode）
"""

from __future__ import annotations

import sys
import re
from pathlib import Path
import yaml


ROOT = Path(__file__).resolve().parents[1]


def read_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def ws_to_feishu_key(ws_key: str) -> str:
    return ws_key.replace("-", "_")


def normalize_path(path: str) -> str:
    if not path.startswith("/"):
        path = f"/{path}"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    return path


def read_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def check_configs() -> list[str]:
    issues: list[str] = []
    ws_data = read_yaml(ROOT / "config" / "workstations.yaml")
    feishu_data = read_yaml(ROOT / "config" / "feishu.yaml")

    ws_items = ws_data.get("workstations", [])
    feishu_apps = feishu_data.get("apps", {})

    # 全局关键字段
    open_platform = feishu_data.get("open_platform", {})
    if not open_platform.get("auth_url_template"):
        issues.append("config/feishu.yaml: 缺少 open_platform.auth_url_template")

    for ws in ws_items:
        ws_key = ws["key"]
        feishu_key = ws_to_feishu_key(ws_key)
        app = feishu_apps.get(feishu_key)
        if not app:
            issues.append(f"config/feishu.yaml: 缺少工作台映射 apps.{feishu_key}")
            continue

        ws_app_env = ws.get("app_id_env")
        feishu_app_env = app.get("app_id_env")
        if ws_app_env != feishu_app_env:
            issues.append(
                f"{ws_key}: app_id_env 不一致 workstations={ws_app_env} feishu={feishu_app_env}"
            )

        ws_path = normalize_path(ws.get("path", f"/{ws_key}"))
        redirect_path = normalize_path(app.get("redirect_path", ws_path))

        if redirect_path != ws_path:
            issues.append(
                f"{ws_key}: redirect_path({redirect_path}) 与 workstations.path({ws_path}) 不一致"
            )

    return issues


def check_frontend_router() -> list[str]:
    issues: list[str] = []
    ws_data = read_yaml(ROOT / "config" / "workstations.yaml")
    for ws in ws_data.get("workstations", []):
        app_file = ROOT / "apps" / ws["key"] / "src" / "App.tsx"
        if not app_file.exists():
            issues.append(f"{ws['key']}: 缺少 {app_file.relative_to(ROOT)}")
            continue
        content = app_file.read_text(encoding="utf-8")
        has_router = ("HashRouter" in content) or ("BrowserRouter" in content)
        if not has_router:
            issues.append(f"{ws['key']}: App.tsx 未使用 HashRouter/BrowserRouter（容器路由基线缺失）")
    return issues


def check_frontend_auth_config() -> list[str]:
    issues: list[str] = []
    ws_data = read_yaml(ROOT / "config" / "workstations.yaml")
    for ws in ws_data.get("workstations", []):
        layout_file = ROOT / "apps" / ws["key"] / "src" / "layouts" / "AppLayout.tsx"
        if not layout_file.exists():
            issues.append(f"{ws['key']}: 缺少 {layout_file.relative_to(ROOT)}")
            continue

        content = layout_file.read_text(encoding="utf-8")
        if "FeishuAuthProvider" not in content:
            issues.append(f"{ws['key']}: AppLayout.tsx 未使用 FeishuAuthProvider")
            continue
        uses_shared_builder = "createWorkstationFeishuConfig(" in content
        if "redirectUri" not in content and not uses_shared_builder:
            issues.append(f"{ws['key']}: AppLayout.tsx 缺少 redirectUri 配置")
        app_id_from_env = re.search(r"appId\s*:\s*import\.meta\.env\.VITE_FEISHU_APP_ID", content)
        if not app_id_from_env and not uses_shared_builder:
            issues.append(
                f"{ws['key']}: AppLayout.tsx appId 未统一使用共享构造器或 import.meta.env.VITE_FEISHU_APP_ID"
            )
        if re.search(r"appId\s*:\s*['\"]cli_[^'\"]+['\"]", content):
            issues.append(f"{ws['key']}: AppLayout.tsx 存在硬编码 appId（cli_xxx）")
        workstation_match = re.search(r"workstation\s*:\s*['\"]([^'\"]+)['\"]", content)
        builder_match = re.search(r"createWorkstationFeishuConfig\(\s*['\"]([^'\"]+)['\"]\s*\)", content)
        if workstation_match:
            if workstation_match.group(1) != ws["key"]:
                issues.append(
                    f"{ws['key']}: FEISHU_CONFIG.workstation={workstation_match.group(1)} 与工作台 key 不一致"
                )
        elif builder_match:
            if builder_match.group(1) != ws["key"]:
                issues.append(
                    f"{ws['key']}: createWorkstationFeishuConfig({builder_match.group(1)}) 与工作台 key 不一致"
                )
        else:
            issues.append(f"{ws['key']}: AppLayout.tsx 缺少 workstation 配置（显式或共享构造器）")
    return issues


def check_feishu_auth_capability() -> list[str]:
    issues: list[str] = []
    auth_file = ROOT / "packages" / "feishu-sdk" / "src" / "auth.ts"
    if not auth_file.exists():
        return ["packages/feishu-sdk/src/auth.ts 不存在"]
    content = auth_file.read_text(encoding="utf-8")
    required_markers = ["requestAuthCode", "isInFeishu", "redirectToAuth"]
    for marker in required_markers:
        if marker not in content:
            issues.append(f"packages/feishu-sdk/src/auth.ts 缺少 {marker}（端内免登链路不完整）")
    return issues


def check_no_isolated_auth_impl() -> list[str]:
    issues: list[str] = []
    ws_data = read_yaml(ROOT / "config" / "workstations.yaml")
    isolated_patterns = [
        "window.location.href = 'https://open.feishu.cn",
        "window.location.href = \"https://open.feishu.cn",
        "/auth/feishu/callback",
        "requestAuthCode(",
    ]
    for ws in ws_data.get("workstations", []):
        src_dir = ROOT / "apps" / ws["key"] / "src"
        if not src_dir.exists():
            continue
        for file in src_dir.rglob("*.ts*"):
            content = file.read_text(encoding="utf-8")
            for marker in isolated_patterns:
                if marker in content:
                    issues.append(
                        f"{ws['key']}: 检测到疑似孤立认证实现 {file.relative_to(ROOT)} -> {marker}"
                    )
    return issues


def check_frontend_env_alignment() -> list[str]:
    issues: list[str] = []
    ws_data = read_yaml(ROOT / "config" / "workstations.yaml")
    deploy_env = read_dotenv(ROOT / "deploy" / ".env.volcengine.plan-a")
    for ws in ws_data.get("workstations", []):
        ws_key = ws["key"]
        app_env_key = ws.get("app_id_env", "")
        expected_app_id = deploy_env.get(app_env_key, "")
        app_env_file = ROOT / "apps" / ws_key / ".env"
        app_env = read_dotenv(app_env_file)
        frontend_app_id = app_env.get("VITE_FEISHU_APP_ID", "")
        if not frontend_app_id:
            issues.append(f"{ws_key}: apps/{ws_key}/.env 缺少 VITE_FEISHU_APP_ID")
            continue
        if expected_app_id and frontend_app_id != expected_app_id:
            issues.append(
                f"{ws_key}: VITE_FEISHU_APP_ID 与 deploy/.env.volcengine.plan-a 中 {app_env_key} 不一致"
            )
    return issues


def main() -> int:
    issues: list[str] = []
    issues.extend(check_configs())
    issues.extend(check_frontend_router())
    issues.extend(check_frontend_auth_config())
    issues.extend(check_feishu_auth_capability())
    issues.extend(check_no_isolated_auth_impl())
    issues.extend(check_frontend_env_alignment())

    print("=" * 64)
    print("  飞书容器一致性门禁")
    print("=" * 64)
    if issues:
        for item in issues:
            print(f"[FAIL] {item}")
        print("-" * 64)
        print(f"检查失败：{len(issues)} 个问题")
        return 1

    print("[PASS] 配置映射、路由模式、认证配置、端内免登能力、无孤立认证实现、环境一致性检查通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
