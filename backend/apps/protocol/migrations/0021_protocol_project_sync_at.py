from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0020_alter_protocol_consent_config_account_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='protocol',
            name='project_sync_at',
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text='执行订单上传/更新成功并同步至知情管理的时间',
                null=True,
                verbose_name='项目同步时间',
            ),
        ),
    ]
