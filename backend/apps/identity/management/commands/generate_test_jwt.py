"""
管理命令：为自动化测试生成长期有效的 JWT Token

使用场景：
  - CI/CD 流水线自动获取测试 token（无需人工介入）
  - 在火山云/生产环境上生成可被测试脚本使用的 token

用法：
  python manage.py generate_test_jwt                         # 使用 admin 账号，默认 30 天有效
  python manage.py generate_test_jwt --username malimin      # 指定账号
  python manage.py generate_test_jwt --days 7                # 7 天有效期
  python manage.py generate_test_jwt --raw                   # 只输出 token 字符串（便于脚本捕获）
"""
import hashlib
import time
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

import jwt

from apps.identity.models import Account, SessionToken
from django.conf import settings


class Command(BaseCommand):
    help = '生成测试用 JWT Token（在目标服务器 DB 中创建有效 SessionToken 记录）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            type=str,
            default=None,
            help='账号 username（默认：最高权限的 admin 账号）',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='有效天数（默认：30 天）',
        )
        parser.add_argument(
            '--raw',
            action='store_true',
            help='只输出 token 字符串，不输出其他信息（适合脚本 $() 捕获）',
        )

    def handle(self, *args, **options):
        username = options['username']
        days = options['days']
        raw = options['raw']

        # 查找账号
        if username:
            try:
                account = Account.objects.get(username=username)
            except Account.DoesNotExist:
                raise CommandError(f'账号 "{username}" 不存在')
        else:
            # 优先找 admin role 的活跃账号（使用正向关系名 account_roles）
            account = (
                Account.objects
                .filter(
                    account_roles__role__name__in=['admin', 'super_admin'],
                    status='active',
                )
                .order_by('id')
                .first()
            )
            if not account:
                account = Account.objects.filter(status='active').order_by('id').first()
            if not account:
                raise CommandError('数据库中没有任何活跃账号，请先创建账号')

        # 获取角色列表
        from apps.identity.models import AccountRole
        role_names = list(
            AccountRole.objects.filter(account_id=account.id)
            .select_related('role')
            .values_list('role__name', flat=True)
        )

        # 自定义有效期（不受 JWT_EXPIRATION_HOURS 限制）
        expire_seconds = days * 24 * 3600
        exp = int(time.time()) + expire_seconds

        payload = {
            'user_id': account.id,
            'username': account.username,
            'account_type': account.account_type,
            'roles': role_names,
            'exp': exp,
            'iat': int(time.time()),
            '_test': True,  # 标记为测试 token
        }
        token = jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')

        # 在 DB 中注册 SessionToken，使其通过 verify_jwt_token 的 DB 校验
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        expires_at = timezone.now() + timedelta(days=days)

        # 同一账号的测试 token 幂等：device_info='test-jwt-automation'
        obj, created = SessionToken.objects.update_or_create(
            account=account,
            device_info='test-jwt-automation',
            defaults={
                'token_hash': token_hash,
                'ip_address': '127.0.0.1',
                'expires_at': expires_at,
                'is_revoked': False,
            },
        )

        if raw:
            # 纯 token 输出，方便 shell 捕获：
            # TOKEN=$(python manage.py generate_test_jwt --raw)
            self.stdout.write(token)
        else:
            self.stdout.write(self.style.SUCCESS(
                f'\n✅ 测试 JWT 生成成功'
                f'\n   账号: {account.username} (id={account.id})'
                f'\n   角色: {", ".join(role_names) or "无"}'
                f'\n   有效期: {days} 天（至 {expires_at.strftime("%Y-%m-%d %H:%M")} UTC）'
                f'\n   SessionToken: {"新建" if created else "更新"} (hash={token_hash[:16]}…)'
                f'\n\nToken:\n{token}\n'
            ))
            self.stdout.write(
                '在测试脚本中使用：\n'
                f'  LIVE_TOKEN="{token}" python3 ops/scripts/governance_migration_api_test.py\n'
            )
