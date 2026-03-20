"""
周报系统 API（研究台）

与设计文档 2.3 节对齐，路径前缀 /weekly-report-management。
认证使用 JWT，user_id 从 request 当前账号获取。
"""
import logging
from datetime import datetime
from typing import Any, Literal, Optional

logger = logging.getLogger(__name__)

from ninja import Router, Schema
from django.http import JsonResponse

from . import services
from apps.identity.decorators import _get_account_from_request
from apps.identity.authz import get_authz_service

router = Router(tags=["周报"])

# 内部调度（定时任务调用，MVP 可不鉴权）
internal_router = Router(tags=["周报-内部"], auth=None)


def _user_id(request):
    account = _get_account_from_request(request)
    if not account:
        return None
    return getattr(account, "id", None)


def _auth_required(request):
    uid = _user_id(request)
    if uid is None:
        return JsonResponse({"code": 403, "msg": "请先登录", "data": {"error_code": "AUTH_REQUIRED"}}, status=403)
    return None


def _is_admin(request) -> bool:
    """当前用户是否为管理员（admin/superadmin），管理员可见所有项目。"""
    account = _get_account_from_request(request)
    if not account:
        return False
    authz = get_authz_service()
    return authz.has_any_role(account.id, ["admin", "superadmin"])


# --------------- Schemas ---------------


class WeeklyReportDraftIn(Schema):
    report_year: int
    report_week: int
    selected_task_ids: list[int] = []
    item_updates: dict[int, dict[str, Any]] = {}
    notes: Optional[dict[str, str]] = None
    draft_content: Optional[str] = None


class SubmitIn(Schema):
    report_year: int
    report_week: int
    submitted_content: Optional[str] = None  # 预览框编辑后的周报正文，提交时一并保存


class DeleteDraftIn(Schema):
    report_year: int
    report_week: int


class ReopenIn(Schema):
    report_year: int
    report_week: int
    target_user_id: Optional[int] = None  # 仅管理员可传，重新打开该用户的周报


class TaskUpdateIn(Schema):
    status: Optional[str] = None
    progress: Optional[int] = None
    actual_hours: Optional[float] = None
    blocked_reason: Optional[str] = None


class TaskCreateItem(Schema):
    title: str
    assignee_id: int
    due_date: Optional[str] = None
    priority: int = 1  # 1=正常 2=高 3=急
    plan_hours: float = 0
    status: str = "todo"
    progress: int = 0


class ProjectCreateIn(Schema):
    name: str
    owner_id: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    member_ids: list[int] = []
    tasks: list[TaskCreateItem] = []


class ProjectUpdateIn(Schema):
    name: str
    owner_id: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    member_ids: list[int] = []
    tasks: list[TaskCreateItem] = []


class NudgeIn(Schema):
    week_key: str
    user_ids: list[int]
    remind_type: str = "nudge"


# --------------- 周报 ---------------


@router.get("/my-weekly-report/init")
def init_my_weekly_report(request, year: int, week: int, user_id: Optional[int] = None):
    """
    获取指定年周的周报与任务。当前用户看自己的；管理员可传 user_id 查看指定用户的最新提交内容。
    """
    err = _auth_required(request)
    if err is not None:
        return err
    if year < 2000 or year > 2100 or week < 1 or week > 53:
        return JsonResponse({"code": 400, "msg": "invalid year or week", "data": None}, status=400)
    uid = _user_id(request)
    is_admin = _is_admin(request)
    target_uid = user_id if (is_admin and user_id is not None) else uid
    try:
        data = services.init_my_weekly_report(user_id=target_uid, report_year=year, report_week=week)
        data["is_admin"] = is_admin
        data["viewing_user_id"] = target_uid
        data["current_user_id"] = uid
        return {"code": 200, "msg": "OK", "data": data}
    except Exception as e:
        msg = str(e) or "周报初始化失败，请稍后重试"
        logger.exception("周报 init 失败: %s", msg)
        return JsonResponse({"code": 500, "msg": msg, "data": None}, status=500)


@router.post("/my-weekly-report/draft")
def save_draft(request, payload: WeeklyReportDraftIn):
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        body = payload.dict()
        item_updates = {int(k): v for k, v in (body.get("item_updates") or {}).items()}
        report = services.save_draft(
            user_id=_user_id(request),
            report_year=payload.report_year,
            report_week=payload.report_week,
            selected_task_ids=payload.selected_task_ids,
            item_updates=item_updates,
            notes=payload.notes,
            draft_content=payload.draft_content,
        )
        return {"code": 200, "msg": "OK", "data": report}
    except ValueError as e:
        return JsonResponse({"code": 400, "msg": str(e), "data": None}, status=400)


@router.post("/my-weekly-report/draft/delete")
def delete_draft(request, payload: DeleteDraftIn):
    """删除当前用户的周报草稿（仅草稿可删）"""
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        services.delete_draft(_user_id(request), payload.report_year, payload.report_week)
        return {"code": 200, "msg": "OK", "data": None}
    except ValueError as e:
        return JsonResponse({"code": 400, "msg": str(e), "data": None}, status=400)


