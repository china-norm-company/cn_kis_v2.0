# 知情管理：移除项目名称末尾的通用「功效评价」后缀，保留各项目特色
from django.db import migrations


def remove_generic_suffix(apps, schema_editor):
    Protocol = apps.get_model('protocol', 'Protocol')
    for p in Protocol.objects.filter(is_deleted=False):
        if p.title and p.title.endswith('功效评价'):
            new_title = p.title[:-4]  # 移除「功效评价」4个字符
            if new_title.strip():
                Protocol.objects.filter(pk=p.pk).update(title=new_title.strip())


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0011_remove_title_hyphen_before_suffix'),
    ]

    operations = [
        migrations.RunPython(remove_generic_suffix, noop),
    ]
