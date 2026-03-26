# 洞明·数据台 业务全景分析

> 版本：v1.0 | 生成日期：2026-03-21 | 状态：正式
>
> 飞书 App ID：`cli_a93753da2c381cef`（独立网页应用，与子衿完全解耦）
> 访问地址：`https://[域名]/data-platform`

---

## 一、工作台定位

### 1.1 存在意义

**洞明·数据台**是 CN KIS V2.0 系统的**数据中台可视化管理工作台**，解决 V1.0 中长期存在的"数据黑盒"问题。

在 V1.0 中，数据管理完全不可见：

| 问题 | 影响 |
|---|---|
| 无数据目录：数据存在哪里完全依赖开发人员记忆 | 业务人员无法自助了解数据结构，优化成本极高 |
| 无血缘追踪：数据来源和流向不透明 | 发现数据问题时无法快速定位根因 |
| 无管道监控：飞书采集、易快报同步何时失败无感知 | 数据中断可能持续数天才被发现 |
| 无质量看板：知识资产质量好坏无从评估 | 知识库"虚胖"，RAG 召回质量不稳定 |
| 无备份可见性：数据安全状态对所有人不透明 | 灾难恢复能力未知 |

**洞明的核心使命**：将 CN KIS 中**所有数据资产**的状态、规模、流转关系、质量指标和保护策略，以**可视化**的方式呈现给数据经理、技术总监和系统管理员，使"数据不再是黑盒"。

### 1.2 在系统生态中的位置

