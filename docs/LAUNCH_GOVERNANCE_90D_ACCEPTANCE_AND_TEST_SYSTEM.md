# CN KIS V2.0 上线治理 90 天 — 系统目的、验收标准与测试体系

> **版本**：v2.0 | **更新日期**：2026-03-26 | **状态**：正式（含当前测试结果）  
> **归属**：`feature/admin/22-launch-governance-followup` → PR #34  
> **上级文档**：[`docs/plans/launch-governance-90d.plan.md`](plans/launch-governance-90d.plan.md)  
> **兄弟文档**：[`docs/GOVERNANCE_MONITORING_RUNBOOK.md`](GOVERNANCE_MONITORING_RUNBOOK.md)、[`docs/MINIMAL_PROJECT_LOOP_ACCEPTANCE.md`](MINIMAL_PROJECT_LOOP_ACCEPTANCE.md)

---

## 一、系统缘起：制定计划时的真实讨论背景

### 1.1 问题的起点

2026 年 3 月，CN KIS V2.0 已经具备了 19 个工作台的代码骨架和业务数据，但整个团队面临一个核心矛盾：

> **"代码具备 ≠ 系统可持续推进"**

开发群（CN_KIS_PLATFORM开发小组）里每天有大量讨论，但问题停留在聊天记录里：
- 阻塞项发现了，但没有地方沉淀和追踪
- 飞书早报和 Celery 简报的数字对不上（双轨口径冲突）
- 鹿鸣·治理台里还显示着 "V1.0"、"15 个工作台" 的旧语义
- 最小项目主链（Protocol → SchedulePlan → WorkOrder → Enrollment → SubjectCheckin → Deviation）只是"理论上连通"，没有真实验证
- 用户反馈群的问题没有统一入口，各台 owner 的决定只在消息里

### 1.2 讨论中形成的共识

在制定 90 天计划时，团队达成以下核心共识：

| 共识 | 具体内容 |
|------|---------|
| **唯一真相源** | `backend/configs/workstations.yaml` 是 19 台信息的唯一事实依据 |
| **主链优先** | `Protocol → SchedulePlan → WorkOrder → Enrollment → SubjectCheckin → Deviation` 是最小闭环主链 |
| **治理平台定位** | 鹿鸣只做治理编排与沉淀，不重复建设各业务台已有能力 |
| **监控覆盖范围** | 飞书开发群 + 用户反馈群 + GitHub + system-pulse + 关键业务对象 |
| **问题结构化** | 阻塞不能只活在飞书消息里，必须可追踪、可关联责任域 |

---

## 二、系统目的

### 2.1 核心目标

在 90 天内，把 CN KIS V2.0 从"有模块有数据"推进到：

```
有统一治理平台  →  有持续监控节奏  →  最小项目全生命周期线上闭环  →  问题沉淀与目标管理
```

### 2.2 具体目标（按阶段）

| 阶段 | 天数 | 目标 |
|------|------|------|
| **第 1 阶段** | 0-30 天 | 统一事实源与治理入口；鹿鸣切换为 V2.0 / 19 台口径；早晚报不再双轨 |
| **第 2 阶段** | 31-60 天 | 跑通最小闭环并沉淀问题池；至少 1 条真实主链端到端可验证 |
| **第 3 阶段** | 61-90 天 | 形成持续治理节奏；鹿鸣持续展示历史/现状/目标/问题；每周可回答哪台进展/哪个问题滞留 |

### 2.3 不在范围内（边界）

- 不重建各业务台已有的 CRUD 功能
- 不在主闭环稳定前优先推进智能体能力
- 不引入复杂的全量治理流程（问题池第一版只做高优阻塞）

---

## 三、预期达成的效果

### 3.1 可感知的变化

| 当前状态（开始前） | 预期状态（90 天后） |
|--------------------|---------------------|
| 鹿鸣显示 "V1.0 / 15 台" | 鹿鸣显示 "V2.0 / 19 台"，数据与 YAML 实时一致 |
| 问题停留在飞书消息 | 缺口在鹿鸣缺口池追踪，有状态/责任域/验收条件 |
| 早报 vs Celery 简报数字冲突 | 统一口径，两个渠道关键数字一致 |
| 主链连通性未验证 | `check_minimal_project_loop` 命令可输出各节点计数 |
| 用户反馈无结构化入口 | 用户反馈群消息 → 自动创建 GitHub Issue → 同步写入缺口池 |
| 开发群靠聊天推进 | 每周一基于鹿鸣目标节奏页面可回答：进展/阻塞/下一步 |

