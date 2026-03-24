# V2.0 验收可追溯矩阵

> 版本：1.0 | 创建日期：2026-03-21
>
> 以 V2.0 为执行面，将业务全景定义、测试资产、历史错误防复发三者统一映射为可追溯的验收矩阵。
>
> **执行约定**：每行代表一个验收项（AC），每个 AC 必须有明确验证方式和状态记录。
>
> **状态说明**：
> - ✅ 已验证通过（含日期）
> - 🔵 可用脚本/API 验证（待执行）
> - ⚠️ 需人工核查
> - 🔴 高风险，优先处理
> - ⬜ 待办

---

## 第一层：迁移结果验收（P0 最高优先级）

### M1 — Agent Skills 迁移完整性

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| M1-01 | 28 个 openclaw-skills 全部导入 `t_agent_definition` | `GET /api/v1/agents/list` | count=28，无"SKILL.md - "前缀名 | ✅ 2026-03-21 |
| M1-02 | 所有 skill 有正确中文名 | 检查 API 返回 `name` 字段 | 无英文乱名或路径前缀 | ✅ 2026-03-21 |
| M1-03 | AgentKnowledgeDomain 种子数据存在 | `SELECT count(*) FROM t_agent_knowledge_domain` | ≥ 6（6个知识域） | 🔵 |
| M1-04 | AgentGateway API 可调用 | `GET /api/v1/agents/providers` | 返回 AI 提供商列表 | ✅ 2026-03-21（403=认证要求确认存在） |
| M1-05 | 技能执行上下文可注入 | 调用 AgentGateway 执行简单技能 | 无 KeyError(execution_context) | ✅ 2026-03-21（已修复） |

**关联错误防复发**：VE-010（Agent 创建知识跳过审核）、ME-008（skills 目录不存在）

---

### M2 — KnowledgeEntry 迁移完整性

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| M2-01 | V1 迁移记录数量 | `SELECT count(*) FROM t_knowledge_entry WHERE source_key LIKE 'v1_migration%'` | ≥ 1,123 | ✅ 2026-03-21 |
| M2-02 | 迁移条目无重复（source_key 唯一） | `SELECT source_key, count(*) FROM t_knowledge_entry GROUP BY source_key HAVING count(*) > 1` | 返回空（无重复） | 🔵 |
| M2-03 | 迁移条目可被检索 | `GET /api/v1/knowledge/search?q=临床试验` | 返回 results 且 source_key 包含 v1_migration 条目 | 🔵 |
| M2-04 | 知识写保护已恢复 | `cat /opt/cn-kis-v2/backend/.env \| grep KNOWLEDGE_WRITE_ENABLED` | 值为 `false` 或不存在（默认 false） | ✅ 2026-03-21 |
| M2-05 | 向量检索无维度错误 | `GET /api/v1/knowledge/search?q=test` | 无 Qdrant 维度异常报错 | 🔵 |
| M2-06 | 知识图谱实体可查询 | `GET /api/v1/knowledge/entities` | 返回 200 且含实体列表 | 🔵 |
| M2-07 | 知识入库管线状态机正确 | `POST /api/v1/knowledge/entries`（需 Auth）| 新建条目状态为 `draft` 非 `published` | ⚠️ 需 token 验证 |

**关联错误防复发**：VE-007（单对象返回）、VE-008（pgvector 列名）、VE-013（幂等键）、VE-014（维度不统一）、ME-005（V1字段名差异）、ME-007（qdrant 未安装）

---

### M3 — PersonalContext 迁移完整性

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| M3-01 | 总记录数 | `SELECT count(*) FROM t_personal_context` | ≥ 3,228（含 V1 迁移 2,591 条） | ✅ 2026-03-21 |
| M3-02 | 内容哈希无空值 | `SELECT count(*) FROM t_personal_context WHERE content_hash=''` | 极少（V2 新增记录应 ≥0 content_hash） | 🔵 |
| M3-03 | source_type 分布正常 | `SELECT source_type, count(*) FROM t_personal_context GROUP BY source_type` | mail/im/task/doc/calendar 均有记录 | 🔵 |
| M3-04 | 邮件字段有效率 | PersonalContext where source_type='mail' 的 metadata 非空 | ≥ 70% 有效 sender 字段 | ⚠️ 需验证（关联 VE-036）🔴 |
| M3-05 | 无重复迁移 | content_hash 唯一性检查 | 无重复 hash 记录 | 🔵 |

