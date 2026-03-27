# CN KIS V1 → V2 能力对等矩阵

> 版本：1.0 | 生成日期：2026-03-21
> 用途：V2 上线前逐行核对 V1 核心能力是否已在 V2 中对等实现

---

## 一、认证与访问控制

| V1 能力 | V2 状态 | V2 文件 | 备注 |
|---------|---------|---------|------|
| 飞书 OAuth 登录 | ✅ 对等 | `identity/services.py` | |
| refresh_token 持久化防覆盖 | ✅ 对等 + 增强 | `identity/services.py` → `_save_feishu_user_token` | 防空值覆盖逻辑 |
| JWT 会话管理 | ✅ 对等 | `identity/services.py` | |
| RBAC 角色/权限矩阵 | ✅ 对等 | `identity/models.py` + seed_roles | |
| 工作台可见性控制 | ✅ 对等 | `AccountWorkstationConfig` | |
| 数据范围过滤（global/project/personal） | ✅ 对等 | `identity/filters.py` | |
| Celery token 健康检查 | ✅ 对等 | `secretary/tasks.py` + celery_config.py | 每 6 小时 |
| 子衿统一授权（18 台） | ✅ 对等 | `FEISHU_PRIMARY_AUTH_FORCE=1` | |
| 鹿鸣/洞明独立授权 | ✅ **V2 新增** | 独立 App ID 配置 | V1 无此能力 |

## 二、核心业务域

| V1 能力 | V2 状态 | V2 文件 | 备注 |
|---------|---------|---------|------|
| 方案（Protocol）管理 | ✅ 代码对等 | `apps/protocol/` | |
| 访视（Visit）管理 | ✅ 代码对等 | `apps/visit/` | |
| 受试者（Subject）管理 | ✅ 代码对等 | `apps/subject/` | |
| EDC 数据录入 | ✅ 代码对等 + 修复 | `apps/edc/` | 重复路由已修复（2026-03-21） |
| 工单（Workorder）管理 | ✅ 代码对等 | `apps/workorder/` | |
| 质量管理（CAPA/偏差） | ✅ 代码对等 | `apps/quality/` | |
| 人事（HR）管理 | ✅ 代码对等 | `apps/hr/` | |
| 财务（Finance）管理 | ✅ 代码对等 | `apps/finance/` | |
| CRM 客户管理 | ✅ 代码对等 | `apps/crm/` | |
| 设备管理 | ✅ 代码对等 | `apps/equipment/` | |
| 物料管理 | ✅ 代码对等 | `apps/material/` | |
| 伦理审查 | ✅ 代码对等 | `apps/ethics/` | |
| 招募管理 | ✅ 代码对等 | `apps/subject/` | |
| 实验室人员 | ✅ 代码对等 | `apps/lab_personnel/` | |

## 三、集成能力

| V1 能力 | V2 状态 | V2 文件 | 备注 |
|---------|---------|---------|------|
| 飞书邮件采集 | ✅ 代码对等 | `secretary/feishu_fetcher.py` | 生产写入受 CELERY_PRODUCTION_TASKS_DISABLED 保护 |
| 飞书 IM 采集 | ✅ 代码对等 | 同上 | |
| 飞书日历采集 | ✅ 代码对等 | 同上 | |
| 飞书任务采集 | ✅ 代码对等 | 同上 | |
| 飞书文档采集 | ✅ 代码对等 | `knowledge/feishu_doc_knowledge_extractor.py` | |
| 易快报集成 | ✅ 代码对等 | `ekuaibao_integration/` | |
| LIMS 集成 | ✅ 代码对等 | `lims_integration/` | |

## 四、知识与 AI

| V1 能力 | V2 状态 | V2 文件 | 备注 |
|---------|---------|---------|------|
| 知识库管理（KnowledgeEntry） | ✅ 对等 + 增强 | `apps/knowledge/` | 新增 KnowledgeAssetGuard 写保护 |
| 混合检索（5 层网关） | ✅ 对等 + 修复 | `retrieval_gateway.py` | execution_context 已贯通（2026-03-21） |
| 向量化（Jina 1024-dim） | ✅ 代码对等 | `knowledge/tasks.py` | 生产写入受保护 |
| 知识图谱（实体/关系） | ✅ 代码对等 | `knowledge/models.py` | |
| Agent Gateway | ✅ 代码对等 | `agent_gateway/` | |
| 28 个 openclaw-skills | ✅ **V1→V2 迁移完成** | `t_agent_definition`（28 条） | 2026-03-21 导入 |
| V1 KnowledgeEntry | ✅ **V1→V2 迁移完成** | `t_knowledge_entry`（1,123 条迁移） | 2026-03-21 执行 |
| V1 PersonalContext | ✅ **V1→V2 迁移完成** | `t_personal_context`（3,228 条含V1数据） | 2026-03-21 执行 |

