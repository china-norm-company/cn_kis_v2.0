"""
数据迁移：将 AccountWorkstationConfig.workstation 中的旧工作台 key
('admin', 'iam') 统一迁移为 'governance'

背景：V2.0 重构将鹿鸣·治理台（admin）与枢衡·权控台（iam）合并为
      唯一治理工作台 governance，此迁移处理历史配置数据的 key 替换。
"""
from django.db import migrations


def migrate_workstation_keys_to_governance(apps, schema_editor):
    AccountWorkstationConfig = apps.get_model('identity', 'AccountWorkstationConfig')

    # 将 'admin' 和 'iam' 的 workstation key 统一改为 'governance'
    for old_key in ('admin', 'iam'):
        for cfg in AccountWorkstationConfig.objects.filter(workstation=old_key):
            existing = AccountWorkstationConfig.objects.filter(
                account_id=cfg.account_id, workstation='governance'
            ).first()
            if existing:
                # 若已存在 governance 配置，删除旧 key 的冗余记录
                cfg.delete()
            else:
                cfg.workstation = 'governance'
                cfg.save(update_fields=['workstation'])


def reverse_migration(apps, schema_editor):
    # 迁移不可完全逆转（governance 下合并的 admin/iam 来源无法区分），
    # 逆向迁移仅做日志提示，不实际操作数据
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0008_add_ekuaibao_staff_fields'),
    ]

    operations = [
        migrations.RunPython(
            migrate_workstation_keys_to_governance,
            reverse_migration,
        ),
    ]
