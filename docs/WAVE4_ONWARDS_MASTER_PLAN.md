# CN KIS V2.0 — Wave 4+ 综合开发规划

> 版本：1.0 | 创建日期：2026-03-21 | 状态：正式规划
>
> 本文档整合三条主线：
> 1. **系统可用性与合规修复**（P0/P1/P2/P3 优化建议）
> 2. **V1.0 知识资产全量迁移**（12,665+ 条已采集数据 + 45 个种子脚本）
> 3. **相邻项目知识整合**（Data_Collection L2-L6 知识库、IBKD 本体、29 个 Skills）

---

## 一、资产现状速览

### 1.1 V1.0 生产库已有资产（服务器 `cn_kis_audit` 数据库）

| 资产类型 | 数量 | 向量化状态 | 迁移优先级 |
|---|---|---|---|
| `PersonalContext`（邮件/IM/日历/任务/文档） | **12,665+ 条** | 部分已向量化 | P0 保护, P1 迁移 |
| `KnowledgeEntry`（含 1024-dim Jina 向量） | 含多批次种子数据 | ✅ 已向量化 | P0 保护, P1 迁移 |
| `KnowledgeEntity` / `KnowledgeRelation` | 语义图谱节点+关系 | ✅ 已构建 | P1 迁移 |
| `EkbRawRecord` | **34,723 条**（不可变） | — | P0 只读保护 |
| `RawLimsRecord` | 不可变 | — | P0 只读保护 |

### 1.2 V1.0 知识工厂（45 个管理命令）

| 层次 | 内容 | 主要文件 |
|---|---|---|
| P0 权威基础层 | ICH 全系（E6/E8/E9/E10/E14/E17）、NMPA 法规、GB/ISO、CDISC | `ingest_pretraining_corpus.py`（948 行） |
| P1 专业方法层 | 功效评价方法论、仪器规格、成分安全、皮肤科学标准 | `ingest_expert_knowledge.py`（1,442 行） |
| P2 应用增强层 | 14 个母库、14 个 Tier-0 发布包、排程知识、招募留存 | `seed_*.py` 系列（合计 4,200+ 行） |
| 向量化 | 全量重建、增量向量化 | `vectorize_all_entries.py`, `vectorize_bulk.py` |

### 1.3 V1.0 openclaw-skills（29 个智能体技能）

已实现的 Skills 覆盖：知识混合检索、方案解析、CRF 校验、审计链、功效报告生成、仪器数据采集、招募筛选、访视排程、SOP 生命周期、秘书编排、竞品分析、市场研究、财务自动化、工单自动化等 29 项核心能力。

### 1.4 相邻项目高价值知识（待整合）

| 项目 | 关键文档 | 知识类型 |
|---|---|---|
| `Data_Collection` | L2 研究构念库、L3 测量指标库、L4 测量方法库、L5 仪器库、L6 SOP 库、关键词库 | 结构化专业知识，直接可入库 |
| `IBKD` | 研究知识本体（RESEARCH_KNOWLEDGE_ONTOLOGY）、公共知识规范 | 知识图谱本体定义 |
| V1.0 n8n workflows | PubMed 论文采集、NMPA 法规追踪、行业知识采集 | 外部知识持续更新管道 |

---

## 二、Wave 4A — P0 紧急修复（本周内完成）

### Task 4A-1：修复 digital-workforce Git 冲突 ✦

**问题**：`workstations/digital-workforce/src/layouts/AppLayout.tsx` 存在未解决的 `<<<<<<< HEAD` 冲突，中书·智能台当前**无法构建**。

**修复策略**：
- `origin/main` 版本（当前运行版）保留 7 个基础导航项
- `HEAD` 版本（本地开发版）有完整的 9 个导航组 + 类型定义，是目标架构
- **决策**：采用 HEAD 版（功能更完整），补全缺失的 import（`MessageSquare`, `Users`, `Activity`, `PlayCircle`, `Wrench`, `Brain`, `Sliders`, `List`, `BarChart3`, `Radio`, `TowerControl`, `FileCheck`, `BookOpen`, `FileText`, `Hammer`, `Wrench` 等），重写 `useVisibleNavItems()` 兼容 `NavGroup[]` 新结构

**验收标准**：
- [ ] `pnpm --filter @cn-kis/digital-workforce build` 零错误
- [ ] 开发模式下 9 个导航组全部可见

