import json

from django.core.management.base import BaseCommand

from apps.secretary.evidence_gate_service import (
    build_evidence_gate_report,
    evaluate_evidence_gate,
    persist_evidence_gate,
)


class Command(BaseCommand):
    help = '运行数字员工准备度门禁，并持久化结果'

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='输出 JSON')

    def handle(self, *args, **options):
        report = build_evidence_gate_report()
        evaluation = evaluate_evidence_gate(report)
        gate_id = persist_evidence_gate(report, evaluation)
        payload = {'gate_id': gate_id, 'report': report, 'evaluation': evaluation}

        if options['json']:
            self.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
            return

        self.stdout.write(self.style.MIGRATE_HEADING('Digital Worker Gates'))
        self.stdout.write(f'gate_id: {gate_id}')
        self.stdout.write(f"knowledge_questions: {report['totals']['knowledge_questions']}")
        self.stdout.write(f"scenarios: {report['totals']['scenarios']}")
        self.stdout.write(f"long_chains: {report['totals']['long_chains']}")
        self.stdout.write(f"readiness_score: {report['totals']['readiness_score']}")
        self.stdout.write(self.style.SUCCESS('gate=PASS') if evaluation['passed'] else self.style.WARNING('gate=WARN'))
