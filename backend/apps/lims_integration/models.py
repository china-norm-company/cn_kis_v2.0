"""
LIMS 集成模型

管理与外部 LIMS 系统的连接配置、同步日志、数据映射。

安全架构（四层）：
  Layer 1 采集层  → lims_fetcher.py 只读爬取
  Layer 2 备份层  → LimsImportBatch + RawLimsRecord（原始数据永久保留）+ JSON 文件
  Layer 3 暂存层  → LimsConflict（冲突人工审核）
  Layer 4 注入层  → LimsInjectionLog（前值快照，支持三级回滚）
"""
from django.db import models


class SyncStatus(models.TextChoices):
    CONNECTED = 'connected', '已连接'
    DISCONNECTED = 'disconnected', '已断开'
    SYNCING = 'syncing', '同步中'
    ERROR = 'error', '错误'


class LIMSConnection(models.Model):
    """LIMS 系统连接配置"""

    class Meta:
        db_table = 't_lims_connection'
        verbose_name = 'LIMS连接'

    name = models.CharField('LIMS名称', max_length=200)
    api_base_url = models.URLField('API 基础 URL', max_length=500)
    api_key = models.CharField('API密钥', max_length=500, blank=True, default='')
    auth_type = models.CharField('认证方式', max_length=50, default='api_key',
                                 help_text='api_key/oauth2/basic')
    status = models.CharField('连接状态', max_length=20, choices=SyncStatus.choices,
                              default=SyncStatus.DISCONNECTED)
    last_sync_at = models.DateTimeField('上次同步时间', null=True, blank=True)
    sync_interval_minutes = models.IntegerField('同步间隔（分钟）', default=5)
    is_active = models.BooleanField('是否启用', default=True)
    config = models.JSONField('扩展配置', default=dict, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.name} [{self.status}]'