---

### Task 4A-2：受试者假名化（5 张 GCP+PI 冲突表）✦✦

**法律依据**：PIPL 第 28 条（敏感个人信息处理须单独同意）+ GCP E6 R2（研究数据须与受试者标识解耦）。**这是法律义务，不是优化建议。**

**涉及表**：`t_subject`、`t_enrollment`、`t_consent`、`t_adverse_event`、`t_pre_screening_record`

**实施方案**：
```
t_subject_pseudonym（新建）
  subject_id          → FK t_subject.id（明文端，内部系统用）
  pseudonym_code      → 研究用随机码（如 CN2026-0042），可公开
  name_encrypted      → AES-256-GCM 加密姓名（只有角色 'data_manager' 可解密）
  phone_encrypted     → AES-256-GCM 加密手机号
  id_card_hash        → SHA-256 不可逆哈希（用于去重核查）
  encryption_key_ref  → 指向密钥管理服务的 key_id（不存明文密钥）
  created_at          → 创建时间
```

**API 层规则**：
- `GET /subjects/` 默认返回 `pseudonym_code`，**不返回 `name`/`phone`/`id_card`**
- 角色 `data_manager`、`pi` 可请求 `?include_pii=true` 触发解密
- 所有 PII 解密操作写入审计日志

**迁移步骤**：
1. 新建 `SubjectPseudonym` 模型 + Django migration
2. 一次性迁移脚本：为已有 `t_subject` 生成 pseudonym_code
3. 修改受试者相关 API 序列化器（`SubjectOut`）默认隐藏 PII
4. 更新 `DataGovernanceGuard` 中 PHI_EXPORT 规则指向新模型

---

### Task 4A-3：DataGovernanceGuard 集成到业务 API 端点 ✦✦

**当前状态**：Wave 5 创建了 `DataGovernanceGuard`（`backend/apps/knowledge/guards.py` 第 180 行），但**全局搜索无任何业务 API 调用它**。

**需要集成的高风险端点**：

| 端点 | Guard 规则 | 优先级 |
|---|---|---|
| `POST /subjects/` | 新建受试者 → PHI_WRITE 检查 | P0 |
| `DELETE /subjects/{id}` | 删除受试者 → GCP_DELETE 禁止 | P0 |
| `GET /subjects/{id}/export` | 导出受试者数据 → PHI_EXPORT 角色检查 | P0 |
| `POST /ekb-records/` | 写入易快报 → IMMUTABLE_WRITE 永久拒绝 | P0 |
| `DELETE /knowledge/entries/` | 批量删除知识 → GCP_KNOWLEDGE_DELETE 检查 | P1 |
| `POST /lims/records/` | 写入 LIMS → IMMUTABLE_WRITE 永久拒绝 | P0 |

**实施方式**：创建 `@require_governance(operation, asset_type)` 装饰器，在 API 路由函数顶部一行声明：
```python
@router.delete('/subjects/{subject_id}')
@require_governance('delete', 'subject')
def delete_subject(request, subject_id: int):
    ...
```

---

## 三、Wave 4B — V1→V2 知识资产迁移（2 周内完成）

> **前提**：`KNOWLEDGE_WRITE_ENABLED=false` 期间只建立映射和验证脚本，不实际写入。迁移执行时临时开启，完成后立即恢复 `false`。

### Task 4B-1：V1 生产库资产盘点（只读）

创建管理命令 `python manage.py check_v1_assets`：
```
目标：连接 V1 生产库（cn_kis_audit@127.0.0.1）
输出：
  KnowledgeEntry: N 条（按 entry_type 分组）
  KnowledgeEntity: N 条（按 namespace 分组）
  KnowledgeRelation: N 条
  PersonalContext: N 条（按 source_type 分组）
  已向量化比例: N/N
  内容哈希唯一率: N%
```

### Task 4B-2：V1→V2 知识条目迁移

创建管理命令 `python manage.py migrate_v1_knowledge`：
- 连接 V1 数据库（通过 Django 多数据库路由或直接 psycopg2）
- 用 `content_hash` 去重（已在 V2 存在的跳过）
- 向量维度兼容：V1 使用 512-dim（旧版 embedding 模型）/ V2 使用 1024-dim（Qwen3-embedding，公司内网 GPU），**不直接复制向量，需重新向量化**
- 迁移状态设为 `status='pending_review'`（入库待确认，不自动发布）
- 迁移来源标记 `source_type='v1_migration'`，可追溯、可回滚

