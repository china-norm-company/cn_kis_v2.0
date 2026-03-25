"""
一次性脚本：从 utest_platform.project_user_info 导入受试者到 cn_kis_v2

运行方式：
  python3 ops/scripts/import_utest_subjects_standalone.py
  python3 ops/scripts/import_utest_subjects_standalone.py --dry-run
  python3 ops/scripts/import_utest_subjects_standalone.py --enrollment-only
  python3 ops/scripts/import_utest_subjects_standalone.py --with-enrollment

前置条件：
  SSH 隧道已开：ssh -i ~/.../openclaw1.1.pem -f -N -L 25432:127.0.0.1:5432 root@118.196.64.48

详见 docs/UTEST_SUBJECT_IMPORT_RUNBOOK.md
"""
import argparse
import hashlib
import sys
import time
from collections import defaultdict
from datetime import date, datetime

import psycopg2
import psycopg2.extras
import pymysql
import pymysql.cursors

# ── 数据源（阿里云 MySQL，只读）──────────────────────────────────────────────
MYSQL_CONFIG = dict(
    host='rm-uf642x10u6n6ag3kc3o.mysql.rds.aliyuncs.com',
    port=3306,
    user='fushuo_read',
    password='fushuo@123',
    database='utest_platform',
    charset='utf8mb4',
    connect_timeout=15,
    cursorclass=pymysql.cursors.DictCursor,
)

# ── 目标库（V2 PostgreSQL，经 SSH 隧道）──────────────────────────────────────
PG_CONFIG = dict(
    host='127.0.0.1',
    port=25432,
    user='cn_kis',
    password='cn_kis_2026',
    dbname='cn_kis_v2',
)

FAKE_PHONE = '99999999999'
CHUNK_SIZE = 500

GENDER_MAP = {
    '女性': 'female', '女': 'female', 'f': 'female',
    '男性': 'male',   '男': 'male',   'm': 'male',
}
SOURCE_MAP = {
    '联络员': 'referral', '扫库': 'database',
    '推广': 'advertisement', '中介': 'other',
    '企微': 'wechat', '微信': 'wechat', '小红书': 'online',
}


# ── 工具函数 ──────────────────────────────────────────────────────────────────

