"""
易快报集成模型（四层安全架构）

与 lims_integration 一致的四层设计：
  Layer 1 采集层  → ekb_fetcher.py 只读采集
  Layer 2 备份层  → EkbImportBatch + EkbRawRecord（原始数据永久保留）+ JSON 文件
  Layer 3 暂存层  → EkbConflict（冲突人工审核）
  Layer 4 注入层  → EkbInjectionLog（前值快照，支持三级回滚）

业务落点：
  - 主落点：finance（报销/预算/付款/发票）
  - 关联落点：research（项目成本/报价/发票）、recruitment（受试者礼金）
             hr（薪资/绩效）、execution（费用视图/付款节点）、quality（审批审计）
"""
from typing import Optional
from django.db import models


# ============================================================================
# 易快报 API 模块常量
# ============================================================================

EKB_MODULES = {
    # Phase 1: 基础主数据
    'corporation':      '企业信息',
    'departments':      '部门通讯录',
    'staffs':           '员工档案',
    'roles':            '角色定义',
    'fee_types':        '费用类型',
    'dimensions':       '自定义档案',
    'dimension_items':  '档案条目',
    'record_links':     '档案关系',
    'payer_infos':      '付款账户',
    'payee_infos':      '收款账户',
    'currency':         '币种汇率',
    'cities':           '城市分组',
    # Phase 2: 核心交易数据
    'flows':            '报销/借款/付款单',
    'flow_details':     '单据明细',
    'approvals':        '审批流/状态',
    'loan_infos':       '借款信息',
    'repayment_records':'还款记录',
    'payment_records':  '付款记录',
    # Phase 3: 预算与发票
    'budgets':          '预算树',
    'budget_nodes':     '预算节点',
    'invoices':         '发票台账',
    # Phase 4: 附件
    'attachments':      '附件索引',
}

# 分批采集分组
PHASE_MODULES = {
    'phase1': [
        'corporation', 'departments', 'staffs', 'roles',
        'fee_types', 'dimensions', 'dimension_items', 'record_links',
        'payer_infos', 'payee_infos', 'currency', 'cities',
    ],
    'phase2': [
        'flows', 'flow_details', 'approvals',
        'loan_infos', 'repayment_records', 'payment_records',
    ],
    'phase3': [
        'budgets', 'budget_nodes', 'invoices',
    ],
    'phase4': [
        'attachments',
    ],
}


# ============================================================================
# Layer 2: 批次管理与原始备份
# ============================================================================

class EkbBatchStatus(models.TextChoices):
    COLLECTING  = 'collecting',   '采集中'
    COLLECTED   = 'collected',    '采集完成'
    INJECTING   = 'injecting',    '注入中'
    INJECTED    = 'injected',     '注入完成'
    PARTIAL     = 'partial',      '部分注入'
    ROLLED_BACK = 'rolled_back',  '已回滚'
    FAILED      = 'failed',       '失败'


class EkbImportBatch(models.Model):
    """
    易快报数据导入批次

    每次执行 export_ekuaibao_full 创建一个批次。
    批次是回滚的最小单位。backup_path 保存 JSON 文件目录。
    """

    class Meta:
        db_table = 't_ekb_import_batch'
        verbose_name = '易快报导入批次'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['batch_no'], name='ekb_batch_no_idx'),
            models.Index(fields=['status', 'create_time'], name='ekb_batch_status_idx'),
        ]

    batch_no = models.CharField(
        '批次号', max_length=50, unique=True,
        help_text='格式: YYYYMMDD_HHMMSS，如 20260318_143000',
    )
    phase = models.CharField(
        '采集阶段', max_length=20, default='',
        help_text='phase0/phase1/phase2/phase3/phase4/incremental',
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=EkbBatchStatus.choices,
        default=EkbBatchStatus.COLLECTING,
    )
    modules = models.JSONField('采集模块列表', default=list)
    module_stats = models.JSONField('各模块记录数', default=dict)
    backup_path = models.CharField(
        'JSON备份目录', max_length=500, blank=True, default='',
        help_text='相对 backend/ 的路径',
    )
    total_records = models.IntegerField('总记录数', default=0)
    injected_records = models.IntegerField('已注入记录数', default=0)
    conflict_count = models.IntegerField('冲突记录数', default=0)
    skipped_count = models.IntegerField('跳过记录数', default=0)
    operator = models.CharField('操作人', max_length=100, blank=True, default='system')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    collected_at = models.DateTimeField('采集完成时间', null=True, blank=True)
    injected_at = models.DateTimeField('注入完成时间', null=True, blank=True)
    rolled_back_at = models.DateTimeField('回滚时间', null=True, blank=True)

    def __str__(self):
        return f'EkbBatch[{self.batch_no}] {self.status} ({self.total_records}条)'

    def get_summary(self) -> dict:
        return {
            'batch_no': self.batch_no,
            'phase': self.phase,
            'status': self.status,
            'total': self.total_records,
            'injected': self.injected_records,
            'conflicts': self.conflict_count,
            'skipped': self.skipped_count,
            'backup_path': self.backup_path,
        }


