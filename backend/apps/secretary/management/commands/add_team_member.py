"""
Django 管理命令：将新成员加入 CN_KIS_PLATFORM 飞书开发小组
==========================================================
用法：
    python manage.py add_team_member --feishu-email user@example.com [--name 姓名] [--workstation quality]
    python manage.py add_team_member --feishu-id ou_xxxxxxxxxxxx [--name 姓名]

功能：
    1. 通过邮箱/open_id 查找飞书用户
    2. 邀请加入开发小组群聊（FEISHU_DEV_GROUP_CHAT_ID）
    3. 添加知识库读写权限（FEISHU_WIKI_SPACE_ID）
    4. 发送私信《新人入驻手册》
    5. 群内广播欢迎消息

依赖环境变量（在 backend/.env 或部署配置中设置）：
    FEISHU_DEV_GROUP_CHAT_ID   开发小组群聊 ID
    FEISHU_WIKI_SPACE_ID       知识库 space_id（可选）
    GITHUB_REPO_URL            GitHub 仓库地址（可选，用于欢迎消息中的链接）
"""
import json
import logging
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

logger = logging.getLogger(__name__)

WELCOME_PRIVATE_MSG = """\
🎉 欢迎加入开发团队！

你已被加入开发小组飞书群，以下是快速上手指引：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 第一步：克隆并初始化项目（只需一次）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 克隆仓库：
   git clone {repo_url}

2. 初始化环境：
   ./ops/scripts/dev-task.sh bootstrap

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 日常工作流程
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
每天开工：  ./ops/scripts/dev-task.sh sync-task
开始任务：  ./ops/scripts/dev-task.sh start-task <工作台> <issue编号> <简述>
推送代码：  ./ops/scripts/dev-task.sh push-task
查看状态：  ./ops/scripts/dev-task.sh status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 完整文档
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{doc_url}

有任何问题，随时在群里提问，或直接在 Cursor 告诉 AI！
"""


class Command(BaseCommand):
    help = '将新成员加入飞书开发小组并发送入驻手册'

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--feishu-email', help='成员飞书注册邮箱')
        group.add_argument('--feishu-id', help='成员飞书 open_id（ou_xxx...）')
        parser.add_argument('--name', default='', help='成员姓名（用于群内欢迎公告）')
        parser.add_argument('--workstation', default='', help='负责的工作台（用于群内公告）')
        parser.add_argument('--dry-run', action='store_true', help='仅查询用户，不实际执行操作')

    def handle(self, *args, **options):
        # ── 读取配置（从 Django settings / 环境变量，不硬编码）─────────────────
        dev_group_chat_id = getattr(settings, 'FEISHU_DEV_GROUP_CHAT_ID', '')
        if not dev_group_chat_id:
            raise CommandError(
                '未配置 FEISHU_DEV_GROUP_CHAT_ID，请在 backend/.env 中设置'
            )

        repo_url = getattr(settings, 'GITHUB_REPO_URL', '')
        onboarding_doc = (
            f'{repo_url}/blob/main/docs/CURSOR_COLLABORATION_ONBOARDING.md'
            if repo_url else '请查阅知识库中的新人入驻手册'
        )

        try:
            from libs.feishu_client import FeishuClient
        except ImportError:
            raise CommandError('无法导入 FeishuClient，请确认在 backend/ 目录下运行')

        client = FeishuClient()
        token = client.get_tenant_token()
        if not token:
            raise CommandError('无法获取飞书 tenant_access_token，请检查 FEISHU_APP_ID/FEISHU_APP_SECRET 配置')

        # ── Step 1：获取用户 open_id ──────────────────────────────────────────
        open_id = options.get('feishu_id')
        name = options.get('name', '')

        if not open_id:
            email = options['feishu_email']
            self.stdout.write(f'通过邮箱查找用户：{email}')
            import httpx
            resp = httpx.post(
                'https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id',
                headers={'Authorization': f'Bearer {token}'},
                json={'emails': [email], 'user_id_type': 'open_id'},
                timeout=10,
            ).json()
            if resp.get('code') != 0:
                raise CommandError(f'查询用户失败：{resp.get("msg")}')
            user_list = resp.get('data', {}).get('user_list', [])
            if not user_list or not user_list[0].get('user_id'):
                raise CommandError(f'未找到邮箱 {email} 对应的飞书用户')
            open_id = user_list[0]['user_id']
            self.stdout.write(self.style.SUCCESS(f'✅ 找到用户 open_id：{open_id}'))

        if options['dry_run']:
            self.stdout.write(f'[dry-run] 找到用户 {open_id}，不执行实际操作')
            return

        # ── Step 2：拉入群聊 ──────────────────────────────────────────────────
        self.stdout.write('正在拉入群聊...')
        resp = client.add_chat_members(dev_group_chat_id, [open_id])
        if resp.get('code') == 0:
            self.stdout.write(self.style.SUCCESS('✅ 已加入开发小组群聊'))
        elif resp.get('code') == 230013:
            self.stdout.write(self.style.WARNING('⚠️  用户已在群中'))
        else:
            self.stdout.write(self.style.ERROR(f'❌ 加群失败：{resp.get("msg")}'))

        # ── Step 3：知识库权限（如已配置 FEISHU_WIKI_SPACE_ID）─────────────────
        wiki_space_id = getattr(settings, 'FEISHU_WIKI_SPACE_ID', '')
        if wiki_space_id:
            self.stdout.write('正在开通知识库权限...')
            resp = client.add_wiki_space_member(
                wiki_space_id, open_id,
                member_type='openid', member_role='editor',
            )
            if resp.get('code') == 0:
                self.stdout.write(self.style.SUCCESS('✅ 知识库编辑权限已开通'))
            else:
                self.stdout.write(self.style.WARNING(f'⚠️  知识库权限设置失败：{resp.get("msg")}'))
        else:
            self.stdout.write(self.style.WARNING('⚠️  未配置 FEISHU_WIKI_SPACE_ID，跳过知识库权限'))

        # ── Step 4：发送私信入驻手册 ───────────────────────────────────────────
        self.stdout.write('发送入驻手册私信...')
        msg_text = WELCOME_PRIVATE_MSG.format(
            repo_url=repo_url or 'git@github.com:YOUR_ORG/cn_kis_v2.0.git',
            doc_url=onboarding_doc,
        )
        resp = client.send_message(
            receive_id=open_id,
            msg_type='text',
            content=f'{{"text": {json.dumps(msg_text, ensure_ascii=False)}}}',
            receive_id_type='open_id',
        )
        if resp.get('code') == 0:
            self.stdout.write(self.style.SUCCESS('✅ 入驻手册已发送'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠️  私信发送失败（用户需先向机器人发消息）：{resp.get("msg")}'))

        # ── Step 5：群内广播欢迎 ───────────────────────────────────────────────
        ws_info = f'，负责 **{options["workstation"]}** 工作台' if options.get('workstation') else ''
        display_name = name or open_id
        welcome_text = f'🎉 欢迎 **{display_name}** 加入开发团队{ws_info}！\n请查看私信中的入驻手册，有问题随时在群里问。'
        resp = client.send_text_to_chat(dev_group_chat_id, welcome_text)
        if resp.get('code') == 0:
            self.stdout.write(self.style.SUCCESS('✅ 群内欢迎公告已发送'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠️  群公告发送失败：{resp.get("msg")}'))

        self.stdout.write('\n' + self.style.SUCCESS(
            f'✅ 成员入驻完成：{display_name}（{open_id}）'
        ))
