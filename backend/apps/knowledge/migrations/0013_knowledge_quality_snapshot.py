from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0012_domain_policy_and_entry_ownership'),
    ]

    operations = [
        migrations.CreateModel(
            name='KnowledgeQualitySnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('package_id', models.CharField(db_index=True, max_length=120, verbose_name='专题包 ID')),
                ('package_label', models.CharField(blank=True, default='', max_length=200, verbose_name='专题包名称')),
                ('snapshot_date', models.DateField(db_index=True, verbose_name='快照日期')),
                ('total_entries', models.IntegerField(default=0, verbose_name='条目总数')),
                ('published_entries', models.IntegerField(default=0, verbose_name='已发布条目数')),
                ('avg_quality_score', models.FloatField(default=0.0, verbose_name='平均质量分')),
                ('expired_count', models.IntegerField(default=0, verbose_name='过期条目数')),
                ('rag_cite_total', models.IntegerField(default=0, verbose_name='RAG 引用总次数')),
                ('coverage_rate', models.FloatField(default=0.0, verbose_name='Facet 覆盖率')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': '知识质量快照',
                'verbose_name_plural': '知识质量快照',
                'db_table': 't_knowledge_quality_snapshot',
                'ordering': ['-snapshot_date', 'package_id'],
                'unique_together': {('package_id', 'snapshot_date')},
            },
        ),
    ]
