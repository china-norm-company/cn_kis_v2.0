"""
实验室人员管理 — Celery 定时任务

定时任务：
- daily_risk_scan: 每日 08:00 风险扫描 + 飞书推送
- refresh_cert_status: 每日 07:30 证书状态刷新 + 自动锁定
- aggregate_worktime: 每日 23:30 工时汇总聚合
"""
import logging
from datetime import date, timedelta
from decimal import Decimal

from celery import shared_task
from django.db.models import Sum
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='apps.lab_personnel.tasks.daily_risk_scan')
def daily_risk_scan():
    """
    每日风险扫描

    运行 8 类风险规则检测，自动创建/更新预警，
    并通过飞书推送红色/黄色预警给相关人员。
    """
    from apps.lab_personnel.services.risk_engine import run_risk_scan

    logger.info('开始每日风险扫描...')
    results = run_risk_scan()
    logger.info(
        f'风险扫描完成: 新预警{results["total_new_alerts"]}条, '
        f'自动解决{results["auto_resolved"]}条, '
        f'飞书推送{results.get("feishu_notified", 0)}条'
    )
    return results


@shared_task(name='apps.lab_personnel.tasks.refresh_cert_status')
def refresh_cert_status():
    """
    证书状态刷新

    批量检查所有证书到期状态，自动更新 status 和 is_locked 字段。
    过期证书自动锁定，确保持证人无法被派工。
    """
    from apps.lab_personnel.models import StaffCertificate, CertificateStatus

    today = date.today()
    updated = 0

    certs = StaffCertificate.objects.filter(
        expiry_date__isnull=False,
    ).select_related('staff')

    for cert in certs:
        days_left = (cert.expiry_date - today).days
        old_status = cert.status
        old_locked = cert.is_locked

        if days_left < 0:
            cert.status = CertificateStatus.EXPIRED
            cert.is_locked = True
        elif days_left <= 7:
            cert.status = CertificateStatus.EXPIRING_7
            cert.is_locked = False
        elif days_left <= 30:
            cert.status = CertificateStatus.EXPIRING_30
            cert.is_locked = False
        elif days_left <= 90:
            cert.status = CertificateStatus.EXPIRING_90
            cert.is_locked = False
        else:
            cert.status = CertificateStatus.VALID
            cert.is_locked = False

        if cert.status != old_status or cert.is_locked != old_locked:
            cert.save(update_fields=['status', 'is_locked', 'update_time'])
            updated += 1

    logger.info(f'证书状态刷新完成: 更新{updated}条')
    return {'updated': updated, 'total_checked': certs.count()}


@shared_task(name='apps.lab_personnel.tasks.aggregate_worktime')
def aggregate_worktime():
    """
    工时汇总聚合

    按周聚合每个人员的工时记录，计算利用率，
    写入 WorkTimeSummary 供仪表盘和风险引擎使用。
    """
    from apps.lab_personnel.models import LabStaffProfile
    from apps.lab_personnel.models_worktime import WorkTimeLog, WorkTimeSummary, WorkTimeSource

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    aggregated = 0

    profiles = LabStaffProfile.objects.filter(
        is_active=True, staff__is_deleted=False,
    ).select_related('staff')

    for profile in profiles:
        staff = profile.staff
        logs = WorkTimeLog.objects.filter(
            staff=staff,
            work_date__gte=week_start,
            work_date__lte=week_start + timedelta(days=6),
        )

        total_hours = logs.aggregate(total=Sum('actual_hours'))['total'] or Decimal('0')
        workorder_hours = logs.filter(
            source=WorkTimeSource.WORKORDER,
        ).aggregate(total=Sum('actual_hours'))['total'] or Decimal('0')
        training_hours = logs.filter(
            source=WorkTimeSource.TRAINING,
        ).aggregate(total=Sum('actual_hours'))['total'] or Decimal('0')
        other_hours = total_hours - workorder_hours - training_hours

        available = Decimal(str(profile.max_weekly_hours))
        utilization = (total_hours / available * 100) if available > 0 else Decimal('0')

        WorkTimeSummary.objects.update_or_create(
            staff=staff,
            week_start_date=week_start,
            defaults={
                'total_hours': total_hours,
                'workorder_hours': workorder_hours,
                'training_hours': training_hours,
                'other_hours': other_hours,
                'available_hours': available,
                'utilization_rate': min(utilization, Decimal('999.9')),
            },
        )
        aggregated += 1

    logger.info(f'工时汇总完成: 聚合{aggregated}人')
    return {'aggregated': aggregated, 'week_start': week_start.isoformat()}
