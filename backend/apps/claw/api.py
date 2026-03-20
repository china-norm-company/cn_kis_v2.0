"""
Claw DataBus API — 为 Claw 技能提供统一数据访问

端点:
  GET  /claw/modules              — 列出可用模块
  GET  /claw/module/{name}        — 模块数据快照
  GET  /claw/entity/{type}/{id}   — 实体详情+关联
  POST /claw/search               — 跨模块搜索
  GET  /claw/audit-trail/{model}/{id} — 审计变更追踪
  GET  /claw/kpi-snapshot         — 全域 KPI 快照（15 模块）
"""
from ninja import Router, Schema
from typing import Optional, List

router = Router()


@router.get('/modules', summary='[DataBus] 列出可用模块')
def list_modules(request):
    from apps.claw.data_bus import list_modules
    modules = list_modules()
    return {'code': 200, 'msg': 'OK', 'data': {'modules': modules, 'total': len(modules)}}


@router.get('/module/{name}', summary='[DataBus] 模块数据快照')
def module_snapshot(request, name: str):
    from apps.claw.data_bus import get_module_snapshot
    snapshot = get_module_snapshot(name)
    if 'error' in snapshot and 'available' in snapshot:
        return {'code': 404, 'msg': f'未知模块: {name}', 'data': snapshot}
    return {'code': 200, 'msg': 'OK', 'data': {'module': name, 'snapshot': snapshot}}


@router.get('/entity/{entity_type}/{entity_id}', summary='[DataBus] 实体详情')
def entity_context(request, entity_type: str, entity_id: int):
    from apps.claw.data_bus import get_entity_context
    result = get_entity_context(entity_type, entity_id)
    if result.get('error') == 'not_found':
        return {'code': 404, 'msg': '实体不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': {'entity_type': entity_type, 'entity_id': entity_id, **result}}


class SearchIn(Schema):
    query: str
    modules: Optional[List[str]] = None


@router.post('/search', summary='[DataBus] 跨模块搜索')
def cross_search(request, data: SearchIn):
    from apps.claw.data_bus import cross_module_search
    result = cross_module_search(data.query, data.modules)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/audit-trail/{model_name}/{record_id}', summary='[DataBus] 审计变更追踪')
def audit_trail(request, model_name: str, record_id: int):
    from apps.claw.data_bus import get_audit_trail
    result = get_audit_trail(model_name, record_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/kpi-snapshot', summary='[DataBus] 全域 KPI 快照')
def full_kpi_snapshot(request):
    """15 个模块全域 KPI 快照，替代 notification/claw/kpi-snapshot 的 5 模块版本"""
    from datetime import date
    from apps.claw.data_bus import get_all_kpis
    kpis = get_all_kpis()
    return {'code': 200, 'msg': 'OK', 'data': {
        'date': str(date.today()),
        'module_count': len(kpis),
        'kpis': kpis,
    }}