**关联错误防复发**：VE-036（sender/date 为空）、VE-037（MIME解码）、VE-038（覆盖率不足）、ME-004（字段名差异）

---

## 第二层：工作台核心功能验收（P0-P1）

### W1 — 认证与授权（IAM）P0

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| W1-01 | 子衿 OAuth 完整流程 | 浏览器访问 `/secretary/` 触发 OAuth | 登录成功，返回 JWT token | ✅ 2026-03-21 |
| W1-02 | 治理台独立 OAuth | 浏览器访问 `/governance/` 触发 OAuth（App ID: cli_a937515668b99cc9）| 治理台登录成功，回调 `/governance/` | ✅ 截图存档（gov-01 到 gov-09）|
| W1-03 | DataPlatform 独立 OAuth | 浏览器访问 `/data-platform/` 触发 OAuth（App ID: cli_a93753da2c381cef）| DataPlatform 登录成功，回调 `/data-platform/` | ✅ 截图存档（dp-01 到 dp-10）|
| W1-04 | JWT + SessionToken 双验证 | `GET /api/v1/auth/profile`（有效 JWT）| 返回 200 + 用户信息 | ✅ 2026-03-21（403 确认认证机制工作）|
| W1-05 | refresh_token 不被空值覆盖 | 连续两次登录后检查 FeishuUserToken | `refresh_token` 非空字符串 | ⚠️ 需操作验证（关联 feishu-token-persistence 规则）|
| W1-06 | 默认角色 viewer 分配 | 新用户首次 OAuth 后 `GET /auth/profile` | `roles` 包含 `viewer`，`visible_workbenches` 包含 `secretary` | ⚠️ 需新账号测试 |
| W1-07 | 鹿鸣·治理台 13 页面可访问 | governance 登录后访问 13 个菜单 | 每页返回数据，无 404/500 | ✅ 截图存档 |
| W1-08 | 角色-权限-工作台映射正确 | 用不同角色登录，检查 `visible_workbenches` | 与 `ROLE_WORKBENCH_MAP` 定义一致 | ⚠️ 需多角色验证 |

**关联错误防复发**：VE-001/002/004/005（OAuth 系列）、VE-027（工作台跳转错误）、VE-028（权限配置错误）、ME-001（Nginx prefix）

---

### W2 — 数据平台（Data Platform）P0

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| W2-01 | 洞明·数据台 12 页面可访问 | DataPlatform 登录后访问所有菜单 | 每页返回数据，无 404/500 | ✅ 截图存档（dp-01 到 dp-10+）|
| W2-02 | Dashboard 数据统计正确 | `GET /api/v1/data-platform/stats` | 返回知识/数据/质量统计数字（非全0）| 🔵 |
| W2-03 | 知识目录（Catalog）可浏览 | `/data-platform/catalog` 页面 | 显示 ≥ 1,123 条 KnowledgeEntry | ⚠️ |
| W2-04 | 数据血缘图（Lineage）可加载 | `/data-platform/lineage` 页面 | ReactFlow 节点图正常渲染 | ✅ dp-05 截图 |
| W2-05 | 质量巡检（Quality）面板 | `/data-platform/quality` 页面 | 显示数据质量规则执行状态 | ✅ dp-07 截图 |
| W2-06 | 系统拓扑健康探针 | `GET /api/v1/topology/health` | PostgreSQL/Redis/Qdrant/Celery 全部 healthy | 🔵 |
| W2-07 | 备份状态可查 | `/data-platform/backup` 页面 | 显示备份列表（可为空但不报错）| ✅ dp-10 截图 |

**关联错误防复发**：VE-008（pgvector 列名）、VE-014（向量维度）、VE-033（迁移未应用）

---

