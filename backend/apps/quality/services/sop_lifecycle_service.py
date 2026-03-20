"""
SOP 生命周期服务（QP2-3）

提供版本管理、审查流程、培训矩阵等能力。
"""
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from django.db import transaction
from django.utils import timezone

from ..models import SOP, SOPStatus, SOPTraining, SOPTrainingStatus


def create_new_version(
    sop_id: int,
    new_version: str,
    title: Optional[str] = None,
    feishu_doc_url: Optional[str] = None,
    description: Optional[str] = None,
    change_request_id: Optional[int] = None,
) -> Optional[SOP]:
    """
    创建新版本 SOP，旧版本自动废止。

    - 新 SOP 为草稿状态
    - 旧 SOP 状态设为 retired
    - 新 SOP 的 previous_version_id 指向旧 SOP
    """
    old_sop = SOP.objects.filter(id=sop_id, is_deleted=False).first()
    if not old_sop:
        return None

    # 新版本 code 需唯一，使用 {原code}-{新版本}
    new_code = f"{old_sop.code}-{new_version}"

    if SOP.objects.filter(code=new_code, is_deleted=False).exists():
        return None  # code 已存在

    with transaction.atomic():
        # 若旧版本为生效中，则废止
        if old_sop.status == SOPStatus.EFFECTIVE:
            old_sop.status = SOPStatus.RETIRED
            old_sop.save(update_fields=['status', 'update_time'])

        new_sop = SOP.objects.create(
            code=new_code,
            title=title or old_sop.title,
            version=new_version,
            category=old_sop.category,
            owner=old_sop.owner,
            status=SOPStatus.DRAFT,
            feishu_doc_url=feishu_doc_url or old_sop.feishu_doc_url,
            description=description or old_sop.description,
            previous_version_id=old_sop.id,
            change_request_id=change_request_id,
        )
    return new_sop


def submit_for_review(sop_id: int) -> Optional[SOP]:
    """提交审核：SOP 状态 → under_review"""
    sop = SOP.objects.filter(id=sop_id, is_deleted=False).first()
    if not sop:
        return None
    if sop.status != SOPStatus.DRAFT:
        return None  # 仅草稿可提交审核
    sop.status = SOPStatus.UNDER_REVIEW
    sop.save(update_fields=['status', 'update_time'])
    return sop


def approve_sop(sop_id: int, effective_date: Optional[date] = None) -> Optional[SOP]:
    """
    批准 SOP：状态 → effective，设置生效日期。

    若未传 effective_date，使用当天。
    """
    sop = SOP.objects.filter(id=sop_id, is_deleted=False).first()
    if not sop:
        return None
    if sop.status != SOPStatus.UNDER_REVIEW:
        return None  # 仅审核中可批准
    sop.status = SOPStatus.EFFECTIVE
    sop.effective_date = effective_date or date.today()
    sop.save(update_fields=['status', 'effective_date', 'update_time'])
    return sop


def check_review_due(days: int = 30) -> List[SOP]:
    """
    返回 next_review 在指定天数内的 SOP 列表。

    默认 30 天内需审查的 SOP。
    """
    today = date.today()
    end_date = today + timedelta(days=days)
    return list(
        SOP.objects.filter(
            is_deleted=False,
            status=SOPStatus.EFFECTIVE,
            next_review__isnull=False,
            next_review__gte=today,
            next_review__lte=end_date,
        ).order_by('next_review')
    )


def get_training_matrix(sop_id: int) -> List[Dict[str, Any]]:
    """返回指定 SOP 的培训矩阵（每人培训状态）"""
    sop = SOP.objects.filter(id=sop_id, is_deleted=False).first()
    if not sop:
        return []

    trainings = SOPTraining.objects.filter(sop=sop).order_by('trainee_name')
    today = date.today()
    result = []
    for t in trainings:
        # 超期判断：待培训且截止日已过
        status = t.status
        if status == SOPTrainingStatus.PENDING and t.due_date and t.due_date < today:
            status = SOPTrainingStatus.OVERDUE

        result.append({
            'id': t.id,
            'trainee_id': t.trainee_id,
            'trainee_name': t.trainee_name,
            'status': status,
            'due_date': t.due_date.isoformat() if t.due_date else None,
            'completed_at': t.completed_at.isoformat() if t.completed_at else None,
            'create_time': t.create_time.isoformat(),
        })
    return result


def add_training_record(
    sop_id: int,
    trainee_id: int,
    trainee_name: str,
    due_date: Optional[date] = None,
) -> Optional[SOPTraining]:
    """添加培训记录（受训人）"""
    sop = SOP.objects.filter(id=sop_id, is_deleted=False).first()
    if not sop:
        return None

    training, _ = SOPTraining.objects.update_or_create(
        sop=sop,
        trainee_id=trainee_id,
        defaults={
            'trainee_name': trainee_name,
            'due_date': due_date,
            'status': SOPTrainingStatus.PENDING,
        },
    )
    return training


def complete_training(training_id: int) -> Optional[SOPTraining]:
    """完成培训：标记为已完成，设置 completed_at"""
    training = SOPTraining.objects.filter(id=training_id).first()
    if not training:
        return None
    training.status = SOPTrainingStatus.COMPLETED
    training.completed_at = timezone.now()
    training.save(update_fields=['status', 'completed_at', 'update_time'])
    return training
