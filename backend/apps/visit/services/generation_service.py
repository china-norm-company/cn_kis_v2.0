"""
访视计划自动生成服务

来源：cn_kis_test visit/services/generation_service.py

核心流程：
Protocol.parsed_data → VisitPlan → VisitNode(V1/V2/...) → VisitActivity
自动匹配已有 ActivityTemplate，实现"人机料法环"闭环。
"""
import logging
from typing import Optional
from django.db import transaction

from apps.protocol.models import Protocol
from apps.visit.models import VisitPlan, VisitNode, VisitActivity, VisitPlanStatus, ActivityType
from apps.resource.models import ActivityTemplate

logger = logging.getLogger(__name__)


class VisitGenerationService:
    """
    访视计划自动生成服务

    从已解析的协议（parsed_data.visits）自动生成完整的访视计划结构。
    """

    @classmethod
    @transaction.atomic
    def generate_from_protocol(cls, protocol_id: int, created_by_id: int = None) -> dict:
        """
        从协议自动生成访视计划

        Args:
            protocol_id: 协议 ID
            created_by_id: 创建人 Account ID

        Returns:
            {
                'plan': VisitPlan,
                'nodes': [VisitNode, ...],
                'activities': [VisitActivity, ...],
                'stats': {'node_count': int, 'activity_count': int, 'matched_templates': int}
            }

        Raises:
            ValueError: parsed_data 为空或格式不正确
        """
        protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
        if not protocol:
            raise ValueError(f'协议不存在: id={protocol_id}')

        # 幂等检查：同一协议已有未删除的访视计划时，提示而非重复生成
        existing_plan = VisitPlan.objects.filter(
            protocol=protocol, is_deleted=False,
        ).first()
        if existing_plan:
            raise ValueError(
                f'协议#{protocol_id} 已存在访视计划 (plan_id={existing_plan.id})，'
                f'请删除现有计划后重新生成，或直接使用现有计划。'
            )

        parsed_data = protocol.parsed_data
        if not parsed_data:
            raise ValueError(f'协议 parsed_data 为空，请先执行 AI 解析: protocol_id={protocol_id}')

        visits_data = parsed_data.get('visits', [])
        if not visits_data:
            raise ValueError(
                f'协议 parsed_data 中无 visits 数据: protocol_id={protocol_id}'
            )

        # S2-5 AC-4：检查有效伦理批件，无则警告
        ethics_warning = ''
        try:
            from apps.ethics.services import check_valid_ethics
            ethics_result = check_valid_ethics(protocol_id)
            if not ethics_result['has_valid']:
                ethics_warning = ethics_result['warning']
                logger.warning(ethics_warning)
        except Exception as e:
            logger.error(f'伦理批件检查失败: {e}')

        # 创建访视计划
        plan = VisitPlan.objects.create(
            protocol=protocol,
            name=f'{protocol.title} - 访视计划',
            description=f'由协议自动生成，共 {len(visits_data)} 个访视节点',
            status=VisitPlanStatus.DRAFT,
            created_by_id=created_by_id,
        )

        # 预加载活动模板（按 name 索引，用于自动匹配）
        template_map = cls._build_template_map()

        all_nodes = []
        all_activities = []
        matched_count = 0

        for idx, visit_item in enumerate(visits_data):
            node, activities, matched = cls._create_visit_node_with_activities(
                plan=plan,
                visit_item=visit_item,
                order=idx,
                template_map=template_map,
            )
            all_nodes.append(node)
            all_activities.extend(activities)
            matched_count += matched

        logger.info(
            f'访视计划生成完成: plan_id={plan.id}, '
            f'nodes={len(all_nodes)}, activities={len(all_activities)}, '
            f'matched_templates={matched_count}'
        )

        return {
            'plan': plan,
            'nodes': all_nodes,
            'activities': all_activities,
            'stats': {
                'node_count': len(all_nodes),
                'activity_count': len(all_activities),
                'matched_templates': matched_count,
            },
            'warnings': [ethics_warning] if ethics_warning else [],
        }

    @classmethod
    def _build_template_map(cls) -> dict:
        """
        构建活动模板索引

        返回 {模板名称小写: ActivityTemplate} 映射，用于自动匹配。
        """
        templates = ActivityTemplate.objects.filter(is_active=True, is_deleted=False)
        result = {}
        for tpl in templates:
            result[tpl.name.lower()] = tpl
            # 也按 code 索引
            result[tpl.code.lower()] = tpl
        return result

    @classmethod
    def _create_visit_node_with_activities(
        cls,
        plan: VisitPlan,
        visit_item: dict,
        order: int,
        template_map: dict,
    ) -> tuple:
        """
        创建单个访视节点及其活动

        Args:
            visit_item: parsed_data.visits 中的一个元素，结构：
                {
                    "visit_code": "V1",
                    "visit_name": "基线访视",
                    "visit_day": 0,
                    "visit_window_min": -3,
                    "visit_window_max": 3,
                    "procedures": ["Corneometer检测", "TEWL测试", ...]
                }

        Returns:
            (VisitNode, [VisitActivity, ...], matched_count)
        """
        visit_code = visit_item.get('visit_code', f'V{order + 1}')
        visit_name = visit_item.get('visit_name', f'访视{order + 1}')
        visit_day = visit_item.get('visit_day', 0)
        window_min = visit_item.get('visit_window_min', 0)
        window_max = visit_item.get('visit_window_max', 0)

        node = VisitNode.objects.create(
            plan=plan,
            name=visit_name,
            code=visit_code,
            baseline_day=visit_day,
            window_before=abs(window_min) if window_min else 0,
            window_after=window_max if window_max else 0,
            status=VisitPlanStatus.DRAFT,
            order=order,
        )

        procedures = visit_item.get('procedures', [])
        activities = []
        matched_count = 0

        for proc_idx, proc in enumerate(procedures):
            activity, matched = cls._create_activity_from_procedure(
                node=node,
                procedure=proc,
                order=proc_idx,
                template_map=template_map,
            )
            activities.append(activity)
            if matched:
                matched_count += 1

        return node, activities, matched_count

    @classmethod
    def _create_activity_from_procedure(
        cls,
        node: VisitNode,
        procedure,
        order: int,
        template_map: dict,
    ) -> tuple:
        """
        从单个检测项创建访视活动

        procedure 支持两种格式：
        - 字符串："Corneometer检测"
        - 字典：{"name": "Corneometer检测", "suggested_category": "instrument", ...}

        Returns:
            (VisitActivity, is_matched: bool)
        """
        if isinstance(procedure, str):
            proc_name = procedure
            proc_category = 'other'
        elif isinstance(procedure, dict):
            proc_name = procedure.get('name', '未命名检测')
            proc_category = procedure.get('suggested_category', 'other')
        else:
            proc_name = str(procedure)
            proc_category = 'other'

        # 推断活动类型
        activity_type = cls._infer_activity_type(proc_name, proc_category)

        # 尝试匹配活动模板
        matched_template = cls._match_template(proc_name, template_map)

        # 从协议数据读取 is_required，默认为 True
        is_required = True
        if isinstance(procedure, dict):
            is_required = procedure.get('is_required', True)

        activity = VisitActivity.objects.create(
            node=node,
            name=proc_name,
            activity_type=activity_type,
            description='',
            is_required=is_required,
            order=order,
            activity_template=matched_template,
        )

        return activity, matched_template is not None

    @classmethod
    def _match_template(cls, proc_name: str, template_map: dict) -> Optional[ActivityTemplate]:
        """
        尝试将检测项名称匹配到已有活动模板

        匹配策略：
        1. 精确匹配（名称完全一致）
        2. 包含匹配（模板名包含在检测项名中，或反之）
        """
        name_lower = proc_name.lower().strip()

        # 精确匹配
        if name_lower in template_map:
            return template_map[name_lower]

        # 包含匹配
        for key, tpl in template_map.items():
            if key in name_lower or name_lower in key:
                return tpl

        return None

    @classmethod
    def _infer_activity_type(cls, proc_name: str, proc_category: str) -> str:
        """根据名称和分类推断活动类型"""
        category_mapping = {
            'instrument': ActivityType.EXAMINATION,
            'laboratory': ActivityType.LABORATORY,
            'questionnaire': ActivityType.QUESTIONNAIRE,
            'medication': ActivityType.MEDICATION,
        }

        if proc_category in category_mapping:
            return category_mapping[proc_category]

        name_lower = proc_name.lower()
        if any(kw in name_lower for kw in ['检测', '测量', '拍照', '仪器', '设备']):
            return ActivityType.EXAMINATION
        if any(kw in name_lower for kw in ['血', '尿', '实验室', '生化']):
            return ActivityType.LABORATORY
        if any(kw in name_lower for kw in ['问卷', '量表', '评分']):
            return ActivityType.QUESTIONNAIRE
        if any(kw in name_lower for kw in ['用药', '给药', '服药']):
            return ActivityType.MEDICATION

        return ActivityType.OTHER
