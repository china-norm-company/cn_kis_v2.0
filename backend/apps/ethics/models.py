"""
伦理管理模型

来源：cn_kis_test backend/apps/ethics/
S2-5：伦理委员会、伦理申请、批件

核心流程：
创建伦理申请（关联协议）→ 提交飞书审批 → 审批通过后上传批件
"""
from django.db import models


class EthicsApplicationStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    REVIEWING = 'reviewing', '审核中'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已驳回'
    WITHDRAWN = 'withdrawn', '已撤回'


class EthicsCommittee(models.Model):
    """伦理委员会"""

    class Meta:
        db_table = 't_ethics_committee'
        verbose_name = '伦理委员会'
        ordering = ['name']

    name = models.CharField('委员会名称', max_length=200)
    code = models.CharField('委员会编码', max_length=100, unique=True, db_index=True)
    contact_person = models.CharField('联系人', max_length=100, blank=True, default='')
    contact_phone = models.CharField('联系电话', max_length=50, blank=True, default='')
    address = models.CharField('地址', max_length=200, blank=True, default='')
    is_active = models.BooleanField('是否启用', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return self.name


class EthicsApplication(models.Model):
    """伦理审查申请"""

    class Meta:
        db_table = 't_ethics_application'
        verbose_name = '伦理申请'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['protocol', 'status']),
            models.Index(fields=['status']),
            models.Index(fields=['application_number']),
        ]

    protocol = models.ForeignKey('protocol.Protocol', on_delete=models.CASCADE,
                                 related_name='ethics_applications', verbose_name='关联协议')
    committee = models.ForeignKey(EthicsCommittee, on_delete=models.PROTECT,
                                  related_name='applications', verbose_name='受理委员会')
    application_number = models.CharField('申请编号', max_length=100, unique=True, db_index=True)
    version = models.CharField('申请版本', max_length=50, default='v1.0')
    submission_date = models.DateField('提交日期', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=EthicsApplicationStatus.choices,
                              default=EthicsApplicationStatus.DRAFT, db_index=True)
    remarks = models.TextField('备注', blank=True, default='')

    # 飞书审批
    feishu_approval_instance_id = models.CharField('飞书审批实例ID', max_length=100,
                                                    blank=True, default='', db_index=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, help_text='Account ID')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.application_number} - {self.status}'


class ApprovalDocument(models.Model):
    """伦理批件"""

    class Meta:
        db_table = 't_ethics_approval_document'
        verbose_name = '伦理批件'
        ordering = ['-approved_date']

    application = models.OneToOneField(EthicsApplication, on_delete=models.CASCADE,
                                       related_name='approval_document', verbose_name='关联申请')
    document_number = models.CharField('批件号', max_length=100)
    approved_date = models.DateField('批准日期')
    expiry_date = models.DateField('有效期至', null=True, blank=True)
    file_url = models.URLField('批件文件URL', max_length=500, blank=True, default='')
    file_path = models.CharField('文件路径', max_length=500, blank=True, default='')
    is_active = models.BooleanField('是否有效', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'批件#{self.document_number}'
