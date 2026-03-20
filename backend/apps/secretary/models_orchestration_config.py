"""
编排路由配置模型 — 领域→Agent、领域→技能、关键词→领域 的 DB 化。

替代 orchestration_service 中的 DOMAIN_AGENT_MAP / DOMAIN_CLAW_MAP / KEYWORD_DOMAIN_MAP 常量，
支持通过 UI/API 编辑与 reload_orchestration_config() 热更新。
"""
from django.db import models


class DomainAgentMapping(models.Model):
    """领域 → 负责 Agent 的映射（一对一）"""

    class Meta:
        db_table = 't_domain_agent_mapping'
        verbose_name = '领域Agent映射'
        ordering = ['-priority', 'domain_code']
        indexes = [
            models.Index(fields=['domain_code']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['domain_code'], name='uniq_domain_agent'),
        ]

    domain_code = models.CharField(
        '领域代码', max_length=64, unique=True, db_index=True,
        help_text='如：protocol, finance, quality',
    )
    agent_id = models.CharField(
        '智能体ID', max_length=100,
        help_text='如：protocol-agent',
    )
    display_name = models.CharField('展示名', max_length=120, blank=True, default='')
    priority = models.IntegerField('优先级', default=0, help_text='数值越大越优先')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.domain_code} → {self.agent_id}'


class DomainSkillMapping(models.Model):
    """领域 → 可调用的技能列表（多对多，按 priority 排序）"""

    class Meta:
        db_table = 't_domain_skill_mapping'
        verbose_name = '领域技能映射'
        ordering = ['-priority', 'skill_id']
        indexes = [
            models.Index(fields=['domain_code']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['domain_code', 'skill_id'],
                name='uniq_domain_skill',
            ),
        ]

    domain_code = models.CharField('领域代码', max_length=64, db_index=True)
    skill_id = models.CharField('技能ID', max_length=100)
    priority = models.IntegerField('优先级', default=0)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.domain_code} + {self.skill_id}'


class KeywordDomainMapping(models.Model):
    """关键词 → 领域（用于快速领域检测）"""

    class Meta:
        db_table = 't_keyword_domain_mapping'
        verbose_name = '关键词领域映射'
        indexes = [
            models.Index(fields=['keyword']),
            models.Index(fields=['domain_code']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['keyword'], name='uniq_keyword_domain'),
        ]

    keyword = models.CharField('关键词', max_length=64, unique=True, db_index=True)
    domain_code = models.CharField('领域代码', max_length=64, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.keyword} → {self.domain_code}'
