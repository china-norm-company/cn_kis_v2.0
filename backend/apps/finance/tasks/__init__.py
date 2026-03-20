"""
财务模块 Celery 任务

通过 celery_config.py 的 CELERY_BEAT_SCHEDULE 定时调度。
"""
from celery import shared_task


@shared_task(name='apps.finance.tasks.run_daily_overdue_detection')
def run_daily_overdue_detection():
    from apps.finance.tasks.daily_tasks import run_daily_overdue_detection as _run
    return _run()


@shared_task(name='apps.finance.tasks.run_daily_budget_alerts')
def run_daily_budget_alerts():
    from apps.finance.tasks.daily_tasks import run_daily_budget_alerts as _run
    return _run()


@shared_task(name='apps.finance.tasks.run_daily_expiring_reminders')
def run_daily_expiring_reminders():
    from apps.finance.tasks.daily_tasks import run_daily_expiring_reminders as _run
    return _run()


@shared_task(name='apps.finance.tasks.run_daily_snapshot')
def run_daily_snapshot():
    from apps.finance.tasks.daily_tasks import run_daily_snapshot as _run
    return _run()


@shared_task(name='apps.finance.tasks.run_monthly_report')
def run_monthly_report():
    """每月 1 日生成上月经营报表"""
    from datetime import date
    from dateutil.relativedelta import relativedelta
    from apps.finance.services.report_engine import collect_monthly_operation_report
    from apps.finance.services.analysis_service import generate_financial_report
    from apps.finance.services.ai_insights import generate_monthly_insight
    import logging

    logger = logging.getLogger(__name__)

    today = date.today()
    last_month = today - relativedelta(months=1)
    year, month = last_month.year, last_month.month

    report_data = collect_monthly_operation_report(year, month)

    report_no = f'MR-{year}{month:02d}'
    report_name = f'{year}年{month}月 经营报表'
    generate_financial_report(
        report_no=report_no, report_name=report_name,
        report_type='monthly_summary',
        period_start=date(year, month, 1),
        period_end=(date(year, month, 1) + relativedelta(months=1) - relativedelta(days=1)),
    )

    try:
        generate_monthly_insight(report_data)
    except Exception as e:
        logger.warning(f'月报 AI 洞察生成失败（不影响报表）: {e}')

    logger.info(f'月度报表已生成: {report_no}')
    return {'report_no': report_no, 'year': year, 'month': month}
