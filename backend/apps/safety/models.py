"""
安全管理模型

来源：cn_kis_test backend/apps/safety/
S2-1：不良事件（AE/SAE）+ 随访记录

核心链路：
工单执行中发现 AE → 上报 → 飞书审批 → 随访 → 转归
严重 AE(SAE) → 加急消息通知
"""
from django.db import models


class AESeverity(models.TextChoices):
    MILD = 'mild', '轻度'
    MODERATE = 'moderate', '中度'
    SEVERE = 'severe', '重度'


class AERelation(models.TextChoices):
    UNRELATED = 'unrelated', '无关'
    POSSIBLE = 'possible', '可能有关'
    PROBABLE = 'probable', '很可能有关'
    CERTAIN = 'certain', '肯定有关'


class AEOutcome(models.TextChoices):
    RECOVERED = 'recovered', '痊愈'
    RECOVERING = 'recovering', '好转'
    NOT_RECOVERED = 'not_recovered', '未好转'
    SEQUELAE = 'sequelae', '有后遗症'
    DEATH = 'death', '死亡'
    UNKNOWN = 'unknown', '未知'


class AEStatus(models.TextChoices):
    REPORTED = 'reported', '已上报'
    UNDER_REVIEW = 'under_review', '审核中'
    APPROVED = 'approved', '已确认'
    FOLLOWING = 'following', '随访中'
    CLOSED = 'closed', '已关闭'


class AdverseEvent(models.Model):
    """
    不良事件

    来源：cn_kis_test AdverseEvent
    """

    class Meta:
        db_table = 't_adverse_event'
        verbose_name = '不良事件'
        ordering = ['-report_date']
        indexes = [
            models.Index(fields=['enrollment', 'status']),
            models.Index(fields=['status', 'severity']),
            models.Index(fields=['is_sae']),
            models.Index(fields=['report_date']),
        ]

    # 关联
    enrollment = models.ForeignKey('subject.Enrollment', on_delete=models.PROTECT,
                                   related_name='adverse_events', verbose_name='关联入组')
    work_order = models.ForeignKey('workorder.WorkOrder', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='adverse_events',
                                   verbose_name='关联工单')

    # 事件信息
    description = models.TextField('事件描述')
    start_date = models.DateField('开始日期')
    end_date = models.DateField('结束日期', null=True, blank=True)
    severity = models.CharField('严重程度', max_length=20, choices=AESeverity.choices)
    relation = models.CharField('因果关系', max_length=20, choices=AERelation.choices)
    action_taken = models.TextField('处理措施', blank=True, default='')
    outcome = models.CharField('转归', max_length=20, choices=AEOutcome.choices,
                               default=AEOutcome.UNKNOWN)

    # SAE 标识
    is_sae = models.BooleanField('是否SAE', default=False,
                                  help_text='严重不良事件（导致死亡、危及生命、住院等）')

    # 状态
    status = models.CharField('状态', max_length=20, choices=AEStatus.choices,
                              default=AEStatus.REPORTED, db_index=True)
    report_date = models.DateField('上报日期', auto_now_add=True)

    # 飞书审批
    feishu_approval_instance_id = models.CharField('飞书审批实例ID', max_length=100,
                                                    blank=True, default='', db_index=True)
    # 飞书加急消息 ID（SAE 时使用）
    feishu_urgent_message_id = models.CharField('飞书加急消息ID', max_length=100,
                                                blank=True, default='')

    # 关联质量管理（SAE 自动创建）
    deviation_id = models.IntegerField('关联偏差ID', null=True, blank=True, help_text='Deviation ID')
    change_request_id = models.IntegerField('关联变更ID', null=True, blank=True, help_text='ChangeRequest ID')

    # 报告人
    reported_by_id = models.IntegerField('报告人ID', null=True, blank=True, help_text='Account ID')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        tag = '[SAE] ' if self.is_sae else ''
        return f'{tag}AE#{self.id} - {self.description[:30]}'


class AEFollowUp(models.Model):
    """
    AE 随访记录

    来源：cn_kis_test AEFollowUp
    """

    class Meta:
        db_table = 't_ae_follow_up'
        verbose_name = 'AE随访记录'
        ordering = ['adverse_event', 'sequence']
        indexes = [
            models.Index(fields=['adverse_event', 'sequence']),
        ]

    adverse_event = models.ForeignKey(AdverseEvent, on_delete=models.CASCADE,
                                      related_name='follow_ups', verbose_name='不良事件')
    sequence = models.IntegerField('随访序号', default=1)
    followup_date = models.DateField('随访日期')

    # 状态更新
    current_status = models.TextField('当前状态')
    outcome_update = models.CharField('转归更新', max_length=30, blank=True, default='')
    severity_change = models.CharField('严重程度变化', max_length=50, blank=True, default='')

    # 治疗
    treatment_update = models.TextField('治疗更新', blank=True, default='')

    # 后续
    requires_further_followup = models.BooleanField('需要继续随访', default=True)
    next_followup_date = models.DateField('下次随访日期', null=True, blank=True)

    # 记录人
    recorded_by_id = models.IntegerField('记录人ID', null=True, blank=True, help_text='Account ID')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'AE#{self.adverse_event_id} 第{self.sequence}次随访'
