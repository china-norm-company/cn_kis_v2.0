#!/usr/bin/env python3
"""
import_channel_registration.py
渠道客户报名（总表）全量导入脚本

功能：
  1. 解析本地 Excel 文件：渠道客户报名（总表）.xlsx（4768行）
  2. 提取：姓名、出生年月日、电话、项目、渠道、筛选状态、约访、合格、完成、备注
  3. 与 t_subject 匹配（手机精确匹配为主，姓名+生日年辅助）
  4. 已匹配受试者：补全 birth_date、age、source_channel（不覆盖已有数据）
  5. 未匹配受试者：创建完整 t_subject + t_subject_profile
  6. 每条报名记录（每行）全量写入 t_subject_questionnaire.answers（JSONB，零截断）
  7. 不丢弃任何可用信息

规范：
  - ⚠️ 不截断：每行所有列均原样写入 answers JSON，不省略任何字段
  - 出生日期支持 4 种格式：datetime / Excel 序列整数 / 年.月浮点 / 字符串
  - subject_no 格式：CHR-{YYYYMM}-{seq:05d}（最长16字符，符合 VARCHAR(20)）

运行方式：
  python3 ops/scripts/import_channel_registration.py --dry-run
  python3 ops/scripts/import_channel_registration.py --db-password cn_kis_2026
"""
import argparse
import datetime
import json
import os
import re
import sys

for pkg, name in [('psycopg2', 'psycopg2-binary'), ('openpyxl', 'openpyxl')]:
    try:
        __import__(pkg)
    except ImportError:
        sys.exit(f'缺少依赖: pip install {name}')

import psycopg2
import psycopg2.extras
import openpyxl
from psycopg2.extras import execute_values

# ─── 配置 ────────────────────────────────────────────────────────────────────
SOURCE_FILE = os.path.expanduser('~/Downloads/渠道客户报名（总表）.xlsx')
PG_HOST     = '127.0.0.1'
PG_PORT     = 25432
PG_DB       = 'cn_kis_v2'
PG_USER     = 'cn_kis'
PG_PASS     = os.getenv('V2_DB_PASSWORD', '')

IMPORT_BATCH    = f'channel-reg-{datetime.date.today().isoformat()}'
EXCEL_EPOCH     = datetime.date(1899, 12, 30)   # Excel 日期序列起点（含 1900 闰年 bug）

# 渠道 → source_channel 映射
CHANNEL_MAP = {
    '小红书': 'xiaohongshu', '企微': 'wechat', '社群': 'wechat', '群': 'wechat',
    '广告': 'advertisement', '无': 'other', '': 'other',
}
# 不在映射中的名字类渠道（人名）→ referral

# ─── 工具函数 ─────────────────────────────────────────────────────────────────

def norm_phone(p):
    if not p:
        return ''
    s = str(p).strip()
    if '.' in s:
        try:
            s = str(int(float(s)))
        except Exception:
            pass
    digits = re.sub(r'\D', '', s)
    return digits[-11:] if len(digits) >= 11 else digits


def valid_phone(p: str):
    return bool(re.match(r'^1[3-9]\d{9}$', p or ''))


