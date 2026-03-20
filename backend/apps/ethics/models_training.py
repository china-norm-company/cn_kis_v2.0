"""
合规培训模型 (REG004)

核心流程：
创建培训计划 → 添加参与者 → 执行培训 → 考核评分 → 颁发证书
"""
from django.db import models


class TrainingType(models.TextChoices):
    GCP = 'gcp', 'GCP 培训'
    ETHICS = 'ethics', '伦理培训'
    REGULATION = 'regulation', '法规培训'
    SOP = 'sop', 'SOP 培训'
    SAFETY = 'safety', '安全培训'
    OTHER = 'other', '其他'


class TrainingStatus(models.TextChoices):
    PLANNED = 'planned', '已计划'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'


class ComplianceTraining(models.Model):
    """合规培训"""

    class Meta:
        db_table = 't_ethics_compliance_training'
        verbose_name = '合规培训'
        ordering = ['-training_date', '-create_time']
        indexes = [
            models.Index(fields=['training_type', 'status']),
            models.Index(fields=['training_no']),
        ]

    training_no = models.CharField('培训编号', max_length=50, unique=True, db_index=True)
    title = models.CharField('培训主题', max_length=300)
    training_type = models.CharField(
        '培训类型', max_length=20,
        choices=TrainingType.choices,
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=TrainingStatus.choices,
        default=TrainingStatus.PLANNED,
    )

    training_date = models.DateField('培训日期', null=True, blank=True)
    duration_hours = models.DecimalField('培训时长(小时)', max_digits=5, decimal_places=1, default=0)
    location = models.CharField('培训地点', max_length=200, blank=True, default='')
    trainer = models.CharField('培训讲师', max_length=100, blank=True, default='')
    content = models.TextField('培训内容', blank=True, default='')
    materials_url = models.URLField('培训材料URL', max_length=500, blank=True, default='')

    passing_score = models.IntegerField('及格分数', default=60)
    participant_count = models.IntegerField('参与人数', default=0)
    pass_count = models.IntegerField('通过人数', default=0)

    protocol = models.ForeignKey(
        'protocol.Protocol',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='compliance_trainings',
        verbose_name='关联项目',
    )

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.training_no} - {self.title}'

    @property
    def pass_rate(self):
        if self.participant_count == 0:
            return None
        return self.pass_count / self.participant_count

    def update_counts(self):
        """从参与者记录更新统计"""
        participants = self.participants.all()
        self.participant_count = participants.count()
        self.pass_count = participants.filter(passed=True).count()
        self.save(update_fields=['participant_count', 'pass_count', 'update_time'])


class TrainingParticipant(models.Model):
    """培训参与者"""

    class Meta:
        db_table = 't_ethics_training_participant'
        verbose_name = '培训参与者'
        ordering = ['staff_name']
        unique_together = [['training', 'staff_id']]

    training = models.ForeignKey(
        ComplianceTraining,
        on_delete=models.CASCADE,
        related_name='participants',
        verbose_name='关联培训',
    )
    staff_id = models.IntegerField('员工ID')
    staff_name = models.CharField('员工姓名', max_length=100)
    attended = models.BooleanField('是否出席', default=False)
    exam_score = models.IntegerField('考核分数', null=True, blank=True)
    passed = models.BooleanField('是否通过', default=False)
    certificate_no = models.CharField('证书编号', max_length=100, blank=True, default='')
    feedback = models.TextField('反馈', blank=True, default='')
    satisfaction_score = models.IntegerField('满意度评分', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff_name} - {self.training.title}'
