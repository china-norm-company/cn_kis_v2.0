"""
通知中枢定时任务

Phase 1: 统一预警推送 + 每日摘要
"""
import logging
from celery import shared_task
from datetime import date

logger = logging.getLogger(__name__)


@shared_task(name='apps.notification.tasks.push_all_alerts')
def push_all_alerts():
    """
    每日全域预警推送（DE-17 multi-domain-alert 的后端驱动）

    聚合 secretary.alert_service 的 8 类预警，
    向所有管理层角色推送高严重度预警。
    """
    from apps.secretary.alert_service import generate_all_alerts, push_high_severity_alerts

    alerts = generate_all_alerts()
    high_count = sum(1 for a in alerts if a.get('severity') == 'high')
    medium_count = sum(1 for a in alerts if a.get('severity') == 'medium')

    logger.info(
        f'[预警扫描] {date.today()} — 总计 {len(alerts)} 条预警, '
        f'高 {high_count}, 中 {medium_count}'
    )

    if high_count == 0:
        logger.info('[预警扫描] 无高严重度预警，跳过推送')
        return {'total': len(alerts), 'high': 0, 'pushed': 0}

    pushed = 0
    try:
        from apps.identity.models import Account
        managers = Account.objects.filter(
            role__in=['admin', 'lab_director', 'project_manager', 'qa_manager'],
            is_active=True,
        )
        for account in managers:
            try:
                count = push_high_severity_alerts(account)
                pushed += count
            except Exception as e:
                logger.warning(f'推送给 {account} 失败: {e}')
    except Exception as e:
        logger.error(f'管理层查询失败: {e}')

    logger.info(f'[预警扫描] 推送完成: {pushed} 条')
    return {'total': len(alerts), 'high': high_count, 'pushed': pushed}


@shared_task(name='apps.notification.tasks.push_daily_digest')
def push_daily_digest():
    """
    每日晨报摘要（DE-15 feishu-notification-hub 的核心功能）

    聚合各工作台关键指标，按角色生成摘要，推送到飞书。
    """
    from apps.secretary.alert_service import generate_all_alerts

    today = date.today()
    alerts = generate_all_alerts()

    high_alerts = [a for a in alerts if a.get('severity') == 'high']
    medium_alerts = [a for a in alerts if a.get('severity') == 'medium']

    digest_lines = [
        f'📊 **CN KIS 每日摘要** — {today.strftime("%Y-%m-%d")}',
        '',
    ]

    if high_alerts:
        digest_lines.append(f'🔴 **紧急预警 ({len(high_alerts)})**')
        for a in high_alerts[:5]:
            digest_lines.append(f'  • {a["title"]}')
        if len(high_alerts) > 5:
            digest_lines.append(f'  ...还有 {len(high_alerts) - 5} 条')
        digest_lines.append('')

    if medium_alerts:
        digest_lines.append(f'🟡 **注意事项 ({len(medium_alerts)})**')
        for a in medium_alerts[:5]:
            digest_lines.append(f'  • {a["title"]}')
        if len(medium_alerts) > 5:
            digest_lines.append(f'  ...还有 {len(medium_alerts) - 5} 条')
        digest_lines.append('')

    kpi_lines = _collect_kpi_summary(today)
    if kpi_lines:
        digest_lines.append('📈 **关键指标**')
        digest_lines.extend(kpi_lines)

    digest_content = '\n'.join(digest_lines)

    pushed = _push_digest_to_managers(f'每日摘要 {today}', digest_content)
    logger.info(f'[每日摘要] 推送完成: {pushed} 人')
    return {'date': str(today), 'alerts': len(alerts), 'pushed': pushed}


def _collect_kpi_summary(today: date) -> list:
    """采集各模块 KPI 摘要"""
    lines = []

    try:
        from apps.workorder.models import WorkOrder
        total_wo = WorkOrder.objects.filter(
            create_time__date=today, is_deleted=False
        ).count()
        completed_wo = WorkOrder.objects.filter(
            status__in=['completed', 'approved'],
            update_time__date=today, is_deleted=False
        ).count()
        lines.append(f'  • 今日工单: 新建 {total_wo}, 完成 {completed_wo}')
    except Exception:
        pass

    try:
        from apps.scheduling.models import ScheduleSlot
        today_slots = ScheduleSlot.objects.filter(
            scheduled_date=today
        ).count()
        lines.append(f'  • 今日排程访视: {today_slots}')
    except Exception:
        pass

    try:
        from apps.quality.models import Deviation
        open_devs = Deviation.objects.filter(
            status__in=['open', 'investigating']
        ).count()
        lines.append(f'  • 开放偏差: {open_devs}')
    except Exception:
        pass

    return lines


