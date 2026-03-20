"""
实验室人员管理 App 配置
"""
from django.apps import AppConfig


class LabPersonnelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.lab_personnel'
    verbose_name = '实验室人员管理'

    def ready(self):
        import apps.lab_personnel.signals  # noqa: F401
