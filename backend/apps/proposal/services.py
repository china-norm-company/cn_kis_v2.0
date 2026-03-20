"""
方案准备工作流服务

封装方案 CRUD、版本管理、准备清单、沟通记录等业务逻辑。
"""
import logging
from typing import Optional
from datetime import datetime
from decimal import Decimal

from django.db.models import Count, Q
from django.utils import timezone

from .models import (
    Proposal, ProposalStatus, ProposalVersion,
    ProposalChecklist, ChecklistItemName,
    CommunicationLog,
)

logger = logging.getLogger(__name__)


def _apply_data_scope(qs, account=None):
    """应用数据权限过滤（若提供 account）；DEBUG 模式下跳过，与项目全链路权限一致"""
    if account is None:
        return qs
    from django.conf import settings
    if getattr(settings, 'DEBUG', False):
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account)


# ============================================================================
# 方案 CRUD
# ============================================================================
def list_proposals(
    page: int = 1,
    page_size: int = 20,
    status: str = None,
    account=None,
) -> dict:
    """分页查询方案列表。使用 annotate 预取版本数/清单总数/已完成数，避免 N+1。"""
    qs = (
        Proposal.objects.filter(is_deleted=False)
        .select_related('client', 'opportunity')
        .annotate(
            _version_count=Count('versions', distinct=True),
            _checklist_total=Count('checklist_items', distinct=True),
            _checklist_done=Count(
                'checklist_items',
                filter=Q(checklist_items__is_completed=True),
                distinct=True,
            ),
        )
    )
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_proposal(proposal_id: int) -> Optional[Proposal]:
    """获取方案详情"""
    return Proposal.objects.filter(
        id=proposal_id, is_deleted=False,
    ).select_related('client', 'opportunity', 'protocol').first()


def create_proposal(
    title: str,
    client_id: int = None,
    opportunity_id: int = None,
    description: str = '',
    product_category: str = '',
    test_methods: list = None,
    sample_size_estimate: int = None,
    estimated_duration_days: int = None,
    estimated_amount: Decimal = None,
    created_by_id: int = None,
) -> Proposal:
    """创建方案并初始化准备清单"""
    proposal = Proposal.objects.create(
        title=title,
        client_id=client_id,
        opportunity_id=opportunity_id,
        description=description,
        product_category=product_category,
        test_methods=test_methods or [],
        sample_size_estimate=sample_size_estimate,
        estimated_duration_days=estimated_duration_days,
        estimated_amount=estimated_amount,
        created_by_id=created_by_id,
    )
    _init_checklist(proposal)
    return proposal


def _init_checklist(proposal: Proposal) -> None:
    """为新方案初始化全部准备清单项"""
    items = [
        ProposalChecklist(proposal=proposal, item_name=choice.value)
        for choice in ChecklistItemName
    ]
    ProposalChecklist.objects.bulk_create(items)


def create_from_opportunity(opp_id: int, created_by_id: int = None) -> Optional[Proposal]:
    """从商机创建方案"""
    from apps.crm.models import Opportunity
    opp = Opportunity.objects.filter(id=opp_id, is_deleted=False).select_related('client').first()
    if not opp:
        return None

    proposal = create_proposal(
        title=f'方案 - {opp.title}',
        client_id=opp.client_id,
        opportunity_id=opp.id,
        description=opp.description,
        estimated_amount=opp.estimated_amount,
        created_by_id=created_by_id,
    )
    return proposal


# ============================================================================
# 方案版本
# ============================================================================
def create_version(
    proposal_id: int,
    version_number: str,
    change_summary: str = '',
    file_path: str = '',
    feishu_doc_token: str = '',
    created_by_id: int = None,
) -> Optional[ProposalVersion]:
    """创建方案新版本"""
    proposal = get_proposal(proposal_id)
    if not proposal:
        return None

    version = ProposalVersion.objects.create(
        proposal=proposal,
        version_number=version_number,
        change_summary=change_summary,
        file_path=file_path,
        feishu_doc_token=feishu_doc_token,
        created_by_id=created_by_id,
    )
    return version


def list_versions(proposal_id: int) -> list:
    """获取方案所有版本"""
    return list(
        ProposalVersion.objects.filter(proposal_id=proposal_id).order_by('-create_time')
    )


