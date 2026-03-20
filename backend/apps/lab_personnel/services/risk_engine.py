"""
风险扫描引擎

8 类风险规则自动检测：
1. cert_expiring: 资质即将到期
2. cert_expired: 资质已过期
3. single_point: 单点依赖
4. overload: 工时超负荷
5. skill_decay: 能力萎缩
6. quality_decline: 质量下滑
7. capacity_gap: 产能缺口
8. training_overdue: 培训逾期
"""
import logging
from typing import Optional
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.hr.models import Staff, Training, TrainingStatus
from apps.lab_personnel.models import (
    StaffCertificate, MethodQualification, LabStaffProfile,
    CertificateStatus, MethodQualLevel,
)
from apps.lab_personnel.models_risk import RiskAlert, RiskLevel, RiskType, RiskStatus
from apps.lab_personnel.models_worktime import WorkTimeSummary
from apps.lab_personnel.models_scheduling import ShiftSlot

logger = logging.getLogger(__name__)


def _create_or_update_alert(
    risk_type: str,
    level: str,
    title: str,
    description: str,
    related_staff=None,
    related_object_type: str = '',
    related_object_id: int = None,
) -> RiskAlert:
    """创建或更新风险预警（去重逻辑）"""
    existing = RiskAlert.objects.filter(
        risk_type=risk_type,
        related_staff=related_staff,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
        status__in=[RiskStatus.OPEN, RiskStatus.ACKNOWLEDGED, RiskStatus.MITIGATING],
    ).first()

    if existing:
        existing.level = level
        existing.title = title
        existing.description = description
        existing.save(update_fields=['level', 'title', 'description', 'update_time'])
        return existing

    return RiskAlert.objects.create(
        risk_type=risk_type,
        level=level,
        title=title,
        description=description,
        related_staff=related_staff,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    )


def _scan_cert_expiring():
    """规则 1：资质即将到期"""
    today = date.today()
    alerts_created = 0

    # 90 天内到期 → 蓝色
    certs_90 = StaffCertificate.objects.filter(
        expiry_date__lte=today + timedelta(days=90),
        expiry_date__gt=today + timedelta(days=30),
        is_locked=False,
    ).select_related('staff')
    for cert in certs_90:
        days_left = (cert.expiry_date - today).days
        _create_or_update_alert(
            risk_type=RiskType.CERT_EXPIRING,
            level=RiskLevel.BLUE,
            title=f'{cert.staff.name} 的 {cert.cert_name} 将在 {days_left} 天后到期',
            description=f'证书类型：{cert.get_cert_type_display()}，到期日期：{cert.expiry_date}',
            related_staff=cert.staff,
            related_object_type='certificate',
            related_object_id=cert.id,
        )
        alerts_created += 1

    # 30 天内到期 → 黄色
    certs_30 = StaffCertificate.objects.filter(
        expiry_date__lte=today + timedelta(days=30),
        expiry_date__gt=today + timedelta(days=7),
        is_locked=False,
    ).select_related('staff')
    for cert in certs_30:
        days_left = (cert.expiry_date - today).days
        _create_or_update_alert(
            risk_type=RiskType.CERT_EXPIRING,
            level=RiskLevel.YELLOW,
            title=f'{cert.staff.name} 的 {cert.cert_name} 将在 {days_left} 天后到期',
            description=f'证书类型：{cert.get_cert_type_display()}，到期日期：{cert.expiry_date}，请尽快续期',
            related_staff=cert.staff,
            related_object_type='certificate',
            related_object_id=cert.id,
        )
        alerts_created += 1

    # 7 天内到期 → 红色
    certs_7 = StaffCertificate.objects.filter(
        expiry_date__lte=today + timedelta(days=7),
        expiry_date__gt=today,
        is_locked=False,
    ).select_related('staff')
    for cert in certs_7:
        days_left = (cert.expiry_date - today).days
        _create_or_update_alert(
            risk_type=RiskType.CERT_EXPIRING,
            level=RiskLevel.RED,
            title=f'紧急：{cert.staff.name} 的 {cert.cert_name} 将在 {days_left} 天后到期',
            description=f'证书类型：{cert.get_cert_type_display()}，到期日期：{cert.expiry_date}，必须立即续期',
            related_staff=cert.staff,
            related_object_type='certificate',
            related_object_id=cert.id,
        )
        alerts_created += 1

    # 飞书集成：发送红色/黄色资质到期预警消息
    from .feishu_integration_service import send_cert_expiry_alert
    for cert in list(certs_7) + list(certs_30):
        try:
            send_cert_expiry_alert(cert)
        except Exception as e:
            logger.error(f'证书#{cert.id} 飞书预警发送失败: {e}')

    return alerts_created


