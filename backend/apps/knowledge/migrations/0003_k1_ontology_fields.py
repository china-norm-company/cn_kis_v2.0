"""
K1 知识库本体论扩展字段迁移
为 KnowledgeEntry 添加 parent、uri、namespace 字段，支持层次化知识组织与本体标准对齐。
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0002_source_key_and_constraints'),
    ]

    operations = [
        migrations.AddField(
            model_name='knowledgeentry',
            name='parent',
            field=models.ForeignKey(
                blank=True,
                help_text='层次化知识组织，如 SOP 章节隶属关系',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='children',
                to='knowledge.knowledgeentry',
                verbose_name='父条目',
            ),
        ),
        migrations.AddField(
            model_name='knowledgeentry',
            name='uri',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='本体 URI，如 cnkis:sop/sample-management 或 cdisc:sdtm/DM',
                max_length=500,
                verbose_name='语义 URI',
            ),
        ),
        migrations.AddField(
            model_name='knowledgeentry',
            name='namespace',
            field=models.CharField(
                choices=[
                    ('cnkis', 'CN_KIS 项目本体'),
                    ('cdisc_sdtm', 'CDISC SDTM'),
                    ('cdisc_cdash', 'CDISC CDASH'),
                    ('cdisc_odm', 'CDISC ODM'),
                    ('bridg', 'BRIDG (ISO 14199)'),
                    ('custom', '自定义'),
                ],
                default='cnkis',
                help_text='标识知识条目所属的本体标准',
                max_length=30,
                verbose_name='本体命名空间',
            ),
        ),
        migrations.AddIndex(
            model_name='knowledgeentry',
            index=models.Index(fields=['namespace'], name='t_knowledge_namespace_idx'),
        ),
    ]
