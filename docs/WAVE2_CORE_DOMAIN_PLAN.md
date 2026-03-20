# Wave 2 规划：API 壳与核心业务主干

> 波次状态：规划完成，待 Wave 1 验收后执行
> 交付门槛：至少一条端到端业务主链可运行（protocol → visit → subject → workorder）

---

## 一、Wave 2 目标

在 Wave 1 认证权限底座之上，建立核心业务能力：

1. Django Ninja API 壳与全局中间件
2. 方案（Protocol）管理
3. 访视（Visit）管理
4. 受试者（Subject）管理
5. EDC 数据录入
6. 工单（Workorder）管理
7. 最小飞书数据同步（`feishu_sync`）
8. 电子签名（`signature`）

---

## 二、迁移文件清单

### V2 目标目录结构

```
backend/apps/
  core_domains/
    protocol/       <- 原 apps/protocol/
    visit/          <- 原 apps/visit/
    subject/        <- 原 apps/subject/（整体迁入，后续按能力拆分）
    edc/            <- 原 apps/edc/
    workorder/      <- 原 apps/workorder/
    signature/      <- 原 apps/signature/
  integrations/
    feishu_sync/    <- 原 apps/feishu_sync/（最小化版本）
```

### 迁移文件清单

| V1 模块 | V2 路径 | 迁移策略 |
|---------|---------|---------|
| `apps/protocol/` | `apps/core_domains/protocol/` | 原样迁移 |
| `apps/visit/` | `apps/core_domains/visit/` | 原样迁移 |
| `apps/subject/` | `apps/core_domains/subject/` | 整体迁移，后续拆分 |
| `apps/edc/` | `apps/core_domains/edc/` | 原样迁移 |
| `apps/workorder/` | `apps/core_domains/workorder/` | 原样迁移 |
| `apps/signature/` | `apps/core_domains/signature/` | 原样迁移 |
| `apps/feishu_sync/` | `apps/integrations/feishu_sync/` | 最小化版本 |
| `backend/urls.py` | `backend/urls.py` | **重构**：按域聚合路由 |
| `backend/settings.py` | `backend/settings.py` | 从 V1 整理并清洁化 |

---

## 三、URL 路由重构（重点）

V1 的 `urls.py` 是超大聚合入口，V2 应按域聚合：

### V2 urls.py 结构

```python
# V2 urls.py — 按域聚合路由
from ninja import NinjaAPI

api = NinjaAPI(
    title="CN KIS V2.0 API",
    version="2.0.0",
    urls_namespace="api",
)

# Wave 1: 认证与权限
api.add_router('/auth/', identity_router, tags=['认证授权'])
api.add_router('/rbac/', rbac_router, tags=['权限管理'])

# Wave 2: 核心业务主干
api.add_router('/protocol/', protocol_router, tags=['方案管理'])
api.add_router('/visit/', visit_router, tags=['访视管理'])
api.add_router('/subject/', subject_router, tags=['受试者'])
api.add_router('/edc/', edc_router, tags=['EDC'])
api.add_router('/workorder/', workorder_router, tags=['工单'])
api.add_router('/signature/', signature_router, tags=['电子签名'])

# Wave 3: 知识与集成
api.add_router('/knowledge/', knowledge_router, tags=['知识库'])
api.add_router('/feishu/', feishu_router, tags=['飞书集成'])

# 从 workstations.yaml 动态读取（不硬编码）
```

### 核心要求

- 不再硬编码工作台列表，必须从 `backend/configs/workstations.yaml` 读取
- 中间件：JWT 认证、请求日志、权限校验统一在 API 壳层处理
- 健康检查：`/api/v1/health` 保持不变

---

## 四、subject 模块重构策略

`apps/subject/` 在 V1 中跨多个工作台职责，V2 策略：

