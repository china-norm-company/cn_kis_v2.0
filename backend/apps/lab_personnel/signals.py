"""
实验室人员管理 — Django 信号处理器

信号链路：
1. Training completed → MethodQualification 升级 (learning → probation)
2. Assessment completed → 生成晋级建议 RiskAlert (蓝色通知)
3. Deviation created (personnel-related) → 自动创建人员风险预警
"""
import logging
from datetime import date

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)

PERSONNEL_DEVIATION_CATEGORIES = [
    '操作偏差', 'SOP违规', '人员失误', '人员', '操作', '记录偏差', '数据完整性',
]

UPGRADE_THRESHOLDS = {
    'L2_to_L3': {'min_score': 80, 'min_executions': 50},
    'L3_to_L4': {'min_score': 90, 'min_executions': 200},
    'L4_to_L5': {'min_score': 95, 'min_mentees': 2},
}


@receiver(post_save, sender='hr.Training')
def on_training_completed(sender, instance, **kwargs):
    """
    培训完成 → 自动升级方法资质

    规则：
    - Training.status 变为 completed 时触发
    - 查找学员关联的 MethodQualification（通过 training_id）
    - learning → probation（培训完成即可）
    - probation → independent 需通过评估，此处不自动升级
    """
    from apps.hr.models import TrainingStatus
    if instance.status != TrainingStatus.COMPLETED:
        return

    from apps.lab_personnel.models import MethodQualification, MethodQualLevel

    upgraded = MethodQualification.objects.filter(
        staff=instance.trainee,
        training_id=instance.id,
        level=MethodQualLevel.LEARNING,
    )

    count = upgraded.update(
        level=MethodQualLevel.PROBATION,
        qualified_date=date.today(),
    )

    if count == 0:
        quals_by_staff = MethodQualification.objects.filter(
            staff=instance.trainee,
            level=MethodQualLevel.LEARNING,
        )
        count = quals_by_staff.update(
            level=MethodQualLevel.PROBATION,
            qualified_date=date.today(),
            training_id=instance.id,
        )

    if count > 0:
        logger.info(
            f'培训→资质联动: {instance.trainee.name} 完成 "{instance.course_name}", '
            f'{count} 条方法资质从 learning 升级为 probation'
        )


@receiver(post_save, sender='hr.Assessment')
def on_assessment_completed(sender, instance, **kwargs):
    """
    评估完成 → 生成晋级建议

    规则（不自动执行晋级，生成蓝色建议通知）：
    - L2→L3：评分>=80 + 执行次数>=50
    - L3→L4：评分>=90 + 执行次数>=200
    - L4→L5：评分>=95 + 成功带教>=2人
    """
    from apps.hr.models import AssessmentStatus
    if instance.status != AssessmentStatus.COMPLETED:
        return

    scores = instance.scores or {}
    if not scores:
        return

    avg_score = sum(scores.values()) / len(scores) if scores else 0

    from apps.lab_personnel.models import LabStaffProfile, MethodQualification, MethodQualLevel, CompetencyLevel
    from apps.lab_personnel.models_risk import RiskAlert, RiskLevel, RiskType, RiskStatus

    profile = LabStaffProfile.objects.filter(staff=instance.staff).first()
    if not profile:
        return

    total_executions = 0
    quals = MethodQualification.objects.filter(staff=instance.staff)
    for q in quals:
        total_executions += q.total_executions

    suggestion = None
    current = profile.competency_level

    if current == CompetencyLevel.L2_PROBATION:
        threshold = UPGRADE_THRESHOLDS['L2_to_L3']
        if avg_score >= threshold['min_score'] and total_executions >= threshold['min_executions']:
            suggestion = {
                'from': 'L2', 'to': 'L3',
                'reason': f'评分{avg_score:.0f}≥{threshold["min_score"]}, 执行{total_executions}≥{threshold["min_executions"]}',
            }

    elif current == CompetencyLevel.L3_INDEPENDENT:
        threshold = UPGRADE_THRESHOLDS['L3_to_L4']
        if avg_score >= threshold['min_score'] and total_executions >= threshold['min_executions']:
            suggestion = {
                'from': 'L3', 'to': 'L4',
                'reason': f'评分{avg_score:.0f}≥{threshold["min_score"]}, 执行{total_executions}≥{threshold["min_executions"]}',
            }

    elif current == CompetencyLevel.L4_EXPERT:
        threshold = UPGRADE_THRESHOLDS['L4_to_L5']
        mentees = MethodQualification.objects.filter(
            staff__lab_profile__mentor_id=instance.staff.id,
            level__in=[MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR],
        ).values('staff_id').distinct().count()

        if avg_score >= threshold['min_score'] and mentees >= threshold['min_mentees']:
            suggestion = {
                'from': 'L4', 'to': 'L5',
                'reason': f'评分{avg_score:.0f}≥{threshold["min_score"]}, 带教{mentees}≥{threshold["min_mentees"]}人',
            }

    if suggestion:
        existing = RiskAlert.objects.filter(
            risk_type=RiskType.QUALITY_DECLINE,
            related_staff=instance.staff,
            status__in=[RiskStatus.OPEN, RiskStatus.ACKNOWLEDGED],
            title__contains='晋级建议',
        ).first()

        if not existing:
            RiskAlert.objects.create(
                risk_type=RiskType.QUALITY_DECLINE,
                level=RiskLevel.BLUE,
                title=f'晋级建议：{instance.staff.name} {suggestion["from"]}→{suggestion["to"]}',
                description=(
                    f'根据评估 {instance.period} 的结果，建议将 {instance.staff.name} '
                    f'从 {suggestion["from"]} 晋级为 {suggestion["to"]}。\n'
                    f'依据：{suggestion["reason"]}'
                ),
                related_staff=instance.staff,
                related_object_type='assessment',
                related_object_id=instance.id,
            )
            logger.info(
                f'晋级建议已生成: {instance.staff.name} {suggestion["from"]}→{suggestion["to"]}'
            )


