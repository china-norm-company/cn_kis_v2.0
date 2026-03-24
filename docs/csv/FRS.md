# FRS — 功能需求规格（Functional Requirement Specification）

**系统**：CN-KIS V2.0 临床研究知识信息系统  
**文件编号**：CN-KIS-CSV-FRS-001  
**版本**：1.0  
**编写日期**：2026-03-21  
**状态**：已批准

---

## 1. 系统功能模块概览

| 模块 | 工作台 | 对应 URS | 主要功能 |
|------|-------|---------|---------|
| 身份与访问管理（IAM） | 鹿鸣·治理台 | URS-010 ~ URS-014 | 用户管理、角色权限、Token 健康、审计日志 |
| 数据治理平台 | 洞明·数据台 | URS-001 ~ URS-005 | 数据目录、质量巡检、知识血缘、分类分级 |
| 临床数据采集（EDC） | 格物·研究台 | URS-001 ~ URS-004 | eCRF 录入、数据核查、方案管理 |
| 受试者管理 | 招募·入组台 | URS-013, URS-020 | 受试者注册、假名化、知情同意追踪 |
| 知识资产管理 | 中书·智能台 | URS-030 ~ URS-032 | 知识条目、技能注册、Agent 管理 |
| 质量管理 | 质控·稽查台 | URS-040 ~ URS-043 | 偏差/CAPA、SOP、质量规则引擎 |
| 合规与安全 | 贯穿所有模块 | URS-020 ~ URS-025 | 加密、备份、PIPL 权利响应 |

---

## 2. 详细功能需求

### FRS-100：身份与访问管理

| 编号 | 功能描述 | 对应 URS | 实现位置 |
|------|---------|---------|---------|
| FRS-101 | 飞书 OAuth 双因子登录（鹿鸣·治理台独立 App ID：`cli_a937515668b99cc9`）| URS-010 | `apps/identity/api.py` |
| FRS-102 | 基于角色的权限控制（RBAC），支持 permission code 级别控制 | URS-011 | `apps/identity/decorators.py` |
| FRS-103 | 账号停用操作在 `t_audit_log` 中记录 | URS-012 | `apps/identity/services.py` |
| FRS-104 | FeishuUserToken 自动刷新（pre-expiry 1h 窗口），refresh_token 滚动续期 | URS-010 | `apps/secretary/feishu_fetcher.py` |
| FRS-105 | Token 健康 Celery Beat 定时检查（每 6h） | URS-010 | `config/celery_config.py` |

### FRS-200：数据治理

| 编号 | 功能描述 | 对应 URS | 实现位置 |
|------|---------|---------|---------|
| FRS-201 | 27 张核心表数据目录（分类/安全级别/保留期/数据责任人标注）| URS-001 | `data-platform/CatalogPage.tsx` |
| FRS-202 | `DataGovernanceGuard` 六维度访问控制（`@require_governance` 装饰器）| URS-011 | `apps/knowledge/guards.py` |
| FRS-203 | 数据质量规则引擎（12 条预置规则，Celery Beat 每 6h 巡检）| URS-002 | `apps/quality/tasks.py` |
| FRS-204 | `KnowledgeAssetGuard`：`KNOWLEDGE_WRITE_ENABLED=false` 时拦截写入 | URS-003 | `apps/knowledge/guards.py` |
| FRS-205 | 数据目录与 DB Schema 实时同步（`/data-platform/catalog/schema` API）| URS-001 | `apps/knowledge/api_data_platform.py` |

### FRS-300：知识管理

| 编号 | 功能描述 | 对应 URS | 实现位置 |
|------|---------|---------|---------|
| FRS-301 | 知识条目版本控制（`status`：draft → published → archived）| URS-030 | `apps/knowledge/models.py` |
| FRS-302 | 知识条目复核周期（`next_review_at`），到期通知飞书 | URS-031 | `apps/knowledge/tasks.py` |
| FRS-303 | 知识源注册表（KnowledgeSourceRegistry），外部法规/数据库自动摘要入库 | URS-032 | `apps/knowledge/source_registry.py` |
| FRS-304 | 向量化检索（Qdrant 1024-dim），支持 hybrid search（语义+关键词）| URS-030 | `apps/knowledge/retrieval_gateway.py` |
| FRS-305 | Agent 知识域边界（`AgentKnowledgeDomain`），防止越权检索 | URS-013 | `apps/agent_gateway/models.py` |

### FRS-400：临床数据采集

| 编号 | 功能描述 | 对应 URS | 实现位置 |
|------|---------|---------|---------|
| FRS-401 | eCRF 数据录入，所有操作记录审计日志 | URS-001, URS-002 | `apps/edc/api.py` |
| FRS-402 | 研究方案版本控制（ProtocolVersion：major.minor.revision）| URS-030 | `apps/protocol/models.py` |
| FRS-403 | 方案版本变更触发重新知情同意检查 | URS-001 | `apps/protocol/services.py` |

### FRS-500：受试者管理与隐私保护

| 编号 | 功能描述 | 对应 URS | 实现位置 |
|------|---------|---------|---------|
| FRS-501 | 受试者全局唯一编号（`SubjectGlobalRegistry`），防重复入组 | URS-001 | `apps/subject/pseudonym_models.py` |
| FRS-502 | 受试者 PII 假名化（AES-256-GCM 加密姓名/手机，SHA-256 哈希身份证）| URS-020 | `apps/subject/pseudonym_models.py` |
| FRS-503 | PIPL 数据主体权利响应（查阅/更正/撤回同意），≤ 15 工作日 | URS-043 | `apps/subject/api.py` |
| FRS-504 | PII 解密操作全部写入审计日志 | URS-002 | `apps/identity/decorators.py` |

### FRS-600：审计与合规

| 编号 | 功能描述 | 对应 URS | 实现位置 |
|------|---------|---------|---------|
| FRS-601 | 审计日志（`t_audit_log`）：所有操作含用户ID/时间戳/操作类型/资源 | URS-001, URS-040 | `apps/audit/models.py` |
| FRS-602 | 审计日志不可 DELETE/UPDATE（API 层权限拦截）| URS-041 | `apps/audit/api.py` |
| FRS-603 | 前端页面级埋点（`usePageTracking`），`POST /audit/track` | URS-001 | `packages/api-client/usePageTracking.ts` |
| FRS-604 | GCP 稽查报告导出（CSV/JSON）| URS-042 | `apps/audit/api.py` |

---

## 3. 非功能性需求

| 编号 | 描述 | 指标 | 验证方法 |
|------|------|------|---------|
| NFR-001 | API 响应时间（P95）| < 500ms（非 AI 接口）| 压测 |
| NFR-002 | 系统可用性 | ≥ 99.5%（月度统计）| 监控告警 |
| NFR-003 | 数据加密强度 | AES-256-GCM + TLS 1.3 | 安全扫描 |
| NFR-004 | 并发用户数 | ≥ 50 并发（ECS 4vCPU/16GB）| 压测 |
| NFR-005 | 审计日志保留 | ≥ 15 年或研究结束后 2 年取长 | 数据库配置 |

---

## 变更历史

| 版本 | 日期 | 变更说明 | 变更人 |
|------|------|---------|--------|
| 1.0 | 2026-03-21 | 初始版本 | CN-KIS 项目团队 |
