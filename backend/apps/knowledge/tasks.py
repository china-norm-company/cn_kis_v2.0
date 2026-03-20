"""
知识系统 Celery 异步任务
"""
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from celery import shared_task

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSION = 1024  # 统一契约：jinaai/jina-embeddings-v3 本地 1024 维


def _get_effective_dim(embedding: list) -> int:
    """获取实际 embedding 维度（动态适配不同模型）"""
    return len(embedding) if embedding else EMBEDDING_DIMENSION
KNOWLEDGE_STABILITY_LOG_DIR = Path(__file__).resolve().parents[3] / 'logs' / 'knowledge_stability'
KNOWLEDGE_STABILITY_LOG_FILE = KNOWLEDGE_STABILITY_LOG_DIR / 'task_events.jsonl'


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _knowledge_task_started(task_name: str, retry_count: int = 0, **extra) -> Dict[str, Any]:
    return {
        'task_name': task_name,
        'retry_count': retry_count,
        'started_at': _utc_now().isoformat(),
        'monotonic_start': time.monotonic(),
        'extra': extra,
    }


def _extract_task_counts(result: Any) -> Dict[str, int]:
    if not isinstance(result, dict):
        return {'created_count': 0, 'skipped_count': 0, 'error_count': 0}

    created_keys = ['created_count', 'created', 'ingested_count', 'new_entries', 'saved_count']
    skipped_keys = ['skipped_count', 'duplicates', 'duplicate_count', 'ignored_count']
    error_keys = ['error_count', 'failed_count']

    def _pick(keys):
        for key in keys:
            value = result.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                return int(value)
        return 0

    error_count = _pick(error_keys)
    if not error_count and result.get('status') == 'error':
        error_count = 1

    return {
        'created_count': _pick(created_keys),
        'skipped_count': _pick(skipped_keys),
        'error_count': error_count,
    }


def _record_knowledge_task_event(
    run: Dict[str, Any],
    status: str,
    result: Any = None,
    error: str = '',
    **extra,
) -> Dict[str, Any]:
    counts = _extract_task_counts(result)
    payload = {
        'task_name': run['task_name'],
        'status': status,
        'started_at': run['started_at'],
        'finished_at': _utc_now().isoformat(),
        'elapsed_ms': int((time.monotonic() - run['monotonic_start']) * 1000),
        'retry_count': run.get('retry_count', 0),
        'created_count': counts['created_count'],
        'skipped_count': counts['skipped_count'],
        'error_count': counts['error_count'],
        'error': error or '',
        'extra': {**(run.get('extra') or {}), **extra},
    }

    KNOWLEDGE_STABILITY_LOG_DIR.mkdir(parents=True, exist_ok=True)
    with KNOWLEDGE_STABILITY_LOG_FILE.open('a', encoding='utf-8') as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + '\n')

    logger.info('knowledge_task_event=%s', json.dumps(payload, ensure_ascii=False))
    return payload


def queue_feishu_document_knowledge_harvest(
    document_id: int = None,
    feishu_doc_token: str = '',
    trigger: str = 'manual',
    event_data: dict = None,
) -> None:
    """统一的飞书文档知识化入队入口。"""
    from celery import current_app

    kwargs = {
        'document_id': document_id,
        'feishu_doc_token': feishu_doc_token,
        'trigger': trigger,
        'event_data': event_data or {},
    }
    current_app.send_task(
        'apps.knowledge.tasks.harvest_feishu_document_knowledge',
        kwargs=kwargs,
        countdown=10 if trigger == 'publish' else 0,
    )


@shared_task(
    name='apps.knowledge.tasks.harvest_feishu_document_knowledge',
    bind=True,
    max_retries=2,
)
def harvest_feishu_document_knowledge(
    self,
    document_id: int = None,
    feishu_doc_token: str = '',
    trigger: str = 'manual',
    event_data: dict = None,
):
    """飞书文档知识化任务。"""
    run = _knowledge_task_started(
        'harvest_feishu_document_knowledge',
        retry_count=getattr(self.request, 'retries', 0),
        document_id=document_id,
        feishu_doc_token=feishu_doc_token,
        trigger=trigger,
    )
    try:
        from .feishu_doc_knowledge_extractor import harvest_feishu_document_knowledge as harvest

        result = harvest(
            document_id=document_id,
            feishu_doc_token=feishu_doc_token,
            trigger=trigger,
            event_data=event_data or {},
        )
        logger.info('Feishu doc knowledge harvest complete: %s', result)
        _record_knowledge_task_event(run, 'success', result=result)
        return result
    except Exception as exc:
        logger.error(
            'harvest_feishu_document_knowledge failed document_id=%s token=%s error=%s',
            document_id,
            feishu_doc_token,
            exc,
        )
        _record_knowledge_task_event(run, 'failed', error=str(exc))
        raise self.retry(exc=exc)


