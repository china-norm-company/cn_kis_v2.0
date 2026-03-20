# CN KIS V2.0 迁移章程

> 版本：1.0 | 生效日期：2026-03-20 | 状态：正式生效

---

## 一、章程目的

本章程是 `CN_KIS_V2.0` 系统演进的最高治理文件，其目的是：

1. **固化不可违反的迁移红线**，防止在工程重构过程中破坏飞书认证能力、权限模型、知识资产和双环境职责分工。
2. **建立迁移决策的依据**，任何架构改动、模块迁移、部署切换，须以本章程为合规基准。
3. **保护已有的核心资产**，实现"进化，而非重建"——现有生产数据、知识图谱、向量化能力只增强，不退化。

本章程适用于全部参与 V2 开发的成员，无论其角色（工程师、业务专家、AI 执行者）。

---

## 二、迁移哲学

> **不是推倒重写，是复制式迁移 + 结构重构。**

- `CN_KIS_V1.0` 完整封存，随时可回切，不受 V2 改动影响。
- V2 新仓库的代码通过"复制后重构"方式建立，不引用旧仓库的任何文件路径或运行时依赖。
- V2 第一阶段以"能力对等"为上线门槛，而不是"架构更优雅"。

---

## 三、四条不可破坏红线

### 红线 1：飞书统一认证与 Token 持久化

**背景**：飞书 access_token（2h）+ refresh_token（30 天滚动续期）可实现"一次授权，永续可用"。任何导致用户反复登录的实现均视为违规。

**核心约束**：

| 约束项 | 要求 |
|--------|------|
| 主授权架构 | 统一使用子衿 App ID（`cli_a98b0babd020500e`）签发 token，禁止各工作台各自授权 |
| refresh_token 覆盖 | `_save_feishu_user_token` 只有在拿到非空 refresh_token 时才更新，禁止用空值覆盖 |
| 刷新窗口 | 提前 1 小时执行 pre-expiry 刷新，refresh_token 剩余 < 7 天时主动续期 |
| 健康检查 | Celery Beat 定时健康检查任务必须随服务一起启动 |
| issuer_app_id | 必须记录 token 由哪个应用签发，禁止跨应用混用 |

**关键代码文件**（迁移时必须优先迁移且不得降级）：

- `backend/apps/identity/services.py` → `_save_feishu_user_token()`、`feishu_oauth_login()`
- `backend/apps/secretary/feishu_fetcher.py` → `get_valid_user_token()`
- `backend/apps/secretary/models.py` → `FeishuUserToken`
- `backend/config/celery_config.py` → token 健康检查任务调度

**验收标准**：

- [ ] V2 飞书登录可完成全流程
- [ ] refresh_token 落库且不被空值覆盖（审计日志 `refresh_len > 0`）
- [ ] 48 小时后无需重新授权
- [ ] Celery Beat 健康检查任务正常运行

---

### 红线 2：权限模型必须升级但不能丢能力

**背景**：系统面向化妆品临床研究合规场景，权限必须精细到菜单、功能、项目、数据类型四个维度，且必须满足监管要求。

**核心约束**：

| 权限维度 | 含义 | 对应模型字段 |
|---------|------|------------|
| `workstation` | 可进入哪些工作台 | `AccountWorkstationConfig` |
| `menu` | 工作台中可见哪些菜单 | `AccountWorkstationConfig.menu_config` |
| `action` | 可执行哪些功能动作 | `Permission.action` |
| `project_scope` | 可访问哪些项目 | `AccountRole.project_id`（project-level role）|
| `data_type_scope` | 可访问哪些数据类型 | `Permission.scope` + `get_data_scope()` |

**关键代码文件**（迁移时必须保留并增强）：

- `backend/apps/identity/models.py` → `Permission`、`AccountRole`、`AccountWorkstationConfig`
- `backend/apps/identity/authz.py` → 授权校验逻辑
- `backend/apps/identity/filters.py` → `get_data_scope()`、`filter_queryset_by_scope()`
- `backend/apps/identity/decorators.py` → API 权限装饰器

**V2 增强目标**（不退化，可增强）：

