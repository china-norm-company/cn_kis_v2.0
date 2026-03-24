# 数据库连接参考 — CN KIS V2.0（火山云实例）

> 最后更新：2026-03-21
> 服务器：118.196.64.48（火山云 ECS）
>
> **架构说明**：V2.0 与 V1.0 共用同一台火山云服务器上的同一个 PostgreSQL 16.11 实例，
> 通过**不同数据库名**实现完全隔离，无需另购 RDS 或新建服务器。

---

## 一、服务器共享资源

| 项目 | 值 |
|---|---|
| 服务器 IP | 118.196.64.48 |
| 操作系统 | Ubuntu 24.04 LTS |
| CPU | Intel Xeon Platinum 8582C, 4 核 8 线程 |
| 内存 | 32 GB |
| 磁盘 | 40 GB 系统盘 |
| PostgreSQL 版本 | **16.11**（localhost:5432） |
| pgvector | **0.6.0**（`cn_kis_v2` 已激活 `CREATE EXTENSION vector;`） |
| Redis 版本 | 7.0.15（localhost:6379） |
| SSH 密钥 | `/Users/aksu/Downloads/openclaw1.1.pem` |

---

## 二、同一实例上的所有数据库（实际现状）

| 数据库名 | 用户名 | 系统 | 部署路径 | 后端端口 | 表数量 |
|---------|-------|------|---------|---------|--------|
| `cn_kis` | `cn_kis` | **V1.0**（18 个工作台主系统） | `/opt/cn-kis/` | 8001 | 285 |
| `cn_kis_audit` | `cn_kis` | **V1.0 知识资产库**（AI / 知识图谱） | `/opt/cn-kis/` | — | 350 |
| `cn_kis_mini` | `cn_kis_mini` | V1.0 微信小程序 | `/opt/cn-kis-mini/` | — | 273 |
| `cn_kis_mail_validation` | `cn_kis` | V1.0 邮件验证 | — | — | — |
| **`cn_kis_v2`** | **`cn_kis`** | **V2.0**（20 个工作台，已上线） | `/opt/cn-kis-v2/` | **8002** | **366** |

> `cn_kis_v2` 数据库已于 2026-03-21 完成初始化，所有 Django 迁移已应用，pgvector 已激活。

---

## 三、V2.0 数据库详情（cn_kis_v2）

| 配置项 | 值 |
|---|---|
| 数据库名 | `cn_kis_v2` |
| 用户名 | `cn_kis`（与 V1.0 共用同一 PG 用户） |
| 主机 | `localhost`（服务器本地，不对外暴露） |
| 端口 | `5432` |
| Redis 库号 | `db1`（V1.0 用 `db0`，不冲突） |
| pgvector | ✅ **0.6.0 已激活** |
| Django 迁移模块 | 42 个 apps，366 张表 |
| 部署路径 | `/opt/cn-kis-v2/` |
| Gunicorn 端口 | `8002` |

---

## 四、V1.0 知识资产现状（迁移参考）

V1.0 的知识数据存储在 `cn_kis_audit` 库：

| 表名 | 说明 | 当前记录数 |
|------|------|-----------|
| `t_personal_context` | 飞书邮件/IM/日历/任务/文档采集 | **3,409 条** |
| `t_knowledge_entry` | 知识条目（含 512-dim 向量） | **1,123 条** |
| `t_knowledge_entity` | 知识图谱实体节点 | **25 个** |
| `t_knowledge_relation` | 知识图谱关系边 | **18 条** |

V2.0 当前已有：

| 表名 | 当前记录数 |
|------|-----------|
| `t_knowledge_entry` | **821 条**（已通过种子脚本导入） |
| `t_personal_context` | **637 条** |
| `t_agent_definition` | **0 条**（openclaw-skills 尚未导入） |

---

## 五、连接方式

### 5.1 服务器本地直连

```bash
# V2.0（cn_kis_v2）
PGPASSWORD=<密码见 /opt/cn-kis-v2/backend/.env> psql -h localhost -U cn_kis -d cn_kis_v2

# V1.0 主系统（cn_kis）
PGPASSWORD=cn_kis_2026 psql -h localhost -U cn_kis -d cn_kis

# V1.0 知识资产库（cn_kis_audit，只读）
PGPASSWORD=cn_kis_2026 psql -h localhost -U cn_kis -d cn_kis_audit

# PostgreSQL superuser
sudo -u postgres psql
```

