from django.apps import AppConfig


class SafetyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.safety'
    verbose_name = '安全管理'
