import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0019_memory_core_compress_visibility'),
    ]

    operations = [
        migrations.CreateModel(
            name='SkillTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('template_id', models.CharField(db_index=True, max_length=80, unique=True, verbose_name='模板 ID')),
                ('source', models.CharField(choices=[('auto_evolved', '自动进化'), ('manual', '手动创建'), ('migrated', '迁移导入')], default='auto_evolved', max_length=20, verbose_name='来源')),
                ('trigger_condition', models.TextField(blank=True, default='', verbose_name='触发条件')),
                ('input_format', models.JSONField(blank=True, default=dict, verbose_name='输入格式')),
                ('processing_steps', models.JSONField(blank=True, default=list, verbose_name='处理步骤')),
                ('output_format', models.JSONField(blank=True, default=dict, verbose_name='输出格式')),
                ('confidence_score', models.FloatField(default=0.0, verbose_name='置信度')),
                ('source_task_ids', models.JSONField(blank=True, default=list, verbose_name='来源任务 ID 列表')),
                ('worker_code', models.CharField(blank=True, db_index=True, default='', max_length=80, verbose_name='来源岗位')),
                ('skill_id_hint', models.CharField(blank=True, default='', max_length=100, verbose_name='建议技能 ID')),
                ('description', models.TextField(blank=True, default='', verbose_name='描述')),
                ('status', models.CharField(choices=[('draft', '草稿'), ('approved', '已批准'), ('rejected', '已拒绝')], db_index=True, default='draft', max_length=20, verbose_name='状态')),
                ('promoted_skill_id', models.CharField(blank=True, default='', max_length=100, verbose_name='已提升为技能 ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': '技能进化模板',
                'verbose_name_plural': '技能进化模板',
                'db_table': 't_skill_template',
                'ordering': ['-created_at'],
            },
        ),
    ]