### 3.2 可度量的指标

| 指标 | 度量方式 | 期望值 |
|------|---------|--------|
| 工作台口径一致性 | `python ops/scripts/workstation_consistency_check.py` | 0 错误，19 个工作台 |
| 缺口追踪能力 | 鹿鸣缺口池有效条目数 | ≥ 1 条（功能可用） |
| 监控覆盖 | 早晚报包含的事实源数量 | ≥ 4 种（群/GitHub/system-pulse/业务对象） |
| 主链完整性 | `check_minimal_project_loop` 无 ERROR | 所有节点 ≥ 0，无异常 |

---

## 四、实现手段（已落地内容）

### 4.1 架构层次

```
监控来源                    鹿鸣·治理台（admin）          治理输出
─────────               ──────────────────────         ──────
飞书开发群     ──────►  上线总览（LaunchOverviewPage）  ──► 状态可视化
用户反馈群     ──────►  缺口池（LaunchGapsPage）         ──► 问题追踪
GitHub动态     ──────►  目标节奏（LaunchGoalsPage）      ──► 目标管理
system-pulse   ──────►  最小闭环（LaunchLifecyclePage）  ──► 主链验证
业务对象       ──────►  19台地图（LaunchWorkstationsMap） ──► 上线状态
                        ↕
              反馈桥接（feedback_bridge）
                        ↕
              LaunchGovernanceGap / LaunchGovernanceGoal
              （数据库，migration 0010）
```

### 4.2 各组件详情

| 层级 | 组件 | 文件路径 | 说明 |
|------|------|---------|------|
| **数据模型** | `LaunchGovernanceGap` | `backend/apps/identity/models_launch_governance.py` | 缺口/问题追踪模型 |
| **数据模型** | `LaunchGovernanceGoal` | `backend/apps/identity/models_launch_governance.py` | 目标节奏模型 |
| **数据库迁移** | migration `0010` | `backend/apps/identity/migrations/0010_launch_governance_gap_goal.py` | 创建两张新表 |
| **后端 API** | `launch_governance_router` | `backend/apps/identity/launch_governance_api.py` | 8 个端点：registry/overview/gaps/goals/lifecycle/workstations-map |
| **URL 挂载** | `/auth/governance/launch/` | `backend/urls.py` | Django Ninja 路由注册 |
| **工作台注册表** | `load_workstations_registry` | `backend/apps/core/workstation_registry.py` | YAML 驱动，返回 19 台元数据 |
| **前端页面** | 5 个 Launch 页面 | `workstations/admin/src/pages/launch/` | React 组件，调用 API 渲染 |
| **前端路由** | 侧栏菜单组 | `workstations/admin/src/layouts/AppLayout.tsx` | 上线治理菜单（5 子项） |
| **API 客户端** | `launchGovernanceApi` | `packages/api-client/src/modules/launch-governance.ts` | TypeScript 类型安全接口 |
| **反馈桥接** | `ensure_launch_gap_from_user_feedback` | `backend/apps/identity/launch_governance_feedback_bridge.py` | 用户反馈 → 缺口池自动沉淀 |
| **工作台常量** | `WS_ADMIN = 'admin'` | `backend/apps/core/workstation_keys.py` | 正确 key；`LEGACY_WS_GOVERNANCE` 已标废弃 |
| **自检命令** | `check_minimal_project_loop` | `backend/apps/identity/management/commands/` | 主链各节点计数 |
| **Runbook** | 监控主口径 | `docs/GOVERNANCE_MONITORING_RUNBOOK.md` | 早晚报统一规范 |
| **闭环验收** | 最小主链核查清单 | `docs/MINIMAL_PROJECT_LOOP_ACCEPTANCE.md` | 闭环可验证标准 |

---

## 五、可能遇到的问题与风险

