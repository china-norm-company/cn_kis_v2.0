from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("weekly_report", "0002_weeklyreport_submitted_content"),
    ]

    operations = [
        migrations.AddField(
            model_name="weeklyreportnotes",
            name="next_week_plan",
            field=models.TextField(blank=True, default="", verbose_name="下周计划"),
        ),
    ]
