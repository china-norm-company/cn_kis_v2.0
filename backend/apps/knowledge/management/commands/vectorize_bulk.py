"""
vectorize_bulk — 高效批量向量化管理命令

替代 Celery+本地BGE 方案，统一使用 1024 维向量 + pgvector 写入。
无需 Celery worker，无需 GPU，无需 LLM API。

Jina 免费额度限速 100K tokens/min，内置指数退避自动适配。

维度说明：
  - pgvector 列为无约束维度（atttypmod=-1），统一使用 1024 维
  - --source jina  → 1024 维（Jina API 在线）
  - --source local → 1024 维（fastembed jinaai/jina-embeddings-v3 本地推理）
  - --source auto  → 先尝试本地，失败后降级 Jina

用法：
  python manage.py vectorize_bulk                          # 默认：jina 全量
  python manage.py vectorize_bulk --batch-size 20 --status failed
  python manage.py vectorize_bulk --status pending --limit 1000
  python manage.py vectorize_bulk --source jina   # 强制 Jina API（1024维）
  python manage.py vectorize_bulk --source local  # 强制本地 fastembed（1024维）
  python manage.py vectorize_bulk --dry-run       # 预览不写入
"""
import logging
import time
from typing import List, Optional

from django.core.management.base import BaseCommand
from django.conf import settings

logger = logging.getLogger('cn_kis.knowledge.vectorize_bulk')

_RATE_LIMIT_BACKOFF_BASE = 8
_RATE_LIMIT_BACKOFF_MAX = 120
_INTER_BATCH_DELAY = 2.5


def _embed_qwen3(texts: List[str], stdout=None) -> Optional[List[List[float]]]:
    """内网 Qwen3 Embedding GPU 服务器（主通道，1024维，最快）"""
    import requests
    url = getattr(settings, 'QWEN3_EMBEDDING_URL',
                  'http://10.0.12.30:18099/Embedding/v1/embeddings')
    key = getattr(settings, 'QWEN3_EMBEDDING_KEY',
                  '7ed12a89-fe21-4ed1-9616-1f6f27e64637')
    results = []
    for text in texts:
        try:
            resp = requests.post(
                url, json={'input': text},
                headers={'Authorization': f'Bearer {key}'},
                timeout=10, verify=False,
            )
            data = resp.json()
            if 'data' in data and data['data']:
                results.append(data['data'][0]['embedding'])
            else:
                return None
        except Exception as e:
            logger.debug('Qwen3 embedding 失败: %s', e)
            return None
    return results if len(results) == len(texts) else None


def _embed_jina(texts: List[str], stdout=None) -> Optional[List[List[float]]]:
    """Jina API 降级通道"""
    import requests
    jina_key = getattr(settings, 'JINA_API_KEY', '')
    jina_model = getattr(settings, 'JINA_EMBEDDING_MODEL', 'jina-embeddings-v3')
    jina_dim = getattr(settings, 'JINA_EMBEDDING_DIM', 1024)
    jina_task = getattr(settings, 'JINA_EMBEDDING_TASK', 'retrieval.passage')
    if not jina_key:
        return None
    backoff = _RATE_LIMIT_BACKOFF_BASE
    for attempt in range(4):
        try:
            resp = requests.post(
                'https://api.jina.ai/v1/embeddings',
                json={'model': jina_model, 'input': texts,
                      'dimensions': jina_dim, 'task': jina_task},
                headers={'Authorization': f'Bearer {jina_key}'},
                timeout=30,
            )
            data = resp.json()
            if 'data' in data:
                return [d['embedding'] for d in data['data']]
            if 'rate limit' in str(data).lower() or resp.status_code == 429:
                if stdout:
                    stdout.write(f'    Jina 限速，等待 {backoff}s 后重试 ({attempt+1}/3)')
                time.sleep(backoff)
                backoff = min(backoff * 2, _RATE_LIMIT_BACKOFF_MAX)
                continue
            return None
        except Exception as e:
            logger.debug('Jina embedding 失败: %s', e)
            return None
    return None


def _embed_local(texts: List[str]) -> Optional[List[List[float]]]:
    """本地 fastembed 降级通道（CPU 推理，慢但离线可用）"""
    try:
        from fastembed import TextEmbedding
        _model = getattr(_embed_local, '_cached', None)
        if _model is None:
            _model = TextEmbedding('jinaai/jina-embeddings-v3')
            _embed_local._cached = _model
        return [v.tolist() if hasattr(v, 'tolist') else list(v) for v in _model.embed(texts)]
    except Exception as e:
        logger.debug('fastembed 失败: %s', e)
    return None


def _prepare_text(row) -> str:
    eid, title, content, summary, tags = row[0], row[1], row[2], row[3], row[4]
    title = title or ''
    text = title
    if summary and len(summary) > 10:
        text += '\n' + summary[:1000]
    elif content:
        text += '\n' + content[:1500]
    if tags and isinstance(tags, list):
        text += '\n' + ' '.join(str(t) for t in tags[:10])
    return text.strip()[:2000]


