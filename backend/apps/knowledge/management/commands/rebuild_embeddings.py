"""
重建所有知识条目的向量索引

使用本地 jinaai/jina-embeddings-v3 模型（1024维）批量生成语义向量，
替代之前的哈希伪向量。支持断点续传、进度显示。

用法：
  python manage.py rebuild_embeddings                     # 重建全部
  python manage.py rebuild_embeddings --batch-size 64    # 调整批次大小
  python manage.py rebuild_embeddings --only-pending     # 仅处理 pending 条目
  python manage.py rebuild_embeddings --dry-run          # 测试模式
"""
import logging
import time
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '使用本地 BGE 模型批量重建所有知识条目的向量索引'

    def add_arguments(self, parser):
        parser.add_argument('--batch-size', type=int, default=32,
                            help='每批处理条目数（默认32）')
        parser.add_argument('--only-pending', action='store_true',
                            help='仅处理 index_status=pending 的条目')
        parser.add_argument('--dry-run', action='store_true',
                            help='测试模式：只加载模型和取样，不写入数据库')
        parser.add_argument('--limit', type=int, default=0,
                            help='最多处理条目数（0=全部）')

    def handle(self, *args, **options):
        batch_size = options['batch_size']
        only_pending = options['only_pending']
        dry_run = options['dry_run']
        limit = options['limit']

        self.stdout.write('=' * 60)
        self.stdout.write('知识向量索引重建（本地 jinaai/jina-embeddings-v3, 1024维）')
        self.stdout.write('=' * 60)

        # 加载本地 embedding 模型
        self.stdout.write('正在加载本地 BGE 向量模型...')
        t0 = time.time()
        try:
            from apps.agent_gateway.services import _get_local_embedding_model, get_local_embedding
            model = _get_local_embedding_model()
            if model is None:
                self.stderr.write('本地向量模型加载失败！请确认已安装 fastembed：pip3 install fastembed')
                return
            # 预热测试
            test_vec = get_local_embedding('预热测试')
            if not test_vec or len(test_vec) != 1024:
                self.stderr.write(f'向量维度异常: {len(test_vec) if test_vec else 0}（预期 1024）')
                return
            self.stdout.write(self.style.SUCCESS(f'模型加载成功（{time.time()-t0:.1f}s），向量维度={len(test_vec)}'))
        except Exception as e:
            self.stderr.write(f'模型加载失败: {e}')
            return

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN 模式：不写入数据库'))

        # 查询需要处理的条目
        from apps.knowledge.models import KnowledgeEntry
        from django.db import connection

        qs = KnowledgeEntry.objects.filter(is_deleted=False, is_published=True)
        if only_pending:
            qs = qs.filter(index_status='pending')

        total = qs.count()
        if limit > 0:
            total = min(total, limit)

        self.stdout.write(f'待处理条目：{total} 条（only_pending={only_pending}）')

        if total == 0:
            self.stdout.write('无需处理，退出。')
            return

        # 批量处理
        success_count = 0
        fail_count = 0
        processed = 0
        start_time = time.time()

        offset = 0
        while processed < total:
            batch_qs = qs.order_by('id')[offset: offset + batch_size]
            batch = list(batch_qs.only('id', 'title', 'summary', 'content', 'tags', 'entry_type'))
            if not batch:
                break

            # 批量生成 embedding（fastembed 支持批量推理）
            texts = [_prepare_text(e) for e in batch]
            try:
                raw_vecs = list(model.embed(texts))
                vecs = [v.tolist() if hasattr(v, 'tolist') else list(v) for v in raw_vecs]
            except Exception as e:
                self.stderr.write(f'批量 embedding 失败（offset={offset}）: {e}')
                fail_count += len(batch)
                offset += batch_size
                processed += len(batch)
                continue

            if not dry_run:
                # 批量写入 pgvector
                with connection.cursor() as cursor:
                    for entry, vec in zip(batch, vecs):
                        try:
                            vec_str = '[' + ','.join(f'{x:.6f}' for x in vec) + ']'
                            cursor.execute(
                                "UPDATE t_knowledge_entry SET embedding_vector=%s::vector, "
                                "index_status='indexed' WHERE id=%s",
                                [vec_str, entry.id]
                            )
                            success_count += 1
                        except Exception as e:
                            logger.warning('写入向量失败 entry#%s: %s', entry.id, e)
                            fail_count += 1
            else:
                success_count += len(batch)

            processed += len(batch)
            offset += batch_size

            # 进度显示
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            eta = (total - processed) / rate if rate > 0 else 0
            self.stdout.write(
                f'  进度: {processed}/{total} ({100*processed//total}%)'
                f'  速度: {rate:.1f}条/s  预计剩余: {eta:.0f}s'
                f'  成功: {success_count}  失败: {fail_count}',
                ending='\r'
            )
            self.stdout.flush()

            if limit > 0 and processed >= limit:
                break

        self.stdout.write('')  # 换行
        self.stdout.write('=' * 60)
        elapsed = time.time() - start_time
        self.stdout.write(
            self.style.SUCCESS(
                f'向量重建完成！'
                f' 成功={success_count}  失败={fail_count}'
                f'  总耗时={elapsed:.1f}s  平均={elapsed/max(processed,1)*1000:.0f}ms/条'
            )
        )
        if dry_run:
            self.stdout.write(self.style.WARNING('（DRY-RUN：未写入数据库）'))


def _prepare_text(entry) -> str:
    """组合用于 embedding 的文本（与 tasks.py 保持一致）"""
    parts = []
    if entry.title:
        parts.append(entry.title)
    if entry.summary:
        parts.append(entry.summary)
    if entry.content:
        parts.append(entry.content[:1500])
    if entry.tags:
        try:
            tags = entry.tags if isinstance(entry.tags, list) else []
            if tags:
                parts.append(' '.join(str(t) for t in tags[:8]))
        except Exception:
            pass
    return ' '.join(parts)[:4096]
