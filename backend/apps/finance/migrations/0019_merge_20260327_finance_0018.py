# 合并 finance 两条 0018 分支

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0018_merge_20260323_1551'),
        ('finance', '0018_merge_20260326_1808'),
    ]

    operations = []