class LIMSSyncLog(models.Model):
    """LIMS 同步日志"""

    class Meta:
        db_table = 't_lims_sync_log'
        verbose_name = 'LIMS同步日志'
        ordering = ['-create_time']

    connection = models.ForeignKey(LIMSConnection, on_delete=models.CASCADE,
                                   related_name='sync_logs')
    sync_type = models.CharField('同步类型', max_length=50,
                                 help_text='calibration/environment/instrument_data')
    status = models.CharField('同步状态', max_length=20, choices=SyncStatus.choices)
    records_synced = models.IntegerField('同步记录数', default=0)
    error_message = models.TextField('错误信息', blank=True, default='')
    retry_count = models.IntegerField('重试次数', default=0)
    details = models.JSONField('详情', default=dict, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    finish_time = models.DateTimeField('完成时间', null=True, blank=True)

    def __str__(self):
        return f'{self.connection.name} {self.sync_type} [{self.status}]'


class InstrumentDataSource(models.TextChoices):
    VISIA = 'visia', 'VISIA-CR'
    CORNEOMETER = 'corneometer', 'Corneometer'
    CUTOMETER = 'cutometer', 'Cutometer'
    MEXAMETER = 'mexameter', 'Mexameter'
    TEWAMETER = 'tewameter', 'Tewameter'
    SEBUMETER = 'sebumeter', 'Sebumeter'
    CUSTOM = 'custom', '自定义'


class InstrumentDataSession(models.Model):
    """
    仪器数据采集会话

    每次仪器检测对应一个 session，关联受试者、检测方法和操作人。
    """

    class Meta:
        db_table = 't_instrument_data_session'
        verbose_name = '仪器数据采集会话'
        ordering = ['-session_time']
        indexes = [
            models.Index(fields=['subject_id', 'session_time']),
            models.Index(fields=['instrument_type', 'session_time']),
            models.Index(fields=['operator_id']),
        ]

    instrument_type = models.CharField(
        '仪器类型', max_length=30,
        choices=InstrumentDataSource.choices,
        default=InstrumentDataSource.VISIA,
    )
    instrument_serial = models.CharField('仪器序列号', max_length=100, blank=True, default='')
    subject_id = models.IntegerField('受试者ID', db_index=True)
    visit_id = models.IntegerField('访视ID', null=True, blank=True)
    work_order_id = models.IntegerField('工单ID', null=True, blank=True)
    operator_id = models.IntegerField('操作人ID', null=True, blank=True)
    session_time = models.DateTimeField('采集时间')
    raw_file_path = models.CharField('原始文件路径', max_length=500, blank=True, default='')
    parsed = models.BooleanField('是否已解析', default=False)
    parse_error = models.TextField('解析错误', blank=True, default='')
    metadata = models.JSONField('扩展元数据', default=dict, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.get_instrument_type_display()} S{self.subject_id} @{self.session_time}'


class InstrumentMeasurement(models.Model):
    """
    仪器测量数据点

    每个 session 可包含多个测量指标（如 VISIA 的多维分析结果）。
    """

    class Meta:
        db_table = 't_instrument_measurement'
        verbose_name = '仪器测量数据'
        ordering = ['session', 'metric_name']
        indexes = [
            models.Index(fields=['session', 'metric_name']),
        ]

    session = models.ForeignKey(
        InstrumentDataSession, on_delete=models.CASCADE,
        related_name='measurements',
    )
    metric_name = models.CharField('指标名称', max_length=100)
    metric_value = models.FloatField('测量值')
    unit = models.CharField('单位', max_length=30, blank=True, default='')
    zone = models.CharField('检测区域', max_length=50, blank=True, default='',
                            help_text='面部区域如 forehead/cheek_l/cheek_r/chin')
    percentile = models.FloatField('百分位', null=True, blank=True,
                                   help_text='相对同龄人群的百分位排名')
    reference_range = models.JSONField('参考范围', default=dict, blank=True,
                                       help_text='{"min": x, "max": y}')
    metadata = models.JSONField('扩展数据', default=dict, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.metric_name}={self.metric_value}{self.unit} [{self.zone}]'


# ============================================================================
# Layer 2: 原始备份层（不可变）
# ============================================================================

class BatchStatus(models.TextChoices):
    COLLECTING = 'collecting', '采集中'
    COLLECTED = 'collected', '采集完成'
    INJECTING = 'injecting', '注入中'
    INJECTED = 'injected', '注入完成'
    PARTIAL = 'partial', '部分注入'
    ROLLED_BACK = 'rolled_back', '已回滚'
    FAILED = 'failed', '失败'


class LimsImportBatch(models.Model):
    """
    LIMS 数据导入批次

    每次执行 fetch_lims_data 命令创建一个批次。
    批次是回滚的最小单位。备份路径保存 JSON 文件目录。
    """

    class Meta:
        db_table = 't_lims_import_batch'
        verbose_name = 'LIMS导入批次'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['batch_no'], name='lims_batch_no_idx'),
            models.Index(fields=['status', 'create_time'], name='lims_batch_status_idx'),
        ]

    batch_no = models.CharField('批次号', max_length=50, unique=True,
                                help_text='格式: YYYYMMDD_HHMMSS，如 20260318_143000')
    status = models.CharField('状态', max_length=20, choices=BatchStatus.choices,
                              default=BatchStatus.COLLECTING)
    modules = models.JSONField('采集模块列表', default=list,
                               help_text='["equipment","personnel","commission",...]')
    module_stats = models.JSONField('各模块记录数', default=dict,
                                   help_text='{"equipment": 45, "personnel": 23, ...}')
    backup_path = models.CharField('JSON备份目录', max_length=500, blank=True, default='',
                                   help_text='相对 backend/ 的路径，如 data/lims_backup/20260318_143000')
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
        return f'Batch[{self.batch_no}] {self.status} ({self.total_records}条)'

    def get_summary(self) -> dict:
        return {
            'batch_no': self.batch_no,
            'status': self.status,
            'total': self.total_records,
            'injected': self.injected_records,
            'conflicts': self.conflict_count,
            'skipped': self.skipped_count,
            'backup_path': self.backup_path,
        }