def parse_birth_date(v):
    """
    解析出生日期字段，支持：
      - datetime / date 对象
      - int：Excel 序列日期（如 39252 → 2007-07-06）
      - float：年.月格式（如 1994.12 → 1994-12-01）或 Excel 序列
      - str：多种文本格式 + '70岁'等描述
    """
    if v is None or v == '':
        return None

    # datetime / date 对象
    if isinstance(v, (datetime.datetime, datetime.date)):
        d = v.date() if isinstance(v, datetime.datetime) else v
        # 合理性检查：1920-2015 之间
        if datetime.date(1920, 1, 1) <= d <= datetime.date(2015, 12, 31):
            return d
        return None

    # 整数：Excel 序列
    if isinstance(v, int):
        try:
            d = EXCEL_EPOCH + datetime.timedelta(days=v)
            if datetime.date(1920, 1, 1) <= d <= datetime.date(2015, 12, 31):
                return d
        except Exception:
            pass
        return None

    # 浮点：年.月格式 或 Excel 序列（大浮点）
    if isinstance(v, float):
        iv = int(v)
        frac = v - iv
        # 大数 → Excel 序列
        if iv > 10000:
            try:
                d = EXCEL_EPOCH + datetime.timedelta(days=int(v))
                if datetime.date(1920, 1, 1) <= d <= datetime.date(2015, 12, 31):
                    return d
            except Exception:
                pass
            return None
        # 年.月格式：1994.12 → 1994年12月1日
        if 1920 <= iv <= 2015:
            month_frac = round(frac * 100)  # 0.12 → 12
            if 1 <= month_frac <= 12:
                try:
                    return datetime.date(iv, month_frac, 1)
                except Exception:
                    pass
            # 尝试直接用整数年
            try:
                return datetime.date(iv, 1, 1)
            except Exception:
                pass
        return None

    # 字符串
    s = str(v).strip()

    # '70岁' 格式：从当前年倒推出生年
    m = re.match(r'^(\d+)\s*岁$', s)
    if m:
        age = int(m.group(1))
        birth_year = datetime.date.today().year - age
        if 1920 <= birth_year <= 2015:
            return datetime.date(birth_year, 1, 1)
        return None

    # 纯4位年份
    if re.match(r'^\d{4}$', s):
        yr = int(s)
        if 1920 <= yr <= 2015:
            return datetime.date(yr, 1, 1)
        return None

    # YYYYMMDD
    m = re.match(r'^(\d{4})(\d{2})(\d{2})$', s)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except Exception:
            pass

    # 各种分隔符：YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD / YYYY年MM月DD日
    m = re.match(r'^(\d{4})[\-./年](\d{1,2})[\-./月](\d{1,2})', s)
    if m:
        try:
            d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if datetime.date(1920, 1, 1) <= d <= datetime.date(2015, 12, 31):
                return d
        except Exception:
            pass

    # 年.月（字符串形式） 1994.12
    m = re.match(r'^(\d{4})\.(\d{1,2})$', s)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), 1)
        except Exception:
            pass

    return None


def calc_age(birth_date):
    if not birth_date:
        return None
    today = datetime.date.today()
    age = today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )
    return max(0, age) if 0 <= age <= 120 else None


def map_source_channel(channel_raw: str):
    if not channel_raw or channel_raw.strip() in ('', '无'):
        return 'other'
    ch = channel_raw.strip()
    if ch in CHANNEL_MAP:
        return CHANNEL_MAP[ch]
    # 人名（纯中文且 ≤4字）→ referral
    if re.match(r'^[\u4e00-\u9fff]{1,4}$', ch):
        return 'referral'
    # 数字/英文平台 → advertisement
    if re.match(r'^[a-zA-Z0-9]', ch):
        return 'advertisement'
    return 'other'


def map_status(is_qualified: str, is_completed: str):
    if is_completed and '完成' in str(is_completed):
        return 'completed'
    if is_qualified and '合格' in str(is_qualified):
        return 'pre_screening'
    return 'pre_screening'


def extract_project_code(project_field: str):
    if not project_field:
        return ''
    m = re.search(r'[CMWPmcwp][T\d]\w{4,10}', str(project_field))
    return m.group(0).upper() if m else ''


def gen_subject_no(ym: str, seq: int):
    return f'CHR-{ym}-{seq:05d}'   # 最长 CHR-202603-99999 = 16 chars


