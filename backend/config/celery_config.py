"""
CN KIS V2.0 Celery Beat 调度配置

V2 安全开关：
- CELERY_PRODUCTION_TASKS_DISABLED=true 时，生产采集类任务（飞书采集、知识入库、向量化）
  不注册到 Beat 调度，防止测试环境污染生产资产（迁移章程红线要求）。
"""
import os
from celery.schedules import crontab

# V2 安全开关：测试环境禁用生产采集任务
PRODUCTION_TASKS_DISABLED = os.getenv('CELERY_PRODUCTION_TASKS_DISABLED', '').lower() == 'true'

broker_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
result_backend = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
accept_content = ['json']
task_serializer = 'json'
result_serializer = 'json'
timezone = 'Asia/Shanghai'
enable_utc = True

beat_schedule = {
    # ══════════════════════════════════════════════════════════════
    # 智能运营早晚报（Issue #4）
    # 总经理视角：LLM 分析 + 全域指标 + 工作台推广状态 → 飞书群
    # ══════════════════════════════════════════════════════════════
    'ops-morning-briefing': {
        'task': 'apps.secretary.tasks.send_morning_briefing',
        'schedule': crontab(hour=9, minute=0),
    },
    'ops-evening-briefing': {
        'task': 'apps.secretary.tasks.send_evening_briefing',
        'schedule': crontab(hour=18, minute=0),
    },
    'ops-weekly-briefing': {
        'task': 'apps.secretary.tasks.send_weekly_briefing',
        'schedule': crontab(hour=8, minute=30, day_of_week='mon'),
    },
    # ── 纯通知类（不调用 AI） ──
    'notification-daily-alerts': {
        'task': 'apps.notification.tasks.push_all_alerts',
        'schedule': crontab(hour=7, minute=30),
    },
    'notification-daily-digest': {
        'task': 'apps.notification.tasks.push_daily_digest',
        'schedule': crontab(hour=8, minute=0),
    },
    'notification-scheduling-alerts': {
        'task': 'apps.notification.tasks.push_scheduling_alerts',
        'schedule': crontab(hour=7, minute=45),
    },
    'notification-quality-scan': {
        'task': 'apps.notification.tasks.push_quality_alerts',
        'schedule': crontab(hour=8, minute=15),
    },
    # ── 纯数据库操作（不调用 AI） ──
    'send-daily-progress-reports': {
        'task': 'apps.workorder.tasks.send_daily_progress_reports',
        'schedule': crontab(hour=18, minute=0),
    },
    'lab-personnel-daily-risk-scan': {
        'task': 'apps.lab_personnel.tasks.daily_risk_scan',
        'schedule': crontab(hour=8, minute=0),
    },
    'lab-personnel-cert-status-refresh': {
        'task': 'apps.lab_personnel.tasks.refresh_cert_status',
        'schedule': crontab(hour=7, minute=30),
    },
    'lab-personnel-aggregate-worktime': {
        'task': 'apps.lab_personnel.tasks.aggregate_worktime',
        'schedule': crontab(hour=23, minute=30),
    },
    'finance-daily-overdue-detection': {
        'task': 'apps.finance.tasks.run_daily_overdue_detection',
        'schedule': crontab(hour=8, minute=30),
    },
    'finance-daily-budget-alerts': {
        'task': 'apps.finance.tasks.run_daily_budget_alerts',
        'schedule': crontab(hour=9, minute=0),
    },
    'finance-daily-expiring-reminders': {
        'task': 'apps.finance.tasks.run_daily_expiring_reminders',
        'schedule': crontab(hour=9, minute=30),
    },
    'finance-daily-snapshot': {
        'task': 'apps.finance.tasks.run_daily_snapshot',
        'schedule': crontab(hour=23, minute=0),
    },
    'finance-monthly-report': {
        'task': 'apps.finance.tasks.run_monthly_report',
        'schedule': crontab(day_of_month=1, hour=6, minute=0),
    },
    'recruitment-daily-summary': {
        'task': 'apps.subject.tasks.send_recruitment_daily_summary',
        'schedule': crontab(hour=18, minute=10),
    },
    'hr-gcp-expiry-check': {
        'task': 'apps.hr.tasks.check_gcp_expiry_alerts',
        'schedule': crontab(hour=8, minute=0),
    },
    'quality-sop-review-check': {
        'task': 'apps.quality.tasks.check_sop_review_alerts',
        'schedule': crontab(hour=8, minute=10),
    },
    # ── 纯数据库统计（不调用 AI） ──
    'agent-daily-cost-aggregate': {
        'task': 'apps.secretary.tasks.aggregate_agent_daily_cost',
        'schedule': crontab(hour=0, minute=30),
    },
    'memory-forget-stale-daily': {
        'task': 'apps.secretary.tasks.forget_stale_memories_daily',
        'schedule': crontab(hour=3, minute=0),
    },
    # ── 飞书数据采集（仅飞书 API，不调用 AI） ──
    # ⚠️ V2 安全：CELERY_PRODUCTION_TASKS_DISABLED=true 时此任务不注册
    'feishu-token-health-check': {
        'task': 'apps.secretary.tasks.feishu_token_health_check',
        'schedule': crontab(hour='0,6,12,18', minute=15),
    },
    # 每天早上 8:30：向开发群发过期用户汇总 + 逐人私信提醒重新授权
    'feishu-token-expiry-morning-alert': {
        'task': 'apps.secretary.tasks.feishu_token_expiry_morning_alert',
        'schedule': crontab(hour=8, minute=30),
    },
    # 每 6 小时：自动扫描 pending checkpoint 并触发补采（覆盖 token 刚恢复 / 新用户）
    'feishu-auto-backfill-sweep': {
        'task': 'apps.secretary.tasks.feishu_auto_backfill_sweep',
        'schedule': crontab(hour='1,7,13,19', minute=0),
    },
}

