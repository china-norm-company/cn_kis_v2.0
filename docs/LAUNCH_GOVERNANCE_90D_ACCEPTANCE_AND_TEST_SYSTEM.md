# CN KIS V2.0 上线治理 90 天 — 测试验收标准与测试体系

> **版本**：v1.0 | **生成日期**：2026-03-26 | **状态**：正式  
> **归属**：`feature/admin/22-launch-governance-followup`  
> **上级文档**：[`docs/plans/launch-governance-90d.plan.md`](plans/launch-governance-90d.plan.md)  
> **兄弟文档**：[`docs/TEST_ACCEPTANCE_FRAMEWORK.md`](TEST_ACCEPTANCE_FRAMEWORK.md)、[`docs/GOVERNANCE_MONITORING_RUNBOOK.md`](GOVERNANCE_MONITORING_RUNBOOK.md)、[`docs/MINIMAL_PROJECT_LOOP_ACCEPTANCE.md`](MINIMAL_PROJECT_LOOP_ACCEPTANCE.md)

---

## 一、系统目的与预期效果

### 1.1 为什么做这个系统

CN KIS V2.0 已有模块与数据，但缺乏"统一治理平台、持续监控节奏、最小项目全生命周期线上闭环、问题沉淀与目标管理"，导致：

- 靠飞书消息推进，上下文丢失
- 鹿鸣残留旧语义（V1.0 / 15 台 / `governance` key），与事实源脱节
- 问题停留在聊天，无法追踪、无法关联系统状态
- 早晚报口径双轨，数字对不上

### 1.2 预期达到的效果

| 周期 | 效果 |
|------|------|
| 0-30 天 | 鹿鸣切换为 V2.0 / 19 台口径；早晚报不再双轨；开发群每天能基于统一页面回答当前阻塞 |
| 31-60 天 | 至少 1 条真实主链端到端可验证；问题在鹿鸣缺口池追踪，不再只在飞书 |
| 61-90 天 | 鹿鸣持续展示历史/现状/目标/问题；每周能回答哪台进展/哪个问题滞留 |

### 1.3 实现内容（已落地）

| 层级 | 组件 | 文件 |
|------|------|------|
| 数据模型 | `LaunchGovernanceGap`、`LaunchGovernanceGoal` | `backend/apps/identity/models_launch_governance.py` + migration `0010` |
| 后端 API | 工作台注册表、概览、缺口 CRUD、目标 CRUD、闭环状态 | `backend/apps/identity/launch_governance_api.py` + `backend/urls.py` |
| 前端页面 | 上线总览、最小闭环、19 台地图、缺口池、目标节奏 | `workstations/admin/src/pages/launch/` |
| 前端路由 | 侧栏菜单组、React Router 注册 | `AppLayout.tsx`、`App.tsx` |
| API 客户端 | `launchGovernanceApi` + 4 类型导出 | `packages/api-client/src/modules/launch-governance.ts` |
| 反馈桥接 | 用户反馈 → 缺口池自动沉淀 | `backend/apps/identity/launch_governance_feedback_bridge.py` |
| 工作台常量 | `WS_ADMIN`、`LEGACY_WS_GOVERNANCE`（废弃兼容） | `backend/apps/core/workstation_keys.py` |
| 自检命令 | `check_minimal_project_loop` | `backend/apps/identity/management/commands/` |
| Runbook | 监控主口径与节奏 | `docs/GOVERNANCE_MONITORING_RUNBOOK.md` |
| 闭环验收清单 | 最小主链节点核查 | `docs/MINIMAL_PROJECT_LOOP_ACCEPTANCE.md` |

---

## 二、可能遇到的问题与风险

