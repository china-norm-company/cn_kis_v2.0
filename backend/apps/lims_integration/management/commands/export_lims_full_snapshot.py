"""
export_lims_full_snapshot — LIMS 全量原始快照导出

职责：
1. 登录 LIMS，按所有 31 个模块全量采集
2. 同时落两份原始备份：JSON 文件 + PostgreSQL RawLimsRecord
3. 生成 manifest.json 记录批次元信息（时间/记录数/校验和）
4. 不执行任何注入，只做备份

这是 P0 注入之前必须先执行的一步。
每次对 LIMS 做重大操作前也建议运行此命令留存快照。

用法：
  # 全量采集所有模块（首次全量备份）
  python manage.py export_lims_full_snapshot

  # 只采集指定模块（增量更新）
  python manage.py export_lims_full_snapshot --modules equipment,personnel,client

  # 只采集 Tier1（P0 主数据）
  python manage.py export_lims_full_snapshot --tier tier1

  # 采集完成后直接标记为可注入
  python manage.py export_lims_full_snapshot --mark-injectable
"""
import logging

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

logger = logging.getLogger('cn_kis.lims.snapshot')

ALL_MODULES = [
    # P0 主数据底座
    'client', 'commission', 'commission_detection',
    'personnel', 'equipment', 'sample', 'sample_storage',
    # P1 合规约束
    'standard', 'method', 'detection_project',
    'calibration_record', 'period_check_record',
    'equipment_history', 'equipment_usage',
    'reference_material', 'consumable',
    'training_record', 'competency_record', 'personnel_auth_ledger',
    # P2 过程追溯
    'equipment_maintenance_record', 'equipment_repair_record',
    'sample_transfer', 'group_info', 'group_personnel',
    # P3 质量与经营闭环
    'quality_doc', 'supplier', 'supervision_record',
    'report_info', 'invoice',
]

TIER_MODULES = {
    'tier1': ['client', 'commission', 'commission_detection',
              'personnel', 'equipment', 'sample', 'sample_storage'],
    'tier2': ['standard', 'method', 'detection_project',
              'calibration_record', 'period_check_record',
              'equipment_history', 'equipment_usage',
              'reference_material', 'consumable',
              'training_record', 'competency_record', 'personnel_auth_ledger'],
    'tier3': ['equipment_maintenance_record', 'equipment_repair_record',
              'sample_transfer', 'group_info', 'group_personnel',
              'quality_doc', 'supplier', 'supervision_record',
              'report_info', 'invoice'],
}


class Command(BaseCommand):
    help = 'LIMS 全量原始快照导出（只备份，不注入）'

    def add_arguments(self, parser):
        scope_group = parser.add_mutually_exclusive_group()
        scope_group.add_argument(
            '--modules', type=str,
            help='指定模块（逗号分隔），如 equipment,personnel',
        )
        scope_group.add_argument(
            '--tier', type=str, choices=['tier1', 'tier2', 'tier3'],
            help='按优先级采集',
        )
        scope_group.add_argument(
            '--all', action='store_true', dest='all_modules',
            help='采集所有模块（全量快照）',
        )
        parser.add_argument(
            '--operator', type=str, default='system',
            help='操作人标识',
        )
        parser.add_argument(
            '--mark-injectable', action='store_true', dest='mark_injectable',
            help='采集完成后将批次标记为可注入',
        )
        parser.add_argument(
            '--notes', type=str, default='',
            help='批次备注（说明本次采集的目的）',
        )

    def handle(self, *args, **options):
        from apps.lims_integration.lims_fetcher import LimsFetcher
        from apps.lims_integration.lims_exporter import LimsExporter
        from apps.lims_integration.models import BatchStatus

        # 确定采集模块
        if options.get('modules'):
            modules = [m.strip() for m in options['modules'].split(',') if m.strip()]
        elif options.get('tier'):
            modules = TIER_MODULES[options['tier']]
        elif options.get('all_modules'):
            modules = ALL_MODULES
        else:
            # 默认全量
            modules = ALL_MODULES
            self.stdout.write(self.style.WARNING('未指定范围，执行全量快照'))

        operator = options.get('operator', 'system')
        notes = options.get('notes', '') or f'全量快照 {timezone.now().strftime("%Y-%m-%d")}'

        self.stdout.write(f'采集模块 ({len(modules)} 个): {", ".join(modules[:5])}...')

        # Step 1: 测试 LIMS 连接
        self.stdout.write('\n[Step 1] 测试 LIMS 连接...')
        fetcher = LimsFetcher()
        conn_result = fetcher.test_connection()
        if not conn_result['connected']:
            raise CommandError('LIMS 连接失败，请检查账号密码和网络')
        self.stdout.write(self.style.SUCCESS(f'  ✓ 连接成功 ({conn_result["base_url"]})'))

        # Step 2: 全量采集（只读）
        self.stdout.write('\n[Step 2] 从 LIMS 采集数据...')
        all_data = fetcher.fetch_all(modules=modules)
        total = sum(len(recs) for recs, _ in all_data.values())
        self.stdout.write(self.style.SUCCESS(f'  ✓ 采集完成: {total} 条记录'))

        for module, (recs, meta) in all_data.items():
            errors = meta.get('errors', [])
            status_icon = '⚠' if errors else '✓'
            self.stdout.write(f'  {status_icon} {module}: {len(recs)} 条'
                              + (f' [警告: {errors[0][:60]}]' if errors else ''))

        # Step 3: JSON 文件备份
        self.stdout.write('\n[Step 3] 写入 JSON 文件备份...')
        exporter = LimsExporter()
        manifest = exporter.save_to_files(all_data, operator=operator)
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ 备份目录: {manifest["backup_dir"]}'
        ))

        # Step 4: PostgreSQL 入库
        self.stdout.write('\n[Step 4] 写入 PostgreSQL raw_lims 表...')
        module_stats = {m: len(recs) for m, (recs, _) in all_data.items()}
        batch = exporter.create_batch(
            modules=modules,
            module_stats=module_stats,
            total_records=total,
            operator=operator,
            notes=notes,
        )
        insert_stats = exporter.save_to_database(all_data, batch=batch)
        new_count = sum(insert_stats.values())
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ 入库完成: {new_count} 条新增'
        ))

        # 可选：标记为可注入
        if options.get('mark_injectable'):
            batch.status = BatchStatus.COLLECTED
            batch.notes = notes + ' [已标记可注入]'
            batch.save(update_fields=['status', 'notes'])
            self.stdout.write(self.style.SUCCESS(
                f'  ✓ 批次 {exporter.batch_no} 已标记为可注入'
            ))

        # 最终汇总
        self.stdout.write(self.style.SUCCESS(f'''
=== 快照导出完成 ===
批次号: {exporter.batch_no}
总记录数: {total}
备份路径: {manifest["backup_dir"]}

后续注入命令:
  python manage.py fetch_lims_data --inject-from-batch {exporter.batch_no} --dry-run
  python manage.py fetch_lims_data --inject-from-batch {exporter.batch_no}
        '''))
