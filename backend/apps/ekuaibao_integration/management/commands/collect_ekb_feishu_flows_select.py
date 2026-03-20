"""
collect_ekb_feishu_flows_select — 按月分片采集易快报飞书版全量历史单据

关键发现：
- POST /api/flow/v1/flows/search 忽略 count，总返回全量（34723条=11MB），30s内截断
- filterBy 按月分片后：每月约300条，约3MB，2-3秒完成，JSON完整
- 2026年1月测试：360条，2.9MB，2.2秒
"""
import json
import hashlib
from datetime import datetime
from calendar import monthrange
from collections import defaultdict

import requests

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = '按月分片采集易快报飞书版全量历史单据（2017-今）'

    BASE = 'https://dd2.hosecloud.com'
    CORP_ID = 'nYA6xdjChA7c00'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--start-year', type=int, default=2017)
        parser.add_argument('--end-year', type=int, default=2026)

    def handle(self, *args, **options):
        from apps.ekuaibao_integration.models import (
            EkbWebSession, EkbImportBatch, EkbRawRecord, EkbBatchStatus
        )
        dry_run = options['dry_run']
        start_year = options['start_year']
        end_year = options['end_year']

        token = self._get_token(EkbWebSession)
        self.stdout.write(f'Token: {token[:20]}... 按月分片采集开始')

        batch_no = datetime.now().strftime('%Y%m%d_%H%M%S')
        import os
        backup_dir = f'/opt/cn-kis/backend/data/ekuaibao_backup/{batch_no}/flows'
        os.makedirs(backup_dir, exist_ok=True)

        batch = None
        if not dry_run:
            batch = EkbImportBatch.objects.create(
                batch_no=batch_no,
                phase='feishu_flows_monthly',
                modules=['flows'],
                operator='auto',
                notes=f'飞书版内部API按月分片全量采集 {start_year}-{end_year}',
            )

        year_dist = defaultdict(int)
        code_dist = defaultdict(int)
        total_saved = 0
        total_errors = 0
        now = datetime.now()

        for year in range(start_year, end_year + 1):
            for month in range(1, 13):
                if year == now.year and month > now.month:
                    break

                ts_start = int(datetime(year, month, 1).timestamp() * 1000)
                last_day = monthrange(year, month)[1]
                ts_end = int(datetime(year, month, last_day, 23, 59, 59).timestamp() * 1000)

                try:
                    t0 = datetime.now()
                    resp = requests.post(
                        f'{self.BASE}/api/flow/v1/flows/search'
                        f'?accessToken={token}&corpId={self.CORP_ID}',
                        json={
                            'start': 0,
                            'count': 500,
                            'filterBy': f'createTime>={ts_start} && createTime<={ts_end}'
                        },
                        timeout=30,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    elapsed = (datetime.now() - t0).total_seconds()

                    items = data.get('items', [])
                    if not items:
                        continue

                    for item in items:
                        code = item.get('form', {}).get('code', '')
                        ct = item.get('createTime', 0)
                        if ct:
                            yr = datetime.fromtimestamp(int(ct) / 1000).year
                            year_dist[yr] += 1
                        if code and len(code) >= 3:
                            code_dist[code[1:3]] += 1

                    with open(f'{backup_dir}/{year}{month:02d}.json', 'w', encoding='utf-8') as f:
                        json.dump(items, f, ensure_ascii=False)

                    if not dry_run and batch:
                        for item in items:
                            ekb_id = item.get('id', item.get('form', {}).get('code', '?'))
                            data_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
                            checksum = hashlib.sha256(data_str.encode()).hexdigest()
                            EkbRawRecord.objects.update_or_create(
                                batch=batch,
                                module='flows',
                                ekb_id=ekb_id,
                                defaults={
                                    'raw_data': item,
                                    'scraped_at': timezone.now(),
                                    'checksum': checksum,
                                }
                            )
                            total_saved += 1

                    self.stdout.write(
                        f'[{datetime.now():%H:%M:%S}] {year}-{month:02d}: '
                        f'{len(items)}条 {elapsed:.1f}s 累计:{total_saved}'
                    )
                    self.stdout.flush()

                except Exception as e:
                    total_errors += 1
                    self.stderr.write(f'  错误 {year}-{month:02d}: {e}')
                    import time
                    time.sleep(3)

        if batch:
            batch.total_records = total_saved
            batch.status = EkbBatchStatus.COLLECTED
            batch.collected_at = timezone.now()
            batch.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n完成：{total_saved}条 | 错误:{total_errors} | 批次:{batch_no}'
        ))
        self.stdout.write('创建时间年份分布:')
        for yr in sorted(year_dist.keys()):
            bar = '█' * (year_dist[yr] // 50 + 1)
            self.stdout.write(f'  {yr}: {year_dist[yr]:5d} {bar}')
        self.stdout.write('编号年份（单据编号前缀）:')
        for k in sorted(code_dist.keys()):
            self.stdout.write(f'  20{k}: {code_dist[k]:5d}')

    def _get_token(self, EkbWebSession):
        token = EkbWebSession.get_valid_token(self.CORP_ID)
        if token:
            return token
        obj = EkbWebSession.objects.get(corp_id=self.CORP_ID)
        resp = requests.get(
            f'{self.BASE}/api/account/v2/session/getAccessToken'
            f'?accessToken={obj.web_token}&expireDate=604800',
            timeout=15,
        )
        new_token = resp.json().get('value', {}).get('accessToken', '')
        if new_token:
            EkbWebSession.save_token(self.CORP_ID, new_token,
                                     obj.feishu_open_id, obj.feishu_staff_name)
            return new_token
        raise RuntimeError('Token 无效')
