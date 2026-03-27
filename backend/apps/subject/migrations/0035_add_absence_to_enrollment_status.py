# 入组情况增加「缺席」选项
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subject", "0034_alter_subjectprojectsc_enrollment_status_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="subjectprojectsc",
            name="enrollment_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("初筛合格", "初筛合格"),
                    ("正式入组", "正式入组"),
                    ("不合格", "不合格"),
                    ("复筛不合格", "复筛不合格"),
                    ("退出", "退出"),
                    ("缺席", "缺席"),
                ],
                default="",
                help_text="初筛合格/正式入组/不合格/复筛不合格/退出/缺席",
                max_length=20,
                verbose_name="入组情况",
            ),
        ),
    ]
