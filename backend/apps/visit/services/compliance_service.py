"""
合规分析 + 访视完整性报告

S4-5：检查访视执行完整性，生成合规报告，同步多维表格
"""
import logging
from typing import Dict

from apps.visit.models import VisitPlan, VisitNode, VisitActivity
from apps.scheduling.models import ScheduleSlot, SlotStatus

logger = logging.getLogger(__name__)


class ComplianceAnalysisService:
    """合规分析服务"""

    @classmethod
    def analyze_visit_completeness(cls, plan_id: int) -> Dict:
        """
        分析访视计划完整性

        检查每个访视节点的执行情况。
        """
        plan = VisitPlan.objects.filter(id=plan_id).first()
        if not plan:
            return {}

        nodes = VisitNode.objects.filter(plan=plan)
        total_nodes = nodes.count()
        completed_nodes = 0
        incomplete_nodes = []
        deviations = []

        for node in nodes:
            slots = ScheduleSlot.objects.filter(visit_node=node)
            if not slots.exists():
                incomplete_nodes.append({
                    'node_id': node.id, 'node_name': node.name,
                    'reason': '未排程',
                })
                continue

            all_completed = all(s.status == SlotStatus.COMPLETED for s in slots)
            if all_completed:
                completed_nodes += 1
            else:
                for slot in slots:
                    if slot.status == SlotStatus.CONFLICT:
                        deviations.append({
                            'node_name': node.name,
                            'slot_id': slot.id,
                            'issue': f'排程冲突: {slot.conflict_reason}',
                        })
                    elif slot.status != SlotStatus.COMPLETED:
                        incomplete_nodes.append({
                            'node_id': node.id, 'node_name': node.name,
                            'reason': f'slot#{slot.id} 状态: {slot.status}',
                        })

        completeness = completed_nodes / total_nodes if total_nodes else 0

        result = {
            'plan_id': plan_id,
            'total_nodes': total_nodes,
            'completed_nodes': completed_nodes,
            'completeness_rate': round(completeness * 100, 1),
            'incomplete_nodes': incomplete_nodes,
            'deviations': deviations,
            'is_compliant': completeness >= 0.9 and len(deviations) == 0,
        }

        # 同步到多维表格
        cls._sync_to_bitable(plan, result)
        return result

    @classmethod
    def _sync_to_bitable(cls, plan, result: dict):
        """同步合规分析结果到飞书多维表格"""
        try:
            from libs.feishu_client import feishu_client
            import os
            app_token = os.getenv('FEISHU_BITABLE_APP_TOKEN', '')
            table_id = os.getenv('FEISHU_BITABLE_COMPLIANCE_TABLE_ID', '')
            if not app_token or not table_id:
                return

            feishu_client.upsert_bitable_record(
                app_token=app_token,
                table_id=table_id,
                fields={
                    '计划名称': plan.name,
                    '完成率': f'{result["completeness_rate"]}%',
                    '总节点': result['total_nodes'],
                    '已完成': result['completed_nodes'],
                    '偏差数': len(result['deviations']),
                    '合规': '是' if result['is_compliant'] else '否',
                },
            )
        except Exception as e:
            logger.error(f'合规分析同步多维表格失败: {e}')