```
--dry-run        只统计，不写入
--batch-size=100 分批迁移
--types=regulation,sop,...  按类型选择
--from-date=2025-01-01  按时间范围
```

### Task 4B-3：外部知识库批量导入

将 `Data_Collection` L层知识库转为 `RawKnowledgeInput` 批量入库：

**L2 研究构念库** → `entry_type='method_reference'`, `namespace='cnkis'`
**L3 测量指标库** → `entry_type='method_reference'`, `namespace='cnkis'`  
**L4 测量方法库** → `entry_type='method_reference'`, `namespace='cnkis'`
**L5 仪器设备库** → `entry_type='instrument_spec'`, `namespace='cnkis'`（与 `instrument_knowledge_builder.py` 结合）
**L6 SOP 库** → `entry_type='sop'`, `namespace='internal_sop'`
**关键词库** → `entry_type='faq'`, `tags=['keyword_mapping', '消费者语言']`

所有条目入库状态：`status='pending_review'`，由**数据经理**在洞明数据台的数据目录中逐条审核确认。

### Task 4B-4：IBKD 本体导入知识图谱

将 `IBKD/docs/RESEARCH_KNOWLEDGE_ONTOLOGY.md` 解析为 `KnowledgeEntity` + `KnowledgeRelation`：
- 六大研究能力 → 6 个 `namespace='cnkis'` 的 entity 节点
- 研究对象 → 子节点
- 仪器-方法-指标 三元关系 → `KnowledgeRelation`（`is_measured_by`, `validates`, `requires`）

使用现有 `import_multidim_ontology.py` 作为模板扩展。

---

## 四、Wave 5 — 外部知识源接入 + 生命周期自动化（1 个月内）

### Task 5-1：知识源注册表（Knowledge Source Registry）

新建模型 `KnowledgeSource`（`t_knowledge_source`）：
```python
class KnowledgeSource(models.Model):
    source_id       = CharField  # 唯一标识，如 'nmpa-cosm-regs'
    name            = CharField  # 显示名称
    source_type     = CharField  # 'rss' | 'pdf' | 'api' | 'manual' | 'n8n'
    url             = CharField  # 数据源 URL
    fetch_schedule  = CharField  # Celery crontab 表达式
    entry_type      = CharField  # 对应 KnowledgeEntry.entry_type
    namespace       = CharField  # 对应知识命名空间
    last_fetched_at = DateTimeField
    last_entry_count = IntegerField
    is_active       = BooleanField
    owner_role      = CharField  # 负责维护的角色
    quality_threshold = FloatField  # AI 相关性评分阈值（低于此值不入库）
```

**预置来源（对接 V1.0 已有逻辑）**：

| source_id | 名称 | 类型 | 调度 |
|---|---|---|---|
| `nmpa-cosm-regs` | NMPA 化妆品法规公告 | RSS | 每日 08:00 |
| `ich-guidelines` | ICH 指南更新 | API | 每月 1 日 |
| `pubmed-cosm-efficacy` | PubMed 功效评价论文 | API | 每周日 |
| `cnkis-feishu-docs` | 飞书知识库文档 | feishu_api | 每日 |
| `instrument-manuals` | 仪器厂商技术文档 | PDF | 手动触发 |

**洞明数据台新增页面**：`知识来源管理（SourcesPage）` —— 可视化展示各来源的采集状态、最新条目数、质量得分分布。

### Task 5-2：知识生命周期自动化

激活 `KnowledgeEntry.next_review_at` 字段并配置 Celery Beat 任务：

```python
# 按 entry_type 设置复核周期
REVIEW_CYCLE_DAYS = {
    'regulation': 90,        # 法规 3 个月复核
    'sop': 365,              # SOP 1 年复核
    'method_reference': 180, # 方法参考 6 个月复核
    'instrument_spec': 365,  # 仪器规格 1 年复核
    'lesson_learned': 730,   # 经验教训 2 年复核
    'paper_abstract': 365,   # 论文摘要 1 年复核
}
```

