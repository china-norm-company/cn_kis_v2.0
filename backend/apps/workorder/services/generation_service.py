"""
工单自动生成服务

来源：cn_kis_test workorder/services/generation_service.py

核心逻辑：
排程发布后，为已入组的受试者自动生成工单。
每个 VisitActivity → 一个 WorkOrder，自动关联 BOM 资源。
"""
import logging
from typing import List
from datetime import datetime

from django.db import transaction

from apps.workorder.models import WorkOrder, WorkOrderResource, WorkOrderStatus
from apps.scheduling.models import SchedulePlan, ScheduleSlot, SchedulePlanStatus
from apps.visit.models import VisitActivity
from apps.resource.models import ActivityBOM
from apps.subject.models import Enrollment, EnrollmentStatus

logger = logging.getLogger(__name__)


class WorkOrderGenerationService:
    """工单自动生成服务"""

    @classmethod
    @transaction.atomic
    def generate_for_schedule_plan(cls, schedule_plan_id: int) -> List[WorkOrder]:
        """
        为已发布的排程计划生成工单

        逻辑：
        1. 获取排程计划下的所有时间槽
        2. 获取协议下所有已入组的受试者
        3. 每个受试者 × 每个时间槽 × 每个活动 → 生成工单
        """
        schedule_plan = SchedulePlan.objects.filter(id=schedule_plan_id).first()
        if not schedule_plan:
            raise ValueError(f'排程计划不存在: id={schedule_plan_id}')

        if schedule_plan.status != SchedulePlanStatus.PUBLISHED:
            raise ValueError(f'排程计划未发布: status={schedule_plan.status}')

        visit_plan = schedule_plan.visit_plan
        protocol = visit_plan.protocol

        # 获取协议下已入组的受试者
        enrollments = Enrollment.objects.filter(
            protocol=protocol, status=EnrollmentStatus.ENROLLED,
        ).select_related('subject')
        if not enrollments.exists():
            logger.warning(f'协议 {protocol.id} 下无已入组受试者，跳过工单生成')
            return []

        # 获取所有时间槽
        slots = ScheduleSlot.objects.filter(
            schedule_plan=schedule_plan
        ).select_related('visit_node')

        all_work_orders = []

        for enrollment in enrollments:
            for slot in slots:
                activities = VisitActivity.objects.filter(
                    node=slot.visit_node, is_required=True,
                ).select_related('activity_template')

                for activity in activities:
                    # 幂等检查：避免重复生成
                    existing = WorkOrder.objects.filter(
                        enrollment=enrollment,
                        visit_activity=activity,
                        schedule_slot=slot,
                        is_deleted=False,
                    ).exists()
                    if existing:
                        continue

                    wo = cls._create_work_order_for_activity(
                        enrollment=enrollment,
                        slot=slot,
                        activity=activity,
                    )
                    all_work_orders.append(wo)

        logger.info(
            f'工单自动生成完成: schedule_plan={schedule_plan_id}, '
            f'enrollments={enrollments.count()}, work_orders={len(all_work_orders)}'
        )
        return all_work_orders

    @classmethod
    @transaction.atomic
    def generate_for_enrollment(
        cls,
        enrollment_id: int,
        visit_plan_id: int,
    ) -> List[WorkOrder]:
        """
        为单个受试者生成工单

        在受试者入组时调用，基于已有的排程计划生成工单。
        """
        from apps.visit.models import VisitPlan

        enrollment = Enrollment.objects.filter(id=enrollment_id).first()
        if not enrollment:
            raise ValueError(f'入组记录不存在: id={enrollment_id}')

        visit_plan = VisitPlan.objects.filter(id=visit_plan_id, is_deleted=False).first()
        if not visit_plan:
            raise ValueError(f'访视计划不存在: id={visit_plan_id}')

        # 查找已发布的排程计划
        schedule_plan = SchedulePlan.objects.filter(
            visit_plan=visit_plan, status=SchedulePlanStatus.PUBLISHED
        ).first()
        if not schedule_plan:
            raise ValueError(f'访视计划 {visit_plan_id} 无已发布的排程计划')

        slots = ScheduleSlot.objects.filter(
            schedule_plan=schedule_plan
        ).select_related('visit_node')

        work_orders = []
        for slot in slots:
            activities = VisitActivity.objects.filter(
                node=slot.visit_node, is_required=True,
            ).select_related('activity_template')

            for activity in activities:
                existing = WorkOrder.objects.filter(
                    enrollment=enrollment,
                    visit_activity=activity,
                    schedule_slot=slot,
                    is_deleted=False,
                ).exists()
                if existing:
                    continue

                wo = cls._create_work_order_for_activity(
                    enrollment=enrollment,
                    slot=slot,
                    activity=activity,
                )
                work_orders.append(wo)

        logger.info(
            f'单受试者工单生成: enrollment={enrollment_id}, '
            f'work_orders={len(work_orders)}'
        )
        return work_orders

    @classmethod
    def _create_work_order_for_activity(
        cls,
        enrollment: Enrollment,
        slot: ScheduleSlot,
        activity: VisitActivity,
    ) -> WorkOrder:
        """为单个活动创建工单"""
        wo = WorkOrder.objects.create(
            enrollment=enrollment,
            visit_node=slot.visit_node,
            visit_activity=activity,
            schedule_slot=slot,
            title=f'{enrollment.subject.name if hasattr(enrollment, "subject") else "受试者"} - {activity.name}',
            description=activity.description,
            work_order_type=activity.activity_type or 'visit',
            status=WorkOrderStatus.PENDING,
            scheduled_date=slot.scheduled_date,
            due_date=datetime.combine(slot.scheduled_date, slot.end_time) if slot.end_time else None,
        )

        # 关联 BOM 资源
        if activity.activity_template_id:
            bom_items = ActivityBOM.objects.filter(
                template_id=activity.activity_template_id
            ).select_related('resource_category')

            wo_resources = []
            for bom in bom_items:
                wo_resources.append(WorkOrderResource(
                    work_order=wo,
                    resource_category=bom.resource_category,
                    required_quantity=bom.quantity,
                    is_mandatory=bom.is_mandatory,
                ))
            if wo_resources:
                WorkOrderResource.objects.bulk_create(wo_resources)

        return wo
