from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='LIMSConnection',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, verbose_name='LIMS名称')),
                ('api_base_url', models.URLField(max_length=500, verbose_name='API 基础 URL')),
                ('api_key', models.CharField(blank=True, default='', max_length=500, verbose_name='API密钥')),
                ('auth_type', models.CharField(default='api_key', help_text='api_key/oauth2/basic', max_length=50, verbose_name='认证方式')),
                ('status', models.CharField(choices=[('connected', '已连接'), ('disconnected', '已断开'), ('syncing', '同步中'), ('error', '错误')], default='disconnected', max_length=20, verbose_name='连接状态')),
                ('last_sync_at', models.DateTimeField(blank=True, null=True, verbose_name='上次同步时间')),
                ('sync_interval_minutes', models.IntegerField(default=5, verbose_name='同步间隔（分钟）')),
                ('is_active', models.BooleanField(default=True, verbose_name='是否启用')),
                ('config', models.JSONField(blank=True, default=dict, verbose_name='扩展配置')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': 'LIMS连接',
                'db_table': 't_lims_connection',
            },
        ),
        migrations.CreateModel(
            name='LIMSSyncLog',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sync_type', models.CharField(help_text='calibration/environment/instrument_data', max_length=50, verbose_name='同步类型')),
                ('status', models.CharField(choices=[('connected', '已连接'), ('disconnected', '已断开'), ('syncing', '同步中'), ('error', '错误')], max_length=20, verbose_name='同步状态')),
                ('records_synced', models.IntegerField(default=0, verbose_name='同步记录数')),
                ('error_message', models.TextField(blank=True, default='', verbose_name='错误信息')),
                ('retry_count', models.IntegerField(default=0, verbose_name='重试次数')),
                ('details', models.JSONField(blank=True, default=dict, verbose_name='详情')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('finish_time', models.DateTimeField(blank=True, null=True, verbose_name='完成时间')),
                ('connection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sync_logs', to='lims_integration.limsconnection')),
            ],
            options={
                'verbose_name': 'LIMS同步日志',
                'db_table': 't_lims_sync_log',
                'ordering': ['-create_time'],
            },
        ),
        migrations.CreateModel(
            name='InstrumentDataSession',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('instrument_type', models.CharField(choices=[('visia', 'VISIA-CR'), ('corneometer', 'Corneometer'), ('cutometer', 'Cutometer'), ('mexameter', 'Mexameter'), ('tewameter', 'Tewameter'), ('sebumeter', 'Sebumeter'), ('custom', '自定义')], default='visia', max_length=30, verbose_name='仪器类型')),
                ('instrument_serial', models.CharField(blank=True, default='', max_length=100, verbose_name='仪器序列号')),
                ('subject_id', models.IntegerField(db_index=True, verbose_name='受试者ID')),
                ('visit_id', models.IntegerField(blank=True, null=True, verbose_name='访视ID')),
                ('work_order_id', models.IntegerField(blank=True, null=True, verbose_name='工单ID')),
                ('operator_id', models.IntegerField(blank=True, null=True, verbose_name='操作人ID')),
                ('session_time', models.DateTimeField(verbose_name='采集时间')),
                ('raw_file_path', models.CharField(blank=True, default='', max_length=500, verbose_name='原始文件路径')),
                ('parsed', models.BooleanField(default=False, verbose_name='是否已解析')),
                ('parse_error', models.TextField(blank=True, default='', verbose_name='解析错误')),
                ('metadata', models.JSONField(blank=True, default=dict, verbose_name='扩展元数据')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '仪器数据采集会话',
                'db_table': 't_instrument_data_session',
                'ordering': ['-session_time'],
                'indexes': [
                    models.Index(fields=['subject_id', 'session_time'], name='lims_int_subj_time_idx'),
                    models.Index(fields=['instrument_type', 'session_time'], name='lims_int_type_time_idx'),
                    models.Index(fields=['operator_id'], name='lims_int_operator_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='InstrumentMeasurement',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('metric_name', models.CharField(max_length=100, verbose_name='指标名称')),
                ('metric_value', models.FloatField(verbose_name='测量值')),
                ('unit', models.CharField(blank=True, default='', max_length=30, verbose_name='单位')),
                ('zone', models.CharField(blank=True, default='', help_text='面部区域如 forehead/cheek_l/cheek_r/chin', max_length=50, verbose_name='检测区域')),
                ('percentile', models.FloatField(blank=True, help_text='相对同龄人群的百分位排名', null=True, verbose_name='百分位')),
                ('reference_range', models.JSONField(blank=True, default=dict, help_text='{"min": x, "max": y}', verbose_name='参考范围')),
                ('metadata', models.JSONField(blank=True, default=dict, verbose_name='扩展数据')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='measurements', to='lims_integration.instrumentdatasession')),
            ],
            options={
                'verbose_name': '仪器测量数据',
                'db_table': 't_instrument_measurement',
                'ordering': ['session', 'metric_name'],
                'indexes': [
                    models.Index(fields=['session', 'metric_name'], name='lims_meas_session_metric_idx'),
                ],
            },
        ),
    ]
