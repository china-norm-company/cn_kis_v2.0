from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("weekly_report", "0003_weeklyreportnotes_next_week_plan"),
    ]

    operations = [
        migrations.AddField(
            model_name="weeklyreport",
            name="draft_content",
            field=models.TextField(blank=True, default="", verbose_name="草稿预览正文（预览框编辑后内容）"),
        ),
    ]
