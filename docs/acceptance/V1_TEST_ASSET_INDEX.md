# V1.0 测试资产地图

> 版本：1.0 | 创建日期：2026-03-21
>
> 将 V1.0 中所有测试资产（E2E / 后端测试 / 脚本）按「工作台 → 角色 → 流程 → 功能 → 数据项」维度归档，并标注 V2.0 可复用建议。

---

## 一、测试分层体系（V1 TEST_STRATEGY 核心分层）

| 层级 | 名称 | 工具 | 触发时机 | V2 可映射方式 |
|---|---|---|---|---|
| L1 | 单元测试 | pytest / vitest | PR 每次 | 直接移植（路径调整） |
| L2 | 集成测试 | pytest + httpx | PR + 合并前 | API prefix 调整（/api/ → /v2/api/v1/）|
| L3 | 场景测试 | 脚本 + Playwright E2E | 里程碑前 | 工作台 URL 调整 |
| L4 | 质量门禁 | quality_gate.sh | 发布前强制 | ops/scripts/ 已有对应脚本 |
| L5 | 检索评测 | 评测集 + Python | 每周日夜间 | Qdrant 维度升级需重新跑评测 |
| L6 | 稳定性测试 | 长跑监控 | 14天连续 | Celery Beat 任务稳定性观测 |
| L7 | 业务验收 | 人工 + 签署记录 | 里程碑前 | 业务人员亲自执行，不可由技术代替 |

**知识系统关键阈值（L5）：**

| 指标 | 发布阈值 | 优化目标 |
|---|---|---|
| Recall@1 | ≥ 60% | ≥ 75% |
| Recall@5 | ≥ 85% | ≥ 92% |
| Recall@10 | ≥ 90% | ≥ 95% |
| MRR | ≥ 0.65 | ≥ 0.80 |
| NDCG@5 | ≥ 0.70 | ≥ 0.85 |
| **越权召回率** | **= 0%（硬红线）** | = 0% |

---

## 二、E2E 测试资产地图（Playwright .spec.ts）

### 2.1 工作台冒烟测试（smoke/）— 15 个

| 文件名 | 工作台 | V2 复用建议 |
|---|---|---|
| `secretary-smoke.spec.ts` | 子衿·秘书台 | ✅ 调整 URL 前缀即可 |
| `research-smoke.spec.ts` | 采苓·研究台 | ✅ |
| `execution-smoke.spec.ts` | 维周·执行台 | ✅ |
| `quality-smoke.spec.ts` | 怀瑾·质量台 | ✅ |
| `finance-smoke.spec.ts` | 管仲·财务台 | ✅ |
| `crm-smoke.spec.ts` | 进思·客户台 | ✅ |
| `recruitment-smoke.spec.ts` | 招招·招募台 | ✅ |
| `equipment-smoke.spec.ts` | 器衡·设备台 | ✅ |
| `material-smoke.spec.ts` | 度支·物料台 | ✅ |
| `facility-smoke.spec.ts` | 坤元·设施台 | ✅ |
| `evaluator-smoke.spec.ts` | 衡技·评估台 | ✅ |
| `lab-personnel-smoke.spec.ts` | 共济·人员台 | ✅ |
| `ethics-smoke.spec.ts` | 御史·伦理台 | ✅ |
| `hr-smoke.spec.ts` | 时雨·人事台 | ✅ |
| `digital-workforce-smoke.spec.ts` | 中书·智能台 | ✅ 调整到 digital-workforce 路由 |

**V2 新增冒烟测试缺口（建议新建）：**
- `governance-*.spec.ts` — 鹿鸣·治理台（13 页面，合并原admin+iam）
- `data-platform-smoke.spec.ts` — 洞明·数据台（12 页面）

### 2.2 角色日常工作流（roles/）— 9 个

