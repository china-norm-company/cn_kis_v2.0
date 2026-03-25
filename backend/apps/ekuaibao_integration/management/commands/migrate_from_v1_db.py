"""
migrate_from_v1_db — 将 V1 cn_kis 数据库的易快报数据迁移到 V2 cn_kis_v2

迁移内容：
  - t_ekb_import_batch（18 个批次记录）
  - t_ekb_raw_record（106,011 条原始数据）

安全原则：
  - 只增不改：V2 中已存在的 ekb_id + module + batch_no 组合不会被覆盖
  - 全量迁移：包括 pending/injected/skipped 所有状态记录
  - 重置注入状态：迁移到 V2 后 injection_status 统一重置为 'pending'，
    等待用 V2 注入器（支持飞书格式）重新注入

用法：
  python manage.py migrate_from_v1_db [--dry-run] [--batch-size 1000]
"""
import logging

import psycopg2
import psycopg2.extras
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.migrate_v1')

# V1 数据库连接参数
V1_DB = {
    'host':     'localhost',
    'port':     5432,
    'dbname':   'cn_kis',
    'user':     'cn_kis',
    'password': 'cn_kis_2026',
}

# 只迁移这些有效批次（collecting 状态的月度批次不迁移 — 数据不完整）
SKIP_PHASES = {'feishu_flows_monthly'}


