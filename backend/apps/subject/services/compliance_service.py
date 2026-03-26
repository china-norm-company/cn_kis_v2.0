"""
依从性评估服务

基于到访率、问卷完成率和时间窗偏差计算综合依从性评分。
"""
from decimal import Decimal
from django.utils import timezone

from ..models_execution import ComplianceRecord, ComplianceLevel


def calculate_compliance_score(
    visit_attendance_rate: float,
    questionnaire_completion_rate: float,
    time_window_deviation_days: float,
) -> tuple:
    """
    计算依从性综合评分

    权重：到访率 40%、问卷完成率 30%、时间窗偏差 30%
    时间窗偏差：0 天=100 分，>3 天开始扣分，>7 天=0 分

    返回: (score, level)
    """
    attendance_score = min(visit_attendance_rate, 100.0)
    questionnaire_score = min(questionnaire_completion_rate, 100.0)

    deviation = abs(time_window_deviation_days)
    if deviation <= 0:
        time_score = 100.0
    elif deviation <= 3:
        time_score = 100.0 - (deviation / 3.0) * 30.0
    elif deviation <= 7:
        time_score = 70.0 - ((deviation - 3) / 4.0) * 70.0
    else:
        time_score = 0.0

    overall = attendance_score * 0.4 + questionnaire_score * 0.3 + time_score * 0.3

    if overall >= 90:
        level = ComplianceLevel.EXCELLENT
    elif overall >= 75:
        level = ComplianceLevel.GOOD
    elif overall >= 60:
        level = ComplianceLevel.FAIR
    elif overall >= 40:
        level = ComplianceLevel.POOR
    else:
        level = ComplianceLevel.NON_COMPLIANT

    return round(overall, 2), level


def assess_compliance(
    subject_id: int,
    enrollment_id: int = None,
    visit_attendance_rate: float = 100.0,
    questionnaire_completion_rate: float = 100.0,
    time_window_deviation_days: float = 0,
    notes: str = '',
    assessed_by_id: int = None,
) -> ComplianceRecord:
    """创建依从性评估记录"""
    score, level = calculate_compliance_score(
        visit_attendance_rate, questionnaire_completion_rate, time_window_deviation_days,
    )
    return ComplianceRecord.objects.create(
        subject_id=subject_id,
        enrollment_id=enrollment_id,
        assessment_date=timezone.now().date(),
        visit_attendance_rate=Decimal(str(visit_attendance_rate)),
        questionnaire_completion_rate=Decimal(str(questionnaire_completion_rate)),
        time_window_deviation=Decimal(str(time_window_deviation_days)),
        overall_score=Decimal(str(score)),
        level=level,
        notes=notes,
        assessed_by_id=assessed_by_id,
    )


def detect_visit_gaps(enrollment_id: int) -> list:
    """
    检测已计划但未完成的访视缺口。

    扫描该入组记录关联的所有访视节点和工单，找出已过计划日期但未完成的访视。

    Args:
        enrollment_id: 入组记录 ID

    Returns:
        缺失项列表，每项包含 visit_node、scheduled_date、gap_days、status
    """
    import logging
    from datetime import date

    logger = logging.getLogger(__name__)

    try:
        from ..models import Enrollment
        enrollment = Enrollment.objects.filter(id=enrollment_id).first()
        if not enrollment:
            return []
    except Exception as e:
        logger.warning(f'入组记录查询异常: {e}')
        return []

    gaps = []
    today = date.today()

    try:
        from apps.workorder.models import WorkOrder, WorkOrderStatus
        work_orders = WorkOrder.objects.filter(
            enrollment_id=enrollment_id,
            is_deleted=False,
        ).select_related('visit_node').order_by('scheduled_date')

        for wo in work_orders:
            if wo.status in (WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED, WorkOrderStatus.CANCELLED):
                continue

            sched_date = wo.scheduled_date
            if not sched_date:
                continue

            if sched_date < today:
                gap_days = (today - sched_date).days
                gaps.append({
                    'work_order_id': wo.id,
                    'visit_node_id': wo.visit_node_id,
                    'visit_node_name': wo.visit_node.name if wo.visit_node else '',
                    'scheduled_date': str(sched_date),
                    'gap_days': gap_days,
                    'status': wo.status,
                    'title': wo.title,
                    'severity': 'high' if gap_days > 7 else ('medium' if gap_days > 3 else 'low'),
                })

        gaps.sort(key=lambda x: -x['gap_days'])
        logger.info(f'访视缺口检测: enrollment={enrollment_id}, gaps={len(gaps)}')
    except Exception as e:
        logger.warning(f'访视缺口检测异常: {e}')

    return gaps


def list_compliance_records(subject_id: int, enrollment_id: int = None) -> list:
    qs = ComplianceRecord.objects.filter(subject_id=subject_id)
    if enrollment_id:
        qs = qs.filter(enrollment_id=enrollment_id)
    return list(qs.order_by('-assessment_date'))