@shared_task(
    name='apps.knowledge.tasks.vectorize_knowledge_entry',
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=900,
)
def vectorize_knowledge_entry(self, entry_id: int):
    """
    为指定知识条目生成 embedding 并写入向量存储。

    失败时：
    - 自动重试 3 次（指数退避：1分/5分/15分）
    - 3 次均失败：标记 index_status=failed，发送告警
    """
    from .models import KnowledgeEntry

    run = _knowledge_task_started(
        'vectorize_knowledge_entry',
        retry_count=getattr(self.request, 'retries', 0),
        entry_id=entry_id,
    )
    try:
        entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
        if not entry:
            logger.warning('vectorize_knowledge_entry: entry #%s not found', entry_id)
            _record_knowledge_task_event(run, 'skipped', result={'skipped_count': 1}, reason='entry_not_found')
            return

        if entry.index_status == 'indexed':
            logger.debug('Entry #%s already indexed, skipping', entry_id)
            _record_knowledge_task_event(run, 'skipped', result={'skipped_count': 1}, reason='already_indexed')
            return

        text_to_embed = _prepare_embedding_text(entry)
        embedding = _get_embedding(text_to_embed)

        if not embedding:
            raise ValueError(f'Failed to get embedding for entry #{entry_id}')

        embedding_id = _store_embedding(entry_id, embedding, entry)

        KnowledgeEntry.objects.filter(id=entry_id).update(
            embedding_id=embedding_id or str(entry_id),
            index_status='indexed',
            indexed_at=datetime.now(timezone.utc),
        )
        logger.info('Entry #%s vectorized successfully, embedding_id=%s', entry_id, embedding_id)
        _record_knowledge_task_event(run, 'success', result={'created_count': 1}, embedding_id=embedding_id)

    except Exception as exc:
        logger.error('vectorize_knowledge_entry failed for entry #%s: %s', entry_id, exc)

        if self.request.retries >= self.max_retries:
            _mark_index_failed(entry_id, str(exc))
            _record_knowledge_task_event(run, 'failed', error=str(exc), result={'error_count': 1})
            return

        _record_knowledge_task_event(run, 'retrying', error=str(exc), result={'error_count': 1})
        raise self.retry(exc=exc)


def _prepare_embedding_text(entry) -> str:
    """组合用于 embedding 的文本"""
    parts = []
    if entry.title:
        parts.append(f'标题：{entry.title}')
    if entry.summary:
        parts.append(f'摘要：{entry.summary}')
    if entry.content:
        content_preview = entry.content[:2000]
        parts.append(f'内容：{content_preview}')
    if entry.tags:
        parts.append(f'标签：{", ".join(entry.tags[:10])}')
    return '\n'.join(parts)[:8000]


