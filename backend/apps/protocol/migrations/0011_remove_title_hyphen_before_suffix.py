# 知情管理：移除项目名称后缀前的连字符（-功效评价 -> 功效评价）
from django.db import migrations


def remove_hyphen_before_suffix(apps, schema_editor):
    Protocol = apps.get_model('protocol', 'Protocol')
    for p in Protocol.objects.filter(is_deleted=False):
        if p.title and '-功效评价' in p.title:
            new_title = p.title.replace('-功效评价', '功效评价')
            Protocol.objects.filter(pk=p.pk).update(title=new_title)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0010_protocol_code_title_cosmetic_format'),
    ]

    operations = [
        migrations.RunPython(remove_hyphen_before_suffix, noop),
    ]