| 文件名 | 角色 | 覆盖核心流程 | V2 复用建议 |
|---|---|---|---|
| `admin-day.spec.ts` | 管理员 | 账号管理、角色分配、审计查看 | ✅ 调整到 /iam 路由 |
| `project-manager-day.spec.ts` | 项目经理 | 协议激活、工单分配、进展监控 | ✅ |
| `crc-day.spec.ts` | CRC 协调员 | 工单执行全流程 | ✅ |
| `evaluator-day.spec.ts` | 技术评估员 | 接受→准备→执行→签名 | ✅ |
| `qa-day.spec.ts` | QA | 偏差报告、SOP 查看 | ✅ |
| `recruiter-day.spec.ts` | 招募专员 | 粗筛4步→精筛→入组 | ✅ |
| `finance-day.spec.ts` | 财务 | 报价/发票/回款录入 | ✅ |
| `hr-day.spec.ts` | HR 专员 | 人员查看、培训记录 | ✅ |
| `sales-day.spec.ts` | 销售代表 | 客户开发、商机跟进 | ✅ |

### 2.3 对象生命周期（lifecycle/）— 4 个

| 文件名 | 覆盖对象 | V2 关键关注点 |
|---|---|---|
| `subject-lifecycle.spec.ts` | 受试者全生命周期（7态） | 新增 PIPL 查阅权/撤回同意断言 |
| `sample-lifecycle.spec.ts` | 样品全生命周期（入库→分发→回收/销毁） | 盲态加密逻辑验证 |
| `project-lifecycle.spec.ts` | 项目全生命周期（阶段0-8） | ProtocolVersion 版本控制新增验证 |
| `finance-lifecycle.spec.ts` | 财务全生命周期（报价→合同→发票→回款） | 与 protocol_id 关联完整性 |

### 2.4 跨模块协作（collaboration/）— 5 个

| 文件名 | 协作流程 | V2 复用建议 |
|---|---|---|
| `recruitment-to-execution.spec.ts` | 招募 → 执行跨台衔接 | ✅ 重点验证 Enrollment → WorkOrder 联动 |
| `unified-todo.spec.ts` | 统一待办多角色协作 | ✅ |
| `quality-capa-loop.spec.ts` | 质量 CAPA 闭环 | ✅ 验证7步状态机完整 |
| `finance-flow.spec.ts` | 财务跨台流程 | ✅ |
| `project-lifecycle.spec.ts` | 项目生命周期协作 | ✅ |

### 2.5 飞书集成（feishu/）— 4 个

| 文件名 | 集成点 | V2 状态 |
|---|---|---|
| `notification-push.spec.ts` | 飞书消息通知推送 | ✅ 已通过（SAE 加急通知已验证） |
| `calendar-sync.spec.ts` | 日历事件同步 | 需确认 V2 celery beat 任务运行 |
| `approval-flow.spec.ts` | 审批流集成 | 需运行后验证 |
| `task-sync.spec.ts` | 任务同步 | 需运行后验证 |

### 2.6 AI 技能质量（claw/）— 2 个

| 文件名 | 测试内容 | V2 复用建议 |
|---|---|---|
| `claw-skills-acceptance.spec.ts` | 28 个 openclaw-skills 验收 | ✅ V2 已导入 28 个 skills（2026-03-21） |
| `claw-ai-agent-quality.spec.ts` | AI Agent 质量评测 | ✅ AgentGateway 已对等实现 |

---

## 三、后端测试资产地图（backend/tests/）

### 3.1 单元测试（unit/）

#### 认证/权限域

| 文件名 | 测试对象 | V2 关键关注点 |
|---|---|---|
| `test_identity_auth_state.py` | 认证状态机 | V2 SessionToken + JWT 双验证机制 |
| `test_identity_oauth_exchange.py` | OAuth 换 token | V2 三层授权架构（子衿/IAM/DataPlatform） |
| `test_identity_feishu_callback_contract.py` | 飞书登录回调契约 | App ID 不一致问题（防 E-027） |
| `test_permission_project_level.py` | 项目级权限 | 数据作用域三层过滤 |
| `test_data_scope_filters.py` | 数据范围过滤 | global/project/personal 过滤逻辑 |
| `test_mobile_login_roles.py` | 移动端登录角色 | 归档，V2 不纳入当前验收 |

#### 知识/检索域

