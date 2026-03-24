"""
从 Data_Collection L2-L5 构建知识图谱实体与关系

基于库文件中的显式关系字段提取 KnowledgeEntity + KnowledgeRelation：

L2 研究构念  →  RC_HYDRATION_001
L3 测量指标  →  MI_SCH_001  ---[is_measured_by]--->  RC_HYDRATION_001
L4 测量方法  →  MM_CAPACITANCE_001  ---[validates]---> MI_SCH_001
L5 仪器设备  →  INST_MOISTURE_A  ---[supports]--->  MM_CAPACITANCE_001

关系提取规则：
  L3.所属构念 → L3 entity -[is_measured_by]-> L2 entity
  L3.测量方法 → L4 entity -[validates]-> L3 entity
  L5.适用方法 → L5 entity -[supports]-> L4 entity
  L5.可测指标 → L5 entity -[supports]-> L3 entity（备用路径）

使用方式：
  python manage.py build_knowledge_graph_from_data_collection
  python manage.py build_knowledge_graph_from_data_collection --dry-run
  python manage.py build_knowledge_graph_from_data_collection --docs-dir=/path/to/docs
  python manage.py build_knowledge_graph_from_data_collection --skip-relations
"""
from __future__ import annotations

import re
from pathlib import Path

from django.core.management.base import BaseCommand

_ID_PREFIX_MAP = {
    'RC_': ('research_concept', 'cnkis'),
    'MI_': ('measurement_indicator', 'cnkis'),
    'MM_': ('measurement_method', 'cnkis'),
    'INST_': ('instrument', 'cnkis'),
    'SOP_': ('sop', 'internal_sop'),
}

_LABEL_FIELDS = ['构念名称', '指标名称', '方法名称', '仪器名称', '名称']
_DEF_FIELDS = ['定义', '描述', '目的', '适用范围']
_EN_FIELDS = ['英文名', 'English Name', '方法英文名']


def _detect_id_prefix(item_id: str) -> tuple[str, str]:
    """根据 ID 前缀推断实体类型和命名空间"""
    for prefix, (etype, ns) in _ID_PREFIX_MAP.items():
        if item_id.startswith(prefix):
            return etype, ns
    return 'concept', 'cnkis'


def _parse_props(body: str) -> dict[str, str]:
    props = {}
    for line in body.splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            props[k.strip()] = v.strip()
    return props


def _parse_array_field(value: str) -> list[str]:
    """解析 '[A, B, C]' 格式的数组字段"""
    value = value.strip().strip('[]')
    return [v.strip() for v in value.split(',') if v.strip()]


def _parse_file(file_path: Path) -> list[dict]:
    if not file_path.exists():
        return []
    content = file_path.read_text(encoding='utf-8', errors='ignore')
    # 匹配 #### XXXX_YYY 标题 + 代码块
    all_prefixes = '|'.join(re.escape(p) for p in _ID_PREFIX_MAP)
    pattern = re.compile(
        r'####\s+(' + all_prefixes + r'\S+)\s+(.*?)\n```\s*\n(.*?)\n```',
        re.DOTALL,
    )
    items = []
    for m in pattern.finditer(content):
        item_id = m.group(1).strip()
        item_title = m.group(2).strip()
        props = _parse_props(m.group(3))

        label = next((props[f] for f in _LABEL_FIELDS if f in props), item_title)
        definition = next((props[f] for f in _DEF_FIELDS if f in props), '')
        label_en = next((props[f] for f in _EN_FIELDS if f in props), '')
        entity_type, namespace = _detect_id_prefix(item_id)

        items.append({
            'item_id': item_id,
            'label': label,
            'label_en': label_en,
            'definition': definition,
            'entity_type': entity_type,
            'namespace': namespace,
            'props': props,
        })
    return items


def _build_relations(all_items: list[dict]) -> list[dict]:
    """
    根据字段引用关系构建三元组 (subject_id, relation_type, object_id)。

    规则：
    - L3 MI: 所属构念 → [is_measured_by] → RC
    - L3 MI: 测量方法 → [validated_by] → MM
    - L4 MM: 可测指标 → [measures] → MI  (备用)
    - L5 INST: 适用方法 → [supports] → MM
    - L5 INST: 可测指标 → [supports] → MI
    """
    id_to_item = {it['item_id']: it for it in all_items}
    relations = []

    def _add(subject_id: str, rel_type: str, object_id: str, conf: float = 0.9):
        if subject_id in id_to_item and object_id in id_to_item:
            relations.append({
                'subject_id': subject_id,
                'relation_type': rel_type,
                'object_id': object_id,
                'confidence': conf,
                'source': 'data_collection_import',
            })

    for it in all_items:
        p = it['props']
        sid = it['item_id']

        if sid.startswith('MI_'):
            for rc_id in _parse_array_field(p.get('所属构念', '')):
                _add(sid, 'is_measured_by', rc_id)
            for mm_id in _parse_array_field(p.get('测量方法', '')):
                _add(sid, 'validated_by', mm_id)

        elif sid.startswith('MM_'):
            for mi_id in _parse_array_field(p.get('可测指标', '')):
                _add(sid, 'measures', mi_id)

        elif sid.startswith('INST_'):
            for mm_id in _parse_array_field(p.get('适用方法', '')):
                _add(sid, 'supports', mm_id)
            for mi_id in _parse_array_field(p.get('可测指标', '')):
                _add(sid, 'supports', mi_id)

    return relations


