# CN KIS V2.0 — 最终 Cutover Checklist

> 版本：1.0 | 生成日期：2026-03-21
> 用途：正式将流量从 V1 切换到 V2 之前，逐项核对本清单

---

## 🔴 P0：切换阻塞项（必须全部通过）

### 认证与 Token

- [ ] Celery Beat + Worker 已在 V2 生产环境启动
- [ ] `feishu-token-health-check` 任务已在 Beat 调度中（`CELERY_PRODUCTION_TASKS_DISABLED` 未设为 true）
- [ ] 至少 1 个账号完成完整飞书登录 → token 写入 → refresh_token 刷新验证
- [ ] `feishu_token_saved ... refresh_len=NNN`（NNN > 0）日志已出现

### API 健康

- [ ] `/v2/api/v1/openapi.json` 返回 200，title 为 "CN KIS V2.0 API"
- [ ] 核心接口 smoke test 通过：`/auth/me`、`/protocols/list`、`/workorders/list`、`/knowledge/entries/list`

### 工作台路由

- [ ] 20 个工作台路由均返回 200（运行 `pre_release_health_check.sh` 通过）
- [ ] `/governance/` HTML 包含 `cli_a937515668b99cc9`（鹿鸣治理台独立 App ID）
- [ ] `/data-platform/` HTML 包含 `cli_a93753da2c381cef`（洞明独立 App ID）

---

## 🟡 P1：切换前建议完成

### 知识资产

- [ ] 运行 `python ops/scripts/verify_knowledge_assets.py` 生成切换前基准文件（保存为 `docs/knowledge-assets-baseline-cutover.json`）
- [ ] 确认 `KNOWLEDGE_WRITE_ENABLED` 的状态符合当前阶段预期（V2 初期默认 false）
- [ ] V2 数据库迁移 `python manage.py migrate` 已在生产环境无报错执行
- [ ] 运行 `python manage.py seed_data_quality_rules` 预置 12 条数据质量规则
- [ ] 运行 E2E Smoke Test 通过：`python ops/scripts/e2e_smoke_test.py --token <JWT> --base-url https://china-norm.com/v2/api/v1`

### 权限

- [ ] `python manage.py seed_roles` 已在生产环境执行（20 个工作台角色已入库）
- [ ] 至少 1 名管理员账号已分配 `admin` 角色
- [ ] EDC 重复路由已修复（见 P0-2，2026-03-21 已修复）
- [ ] 知识检索 `execution_context` 已贯通（见 P0-1，2026-03-21 已修复）

---

## 🟢 P2：切换后验证

### 业务主链验证

- [ ] 方案（Protocol）可创建/查询
- [ ] 工单（Workorder）可创建/分配
- [ ] 知识检索（`/knowledge/entries/search?query=...`）返回结果（非空）
- [ ] EDC CRF 记录可创建，`update_crf_record` 对象级权限生效
- [ ] 数据质量巡检 `POST /quality/data-quality/patrol` 返回 `{checked, passed}` 无报错
- [ ] 协议版本控制 `GET /protocol/{id}/versions/lineage` 返回血缘图数据

### 监控

- [ ] Nginx access log 无大量 404/500
- [ ] Django error log 无异常
- [ ] Celery Worker 日志无 task failure

---

## 🔵 回滚路径

| 步骤 | 操作 |
|------|------|
| 1 | 将 Nginx `upstream` 切回 V1 后端端口（8000） |
| 2 | 将工作台静态文件目录切回 V1（`/var/www/cn-kis-v1`） |
| 3 | 确认 V1 服务仍在运行（`systemctl status cn-kis-v1`） |
| 4 | 通知相关人员并记录回滚原因 |

> ⚠️ V1 数据库独立，切回 V1 不会影响 V2 数据库中已写入的数据。

---

## 环境变量核对（切换前逐项检查）

| 变量 | 预期值 | 说明 |
|------|--------|------|
| `FEISHU_PRIMARY_APP_ID` | `cli_a98b0babd020500e` | 子衿统一授权 |
| `FEISHU_PRIMARY_AUTH_FORCE` | `1` | 强制子衿授权 |
| `FEISHU_APP_ID_GOVERNANCE` | `cli_a937515668b99cc9` | 鹿鸣·治理台独立（旧变量 FEISHU_APP_ID_IAM 兼容读取） |
| `FEISHU_APP_ID_DATA_PLATFORM` | `cli_a93753da2c381cef` | 洞明独立 |
| `CELERY_PRODUCTION_TASKS_DISABLED` | `false` 或未设置 | 生产环境不禁用 |
| `FEISHU_BEAT_INCREMENTAL_ENABLED` | 默认不设；需 Beat 跑增量时 `true` | 与服务器 **cron** `sweep_feishu_incremental` 二选一，防叠跑见 `feishu_sweep_lock` |
| `FEISHU_BEAT_WEEKLY_DEEP_ENABLED` | 默认不设；需周深扫时 `true` | 同上；启用前确认无重复定时任务 |
| `FEISHU_SWEEP_SERIALIZE_ALL` | 默认不设；大版本全量窗口可 `true` | 全量 `sweep_feishu_full_history` 与增量 **共用一把锁**，避免叠跑 |
| `FEISHU_SWEEP_FULL_LOCK_TTL` | 默认 `86400` | 全量采集可能极长，勿过短以免 Redis 锁过期后叠跑 |
| `KNOWLEDGE_WRITE_ENABLED` | 按阶段决定（初期 false） | 写保护开关 |
| `JWT_SECRET` | 非空随机字符串 | 不得与 V1 相同 |
| `REDIS_URL` | `redis://localhost:6379/0` | Celery broker |

