#!/usr/bin/env python3
"""
Phase 4：NAS 项目电话预约信息登记表 批量导入
=============================================
处理 113 个 C-编号项目预约表（.xls/.xlsx）
数据字段：姓名、性别、出生年月、电话、联络员、来访日期、现场筛选反馈、项目编号
"""

import sys, os, re, json, hashlib, datetime, logging, glob
import psycopg2, psycopg2.extras
import xlrd, openpyxl

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

DB_CONFIG = dict(
    host='localhost', port=25432,
    dbname='cn_kis_v2', user='cn_kis', password='cn_kis_2026'
)
NAS_DIR = '/tmp/nas_cn_kis/受试者名单'

# ── 工具函数（复用综合脚本中的逻辑） ─────────────────────────────────────────
def norm_phone(v):
    if not v: return ''
    s = re.sub(r'[^\d]', '', str(v))
    if len(s) == 11 and s.startswith('1'): return s
    if len(s) == 13 and s.startswith('86'): return s[2:]
    return ''

def str_val(v):
    if v is None: return ''
    return str(v).strip()

def xlserial_to_date(v, datemode=0):
    """将 xlrd Excel 日期序列号转为 datetime.date"""
    try:
        f = float(v)
        if f <= 0: return None
        # 判断是天数还是年份
        if f < 200:        # 年龄（年）
            return None
        if 10000 < f < 60000:  # 有效 Excel 日期序列号范围
            dt = xlrd.xldate_as_datetime(f, datemode)
            d = dt.date()
            if datetime.date(1920, 1, 1) <= d <= datetime.date(2015, 1, 1):
                return d
        return None
    except Exception:
        return None

def xlserial_to_age(v):
    """将 age 字段（可能是天数或年份）转为整数年龄"""
    try:
        f = float(v)
        if 10 <= f <= 120:          # 直接是年份
            return int(f)
        if 3650 <= f <= 43800:      # 是天数（10~120岁的天数范围）
            return round(f / 365.25)
        return None
    except Exception:
        return None

def map_skin_type(raw):
    if not raw: return ''
    s = str(raw).strip()
    mp = {'干性':'dry','干燥':'dry','偏干':'dry','油性':'oily','偏油':'oily',
          '中性':'normal','混合':'combo','混合性':'combo',
          '敏感':'sensitive','敏感肌':'sensitive'}
    for k, v in mp.items():
        if k in s: return v
    return ''

def extract_project_code(text):
    """从文本中提取项目编号，如 C190108"""
    m = re.search(r'C\d{5,}[\w\-]*', str(text))
    return m.group(0) if m else ''