class RawLimsRecord(models.Model):
    """
    LIMS 原始数据记录（不可修改，永久保留）

    存储从 LIMS 爬取的每条原始数据，字段不做任何加工。
    是回滚、审计、重新注入的数据基础。
    checksum 用于检测 LIMS 端数据是否发生变更（增量更新时对比）。
    """

    class Meta:
        db_table = 't_raw_lims_record'
        verbose_name = 'LIMS原始数据'
        ordering = ['-scraped_at']
        indexes = [
            models.Index(fields=['batch', 'module'], name='lims_raw_batch_module_idx'),
            models.Index(fields=['module', 'lims_id'], name='lims_raw_module_id_idx'),
            models.Index(fields=['checksum'], name='lims_raw_checksum_idx'),
        ]

    batch = models.ForeignKey(LimsImportBatch, on_delete=models.PROTECT,
                              related_name='raw_records', verbose_name='所属批次')
    module = models.CharField('数据模块', max_length=50,
                              help_text='equipment/personnel/commission/client/sample/'
                                        'standard/calibration/training/material/quality_doc/'
                                        'supplier/report')
    lims_id = models.CharField('LIMS内部ID', max_length=200,
                               help_text='LIMS 系统中的原始记录 ID 或唯一标识')
    lims_page_url = models.CharField('采集来源URL', max_length=500, blank=True, default='')
    raw_data = models.JSONField('原始数据', help_text='完整原始字段，不做任何加工')
    scraped_at = models.DateTimeField('采集时间')
    checksum = models.CharField('数据指纹', max_length=64,
                                help_text='SHA256(json.dumps(raw_data, sort_keys=True))')
    injection_status = models.CharField('注入状态', max_length=20, default='pending',
                                        help_text='pending/injected/skipped/conflict/failed')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'RawLims[{self.module}:{self.lims_id}] @{self.batch.batch_no}'

    def compute_checksum(self) -> str:
        import hashlib
        import json
        data_str = json.dumps(self.raw_data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(data_str.encode('utf-8')).hexdigest()


# ============================================================================
# Layer 3: 暂存层（冲突审核）
# ============================================================================

class ConflictType(models.TextChoices):
    EXACT_CODE = 'exact_code', '编号精确匹配'
    EXACT_NAME = 'exact_name', '名称精确匹配'
    FUZZY_NAME = 'fuzzy_name', '名称相似匹配'
    DUPLICATE_IN_LIMS = 'duplicate_in_lims', 'LIMS内部重复'


class ConflictResolution(models.TextChoices):
    PENDING = 'pending', '待审核'
    USE_LIMS = 'use_lims', '使用LIMS数据'
    USE_EXISTING = 'use_existing', '保留现有数据'
    MANUAL_MERGE = 'manual_merge', '人工合并后注入'
    SKIP = 'skip', '跳过不注入'


class LimsConflict(models.Model):
    """
    LIMS 数据冲突记录

    当 LIMS 数据与新系统已有数据存在相同/相似记录时创建此记录。
    resolution 字段由管理员在后台审核界面处理。
    处理结果会触发对应的注入或跳过操作。
    """

    class Meta:
        db_table = 't_lims_conflict'
        verbose_name = 'LIMS数据冲突'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['batch', 'module'], name='lims_conflict_batch_mod_idx'),
            models.Index(fields=['resolution'], name='lims_conflict_resolution_idx'),
            models.Index(fields=['module', 'conflict_type'], name='lims_conflict_type_idx'),
        ]

    batch = models.ForeignKey(LimsImportBatch, on_delete=models.CASCADE,
                              related_name='conflicts', verbose_name='所属批次')
    raw_record = models.ForeignKey(RawLimsRecord, on_delete=models.CASCADE,
                                   related_name='conflicts', verbose_name='原始记录')
    module = models.CharField('数据模块', max_length=50)
    lims_id = models.CharField('LIMS内部ID', max_length=200)
    conflict_type = models.CharField('冲突类型', max_length=30,
                                     choices=ConflictType.choices)
    similarity_score = models.FloatField('相似度', default=1.0,
                                         help_text='0.0~1.0，精确匹配为1.0')

    lims_data = models.JSONField('LIMS数据')
    existing_record_id = models.IntegerField('新系统已有记录ID', null=True, blank=True)
    existing_table = models.CharField('新系统表名', max_length=100, blank=True, default='')
    existing_data = models.JSONField('新系统已有数据', default=dict)
    diff_fields = models.JSONField('差异字段', default=list,
                                   help_text='[{"field": "name", "lims": "A", "existing": "B"}]')

    resolution = models.CharField('处理决策', max_length=20,
                                  choices=ConflictResolution.choices,
                                  default=ConflictResolution.PENDING)
    resolved_by_id = models.IntegerField('处理人ID', null=True, blank=True)
    resolved_at = models.DateTimeField('处理时间', null=True, blank=True)
    resolution_note = models.TextField('处理备注', blank=True, default='')
    merged_data = models.JSONField('合并后数据', default=dict, blank=True,
                                   help_text='manual_merge 时填写最终要注入的数据')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'Conflict[{self.module}:{self.lims_id}] {self.conflict_type} → {self.resolution}'

    def is_resolved(self) -> bool:
        return self.resolution != ConflictResolution.PENDING