| 文件名 | 测试对象 | V2 关键关注点 |
|---|---|---|
| `test_knowledge_models.py` | 知识库模型字段/枚举 | entry_type/entity_type/relation_type 枚举完整性 |
| `test_ingestion_pipeline.py` | 知识入库管线 | 噪声过滤、去重（精确/SimHash）、状态路由 |
| `test_quality_scorer.py` | 知识质量评分 | 完整性/时效性/关联性三维度 |
| `test_retrieval_gateway.py` | 检索通道（5层） | RRF 融合、图谱 1/2-hop、越权召回率=0（硬红线） |
| `test_privacy_filter.py` | PII 脱敏 | 手机号/身份证/姓名脱敏 + 误报防范 |
| `unit/knowledge/test_retrieval_keyword_search.py` | 关键词检索 | execution_context 参数必须注入 |
| `unit/knowledge/test_pipeline_entity_extraction.py` | 实体抽取 | 知识图谱实体识别 |
| `unit/knowledge/test_pubmed_parser.py` | PubMed 解析 | 幂等键（uri+title）防重复导入（防 E-013） |

#### 飞书采集域

| 文件名 | 测试对象 | V2 关键关注点 |
|---|---|---|
| `test_feishu_client.py` | 飞书 API 客户端 | token 类型（user vs tenant）、限流重试 |
| `test_feishu_event_handler.py` | 飞书事件处理器 | 飞书 Bot 事件幂等处理 |
| `test_feishu_doc_knowledge_extractor.py` | 飞书文档知识提取 | harvest_feishu_document_knowledge |
| `test_feishu_mail_attachments.py` | 飞书邮件附件 | MIME 边界解析（防 E-037） |
| `test_feishu_sync_services.py` | 飞书同步服务 | 批量采集全账号覆盖（防 E-038） |
| `test_mail_signal_classify.py` | 邮件信号分类 | project_followup vs complaint 分类准确率（防 E-040） |
| `test_mail_signal_task_validation.py` | 邮件信号任务校验 | received_at 填充完整性（防 E-042） |

#### 工单/流程域

| 文件名 | 测试对象 | V2 关键关注点 |
|---|---|---|
| `test_workorder_dispatch.py` | 工单分配 | 自动分配逻辑、负载均衡 |
| `test_workorder_generation.py` | 工单生成 | 从访视计划自动生成工单 |
| `test_workorder_services.py` | 工单服务 | 状态机完整性 |
| `test_visit_service.py` | 访视服务 | 访视节点创建/更新 |
| `test_visit_generation.py` | 访视生成 | 时间窗约束 |
| `test_visit_compliance.py` | 访视合规 | 超窗偏差自动触发 |

#### 质量/样品/受试者域

| 文件名 | 测试对象 | V2 关键关注点 |
|---|---|---|
| `test_compliance_gate_service.py` | 合规门禁服务 | `@require_governance` 守卫 |
| `test_sample_management_service.py` | 样品管理 | 盲态编码、不可删除约束 |
| `test_signature_service.py` | 电子签名 | ICF 签署链完整性 |
| `test_edc_validation.py` | EDC 数据校验 | 离群值检测、字段级锁定 |
| `test_data_change_audit.py` | 数据变更审计 | audit_log 不可变（原始层守卫） |

#### 实验人员台（unit/lab_personnel/）— 7 个

| 文件名 | 测试对象 |
|---|---|
| `test_certificate_service.py` | 证书服务 |
| `test_dispatch_service.py` | 派遣服务 |
| `test_qualification_service.py` | 资质服务 |
| `test_risk_engine.py` | 风险预警引擎 |
| `test_scheduling_service.py` | 排班服务 |
| `test_worktime_service.py` | 工时统计服务 |
| `test_models.py` | 模型完整性 |

### 3.2 契约测试（contract/）— 13 个

