# 为 Subject 模型添加 created_by_id 字段

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='subject',
            name='created_by_id',
            field=models.IntegerField(
                blank=True, db_index=True, null=True,
                help_text='Account ID', verbose_name='创建人ID',
            ),
        ),
    ]
