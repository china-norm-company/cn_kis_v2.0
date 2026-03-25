"""
协议管理模型

包含：协议基本信息、解析日志
"""
from django.db import models


class ProtocolStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    UPLOADED = 'uploaded', '已上传'
    PARSING = 'parsing', '解析中'
    PARSED = 'parsed', '已解析'
    ACTIVE = 'active', '生效中'
    ARCHIVED = 'archived', '已归档'


class EfficacyType(models.TextChoices):
    SUPERIORITY = 'superiority', '优效性'
    NON_INFERIORITY = 'non_inferiority', '非劣效性'
    EQUIVALENCE = 'equivalence', '等效性'
    BIOEQUIVALENCE = 'bioequivalence', '生物等效性'
    OTHER = 'other', '其他'


class Protocol(models.Model):
    """临床试验协议"""

    class Meta:
        db_table = 't_protocol'
        verbose_name = '协议'
        indexes = [
            models.Index(fields=['status', 'create_time']),
            models.Index(fields=['title']),
        ]

    # 基本信息
    title = models.CharField('标题', max_length=500)
    code = models.CharField('协议编号', max_length=100, blank=True, default='', db_index=True)
    file_path = models.CharField('文件路径', max_length=500, blank=True, default='')

    # 状态
    status = models.CharField('状态', max_length=20, choices=ProtocolStatus.choices, default=ProtocolStatus.DRAFT, db_index=True)

    # 解析结果（AI解析后的结构化数据）
    parsed_data = models.JSONField('解析数据', null=True, blank=True)

    # 试验设计
    efficacy_type = models.CharField('疗效类型', max_length=50, choices=EfficacyType.choices, blank=True, default='')
    sample_size = models.IntegerField('样本量', null=True, blank=True)

    # P2.4 化妆品 CRO 专用字段
    product_category = models.CharField(
        '产品类别', max_length=50, blank=True, default='',
        help_text='护肤/彩妆/防晒/洗护/口腔/其他',
    )
    claim_type = models.CharField(
        '功效宣称', max_length=200, blank=True, default='',
        help_text='保湿/美白/抗衰/防晒/修护/控油等，逗号分隔多选',
    )
    test_methods = models.JSONField(
        '测试方法列表', null=True, blank=True, default=list,
        help_text='JSON数组，如 ["Corneometer", "Tewameter", "VISIA-CR"]',
    )
    regulatory_standard = models.CharField(
        '适用法规标准', max_length=500, blank=True, default='',
        help_text='如《化妆品功效宣称评价规范》',
    )
    sponsor_id = models.IntegerField(
        '委托方ID', null=True, blank=True,
        help_text='关联 CRM 中的客户 ID',
    )
    product_line_id = models.IntegerField(
        '产品线ID', null=True, blank=True,
        help_text='关联 CRM t_client_product_line.id',
    )
    team_members = models.JSONField(
        '项目团队成员', null=True, blank=True, default=list,
        help_text='JSON数组 [{id, name, role}]',
    )

    # [废弃] 飞书项目工作项ID — 公司商业专业版不含飞书项目服务
    # 已改用飞书多维表格看板同步（feishu_sync 模块），此字段保留兼容但不再写入
    feishu_project_work_item_id = models.CharField('飞书项目工作项ID(废弃)', max_length=100, blank=True, default='')
    feishu_chat_id = models.CharField('飞书项目群ID', max_length=100, blank=True, default='',
                                      db_index=True, help_text='S3-5 协议创建时自动创建')

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    # 软删除
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.title


class ProtocolParseLog(models.Model):
    """协议解析日志"""

    class Meta:
        db_table = 't_protocol_parse_log'
        verbose_name = '协议解析日志'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['protocol', 'create_time']),
            models.Index(fields=['status']),
        ]

    protocol = models.ForeignKey(Protocol, on_delete=models.CASCADE, related_name='parse_logs')
    status = models.CharField('状态', max_length=20, choices=ProtocolStatus.choices, default=ProtocolStatus.PARSING)
    error_message = models.TextField('错误信息', blank=True, default='')
    parsed_result = models.JSONField('解析结果', null=True, blank=True)

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    finish_time = models.DateTimeField('完成时间', null=True, blank=True)

    def __str__(self):
        return f'{self.protocol.title} - {self.status}'


class ProtocolCostSnapshot(models.Model):
    """
    协议全景成本快照

    每条记录汇总一个 Protocol 下来自三个来源的成本数据：
      - 易快报报销单（ExpenseRequest）：差旅/采购/耗材等运营成本
      - 受试者礼金支付（SubjectPayment）：受试者补偿费用
      - 预算申请（ProjectBudget）：批准预算总额

    由管理命令 link_lims_ekb_to_protocol --refresh-snapshot 定期刷新。
    """

    class Meta:
        db_table = 't_protocol_cost_snapshot'
        verbose_name = '协议成本快照'
        indexes = [
            models.Index(fields=['protocol_code']),
            models.Index(fields=['computed_at']),
        ]

    protocol_code = models.CharField('协议编号', max_length=100, unique=True, db_index=True)
    protocol_id = models.IntegerField('协议ID', null=True, blank=True, db_index=True,
                                      help_text='关联 t_protocol.id')
    protocol_title = models.CharField('协议标题', max_length=500, blank=True, default='')
    protocol_status = models.CharField('协议状态', max_length=20, blank=True, default='')

    # 易快报维度
    ekb_expense_count = models.IntegerField('报销单数量', default=0)
    ekb_expense_total = models.DecimalField('报销总金额', max_digits=18, decimal_places=2, default=0)
    ekb_approved_total = models.DecimalField('已审批报销金额', max_digits=18, decimal_places=2, default=0)
    ekb_expense_types = models.JSONField('费用类型分布', default=dict, blank=True,
                                         help_text='{"travel": 30, "procurement": 5, ...}')

    # 受试者礼金维度
    subject_payment_count = models.IntegerField('礼金支付笔数', default=0)
    subject_paid_count = models.IntegerField('已支付笔数', default=0)
    subject_payment_total = models.DecimalField('礼金支付总额', max_digits=18, decimal_places=2, default=0)
    subject_paid_total = models.DecimalField('已支付礼金金额', max_digits=18, decimal_places=2, default=0)
    subject_count = models.IntegerField('涉及受试者数', default=0,
                                        help_text='该项目下有过礼金支付的不重复受试者数量')

    # 预算维度
    budget_count = models.IntegerField('预算单数量', default=0)
    budget_total = models.DecimalField('批准预算总额', max_digits=18, decimal_places=2, default=0)

    # 计算元信息
    computed_at = models.DateTimeField('最后计算时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'CostSnapshot[{self.protocol_code}] ekb={self.ekb_expense_total} subj={self.subject_payment_total}'
