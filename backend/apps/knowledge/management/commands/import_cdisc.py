"""
管理命令：导入 CDISC 标准术语

用法：
  python manage.py import_cdisc                            # 导入 SDTM + CDASH + 受控术语（全量）
  python manage.py import_cdisc --sdtm-version 3-4         # 指定 SDTM IG 版本（连字符格式）
  python manage.py import_cdisc --include-variables        # 同时导入域变量（默认开启）
  python manage.py import_cdisc --no-ct                    # 跳过受控术语
  python manage.py import_cdisc --ct-only sdtmct 2025-03-28 # 仅导入受控术语
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '从 CDISC Library API 导入标准术语到知识图谱'

    def add_arguments(self, parser):
        parser.add_argument('--sdtm-version', default='3-4',
                            help='SDTM IG 版本（连字符格式，如 3-4）')
        parser.add_argument('--cdash-version', default='2-2',
                            help='CDASH IG 版本（连字符格式，如 2-2）')
        parser.add_argument('--ct-version', default='2025-03-28',
                            help='受控术语版本（日期格式，如 2025-03-28）')
        parser.add_argument('--include-variables', action='store_true', default=True,
                            help='同时导入变量定义（默认开启）')
        parser.add_argument('--no-variables', action='store_true',
                            help='不导入变量定义')
        parser.add_argument('--no-ct', action='store_true',
                            help='跳过受控术语导入')
        parser.add_argument('--ct-only', nargs=2, metavar=('PACKAGE', 'VERSION'),
                            help='仅导入受控术语包（如 sdtmct 2025-03-28）')

    def handle(self, *args, **options):
        from apps.knowledge.cdisc_importer import (
            run_full_cdisc_import,
            import_controlled_terminology,
        )

        if options.get('ct_only'):
            ct_pkg, ct_ver = options['ct_only']
            self.stdout.write(f'导入 CDISC 受控术语: {ct_pkg} {ct_ver}')
            result = import_controlled_terminology(ct_pkg, ct_ver)
            self._print_result(result)
            return

        include_vars = options['include_variables'] and not options.get('no_variables')
        include_ct = not options.get('no_ct')

        self.stdout.write(self.style.HTTP_INFO(
            f'开始 CDISC 标准导入...\n'
            f'  SDTM IG: {options["sdtm_version"]}\n'
            f'  CDASH IG: {options["cdash_version"]}\n'
            f'  受控术语: {"跳过" if not include_ct else options["ct_version"]}\n'
            f'  变量导入: {"是" if include_vars else "否"}'
        ))
        result = run_full_cdisc_import(
            sdtm_version=options['sdtm_version'],
            cdash_version=options['cdash_version'],
            ct_version=options['ct_version'],
            include_variables=include_vars,
            include_ct=include_ct,
        )
        self._print_result(result)

        if result.get('details'):
            self.stdout.write('\n详细结果:')
            for phase, detail in result['details'].items():
                status = '✓' if detail.get('success', True) else '✗'
                created = detail.get('created', 0) + detail.get('codelists_created', 0) + detail.get('terms_created', 0)
                self.stdout.write(f'  {status} {phase}: 创建 {created} 个实体')

    def _print_result(self, result):
        if result.get('success'):
            self.stdout.write(self.style.SUCCESS(
                f'\n导入完成: 共创建 {result.get("total_entities_created", 0)} 个实体'
            ))
        else:
            self.stdout.write(self.style.ERROR(f'导入失败: {result.get("message", "")}'))
        for key, val in result.items():
            if key not in ('success', 'details'):
                self.stdout.write(f'  {key}: {val}')
