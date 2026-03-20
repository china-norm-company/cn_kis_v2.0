"""
设施环境管理工作台 — 扩展模型

新增模型：
- EnvironmentIncident（不合规事件）
- CleaningRecord（清洁记录）

现有模型增强通过字段扩展实现（VenueEnvironmentLog / VenueReservation）
"""
from django.db import models


class IncidentSeverity(models.TextChoices):
    MINOR = 'minor', '轻微'
    MAJOR = 'major', '一般'
    CRITICAL = 'critical', '严重'


class IncidentStatus(models.TextChoices):
    OPEN = 'open', '待处理'
    INVESTIGATING = 'investigating', '调查中'
    CORRECTED = 'corrected', '已纠正'
    CLOSED = 'closed', '已关闭'


class EnvironmentIncident(models.Model):
    """
    环境不合规事件

    记录温湿度偏差事件的完整生命周期：
    发现 → 调查 → 纠正 → 关闭
    """

    class Meta:
        db_table = 't_environment_incident'
        verbose_name = '不合规事件'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['venue', 'status']),
            models.Index(fields=['severity']),
            models.Index(fields=['create_time']),
        ]

    incident_no = models.CharField('事件编号', max_length=50, unique=True)
    venue = models.ForeignKey(
        'resource.ResourceItem', on_delete=models.CASCADE,
        related_name='incidents', verbose_name='场地',
    )
    severity = models.CharField('严重级别', max_length=20,
                                choices=IncidentSeverity.choices,
                                default=IncidentSeverity.MINOR)
    status = models.CharField('状态', max_length=20,
                              choices=IncidentStatus.choices,
                              default=IncidentStatus.OPEN)
    title = models.CharField('事件标题', max_length=200)
    description = models.TextField('事件描述', blank=True, default='')
    deviation_param = models.CharField('偏离参数', max_length=200, blank=True, default='')
    deviation_duration = models.CharField('偏离时长', max_length=100, blank=True, default='')
    affected_tests = models.TextField('影响的测试', blank=True, default='')
    root_cause = models.TextField('根因分析', blank=True, default='')
    corrective_action = models.TextField('纠正措施', blank=True, default='')
    preventive_action = models.TextField('预防措施', blank=True, default='')
    reporter_id = models.IntegerField('报告人ID', null=True, blank=True)
    reporter_name = models.CharField('报告人', max_length=100, blank=True, default='')
    assigned_to_id = models.IntegerField('负责人ID', null=True, blank=True)
    assigned_to_name = models.CharField('负责人', max_length=100, blank=True, default='')
    discovered_at = models.DateTimeField('发现时间', null=True, blank=True)
    closed_at = models.DateTimeField('关闭时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.incident_no} {self.title}'


class CleaningType(models.TextChoices):
    DAILY = 'daily', '日常清洁'
    BETWEEN = 'between', '场次间清洁'
    DEEP = 'deep', '深度清洁'
    SPECIAL = 'special', '特殊清洁'


class CleaningStatus(models.TextChoices):
    PENDING = 'pending', '待执行'
    COMPLETED = 'completed', '已完成'
    VERIFIED = 'verified', '已验证'


class CleaningRecord(models.Model):
    """
    清洁记录

    记录测试区域的清洁执行情况。
    """

    class Meta:
        db_table = 't_cleaning_record'
        verbose_name = '清洁记录'
        ordering = ['-cleaning_date', '-create_time']
        indexes = [
            models.Index(fields=['venue', 'cleaning_date']),
            models.Index(fields=['cleaning_type']),
            models.Index(fields=['status']),
        ]

    venue = models.ForeignKey(
        'resource.ResourceItem', on_delete=models.CASCADE,
        related_name='cleaning_records', verbose_name='场地',
    )
    cleaning_type = models.CharField('清洁类型', max_length=20,
                                     choices=CleaningType.choices,
                                     default=CleaningType.DAILY)
    status = models.CharField('状态', max_length=20,
                              choices=CleaningStatus.choices,
                              default=CleaningStatus.PENDING)
    cleaner_name = models.CharField('清洁人员', max_length=100, blank=True, default='')
    cleaner_id = models.IntegerField('清洁人员ID', null=True, blank=True)
    verifier_name = models.CharField('验证人', max_length=100, blank=True, default='')
    verifier_id = models.IntegerField('验证人ID', null=True, blank=True)
    cleaning_date = models.DateField('清洁日期')
    cleaning_agents = models.CharField('使用清洁剂', max_length=500, blank=True, default='')
    checklist_items = models.IntegerField('检查项数', default=0)
    checklist_completed = models.IntegerField('已完成项数', default=0)
    env_confirmed = models.BooleanField('环境恢复确认', default=False)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.venue.name} {self.cleaning_date} {self.get_cleaning_type_display()}'


