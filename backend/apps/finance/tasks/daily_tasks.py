"""
财务模块每日定时任务

逾期检测、预算预警、到期提醒。
用法: python manage.py run_finance_daily (或 crontab)
"""
import json
import logging
import os
from datetime import date, timedelta

logger = logging.getLogger(__name__)


def run_daily_overdue_detection():
    """每日逾期检测"""
    from apps.finance.services.payment_plan_service import detect_overdue_plans
    updated = detect_overdue_plans()
    logger.info(f'逾期检测完成，{len(updated)} 条逾期')
    return updated


def run_daily_budget_alerts():
    """每日预算预警检测"""
    from apps.finance.services.alert_service import check_budget_alerts
    alerts = check_budget_alerts()
    if alerts:
        logger.warning(f'预算预警：{len(alerts)} 条')
        _send_budget_alert_notifications(alerts)
    return alerts


def run_daily_expiring_reminders():
    """合同/发票到期提醒（7天内到期）"""
    from apps.finance.models import Contract, ContractStatus, PaymentPlan, PaymentPlanStatus
    threshold = date.today() + timedelta(days=7)

    expiring_contracts = list(Contract.objects.filter(
        end_date__lte=threshold, end_date__gte=date.today(),
        status=ContractStatus.ACTIVE, is_deleted=False,
    ).values('id', 'code', 'client', 'end_date'))

    upcoming_payments = list(PaymentPlan.objects.filter(
        planned_date__lte=threshold, planned_date__gte=date.today(),
        status=PaymentPlanStatus.PENDING,
    ).values('id', 'plan_no', 'client_name', 'planned_date', 'planned_amount'))

    logger.info(f'到期提醒：{len(expiring_contracts)} 份合同，{len(upcoming_payments)} 笔回款')
    return {
        'expiring_contracts': expiring_contracts,
        'upcoming_payments': upcoming_payments,
    }


def run_daily_snapshot():
    """每日分析指标快照"""
    from apps.finance.services.snapshot_service import take_daily_snapshot
    result = take_daily_snapshot()
    logger.info(f'每日快照完成，{result.get("metrics_saved", 0)} 条指标')
    return result


def _send_budget_alert_notifications(alerts):
    """发送预算预警飞书通知（静默失败）"""
    try:
        chat_id = os.environ.get('FEISHU_BUDGET_ALERT_CHAT_ID', '')
        if not chat_id:
            logger.debug('FEISHU_BUDGET_ALERT_CHAT_ID 未配置，跳过预算预警通知')
            return
        from libs.feishu_client import feishu_client
        for alert in alerts:
            text = alert.get('message', str(alert))
            feishu_client.send_message(
                receive_id=chat_id,
                msg_type='text',
                content=json.dumps({'text': text}),
                receive_id_type='chat_id',
            )
    except Exception as e:
        logger.error(f'预算预警通知发送失败: {e}')


def run_all_daily_tasks():
    """执行所有每日任务"""
    run_daily_overdue_detection()
    run_daily_budget_alerts()
    run_daily_expiring_reminders()
    run_daily_snapshot()
