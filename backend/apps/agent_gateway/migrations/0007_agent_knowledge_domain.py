"""
Agent 知识域边界 Migration (0007)

新增：
  - t_agent_knowledge_domain：Agent 可访问的知识类型/命名空间边界定义
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent_gateway', '0006_alter_agentcall_provider_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='AgentKnowledgeDomain',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('agent_id', models.CharField(
                    max_length=100,
                    unique=True,
                    verbose_name='Agent ID',
                    help_text='对应 t_agent_definition.agent_id',
                )),
                ('allowed_entry_types', models.JSONField(
                    default=list,
                    verbose_name='允许的知识类型',
                    help_text='["regulation","sop","method_reference"]，为空表示不限制',
                )),
                ('allowed_namespaces', models.JSONField(
                    default=list,
                    verbose_name='允许的命名空间',
                    help_text='["cnkis","nmpa_regulation"]，为空表示不限制',
                )),
                ('forbidden_scopes', models.JSONField(
                    default=list,
                    verbose_name='明确禁止的数据范围',
                    help_text='[{"table":"t_personal_context","reason":"..."}]',
                )),
                ('max_results', models.IntegerField(
                    default=10,
                    verbose_name='最大检索结果数',
                )),
                ('notes', models.TextField(
                    blank=True,
                    default='',
                    verbose_name='边界说明',
                )),
                ('create_time', models.DateTimeField(auto_now_add=True)),
                ('update_time', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Agent 知识域边界',
                'db_table': 't_agent_knowledge_domain',
            },
        ),
        migrations.AddIndex(
            model_name='agentknowledgedomain',
            index=models.Index(fields=['agent_id'], name='t_agent_kd_agent_id_idx'),
        ),
    ]
