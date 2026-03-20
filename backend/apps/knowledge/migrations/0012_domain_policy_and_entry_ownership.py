from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0007_alter_accountworkstationconfig_id'),
        ('knowledge', '0011_add_version_chain_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='knowledgeentry',
            name='next_review_at',
            field=models.DateTimeField(blank=True, help_text='按知识域治理策略自动计算的下一次复核时间', null=True, verbose_name='下次复核时间'),
        ),
        migrations.AddField(
            model_name='knowledgeentry',
            name='owner',
            field=models.ForeignKey(blank=True, help_text='负责该知识条目日常维护与到期处理的负责人', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='owned_knowledge_entries', to='identity.account', verbose_name='知识域负责人'),
        ),
        migrations.AddField(
            model_name='knowledgeentry',
            name='reviewer',
            field=models.ForeignKey(blank=True, help_text='负责该知识条目复核与发布复审的人员', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewing_knowledge_entries', to='identity.account', verbose_name='复核人'),
        ),
        migrations.CreateModel(
            name='KnowledgeDomainPolicy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('namespace', models.CharField(max_length=100, unique=True, verbose_name='知识域命名空间')),
                ('review_cycle_days', models.PositiveIntegerField(default=90, help_text='条目入库或更新后，多少天后需要再次复核', verbose_name='复核周期（天）')),
                ('description', models.TextField(blank=True, default='', verbose_name='说明')),
                ('is_active', models.BooleanField(default=True, verbose_name='是否启用')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='owned_knowledge_domain_policies', to='identity.account', verbose_name='域负责人')),
                ('reviewer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewing_knowledge_domain_policies', to='identity.account', verbose_name='域复核人')),
            ],
            options={
                'verbose_name': '知识域治理策略',
                'db_table': 't_knowledge_domain_policy',
                'ordering': ['namespace'],
            },
        ),
        migrations.AddIndex(
            model_name='knowledgeentry',
            index=models.Index(fields=['owner'], name='t_knowledge_owner_i_1de960_idx'),
        ),
        migrations.AddIndex(
            model_name='knowledgeentry',
            index=models.Index(fields=['reviewer'], name='t_knowledge_reviewe_6d6f37_idx'),
        ),
        migrations.AddIndex(
            model_name='knowledgeentry',
            index=models.Index(fields=['next_review_at'], name='t_knowledge_next_re_778522_idx'),
        ),
        migrations.AddIndex(
            model_name='knowledgedomainpolicy',
            index=models.Index(fields=['namespace', 'is_active'], name='t_knowledge_namespa_7fb5cc_idx'),
        ),
    ]