```
┌──────────────────────────────────────────────────────────────────────┐
│                         数据生产层（业务工作台）                        │
│                                                                        │
│  子衿→飞书采集  采苓/维周→工单EDC  财务→合同发票  研究→CRF             │
│  人事→绩效薪资  质量→偏差CAPA     易快报→费用报销                       │
│                    ▼ 数据写入                                          │
├────────────────────────────────────────────────────────────────────── ┤
│                         数据存储层                                      │
│                                                                        │
│   PostgreSQL（主库）      Qdrant（向量库）      Redis（Cache+Queue）    │
│   ├─ 业务领域表           └─ KnowledgeEntry     └─ 权限/会话缓存       │
│   ├─ 知识资产表               向量索引                                  │
│   └─ 原始层（不可变）                                                   │
│                    ▼ 数据读取与治理                                     │
├────────────────────────────────────────────────────────────────────── ┤
│                                                                        │
│              ┌──────────────────────────────────┐                    │
│              │      洞明·数据台                   │                    │
│              │   独立飞书 App 认证                 │                    │
│              │   数据资产 · 血缘 · 质量 · 治理      │                    │
│              └──────────────────────────────────┘                    │
│                                                                        │
│   洞明是唯一能跨越所有业务领域、查看整个数据平面的工作台                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 数据资产全局规模（V2 当前）

| 数据层 | 存储位置 | 规模 | 保护级别 |
|---|---|---|---|
| 飞书上下文（邮件/IM/任务/日历/文档）| `t_personal_context` | 12,665+ 条 | 写保护（需开关） |
| 知识条目 | `t_knowledge_entry` + Qdrant | 含1024-dim向量 | 写保护（需开关） |
| 知识图谱节点 | `t_knowledge_entity` | 含34种关系类型 | 写保护（需开关） |
| 知识图谱关系 | `t_knowledge_relation` | 支持人工+LLM自动抽取 | 写保护（需开关） |
| 易快报原始单据 | `t_ekb_raw_record` | 34,723 条 | **永久不可变** |
| LIMS 原始记录 | `t_raw_lims_record` | 不可变原始层 | **永久不可变** |
| 临床业务数据 | 各领域表（见第三章）| 覆盖协议/受试者/工单等 | 正常业务写入 |

---

## 二、服务对象与角色

### 2.1 主要用户角色

| 角色 | 级别 | 主要诉求 |
|---|---|---|
| `data_manager`（数据经理）| L6 | 日常监控数据管道健康状态；知识资产质量审查；血缘追踪 |
| `tech_director`（技术总监）| L8 | 整体数据架构可视化；存储层健康；系统扩展性评估 |
| `admin`（系统管理员）| L10 | 写保护开关操作；资产一致性核验；备份状态查看 |
| `data_analyst`（数据分析师）| L4 | 了解可用数据集；知识库覆盖率评估；协助 RAG 效果分析 |
| `general_manager`（总经理）| L8 | 高层只读：系统数据资产概览，知识积累成效 |
| `superadmin`（超级管理员）| L10 | 全局写保护控制；存储架构变更 |

### 2.2 洞明与业务工作台的关系

洞明**不参与业务操作**，它是业务数据的"观察者"和"治理者"：
- 业务人员在各自工作台录入数据
- 洞明观察这些数据的流转、质量和规模
- 洞明不能直接修改业务数据（只读观察）
- 洞明可以操控数据治理开关（如写保护开关）

---

## 三、系统数据资产全景图

### 3.1 数据资产全景目录（27 张核心表，按模块）

#### 认证与权限层（Identity）

| 表名 | 标签 | 记录类型 | 职责 |
|---|---|---|---|
| `t_account` | 用户账号 | 业务表 | 飞书 OAuth 账号，含 open_id、角色 |
| `t_role` | 角色定义 | 参照表 | 35种角色，L1-L10，含工作台范围 |
| `t_permission` | 权限码 | 参照表 | 全量权限码（module.function.action 三元组） |
| `t_session_token` | 会话 Token | 日志表 | JWT 会话记录，含设备/IP/过期 |
| `t_feishu_user_token` | 飞书 Token | 业务表 | access_token/refresh_token 双 Token 持久化 |
| `t_audit_log` | 审计日志 | 日志表 | 不可删除，GCP/21CFR11合规 |

#### 核心业务主干层（Core Business）

| 表名 | 标签 | 记录类型 | 核心字段 | 关联关系 |
|---|---|---|---|---|
| `t_protocol` | 研究方案 | 业务表 | status(draft→active→archived)、sponsor_id、parsed_data | 父：CRM客户；子：Visit、Subject、WorkOrder |
| `t_visit_plan` | 访视计划 | 业务表 | protocol FK、status | 父：Protocol |
| `t_visit_node` | 访视节点 | 业务表 | code(V1/V2)、baseline_day、window | 父：VisitPlan；子：WorkOrder |
| `t_subject` | 受试者 | 业务表 | subject_no(全局唯一)、status(8级状态机) | 子：Enrollment、SubjectConsent |
| `t_enrollment` | 入组记录 | 业务表 | subject×protocol，status | 父：Subject+Protocol；子：WorkOrder |
| `t_work_order` | 工单 | 业务表 | status(9级状态机)、assigned_to | 父：Enrollment+VisitNode；子：CRFRecord |
| `t_crf_template` | CRF模板 | 参照表 | JSON Schema定义 | 子：CRFRecord |
| `t_crf_record` | CRF记录 | 业务表 | data_source(手工/仪器)、validation_status | 父：WorkOrder+Template |

#### 知识资产层（Knowledge Assets）— 核心资产，重点保护

| 表名 | 标签 | 类型 | 向量化 | 保护级别 |
|---|---|---|---|---|
| `t_knowledge_entry` | 知识条目 | 业务表 | ✅ Qdrant 1024-dim | 写保护（KNOWLEDGE_WRITE_ENABLED） |
| `t_knowledge_entity` | 图谱节点 | 参照表 | - | 写保护 |
| `t_knowledge_relation` | 图谱关系 | 参照表 | - | 写保护 |
| `t_personal_context` | 飞书上下文 | 原始层 | 部分向量化 | 写保护 |

**KnowledgeEntry 资产类型覆盖（31 种 entry_type）**：
法规、SOP、方案模板、方法参考、经验教训、FAQ、飞书文档、竞品情报、仪器规格、成分数据、会议决策、市场洞察、论文摘要、飞书邮件、IM消息、日历事件、任务、审批、Wiki、电子表格、幻灯片、文件等

**知识图谱关系类型（34 种）**：
is_a、part_of、has_property、related_to、depends_on、produces、governed_by、measured_by、tested_by、limited_by、manages、assigned_to、reports_to、certified_for 等

#### 飞书集成原始层（PersonalContext）

**PersonalContext 来源分布（12,665+ 条）**：

| source_type | 含义 | 规模 |
|---|---|---|
| `mail` | 飞书邮件 | ~6,224 条 |
| `im` | 飞书 IM 消息 | ~3,033 条 |
| `task` | 飞书任务 | ~1,305 条 |
| `doc` | 飞书文档 | ~1,241 条 |
| `calendar` | 飞书日历 | ~862 条 |

每条记录含 `content_hash`（SHA-1，用于去重）、`batch_id`（采集批次），可支持增量采集和重复检测。

#### 集成原始层（永久不可变）

| 表名 | 来源 | 记录数 | 特性 |
|---|---|---|---|
| `t_ekb_raw_record` | 易快报 API | 34,723 条 | **永久只读，任何代码均无法写入** |
| `t_raw_lims_record` | LIMS 系统 | 不可变层 | **永久只读** |

#### 业务扩展层（Extended Business）

**财务层**（`t_quote`/`t_contract`/`t_invoice`/`t_payment`/`t_budget_*`/`t_cost_record`/`t_financial_report` 等 22 张表）

**人事层**（`t_staff`/`t_staff_archive`/`t_hr_performance_*`/`t_hr_payroll_record` 等 19 张表）

**质量层**（`t_deviation`/`t_capa`/`t_sop`/`t_change_request`/`t_audit` 等 7 张表）

**EDC 层**（`t_crf_record`/`t_sdv_record`/`t_data_query`/`t_instrument_interface` 等 7 张表）

---

## 四、数据血缘全景

### 4.1 四大核心数据流

#### 流 A：飞书采集 → 知识库（间接链路）

```
飞书 Open Platform API（邮件/IM/日历/任务/文档/审批）
        │ feishu_fetcher.fetch_*()
        ▼