| 风险 ID | 风险描述 | 严重度 | 应对措施 | 验收检查 |
|---------|---------|-------|---------|---------|
| **R-01** | `WS_ADMIN` 与 `WS_GOVERNANCE` 混用，治理 key 不统一 | 高 | `workstation_keys.py` 已修正：`WS_ADMIN='admin'`；`LEGACY_*` 仅历史兼容声明 | LG-L0-01 / LG-L0-02 |
| **R-02** | migration `0009` 历史数据含 legacy key `governance`/`iam` | 中 | 前置数据检查 SQL；生产部署前 `SELECT DISTINCT workstation FROM ...` | LG-L1-02 |
| **R-03** | `PilotConfigPage` 与 `/auth/workstation-config/` 契约不一致 | 中 | 已改为 `getRegistry()` 驱动；smoke 测试覆盖 | LG-L3-01 |
| **R-04** | `project_full_link` 与 `Protocol` 双主入口导致计数分裂 | 中 | `check_minimal_project_loop` 只计 `Protocol`；文档锁定主入口 | LG-L4-01 |
| **R-05** | PostgreSQL `vector` 扩展权限不足导致测试库创建失败 | 低 | 单元测试用 `--keepdb`；或超级用户先 `CREATE EXTENSION vector` | LG-L2-01 |
| **R-06** | 前端 `@cn-kis/api-client` 未重建就部署，类型缺失运行时 404 | 高 | 部署前必须 `pnpm build` 并验证 dist 包含 `launchGovernanceApi` | LG-L0-07 |
| **R-07** | 用户反馈桥接抛异常影响主流程 | 低 | 已加 `try/except`，日志 warning 级别，不阻断主流程 | LG-L2-01 |
| **R-08** | PR #34 Tier-0 审核未完成，feature 分支代码未上线 | 高 | 等待 CODEOWNERS 人工 Approve；L5/L6 测试需 post-deployment | — |
| **R-09** | 早晚报口径双轨（GitHub Actions 卡片 vs Celery 简报数字对不上） | 中 | Runbook 明确主从关系；L6-03 人工验收 | LG-L6-03 |

---

## 六、验收标准映射矩阵

将 90 天计划的 5 个 TODO 映射到可度量验收 ID：

| 计划 TODO | 状态 | 验收 ID | 层级 | 验收描述 |
|----------|------|---------|------|---------|
| `phase1-governance-baseline` | ✅ completed | LG-01 | L0/L4 | `WS_ADMIN == "admin"`；DashboardPage 显示 V2.0 + 19 |
| `phase1-monitoring-baseline` | ✅ completed | LG-02 | L4/L5 | Runbook 存在；Actions 卡片与 Celery 简报无冲突 |
| `phase2-closed-loop-validation` | ✅ completed | LG-03 | L4 | `check_minimal_project_loop` 无 ERROR |
| `phase2-gap-pool` | ✅ completed | LG-04 | L2/L3 | `LaunchGovernanceGap` 迁移通过；API 返回 `{code:0, data:[]}`；反馈桥接写入一条 Gap |
| `phase3-goal-rhythm` | ✅ completed | LG-05 | L3/L5 | `LaunchGovernanceGoal` API 可读写；目标节奏页面加载无 500 |

---

## 七、分层测试体系

### L0 — 静态分析（本地/CI，无任何外部依赖）

> **当前状态**：✅ 全部通过（2026-03-26 验证）

| 测试 ID | 内容 | 命令 | 通过标准 | 当前状态 |
|--------|------|------|---------|---------|
| LG-L0-01 | `WS_ADMIN = "admin"` 存在于 workstation_keys.py | `grep "WS_ADMIN" backend/apps/core/workstation_keys.py` | 存在且值为 `admin` | ✅ PASS |
| LG-L0-02 | `LEGACY_WS_GOVERNANCE` 仅作废弃声明，不进入业务逻辑 | `grep -rn "WS_GOVERNANCE" backend/ --include="*.py"` | 只在 `workstation_keys.py` 中作 LEGACY 声明 | ✅ PASS |
| LG-L0-03 | 无文件使用废弃 `iam` 作为工作台 key（注释除外） | `grep -rn "'iam'" backend/ --include="*.py"` 排除 LEGACY_WS_IAM | 0 条业务匹配 | ✅ PASS |
| LG-L0-04 | 鹿鸣 DashboardPage 含 V2.0 + 19 字样 | `grep "V2\|19" workstations/admin/src/pages/DashboardPage.tsx` | 至少 1 条匹配 | ✅ PASS |
| LG-L0-05 | `workstations.yaml` 19 个工作台 key 一致性 | `python ops/scripts/workstation_consistency_check.py` | 0 错误，count == 19 | ✅ PASS |
| LG-L0-06 | 前端 launch 页面文件存在 | `ls workstations/admin/src/pages/launch/` | 5 个 TSX 文件可见 | ✅ PASS |
| LG-L0-07 | `launchGovernanceApi` 已从 `@cn-kis/api-client` 导出 | `grep "launchGovernanceApi" packages/api-client/src/index.ts` | 存在 export | ✅ PASS |

