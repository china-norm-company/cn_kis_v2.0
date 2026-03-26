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

    # 知情管理：展示与签署顺序（越小越靠前）
    consent_display_order = models.IntegerField('知情管理展示顺序', default=0, db_index=True)

    # 知情管理：配置负责人（治理台账号，全局角色 crc / crc_supervisor）
    consent_config_account_id = models.IntegerField(
        '知情配置负责人账号ID',
        null=True,
        blank=True,
        db_index=True,
        help_text='治理台 Account.id，须具备全局角色 crc 或 crc_supervisor；每项目至多一人',
    )

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


class ConsentConfigMode(models.TextChoices):
    GLOBAL = 'global', '全局配置'
    PER_PROTOCOL = 'per_protocol', '按协议配置'


class ConsentGlobalConfig(models.Model):
    """知情全局配置（单例，仅保留一条记录）"""

    class Meta:
        db_table = 't_consent_global_config'
        verbose_name = '知情全局配置'

    config_mode = models.CharField(
        '配置模式',
        max_length=20,
        choices=ConsentConfigMode.choices,
        default=ConsentConfigMode.PER_PROTOCOL,
    )
    settings = models.JSONField('全局配置内容', default=dict, blank=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)


class WitnessStaff(models.Model):
    """双签/见证工作人员档案（执行台知情管理，与协议配置引用）"""

    class Meta:
        db_table = 't_witness_staff'
        ordering = ['-priority', '-id']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['is_deleted', 'update_time']),
        ]

    account = models.OneToOneField(
        'identity.Account',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='witness_staff_profile',
        verbose_name='治理台账号',
    )
    name = models.CharField('姓名', max_length=100)
    gender = models.CharField('性别', max_length=10, blank=True, default='')
    id_card_no = models.CharField('身份证号', max_length=24, blank=True, default='')
    phone = models.CharField('手机号', max_length=20, blank=True, default='')
    email = models.EmailField('工作邮箱')
    priority = models.IntegerField('优先', default=0, help_text='数值越大越靠前展示')
    face_order_id = models.CharField('人脸识别订单号', max_length=128, blank=True, default='')
    face_verified_at = models.DateTimeField('人脸识别时间', null=True, blank=True)
    signature_file = models.CharField('签名文件路径', max_length=500, blank=True, default='')
    signature_at = models.DateTimeField('签名时间', null=True, blank=True)
    identity_verified = models.BooleanField('身份已核验', default=False)
    is_deleted = models.BooleanField('已删除', default=False)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return self.name


class WitnessDualSignAuthToken(models.Model):
    """双签身份验证邮件中的令牌（默认发信当日 23:59:59 前有效，与业务时区一致）"""

    class Meta:
        db_table = 't_witness_dual_sign_auth_token'
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['expires_at']),
        ]

    token = models.CharField(max_length=96, unique=True, db_index=True)
    witness_staff = models.ForeignKey(WitnessStaff, on_delete=models.CASCADE, related_name='auth_tokens')
    # 空表示「档案核验」邮件（仅人脸+手写签名登记，不绑定具体协议）
    protocol_id = models.IntegerField('协议ID', db_index=True, null=True, blank=True)
    icf_version_id = models.IntegerField('签署节点 ICF 版本 ID', null=True, blank=True)
    notify_email = models.EmailField('通知邮箱')
    expires_at = models.DateTimeField('过期时间')
    face_byted_token = models.CharField(
        '火山人脸核身 byted_token',
        max_length=512,
        blank=True,
        default='',
        help_text='邮件公开链接触发核身后暂存，核验通过后清空',
    )
    signature_auth_decision = models.CharField(
        '签名授权决策',
        max_length=16,
        blank=True,
        default='',
        help_text='人脸通过后：agreed=同意项目使用签名信息；refused=拒绝；空=未选择',
    )
    signature_auth_at = models.DateTimeField('签名授权时间', null=True, blank=True)
    staff_signature_registered_at = models.DateTimeField(
        '档案手写签名登记完成时间',
        null=True,
        blank=True,
        help_text='档案核验邮件流：人脸通过后提交手写签名成功时回写',
    )
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
