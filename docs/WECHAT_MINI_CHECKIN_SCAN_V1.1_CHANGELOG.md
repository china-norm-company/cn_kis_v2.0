# 扫码签到功能优化 V1.1 — 变更记录（仓库可编辑副本）

> **说明**：正式长篇需求文档路径为 `docs/comprehensive_research/签到签出功能优化/扫码签到功能优化V1.1.md`（部分环境因策略无法由工具直接编辑）。  
> 本文件与入口 `docs/WECHAT_MINI_CHECKIN_SCAN_V1.1.md` 同步记录**已实现的后端/小程序变更**，便于版本对照与验收。

---

## 变更总表（按时间主题汇总）

| 日期/批次 | 范围 | 摘要 |
|-----------|------|------|
| 2026-03 | P0/P1 小程序首页与档案 | 看板镜像、`home-dashboard`、问候语 `display_name`、profile 字段、可选微信昵称 |
| 2026-03-22 | 首页展示与访视提醒 | 项目编号权威来源、下次访视过滤、入组状态 UI、排队签到时间时区 |

---

## 2026-03-22：首页数据、访视提醒、排队时间

### 1. 项目编号展示（`home-dashboard`）

- **现象**：预约/导入中 `project_code` 可能填成错误字符串（如「测6065004」），与方案 **`Protocol.code`**（如 `C26065004`）不一致。
- **实现**（`backend/apps/subject/services/home_dashboard_service.py`）：
  - 按块解析 **`Enrollment`**：先 `enroll_map.get(pc)`，否则用 **`SubjectAppointment.enrollment`**。
  - 用 **`Enrollment → protocol.code`** 作为对外展示的 **`project_code`**（无入组则仍用原 `pc`）。
  - **`SubjectProjectSC`** 在预约 code 与方案 code 不一致时，增加按 **`protocol.code`** 的二次匹配，避免 SC/入组状态取不到。

### 2. 下次访视提醒（`GET /my/upcoming-visits`）

- **现象**：仅按 `appointment_date >= today` 筛选，**同一天但预约时点已过**仍排在首位，首页显示「过期」访视。
- **实现**（`backend/apps/subject/api_my.py` · `get_upcoming_visits`）：
  - 在**本地时区**下：日期大于今天 → 保留；**等于今天** → 仅保留 `appointment_time` 为空（视为全天）或 **`appointment_time >= 当前本地时间`**。
  - 返回项中 `time` 格式为 **`HH:MM`**（便于小程序直接展示）。

### 3. 入组状态展示（小程序首页）

- **需求**：去掉明细区重复行「入组情况」，在卡片标题区 badge 展示状态（初筛合格、正式入组等）。
- **实现**：
  - **后端**：`enrollment_status` 优先 **`SubjectProjectSC.enrollment_status`**；若无 SC 文案则用 **`Enrollment.get_status_display()`**。
  - **前端**（`workstations/wechat-mini/src/pages/index/index.tsx`）：`DashboardProjectRows` 移除「入组情况」行；主 badge 无文案时占位为「—」。

### 4. 排队页「签到时间」少 8 小时

- **原因**：`SubjectCheckin.checkin_time` 为 **`DateTimeField`**，`USE_TZ=True` 时为 UTC；直接 **`strftime('%H:%M')`** 得到的是 UTC 时分。
- **实现**：
  - 新增 **`backend/libs/time_format.py`**：`format_local_hhmm(dt)` → `timezone.localtime` 后格式化为 `HH:MM`（与 **`settings.TIME_ZONE`**，如 `Asia/Shanghai` 一致）。
  - **`backend/apps/subject/services/queue_service.py`**：`get_queue_position`、`call_next`、`get_display_board` 中签到时间展示均改用该函数。
  - **`backend/apps/subject/services/recruitment_notify.py`**：飞书卡片「签到时间」字段同步使用本地时分。

---

## 更早批次（V1.1 相关，便于一文对照）

### 接待看板与小程序签到联动

- 小程序签到/签出后，在同事务内镜像接待看板字段（如 `board_checkin` / `board_checkout` 及上下文）；涉及 `api_my`（如 `my_scan_checkin`）、`reception_service` 等。

### 首页聚合 `GET /my/home-dashboard`

- 附录 A 形态：主项目、多项目、`display_name` / `display_name_source`、各项目块字段等；实现于 `home_dashboard_service.build_home_dashboard_data`。

### 问候语与档案（§2.2 / 附录 A §4）

- **`GET /my/profile`** 增量返回 `display_name`、`display_name_source`（与 dashboard 同源计算函数 `compute_subject_display_name`）。
- **`POST /my/profile/wechat-display-name`**：登录后可选写入 `Account.display_name`；失败不阻塞登录。
- 小程序：`UserInfo.displayName`、`mergeMyProfileGreetingIntoUser`、首页 `resolveHomeGreetingName`、可选「用微信昵称作为称呼」。

---

## 验收时建议自测接口

- `GET /api/v1/my/home-dashboard` — 项目编号、入组状态 badge 数据。
- `GET /api/v1/my/upcoming-visits` — 当日已过点预约应被过滤；`time` 为 `HH:MM`。
- `GET /api/v1/my/queue-position` — `checkin_time` 与手机本地时间一致（东八区场景）。
- `GET /api/v1/my/profile` — `display_name` / `display_name_source`。

---

*文档维护：与代码变更同步更新本变更记录；详细需求条目仍以综合研究目录下 V1.1 正文为准。*