PersonalContext（t_personal_context）         ← 原始采集层（SHA-1去重）
        │ knowledge/ingestion_pipeline.run_pipeline()
        ▼
KnowledgeEntry（t_knowledge_entry）            ← 结构化知识层
        │ Qwen3-embedding（1024-dim，公司内网 GPU）
        ▼
Qdrant 向量索引（embedding_id 关联）          ← 向量检索层
        │ retrieval_gateway.hybrid_search()
        ▼
Agent/AI 回答（execution_context 范围控制）   ← RAG 应用层
```

**保护关键点**：
- PersonalContext 写入前：`KnowledgeAssetGuard.guard_ingest_personal_context()` 检查开关
- KnowledgeEntry 写入前：`KnowledgeAssetGuard.guard_create_entry()` 检查开关
- 测试环境：`CELERY_PRODUCTION_TASKS_DISABLED=true` 完全阻止写入

#### 流 B：临床业务主链（核心业务价值链）

```
Protocol（研究方案定义）
        │ 1:N
        ▼
VisitPlan → VisitNode（访视节点）
        │ 1:N（each visit node × each subject）
        ▼
Enrollment（受试者入组，需审批）
        │ 1:N
        ▼
WorkOrder（工单，可执行单元）
        │ 触发
        ▼
CRFRecord（EDC 数据录入）→ SDVRecord（数据核查）→ DataQuery（数据质疑）
```

**数据质量关键点**：
- CRFValidationRule 对 CRFRecord 实时验证（必填/范围/正则）
- SDVRecord 字段级核查（源数据核查 SDV）
- DataQuery 跟踪未解决质疑（CRA↔CRC）
- t_work_order_quality_audit 自动生成工单质量评分

#### 流 C：易快报费用 → 财务系统（单向不可变导入）

```
易快报 OpenAPI
        │ EkbImportBatch（四层架构）
        ▼
EkbRawRecord（原始备份，永久不可变）          ← 不可变原始层
        │ 四层数据处理（Extract→Transform→Load→Inject）
        ▼
t_payment_record / t_cost_record             ← 财务业务层（可更新）
        │
        ▼
t_project_budget / t_financial_report        ← 分析层
```

**不可变层的意义**：
- 任何时候都可以从 EkbRawRecord 重新回溯原始数据
- 支持三级回滚（EkbInjectionLog 记录前值快照）
- 审计时提供不可篡改的原始凭据

#### 流 D：研究项目 → 知识沉淀（逆向价值流）

```
WorkOrder/研究项目执行
        │ 复盘/经验总结
        ▼
