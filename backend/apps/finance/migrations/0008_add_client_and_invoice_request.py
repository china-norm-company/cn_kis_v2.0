# Generated manually for 客户管理 + 开票申请（发票管理新）

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0007_projectsettlement_creditscore_analysissnapshot'),
    ]

    operations = [
        migrations.CreateModel(
            name='Client',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('customer_code', models.CharField(db_index=True, max_length=50, verbose_name='客户编号')),
                ('customer_name', models.CharField(max_length=200, verbose_name='客户名称')),
                ('short_name', models.CharField(blank=True, default='', max_length=100, verbose_name='简称')),
                ('payment_term_days', models.IntegerField(default=30, verbose_name='账期(天)')),
                ('payment_term_description', models.CharField(blank=True, default='', max_length=100, verbose_name='账期描述')),
                ('remark', models.TextField(blank=True, default='', verbose_name='备注')),
                ('is_active', models.BooleanField(default=True, verbose_name='启用')),
                ('created_by_id', models.IntegerField(blank=True, db_index=True, help_text='Account ID', null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '客户',
                'db_table': 't_finance_client',
                'ordering': ['customer_code'],
            },
        ),
        migrations.AddIndex(
            model_name='client',
            index=models.Index(fields=['customer_code'], name='t_fin_client_code_idx'),
        ),
        migrations.AddIndex(
            model_name='client',
            index=models.Index(fields=['is_active'], name='t_fin_client_active_idx'),
        ),
        migrations.CreateModel(
            name='InvoiceRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('request_date', models.DateField(verbose_name='申请日期')),
                ('customer_name', models.CharField(max_length=200, verbose_name='客户名称')),
                ('po', models.CharField(blank=True, default='', max_length=100, verbose_name='PO号')),
                ('total_amount', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=15, verbose_name='总金额')),
                ('request_by', models.CharField(blank=True, default='', max_length=100, verbose_name='申请人姓名')),
                ('request_by_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='申请人ID')),
                ('status', models.CharField(choices=[('pending', '待处理'), ('processing', '处理中'), ('completed', '已完成'), ('cancelled', '已取消')], default='pending', max_length=20, verbose_name='状态')),
                ('invoice_ids', models.JSONField(blank=True, default=list, help_text='[1, 2, 3]', verbose_name='关联发票ID列表')),
                ('notes', models.TextField(blank=True, default='', verbose_name='备注')),
                ('processed_by', models.CharField(blank=True, default='', max_length=100, verbose_name='处理人')),
                ('processed_at', models.DateTimeField(blank=True, null=True, verbose_name='处理时间')),
                ('created_by_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '开票申请',
                'db_table': 't_invoice_request',
                'ordering': ['-request_date', '-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='invoicerequest',
            index=models.Index(fields=['status'], name='t_invoice_r_status_2d4a5b_idx'),
        ),
        migrations.AddIndex(
            model_name='invoicerequest',
            index=models.Index(fields=['request_by_id', 'status'], name='t_invoice_r_request_1e8c9d_idx'),
        ),
        migrations.AddIndex(
            model_name='invoicerequest',
            index=models.Index(fields=['request_date'], name='t_invoice_r_request_3f0a2e_idx'),
        ),
        migrations.CreateModel(
            name='InvoiceRequestItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('project_code', models.CharField(max_length=80, verbose_name='项目编号')),
                ('project_id', models.IntegerField(blank=True, null=True, verbose_name='项目ID')),
                ('amount', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=15, verbose_name='金额')),
                ('service_content', models.CharField(blank=True, default='', max_length=500, verbose_name='服务内容')),
                ('sort_order', models.IntegerField(default=0, verbose_name='排序')),
                ('invoice_request', models.ForeignKey(on_delete=models.CASCADE, related_name='items', to='finance.invoicerequest', verbose_name='开票申请')),
            ],
            options={
                'verbose_name': '开票申请明细',
                'db_table': 't_invoice_request_item',
                'ordering': ['sort_order', 'id'],
            },
        ),
    ]