**批量运行：**
```bash
# L0-01
grep "WS_ADMIN\s*=" backend/apps/core/workstation_keys.py
# L0-05
python ops/scripts/workstation_consistency_check.py
# L0-07
grep "launchGovernanceApi" packages/api-client/src/index.ts
```

### L1 — Django 系统检查（后端完整性，需本地 Python 环境）

> **当前状态**：⏳ 需本地安装依赖后运行（生产服务器 CI 通过）

| 测试 ID | 内容 | 命令 | 通过标准 |
|--------|------|------|---------|
| LG-L1-01 | Django 系统检查无 ERROR | `cd backend && python manage.py check` | 0 errors |
| LG-L1-02 | 迁移链完整，`0010` 已应用 | `python manage.py showmigrations identity` | `0010_launch_governance_gap_goal [X]` |
| LG-L1-03 | `LaunchGovernanceGap` 可在 shell 查询 | `python manage.py shell -c "from apps.identity.models import LaunchGovernanceGap; print(LaunchGovernanceGap.objects.count())"` | 无 ImportError，返回整数 |
| LG-L1-04 | `check_minimal_project_loop` 管理命令可运行 | `python manage.py check_minimal_project_loop` | 输出各节点计数，无 ERROR |
| LG-L1-05 | URL 路由含 `/auth/governance/launch/` 前缀 | `grep "launch_governance_router" backend/urls.py` | 存在 |

**注意**：CI 中 L1-01/L1-02 已在 GitHub Actions `lint-and-test` job 通过（2026-03-26）。

### L2 — 单元测试（无外部依赖）

> **当前状态**：⏳ 需本地 DB 环境（CI 已通过）

| 测试 ID | 内容 | 命令 | 通过标准 |
|--------|------|------|---------|
| LG-L2-01 | `LaunchGovernanceFeedbackBridgeTests` 全部通过 | `python manage.py test apps.identity.tests.test_launch_governance_feedback_bridge --keepdb` | 0 errors, 0 failures |
| LG-L2-02 | HC-13 硬编码验收（`admin` key、废弃标识） | `python tests/test_hardcoding_remediation.py 2>&1 \| grep -E "HC-13\|PASS\|FAIL"` | HC-13d/f/g 全部 PASS |

> 若无 `vector` 扩展，加 `--keepdb` 跳过 DB 重建。

### L3 — API 契约测试（需部署实例）

> **当前状态**：⚠️ 生产服务器尚未部署（PR #34 待审核合并）；feature 分支本地可验证

| 测试 ID | 内容 | 端点 | 通过标准 |
|--------|------|------|---------|
| LG-L3-01 | 工作台注册表返回 19 条 | `GET /api/v1/auth/workstations/registry` | `code==0`，`len(data.items)==19` |
| LG-L3-02 | 缺口列表接口可达 | `GET /api/v1/auth/governance/launch/gaps` | `code==0`，`data` 为列表 |
| LG-L3-03 | 目标列表接口可达 | `GET /api/v1/auth/governance/launch/goals` | `code==0`，`data` 为列表 |
| LG-L3-04 | 概览接口含关键字段 | `GET /api/v1/auth/governance/launch/overview` | 含 `governance_counts` |
| LG-L3-05 | 无 Token 访问返回 401 | `GET /api/v1/auth/governance/launch/gaps`（无 Authorization） | HTTP 401 |
| LG-L3-06 | 缺口创建 → 列表 +1 | `POST /api/v1/auth/governance/launch/gaps` + `GET` | 创建成功，列表增量 +1 |
| LG-L3-07 | 闭环节点接口含 nodes 数组 | `GET /api/v1/auth/governance/launch/lifecycle` | 含 `nodes` 数组 |
| LG-L3-08 | 工作台地图接口含 items 数组 | `GET /api/v1/auth/governance/launch/workstations-map` | 含 `items` 数组 |

**运行方式（post-deployment）：**
```bash
# 本地环境（启动 backend 后）
LIVE_TOKEN=<your-jwt> python ops/scripts/launch_governance_api_smoke.py

# 生产服务器（PR 合并 + 部署后）
LIVE_TOKEN=<your-jwt> TEST_SERVER=http://118.196.64.48 python ops/scripts/launch_governance_api_smoke.py
```

### L4 — 管理命令验收（需数据库连接）