| 文件名 | 覆盖接口 | V2 复用建议 |
|---|---|---|
| `test_subject_api.py` | 受试者接口 | ✅ 调整 API prefix |
| `test_sample_api.py` | 样品接口 | ✅ |
| `test_protocol_api.py` | 方案接口 | ✅ + 新增版本控制契约 |
| `test_quality_api.py` | 质量接口 | ✅ |
| `test_recruitment_api.py` | 招募接口 | ✅ |
| `test_workorder_api.py` | 工单接口 | ✅ |
| `test_permission_guard.py` | 权限守卫 | ✅ 重要：验证所有 @require_permission |
| `test_crm_api.py` | CRM 接口 | ✅ |
| `test_ethics_api.py` | 伦理接口 | ✅ |
| `test_finance_api.py` | 财务接口 | ✅ |
| `test_hr_api.py` | HR 接口 | ✅ |
| `test_mail_signal_api.py` | 邮件信号接口 | ✅ 重要：验证 E-035/E-036/E-037 修复 |
| `test_proactive_insight_api.py` | 主动洞察接口 | ✅ |

### 3.3 生命周期测试（lifecycle/）— 10 个

| 文件名 | 覆盖场景 | V2 关键关注点 |
|---|---|---|
| `test_subject_lifecycle.py` | 受试者全流程 | + PIPL 查阅/撤回权（V2 新增） |
| `test_sample_lifecycle.py` | 样品全流程 | 不可删除约束 |
| `test_project_lifecycle.py` | 项目全流程 | + ProtocolVersion 版本控制（V2 新增） |
| `test_finance_lifecycle.py` | 财务全流程 | 与协议关联完整性 |
| `test_capa_lifecycle.py` | CAPA 整改流程 | 7步状态机 |
| `test_closeout_lifecycle.py` | 项目收尾流程 | CloseoutChecklist 7项 |
| `test_device_calibration_lifecycle.py` | 设备校准流程 | 校准到期自动告警 |
| `test_ai_skills_lifecycle.py` | AI 技能生命周期 | V2：28 skills 全部可用 |
| `test_cross_lifecycle.py` | 跨模块联动 | Enrollment → WorkOrder → Quality 联动 |
| `test_knowledge_e2e.py` | 知识端到端 | V2 迁移后 1,944 条 + PersonalContext 可检索 |

### 3.4 集成测试（integration/）— 约 25 个

**认证集成**：

| 文件名 | 测试重点 |
|---|---|
| `test_zijin_primary_auth.py` | 子衿主授权（18 个工作台统一 OAuth） |

**数字员工集成**（6 个）：

| 文件名 | 测试重点 |
|---|---|
| `test_digital_workforce_api.py` | 数字员工 API 完整性 |
| `test_digital_worker_gate_api.py` | 门禁 API |
| `test_digital_worker_role_mapping_runtime.py` | 角色映射运行时 |
| `test_digital_worker_l3_security.py` | L3 安全控制 |
| `test_digital_worker_forbidden_without_confirmation.py` | 危险操作强制确认 |
| `test_l2_business_acceptance.py` | L2 业务验收 |

**治理合规**：

| 文件名 | 测试重点 |
|---|---|
| `test_governance_compliance.py` | `@require_governance` 守卫完整性 |
| `test_evidence_gate_business.py` | 证据门禁 |

**知识集成（integration/knowledge/）**：

| 文件名 | 测试重点 |
|---|---|
| `test_graph_recall.py` | 知识图谱召回（实体关系遍历） |
| `test_multi_channel_search.py` | 多通道混合检索（5层网关） |

### 3.5 后端 E2E（e2e/）— 12 个

| 文件名 | 覆盖场景 | V2 优先级 |
|---|---|---|
| `test_subject_lifecycle.py` | 受试者生命周期 | P0 |
| `test_subject_execution.py` | 受试者执行流程 | P0 |
| `test_evaluator_workday.py` | 评估员工作日 | P0 |
| `test_material_lifecycle.py` | 物料生命周期 | P0 |
| `test_recruitment_workflow.py` | 招募工作流 | P0 |
| `test_quality_workflow_api_e2e.py` | 质量工作流 API | P0 |
| `test_evaluator_crf_mapping_e2e.py` | 评估员 CRF 映射 | P1 |
| `test_evaluator_compliance_e2e.py` | 评估员合规 | P1 |
| `test_evaluator_audit_trail_e2e.py` | 评估员审计轨迹 | P1 |
| `test_equipment_facility_quality_e2e.py` | 设备/设施/质量联动 | P1 |
| `test_equipment_facility_quality_api_e2e.py` | 设备/设施/质量 API | P1 |
| `test_subject_management_design.py` | 受试者管理设计验证 | P2 |

