"""
方案准备工作流模型

包含：方案（Proposal）、方案版本（ProposalVersion）、
      准备清单（ProposalChecklist）、沟通记录（CommunicationLog）
"""
from django.db import models


# ============================================================================
# 方案状态
# ============================================================================
class ProposalStatus(models.TextChoices):
    DRAFTING = 'drafting', '草拟中'
    INTERNAL_REVIEW = 'internal_review', '内部审查'
    CLIENT_REVIEW = 'client_review', '客户审查'
    REVISION = 'revision', '修订中'
    FINALIZED = 'finalized', '已定稿'


# ============================================================================
# 方案
# ============================================================================
class Proposal(models.Model):
    """方案"""

    class Meta:
        db_table = 't_proposal'
        verbose_name = '方案'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['client', 'status']),
        ]

    title = models.CharField('方案标题', max_length=500)
    opportunity = models.ForeignKey(
        'crm.Opportunity', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='proposals',
        verbose_name='关联商机',
    )
    protocol = models.ForeignKey(
        'protocol.Protocol', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='proposals',
        verbose_name='关联协议', help_text='定稿后关联',
    )
    client = models.ForeignKey(
        'crm.Client', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='proposals',
        verbose_name='客户',
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=ProposalStatus.choices, default=ProposalStatus.DRAFTING,
    )
    description = models.TextField('描述', blank=True, default='')
    product_category = models.CharField('产品类别', max_length=100, blank=True, default='')
    test_methods = models.JSONField('测试方法', default=list, blank=True)
    sample_size_estimate = models.IntegerField('预估样本量', null=True, blank=True)
    estimated_duration_days = models.IntegerField('预估周期(天)', null=True, blank=True)
    estimated_amount = models.DecimalField(
        '预估金额', max_digits=14, decimal_places=2, null=True, blank=True,
    )

    created_by_id = models.IntegerField(
        '创建人ID', null=True, blank=True, db_index=True, help_text='Account ID',
    )
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.title


# ============================================================================
# 方案版本
# ============================================================================
class ProposalVersion(models.Model):
    """方案版本"""

    class Meta:
        db_table = 't_proposal_version'
        verbose_name = '方案版本'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['proposal', 'create_time']),
        ]

    proposal = models.ForeignKey(
        Proposal, on_delete=models.CASCADE, related_name='versions',
        verbose_name='方案',
    )
    version_number = models.CharField('版本号', max_length=20)
    change_summary = models.TextField('变更摘要', blank=True, default='')
    file_path = models.CharField('文件路径', max_length=500, blank=True, default='')
    feishu_doc_token = models.CharField('飞书文档Token', max_length=200, blank=True, default='')

    created_by_id = models.IntegerField(
        '创建人ID', null=True, blank=True, db_index=True, help_text='Account ID',
    )
    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.proposal.title} - {self.version_number}'


# ============================================================================
# 准备清单
# ============================================================================
class ChecklistItemName(models.TextChoices):
    QUOTATION = 'quotation', '报价单'
    TECHNICAL_PLAN = 'technical_plan', '技术方案'
    REGULATORY_REVIEW = 'regulatory_review', '法规审查'
    ETHICS_PRE_REVIEW = 'ethics_pre_review', '伦理预审'
    RESOURCE_PLAN = 'resource_plan', '资源计划'
    SCHEDULE_CONFIRMATION = 'schedule_confirmation', '排期确认'


class ProposalChecklist(models.Model):
    """方案准备清单"""

    class Meta:
        db_table = 't_proposal_checklist'
        verbose_name = '方案准备清单'
        ordering = ['create_time']
        indexes = [
            models.Index(fields=['proposal', 'item_name']),
        ]

    proposal = models.ForeignKey(
        Proposal, on_delete=models.CASCADE, related_name='checklist_items',
        verbose_name='方案',
    )
    item_name = models.CharField(
        '检查项', max_length=50, choices=ChecklistItemName.choices,
    )
    is_completed = models.BooleanField('已完成', default=False)
    completed_by_id = models.IntegerField('完成人ID', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.proposal.title} - {self.get_item_name_display()}'


