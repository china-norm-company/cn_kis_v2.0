"""
fetch_lims_data — LIMS 数据全量采集与注入主命令

四层安全架构：
  Layer 1 采集   → 只读爬取 LIMS 数据
  Layer 2 备份   → JSON 文件 + PostgreSQL raw_lims 表（不可变）
  Layer 3 暂存   → 冲突检测，待审核记录不自动注入
  Layer 4 注入   → 人工确认后原子注入，保存前值快照

常用用法：

  # 全量采集并备份（不注入，最安全的第一步）
  python manage.py fetch_lims_data --dry-run

  # 采集 Tier 1 数据（设备/人员/委托/客户/样品）并注入
  python manage.py fetch_lims_data --tier tier1

  # 采集特定模块
  python manage.py fetch_lims_data --module equipment

  # 从已有备份批次重新注入（跳过网络采集）
  python manage.py fetch_lims_data --inject-from-batch 20260318_143000

  # 只生成对比报告（不做任何写操作）
  python manage.py fetch_lims_data --diff-only --batch 20260318_143000

  # 处理待审核冲突（交互式）
  python manage.py fetch_lims_data --resolve-conflicts --batch 20260318_143000

  # 列出所有备份批次
  python manage.py fetch_lims_data --list-batches

  # 测试 LIMS 连接
  python manage.py fetch_lims_data --test-connection
"""
import logging

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

logger = logging.getLogger('cn_kis.lims.fetch_cmd')

ALL_MODULES = [
    'equipment', 'personnel', 'commission', 'commission_detection',
    'client', 'sample', 'sample_storage', 'standard', 'method',
    'detection_project', 'calibration_record', 'period_check_record',
    'equipment_history', 'equipment_usage', 'equipment_maintenance_record',
    'equipment_repair_record', 'reference_material', 'consumable',
    'training_record', 'competency_record', 'personnel_auth_ledger',
    'quality_doc', 'supplier', 'supervision_record',
    'sample_transfer', 'report_info', 'invoice',
    'group_info', 'group_personnel',
]

TIER_MODULES = {
    'tier1': ['equipment', 'personnel', 'commission', 'commission_detection',
              'client', 'sample', 'sample_storage'],
    'tier2': ['standard', 'method', 'detection_project', 'calibration_record',
              'period_check_record', 'equipment_history', 'equipment_usage',
              'reference_material', 'training_record', 'competency_record',
              'personnel_auth_ledger'],
    'tier3': ['quality_doc', 'supplier', 'supervision_record',
              'equipment_maintenance_record', 'equipment_repair_record',
              'sample_transfer', 'report_info', 'invoice',
              'group_info', 'group_personnel'],
}


