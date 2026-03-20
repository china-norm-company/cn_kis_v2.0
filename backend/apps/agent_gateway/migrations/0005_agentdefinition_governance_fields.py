from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent_gateway', '0004_agent_definition_zhongshu_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='agentdefinition',
            name='paused',
            field=models.BooleanField('已暂停', default=False),
        ),
        migrations.AddField(
            model_name='agentdefinition',
            name='paused_reason',
            field=models.CharField('暂停原因', max_length=200, blank=True, default=''),
        ),
        migrations.AddField(
            model_name='agentdefinition',
            name='monthly_budget_usd',
            field=models.DecimalField('月预算(USD)', max_digits=8, decimal_places=2, null=True, blank=True),
        ),
        migrations.AddField(
            model_name='agentdefinition',
            name='current_month_spend_usd',
            field=models.DecimalField('当月已用(USD)', max_digits=8, decimal_places=2, default=0),
        ),
        migrations.AddField(
            model_name='agentdefinition',
            name='parent_agent_id',
            field=models.CharField('上级 Agent', max_length=80, blank=True, default=''),
        ),
        migrations.AddField(
            model_name='agentdefinition',
            name='boundaries',
            field=models.JSONField('能力边界（不做什么）', default=list, blank=True),
        ),
        migrations.AddField(
            model_name='agentdefinition',
            name='escalation_targets',
            field=models.JSONField('升级目标', default=list, blank=True),
        ),
    ]
