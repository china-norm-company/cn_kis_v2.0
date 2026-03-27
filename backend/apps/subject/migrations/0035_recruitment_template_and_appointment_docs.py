# Generated manually: 招募模板广告字段 + 预约文档表 + 计划预约文档状态

import apps.subject.models_recruitment
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0034_recruitment_plan_weizhou_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='recruitmentad',
            name='reject_reason',
            field=models.TextField(blank=True, default='', verbose_name='驳回原因'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='submitted_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='提交审批时间'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='submitted_by_id',
            field=models.IntegerField(blank=True, null=True, verbose_name='提交人ID'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='template_honorarium',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True, verbose_name='模板-礼金'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='template_liaison_fee',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True, verbose_name='模板-联络费'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='template_project_code',
            field=models.CharField(blank=True, default='', max_length=128, verbose_name='模板-项目编号'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='template_project_name',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='模板-项目名称'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='template_sample_requirement',
            field=models.TextField(blank=True, default='', verbose_name='模板-样本要求'),
        ),
        migrations.AddField(
            model_name='recruitmentad',
            name='template_visit_date',
            field=models.DateField(blank=True, null=True, verbose_name='模板-具体访视日期'),
        ),
        migrations.AddField(
            model_name='recruitmentplan',
            name='appointment_docs_reject_reason',
            field=models.TextField(blank=True, default='', verbose_name='预约文档驳回原因'),
        ),
        migrations.AddField(
            model_name='recruitmentplan',
            name='appointment_docs_status',
            field=models.CharField(
                choices=[
                    ('missing', '待上传'),
                    ('pending_review', '待审批'),
                    ('approved', '已通过'),
                    ('rejected', '已驳回'),
                ],
                db_index=True,
                default='missing',
                max_length=20,
                verbose_name='招募预约文档状态',
            ),
        ),
        migrations.AlterField(
            model_name='recruitmentad',
            name='ad_type',
            field=models.CharField(
                choices=[
                    ('poster', '海报'),
                    ('flyer', '传单'),
                    ('online_ad', '线上广告'),
                    ('video', '视频'),
                    ('article', '文章'),
                    ('social_media', '社交媒体'),
                    ('recruit_template', '招募模板'),
                ],
                max_length=20,
                verbose_name='广告类型',
            ),
        ),
        migrations.CreateModel(
            name='RecruitmentPlanAppointmentDoc',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'doc_type',
                    models.CharField(
                        choices=[
                            ('phone_appointment_flow', '测试电话预约流程'),
                            ('phone_screening_questionnaire', '电话甄别问卷'),
                            ('phone_appointment_form', '电话预约信息表'),
                        ],
                        db_index=True,
                        max_length=40,
                        verbose_name='文档类型',
                    ),
                ),
                (
                    'file',
                    models.FileField(
                        max_length=500,
                        upload_to=apps.subject.models_recruitment._appointment_doc_upload_to,
                        verbose_name='文件',
                    ),
                ),
                ('original_filename', models.CharField(blank=True, default='', max_length=255, verbose_name='原始文件名')),
                ('file_size', models.BigIntegerField(default=0, verbose_name='文件大小')),
                ('uploaded_by_id', models.IntegerField(blank=True, null=True, verbose_name='上传人ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                (
                    'plan',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='appointment_docs',
                        to='subject.recruitmentplan',
                    ),
                ),
            ],
            options={
                'verbose_name': '招募预约文档',
                'db_table': 't_recruitment_plan_appointment_doc',
            },
        ),
        migrations.AddConstraint(
            model_name='recruitmentplanappointmentdoc',
            constraint=models.UniqueConstraint(fields=('plan', 'doc_type'), name='uniq_plan_appointment_doc_type'),
        ),
    ]