class Command(BaseCommand):
    help = 'LIMS 数据全量采集、备份、注入（四层安全架构）'

    def add_arguments(self, parser):
        # 操作模式（互斥）
        mode_group = parser.add_mutually_exclusive_group()
        mode_group.add_argument(
            '--inject-from-batch', type=str, dest='inject_batch',
            metavar='BATCH_NO',
            help='从已有备份批次注入（跳过网络采集，适用于重试）',
        )
        mode_group.add_argument(
            '--diff-only', action='store_true', dest='diff_only',
            help='只生成对比报告，不做任何写操作',
        )
        mode_group.add_argument(
            '--resolve-conflicts', action='store_true', dest='resolve_conflicts',
            help='处理待审核的冲突记录（交互式）',
        )
        mode_group.add_argument(
            '--list-batches', action='store_true', dest='list_batches',
            help='列出所有本地备份批次',
        )
        mode_group.add_argument(
            '--test-connection', action='store_true', dest='test_conn',
            help='测试 LIMS 连接',
        )

        # 采集范围
        scope_group = parser.add_mutually_exclusive_group()
        scope_group.add_argument(
            '--module', type=str,
            help=f'采集单个模块，可选: {", ".join(ALL_MODULES)}',
        )
        scope_group.add_argument(
            '--tier', type=str, choices=['tier1', 'tier2', 'tier3'],
            help='按优先级采集：tier1=设备/人员/委托/客户/样品，tier2=标准/校准/培训，tier3=文件/供应商/报告',
        )
        scope_group.add_argument(
            '--all', action='store_true', dest='all_modules',
            help='采集所有模块（全量）',
        )

        # 行为控制
        parser.add_argument(
            '--dry-run', action='store_true', dest='dry_run',
            help='只采集和备份，不注入业务库（最安全模式）',
        )
        parser.add_argument(
            '--skip-inject', action='store_true', dest='skip_inject',
            help='采集并备份后，不自动执行注入（手动后续注入）',
        )
        parser.add_argument(
            '--batch', type=str,
            help='指定操作的批次号（配合 --diff-only/--resolve-conflicts 使用）',
        )
        parser.add_argument(
            '--operator', type=str, default='system',
            help='操作人标识，记录在批次日志中',
        )
        parser.add_argument(
            '--no-report', action='store_true', dest='no_report',
            help='注入后不自动生成冲突报告',
        )
        parser.add_argument(
            '--resolve-conflicts-mode', type=str, dest='resolve_conflicts_mode',
            default='pending',
            choices=['pending', 'upsert', 'skip'],
            help='冲突处理策略: pending=等待人工审核(默认), upsert=LIMS数据覆盖已有, skip=跳过冲突',
        )

    def handle(self, *args, **options):
        # 特殊操作模式
        if options['test_conn']:
            self._test_connection()
            return

        if options['list_batches']:
            self._list_batches()
            return

        if options['inject_batch']:
            self._inject_from_batch(options['inject_batch'], options)
            return

        if options['diff_only']:
            self._diff_only(options.get('batch'), options)
            return

        if options['resolve_conflicts']:
            self._resolve_conflicts(options.get('batch'), options)
            return

        # 默认流程：采集 → 备份 → 注入
        self._run_full_pipeline(options)

    # ------------------------------------------------------------------
    # 测试连接
    # ------------------------------------------------------------------

    def _test_connection(self):
        from apps.lims_integration.lims_fetcher import LimsFetcher
        self.stdout.write('测试 LIMS 连接...')
        fetcher = LimsFetcher()
        result = fetcher.test_connection()
        if result['connected']:
            self.stdout.write(self.style.SUCCESS(f'✓ LIMS 连接成功'))
            self.stdout.write(f'  URL: {result["base_url"]}')
            self.stdout.write(f'  账号: {result["username"]}')
            self.stdout.write(f'  会话ID: {result["sid"]}')
            self.stdout.write(f'  可用模块: {len(result["available_modules"])} 个')
        else:
            self.stdout.write(self.style.ERROR('✗ LIMS 连接失败'))

    # ------------------------------------------------------------------
    # 列出批次
    # ------------------------------------------------------------------

    def _list_batches(self):
        from apps.lims_integration.lims_exporter import LimsExporter
        batches = LimsExporter.list_batches()
        if not batches:
            self.stdout.write('暂无本地备份批次')
            return
        self.stdout.write(self.style.SUCCESS('=== 本地备份批次 ==='))
        for b in batches:
            self.stdout.write(
                f"  {b['batch_no']}  {b.get('total_records', 0):>6}条  "
                f"{b.get('created_at', '')[:16]}"
            )

    # ------------------------------------------------------------------
    # 主流程：采集 → 备份 → [注入]
    # ------------------------------------------------------------------

    def _run_full_pipeline(self, options):
        from apps.lims_integration.lims_fetcher import LimsFetcher
        TM = TIER_MODULES
        from apps.lims_integration.lims_exporter import LimsExporter
        from apps.lims_integration.lims_injector import LimsInjector
        from apps.lims_integration.lims_dedup import LimsDedupReport

        dry_run = options['dry_run']
        skip_inject = options.get('skip_inject', False)
        operator = options.get('operator', 'system')

        # 确定采集模块
        if options.get('module'):
            modules = [options['module']]
        elif options.get('tier'):
            modules = TM.get(options['tier'], [])
        elif options.get('all_modules'):
            modules = ALL_MODULES
        else:
            # 默认采集 Tier 1
            modules = TM['tier1']
            self.stdout.write(
                self.style.WARNING('未指定模块，默认采集 Tier 1（设备/人员/委托/客户/样品）')
            )

        self.stdout.write(f'采集模块: {", ".join(modules)}')
        self.stdout.write(f'操作模式: {"DRY-RUN" if dry_run else "正式采集"}')

        # Step 1: 网络采集
        self.stdout.write('\n[Step 1] 连接 LIMS 并采集数据...')
        fetcher = LimsFetcher()
        all_data = fetcher.fetch_all(modules=modules)
        total = sum(len(recs) for recs, _ in all_data.values())
        self.stdout.write(self.style.SUCCESS(
            f'  采集完成: {len(all_data)} 个模块，共 {total} 条记录'
        ))
        for module, (recs, meta) in all_data.items():
            status = '✓' if not meta.get('errors') else '⚠'
            self.stdout.write(f'  {status} {module}: {len(recs)} 条')
            if meta.get('errors'):
                for err in meta['errors']:
                    self.stdout.write(f'    ! {err}')

        if dry_run:
            self.stdout.write(self.style.WARNING(
                '\n[DRY-RUN] 采集预览完成，未写入任何数据'
            ))
            return

        # Step 2: JSON 文件备份
        self.stdout.write('\n[Step 2] 保存 JSON 文件备份...')
        exporter = LimsExporter()
        manifest = exporter.save_to_files(all_data, operator=operator)
        self.stdout.write(self.style.SUCCESS(
            f'  备份目录: {manifest["backup_dir"]}'
        ))

        # Step 3: PostgreSQL 入库（raw_lims 表）
        self.stdout.write('\n[Step 3] 写入原始数据到 raw_lims 表...')
        module_stats = {m: len(recs) for m, (recs, _) in all_data.items()}
        batch = exporter.create_batch(
            modules=modules,
            module_stats=module_stats,
            total_records=total,
            operator=operator,
        )
        insert_stats = exporter.save_to_database(all_data, batch=batch)
        self.stdout.write(self.style.SUCCESS(
            f'  入库完成，批次号: {exporter.batch_no}'
        ))
        for module, count in insert_stats.items():
            self.stdout.write(f'  {module}: {count} 条新增')

        if skip_inject:
            self.stdout.write(self.style.WARNING(
                f'\n[SKIP-INJECT] 备份完成，跳过注入。'
                f'批次号: {exporter.batch_no}\n'
                f'后续注入命令: python manage.py fetch_lims_data '
                f'--inject-from-batch {exporter.batch_no}'
            ))
            return

        # Step 4: 注入业务库（依赖链顺序）
        self.stdout.write('\n[Step 4] 按依赖链顺序注入业务库...')
        resolve_mode = options.get('resolve_conflicts_mode', 'pending')
        inject_result = _inject_with_dependency_chain(
            batch, self.stdout, self.style, resolve_conflicts=resolve_mode
        )

        # Step 5: 生成报告
        if not options.get('no_report'):
            self.stdout.write('\n[Step 5] 生成对比报告...')
            report = LimsDedupReport(batch)
            report_path = report.generate_html_report()
            report.generate_csv_report()
            self.stdout.write(self.style.SUCCESS(f'  报告路径: {report_path}'))

        # 更新批次状态
        from apps.lims_integration.models import BatchStatus
        batch.status = (
            BatchStatus.INJECTED if inject_result['conflicts'] == 0
            else BatchStatus.PARTIAL
        )
        batch.injected_records = inject_result['injected'] + inject_result['updated']
        batch.conflict_count = inject_result['conflicts']
        batch.injected_at = timezone.now()
        batch.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n全流程完成！批次号: {exporter.batch_no}'
        ))
        if inject_result['conflicts'] > 0:
            self.stdout.write(self.style.WARNING(
                f'有 {inject_result["conflicts"]} 条冲突待审核。\n'
                f'审核命令: python manage.py fetch_lims_data '
                f'--resolve-conflicts --batch {exporter.batch_no}'
            ))

    # ------------------------------------------------------------------
    # 从已有批次注入
    # ------------------------------------------------------------------

    def _inject_from_batch(self, batch_no: str, options):
        from apps.lims_integration.models import LimsImportBatch
        from apps.lims_integration.lims_dedup import LimsDedupReport

        batch = LimsImportBatch.objects.filter(batch_no=batch_no).first()
        if not batch:
            raise CommandError(f'批次不存在: {batch_no}')

        resolve_mode = options.get('resolve_conflicts_mode', 'pending')
        self.stdout.write(f'从批次 {batch_no} 按依赖链顺序重新注入（冲突策略: {resolve_mode}）...')
        result = _inject_with_dependency_chain(
            batch, self.stdout, self.style, resolve_conflicts=resolve_mode
        )
        self.stdout.write(self.style.SUCCESS(
            f'注入完成: 新建 {result["injected"]}，更新 {result["updated"]}，'
            f'冲突 {result["conflicts"]}，失败 {result["failed"]}'
        ))
        if not options.get('no_report'):
            report = LimsDedupReport(batch)
            path = report.generate_html_report()
            self.stdout.write(f'报告: {path}')

    # ------------------------------------------------------------------
    # 只生成对比报告
    # ------------------------------------------------------------------

    def _diff_only(self, batch_no: str, options):
        from apps.lims_integration.models import LimsImportBatch
        from apps.lims_integration.lims_dedup import LimsDedupReport

        if not batch_no:
            # 使用最新批次
            batch = LimsImportBatch.objects.order_by('-create_time').first()
            if not batch:
                raise CommandError('无批次记录，请先执行采集')
        else:
            batch = LimsImportBatch.objects.filter(batch_no=batch_no).first()
            if not batch:
                raise CommandError(f'批次不存在: {batch_no}')

        self.stdout.write(f'生成批次 {batch.batch_no} 的对比报告...')
        report = LimsDedupReport(batch)
        summary = report.get_conflict_summary()
        html_path = report.generate_html_report()
        csv_path = report.generate_csv_report()

        self.stdout.write(self.style.SUCCESS('报告生成完成:'))
        self.stdout.write(f'  HTML: {html_path}')
        self.stdout.write(f'  CSV:  {csv_path}')
        self.stdout.write(f'  冲突总数: {summary["total"]}')
        self.stdout.write(f'  待审核: {summary["pending_count"]}')

    # ------------------------------------------------------------------
    # 交互式冲突处理
    # ------------------------------------------------------------------

    def _resolve_conflicts(self, batch_no: str, options):
        from apps.lims_integration.models import LimsImportBatch
        from apps.lims_integration.lims_dedup import LimsDedupReport

        if not batch_no:
            batch = LimsImportBatch.objects.order_by('-create_time').first()
            if not batch:
                raise CommandError('无批次记录')
        else:
            batch = LimsImportBatch.objects.filter(batch_no=batch_no).first()
            if not batch:
                raise CommandError(f'批次不存在: {batch_no}')

        report = LimsDedupReport(batch)
        pending = report.get_pending_conflicts()
        if not pending:
            self.stdout.write(self.style.SUCCESS('无待审核冲突'))
            return

        self.stdout.write(f'批次 {batch.batch_no} 有 {len(pending)} 条待审核冲突\n')

        for i, conflict in enumerate(pending):
            self.stdout.write(f'\n--- 冲突 {i+1}/{len(pending)} ---')
            self.stdout.write(f'模块: {conflict["module"]}  ID: {conflict["lims_id"]}')
            self.stdout.write(f'冲突类型: {conflict["conflict_type"]}  '
                              f'相似度: {conflict["similarity"]:.0%}')
            self.stdout.write('\nLIMS数据:')
            for k, v in list(conflict['lims_data'].items())[:8]:
                self.stdout.write(f'  {k}: {v}')
            self.stdout.write('\n新系统已有数据:')
            for k, v in list(conflict['existing_data'].items())[:8]:
                self.stdout.write(f'  {k}: {v}')
            self.stdout.write('\n差异字段:')
            for diff in conflict['diff_fields'][:5]:
                self.stdout.write(
                    f'  {diff["field"]}: LIMS={diff["lims"][:50]}  '
                    f'新系统={diff["existing"][:50]}'
                )

            self.stdout.write(
                '\n处理选项: '
                '[1] use_lims  [2] use_existing  [3] manual_merge  [4] skip  [5] 跳过本条  [q] 退出'
            )
            choice = input('选择: ').strip().lower()

            resolution_map = {
                '1': 'use_lims',
                '2': 'use_existing',
                '3': 'manual_merge',
                '4': 'skip',
            }
            if choice == 'q':
                self.stdout.write('已退出，其余冲突待后续处理')
                break
            if choice == '5' or choice not in resolution_map:
                continue

            resolution = resolution_map[choice]
            note = input('备注（可选，直接回车跳过）: ').strip()
            report.resolve_conflict(
                conflict['id'],
                resolution=resolution,
                note=note,
            )
            self.stdout.write(self.style.SUCCESS(f'  ✓ 已处理: {resolution}'))

        self.stdout.write(self.style.SUCCESS('\n冲突处理完成'))


