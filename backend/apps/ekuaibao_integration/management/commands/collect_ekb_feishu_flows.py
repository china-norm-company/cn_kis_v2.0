"""
collect_ekb_feishu_flows — 采集易快报飞书版全量历史单据

使用内部 API POST /api/flow/v1/flows/search，覆盖 2017 年至今所有历史数据。
Token 自动从 t_ekb_web_session 加载（需先运行 init_ekb_feishu_session --code）。

用法：
    python manage.py collect_ekb_feishu_flows
    python manage.py collect_ekb_feishu_flows --start 1000  # 从第1000条断点续传
    python manage.py collect_ekb_feishu_flows --dry-run     # 只统计不写入
"""
import json
import time
import hashlib
from datetime import datetime
from collections import defaultdict
from pathlib import Path

import requests
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = '采集易快报飞书版全量历史单据'

    BASE = 'https://dd2.hosecloud.com'
    CORP_ID = 'nYA6xdjChA7c00'
    PAGE_SIZE = 30

    def add_arguments(self, parser):
        parser.add_argument('--start', type=int, default=0, help='起始偏移（断点续传）')
        parser.add_argument('--dry-run', action='store_true', help='只统计不写入DB')
        parser.add_argument('--no-backup', action='store_true', help='不保存JSON备份文件')

    def handle(self, *args, **options):
        from apps.ekuaibao_integration.models import (
            EkbWebSession, EkbImportBatch, EkbRawRecord, EkbBatchStatus
        )

        dry_run = options['dry_run']
        start_offset = options['start']

        # 1. 获取 token
        token = self._get_token(EkbWebSession)
        me = requests.get(
            f'{self.BASE}/api/v1/organization/staffs/me?accessToken={token}&corpId={self.CORP_ID}',
            timeout=15).json().get('value', {}).get('staff', {})
        self.stdout.write(f'账号: {me.get("name","?")} | Token: {token[:20]}...')

        # 2. 获取总数
        first = self._search(token, 0, 1)
        total = first.get('count', 0)
        self.stdout.write(self.style.SUCCESS(f'总记录数: {total:,}'))

        if dry_run:
            self.stdout.write('dry-run 模式，不写入数据库')

        # 3. 创建批次
        batch_no = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_dir = Path(f'/opt/cn-kis/backend/data/ekuaibao_backup/{batch_no}/flows')
        if not options['no_backup']:
            backup_dir.mkdir(parents=True, exist_ok=True)

        batch = None
        if not dry_run:
            batch = EkbImportBatch.objects.create(
                batch_no=batch_no,
                phase='feishu_flows',
                modules=['flows'],
                backup_path=f'data/ekuaibao_backup/{batch_no}/flows',
                operator='auto',
                notes='飞书版内部API全量采集 /api/flow/v1/flows/search',
            )

        # 4. 分页采集
        year_dist = defaultdict(int)
        code_dist = defaultdict(int)
        saved = 0
        errors = 0
        start = start_offset
        page = start_offset // self.PAGE_SIZE

        while start < total:
            try:
                t0 = time.time()
                data = self._search(token, start, self.PAGE_SIZE)
                elapsed = time.time() - t0
                items = data.get('items', [])
                if not items:
                    break

                # JSON 备份
                if not options['no_backup']:
                    page_file = backup_dir / f'page_{page:05d}.json'
                    with open(page_file, 'w', encoding='utf-8') as f:
                        json.dump(items, f, ensure_ascii=False)

                # 统计
                for item in items:
                    code = item.get('form', {}).get('code', '')
                    ct = item.get('createTime', 0)
                    if ct:
                        yr = datetime.fromtimestamp(int(ct) / 1000).year
                        year_dist[yr] += 1
                    if code and len(code) >= 3:
                        code_dist[code[1:3]] += 1

                # 写入 DB
                if not dry_run and batch:
                    for item in items:
                        data_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
                        checksum = hashlib.sha256(data_str.encode()).hexdigest()
                        EkbRawRecord.objects.update_or_create(
                            batch=batch,
                            module='flows',
                            ekb_id=item.get('id', item.get('form', {}).get('code', '?')),
                            defaults={
                                'raw_data': item,
                                'scraped_at': timezone.now(),
                                'checksum': checksum,
                            }
                        )
                        saved += 1

                start += len(items)
                page += 1
                pct = start / total * 100
                self.stdout.write(
                    f'[{datetime.now():%H:%M:%S}] {start:,}/{total:,} ({pct:.1f}%) '
                    f'耗时:{elapsed:.1f}s 已保存:{saved:,}',
                    ending='\n'
                )
                self.stdout.flush()

                if len(items) < self.PAGE_SIZE:
                    break
                time.sleep(0.3)

            except Exception as e:
                errors += 1
                self.stderr.write(f'  错误 start={start}: {e}')
                if errors > 5:
                    self.stderr.write('连续错误超过5次，停止采集')
                    break
                # 尝试刷新 token
                from apps.ekuaibao_integration.models import EkbWebSession
                token = self._get_token(EkbWebSession, force_refresh=True)
                time.sleep(5)

        # 5. 完成
        if batch:
            batch.total_records = saved
            batch.status = EkbBatchStatus.COLLECTED
            batch.collected_at = timezone.now()
            batch.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n采集完成: {saved:,} 条 | 错误: {errors} | 批次: {batch_no}'
        ))
        self.stdout.write('编号年份分布（按单据编号前缀）:')
        for k in sorted(code_dist.keys()):
            self.stdout.write(f'  20{k}年: {code_dist[k]:4d} 张')
        self.stdout.write('创建时间年份分布:')
        for yr in sorted(year_dist.keys()):
            self.stdout.write(f'  {yr}年: {year_dist[yr]:4d} 条')

    def _get_token(self, EkbWebSession, force_refresh=False):
        """获取有效 token，必要时刷新"""
        if not force_refresh:
            token = EkbWebSession.get_valid_token(self.CORP_ID)
            if token:
                return token
        try:
            obj = EkbWebSession.objects.get(corp_id=self.CORP_ID)
            resp = requests.get(
                f'{self.BASE}/api/account/v2/session/getAccessToken'
                f'?accessToken={obj.web_token}&expireDate=604800',
                timeout=15
            )
            new_token = resp.json().get('value', {}).get('accessToken', '')
            if new_token:
                EkbWebSession.save_token(
                    self.CORP_ID, new_token,
                    obj.feishu_open_id, obj.feishu_staff_name
                )
                return new_token
        except Exception as e:
            raise RuntimeError(f'Token 获取失败: {e}')
        raise RuntimeError('无有效 token，请先运行 init_ekb_feishu_session')

    def _search(self, token, start, count):
        url = (f'{self.BASE}/api/flow/v1/flows/search'
               f'?accessToken={token}&corpId={self.CORP_ID}')
        resp = requests.post(url, json={'start': start, 'count': count}, timeout=60)
        resp.raise_for_status()
        return resp.json()
