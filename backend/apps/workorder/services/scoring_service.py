"""
多维度派送评分服务

S4-1：增强派送算法

评分维度（总分 100）：
- 工作负荷（30 分）：在手工单越少得分越高
- 资质匹配（25 分）：GCP 有效 + 活动模板要求的资质
- 项目熟悉度（20 分）：已分配到该项目 + 历史完成工单数
- 距离/可用性（15 分）：当日无排程冲突
- 绩效（10 分）：历史质量审计通过率
"""
import logging
from typing import List, Dict, Optional
from datetime import date
from django.db.models import Q

from apps.workorder.models import WorkOrder, WorkOrderStatus
from apps.workorder.query_utils import filter_by_assignee

logger = logging.getLogger(__name__)


class DispatchScoringService:
    """多维度评分服务"""

    # 权重配置
    WEIGHTS = {
        'workload': 30,
        'qualification': 25,
        'familiarity': 20,
        'availability': 15,
        'performance': 10,
    }

    @classmethod
    def score_candidates(
        cls,
        work_order: WorkOrder,
        candidate_ids: List[int],
    ) -> List[Dict]:
        """
        对候选人进行多维度评分

        Returns:
            [{'user_id': int, 'total_score': float, 'breakdown': {...}}, ...]
            按 total_score 降序排列
        """
        results = []
        for uid in candidate_ids:
            breakdown = {
                'workload': cls._score_workload(uid),
                'qualification': cls._score_qualification(uid, work_order),
                'familiarity': cls._score_familiarity(uid, work_order),
                'availability': cls._score_availability(uid, work_order),
                'performance': cls._score_performance(uid),
            }
            total = sum(breakdown.values())
            results.append({
                'user_id': uid,
                'total_score': round(total, 1),
                'breakdown': breakdown,
            })

        results.sort(key=lambda x: x['total_score'], reverse=True)
        return results

    @classmethod
    def get_best_candidate(
        cls,
        work_order: WorkOrder,
        candidate_ids: List[int],
    ) -> Optional[Dict]:
        """获取最优候选人"""
        scored = cls.score_candidates(work_order, candidate_ids)
        return scored[0] if scored else None

    @classmethod
    def _score_workload(cls, user_id: int) -> float:
        """
        工作负荷评分（0-30）

        在手工单数 0→30分，1→27分，2→24分，...，10+→0分
        """
        max_score = cls.WEIGHTS['workload']
        active_count = filter_by_assignee(WorkOrder.objects.filter(
            is_deleted=False,
            status__in=[WorkOrderStatus.PENDING, WorkOrderStatus.IN_PROGRESS],
        ), user_id).count()

        score = max(0, max_score - active_count * 3)
        return float(score)

    @classmethod
    def _score_qualification(cls, user_id: int, wo: WorkOrder) -> float:
        """
        资质匹配评分（0-25）

        GCP 有效 +15，活动模板资质匹配 +10
        """
        max_score = cls.WEIGHTS['qualification']
        score = 0.0

        try:
            from apps.hr.models import Staff
            staff = Staff.objects.filter(
                Q(account_fk_id=user_id) | Q(account_id=user_id),
                is_deleted=False,
            ).first()
            if not staff:
                return 0.0

            # GCP 有效
            if staff.gcp_status == 'valid':
                score += 15.0
            elif staff.gcp_status == 'expiring':
                score += 10.0

            # 活动模板资质匹配
            if wo.visit_activity_id:
                from apps.visit.models import VisitActivity
                from apps.resource.models import ActivityTemplate
                activity = VisitActivity.objects.filter(id=wo.visit_activity_id).first()
                if activity and activity.activity_template_id:
                    template = ActivityTemplate.objects.filter(
                        id=activity.activity_template_id
                    ).first()
                    if template:
                        requirements = template.qualification_requirements or []
                        if not requirements:
                            score += 10.0
                        else:
                            all_certs = (staff.gcp_cert or '') + ' ' + (staff.other_certs or '')
                            matched = sum(1 for r in requirements
                                          if r.get('name', '') in all_certs)
                            if matched == len(requirements):
                                score += 10.0
                            elif matched > 0:
                                score += 5.0
        except Exception as e:
            logger.debug(f'资质评分失败: {e}')

        return min(score, max_score)

    @classmethod
    def _score_familiarity(cls, user_id: int, wo: WorkOrder) -> float:
        """
        项目熟悉度评分（0-20）

        已分配到该项目 +10，历史完成工单数按比例 +0~10
        """
        max_score = cls.WEIGHTS['familiarity']
        score = 0.0

        # 获取关联的 protocol_id
        protocol_id = None
        if wo.enrollment_id:
            try:
                from apps.subject.models import Enrollment
                enrollment = Enrollment.objects.filter(id=wo.enrollment_id).first()
                if enrollment:
                    protocol_id = enrollment.protocol_id
            except Exception:
                pass

        if protocol_id:
            # 是否已分配到该项目
            try:
                from apps.hr.models import ProjectAssignment, Staff
                staff = Staff.objects.filter(
                    Q(account_fk_id=user_id) | Q(account_id=user_id),
                    is_deleted=False,
                ).first()
                if staff:
                    assigned = ProjectAssignment.objects.filter(
                        protocol_id=protocol_id, staff=staff, is_active=True,
                    ).exists()
                    if assigned:
                        score += 10.0
            except Exception:
                pass

        # 历史完成工单数
        completed = filter_by_assignee(WorkOrder.objects.filter(
            is_deleted=False,
            status=WorkOrderStatus.COMPLETED,
        ), user_id).count()
        # 每完成5个工单 +2分，最多10分
        score += min(10.0, completed * 2.0)

        return min(score, max_score)

    @classmethod
    def _score_availability(cls, user_id: int, wo: WorkOrder) -> float:
        """
        可用性评分（0-15）

        当日无排程冲突 +15
        """
        max_score = cls.WEIGHTS['availability']

        target_date = wo.scheduled_date or date.today()

        try:
            from apps.scheduling.models import ScheduleSlot
            conflicts = ScheduleSlot.objects.filter(
                assigned_to_id=user_id,
                scheduled_date=target_date,
                status__in=['planned', 'confirmed'],
            ).count()

            if conflicts == 0:
                return max_score
            elif conflicts <= 2:
                return max_score * 0.5
            else:
                return 0.0
        except Exception:
            return max_score * 0.5

    @classmethod
    def _score_performance(cls, user_id: int) -> float:
        """
        绩效评分（0-10）

        基于历史质量审计通过率
        """
        max_score = cls.WEIGHTS['performance']

        try:
            from apps.workorder.models import WorkOrderQualityAudit
            audits = WorkOrderQualityAudit.objects.filter(
                Q(work_order__assigned_to_account_id=user_id) | Q(work_order__assigned_to=user_id),
            )
            total = audits.count()
            if total == 0:
                return max_score * 0.7  # 无历史记录给中等分

            passed = audits.filter(result='auto_pass').count()
            pass_rate = passed / total
            return round(max_score * pass_rate, 1)
        except Exception:
            return max_score * 0.5
