# 洞明工作台测试体系

> 适用对象：`洞明·数据台（data-platform）`
> 目标：建立一套可持续复用、可追溯、可执行的测试与验收体系

---

## 1. 设计目标

测试体系需要同时覆盖：

- 独立 OAuth 与环境配置正确性
- API 可用性与页面消费一致性
- 关键治理链路的端到端可见性
- 回归测试与发布门禁

---

## 2. 测试分层

### 2.1 L0 配置与静态检查

目的：

- 在运行前发现明显配置错误和文档漂移

覆盖内容：

- `VITE_FEISHU_APP_ID` 是否为洞明独立 App ID
- `FEISHU_REDIRECT_BASE` 是否配置
- 关键文档是否与实现一致
- 关键路由是否在 `App.tsx` / `AppLayout.tsx` 注册

建议工具：

- `rg`
- 配置检查脚本
- 构建前门禁脚本

### 2.2 L1 API 契约测试

目的：

- 确保后端 `data-platform` 相关接口稳定可用

覆盖内容：

- `/data-platform/dashboard`
- `/data-platform/domains`
- `/data-platform/governance/overview`
- `/data-platform/lifecycle/*`
- `/data-platform/raw-sources/overview`
- `/data-platform/conflicts/summary`
- `/data-platform/catalog/schema`
- `/data-platform/classification/*`
- `/data-platform/knowledge-governance/transformation`
- `/data-platform/pipelines/schedule`
- `/data-platform/storage/stats`
- `/data-platform/backup/status`
- `/data-platform/topology/health`

通过标准：

- HTTP 200
- `code=200`
- 关键字段不缺失
- 数据结构与前端消费一致

### 2.3 L2 页面冒烟测试

目的：

- 确保所有页面可打开、无白屏、无明显 JS 崩溃

页面清单：

- Dashboard
- Domains
- Lifecycle
- External Intake
- Raw Sources
- Knowledge
- Sources
- Ingest
- Catalog
- Classification
- Quality
- Lineage
- Pipelines
- Storage
- Backup
- Topology

重点检查：

- 页面标题
- 关键文案
- 关键卡片/表格/空态
- 无登录循环
- 无明显控制台异常

### 2.4 L3 功能链路测试

目的：

- 验证治理场景不是“只能打开页面”，而是“能支撑使用场景”

关键链路：

- OAuth 独立登录链路
- 治理驾驶舱聚合链路
- 外部接入治理链路
- 知识转化治理链路
- 分类分级合规链路
- 血缘与追溯链路
- 同步 / 存储 / 备份 / 拓扑运行保障链路

### 2.5 L4 Headed 验收测试

目的：

- 在接近真实用户的浏览器交互环境下做最终验收

适用时机：

- 文档和页面已定版
- 发布前或大版本重构后
- OAuth / 导航 / 关键治理页面改动后

---

## 3. 测试场景矩阵

### 3.1 认证与入口

- 独立 App ID 正确
- redirect_uri 正确
- 洞明与其他工作台不串台
- 无权限用户被正确拦截

### 3.2 治理驾驶舱

- 缺口清单可见
- 生命周期滞留可见
- 各域规模可见
- 合规摘要可见

### 3.3 外部数据治理

- 候选接入池数据可见
- 全局候选生成接口可用
- 原始来源页面可见 LIMS/EKB/飞书
- 冲突汇总可见

### 3.4 知识治理

- 条目列表、筛选、搜索正常
- 转化统计可见
- 内容入库与 pending entries 可见
- 知识来源注册表可见

### 3.5 分类、目录、质量

- 目录、Schema、行数、分类联动
- 六维分类与合规检查联动
- 质量规则/告警可见

### 3.6 运行保障

- Pipelines
- Storage
- Backup
- Topology

---

## 4. 测试数据与前置条件

### 4.1 账号与权限

- 超级管理员 JWT 或具备同等级权限的测试账号
- 具备 `data-platform` 可见工作台权限

### 4.2 环境前提

- 前端已部署或本地 dev server 已启动
- 后端 `/v2/api/v1/` 可达
- `FEISHU_REDIRECT_BASE` 已正确配置
- 飞书开放平台已登记有效 `redirect_uri`

### 4.3 数据前提

建议至少具备：

- 有效的 `KnowledgeEntry`
- 有效的 `PersonalContext`
- 至少一个数据域可返回规模数据
- 至少一个质量告警或空态可验证
- 至少一个原始来源对象

---

## 5. 推荐执行顺序

1. L0 配置检查
2. L1 API 契约测试
3. L2 页面冒烟
4. L3 功能链路验证
5. L4 Headed 验收

这样做的原因：

- 先用低成本手段排除明显问题
- 再用浏览器验证真实可用性

---

## 6. 工具与脚本建议

### 6.1 推荐脚本

- `e2e/workstation-auth-isolation.spec.ts`
  - 验证洞明独立 App ID、授权隔离
- `tests/ui-acceptance/run-full-acceptance-v5.mjs`
  - 现有全量 UI + API 验收
- `tests/ui-acceptance/run-dongming-headed-acceptance.mjs`
  - 洞明专用 headed 验收脚本

### 6.2 推荐命令

```bash
# 认证隔离验证（headed）
HEADED=1 pnpm e2e e2e/workstation-auth-isolation.spec.ts

# 洞明专用 headed 验收
node tests/ui-acceptance/run-dongming-headed-acceptance.mjs
```

---

## 7. 证据保留要求

每次正式验收至少保留：

- 执行时间
- 测试环境入口
- 使用账号/认证方式
- 页面截图
- 失败日志
- API 返回摘要
- 最终通过率

建议输出到：

- `tests/ui-acceptance/screenshots-*`
- `docs/*ACCEPTANCE_REPORT*.md`

---

## 8. 通过 / 阻断规则

### 阻断

以下问题直接阻断：

- OAuth `20029`
- 登录后循环跳转
- 关键页面白屏
- Dashboard / Catalog / Knowledge / Classification 关键页面不可用
- 关键接口 500

### 可接受但需记录

- 某些外部依赖缺失导致的降级展示
- 动态样式类 lint warning
- 空数据引起的空态展示

---

## 9. 回归触发条件

以下改动后必须重新执行洞明验收：

- OAuth / Feishu SDK / App ID / redirect 相关改动
- `data-platform` 新页面、重构页面
- `api_data_platform.py` 接口增删改
- 导航结构调整
- 知识治理 / 生命周期 / 域模型改动

---

## 10. 发布建议

发布前最低动作：

1. 认证隔离测试通过
2. 洞明专用 headed 验收通过
3. 形成最新验收报告
4. 对 `redirect_uri`、App ID、`FEISHU_REDIRECT_BASE` 做人工复核