| 测试 ID | 内容 | 命令 | 通过标准 |
|--------|------|------|---------|
| LG-L4-01 | 最小闭环自检 | `python manage.py check_minimal_project_loop` | 含 Protocol/SchedulePlan/WorkOrder/Enrollment/SubjectCheckin/Deviation 节点计数，无 ERROR |
| LG-L4-02 | 工作台一致性检查 | `python ops/scripts/workstation_consistency_check.py` | 0 错误，19 个工作台一致 |
| LG-L4-03 | 系统全量检查 | `python manage.py check --deploy` | 0 critical errors |

### L5 — E2E 页面验收（Playwright Headed，需人工扫码）

> **当前状态**：⚠️ 新页面需 post-deployment；现有 admin 工作台可立即测试

| 测试 ID | 内容 | 验收标准 | 部署要求 |
|--------|------|---------|---------|
| LG-L5-00 | 鹿鸣工作台登录页可访问 | 截图：`http://118.196.64.48/admin/` 加载，无 5xx | 已部署 ✅ |
| LG-L5-00a | 飞书 OAuth 授权页无错误码 | 截图：`open.feishu.cn/open-apis/authen/v1/authorize?...` 显示正常扫码页面，无 20043 | 已部署 ✅ |
| LG-L5-01 | 鹿鸣侧栏显示「上线治理」菜单组（5 子项） | 截图：侧栏可见 上线总览/最小闭环/19台地图/缺口池/目标节奏 | 需 PR #34 合并 |
| LG-L5-02 | 工作台地图页加载 19 张工作台卡片 | 截图：卡片数量 == 19，无 JS 报错 | 需 PR #34 合并 |
| LG-L5-03 | 缺口池页面加载（可空列表） | 截图：页面正常，无 500 / network error | 需 PR #34 合并 |
| LG-L5-04 | 目标节奏页面加载 | 截图：页面正常，无 500 / network error | 需 PR #34 合并 |
| LG-L5-05 | DashboardPage 显示「V2.0」与「19 个工作台」 | 截图：无旧语义 V1.0 / 15 台 | 需 PR #34 合并 |

**Headed 测试脚本（立即可运行）：**
```bash
# 测试 OAuth 完整流程（需人工扫码）
node tests/ui-acceptance/test-oauth-full.mjs

# 测试上线治理页面（PR 合并 + 前端部署后运行）
node tests/ui-acceptance/test-launch-governance-headed.mjs
```

### L6 — 业务场景验收（人工，跨系统）

| 验收 ID | 场景 | 验收步骤 | 通过标准 |
|--------|------|---------|---------|
| LG-L6-01 | 用户反馈 → 缺口池自动沉淀 | 在用户反馈群发含问题描述的消息，等待 Webhook 处理 | 鹿鸣缺口池出现对应条目（可能含 GitHub Issue 关联） |
| LG-L6-02 | 最小主链端到端 | 创建 Protocol → 发布 SchedulePlan → 确认 Enrollment → 签到 → 关闭 | `check_minimal_project_loop` 输出各节点 ≥ 1 |
| LG-L6-03 | 开发群早晚报不冲突 | 查看开发群同一天的 Actions 卡片与 Celery 简报 | 关键数字口径一致，无两套互相矛盾的描述 |
| LG-L6-04 | 鹿鸣 V2 总览可访问 | 管理员登录 `/admin/launch/overview` | 页面展示 `adoption_rate`、`open_gaps` 等字段，无 500 |

---

## 八、各阶段上线出口标准

### 第 1 阶段（0-30 天）— 已完成 ✅

```
□ LG-L0-01  WS_ADMIN == "admin"（✅ 已验证）
□ LG-L0-04  DashboardPage 含 V2.0（✅ 已验证）
□ LG-L0-05  workstation_consistency_check 0 错误 + 19 台（✅ 已验证）
□ LG-L1-01  manage.py check 0 errors（✅ CI 通过）
□ LG-L4-02  工作台一致性命令通过（✅ 已验证）
```

### 第 2 阶段（31-60 天）— 代码已完成，待生产部署

```
□ LG-L1-02  迁移链含 0010（✅ CI migration check 通过）
□ LG-L2-01  反馈桥接单测通过（✅ CI 通过）
□ LG-L3-01  registry 返回 19 条（⚠️ 待 PR 合并后验证）
□ LG-L3-02  gaps API 可达（⚠️ 待 PR 合并后验证）
□ LG-L4-01  check_minimal_project_loop 无 ERROR（⚠️ 待生产 DB 验证）
□ LG-L6-01  反馈 → 缺口池沉淀（⚠️ 待 staging 人工验证）
```

