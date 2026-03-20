"""
结项管理模型

包含：项目结项、检查清单、项目复盘、客户验收
"""
from django.db import models


# ============================================================================
# 结项状态
# ============================================================================
class CloseoutStatus(models.TextChoices):
    INITIATED = 'initiated', '已发起'
    CHECKING = 'checking', '检查中'
    REVIEW = 'review', '评审中'
    ARCHIVED = 'archived', '已归档'


# ============================================================================
# 检查清单分组
# ============================================================================
class ChecklistGroup(models.TextChoices):
    DOCUMENT_COMPLETENESS = 'document_completeness', '文件完整性'
    DATA_COMPLETENESS = 'data_completeness', '数据完整性'
    QUALITY_COMPLIANCE = 'quality_compliance', '质量合规'
    FINANCIAL_SETTLEMENT = 'financial_settlement', '财务结算'


# ============================================================================
# 客户验收状态
# ============================================================================
class AcceptanceStatus(models.TextChoices):
    PENDING = 'pending', '待验收'
    PARTIAL = 'partial', '部分验收'
    ACCEPTED = 'accepted', '已验收'
    REJECTED = 'rejected', '已拒绝'


# ============================================================================
# 项目结项
# ============================================================================
class ProjectCloseout(models.Model):
    """项目结项"""

    class Meta:
        db_table = 't_project_closeout'
        verbose_name = '项目结项'
        ordering = ['-initiated_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['protocol', 'status']),
        ]

    protocol = models.ForeignKey(
        'protocol.Protocol', on_delete=models.CASCADE,
        related_name='closeouts', verbose_name='关联协议',
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=CloseoutStatus.choices, default=CloseoutStatus.INITIATED,
    )
    initiated_by_id = models.IntegerField('发起人ID', null=True, blank=True, help_text='Account ID')
    initiated_at = models.DateTimeField('发起时间', auto_now_add=True)
    archived_at = models.DateTimeField('归档时间', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'结项#{self.id} - 协议#{self.protocol_id}'


# ============================================================================
# 检查清单
# ============================================================================
class CloseoutChecklist(models.Model):
    """结项检查清单"""

    class Meta:
        db_table = 't_closeout_checklist'
        verbose_name = '结项检查项'
        ordering = ['group', 'item_code']
        indexes = [
            models.Index(fields=['closeout', 'group']),
        ]

    closeout = models.ForeignKey(
        ProjectCloseout, on_delete=models.CASCADE,
        related_name='checklists', verbose_name='关联结项',
    )
    group = models.CharField('分组', max_length=30, choices=ChecklistGroup.choices)
    item_code = models.CharField('检查项编号', max_length=50)
    item_description = models.CharField('检查项描述', max_length=500)
    is_auto_check = models.BooleanField('是否自动检查', default=False)
    auto_check_passed = models.BooleanField('自动检查通过', null=True, blank=True)
    is_manually_confirmed = models.BooleanField('是否手动确认', default=False)
    confirmed_by_id = models.IntegerField('确认人ID', null=True, blank=True, help_text='Account ID')
    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.item_code} - {self.item_description}'


# ============================================================================
# 项目复盘
# ============================================================================
class ProjectRetrospective(models.Model):
    """项目复盘"""

    class Meta:
        db_table = 't_project_retrospective'
        verbose_name = '项目复盘'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['closeout']),
        ]

    closeout = models.ForeignKey(
        ProjectCloseout, on_delete=models.CASCADE,
        related_name='retrospectives', verbose_name='关联结项',
    )
    what_went_well = models.JSONField('做得好的方面', default=list)
    what_to_improve = models.JSONField('需要改进的方面', default=list)
    action_items = models.JSONField('行动项', default=list)
    lessons_learned = models.JSONField('经验教训', default=list)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, help_text='Account ID')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'复盘#{self.id} - 结项#{self.closeout_id}'


# ============================================================================
# 客户验收
# ============================================================================
class ClientAcceptance(models.Model):
    """客户验收"""

    class Meta:
        db_table = 't_client_acceptance'
        verbose_name = '客户验收'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['closeout']),
            models.Index(fields=['acceptance_status']),
        ]

    closeout = models.ForeignKey(
        ProjectCloseout, on_delete=models.CASCADE,
        related_name='acceptances', verbose_name='关联结项',
    )
    client = models.ForeignKey(
        'crm.Client', on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='acceptances', verbose_name='客户',
    )
    deliverables = models.JSONField(
        '交付物清单', default=list,
        help_text='交付物清单 [{name, status, notes}]',
    )
    acceptance_status = models.CharField(
        '验收状态', max_length=20,
        choices=AcceptanceStatus.choices, default=AcceptanceStatus.PENDING,
    )
    signed_at = models.DateTimeField('签收时间', null=True, blank=True)
    signed_by = models.CharField('签收人', max_length=200, blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'验收#{self.id} - 结项#{self.closeout_id}'
