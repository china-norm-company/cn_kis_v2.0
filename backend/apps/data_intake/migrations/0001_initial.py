"""
外部数据接入激活网关 — 初始迁移

创建 t_ext_ingest_candidate 表（ExternalDataIngestCandidate）。
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ExternalDataIngestCandidate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('source_type', models.CharField(
                    choices=[
                        ('lims', 'LIMS实验室系统'),
                        ('feishu_mail', '飞书邮件'),
                        ('feishu_im', '飞书消息'),
                        ('feishu_doc', '飞书文档'),
                        ('feishu_approval', '飞书审批'),
                        ('feishu_calendar', '飞书日历'),
                        ('ekuaibao', '易快报'),
                    ],
                    max_length=30,
                    verbose_name='来源类型',
                )),
                ('source_raw_id', models.BigIntegerField(
                    help_text='指向原始层记录 PK（不设外键，跨源解耦）',
                    verbose_name='原始记录ID',
                )),
                ('source_module', models.CharField(
                    blank=True,
                    default='',
                    help_text='LIMS：equipment/personnel/commission 等；EKB：flows/approvals 等',
                    max_length=80,
                    verbose_name='数据模块',
                )),
                ('source_snapshot', models.JSONField(
                    help_text='候选生成时冻结的原始字段，供对比视图展示（只读）',
                    verbose_name='原始数据快照',
                )),
                ('source_display_title', models.CharField(
                    blank=True,
                    default='',
                    help_text='在审核列表中展示的简短标题',
                    max_length=300,
                    verbose_name='来源摘要标题',
                )),
                ('target_workstation', models.CharField(
                    choices=[
                        ('execution', '执行工作台'),
                        ('quality', '质量工作台'),
                        ('finance', '财务工作台'),
                        ('hr', '人事工作台'),
                        ('lab_personnel', '实验室人员工作台'),
                        ('research', '研究工作台'),
                        ('crm', 'CRM工作台'),
                    ],
                    max_length=30,
                    verbose_name='目标工作台',
                )),
                ('target_model', models.CharField(
                    blank=True,
                    default='',
                    help_text='如 CRFRecord / InstrumentMeasurement / Deviation',
                    max_length=100,
                    verbose_name='目标模型',
                )),
                ('mapped_fields', models.JSONField(
                    default=dict,
                    help_text='自动映射结果 {field_name: {value, label, confidence, source_field}}',
                    verbose_name='自动映射字段',
                )),
                ('confidence_score', models.FloatField(
                    default=0.0,
                    help_text='0.0~1.0，由各字段置信度加权平均得出',
                    verbose_name='整体置信度',
                )),
                ('review_status', models.CharField(
                    choices=[
                        ('pending', '待审核'),
                        ('approved', '已批准'),
                        ('rejected', '已拒绝'),
                        ('ingested', '已接入'),
                        ('auto_ingested', '已自动接入'),
                    ],
                    default='pending',
                    max_length=20,
                    verbose_name='审核状态',
                )),
                ('reviewed_by_id', models.BigIntegerField(
                    blank=True,
                    help_text='指向 t_account.id',
                    null=True,
                    verbose_name='审核人ID',
                )),
                ('reviewed_by_name', models.CharField(
                    blank=True,
                    default='',
                    max_length=100,
                    verbose_name='审核人姓名',
                )),
                ('reviewed_at', models.DateTimeField(
                    blank=True,
                    null=True,
                    verbose_name='审核时间',
                )),
                ('review_comment', models.TextField(
                    blank=True,
                    default='',
                    verbose_name='审核备注',
                )),
                ('reject_reason', models.CharField(
                    blank=True,
                    choices=[
                        ('data_quality', '数据质量差'),
                        ('duplicate', '重复数据'),
                        ('wrong_scope', '不属于本系统'),
                        ('mapping_error', '字段映射错误'),
                        ('other', '其他原因'),
                    ],
                    default='',
                    max_length=30,
                    verbose_name='拒绝原因',
                )),
                ('modified_fields', models.JSONField(
                    default=dict,
                    help_text='审核人修改后的字段值，接入时优先使用此字段（若不为空）',
                    verbose_name='人工修正字段',
                )),
                ('ingested_model', models.CharField(
                    blank=True,
                    default='',
                    max_length=100,
                    verbose_name='已接入模型',
                )),
                ('ingested_record_id', models.BigIntegerField(
                    blank=True,
                    help_text='接入成功后，指向目标领域表的记录 PK',
                    null=True,
                    verbose_name='已接入记录ID',
                )),
                ('ingestion_log', models.JSONField(
                    blank=True,
                    default=dict,
                    help_text='接入操作的详细结果',
                    verbose_name='接入日志',
                )),
                ('created_at', models.DateTimeField(
                    auto_now_add=True,
                    verbose_name='候选创建时间',
                )),
                ('updated_at', models.DateTimeField(
                    auto_now=True,
                    verbose_name='最后更新时间',
                )),
                ('populated_by', models.CharField(
                    blank=True,
                    default='system',
                    help_text='生成此候选的脚本/任务名称',
                    max_length=100,
                    verbose_name='生成来源',
                )),
            ],
            options={
                'verbose_name': '外部数据接入候选',
                'verbose_name_plural': '外部数据接入候选',
                'db_table': 't_ext_ingest_candidate',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='externaldataingestcandidate',
            index=models.Index(
                fields=['source_type', 'source_raw_id'],
                name='ext_ingest_source_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='externaldataingestcandidate',
            index=models.Index(
                fields=['target_workstation', 'review_status'],
                name='ext_ingest_ws_status_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='externaldataingestcandidate',
            index=models.Index(
                fields=['review_status', 'created_at'],
                name='ext_ingest_status_time_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='externaldataingestcandidate',
            index=models.Index(
                fields=['confidence_score'],
                name='ext_ingest_confidence_idx',
            ),
        ),
    ]