### 3.6 AI 评测（ai_eval/）— 9 个

| 文件名 | 测试内容 | V2 复用建议 |
|---|---|---|
| `test_deepeval_ai_quality.py` | DeepEval 质量评测 | ✅ |
| `test_ai_graceful_degradation.py` | AI 优雅降级 | ✅ 重要：fallback 机制 |
| `test_digital_worker_production_readiness.py` | 数字员工生产就绪度 | ✅ P1 |
| `test_digital_worker_real_acceptance_core.py` | 数字员工核心验收 | ✅ P1 |
| `test_digital_worker_real_acceptance_safety.py` | 数字员工安全验收 | ✅ P0 |
| `test_digital_worker_real_acceptance_workflows.py` | 数字员工工作流验收 | ✅ P1 |
| `test_digital_worker_real_eval_reporting.py` | 评测报告 | ✅ |
| `pretraining_benchmark.py` | 预训练基准 | 参考用 |
| `digital_worker_real_eval_runner.py` | 评测运行器 | ✅ 可独立复用 |

### 3.7 Claw/AI 技能测试（claw/）— 11 个

| 文件名 | 测试内容 | V2 重要性 |
|---|---|---|
| `test_skill_recruitment_screener.py` | 招募筛选技能 | P1 |
| `test_skill_instrument_collector.py` | 仪器信息采集技能 | P1 |
| `test_skill_executor.py` | 技能执行器 | P0（核心） |
| `test_skill_execution_context.py` | 执行上下文 | P0（execution_context 已修复） |
| `test_skill_efficacy_report.py` | 功效报告技能 | P1 |
| `test_skill_auto_quotation.py` | 自动报价技能 | P1 |
| `test_registry_config.py` | 技能注册中心配置 | P0（28 skills 注册完整性） |
| `test_orchestration_logic.py` | 编排逻辑 | P1 |
| `test_integration_chains.py` | 集成链路 | P1 |
| `test_feedback_loop_logic.py` | 反馈循环逻辑 | P2 |
| `test_celery_schedule.py` | Celery 定时调度 | P0（Beat 任务运行） |

---

## 四、脚本资产地图（scripts/）

### 4.1 质量门禁与发布阻断

| 脚本名 | 用途 | V2 对应脚本 |
|---|---|---|
| `quality_gate.sh` | 全量质量门禁（L4，阻断发布） | `ops/scripts/pre_release_health_check.sh` |
| `api_integration_gate.sh` | API 集成门禁 | `ops/scripts/e2e_smoke_test.py` |
| `evidence_audit_gate.sh` | 审计证据门禁 | 建议参考创建 |
| `feishu_container_gate.py` | 飞书容器化门禁 | 建议参考创建 |

### 4.2 回归测试套件

| 脚本名 | 用途 | V2 建议 |
|---|---|---|
| `feishu_container_p0_regression.sh` | P0 飞书容器化回归 | 对应 IAM+DataPlatform 独立应用回归 |
| `feishu_container_p1_regression.sh` | P1 飞书容器化回归 | 对应子衿统一 OAuth 回归 |
| `feishu_container_p2_regression.sh` | P2 飞书容器化回归 | 对应 refresh_token 持久化回归 |

### 4.3 环境校验与健康检查

| 脚本名 | 用途 | V2 现有对应 |
|---|---|---|
| `check_feishu_api_fallback_gate.mjs` | 飞书 API 降级检查 | `ops/scripts/pre_release_health_check.sh` |
| `check_prod_auth_integrity.sh` | 生产认证完整性检查 | ✅ 需在 V2 ops/ 中建立同类脚本 |
| `check_volcengine_resources.sh` | 火山引擎资源检查 | ✅ 需适配 V2 路径 |
| `verify_deployed_workstations.py` | 已部署工作台校验 | `ops/scripts/e2e_smoke_test.py` |
| `workstation_health_check.py` | 工作台健康检查 | V2 拓扑健康探针 API 已实现 |
| `p3_preflight_check.sh` | P3 上线前检查 | 对应 V2 CUTOVER_CHECKLIST.md |
| `p3_post_release_24h_check.sh` | P3 上线后 24h 检查 | V2 发布后监控项 |

