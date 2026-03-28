# 衡技·评估台《我的今日项目》开发规格

## 1. 背景

新增评估员个人视角页面 `我的今日项目`，用于从当前登录评估员视角查看：

- 今日负责的项目
- 各项目已签到人数
- 各项目已完成人数
- 各受试者各时间点的任务执行情况

一期仅对 **SADC 支持探头对应的设备任务** 做自动“已测量/未测量”判定。

以下任务 **一期展示但暂不自动判定**：

- 非 SADC 设备任务
- `evaluation_plan`
- `auxiliary_measurement_plan`

## 2. 已确认业务口径

### 2.1 页面归属

- 工作台：`衡技·评估台`
- 页面名称：`我的今日项目`
- 菜单位置：评估台侧边栏一级菜单

### 2.2 顶部统计口径

- `今日项目数`：当前评估员今日负责项目去重数
- `已签到人数`：按人统计，临时到访只要已签到也纳入
- `已完成人数`：按人统计，需满足“今日全部时间点完成”或“业务终止完成”
- `待完成人数`：`已签到人数 - 已完成人数`
- `完成率`：`已完成人数 / 已签到人数`

### 2.3 时间点完成口径

- 时间点真相源来自 `执行订单解析详情 -> 排期计划 visit_plan`
- 页面列名优先取 `test_time_point`
- 若 `test_time_point` 为空，则回退 `visit_time_point`

### 2.4 时间点任务来源

一个时间点下的任务来源于以下三类计划：

- `equipment_plan`
- `evaluation_plan`
- `auxiliary_measurement_plan`

一期状态规则：

- `equipment_plan` 中可映射到 SADC 探头的任务：自动判定
- `equipment_plan` 中不可映射到 SADC 探头的任务：展示为 `暂不判定`
- `evaluation_plan`：展示为 `暂不判定`
- `auxiliary_measurement_plan`：展示为 `暂不判定`

### 2.5 队列与入组状态

队列状态范围：

- `waiting`
- `checked_in`
- `in_progress`
- `checked_out`
- `no_show`

入组情况范围：

- `初筛合格`
- `正式入组`
- `不合格`
- `复筛不合格`
- `退出`
- `缺席`

### 2.6 终止规则

若受试者入组情况为以下之一：

- `不合格`
- `复筛不合格`
- `退出`

则：

- 后续时间点统一按终止状态展示
- 整体状态记为 `终止完成`
- 计入 `已完成人数`

若为 `缺席`：

- 不计入已完成

### 2.7 刷新规则

- 页面进入时自动刷新一次
- 停留页面期间每 5 分钟自动刷新一次
- 页面右上角提供手动刷新按钮

## 3. 时间点字段映射

`visit_plan` 中字段定义：

- `visit_plan[].visit_time_point`：访视时间点
- `visit_plan[].test_time_point`：当日测试时间点

任务类计划中均通过 `visit_time_point` 挂靠到时间点：

- `equipment_plan[].visit_time_point`
- `evaluation_plan[].visit_time_point`
- `auxiliary_measurement_plan[].visit_time_point`

因此开发时必须先建立：

`visit_time_point -> 最终时间点列名`

映射规则：

1. 读取 `visit_plan`
2. 对每一条 visit：
   - `final_time_point = test_time_point || visit_time_point`
3. 用该映射把三类任务归并到最终列头下

## 4. SADC 探头匹配规则

### 4.1 SADC 标准探头

- `TMHex`
- `TM300`
- `TMNano`
- `CM825`
- `GL200`
- `MX18`
- `IDM800`
- `ST500`
- `PH905`
- `SM815`
- `CL400`
- `CL440`
- `Cutometer`

### 4.2 设备名归一化

设备名匹配建议做以下清洗：

1. 转小写
2. 去空格
3. 去连字符、下划线、点号、括号
4. 去 `®`
5. 去常见无意义词：
   - `probe`
   - `探头`
   - `测试探头`
   - `测量探头`
   - `测试仪`
   - `设备`

### 4.3 低置信度策略

如果设备名无法高置信度映射到 SADC 探头：

- 前端弹窗让用户手动选择探头
- 仅对当前这一次生效
- 一期不做持久化映射

## 5. Primary Parameter 对应表

SADC 判定“已测量”时，只取每个 probe 的 **第一个 primary_param**。

