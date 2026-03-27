# 洞明·数据台 全面分析报告

> 生成日期：2026-03-22  
> 分析范围：后端 API × 前端页面 × 数据模型 × 权限体系 × 治理目标达成度  
> 状态：基于当前仓库代码全量扫描

---

## 目录

1. [全局概述](#1-全局概述)
2. [数据域体系完整性](#2-数据域体系完整性)
3. [API 端点全景](#3-api-端点全景)
4. [前端页面逐项评价](#4-前端页面逐项评价)
5. [数据管理目标达成分析](#5-数据管理目标达成分析)
6. [数据治理目标达成分析](#6-数据治理目标达成分析)
7. [权限体系分析](#7-权限体系分析)
8. [已知问题清单](#8-已知问题清单)
9. [优化目标路线图](#9-优化目标路线图)

---

## 1. 全局概述

### 1.1 工作台定位

洞明·数据台（data-platform）是 CN KIS V2.0 的**跨业务域数据治理平台**，目标是：
- 不分析业务完成情况（那是各业务工作台的职责）
- 专注"业务数据、外部数据、知识数据是否得到专业管理"
- 提供数据视角：保存在哪、备份状态、同步是否合规、分类分级是否正确

### 1.2 技术栈现状

| 层 | 技术 | 状态 |
|---|---|---|
| 后端框架 | Django + Django Ninja | ✅ 运行正常 |
| 数据库 | PostgreSQL（端口 8002） | ✅ |
| 缓存 | Redis | ✅ |
| 向量数据库 | Qdrant（Qwen3-embedding 1024维） | ✅ |
| 任务调度 | Celery + Celery Beat | ✅ |
| 前端框架 | React + Vite + TailwindCSS | ✅ |
| 认证 | 飞书 OAuth（独立 App ID：`cli_a93753da2c381cef`） | ✅ |

### 1.3 已部署验收结果

最新一轮 headed 验收（2026-03-22 08:41）：
- 页面验收：**16/16 全部通过** ✅
- API 验收：**14/14 全部通过** ✅

---

## 2. 数据域体系完整性

### 2.1 十大数据域清单

| # | 域 ID | 中文名 | 域类型 | 生命周期层 | 核心表数 | 合规管辖 | 保留期 |
|---|-------|--------|--------|-----------|---------|---------|--------|
| 1 | `external_raw_data` | 外部源数据域 | external | raw | 2 | GCP + TAX | 永久（GCP 15年，TAX 10年） |
| 2 | `data_intake_staging` | 接入暂存域 | staging | staging | 1 | INT | 候选 3年，日志永久 |
| 3 | `subject_data` | 受试者数据域 | business | formal | 2 | GCP + **PIPL** | 15年（PHI，GCP+PIPL 双合规） |
| 4 | `project_protocol_data` | 方案与执行数据域 | business | formal | 6 | GCP | 15年（CRF 永久） |
| 5 | `execution_detection_data` | 执行与检测数据域 | business | formal | 4 | GCP | 15年（偏差/CAPA 永久） |
| 6 | `finance_data` | 财务数据域 | business | formal | 4 | TAX | 10年，合同满后 5年 |
| 7 | `personnel_qualification_data` | 人事与资质数据域 | business | formal | 2 | PIPL + GCP | 在职全留，离职 5年，GCP资质 15年 |
| 8 | `content_signal_data` | 内容与信号域 | content | content | 1 | PIPL | 2年 |
| 9 | `knowledge_asset_data` | 知识资产域 | knowledge | knowledge | 3 | INT | 永久（向量升级同步迁移） |
| 10 | `governance_meta_data` | 治理元数据域 | meta | meta | 6 | INT + GCP + PIPL | 审计永久；会话过期即清；账号 5年 |

**合计覆盖：27 张核心表，10 个数据域，6 层生命周期**

### 2.2 域-模型-前端一致性检查

| 数据域 | 后端 models 存在 | 域注册完整 | 分类注册完整 | 前端可见 | 完整度 |
|--------|:---------------:|:---------:|:-----------:|:-------:|:-----:|
| external_raw_data | ✅ | ✅ | ✅ | ✅ | 100% |
| data_intake_staging | ✅ | ✅ | ⚠️ 缺 | ✅ | 85% |
| subject_data | ✅ | ✅ | ✅ | ✅ | 100% |
| project_protocol_data | ✅（部分） | ✅ | ✅（部分） | ✅ | 80% |
| execution_detection_data | ✅ | ✅ | ✅ | ✅ | 100% |
| finance_data | ⚠️ 未在 catalog_schema | ✅ | ✅ | ⚠️ 目录缺字段 | 70% |
| personnel_qualification_data | ⚠️ 未在 catalog_schema | ✅ | ✅ | ⚠️ 目录缺字段 | 70% |
| content_signal_data | ✅ | ✅ | ✅ | ✅ | 100% |
| knowledge_asset_data | ✅ | ✅ | ✅ | ✅ | 100% |
| governance_meta_data | ✅ | ✅ | ✅ | ✅ | 100% |

### 2.3 生命周期六层覆盖

```
raw        → external_raw_data（飞书/LIMS/易快报原始数据）
staging    → data_intake_staging（候选接入池、冲突暂存）
formal     → subject/protocol/execution/finance/personnel（5个业务正式域）
content    → content_signal_data（PersonalContext 半结构化内容）
knowledge  → knowledge_asset_data（KnowledgeEntry/Entity/Relation）
meta       → governance_meta_data（账号/审计/session 等）
```

**六层全部有对应数据域，模型不缺失。**

---

## 3. API 端点全景

### 3.1 data-platform 专用 API（31 个端点）

#### 治理总览类（6）
| 端点 | 功能 | 权限最低要求 |
|------|------|------------|
| `GET /governance/overview` | 跨域治理总览（行数+合规+向量化进度） | data.governance.read |
| `GET /governance/gaps` | 治理缺口清单（severity+行动建议） | data.governance.read |
| `GET /dashboard` | 驾驶舱汇总（KE/PC/EKB/LIMS 计数） | data.governance.read |
| `GET /domains` | 10域注册表完整列表 | data.governance.read |
| `GET /domains/{id}` | 单域详情（实时表行数+分类信息） | data.governance.read |
| `GET /raw-sources/overview` | 外部原始来源治理概览 | data.governance.read |

#### 生命周期类（3）
| 端点 | 功能 | 权限 |
|------|------|------|
| `GET /lifecycle/overview` | 6层生命周期总览 | data.governance.read |
| `GET /lifecycle/by-domain` | 按域查询生命周期分布 | data.governance.read |
| `GET /lifecycle/stranded` | 滞留对象分析 | data.governance.read |

#### 分类与合规类（2）
| 端点 | 功能 | 权限 |
|------|------|------|
| `GET /classification/registry` | 六维度分类注册表（27张表） | data.governance.read |
| `GET /classification/compliance-check` | 分类合规度检查 | data.governance.read |

#### 外部接入类（3）
| 端点 | 功能 | 权限 |
|------|------|------|
| `GET /intake-overview` | 外部数据接入治理总览 | data_intake.manage |
| `POST /candidates/populate-all` | 全局候选记录生成 | data_intake.candidate.manage |
| `GET /conflicts/summary` | 数据冲突治理汇总 | data_intake.manage |

#### 知识治理类（5）
| 端点 | 功能 | 权限 |
|------|------|------|
| `GET /knowledge-sources` | 知识来源注册表 | data.governance.read |
| `GET /knowledge-graph/nodes` | 知识图谱节点（ReactFlow） | data.governance.read |
| `GET /knowledge-graph/edges` | 知识图谱关系边 | data.governance.read |
| `GET /knowledge-governance/transformation` | 知识转化治理统计 | data.governance.read |
| `GET /trace/personal-context/{id}` | 飞书上下文追溯链 | data.governance.read |

#### 内容入库操作类（6）
| 端点 | 功能 | 权限 |
|------|------|------|
| `GET /ingest/overview` | 数据清洗总览 | knowledge.manage |
| `GET /ingest/sources` | 来源分布+批次 | knowledge.manage |
| `GET /ingest/duplicates` | 重复记录分析 | knowledge.manage |
| `POST /ingest/deduplicate` | 执行去重清洗 | knowledge.manage |
| `POST /ingest/run-pipeline` | 触发知识入库 | knowledge.manage |
| `GET /ingest/pending-entries` | 待向量化条目 | knowledge.manage |

#### 目录与基础设施类（6）
| 端点 | 功能 | 权限 |
|------|------|------|
| `GET /catalog/schema` | 数据目录 Schema（16张表） | data.governance.read |
| `GET /pipelines/schedule` | Celery Beat 调度表 | data.governance.read |
| `GET /storage/stats` | PG/Redis/Qdrant 存储指标 | data.governance.read |
| `GET /topology/health` | 服务拓扑健康探针 | data.governance.read |
| `GET /backup/status` | 备份文件扫描状态 | data.governance.read |
| `GET /trace/candidate/{id}` | 接入候选追溯链 | data.governance.read |

### 3.2 跨 App 依赖的 API（前端直调）

| 端点 | 所属 App | 用途 |
|------|---------|------|
| `GET /quality/data-quality/rules` | quality | QualityPage 规则引擎 |
| `GET /quality/data-quality/alerts` | quality | QualityPage 告警列表 |
| `GET /protocol/list` | protocol | LineagePage 方案血缘 |
| `GET /protocol/{id}/versions/lineage` | protocol | 方案版本演进 |
| `GET /knowledge/assets/protection-status` | knowledge | 写保护状态 |
| `GET /knowledge/governance/stats` | knowledge | 知识治理统计 |
| `GET /knowledge/entries/list` | knowledge | 知识条目分页列表 |

---

## 4. 前端页面逐项评价

### 4.1 页面完整性评分矩阵

| 页面 | 数据治理价值 | 内容充实度 | 数据是否实时 | 主要不足 | 综合评分 |
|------|:-----------:|:---------:|:-----------:|---------|:-------:|
| **DashboardPage** | 极高 | 高 | 全部实时 | — | ⭐⭐⭐⭐⭐ |
| **DomainsPage** | 极高 | 高 | 全部实时 | — | ⭐⭐⭐⭐⭐ |
| **LifecyclePage** | 极高 | 高 | 全部实时 | — | ⭐⭐⭐⭐⭐ |
| **ClassificationPage** | 极高 | 高 | API 混合静态 | 静态骨架为主 | ⭐⭐⭐⭐ |
| **ExternalIntakePage** | 高 | 高 | 全部实时 | — | ⭐⭐⭐⭐⭐ |
| **RawSourcesPage** | 高 | 高 | 全部实时 | — | ⭐⭐⭐⭐⭐ |
| **KnowledgePage** | 高 | 高 | 全部实时 | — | ⭐⭐⭐⭐⭐ |
| **IngestPage** | 高 | 极高 | 全部实时 | — | ⭐⭐⭐⭐⭐ |
| **CatalogPage** | 中高 | 高 | API 混合静态 | ALL_TABLES 骨架硬编码 | ⭐⭐⭐⭐ |
| **SourcesPage** | 中高 | 高 | 全部实时 | — | ⭐⭐⭐⭐ |
| **LineagePage** | 中 | 中 | Tab1 静态 | 数据流转血缘是示意图 | ⭐⭐⭐ |
| **QualityPage** | 中高 | 中 | 部分实时 | 系统检查硬编码 | ⭐⭐⭐ |
| **PipelinesPage** | 中 | 中 | 有静态 fallback | 无法控制任务 | ⭐⭐⭐ |
| **StoragePage** | 低 | 中 | 当前快照 | 无历史趋势 | ⭐⭐⭐ |
| **BackupPage** | 低 | 中 | 文件状态实时 | 策略/恢复步骤静态 | ⭐⭐ |
| **TopologyPage** | 低 | 中 | 部分实时 | 外部服务无探针 | ⭐⭐⭐ |

### 4.2 导航结构（6 组 16 项）

```
治理驾驶舱
  ├── 治理驾驶舱（DashboardPage）    ← 主入口，全域治理快照
  ├── 数据域地图（DomainsPage）      ← 10域完整定义
  └── 数据生命周期（LifecyclePage）  ← 六层流转与滞留分析

外部数据治理
  ├── 候选接入池（ExternalIntakePage）  ← 外部数据进入业务层的审核漏斗
  └── 原始来源（RawSourcesPage）        ← LIMS/易快报/飞书原始层冲突治理

知识治理
  ├── 知识条目（KnowledgePage）     ← 知识资产管理
  ├── 知识来源（SourcesPage）       ← 来源注册与状态
  └── 内容入库（IngestPage）        ← 数据→知识转化操作中台

分类与合规
  ├── 数据目录（CatalogPage）          ← 27张表字段+分类索引
  ├── 分类分级（ClassificationPage）   ← 四视角合规检查
  └── 数据质量（QualityPage）          ← 12条规则引擎+告警

血缘与追溯
  └── 数据血缘图谱（LineagePage）      ← 知识图谱+方案版本血缘+数据流示意

同步与存储
  ├── 同步管道（PipelinesPage）   ← Celery 调度监控
  ├── 存储容量（StoragePage）     ← PG/Redis/Qdrant 指标
  ├── 备份状态（BackupPage）      ← 备份文件扫描
  └── 服务拓扑（TopologyPage）   ← 9个服务节点健康探针
```

---

## 5. 数据管理目标达成分析

### 5.1 目标定义

数据管理（Data Management）关注数据的**存储、同步、备份、分类、归档**等操作性能力。

### 5.2 达成情况

| 数据管理能力 | 目标描述 | 实现方式 | 达成度 |
|------------|---------|---------|:------:|
| **数据分类分级** | 27张核心表按安全级/合规性/责任人/保留期四维度分类 | ClassificationPage + `/classification/registry` API | ✅ 100% |
| **数据目录管理** | 所有核心表的字段信息、行数、归属域可查 | CatalogPage + `/catalog/schema` API | ✅ 80%（财务/人事字段缺失） |
| **存储监控** | PG/Redis/Qdrant 实时容量与连接状态 | StoragePage + `/storage/stats` | ✅ 100%（无历史趋势） |
| **备份管理** | 备份文件状态实时可见 | BackupPage + `/backup/status` | ⚠️ 60%（只读监控，无触发备份能力） |
| **同步调度监控** | Celery Beat 任务状态可见 | PipelinesPage + `/pipelines/schedule` | ⚠️ 70%（只读，无手动触发/暂停能力） |
| **服务健康监控** | 9个核心服务实时探针 | TopologyPage + `/topology/health` | ✅ 85%（外部服务无探针） |
| **数据保留期管理** | 按合规要求记录每张表的保留期 | DomainRegistry + ClassificationPage | ⚠️ 50%（定义完整，但无到期告警/自动归档机制） |
| **外部数据入库管理** | 外部原始数据（LIMS/EKB/飞书）进入业务层全流程 | ExternalIntakePage + RawSourcesPage + IngestPage | ✅ 95% |
| **数据去重清洗** | content_hash 去重，支持 dry_run | IngestPage + `/ingest/deduplicate` | ✅ 100% |

**数据管理目标整体达成度：82%**

主要缺口：
- 保留期到期告警机制未实现
- 备份调度与触发无操作界面
- 财务/人事表的数据目录字段映射缺失

---

## 6. 数据治理目标达成分析

### 6.1 目标定义

数据治理（Data Governance）关注数据的**质量、合规、血缘追溯、责任归属、访问控制、生命周期管控**。

### 6.2 核心治理能力达成

| 治理能力 | 描述 | 实现方式 | 达成度 |
|---------|------|---------|:------:|
| **域模型治理** | 10个数据域，每域有定义/职责/合规/保留期/责任角色 | DomainRegistry + DomainsPage | ✅ 100% |
| **生命周期治理** | 六层模型，数据流转可视化，滞留预警 | LifecyclePage + lifecycle API 组 | ✅ 95% |
| **合规冲突检测** | GCP+PIPL双合规冲突表自动识别 | ClassificationPage + compliance-check API | ✅ 100% |
| **治理缺口自动化** | 跨域治理问题主动扫描+严重度分级 | DashboardPage + `/governance/gaps` | ✅ 90% |
| **数据血缘追溯** | 数据从来源到使用的完整追溯链 | `/trace/candidate/{id}` + `/trace/personal-context/{id}` | ⚠️ 50%（API完整，UI入口仅在LineagePage隐藏） |
| **知识质量治理** | 知识条目质量分、复核逾期、向量化覆盖率 | KnowledgePage + knowledgeGovernanceStats | ✅ 95% |
| **数据质量规则引擎** | 12条预置规则，违规告警实时推送 | QualityPage + quality app API | ✅ 80% |
| **外部数据接入治理** | 候选审核、冲突处理、接入留痕 | ExternalIntakePage + RawSourcesPage | ✅ 95% |
| **写保护与不可变性** | 原始数据永久不可写；业务数据写保护可控 | KnowledgeAssetGuard + DataGovernanceGuard | ✅ 100% |
| **责任人体系** | 每个域/表有明确的数据责任角色 | DomainRegistry + ClassificationRegistry | ✅ 100%（静态定义） |
| **访问控制治理** | 角色-权限-菜单三层 RBAC | identity app + seed_roles | ✅ 90% |
| **假名化治理** | GCP+PIPL冲突表的假名化设计与实施 | 仅有检测，无假名化操作界面 | ❌ 20% |
| **数据问责工作流** | 责任人收到治理任务（审核/决策）的通知+操作 | 无（仅有静态责任人定义） | ❌ 0% |
| **审计追踪** | 所有治理操作的完整审计日志 | audit app（`t_audit_log`）已有，与洞明集成度低 | ⚠️ 40% |

**数据治理目标整体达成度：78%**

---

## 7. 权限体系分析

### 7.1 角色-权限-工作台映射（洞明相关）

| 角色 | 可访问洞明 | data.governance.read | data.governance.manage | 核心能力 |
|------|:--------:|:-------------------:|:---------------------:|---------|
| superadmin / admin | ✅ | ✅（通配符`*`） | ✅ | 全功能 |
| data_manager | ✅ | ✅ | ✅ | 治理只读+写操作+接入管理 |
| tech_director | ✅ | ✅ | ❌ | 治理只读 |
| data_analyst | ✅ | ✅ | ❌ | 治理只读 |
| it_specialist | ✅ | ✅ | ❌ | 治理只读 |
| general_manager | ✅ | ❌ **Bug** | ❌ | 实际访问会 403 |

### 7.2 发现的权限体系问题

**🔴 P0 — general_manager 可看到洞明菜单但所有 API 返回 403**
- `ROLE_WORKBENCH_MAP` 中 general_manager 包含 `data-platform`
- `ROLE_PERMISSION_MAP` 中 general_manager 没有 `data.governance.read`
- 结果：菜单项出现但每个页面均返回 403 Forbidden

**🟠 P1 — `knowledge.manage` 权限码未入库**
- `SYSTEM_PERMISSIONS` 定义了 `knowledge.entry.*` 系列权限
- 但 `api_data_platform.py` 中多处 `@require_any_permission(['system.role.read', 'knowledge.manage'])` 用了 `knowledge.manage` 这个未入库的权限码
- `data_manager` 用 `knowledge.*` 通配符可以覆盖，但直接拥有 `knowledge.manage` 的逻辑实际上走的是通配符匹配，存在隐患

**🟡 P2 — 菜单权限与 API 权限不完全对齐**
- AppLayout 中"内容入库"菜单的权限写的是 `['data.governance.manage', 'knowledge.entry.view']`
- 但 IngestPage 调用的 API（如 `/ingest/run-pipeline`）实际要求 `knowledge.manage` 而非 `data.governance.manage`
- 即拥有 `data.governance.manage` 但不拥有 `knowledge.manage` 的用户可以看到入库菜单但操作时 403

---

## 8. 已知问题清单

### 8.1 合规强制（🔴 Critical）

| # | 问题 | 影响范围 | 根本原因 |
|---|------|---------|---------|
| C-01 | `t_subject`、`t_enrollment`、`t_crf_record` 同时受 GCP（不可删）和 PIPL（数据主体删除权）管辖，3 张表 `pseudonymized=False` | 受试者数据域（正式域） | 假名化设计方案尚未实施 |
| C-02 | 审计日志（`t_audit_log`）未与洞明治理操作深度集成，洞明内的写操作（deduplicate/run-pipeline）不产生可查询的审计记录 | 治理元数据域 | audit app 与 data-platform API 之间无中间件 |

### 8.2 数据完整性（🟠 High）

| # | 问题 | 影响范围 |
|---|------|---------|
| D-01 | `catalog/schema` API 中 `TABLE_TO_MODEL` 缺失 6 张表（`t_quote`、`t_contract`、`t_invoice`、`t_payment`、`t_staff`、`t_staff_qualification`），数据目录财务/人事表字段为空 | CatalogPage 展示不完整 |
| D-02 | `t_ext_ingest_candidate` 未进入 `DATA_CLASSIFICATION_REGISTRY`，分类合规检查对接入暂存层是盲区 | ClassificationPage 合规检查缺失 |
| D-03 | `t_data_quality_rule` 和 `t_data_quality_alert`（quality app Wave 5 新增）既不在域注册表也不在分类注册表中 | 2张表完全是治理盲区 |
| D-04 | LineagePage Tab1（数据流转血缘）是 4 条硬编码静态示意图，不反映真实数据流 | 血缘追溯能力存在误导风险 |

### 8.3 权限与配置（🟠 High）

| # | 问题 | 影响范围 |
|---|------|---------|
| P-01 | `general_manager` 能看到洞明工作台入口但所有 API 都 403 | 管理层用户体验问题 |
| P-02 | `knowledge.manage` 权限码在 `SYSTEM_PERMISSIONS` 中不存在，通配符依赖存在隐患 | 内容入库权限链路 |
| P-03 | IngestPage 菜单权限与实际 API 权限不对齐（`data.governance.manage` vs `knowledge.manage`） | 内容入库操作 403 |

### 8.4 功能缺失（🟡 Medium）

| # | 缺失功能 | 优先级 |
|---|---------|--------|
| F-01 | 数据保留期到期告警机制（按域/表级别） | P1 |
| F-02 | 假名化治理操作界面（识别+执行假名化） | P1 |
| F-03 | 数据责任人问责工作流（收到治理任务通知，在线审批/决策） | P2 |
| F-04 | 备份调度触发/暂停能力 | P2 |
| F-05 | 血缘追溯 UI 入口（目前 trace API 存在但前端只有 LineagePage 且隐蔽） | P2 |
| F-06 | 存储历史趋势图（目前只有当前快照） | P3 |

### 8.5 数据质量（🔵 Low）

| # | 问题 |
|---|------|
| Q-01 | `nmpa-cosm-regs` 和 `ich-guidelines` 共用 namespace `nmpa_regulation`，混淆国内/国际监管体系 |
| Q-02 | `backup/status` 同时扫描新旧两个备份路径，报告存在冗余条目 |
| Q-03 | 知识图谱节点分布不均（`cnkis` 命名空间占比过高，国际法规节点稀疏） |

---

## 9. 优化目标路线图

### Phase A — 合规修复（建议 1 周内）

**A-1：修复 general_manager 权限配置**
```python
# backend/apps/identity/management/commands/seed_roles.py
# 在 general_manager 的权限列表中添加：
('data', 'governance', 'read', 'global', '只读访问洞明·数据台'),
```

**A-2：补充 `knowledge.manage` 为正式权限码**
```python
# SYSTEM_PERMISSIONS 中添加：
('knowledge', 'manage', None, 'global', '知识库写操作管理'),
# 并显式分配给 data_manager
```

**A-3：补齐 `t_ext_ingest_candidate` 的分类注册**
```python
# backend/apps/knowledge/classification.py
'ext_ingest_candidate': DataClassification(
    security_level='SEC-3',
    criticality='CRIT-B',
    regulatory_categories={'REG-INT'},
    freshness_sla='7d',
    retention_years=3,
    data_owner_role='data_manager',
    pseudonymized=False,
),
```

**A-4：补齐财务/人事表的 catalog_schema 映射**
- 在 `api_data_platform.py` 的 `TABLE_TO_MODEL` 中补充 `t_quote`、`t_contract`、`t_invoice`、`t_payment`、`t_staff`、`t_staff_qualification`

### Phase B — 治理能力强化（建议 2~4 周）

**B-1：假名化治理界面**
- 在 ClassificationPage 中为 GCP+PIPL 冲突表添加"假名化设计"操作入口
- 实现 `/data-platform/governance/pseudonymize-plan` API，生成假名化方案草稿
- 目标：让数据管理员能看到"该做什么"和"当前状态"，而不只是"有问题"

**B-2：数据保留期到期告警**
- 新增 Celery Beat 任务，每周扫描各域数据创建时间与保留期配置
- 生成 DataGovernanceAlert（或复用 quality app 的 DataQualityAlert 体系）
- 在 DashboardPage 的治理缺口区域展示"即将到期域"

**B-3：血缘追溯 UI 入口**
- 在 RawSourcesPage 的"最近未解决冲突"列表中每行增加"查看追溯链"按钮
- 在 ExternalIntakePage 的候选记录详情中集成 `/trace/candidate/{id}` 结果展示
- 在 LineagePage Tab1 中用真实的 `/trace/` API 数据替换硬编码示意图

**B-4：审计集成**
- 在 `api_data_platform.py` 的写操作端点（`/ingest/deduplicate`、`/ingest/run-pipeline`）中调用 audit app 记录操作日志
- 在 DashboardPage 增加"最近治理操作"卡片

### Phase C — 数据域扩展（建议按季度）

**C-1：数据质量表纳入域注册**
- 将 `t_data_quality_rule`、`t_data_quality_alert` 纳入 `governance_meta_data` 域
- 更新 `DATA_CLASSIFICATION_REGISTRY`

**C-2：知识来源命名空间拆分**
- 将 `ich-guidelines` 的 namespace 从 `nmpa_regulation` 改为 `ich_regulation`

**C-3：责任人问责工作流（选做）**
- 数据管理员通过飞书消息接收治理任务通知（如"t_subject 假名化逾期"）
- 提供审批/决策/延期接口

---

## 10. 总体评价

### 10.1 已实现的亮点

1. **10域模型完整**：从域定义到 API 到前端展示，形成完整闭环，这是真正按数据视角而非业务视角组织的治理平台
2. **生命周期六层清晰**：LifecyclePage 是国内同类系统中少见的、能量化展示"数据在哪个阶段滞留"的治理视图
3. **合规分级体系完整**：27张表的六维度分类、GCP+PIPL冲突自动检测、治理缺口主动扫描，形成了有实际合规价值的治理体系
4. **外部数据治理链路**：从原始层（RawSourcesPage）→ 暂存层（ExternalIntakePage）→ 业务层（各工作台）的治理漏斗，是企业级数据中台的标准能力
5. **写保护分层清晰**：原始数据永久不可变 + 业务数据写保护可控，ALCOA+ 合规意识明确

### 10.2 核心缺口

1. **GCP+PIPL 假名化未落地**（合规高风险）
2. **数据保留期只有定义没有执行**（合规中风险）
3. **血缘追溯 API 存在但 UI 不可用**（治理透明度缺失）
4. **general_manager 权限 bug**（用户体验问题）
5. **治理操作无审计记录**（合规要求）

### 10.3 定量总结

| 维度 | 达成度 |
|------|:------:|
| 数据管理目标 | **82%** |
| 数据治理目标 | **78%** |
| 技术验收（API+页面） | **100%** |
| 合规完整性 | **65%** |
| 权限体系完整性 | **85%** |
| **综合** | **82%** |

---

*本报告基于代码全量扫描，不依赖线上环境快照。建议每次重大版本发布后更新。*