def _get_embedding(text: str):
    """
    向量嵌入策略（统一 1024 维）：
    主通道：本地 Qwen3 Embedding（内网 GPU 服务器，1024维）
    降级1：本地 fastembed jinaai/jina-embeddings-v3（1024维，无需 API Key）
    降级2：Jina API（在线，1024维）
    降级3：火山云 ARK
    """
    strategy = os.getenv('KNOWLEDGE_EMBEDDING_STRATEGY', 'qwen3').strip().lower()

    # 主通道：本地 Qwen3 Embedding（GPU 服务器，1024维，最优质量）
    if strategy in ('qwen3', 'fastembed', 'auto', 'local'):
        try:
            import requests as _req
            from django.conf import settings as _s
            qwen3_url = getattr(_s, 'QWEN3_EMBEDDING_URL',
                                'http://10.0.12.30:18099/Embedding/v1/embeddings')
            qwen3_key = getattr(_s, 'QWEN3_EMBEDDING_KEY',
                                '7ed12a89-fe21-4ed1-9616-1f6f27e64637')
            resp = _req.post(
                qwen3_url,
                json={'input': text},
                headers={'Authorization': f'Bearer {qwen3_key}'},
                timeout=10,
                verify=False,
            )
            data = resp.json()
            if 'data' in data and data['data']:
                emb = data['data'][0]['embedding']
                logger.debug('Qwen3 embedding 成功 dim=%d', len(emb))
                return emb
        except Exception as e:
            logger.debug('Qwen3 本地 embedding 失败: %s，降级到 fastembed', e)

    # 降级1：本地 fastembed（jinaai/jina-embeddings-v3，1024 维）
    if strategy in ('fastembed', 'auto', 'local'):
        try:
            from fastembed import TextEmbedding
            _fastembed_model = getattr(_get_embedding, '_cached_model', None)
            if _fastembed_model is None:
                _fastembed_model = TextEmbedding('jinaai/jina-embeddings-v3')
                _get_embedding._cached_model = _fastembed_model
            result = list(_fastembed_model.embed([text]))
            if result:
                emb = result[0].tolist() if hasattr(result[0], 'tolist') else list(result[0])
                logger.debug('fastembed embedding 成功 dim=%d', len(emb))
                return emb
        except Exception as e:
            logger.debug('fastembed 本地 embedding 失败: %s', e)

    # 降级2：Jina AI API（在线，1024 维）
    try:
        import requests
        from django.conf import settings as _settings
        jina_key = getattr(_settings, 'JINA_API_KEY', '')
        jina_model = getattr(_settings, 'JINA_EMBEDDING_MODEL', 'jina-embeddings-v3')
        jina_dim = getattr(_settings, 'JINA_EMBEDDING_DIM', 1024)
        jina_task = getattr(_settings, 'JINA_EMBEDDING_TASK', 'retrieval.passage')
        if jina_key:
            resp = requests.post(
                'https://api.jina.ai/v1/embeddings',
                json={'model': jina_model, 'input': [text], 'dimensions': jina_dim, 'task': jina_task},
                headers={'Authorization': f'Bearer {jina_key}'},
                timeout=15,
            )
            data = resp.json()
            if 'data' in data and data['data']:
                return data['data'][0]['embedding']
    except Exception as e:
        logger.debug('Jina API embedding 失败: %s', e)

    # 降级3：火山云 ARK
    try:
        from apps.agent_gateway.services import get_ark_embedding
        embedding, trace = get_ark_embedding(text)
        if embedding:
            return embedding
    except Exception as e:
        logger.debug('ARK embedding failed: %s', e)

    return None


def _store_embedding(entry_id: int, embedding: list, entry) -> str:
    """
    将 embedding 存入向量存储，返回存储 ID。

    存储策略：
    1. 先写 pgvector（事实真相源 / fallback）
    2. 再写 Qdrant（主 ANN 召回层）
    3. 任一成功即可视为索引成功；两边都成功时返回主读后端 Qdrant
    """
    import os
    preferred_backend = os.getenv('KNOWLEDGE_VECTOR_BACKEND', 'qdrant').strip().lower()
    write_qdrant = os.getenv('KNOWLEDGE_VECTOR_WRITE_QDRANT', 'true').strip().lower() in (
        '1', 'true', 'yes', 'on'
    )
    wrote_pgvector = False
    wrote_qdrant = False

    if len(embedding) != EMBEDDING_DIMENSION:
        # 维度不匹配时记录 debug（pgvector 无约束列不会拒绝，但影响检索质量）
        logger.debug(
            'Embedding dimension %d (expected %d) — check KNOWLEDGE_EMBEDDING_STRATEGY',
            len(embedding), EMBEDDING_DIMENSION
        )

    # 路径 1: 写入 pgvector（事实真相源 / fallback）
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 't_knowledge_entry' AND column_name = 'embedding_vector'",
            )
            if cursor.fetchone():
                embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
                cursor.execute(
                    "UPDATE t_knowledge_entry SET embedding_vector = %s::vector WHERE id = %s",
                    [embedding_str, entry_id]
                )
                wrote_pgvector = True
    except Exception as e:
        logger.debug('pgvector upsert failed: %s', e)

    # 路径 2: 写入 Qdrant（主 ANN 召回层）
    if write_qdrant:
        try:
            from libs.mcp_client import vector_upsert
            result = vector_upsert(
                point_id=str(entry_id),
                vector=embedding,
                payload={
                    'entry_id': entry_id,
                    'entry_type': entry.entry_type,
                    'title': entry.title,
                    'namespace': entry.namespace or '',
                }
            )
            if result and 'error' not in result:
                wrote_qdrant = True
        except Exception as e:
            logger.debug('Qdrant upsert failed: %s', e)

    if wrote_qdrant and wrote_pgvector:
        return f'qdrant:{entry_id}' if preferred_backend == 'qdrant' else f'pgvector:{entry_id}'
    if wrote_qdrant:
        return f'qdrant:{entry_id}'
    if wrote_pgvector:
        return f'pgvector:{entry_id}'

    return ''


