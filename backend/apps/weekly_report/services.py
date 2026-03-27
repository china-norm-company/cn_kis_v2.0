"""
周报系统业务逻辑（与设计文档 2.3 节接口对应）

数据持久化到 PostgreSQL，使用 Django ORM。
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, Optional

from django.db import transaction
from django.db.models import F

from .constants import DEFAULT_NOTES_TEMPLATE, RiskLevel, TaskStatus, WeeklyReportStatus
from .models import (
    MetricSnapshot,
    ReportReminder,
    WeeklyReport,
    WeeklyReportItem,
    WeeklyReportLeader,
    WeeklyReportNotes,
    WeeklyReportProject,
    WeeklyReportTask,
)


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def get_week_period(year: int, week: int) -> tuple:
    jan4 = date(year, 1, 4)
    week1_monday = jan4 - timedelta(days=jan4.isoweekday() - 1)
    start = week1_monday + timedelta(weeks=week - 1)
    end = start + timedelta(days=6)
    return start, end


def week_key(year: int, week: int) -> str:
    return f"{year}-W{week:02d}"


def _is_overdue(task: WeeklyReportTask, now: datetime) -> bool:
    if task.due_date is None:
        return False
    return task.due_date < now.date() and task.status != TaskStatus.done


def _is_changed_this_week(task: WeeklyReportTask, period_start: date, period_end: date) -> bool:
    d = task.updated_at.date()
    return period_start <= d <= period_end


def calc_project_risk(tasks: list, now: datetime) -> str:
    if not tasks:
        return RiskLevel.green
    delayed = sum(1 for t in tasks if _is_overdue(t, now))
    blocked = sum(1 for t in tasks if t.status == TaskStatus.blocked)
    ratio = delayed / max(1, len(tasks))
    if ratio > 0.3 or blocked > 3:
        return RiskLevel.red
    if 0.1 <= ratio <= 0.3:
        return RiskLevel.yellow
    return RiskLevel.green


def _user_display_name(user_id: int) -> str:
    try:
        from apps.identity.models import Account
        acc = Account.objects.filter(id=user_id, is_deleted=False).first()
        return (acc.display_name or acc.username or str(user_id)) if acc else str(user_id)
    except Exception:
        return str(user_id)


def _task_to_dict(t: WeeklyReportTask, project_name: str = "", is_overdue: bool = False, is_changed_this_week: bool = False) -> dict:
    d = {
        "id": t.id,
        "project_id": t.project_id,
        "assignee_id": t.assignee_id,
        "title": t.title,
        "status": t.status,
        "priority": t.priority,
        "progress": t.progress,
        "plan_hours": t.plan_hours,
        "actual_hours": t.actual_hours,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "blocked_reason": t.blocked_reason,
        "project_name": project_name,
        "is_overdue": is_overdue,
        "is_changed_this_week": is_changed_this_week,
    }
    return d


def _derive_task_status(raw_task: Optional[WeeklyReportTask], progress: int) -> str:
    if int(progress) >= 100:
        return TaskStatus.done
    if raw_task is not None and raw_task.status == TaskStatus.blocked:
        return TaskStatus.blocked
    if int(progress) > 0:
        return TaskStatus.doing
    return TaskStatus.todo


def _refresh_project_status(project_id: int) -> None:
    project = WeeklyReportProject.objects.filter(id=project_id).first()
    if project is None:
        return
    now = _now_utc()
    tasks = list(WeeklyReportTask.objects.filter(project_id=project_id))
    next_status = "completed" if tasks and all((t.status == TaskStatus.done or int(t.progress or 0) >= 100) for t in tasks) else "active"
    next_risk = calc_project_risk(tasks, now)
    update_fields = []
    if project.status != next_status:
        project.status = next_status
        update_fields.append("status")
    if project.risk_level != next_risk:
        project.risk_level = next_risk
        update_fields.append("risk_level")
    if update_fields:
        project.save(update_fields=update_fields)


def _sync_report_items_to_tasks_and_projects(report: WeeklyReport) -> None:
    project_ids: set[int] = set()
    items = WeeklyReportItem.objects.filter(report_id=report.id)
    for item in items:
        task = WeeklyReportTask.objects.filter(id=item.task_id).first()
        if task is None:
            continue
        next_progress = int(item.progress_after or 0)
        next_status = _derive_task_status(task, next_progress)
        update_fields = []
        if int(task.progress or 0) != next_progress:
            task.progress = next_progress
            update_fields.append("progress")
        if float(task.actual_hours or 0) != float(item.actual_hours or 0):
            task.actual_hours = float(item.actual_hours or 0)
            update_fields.append("actual_hours")
        if task.status != next_status:
            task.status = next_status
            update_fields.append("status")
        if next_status != TaskStatus.blocked and task.blocked_reason:
            task.blocked_reason = ""
            update_fields.append("blocked_reason")
        if update_fields:
            task.save(update_fields=update_fields)
        project_ids.add(task.project_id)
    for project_id in project_ids:
        _refresh_project_status(project_id)


def list_my_tasks(
    user_id: int,
    report_year: int,
    report_week: int,
    filter_changed: bool = False,
    filter_blocked: bool = False,
    filter_overdue: bool = False,
    all_weeks: bool = False,
) -> list:
    """当前用户的任务列表。all_weeks=True 时返回全部任务（不做本周限制），否则按 report_year/report_week 过滤本周变更。"""
    start, end = get_week_period(report_year, report_week)
    now = _now_utc()
    qs = WeeklyReportTask.objects.filter(assignee_id=user_id).select_related("project")
    out = []
    for t in qs:
        changed = _is_changed_this_week(t, start, end)
        overdue = _is_overdue(t, now)
        if not all_weeks and filter_changed and not changed:
            continue
        if filter_blocked and t.status != TaskStatus.blocked:
            continue
        if filter_overdue and not overdue:
            continue
        project_name = (t.project.name if getattr(t, "project", None) else "") or ""
        d = _task_to_dict(t, project_name=project_name, is_overdue=overdue, is_changed_this_week=changed)
        out.append(d)
    out.sort(key=lambda x: (x["is_overdue"] is False, x["status"], -(x["priority"]), x.get("due_date") or "9999-12-31"))
    return out


def init_my_weekly_report(user_id: int, report_year: int, report_week: int) -> dict:
    start, end = get_week_period(report_year, report_week)
    report = _get_or_create_report(user_id=user_id, report_year=report_year, report_week=report_week, start=start, end=end)
    tasks = list_my_tasks(user_id, report_year, report_week, filter_changed=True)
    # 不在 init 时预选任务写入 items；由用户在选任务步骤勾选后通过保存草稿落库
    notes, _ = WeeklyReportNotes.objects.get_or_create(
        report_id=report.id,
        defaults={"blockers": "", "support_needed": "", "next_week_focus": "", "ops_work": ""},
    )
    task_out_keys = {"id", "project_id", "project_name", "assignee_id", "title", "status", "priority", "progress", "plan_hours", "actual_hours", "due_date", "blocked_reason", "is_overdue", "is_changed_this_week"}
    tasks_clean = [{k: t[k] for k in task_out_keys if k in t} for t in tasks]
    return {"report": _serialize_report(report), "tasks": tasks_clean}


def save_draft(
    user_id: int,
    report_year: int,
    report_week: int,
    selected_task_ids: list,
    item_updates: dict,
    notes: Optional[dict] = None,
    draft_content: Optional[str] = None,
) -> dict:
    start, end = get_week_period(report_year, report_week)
    report = _get_or_create_report(user_id=user_id, report_year=report_year, report_week=report_week, start=start, end=end)
    if report.status == WeeklyReportStatus.submitted:
        raise ValueError("Report already submitted")
    tasks = list_my_tasks(user_id, report_year, report_week, filter_changed=False, all_weeks=True)
    tasks_by_id = {t["id"]: t for t in tasks}
    _ensure_report_items(report.id, selected_task_ids, tasks_by_id=tasks_by_id)
    _apply_item_updates(report.id, item_updates, tasks_by_id=tasks_by_id)
    if draft_content is not None:
        report.draft_content = draft_content
        report.save(update_fields=["draft_content"])
    if notes is not None:
        n, _ = WeeklyReportNotes.objects.get_or_create(
            report_id=report.id,
            defaults=DEFAULT_NOTES_TEMPLATE,
        )
        n.blockers = notes.get("blockers", n.blockers)
        n.support_needed = notes.get("support_needed", n.support_needed)
        n.next_week_focus = notes.get("next_week_focus", n.next_week_focus)
        n.ops_work = notes.get("ops_work", n.ops_work)
        n.next_week_plan = notes.get("next_week_plan", getattr(n, "next_week_plan", ""))
        n.save(update_fields=["blockers", "support_needed", "next_week_focus", "ops_work", "next_week_plan"])
    return _serialize_report(report)


@transaction.atomic
def submit_report(
    user_id: int, report_year: int, report_week: int, submitted_content: Optional[str] = None
) -> dict:
    report = _find_report(user_id, report_year, report_week)
    if report is None:
        raise ValueError("Report not found, init first")
    if report.status == WeeklyReportStatus.submitted:
        return _serialize_report(report)
    _sync_report_items_to_tasks_and_projects(report)
    report.status = WeeklyReportStatus.submitted
    report.submitted_at = _now_utc()
    update_fields = ["status", "submitted_at"]
    if submitted_content is not None:
        report.submitted_content = submitted_content
        update_fields.append("submitted_content")
    report.save(update_fields=update_fields)
    _record_snapshot_for_week(report_year, report_week)
    return _serialize_report(report)


def get_report(user_id: int, report_year: int, report_week: int) -> dict:
    report = _find_report(user_id, report_year, report_week)
    if report is None:
        raise ValueError("Report not found")
    return _serialize_report(report)


def list_my_drafts(user_id: int, limit: int = 20) -> list:
    """当前用户的周报草稿列表，按年周倒序"""
    reports = list(
        WeeklyReport.objects.filter(user_id=user_id, status=WeeklyReportStatus.draft)
        .order_by("-report_year", "-report_week")[:limit]
    )
    return [
        {
            "id": r.id,
            "report_year": r.report_year,
            "report_week": r.report_week,
            "period_start": r.period_start.isoformat() if r.period_start else None,
            "period_end": r.period_end.isoformat() if r.period_end else None,
            "status": r.status,
        }
        for r in reports
    ]


def delete_draft(user_id: int, report_year: int, report_week: int) -> None:
    """删除当前用户的周报草稿（仅草稿可删）"""
    report = _find_report(user_id, report_year, report_week)
    if report is None:
        raise ValueError("Report not found")
    if report.status != WeeklyReportStatus.draft:
        raise ValueError("仅可删除草稿，已提交的周报不可删除")
    report.delete()


def list_my_history(user_id: int, limit: int = 20) -> list:
    """当前用户的历史周报（已提交）列表，按年周倒序"""
    reports = list(
        WeeklyReport.objects.filter(user_id=user_id, status=WeeklyReportStatus.submitted)
        .order_by("-report_year", "-report_week")[:limit]
    )
    return [
        {
            "id": r.id,
            "report_year": r.report_year,
            "report_week": r.report_week,
            "period_start": r.period_start.isoformat() if r.period_start else None,
            "period_end": r.period_end.isoformat() if r.period_end else None,
            "status": r.status,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
        }
        for r in reports
    ]


def reopen_report(user_id: int, report_year: int, report_week: int, requester_id: int, requester_is_admin: bool = False) -> dict:
    report = _find_report(user_id, report_year, report_week)
    if report is None:
        raise ValueError("Report not found")
    if report.status != WeeklyReportStatus.submitted:
        raise ValueError("仅已提交的周报可重新编辑")
    if requester_id != user_id and not requester_is_admin:
        raise ValueError("无权限重新编辑该周报")
    report.status = WeeklyReportStatus.draft
    report.submitted_at = None
    report.save(update_fields=["status", "submitted_at"])
    return _serialize_report(report)


def update_task(task_id: int, user_id: int, patch: dict) -> dict:
    t = WeeklyReportTask.objects.filter(id=task_id).select_related("project").first()
    if t is None:
        raise ValueError("Task not found")
    if t.assignee_id != user_id:
        raise ValueError("Cannot edit others task")
    if "status" in patch and patch["status"] is not None:
        t.status = patch["status"]
    if "progress" in patch and patch["progress"] is not None:
        t.progress = int(patch["progress"])
    if "actual_hours" in patch and patch["actual_hours"] is not None:
        t.actual_hours = float(patch["actual_hours"])
    if "blocked_reason" in patch:
        t.blocked_reason = patch["blocked_reason"]
    t.save()
    now = _now_utc()
    start, end = get_week_period(now.year, now.isocalendar()[1])
    project_name = (t.project.name if getattr(t, "project", None) else "") or ""
    return _task_to_dict(t, project_name=project_name, is_overdue=_is_overdue(t, now), is_changed_this_week=_is_changed_this_week(t, start, end))


def _find_report(user_id: int, report_year: int, report_week: int) -> Optional[WeeklyReport]:
    return WeeklyReport.objects.filter(user_id=user_id, report_year=report_year, report_week=report_week).first()


def _get_or_create_report(user_id: int, report_year: int, report_week: int, start: date, end: date) -> WeeklyReport:
    report, created = WeeklyReport.objects.get_or_create(
        user_id=user_id,
        report_year=report_year,
        report_week=report_week,
        defaults={
            "period_start": start,
            "period_end": end,
            "status": WeeklyReportStatus.draft,
        },
    )
    if created:
        WeeklyReportNotes.objects.get_or_create(
            report_id=report.id,
            defaults=DEFAULT_NOTES_TEMPLATE,
        )
    return report


def _ensure_report_items(report_id: int, selected_task_ids: list, tasks_by_id: dict) -> None:
    now = _now_utc()
    existing = set(WeeklyReportItem.objects.filter(report_id=report_id).values_list("task_id", flat=True))
    to_remove = existing - set(selected_task_ids)
    if to_remove:
        WeeklyReportItem.objects.filter(report_id=report_id, task_id__in=to_remove).delete()
    task_ids_in_db = set(WeeklyReportTask.objects.filter(id__in=selected_task_ids).values_list("id", flat=True))
    for tid in selected_task_ids:
        if tid in existing:
            continue
        t = tasks_by_id.get(tid)
        raw = WeeklyReportTask.objects.filter(id=tid).first()
        if t is None and raw is None:
            continue
        if tid not in task_ids_in_db:
            continue
        if t is not None:
            progress_before = int(t.get("progress", raw.progress if raw else 0))
            progress_after = progress_before
            hours = float(t.get("actual_hours", raw.actual_hours if raw else 0))
        else:
            progress_before = raw.progress
            progress_after = raw.progress
            hours = raw.actual_hours
        delayed = _is_overdue(raw, now) if raw else False
        WeeklyReportItem.objects.create(
            report_id=report_id,
            task_id=tid,
            this_week_delta="",
            progress_before=progress_before,
            progress_after=progress_after,
            actual_hours=hours,
            is_delayed=delayed,
        )


def _apply_item_updates(report_id: int, item_updates: dict, tasks_by_id: dict) -> None:
    now = _now_utc()
    for it in WeeklyReportItem.objects.filter(report_id=report_id):
        patch = item_updates.get(it.task_id)
        if not patch:
            continue
        if "this_week_delta" in patch:
            it.this_week_delta = str(patch.get("this_week_delta") or "")
        if "progress_after" in patch and patch["progress_after"] is not None:
            it.progress_after = int(patch["progress_after"])
        if "actual_hours" in patch and patch["actual_hours"] is not None:
            it.actual_hours = float(patch["actual_hours"])
        raw = WeeklyReportTask.objects.filter(id=it.task_id).first()
        it.is_delayed = _is_overdue(raw, now) if raw else False
        it.save(update_fields=["this_week_delta", "progress_after", "actual_hours", "is_delayed"])


def _serialize_report(report: WeeklyReport) -> dict:
    items = list(WeeklyReportItem.objects.filter(report_id=report.id).values())
    notes = WeeklyReportNotes.objects.filter(report_id=report.id).first()
    if notes is None:
        notes = WeeklyReportNotes.objects.create(report_id=report.id, **DEFAULT_NOTES_TEMPLATE)
    d = {
        "id": report.id,
        "user_id": report.user_id,
        "report_year": report.report_year,
        "report_week": report.report_week,
        "period_start": report.period_start.isoformat() if report.period_start else None,
        "period_end": report.period_end.isoformat() if report.period_end else None,
        "status": report.status,
        "submitted_at": report.submitted_at.isoformat() if report.submitted_at else None,
        "submitted_content": getattr(report, "submitted_content", "") or "",
        "draft_content": getattr(report, "draft_content", "") or "",
        "items": list(items),
        "notes": {
            "report_id": notes.report_id,
            "blockers": notes.blockers,
            "support_needed": notes.support_needed,
            "next_week_focus": notes.next_week_focus,
            "ops_work": notes.ops_work,
            "next_week_plan": getattr(notes, "next_week_plan", "") or "",
        },
    }
    return d


def _record_snapshot_for_week(year: int, week: int) -> None:
    key = week_key(year, week)
    metrics = _overview_for_week(year, week)
    MetricSnapshot.objects.create(
        scope_type="team",
        scope_id="all",
        period_type="week",
        period_key=key,
        metrics_json=metrics,
    )


def _overview_for_week(year: int, week: int) -> dict:
    key = week_key(year, week)
    reports = list(WeeklyReport.objects.filter(report_year=year, report_week=week))
    total_users = max(1, WeeklyReportTask.objects.values("assignee_id").distinct().count())
    submitted = sum(1 for r in reports if r.status == WeeklyReportStatus.submitted)
    submit_rate = submitted / total_users
    now = _now_utc()
    tasks = list(WeeklyReportTask.objects.all())
    completion_rate = sum(1 for t in tasks if t.status == TaskStatus.done) / max(1, len(tasks))
    overdue_rate = sum(1 for t in tasks if _is_overdue(t, now)) / max(1, len(tasks))
    projects = list(WeeklyReportProject.objects.all())
    risk_count = 0
    for p in projects:
        tasks = list(WeeklyReportTask.objects.filter(project_id=p.id))
        if calc_project_risk(tasks, now) in (RiskLevel.yellow, RiskLevel.red):
            risk_count += 1
    risk_rate = risk_count / max(1, len(projects))
    return {"period_type": "week", "period_key": key, "submit_rate": round(submit_rate, 4), "completion_rate": round(completion_rate, 4), "overdue_rate": round(overdue_rate, 4), "risk_rate": round(risk_rate, 4)}


def list_users() -> list:
    try:
        from apps.identity.models import Account
        return [{"id": acc.id, "name": acc.display_name or acc.username or str(acc.id)} for acc in Account.objects.filter(is_deleted=False).order_by("id")[:200]]
    except Exception:
        return []


def _user_can_see_project(project_id: int, user_id: int, is_admin: bool) -> bool:
    if is_admin:
        return True
    p = WeeklyReportProject.objects.filter(id=project_id).first()
    if not p:
        return False
    if p.created_by == user_id:
        return True
    if WeeklyReportTask.objects.filter(project_id=project_id, assignee_id=user_id).exists():
        return True
    return False


def _user_can_edit_project(project_id: int, user_id: Optional[int], is_admin: bool) -> bool:
    if user_id is None:
        return False
    if is_admin:
        return True
    p = WeeklyReportProject.objects.filter(id=project_id).first()
    if not p:
        return False
    return p.created_by == user_id


def list_projects(
    user_id: Optional[int] = None,
    created_by_filter: str = "all",
    is_admin: bool = False,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> Any:
    """
    自己创建和参与的项目列表。
    支持按 start_date 年周倒序（日期越新越靠前）、搜索项目名、分页。
    """
    qs = WeeklyReportProject.objects.all()
    if search and search.strip():
        qs = qs.filter(name__icontains=search.strip())
    # 按年、周倒序：以项目 start_date 的 ISO 年周排序，start_date 空置后
    qs = qs.order_by(F("start_date").desc(nulls_last=True), "-id")
    # 先过滤可见性再计数，避免 N+1
    out = []
    for p in qs:
        if user_id is not None and not is_admin and not _user_can_see_project(p.id, user_id, False):
            continue
        if user_id is not None and created_by_filter != "all":
            if created_by_filter == "mine" and p.created_by != user_id:
                continue
            if created_by_filter == "others" and p.created_by == user_id:
                continue
        task_count = WeeklyReportTask.objects.filter(project_id=p.id).count()
        member_ids = list(WeeklyReportTask.objects.filter(project_id=p.id).values_list("assignee_id", flat=True).distinct())
        d = {
            "id": p.id,
            "name": p.name,
            "owner_id": p.owner_id,
            "created_by": p.created_by,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "status": p.status,
            "risk_level": p.risk_level,
            "member_ids": member_ids,
            "task_count": task_count,
            "created_by_name": _user_display_name(p.created_by),
            "can_edit": _user_can_edit_project(p.id, user_id, is_admin),
        }
        out.append(d)
    total = len(out)
    if page is not None and page_size is not None and page >= 1 and page_size >= 1:
        start = (page - 1) * page_size
        out = out[start : start + page_size]
        return {"items": out, "total": total}
    return out


def get_project_detail(project_id: int, requester_id: Optional[int] = None, requester_is_admin: bool = False) -> dict:
    p = WeeklyReportProject.objects.filter(id=project_id).first()
    if p is None:
        raise ValueError("Project not found")
    if requester_id is not None and not _user_can_see_project(project_id, requester_id, requester_is_admin):
        raise ValueError("无权限查看该项目")
    now = _now_utc()
    tasks = list(WeeklyReportTask.objects.filter(project_id=project_id))
    risk = calc_project_risk(tasks, now)
    p.risk_level = risk
    p.save(update_fields=["risk_level"])
    contrib = {}
    for t in tasks:
        contrib.setdefault(t.assignee_id, {"user_id": t.assignee_id, "tasks": 0, "done": 0})
        contrib[t.assignee_id]["tasks"] += 1
        if t.status == TaskStatus.done:
            contrib[t.assignee_id]["done"] += 1
    proj_dict = {
        "id": p.id,
        "name": p.name,
        "owner_id": p.owner_id,
        "created_by": p.created_by,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "status": p.status,
        "risk_level": p.risk_level,
        "created_by_name": _user_display_name(p.created_by),
        "member_ids": list(WeeklyReportTask.objects.filter(project_id=p.id).values_list("assignee_id", flat=True).distinct()),
    }
    can_edit = _user_can_edit_project(project_id, requester_id, requester_is_admin)
    task_list = []
    for t in tasks:
        task_list.append({
            "id": t.id,
            "project_id": t.project_id,
            "assignee_id": t.assignee_id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "progress": t.progress,
            "plan_hours": t.plan_hours,
            "actual_hours": t.actual_hours,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "blocked_reason": t.blocked_reason,
        })
    return {"project": proj_dict, "can_edit": can_edit, "members_contribution": list(contrib.values()), "tasks": task_list}


@transaction.atomic
def create_project(payload: dict, created_by: int) -> dict:
    tasks_payload = list(payload.get("tasks") or [])
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    if isinstance(start_date, str) and start_date:
        start_date = date.fromisoformat(start_date)
    else:
        start_date = None
    if isinstance(end_date, str) and end_date:
        end_date = date.fromisoformat(end_date)
    else:
        end_date = None
    p = WeeklyReportProject.objects.create(
        name=payload["name"],
        owner_id=int(payload["owner_id"]),
        created_by=created_by,
        start_date=start_date,
        end_date=end_date,
        status="active",
        risk_level=RiskLevel.green,
    )
    for row in tasks_payload:
        assignee_id = int(row.get("assignee_id", 0))
        if not assignee_id:
            continue
        due = row.get("due_date")
        if isinstance(due, str):
            due = date.fromisoformat(due) if due else None
        WeeklyReportTask.objects.create(
            project_id=p.id,
            assignee_id=assignee_id,
            title=str(row.get("title", "未命名任务")),
            status=row.get("status", TaskStatus.todo),
            priority=int(row.get("priority", 1)),
            progress=int(row.get("progress", 0)),
            plan_hours=float(row.get("plan_hours", 0)),
            actual_hours=0,
            due_date=due,
            blocked_reason=row.get("blocked_reason"),
        )
    return {
        "id": p.id,
        "name": p.name,
        "owner_id": p.owner_id,
        "created_by": p.created_by,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "status": p.status,
        "risk_level": p.risk_level,
    }


@transaction.atomic
def update_project(project_id: int, requester_id: int, requester_is_admin: bool, payload: dict) -> dict:
    p = WeeklyReportProject.objects.filter(id=project_id).first()
    if p is None:
        raise ValueError("Project not found")
    if not _user_can_edit_project(project_id, requester_id, requester_is_admin):
        raise ValueError("无权限编辑该项目")
    tasks_payload = list(payload.get("tasks") or [])
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    if isinstance(start_date, str) and start_date:
        start_date = date.fromisoformat(start_date)
    else:
        start_date = None
    if isinstance(end_date, str) and end_date:
        end_date = date.fromisoformat(end_date)
    else:
        end_date = None
    p.name = payload.get("name", p.name)
    p.owner_id = int(payload.get("owner_id", p.owner_id))
    if start_date is not None:
        p.start_date = start_date
    if end_date is not None:
        p.end_date = end_date
    p.save(update_fields=["name", "owner_id", "start_date", "end_date"])
    WeeklyReportTask.objects.filter(project_id=project_id).delete()
    for row in tasks_payload:
        assignee_id = int(row.get("assignee_id", 0))
        if not assignee_id:
            continue
        due = row.get("due_date")
        if isinstance(due, str):
            due = date.fromisoformat(due) if due else None
        WeeklyReportTask.objects.create(
            project_id=project_id,
            assignee_id=assignee_id,
            title=str(row.get("title", "未命名任务")),
            status=row.get("status", TaskStatus.todo),
            priority=int(row.get("priority", 1)),
            progress=int(row.get("progress", 0)),
            plan_hours=float(row.get("plan_hours", 0)),
            actual_hours=0,
            due_date=due,
            blocked_reason=row.get("blocked_reason"),
        )
    return {
        "id": p.id,
        "name": p.name,
        "owner_id": p.owner_id,
        "created_by": p.created_by,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "status": p.status,
        "risk_level": p.risk_level,
    }


@transaction.atomic
def complete_project(project_id: int, requester_id: int, requester_is_admin: bool) -> dict:
    p = WeeklyReportProject.objects.filter(id=project_id).first()
    if p is None:
        raise ValueError("Project not found")
    if not _user_can_edit_project(project_id, requester_id, requester_is_admin):
        raise ValueError("无权限编辑该项目")
    WeeklyReportTask.objects.filter(project_id=project_id).exclude(
        status=TaskStatus.done,
        progress=100,
    ).update(
        status=TaskStatus.done,
        progress=100,
        blocked_reason="",
    )
    _refresh_project_status(project_id)
    p.refresh_from_db(fields=["status", "risk_level"])
    return {
        "id": p.id,
        "name": p.name,
        "owner_id": p.owner_id,
        "created_by": p.created_by,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "status": p.status,
        "risk_level": p.risk_level,
    }


@transaction.atomic
def activate_project(project_id: int, requester_id: int, requester_is_admin: bool) -> dict:
    p = WeeklyReportProject.objects.filter(id=project_id).first()
    if p is None:
        raise ValueError("Project not found")
    if not _user_can_edit_project(project_id, requester_id, requester_is_admin):
        raise ValueError("无权限编辑该项目")
    if p.status != "active":
        p.status = "active"
        p.save(update_fields=["status"])
    return {
        "id": p.id,
        "name": p.name,
        "owner_id": p.owner_id,
        "created_by": p.created_by,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "status": p.status,
        "risk_level": p.risk_level,
    }


def dashboard_overview(period_type: Literal["week", "month", "year"], period_key: str) -> dict:
    if period_type == "week":
        if not period_key:
            y, w, _ = datetime.now().isocalendar()
            period_key = week_key(y, w)
        parts = period_key.split("-W")
        year, week = int(parts[0]), int(parts[1]) if len(parts) > 1 else 1
        return _overview_for_week(year, week)
    return _overview_for_week(datetime.now().year, 1)


def dashboard_project_health(period_type: str, period_key: str, user_id: Optional[int] = None, created_by_filter: str = "all", is_admin: bool = False) -> dict:
    now = _now_utc()
    qs = WeeklyReportProject.objects.all().order_by("-id")
    items = []
    for p in qs:
        if user_id is not None and not is_admin and not _user_can_see_project(p.id, user_id, False):
            continue
        if user_id is not None and created_by_filter != "all":
            if created_by_filter == "mine" and p.created_by != user_id:
                continue
            if created_by_filter == "others" and p.created_by == user_id:
                continue
        tasks = list(WeeklyReportTask.objects.filter(project_id=p.id))
        delayed = sum(1 for t in tasks if _is_overdue(t, now))
        blocked = sum(1 for t in tasks if t.status == TaskStatus.blocked)
        ratio = delayed / max(1, len(tasks))
        risk = calc_project_risk(tasks, now)
        p.risk_level = risk
        p.save(update_fields=["risk_level"])
        proj_dict = {
            "id": p.id,
            "name": p.name,
            "owner_id": p.owner_id,
            "created_by": p.created_by,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "status": p.status,
            "risk_level": p.risk_level,
            "created_by_name": _user_display_name(p.created_by),
        }
        items.append({"project": proj_dict, "delayed_ratio": ratio, "blocked_count": blocked, "gantt": []})
    return {"period_type": period_type, "period_key": period_key or week_key(now.year, now.isocalendar()[1]), "items": items}


def dashboard_team_heatmap(period_type: str, period_key: str) -> dict:
    users = {}
    for t in WeeklyReportTask.objects.all():
        users.setdefault(t.assignee_id, {"user_id": t.assignee_id, "task_updates": 0, "report_submits": 0, "heat": 0})
        users[t.assignee_id]["task_updates"] += 1
    for r in WeeklyReport.objects.filter(status=WeeklyReportStatus.submitted):
        users.setdefault(r.user_id, {"user_id": r.user_id, "task_updates": 0, "report_submits": 0, "heat": 0})
        users[r.user_id]["report_submits"] += 1
    for u in users.values():
        u["heat"] = u["task_updates"] * 1 + u["report_submits"] * 5
    return {"period_type": period_type, "period_key": period_key, "users": sorted(users.values(), key=lambda x: -x["heat"])}


def dashboard_drilldown(scope_type: Literal["user", "project", "report"], scope_id: str, period_key: str) -> dict:
    if scope_type == "project":
        return {"scope_type": scope_type, "scope_id": scope_id, "period_key": period_key, "data": get_project_detail(int(scope_id))}
    if scope_type == "report":
        rid = int(scope_id)
        report = WeeklyReport.objects.filter(id=rid).first()
        if report is None:
            raise ValueError("Report not found")
        return {"scope_type": scope_type, "scope_id": scope_id, "period_key": period_key, "data": _serialize_report(report)}
    uid = int(scope_id)
    reports = list(WeeklyReport.objects.filter(user_id=uid).order_by("-report_year", "-report_week")[:12])
    return {"scope_type": scope_type, "scope_id": scope_id, "period_key": period_key, "data": {"reports": [_serialize_report(r) for r in reports]}}


def get_subordinate_ids(leader_id: int) -> list[int]:
    """获取当前用户作为领导所管理的下属 user_id 列表"""
    return list(
        WeeklyReportLeader.objects.filter(leader_id=leader_id).values_list("user_id", flat=True)
    )


def list_subordinate_reports(leader_id: int, year: int, week: int) -> list[dict]:
    """领导查看下属已提交的周报列表（指定年周）"""
    sub_ids = get_subordinate_ids(leader_id)
    if not sub_ids:
        return []
    reports = list(
        WeeklyReport.objects.filter(
            user_id__in=sub_ids,
            report_year=year,
            report_week=week,
            status=WeeklyReportStatus.submitted,
        ).order_by("user_id")
    )
    return [
        {
            **_serialize_report(r),
            "user_name": _user_display_name(r.user_id),
        }
        for r in reports
    ]


def nudge(user_ids: list, week_key_str: str, remind_type: str) -> list:
    now = _now_utc()
    sent = []
    for uid in user_ids:
        r = ReportReminder.objects.create(user_id=uid, week_key=week_key_str, remind_type=remind_type, sent_at=now)
        sent.append({"id": r.id, "user_id": r.user_id, "week_key": r.week_key, "remind_type": r.remind_type, "sent_at": r.sent_at.isoformat()})
    return sent


def run_weekly_reminder(scope: Literal["team", "all"] = "team", now_iso: Optional[str] = None) -> dict:
    now = datetime.fromisoformat(now_iso.replace("Z", "+00:00")) if now_iso else _now_utc()
    y, w, _ = now.isocalendar()
    key = week_key(y, w)
    submitted_user_ids = set(
        WeeklyReport.objects.filter(report_year=y, report_week=w, status=WeeklyReportStatus.submitted).values_list("user_id", flat=True)
    )
    if scope == "all":
        from_user = set(WeeklyReport.objects.values_list("user_id", flat=True))
        from_tasks = set(WeeklyReportTask.objects.values_list("assignee_id", flat=True))
        all_user_ids = from_user | from_tasks
    else:
        all_user_ids = set(WeeklyReportTask.objects.values_list("assignee_id", flat=True))
    to_remind = [uid for uid in all_user_ids if uid not in submitted_user_ids]
    sent = nudge(to_remind, key, "auto")
    return {"ok": True, "week_key": key, "reminded_count": len(sent), "reminded_ids": to_remind}
