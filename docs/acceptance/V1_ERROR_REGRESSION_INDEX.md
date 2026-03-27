# V1.0 历史错误防复发清单

> 版本：1.0 | 创建日期：2026-03-21
>
> 整合 V1.0 所有历史错误（65 条）+ V2.0 迁移期新增错误（8 条），建立「历史错误 → 复发风险 → V2 修复点 → 必须验证的断言」闭环。
>
> **约定**：VE-* 为 V1 历史错误；ME-* 为 V2 迁移期错误。状态：✅ V2 已修复 | ⚠️ 待验证 | 🔴 高风险

---

## 一、错误类型分布统计

| 错误类型 | V1 历史数量 | V2 迁移期新增 | 合计 | 高风险未关闭 |
|---|---|---|---|---|
| OAuth / 飞书授权 | 6 | 1 | 7 | 1 |
| 部署 / 漂移 | 8 | 3 | 11 | 2 |
| 数据 / 采集 / 分类 | 12 | 2 | 14 | 3 |
| DB / 迁移 / FK | 9 | 1 | 10 | 2 |
| 向量 / 检索 | 4 | 1 | 5 | 0 |
| 路由 / API | 4 | 1 | 5 | 0 |
| 权限 / 守卫 | 4 | 0 | 4 | 0 |
| 协同 / 合并冲突 | 4 | 0 | 4 | 1 |
| 流程 / CI | 7 | 0 | 7 | 1 |
| 前端 / 小程序 | 7 | 0 | 7 | 归档（不纳入当前波次） |
| **合计** | **65** | **8** | **73** | **10** |

---

## 二、OAuth / 飞书授权类错误（7 条）

### VE-001 — redirect_uri 不一致导致 OAuth 20029 错误
- **来源**：FEISHU_INTEGRATION.md §3.1.1
- **触发条件**：前端使用本机/localhost/动态 IP 作为 redirect_uri，与飞书开放平台配置不一致（含尾部斜杠差异）
- **历史表现**：登录时飞书页面报错 Error code 20029，附带 Log ID
- **V2 修复点**：飞书 SDK 在浏览器环境使用当前访问 `origin` 生成 redirect URI；生产环境需保证飞书后台登记项、前端授权 URL 与后端 `FEISHU_REDIRECT_BASE` 三者完全一致；三个 App 各自独立 redirect URI（`/governance/`, `/data-platform/`, `/secretary/`）
- **必须验证的断言**：
  - `GET /governance/` 飞书 OAuth 完整流程（治理台独立 App ID）
  - `GET /data-platform/` 飞书 OAuth 完整流程（洞明独立 App ID）
  - 不同工作台 OAuth 回调不混用 App ID
- **状态**：✅ V2 架构修复；⚠️ 需生产环境验证

### VE-002 — 服务器部署旧版代码导致全量采集 99991672 Access denied
- **来源**：FEISHU_INTEGRATION.md §1
- **触发条件**：代码已本地更新但未同步部署到服务器；`settings.py` 为旧版本；`.env` 缺少 `FEISHU_PRIMARY_APP_ID`
- **历史表现**：所有飞书数据采集接口返回 `99991672 Access denied`
- **V2 修复点**：独立部署路径（`/opt/cn-kis-v2/`），不与 V1 共享；`pre_release_health_check.sh` 验证部署一致性
- **必须验证的断言**：
  - 服务器 `settings.py` 含 `FEISHU_PRIMARY_APP_ID` 和 `FEISHU_APP_CREDENTIALS`
  - 采集任务调用后无 99991672 错误
- **状态**：✅ V2 已修复

### VE-003 — 文档中残留 Git 合并冲突标记
- **来源**：FEISHU_INTEGRATION.md §3.4
- **触发条件**：多人协作 merge/rebase 时未解冲突直接提交
- **历史表现**：文档配置章节存在双版本并存（`<<<<<<< HEAD` 标记残留）
- **V2 修复点**：`.cursor/rules/safety-and-git.mdc` 禁止未解冲突提交；Git pre-commit hook
- **必须验证的断言**：`grep -r "<<<<<<" docs/ backend/ workstations/` 返回空（零冲突标记）
- **状态**：⚠️ 需定期运行 grep 检查