## 五、运营治理（V2 新增）

| 能力 | V2 状态 | V2 文件 | 备注 |
|------|---------|---------|------|
| 鹿鸣·治理台（Governance） | ✅ 第一阶段已落地 | `workstations/governance/` | Dashboard + 用户管理 + Token 健康 |
| 洞明·数据台 | ✅ 第一阶段已落地 | `workstations/data-platform/` | Dashboard + 知识资产概览 |
| 知识资产写保护守卫 | ✅ 已实现 | `knowledge/guards.py` | V1 无此能力 |
| 资产一致性核验脚本 | ✅ 已实现 | `ops/scripts/verify_knowledge_assets.py` | |
| 发布前健康检查门禁 | ✅ 已实现 | `ops/scripts/pre_release_health_check.sh` | |
| Nginx 配置版本管理 | ✅ 已纳入仓库 | `deploy/nginx/cn-kis.conf.template` | |
| 数据分类分级治理（六维度）| ✅ **V2 新增** | `knowledge/classification.py` + `CatalogPage.tsx` | V1 无此能力 |
| DataGovernanceGuard 细粒度访问控制 | ✅ **V2 新增** | `knowledge/guards.py` + `@require_governance` | V1 无此能力 |
| 数据质量规则引擎 | ✅ **V2 新增** | `quality/models.py` DataQualityRule + Beat 每 6h 巡检 | V1 无此能力 |
| 受试者假名化（PIPL+GCP 双合规）| ✅ **V2 新增** | `subject/pseudonym_models.py` AES-256-GCM | V1 无此能力 |
| 研究方案版本控制（MDM）| ✅ **V2 新增** | `protocol/models.py` ProtocolVersion + 血缘 API | V1 无此能力 |
| PIPL 数据主体权利响应 | ✅ **V2 新增** | `subject/api.py` 查阅/更正/撤回同意 3 个端点 | V1 无此能力 |
| 知识源注册表 | ✅ **V2 新增** | `knowledge/source_registry.py` + SourcesPage | V1 无此能力 |
| Agent 知识域边界 | ✅ **V2 新增** | `agent_gateway/models.py` AgentKnowledgeDomain | V1 无此能力 |
| 前端页面级埋点 SDK | ✅ **V2 新增** | `api-client/usePageTracking.ts` + `/audit/track` | V1 无此能力 |
| GCP CSV 验证文档体系 | ✅ **V2 新增** | `docs/csv/` IQ/OQ/PQ/FRS/URS 全套 | V1 无此能力 |
| E2E 业务主链 Smoke Test | ✅ **V2 新增** | `ops/scripts/e2e_smoke_test.py` 8 个测试用例 | V1 无此能力 |

---

## 六、能力差距（仍需完成）

| 差距项 | 优先级 | 说明 |
|--------|--------|------|
| ~~端到端业务主链 E2E 测试~~ | ~~P1~~ | ✅ 已完成（`ops/scripts/e2e_smoke_test.py`，2026-03-21）|
| ~~鹿鸣角色管理页面~~ | ~~P3~~ | ✅ 已完成（`RolesPage.tsx` 已接入真实 API，2026-03-21）|
| ~~鹿鸣审计日志页面~~ | ~~P3~~ | ✅ 已完成（`AuditPage.tsx` 已接入真实 API，2026-03-21）|
| ~~洞明数据血缘图~~ | ~~P3~~ | ✅ 已完成（`LineagePage.tsx` 知识图谱+版本血缘，2026-03-21）|
| ~~洞明 Pipeline 监控~~ | ~~P3~~ | ✅ 已完成（`PipelinesPage.tsx` 已接入 Celery 任务监控）|
| ~~V1 openclaw-skills 导入~~ | ~~P1~~ | ✅ 已完成（28 个 skills 已写入 t_agent_definition，2026-03-21）|
| ~~V1 KnowledgeEntry 迁移~~ | ~~P1~~ | ✅ 已完成（1,123 条已迁移到 cn_kis_v2，2026-03-21）|
| ~~V1 PersonalContext 迁移~~ | ~~P1~~ | ✅ 已完成（3,228 条（含 2,591 新增），2026-03-21）|
| ~~qdrant-client 安装~~ | ~~P0~~ | ✅ 已完成（v1.17.1 安装到 V2 venv，2026-03-21）|
| 知识资产 V1/V2 一致性报告 | P2 | 需运行 `verify_knowledge_assets.py` 生成对比报告（切换前执行）|
| PQ 性能测试执行 | P2 | `docs/csv/PQ.md` 定义了 5 个场景，待生产迁移后执行 |
| PIPL 数据主体权利流程验证 | P2 | 假名化迁移完成后，验证查阅/撤回同意完整流程 |
