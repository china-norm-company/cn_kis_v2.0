from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0006_assistantactionpolicy'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssistantUserPreference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('account_id', models.IntegerField(db_index=True, verbose_name='账号ID')),
                ('preference_key', models.CharField(max_length=50, verbose_name='偏好键')),
                ('preference_value', models.JSONField(blank=True, default=dict, verbose_name='偏好值')),
                ('updated_by', models.IntegerField(blank=True, null=True, verbose_name='更新人ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '子衿个人偏好',
                'db_table': 't_assistant_user_preference',
                'unique_together': {('account_id', 'preference_key')},
            },
        ),
        migrations.AddIndex(
            model_name='assistantuserpreference',
            index=models.Index(fields=['account_id', 'preference_key'], name='t_assistant_account_71d3d7_idx'),
        ),
    ]