| 风险 ID | 风险描述 | 后果 | 应对 |
|---------|---------|------|------|
| R-01 | `workstation_keys.py` 旧 `governance` 常量未清理 | 治理语义混乱，缺口/角色写入旧 key | 已修复；HC-13 验收检查 |
| R-02 | migration `0009` 历史数据含 legacy key | 数据不一致、页面显示异常 | 前置数据检查：`SELECT DISTINCT workstation FROM identity_launchgovernancegap` |
| R-03 | `PilotConfigPage` 与 `/auth/workstation-config/` 契约不一致 | 试点配置保存失败 | 已改为 `getRegistry()` 驱动，smoke 测试覆盖 |
| R-04 | `project_full_link` 与 `Protocol` 双主入口 | 闭环对象数量统计分裂 | `check_minimal_project_loop` 只计 `Protocol`；文档锁定主入口 |
| R-05 | `vector` 扩展权限不足导致测试库创建失败 | identity 单元测试跳过 | 用 `--keepdb` 或提前 `CREATE EXTENSION vector` 为超级用户 |
| R-06 | 前端 `@cn-kis/api-client` 未重建就部署 | 类型缺失、运行时 404 | 部署前必须 `pnpm build` 并验证 dist |
| R-07 | 飞书反馈桥接抛异常影响主流程 | 反馈被中断 | 桥接已加 `try/except`，日志警告级别，不影响主流程 |

---

## 三、验收标准映射矩阵

将 90 天计划的 5 个 TODO 映射为可测量验收 ID：

| 计划 TODO | 验收 ID | 层级 | 验收描述 |
|----------|---------|------|---------|
| phase1-governance-baseline | LG-01 | L1/L4 | `WS_ADMIN == "admin"`；DashboardPage 显示 V2.0 + 19 |
| phase1-monitoring-baseline | LG-02 | L4/L5 | Runbook 存在；Actions 卡片与 Celery 简报无口径冲突字段 |
| phase2-closed-loop-validation | LG-03 | L4 | `check_minimal_project_loop` 输出各节点均 ≥ 0，无 ERROR |
| phase2-gap-pool | LG-04 | L2/L3 | `LaunchGovernanceGap` 模型迁移通过；API 返回 `{code:0, data:[...]}`；反馈桥接写入一条 Gap |
| phase3-goal-rhythm | LG-05 | L3/L5 | `LaunchGovernanceGoal` API 可读写；鹿鸣「目标节奏」页面加载无 500 |

---

## 四、分层测试体系

### L0 — 静态分析（本地/CI，无依赖）

**目标**：字符串常量、废弃标识、模块导入、TypeScript 类型

| 测试 ID | 内容 | 命令/位置 | 通过标准 |
|--------|------|----------|---------|
| LG-L0-01 | `workstation_keys.py` 包含 `WS_ADMIN = "admin"` | `grep -r "WS_ADMIN" backend/apps/core/workstation_keys.py` | 存在且值为 `admin` |
| LG-L0-02 | `LEGACY_WS_GOVERNANCE = "governance"` 仅在兼容注释下使用 | `grep -r "WS_GOVERNANCE" backend/ --include="*.py"` | 只在 `workstation_keys.py` 中作 LEGACY 声明 |
| LG-L0-03 | 无文件使用废弃 `iam` 作为工作台 key（注释除外） | `grep -rn "workstation.*=.*['\"]iam['\"]" backend/` | 0 条匹配 |
| LG-L0-04 | 鹿鸣 DashboardPage 含 V2.0 字样 | `grep "V2.0" workstations/admin/src/pages/DashboardPage.tsx` | 至少 1 条匹配 |
| LG-L0-05 | `workstations.yaml` 19 个工作台 key 存在 | `python ops/scripts/workstation_consistency_check.py` | 0 错误，count == 19 |
| LG-L0-06 | TypeScript 类型检查通过 | `cd workstations/admin && pnpm tsc --noEmit` | exit code 0 |
| LG-L0-07 | `launchGovernanceApi` 已从 `@cn-kis/api-client` 导出 | `grep "launchGovernanceApi" packages/api-client/src/index.ts` | 存在 |

### L1 — Django 系统检查（后端完整性）

**目标**：模型注册、URL 配置、迁移完整性

