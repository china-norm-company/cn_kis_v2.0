"""
列出飞书应用机器人所在群聊，并按名称子串解析 chat_id。

用法:
  conda activate kis
  cd backend && python manage.py feishu_list_bot_chats --match "CN_KIS_PLATFORM开发小组"
  python manage.py feishu_list_bot_chats --list-all
"""
from django.core.management.base import BaseCommand

from libs.feishu_client import feishu_client


class Command(BaseCommand):
    help = '分页拉取机器人所在群聊；--match 时输出匹配的 chat_id（用于 FEISHU_NOTIFICATION_CHAT_ID）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--match',
            type=str,
            default='',
            help='群名称子串（完整包含即视为匹配）',
        )
        parser.add_argument(
            '--list-all',
            action='store_true',
            help='打印全部群的 chat_id 与名称',
        )

    def handle(self, *args, **options):
        sub = (options.get('match') or '').strip()
        list_all = options.get('list_all')

        page_token = None
        all_items = []
        while True:
            data = feishu_client.list_bot_chats(page_size=50, page_token=page_token)
            all_items.extend(data.get('items', []))
            if not data.get('has_more'):
                break
            page_token = data.get('page_token')

        self.stdout.write(self.style.NOTICE(f'共 {len(all_items)} 个群（机器人可见）'))

        if list_all:
            for it in all_items:
                self.stdout.write(f"{it.get('chat_id', '')}\t{it.get('name', '')}")
            return

        if not sub:
            self.stdout.write(self.style.WARNING('请使用 --match 群名子串 或 --list-all'))
            return

        hits = [it for it in all_items if sub in (it.get('name') or '')]
        if not hits:
            self.stdout.write(self.style.ERROR(f'未找到名称包含「{sub}」的群'))
            return

        for it in hits:
            cid = it.get('chat_id', '')
            name = it.get('name', '')
            self.stdout.write(self.style.SUCCESS(f'FEISHU_NOTIFICATION_CHAT_ID={cid}'))
            self.stdout.write(f'  name: {name}')