KnowledgeEntry（entry_type=lesson_learned / experience）
        │ 向量化后进入检索
        ▼
下一个研究项目通过 RAG 召回历史经验
        │
        ▼
研究人员在中书·智能台获得知识辅助建议
```

---

## 五、七大功能域

### 5.1 数据目录（Catalog）

**功能**：展示系统内 27 张核心数据表的完整注册信息。

**业务价值**：
- 任何团队成员无需查阅代码即可了解"系统里有什么数据"
- 新加入的研究人员快速了解数据结构
- 技术讨论时的统一参考文档

**数据分类**：

| 类型 | 含义 | 示例 |
|---|---|---|
| 业务表 | 业务操作产生的可变记录 | t_protocol、t_work_order |
| 参照表 | 相对稳定的参照定义 | t_role、t_crf_template |
| 日志表 | 操作历史，只追加不修改 | t_audit_log、t_session_token |
| 原始层 | 外部导入的不可变原始数据 | t_ekb_raw_record、t_personal_context |

---

### 5.2 Pipeline 健康监控（Pipelines）

**功能**：展示所有 Celery 调度任务的运行状态。

**系统所有定时任务（9个）**：

| 任务 | 类型 | 调度时间 | 重要性 |
|---|---|---|---|
| Token 健康检查（`feishu-token-health-check`）| 飞书采集 | 0/6/12/18h:15 | ⭐⭐⭐ 关键 |
| 飞书日增量采集 | 飞书采集 | 每日 | 生产保护（DISABLED） |
| 知识入库 Pipeline | 知识入库 | 手动 | 生产保护（DISABLED） |
| 每日告警通知 | 通知推送 | 07:30 | ⭐⭐ 重要 |
| 每日摘要推送 | 通知推送 | 08:00 | ⭐⭐ 重要 |
| 财务逾期检测 | 运维维护 | 08:30 | ⭐⭐ 重要 |
| 财务每日快照 | 运维维护 | 23:00 | ⭐ 常规 |
| GCP 证书到期检查 | 运维维护 | 08:00 | ⭐⭐ 重要 |
| SOP 审核期检查 | 运维维护 | 08:10 | ⭐ 常规 |

**关键设计：CELERY_PRODUCTION_TASKS_DISABLED**

测试环境设置此环境变量为 `true` 后，飞书采集、PersonalContext写入、向量化等所有涉及生产数据写入的任务均被静默跳过，防止测试数据污染生产知识库。

---

### 5.3 数据血缘图（Lineage）

**功能**：以可视化方式展示四大数据流（见第四章）及知识图谱实体样本。

**业务价值**：
- 当 RAG 召回结果质量差时，沿血缘回溯定位根因（是采集层出了问题？还是向量化失败？）
- 评估某个数据源停止工作对下游知识库的影响范围
- 合规审查中向审计机构解释"这条知识从哪里来"

**知识图谱实体类型**（20种）：
概念、实例、属性、类、仪器、方法、成分、竞品、法规实体、检测指标、论文、人员、项目、场地、客户、角色、时间点、样品

---

### 5.4 存储与备份（Storage）

**功能**：展示四个存储组件的健康状态和知识资产数量规模。

**四大存储组件**：

| 组件 | 角色 | 监控关注点 |
|---|---|---|
| PostgreSQL（主库）| 所有业务数据+知识条目+审计日志 | 存储容量、连接数 |
| Qdrant（向量库）| 知识条目 1024-dim 向量索引 | 向量数量、索引健康 |
| Redis | Celery broker + 权限缓存 | 内存使用、队列积压 |
| Nginx 静态文件 | 20个工作台前端 bundle | 磁盘使用、最后更新时间 |

**知识资产保护状态面板**（读取 `KnowledgeAssetGuard.status_report()`）：

```json
{
  "write_enabled": false,       // KNOWLEDGE_WRITE_ENABLED 环境变量
  "immutable_assets": [         // 永久只读，无法通过开关解锁
    "ekb_raw_record",
    "raw_lims_record"
  ],
  "write_protected_assets": {   // 开关控制
    "knowledge_entry": true,    // true = 写保护中（只读）
    "personal_context": true,
    "knowledge_entity": true,
    "knowledge_relation": true
  },
  "note": "V2 切换前知识资产默认只读保护..."
}
```

---

### 5.5 数据质量（Quality）

**功能**：V2 上线前的数据质量门禁检查。

**六项质量检查**：

| 检查项 | 目的 | 通过条件 |
|---|---|---|
| 知识写保护 | V2切换前必须只读 | `KNOWLEDGE_WRITE_ENABLED=false` |
| 不可变原始层 | EkbRawRecord永久只读 | 代码层守卫已激活 |
| 知识条目规模 | V2知识库不少于V1 | `KnowledgeEntry.count > 0` |
| 飞书上下文规模 | V2不丢失已采集数据 | `PersonalContext.count ≥ 12,665` |
| OpenAPI文档 | 后端API可正常工作 | `/v2/api/v1/openapi.json` 返回 200 |
| Celery Beat | 定时任务运行中 | Token健康检查每6h执行 |

**质量运维命令**：

```bash
# 生成知识资产一致性报告（对比 V1 基准）
python ops/scripts/verify_knowledge_assets.py

