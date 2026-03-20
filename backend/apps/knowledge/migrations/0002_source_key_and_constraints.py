from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='knowledgeentry',
            name='source_key',
            field=models.CharField(
                blank=True,
                default='',
                help_text='同一来源下的幂等键，如 lesson 哈希、sop-main',
                max_length=120,
                verbose_name='来源去重键',
            ),
        ),
        migrations.AddIndex(
            model_name='knowledgeentry',
            index=models.Index(
                fields=['source_type', 'source_id', 'source_key'],
                name='t_knowledge_source__9d765f_idx',
            ),
        ),
        migrations.AddConstraint(
            model_name='knowledgeentry',
            constraint=models.UniqueConstraint(
                condition=(
                    models.Q(is_deleted=False) &
                    ~models.Q(source_type='') &
                    models.Q(source_id__isnull=False) &
                    ~models.Q(source_key='')
                ),
                fields=('source_type', 'source_id', 'source_key'),
                name='uniq_knowledge_source_key_alive',
            ),
        ),
    ]
