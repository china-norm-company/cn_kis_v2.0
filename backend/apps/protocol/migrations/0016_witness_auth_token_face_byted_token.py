# Generated manually for witness mail face flow (Volcengine H5)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0015_witness_staff_account_link'),
    ]

    operations = [
        migrations.AddField(
            model_name='witnessdualsignauthtoken',
            name='face_byted_token',
            field=models.CharField(
                blank=True,
                default='',
                help_text='邮件公开链接触发核身后暂存，核验通过后清空',
                max_length=512,
                verbose_name='火山人脸核身 byted_token',
            ),
        ),
    ]
