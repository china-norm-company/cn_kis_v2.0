"""
测试财务通知：解析接收人并尝试发送
用法：python manage.py test_finance_notification 宋小沫
"""
from django.core.management.base import BaseCommand

from apps.finance.api_notifications import (
    _get_notification_bot_credentials,
    _resolve_recipient_to_open_id,
    _send_feishu_text,
)


class Command(BaseCommand):
    help = "测试财务通知：解析接收人并尝试发送飞书消息"

    def add_arguments(self, parser):
        parser.add_argument("recipient", type=str, help="接收人姓名")
        parser.add_argument("--dry-run", action="store_true", help="仅解析 open_id，不实际发送")

    def handle(self, *args, **options):
        recipient = options["recipient"]
        dry_run = options.get("dry_run", False)

        app_id, app_secret = _get_notification_bot_credentials()
        self.stdout.write(f"凭证: app_id={'已配置' if app_id else '未配置'}, app_secret={'已配置' if app_secret else '未配置'}")

        open_id = _resolve_recipient_to_open_id(recipient, app_id, app_secret)
        if open_id:
            self.stdout.write(self.style.SUCCESS(f"解析成功: {recipient} -> {open_id[:30]}..."))
        else:
            self.stdout.write(self.style.ERROR(f"解析失败: 无法找到 {recipient} 的 open_id"))
            return

        if dry_run:
            self.stdout.write("dry-run 模式，跳过发送")
            return

        ok, error_code = _send_feishu_text(recipient, f"[测试] 财务通知测试消息，接收人: {recipient}")
        if ok:
            self.stdout.write(self.style.SUCCESS("飞书消息已发送"))
        else:
            self.stdout.write(self.style.ERROR(f"发送失败: {error_code}"))
