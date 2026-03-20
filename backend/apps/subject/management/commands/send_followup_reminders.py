"""
发送待跟进提醒 — 将今日需跟进的报名记录通过飞书通知给招募人员

建议每日早上执行:
  python manage.py send_followup_reminders
"""
import logging
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('cn_kis.recruitment')


class Command(BaseCommand):
    help = '发送今日待跟进报名记录提醒'

    def handle(self, *args, **options):
        from apps.subject.models_recruitment import ContactRecord, SubjectRegistration
        today = timezone.now().date()

        due_contacts = ContactRecord.objects.filter(
            next_contact_date=today,
        ).select_related('registration').values_list('registration_id', flat=True).distinct()

        pending_regs = SubjectRegistration.objects.filter(
            status__in=['registered', 'confirmed'],
            contacted_at__isnull=True,
        ).values_list('id', flat=True)

        all_ids = set(due_contacts) | set(pending_regs)
        if not all_ids:
            self.stdout.write(self.style.SUCCESS('今日无待跟进记录'))
            return

        regs = SubjectRegistration.objects.filter(id__in=all_ids)
        self.stdout.write(f'发现 {regs.count()} 条待跟进记录')

        try:
            from libs.notification import _build_card, _safe_send
            import os
            chat_id = os.getenv('NOTIFICATION_CHAT_ID', '')
            if not chat_id:
                self.stdout.write(self.style.WARNING('NOTIFICATION_CHAT_ID 未配置'))
                return

            items_text = '\n'.join(
                f'• {r.name}({r.phone[-4:]}) - {r.registration_no}'
                for r in regs[:20]
            )
            card = _build_card(
                title=f'今日待跟进 ({regs.count()} 条)',
                color='blue',
                fields=[
                    {'name': '日期', 'value': str(today)},
                    {'name': '待跟进列表', 'value': items_text[:300]},
                ],
                note='CN KIS 招募管理 - 请及时联系受试者',
            )
            _safe_send(chat_id, 'interactive', card)
            self.stdout.write(self.style.SUCCESS('跟进提醒已发送'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'发送失败: {e}'))
