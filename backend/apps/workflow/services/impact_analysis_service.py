"""
变更影响分析服务

分析方案变更对排程/工单/受试者的级联影响，帮助执行负责人
在审批变更前量化评估影响范围。
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class ImpactAnalysisService:
    """变更影响分析"""

    @classmethod
    def analyze_protocol_change(
        cls,
        protocol_id: int,
        change_type: str = 'protocol_amendment',
        change_description: str = '',
    ) -> dict:
        """
        分析方案变更对排程/工单/受试者的级联影响

        Returns:
            {
                'affected_slots': int,
                'affected_work_orders': int,
                'affected_enrollments': int,
                'slot_details': [...],
                'workorder_details': [...],
                'enrollment_details': [...],
            }
        """
        from apps.protocol.models import Protocol
        from apps.scheduling.models import ScheduleSlot, SlotStatus
        from apps.workorder.models import WorkOrder
        from apps.subject.models import Enrollment
        from apps.visit.models import VisitPlan

        protocol = Protocol.objects.filter(id=protocol_id).first()
        if not protocol:
            raise ValueError(f'协议不存在: id={protocol_id}')

        # 1. 受影响的排程槽位（所有关联该协议且未完成的槽位）
        visit_plans = VisitPlan.objects.filter(protocol=protocol, is_deleted=False)
        affected_slots = ScheduleSlot.objects.filter(
            schedule_plan__visit_plan__in=visit_plans,
            status__in=[SlotStatus.PLANNED, SlotStatus.CONFIRMED],
        ).select_related('visit_node', 'schedule_plan')

        slot_details = [{
            'id': s.id,
            'visit_node_name': s.visit_node.name if s.visit_node else '',
            'scheduled_date': str(s.scheduled_date),
            'status': s.status,
        } for s in affected_slots]

        # 2. 受影响的工单（未完成的）
        affected_wos = WorkOrder.objects.filter(
            enrollment__protocol=protocol,
            is_deleted=False,
            status__in=['pending', 'assigned', 'in_progress'],
        ).select_related('enrollment__subject')

        wo_details = [{
            'id': wo.id,
            'title': wo.title,
            'status': wo.status,
            'subject_name': wo.enrollment.subject.name if wo.enrollment and wo.enrollment.subject else '',
        } for wo in affected_wos]

        # 3. 受影响的入组（活跃中的入组）
        affected_enrollments = Enrollment.objects.filter(
            protocol=protocol,
            status__in=['pending', 'enrolled'],
        ).select_related('subject')

        enrollment_details = [{
            'id': e.id,
            'subject_id': e.subject_id,
            'subject_name': e.subject.name if e.subject else '',
            'status': e.status,
        } for e in affected_enrollments]

        result = {
            'protocol_id': protocol_id,
            'protocol_title': protocol.title,
            'change_type': change_type,
            'affected_slots': affected_slots.count(),
            'affected_work_orders': affected_wos.count(),
            'affected_enrollments': affected_enrollments.count(),
            'slot_details': slot_details[:50],
            'workorder_details': wo_details[:50],
            'enrollment_details': enrollment_details[:50],
        }

        logger.info(
            f'影响分析完成: protocol={protocol_id}, '
            f'slots={result["affected_slots"]}, '
            f'wos={result["affected_work_orders"]}, '
            f'enrollments={result["affected_enrollments"]}'
        )
        return result

    @classmethod
    def analyze_schedule_change(cls, schedule_plan_id: int) -> dict:
        """分析排程变更的影响"""
        from apps.scheduling.models import SchedulePlan, ScheduleSlot, SlotStatus
        from apps.workorder.models import WorkOrder

        plan = SchedulePlan.objects.filter(id=schedule_plan_id).first()
        if not plan:
            raise ValueError(f'排程计划不存在: id={schedule_plan_id}')

        affected_slots = ScheduleSlot.objects.filter(
            schedule_plan=plan,
            status__in=[SlotStatus.PLANNED, SlotStatus.CONFIRMED],
        ).count()

        affected_wos = WorkOrder.objects.filter(
            schedule_slot__schedule_plan=plan,
            is_deleted=False,
            status__in=['pending', 'assigned', 'in_progress'],
        ).count()

        return {
            'schedule_plan_id': schedule_plan_id,
            'plan_name': plan.name,
            'affected_slots': affected_slots,
            'affected_work_orders': affected_wos,
            'affected_enrollments': 0,
        }