# 发布前健康检查（检查所有工作台静态文件 + API健康）
bash ops/scripts/pre_release_health_check.sh
```

---

### 5.6 知识库（Knowledge）

**功能**：知识条目的管理视图，展示知识库整体结构。

**知识库治理架构**：

```
TopicPackage（专题包）
        │ 1:N
        ├── KnowledgeEntry（知识条目）
        │       ├── entry_type（31种）
        │       ├── embedding_id → Qdrant
        │       ├── quality_score（0-100）
        │       ├── rag_cite_count（RAG引用频率）
        │       ├── status（draft→published→archived）
        │       └── namespace（来源命名空间）
        │
        └── KnowledgeDomainPolicy（域治理策略）
                ├── owner（域负责人）
                ├── review_cycle（复核周期）
                └── quality_threshold（发布质量门槛）
```

**专题包维度（10个 facets）**：
regulation_boundary（法规边界）、claim_boundary（功效宣称边界）、core_concepts（核心概念）、key_metrics（关键指标）、instrument_methods（仪器方法）、study_design（研究设计）、sop_risks（SOP风险点）、ingredient_safety（成分安全性）、faq_misconceptions（FAQ常见误解）、reporting_templates（报告模板）

**知识命名空间（namespace）**：
- `cnkis`：系统内部知识
- `cdisc_sdtm`/`cdisc_cdash`/`cdisc_odm`：CDISC标准
- `bridg`：BRIDG本体
- `nmpa_regulation`：国家药监局法规
- `internal_sop`：内部标准操作规程
- `project_experience`：项目经验知识

---

### 5.7 系统拓扑（Topology）

**功能**：CN KIS V2.0 七大服务节点的架构可视化。

**七大服务节点**：

```
前端层    Nginx（443/80）
          └─ 反向代理 + 20个工作台静态文件服务

后端层    Gunicorn（8001）
          ├─ Django WSGI，处理所有 API 请求
          Celery Worker
          ├─ 异步任务执行（飞书采集、向量化等）
          Celery Beat
          └─ 定时调度（9个定时任务）

数据层    PostgreSQL（5432）
          ├─ 所有业务数据
          Redis（6379）
          ├─ Celery Broker + 权限/会话缓存
          Qdrant（6333）
          └─ 向量知识库

外部服务  飞书 Open Platform
          ├─ OAuth 授权（3个独立 App）
          ├─ 邮件/IM/日历/任务 API
          字节方舟（ARK）/ Kimi
          └─ LLM 推理（LLM 通道 + 向量化 Jina v3）
```

---

## 六、数据治理机制

### 6.1 三层资产保护架构

```
永久不可变层（任何代码，任何开关，永远只读）
├── t_ekb_raw_record（34,723条易快报原始单据）
└── t_raw_lims_record（LIMS原始记录）

