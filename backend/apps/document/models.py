"""
文档管理模型（eTMF）

来源：cn_kis_test backend/apps/document/
S2-2：文档分类、文档、审核、发布、培训

核心流程：
创建文档 → 提交审核 → 审核通过 → 发布 → 飞书云空间同步 → 培训确认
"""
from django.db import models


# ============================================================================
# 文档分类
# ============================================================================
class DocumentCategory(models.Model):
    """文档分类（层级结构）"""

    class Meta:
        db_table = 't_document_category'
        verbose_name = '文档分类'
        ordering = ['sort_order', 'name']

    code = models.CharField('分类编码', max_length=50, unique=True, db_index=True)
    name = models.CharField('分类名称', max_length=100)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True,
                               related_name='children', verbose_name='上级分类')
    description = models.TextField('描述', blank=True, default='')
    is_active = models.BooleanField('是否启用', default=True)
    sort_order = models.IntegerField('排序', default=0)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.code} - {self.name}'


# ============================================================================
# 文档主表
# ============================================================================
class DocumentStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    PENDING_REVIEW = 'pending_review', '待审核'
    IN_REVIEW = 'in_review', '审核中'
    APPROVED = 'approved', '已批准'
    PUBLISHED = 'published', '已发布'
    OBSOLETE = 'obsolete', '已作废'
    ARCHIVED = 'archived', '已归档'


class Document(models.Model):
    """文档"""

    class Meta:
        db_table = 't_document'
        verbose_name = '文档'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['category', 'status']),
            models.Index(fields=['status']),
            models.Index(fields=['document_no']),
        ]

    document_no = models.CharField('文档编号', max_length=100, unique=True, db_index=True)
    title = models.CharField('标题', max_length=500)
    category = models.ForeignKey(DocumentCategory, on_delete=models.PROTECT,
                                 related_name='documents', verbose_name='文档分类')
    version = models.CharField('版本号', max_length=20, default='1.0')
    status = models.CharField('状态', max_length=20, choices=DocumentStatus.choices,
                              default=DocumentStatus.DRAFT, db_index=True)
    description = models.TextField('描述', blank=True, default='')
    content = models.TextField('文档内容', blank=True, default='')
    file_path = models.CharField('文件路径', max_length=500, blank=True, default='')

    # 飞书云文档
    feishu_doc_token = models.CharField('飞书文档token', max_length=200, blank=True, default='',
                                        help_text='飞书云文档 token，发布时创建')

    # 生效信息
    effective_date = models.DateField('生效日期', null=True, blank=True)
    expiry_date = models.DateField('失效日期', null=True, blank=True)

    # 审计
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, help_text='Account ID')
    published_at = models.DateTimeField('发布时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.document_no} - {self.title}'


# ============================================================================
# 文档审核
# ============================================================================
class ReviewStatus(models.TextChoices):
    PENDING = 'pending', '待审核'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已驳回'


class DocumentReview(models.Model):
    """文档审核记录"""

    class Meta:
        db_table = 't_document_review'
        verbose_name = '文档审核'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['document', 'status']),
        ]

    document = models.ForeignKey(Document, on_delete=models.CASCADE,
                                 related_name='reviews', verbose_name='文档')
    status = models.CharField('状态', max_length=20, choices=ReviewStatus.choices,
                              default=ReviewStatus.PENDING)
    submitted_by_id = models.IntegerField('提交人ID', null=True, blank=True)
    reviewed_by_id = models.IntegerField('审核人ID', null=True, blank=True)
    review_comments = models.TextField('审核意见', blank=True, default='')
    reviewed_at = models.DateTimeField('审核时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.document.title} - {self.status}'


# ============================================================================
# 文档发布
# ============================================================================
class DocumentPublish(models.Model):
    """文档发布记录"""

    class Meta:
        db_table = 't_document_publish'
        verbose_name = '文档发布'
        ordering = ['-published_at']

    document = models.ForeignKey(Document, on_delete=models.CASCADE,
                                 related_name='publishes', verbose_name='文档')
    published_by_id = models.IntegerField('发布人ID', null=True, blank=True)
    published_at = models.DateTimeField('发布时间', auto_now_add=True)
    publish_notes = models.TextField('发布说明', blank=True, default='')
    training_required = models.BooleanField('需要培训', default=False)
    training_deadline = models.DateField('培训截止日期', null=True, blank=True)

    def __str__(self):
        return f'{self.document.title} - 发布'


# ============================================================================
# 文档培训
# ============================================================================
class TrainingStatus(models.TextChoices):
    PENDING = 'pending', '待确认'
    COMPLETED = 'completed', '已完成'
    OVERDUE = 'overdue', '已逾期'


class DocumentTraining(models.Model):
    """文档培训记录"""

    class Meta:
        db_table = 't_document_training'
        verbose_name = '文档培训'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['publish', 'user_id', 'status']),
        ]

    publish = models.ForeignKey(DocumentPublish, on_delete=models.CASCADE,
                                related_name='trainings', verbose_name='发布记录')
    user_id = models.IntegerField('培训人员ID', help_text='Account ID')
    status = models.CharField('状态', max_length=20, choices=TrainingStatus.choices,
                              default=TrainingStatus.PENDING)
    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.publish.document.title} - User#{self.user_id}'
