"""
项目决算服务
"""
import logging
from typing import Optional
from decimal import Decimal
from django.db.models import Sum

from apps.finance.models import (
    Contract, Invoice, InvoiceStatus,
    CostRecord, CostRecordStatus, ProjectBudget,
    PaymentRecord, PaymentRecordStatus,
)
from apps.finance.models_settlement import ProjectSettlement

logger = logging.getLogger(__name__)


def generate_settlement(protocol_id: int, created_by_id: int = None) -> Optional[ProjectSettlement]:
    """生成项目决算"""
    contract = Contract.objects.filter(
        protocol_id=protocol_id, is_deleted=False,
    ).order_by('-amount').first()

    contract_amount = contract.amount if contract else Decimal('0')
    project_name = contract.project if contract else ''

    total_invoiced = Invoice.objects.filter(
        contract__protocol_id=protocol_id, is_deleted=False,
        status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
    ).aggregate(total=Sum('total'))['total'] or Decimal('0')

    total_received = PaymentRecord.objects.filter(
        protocol_id=protocol_id,
        status=PaymentRecordStatus.CONFIRMED,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    total_cost = CostRecord.objects.filter(
        protocol_id=protocol_id,
        status=CostRecordStatus.CONFIRMED,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    gross_profit = contract_amount - total_cost
    gross_margin = (gross_profit / contract_amount * 100) if contract_amount > 0 else Decimal('0')

    budget = ProjectBudget.objects.filter(protocol_id=protocol_id).first()
    budget_cost = budget.total_cost if budget else Decimal('0')
    budget_variance = total_cost - budget_cost

    count = ProjectSettlement.objects.filter(protocol_id=protocol_id).count()
    settlement_no = f'SET-{protocol_id:04d}-{count + 1:03d}'

    settlement = ProjectSettlement.objects.create(
        settlement_no=settlement_no,
        protocol_id=protocol_id,
        project_name=project_name,
        contract_amount=contract_amount,
        total_invoiced=total_invoiced,
        total_received=total_received,
        total_cost=total_cost,
        gross_profit=gross_profit,
        gross_margin=gross_margin,
        budget_variance=budget_variance,
        created_by_id=created_by_id,
        settlement_report={
            'contract_amount': float(contract_amount),
            'total_invoiced': float(total_invoiced),
            'total_received': float(total_received),
            'total_cost': float(total_cost),
            'gross_profit': float(gross_profit),
            'gross_margin': float(gross_margin),
            'budget_cost': float(budget_cost),
            'budget_variance': float(budget_variance),
        },
    )
    return settlement


def list_settlements(protocol_id: int = None, status: str = None) -> list:
    qs = ProjectSettlement.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(settlement_status=status)
    return list(qs[:50])