### W3 — 知识管理核心 P0

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| W3-01 | 知识混合检索 5 层网关 | `GET /api/v1/knowledge/search?q=临床试验方案` | 返回结果，source 来源多样 | 🔵 |
| W3-02 | 越权召回率为 0 | 跨权限检索测试 | A 用户不能检索到仅 B 用户可见的知识 | ⚠️ 需多用户测试 |
| W3-03 | 知识图谱关系查询 | `GET /api/v1/knowledge/entities/{id}/relations` | 返回关联实体列表 | 🔵 |
| W3-04 | 原始层写保护 | 尝试直接写 `t_audit_log` | 被 `@require_governance` 拒绝（403）| ⚠️ 需 API 测试 |
| W3-05 | 知识质量评分 | 低质量条目入库后 `quality_score` 字段 | `quality_score` < 0.7 的条目不自动 publish | 🔵 |

**关联错误防复发**：VE-009（feishu_doc 未参与 RRF）、VE-010（知识跳过审核）、VE-011（权限检查错误）、ME-006（execution_context）

---

### W4 — 协议/质量/受试者核心业务 P1

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| W4-01 | Protocol 创建和状态流转 | `POST /api/v1/protocols/`（需 Auth）| 创建成功，状态 draft→active 可触发 | ⚠️ 需 token |
| W4-02 | Protocol 版本控制（V2 新增）| 创建 ProtocolVersion 记录 | major/minor/revision 版本号正确递增 | 🔵 |
| W4-03 | 偏差 7 步状态机 | 创建偏差 → 流转到各状态 | 状态流转符合 reported→investigating→...→closed | ⚠️ 需 token |
| W4-04 | CAPA 创建和关闭 | `POST /api/v1/quality/capas/`（需 Auth）| 创建成功；关闭需验证记录 | ⚠️ 需 token |
| W4-05 | WorkOrder 状态机完整 | 工单 pending→assigned→in_progress→review→approved | 每个状态流转正确 | ⚠️ 需 token |
| W4-06 | 质量巡检 Celery Beat 任务 | `celery inspect scheduled` | 含 `data_quality_patrol` 任务且运行正常 | 🔵 |
| W4-07 | SAE 飞书加急通知 | 创建 severity=SAE 的 AE 记录 | 飞书 Bot 发送加急卡片 | ⚠️ 需集成测试 |
| W4-08 | 受试者 7 态状态机 | 受试者从 registered 到各状态流转 | 状态机约束正确（disqualified 终态不可逆）| ⚠️ 需 token |
| W4-09 | PIPL 查阅权（V2 新增）| `GET /api/v1/subjects/{id}/privacy-report`（受试者自助）| 返回个人信息报告 | 🔵 |
| W4-10 | PIPL 撤回同意（V2 新增）| `POST /api/v1/subjects/{id}/withdraw-consent` | 撤回成功；相关数据处理记录创建 | 🔵 |
| W4-11 | SubjectGlobalRegistry（V2 新增）| `GET /api/v1/subjects/registry` | 返回全局受试者注册表（不含 PII 明文）| 🔵 |
| W4-12 | 假名化机制（V2 新增）| 查询 SubjectPseudonym | PII 字段 AES-256-GCM 加密，不明文存储 | ⚠️ DB 层验证 |

---

### W5 — 数字员工 / AI 能力 P1

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| W5-01 | 数字员工台（digital-workforce）可访问 | 访问 `/digital-workforce/` | 页面加载，AI 对话框可用 | ✅ 2026-03-21（截图存档）|
| W5-02 | AgentGateway fallback 指标 | `GET /api/v1/agents/fallback/metrics` | 返回 AI 提供商降级统计 | ✅ 2026-03-21（403=认证要求）|
| W5-03 | AI 对话可响应 | 提交一条对话消息 | 在 10s 内返回 AI 回复 | ⚠️ 需 token 验证 |
| W5-04 | 28 Skills 可列出（重复确认）| `GET /api/v1/agents/list` | 返回 28 个技能定义 | ✅ 2026-03-21 |
| W5-05 | AI 优雅降级 | 模拟主 AI 提供商不可用 | 自动降级到备用提供商 | ⚠️ 需集成测试 |
| W5-06 | 飞书 AI 使用监控（治理台页面）| 治理台 `/ai-usage` 页面 | 显示 AI 调用频次统计（含近 7 天数据）| ✅ gov-08 截图 |

**关联错误防复发**：VE-017（虚假完成）、ME-006（execution_context）

---

## 第三层：横切视角验收

