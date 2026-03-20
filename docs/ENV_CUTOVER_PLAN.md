# Wave 0.5（env-cutover）规划：双环境切换、禁用任务与回滚验证

> 本文档覆盖"规划阿里云测试与火山云生产双环境切换、禁用任务与回滚验证"这一 todo 的完整实施方案。
> 可在 Wave 0 完成后立即准备环境，与 Wave 1-3 并行推进。

---

## 一、双环境现状

### 阿里云测试环境（当前状态）

| 项目 | V1 配置 | V2 目标配置 |
|------|---------|------------|
| 主机 | test-guide.data-infact.com | test-guide.data-infact.com（复用） |
| SSH 用户 | wuxianyu | wuxianyu（复用） |
| 工作目录 | /home/wuxianyu/kis_0310 | /home/wuxianyu/cn_kis_v2 |
| 服务启动 | Docker + `build_backend_image_only_under_root_path.sh` | systemd 服务（简化管理） |
| 健康检查端口 | 9001 | 9001（复用，保持 CI 兼容） |
| 健康接口 | `/api/v1/health` | `/api/v1/health`（不变） |

### 火山云生产环境（当前状态）

| 项目 | 配置 |
|------|------|
| 主机 | 118.196.64.48 |
| 域名 | 配置中（见 deploy/.env.volcengine.plan-a） |
| 服务管理 | gunicorn + celery worker + celery beat（systemd） |
| 知识资产 | PostgreSQL + pgvector + Qdrant |
| 飞书采集 | 正式运行（持续采集） |

---

## 二、阿里云测试环境部署步骤

### 2.1 首次部署 V2（手动）

```bash
# 1. SSH 连接阿里云
ssh wuxianyu@test-guide.data-infact.com

# 2. 创建 V2 工作目录
mkdir -p /home/wuxianyu/cn_kis_v2
cd /home/wuxianyu/cn_kis_v2

# 3. 克隆 V2 仓库
git clone git@github.com:china-norm-company/cn_kis_v2.0.git .

# 4. 配置 Python 虚拟环境
python3 -m venv ../.venv_v2
source ../.venv_v2/bin/activate
pip install -r backend/requirements.txt

# 5. 配置 .env（从 GitHub Secrets 或手动创建）
cp backend/.env.example backend/.env
# 编辑 .env，确保包含：
# CELERY_PRODUCTION_TASKS_DISABLED=true
# KNOWLEDGE_WRITE_ENABLED=false
# 测试专用数据库配置

# 6. 初始化数据库
cd backend
python manage.py migrate

# 7. 启动服务（使用 gunicorn）
gunicorn wsgi:application --bind 0.0.0.0:9001 --workers 4 --daemon
```

### 2.2 配置 systemd 服务（推荐）

```bash
# /etc/systemd/system/cn-kis-v2-backend.service
[Unit]
Description=CN KIS V2 Backend
After=network.target

[Service]
Type=simple
User=wuxianyu
WorkingDirectory=/home/wuxianyu/cn_kis_v2/backend
EnvironmentFile=/home/wuxianyu/cn_kis_v2/backend/.env
ExecStart=/home/wuxianyu/.venv_v2/bin/gunicorn wsgi:application \
  --bind 0.0.0.0:9001 \
  --workers 4 \
  --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# /etc/systemd/system/cn-kis-v2-celery-worker.service
[Unit]
Description=CN KIS V2 Celery Worker
After=network.target

[Service]
Type=simple
User=wuxianyu
WorkingDirectory=/home/wuxianyu/cn_kis_v2/backend
EnvironmentFile=/home/wuxianyu/cn_kis_v2/backend/.env
ExecStart=/home/wuxianyu/.venv_v2/bin/celery -A celery_app worker \
  --loglevel=info \
  --concurrency=2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# /etc/systemd/system/cn-kis-v2-celery-beat.service
[Unit]
Description=CN KIS V2 Celery Beat
After=network.target

[Service]
Type=simple
User=wuxianyu
WorkingDirectory=/home/wuxianyu/cn_kis_v2/backend
EnvironmentFile=/home/wuxianyu/cn_kis_v2/backend/.env
ExecStart=/home/wuxianyu/.venv_v2/bin/celery -A celery_app beat \
  --loglevel=info
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 2.3 自动部署（GitHub Actions）

后续 push `develop` 分支时，GitHub Actions 自动部署：

```
工作流：.github/workflows/backend-deploy-aliyun.yml
触发：push develop + backend/ 有改动
步骤：rsync → 写入 .env → 验证 CELERY_PRODUCTION_TASKS_DISABLED → migrate → restart → health check
```

---

## 三、测试环境禁用任务验证

### 3.1 必须禁用的生产采集任务

在测试环境 `.env` 中设置 `CELERY_PRODUCTION_TASKS_DISABLED=true`，以下任务不得执行：

```python
# 验证哪些任务被注册（连接测试环境执行）
celery -A celery_app inspect registered
```

不应出现的任务（测试环境）：
- `apps.secretary.tasks.sweep_feishu_full_history`
- `apps.secretary.tasks.incremental_feishu_sync`
- `apps.knowledge.tasks.run_ingestion_pipeline`
- `apps.knowledge.tasks.vectorize_bulk`
- `apps.knowledge.tasks.rebuild_embeddings`
- `apps.secretary.tasks.batch_refresh_tokens`（使用生产飞书凭证的版本）

### 3.2 验证脚本

```bash
# 执行此脚本验证测试环境隔离
ops/scripts/verify_test_env_isolation.sh
```

---

## 四、环境变量隔离验证

```bash
# ops/scripts/verify_env_isolation.sh

