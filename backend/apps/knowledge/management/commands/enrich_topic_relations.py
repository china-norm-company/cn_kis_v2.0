"""
基于 TopicPackage / facet 为现有实体补充 related_to 关系。

目的：
1. 提升图谱密度，缓解“实体很多但关系偏稀疏”的问题
2. 为 Graphiti 多跳检索提供更连续的语义链路
3. 使用保守策略：只在同专题、同 facet 内做相邻实体串联
"""
from collections import defaultdict

from django.core.management.base import BaseCommand

from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation, RelationType


class Command(BaseCommand):
    help = '根据 TopicPackage / facet 生成补充 related_to 关系'

    def add_arguments(self, parser):
        parser.add_argument('--per-facet-limit', type=int, default=120, help='每个 facet 最多串联多少实体')
        parser.add_argument('--dry-run', action='store_true', help='只统计，不写入数据库')

    def handle(self, *args, **options):
        per_facet_limit = options['per_facet_limit']
        dry_run = options['dry_run']

        rows = list(
            KnowledgeEntity.objects.filter(
                is_deleted=False,
                linked_entry__isnull=False,
                linked_entry__topic_package__isnull=False,
            ).exclude(linked_entry__facet='').values_list(
                'id',
                'linked_entry__topic_package__package_id',
                'linked_entry__facet',
            )
        )

        buckets = defaultdict(list)
        for entity_id, package_id, facet in rows:
            buckets[(package_id, facet)].append(entity_id)

        created = 0
        for (package_id, facet), entity_ids in buckets.items():
            entity_ids = sorted(set(entity_ids))[:per_facet_limit]
            if len(entity_ids) < 2:
                continue
            for idx in range(len(entity_ids) - 1):
                subj_id = entity_ids[idx]
                obj_id = entity_ids[idx + 1]
                if subj_id == obj_id:
                    continue
                if dry_run:
                    created += 1
                    continue
                relation, was_created = KnowledgeRelation.objects.get_or_create(
                    subject_id=subj_id,
                    predicate_uri=f'cnkis:topic_related:{package_id}:{facet}',
                    object_id=obj_id,
                    is_deleted=False,
                    defaults={
                        'relation_type': RelationType.RELATED_TO,
                        'confidence': 0.7,
                        'source': 'topic-package-enrichment',
                        'metadata': {
                            'package_id': package_id,
                            'facet': facet,
                            'strategy': 'adjacent-chain',
                        },
                    },
                )
                if was_created:
                    created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Topic relation enrichment complete: created={created} dry_run={dry_run}'
            )
        )