- 权限矩阵可在治理台（鹿鸣）图形化配置
- 工作台菜单可见性由角色动态控制，不硬编码
- 项目级数据隔离：`global`、`project`、`personal` 三级数据范围

**验收标准**：

- [ ] 角色-菜单矩阵可配置
- [ ] 项目级数据过滤可验证
- [ ] 数据类型范围（`global`/`project`/`personal`）测试通过
- [ ] 治理台可管理所有账号的工作台权限

---

### 红线 3：知识资产绝不丢失

**背景**：系统已积累大量通过飞书采集、LIMS 接入、易快报导入生成的结构化知识，这些是不可再生的生产资产。

**受保护的知识资产清单**：

| 资产类型 | 模型/存储位置 | 数量级 |
|---------|------------|-------|
| 飞书原始上下文 | `PersonalContext`（邮件/IM/日历/任务/文档） | 12,665+ 条 |
| 知识条目 | `KnowledgeEntry` + `embedding_vector` | 含 1024-dim 向量 |
| 知识图谱 | `KnowledgeEntity` / `KnowledgeRelation` | 语义图谱节点与关系 |
| 向量化结果 | pgvector 1024-dim，jinaai/jina-embeddings-v3 | 已索引结果 |
| 易快报原始层 | `EkbRawRecord`（34,723 条历史单据） | 不可变原始层 |
| LIMS 原始层 | `RawLimsRecord` | 不可变原始层 |

**迁移原则**：

1. **先保护，再迁移**：知识资产先全量备份与校验，建立迁移映射后，再切换应用代码
2. **分层核对**：原始层、知识层、图谱层、向量层分别独立核对，不混用
3. **V2 初期只读**：在 V2 正式接管写入链路前，知识资产对 V2 只读，不允许无保护写操作
4. **content_hash 去重**：迁移和导入时严格使用 `content_hash` 字段做去重，避免重复写入

**关键代码文件**（迁移时必须保护）：

- `backend/apps/secretary/models.py` → `PersonalContext`
- `backend/apps/knowledge/models.py` → `KnowledgeEntry`、`KnowledgeEntity`、`KnowledgeRelation`
- `backend/apps/knowledge/ingestion_pipeline.py` → `run_pipeline()`、`RawKnowledgeInput`
- `backend/apps/knowledge/retrieval_gateway.py` → 5 层统一检索网关
- `backend/apps/ekuaibao_integration/models.py` → `EkbRawRecord`、`EkbImportBatch`
- `backend/apps/lims_integration/models.py` → `RawLimsRecord`、`LimsImportBatch`

**验收标准**：

- [ ] 迁移前后 `PersonalContext` 记录数一致
- [ ] `KnowledgeEntry` 向量索引完整性校验通过
- [ ] `EkbRawRecord` 记录数与 checksum 一致
- [ ] V2 读取历史知识资产的检索结果与 V1 一致（抽样 20 条对比）
- [ ] V2 写入链路未启用前，生产知识资产无新的无授权写入

---

### 红线 4：双环境职责不得混淆

**背景**：阿里云用于测试/UAT，火山云用于正式生产和知识资产承载。两者职责严格分离。

**环境定义**：

| 环境 | 用途 | 域名/地址 |
|------|------|---------|
| **本地 (Local)** | 个人开发与本地测试 | localhost |
| **阿里云测试 (AliyunTest)** | V2 集成测试、联调、UAT、权限演练 | `test-guide.data-infact.com` |
| **火山云生产 (VolcProd)** | 正式生产、正式知识库、飞书正式采集 | `118.196.64.48` |

**阿里云测试环境必须禁用的任务**（防止污染生产资产）：

```
# 禁止在测试环境执行的任务：
❌ 飞书全量/增量正式采集
❌ PersonalContext -> KnowledgeEntry 正式入库
❌ 正式向量化批处理
❌ 火山知识库 collection 写入
❌ 对生产 Qdrant/pgvector/embedding endpoint 的写操作
❌ 生产飞书 App 凭证的批量 refresh 与健康检查
```

**阿里云测试环境必须隔离的配置项**：

