"""CRM飞书集成服务

功能：
- 商机任务 + 跟进日历（原有）
- 关键人联系提醒（P1新增）
- 健康度预警通知（P1新增）
- 客户简报推送（P2新增）
- 创新日历同步到飞书日历（P1新增）
- 价值洞察推送通知（P2新增）
"""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class CRMFeishuService:
    """CRM飞书集成"""

    @staticmethod
    def create_opportunity_task(opportunity, owner_open_id):
        """商机创建 -> 飞书任务"""
        from libs.feishu_task import create_workorder_task

        try:
            due_date = None
            if opportunity.expected_close_date:
                due_date = str(opportunity.expected_close_date)
            create_workorder_task(
                title=f'[商机] {opportunity.title}',
                assignee_open_id=owner_open_id,
                due_date=due_date,
                description=f'客户: {opportunity.client.name}\n预估金额: ¥{opportunity.estimated_amount}\n阶段: {opportunity.stage}',
            )
            logger.info(f'商机任务已创建: {opportunity.title}')
        except Exception as e:
            logger.error(f'创建商机任务失败: {e}')

    @staticmethod
    def notify_stage_change(opportunity, old_stage, new_stage):
        """商机阶段推进 -> 飞书通知"""
        from apps.notification.services import send_notification

        send_notification(
            title=f'商机阶段变更 - {opportunity.title}',
            content=f'商机 "{opportunity.title}" 已从 {old_stage} 推进到 {new_stage}。\n客户: {opportunity.client.name}\n预估金额: ¥{opportunity.estimated_amount}',
            channel='feishu_card',
            recipient_id=0,
            metadata={
                'opportunity_id': opportunity.id,
                'old_stage': old_stage,
                'new_stage': new_stage,
            },
        )

    @staticmethod
    def create_followup_calendar_event(client, date, description=''):
        """客户跟进提醒 -> 飞书日历事件"""
        from libs.feishu_client import FeishuClient

        client_api = FeishuClient()
        start_dt = datetime.combine(date, datetime.min.time())
        start_ts = int(start_dt.timestamp())
        end_ts = start_ts + 3600

        try:
            from django.conf import settings

            calendar_id = getattr(settings, 'FEISHU_CALENDAR_CRM_ID', None)
            if calendar_id:
                client_api.create_calendar_event(
                    calendar_id=calendar_id,
                    summary=f'[客户跟进] {client.name}',
                    start_time=start_ts,
                    end_time=end_ts,
                    description=description or f'跟进客户: {client.name}',
                )
                logger.info(f'跟进日历事件已创建: {client.name}')
        except Exception as e:
            logger.error(f'创建跟进日历事件失败: {e}')

    @staticmethod
    def send_contact_reminder(contact):
        """关键人联系提醒 -> 飞书卡片消息"""
        try:
            from apps.notification.services import send_notification

            days_overdue = 0
            if contact.last_contact_date:
                from datetime import date
                days_overdue = (date.today() - contact.last_contact_date).days - contact.contact_frequency_days

            send_notification(
                title=f'关键人联系提醒 - {contact.client.name}',
                content=(
                    f'联系人: {contact.name} ({contact.get_role_type_display()})\n'
                    f'客户: {contact.client.name}\n'
                    f'上次联系: {contact.last_contact_date or "从未联系"}\n'
                    f'超期天数: {max(days_overdue, 0)}天'
                ),
                channel='feishu_card',
                recipient_id=0,
                metadata={'contact_id': contact.id, 'client_id': contact.client_id},
            )
            logger.info(f'联系提醒已发送: {contact.name}@{contact.client.name}')
        except Exception as e:
            logger.error(f'联系提醒发送失败: {e}')

    @staticmethod
    def send_health_alert(alert):
        """健康度预警 -> 飞书通知"""
        try:
            from apps.notification.services import send_notification

            emoji = {'info': 'ℹ️', 'warning': '⚠️', 'critical': '🚨'}
            severity_icon = emoji.get(alert.severity, '⚠️')

            send_notification(
                title=f'{severity_icon} 客户预警 - {alert.client.name}',
                content=(
                    f'类型: {alert.get_alert_type_display()}\n'
                    f'严重程度: {alert.get_severity_display()}\n'
                    f'描述: {alert.description}\n'
                    f'建议: {alert.suggested_action}'
                ),
                channel='feishu_card',
                recipient_id=0,
                metadata={'alert_id': alert.id, 'client_id': alert.client_id},
            )
            logger.info(f'预警通知已发送: {alert.client.name} - {alert.alert_type}')
        except Exception as e:
            logger.error(f'预警通知发送失败: {e}')

    @staticmethod
    def publish_brief_to_feishu(brief):
        """客户简报推送到飞书群组"""
        try:
            from apps.notification.services import send_notification

            sections = []
            if brief.client_strategy:
                sections.append(f'📌 战略重点: {brief.client_strategy[:100]}')
            if brief.client_pain_points:
                sections.append(f'💡 痛点: {", ".join(brief.client_pain_points[:3])}')
            if brief.communication_tips:
                sections.append(f'📝 注意: {", ".join(brief.communication_tips[:3])}')

            send_notification(
                title=f'客户简报发布 - {brief.client.name}',
                content=(
                    f'简报: {brief.title}\n'
                    f'类型: {brief.get_brief_type_display()}\n\n'
                    + '\n'.join(sections)
                ),
                channel='feishu_card',
                recipient_id=0,
                metadata={'brief_id': brief.id, 'client_id': brief.client_id},
            )
            logger.info(f'简报推送成功: {brief.title}')
        except Exception as e:
            logger.error(f'简报推送失败: {e}')

    @staticmethod
    def notify_insight_shared(insight):
        """价值洞察推送通知"""
        try:
            from apps.notification.services import send_notification

            send_notification(
                title=f'价值洞察推送 - {insight.client.name}',
                content=(
                    f'洞察: {insight.title}\n'
                    f'类型: {insight.get_insight_type_display()}\n'
                    f'请研究经理在与客户沟通时传递。'
                ),
                channel='feishu_card',
                recipient_id=0,
                metadata={'insight_id': insight.id, 'client_id': insight.client_id},
            )
            logger.info(f'洞察推送成功: {insight.title}')
        except Exception as e:
            logger.error(f'洞察推送失败: {e}')

    @staticmethod
    def create_innovation_calendar_event(innovation):
        """创新日历同步到飞书日历"""
        if not innovation.launch_date:
            return

        try:
            from libs.feishu_client import FeishuClient
            from django.conf import settings

            calendar_id = getattr(settings, 'FEISHU_CALENDAR_CRM_ID', None)
            if not calendar_id:
                return

            client_api = FeishuClient()
            start_dt = datetime.combine(innovation.launch_date, datetime.min.time())
            start_ts = int(start_dt.timestamp())
            end_ts = start_ts + 86400

            client_api.create_calendar_event(
                calendar_id=calendar_id,
                summary=f'[创新] {innovation.client.name} - {innovation.product_concept}',
                start_time=start_ts,
                end_time=end_ts,
                description=(
                    f'客户: {innovation.client.name}\n'
                    f'概念: {innovation.product_concept}\n'
                    f'类型: {innovation.get_innovation_type_display()}\n'
                    f'状态: {innovation.get_status_display()}'
                ),
            )
            logger.info(f'创新日历事件已同步: {innovation.product_concept}')
        except Exception as e:
            logger.error(f'创新日历同步失败: {e}')
