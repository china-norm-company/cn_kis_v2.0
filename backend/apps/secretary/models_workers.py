from django.db import models


class DomainWorkerBlueprint(models.Model):
    """6 大领域数字员工样板注册表。"""

    domain_code = models.CharField(max_length=50, unique=True)
    display_name = models.CharField(max_length=120)
    workstation_hint = models.CharField(max_length=50, blank=True, default='')
    lead_agent_id = models.CharField(max_length=80, blank=True, default='')
    lead_skill_id = models.CharField(max_length=80, blank=True, default='')
    responsibilities = models.JSONField(default=list, blank=True)
    boundary_rules = models.JSONField(default=list, blank=True)
    collaboration_agents = models.JSONField(default=list, blank=True)
    tier0_topic_packages = models.JSONField(default=list, blank=True)
    evaluation_targets = models.JSONField(default=dict, blank=True)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_domain_worker_blueprint'
        verbose_name = '领域数字员工样板'
        verbose_name_plural = '领域数字员工样板'
        ordering = ['domain_code']

    def __str__(self):
        return f'{self.domain_code}: {self.display_name}'
