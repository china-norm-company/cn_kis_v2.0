"""
工作台绑定模型 — 工作台与 Agent/技能/快捷操作的 DB 化配置。

替代 digital_workforce_api.WORKSTATION_AGENTS 与 claw_registry workstations 硬编码。
"""
from django.db import models


class WorkstationBinding(models.Model):
    """工作台绑定：该工作台可用的 Agent、技能与快捷操作"""

    class Meta:
        db_table = 't_workstation_binding'
        verbose_name = '工作台绑定'
        indexes = [
            models.Index(fields=['workstation_key']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['workstation_key'], name='uniq_workstation_binding'),
        ]

    workstation_key = models.CharField(
        '工作台 key', max_length=64, unique=True, db_index=True,
        help_text='如：secretary, research, finance',
    )
    display_name = models.CharField('展示名称', max_length=120, blank=True, default='')
    agent_ids = models.JSONField(
        '绑定的 Agent ID 列表', default=list, blank=True,
        help_text='如：["general-assistant", "knowledge-agent"]',
    )
    skill_ids = models.JSONField(
        '绑定的技能 ID 列表', default=list, blank=True,
        help_text='如：["protocol-parser", "knowledge-hybrid-search"]',
    )
    quick_actions = models.JSONField(
        '快捷操作', default=list, blank=True,
        help_text='[{"id":"daily-brief","label":"今日简报","skill":"secretary-orchestrator","script":"generate_brief","icon":"newspaper"}]',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.workstation_key} ({self.display_name or self.workstation_key})'