TRACKED_FIELDS = {
    'LabStaffProfile': ['lab_role', 'competency_level', 'employment_type', 'is_active', 'max_daily_hours', 'max_weekly_hours'],
    'StaffCertificate': ['status', 'is_locked', 'expiry_date', 'cert_name'],
    'MethodQualification': ['level', 'qualified_date', 'expiry_date', 'total_executions'],
}


@receiver(post_save, sender='lab_personnel.LabStaffProfile')
@receiver(post_save, sender='lab_personnel.StaffCertificate')
@receiver(post_save, sender='lab_personnel.MethodQualification')
def on_tracked_model_save(sender, instance, created, **kwargs):
    """
    关键模型字段变更审计追踪

    记录 LabStaffProfile / StaffCertificate / MethodQualification
    的关键字段变更历史。
    """
    if created:
        return

    model_name = sender.__name__
    tracked = TRACKED_FIELDS.get(model_name, [])
    if not tracked:
        return

    from apps.lab_personnel.models_compliance import FieldChangeLog

    if not hasattr(instance, '_pre_save_state'):
        return

    old_state = instance._pre_save_state
    for field in tracked:
        old_val = old_state.get(field)
        new_val = str(getattr(instance, field, ''))
        if old_val is not None and str(old_val) != new_val:
            FieldChangeLog.objects.create(
                model_name=model_name,
                record_id=instance.id,
                field_name=field,
                old_value=str(old_val),
                new_value=new_val,
            )


from django.db.models.signals import pre_save  # noqa: E402


@receiver(pre_save, sender='lab_personnel.LabStaffProfile')
@receiver(pre_save, sender='lab_personnel.StaffCertificate')
@receiver(pre_save, sender='lab_personnel.MethodQualification')
def capture_pre_save_state(sender, instance, **kwargs):
    """在保存前捕获字段原值用于变更审计"""
    if not instance.pk:
        return

    model_name = sender.__name__
    tracked = TRACKED_FIELDS.get(model_name, [])
    if not tracked:
        return

    try:
        old_instance = sender.objects.get(pk=instance.pk)
        instance._pre_save_state = {
            field: str(getattr(old_instance, field, ''))
            for field in tracked
        }
    except sender.DoesNotExist:
        instance._pre_save_state = {}


@receiver(post_save, sender='quality.Deviation')
def on_deviation_created(sender, instance, created, **kwargs):
    """
    质量偏差 → 人员风险预警

    当偏差分类属于人员相关类别时，自动在 lab_personnel 创建
    quality_decline 风险预警并通知人员主管。
    """
    if not created:
        return

    category = (instance.category or '').strip()
    is_personnel_related = any(
        cat in category for cat in PERSONNEL_DEVIATION_CATEGORIES
    )
    if not is_personnel_related:
        return

    from apps.lab_personnel.models_risk import RiskAlert, RiskLevel, RiskType

    related_staff = None
    if instance.reporter_id:
        from apps.hr.models import Staff
        related_staff = Staff.objects.filter(
            account_id=instance.reporter_id, is_deleted=False,
        ).first()

    severity_map = {
        'critical': RiskLevel.RED,
        'major': RiskLevel.YELLOW,
        'minor': RiskLevel.BLUE,
    }
    level = severity_map.get(instance.severity, RiskLevel.YELLOW)

    RiskAlert.objects.create(
        risk_type=RiskType.QUALITY_DECLINE,
        level=level,
        title=f'质量偏差关联预警: {instance.code} - {instance.title}',
        description=(
            f'偏差分类: {category}\n'
            f'严重度: {instance.get_severity_display()}\n'
            f'项目: {instance.project}\n'
            f'报告人: {instance.reporter}\n'
            f'来源: 怀瑾·质量台\n\n'
            f'{instance.description[:300]}'
        ),
        related_staff=related_staff,
        related_object_type='deviation',
        related_object_id=instance.id,
    )
    logger.info(
        f'质量→人员联动: 偏差 {instance.code} ({category}) 已创建人员风险预警'
    )

    # 飞书通知
    if related_staff:
        from apps.lab_personnel.services.feishu_integration_service import send_risk_alert
        alert = RiskAlert.objects.filter(
            risk_type=RiskType.QUALITY_DECLINE,
            related_object_type='deviation',
            related_object_id=instance.id,
        ).first()
        if alert:
            try:
                send_risk_alert(alert)
            except Exception as e:
                logger.error(f'偏差关联预警飞书推送失败: {e}')
