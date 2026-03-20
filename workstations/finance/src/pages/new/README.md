# 发票管理（新）

侧栏「发票管理（新）」进入后为单页，通过**标签页**切换 5 个模块：

- 开票申请
- 发票管理
- 收款管理
- 催款提醒
- 客户管理

**已合并到财务台本地**，无需再运行或依赖 KIS-frontend-prototype 项目。数据默认使用前端 mock（localStorage），可在 `src/shared/config/env.ts` 中通过 `VITE_API_MODE=real` 切换为真实接口（需后端提供对应 API）。
