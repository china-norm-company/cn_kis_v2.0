"""
审批流程 API

S4-9
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services

router = Router()


class WorkflowDefCreateIn(Schema):
    name: str
    code: str
    business_type: str
    description: Optional[str] = ''
    steps: List[dict]
    feishu_approval_code: Optional[str] = ''


class WorkflowStartIn(Schema):
    definition_code: str
    business_type: str
    business_id: int
    title: str
    form_data: Optional[dict] = None


class ApproveIn(Schema):
    comment: Optional[str] = ''


@router.post('/definitions/create', summary='创建流程定义')
@require_permission('workflow.definition.create')
def create_definition(request, data: WorkflowDefCreateIn):
    defn = services.create_definition(
        name=data.name, code=data.code, business_type=data.business_type,
        steps=data.steps, description=data.description or '',
        feishu_approval_code=data.feishu_approval_code or '',
    )
    return {'code': 200, 'msg': '流程定义已创建', 'data': {
        'id': defn.id, 'code': defn.code, 'name': defn.name,
    }}


@router.get('/definitions/list', summary='流程定义列表')
@require_permission('workflow.definition.read')
def list_definitions(request):
    from .models import WorkflowDefinition
    defs = WorkflowDefinition.objects.all()
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': d.id, 'code': d.code, 'name': d.name,
            'business_type': d.business_type, 'status': d.status,
        } for d in defs],
    }}


@router.post('/start', summary='发起审批')
@require_permission('workflow.instance.create')
def start_workflow(request, data: WorkflowStartIn):
    account = _get_account_from_request(request)
    instance = services.start_workflow(
        definition_code=data.definition_code,
        business_type=data.business_type,
        business_id=data.business_id,
        title=data.title,
        initiator_id=account.id if account else 0,
        form_data=data.form_data,
    )
    if not instance:
        return 400, {'code': 400, 'msg': '流程定义不存在或已停用'}
    return {'code': 200, 'msg': '审批已发起', 'data': {
        'id': instance.id, 'status': instance.status,
    }}


@router.post('/instances/{instance_id}/approve', summary='审批通过')
@require_permission('workflow.instance.approve')
def approve_instance(request, instance_id: int, data: ApproveIn):
    account = _get_account_from_request(request)
    instance = services.approve(instance_id, account.id if account else 0, data.comment or '')
    if not instance:
        return 404, {'code': 404, 'msg': '审批实例不存在'}
    return {'code': 200, 'msg': '已审批', 'data': {
        'id': instance.id, 'status': instance.status, 'current_step': instance.current_step,
    }}


@router.post('/instances/{instance_id}/reject', summary='审批驳回')
@require_permission('workflow.instance.approve')
def reject_instance(request, instance_id: int, data: ApproveIn):
    account = _get_account_from_request(request)
    instance = services.reject(instance_id, account.id if account else 0, data.comment or '')
    if not instance:
        return 404, {'code': 404, 'msg': '审批实例不存在'}
    return {'code': 200, 'msg': '已驳回', 'data': {'id': instance.id, 'status': instance.status}}


@router.get('/instances/{instance_id}', summary='审批详情')
@require_permission('workflow.instance.read')
def get_instance(request, instance_id: int):
    detail = services.get_instance_detail(instance_id)
    if not detail:
        return 404, {'code': 404, 'msg': '审批实例不存在'}
    return {'code': 200, 'msg': 'OK', 'data': detail}


# ============================================================================
# 变更管理专用端点
# ============================================================================
CHANGE_BUSINESS_TYPES = ('protocol_amendment', 'schedule_change', 'deviation_escalation')


class ChangeCreateIn(Schema):
    definition_code: Optional[str] = ''
    business_type: str
    business_id: Optional[int] = None
    title: str
    form_data: Optional[dict] = None


@router.post('/changes/create', summary='发起变更')
@require_permission('workflow.instance.create')
def create_change(request, data: ChangeCreateIn):
    """发起变更（方案修正/排程变更/偏差升级）"""
    account = _get_account_from_request(request)
    if data.business_type not in CHANGE_BUSINESS_TYPES:
        return 400, {'code': 400, 'msg': f'不支持的变更类型: {data.business_type}'}

    # 如果有 definition_code 走正式审批流，否则直接创建记录
    from .models import WorkflowInstance, InstanceStatus
    if data.definition_code:
        instance = services.start_workflow(
            definition_code=data.definition_code,
            business_type=data.business_type,
            business_id=data.business_id or 0,
            title=data.title,
            initiator_id=account.id if account else 0,
            form_data=data.form_data,
        )
        if not instance:
            return 400, {'code': 400, 'msg': '流程定义不存在或已停用'}
    else:
        # 无审批流程的简单变更记录
        instance = WorkflowInstance.objects.create(
            definition=None,
            business_type=data.business_type,
            business_id=data.business_id or 0,
            title=data.title,
            initiator_id=account.id if account else 0,
            form_data=data.form_data or {},
            current_step=0,
            status=InstanceStatus.PENDING,
        )
    # 触发飞书审批 + 站内通知
    try:
        from libs.feishu_approval import create_change_request_approval
        from apps.notification.services import send_notification

        change_type_labels = {
            'protocol_amendment': '方案修正',
            'schedule_change': '排程变更',
            'deviation_escalation': '偏差升级',
        }
        initiator_open_id = ''
        if account:
            initiator_open_id = getattr(account, 'feishu_open_id', '') or ''

        if initiator_open_id:
            approval_instance_id = create_change_request_approval(
                open_id=initiator_open_id,
                title=data.title or f'变更请求#{instance.id}',
                change_type=change_type_labels.get(data.business_type, data.business_type),
                description=(data.form_data or {}).get('description', ''),
                impact_assessment=(data.form_data or {}).get('impact', ''),
            )
            if approval_instance_id:
                instance.feishu_approval_instance_id = approval_instance_id
                instance.save(update_fields=['feishu_approval_instance_id'])
    except Exception:
        pass

    return {'code': 200, 'msg': '变更已创建', 'data': {
        'id': instance.id, 'status': instance.status,
    }}


@router.get('/changes/list', summary='变更列表')
@require_permission('workflow.instance.read')
def list_changes(
    request,
    business_type: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """变更列表（筛选类型/状态）"""
    from .models import WorkflowInstance
    qs = WorkflowInstance.objects.filter(
        business_type__in=CHANGE_BUSINESS_TYPES,
    ).order_by('-create_time')
    if business_type:
        qs = qs.filter(business_type=business_type)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': i.id,
            'title': i.title,
            'business_type': i.business_type,
            'business_id': i.business_id,
            'status': i.status,
            'current_step': i.current_step,
            'initiator_id': i.initiator_id,
            'create_time': i.create_time.isoformat(),
        } for i in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }}


@router.get('/changes/{instance_id}/impact', summary='变更影响分析')
@require_permission('workflow.instance.read')
def get_change_impact(request, instance_id: int):
    """获取变更影响分析结果"""
    from .models import WorkflowInstance
    from .services.impact_analysis_service import ImpactAnalysisService

    instance = WorkflowInstance.objects.filter(id=instance_id).first()
    if not instance:
        return 404, {'code': 404, 'msg': '变更不存在'}

    try:
        if instance.business_type == 'protocol_amendment':
            result = ImpactAnalysisService.analyze_protocol_change(
                protocol_id=instance.business_id,
                change_type=instance.business_type,
            )
        elif instance.business_type == 'schedule_change':
            result = ImpactAnalysisService.analyze_schedule_change(
                schedule_plan_id=instance.business_id,
            )
        else:
            result = {
                'affected_slots': 0,
                'affected_work_orders': 0,
                'affected_enrollments': 0,
            }
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}

    return {'code': 200, 'msg': 'OK', 'data': result}
