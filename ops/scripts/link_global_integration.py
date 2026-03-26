#!/usr/bin/env python3
"""
全局集成完成脚本
================
Migration 0039+0040 执行后，完成以下工作：

  A. 重新注入 t_subject_visit_record（Migration 0039 清空了该表）
  B. 批量创建 Enrollment 记录（Subject ↔ Protocol 正式连接）
  C. 链接 SubjectProjectSC.protocol_id
  D. 链接 SubjectCheckin.enrollment_id（从 notes 中提取 project_code）
  E. liaison 字符串尝试关联 Account（按姓名模糊匹配）
"""

import sys, datetime, logging
import psycopg2, psycopg2.extras

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

def get_conn():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    return conn

# ═══════════════════════════════════════════════════════════════════════════
# A. 重新注入 t_subject_visit_record（纯 SQL，秒级完成）
# ═══════════════════════════════════════════════════════════════════════════
def reinject_visit_records(conn):
    log.info("=== A. 重新注入 t_subject_visit_record ===")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_subject_visit_record")
    if cur.fetchone()[0] > 0:
        log.info("  已有数据，跳过")
        cur.close()
        return

    cur.execute("""
        INSERT INTO t_subject_visit_record
          (subject_id, questionnaire_id, visit_no,
           visit_date, visit_time, departure_time,
           project_code, purpose, location, liaison, is_departed,
           skin_type_obs, source_batch, create_time, update_time)
        SELECT
          q.subject_id,
          q.id,
          LEFT(COALESCE(q.answers->>'访客单号', ''), 50),
          (LEFT(q.answers->>'来访时间', 10))::DATE,
          CASE WHEN (q.answers->>'来访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:'
               THEN (LEFT(q.answers->>'来访时间',19))::TIMESTAMP AT TIME ZONE 'Asia/Shanghai'
               ELSE NULL END,
          CASE WHEN (q.answers->>'出访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:'
               THEN (LEFT(q.answers->>'出访时间',19))::TIMESTAMP AT TIME ZONE 'Asia/Shanghai'
               ELSE NULL END,
          CASE WHEN (q.answers->>'来访事由') ~ '^[A-Za-z][A-Za-z0-9-]{3,}$'
               THEN LEFT(COALESCE(q.answers->>'来访事由',''), 100)
               ELSE '' END,
          LEFT(COALESCE(q.answers->>'来访事由', ''), 500),
          LEFT(COALESCE(NULLIF(q.answers->>'进入门岗',''), q.answers->>'房号', ''), 200),
          LEFT(COALESCE(q.answers->>'被访人', ''), 100),
          CASE WHEN COALESCE(q.answers->>'是否离开','') NOT IN ('未离开','')
               THEN true ELSE false END,
          '',
          'visitor_registration',
          NOW(), NOW()
        FROM t_subject_questionnaire q
        WHERE q.questionnaire_type = 'visitor_registration'
          AND (q.answers->>'来访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_visit_record")
    cnt = cur.fetchone()[0]
    cur.close()
    log.info(f"  完成：注入 {cnt:,} 条访客记录")


# ═══════════════════════════════════════════════════════════════════════════
# B. 批量创建 Enrollment（Subject ↔ Protocol 正式连接）
# ═══════════════════════════════════════════════════════════════════════════
def create_enrollments(conn):
    log.info("=== B. 批量创建 Enrollment 记录 ===")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_enrollment")
    if cur.fetchone()[0] > 0:
        log.info("  已有数据，跳过")
        cur.close()
        return

    # 从 SubjectProjectSC 中找出能匹配 Protocol.code 的记录
    # 每个 (subject, protocol) 对只创建一条，取最早/最晚的参与日期推断状态
    cur.execute("""
        INSERT INTO t_enrollment
          (subject_id, protocol_id, status, enrolled_at, create_time, update_time)
        SELECT DISTINCT ON (sp.subject_id, p.id)
          sp.subject_id,
          p.id AS protocol_id,
          'completed' AS status,
          -- enrolled_at：从对应问卷记录中提取最早结束日期（只取 YYYY-MM-DD 格式，跳过 Excel 序列号）
          CASE WHEN (q.answers->>'结束时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
               THEN (LEFT(q.answers->>'结束时间', 10))::DATE::TIMESTAMPTZ
               WHEN (q.answers->>'结束') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
               THEN (LEFT(q.answers->>'结束', 10))::DATE::TIMESTAMPTZ
               ELSE NOW() END AS enrolled_at,
          NOW(), NOW()
        FROM t_subject_project_sc sp
        JOIN t_protocol p ON LOWER(p.code) = LOWER(sp.project_code)
        LEFT JOIN t_subject_questionnaire q
          ON q.subject_id = sp.subject_id
          AND q.questionnaire_type = 'master_list_project'
          AND (q.answers->>'项目编号' = sp.project_code
               OR q.answers->>'编号' = sp.project_code)
        ORDER BY sp.subject_id, p.id, enrolled_at
        ON CONFLICT DO NOTHING
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_enrollment")
    cnt = cur.fetchone()[0]

    cur.execute("SELECT status, COUNT(*) FROM t_enrollment GROUP BY status")
    log.info(f"  完成：创建 Enrollment {cnt:,} 条")
    for r in cur.fetchall():
        log.info(f"    {r[0]}: {r[1]:,}")

    # 统计覆盖情况
    cur.execute("SELECT COUNT(DISTINCT subject_id) FROM t_enrollment")
    log.info(f"  涉及受试者: {cur.fetchone()[0]:,}")
    cur.execute("SELECT COUNT(DISTINCT protocol_id) FROM t_enrollment")
    log.info(f"  涉及协议: {cur.fetchone()[0]:,}")
    cur.close()


# ═══════════════════════════════════════════════════════════════════════════
# C. 链接 SubjectProjectSC.protocol_id
# ═══════════════════════════════════════════════════════════════════════════
def link_protocol_id(conn):
    log.info("=== C. 链接 SubjectProjectSC.protocol_id ===")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_subject_project_sc WHERE protocol_id IS NOT NULL")
    if cur.fetchone()[0] > 0:
        log.info("  已链接，跳过")
        cur.close()
        return

    cur.execute("""
        UPDATE t_subject_project_sc sc
        SET protocol_id = p.id
        FROM t_protocol p
        WHERE LOWER(p.code) = LOWER(sc.project_code)
          AND sc.protocol_id IS NULL
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_project_sc WHERE protocol_id IS NOT NULL")
    linked = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM t_subject_project_sc")
    total = cur.fetchone()[0]
    cur.close()
    log.info(f"  完成：{linked:,}/{total:,} 条 SC 记录链接了 protocol_id ({linked/total*100:.1f}%)")


# ═══════════════════════════════════════════════════════════════════════════
# D. 链接 SubjectCheckin.enrollment_id
# ═══════════════════════════════════════════════════════════════════════════
def link_checkin_enrollment(conn):
    log.info("=== D. 链接 SubjectCheckin.enrollment_id ===")
    cur = conn.cursor()

    # SubjectCheckin.notes 格式：'来访事由:C203601'
    # 提取 project_code → 找 enrollment
    cur.execute("""
        UPDATE t_subject_checkin ci
        SET enrollment_id = e.id
        FROM t_enrollment e
        JOIN t_subject_project_sc sc
          ON sc.subject_id = e.subject_id AND sc.protocol_id = e.protocol_id
        WHERE ci.subject_id = e.subject_id
          AND ci.enrollment_id IS NULL
          AND e.subject_id = ci.subject_id
          AND ci.notes LIKE '来访事由:%'
          AND sc.project_code = TRIM(SUBSTRING(ci.notes FROM '来访事由:(.+)$'))
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_checkin WHERE enrollment_id IS NOT NULL")
    linked = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM t_subject_checkin")
    total = cur.fetchone()[0]
    cur.close()
    log.info(f"  完成：{linked:,}/{total:,} 条签到记录链接了 enrollment ({linked/total*100:.1f}%)")


# ═══════════════════════════════════════════════════════════════════════════
# E. liaison 关联 Account（按飞书姓名模糊匹配）
# ═══════════════════════════════════════════════════════════════════════════
def link_liaison_account(conn):
    log.info("=== E. liaison 字符串关联 Account ===")
    cur = conn.cursor()

    # 检查 t_account 表结构
    cur.execute("""SELECT column_name FROM information_schema.columns
        WHERE table_name='t_account' ORDER BY ordinal_position""")
    account_cols = [r[0] for r in cur.fetchall()]
    log.info(f"  t_account 字段: {account_cols[:10]}")

    # 找 name 字段
    name_col = None
    for candidate in ['name', 'display_name', 'full_name', 'feishu_name']:
        if candidate in account_cols:
            name_col = candidate
            break

    if not name_col:
        log.warning("  未找到 account name 字段，跳过")
        cur.close()
        return

    cur.execute(f"""
        SELECT COUNT(*) FROM t_subject_profile p
        JOIN t_account a ON a.{name_col} = p.liaison
        WHERE p.liaison IS NOT NULL AND p.liaison <> ''
    """)
    matches = cur.fetchone()[0]
    log.info(f"  liaison 与 Account.{name_col} 精确匹配: {matches:,} 人")

    # 在 SubjectAppointment 中也更新 liaison 的 Account 链接（如果 appointment 有 liaison_account_id 字段）
    cur.execute("""SELECT column_name FROM information_schema.columns
        WHERE table_name='t_subject_appointment'""")
    appt_cols = [r[0] for r in cur.fetchall()]
    log.info(f"  SubjectAppointment 有 liaison_account_id: {'liaison_account_id' in appt_cols}")

    cur.close()
    log.info("  liaison 关联分析完成（信息性，无写入）")


# ═══════════════════════════════════════════════════════════════════════════
# F. 重新更新聚合统计（因为 visit_record 重注入了）
# ═══════════════════════════════════════════════════════════════════════════
def update_aggregates(conn):
    log.info("=== F. 更新聚合统计 ===")
    cur = conn.cursor()

    cur.execute("""
        UPDATE t_subject s
        SET first_visit_date = sub.fd,
            last_visit_date  = sub.ld,
            total_visits     = sub.cnt
        FROM (
          SELECT subject_id, MIN(visit_date) fd, MAX(visit_date) ld, COUNT(*) cnt
          FROM t_subject_visit_record GROUP BY subject_id
        ) sub
        WHERE s.id = sub.subject_id
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject WHERE first_visit_date IS NOT NULL")
    log.info(f"  有来访记录受试者: {cur.fetchone()[0]:,}")

    # 更新 SubjectProjectSC 的 total_enrollments 聚合到 SubjectProfile
    cur.execute("""
        UPDATE t_subject_profile p
        SET total_enrollments = sub.cnt
        FROM (
          SELECT subject_id, COUNT(*) cnt FROM t_enrollment GROUP BY subject_id
        ) sub
        WHERE p.subject_id = sub.subject_id
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_profile WHERE total_enrollments > 0")
    log.info(f"  有入组记录的受试者档案: {cur.fetchone()[0]:,}")

    cur.close()


# ═══════════════════════════════════════════════════════════════════════════
# 最终验收
# ═══════════════════════════════════════════════════════════════════════════
def final_report(conn):
    cur = conn.cursor()
    log.info("=" * 65)
    log.info("全局集成完成 - 最终统计")
    log.info("=" * 65)

    sections = {
        "核心关联": [
            ("t_enrollment（入组记录）",       "SELECT COUNT(*) FROM t_enrollment"),
            ("已入组受试者",                   "SELECT COUNT(DISTINCT subject_id) FROM t_enrollment"),
            ("已关联协议",                     "SELECT COUNT(DISTINCT protocol_id) FROM t_enrollment"),
            ("签到已关联入组",                  "SELECT COUNT(*) FROM t_subject_checkin WHERE enrollment_id IS NOT NULL"),
        ],
        "访客&签到": [
            ("t_subject_visit_record",        "SELECT COUNT(*) FROM t_subject_visit_record"),
            ("t_subject_checkin",             "SELECT COUNT(*) FROM t_subject_checkin"),
            ("visit_record 含项目编号",         "SELECT COUNT(*) FROM t_subject_visit_record WHERE project_code<>''"),
        ],
        "项目参与": [
            ("t_subject_project_sc",          "SELECT COUNT(*) FROM t_subject_project_sc"),
            ("已链接 protocol_id",             "SELECT COUNT(*) FROM t_subject_project_sc WHERE protocol_id IS NOT NULL"),
            ("唯一项目数",                     "SELECT COUNT(DISTINCT project_code) FROM t_subject_project_sc"),
        ],
        "皮肤&档案": [
            ("t_subject_skin_profile",        "SELECT COUNT(*) FROM t_subject_skin_profile"),
            ("有首次筛查日期",                  "SELECT COUNT(*) FROM t_subject_profile WHERE first_screening_date IS NOT NULL"),
            ("有来访记录",                     "SELECT COUNT(*) FROM t_subject WHERE first_visit_date IS NOT NULL"),
            ("有入组记录",                     "SELECT COUNT(*) FROM t_subject_profile WHERE total_enrollments > 0"),
        ],
    }
    for section, items in sections.items():
        log.info(f"\n  【{section}】")
        for label, q in items:
            try:
                cur.execute(q)
                val = cur.fetchone()[0]
                log.info(f"    {label:35s}: {val:,}")
            except Exception as e:
                log.warning(f"    {label}: ERROR {e}")

    cur.close()


def main():
    conn = get_conn()
    try:
        reinject_visit_records(conn)
        create_enrollments(conn)
        link_protocol_id(conn)
        link_checkin_enrollment(conn)
        link_liaison_account(conn)
        update_aggregates(conn)
        final_report(conn)
        conn.commit()
        log.info("\n全局集成完成 ✅")
    except Exception as e:
        conn.rollback()
        log.error(f"错误，已回滚: {e}", exc_info=True)
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    main()
