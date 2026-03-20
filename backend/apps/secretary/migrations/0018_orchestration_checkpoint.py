from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0017_orchestrationrun_gate_run_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='orchestrationrun',
            name='checkpoint',
            field=models.JSONField(
                blank=True, default=dict,
                help_text='{"completed_indices":[0,1],"phase_index":1,"sub_task_outputs":{}}',
                verbose_name='断点快照',
            ),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='resumable',
            field=models.BooleanField(default=True, verbose_name='可恢复'),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='resumed_from',
            field=models.CharField(blank=True, default='', max_length=80, verbose_name='恢复自 task_id'),
        ),
        migrations.AddField(
            model_name='orchestrationsubtask',
            name='checkpoint_output',
            field=models.JSONField(blank=True, default=dict, verbose_name='子任务产出快照'),
        ),
    ]
