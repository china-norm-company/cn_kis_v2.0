"""
process_pending_contexts — 将 PersonalContext 原始数据批量过 ingestion_pipeline 入库

使用方式：
    # 处理所有未入库的 PersonalContext（全量）
    python manage.py process_pending_contexts

    # 指定数据源
    python manage.py process_pending_contexts --source-type mail

    # 指定批次
    python manage.py process_pending_contexts --batch-id full-20260317

    # 控制并发批次大小
    python manage.py process_pending_contexts --batch-size 200

    # 限制处理总数（用于测试）
    python manage.py process_pending_contexts --limit 1000

    # 强制重新处理已入库的（source_type 已有对应 KnowledgeEntry）
    python manage.py process_pending_contexts --reprocess
"""
import logging
import time
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)

# source_type → KnowledgeEntry.entry_type 映射
SOURCE_TO_ENTRY_TYPE = {
    'mail': 'feishu_mail',
    'mail_attachment': 'feishu_file',
    'im': 'feishu_im',
    'calendar': 'feishu_calendar',
    'task': 'feishu_task',
    'approval': 'feishu_approval',
    'doc': 'feishu_doc',
    'wiki': 'feishu_wiki',
    'sheet': 'feishu_sheet',
    'slide': 'feishu_slide',
    'drive_file': 'feishu_file',
    'group_msg': 'feishu_im',
    'contact': 'feishu_doc',
}

# source_type → KnowledgeEntry.namespace 映射
SOURCE_TO_NAMESPACE = {
    'mail': 'project_experience',
    'mail_attachment': 'project_experience',
    'im': 'project_experience',
    'calendar': 'project_experience',
    'task': 'project_experience',
    'approval': 'project_experience',
    'doc': 'cnkis',
    'wiki': 'cnkis',
    'sheet': 'cnkis',
    'slide': 'cnkis',
    'drive_file': 'cnkis',
    'group_msg': 'project_experience',
    'contact': 'cnkis',
}

# 质量评分门槛（低于此值的原始记录直接跳过，不入知识库）
MIN_CONTENT_LENGTH = 30