def _mark_index_failed(entry_id: int, error: str):
    """标记向量化失败，发送告警"""
    from .models import KnowledgeEntry

    KnowledgeEntry.objects.filter(id=entry_id).update(index_status='failed')
    logger.error('Entry #%s vectorization permanently failed: %s', entry_id, error)

    try:
        from apps.secretary.alert_service import send_system_alert
        send_system_alert(
            title=f'知识向量化失败：条目 #{entry_id}',
            message=f'知识条目 #{entry_id} 向量化失败（已重试 3 次）：{error[:200]}',
            level='warning',
        )
    except Exception as e:
        logger.debug('Failed to send vectorization failure alert: %s', e)


@shared_task(
    name='apps.knowledge.tasks.harvest_meeting_knowledge',
    bind=True,
    max_retries=2,
)
def harvest_meeting_knowledge(self, meeting_id: str, meeting_title: str = '', attendees: list = None):
    """
    从飞书会议纪要提炼知识（会议结束后触发）
    """
    run = _knowledge_task_started(
        'harvest_meeting_knowledge',
        retry_count=getattr(self.request, 'retries', 0),
        meeting_id=meeting_id,
    )
    try:
        from .feishu_knowledge_fetcher import extract_meeting_knowledge
        from libs.feishu_client import feishu_client

        # 获取会议纪要（飞书文档）
        minutes_text = ''
        try:
            minutes = feishu_client.get_meeting_minutes(meeting_id)
            if minutes:
                minutes_text = minutes.get('content', '') or minutes.get('text', '')
        except Exception as e:
            logger.warning('Failed to get meeting minutes for %s: %s', meeting_id, e)

        if not minutes_text:
            logger.info('No minutes found for meeting %s', meeting_id)
            _record_knowledge_task_event(run, 'skipped', result={'skipped_count': 1}, reason='no_minutes')
            return

        result = extract_meeting_knowledge(
            meeting_id=meeting_id,
            minutes_text=minutes_text,
            meeting_title=meeting_title,
            attendees=attendees,
        )
        logger.info('Meeting %s knowledge harvest: %s', meeting_id, result)
        _record_knowledge_task_event(run, 'success', result=result)

    except Exception as exc:
        logger.error('harvest_meeting_knowledge failed for %s: %s', meeting_id, exc)
        _record_knowledge_task_event(run, 'failed', error=str(exc), result={'error_count': 1})
        raise self.retry(exc=exc)


@shared_task(
    name='apps.knowledge.tasks.harvest_approval_knowledge',
    bind=True,
    max_retries=2,
)
def harvest_approval_knowledge(self, instance_code: str, approval_code: str = '', event_data: dict = None):
    """
    从飞书审批记录提取知识（审批通过后触发）
    """
    run = _knowledge_task_started(
        'harvest_approval_knowledge',
        retry_count=getattr(self.request, 'retries', 0),
        instance_code=instance_code,
        approval_code=approval_code,
    )
    try:
        from .feishu_knowledge_fetcher import extract_approval_knowledge
        from libs.feishu_client import feishu_client

        event_data = event_data or {}

        # 获取审批详细信息（表单内容）
        form_content = {}
        approval_type = 'other'
        try:
            instance_detail = feishu_client.get_approval_instance(instance_code)
            if instance_detail:
                form = instance_detail.get('form', [])
                if isinstance(form, list):
                    form_content = {
                        item.get('name', f'field_{i}'): item.get('value', '')
                        for i, item in enumerate(form)
                        if isinstance(item, dict)
                    }
                elif isinstance(form, str):
                    import json
                    try:
                        form_content = json.loads(form)
                    except Exception:
                        form_content = {'content': form}

                # 尝试从 approval_code 判断类型
                code_lower = (approval_code or '').lower()
                if 'deviation' in code_lower or '偏差' in approval_code:
                    approval_type = 'deviation'
                elif 'capa' in code_lower:
                    approval_type = 'capa'
                elif 'purchase' in code_lower or '采购' in approval_code:
                    approval_type = 'purchase'

        except Exception as e:
            logger.warning('Failed to get approval detail for %s: %s', instance_code, e)
            # 使用事件数据中的内容作为降级
            form_content = event_data.get('form', {})

        result = extract_approval_knowledge(
            approval_code=approval_code,
            instance_code=instance_code,
            approval_type=approval_type,
            form_content=form_content,
        )
        logger.info('Approval %s knowledge harvest: %s', instance_code, result)
        _record_knowledge_task_event(run, 'success', result=result)

    except Exception as exc:
        logger.error('harvest_approval_knowledge failed for %s: %s', instance_code, exc)
        _record_knowledge_task_event(run, 'failed', error=str(exc), result={'error_count': 1})
        raise self.retry(exc=exc)


