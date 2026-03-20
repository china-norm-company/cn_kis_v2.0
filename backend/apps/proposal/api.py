"""
方案准备工作流 API

端点：
- 方案: /proposal/create|create-from-opportunity|list|{id}
- 版本: /proposal/{id}/versions/create|list
- 清单: /proposal/{id}/checklist/update|status
- 审查: /proposal/{id}/submit-review|finalize
- 沟通: /proposal/communications/create|list
"""
import logging
from decimal import Decimal
from datetime import datetime
from typing import Optional, List

from django.conf import settings
from ninja import Router, Schema, Query

from . import services
from apps.identity.decorators import _get_account_from_request, require_permission

router = Router(tags=['proposal'])
logger = logging.getLogger(__name__)


# ============================================================================
# Schema
# ============================================================================
class ProposalCreateIn(Schema):
    title: str
    client_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    description: Optional[str] = ''
    product_category: Optional[str] = ''
    test_methods: Optional[List[str]] = None
    sample_size_estimate: Optional[int] = None
    estimated_duration_days: Optional[int] = None
    estimated_amount: Optional[Decimal] = None


class ProposalFromOpportunityIn(Schema):
    opportunity_id: int


class ProposalQueryParams(Schema):
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class VersionCreateIn(Schema):
    version_number: str
    change_summary: Optional[str] = ''
    file_path: Optional[str] = ''
    feishu_doc_token: Optional[str] = ''


class ChecklistUpdateIn(Schema):
    item_name: str
    is_completed: bool
    notes: Optional[str] = ''


class SubmitReviewIn(Schema):
    review_type: str  # 'internal' or 'client'


class CommunicationCreateIn(Schema):
    comm_type: str
    subject: str
    summary: Optional[str] = ''
    client_id: Optional[int] = None
    proposal_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    protocol_id: Optional[int] = None
    participants: Optional[List[str]] = None
    occurred_at: Optional[datetime] = None


class CommunicationQueryParams(Schema):
    client_id: Optional[int] = None
    proposal_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 辅助函数
# ============================================================================
def _safe_iso(dt) -> Optional[str]:
    """日期时间转 ISO 字符串，None 安全。"""
    return dt.isoformat() if dt else None


def _proposal_to_dict(p) -> dict:
    return {
        'id': p.id,
        'title': p.title,
        'opportunity_id': getattr(p, 'opportunity_id', None),
        'opportunity_title': p.opportunity.title if getattr(p, 'opportunity', None) else '',
        'protocol_id': getattr(p, 'protocol_id', None),
        'client_id': getattr(p, 'client_id', None),
        'client_name': p.client.name if getattr(p, 'client', None) else '',
        'status': p.status,
        'stage': p.status,  # 前端看板按 stage 分组，与 status 一致
        'description': p.description or '',
        'product_category': p.product_category or '',
        'test_methods': p.test_methods or [],
        'sample_size_estimate': p.sample_size_estimate,
        'estimated_duration_days': p.estimated_duration_days,
        'estimated_amount': str(p.estimated_amount) if p.estimated_amount else None,
        'created_by_id': p.created_by_id,
        'create_time': _safe_iso(getattr(p, 'create_time', None)),
        'update_time': _safe_iso(getattr(p, 'update_time', None)),
        'version_count': getattr(
            p, '_version_count', p.versions.count() if hasattr(p, 'versions') else 0
        ),
        'checklist_total': getattr(
            p, '_checklist_total', p.checklist_items.count() if hasattr(p, 'checklist_items') else 0
        ),
        'checklist_done': getattr(
            p, '_checklist_done',
            p.checklist_items.filter(is_completed=True).count() if hasattr(p, 'checklist_items') else 0,
        ),
    }


def _version_to_dict(v) -> dict:
    return {
        'id': v.id,
        'proposal_id': v.proposal_id,
        'version_number': v.version_number,
        'change_summary': v.change_summary,
        'file_path': v.file_path,
        'feishu_doc_token': v.feishu_doc_token,
        'created_by_id': v.created_by_id,
        'create_time': v.create_time.isoformat(),
    }


def _communication_to_dict(c) -> dict:
    return {
        'id': c.id,
        'client_id': c.client_id,
        'client_name': c.client.name if c.client else '',
        'proposal_id': c.proposal_id,
        'proposal_title': c.proposal.title if c.proposal else '',
        'opportunity_id': c.opportunity_id,
        'protocol_id': c.protocol_id,
        'comm_type': c.comm_type,
        'subject': c.subject,
        'summary': c.summary,
        'participants': c.participants,
        'occurred_at': c.occurred_at.isoformat(),
        'created_by_id': c.created_by_id,
        'create_time': c.create_time.isoformat(),
    }