写保护层（KNOWLEDGE_WRITE_ENABLED=false 时只读，仅生产切换后才开放）
├── t_knowledge_entry（向量知识库）
├── t_personal_context（飞书采集上下文）
├── t_knowledge_entity（知识图谱节点）
└── t_knowledge_relation（知识图谱关系）

正常业务层（随业务操作自由写入）
└── 所有其他业务表（protocol/subject/workorder/finance等）
```

### 6.2 双环境隔离原则

| 原则 | 测试环境 | 生产环境 |
|---|---|---|
| 飞书全量采集 | ❌ 禁止（DISABLED） | ✅ 允许 |
| PersonalContext 写入 | ❌ 禁止 | ✅ 允许 |
| KnowledgeEntry 写入 | ❌ 默认禁止 | ✅ 写保护开关控制 |
| EkbRawRecord 写入 | ❌ 永久禁止 | ❌ 永久禁止 |
| Qdrant 向量写入 | ❌ 禁止 | ✅ 允许 |

### 6.3 数据一致性核验（V1→V2 迁移）

运行 `ops/scripts/verify_knowledge_assets.py` 生成报告，核验：
1. KnowledgeEntry 数量 ≥ V1 基准值
2. PersonalContext 数量 ≥ 12,665 条（V1基准）
3. content_hash 去重无重复写入
4. embedding_id 无孤立向量（Qdrant 记录与 DB 记录一致）
5. EkbRawRecord 数量 = 34,723 条（不多不少）

---

## 七、与其他工作台的协作关系

### 7.1 输入关系（洞明监控这些工作台产生的数据）

| 数据生产方 | 产生的数据 | 洞明监控维度 |
|---|---|---|
| 子衿·秘书台 | PersonalContext（飞书采集） | 采集规模、内容hash去重率、采集中断检测 |
| 采苓/维周/怀瑾 | Protocol/WorkOrder/CRF/Deviation | 核心业务数据规模和质量 |
| 管仲·财务台 | Quote/Contract/Invoice/Payment | 财务数据完整性 |
| 时雨·人事台 | Staff/Assessment/Training | 人员数据完整性 |
| 所有工作台 | t_audit_log（操作审计） | 操作行为数据（通过鹿鸣分析） |
| 易快报（外部） | EkbRawRecord（不可变原始层） | 导入数量、最后同步时间 |

### 7.2 输出关系（洞明向这些工作台提供数据治理能力）

| 数据消费方 | 洞明提供什么 | 价值 |
|---|---|---|
| 中书·智能台 | 知识库质量评分、RAG引用频率 | 优化 RAG 召回效果 |
| 子衿·秘书台 | 采集状态和知识入库状态 | 了解"哪些飞书内容已进知识库" |
| 所有工作台 | 知识库保护状态（通过API） | 确保写保护策略一致执行 |
| 技术负责人 | Pipeline 健康状态 | 及时发现数据断流 |

---

## 八、与鹿鸣·治理台的关系

洞明与鹿鸣是两个**互补的平台型工作台**：

| 维度 | 鹿鸣·治理台 | 洞明·数据台 |
|---|---|---|
| 关注对象 | **谁**在系统中，有**什么权限** | 系统里有**什么数据**，数据**从哪来** |
| 核心问题 | 谁能做什么？谁做过什么？ | 数据在哪？质量如何？流向如何？ |
| 主要用户 | IT专员、管理员 | 数据经理、技术总监 |
| 数据来源 | identity/audit 模块 | knowledge/secretary/ekuaibao 模块 |
| OAuth | 独立（cli_a937515668b99cc9）| 独立（cli_a93753da2c381cef）|
| 治理维度 | 身份安全治理 | 数据资产治理 |

**协作场景**：当鹿鸣发现某账号的飞书 Token 失效时，洞明可以显示该账号未采集的数据量缺口（PersonalContext 断点），帮助评估数据完整性损失。

---

## 九、当前功能完成度

### 9.1 已完成功能页面

| 功能页面 | 状态 | 说明 |
|---|---|---|
| DashboardPage（治理驾驶舱）| ✅ 已接入真实数据 | 跨域治理总览、缺口预警、生命周期健康、服务拓扑 |
| DomainsPage（数据域地图）| ✅ 新增，已完成 | 10 个数据域完整定义，含核心职责、治理重点、保留期要求、合规管辖 |
| LifecyclePage（数据生命周期）| ✅ 新增，已完成 | 六层生命周期流转图、各域数据量、滞留风险预警 |
| KnowledgePage（知识治理）| ✅ 已接入真实数据 | 知识条目列表、转化治理统计、质量分分布、向量化覆盖率 |
| CatalogPage（数据目录）| ✅ 完整目录+域过滤 | 27 张核心表，支持按数据域过滤，展示域归属徽章 |
| ClassificationPage（分类分级）| ✅ 已完成 | 六维度分类，GCP+PIPL 冲突分析 |
| ExternalIntakePage（候选接入池）| ✅ 已接入真实数据 | 外部数据接入治理总览，候选生成，按工作台分类 |
| RawSourcesPage（原始来源）| ✅ 已完成 | LIMS/易快报/飞书原始层统计，候选池状态 |
| PipelinesPage（同步管道）| ✅ 已完成 | Celery Beat 任务调度表，9 个任务类别 |
| StoragePage（存储容量）| ✅ 已接入真实数据 | PostgreSQL/Redis/Qdrant 三存储实时指标 |
| QualityPage（数据质量）| ✅ 已接入真实数据 | 6 项质量检查，合规摘要 |
| LineagePage（血缘图谱）| ✅ ReactFlow 图谱可视化 | 知识图谱节点/边，数据血缘流 |
| TopologyPage（服务拓扑）| ✅ 健康探针 | 实时探针：PostgreSQL/Redis/Qdrant/Celery |
| BackupPage（备份状态）| ✅ 已完成 | 扫描备份文件，超 26h 未更新预警 |

### 9.2 数据域注册表（10 个域）

| 域 ID | 标签 | 类型 | 生命周期层 | 合规 |
|---|---|---|---|---|
| `external_raw_data` | 外部源数据域 | external | raw | GCP, TAX |
| `data_intake_staging` | 接入暂存域 | staging | staging | INT |
| `subject_data` | 受试者数据域 | business | formal | GCP, PIPL |
| `project_protocol_data` | 方案与执行数据域 | business | formal | GCP |
| `execution_detection_data` | 执行与检测数据域 | business | formal | GCP |
| `finance_data` | 财务数据域 | business | formal | TAX |
| `personnel_qualification_data` | 人事与资质数据域 | business | formal | PIPL, GCP |
| `content_signal_data` | 内容与信号域 | content | content | PIPL |
| `knowledge_asset_data` | 知识资产域 | knowledge | knowledge | INT |
| `governance_meta_data` | 治理元数据域 | meta | meta | INT, GCP, PIPL |

### 9.3 权限体系

洞明使用专属权限 `data.governance.read`（只读治理）和 `data.governance.manage`（写操作）。

| 角色 | 访问级别 | 说明 |
|---|---|---|
| `data_manager` | 全访问 + 管理写操作 | 数据经理，主要使用者 |
| `tech_director` | 只读治理 | 技术总监，治理观察者 |
| `data_analyst` | 只读治理 | 数据分析师，报表查看 |
| `it_specialist` | 只读治理 | IT 专员，运维观察 |
| `admin` / `superadmin` | 全访问 | 系统管理员 |

---

## 十、未来演进路径

| 阶段 | 内容 |
|---|---|
| 切换 V2 后 | 开放 KNOWLEDGE_WRITE_ENABLED=true，启动飞书全量采集，知识条目持续增长 |
| Wave 4 | 实时数据管道状态（Celery 任务实际运行时间、成功/失败次数） |
| Wave 4 | 向量化进度跟踪（pending → indexed 的处理队列可视化） |
| Wave 5 | 知识质量自动评分（AI辅助评估 quality_score）+ 知识老化预警（next_review_at） |
| Wave 5 | 数据血缘图动态可视化（D3.js 或 ReactFlow 交互图谱） |
| 长期规划 | 数据目录与实际 DB schema 同步（Django migration 自动更新目录） |
| 长期规划 | 知识库冷热分区（rag_cite_count < 5 的条目自动归档） |
| 长期规划 | 跨系统数据质量联动（LIMS → CRF → 知识库全链路质量追踪） |