### VE-004 — 飞书 OAuth 授权成功后浏览器循环回到登录页
- **来源**：FEISHU_INTEGRATION.md §8.2
- **触发条件**：后端服务器 IP 不在飞书开放平台 IP 白名单
- **历史表现**：OAuth code 换取 token 时飞书拒绝，前端收到 401 后跳回登录页无限循环
- **V2 修复点**：飞书规则已关闭 IP 白名单限制；token 刷新逻辑（`refresh_token` 防覆盖规则）
- **必须验证的断言**：完整 OAuth 流程（code → token → profile）无 401 循环
- **状态**：✅ V2 已修复

### VE-005 — OAuth URL 未显式传递 scope 导致采集 99991672
- **来源**：FEISHU_INTEGRATION.md §3.4
- **触发条件**：前端 `getAuthUrl()` 生成授权 URL 时遗漏 scope 参数
- **历史表现**：用户登录成功但数据采集全部失败
- **V2 修复点**：`feishu-sdk/src/auth.ts` 统一 scope 列表；三个 App 各自完整 scope
- **必须验证的断言**：OAuth URL 中包含所有必要 scope（mail/im/calendar/task/approval）
- **状态**：✅ V2 已修复

### VE-027 — 登录后跳转到错误工作台
- **来源**：RECEPTION_FEISHU_SETUP §7
- **触发条件**：前端 App ID 与后端 App ID 不一致，或 `redirect_path` 配置错误
- **历史表现**：OAuth 完成后页面跳转到其他工作台
- **V2 修复点**：三层授权架构明确隔离；IAM/DataPlatform 各自独立 App ID；`force_primary` 逻辑保护
- **必须验证的断言**：治理台 OAuth 回调到 `/governance/`；DataPlatform 回调到 `/data-platform/`；不互串
- **状态**：✅ V2 架构设计保障；⚠️ 需每次 OAuth 流程人工验证

### ME-001 — V2 部署 API endpoint 返回 404（Nginx prefix 与 Gunicorn 不一致）
- **来源**：本轮 V2 迁移期（2026-03-21）
- **触发条件**：直接访问 `http://localhost:8002/v2/api/v1/...` 而未经 Nginx 转发
- **历史表现**：curl 返回 404；实际 Gunicorn 监听 `/api/v1/...`（Nginx 负责 `/v2/api` 前缀重写）
- **V2 修复点**：文档化：测试时直接访问 `http://localhost:8002/api/v1/...`；线上访问通过 Nginx `https://china-norm.com/v2/api/v1/...`
- **必须验证的断言**：`curl http://localhost:8002/api/v1/agents/list` 返回 403（认证要求，非 404）
- **状态**：✅ 已确认，文档化

---

## 三、部署 / 漂移类错误（11 条）

### VE-015 — CI `build || true` 掩盖构建失败
- **来源**：ROADMAP_TRACKER T1
- **触发条件**：任意工作台前端构建出错
- **历史表现**：CI 全绿但产物损坏，部署后页面空白
- **V2 修复点**：V2 pnpm monorepo 构建脚本已移除 `|| true`；`pre_release_health_check.sh` 验证构建产物
- **必须验证的断言**：前端构建报错时 CI 必须 exit 1 阻断
- **状态**：✅ V2 已修复

### VE-016 — 硬编码 IP 地址导致环境迁移困难
- **来源**：ROADMAP_TRACKER T2
- **触发条件**：服务器 IP 变更或添加新域名
- **历史表现**：大范围修改遗漏导致部分接口指向旧 IP
- **V2 修复点**：所有 IP/域名通过 `.env` 环境变量注入；`workstations.yaml` 统一配置
- **必须验证的断言**：`grep -r "118.196.64.48" backend/ workstations/ packages/` 返回仅文档/注释，无业务代码
- **状态**：✅ V2 已修复

