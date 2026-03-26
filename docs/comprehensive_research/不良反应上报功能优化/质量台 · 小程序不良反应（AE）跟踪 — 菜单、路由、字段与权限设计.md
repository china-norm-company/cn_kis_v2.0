# 质量台 · 小程序不良反应（AE）跟踪 — 菜单、路由、字段与权限设计

> 目标：在 **怀瑾·质量台**（`apps/quality`）内查看并跟踪 **微信小程序** `POST /my/report-ae` 写入的 `t_adverse_event` 数据，按 **项目 / 受试者 / 研究团队角色** 组织视图，并提供 **AE 数据看板**。  
> 后端已有 **`/api/v1/safety/*`** 路由（见 `backend/urls_quality.py`）与 `apps/safety/api.py`，当前列表接口 **未展开入组/方案/受试者及团队字段**，需增量扩展。

---

## 1. 质量台路由与菜单（建议）

`vite` 的 `base` 为 `/quality/`，前端使用 **HashRouter**，浏览器路径形如：`https://host/quality/#/adverse-events`。

| 路由 path（Hash 内） | 页面职责 | 说明 |
|----------------------|----------|------|
| `/adverse-events` | **AE 列表 + 筛选** | 默认按 `report_date` / `create_time` 倒序；支持项目、状态、SAE、时间范围、受试者编号/姓名关键词 |
| `/adverse-events/dashboard` | **AE 看板** | KPI 卡片 + 趋势/分布（可先做「统计接口 + 简单图表」，与列表共用筛选条件） |
| `/adverse-events/:id` | **AE 详情** | 事件信息、关联项目/受试者、团队联系人、随访时间线、跳转关联偏差（`deviation_id`） |

### 1.1 侧栏导航（`AppLayout` `navItems` 增量）

建议在 **「偏差管理」与「CAPA跟踪」之间** 插入（突出安全信号与偏差的邻近关系）：

| path | label | icon 建议 | 权限（见 §4） |
|------|-------|-----------|----------------|
| `/adverse-events` | **不良反应跟踪** | `Activity` / `HeartPulse`（lucide） | `safety.ae.read` |
| `/adverse-events/dashboard` | 可不单独占一级菜单 | — | 看板作为列表页 **Tab「看板」** 更省导航位 |

**推荐 UX**：一级菜单仅 **「不良反应跟踪」** → 列表页顶部 **Tab：列表 | 看板**，减少 pilot 菜单项膨胀。

### 1.2 `App.tsx` `Route` 增量示例（实现时粘贴）

```tsx
<Route path="adverse-events" element={<AdverseEventListPage />} />
<Route path="adverse-events/dashboard" element={<AdverseEventDashboardPage />} />
<Route path="adverse-events/:id" element={<AdverseEventDetailPage />} />
```

若采用 Tab 方案，可将 `dashboard` 作为列表页内状态路由：`/adverse-events?view=dashboard` 或保留子路径由列表内 `<Navigate>` 切换。

### 1.3 Pilot 模式（`visible_menu_items['quality']`）

新增菜单键：**`adverse-events`**（与 path 去掉斜杠一致，对齐现有 `deviations`、`capa` 等命名）。

---

## 2. 后端 API 对接（现状与扩展）

