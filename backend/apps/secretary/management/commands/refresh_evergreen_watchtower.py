import json

from django.core.management.base import BaseCommand

from apps.secretary.evergreen_watchtower import build_watchtower_summary, persist_watchtower_scan


class Command(BaseCommand):
    help = '扫描最新模型 / Claw / 最佳实践来源，并写入 watchtower 报告'

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='输出 JSON')

    def handle(self, *args, **options):
        summary = build_watchtower_summary()
        ids = persist_watchtower_scan(summary['sources'])
        payload = {'report_ids': ids, **summary}
        if options['json']:
            self.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
            return

        self.stdout.write(self.style.MIGRATE_HEADING('Evergreen Watchtower'))
        self.stdout.write(f"ok_count: {summary['ok_count']}")
        self.stdout.write(f"issue_count: {summary['issue_count']}")
        self.stdout.write(f"report_ids: {ids}")
