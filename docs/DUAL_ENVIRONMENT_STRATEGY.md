# 双环境策略 — CN KIS V2.0

> 本文档是 `docs/V2_MIGRATION_CHARTER.md` 红线 4 的详细执行指南。

---

## 环境定义

```
本地 (Local) ──→ 阿里云测试 (AliyunTest) ──→ 火山云生产 (VolcProd)
                       ↑                              ↑
                  V2 迭代验收                  正式生产资产
```

| 环境 | 地址 | 职责 | 数据 |
|------|------|------|------|
| **本地** | localhost | 个人开发、本地联调 | 本地 SQLite 或测试 DB |
| **阿里云测试** | test-guide.data-infact.com | 集成测试、UAT、迁移演练、权限验证 | 测试专用数据集（脱敏） |
| **火山云生产** | 118.196.64.48 | 正式生产、知识资产承载 | 真实生产数据、知识图谱、向量化结果 |

---

## 阿里云测试环境

### 自动部署

- 触发：push 到 `develop` 分支，`backend/` 有改动
- 工作流：`.github/workflows/backend-deploy-aliyun.yml`
- 健康检查：`https://test-guide.data-infact.com/api/v1/health`

### 测试环境 .env 必含配置

```bash
# ========== 测试环境强制配置 ==========

# 禁用生产采集类 Celery Beat 任务（红线要求）
CELERY_PRODUCTION_TASKS_DISABLED=true

# 测试专用数据库（绝不指向生产）
DATABASE_URL=postgresql://test_user:pass@localhost:5432/cn_kis_v2_test

# 测试专用 Redis
REDIS_URL=redis://localhost:6379/1

# 测试专用 Qdrant（或留空使用内存模式）
QDRANT_URL=http://localhost:6333

# 火山云知识库：测试 collection（非生产）
VOLCENGINE_KB_COLLECTION=cn_kis_v2_test

# ARK Embedding：使用 mock 或 test endpoint
ARK_EMBEDDING_ENDPOINT=

# 飞书：使用测试应用（非 cli_a98b0babd020500e 生产应用）
FEISHU_APP_ID=<test_feishu_app_id>
FEISHU_APP_SECRET=<test_feishu_app_secret>
```

### 测试环境禁止执行的 Celery 任务

在 `backend/celery_app.py` 中，当 `CELERY_PRODUCTION_TASKS_DISABLED=true` 时，以下 Beat 任务不得注册：

```python
PRODUCTION_ONLY_TASKS = [
    'apps.secretary.tasks.sweep_feishu_full_history',
    'apps.secretary.tasks.incremental_feishu_sync',
    'apps.knowledge.tasks.run_ingestion_pipeline',
    'apps.knowledge.tasks.vectorize_bulk',
    'apps.knowledge.tasks.rebuild_embeddings',
    'apps.secretary.tasks.token_health_check',  # 使用生产飞书凭证的版本
]
```

---

## 火山云生产环境

### 生产资产清单（受 V2 章程保护）

| 资产 | 存储位置 | 保护级别 |
|------|---------|---------|
| 飞书原始上下文 | PostgreSQL `t_personal_context` | 只读（V2 Wave 3 之前） |
| 知识条目 + 向量 | PostgreSQL `t_knowledge_entry` + pgvector | 只读（V2 Wave 3 之前） |
| 知识图谱 | PostgreSQL `t_knowledge_entity` / `t_knowledge_relation` | 只读（V2 Wave 3 之前） |
| 易快报原始层 | PostgreSQL `t_ekb_raw_record` | 不可变（永久只读） |
| LIMS 原始层 | PostgreSQL `t_raw_lims_record` | 不可变（永久只读） |
| 向量索引 | Qdrant collection `cn_kis_prod` | 受控写（V2 Wave 3 后） |

### 生产部署流程

1. **手动触发**（不自动部署）
2. 执行前必须在阿里云测试环境通过完整验收
3. 执行时使用 `ops/deploy/volcengine-prod-runbook.md` 中的标准 Runbook
4. 执行后验证健康检查与知识资产完整性

### 生产环境回滚

```bash
# 快速回滚（代码层）
cd /path/to/prod
git log --oneline -5              # 找到上一个稳定版本
git checkout <commit-hash>
sudo systemctl restart cn-kis-backend

# 数据库层（如需要）
python manage.py migrate <app> <migration-name>  # 回滚到指定迁移
```

---

## 环境隔离验证清单

在每次 V2 测试环境上线前，执行以下验证：

```bash
# 1. 确认测试环境 .env 不含生产凭证
grep -c 'cli_a98b0babd020500e' /path/to/.env  # 应为 0

# 2. 确认生产采集任务已禁用
grep 'CELERY_PRODUCTION_TASKS_DISABLED' /path/to/.env  # 应为 true

# 3. 确认数据库指向测试库
python manage.py dbshell -- -c "SELECT current_database();"  # 应为测试库名

# 4. 确认生产知识资产记录数无变化（对比生产库）
# 在生产服务器上执行：
python manage.py shell -c "from apps.secretary.models import PersonalContext; print(PersonalContext.objects.count())"
```

---

## 常见问题

### Q: 测试环境能否读取生产知识库？
A: **不建议**。测试环境应使用生产知识库的脱敏快照，而不是直接连接生产数据库。如确需读取，须以只读方式连接，且不得在测试期间启用写操作。

### Q: V2 何时可以接管生产知识资产的写入？
A: Wave 3 完成且通过以下验收后：
- 知识资产只读对等验证通过（V2 检索结果与 V1 一致）
- content_hash 去重逻辑迁移验证通过
- 一致性核对脚本执行通过
- 系统负责人 Sign-off

### Q: 测试环境飞书登录如何配置？
A: 使用测试专用飞书应用，配置专属的 `redirect_uri`（指向 `test-guide.data-infact.com`），不使用生产应用 `cli_a98b0babd020500e`。
