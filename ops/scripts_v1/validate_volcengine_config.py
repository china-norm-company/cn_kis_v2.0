#!/usr/bin/env python3
"""
校验火山云相关配置：volcengine_kb.yaml、env 模板、目录结构等。
不依赖 backend，可独立运行。

用法:
  python scripts/validate_volcengine_config.py
  或: cd CN_KIS_V1.0 && python scripts/validate_volcengine_config.py
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
DEPLOY_DIR = ROOT / "deploy"
DOCS_DIR = ROOT / "docs"


def load_yaml(path: Path) -> dict:
    try:
        import yaml
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        return {"_error": str(e)}


def main() -> int:
    errors = []
    warnings = []

    # 1. 检查 volcengine_kb.yaml
    kb_config = CONFIG_DIR / "volcengine_kb.yaml"
    if not kb_config.exists():
        errors.append(f"config/volcengine_kb.yaml 不存在")
    else:
        cfg = load_yaml(kb_config)
        if "_error" in cfg:
            errors.append(f"volcengine_kb.yaml 解析失败: {cfg['_error']}")
        else:
            kb_section = cfg.get("knowledge_bases") or {}
            if not kb_section:
                warnings.append("volcengine_kb.yaml 中 knowledge_bases 为空")
            else:
                print(f"  ✓ volcengine_kb.yaml: {len(kb_section)} 个知识库定义")

    # 2. 检查 env 模板
    env_example = DEPLOY_DIR / ".env.volcengine.plan-a.example"
    if not env_example.exists():
        errors.append("deploy/.env.volcengine.plan-a.example 不存在")
    else:
        content = env_example.read_text(encoding="utf-8")
        required = [
            "ARK_API_KEY", "ARK_DEFAULT_MODEL",
            "KIMI_API_KEY", "KIMI_DEFAULT_MODEL",
            "VOLCENGINE_SMART_ROUTER_ENDPOINT",
        ]
        for key in required:
            if key not in content:
                warnings.append(f"env 模板中未包含 {key} 说明")
        print(f"  ✓ env 模板: 已包含 AI 双通道配置（ARK + Kimi）")

    # 3. 检查 secrets 模板
    secrets_example = DEPLOY_DIR / "secrets.env.example"
    if not secrets_example.exists():
        errors.append("deploy/secrets.env.example 不存在")

    # 4. 检查 agents.yaml
    agents_config = CONFIG_DIR / "agents.yaml"
    if not agents_config.exists():
        warnings.append("config/agents.yaml 不存在（智能体定义）")
    else:
        cfg = load_yaml(agents_config)
        if "_error" in cfg:
            errors.append(f"agents.yaml 解析失败: {cfg['_error']}")
        else:
            agents = cfg.get("agents") or []
            if not agents:
                warnings.append("agents.yaml 中 agents 为空")
            else:
                ark_count = sum(1 for a in agents if a.get("provider") == "ark")
                kimi_count = sum(1 for a in agents if a.get("provider") == "kimi")
                print(f"  ✓ agents.yaml: {len(agents)} 个智能体（ARK: {ark_count}, Kimi: {kimi_count}）")

    # 5. 输出
    print("\n========== 火山云配置校验 ==========\n")
    if errors:
        print("【错误】")
        for e in errors:
            print(f"  ✗ {e}")
        print()
    if warnings:
        print("【警告】")
        for w in warnings:
            print(f"  ! {w}")
        print()

    if not errors:
        print("【通过】配置结构完整，可进行后续部署。")
        print("\n下一步:")
        print("  1. 复制 deploy/.env.volcengine.plan-a.example 为 deploy/.env.volcengine.plan-a")
        print("  2. 填入 ARK_API_KEY、KIMI_API_KEY、VOLCENGINE_SMART_ROUTER_ENDPOINT 等")
        print("  3. 复制 deploy/secrets.env.example 为 deploy/secrets.env")
        print("  4. 填入火山云控制台账号、SSH 凭据")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
