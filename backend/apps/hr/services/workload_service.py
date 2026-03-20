"""
工作负荷计算服务

S3-4：基于在手工单数和项目分配计算工作负荷。
供派送算法使用。
"""
import logging
from typing import List, Dict

from apps.hr.models import Staff, ProjectAssignment
from apps.workorder.models import WorkOrder, WorkOrderStatus

logger = logging.getLogger(__name__)


class WorkloadService:
    """工作负荷计算"""

    @classmethod
    def get_staff_workload(cls, staff_id: int) -> dict:
        """
        获取单个员工工作负荷

        Returns:
            {
                'staff_id': int,
                'active_workorders': int,
                'project_count': int,
                'total_workload_percentage': int,
            }
        """
        staff = Staff.objects.filter(id=staff_id, is_deleted=False).first()
        if not staff:
            return {}

        # 在手工单数（未完成）
        active_wo_count = WorkOrder.objects.filter(
            assigned_to=staff.account_id,
            is_deleted=False,
        ).exclude(
            status__in=[WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED,
                        WorkOrderStatus.APPROVED, WorkOrderStatus.REJECTED]
        ).count()

        # 项目分配
        assignments = ProjectAssignment.objects.filter(staff=staff, is_active=True)
        total_pct = sum(a.workload_percentage for a in assignments)

        max_hours = 40
        current_hours = round((total_pct / 100) * max_hours, 1)

        return {
            'staff_id': staff.id,
            'staff_name': staff.name,
            'active_workorders': active_wo_count,
            'project_count': assignments.count(),
            'total_workload_percentage': total_pct,
            # 向前兼容前端历史字段
            'active_projects': assignments.count(),
            'current_hours': current_hours,
            'max_hours': max_hours,
        }

    @classmethod
    def get_team_workload(cls, staff_ids: list = None) -> List[dict]:
        """批量获取团队工作负荷"""
        qs = Staff.objects.filter(is_deleted=False)
        if staff_ids:
            qs = qs.filter(id__in=staff_ids)

        return [cls.get_staff_workload(s.id) for s in qs]

    @classmethod
    def get_least_loaded_staff(cls, staff_ids: list) -> dict:
        """
        获取工作负荷最低的员工

        供派送算法调用（AC-4）
        """
        workloads = cls.get_team_workload(staff_ids)
        if not workloads:
            return {}

        return min(workloads, key=lambda w: w.get('active_workorders', 999))
