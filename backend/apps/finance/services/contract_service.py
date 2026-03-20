"""
合同服务增强

付款条款管理、合同变更、合同签署→自动生成回款计划。
"""
import logging
from typing import Optional
from decimal import Decimal
from datetime import timedelta

from apps.finance.models import (
    Contract, ContractStatus,
    ContractPaymentTerm, ContractChange, ContractChangeStatus,
    PaymentPlan,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 付款条款
# ============================================================================
def add_payment_term(
    contract_id: int, milestone: str, percentage: Decimal,
    amount: Decimal, payment_days: int = 30,
    trigger_condition: str = '', sort_order: int = 0,
) -> Optional[ContractPaymentTerm]:
    contract = Contract.objects.filter(id=contract_id, is_deleted=False).first()
    if not contract:
        return None
    return ContractPaymentTerm.objects.create(
        contract=contract, milestone=milestone,
        percentage=percentage, amount=amount,
        payment_days=payment_days,
        trigger_condition=trigger_condition,
        sort_order=sort_order,
    )


def list_payment_terms(contract_id: int) -> list:
    return list(
        ContractPaymentTerm.objects.filter(contract_id=contract_id)
        .order_by('sort_order')
    )


def delete_payment_term(term_id: int) -> bool:
    term = ContractPaymentTerm.objects.filter(id=term_id).first()
    if not term:
        return False
    term.delete()
    return True


# ============================================================================
# 合同变更
# ============================================================================
def _next_change_no(contract: Contract) -> str:
    count = ContractChange.objects.filter(contract=contract).count()
    return f'{contract.code}-CHG{count + 1:03d}'


def create_contract_change(
    contract_id: int, change_type: str, reason: str,
    original_amount: Decimal = None, new_amount: Decimal = None,
    description: str = '', created_by_id: int = None,
) -> Optional[ContractChange]:
    contract = Contract.objects.filter(id=contract_id, is_deleted=False).first()
    if not contract:
        return None
    change_no = _next_change_no(contract)
    return ContractChange.objects.create(
        contract=contract, change_no=change_no,
        change_type=change_type, reason=reason,
        original_amount=original_amount,
        new_amount=new_amount,
        description=description,
        created_by_id=created_by_id,
    )


def approve_contract_change(change_id: int) -> Optional[ContractChange]:
    change = ContractChange.objects.filter(
        id=change_id,
        approval_status=ContractChangeStatus.SUBMITTED,
    ).select_related('contract').first()
    if not change:
        return None

    change.approval_status = ContractChangeStatus.APPROVED
    change.save(update_fields=['approval_status', 'update_time'])

    if change.new_amount is not None:
        contract = change.contract
        contract.amount = change.new_amount
        contract.save(update_fields=['amount', 'update_time'])

    return change


def reject_contract_change(change_id: int) -> Optional[ContractChange]:
    change = ContractChange.objects.filter(
        id=change_id,
        approval_status=ContractChangeStatus.SUBMITTED,
    ).first()
    if not change:
        return None
    change.approval_status = ContractChangeStatus.REJECTED
    change.save(update_fields=['approval_status', 'update_time'])
    return change


def list_contract_changes(contract_id: int) -> list:
    return list(
        ContractChange.objects.filter(contract_id=contract_id)
        .order_by('-create_time')
    )


# ============================================================================
# 合同签署 → 自动生成回款计划
# ============================================================================
def generate_payment_plans_from_contract(contract_id: int) -> list:
    """合同签署后根据付款条款自动生成回款计划"""
    contract = Contract.objects.filter(id=contract_id, is_deleted=False).first()
    if not contract:
        return []

    terms = ContractPaymentTerm.objects.filter(contract=contract).order_by('sort_order')
    if not terms.exists():
        return []

    plans = []
    base_date = contract.signed_date or contract.start_date
    if not base_date:
        from datetime import date as date_type
        base_date = date_type.today()

    for idx, term in enumerate(terms, 1):
        plan_no = f'PP-{contract.code}-{idx:03d}'

        if PaymentPlan.objects.filter(plan_no=plan_no).exists():
            continue

        planned_date = base_date + timedelta(days=term.payment_days * idx)

        plan = PaymentPlan.objects.create(
            plan_no=plan_no,
            protocol_id=contract.protocol_id or 0,
            project_name=contract.project,
            contract=contract,
            client_id=contract.client_id,
            client_name=contract.client,
            milestone=term.milestone,
            planned_date=planned_date,
            planned_amount=term.amount,
            remaining_amount=term.amount,
        )
        plans.append(plan)

    return plans