def sha256(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()


def norm_phone(p) -> str:
    if not p:
        return ''
    s = str(p).strip().replace('-', '').replace(' ', '')
    return s if len(s) >= 11 else ''


def norm_gender(s) -> str:
    return GENDER_MAP.get((s or '').strip(), '')


def norm_source(s) -> str:
    return SOURCE_MAP.get((s or '').strip(), 'other')


def make_pseudonym(year: int, n: int) -> str:
    return f'CN{year}-{n:05d}'


def make_subject_no(n: int) -> str:
    today = date.today()
    return f'UTEST-{today.strftime("%Y%m")}-{n:04d}'


def progress(done, total, start_ts, label=''):
    pct = done / total * 100 if total else 0
    elapsed = time.time() - start_ts
    eta = (elapsed / done * (total - done)) if done else 0
    bar = '█' * int(pct // 4) + '░' * (25 - int(pct // 4))
    sys.stdout.write(
        f'\r  {label}[{bar}] {done:,}/{total:,}  {pct:.1f}%  '
        f'耗时 {elapsed:.0f}s  ETA {eta:.0f}s'
    )
    sys.stdout.flush()
    if done >= total:
        print()


# ── 数据拉取 ──────────────────────────────────────────────────────────────────

def fetch_source(limit=0):
    print('📥 连接 utest_platform MySQL...')
    conn = pymysql.connect(**MYSQL_CONFIG)
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT id, user_name, phone, id_card, age, sex,
                       city, source_channel, liaison_name,
                       project_id, project_name, sc_id, rd_id,
                       guardian_name, guardian_phone, guardian_relationship,
                       created_at
                FROM project_user_info
                ORDER BY id
            """
            if limit:
                sql += f' LIMIT {limit}'
            cur.execute(sql)
            rows = cur.fetchall()
    finally:
        conn.close()
    print(f'   获取 {len(rows):,} 条原始记录')
    return rows


# ── 去重分组 ──────────────────────────────────────────────────────────────────

def build_groups(rows):
    print('\n🔍 构建去重分组（身份证 > 手机 > 姓名）...')

    # 统计每个身份证号对应的姓名频次（多姓名时取最多的）
    id_name_freq = defaultdict(lambda: defaultdict(int))
    for r in rows:
        id_card = (r.get('id_card') or '').strip()
        name = (r.get('user_name') or '').strip()
        if id_card:
            id_name_freq[id_card][name] += 1

    groups = {}
    for r in rows:
        id_card = (r.get('id_card') or '').strip()
        phone   = norm_phone(r.get('phone') or '')
        name    = (r.get('user_name') or '').strip()

        if id_card:
            key = f'id:{sha256(id_card)}'
            ktype = 'id_card'
        elif phone and phone != FAKE_PHONE:
            key = f'ph:{phone}'
            ktype = 'phone'
        else:
            key = f'nm:{name}'
            ktype = 'name'

        if key not in groups:
            groups[key] = {
                'rep': r, 'rows': [r],
                'ktype': ktype, 'id_card': id_card,
                'needs_review': False,
            }
        else:
            groups[key]['rows'].append(r)
            # 保留最新记录为主记录
            if (r.get('created_at') or datetime.min) > (groups[key]['rep'].get('created_at') or datetime.min):
                groups[key]['rep'] = r

    # 标记同一身份证多个姓名
    needs_review_count = 0
    for grp in groups.values():
        if grp['ktype'] == 'id_card' and grp['id_card']:
            names = id_name_freq[grp['id_card']]
            if len(names) > 1:
                grp['needs_review'] = True
                best = max(names, key=lambda n: names[n])
                grp['rep'] = dict(grp['rep'])
                grp['rep']['user_name'] = best
                needs_review_count += 1

    print(f'   去重后唯一受试者: {len(groups):,} 人')
    print(f'   同一身份证多姓名（需人工核查）: {needs_review_count} 人')
    return groups


# ── 写入 PostgreSQL ───────────────────────────────────────────────────────────

def get_pseudo_counter(pg):
    with pg.cursor() as cur:
        cur.execute(
            "SELECT pseudonym_code FROM t_subject_pseudonym ORDER BY pseudonym_code DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            try:
                return int(row[0].split('-')[-1])
            except (ValueError, IndexError):
                pass
    return 0


def upsert_subjects(pg, groups, dry_run):
    """autocommit=True 模式：每条记录独立提交，kill 不丢数据"""
    print(f'\n📝 写入 t_subject / t_subject_profile / t_subject_pseudonym...')
    year = date.today().year
    counter = get_pseudo_counter(pg)

    created = updated = skipped = 0
    items = list(groups.items())
    total = len(items)
    start = time.time()
    cur = pg.cursor()

    for idx, (key, grp) in enumerate(items):
        counter += 1
        if dry_run:
            created += 1
            if (idx + 1) % CHUNK_SIZE == 0 or idx + 1 == total:
                progress(idx + 1, total, start, '受试者 ')
            continue

        r = grp['rep']
        id_card = grp['id_card']
        phone = norm_phone(r.get('phone') or '')
        if phone == FAKE_PHONE:
            phone = ''
        name = (r.get('user_name') or '').strip() or '未知'
        gender = norm_gender(r.get('sex'))
        age = r.get('age')
        city = (r.get('city') or '').strip()
        source = norm_source(r.get('source_channel'))
        id_hash = sha256(id_card) if id_card else ''
        pseudo = make_pseudonym(year, counter)
        subject_no = make_subject_no(counter)

        try:
            # 查重：身份证哈希优先
            subject_id = None
            if id_hash:
                cur.execute(
                    "SELECT s.id FROM t_subject s "
                    "JOIN t_subject_profile p ON p.subject_id=s.id "
                    "WHERE p.id_card_hash=%s LIMIT 1",
                    (id_hash,)
                )
                row = cur.fetchone()
                if row:
                    subject_id = row[0]

            if subject_id is None and phone:
                cur.execute(
                    "SELECT id FROM t_subject WHERE phone=%s LIMIT 1",
                    (phone,)
                )
                row = cur.fetchone()
                if row:
                    subject_id = row[0]

            if subject_id is None:
                # 新建 Subject（autocommit → 立即持久化）
                auth_level = 'identity_verified' if id_card else 'guest'
                cur.execute("""
                    INSERT INTO t_subject
                      (name, gender, age, phone, source_channel, status,
                       auth_level, is_deleted, skin_type, risk_level,
                       subject_no, id_card_encrypted, create_time, update_time)
                    VALUES (%s,%s,%s,%s,%s,'completed',%s,false,'','low',%s,'',NOW(),NOW())
                    RETURNING id
                """, (name, gender, age or None, phone[:20] if phone else '',
                      source, auth_level, subject_no))
                subject_id = cur.fetchone()[0]

                # SubjectProfile
                cur.execute("""
                    INSERT INTO t_subject_profile
                      (subject_id, id_card_hash, id_card_last4, city,
                       total_enrollments, total_completed, privacy_level,
                       consent_data_sharing, consent_rwe_usage,
                       consent_biobank, consent_follow_up, data_retention_years,
                       ethnicity, education, occupation, marital_status,
                       id_card_encrypted, name_pinyin, phone_backup, email,
                       province, district, address, postal_code,
                       emergency_contact_name, emergency_contact_phone,
                       emergency_contact_relation, create_time, update_time)
                    VALUES (%s,%s,%s,%s,%s,0,'standard',false,false,false,false,10,
                            '','','','','','','','','','','','','','','',NOW(),NOW())
                    ON CONFLICT (subject_id) DO NOTHING
                """, (
                    subject_id, id_hash,
                    id_card[-4:] if id_card and len(id_card) >= 4 else '',
                    city,
                    len({(rr.get('project_id') or '').strip()
                         for rr in grp['rows']
                         if (rr.get('project_id') or '').strip()}),
                ))

                # SubjectPseudonym
                cur.execute("""
                    INSERT INTO t_subject_pseudonym
                      (subject_id, pseudonym_code, id_card_hash,
                       name_encrypted, phone_encrypted,
                       encryption_key_ref, is_active, pseudonymized_at)
                    VALUES (%s,%s,%s,'','','',false,NOW())
                    ON CONFLICT (subject_id) DO NOTHING
                """, (subject_id, pseudo, id_hash))

                created += 1

            else:
                # 更新补全空字段
                cur.execute("""
                    UPDATE t_subject
                    SET gender = CASE WHEN gender='' OR gender IS NULL THEN %s ELSE gender END,
                        age    = CASE WHEN age IS NULL THEN %s ELSE age END,
                        phone  = CASE WHEN phone='' OR phone IS NULL THEN %s ELSE phone END,
                        update_time = NOW()
                    WHERE id=%s
                """, (gender, age or None, phone[:20] if phone else '', subject_id))
                updated += 1

        except Exception as e:
            skipped += 1
            sys.stderr.write(f'\n  ⚠ 跳过 key={key}: {e}\n')

        if (idx + 1) % CHUNK_SIZE == 0 or idx + 1 == total:
            progress(idx + 1, total, start, '受试者 ')

    print(f'   新建: {created:,}  更新: {updated:,}  跳过: {skipped:,}')
    return created, updated


def run_enrollment_batch(pg, rows, dry_run=False):
    """
    批量写入 t_enrollment：先全量加载 subject/protocol 映射，再内存配对，最后 execute_values 分批插入。
    仅当 t_protocol.code 与 utest project_id（大小写不敏感）一致时才会产生入组行。
    """
    print('\n🔗 批量写入 t_enrollment（按 Protocol.code = utest.project_id 匹配）...')
    cur = pg.cursor()

    cur.execute(
        "SELECT UPPER(TRIM(code)), id FROM t_protocol WHERE TRIM(code) <> ''"
    )
    proto_by_code = {r[0]: r[1] for r in cur.fetchall()}
    print(f'   V2 中可用方案数: {len(proto_by_code):,}')

    cur.execute(
        """
        SELECT p.id_card_hash, s.id
        FROM t_subject s
        JOIN t_subject_profile p ON p.subject_id = s.id
        WHERE p.id_card_hash IS NOT NULL AND p.id_card_hash <> ''
        """
    )
    subject_by_hash = {r[0]: r[1] for r in cur.fetchall()}

    cur.execute(
        """
        SELECT phone, id FROM t_subject
        WHERE phone IS NOT NULL AND phone <> ''
        """
    )
    subject_by_phone = {r[0]: r[1] for r in cur.fetchall()}

    pairs = set()
    skipped_no_project = 0
    skipped_no_proto = 0
    skipped_no_subject = 0

    for r in rows:
        project_id = (r.get('project_id') or '').strip()
        if not project_id:
            skipped_no_project += 1
            continue
        pcode = project_id.upper()
        protocol_id = proto_by_code.get(pcode)
        if not protocol_id:
            skipped_no_proto += 1
            continue

        id_card = (r.get('id_card') or '').strip()
        id_hash = sha256(id_card) if id_card else ''
        phone = norm_phone(r.get('phone') or '')
        if phone == FAKE_PHONE:
            phone = ''

        sid = None
        if id_hash:
            sid = subject_by_hash.get(id_hash)
        if sid is None and phone:
            sid = subject_by_phone.get(phone)
        if sid is None:
            skipped_no_subject += 1
            continue
        pairs.add((sid, protocol_id))

    print(f'   可写入 (受试者,方案) 去重对数: {len(pairs):,}')
    print(f'   跳过: 无项目号 {skipped_no_project:,} | 无匹配方案 {skipped_no_proto:,} | 无受试者 {skipped_no_subject:,}')

    if dry_run or not pairs:
        return 0

    pg.autocommit = False
    plist = list(pairs)
    total_ins = 0
    batch = 2000
    t0 = time.time()

    for i in range(0, len(plist), batch):
        chunk = plist[i : i + batch]
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO t_enrollment
              (subject_id, protocol_id, status, enrolled_at, create_time, update_time)
            VALUES %s
            ON CONFLICT (subject_id, protocol_id) DO NOTHING
            """,
            chunk,
            template="(%s, %s, 'completed', NOW(), NOW(), NOW())",
            page_size=len(chunk),
        )
        total_ins += cur.rowcount
        pg.commit()
        progress(min(i + batch, len(plist)), len(plist), t0, 'Enrollment ')

    print(f'   本次新插入行数（ON CONFLICT 后 rowcount）: {total_ins:,}')
    pg.autocommit = True
    return total_ins


# ── 入口 ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='从 utest_platform 导入受试者（一次性）')
    parser.add_argument('--dry-run', action='store_true', help='预览不写入')
    parser.add_argument('--limit', type=int, default=0, help='仅处理前 N 条')
    parser.add_argument(
        '--enrollment-only',
        action='store_true',
        help='仅执行入组关联（需已导入受试者，且 t_protocol.code 与 utest project_id 一致）',
    )
    parser.add_argument(
        '--with-enrollment',
        action='store_true',
        help='导入/更新受试者后，再批量写入 t_enrollment',
    )
    args = parser.parse_args()

    mode = '🔍 DRY-RUN（不写入）' if args.dry_run else '🚀 正式导入'
    print(f'\n{"=" * 55}')
    print(f'  utest_platform → cn_kis_v2 受试者导入')
    print(f'  模式: {mode}')
    if args.limit:
        print(f'  限制: 前 {args.limit:,} 条')
    if args.enrollment_only:
        print('  子模式: 仅入组关联')
    elif args.with_enrollment:
        print('  子模式: 受试者 + 入组')
    print(f'{"=" * 55}\n')

    t0 = time.time()
    rows = fetch_source(limit=args.limit)

    if args.dry_run and args.enrollment_only:
        print('\n📡 连接 cn_kis_v2（仅统计入组可对）...')
        pg = psycopg2.connect(**PG_CONFIG)
        pg.autocommit = True
        try:
            run_enrollment_batch(pg, rows, dry_run=True)
        finally:
            pg.close()
        print('\n✅ DRY-RUN 完成')
        return

    if args.dry_run and not args.enrollment_only:
        groups = build_groups(rows)
        print(f'\n✅ DRY-RUN 完成，预计将写入:')
        print(f'   受试者分组: {len(groups):,} 组')
        return

    print('\n📡 连接 cn_kis_v2 PostgreSQL（经 SSH 隧道 25432）...')
    pg = psycopg2.connect(**PG_CONFIG)
    pg.autocommit = True

    created = updated = 0
    enroll_created = 0

    try:
        if args.enrollment_only:
            enroll_created = run_enrollment_batch(pg, rows, dry_run=False)
        else:
            groups = build_groups(rows)
            created, updated = upsert_subjects(pg, groups, dry_run=False)
            if args.with_enrollment:
                enroll_created = run_enrollment_batch(pg, rows, dry_run=False)
            else:
                print('\n🔗 跳过入组（加 --with-enrollment 或单独 --enrollment-only 补录）')
    finally:
        pg.close()

    elapsed = time.time() - t0
    print(f'\n{"=" * 55}')
    print(f'  ✅ 完成  总耗时 {elapsed:.0f}s')
    print(f'{"=" * 55}')
    if not args.enrollment_only:
        print(f'  新建受试者:   {created:,}')
        print(f'  更新受试者:   {updated:,}')
    print(f'  入组新插入:   {enroll_created:,}')
    print(f'{"=" * 55}\n')


if __name__ == '__main__':
    main()
