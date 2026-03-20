"""
逾期检测管理命令

用法: python manage.py detect_overdue
建议每日 cron 执行
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '检测逾期回款计划并发送通知'

    def handle(self, *args, **options):
        from apps.finance.services.payment_plan_service import detect_overdue_plans
        updated = detect_overdue_plans()
        self.stdout.write(self.style.SUCCESS(f'逾期检测完成: {len(updated)} 条计划标记为逾期'))
