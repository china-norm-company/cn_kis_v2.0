"""
一次性 / 运维：将已落库的执行订单同步到知情管理（与列表接口一致：按项目编号去重，每个编号仅取最新一条上传记录）。
"""
from django.core.management.base import BaseCommand

from apps.scheduling.api import _normalize_execution_order_data, _project_code_from_payload
from apps.scheduling.consent_sync import sync_execution_order_upload_to_consent
from apps.scheduling.models import ExecutionOrderUpload


class Command(BaseCommand):
    help = '将已上传的执行订单按项目编号（最新一条）同步到知情管理'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='只列出将处理的执行订单 id / 项目编号，不实际写入知情',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        seen_codes = set()
        to_run = []
        for rec in ExecutionOrderUpload.objects.order_by('-create_time'):
            out = _normalize_execution_order_data(rec)
            if out is None:
                continue
            headers, rows = out
            code = _project_code_from_payload(headers, rows)
            if not (code or '').strip():
                continue
            code = code.strip()
            if code in seen_codes:
                continue
            seen_codes.add(code)
            to_run.append((rec, code))

        if dry_run:
            self.stdout.write(f'[dry-run] 将处理 {len(to_run)} 条（按项目编号去重后）')
            for rec, code in to_run:
                self.stdout.write(f'  execution_order_id={rec.id} 项目编号={code}')
            return

        ok = 0
        for rec, code in to_run:
            try:
                sync_execution_order_upload_to_consent(rec)
                ok += 1
                self.stdout.write(self.style.SUCCESS(f'已同步 execution_order_id={rec.id} 项目编号={code}'))
            except Exception as e:
                self.stderr.write(self.style.ERROR(f'失败 execution_order_id={rec.id} 项目编号={code}: {e}'))

        self.stdout.write(self.style.NOTICE(f'完成：成功 {ok}/{len(to_run)}'))
