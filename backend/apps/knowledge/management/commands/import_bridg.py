"""
管理命令：导入 BRIDG 本体

用法：
  python manage.py import_bridg                        # 导入核心种子数据（含 CRO 扩展）
  python manage.py import_bridg --owl path/to/file.owl # 从 OWL 文件导入
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '导入 BRIDG (ISO 14199) 本体到知识图谱'

    def add_arguments(self, parser):
        parser.add_argument('--owl', type=str, help='OWL/RDF-XML 文件路径')

    def handle(self, *args, **options):
        from apps.knowledge.bridg_importer import import_bridg_seed, import_bridg_owl

        owl_path = options.get('owl')

        if owl_path:
            self.stdout.write(f'从 OWL 文件导入: {owl_path}')
            try:
                with open(owl_path, 'rb') as f:
                    content = f.read()
                result = import_bridg_owl(content)
            except FileNotFoundError:
                self.stdout.write(self.style.ERROR(f'文件不存在: {owl_path}'))
                return
        else:
            self.stdout.write('导入 BRIDG 核心种子数据（含 CRO 化妆品扩展）...')
            result = import_bridg_seed()

        if result.get('success'):
            self.stdout.write(self.style.SUCCESS(
                f'导入完成: 实体 {result.get("entities_created", 0) + result.get("classes_created", 0)} 个, '
                f'关系 {result.get("relations_created", 0)} 个'
            ))
        else:
            self.stdout.write(self.style.ERROR(f'导入失败: {result.get("message", "")}'))

        for key, val in result.items():
            if key != 'success':
                self.stdout.write(f'  {key}: {val}')
