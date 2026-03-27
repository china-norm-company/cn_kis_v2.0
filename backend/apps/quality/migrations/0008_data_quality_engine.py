"""
数据质量规则引擎 Migration (0008)

新增：
  - t_data_quality_rule：数据质量规则定义
  - t_data_quality_alert：数据质量告警记录
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('quality', '0007_qualityaudit'),
    ]

    operations = [
        migrations.CreateModel(
            name='DataQualityRule',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rule_id', models.CharField(help_text='如 subject_phone_format / knowledge_entry_no_title', max_length=100, unique=True, verbose_name='规则ID')),
                ('name', models.CharField(max_length=200, verbose_name='规则名称')),
                ('description', models.TextField(blank=True, default='', verbose_name='规则说明')),
                ('target_table', models.CharField(help_text='如 t_subject / t_knowledge_entry', max_length=100, verbose_name='目标数据表')),
                ('rule_type', models.CharField(choices=[('sql_check', 'SQL 检查'), ('count_min', '最小记录数'), ('null_check', '空值检查'), ('format_check', '格式检查'), ('python_check', 'Python 函数检查')], default='sql_check', max_length=30, verbose_name='规则类型')),
                ('rule_expression', models.TextField(help_text='SQL: 返回违规记录 ID 列表；count_min: 数值；null_check: 字段名', verbose_name='规则表达式')),
                ('severity', models.CharField(choices=[('critical', '严重（影响患者安全或 GCP 合规）'), ('warning', '警告（数据完整性风险）'), ('info', '信息（建议优化）')], default='warning', max_length=20, verbose_name='严重级别')),
                ('owner_role', models.CharField(blank=True, default='data_manager', max_length=100, verbose_name='负责修复角色')),
                ('auto_fix', models.BooleanField(default=False, verbose_name='自动修复')),
                ('fix_function', models.CharField(blank=True, default='', max_length=200, verbose_name='自动修复函数')),
                ('is_active', models.BooleanField(default=True, verbose_name='是否激活')),
                ('tags', models.JSONField(default=list, help_text='["GCP", "PIPL", "PHI"] 等合规标签', verbose_name='标签')),
                ('last_checked_at', models.DateTimeField(blank=True, null=True, verbose_name='最近检查时间')),
                ('create_time', models.DateTimeField(auto_now_add=True)),
                ('update_time', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': '数据质量规则',
                'db_table': 't_data_quality_rule',
                'ordering': ['severity', 'target_table'],
            },
        ),
        migrations.CreateModel(
            name='DataQualityAlert',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rule', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='alerts', to='quality.dataqualityrule', verbose_name='所属规则')),
                ('violating_record_ids', models.JSONField(default=list, help_text='最多保存前 100 条违规记录的主键', verbose_name='违规记录ID列表')),
                ('violating_count', models.IntegerField(default=0, verbose_name='违规记录数')),
                ('sample_values', models.JSONField(default=list, help_text='前 5 条违规记录的关键字段值', verbose_name='样本值')),
                ('detected_at', models.DateTimeField(auto_now_add=True, verbose_name='发现时间')),
                ('resolved_at', models.DateTimeField(blank=True, null=True, verbose_name='解决时间')),
                ('resolved_by', models.CharField(blank=True, default='', max_length=100, verbose_name='解决人')),
                ('resolution_note', models.TextField(blank=True, default='', verbose_name='解决说明')),
                ('notified_at', models.DateTimeField(blank=True, null=True, verbose_name='通知时间')),
                ('is_false_positive', models.BooleanField(default=False, verbose_name='误报标记')),
            ],
            options={
                'verbose_name': '数据质量告警',
                'db_table': 't_data_quality_alert',
                'ordering': ['-detected_at'],
            },
        ),
        migrations.AddIndex(
            model_name='dataqualityrule',
            index=models.Index(fields=['target_table', 'is_active'], name='t_dqr_table_active_idx'),
        ),
        migrations.AddIndex(
            model_name='dataqualityalert',
            index=models.Index(fields=['rule', 'resolved_at'], name='t_dqa_rule_resolved_idx'),
        ),
        migrations.AddIndex(
            model_name='dataqualityalert',
            index=models.Index(fields=['detected_at'], name='t_dqa_detected_at_idx'),
        ),
    ]