def _push_digest_to_managers(title: str, content: str) -> int:
    """向管理层推送摘要"""
    pushed = 0
    try:
        from apps.identity.models import Account
        from apps.notification.services import send_notification

        managers = Account.objects.filter(
            role__in=['admin', 'lab_director', 'project_manager', 'qa_manager'],
            is_active=True,
        )
        for account in managers:
            try:
                send_notification(
                    recipient_id=account.id,
                    title=title,
                    content=content,
                    channel='feishu_card',
                    priority='normal',
                    source_type='daily_digest',
                    source_id=None,
                )
                pushed += 1
            except Exception as e:
                logger.warning(f'摘要推送给 {account} 失败: {e}')
    except Exception as e:
        logger.error(f'管理层查询失败: {e}')
    return pushed


@shared_task(name='apps.notification.tasks.push_quality_alerts')
def push_quality_alerts():
    """
    质量模块预警推送（DE-08 质量守护的定时驱动）

    扫描：偏差逾期、CAPA 逾期、SOP 到期、数据质疑未关闭。
    """
    today = date.today()
    pushed = 0

    try:
        from apps.quality.models import Deviation, CAPA, SOP
        from apps.notification.services import send_notification

        open_deviations = Deviation.objects.filter(
            status__in=['open', 'investigating']
        ).count()
        overdue_capas = CAPA.objects.filter(status='overdue').count()
        expiring_sops = SOP.objects.filter(
            status='effective',
            next_review__lte=today,
        ).count()

        if open_deviations + overdue_capas + expiring_sops == 0:
            logger.info('[质量扫描] 无质量预警')
            return {'pushed': 0}

        content_lines = []
        if open_deviations > 0:
            content_lines.append(f'🔴 开放偏差: {open_deviations} 条')
        if overdue_capas > 0:
            content_lines.append(f'🔴 逾期 CAPA: {overdue_capas} 条')
        if expiring_sops > 0:
            content_lines.append(f'🟡 SOP 审查过期: {expiring_sops} 份')

        content = '\n'.join(content_lines)

        try:
            from apps.identity.models import Account
            qa_managers = Account.objects.filter(
                role__in=['admin', 'qa_manager'],
                is_active=True,
            )
            for account in qa_managers:
                send_notification(
                    recipient_id=account.id,
                    title=f'质量预警汇总 {today}',
                    content=content,
                    channel='feishu_card',
                    priority='high' if overdue_capas > 0 else 'normal',
                    source_type='quality_alert',
                )
                pushed += 1
        except Exception as e:
            logger.warning(f'质量预警推送失败: {e}')

    except Exception as e:
        logger.error(f'质量扫描失败: {e}')

    logger.info(f'[质量扫描] 推送完成: {pushed} 条')
    return {'pushed': pushed}


@shared_task(name='apps.notification.tasks.push_scheduling_alerts')
def push_scheduling_alerts():
    """
    排程预警推送 — 通知即将到期的访视时段

    扫描未来 3 天内需要执行的访视时段，向对应执行人推送提醒。
    """
    from datetime import timedelta

    today = date.today()
    pushed = 0

    try:
        from apps.scheduling.models import ScheduleSlot
        from apps.notification.services import send_notification

        upcoming_slots = ScheduleSlot.objects.filter(
            scheduled_date__gte=today,
            scheduled_date__lte=today + timedelta(days=3),
            status__in=['planned', 'confirmed'],
        ).select_related('visit_node')

        for slot in upcoming_slots:
            if not slot.assigned_to_id:
                continue
            days_until = (slot.scheduled_date - today).days
            visit_name = slot.visit_node.name if slot.visit_node else '未命名访视'

            if days_until == 0:
                title = f'📌 今日访视: {visit_name}'
                priority = 'high'
            elif days_until == 1:
                title = f'📅 明日访视: {visit_name}'
                priority = 'normal'
            else:
                title = f'📅 {days_until} 天后访视: {visit_name}'
                priority = 'low'

            try:
                send_notification(
                    recipient_id=slot.assigned_to_id,
                    title=title,
                    content=f'排程日期: {slot.scheduled_date}',
                    channel='feishu_card',
                    priority=priority,
                    source_type='visit_reminder',
                    source_id=slot.id,
                )
                pushed += 1
            except Exception as e:
                logger.warning(f'访视提醒推送失败 slot#{slot.id}: {e}')

    except Exception as e:
        logger.error(f'排程预警扫描失败: {e}')

    logger.info(f'[排程预警] 推送完成: {pushed} 条')
    return {'pushed': pushed}
