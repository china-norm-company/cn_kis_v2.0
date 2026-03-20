"""统一待办聚合服务"""
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)


class UnifiedTodoService:
    """跨工作台待办聚合"""

    @staticmethod
    def get_my_todos(account_id):
        """聚合所有工作台的待办事项"""
        todos = []

        # 1. 工单待办（含逾期工单）
        todos.extend(UnifiedTodoService._get_workorder_todos(account_id))
        # 2. 审批待办
        todos.extend(UnifiedTodoService._get_workflow_todos(account_id))
        # 3. 变更待办
        todos.extend(UnifiedTodoService._get_change_todos(account_id))
        # 4. 即将到来的访视
        todos.extend(UnifiedTodoService._get_visit_todos(account_id))
        # 5. CAPA整改
        todos.extend(UnifiedTodoService._get_capa_todos(account_id))
        # 6. 培训待完成
        todos.extend(UnifiedTodoService._get_training_todos(account_id))
        # 7. 伦理相关
        todos.extend(UnifiedTodoService._get_ethics_todos(account_id))

        # Sort by due_date, None last
        todos.sort(key=lambda x: x.get('due_date') or '9999-12-31')
        return todos

    @staticmethod
    def _get_workorder_todos(account_id):
        """获取工单待办，逾期工单标记为 overdue_workorder"""
        try:
            from apps.workorder.models import WorkOrder
            now = timezone.now()
            items = WorkOrder.objects.filter(
                assigned_to=account_id,
                status__in=['pending', 'assigned', 'in_progress'],
            ).values('id', 'title', 'due_date', 'status')[:20]

            result = []
            for item in items:
                is_overdue = item['due_date'] and item['due_date'] <= now
                result.append({
                    'source_workstation': 'execution',
                    'type': 'overdue_workorder' if is_overdue else 'workorder',
                    'title': item['title'],
                    'due_date': str(item['due_date']) if item['due_date'] else None,
                    'priority': 'high',
                    'link': f'/execution/#/workorders/{item["id"]}',
                    'status': item['status'],
                })
            return result
        except Exception as e:
            logger.warning(f'获取工单待办失败: {e}')
            return []

    @staticmethod
    def _get_workflow_todos(account_id):
        """获取审批待办（仅返回当前审批步骤包含该用户的实例）"""
        try:
            from apps.workflow.models import WorkflowInstance
            pending_instances = WorkflowInstance.objects.filter(
                status='pending',
            ).exclude(
                business_type__in=['protocol_amendment', 'amendment'],
            ).select_related('definition')

            result = []
            for inst in pending_instances:
                if not inst.definition or not inst.current_step:
                    continue
                steps = inst.definition.steps or []
                current_step_def = None
                for s in steps:
                    if s.get('step') == inst.current_step:
                        current_step_def = s
                        break
                if not current_step_def:
                    continue
                approvers = current_step_def.get('approvers', [])
                is_approver = any(
                    a.get('user_id') == account_id for a in approvers
                )
                if is_approver:
                    result.append({
                        'source_workstation': 'secretary',
                        'type': 'approval',
                        'title': f'待审批: {inst.business_type}',
                        'due_date': None,
                        'priority': 'high',
                        'link': f'/secretary/#/dashboard',
                        'status': 'pending',
                    })
                if len(result) >= 20:
                    break
            return result
        except Exception as e:
            logger.warning(f'获取审批待办失败: {e}')
            return []

    @staticmethod
    def _get_change_todos(account_id):
        """获取变更待办（协议修正等）"""
        try:
            from apps.workflow.models import WorkflowInstance
            instances = WorkflowInstance.objects.filter(
                initiator_id=account_id,
                status='pending',
                business_type__in=['protocol_amendment', 'amendment'],
            ).values('id', 'title', 'business_type', 'create_time')[:20]

            return [{
                'source_workstation': 'research',
                'type': 'pending_change',
                'title': inst['title'],
                'due_date': None,
                'priority': 'high',
                'link': f'/research/#/changes/{inst["id"]}',
                'status': 'pending',
            } for inst in instances]
        except Exception as e:
            logger.warning(f'获取变更待办失败: {e}')
            return []

    @staticmethod
    def _get_visit_todos(account_id):
        """获取即将到来的访视排程"""
        try:
            from apps.scheduling.models import ScheduleSlot
            from datetime import date, timedelta

            today = date.today()
            upcoming_end = today + timedelta(days=7)
            slots = ScheduleSlot.objects.filter(
                assigned_to_id=account_id,
                status__in=['planned', 'confirmed'],
                scheduled_date__gte=today,
                scheduled_date__lte=upcoming_end,
            ).select_related('visit_node').values(
                'id', 'scheduled_date', 'visit_node__name',
            )[:20]

            return [{
                'source_workstation': 'execution',
                'type': 'upcoming_visit',
                'title': f'访视: {slot.get("visit_node__name", "")}',
                'due_date': str(slot['scheduled_date']) if slot['scheduled_date'] else None,
                'priority': 'medium',
                'link': f'/execution/#/schedule/{slot["id"]}',
                'status': 'planned',
            } for slot in slots]
        except Exception as e:
            logger.warning(f'获取访视待办失败: {e}')
            return []

    @staticmethod
    def _get_capa_todos(account_id):
        """获取CAPA整改待办"""
        try:
            from apps.quality.models import CAPA
            items = CAPA.objects.filter(
                responsible_id=account_id,
                status__in=['planned', 'in_progress'],
            ).values('id', 'title', 'due_date', 'status')[:20]

            return [{
                'source_workstation': 'quality',
                'type': 'capa',
                'title': f'CAPA整改: {item["title"]}',
                'due_date': str(item['due_date']) if item['due_date'] else None,
                'priority': 'high',
                'link': f'/quality/#/capa/{item["id"]}',
                'status': item['status'],
            } for item in items]
        except Exception as e:
            logger.warning(f'获取CAPA待办失败: {e}')
            return []

    @staticmethod
    def _get_training_todos(account_id):
        """获取培训待完成"""
        try:
            from apps.hr.models import Training
            items = Training.objects.filter(
                trainee__account_id=account_id,
                status__in=['scheduled', 'in_progress'],
            ).values('id', 'course_name', 'start_date', 'status')[:20]

            return [{
                'source_workstation': 'hr',
                'type': 'training',
                'title': f'待培训: {item["course_name"]}',
                'due_date': str(item['start_date']) if item['start_date'] else None,
                'priority': 'medium',
                'link': f'/hr/#/training/{item["id"]}',
                'status': item['status'],
            } for item in items]
        except Exception as e:
            logger.warning(f'获取培训待办失败: {e}')
            return []

    @staticmethod
    def _get_ethics_todos(account_id):
        """获取伦理相关待办"""
        try:
            from apps.ethics.models import EthicsApplication
            items = EthicsApplication.objects.filter(
                created_by_id=account_id,
                status__in=['draft', 'submitted', 'reviewing'],
            ).values('id', 'application_number', 'status')[:10]

            return [{
                'source_workstation': 'ethics',
                'type': 'ethics',
                'title': f'伦理申请: {item["application_number"]}',
                'due_date': None,
                'priority': 'medium',
                'link': f'/ethics/#/applications/{item["id"]}',
                'status': item['status'],
            } for item in items]
        except Exception as e:
            logger.warning(f'获取伦理待办失败: {e}')
            return []