| 阶段 | 操作 |
|------|------|
| Wave 2 初期 | **整体迁移**到 `core_domains/subject/`，不拆分 |
| Wave 2 稳定后 | 按职责物理拆分：`subject_core`（共享）、`reception_subject`（接待台）、`recruitment_subject`（招募台）|

### 当前 subject 模块文件结构

```
apps/subject/
  api.py               主 API 入口
  api_execution.py     执行台相关
  api_loyalty.py       受试者档案
  api_my.py            我的受试者视图
  api_prescreening.py  预筛
  api_questionnaire.py 问卷
  api_reception.py     接待
  api_recruitment.py   招募
  models.py            核心模型
  migrations/          26+ 个迁移文件
```

---

## 五、数据库迁移策略

### 迁移文件原则

- 全部迁移文件原样复制，保持迁移历史
- 若有迁移冲突（如 V1 已有 merge 迁移），在 V2 中整理为干净的线性历史
- `squash` 操作：Wave 2 稳定后，考虑对早期迁移执行 squash 压缩

### 已知风险

| 风险 | 说明 | 缓解措施 |
|------|------|---------|
| subject 迁移冲突 | V1 中已有 `0026_merge` / `0027_merge` | 在 V2 中整理为干净历史 |
| 迁移假执行 | V1 有 `migrate_fake_on_conflict.py` | V2 不允许此类脚本，迁移必须干净 |
| 应用名变化 | V1 `apps/subject` → V2 `apps/core_domains/subject` | 在 `AppConfig.name` 中保持一致，或整理迁移历史 |

---

## 六、settings.py 整洁化

V2 `settings.py` 相比 V1 做以下整洁化：

1. **移除**所有 `FEISHU_APP_ID_X` 多端变量（统一使用 `FEISHU_PRIMARY_APP_ID`）
2. **保留** `FEISHU_WORKSTATION_APP_IDS`（工作台 app_id 映射，保留归属校验能力）
3. **从 YAML 加载**工作台配置，不在 settings 中硬编码工作台列表
4. **清除** merge conflict 标记（V1 settings.py 历史上有 `<<<<<<< HEAD` 污染）

---

## 七、Wave 2 执行步骤

### Step 1: 建立 core_domains 目录
```bash
mkdir -p backend/apps/core_domains/{protocol,visit,subject,edc,workorder,signature}
mkdir -p backend/apps/integrations/feishu_sync
```

### Step 2: 复制各模块文件
```bash
# 对每个模块：
cp -r backend/apps/protocol/* backend/apps/core_domains/protocol/
cp -r backend/apps/visit/* backend/apps/core_domains/visit/
# ...以此类推
```

### Step 3: 更新 apps.py 中的 app 名称
```python
# 每个模块的 AppConfig.name 保持向后兼容
class ProtocolConfig(AppConfig):
    name = 'apps.core_domains.protocol'
    label = 'protocol'  # 确保与 V1 迁移历史中的 app_label 一致
```

### Step 4: 建立 V2 urls.py
```bash
# 按域聚合路由，从 workstations.yaml 动态读取工作台配置
```

### Step 5: 端到端测试
```bash
# 在阿里云测试环境：
# 1. 飞书登录
# 2. 获取方案列表
# 3. 创建访视
# 4. 查看受试者
# 5. 填写 EDC 表单
# 6. 创建工单
```

---

## 八、Wave 2 验收标准

- [ ] `protocol` API：CRUD 可用，权限校验通过
- [ ] `visit` API：访视计划、执行状态可用
- [ ] `subject` API：受试者档案、状态流转可用
- [ ] `edc` API：数据录入、查询可用
- [ ] `workorder` API：工单创建、分配、关闭可用
- [ ] 跨模块主链：`protocol → visit → subject → workorder` 端到端可运行
- [ ] 权限校验：未授权用户访问返回 403
- [ ] 数据范围：项目级数据隔离可验证
- [ ] 迁移无冲突：`python manage.py migrate` 成功，无 fake 操作
- [ ] `/api/v1/health` 返回 200，包含各域状态
