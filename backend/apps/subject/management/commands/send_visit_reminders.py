"""
访视提醒定时任务

查询明日所有确认状态的预约，向受试者发送微信订阅消息。
通过 cron 每日 18:00 执行：
  0 18 * * * python manage.py send_visit_reminders
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = '发送明日访视提醒（微信订阅消息）'

    def handle(self, *args, **options):
        from apps.subject.models_execution import SubjectAppointment
        from libs.wechat_notification import notify_visit_reminder

        tomorrow = (timezone.now() + timedelta(days=1)).date()
        appointments = SubjectAppointment.objects.filter(
            appointment_date=tomorrow,
            status='confirmed',
        ).select_related('subject', 'subject__account')

        sent = 0
        failed = 0
        for appt in appointments:
            try:
                if notify_visit_reminder(appt.subject, appt):
                    sent += 1
                else:
                    failed += 1
            except Exception as e:
                self.stderr.write(f'发送失败 (subject={appt.subject_id}): {e}')
                failed += 1

        self.stdout.write(
            self.style.SUCCESS(f'访视提醒发送完成: 成功={sent}, 失败={failed}, 总计={sent + failed}')
        )
