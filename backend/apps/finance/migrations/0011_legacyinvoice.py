# Generated manually for 发票管理（新）frontend compatibility

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0007_projectsettlement_creditscore_analysissnapshot'),
    ]

    operations = [
        migrations.CreateModel(
            name='LegacyInvoice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('invoice_no', models.CharField(db_index=True, max_length=50, verbose_name='发票号码')),
                ('invoice_date', models.DateField(verbose_name='开票日期')),
                ('customer_name', models.CharField(max_length=300, verbose_name='客户名称')),
                ('invoice_content', models.TextField(blank=True, default='', verbose_name='开票内容')),
                ('invoice_currency', models.CharField(blank=True, default='CNY', max_length=10, verbose_name='币种')),
                ('invoice_amount_tax_included', models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True, verbose_name='开票金额(含税)')),
                ('revenue_amount', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='收入金额')),
                ('invoice_type', models.CharField(default='专票', max_length=20, verbose_name='发票类型')),
                ('company_name', models.CharField(default='', max_length=200, verbose_name='我司名称')),
                ('project_code', models.CharField(blank=True, default='', max_length=100, verbose_name='项目编号')),
                ('project_id', models.IntegerField(blank=True, null=True, verbose_name='项目ID')),
                ('po', models.CharField(blank=True, default='', max_length=100, verbose_name='PO号')),
                ('payment_term', models.IntegerField(blank=True, null=True, verbose_name='账期(天)')),
                ('sales_manager', models.CharField(default='', max_length=100, verbose_name='客户经理')),
                ('payment_date', models.DateField(blank=True, null=True, verbose_name='到账日期')),
                ('payment_amount', models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True, verbose_name='到账金额')),
                ('expected_payment_date', models.DateField(blank=True, null=True, verbose_name='应到账日')),
                ('receivable_date', models.DateField(blank=True, null=True, verbose_name='应收日')),
                ('status', models.CharField(choices=[('draft', '草稿'), ('issued', '已开票'), ('paid', '已收款'), ('partial', '部分收款'), ('overdue', '逾期'), ('cancelled', '已作废')], default='issued', max_length=20, verbose_name='状态')),
                ('invoice_year', models.CharField(blank=True, default='', max_length=20, verbose_name='开票年')),
                ('invoice_month', models.CharField(blank=True, default='', max_length=20, verbose_name='开票月')),
                ('payment_year', models.CharField(blank=True, default='', max_length=20, verbose_name='到账年')),
                ('payment_month', models.CharField(blank=True, default='', max_length=20, verbose_name='到账月')),
                ('lims_report_submitted_at', models.DateTimeField(blank=True, null=True, verbose_name='LIMS提交时间')),
                ('electronic_invoice_file', models.CharField(blank=True, default='', max_length=500, verbose_name='电子发票路径')),
                ('electronic_invoice_file_name', models.CharField(blank=True, default='', max_length=200, verbose_name='电子发票文件名')),
                ('electronic_invoice_uploaded_at', models.DateTimeField(blank=True, null=True, verbose_name='电子发票上传时间')),
                ('electronic_invoice_download_count', models.IntegerField(default=0, verbose_name='下载次数')),
                ('invoice_items_json', models.JSONField(blank=True, default=list, verbose_name='发票明细(JSON)')),
                ('created_by_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='已删除')),
            ],
            options={
                'verbose_name': '发票（新）',
                'db_table': 't_legacy_invoice',
                'ordering': ['-invoice_date', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='legacyinvoice',
            index=models.Index(fields=['status'], name='t_legacy_in_status_idx'),
        ),
        migrations.AddIndex(
            model_name='legacyinvoice',
            index=models.Index(fields=['customer_name'], name='t_legacy_in_customer_idx'),
        ),
        migrations.AddIndex(
            model_name='legacyinvoice',
            index=models.Index(fields=['project_code'], name='t_legacy_in_project_idx'),
        ),
        migrations.AddIndex(
            model_name='legacyinvoice',
            index=models.Index(fields=['invoice_date'], name='t_legacy_in_invoice_d_idx'),
        ),
    ]