### VE-024 — 多人部署相互覆盖导致功能漂移
- **来源**：MERGE_HANDOVER §3
- **触发条件**：多人同时整目录覆盖部署同一服务器目录
- **历史表现**：已部署功能（如黄色提示框）在线上消失
- **V2 修复点**：独立部署路径 `/opt/cn-kis-v2/`；`rsync` 增量同步；部署后 smoke test 验证
- **必须验证的断言**：每次部署后运行 `ops/scripts/e2e_smoke_test.py`；关键功能点截图存档
- **状态**：⚠️ 流程规范；需每次部署后验证 🔴

### VE-029 — 接待台 nginx 路由未配置导致 404
- **来源**：RECEPTION_FEISHU_SETUP §3.1~3.4
- **触发条件**：部署时遗漏接待台 nginx location 配置
- **历史表现**：访问 `/reception/` 返回 404；"未识别飞书应用"错误
- **V2 修复点**：`deploy/nginx/cn-kis.conf.template` 统一管理所有工作台路由
- **必须验证的断言**：所有 20 个工作台路由均可访问（HTTP 200 或 302，非 404）
- **状态**：✅ V2 nginx 模板已包含所有工作台

### VE-033 — 迁移未完整应用导致功能不可用
- **来源**：VOLCENGINE_SETUP
- **触发条件**：新环境部署时未运行 `python manage.py migrate`
- **历史表现**：接口报字段不存在或 500 错误
- **V2 修复点**：`CUTOVER_CHECKLIST.md` 包含迁移检查项；部署脚本包含 migrate 步骤
- **必须验证的断言**：`manage.py showmigrations | grep "\[ \]"` 返回空（无待迁移）
- **状态**：✅ V2 生产已验证无待迁移

### VE-035 — 功能分支迁移未合并到生产导致表缺失 🔴
- **来源**：SHISEIDO_AUDIT §1.4
- **触发条件**：功能分支未合并到 main 即部署
- **历史表现**：secretary 邮件信号表（5 张）未创建，80 封邮件停留在 PersonalContext 层
- **V2 修复点**：V2 使用独立代码库和部署路径，无 V1 分支合并问题；所有 V2 迁移文件均已应用
- **必须验证的断言**：`t_mail_signal_event`（若有）等所有 V2 迁移表均已创建；检索 V2 secretary/knowledge 迁移状态
- **状态**：⚠️ V1 历史问题；V2 需验证 secretary 相关迁移完整

### VE-056 — Django 生产安全告警（W001/W002 SecurityMiddleware 缺失等）
- **来源**：RE_AUDIT_EVIDENCE
- **触发条件**：`python manage.py check --deploy` 检查
- **历史表现**：SecurityMiddleware/CSRF/XFrame 缺失，DEBUG 未关闭
- **V2 修复点**：V2 settings.py 已包含完整安全中间件配置；`KNOWLEDGE_WRITE_ENABLED` 默认 false
- **必须验证的断言**：`python manage.py check --deploy` 输出无 ERROR 级别；`DEBUG=False` 在生产
- **状态**：⚠️ 需定期验证

### ME-002 — rsync 后 Gunicorn 未重载导致运行旧代码
- **来源**：本轮 V2 迁移期（2026-03-21）
- **触发条件**：代码 rsync 后未执行 `gunicorn reload` 或重启 Celery Worker
- **历史表现**：API 返回已修复功能前的旧行为
- **V2 修复点**：部署 SOP 明确包含：rsync → migrate → gunicorn reload → celery restart → smoke test
- **必须验证的断言**：每次部署后 API 版本端点返回最新 commit hash（如有）
- **状态**：✅ 流程规范化

### ME-003 — KNOWLEDGE_WRITE_ENABLED 环境变量命令行传递无效
- **来源**：本轮 V2 迁移期（2026-03-21）
- **触发条件**：`KNOWLEDGE_WRITE_ENABLED=true python manage.py migrate_v1_knowledge` 命令行方式无效
- **历史表现**：迁移命令报 `KnowledgeWriteDisabled` 错误
- **V2 修复点**：迁移操作必须先在 `.env` 中设置 `KNOWLEDGE_WRITE_ENABLED=true`，完成后恢复 `false`
- **必须验证的断言**：迁移完成后服务器 `.env` 中 `KNOWLEDGE_WRITE_ENABLED` 为 `false`（保护生产写入）
- **状态**：✅ 已修复；生产已恢复保护