# ============================================================================
# 准备清单
# ============================================================================
def update_checklist(
    proposal_id: int,
    item_name: str,
    is_completed: bool,
    completed_by_id: int = None,
    notes: str = '',
) -> Optional[ProposalChecklist]:
    """更新准备清单项"""
    item = ProposalChecklist.objects.filter(
        proposal_id=proposal_id, item_name=item_name,
    ).first()
    if not item:
        return None

    item.is_completed = is_completed
    if is_completed:
        item.completed_by_id = completed_by_id
        item.completed_at = timezone.now()
    else:
        item.completed_by_id = None
        item.completed_at = None
    if notes:
        item.notes = notes
    item.save()
    return item


def get_checklist_status(proposal_id: int) -> dict:
    """获取准备清单完成状态"""
    items = ProposalChecklist.objects.filter(proposal_id=proposal_id)
    items_data = []
    completed_count = 0
    total_count = 0
    for item in items:
        total_count += 1
        if item.is_completed:
            completed_count += 1
        items_data.append({
            'item_name': item.item_name,
            'label': item.get_item_name_display(),
            'is_completed': item.is_completed,
            'completed_by_id': item.completed_by_id,
            'completed_at': item.completed_at.isoformat() if item.completed_at else None,
            'notes': item.notes,
        })
    return {
        'items': items_data,
        'completed': completed_count,
        'total': total_count,
        'all_completed': completed_count == total_count and total_count > 0,
    }


# ============================================================================
# 审查与定稿
# ============================================================================
def submit_for_review(proposal_id: int, review_type: str) -> Optional[Proposal]:
    """
    提交审查

    review_type: 'internal' 提交内部审查, 'client' 提交客户审查
    """
    proposal = get_proposal(proposal_id)
    if not proposal:
        return None

    if review_type == 'internal':
        proposal.status = ProposalStatus.INTERNAL_REVIEW
    elif review_type == 'client':
        proposal.status = ProposalStatus.CLIENT_REVIEW
    else:
        logger.warning(f'未知审查类型: {review_type}')
        return None

    proposal.save(update_fields=['status', 'update_time'])
    logger.info(f'方案#{proposal_id} 提交{review_type}审查')
    return proposal


def finalize_to_protocol(proposal_id: int) -> Optional[Proposal]:
    """
    方案定稿后自动创建 Protocol

    将方案状态置为 finalized，并根据方案信息创建协议记录，
    反向关联 proposal.protocol。
    """
    proposal = get_proposal(proposal_id)
    if not proposal:
        return None

    # 调用 protocol 模块创建协议
    from apps.protocol.services import create_protocol
    protocol = create_protocol(
        title=proposal.title,
        code='',
        efficacy_type='',
        sample_size=proposal.sample_size_estimate,
    )

    # 同步额外字段到协议
    if proposal.product_category:
        protocol.product_category = proposal.product_category
    if proposal.test_methods:
        protocol.test_methods = proposal.test_methods
    if proposal.client_id:
        protocol.sponsor_id = proposal.client_id
    protocol.save()

    # 关联协议到方案
    proposal.protocol = protocol
    proposal.status = ProposalStatus.FINALIZED
    proposal.save(update_fields=['protocol', 'status', 'update_time'])

    logger.info(f'方案#{proposal_id} 定稿，已创建协议#{protocol.id}')
    return proposal


# ============================================================================
# 沟通记录
# ============================================================================
def add_communication_log(
    comm_type: str,
    subject: str,
    summary: str = '',
    client_id: int = None,
    proposal_id: int = None,
    opportunity_id: int = None,
    protocol_id: int = None,
    participants: list = None,
    occurred_at: datetime = None,
    created_by_id: int = None,
) -> CommunicationLog:
    """添加沟通记录"""
    log = CommunicationLog.objects.create(
        client_id=client_id,
        proposal_id=proposal_id,
        opportunity_id=opportunity_id,
        protocol_id=protocol_id,
        comm_type=comm_type,
        subject=subject,
        summary=summary,
        participants=participants or [],
        occurred_at=occurred_at or timezone.now(),
        created_by_id=created_by_id,
    )
    return log


def list_communication_logs(
    client_id: int = None,
    proposal_id: int = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """沟通记录列表"""
    qs = CommunicationLog.objects.filter(is_deleted=False).select_related('client', 'proposal')
    if client_id:
        qs = qs.filter(client_id=client_id)
    if proposal_id:
        qs = qs.filter(proposal_id=proposal_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}
