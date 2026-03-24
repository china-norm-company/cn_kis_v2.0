"""
受试者假名化模型

PIPL 第 28 条（敏感个人信息须单独同意）+ GCP E6 R2（研究数据须与受试者标识解耦）

设计原则：
  - t_subject 保留原有字段（向后兼容），新增 is_pseudonymized 标记
  - t_subject_pseudonym 存储加密/假名数据（仅特定角色可解密）
  - 所有 API 默认返回 pseudonym_code，隐藏 name/phone/id_card
  - 解密操作需要 data_manager 或 compliance_officer 角色，并写入审计日志

隐私保护级别：
  - name/phone → AES-256-GCM 加密存储（密钥存于环境变量/KMS）
  - id_card → SHA-256 单向哈希（用于去重核查，不可反推）
  - pseudonym_code → 研究用随机码（如 CN2026-0042），对外公开
"""
from django.db import models


class SubjectPseudonym(models.Model):
    """
    受试者假名化记录表。

    与 t_subject 一对一关联，存储：
      - 研究用假名码（pseudonym_code），可公开使用
      - 加密姓名（AES-256-GCM）
      - 加密手机号（AES-256-GCM）
      - 身份证哈希（SHA-256，不可逆，用于去重防重复入组）
    """

    class Meta:
        db_table = 't_subject_pseudonym'
        verbose_name = '受试者假名化记录'
        indexes = [
            models.Index(fields=['pseudonym_code']),
            models.Index(fields=['id_card_hash']),
        ]

    subject = models.OneToOneField(
        'subject.Subject',
        on_delete=models.PROTECT,
        related_name='pseudonym',
        verbose_name='受试者',
        db_index=True,
    )
    pseudonym_code = models.CharField(
        '假名码',
        max_length=32,
        unique=True,
        help_text='研究用随机码，如 CN2026-0042，可对外公开',
    )
    name_encrypted = models.TextField(
        '加密姓名',
        blank=True,
        default='',
        help_text='AES-256-GCM 加密的姓名，Base64 编码存储',
    )
    phone_encrypted = models.TextField(
        '加密手机号',
        blank=True,
        default='',
        help_text='AES-256-GCM 加密的手机号，Base64 编码存储',
    )
    id_card_hash = models.CharField(
        '身份证哈希',
        max_length=64,
        blank=True,
        default='',
        db_index=True,
        help_text='SHA-256(身份证号)，不可逆，仅用于去重核查',
    )
    encryption_key_ref = models.CharField(
        '加密密钥引用',
        max_length=128,
        blank=True,
        default='',
        help_text='指向密钥管理服务的 key_id，不存明文密钥',
    )
    pseudonymized_at = models.DateTimeField(
        '假名化时间',
        auto_now_add=True,
    )
    pseudonymized_by_id = models.IntegerField(
        '操作人账号ID',
        null=True,
        blank=True,
        help_text='执行假名化操作的账号ID（审计用）',
    )
    is_active = models.BooleanField(
        '假名化激活',
        default=False,
        help_text='True=受试者撤回同意后激活，原始姓名/手机号已从 t_subject 清除',
    )

    def __str__(self):
        return f'{self.pseudonym_code}（subject_id={self.subject_id}）'


class SubjectGlobalRegistry(models.Model):
    """
    受试者全局编号注册表。

    防止同一受试者重复入组：通过 id_card_hash 匹配，跨项目跨协议唯一标识。
    """

    class Meta:
        db_table = 't_subject_global_registry'
        verbose_name = '受试者全局注册表'
        indexes = [
            models.Index(fields=['global_no']),
            models.Index(fields=['id_card_hash']),
        ]

    id_card_hash = models.CharField(
        '身份证哈希',
        max_length=64,
        unique=True,
        help_text='SHA-256(身份证号)，主键匹配字段',
    )
    global_no = models.CharField(
        '全局受试者编号',
        max_length=32,
        unique=True,
        help_text='如 CN-SUB-2026-00001，跨项目唯一',
    )
    first_enrolled_at = models.DateField(
        '首次入组日期',
        null=True,
        blank=True,
    )
    enrolled_protocol_ids = models.JSONField(
        '已参与方案ID列表',
        default=list,
        help_text='[protocol_id, ...]，用于防重复入组检查',
    )
    is_disqualified = models.BooleanField(
        '永久排除',
        default=False,
        help_text='True=该受试者因安全事件或违规被永久排除',
    )
    disqualify_reason = models.TextField(
        '排除原因',
        blank=True,
        default='',
    )
    create_time = models.DateTimeField(auto_now_add=True)
    update_time = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.global_no}（hash={self.id_card_hash[:8]}...）'
