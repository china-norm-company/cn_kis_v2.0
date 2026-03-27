# 接待台 v1 对齐：看板表、过号字段、SubjectProjectSC 入组情况
#
# 若本地/测试库中表已由其它路径创建，纯 CreateModel 会报 relation already exists。
# 本迁移对 PostgreSQL 使用 IF NOT EXISTS / DO 块，使重复执行安全。

from django.db import migrations, models
import django.db.models.deletion


def _sqlite_column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=%s", [table])
    if cursor.fetchone() is None:
        return False
    cursor.execute(f'PRAGMA table_info("{table}")')
    return any(row[1] == column for row in cursor.fetchall())


def _apply_reception_v1_alignment(apps, schema_editor):
    """幂等：仅当对象不存在时创建/添加。"""
    vendor = schema_editor.connection.vendor
    if vendor == 'sqlite':
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS "t_reception_board_checkin" (
                    "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                    "checkin_date" date NOT NULL,
                    "checkin_time" datetime NULL,
                    "checkout_time" datetime NULL,
                    "appointment_id" integer NULL,
                    "create_time" datetime NOT NULL,
                    "update_time" datetime NOT NULL,
                    "subject_id" bigint NOT NULL REFERENCES "t_subject" ("id") ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                'CREATE INDEX IF NOT EXISTS "t_reception_br_chk_subj_date_idx" '
                'ON "t_reception_board_checkin" ("subject_id", "checkin_date")'
            )
            cursor.execute(
                'CREATE UNIQUE INDEX IF NOT EXISTS "t_reception_board_checkin_uniq_subject_checkin_date" '
                'ON "t_reception_board_checkin" ("subject_id", "checkin_date")'
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS "t_reception_board_project_sc" (
                    "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                    "project_code" varchar(64) NOT NULL,
                    "sc_number" varchar(20) NOT NULL DEFAULT '',
                    "enrollment_status" varchar(32) NOT NULL DEFAULT '',
                    "rd_number" varchar(20) NOT NULL DEFAULT '',
                    "create_time" datetime NOT NULL,
                    "update_time" datetime NOT NULL,
                    "subject_id" bigint NOT NULL REFERENCES "t_subject" ("id") ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                'CREATE INDEX IF NOT EXISTS "t_reception_br_sc_subj_pc_idx" '
                'ON "t_reception_board_project_sc" ("subject_id", "project_code")'
            )
            cursor.execute(
                'CREATE UNIQUE INDEX IF NOT EXISTS "t_reception_board_project_sc_uniq_subj_pc" '
                'ON "t_reception_board_project_sc" ("subject_id", "project_code")'
            )
            if not _sqlite_column_exists(cursor, 't_subject_checkin', 'missed_call_at'):
                cursor.execute(
                    'ALTER TABLE "t_subject_checkin" ADD COLUMN "missed_call_at" datetime NULL'
                )
            if not _sqlite_column_exists(cursor, 't_subject_checkin', 'missed_after_sc_rank'):
                cursor.execute(
                    'ALTER TABLE "t_subject_checkin" ADD COLUMN "missed_after_sc_rank" smallint NULL'
                )
            if not _sqlite_column_exists(cursor, 't_subject_project_sc', 'enrollment_status'):
                cursor.execute(
                    'ALTER TABLE "t_subject_project_sc" ADD COLUMN "enrollment_status" '
                    "varchar(20) NOT NULL DEFAULT ''"
                )
        return

    if vendor != 'postgresql':
        raise NotImplementedError(
            '0030 幂等 SQL 仅支持 PostgreSQL 与 SQLite；其它引擎请使用全新库或手工对齐。'
        )

    sql = """
    CREATE TABLE IF NOT EXISTS t_reception_board_checkin (
        id BIGSERIAL PRIMARY KEY,
        checkin_date DATE NOT NULL,
        checkin_time TIMESTAMP WITH TIME ZONE NULL,
        checkout_time TIMESTAMP WITH TIME ZONE NULL,
        appointment_id INTEGER NULL,
        create_time TIMESTAMP WITH TIME ZONE NOT NULL,
        update_time TIMESTAMP WITH TIME ZONE NOT NULL,
        subject_id BIGINT NOT NULL REFERENCES t_subject(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS t_reception_br_chk_subj_date_idx
        ON t_reception_board_checkin (subject_id, checkin_date);
    CREATE UNIQUE INDEX IF NOT EXISTS t_reception_board_checkin_uniq_subject_checkin_date
        ON t_reception_board_checkin (subject_id, checkin_date);

    CREATE TABLE IF NOT EXISTS t_reception_board_project_sc (
        id BIGSERIAL PRIMARY KEY,
        project_code VARCHAR(64) NOT NULL,
        sc_number VARCHAR(20) NOT NULL DEFAULT '',
        enrollment_status VARCHAR(32) NOT NULL DEFAULT '',
        rd_number VARCHAR(20) NOT NULL DEFAULT '',
        create_time TIMESTAMP WITH TIME ZONE NOT NULL,
        update_time TIMESTAMP WITH TIME ZONE NOT NULL,
        subject_id BIGINT NOT NULL REFERENCES t_subject(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS t_reception_br_sc_subj_pc_idx
        ON t_reception_board_project_sc (subject_id, project_code);
    CREATE UNIQUE INDEX IF NOT EXISTS t_reception_board_project_sc_uniq_subj_pc
        ON t_reception_board_project_sc (subject_id, project_code);

    ALTER TABLE t_subject_checkin ADD COLUMN IF NOT EXISTS missed_call_at TIMESTAMP WITH TIME ZONE NULL;
    ALTER TABLE t_subject_checkin ADD COLUMN IF NOT EXISTS missed_after_sc_rank SMALLINT NULL;

    ALTER TABLE t_subject_project_sc ADD COLUMN IF NOT EXISTS enrollment_status VARCHAR(20) NOT NULL DEFAULT '';
    """
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(sql)


def _noop_reverse(apps, schema_editor):
    """不在回滚时删表，避免误删数据。"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0029_merge_20260320_1824'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='ReceptionBoardCheckin',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('checkin_date', models.DateField(verbose_name='签到日期')),
                        ('checkin_time', models.DateTimeField(blank=True, null=True, verbose_name='接待看板签到时间')),
                        ('checkout_time', models.DateTimeField(blank=True, null=True, verbose_name='接待看板签出时间')),
                        ('appointment_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='关联预约ID')),
                        ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                        ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                        ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reception_board_checkins', to='subject.subject')),
                    ],
                    options={
                        'verbose_name': '接待看板签到记录',
                        'db_table': 't_reception_board_checkin',
                    },
                ),
                migrations.AddIndex(
                    model_name='receptionboardcheckin',
                    index=models.Index(fields=['subject_id', 'checkin_date'], name='t_reception_br_chk_subj_date_idx'),
                ),
                migrations.AlterUniqueTogether(
                    name='receptionboardcheckin',
                    unique_together={('subject', 'checkin_date')},
                ),
                migrations.CreateModel(
                    name='ReceptionBoardProjectSc',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('project_code', models.CharField(db_index=True, max_length=64, verbose_name='项目编号')),
                        ('sc_number', models.CharField(blank=True, default='', max_length=20, verbose_name='SC号')),
                        ('enrollment_status', models.CharField(blank=True, default='', max_length=32, verbose_name='入组情况')),
                        ('rd_number', models.CharField(blank=True, default='', max_length=20, verbose_name='RD号')),
                        ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                        ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                        ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reception_board_project_sc', to='subject.subject')),
                    ],
                    options={
                        'verbose_name': '接待看板项目SC',
                        'db_table': 't_reception_board_project_sc',
                        'unique_together': {('subject', 'project_code')},
                    },
                ),
                migrations.AddIndex(
                    model_name='receptionboardprojectsc',
                    index=models.Index(fields=['subject_id', 'project_code'], name='t_reception_br_sc_subj_pc_idx'),
                ),
                migrations.AddField(
                    model_name='subjectcheckin',
                    name='missed_call_at',
                    field=models.DateTimeField(blank=True, null=True, verbose_name='过号时间'),
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
            database_operations=[
                migrations.RunPython(_apply_reception_v1_alignment, _noop_reverse),
            ],
        ),
    ]