@shared_task(
    name='apps.knowledge.tasks.daily_chat_knowledge_harvest',
)
def daily_chat_knowledge_harvest():
    """
    每日群聊知识沉淀定时任务（每日 02:00 执行）
    """
    run = _knowledge_task_started('daily_chat_knowledge_harvest')
    try:
        from .feishu_knowledge_fetcher import harvest_chat_messages
        import os

        # 从配置获取需要采集的群组 ID 列表
        group_ids_str = os.getenv('KNOWLEDGE_HARVEST_GROUP_IDS', '')
        group_ids = [g.strip() for g in group_ids_str.split(',') if g.strip()]

        if not group_ids:
            logger.info('daily_chat_knowledge_harvest: no group_ids configured, skipping')
            _record_knowledge_task_event(run, 'skipped', result={'skipped_count': 1}, reason='no_group_ids')
            return

        result = harvest_chat_messages(
            group_ids=group_ids,
            date_range_days=1,
        )
        logger.info('Daily chat harvest complete: %s', result)
        _record_knowledge_task_event(run, 'success', result=result, group_count=len(group_ids))
        return result

    except Exception as e:
        logger.error('daily_chat_knowledge_harvest failed: %s', e)
        _record_knowledge_task_event(run, 'failed', error=str(e), result={'error_count': 1})
        return {'error': str(e)}


@shared_task(
    name='apps.knowledge.tasks.knowledge_expiry_check',
)
def knowledge_expiry_check():
    """
    知识条目过期检查（每月 15 日 02:00）

    按类型设置过期阈值，过期条目标记为 needs_review
    并通知对应 owner。
    """
    run = _knowledge_task_started('knowledge_expiry_check')
    from datetime import datetime, timezone, timedelta
    from .models import KnowledgeEntry
    from .quality_scorer import FRESHNESS_THRESHOLDS, DEFAULT_FRESHNESS_THRESHOLD_DAYS

    now = datetime.now(timezone.utc)
    stats = {'checked': 0, 'marked_expiring': 0, 'already_expired': 0, 'owner_notified': 0}

    published_entries = KnowledgeEntry.objects.filter(
        is_deleted=False,
        is_published=True,
        status='published',
    ).only('id', 'entry_type', 'update_time', 'title')

    for entry in published_entries:
        stats['checked'] += 1
        threshold_days = FRESHNESS_THRESHOLDS.get(
            entry.entry_type, DEFAULT_FRESHNESS_THRESHOLD_DAYS
        )

        age_days = (now - entry.update_time.replace(tzinfo=timezone.utc)).days if entry.update_time else 9999
        review_due = bool(entry.next_review_at and entry.next_review_at <= now)

        if age_days > threshold_days * 2:
            KnowledgeEntry.objects.filter(id=entry.id).update(
                status='archived',
                is_published=False,
            )
            stats['already_expired'] += 1
            logger.info('Entry #%s archived (age=%d days, threshold=%d)', entry.id, age_days, threshold_days)
            if _notify_knowledge_owner(entry, review_due=True, archived=True):
                stats['owner_notified'] += 1
        elif age_days > threshold_days or review_due:
            stats['marked_expiring'] += 1
            logger.debug('Entry #%s nearing expiry (age=%d days)', entry.id, age_days)
            if _notify_knowledge_owner(entry, review_due=review_due, archived=False):
                stats['owner_notified'] += 1

    logger.info('Knowledge expiry check complete: %s', stats)
    _record_knowledge_task_event(run, 'success', result=stats)
    return stats


