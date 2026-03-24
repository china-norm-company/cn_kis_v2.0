# 飞书全量采集 V1/V2 合并与重新规划

> 文档性质：架构与运维规划（非一次性执行脚本）  
> 更新：2026-03-23  
> 背景：V1（`/data/cn-kis-app` / `cn_kis`）与 V2（`/opt/cn-kis-v2` / `cn_kis_v2`）并行跑采集，**根本目的一致**——持续、完整、可恢复地把飞书数据落入可控存储；当前存在**双路径、双调度、token 与错误表现不一致**等问题，需合并策略并统一「最新 token 体系」。

---

## 1. 结论摘要：谁更「完整」？

「完整」需拆成多个维度，**不能单看行数**：

| 维度 | V1（`cn_kis`） | V2（`cn_kis_v2`） | 说明 |
|------|----------------|-------------------|------|
| **历史体量** | **PersonalContext ≈ 392 万条** | **≈ 15.3 万条** | V1 明显更「厚」，多年主生产数据在此 |
| **数据源覆盖面** | **多**：mail/im/calendar/task/approval/doc/wiki + **drive_file、sheet、slide** + contact、group_msg 等 | **少**：与增量命令默认一致的 **7 类**（无 sheet/slide/drive 等独立 checkpoint 维度） | V1 **类型更全**；V2 更像**受控子集/迁移窗口** |
| **Checkpoint 收口度** | 约 **1974** 条，**pending/running/skipped** 占比高；drive/sheet/slide **完成度极低** | **49** 条，**约 85%+ completed**，余 **7 running** | V2 **状态更「干净」**，但覆盖人群与源类型远小于 V1 |
| **调度与进程** | **cron 直跑** `sweep_feishu_incremental`（`/data/cn-kis-app`）+ 多 Celery worker；易与 `/opt/cn-kis` 并存 | **Celery Beat 仅注册 token 健康检查**；`daily_incremental_feishu_*` 等在 **代码存在但 Beat 中注释掉** | V2 仓库侧**未把「每日增量采集」纳入默认可执行调度**；与服务器上 V1 长期进程**不对称** |

**综合判断**：

- **历史与类型完整性**：**V1 更完整**（量级 + 文档类扩展源）。  
- **单批迁移/状态可解释性**：**V2 更完整**（checkpoint 简单、失败面小）。  
- **生产上「当前是否在持续、健康地采」**：V1 日志出现大量 **401 token 过期**，说明**有效采集完整性正在受损**；不能仅凭行数认为 V1「更好」。

**统一目标**：以 **V2 代码库 + 最新 token 持久化规范** 为**唯一实现真理源**，**调度单点化**；历史资产以 **V1 库只读保留 + 按需同步/迁移** 或 **长期双库但只跑一套采集进程写一侧**（见 §5）。

---

## 2. Token 持久化与管理：必须采用「最新体系」

以下规范已在仓库规则与代码中固化，**合并后的所有采集进程必须满足**（禁止双轨旧逻辑）：

| 环节 | 位置（本仓库） | 要点 |
|------|----------------|------|
| OAuth 落库 | `backend/apps/identity/services.py` → `_save_feishu_user_token` | **禁止用空字符串覆盖已有 `refresh_token`**；`refresh_expires_at` 不得为 `None` |
| 使用侧刷新 | `backend/apps/secretary/feishu_fetcher.py` → `get_valid_user_token` | 新 `refresh_token` **仅非空才写入**；**过期前 1h + refresh 剩余 &lt;7 天主动续期** |
| 定时健康 | Celery Beat：`feishu_token_health_check`（`config/celery_config.py`） | **必须随采集同环境部署**；Beat 未启动则「一次授权永续」无法保证 |
| 进程 | 与采集同机的 **Worker + Beat** | 见 `.cursor/rules/feishu-token-persistence.mdc` |

**现状差距**：

- V1 路径 **`/data/cn-kis-app`** 若未与上述分支/提交对齐，则 **401（token expired）** 会集中爆发在 **IM 等用户态接口**——与近期 `feishu_daily_incr.log` 现象一致。  
- **合并动作的第一项**：将 **唯一运行目录** 切到 **与主分支一致的 V2 部署树**（或把 V1 目录 **git 对齐**并统一依赖），避免「同一 `cn_kis` 库、两套不同 token 代码」。

---

## 3. 采集过程中的错误 / 暂停 / 失败：分类与含义

