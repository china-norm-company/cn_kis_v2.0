import json

from django.core.management.base import BaseCommand

from apps.knowledge.prelaunch_factory import (
    build_prelaunch_factory_report,
    evaluate_prelaunch_factory_gate,
)


class Command(BaseCommand):
    help = '生成上线前知识工厂覆盖报告，并输出是否满足基础门禁'

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='输出 JSON')

    def handle(self, *args, **options):
        report = build_prelaunch_factory_report()
        gate = evaluate_prelaunch_factory_gate(report)
        payload = {**report, 'gate': gate}

        if options['json']:
            self.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
            return

        self.stdout.write(self.style.MIGRATE_HEADING('Prelaunch Knowledge Factory'))
        self.stdout.write(f"structured_entries: {report['structured_entries']}")
        self.stdout.write(f"authority_entries: {report['authority_entries']}")
        self.stdout.write(f"missing_tier0_packages: {', '.join(gate['missing_tier0_packages']) or 'none'}")
        self.stdout.write(self.style.SUCCESS('gate=PASS') if gate['passed'] else self.style.WARNING('gate=WARN'))
