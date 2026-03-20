"""
resource 模块初始迁移

S1-1：创建 ResourceCategory、ResourceItem、ActivityTemplate、ActivityBOM
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('quality', '0001_initial'),
        ('edc', '0001_initial'),
    ]

    operations = [
        # ResourceCategory
        migrations.CreateModel(
            name='ResourceCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, verbose_name='类别名称')),
                ('code', models.CharField(max_length=50, unique=True, verbose_name='类别编码',
                                          help_text='唯一编码，如 EQ-SKIN-VISIA')),
                ('resource_type', models.CharField(
                    max_length=20, db_index=True, verbose_name='资源大类',
                    choices=[
                        ('personnel', '人员'), ('equipment', '设备'),
                        ('material', '物料/耗材'), ('method', '方法/SOP'),
                        ('environment', '环境/场地'),
                    ],
                )),
                ('description', models.TextField(blank=True, default='', verbose_name='描述')),
                ('is_active', models.BooleanField(default=True, verbose_name='是否启用')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('parent', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                    related_name='children', to='resource.resourcecategory', verbose_name='父类别',
                )),
            ],
            options={
                'db_table': 't_resource_category',
                'verbose_name': '资源类别',
                'ordering': ['resource_type', 'name'],
            },
        ),
        migrations.AddIndex(
            model_name='resourcecategory',
            index=models.Index(fields=['resource_type'], name='resource_re_resourc_idx'),
        ),
        migrations.AddIndex(
            model_name='resourcecategory',
            index=models.Index(fields=['parent'], name='resource_re_parent__idx'),
        ),
        migrations.AddIndex(
            model_name='resourcecategory',
            index=models.Index(fields=['code'], name='resource_re_code_idx'),
        ),

        # ResourceItem
        migrations.CreateModel(
            name='ResourceItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, verbose_name='资源名称')),
                ('code', models.CharField(max_length=50, unique=True, verbose_name='资源编号')),
                ('status', models.CharField(
                    max_length=20, db_index=True, default='active', verbose_name='状态',
                    choices=[
                        ('active', '在用'), ('idle', '闲置'), ('maintenance', '维护中'),
                        ('calibrating', '校准中'), ('retired', '已报废'), ('reserved', '已预约'),
                    ],
                )),
                ('location', models.CharField(blank=True, default='', max_length=200, verbose_name='存放位置')),
                ('manufacturer', models.CharField(blank=True, default='', max_length=200, verbose_name='制造商')),
                ('model_number', models.CharField(blank=True, default='', max_length=100, verbose_name='型号')),
                ('serial_number', models.CharField(blank=True, default='', max_length=100, verbose_name='序列号')),
                ('purchase_date', models.DateField(blank=True, null=True, verbose_name='购入日期')),
                ('warranty_expiry', models.DateField(blank=True, null=True, verbose_name='保修到期')),
                ('last_calibration_date', models.DateField(blank=True, null=True, verbose_name='上次校准日期')),
                ('next_calibration_date', models.DateField(blank=True, null=True, verbose_name='下次校准日期')),
                ('calibration_cycle_days', models.IntegerField(blank=True, null=True, verbose_name='校准周期（天）')),
                ('manager_id', models.IntegerField(blank=True, null=True, verbose_name='负责人ID', help_text='Account ID')),
                ('attributes', models.JSONField(blank=True, default=dict, verbose_name='扩展属性',
                                                help_text='自定义属性键值对')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='已删除')),
                ('category', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='items', to='resource.resourcecategory', verbose_name='资源类别',
                )),
            ],
            options={
                'db_table': 't_resource_item',
                'verbose_name': '资源实例',
                'ordering': ['-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='resourceitem',
            index=models.Index(fields=['category', 'status'], name='resource_ri_cat_sta_idx'),
        ),
        migrations.AddIndex(
            model_name='resourceitem',
            index=models.Index(fields=['code'], name='resource_ri_code_idx'),
        ),
        migrations.AddIndex(
            model_name='resourceitem',
            index=models.Index(fields=['status'], name='resource_ri_status_idx'),
        ),

        # ActivityTemplate
        migrations.CreateModel(
            name='ActivityTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, verbose_name='活动名称')),
                ('code', models.CharField(max_length=50, unique=True, verbose_name='活动编码')),
                ('description', models.TextField(blank=True, default='', verbose_name='描述')),
                ('duration', models.IntegerField(default=30, verbose_name='预计耗时（分钟）',
                                                 help_text='标准执行时间')),
                ('qualification_requirements', models.JSONField(
                    blank=True, default=list, verbose_name='资质要求',
                    help_text='JSON 数组，如 [{"name": "GCP证书", "level": "required"}, ...]',
                )),
                ('is_active', models.BooleanField(default=True, verbose_name='是否启用')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='已删除')),
                ('sop', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='activity_templates', to='quality.sop', verbose_name='关联SOP',
                )),
                ('crf_template', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='activity_templates', to='edc.crftemplate', verbose_name='关联CRF模板',
                )),
            ],
            options={
                'db_table': 't_activity_template',
                'verbose_name': '活动模板',
                'ordering': ['code'],
            },
        ),
        migrations.AddIndex(
            model_name='activitytemplate',
            index=models.Index(fields=['code'], name='resource_at_code_idx'),
        ),
        migrations.AddIndex(
            model_name='activitytemplate',
            index=models.Index(fields=['is_active'], name='resource_at_active_idx'),
        ),

        # ActivityBOM
        migrations.CreateModel(
            name='ActivityBOM',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.IntegerField(default=1, verbose_name='数量')),
                ('is_mandatory', models.BooleanField(default=True, verbose_name='是否必须',
                                                     help_text='必须资源缺失时排程报冲突')),
                ('notes', models.CharField(blank=True, default='', max_length=200, verbose_name='备注')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('template', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bom_items', to='resource.activitytemplate', verbose_name='活动模板',
                )),
                ('resource_category', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='bom_usages', to='resource.resourcecategory', verbose_name='所需资源类别',
                )),
            ],
            options={
                'db_table': 't_activity_bom',
                'verbose_name': '活动资源清单',
                'ordering': ['template', '-is_mandatory', 'resource_category'],
                'unique_together': {('template', 'resource_category')},
            },
        ),
        migrations.AddIndex(
            model_name='activitybom',
            index=models.Index(fields=['template'], name='resource_bom_tpl_idx'),
        ),
        migrations.AddIndex(
            model_name='activitybom',
            index=models.Index(fields=['resource_category'], name='resource_bom_cat_idx'),
        ),
    ]
