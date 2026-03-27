# CN KIS V2.0 验收知识底座总索引

> 版本：1.0 | 创建日期：2026-03-21
>
> 本文档是 CN KIS V2.0 迁移验收的**总入口**，整合来自 CN KIS V1.0 的业务全景材料、测试资产和历史错误记录，形成覆盖工作台、角色、流程、功能与数据项的完整验收知识体系。
>
> **涉及来源**：V1.0 docs/ 目录 6 大业务全景文档 + tests/ 约 150+ 个测试文件 + 4 份错误复盘文档 + V2.0 迁移期 8 条新增错误。

---

## 快速导航

| 专题文档 | 内容 | 主要用途 |
|---|---|---|
| 📋 [业务全景库](V1_BUSINESS_PANORAMA_MASTER.md) | 18 台全景、30 角色、8阶段生命周期、受试者/样品/数据/质量/RBAC 视角 | 定义"要验什么"——每个功能的业务意义和预期行为 |
| 🗂️ [测试资产地图](V1_TEST_ASSET_INDEX.md) | V1.0 约 150+ 测试文件按工作台/角色/功能分类；V2 缺口分析 | 定义"用什么验"——可复用的测试脚本和需新建的测试 |
| 🔴 [历史错误防复发清单](V1_ERROR_REGRESSION_INDEX.md) | 73 条历史错误（V1 65条 + V2 迁移期 8 条）+ 15 条 P0 发布前核查清单 | 定义"防什么"——每个错误的断言和发布门禁 |
| ✅ [V2 验收追溯矩阵](V2_ACCEPTANCE_TRACEABILITY_MATRIX.md) | 按迁移结果/工作台/横切视角的可追溯 AC 列表 + Wave 1/2/3 执行计划 + 已有证据清单 | 定义"怎么验"——具体执行步骤和状态跟踪 |

---

## 现有 V2 验收文档（复用，不重建平行体系）

| 文档 | 内容 | 路径 |
|---|---|---|
| TEST_ACCEPTANCE_FRAMEWORK | T 系列测试用例（T-IAM/T-DP/T-COMP 等）| `docs/TEST_ACCEPTANCE_FRAMEWORK.md` |
| CUTOVER_CHECKLIST | 上线门禁发布检查清单（含 P0~P3 项）| `docs/CUTOVER_CHECKLIST.md` |
| V1_V2_PARITY_MATRIX | V1.0/V2.0 功能对等矩阵 | `docs/V1_V2_PARITY_MATRIX.md` |
| WAVE2~4 PLAN | Wave 2-4 开发计划与完成状态 | `docs/WAVE2_CORE_DOMAIN_PLAN.md` 等 |

---

## V1.0 原始材料来源索引

### 业务全景源（6 份）

| 文档 | 核心价值 |
|---|---|
| `CN_KIS_V1.0/docs/SYSTEM_ARCHITECTURE_AND_WORKFLOW_GUIDE.md` | 系统架构与整体工作流程，18 台的技术路线图 |
| `CN_KIS_V1.0/docs/BUSINESS_FEATURES_SUMMARY.md` | 各工作台功能点汇总，业务价值说明 |
| `CN_KIS_V1.0/docs/ROLE_BUSINESS_PANORAMA.md` | 30 个角色的完整操作手册 |
| `CN_KIS_V1.0/docs/RBAC_PERMISSION_SYSTEM.md` | 权限系统设计（L1-L10 层级、格式、数据作用域） |
| `CN_KIS_V1.0/docs/FULL_LIFECYCLE_COLLABORATION_ANALYSIS.md` | 项目全生命周期跨台协作分析 |
| `CN_KIS_V1.0/docs/EXECUTION_BUSINESS_PANORAMA.md` | 执行台业务全景深度分析 |

### 测试资产源（6 个目录/文档）

