"""
智能排程服务

来源：cn_kis_test scheduling/ + visit/services/scheduling_service.py

核心能力：
- 创建排程计划
- 自动生成时间槽（base_day + start_date）
- 冲突检测（设备时间重叠、人员资质不匹配）
- 发布（触发飞书日历 + 工单生成）
"""
import logging
from datetime import timedelta, time as time_type
from typing import List, Optional

from django.db import transaction

from .models import SchedulePlan, ScheduleSlot, SchedulePlanStatus, SlotStatus
from apps.visit.models import VisitPlan, VisitNode, ResourceDemand, ResourceDemandStatus

logger = logging.getLogger(__name__)


class SchedulingQueryService:
    """排程查询服务"""

    @classmethod
    def list_plans(
        cls,
        status: Optional[str] = None,
        visit_plan_id: Optional[int] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        """排程计划分页列表"""
        qs = SchedulePlan.objects.all().order_by('-create_time')
        if status:
            qs = qs.filter(status=status)
        if visit_plan_id:
            qs = qs.filter(visit_plan_id=visit_plan_id)
        total = qs.count()
        offset = (page - 1) * page_size
        items = list(qs[offset:offset + page_size])
        return {'items': items, 'total': total, 'page': page, 'page_size': page_size}

    @classmethod
    def list_slots_by_range(
        cls,
        start_date=None,
        end_date=None,
        assigned_to_id: Optional[int] = None,
        plan_id: Optional[int] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict:
        """按日期范围查询时间槽"""
        qs = ScheduleSlot.objects.select_related(
            'visit_node', 'schedule_plan',
        ).order_by('scheduled_date', 'start_time')
        if start_date:
            qs = qs.filter(scheduled_date__gte=start_date)
        if end_date:
            qs = qs.filter(scheduled_date__lte=end_date)
        if assigned_to_id:
            qs = qs.filter(assigned_to_id=assigned_to_id)
        if plan_id:
            qs = qs.filter(schedule_plan_id=plan_id)
        if status:
            qs = qs.filter(status=status)
        total = qs.count()
        offset = (page - 1) * page_size
        items = list(qs[offset:offset + page_size])
        return {'items': items, 'total': total, 'page': page, 'page_size': page_size}

    @classmethod
    @transaction.atomic
    def update_slot(
        cls,
        slot_id: int,
        scheduled_date=None,
        start_time=None,
        end_time=None,
        assigned_to_id: Optional[int] = None,
    ) -> ScheduleSlot:
        """更新时间槽（日期、时间、执行人）"""
        slot = ScheduleSlot.objects.filter(id=slot_id).first()
        if not slot:
            raise ValueError(f'时间槽不存在: id={slot_id}')
        if slot.status in (SlotStatus.COMPLETED, SlotStatus.CANCELLED):
            raise ValueError(f'已完成或已取消的时间槽不可修改: status={slot.status}')

        update_fields = ['update_time']
        if scheduled_date is not None:
            slot.scheduled_date = scheduled_date
            update_fields.append('scheduled_date')
        if start_time is not None:
            slot.start_time = start_time
            update_fields.append('start_time')
        if end_time is not None:
            slot.end_time = end_time
            update_fields.append('end_time')
        if assigned_to_id is not None:
            slot.assigned_to_id = assigned_to_id if assigned_to_id > 0 else None
            update_fields.append('assigned_to_id')

        # 如果有冲突状态，调整后重置为 planned
        if slot.status == SlotStatus.CONFLICT:
            slot.status = SlotStatus.PLANNED
            slot.conflict_reason = ''
            update_fields.extend(['status', 'conflict_reason'])

        slot.save(update_fields=update_fields)
        logger.info(f'时间槽已更新: slot_id={slot_id}, fields={update_fields}')
        return slot


class IntelligentSchedulingService:
    """智能排程服务"""

    @classmethod
    @transaction.atomic
    def create_schedule_plan(
        cls,
        visit_plan_id: int,
        start_date,
        end_date,
        name: str = '',
        created_by_id: int = None,
    ) -> SchedulePlan:
        """
        创建排程计划

        Args:
            visit_plan_id: 访视计划 ID
            start_date: 排程开始日期
            end_date: 排程结束日期
        """
        plan = VisitPlan.objects.filter(id=visit_plan_id, is_deleted=False).first()
        if not plan:
            raise ValueError(f'访视计划不存在: id={visit_plan_id}')

        # 获取已审批的资源需求
        demand = ResourceDemand.objects.filter(
            visit_plan=plan, status=ResourceDemandStatus.APPROVED
        ).first()

        schedule_name = name or f'{plan.name} - 排程'

        return SchedulePlan.objects.create(
            visit_plan=plan,
            resource_demand=demand,
            name=schedule_name,
            start_date=start_date,
            end_date=end_date,
            status=SchedulePlanStatus.DRAFT,
            created_by_id=created_by_id,
        )

    @classmethod
    @transaction.atomic
    def generate_schedule_slots(
        cls,
        plan_id: int,
        default_start_time: str = '09:00',
        default_end_time: str = '17:00',
    ) -> List[ScheduleSlot]:
        """
        自动生成时间槽

        每个 VisitNode → 一个 ScheduleSlot
        日期 = start_date + node.baseline_day
        """
        schedule_plan = SchedulePlan.objects.filter(id=plan_id).first()
        if not schedule_plan:
            raise ValueError(f'排程计划不存在: id={plan_id}')

        # 清除旧的时间槽
        ScheduleSlot.objects.filter(schedule_plan=schedule_plan).delete()

        nodes = VisitNode.objects.filter(
            plan=schedule_plan.visit_plan
        ).order_by('order')

        start_h, start_m = map(int, default_start_time.split(':'))
        end_h, end_m = map(int, default_end_time.split(':'))
        default_start = time_type(start_h, start_m)
        default_end = time_type(end_h, end_m)

        slots = []
        for node in nodes:
            scheduled_date = schedule_plan.start_date + timedelta(days=node.baseline_day)

            # 日期超出排程范围则跳过
            if scheduled_date > schedule_plan.end_date:
                logger.warning(
                    f'访视节点 {node.name}(Day {node.baseline_day}) '
                    f'超出排程结束日期 {schedule_plan.end_date}，跳过'
                )
                continue

            slot = ScheduleSlot.objects.create(
                schedule_plan=schedule_plan,
                visit_node=node,
                scheduled_date=scheduled_date,
                start_time=default_start,
                end_time=default_end,
                status=SlotStatus.PLANNED,
            )
            slots.append(slot)

        # 更新计划状态
        schedule_plan.status = SchedulePlanStatus.GENERATED
        schedule_plan.save(update_fields=['status', 'update_time'])

        logger.info(f'时间槽生成完成: plan_id={plan_id}, slots={len(slots)}')
        return slots

    @classmethod
    def detect_conflicts(cls, plan_id: int) -> List[dict]:
        """
        冲突检测

        检测规则：
        1. 同一执行人在同一时间段有多个排程
        2. 设备校准过期（next_calibration_date < scheduled_date）
        """
        schedule_plan = SchedulePlan.objects.filter(id=plan_id).first()
        if not schedule_plan:
            raise ValueError(f'排程计划不存在: id={plan_id}')

        slots = ScheduleSlot.objects.filter(
            schedule_plan=schedule_plan
        ).order_by('scheduled_date', 'start_time')

        conflicts = []

        # 检测执行人时间冲突（支持 3+ 冲突检测）
        from collections import defaultdict
        person_slots = defaultdict(list)
        for slot in slots:
            if slot.assigned_to_id:
                key = (slot.assigned_to_id, slot.scheduled_date)
                person_slots[key].append(slot)

        for key, slot_list in person_slots.items():
            if len(slot_list) < 2:
                continue
            for i in range(len(slot_list)):
                for j in range(i + 1, len(slot_list)):
                    s1, s2 = slot_list[i], slot_list[j]
                    if cls._time_overlaps(s1.start_time, s1.end_time, s2.start_time, s2.end_time):
                        conflicts.append({
                            'type': 'person_overlap',
                            'severity': 'high',
                            'slot_id': s2.id,
                            'conflict_with_slot_id': s1.id,
                            'message': (
                                f'执行人 #{key[0]} 在 {key[1]} '
                                f'存在时间冲突'
                            ),
                        })
                        s2.status = SlotStatus.CONFLICT
                        s2.conflict_reason = f'执行人时间冲突（与 slot#{s1.id}）'
                        s2.save(update_fields=['status', 'conflict_reason', 'update_time'])

        # 检测设备校准过期
        from apps.visit.models import VisitActivity
        from apps.resource.models import ActivityBOM, ResourceItem

        for slot in slots:
            activities = VisitActivity.objects.filter(
                node=slot.visit_node, activity_template__isnull=False
            )
            for act in activities:
                bom_items = ActivityBOM.objects.filter(
                    template=act.activity_template,
                    resource_category__resource_type='equipment',
                    is_mandatory=True,
                )
                for bom in bom_items:
                    expired_items = ResourceItem.objects.filter(
                        category=bom.resource_category,
                        is_deleted=False,
                        next_calibration_date__lt=slot.scheduled_date,
                    )
                    for item in expired_items:
                        conflicts.append({
                            'type': 'equipment_calibration_expired',
                            'severity': 'high',
                            'slot_id': slot.id,
                            'resource_item_id': item.id,
                            'message': (
                                f'设备 {item.name}({item.code}) 校准已过期'
                                f'（{item.next_calibration_date}），'
                                f'排程日期 {slot.scheduled_date}'
                            ),
                        })

        logger.info(f'冲突检测完成: plan_id={plan_id}, conflicts={len(conflicts)}')
        return conflicts

    @classmethod
    @transaction.atomic
    def publish_plan(cls, plan_id: int) -> SchedulePlan:
        """
        发布排程计划

        1. 启动门禁：资质、设备、SOP、伦理、物料未通过则禁止发布
        2. 校验无冲突（或用户确认忽略）
        3. 批量创建飞书日历事件
        4. 触发工单生成（由 S1-5 的 generation_service 处理）
        """
        schedule_plan = SchedulePlan.objects.select_related('visit_plan').filter(id=plan_id).first()
        if not schedule_plan:
            raise ValueError(f'排程计划不存在: id={plan_id}')

        if schedule_plan.status not in (SchedulePlanStatus.GENERATED, SchedulePlanStatus.DRAFT):
            raise ValueError(f'当前状态不可发布: {schedule_plan.status}')

        # P1-startup-gates：启动硬门禁，未通过则禁止排程/工单发布
        if schedule_plan.visit_plan_id:
            from apps.quality.services import check_project_start_gate
            protocol_id = getattr(
                schedule_plan.visit_plan,
                'protocol_id',
                None,
            )
            if protocol_id is not None:
                gate_result = check_project_start_gate(protocol_id)
                if not gate_result.get('passed'):
                    failed = [c for c in gate_result.get('checks', []) if not c.get('passed')]
                    msg = '；'.join(
                        f"{c.get('name', '')}: {c.get('detail', '')}" for c in failed[:5]
                    )
                    raise ValueError(f'项目启动门禁未通过，禁止发布排程：{msg}')

        try:
            from apps.secretary.evidence_gate_service import check_business_gate
            passed, reason, gate_run_id = check_business_gate(
                'release_digital_worker',
                {'skill_id': 'visit-scheduler', 'role_code': 'scheduling_optimizer'},
            )
            if not passed:
                raise ValueError(f'数字员工门禁未通过，禁止发布排程：{reason}')
        except ImportError:
            pass

        slots = ScheduleSlot.objects.filter(schedule_plan=schedule_plan)

        # 飞书日历事件创建（非关键路径，失败不影响发布）
        calendar_synced_count = 0
        try:
            calendar_synced_count = cls._create_feishu_calendar_events(schedule_plan, slots)
        except Exception as e:
            logger.warning(f'飞书日历事件创建失败（不影响发布）: {e}')

        # 事务内：更新状态 + 生成工单，任一失败则整体回滚
        with transaction.atomic():
            schedule_plan.status = SchedulePlanStatus.PUBLISHED
            schedule_plan.save(update_fields=['status', 'update_time'])

            slots.filter(status=SlotStatus.PLANNED).update(status=SlotStatus.CONFIRMED)

            logger.info(f'排程已发布: plan_id={plan_id}, slots={slots.count()}')

            # S1-5 联动：排程发布后自动为已入组受试者生成工单
            from apps.workorder.services.generation_service import WorkOrderGenerationService
            work_orders = WorkOrderGenerationService.generate_for_schedule_plan(plan_id)
            logger.info(f'排程发布后自动生成 {len(work_orders)} 个工单')

        # 排程→排班联动：输出人员能力需求给 lab_personnel
        try:
            cls._notify_personnel_capacity_needs(schedule_plan, slots)
        except Exception as e:
            logger.warning(f'排程→排班联动失败（不影响发布）: {e}')

        schedule_plan._calendar_synced_count = calendar_synced_count
        return schedule_plan

    @classmethod
    def _create_feishu_calendar_events(cls, schedule_plan: SchedulePlan, slots) -> int:
        """批量创建飞书日历事件，返回成功创建的事件数"""
        synced = 0
        try:
            from libs.feishu_client import feishu_client
            import os
            calendar_id = os.getenv('FEISHU_CALENDAR_ID', '')
            if not calendar_id:
                logger.warning('FEISHU_CALENDAR_ID 未配置，跳过飞书日历事件创建')
                return 0

            for slot in slots:
                if slot.status == SlotStatus.CONFLICT:
                    continue
                try:
                    from datetime import datetime, timezone
                    start_dt = datetime.combine(
                        slot.scheduled_date,
                        slot.start_time or time_type(9, 0),
                    )
                    end_dt = datetime.combine(
                        slot.scheduled_date,
                        slot.end_time or time_type(17, 0),
                    )
                    start_ts = str(int(start_dt.timestamp()))
                    end_ts = str(int(end_dt.timestamp()))

                    event_data = feishu_client.create_calendar_event(
                        calendar_id=calendar_id,
                        summary=f'[CN_KIS] {slot.visit_node.name}',
                        start_time=start_ts,
                        end_time=end_ts,
                        description=(
                            f'排程: {schedule_plan.name}\n'
                            f'访视: {slot.visit_node.name}\n'
                            f'日期: {slot.scheduled_date}'
                        ),
                    )
                    if event_data:
                        event_id = event_data.get('event_id', '')
                        slot.feishu_calendar_event_id = event_id
                        slot.save(update_fields=['feishu_calendar_event_id', 'update_time'])
                        synced += 1
                except Exception as e:
                    logger.error(f'飞书日历事件创建失败 slot#{slot.id}: {e}')

        except Exception as e:
            logger.error(f'飞书日历事件批量创建失败: {e}')
        return synced

    @classmethod
    def _time_overlaps(cls, s1_start, s1_end, s2_start, s2_end) -> bool:
        """检测两个时间段是否重叠"""
        if not all([s1_start, s1_end, s2_start, s2_end]):
            return False
        return s1_start < s2_end and s2_start < s1_end

    @classmethod
    def _notify_personnel_capacity_needs(cls, schedule_plan, slots):
        """
        排程→排班联动：分析排程中的人员能力需求，
        在 lab_personnel 创建产能缺口蓝色提醒。
        """
        from collections import defaultdict
        from apps.lab_personnel.models_risk import RiskAlert, RiskLevel, RiskType, RiskStatus

        date_needs = defaultdict(int)
        for slot in slots:
            date_needs[slot.scheduled_date] += 1

        for sdate, count in date_needs.items():
            if count >= 5:
                existing = RiskAlert.objects.filter(
                    risk_type=RiskType.CAPACITY_GAP,
                    status__in=[RiskStatus.OPEN, RiskStatus.ACKNOWLEDGED],
                    related_object_type='schedule_plan',
                    related_object_id=schedule_plan.id,
                ).first()
                if not existing:
                    RiskAlert.objects.create(
                        risk_type=RiskType.CAPACITY_GAP,
                        level=RiskLevel.BLUE,
                        title=f'排程发布: {sdate} 需要 {count} 个执行时间槽',
                        description=(
                            f'排程计划#{schedule_plan.id} 已发布，'
                            f'{sdate} 共有 {count} 个时间槽需要人员执行。\n'
                            f'请确认排班安排能满足需求。'
                        ),
                        related_object_type='schedule_plan',
                        related_object_id=schedule_plan.id,
                    )
                    logger.info(f'排程→排班联动: 已创建产能需求提醒 ({sdate}: {count}槽)')


# ============================================================================
# 里程碑 CRUD 服务
# ============================================================================
class MilestoneService:
    """排程里程碑服务"""

    @classmethod
    def create_milestone(
        cls, plan_id: int, milestone_type: str, name: str,
        target_date=None, description: str = '',
    ):
        from apps.scheduling.models import ScheduleMilestone
        plan = SchedulePlan.objects.filter(id=plan_id).first()
        if not plan:
            raise ValueError(f'排程计划不存在: id={plan_id}')

        milestone = ScheduleMilestone.objects.create(
            schedule_plan=plan,
            milestone_type=milestone_type,
            name=name,
            target_date=target_date,
            description=description,
        )
        return milestone

    @classmethod
    def list_milestones(cls, plan_id: int):
        from apps.scheduling.models import ScheduleMilestone
        return list(ScheduleMilestone.objects.filter(
            schedule_plan_id=plan_id,
        ).order_by('target_date'))

    @classmethod
    def achieve_milestone(cls, milestone_id: int, actual_date=None):
        from apps.scheduling.models import ScheduleMilestone
        from django.utils import timezone as tz
        m = ScheduleMilestone.objects.filter(id=milestone_id).first()
        if not m:
            return None
        m.is_achieved = True
        m.actual_date = actual_date or tz.now().date()
        m.save(update_fields=['is_achieved', 'actual_date', 'update_time'])
        return m

    @classmethod
    def delete_milestone(cls, milestone_id: int) -> bool:
        from apps.scheduling.models import ScheduleMilestone
        m = ScheduleMilestone.objects.filter(id=milestone_id).first()
        if not m:
            return False
        m.delete()
        return True


def generate_schedule_conflict_report(plan_id: int) -> dict:
    """
    生成排程冲突报告。

    检查指定排程计划中 ScheduleSlot 之间的人员、设备、场地冲突，
    并给出调整建议。

    返回: {'conflicts': [...], 'recommendations': [...]}
    """
    from collections import defaultdict

    schedule_plan = SchedulePlan.objects.filter(id=plan_id).first()
    if not schedule_plan:
        raise ValueError(f'排程计划不存在: id={plan_id}')

    slots = ScheduleSlot.objects.filter(
        schedule_plan=schedule_plan,
    ).select_related('visit_node').order_by('scheduled_date', 'start_time')

    conflicts = []
    recommendations = []

    # 1. 人员时间冲突
    person_slots = defaultdict(list)
    for slot in slots:
        if slot.assigned_to_id:
            person_slots[(slot.assigned_to_id, slot.scheduled_date)].append(slot)

    for (person_id, sdate), slot_list in person_slots.items():
        if len(slot_list) < 2:
            continue
        for i in range(len(slot_list)):
            for j in range(i + 1, len(slot_list)):
                s1, s2 = slot_list[i], slot_list[j]
                if IntelligentSchedulingService._time_overlaps(
                    s1.start_time, s1.end_time, s2.start_time, s2.end_time,
                ):
                    conflicts.append({
                        'type': 'person_overlap',
                        'severity': 'high',
                        'date': str(sdate),
                        'person_id': person_id,
                        'slot_ids': [s1.id, s2.id],
                        'message': (
                            f'执行人 #{person_id} 在 {sdate} 存在时间冲突: '
                            f'{s1.visit_node.name if s1.visit_node else s1.id} vs '
                            f'{s2.visit_node.name if s2.visit_node else s2.id}'
                        ),
                    })
                    recommendations.append(
                        f'建议将 slot#{s2.id} 调整到 {sdate} 的其他时段，或更换执行人'
                    )

    # 2. 设备冲突（同日同设备类型需求超出库存）
    try:
        from apps.visit.models import VisitActivity
        from apps.resource.models import ActivityBOM, ResourceItem

        date_equipment = defaultdict(lambda: defaultdict(int))
        for slot in slots:
            if not slot.visit_node_id:
                continue
            activities = VisitActivity.objects.filter(
                node_id=slot.visit_node_id,
                activity_template__isnull=False,
            )
            for act in activities:
                bom_items = ActivityBOM.objects.filter(
                    template=act.activity_template,
                    resource_category__resource_type='equipment',
                    is_mandatory=True,
                )
                for bom in bom_items:
                    date_equipment[slot.scheduled_date][bom.resource_category_id] += bom.quantity

        for sdate, cat_needs in date_equipment.items():
            for cat_id, needed in cat_needs.items():
                available = ResourceItem.objects.filter(
                    category_id=cat_id, is_deleted=False, status='active',
                ).count()
                if needed > available:
                    conflicts.append({
                        'type': 'equipment_shortage',
                        'severity': 'medium',
                        'date': str(sdate),
                        'resource_category_id': cat_id,
                        'needed': needed,
                        'available': available,
                        'message': f'{sdate} 设备类型#{cat_id} 需求 {needed} 台，库存仅 {available} 台',
                    })
                    recommendations.append(
                        f'建议错开 {sdate} 使用设备类型#{cat_id} 的排程，或租借/采购额外设备'
                    )
    except Exception as e:
        logger.warning(f'设备冲突检查异常: {e}')

    # 3. 场地冲突（同日同场地多个活动）
    try:
        from apps.facility.models import FacilityBooking
        for sdate in {s.scheduled_date for s in slots}:
            bookings = FacilityBooking.objects.filter(
                booking_date=sdate, status='confirmed',
            ).values('facility_id').annotate(
                cnt=models.Count('id'),
            ).filter(cnt__gt=1)
            for b in bookings:
                conflicts.append({
                    'type': 'facility_overlap',
                    'severity': 'medium',
                    'date': str(sdate),
                    'facility_id': b['facility_id'],
                    'booking_count': b['cnt'],
                    'message': f'{sdate} 场地#{b["facility_id"]} 有 {b["cnt"]} 个重叠预约',
                })
                recommendations.append(
                    f'建议协调 {sdate} 场地#{b["facility_id"]} 的使用时段'
                )
    except Exception as e:
        logger.warning(f'场地冲突检查异常: {e}')

    logger.info(f'排程冲突报告: plan_id={plan_id}, conflicts={len(conflicts)}')
    return {'conflicts': conflicts, 'recommendations': recommendations}