### 2.1 已存在（可直接对接）

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/v1/safety/adverse-events/list` | `safety.ae.read` |
| GET | `/api/v1/safety/adverse-events/{ae_id}` | `safety.ae.read` |
| GET | `/api/v1/safety/adverse-events/stats` | `safety.ae.read` |
| POST | `/api/v1/safety/adverse-events/{ae_id}/follow-up` | `safety.ae.create` |

> 注意：`list` 当前返回的 `_ae_to_dict` **仅有** `enrollment_id`，**无** 项目名、受试者、团队 —— **质量台必须做接口扩展或新端点**（见 §2.2）。

### 2.2 建议扩展（P0，实现跟踪必备）

**方案 A（推荐）**：扩展 `GET .../list` 的序列化（或增加 `include=context` 查询参数），在 `list_adverse_events` 查询上使用：

`select_related('enrollment__subject', 'enrollment__protocol')`

并在每条 item 上附加（字段名建议）：

| JSON 字段 | 来源 | 说明 |
|-----------|------|------|
| `protocol_id` | `enrollment.protocol_id` | |
| `project_code` | `enrollment.protocol.code` | 项目编号 |
| `project_title` | `enrollment.protocol.title` | 项目名称 |
| `subject_id` | `enrollment.subject_id` | |
| `subject_no` | `subject.subject_no` | 受试者编号 |
| `subject_name` | `subject.name` | 列表可脱敏展示（如 张**） |
| `team_pi_name` | 解析 `protocol.team_members` | 见 §3 |
| `team_cra_name` | 解析 `protocol.team_members` | 督导/CRA |
| `report_source` | 推导 | 建议新增模型字段或约定：`reported_by_id is null` 且来自小程序 JWT → `miniprogram`（见 §5） |
| `reported_by_name` | `Account` 可选 | 内部人员上报时有值 |

**方案 B**：新增 `GET /safety/adverse-events/list-for-quality`，避免影响旧调用方；质量台专用。

**列表筛选扩展（建议 query）**：`protocol_id`、`project_code`、`subject_no`、`status`、`is_sae`、`date_from`、`date_to`。

### 2.3 看板接口

现有 `GET .../stats` 已含 `total`、`by_severity`、`by_status`、`by_relation`、`sae_count`、`open_count`。

**建议增强**：

- 支持 **`protocol_id` / `project_code`** 过滤（与列表一致）。
- 增加 **`by_project`**（Top N 项目 AE 数）或 **`trend_by_week`**（近 8 周上报数）— 需产品确认是否 P1。

---

## 3. 研究员 / 督导字段来源（当前数据模型）

`Protocol`（`t_protocol`）含 **`team_members`**（JSON 数组：`[{ id, name, role }]`），**无**独立 PI/CRA 列。

**建议约定（写入 `Protocol` 维护 SOP）**：

- **主要研究者**：`role` 含任一关键字：`主要研究者`、`PI`、`研究者负责人`（英文 `PI`）。
- **临床协调员/督导**：`role` 含：`CRA`、`临床协调员`、`督导`、`monitor`（不区分大小写）。

解析逻辑（后端序列化时）：

1. 遍历 `team_members`，按关键字匹配取 **第一个** 匹配的 `name`。
2. 若未匹配：返回空字符串，前端展示 **「未配置」**，并在质量台提供 **跳转协议/项目维护** 的提示（权限允许时）。

> 若未来有独立 **中心-项目-角色** 表，可再替换为权威来源；当前以 `team_members` 为唯一结构化来源。

---

## 4. 权限命名与角色授予

### 4.1 沿用后端已有装饰器名

| 权限码 | 用途 |
|--------|------|
| **`safety.ae.read`** | 列表、详情、统计看板、导出（若后续有） |
| **`safety.ae.create`** | 创建 AE（执行台/工单侧）、**添加随访**（质量台详情内「新增随访」建议用此权限） |

质量台菜单 **`canSeeMenu('quality', 'adverse-events', ['safety.ae.read'])`**。

### 4.2 种子数据缺口（需补）

`seed_roles.py` 的 `ALL_PERMISSIONS` 中 **仅有** `('safety', 'ae', 'read', ...)`，**缺少** `safety.ae.create`。

- **建议**：增加 `('safety', 'ae', 'create', 'project', '上报/维护安全事件（含随访）')`。
- **建议授予角色**：质量负责人、医学/药物警戒对接、PM、Study Director 等（按你们 governance 表）；至少 **质量 + 医学** 应有 `read`，**医学/PM** 可有 `create` 以便录随访。

实现后执行：`python manage.py seed_roles`（以项目既有流程为准）。

---

## 5. 专业建议（可在文档 / 二期需求中固化）

1. **上报来源（Source）**  
   - 在 `AdverseEvent` 增加 **`report_channel`**（如 `miniprogram` / `workorder` / `manual`）或 **`source_system`**，避免用「`reported_by_id` 是否为空」推断，便于审计与报表。

2. **SAE 与「重度」分离**  
   - 小程序当前 `is_sae = (severity == 'severe')` 与 GCP 对 SAE 定义不完全等价；质量台看板应对 **`is_sae`** 单独高亮，并建议产品修订受试者端文案/确认流。

3. **隐私与展示**  
   - 列表默认 **姓名脱敏**；详情按角色决定是否展示全名（与受试者模块策略一致）。

4. **与偏差 / CAPA 联动**  
   - 详情页展示 `deviation_id`、`change_request_id`，链到质量台已有 **偏差详情**（若 ID 同源）。

5. **时效（SLA）指标（看板 P1）**  
   - 例如：SAE 上报后 24h 内是否进入 `under_review` / 是否关联偏差；需状态流转规则支持。

6. **编码（远期）**  
   - MedDRA / WHO-ART 编码字段可后续挂接 PV 体系。

---

## 6. 实现阶段建议

| 阶段 | 内容 |
|------|------|
| **P0** | 后端 list/detail 扩展上下文字段 + `seed_roles` 补 `safety.ae.create`；质量台列表 + 详情 + 随访只读/提交 |
| **P1** | 看板 Tab + stats 过滤增强 + 列表高级筛选 |
| **P2** | 导出、SLA、MedDRA、`report_channel` 落库 |

---

## 7. 关联文件索引

| 模块 | 路径 |
|------|------|
| 安全 API | `backend/apps/safety/api.py` |
| AE 服务 | `backend/apps/safety/services.py` |
| AE 模型 | `backend/apps/safety/models.py` |
| 路由挂载 | `backend/urls_quality.py`（`/safety/`） |
| 小程序上报 | `backend/apps/subject/api_my.py` · `POST /my/report-ae` |
| 质量台路由 | `apps/quality/src/App.tsx` |
| 质量台导航 | `apps/quality/src/layouts/AppLayout.tsx` |
| 方案团队 JSON | `backend/apps/protocol/models.py` · `team_members` |
| 权限种子 | `backend/apps/identity/management/commands/seed_roles.py` |

---

## 8. 文档维护

- 与 `docs/comprehensive_research/不良反应上报功能优化/README.md` 互为补充：README 偏需求与差距，**本文偏质量台交互与接口契约**。  
- 实现完成后在本文件末尾追加 **变更记录** 表。

---

*初稿日期：2026-03-22*
