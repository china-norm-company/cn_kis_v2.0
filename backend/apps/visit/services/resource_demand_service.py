"""
资源需求计划服务

来源：cn_kis_test visit/services/resource_demand_generation_service.py

核心流程：
VisitPlan → 汇总所有 Activity 的 BOM → 生成 ResourceDemand
提交后发起飞书审批，审批通过后状态更新为 approved。
"""
import logging
from collections import defaultdict
from typing import Optional

from django.db import transaction

from apps.visit.models import (
    VisitPlan, VisitNode, VisitActivity,
    ResourceDemand, ResourceDemandStatus,
)
from apps.resource.models import ActivityBOM

logger = logging.getLogger(__name__)


class ResourceDemandService:
    """资源需求计划服务"""

    @classmethod
    @transaction.atomic
    def generate_resource_demand(cls, visit_plan_id: int) -> ResourceDemand:
        """
        从已生成的访视计划汇总 BOM 生成资源需求

        遍历所有 VisitActivity → 找到关联的 ActivityTemplate →
        汇总每个 template 的 BOM → 按资源类型分类汇总。

        Returns:
            ResourceDemand 对象
        """
        plan = VisitPlan.objects.filter(id=visit_plan_id, is_deleted=False).first()
        if not plan:
            raise ValueError(f'访视计划不存在: id={visit_plan_id}')

        # 获取所有活动
        nodes = VisitNode.objects.filter(plan=plan)
        activities = VisitActivity.objects.filter(
            node__in=nodes, activity_template__isnull=False
        ).select_related('activity_template')

        # 汇总 BOM
        demand_details = cls._aggregate_bom(activities)

        # 创建或更新需求
        demand, created = ResourceDemand.objects.update_or_create(
            visit_plan=plan,
            defaults={
                'status': ResourceDemandStatus.DRAFT,
                'demand_details': demand_details,
                'summary': cls._build_summary(demand_details),
            },
        )

        action = '创建' if created else '更新'
        logger.info(
            f'资源需求{action}: demand_id={demand.id}, '
            f'plan_id={visit_plan_id}, categories={len(demand_details)}'
        )
        return demand

    @classmethod
    def _aggregate_bom(cls, activities) -> list:
        """
        汇总所有活动的 BOM

        Returns:
            [{
                "resource_type": "equipment",
                "resource_type_display": "设备",
                "items": [
                    {
                        "category_id": 1,
                        "category_name": "VISIA-CR",
                        "category_code": "EQ-SKIN-VISIA",
                        "total_quantity": 3,
                        "is_mandatory": true,
                        "used_by_activities": ["VISIA-CR面部拍照", ...]
                    }
                ]
            }, ...]
        """
        from apps.resource.models import ResourceType

        # category_id → {info}
        cat_agg = defaultdict(lambda: {
            'total_quantity': 0,
            'is_mandatory': False,
            'used_by_activities': set(),
        })

        template_ids = set(a.activity_template_id for a in activities)
        bom_items = ActivityBOM.objects.filter(
            template_id__in=template_ids
        ).select_related('resource_category')

        # 建立 template_id → bom list 映射
        tpl_bom_map = defaultdict(list)
        for bom in bom_items:
            tpl_bom_map[bom.template_id].append(bom)

        # 遍历活动，汇总每个资源类别的需求
        for act in activities:
            bom_list = tpl_bom_map.get(act.activity_template_id, [])
            for bom in bom_list:
                key = bom.resource_category_id
                cat_agg[key]['total_quantity'] += bom.quantity
                if bom.is_mandatory:
                    cat_agg[key]['is_mandatory'] = True
                cat_agg[key]['used_by_activities'].add(act.name)
                cat_agg[key]['_category'] = bom.resource_category

        # 按资源大类分组
        type_groups = defaultdict(list)
        type_display_map = dict(ResourceType.choices)

        for cat_id, info in cat_agg.items():
            cat = info.pop('_category')
            type_groups[cat.resource_type].append({
                'category_id': cat.id,
                'category_name': cat.name,
                'category_code': cat.code,
                'total_quantity': info['total_quantity'],
                'is_mandatory': info['is_mandatory'],
                'used_by_activities': sorted(info['used_by_activities']),
            })

        result = []
        for rtype in ['personnel', 'equipment', 'material', 'environment', 'method']:
            if rtype in type_groups:
                result.append({
                    'resource_type': rtype,
                    'resource_type_display': type_display_map.get(rtype, rtype),
                    'items': type_groups[rtype],
                })
        return result

    @classmethod
    def _build_summary(cls, demand_details: list) -> str:
        """构建需求摘要文本"""
        parts = []
        for group in demand_details:
            type_name = group['resource_type_display']
            total = sum(item['total_quantity'] for item in group['items'])
            count = len(group['items'])
            parts.append(f'{type_name}{count}类共{total}')
        return '，'.join(parts)

    @classmethod
    @transaction.atomic
    def submit_demand(cls, demand_id: int, open_id: str = '') -> ResourceDemand:
        """
        提交资源需求审核

        状态：draft → submitted，发起飞书审批。
        """
        demand = ResourceDemand.objects.filter(id=demand_id).first()
        if not demand:
            raise ValueError(f'资源需求不存在: id={demand_id}')
        if demand.status != ResourceDemandStatus.DRAFT:
            raise ValueError(f'只有草稿状态可提交，当前状态: {demand.status}')

        # 先尝试创建飞书审批（失败则不改状态）
        if open_id:
            try:
                cls._create_feishu_approval(demand, open_id)
            except Exception as e:
                logger.error(f'资源需求#{demand_id} 飞书审批创建失败，提交取消: {e}')
                raise ValueError(f'飞书审批创建失败: {e}')

        demand.status = ResourceDemandStatus.SUBMITTED
        demand.save(update_fields=['status', 'update_time'])

        logger.info(f'资源需求已提交: demand_id={demand_id}')
        return demand

    @classmethod
    def approve_demand(cls, demand_id: int) -> ResourceDemand:
        """审批通过资源需求"""
        demand = ResourceDemand.objects.filter(id=demand_id).first()
        if not demand:
            raise ValueError(f'资源需求不存在: id={demand_id}')
        if demand.status != ResourceDemandStatus.SUBMITTED:
            raise ValueError(
                f'只有已提交的需求可审批，当前状态: {demand.status}。'
                f'draft 状态请先调用 submit_demand 提交。'
            )

        demand.status = ResourceDemandStatus.APPROVED
        demand.save(update_fields=['status', 'update_time'])
        logger.info(f'资源需求审批通过: demand_id={demand_id}')
        return demand

    @classmethod
    def reject_demand(cls, demand_id: int) -> ResourceDemand:
        """拒绝资源需求"""
        demand = ResourceDemand.objects.filter(id=demand_id).first()
        if not demand:
            raise ValueError(f'资源需求不存在: id={demand_id}')

        demand.status = ResourceDemandStatus.REJECTED
        demand.save(update_fields=['status', 'update_time'])
        logger.info(f'资源需求被拒绝: demand_id={demand_id}')
        return demand

    @classmethod
    def _create_feishu_approval(cls, demand: ResourceDemand, open_id: str):
        """创建飞书资源需求审批"""
        try:
            from libs.feishu_approval import create_resource_demand_approval
            instance_code = create_resource_demand_approval(
                open_id=open_id,
                plan_name=demand.visit_plan.name if demand.visit_plan else '',
                demand_summary=demand.summary,
                demand_id=demand.id,
            )
            if instance_code:
                demand.feishu_approval_instance_id = instance_code
                demand.save(update_fields=['feishu_approval_instance_id', 'update_time'])
        except Exception as e:
            logger.error(f'飞书资源需求审批创建失败: {e}')