# ============================================================================
# Layer 4: 注入层（前值快照 + 回滚支持）
# ============================================================================

class InjectionAction(models.TextChoices):
    CREATED = 'created', '新建'
    UPDATED = 'updated', '更新'
    LINKED = 'linked', '关联'


class LimsInjectionLog(models.Model):
    """
    LIMS 数据注入追踪日志

    每条注入操作都记录到这里，保存注入前的字段快照（before_data）。
    是三级回滚的执行依据：
      - 全量回滚：按 batch 查询所有注入日志逐条还原
      - 模块回滚：按 batch + module 过滤
      - 单条回滚：按 id 精确还原

    回滚逻辑：
      - action=created: 删除 target_id 对应记录
      - action=updated: 用 before_data 覆盖 target_id 对应记录的字段
      - action=linked:  删除关联关系（如 LabStaffProfile FK）
    """

    class Meta:
        db_table = 't_lims_injection_log'
        verbose_name = 'LIMS注入日志'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['batch', 'module'], name='lims_inj_batch_mod_idx'),
            models.Index(fields=['target_table', 'target_id'], name='lims_inj_target_idx'),
            models.Index(fields=['rolled_back', 'create_time'], name='lims_inj_rollback_idx'),
            models.Index(fields=['lims_id'], name='lims_inj_lims_id_idx'),
        ]

    batch = models.ForeignKey(LimsImportBatch, on_delete=models.PROTECT,
                              related_name='injection_logs', verbose_name='所属批次')
    raw_record = models.ForeignKey(RawLimsRecord, on_delete=models.PROTECT,
                                   null=True, blank=True,
                                   related_name='injection_logs', verbose_name='原始记录')
    module = models.CharField('数据模块', max_length=50)
    lims_id = models.CharField('LIMS内部ID', max_length=200)

    target_table = models.CharField('目标表名', max_length=100,
                                    help_text='如 t_resource_item / t_account / t_protocol')
    target_id = models.IntegerField('目标记录ID', help_text='注入后在业务表中的主键')
    action = models.CharField('注入操作', max_length=20, choices=InjectionAction.choices)

    before_data = models.JSONField('注入前数据快照', default=dict,
                                   help_text='action=updated 时保存被覆盖字段的原值；'
                                             'action=created 时为空 dict')
    after_data = models.JSONField('注入数据', default=dict,
                                  help_text='实际写入业务表的字段值')

    rolled_back = models.BooleanField('已回滚', default=False)
    rolled_back_at = models.DateTimeField('回滚时间', null=True, blank=True)
    rollback_by = models.CharField('回滚操作人', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        status = '已回滚' if self.rolled_back else '有效'
        return (f'InjLog[{self.module}:{self.lims_id}] '
                f'{self.action} → {self.target_table}#{self.target_id} [{status}]')

