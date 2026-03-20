# Generated migration for extended ethics models

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('ethics', '0001_initial'),
        ('protocol', '0004_alter_protocol_feishu_project_work_item_id'),
    ]

    operations = [
        # ================================================================
        # EthicsReviewOpinion (ETH002)
        # ================================================================
        migrations.CreateModel(
            name='EthicsReviewOpinion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('opinion_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='意见编号')),
                ('opinion_type', models.CharField(choices=[
                    ('approve', '批准'),
                    ('conditional_approve', '有条件批准'),
                    ('revise', '修改后再审'),
                    ('disapprove', '不批准'),
                    ('suspend', '暂停'),
                    ('terminate', '终止'),
                ], max_length=30, verbose_name='意见类型')),
                ('review_date', models.DateField(verbose_name='审查日期')),
                ('summary', models.TextField(verbose_name='摘要')),
                ('detailed_opinion', models.TextField(verbose_name='详细意见')),
                ('modification_requirements', models.TextField(blank=True, default='', verbose_name='修改要求')),
                ('reviewer_names', models.JSONField(default=list, verbose_name='审查委员')),
                ('response_required', models.BooleanField(default=False, verbose_name='是否需要回复')),
                ('response_deadline', models.DateField(blank=True, null=True, verbose_name='回复截止日期')),
                ('response_received', models.BooleanField(default=False, verbose_name='是否已回复')),
                ('response_text', models.TextField(blank=True, default='', verbose_name='回复内容')),
                ('response_date', models.DateField(blank=True, null=True, verbose_name='回复日期')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('application', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='review_opinions',
                    to='ethics.ethicsapplication',
                    verbose_name='关联伦理申请',
                )),
            ],
            options={
                'verbose_name': '伦理审查意见',
                'db_table': 't_ethics_review_opinion',
                'ordering': ['-review_date', '-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='ethicsreviewopinion',
            index=models.Index(fields=['application', 'opinion_type'], name='t_ethics_re_applica_idx'),
        ),
        migrations.AddIndex(
            model_name='ethicsreviewopinion',
            index=models.Index(fields=['opinion_no'], name='t_ethics_re_opinion_idx'),
        ),

        # ================================================================
        # EthicsSupervision (ETH004)
        # ================================================================
        migrations.CreateModel(
            name='EthicsSupervision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('supervision_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='监督编号')),
                ('supervision_type', models.CharField(choices=[
                    ('routine', '常规监督'),
                    ('targeted', '专项监督'),
                    ('follow_up', '跟踪监督'),
                    ('unannounced', '飞行检查'),
                ], default='routine', max_length=30, verbose_name='监督类型')),
                ('status', models.CharField(choices=[
                    ('planned', '已计划'),
                    ('in_progress', '进行中'),
                    ('completed', '已完成'),
                ], default='planned', max_length=20, verbose_name='状态')),
                ('planned_date', models.DateField(blank=True, null=True, verbose_name='计划日期')),
                ('actual_date', models.DateField(blank=True, null=True, verbose_name='实际日期')),
                ('completed_date', models.DateField(blank=True, null=True, verbose_name='完成日期')),
                ('scope', models.TextField(blank=True, default='', verbose_name='监督范围')),
                ('findings', models.TextField(blank=True, default='', verbose_name='监督发现')),
                ('corrective_actions', models.TextField(blank=True, default='', verbose_name='整改要求')),
                ('corrective_deadline', models.DateField(blank=True, null=True, verbose_name='整改截止日期')),
                ('corrective_completed', models.BooleanField(default=False, verbose_name='整改已完成')),
                ('verification_notes', models.TextField(blank=True, default='', verbose_name='验证记录')),
                ('notes', models.TextField(blank=True, default='', verbose_name='备注')),
                ('supervisor_names', models.JSONField(default=list, verbose_name='监督人员')),
                ('feishu_chat_id', models.CharField(blank=True, default='', max_length=100, verbose_name='项目群聊ID')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('protocol', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ethics_supervisions',
                    to='protocol.protocol',
                    verbose_name='关联项目',
                )),
            ],
            options={
                'verbose_name': '伦理监督',
                'db_table': 't_ethics_supervision',
                'ordering': ['-planned_date', '-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='ethicssupervision',
            index=models.Index(fields=['protocol', 'status'], name='t_ethics_su_protoco_idx'),
        ),
        migrations.AddIndex(
            model_name='ethicssupervision',
            index=models.Index(fields=['supervision_no'], name='t_ethics_su_supervi_idx'),
        ),

        # ================================================================
        # Regulation (REG001)
        # ================================================================
        migrations.CreateModel(
            name='Regulation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=500, verbose_name='法规名称')),
                ('regulation_type', models.CharField(choices=[
                    ('law', '法律'),
                    ('regulation', '法规'),
                    ('guideline', '指导原则'),
                    ('standard', '标准'),
                    ('notice', '通知/公告'),
                ], max_length=30, verbose_name='法规类型')),
                ('issuing_authority', models.CharField(blank=True, default='', max_length=200, verbose_name='发布机构')),
                ('document_number', models.CharField(blank=True, default='', max_length=200, verbose_name='文号')),
                ('publish_date', models.DateField(blank=True, null=True, verbose_name='发布日期')),
                ('effective_date', models.DateField(blank=True, null=True, verbose_name='生效日期')),
                ('status', models.CharField(choices=[
                    ('draft', '草案'),
                    ('published', '已发布'),
                    ('effective', '已生效'),
                    ('amended', '已修订'),
                    ('repealed', '已废止'),
                ], default='published', max_length=20, verbose_name='状态')),
                ('summary', models.TextField(blank=True, default='', verbose_name='摘要')),
                ('key_requirements', models.TextField(blank=True, default='', verbose_name='核心要求')),
                ('full_text_url', models.URLField(blank=True, default='', max_length=500, verbose_name='全文链接')),
                ('impact_level', models.CharField(choices=[
                    ('high', '高'),
                    ('medium', '中'),
                    ('low', '低'),
                ], default='medium', max_length=10, verbose_name='影响级别')),
                ('affected_areas', models.JSONField(default=list, verbose_name='受影响领域')),
                ('impact_analysis', models.TextField(blank=True, default='', verbose_name='影响分析')),
                ('action_items', models.TextField(blank=True, default='', verbose_name='行动项')),
                ('action_deadline', models.DateField(blank=True, null=True, verbose_name='行动截止日期')),
                ('action_completed', models.BooleanField(default=False, verbose_name='行动已完成')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '法规信息',
                'db_table': 't_ethics_regulation',
                'ordering': ['-publish_date', '-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='regulation',
            index=models.Index(fields=['regulation_type', 'status'], name='t_ethics_rg_regtype_idx'),
        ),
        migrations.AddIndex(
            model_name='regulation',
            index=models.Index(fields=['impact_level'], name='t_ethics_rg_impact_idx'),
        ),

        # ================================================================
        # ComplianceCheck (REG002)
        # ================================================================
        migrations.CreateModel(
            name='ComplianceCheck',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('check_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='检查编号')),
                ('check_type', models.CharField(choices=[
                    ('internal', '内部自查'),
                    ('external', '外部检查'),
                    ('joint', '联合检查'),
                    ('mock', '模拟检查'),
                ], max_length=20, verbose_name='检查类型')),
                ('status', models.CharField(choices=[
                    ('planned', '已计划'),
                    ('in_progress', '进行中'),
                    ('completed', '已完成'),
                ], default='planned', max_length=20, verbose_name='状态')),
                ('scope', models.TextField(verbose_name='检查范围')),
                ('check_date', models.DateField(blank=True, null=True, verbose_name='检查日期')),
                ('completed_date', models.DateField(blank=True, null=True, verbose_name='完成日期')),
                ('lead_auditor', models.CharField(blank=True, default='', max_length=100, verbose_name='主审')),
                ('team_members', models.JSONField(default=list, verbose_name='检查组成员')),
                ('finding_count', models.IntegerField(default=0, verbose_name='发现数量')),
                ('critical_count', models.IntegerField(default=0, verbose_name='严重问题数')),
                ('notes', models.TextField(blank=True, default='', verbose_name='备注')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('protocol', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='compliance_checks',
                    to='protocol.protocol',
                    verbose_name='关联项目',
                )),
            ],
            options={
                'verbose_name': '合规检查',
                'db_table': 't_ethics_compliance_check',
                'ordering': ['-check_date', '-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='compliancecheck',
            index=models.Index(fields=['check_type', 'status'], name='t_ethics_cc_type_st_idx'),
        ),
        migrations.AddIndex(
            model_name='compliancecheck',
            index=models.Index(fields=['check_no'], name='t_ethics_cc_checkno_idx'),
        ),

        # ================================================================
        # ComplianceFinding (REG002)
        # ================================================================
        migrations.CreateModel(
            name='ComplianceFinding',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('finding_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='发现编号')),
                ('severity', models.CharField(choices=[
                    ('critical', '严重'),
                    ('major', '主要'),
                    ('minor', '次要'),
                    ('observation', '观察项'),
                ], max_length=20, verbose_name='严重程度')),
                ('description', models.TextField(verbose_name='问题描述')),
                ('evidence', models.TextField(blank=True, default='', verbose_name='证据')),
                ('root_cause', models.TextField(blank=True, default='', verbose_name='根本原因')),
                ('corrective_action', models.TextField(blank=True, default='', verbose_name='整改措施')),
                ('corrective_deadline', models.DateField(blank=True, null=True, verbose_name='整改截止日期')),
                ('status', models.CharField(choices=[
                    ('open', '待整改'),
                    ('in_progress', '整改中'),
                    ('closed', '已关闭'),
                    ('verified', '已验证'),
                ], default='open', max_length=20, verbose_name='状态')),
                ('related_deviation_id', models.IntegerField(blank=True, null=True, verbose_name='关联偏差ID')),
                ('related_capa_id', models.IntegerField(blank=True, null=True, verbose_name='关联CAPA ID')),
                ('verified_by', models.CharField(blank=True, default='', max_length=100, verbose_name='验证人')),
                ('verified_at', models.DateTimeField(blank=True, null=True, verbose_name='验证时间')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('compliance_check', models.ForeignKey(
                    db_column='check_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='findings',
                    to='ethics.compliancecheck',
                    verbose_name='关联检查',
                )),
            ],
            options={
                'verbose_name': '合规检查发现',
                'db_table': 't_ethics_compliance_finding',
                'ordering': ['-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='compliancefinding',
            index=models.Index(fields=['compliance_check', 'severity'], name='t_ethics_cf_chk_sev_idx'),
        ),
        migrations.AddIndex(
            model_name='compliancefinding',
            index=models.Index(fields=['status'], name='t_ethics_cf_status_idx'),
        ),
        migrations.AddIndex(
            model_name='compliancefinding',
            index=models.Index(fields=['finding_no'], name='t_ethics_cf_findno_idx'),
        ),

        # ================================================================
        # RegulatoryCorrespondence (REG003)
        # ================================================================
        migrations.CreateModel(
            name='RegulatoryCorrespondence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('correspondence_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='沟通编号')),
                ('direction', models.CharField(choices=[
                    ('inbound', '收件'),
                    ('outbound', '发件'),
                ], max_length=10, verbose_name='方向')),
                ('subject', models.CharField(max_length=500, verbose_name='主题')),
                ('content', models.TextField(blank=True, default='', verbose_name='内容')),
                ('counterpart', models.CharField(blank=True, default='', max_length=200, verbose_name='对方机构')),
                ('contact_person', models.CharField(blank=True, default='', max_length=100, verbose_name='联系人')),
                ('correspondence_date', models.DateField(blank=True, null=True, verbose_name='沟通日期')),
                ('reply_deadline', models.DateField(blank=True, null=True, verbose_name='回复截止日期')),
                ('status', models.CharField(choices=[
                    ('draft', '草稿'),
                    ('sent', '已发送'),
                    ('received', '已接收'),
                    ('replied', '已回复'),
                    ('closed', '已关闭'),
                ], default='draft', max_length=20, verbose_name='状态')),
                ('attachment_urls', models.JSONField(default=list, verbose_name='附件列表')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('parent', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='replies',
                    to='ethics.regulatorycorrespondence',
                    verbose_name='回复的沟通',
                )),
                ('protocol', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='regulatory_correspondences',
                    to='protocol.protocol',
                    verbose_name='关联项目',
                )),
            ],
            options={
                'verbose_name': '监管沟通',
                'db_table': 't_ethics_regulatory_correspondence',
                'ordering': ['-correspondence_date', '-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='regulatorycorrespondence',
            index=models.Index(fields=['direction', 'status'], name='t_ethics_rc_dir_sts_idx'),
        ),
        migrations.AddIndex(
            model_name='regulatorycorrespondence',
            index=models.Index(fields=['correspondence_no'], name='t_ethics_rc_corrno_idx'),
        ),

        # ================================================================
        # ComplianceTraining (REG004)
        # ================================================================
        migrations.CreateModel(
            name='ComplianceTraining',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('training_no', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='培训编号')),
                ('title', models.CharField(max_length=300, verbose_name='培训主题')),
                ('training_type', models.CharField(choices=[
                    ('gcp', 'GCP 培训'),
                    ('ethics', '伦理培训'),
                    ('regulation', '法规培训'),
                    ('sop', 'SOP 培训'),
                    ('safety', '安全培训'),
                    ('other', '其他'),
                ], max_length=20, verbose_name='培训类型')),
                ('status', models.CharField(choices=[
                    ('planned', '已计划'),
                    ('in_progress', '进行中'),
                    ('completed', '已完成'),
                    ('cancelled', '已取消'),
                ], default='planned', max_length=20, verbose_name='状态')),
                ('training_date', models.DateField(blank=True, null=True, verbose_name='培训日期')),
                ('duration_hours', models.DecimalField(decimal_places=1, default=0, max_digits=5, verbose_name='培训时长(小时)')),
                ('location', models.CharField(blank=True, default='', max_length=200, verbose_name='培训地点')),
                ('trainer', models.CharField(blank=True, default='', max_length=100, verbose_name='培训讲师')),
                ('content', models.TextField(blank=True, default='', verbose_name='培训内容')),
                ('materials_url', models.URLField(blank=True, default='', max_length=500, verbose_name='培训材料URL')),
                ('passing_score', models.IntegerField(default=60, verbose_name='及格分数')),
                ('participant_count', models.IntegerField(default=0, verbose_name='参与人数')),
                ('pass_count', models.IntegerField(default=0, verbose_name='通过人数')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('protocol', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='compliance_trainings',
                    to='protocol.protocol',
                    verbose_name='关联项目',
                )),
            ],
            options={
                'verbose_name': '合规培训',
                'db_table': 't_ethics_compliance_training',
                'ordering': ['-training_date', '-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='compliancetraining',
            index=models.Index(fields=['training_type', 'status'], name='t_ethics_ct_type_st_idx'),
        ),
        migrations.AddIndex(
            model_name='compliancetraining',
            index=models.Index(fields=['training_no'], name='t_ethics_ct_trainno_idx'),
        ),

        # ================================================================
        # TrainingParticipant (REG004)
        # ================================================================
        migrations.CreateModel(
            name='TrainingParticipant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('staff_id', models.IntegerField(verbose_name='员工ID')),
                ('staff_name', models.CharField(max_length=100, verbose_name='员工姓名')),
                ('attended', models.BooleanField(default=False, verbose_name='是否出席')),
                ('exam_score', models.IntegerField(blank=True, null=True, verbose_name='考核分数')),
                ('passed', models.BooleanField(default=False, verbose_name='是否通过')),
                ('certificate_no', models.CharField(blank=True, default='', max_length=100, verbose_name='证书编号')),
                ('feedback', models.TextField(blank=True, default='', verbose_name='反馈')),
                ('satisfaction_score', models.IntegerField(blank=True, null=True, verbose_name='满意度评分')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('training', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='participants',
                    to='ethics.compliancetraining',
                    verbose_name='关联培训',
                )),
            ],
            options={
                'verbose_name': '培训参与者',
                'db_table': 't_ethics_training_participant',
                'ordering': ['staff_name'],
                'unique_together': {('training', 'staff_id')},
            },
        ),
    ]
