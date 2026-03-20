"""
export_ekuaibao_full — 易快报全量采集与注入主命令

四层安全架构：
  Layer 1 采集   → 只读调用易快报 API
  Layer 2 备份   → JSON 文件 + PostgreSQL raw_ekb 表（不可变）
  Layer 3 暂存   → 冲突检测，待审核记录不自动注入
  Layer 4 注入   → 人工确认后原子注入，保存前值快照

常用用法：

  # Phase 0: 连通测试（不写任何数据）
  python manage.py export_ekuaibao_full --test-connection

  # Phase 0: 全量盘点（仅采集统计，不写入）
  python manage.py export_ekuaibao_full --dry-run

  # Phase 1: 基础主数据（采集 + 备份，不注入）
  python manage.py export_ekuaibao_full --phase phase1 --skip-inject

  # Phase 2: 核心交易数据（采集 + 备份，不注入）
  python manage.py export_ekuaibao_full --phase phase2 --skip-inject

  # Phase 3: 预算与发票
  python manage.py export_ekuaibao_full --phase phase3 --skip-inject

  # 从已有备份批次重新注入（跳过网络采集）
  python manage.py export_ekuaibao_full --inject-from-batch 20260318_143000

  # 只生成对比报告（不做任何写操作）
  python manage.py export_ekuaibao_full --diff-only --batch 20260318_143000

  # 处理待审核冲突（交互式）
  python manage.py export_ekuaibao_full --resolve-conflicts --batch 20260318_143000

  # 列出所有备份批次
  python manage.py export_ekuaibao_full --list-batches

  # 验证备份文件完整性
  python manage.py export_ekuaibao_full --verify --batch 20260318_143000
"""
import logging

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.cmd')

PHASE_MODULES = {
    'phase1': [
        'corporation', 'departments', 'staffs', 'fee_types',
        'specifications', 'dimensions', 'dimension_items',
    ],
    'phase2': [
        'flows',  # expense + loan + requisition，共 36,218 条
    ],
    'phase3': [
        'budgets',
    ],
    'phase4': [
        'attachments',
    ],
}
ALL_MODULES = sum(PHASE_MODULES.values(), [])


