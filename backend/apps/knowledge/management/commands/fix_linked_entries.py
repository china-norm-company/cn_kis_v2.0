"""
一次性修复命令：为现有孤儿 KnowledgeEntity 创建关联的 KnowledgeEntry

扫描所有 linked_entry_id 为 NULL 的 KnowledgeEntity，
为每个实体创建或匹配对应的 KnowledgeEntry，并设置 linked_entry 关联。
这是修复图谱检索通道（_graph_recall）永远返回空结果的关键操作。

用法:
  python manage.py fix_linked_entries
  python manage.py fix_linked_entries --dry-run         # 仅统计，不修改
  python manage.py fix_linked_entries --namespace bridg  # 仅处理指定命名空间
  python manage.py fix_linked_entries --batch-size 500  # 批量大小
"""
import logging

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.knowledge.models import (
    KnowledgeEntry, KnowledgeEntity,
    EntryType, EntityType, OntologyNamespace,
)

logger = logging.getLogger(__name__)

# 实体类型 → KnowledgeEntry 类型映射
ENTITY_TYPE_TO_ENTRY_TYPE = {
    EntityType.INSTRUMENT: EntryType.INSTRUMENT_SPEC,
    EntityType.METHOD: EntryType.METHOD_REFERENCE,
    EntityType.INGREDIENT: EntryType.INGREDIENT_DATA,
    EntityType.COMPETITOR: EntryType.COMPETITOR_INTEL,
    EntityType.REGULATION_ENTITY: EntryType.REGULATION,
    EntityType.PAPER: EntryType.PAPER_ABSTRACT,
    EntityType.MEASUREMENT: EntryType.METHOD_REFERENCE,
    EntityType.CONCEPT: EntryType.METHOD_REFERENCE,
    EntityType.CLASS: EntryType.METHOD_REFERENCE,
    EntityType.INSTANCE: EntryType.METHOD_REFERENCE,
    EntityType.PROPERTY: EntryType.METHOD_REFERENCE,
}

# namespace → source_type 映射（用于白名单自动发布）
NAMESPACE_TO_SOURCE_TYPE = {
    OntologyNamespace.BRIDG: 'bridg_import',
    OntologyNamespace.CDISC_SDTM: 'cdisc_import',
    OntologyNamespace.CDISC_CDASH: 'cdisc_import',
    OntologyNamespace.CDISC_ODM: 'cdisc_import',
    OntologyNamespace.CNKIS: 'ontology_import',
    OntologyNamespace.NMPA_REGULATION: 'regulation_tracker',
    OntologyNamespace.INTERNAL_SOP: 'sop_sync',
    OntologyNamespace.PROJECT_EXPERIENCE: 'retrospective',
    OntologyNamespace.CUSTOM: 'entity_bridge_fix',
}


def _infer_entry_type(entity: KnowledgeEntity) -> str:
    """根据实体类型推断对应的 KnowledgeEntry 类型"""
    return ENTITY_TYPE_TO_ENTRY_TYPE.get(entity.entity_type, EntryType.METHOD_REFERENCE)


def _infer_source_type(entity: KnowledgeEntity) -> str:
    """根据 namespace 推断 source_type（影响白名单自动发布）"""
    return NAMESPACE_TO_SOURCE_TYPE.get(entity.namespace, 'entity_bridge_fix')


def _is_auto_publish(source_type: str) -> bool:
    """判断该 source_type 是否可自动发布"""
    from apps.knowledge.quality_scorer import AUTO_PUBLISH_SOURCES
    return source_type in AUTO_PUBLISH_SOURCES


