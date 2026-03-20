"""
预算预警引擎

检测预算科目执行率并触发预警。
"""
import logging
from decimal import Decimal
from apps.finance.models import ProjectBudget, BudgetItem, BudgetStatus

logger = logging.getLogger(__name__)

WARN_THRESHOLD = Decimal('80')
FREEZE_THRESHOLD = Decimal('100')


def check_budget_alerts(budget_id: int = None) -> list:
    """检测预算预警，返回预警列表"""
    alerts = []
    qs = ProjectBudget.objects.filter(status=BudgetStatus.EXECUTING)
    if budget_id:
        qs = qs.filter(id=budget_id)

    for budget in qs:
        for item in BudgetItem.objects.filter(budget=budget):
            if item.budget_amount <= 0:
                continue
            exec_rate = (item.actual_amount / item.budget_amount) * 100
            category_name = item.category.name if item.category else ''
            if exec_rate >= FREEZE_THRESHOLD:
                alerts.append({
                    'level': 'critical',
                    'budget_id': budget.id,
                    'budget_no': budget.budget_no,
                    'item_id': item.id,
                    'category_name': category_name,
                    'exec_rate': float(exec_rate),
                    'budget_amount': float(item.budget_amount),
                    'actual_amount': float(item.actual_amount),
                    'message': f'{budget.budget_no} - {category_name}: 执行率 {exec_rate:.1f}%，已冻结',
                })
            elif exec_rate >= WARN_THRESHOLD:
                alerts.append({
                    'level': 'warning',
                    'budget_id': budget.id,
                    'budget_no': budget.budget_no,
                    'item_id': item.id,
                    'category_name': category_name,
                    'exec_rate': float(exec_rate),
                    'budget_amount': float(item.budget_amount),
                    'actual_amount': float(item.actual_amount),
                    'message': f'{budget.budget_no} - {category_name}: 执行率 {exec_rate:.1f}%，请注意',
                })
    return alerts


def is_budget_frozen(budget_item_id: int) -> bool:
    """检查预算科目是否冻结（执行率>=100%）"""
    item = BudgetItem.objects.filter(id=budget_item_id).first()
    if not item or item.budget_amount <= 0:
        return False
    return (item.actual_amount / item.budget_amount) * 100 >= FREEZE_THRESHOLD
