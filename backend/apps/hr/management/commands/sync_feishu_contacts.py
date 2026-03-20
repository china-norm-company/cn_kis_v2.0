"""
飞书通讯录同步管理命令

用法：python manage.py sync_feishu_contacts
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '从飞书通讯录同步部门和人员到系统'

    def handle(self, *args, **options):
        from apps.hr.services.sync_service import FeishuContactSyncService

        self.stdout.write('开始同步飞书通讯录...')
        try:
            stats = FeishuContactSyncService.sync_all()
            self.stdout.write(self.style.SUCCESS(
                f'同步完成: 部门 {stats["departments"]} 个, '
                f'新建员工 {stats["users_created"]} 人, '
                f'更新员工 {stats["users_updated"]} 人'
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'同步失败: {e}'))
