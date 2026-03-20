from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0010_add_keyword_fts_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='knowledgeentry',
            name='superseded_by',
            field=models.ForeignKey(
                blank=True,
                help_text='若该条目已被新版本替代，则指向最新替代版本',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='superseded_entries',
                to='knowledge.knowledgeentry',
                verbose_name='被哪个新版本替代',
            ),
        ),
        migrations.AddField(
            model_name='knowledgeentry',
            name='version',
            field=models.CharField(
                blank=True,
                default='',
                help_text='版本标识，如 v1.0 / 2026年第6号 / 2021',
                max_length=50,
                verbose_name='版本号',
            ),
        ),
    ]
