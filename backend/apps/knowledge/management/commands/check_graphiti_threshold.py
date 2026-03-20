import json

from django.core.management.base import BaseCommand

from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation
from apps.knowledge.retrieval_gateway import (
    GRAPHITI_MIN_ENTITIES,
    GRAPHITI_MIN_RELATIONS,
)


class Command(BaseCommand):
    help = '检查 Graphiti 阈值接入是否达到启用条件'

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='输出 JSON')

    def handle(self, *args, **options):
        entity_count = KnowledgeEntity.objects.filter(is_deleted=False).count()
        relation_count = KnowledgeRelation.objects.filter(is_deleted=False).count()
        ready = (
            entity_count >= GRAPHITI_MIN_ENTITIES and
            relation_count >= GRAPHITI_MIN_RELATIONS
        )
        result = {
            'graphiti_ready': ready,
            'entity_count': entity_count,
            'relation_count': relation_count,
            'entity_threshold': GRAPHITI_MIN_ENTITIES,
            'relation_threshold': GRAPHITI_MIN_RELATIONS,
        }

        if options['json']:
            self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
            return

        self.stdout.write('Graphiti 阈值检查')
        self.stdout.write('=' * 60)
        self.stdout.write(
            f"entity_count={entity_count} / {GRAPHITI_MIN_ENTITIES}, "
            f"relation_count={relation_count} / {GRAPHITI_MIN_RELATIONS}"
        )
        self.stdout.write(
            self.style.SUCCESS('已达到启用阈值')
            if ready else self.style.WARNING('未达到启用阈值，继续使用 PostgreSQL 图谱')
        )