class Command(BaseCommand):
    help = '从 Data_Collection L2-L5 知识库构建知识图谱实体与关系'

    def add_arguments(self, parser):
        parser.add_argument('--docs-dir', default='', help='Data_Collection/docs 目录路径')
        parser.add_argument('--dry-run', action='store_true', default=False, help='预览，不写入')
        parser.add_argument('--skip-relations', action='store_true', default=False, help='只建实体，不建关系')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        skip_relations = options['skip_relations']
        docs_dir_path = options['docs_dir']

        if docs_dir_path:
            docs_dir = Path(docs_dir_path)
        else:
            candidate = Path.home() / 'Cursor' / 'cn_study_kis' / 'Data_Collection' / 'docs'
            docs_dir = candidate if candidate.exists() else None
            if not docs_dir:
                self.stderr.write(self.style.ERROR('找不到 Data_Collection/docs，请用 --docs-dir 指定'))
                return

        mode = '[DRY-RUN] ' if dry_run else ''
        self.stdout.write(self.style.HTTP_INFO(f'{mode}=== 知识图谱实体构建 ==='))

        # 解析各层文件
        layer_files = [
            docs_dir / 'L2_research_construct_library.md',
            docs_dir / 'L3_measurement_indicator_library.md',
            docs_dir / 'L4_measurement_method_library.md',
            docs_dir / 'L5_instrument_library.md',
        ]
        all_items = []
        for f in layer_files:
            parsed = _parse_file(f)
            self.stdout.write(f'  {f.name}: {len(parsed)} 个实体')
            all_items.extend(parsed)

        relations = [] if skip_relations else _build_relations(all_items)
        self.stdout.write(f'\n  总计：实体 {len(all_items)}，关系 {len(relations)}')

        if dry_run:
            for it in all_items[:5]:
                self.stdout.write(f'  样例实体：{it["item_id"]} | {it["label"]}（{it["entity_type"]}）')
            for rel in relations[:5]:
                self.stdout.write(f'  样例关系：{rel["subject_id"]} -[{rel["relation_type"]}]-> {rel["object_id"]}')
            return

        from apps.knowledge.guards import KnowledgeAssetGuard
        KnowledgeAssetGuard.assert_write_allowed('knowledge_entity')

        from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation

        # 写入实体
        entity_stats = {'created': 0, 'updated': 0, 'errors': 0}
        item_id_to_pk: dict[str, int] = {}

        for it in all_items:
            try:
                uri = f'urn:cnkis:{it["namespace"]}:{it["item_id"].lower()}'
                obj, created = KnowledgeEntity.objects.update_or_create(
                    uri=uri,
                    defaults={
                        'label': it['label'][:200],
                        'label_en': it['label_en'][:200],
                        'entity_type': it['entity_type'],
                        'namespace': it['namespace'],
                        'definition': it['definition'][:1000],
                        'source': 'data_collection_import',
                        'is_deleted': False,
                    },
                )
                item_id_to_pk[it['item_id']] = obj.pk
                if created:
                    entity_stats['created'] += 1
                else:
                    entity_stats['updated'] += 1
            except Exception as exc:
                self.stderr.write(f'  [错误] {it["item_id"]}: {exc}')
                entity_stats['errors'] += 1

        self.stdout.write(
            f'\n  实体写入：创建 {entity_stats["created"]}，更新 {entity_stats["updated"]}，错误 {entity_stats["errors"]}'
        )

        if skip_relations or not relations:
            return

        # 写入关系
        rel_stats = {'created': 0, 'skipped': 0, 'errors': 0}
        for rel in relations:
            subj_pk = item_id_to_pk.get(rel['subject_id'])
            obj_pk = item_id_to_pk.get(rel['object_id'])
            if not subj_pk or not obj_pk:
                rel_stats['skipped'] += 1
                continue
            try:
                _, created = KnowledgeRelation.objects.get_or_create(
                    subject_id=subj_pk,
                    object_id=obj_pk,
                    relation_type=rel['relation_type'],
                    defaults={
                        'confidence': rel['confidence'],
                        'source': rel['source'],
                        'is_deleted': False,
                    },
                )
                if created:
                    rel_stats['created'] += 1
                else:
                    rel_stats['skipped'] += 1
            except Exception as exc:
                self.stderr.write(f'  [关系错误] {rel["subject_id"]} → {rel["object_id"]}: {exc}')
                rel_stats['errors'] += 1

        self.stdout.write(
            f'  关系写入：创建 {rel_stats["created"]}，跳过（已存在）{rel_stats["skipped"]}，错误 {rel_stats["errors"]}'
        )
        self.stdout.write(self.style.SUCCESS('\n知识图谱构建完成'))
