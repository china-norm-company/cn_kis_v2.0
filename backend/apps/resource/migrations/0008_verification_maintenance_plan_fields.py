# 核查计划与维护计划：ResourceItem 新增字段，EquipmentVerification 模型，EquipmentMaintenance 新增字段

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('resource', '0007_calibration_work_order_fields'),
    ]

    operations = [
        # ResourceItem: 核查计划字段
        migrations.AddField(
            model_name='resourceitem',
            name='last_verification_date',
            field=models.DateField(blank=True, null=True, verbose_name='上次核查日期'),
        ),
        migrations.AddField(
            model_name='resourceitem',
            name='next_verification_date',
            field=models.DateField(blank=True, null=True, verbose_name='下次核查日期'),
        ),
        migrations.AddField(
            model_name='resourceitem',
            name='verification_cycle_days',
            field=models.IntegerField(blank=True, null=True, verbose_name='核查周期（天）'),
        ),
        # ResourceItem: 维护计划字段（与校准并列）
        migrations.AddField(
            model_name='resourceitem',
            name='last_maintenance_date',
            field=models.DateField(blank=True, null=True, verbose_name='上次维护日期'),
        ),
        migrations.AddField(
            model_name='resourceitem',
            name='next_maintenance_date',
            field=models.DateField(blank=True, null=True, verbose_name='下次维护日期'),
        ),
        migrations.AddField(
            model_name='resourceitem',
            name='maintenance_cycle_days',
            field=models.IntegerField(blank=True, null=True, verbose_name='维护周期（天）'),
        ),
        # EquipmentVerification 模型
        migrations.CreateModel(
            name='EquipmentVerification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('verification_date', models.DateField(verbose_name='核查日期')),
                ('next_due_date', models.DateField(verbose_name='下次核查到期日')),
                ('verifier', models.CharField(blank=True, default='', max_length=200, verbose_name='核查人')),
                ('result', models.CharField(default='pass', help_text='pass/fail/conditional', max_length=50, verbose_name='核查结果')),
                ('method_notes', models.TextField(blank=True, default='', verbose_name='核查方法/说明')),
                ('notes', models.TextField(blank=True, default='', verbose_name='备注')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('equipment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='verifications', to='resource.resourceitem', verbose_name='设备')),
            ],
            options={
                'verbose_name': '设备核查',
                'db_table': 't_equipment_verification',
                'ordering': ['-verification_date'],
            },
        ),
        migrations.AddIndex(
            model_name='equipmentverification',
            index=models.Index(fields=['equipment', 'next_due_date'], name='t_equipment__equipme_idx'),
        ),
        migrations.AddIndex(
            model_name='equipmentverification',
            index=models.Index(fields=['result'], name='t_equipment__result_idx'),
        ),
        # EquipmentMaintenance: 核查/维护工单支持
        migrations.AddField(
            model_name='equipmentmaintenance',
            name='verification_due_date',
            field=models.DateField(blank=True, null=True, verbose_name='核查到期日（核查工单时填写）'),
        ),
        migrations.AddField(
            model_name='equipmentmaintenance',
            name='maintenance_due_date',
            field=models.DateField(blank=True, null=True, verbose_name='维护到期日（计划维护工单时填写）'),
        ),
    ]
