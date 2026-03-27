# CN KIS V2.0 上线治理（90 天计划）— 测试验收标准与测试体系

> **版本**：1.0  
> **状态**：现行（与 `docs/plans/launch-governance-90d.plan.md` 对齐）  
> **上位框架**：[`docs/TEST_ACCEPTANCE_FRAMEWORK.md`](TEST_ACCEPTANCE_FRAMEWORK.md)（全系统优先级 P0–P3 定义）  
> **阅读对象**：研发、测试、运维、治理负责人  

本文将 **90 天行动计划中的目的、阶段验收效果与已知风险**，落实为 **可执行的验收标准（含通过/失败判据）** 与 **分层测试体系**；不重复展开数据采集层（T1）等全量章节，必要时回指 `TEST_ACCEPTANCE_FRAMEWORK.md`。

---

## 一、文档与范围

| 输入 | 用途 |
|------|------|
| [`docs/plans/launch-governance-90d.plan.md`](plans/launch-governance-90d.plan.md) | 目标、分期、监控范围、风险 |
| [`docs/GOVERNANCE_MONITORING_RUNBOOK.md`](GOVERNANCE_MONITORING_RUNBOOK.md) | 持续监控主口径（若仓库已收录） |
| [`docs/MINIMAL_PROJECT_LOOP_ACCEPTANCE.md`](MINIMAL_PROJECT_LOOP_ACCEPTANCE.md) | 最小闭环业务锚点清单（若仓库已收录） |
| [`docs/LEARNING_LOOP_STATUS.md`](LEARNING_LOOP_STATUS.md) | 周更学习循环与 Gate 对照 |

**范围边界**：上线治理 = 鹿鸣编排层 + 监控节奏 + 最小闭环可验证性 + 缺口/目标沉淀；**不**替代各业务台站内功能测试。

---

## 二、目的 / 阶段效果 → 验收标准映射

验收项编号前缀 **`LG-90d`**（Launch Governance 90-day）。**优先级**继承全框架：治理口径错误、主链误判为「已闭环」属 **P0/P1**。

| 计划目的或阶段效果 | 验收标准 ID | 简要判据 |
|----------------------|-------------|----------|
| 有统一治理平台与 V2.0 / 19 台口径 | **LG-90d-P1-01** | 鹿鸣与注册表展示 **19** 个工作台，与 `backend/configs/workstations.yaml` 一致；无「V1.0 / 15 台」作为唯一口径的对外文案残留（允许历史文档标注 deprecated） |
| 不再只靠聊天推进 | **LG-90d-P1-02** | 至少一条 **结构化事实源**（鹿鸣 API 或 DB）可回答：开放缺口数、阶段摘要、注册表；开发群仍可为补充但非唯一真相 |
| 最小闭环主链单一 | **LG-90d-P2-01** | 文档与治理视图明确主链为 `Protocol → SchedulePlan(已发布) → WorkOrder → Enrollment(enrolled) → SubjectCheckin → Deviation/Quality`；与 `project_full_link` 并行时 **书面主入口** 已裁定 |
| 0–30 天：统一入口与早晚报口径 | **LG-90d-P1-03** | `system-pulse`、Actions `ops-briefing`、Celery 简报 **主从关系** 与 Runbook 一致；同一指标在卡片与鹿鸣总览 **无相互矛盾**（冲突时以 DB/API 实测为准并修文案） |
| 31–60 天：闭环真实可验证 | **LG-90d-P1-04** | **staging（或约定环境）至少 1 条** 端到端主链经人工步骤跑通，并有数据行可追溯；**仅** `manage.py check_minimal_project_loop` 全 ERROR **不得**视为闭环已验证 |
| 31–60 天：问题池沉淀 | **LG-90d-P1-05** | 缺口池支持计划所列维度；用户反馈→GitHub Issue→缺口 **幂等**（`feishu_ref`）；高优先级阻塞 **可**在鹿鸣追踪状态与责任域 |
| 61–90 天：目标与节奏 | **LG-90d-P2-02** | 目标/节奏在鹿鸣可维护、可列表；周复盘可引用 **同一套** 列表（不要求全自动周更） |
| 61–90 天：洞察可关联 | **LG-90d-P3-01** | `pending_insights` / Issue / 群结论 的 **编号或 ref 规范** 成文（团队遵守）；抽查可关联到缺口或目标 |

---

## 三、分层测试体系（与金字塔对齐）