# ============================================================================
# 方案 API
# ============================================================================
@router.post('/create', summary='创建方案')
@require_permission('proposal.proposal.create')
def create_proposal(request, data: ProposalCreateIn):
    account = _get_account_from_request(request)
    p = services.create_proposal(
        title=data.title,
        client_id=data.client_id,
        opportunity_id=data.opportunity_id,
        description=data.description or '',
        product_category=data.product_category or '',
        test_methods=data.test_methods,
        sample_size_estimate=data.sample_size_estimate,
        estimated_duration_days=data.estimated_duration_days,
        estimated_amount=data.estimated_amount,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': _proposal_to_dict(p)}


@router.post('/create-from-opportunity', summary='从商机创建方案')
@require_permission('proposal.proposal.create')
def create_from_opportunity(request, data: ProposalFromOpportunityIn):
    account = _get_account_from_request(request)
    p = services.create_from_opportunity(
        opp_id=data.opportunity_id,
        created_by_id=account.id if account else None,
    )
    if not p:
        return {'code': 404, 'msg': '商机不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _proposal_to_dict(p)}


@router.get('/list', summary='方案列表')
@require_permission('proposal.proposal.read')
def list_proposals(request, params: ProposalQueryParams = Query(...)):
    try:
        account = _get_account_from_request(request)
        result = services.list_proposals(
            page=params.page, page_size=params.page_size,
            status=params.status, account=account,
        )
        return {
            'code': 200, 'msg': 'OK',
            'data': {
                'items': [_proposal_to_dict(p) for p in result['items']],
                'total': result['total'],
                'page': result['page'],
                'page_size': result['page_size'],
            },
        }
    except Exception as e:
        logger.exception('proposal/list 500: %s', e)
        msg = str(e) if getattr(settings, 'DEBUG', False) else '方案列表加载失败，请查看服务端日志'
        return 500, {'code': 500, 'msg': msg, 'data': None}


@router.get('/{proposal_id}', summary='方案详情')
@require_permission('proposal.proposal.read')
def get_proposal(request, proposal_id: int):
    p = services.get_proposal(proposal_id)
    if not p:
        return {'code': 404, 'msg': '方案不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _proposal_to_dict(p)}


# ============================================================================
# 版本 API
# ============================================================================
@router.post('/{proposal_id}/versions/create', summary='创建方案版本')
@require_permission('proposal.version.create')
def create_version(request, proposal_id: int, data: VersionCreateIn):
    account = _get_account_from_request(request)
    v = services.create_version(
        proposal_id=proposal_id,
        version_number=data.version_number,
        change_summary=data.change_summary or '',
        file_path=data.file_path or '',
        feishu_doc_token=data.feishu_doc_token or '',
        created_by_id=account.id if account else None,
    )
    if not v:
        return {'code': 404, 'msg': '方案不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _version_to_dict(v)}


@router.get('/{proposal_id}/versions', summary='方案版本列表')
@require_permission('proposal.version.read')
def list_versions(request, proposal_id: int):
    versions = services.list_versions(proposal_id)
    return {
        'code': 200, 'msg': 'OK',
        'data': [_version_to_dict(v) for v in versions],
    }


# ============================================================================
# 清单 API
# ============================================================================
@router.post('/{proposal_id}/checklist/update', summary='更新准备清单')
@require_permission('proposal.checklist.update')
def update_checklist(request, proposal_id: int, data: ChecklistUpdateIn):
    account = _get_account_from_request(request)
    item = services.update_checklist(
        proposal_id=proposal_id,
        item_name=data.item_name,
        is_completed=data.is_completed,
        completed_by_id=account.id if account else None,
        notes=data.notes or '',
    )
    if not item:
        return {'code': 404, 'msg': '清单项不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': {'item_name': item.item_name, 'is_completed': item.is_completed}}


@router.get('/{proposal_id}/checklist', summary='准备清单状态')
@require_permission('proposal.checklist.read')
def get_checklist(request, proposal_id: int):
    status = services.get_checklist_status(proposal_id)
    return {'code': 200, 'msg': 'OK', 'data': status}


# ============================================================================
# 审查与定稿 API
# ============================================================================
@router.post('/{proposal_id}/submit-review', summary='提交审查')
@require_permission('proposal.review.submit')
def submit_review(request, proposal_id: int, data: SubmitReviewIn):
    p = services.submit_for_review(proposal_id, data.review_type)
    if not p:
        return {'code': 404, 'msg': '方案不存在或审查类型无效', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _proposal_to_dict(p)}


@router.post('/{proposal_id}/finalize', summary='定稿（自动创建协议）')
@require_permission('proposal.proposal.finalize')
def finalize_proposal(request, proposal_id: int):
    p = services.finalize_to_protocol(proposal_id)
    if not p:
        return {'code': 404, 'msg': '方案不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _proposal_to_dict(p)}


# ============================================================================
# 沟通记录 API
# ============================================================================
@router.post('/communications/create', summary='添加沟通记录')
@require_permission('proposal.communication.create')
def create_communication(request, data: CommunicationCreateIn):
    account = _get_account_from_request(request)
    log = services.add_communication_log(
        comm_type=data.comm_type,
        subject=data.subject,
        summary=data.summary or '',
        client_id=data.client_id,
        proposal_id=data.proposal_id,
        opportunity_id=data.opportunity_id,
        protocol_id=data.protocol_id,
        participants=data.participants,
        occurred_at=data.occurred_at,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': _communication_to_dict(log)}


@router.get('/communications/list', summary='沟通记录列表')
@require_permission('proposal.communication.read')
def list_communications(request, params: CommunicationQueryParams = Query(...)):
    result = services.list_communication_logs(
        client_id=params.client_id,
        proposal_id=params.proposal_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_communication_to_dict(c) for c in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


# ============================================================================
# 会议管理 (E3)
# ============================================================================
class MeetingCreateIn(Schema):
    title: str
    meeting_type: str = 'other'
    protocol_id: Optional[int] = None
    scheduled_date: str
    duration_minutes: int = 60
    location: str = ''
    participants: list = []

class MeetingOut(Schema):
    id: int
    title: str
    meeting_type: str
    protocol_id: Optional[int]
    scheduled_date: str
    duration_minutes: int
    location: str
    participants: list
    status: str
    create_time: str

@router.post('/meetings/create', summary='创建会议')
@require_permission('proposal.meeting.create')
def create_meeting(request, data: MeetingCreateIn):
    from .models import Meeting
    from datetime import datetime
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    meeting = Meeting.objects.create(
        title=data.title,
        meeting_type=data.meeting_type,
        protocol_id=data.protocol_id,
        scheduled_date=datetime.fromisoformat(data.scheduled_date),
        duration_minutes=data.duration_minutes,
        location=data.location,
        participants=data.participants,
        created_by_id=account.id,
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': meeting.id}}

@router.get('/meetings/list', summary='会议列表')
@require_permission('proposal.meeting.read')
def list_meetings(request, protocol_id: Optional[int] = None, page: int = 1, page_size: int = 20):
    from .models import Meeting
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    qs = Meeting.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    total = qs.count()
    items = qs[(page-1)*page_size:page*page_size]
    return {'code': 200, 'msg': 'OK', 'data': {
        'total': total,
        'items': [{
            'id': m.id, 'title': m.title, 'meeting_type': m.meeting_type,
            'protocol_id': m.protocol_id, 'scheduled_date': m.scheduled_date.isoformat(),
            'duration_minutes': m.duration_minutes, 'location': m.location,
            'participants': m.participants, 'status': m.status,
            'create_time': m.create_time.isoformat(),
        } for m in items],
    }}

class MeetingMinuteIn(Schema):
    content: str


class MeetingActionItemIn(Schema):
    description: str
    assignee_name: str = ''
    due_date: Optional[str] = None


class ProposalUpdateIn(Schema):
    title: Optional[str] = None
    description: Optional[str] = None
    product_category: Optional[str] = None
    test_methods: Optional[str] = None
    sample_size_estimate: Optional[int] = None


@router.put('/{proposal_id}/update', summary='更新方案')
@require_permission('proposal.proposal.update')
def update_proposal(request, proposal_id: int, data: ProposalUpdateIn):
    from .models import Proposal
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    proposal = Proposal.objects.filter(id=proposal_id, is_deleted=False).first()
    if not proposal:
        return 404, {'code': 404, 'msg': '方案不存在', 'data': None}
    for key, value in data.dict(exclude_unset=True).items():
        if value is not None:
            setattr(proposal, key, value)
    proposal.save()
    return {'code': 200, 'msg': '方案已更新', 'data': {'id': proposal.id}}


@router.delete('/{proposal_id}', summary='删除方案（软删除）')
@require_permission('proposal.proposal.delete')
def delete_proposal(request, proposal_id: int):
    from .models import Proposal
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    updated = Proposal.objects.filter(id=proposal_id, is_deleted=False).update(is_deleted=True)
    if not updated:
        return 404, {'code': 404, 'msg': '方案不存在', 'data': None}
    return {'code': 200, 'msg': '方案已删除', 'data': None}


@router.post('/meetings/{meeting_id}/minutes', summary='添加会议纪要')
@require_permission('proposal.meeting.update')
def add_meeting_minutes(request, meeting_id: int, data: MeetingMinuteIn):
    from .models import Meeting, MeetingMinute
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    try:
        meeting = Meeting.objects.get(id=meeting_id)
    except Meeting.DoesNotExist:
        return 404, {'code': 404, 'msg': '会议不存在'}
    minute, created = MeetingMinute.objects.update_or_create(
        meeting=meeting,
        defaults={'content': data.content, 'created_by_id': account.id},
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': minute.id, 'created': created}}


@router.post('/meetings/{meeting_id}/action-items', summary='添加会议待办')
@require_permission('proposal.meeting.update')
def add_action_item(request, meeting_id: int, data: MeetingActionItemIn):
    from .models import Meeting, MeetingActionItem
    from datetime import date as date_type
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    try:
        meeting = Meeting.objects.get(id=meeting_id)
    except Meeting.DoesNotExist:
        return 404, {'code': 404, 'msg': '会议不存在'}
    item = MeetingActionItem.objects.create(
        meeting=meeting,
        description=data.description,
        assignee_name=data.assignee_name,
        due_date=date_type.fromisoformat(data.due_date) if data.due_date else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id}}
