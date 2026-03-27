#!/usr/bin/env python3
"""
LIMS 增量采集独立脚本（不依赖 Django 管理命令框架）

运行条件：
  - 本机能访问 http://lims.china-norm.com:8088/（公司内网）
  - SSH 隧道已建立：ssh -L 25432:127.0.0.1:5432 root@118.196.64.48
  - playwright 已安装：pip install playwright && playwright install chromium

用法：
  python ops/scripts/lims_incremental_collect.py [--tier tier1] [--dry-run]

tier 选项：tier1（默认）| tier2 | tier3 | all
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime

# 把 backend 加入 path 以便导入 lims_fetcher_playwright
BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'backend')
sys.path.insert(0, BACKEND_DIR)

import psycopg2
import psycopg2.extras

# ----------------------------------------------------------
# 配置（从环境变量读取，默认指向SSH隧道）
# ----------------------------------------------------------
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DB_PORT', '25432')),
    'dbname': os.environ.get('DB_NAME', 'cn_kis_v2'),
    'user': os.environ.get('DB_USER', 'cn_kis'),
    'password': os.environ.get('DB_PASSWORD', 'cn_kis_2026'),
}

MODULE_TIERS = {
    'tier1': ['equipment', 'personnel', 'commission', 'commission_detection',
              'client', 'sample', 'sample_storage'],
    'tier2': ['standard', 'method', 'calibration_record', 'period_check_record',
              'reference_material', 'consumable', 'training_record',
              'competency_record', 'personnel_auth_ledger'],
    'tier3': ['equipment_usage', 'equipment_history', 'equipment_maintenance_record',
              'equipment_repair_record', 'sample_transfer', 'group_info',
              'group_personnel', 'quality_doc', 'supplier', 'supervision_record',
              'report_info', 'invoice'],
}


def compute_checksum(raw_data: dict) -> str:
    content = json.dumps(raw_data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(content.encode()).hexdigest()[:32]


def get_existing_checksums(conn, batch_id: int, module: str) -> set:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT checksum FROM t_raw_lims_record WHERE module = %s",
            (module,)
        )
        return {row[0] for row in cur.fetchall() if row[0]}


def get_or_create_batch(conn, batch_name: str, modules: list) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM t_lims_import_batch WHERE batch_no = %s", (batch_name,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            """INSERT INTO t_lims_import_batch
               (batch_no, status, modules, module_stats, backup_path,
                total_records, injected_records, conflict_count, skipped_count,
                operator, notes, create_time, collected_at)
               VALUES (%s, 'collecting', %s::jsonb, '{}'::jsonb, '',
                       0, 0, 0, 0, 'lims_incremental_collect.py', '', NOW(), NOW())
               RETURNING id""",
            (batch_name, json.dumps(modules))
        )
        return cur.fetchone()[0]


def update_batch_summary(conn, batch_db_id: int, total: int, new_cnt: int, skipped: int):
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE t_lims_import_batch
               SET status='collected', total_records=%s, injected_records=%s,
                   skipped_count=%s, collected_at=NOW()
               WHERE id=%s""",
            (total, new_cnt, skipped, batch_db_id)
        )


def write_records(conn, batch_db_id: int, records: list, existing_checksums: set,
                  dry_run: bool) -> tuple:
    """返回 (new_count, skip_count)"""
    new_cnt = 0
    skip_cnt = 0
    insert_rows = []

    for rec in records:
        raw = rec.get('raw_data', {})
        checksum = compute_checksum(raw)
        if checksum in existing_checksums:
            skip_cnt += 1
            continue
        insert_rows.append((
            rec.get('lims_id', ''),
            rec.get('module', ''),
            json.dumps(raw, ensure_ascii=False),
            checksum,
            rec.get('source_url', ''),      # → lims_page_url
            batch_db_id,
            'pending',
            rec.get('scraped_at', datetime.now().isoformat()),
        ))
        new_cnt += 1

    if not dry_run and insert_rows:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO t_raw_lims_record
                   (lims_id, module, raw_data, checksum, lims_page_url,
                    batch_id, injection_status, scraped_at, create_time)
                   VALUES %s
                   ON CONFLICT DO NOTHING""",
                insert_rows,
                template="(%s, %s, %s::jsonb, %s, %s, %s, %s, %s, NOW())",
            )

    return new_cnt, skip_cnt


def main():
    parser = argparse.ArgumentParser(description='LIMS 增量采集（内网脚本）')
    parser.add_argument('--tier', default='tier1',
                        choices=['tier1', 'tier2', 'tier3', 'all'],
                        help='采集层级（默认 tier1）')
    parser.add_argument('--modules', nargs='+', help='指定采集模块（覆盖 --tier）')
    parser.add_argument('--dry-run', action='store_true', help='仅预览，不写入')
    args = parser.parse_args()

    if args.modules:
        modules = args.modules
    elif args.tier == 'all':
        modules = sum(MODULE_TIERS.values(), [])
    else:
        modules = MODULE_TIERS[args.tier]

    print(f"{'[DRY-RUN] ' if args.dry_run else ''}LIMS 增量采集: {modules}")
    print(f"数据库: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")

    # ── 1. 连接数据库 ──────────────────────────────────────────────────
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        print("✓ 数据库连接成功")
    except Exception as e:
        print(f"✗ 数据库连接失败: {e}")
        sys.exit(1)

    # ── 2. 导入 Playwright LIMS 采集器 ────────────────────────────────
    try:
        from apps.lims_integration.lims_fetcher_playwright import LimsPlaywrightFetcher
        fetcher = LimsPlaywrightFetcher()
        print(f"✓ Playwright fetcher 初始化，Chrome: {fetcher.executable_path or '(playwright管理)'}")
    except ImportError as e:
        print(f"✗ 无法导入 LimsPlaywrightFetcher: {e}")
        conn.close()
        sys.exit(1)

    # ── 3. 采集 ────────────────────────────────────────────────────────
    batch_name = f"incremental_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    print(f"\n批次: {batch_name}")

    try:
        results = fetcher.fetch_modules(modules)
    except Exception as e:
        print(f"✗ 采集失败: {e}")
        conn.close()
        sys.exit(1)

    # ── 4. 写入数据库 ──────────────────────────────────────────────────
    total_new = 0
    total_skip = 0
    total_records = 0

    batch_db_id = None
    if not args.dry_run:
        with conn:
            batch_db_id = get_or_create_batch(conn, batch_name, modules)

    for module, (records, meta) in results.items():
        total_records += len(records)
        errors = meta.get('errors', [])
        if errors:
            print(f"  ⚠ {module}: {len(records)} 条, 错误: {'; '.join(errors[:2])}")
        else:
            print(f"  ✓ {module}: {len(records)} 条 ({meta.get('parse_method', '?')})")

        if not records:
            continue

        existing = get_existing_checksums(conn, batch_db_id, module)
        new_cnt, skip_cnt = write_records(
            conn, batch_db_id or 0, records, existing, args.dry_run
        )
        total_new += new_cnt
        total_skip += skip_cnt
        print(f"    → 新增: {new_cnt}, 跳过: {skip_cnt}")

    if not args.dry_run and batch_db_id:
        with conn:
            update_batch_summary(conn, batch_db_id, total_records, total_new, total_skip)
        conn.commit()

    conn.close()

    print(f"\n{'[DRY-RUN] ' if args.dry_run else ''}采集完成:")
    print(f"  总记录: {total_records}  新增: {total_new}  跳过(重复): {total_skip}")
    if args.dry_run:
        print("  [未写入数据库]")


if __name__ == '__main__':
    main()
