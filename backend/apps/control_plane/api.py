from ninja import Router

from apps.identity.decorators import require_permission
from . import services
from .schemas import TicketTransitionIn

router = Router()


@router.get('/dashboard-summary', summary='控制台总览摘要')
@require_permission('control.dashboard.read')
def get_dashboard_summary(request):
    return {
        'code': 200,
        'msg': 'OK',
        'data': services.get_dashboard_summary(),
    }


@router.get('/objects', summary='控制台对象列表')
@require_permission('control.object.read')
def list_objects(request):
    return {'code': 200, 'msg': 'OK', 'data': {'items': services.list_managed_objects()}}


@router.get('/objects/{object_id}', summary='控制台对象详情')
@require_permission('control.object.read')
def get_object_detail(request, object_id: str):
    item = services.get_object_detail(object_id)
    if not item:
        return 404, {'code': 404, 'msg': '对象不存在'}
    return {'code': 200, 'msg': 'OK', 'data': item}


@router.get('/objects/{object_id}/events', summary='控制台对象关联事件')
@require_permission('control.object.read')
def get_object_events(request, object_id: str):
    item = services.get_object_detail(object_id)
    if not item:
        return 404, {'code': 404, 'msg': '对象不存在'}
    events = services.get_object_events(object_id)
    return {'code': 200, 'msg': 'OK', 'data': {'items': events}}


@router.get('/events', summary='控制台事件列表')
@require_permission('control.event.read')
def list_events(request):
    return {'code': 200, 'msg': 'OK', 'data': {'items': services.list_unified_events()}}


@router.get('/events/{event_id}', summary='控制台事件详情')
@require_permission('control.event.read')
def get_event_detail(request, event_id: str):
    item = services.get_event_detail(event_id)
    if not item:
        return 404, {'code': 404, 'msg': '事件不存在'}
    return {'code': 200, 'msg': 'OK', 'data': item}


@router.get('/events/{event_id}/tickets', summary='控制台事件关联工单')
@require_permission('control.ticket.read')
def get_event_tickets(request, event_id: str):
    item = services.get_event_detail(event_id)
    if not item:
        return 404, {'code': 404, 'msg': '事件不存在'}
    related_tickets = services.get_event_tickets(event_id)
    return {'code': 200, 'msg': 'OK', 'data': {'items': related_tickets}}


@router.get('/tickets', summary='控制台工单列表')
@require_permission('control.ticket.read')
def list_tickets(request):
    return {'code': 200, 'msg': 'OK', 'data': {'items': services.list_tickets()}}


@router.get('/tickets/{ticket_id}', summary='控制台工单详情')
@require_permission('control.ticket.read')
def get_ticket_detail(request, ticket_id: str):
    item = services.get_ticket_detail(ticket_id)
    if not item:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': item}


@router.post('/tickets/{ticket_id}/transition', summary='工单状态流转')
@require_permission('control.ticket.read')
def ticket_transition(request, ticket_id: str, payload: TicketTransitionIn):
    new_status = (payload.status or '').strip().lower()
    if not new_status:
        return 400, {'code': 400, 'msg': '缺少 status'}
    item = services.ticket_transition(ticket_id, new_status)
    if not item:
        return 404, {'code': 404, 'msg': '工单不存在或状态无效'}
    return {'code': 200, 'msg': 'OK', 'data': item}


@router.get('/network/snapshot', summary='网络设备快照（核心交换机+拓扑）')
@require_permission('control.network.read')
def get_network_snapshot(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_network_snapshot()}


@router.get('/management-blueprint', summary='统一资源治理蓝图')
@require_permission('control.dashboard.read')
def get_management_blueprint(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_management_blueprint()}


@router.post('/refresh-runtime-checks', summary='刷新治理巡检缓存')
@require_permission('control.dashboard.read')
def refresh_runtime_checks(request):
    services.clear_runtime_checks_cache()
    return {'code': 200, 'msg': 'OK', 'data': {'refreshed': True}}


@router.get('/resource-health', summary='统一资源健康概览（按8大类别分组，含实时采集数据）')
@require_permission('control.dashboard.read')
def get_resource_health(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_resource_health_overview()}


@router.get('/dependency-check', summary='平台依赖自检（检查核心依赖资源是否就绪）')
@require_permission('control.dashboard.read')
def get_dependency_check(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_dependency_check()}


@router.get('/scenarios', summary='业务场景列表（含就绪摘要）')
@require_permission('control.dashboard.read')
def list_scenarios(request):
    return {'code': 200, 'msg': 'OK', 'data': {'items': services.get_scenarios()}}


@router.get('/scenarios/{scenario_id}', summary='业务场景详情')
@require_permission('control.dashboard.read')
def get_scenario_detail(request, scenario_id: str):
    item = services.get_scenario_detail(scenario_id)
    if not item:
        return 404, {'code': 404, 'msg': '场景不存在'}
    return {'code': 200, 'msg': 'OK', 'data': item}


@router.get('/scenarios/{scenario_id}/topology', summary='场景拓扑（节点与边）')
@require_permission('control.dashboard.read')
def get_scenario_topology(request, scenario_id: str):
    data = services.get_scenario_topology(scenario_id)
    if not data:
        return 404, {'code': 404, 'msg': '场景不存在'}
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/objects/{object_id}/dependencies', summary='对象依赖（依赖谁、被谁依赖）')
@require_permission('control.object.read')
def get_object_dependencies(request, object_id: str):
    if not services.get_object_detail(object_id):
        return 404, {'code': 404, 'msg': '对象不存在'}
    return {'code': 200, 'msg': 'OK', 'data': services.get_object_dependencies(object_id)}


@router.get('/events/{event_id}/impact', summary='事件业务影响')
@require_permission('control.event.read')
def get_event_impact(request, event_id: str):
    data = services.get_event_impact(event_id)
    if not data:
        return 404, {'code': 404, 'msg': '事件不存在'}
    return {'code': 200, 'msg': 'OK', 'data': data}
