# 洞明工作台 Headed 验收报告

> 执行日期：2026-03-22
> 执行方式：Headed 浏览器验收
> 目标环境：`http://118.196.64.48`

---

## 1. 验收范围

本次验收覆盖两部分：

1. 独立 OAuth / 授权隔离验证
2. 洞明工作台 16 个页面 + 12 个核心 API 的 Headed 验收

相关基线文档：

- `docs/DONGMING_WORKSTATION_USER_GUIDE.md`
- `docs/DONGMING_ACCEPTANCE_STANDARD.md`
- `docs/DONGMING_TEST_SYSTEM.md`

---

## 2. 执行脚本

### 2.1 OAuth 隔离验证

- `e2e/workstation-auth-isolation.spec.ts`

执行方式：

```bash
HEADED=1 pnpm e2e e2e/workstation-auth-isolation.spec.ts --grep "data-platform"
```

### 2.2 洞明专用 Headed 验收

- `tests/ui-acceptance/run-dongming-headed-acceptance.mjs`

执行方式：

```bash
node tests/ui-acceptance/run-dongming-headed-acceptance.mjs
```

---

## 3. 结果摘要

### 3.1 OAuth 隔离验证结果

结果：

- `2 passed`
- `1 flaky`
- `1 failed`

关键观察：

- Data Platform 首页 HTML 可访问，标题正常
- 重试后 bundle 级检测确认洞明前端仍包含正确独立 App ID：`cli_a93753da2c381cef`
- 首次抓 OAuth URL 时误抓到了飞书页面中的 `app_id=12`，属于现有测试脚本的抓取噪声，不等同于洞明配置错误
- 失败项 `C-4 data-platform 前端文件故障不影响 iam` 与洞明本次改动无直接关系，是现有 IAM 页面标识检测断言未命中

结论：

- 洞明“独立 App ID 注入”基本成立
- 现有 OAuth 隔离脚本对 Data Platform 的 URL 抓取逻辑存在误判噪声

---

### 3.2 洞明专用 Headed 验收结果

结果：

- 页面通过：`8 / 16`
- API 通过：`7 / 12`

证据文件：

- `tests/ui-acceptance/screenshots-dongming-headed/dongming-headed-report.json`
- `tests/ui-acceptance/screenshots-dongming-headed/*.png`

---

## 4. API 验收明细

### 4.1 通过

- `GET /data-platform/dashboard`
- `GET /data-platform/catalog/schema`
- `GET /data-platform/classification/registry`
- `GET /data-platform/pipelines/schedule`
- `GET /data-platform/storage/stats`
- `GET /data-platform/backup/status`
- `GET /data-platform/topology/health`

### 4.2 未通过

- `GET /data-platform/domains` → `404`
- `GET /data-platform/governance/overview` → `404`
- `GET /data-platform/lifecycle/overview` → `404`
- `GET /data-platform/raw-sources/overview` → `404`
- `GET /data-platform/knowledge-governance/transformation` → `404`

结论：

- 当前测试服务器仍停留在“旧版洞明”接口集
- 本轮新增的治理 API 尚未部署到目标环境

---

## 5. 页面验收明细

### 5.1 通过页面

- `KnowledgePage`
- `IngestPage`
- `CatalogPage`
- `QualityPage`
- `LineagePage`
- `StoragePage`
- `BackupPage`
- `TopologyPage`

### 5.2 未通过页面

- `DashboardPage`：缺少 `治理驾驶舱`
- `DomainsPage`：回到登录态
- `LifecyclePage`：缺少 `生命周期`
- `ExternalIntakePage`：缺少 `外部数据接入治理`
- `RawSourcesPage`：缺少 `原始来源`
- `SourcesPage`：缺少 `知识来源`
- `ClassificationPage`：缺少 `分类`
- `PipelinesPage`：缺少 `管道`

结论：

- 通过页面大多属于测试服务器上已存在的旧版页面
- 失败页面与本轮新增或重构后的页面结构高度一致
- 当前环境中的前端静态资源与本地仓库实现不一致

---

## 6. 根因判断

### 根因 1：目标环境未部署本轮洞明重构版前后端

证据：

- 新 API 统一返回 `404`
- 新页面标题/文案未命中
- 老页面仍可访问

### 根因 2：OAuth 配置仍需应用管理员配合

虽然代码侧已补齐：

- 前端换票带 `redirect_uri`
- 独立工作台开发默认 App ID 修正
- `.env.example` 补充 `FEISHU_REDIRECT_BASE`

但若飞书后台未登记实际访问域名的 `redirect_uri`，仍会出现：

- `20029`

---

## 7. 本次仓库内已完成修复

### 7.1 认证链路

- `packages/feishu-sdk/src/auth.ts`
  - `exchangeCode()` 已向后端回传 `redirect_uri`

- `packages/feishu-sdk/src/config.ts`
  - 独立授权工作台在开发环境下不再错误回退到子衿 App ID

- `backend/.env.example`
  - 补充 `FEISHU_REDIRECT_BASE`

- `workstations/data-platform/.env.example`
  - 补充洞明前端独立 App ID 示例

### 7.2 文档体系

- `docs/DONGMING_WORKSTATION_USER_GUIDE.md`
- `docs/DONGMING_ACCEPTANCE_STANDARD.md`
- `docs/DONGMING_TEST_SYSTEM.md`

### 7.3 测试资产

- `tests/ui-acceptance/run-dongming-headed-acceptance.mjs`

---

## 8. 验收结论

当前结论：**不通过**

原因不是仓库内方案缺失，而是目标环境未满足验收前提：

- 新版洞明前后端尚未部署
- 飞书后台 `redirect_uri` 仍需与实际访问域名完全对齐

---

## 9. 复验前必须完成的事项

1. 将本轮 `data-platform` 前端与后端代码部署到目标环境
2. 在飞书开放平台为 `cli_a93753da2c381cef` 补齐实际访问入口对应的 `redirect_uri`
3. 确认后端环境变量 `FEISHU_REDIRECT_BASE` 与访问域一致
4. 重新执行：

```bash
HEADED=1 pnpm e2e e2e/workstation-auth-isolation.spec.ts --grep "data-platform"
node tests/ui-acceptance/run-dongming-headed-acceptance.mjs
```