#!/bin/bash
# 验证测试环境未泄漏生产配置

ENV_FILE="${1:-.env}"
ERRORS=0

echo "=== 测试环境隔离验证 ==="

# 1. 生产采集任务必须禁用
if ! grep -q "CELERY_PRODUCTION_TASKS_DISABLED=true" "$ENV_FILE"; then
    echo "❌ CELERY_PRODUCTION_TASKS_DISABLED=true 未配置"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ CELERY_PRODUCTION_TASKS_DISABLED=true"
fi

# 2. 不得使用生产飞书 App ID
if grep -q "cli_a98b0babd020500e" "$ENV_FILE"; then
    echo "❌ 检测到生产飞书 App ID（cli_a98b0babd020500e），测试环境禁止使用！"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ 未使用生产飞书 App ID"
fi

# 3. 数据库连接不得指向生产
if grep -q "118.196.64.48" "$ENV_FILE"; then
    echo "❌ 检测到生产服务器 IP（118.196.64.48），测试环境禁止连接生产数据库！"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ 未使用生产数据库连接"
fi

# 4. 知识资产写入必须禁用
if grep -q "KNOWLEDGE_WRITE_ENABLED=true" "$ENV_FILE"; then
    echo "⚠️  KNOWLEDGE_WRITE_ENABLED=true（测试环境通常应为 false，请确认是否有意为之）"
else
    echo "✅ 知识资产写入未启用（只读保护生效）"
fi

if [ $ERRORS -eq 0 ]; then
    echo ""
    echo "✅ 测试环境隔离验证通过"
else
    echo ""
    echo "❌ 发现 $ERRORS 个问题，请修复后再部署"
    exit 1
fi
```

---

## 五、火山云生产回滚验证

### 5.1 回滚演练

在阿里云测试环境模拟回滚步骤：

```bash
# 1. 记录当前版本
git log --oneline -3

# 2. 模拟回滚到上一版本
git checkout HEAD~1
sudo systemctl restart cn-kis-v2-backend

# 3. 验证服务正常
curl -f http://test-guide.data-infact.com:9001/api/v1/health

# 4. 验证知识资产无变化
python ops/scripts/verify_knowledge_assets.py --compare ops/scripts/baseline.json

# 5. 恢复到最新版本
git checkout main
sudo systemctl restart cn-kis-v2-backend
```

### 5.2 数据库回滚演练（针对 Wave 2 以上含数据库迁移的波次）

```bash
# 1. 记录当前迁移状态
python manage.py showmigrations

# 2. 执行模拟迁移回滚（如回滚到 0007）
python manage.py migrate identity 0007

# 3. 验证功能退化是否可接受
curl /api/v1/health

# 4. 恢复迁移
python manage.py migrate identity
```

---

## 六、双环境切换时间线

```
Week 1  [Wave 0]  治理底座就绪，V2 仓库建立
                  ↓
        [env-prep] 阿里云测试环境 V2 首次部署（手动）
        [env-prep] 环境隔离验证脚本验证通过
                  ↓
Week 2  [Wave 1]  认证权限底座迁移 + 测试环境飞书登录验证
                  ↓
Week 3  [Wave 2]  核心业务主干迁移 + 端到端主链测试
                  ↓
Week 4  [Wave 3]  知识资产迁移 + 资产完整性核对
                  ↓
Week 5  [UAT]     用户验收测试（阿里云测试环境）
                  ↓
Week 6  [cutover] 火山云生产部署（受控手动，使用 Runbook）
```

---

## 七、验收标准

### 测试环境

- [ ] `https://test-guide.data-infact.com/api/v1/health` 返回 200
- [ ] GitHub Actions `backend-deploy-aliyun.yml` 自动部署成功
- [ ] `verify_env_isolation.sh` 执行通过（无生产配置泄漏）
- [ ] `CELERY_PRODUCTION_TASKS_DISABLED=true` 已验证生效
- [ ] 飞书登录可完成（使用测试飞书应用）
- [ ] 3 次回滚演练均验证成功

### 生产部署就绪（在以上均通过后）

- [ ] Wave 1-3 能力对等清单验收通过
- [ ] 知识资产完整性校验通过（与 V1 基准对比）
- [ ] 生产环境 `.env` 不含测试配置
- [ ] `CELERY_PRODUCTION_TASKS_DISABLED` 未设置或为 false（生产才运行采集任务）
- [ ] 系统负责人 Sign-off 确认
- [ ] V1 保持可回切状态（未关闭，保留 30 天）
