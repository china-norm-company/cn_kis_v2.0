# Generated manually for Phase 2 finance module

from decimal import Decimal
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0004_quote_parent_quote_quote_version_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PayableRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('record_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='应付编号')),
                ('protocol_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='协议ID')),
                ('project_name', models.CharField(blank=True, default='', max_length=200, verbose_name='项目名称')),
                ('supplier_name', models.CharField(max_length=200, verbose_name='供应商名称')),
                ('supplier_id', models.IntegerField(blank=True, null=True, verbose_name='供应商ID')),
                ('invoice_no', models.CharField(blank=True, default='', max_length=100, verbose_name='供应商发票号')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='应付金额')),
                ('tax_amount', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=15, verbose_name='税额')),
                ('due_date', models.DateField(verbose_name='到期日')),
                ('payment_status', models.CharField(choices=[('pending', '待审批'), ('approved', '已审批'), ('paid', '已付款'), ('cancelled', '已取消')], default='pending', max_length=20, verbose_name='状态')),
                ('paid_date', models.DateField(blank=True, null=True, verbose_name='实付日期')),
                ('paid_amount', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=15, verbose_name='实付金额')),
                ('cost_type', models.CharField(blank=True, default='', max_length=20, verbose_name='成本类型')),
                ('feishu_approval_id', models.CharField(blank=True, default='', max_length=100, verbose_name='飞书审批ID')),
                ('notes', models.TextField(blank=True, default='', verbose_name='备注')),
                ('created_by_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('budget_item', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payable_records', to='finance.budgetitem')),
            ],
            options={
                'verbose_name': '应付记录',
                'db_table': 't_payable_record',
                'ordering': ['-create_time'],
            },
        ),
        migrations.CreateModel(
            name='ExpenseRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('request_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='报销编号')),
                ('applicant_id', models.IntegerField(db_index=True, verbose_name='申请人ID')),
                ('applicant_name', models.CharField(blank=True, default='', max_length=100, verbose_name='申请人')),
                ('protocol_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='协议ID')),
                ('project_name', models.CharField(blank=True, default='', max_length=200, verbose_name='项目名称')),
                ('expense_type', models.CharField(choices=[('travel', '差旅'), ('procurement', '采购'), ('entertainment', '招待'), ('other', '其他')], max_length=20, verbose_name='费用类型')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='报销金额')),
                ('description', models.TextField(verbose_name='事由')),
                ('receipt_count', models.IntegerField(default=0, verbose_name='票据数量')),
                ('receipt_images', models.JSONField(blank=True, default=list, verbose_name='票据图片')),
                ('approval_status', models.CharField(choices=[('draft', '草稿'), ('submitted', '已提交'), ('approved', '已审批'), ('rejected', '已驳回'), ('reimbursed', '已报销')], default='draft', max_length=20, verbose_name='审批状态')),
                ('feishu_approval_id', models.CharField(blank=True, default='', max_length=100, verbose_name='飞书审批ID')),
                ('approved_by_id', models.IntegerField(blank=True, null=True, verbose_name='审批人ID')),
                ('approved_at', models.DateTimeField(blank=True, null=True, verbose_name='审批时间')),
                ('notes', models.TextField(blank=True, default='', verbose_name='备注')),
                ('created_by_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('budget_item', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='expense_requests', to='finance.budgetitem')),
            ],
            options={
                'verbose_name': '费用报销',
                'db_table': 't_expense_request',
                'ordering': ['-create_time'],
            },
        ),
        migrations.CreateModel(
            name='BudgetAdjustment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('adjustment_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='调整编号')),
                ('original_amount', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='原预算金额')),
                ('adjusted_amount', models.DecimalField(decimal_places=2, max_digits=15, verbose_name='调整后金额')),
                ('reason', models.TextField(verbose_name='调整原因')),
                ('status', models.CharField(choices=[('draft', '草稿'), ('submitted', '已提交'), ('approved', '已批准'), ('rejected', '已驳回')], default='draft', max_length=20, verbose_name='状态')),
                ('feishu_approval_id', models.CharField(blank=True, default='', max_length=100, verbose_name='飞书审批ID')),
                ('created_by_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='创建人ID')),
                ('approved_by_id', models.IntegerField(blank=True, null=True, verbose_name='审批人ID')),
                ('approved_at', models.DateTimeField(blank=True, null=True, verbose_name='审批时间')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('budget', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='adjustments', to='finance.projectbudget', verbose_name='预算')),
                ('budget_item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='adjustments', to='finance.budgetitem', verbose_name='预算明细')),
            ],
            options={
                'verbose_name': '预算调整',
                'db_table': 't_budget_adjustment',
                'ordering': ['-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='payablerecord',
            index=models.Index(fields=['protocol_id', 'payment_status'], name='payable_prot_status_idx'),
        ),
        migrations.AddIndex(
            model_name='payablerecord',
            index=models.Index(fields=['due_date', 'payment_status'], name='payable_due_status_idx'),
        ),
        migrations.AddIndex(
            model_name='expenserequest',
            index=models.Index(fields=['applicant_id', 'approval_status'], name='expense_appl_status_idx'),
        ),
        migrations.AddIndex(
            model_name='expenserequest',
            index=models.Index(fields=['protocol_id', 'approval_status'], name='expense_prot_status_idx'),
        ),
    ]
