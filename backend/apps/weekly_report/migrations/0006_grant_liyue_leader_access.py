"""
给李玥添加与蒋艳雯相同的员工周报查看权限，
同时修复 0005 中因 LIMIT 1 取到错误用户导致 seed 未生效的问题。
"""
from django.db import migrations


def grant_leader_access(apps, schema_editor):
    from django.db import connection

    cursor = connection.cursor()
    cursor.execute("SAVEPOINT grant_access_sp")
    try:
        cursor.execute(
            "SELECT id FROM t_account WHERE display_name = %s AND email = %s AND is_deleted = false LIMIT 1",
            ["李玥", "liyue@china-norm.com"],
        )
        li_yue_row = cursor.fetchone()
        cursor.execute(
            "SELECT id FROM t_account WHERE display_name = %s AND email = %s AND is_deleted = false LIMIT 1",
            ["蒋艳雯", "jiangyanwen@china-norm.com"],
        )
        jiang_row = cursor.fetchone()

        if li_yue_row and jiang_row:
            li_yue_id = li_yue_row[0]
            jiang_id = jiang_row[0]

            # 蒋艳雯是李玥的领导（修复 0005 未生效的 seed）
            cursor.execute(
                "INSERT INTO t_weekly_report_leader (user_id, leader_id, created_at) "
                "VALUES (%s, %s, NOW()) ON CONFLICT (user_id, leader_id) DO NOTHING",
                [li_yue_id, jiang_id],
            )

            # 李玥也作为领导，管理和蒋艳雯相同的下属
            cursor.execute(
                "INSERT INTO t_weekly_report_leader (user_id, leader_id, created_at) "
                "SELECT user_id, %s, NOW() FROM t_weekly_report_leader "
                "WHERE leader_id = %s "
                "ON CONFLICT (user_id, leader_id) DO NOTHING",
                [li_yue_id, jiang_id],
            )

        cursor.execute("RELEASE SAVEPOINT grant_access_sp")
    except Exception:
        cursor.execute("ROLLBACK TO SAVEPOINT grant_access_sp")


class Migration(migrations.Migration):
    dependencies = [
        ("weekly_report", "0005_weeklyreportleader"),
    ]

    operations = [
        migrations.RunPython(grant_leader_access, migrations.RunPython.noop),
    ]