def _notify_knowledge_owner(entry, review_due: bool, archived: bool) -> bool:
    if not entry.owner_id:
        return False

    try:
        from apps.notification.services import send_notification

        due_text = ''
        if entry.next_review_at:
            due_text = f'下次复核时间：{entry.next_review_at.isoformat()}'
        content = (
            f'知识条目《{entry.title}》需要处理。\n'
            f'命名空间：{entry.namespace or "-"}\n'
            f'状态：{"已归档" if archived else entry.status}\n'
            f'{due_text}'
        ).strip()
        send_notification(
            recipient_id=entry.owner_id,
            title='知识条目到期复核提醒',
            content=content,
            source_type='knowledge_expiry_check',
            source_id=entry.id,
        )
        return True
    except Exception as exc:
        logger.warning('Failed to notify knowledge owner entry=%s owner=%s error=%s', entry.id, entry.owner_id, exc)
        return False


@shared_task(
    name='apps.knowledge.tasks.run_external_fetchers',
)
def run_external_fetchers():
    """
    外部知识采集统一入口（每日 03:00 执行）

    采集源：NMPA 法规、内部 SOP、项目经验、论文
    """
    run = _knowledge_task_started('run_external_fetchers')
    try:
        from .external_fetcher import run_all_fetchers
        results = run_all_fetchers()
        logger.info('External fetchers complete: %s', results)
        _record_knowledge_task_event(run, 'success', result=results)
        return results
    except Exception as e:
        logger.error('run_external_fetchers failed: %s', e)
        _record_knowledge_task_event(run, 'failed', error=str(e), result={'error_count': 1})
        return {'error': str(e)}


@shared_task(
    name='apps.knowledge.tasks.paper_scout_run',
)
def paper_scout_run():
    """
    论文关键词监控采集（每周一 03:30 执行）
    """
    run = _knowledge_task_started('paper_scout_run')
    try:
        from .external_fetcher import fetch_papers_by_keywords
        result = fetch_papers_by_keywords()
        logger.info('Paper scout complete: %s', result)
        _record_knowledge_task_event(run, 'success', result=result)
        return result
    except Exception as e:
        logger.error('paper_scout_run failed: %s', e)
        _record_knowledge_task_event(run, 'failed', error=str(e), result={'error_count': 1})
        return {'error': str(e)}


@shared_task(name='apps.knowledge.tasks.snapshot_knowledge_quality_daily')
def snapshot_knowledge_quality_daily():
    """
    每日为所有 TopicPackage 生成知识质量快照，支持趋势分析。
    """
    from django.utils import timezone as tz
    from django.db.models import Avg, Sum, Q
    from .models import TopicPackage, KnowledgeEntry, EntryStatus, KnowledgeQualitySnapshot

    today = tz.now().date()
    created = 0

    for pkg in TopicPackage.objects.filter(is_deleted=False):
        if KnowledgeQualitySnapshot.objects.filter(package_id=pkg.package_id, snapshot_date=today).exists():
            continue

        entries = KnowledgeEntry.objects.filter(is_deleted=False).filter(
            Q(tags__contains=[pkg.package_id]) | Q(source_key__contains=pkg.package_id)
        )
        total = entries.count()
        published = entries.filter(status=EntryStatus.PUBLISHED).count()
        agg = entries.aggregate(avg_qs=Avg('quality_score'), cite_total=Sum('rag_cite_count'))

        expired = 0
        try:
            expired = entries.filter(next_review_at__lt=tz.now(), status=EntryStatus.PUBLISHED).count()
        except Exception:
            pass

        coverage = 0.0
        try:
            coverage = pkg.coverage_rate()
        except Exception:
            pass

        KnowledgeQualitySnapshot.objects.create(
            package_id=pkg.package_id,
            package_label=pkg.canonical_topic or pkg.package_id,
            snapshot_date=today,
            total_entries=total,
            published_entries=published,
            avg_quality_score=round(agg['avg_qs'] or 0.0, 1),
            expired_count=expired,
            rag_cite_total=agg['cite_total'] or 0,
            coverage_rate=round(coverage, 3),
        )
        created += 1

    logger.info('snapshot_knowledge_quality_daily: %d snapshots created', created)
    return {'created': created}
