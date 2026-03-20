"""
财务每日定时任务命令

用法: python manage.py run_finance_daily
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '执行财务模块每日定时任务（逾期检测、预算预警、到期提醒）'

    def handle(self, *args, **options):
        from apps.finance.tasks.daily_tasks import run_all_daily_tasks
        run_all_daily_tasks()
        self.stdout.write(self.style.SUCCESS('财务每日任务执行完成'))
