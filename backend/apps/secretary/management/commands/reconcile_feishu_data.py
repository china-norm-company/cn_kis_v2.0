"""
reconcile_feishu_data — 飞书数据对账命令

对比飞书侧数据量与本地数据库记录数，发现差异时可自动补采。

使用方式：
    # 仅对账报告（不修复）
    python manage.py reconcile_feishu_data

    # 发现差异时自动触发补采
    python manage.py reconcile_feishu_data --auto-fix

    # 指定数据源对账
    python manage.py reconcile_feishu_data --sources mail,doc
"""
import logging
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '飞书数据对账：比较飞书侧数量与本地数据库记录'

    def add_arguments(self, parser):
        parser.add_argument(
            '--sources', type=str, default='mail,approval,doc,wiki',
            help='对账数据源（逗号分隔），默认 mail,approval,doc,wiki',
        )
        parser.add_argument(
            '--auto-fix', action='store_true',
            help='发现差异时自动补采（重置对应 checkpoint 为 pending）',
        )
        parser.add_argument(
            '--threshold', type=float, default=0.05,
            help='差异率阈值，超过此值视为异常（默认 5%%）',
        )

    def handle(self, *args, **options):
        sources = [s.strip() for s in options['sources'].split(',') if s.strip()]
        auto_fix = options['auto_fix']
        threshold = options['threshold']

        self.stdout.write('=' * 60)
        self.stdout.write('飞书数据对账报告')
        self.stdout.write('=' * 60)

        discrepancies = []

        for source in sources:
            self.stdout.write(f'\n[{source}] 对账中...')
            try:
                result = self._reconcile_source(source, threshold)
                self._print_source_result(source, result)
                if result.get('has_discrepancy'):
                    discrepancies.append((source, result))
            except Exception as e:
                self.stdout.write(f'  对账失败: {e}')
                logger.error('reconcile %s failed: %s', source, e)

        # PersonalContext vs KnowledgeEntry 对账
        self.stdout.write('\n[内部对账] PersonalContext → KnowledgeEntry')
        self._reconcile_internal()

        if discrepancies:
            self.stdout.write(f'\n【发现 {len(discrepancies)} 个数据源存在差异】')
            for source, result in discrepancies:
                gap = result.get('gap', 0)
                gap_pct = result.get('gap_pct', 0)
                self.stdout.write(f'  {source}: 差异 {gap} 条 ({gap_pct:.1%})')

            if auto_fix:
                self.stdout.write('\n[auto-fix] 重置差异数据源的 checkpoint 为 pending...')
                self._auto_fix(discrepancies)
            else:
                self.stdout.write(
                    '\n提示：运行 --auto-fix 可自动重置并重新采集差异数据源'
                )
        else:
            self.stdout.write('\n✓ 所有数据源对账通过，无明显差异')

        self.stdout.write('\n' + '=' * 60)

    def _reconcile_source(self, source: str, threshold: float) -> dict:
        """对账单个数据源。"""
        from apps.secretary.models import PersonalContext, FeishuMigrationCheckpoint
        from django.db.models import Sum

        # 本地记录数
        local_count = PersonalContext.objects.filter(source_type=source).count()

        # checkpoint 统计
        cp_stats = FeishuMigrationCheckpoint.objects.filter(
            source_type=source,
        ).aggregate(
            total_fetched=Sum('total_fetched'),
            total_deposited=Sum('total_deposited'),
        )
        checkpoint_fetched = cp_stats['total_fetched'] or 0

        # 飞书侧估算（通过 API 获取总数，部分 API 支持）
        feishu_estimate = self._estimate_feishu_count(source)

        result = {
            'local_count': local_count,
            'checkpoint_fetched': checkpoint_fetched,
            'feishu_estimate': feishu_estimate,
            'has_discrepancy': False,
            'gap': 0,
            'gap_pct': 0.0,
        }

        if feishu_estimate > 0:
            gap = feishu_estimate - local_count
            gap_pct = abs(gap) / feishu_estimate if feishu_estimate > 0 else 0
            result['gap'] = gap
            result['gap_pct'] = gap_pct
            result['has_discrepancy'] = gap_pct > threshold and gap > 10
        elif checkpoint_fetched > 0 and local_count < checkpoint_fetched * 0.9:
            # checkpoint 显示采集了 N 条，但 PersonalContext 中少于 90%
            gap = checkpoint_fetched - local_count
            result['gap'] = gap
            result['gap_pct'] = gap / checkpoint_fetched
            result['has_discrepancy'] = True

        return result

    def _estimate_feishu_count(self, source: str) -> int:
        """尝试从飞书 API 获取数据总量估算。"""
        try:
            from libs.feishu_client import feishu_client

            if source == 'wiki':
                spaces = feishu_client.list_wiki_spaces(page_size=50)
                total = 0
                for space in spaces:
                    data = feishu_client.get_wiki_nodes(space.get('space_id', ''))
                    total += len(data.get('items', []))
                return total

            if source == 'approval':
                data = feishu_client._request(
                    'GET', 'approval/v4/instances',
                    params={'page_size': 1},
                )
                return data.get('total', 0) or 0

        except Exception as e:
            logger.debug('无法从飞书 API 估算 %s 数量: %s', source, e)

        return 0  # 无法估算

    def _print_source_result(self, source: str, result: dict):
        local = result['local_count']
        fetched = result['checkpoint_fetched']
        feishu = result['feishu_estimate']
        gap = result['gap']

        self.stdout.write(f'  本地记录数: {local}')
        self.stdout.write(f'  Checkpoint 已采集: {fetched}')
        if feishu > 0:
            self.stdout.write(f'  飞书侧估算: {feishu}')
        if result['has_discrepancy']:
            self.stdout.write(f'  ⚠ 差异: {gap} 条 ({result["gap_pct"]:.1%})')
        else:
            self.stdout.write('  ✓ 无明显差异')

    def _reconcile_internal(self):
        """对账 PersonalContext → KnowledgeEntry 转化率。"""
        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry
        from django.db.models import Count

        pc_by_source = dict(
            PersonalContext.objects.values('source_type')
            .annotate(c=Count('id'))
            .values_list('source_type', 'c')
        )
        ke_by_source = dict(
            KnowledgeEntry.objects.filter(
                source_type__startswith='feishu_', is_deleted=False,
            ).values('source_type')
            .annotate(c=Count('id'))
            .values_list('source_type', 'c')
        )

        self.stdout.write(
            f'  {"数据源":<20} {"PersonalContext":>15} {"KnowledgeEntry":>15} {"转化率":>8}'
        )
        self.stdout.write('  ' + '-' * 60)

        total_pc = total_ke = 0
        for source, pc_count in sorted(pc_by_source.items()):
            ke_key = f'feishu_{source}'
            ke_count = ke_by_source.get(ke_key, 0)
            pct = f'{ke_count * 100 // pc_count}%' if pc_count > 0 else '-'
            self.stdout.write(f'  {source:<20} {pc_count:>15} {ke_count:>15} {pct:>8}')
            total_pc += pc_count
            total_ke += ke_count

        overall_pct = f'{total_ke * 100 // total_pc}%' if total_pc > 0 else '-'
        self.stdout.write(f'  {"合计":<20} {total_pc:>15} {total_ke:>15} {overall_pct:>8}')

        # 提示待入库数量
        pending = total_pc - total_ke
        if pending > 0:
            self.stdout.write(
                f'\n  提示: 约 {pending} 条 PersonalContext 尚未转为 KnowledgeEntry'
            )
            self.stdout.write(
                '  运行: python manage.py process_pending_contexts 可完成入库'
            )

    def _auto_fix(self, discrepancies):
        """将差异数据源的 checkpoint 重置为 pending，触发补采。"""
        from apps.secretary.models import FeishuMigrationCheckpoint

        for source, _ in discrepancies:
            count = FeishuMigrationCheckpoint.objects.filter(
                source_type=source,
                status='completed',
            ).update(status='pending', page_token='')
            self.stdout.write(f'  {source}: 重置 {count} 条 checkpoint 为 pending')

        self.stdout.write(
            '\n运行以下命令开始补采:\n'
            '  python manage.py sweep_feishu_full_history '
            f'--sources {",".join(s for s, _ in discrepancies)}'
        )
