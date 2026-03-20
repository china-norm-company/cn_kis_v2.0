"""
同步向量化管理命令：为所有 pending 状态的知识条目生成 embedding

在无 Redis/Celery 的本地环境中，同步执行向量化，替代异步 Celery 任务。
复用 tasks.py 中的 _prepare_embedding_text / _get_embedding / _store_embedding 函数。

用法:
  python manage.py vectorize_all_entries                   # 向量化所有 pending 条目
  python manage.py vectorize_all_entries --batch-size 20   # 每批 20 条（避免 API 限流）
  python manage.py vectorize_all_entries --dry-run         # 仅统计，不调用 API
  python manage.py vectorize_all_entries --retry-failed    # 同时重试 failed 状态的条目
  python manage.py vectorize_all_entries --entry-id 42     # 仅向量化指定条目
"""
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.knowledge.models import KnowledgeEntry

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '同步向量化所有 pending 状态的 KnowledgeEntry（无需 Celery/Redis）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-size', type=int, default=50,
            help='每批处理条目数（默认 50，控制 API 调用速率）',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='仅统计待向量化条目，不调用 API',
        )
        parser.add_argument(
            '--retry-failed', action='store_true',
            help='同时重试 index_status=failed 的条目',
        )
        parser.add_argument(
            '--entry-id', type=int, default=0,
            help='仅向量化指定 entry_id 的条目',
        )
        parser.add_argument(
            '--sleep-ms', type=int, default=500,
            help='每条之间的等待毫秒数（默认 500ms，遵守 API 速率限制）',
        )
        parser.add_argument(
            '--workers', type=int, default=1,
            help='并发 worker 数（默认 1，适合本地串行；>1 时使用线程并发）',
        )

    def handle(self, *args, **options):
        from apps.knowledge.tasks import (
            _prepare_embedding_text,
            _get_embedding,
            _store_embedding,
        )

        dry_run = options['dry_run']
        batch_size = options['batch_size']
        retry_failed = options['retry_failed']
        entry_id = options['entry_id']
        sleep_seconds = options['sleep_ms'] / 1000.0
        workers = max(1, int(options['workers'] or 1))

        # 构建查询集
        if entry_id:
            qs = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False)
        else:
            statuses = ['pending']
            if retry_failed:
                statuses.append('failed')
            qs = KnowledgeEntry.objects.filter(
                index_status__in=statuses,
                is_deleted=False,
            ).order_by('id')

        total = qs.count()
        self.stdout.write(
            self.style.HTTP_INFO(
                f'待向量化条目: {total} 条 '
                f'({"含 failed 重试" if retry_failed else "仅 pending"})'
            )
        )

        if dry_run:
            self.stdout.write('--dry-run 模式，不调用 API。')
            from django.db.models import Count
            by_type = qs.values('entry_type').annotate(count=Count('id')).order_by('-count')
            for row in by_type:
                self.stdout.write(f'  {row["entry_type"]}: {row["count"]} 条')
            return

        if total == 0:
            self.stdout.write('无需向量化的条目。')
            return

        success_count = 0
        failed_count = 0
        skip_count = 0
        processed = 0

        ids = list(qs.values_list('id', flat=True))

        for i in range(0, len(ids), batch_size):
            batch_ids = ids[i:i + batch_size]
            entries = KnowledgeEntry.objects.filter(id__in=batch_ids)

            if workers == 1:
                batch_results = [
                    self._process_entry(entry, _prepare_embedding_text, _get_embedding, _store_embedding, sleep_seconds)
                    for entry in entries
                ]
            else:
                with ThreadPoolExecutor(max_workers=workers) as executor:
                    futures = {
                        executor.submit(
                            self._process_entry,
                            entry,
                            _prepare_embedding_text,
                            _get_embedding,
                            _store_embedding,
                            sleep_seconds,
                        ): entry.id
                        for entry in entries
                    }
                    batch_results = [future.result() for future in as_completed(futures)]

            for result in sorted(batch_results, key=lambda item: item['entry_id']):
                processed += 1
                status = result['status']
                if status == 'indexed':
                    success_count += 1
                    self.stdout.write(
                        f'  ✓ #{result["entry_id"]} {result["title"][:40]} → {result["target"]}'
                    )
                elif status == 'skipped':
                    skip_count += 1
                    self.stdout.write(
                        self.style.WARNING(f'  ! 跳过 #{result["entry_id"]}（内容为空）')
                    )
                else:
                    failed_count += 1
                    self.stdout.write(
                        self.style.WARNING(f'  ! #{result["entry_id"]} 向量化异常: {result["error"]}')
                    )

            self.stdout.write(
                f'批次 {i // batch_size + 1}: '
                f'已处理 {processed}/{total} | '
                f'成功 {success_count} | 失败 {failed_count} | 跳过 {skip_count}'
            )

        self.stdout.write(self.style.SUCCESS(
            f'\n向量化完成: 成功 {success_count} | 失败 {failed_count} | 跳过 {skip_count} | '
            f'共处理 {processed}/{total}'
        ))

        if failed_count > 0:
            self.stdout.write(self.style.WARNING(
                f'  {failed_count} 条失败，可用 --retry-failed 重试'
            ))

    def _process_entry(
        self,
        entry,
        prepare_embedding_text,
        get_embedding,
        store_embedding,
        sleep_seconds: float,
    ):
        from django.db import close_old_connections

        close_old_connections()
        try:
            text = prepare_embedding_text(entry)
            if not text.strip():
                return {
                    'entry_id': entry.id,
                    'title': entry.title,
                    'status': 'skipped',
                }

            embedding = get_embedding(text)
            if not embedding:
                KnowledgeEntry.objects.filter(id=entry.id).update(index_status='failed')
                return {
                    'entry_id': entry.id,
                    'title': entry.title,
                    'status': 'failed',
                    'error': '获取 embedding 失败',
                }

            embedding_id = store_embedding(entry.id, embedding, entry)
            KnowledgeEntry.objects.filter(id=entry.id).update(
                embedding_id=embedding_id or str(entry.id),
                index_status='indexed',
                indexed_at=timezone.now(),
            )

            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

            return {
                'entry_id': entry.id,
                'title': entry.title,
                'status': 'indexed',
                'target': embedding_id or 'pgvector',
            }
        except Exception as e:
            logger.warning('vectorize_all_entries: 条目 #%s 向量化失败: %s', entry.id, e)
            KnowledgeEntry.objects.filter(id=entry.id).update(index_status='failed')
            return {
                'entry_id': entry.id,
                'title': entry.title,
                'status': 'failed',
                'error': str(e),
            }
        finally:
            close_old_connections()