class Command(BaseCommand):
    help = '修复孤儿 KnowledgeEntity 的 linked_entry 桥接（使图谱检索通道正常工作）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='仅统计孤儿实体数量，不进行修改',
        )
        parser.add_argument(
            '--namespace', type=str, default='',
            help='仅处理指定命名空间（如 bridg / cdisc_sdtm / cnkis）',
        )
        parser.add_argument(
            '--batch-size', type=int, default=200,
            help='每批处理的实体数量（默认 200）',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        namespace_filter = options['namespace']
        batch_size = options['batch_size']

        qs = KnowledgeEntity.objects.filter(
            linked_entry__isnull=True,
            is_deleted=False,
        ).order_by('id')

        if namespace_filter:
            qs = qs.filter(namespace=namespace_filter)

        total_orphans = qs.count()
        self.stdout.write(
            self.style.HTTP_INFO(
                f'发现 {total_orphans} 个孤儿实体'
                f'{"（命名空间: " + namespace_filter + "）" if namespace_filter else ""}'
            )
        )

        if dry_run:
            self.stdout.write('--dry-run 模式，不进行修改。')
            # 按 namespace 统计
            from django.db.models import Count
            stats = qs.values('namespace').annotate(count=Count('id')).order_by('-count')
            for row in stats:
                self.stdout.write(f'  {row["namespace"]}: {row["count"]} 个孤儿实体')
            return

        fixed_count = 0
        error_count = 0
        offset = 0

        while True:
            batch = list(qs[offset:offset + batch_size])
            if not batch:
                break

            with transaction.atomic():
                for entity in batch:
                    try:
                        source_type = _infer_source_type(entity)
                        entry_type = _infer_entry_type(entity)
                        is_published = _is_auto_publish(source_type)

                        # source_key 截断到 120 字符（数据库约束），加入 entity.id 保证唯一
                        source_key = f'entity_fix:{entity.id}'

                        content = entity.label
                        if entity.definition:
                            content = f'{entity.label}'
                            if entity.label_en:
                                content += f' ({entity.label_en})'
                            content += f'\n\n{entity.definition}'

                        entry, created = KnowledgeEntry.objects.get_or_create(
                            source_type='entity_bridge_fix',
                            source_key=source_key,
                            defaults={
                                'title': entity.label[:500],
                                'content': content,
                                'summary': (entity.definition or entity.label)[:200],
                                'entry_type': entry_type,
                                'namespace': entity.namespace,
                                'uri': entity.uri,
                                'tags': [
                                    entity.namespace,
                                    entity.get_entity_type_display(),
                                    entity.label_en or entity.label,
                                ],
                                'is_published': is_published,
                                'status': 'published' if is_published else 'pending_review',
                            },
                        )

                        entity.linked_entry = entry
                        entity.save(update_fields=['linked_entry'])
                        fixed_count += 1

                    except Exception as e:
                        error_count += 1
                        logger.warning('fix_linked_entries: 修复实体 #%s 失败: %s', entity.id, e)

                        # 降级：用 entity_id 作为 source_key 保证唯一性
                        try:
                            fallback_key = f'entity_bridge_fix:{entity.id}'
                            entry, _ = KnowledgeEntry.objects.get_or_create(
                                source_type='entity_bridge_fix',
                                source_key=fallback_key,
                                defaults={
                                    'title': entity.label[:500],
                                    'content': entity.label,
                                    'summary': (entity.definition or entity.label)[:200],
                                    'entry_type': _infer_entry_type(entity),
                                    'namespace': entity.namespace,
                                    'uri': entity.uri,
                                    'tags': [entity.namespace, entity.label],
                                    'is_published': True,
                                    'status': 'published',
                                },
                            )
                            entity.linked_entry = entry
                            entity.save(update_fields=['linked_entry'])
                            fixed_count += 1
                            error_count -= 1
                        except Exception as e2:
                            logger.error('fix_linked_entries: fallback 也失败 #%s: %s', entity.id, e2)

            offset += batch_size
            self.stdout.write(
                f'  进度: {min(offset, total_orphans)}/{total_orphans} ...'
            )

        self.stdout.write(self.style.SUCCESS(
            f'\n修复完成: 成功 {fixed_count} 个, 失败 {error_count} 个'
        ))
        if error_count > 0:
            self.stdout.write(self.style.WARNING(
                f'  {error_count} 个实体修复失败，请查看日志'
            ))