# ─── 主流程 ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--db-password', type=str, default='')
    args = parser.parse_args()

    db_pass = args.db_password or PG_PASS
    if not db_pass and not args.dry_run:
        db_pass = input('输入 cn_kis_v2 数据库密码: ').strip()

    # ── 解析 Excel ──────────────────────────────────────────────────────────
    print(f'\n读取文件: {SOURCE_FILE}')
    wb = openpyxl.load_workbook(SOURCE_FILE, read_only=True, data_only=True)
    ws = wb['Sheet1']
    all_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    headers = [str(h).strip() if h else '' for h in all_rows[0]]
    data_rows = all_rows[1:]
    print(f'  总行数: {len(data_rows)}，列数: {len(headers)}')
    print(f'  列名: {headers[:14]}')

    # 列索引（以名称为准）
    col = {h: i for i, h in enumerate(headers) if h}
    IDX_PROJECT  = col.get('报名项目', 0)
    IDX_CHANNEL  = col.get('渠道', 1)
    IDX_NAME     = col.get('姓名', 2)
    IDX_BIRTH    = col.get('出生年月日', 3)
    IDX_PHONE    = col.get('电话', 4)
    IDX_LINKREG  = col.get('链接报名', 5)
    IDX_PHSCR    = col.get('电话初筛', 6)
    IDX_APPT     = col.get('约访情况', 7)
    IDX_QUAL     = col.get('是否合格入组', 8)
    IDX_DONE     = col.get('项目是否已完成', 9)
    IDX_NOTES    = col.get('客户情况备注', 10)
    IDX_PAYTYPE  = col.get('联络费结款', 11)
    IDX_PAYSTAT  = col.get('结款情况', 12)
    IDX_ISNEW    = col.get('是否新人', 13)

    def get(row, idx, default=''):
        try:
            v = row[idx]
            return v if v is not None else default
        except IndexError:
            return default

    # ── 解析所有行 ──────────────────────────────────────────────────────────
    records = []
    skipped_no_name = 0
    for row in data_rows:
        name = str(get(row, IDX_NAME, '')).strip()
        if not name or len(name) < 2:
            skipped_no_name += 1
            continue

        phone_raw = get(row, IDX_PHONE, '')
        phone = norm_phone(phone_raw)
        birth_raw = get(row, IDX_BIRTH, None)
        birth_date = parse_birth_date(birth_raw)
        channel_raw = str(get(row, IDX_CHANNEL, '')).strip()
        project_raw = str(get(row, IDX_PROJECT, '')).strip()
        project_code = extract_project_code(project_raw)
        is_qualified = str(get(row, IDX_QUAL, '')).strip()
        is_completed = str(get(row, IDX_DONE, '')).strip()

        records.append({
            'name':          name,
            'phone':         phone,
            'birth_date':    birth_date,
            'age':           calc_age(birth_date),
            'channel_raw':   channel_raw,
            'source_channel': map_source_channel(channel_raw),
            'status':        map_status(is_qualified, is_completed),
            'project_raw':   project_raw,
            'project_code':  project_code,
            # 完整原始行，零截断
            '_raw_all': {
                '报名项目':    str(get(row, IDX_PROJECT, '')),
                '渠道':       channel_raw,
                '姓名':       name,
                '出生年月日':  str(birth_raw) if birth_raw is not None else '',
                '电话':       str(phone_raw),
                '链接报名':   str(get(row, IDX_LINKREG, '')),
                '电话初筛':   str(get(row, IDX_PHSCR, '')),
                '约访情况':   str(get(row, IDX_APPT, '')),
                '是否合格入组': str(is_qualified),
                '项目是否已完成': str(is_completed),
                '客户情况备注':  str(get(row, IDX_NOTES, '')),
                '联络费结款':   str(get(row, IDX_PAYTYPE, '')),
                '结款情况':    str(get(row, IDX_PAYSTAT, '')),
                '是否新人':    str(get(row, IDX_ISNEW, '')),
            },
        })

    print(f'\n解析完成:')
    print(f'  有效记录: {len(records)}（跳过无姓名: {skipped_no_name}）')
    print(f'  有出生日期: {sum(1 for r in records if r["birth_date"])}')
    print(f'  有有效手机: {sum(1 for r in records if valid_phone(r["phone"]))}')

    # ── 连接数据库 ──────────────────────────────────────────────────────────
    conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_DB,
                            user=PG_USER, password=db_pass, connect_timeout=15)
    conn.autocommit = True
    cur = conn.cursor()

    # ── 加载受试者索引 ──────────────────────────────────────────────────────
    print('\n加载受试者索引...')
    cur.execute("""
        SELECT s.id, s.name, s.phone, s.source_channel, s.age, s.gender,
               sp.birth_date, sp.id_card_hash
        FROM t_subject s
        LEFT JOIN t_subject_profile sp ON sp.subject_id = s.id
        WHERE s.is_deleted = false
    """)
    by_phone = {}      # phone → {id, name, source_channel, has_birth, has_age}
    by_name_birth = {} # (name, birth_year) → id
    for sid, sname, sphone, sch, sage, sgender, sbirth, sichash in cur.fetchall():
        p = norm_phone(sphone or '')
        entry = {
            'id': sid, 'name': sname or '', 'source_channel': sch or '',
            'has_birth': sbirth is not None, 'has_age': sage is not None,
            'has_gender': bool(sgender),
        }
        if p:
            by_phone[p] = entry
        if sname and sbirth:
            by_name_birth[(sname.strip(), sbirth.year)] = sid
    print(f'  索引: {len(by_phone)} 条（phone），{len(by_name_birth)} 条（姓名+生日年）')

    # ── 匹配 ────────────────────────────────────────────────────────────────
    matched, unmatched = [], []
    for rec in records:
        phone = rec['phone']
        name  = rec['name']
        birth = rec['birth_date']
        db_entry = None
        match_type = 'none'

        if valid_phone(phone) and phone in by_phone:
            cand = by_phone[phone]
            # 姓名兼容检查
            if not name or not cand['name'] or name == cand['name'] \
               or name in cand['name'] or cand['name'] in name:
                db_entry = cand
                match_type = 'phone+name'
            else:
                db_entry = cand
                match_type = 'phone_only'

        if not db_entry and birth and name:
            k = (name.strip(), birth.year)
            if k in by_name_birth:
                db_entry = {'id': by_name_birth[k]}
                match_type = 'name+birth_year'

        rec['_match_type'] = match_type
        if db_entry:
            rec['_subject_id'] = db_entry['id']
            rec['_db_entry'] = db_entry
            matched.append(rec)
        else:
            unmatched.append(rec)

    print(f'\n匹配结果:')
    print(f'  已匹配（直接更新）: {len(matched)} 条')
    print(f'  未匹配（新建受试者）: {len(unmatched)} 条')

    # 统计可更新的字段
    birth_backfill = sum(
        1 for r in matched
        if r['birth_date'] and not r['_db_entry'].get('has_birth')
    )
    age_backfill = sum(
        1 for r in matched
        if r['age'] and not r['_db_entry'].get('has_age')
    )
    print(f'  已匹配中可补全 birth_date: {birth_backfill} 条')
    print(f'  已匹配中可补全 age: {age_backfill} 条')
    print(f'  全量问卷记录将写入 t_subject_questionnaire: {len(records)} 条')

    if args.dry_run:
        print('\n[dry-run] 预览完成，未写库。')
        cur.close(); conn.close(); return

    now_ts = datetime.datetime.now(datetime.timezone.utc)
    ym_str = datetime.date.today().strftime('%Y%m')

    # ── Step 1：为未匹配记录创建 t_subject ──────────────────────────────────
    print(f'\n为未匹配记录新建受试者档案...')
    cur.execute(
        "SELECT subject_no FROM t_subject WHERE subject_no LIKE %s ORDER BY subject_no DESC LIMIT 1",
        (f'CHR-{ym_str}-%',)
    )
    row = cur.fetchone()
    chr_seq = int(row[0].split('-')[-1]) + 1 if row else 1

    conn.autocommit = False
    new_sids = []
    subj_sql = """
        INSERT INTO t_subject
            (subject_no, name, phone, gender, age, id_card_encrypted,
             skin_type, risk_level, status, source_channel,
             auth_level, create_time, update_time, is_deleted)
        VALUES (%s, %s, %s, '', %s, '', '', '', %s, %s, '', %s, %s, false)
        ON CONFLICT (subject_no) DO NOTHING
        RETURNING id
    """
    try:
        for rec in unmatched:
            sno = gen_subject_no(ym_str, chr_seq); chr_seq += 1
            cur.execute(subj_sql, (
                sno, rec['name'], rec['phone'],
                rec['age'], rec['status'], rec['source_channel'],
                now_ts, now_ts,
            ))
            result = cur.fetchone()
            new_sids.append(result[0] if result else None)
        conn.commit()
        created = sum(1 for s in new_sids if s)
        print(f'  ✅ 新建受试者: {created} 条')
    except Exception as e:
        conn.rollback()
        print(f'  ❌ 创建受试者失败: {e}')
        new_sids = [None] * len(unmatched)
    conn.autocommit = True

    for i, rec in enumerate(unmatched):
        rec['_subject_id'] = new_sids[i] if i < len(new_sids) else None

    # ── Step 2：为新受试者创建 t_subject_profile ────────────────────────────
    profile_rows = []
    for rec in unmatched:
        sid = rec.get('_subject_id')
        if not sid:
            continue
        bd = rec['birth_date']
        profile_rows.append((sid, bd, now_ts, now_ts))

    if profile_rows:
        conn.autocommit = False
        profile_sql = """
            INSERT INTO t_subject_profile
                (subject_id, birth_date,
                 ethnicity, education, occupation, marital_status,
                 id_card_hash, id_card_encrypted, id_card_last4,
                 name_pinyin, phone_backup, email,
                 province, city, district, address, postal_code,
                 emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
                 total_enrollments, total_completed,
                 privacy_level, consent_data_sharing, consent_rwe_usage,
                 consent_biobank, consent_follow_up, data_retention_years,
                 create_time, update_time)
            VALUES %s
            ON CONFLICT (subject_id) DO NOTHING
        """
        profile_template = (
            "(%s, %s, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', "
            "'', '', '', 0, 0, 'standard', false, false, false, false, 5, %s, %s)"
        )
        try:
            execute_values(cur, profile_sql, profile_rows,
                           template=profile_template, page_size=500)
            conn.commit()
            has_birth = sum(1 for r in profile_rows if r[1] is not None)
            print(f'  ✅ 新建受试者 profile: {len(profile_rows)} 条（含 birth_date: {has_birth} 条）')
        except Exception as e:
            conn.rollback()
            print(f'  ❌ 创建 profile 失败: {e}')
        conn.autocommit = True

    # ── Step 3：反向补全已匹配受试者 birth_date / age / source_channel ───────
    print('\n反向补全已匹配受试者字段...')
    # 临时表批量 UPDATE
    backfill_rows = []
    for rec in matched:
        sid = rec.get('_subject_id')
        if not sid:
            continue
        db = rec.get('_db_entry', {})
        bd = rec['birth_date']
        age = rec['age']
        sch = rec['source_channel']
        # 只在有新信息、且当前为空时才更新
        needs_birth  = bd and not db.get('has_birth')
        needs_age    = age and not db.get('has_age')
        needs_ch     = sch not in ('other', '') and db.get('source_channel', '') in ('', 'other', 'nas_import')
        if needs_birth or needs_age or needs_ch:
            backfill_rows.append((sid, bd if needs_birth else None,
                                  age if needs_age else None,
                                  sch if needs_ch else None))

    backfill_rows_dedup = {}
    for sid, bd, age, sch in backfill_rows:
        if sid not in backfill_rows_dedup:
            backfill_rows_dedup[sid] = (bd, age, sch)

    profile_upd = subject_upd = 0
    if backfill_rows_dedup:
        conn.autocommit = False
        try:
            cur.execute("""
                CREATE TEMP TABLE _chr_backfill (
                    subject_id BIGINT,
                    birth_date DATE,
                    age        INTEGER,
                    sch        VARCHAR(30)
                ) ON COMMIT DROP
            """)
            execute_values(cur,
                "INSERT INTO _chr_backfill (subject_id, birth_date, age, sch) VALUES %s",
                [(sid, bd, age, sch) for sid, (bd, age, sch) in backfill_rows_dedup.items()],
                page_size=2000
            )
            cur.execute("""
                UPDATE t_subject_profile sp
                SET birth_date  = COALESCE(sp.birth_date, b.birth_date),
                    update_time = NOW()
                FROM _chr_backfill b
                WHERE sp.subject_id = b.subject_id
                  AND b.birth_date IS NOT NULL
                  AND sp.birth_date IS NULL
            """)
            profile_upd = cur.rowcount
            cur.execute("""
                UPDATE t_subject s
                SET age         = COALESCE(s.age, b.age),
                    source_channel = CASE WHEN b.sch IS NOT NULL
                                          AND (s.source_channel = '' OR s.source_channel = 'other'
                                               OR s.source_channel = 'nas_import')
                                     THEN b.sch ELSE s.source_channel END,
                    update_time = NOW()
                FROM _chr_backfill b
                WHERE s.id = b.subject_id
                  AND (b.age IS NOT NULL AND s.age IS NULL
                       OR b.sch IS NOT NULL
                          AND (s.source_channel = '' OR s.source_channel = 'other'
                               OR s.source_channel = 'nas_import'))
            """)
            subject_upd = cur.rowcount
            conn.commit()
            print(f'  ✅ t_subject_profile 补全 birth_date: {profile_upd} 条')
            print(f'  ✅ t_subject 补全 age/source_channel: {subject_upd} 条')
        except Exception as e:
            conn.rollback()
            print(f'  ❌ 反向补全失败: {e}')
        conn.autocommit = True

    # ── Step 4：全量写入 t_subject_questionnaire（每行一条，零截断）─────────
    print('\n全量写入报名记录到 t_subject_questionnaire...')
    q_rows = []
    for rec in matched + unmatched:
        sid = rec.get('_subject_id')
        if not sid:
            continue
        raw = rec.get('_raw_all', {})
        answers = {
            **raw,
            '_project_code':  rec['project_code'],
            '_channel_mapped': rec['source_channel'],
            '_match_type':    rec.get('_match_type', 'none'),
            '_import_batch':  IMPORT_BATCH,
        }
        q_rows.append((
            sid,
            'channel_registration',
            f"渠道报名 | {raw.get('报名项目','')[:80]}",
            json.dumps(raw, ensure_ascii=False),     # form_definition = 原始列结构
            json.dumps(answers, ensure_ascii=False), # answers = 全量数据
            'completed',
            now_ts, now_ts,
        ))

    q_sql = """
        INSERT INTO t_subject_questionnaire
            (subject_id, questionnaire_type, title,
             form_definition, answers, status,
             create_time, update_time)
        VALUES %s
    """
    conn.autocommit = False
    try:
        execute_values(cur, q_sql, q_rows, page_size=500)
        conn.commit()
        print(f'  ✅ t_subject_questionnaire 写入: {len(q_rows)} 条（全量，零截断）')
    except Exception as e:
        conn.rollback()
        print(f'  ❌ 问卷写入失败: {e}')
    conn.autocommit = True

    # ── 汇总报告 ────────────────────────────────────────────────────────────
    print('\n' + '=' * 60)
    print(f'导入完成 | 批次: {IMPORT_BATCH}')
    print(f'  解析记录:            {len(records)} 条（源文件 {len(data_rows)} 行）')
    print(f'  已匹配受试者:        {len(matched)} 条')
    print(f'  新建受试者:          {sum(1 for s in new_sids if s)} 条')
    print(f'  补全 birth_date:     {profile_upd} 条')
    print(f'  补全 age/channel:    {subject_upd} 条')
    print(f'  问卷记录（全量）:    {len(q_rows)} 条写入 t_subject_questionnaire')
    print('=' * 60)

    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
