# -*- coding: utf-8 -*-
"""Merge 附录 B into 扫码签到功能优化V1.1.md. Run from repo root: python scripts/patch_v11_appendix_b.py"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = next(ROOT.glob("docs/comprehensive_research/**/*V1.1.md"), None)
if not TARGET or not TARGET.is_file():
    raise SystemExit("V1.1 md not found")

APPEND = """

---

## 附录 B：小程序签到/签出与接待看板联动（实现路径）

> **背景**：接待看板「今日队列」使用 `source=board`，数据来自 `ReceptionBoardCheckin` / `ReceptionBoardProjectSc`；小程序 `/api/v1/my/scan-checkin` 成功路径写入 `SubjectCheckin`（工单执行侧）。两套数据默认**互不影响**。本附录固化 **V1.1 推荐实现路径**：在**不改动**小程序对外接口与接待台既有入口的前提下，于小程序成功签到/签出后**镜像**看板数据，使看板状态与小程序一致。

### B.1 目标与非回归约束

| 项 | 说明 |
|----|------|
| **目标** | 受试者通过小程序扫码完成签到/签出后，接待看板（`ReceptionDashboardPage`，`todayQueue` 的 `source: 'board'`）中对应行的签到/签出**状态与时间**与事实一致；看板侧 SC 仍遵循现有 `board_checkin` / `_ensure_board_project_sc_on_checkin` 规则。 |
| **保留** | 小程序仍返回原有 `code/msg/data` 语义；仍调用 `quick_checkin` / `quick_checkout` 维护 **`SubjectCheckin`**（执行台、预约页 `source=execution`、`todayStats` 等**行为不变**）。 |
| **保留** | 接待台看板签到 API（`board-checkin` / `board-checkout`）、接待扫码签到（`/reception/scan-checkin` → `quick_checkin`）**不强制改为双写**；本方案仅约束 **小程序** `/my/scan-checkin` 成功路径的**追加镜像**。 |

### B.2 推荐方案：成功路径追加镜像

在 `backend/apps/subject/api_my.py` 的 **`my_scan_checkin`** 中，在现有逻辑**已成功**后增加：

| 小程序分支 | 已有逻辑 | **追加**（联动看板） |
|------------|----------|----------------------|
| 当日首次签到 | `quick_checkin(subject.id, method='qr_scan', location=location)` | 等价于一次 **`board_checkin`**（`ReceptionBoardCheckin` + 必要时 `ReceptionBoardProjectSc`） |
| 已签到/执行中再扫 | `quick_checkout(existing.id)` | **`board_checkout(subject_id, target_date=today)`**（写看板 `checkout_time`） |

实现建议：

- 在 `reception_service` 中抽取 **`_mirror_reception_board_after_my_scan(subject_id, today, action, checkin_row=None, appt_context=None)`**（名称可调整），**仅**由 `my_scan_checkin` 调用，避免误伤接待台其它接口。
- **不要**修改 `ReceptionDashboardPage` 的 `source: 'board'`；看板仍只读 board 数据源。

### B.3 关键实现细节：`quick_checkin` 与 `board_checkin` 的预约状态顺序

`quick_checkin` 会将当日匹配预约标为 **`COMPLETED`**（`SubjectAppointment`）。现有 **`board_checkin`** 选取预约时仅查询 **`CONFIRMED` / `PENDING`**，若在 `quick_checkin` **之后**再裸调 `board_checkin(subject_id, today)`，可能出现 **`appt` 为空**，导致看板记录缺少 `appointment_id` 或 SC 分配与预期不一致。

**必选其一（实现时在产品评审中确认并写进 PR 说明）：**

1. **带上下文镜像（推荐）**：在 `quick_checkin` 内将预约改为 `COMPLETED` **之前**，保存当次使用的 `appointment_id`、`project_code`、`visit_point`；镜像函数用该上下文写入/更新 `ReceptionBoardCheckin`，并调用与 `board_checkin` 同款的 **`_ensure_board_project_sc_on_checkin`**（可将「给定 appt 写看板」抽为内部函数，避免依赖再次查询 `CONFIRMED/PENDING`）。
2. **扩展 `board_checkin`（增量、向后兼容）**：当无 `CONFIRMED/PENDING` 时，**回退**查询当日 **`COMPLETED`** 预约（如按 `update_time` 最近）用于绑定 `appointment_id` 与 SC。需覆盖「仅看板签到」「小程序后再看板」等回归场景。

### B.4 事务与失败策略

- 小程序单次请求内，**执行侧写入**与**看板镜像**宜置于**同一数据库事务**（`@transaction.atomic`），避免出现小程序提示成功而看板未更新。
- **镜像失败**：应**整体回滚**本次签到/签出（含 `quick_checkin`/`quick_checkout` 已写内容），或按重试策略处理；**禁止**静默吞异常导致长期双轨分裂。
- **签出镜像**：`board_checkout` 在当日**无** `ReceptionBoardCheckin` 时会抛错。若签到镜像已成功则通常存在看板记录；若签到镜像曾失败，签出镜像需 **catch** 后与会话状态一致处理（一般与事务回滚策略统一）。

### B.5 SC 与「数据联动」边界

- **执行侧 SC**：`SubjectProjectSC`（`quick_checkin` 已维护）。
- **看板侧 SC**：`ReceptionBoardProjectSc`（镜像走看板既有逻辑）。

本方案实现的是**看板队列状态与时间**与小程序一致；**两套 SC 表仍独立**。若产品要求看板与执行侧 **SC 号码严格一致**，需另增「拷贝/对齐」子需求，不在本附录默认范围内。

### B.6 测试与回归清单（建议）

- 小程序：首次签到、已签出再扫、过期/无效场所码（与 V1.0 一致）。
- 看板：仅看板签到/签出、小程序签到后看板行状态、小程序签出后看板签出时间。
- 多项目同日：与 `quick_checkin` 的 `project_code` 约定对齐；若镜像需传 `project_code`，与现网预约选择规则一致。
- 并发：同日重复请求、事务隔离。

### B.7 与需求条目关系

- 支撑 **V1.1-04**（小程序与接待看板展示联动）中「签到状态」维度的后端一致性；**不改变**既有赋号业务规则表述（仍以 §2.1 / 现网 `quick_checkin`+看板规则为准）。
"""

CHANGELOG_ROW = (
    "| 2026-03-21 | 产品/负责人 | 文档 | 新增附录 B：小程序签到/签出与接待看板联动实现路径（镜像 board_checkin/board_checkout、"
    "预约状态顺序、事务与 SC 边界） | - |"
)

ANCHOR = (
    "| 2026-03-21 | 产品/负责人 | 文档 | 新增附录 A：首页聚合接口 "
    "`GET /api/v1/my/home-dashboard` 与「主项目」判定规则可实现规格（§1～§6），"
    "含与 V1.1-01～05 对应关系 | - |"
)

if __name__ == "__main__":
    text = TARGET.read_text(encoding="utf-8")
    if "## 附录 B：" not in text:
        text = text.rstrip() + APPEND
        if not text.endswith("\n"):
            text += "\n"
    if ANCHOR in text and CHANGELOG_ROW not in text:
        text = text.replace(ANCHOR + "\n", ANCHOR + "\n" + CHANGELOG_ROW + "\n", 1)
    TARGET.write_text(text, encoding="utf-8")
    print("OK", TARGET)