| Probe | primary_param |
|---|---|
| `TMHex` | `TEWL Robust [g/m²/h]` |
| `TM300` | `TEWL Robust [g/m²/h]` |
| `TMNano` | `TEWL Robust [g/m²/h]` |
| `CM825` | `Hydration` |
| `GL200` | `Gloss` |
| `MX18` | `Melanin` |
| `IDM800` | `Indentometer value` |
| `ST500` | `Temp. °C` |
| `PH905` | `pH` |
| `SM815` | `Sebum [µg/cm²]` |
| `CL400` | `ITA°` |
| `CL440` | `ITA°` |
| `Cutometer` | `R0 [mm]` |

## 6. instrument_readings 判定规则

### 6.1 数据源

PostgreSQL 测试数据库：

- Host: `106.14.119.61`
- Port: `5432`
- User: `workbench`
- Password: `workbench123`
- Database: `cn_kis`
- Table: `instrument_readings`

### 6.2 查询键

页面上下文与数据库字段映射：

- `project_code -> study_code`
- `subject_no -> subject_code`
- `time_point -> time_point`
- `probe 标准名 -> probe`

### 6.3 判定条件

某个 SADC 设备任务判定为 `已测量` 的条件：

存在任意一条记录满足：

- `study_code = 当前项目编号`
- `subject_code = 当前受试者编号`
- `time_point = 当前时间点`
- `probe = 当前标准探头名`
- `LOWER(COALESCE(status_code, 'active')) = 'active'`
- `COALESCE(is_current, 1) = 1`
- `attribute_name = 该 probe 的 primary_param`
- `attribute_value` 非空

否则判定为 `未测量`。

补充规则：

- 查询到但 `is_current = 0`：`未测量`
- 查询到但 primary `attribute_value` 为空：`未测量`
- 查询不到：`未测量`
- 同一组条件命中多条记录时：**只要有一条满足即可**

## 7. 页面展示规则

### 7.1 项目卡片

每个项目展示：

- 项目名称
- 项目编号
- 已签到人数
- 已完成人数
- 待完成人数
- 最近签到时间

### 7.2 受试者矩阵

每个受试者一行，展示：

- 姓名
- 受试者编号
- SC号
- 队列状态
- 入组情况
- 各时间点列
- 整体状态

### 7.3 时间点单元格

每个时间点单元格分三组：

- 设备任务
- 评估任务
- 辅助任务

展示规则：

- SADC 设备任务：`已测量 / 未测量`
- 低置信度设备：`选择探头`
- 非 SADC 设备：`暂不判定`
- `evaluation_plan`：`暂不判定`
- `auxiliary_measurement_plan`：`暂不判定`

### 7.4 整体状态文案

建议统一：

- `未签到`
- `执行中`
- `已完成`
- `已签出未完成`
- `筛败终止完成`
- `退出终止完成`

## 8. SADC 自动带入规则

### 8.1 KIS 页面参数

进入测量页 URL 仅传三项：

- `project_code`
- `subject_no`
- `time_point`

示例：

`/evaluator/measure?project_code=P001&subject_no=SUB001&time_point=T0`

### 8.2 SADC 页面行为

SADC 需要支持：

- 自动读取 URL 参数
- 自动填入：
  - 项目编号
  - 受试者编号
  - 时间点

### 8.3 一期行为

- 只自动填值
- **不自动确认**
- 用户手动点击“确认”

## 9. 后端开发任务

1. 新增聚合接口 `GET /api/v1/evaluator/my-today-projects`
2. 聚合当前评估员今日项目与受试者
3. 基于 `visit_plan` 构建时间点列映射
4. 将三类任务归并到时间点列下
5. 实现设备名归一化与 SADC 探头映射
6. 实现低置信度设备返回 `needs_probe_selection`
7. 实现 `instrument_readings` 查询与已测量判定
8. 返回统一 JSON 结构供前端渲染

## 10. 前端开发任务

1. 评估台侧边栏新增 `我的今日项目`
2. 新增页面与路由
3. 实现总览卡片
4. 实现项目列表
5. 实现受试者时间点矩阵
6. 实现三类任务分组展示
7. 实现低置信度设备弹窗选探头
8. 实现手动刷新与 5 分钟自动刷新

## 11. SADC 联动开发任务

1. `MeasurePage` 支持读取 `project_code / subject_no / time_point`
2. SADC 页面支持从 URL 自动填入 3 个输入框
3. 保持“只自动填值，不自动确认”

## 12. 验收标准

1. 当前评估员今日项目聚合正确
2. 临时到访且已签到人员被纳入
3. 时间点列映射正确
4. SADC 设备已测量/未测量判定正确
5. `status_code = active` 生效
6. `is_current = 1` 生效
7. primary_param 第一项判定正确
8. 低置信度设备可弹窗手动选择探头
9. 非 SADC / 评估 / 辅助任务显示 `暂不判定`
10. SADC 页面可自动填值，且不自动确认

