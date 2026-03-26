# 最小项目全生命周期线上闭环 — 验收清单（CN KIS V2.0）

主链：**Protocol → SchedulePlan 发布 → WorkOrder → Enrollment（enrolled）→ SubjectCheckin → Deviation/质量闭环**

## 1. 前置数据

- [ ] 至少 1 个 `Protocol`（`is_deleted=false`，状态可达 `active` 或已解析后进入执行链）
- [ ] 关联 `VisitPlan`、已审批 `ResourceDemand`（按排程模块要求）
- [ ] 伦理/质量门禁满足 `check_project_start_gate`（排程发布前）

## 2. 排程与工单

- [ ] `SchedulePlan` 状态可为 `published`
- [ ] 发布后 `WorkOrder` 生成非空（依赖 `Enrollment.status=enrolled`）

## 3. 入组

- [ ] `Enrollment` 存在且 **`status = enrolled`**（招募确认或入组服务写入）

## 4. 现场

- [ ] `SubjectCheckin` 有记录；关键场景建议关联 `work_order_id` 便于审计

## 5. 质量闭环

- [ ] `Deviation` 可创建与流转；通知/仪表盘查询口径与 `DeviationStatus` 一致（避免与旧字符串状态混用）

## 6. 自动化自检

```bash
cd backend && python manage.py check_minimal_project_loop
```

输出含各节点计数与近 7 日增量，供鹿鸣「闭环推进」页与验收对照。

## 7. 主数据锚点

- 以 **`protocol.Protocol`** 为项目主锚点；`project_full_link` 若并行使用，须在治理上明确「主入口」，避免双轨分裂。
