"""
sync_ekuaibao_incremental — 易快报增量同步命令（Phase 5: 双轨运行）

用法：
  # 增量同步所有模块（使用上次检查点时间）
  python manage.py sync_ekuaibao_incremental

  # 指定起始时间增量同步
  python manage.py sync_ekuaibao_incremental --since 2026-03-01

  # 只同步单据模块
  python manage.py sync_ekuaibao_incremental --module flows

  # 生成双轨对账报告（不注入）
  python manage.py sync_ekuaibao_incremental --reconcile-only

  # 查看各模块同步检查点状态
  python manage.py sync_ekuaibao_incremental --status
"""
import logging
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.incremental')


class Command(BaseCommand):
    help = '易快报增量同步（双轨运行期，只更新原始层和暂存层，不自动覆盖业务层）'

    def add_arguments(self, parser):
        parser.add_argument('--since', type=str,
                            help='起始时间 YYYY-MM-DD（覆盖检查点）')
        parser.add_argument('--module', type=str,
                            help='只同步指定模块（如 flows/staffs/budgets）')
        parser.add_argument('--reconcile-only', action='store_true', dest='reconcile_only',
                            help='只生成对账报告，不采集新数据')
        parser.add_argument('--status', action='store_true',
                            help='查看各模块同步检查点状态')
        parser.add_argument('--operator', type=str, default='cron',
                            help='操作人标识')

    def handle(self, *args, **options):
        if options['status']:
            self._show_status()
            return

        if options['reconcile_only']:
            self._reconcile_only()
            return

        self._run_incremental(options)

    def _show_status(self):
        from apps.ekuaibao_integration.models import EkbSyncCheckpoint

        checkpoints = EkbSyncCheckpoint.objects.all().order_by('module')
        if not checkpoints:
            self.stdout.write('暂无同步检查点记录')
            return

        self.stdout.write(self.style.SUCCESS('=== 易快报同步检查点 ==='))
        self.stdout.write(
            f'{"模块":<22} {"上次同步":<22} {"上次批次":<22} '
            f'{"上次记录数":>10} {"连续稳定天":>10}'
        )
        self.stdout.write('-' * 90)
        for cp in checkpoints:
            last_sync = cp.last_sync_at.strftime('%Y-%m-%d %H:%M') if cp.last_sync_at else '未同步'
            self.stdout.write(
                f'{cp.module:<22} {last_sync:<22} {cp.last_batch_no:<22} '
                f'{cp.last_record_count:>10} {cp.consecutive_stable_days:>10}'
            )

    def _reconcile_only(self):
        """只生成当前最新批次的对账报告"""
        from apps.ekuaibao_integration.models import EkbImportBatch
        from apps.ekuaibao_integration.ekb_dedup import EkbDedupReport

        latest_batch = EkbImportBatch.objects.order_by('-create_time').first()
        if not latest_batch:
            self.stdout.write('暂无导入批次记录')
            return

        report = EkbDedupReport(latest_batch)

        # 生成流水单对账
        flows_result = report.dual_track_reconcile(module='flows')
        budgets_result = report.dual_track_reconcile(module='budgets')

        self.stdout.write(f'对账批次: {latest_batch.batch_no}')
        self.stdout.write('\n[报销单对账]')
        s = flows_result['summary']
        self.stdout.write(
            f'  仅易快报: {s["only_in_ekb_count"]}  '
            f'仅新系统: {s["only_in_new_count"]}  '
            f'一致: {s["both_match_count"]}  '
            f'不一致: {s["both_mismatch_count"]}'
        )
        self.stdout.write('\n[预算对账]')
        s = budgets_result['summary']
        self.stdout.write(
            f'  仅易快报: {s["only_in_ekb_count"]}  '
            f'仅新系统: {s["only_in_new_count"]}  '
            f'一致: {s["both_match_count"]}  '
            f'不一致: {s["both_mismatch_count"]}'
        )

        html_path = report.generate_html_report()
        csv_path = report.generate_csv_report()
        self.stdout.write(self.style.SUCCESS(f'\n报告: {html_path}'))
        self.stdout.write(f'CSV: {csv_path}')

    def _run_incremental(self, options):
        from apps.ekuaibao_integration.ekb_client import get_client
        from apps.ekuaibao_integration.ekb_exporter import EkbExporter
        from apps.ekuaibao_integration.models import (
            EkbSyncCheckpoint
        )

        operator = options.get('operator', 'cron')
        since_str = options.get('since')
        target_module = options.get('module')

        # 增量只同步这几个核心模块
        incremental_modules = ['flows', 'staffs', 'budgets'] if not target_module else [target_module]

        all_data = {}
        errors = []

        client = get_client()
        try:
            client.authenticate()
        except Exception as ex:
            raise CommandError(f'易快报认证失败: {ex}')

        for module in incremental_modules:
            # 获取检查点时间
            if since_str:
                since_dt = datetime.strptime(since_str, '%Y-%m-%d')
                since_dt = timezone.make_aware(since_dt)
            else:
                cp, _ = EkbSyncCheckpoint.objects.get_or_create(module=module)
                if cp.last_sync_at:
                    since_dt = cp.last_sync_at - timedelta(minutes=10)  # 重叠10分钟
                else:
                    since_dt = timezone.now() - timedelta(days=7)  # 默认7天

            self.stdout.write(f'增量同步 {module}（since {since_dt.strftime("%Y-%m-%d %H:%M")}）...',
                              ending='')
            try:
                records = []
                if module == 'flows':
                    for page in client.iter_flows_since(since_dt):
                        records.extend(page)
                elif module == 'staffs':
                    for page in client.iter_staffs_since(since_dt):
                        records.extend(page)
                else:
                    # 通用：全量采集（数量小，无增量接口）
                    from apps.ekuaibao_integration.management.commands.export_ekuaibao_full import Command as FullCmd
                    fc = FullCmd()
                    records = fc._collect_module(client, module)

                all_data[module] = records
                self.stdout.write(f' {len(records)} 条')
            except Exception as ex:
                errors.append(f'{module}: {ex}')
                self.stdout.write(self.style.WARNING(f' 失败: {ex}'))
                all_data[module] = []

        if not any(all_data.values()):
            self.stdout.write('无新增数据')
            return

        # 备份 + 入库
        exporter = EkbExporter(phase='incremental')
        exporter.save_to_files(all_data, operator=operator)
        module_stats = {m: len(recs) for m, recs in all_data.items()}
        total = sum(module_stats.values())
        batch = exporter.create_batch(
            modules=incremental_modules,
            module_stats=module_stats,
            total_records=total,
            operator=operator,
        )
        exporter.save_to_database(all_data, batch=batch)

        # 更新检查点
        for module in incremental_modules:
            cp, _ = EkbSyncCheckpoint.objects.get_or_create(module=module)
            cp.last_sync_at = timezone.now()
            cp.last_batch_no = exporter.batch_no
            cp.last_record_count = module_stats.get(module, 0)
            cp.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n增量同步完成，批次号: {exporter.batch_no}，共 {total} 条新增'
        ))
        if errors:
            self.stdout.write(self.style.WARNING(f'失败模块: {errors}'))

        self.stdout.write(
            '增量数据已进入原始层，双轨期间不自动注入业务层。\n'
            '查看对账: python manage.py sync_ekuaibao_incremental --reconcile-only'
        )
