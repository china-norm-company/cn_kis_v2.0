"""
可行性评估服务

封装可行性评估的业务逻辑，包括：
- 评估的创建、查询、列表
- 自动检查（设备、人员、排程、伦理）
- 综合评分计算
- 状态流转（提交、批准、驳回）
"""
import logging
from datetime import date
from typing import Optional

from .models import (
    AssessmentDimension,
    AssessmentItem,
    AssessmentStatus,
    FeasibilityAssessment,
)

logger = logging.getLogger(__name__)


def _apply_data_scope(qs, account=None):
    """应用数据权限过滤（若提供 account）"""
    if account is None:
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account)


# ============================================================================
# 创建评估
# ============================================================================
def create_assessment(
    opportunity_id: int,
    title: str,
    created_by_id: int = None,
) -> FeasibilityAssessment:
    """
    创建可行性评估，预填商机信息，并初始化六个评估维度项。
    """
    from apps.crm.models import Opportunity

    opportunity = Opportunity.objects.filter(
        id=opportunity_id, is_deleted=False,
    ).first()
    if not opportunity:
        raise ValueError(f'商机不存在: {opportunity_id}')

    assessment = FeasibilityAssessment.objects.create(
        opportunity=opportunity,
        title=title or f'{opportunity.title} - 可行性评估',
        created_by_id=created_by_id,
    )

    # 初始化所有评估维度
    dimensions = [
        (AssessmentDimension.PERSONNEL, 1.0),
        (AssessmentDimension.EQUIPMENT, 1.0),
        (AssessmentDimension.VENUE, 0.8),
        (AssessmentDimension.SCHEDULE, 1.0),
        (AssessmentDimension.COMPLIANCE, 1.2),
        (AssessmentDimension.RECRUITMENT, 0.8),
    ]
    for dimension, weight in dimensions:
        AssessmentItem.objects.create(
            assessment=assessment,
            dimension=dimension,
            weight=weight,
        )

    logger.info(f'创建可行性评估#{assessment.id}: {assessment.title}')
    return assessment


# ============================================================================
# 自动检查
# ============================================================================
def _check_equipment_availability(assessment: FeasibilityAssessment) -> dict:
    """检查设备可用性：查询机构内设备类资源的整体可用状态"""
    from apps.resource.models import ResourceItem, ResourceStatus, ResourceType

    # 如果评估关联了协议，可以通过访视计划→活动模板→BOM 进一步精确查询
    # 当前实现：查询机构内设备整体可用性
    base_filter = {
        'category__resource_type': ResourceType.EQUIPMENT,
        'is_deleted': False,
    }

    active_equipment = ResourceItem.objects.filter(
        **base_filter, status=ResourceStatus.ACTIVE,
    ).count()
    maintenance_equipment = ResourceItem.objects.filter(
        **base_filter,
        status__in=[ResourceStatus.MAINTENANCE, ResourceStatus.CALIBRATING],
    ).count()

    total = active_equipment + maintenance_equipment
    passed = active_equipment > 0 and (total == 0 or maintenance_equipment < total * 0.3)

    return {
        'passed': passed,
        'detail': {
            'active_count': active_equipment,
            'maintenance_count': maintenance_equipment,
            'scope': f'protocol#{assessment.protocol_id}' if assessment.protocol_id else 'global',
            'message': '设备可用' if passed else '设备不足或大量设备处于维护状态',
        },
    }


def _check_personnel_qualification(assessment: FeasibilityAssessment) -> dict:
    """检查人员资质：查询设备授权中是否存在过期授权"""
    from apps.resource.models import EquipmentAuthorization

    today = date.today()
    active_auth = EquipmentAuthorization.objects.filter(
        is_active=True,
    ).count()
    expired_auth = EquipmentAuthorization.objects.filter(
        is_active=True,
        expires_at__lt=today,
    ).count()

    passed = active_auth > 0 and expired_auth == 0

    return {
        'passed': passed,
        'detail': {
            'active_authorizations': active_auth,
            'expired_authorizations': expired_auth,
            'message': '人员资质合规' if passed else '存在过期授权或无有效授权人员',
        },
    }


