from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '刷新数字员工编排路由缓存'

    def handle(self, *args, **options):
        from apps.secretary.orchestration_service import reload_orchestration_config

        reload_orchestration_config()
        self.stdout.write(self.style.SUCCESS('orchestration config reloaded'))
