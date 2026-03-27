"""
按 source_type 分组批量发布知识条目
每种来源单独一条 UPDATE，避免子查询全表扫描
"""
import os
import sys
import time

sys.path.insert(0, '/opt/cn-kis-v2/backend')
os.environ['DJANGO_SETTINGS_MODULE'] = 'settings'

import django
django.setup()

from django.db import connection

SOURCES = [
    'feishu_mail',
    'feishu_im',
    'feishu_task',
    'feishu_calendar',
    'feishu_doc',
    'feishu_wiki',
    'feishu_meeting',
    'subject_intelligence',
    'project_profile',
    'operations_graph',
]

total = 0

print('开始按 source_type 分组发布...', flush=True)

for src in SOURCES:
    sql = """
        UPDATE t_knowledge_entry
        SET status = 'published',
            is_published = true,
            update_time = NOW()
        WHERE source_type = %s
          AND status = 'pending_review'
          AND quality_score >= 40
          AND is_deleted = false
    """
    t0 = time.time()
    with connection.cursor() as cur:
        cur.execute(sql, [src])
        rows = cur.rowcount
    connection.commit()
    elapsed = time.time() - t0
    total += rows
    print(f'  {src}: +{rows:,} 条  ({elapsed:.1f}s)  累计={total:,}', flush=True)

print(f'\n全部完成！共发布 {total:,} 条', flush=True)