---

## 四、数据 / 采集 / 分类类错误（14 条）

### VE-007 — SOP 知识入库接口返回单对象被当作列表遍历
- **来源**：ROADMAP_TRACKER KR-0-4
- **触发条件**：`deposit-from-sop` 接口被调用
- **历史表现**：TypeError，SOP 知识无法入库
- **V2 修复点**：`ingestion_pipeline.run_pipeline` 返回 dataclass 对象（非 dict），调用方使用 `result.entry_id`（已修复）
- **必须验证的断言**：`POST /knowledge/deposit-from-sop` 返回标准 `{code, msg, data}` 格式，`data.entry_id` 可访问
- **状态**：✅ V2 已修复

### VE-010 — Agent 创建知识直接跳过审核状态机公开发布
- **来源**：ROADMAP_TRACKER KR-0-7
- **触发条件**：Agent 调用 `knowledge_create` 工具时默认 `is_published=True`
- **历史表现**：低质量知识直接进入 published，污染检索结果
- **V2 修复点**：`KnowledgeAssetGuard` 写保护；`KNOWLEDGE_WRITE_ENABLED=false` 默认保护；新建知识必须经过状态机审核
- **必须验证的断言**：Agent 调用 `knowledge_create` 后知识条目状态为 `draft` 或 `pending_review`，非 `published`
- **状态**：✅ V2 守卫机制保障

### VE-013 — PubMed 幂等键缺失导致重复导入
- **来源**：ROADMAP_TRACKER 2026-03-08
- **触发条件**：多次运行 `import_public_pubmed_portfolio`
- **历史表现**：同一论文多次入库，知识库重复条目
- **V2 修复点**：`source_key` 字段作为幂等键（`v1_migration:{id}` / `pubmed:{uri}:{title}`）
- **必须验证的断言**：多次运行导入命令后 `t_knowledge_entry` 记录数不增长
- **状态**：✅ V2 已修复

### VE-036 — 所有采集邮件 sender 和 date 字段为空
- **来源**：SHISEIDO_AUDIT §1.3
- **触发条件**：飞书邮件 API 返回结构变化，字段路径更新
- **历史表现**：0/80 封邮件有效 sender/date，分类和时间线功能失效
- **V2 修复点**：V2 邮件采集 API 字段路径需验证（`from.address` / `date` 实际路径）
- **必须验证的断言**：采集的 PersonalContext 记录中 `metadata.sender` 和 `metadata.date` 非空比例 ≥ 80%
- **状态**：⚠️ V2 需验证（PersonalContext 3,228 条中邮件字段完整性）🔴

### VE-037 — base64 邮件正文解码成功率仅 57.5%（富文本/HTML 兼容性）
- **来源**：SHISEIDO_AUDIT §1.3
- **触发条件**：飞书邮件为多段 MIME 格式（text/plain + text/html + application/octet-stream）
- **历史表现**：42.5% 邮件正文乱码，NLP 分类严重失真
- **V2 修复点**：`feishu_fetcher` MIME 边界解析；fallback 到 BeautifulSoup HTML 纯文本提取
- **必须验证的断言**：邮件正文可读率 ≥ 90%（`raw_content` 长度 > 10 且非乱码）
- **状态**：⚠️ V2 需验证

### VE-038 — 邮件采集覆盖率仅 4%（167 个账号未采集）
- **来源**：SHISEIDO_AUDIT §1.1
- **触发条件**：Celery 定时任务未遍历所有账号；部分账号未授权 `mail:user_mailbox` scope
- **历史表现**：174 账号中仅 7 个有采集记录
- **V2 修复点**：`feishu_comprehensive_collector` 批量遍历所有有效 `FeishuUserToken` 账号
- **必须验证的断言**：采集任务运行后，有效账号的邮件采集覆盖率 ≥ 70%（剔除未授权账号）
- **状态**：⚠️ 需部署后观察

