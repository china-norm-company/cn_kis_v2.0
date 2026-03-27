"""
受试者忠诚度/留存模型

评分算法：综合参与次数、完成率、依从性、活跃度。
"""
from django.db import models


class RiskLevel(models.TextChoices):
    LOW = 'low', '低风险'
    MEDIUM = 'medium', '中风险'
    HIGH = 'high', '高风险'


class SubjectLoyaltyScore(models.Model):
    """受试者忠诚度评分"""

    class Meta:
        db_table = 't_subject_loyalty_score'
        verbose_name = '受试者忠诚度评分'

    subject_id = models.IntegerField('受试者ID', unique=True, db_index=True)
    # Batch-A: 先新增可空 FK 桥接字段，后续完成回填后再切主读路径
    subject_ref = models.ForeignKey(
        'Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='loyalty_scores',
        db_constraint=False,
        verbose_name='受试者FK（桥接）',
    )
    total_score = models.IntegerField('总评分', default=0)
    participation_count = models.IntegerField('参与项目数', default=0)
    completion_count = models.IntegerField('完成项目数', default=0)
    compliance_avg = models.DecimalField('平均依从性', max_digits=5, decimal_places=2, default=0)
    last_activity_date = models.DateField('最后活跃日期', null=True, blank=True)
    risk_level = models.CharField('流失风险', max_length=20, choices=RiskLevel.choices, default=RiskLevel.LOW, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'忠诚度 Subject#{self.subject_id}: {self.total_score}分'


class SubjectReferral(models.Model):
    """受试者推荐关系"""

    class Meta:
        db_table = 't_subject_referral'
        verbose_name = '受试者推荐关系'
        unique_together = ['referrer_id', 'referred_id', 'plan_id']

    referrer_id = models.IntegerField('推荐人ID', db_index=True)
    referred_id = models.IntegerField('被推荐人ID', db_index=True)
    # Batch-A: 推荐关系 FK 桥接字段（保留旧 Integer 字段用于兼容）
    referrer_subject = models.ForeignKey(
        'Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referrals_sent',
        db_constraint=False,
        verbose_name='推荐人FK（桥接）',
    )
    referred_subject = models.ForeignKey(
        'Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referrals_received',
        db_constraint=False,
        verbose_name='被推荐人FK（桥接）',
    )
    plan_id = models.IntegerField('关联计划ID', null=True, blank=True)
    reward_payment_id = models.IntegerField('奖励支付ID', null=True, blank=True)
    status = models.CharField('状态', max_length=20, default='active')
    is_deleted = models.BooleanField('是否删除', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'推荐: {self.referrer_id} → {self.referred_id}'


class SubjectNPS(models.Model):
    """受试者 NPS 评分"""

    class Meta:
        db_table = 't_subject_nps'
        verbose_name = '受试者NPS评分'

    subject_id = models.IntegerField('受试者ID', db_index=True)
    plan_id = models.IntegerField('关联计划ID', null=True, blank=True)
    score = models.IntegerField('NPS评分(0-10)')
    comment = models.TextField('评论', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'NPS Subject#{self.subject_id}: {self.score}'


class SubjectDiary(models.Model):
    """受试者每日日记 (eDiary)"""

    class Meta:
        db_table = 't_subject_diary'
        verbose_name = '受试者日记'
        unique_together = ['subject_id', 'entry_date']

    subject_id = models.IntegerField('受试者ID', db_index=True)
    entry_date = models.DateField('日期', db_index=True)
    mood = models.CharField('心情', max_length=20, blank=True, default='')
    symptoms = models.TextField('症状描述', blank=True, default='')
    medication_taken = models.BooleanField('是否用药', default=True)
    symptom_severity = models.TextField('症状程度', blank=True, default='')
    symptom_onset = models.TextField('症状开始时间', blank=True, default='')
    symptom_duration = models.TextField('症状持续时长', blank=True, default='')
    notes = models.TextField('其它备注', blank=True, default='')
    is_deleted = models.BooleanField('是否删除', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'日记 Subject#{self.subject_id} {self.entry_date}'


# ============================================================================
# 受试者积分台账（SubjectPointsLedger）
# ============================================================================
class PointsEventType(models.TextChoices):
    PAYMENT          = 'payment',          '礼金奖励'
    REFERRAL         = 'referral',         '推荐奖励'
    COMPLETION       = 'completion',       '项目完成奖励'
    COMPLIANCE       = 'compliance',       '依从性奖励'
    REDEMPTION       = 'redemption',       '积分兑换（扣除）'
    ADJUSTMENT       = 'adjustment',       '人工调整'
    EXPIRY           = 'expiry',           '积分过期（扣除）'
    IMPORT_BACKFILL  = 'import_backfill',  'NAS历史导入补录'


class SubjectPointsLedger(models.Model):
    """
    受试者积分台账（流水账）

    每次积分变动记录一行，正值为入账，负值为出账。
    subject_points_balance = SUM(delta) WHERE subject_id=X

    设计原则：
      - 永不删除行（仅软取消 is_voided）
      - 余额通过聚合计算，不冗余存储（避免并发不一致）
      - 对应礼金支付通过 payment_id 关联 t_subject_payment
    """

    class Meta:
        db_table = 't_subject_points_ledger'
        verbose_name = '受试者积分台账'
        indexes = [
            models.Index(fields=['subject_id', 'create_time']),
            models.Index(fields=['event_type']),
        ]

    subject_id      = models.BigIntegerField('受试者ID', db_index=True)
    payment_id      = models.BigIntegerField('关联支付ID', null=True, blank=True, db_index=True)
    event_type      = models.CharField('事件类型', max_length=30,
                                       choices=PointsEventType.choices,
                                       default=PointsEventType.PAYMENT)
    delta           = models.IntegerField('积分变动', help_text='正=入账，负=出账')
    balance_after   = models.IntegerField('变动后余额', default=0,
                                          help_text='快照余额，仅供展示参考；以聚合为准')
    project_code    = models.CharField('关联项目', max_length=50, blank=True, default='')
    note            = models.CharField('备注', max_length=200, blank=True, default='')
    is_voided       = models.BooleanField('已作废', default=False)
    voided_at       = models.DateTimeField('作废时间', null=True, blank=True)
    voided_reason   = models.CharField('作废原因', max_length=200, blank=True, default='')
    operator_id     = models.IntegerField('操作人ID', null=True, blank=True)
    import_batch    = models.CharField('导入批次', max_length=30, blank=True, default='')

    create_time     = models.DateTimeField('创建时间', auto_now_add=True)
    update_time     = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        sign = '+' if self.delta >= 0 else ''
        return f'积分#{self.subject_id} {sign}{self.delta} ({self.event_type})'