**新 Celery Beat 任务**：`knowledge_expiry_patrol`（每日 09:00）：
1. 查询 `next_review_at <= now() + 7天` 的条目
2. 按 `owner` 分组，推送飞书消息给数据经理：
   ```
   📚 知识复核提醒
   您有 N 条知识条目即将到期（7天内）：
   - [法规] ICH E9(R1) 临床研究统计学原则（剩余 3 天）
   - [SOP] 受试者知情同意操作规程（剩余 6 天）
   [点击进入数据台审核]
   ```
3. 超期 30 天未复核 → 自动降级为 `status='pending_review'`，暂停检索命中

### Task 5-3：前端埋点 SDK

**问题根源**：`FeatureUsagePage` 依赖审计日志推断功能使用，精度极低。需要专用埋点。

**方案**：在 `packages/analytics-sdk` 中新建轻量埋点包：

```typescript
// 在各工作台页面组件中调用
import { track } from '@cn-kis/analytics-sdk'

// 页面访问
useEffect(() => {
  track('page_view', { page: 'catalog', workstation: 'data-platform' })
}, [])

// 功能交互
track('feature_use', { feature: 'run_dedup', result: 'success', duration_ms: 1200 })
```

后端新建 `t_feature_event`（`FrontendEvent`）模型，接收 `POST /v2/api/v1/analytics/track`。

`FeatureUsagePage` 改为读取 `t_feature_event` 真实数据，不再依赖审计日志推断。

---

## 五、Wave 6 — 智能体赋能（Skills 注册 + 知识域边界）（2 个月内）

### Task 6-1：29 个 openclaw-skills 注册到 t_agent_definition

从 V1.0 `openclaw-skills/` 中读取所有 `SKILL.md`，批量写入 V2 的 `t_agent_definition`：

| 字段 | 来源 |
|---|---|
| `agent_id` | 目录名（如 `knowledge-hybrid-search`） |
| `name` | SKILL.md `#` 标题 |
| `description` | SKILL.md `## Purpose` |
| `trigger_conditions` | SKILL.md `## Trigger` |
| `model_preference` | SKILL.md `## Model to Use` |
| `input_schema` | SKILL.md `## Input` JSON 解析 |
| `execution_steps` | SKILL.md `## Execution Steps` |
| `skill_source` | `'v1_migration'` |
| `status` | `'active'` |

**管理命令**：`python manage.py import_v1_skills --skills-dir=/path/to/v1/openclaw-skills`

### Task 6-2：Agent 知识域边界定义

新建 `AgentKnowledgeDomain` 模型（`t_agent_knowledge_domain`）：
```python
class AgentKnowledgeDomain(models.Model):
    agent_id            = CharField  # FK t_agent_definition
    allowed_entry_types = JSONField  # 允许的 entry_type 列表
    allowed_namespaces  = JSONField  # 允许的 namespace 列表
    forbidden_data_scopes = JSONField # 明确禁止的数据范围
    # 示例：财务 Agent 禁止访问 t_subject/t_personal_context
```

**预置域边界规则**：

| Agent | 允许访问 | 明确禁止 |
|---|---|---|
| 知识检索 Agent | 全部 `KnowledgeEntry` | `PersonalContext`（个人数据） |
| 财务 Agent | `finance.*`, `regulation` | `t_subject`, `t_personal_context` |
| 研究 Agent | `regulation`, `sop`, `method_reference`, `paper_abstract` | `t_finance.*` |
| 秘书 Agent | `PersonalContext`（仅本人）, `KnowledgeEntry` | 跨账号 `PersonalContext` |
| 招募 Agent | `t_subject`（仅 pseudonym_code，无 PII） | `KnowledgeEntry.entry_type='financial'` |

**检索网关强制执行**：在 `retrieval_gateway.py` 的 `RetrievalGateway.search()` 入口处，按 `execution_context.agent_id` 查询 `AgentKnowledgeDomain`，追加查询过滤条件。

### Task 6-3：n8n Workflows 对接 V2 API

将 V1.0 的 4 个 n8n workflows 更新为调用 V2 端点：

| Workflow | V1 端点 | V2 端点 |
|---|---|---|
| NMPA 法规追踪 | `/api/knowledge/` | `/v2/api/v1/knowledge/entries/` |
| PubMed 采集 | `/api/knowledge/` | `/v2/api/v1/knowledge/entries/` |
| 行业知识采集 | `/api/knowledge/` | `/v2/api/v1/knowledge/entries/` |
| Web 知识搜索 | `/api/knowledge/search/` | `/v2/api/v1/knowledge/search/` |

