"""
init_lims_seed_data — 初始化 LIMS 注入前置种子数据

在执行任何 LIMS P0 注入之前必须先运行此命令。
确保所有必要的资源类别、系统枚举配置已就位。

用法：
  python manage.py init_lims_seed_data
  python manage.py init_lims_seed_data --check-only  # 只检查不创建
"""
import logging

from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger('cn_kis.lims.seed')


class Command(BaseCommand):
    help = 'LIMS 注入前置种子数据初始化（ResourceCategory、枚举等）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--check-only', action='store_true', dest='check_only',
            help='只检查不创建，输出缺失项',
        )
        parser.add_argument(
            '--force', action='store_true',
            help='强制重建已存在的种子（谨慎使用）',
        )

    def handle(self, *args, **options):
        check_only = options['check_only']

        self.stdout.write('=== LIMS 前置种子数据检查 ===')

        # 验证前置条件
        from apps.lims_integration.p0_mapping import validate_p0_preconditions
        result = validate_p0_preconditions()

        if not result['ready']:
            self.stdout.write(self.style.ERROR('前置条件检查失败:'))
            for issue in result['issues']:
                self.stdout.write(f'  ✗ {issue}')
        else:
            self.stdout.write(self.style.SUCCESS('  ✓ 基础条件满足'))

        # 初始化 ResourceCategory 种子
        self._init_resource_categories(check_only)

        # 检查 P0 注入准备状态
        self._check_p0_readiness()

        self.stdout.write(self.style.SUCCESS('\n种子初始化完成'))

    def _init_resource_categories(self, check_only: bool):
        """初始化 ResourceCategory 种子数据"""
        from apps.lims_integration.p0_mapping import RESOURCE_CATEGORY_SEEDS
        from apps.resource.models import ResourceCategory

        self.stdout.write('\n[ResourceCategory 种子]')

        created_count = 0
        existing_count = 0

        # 先创建根节点，再创建子节点
        root_seeds = [s for s in RESOURCE_CATEGORY_SEEDS if s['parent_code'] is None]
        child_seeds = [s for s in RESOURCE_CATEGORY_SEEDS if s['parent_code'] is not None]

        with transaction.atomic():
            for seed in root_seeds + child_seeds:
                exists = ResourceCategory.objects.filter(code=seed['code']).exists()
                if exists:
                    self.stdout.write(f'  ✓ {seed["code"]} ({seed["name"]}) 已存在')
                    existing_count += 1
                    continue

                if check_only:
                    self.stdout.write(self.style.WARNING(f'  ✗ {seed["code"]} ({seed["name"]}) 缺失'))
                    continue

                # 查找父节点
                parent = None
                if seed['parent_code']:
                    parent = ResourceCategory.objects.filter(code=seed['parent_code']).first()
                    if not parent:
                        self.stdout.write(self.style.ERROR(
                            f'  ✗ {seed["code"]} 父节点 {seed["parent_code"]} 不存在，跳过'
                        ))
                        continue

                ResourceCategory.objects.create(
                    code=seed['code'],
                    name=seed['name'],
                    resource_type=seed['resource_type'],
                    parent=parent,
                    description=f'LIMS 导入分类 - {seed["name"]}',
                )
                self.stdout.write(self.style.SUCCESS(f'  + 创建: {seed["code"]} ({seed["name"]})'))
                created_count += 1

        if not check_only:
            self.stdout.write(f'  创建 {created_count} 个，已存在 {existing_count} 个')

    def _check_p0_readiness(self):
        """检查各 P0 目标模型的可访问性"""
        self.stdout.write('\n[P0 目标模型可访问性]')
        checks = [
            ('resource.ResourceItem', 'apps.resource.models', 'ResourceItem'),
            ('hr.Staff', 'apps.hr.models', 'Staff'),
            ('identity.Account', 'apps.identity.models', 'Account'),
            ('lab_personnel.LabStaffProfile', 'apps.lab_personnel.models', 'LabStaffProfile'),
            ('crm.Client', 'apps.crm.models', 'Client'),
            ('crm.ClientContact', 'apps.crm.models', 'ClientContact'),
            ('protocol.Protocol', 'apps.protocol.models', 'Protocol'),
            ('sample.Product', 'apps.sample.models', 'Product'),
        ]

        for label, module_path, class_name in checks:
            try:
                import importlib
                module = importlib.import_module(module_path)
                model = getattr(module, class_name)
                count = model.objects.count()
                self.stdout.write(f'  ✓ {label} (现有 {count} 条)')
            except Exception as ex:
                self.stdout.write(self.style.ERROR(f'  ✗ {label}: {ex}'))
