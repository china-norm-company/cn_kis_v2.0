#!/usr/bin/env python
"""
知识资产完整性校验脚本 — CN KIS V2.0

在迁移前后各执行一次，确认知识资产无丢失。

用法：
  # 连接生产数据库（只读）
  DATABASE_URL=postgresql://... python ops/scripts/verify_knowledge_assets.py
  
  # 本地测试
  USE_SQLITE=true python ops/scripts/verify_knowledge_assets.py

输出：
  JSON 格式的资产清单，可保存为基准文件进行对比。
"""
import os
import sys
import json
import django
from pathlib import Path

# 添加 backend 到路径
BASE_DIR = Path(__file__).parent.parent.parent / 'backend'
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
django.setup()

from django.db.models import Count


def verify_knowledge_assets() -> dict:
    """执行全面的知识资产完整性校验"""
    results = {}
    errors = []
    
    # 1. PersonalContext（飞书原始上下文）
    try:
        from apps.secretary.models import PersonalContext
        by_source = dict(
            PersonalContext.objects
            .values('source_type')
            .annotate(count=Count('id'))
            .values_list('source_type', 'count')
        )
        results['PersonalContext'] = {
            'total': PersonalContext.objects.count(),
            'by_source_type': by_source,
            'with_content_hash': PersonalContext.objects.exclude(content_hash='').count(),
        }
    except Exception as e:
        errors.append(f'PersonalContext: {e}')

    # 2. KnowledgeEntry（知识条目）
    try:
        from apps.knowledge.models import KnowledgeEntry
        results['KnowledgeEntry'] = {
            'total': KnowledgeEntry.objects.count(),
            'published': KnowledgeEntry.objects.filter(is_published=True).count(),
            'with_embedding_id': KnowledgeEntry.objects.exclude(embedding_id='').count(),
            'deleted': KnowledgeEntry.objects.filter(is_deleted=True).count(),
        }
    except Exception as e:
        errors.append(f'KnowledgeEntry: {e}')

    # 3. KnowledgeEntity（知识图谱节点）
    try:
        from apps.knowledge.models import KnowledgeEntity
        results['KnowledgeEntity'] = {
            'total': KnowledgeEntity.objects.count(),
        }
    except Exception as e:
        errors.append(f'KnowledgeEntity: {e}')

    # 4. KnowledgeRelation（知识图谱关系）
    try:
        from apps.knowledge.models import KnowledgeRelation
        results['KnowledgeRelation'] = {
            'total': KnowledgeRelation.objects.count(),
        }
    except Exception as e:
        errors.append(f'KnowledgeRelation: {e}')

    # 5. EkbRawRecord（易快报原始层）
    try:
        from apps.ekuaibao_integration.models import EkbRawRecord
        results['EkbRawRecord'] = {
            'total': EkbRawRecord.objects.count(),
            'description': '不可变原始层，永远只读',
        }
    except Exception as e:
        errors.append(f'EkbRawRecord: {e}')

    # 6. RawLimsRecord（LIMS 原始层）
    try:
        from apps.lims_integration.models import RawLimsRecord
        results['RawLimsRecord'] = {
            'total': RawLimsRecord.objects.count(),
            'description': '不可变原始层，永远只读',
        }
    except Exception as e:
        errors.append(f'RawLimsRecord: {e}')

    return {
        'status': 'ok' if not errors else 'partial',
        'errors': errors,
        'assets': results,
    }


def compare_with_baseline(current: dict, baseline_file: str) -> None:
    """与基准文件对比，报告差异"""
    if not Path(baseline_file).exists():
        print(f"⚠️  基准文件 {baseline_file} 不存在，跳过对比")
        return
    
    with open(baseline_file) as f:
        baseline = json.load(f)
    
    print("\n=== 与基准对比 ===")
    current_assets = current.get('assets', {})
    baseline_assets = baseline.get('assets', {})
    
    all_ok = True
    for key in baseline_assets:
        baseline_total = baseline_assets[key].get('total', 0)
        current_total = current_assets.get(key, {}).get('total', 0)
        
        if current_total < baseline_total:
            print(f"❌ {key}: {current_total} < {baseline_total}（数据减少！）")
            all_ok = False
        elif current_total > baseline_total:
            print(f"✅ {key}: {current_total} > {baseline_total}（数据增加，正常）")
        else:
            print(f"✅ {key}: {current_total} == {baseline_total}（一致）")
    
    if all_ok:
        print("\n✅ 所有资产完整性验证通过")
    else:
        print("\n❌ 发现数据减少，请立即停止并排查！")
        sys.exit(1)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='知识资产完整性校验')
    parser.add_argument('--save', metavar='FILE', help='将结果保存为基准文件（JSON）')
    parser.add_argument('--compare', metavar='FILE', help='与基准文件对比')
    args = parser.parse_args()
    
    print("=== CN KIS V2.0 知识资产完整性校验 ===\n")
    result = verify_knowledge_assets()
    
    for key, value in result['assets'].items():
        print(f"  {key}: {json.dumps(value, ensure_ascii=False)}")
    
    if result['errors']:
        print(f"\n⚠️  校验错误（部分模型可能未迁移）：")
        for err in result['errors']:
            print(f"  - {err}")
    
    if args.save:
        with open(args.save, 'w') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n📄 基准文件已保存到：{args.save}")
    
    if args.compare:
        compare_with_baseline(result, args.compare)
    
    print(f"\n状态：{result['status']}")
