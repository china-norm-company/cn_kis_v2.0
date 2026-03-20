from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.instrument_knowledge_builder import ingest_instrument_manual


class Command(BaseCommand):
    help = '导入仪器手册 PDF 到知识管线（KR-3-4）'

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True, help='PDF 文件路径')
        parser.add_argument('--equipment-id', type=int, default=None, help='可选：关联设备台账 ID')
        parser.add_argument('--created-by', type=int, default=None, help='可选：创建人账号 ID')
        parser.add_argument('--dry-run', action='store_true', help='仅解析并预览，不实际入库')

    def handle(self, *args, **options):
        file_path = options['file']
        result = ingest_instrument_manual(
            file_path=file_path,
            equipment_id=options.get('equipment_id'),
            created_by_id=options.get('created_by'),
            dry_run=options.get('dry_run', False),
        )
        if not result.get('success'):
            raise CommandError(result.get('message', 'instrument manual import failed'))

        self.stdout.write(self.style.SUCCESS('仪器手册处理完成'))
        self.stdout.write(str(result))