| 来源 | 测试类型 |
|---|---|
| `CN_KIS_V1.0/tests/e2e/smoke/` | 15 个工作台冒烟测试 |
| `CN_KIS_V1.0/tests/e2e/roles/` | 9 个角色日常工作流 |
| `CN_KIS_V1.0/tests/e2e/lifecycle/` | 4 个生命周期测试 |
| `CN_KIS_V1.0/backend/tests/` | 约 100+ 单元/契约/集成/E2E/AI评测测试 |
| `CN_KIS_V1.0/scripts/` | 约 50+ 验收/回归/健康检查脚本 |
| `CN_KIS_V1.0/docs/TEST_STRATEGY.md` | L1-L7 测试分层体系 |
| `CN_KIS_V1.0/docs/KNOWLEDGE_TEST_MATRIX.md` | 知识系统专项测试矩阵 |

### 错误复盘源（8 份文档）

| 文档 | 包含错误类型 |
|---|---|
| `CN_KIS_V1.0/docs/FEISHU_INTEGRATION.md` | OAuth 5 条（redirect_uri/Access denied/scope 等）|
| `CN_KIS_V1.0/docs/ROADMAP_TRACKER.md` | 路由/向量/DB/数据/流程 17 条 |
| `CN_KIS_V1.0/docs/MERGE_HANDOVER_*.md` | 协同/合并冲突/部署覆盖 4 条 |
| `CN_KIS_V1.0/docs/RECEPTION_FEISHU_SETUP.md` | 接待台 OAuth/权限/部署 3 条 |
| `CN_KIS_V1.0/docs/DB_P0_DATA_INTEGRITY_BACKLOG.md` | DB FK 完整性 3 条 |
| `CN_KIS_V1.0/docs/VOLCENGINE_SETUP_AND_SUCCESS_LOG.md` | 部署/HTTPS 证书 2 条 |
| `CN_KIS_V1.0/docs/SHISEIDO_AUDIT_REPORT_2026-03-15.md` | 邮件采集/分类/数据质量 9 条 |
| `CN_KIS_V1.0/docs/RE_AUDIT_EVIDENCE_LOG.md` | 全系统 CI/DB/前端/流程 22 条 |
| V2 迁移期（2026-03-21 对话记录）| Nginx prefix/rsync 未重载/V1字段差异/qdrant未安装 等 8 条 |

---

## 验收执行状态总览（截至 2026-03-21）

### 已完成 ✅

| 项目 | 完成日期 | 证据 |
|---|---|---|
| IAM 工作台 9 页面 E2E 截图验收 | 2026-03-21 | `tests/ui-acceptance/screenshots/iam-*.png` |
| DataPlatform 工作台 10 页面 E2E 截图验收 | 2026-03-21 | `tests/ui-acceptance/screenshots/dp-*.png` |
| V1 28 个 openclaw-skills 导入 V2 | 2026-03-21 | server: `manage.py import_v1_skills` |
| V1 KnowledgeEntry 1,123 条迁移 | 2026-03-21 | server: `migrate_v1_knowledge` |
| V1 PersonalContext 2,591 条迁移（总 3,228 条）| 2026-03-21 | server: `migrate_v1_knowledge` |
| 三个 App OAuth 架构验证 | 2026-03-21 | 浏览器登录验证 |
| 核心 API endpoint 存活确认（403=认证要求）| 2026-03-21 | curl 验证 |
| 知识写保护恢复（KNOWLEDGE_WRITE_ENABLED=false）| 2026-03-21 | server: .env 检查 |
| Nginx + Gunicorn 路由架构验证 | 2026-03-21 | 文档化 |
| **Wave 1 P0 服务器验收** | **2026-03-21** | **12 PASS / 0 FAIL — 无待迁移、Django安全检查、知识写保护、迁移数量** |
| **AgentKnowledgeDomain 8 个知识域种子化** | **2026-03-21** | **server: `manage.py seed_agent_knowledge_domains`** |
| **Git 冲突标记修复** | **2026-03-21** | **research/.env 两处 `<<<<<<<` 已清除** |
| **control_plane/services.py IP 硬编码修复** | **2026-03-21** | **改为 `SERVER_BASE_URL` env var 保护** |
| **Wave 2 P1: 31 个核心 API 全部存活** | **2026-03-21** | **agents/protocol/quality/subject/knowledge/data-platform 均 403/200** |
| **三进程运行确认** | **2026-03-21** | **Gunicorn:8002 + Celery Worker + Celery Beat（4h40min+ uptime）** |
| **20 个 Celery Beat 任务** | **2026-03-21** | **含 data-quality-patrol + knowledge-expiry-patrol** |
| **Wave 3 横切验收** | **2026-03-21** | **AccountRole 无悬空FK / DataQualityRule 12条 / 数据库隔离 / KE总1944条** |
| **PersonalContext 数据分布** | **2026-03-21** | **mail:2138 / mail_attachment:393 / task:298 / calendar:222 / im:149** |

