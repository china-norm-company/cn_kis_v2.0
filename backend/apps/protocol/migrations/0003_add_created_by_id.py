# 为 Protocol 模型添加 created_by_id 字段

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0002_feishu_project_work_item_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='protocol',
            name='created_by_id',
            field=models.IntegerField(
                blank=True, db_index=True, null=True,
                help_text='Account ID', verbose_name='创建人ID',
            ),
        ),
    ]
