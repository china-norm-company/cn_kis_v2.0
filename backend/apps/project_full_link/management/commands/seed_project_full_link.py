"""
研究台「项目全链路」模拟数据种子

为项目全链路列表页生成 6 条模拟项目数据，便于开发与演示。

Usage:
    python manage.py seed_project_full_link              # 插入 6 条项目（不覆盖已有）
    python manage.py seed_project_full_link --with-protocols   # 同时为每个项目创建 1 条方案
    python manage.py seed_project_full_link --clear      # 先清空由本命令创建的数据后再插入
"""
from datetime import date

from django.core.management.base import BaseCommand
from django.db import OperationalError

from apps.project_full_link.models import Project, ProjectProtocol


# 6 条模拟项目数据（仅项目主表字段）
MOCK_PROJECTS = [
    {
        'opportunity_no': 'OPP-2025-001',
        'inquiry_no': 'INQ-2025-001',
        'project_no': 'PRJ-2025-001',
        'project_name': '某护肤品功效临床研究项目',
        'business_type': '化妆品功效',
        'sponsor_no': 'SPO-001',
        'sponsor_name': '某某美妆科技股份有限公司',
        'research_institution': '某某大学附属医院皮肤科',
        'principal_investigator': '张主任',
        'priority': 'high',
        'execution_status': 'in_progress',
        'schedule_status': 'pending_resource_review',
        'total_samples': 120,
        'expected_start_date': date(2025, 3, 1),
        'expected_end_date': date(2025, 8, 31),
        'actual_start_date': date(2025, 3, 10),
        'description': '保湿、抗皱功效验证，多中心临床研究。',
        'remark': '高优先级，申办方要求 Q3 完成入组。',
    },
    {
        'opportunity_no': 'OPP-2025-002',
        'inquiry_no': 'INQ-2025-002',
        'project_no': 'PRJ-2025-002',
        'project_name': '防晒产品 SPF 与 UVA 测定项目',
        'business_type': '化妆品功效',
        'sponsor_no': 'SPO-002',
        'sponsor_name': '某某日化有限公司',
        'research_institution': '某某检测中心',
        'principal_investigator': '李工',
        'priority': 'medium',
        'execution_status': 'pending_execution',
        'schedule_status': 'pending_visit_plan',
        'total_samples': 30,
        'expected_start_date': date(2025, 4, 1),
        'expected_end_date': date(2025, 6, 30),
        'description': 'SPF、PFA 及临界波长测定，实验室检测。',
        'remark': None,
    },
    {
        'opportunity_no': 'OPP-2025-003',
        'inquiry_no': None,
        'project_no': 'PRJ-2025-003',
        'project_name': '婴童润肤霜温和性临床评价',
        'business_type': '化妆品安全',
        'sponsor_no': 'SPO-003',
        'sponsor_name': '某某婴童护理有限公司',
        'research_institution': '某某儿童医院皮肤科',
        'principal_investigator': '王主任',
        'priority': 'high',
        'execution_status': 'in_progress',
        'schedule_status': 'pending_visit_plan',
        'total_samples': 60,
        'expected_start_date': date(2025, 2, 15),
        'expected_end_date': date(2025, 7, 15),
        'recruitment_start_date': date(2025, 2, 20),
        'description': '婴童产品斑贴试验与临床安全性评价。',
        'remark': '需伦理批件。',
    },
    {
        'opportunity_no': 'OPP-2024-012',
        'inquiry_no': 'INQ-2024-012',
        'project_no': 'PRJ-2024-012',
        'project_name': '祛斑美白精华人体功效试验',
        'business_type': '化妆品功效',
        'sponsor_no': 'SPO-004',
        'sponsor_name': '某某生物科技有限公司',
        'research_institution': '某某皮肤病医院',
        'principal_investigator': '陈主任',
        'priority': 'medium',
        'execution_status': 'completed',
        'schedule_status': 'completed',
        'total_samples': 80,
        'expected_start_date': date(2024, 9, 1),
        'expected_end_date': date(2025, 1, 31),
        'actual_start_date': date(2024, 9, 5),
        'actual_end_date': date(2025, 1, 28),
        'description': '祛斑美白功效人体评价，ITAV 与专家评估。',
        'remark': '已结题。',
    },
    {
        'opportunity_no': 'OPP-2025-004',
        'inquiry_no': None,
        'project_no': 'PRJ-2025-004',
        'project_name': '洗护发产品控油与蓬松功效研究',
        'business_type': '化妆品功效',
        'sponsor_no': 'SPO-005',
        'sponsor_name': '某某个人护理有限公司',
        'research_institution': '某某医院医学美容科',
        'principal_investigator': '刘主任',
        'priority': 'low',
        'execution_status': 'pending_execution',
        'schedule_status': 'pending_visit_plan',
        'total_samples': 50,
        'expected_start_date': date(2025, 5, 1),
        'expected_end_date': date(2025, 9, 30),
        'description': '控油、蓬松感及发质改善功效评价。',
        'remark': None,
    },
    {
        'opportunity_no': 'OPP-2025-005',
        'inquiry_no': 'INQ-2025-005',
        'project_no': 'PRJ-2025-005',
        'project_name': '敏感肌舒缓修护精华临床验证',
        'business_type': '化妆品功效',
        'sponsor_no': 'SPO-006',
        'sponsor_name': '某某皮肤科学研究院',
        'research_institution': '某某三甲医院皮肤科',
        'principal_investigator': '赵主任',
        'priority': 'high',
        'execution_status': 'in_progress',
        'schedule_status': 'pending_visit_plan',
        'total_samples': 100,
        'expected_start_date': date(2025, 1, 10),
        'expected_end_date': date(2025, 6, 30),
        'actual_start_date': date(2025, 1, 15),
        'test_start_date': date(2025, 2, 1),
        'description': '敏感肌舒缓、修护屏障功效与安全性评价。',
        'remark': '含乳酸刺痛测试。',
    },
]