### VE-040 — 邮件分类误判（project_followup 误判为 complaint）
- **来源**：SHISEIDO_AUDIT §2.1
- **触发条件**：项目编号邮件触发投诉关键词规则
- **历史表现**：project_followup 准确率 75%，complaint 准确率 67%
- **V2 修复点**：分类规则优先级：含项目编号 → 优先 project_followup
- **必须验证的断言**：邮件分类测试集准确率 ≥ 85%
- **状态**：⚠️ V2 需跑评测集验证

### VE-043 — 生产库 CRM 数据为 E2E 测试占位数据
- **来源**：SHISEIDO_AUDIT §3.2
- **触发条件**：E2E 测试脚本在生产库执行后未清理
- **历史表现**：CRM 显示 E2E 假数据，无真实业务数据
- **V2 修复点**：V2 使用独立数据库 `cn_kis_v2`；生产/测试数据隔离
- **必须验证的断言**：V2 CRM 客户数据为真实数据，无"E2E 客户 xxxxx"形式记录
- **状态**：✅ V2 数据库独立，无此问题

### ME-004 — V1 PersonalContext 字段名与 V2 不一致（user_id vs account_id）
- **来源**：本轮 V2 迁移期（2026-03-21）
- **触发条件**：`migrate_v1_knowledge --action=personal_context` 使用错误字段名
- **历史表现**：迁移命令查询失败；PersonalContext 0 条迁移
- **V2 修复点**：已修复迁移脚本（使用 V1 正确字段名 `user_id`, `raw_content`, `created_at`）
- **必须验证的断言**：V2 `t_personal_context` 记录数 ≥ 3,228（含 2,591 条新迁移 V1 数据）
- **状态**：✅ 已修复；迁移成功 3,228 条

---

## 五、DB / 迁移 / FK 类错误（10 条）

### VE-008 — pgvector 检索引用不存在的 embedding 列
- **来源**：ROADMAP_TRACKER KR-0-5
- **触发条件**：调用向量检索接口
- **历史表现**：数据库报错列不存在，向量检索全部失败
- **V2 修复点**：V2 已正确创建 `embedding` 字段（pgvector 1024-dim）；`0007_` 等迁移文件已应用
- **必须验证的断言**：`\d t_knowledge_entry` 中存在 `embedding vector(1024)` 字段
- **状态**：✅ V2 已修复

### VE-014 — 向量维度不统一（V1 512 → V2 1024）
- **来源**：ROADMAP_TRACKER 2026-03-08
- **触发条件**：新旧 embedding 维度不一致
- **历史表现**：向量召回不稳定，部分条目无法检索
- **V2 修复点**：V2 统一使用 Jina 1024-dim；Qdrant 集合使用 1024-dim；pgvector `vector(1024)`
- **必须验证的断言**：`GET /v2/api/v1/knowledge/search?q=test` 返回结果且无维度错误；Qdrant 集合 dim=1024
- **状态**：✅ V2 已统一

### VE-021 — models_questionnaire 未加入导入链导致迁移失败
- **来源**：ROADMAP_TRACKER fix-5
- **触发条件**：在 subject app 运行 makemigrations
- **历史表现**：问卷模板表不存在
- **V2 修复点**：V2 `subject/models.py` 已整合所有子模型；`pseudonym_models.py` 独立导入
- **必须验证的断言**：`python manage.py check` 无 models.E006 错误；所有 subject 相关模型可查询
- **状态**：✅ V2 已修复

### VE-030/031/032 — HR/工单/质量 FK 约束缺失
- **来源**：DB_P0_DATA_INTEGRITY_BACKLOG
- **触发条件**：账号 ID 变更或删除时
- **历史表现**：相关字段静默引用无效 ID，无报错但数据不一致
- **V2 修复点**：V2 在新表中使用 ForeignKey；V2 `t_account_role` 有 FK 约束；遗留 IntegerField 待逐步迁移
- **必须验证的断言**：V2 `t_account_role.account_id` 有 FK 约束；删除账号时关联记录正确处理
- **状态**：⚠️ 部分已修复，部分待迁移