# ============================================================================
# 沟通记录
# ============================================================================
class CommunicationType(models.TextChoices):
    EMAIL = 'email', '邮件'
    PHONE = 'phone', '电话'
    MEETING = 'meeting', '会议'
    FEISHU_MESSAGE = 'feishu_message', '飞书消息'
    VISIT = 'visit', '拜访'
    FILE_TRANSFER = 'file_transfer', '文件传递'


class CommunicationLog(models.Model):
    """沟通记录"""

    class Meta:
        db_table = 't_communication_log'
        verbose_name = '沟通记录'
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['client', 'occurred_at']),
            models.Index(fields=['proposal', 'occurred_at']),
        ]

    client = models.ForeignKey(
        'crm.Client', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='communication_logs',
        verbose_name='客户',
    )
    proposal = models.ForeignKey(
        Proposal, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='communication_logs',
        verbose_name='方案',
    )
    opportunity = models.ForeignKey(
        'crm.Opportunity', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='communication_logs',
        verbose_name='商机',
    )
    protocol = models.ForeignKey(
        'protocol.Protocol', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='communication_logs',
        verbose_name='协议',
    )
    contact_id = models.IntegerField(
        '关键联系人ID', null=True, blank=True,
        help_text='关联 t_client_contact.id，精确标记与哪位关键人沟通',
    )
    comm_type = models.CharField('沟通类型', max_length=20, choices=CommunicationType.choices)
    subject = models.CharField('主题', max_length=500)
    summary = models.TextField('摘要', blank=True, default='')
    participants = models.JSONField('参与人', default=list, blank=True)
    occurred_at = models.DateTimeField('发生时间')

    created_by_id = models.IntegerField(
        '创建人ID', null=True, blank=True, db_index=True, help_text='Account ID',
    )
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.get_comm_type_display()} - {self.subject}'


# ============================================================================
# 会议类型 (E3)
# ============================================================================
class MeetingType(models.TextChoices):
    KICKOFF = 'kickoff', '启动会'
    WEEKLY = 'weekly', '周会'
    REVIEW = 'review', '评审会'
    CLIENT = 'client', '客户会议'
    OTHER = 'other', '其他'

class MeetingStatus(models.TextChoices):
    PLANNED = 'planned', '计划中'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'

class Meeting(models.Model):
    title = models.CharField('会议标题', max_length=500)
    meeting_type = models.CharField('会议类型', max_length=30, choices=MeetingType.choices, default=MeetingType.OTHER)
    protocol = models.ForeignKey('protocol.Protocol', on_delete=models.SET_NULL, null=True, blank=True, related_name='meetings')
    scheduled_date = models.DateTimeField('计划时间')
    duration_minutes = models.IntegerField('时长(分钟)', default=60)
    location = models.CharField('地点', max_length=300, blank=True)
    participants = models.JSONField('参会人', default=list, blank=True)
    feishu_calendar_event_id = models.CharField('飞书日历事件ID', max_length=200, blank=True)
    status = models.CharField('状态', max_length=20, choices=MeetingStatus.choices, default=MeetingStatus.PLANNED)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_meeting'
        ordering = ['-scheduled_date']

class MeetingMinute(models.Model):
    meeting = models.OneToOneField(Meeting, on_delete=models.CASCADE, related_name='minutes')
    content = models.TextField('会议纪要内容')
    created_by_id = models.IntegerField('记录人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_meeting_minute'

class MeetingActionItemStatus(models.TextChoices):
    PENDING = 'pending', '待办'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'
    OVERDUE = 'overdue', '已逾期'

class MeetingActionItem(models.Model):
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='action_items')
    description = models.CharField('描述', max_length=500)
    assignee_id = models.IntegerField('负责人ID', null=True, blank=True)
    assignee_name = models.CharField('负责人', max_length=100, blank=True)
    due_date = models.DateField('截止日期', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=MeetingActionItemStatus.choices, default=MeetingActionItemStatus.PENDING)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_meeting_action_item'
        ordering = ['due_date']
