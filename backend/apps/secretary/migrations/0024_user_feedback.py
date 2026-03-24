"""
Migration: 新增用户反馈模型 UserFeedback（Issue #4 智能运营早晚报）
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0023_checkpoint_running_since'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserFeedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('feishu_message_id', models.CharField(help_text='飞书事件回调中的 message_id，用于幂等去重', max_length=100, unique=True, verbose_name='飞书消息 ID')),
                ('sender_open_id', models.CharField(blank=True, max_length=100, verbose_name='发送人 open_id')),
                ('sender_name', models.CharField(blank=True, max_length=100, verbose_name='发送人姓名')),
                ('raw_text', models.TextField(verbose_name='原始消息内容')),
                ('category', models.CharField(choices=[('bug', '功能故障'), ('feature', '功能建议'), ('question', '使用疑问'), ('data', '数据问题'), ('performance', '性能问题'), ('other', '其他')], default='other', max_length=20, verbose_name='反馈分类')),
                ('workstation', models.CharField(blank=True, help_text='AI 从消息内容推断的涉及工作台，如 quality / finance', max_length=50, verbose_name='涉及工作台')),
                ('severity', models.CharField(blank=True, choices=[('high', '高'), ('medium', '中'), ('low', '低')], default='medium', max_length=10, verbose_name='严重程度')),
                ('ai_summary', models.CharField(blank=True, help_text='用于 GitHub Issue 标题和晚报摘要的简短描述', max_length=200, verbose_name='AI 生成摘要')),
                ('status', models.CharField(choices=[('pending', '待处理'), ('auto_replied', '已自动回复'), ('issue_created', '已创建 Issue'), ('resolved', '已解决'), ('ignored', '已忽略')], default='pending', max_length=20, verbose_name='处理状态')),
                ('github_issue_url', models.URLField(blank=True, help_text='自动创建的 GitHub Issue 链接', verbose_name='GitHub Issue URL')),
                ('github_issue_number', models.IntegerField(blank=True, null=True, verbose_name='GitHub Issue 编号')),
                ('auto_reply_text', models.TextField(blank=True, verbose_name='自动回复内容')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='收到时间')),
                ('processed_at', models.DateTimeField(blank=True, null=True, verbose_name='处理完成时间')),
            ],
            options={
                'verbose_name': '用户反馈',
                'verbose_name_plural': '用户反馈',
                'db_table': 't_user_feedback',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='userfeedback',
            index=models.Index(fields=['status', 'created_at'], name='feedback_status_time_idx'),
        ),
        migrations.AddIndex(
            model_name='userfeedback',
            index=models.Index(fields=['category', 'workstation'], name='feedback_cat_ws_idx'),
        ),
    ]