@router.post("/my-weekly-report/submit")
def submit_report(request, payload: SubmitIn):
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        report = services.submit_report(
            _user_id(request), payload.report_year, payload.report_week,
            submitted_content=payload.submitted_content,
        )
        return {"code": 200, "msg": "OK", "data": report}
    except ValueError as e:
        return JsonResponse({"code": 400, "msg": str(e), "data": None}, status=400)


@router.get("/my-weekly-report/drafts")
def list_drafts(request, limit: int = 20):
    """周报草稿列表（当前用户）"""
    err = _auth_required(request)
    if err is not None:
        return err
    data = services.list_my_drafts(_user_id(request), limit=min(limit, 50))
    return {"code": 200, "msg": "OK", "data": data}


@router.get("/my-weekly-report/history")
def list_history(request, limit: int = 20):
    """历史周报列表（当前用户，已提交）"""
    err = _auth_required(request)
    if err is not None:
        return err
    data = services.list_my_history(_user_id(request), limit=min(limit, 50))
    return {"code": 200, "msg": "OK", "data": data}


@router.get("/my-weekly-report/{year}/{week}")
def get_history(request, year: int, week: int):
    err = _auth_required(request)
    if err is not None:
        return err
    if year < 2000 or year > 2100 or week < 1 or week > 53:
        return JsonResponse({"code": 400, "msg": "invalid year or week", "data": None}, status=400)
    try:
        report = services.get_report(_user_id(request), year, week)
        return {"code": 200, "msg": "OK", "data": report}
    except ValueError:
        return JsonResponse({"code": 404, "msg": "Report not found", "data": None}, status=404)


@router.post("/my-weekly-report/reopen")
def reopen_my_weekly_report(request, payload: ReopenIn):
    """已提交的周报重新打开为草稿，可再次编辑。本人可操作自己的；管理员可传 target_user_id 重开指定用户的周报。"""
    err = _auth_required(request)
    if err is not None:
        return err
    uid = _user_id(request)
    is_admin = _is_admin(request)
    target_uid = payload.target_user_id if (is_admin and payload.target_user_id is not None) else uid
    try:
        report = services.reopen_report(
            user_id=target_uid,
            report_year=payload.report_year,
            report_week=payload.report_week,
            requester_id=uid,
            requester_is_admin=is_admin,
        )
        return {"code": 200, "msg": "OK", "data": report}
    except ValueError as e:
        return JsonResponse({"code": 400, "msg": str(e), "data": None}, status=400)


# --------------- 下属周报（领导可见） ---------------


@router.get("/my-weekly-report/subordinates")
def list_subordinate_reports(request, year: int, week: int):
    """领导查看下属已提交的周报（指定年周）"""
    err = _auth_required(request)
    if err is not None:
        return err
    uid = _user_id(request)
    try:
        data = services.list_subordinate_reports(leader_id=uid, year=year, week=week)
        subordinate_ids = services.get_subordinate_ids(uid)
        return {"code": 200, "msg": "OK", "data": {"reports": data, "subordinate_ids": subordinate_ids}}
    except Exception as e:
        logger.exception("下属周报查询失败: %s", str(e))
        return JsonResponse({"code": 500, "msg": str(e), "data": None}, status=500)


# --------------- 任务 ---------------


@router.get("/tasks")
def my_tasks(
    request,
    year: int,
    week: int,
    changed: bool = False,
    blocked: bool = False,
    overdue: bool = False,
    all_weeks: bool = False,
):
    err = _auth_required(request)
    if err is not None:
        return err
    tasks = services.list_my_tasks(
        user_id=_user_id(request),
        report_year=year,
        report_week=week,
        filter_changed=changed,
        filter_blocked=blocked,
        filter_overdue=overdue,
        all_weeks=all_weeks,
    )
    return {"code": 200, "msg": "OK", "data": tasks}


@router.put("/tasks/{task_id}")
def update_task(request, task_id: int, payload: TaskUpdateIn):
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        task = services.update_task(task_id, _user_id(request), payload.dict(exclude_none=True))
        return {"code": 200, "msg": "OK", "data": task}
    except ValueError as e:
        return JsonResponse({"code": 400, "msg": str(e), "data": None}, status=400)


# --------------- 项目与用户 ---------------


@router.get("/projects")
def list_projects(
    request,
    created_by: str = "all",
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
):
    """
    可见范围：管理员看所有；普通用户仅看创建人=自己 或 自己是项目任务负责人的项目。
    created_by: all | mine | others。search: 按项目名搜索。page/page_size: 分页（按 start_date 年周倒序）。
    """
    err = _auth_required(request)
    if err is not None:
        return err
    uid = _user_id(request)
    is_admin = _is_admin(request)
    result = services.list_projects(
        user_id=uid,
        created_by_filter=created_by,
        is_admin=is_admin,
        search=search,
        page=page,
        page_size=page_size,
    )
    return {"code": 200, "msg": "OK", "data": result}


