"""
V1→V2 知识资产迁移命令

功能：
  1. check_v1_assets  — 只读盘点 V1 生产库资产（不写入任何数据）
  2. migrate_v1_knowledge — 将 V1 KnowledgeEntry 迁移到 V2（去重+状态标记）
  3. migrate_v1_personal_context — 迁移 V1 PersonalContext（飞书邮件/IM等）

V1 数据库连接：通过环境变量 V1_DB_HOST/V1_DB_NAME/V1_DB_USER/V1_DB_PASSWORD 配置
（若与 V2 在同一服务器，V1_DB_HOST=127.0.0.1，V1_DB_NAME=cn_kis_audit）

使用方式：
  # 1. 先盘点（只读，安全）
  python manage.py migrate_v1_knowledge --action=check

  # 2. 试运行（显示会迁移什么，但不写入）
  python manage.py migrate_v1_knowledge --action=migrate --dry-run

  # 3. 实际迁移（需要 KNOWLEDGE_WRITE_ENABLED=true）
  KNOWLEDGE_WRITE_ENABLED=true python manage.py migrate_v1_knowledge --action=migrate

  # 4. 按类型筛选
  python manage.py migrate_v1_knowledge --action=migrate --types regulation,sop --dry-run

  # 5. 迁移 PersonalContext
  python manage.py migrate_v1_knowledge --action=migrate-personal --dry-run
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime
from typing import Any

from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger('cn_kis.migration.v1_knowledge')


def _get_v1_connection():
    """创建到 V1 生产库的只读连接。"""
    try:
        import psycopg2
    except ImportError:
        raise CommandError('psycopg2 未安装。请先运行: pip install psycopg2-binary')

    host = os.getenv('V1_DB_HOST', '127.0.0.1')
    port = os.getenv('V1_DB_PORT', '5432')
    dbname = os.getenv('V1_DB_NAME', 'cn_kis_audit')
    user = os.getenv('V1_DB_USER', 'cn_kis')
    password = os.getenv('V1_DB_PASSWORD', '')

    try:
        conn = psycopg2.connect(
            host=host, port=port, dbname=dbname,
            user=user, password=password,
            connect_timeout=10,
            options='-c default_transaction_read_only=on',  # 强制只读
        )
        return conn
    except Exception as exc:
        raise CommandError(
            f'无法连接 V1 数据库 {user}@{host}:{port}/{dbname}：{exc}\n'
            '请设置环境变量：V1_DB_HOST, V1_DB_NAME, V1_DB_USER, V1_DB_PASSWORD'
        )


class Command(BaseCommand):
    help = 'V1→V2 知识资产迁移：盘点、试运行、实际迁移'

    def add_arguments(self, parser):
        parser.add_argument(
            '--action',
            choices=['check', 'migrate', 'migrate-personal'],
            default='check',
            help='执行动作：check=只读盘点（默认）；migrate=迁移知识条目；migrate-personal=迁移PersonalContext',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='试运行：只显示统计数据，不实际写入',
        )
        parser.add_argument(
            '--types',
            default='',
            help='按 entry_type 过滤，多个用逗号分隔，如 regulation,sop。默认迁移全部类型',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            help='批量迁移大小（默认 100）',
        )
        parser.add_argument(
            '--from-date',
            default='',
            help='按更新时间过滤，如 2025-01-01（仅迁移此日期之后更新的条目）',
        )
        parser.add_argument(
            '--status-on-import',
            default='pending_review',
            choices=['pending_review', 'draft', 'published'],
            help='迁移后的条目状态（默认 pending_review，需人工审核后才发布）',
        )

    def handle(self, *args, **options):
        action = options['action']

        if action == 'check':
            self._check_v1_assets()
        elif action == 'migrate':
            self._migrate_knowledge_entries(options)
        elif action == 'migrate-personal':
            self._migrate_personal_context(options)

    # ──────────────────────────────────────────────────────────────────────────
    # Action 1: check — 只读盘点
    # ──────────────────────────────────────────────────────────────────────────

    def _check_v1_assets(self):
        self.stdout.write(self.style.HTTP_INFO('=== V1 生产库资产盘点（只读）==='))
        conn = _get_v1_connection()
        cur = conn.cursor()

        sections = [
            ('KnowledgeEntry（按 entry_type）',
             "SELECT entry_type, COUNT(*) FROM t_knowledge_entry WHERE is_deleted=false GROUP BY entry_type ORDER BY 2 DESC"),
            ('KnowledgeEntry（按向量化状态）',
             "SELECT CASE WHEN embedding_vector IS NOT NULL THEN '已向量化' ELSE '未向量化' END as state, COUNT(*) FROM t_knowledge_entry WHERE is_deleted=false GROUP BY 1"),
            ('KnowledgeEntry（按 namespace）',
             "SELECT namespace, COUNT(*) FROM t_knowledge_entry WHERE is_deleted=false GROUP BY namespace ORDER BY 2 DESC"),
            ('KnowledgeEntity（按 namespace）',
             "SELECT namespace, COUNT(*) FROM t_knowledge_entity WHERE is_deleted=false GROUP BY namespace ORDER BY 2 DESC"),
            ('KnowledgeRelation（按 relation_type）',
             "SELECT relation_type, COUNT(*) FROM t_knowledge_relation WHERE is_deleted=false GROUP BY relation_type ORDER BY 2 DESC LIMIT 10"),
            ('PersonalContext（按 source_type）',
             "SELECT source_type, COUNT(*) FROM t_personal_context GROUP BY source_type ORDER BY 2 DESC"),
        ]

        # EKB & LIMS
        raw_tables = [
            ('EkbRawRecord', 'SELECT COUNT(*) FROM t_ekb_raw_record'),
            ('RawLimsRecord', 'SELECT COUNT(*) FROM t_raw_lims_record'),
        ]

        for label, sql in raw_tables:
            try:
                cur.execute(sql)
                count = cur.fetchone()[0]
                self.stdout.write(f'  {label}: {count:,} 条（不可变原始层）')
            except Exception as exc:
                conn.rollback()  # 重置事务避免后续查询失败
                cur = conn.cursor()
                self.stdout.write(self.style.WARNING(f'  {label}: 在此库中不存在（{type(exc).__name__}）'))

        self.stdout.write('')

        for section_label, sql in sections:
            self.stdout.write(self.style.SUCCESS(f'\n{section_label}：'))
            try:
                cur.execute(sql)
                rows = cur.fetchall()
                if not rows:
                    self.stdout.write('  （暂无数据）')
                for row in rows:
                    self.stdout.write(f'  {row[0]}: {row[1]:,}')
            except Exception as exc:
                conn.rollback()
                cur = conn.cursor()
                self.stdout.write(self.style.WARNING(f'  查询失败: {exc}'))

        # 内容哈希唯一性检查
        try:
            cur.execute(
                "SELECT COUNT(DISTINCT content_hash), COUNT(*) FROM t_knowledge_entry WHERE is_deleted=false AND content_hash != ''"
            )
            unique, total = cur.fetchone()
            dup_rate = (1 - unique / total) * 100 if total > 0 else 0
            self.stdout.write(f'\n内容哈希：{unique:,} 唯一 / {total:,} 总计（重复率 {dup_rate:.1f}%）')
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'\n内容哈希检查失败: {exc}'))

        cur.close()
        conn.close()
        self.stdout.write(self.style.SUCCESS('\n盘点完成。'))

    # ──────────────────────────────────────────────────────────────────────────
    # Action 2: migrate — 迁移知识条目
    # ──────────────────────────────────────────────────────────────────────────

    def _migrate_knowledge_entries(self, options):
        dry_run = options['dry_run']
        batch_size = options['batch_size']
        status_on_import = options['status_on_import']
        entry_types = [t.strip() for t in options['types'].split(',') if t.strip()]
        from_date = options['from_date']

        if not dry_run:
            from apps.knowledge.guards import KnowledgeAssetGuard
            KnowledgeAssetGuard.assert_write_allowed('knowledge_entry')

        mode_label = '[DRY-RUN] ' if dry_run else ''
        self.stdout.write(self.style.HTTP_INFO(f'{mode_label}=== V1→V2 知识条目迁移 ==='))

        conn = _get_v1_connection()
        cur = conn.cursor()

        # 构建查询条件（V1 所有记录 is_published=false，迁移时只过滤已删除的）
        where_clauses = ["is_deleted = false"]
        params: list[Any] = []
        if entry_types:
            placeholders = ','.join(['%s'] * len(entry_types))
            where_clauses.append(f'entry_type IN ({placeholders})')
            params.extend(entry_types)
        if from_date:
            where_clauses.append('update_time >= %s')
            params.append(from_date)

        where_sql = ' AND '.join(where_clauses)

        cur.execute(f'SELECT COUNT(*) FROM t_knowledge_entry WHERE {where_sql}', params)
        total_v1 = cur.fetchone()[0]
        self.stdout.write(f'V1 符合条件的条目：{total_v1:,} 条')

        if total_v1 == 0:
            self.stdout.write('无需迁移。')
            cur.close()
            conn.close()
            return

        # 查询现有 V2 source_key 集合（用于去重，V2 KnowledgeEntry 无 content_hash 字段）
        from apps.knowledge.models import KnowledgeEntry
        existing_keys: set[str] = set(
            KnowledgeEntry.objects.filter(
                source_type='v1_migration', is_deleted=False
            ).values_list('source_key', flat=True)
        )
        self.stdout.write(f'V2 中已有 V1 迁移条目：{len(existing_keys):,} 条（将跳过）')

        # 分批迁移
        offset = 0
        stats = {'created': 0, 'skipped_dup': 0, 'skipped_no_hash': 0, 'errors': 0}

        from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput

        while offset < total_v1:
            cur.execute(
                f"""SELECT
                    id, title, content, entry_type, source_type, source_id, source_key,
                    namespace, tags, quality_score,
                    update_time, create_time
                FROM t_knowledge_entry
                WHERE {where_sql}
                ORDER BY id
                LIMIT %s OFFSET %s""",
                params + [batch_size, offset],
            )
            rows = cur.fetchall()
            if not rows:
                break

            for row in rows:
                (v1_id, title, content, entry_type, source_type, source_id, source_key,
                 namespace, tags, quality_score,
                 update_time, create_time) = row

                # V1 没有 content_hash 字段，根据内容重新计算（用于日志）
                raw = f'{title or ""}{content or ""}'
                content_hash = hashlib.sha256(raw.encode()).hexdigest()

                v2_source_key = f'v1_migration:{v1_id}'
                if v2_source_key in existing_keys:
                    stats['skipped_dup'] += 1
                    continue

                if dry_run:
                    stats['created'] += 1
                    existing_keys.add(v2_source_key)
                    continue

                try:
                    result = run_pipeline(
                        RawKnowledgeInput(
                            title=title or '（无标题）',
                            content=content or '',
                            entry_type=entry_type or 'method_reference',
                            source_type='v1_migration',
                            source_id=None,
                            source_key=v2_source_key,
                            namespace=namespace or 'cnkis',
                            tags=list(tags or []),
                            properties={
                                'v1_id': v1_id,
                                'v1_source_type': source_type,
                                'v1_source_key': source_key,
                                'v1_quality_score': float(quality_score or 0),
                                'migrated_at': datetime.now().isoformat(),
                            },
                        )
                    )
                    if result.entry_id:
                        stats['created'] += 1
                        existing_keys.add(v2_source_key)
                    else:
                        stats['errors'] += 1
                except Exception as exc:
                    logger.error('迁移条目 v1_id=%s 失败: %s', v1_id, exc)
                    stats['errors'] += 1

            offset += batch_size
            self.stdout.write(
                f'  进度：{min(offset, total_v1):,}/{total_v1:,} '
                f'（新建={stats["created"]} 跳过重复={stats["skipped_dup"]} 错误={stats["errors"]}）'
            )

        cur.close()
        conn.close()

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'{mode_label}迁移完成：\n'
            f'  新建：{stats["created"]:,}\n'
            f'  跳过（重复）：{stats["skipped_dup"]:,}\n'
            f'  跳过（无哈希）：{stats["skipped_no_hash"]:,}\n'
            f'  错误：{stats["errors"]:,}'
        ))
        if not dry_run and stats['created'] > 0:
            self.stdout.write(self.style.WARNING(
                f'\n下一步：运行向量化\n'
                f'  python manage.py vectorize_bulk --source-type=v1_migration --limit={stats["created"]}'
            ))

    # ──────────────────────────────────────────────────────────────────────────
    # Action 3: migrate-personal — 迁移 PersonalContext
    # ──────────────────────────────────────────────────────────────────────────

    def _migrate_personal_context(self, options):
        dry_run = options['dry_run']
        batch_size = options['batch_size']

        if not dry_run:
            from apps.knowledge.guards import KnowledgeAssetGuard
            KnowledgeAssetGuard.assert_write_allowed('personal_context')

        mode_label = '[DRY-RUN] ' if dry_run else ''
        self.stdout.write(self.style.HTTP_INFO(f'{mode_label}=== V1→V2 PersonalContext 迁移 ==='))

        conn = _get_v1_connection()
        cur = conn.cursor()

        cur.execute('SELECT source_type, COUNT(*) FROM t_personal_context GROUP BY source_type ORDER BY 2 DESC')
        v1_counts = dict(cur.fetchall())
        total_v1 = sum(v1_counts.values())
        self.stdout.write(f'V1 PersonalContext 总量：{total_v1:,} 条')
        for stype, cnt in v1_counts.items():
            self.stdout.write(f'  {stype}: {cnt:,}')

        if total_v1 == 0 or dry_run:
            if dry_run:
                self.stdout.write(f'{mode_label}试运行完成，共 {total_v1:,} 条待迁移。')
            cur.close()
            conn.close()
            return

        # 检查 V2 已有数量
        from apps.secretary.models import PersonalContext
        v2_existing = PersonalContext.objects.exclude(
            content_hash=''
        ).values_list('content_hash', flat=True)
        existing_hashes: set[str] = set(v2_existing)
        self.stdout.write(f'V2 已有 PersonalContext：{len(existing_hashes):,} 条（将跳过重复）')

        cur.execute(
            """SELECT
                id, user_id, source_type, source_id, raw_content, summary,
                metadata, created_at
            FROM t_personal_context
            ORDER BY id"""
        )

        stats = {'created': 0, 'skipped': 0, 'errors': 0}

        from apps.secretary.models import PersonalContext
        batch = []

        for row in cur:
            (v1_id, user_id, source_type, source_id, raw_content,
             summary, metadata, created_at) = row

            # V1 没有 content_hash 字段，根据内容计算
            raw = f'{source_type}{source_id}{raw_content or ""}'
            content_hash = hashlib.sha256(raw.encode()).hexdigest()

            if content_hash in existing_hashes:
                stats['skipped'] += 1
                continue

            batch.append(PersonalContext(
                user_id=user_id or '',
                source_type=source_type,
                source_id=source_id or '',
                raw_content=raw_content or '',
                summary=summary or '',
                metadata=metadata or {},
                content_hash=content_hash,
                batch_id='v1_migration',
                file_path='',
                created_at=created_at,
            ))
            existing_hashes.add(content_hash)

            if len(batch) >= batch_size:
                try:
                    PersonalContext.objects.bulk_create(batch, ignore_conflicts=True)
                    stats['created'] += len(batch)
                except Exception as exc:
                    logger.error('PersonalContext 批量写入失败: %s', exc)
                    stats['errors'] += len(batch)
                batch = []

        if batch:
            try:
                PersonalContext.objects.bulk_create(batch, ignore_conflicts=True)
                stats['created'] += len(batch)
            except Exception as exc:
                logger.error('PersonalContext 最终批次写入失败: %s', exc)
                stats['errors'] += len(batch)

        cur.close()
        conn.close()

        self.stdout.write(self.style.SUCCESS(
            f'{mode_label}PersonalContext 迁移完成：\n'
            f'  新建：{stats["created"]:,}\n'
            f'  跳过（重复）：{stats["skipped"]:,}\n'
            f'  错误：{stats["errors"]:,}'
        ))