### 4.4 AI 评测脚本

| 脚本名 | 用途 | V2 复用建议 |
|---|---|---|
| `eval_final_score.py` | AI 最终评分 | ✅ 直接参考复用 |
| `eval_mail_classification.py` | 邮件分类评测 | ✅ 验证 E-040 修复 |
| `eval_real_email_deep.py` | 真实邮件深度评测 | ✅ 验证 E-036/E-037 修复 |

### 4.5 验收与里程碑脚本

| 脚本名 | 用途 | V2 状态 |
|---|---|---|
| `test_zijin_primary_auth_live.py` | 子衿主认证线上验收 | ✅ V2 已通过（2026-03-21 验证） |
| `test_all_feishu_apps.py` | 所有飞书应用验收 | ✅ 需覆盖三个 App ID |
| `test_feishu_approval.py` | 飞书审批流 | 待验证 |
| `test_feishu_calendar.py` | 飞书日历同步 | 待验证 |
| `test_feishu_bot_message.py` | 飞书 Bot 消息 | ✅ SAE 通知已验证 |
| `seed_e2e_data.py` | E2E 测试数据种子 | ✅ V2 backend/tests/seed/ 有对应 |

---

## 五、V2 测试缺口分析

### 5.1 已识别测试缺口

| 缺口类型 | 缺少的测试 | 优先级 | 建议措施 |
|---|---|---|---|
| 新工作台 | IAM 9 页面 E2E 冒烟测试 | P0 | 新建 `tests/ui-acceptance/iam-smoke.mjs` 扩展（现有已有截图证据） |
| 新工作台 | Data Platform 12 页面 E2E 冒烟测试 | P0 | 新建 `tests/ui-acceptance/data-platform-smoke.mjs` 扩展 |
| 新功能 | PIPL 数据主体权利 API 测试 | P0 | 新建 backend 契约测试 |
| 新功能 | ProtocolVersion 版本控制测试 | P1 | 扩展 `test_protocol_api.py` |
| 新功能 | SubjectPseudonym 假名化测试 | P1 | 新建单元测试 |
| 迁移验证 | V1→V2 KnowledgeEntry 迁移结果校验 | P0 | 服务器上运行 `migrate_v1_knowledge --action=check` |
| 迁移验证 | V1→V2 PersonalContext 迁移完整性 | P0 | 数量对比查询（V1: 12,665 / V2 已导入 3,228+） |
| 迁移验证 | 28 Skills 功能可执行验证 | P1 | 调用 AgentGateway API 逐一验证 |
| 检索评测 | L5 检索评测（V2 Qdrant 1024-dim） | P1 | 重新运行评测集（V1 512-dim → V2 1024-dim 需重标注） |
| 稳定性 | Celery Beat 任务 14 天稳定性 | P2 | 生产监控（daily 巡检 + token 健康检查） |

### 5.2 文档提到但实现缺失的测试项

来自 V1 `TEST_STRATEGY.md` 提及但未在 scripts/ 找到：
- 检索评测集（JSON 人工标注）——L5 评测所需，建议在 V2 `tests/knowledge_eval/` 目录创建
- `KNOWLEDGE_ACCEPTANCE_STANDARD.md` 的 8 大业务验收场景——需 L7 业务人员执行签署

---

*配套文档：*
- *[V1_BUSINESS_PANORAMA_MASTER.md](V1_BUSINESS_PANORAMA_MASTER.md)*
- *[V1_ERROR_REGRESSION_INDEX.md](V1_ERROR_REGRESSION_INDEX.md)*
- *[V2_ACCEPTANCE_TRACEABILITY_MATRIX.md](V2_ACCEPTANCE_TRACEABILITY_MATRIX.md)*
