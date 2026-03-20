"""
DataBus — Claw 统一数据总线

为所有 Claw 技能提供标准化数据接口，覆盖 15 个工作台业务模块。
每个模块通过 Adapter 对接底层服务，提供统一的 snapshot / entity / search 接口。
"""
import logging
from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from django.db.models import Q

logger = logging.getLogger('cn_kis.claw.data_bus')


class ModuleAdapter(ABC):
    """模块适配器基类"""

    module_name: str = ''
    display_name: str = ''

    @abstractmethod
    def get_snapshot(self, filters: Optional[dict] = None) -> dict:
        """获取模块 KPI 快照"""

    def get_entity(self, entity_id: int) -> dict:
        """获取单个实体详情（子类可覆盖）"""
        return {'error': f'{self.module_name} 不支持实体查询'}

    def search(self, query: str) -> list:
        """模块内搜索（子类可覆盖）"""
        return []


# ---------------------------------------------------------------------------
# 已有 5 个模块的 Adapter（从 kpi-snapshot 现有逻辑迁移 + 增强）
# ---------------------------------------------------------------------------

class WorkorderAdapter(ModuleAdapter):
    module_name = 'workorder'
    display_name = '工单'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.workorder.models import WorkOrder
            today = date.today()
            qs = WorkOrder.objects.filter(is_deleted=False)
            total = qs.count()
            completed = qs.filter(status__in=['completed', 'approved']).count()
            overdue = qs.filter(due_date__lt=today).exclude(
                status__in=['completed', 'approved', 'cancelled']
            ).count()
            in_progress = qs.filter(status='in_progress').count()
            return {
                'total': total, 'completed': completed, 'overdue': overdue,
                'in_progress': in_progress,
                'completion_rate': f'{completed / total * 100:.1f}%' if total else '0%',
            }
        except Exception as e:
            logger.warning('WorkorderAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def get_entity(self, entity_id: int) -> dict:
        try:
            from apps.workorder.models import WorkOrder
            wo = WorkOrder.objects.filter(id=entity_id, is_deleted=False).first()
            if not wo:
                return {'error': 'not_found'}
            return {
                'id': wo.id, 'title': wo.title, 'status': wo.status,
                'priority': getattr(wo, 'priority', ''),
                'due_date': str(wo.due_date) if wo.due_date else None,
                'assignee_id': getattr(wo, 'assigned_to_id', None),
                'created': wo.create_time.isoformat() if wo.create_time else None,
            }
        except Exception as e:
            return {'error': str(e)}

    def search(self, query: str) -> list:
        try:
            from apps.workorder.models import WorkOrder
            results = WorkOrder.objects.filter(
                Q(title__icontains=query) | Q(description__icontains=query),
                is_deleted=False,
            )[:20]
            return [{'id': r.id, 'title': r.title, 'status': r.status} for r in results]
        except Exception:
            return []


class SchedulingAdapter(ModuleAdapter):
    module_name = 'scheduling'
    display_name = '排程'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.scheduling.models import ScheduleSlot
            today = date.today()
            today_visits = ScheduleSlot.objects.filter(scheduled_date=today).count()
            week_visits = ScheduleSlot.objects.filter(
                scheduled_date__gte=today,
                scheduled_date__lte=today + timedelta(days=7),
            ).count()
            overdue = ScheduleSlot.objects.filter(
                scheduled_date__lt=today,
                status__in=['planned', 'confirmed'],
            ).count()
            return {
                'today_visits': today_visits, 'week_visits': week_visits,
                'overdue_visits': overdue,
            }
        except Exception as e:
            logger.warning('SchedulingAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}


class QualityAdapter(ModuleAdapter):
    module_name = 'quality'
    display_name = '质量'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.quality.models import Deviation, CAPA, SOP
            open_dev = Deviation.objects.filter(
                status__in=['open', 'investigating']
            ).count()
            overdue_capa = CAPA.objects.filter(status='overdue').count()
            total_capa = CAPA.objects.count()
            effective_sops = SOP.objects.filter(status='effective').count()
            overdue_review = SOP.objects.filter(
                status='effective', next_review__lt=date.today()
            ).count()
            return {
                'open_deviations': open_dev,
                'overdue_capas': overdue_capa,
                'total_capas': total_capa,
                'effective_sops': effective_sops,
                'sop_review_overdue': overdue_review,
            }
        except Exception as e:
            logger.warning('QualityAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def search(self, query: str) -> list:
        try:
            from apps.quality.models import Deviation, CAPA, SOP

            deviations = Deviation.objects.filter(
                is_deleted=False,
            ).filter(
                Q(code__icontains=query) |
                Q(title__icontains=query) |
                Q(project__icontains=query) |
                Q(reporter__icontains=query) |
                Q(description__icontains=query)
            ).order_by('-reported_at')[:8]

            capas = CAPA.objects.filter(
                is_deleted=False,
            ).filter(
                Q(code__icontains=query) |
                Q(title__icontains=query) |
                Q(responsible__icontains=query) |
                Q(action_detail__icontains=query)
            ).select_related('deviation').order_by('-create_time')[:6]

            sops = SOP.objects.filter(
                is_deleted=False,
            ).filter(
                Q(code__icontains=query) |
                Q(title__icontains=query) |
                Q(category__icontains=query) |
                Q(owner__icontains=query)
            ).order_by('-update_time')[:6]

            results = [
                {
                    'id': item.id,
                    'title': item.title,
                    'status': item.status,
                    'type': 'deviation',
                    'subtitle': f'{item.code} | {item.project} | {item.reporter}',
                    'date': str(item.reported_at) if item.reported_at else None,
                }
                for item in deviations
            ]
            results.extend([
                {
                    'id': item.id,
                    'title': item.title,
                    'status': item.status,
                    'type': 'capa',
                    'subtitle': f'{item.code} | {item.responsible} | 偏差#{item.deviation_id}',
                    'date': str(item.due_date) if item.due_date else None,
                }
                for item in capas
            ])
            results.extend([
                {
                    'id': item.id,
                    'title': item.title,
                    'status': item.status,
                    'type': 'sop',
                    'subtitle': f'{item.code} | {item.category} | {item.version}',
                    'date': str(item.next_review) if item.next_review else None,
                }
                for item in sops
            ])
            return results[:20]
        except Exception:
            return []


class EquipmentAdapter(ModuleAdapter):
    module_name = 'equipment'
    display_name = '设备'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.resource.models import ResourceItem
            today = date.today()
            qs = ResourceItem.objects.filter(is_deleted=False)
            total = qs.count()
            cal_due_7d = qs.filter(
                next_calibration_date__lte=today + timedelta(days=7),
                next_calibration_date__isnull=False,
            ).count()
            cal_overdue = qs.filter(
                next_calibration_date__lt=today,
                next_calibration_date__isnull=False,
            ).count()
            active = qs.filter(status='active').count()
            return {
                'total': total, 'active': active,
                'calibration_due_7d': cal_due_7d,
                'calibration_overdue': cal_overdue,
            }
        except Exception as e:
            logger.warning('EquipmentAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def get_entity(self, entity_id: int) -> dict:
        try:
            from apps.resource.models import ResourceItem
            item = ResourceItem.objects.filter(id=entity_id, is_deleted=False).first()
            if not item:
                return {'error': 'not_found'}
            return {
                'id': item.id, 'name': item.name, 'code': item.code,
                'status': item.status,
                'next_calibration_date': str(item.next_calibration_date) if item.next_calibration_date else None,
            }
        except Exception as e:
            return {'error': str(e)}

    def search(self, query: str) -> list:
        try:
            from apps.resource.services.equipment_service import list_equipment

            payload = list_equipment(keyword=query, page=1, page_size=20, sort_by='name')
            items = payload.get('items', [])
            return [
                {
                    'id': item['id'],
                    'title': item.get('name', ''),
                    'status': item.get('status', ''),
                    'type': 'equipment',
                    'subtitle': ' | '.join(filter(None, [
                        item.get('code', ''),
                        item.get('model_number', ''),
                        item.get('serial_number', ''),
                    ])),
                    'date': item.get('calibration_info', {}).get('next_due_date'),
                }
                for item in items
            ]
        except Exception:
            return []


class ProjectAdapter(ModuleAdapter):
    module_name = 'projects'
    display_name = '项目'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.protocol.models import Protocol
            qs = Protocol.objects.filter(is_deleted=False)
            active = qs.filter(status='active').count()
            total = qs.count()
            draft = qs.filter(status='draft').count()
            completed = qs.filter(status='completed').count()
            return {
                'total': total, 'active': active,
                'draft': draft, 'completed': completed,
            }
        except Exception as e:
            logger.warning('ProjectAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def get_entity(self, entity_id: int) -> dict:
        try:
            from apps.protocol.models import Protocol
            p = Protocol.objects.filter(id=entity_id, is_deleted=False).first()
            if not p:
                return {'error': 'not_found'}
            return {
                'id': p.id, 'title': p.title, 'code': getattr(p, 'code', ''),
                'status': p.status,
                'sample_size': getattr(p, 'sample_size', None),
                'sponsor': getattr(p, 'sponsor', ''),
            }
        except Exception as e:
            return {'error': str(e)}

    def search(self, query: str) -> list:
        try:
            from apps.protocol.models import Protocol
            results = Protocol.objects.filter(
                Q(title__icontains=query) | Q(code__icontains=query),
                is_deleted=False,
            )[:20]
            return [{'id': r.id, 'title': r.title, 'status': r.status} for r in results]
        except Exception:
            return []


# ---------------------------------------------------------------------------
# 新增 10 个模块的 Adapter
# ---------------------------------------------------------------------------

class FinanceAdapter(ModuleAdapter):
    module_name = 'finance'
    display_name = '财务'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.finance.services.report_engine import (
                collect_monthly_operation_report,
                collect_ar_aging_report,
            )
            today = date.today()
            monthly = collect_monthly_operation_report(today.year, today.month)
            ar = collect_ar_aging_report(today)

            current = monthly.get('current', {})
            return {
                'monthly_revenue': current.get('revenue', 0),
                'ar_aging_total': ar.get('total', 0),
                'overdue_receivable': ar.get('summary', {}).get('overdue_90', 0),
                'active_contracts': monthly.get('active_contracts', 0),
                'profit_rate': current.get('profit_rate', '0%'),
            }
        except Exception as e:
            logger.warning('FinanceAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def get_entity(self, entity_id: int) -> dict:
        try:
            from apps.finance.models import Contract
            c = Contract.objects.filter(id=entity_id).first()
            if not c:
                return {'error': 'not_found'}
            return {
                'id': c.id,
                'contract_number': getattr(c, 'contract_number', ''),
                'client_name': getattr(c, 'client_name', ''),
                'total_amount': float(c.total_amount) if hasattr(c, 'total_amount') and c.total_amount else 0,
                'status': c.status,
            }
        except Exception as e:
            return {'error': str(e)}

    def search(self, query: str) -> list:
        try:
            from apps.finance.models import Contract, Quote
            contracts = Contract.objects.filter(
                Q(contract_number__icontains=query) | Q(client_name__icontains=query)
            )[:10]
            results = [{'id': c.id, 'type': 'contract', 'title': getattr(c, 'contract_number', str(c.id))} for c in contracts]
            quotes = Quote.objects.filter(
                Q(quote_number__icontains=query) | Q(project_name__icontains=query)
            )[:10]
            results.extend([{'id': q.id, 'type': 'quote', 'title': getattr(q, 'quote_number', str(q.id))} for q in quotes])
            return results
        except Exception:
            return []


class CRMAdapter(ModuleAdapter):
    module_name = 'crm'
    display_name = '客户'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.crm.models import Client, Opportunity
            active_clients = Client.objects.filter(is_deleted=False, status='active').count()
            total_clients = Client.objects.filter(is_deleted=False).count()
            open_opps = Opportunity.objects.filter(
                is_deleted=False, stage__in=['prospecting', 'qualification', 'proposal', 'negotiation']
            ).count()
            won_opps = Opportunity.objects.filter(is_deleted=False, stage='closed_won').count()
            total_opps = Opportunity.objects.filter(is_deleted=False).exclude(stage='closed_lost').count()
            return {
                'active_clients': active_clients,
                'total_clients': total_clients,
                'open_opportunities': open_opps,
                'win_rate': f'{won_opps / total_opps * 100:.1f}%' if total_opps else '0%',
            }
        except Exception as e:
            logger.warning('CRMAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def get_entity(self, entity_id: int) -> dict:
        try:
            from apps.crm.insight_service import generate_client_insight
            return generate_client_insight(entity_id)
        except Exception as e:
            return {'error': str(e)}

    def search(self, query: str) -> list:
        try:
            from apps.crm.models import Client
            results = Client.objects.filter(
                Q(name__icontains=query) | Q(contact_person__icontains=query),
                is_deleted=False,
            )[:20]
            return [{'id': r.id, 'name': r.name, 'status': getattr(r, 'status', '')} for r in results]
        except Exception:
            return []


class RecruitmentAdapter(ModuleAdapter):
    module_name = 'recruitment'
    display_name = '招募'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.subject.services.recruitment_service import list_plans, list_registrations
            plans = list_plans(status='active')
            active_plans = plans.get('total', 0)

            regs = list_registrations(status='screening')
            screening_count = regs.get('total', 0)

            from apps.subject.models import Enrollment
            enrolled = Enrollment.objects.filter(status='enrolled').count()
            screened = Enrollment.objects.exclude(status='screening_failed').count()
            enrollment_rate = f'{enrolled / screened * 100:.1f}%' if screened else '0%'

            return {
                'active_plans': active_plans,
                'screening_count': screening_count,
                'enrollment_rate': enrollment_rate,
            }
        except Exception as e:
            logger.warning('RecruitmentAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}


class EthicsAdapter(ModuleAdapter):
    module_name = 'ethics'
    display_name = '伦理'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.ethics.services import list_applications
            from apps.ethics.services.training_service import list_trainings
            from apps.ethics.models import ApprovalDocument

            pending = list_applications(status='submitted')
            pending_count = pending.get('total', 0)

            today = date.today()
            expiring = ApprovalDocument.objects.filter(
                is_active=True,
                expiry_date__lte=today + timedelta(days=30),
                expiry_date__gte=today,
            ).count()

            trainings = list_trainings(status='completed')
            training_completed = trainings.get('total', 0)
            trainings_all = list_trainings()
            training_total = trainings_all.get('total', 0)
            coverage = f'{training_completed / training_total * 100:.1f}%' if training_total else '0%'

            return {
                'pending_applications': pending_count,
                'expiring_approvals': expiring,
                'training_coverage': coverage,
            }
        except Exception as e:
            logger.warning('EthicsAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def search(self, query: str) -> list:
        try:
            from apps.ethics.models import EthicsApplication
            from apps.ethics.models_regulation import Regulation

            applications = EthicsApplication.objects.select_related(
                'protocol', 'committee',
            ).filter(
                Q(application_number__icontains=query) |
                Q(protocol__title__icontains=query) |
                Q(committee__name__icontains=query) |
                Q(remarks__icontains=query)
            ).order_by('-create_time')[:10]

            regulations = Regulation.objects.filter(
                Q(title__icontains=query) |
                Q(document_number__icontains=query) |
                Q(issuing_authority__icontains=query) |
                Q(summary__icontains=query)
            ).order_by('-publish_date', '-create_time')[:10]

            results = [
                {
                    'id': item.id,
                    'title': item.application_number,
                    'status': item.status,
                    'type': 'ethics_application',
                    'subtitle': ' | '.join(filter(None, [
                        getattr(item.protocol, 'title', ''),
                        getattr(item.committee, 'name', ''),
                        item.version,
                    ])),
                    'date': str(item.submission_date) if item.submission_date else None,
                }
                for item in applications
            ]
            results.extend([
                {
                    'id': item.id,
                    'title': item.title,
                    'status': item.status,
                    'type': 'ethics_regulation',
                    'subtitle': ' | '.join(filter(None, [
                        item.document_number,
                        item.issuing_authority,
                    ])),
                    'date': str(item.publish_date) if item.publish_date else None,
                }
                for item in regulations
            ])
            return results[:20]
        except Exception:
            return []


class HRAdapter(ModuleAdapter):
    module_name = 'hr'
    display_name = '人事'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.hr.services import list_staff, list_assessments, get_staff_stats
            stats = get_staff_stats()

            from apps.hr.models import Staff
            today = date.today()
            gcp_expiring = Staff.objects.filter(
                is_deleted=False,
                gcp_expiry__isnull=False,
                gcp_expiry__lte=today + timedelta(days=30),
                gcp_expiry__gte=today,
            ).count()

            from apps.hr.models import Training
            total_trainings = Training.objects.count()
            completed_trainings = Training.objects.filter(status='completed').count()
            training_rate = f'{completed_trainings / total_trainings * 100:.1f}%' if total_trainings else '0%'

            gcp_stats = stats.get('by_gcp_status', {})
            gaps = gcp_stats.get('expired', 0) + gcp_stats.get('none', 0)

            return {
                'gcp_expiring_30d': gcp_expiring,
                'training_completion_rate': training_rate,
                'qualification_gaps': gaps,
                'total_staff': stats.get('total', 0),
            }
        except Exception as e:
            logger.warning('HRAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def get_entity(self, entity_id: int) -> dict:
        try:
            from apps.hr.models import Staff
            s = Staff.objects.filter(id=entity_id, is_deleted=False).first()
            if not s:
                return {'error': 'not_found'}
            return {
                'id': s.id, 'name': s.name,
                'department': getattr(s, 'department', ''),
                'gcp_expiry_date': str(s.gcp_expiry) if s.gcp_expiry else None,
            }
        except Exception as e:
            return {'error': str(e)}

    def search(self, query: str) -> list:
        try:
            from apps.hr.models import Staff, Assessment, Training

            staff = Staff.objects.filter(
                is_deleted=False,
            ).filter(
                Q(name__icontains=query) |
                Q(employee_no__icontains=query) |
                Q(department__icontains=query) |
                Q(position__icontains=query) |
                Q(email__icontains=query) |
                Q(phone__icontains=query)
            ).order_by('name')[:10]

            assessments = Assessment.objects.filter(
                is_deleted=False,
            ).select_related('staff').filter(
                Q(period__icontains=query) |
                Q(status__icontains=query) |
                Q(staff__name__icontains=query)
            ).order_by('-create_time')[:5]

            trainings = Training.objects.filter(
                is_deleted=False,
            ).select_related('trainee').filter(
                Q(course_name__icontains=query) |
                Q(status__icontains=query) |
                Q(category__icontains=query) |
                Q(trainee__name__icontains=query)
            ).order_by('-create_time')[:5]

            results = [
                {
                    'id': item.id,
                    'title': item.name,
                    'status': item.gcp_status,
                    'type': 'staff',
                    'subtitle': ' | '.join(filter(None, [
                        item.employee_no,
                        item.department,
                        item.position,
                    ])),
                    'date': str(item.gcp_expiry) if item.gcp_expiry else None,
                }
                for item in staff
            ]
            results.extend([
                {
                    'id': item.id,
                    'title': f'评估: {item.staff.name} - {item.period}',
                    'status': item.status,
                    'type': 'assessment',
                    'subtitle': ' | '.join(filter(None, [
                        item.staff.name,
                        item.period,
                    ])),
                    'date': item.create_time.isoformat() if item.create_time else None,
                }
                for item in assessments
            ])
            results.extend([
                {
                    'id': item.id,
                    'title': item.course_name,
                    'status': item.status,
                    'type': 'training',
                    'subtitle': ' | '.join(filter(None, [
                        getattr(item.trainee, 'name', ''),
                        item.category,
                    ])),
                    'date': str(item.start_date) if item.start_date else None,
                }
                for item in trainings
            ])
            return results[:20]
        except Exception:
            return []


class ReceptionAdapter(ModuleAdapter):
    module_name = 'reception'
    display_name = '接待'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.subject.services.reception_service import get_today_stats, get_today_queue
            stats = get_today_stats()
            queue = get_today_queue()

            queue_items = queue.get('items', [])
            waiting = [i for i in queue_items if i.get('status') in ('checked_in', 'waiting')]

            return {
                'today_checkins': stats.get('checked_in', 0),
                'avg_wait_minutes': stats.get('avg_wait_minutes', 0),
                'queue_length': len(waiting),
            }
        except Exception as e:
            logger.warning('ReceptionAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}


class SampleAdapter(ModuleAdapter):
    module_name = 'sample'
    display_name = '物料'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.sample.services_material import get_expiry_alerts, list_inventory
            expiry = get_expiry_alerts()
            inventory = list_inventory()

            exp_stats = expiry.get('stats', {})
            return {
                'expiry_alerts': exp_stats.get('red_count', 0) + exp_stats.get('orange_count', 0),
                'low_stock_items': 0,
                'total_inventory': inventory.get('total', 0),
            }
        except Exception as e:
            logger.warning('SampleAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def search(self, query: str) -> list:
        try:
            from apps.sample.models import Product, SampleInstance
            from apps.sample.models_material import Consumable

            products = Product.objects.filter(
                is_deleted=False,
            ).filter(
                Q(name__icontains=query) |
                Q(code__icontains=query) |
                Q(batch_number__icontains=query) |
                Q(sponsor__icontains=query) |
                Q(protocol_name__icontains=query)
            ).order_by('code')[:8]

            samples = SampleInstance.objects.select_related(
                'product', 'protocol',
            ).filter(
                Q(unique_code__icontains=query) |
                Q(product__name__icontains=query) |
                Q(current_holder_name__icontains=query) |
                Q(protocol__title__icontains=query)
            ).order_by('-create_time')[:6]

            consumables = Consumable.objects.filter(
                is_deleted=False,
            ).filter(
                Q(name__icontains=query) |
                Q(code__icontains=query) |
                Q(category__icontains=query)
            ).order_by('code')[:6]

            results = [
                {
                    'id': item.id,
                    'title': item.name,
                    'status': item.status,
                    'type': 'product',
                    'subtitle': ' | '.join(filter(None, [
                        item.code,
                        item.batch_number,
                        item.protocol_name,
                    ])),
                    'date': str(item.expiry_date) if item.expiry_date else None,
                }
                for item in products
            ]
            results.extend([
                {
                    'id': item.id,
                    'title': item.unique_code,
                    'status': item.status,
                    'type': 'sample_instance',
                    'subtitle': ' | '.join(filter(None, [
                        item.product.name if item.product_id else '',
                        item.current_holder_name,
                        getattr(item.protocol, 'title', ''),
                    ])),
                    'date': item.create_time.isoformat() if item.create_time else None,
                }
                for item in samples
            ])
            results.extend([
                {
                    'id': item.id,
                    'title': item.name,
                    'status': item.status,
                    'type': 'consumable',
                    'subtitle': ' | '.join(filter(None, [
                        item.code,
                        item.category,
                    ])),
                    'date': str(item.expiry_date) if item.expiry_date else None,
                }
                for item in consumables
            ])
            return results[:20]
        except Exception:
            return []


class FacilityAdapter(ModuleAdapter):
    module_name = 'facility'
    display_name = '设施'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.resource.services_facility import get_dashboard
            dashboard = get_dashboard()

            env = dashboard.get('environment', {})
            reservations = dashboard.get('reservations', {})
            incidents = dashboard.get('incidents', {})

            return {
                'env_anomalies': env.get('anomaly_count', 0),
                'room_utilization': env.get('utilization', '0%'),
                'pending_bookings': reservations.get('pending', 0),
                'open_incidents': incidents.get('open', 0),
            }
        except Exception as e:
            logger.warning('FacilityAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}


class EvaluatorAdapter(ModuleAdapter):
    module_name = 'evaluator'
    display_name = '评估'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.workorder.models import WorkOrder
            today = date.today()
            today_tasks = WorkOrder.objects.filter(
                scheduled_date=today, is_deleted=False,
            ).count()
            completed_today = WorkOrder.objects.filter(
                scheduled_date=today, is_deleted=False,
                status__in=['completed', 'approved'],
            ).count()
            rate = f'{completed_today / today_tasks * 100:.1f}%' if today_tasks else '0%'

            return {
                'today_tasks': today_tasks,
                'completion_rate': rate,
            }
        except Exception as e:
            logger.warning('EvaluatorAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}

    def get_entity(self, entity_id: int) -> dict:
        try:
            from apps.workorder.services.evaluator_service import get_evaluator_profile
            return get_evaluator_profile(entity_id)
        except Exception as e:
            return {'error': str(e)}


class LabPersonnelAdapter(ModuleAdapter):
    module_name = 'lab_personnel'
    display_name = '人员'

    def get_snapshot(self, filters=None) -> dict:
        try:
            from apps.lab_personnel.services.risk_engine import get_risk_stats
            from apps.lab_personnel.services.dispatch_service import get_dispatch_monitor
            risk = get_risk_stats()
            dispatch = get_dispatch_monitor()

            return {
                'risk_alerts': risk.get('total', 0),
                'risk_red': risk.get('red', 0),
                'dispatch_pending': dispatch.get('pending', 0),
                'dispatch_today': dispatch.get('total_today', 0),
            }
        except Exception as e:
            logger.warning('LabPersonnelAdapter.get_snapshot failed: %s', e)
            return {'error': 'unavailable'}


# ---------------------------------------------------------------------------
# DataBus 核心
# ---------------------------------------------------------------------------

_ADAPTERS: Dict[str, ModuleAdapter] = {}


def _init_adapters():
    global _ADAPTERS
    if _ADAPTERS:
        return
    adapter_classes = [
        WorkorderAdapter, SchedulingAdapter, QualityAdapter,
        EquipmentAdapter, ProjectAdapter,
        FinanceAdapter, CRMAdapter, RecruitmentAdapter,
        EthicsAdapter, HRAdapter, ReceptionAdapter,
        SampleAdapter, FacilityAdapter, EvaluatorAdapter,
        LabPersonnelAdapter,
    ]
    for cls in adapter_classes:
        adapter = cls()
        _ADAPTERS[adapter.module_name] = adapter


def get_module_snapshot(module: str, filters: Optional[dict] = None) -> dict:
    """按模块获取数据快照"""
    _init_adapters()
    adapter = _ADAPTERS.get(module)
    if not adapter:
        return {'error': f'unknown module: {module}', 'available': list(_ADAPTERS.keys())}
    return adapter.get_snapshot(filters)


def get_entity_context(entity_type: str, entity_id: int) -> dict:
    """获取单个实体的详情"""
    _init_adapters()
    type_to_module = {
        'workorder': 'workorder', 'protocol': 'projects', 'project': 'projects',
        'client': 'crm', 'staff': 'hr', 'device': 'equipment', 'equipment': 'equipment',
        'contract': 'finance', 'evaluator': 'evaluator',
    }
    module_name = type_to_module.get(entity_type, entity_type)
    adapter = _ADAPTERS.get(module_name)
    if not adapter:
        return {'error': f'unknown entity type: {entity_type}'}
    return adapter.get_entity(entity_id)


def cross_module_search(query: str, modules: Optional[List[str]] = None) -> dict:
    """跨模块搜索"""
    _init_adapters()
    target_modules = modules if modules else list(_ADAPTERS.keys())
    results = {}
    total = 0
    for mod_name in target_modules:
        adapter = _ADAPTERS.get(mod_name)
        if not adapter:
            continue
        try:
            items = adapter.search(query)
            if items:
                results[mod_name] = items
                total += len(items)
        except Exception as e:
            logger.warning('search in %s failed: %s', mod_name, e)
    return {'query': query, 'total': total, 'results': results}


def get_all_kpis() -> dict:
    """获取全域 KPI 快照（覆盖 15 个模块）"""
    _init_adapters()
    kpis = {}
    for name, adapter in _ADAPTERS.items():
        try:
            kpis[name] = adapter.get_snapshot()
        except Exception as e:
            logger.warning('KPI snapshot for %s failed: %s', name, e)
            kpis[name] = {'error': 'unavailable'}
    return kpis


def list_modules() -> List[dict]:
    """列出所有可用模块"""
    _init_adapters()
    return [
        {'name': a.module_name, 'display_name': a.display_name}
        for a in _ADAPTERS.values()
    ]


def get_audit_trail(model_name: str, record_id: int) -> dict:
    """获取实体的审计变更追踪链"""
    try:
        from apps.audit.models import AuditLog
        logs = AuditLog.objects.filter(
            model_name__iexact=model_name,
            record_id=record_id,
        ).order_by('-create_time')[:50]

        trail = []
        for log in logs:
            entry = {
                'id': log.id,
                'action': log.action,
                'user_id': log.user_id,
                'user_name': getattr(log, 'user_name', ''),
                'timestamp': log.create_time.isoformat() if log.create_time else None,
                'changed_fields': getattr(log, 'changed_fields', None),
                'old_value': getattr(log, 'old_value', None),
                'new_value': getattr(log, 'new_value', None),
            }
            trail.append(entry)

        return {
            'model': model_name,
            'record_id': record_id,
            'total': len(trail),
            'trail': trail,
        }
    except Exception as e:
        logger.warning('get_audit_trail failed: %s', e)
        return {'model': model_name, 'record_id': record_id, 'total': 0, 'trail': [], 'error': str(e)}
