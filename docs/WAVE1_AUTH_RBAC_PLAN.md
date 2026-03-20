# Wave 1 规划：认证与权限底座

> 波次状态：规划完成，待开始执行
> 交付门槛：V2 可完成飞书登录 + token 自动刷新 + 基础权限矩阵

---

## 一、Wave 1 目标

建立 V2 认证与权限底座，实现：

1. 飞书 OAuth 登录全流程（子衿主授权）
2. access_token / refresh_token 持久化（防覆盖策略）
3. RBAC 权限矩阵（账号/角色/权限/工作台配置）
4. 工作台可见性与菜单范围控制
5. 数据范围过滤（global/project/personal）

---

## 二、迁移文件清单

### 必须优先迁移（认证红线文件）

| 文件 | 说明 | 迁移策略 |
|------|------|---------|
| `backend/apps/identity/models.py` | Account/Role/Permission/AccountRole/SessionToken/AccountWorkstationConfig | 原样迁移，V2 路径保持 identity/ |
| `backend/apps/identity/services.py` | 核心认证逻辑，含飞书 OAuth、JWT、nonce 防重放、`_save_feishu_user_token` | **完整原样迁移，不裁剪** |
| `backend/apps/identity/authz.py` | 授权校验装饰器与逻辑 | 原样迁移 |
| `backend/apps/identity/filters.py` | `get_data_scope()` / `filter_queryset_by_scope()` | 原样迁移 |
| `backend/apps/identity/decorators.py` | API 权限装饰器 | 原样迁移 |
| `backend/apps/identity/api.py` | 认证 API（登录/登出/刷新/验证） | 原样迁移 |
| `backend/apps/secretary/models.py` | FeishuUserToken（token 持久化核心） | 迁入 `identity` 模块或保留 secretary/ |
| `backend/apps/secretary/feishu_fetcher.py` | `get_valid_user_token()` 含防覆盖刷新逻辑 | **完整原样迁移，不裁剪** |
| `backend/libs/feishu_client.py` | 飞书 Open API 封装 | 迁入 `backend/libs/` |
| `packages/feishu-sdk/` | 前端飞书 SDK（OAuth URL 生成） | 原样迁移 |

### 关联文件（Wave 1 中同步迁移）

| 文件 | 说明 |
|------|------|
| `backend/apps/identity/migrations/` | 全部迁移文件（0001~最新） |
| `backend/settings.py` 中的 identity 相关配置 | FEISHU_PRIMARY_APP_ID / JWT_SECRET / JWT_EXPIRATION_HOURS |
| `backend/config/celery_config.py` | token 健康检查任务配置 |
| `backend/apps/secretary/tasks.py` 中的 token 相关任务 | batch_refresh_tokens 等 |

---

## 三、关键约束（来自迁移章程）

### 飞书主授权

```python
# settings.py 中必须保留
FEISHU_PRIMARY_APP_ID = 'cli_a98b0babd020500e'
FEISHU_PRIMARY_AUTH_FORCE = True
```

### refresh_token 防覆盖（`_save_feishu_user_token` 核心逻辑）

```python
# ✅ 正确（必须保留）
effective_refresh = refresh_token if refresh_token else (
    existing.refresh_token if existing else ''
)
defaults = {
    'refresh_token': effective_refresh,  # 绝不用空值覆盖
    'refresh_expires_at': now + timedelta(seconds=_refresh_exp_seconds),  # 不允许 None
}

# ❌ 禁止（历史错误，不得在 V2 中重现）
defaults = {
    'refresh_token': refresh_token,  # 当 refresh_token='' 时会覆盖旧值
}
```

### get_valid_user_token 刷新逻辑

```python
# ✅ 正确（必须保留）
new_refresh = new_data.get('refresh_token', '')
if new_refresh:  # 只有有新 refresh_token 才更新
    token_record.refresh_token = new_refresh

# ✅ pre-expiry 刷新窗口：1 小时（非 5 分钟）
pre_expiry_buffer = timedelta(hours=1)

# ✅ refresh_token 剩余 < 7 天时主动续期
```

---

## 四、RBAC 权限矩阵设计

### 5 维权限体系

| 维度 | 说明 | 模型/字段 |
|------|------|---------|
| workstation | 可进入哪些工作台 | `AccountWorkstationConfig.workstation` + mode |
| menu | 可见哪些菜单 | `AccountWorkstationConfig.enabled_menus` + mode=pilot |
| action | 可执行哪些功能操作 | `Permission.module + function + action` |
| project_scope | 可访问哪些项目 | `AccountRole.project_id`（project-level role）|
| data_type_scope | 可访问哪些数据类型 | `Permission.scope` + `get_data_scope()` |

### 数据范围过滤逻辑

```python
# get_data_scope() 返回以下之一：
# - 'global': 可访问所有数据
# - 'project': 只能访问自己参与的项目数据
# - 'personal': 只能访问自己创建/拥有的数据
```

### 工作台默认角色映射（首登兜底）

```python
WORKSTATION_BASELINE_ROLE_MAP = {
    'secretary': 'viewer',
    'finance': 'finance',
    'research': 'researcher',
    'execution': 'clinical_executor',
    'reception': 'receptionist',
    'quality': 'qa',
    'hr': 'hr',
    'crm': 'sales',
    'recruitment': 'recruiter',
    'equipment': 'technician',
    'material': 'technician',
    'facility': 'technician',
    'evaluator': 'evaluator',
    'lab-personnel': 'lab_personnel',
    'ethics': 'qa',
    'control-plane': 'it_specialist',
}
```

---

## 五、迁移执行步骤

### Step 1: 建立 identity 模块骨架
```bash
mkdir -p backend/apps/identity/migrations
# 复制 models.py, services.py, authz.py, filters.py, decorators.py, api.py
# 复制全部 migrations/ 文件
```

### Step 2: 迁移 feishu 相关模块
```bash
# secretary/models.py 中的 FeishuUserToken 迁入 identity 或保留 secretary
# 复制 feishu_fetcher.py（含 get_valid_user_token）
# 复制 libs/feishu_client.py
```

### Step 3: 迁移 Celery token 健康检查
```bash
# 复制 config/celery_config.py（小写 key）
# 复制 secretary/tasks.py 中 token 相关任务
# 确认 Beat 调度 token 健康检查
```

### Step 4: 建立 settings.py identity 配置
```python
# 必须包含：
FEISHU_PRIMARY_APP_ID = os.getenv('FEISHU_APP_ID', 'cli_a98b0babd020500e')
FEISHU_PRIMARY_AUTH_FORCE = True
JWT_SECRET = os.getenv('JWT_SECRET', '')
JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))
```

### Step 5: 验证
```bash
# 在阿里云测试环境
python manage.py migrate
python manage.py runserver 8001
# 访问飞书 OAuth URL，完成登录流程
# 检查数据库：SELECT * FROM t_feishu_user_token;
# 验证 refresh_token 非空且不被空值覆盖
```

---

## 六、Wave 1 验收标准

- [ ] V2 飞书登录全流程可完成（OAuth → callback → JWT 签发）
- [ ] `t_feishu_user_token` 表中 refresh_token 不为空（`refresh_len > 0`）
- [ ] 登录 48 小时后无需重新授权（refresh 自动执行）
- [ ] `t_account` / `t_role` / `t_permission` 表可读写
- [ ] 工作台可见性根据角色动态控制（`AccountWorkstationConfig`）
- [ ] 数据范围过滤（global/project/personal）测试通过
- [ ] Celery Beat token 健康检查任务正常调度
- [ ] 迁移数据库无冲突（`python manage.py migrate` 成功执行）