---

## 🧪 新增发布门禁项（2026-03-21 Wave 5-8 验收补充）

| 门禁项 | 检查命令/方式 | 验收结果 | 状态 |
|--------|-------------|---------|------|
| TypeScript 编译 0 错误（data-platform） | `tsc --noEmit --project workstations/data-platform/tsconfig.json` | 0 错误 | ✅ 通过 |
| TypeScript 编译 0 错误（governance） | `tsc --noEmit --project workstations/governance/tsconfig.json` | 0 错误 | ✅ 通过 |
| 所有 12 个 Data Platform 页面无空白 | 浏览器访问各页面 | API 均返回有效数据 | ✅ 通过 |
| 所有 9 个 IAM 页面无空白 | 浏览器访问各页面 | API 均返回有效数据 | ✅ 通过 |
| `GET /data-platform/backup/status` 返回正确结构 | `curl ...` | code:200，overall:ok | ✅ 通过 |
| `GET /data-platform/topology/health` 4个组件均返回 status | `curl ...` | postgres/redis/qdrant/celery_broker 均有 status | ✅ 通过 |
| `GET /quality/data-quality/rules` 返回至少 12 条规则 | 执行 `manage.py seed_data_quality_rules` 后 | 12 条规则 | ✅ 通过 |
| ActivityPage ip_address 字段存在（审计日志结构） | 检查 `t_audit_log` 模型包含 ip_address 字段 | 字段已存在（catalog/schema 验证）| ✅ 通过 |
| KnowledgePage 关键词搜索 `/knowledge/entries/list?keyword=` | `curl .../knowledge/entries/list?keyword=GCP` | code:200，支持关键词搜索 | ✅ 通过 |
| 4 个新迁移已应用到 V2 生产数据库 | `python manage.py showmigrations` | 4个迁移全部 [X] | ✅ 通过 |
| Protocol 版本创建语义版本正确递增 | `POST /protocol/{id}/versions/create` | minor→1.1.0，major→2.0.0，requires_reconsent(major):true | ✅ 通过 |
| 数据质量巡检无 500 | `POST /quality/data-quality/patrol` | checked:12，passed:4，alerted:4 | ✅ 通过 |
| EKB 原始层代码守卫拦截成功 | Python shell 验证 | `ImmutableAssetWriteError` 正确抛出 | ✅ 通过 |
| 审计日志 DELETE/PATCH 返回 405 | `curl -X DELETE/PATCH /audit/logs/{id}` | 均返回 HTTP 405 | ✅ 通过 |
| `GET /data-platform/catalog/schema` 返回真实字段 | `curl ...catalog/schema` | 修复后 t_protocol:40字段，t_subject:48字段 | ✅ 通过（BUG-004 修复后）|
| Qdrant 存储统计（qdrant_client 模块）| `GET /data-platform/storage/stats` | 监控端点已改用 HTTP REST（与 mcp_client.py 一致），不再依赖 qdrant_client SDK | ✅ 通过（2026-03-22）|
| 备份文件已配置（no_backup 状态）| `GET /data-platform/backup/status` | overall:ok 但 PG 备份 found:0 | ⚠️ 待配置 |
| EDC PHI 端点 DataGovernanceGuard 覆盖 | `edc/api.py` create/update CRF 记录 | `@require_governance('t_crf_record', ...)` 已添加（mode=warn） | ✅ 通过（2026-03-22）|
| SourcesPage 字段格式修复 | `GET /data-platform/knowledge-sources` | 返回字段已适配前端（active, status, source_type_display, last_fetch_at） | ✅ 通过（2026-03-22）|
| .env.example 环境变量完整化 | 核查 FEISHU_PRIMARY_APP_ID / JWT_SECRET / KNOWLEDGE_WRITE_ENABLED | 已补全全部缺失的 Cutover 要求变量 | ✅ 通过（2026-03-22）|

> **注意**：`storage/stats` Qdrant 监控探针已于 2026-03-22 修复（改用纯 HTTP REST，无需 qdrant-client SDK）。PG 备份需在服务器上配置 `ops/scripts/pg_backup.sh` crontab，详见该脚本。

---

## 参考文档

- [V1 → V2 对等矩阵](V1_V2_PARITY_MATRIX.md)
- [迁移章程](V2_MIGRATION_CHARTER.md)
- [工作台独立性原则](WORKSTATION_INDEPENDENCE.md)
- [Wave 1 验收记录](WAVE1_AUTH_RBAC_PLAN.md)
- [Wave 2 落地状态](WAVE2_CORE_DOMAIN_PLAN.md)
- [Wave 3 知识资产保护](WAVE3_KNOWLEDGE_ASSETS_PLAN.md)
