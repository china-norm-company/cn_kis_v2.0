"""
批量发布知识条目脚本
将 feishu_mail / feishu_im / subject_intelligence 等来源的
quality_score >= 40 且 pending_review 的条目批量更新为 published。

用法（服务器）：
    cd /opt/cn-kis-v2/backend && source venv/bin/activate
    python /tmp/bulk_publish_knowledge.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')

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

BATCH_SIZE = 10000
STATUS_PUBLISHED = 'published'
STATUS_PENDING = 'pending_review'

placeholders = ', '.join(['%s'] * len(SOURCES))

sql = f"""
    UPDATE t_knowledge_entry
    SET status = %s,
        is_published = true,
        update_time = NOW()
    WHERE id IN (
        SELECT id
        FROM t_knowledge_entry
        WHERE status = %s
          AND quality_score >= 40
          AND is_deleted = false
          AND source_type IN ({placeholders})
        ORDER BY id
        LIMIT {BATCH_SIZE}
    )
"""

total_updated = 0
batch_num = 0
print(f'开始分批发布，batch_size={BATCH_SIZE}，来源={len(SOURCES)} 种', flush=True)

while True:
    params = [STATUS_PUBLISHED, STATUS_PENDING] + SOURCES
    with connection.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.rowcount
    connection.commit()

    batch_num += 1
    total_updated += rows
    print(f'  批次 #{batch_num}: +{rows:,} 条，累计={total_updated:,}', flush=True)

    if rows == 0:
        break

    time.sleep(0.1)

print(f'\n全部完成！共发布 {total_updated:,} 条知识条目', flush=True)
