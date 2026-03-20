#!/usr/bin/env python3
"""
移动化完成度门禁：
1) AppLayout 必须使用 MobileWorkstationLayout
1.1) AppLayout 必须配置 mobilePrimaryNavItems（移动高频导航）
2) 每个工作台必须存在移动导航冒烟用例（01-navigation.mobile.spec.ts）
3) 每个工作台必须存在核心流程移动用例（02-core-flow.mobile.spec.ts）
4) 每个工作台必须存在飞书容器差异用例（03-feishu-container.mobile.spec.ts）
5) playwright.config.ts 必须包含 iPhone 13 + mobile testMatch
"""

from __future__ import annotations

import sys
from pathlib import Path
import yaml


ROOT = Path(__file__).resolve().parents[1]


def load_workstations() -> list[str]:
    cfg = ROOT / "config" / "workstations.yaml"
    data = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    return [item["key"] for item in data["workstations"]]


def check_app(app: str) -> list[str]:
    issues: list[str] = []
    app_root = ROOT / "apps" / app

    layout = app_root / "src" / "layouts" / "AppLayout.tsx"
    if not layout.exists():
        issues.append(f"{app}: 缺少 {layout.relative_to(ROOT)}")
    else:
        content = layout.read_text(encoding="utf-8")
        if "MobileWorkstationLayout" not in content:
            issues.append(f"{app}: AppLayout 未接入 MobileWorkstationLayout")
        if "mobilePrimaryNavItems" not in content:
            issues.append(f"{app}: AppLayout 未配置 mobilePrimaryNavItems")

    mobile_dir = app_root / "e2e" / "mobile"
    nav_spec = mobile_dir / "01-navigation.mobile.spec.ts"
    if not nav_spec.exists():
        issues.append(f"{app}: 缺少导航冒烟用例 {nav_spec.relative_to(ROOT)}")

    core_spec = mobile_dir / "02-core-flow.mobile.spec.ts"
    if not core_spec.exists():
        issues.append(f"{app}: 缺少核心流程移动用例 {core_spec.relative_to(ROOT)}")

    container_spec = mobile_dir / "03-feishu-container.mobile.spec.ts"
    if not container_spec.exists():
        issues.append(f"{app}: 缺少飞书容器差异用例 {container_spec.relative_to(ROOT)}")

    pw_cfg = app_root / "playwright.config.ts"
    if not pw_cfg.exists():
        issues.append(f"{app}: 缺少 {pw_cfg.relative_to(ROOT)}")
    else:
        cfg_content = pw_cfg.read_text(encoding="utf-8")
        has_iphone = "devices['iPhone 13']" in cfg_content
        has_mobile_match = "testMatch: '**/*.mobile.spec.ts'" in cfg_content
        if not (has_iphone and has_mobile_match):
            issues.append(f"{app}: Playwright 移动项目配置不完整（缺 iPhone13/testMatch）")

    return issues


def main() -> int:
    apps = load_workstations()
    all_issues: list[str] = []

    print("=" * 64)
    print("  移动化完成度门禁检查")
    print(f"  工作台数量: {len(apps)}")
    print("=" * 64)

    for app in apps:
        issues = check_app(app)
        if issues:
            print(f"[FAIL] {app}")
            for item in issues:
                print(f"  - {item}")
            all_issues.extend(issues)
        else:
            print(f"[PASS] {app}")

    print("-" * 64)
    if all_issues:
        print(f"检查失败：{len(all_issues)} 个问题")
        return 1
    print("检查通过：全工作台满足 01/02/03 用例与移动化基础要求")
    return 0


if __name__ == "__main__":
    sys.exit(main())
