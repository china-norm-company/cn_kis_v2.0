# 火山云生产部署 Runbook — CN KIS V2.0

> ⚠️ 生产部署为**受控手动操作**。执行前必须在阿里云测试环境完成完整验收。

---

## 前置条件

在执行生产部署之前，必须：

- [ ] 阿里云测试环境的健康检查通过（`/api/v1/health` 返回 200）
- [ ] V2 能力对等清单对应波次验收通过
- [ ] 知识资产完整性校验通过（Wave 3 后）
- [ ] PR 已合并到 `main` 分支
- [ ] 至少一位系统负责人 Sign-off

---

## 部署步骤

### 1. 连接生产服务器

```bash
ssh -i deploy/secrets/prod_key.pem ubuntu@118.196.64.48
```

### 2. 备份当前版本

```bash
cd /path/to/cn_kis_v2_prod
git log --oneline -3  # 记录当前版本 commit hash

# 备份数据库（选做，视风险评估）
pg_dump -U postgres cn_kis_prod > /backups/cn_kis_prod_$(date +%Y%m%d_%H%M%S).sql
```

### 3. 拉取最新代码

```bash
git fetch origin
git checkout main
git pull origin main
```

### 4. 更新依赖（如有变化）

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 5. 执行数据库迁移

```bash
cd backend
python manage.py migrate --noinput
```

> ⚠️ 如迁移包含不可回滚的操作（如 DROP COLUMN），必须在阶段 2 备份后执行，并确认有回滚迁移。

### 6. 收集静态文件

```bash
python manage.py collectstatic --noinput
```

### 7. 重启服务

```bash
sudo systemctl restart cn-kis-v2-backend
sudo systemctl restart cn-kis-v2-celery-worker
sudo systemctl restart cn-kis-v2-celery-beat
```

### 8. 生产健康检查

```bash
curl -f http://118.196.64.48/api/v1/health
# 或通过域名
curl -f https://your-prod-domain.com/api/v1/health
```

### 9. 验证知识资产完整性

```bash
python manage.py shell -c "
from apps.secretary.models import PersonalContext
from apps.knowledge.models import KnowledgeEntry
print(f'PersonalContext: {PersonalContext.objects.count()}')
print(f'KnowledgeEntry: {KnowledgeEntry.objects.count()}')
"
```

对比部署前记录的数字，确认无数据丢失。

---

## 回滚步骤

### 代码层回滚

```bash
# 回滚到上一个 commit
git checkout <上一个稳定版本的 commit-hash>
sudo systemctl restart cn-kis-v2-backend
```

### 数据库迁移回滚

```bash
# 查看迁移历史
python manage.py showmigrations <app_name>

# 回滚到指定迁移
python manage.py migrate <app_name> <migration-name>
```

### 紧急回滚（服务完全不可用）

```bash
# 停止服务
sudo systemctl stop cn-kis-v2-backend
sudo systemctl stop cn-kis-v2-celery-worker

# 恢复数据库备份（如已备份）
psql -U postgres cn_kis_prod < /backups/cn_kis_prod_YYYYMMDD_HHMMSS.sql

# 回滚代码
git checkout <上一个稳定版本 hash>

# 重启
sudo systemctl start cn-kis-v2-backend
sudo systemctl start cn-kis-v2-celery-worker
sudo systemctl start cn-kis-v2-celery-beat
```

---

## 部署后验证清单

- [ ] `/api/v1/health` 返回 200
- [ ] 飞书登录可完成
- [ ] PersonalContext 记录数不减少
- [ ] KnowledgeEntry 记录数不减少
- [ ] Celery Worker 正在运行：`systemctl status cn-kis-v2-celery-worker`
- [ ] Celery Beat 正在运行（含 token 健康检查）：`systemctl status cn-kis-v2-celery-beat`
