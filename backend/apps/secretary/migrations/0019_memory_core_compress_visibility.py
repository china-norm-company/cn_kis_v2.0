from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0018_orchestration_checkpoint'),
    ]

    operations = [
        migrations.AddField(
            model_name='workermemoryrecord',
            name='is_core',
            field=models.BooleanField(
                default=False,
                help_text='核心记忆始终注入 system prompt，不受 limit 限制',
                verbose_name='核心记忆',
            ),
        ),
        migrations.AddField(
            model_name='workermemoryrecord',
            name='compressed',
            field=models.BooleanField(
                default=False,
                help_text='被压缩合并后标记，不再参与召回但保留供审计',
                verbose_name='已压缩',
            ),
        ),
        migrations.AddField(
            model_name='workermemoryrecord',
            name='visibility',
            field=models.CharField(
                choices=[('private', '仅自己'), ('team', '协作组'), ('global', '全局')],
                db_index=True,
                default='private',
                max_length=20,
                verbose_name='可见范围',
            ),
        ),
        migrations.AddIndex(
            model_name='workermemoryrecord',
            index=models.Index(fields=['is_core', 'worker_code'], name='idx_memory_core_worker'),
        ),
        migrations.AddIndex(
            model_name='workermemoryrecord',
            index=models.Index(fields=['visibility', 'source_task_id'], name='idx_memory_visibility_task'),
        ),
        migrations.AddIndex(
            model_name='workermemoryrecord',
            index=models.Index(fields=['compressed', 'worker_code'], name='idx_memory_compressed_worker'),
        ),
    ]