class Command(BaseCommand):
    help = '高效批量向量化（Qwen3 内网GPU / fastembed / Jina API → pgvector 1024维）'

    def add_arguments(self, parser):
        parser.add_argument('--batch-size', type=int, default=50)
        parser.add_argument('--limit', type=int, default=0, help='0=全量')
        parser.add_argument('--source', choices=['auto', 'qwen3', 'local', 'jina'], default='auto',
                            help='auto=qwen3→local→jina; qwen3=内网GPU; local=fastembed; jina=Jina API')
        parser.add_argument('--status', choices=['all', 'failed', 'pending'], default='all')
        parser.add_argument('--dry-run', action='store_true', dest='dry_run')

    def handle(self, *args, **options):
        from django.db import connection

        batch_size = options['batch_size']
        limit = options['limit']
        source = options['source']
        status_filter = options['status']
        dry_run = options['dry_run']

        where = 'is_deleted = false'
        if status_filter == 'failed':
            where += " AND index_status = 'failed'"
        elif status_filter == 'pending':
            where += " AND index_status = 'pending'"
        else:
            where += " AND index_status IN ('failed', 'pending')"

        with connection.cursor() as cur:
            cur.execute(f'SELECT COUNT(*) FROM t_knowledge_entry WHERE {where}')
            total = cur.fetchone()[0]

        if limit > 0:
            total = min(total, limit)

        if total == 0:
            self.stdout.write('无待处理条目。')
            return

        self.stdout.write(f'待处理: {total} 条 | batch={batch_size} | source={source}')

        processed = success = failed = 0
        consecutive_failures = 0
        start = time.time()

        offset = 0
        while offset < total:
            n = min(batch_size, total - offset)
            with connection.cursor() as cur:
                cur.execute(
                    f'SELECT id, title, content, summary, tags '
                    f'FROM t_knowledge_entry WHERE {where} ORDER BY id LIMIT %s OFFSET %s',
                    (n, offset)
                )
                rows = cur.fetchall()

            if not rows:
                break

            ids = [r[0] for r in rows]
            texts = [_prepare_text(r) for r in rows]

            if source == 'qwen3':
                embeddings = _embed_qwen3(texts, stdout=self.stdout)
            elif source == 'local':
                embeddings = _embed_local(texts)
            elif source == 'jina':
                embeddings = _embed_jina(texts, stdout=self.stdout)
            else:  # auto: qwen3 → local → jina
                embeddings = _embed_qwen3(texts, stdout=self.stdout) or \
                             _embed_local(texts) or \
                             _embed_jina(texts, stdout=self.stdout)

            if not embeddings or len(embeddings) != len(texts):
                consecutive_failures += 1
                backoff = min(_RATE_LIMIT_BACKOFF_BASE * (2 ** consecutive_failures),
                              _RATE_LIMIT_BACKOFF_MAX)
                self.stdout.write(self.style.WARNING(
                    f'  批次 offset={offset} 失败（连续{consecutive_failures}次），'
                    f'退避 {backoff}s'
                ))
                time.sleep(backoff)
                failed += len(rows)
                offset += len(rows)
                continue

            consecutive_failures = 0

            if not dry_run:
                for eid, emb in zip(ids, embeddings):
                    try:
                        with connection.cursor() as cur:
                            vec_str = '[' + ','.join(f'{v:.6f}' for v in emb) + ']'
                            cur.execute(
                                "UPDATE t_knowledge_entry SET "
                                "embedding_vector=%s::vector, embedding_id=%s, "
                                "index_status='indexed', indexed_at=NOW() WHERE id=%s",
                                (vec_str, f'jina_{eid}', eid)
                            )
                        success += 1
                    except Exception as e:
                        logger.warning('写入 entry#%d 失败: %s', eid, e)
                        failed += 1
            else:
                success += len(rows)

            processed += len(rows)
            offset += len(rows)

            elapsed = time.time() - start
            rate = processed / elapsed if elapsed > 0 else 1
            remaining = (total - processed) / rate if rate > 0 else 0
            dim = len(embeddings[0]) if embeddings else 0
            self.stdout.write(
                f'  {processed}/{total} ({processed/total*100:.1f}%) | '
                f'{rate:.1f}条/s | 剩余{remaining/60:.1f}分 | dim={dim}'
            )

            time.sleep(_INTER_BATCH_DELAY)

        total_time = time.time() - start
        self.stdout.write(self.style.SUCCESS(
            f'完成！成功={success} 失败={failed} '
            f'总耗时={total_time/60:.1f}分 '
            f'平均={processed/max(total_time, 0.1):.1f}条/s'
        ))