### 5.2 本地开发经 SSH 隧道

```bash
# 建立隧道（V2.0 映射到本地 25432；V1.0 用 15432，避免冲突）
ssh -i /Users/aksu/Downloads/openclaw1.1.pem -f -N \
  -L 25432:127.0.0.1:5432 root@118.196.64.48

# 连接 V2.0
PGPASSWORD=<密码> psql -h 127.0.0.1 -p 25432 -U cn_kis -d cn_kis_v2

# 同隧道连接 V1.0 知识资产库（只读，迁移用）
PGPASSWORD=cn_kis_2026 psql -h 127.0.0.1 -p 25432 -U cn_kis -d cn_kis_audit

# 关闭隧道
pkill -f "ssh.*-L 25432"
```

### 5.3 本地 .env 配置（经 SSH 隧道开发 V2.0 时）

```bash
DB_NAME=cn_kis_v2
DB_USER=cn_kis
DB_PASSWORD=<密码见服务器 /opt/cn-kis-v2/backend/.env>
DB_HOST=127.0.0.1
DB_PORT=25432

# 可选：同时配置 V1 只读连接（用于知识资产迁移命令）
DB_V1_NAME=cn_kis_audit
DB_V1_USER=cn_kis
DB_V1_PASSWORD=cn_kis_2026
DB_V1_HOST=127.0.0.1
DB_V1_PORT=25432
```

---

## 六、数据库资产保护规则

| 数据库 | V2.0 访问规则 | 说明 |
|--------|-------------|------|
| `cn_kis_v2` | ✅ **完全控制** | V2.0 唯一可写数据库 |
| `cn_kis_audit` | ⚠️ **只读**（迁移时） | V1.0 知识资产，迁移完成前只读读取 |
| `cn_kis` | ❌ **严禁写入** | V1.0 生产系统 |
| `cn_kis_mini` | ❌ **严禁访问** | 小程序独立系统，与 V2.0 无关 |

---

## 七、快速诊断命令

```bash
# 一次性检查所有数据库大小
ssh -i /Users/aksu/Downloads/openclaw1.1.pem root@118.196.64.48 \
  "sudo -u postgres psql -c '\l+'"

# 检查 cn_kis_v2 表数量（应 >= 366）
ssh -i /Users/aksu/Downloads/openclaw1.1.pem root@118.196.64.48 \
  "sudo -u postgres psql -d cn_kis_v2 -c \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public';\""

# 检查 pgvector 激活状态（应显示 vector 0.6.0）
ssh -i /Users/aksu/Downloads/openclaw1.1.pem root@118.196.64.48 \
  "sudo -u postgres psql -d cn_kis_v2 -c '\dx vector'"

# 检查 V2.0 Gunicorn 进程
ssh -i /Users/aksu/Downloads/openclaw1.1.pem root@118.196.64.48 \
  "ps aux | grep gunicorn | grep 8002"

# 检查 Redis 各库使用情况（V1.0=db0，V2.0=db1）
ssh -i /Users/aksu/Downloads/openclaw1.1.pem root@118.196.64.48 \
  "redis-cli info keyspace"
```

---

## 八、注意事项

1. **密码不得提交到 Git**：实际密码保存在服务器 `/opt/cn-kis-v2/backend/.env`（已在 `.gitignore` 中），本文档不记录真实密码
2. **共用 PG 用户**：V2.0 目前与 V1.0 共用 `cn_kis` 用户，该用户同时拥有 `cn_kis` 和 `cn_kis_v2` 数据库的所有权，这是**有意的设计**（便于迁移期间只读访问 V1 库）
3. **Redis 库号分离**：V1.0 用 `redis/0`（976,427 条缓存键），V2.0 用 `redis/1`，完全不冲突
4. **pgvector 已激活**：`cn_kis_v2` 中已执行 `CREATE EXTENSION vector;`，无需重复操作
5. **V1 只读访问**：V2.0 迁移知识资产时通过同一 `cn_kis` 用户连接 `cn_kis_audit`，使用 `DB_V1_*` 环境变量区分
