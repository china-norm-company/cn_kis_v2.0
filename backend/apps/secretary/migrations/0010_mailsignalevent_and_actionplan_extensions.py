from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0009_feishu_usertoken_issuer_preflight'),
    ]

    operations = [
        migrations.CreateModel(
            name='MailSignalEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('account_id', models.IntegerField(db_index=True, verbose_name='账号ID')),
                ('source_context_id', models.BigIntegerField(blank=True, db_index=True, null=True, verbose_name='来源上下文ID')),
                ('source_mail_id', models.CharField(max_length=200, unique=True, verbose_name='飞书邮件ID')),
                ('thread_id', models.CharField(blank=True, db_index=True, default='', max_length=200, verbose_name='邮件线程ID')),
                ('internet_message_id', models.CharField(blank=True, default='', max_length=500, verbose_name='Internet Message ID')),
                ('mailbox_owner_open_id', models.CharField(blank=True, default='', max_length=100, verbose_name='邮箱拥有者OpenID')),
                ('sender_email', models.CharField(db_index=True, max_length=200, verbose_name='发件人邮箱')),
                ('sender_name', models.CharField(blank=True, default='', max_length=200, verbose_name='发件人姓名')),
                ('sender_domain', models.CharField(blank=True, default='', max_length=120, verbose_name='发件域名')),
                ('recipient_emails', models.JSONField(blank=True, default=list, verbose_name='收件人列表')),
                ('cc_emails', models.JSONField(blank=True, default=list, verbose_name='抄送列表')),
                ('subject', models.CharField(blank=True, default='', max_length=500, verbose_name='邮件主题')),
                ('body_text', models.TextField(blank=True, default='', verbose_name='正文文本')),
                ('body_preview', models.TextField(blank=True, default='', verbose_name='正文预览')),
                ('sent_at', models.DateTimeField(blank=True, null=True, verbose_name='发件时间')),
                ('received_at', models.DateTimeField(blank=True, db_index=True, null=True, verbose_name='收件时间')),
                ('is_external', models.BooleanField(db_index=True, default=False, verbose_name='是否外部邮件')),
                ('external_classification', models.CharField(choices=[('external', '外部邮件'), ('internal', '内部邮件'), ('mixed', '混合线程'), ('unknown', '未知')], default='unknown', max_length=30, verbose_name='内外部分类')),
                ('mail_signal_type', models.CharField(choices=[('inquiry', '询价/合作意向'), ('project_followup', '项目执行沟通'), ('competitor_pressure', '竞品/市场压力'), ('complaint', '投诉/强负反馈'), ('relationship_signal', '关系变化信号'), ('unknown', '未分类')], db_index=True, default='unknown', max_length=50, verbose_name='邮件业务类型')),
                ('importance_score', models.IntegerField(blank=True, null=True, verbose_name='重要度分数')),
                ('sentiment_score', models.IntegerField(blank=True, null=True, verbose_name='情绪分数')),
                ('urgency_score', models.IntegerField(blank=True, null=True, verbose_name='紧急度分数')),
                ('confidence_score', models.IntegerField(blank=True, null=True, verbose_name='分类置信度')),
                ('extracted_entities', models.JSONField(blank=True, default=dict, verbose_name='抽取实体')),
                ('extracted_people', models.JSONField(blank=True, default=list, verbose_name='抽取人员')),
                ('extracted_intents', models.JSONField(blank=True, default=list, verbose_name='抽取意图')),
                ('attachment_count', models.IntegerField(default=0, verbose_name='附件数')),
                ('raw_payload', models.JSONField(blank=True, default=dict, verbose_name='原始邮件快照')),
                ('parse_version', models.CharField(default='v1', max_length=20, verbose_name='解析版本')),
                ('status', models.CharField(choices=[('new', '新建'), ('parsed', '已解析'), ('linked', '已关联'), ('tasked', '已生成任务'), ('completed', '已完成'), ('ignored', '已忽略'), ('error', '异常')], db_index=True, default='new', max_length=30, verbose_name='状态')),
                ('error_note', models.TextField(blank=True, default='', verbose_name='异常说明')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '邮件业务事件',
                'db_table': 't_mail_signal_event',
                'ordering': ['-received_at', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='MailSignalAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mail_signal_event_id', models.BigIntegerField(db_index=True, verbose_name='邮件事件ID')),
                ('attachment_id', models.CharField(blank=True, default='', max_length=200, verbose_name='附件ID')),
                ('filename', models.CharField(max_length=300, verbose_name='文件名')),
                ('content_type', models.CharField(blank=True, default='', max_length=120, verbose_name='MIME 类型')),
                ('file_size', models.BigIntegerField(blank=True, null=True, verbose_name='文件大小')),
                ('storage_uri', models.CharField(blank=True, default='', max_length=500, verbose_name='内部存储地址')),
                ('extract_status', models.CharField(default='pending', max_length=30, verbose_name='抽取状态')),
                ('extract_summary', models.TextField(blank=True, default='', verbose_name='附件提要')),
                ('extract_entities', models.JSONField(blank=True, default=dict, verbose_name='附件抽取实体')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '邮件业务附件',
                'db_table': 't_mail_signal_attachment',
                'ordering': ['id'],
            },
        ),
        migrations.CreateModel(
            name='MailSignalLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mail_signal_event_id', models.BigIntegerField(db_index=True, verbose_name='邮件事件ID')),
                ('link_type', models.CharField(choices=[('client', '客户'), ('contact', '联系人'), ('opportunity', '商机'), ('protocol', '协议/项目'), ('account', '内部账号'), ('task', '动作任务')], max_length=40, verbose_name='关联类型')),
                ('target_id', models.BigIntegerField(verbose_name='目标对象ID')),
                ('match_method', models.CharField(choices=[('exact_email', '邮箱精确匹配'), ('domain', '域名匹配'), ('signature', '签名匹配'), ('thread', '线程匹配'), ('manual', '人工指定')], max_length=40, verbose_name='匹配方式')),
                ('match_score', models.IntegerField(blank=True, null=True, verbose_name='匹配分数')),
                ('is_primary', models.BooleanField(default=False, verbose_name='是否主关联')),
                ('confirmed', models.BooleanField(default=False, verbose_name='是否确认')),
                ('confirmed_by', models.IntegerField(blank=True, null=True, verbose_name='确认人ID')),
                ('confirmed_at', models.DateTimeField(blank=True, null=True, verbose_name='确认时间')),
                ('note', models.TextField(blank=True, default='', verbose_name='说明')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '邮件事件关联',
                'db_table': 't_mail_signal_link',
                'ordering': ['-is_primary', '-match_score', 'id'],
            },
        ),
        migrations.CreateModel(
            name='MailThreadSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('thread_id', models.CharField(max_length=200, verbose_name='线程ID')),
                ('account_id', models.IntegerField(db_index=True, verbose_name='账号ID')),
                ('last_mail_signal_event_id', models.BigIntegerField(blank=True, null=True, verbose_name='最近事件ID')),
                ('primary_client_id', models.BigIntegerField(blank=True, null=True, verbose_name='主客户ID')),
                ('primary_contact_id', models.BigIntegerField(blank=True, null=True, verbose_name='主联系人ID')),
                ('primary_protocol_id', models.BigIntegerField(blank=True, null=True, verbose_name='主项目ID')),
                ('context_summary', models.TextField(blank=True, default='', verbose_name='线程摘要')),
                ('last_signal_type', models.CharField(choices=[('inquiry', '询价/合作意向'), ('project_followup', '项目执行沟通'), ('competitor_pressure', '竞品/市场压力'), ('complaint', '投诉/强负反馈'), ('relationship_signal', '关系变化信号'), ('unknown', '未分类')], default='unknown', max_length=50, verbose_name='最近信号类型')),
                ('last_sentiment_score', models.IntegerField(blank=True, null=True, verbose_name='最近情绪分数')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '邮件线程快照',
                'db_table': 't_mail_thread_snapshot',
                'unique_together': {('thread_id', 'account_id')},
            },
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='biz_domain',
            field=models.CharField(blank=True, default='', max_length=40, verbose_name='业务域'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='task_key',
            field=models.CharField(blank=True, default='', max_length=80, verbose_name='标准任务键'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='source_event_id',
            field=models.BigIntegerField(blank=True, db_index=True, null=True, verbose_name='来源事件ID'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='source_event_type',
            field=models.CharField(blank=True, default='', max_length=40, verbose_name='来源事件类型'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='target_object_refs',
            field=models.JSONField(blank=True, default=list, verbose_name='目标业务对象引用'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='evidence_refs',
            field=models.JSONField(blank=True, default=list, verbose_name='证据引用'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='draft_artifact_refs',
            field=models.JSONField(blank=True, default=list, verbose_name='草稿产物引用'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='priority_score',
            field=models.IntegerField(blank=True, null=True, verbose_name='优先级分数'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='confidence_score',
            field=models.IntegerField(blank=True, null=True, verbose_name='置信度分数'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='owner_account_id',
            field=models.IntegerField(blank=True, null=True, verbose_name='责任人账号ID'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='reviewer_account_id',
            field=models.IntegerField(blank=True, null=True, verbose_name='审核人账号ID'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='due_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='期望完成时间'),
        ),
        migrations.AddField(
            model_name='assistantactionplan',
            name='source_trace',
            field=models.JSONField(blank=True, default=list, verbose_name='来源追踪'),
        ),
        migrations.AddIndex(
            model_name='mailsignalevent',
            index=models.Index(fields=['account_id', 'received_at'], name='t_mail_sign_account_917def_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignalevent',
            index=models.Index(fields=['sender_email'], name='t_mail_sign_sender__8a0e87_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignalevent',
            index=models.Index(fields=['thread_id'], name='t_mail_sign_thread__92155b_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignalevent',
            index=models.Index(fields=['status', 'is_external'], name='t_mail_sign_status_69dff9_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignalevent',
            index=models.Index(fields=['mail_signal_type', 'status'], name='t_mail_sign_mail_si_8cad3b_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignalattachment',
            index=models.Index(fields=['mail_signal_event_id'], name='t_mail_sign_mail_si_f84b44_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignalattachment',
            index=models.Index(fields=['extract_status'], name='t_mail_sign_extract_950673_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignallink',
            index=models.Index(fields=['mail_signal_event_id', 'link_type'], name='t_mail_sign_mail_si_1e4db9_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignallink',
            index=models.Index(fields=['link_type', 'target_id'], name='t_mail_sign_link_ty_58a827_idx'),
        ),
        migrations.AddIndex(
            model_name='mailsignallink',
            index=models.Index(fields=['confirmed', 'match_score'], name='t_mail_sign_confirm_aafdb9_idx'),
        ),
        migrations.AddIndex(
            model_name='mailthreadsnapshot',
            index=models.Index(fields=['thread_id', 'account_id'], name='t_mail_thre_thread__d49233_idx'),
        ),
        migrations.AddIndex(
            model_name='mailthreadsnapshot',
            index=models.Index(fields=['primary_client_id'], name='t_mail_thre_primary_5b8431_idx'),
        ),
        migrations.AddIndex(
            model_name='mailthreadsnapshot',
            index=models.Index(fields=['primary_protocol_id'], name='t_mail_thre_primary_884db1_idx'),
        ),
    ]
