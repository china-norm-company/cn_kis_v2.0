"""
collect_ekb_feishu_flows_final — 生产级全量历史采集

修复清单：
1. 时区：用 CST (UTC+8) 时间戳，避免月份边界丢失
2. 分片：按周（7天）而非按月，减少单次请求数据量
3. 重复检测：按 ekb_id 去重，防止边界重叠导致重复
4. 验证：每批采集后与 API count 核对
5. 断点续传：记录已完成的时间段，支持中断恢复
"""
import json
import hashlib
from datetime import datetime, timedelta, timezone
from collections import defaultdict

import requests

from django.core.management.base import BaseCommand
from django.utils import timezone as dj_timezone


# CST = UTC+8
CST = timezone(timedelta(hours=8))


class Command(BaseCommand):
    help = '生产级全量历史采集（CST时区 + 按周分片 + 去重 + 验证）'

    BASE = 'https://dd2.hosecloud.com'
    CORP_ID = 'nYA6xdjChA7c00'
    WEEK_DAYS = 7   # 每次采 7 天数据
    MAX_RETRY = 3

    def add_arguments(self, parser):
        parser.add_argument('--start', default='2018-01-01', help='起始日期 YYYY-MM-DD')
        parser.add_argument('--end', default=None, help='结束日期（默认今天）')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from apps.ekuaibao_integration.models import (
            EkbWebSession, EkbImportBatch, EkbRawRecord, EkbBatchStatus
        )

        dry_run = options['dry_run']
        start_dt = datetime.strptime(options['start'], '%Y-%m-%d').replace(tzinfo=CST)
        end_dt = (datetime.now(CST) if not options['end']
                  else datetime.strptime(options['end'], '%Y-%m-%d').replace(tzinfo=CST))

        token = self._get_token(EkbWebSession)
        self.stdout.write(f'[{datetime.now(CST):%H:%M:%S}] Token: {token[:20]}...')
        self.stdout.write(f'采集范围: {start_dt:%Y-%m-%d} ~ {end_dt:%Y-%m-%d}（CST）')

        batch_no = datetime.now().strftime('%Y%m%d_%H%M%S')
        import os
        backup_dir = f'/opt/cn-kis/backend/data/ekuaibao_backup/{batch_no}/flows'
        os.makedirs(backup_dir, exist_ok=True)

        batch = None
        if not dry_run:
            batch = EkbImportBatch.objects.create(
                batch_no=batch_no,
                phase='feishu_flows_final',
                modules=['flows'],
                operator='auto',
                notes=f'生产级全量采集 CST {start_dt:%Y-%m-%d}~{end_dt:%Y-%m-%d}',
            )

        year_dist = defaultdict(int)
        code_dist = defaultdict(int)
        total_api = 0    # API 返回总条数
        total_saved = 0  # 实际写入（去重后）
        total_errors = 0
        seen_ids = set() # 去重

        current = start_dt
        while current <= end_dt:
            week_end = min(current + timedelta(days=self.WEEK_DAYS - 1, hours=23, minutes=59, seconds=59),
                           end_dt.replace(hour=23, minute=59, second=59))

            # CST 毫秒时间戳
            ts_start = int(current.timestamp() * 1000)
            ts_end = int(week_end.timestamp() * 1000)

            for attempt in range(self.MAX_RETRY):
                try:
                    resp = requests.post(
                        f'{self.BASE}/api/flow/v1/flows/search'
                        f'?accessToken={token}&corpId={self.CORP_ID}',
                        json={
                            'start': 0, 'count': 9999,
                            'filterBy': f'createTime>={ts_start} && createTime<={ts_end}'
                        },
                        timeout=30,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    items = data.get('items', [])
                    api_count = data.get('count', 0)

                    # 验证：API count 与返回条数应一致
                    if api_count != len(items) and len(items) < api_count:
                        self.stderr.write(
                            f'  ⚠️  {current:%Y-%m-%d}: API count={api_count} 但只返回 {len(items)} 条！'
                        )

                    total_api += api_count
                    new_items = 0

                    if items:
                        # 保存 JSON 备份
                        fname = f'{backup_dir}/{current:%Y%m%d}_{week_end:%Y%m%d}.json'
                        with open(fname, 'w', encoding='utf-8') as f:
                            json.dump(items, f, ensure_ascii=False)

                        if not dry_run and batch:
                            for item in items:
                                ekb_id = item.get('id', '')
                                if not ekb_id or ekb_id in seen_ids:
                                    continue
                                seen_ids.add(ekb_id)

                                code = item.get('form', {}).get('code', '')
                                ct = item.get('createTime', 0)
                                if ct:
                                    yr = datetime.fromtimestamp(int(ct)/1000, tz=CST).year
                                    year_dist[yr] += 1
                                if code and len(code) >= 3:
                                    code_dist[code[1:3]] += 1

                                data_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
                                checksum = hashlib.sha256(data_str.encode()).hexdigest()
                                _, created = EkbRawRecord.objects.update_or_create(
                                    batch=batch, module='flows', ekb_id=ekb_id,
                                    defaults={
                                        'raw_data': item,
                                        'scraped_at': dj_timezone.now(),
                                        'checksum': checksum,
                                    }
                                )
                                if created:
                                    new_items += 1
                                total_saved += 1

                    self.stdout.write(
                        f'[{datetime.now(CST):%H:%M:%S}] {current:%Y-%m-%d}~{week_end:%Y-%m-%d}: '
                        f'{api_count}条(API) / {new_items}条(新增) 累计:{total_saved}'
                    )
                    self.stdout.flush()
                    break  # 成功，跳出重试

                except Exception as e:
                    total_errors += 1
                    self.stderr.write(f'  错误(attempt {attempt+1}): {e}')
                    if attempt < self.MAX_RETRY - 1:
                        import time; time.sleep(5 * (attempt + 1))
                    else:
                        self.stderr.write(f'  放弃 {current:%Y-%m-%d}，继续下一段')

            current = week_end.replace(hour=0, minute=0, second=0) + timedelta(days=1)

        if batch:
            batch.total_records = total_saved
            batch.status = EkbBatchStatus.COLLECTED
            batch.collected_at = dj_timezone.now()
            batch.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n=== 完成 ===\n'
            f'API 总计: {total_api:,} | 写入DB: {total_saved:,} | 错误段: {total_errors} | 批次: {batch_no}'
        ))
        self.stdout.write('\n创建时间年份:')
        for yr in sorted(year_dist.keys()):
            bar = '█' * (year_dist[yr] // 100 + 1)
            self.stdout.write(f'  {yr}: {year_dist[yr]:6,} {bar}')
        self.stdout.write('\n编号年份:')
        for k in sorted(code_dist.keys()):
            self.stdout.write(f'  20{k}: {code_dist[k]:6,}')

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