| 测试 ID | 内容 | 命令 | 通过标准 |
|--------|------|------|---------|
| LG-L1-01 | Django 系统检查无 ERROR | `cd backend && python manage.py check` | 0 errors |
| LG-L1-02 | 迁移链完整无断裂 | `cd backend && python manage.py showmigrations identity` | `0010_launch_governance_gap_goal` 显示 `[X]` |
| LG-L1-03 | `LaunchGovernanceGap` 可在 shell 中查询 | `python manage.py shell -c "from apps.identity.models import LaunchGovernanceGap; print(LaunchGovernanceGap.objects.count())"` | 无 ImportError，返回整数 |
| LG-L1-04 | `check_minimal_project_loop` 管理命令可运行 | `cd backend && python manage.py check_minimal_project_loop` | 输出各节点计数，无 ERROR |
| LG-L1-05 | URL 路由包含 `/auth/governance/launch/` 前缀 | `grep "launch_governance_router" backend/urls.py` | 存在 |

### L2 — 单元测试（无外部依赖）

**目标**：反馈桥接逻辑、模型创建、业务规则

| 测试 ID | 内容 | 命令 | 通过标准 |
|--------|------|------|---------|
| LG-L2-01 | `LaunchGovernanceFeedbackBridgeTests` 全部通过 | `cd backend && python manage.py test apps.identity.tests.test_launch_governance_feedback_bridge --keepdb` | 0 errors, 0 failures |
| LG-L2-02 | HC-13 硬编码验收通过（`admin` key、废弃标识） | `cd backend && python tests/test_hardcoding_remediation.py 2>&1 \| grep -E "HC-13\|PASS\|FAIL"` | HC-13d/f/g 全部 PASS |

> **注意**：若无 `vector` 扩展，加 `--keepdb` 跳过 DB 重建。如需完整测试，先以超级用户执行 `CREATE EXTENSION IF NOT EXISTS vector;`。

### L3 — API 契约测试（后端 HTTP）

**目标**：验证已挂载 API 端点的可达性与响应格式

| 测试 ID | 内容 | 端点 | 通过标准 |
|--------|------|------|---------|
| LG-L3-01 | 工作台注册表返回 19 条 | `GET /auth/workstations/registry` | `code==0`，`len(data.items)==19` |
| LG-L3-02 | 缺口列表接口可达 | `GET /auth/governance/launch/gaps` | `code==0`，`data` 为列表（可空） |
| LG-L3-03 | 目标列表接口可达 | `GET /auth/governance/launch/goals` | `code==0`，`data` 为列表（可空） |
| LG-L3-04 | 概览接口含关键字段 | `GET /auth/governance/launch/overview` | 含 `governance_counts` |
| LG-L3-05 | 无 Token 访问返回 401 | `GET /auth/governance/launch/gaps`（无 Authorization） | HTTP 401 或 `code=UNAUTHORIZED` |
| LG-L3-06 | 缺口创建 → 列表 +1 | `POST /auth/governance/launch/gaps` + `GET` | 创建成功，列表增量 +1 |

**运行方式**：

```bash
python ops/scripts/launch_governance_api_smoke.py
# 或指定服务器
TEST_SERVER=http://118.196.64.48 python ops/scripts/launch_governance_api_smoke.py
```

### L4 — 管理命令验收

**目标**：关键运维命令在实际数据库上正确运行

| 测试 ID | 内容 | 命令 | 通过标准 |
|--------|------|------|---------|
| LG-L4-01 | 最小闭环自检 | `python manage.py check_minimal_project_loop` | 输出含 `Protocol`、`SchedulePlan`、`WorkOrder`、`Enrollment`、`SubjectCheckin`、`Deviation` 节点计数，无 ERROR |
| LG-L4-02 | 工作台一致性检查 | `python ops/scripts/workstation_consistency_check.py` | 0 错误，19 个工作台一致 |
| LG-L4-03 | 系统全量检查 | `python manage.py check --deploy` | 0 critical errors |

### L5 — E2E 页面验收（Playwright Headed，需人工扫码）

**目标**：前端页面可访问、数据正确渲染

| 测试 ID | 内容 | 验收标准 |
|--------|------|---------|
| LG-L5-01 | 鹿鸣侧栏显示「上线治理」菜单组（5 个子项） | 截图：侧栏可见 `上线总览`、`最小闭环`、`19 台地图`、`缺口池`、`目标节奏` |
| LG-L5-02 | 工作台地图页加载 19 张工作台卡片 | 截图：卡片数量 == 19，无 JS 报错 |
| LG-L5-03 | 缺口池页面加载（可空列表） | 截图：页面正常，无 500 / network error |
| LG-L5-04 | 目标节奏页面加载 | 截图：页面正常，无 500 / network error |
| LG-L5-05 | DashboardPage 显示「V2.0」与「19 个工作台」 | 截图：Dashboard 标题栏无旧语义 V1.0 / 15 |

