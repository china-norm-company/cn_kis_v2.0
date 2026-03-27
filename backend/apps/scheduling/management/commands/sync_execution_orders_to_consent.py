"""
将已落库的执行订单按项目编号去重（与资源需求列表一致：每编号仅最新一条）同步到知情管理。

用法：
  python manage.py sync_execution_orders_to_consent
  python manage.py sync_execution_orders_to_consent --dry-run
"""
from django.core.management.base import BaseCommand

from apps.scheduling.api import _normalize_execution_order_data, _project_code_from_payload
from apps.scheduling.consent_sync import sync_execution_order_upload_to_consent
from apps.scheduling.models import ExecutionOrderUpload


class Command(BaseCommand):
    help = "将执行订单（每项目编号最新一条）同步到知情管理"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='仅打印将同步的上传记录 id 与项目编号，不写入',
        )

    def handle(self, *args, **options):
        dry = bool(options.get('dry_run'))
        seen: set[str] = set()
        to_sync: list[tuple[int, str | None]] = []
        for rec in ExecutionOrderUpload.objects.order_by('-create_time'):
            out = _normalize_execution_order_data(rec)
            if out is None:
                continue
            headers, rows = out
            project_code = _project_code_from_payload(headers, rows)
            if project_code and project_code in seen:
                continue
            if project_code:
                seen.add(project_code)
            to_sync.append((rec.id, project_code))

        self.stdout.write(f'将处理 {len(to_sync)} 条上传记录（按项目编号去重后的最新一条）。')
        for rec_id, code in to_sync:
            label = code or '(无项目编号，跳过同步)'
            self.stdout.write(f'  id={rec_id} 项目编号={label}')

        if dry:
            self.stdout.write(self.style.WARNING('dry-run：未写入数据库。'))
            return

        n_ok = 0
        for rec_id, code in to_sync:
            if not code:
                continue
            rec = ExecutionOrderUpload.objects.filter(id=rec_id).first()
            if not rec:
                continue
            sync_execution_order_upload_to_consent(rec)
            n_ok += 1
        self.stdout.write(self.style.SUCCESS(f'已完成同步：{n_ok} 条（有项目编号的记录）。'))
