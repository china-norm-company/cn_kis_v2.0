#!/usr/bin/env python3
"""
全量系统注入脚本 v2
==================
使用 SQL INSERT...SELECT 直接从 t_subject_questionnaire 注入所有专用表。
- 通过 questionnaire_id 外键引用原始数据，避免重复存储大 JSONB
- 全部数据通过 DB 内部处理，不走 SSH 隧道传输 JSONB
"""

import sys, json, datetime, logging
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
# A. t_subject_visit_record  ← visitor_registration  (纯 SQL)
# ═══════════════════════════════════════════════════════════════════════════
def inject_visit_records(conn):
    log.info("=== A. 注入 t_subject_visit_record ===")
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
          -- visit_date
          CASE WHEN (q.answers->>'来访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
               THEN (LEFT(q.answers->>'来访时间', 10))::DATE
               ELSE NULL END,
          -- visit_time
          CASE WHEN (q.answers->>'来访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:'
               THEN (LEFT(q.answers->>'来访时间',19))::TIMESTAMP AT TIME ZONE 'Asia/Shanghai'
               ELSE NULL END,
          -- departure_time
          CASE WHEN (q.answers->>'出访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:'
               THEN (LEFT(q.answers->>'出访时间',19))::TIMESTAMP AT TIME ZONE 'Asia/Shanghai'
               ELSE NULL END,
          -- project_code: 来访事由 if matches project code pattern
          CASE WHEN (q.answers->>'来访事由') ~ '^[A-Za-z][A-Za-z0-9-]{3,}$'
               THEN LEFT(COALESCE(q.answers->>'来访事由',''), 100)
               ELSE '' END,
          -- purpose (full)
          LEFT(COALESCE(q.answers->>'来访事由', ''), 500),
          -- location: 进入门岗 or 房号
          LEFT(COALESCE(NULLIF(q.answers->>'进入门岗',''), q.answers->>'房号', ''), 200),
          -- liaison: 被访人
          LEFT(COALESCE(q.answers->>'被访人', ''), 100),
          -- is_departed
          CASE WHEN COALESCE(q.answers->>'是否离开','') NOT IN ('未离开','')
               THEN true ELSE false END,
          '',  -- skin_type_obs: 暂不从 purpose 提取，后面统一更新
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
    log.info(f"  完成：写入 {cnt:,} 条访客记录")


# ═══════════════════════════════════════════════════════════════════════════
# B. t_subject_checkin  ← visitor_registration  (纯 SQL)
# ═══════════════════════════════════════════════════════════════════════════
def inject_checkins(conn):
    log.info("=== B. 注入 t_subject_checkin ===")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_subject_checkin")
    if cur.fetchone()[0] > 0:
        log.info("  已有数据，跳过")
        cur.close()
        return

    cur.execute("""
        INSERT INTO t_subject_checkin
          (subject_id, checkin_date, checkin_time, checkout_time,
           status, location, notes, create_time, update_time)
        SELECT
          q.subject_id,
          (LEFT(q.answers->>'来访时间', 10))::DATE,
          CASE WHEN (q.answers->>'来访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:'
               THEN (LEFT(q.answers->>'来访时间',19))::TIMESTAMP AT TIME ZONE 'Asia/Shanghai'
               ELSE NULL END,
          CASE WHEN (q.answers->>'出访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:'
               THEN (LEFT(q.answers->>'出访时间',19))::TIMESTAMP AT TIME ZONE 'Asia/Shanghai'
               ELSE NULL END,
          CASE WHEN COALESCE(q.answers->>'是否离开','') NOT IN ('未离开','')
               THEN 'completed' ELSE 'ongoing' END,
          LEFT(COALESCE(NULLIF(q.answers->>'进入门岗',''), q.answers->>'房号', ''), 200),
          LEFT(COALESCE('来访事由:' || NULLIF(q.answers->>'来访事由',''), ''), 500),
          NOW(), NOW()
        FROM t_subject_questionnaire q
        WHERE q.questionnaire_type = 'visitor_registration'
          AND (q.answers->>'来访时间') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_checkin")
    cnt = cur.fetchone()[0]
    cur.close()
    log.info(f"  完成：写入 {cnt:,} 条签到记录")


# ═══════════════════════════════════════════════════════════════════════════
# C. t_subject_project_sc  ← master_list_project（去重）(纯 SQL)
# ═══════════════════════════════════════════════════════════════════════════
def inject_project_sc(conn):
    log.info("=== C. 注入 t_subject_project_sc ===")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_subject_project_sc")
    if cur.fetchone()[0] > 0:
        log.info("  已有数据，跳过")
        cur.close()
        return

    cur.execute("""
        INSERT INTO t_subject_project_sc
          (subject_id, project_code, sc_number, rd_number,
           enrollment_status, is_deleted, create_time, update_time)
        SELECT DISTINCT ON (subject_id, project_code)
          subject_id,
          LEFT(COALESCE(
              NULLIF(answers->>'项目编号',''),
              NULLIF(answers->>'编号',''),
              NULLIF(answers->>'_project_code',''),
              ''), 100) AS project_code,
          '', '',
          CASE
            WHEN (answers->>'结束时间') ~ '^[0-9]{4}' OR (answers->>'结束') ~ '^[0-9]{4}'
            THEN 'completed'
            ELSE 'enrolled'
          END,
          false,
          NOW(), NOW()
        FROM t_subject_questionnaire
        WHERE questionnaire_type = 'master_list_project'
          AND COALESCE(
              NULLIF(answers->>'项目编号',''),
              NULLIF(answers->>'编号',''),
              NULLIF(answers->>'_project_code','')
          ) IS NOT NULL
        ORDER BY subject_id, project_code, create_time DESC
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_project_sc")
    cnt = cur.fetchone()[0]
    cur.close()
    log.info(f"  完成：写入 {cnt:,} 条项目参与记录")


# ═══════════════════════════════════════════════════════════════════════════
# D. t_subject_global_registry
# ═══════════════════════════════════════════════════════════════════════════
def inject_global_registry(conn):
    log.info("=== D. 注入 t_subject_global_registry ===")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_subject_global_registry")
    if cur.fetchone()[0] > 0:
        log.info("  已有数据，跳过")
        cur.close()
        return

    # 先插入没有项目参与的受试者（基础注册）
    cur.execute("""
        INSERT INTO t_subject_global_registry
          (id_card_hash, global_no, first_enrolled_at,
           enrolled_protocol_ids, is_disqualified, disqualify_reason,
           create_time, update_time)
        SELECT
          p.id_card_hash,
          LEFT('GR-' || s.subject_no, 32),
          NULL,
          '[]'::jsonb,
          false, '',
          NOW(), NOW()
        FROM t_subject_profile p
        JOIN t_subject s ON s.id = p.subject_id
        WHERE p.id_card_hash IS NOT NULL AND p.id_card_hash <> ''
        ON CONFLICT (id_card_hash) DO NOTHING
    """)
    conn.commit()

    # 更新 enrolled_protocol_ids（从 project_sc 聚合）
    log.info("  更新项目参与列表...")
    cur.execute("""
        UPDATE t_subject_global_registry gr
        SET enrolled_protocol_ids = sub.projs
        FROM (
          SELECT p.id_card_hash,
                 jsonb_agg(DISTINCT sc.project_code) AS projs
          FROM t_subject_project_sc sc
          JOIN t_subject_profile p ON p.subject_id = sc.subject_id
          WHERE p.id_card_hash IS NOT NULL AND p.id_card_hash <> ''
            AND sc.project_code IS NOT NULL AND sc.project_code <> ''
          GROUP BY p.id_card_hash
        ) sub
        WHERE gr.id_card_hash = sub.id_card_hash
    """)
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM t_subject_global_registry")
    cnt = cur.fetchone()[0]
    cur.close()
    log.info(f"  完成：写入 {cnt:,} 条全局注册")


# ═══════════════════════════════════════════════════════════════════════════
# E. t_subject_skin_profile（多源皮肤数据）
# ═══════════════════════════════════════════════════════════════════════════
def inject_skin_profiles(conn):
    log.info("=== E. 注入 t_subject_skin_profile ===")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM t_subject_skin_profile")
    if cur.fetchone()[0] > 0:
        log.info("  已有数据，跳过")
        cur.close()
        return

    # 来源1：t_subject.skin_type 已有值
    cur.execute("""
        WITH skin_map AS (
          SELECT id,
            CASE skin_type
              WHEN 'dry'       THEN 'dry'
              WHEN 'oily'      THEN 'oily'
              WHEN 'combo'     THEN 'combo'
              WHEN 'normal'    THEN 'normal'
              WHEN 'sensitive' THEN 'sensitive'
              ELSE NULL END AS st
          FROM t_subject
          WHERE skin_type IS NOT NULL AND skin_type <> ''
        )
        INSERT INTO t_subject_skin_profile
          (subject_id, fitzpatrick_type, skin_type_t_zone, skin_type_u_zone,
           skin_sensitivity, skin_concerns, create_time, update_time)
        SELECT
          id,
          '',
          CASE st WHEN 'combo' THEN 'oily' WHEN 'dry' THEN 'dry'
                  WHEN 'oily' THEN 'oily' ELSE 'normal' END,
          CASE st WHEN 'combo' THEN 'dry' WHEN 'dry' THEN 'dry'
                  WHEN 'oily' THEN 'oily' ELSE 'normal' END,
          CASE st WHEN 'sensitive' THEN 'high' ELSE 'normal' END,
          jsonb_build_array(st),
          NOW(), NOW()
        FROM skin_map WHERE st IS NOT NULL
        ON CONFLICT (subject_id) DO NOTHING
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_skin_profile")
    cnt1 = cur.fetchone()[0]
    log.info(f"  来源1（t_subject.skin_type）: {cnt1:,} 条")

    # 来源2：master_list_project 备注3/结束 含肤质词
    cur.execute("""
        WITH raw AS (
          SELECT DISTINCT ON (subject_id) subject_id,
            CASE
              WHEN COALESCE(answers->>'备注3','') ~ '干性|干燥|偏干' THEN 'dry'
              WHEN COALESCE(answers->>'备注3','') ~ '油性|偏油|油肌' THEN 'oily'
              WHEN COALESCE(answers->>'备注3','') ~ '中性' THEN 'normal'
              WHEN COALESCE(answers->>'备注3','') ~ '混合|混油' THEN 'combo'
              WHEN COALESCE(answers->>'备注3','') ~ '敏感' THEN 'sensitive'
              WHEN COALESCE(answers->>'结束','') ~ '干性|干燥|偏干' THEN 'dry'
              WHEN COALESCE(answers->>'结束','') ~ '油性|偏油|油肌' THEN 'oily'
              WHEN COALESCE(answers->>'结束','') ~ '中性' THEN 'normal'
              WHEN COALESCE(answers->>'结束','') ~ '混合|混油' THEN 'combo'
              WHEN COALESCE(answers->>'结束','') ~ '敏感' THEN 'sensitive'
              ELSE NULL
            END AS st
          FROM t_subject_questionnaire
          WHERE questionnaire_type = 'master_list_project'
          ORDER BY subject_id, create_time DESC
        )
        INSERT INTO t_subject_skin_profile
          (subject_id, fitzpatrick_type, skin_type_t_zone, skin_type_u_zone,
           skin_sensitivity, skin_concerns, create_time, update_time)
        SELECT
          subject_id, '',
          CASE st WHEN 'combo' THEN 'oily' WHEN 'dry' THEN 'dry'
                  WHEN 'oily' THEN 'oily' ELSE 'normal' END,
          CASE st WHEN 'combo' THEN 'dry' WHEN 'dry' THEN 'dry'
                  WHEN 'oily' THEN 'oily' ELSE 'normal' END,
          CASE st WHEN 'sensitive' THEN 'high' ELSE 'normal' END,
          jsonb_build_array(st),
          NOW(), NOW()
        FROM raw WHERE st IS NOT NULL
        ON CONFLICT (subject_id) DO NOTHING
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_skin_profile")
    cnt2 = cur.fetchone()[0]
    log.info(f"  来源2（master_list 备注3/结束）: {cnt2 - cnt1:,} 条新增，总 {cnt2:,}")

    # 来源3：appointment_record 现场筛选反馈
    cur.execute("""
        WITH raw AS (
          SELECT DISTINCT ON (subject_id) subject_id,
            CASE
              WHEN COALESCE(answers->>'现场筛选反馈','') ~ '干性|干燥' THEN 'dry'
              WHEN COALESCE(answers->>'现场筛选反馈','') ~ '油性' THEN 'oily'
              WHEN COALESCE(answers->>'现场筛选反馈','') ~ '中性' THEN 'normal'
              WHEN COALESCE(answers->>'现场筛选反馈','') ~ '混合|混油' THEN 'combo'
              WHEN COALESCE(answers->>'现场筛选反馈','') ~ '敏感' THEN 'sensitive'
              ELSE NULL
            END AS st
          FROM t_subject_questionnaire
          WHERE questionnaire_type = 'appointment_record'
          ORDER BY subject_id, create_time DESC
        )
        INSERT INTO t_subject_skin_profile
          (subject_id, fitzpatrick_type, skin_type_t_zone, skin_type_u_zone,
           skin_sensitivity, skin_concerns, create_time, update_time)
        SELECT subject_id, '',
          CASE st WHEN 'combo' THEN 'oily' WHEN 'dry' THEN 'dry'
                  WHEN 'oily' THEN 'oily' ELSE 'normal' END,
          CASE st WHEN 'combo' THEN 'dry' WHEN 'dry' THEN 'dry'
                  WHEN 'oily' THEN 'oily' ELSE 'normal' END,
          CASE st WHEN 'sensitive' THEN 'high' ELSE 'normal' END,
          jsonb_build_array(st),
          NOW(), NOW()
        FROM raw WHERE st IS NOT NULL
        ON CONFLICT (subject_id) DO NOTHING
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_skin_profile")
    cnt3 = cur.fetchone()[0]
    log.info(f"  来源3（appointment 现场筛选）: {cnt3 - cnt2:,} 条新增，总 {cnt3:,}")

    # 同步更新 t_subject.skin_type（从皮肤档案反写）
    cur.execute("""
        UPDATE t_subject s
        SET skin_type = CASE sp.skin_type_t_zone
            WHEN 'dry' THEN
              CASE sp.skin_type_u_zone WHEN 'dry' THEN 'dry' ELSE 'combo' END
            WHEN 'oily' THEN
              CASE sp.skin_type_u_zone WHEN 'oily' THEN 'oily' ELSE 'combo' END
            ELSE
              CASE sp.skin_sensitivity WHEN 'high' THEN 'sensitive' ELSE 'normal' END
            END
        FROM t_subject_skin_profile sp
        WHERE s.id = sp.subject_id
          AND (s.skin_type IS NULL OR s.skin_type = '')
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject WHERE skin_type IS NOT NULL AND skin_type <> ''")
    log.info(f"  t_subject.skin_type 更新后覆盖率: {cur.fetchone()[0]:,}")

    cur.close()
    log.info(f"  皮肤档案注入完成，共 {cnt3:,} 条")


# ═══════════════════════════════════════════════════════════════════════════
# F. 聚合统计更新
# ═══════════════════════════════════════════════════════════════════════════
def update_aggregates(conn):
    log.info("=== F. 更新聚合统计 ===")
    cur = conn.cursor()

    # F1. 首末访日期 + 总访次
    cur.execute("""
        UPDATE t_subject s
        SET first_visit_date = sub.fd,
            last_visit_date  = sub.ld,
            total_visits     = sub.cnt
        FROM (
          SELECT subject_id,
                 MIN(visit_date) fd, MAX(visit_date) ld, COUNT(*) cnt
          FROM t_subject_visit_record
          GROUP BY subject_id
        ) sub
        WHERE s.id = sub.subject_id
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject WHERE first_visit_date IS NOT NULL")
    log.info(f"  有来访记录受试者: {cur.fetchone()[0]:,}")

    # F2. 联络员（最高频的被访人）
    cur.execute("""
        UPDATE t_subject_profile p
        SET liaison = sub.top_liaison
        FROM (
          SELECT DISTINCT ON (subject_id) subject_id, liaison AS top_liaison
          FROM t_subject_visit_record
          WHERE liaison IS NOT NULL AND liaison <> ''
          GROUP BY subject_id, liaison
          ORDER BY subject_id, COUNT(*) DESC
        ) sub
        WHERE p.subject_id = sub.subject_id
          AND (p.liaison IS NULL OR p.liaison = '')
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_profile WHERE liaison <> ''")
    log.info(f"  有联络员受试者: {cur.fetchone()[0]:,}")

    # F3. 首次筛查日期
    cur.execute("""
        UPDATE t_subject_profile p
        SET first_screening_date = s.first_visit_date
        FROM t_subject s
        WHERE s.id = p.subject_id
          AND s.first_visit_date IS NOT NULL
          AND p.first_screening_date IS NULL
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM t_subject_profile WHERE first_screening_date IS NOT NULL")
    log.info(f"  有首次筛查日期: {cur.fetchone()[0]:,}")

    # F4. 更新 global_registry 的 first_enrolled_at
    cur.execute("""
        UPDATE t_subject_global_registry gr
        SET first_enrolled_at = sub.fd
        FROM (
          SELECT p.id_card_hash, MIN(s.first_visit_date) fd
          FROM t_subject s
          JOIN t_subject_profile p ON p.subject_id = s.id
          WHERE s.first_visit_date IS NOT NULL
            AND p.id_card_hash IS NOT NULL AND p.id_card_hash <> ''
          GROUP BY p.id_card_hash
        ) sub
        WHERE gr.id_card_hash = sub.id_card_hash
    """)
    conn.commit()

    cur.close()
    log.info("  聚合统计更新完成")


# ═══════════════════════════════════════════════════════════════════════════
# 最终验收统计
# ═══════════════════════════════════════════════════════════════════════════
def final_report(conn):
    cur = conn.cursor()
    log.info("=" * 65)
    log.info("全量注入完成 - 最终统计")
    log.info("=" * 65)

    checks = [
        ("受试者总数",               "SELECT COUNT(*) FROM t_subject"),
        ("有皮肤类型",               "SELECT COUNT(*) FROM t_subject WHERE skin_type<>'' AND skin_type IS NOT NULL"),
        ("皮肤档案",                 "SELECT COUNT(*) FROM t_subject_skin_profile"),
        ("访客签到记录",             "SELECT COUNT(*) FROM t_subject_visit_record"),
        ("系统签到记录(checkin)",     "SELECT COUNT(*) FROM t_subject_checkin"),
        ("项目参与记录",             "SELECT COUNT(*) FROM t_subject_project_sc"),
        ("全局注册",                 "SELECT COUNT(*) FROM t_subject_global_registry"),
        ("问卷档案(原始)",           "SELECT COUNT(*) FROM t_subject_questionnaire"),
        ("有来访记录",               "SELECT COUNT(*) FROM t_subject WHERE first_visit_date IS NOT NULL"),
        ("有联络员",                 "SELECT COUNT(*) FROM t_subject_profile WHERE liaison<>''"),
        ("有首次筛查日期",           "SELECT COUNT(*) FROM t_subject_profile WHERE first_screening_date IS NOT NULL"),
        ("唯一项目数",               "SELECT COUNT(DISTINCT project_code) FROM t_subject_project_sc WHERE project_code<>''"),
        ("有项目参与的受试者",       "SELECT COUNT(DISTINCT subject_id) FROM t_subject_project_sc"),
    ]

    for label, q in checks:
        try:
            cur.execute(q)
            val = cur.fetchone()[0]
            log.info(f"  {label:30s}: {val:,}")
        except Exception as e:
            log.warning(f"  {label}: ERROR {e}")

    cur.close()


def main():
    conn = get_conn()
    try:
        inject_visit_records(conn)
        inject_checkins(conn)
        inject_project_sc(conn)
        inject_global_registry(conn)
        inject_skin_profiles(conn)
        update_aggregates(conn)
        final_report(conn)
        conn.commit()
        log.info("全量注入完成 ✅")
    except Exception as e:
        conn.rollback()
        log.error(f"错误，已回滚: {e}", exc_info=True)
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    main()
    # ── 学习型集成（B2 Track）─────────────────────────────────────────────
    try:
        import sys as _sys, os as _os
        _backend_dir = _os.path.join(_os.path.dirname(__file__), '..', '..', 'backend')
        if _os.path.isdir(_backend_dir):
            _sys.path.insert(0, _os.path.abspath(_backend_dir))
        from apps.data_intake.learning_runner import LearningReport, GapReporter
        _rpt = LearningReport(source_name='inject_system_full')
        _rpt.add_pattern(
            'distribution', 'LIMS 系统注入映射完成',
            '系统全量注入完成：将 t_subject_questionnaire 历史数据'
            '映射到领域特定表（访视记录/测试记录等）。',
        )
        _rpt.add_agent_opportunity(
            scenario='注入映射规则自学习',
            current_pain='新增字段列映射需要人工修改 SQL，维护成本高',
            agent_value='基于历史映射规则 + 字段名相似性，智能体可半自动推导新字段的映射关系',
            implementation_hint='建立 column_mapping_knowledge 类型的 KnowledgeEntry 记录已验证映射规则',
        )
        GapReporter(dry_run=False).report(_rpt)
    except Exception:
        pass
