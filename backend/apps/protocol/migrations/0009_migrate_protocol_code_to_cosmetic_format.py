# 知情管理：将 t_protocol 的 code 迁移为化妆品临床功效检测项目编号格式 C26001001
# 仅更新 t_protocol 表，不修改其他表
from django.db import migrations


def migrate_codes_forward(apps, schema_editor):
    """将现有协议的 code 更新为 C26001001 格式（C+年份后2位+6位序号）"""
    Protocol = apps.get_model('protocol', 'Protocol')
    from collections import defaultdict

    # 获取所有未删除协议，按 create_time 排序
    protocols = list(
        Protocol.objects.filter(is_deleted=False).order_by('create_time')
    )
    if not protocols:
        return

    # 按年份分组，同年内按 create_time 顺序分配序号
    year_seqs = defaultdict(int)

    for p in protocols:
        year_suffix = p.create_time.strftime('%y') if p.create_time else '26'
        year_seqs[year_suffix] += 1
        seq = year_seqs[year_suffix]
        new_code = f'C{year_suffix}{seq:06d}'
        Protocol.objects.filter(pk=p.pk).update(code=new_code)


def migrate_codes_reverse(apps, schema_editor):
    """回滚：无法恢复原 code，仅记录（实际不执行还原）"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0008_consent_display_order'),
    ]

    operations = [
        migrations.RunPython(migrate_codes_forward, migrate_codes_reverse),
    ]
