from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='QRCodeRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entity_type', models.CharField(choices=[('subject', '受试者'), ('station', '场所/工位'), ('sample', '样品'), ('asset', '资产(设备/物资)'), ('workorder', '工单')], db_index=True, max_length=20, verbose_name='实体类型')),
                ('entity_id', models.IntegerField(db_index=True, verbose_name='实体ID')),
                ('qr_data', models.CharField(help_text='编码在二维码中的完整URL或标识', max_length=500, unique=True, verbose_name='二维码数据')),
                ('qr_hash', models.CharField(help_text='用于快速查找的短哈希', max_length=64, unique=True, verbose_name='二维码哈希')),
                ('label', models.CharField(blank=True, default='', help_text='如受试者脱敏姓名、场所名称、设备编号等', max_length=200, verbose_name='显示标签')),
                ('generated_by', models.IntegerField(blank=True, null=True, verbose_name='生成人ID')),
                ('is_active', models.BooleanField(db_index=True, default=True, verbose_name='是否有效')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'db_table': 't_qrcode_record',
                'ordering': ['-create_time'],
                'unique_together': {('entity_type', 'entity_id')},
            },
        ),
        migrations.CreateModel(
            name='ScanAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scanner_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='扫码人ID')),
                ('workstation', models.CharField(blank=True, db_index=True, default='', max_length=50, verbose_name='工作台')),
                ('action', models.CharField(choices=[('checkin', '签到'), ('checkout', '签出'), ('self_checkin', '自助签到'), ('workorder_match', '工单匹配'), ('sample_collect', '样品采集'), ('asset_use', '资产使用'), ('material_issue', '物料出库'), ('stipend_pay', '礼金发放'), ('profile_view', '查看档案'), ('ae_report', '不良反应上报'), ('dropout', '脱落记录'), ('resolve', '通用解析')], default='resolve', max_length=30, verbose_name='触发动作')),
                ('scan_time', models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='扫码时间')),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True, verbose_name='IP地址')),
                ('extra', models.JSONField(blank=True, default=dict, verbose_name='附加信息')),
                ('qr_record', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='scan_logs', to='qrcode.qrcoderecord', verbose_name='二维码记录')),
            ],
            options={
                'db_table': 't_qrcode_scan_log',
                'ordering': ['-scan_time'],
                'indexes': [
                    models.Index(fields=['qr_record', 'scan_time'], name='qrcode_scana_qr_reco_idx'),
                    models.Index(fields=['scanner_id', 'scan_time'], name='qrcode_scana_scanner_idx'),
                ],
            },
        ),
    ]
