"""
近60天项目启动分析命令

从数据库和飞书拉取近60天所有启动/活跃项目数据，分析：
1. 项目管理逻辑在飞书中的体现
2. 信息齐备程度
3. 涉及人员及分工
4. 效率与问题
5. 与系统能力的比对

用法:
  python manage.py analyze_recent_projects [--days 60] [--output report.json]
"""
import json
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from django.core.management.base import BaseCommand
from django.db.models import Count, Q, F
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '分析近60天启动项目的飞书数据与系统数据'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=60, help='回溯天数（默认60）')
        parser.add_argument('--output', type=str, default='', help='输出 JSON 文件路径')
        parser.add_argument('--fetch-chats', action='store_true', help='拉取飞书群聊消息（需要 user_access_token）')

    def handle(self, *args, **options):
        days = options['days']
        output_path = options['output']
        fetch_chats = options['fetch_chats']
        cutoff = timezone.now() - timedelta(days=days)

        self.stdout.write(f'\n{"="*80}')
        self.stdout.write(f'CN_KIS V1.0 近 {days} 天项目启动分析')
        self.stdout.write(f'分析截止: {cutoff.strftime("%Y-%m-%d")} ~ {timezone.now().strftime("%Y-%m-%d")}')
        self.stdout.write(f'{"="*80}\n')

        report = {
            'generated_at': timezone.now().isoformat(),
            'analysis_period': {'days': days, 'from': cutoff.isoformat(), 'to': timezone.now().isoformat()},
        }

        report['protocols'] = self._analyze_protocols(cutoff)
        report['projects'] = self._analyze_projects(cutoff)
        report['visit_plans'] = self._analyze_visit_plans(cutoff)
        report['resource_demands'] = self._analyze_resource_demands(cutoff)
        report['schedules'] = self._analyze_schedules(cutoff)
        report['work_orders'] = self._analyze_work_orders(cutoff)
        report['documents'] = self._analyze_documents(cutoff)
        report['approvals'] = self._analyze_approvals(cutoff)
        report['personnel'] = self._analyze_personnel(cutoff)

        if fetch_chats:
            report['feishu_chats'] = self._analyze_feishu_chats(cutoff)

        report['feishu_context'] = self._analyze_personal_context(cutoff)
        report['gap_analysis'] = self._gap_analysis(report)
        report['summary'] = self._generate_summary(report)

        self._print_report(report)

        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2, default=str)
            self.stdout.write(f'\n报告已保存至: {output_path}')

    def _analyze_protocols(self, cutoff) -> Dict[str, Any]:
        """分析协议/方案数据"""
        from apps.protocol.models import Protocol
        self.stdout.write('\n[1/11] 分析协议数据...')

        try:
            all_protocols = Protocol.objects.filter(
                create_time__gte=cutoff, is_deleted=False
            )
            total = all_protocols.count()

            status_dist = dict(
                all_protocols.values_list('status').annotate(cnt=Count('id')).values_list('status', 'cnt')
            )

            protocols_detail = []
            for p in all_protocols.select_related('sponsor', 'product_line').order_by('-create_time'):
                completeness = self._check_protocol_completeness(p)
                protocols_detail.append({
                    'id': p.id,
                    'title': p.title,
                    'code': p.code or '',
                    'status': p.status,
                    'sponsor': str(p.sponsor) if p.sponsor_id else '',
                    'has_parsed_data': bool(p.parsed_data),
                    'has_feishu_chat': bool(p.feishu_chat_id),
                    'team_members_count': len(p.team_members) if p.team_members else 0,
                    'created_at': p.create_time.isoformat() if p.create_time else '',
                    'completeness': completeness,
                })

            self.stdout.write(f'  找到 {total} 个协议')
            return {
                'total': total,
                'status_distribution': status_dist,
                'details': protocols_detail,
            }
        except Exception as e:
            self.stdout.write(f'  协议分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _check_protocol_completeness(self, protocol) -> Dict[str, bool]:
        """检查协议信息完整度"""
        return {
            'has_title': bool(protocol.title),
            'has_code': bool(protocol.code),
            'has_file': bool(protocol.file_path),
            'has_parsed_data': bool(protocol.parsed_data),
            'has_sponsor': bool(protocol.sponsor_id),
            'has_team': bool(protocol.team_members),
            'has_feishu_chat': bool(protocol.feishu_chat_id),
            'has_efficacy_type': bool(getattr(protocol, 'efficacy_type', None)),
            'has_sample_size': bool(getattr(protocol, 'sample_size', None)),
            'has_test_methods': bool(getattr(protocol, 'test_methods', None)),
        }

    def _analyze_projects(self, cutoff) -> Dict[str, Any]:
        """分析项目全链路数据"""
        from apps.project_full_link.models import Project, ProjectProtocol
        self.stdout.write('\n[2/11] 分析项目全链路数据...')

        try:
            projects = Project.objects.filter(created_at__gte=cutoff, is_delete=False)
            total = projects.count()

            exec_status_dist = dict(
                projects.values_list('execution_status').annotate(cnt=Count('id'))
                .values_list('execution_status', 'cnt')
            )
            sched_status_dist = dict(
                projects.values_list('schedule_status').annotate(cnt=Count('id'))
                .values_list('schedule_status', 'cnt')
            )

            projects_detail = []
            for proj in projects.order_by('-created_at'):
                protocol_count = ProjectProtocol.objects.filter(
                    project=proj, is_delete=False
                ).count()
                completeness = {
                    'has_project_no': bool(proj.project_no),
                    'has_project_name': bool(proj.project_name),
                    'has_sponsor': bool(proj.sponsor_name),
                    'has_expected_dates': bool(proj.expected_start_date and proj.expected_end_date),
                    'has_actual_dates': bool(proj.actual_start_date),
                    'has_total_samples': bool(proj.total_samples),
                    'has_protocol': protocol_count > 0,
                }
                projects_detail.append({
                    'id': proj.id,
                    'project_no': proj.project_no or '',
                    'project_name': proj.project_name,
                    'sponsor_name': proj.sponsor_name or '',
                    'execution_status': proj.execution_status,
                    'schedule_status': proj.schedule_status,
                    'total_samples': proj.total_samples,
                    'expected_start': str(proj.expected_start_date) if proj.expected_start_date else '',
                    'expected_end': str(proj.expected_end_date) if proj.expected_end_date else '',
                    'protocol_count': protocol_count,
                    'completeness': completeness,
                })

            self.stdout.write(f'  找到 {total} 个项目')
            return {
                'total': total,
                'execution_status_dist': exec_status_dist,
                'schedule_status_dist': sched_status_dist,
                'details': projects_detail,
            }
        except Exception as e:
            self.stdout.write(f'  项目分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _analyze_visit_plans(self, cutoff) -> Dict[str, Any]:
        """分析访视计划"""
        from apps.visit.models import VisitPlan, VisitNode, VisitActivity
        self.stdout.write('\n[3/11] 分析访视计划...')

        try:
            plans = VisitPlan.objects.filter(create_time__gte=cutoff)
            total = plans.count()

            plans_detail = []
            for plan in plans.select_related('protocol').order_by('-create_time'):
                node_count = VisitNode.objects.filter(visit_plan=plan).count()
                activity_count = VisitActivity.objects.filter(visit_node__visit_plan=plan).count()
                plans_detail.append({
                    'id': plan.id,
                    'protocol_title': plan.protocol.title if plan.protocol else '',
                    'status': getattr(plan, 'status', ''),
                    'node_count': node_count,
                    'activity_count': activity_count,
                    'created_at': plan.create_time.isoformat() if plan.create_time else '',
                })

            self.stdout.write(f'  找到 {total} 个访视计划')
            return {'total': total, 'details': plans_detail}
        except Exception as e:
            self.stdout.write(f'  访视计划分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _analyze_resource_demands(self, cutoff) -> Dict[str, Any]:
        """分析资源需求计划"""
        from apps.visit.models import ResourceDemand
        self.stdout.write('\n[4/11] 分析资源需求计划...')

        try:
            demands = ResourceDemand.objects.filter(create_time__gte=cutoff)
            total = demands.count()

            status_dist = dict(
                demands.values_list('status').annotate(cnt=Count('id'))
                .values_list('status', 'cnt')
            )

            demands_detail = []
            for d in demands.order_by('-create_time'):
                demands_detail.append({
                    'id': d.id,
                    'visit_plan_id': d.visit_plan_id,
                    'status': d.status,
                    'has_approval': bool(d.feishu_approval_instance_id),
                    'has_details': bool(d.demand_details),
                    'created_at': d.create_time.isoformat() if d.create_time else '',
                })

            self.stdout.write(f'  找到 {total} 个资源需求计划')
            return {'total': total, 'status_distribution': status_dist, 'details': demands_detail}
        except Exception as e:
            self.stdout.write(f'  资源需求分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _analyze_schedules(self, cutoff) -> Dict[str, Any]:
        """分析排程计划"""
        from apps.scheduling.models import SchedulePlan, ScheduleSlot, ScheduleMilestone
        self.stdout.write('\n[5/11] 分析排程计划...')

        try:
            plans = SchedulePlan.objects.filter(create_time__gte=cutoff)
            total = plans.count()

            plans_detail = []
            for plan in plans.order_by('-create_time'):
                slot_count = ScheduleSlot.objects.filter(schedule_plan=plan).count()
                conflict_count = ScheduleSlot.objects.filter(
                    schedule_plan=plan
                ).exclude(conflict_reason='').exclude(conflict_reason__isnull=True).count()
                milestone_count = ScheduleMilestone.objects.filter(schedule_plan=plan).count()
                plans_detail.append({
                    'id': plan.id,
                    'name': getattr(plan, 'name', ''),
                    'status': getattr(plan, 'status', ''),
                    'slot_count': slot_count,
                    'conflict_count': conflict_count,
                    'milestone_count': milestone_count,
                    'start_date': str(plan.start_date) if getattr(plan, 'start_date', None) else '',
                    'end_date': str(plan.end_date) if getattr(plan, 'end_date', None) else '',
                })

            self.stdout.write(f'  找到 {total} 个排程计划')
            return {'total': total, 'details': plans_detail}
        except Exception as e:
            self.stdout.write(f'  排程分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _analyze_work_orders(self, cutoff) -> Dict[str, Any]:
        """分析工单数据"""
        from apps.workorder.models import WorkOrder
        self.stdout.write('\n[6/11] 分析工单数据...')

        try:
            orders = WorkOrder.objects.filter(create_time__gte=cutoff)
            total = orders.count()

            status_dist = dict(
                orders.values_list('status').annotate(cnt=Count('id'))
                .values_list('status', 'cnt')
            )

            has_feishu_task = orders.exclude(
                feishu_task_id=''
            ).exclude(feishu_task_id__isnull=True).count()

            has_assignment = orders.exclude(
                assigned_to__isnull=True
            ).exclude(assigned_to='').count()

            overdue = orders.filter(
                scheduled_date__lt=timezone.now().date(),
                status__in=['pending', 'assigned', 'in_progress']
            ).count()

            self.stdout.write(f'  找到 {total} 个工单')
            return {
                'total': total,
                'status_distribution': status_dist,
                'with_feishu_task': has_feishu_task,
                'with_assignment': has_assignment,
                'overdue_count': overdue,
                'feishu_task_coverage': f'{has_feishu_task}/{total}' if total else '0/0',
            }
        except Exception as e:
            self.stdout.write(f'  工单分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _analyze_documents(self, cutoff) -> Dict[str, Any]:
        """分析文档/eTMF 数据"""
        from apps.document.models import Document
        self.stdout.write('\n[7/11] 分析文档数据...')

        try:
            docs = Document.objects.filter(create_time__gte=cutoff)
            total = docs.count()

            status_dist = dict(
                docs.values_list('status').annotate(cnt=Count('id'))
                .values_list('status', 'cnt')
            )

            self.stdout.write(f'  找到 {total} 个文档')
            return {'total': total, 'status_distribution': status_dist}
        except Exception as e:
            self.stdout.write(f'  文档分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _analyze_approvals(self, cutoff) -> Dict[str, Any]:
        """分析审批流数据"""
        from apps.workflow.models import WorkflowInstance
        self.stdout.write('\n[8/11] 分析审批/工作流数据...')

        try:
            instances = WorkflowInstance.objects.filter(created_at__gte=cutoff)
            total = instances.count()

            status_dist = dict(
                instances.values_list('status').annotate(cnt=Count('id'))
                .values_list('status', 'cnt')
            )
            type_dist = dict(
                instances.values_list('business_type').annotate(cnt=Count('id'))
                .values_list('business_type', 'cnt')
            )

            self.stdout.write(f'  找到 {total} 个工作流实例')
            return {
                'total': total,
                'status_distribution': status_dist,
                'type_distribution': type_dist,
            }
        except Exception as e:
            self.stdout.write(f'  审批分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _analyze_personnel(self, cutoff) -> Dict[str, Any]:
        """分析涉及人员"""
        self.stdout.write('\n[9/11] 分析涉及人员...')

        personnel = defaultdict(lambda: {'roles': set(), 'project_count': 0, 'action_count': 0})

        try:
            from apps.protocol.models import Protocol
            for p in Protocol.objects.filter(create_time__gte=cutoff, is_deleted=False):
                if p.team_members and isinstance(p.team_members, list):
                    for member in p.team_members:
                        if isinstance(member, dict):
                            name = member.get('name', '')
                            role = member.get('role', '')
                            if name:
                                personnel[name]['roles'].add(role)
                                personnel[name]['project_count'] += 1
                if p.created_by_id:
                    personnel[f'user_{p.created_by_id}']['roles'].add('creator')
                    personnel[f'user_{p.created_by_id}']['action_count'] += 1
        except Exception as e:
            self.stdout.write(f'  协议人员分析: {e}')

        try:
            from apps.workorder.models import WorkOrder
            for wo in WorkOrder.objects.filter(create_time__gte=cutoff):
                assignee = wo.assigned_to
                if assignee:
                    key = str(assignee)
                    personnel[key]['roles'].add('executor')
                    personnel[key]['action_count'] += 1
        except Exception as e:
            self.stdout.write(f'  工单人员分析: {e}')

        result = []
        for name, info in personnel.items():
            result.append({
                'name': name,
                'roles': list(info['roles']),
                'project_count': info['project_count'],
                'action_count': info['action_count'],
            })

        result.sort(key=lambda x: x['action_count'], reverse=True)
        self.stdout.write(f'  识别 {len(result)} 个相关人员')
        return {'total': len(result), 'details': result[:50]}

    def _analyze_feishu_chats(self, cutoff) -> Dict[str, Any]:
        """分析飞书项目群聊消息"""
        self.stdout.write('\n[10/11] 拉取飞书项目群消息...')

        try:
            from apps.protocol.models import Protocol
            from libs.feishu_client import feishu_client

            protocols_with_chat = Protocol.objects.filter(
                create_time__gte=cutoff,
                is_deleted=False,
            ).exclude(feishu_chat_id='').exclude(feishu_chat_id__isnull=True)

            chat_analysis = []
            cutoff_ts = int(cutoff.timestamp())

            for protocol in protocols_with_chat:
                chat_id = protocol.feishu_chat_id
                try:
                    messages = feishu_client.get_group_messages(
                        group_id=chat_id,
                        start_time=cutoff_ts,
                        page_size=50,
                    )
                    msg_types = defaultdict(int)
                    senders = set()
                    topics = []

                    for msg in messages:
                        msg_types[msg.get('msg_type', 'unknown')] += 1
                        sender = msg.get('sender', {})
                        if isinstance(sender, dict):
                            senders.add(sender.get('id', ''))
                        body = msg.get('body', {})
                        if isinstance(body, dict):
                            content = body.get('content', '')
                            if content and isinstance(content, str):
                                try:
                                    parsed = json.loads(content)
                                    text = parsed.get('text', '')
                                except (json.JSONDecodeError, TypeError):
                                    text = content
                                if text and len(text) > 10:
                                    topics.append(text[:200])

                    chat_analysis.append({
                        'protocol_title': protocol.title,
                        'chat_id': chat_id,
                        'message_count': len(messages),
                        'sender_count': len(senders),
                        'msg_type_dist': dict(msg_types),
                        'sample_topics': topics[:10],
                    })
                except Exception as e:
                    chat_analysis.append({
                        'protocol_title': protocol.title,
                        'chat_id': chat_id,
                        'error': str(e),
                    })

            return {'chat_count': len(chat_analysis), 'details': chat_analysis}
        except Exception as e:
            self.stdout.write(f'  群聊分析失败: {e}')
            return {'error': str(e)}

    def _analyze_personal_context(self, cutoff) -> Dict[str, Any]:
        """分析飞书个人上下文数据（已同步的）"""
        self.stdout.write('\n[10/11] 分析飞书已同步上下文...')

        try:
            from apps.secretary.models import PersonalContext

            contexts = PersonalContext.objects.filter(created_at__gte=cutoff)
            total = contexts.count()

            type_dist = dict(
                contexts.values_list('source_type').annotate(cnt=Count('id'))
                .values_list('source_type', 'cnt')
            )

            project_keywords = [
                '项目', '启动', '方案', 'protocol', '排程', '工单',
                '访视', '入组', '招募', '排期', '预约', '受试者',
            ]
            project_related = 0
            for ctx in contexts.only('summary', 'raw_content'):
                text = (ctx.summary or '') + (ctx.raw_content or '')
                if any(kw in text for kw in project_keywords):
                    project_related += 1

            self.stdout.write(f'  找到 {total} 条上下文，{project_related} 条项目相关')
            return {
                'total': total,
                'type_distribution': type_dist,
                'project_related_count': project_related,
            }
        except Exception as e:
            self.stdout.write(f'  上下文分析失败: {e}')
            return {'total': 0, 'error': str(e)}

    def _gap_analysis(self, report: Dict) -> Dict[str, Any]:
        """与系统能力的差距分析"""
        self.stdout.write('\n[11/11] 执行差距分析...')

        gaps = []
        recommendations = []

        # 1. Protocol → VisitPlan 转化率
        protocol_total = report.get('protocols', {}).get('total', 0)
        visit_total = report.get('visit_plans', {}).get('total', 0)
        if protocol_total > 0:
            conversion = visit_total / protocol_total * 100
            if conversion < 50:
                gaps.append({
                    'area': '协议→访视计划转化',
                    'current': f'{conversion:.0f}% ({visit_total}/{protocol_total})',
                    'target': '≥80%',
                    'severity': 'high',
                    'detail': '大量协议未生成访视计划，启动包功能未被充分使用',
                })
                recommendations.append('启用启动包一键生成，自动从协议创建访视计划')

        # 2. 资源需求计划覆盖
        resource_total = report.get('resource_demands', {}).get('total', 0)
        if visit_total > 0 and resource_total < visit_total:
            gaps.append({
                'area': '访视计划→资源需求覆盖',
                'current': f'{resource_total}/{visit_total}',
                'target': '1:1',
                'severity': 'high',
                'detail': '存在访视计划无对应资源需求计划',
            })
            recommendations.append('访视计划确认后自动生成资源需求计划')

        # 3. 排程覆盖
        schedule_total = report.get('schedules', {}).get('total', 0)
        if resource_total > 0 and schedule_total < resource_total:
            gaps.append({
                'area': '资源需求→排程计划覆盖',
                'current': f'{schedule_total}/{resource_total}',
                'target': '1:1',
                'severity': 'medium',
                'detail': '资源需求审批后未及时创建排程',
            })

        # 4. 工单生成与飞书联动
        wo_data = report.get('work_orders', {})
        wo_total = wo_data.get('total', 0)
        wo_feishu = wo_data.get('with_feishu_task', 0)
        if wo_total > 0:
            feishu_rate = wo_feishu / wo_total * 100
            if feishu_rate < 80:
                gaps.append({
                    'area': '工单→飞书任务联动',
                    'current': f'{feishu_rate:.0f}%',
                    'target': '≥95%',
                    'severity': 'medium',
                    'detail': '部分工单未同步创建飞书任务',
                })

        # 5. 工单分配率
        wo_assigned = wo_data.get('with_assignment', 0)
        if wo_total > 0 and wo_assigned < wo_total:
            assign_rate = wo_assigned / wo_total * 100
            gaps.append({
                'area': '工单分配率',
                'current': f'{assign_rate:.0f}%',
                'target': '100%',
                'severity': 'medium' if assign_rate > 70 else 'high',
            })
            recommendations.append('启用自动分配功能（基于资质+负载评分）')

        # 6. 工单逾期率
        wo_overdue = wo_data.get('overdue_count', 0)
        if wo_total > 0 and wo_overdue > 0:
            overdue_rate = wo_overdue / wo_total * 100
            gaps.append({
                'area': '工单逾期',
                'current': f'{wo_overdue} 个逾期（{overdue_rate:.1f}%）',
                'target': '<5%',
                'severity': 'high' if overdue_rate > 10 else 'medium',
            })
            recommendations.append('启用逾期预警通知和自动升级机制')

        # 7. 协议信息完整度
        protocols = report.get('protocols', {}).get('details', [])
        if protocols:
            completeness_scores = []
            for p in protocols:
                c = p.get('completeness', {})
                score = sum(1 for v in c.values() if v) / max(len(c), 1) * 100
                completeness_scores.append(score)
            avg_completeness = sum(completeness_scores) / len(completeness_scores)
            if avg_completeness < 70:
                gaps.append({
                    'area': '协议信息完整度',
                    'current': f'{avg_completeness:.0f}%',
                    'target': '≥80%',
                    'severity': 'medium',
                })
                recommendations.append('协议上传后强制 AI 解析，补全缺失字段')

        # 8. 文档体系
        doc_total = report.get('documents', {}).get('total', 0)
        if protocol_total > 0 and doc_total < protocol_total * 3:
            gaps.append({
                'area': 'eTMF文档覆盖',
                'current': f'{doc_total} 文档 / {protocol_total} 协议',
                'target': '每协议≥8类文档',
                'severity': 'medium',
            })
            recommendations.append('启动包生成时自动创建 eTMF 文档目录')

        # 系统能力 vs 飞书现状
        system_capabilities = {
            'protocol_ai_parse': '协议 AI 智能解析',
            'startup_package': '启动包一键生成（8项）',
            'visit_plan_generation': '访视计划自动生成',
            'resource_demand_auto': '资源需求自动汇总',
            'scheduling_engine': '排程引擎（冲突检测+日历同步）',
            'workorder_dispatch': '工单自动派发（资质+负载评分）',
            'feishu_approval': '飞书审批联动（10+类型）',
            'feishu_notification': '飞书卡片通知',
            'feishu_task_sync': '飞书任务双向同步',
            'feishu_calendar_sync': '飞书日历排程同步',
            'bitable_sync': '多维表格看板同步',
            'quality_gate': '质量门禁',
            'etmf_management': 'eTMF 文档管理',
            'agent_gateway': 'AI 智能体网关（16个Agent）',
        }

        return {
            'gaps': gaps,
            'recommendations': recommendations,
            'system_capabilities': system_capabilities,
            'gap_count': len(gaps),
            'high_severity_count': len([g for g in gaps if g.get('severity') == 'high']),
        }

    def _generate_summary(self, report: Dict) -> Dict[str, Any]:
        """生成总结"""
        return {
            'total_protocols': report.get('protocols', {}).get('total', 0),
            'total_projects': report.get('projects', {}).get('total', 0),
            'total_visit_plans': report.get('visit_plans', {}).get('total', 0),
            'total_resource_demands': report.get('resource_demands', {}).get('total', 0),
            'total_schedules': report.get('schedules', {}).get('total', 0),
            'total_work_orders': report.get('work_orders', {}).get('total', 0),
            'total_documents': report.get('documents', {}).get('total', 0),
            'total_workflow_instances': report.get('approvals', {}).get('total', 0),
            'total_personnel': report.get('personnel', {}).get('total', 0),
            'feishu_context_total': report.get('feishu_context', {}).get('total', 0),
            'gap_count': report.get('gap_analysis', {}).get('gap_count', 0),
            'high_severity_gaps': report.get('gap_analysis', {}).get('high_severity_count', 0),
        }

    def _print_report(self, report: Dict):
        """打印报告"""
        self.stdout.write(f'\n{"="*80}')
        self.stdout.write('分析报告摘要')
        self.stdout.write(f'{"="*80}')

        summary = report.get('summary', {})
        self.stdout.write(f'''
数据统计:
  协议/方案:     {summary.get("total_protocols", 0)}
  项目(全链路):  {summary.get("total_projects", 0)}
  访视计划:      {summary.get("total_visit_plans", 0)}
  资源需求计划:  {summary.get("total_resource_demands", 0)}
  排程计划:      {summary.get("total_schedules", 0)}
  工单:          {summary.get("total_work_orders", 0)}
  文档:          {summary.get("total_documents", 0)}
  审批/工作流:   {summary.get("total_workflow_instances", 0)}
  涉及人员:      {summary.get("total_personnel", 0)}
  飞书上下文:    {summary.get("feishu_context_total", 0)}
''')

        # 协议状态
        protocols = report.get('protocols', {})
        if protocols.get('status_distribution'):
            self.stdout.write('协议状态分布:')
            for status, count in protocols['status_distribution'].items():
                self.stdout.write(f'  {status}: {count}')

        # 项目状态
        projects = report.get('projects', {})
        if projects.get('execution_status_dist'):
            self.stdout.write('\n项目执行状态:')
            for status, count in projects['execution_status_dist'].items():
                self.stdout.write(f'  {status}: {count}')

        # 工单分析
        wo = report.get('work_orders', {})
        if wo.get('total'):
            self.stdout.write(f'\n工单分析:')
            self.stdout.write(f'  总量: {wo["total"]}')
            self.stdout.write(f'  飞书任务覆盖: {wo.get("feishu_task_coverage", "N/A")}')
            self.stdout.write(f'  已分配: {wo.get("with_assignment", 0)}')
            self.stdout.write(f'  逾期: {wo.get("overdue_count", 0)}')
            if wo.get('status_distribution'):
                for status, count in wo['status_distribution'].items():
                    self.stdout.write(f'  {status}: {count}')

        # 差距分析
        gap = report.get('gap_analysis', {})
        gaps = gap.get('gaps', [])
        if gaps:
            self.stdout.write(f'\n差距分析 ({len(gaps)} 项):')
            for g in gaps:
                severity_icon = {'high': '[!]', 'medium': '[~]', 'low': '[-]'}.get(
                    g.get('severity', ''), '[ ]'
                )
                self.stdout.write(f'  {severity_icon} {g["area"]}: {g.get("current", "")} → 目标 {g.get("target", "")}')

        recommendations = gap.get('recommendations', [])
        if recommendations:
            self.stdout.write(f'\n优化建议:')
            for i, rec in enumerate(recommendations, 1):
                self.stdout.write(f'  {i}. {rec}')

        self.stdout.write(f'\n系统已具备能力 ({len(gap.get("system_capabilities", {}))} 项):')
        for key, desc in gap.get('system_capabilities', {}).items():
            self.stdout.write(f'  ✓ {desc}')

        self.stdout.write(f'\n{"="*80}')
