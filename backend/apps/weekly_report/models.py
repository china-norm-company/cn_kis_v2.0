"""
周报系统 Django 模型 — 数据持久化到 PostgreSQL

与设计文档一致：项目、任务、周报、报告项、备注、催办、指标快照。
"""
from django.db import models


class RiskLevel(models.TextChoices):
    green = "green", "低"
    yellow = "yellow", "中"
    red = "red", "高"


class TaskStatus(models.TextChoices):
    todo = "todo", "未开始"
    doing = "doing", "进行中"
    blocked = "blocked", "阻塞"
    done = "done", "已完成"


class WeeklyReportStatus(models.TextChoices):
    draft = "draft", "草稿"
    submitted = "submitted", "已提交"


class WeeklyReportProject(models.Model):
    """周报项目"""

    class Meta:
        db_table = "t_weekly_report_project"
        verbose_name = "周报项目"

    name = models.CharField("项目名称", max_length=255)
    owner_id = models.IntegerField("负责人ID", db_index=True)
    created_by = models.IntegerField("创建人ID", db_index=True)
    start_date = models.DateField("开始日期", null=True, blank=True)
    end_date = models.DateField("结束日期", null=True, blank=True)
    status = models.CharField("状态", max_length=32, default="active")
    risk_level = models.CharField(
        "风险等级", max_length=16, choices=RiskLevel.choices, default=RiskLevel.green
    )


class WeeklyReportProjectMember(models.Model):
    """周报项目成员（多对多）"""

    class Meta:
        db_table = "t_weekly_report_project_member"
        unique_together = [("project", "user_id")]
        verbose_name = "周报项目成员"

    project = models.ForeignKey(
        WeeklyReportProject, on_delete=models.CASCADE, related_name="members"
    )
    user_id = models.IntegerField("用户ID", db_index=True)


class WeeklyReportTask(models.Model):
    """周报任务"""

    class Meta:
        db_table = "t_weekly_report_task"
        verbose_name = "周报任务"

    project = models.ForeignKey(
        WeeklyReportProject, on_delete=models.CASCADE, related_name="tasks"
    )
    assignee_id = models.IntegerField("负责人ID", db_index=True)
    title = models.CharField("标题", max_length=512)
    status = models.CharField(
        "状态", max_length=32, choices=TaskStatus.choices, default=TaskStatus.todo
    )
    priority = models.IntegerField("优先级", default=1)  # 1=正常 2=高 3=急
    progress = models.IntegerField("进度", default=0)
    plan_hours = models.FloatField("计划工时", default=0)
    actual_hours = models.FloatField("实际工时", default=0)
    due_date = models.DateField("截止日期", null=True, blank=True)
    blocked_reason = models.TextField("阻塞原因", null=True, blank=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)


class WeeklyReport(models.Model):
    """周报（按用户+年周唯一）"""

    class Meta:
        db_table = "t_weekly_report"
        unique_together = [("user_id", "report_year", "report_week")]
        verbose_name = "周报"

    user_id = models.IntegerField("用户ID", db_index=True)
    report_year = models.IntegerField("年份", db_index=True)
    report_week = models.IntegerField("周", db_index=True)
    period_start = models.DateField("周期开始")
    period_end = models.DateField("周期结束")
    status = models.CharField(
        "状态", max_length=32, choices=WeeklyReportStatus.choices
    )
    submitted_at = models.DateTimeField("提交时间", null=True, blank=True)
    submitted_content = models.TextField("提交时的周报正文（预览框编辑后内容）", blank=True, default="")
    draft_content = models.TextField("草稿预览正文（预览框编辑后内容）", blank=True, default="")


class WeeklyReportItem(models.Model):
    """周报条目（报告与任务的关联及当周进展）"""

    class Meta:
        db_table = "t_weekly_report_item"
        unique_together = [("report", "task_id")]
        verbose_name = "周报条目"

    report = models.ForeignKey(
        WeeklyReport, on_delete=models.CASCADE, related_name="items"
    )
    task_id = models.IntegerField("任务ID", db_index=True)
    this_week_delta = models.TextField("本周进展说明", default="")
    progress_before = models.IntegerField("进度-前", default=0)
    progress_after = models.IntegerField("进度-后", default=0)
    actual_hours = models.FloatField("实际工时", default=0)
    is_delayed = models.BooleanField("是否延期", default=False)


class WeeklyReportNotes(models.Model):
    """周报备注（阻塞、支持、下周聚焦、运维）"""

    class Meta:
        db_table = "t_weekly_report_notes"
        verbose_name = "周报备注"

    report = models.OneToOneField(
        WeeklyReport, on_delete=models.CASCADE, related_name="notes"
    )
    blockers = models.TextField("阻塞", default="")
    support_needed = models.TextField("需要支持", default="")
    next_week_focus = models.TextField("下周聚焦", default="")
    ops_work = models.TextField("运维工作", default="")
    next_week_plan = models.TextField("下周计划", default="")


class WeeklyReportLeader(models.Model):
    """周报汇报关系：user_id 的周报提交后，leader_id 可查看"""

    class Meta:
        db_table = "t_weekly_report_leader"
        unique_together = [("user_id", "leader_id")]
        verbose_name = "周报汇报关系"

    user_id = models.IntegerField("下属用户ID", db_index=True)
    leader_id = models.IntegerField("领导用户ID", db_index=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)


class ReportReminder(models.Model):
    """周报催办记录"""

    class Meta:
        db_table = "t_weekly_report_reminder"
        verbose_name = "周报催办"

    user_id = models.IntegerField("用户ID", db_index=True)
    week_key = models.CharField("周键", max_length=32, db_index=True)
    remind_type = models.CharField("催办类型", max_length=32)
    sent_at = models.DateTimeField("发送时间")


class MetricSnapshot(models.Model):
    """指标快照（看板周期汇总）"""

    class Meta:
        db_table = "t_weekly_report_snapshot"
        verbose_name = "周报指标快照"

    scope_type = models.CharField("范围类型", max_length=32)
    scope_id = models.CharField("范围ID", max_length=64)
    period_type = models.CharField("周期类型", max_length=16)
    period_key = models.CharField("周期键", max_length=32, db_index=True)
    metrics_json = models.JSONField("指标JSON", default=dict)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
