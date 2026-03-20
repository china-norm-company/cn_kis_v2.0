"""
新增周报汇报关系模型 + 初始化李玥→蒋艳雯的汇报关系
"""
from django.db import migrations, models


def seed_leader_relation(apps, schema_editor):
    """设置 李玥 的周报领导为 蒋艳雯（使用原始 SQL + savepoint 避免事务中止）"""
    from django.db import connection
    cursor = connection.cursor()
    cursor.execute("SAVEPOINT seed_leader_sp")
    try:
        cursor.execute(
            "SELECT id FROM t_account WHERE display_name = %s AND is_deleted = false LIMIT 1",
            ["李玥"],
        )
        li_yue_row = cursor.fetchone()
        cursor.execute(
            "SELECT id FROM t_account WHERE display_name = %s AND is_deleted = false LIMIT 1",
            ["蒋艳雯"],
        )
        jiang_row = cursor.fetchone()
        if li_yue_row and jiang_row:
            cursor.execute(
                "INSERT INTO t_weekly_report_leader (user_id, leader_id, created_at) "
                "VALUES (%s, %s, NOW()) ON CONFLICT (user_id, leader_id) DO NOTHING",
                [li_yue_row[0], jiang_row[0]],
            )
        cursor.execute("RELEASE SAVEPOINT seed_leader_sp")
    except Exception:
        cursor.execute("ROLLBACK TO SAVEPOINT seed_leader_sp")


class Migration(migrations.Migration):
    dependencies = [
        ("weekly_report", "0004_weeklyreport_draft_content"),
    ]

    operations = [
        migrations.CreateModel(
            name="WeeklyReportLeader",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user_id", models.IntegerField(db_index=True, verbose_name="下属用户ID")),
                ("leader_id", models.IntegerField(db_index=True, verbose_name="领导用户ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="创建时间")),
            ],
            options={
                "db_table": "t_weekly_report_leader",
                "verbose_name": "周报汇报关系",
                "unique_together": {("user_id", "leader_id")},
            },
        ),
        migrations.RunPython(seed_leader_relation, migrations.RunPython.noop),
    ]
