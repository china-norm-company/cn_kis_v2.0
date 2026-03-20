"""
结项管理 API

端点：
- POST /closeout/initiate              发起结项
- GET  /closeout/list                   结项列表
- GET  /closeout/{id}                   结项详情
- POST /closeout/{id}/auto-check        触发自动检查
- POST /closeout/{id}/checklist/{item_id}/confirm  手动确认检查项
- POST /closeout/{id}/retrospective     创建复盘
- POST /closeout/{id}/acceptance        更新客户验收
- POST /closeout/{id}/archive           归档项目
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from django.utils import timezone

from . import services
from .models import (
    ProjectCloseout, CloseoutChecklist, ProjectRetrospective,
    ClientAcceptance, AcceptanceStatus,
)
from apps.identity.decorators import _get_account_from_request, require_permission

router = Router()


# ============================================================================
# Schema
# ============================================================================
class CloseoutInitiateIn(Schema):
    protocol_id: int
    notes: Optional[str] = ''


class CloseoutListParams(Schema):
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ChecklistConfirmIn(Schema):
    notes: Optional[str] = ''


class RetrospectiveCreateIn(Schema):
    what_went_well: List[str] = []
    what_to_improve: List[str] = []
    action_items: List[str] = []
    lessons_learned: List[str] = []


class AcceptanceUpdateIn(Schema):
    client_id: Optional[int] = None
    deliverables: List[dict] = []
    acceptance_status: str = 'pending'
    signed_by: Optional[str] = ''
    notes: Optional[str] = ''


# ============================================================================
# 辅助函数
# ============================================================================
def _closeout_to_dict(c: ProjectCloseout) -> dict:
    return {
        'id': c.id,
        'protocol_id': c.protocol_id,
        'protocol_title': c.protocol.title if c.protocol else '',
        'status': c.status,
        'initiated_by_id': c.initiated_by_id,
        'initiated_at': c.initiated_at.isoformat() if c.initiated_at else None,
        'archived_at': c.archived_at.isoformat() if c.archived_at else None,
        'notes': c.notes,
        'create_time': c.create_time.isoformat(),
        'update_time': c.update_time.isoformat(),
    }


def _checklist_to_dict(item: CloseoutChecklist) -> dict:
    return {
        'id': item.id,
        'group': item.group,
        'item_code': item.item_code,
        'item_description': item.item_description,
        'is_auto_check': item.is_auto_check,
        'auto_check_passed': item.auto_check_passed,
        'is_manually_confirmed': item.is_manually_confirmed,
        'confirmed_by_id': item.confirmed_by_id,
        'confirmed_at': item.confirmed_at.isoformat() if item.confirmed_at else None,
        'notes': item.notes,
    }


def _retrospective_to_dict(r: ProjectRetrospective) -> dict:
    knowledge_entry_id = None
    knowledge_entry_status = None
    try:
        from apps.knowledge.models import KnowledgeEntry
        entry = KnowledgeEntry.objects.filter(
            source_type='project_retrospective',
            source_id=r.id,
            is_deleted=False,
        ).only('id', 'status').first()
        if entry:
            knowledge_entry_id = entry.id
            knowledge_entry_status = entry.status
    except Exception:
        pass
    return {
        'id': r.id,
        'closeout_id': r.closeout_id,
        'what_went_well': r.what_went_well,
        'what_to_improve': r.what_to_improve,
        'action_items': r.action_items,
        'lessons_learned': r.lessons_learned,
        'created_by_id': r.created_by_id,
        'create_time': r.create_time.isoformat(),
        'update_time': r.update_time.isoformat(),
        'knowledge_entry_id': knowledge_entry_id,
        'knowledge_entry_status': knowledge_entry_status,
    }


def _acceptance_to_dict(a: ClientAcceptance) -> dict:
    return {
        'id': a.id,
        'closeout_id': a.closeout_id,
        'client_id': a.client_id,
        'client_name': a.client.name if a.client else '',
        'deliverables': a.deliverables,
        'acceptance_status': a.acceptance_status,
        'signed_at': a.signed_at.isoformat() if a.signed_at else None,
        'signed_by': a.signed_by,
        'notes': a.notes,
        'create_time': a.create_time.isoformat(),
        'update_time': a.update_time.isoformat(),
    }


# ============================================================================
# API 端点
# ============================================================================
@router.post('/initiate', summary='发起结项')
@require_permission('closeout.manage')
def initiate_closeout(request, data: CloseoutInitiateIn):
    account = _get_account_from_request(request)
    closeout = services.initiate_closeout(
        protocol_id=data.protocol_id,
        initiated_by_id=account.id if account else None,
    )
    if data.notes:
        closeout.notes = data.notes
        closeout.save(update_fields=['notes'])
    return {'code': 200, 'msg': '结项已发起', 'data': _closeout_to_dict(closeout)}


@router.get('/list', summary='结项列表')
@require_permission('closeout.read')
def list_closeouts(request, params: CloseoutListParams = Query(...)):
    result = services.list_closeouts(
        page=params.page, page_size=params.page_size,
        status=params.status,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_closeout_to_dict(c) for c in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/{closeout_id}', summary='结项详情')
@require_permission('closeout.read')
def get_closeout(request, closeout_id: int):
    detail = services.get_closeout(closeout_id)
    if not detail:
        return 404, {'code': 404, 'msg': '结项记录不存在'}

    c = detail['closeout']
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            **_closeout_to_dict(c),
            'checklists': [_checklist_to_dict(item) for item in detail['checklists']],
            'retrospectives': [_retrospective_to_dict(r) for r in detail['retrospectives']],
            'acceptances': [_acceptance_to_dict(a) for a in detail['acceptances']],
        },
    }


@router.post('/{closeout_id}/auto-check', summary='触发自动检查')
@require_permission('closeout.manage')
def auto_check(request, closeout_id: int):
    result = services.auto_check_completeness(closeout_id)
    if result['checked'] == 0:
        return 404, {'code': 404, 'msg': '结项记录不存在或无自动检查项'}
    return {'code': 200, 'msg': '自动检查完成', 'data': result}


@router.post('/{closeout_id}/checklist/{item_id}/confirm', summary='手动确认检查项')
@require_permission('closeout.manage')
def confirm_checklist(request, closeout_id: int, item_id: int, data: ChecklistConfirmIn):
    account = _get_account_from_request(request)
    item = CloseoutChecklist.objects.filter(
        id=item_id, closeout_id=closeout_id,
    ).first()
    if not item:
        return 404, {'code': 404, 'msg': '检查项不存在'}

    item.is_manually_confirmed = True
    item.confirmed_by_id = account.id if account else None
    item.confirmed_at = timezone.now()
    if data.notes:
        item.notes = data.notes
    item.save(update_fields=[
        'is_manually_confirmed', 'confirmed_by_id', 'confirmed_at', 'notes', 'update_time',
    ])

    return {'code': 200, 'msg': '检查项已确认', 'data': _checklist_to_dict(item)}


@router.post('/{closeout_id}/retrospective', summary='创建复盘')
@require_permission('closeout.manage')
def create_retrospective(request, closeout_id: int, data: RetrospectiveCreateIn):
    account = _get_account_from_request(request)
    retro = services.create_retrospective(
        closeout_id=closeout_id,
        what_went_well=data.what_went_well,
        what_to_improve=data.what_to_improve,
        action_items=data.action_items,
        lessons_learned=data.lessons_learned,
        created_by_id=account.id if account else None,
    )
    if not retro:
        return 404, {'code': 404, 'msg': '结项记录不存在'}

    # 经营复盘知识沉淀：复盘创建后自动入库为 KnowledgeEntry（pending_review）
    try:
        _deposit_retrospective_to_knowledge(retro, account)
    except Exception as _exc:
        import logging as _log
        _log.getLogger(__name__).warning('Knowledge deposit skipped for retro %s: %s', retro.id, _exc)

    return {'code': 200, 'msg': '复盘已创建', 'data': _retrospective_to_dict(retro)}


def _estimate_retrospective_quality_score(retro) -> int:
    """
    根据复盘填写完整度估算知识条目质量分（0-100）。
    - 基准 40 分
    - 有经验教训 +20（最多 40 条限 20 分）
    - 有改进项 +15
    - 有做得好的方面 +10
    - 有行动项 +10
    - 条目数量奖励：总条目 >= 5 +5
    """
    score = 40
    lessons = list(retro.lessons_learned or [])
    improve = list(retro.what_to_improve or [])
    well = list(retro.what_went_well or [])
    actions = list(retro.action_items or [])
    if lessons:
        score += min(20, 5 + len(lessons) * 3)
    if improve:
        score += 15
    if well:
        score += 10
    if actions:
        score += 10
    total = len(lessons) + len(improve) + len(well) + len(actions)
    if total >= 5:
        score += 5
    return min(100, score)


def _deposit_retrospective_to_knowledge(retro, account=None) -> None:
    """
    将项目复盘内容自动沉淀为 KnowledgeEntry（状态 pending_review）。
    失败只记日志，不影响复盘创建的主路径。
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)
    try:
        from apps.knowledge import services as knowledge_services
        from apps.knowledge.models import EntryStatus, EntryType, KnowledgeEntry, OntologyNamespace

        closeout = retro.closeout
        protocol = closeout.protocol if closeout else None
        protocol_title = protocol.title[:60] if protocol else f'结项#{retro.closeout_id}'

        well = list(retro.what_went_well or [])
        improve = list(retro.what_to_improve or [])
        lessons = list(retro.lessons_learned or [])
        actions = list(retro.action_items or [])

        content_lines = [
            f'关联协议：{protocol_title}',
            f'结项 ID：{retro.closeout_id}',
            '',
            '【做得好的方面】',
        ]
        for item in well:
            content_lines.append(f'- {item}')
        content_lines.append('')
        content_lines.append('【需要改进的方面】')
        for item in improve:
            content_lines.append(f'- {item}')
        content_lines.append('')
        content_lines.append('【经验教训】')
        for item in lessons:
            content_lines.append(f'- {item}')
        content_lines.append('')
        content_lines.append('【行动项】')
        for item in actions:
            content_lines.append(f'- {item}')

        summary_parts = []
        if lessons:
            summary_parts.append('教训：' + '；'.join(str(l) for l in lessons[:3]))
        if improve:
            summary_parts.append('改进：' + '；'.join(str(i) for i in improve[:2]))
        summary = '。'.join(summary_parts) if summary_parts else f'项目「{protocol_title}」复盘总结'

        tags = ['project_retrospective', 'lesson_learned']
        if lessons:
            tags.append('knowledge_candidate')

        entry = knowledge_services.create_entry(
            entry_type=EntryType.LESSON_LEARNED,
            title=f'[复盘] {protocol_title}',
            content='\n'.join(content_lines),
            summary=summary[:255],
            tags=tags,
            source_type='project_retrospective',
            source_id=retro.id,
            source_key=f'retrospective:{retro.id}',
            created_by_id=account.id if account else None,
        )
        KnowledgeEntry.objects.filter(id=entry.id).update(
            status=EntryStatus.PENDING_REVIEW,
            is_published=False,
            namespace=OntologyNamespace.PROJECT_EXPERIENCE,
            uri=f'cnkis:retrospective/{retro.id}',
            quality_score=_estimate_retrospective_quality_score(retro),
        )
        _logger.info('Retrospective %s deposited as KnowledgeEntry %s (pending_review)', retro.id, entry.id)
    except Exception as exc:
        _logger.warning('_deposit_retrospective_to_knowledge failed for retro %s: %s', retro.id, exc)


