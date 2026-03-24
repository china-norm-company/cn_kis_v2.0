"""
外部数据接入激活网关 — 数据模型

暂存审核层（Staging/Review Layer）：
  原始数据层（LIMS / 易快报 / 飞书）→ ExternalDataIngestCandidate → 各专业工作台领域数据

每条候选记录代表"一条来自外部系统的数据，经过自动字段映射，等待人工审核后写入系统"。
状态机：pending → approved/rejected → ingested/archived
"""
from django.db import models


class SourceType(models.TextChoices):
    LIMS = 'lims', 'LIMS实验室系统'
    FEISHU_MAIL = 'feishu_mail', '飞书邮件'
    FEISHU_IM = 'feishu_im', '飞书消息'
    FEISHU_DOC = 'feishu_doc', '飞书文档'
    FEISHU_APPROVAL = 'feishu_approval', '飞书审批'
    FEISHU_CALENDAR = 'feishu_calendar', '飞书日历'
    EKUAIBAO = 'ekuaibao', '易快报'


class TargetWorkstation(models.TextChoices):
    EXECUTION = 'execution', '执行工作台'
    QUALITY = 'quality', '质量工作台'
    FINANCE = 'finance', '财务工作台'
    HR = 'hr', '人事工作台'
    LAB_PERSONNEL = 'lab_personnel', '实验室人员工作台'
    RESEARCH = 'research', '研究工作台'
    CRM = 'crm', 'CRM工作台'


class ReviewStatus(models.TextChoices):
    PENDING = 'pending', '待审核'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已拒绝'
    INGESTED = 'ingested', '已接入'
    AUTO_INGESTED = 'auto_ingested', '已自动接入'


class RejectReason(models.TextChoices):
    DATA_QUALITY = 'data_quality', '数据质量差'
    DUPLICATE = 'duplicate', '重复数据'
    WRONG_SCOPE = 'wrong_scope', '不属于本系统'
    MAPPING_ERROR = 'mapping_error', '字段映射错误'
    OTHER = 'other', '其他原因'


class ExternalDataIngestCandidate(models.Model):
    """
    外部数据接入候选记录

    桥接原始数据层（只读）与各工作台领域数据层。
    一条候选记录 = 一条来自外部系统的数据经过自动映射后等待人工审核的条目。

    source_raw_id 用整型存储（不用外键）以保持跨源解耦，
    source_type 决定 source_raw_id 指向哪张原始表。
    """

    class Meta:
        db_table = 't_ext_ingest_candidate'
        verbose_name = '外部数据接入候选'
        verbose_name_plural = '外部数据接入候选'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['source_type', 'source_raw_id'],
                         name='ext_ingest_source_idx'),
            models.Index(fields=['target_workstation', 'review_status'],
                         name='ext_ingest_ws_status_idx'),
            models.Index(fields=['review_status', 'created_at'],
                         name='ext_ingest_status_time_idx'),
            models.Index(fields=['confidence_score'],
                         name='ext_ingest_confidence_idx'),
        ]

    # ── 来源信息 ──────────────────────────────────────────────
    source_type = models.CharField(
        '来源类型', max_length=30, choices=SourceType.choices,
    )
    source_raw_id = models.BigIntegerField(
        '原始记录ID',
        help_text='指向原始层记录 PK（不设外键，跨源解耦）',
    )
    source_module = models.CharField(
        '数据模块', max_length=80, blank=True, default='',
        help_text='LIMS：equipment/personnel/commission 等；EKB：flows/approvals 等',
    )
    source_snapshot = models.JSONField(
        '原始数据快照',
        help_text='候选生成时冻结的原始字段，供对比视图展示（只读）',
    )
    source_display_title = models.CharField(
        '来源摘要标题', max_length=300, blank=True, default='',
        help_text='在审核列表中展示的简短标题，如"LIMS仪器：VISIA-001"',
    )

    # ── 映射结果 ──────────────────────────────────────────────
    target_workstation = models.CharField(
        '目标工作台', max_length=30, choices=TargetWorkstation.choices,
    )
    target_model = models.CharField(
        '目标模型', max_length=100, blank=True, default='',
        help_text='如 CRFRecord / InstrumentMeasurement / Deviation',
    )
    mapped_fields = models.JSONField(
        '自动映射字段',
        default=dict,
        help_text='自动映射结果 {field_name: {value, label, confidence, source_field}}',
    )
    confidence_score = models.FloatField(
        '整体置信度', default=0.0,
        help_text='0.0~1.0，由各字段置信度加权平均得出；>=0.8 可批量自动批准',
    )

    # ── 审核状态 ──────────────────────────────────────────────
    review_status = models.CharField(
        '审核状态', max_length=20,
        choices=ReviewStatus.choices,
        default=ReviewStatus.PENDING,
    )
    reviewed_by_id = models.BigIntegerField(
        '审核人ID', null=True, blank=True,
        help_text='指向 t_account.id',
    )
    reviewed_by_name = models.CharField(
        '审核人姓名', max_length=100, blank=True, default='',
    )
    reviewed_at = models.DateTimeField('审核时间', null=True, blank=True)
    review_comment = models.TextField('审核备注', blank=True, default='')
    reject_reason = models.CharField(
        '拒绝原因', max_length=30,
        choices=RejectReason.choices,
        blank=True, default='',
    )

    # ── 人工修改后的字段（可覆盖 mapped_fields）────────────────
    modified_fields = models.JSONField(
        '人工修正字段',
        default=dict,
        help_text='审核人修改后的字段值，接入时优先使用此字段（若不为空）',
    )

    # ── 接入结果 ──────────────────────────────────────────────
    ingested_model = models.CharField(
        '已接入模型', max_length=100, blank=True, default='',
    )
    ingested_record_id = models.BigIntegerField(
        '已接入记录ID', null=True, blank=True,
        help_text='接入成功后，指向目标领域表的记录 PK',
    )
    ingestion_log = models.JSONField(
        '接入日志', default=dict, blank=True,
        help_text='接入操作的详细结果，含创建/更新的字段清单',
    )

    # ── 元数据 ────────────────────────────────────────────────
    created_at = models.DateTimeField('候选创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('最后更新时间', auto_now=True)
    populated_by = models.CharField(
        '生成来源', max_length=100, blank=True, default='system',
        help_text='生成此候选的脚本/任务名称',
    )

    def __str__(self):
        return (
            f'Candidate[{self.source_type}:{self.source_raw_id}]'
            f' →{self.target_workstation} [{self.review_status}]'
        )

    def get_effective_fields(self) -> dict:
        """返回接入时应使用的字段：人工修正 > 自动映射"""
        result = dict(self.mapped_fields or {})
        result.update(self.modified_fields or {})
        return result

    def is_high_confidence(self, threshold: float = 0.8) -> bool:
        return self.confidence_score >= threshold
