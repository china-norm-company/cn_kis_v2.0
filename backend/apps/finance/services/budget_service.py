"""
预算管理服务

FIN001：预算编制、审批、执行、跟踪
"""
import logging
from typing import Optional, Dict
from decimal import Decimal
from django.utils import timezone

from apps.finance.models import (
    BudgetCategory, ProjectBudget, BudgetItem, BudgetStatus,
)

logger = logging.getLogger(__name__)


def create_budget_category(
    code: str, name: str, category_type: str,
    parent_id: int = None, description: str = '',
) -> BudgetCategory:
    parent = BudgetCategory.objects.filter(id=parent_id).first() if parent_id else None
    level = (parent.level + 1) if parent else 1
    path = f'{parent.path}/{code}' if parent else code
    return BudgetCategory.objects.create(
        code=code, name=name, category_type=category_type,
        parent=parent, level=level, path=path, description=description,
    )


def list_budget_categories(category_type: str = None) -> list:
    qs = BudgetCategory.objects.filter(is_active=True)
    if category_type:
        qs = qs.filter(category_type=category_type)
    return list(qs)


def create_project_budget(
    budget_no: str, budget_name: str,
    protocol_id: int, project_name: str,
    budget_year: int, start_date, end_date,
    total_income: Decimal = Decimal('0'),
    total_cost: Decimal = Decimal('0'),
    total_expense: Decimal = Decimal('0'),
    client_id: int = None, client_name: str = '',
    created_by_id: int = None, notes: str = '',
) -> ProjectBudget:
    gross_profit = total_income - total_cost - total_expense
    gross_margin = (gross_profit / total_income * 100) if total_income else Decimal('0')

    return ProjectBudget.objects.create(
        budget_no=budget_no, budget_name=budget_name,
        protocol_id=protocol_id, project_name=project_name,
        budget_year=budget_year, start_date=start_date, end_date=end_date,
        total_income=total_income, total_cost=total_cost, total_expense=total_expense,
        gross_profit=gross_profit, gross_margin=round(gross_margin, 2),
        client_id=client_id, client_name=client_name,
        created_by_id=created_by_id, notes=notes,
    )


def add_budget_item(
    budget_id: int, category_id: int,
    budget_amount: Decimal, description: str = '',
) -> Optional[BudgetItem]:
    budget = ProjectBudget.objects.filter(id=budget_id).first()
    if not budget:
        return None
    return BudgetItem.objects.create(
        budget=budget, category_id=category_id,
        budget_amount=budget_amount, description=description,
    )


def submit_budget(budget_id: int) -> Optional[ProjectBudget]:
    """提交预算审批"""
    budget = ProjectBudget.objects.filter(id=budget_id, status=BudgetStatus.DRAFT).first()
    if not budget:
        return None
    budget.status = BudgetStatus.PENDING
    budget.submitted_at = timezone.now()
    budget.save(update_fields=['status', 'submitted_at', 'update_time'])

    # 飞书审批
    _create_feishu_approval(budget)
    return budget


def approve_budget(budget_id: int, approved_by_id: int = None, notes: str = '') -> Optional[ProjectBudget]:
    budget = ProjectBudget.objects.filter(id=budget_id, status=BudgetStatus.PENDING).first()
    if not budget:
        return None
    budget.status = BudgetStatus.APPROVED
    budget.approved_at = timezone.now()
    budget.approved_by_id = approved_by_id
    budget.approval_notes = notes
    budget.save(update_fields=['status', 'approved_at', 'approved_by_id', 'approval_notes', 'update_time'])
    return budget


def reject_budget(budget_id: int, notes: str = '') -> Optional[ProjectBudget]:
    budget = ProjectBudget.objects.filter(id=budget_id, status=BudgetStatus.PENDING).first()
    if not budget:
        return None
    budget.status = BudgetStatus.REJECTED
    budget.approval_notes = notes
    budget.save(update_fields=['status', 'approval_notes', 'update_time'])
    return budget


def start_execution(budget_id: int) -> Optional[ProjectBudget]:
    budget = ProjectBudget.objects.filter(id=budget_id, status=BudgetStatus.APPROVED).first()
    if not budget:
        return None
    budget.status = BudgetStatus.EXECUTING
    budget.save(update_fields=['status', 'update_time'])
    return budget


def update_budget_actuals(budget_id: int) -> Optional[ProjectBudget]:
    """从成本记录自动更新预算实际金额"""
    budget = ProjectBudget.objects.filter(id=budget_id).first()
    if not budget:
        return None

    from apps.finance.models import CostRecord, CostRecordStatus
    confirmed_costs = CostRecord.objects.filter(
        budget=budget, status=CostRecordStatus.CONFIRMED,
    )
    from django.db.models import Sum
    total = confirmed_costs.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    budget.actual_cost = total
    budget.save(update_fields=['actual_cost', 'update_time'])

    # 更新明细行差异
    for item in budget.items.all():
        item_costs = confirmed_costs.filter(budget_item=item)
        item.actual_amount = item_costs.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        item.variance = item.budget_amount - item.actual_amount
        if item.budget_amount:
            item.variance_rate = (item.variance / item.budget_amount * 100)
        item.save(update_fields=['actual_amount', 'variance', 'variance_rate', 'update_time'])

    return budget


def get_budget_detail(budget_id: int) -> Optional[Dict]:
    budget = ProjectBudget.objects.filter(id=budget_id).first()
    if not budget:
        return None
    items = BudgetItem.objects.filter(budget=budget).select_related('category')
    execution_rate = 0.0
    if budget.total_cost:
        execution_rate = float(budget.actual_cost / budget.total_cost * 100)

    return {
        'id': budget.id, 'budget_no': budget.budget_no,
        'budget_name': budget.budget_name, 'status': budget.status,
        'protocol_id': budget.protocol_id, 'project_name': budget.project_name,
        'budget_year': budget.budget_year,
        'start_date': str(budget.start_date), 'end_date': str(budget.end_date),
        'total_income': str(budget.total_income),
        'total_cost': str(budget.total_cost),
        'total_expense': str(budget.total_expense),
        'gross_profit': str(budget.gross_profit),
        'gross_margin': str(budget.gross_margin),
        'actual_income': str(budget.actual_income),
        'actual_cost': str(budget.actual_cost),
        'actual_expense': str(budget.actual_expense),
        'execution_rate': round(execution_rate, 1),
        'items': [{
            'id': i.id, 'category_code': i.category.code, 'category_name': i.category.name,
            'budget_amount': str(i.budget_amount), 'actual_amount': str(i.actual_amount),
            'variance': str(i.variance), 'variance_rate': str(i.variance_rate),
        } for i in items],
    }


def _create_feishu_approval(budget: ProjectBudget):
    """创建飞书预算审批"""
    try:
        from libs.feishu_client import feishu_client
        import os
        approval_code = os.getenv('FEISHU_APPROVAL_CODE_BUDGET', '')
        if not approval_code:
            return
        import json
        form_data = json.dumps([
            {'id': '1', 'value': budget.budget_no},
            {'id': '2', 'value': budget.budget_name},
            {'id': '3', 'value': str(budget.total_income)},
        ], ensure_ascii=False)
        result = feishu_client._request('POST', 'approval/v4/instances', json={
            'approval_code': approval_code,
            'form': form_data,
        })
        if result:
            # _request 已解包 data 层
            inst_id = result.get('instance_code', '')
            if inst_id:
                budget.feishu_approval_id = inst_id
                budget.save(update_fields=['feishu_approval_id'])
    except Exception as e:
        logger.error(f'预算审批创建失败: {e}')
