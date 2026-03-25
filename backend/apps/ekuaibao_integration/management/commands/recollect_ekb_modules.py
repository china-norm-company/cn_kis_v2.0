"""
recollect_ekb_modules — 补采易快报 V1 中缺失的模块数据

缺失模块（全部 0 条）：
  - dimension_items  自定义档案维度项（ID → 明文映射，解决哑 ID 问题）
  - payer_infos      付款方账户
  - payee_infos      收款方账户（供应商/员工银行卡）
  - budgets          预算包
  - budget_nodes     预算节点
  - loan_infos       借款信息
  - repayment_records 还款记录
  - payment_records  付款记录

用法:
  python manage.py recollect_ekb_modules [--modules dimension_items payer_infos ...]
  python manage.py recollect_ekb_modules --all
"""
import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.recollect')

ALL_MISSING_MODULES = [
    'dimension_items',
    'payer_infos',
    'payee_infos',
    'budgets',
    'budget_nodes',
    'loan_infos',
    'repayment_records',
    'payment_records',
]


class Command(BaseCommand):
    help = '补采易快报 V1 中缺失的模块数据（dimension_items/budgets/payee_infos 等）'

    def add_arguments(self, parser):
        parser.add_argument('--all', action='store_true',
                            help='补采所有缺失模块')
        parser.add_argument('--modules', nargs='+',
                            choices=ALL_MISSING_MODULES,
                            help='指定要补采的模块')
        parser.add_argument('--dry-run', action='store_true',
                            help='只测试连接和 API，不写入数据库')

    def handle(self, *args, **options):
        from apps.ekuaibao_integration.models import (
            EkbImportBatch, EkbRawRecord, EkbBatchStatus
        )
        from apps.ekuaibao_integration.ekb_client import get_client

        dry_run = options['dry_run']

        if options['all']:
            modules = ALL_MISSING_MODULES
        elif options['modules']:
            modules = options['modules']
        else:
            self.stderr.write('请指定 --all 或 --modules')
            return

        self.stdout.write(f'{"[DRY-RUN] " if dry_run else ""}补采模块: {modules}')

        # 1. 获取 API 客户端
        try:
            client = get_client()
            client.authenticate()
            self.stdout.write('✅ OpenAPI 认证成功')
        except Exception as e:
            self.stderr.write(f'❌ OpenAPI 认证失败: {e}')
            self.stdout.write('尝试用飞书内部 API 客户端...')
            client = None

        if not client:
            self.stderr.write('无可用 API 客户端，退出')
            return

        # 2. 创建补采批次
        batch_no = f'supplement_{timezone.now().strftime("%Y%m%d_%H%M%S")}'
        if not dry_run:
            batch = EkbImportBatch.objects.create(
                batch_no=batch_no,
                phase='supplement',
                status=EkbBatchStatus.COLLECTING,
                modules=modules,
                operator='auto',
                notes=f'补采缺失模块: {", ".join(modules)}',
            )
        else:
            batch = None
        self.stdout.write(f'批次: {batch_no}')

        total_saved = 0

        for module in modules:
            self.stdout.write(f'\n─── {module} ───')
            saved = self._collect_module(client, module, batch, dry_run)
            total_saved += saved
            self.stdout.write(f'  {module}: 采集 {saved} 条')

        if batch and not dry_run:
            batch.status = EkbBatchStatus.COLLECTED
            batch.total_records = total_saved
            batch.collected_at = timezone.now()
            batch.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n✅ 补采完成，共 {total_saved} 条'
        ))

        # 3. 特别提示：dimension_items 是解决哑 ID 的关键
        if 'dimension_items' in modules:
            self.stdout.write(
                '\n📌 dimension_items 已采集。'
                '现在运行以下命令可将历史 flows 中的档案 ID 解析为明文：\n'
                '  python manage.py rebuild_ekuaibao_relations'
            )

    def _collect_module(self, client, module: str, batch, dry_run: bool) -> int:
        """调用对应的 API 采集方法"""
        import hashlib, json

        from apps.ekuaibao_integration.models import EkbRawRecord

        collector_map = {
            'dimension_items':   self._collect_dimension_items,
            'payer_infos':       self._collect_payer_infos,
            'payee_infos':       self._collect_payee_infos,
            'budgets':           self._collect_budgets,
            'budget_nodes':      self._collect_budget_nodes,
            'loan_infos':        self._collect_loan_infos,
            'repayment_records': self._collect_repayment_records,
            'payment_records':   self._collect_payment_records,
        }

        fn = collector_map.get(module)
        if not fn:
            self.stderr.write(f'  未知模块: {module}')
            return 0

        try:
            items = fn(client)
        except Exception as e:
            self.stderr.write(f'  ❌ 采集失败: {e}')
            return 0

        if not items:
            self.stdout.write(f'  API 返回 0 条（可能无数据或权限不足）')
            return 0

        if dry_run:
            self.stdout.write(f'  [DRY] 将写入 {len(items)} 条')
            return len(items)

        saved = 0
        for item in items:
            ekb_id = item.get('id', '') or item.get('code', '') or json.dumps(item)[:32]
            data_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
            checksum = hashlib.sha256(data_str.encode()).hexdigest()
            _, created = EkbRawRecord.objects.update_or_create(
                batch=batch,
                module=module,
                ekb_id=ekb_id,
                defaults={
                    'raw_data': item,
                    'scraped_at': timezone.now(),
                    'checksum': checksum,
                    'injection_status': 'pending',
                }
            )
            if created:
                saved += 1

        return saved

    # ── 各模块采集方法 ────────────────────────────────────────────────────────

    def _collect_dimension_items(self, client) -> list:
        """采集所有自定义档案维度项（ID → 明文映射）"""
        items = []
        # 先获取所有维度（dimensions）
        dims = list(client.iter_pages('/api/openapi/v1/dimensions', {}, page_size=100))
        self.stdout.write(f'  发现 {len(dims)} 个维度，逐一获取条目...')
        for dim in dims:
            dim_id = dim.get('id', '')
            if not dim_id:
                continue
            try:
                dim_items = list(client.iter_pages(
                    '/api/openapi/v1/dimensions/items',
                    {'dimensionId': dim_id},
                    page_size=200,
                ))
                for di in dim_items:
                    di['_dimension_id'] = dim_id
                    di['_dimension_name'] = dim.get('name', '')
                items.extend(dim_items)
            except Exception as e:
                logger.warning('维度 %s 条目获取失败: %s', dim_id, e)
        return items

    def _collect_payer_infos(self, client) -> list:
        return list(client.iter_pages('/api/openapi/v1/payerInfos', {}, page_size=100))

    def _collect_payee_infos(self, client) -> list:
        return list(client.iter_pages('/api/openapi/v1/payeeInfos', {}, page_size=100))

    def _collect_budgets(self, client) -> list:
        return list(client.iter_budgets())

    def _collect_budget_nodes(self, client) -> list:
        """逐预算包获取节点"""
        nodes = []
        budgets = list(client.iter_budgets())
        for b in budgets:
            bid = b.get('id', '')
            if not bid:
                continue
            try:
                detail = client.get_budget_details(bid)
                if detail and 'nodes' in detail:
                    for node in detail['nodes']:
                        node['_budget_id'] = bid
                        nodes.append(node)
            except Exception as e:
                logger.warning('预算 %s 节点获取失败: %s', bid, e)
        return nodes

    def _collect_loan_infos(self, client) -> list:
        return list(client.iter_pages('/api/openapi/v1/loanInfos', {}, page_size=100))

    def _collect_repayment_records(self, client) -> list:
        return list(client.iter_pages('/api/openapi/v1/repaymentRecords', {}, page_size=100))

    def _collect_payment_records(self, client) -> list:
        return list(client.iter_pages('/api/openapi/v1/paymentRecords', {}, page_size=100))
