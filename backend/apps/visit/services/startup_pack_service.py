"""
项目启动包草稿服务

主链：protocol -> 访视计划 -> 资源需求 -> 启动就绪清单 -> 排程草案 -> 工单模板 -> 招募准备包
供 protocol-to-startup-pack 技能与 API 调用。
"""
import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.db import transaction

from apps.protocol.models import Protocol
from apps.visit.models import (
    VisitPlan, VisitNode, VisitActivity,
    ResourceDemand, ResourceDemandStatus,
)
from apps.visit.services.generation_service import VisitGenerationService
from apps.visit.services.resource_demand_service import ResourceDemandService
from apps.scheduling.models import SchedulePlan, ScheduleSlot, SchedulePlanStatus
from apps.scheduling.services import IntelligentSchedulingService

logger = logging.getLogger(__name__)


class StartupPackService:
    """项目启动包草稿：协议 → 成套审阅材料"""

    @classmethod
    def generate_draft(
        cls,
        protocol_id: int,
        created_by_id: Optional[int] = None,
        schedule_start_days_offset: int = 0,
        schedule_duration_days: int = 365,
    ) -> Dict[str, Any]:
        """
        生成启动包草稿（协议结构化摘要、访视矩阵、资源需求、就绪清单、排程草案、工单模板、招募准备包）。

        Args:
            protocol_id: 协议 ID
            created_by_id: 创建人 Account ID
            schedule_start_days_offset: 排程起始相对今天的偏移天数
            schedule_duration_days: 排程跨度天数

        Returns:
            启动包草稿 dict，供项目经理审阅
        """
        protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
        if not protocol:
            return cls._error_pack(protocol_id, '协议不存在')

        parsed_data = protocol.parsed_data or {}
        if not parsed_data.get('visits'):
            return cls._error_pack(
                protocol_id,
                '协议尚未解析或无访视数据，请先执行 protocol-parser 技能解析协议文档。',
            )

        try:
            with transaction.atomic():
                plan, plan_created = cls._get_or_create_visit_plan(protocol_id, created_by_id)
                if not plan:
                    return cls._error_pack(protocol_id, '访视计划生成失败')

                resource_demand = cls._get_or_create_resource_demand(plan.id)
                readiness = cls._build_readiness_checklist(protocol_id, plan, resource_demand)
                schedule_draft = cls._build_schedule_draft(
                    plan, schedule_start_days_offset, schedule_duration_days, created_by_id,
                )
                workorder_templates = cls._build_workorder_templates(plan)
                recruitment_pack = cls._build_recruitment_pack(protocol, parsed_data)

                return {
                    'protocol_id': protocol_id,
                    'protocol_title': protocol.title,
                    'visit_plan_id': plan.id,
                    'visit_plan_name': plan.name,
                    'resource_demand_id': resource_demand.id if resource_demand else None,
                    'schedule_plan_id': schedule_draft.get('schedule_plan_id'),
                    'structured_summary': cls._build_structured_summary(protocol, parsed_data, plan),
                    'visit_execution_matrix': cls._build_visit_matrix(plan),
                    'resource_demand_spec': cls._resource_demand_spec(resource_demand),
                    'readiness_checklist': readiness,
                    'schedule_draft': schedule_draft,
                    'workorder_templates': workorder_templates,
                    'recruitment_pack': recruitment_pack,
                    'warnings': [],
                }
        except ValueError as e:
            return cls._error_pack(protocol_id, str(e))
        except Exception as e:
            logger.exception('generate_startup_pack_draft failed: protocol_id=%s', protocol_id)
            return cls._error_pack(protocol_id, f'生成失败: {e}')

    @classmethod
    def _error_pack(cls, protocol_id: int, message: str) -> Dict[str, Any]:
        return {
            'protocol_id': protocol_id,
            'error': message,
            'structured_summary': None,
            'visit_execution_matrix': [],
            'resource_demand_spec': None,
            'readiness_checklist': [],
            'schedule_draft': {},
            'workorder_templates': [],
            'recruitment_pack': {},
            'warnings': [message],
        }

    @classmethod
    def _get_or_create_visit_plan(cls, protocol_id: int, created_by_id: Optional[int]) -> tuple:
        plan = VisitPlan.objects.filter(
            protocol_id=protocol_id, is_deleted=False,
        ).first()
        if plan:
            return plan, False
        result = VisitGenerationService.generate_from_protocol(protocol_id, created_by_id=created_by_id)
        return result['plan'], True

    @classmethod
    def _get_or_create_resource_demand(cls, visit_plan_id: int) -> Optional[ResourceDemand]:
        try:
            return ResourceDemandService.generate_resource_demand(visit_plan_id)
        except Exception as e:
            logger.warning('Resource demand generation failed: visit_plan_id=%s, e=%s', visit_plan_id, e)
            return None

    @classmethod
    def _build_readiness_checklist(
        cls,
        protocol_id: int,
        plan: VisitPlan,
        resource_demand: Optional[ResourceDemand],
    ) -> List[Dict[str, Any]]:
        """启动就绪检查清单（与 quality_gate check_project_start_gate 一致，未通过将阻断排程/工单发布）。"""
        try:
            from apps.quality.services import check_project_start_gate
            gate_result = check_project_start_gate(protocol_id)
            checks = gate_result.get('checks', [])
            name_to_key = {
                '执行人员资质': 'qualification',
                '设备校准有效': 'equipment',
                'SOP 文件生效': 'sop',
                'SOP 培训完成': 'sop_training',
                '伦理批件有效': 'ethics',
                '关键物料到位': 'material',
            }
            items = []
            for c in checks:
                name = c.get('name', '')
                key = name_to_key.get(name, name.replace(' ', '_').lower())
                items.append({
                    'key': key,
                    'label': name,
                    'status': 'ok' if c.get('passed') else 'blocked',
                    'notes': c.get('detail', ''),
                })
            return items if items else cls._fallback_readiness_items()
        except Exception:
            return cls._fallback_readiness_items()

    @classmethod
    def _fallback_readiness_items(cls) -> List[Dict[str, Any]]:
        return [
            {'key': 'qualification', 'label': '执行人员资质', 'status': 'pending', 'notes': '待校验'},
            {'key': 'equipment', 'label': '设备校准与可用性', 'status': 'pending', 'notes': '待校验'},
            {'key': 'sop', 'label': 'SOP 培训与生效', 'status': 'pending', 'notes': '待校验'},
            {'key': 'ethics', 'label': '伦理批件有效', 'status': 'pending', 'notes': '待校验'},
            {'key': 'material', 'label': '关键物料到位', 'status': 'pending', 'notes': '待校验'},
        ]

    @classmethod
    def _build_schedule_draft(
        cls,
        plan: VisitPlan,
        start_offset_days: int,
        duration_days: int,
        created_by_id: Optional[int],
    ) -> Dict[str, Any]:
        """排程草案：创建 DRAFT 排程计划并生成时间槽（不要求资源需求已审批）。"""
        from datetime import date
        start_date = date.today() + timedelta(days=start_offset_days)
        end_date = start_date + timedelta(days=duration_days)
        try:
            schedule_plan = SchedulePlan.objects.create(
                visit_plan=plan,
                resource_demand=None,
                name=f'{plan.name} - 排程草案',
                start_date=start_date,
                end_date=end_date,
                status=SchedulePlanStatus.DRAFT,
                created_by_id=created_by_id,
            )
            slots = IntelligentSchedulingService.generate_schedule_slots(schedule_plan.id)
            return {
                'schedule_plan_id': schedule_plan.id,
                'schedule_plan_name': schedule_plan.name,
                'start_date': str(schedule_plan.start_date),
                'end_date': str(schedule_plan.end_date),
                'slot_count': len(slots),
                'slots_preview': [
                    {
                        'visit_node': s.visit_node.name if s.visit_node else '',
                        'scheduled_date': str(s.scheduled_date),
                        'start_time': str(s.start_time) if s.start_time else '',
                        'end_time': str(s.end_time) if s.end_time else '',
                    }
                    for s in (slots[:20] if len(slots) > 20 else slots)
                ],
            }
        except Exception as e:
            logger.warning('Schedule draft failed: plan_id=%s, e=%s', plan.id, e)
            return {'schedule_plan_id': None, 'error': str(e), 'slot_count': 0, 'slots_preview': []}

    @classmethod
    def _build_workorder_templates(cls, plan: VisitPlan) -> List[Dict[str, Any]]:
        """从 VisitActivity 生成工单模板列表（资源、资质、SOP、质控点）。"""
        nodes = VisitNode.objects.filter(plan=plan).order_by('order')
        templates = []
        for node in nodes:
            activities = VisitActivity.objects.filter(node=node).select_related('activity_template').order_by('order')
            for act in activities:
                tpl = {
                    'visit_node_name': node.name,
                    'visit_node_code': node.code,
                    'activity_name': act.name,
                    'activity_type': act.activity_type,
                    'title': f'{node.name} - {act.name}',
                    'description': act.description or '',
                    'is_required': act.is_required,
                    'resources': [],
                    'sop_confirmations': [],
                    'quality_points': [],
                }
                if act.activity_template_id:
                    tpl['activity_template_id'] = act.activity_template_id
                    tpl['activity_template_name'] = act.activity_template.name if act.activity_template else ''
                    try:
                        from apps.resource.models import ActivityBOM
                        boms = ActivityBOM.objects.filter(template=act.activity_template).select_related('resource_category')
                        tpl['resources'] = [
                            {
                                'category': b.resource_category.name if b.resource_category else '',
                                'quantity': b.quantity,
                            }
                            for b in boms
                        ]
                    except Exception:
                        pass
                templates.append(tpl)
        return templates

    @classmethod
    def _build_recruitment_pack(cls, protocol: Protocol, parsed_data: dict) -> Dict[str, Any]:
        """招募准备包：入排口径、FAQ、初筛问卷、渠道文案、海报文案（由 recruitment_prep_service 生成）。"""
        try:
            from apps.subject.services.recruitment_prep_service import generate_recruitment_prep_draft
            out = generate_recruitment_prep_draft(protocol_id=protocol.id)
            if out.get('error'):
                return {
                    'protocol_title': protocol.title,
                    'inclusion_criteria_summary': [],
                    'exclusion_criteria_summary': [],
                    'planned_enrollment': 0,
                    'faq_draft': [],
                    'screening_questionnaire_draft': [],
                    'channel_copy_draft': '',
                    'poster_copy_draft': {},
                    'channel_strategy_draft': {},
                }
            return {
                'protocol_title': out.get('protocol_title', protocol.title),
                'inclusion_criteria_summary': out.get('inclusion_criteria_summary', [])[:10],
                'exclusion_criteria_summary': out.get('exclusion_criteria_summary', [])[:10],
                'planned_enrollment': out.get('planned_enrollment', 0),
                'faq_draft': out.get('faq_draft', []),
                'screening_questionnaire_draft': out.get('screening_questionnaire_draft', []),
                'channel_copy_draft': out.get('channel_copy_draft', ''),
                'poster_copy_draft': out.get('poster_copy_draft', {}),
                'channel_strategy_draft': out.get('channel_strategy_draft', {}),
            }
        except Exception:
            inclusion = parsed_data.get('inclusion_criteria') or parsed_data.get('inclusion', [])
            exclusion = parsed_data.get('exclusion_criteria') or parsed_data.get('exclusion', [])
            if isinstance(inclusion, str):
                inclusion = [inclusion]
            if isinstance(exclusion, str):
                exclusion = [exclusion]
            sample = parsed_data.get('sample_size') or {}
            planned = sample.get('planned', sample.get('n', 0)) if isinstance(sample, dict) else 0
            return {
                'protocol_title': protocol.title,
                'inclusion_criteria_summary': inclusion[:10],
                'exclusion_criteria_summary': exclusion[:10],
                'planned_enrollment': planned,
                'faq_draft': [],
                'screening_questionnaire_draft': [],
                'channel_copy_draft': '',
                'poster_copy_draft': {},
                'channel_strategy_draft': {},
            }

    @classmethod
    def _build_structured_summary(
        cls,
        protocol: Protocol,
        parsed_data: dict,
        plan: VisitPlan,
    ) -> Dict[str, Any]:
        """协议结构化摘要。"""
        visits = parsed_data.get('visits', [])
        return {
            'title': protocol.title,
            'sponsor': parsed_data.get('sponsor') or '',
            'objectives': parsed_data.get('objectives') or {},
            'endpoints': parsed_data.get('endpoints') or {},
            'visit_count': len(visits),
            'visit_plan_id': plan.id,
            'visit_plan_name': plan.name,
        }

    @classmethod
    def _build_visit_matrix(cls, plan: VisitPlan) -> List[Dict[str, Any]]:
        """访视执行矩阵。"""
        nodes = VisitNode.objects.filter(plan=plan).order_by('order')
        return [
            {
                'visit_code': n.code,
                'visit_name': n.name,
                'baseline_day': n.baseline_day,
                'window': f'D{n.baseline_day - n.window_before}~D{n.baseline_day + n.window_after}',
                'activity_count': VisitActivity.objects.filter(node=n).count(),
            }
            for n in nodes
        ]

    @classmethod
    def _resource_demand_spec(cls, demand: Optional[ResourceDemand]) -> Optional[Dict[str, Any]]:
        if not demand:
            return None
        return {
            'resource_demand_id': demand.id,
            'status': demand.status,
            'summary': demand.summary,
            'categories_count': len(demand.demand_details) if isinstance(demand.demand_details, list) else 0,
            'demand_details': demand.demand_details[:20] if isinstance(demand.demand_details, list) else [],
        }