# ============================================================================
# 依赖链注入函数（模块级别函数，Command 外部可复用）
# ============================================================================

def _inject_with_dependency_chain(batch, stdout, style, resolve_conflicts: str = 'pending') -> dict:
    """
    按依赖链顺序注入一个批次的所有数据。

    依赖关系：
      角色种子（前提） → 人员 → 设备（需要人员 Account 作为 manager_id）
      → 客户 → 委托（需要客户 Client 作为 sponsor_id）

    关键原则：
    1. 人员必须在设备之前注入，因为设备注入时需要查找责任人的 Account
    2. 客户必须在委托之前注入，因为委托需要关联 sponsor_id
    3. 同一 module 内按批次中的顺序注入
    """
    from apps.lims_integration.lims_injector import LimsInjector
    from apps.lims_integration.models import RawLimsRecord

    # 注入顺序：业务依赖链
    INJECT_ORDER = [
        # Phase 1: 人员（先于设备，设备注入时需要人员 Account）
        'personnel',
        # Phase 2: 设备与设施（需要人员作为责任人）
        'equipment',
        'reference_material',
        'consumable',
        # Phase 3: 检测方法与标准（独立，无强依赖）
        'standard',
        'method',
        'detection_project',
        # Phase 4: 客户（先于委托）
        'client',
        # Phase 5: 委托/项目（需要客户）
        'commission',
        'commission_detection',
        # Phase 6: 样品（需要委托）
        'sample',
        'sample_storage',
        # Phase 7: 合规约束（需要人员和设备）
        'calibration_record',
        'period_check_record',
        'training_record',
        'competency_record',
        'personnel_auth_ledger',
        # Phase 8: 过程追溯（需要人员和设备）
        'equipment_usage',
        'equipment_history',
        'equipment_maintenance_record',
        'equipment_repair_record',
        'sample_transfer',
        # Phase 9: 组织与质量
        'group_info',
        'group_personnel',
        'quality_doc',
        'supplier',
        'supervision_record',
        'report_info',
        'invoice',
    ]

    # 检查批次中实际有哪些模块（upsert 模式同时处理 conflict 状态）
    if resolve_conflicts == 'upsert':
        status_filter = ['pending', 'conflict']
    else:
        status_filter = ['pending']

    available_modules = list(
        RawLimsRecord.objects.filter(
            batch=batch, injection_status__in=status_filter
        ).values_list('module', flat=True).distinct()
    )

    # 按依赖链顺序排列，不在 INJECT_ORDER 中的模块追加到末尾
    ordered = [m for m in INJECT_ORDER if m in available_modules]
    remaining = [m for m in available_modules if m not in ordered]
    ordered_modules = ordered + remaining

    total_result = {'injected': 0, 'updated': 0, 'conflicts': 0, 'failed': 0}
    injector = LimsInjector(batch, dry_run=False, resolve_conflicts=resolve_conflicts)

    stdout.write(f'  注入顺序: {" → ".join(ordered_modules)}')

    for module in ordered_modules:
        module_count = RawLimsRecord.objects.filter(
            batch=batch, module=module, injection_status__in=status_filter
        ).count()
        if module_count == 0:
            continue

        stdout.write(f'  [{module}] 开始注入 {module_count} 条...')
        module_result = injector.inject_module(module)

        total_result['injected'] += module_result.get('injected', 0)
        total_result['updated'] += module_result.get('updated', 0)
        total_result['conflicts'] += module_result.get('conflicts', 0)
        total_result['failed'] += module_result.get('failed', 0)

        stdout.write(style.SUCCESS(
            f'  [{module}] 完成: '
            f'新建 {module_result.get("injected", 0)}，'
            f'更新 {module_result.get("updated", 0)}，'
            f'冲突 {module_result.get("conflicts", 0)}，'
            f'失败 {module_result.get("failed", 0)}'
        ))

    stdout.write(style.SUCCESS(
        f'\n  全批次注入完成: '
        f'新建 {total_result["injected"]}，'
        f'更新 {total_result["updated"]}，'
        f'冲突 {total_result["conflicts"]}，'
        f'失败 {total_result["failed"]}'
    ))
    return total_result
