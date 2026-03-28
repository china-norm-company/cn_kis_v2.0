"""
项目监察链路冒烟：创建协议 → 列表 → 详情 → 提交监察计划 → 提交实际监察。

用法（需 DJANGO_DEBUG=true 且 dev-bypass-token 可用）：
  python manage.py smoke_project_supervision_flow

说明：经质量台 POST …/create-protocol（手动补录，quality_manual）；监察主表含手动未完成项，
执行周期使用**当月**首尾日，便于与默认年月筛选一并出现在列表中。
"""
import calendar
import json
import uuid
from datetime import date

from django.conf import settings
from django.core.management.base import BaseCommand
from django.test import Client


class Command(BaseCommand):
    help = '项目监察 API 全链路冒烟（DEBUG + dev-bypass-token）'

    def handle(self, *args, **options):
        if not getattr(settings, 'DEBUG', False):
            self.stderr.write('请设置 DJANGO_DEBUG=true 后运行（需 dev-bypass-token 权限旁路）')
            return

        c = Client()
        h = {'HTTP_AUTHORIZATION': 'Bearer dev-bypass-token', 'HTTP_HOST': 'localhost'}
        code = 'SMK' + uuid.uuid4().hex[:8].upper()

        today = date.today()
        month_first = today.replace(day=1)
        last_d = calendar.monthrange(today.year, today.month)[1]
        month_last = date(today.year, today.month, last_d)
        year_month = f'{today.year}-{today.month:02d}'

        r = c.post(
            '/api/v1/quality/project-supervision/create-protocol',
            data=json.dumps(
                {
                    'title': '冒烟-项目监察',
                    'code': code,
                    'sample_size': 5,
                    'execution_start': month_first.isoformat(),
                    'execution_end': month_last.isoformat(),
                }
            ),
            content_type='application/json',
            **h,
        )
        assert r.status_code == 200, r.content
        pid = json.loads(r.content)['data']['id']

        r2 = c.get(
            '/api/v1/quality/project-supervision/list',
            {'year_month': year_month, 'page': 1, 'page_size': 20},
            **h,
        )
        assert r2.status_code == 200, r2.content
        j2 = json.loads(r2.content)['data']
        assert 'stats' in j2
        assert any(x['protocol_id'] == pid for x in j2['items'])

        r3 = c.get(f'/api/v1/quality/project-supervision/{pid}', **h)
        assert r3.status_code == 200

        r4 = c.post(
            f'/api/v1/quality/project-supervision/{pid}/submit-plan',
            data=json.dumps(
                {
                    'plan_entries': [
                        {
                            'visit_phase': 'T0+Timm+T1h',
                            'planned_date': today.isoformat(),
                            'content': '现场流程、仪器测量标准、产品现场使用、问卷',
                            'supervisor': '冒烟监察人',
                        },
                        {
                            'visit_phase': 'T24h',
                            'planned_date': month_last.isoformat(),
                            'content': '现场流程、仪器测量标准',
                            'supervisor': '冒烟监察人',
                        },
                    ],
                }
            ),
            content_type='application/json',
            **h,
        )
        assert r4.status_code == 200

        j4 = json.loads(r4.content)['data']
        plan_rows = j4['plan_entries']
        assert len(plan_rows) == 2
        # 监察计划追加一行（前两条带 entry_id 不可改）
        r4b = c.post(
            f'/api/v1/quality/project-supervision/{pid}/submit-plan',
            data=json.dumps(
                {
                    'plan_entries': plan_rows
                    + [
                        {
                            'visit_phase': 'T1w',
                            'planned_date': month_last.isoformat(),
                            'content': '产品回收',
                            'supervisor': '冒烟监察人',
                        },
                    ],
                }
            ),
            content_type='application/json',
            **h,
        )
        assert r4b.status_code == 200, r4b.content
        assert len(json.loads(r4b.content)['data']['plan_entries']) == 3

        r5 = c.post(
            f'/api/v1/quality/project-supervision/{pid}/submit-actual',
            data=json.dumps(
                {
                    'actual_entries': [
                        {
                            'visit_phase': 'T0',
                            'supervision_at': f'{today.isoformat()}T10:00:00',
                            'content': '冒烟监察内容',
                            'conclusion': '符合要求',
                        },
                    ],
                }
            ),
            content_type='application/json',
            **h,
        )
        assert r5.status_code == 200
        out = json.loads(r5.content)['data']
        assert out['supervision_status'] == 'completed'
        assert out.get('plan_submitted_at')
        assert out.get('actual_submitted_at')
        act_rows = out['actual_entries']
        assert len(act_rows) == 1

        r6 = c.post(
            f'/api/v1/quality/project-supervision/{pid}/submit-actual',
            data=json.dumps(
                {
                    'actual_entries': act_rows
                    + [
                        {
                            'visit_phase': 'T24h',
                            'supervision_at': f'{month_last.isoformat()}T15:30:00',
                            'content': '追加监察记录',
                            'conclusion': '待跟进',
                        },
                    ],
                }
            ),
            content_type='application/json',
            **h,
        )
        assert r6.status_code == 200, r6.content
        assert len(json.loads(r6.content)['data']['actual_entries']) == 2

        self.stdout.write(self.style.SUCCESS(f'PASS protocol_id={pid} code={code}'))