### L6 — 业务场景验收（人工，非自动化）

**目标**：端到端业务流程，跨越多个系统的真实可验性

| 验收 ID | 场景 | 验收步骤 | 通过标准 |
|--------|------|---------|---------|
| LG-L6-01 | 用户反馈 → 缺口池沉淀 | 在用户反馈群发送含问题描述的消息，等待 Webhook 处理 | 鹿鸣「缺口池」出现对应条目（可能有 GitHub Issue 关联） |
| LG-L6-02 | 最小主链端到端 | 创建 Protocol → 发布 SchedulePlan → 确认 Enrollment → 签到 → 关闭 | `check_minimal_project_loop` 输出各节点 ≥ 1 |
| LG-L6-03 | 开发群早晚报不冲突 | 查看开发群同一天的 Actions 卡片与 Celery 简报 | 关键数字（PR 数、open_gaps）口径一致，无两套互相矛盾的描述 |
| LG-L6-04 | 鹿鸣 V2 总览可访问 | 管理员登录 `/admin/launch/overview` | 页面展示 `adoption_rate`、`open_gaps` 等字段，无 500 |

---

## 五、各阶段上线出口标准

### 第 1 阶段出口（0-30 天，`phase1-*` TODO 均 `completed`）

```
□ LG-L0-01  WS_ADMIN == "admin"（静态）
□ LG-L0-04  DashboardPage 含 V2.0（静态）
□ LG-L0-05  workstation_consistency_check 0 错误 + 19 台（静态）
□ LG-L1-01  manage.py check 0 errors（系统检查）
□ LG-L4-02  工作台一致性命令通过
```

### 第 2 阶段出口（31-60 天，`phase2-*` TODO 均 `completed`）

```
□ LG-L1-02  迁移链含 0010（migration）
□ LG-L2-01  反馈桥接单测通过（单元）
□ LG-L3-01  registry 返回 19 条（API）
□ LG-L3-02  gaps API 可达（API）
□ LG-L4-01  check_minimal_project_loop 无 ERROR（命令）
□ LG-L6-01  反馈 → 缺口池沉淀（人工，可选 staging）
```

### 第 3 阶段出口（61-90 天，`phase3-*` TODO 均 `completed`）

```
□ LG-L3-03  goals API 可达（API）
□ LG-L3-04  overview 含 governance_counts（API）
□ LG-L5-01  侧栏 5 菜单可见（E2E）
□ LG-L5-02  19 台地图卡片（E2E）
□ LG-L6-02  最小主链端到端可验（人工）
□ LG-L6-03  早晚报不冲突（人工）
```

---

## 六、CI 集成建议

将以下测试加入 GitHub Actions `.github/workflows/` 中的 `backend-ci` job：

```yaml
- name: L0 workstation consistency
  run: python ops/scripts/workstation_consistency_check.py

- name: L1 Django check
  run: cd backend && python manage.py check

- name: L1 migrations check
  run: cd backend && python manage.py migrate --check

- name: L2 launch governance unit tests
  run: cd backend && python manage.py test apps.identity.tests.test_launch_governance_feedback_bridge --keepdb

- name: L2 HC-13 hardcoding remediation
  run: cd backend && python tests/test_hardcoding_remediation.py
```

L3 API smoke test 需要运行实例，建议在 staging 部署后手动触发：

```bash
TEST_SERVER=http://<staging-ip> python ops/scripts/launch_governance_api_smoke.py
```

---

## 七、文档维护

- 每次新增 launch governance 功能，在本文档新增对应 `LG-*` 验收 ID
- 每次完成一个阶段出口核查，在 `docs/plans/launch-governance-90d.plan.md` 对应 TODO 标记 `status: completed`
- 每周在 `docs/LEARNING_LOOP_STATUS.md` 更新 L6 场景验收结论

---

_生成时间：2026-03-26_  
_适用版本：CN KIS V2.0（feature/admin/22-launch-governance-followup）_
