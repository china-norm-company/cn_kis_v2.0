"""
进展通报服务（S5-4）

自动从工单执行数据生成结构化日进展报告，
CRC可预览、编辑并通过飞书消息卡片发送给PM。

报告内容包括：
- 工单完成率
- 异常事件汇总
- 样品状态概览
- 明日预告
"""
import logging
from datetime import date, timedelta

from django.utils import timezone

from apps.workorder.models import WorkOrder, WorkOrderStatus

logger = logging.getLogger(__name__)


class ProgressReportService:
    """进展通报自动生成服务"""

    @classmethod
    def generate_daily_report(cls, protocol_id: int, report_date: date = None) -> dict:
        """
        生成指定项目的日进展报告

        Args:
            protocol_id: 协议/项目ID
            report_date: 报告日期（默认今天）

        Returns:
            结构化报告数据
        """
        if report_date is None:
            report_date = date.today()

        report = {
            'protocol_id': protocol_id,
            'report_date': str(report_date),
            'generated_at': timezone.now().isoformat(),
            'workorder_summary': cls._get_workorder_summary(protocol_id, report_date),
            'exceptions': cls._get_exceptions_summary(protocol_id, report_date),
            'sample_status': cls._get_sample_status(protocol_id),
            'tomorrow_preview': cls._get_tomorrow_preview(protocol_id, report_date),
            'highlights': [],
            'issues': [],
        }

        cls._generate_highlights(report)
        return report

    @classmethod
    def _get_workorder_summary(cls, protocol_id: int, report_date: date) -> dict:
        """工单完成情况汇总"""
        qs = WorkOrder.objects.filter(
            is_deleted=False,
            enrollment__protocol_id=protocol_id,
        )

        today_qs = qs.filter(scheduled_date=report_date)
        today_total = today_qs.count()
        today_completed = today_qs.filter(
            status__in=[WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED],
        ).count()
        today_in_progress = today_qs.filter(status=WorkOrderStatus.IN_PROGRESS).count()

        overall_total = qs.exclude(status=WorkOrderStatus.CANCELLED).count()
        overall_completed = qs.filter(
            status__in=[WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED],
        ).count()

        overdue = qs.filter(
            due_date__lt=report_date,
            status__in=[
                WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED,
                WorkOrderStatus.IN_PROGRESS,
            ],
        ).count()

        return {
            'today_total': today_total,
            'today_completed': today_completed,
            'today_in_progress': today_in_progress,
            'today_completion_rate': round(today_completed / today_total * 100, 1) if today_total else 0,
            'overall_total': overall_total,
            'overall_completed': overall_completed,
            'overall_completion_rate': round(overall_completed / overall_total * 100, 1) if overall_total else 0,
            'overdue_count': overdue,
        }

    @classmethod
    def _get_exceptions_summary(cls, protocol_id: int, report_date: date) -> list:
        """今日异常事件汇总"""
        try:
            from apps.workorder.models_extended import WorkOrderException
            wo_ids = WorkOrder.objects.filter(
                is_deleted=False,
                enrollment__protocol_id=protocol_id,
            ).values_list('id', flat=True)

            exceptions = WorkOrderException.objects.filter(
                work_order_id__in=wo_ids,
                create_time__date=report_date,
            ).order_by('-create_time')

            return [{
                'id': exc.id,
                'type': exc.exception_type,
                'severity': exc.severity,
                'description': exc.description[:200] if exc.description else '',
                'status': exc.resolution_status,
                'work_order_id': exc.work_order_id,
            } for exc in exceptions]
        except Exception as e:
            logger.warning(f'获取异常汇总失败: {e}')
            return []

    @classmethod
    def _get_sample_status(cls, protocol_id: int) -> dict:
        """样品状态概览"""
        try:
            from apps.sample.models import SampleTransaction
            from django.db.models import Count

            transactions = SampleTransaction.objects.filter(
                sample_instance__product__protocol_id=protocol_id,
            ).values('transaction_type').annotate(count=Count('id'))

            status = {}
            for t in transactions:
                status[t['transaction_type']] = t['count']
            return status
        except Exception:
            return {}

    @classmethod
    def _get_tomorrow_preview(cls, protocol_id: int, report_date: date) -> dict:
        """明日排程预告"""
        tomorrow = report_date + timedelta(days=1)
        qs = WorkOrder.objects.filter(
            is_deleted=False,
            enrollment__protocol_id=protocol_id,
            scheduled_date=tomorrow,
        )
        return {
            'date': str(tomorrow),
            'total_scheduled': qs.count(),
            'subjects_count': qs.values('enrollment__subject_id').distinct().count(),
        }

    @classmethod
    def _generate_highlights(cls, report: dict) -> None:
        """根据数据自动生成亮点和问题"""
        ws = report['workorder_summary']

        if ws['today_completion_rate'] >= 100:
            report['highlights'].append('今日工单全部完成')
        elif ws['today_completion_rate'] >= 80:
            report['highlights'].append(f'今日完成率 {ws["today_completion_rate"]}%')

        if ws['overdue_count'] > 0:
            report['issues'].append(f'{ws["overdue_count"]} 个工单逾期未完成')

        exceptions = report['exceptions']
        critical = [e for e in exceptions if e['severity'] in ('high', 'critical')]
        if critical:
            report['issues'].append(f'{len(critical)} 个高/严重异常待处理')

    @classmethod
    def format_as_feishu_card(cls, report: dict, protocol_title: str = '') -> dict:
        """
        将报告格式化为飞书消息卡片 JSON

        返回可直接发送的飞书卡片消息体。
        """
        ws = report['workorder_summary']
        exceptions = report['exceptions']
        tomorrow = report['tomorrow_preview']
        highlights = report.get('highlights', [])
        issues = report.get('issues', [])

        title = f'📊 {protocol_title or "项目"}日进展报告 — {report["report_date"]}'

        elements = []

        # 工单完成情况
        elements.append({
            'tag': 'div',
            'text': {
                'tag': 'lark_md',
                'content': (
                    f'**🎯 工单完成情况**\n'
                    f'今日: {ws["today_completed"]}/{ws["today_total"]} '
                    f'({ws["today_completion_rate"]}%)\n'
                    f'总体: {ws["overall_completed"]}/{ws["overall_total"]} '
                    f'({ws["overall_completion_rate"]}%)'
                ),
            },
        })

        if ws['overdue_count'] > 0:
            elements.append({
                'tag': 'div',
                'text': {
                    'tag': 'lark_md',
                    'content': f'⚠️ **逾期工单: {ws["overdue_count"]} 个**',
                },
            })

        # 异常
        if exceptions:
            exc_text = f'**⚡ 异常事件 ({len(exceptions)})**\n'
            for exc in exceptions[:3]:
                exc_text += f'- [{exc["severity"]}] {exc["description"][:60]}\n'
            elements.append({
                'tag': 'div',
                'text': {'tag': 'lark_md', 'content': exc_text},
            })

        # 明日预告
        elements.append({
            'tag': 'div',
            'text': {
                'tag': 'lark_md',
                'content': (
                    f'**📅 明日预告 ({tomorrow["date"]})**\n'
                    f'排程工单: {tomorrow["total_scheduled"]} | '
                    f'受试者: {tomorrow["subjects_count"]}'
                ),
            },
        })

        # 亮点和问题
        if highlights:
            elements.append({
                'tag': 'div',
                'text': {
                    'tag': 'lark_md',
                    'content': '✅ ' + ' | '.join(highlights),
                },
            })
        if issues:
            elements.append({
                'tag': 'div',
                'text': {
                    'tag': 'lark_md',
                    'content': '❗ ' + ' | '.join(issues),
                },
            })

        return {
            'msg_type': 'interactive',
            'card': {
                'header': {
                    'title': {'tag': 'plain_text', 'content': title},
                    'template': 'blue',
                },
                'elements': elements,
            },
        }

    @classmethod
    def send_to_feishu(cls, report: dict, protocol_title: str = '',
                       chat_id: str = None, open_id: str = None) -> bool:
        """
        通过飞书发送进展报告

        Args:
            report: generate_daily_report 返回的报告数据
            protocol_title: 项目名称
            chat_id: 目标群ID（发到群）
            open_id: 目标用户open_id（发到个人）
        """
        try:
            from libs.feishu_client import feishu_client
            card = cls.format_as_feishu_card(report, protocol_title)

            if chat_id:
                feishu_client.send_message(
                    receive_id=chat_id,
                    receive_id_type='chat_id',
                    msg_type='interactive',
                    content=card['card'],
                )
                logger.info(f'进展报告已发送到群 {chat_id}')
                return True
            elif open_id:
                feishu_client.send_message(
                    receive_id=open_id,
                    receive_id_type='open_id',
                    msg_type='interactive',
                    content=card['card'],
                )
                logger.info(f'进展报告已发送给用户 {open_id}')
                return True
            else:
                logger.warning('未指定发送目标')
                return False
        except Exception as e:
            logger.error(f'进展报告发送失败: {e}')
            return False
