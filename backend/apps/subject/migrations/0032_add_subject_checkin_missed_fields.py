# 接待看板过号：SubjectCheckin 增加 missed_call_at、missed_after_sc_rank 字段

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        # 0031_reception_board_project_sc 在部分分支未合入；线性依赖改为 0030
        ('subject', '0030_add_subject_pseudonym_and_global_registry'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectcheckin',
            name='missed_call_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='过号时间'),
        ),
        migrations.AddField(
            model_name='subjectcheckin',
            name='missed_after_sc_rank',
            field=models.PositiveSmallIntegerField(blank=True, help_text='过号时该项目内即将被叫的 SC 序号，用于叫号序=该值+3', null=True, verbose_name='过号时队首SC序号'),
        ),
    ]
