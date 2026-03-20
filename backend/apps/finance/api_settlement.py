"""
项目决算 API
"""
from ninja import Router
from typing import Optional

from apps.identity.decorators import _get_account_from_request, require_permission

router = Router()


@router.post('/generate/{protocol_id}', summary='生成项目决算')
@require_permission('finance.settlement.create')
def generate_settlement(request, protocol_id: int):
    from apps.finance.services.settlement_service import generate_settlement as svc
    account = _get_account_from_request(request)
    settlement = svc(protocol_id, created_by_id=account.id if account else None)
    if not settlement:
        return {'code': 400, 'msg': '生成决算失败', 'data': None}
    return {'code': 200, 'msg': '决算已生成', 'data': {
        'id': settlement.id,
        'settlement_no': settlement.settlement_no,
        'project_name': settlement.project_name,
        'contract_amount': str(settlement.contract_amount),
        'total_invoiced': str(settlement.total_invoiced),
        'total_received': str(settlement.total_received),
        'total_cost': str(settlement.total_cost),
        'gross_profit': str(settlement.gross_profit),
        'gross_margin': str(settlement.gross_margin),
        'budget_variance': str(settlement.budget_variance),
        'settlement_status': settlement.settlement_status,
    }}


@router.get('/list', summary='决算列表')
@require_permission('finance.settlement.read')
def list_settlements(request, protocol_id: Optional[int] = None, status: Optional[str] = None):
    from apps.finance.services.settlement_service import list_settlements as svc
    items = svc(protocol_id=protocol_id, status=status)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': s.id,
            'settlement_no': s.settlement_no,
            'protocol_id': s.protocol_id,
            'project_name': s.project_name,
            'contract_amount': str(s.contract_amount),
            'total_cost': str(s.total_cost),
            'gross_profit': str(s.gross_profit),
            'gross_margin': str(s.gross_margin),
            'settlement_status': s.settlement_status,
            'create_time': s.create_time.isoformat(),
        } for s in items],
    }}