@router.post('/{closeout_id}/acceptance', summary='更新客户验收')
@require_permission('closeout.manage')
def update_acceptance(request, closeout_id: int, data: AcceptanceUpdateIn):
    closeout = ProjectCloseout.objects.filter(id=closeout_id).first()
    if not closeout:
        return 404, {'code': 404, 'msg': '结项记录不存在'}

    acceptance, created = ClientAcceptance.objects.get_or_create(
        closeout=closeout,
        defaults={
            'client_id': data.client_id,
            'deliverables': data.deliverables,
            'acceptance_status': data.acceptance_status,
            'signed_by': data.signed_by or '',
            'notes': data.notes or '',
        },
    )

    if not created:
        if data.client_id is not None:
            acceptance.client_id = data.client_id
        acceptance.deliverables = data.deliverables
        acceptance.acceptance_status = data.acceptance_status
        if data.signed_by:
            acceptance.signed_by = data.signed_by
        if data.notes:
            acceptance.notes = data.notes
        if data.acceptance_status == AcceptanceStatus.ACCEPTED:
            acceptance.signed_at = timezone.now()
        acceptance.save()

    return {'code': 200, 'msg': '客户验收已更新', 'data': _acceptance_to_dict(acceptance)}


@router.post('/{closeout_id}/archive', summary='归档项目')
@require_permission('closeout.manage')
def archive_project(request, closeout_id: int):
    result = services.archive_project(closeout_id)
    if not result['success']:
        return 400, {'code': 400, 'msg': result['msg'], 'data': result.get('incomplete_items')}
    return {'code': 200, 'msg': result['msg'], 'data': None}