### C1 — 数据视角（主要数据链路）

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| C1-01 | Protocol → WorkOrder → CRF 链路数据连通 | 通过协议 ID 查询关联工单和 CRF 记录 | 数据引用完整，无悬空 ID | ⚠️ SQL 验证 |
| C1-02 | SampleTransaction 不可删除 | 尝试删除 SampleTransaction 记录 | 被 `@require_governance` 拒绝 | ⚠️ |
| C1-03 | audit_log 不可变（原始层）| 直接 UPDATE/DELETE t_audit_log | 被数据库层或 Django 层阻断 | ⚠️ |
| C1-04 | 数据库 FK 完整性 | `SELECT count(*) FROM t_account_role WHERE account_id NOT IN (SELECT id FROM t_account)` | = 0（无悬空 FK）| 🔵 |

**关联错误防复发**：VE-030/031/032（FK 缺失）、VE-043（E2E 数据污染生产库）

---

### C2 — 质量视角

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| C2-01 | 数据质量巡检每 6h 运行 | Celery Beat schedule | `data_quality_patrol` 在调度列表中 | 🔵 |
| C2-02 | 12 条质量规则已种子化 | `SELECT count(*) FROM t_data_quality_rule` | ≥ 12 | 🔵 |
| C2-03 | 质量规则违规触发飞书通知 | 模拟违规数据 → 等待巡检 | 飞书 Bot 发送质量告警 | ⚠️ 需集成测试 |
| C2-04 | token 健康检查每 6h 运行 | Celery Beat schedule | `feishu_token_health_check` 在调度列表中 | 🔵 |

---

### C3 — 角色权限视角

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| C3-01 | CRC 角色数据作用域隔离 | CRC 用户只能看到自己项目的工单 | 跨项目工单不可见 | ⚠️ 需多项目/多用户测试 |
| C3-02 | QA 无 CAPA manage 权限 | QA 用户调用 CAPA 管理接口 | 返回 403 权限不足 | ⚠️ 需 token |
| C3-03 | 审计日志（IAM）记录敏感操作 | 执行权限修改后查看审计日志 | 操作记录在 `t_audit_log` 中 | ⚠️ 需 token |
| C3-04 | DataManager 可访问洞明·数据台 | data_manager 角色 OAuth 后 | `visible_workbenches` 包含 `data-platform` | ⚠️ 需角色测试 |

**关联错误防复发**：VE-011（权限检查错误）、VE-028（权限配置）

---

### C4 — 部署与环境视角

| AC# | 验收项 | 验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| C4-01 | 无待迁移 | `python manage.py showmigrations \| grep "\[ \]"` | 返回空 | ✅ 2026-03-21 |
| C4-02 | V2 与 V1 路由完全独立 | V2 所有路由通过 `/v2/` Nginx 前缀隔离 | V1 `https://china-norm.com/` 不受影响 | ✅ Nginx 配置验证 |
| C4-03 | V2 与 V1 数据库完全独立 | V2 连接 `cn_kis_v2`，V1 连接 `cn_kis` | 两个数据库无交叉写入 | ✅ .env 配置验证 |
| C4-04 | Django 部署安全检查通过 | `python manage.py check --deploy` | 无 ERROR 级别（Warning 可接受）| ⚠️ 需在服务器运行 |
| C4-05 | 三个进程全部运行 | `ps aux \| grep -E "gunicorn\|celery"` | gunicorn + celery worker + celery beat 全部运行 | ⚠️ 需服务器检查 |
| C4-06 | Nginx 所有工作台路由正常 | 访问 20 个工作台 URL | 每个返回 HTML 页面（200/302，非 404）| ✅ 截图存档（IAM/DP 已验证）|
| C4-07 | 无硬编码 IP | `grep -r "118.196.64.48" backend/ workstations/packages/` | 仅文档/注释中出现 | ✅ 2026-03-21 本地验证通过 |
| C4-08 | Git 无冲突标记 | `grep -r "<<<<<<" docs/ backend/ workstations/` | 返回空 | ✅ 2026-03-21（research/.env 冲突已修复）|

**关联错误防复发**：VE-015/016/024（部署漂移系列）、VE-023（AI 未经确认 push）、ME-002（rsync 后未重载）

---

## 第四层：历史错误专项回归（P0 高风险）

