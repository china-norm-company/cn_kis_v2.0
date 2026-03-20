"""
S1-6：CRF 验证规则与验证结果模型
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('edc', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CRFValidationRule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_name', models.CharField(max_length=100, verbose_name='字段名', help_text='data JSON 中的字段键名')),
                ('rule_type', models.CharField(
                    max_length=20, verbose_name='规则类型',
                    choices=[
                        ('required', '必填'), ('range', '范围'), ('pattern', '正则'),
                        ('date_range', '日期范围'), ('cross_field', '跨字段'),
                    ],
                )),
                ('rule_config', models.JSONField(default=dict, verbose_name='规则配置',
                                                  help_text='如 {"min": 0, "max": 200}')),
                ('error_message', models.CharField(blank=True, default='', max_length=500, verbose_name='错误提示')),
                ('is_active', models.BooleanField(default=True, verbose_name='是否启用')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('template', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='validation_rules', to='edc.crftemplate', verbose_name='CRF模板',
                )),
            ],
            options={
                'db_table': 't_crf_validation_rule',
                'verbose_name': 'CRF验证规则',
                'ordering': ['template', 'field_name'],
            },
        ),
        migrations.AddIndex(
            model_name='crfvalidationrule',
            index=models.Index(fields=['template', 'field_name'], name='edc_vr_tpl_field_idx'),
        ),
        migrations.AddIndex(
            model_name='crfvalidationrule',
            index=models.Index(fields=['rule_type'], name='edc_vr_type_idx'),
        ),
        migrations.CreateModel(
            name='CRFValidationResult',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_name', models.CharField(max_length=100, verbose_name='字段名')),
                ('severity', models.CharField(
                    max_length=20, default='error', verbose_name='严重度',
                    choices=[('error', '错误'), ('warning', '警告')],
                )),
                ('message', models.CharField(max_length=500, verbose_name='错误信息')),
                ('field_value', models.CharField(blank=True, default='', max_length=200, verbose_name='字段值')),
                ('is_resolved', models.BooleanField(default=False, verbose_name='是否已解决')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('record', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='validation_results', to='edc.crfrecord', verbose_name='CRF记录',
                )),
                ('rule', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='results', to='edc.crfvalidationrule', verbose_name='规则',
                )),
            ],
            options={
                'db_table': 't_crf_validation_result',
                'verbose_name': 'CRF验证结果',
                'ordering': ['-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='crfvalidationresult',
            index=models.Index(fields=['record', 'severity'], name='edc_vr_result_idx'),
        ),
    ]
