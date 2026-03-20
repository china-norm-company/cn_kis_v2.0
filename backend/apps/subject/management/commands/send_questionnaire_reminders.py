"""
问卷到期提醒定时任务

查询明日到期且未提交的问卷分配，向受试者发送微信订阅消息。
通过 cron 每日 9:00 执行：
  0 9 * * * python manage.py send_questionnaire_reminders
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = '发送问卷到期提醒（微信订阅消息）'

    def handle(self, *args, **options):
        from apps.subject.models_questionnaire import QuestionnaireAssignment
        from libs.wechat_notification import notify_questionnaire_due

        tomorrow = (timezone.now() + timedelta(days=1)).date()
        assignments = QuestionnaireAssignment.objects.filter(
            due_date=tomorrow,
            status__in=['pending', 'in_progress'],
        ).select_related('subject', 'subject__account', 'template')

        sent = 0
        failed = 0
        for assignment in assignments:
            try:
                if notify_questionnaire_due(assignment.subject, assignment):
                    sent += 1
                else:
                    failed += 1
            except Exception as e:
                self.stderr.write(f'发送失败 (subject={assignment.subject_id}): {e}')
                failed += 1

        self.stdout.write(
            self.style.SUCCESS(f'问卷提醒发送完成: 成功={sent}, 失败={failed}, 总计={sent + failed}')
        )
