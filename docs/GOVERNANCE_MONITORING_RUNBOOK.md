# CN KIS V2.0 上线治理 — 持续监控主口径（Runbook）

本文固定「谁为主、谁为辅」，避免 GitHub Actions 早晚报与 Celery 全域简报双轨重复、口径打架。

## 1. 主口径（每日事实源）

| 层级 | 主来源 | 说明 |
|------|--------|------|
| 研发日课卡片 | `.github/workflows/feishu-notify.yml`（定时 job `ops-briefing`） | 工作日飞书开发群：`CN_KIS_PLATFORM开发小组`；聚合 GitHub（PR/Issue/提交/stale PR）+ `GET /api/v1/internal/system-pulse/` |
| 上线成熟度与 L2 动作 | `backend/apps/secretary/briefing_tasks.py` → Celery `ops-morning-briefing` / `ops-evening-briefing` | 发同一开发群；含 `_collect_v2_adoption_metrics`、业务与用户指标、可选 LLM 批注 |

**约定**

- **结构化数据**（PR 数、system-pulse KPI、开放缺口数）以 **Actions 卡片 + 鹿鸣「V2 总览」** 为准对齐。
- **叙事与总经理视角批注**以 **Celery 简报** 为补充；若与卡片冲突，以 DB/API 实测与鹿鸣页面为准复盘文案。

## 2. 纳入监控的信息范围

| 对象 | 如何跟进 |
|------|----------|
| 飞书开发群 | 关键结论登记到鹿鸣「问题与缺口」（可填 `feishu_ref`） |
| 飞书用户反馈群 | `backend/apps/secretary/api_feedback.py` Webhook → 高优先级问题转入缺口池或 GitHub Issue |
| GitHub | Actions 已推送 PR/Issue；缺口可关联 `github_issue_url` |
| 系统 | `system-pulse`、`check-system-pulse` 技能、`docs/LEARNING_LOOP_STATUS.md` 周更对照 |
| 业务闭环对象 | 鹿鸣「闭环推进」+ `python manage.py check_minimal_project_loop` |

## 3. 环境与密钥

- `SYSTEM_PULSE_TOKEN`：Actions 与内部调用一致。
- `FEISHU_DEV_GROUP_CHAT_ID` / `FEISHU_FEEDBACK_GROUP_CHAT_ID`：见 `.cursor/rules/project-constants.mdc`。
- 生产 V2 API 基址以部署为准（历史文档曾误写端口，以当前 Nginx + `:8080` 为准）。

## 4. 节奏建议

- **每日**：开发群阅读 Actions 卡片；负责人更新缺口状态。
- **每周一**：更新 `docs/LEARNING_LOOP_STATUS.md` 与鹿鸣「目标与节奏」。
- **发布前后**：跑 `python manage.py check` + `check_minimal_project_loop`。
