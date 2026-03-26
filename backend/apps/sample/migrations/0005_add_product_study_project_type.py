from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sample', '0004_add_dispensing_workorder_visit_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='study_project_type',
            field=models.CharField(
                blank=True,
                choices=[
                    ('clinical', '临床测试'),
                    ('consumer_clt', '消费者测试-CLT'),
                    ('consumer_hut', '消费者测试-HUT'),
                ],
                db_index=True,
                default=None,
                max_length=32,
                null=True,
                verbose_name='项目类型',
            ),
        ),
    ]
