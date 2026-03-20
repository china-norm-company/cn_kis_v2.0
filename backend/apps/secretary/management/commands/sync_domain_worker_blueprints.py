from django.core.management.base import BaseCommand

from apps.secretary.domain_worker_service import sync_domain_worker_blueprints


class Command(BaseCommand):
    help = '将 6 大领域数字员工样板从 YAML 注册表同步到数据库'

    def handle(self, *args, **options):
        result = sync_domain_worker_blueprints()
        self.stdout.write(
            self.style.SUCCESS(
                f'domain workers synced: created={result["created"]} updated={result["updated"]}'
            )
        )
