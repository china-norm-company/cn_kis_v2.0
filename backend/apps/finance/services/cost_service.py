"""
成本核算服务

FIN002：成本记录、确认、预算关联
"""
import logging
from typing import Optional
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum

from apps.finance.models import CostRecord, CostRecordStatus, CostType

logger = logging.getLogger(__name__)


def create_cost_record(
    record_no: str, protocol_id: int, cost_type: str,
    cost_date, amount: Decimal, description: str = '',
    project_name: str = '', budget_id: int = None, budget_item_id: int = None,
    reference_no: str = '', reference_type: str = '',
    staff_id: int = None, staff_name: str = '',
    work_hours: Decimal = None, hourly_rate: Decimal = None,
    created_by_id: int = None,
) -> CostRecord:
    return CostRecord.objects.create(
        record_no=record_no, protocol_id=protocol_id,
        project_name=project_name, cost_type=cost_type,
        cost_date=cost_date, amount=amount, description=description,
        budget_id=budget_id, budget_item_id=budget_item_id,
        reference_no=reference_no, reference_type=reference_type,
        staff_id=staff_id, staff_name=staff_name,
        work_hours=work_hours, hourly_rate=hourly_rate,
        created_by_id=created_by_id,
    )


def confirm_cost(record_id: int, confirmed_by_id: int = None) -> Optional[CostRecord]:
    """确认成本记录"""
    record = CostRecord.objects.filter(id=record_id, status=CostRecordStatus.PENDING).first()
    if not record:
        return None
    record.status = CostRecordStatus.CONFIRMED
    record.confirmed_by_id = confirmed_by_id
    record.confirmed_at = timezone.now()
    record.save(update_fields=['status', 'confirmed_by_id', 'confirmed_at', 'update_time'])

    # 更新关联预算实际金额
    if record.budget_id:
        from apps.finance.services.budget_service import update_budget_actuals
        update_budget_actuals(record.budget_id)

    return record


def cancel_cost(record_id: int) -> Optional[CostRecord]:
    record = CostRecord.objects.filter(id=record_id, status=CostRecordStatus.PENDING).first()
    if not record:
        return None
    record.status = CostRecordStatus.CANCELLED
    record.save(update_fields=['status', 'update_time'])
    return record


def list_costs(
    protocol_id: int = None, cost_type: str = None,
    status: str = None, page: int = 1, page_size: int = 20,
) -> dict:
    qs = CostRecord.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if cost_type:
        qs = qs.filter(cost_type=cost_type)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


def get_cost_summary(protocol_id: int) -> dict:
    """项目成本汇总"""
    qs = CostRecord.objects.filter(protocol_id=protocol_id, status=CostRecordStatus.CONFIRMED)
    total = qs.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    by_type = {}
    for ct in CostType.choices:
        val = qs.filter(cost_type=ct[0]).aggregate(s=Sum('amount'))['s'] or Decimal('0')
        by_type[ct[0]] = float(val)
    return {
        'protocol_id': protocol_id,
        'total_cost': float(total),
        'by_type': by_type,
    }