# ── 解析单个预约登记表文件 ────────────────────────────────────────────────────
def parse_appointment_file(fp):
    """
    返回 (project_code, project_name, records)
    records = [{name, gender, birth_date, age, phone, liaison, visit_date,
                screening_result, source, notes, raw_row}]
    """
    ext = fp.rsplit('.', 1)[-1].lower()
    project_code = ''
    project_name = ''
    records = []

    try:
        if ext == 'xls':
            wb = xlrd.open_workbook(fp, on_demand=True)
            datemode = wb.datemode
            sheets_to_try = wb.sheets()[:3]
        else:
            wb = openpyxl.load_workbook(fp, read_only=True, data_only=True)
            datemode = 0
            sheets_to_try = [wb[s] for s in wb.sheetnames[:3]]

        for sh_obj in sheets_to_try:
            if ext == 'xls':
                sh = sh_obj
                nrows, ncols = sh.nrows, sh.ncols
                def get_row(i):
                    return [sh.cell_value(i, j) for j in range(ncols)]
            else:
                all_rows = list(sh_obj.iter_rows(values_only=True))
                nrows = len(all_rows)
                ncols = sh_obj.max_column or 0
                def get_row(i):
                    r = all_rows[i] if i < len(all_rows) else []
                    return list(r) + [''] * max(0, 20 - len(r))

            if nrows < 5:
                continue

            # ── 找项目编号（前10行扫描）──────────────────────────────────
            for ri in range(min(10, nrows)):
                row = get_row(ri)
                for cell in row:
                    txt = str_val(cell)
                    if '项目编号' in txt or re.search(r'C\d{5}', txt):
                        if not project_code:
                            project_code = extract_project_code(txt)
                        m = re.search(r'项目名称[：:]\s*([\u4e00-\u9fa5\w\s（）()-]+)', txt)
                        if m and not project_name:
                            project_name = m.group(1).strip()[:50]

            # ── 找表头行（含"受访者姓名"或"姓名"的行）────────────────────
            header_row_idx = -1
            header2_idx = -1
            for ri in range(min(15, nrows)):
                row = get_row(ri)
                cells = [str_val(c) for c in row]
                if any('姓名' in c or '受访者' in c for c in cells):
                    header_row_idx = ri
                    # 检查下一行是否也是表头的一部分
                    if ri + 1 < nrows:
                        row2 = get_row(ri + 1)
                        cells2 = [str_val(c) for c in row2]
                        if any('手机' in c or '年龄' in c or '电话' in c for c in cells2):
                            header2_idx = ri + 1
                    break

            if header_row_idx < 0:
                continue

            # ── 合并双行表头 ─────────────────────────────────────────────
            h1 = [str_val(c) for c in get_row(header_row_idx)]
            h2 = [str_val(c) for c in get_row(header2_idx)] if header2_idx >= 0 else []
            merged_headers = []
            for j in range(max(len(h1), len(h2))):
                v1 = h1[j] if j < len(h1) else ''
                v2 = h2[j] if j < len(h2) else ''
                merged_headers.append(f"{v1}|{v2}" if v1 and v2 else (v1 or v2))

            def find_col(keywords):
                for j, h in enumerate(merged_headers):
                    for kw in keywords:
                        if kw in h:
                            return j
                return -1

            i_name    = find_col(['受访者姓名', '姓名'])
            i_gender  = find_col(['性别'])
            i_birth   = find_col(['出生年月'])
            i_age     = find_col(['年龄'])
            i_phone   = find_col(['手机/小灵通', '手机', '联系方式'])
            i_visit   = find_col(['来访日期', '到访日期', '预约日期', '测试日期'])
            i_liaison = find_col(['联络员', '预约人', '联系人'])
            i_source  = find_col(['样框来源'])
            i_result  = find_col(['现场筛选反馈', '筛选反馈', '筛选结果'])
            i_reason  = find_col(['不合格原因', '原因'])
            i_notes   = find_col(['备注'])

            if i_name < 0:
                continue

            data_start = (header2_idx + 1) if header2_idx >= 0 else (header_row_idx + 1)

            for ri in range(data_start, nrows):
                row = get_row(ri)
                if not any(str_val(c) for c in row):
                    continue

                def gc(i):
                    return str_val(row[i]) if i >= 0 and i < len(row) else ''

                name = gc(i_name)
                if not name or re.match(r'^[\d\s\.\-]+$', name):
                    continue
                if len(name) > 20 or len(name) < 2:
                    continue

                gender_cn = gc(i_gender)
                gender = 'male' if gender_cn == '男' else ('female' if gender_cn == '女' else '')

                birth_raw = row[i_birth] if i_birth >= 0 and i_birth < len(row) else None
                birth_date = None
                if birth_raw:
                    if isinstance(birth_raw, (int, float)):
                        birth_date = xlserial_to_date(birth_raw, datemode)
                    elif isinstance(birth_raw, datetime.datetime):
                        bd = birth_raw.date()
                        if datetime.date(1920,1,1) <= bd <= datetime.date(2015,1,1):
                            birth_date = bd

                age_raw = row[i_age] if i_age >= 0 and i_age < len(row) else None
                age = xlserial_to_age(age_raw) if age_raw else None
                if age and birth_date:
                    # 双重验证
                    today = datetime.date.today()
                    calc_age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
                    if abs(calc_age - age) > 5:
                        age = calc_age  # 以生日计算为准

                phone_raw = row[i_phone] if i_phone >= 0 and i_phone < len(row) else None
                phone = norm_phone(str_val(phone_raw))

                visit_raw = row[i_visit] if i_visit >= 0 and i_visit < len(row) else None
                visit_date = None
                if visit_raw:
                    if isinstance(visit_raw, (int, float)) and visit_raw > 40000:
                        try:
                            visit_date = xlrd.xldate_as_datetime(visit_raw, datemode).date()
                        except Exception:
                            pass
                    elif isinstance(visit_raw, datetime.datetime):
                        visit_date = visit_raw.date()

                liaison = gc(i_liaison)
                source  = gc(i_source)
                result  = gc(i_result)
                reason  = gc(i_reason)
                notes   = gc(i_notes)
                skin    = map_skin_type(result) or map_skin_type(notes)

                raw_row = {}
                for j, h in enumerate(merged_headers):
                    v = str_val(row[j]) if j < len(row) else ''
                    if v and h:
                        raw_row[h] = v
                raw_row['_project_code'] = project_code
                raw_row['_project_name'] = project_name
                raw_row['_source_file']  = os.path.basename(fp)

                records.append({
                    'name': name, 'gender': gender,
                    'birth_date': birth_date, 'age': age,
                    'phone': phone, 'liaison': liaison,
                    'visit_date': visit_date, 'source': source,
                    'screening_result': result, 'reason': reason,
                    'notes': notes, 'skin_type': skin,
                    'raw': raw_row,
                })

    except Exception as e:
        log.warning(f"解析失败 {os.path.basename(fp)}: {e}")
        return project_code, project_name, []

    return project_code, project_name, records


