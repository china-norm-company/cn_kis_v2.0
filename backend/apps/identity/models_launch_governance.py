"""
CN KIS V2.0 上线治理：问题与缺口、目标与节奏（鹿鸣治理台持久化）。

与飞书消息、GitHub Issue 互补：用于在系统内追踪责任域、验收与打开天数。
"""
from __future__ import annotations

from django.db import models


class LaunchGapStatus(models.TextChoices):
    OPEN = 'open', '待处理'
    IN_PROGRESS = 'in_progress', '处理中'
    RESOLVED = 'resolved', '已解决'
    WONT_FIX = 'wont_fix', '不处理'


class LaunchGoalScope(models.TextChoices):
    PHASE = 'phase', '阶段目标'
    WEEKLY = 'weekly', '周目标'


class LaunchGoalStatus(models.TextChoices):
    ACTIVE = 'active', '进行中'
    DONE = 'done', '已完成'
    CANCELLED = 'cancelled', '已取消'


class LaunchGovernanceGap(models.Model):
    """上线治理问题与缺口"""

    class Meta:
        db_table = 't_launch_governance_gap'
        ordering = ['-update_time', '-id']
        indexes = [
            models.Index(fields=['status', 'severity'], name='idx_launch_gap_status_sev'),
            models.Index(fields=['related_workstation'], name='idx_launch_gap_ws'),
        ]

    title = models.CharField('标题', max_length=500)
    description = models.TextField('描述', blank=True, default='')
    gap_type = models.CharField(
        '类型',
        max_length=64,
        blank=True,
        default='',
        help_text='如：流程断点、数据未激活、跨台协同缺失',
    )
    severity = models.CharField('严重度', max_length=32, default='medium')
    related_node = models.CharField('闭环节点', max_length=64, blank=True, default='')
    related_workstation = models.CharField('工作台', max_length=64, blank=True, default='')
    blocked_loop = models.BooleanField('阻塞主闭环', default=False)
    status = models.CharField(
        '状态',
        max_length=32,
        choices=LaunchGapStatus.choices,
        default=LaunchGapStatus.OPEN,
        db_index=True,
    )
    owner_domain = models.CharField('责任域', max_length=200, blank=True, default='')
    owner_account_id = models.IntegerField('责任人账号ID', null=True, blank=True)
    github_issue_url = models.URLField('GitHub Issue', max_length=500, blank=True, default='')
    feishu_ref = models.CharField('飞书引用', max_length=500, blank=True, default='')
    next_action = models.TextField('下一步动作', blank=True, default='')
    verification_status = models.CharField('验收状态', max_length=64, blank=True, default='pending')
    create_time = models.DateTimeField(auto_now_add=True)
    update_time = models.DateTimeField(auto_now=True)
    created_by_id = models.IntegerField('创建人', null=True, blank=True)

    def __str__(self) -> str:
        return f'LaunchGap#{self.id} {self.title[:40]}'


class LaunchGovernanceGoal(models.Model):
    """上线治理目标与节奏"""

    class Meta:
        db_table = 't_launch_governance_goal'
        ordering = ['-update_time', '-id']
        indexes = [
            models.Index(fields=['scope', 'status'], name='idx_launch_goal_scope_st'),
        ]

    title = models.CharField('标题', max_length=500)
    description = models.TextField('说明', blank=True, default='')
    scope = models.CharField(
        '范围',
        max_length=32,
        choices=LaunchGoalScope.choices,
        default=LaunchGoalScope.PHASE,
    )
    target_date = models.DateField('目标日期', null=True, blank=True)
    progress_percent = models.PositiveSmallIntegerField('进度%', default=0)
    status = models.CharField(
        '状态',
        max_length=32,
        choices=LaunchGoalStatus.choices,
        default=LaunchGoalStatus.ACTIVE,
        db_index=True,
    )
    gap_links = models.JSONField(
        '关联缺口ID',
        default=list,
        blank=True,
        help_text='LaunchGovernanceGap.id 列表',
    )
    rhythm_notes = models.TextField('节奏备注', blank=True, default='')
    create_time = models.DateTimeField(auto_now_add=True)
    update_time = models.DateTimeField(auto_now=True)
    created_by_id = models.IntegerField('创建人', null=True, blank=True)

    def __str__(self) -> str:
        return f'LaunchGoal#{self.id} {self.title[:40]}'