class EkbRawRecord(models.Model):
    """
    易快报原始数据记录（不可修改，永久保留）

    存储从易快报 API 采集的每条原始数据，字段不做任何加工。
    是回滚、审计、重新注入的数据基础。
    checksum 用于检测数据变更（增量更新时对比）。
    """

    class Meta:
        db_table = 't_ekb_raw_record'
        verbose_name = '易快报原始数据'
        ordering = ['-scraped_at']
        indexes = [
            models.Index(fields=['batch', 'module'], name='ekb_raw_batch_module_idx'),
            models.Index(fields=['module', 'ekb_id'], name='ekb_raw_module_id_idx'),
            models.Index(fields=['checksum'], name='ekb_raw_checksum_idx'),
            models.Index(fields=['module', 'injection_status'], name='ekb_raw_inject_idx'),
        ]

    batch = models.ForeignKey(
        EkbImportBatch, on_delete=models.PROTECT,
        related_name='raw_records', verbose_name='所属批次',
    )
    module = models.CharField(
        '数据模块', max_length=50,
        help_text='corporation/departments/staffs/flows/budgets/...',
    )
    ekb_id = models.CharField(
        '易快报内部ID', max_length=200,
        help_text='易快报系统中的原始记录 ID',
    )
    raw_data = models.JSONField('原始数据', help_text='完整原始字段，不做任何加工')
    scraped_at = models.DateTimeField('采集时间')
    checksum = models.CharField(
        '数据指纹', max_length=64,
        help_text='SHA256(json.dumps(raw_data, sort_keys=True))',
    )
    source_updated_at = models.DateTimeField(
        '源数据更新时间', null=True, blank=True,
        help_text='易快报记录的 updateTime 字段（用于增量判断）',
    )
    injection_status = models.CharField(
        '注入状态', max_length=20, default='pending',
        help_text='pending/injected/skipped/conflict/failed',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'EkbRaw[{self.module}:{self.ekb_id}] @{self.batch.batch_no}'

    def compute_checksum(self) -> str:
        import hashlib
        import json
        data_str = json.dumps(self.raw_data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(data_str.encode('utf-8')).hexdigest()


# ============================================================================
# Layer 3: 暂存层（冲突审核）
# ============================================================================

class EkbConflictType(models.TextChoices):
    EXACT_ID   = 'exact_id',   '编号精确匹配'
    EXACT_NAME = 'exact_name', '名称精确匹配'
    FUZZY_NAME = 'fuzzy_name', '名称相似匹配'
    DUPLICATE  = 'duplicate',  '易快报内部重复'
    DUAL_TRACK = 'dual_track', '双轨期间人工录入重复'


class EkbConflictResolution(models.TextChoices):
    PENDING      = 'pending',      '待审核'
    USE_EKB      = 'use_ekb',      '使用易快报数据'
    USE_EXISTING = 'use_existing', '保留现有数据'
    MANUAL_MERGE = 'manual_merge', '人工合并后注入'
    SKIP         = 'skip',         '跳过不注入'


class EkbConflict(models.Model):
    """
    易快报数据冲突记录

    当易快报数据与新系统已有数据存在相同/相似记录时创建。
    resolution 字段由管理员在审核界面处理。
    """

    class Meta:
        db_table = 't_ekb_conflict'
        verbose_name = '易快报数据冲突'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['batch', 'module'], name='ekb_conflict_batch_mod_idx'),
            models.Index(fields=['resolution'], name='ekb_conflict_resolution_idx'),
            models.Index(fields=['module', 'conflict_type'], name='ekb_conflict_type_idx'),
        ]

    batch = models.ForeignKey(
        EkbImportBatch, on_delete=models.CASCADE,
        related_name='conflicts', verbose_name='所属批次',
    )
    raw_record = models.ForeignKey(
        EkbRawRecord, on_delete=models.CASCADE,
        related_name='conflicts', verbose_name='原始记录',
    )
    module = models.CharField('数据模块', max_length=50)
    ekb_id = models.CharField('易快报内部ID', max_length=200)
    conflict_type = models.CharField(
        '冲突类型', max_length=30,
        choices=EkbConflictType.choices,
    )
    similarity_score = models.FloatField(
        '相似度', default=1.0,
        help_text='0.0~1.0，精确匹配为1.0',
    )

    ekb_data = models.JSONField('易快报数据')
    existing_record_id = models.IntegerField('新系统已有记录ID', null=True, blank=True)
    existing_table = models.CharField('新系统表名', max_length=100, blank=True, default='')
    existing_data = models.JSONField('新系统已有数据', default=dict)
    diff_fields = models.JSONField(
        '差异字段', default=list,
        help_text='[{"field": "name", "ekb": "A", "existing": "B"}]',
    )

    resolution = models.CharField(
        '处理决策', max_length=20,
        choices=EkbConflictResolution.choices,
        default=EkbConflictResolution.PENDING,
    )
    resolved_by_id = models.IntegerField('处理人ID', null=True, blank=True)
    resolved_at = models.DateTimeField('处理时间', null=True, blank=True)
    resolution_note = models.TextField('处理备注', blank=True, default='')
    merged_data = models.JSONField(
        '合并后数据', default=dict, blank=True,
        help_text='manual_merge 时填写最终要注入的数据',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'EkbConflict[{self.module}:{self.ekb_id}] {self.conflict_type} → {self.resolution}'

    def is_resolved(self) -> bool:
        return self.resolution != EkbConflictResolution.PENDING


# ============================================================================
# Layer 4: 注入层（前值快照 + 回滚支持）
# ============================================================================

class EkbInjectionAction(models.TextChoices):
    CREATED = 'created', '新建'
    UPDATED = 'updated', '更新'
    LINKED  = 'linked',  '关联'


class EkbInjectionLog(models.Model):
    """
    易快报数据注入追踪日志

    每条注入操作都记录到这里，保存注入前的字段快照（before_data）。
    是三级回滚的执行依据：
      - 全量回滚：按 batch 查询所有注入日志逐条还原
      - 模块回滚：按 batch + module 过滤
      - 单条回滚：按 id 精确还原

    回滚逻辑：
      - action=created: 删除 target_id 对应记录
      - action=updated: 用 before_data 覆盖 target_id 对应记录的字段
      - action=linked:  删除关联关系
    """

    class Meta:
        db_table = 't_ekb_injection_log'
        verbose_name = '易快报注入日志'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['batch', 'module'], name='ekb_inj_batch_mod_idx'),
            models.Index(fields=['target_table', 'target_id'], name='ekb_inj_target_idx'),
            models.Index(fields=['rolled_back', 'create_time'], name='ekb_inj_rollback_idx'),
            models.Index(fields=['ekb_id'], name='ekb_inj_ekb_id_idx'),
            models.Index(fields=['target_workstation'], name='ekb_inj_workstation_idx'),
        ]

    batch = models.ForeignKey(
        EkbImportBatch, on_delete=models.PROTECT,
        related_name='injection_logs', verbose_name='所属批次',
    )
    raw_record = models.ForeignKey(
        EkbRawRecord, on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='injection_logs', verbose_name='原始记录',
    )
    module = models.CharField('数据模块', max_length=50)
    ekb_id = models.CharField('易快报内部ID', max_length=200)

    target_table = models.CharField(
        '目标表名', max_length=100,
        help_text='如 t_expense_request / t_project_budget / t_subject_payment',
    )
    target_id = models.IntegerField('目标记录ID', help_text='注入后在业务表中的主键')
    action = models.CharField('注入操作', max_length=20, choices=EkbInjectionAction.choices)

    # 注入归属的工作台（便于按工作台维度统计与回滚）
    target_workstation = models.CharField(
        '目标工作台', max_length=30, blank=True, default='',
        help_text='finance/research/recruitment/hr/execution/quality',
    )

    before_data = models.JSONField(
        '注入前数据快照', default=dict,
        help_text='action=updated 时保存被覆盖字段的原值；action=created 时为空 dict',
    )
    after_data = models.JSONField('注入数据', default=dict)

    rolled_back = models.BooleanField('已回滚', default=False)
    rolled_back_at = models.DateTimeField('回滚时间', null=True, blank=True)
    rollback_by = models.CharField('回滚操作人', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        status = '已回滚' if self.rolled_back else '有效'
        return (
            f'EkbInjLog[{self.module}:{self.ekb_id}] '
            f'{self.action} → {self.target_table}#{self.target_id} [{status}]'
        )


# ============================================================================
# 附件索引（Phase 4）
# ============================================================================

class EkbAttachmentIndex(models.Model):
    """
    易快报附件索引

    存储从易快报下载的附件的元数据和本地路径。
    不直接散落到业务表，通过 flow_id 关联单据。
    """

    class Meta:
        db_table = 't_ekb_attachment_index'
        verbose_name = '易快报附件索引'
        indexes = [
            models.Index(fields=['flow_id'], name='ekb_att_flow_idx'),
            models.Index(fields=['attachment_id'], name='ekb_att_id_idx'),
        ]

    batch = models.ForeignKey(
        EkbImportBatch, on_delete=models.PROTECT,
        related_name='attachments', verbose_name='所属批次',
    )
    flow_id = models.CharField('单据ID', max_length=200, db_index=True)
    attachment_id = models.CharField('附件ID', max_length=200, unique=True)
    file_name = models.CharField('文件名', max_length=500)
    file_size = models.IntegerField('文件大小(bytes)', default=0)
    file_type = models.CharField('文件类型', max_length=50, blank=True, default='')
    local_path = models.CharField('本地存储路径', max_length=1000, blank=True, default='')
    download_status = models.CharField(
        '下载状态', max_length=20, default='pending',
        help_text='pending/downloaded/failed',
    )
    checksum = models.CharField('文件指纹SHA256', max_length=64, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'EkbAtt[{self.flow_id}] {self.file_name}'


# ============================================================================
# 双轨对账检查点
# ============================================================================

class EkbSyncCheckpoint(models.Model):
    """
    双轨增量同步检查点

    用于 sync_ekuaibao_incremental 命令记录上次成功同步的时间戳。
    每个模块一条记录，支持断点续传。
    """

    class Meta:
        db_table = 't_ekb_sync_checkpoint'
        verbose_name = '易快报同步检查点'

    module = models.CharField('数据模块', max_length=50, unique=True)
    last_sync_at = models.DateTimeField('上次同步时间', null=True, blank=True)
    last_batch_no = models.CharField('上次批次号', max_length=50, blank=True, default='')
    last_record_count = models.IntegerField('上次同步记录数', default=0)
    consecutive_stable_days = models.IntegerField(
        '连续稳定对账天数', default=0,
        help_text='双轨期间连续 N 天对账差异为0时，建议切换到新系统为主',
    )

    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'EkbCheckpoint[{self.module}] last={self.last_sync_at}'


# ============================================================================
# 飞书版易快报 Web Session Token（持久化）
# ============================================================================

class EkbWebSession(models.Model):
    """
    易快报飞书版 Web Session Token 持久化

    通过 飞书 OAuth code → ebridge/auth/feishu/toEkbIndex 获得 web session token，
    可通过 /api/account/v2/session/getAccessToken 刷新（最长 7 天/604800 秒）。

    使用方：EkbFeishuClient（ekb_client.py）
    """

    class Meta:
        db_table = 't_ekb_web_session'
        verbose_name = '易快报飞书版会话'

    corp_id = models.CharField('企业ID', max_length=100, unique=True)
    web_token = models.CharField('Web Session Token', max_length=500)
    feishu_open_id = models.CharField('飞书 open_id', max_length=100, blank=True, default='')
    feishu_staff_name = models.CharField('员工姓名', max_length=100, blank=True, default='')
    token_expires_at = models.DateTimeField('Token 过期时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'EkbWebSession[{self.corp_id}] {self.feishu_staff_name} expires={self.token_expires_at}'

    @classmethod
    def get_valid_token(cls, corp_id: str = 'nYA6xdjChA7c00') -> Optional[str]:
        """获取有效 token，过期返回 None"""
        from django.utils import timezone
        try:
            obj = cls.objects.get(corp_id=corp_id)
            if obj.token_expires_at and obj.token_expires_at > timezone.now():
                return obj.web_token
        except cls.DoesNotExist:
            pass
        return None

    @classmethod
    def save_token(cls, corp_id: str, token: str, open_id: str = '',
                   staff_name: str = '', expire_seconds: int = 604800):
        """保存或更新 token"""
        from django.utils import timezone
        import datetime
        expires_at = timezone.now() + datetime.timedelta(seconds=expire_seconds - 300)
        obj, _ = cls.objects.update_or_create(
            corp_id=corp_id,
            defaults={
                'web_token': token,
                'feishu_open_id': open_id,
                'feishu_staff_name': staff_name,
                'token_expires_at': expires_at,
            }
        )
        return obj