# ── 数据库工具（与综合脚本相同） ─────────────────────────────────────────────
_INT_FIELDS = {'age', 'total_enrollments', 'total_completed'}
_DATE_FIELDS = {'birth_date', 'first_screening_date', 'first_enrollment_date'}

def _null_guard(k):
    if k in _INT_FIELDS or k in _DATE_FIELDS:
        return f"{k} = CASE WHEN {k} IS NULL THEN %s ELSE {k} END"
    return f"{k} = CASE WHEN ({k} IS NULL OR {k} = '') THEN %s ELSE {k} END"

def update_subject(conn, sid, sub_updates, prof_updates):
    cur = conn.cursor()
    if sub_updates:
        sets = [_null_guard(k) for k in sub_updates]
        cur.execute(f"UPDATE t_subject SET {', '.join(sets)} WHERE id = %s",
                    list(sub_updates.values()) + [sid])
    if prof_updates:
        sets = [_null_guard(k) for k in prof_updates]
        cur.execute(f"UPDATE t_subject_profile SET {', '.join(sets)} WHERE subject_id = %s",
                    list(prof_updates.values()) + [sid])
    cur.close()

def store_q_batch(conn, records):
    if not records: return
    cur = conn.cursor()
    now = datetime.datetime.now()
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO t_subject_questionnaire (subject_id, questionnaire_type, title, status, answers, create_time, update_time) VALUES %s",
        [(r['subject_id'], 'appointment_record', r.get('title','appointment_record'),
          'imported', json.dumps(r['data'], ensure_ascii=False, default=str), now, now)
         for r in records],
        template="(%s,%s,%s,%s,%s::jsonb,%s,%s)",
    )
    cur.close()


# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False

    # 加载现有受试者索引
    cur = conn.cursor()
    cur.execute("SELECT s.id, s.phone, p.id_card_hash FROM t_subject s LEFT JOIN t_subject_profile p ON p.subject_id=s.id")
    by_phone = {}
    by_hash = {}
    for sid, phone, ic_hash in cur.fetchall():
        if phone: by_phone.setdefault(phone, []).append(sid)
        if ic_hash: by_hash[ic_hash] = sid
    cur.close()
    log.info(f"已加载 {len(by_phone)} 手机号，{len(by_hash)} 身份证哈希")

    # 找所有待处理文件
    all_files = sorted(
        glob.glob(f'{NAS_DIR}/C*.xls') +
        glob.glob(f'{NAS_DIR}/C*.xlsx')
    )
    log.info(f"找到 {len(all_files)} 个项目预约文件")

    total_records = 0
    total_matched = 0
    total_enriched = 0
    q_batch = []

    for fi, fp in enumerate(all_files):
        proj_code, proj_name, records = parse_appointment_file(fp)
        if not records:
            continue

        for rec in records:
            total_records += 1
            name   = rec['name']
            phone  = rec['phone']
            gender = rec['gender']
            bd     = rec['birth_date']
            age    = rec['age']
            skin   = rec['skin_type']

            # 匹配现有受试者
            sid = None
            if phone and phone in by_phone:
                candidates = by_phone[phone]
                sid = candidates[0] if len(candidates) == 1 else candidates[0]

            if sid:
                total_matched += 1
                su, pu = {}, {}
                if gender: su['gender'] = gender
                if skin:   su['skin_type'] = skin
                if age:    su['age'] = age
                if bd:     pu['birth_date'] = bd
                if age:    pu['age'] = age

                if su or pu:
                    update_subject(conn, sid, su, pu)
                    total_enriched += 1

                q_batch.append({
                    'subject_id': sid,
                    'data': rec['raw'],
                    'title': f"{proj_code} {proj_name}".strip() or 'appointment_record',
                })

            if len(q_batch) >= 500:
                store_q_batch(conn, q_batch)
                conn.commit()
                q_batch = []

        if (fi + 1) % 20 == 0:
            conn.commit()
            log.info(f"  进度 {fi+1}/{len(all_files)} | 记录={total_records} 匹配={total_matched} 丰富={total_enriched}")

    if q_batch:
        store_q_batch(conn, q_batch)
    conn.commit()

    # 最终统计
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_subject_questionnaire WHERE questionnaire_type='appointment_record'")
    qcount = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM t_subject WHERE skin_type IS NOT NULL AND skin_type <> ''")
    has_skin = cur.fetchone()[0]
    cur.close()
    conn.close()

    log.info("=" * 55)
    log.info(f"Phase 4 完成")
    log.info(f"  处理文件:  {len(all_files)}")
    log.info(f"  总记录数:  {total_records:,}")
    log.info(f"  匹配受试者:{total_matched:,}")
    log.info(f"  丰富信息:  {total_enriched:,}")
    log.info(f"  appointment_record questionnaire: {qcount:,}")
    log.info(f"  有肤质受试者: {has_skin:,}")

if __name__ == '__main__':
    main()
    # ── 学习型集成（B2 Track）─────────────────────────────────────────────
    try:
        import sys as _sys, os as _os
        _backend_dir = _os.path.join(_os.path.dirname(__file__), '..', '..', 'backend')
        if _os.path.isdir(_backend_dir):
            _sys.path.insert(0, _os.path.abspath(_backend_dir))
        from apps.data_intake.learning_runner import LearningReport, GapReporter
        _rpt = LearningReport(source_name='nas_project_appointments')
        _rpt.add_pattern(
            'distribution', '项目预约登记历史数据导入',
            '113 个 C-编号项目预约表批量导入完成。'
            '预约记录包含初筛反馈，是受试者筛选通过率分析的重要数据源。',
        )
        _rpt.add_agent_opportunity(
            scenario='初筛通过率预测模型',
            current_pain='项目启动初筛时，无法预测哪些受试者类型通过率更高',
            agent_value='基于历史"现场筛选反馈"数据，建立受试者初筛通过率预测模型',
            implementation_hint='在 t_subject_questionnaire 中挖掘 screening_result 字段规律',
        )
        GapReporter(dry_run=False).report(_rpt)
    except Exception:
        pass
