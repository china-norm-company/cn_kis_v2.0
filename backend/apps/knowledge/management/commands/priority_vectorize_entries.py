"""
priority_vectorize_entries — 优先向量化高价值新建条目
专项处理：im_group_summary、email_project_summary、im_project_group 等
使用公司内网 GPU 算力中心（Qwen3-embedding，1024维）
"""
import time
import requests
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.db.models import Count

from apps.knowledge.models import KnowledgeEntry
from apps.knowledge.tasks import EMBEDDING_DIMENSION

PRIORITY_SOURCE_TYPES = [
    'im_group_summary',
    'email_project_summary',
    'im_project_group',
    'approval_project_profile',
    'internal_archive',
    'beauty_evolution',
    'person_profile',
    'project_profile',
]


def embed_text(text: str) -> list:
    resp = requests.post(
        settings.QWEN3_EMBEDDING_URL,
        json={'input': [text[:2048]], 'model': 'qwen3-embedding'},
        headers={
            'Authorization': f'Bearer {settings.QWEN3_EMBEDDING_KEY}',
            'Content-Type': 'application/json',
        },
        timeout=30,
    )
    data = resp.json()
    if 'data' in data and data['data']:
        return data['data'][0]['embedding']
    raise ValueError(f"Qwen3 响应异常: {data}")


def prepare_text(entry) -> str:
    parts = []
    if entry.title:
        parts.append(entry.title)
    if entry.summary:
        parts.append(entry.summary)
    if entry.content:
        parts.append(entry.content[:1500])
    return '\n'.join(parts)[:2048] or '(空内容)'


class Command(BaseCommand):
    help = '优先向量化高价值新建条目（使用内网Qwen GPU）'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--all-pending', action='store_true',
                            help='处理所有pending（不限source_type）')
        parser.add_argument('--workers', type=int, default=1)

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if options['all_pending']:
            qs = KnowledgeEntry.objects.filter(
                is_deleted=False, index_status='pending'
            ).order_by('id')
        else:
            qs = KnowledgeEntry.objects.filter(
                is_deleted=False,
                index_status='pending',
                source_type__in=PRIORITY_SOURCE_TYPES,
            ).order_by('id')

        total = qs.count()
        self.stdout.write(f'待向量化: {total} 条')
        by_type = qs.values('source_type').annotate(n=Count('id')).order_by('-n')
        for r in by_type:
            self.stdout.write(f'  {r["source_type"] or "(空)"}: {r["n"]}')
        self.stdout.write('')

        if dry_run:
            self.stdout.write('--dry-run 模式，不调用 API')
            return

        ok = fail = skip = 0
        start = time.time()
        last_report = start

        for entry in qs.iterator(chunk_size=100):
            try:
                text = prepare_text(entry)
                if not text.strip():
                    skip += 1
                    continue
                embedding = embed_text(text)
                if not embedding:
                    fail += 1
                    continue
                with transaction.atomic():
                    KnowledgeEntry.objects.filter(id=entry.id).update(
                        embedding_id=f'pgvector:{entry.id}',
                        index_status='indexed',
                        indexed_at=timezone.now(),
                    )
                ok += 1
            except Exception as e:
                fail += 1
                self.stderr.write(f'✗ #{entry.id}: {e}')
                if fail > 30:
                    self.stderr.write('失败过多，中止。检查 Qwen 服务。')
                    break

            now = time.time()
            if now - last_report >= 15:
                done = ok + fail
                elapsed = now - start
                rate = done / elapsed * 60 if elapsed > 0 else 0
                eta = (total - done) / (done / elapsed) / 60 if done > 0 else 0
                self.stdout.write(
                    f'[{done}/{total}] 成功={ok} 失败={fail} '
                    f'速率={rate:.0f}/min ETA={eta:.0f}min'
                )
                last_report = now

        elapsed = time.time() - start
        rate = ok / elapsed * 60 if elapsed > 0 else 0
        self.stdout.write(
            f'\n=== 完成 ===\n成功: {ok}  失败: {fail}  跳过: {skip}\n'
            f'耗时: {elapsed:.0f}s  速率: {rate:.0f}/min'
        )