class Command(BaseCommand):
    help = '将 V1 cn_kis 数据库的易快报批次和原始记录迁移到 V2'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='只统计，不写入')
        parser.add_argument('--batch-size', type=int, default=500,
                            help='每批插入条数（默认 500）')
        parser.add_argument('--skip-phases', nargs='*',
                            default=list(SKIP_PHASES),
                            help='跳过的批次 phase（默认跳过 feishu_flows_monthly）')
        parser.add_argument('--modules', nargs='*',
                            default=None,
                            help='只迁移指定模块（默认全部）')

    def handle(self, *args, **options):
        from apps.ekuaibao_integration.models import EkbImportBatch, EkbRawRecord

        dry_run = options['dry_run']
        batch_size = options['batch_size']
        skip_phases = set(options['skip_phases'] or [])
        only_modules = set(options['modules']) if options['modules'] else None

        self.stdout.write(f'{"[DRY-RUN] " if dry_run else ""}连接 V1 数据库...')
        try:
            conn = psycopg2.connect(**V1_DB)
        except Exception as e:
            self.stderr.write(f'❌ 无法连接 V1 数据库: {e}')
            return

        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── 1. 迁移批次记录 ────────────────────────────────────────────────────
        self.stdout.write('\n=== Step 1: 迁移 EkbImportBatch ===')
        cur.execute("""
            SELECT id, batch_no, phase, status, modules, module_stats,
                   backup_path, total_records, injected_records, conflict_count,
                   skipped_count, operator, notes
            FROM t_ekb_import_batch ORDER BY id
        """)
        v1_batches = cur.fetchall()
        self.stdout.write(f'V1 批次总数: {len(v1_batches)}')

        batch_id_map = {}   # v1_id → v2_batch_no（用于后续 raw_record 关联）
        migrated_batches = 0

        for v1b in v1_batches:
            phase = v1b['phase']
            batch_no = v1b['batch_no']

            if phase in skip_phases:
                self.stdout.write(f'  [跳过] {batch_no} (phase={phase})')
                batch_id_map[v1b['id']] = None
                continue

            # 检查是否已存在
            existing = EkbImportBatch.objects.filter(batch_no=batch_no).first()
            if existing:
                self.stdout.write(f'  [已存在] {batch_no}')
                batch_id_map[v1b['id']] = existing
                continue

            if dry_run:
                self.stdout.write(f'  [DRY] 将创建批次: {batch_no} ({phase})')
                batch_id_map[v1b['id']] = None
                migrated_batches += 1
                continue

            # 状态映射（V1 injected → V2 collected，等待重新注入）
            status_map = {
                'injected':  'collected',
                'collecting': 'collected',  # 已截断的月度批次标为 collected（不完整）
            }
            v2_status = status_map.get(v1b['status'], v1b['status'])

            try:
                v2_batch = EkbImportBatch.objects.create(
                    batch_no=batch_no,
                    phase=phase,
                    status=v2_status,
                    modules=v1b['modules'] or [],
                    module_stats=v1b['module_stats'] or {},
                    backup_path=v1b['backup_path'] or '',
                    total_records=v1b['total_records'] or 0,
                    injected_records=0,    # V2 重新注入，从 0 开始
                    conflict_count=0,
                    skipped_count=0,
                    operator=v1b['operator'] or 'v1_migration',
                    notes=f"[V1迁移] {v1b['notes'] or ''}".strip(),
                )
                batch_id_map[v1b['id']] = v2_batch
                migrated_batches += 1
                self.stdout.write(f'  ✅ 迁移批次: {batch_no}')
            except Exception as e:
                self.stderr.write(f'  ❌ 批次 {batch_no} 失败: {e}')
                batch_id_map[v1b['id']] = None

        self.stdout.write(self.style.SUCCESS(
            f'批次迁移: {migrated_batches} 个（其中 {len([x for x in batch_id_map.values() if x is None])} 个跳过）'
        ))

        # ── 2. 迁移原始记录 ────────────────────────────────────────────────────
        self.stdout.write('\n=== Step 2: 迁移 EkbRawRecord ===')

        # 获取需要迁移的 V1 batch_id 列表
        valid_v1_batch_ids = [
            v1_id for v1_id, v2_batch in batch_id_map.items()
            if v2_batch is not None
        ]

        if not valid_v1_batch_ids:
            self.stdout.write('无需迁移的批次，跳过记录迁移。')
            conn.close()
            return

        placeholders = ','.join(['%s'] * len(valid_v1_batch_ids))

        # 统计总量
        module_filter = ''
        module_params = []
        if only_modules:
            mods = list(only_modules)
            mod_ph = ','.join(['%s'] * len(mods))
            module_filter = f' AND module IN ({mod_ph})'
            module_params = mods

        cur.execute(
            f'SELECT COUNT(*) as cnt FROM t_ekb_raw_record '
            f'WHERE batch_id IN ({placeholders}){module_filter}',
            valid_v1_batch_ids + module_params
        )
        total_records = cur.fetchone()['cnt']
        self.stdout.write(f'待迁移 raw_record: {total_records:,} 条')

        if dry_run:
            self.stdout.write('[DRY-RUN] 跳过实际写入')
            conn.close()
            return

        # 分页读取 + 批量写入
        offset = 0
        saved = skipped = failed = 0

        # 预先建立 ekb_id+module+batch_no 的 V2 已存在集合（用于快速去重）
        existing_keys: set[tuple] = set(
            EkbRawRecord.objects.filter(
                batch__batch_no__in=[v2b.batch_no for v2b in batch_id_map.values() if v2b]
            ).values_list('batch__batch_no', 'module', 'ekb_id')
        )
        self.stdout.write(f'V2 已存在记录: {len(existing_keys):,} 条（跳过）')

        while True:
            cur.execute(
                f"""
                SELECT r.ekb_id, r.module, r.raw_data, r.scraped_at,
                       r.checksum, r.source_updated_at, r.injection_status,
                       b.batch_no
                FROM t_ekb_raw_record r
                JOIN t_ekb_import_batch b ON r.batch_id = b.id
                WHERE r.batch_id IN ({placeholders}){module_filter}
                ORDER BY r.id
                LIMIT %s OFFSET %s
                """,
                valid_v1_batch_ids + module_params + [batch_size, offset]
            )
            rows = cur.fetchall()
            if not rows:
                break

            to_create = []
            for row in rows:
                batch_no = row['batch_no']
                key = (batch_no, row['module'], row['ekb_id'])
                if key in existing_keys:
                    skipped += 1
                    continue

                # 找对应的 V2 batch 对象
                v2_batch = next(
                    (v for v in batch_id_map.values()
                     if v is not None and v.batch_no == batch_no),
                    None
                )
                if v2_batch is None:
                    skipped += 1
                    continue

                try:
                    to_create.append(EkbRawRecord(
                        batch=v2_batch,
                        module=row['module'],
                        ekb_id=row['ekb_id'] or '',
                        raw_data=row['raw_data'],
                        scraped_at=row['scraped_at'] or timezone.now(),
                        checksum=row['checksum'] or '',
                        source_updated_at=row['source_updated_at'],
                        injection_status='pending',  # 重置，用 V2 注入器重新注入
                    ))
                    existing_keys.add(key)
                except Exception as e:
                    logger.warning('构造 RawRecord 失败: %s', e)
                    failed += 1

            if to_create:
                try:
                    EkbRawRecord.objects.bulk_create(to_create, ignore_conflicts=True)
                    saved += len(to_create)
                except Exception as e:
                    self.stderr.write(f'  ❌ 批量写入失败 (offset={offset}): {e}')
                    failed += len(to_create)

            offset += batch_size
            self.stdout.write(
                f'  进度: {offset:,}/{total_records:,} '
                f'新增:{saved:,} 跳过:{skipped:,} 失败:{failed:,}',
                ending='\r'
            )
            self.stdout.flush()

        conn.close()

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'\n✅ 记录迁移完成: 新增={saved:,} 跳过={skipped:,} 失败={failed:,}'
        ))
        self.stdout.write(f'提示: 迁移后运行以下命令触发注入:')
        self.stdout.write(f'  python manage.py export_ekuaibao_full --inject-only')
