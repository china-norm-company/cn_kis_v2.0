# 预约管理：拼音首字母改为用户手动填写或上传，不再自动生成

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0023_merge_20260310_1853'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectappointment',
            name='name_pinyin_initials',
            field=models.CharField(
                blank=True,
                default='',
                help_text='受试者姓名拼音首字母缩写，如 张三→ZS；手动填写或导入时上传',
                max_length=50,
                verbose_name='拼音首字母',
            ),
        ),
    ]
