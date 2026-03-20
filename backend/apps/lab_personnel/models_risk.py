"""
实验室人员管理 — 风险预警模型

包含：
- RiskAlert: 风险预警
"""
from django.db import models


# ============================================================================
# 枚举定义
# ============================================================================
class RiskLevel(models.TextChoices):
    RED = 'red', '红色（立即行动）'
    YELLOW = 'yellow', '黄色（一周内处理）'
    BLUE = 'blue', '蓝色（月度关注）'


class RiskType(models.TextChoices):
    CERT_EXPIRING = 'cert_expiring', '资质即将到期'
    CERT_EXPIRED = 'cert_expired', '资质已过期'
    SINGLE_POINT = 'single_point', '单点依赖'
    OVERLOAD = 'overload', '工时超负荷'
    SKILL_DECAY = 'skill_decay', '能力萎缩'
    QUALITY_DECLINE = 'quality_decline', '质量下滑'
    CAPACITY_GAP = 'capacity_gap', '产能缺口'
    TRAINING_OVERDUE = 'training_overdue', '培训逾期'


class RiskStatus(models.TextChoices):
    OPEN = 'open', '待处理'
    ACKNOWLEDGED = 'acknowledged', '已确认'
    MITIGATING = 'mitigating', '处理中'
    RESOLVED = 'resolved', '已解决'
    DISMISSED = 'dismissed', '已忽略'


# ============================================================================
# RiskAlert — 风险预警
# ============================================================================
class RiskAlert(models.Model):
    """风险预警"""

    class Meta:
        db_table = 't_risk_alert'
        verbose_name = '风险预警'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['level', 'status']),
            models.Index(fields=['risk_type', 'status']),
            models.Index(fields=['related_staff']),
        ]

    risk_type = models.CharField('风险类型', max_length=30, choices=RiskType.choices)
    level = models.CharField('风险等级', max_length=10, choices=RiskLevel.choices)
    title = models.CharField('预警标题', max_length=300)
    description = models.TextField('预警详情')
    status = models.CharField('状态', max_length=20,
                               choices=RiskStatus.choices, default=RiskStatus.OPEN)

    related_staff = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                                       null=True, blank=True,
                                       related_name='risk_alerts', verbose_name='关联人员')
    related_object_type = models.CharField('关联对象类型', max_length=50, blank=True, default='',
                                            help_text='如 certificate/method/workorder')
    related_object_id = models.IntegerField('关联对象ID', null=True, blank=True)

    action_taken = models.TextField('处理措施', blank=True, default='')
    resolved_at = models.DateTimeField('解决时间', null=True, blank=True)
    resolved_by_id = models.IntegerField('解决人ID', null=True, blank=True)

    feishu_message_id = models.CharField('飞书消息ID', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'[{self.get_level_display()}] {self.title}'