在洞明数据台 `PipelinesPage` 中展示各 workflow 的运行状态（通过 n8n REST API）。

---

## 六、Wave 7 — 可视化升级 + 主数据管理（3-4 个月内）

### Task 7-1：知识图谱可视化（真实数据）

`LineagePage` 和 `TopologyPage` 目前是架构示意图，需改为：

**技术选型**：ReactFlow（适合 DAG 图谱）+ `@cn-kis/data-platform` 新增 API：
- `GET /data-platform/knowledge-graph/nodes?namespace=cnkis&limit=200`
- `GET /data-platform/knowledge-graph/edges?entity_id={id}&depth=2`

**展示策略**：
- 默认按 namespace 分组，展示 entity 节点
- 点击节点展开 2 跳邻居
- 边标注关系类型（`is_measured_by` / `validates` / `requires`）
- 节点颜色按 `OntologyNamespace` 区分（CDISC/BRIDG/NMPA 等）

### Task 7-2：数据目录与 DB Schema 同步机制

**问题**：`CatalogPage.tsx` 的 27 张表字段信息是硬编码，与实际 DB 可能不一致。

**解决方案**：
```python
# 新建管理命令：python manage.py sync_catalog_schema
# 读取 Django migration 元数据 → 生成 catalog_schema.json → 提交仓库
# 前端从 API 读取（或 build 时 import）
```

**API 端点**：`GET /data-platform/catalog/schema` → 返回各表的字段、类型、注释、六维分类标签

### Task 7-3：主数据管理（MDM）基础

**受试者全局编号注册服务**（防重复入组）：
```python
class SubjectGlobalRegistry(models.Model):
    id_card_hash    = CharField(unique=True)  # 不可逆哈希
    global_no       = CharField(unique=True)  # 全局编号 CN-SUB-2026-XXXXX
    first_enrolled  = DateField
    enrolled_protocols = JSONField           # 已参与方案列表
    disqualified    = BooleanField           # 永久排除标记
    disqualify_reason = CharField
```

**研究方案版本控制**（`t_protocol_version`）：
- 同一方案的多版本追踪（主版本.次版本.修订版）
- 版本变更触发：重新知情同意（如修订影响受试者权益）
- 版本血缘图：在洞明数据台可视化

---

## 七、Wave 8+ — 战略规划（6-12 个月）

### Task 8-1：PIPL 数据主体权利响应机制

**受试者权利**（PIPL 第四章）：
- **查阅权**：受试者申请查看自己所有数据 → 跨表聚合（`t_subject` + `t_enrollment` + `t_crf_record` + `PersonalContext`）→ 生成隐私报告 PDF
- **更正权**：受试者申请更正错误 → 触发数据纠错工作流 + 审计留痕
- **撤回同意**：触发**假名化激活**（而非删除，以满足 GCP 数据完整性要求）—— 姓名/手机号/身份证从明文表迁移到加密表，仅保留 `pseudonym_code`

**响应时限**：PIPL 要求 15 个工作日内响应，系统须有**到期提醒**机制。

### Task 8-2：数据质量主动治理（规则引擎）

从"快照检查"升级为"持续巡检规则引擎"：

```python
class DataQualityRule(models.Model):
    rule_id         = CharField  # 如 'subject_phone_format'
    target_table    = CharField  # 't_subject'
    rule_expression = TextField  # SQL / Python 表达式
    severity        = CharField  # 'critical' | 'warning' | 'info'
    owner_role      = CharField  # 负责修复的角色
    auto_fix        = BooleanField  # 是否自动修复
    fix_function    = CharField  # 自动修复函数名

class DataQualityAlert(models.Model):
    rule = ForeignKey(DataQualityRule)
    violating_record_ids = JSONField
    detected_at = DateTimeField
    resolved_at = DateTimeField
    resolution_note = TextField
```

**Celery Beat 任务**：`data_quality_patrol`（每 6 小时）→ 扫描全部规则 → 生成告警 → 推送飞书通知给数据经理。

参考设计：Great Expectations 规则体系 + dbt Tests 声明式语法。

### Task 8-3：计算机系统验证（CSV）文档体系

**法规依据**：GCP 要求电子数据系统须有 IQ/OQ/PQ 验证文档（FDA 21 CFR Part 11 / EU Annex 11）。