### 待执行（Wave 1 P0）🔵

| 项目 | 优先级 | 执行方式 |
|---|---|---|
| ~~迁移结果 SQL 完整性验证（重复/字段质量）~~ | ~~P0~~ | ~~已完成~~ |
| ~~三个 App OAuth 完整流程人工验证~~ | ~~P0~~ | ~~已完成~~ |
| ~~部署环境一致性检查（三进程/安全告警）~~ | ~~P0~~ | ~~已完成~~ |
| ~~15 条历史错误专项回归~~ | ~~P0~~ | ~~已完成~~ |

### 待执行（Wave 2 P1）⚠️

| 项目 | 优先级 | 执行方式 | 状态 |
|---|---|---|---|
| 协议/质量/受试者业务 API（需真实 token）| P1 | 用户登录后 curl 验证 | ⚠️ 需 token |
| 知识混合检索结果质量（越权召回率）| P1 | 多角色测试 | ⚠️ 需 token |
| AI 对话可响应（< 10s）| P1 | token + /agents/chat POST | ⚠️ 需 token |
| refresh_token 持久化无空值覆盖 | P1 | 两次登录后检查 DB | ⚠️ 需操作验证 |

### 待执行（Wave 3 P2）⚠️

| 项目 | 优先级 | 执行方式 | 状态 |
|---|---|---|---|
| CRC 角色数据作用域隔离 | P2 | 多项目/多用户 token 测试 | ⚠️ 需多角色 |
| SAE 飞书加急通知触发 | P2 | 创建 SAE 级 AE 记录 | ⚠️ 需集成测试 |
| L5 知识检索评测（1024-dim）| P2 | 重建评测集后运行 | 📋 计划中 |

---

## 本轮不纳入验收（归档）

以下内容已在各文档中明确标注为 `excluded_from_current_wave=true`：

- **微信小程序**（受试者端 + 技术员端）：VE-034/046/053/062/064 归档
- **移动 App**（mobile-rn）：尚未开发，归档
- **WeChat 支付 / 礼金发放 App 内流程**：依赖小程序，归档

---

## 风险提示

1. **🔴 邮件字段有效率（R-009/VE-036）**：PersonalContext 邮件记录中 `metadata.sender` 可能为空，影响知识采集质量，需优先验证
2. **🔴 部署覆盖漂移（VE-024）**：每次部署后必须运行 smoke test，截图存档关键页面
3. **⚠️ Celery Beat 未启动**：若 Celery Beat 未运行，token 健康检查和数据质量巡检均不执行，会导致 token 失效后用户需重新登录
4. **⚠️ Django 安全告警**：生产环境 `manage.py check --deploy` 需在服务器上验证，本地验证无意义
5. **⚠️ L5 检索评测集缺失**：V2 升级 Qdrant 1024-dim 后需重新构建评测集（V1 使用 512-dim），目前无对应 L5 评测数据

---

*本文档系统基于历史材料自动生成，每次重大功能变更或发布前应更新矩阵状态。*
