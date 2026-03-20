"""
周报系统初始化数据（可选）

将示例项目、任务与周报写入 PostgreSQL。仅在库为空或需要演示数据时执行：
  python manage.py seed_weekly_report
"""
from datetime import date, datetime, timedelta, timezone

from django.core.management.base import BaseCommand

from apps.weekly_report.models import (
    WeeklyReport,
    WeeklyReportItem,
    WeeklyReportNotes,
    WeeklyReportProject,
    WeeklyReportProjectMember,
    WeeklyReportTask,
)


def _week_period(year: int, week: int) -> tuple:
    jan4 = date(year, 1, 4)
    week1_monday = jan4 - timedelta(days=jan4.isoweekday() - 1)
    start = week1_monday + timedelta(weeks=week - 1)
    end = start + timedelta(days=6)
    return start, end


class Command(BaseCommand):
    help = "初始化周报示例数据（3 个项目、任务、周报）"

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="即使已有数据也执行（会追加）")

    def handle(self, *args, **options):
        if not options["force"] and WeeklyReportProject.objects.exists():
            self.stdout.write("已存在项目数据，跳过。使用 --force 强制执行。")
            return
        now = datetime.now(tz=timezone.utc)
        d = now.date()
        y, w, _ = now.isocalendar()
        past = d - timedelta(days=5)

        p1 = WeeklyReportProject.objects.create(
            name="示例项目",
            owner_id=1,
            created_by=1,
            start_date=d - timedelta(days=60),
            end_date=d + timedelta(days=30),
            status="active",
            risk_level="green",
        )
        p2 = WeeklyReportProject.objects.create(
            name="核心系统重构",
            owner_id=1,
            created_by=1,
            start_date=d - timedelta(days=45),
            end_date=d + timedelta(days=14),
            status="active",
            risk_level="yellow",
        )
        p3 = WeeklyReportProject.objects.create(
            name="新业务线孵化",
            owner_id=1,
            created_by=1,
            start_date=d - timedelta(days=20),
            end_date=d + timedelta(days=60),
            status="active",
            risk_level="red",
        )
        for pid, uids in [(p1.id, [1, 2]), (p2.id, [1, 3]), (p3.id, [2, 3])]:
            for uid in uids:
                WeeklyReportProjectMember.objects.create(project_id=pid, user_id=uid)

        tasks_data = [
            (p1.id, 1, "示例任务（用户1）", "doing", 2, 40, 10, 3, d + timedelta(days=7), None),
            (p1.id, 2, "示例任务（用户2）", "todo", 2, 0, 8, 0, d + timedelta(days=14), None),
            (p1.id, 1, "前端组件库升级", "done", 1, 100, 16, 14, d - timedelta(days=2), None),
            (p1.id, 2, "接口联调", "doing", 2, 60, 10, 6, d + timedelta(days=5), None),
            (p2.id, 1, "数据迁移脚本", "done", 1, 100, 20, 18, d - timedelta(days=7), None),
            (p2.id, 3, "性能优化", "doing", 2, 35, 12, 4, past, None),
            (p2.id, 1, "依赖升级", "blocked", 2, 20, 8, 2, d + timedelta(days=10), "等待安全评审"),
            (p2.id, 3, "监控告警", "todo", 3, 0, 6, 0, past - timedelta(days=3), None),
            (p3.id, 2, "需求评审", "done", 1, 100, 4, 4, d - timedelta(days=10), None),
            (p3.id, 3, "技术方案", "doing", 2, 50, 12, 6, d + timedelta(days=14), None),
            (p3.id, 2, "原型设计", "blocked", 2, 30, 8, 2, d + timedelta(days=7), "等待设计资源"),
            (p3.id, 3, "环境搭建", "todo", 3, 0, 10, 0, d + timedelta(days=21), None),
        ]
        task_objs = []
        for project_id, assignee_id, title, status, priority, progress, plan_hours, actual_hours, due_date, blocked_reason in tasks_data:
            t = WeeklyReportTask.objects.create(
                project_id=project_id,
                assignee_id=assignee_id,
                title=title,
                status=status,
                priority=priority,
                progress=progress,
                plan_hours=plan_hours,
                actual_hours=actual_hours,
                due_date=due_date,
                blocked_reason=blocked_reason,
            )
            task_objs.append((project_id, t.id, assignee_id, title))

        start1, end1 = _week_period(y, w)
        start0, end0 = _week_period(y, w - 1)
        start_2, end_2 = _week_period(y, w - 2)
        report_data = [
            (1, y, w, start1, end1, "submitted"),
            (2, y, w, start1, end1, "submitted"),
            (3, y, w, start1, end1, "draft"),
            (1, y, w - 1, start0, end0, "submitted"),
            (2, y, w - 1, start0, end0, "submitted"),
            (3, y, w - 1, start0, end0, "submitted"),
            (1, y, w - 2, start_2, end_2, "submitted"),
            (2, y, w - 2, start_2, end_2, "submitted"),
        ]
        for uid, ry, rw, ps, pe, st in report_data:
            report = WeeklyReport.objects.create(
                user_id=uid,
                report_year=ry,
                report_week=rw,
                period_start=ps,
                period_end=pe,
                status=st,
                submitted_at=now - timedelta(days=2) if st == "submitted" else None,
            )
            WeeklyReportNotes.objects.create(
                report_id=report.id,
                blockers="",
                support_needed="",
                next_week_focus="下周按计划推进",
                ops_work="",
            )

        # 为部分报告添加条目（简化：只给前几个报告加 item）
        r1 = WeeklyReport.objects.filter(user_id=1, report_year=y, report_week=w).first()
        if r1 and p1:
            t11 = WeeklyReportTask.objects.filter(project_id=p1.id, title="示例任务（用户1）").first()
            t13 = WeeklyReportTask.objects.filter(project_id=p1.id, title="前端组件库升级").first()
            if t11:
                WeeklyReportItem.objects.create(report_id=r1.id, task_id=t11.id, this_week_delta="完成进度更新", progress_before=30, progress_after=40, actual_hours=3, is_delayed=False)
            if t13:
                WeeklyReportItem.objects.create(report_id=r1.id, task_id=t13.id, this_week_delta="已验收", progress_before=100, progress_after=100, actual_hours=14, is_delayed=False)
        r2 = WeeklyReport.objects.filter(user_id=2, report_year=y, report_week=w).first()
        if r2 and p1:
            t12 = WeeklyReportTask.objects.filter(project_id=p1.id, title="示例任务（用户2）").first()
            if t12:
                WeeklyReportItem.objects.create(report_id=r2.id, task_id=t12.id, this_week_delta="需求确认", progress_before=0, progress_after=0, actual_hours=0, is_delayed=False)
        r4 = WeeklyReport.objects.filter(user_id=1, report_year=y, report_week=w - 1).first()
        t11_again = WeeklyReportTask.objects.filter(project_id=p1.id, title="示例任务（用户1）").first()
        if r4 and t11_again:
            WeeklyReportItem.objects.create(report_id=r4.id, task_id=t11_again.id, this_week_delta="开发中", progress_before=20, progress_after=30, actual_hours=2, is_delayed=False)

        self.stdout.write(self.style.SUCCESS("周报示例数据已写入 PostgreSQL。"))
