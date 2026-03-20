from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0017_subject_consent_receipt_no'),
    ]

    operations = [
        migrations.RenameField(
            model_name='identityverifysession',
            old_name='biz_token',
            new_name='byted_token',
        ),
        migrations.AlterField(
            model_name='identityverifysession',
            name='byted_token',
            field=models.CharField('火山引擎 byted_token', blank=True, default='', max_length=500),
        ),
        migrations.AlterField(
            model_name='identityverifysession',
            name='provider',
            field=models.CharField('服务商', default='volcengine_cert', max_length=32),
        ),
    ]
