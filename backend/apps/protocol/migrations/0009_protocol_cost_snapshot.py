from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0008_protocol_version'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProtocolCostSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('protocol_code', models.CharField(db_index=True, max_length=100, unique=True, verbose_name='协议编号')),
                ('protocol_id', models.IntegerField(blank=True, db_index=True, help_text='关联 t_protocol.id', null=True, verbose_name='协议ID')),
                ('protocol_title', models.CharField(blank=True, default='', max_length=500, verbose_name='协议标题')),
                ('protocol_status', models.CharField(blank=True, default='', max_length=20, verbose_name='协议状态')),
                ('ekb_expense_count', models.IntegerField(default=0, verbose_name='报销单数量')),
                ('ekb_expense_total', models.DecimalField(decimal_places=2, default=0, max_digits=18, verbose_name='报销总金额')),
                ('ekb_approved_total', models.DecimalField(decimal_places=2, default=0, max_digits=18, verbose_name='已审批报销金额')),
                ('ekb_expense_types', models.JSONField(blank=True, default=dict, help_text='{"travel": 30, "procurement": 5, ...}', verbose_name='费用类型分布')),
                ('subject_payment_count', models.IntegerField(default=0, verbose_name='礼金支付笔数')),
                ('subject_paid_count', models.IntegerField(default=0, verbose_name='已支付笔数')),
                ('subject_payment_total', models.DecimalField(decimal_places=2, default=0, max_digits=18, verbose_name='礼金支付总额')),
                ('subject_paid_total', models.DecimalField(decimal_places=2, default=0, max_digits=18, verbose_name='已支付礼金金额')),
                ('subject_count', models.IntegerField(default=0, help_text='该项目下有过礼金支付的不重复受试者数量', verbose_name='涉及受试者数')),
                ('budget_count', models.IntegerField(default=0, verbose_name='预算单数量')),
                ('budget_total', models.DecimalField(decimal_places=2, default=0, max_digits=18, verbose_name='批准预算总额')),
                ('computed_at', models.DateTimeField(blank=True, null=True, verbose_name='最后计算时间')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '协议成本快照',
                'db_table': 't_protocol_cost_snapshot',
            },
        ),
        migrations.AddIndex(
            model_name='protocolcostsnapshot',
            index=models.Index(fields=['protocol_code'], name='t_protocol__protocol_code_idx'),
        ),
        migrations.AddIndex(
            model_name='protocolcostsnapshot',
            index=models.Index(fields=['computed_at'], name='t_protocol__computed_at_idx'),
        ),
    ]
