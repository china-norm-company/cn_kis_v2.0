# 0039 曾 RemoveField 去掉过号字段，但 models_execution.SubjectCheckin 与接待队列逻辑仍依赖；
# 恢复 DB 列并与模型一致（若列已存在则跳过，兼容未执行 0039 的环境）。

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


def _readd_missed_fields(apps, schema_editor):
    from django.db import models as dj_models

    SubjectCheckin = apps.get_model('subject', 'SubjectCheckin')
    table = SubjectCheckin._meta.db_table
    conn = schema_editor.connection

    if not _column_exists(conn, table, 'missed_call_at'):
        f = dj_models.DateTimeField(
            '过号时间', null=True, blank=True,
        )
        f.set_attributes_from_name('missed_call_at')
        schema_editor.add_field(SubjectCheckin, f)

    if not _column_exists(conn, table, 'missed_after_sc_rank'):
        f = dj_models.PositiveSmallIntegerField(
            '过号时队首SC序号', null=True, blank=True,
            help_text='过号时该项目内即将被叫的 SC 序号，用于叫号序=该值+3',
        )
        f.set_attributes_from_name('missed_after_sc_rank')
        schema_editor.add_field(SubjectCheckin, f)


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0041_merge_20260326_1716'),
        ('subject', '0038_merge_20260327_1727'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(_readd_missed_fields, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='subjectcheckin',
                    name='missed_call_at',
                    field=models.DateTimeField(
                        blank=True, null=True, verbose_name='过号时间',
                    ),
                ),
                migrations.AddField(
                    model_name='subjectcheckin',
                    name='missed_after_sc_rank',
                    field=models.PositiveSmallIntegerField(
                        blank=True,
                        help_text='过号时该项目内即将被叫的 SC 序号，用于叫号序=该值+3',
                        null=True,
                        verbose_name='过号时队首SC序号',
                    ),
                ),
            ],
        ),
    ]
