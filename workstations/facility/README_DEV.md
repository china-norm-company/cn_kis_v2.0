# 坤元·设施台 — 开发环境快速上手

> 场地管理、预约、环境监控、不合规事件、清洁

## 一、环境要求

- Node.js >= 18、pnpm >= 8
- Python 3.x（后端）
- SQLite（本地开发默认）

## 二、启动步骤

### 1. 后端 API（必须）

```powershell
cd backend
$env:USE_SQLITE="true"
$env:DJANGO_SETTINGS_MODULE="settings"
py -3 manage.py runserver 8001
```

API 文档：<http://localhost:8001/api/v1/docs>

### 2. 坤元设施台前端

```powershell
# 在项目根目录
pnpm dev:facility
```

访问：<http://localhost:3012/facility/>

### 3. 开发旁路（已配置）

`.env` 中已设置 `VITE_DEV_AUTH_BYPASS=1`，本地开发可跳过飞书登录，直接进入工作台。

## 三、页面与路由

| 页面       | 路径           | 说明         |
|------------|----------------|--------------|
| 仪表盘     | /dashboard     | 设施全景统计 |
| 场地列表   | /venues        | 场地管理     |
| 预约管理   | /reservations  | 预约与冲突   |
| 环境监控   | /environment  | 环境参数监控 |
| 不合规事件 | /incidents     | 事件处理     |
| 清洁记录   | /cleaning      | 清洁合规     |

## 四、后端 API 前缀

- `/api/v1/facility/` — 设施环境管理
- 详见 `backend/apps/resource/api_facility.py`

## 五、停止器衡设备台（可选）

若之前启动了设备台（端口 3010），可在对应终端按 `Ctrl+C` 停止，或保留运行（端口不冲突）。
