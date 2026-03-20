"""
check_migration_progress — 飞书迁移进度可视化报告

使用方式：
    python manage.py check_migration_progress
    python manage.py check_migration_progress --source-type mail
    python manage.py check_migration_progress --json  # 输出 JSON 格式
"""
import json
import logging
from django.core.management.base import BaseCommand
from django.conf import settings
from libs.storage_paths import get_disk_usage

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '显示飞书全量迁移进度报告'

    def add_arguments(self, parser):
        parser.add_argument('--source-type', type=str, default='', help='过滤数据源')
        parser.add_argument('--json', action='store_true', help='以 JSON 格式输出')
        parser.add_argument('--failed-only', action='store_true', help='仅显示失败记录')

    def handle(self, *args, **options):
        source_type = options['source_type']
        as_json = options['json']
        failed_only = options['failed_only']

        from apps.secretary.models import FeishuMigrationCheckpoint, FeishuMigrationBatch
        from django.db.models import Count, Sum, Q

        # ---- 总体统计 ----
        qs = FeishuMigrationCheckpoint.objects.all()
        if source_type:
            qs = qs.filter(source_type=source_type)
        if failed_only:
            qs = qs.filter(status='failed')

        total = qs.count()
        by_status = dict(qs.values('status').annotate(c=Count('id')).values_list('status', 'c'))
        by_source = qs.values('source_type').annotate(
            total=Count('id'),
            completed=Count('id', filter=Q(status='completed')),
            pending=Count('id', filter=Q(status='pending')),
            failed=Count('id', filter=Q(status='failed')),
            skipped=Count('id', filter=Q(status='skipped')),
            fetched=Sum('total_fetched'),
            deposited=Sum('total_deposited'),
        ).order_by('source_type')

        # ---- 批次记录 ----
        batches = FeishuMigrationBatch.objects.order_by('-started_at')[:10].values(
            'batch_id', 'batch_type', 'status', 'started_at', 'completed_at',
            'total_users', 'completed_users', 'total_items', 'total_deposited', 'total_errors',
        )

        # ---- PersonalContext 统计 ----
        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry
        pc_stats = PersonalContext.objects.values('source_type').annotate(
            count=Count('id')
        ).order_by('source_type')
        ke_count = KnowledgeEntry.objects.filter(
            source_type__startswith='feishu_', is_deleted=False,
        ).count()

        completed = by_status.get('completed', 0)
        pct = f'{completed * 100 // total}%' if total else '0%'
        storage_stats = []
        seen_paths = set()
        import os as _os
        _base = str(settings.BASE_DIR)
        _sys_probe = _base if _os.path.exists(_base) else '/'
        for label, path in [('system', _sys_probe), ('media', settings.MEDIA_ROOT)]:
            snapshot = get_disk_usage(label, path)
            if snapshot.path in seen_paths:
                continue
            seen_paths.add(snapshot.path)
            storage_stats.append({
                'label': snapshot.label,
                'path': snapshot.path,
                'used_pct': snapshot.used_pct,
                'free_gb': snapshot.free_gb,
            })

        if as_json:
            report = {
                'total_checkpoints': total,
                'by_status': by_status,
                'by_source': list(by_source),
                'completion_rate': pct,
                'personal_context_count': sum(r['count'] for r in pc_stats),
                'knowledge_entry_feishu_count': ke_count,
                'storage': storage_stats,
                'recent_batches': [dict(b) for b in batches],
            }
            self.stdout.write(json.dumps(report, ensure_ascii=False, default=str, indent=2))
            return

        # ---- 文本格式输出 ----
        self.stdout.write('=' * 70)
        self.stdout.write('飞书全量迁移进度报告')
        self.stdout.write('=' * 70)

        self.stdout.write(f'\n【总体进度】')
        self.stdout.write(f'  Checkpoint 总数: {total}')
        self.stdout.write(f'  完成率: {pct} ({completed}/{total})')
        for status, count in sorted(by_status.items()):
            bar = '█' * min(count * 30 // (total or 1), 30)
            self.stdout.write(f'  {status:<12} {count:>6}  {bar}')

        self.stdout.write(f'\n【分数据源统计】')
        self.stdout.write(
            f'  {"数据源":<15} {"总数":>6} {"完成":>6} {"待处理":>6} {"失败":>6} '
            f'{"跳过":>6} {"采集":>8} {"入库":>8}'
        )
        self.stdout.write('  ' + '-' * 68)
        for row in by_source:
            self.stdout.write(
                f'  {row["source_type"]:<15} {row["total"]:>6} '
                f'{row["completed"]:>6} {row["pending"]:>6} '
                f'{row["failed"]:>6} {row["skipped"]:>6} '
                f'{(row["fetched"] or 0):>8} {(row["deposited"] or 0):>8}'
            )

        self.stdout.write(f'\n【存储统计】')
        pc_total = 0
        for row in pc_stats:
            self.stdout.write(f'  PersonalContext [{row["source_type"]}]: {row["count"]} 条')
            pc_total += row['count']
        self.stdout.write(f'  PersonalContext 合计: {pc_total} 条')
        self.stdout.write(f'  KnowledgeEntry (飞书): {ke_count} 条')

        self.stdout.write(f'\n【资源状态】')
        for item in storage_stats:
            self.stdout.write(
                f'  {item["label"]:<8} path={item["path"]} '
                f'used={item["used_pct"]}% free={item["free_gb"]}GB'
            )

        self.stdout.write(f'\n【最近批次记录】')
        if not batches:
            self.stdout.write('  暂无批次记录')
        for b in batches:
            started = str(b['started_at'])[:19] if b['started_at'] else '-'
            # 从 checkpoint 重新汇总真实数字（batch 表的统计字段可能未及时更新）
            from django.db.models import Sum as _Sum
            real = FeishuMigrationCheckpoint.objects.filter(
                config__batch_id=b['batch_id'],
            ).aggregate(
                fetched=_Sum('total_fetched'),
                deposited=_Sum('total_deposited'),
            )
            real_fetched = real['fetched'] or b['total_items'] or 0
            real_deposited = real['deposited'] or b['total_deposited'] or 0
            self.stdout.write(
                f'  [{started}] {b["batch_id"]:<25} {b["status"]:<12} '
                f'用户={b["completed_users"]}/{b["total_users"]} '
                f'API采集={real_fetched} 新入库={real_deposited}'
            )

        # 失败详情
        failed_cps = FeishuMigrationCheckpoint.objects.filter(status='failed').order_by('-updated_at')[:10]
        if failed_cps:
            self.stdout.write(f'\n【失败详情（最近 10 条）】')
            for cp in failed_cps:
                self.stdout.write(
                    f'  {cp.user_name:<15} [{cp.source_type:<12}] '
                    f'{(cp.error_log or "")[:80]}'
                )

        self.stdout.write('\n' + '=' * 70)