### VE-048 — ProductDispensing 同时存在 subject_id 和 subject ForeignKey 冲突
- **来源**：RE_AUDIT_EVIDENCE P0-05
- **触发条件**：`python manage.py check`
- **历史表现**：Django models.E006 字段冲突，系统检查失败
- **V2 修复点**：V2 sample 模型设计在新架构下已避免此冲突
- **必须验证的断言**：`python manage.py check` 无 models.E006 错误
- **状态**：✅ V2 已规避

### VE-057 — 未应用迁移导致门禁失败
- **来源**：RE_AUDIT_EVIDENCE
- **触发条件**：本地测试环境迁移未应用
- **历史表现**：质量门禁报"有待执行迁移"
- **V2 修复点**：CUTOVER_CHECKLIST 包含迁移状态检查
- **必须验证的断言**：`python manage.py showmigrations | grep "\[ \]"` 返回空
- **状态**：✅ V2 生产已验证

### ME-005 — V1 t_knowledge_entry 无 content_hash/properties 字段导致迁移查询失败
- **来源**：本轮 V2 迁移期（2026-03-21）
- **触发条件**：`migrate_v1_knowledge` 查询 V1 库时使用 V2 字段名
- **历史表现**：`column "content_hash" does not exist` 错误，迁移中断
- **V2 修复点**：已修复迁移脚本（移除不存在字段；改用 `source_key` 去重）
- **必须验证的断言**：`migrate_v1_knowledge --action=check` 无报错；KnowledgeEntry 迁移数 ≥ 1,123
- **状态**：✅ 已修复；迁移成功 1,123 条

---

## 六、向量 / 检索类错误（5 条）

### VE-009 — feishu_doc 通道未参与 RRF 融合
- **来源**：ROADMAP_TRACKER KR-0-6
- **触发条件**：混合检索包含飞书文档来源
- **历史表现**：飞书文档相关内容召回排序严重靠后
- **V2 修复点**：`retrieval_gateway.py` 5 层网关均参与 RRF；`execution_context` 已贯通（2026-03-21）
- **必须验证的断言**：飞书文档来源知识在混合检索结果中排名正常（非末尾）
- **状态**：✅ V2 已修复

### ME-006 — retrieval_gateway 测试缺少 execution_context 参数
- **来源**：ROADMAP_TRACKER fix-3/fix-4 + 本轮迁移期
- **触发条件**：运行知识检索相关单测
- **历史表现**：单测因缺失必需参数直接报错
- **V2 修复点**：`retrieval_gateway.py` `execution_context` 参数已修复贯通；测试夹具需补充 fake context
- **必须验证的断言**：`test_retrieval_gateway.py` 全部通过；`GET /knowledge/search` 返回 200
- **状态**：✅ V2 已修复

---

## 七、路由 / API 类错误（5 条）

### VE-006 — `/knowledge/entities` Q 对象未导入导致 500
- **来源**：ROADMAP_TRACKER KR-0-3
- **触发条件**：调用知识实体接口
- **历史表现**：HTTP 500 Internal Server Error
- **V2 修复点**：V2 `knowledge/api.py` 已正确导入所有 Q 对象
- **必须验证的断言**：`GET /v2/api/v1/knowledge/entities` 返回 200 或 403（非 500）
- **状态**：✅ V2 已修复

### VE-052 — 路由重复声明两次
- **来源**：RE_AUDIT_EVIDENCE P1-03
- **触发条件**：访问招募统计接口
- **历史表现**：路由行为不确定；后注册路由覆盖前者
- **V2 修复点**：V2 api.py 使用 Django Ninja Router，路由冲突会在启动时报错
- **必须验证的断言**：`python manage.py check` 无路由冲突报告；招募统计接口返回正确数据
- **状态**：✅ V2 架构保障

