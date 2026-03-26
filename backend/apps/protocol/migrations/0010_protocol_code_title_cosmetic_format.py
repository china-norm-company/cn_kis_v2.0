# 知情管理：修正 t_protocol 的 code 为 C26001001 格式（C26+001递增三位数+001后缀），并优化项目名称
# 仅更新 t_protocol 表，不修改其他表
import re
from django.db import migrations


def _optimize_title_for_cosmetic(title):
    """将项目名称优化为化妆品临床功效检测项目格式"""
    if not title or not title.strip():
        return title
    t = title.strip()
    # 移除末尾的数字/日期模式：-20260225020842、_20260225、-12345678 等
    t = re.sub(r'[-_]\d{8,}$', '', t)
    t = re.sub(r'[-_]\d+$', '', t)
    t = t.strip('-_ ')
    # 移除 PROTO-、UPG- 等前缀
    t = re.sub(r'^(PROTO|UPG|P\d+)[-_]?', '', t, flags=re.I)
    t = t.strip('-_ ')
    if not t:
        return title.strip()
    # 若不含功效/评价/检测，追加「功效评价」（无连字符）
    if not re.search(r'功效|评价|检测', t):
        t = f'{t}功效评价'
    return t[:500]


def migrate_forward(apps, schema_editor):
    """修正 code 为 C26+001+001 格式，优化 title"""
    Protocol = apps.get_model('protocol', 'Protocol')
    from collections import defaultdict

    protocols = list(
        Protocol.objects.filter(is_deleted=False).order_by('create_time')
    )
    if not protocols:
        return

    year_seqs = defaultdict(int)

    for p in protocols:
        year_suffix = p.create_time.strftime('%y') if p.create_time else '26'
        year_seqs[year_suffix] += 1
        seq = year_seqs[year_suffix]
        # 格式：C26 + 001(3位递增) + 001(最后3位固定保留)
        new_code = f'C{year_suffix}{seq:03d}001'
        new_title = _optimize_title_for_cosmetic(p.title)
        Protocol.objects.filter(pk=p.pk).update(code=new_code, title=new_title)


def migrate_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0009_migrate_protocol_code_to_cosmetic_format'),
    ]

    operations = [
        migrations.RunPython(migrate_forward, migrate_reverse),
    ]
