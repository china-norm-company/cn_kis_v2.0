"""
CRC Dashboard 聚合服务（S5-1）

为不同角色提供定制化的Dashboard数据聚合：
- CRC主管：多项目交付指挥中心（所有活跃项目进度、CRC团队负载、待处理决策、风险预警）
- CRC协调员：我的项目工作台（负责的项目、今日任务、项目要求速查）
- 排程专员：资源调度中心（资源利用率、待分配工单、冲突预警、产能预测）
"""
import logging
from datetime import date, timedelta

from django.db.models import Count, Q

from apps.workorder.models import WorkOrder, WorkOrderStatus
from apps.workorder.query_utils import (
    filter_by_assignee,
    filter_unassigned,
    annotate_effective_assignee,
)

logger = logging.getLogger(__name__)


class CRCDashboardService:
    """CRC主管仪表盘数据聚合"""

    @classmethod
    def get_supervisor_dashboard(cls) -> dict:
        """
        CRC主管看到的多项目交付指挥中心

        包含：项目进度、CRC负载矩阵、待处理决策、风险预警
        """
        return {
            'project_progress': cls._get_project_progress(),
            'crc_workload': cls._get_crc_workload(),
            'pending_decisions': cls._get_pending_decisions(),
            'risk_alerts': cls._get_risk_alerts(),
            'summary': cls._get_summary_stats(),
        }

    @classmethod
    def get_crc_dashboard(cls, account_id: int) -> dict:
        """
        CRC协调员看到的我的项目工作台

        包含：我负责的项目、今日任务时间线、快速统计
        """
        return {
            'my_projects': cls._get_my_projects(account_id),
            'today_timeline': cls._get_today_timeline(account_id),
            'my_stats': cls._get_my_stats(account_id),
            'recent_exceptions': cls._get_my_exceptions(account_id),
        }

    @classmethod
    def get_scheduler_dashboard(cls) -> dict:
        """
        排程专员看到的资源调度中心

        包含：待分配工单、资源概览、冲突预警、本周产能
        """
        return {
            'pending_assignment': cls._get_pending_assignment(),
            'resource_overview': cls._get_resource_overview(),
            'conflict_warnings': cls._get_conflict_warnings(),
            'weekly_capacity': cls._get_weekly_capacity(),
        }

    # ------------------------------------------------------------------
    # CRC主管：多项目交付指挥中心
    # ------------------------------------------------------------------
    @classmethod
    def _get_project_progress(cls) -> list:
        """各活跃项目的工单进度统计"""
        try:
            active_statuses = [
                WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED,
                WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED,
                WorkOrderStatus.REVIEW,
            ]
            projects = (
                WorkOrder.objects.filter(is_deleted=False)
                .exclude(status=WorkOrderStatus.CANCELLED)
                .values('enrollment__protocol_id', 'enrollment__protocol__title')
                .annotate(
                    total=Count('id'),
                    completed=Count('id', filter=Q(status__in=[
                        WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED,
                    ])),
                    in_progress=Count('id', filter=Q(status=WorkOrderStatus.IN_PROGRESS)),
                    pending=Count('id', filter=Q(status__in=[
                        WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED,
                    ])),
                    overdue=Count('id', filter=Q(
                        due_date__lt=date.today(),
                        status__in=active_statuses,
                    )),
                )
                .filter(total__gt=0)
                .order_by('-total')
            )
            result = []
            for p in projects:
                total = p['total']
                completed = p['completed']
                result.append({
                    'protocol_id': p['enrollment__protocol_id'],
                    'protocol_title': p['enrollment__protocol__title'] or f'项目#{p["enrollment__protocol_id"]}',
                    'total': total,
                    'completed': completed,
                    'in_progress': p['in_progress'],
                    'pending': p['pending'],
                    'overdue': p['overdue'],
                    'completion_rate': round(completed / total * 100, 1) if total else 0,
                })
            return result
        except Exception as e:
            logger.error(f'获取项目进度失败: {e}')
            return []

    @classmethod
    def _get_crc_workload(cls) -> list:
        """CRC团队成员的工作负载矩阵"""
        try:
            active_statuses = [
                WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS,
            ]
            workload = (
                annotate_effective_assignee(WorkOrder.objects.filter(
                    is_deleted=False,
                    status__in=active_statuses,
                ).filter(
                    Q(assigned_to_account_id__isnull=False) | Q(assigned_to__isnull=False)
                ))
                .values('effective_assignee')
                .annotate(
                    active_count=Count('id'),
                    project_count=Count('enrollment__protocol_id', distinct=True),
                    overdue_count=Count('id', filter=Q(due_date__lt=date.today())),
                    today_count=Count('id', filter=Q(scheduled_date=date.today())),
                )
                .order_by('-active_count')
            )
            result = []
            for w in workload:
                user_info = cls._get_user_display(w['effective_assignee'])
                result.append({
                    'user_id': w['effective_assignee'],
                    'user_name': user_info.get('display_name', f'用户#{w["effective_assignee"]}'),
                    'active_count': w['active_count'],
                    'project_count': w['project_count'],
                    'overdue_count': w['overdue_count'],
                    'today_count': w['today_count'],
                })
            return result
        except Exception as e:
            logger.error(f'获取CRC负载失败: {e}')
            return []

    @classmethod
    def _get_pending_decisions(cls) -> list:
        """待处理决策队列（异常、变更等需主管处理的事项）"""
        decisions = []
        try:
            from apps.workorder.models_extended import WorkOrderException
            exceptions = (
                WorkOrderException.objects.filter(
                    status__in=['reported', 'investigating'],
                    severity__in=['high', 'critical'],
                )
                .select_related('work_order')
                .order_by('-create_time')[:10]
            )
            for exc in exceptions:
                decisions.append({
                    'type': 'exception',
                    'id': exc.id,
                    'title': f'[{exc.get_severity_display()}] {exc.get_exception_type_display()}',
                    'description': exc.description[:100] if exc.description else '',
                    'work_order_id': exc.work_order_id,
                    'work_order_title': exc.work_order.title if exc.work_order else '',
                    'severity': exc.severity,
                    'created_at': exc.create_time.isoformat(),
                })
        except Exception as e:
            logger.warning(f'获取待处理决策失败: {e}')

        return decisions

    @classmethod
    def _get_risk_alerts(cls) -> list:
        """风险预警聚合"""
        alerts = []
        today = date.today()

        # 逾期工单预警
        try:
            overdue_count = WorkOrder.objects.filter(
                is_deleted=False,
                due_date__lt=today,
                status__in=[
                    WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED,
                    WorkOrderStatus.IN_PROGRESS,
                ],
            ).count()
            if overdue_count > 0:
                alerts.append({
                    'type': 'overdue',
                    'level': 'high' if overdue_count > 5 else 'medium',
                    'message': f'{overdue_count} 个工单已逾期',
                    'count': overdue_count,
                })
        except Exception:
            pass

        # 设备校准到期预警
        try:
            from apps.resource.models import ResourceItem
            expiring = ResourceItem.objects.filter(
                is_deleted=False,
                status='active',
                next_calibration_date__lte=today + timedelta(days=7),
                next_calibration_date__gt=today,
            ).count()
            expired = ResourceItem.objects.filter(
                is_deleted=False,
                status='active',
                next_calibration_date__lt=today,
            ).count()
            if expired > 0:
                alerts.append({
                    'type': 'calibration_expired',
                    'level': 'critical',
                    'message': f'{expired} 台设备校准已过期',
                    'count': expired,
                })
            if expiring > 0:
                alerts.append({
                    'type': 'calibration_expiring',
                    'level': 'medium',
                    'message': f'{expiring} 台设备校准即将到期（7天内）',
                    'count': expiring,
                })
        except Exception:
            pass

        # 人员资质到期预警
        try:
            from apps.lab_personnel.models import MethodQualification
            qual_expiring = MethodQualification.objects.filter(
                is_active=True,
                expiry_date__lte=today + timedelta(days=30),
                expiry_date__gt=today,
            ).count()
            if qual_expiring > 0:
                alerts.append({
                    'type': 'qualification_expiring',
                    'level': 'medium',
                    'message': f'{qual_expiring} 项人员资质即将到期（30天内）',
                    'count': qual_expiring,
                    'source': 'lab_personnel',
                })
        except Exception:
            pass

        # P4-2: 物料效期预警
        try:
            from apps.material.models import MaterialItem
            material_expiring = MaterialItem.objects.filter(
                is_deleted=False,
                expiry_date__lte=today + timedelta(days=30),
                expiry_date__gt=today,
            ).count()
            if material_expiring > 0:
                alerts.append({
                    'type': 'material_expiring',
                    'level': 'medium',
                    'message': f'{material_expiring} 批物料即将过期（30天内）',
                    'count': material_expiring,
                    'source': 'material',
                })
        except Exception:
            pass

        # P4-2: 设施不合规预警
        try:
            from apps.facility.models import FacilityNonCompliance
            non_compliant = FacilityNonCompliance.objects.filter(
                status='open',
            ).count()
            if non_compliant > 0:
                alerts.append({
                    'type': 'facility_non_compliant',
                    'level': 'high',
                    'message': f'{non_compliant} 项设施不合规事件待处理',
                    'count': non_compliant,
                    'source': 'facility',
                })
        except Exception:
            pass

        # P3-4: 从 AlertConfig 读取自定义阈值
        try:
            from apps.workorder.models import AlertConfig
            for config in AlertConfig.objects.filter(is_enabled=True):
                if config.alert_type == 'workorder_overdue' and len([a for a in alerts if a['type'] == 'overdue']) == 0:
                    overdue_check = WorkOrder.objects.filter(
                        is_deleted=False,
                        due_date__lt=today,
                        status__in=[WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS],
                    ).count()
                    if overdue_check >= config.threshold:
                        alerts.append({
                            'type': 'overdue_threshold',
                            'level': config.level,
                            'message': f'逾期工单数({overdue_check})已达告警阈值({int(config.threshold)})',
                            'count': overdue_check,
                            'source': 'config',
                        })
        except Exception:
            pass

        return alerts

    @classmethod
    def _get_summary_stats(cls) -> dict:
        """全局汇总统计"""
        today = date.today()
        qs = WorkOrder.objects.filter(is_deleted=False)
        total = qs.count()
        today_count = qs.filter(scheduled_date=today).count()
        active = qs.filter(status__in=[
            WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS,
        ]).count()
        completed_today = qs.filter(
            completed_at__date=today,
            status__in=[WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED],
        ).count()
        return {
            'total_work_orders': total,
            'today_scheduled': today_count,
            'active_work_orders': active,
            'completed_today': completed_today,
        }

    # ------------------------------------------------------------------
    # CRC协调员：我的项目工作台
    # ------------------------------------------------------------------
    @classmethod
    def _get_my_projects(cls, account_id: int) -> list:
        """CRC负责的项目列表"""
        try:
            projects = (
                filter_by_assignee(WorkOrder.objects.filter(is_deleted=False), account_id)
                .exclude(status__in=[WorkOrderStatus.CANCELLED, WorkOrderStatus.APPROVED])
                .values('enrollment__protocol_id', 'enrollment__protocol__title')
                .annotate(
                    total=Count('id'),
                    completed=Count('id', filter=Q(status__in=[
                        WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED,
                    ])),
                    in_progress=Count('id', filter=Q(status=WorkOrderStatus.IN_PROGRESS)),
                    pending=Count('id', filter=Q(status__in=[
                        WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED,
                    ])),
                )
                .filter(total__gt=0)
                .order_by('-pending', '-in_progress')
            )
            result = []
            for p in projects:
                total = p['total']
                completed = p['completed']
                result.append({
                    'protocol_id': p['enrollment__protocol_id'],
                    'protocol_title': p['enrollment__protocol__title'] or f'项目#{p["enrollment__protocol_id"]}',
                    'total': total,
                    'completed': completed,
                    'in_progress': p['in_progress'],
                    'pending': p['pending'],
                    'completion_rate': round(completed / total * 100, 1) if total else 0,
                })
            return result
        except Exception as e:
            logger.error(f'获取我的项目失败: {e}')
            return []

    @classmethod
    def _get_today_timeline(cls, account_id: int) -> list:
        """今日任务时间线（含排程时间段）"""
        today = date.today()
        try:
            work_orders = (
                filter_by_assignee(WorkOrder.objects.filter(is_deleted=False), account_id)
                .filter(
                    Q(scheduled_date=today) |
                    Q(status__in=[WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS])
                )
                .select_related('enrollment', 'visit_node', 'schedule_slot')
                .order_by('scheduled_date', 'create_time')
            )
            result = []
            for wo in work_orders:
                item = {
                    'id': wo.id,
                    'title': wo.title,
                    'status': wo.status,
                    'scheduled_date': str(wo.scheduled_date) if wo.scheduled_date else None,
                    'due_date': wo.due_date.isoformat() if wo.due_date else None,
                    'work_order_type': wo.work_order_type,
                    'start_time': None,
                    'end_time': None,
                }
                try:
                    if wo.schedule_slot:
                        if wo.schedule_slot.start_time:
                            item['start_time'] = wo.schedule_slot.start_time.strftime('%H:%M')
                        if wo.schedule_slot.end_time:
                            item['end_time'] = wo.schedule_slot.end_time.strftime('%H:%M')
                except Exception:
                    pass
                try:
                    if wo.enrollment:
                        item['protocol_id'] = wo.enrollment.protocol_id
                        item['protocol_title'] = wo.enrollment.protocol.title if wo.enrollment.protocol else ''
                        item['subject_name'] = wo.enrollment.subject.name[:1] + '**' if wo.enrollment.subject and wo.enrollment.subject.name else ''
                except Exception:
                    pass
                try:
                    if wo.visit_node:
                        item['visit_node_name'] = wo.visit_node.name
                except Exception:
                    pass
                result.append(item)
            # Re-sort: items with time slots first, ordered by start_time
            result.sort(key=lambda x: (x['start_time'] or '99:99', x['id']))
            return result
        except Exception as e:
            logger.error(f'获取今日时间线失败: {e}')
            return []

    @classmethod
    def _get_my_stats(cls, account_id: int) -> dict:
        """CRC个人统计"""
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        qs = filter_by_assignee(WorkOrder.objects.filter(is_deleted=False), account_id)
        return {
            'total_active': qs.filter(status__in=[
                WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS,
            ]).count(),
            'today_scheduled': qs.filter(scheduled_date=today).count(),
            'today_completed': qs.filter(
                completed_at__date=today,
                status__in=[WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED],
            ).count(),
            'week_completed': qs.filter(
                completed_at__date__gte=week_start,
                status__in=[WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED],
            ).count(),
            'overdue': qs.filter(
                due_date__lt=today,
                status__in=[
                    WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED,
                    WorkOrderStatus.IN_PROGRESS,
                ],
            ).count(),
        }

    @classmethod
    def _get_my_exceptions(cls, account_id: int) -> list:
        """CRC负责的工单最近异常"""
        try:
            from apps.workorder.models_extended import WorkOrderException
            my_wo_ids = filter_by_assignee(
                WorkOrder.objects.filter(is_deleted=False), account_id,
            ).values_list('id', flat=True)
            exceptions = (
                WorkOrderException.objects.filter(work_order_id__in=my_wo_ids)
                .order_by('-create_time')[:5]
            )
            return [{
                'id': exc.id,
                'work_order_id': exc.work_order_id,
                'exception_type': exc.exception_type,
                'severity': exc.severity,
                'status': exc.status,
                'description': exc.description[:100] if exc.description else '',
                'created_at': exc.create_time.isoformat(),
            } for exc in exceptions]
        except Exception as e:
            logger.warning(f'获取我的异常失败: {e}')
            return []

    # ------------------------------------------------------------------
    # 排程专员：资源调度中心
    # ------------------------------------------------------------------
    @classmethod
    def _get_pending_assignment(cls) -> dict:
        """待分配工单统计"""
        pending = filter_unassigned(WorkOrder.objects.filter(
            is_deleted=False,
            status=WorkOrderStatus.PENDING,
        ))
        return {
            'total': pending.count(),
            'items': [{
                'id': wo.id,
                'title': wo.title,
                'scheduled_date': str(wo.scheduled_date) if wo.scheduled_date else None,
                'due_date': wo.due_date.isoformat() if wo.due_date else None,
                'work_order_type': wo.work_order_type,
            } for wo in pending.order_by('scheduled_date', 'due_date')[:20]],
        }

    @classmethod
    def _get_resource_overview(cls) -> dict:
        """资源概览统计"""
        overview = {
            'equipment': {'total': 0, 'active': 0, 'calibration_due': 0},
            'personnel': {'total': 0, 'on_duty': 0},
            'venue': {'total': 0, 'available': 0},
        }
        today = date.today()
        try:
            from apps.resource.models import ResourceItem
            equip_qs = ResourceItem.objects.filter(
                is_deleted=False,
                category__resource_type='equipment',
            )
            overview['equipment']['total'] = equip_qs.count()
            overview['equipment']['active'] = equip_qs.filter(status='active').count()
            overview['equipment']['calibration_due'] = equip_qs.filter(
                next_calibration_date__lte=today + timedelta(days=7),
            ).count()
        except Exception:
            pass

        try:
            from apps.lab_personnel.models import LabStaffProfile
            staff_qs = LabStaffProfile.objects.filter(is_active=True)
            overview['personnel']['total'] = staff_qs.count()
            overview['personnel']['on_duty'] = staff_qs.filter(
                current_status='on_duty'
            ).count()
        except Exception:
            pass

        try:
            from apps.resource.models import ResourceItem
            venue_qs = ResourceItem.objects.filter(
                is_deleted=False,
                category__resource_type='venue',
            )
            overview['venue']['total'] = venue_qs.count()
            overview['venue']['available'] = venue_qs.filter(status='active').count()
        except Exception:
            pass

        return overview

    @classmethod
    def _get_conflict_warnings(cls) -> list:
        """排程冲突预警"""
        try:
            from apps.scheduling.models import ScheduleSlot
            conflicts = ScheduleSlot.objects.filter(
                status='conflict',
            ).select_related('schedule_plan', 'visit_node').order_by('-schedule_plan__create_time')[:10]
            return [{
                'slot_id': s.id,
                'plan_id': s.schedule_plan_id,
                'plan_name': s.schedule_plan.name if s.schedule_plan else '',
                'visit_node_name': s.visit_node.name if s.visit_node else '',
                'scheduled_date': str(s.scheduled_date),
                'conflict_reason': s.conflict_reason or '',
            } for s in conflicts]
        except Exception as e:
            logger.warning(f'获取冲突预警失败: {e}')
            return []

    @classmethod
    def _get_weekly_capacity(cls) -> dict:
        """本周产能概览"""
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        qs = WorkOrder.objects.filter(
            is_deleted=False,
            scheduled_date__gte=week_start,
            scheduled_date__lte=week_end,
        )

        daily = (
            qs.values('scheduled_date')
            .annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(status__in=[
                    WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED,
                ])),
            )
            .order_by('scheduled_date')
        )

        return {
            'week_start': str(week_start),
            'week_end': str(week_end),
            'total_scheduled': qs.count(),
            'total_completed': qs.filter(status__in=[
                WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED,
            ]).count(),
            'daily': [{
                'date': str(d['scheduled_date']),
                'total': d['total'],
                'completed': d['completed'],
            } for d in daily],
        }

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------
    @classmethod
    def _get_user_display(cls, account_id: int) -> dict:
        """获取用户显示信息"""
        try:
            from apps.identity.models import Account
            account = Account.objects.filter(id=account_id).first()
            if account:
                return {
                    'display_name': account.display_name or account.username,
                    'username': account.username,
                }
        except Exception:
            pass
        return {'display_name': f'用户#{account_id}', 'username': ''}
