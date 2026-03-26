# 鹿鸣·治理台 唯一化重构 — 验收测试说明

> **⚠️ 历史归档文档（2026-03-22）**
>
> 本文档描述的是 CN KIS V2.0 **第一阶段**迁移测试（`admin+iam → governance`，2026-03 早期）。  
> 该迁移随后被**第二阶段**重命名覆盖：`governance → admin`，当前系统工作台 key 已恢复为 `admin`。  
>
> **本文档内的以下断言针对已废弃的中间状态，不适用于当前系统：**  
> - 期望 `/governance/` 路径可达（当前路径为 `/admin/`）  
> - 期望 `visible_workbenches` 含 `governance`（当前为 `admin`）  
> - 期望 `callback workstation=governance` 成功（当前为 `admin`）  
>
> **当前有效的验收文档**：[`docs/LAUNCH_GOVERNANCE_90D_ACCEPTANCE_AND_TEST_SYSTEM.md`](LAUNCH_GOVERNANCE_90D_ACCEPTANCE_AND_TEST_SYSTEM.md)  
> **工作台事实源**：[`backend/configs/workstations.yaml`](../backend/configs/workstations.yaml)（19 个，`admin` 为鹿鸣·治理台 key）

---

## 背景（历史）

CN KIS V2.0 第一阶段将原有的 `鹿鸣·行政台`（key: `admin`）和 `枢衡·权控台`（key: `iam`）
合并为统一的 `鹿鸣·治理台`（临时 key: `governance`，路径 `/governance`）。

随后在第二阶段，该工作台 key 从 `governance` 重命名为 `admin`，路径从 `/governance` 恢复为 `/admin`。
目前 `governance` 和 `iam` 均为 **LEGACY（废弃）** 标识，仅在 `workstation_keys.py` 中保留用于历史数据兼容。

本目录下的测试套件记录第一阶段迁移验收，已不代表当前系统状态：
- 旧路径彻底消亡，不再可访问
- 新治理台完整可用（13 个页面、OAuth、RBAC、API）
- 全工作台（19 个）未受破坏

---

## 测试文件一览

| 文件 | 类型 | 覆盖范围 |
|------|------|----------|
| `e2e/governance-migration-regression.spec.ts` | Playwright E2E | 旧路径消亡、新路径就绪、RBAC、门户链接、API 回归、19 台可达性 |
| `e2e/governance-workstation-features.spec.ts` | Playwright E2E | governance 13 个页面功能、SPA 路由隔离、跨工作台跳转、埋点 |
| `ops/scripts/governance_migration_api_test.py` | Python HTTP | 后端 API 迁移回归（无浏览器依赖，可在服务器直接运行） |
| `ops/scripts/run_governance_acceptance.sh` | Shell | 一键运行上述全部测试 |

---

## 测试套件说明

### `governance-migration-regression.spec.ts`（6 个 Suite，32 个测试）

| Suite | 测试目标 |
|-------|---------|
| **Suite A** 旧路径消亡 | `/admin/`、`/iam/` 及其子路径返回 404/30x；HTML 无旧字样；profile 无旧 key |
| **Suite B** 新路径就绪 | `/governance/` 返回 200；HTML 含品牌字样；OAuth URL 携带独立 App ID |
| **Suite C** RBAC/profile | visible_workbenches 含 governance；菜单 key 正确；callback 旧 key 被拒绝 |
| **Suite D** 门户跳转 | secretary 门户无 /admin/ /iam/ 链接；治理台内无旧链接 |
| **Suite E** 后端 API | roles/permissions/token-health/audit/logs 端点均存在 |
| **Suite F** 全台可达性 | 全部 19 个工作台 HTTP 可达；没有旧路径污染 |

### `governance-workstation-features.spec.ts`（3 个 Suite，20 个测试）

| Suite | 测试目标 |
|-------|---------|
| **Suite G** 13 页面功能 | 通过 localStorage 注入 Token，逐页验证加载、UI 元素、API 调用 |
| **Suite H** SPA 路由隔离 | 旧 hash 路由（#/admin、#/iam）在 SPA 内不产生旧内容；侧边栏无旧链接；埋点 key 正确 |
| **Suite I** 跨工作台跳转 | 门户→治理台链接正确；治理台外链格式正确；登出不重定向到旧路径 |

### `governance_migration_api_test.py`（5 个 Group，22 个测试）

| Group | 测试目标 |
|-------|---------|
| **Group 1** 旧 key 消亡 | workstation=admin/iam callback 被拒绝；profile 无旧 key |
| **Group 2** 新端点就绪 | profile 含 governance；菜单含 13 项；callback 正确 |
| **Group 3** RBAC API | 角色列表、权限列表、账号列表、workstation-config |
| **Group 4** 治理台 API | token-health；audit/logs 200；DELETE/PATCH → 405/403 |
| **Group 5** callback 参数 | 各工作台使用正确 App ID；force_primary 正常替换 |

---

## 快速运行

