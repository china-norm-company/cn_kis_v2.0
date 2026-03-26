# Generated manually for CN KIS V2.0 上线治理（鹿鸣）

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0009_migrate_admin_iam_to_governance'),
    ]

    operations = [
        migrations.CreateModel(
            name='LaunchGovernanceGap',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=500, verbose_name='标题')),
                ('description', models.TextField(blank=True, default='', verbose_name='描述')),
                ('gap_type', models.CharField(blank=True, default='', help_text='如：流程断点、数据未激活、跨台协同缺失', max_length=64, verbose_name='类型')),
                ('severity', models.CharField(default='medium', max_length=32, verbose_name='严重度')),
                ('related_node', models.CharField(blank=True, default='', max_length=64, verbose_name='闭环节点')),
                ('related_workstation', models.CharField(blank=True, default='', max_length=64, verbose_name='工作台')),
                ('blocked_loop', models.BooleanField(default=False, verbose_name='阻塞主闭环')),
                ('status', models.CharField(choices=[('open', '待处理'), ('in_progress', '处理中'), ('resolved', '已解决'), ('wont_fix', '不处理')], db_index=True, default='open', max_length=32, verbose_name='状态')),
                ('owner_domain', models.CharField(blank=True, default='', max_length=200, verbose_name='责任域')),
                ('owner_account_id', models.IntegerField(blank=True, null=True, verbose_name='责任人账号ID')),
                ('github_issue_url', models.URLField(blank=True, default='', max_length=500, verbose_name='GitHub Issue')),
                ('feishu_ref', models.CharField(blank=True, default='', max_length=500, verbose_name='飞书引用')),
                ('next_action', models.TextField(blank=True, default='', verbose_name='下一步动作')),
                ('verification_status', models.CharField(blank=True, default='pending', max_length=64, verbose_name='验收状态')),
                ('create_time', models.DateTimeField(auto_now_add=True)),
                ('update_time', models.DateTimeField(auto_now=True)),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人')),
            ],
            options={
                'verbose_name': '上线治理缺口',
                'db_table': 't_launch_governance_gap',
                'ordering': ['-update_time', '-id'],
            },
        ),
        migrations.CreateModel(
            name='LaunchGovernanceGoal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=500, verbose_name='标题')),
                ('description', models.TextField(blank=True, default='', verbose_name='说明')),
                ('scope', models.CharField(choices=[('phase', '阶段目标'), ('weekly', '周目标')], default='phase', max_length=32, verbose_name='范围')),
                ('target_date', models.DateField(blank=True, null=True, verbose_name='目标日期')),
                ('progress_percent', models.PositiveSmallIntegerField(default=0, verbose_name='进度%')),
                ('status', models.CharField(choices=[('active', '进行中'), ('done', '已完成'), ('cancelled', '已取消')], db_index=True, default='active', max_length=32, verbose_name='状态')),
                ('gap_links', models.JSONField(blank=True, default=list, help_text='LaunchGovernanceGap.id 列表', verbose_name='关联缺口ID')),
                ('rhythm_notes', models.TextField(blank=True, default='', verbose_name='节奏备注')),
                ('create_time', models.DateTimeField(auto_now_add=True)),
                ('update_time', models.DateTimeField(auto_now=True)),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人')),
            ],
            options={
                'verbose_name': '上线治理目标',
                'db_table': 't_launch_governance_goal',
                'ordering': ['-update_time', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='launchgovernancegap',
            index=models.Index(fields=['status', 'severity'], name='idx_launch_gap_status_sev'),
        ),
        migrations.AddIndex(
            model_name='launchgovernancegap',
            index=models.Index(fields=['related_workstation'], name='idx_launch_gap_ws'),
        ),
        migrations.AddIndex(
            model_name='launchgovernancegoal',
            index=models.Index(fields=['scope', 'status'], name='idx_launch_goal_scope_st'),
        ),
    ]