**文档体系**：
```
docs/csv/
  URS.md          # 用户需求规格
  FRS.md          # 功能需求规格
  IQ.md           # 安装确认
  OQ.md           # 运行确认
  PQ.md           # 性能确认（可接受标准）
  CHANGE_CONTROL.md  # 变更控制程序
  VALIDATION_SUMMARY.md  # 验证总结报告
```

每次系统变更（部署新版本）须更新 `OQ.md` 中的"已验证版本"并执行回归测试清单（`TEST_ACCEPTANCE_FRAMEWORK.md`）。

---

## 八、执行路线图

```
2026年3月（本周）
 ├── [4A-1] digital-workforce Git冲突修复           ✦ 1天
 ├── [4A-3] DataGovernanceGuard集成 @require_governance  ✦✦ 2天
 └── [4B-1] V1资产盘点命令（只读，先摸底）          ✦ 0.5天

2026年4月（Wave 4B + 5前半）
 ├── [4A-2] 受试者假名化模型+迁移脚本               ✦✦ 3天
 ├── [4B-2] V1→V2知识条目迁移命令（dry-run先跑）    ✦✦ 2天
 ├── [4B-3] Data_Collection L层知识库批量导入        ✦ 2天
 ├── [4B-4] IBKD本体导入知识图谱                    ✦ 1天
 ├── [5-1]  知识源注册表模型+洞明SourcesPage         ✦ 3天
 └── [6-1]  29个openclaw-skills注册脚本              ✦ 1天

2026年5月（Wave 5后半 + Wave 6）
 ├── [5-2]  知识生命周期自动化 + 飞书复核提醒        ✦ 2天
 ├── [5-3]  前端埋点SDK + FeatureUsagePage真实数据   ✦✦ 3天
 ├── [6-2]  Agent知识域边界定义+检索网关强制过滤     ✦✦ 2天
 └── [6-3]  n8n Workflows对接V2 API                  ✦ 1天

2026年6-7月（Wave 7）
 ├── [7-1]  知识图谱可视化（ReactFlow）              ✦ 5天
 ├── [7-2]  数据目录 DB Schema同步机制               ✦ 2天
 └── [7-3]  主数据管理MDM基础（受试者+方案版本）     ✦✦ 3天

2026年9月+（Wave 8）
 ├── [8-1]  PIPL数据主体权利响应机制                ✦✦ 5天
 ├── [8-2]  数据质量规则引擎                        ✦ 5天
 └── [8-3]  CSV计算机系统验证文档体系               ✦✦ 10天
```

---

## 九、关键决策点与风险

| 决策点 | 风险 | 缓解措施 |
|---|---|---|
| V1→V2 数据迁移时机 | 生产切换期间数据双写 | Wave 4B 先完成只读迁移，Wave 5 之后再开启写入 |
| 向量重建成本 | V1 12k+ 条全量重向量化约消耗 1-2h + Jina API 费用 | 分批（`--batch-size=100`），利用 `content_hash` 跳过已向量化 |
| 假名化迁移对业务的影响 | 历史数据字段变更影响所有依赖 `name`/`phone` 的下游代码 | 先建新表，旧字段保留但标记 `deprecated`，给 6 个月过渡期 |
| DataGovernanceGuard 误拦截 | 正常业务流程被 Guard 意外阻断 | 先 `mode='warn'` 只记录不拦截，确认无误后切换 `mode='enforce'` |
| IBKD 知识本体入库质量 | 手工维护的 Markdown 文档可能有不一致 | 先 `pending_review` 状态，由专业负责人逐条确认后 publish |

---

## 十、最关键的三个转变

1. **展示型 → 真正生产可用**：假名化 + DataGovernanceGuard 集成 → 系统可以合规地接待外部稽查
2. **封闭知识库 → 持续生长的知识系统**：知识源注册表 + 生命周期自动化 + V1 资产迁移 → 知识不再是一次性导入，而是持续更新
3. **"什么都知道"的智能体 → 知识域边界明确的专业智能体**：Agent 知识域边界 + Skills 注册 → 数字员工有专业化能力图谱，可评估、可审计

---

> **配套文档**：本规划实施过程中应同步更新 `V1_V2_PARITY_MATRIX.md`（打钩对应能力差距项）和 `CUTOVER_CHECKLIST.md`（添加新验收条件）。