class Command(BaseCommand):
    help = '将 PersonalContext 原始数据批量过 ingestion_pipeline 入库为 KnowledgeEntry'

    def add_arguments(self, parser):
        parser.add_argument(
            '--source-type', type=str, default='',
            help='指定数据源，逗号分隔。默认全部',
        )
        parser.add_argument(
            '--batch-id', type=str, default='',
            help='仅处理指定批次 ID 的 PersonalContext',
        )
        parser.add_argument(
            '--batch-size', type=int, default=100,
            help='每批处理条数（默认 100）',
        )
        parser.add_argument(
            '--limit', type=int, default=0,
            help='最多处理条数（0=无限制）',
        )
        parser.add_argument(
            '--reprocess', action='store_true',
            help='重新处理已有对应 KnowledgeEntry 的记录（用于更新）',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='预演模式：打印将要处理的记录，不实际写库',
        )
        parser.add_argument(
            '--no-llm', action='store_true',
            help='禁用 LLM 加工（大批量处理时节省费用）',
        )

    def handle(self, *args, **options):
        source_types = [s.strip() for s in options['source_type'].split(',') if s.strip()]
        batch_id = options['batch_id']
        batch_size = options['batch_size']
        limit = options['limit']
        dry_run = options['dry_run']
        reprocess = options['reprocess']
        no_llm = options['no_llm']

        if no_llm:
            import os
            os.environ['KNOWLEDGE_LLM_ENRICH'] = 'false'

        self.stdout.write('=' * 60)
        self.stdout.write('PersonalContext → KnowledgeEntry 批量入库')
        self.stdout.write(f'数据源: {source_types or "全部"}')
        self.stdout.write(f'批次: {batch_id or "全部"}')
        self.stdout.write(f'批量大小: {batch_size}  限制: {limit or "无"}')
        self.stdout.write(f'Dry-run: {dry_run}  禁用LLM: {no_llm}')
        self.stdout.write('=' * 60)

        qs = self._build_queryset(source_types, batch_id, reprocess)

        if dry_run:
            self.stdout.write('\n[DRY-RUN] 前 20 条预览:')
            for pc in qs[:20]:
                self.stdout.write(
                    f'  ID={pc.id:<8} source={pc.source_type:<15} '
                    f'user={pc.user_id[:20]:<22} len={len(pc.raw_content or "")}'
                )
            return

        # 批量处理：使用游标分页（id__gt），避免大 OFFSET 的 O(n²) 问题
        stats = {'processed': 0, 'created': 0, 'updated': 0, 'skipped': 0, 'errors': 0}
        batch_num = 0
        last_id = 0

        self.stdout.write('\n开始批量处理（游标分页）...')
        while True:
            # 游标分页：每次从 last_id 之后取一批，避免重新扫描
            chunk = list(qs.filter(id__gt=last_id).order_by('id')[:batch_size])
            if not chunk:
                break
            batch_num += 1
            self.stdout.write(f'\n批次 #{batch_num}: 处理 {len(chunk)} 条 (id>{last_id})...')

            for pc in chunk:
                if limit and stats['processed'] >= limit:
                    break
                self._process_one(pc, stats)
                stats['processed'] += 1
                last_id = max(last_id, pc.id)

            self.stdout.write(
                f'  本批: 已处理={stats["processed"]} 入库={stats["created"]} '
                f'更新={stats["updated"]} 跳过={stats["skipped"]} 错误={stats["errors"]}'
            )

            if limit and stats['processed'] >= limit:
                self.stdout.write(f'\n已达到限制 {limit} 条，停止')
                break

            time.sleep(0.05)  # 给数据库喘息

        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('入库完成报告')
        self.stdout.write('=' * 60)
        for k, v in stats.items():
            self.stdout.write(f'  {k}: {v}')

    # ================================================================
    # 查询构建
    # ================================================================

    def _build_queryset(self, source_types, batch_id, reprocess):
        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry

        qs = PersonalContext.objects.all()

        if source_types:
            qs = qs.filter(source_type__in=source_types)
        if batch_id:
            qs = qs.filter(batch_id=batch_id)

        if not reprocess:
            # 排除已有对应 KnowledgeEntry 的记录（通过子查询，避免加载全量 source_key 到内存）
            # source_key 格式：feishu_{source_type}_{source_id}
            from django.db.models import Exists, OuterRef, Value
            from django.db.models.functions import Concat
            has_entry = KnowledgeEntry.objects.filter(
                source_key=Concat(
                    Value('feishu_'),
                    OuterRef('source_type'),
                    Value('_'),
                    OuterRef('source_id'),
                ),
                is_deleted=False,
            )
            qs = qs.exclude(Exists(has_entry))

        # 过滤掉内容和摘要都为空的记录（注意：用 AND 条件，只要有一个非空就保留）
        qs = qs.exclude(raw_content='', summary='')

        # DB 层过滤内容过短的记录，避免大量短消息（IM/任务等）被取出后在 Python 里全部跳过
        from django.db.models import Q
        from django.db.models.functions import Length
        qs = qs.annotate(
            _rc_len=Length('raw_content'),
            _sum_len=Length('summary'),
        ).filter(
            Q(_rc_len__gte=MIN_CONTENT_LENGTH) | Q(_sum_len__gte=MIN_CONTENT_LENGTH)
        )

        return qs

    # ================================================================
    # 单条处理
    # ================================================================

    def _process_one(self, pc, stats) -> bool:
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

        content = pc.raw_content or pc.summary
        if not content or len(content.strip()) < MIN_CONTENT_LENGTH:
            stats['skipped'] += 1
            return False

        source_type_mapped = f'feishu_{pc.source_type}'
        source_key = f'feishu_{pc.source_type}_{pc.source_id}' if pc.source_id else ''
        entry_type = SOURCE_TO_ENTRY_TYPE.get(pc.source_type, 'feishu_doc')
        namespace = SOURCE_TO_NAMESPACE.get(pc.source_type, 'project_experience')

        # 从 metadata 中提取有用信息
        meta = pc.metadata or {}
        title = (
            meta.get('subject') or meta.get('summary') or
            meta.get('file_name') or meta.get('title') or
            pc.summary[:100]
        )
        tags = ['feishu_migration', f'feishu_{pc.source_type}']
        if meta.get('chat_name'):
            tags.append(meta['chat_name'][:30])

        raw = RawKnowledgeInput(
            content=content[:50000],
            title=title,
            entry_type=entry_type,
            source_type=source_type_mapped,
            source_key=source_key,
            tags=tags,
            summary=pc.summary[:500] if pc.summary else '',
            namespace=namespace,
            properties={
                'personal_context_id': pc.id,
                'user_id': pc.user_id,
                'batch_id': getattr(pc, 'batch_id', '') or '',
                'original_source_type': pc.source_type,
                'metadata': meta,
                'file_path': getattr(pc, 'file_path', '') or '',
            },
        )

        try:
            result = run_pipeline(raw)
            if result.success:
                if result.status == 'duplicate_skipped':
                    stats['skipped'] += 1
                else:
                    stats['created'] += 1
                return True
            else:
                stats['errors'] += 1
                logger.warning('Pipeline 失败 pc_id=%s: %s', pc.id, result.stage_errors)
                return False
        except Exception as e:
            stats['errors'] += 1
            logger.error('process_one 异常 pc_id=%s: %s', pc.id, e)
            return False
