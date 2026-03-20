from django.core.management.base import BaseCommand

from apps.knowledge.models import KnowledgeEntry
from apps.knowledge.governance import recalculate_quality_score


class Command(BaseCommand):
    help = '批量重算知识质量分，并可同步状态路由到 published/pending_review/rejected'

    def add_arguments(self, parser):
        parser.add_argument('--source-type', type=str, default='', help='仅处理指定 source_type')
        parser.add_argument('--only-missing-score', action='store_true', help='仅处理 quality_score 为空的条目')
        parser.add_argument('--sync-status', action='store_true', help='将重算结果同步回 status / is_published')
        parser.add_argument('--limit', type=int, default=0, help='最多处理条目数')

    def handle(self, *args, **options):
        qs = KnowledgeEntry.objects.filter(is_deleted=False).order_by('id')
        if options['source_type']:
            qs = qs.filter(source_type=options['source_type'])
        if options['only_missing_score']:
            qs = qs.filter(quality_score__isnull=True)
        if options['limit']:
            qs = qs[:options['limit']]

        total = qs.count()
        success = 0
        published = 0
        pending_review = 0
        rejected = 0

        self.stdout.write(f'待处理条目: {total}')
        for entry in qs.iterator(chunk_size=300):
            result = recalculate_quality_score(entry.id, sync_status=options['sync_status'])
            if not result.get('success'):
                continue
            success += 1
            routed = result.get('new_status')
            if routed == 'published':
                published += 1
            elif routed == 'pending_review':
                pending_review += 1
            elif routed == 'rejected':
                rejected += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'质量重算完成: success={success}, '
                f'published={published}, pending_review={pending_review}, rejected={rejected}'
            )
        )