def _check_schedule_conflict(assessment: FeasibilityAssessment) -> dict:
    """检查排程冲突：查询关联协议的排程时间槽中是否存在冲突"""
    from apps.scheduling.models import ScheduleSlot, SlotStatus

    slot_filter = {}
    if assessment.protocol_id:
        slot_filter['schedule_plan__visit_plan__protocol_id'] = assessment.protocol_id

    conflict_slots = ScheduleSlot.objects.filter(
        status=SlotStatus.CONFLICT, **slot_filter,
    ).count()
    planned_slots = ScheduleSlot.objects.filter(
        status__in=[SlotStatus.PLANNED, SlotStatus.CONFIRMED], **slot_filter,
    ).count()

    passed = conflict_slots == 0

    return {
        'passed': passed,
        'detail': {
            'conflict_count': conflict_slots,
            'planned_count': planned_slots,
            'scope': f'protocol#{assessment.protocol_id}' if assessment.protocol_id else 'global',
            'message': '无排程冲突' if passed else f'存在 {conflict_slots} 个排程冲突',
        },
    }


def _check_ethics_validity(assessment: FeasibilityAssessment) -> dict:
    """检查伦理批件有效性：查询关联协议的伦理审批状态"""
    from apps.ethics.models import ApprovalDocument, EthicsApplication

    protocol = assessment.protocol
    if not protocol:
        return {
            'passed': None,
            'detail': {'message': '未关联协议，跳过伦理检查'},
        }

    applications = EthicsApplication.objects.filter(
        protocol=protocol,
        status='approved',
    )
    if not applications.exists():
        return {
            'passed': False,
            'detail': {'message': '关联协议无已批准的伦理申请'},
        }

    today = date.today()
    valid_docs = ApprovalDocument.objects.filter(
        application__in=applications,
        is_active=True,
    )
    expired_docs = valid_docs.filter(expiry_date__lt=today)
    passed = valid_docs.exists() and not expired_docs.exists()

    return {
        'passed': passed,
        'detail': {
            'approved_applications': applications.count(),
            'valid_documents': valid_docs.count(),
            'expired_documents': expired_docs.count(),
            'message': '伦理批件有效' if passed else '伦理批件已过期或缺失',
        },
    }


def _check_venue_availability(assessment: FeasibilityAssessment) -> dict:
    """检查场地可用性：查询机构设施类资源"""
    from apps.resource.models import ResourceItem, ResourceStatus, ResourceType

    venue_count = ResourceItem.objects.filter(
        category__resource_type=ResourceType.FACILITY,
        status=ResourceStatus.ACTIVE,
        is_deleted=False,
    ).count()
    passed = venue_count > 0

    return {
        'passed': passed,
        'detail': {
            'available_venues': venue_count,
            'message': '场地可用' if passed else '无可用场地设施',
        },
    }


def _check_recruitment_feasibility(assessment: FeasibilityAssessment) -> dict:
    """检查受试者招募可行性：基于样本量和当前入组率评估"""
    if not assessment.protocol_id:
        return {
            'passed': None,
            'detail': {'message': '未关联协议，跳过招募检查'},
        }

    try:
        from apps.protocol.models import Protocol
        protocol = Protocol.objects.filter(id=assessment.protocol_id).first()
        if not protocol or not protocol.sample_size:
            return {
                'passed': None,
                'detail': {'message': '协议无样本量信息'},
            }

        from apps.subject.models import Enrollment
        enrolled = Enrollment.objects.filter(
            protocol_id=assessment.protocol_id, status='enrolled',
        ).count()

        target = protocol.sample_size
        progress = round(enrolled / target * 100, 1) if target > 0 else 0
        passed = True  # 可行性评估阶段只要有协议信息即可

        return {
            'passed': passed,
            'detail': {
                'target_sample_size': target,
                'current_enrolled': enrolled,
                'progress_pct': progress,
                'message': f'目标 {target} 例，当前 {enrolled} 例 ({progress}%)',
            },
        }
    except Exception as e:
        return {
            'passed': None,
            'detail': {'message': f'招募检查异常: {str(e)}'},
        }


def run_auto_checks(assessment_id: int) -> FeasibilityAssessment:
    """
    运行所有自动检查，更新各维度 AssessmentItem 和汇总结果。
    """
    assessment = FeasibilityAssessment.objects.filter(
        id=assessment_id, is_deleted=False,
    ).first()
    if not assessment:
        raise ValueError(f'评估不存在: {assessment_id}')

    check_map = {
        AssessmentDimension.EQUIPMENT: _check_equipment_availability,
        AssessmentDimension.PERSONNEL: _check_personnel_qualification,
        AssessmentDimension.SCHEDULE: _check_schedule_conflict,
        AssessmentDimension.COMPLIANCE: _check_ethics_validity,
        AssessmentDimension.VENUE: _check_venue_availability,
        AssessmentDimension.RECRUITMENT: _check_recruitment_feasibility,
    }

    auto_result = {}
    for dimension, check_func in check_map.items():
        try:
            result = check_func(assessment)
        except Exception as e:
            logger.error(f'自动检查 {dimension} 失败: {e}')
            result = {'passed': None, 'detail': {'message': f'检查异常: {str(e)}'}}

        # 更新对应的 AssessmentItem
        item = AssessmentItem.objects.filter(
            assessment=assessment, dimension=dimension,
        ).first()
        if item:
            item.auto_check_passed = result['passed']
            item.auto_check_detail = result.get('detail', {})
            if result['passed'] is True:
                item.score = max(item.score, 80)
            elif result['passed'] is False:
                item.score = min(item.score, 40)
            item.save()

        auto_result[dimension] = result

    assessment.auto_check_result = auto_result
    assessment.save(update_fields=['auto_check_result', 'update_time'])

    logger.info(f'评估#{assessment_id} 自动检查完成')
    return assessment


