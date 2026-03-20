from django.apps import AppConfig


class CrmConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.crm'
    verbose_name = '进思·客户台'

    def ready(self):
        import apps.crm.signals  # noqa: F401