```bash
# .env.test 中必须使用隔离值（非生产值）
DATABASE_URL=<test_db_url>          # 使用测试专用 PostgreSQL
REDIS_URL=<test_redis_url>          # 使用测试专用 Redis
QDRANT_URL=<test_qdrant_url>        # 使用测试专用 Qdrant
VOLCENGINE_KB_COLLECTION=           # 留空或 test 专用 collection
ARK_EMBEDDING_ENDPOINT=             # 使用 mock 或 test endpoint
FEISHU_APP_ID=<test_feishu_app_id>  # 使用测试飞书应用
CELERY_PRODUCTION_TASKS_DISABLED=true  # 禁用生产采集类 Beat 任务
```

**验收标准**：

- [ ] 测试环境无法连接或写入生产数据库
- [ ] 测试环境运行 2 小时后，生产 `PersonalContext` 记录数无变化
- [ ] 环境变量校验脚本在测试环境执行通过（无生产配置泄漏）
- [ ] 火山云生产飞书入口可正常访问，不受 V2 测试影响

---

## 四、能力对等清单（V1 → V2 验收基线）

V2 进入可用阶段前，以下能力必须与 V1 对等：

### 认证与访问

- [ ] 飞书 OAuth 登录（子衿主授权）
- [ ] 工作台访问控制（按角色限制）
- [ ] 菜单级别显示控制
- [ ] 项目级数据范围过滤

### 核心业务流程

- [ ] 方案（Protocol）管理
- [ ] 访视（Visit）管理
- [ ] 受试者（Subject）管理
- [ ] EDC 数据录入
- [ ] 工单（Workorder）管理
- [ ] 接待与签到流程

### 集成能力

- [ ] 飞书消息/邮件/日历/任务采集
- [ ] 易快报数据读取（历史单据）
- [ ] LIMS 数据接入
- [ ] 知识库检索（关键词+向量+图谱）
- [ ] AI 对话（ARK + Kimi 通过 agent_gateway）

### 运营与治理

- [ ] 审计日志
- [ ] 系统配置管理
- [ ] 部署与回滚验证
- [ ] 数据库迁移（无冲突）

---

## 五、迁移波次总览

| 波次 | 代号 | 内容 | 交付门槛 |
|------|------|------|---------|
| Wave 0 | 治理底座 | 仓库结构、协作规则、SSOT、双环境规则 | 仓库可访问，文档口径统一 |
| Wave 1 | 认证权限底座 | identity、FeishuUserToken、RBAC | 飞书登录通，token 自动刷新 |
| Wave 2 | 核心业务主干 | API 壳、protocol/visit/subject/edc/workorder | 至少一条端到端业务链可运行 |
| Wave 3 | 知识数据平面 | knowledge、PersonalContext、ekb/lims 原始层 | 知识资产只读对等验证通过 |
| Wave 4 | 企业扩展域 | finance/crm/hr/quality/resource | 与 V1 形成完整能力对等 |
| Wave 5 | AI 与治理台 | agent_gateway、digital-workforce、control_plane | 统一执行平面与审计可观测 |

---

## 六、禁止事项

以下操作在 V2 迁移过程中绝对禁止：

```
❌ 删除或覆盖 CN_KIS_V1.0 的任何代码文件
❌ 对 V1 生产数据库执行不可回滚的 DROP/TRUNCATE
❌ 在未有受控写保护的情况下向生产知识资产写入
❌ 测试环境使用生产飞书 App 凭证
❌ V2 测试上线期间停止 V1 飞书 token 健康检查
❌ 在 V2 权限未验证通过前开放给非测试用户
❌ 将生产数据直接 dump 到测试环境（应使用脱敏数据集）
❌ 未经章程确认擅自改变双环境的职责边界
```

---

## 七、变更控制

本章程的任何修改，须满足：

1. 在 GitHub 以 PR 形式提交，标题前缀 `[CHARTER]`
2. 至少一名系统负责人 Review 并 Approve
3. PR 描述中说明变更原因及对四条红线的影响评估

本章程不得被个人 commit 直接修改，必须经 PR 合并。

---

*本章程由系统首席架构师于 2026-03-20 制定，受 `.cursor/rules/safety-and-git.mdc` 与 GitHub Branch Protection 双重保护。*
