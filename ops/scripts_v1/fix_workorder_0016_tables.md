# 修复服务器缺少 t_evaluator_schedule_note / t_evaluator_schedule_attachment

## 原因
`django_migrations` 里已有 workorder 0016（及 0017/0018/0019）的记录，但库里没有对应表，多半是曾 `--fake` 或误插记录导致。

## 操作步骤（在服务器上执行）

### 1. 连到 PostgreSQL，删除错误迁移记录

```bash
# 若用部署脚本里的环境，先：
cd /opt/cn-kis/backend && source venv/bin/activate

# 用 Django 的 dbshell 或 psql 连到 cn_kis 库，执行：
```

```sql
-- 删除 workorder 0016～0019 的迁移记录，以便重新应用
DELETE FROM django_migrations
WHERE app = 'workorder'
  AND name IN (
    '0016_evaluator_schedule_import',
    '0017_schedule_note_equipment_project',
    '0018_schedule_note_room_no',
    '0019_rename_eval_sched_attach_acc_idx_t_evaluator_account_717e29_idx_and_more'
  );
```

用 psql 示例（按你实际账号/库名改）：

```bash
PGPASSWORD=cn_kis_2026 psql -h localhost -U cn_kis -d cn_kis -c "
DELETE FROM django_migrations
WHERE app = 'workorder'
  AND name IN (
    '0016_evaluator_schedule_import',
    '0017_schedule_note_equipment_project',
    '0018_schedule_note_room_no',
    '0019_rename_eval_sched_attach_acc_idx_t_evaluator_account_717e29_idx_and_more'
  );
"
```

### 2. 重新执行迁移

```bash
cd /opt/cn-kis/backend
source venv/bin/activate
export DJANGO_SETTINGS_MODULE=settings
# 若 .env 在 backend 下且需加载：
set -a && [ -f .env ] && source .env && set +a

python manage.py migrate workorder --noinput
```

### 3. 确认表已存在

```bash
python manage.py dbshell
```

在 dbshell 里：

```sql
\dt t_evaluator_schedule*
```

应能看到 `t_evaluator_schedule_note` 和 `t_evaluator_schedule_attachment`。
