# Role 模型增加 level, category, is_active 字段

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='level',
            field=models.IntegerField(default=5, help_text='数字越大权限越高', verbose_name='权限级别(L1-L10)'),
        ),
        migrations.AddField(
            model_name='role',
            name='category',
            field=models.CharField(
                choices=[
                    ('management', '管理层'),
                    ('operation', '运营执行'),
                    ('technical', '技术研发'),
                    ('support', '职能支持'),
                    ('external', '外部用户'),
                ],
                default='operation',
                max_length=20,
                verbose_name='角色分类',
            ),
        ),
        migrations.AddField(
            model_name='role',
            name='is_active',
            field=models.BooleanField(default=True, verbose_name='是否启用'),
        ),
        migrations.AlterField(
            model_name='role',
            name='name',
            field=models.CharField(db_index=True, max_length=50, unique=True, verbose_name='角色标识'),
        ),
    ]