class VenueChangeLog(models.Model):
    """
    场地信息变更记录

    记录每次场地信息变更的前后快照，支持历史追溯。
    场地编号（code）为唯一值，不允许变更，仅记录在快照中。
    """

    class Meta:
        db_table = 't_venue_change_log'
        verbose_name = '场地变更记录'
        ordering = ['-change_time']
        indexes = [
            models.Index(fields=['venue']),
            models.Index(fields=['change_time']),
        ]

    venue = models.ForeignKey(
        'resource.ResourceItem', on_delete=models.CASCADE,
        related_name='change_logs', verbose_name='场地',
    )
    venue_code = models.CharField('场地编号', max_length=50, db_index=True)
    changed_by_id = models.IntegerField('变更人ID', null=True, blank=True)
    changed_by_name = models.CharField('变更人', max_length=100, blank=True, default='')
    change_time = models.DateTimeField('变更时间', auto_now_add=True)
    before_data = models.JSONField('变更前数据', default=dict)
    after_data = models.JSONField('变更后数据', default=dict)
    changed_fields = models.JSONField('变更字段列表', default=list)

    def __str__(self):
        return f'{self.venue_code} @ {self.change_time}'


class VenueUsageSchedule(models.Model):
    """
    房间使用时段设置

    用于在排程无法精确到房间使用时段时，手动配置房间的监控启用时段。
    监控仅在使用时段内生效。

    支持两种类型：
    - recurring: 按周重复，days_of_week=[0,1,2,3,4] 表示周一到周五
    - specific: 指定日期，specific_date 为具体某天
    """

    SCHEDULE_TYPE_RECURRING = 'recurring'
    SCHEDULE_TYPE_SPECIFIC = 'specific'

    class Meta:
        db_table = 't_venue_usage_schedule'
        verbose_name = '房间使用时段'
        ordering = ['venue', 'schedule_type', 'specific_date', 'start_time']
        indexes = [
            models.Index(fields=['venue']),
            models.Index(fields=['venue', 'schedule_type']),
            models.Index(fields=['specific_date']),
        ]

    venue = models.ForeignKey(
        'resource.ResourceItem', on_delete=models.CASCADE,
        related_name='usage_schedules', verbose_name='场地',
    )
    is_enabled = models.BooleanField('是否启用', default=True)
    schedule_type = models.CharField(
        '类型',
        max_length=20,
        choices=[
            (SCHEDULE_TYPE_RECURRING, '按周重复'),
            (SCHEDULE_TYPE_SPECIFIC, '指定日期'),
        ],
        default=SCHEDULE_TYPE_RECURRING,
    )
    # 按周重复时：0=周一, 1=周二, ..., 6=周日；如 [0,1,2,3,4] 表示工作日
    days_of_week = models.JSONField(
        '星期（多选）',
        default=list,
        help_text='[0,1,2,3,4] 周一到周五, [0,1,2,3,4,5,6] 每天',
    )
    # 指定日期时使用
    specific_date = models.DateField('指定日期', null=True, blank=True)
    start_time = models.TimeField('开始时间')
    end_time = models.TimeField('结束时间')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        if self.schedule_type == self.SCHEDULE_TYPE_SPECIFIC and self.specific_date:
            return f'{self.venue.name} {self.specific_date} {self.start_time}-{self.end_time}'
        days = self.days_of_week or []
        if not days:
            return f'{self.venue.name} (未配置) {self.start_time}-{self.end_time}'
        if set(days) == {0, 1, 2, 3, 4, 5, 6}:
            day_str = '每天'
        elif set(days) == {0, 1, 2, 3, 4}:
            day_str = '工作日'
        else:
            names = ['一', '二', '三', '四', '五', '六', '日']
            day_str = '、'.join(f'周{names[d]}' for d in sorted(days))
        return f'{self.venue.name} {day_str} {self.start_time}-{self.end_time}'


class VenueMonitorConfig(models.Model):
    """
    场地监控人配置

    环境异常时飞书消息将发送给配置的监控人。
    """

    class Meta:
        db_table = 't_venue_monitor_config'
        verbose_name = '场地监控人'
        ordering = ['venue', '-is_primary', 'id']
        unique_together = [['venue', 'monitor_account_id']]
        indexes = [
            models.Index(fields=['venue']),
        ]

    venue = models.ForeignKey(
        'resource.ResourceItem', on_delete=models.CASCADE,
        related_name='monitor_configs', verbose_name='场地',
    )
    monitor_account_id = models.IntegerField('监控人账号ID', db_index=True)
    is_primary = models.BooleanField('主监控人', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.venue.name} 监控人#{self.monitor_account_id}'