def _scan_cert_expired():
    """规则 2：资质已过期"""
    today = date.today()
    alerts_created = 0

    expired_certs = StaffCertificate.objects.filter(
        expiry_date__lt=today,
    ).select_related('staff')

    for cert in expired_certs:
        # 自动锁定
        if not cert.is_locked:
            cert.is_locked = True
            cert.status = CertificateStatus.EXPIRED
            cert.save(update_fields=['is_locked', 'status', 'update_time'])

        _create_or_update_alert(
            risk_type=RiskType.CERT_EXPIRED,
            level=RiskLevel.RED,
            title=f'{cert.staff.name} 的 {cert.cert_name} 已过期',
            description=f'证书已自动锁定，该人员不可接受工单。到期日期：{cert.expiry_date}',
            related_staff=cert.staff,
            related_object_type='certificate',
            related_object_id=cert.id,
        )
        alerts_created += 1

    return alerts_created


def _scan_single_point():
    """规则 3：单点依赖"""
    alerts_created = 0

    from apps.resource.models_detection_method import DetectionMethodTemplate
    methods = DetectionMethodTemplate.objects.filter(status='active', is_deleted=False)

    for method in methods:
        independent_staff = MethodQualification.objects.filter(
            method=method,
            level__in=[MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR],
            staff__is_deleted=False,
        ).select_related('staff')

        count = independent_staff.count()
        if count == 1:
            staff = independent_staff.first().staff
            _create_or_update_alert(
                risk_type=RiskType.SINGLE_POINT,
                level=RiskLevel.YELLOW,
                title=f'单点依赖：{method.name} 仅 {staff.name} 可独立执行',
                description=f'检测方法 {method.code} ({method.name}) 仅有 1 人具备独立执行资质，需培养后备人员',
                related_staff=staff,
                related_object_type='method',
                related_object_id=method.id,
            )
            alerts_created += 1

    return alerts_created


def _scan_overload():
    """规则 4：工时超负荷"""
    alerts_created = 0
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # 连续 2 周利用率 > 90%
    last_week_start = week_start - timedelta(weeks=1)

    summaries_this_week = WorkTimeSummary.objects.filter(
        week_start_date=week_start, utilization_rate__gt=90,
    ).select_related('staff')

    for s in summaries_this_week:
        last_week = WorkTimeSummary.objects.filter(
            staff=s.staff, week_start_date=last_week_start,
        ).first()

        if last_week and last_week.utilization_rate > 90:
            _create_or_update_alert(
                risk_type=RiskType.OVERLOAD,
                level=RiskLevel.YELLOW,
                title=f'{s.staff.name} 连续 2 周工时超负荷',
                description=f'本周利用率 {s.utilization_rate}%，上周 {last_week.utilization_rate}%，建议调整排班',
                related_staff=s.staff,
            )
            alerts_created += 1

    return alerts_created


def _scan_skill_decay():
    """规则 5：能力萎缩（6 个月未执行某方法）"""
    alerts_created = 0
    threshold_date = date.today() - timedelta(days=180)

    quals = MethodQualification.objects.filter(
        level__in=[MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR],
        staff__is_deleted=False,
    ).select_related('staff', 'method')

    for mq in quals:
        if mq.last_execution_date and mq.last_execution_date < threshold_date:
            days_since = (date.today() - mq.last_execution_date).days
            _create_or_update_alert(
                risk_type=RiskType.SKILL_DECAY,
                level=RiskLevel.BLUE,
                title=f'{mq.staff.name} 已 {days_since} 天未执行 {mq.method.name}',
                description=f'上次执行日期：{mq.last_execution_date}，建议安排复训或实操',
                related_staff=mq.staff,
                related_object_type='method_qualification',
                related_object_id=mq.id,
            )
            alerts_created += 1

    return alerts_created


def _scan_training_overdue():
    """规则 8：培训逾期"""
    alerts_created = 0
    today = date.today()

    overdue_trainings = Training.objects.filter(
        status=TrainingStatus.SCHEDULED,
        end_date__lt=today,
        is_deleted=False,
    ).select_related('trainee')

    for t in overdue_trainings:
        _create_or_update_alert(
            risk_type=RiskType.TRAINING_OVERDUE,
            level=RiskLevel.YELLOW,
            title=f'{t.trainee.name} 的培训 "{t.course_name}" 已逾期',
            description=f'计划结束日期：{t.end_date}，当前状态仍为已排期，需跟进',
            related_staff=t.trainee,
            related_object_type='training',
            related_object_id=t.id,
        )
        alerts_created += 1

    return alerts_created


def _scan_capacity_gap():
    """规则 7：产能缺口"""
    alerts_created = 0
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    for i in range(1, 3):
        future_week_start = week_start + timedelta(weeks=i)
        future_week_end = future_week_start + timedelta(days=6)

        profiles = LabStaffProfile.objects.filter(is_active=True, staff__is_deleted=False)
        available_hours = sum(p.max_weekly_hours for p in profiles)

        planned_hours = ShiftSlot.objects.filter(
            shift_date__gte=future_week_start,
            shift_date__lte=future_week_end,
        ).aggregate(total=Sum('planned_hours'))['total'] or 0

        if float(planned_hours) > available_hours:
            gap = float(planned_hours) - available_hours
            _create_or_update_alert(
                risk_type=RiskType.CAPACITY_GAP,
                level=RiskLevel.YELLOW,
                title=f'产能缺口：{future_week_start} 周需求超出可用工时',
                description=f'可用工时 {available_hours}h，需求工时 {planned_hours}h，缺口 {gap:.1f}h',
            )
            alerts_created += 1

    return alerts_created