### ME-007 — qdrant-client 未安装导致向量检索报错
- **来源**：本轮 V2 迁移期（2026-03-21）
- **触发条件**：V2 Python 虚拟环境缺少 `qdrant-client` 包
- **历史表现**：向量检索接口启动失败；`import qdrant_client` ImportError
- **V2 修复点**：已安装（`pip install qdrant-client`）；添加到 `requirements.txt`
- **必须验证的断言**：`python -c "import qdrant_client; print(qdrant_client.__version__)"` 成功
- **状态**：✅ 已修复

---

## 八、权限 / 守卫类错误（4 条）

### VE-011 — DELETE 接口使用错误权限 create 而非 delete
- **来源**：ROADMAP_TRACKER KR-0-8
- **触发条件**：用户调用知识删除接口
- **历史表现**：有 create 无 delete 权限的用户可以删除；有 delete 无 create 权限的管理员无法删除
- **V2 修复点**：V2 `@require_permission("knowledge.entry.delete")` 已正确配置
- **必须验证的断言**：拥有 `knowledge.entry.delete` 但不拥有 `knowledge.entry.create` 的角色可删除知识
- **状态**：✅ V2 已修复

### VE-028 — 接待台登录成功但菜单不显示（权限配置错误）
- **来源**：RECEPTION_FEISHU_SETUP §7
- **触发条件**：账号角色不含接待台角色或 visible_workbenches 缺少 `reception`
- **历史表现**：接待台所有菜单不显示
- **V2 修复点**：`seed_roles.py` 已配置 receptionist 角色的 visible_workbenches；IAM 工作台可实时修改
- **必须验证的断言**：`GET /v2/api/v1/auth/profile` 中 receptionist 用户 `visible_workbenches` 包含 `reception`
- **状态**：✅ V2 已修复

---

## 九、协同 / 合并冲突类错误（4 条）

### VE-023 — AI Agent 未确认即执行 git push
- **来源**：MERGE_HANDOVER §1
- **触发条件**：AI Agent 在未获得用户明确确认的情况下执行 git push
- **历史表现**：代码未经确认直接推送到分支
- **V2 修复点**：`.cursor/rules/safety-and-git.mdc` 明确禁止；AI 规则要求推送前必须告知用户
- **必须验证的断言**：所有 git push 操作前 AI 必须报告分支名并等待用户确认
- **状态**：✅ 规则约束

### VE-025 — 合并冲突导致关键功能代码被覆盖
- **来源**：MERGE_HANDOVER §3/4
- **触发条件**：多人修改同一文件，合并时取了错误版本
- **历史表现**：评估台测量页关键功能（飞书跳转、黄框提示）消失
- **V2 修复点**：PR review 流程；`pre_release_health_check.sh` 部署后验证关键功能
- **必须验证的断言**：合并后必须运行 smoke test 验证所有工作台关键功能可用
- **状态**：⚠️ 流程约束；每次合并后需验证 🔴

---

## 十、流程 / CI 类错误（7 条）

### VE-017 — 路线图虚假"完成"（框架就位 ≠ 业务闭环）
- **来源**：ROADMAP_TRACKER 2026-03-07
- **触发条件**：以"框架代码就位"代替"业务场景闭环"标记完成
- **历史表现**：知识系统"框架代码完成"但 8 大核心场景平均完成度仅 14%
- **V2 修复点**：引入 DoD 完成定义；TEST_ACCEPTANCE_FRAMEWORK 8 大验收场景逐一跟踪
- **必须验证的断言**：每个功能项必须有可运行的测试场景作为完成证据（非仅代码存在）
- **状态**：✅ 规范约束

### VE-054 — CI 未执行质量门禁 quality_gate.sh
- **来源**：RE_AUDIT_EVIDENCE P1-03
- **触发条件**：PR 合并时
- **历史表现**：安全告警、迁移未应用等问题在合并时未被拦截
- **V2 修复点**：`ops/scripts/pre_release_health_check.sh` 作为发布前必须运行的门禁
- **必须验证的断言**：每次发布前必须运行 `pre_release_health_check.sh` 且通过；结果存档
- **状态**：⚠️ 需配置到 CI 流程