# ============================================================================
# 评分计算
# ============================================================================
def calculate_overall_score(assessment_id: int) -> FeasibilityAssessment:
    """加权计算综合评分"""
    assessment = FeasibilityAssessment.objects.filter(
        id=assessment_id, is_deleted=False,
    ).first()
    if not assessment:
        raise ValueError(f'评估不存在: {assessment_id}')

    items = AssessmentItem.objects.filter(assessment=assessment)
    if not items.exists():
        assessment.overall_score = 0
        assessment.save(update_fields=['overall_score', 'update_time'])
        return assessment

    total_weight = sum(item.weight for item in items)
    if total_weight == 0:
        assessment.overall_score = 0
    else:
        weighted_sum = sum(item.score * item.weight for item in items)
        assessment.overall_score = round(weighted_sum / total_weight, 2)

    assessment.save(update_fields=['overall_score', 'update_time'])
    logger.info(f'评估#{assessment_id} 综合评分: {assessment.overall_score}')
    return assessment


# ============================================================================
# 状态流转
# ============================================================================
def submit_assessment(assessment_id: int) -> FeasibilityAssessment:
    """提交审批"""
    assessment = FeasibilityAssessment.objects.filter(
        id=assessment_id, is_deleted=False,
    ).first()
    if not assessment:
        raise ValueError(f'评估不存在: {assessment_id}')
    if assessment.status != AssessmentStatus.DRAFT:
        raise ValueError(f'仅草稿状态可提交，当前状态: {assessment.status}')

    # 提交前自动计算综合评分
    calculate_overall_score(assessment_id)

    assessment.status = AssessmentStatus.SUBMITTED
    assessment.save(update_fields=['status', 'update_time'])
    logger.info(f'评估#{assessment_id} 已提交审批')
    return assessment


def approve_assessment(assessment_id: int) -> FeasibilityAssessment:
    """批准评估"""
    assessment = FeasibilityAssessment.objects.filter(
        id=assessment_id, is_deleted=False,
    ).first()
    if not assessment:
        raise ValueError(f'评估不存在: {assessment_id}')
    if assessment.status != AssessmentStatus.SUBMITTED:
        raise ValueError(f'仅已提交状态可批准，当前状态: {assessment.status}')

    assessment.status = AssessmentStatus.APPROVED
    assessment.save(update_fields=['status', 'update_time'])
    logger.info(f'评估#{assessment_id} 已批准')
    return assessment


def reject_assessment(assessment_id: int) -> FeasibilityAssessment:
    """驳回评估"""
    assessment = FeasibilityAssessment.objects.filter(
        id=assessment_id, is_deleted=False,
    ).first()
    if not assessment:
        raise ValueError(f'评估不存在: {assessment_id}')
    if assessment.status != AssessmentStatus.SUBMITTED:
        raise ValueError(f'仅已提交状态可驳回，当前状态: {assessment.status}')

    assessment.status = AssessmentStatus.REJECTED
    assessment.save(update_fields=['status', 'update_time'])
    logger.info(f'评估#{assessment_id} 已驳回')
    return assessment


# ============================================================================
# 查询
# ============================================================================
def list_assessments(
    page: int = 1,
    page_size: int = 20,
    status: str = None,
    account=None,
) -> dict:
    """评估列表，支持数据权限过滤"""
    qs = FeasibilityAssessment.objects.filter(
        is_deleted=False,
    ).select_related('opportunity', 'protocol')
    qs = _apply_data_scope(qs, account)

    if status:
        qs = qs.filter(status=status)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_assessment(assessment_id: int) -> Optional[FeasibilityAssessment]:
    """评估详情"""
    return FeasibilityAssessment.objects.filter(
        id=assessment_id, is_deleted=False,
    ).select_related('opportunity', 'protocol').first()
