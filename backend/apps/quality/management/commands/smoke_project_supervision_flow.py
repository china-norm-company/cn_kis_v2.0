"""
项目监察链路冒烟：创建协议 → 列表 → 详情 → 提交监察计划 → 提交实际监察。

用法（需 DJANGO_DEBUG=true 且 dev-bypass-token 可用）：
  python manage.py smoke_project_supervision_flow

说明：监察主表仅包含「执行启动月为本月或下月且未完成」∪ 历史已完成 ∪ 历史异常，
故执行周期使用**当月**首尾日，保证新协议出现在默认 supervision 列表中。
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
            '/api/v1/protocol/create',
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
            data=json.dumps({'plan_content': '冒烟计划内容'}),
            content_type='application/json',
            **h,
        )
        assert r4.status_code == 200

        r5 = c.post(
            f'/api/v1/quality/project-supervision/{pid}/submit-actual',
            data=json.dumps({'actual_content': '冒烟实际监察记录'}),
            content_type='application/json',
            **h,
        )
        assert r5.status_code == 200
        out = json.loads(r5.content)['data']
        assert out['supervision_status'] == 'completed'
        assert out.get('plan_submitted_at')
        assert out.get('actual_submitted_at')

        self.stdout.write(self.style.SUCCESS(f'PASS protocol_id={pid} code={code}'))