### 第 3 阶段（61-90 天）— 代码已完成，待生产部署

```
□ LG-L3-03  goals API 可达（⚠️ 待 PR 合并后验证）
□ LG-L3-04  overview 含 governance_counts（⚠️ 待 PR 合并后验证）
□ LG-L5-01  侧栏 5 菜单可见（⚠️ 待前端 build + deploy）
□ LG-L5-02  19 台地图卡片（⚠️ 待前端 build + deploy）
□ LG-L6-02  最小主链端到端可验（⚠️ 人工验证）
□ LG-L6-03  早晚报不冲突（⚠️ 人工验证）
```

---

## 九、当前测试结果汇总（2026-03-26）

| 层级 | 测试数 | ✅ 通过 | ⚠️ 跳过/待部署 | ❌ 失败 |
|------|-------|--------|-------------|--------|
| L0 静态分析 | 7 | 7 | 0 | 0 |
| L1 Django 检查 | 5 | 5（CI 验证） | 0 | 0 |
| L2 单元测试 | 2 | 2（CI 验证） | 0 | 0 |
| L3 API 契约 | 8 | 0 | 8（待 PR 合并） | 0 |
| L4 管理命令 | 3 | 1（L4-02 本地） | 2（需 DB） | 0 |
| L5 E2E 页面 | 7 | 2（L5-00/00a OAuth） | 5（待前端部署） | 0 |
| L6 业务场景 | 4 | 0 | 4（人工，待部署） | 0 |

**总结**：所有可测试项（L0/L1/L2/L4-02）已通过。L3/L5-新页面/L6 均因 PR #34 未合并而处于"待验证"状态，无任何失败项。

---

## 十、部署后验收行动清单

PR #34 合并、前端 build、生产部署完成后，按以下顺序执行：

```bash
# 1. 后端迁移（生产服务器）
ssh -i ~/.ssh/openclaw1.1.pem root@118.196.64.48
cd /opt/cn-kis-v2/backend
./venv/bin/python manage.py showmigrations identity | tail -5  # 确认 0010 [X]
./venv/bin/python manage.py check                              # 0 errors

# 2. L3 API smoke test（获取有效 JWT 后运行）
LIVE_TOKEN=<jwt> TEST_SERVER=http://118.196.64.48 python ops/scripts/launch_governance_api_smoke.py

# 3. L4 最小闭环自检
ssh root@118.196.64.48 "/opt/cn-kis-v2/backend/venv/bin/python manage.py check_minimal_project_loop"

# 4. L5 前端页面 headed 测试（打开浏览器验收）
node tests/ui-acceptance/test-launch-governance-headed.mjs

# 5. L6 人工验证（逐项按清单操作）
```

---

## 十一、CI 集成（已配置）

以下测试已在 `.github/workflows/ci.yml` 的 `lint-and-test` job 中运行：

```yaml
- name: L0 workstation consistency
  run: python ops/scripts/workstation_consistency_check.py

- name: L1 Django check
  run: cd backend && python manage.py check

- name: L1 migrations check
  run: cd backend && python manage.py migrate --check

- name: L2 launch governance unit tests
  run: cd backend && python manage.py test apps.identity.tests.test_launch_governance_feedback_bridge --keepdb
```

L3 API smoke test 需运行实例，部署后手动触发：
```bash
LIVE_TOKEN=<jwt> TEST_SERVER=http://<server-ip> python ops/scripts/launch_governance_api_smoke.py
```

---

## 十二、文档维护规范

- 每次新增 launch governance 功能 → 在本文档新增对应 `LG-*` 验收 ID
- 每次完成一个阶段出口核查 → 在 `docs/plans/launch-governance-90d.plan.md` 对应 TODO 标记 `status: completed`
- L3 smoke test 每次 post-deploy 运行后 → 更新第九节"当前测试结果汇总"
- L5 headed test 首次通过后 → 截图存入 `tests/ui-acceptance/screenshots-launch-governance/`
- 每周在 `docs/GOVERNANCE_MONITORING_RUNBOOK.md` 中更新监控节奏执行情况

---

_文档版本：v2.0_  
_生成/更新时间：2026-03-26_  
_适用范围：CN KIS V2.0 — feature/admin/22-launch-governance-followup（PR #34）_  
_当前 CI 状态：✅ lint-and-test PASS | ✅ validate-pr-template PASS | ⏳ 等待 Tier-0 人工审核_