### 方案一：一键验收（推荐）

```bash
cd /Users/aksu/Cursor/CN_KIS_V2.0
./ops/scripts/run_governance_acceptance.sh
```

### 方案二：仅 API 测试（无浏览器，最快）

```bash
# 本地运行
python3 ops/scripts/governance_migration_api_test.py

# 指定服务器
TEST_SERVER=http://118.196.64.48 python3 ops/scripts/governance_migration_api_test.py
```

### 方案三：仅 E2E 回归（需 Playwright）

```bash
# 安装 Playwright（如未安装）
pnpm exec playwright install chromium

# 运行迁移回归
TEST_SERVER=http://118.196.64.48 pnpm exec playwright test e2e/governance-migration-regression.spec.ts

# 运行功能验收
TEST_SERVER=http://118.196.64.48 pnpm exec playwright test e2e/governance-workstation-features.spec.ts

# 带 headed 模式（可视化）
HEADED=1 TEST_SERVER=http://118.196.64.48 pnpm exec playwright test e2e/governance-workstation-features.spec.ts
```

### 方案四：指定 Suite 运行

```bash
# 仅跑 Suite A（旧路径消亡）
pnpm exec playwright test e2e/governance-migration-regression.spec.ts --grep "Suite A"

# 仅跑 Suite G（页面功能）
pnpm exec playwright test e2e/governance-workstation-features.spec.ts --grep "Suite G"
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TEST_SERVER` | `http://118.196.64.48` | 测试目标服务器 |
| `LIVE_AUTH_TOKEN` | 内置调试 Token | 用于 API 认证的 JWT |
| `LIVE_TOKEN` | 同上（Python 脚本） | Python 脚本的 JWT |
| `SUITE` | `all` | 运行套件选项：`api` / `e2e` / `regression` / `features` / `all` |
| `HEADED` | `0` | `1` 时以 headed 模式运行 Playwright |

---

## 验收出口标准（历史快照，已废弃）

> **以下条件描述第一阶段迁移的出口标准，不适用于当前系统。**  
> 当前有效出口标准见 [`docs/LAUNCH_GOVERNANCE_90D_ACCEPTANCE_AND_TEST_SYSTEM.md`](LAUNCH_GOVERNANCE_90D_ACCEPTANCE_AND_TEST_SYSTEM.md)。

所有以下断言通过，视为重构验收完成（第一阶段，已过时）：

- [ ] `/admin/` 和 `/iam/` 返回 404 或 30x（不服务旧工作台 HTML）
- [ ] `/governance/` 返回 200，HTML 含 "鹿鸣" 或 "治理台"
- [ ] `/governance/` 的 OAuth 使用独立 App ID `cli_a937515668b99cc9`（非子衿 `cli_a98b0babd020500e`）
- [ ] `/auth/profile` 的 `visible_workbenches` 含 `governance`，不含 `admin` / `iam`
- [ ] `/auth/profile` 的 `visible_menu_items` 含 `governance` key，不含 `admin` / `iam` key
- [ ] `workstation=admin` 和 `workstation=iam` 的 callback 被后端拒绝
- [ ] `workstation=governance` + `cli_a937515668b99cc9` 的 callback 无 `AUTH_APP_WORKSTATION_MISMATCH`
- [ ] 角色列表非空，角色名 `admin` 保留（区别于工作台 key）
- [ ] `DELETE /audit/logs/:id` 返回 405 或 403（审计不可变）
- [ ] 全部 19 个工作台 HTTP 可达
- [ ] 治理台 13 个页面在 SPA 内均可路由

---

## 截图产物

测试运行后，截图保存在：

```
tests/ui-acceptance/screenshots-governance/
├── gov-01-dashboard.png
├── gov-02-users.png
├── gov-03-roles.png
├── gov-04-permissions.png
├── gov-05-sessions.png
├── gov-06-activity.png
├── gov-07-feature-usage.png
├── gov-08-ai-usage.png
├── gov-09-audit.png
├── gov-10-workstations.png
├── gov-11-pilot-config.png
├── gov-12-feishu.png
├── gov-13-config.png
├── cross-01-portal.png
└── acceptance_report_YYYYMMDD_HHMMSS.txt
```

---

## 已知限制

1. **Suite G（页面功能）**：通过 localStorage 注入 Token 绕过飞书 OAuth，Token 过期后需更新 `LIVE_AUTH_TOKEN`
2. **Suite B-3（OAuth URL）**：若服务器已有有效 Session，不会触发 OAuth 流程，需在无 Cookie 的隔离浏览器上下文中运行
3. **Python API 测试**：使用内置调试 Token（2099 年到期），生产环境需替换

---

_生成时间：2026-03-22_（第一阶段迁移记录）  
_废弃时间：2026-03-26_（governance → admin 重命名后）  
_当前适用版本文档：`docs/LAUNCH_GOVERNANCE_90D_ACCEPTANCE_AND_TEST_SYSTEM.md`_
