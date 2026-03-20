"""
ingest_ekb_flows_json — 将本机采集的 JSON 文件写入 EkbRawRecord

usage: python manage.py ingest_ekb_flows_json --file /opt/cn-kis/backend/data/ekb_flows_all.json
"""
import json, hashlib
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = '将本机采集的易快报 JSON 文件导入 EkbRawRecord'

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True, help='JSON 文件路径')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from apps.ekuaibao_integration.models import EkbImportBatch, EkbRawRecord, EkbBatchStatus

        fpath = options['file']
        dry_run = options['dry_run']

        self.stdout.write(f'加载 {fpath}...')
        with open(fpath, 'r', encoding='utf-8') as f:
            items = json.load(f)
        self.stdout.write(self.style.SUCCESS(f'共 {len(items):,} 条'))

        if dry_run:
            from collections import defaultdict
            from datetime import datetime, timezone as tz, timedelta
            CST = tz(timedelta(hours=8))
            year_dist = defaultdict(int)
            code_dist = defaultdict(int)
            for item in items:
                code = item.get('form', {}).get('code', '')
                ct = item.get('createTime', 0)
                if ct:
                    yr = datetime.fromtimestamp(int(ct)/1000, tz=CST).year
                    year_dist[yr] += 1
                if code and len(code) >= 3:
                    code_dist[code[1:3]] += 1
            self.stdout.write('创建时间年份:')
            for yr in sorted(year_dist):
                self.stdout.write(f'  {yr}: {year_dist[yr]:,}')
            return

        # 创建批次
        from datetime import datetime
        batch_no = datetime.now().strftime('%Y%m%d_%H%M%S') + '_mac_collect'
        batch = EkbImportBatch.objects.create(
            batch_no=batch_no,
            phase='feishu_flows_mac',
            modules=['flows'],
            operator='auto',
            notes=f'本机采集导入 {len(items):,}条 2018-2026',
        )
        self.stdout.write(f'批次: {batch_no}')

        saved = updated = 0
        for i, item in enumerate(items):
            ekb_id = item.get('id', '')
            if not ekb_id:
                continue
            data_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
            checksum = hashlib.sha256(data_str.encode()).hexdigest()
            _, created = EkbRawRecord.objects.update_or_create(
                batch=batch,
                module='flows',
                ekb_id=ekb_id,
                defaults={
                    'raw_data': item,
                    'scraped_at': timezone.now(),
                    'checksum': checksum,
                }
            )
            if created:
                saved += 1
            else:
                updated += 1

            if (i + 1) % 2000 == 0:
                self.stdout.write(f'  进度: {i+1:,}/{len(items):,} 新增:{saved:,}')
                self.stdout.flush()

        batch.total_records = saved + updated
        batch.status = EkbBatchStatus.COLLECTED
        batch.collected_at = timezone.now()
        batch.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n完成: 新增={saved:,} 更新={updated:,} 批次={batch_no}'
        ))
