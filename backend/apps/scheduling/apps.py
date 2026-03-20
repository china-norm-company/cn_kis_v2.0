from django.apps import AppConfig


class SchedulingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.scheduling'
    verbose_name = '排程管理'

    def ready(self):
        import apps.scheduling.signals  # noqa: F401
