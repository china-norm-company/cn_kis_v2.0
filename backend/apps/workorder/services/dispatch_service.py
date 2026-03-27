"""
工单智能派送服务

来源：cn_kis_test workorder/services/dispatch_service.py

核心能力：
- auto_assign：基于资质+负载的自动分配
- manual_assign：手动分配
分配后自动创建飞书任务 + 发送交互卡片
"""
import logging
from typing import Optional

from django.db.models import Count, Q

from apps.workorder.models import WorkOrder, WorkOrderAssignment, WorkOrderStatus
from apps.workorder.query_utils import annotate_effective_assignee

logger = logging.getLogger(__name__)


class WorkOrderDispatchService:
    """工单派送服务"""

    @classmethod
    def auto_assign(cls, work_order_id: int) -> Optional[WorkOrder]:
        """
        自动分配工单

        分配策略：
        1. 获取可用执行人列表
        2. 执行 lab_personnel 3 项资质硬校验（GCP/方法/设备），排除不合格候选人
        3. 按多维度评分 / 在手工单数排序
        4. 选择最优执行人
        5. 创建飞书任务 + 发送交互卡片
        """

        wo = WorkOrder.objects.filter(id=work_order_id, is_deleted=False).first()
        if not wo:
            return None

        # 获取可用执行人
        available_users = cls._get_available_users(wo)
        if not available_users:
            logger.warning(f'工单#{work_order_id} 无可用执行人')
            return wo

        # 资质硬校验：GCP/方法资质/设备授权
        available_users = cls._filter_by_qualification(wo, available_users)

        # S4-1：使用多维度评分算法
        user_ids = [u['id'] for u in available_users]
        try:
            from apps.workorder.services.scoring_service import DispatchScoringService
            best = DispatchScoringService.get_best_candidate(wo, user_ids)
            if best:
                logger.info(
                    f'工单#{work_order_id} 评分派送: user={best["user_id"]}, '
                    f'score={best["total_score"]}, breakdown={best["breakdown"]}'
                )
                return cls._do_assign(
                    wo, best['user_id'], assigned_by_id=None, reason='auto_scored',
                )
        except Exception as e:
            logger.warning(f'工单#{work_order_id} 评分派送失败，降级为负载排序: {e}')

        # 降级：按负载排序
        best_user = cls._select_least_loaded(available_users)
        if not best_user:
            logger.warning(f'工单#{work_order_id} 无法选择执行人')
            return wo

        return cls._do_assign(wo, best_user['id'], assigned_by_id=None, reason='auto_fallback')

    @classmethod
    def manual_assign(
        cls,
        work_order_id: int,
        user_id: int,
        assigned_by_id: int = None,
    ) -> Optional[WorkOrder]:
        """手动分配工单"""
        wo = WorkOrder.objects.filter(id=work_order_id, is_deleted=False).first()
        if not wo:
            return None
        return cls._do_assign(wo, user_id, assigned_by_id=assigned_by_id, reason='manual')

    @classmethod
    def _do_assign(
        cls,
        wo: WorkOrder,
        user_id: int,
        assigned_by_id: int = None,
        reason: str = '',
    ) -> WorkOrder:
        """执行分配操作"""
        from apps.workorder.services import (
            _build_workorder_assignee_update_fields, _create_feishu_task_for_workorder,
            _log_workorder_freeze_observation, _send_workorder_card,
        )
        from apps.identity.models import Account

        fk_user_id = user_id if Account.objects.filter(id=user_id, is_deleted=False).exists() else None
        fk_assigned_by_id = (
            assigned_by_id
            if assigned_by_id and Account.objects.filter(id=assigned_by_id, is_deleted=False).exists()
            else None
        )
        assignee_updates, update_fields = _build_workorder_assignee_update_fields(user_id)
        for key, value in assignee_updates.items():
            setattr(wo, key, value)
        if wo.assigned_to_account_id != fk_user_id:
            wo.assigned_to_account_id = fk_user_id
        wo.status = WorkOrderStatus.ASSIGNED
        wo.save(update_fields=update_fields + ['status'])
        _log_workorder_freeze_observation(
            event='dispatch_do_assign',
            wo_id=wo.id,
            assigned_to_legacy=wo.assigned_to,
            assigned_to_fk=wo.assigned_to_account_id,
            reason=reason,
        )

        # 记录分配历史
        WorkOrderAssignment.objects.create(
            work_order=wo,
            assigned_to_id=user_id,
            assigned_to_account_id=fk_user_id,
            assigned_by_id=assigned_by_id,
            assigned_by_account_id=fk_assigned_by_id,
            reason=reason,
        )

        # 飞书集成
        _create_feishu_task_for_workorder(wo)
        _send_workorder_card(wo)

        logger.info(f'工单#{wo.id} 已分配给 User#{user_id} (reason={reason})')
        return wo

    @classmethod
    def _filter_by_qualification(cls, wo: WorkOrder, users: list) -> list:
        """
        使用 lab_personnel 的 3 项硬校验过滤候选人

        硬拦截：GCP 无效 / 方法资质不足 / 设备未授权 → 直接排除
        """
        if not users:
            return users

        try:
            from apps.hr.models import Staff
            from apps.lab_personnel.services.dispatch_service import (
                _check_gcp_valid,
                _check_method_qualification,
                _check_equipment_authorization,
            )

            qualified = []
            for u in users:
                staff = Staff.objects.filter(
                    Q(account_fk_id=u['id']) | Q(account_id=u['id']) | Q(id=u['id']),
                    is_deleted=False,
                ).first()
                if not staff:
                    qualified.append(u)
                    continue

                gcp = _check_gcp_valid(staff)
                if not gcp['passed']:
                    logger.info(f'自动派工排除 {staff.name}: {gcp["message"]}')
                    continue

                method = _check_method_qualification(staff, wo)
                if not method['passed']:
                    logger.info(f'自动派工排除 {staff.name}: {method["message"]}')
                    continue

                equip = _check_equipment_authorization(staff, wo)
                if not equip['passed']:
                    logger.info(f'自动派工排除 {staff.name}: {equip["message"]}')
                    continue

                qualified.append(u)

            if not qualified and users:
                logger.warning(
                    f'工单#{wo.id} 所有候选人({len(users)}人)均未通过资质校验，'
                    f'降级为无资质过滤'
                )
                return users

            return qualified
        except ImportError:
            logger.warning('lab_personnel 模块未安装，跳过资质校验')
            return users
        except Exception as e:
            logger.error(f'资质校验异常，降级为无校验: {e}')
            return users

    @classmethod
    def _get_available_users(cls, wo: WorkOrder) -> list:
        """
        获取可用执行人列表

        优先按 ProjectAssignment 过滤属于当前工单所在项目的人员，
        降级为全系统 CRC 账号。
        """
        try:
            from apps.identity.models import Account

            # 尝试获取工单关联的协议 ID
            protocol_id = None
            if wo.enrollment_id:
                try:
                    protocol_id = wo.enrollment.protocol_id
                except Exception:
                    pass

            if protocol_id:
                try:
                    from apps.hr.models import ProjectAssignment
                    staff_ids = list(ProjectAssignment.objects.filter(
                        protocol_id=protocol_id, is_active=True,
                    ).values_list('staff__account_fk_id', flat=True))
                    if not staff_ids:
                        staff_ids = list(ProjectAssignment.objects.filter(
                            protocol_id=protocol_id, is_active=True,
                        ).values_list('staff__account_id', flat=True))
                    if staff_ids:
                        users = Account.objects.filter(
                            id__in=staff_ids, is_deleted=False,
                        ).values('id', 'username')
                        result = list(users)
                        if result:
                            return result
                except Exception as e:
                    logger.warning(f'按项目过滤执行人失败，降级为全局: {e}')

            # 降级：全系统 CRC 账号
            users = Account.objects.filter(
                is_deleted=False,
                account_type__in=['staff', 'crc'],
            ).values('id', 'username')
            return list(users)
        except Exception as e:
            logger.error(f'获取可用执行人失败: {e}')
            return []

    @classmethod
    def _select_least_loaded(cls, users: list) -> Optional[dict]:
        """
        选择负载最低的执行人

        负载 = 在手工单数（pending + in_progress）
        """
        if not users:
            return None

        user_ids = [u['id'] for u in users]

        # 统计每人的在手工单数
        workloads = annotate_effective_assignee(WorkOrder.objects.filter(
            is_deleted=False,
            status__in=[WorkOrderStatus.PENDING, WorkOrderStatus.IN_PROGRESS],
        )).filter(
            effective_assignee__in=user_ids
        ).values('effective_assignee').annotate(
            workload=Count('id')
        )

        workload_map = {w['effective_assignee']: w['workload'] for w in workloads}

        # 选负载最低的
        best = min(users, key=lambda u: workload_map.get(u['id'], 0))
        return best

    @classmethod
    def batch_auto_assign(cls, work_order_ids: list) -> list:
        """批量自动分配"""
        results = []
        for wo_id in work_order_ids:
            wo = cls.auto_assign(wo_id)
            if wo:
                results.append({
                    'work_order_id': wo.id,
                    'assigned_to': wo.effective_assigned_to,
                    'status': 'assigned',
                })
            else:
                results.append({
                    'work_order_id': wo_id,
                    'assigned_to': None,
                    'status': 'failed',
                })
        return results
