"""
link_lims_ekb_to_protocol — 三方数据关联命令

职责：
  1. 将 ExpenseRequest.protocol_id 通过 project_name → Protocol.code 填充
  2. 将 SubjectPayment.protocol_id 通过 project_code → Protocol.code 填充
  3. 刷新 ProtocolCostSnapshot（每个 Protocol 的全景成本快照）

用法：
  python manage.py link_lims_ekb_to_protocol            # 全量执行
  python manage.py link_lims_ekb_to_protocol --step ekb  # 只填充报销单
  python manage.py link_lims_ekb_to_protocol --step payment  # 只填充礼金
  python manage.py link_lims_ekb_to_protocol --step snapshot  # 只刷新快照
  python manage.py link_lims_ekb_to_protocol --dry-run   # 预览
"""
import json
import logging
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

logger = logging.getLogger('cn_kis.link_lims_ekb')


class Command(BaseCommand):
    help = '三方数据关联：EkuaiBao报销单 + LIMS受试者礼金 → Protocol 成本快照'

    def add_arguments(self, parser):
        parser.add_argument(
            '--step',
            choices=['ekb', 'payment', 'snapshot', 'all'],
            default='all',
            help='执行步骤：ekb=填充报销单protocol_id | payment=填充礼金protocol_id | snapshot=刷新成本快照',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='预览模式，不写入数据库',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='每批更新记录数（默认 1000）',
        )

    def handle(self, *args, **options):
        step = options['step']
        dry_run = options['dry_run']
        batch_size = options['batch_size']

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n=== link_lims_ekb_to_protocol {"[DRY-RUN]" if dry_run else ""} ===\n'
        ))

        if step in ('ekb', 'all'):
            self._step_ekb_protocol_id(dry_run, batch_size)

        if step in ('payment', 'all'):
            self._step_payment_protocol_id(dry_run, batch_size)

        if step in ('snapshot', 'all'):
            self._step_refresh_snapshot(dry_run)

        self.stdout.write(self.style.SUCCESS('\n完成。\n'))

    # ──────────────────────────────────────────────────────────────
    # Step 1: 填充 ExpenseRequest.protocol_id
    # ──────────────────────────────────────────────────────────────
    def _step_ekb_protocol_id(self, dry_run: bool, batch_size: int):
        self.stdout.write(self.style.MIGRATE_LABEL('[Step 1] 填充 ExpenseRequest.protocol_id'))
        cur = connection.cursor()

        cur.execute("""
            SELECT COUNT(*)
            FROM t_expense_request e
            WHERE e.protocol_id IS NULL
              AND e.project_name != ''
              AND e.project_name != '（待填写）'
              AND EXISTS (
                  SELECT 1 FROM t_protocol p
                  WHERE p.code = e.project_name AND p.is_deleted = false
              )
        """)
        total = cur.fetchone()[0]
        self.stdout.write(f'  待填充: {total:,} 条')

        if dry_run or total == 0:
            if total == 0:
                self.stdout.write('  无需更新。')
            return

        with transaction.atomic():
            cur.execute("""
                UPDATE t_expense_request e
                SET protocol_id = p.id
                FROM t_protocol p
                WHERE e.protocol_id IS NULL
                  AND e.project_name != ''
                  AND e.project_name != '（待填写）'
                  AND p.code = e.project_name
                  AND p.is_deleted = false
            """)
            updated = cur.rowcount

        self.stdout.write(self.style.SUCCESS(f'  ✔ ExpenseRequest.protocol_id 填充完成: {updated:,} 条'))

    # ──────────────────────────────────────────────────────────────
    # Step 2: 填充 SubjectPayment.protocol_id
    # ──────────────────────────────────────────────────────────────
    def _step_payment_protocol_id(self, dry_run: bool, batch_size: int):
        self.stdout.write(self.style.MIGRATE_LABEL('[Step 2] 填充 SubjectPayment.protocol_id'))
        cur = connection.cursor()

        cur.execute("""
            SELECT COUNT(*)
            FROM t_subject_payment sp
            WHERE sp.protocol_id IS NULL
              AND sp.project_code IS NOT NULL
              AND sp.project_code != ''
              AND EXISTS (
                  SELECT 1 FROM t_protocol p
                  WHERE p.code = sp.project_code AND p.is_deleted = false
              )
        """)
        total = cur.fetchone()[0]
        self.stdout.write(f'  待填充: {total:,} 条')

        if dry_run or total == 0:
            if total == 0:
                self.stdout.write('  无需更新。')
            return

        with transaction.atomic():
            cur.execute("""
                UPDATE t_subject_payment sp
                SET protocol_id = p.id
                FROM t_protocol p
                WHERE sp.protocol_id IS NULL
                  AND sp.project_code IS NOT NULL
                  AND sp.project_code != ''
                  AND p.code = sp.project_code
                  AND p.is_deleted = false
            """)
            updated = cur.rowcount

        self.stdout.write(self.style.SUCCESS(f'  ✔ SubjectPayment.protocol_id 填充完成: {updated:,} 条'))

    # ──────────────────────────────────────────────────────────────
    # Step 3: 刷新 ProtocolCostSnapshot
    # ──────────────────────────────────────────────────────────────
    def _step_refresh_snapshot(self, dry_run: bool):
        self.stdout.write(self.style.MIGRATE_LABEL('[Step 3] 刷新 ProtocolCostSnapshot'))
        cur = connection.cursor()

        # 获取所有有关联数据的 Protocol
        cur.execute("""
            SELECT DISTINCT code FROM (
                SELECT p.code FROM t_protocol p
                JOIN t_expense_request e ON e.project_name = p.code
                WHERE p.is_deleted = false AND e.project_name != ''
                UNION
                SELECT p.code FROM t_protocol p
                JOIN t_subject_payment sp ON sp.project_code = p.code
                WHERE p.is_deleted = false AND sp.project_code != ''
                UNION
                SELECT code FROM t_protocol WHERE is_deleted = false
            ) x
        """)
        protocol_codes = [r[0] for r in cur.fetchall()]
        self.stdout.write(f'  需要快照的 Protocol: {len(protocol_codes):,} 个')

        if dry_run:
            self.stdout.write('  [DRY-RUN] 跳过写入。')
            return

        upserted = 0
        now = timezone.now()

        # 分批构建快照
        CHUNK = 50
        for i in range(0, len(protocol_codes), CHUNK):
            chunk = protocol_codes[i:i + CHUNK]
            self._upsert_snapshots_for_codes(cur, chunk, now)
            upserted += len(chunk)
            self.stdout.write(f'  进度: {upserted}/{len(protocol_codes)}')

        self.stdout.write(self.style.SUCCESS(f'  ✔ ProtocolCostSnapshot 刷新完成: {upserted} 个项目'))

    def _upsert_snapshots_for_codes(self, cur, codes: list, now):
        placeholders = ','.join(['%s'] * len(codes))

        # 1. Protocol 基本信息
        cur.execute(f"""
            SELECT id, code, title, status FROM t_protocol
            WHERE code IN ({placeholders}) AND is_deleted = false
        """, codes)
        proto_map = {r[1]: {'id': r[0], 'title': r[2], 'status': r[3]} for r in cur.fetchall()}

        # 2. EkuaiBao 维度
        cur.execute(f"""
            SELECT
                project_name,
                COUNT(*) cnt,
                COALESCE(SUM(amount), 0) total,
                COALESCE(SUM(CASE WHEN approval_status IN ('approved','reimbursed') THEN amount ELSE 0 END), 0) approved
            FROM t_expense_request
            WHERE project_name IN ({placeholders})
            GROUP BY project_name
        """, codes)
        ekb_map = {}
        for r in cur.fetchall():
            ekb_map[r[0]] = {
                'count': r[1], 'total': r[2], 'approved': r[3],
                'types': {},
            }

        # EkuaiBao 费用类型分布（单独查询避免复杂分组）
        cur.execute(f"""
            SELECT project_name, expense_type, COUNT(*) cnt
            FROM t_expense_request
            WHERE project_name IN ({placeholders})
            GROUP BY project_name, expense_type
        """, codes)
        for r in cur.fetchall():
            if r[0] in ekb_map:
                ekb_map[r[0]]['types'][r[1]] = r[2]

        # 3. 受试者礼金维度
        cur.execute(f"""
            SELECT
                project_code,
                COUNT(*) cnt,
                COUNT(CASE WHEN status='paid' THEN 1 END) paid_cnt,
                COALESCE(SUM(amount), 0) total,
                COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END), 0) paid_total,
                COUNT(DISTINCT subject_id) subject_cnt
            FROM t_subject_payment
            WHERE project_code IN ({placeholders})
            GROUP BY project_code
        """, codes)
        payment_map = {}
        for r in cur.fetchall():
            payment_map[r[0]] = {
                'count': r[1], 'paid_count': r[2], 'total': r[3],
                'paid_total': r[4], 'subject_count': r[5],
            }

        # 4. 预算维度
        cur.execute(f"""
            SELECT
                project_name,
                COUNT(*) cnt,
                COALESCE(SUM(total_income), 0) total
            FROM t_project_budget
            WHERE project_name IN ({placeholders})
            GROUP BY project_name
        """, codes)
        budget_map = {}
        for r in cur.fetchall():
            budget_map[r[0]] = {'count': r[1], 'total': r[2]}

        # 5. Upsert
        for code in codes:
            p = proto_map.get(code, {})
            ekb = ekb_map.get(code, {})
            pay = payment_map.get(code, {})
            bud = budget_map.get(code, {})

            cur.execute("""
                INSERT INTO t_protocol_cost_snapshot
                  (protocol_code, protocol_id, protocol_title, protocol_status,
                   ekb_expense_count, ekb_expense_total, ekb_approved_total, ekb_expense_types,
                   subject_payment_count, subject_paid_count, subject_payment_total, subject_paid_total, subject_count,
                   budget_count, budget_total,
                   computed_at, create_time, update_time)
                VALUES
                  (%s, %s, %s, %s,
                   %s, %s, %s, %s,
                   %s, %s, %s, %s, %s,
                   %s, %s,
                   %s, NOW(), NOW())
                ON CONFLICT (protocol_code) DO UPDATE SET
                  protocol_id = EXCLUDED.protocol_id,
                  protocol_title = EXCLUDED.protocol_title,
                  protocol_status = EXCLUDED.protocol_status,
                  ekb_expense_count = EXCLUDED.ekb_expense_count,
                  ekb_expense_total = EXCLUDED.ekb_expense_total,
                  ekb_approved_total = EXCLUDED.ekb_approved_total,
                  ekb_expense_types = EXCLUDED.ekb_expense_types,
                  subject_payment_count = EXCLUDED.subject_payment_count,
                  subject_paid_count = EXCLUDED.subject_paid_count,
                  subject_payment_total = EXCLUDED.subject_payment_total,
                  subject_paid_total = EXCLUDED.subject_paid_total,
                  subject_count = EXCLUDED.subject_count,
                  budget_count = EXCLUDED.budget_count,
                  budget_total = EXCLUDED.budget_total,
                  computed_at = EXCLUDED.computed_at,
                  update_time = NOW()
            """, [
                code, p.get('id'), p.get('title', ''), p.get('status', ''),
                ekb.get('count', 0), ekb.get('total', 0), ekb.get('approved', 0),
                json.dumps(ekb.get('types', {}), ensure_ascii=False),
                pay.get('count', 0), pay.get('paid_count', 0),
                pay.get('total', 0), pay.get('paid_total', 0), pay.get('subject_count', 0),
                bud.get('count', 0), bud.get('total', 0),
                now,
            ])
