from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0005_assistantactionfeedback'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssistantActionPolicy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('account_id', models.IntegerField(db_index=True, verbose_name='账号ID')),
                ('action_type', models.CharField(max_length=50, verbose_name='动作类型')),
                ('enabled', models.BooleanField(default=True, verbose_name='是否启用')),
                ('requires_confirmation', models.BooleanField(default=True, verbose_name='是否必须确认')),
                ('allowed_risk_levels', models.JSONField(blank=True, default=list, verbose_name='允许风险等级')),
                ('min_priority_score', models.IntegerField(default=0, verbose_name='最低优先级分数')),
                ('min_confidence_score', models.IntegerField(default=0, verbose_name='最低置信度分数')),
                ('created_by', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('updated_by', models.IntegerField(blank=True, null=True, verbose_name='更新人ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '子衿动作策略',
                'db_table': 't_assistant_action_policy',
                'unique_together': {('account_id', 'action_type')},
            },
        ),
        migrations.AddIndex(
            model_name='assistantactionpolicy',
            index=models.Index(fields=['account_id', 'action_type'], name='t_assistant_account_52617a_idx'),
        ),
        migrations.AddIndex(
            model_name='assistantactionpolicy',
            index=models.Index(fields=['account_id', 'enabled'], name='t_assistant_account_43f2a3_idx'),
        ),
    ]
