"""
成本自动归集命令

从工单、工时、物料、设备模块归集成本到财务模块。
用法: python manage.py sync_costs [--protocol_id=N]
"""
import logging
from datetime import date
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '从跨模块数据源归集成本记录'

    def add_arguments(self, parser):
        parser.add_argument('--protocol_id', type=int, help='指定协议ID')

    def handle(self, *args, **options):
        protocol_id = options.get('protocol_id')
        total_created = 0

        total_created += self._sync_workorder_costs(protocol_id)
        total_created += self._sync_material_costs(protocol_id)

        self.stdout.write(self.style.SUCCESS(f'共归集 {total_created} 条成本记录'))

    def _sync_workorder_costs(self, protocol_id=None):
        """从工单模块归集人工成本"""
        created = 0
        try:
            from apps.workorder.models import WorkOrder
            from apps.finance.models import CostRecord
            from apps.finance.services.cost_service import create_cost_record

            qs = WorkOrder.objects.filter(status='completed')
            if protocol_id:
                qs = qs.filter(enrollment__protocol_id=protocol_id)

            for wo in qs:
                ref_no = f'WO-{wo.id}'
                if CostRecord.objects.filter(reference_no=ref_no, reference_type='workorder').exists():
                    continue
                if not hasattr(wo, 'estimated_cost') or not wo.estimated_cost:
                    continue
                protocol_id_val = wo.enrollment.protocol_id if wo.enrollment_id else None
                if not protocol_id_val:
                    continue
                record_no = f'CR-WO-{wo.id:06d}'
                wo_label = getattr(wo, 'code', None) or getattr(wo, 'title', f'WO#{wo.id}')
                create_cost_record(
                    record_no=record_no, protocol_id=protocol_id_val,
                    cost_type='labor', cost_date=date.today(),
                    amount=wo.estimated_cost,
                    description=f'工单 {wo_label} 人工成本',
                    reference_no=ref_no, reference_type='workorder',
                )
                created += 1
        except ImportError:
            logger.info('工单模块未安装，跳过')
        except Exception as e:
            logger.error(f'工单成本归集失败: {e}')
        return created

    def _sync_material_costs(self, protocol_id=None):
        """从物料模块归集材料成本"""
        created = 0
        try:
            from apps.material.models import StockOut
            from apps.finance.models import CostRecord
            from apps.finance.services.cost_service import create_cost_record

            qs = StockOut.objects.filter(status='confirmed')
            if protocol_id:
                qs = qs.filter(protocol_id=protocol_id)

            for so in qs:
                ref_no = f'SO-{so.id}'
                if CostRecord.objects.filter(reference_no=ref_no, reference_type='stock_out').exists():
                    continue
                if not hasattr(so, 'total_amount') or not so.total_amount:
                    continue
                record_no = f'CR-SO-{so.id:06d}'
                create_cost_record(
                    record_no=record_no, protocol_id=so.protocol_id,
                    cost_type='material', cost_date=date.today(),
                    amount=so.total_amount,
                    description=f'物料出库 {getattr(so, "code", so.id)}',
                    reference_no=ref_no, reference_type='stock_out',
                )
                created += 1
        except ImportError:
            logger.info('物料模块未安装，跳过')
        except Exception as e:
            logger.error(f'物料成本归集失败: {e}')
        return created
