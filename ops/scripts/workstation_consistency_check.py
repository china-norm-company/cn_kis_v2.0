#!/usr/bin/env python3
"""
工作台注册表一致性验收脚本
用途：验证所有涉及工作台列表的文件与 workstations.yaml 保持一致
运行：python ops/scripts/workstation_consistency_check.py
"""
import sys
import os
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
YAML_PATH = os.path.join(ROOT, 'backend', 'configs', 'workstations.yaml')

DEPRECATED = {'governance', 'iam'}

def load_yaml_workstations():
    with open(YAML_PATH, encoding='utf-8') as f:
        data = yaml.safe_load(f)
    keys = [ws['key'] for ws in data['workstations']]
    return set(keys), keys

def check_file_for_deprecated(filepath, content):
    import re
    issues = []
    for dep in DEPRECATED:
        # 检查是否作为实际使用的工作台标识出现
        # 排除：废弃说明/警告文字（含"废弃"、"旧名"、"已合并"、"已废弃"、"deprecated"）
        pattern = rf"['\"`/ ]({dep})['\"`/ \n,|]"
        for m in re.finditer(pattern, content):
            line_start = content.rfind('\n', 0, m.start()) + 1
            line_end = content.find('\n', m.end())
            line = content[line_start:line_end if line_end > 0 else len(content)]
            # 排除废弃说明行
            skip_keywords = ['废弃', '旧名', '已合并', 'deprecated', '禁止使用', '不再是合法', '已废弃']
            if any(kw in line for kw in skip_keywords):
                continue
            issues.append(f"  ⚠️  发现废弃标识实际使用 '{dep}' 于: {os.path.relpath(filepath, ROOT)}\n      行内容: {line.strip()[:100]}")
    return issues

def main():
    print("=" * 60)
    print("  CN KIS V2.0 工作台注册表一致性检查")
    print("=" * 60)

    # 1. 读取 yaml
    try:
        valid_keys, ordered_keys = load_yaml_workstations()
        count = len(valid_keys)
        print(f"\n✅ workstations.yaml 读取成功：{count} 个工作台")
        print(f"   列表：{', '.join(ordered_keys)}")
    except Exception as e:
        print(f"❌ 读取 workstations.yaml 失败：{e}")
        sys.exit(1)

    # 2. 验证数量
    EXPECTED_COUNT = 19
    if count != EXPECTED_COUNT:
        print(f"\n❌ 数量错误：yaml 中有 {count} 个，期望 {EXPECTED_COUNT} 个")
        sys.exit(1)
    print(f"✅ 数量正确：{count} 个")

    # 3. 验证必须存在的工作台
    REQUIRED = {
        'secretary', 'finance', 'research', 'execution', 'quality',
        'hr', 'crm', 'recruitment', 'equipment', 'material',
        'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
        'control-plane', 'admin', 'digital-workforce', 'data-platform',
    }
    missing = REQUIRED - valid_keys
    extra = valid_keys - REQUIRED
    if missing:
        print(f"❌ yaml 缺少必要工作台：{missing}")
        sys.exit(1)
    if extra:
        print(f"⚠️  yaml 包含未知工作台（需确认是否新增）：{extra}")
    print("✅ 必要工作台全部存在")

    # 4. 验证废弃标识不在 yaml 中
    for dep in DEPRECATED:
        if dep in valid_keys:
            print(f"❌ yaml 中包含废弃标识：'{dep}'（应已移除）")
            sys.exit(1)
    print(f"✅ 废弃标识 {DEPRECATED} 均不在 yaml 中")

    # 5. 检查关键文件中的废弃标识
    print("\n--- 扫描关键文件中的废弃标识 ---")
    check_files = [
        os.path.join(ROOT, 'backend', 'apps', 'identity', 'api.py'),
        os.path.join(ROOT, 'backend', 'apps', 'identity', 'management', 'commands', 'seed_roles.py'),
        os.path.join(ROOT, '.cursor', 'rules', 'branch-discipline.mdc'),
        os.path.join(ROOT, '.cursor', 'rules', 'project-constants.mdc'),
        os.path.join(ROOT, '.cursor', 'skills', 'start-task', 'SKILL.md'),
    ]
    all_clean = True
    for fp in check_files:
        if not os.path.exists(fp):
            continue
        with open(fp, encoding='utf-8') as f:
            content = f.read()
        issues = check_file_for_deprecated(fp, content)
        rel = os.path.relpath(fp, ROOT)
        if issues:
            all_clean = False
            for issue in issues:
                print(issue)
        else:
            print(f"  ✅ {rel}")

    # 6. 检查 identity/api.py 的 VALID_WORKSTATION_KEYS
    print("\n--- 验证 VALID_WORKSTATION_KEYS ---")
    api_path = os.path.join(ROOT, 'backend', 'apps', 'identity', 'api.py')
    if os.path.exists(api_path):
        with open(api_path, encoding='utf-8') as f:
            api_content = f.read()
        import re
        match = re.search(r'VALID_WORKSTATION_KEYS\s*=\s*\{([^}]+)\}', api_content, re.DOTALL)
        if match:
            api_keys_raw = match.group(1)
            api_keys = set(re.findall(r"'([^']+)'", api_keys_raw))
            if api_keys == REQUIRED:
                print(f"  ✅ VALID_WORKSTATION_KEYS 与 yaml 一致（{len(api_keys)} 个）")
            else:
                missing_api = REQUIRED - api_keys
                extra_api = api_keys - REQUIRED
                if missing_api:
                    print(f"  ❌ VALID_WORKSTATION_KEYS 缺少：{missing_api}")
                    all_clean = False
                if extra_api:
                    print(f"  ⚠️  VALID_WORKSTATION_KEYS 多余：{extra_api}")
        else:
            print("  ⚠️  未找到 VALID_WORKSTATION_KEYS 定义")

    # 7. 汇总
    print("\n" + "=" * 60)
    if all_clean:
        print("✅ 所有检查通过！工作台注册表一致性验收成功。")
        print(f"   当前工作台数量：{count} 个")
        print(f"   列表：{', '.join(ordered_keys)}")
    else:
        print("❌ 存在不一致，请根据上述提示修复。")
        sys.exit(1)
    print("=" * 60)

if __name__ == '__main__':
    main()
