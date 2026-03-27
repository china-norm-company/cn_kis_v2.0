"""
日记 2.0 试点：在后端灌入「研究台已下发」等价的日记配置（见 docs/小程序日记功能2.0.md §四）。

用法：
  python manage.py seed_diary_config_pilot
  python manage.py seed_diary_config_pilot --project-no W26000000 --force
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

PILOT_PROJECT_NO = 'W26000000'
PILOT_RULE_JSON = {
    'timezone': 'Asia/Shanghai',
    'diary_period': {'start': '2026-03-23', 'end': '2026-04-23'},
    'fill_time_window': {'start': '09:00', 'end': '18:00'},
    'frequency': 'daily',
    'retrospective_days_max': 7,
    'late_reason_required_when_retrospective': True,
}
PILOT_FORM_JSON = [
    {
        'id': 'medication_taken',
        'type': 'boolean',
        'label': '是否按要求使用产品',
        'required': True,
        'order': 10,
    },
    {
        'id': 'adverse_occurred',
        'type': 'single_choice',
        'label': '是否发生不良情况',
        'options': [
            {'value': 'no', 'label': '没有'},
            {'value': 'yes', 'label': '有'},
        ],
        'required': True,
        'order': 20,
    },
]


class Command(BaseCommand):
    help = '灌入日记 2.0 试点配置（project_full_link.Project + SubjectDiaryConfig）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--project-no',
            type=str,
            default=PILOT_PROJECT_NO,
            help='业务项目编号（默认 W26000000）',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='若已存在同项目编号配置则更新为试点内容',
        )

    def handle(self, *args, **options):
        from apps.project_full_link.models import Project
        from apps.subject.models_diary_config import SubjectDiaryConfig, SubjectDiaryConfigStatus

        project_no = options['project_no'].strip()
        force = options['force']

        proj = Project.objects.filter(project_no=project_no).first()
        if not proj:
            proj = Project.objects.create(
                project_no=project_no,
                project_name=f'[Pilot] 日记2.0 {project_no}',
                execution_status='in_progress',
            )
            self.stdout.write(self.style.SUCCESS(f'已创建项目 id={proj.id} project_no={project_no}'))
        else:
            self.stdout.write(f'使用已有项目 id={proj.id} project_no={project_no}')

        cfg = SubjectDiaryConfig.objects.filter(project=proj).order_by('-id').first()
        now = timezone.now()
        if cfg and not force:
            self.stdout.write(
                self.style.WARNING(
                    f'已存在配置 id={cfg.id}，跳过。若要覆盖请加 --force'
                )
            )
            self.stdout.write(
                f'project_id={proj.id}  GET /api/v1/my/diary/config?project_id={proj.id}'
            )
            return

        if cfg and force:
            cfg.project_no = project_no
            cfg.config_version_label = 'v1'
            cfg.form_definition_json = PILOT_FORM_JSON
            cfg.rule_json = PILOT_RULE_JSON
            cfg.status = SubjectDiaryConfigStatus.PUBLISHED
            cfg.researcher_confirmed_at = now
            cfg.save()
            self.stdout.write(self.style.SUCCESS(f'已更新配置 id={cfg.id}'))
            return

        cfg = SubjectDiaryConfig.objects.create(
            project=proj,
            project_no=project_no,
            config_version_label='v1',
            form_definition_json=PILOT_FORM_JSON,
            rule_json=PILOT_RULE_JSON,
            status=SubjectDiaryConfigStatus.PUBLISHED,
            researcher_confirmed_at=now,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'已创建日记配置 id={cfg.id} project_id={proj.id}，'
                f'小程序可 GET /api/v1/my/diary/config?project_id={proj.id}'
            )
        )