# 每个项目对应的 1 条模拟方案（用于 --with-protocols）
MOCK_PROTOCOL_NAMES = [
    '功效临床研究方案 v1.0',
    '防晒功效检测方案 v1.0',
    '婴童温和性评价方案 v1.0',
    '祛斑美白人体试验方案 v1.0',
    '洗护发功效评价方案 v1.0',
    '敏感肌舒缓修护试验方案 v1.0',
]


class Command(BaseCommand):
    help = '为研究台「项目全链路」生成 6 条模拟项目数据'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='先删除由本命令创建的模拟数据（通过 project_no 前缀 PRJ- 且为模拟编号识别），再插入',
        )
        parser.add_argument(
            '--with-protocols',
            action='store_true',
            help='为每个项目创建 1 条模拟方案',
        )

    def handle(self, *args, **options):
        mock_nos = {p['project_no'] for p in MOCK_PROJECTS}

        try:
            existing = Project.objects.filter(project_no__in=mock_nos, is_delete=False).count()
        except OperationalError as e:
            if 'no such table' in str(e).lower() or 'does not exist' in str(e).lower():
                self.stdout.write(
                    self.style.ERROR('项目全链路表尚未创建，请先执行: python manage.py migrate project_full_link')
                )
            raise

        if options['clear']:
            deleted_projects = Project.objects.filter(
                project_no__in=mock_nos,
                is_delete=False,
            )
            count = deleted_projects.count()
            # 方案随项目 CASCADE 或需软删；此处按 project 删除时协议会一起处理（CASCADE 物理删除）
            deleted_projects.delete()
            self.stdout.write(self.style.WARNING(f'已删除 {count} 条模拟项目（及其方案）。'))
            if count == 0:
                self.stdout.write('未找到需清除的模拟数据。')
            existing = 0  # 已清空，后续会插入
        else:
            existing = Project.objects.filter(project_no__in=mock_nos, is_delete=False).count()
        if existing > 0 and not options['clear']:
            self.stdout.write(
                self.style.WARNING(f'已存在 {existing} 条相同编号的模拟项目，跳过插入。使用 --clear 可先清空再插入。')
            )
            return

        created = 0
        for i, data in enumerate(MOCK_PROJECTS):
            obj, created_flag = Project.objects.get_or_create(
                project_no=data['project_no'],
                defaults={
                    **data,
                    'created_by': None,
                    'updated_by': None,
                },
            )
            if created_flag:
                created += 1
                self.stdout.write(f'  创建项目: {obj.project_name} ({obj.project_no})')
                if options['with_protocols'] and i < len(MOCK_PROTOCOL_NAMES):
                    protocol = ProjectProtocol.objects.create(
                        project=obj,
                        protocol_no=f"{obj.project_no}-PTC-01",
                        protocol_name=MOCK_PROTOCOL_NAMES[i],
                        protocol_version='1.0',
                        description=f'模拟方案：{MOCK_PROTOCOL_NAMES[i]}',
                        created_by=None,
                        updated_by=None,
                    )
                    self.stdout.write(f'    └─ 创建方案: {protocol.protocol_name}')

        self.stdout.write(self.style.SUCCESS(f'完成。共创建 {created} 条项目全链路模拟项目。'))
