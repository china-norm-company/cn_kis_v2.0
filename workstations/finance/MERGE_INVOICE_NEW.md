# 发票管理（新）合并说明

本目录中的「发票管理（新）」功能已从 `独立工作台/cn_kis_v1.0/apps/finance` 合并到当前项目，**未修改独立工作台中的任何文件**。

> **说明（2026-03）**：`cn_kis_v1.0` 独立财务台已不再使用；日常开发与联调请以本仓库 **`workstations/finance`**（默认 **http://localhost:3004/finance/**）为准，勿再启动 v1.0 的 `apps/finance` 开发服务。

## 合并内容

- **页面**：`src/pages/new/`（README.md + InvoiceManagementNewPage.tsx）
- **功能模块**：`src/features/legacy-finance/`（开票申请、发票管理、收款管理、催款提醒、客户管理）
- **实体与共享**：`src/entities/`、`src/shared/`（config、api、lib、services、ui 等）

## 当前项目修改（仅限本仓库）

- **路由**：`App.tsx` 增加 `/new` 路由及 `InvoiceManagementNewPage` 引用
- **侧栏**：`layouts/AppLayout.tsx` 增加「发票管理（新）」菜单项（FilePlus 图标）
- **依赖**：`package.json` 增加 sonner、date-fns、react-hook-form、@hookform/resolvers、zod、xlsx、@radix-ui/* 等
- **Toaster**：`App.tsx` 中增加 `<Toaster position="top-center" richColors />` 以支持 legacy-finance 的 useToast

## 使用说明

- 侧栏点击「发票管理（新）」进入单页，通过标签页切换：开票申请、发票管理、收款管理、催款提醒、客户管理。
- 数据默认使用前端 mock（localStorage）。需真实接口时在 `src/shared/config/env.ts` 中设置 `VITE_API_MODE=real`（需后端提供对应 API）。

## 构建

已通过 `pnpm run build` 验证，构建成功。
