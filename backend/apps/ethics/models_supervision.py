"""
伦理监督模型 (ETH004)

核心流程：
制定监督计划 → 执行监督 → 记录发现 → 整改跟踪 → 验证关闭
"""
from django.db import models


class SupervisionStatus(models.TextChoices):
    PLANNED = 'planned', '已计划'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'


class SupervisionType(models.TextChoices):
    ROUTINE = 'routine', '常规监督'
    TARGETED = 'targeted', '专项监督'
    FOLLOW_UP = 'follow_up', '跟踪监督'
    UNANNOUNCED = 'unannounced', '飞行检查'


class EthicsSupervision(models.Model):
    """伦理监督"""

    class Meta:
        db_table = 't_ethics_supervision'
        verbose_name = '伦理监督'
        ordering = ['-planned_date', '-create_time']
        indexes = [
            models.Index(fields=['protocol', 'status']),
            models.Index(fields=['supervision_no']),
        ]

    supervision_no = models.CharField('监督编号', max_length=50, unique=True, db_index=True)
    protocol = models.ForeignKey(
        'protocol.Protocol',
        on_delete=models.CASCADE,
        related_name='ethics_supervisions',
        verbose_name='关联项目',
    )
    supervision_type = models.CharField(
        '监督类型', max_length=30,
        choices=SupervisionType.choices,
        default=SupervisionType.ROUTINE,
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=SupervisionStatus.choices,
        default=SupervisionStatus.PLANNED,
    )

    planned_date = models.DateField('计划日期', null=True, blank=True)
    actual_date = models.DateField('实际日期', null=True, blank=True)
    completed_date = models.DateField('完成日期', null=True, blank=True)

    scope = models.TextField('监督范围', blank=True, default='')
    findings = models.TextField('监督发现', blank=True, default='')
    corrective_actions = models.TextField('整改要求', blank=True, default='')
    corrective_deadline = models.DateField('整改截止日期', null=True, blank=True)
    corrective_completed = models.BooleanField('整改已完成', default=False)
    verification_notes = models.TextField('验证记录', blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    supervisor_names = models.JSONField('监督人员', default=list)
    feishu_chat_id = models.CharField('项目群聊ID', max_length=100, blank=True, default='')

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.supervision_no} ({self.get_status_display()})'