def _auto_resolve_cleared():
    """自动解决条件消除的预警"""
    resolved_count = 0
    today = date.today()

    # 证书已续期的到期预警
    open_cert_alerts = RiskAlert.objects.filter(
        risk_type__in=[RiskType.CERT_EXPIRING, RiskType.CERT_EXPIRED],
        status__in=[RiskStatus.OPEN, RiskStatus.ACKNOWLEDGED],
        related_object_type='certificate',
    )

    for alert in open_cert_alerts:
        cert = StaffCertificate.objects.filter(id=alert.related_object_id).first()
        if cert and cert.expiry_date and cert.expiry_date > today + timedelta(days=90):
            alert.status = RiskStatus.RESOLVED
            alert.action_taken = '证书已续期，自动解决'
            alert.resolved_at = timezone.now()
            alert.save()
            resolved_count += 1

    return resolved_count


def run_risk_scan() -> dict:
    """运行完整风险扫描"""
    results = {
        'cert_expiring': _scan_cert_expiring(),
        'cert_expired': _scan_cert_expired(),
        'single_point': _scan_single_point(),
        'overload': _scan_overload(),
        'skill_decay': _scan_skill_decay(),
        'training_overdue': _scan_training_overdue(),
        'capacity_gap': _scan_capacity_gap(),
        'auto_resolved': _auto_resolve_cleared(),
    }
    total_new = sum(v for k, v in results.items() if k != 'auto_resolved')
    results['total_new_alerts'] = total_new
    results['scan_time'] = timezone.now().isoformat()

    # 飞书集成：推送未发送过的红色/黄色风险预警
    from .feishu_integration_service import send_risk_alert
    unsent_alerts = RiskAlert.objects.filter(
        level__in=[RiskLevel.RED, RiskLevel.YELLOW],
        status=RiskStatus.OPEN,
        feishu_message_id='',
    ).select_related('related_staff')
    feishu_sent = 0
    for alert in unsent_alerts:
        try:
            if send_risk_alert(alert):
                feishu_sent += 1
        except Exception as e:
            logger.error(f'风险预警#{alert.id} 飞书推送失败: {e}')
    results['feishu_notified'] = feishu_sent

    return results


# ============================================================================
# 风险预警查询 API
# ============================================================================
def list_risks(
    level: str = None,
    risk_type: str = None,
    status: str = None,
    related_staff_id: int = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """风险预警列表"""
    qs = RiskAlert.objects.select_related('related_staff').all()

    if level:
        qs = qs.filter(level=level)
    if risk_type:
        qs = qs.filter(risk_type=risk_type)
    if status:
        qs = qs.filter(status=status)
    else:
        qs = qs.exclude(status__in=[RiskStatus.RESOLVED, RiskStatus.DISMISSED])
    if related_staff_id:
        qs = qs.filter(related_staff_id=related_staff_id)

    # 按级别排序：红 > 黄 > 蓝
    level_order = {'red': 0, 'yellow': 1, 'blue': 2}
    qs = sorted(qs, key=lambda r: (level_order.get(r.level, 99), r.create_time))

    total = len(qs)
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_risk_stats() -> dict:
    """风险统计"""
    active_risks = RiskAlert.objects.exclude(
        status__in=[RiskStatus.RESOLVED, RiskStatus.DISMISSED]
    )

    return {
        'red': active_risks.filter(level=RiskLevel.RED).count(),
        'yellow': active_risks.filter(level=RiskLevel.YELLOW).count(),
        'blue': active_risks.filter(level=RiskLevel.BLUE).count(),
        'total': active_risks.count(),
        'by_type': {
            rt.value: active_risks.filter(risk_type=rt.value).count()
            for rt in RiskType
        },
    }


def acknowledge_risk(risk_id: int) -> Optional[RiskAlert]:
    """确认风险"""
    risk = RiskAlert.objects.select_related('related_staff').filter(id=risk_id).first()
    if not risk:
        return None
    risk.status = RiskStatus.ACKNOWLEDGED
    risk.save(update_fields=['status', 'update_time'])
    return risk


def resolve_risk(risk_id: int, action_taken: str = '', resolved_by_id: int = None) -> Optional[RiskAlert]:
    """解决风险"""
    risk = RiskAlert.objects.select_related('related_staff').filter(id=risk_id).first()
    if not risk:
        return None
    risk.status = RiskStatus.RESOLVED
    risk.action_taken = action_taken
    risk.resolved_at = timezone.now()
    risk.resolved_by_id = resolved_by_id
    risk.save()
    return risk
