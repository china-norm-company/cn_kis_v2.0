"""
init_ekb_feishu_session — 初始化易快报飞书版 web session token

用法：
    # 首次认证（需要飞书 OAuth code）
    python manage.py init_ekb_feishu_session --code <飞书OAuth授权码>

    # 刷新现有 token（不需要 code）
    python manage.py init_ekb_feishu_session --refresh

    # 查看当前 token 状态
    python manage.py init_ekb_feishu_session --status

如何获取 OAuth code：
    1. 浏览器打开：
       https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_a4a4d97c3bbc900d&redirect_uri=http%3A%2F%2F118.196.64.48%2Fekb_callback&response_type=code&state=ekb_auth
    2. 登录飞书完成授权
    3. 页面会显示 ebridge 认证结果，同时 token 自动持久化到 t_ekb_web_session

注意：OAuth code 一次性有效，每次需要重新授权。
      Token 持久化后刷新（--refresh）不需要再次授权，最长 7 天刷新一次。
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.ekuaibao_integration.ekb_client import EkbFeishuClient, EkbAPIError


class Command(BaseCommand):
    help = '初始化或刷新易快报飞书版 web session token'

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--code', type=str, help='飞书 OAuth 授权码（首次认证）')
        group.add_argument('--refresh', action='store_true', help='刷新现有 token')
        group.add_argument('--status', action='store_true', help='查看 token 状态')

    def handle(self, *args, **options):
        if options['status']:
            self._show_status()
        elif options['refresh']:
            self._refresh_token()
        else:
            self._init_from_code(options['code'])

    def _show_status(self):
        from apps.ekuaibao_integration.models import EkbWebSession
        try:
            obj = EkbWebSession.objects.get(corp_id=EkbFeishuClient.CORP_ID)
            now = timezone.now()
            expired = obj.token_expires_at and obj.token_expires_at < now
            status = '已过期 ❌' if expired else '有效 ✅'
            self.stdout.write(f'状态: {status}')
            self.stdout.write(f'员工: {obj.feishu_staff_name}')
            self.stdout.write(f'Token: {obj.web_token[:20]}...')
            self.stdout.write(f'过期时间: {obj.token_expires_at}')
            self.stdout.write(f'更新时间: {obj.updated_at}')
        except EkbWebSession.DoesNotExist:
            self.stdout.write(self.style.WARNING('未找到 token，请先运行 --code 初始化'))

    def _refresh_token(self):
        from apps.ekuaibao_integration.models import EkbWebSession
        try:
            obj = EkbWebSession.objects.get(corp_id=EkbFeishuClient.CORP_ID)
        except EkbWebSession.DoesNotExist:
            self.stderr.write(self.style.ERROR('未找到 token，请先用 --code 初始化'))
            return

        client = EkbFeishuClient()
        new_token = client._refresh_token(obj.web_token)
        if new_token:
            EkbWebSession.save_token(
                corp_id=EkbFeishuClient.CORP_ID,
                token=new_token,
                open_id=obj.feishu_open_id,
                staff_name=obj.feishu_staff_name,
            )
            self.stdout.write(self.style.SUCCESS(f'Token 刷新成功，员工: {obj.feishu_staff_name}'))
        else:
            self.stderr.write(self.style.ERROR('Token 刷新失败，请用 --code 重新初始化'))

    def _init_from_code(self, code: str):
        self.stdout.write('使用 OAuth code 初始化...')
        try:
            client = EkbFeishuClient.init_from_oauth_code(code)
            staff = client.get_staff_me()
            name = staff.get('name', '未知')
            self.stdout.write(self.style.SUCCESS(
                f'✅ 初始化成功！员工: {name}，token 已持久化到 t_ekb_web_session'
            ))
            # 快速验证
            self.stdout.write('验证数据访问...')
            data = client.search_flows(start=0, count=1)
            total = data.get('count', 0)
            self.stdout.write(self.style.SUCCESS(
                f'✅ 数据访问正常，总记录数: {total:,}'
            ))
        except EkbAPIError as e:
            self.stderr.write(self.style.ERROR(f'初始化失败: {e}'))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'未预期错误: {e}'))