基于服务器日志与库表观测，建议统一归入下列 **taxonomy**，便于告警与重试策略：

| 类型 | 典型表现 | 可能根因 | 优化方向 |
|------|-----------|----------|----------|
| **E-AUTH-401** | `Authentication token expired`（IM 等） | User token 未刷新、Beat 未跑、旧覆盖逻辑 | 统一到最新 `get_valid_user_token` + 保证 Beat；失败用户进入 **`batch_refresh_tokens` / 授权提醒** |
| **E-AUTH-400** | 审批 `field validation failed` | 请求参数与 OpenAPI 版本不一致、分页游标非法 | 对齐飞书文档与 `feishu_client` 封装；**单用户降级跳过并记 checkpoint 错误** |
| **E-STUCK-RUNNING** | `t_feishu_migration_batch` 多条 **running** 久不结束 | 进程被 kill、多机重复调度、单任务过长无心跳 | **批次心跳/lease**；**全局互斥锁**（Redis）；超时自动标 `failed` 或 `paused` 并告警 |
| **E-PENDING** | 大量 `pending` checkpoint | 从未排到、依赖前置源未完成、用户未授权 | **按用户×源的 DAG** 展示；**优先级队列**（mail → im → …） |
| **E-SKIPPED** | `skipped` 数量大 | 无 scope、租户级占位、业务规则跳过 | 文档化 skip 原因枚举；定期审计「可采但被 skip」 |
| **E-DATA** | MailSignal 年份 1758/1772 等 | 上游异常邮件头、解析缺陷 | 校验后丢弃或隔离表；避免污染统计 |
| **E-OVERLAP** | 多个 `sweep_feishu_incremental` 长进程并存 | cron 与手工重跑叠加、超时未杀旧任务 | **flock/锁文件** 或 **Redis lock**；**单次增量 SLA + kill 策略** |

---

## 4. 当前架构「不同点」合并视图（运维事实 + 代码事实）

| 项 | V1 现状 | V2 现状 | 合并后目标 |
|----|---------|---------|------------|
| 应用路径 | `/data/cn-kis-app`（cron）+ `/opt/cn-kis` | `/opt/cn-kis-v2` | **单一 canonical 路径**跑采集命令；其余只做只读或废弃 |
| 数据库 | `cn_kis` | `cn_kis_v2` | **短期**：双库；**采集进程**先统一写策略（见 §5） |
| 增量入口 | cron `sweep_feishu_incremental` | Beat 中增量任务**默认未启用** | **只保留一种触发**：Beat 或 systemd timer **二选一**，且 **全局互斥** |
| 全量入口 | `sweep_feishu_full_history` + 大批次（如 196 用户） | 小批次（如 28/7 用户）checkpoint | **统一批次元数据模型**；按 **token 预算与 QPS** 配置 `batch_size` |
| 扩展源 | sheet/slide/drive_file 等 | 以 7 源为主 | V2 **扩展 source 列表与 checkpoint 维度**与 V1 对齐 **或** 明确「V2 不采此类」的产品决策 |

---

## 5. 合并与重新规划路线图（建议分阶段）

### 阶段 A — 止血（1～3 天）

1. **盘点进程**：`ps` 确认所有 `sweep_feishu_incremental` / 全量 Python 进程；**只保留一条增量链路**（关重复 cron 或合并窗口）。  
2. **Token**：确认 **Beat + `feishu_token_health_check`** 在**写 `cn_kis` 的那套环境**同样启用；对 401 高频用户跑 **`batch_refresh_tokens`**（或产品授权流）。  
3. **锁**：为 `sweep_feishu_incremental` 增加 **分布式锁或文件锁**，防止多实例叠跑。

### 阶段 B — 统一实现与调度（1～2 周）

1. **代码单一真理源**：以 **本仓库（V2）** 为基准；V1 部署目录 **拉齐 tag/commit** 或 **迁移为仅运行 V2 虚拟环境 + `DJANGO_SETTINGS_MODULE` 指 V1**（仅过渡）。  
2. **恢复/明确 Beat 任务**：在 `celery_config.py` 中有控制地 **启用** `daily_incremental_feishu_sweep` / `weekly_feishu_deep_scan`（注意注释中「可能触发 embedding」的项与 **embedding 治理**红线——飞书原始入库若会走向量，须走 **唯一 Qwen3 通道**）。  
3. **`check_migration_progress`**：纳入 **周报/告警**（failed、running 超时、pending 增长）。

