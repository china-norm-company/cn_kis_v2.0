# Generated manually for project_full_link

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Project',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('opportunity_no', models.CharField(blank=True, db_index=True, default='', max_length=100, verbose_name='商机编号')),
                ('inquiry_no', models.CharField(blank=True, default='', max_length=100, null=True, verbose_name='询价单号')),
                ('project_no', models.CharField(blank=True, db_index=True, default='', max_length=100, null=True, verbose_name='项目编号')),
                ('project_name', models.CharField(blank=True, default='', max_length=500, verbose_name='项目名称')),
                ('business_type', models.CharField(blank=True, default='', max_length=100, verbose_name='业务类型')),
                ('sponsor_no', models.CharField(blank=True, default='', max_length=100, null=True, verbose_name='申办方编号')),
                ('sponsor_name', models.CharField(blank=True, default='', max_length=300, null=True, verbose_name='申办方名称')),
                ('research_institution', models.CharField(blank=True, default='', max_length=300, null=True, verbose_name='研究机构')),
                ('principal_investigator', models.CharField(blank=True, default='', max_length=200, null=True, verbose_name='主要研究者')),
                ('priority', models.CharField(default='medium', max_length=20, verbose_name='优先级')),
                ('execution_status', models.CharField(default='pending_execution', help_text='pending_execution, in_progress, completed, cancelled', max_length=50, verbose_name='执行状态')),
                ('schedule_status', models.CharField(default='pending_visit_plan', help_text='pending_visit_plan, pending_resource_review, ...', max_length=50, verbose_name='排程状态')),
                ('total_samples', models.IntegerField(blank=True, null=True, verbose_name='总样本量')),
                ('expected_start_date', models.DateField(blank=True, null=True, verbose_name='预计开始日期')),
                ('expected_end_date', models.DateField(blank=True, null=True, verbose_name='预计结束日期')),
                ('actual_start_date', models.DateField(blank=True, null=True, verbose_name='实际开始日期')),
                ('actual_end_date', models.DateField(blank=True, null=True, verbose_name='实际结束日期')),
                ('recruitment_start_date', models.DateField(blank=True, null=True, verbose_name='招募开始日期')),
                ('test_start_date', models.DateField(blank=True, null=True, verbose_name='试验开始日期')),
                ('test_end_date', models.DateField(blank=True, null=True, verbose_name='试验结束日期')),
                ('report_deadline', models.DateField(blank=True, null=True, verbose_name='报告截止日期')),
                ('description', models.TextField(blank=True, default='', null=True, verbose_name='描述')),
                ('remark', models.TextField(blank=True, default='', null=True, verbose_name='备注')),
                ('created_by', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('updated_by', models.IntegerField(blank=True, null=True, verbose_name='更新人ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('is_delete', models.BooleanField(default=False, verbose_name='已删除')),
            ],
            options={
                'verbose_name': '项目全链路-项目',
                'db_table': 'project_full_link_project',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ProjectProtocol',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('protocol_no', models.CharField(blank=True, default='', max_length=100, null=True, verbose_name='方案编号')),
                ('protocol_name', models.CharField(max_length=500, verbose_name='方案名称')),
                ('protocol_version', models.CharField(blank=True, default='', max_length=50, null=True, verbose_name='方案版本')),
                ('description', models.TextField(blank=True, default='', null=True, verbose_name='描述')),
                ('file_id', models.IntegerField(blank=True, null=True, verbose_name='文件ID（关联系统文件）')),
                ('file_path', models.CharField(blank=True, default='', max_length=500, null=True, verbose_name='文件路径（本地存储时使用）')),
                ('parsed_data', models.JSONField(blank=True, null=True, verbose_name='解析结果 JSON')),
                ('parse_error', models.TextField(blank=True, default='', null=True, verbose_name='解析错误信息')),
                ('parse_progress', models.JSONField(blank=True, null=True, verbose_name='解析进度')),
                ('parse_logs', models.JSONField(blank=True, default=list, null=True, verbose_name='解析日志')),
                ('created_by', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('updated_by', models.IntegerField(blank=True, null=True, verbose_name='更新人ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('is_delete', models.BooleanField(default=False, verbose_name='已删除')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='protocols', to='project_full_link.project')),
            ],
            options={
                'verbose_name': '项目全链路-方案',
                'db_table': 'project_full_link_protocol',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['execution_status'], name='project_ful_executi_idx'),
        ),
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['schedule_status'], name='project_ful_schedul_idx'),
        ),
        migrations.AddIndex(
            model_name='project',
            index=models.Index(fields=['created_at'], name='project_ful_created_idx'),
        ),
        migrations.AddIndex(
            model_name='projectprotocol',
            index=models.Index(fields=['project', 'is_delete'], name='project_ful_project_idx'),
        ),
    ]
