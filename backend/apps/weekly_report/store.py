"""
周报系统存储（已弃用）

数据已迁移至 PostgreSQL，请使用 apps.weekly_report.models 与 services。
本模块仅保留数据结构定义供参考，不再被 services 使用。
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from .constants import RiskLevel, TaskStatus, WeeklyReportStatus


def _get_persistence_path() -> str:
    """持久化 JSON 文件路径：backend/data/weekly_report_data.json"""
    base = os.path.dirname(os.path.abspath(__file__))
    # apps/weekly_report -> backend
    backend = os.path.normpath(os.path.join(base, "..", ".."))
    data_dir = os.path.join(backend, "data")
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "weekly_report_data.json")


@dataclass
class Project:
    id: int
    name: str
    owner_id: int
    created_by: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = "active"
    risk_level: RiskLevel = RiskLevel.green


@dataclass
class Task:
    id: int
    project_id: int
    assignee_id: int
    title: str
    status: TaskStatus
    priority: int
    progress: int
    plan_hours: float
    actual_hours: float
    due_date: Optional[date] = None
    blocked_reason: Optional[str] = None
    updated_at: datetime = None

    def __post_init__(self):
        if self.updated_at is None:
            self.updated_at = datetime.now(tz=timezone.utc)


@dataclass
class WeeklyReport:
    id: int
    user_id: int
    report_year: int
    report_week: int
    period_start: date
    period_end: date
    status: WeeklyReportStatus
    submitted_at: Optional[datetime] = None


@dataclass
class WeeklyReportItem:
    report_id: int
    task_id: int
    this_week_delta: str
    progress_before: int
    progress_after: int
    actual_hours: float
    is_delayed: bool


@dataclass
class WeeklyReportNotes:
    report_id: int
    blockers: str = ""
    support_needed: str = ""
    next_week_focus: str = ""
    ops_work: str = ""


@dataclass
class ReportReminder:
    id: int
    user_id: int
    week_key: str
    remind_type: str
    sent_at: datetime


@dataclass
class MetricSnapshot:
    id: int
    scope_type: str
    scope_id: str
    period_type: str
    period_key: str
    metrics_json: dict
    created_at: datetime


def _serialize_value(v: Any) -> Any:
    if isinstance(v, date) and not isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, datetime):
        return v.isoformat()
    if hasattr(v, "value"):  # Enum
        return v.value
    return v


def _deserialize_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    return date.fromisoformat(s[:10])


def _deserialize_datetime(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


class InMemoryDB:
    def __init__(self) -> None:
        self._seq = {
            "project": 100,
            "task": 1000,
            "report": 5000,
            "reminder": 8000,
            "snapshot": 9000,
        }
        self.projects = {}
        self.project_members = []
        self.tasks = {}
        self.reports = {}
        self.report_items = []
        self.report_notes = {}
        self.reminders = {}
        self.snapshots = {}
        if not self._load():
            self._seed()

    def next_id(self, kind: str) -> int:
        self._seq[kind] += 1
        return self._seq[kind]

    def save(self) -> None:
        """将当前数据持久化到 JSON 文件，服务重启后可恢复。"""
        path = _get_persistence_path()
        out = {
            "_seq": self._seq,
            "projects": [
                {k: _serialize_value(v) for k, v in asdict(p).items()}
                for p in self.projects.values()
            ],
            "project_members": list(self.project_members),
            "tasks": [
                {k: _serialize_value(v) for k, v in asdict(t).items()}
                for t in self.tasks.values()
            ],
            "reports": [
                {k: _serialize_value(v) for k, v in asdict(r).items()}
                for r in self.reports.values()
            ],
            "report_items": [asdict(it) for it in self.report_items],
            "report_notes": [asdict(n) for n in self.report_notes.values()],
            "reminders": [
                {k: _serialize_value(v) for k, v in asdict(r).items()}
                for r in self.reminders.values()
            ],
            "snapshots": [
                {k: _serialize_value(v) for k, v in asdict(s).items()}
                for s in self.snapshots.values()
            ],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

    def _load(self) -> bool:
        """从 JSON 文件加载；成功返回 True，否则返回 False 并保持空状态。"""
        path = _get_persistence_path()
        if not os.path.isfile(path):
            return False
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return False
        self._seq = data.get("_seq", self._seq)
        for row in data.get("projects", []):
            p = Project(
                id=row["id"],
                name=row["name"],
                owner_id=row["owner_id"],
                created_by=row["created_by"],
                start_date=_deserialize_date(row.get("start_date")),
                end_date=_deserialize_date(row.get("end_date")),
                status=row.get("status", "active"),
                risk_level=RiskLevel(row["risk_level"]) if isinstance(row.get("risk_level"), str) else row.get("risk_level", RiskLevel.green),
            )
            self.projects[p.id] = p
        self.project_members = [tuple(x) for x in data.get("project_members", [])]
        for row in data.get("tasks", []):
            t = Task(
                id=row["id"],
                project_id=row["project_id"],
                assignee_id=row["assignee_id"],
                title=row["title"],
                status=TaskStatus(row["status"]) if isinstance(row.get("status"), str) else row["status"],
                priority=row["priority"],
                progress=row["progress"],
                plan_hours=float(row["plan_hours"]),
                actual_hours=float(row["actual_hours"]),
                due_date=_deserialize_date(row.get("due_date")),
                blocked_reason=row.get("blocked_reason"),
                updated_at=_deserialize_datetime(row.get("updated_at")) or datetime.now(tz=timezone.utc),
            )
            self.tasks[t.id] = t
        for row in data.get("reports", []):
            r = WeeklyReport(
                id=row["id"],
                user_id=row["user_id"],
                report_year=row["report_year"],
                report_week=row["report_week"],
                period_start=date.fromisoformat(row["period_start"][:10]),
                period_end=date.fromisoformat(row["period_end"][:10]),
                status=WeeklyReportStatus(row["status"]) if isinstance(row.get("status"), str) else row["status"],
                submitted_at=_deserialize_datetime(row.get("submitted_at")),
            )
            self.reports[r.id] = r
        for row in data.get("report_items", []):
            self.report_items.append(
                WeeklyReportItem(
                    report_id=row["report_id"],
                    task_id=row["task_id"],
                    this_week_delta=row.get("this_week_delta", ""),
                    progress_before=row.get("progress_before", 0),
                    progress_after=row.get("progress_after", 0),
                    actual_hours=float(row.get("actual_hours", 0)),
                    is_delayed=row.get("is_delayed", False),
                )
            )
        for row in data.get("report_notes", []):
            n = WeeklyReportNotes(
                report_id=row["report_id"],
                blockers=row.get("blockers", ""),
                support_needed=row.get("support_needed", ""),
                next_week_focus=row.get("next_week_focus", ""),
                ops_work=row.get("ops_work", ""),
            )
            self.report_notes[n.report_id] = n
        for row in data.get("reminders", []):
            rm = ReportReminder(
                id=row["id"],
                user_id=row["user_id"],
                week_key=row["week_key"],
                remind_type=row["remind_type"],
                sent_at=_deserialize_datetime(row.get("sent_at")) or datetime.now(tz=timezone.utc),
            )
            self.reminders[rm.id] = rm
        for row in data.get("snapshots", []):
            s = MetricSnapshot(
                id=row["id"],
                scope_type=row["scope_type"],
                scope_id=row["scope_id"],
                period_type=row["period_type"],
                period_key=row["period_key"],
                metrics_json=row.get("metrics_json", {}),
                created_at=_deserialize_datetime(row.get("created_at")) or datetime.now(tz=timezone.utc),
            )
            self.snapshots[s.id] = s
        return True

    def _week_period(self, year: int, week: int) -> tuple:
        jan4 = date(year, 1, 4)
        week1_monday = jan4 - timedelta(days=jan4.isoweekday() - 1)
        start = week1_monday + timedelta(weeks=week - 1)
        end = start + timedelta(days=6)
        return start, end

    def _seed(self) -> None:
        now = datetime.now(tz=timezone.utc)
        d = now.date()
        y, w, _ = now.isocalendar()

        p1 = Project(
            id=1, name="示例项目", owner_id=1, created_by=1,
            start_date=d - timedelta(days=60), end_date=d + timedelta(days=30),
            risk_level=RiskLevel.green,
        )
        p2 = Project(
            id=2, name="核心系统重构", owner_id=1, created_by=1,
            start_date=d - timedelta(days=45), end_date=d + timedelta(days=14),
            risk_level=RiskLevel.yellow,
        )
        p3 = Project(
            id=3, name="新业务线孵化", owner_id=1, created_by=1,
            start_date=d - timedelta(days=20), end_date=d + timedelta(days=60),
            risk_level=RiskLevel.red,
        )
        self.projects = {p1.id: p1, p2.id: p2, p3.id: p3}
        self.project_members = [(1, 1), (1, 2), (2, 1), (2, 3), (3, 2), (3, 3)]

        past = d - timedelta(days=5)
        task_list = [
            Task(11, 1, 1, "示例任务（用户1）", TaskStatus.doing, 2, 40, 10, 3, d + timedelta(days=7), None, now - timedelta(days=1)),
            Task(12, 1, 2, "示例任务（用户2）", TaskStatus.todo, 2, 0, 8, 0, d + timedelta(days=14), None, now - timedelta(days=2)),
            Task(13, 1, 1, "前端组件库升级", TaskStatus.done, 1, 100, 16, 14, d - timedelta(days=2), None, now - timedelta(days=3)),
            Task(14, 1, 2, "接口联调", TaskStatus.doing, 2, 60, 10, 6, d + timedelta(days=5), None, now - timedelta(days=1)),
            Task(21, 2, 1, "数据迁移脚本", TaskStatus.done, 1, 100, 20, 18, d - timedelta(days=7), None, now - timedelta(days=5)),
            Task(22, 2, 3, "性能优化", TaskStatus.doing, 2, 35, 12, 4, past, None, now - timedelta(days=2)),
            Task(23, 2, 1, "依赖升级", TaskStatus.blocked, 2, 20, 8, 2, d + timedelta(days=10), "等待安全评审", now - timedelta(days=4)),
            Task(24, 2, 3, "监控告警", TaskStatus.todo, 3, 0, 6, 0, past - timedelta(days=3), None, now - timedelta(days=8)),
            Task(31, 3, 2, "需求评审", TaskStatus.done, 1, 100, 4, 4, d - timedelta(days=10), None, now - timedelta(days=7)),
            Task(32, 3, 3, "技术方案", TaskStatus.doing, 2, 50, 12, 6, d + timedelta(days=14), None, now - timedelta(days=1)),
            Task(33, 3, 2, "原型设计", TaskStatus.blocked, 2, 30, 8, 2, d + timedelta(days=7), "等待设计资源", now - timedelta(days=3)),
            Task(34, 3, 3, "环境搭建", TaskStatus.todo, 3, 0, 10, 0, d + timedelta(days=21), None, now - timedelta(days=5)),
        ]
        self.tasks = {t.id: t for t in task_list}

        start1, end1 = self._week_period(y, w)
        start0, end0 = self._week_period(y, w - 1)
        start_2, end_2 = self._week_period(y, w - 2)
        for rid, uid, ry, rw, ps, pe, st in [
            (5001, 1, y, w, start1, end1, WeeklyReportStatus.submitted),
            (5002, 2, y, w, start1, end1, WeeklyReportStatus.submitted),
            (5003, 3, y, w, start1, end1, WeeklyReportStatus.draft),
            (5004, 1, y, w - 1, start0, end0, WeeklyReportStatus.submitted),
            (5005, 2, y, w - 1, start0, end0, WeeklyReportStatus.submitted),
            (5006, 3, y, w - 1, start0, end0, WeeklyReportStatus.submitted),
            (5007, 1, y, w - 2, start_2, end_2, WeeklyReportStatus.submitted),
            (5008, 2, y, w - 2, start_2, end_2, WeeklyReportStatus.submitted),
        ]:
            self.reports[rid] = WeeklyReport(
                id=rid, user_id=uid, report_year=ry, report_week=rw,
                period_start=ps, period_end=pe, status=st,
                submitted_at=now - timedelta(days=2) if st == WeeklyReportStatus.submitted else None,
            )
            self.report_notes[rid] = WeeklyReportNotes(
                report_id=rid, blockers="", support_needed="", next_week_focus="下周按计划推进", ops_work="",
            )
        self.report_items = [
            WeeklyReportItem(5001, 11, "完成进度更新", 30, 40, 3, False),
            WeeklyReportItem(5001, 13, "已验收", 100, 100, 14, False),
            WeeklyReportItem(5002, 12, "需求确认", 0, 0, 0, False),
            WeeklyReportItem(5004, 11, "开发中", 20, 30, 2, False),
        ]
        self._seq["report"] = 5010
        self._seq["task"] = 50


DB = InMemoryDB()
