from django.apps import AppConfig


class QualityConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.quality'
    verbose_name = '质量管理'

    def ready(self):
        import apps.quality.signals  # noqa: F401
