# Generated manually — align Opportunity with cn_kis_v1.0 workbench/crm (full pipeline)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0006_add_demand_version'),
    ]

    operations = [
        migrations.AddField(
            model_name='opportunity',
            name='code',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True, unique=True, verbose_name='商机编号'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='commercial_owner_name',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='商务负责人'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='research_group',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='研究组'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='business_segment',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='业务板块'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='key_opportunity',
            field=models.BooleanField(default=False, verbose_name='重点商机'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='client_pm',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='客户PM'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='client_contact_info',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='客户联系方式'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='client_department_line',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='部门/条线'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='is_decision_maker',
            field=models.CharField(
                blank=True, default='', help_text='yes=是 no=否 unknown=未知',
                max_length=20, verbose_name='是否为决策人',
            ),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='actual_decision_maker',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='实际决策人'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='actual_decision_maker_department_line',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='实际决策人-部门/条线'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='actual_decision_maker_level',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='实际决策人-职级'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='demand_stages',
            field=models.JSONField(blank=True, default=list, verbose_name='需求阶段'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='project_elements',
            field=models.TextField(blank=True, default='', verbose_name='项目要素(兼容旧版文本)'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='project_detail',
            field=models.JSONField(blank=True, default=dict, verbose_name='项目要素明细'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='necessity_pct',
            field=models.IntegerField(blank=True, null=True, verbose_name='必要性(%)'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='urgency_pct',
            field=models.IntegerField(blank=True, null=True, verbose_name='紧迫性(%)'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='uniqueness_pct',
            field=models.IntegerField(blank=True, null=True, verbose_name='唯一性(%)'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='planned_start_date',
            field=models.DateField(blank=True, null=True, verbose_name='预计启动时间'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='demand_name',
            field=models.CharField(blank=True, default='', max_length=300, verbose_name='需求名称'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='sales_amount_total',
            field=models.DecimalField(
                blank=True, decimal_places=2, help_text='赢单时填写，须等于分年度销售额之和',
                max_digits=14, null=True, verbose_name='销售额',
            ),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='sales_by_year',
            field=models.JSONField(
                blank=True, default=dict,
                help_text='键为年份字符串，如 {"2025":"100.00","2026":"50.00"}，用于导出列名',
                verbose_name='分年度销售额',
            ),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='sales_amount_change',
            field=models.DecimalField(
                blank=True, decimal_places=2, help_text='编辑时记录：最新销售额−原销售额，新建商机表单不展示',
                max_digits=14, null=True, verbose_name='销售额变化',
            ),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='remark',
            field=models.TextField(blank=True, default='', verbose_name='备注'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='cancel_reason',
            field=models.TextField(blank=True, default='', verbose_name='取消原因'),
        ),
        migrations.AddField(
            model_name='opportunity',
            name='lost_reason',
            field=models.TextField(blank=True, default='', verbose_name='输单原因'),
        ),
        migrations.AlterField(
            model_name='opportunity',
            name='stage',
            field=models.CharField(
                choices=[
                    ('lead', '线索'),
                    ('deal', '商机'),
                    ('won', '赢单'),
                    ('cancelled', '取消'),
                    ('lost', '输单'),
                    ('contact', '接洽中'),
                    ('evaluation', '需求评估'),
                    ('proposal', '方案提交'),
                    ('negotiation', '商务谈判'),
                ],
                default='lead',
                max_length=20,
                verbose_name='阶段',
            ),
        ),
    ]