### 阶段 C — 数据与「完整性」策略（2～4 周，需业务拍板）

**三选一或组合**：

- **C1**：**V2 为唯一写入端**，V1 `PersonalContext` **冻结只读**，历史检索走 V1 或同步到 `cn_kis_audit`/对象存储。  
- **C2**：**继续写 `cn_kis` 直至 V2 功能替代**，但 **采集代码只保留一份**，通过 **配置切换 `DATABASES.default`**（风险高，需严格变更窗口）。  
- **C3**：**双写**（复杂度高，一般不建议除非强合规需求）。

**扩展源对齐**：若产品要求 V2 与 V1 一样完整，需在 V2 上 **补齐 sheet/slide/drive_file 等** 的 checkpoint 与 `sweep_feishu_incremental` 的 `sources` 列表，并与 **weekly_feishu_deep_scan** 一致。

### 阶段 D — 可观测性与 SLO

1. 指标：`feishu_checkpoint_completed_ratio`、`feishu_incremental_duration`、`feishu_401_count`、`feishu_batch_running_age`。  
2. 日志：统一 JSON 或结构化字段 `error_class`（对应 §3）。  
3. 告警：401 超阈值、单 batch `running` > 24h、pending 连续 7 日上升。

---

## 6. 与本仓库的后续可交付物（Issue 建议）

### 6.1 已在仓库落地（2026-03-23）

| 交付物 | 说明 |
|--------|------|
| **`apps.secretary.feishu_sweep_lock`** | **增量**与**全量历史**各一把锁（独立 Redis key / 锁文件；全量默认 TTL 24h）；`FEISHU_SWEEP_SERIALIZE_ALL=true` 时与增量**全局互斥**（大版本全量窗口建议开启） |
| **`sweep_feishu_full_history`** | 非 dry-run 时取全量锁；`--reset-stale-running` + `--stale-running-hours` 回收 kill 后僵死的 `running` checkpoint |
| **`FeishuMigrationCheckpoint.running_since`** | 与迁移 `0023` 对齐的 ORM 字段；`mark_running` / `mark_completed` / `mark_failed` 维护 |
| **`celery_config.py`** | `FEISHU_BEAT_INCREMENTAL_ENABLED=true` 且未设 `CELERY_PRODUCTION_TASKS_DISABLED` 时注册 **每日 01:05** `daily_incremental_feishu_sweep`；`FEISHU_BEAT_WEEKLY_DEEP_ENABLED=true` 注册 **周日 02:10** `weekly_feishu_deep_scan` |
| **语法** | 修正 `celery_config.py` 末尾误写的 `}`（原会导致 Python 语法错误） |

> 生产启用 Beat 增量前：**关掉**与之一致的 **cron** `sweep_feishu_incremental`，并确认与 `feishu_token_health_check` 同环境部署。  
> **全量重启**：`python manage.py sweep_feishu_full_history --reset-stale-running` 后照常跑全量；大窗口设 `FEISHU_SWEEP_SERIALIZE_ALL=true` 并临时关 Beat 增量更稳。

### 6.2 仍待排期

| 序号 | 交付物 | 归属 |
|------|--------|------|
| 1 | V2 `FeishuMigrationCheckpoint` **source_type** 与 V1 对齐设计 ADR | secretary |
| 2 | 服务器 **cron → Beat** 迁移 Runbook（含回滚） | docs |
| 3 | `check_migration_progress` 输出对接 Prometheus/飞书机器人（可选） | ops |

---

## 7. 参考

- `docs/DATABASE_CONNECTION_REFERENCE.md` — 库与路径  
- `backend/apps/secretary/management/commands/sweep_feishu_incremental.py`  
- `backend/apps/secretary/feishu_sweep_lock.py` — 增量 / 全量 / 可选全局互斥  
- `backend/apps/secretary/management/commands/sweep_feishu_full_history.py` — 全量断点续传与僵死回收  
- `backend/apps/secretary/management/commands/check_migration_progress.py`  
- `backend/config/celery_config.py` — Beat 实际注册项  
- `.cursor/rules/feishu-token-persistence.mdc`  
- `.cursor/rules/feishu-auth-debugging.mdc`  

---

**说明**：本文不替代变更评审；涉及生产 cron/进程关停前须 **变更窗口 + 回滚方案 + Issue 编号**。
