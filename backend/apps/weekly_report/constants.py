from __future__ import annotations

from enum import Enum


class _StrEnum(str, Enum):
    def __str__(self) -> str:
        return str(self.value)


class WeeklyReportStatus(_StrEnum):
    draft = "draft"
    submitted = "submitted"


class TaskStatus(_StrEnum):
    todo = "todo"
    doing = "doing"
    blocked = "blocked"
    done = "done"


class RiskLevel(_StrEnum):
    green = "green"
    yellow = "yellow"
    red = "red"


DEFAULT_NOTES_TEMPLATE = {
    "blockers": "",
    "support_needed": "",
    "next_week_focus": "",
    "ops_work": "",
    "next_week_plan": "",
}
