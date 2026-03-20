"""
collect_ekb_feishu_flows_stream — 流式采集易快报飞书版历史单据

用流式 HTTP + ijson 解析，避免大响应体超时截断问题。
每次请求 count=5，流式读取，边传输边解析存储。
"""
import json
import time
import hashlib
from datetime import datetime
from collections import defaultdict

import requests
import ijson

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = '流式采集易快报飞书版全量历史单据（解决超时截断问题）'

    BASE = 'https://dd2.hosecloud.com'
    CORP_ID = 'nYA6xdjChA7c00'
    PAGE_SIZE = 5      # 小 count，确保每次能完整传输
    TIMEOUT = 120      # 流式读取超时放宽到 120 秒

    def add_arguments(self, parser):
        parser.add_argument('--start', type=int, default=0)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from apps.ekuaibao_integration.models import (
            EkbWebSession, EkbImportBatch, EkbRawRecord, EkbBatchStatus
        )

        dry_run = options['dry_run']
        start_offset = options['start']

        token = self._get_token(EkbWebSession)
        self.stdout.write(f'Token: {token[:20]}... 流式采集开始')

        # 获取总数（流式）
        self.stdout.write('获取总数...')
        total = self._get_total(token)
        self.stdout.write(self.style.SUCCESS(f'总记录数: {total:,}'))

        batch_no = datetime.now().strftime('%Y%m%d_%H%M%S')
        batch = None
        if not dry_run:
            batch = EkbImportBatch.objects.create(
                batch_no=batch_no,
                phase='feishu_flows_stream',
                modules=['flows'],
                operator='auto',
                notes='飞书版内部API流式全量采集',
            )

        year_dist = defaultdict(int)
        code_dist = defaultdict(int)
        saved = 0
        errors = 0
        start = start_offset

        while start < total:
            try:
                t0 = time.time()
                items = self._fetch_page_stream(token, start, self.PAGE_SIZE)
                elapsed = time.time() - t0

                if not items:
                    break

                if not dry_run and batch:
                    for item in items:
                        code = item.get('form', {}).get('code', item.get('id', '?'))
                        ct = item.get('createTime', 0)
                        if ct:
                            yr = datetime.fromtimestamp(int(ct) / 1000).year
                            year_dist[yr] += 1
                        if code and len(code) >= 3:
                            code_dist[code[1:3]] += 1

                        data_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
                        checksum = hashlib.sha256(data_str.encode()).hexdigest()
                        EkbRawRecord.objects.update_or_create(
                            batch=batch,
                            module='flows',
                            ekb_id=item.get('id', code),
                            defaults={
                                'raw_data': item,
                                'scraped_at': timezone.now(),
                                'checksum': checksum,
                            }
                        )
                        saved += 1

                start += len(items)
                pct = start / total * 100
                self.stdout.write(
                    f'[{datetime.now():%H:%M:%S}] {start:,}/{total:,} ({pct:.1f}%)'
                    f' {elapsed:.1f}s 已存:{saved:,}'
                )
                self.stdout.flush()

                if len(items) < self.PAGE_SIZE:
                    break
                time.sleep(0.2)

            except Exception as e:
                errors += 1
                self.stderr.write(f'  错误 start={start}: {e}')
                if errors > 5:
                    break
                # 刷新 token
                from apps.ekuaibao_integration.models import EkbWebSession as EWS
                token = self._get_token(EWS, force_refresh=True)
                time.sleep(10)

        if batch:
            batch.total_records = saved
            batch.status = EkbBatchStatus.COLLECTED
            batch.collected_at = timezone.now()
            batch.save()

        self.stdout.write(self.style.SUCCESS(
            f'完成: {saved:,} 条 | 错误: {errors} | 批次: {batch_no}'
        ))
        self.stdout.write('编号年份:')
        for k in sorted(code_dist.keys()):
            self.stdout.write(f'  20{k}: {code_dist[k]}')
        self.stdout.write('创建时间年份:')
        for yr in sorted(year_dist.keys()):
            self.stdout.write(f'  {yr}: {year_dist[yr]}')

    def _stream_raw(self, resp):
        """处理 gzip 压缩的流式响应，返回可迭代的原始字节流"""
        import gzip
        content_encoding = resp.headers.get('Content-Encoding', '')
        if 'gzip' in content_encoding:
            # 读取全部内容解压（gzip 流）
            import io
            raw = resp.raw.read()
            return io.BytesIO(gzip.decompress(raw))
        return resp.raw

    def _get_total(self, token):
        """用流式方式读取 count 字段"""
        url = (f'{self.BASE}/api/flow/v1/flows/search'
               f'?accessToken={token}&corpId={self.CORP_ID}')
        with requests.post(
            url, json={'start': 0, 'count': 1},
            stream=True, timeout=self.TIMEOUT
        ) as resp:
            resp.raise_for_status()
            stream = self._stream_raw(resp)
            for prefix, event, value in ijson.parse(stream):
                if prefix == 'count' and event in ('number', 'integer'):
                    return int(value)
        return 0

    def _fetch_page_stream(self, token, start, count):
        """流式读取一页数据，逐条解析"""
        url = (f'{self.BASE}/api/flow/v1/flows/search'
               f'?accessToken={token}&corpId={self.CORP_ID}')
        items = []
        with requests.post(
            url, json={'start': start, 'count': count},
            stream=True, timeout=self.TIMEOUT
        ) as resp:
            resp.raise_for_status()
            stream = self._stream_raw(resp)
            for item in ijson.items(stream, 'items.item'):
                items.append(item)
        return items

    def _get_token(self, EkbWebSession, force_refresh=False):
        if not force_refresh:
            token = EkbWebSession.get_valid_token(self.CORP_ID)
            if token:
                return token
        obj = EkbWebSession.objects.get(corp_id=self.CORP_ID)
        resp = requests.get(
            f'{self.BASE}/api/account/v2/session/getAccessToken'
            f'?accessToken={obj.web_token}&expireDate=604800',
            timeout=15
        )
        new_token = resp.json().get('value', {}).get('accessToken', '')
        if new_token:
            EkbWebSession.save_token(self.CORP_ID, new_token,
                                     obj.feishu_open_id, obj.feishu_staff_name)
            return new_token
        raise RuntimeError('Token 刷新失败')
