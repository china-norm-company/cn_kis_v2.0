# 0039 曾 RemoveField 去掉 SubjectProjectSC.enrollment_status，但模型与接待队列仍依赖；
# 恢复 DB 列（若已存在则跳过）。

from django.db import migrations, models


def _column_exists(connection, table: str, column: str) -> bool:
    with connection.cursor() as cursor:
        if connection.vendor == 'postgresql':
            cursor.execute(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = %s
                  AND column_name = %s
                """,
                [table, column],
            )
            return cursor.fetchone() is not None
        if connection.vendor == 'sqlite':
            cursor.execute(f'PRAGMA table_info({table})')
            return any(row[1] == column for row in cursor.fetchall())
    return False


def _readd_enrollment_status(apps, schema_editor):
    from django.db import models as dj_models

    SubjectProjectSC = apps.get_model('subject', 'SubjectProjectSC')
    table = SubjectProjectSC._meta.db_table
    conn = schema_editor.connection

    if _column_exists(conn, table, 'enrollment_status'):
        return

    f = dj_models.CharField(
        '入组情况',
        max_length=20,
        blank=True,
        default='',
        help_text='初筛合格/正式入组/不合格/复筛不合格/退出/缺席',
    )
    f.set_attributes_from_name('enrollment_status')
    schema_editor.add_field(SubjectProjectSC, f)


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0042_readd_subjectcheckin_missed_queue_fields'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    _readd_enrollment_status,
                    migrations.RunPython.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='subjectprojectsc',
                    name='enrollment_status',
                    field=models.CharField(
                        blank=True,
                        default='',
                        help_text='初筛合格/正式入组/不合格/复筛不合格/退出/缺席',
                        max_length=20,
                        verbose_name='入组情况',
                    ),
                ),
            ],
        ),
    ]