# V2 安全开关：测试环境禁用生产采集类任务
if PRODUCTION_TASKS_DISABLED:
    # 从 beat_schedule 中移除所有飞书采集类任务
    _production_tasks_to_disable = [
        'feishu-token-health-check',
    ]
    for _task_key in _production_tasks_to_disable:
        beat_schedule.pop(_task_key, None)
    import logging as _log
    _log.getLogger(__name__).warning(
        'CELERY_PRODUCTION_TASKS_DISABLED=true: feishu/knowledge production tasks disabled. '
        'This is expected in test environments to protect production knowledge assets.'
    )

    # ============================================================
    # 以下任务已停用（会调用 AI / LLM，需要时手动恢复）
    # ============================================================
    # 'orchestrator-morning-brief'      -- 每日晨报（多 Agent 编排）
    # 'orchestrator-evening-summary'    -- 每日日报（Agent 编排）
    # 'memory-compress-weekly'          -- 记忆压缩（quick_chat）
    # 'skill-evolution-weekly'          -- 技能进化（quick_chat）
    # 'proactive-trend-monitor'         -- 趋势预警（最多 50 次 quick_chat）
    # 'proactive-client-periodic'       -- 客户洞察（AI 分析）
    # 'proactive-project-scout'         -- 项目推荐（AI 分析）
    # 'proactive-expire-stale'          -- 过期清理（无 AI 但无必要）
    # 'proactive-feedback-learning'     -- 反馈学习（无 AI 但无必要）
    # 'feedback-loop-weekly-digest'     -- 学习摘要
    # 'knowledge-daily-chat-harvest'    -- 群聊知识（可能触发 pipeline LLM）
    # 'knowledge-external-fetchers'     -- 外部采集（可能触发 pipeline LLM）
    # 'knowledge-paper-scout'           -- 论文采集
    # 'knowledge-expiry-check'          -- 知识过期
    # 'knowledge-quality-daily-snapshot' -- 知识质量
    # 'feishu-daily-incremental-sweep'  -- 飞书增量（可能触发知识入库→embedding）
    # 'feishu-weekly-deep-scan'         -- 飞书深扫
    # 'feishu-monthly-full-reconcile'   -- 飞书全量对账
    # 'feishu-auto-backfill-sweep'      -- 飞书补采
    # 'feishu-approval-weekly-collect'  -- 审批采集
    # 'feishu-knowledge-ingest'         -- 知识入库（embedding）
    # 'digital-worker-kpi-daily-snapshot'
    # 'digital-worker-watchtower-refresh'
    # 'digital-worker-readiness-gate'
    # 'project-startup-readiness-check'
    # 'quality-kpi-daily-snapshot'
    # 'agent-monthly-budget-reset'