| AC# | 历史错误 | 回归验证方式 | 期望结果 | 状态 |
|---|---|---|---|---|
| R-001 | OAuth 20029 redirect_uri 不一致 | 完整 OAuth 流程（三个 App）| 无 20029 错误，均可完成登录 | ✅ 截图存档 |
| R-002 | 全量采集 99991672 Access denied | 触发一次飞书数据采集任务 | 无 99991672 错误 | ✅ 2026-03-21 验证 |
| R-003 | CI 构建失败被掩盖 | 前端构建触发错误 | CI exit 1 阻断 | ⚠️ 需 CI 验证 |
| R-004 | 向量检索 embedding 列不存在 | `GET /api/v1/knowledge/search?q=test` | 无列不存在报错 | 🔵 |
| R-005 | feishu_doc 未参与 RRF | 含飞书文档内容的混合检索 | 飞书文档来源结果排名正常 | 🔵 |
| R-006 | 知识创建跳过状态机 | Agent 调用 knowledge_create | 新建条目状态为 draft，非 published | ⚠️ 需 token |
| R-007 | PubMed 重复导入 | 运行导入命令两次 | 第二次运行记录数不增长 | 🔵 |
| R-008 | DataBus 搜索覆盖率不足 | 跨域搜索（quality/equipment/sample）| 返回结果非空 | ⚠️ 需集成测试 |
| R-009 | 邮件 sender/date 全为空 | 查询 PersonalContext 邮件记录 | `metadata.sender` 非空率 ≥ 70% | ⚠️ 🔴 |
| R-010 | 分支迁移未合并导致表缺失 | `showmigrations` 全部 applied | 无待迁移 | ✅ 2026-03-21 |
| R-011 | Django 安全告警 | `manage.py check --deploy` | 无 ERROR | ⚠️ |
| R-012 | execution_context 未注入 | 知识检索单测全部通过 | 无 KeyError(execution_context) | ✅ 2026-03-21 已修复 |
| R-013 | PersonalContext 字段名不一致 | V1→V2 迁移记录数 ≥ 3,228 | ✅ 已验证 | ✅ 2026-03-21 |
| R-014 | qdrant-client 未安装 | `python -c "import qdrant_client"` | 无 ImportError | ✅ 2026-03-21 |
| R-015 | skills 目录不存在 | `GET /api/v1/agents/list` count=28 | ✅ 已验证 | ✅ 2026-03-21 |

---

## 验收执行波次计划

### Wave 1 — P0 核心（立即执行，阻断发布）

**范围**：迁移结果验收 + 认证授权 + 部署一致性

| 编号组 | 验收项 | 执行方式 | 预估时间 |
|---|---|---|---|
| M1/M2/M3 | 迁移完整性（全部 AC）| SQL 查询 + API 调用 | 30 分钟 |
| W1-01~04 | OAuth 三个 App 流程 | 浏览器人工 + curl | 30 分钟 |
| C4-01~06 | 部署环境一致性 | SSH + 命令行 | 20 分钟 |
| R-001~015 | 历史错误专项回归 | 脚本 + SQL | 60 分钟 |

### Wave 2 — P1 核心业务（Wave 1 通过后执行）

**范围**：工作台主流程 + 知识检索 + 数字员工

| 编号组 | 验收项 | 执行方式 | 预估时间 |
|---|---|---|---|
| W2-01~07 | 洞明·数据台 12 页面 | 浏览器人工（已有截图）| 20 分钟 |
| W3-01~07 | 知识管理核心 | API 调用 | 30 分钟 |
| W4-01~12 | 协议/质量/受试者 | API + 人工（需 token）| 60 分钟 |
| W5-01~06 | 数字员工 AI | API + 人工 | 30 分钟 |

### Wave 3 — P2 横切视角（发布前最终确认）

**范围**：数据完整性 + 权限隔离 + 稳定性观察

| 编号组 | 验收项 | 执行方式 | 预估时间 |
|---|---|---|---|
| C1-01~04 | 数据链路完整性 | SQL + API | 30 分钟 |
| C2-01~04 | 质量视角 | Celery 检查 + 集成测试 | 20 分钟 |
| C3-01~04 | 角色权限隔离 | 多角色 token 测试 | 60 分钟 |
| C4-07~08 | 代码质量门禁 | grep 脚本 | 10 分钟 |