在 `TEST_ACCEPTANCE_FRAMEWORK.md` 金字塔基础上，上线治理专项采用下列 **L0–L6** 分层（可并行执行，**发布门槛**见第五节）。

```
L6 业务与运营验收（staging / 生产只读）
L5 外部节奏与观测（GitHub Actions / Celery / 飞书）
L4 E2E（鹿鸣·治理台：上线治理菜单与关键路径）
L3 集成 / API 契约（JWT + 治理与注册表端点）
L2 管理命令与任务（最小闭环计数、迁移）
L1 单元测试（桥接、模型、常量）
L0 门禁与静态一致性（check、硬编码脚本、工作站一致性）
```

### L0 — 门禁与静态一致性

| 测试 ID | 内容 | 命令 / 位置 | 通过判据 |
|---------|------|-------------|----------|
| LG-L0-01 | Django 系统检查 | `cd backend && python manage.py check` | 无 ERROR |
| LG-L0-02 | 工作台常量与 19 台 | `python manage.py shell < tests/test_hardcoding_remediation.py`（关注 **HC-13** 段） | HC-13 相关断言 PASS |
| LG-L0-03 | 工作站注册表一致性（若已配置脚本） | `python ops/scripts/workstation_consistency_check.py`（以仓库现行脚本为准） | 退出码 0 |
| LG-L0-04 | identity 迁移链路 | `python manage.py showmigrations identity` | 含上线治理相关迁移且顺序正确 |

### L1 — 单元测试

| 测试 ID | 内容 | 位置（典型） | 环境要求 |
|---------|------|----------------|----------|
| LG-L1-01 | 反馈→缺口桥接幂等与字段 | `apps.identity.tests.test_launch_governance_feedback_bridge` | PostgreSQL；若迁移依赖 `vector`，需 superuser 或 CI 镜像预装扩展 |
| LG-L1-02 | `workstation_keys` / 注册表解析 | 随 HC-13 或专项单测（建议后续补充） | SQLite/Postgres 均可 |

### L2 — 管理命令与数据面

| 测试 ID | 内容 | 命令 | 通过判据 |
|---------|------|------|----------|
| LG-L2-01 | 最小闭环节点计数 | `python manage.py check_minimal_project_loop` | **连通业务库时** 各节点输出 `total` / `last_7d`，无异常栈；库不可用时 **单独记录环境缺失**，不冒充闭环已验证 |
| LG-L2-02 | 迁移应用 | `python manage.py migrate identity`（及相关 app） | 无 ERROR |

### L3 — API 集成（契约）

**前置**：有效 JWT，账号具备 `system.role.manage`（或与端点一致之权限）。

| 测试 ID | 方法 | 路径（前缀 `/api/v1`） | 期望 |
|---------|------|-------------------------|------|
| LG-L3-01 | GET | `/auth/workstations/registry` | `code=200`，`data.items.length === 19`（与 yaml 同步） |
| LG-L3-02 | GET | `/auth/governance/launch/overview` | `code=200`，含 adoption / governance_counts 等约定字段 |
| LG-L3-03 | GET | `/auth/governance/launch/lifecycle` | `code=200`，nodes 含 protocol…quality 等节点 |
| LG-L3-04 | GET | `/auth/governance/launch/gaps` | `code=200`；POST/PUT 在 staging 抽样验证 |

**实现建议**：新增 `ops/scripts/launch_governance_api_smoke.py` 或 pytest + `httpx`（与 `GOVERNANCE_ACCEPTANCE_TEST_GUIDE` 中 API 测试风格一致）；**勿**在测试脚本中硬编码生产密钥。

### L4 — E2E（浏览器）

| 测试 ID | 场景 | 工具 | 通过判据 |
|---------|------|------|----------|
| LG-L4-01 | 登录鹿鸣后「上线治理」子菜单均可打开且无红屏 | Playwright（headed 抽检） | 与 `.cursor/rules/test-before-deploy.mdc` 一致 |
| LG-L4-02 | 工作台总览 / 试点配置 显示与注册表一致 | 同上 | 台数与名称与 L3-01 一致 |

**说明**：[`docs/GOVERNANCE_ACCEPTANCE_TEST_GUIDE.md`](GOVERNANCE_ACCEPTANCE_TEST_GUIDE.md) 中若仍含旧 `governance` 路径，E2E 应 **以 `admin` 与当前路由为准** 更新用例。

### L5 — 外部节奏与观测（非自动化断言为主）