class Command(BaseCommand):
    help = '易快报全量采集、备份、注入（四层安全架构）'

    def add_arguments(self, parser):
        # 操作模式（互斥）
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument('--inject-from-batch', type=str, dest='inject_batch',
                          metavar='BATCH_NO', help='从已有备份批次注入（跳过网络采集）')
        mode.add_argument('--diff-only', action='store_true', dest='diff_only',
                          help='只生成对比报告，不做任何写操作')
        mode.add_argument('--resolve-conflicts', action='store_true', dest='resolve_conflicts',
                          help='处理待审核的冲突记录（交互式）')
        mode.add_argument('--list-batches', action='store_true', dest='list_batches',
                          help='列出所有本地备份批次')
        mode.add_argument('--test-connection', action='store_true', dest='test_conn',
                          help='测试易快报 API 连通性')
        mode.add_argument('--verify', action='store_true', dest='verify',
                          help='验证指定批次备份文件完整性')

        # 采集范围
        scope = parser.add_mutually_exclusive_group()
        scope.add_argument('--phase', type=str, choices=['phase1', 'phase2', 'phase3', 'phase4'],
                           help='按阶段采集')
        scope.add_argument('--module', type=str,
                           help=f'采集单个模块，可选: {", ".join(ALL_MODULES)}')
        scope.add_argument('--all', action='store_true', dest='all_modules',
                           help='采集所有模块（全量）')

        # 行为控制
        parser.add_argument('--dry-run', action='store_true', dest='dry_run',
                            help='只采集和备份，不注入业务库（最安全模式）')
        parser.add_argument('--skip-inject', action='store_true', dest='skip_inject',
                            help='采集并备份后，不自动执行注入（手动后续注入）')
        parser.add_argument('--batch', type=str,
                            help='指定操作的批次号（配合 --diff-only/--verify/--resolve-conflicts 使用）')
        parser.add_argument('--operator', type=str, default='system',
                            help='操作人标识，记录在批次日志中')
        parser.add_argument('--no-report', action='store_true', dest='no_report',
                            help='注入后不自动生成冲突报告')
        parser.add_argument('--resolve-conflicts-mode', type=str, dest='resolve_conflicts_mode',
                            default='pending',
                            choices=['pending', 'upsert', 'skip'],
                            help='冲突处理策略: pending=等待人工审核(默认), upsert=EKB数据覆盖已有, skip=跳过冲突')

    def handle(self, *args, **options):
        if options['test_conn']:
            self._test_connection()
            return
        if options['list_batches']:
            self._list_batches()
            return
        if options.get('inject_batch'):
            self._inject_from_batch(options['inject_batch'], options)
            return
        if options['diff_only']:
            self._diff_only(options.get('batch'), options)
            return
        if options['resolve_conflicts']:
            self._resolve_conflicts(options.get('batch'), options)
            return
        if options['verify']:
            self._verify_backup(options.get('batch'))
            return

        # 默认流程：采集 → 备份 → [注入]
        self._run_full_pipeline(options)

    # ------------------------------------------------------------------
    # 测试连接
    # ------------------------------------------------------------------

    def _test_connection(self):
        from apps.ekuaibao_integration.ekb_client import get_client
        self.stdout.write('测试易快报 API 连接...')
        client = get_client()
        result = client.test_connection()
        if result['connected']:
            self.stdout.write(self.style.SUCCESS('✓ 易快报连接成功'))
            self.stdout.write(f'  域名: {result.get("base_url", "")}')
            self.stdout.write(f'  企业ID: {result.get("corp_id", "")}')
            self.stdout.write(f'  员工总数: {result.get("total_staffs", 0)}')
            self.stdout.write(f'  AppKey: {result.get("app_key", "")}')
            self.stdout.write(f'  Token: {result.get("token_prefix", "")}')
        else:
            self.stdout.write(self.style.ERROR('✗ 易快报连接失败'))
            self.stdout.write(f'  错误: {result.get("error", "")}')

    # ------------------------------------------------------------------
    # 列出批次
    # ------------------------------------------------------------------

    def _list_batches(self):
        from apps.ekuaibao_integration.ekb_exporter import EkbExporter
        batches = EkbExporter.list_batches()
        if not batches:
            self.stdout.write('暂无本地备份批次')
            return
        self.stdout.write(self.style.SUCCESS('=== 易快报备份批次列表 ==='))
        self.stdout.write(
            f'{"批次号":<22} {"阶段":<10} {"记录数":>8} {"创建时间":<20}'
        )
        self.stdout.write('-' * 70)
        for b in batches:
            self.stdout.write(
                f'{b["batch_no"]:<22} {b.get("phase",""):<10} '
                f'{b.get("total_records", 0):>8} {b.get("created_at", "")[:16]:<20}'
            )

    # ------------------------------------------------------------------
    # 验证备份完整性
    # ------------------------------------------------------------------

    def _verify_backup(self, batch_no: str):
        from apps.ekuaibao_integration.ekb_exporter import EkbExporter
        if not batch_no:
            batch_no = EkbExporter.get_latest_batch_no()
            if not batch_no:
                raise CommandError('无备份批次，请先执行采集')

        exporter = EkbExporter(batch_no=batch_no)
        ok, errors = exporter.verify_checksums()
        if ok:
            self.stdout.write(self.style.SUCCESS(f'✓ 批次 {batch_no} 备份文件完整'))
        else:
            self.stdout.write(self.style.ERROR(f'✗ 批次 {batch_no} 备份文件有问题:'))
            for err in errors:
                self.stdout.write(f'  - {err}')

    # ------------------------------------------------------------------
    # 主流程：采集 → 备份 → [注入]
    # ------------------------------------------------------------------

    def _run_full_pipeline(self, options):
        from apps.ekuaibao_integration.ekb_client import get_client
        from apps.ekuaibao_integration.ekb_exporter import EkbExporter
        from apps.ekuaibao_integration.ekb_injector import EkbInjector
        from apps.ekuaibao_integration.ekb_dedup import EkbDedupReport
        from apps.ekuaibao_integration.models import EkbBatchStatus

        dry_run = options['dry_run']
        skip_inject = options.get('skip_inject', False)
        operator = options.get('operator', 'system')

        # 确定采集模块
        if options.get('module'):
            modules = [options['module']]
            phase = 'custom'
        elif options.get('phase'):
            modules = PHASE_MODULES.get(options['phase'], [])
            phase = options['phase']
        elif options.get('all_modules'):
            modules = ALL_MODULES
            phase = 'full'
        else:
            modules = PHASE_MODULES['phase1']
            phase = 'phase1'
            self.stdout.write(
                self.style.WARNING('未指定模块，默认采集 Phase 1（基础主数据）')
            )

        self.stdout.write(f'采集模块: {", ".join(modules)}')
        self.stdout.write(f'采集阶段: {phase}')
        self.stdout.write(f'操作模式: {"DRY-RUN（只统计不写入）" if dry_run else "正式采集"}')

        # Step 1: 网络采集
        self.stdout.write('\n[Step 1] 连接易快报并采集数据...')
        client = get_client()
        try:
            client.authenticate()
            self.stdout.write(self.style.SUCCESS('  ✓ 认证成功'))
        except Exception as ex:
            raise CommandError(f'易快报认证失败: {ex}')

        all_data, collection_errors = self._collect_data(client, modules)
        total = sum(len(recs) for recs in all_data.values())
        self.stdout.write(self.style.SUCCESS(
            f'  采集完成: {len(all_data)} 个模块，共 {total} 条记录'
        ))
        for module, records in all_data.items():
            self.stdout.write(f'  ✓ {module}: {len(records)} 条')
        if collection_errors:
            for err in collection_errors:
                self.stdout.write(self.style.WARNING(f'  ⚠ {err}'))

        if dry_run:
            self.stdout.write(self.style.WARNING(
                '\n[DRY-RUN] 采集预览完成，未写入任何数据'
            ))
            return

        # Step 2: JSON 文件备份
        self.stdout.write('\n[Step 2] 保存 JSON 文件备份...')
        exporter = EkbExporter(phase=phase)
        manifest = exporter.save_to_files(all_data, operator=operator)
        self.stdout.write(self.style.SUCCESS(
            f'  备份目录: {manifest["backup_dir"]}'
        ))

        # Step 3: PostgreSQL 入库（t_ekb_raw_record）
        self.stdout.write('\n[Step 3] 写入原始数据到 t_ekb_raw_record...')
        module_stats = {m: len(recs) for m, recs in all_data.items()}
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
                f'\n[SKIP-INJECT] 备份完成，跳过注入。批次号: {exporter.batch_no}\n'
                f'后续注入命令: python manage.py export_ekuaibao_full '
                f'--inject-from-batch {exporter.batch_no}'
            ))
            return

        # Step 4: 注入业务库
        self.stdout.write('\n[Step 4] 注入业务库（含冲突检测）...')
        injector = EkbInjector(batch, dry_run=False)
        inject_result = injector.inject_all()
        self.stdout.write(self.style.SUCCESS(
            f'  注入完成: 新建 {inject_result["injected"]} 条，'
            f'更新 {inject_result["updated"]} 条，'
            f'冲突 {inject_result["conflicts"]} 条（待审核），'
            f'失败 {inject_result["failed"]} 条'
        ))

        # Step 5: 生成报告
        if not options.get('no_report'):
            self.stdout.write('\n[Step 5] 生成对比报告...')
            report = EkbDedupReport(batch)
            report_path = report.generate_html_report()
            report.generate_csv_report()
            self.stdout.write(self.style.SUCCESS(f'  报告路径: {report_path}'))

        # 更新批次状态
        batch.status = (
            EkbBatchStatus.INJECTED if inject_result['conflicts'] == 0
            else EkbBatchStatus.PARTIAL
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
                f'审核命令: python manage.py export_ekuaibao_full '
                f'--resolve-conflicts --batch {exporter.batch_no}'
            ))

    def _collect_data(self, client, modules: list):
        """执行实际的 API 采集，返回 (all_data, errors)"""
        all_data = {}
        errors = []

        for module in modules:
            self.stdout.write(f'  采集 {module}...', ending='')
            try:
                records = self._collect_module(client, module)
                all_data[module] = records
                self.stdout.write(f' {len(records)} 条')
            except Exception as ex:
                errors.append(f'{module}: {ex}')
                self.stdout.write(self.style.WARNING(f' 失败: {ex}'))
                all_data[module] = []  # 保留空列表，不中断

        return all_data, errors

    def _collect_module(self, client, module: str) -> list:
        """采集单个模块的全量数据"""
        records = []

        if module == 'corporation':
            corp = client.get_corporation_info()
            records = [corp] if corp else []

        elif module == 'departments':
            for page in client.iter_departments():
                records.extend(page)

        elif module == 'staffs':
            for page in client.iter_staffs(has_leave=True):
                records.extend(page)

        elif module == 'fee_types':
            for page in client.iter_fee_types():
                records.extend(page)

        elif module == 'specifications':
            for page in client.iter_specifications():
                records.extend(page)

        elif module == 'dimensions':
            for page in client.iter_dimensions():
                records.extend(page)

        elif module == 'dimension_items':
            for dim_id, items in client.iter_all_dimension_items():
                for item in items:
                    item['_dimension_id'] = dim_id
                records.extend(items if items else [])

        elif module in ('flows', 'flow_details'):
            for page in client.iter_all_flows():
                records.extend(page)

        elif module == 'budgets':
            for page in client.iter_budgets():
                records.extend(page)

        elif module == 'attachments':
            logger.info('附件模块：建立索引，不下载文件（使用 Phase 4 专用命令下载）')

        else:
            logger.warning('未知模块或该模块不可用，跳过: %s', module)

        return records

    # ------------------------------------------------------------------
    # 从已有批次注入
    # ------------------------------------------------------------------

    def _inject_from_batch(self, batch_no: str, options):
        from apps.ekuaibao_integration.models import EkbImportBatch
        from apps.ekuaibao_integration.ekb_injector import EkbInjector
        from apps.ekuaibao_integration.ekb_dedup import EkbDedupReport

        batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
        if not batch:
            raise CommandError(f'批次不存在: {batch_no}')

        resolve_mode = options.get('resolve_conflicts_mode', 'pending')
        self.stdout.write(f'从批次 {batch_no} 重新注入（冲突策略: {resolve_mode}）...')
        injector = EkbInjector(batch, resolve_conflicts=resolve_mode)
        result = injector.inject_all()
        self.stdout.write(self.style.SUCCESS(
            f'注入完成: 新建 {result["injected"]}，更新 {result["updated"]}，'
            f'冲突 {result["conflicts"]}，失败 {result["failed"]}'
        ))
        if not options.get('no_report'):
            report = EkbDedupReport(batch)
            path = report.generate_html_report()
            self.stdout.write(f'报告: {path}')

    # ------------------------------------------------------------------
    # 只生成对比报告
    # ------------------------------------------------------------------

    def _diff_only(self, batch_no: str, options):
        from apps.ekuaibao_integration.models import EkbImportBatch
        from apps.ekuaibao_integration.ekb_dedup import EkbDedupReport
        from apps.ekuaibao_integration.ekb_exporter import EkbExporter

        if not batch_no:
            batch_no = EkbExporter.get_latest_batch_no()
            if not batch_no:
                raise CommandError('无批次记录，请先执行采集')
            # 从 DB 找
        batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
        if not batch:
            raise CommandError(f'批次不存在: {batch_no}')

        self.stdout.write(f'生成批次 {batch_no} 的对比报告...')
        report = EkbDedupReport(batch)

        # 生成双轨对账（核心交易数据）
        reconcile_result = report.dual_track_reconcile(module='flows')
        self.stdout.write(
            f'  双轨对账结果:'
            f' 仅易快报={reconcile_result["summary"]["only_in_ekb_count"]}'
            f' 仅新系统={reconcile_result["summary"]["only_in_new_count"]}'
            f' 一致={reconcile_result["summary"]["both_match_count"]}'
            f' 不一致={reconcile_result["summary"]["both_mismatch_count"]}'
        )

        html_path = report.generate_html_report()
        csv_path = report.generate_csv_report()
        summary = report.get_conflict_summary()

        self.stdout.write(self.style.SUCCESS('报告生成完成:'))
        self.stdout.write(f'  HTML: {html_path}')
        self.stdout.write(f'  CSV:  {csv_path}')
        self.stdout.write(f'  冲突总数: {summary["total"]}')
        self.stdout.write(f'  待审核: {summary["pending_count"]}')

    # ------------------------------------------------------------------
    # 交互式冲突处理
    # ------------------------------------------------------------------

    def _resolve_conflicts(self, batch_no: str, options):
        from apps.ekuaibao_integration.models import EkbImportBatch
        from apps.ekuaibao_integration.ekb_dedup import EkbDedupReport
        from apps.ekuaibao_integration.ekb_exporter import EkbExporter

        if not batch_no:
            batch_no = EkbExporter.get_latest_batch_no()
            if not batch_no:
                raise CommandError('无批次记录')
        batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
        if not batch:
            raise CommandError(f'批次不存在: {batch_no}')

        report = EkbDedupReport(batch)
        pending = report.get_pending_conflicts()
        if not pending:
            self.stdout.write(self.style.SUCCESS('无待审核冲突'))
            return

        self.stdout.write(f'批次 {batch_no} 有 {len(pending)} 条待审核冲突\n')

        for i, conflict in enumerate(pending):
            self.stdout.write(f'\n--- 冲突 {i+1}/{len(pending)} ---')
            self.stdout.write(f'模块: {conflict["module"]}  ID: {conflict["ekb_id"]}')
            self.stdout.write(f'冲突类型: {conflict["conflict_type"]}  '
                              f'相似度: {conflict["similarity"]:.0%}')
            self.stdout.write('\n易快报数据:')
            for k, v in list(conflict['ekb_data'].items())[:8]:
                self.stdout.write(f'  {k}: {v}')
            self.stdout.write('\n新系统已有数据:')
            for k, v in list(conflict['existing_data'].items())[:8]:
                self.stdout.write(f'  {k}: {v}')
            self.stdout.write('\n差异字段:')
            for diff in conflict['diff_fields'][:5]:
                self.stdout.write(
                    f'  {diff["field"]}: 易快报={str(diff["ekb"])[:50]}  '
                    f'新系统={str(diff["existing"])[:50]}'
                )

            self.stdout.write(
                '\n处理选项: '
                '[1] use_ekb  [2] use_existing  [3] skip  [5] 跳过本条  [q] 退出'
            )
            choice = input('选择: ').strip().lower()

            resolution_map = {'1': 'use_ekb', '2': 'use_existing', '3': 'skip'}
            if choice == 'q':
                self.stdout.write('已退出，其余冲突待后续处理')
                break
            if choice == '5' or choice not in resolution_map:
                continue

            resolution = resolution_map[choice]
            note = input('备注（可选）: ').strip()
            report.resolve_conflict(conflict['id'], resolution=resolution, note=note)
            self.stdout.write(self.style.SUCCESS(f'  ✓ 已处理: {resolution}'))

        self.stdout.write(self.style.SUCCESS('\n冲突处理完成'))
