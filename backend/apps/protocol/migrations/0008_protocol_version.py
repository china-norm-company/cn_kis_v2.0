"""
研究方案版本控制 Migration (0008)

新增：
  - t_protocol_version：研究方案版本记录（MDM Task 7-3）
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0007_add_product_line_id'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProtocolVersion',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('protocol', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='versions',
                    to='protocol.protocol',
                    verbose_name='所属方案',
                )),
                ('major', models.PositiveSmallIntegerField(default=1, verbose_name='主版本号')),
                ('minor', models.PositiveSmallIntegerField(default=0, verbose_name='次版本号')),
                ('revision', models.PositiveSmallIntegerField(default=0, verbose_name='修订版号')),
                ('change_type', models.CharField(
                    choices=[('major', '主版本（重大变更，影响受试者权益）'), ('minor', '次版本（中等变更）'), ('revision', '修订版（轻微变更）')],
                    default='revision', max_length=20, verbose_name='变更类型',
                )),
                ('change_summary', models.TextField(blank=True, default='', verbose_name='变更摘要')),
                ('change_details', models.JSONField(default=list, verbose_name='变更明细')),
                ('changed_by_id', models.IntegerField(blank=True, null=True, verbose_name='变更人ID')),
                ('is_current_version', models.BooleanField(db_index=True, default=True, verbose_name='是否当前版本')),
                ('effective_date', models.DateField(blank=True, null=True, verbose_name='生效日期')),
                ('superseded_date', models.DateField(blank=True, null=True, verbose_name='被替代日期')),
                ('parent_version', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='child_versions',
                    to='protocol.protocolversion',
                    verbose_name='父版本',
                )),
                ('requires_reconsent', models.BooleanField(default=False, verbose_name='需要重新知情同意')),
                ('submitted_to_ethics', models.BooleanField(default=False, verbose_name='已递交伦理审查')),
                ('ethics_approval_date', models.DateField(blank=True, null=True, verbose_name='伦理批准日期')),
                ('ethics_reference', models.CharField(blank=True, default='', max_length=100, verbose_name='伦理批件号')),
                ('file_path', models.CharField(blank=True, default='', max_length=500, verbose_name='版本文件路径')),
                ('checksum', models.CharField(blank=True, default='', max_length=64, verbose_name='文件 SHA-256 校验和')),
                ('create_time', models.DateTimeField(auto_now_add=True)),
                ('update_time', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': '研究方案版本',
                'db_table': 't_protocol_version',
                'ordering': ['-major', '-minor', '-revision'],
            },
        ),
        migrations.AddConstraint(
            model_name='protocolversion',
            constraint=models.UniqueConstraint(
                fields=['protocol', 'major', 'minor', 'revision'],
                name='t_pv_unique_version',
            ),
        ),
        migrations.AddIndex(
            model_name='protocolversion',
            index=models.Index(fields=['protocol', 'is_current_version'], name='t_pv_protocol_current_idx'),
        ),
        migrations.AddIndex(
            model_name='protocolversion',
            index=models.Index(fields=['protocol', 'major', 'minor', 'revision'], name='t_pv_semver_idx'),
        ),
    ]