@router.post("/projects")
def create_project(request, payload: ProjectCreateIn):
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        body = payload.dict()
        body["tasks"] = [t.dict() for t in payload.tasks]
        proj = services.create_project(body, created_by=_user_id(request))
        return {"code": 200, "msg": "OK", "data": proj}
    except ValueError as e:
        return JsonResponse({"code": 400, "msg": str(e), "data": None}, status=400)


@router.get("/projects/{project_id}")
def project_detail(request, project_id: int):
    err = _auth_required(request)
    if err is not None:
        return err
    uid = _user_id(request)
    is_admin = _is_admin(request)
    try:
        detail = services.get_project_detail(project_id, requester_id=uid, requester_is_admin=is_admin)
        return {"code": 200, "msg": "OK", "data": detail}
    except ValueError as e:
        return JsonResponse({"code": 404, "msg": str(e) or "Project not found", "data": None}, status=404)


@router.put("/projects/{project_id}")
def update_project(request, project_id: int, payload: ProjectUpdateIn):
    err = _auth_required(request)
    if err is not None:
        return err
    uid = _user_id(request)
    is_admin = _is_admin(request)
    try:
        body = payload.dict()
        body["tasks"] = [t.dict() for t in payload.tasks]
        proj = services.update_project(project_id, requester_id=uid, requester_is_admin=is_admin, payload=body)
        return {"code": 200, "msg": "OK", "data": proj}
    except ValueError as e:
        msg = str(e) or "Update failed"
        status = 403 if "权限" in msg else 404
        return JsonResponse({"code": status, "msg": msg, "data": None}, status=status)


@router.get("/users")
def list_users(request):
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        users = services.list_users()
        return {"code": 200, "msg": "OK", "data": users}
    except Exception as e:
        return JsonResponse({"code": 500, "msg": str(e), "data": None}, status=500)


# --------------- 管理者看板（可选，需权限时可加 require_permission） ---------------


@router.get("/dashboard/overview")
def dashboard_overview(request, period_type: Literal["week", "month", "year"] = "week", period_key: str = ""):
    err = _auth_required(request)
    if err is not None:
        return err
    if not period_key and period_type == "week":
        y, w, _ = datetime.now().isocalendar()
        period_key = services.week_key(y, w)
    data = services.dashboard_overview(period_type, period_key)
    return {"code": 200, "msg": "OK", "data": data}


@router.get("/dashboard/project-health")
def dashboard_project_health(request, period_type: str = "week", period_key: str = "", created_by: str = "all"):
    err = _auth_required(request)
    if err is not None:
        return err
    if not period_key:
        y, w, _ = datetime.now().isocalendar()
        period_key = services.week_key(y, w)
    data = services.dashboard_project_health(period_type, period_key, user_id=_user_id(request), created_by_filter=created_by, is_admin=_is_admin(request))
    return {"code": 200, "msg": "OK", "data": data}


@router.get("/dashboard/team-heatmap")
def dashboard_team_heatmap(request, period_type: str = "week", period_key: str = ""):
    err = _auth_required(request)
    if err is not None:
        return err
    if not period_key:
        y, w, _ = datetime.now().isocalendar()
        period_key = services.week_key(y, w)
    data = services.dashboard_team_heatmap(period_type, period_key)
    return {"code": 200, "msg": "OK", "data": data}


@router.get("/dashboard/drilldown")
def dashboard_drilldown(request, scope_type: Literal["user", "project", "report"], scope_id: str, period_key: str):
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        data = services.dashboard_drilldown(scope_type, scope_id, period_key)
        return {"code": 200, "msg": "OK", "data": data}
    except ValueError as e:
        return JsonResponse({"code": 400, "msg": str(e), "data": None}, status=400)


# --------------- 催办与提醒 ---------------


@router.post("/reminders/nudge")
def reminders_nudge(request, payload: NudgeIn):
    err = _auth_required(request)
    if err is not None:
        return err
    try:
        sent = services.nudge(
            user_ids=payload.user_ids,
            week_key_str=payload.week_key,
            remind_type=payload.remind_type or "nudge",
        )
        return {"code": 200, "msg": "OK", "data": {"ok": True, "sent": len(sent)}}
    except Exception as e:
        return JsonResponse({"code": 500, "msg": str(e), "data": None}, status=500)


# --------------- 内部调度（/internal/scheduler/） ---------------


@internal_router.post("/weekly-reminder")
def internal_weekly_reminder(request, scope: str = "team", now_iso: Optional[str] = None):
    """触发周报提醒，供定时任务调用。scope=team|all，now_iso 可选。"""
    try:
        result = services.run_weekly_reminder(
            scope="all" if scope == "all" else "team",
            now_iso=now_iso,
        )
        return {"code": 200, "msg": "OK", "data": result}
    except Exception as e:
        return JsonResponse({"code": 500, "msg": str(e), "data": None}, status=500)
