"""
从 Data_Collection 项目批量导入 L2-L5 专业知识库

L层知识库源文件（来自 cn_study_kis/Data_Collection/docs/）：
  L2 研究构念库  → entry_type='method_reference', namespace='cnkis'
  L3 测量指标库  → entry_type='method_reference', namespace='cnkis'
  L4 测量方法库  → entry_type='method_reference', namespace='cnkis'
  L5 仪器设备库  → entry_type='instrument_spec', namespace='cnkis'
  L6 SOP 库      → entry_type='sop', namespace='internal_sop'

解析策略：
  - 每个 #### 标题下的代码块 ``` ... ``` 作为一个条目
  - 条目 ID（如 RC_HYDRATION_001）作为 source_key
  - 入库状态：pending_review（待数据经理审核后 publish）

使用方式：
  # 默认自动查找 cn_study_kis 目录
  python manage.py import_data_collection_knowledge

  # 指定源目录
  python manage.py import_data_collection_knowledge --docs-dir=/path/to/Data_Collection/docs

  # 只导入特定层
  python manage.py import_data_collection_knowledge --layers L2,L5

  # 预览
  python manage.py import_data_collection_knowledge --dry-run
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

from django.core.management.base import BaseCommand, CommandError

LayerKey = Literal['L2', 'L3', 'L4', 'L5', 'L6']

LAYER_CONFIG: dict[LayerKey, dict] = {
    'L2': {
        'filename': 'L2_research_construct_library.md',
        'entry_type': 'method_reference',
        'namespace': 'cnkis',
        'id_prefix': 'RC_',
        'tags': ['研究构念', 'L2', '功效评价方法论'],
        'description': '研究构念库',
    },
    'L3': {
        'filename': 'L3_measurement_indicator_library.md',
        'entry_type': 'method_reference',
        'namespace': 'cnkis',
        'id_prefix': 'MI_',
        'tags': ['测量指标', 'L3', '功效指标'],
        'description': '测量指标库',
    },
    'L4': {
        'filename': 'L4_measurement_method_library.md',
        'entry_type': 'method_reference',
        'namespace': 'cnkis',
        'id_prefix': 'MM_',
        'tags': ['测量方法', 'L4', '功效测量标准'],
        'description': '测量方法库',
    },
    'L5': {
        'filename': 'L5_instrument_library.md',
        'entry_type': 'instrument_spec',
        'namespace': 'cnkis',
        'id_prefix': 'INST_',
        'tags': ['仪器设备', 'L5', 'EEMCO', '实验室仪器'],
        'description': '仪器设备规格库',
    },
    'L6': {
        'filename': 'L6_SOP_library.md',
        'entry_type': 'sop',
        'namespace': 'internal_sop',
        'id_prefix': 'SOP_',
        'tags': ['SOP', 'L6', '操作规程'],
        'description': 'SOP 库',
    },
}


def _parse_layer_file(file_path: Path, layer_cfg: dict) -> list[dict]:
    """
    解析 L层知识库 Markdown 文件，提取结构化条目。

    格式示例（L2）：
      #### RC_HYDRATION_001 皮肤水合状态
      ```
      构念ID: RC_HYDRATION_001
      构念名称: 皮肤水合状态
      ...
      ```
    """
    if not file_path.exists():
        return []

    content = file_path.read_text(encoding='utf-8', errors='ignore')
    entries = []

    # 匹配 #### ID 名称\n```\n内容\n```
    pattern = re.compile(
        r'####\s+(' + re.escape(layer_cfg['id_prefix']) + r'\S+)\s+(.*?)\n```\s*\n(.*?)\n```',
        re.DOTALL,
    )

    for match in pattern.finditer(content):
        item_id = match.group(1).strip()
        item_title = match.group(2).strip()
        item_body = match.group(3).strip()

        # 解析 key: value 对
        props: dict = {}
        for line in item_body.splitlines():
            if ':' in line:
                key, _, value = line.partition(':')
                props[key.strip()] = value.strip()

        # 提取标签（消费者词/相关标签等）
        extra_tags = []
        for tag_field in ['关联消费者词', '参考标准', '适用方法', 'EEMCO推荐']:
            if tag_field in props:
                raw = props[tag_field].strip('[]')
                extra_tags.extend([t.strip() for t in raw.split(',') if t.strip()])

        # 构建标题：优先用中文名，再用英文名
        title_parts = []
        for field in ['构念名称', '指标名称', '方法名称', '仪器名称', '名称']:
            if field in props:
                title_parts.append(props[field])
                break
        for field in ['英文名', 'English Name']:
            if field in props:
                title_parts.append(f'({props[field]})')
                break
        display_title = ' '.join(title_parts) if title_parts else item_title

        # 构建结构化内容（保留原始 key-value）
        full_content = f'{item_id} — {display_title}\n\n' + item_body

        entries.append({
            'item_id': item_id,
            'title': f'[{layer_cfg["description"]}] {display_title}',
            'content': full_content,
            'entry_type': layer_cfg['entry_type'],
            'namespace': layer_cfg['namespace'],
            'source_key': f'data_collection:{item_id.lower()}',
            'tags': layer_cfg['tags'] + extra_tags[:5],  # 最多保留 5 个额外标签
            'properties': {
                'item_id': item_id,
                'layer': list(LAYER_CONFIG.keys())[
                    [v['id_prefix'] for v in LAYER_CONFIG.values()].index(layer_cfg['id_prefix'])
                ],
                'source_file': file_path.name,
                **{k: v for k, v in props.items() if k in [
                    '仪器ID', '厂家', '国家', '类别', '测量原理', '测量范围',
                    '精度', 'EEMCO推荐', '公司拥有', '适用轨道', '参考标准',
                ]},
            },
        })

    return entries


class Command(BaseCommand):
    help = '从 Data_Collection L2-L5 知识库导入结构化知识条目'

    def add_arguments(self, parser):
        parser.add_argument(
            '--docs-dir',
            default='',
            help='Data_Collection/docs 目录路径（默认自动查找）',
        )
        parser.add_argument(
            '--layers',
            default='L2,L3,L4,L5',
            help='要导入的层，逗号分隔（默认 L2,L3,L4,L5）',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='预览，不写入',
        )
        parser.add_argument(
            '--status-on-import',
            default='pending_review',
            choices=['pending_review', 'draft'],
            help='导入后的状态（默认 pending_review）',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        layers = [l.strip().upper() for l in options['layers'].split(',') if l.strip()]
        status_on_import = options['status_on_import']
        docs_dir_path = options['docs_dir']

        if docs_dir_path:
            docs_dir = Path(docs_dir_path)
        else:
            candidates = [
                Path.home() / 'Cursor' / 'cn_study_kis' / 'Data_Collection' / 'docs',
            ]
            docs_dir = next((p for p in candidates if p.exists()), None)
            if not docs_dir:
                self.stderr.write(self.style.ERROR(
                    'Data_Collection/docs 目录不存在。请用 --docs-dir 参数指定路径。'
                ))
                return

        if not dry_run:
            from apps.knowledge.guards import KnowledgeAssetGuard
            KnowledgeAssetGuard.assert_write_allowed('knowledge_entry')

        mode = '[DRY-RUN] ' if dry_run else ''
        self.stdout.write(self.style.HTTP_INFO(f'{mode}=== Data_Collection L层知识库导入 ==='))
        self.stdout.write(f'文档目录：{docs_dir}')
        self.stdout.write(f'导入层：{", ".join(layers)}')

        from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput

        total_stats = {'parsed': 0, 'created': 0, 'skipped_dup': 0, 'errors': 0}

        for layer_key in layers:
            if layer_key not in LAYER_CONFIG:
                self.stdout.write(self.style.WARNING(f'  未知层：{layer_key}，跳过'))
                continue

            cfg = LAYER_CONFIG[layer_key]
            file_path = docs_dir / cfg['filename']

            if not file_path.exists():
                self.stdout.write(self.style.WARNING(f'  [跳过] {layer_key}：文件不存在 {file_path}'))
                continue

            parsed = _parse_layer_file(file_path, cfg)
            total_stats['parsed'] += len(parsed)
            self.stdout.write(f'\n  {layer_key}（{cfg["description"]}）：解析到 {len(parsed)} 条')

            if dry_run:
                for item in parsed[:3]:
                    self.stdout.write(f'    样例: {item["title"][:60]}')
                if len(parsed) > 3:
                    self.stdout.write(f'    ... 以及另外 {len(parsed) - 3} 条')
                total_stats['created'] += len(parsed)
                continue

            for item in parsed:
                try:
                    result = run_pipeline(
                        RawKnowledgeInput(
                            title=item['title'],
                            content=item['content'],
                            entry_type=item['entry_type'],
                            source_type='data_collection_import',
                            source_key=item['source_key'],
                            namespace=item['namespace'],
                            tags=item['tags'],
                            properties=item['properties'],
                        ),
                        override_status=status_on_import,
                        skip_vectorize=True,  # 后续批量向量化
                    )
                    if result.get('entry_id'):
                        total_stats['created'] += 1
                    elif result.get('skipped'):
                        total_stats['skipped_dup'] += 1
                    else:
                        total_stats['errors'] += 1
                except Exception as exc:
                    self.stderr.write(f'    [错误] {item["item_id"]}: {exc}')
                    total_stats['errors'] += 1

            self.stdout.write(
                f'    完成：创建 {total_stats["created"]}，跳过 {total_stats["skipped_dup"]}，错误 {total_stats["errors"]}'
            )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'{mode}导入完成：\n'
            f'  解析条目：{total_stats["parsed"]}\n'
            f'  新建：{total_stats["created"]}\n'
            f'  跳过（重复）：{total_stats["skipped_dup"]}\n'
            f'  错误：{total_stats["errors"]}'
        ))

        if not dry_run and total_stats['created'] > 0:
            self.stdout.write(self.style.WARNING(
                f'\n下一步：批量向量化\n'
                f'  python manage.py vectorize_bulk --source-type=data_collection_import'
            ))