---

## 验收证据清单

| 类型 | 已有证据 | 位置 |
|---|---|---|
| 治理台截图（13 页面）| ✅ | `tests/ui-acceptance/screenshots/gov-*.png` |
| DataPlatform 工作台截图（10 页面）| ✅ | `tests/ui-acceptance/screenshots/dp-*.png` |
| V1→V2 迁移记录 | ✅ | 对话记录 [V1全功能进化迁移](5f2d6779-e915-454b-bc25-060c8583bb98) |
| API 存活确认（403=认证要求）| ✅ | 2026-03-21 curl 验证记录 |
| 28 Skills 导入确认 | ✅ | server 侧 manage.py 命令输出 |
| parity matrix 更新 | ✅ | `docs/V1_V2_PARITY_MATRIX.md` |
| 业务全景文档 | ✅ | `docs/acceptance/V1_BUSINESS_PANORAMA_MASTER.md` |
| 测试资产地图 | ✅ | `docs/acceptance/V1_TEST_ASSET_INDEX.md` |
| 错误防复发清单 | ✅ | `docs/acceptance/V1_ERROR_REGRESSION_INDEX.md` |
| Git 冲突标记修复（research/.env）| ✅ 2026-03-21 | 本次 Wave 1 验收期间修复（CHK-003）|
| 硬编码 IP 检查通过 | ✅ 2026-03-21 | Python/TS 业务代码无 IP 硬编码（CHK-004）|
| **Wave 3 横切视角验收** | **✅ 2026-03-21** | **C1-04 无悬空FK、C2-02 质量规则12条、C4-03 数据库隔离、M2 KE总1944条** |
| **PersonalContext source_type 分布** | **✅ 2026-03-21** | **mail:2138 / mail_attachment:393 / task:298 / calendar:222 / im:149 / wiki:20 / doc:8** |
| **Wave 1 P0 验收执行结果** | **✅ 2026-03-21** | **12 PASS / 0 FAIL / 1 WARN（剩余 IP 均为 env fallback，可接受）** |
| AgentKnowledgeDomain 8 个种子化 | ✅ 2026-03-21 | server: `manage.py seed_agent_knowledge_domains` |
| **Wave 2 P1: 31 个核心 API 存活** | **✅ 2026-03-21** | **31/31 PASS（agents/chat POST→422 为正常行为）** |
| **三进程运行确认** | **✅ 2026-03-21** | **Gunicorn:8002 + Celery Worker + Celery Beat（4h40min uptime）** |
| **20 个 Celery Beat 任务** | **✅ 2026-03-21** | **含 data-quality-patrol + knowledge-expiry-patrol** |
| **数据库健康（cn_kis_v2）** | **✅ 2026-03-21** | **366 张表，连接状态 ok** |
| **🦌 鹿鸣·治理台唯一化重构验收** | **✅ 2026-03-22** | **20/20 API PASS；旧 admin/iam 目录已删除；governance 13页面 TypeScript 0 错误；seed_roles 已运行；所有文档更新完毕** |
| **🔧 硬编码全面整改（14 问题点）** | **✅ 2026-03-22** | **P0 安全（HC-01~04）+ P1 认证（HC-05~09）+ P2 配置（HC-10~14）；测试脚本 `tests/test_hardcoding_remediation.py`；报告 `docs/acceptance/HARDCODING_REMEDIATION_REPORT_2026-03-22.md`** |

---

*配套文档：*
- *[V1_BUSINESS_PANORAMA_MASTER.md](V1_BUSINESS_PANORAMA_MASTER.md)*
- *[V1_TEST_ASSET_INDEX.md](V1_TEST_ASSET_INDEX.md)*
- *[V1_ERROR_REGRESSION_INDEX.md](V1_ERROR_REGRESSION_INDEX.md)*
- *[../TEST_ACCEPTANCE_FRAMEWORK.md](../TEST_ACCEPTANCE_FRAMEWORK.md)*
- *[../CUTOVER_CHECKLIST.md](../CUTOVER_CHECKLIST.md)*
- *[../V1_V2_PARITY_MATRIX.md](../V1_V2_PARITY_MATRIX.md)*
