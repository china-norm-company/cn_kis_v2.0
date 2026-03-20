from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feishu_sync', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='syncconfig',
            name='unique_key_fields',
            field=models.JSONField(
                default=list,
                help_text='用于 from_feishu 幂等入库的字段列表，如 ["feishu_open_id"]',
                verbose_name='业务唯一键字段',
            ),
        ),
        migrations.AddConstraint(
            model_name='syncconfig',
            constraint=models.UniqueConstraint(
                fields=('table_name', 'bitable_app_token', 'bitable_table_id'),
                name='uniq_sync_target_binding',
            ),
        ),
        migrations.AddField(
            model_name='synclog',
            name='idempotency_key',
            field=models.CharField(
                blank=True,
                default='',
                help_text='单次同步请求幂等标识（可选）',
                max_length=120,
                verbose_name='幂等键',
            ),
        ),
        migrations.AddIndex(
            model_name='synclog',
            index=models.Index(fields=['idempotency_key'], name='t_sync_log_idempot_6ee4e2_idx'),
        ),
    ]