| 测试 ID | 内容 | 验证方式 | 频率建议 |
|---------|------|----------|----------|
| LG-L5-01 | 工作日开发群 Actions 卡片 | 人工检查飞书群 + Actions 运行记录 | 每周至少 1 次 |
| LG-L5-02 | system-pulse 被卡片消费 | Actions 日志或卡片内摘要存在；`SYSTEM_PULSE_TOKEN` 失效时有明确告警 | 随发布 |
| LG-L5-03 | Celery 早晚报 | Worker/Beat 存活 + 日志成功发送记录 | 每日运维巡检 |

### L6 — 业务与运营验收（Phase 2 核心）

| 测试 ID | 内容 | 执行方 | 产出物 |
|---------|------|--------|--------|
| LG-L6-01 | **最小闭环主链** 按 `MINIMAL_PROJECT_LOOP_ACCEPTANCE` 走通一条 | 业务 + 测试 | 截图或清单签字 + 环境/协议 ID 记录 |
| LG-L6-02 | 反馈→Issue→缺口 联调 | 业务或测试 | Issue URL + 鹿鸣缺口 `feishu_ref` 一致 |
| LG-L6-03 | 周节奏：目标与问题池对齐例会 | 治理负责人 | 会议纪要链接或 `LEARNING_LOOP_STATUS` 更新 |

---

## 四、针对「可能遇到的问题」的专项门禁

| 风险 | 测试 / 门禁 | 说明 |
|------|-------------|------|
| 口径双轨（卡片 vs 鹿鸣 vs DB） | **LG-L3-02** 与 **LG-L5-01** 同学期对比；争议以 DB/API 为准修文案 | 固定「主从」见 Runbook |
| legacy workstation key | **LG-L0-02** + 抽检 `AccountWorkstationConfig` / 角色种子 | 仅存 `LEGACY_*` 常量兼容，新业务只用 `admin` |
| PilotConfig 与 API 契约不一致 | **LG-L4-02** + 保存后 `GET workstation-config` 回读一致 | 必要时补契约自动化 |
| `project_full_link` vs `Protocol` 双轨 | **架构决策记录** + **LG-L6-01** 只选一条主链做「闭环已验证」签字 | 未裁定前 **LG-90d-P2-01** 不通过 |
| 开发群结论未入库 | 不依赖自动化；**LG-L6-03** 检查是否有人工登记 SOP | 可选后续 Bot 需求单独立项 |
| CI 无法 `CREATE EXTENSION vector` | **LG-L1-01** 在指定 job/自托管 Runner 跑；或在 PR 中标注「依赖 DB 镜像」 | 避免 silent skip 误判质量 |

---

## 五、发布与阶段签字门槛（汇总）

### 5.1 每次后端发布（最低）

- **LG-L0-01**、**LG-L0-04**、**LG-L2-02**  
- 若含治理 API 变更：**LG-L3-01～L3-03** 至少在 **staging** 执行  

### 5.2 每次鹿鸣前端发布（最低）

- **LG-L4-01**（可 headed 抽检）  
- 与注册表相关改动：**LG-L3-01** 或 **LG-L4-02**  

### 5.3 Phase 1（0–30 天）阶段签字

- **LG-90d-P1-01**、**LG-90d-P1-02**、**LG-90d-P1-03** 全部满足  

### 5.4 Phase 2（31–60 天）阶段签字

- **LG-90d-P1-04**、**LG-90d-P1-05**、**LG-L6-01**、**LG-L6-02**  

### 5.5 Phase 3（61–90 天）阶段签字

- **LG-90d-P2-02**、**LG-90d-P3-01**、**LG-L6-03** 持续执行 ≥ 4 周有记录  

---

## 六、CI 集成建议（可选演进）

1. **PR 阶段**：`manage.py check` + `pytest`（排除需 vector 的用例或使用服务容器）。  
2. **staging 部署后**：Webhook 或定时触发 **LG-L3-xx** smoke。  
3. **硬编码回归**：将 `test_hardcoding_remediation.py` 中 **E 组 HC-13** 纳入定期 job（与现有 lint 基线并列）。  

---

## 七、维护

- 90 天计划正文变更时：同步更新 **第二节映射表** 与本文件版本号。  
- 与 `TEST_ACCEPTANCE_FRAMEWORK.md` 冲突时：**安全与数据不变式** 以全框架为准；**治理专项** 以本文件为准。  

---

**变更记录**

| 日期 | 变更 |
|------|------|
| 2026-03-26 | 初版：对齐 90 天计划目的、分期验收与已知风险 |