### ME-008 — openclaw-skills 目录不在服务器上导致导入失败
- **来源**：本轮 V2 迁移期（2026-03-21）
- **触发条件**：服务器上 `/root/Cursor/CN_KIS_V1.0/openclaw-skills/` 不存在
- **历史表现**：`import_v1_skills` 命令失败；skills 导入 0 条
- **V2 修复点**：已 rsync `openclaw-skills/` 到 `/opt/cn-kis-v2/openclaw-skills/`；28 skills 已导入
- **必须验证的断言**：`GET /v2/api/v1/agents/list` 返回 28 个 AgentDefinition 记录
- **状态**：✅ 已修复；28 skills 已导入

---

## 十一、前端 / 小程序类错误（归档，当前波次不纳入验收）

> 以下错误均来自微信小程序，V2.0 当前波次不纳入执行，归档备用。

| 编号 | 错误描述 | 类型 |
|---|---|---|
| VE-046 | 小程序 7 页面绕过统一 API 封装层直接用 Taro.request() | 前端 |
| VE-053 | sample-confirm 页面"功能开发中"但入口开放 | 前端 |
| VE-062 | AE 历史报告页死路由（/pages/report/detail 未注册） | 前端 |
| VE-064 | 推荐页"海报功能"按钮在线但未实现 | 前端 |
| VE-065 | 执行台 ReceptionQuickActions 未接线入口对外展示 | 前端 |
| VE-034 | HTTPS 证书上传脚本遗漏导致小程序 SSL 错误 | 部署 |

---

## 十二、V2 防复发核查清单（发布前必查）

### P0 级（阻断发布）

| 编号 | 检查项 | 验证命令/方法 |
|---|---|---|
| CHK-001 | 无待迁移 | `python manage.py showmigrations \| grep "\[ \]"` 返回空 |
| CHK-002 | Django 部署检查无 ERROR | `python manage.py check --deploy` |
| CHK-003 | Git 无冲突标记 | `grep -r "<<<<<<" docs/ backend/ workstations/` 返回空 |
| CHK-004 | 无硬编码 IP | `grep -r "118.196.64.48" backend/ workstations/packages/` 返回仅注释 |
| CHK-005 | KNOWLEDGE_WRITE_ENABLED 为 false | `grep KNOWLEDGE_WRITE_ENABLED /opt/cn-kis-v2/backend/.env` |
| CHK-006 | 28 skills 全部导入 | `GET /api/v1/agents/list` 返回 count=28 |
| CHK-007 | KnowledgeEntry 迁移数量 | `SELECT count(*) FROM t_knowledge_entry WHERE source_key LIKE 'v1_migration%'` ≥ 1,123 |
| CHK-008 | PersonalContext 记录数 | `SELECT count(*) FROM t_personal_context` ≥ 3,228 |
| CHK-009 | qdrant-client 已安装 | `python -c "import qdrant_client"` 无错误 |
| CHK-010 | 三个 App OAuth 各自独立 | IAM/DataPlatform/Secretary OAuth 回调不混用 App ID |

### P1 级（发布前修复）

| 编号 | 检查项 | 验证方法 |
|---|---|---|
| CHK-011 | 所有工作台路由 HTTP 200 | `ops/scripts/e2e_smoke_test.py` 通过 |
| CHK-012 | 向量检索无维度错误 | `GET /api/v1/knowledge/search?q=test` 正常返回 |
| CHK-013 | Celery Beat 任务运行 | `celery inspect scheduled` 显示巡检任务 |
| CHK-014 | API prefix 路由正确 | Nginx 转发测试（`/v2/api/v1/` → Gunicorn `/api/v1/`）|
| CHK-015 | token 持久化无空字符串覆盖 | 新登录后日志 `refresh_len > 0` |

---

*配套文档：*
- *[V1_BUSINESS_PANORAMA_MASTER.md](V1_BUSINESS_PANORAMA_MASTER.md)*
- *[V1_TEST_ASSET_INDEX.md](V1_TEST_ASSET_INDEX.md)*
- *[V2_ACCEPTANCE_TRACEABILITY_MATRIX.md](V2_ACCEPTANCE_TRACEABILITY_MATRIX.md)*
