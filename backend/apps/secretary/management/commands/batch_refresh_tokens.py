"""
batch_refresh_tokens — 批量刷新飞书 user_access_token 并向过期账号推送重新授权消息

使用方式：
    # 刷新所有有 refresh_token 的账号，并向无 token/过期账号推送授权消息
    python manage.py batch_refresh_tokens

    # 只刷新，不推送
    python manage.py batch_refresh_tokens --no-notify

    # 只推送授权消息，不刷新
    python manage.py batch_refresh_tokens --notify-only

    # 预演
    python manage.py batch_refresh_tokens --dry-run
"""
import logging
import time

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '批量刷新飞书 token，向过期账号推送重新授权消息'

    def add_arguments(self, parser):
        parser.add_argument('--no-notify', action='store_true', help='不推送重新授权消息')
        parser.add_argument('--notify-only', action='store_true', help='只推送消息，不刷新 token')
        parser.add_argument('--dry-run', action='store_true', help='预演，不实际修改')
        parser.add_argument('--delay', type=float, default=0.3, help='账号间延迟（秒）')

    def handle(self, *args, **options):
        from apps.identity.models import Account
        from apps.secretary.models import FeishuUserToken
        from apps.secretary.feishu_fetcher import get_valid_user_token
        from libs.feishu_client import feishu_client
        from django.conf import settings

        no_notify = options['no_notify']
        notify_only = options['notify_only']
        dry_run = options['dry_run']
        delay = options['delay']

        now = timezone.now()
        stats = {
            'total': 0, 'already_valid': 0, 'refreshed': 0, 'refresh_failed': 0,
            'no_token': 0, 'expired_no_refresh': 0, 'notified': 0, 'errors': 0,
        }

        self.stdout.write('=' * 60)
        self.stdout.write('飞书 Token 批量刷新')
        self.stdout.write(f'dry_run={dry_run} no_notify={no_notify} notify_only={notify_only}')
        self.stdout.write('=' * 60)

        accounts = Account.objects.filter(
            is_deleted=False,
            feishu_open_id__isnull=False,
        ).exclude(feishu_open_id='').order_by('id')

        total = accounts.count()
        self.stdout.write(f'目标账号: {total} 个')

        for i, account in enumerate(accounts, 1):
            stats['total'] += 1
            token_record = FeishuUserToken.objects.filter(account_id=account.id).first()

            # 分类
            if not token_record or not token_record.access_token:
                stats['no_token'] += 1
                self.stdout.write(f'  [{i}/{total}] {account.display_name}: 无 token')
                if not no_notify and not dry_run:
                    self._send_reauth(account, feishu_client, settings, stats)
                continue

            # 检查 access_token 是否仍有效
            if token_record.token_expires_at and now < token_record.token_expires_at:
                stats['already_valid'] += 1
                self.stdout.write(
                    f'  [{i}/{total}] {account.display_name}: 有效 '
                    f'(到期: {token_record.token_expires_at.strftime("%m-%d %H:%M")})'
                )
                continue

            # access_token 已过期，尝试刷新
            if notify_only:
                if not token_record.refresh_token or (
                    token_record.refresh_expires_at and now >= token_record.refresh_expires_at
                ):
                    stats['expired_no_refresh'] += 1
                    if not no_notify and not dry_run:
                        self._send_reauth(account, feishu_client, settings, stats)
                continue

            if not token_record.refresh_token:
                stats['expired_no_refresh'] += 1
                self.stdout.write(
                    f'  [{i}/{total}] {account.display_name}: access_token 过期且无 refresh_token'
                )
                if not no_notify and not dry_run:
                    self._send_reauth(account, feishu_client, settings, stats)
                time.sleep(delay)
                continue

            if token_record.refresh_expires_at and now >= token_record.refresh_expires_at:
                stats['expired_no_refresh'] += 1
                self.stdout.write(
                    f'  [{i}/{total}] {account.display_name}: refresh_token 也已过期'
                )
                if not no_notify and not dry_run:
                    self._send_reauth(account, feishu_client, settings, stats)
                time.sleep(delay)
                continue

            # 有 refresh_token，刷新
            if not dry_run:
                try:
                    new_token = get_valid_user_token(account.id)
                    if new_token:
                        stats['refreshed'] += 1
                        token_record.refresh_from_db()
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'  [{i}/{total}] {account.display_name}: 刷新成功 '
                                f'(新到期: {token_record.token_expires_at.strftime("%m-%d %H:%M") if token_record.token_expires_at else "-"})'
                            )
                        )
                    else:
                        stats['refresh_failed'] += 1
                        self.stdout.write(
                            self.style.WARNING(
                                f'  [{i}/{total}] {account.display_name}: 刷新失败'
                            )
                        )
                        if not no_notify:
                            self._send_reauth(account, feishu_client, settings, stats)
                except Exception as e:
                    stats['errors'] += 1
                    logger.warning('刷新 token 异常 %s: %s', account.display_name, e)
            else:
                self.stdout.write(
                    f'  [{i}/{total}] {account.display_name}: [DRY-RUN] 将刷新 refresh_token'
                )
                stats['refreshed'] += 1

            time.sleep(delay)

        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('批量刷新完成')
        self.stdout.write('=' * 60)
        for k, v in stats.items():
            self.stdout.write(f'  {k:<22}: {v}')

    def _send_reauth(self, account, client, settings, stats):
        """推送飞书重新授权消息"""
        try:
            app_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '') or getattr(settings, 'FEISHU_APP_ID', '')
            redirect_base = getattr(settings, 'FEISHU_REDIRECT_BASE', 'http://118.196.64.48')
            auth_url = (
                f'https://open.feishu.cn/open-apis/authen/v1/authorize'
                f'?app_id={app_id}&redirect_uri={redirect_base}/login&response_type=code'
            )
            content = (
                f'{{"text": "您好 {account.display_name}，系统需要更新您的飞书数据授权以保障知识沉淀。'
                f'请点击链接完成一次授权（约 5 秒）：{auth_url} ，授权后数据将自动同步。"}}'
            )
            client.send_message(
                receive_id=account.feishu_open_id,
                msg_type='text',
                content=content,
                receive_id_type='open_id',
            )
            stats['notified'] += 1
            logger.info('已推送重新授权消息: %s', account.display_name)
        except Exception as e:
            logger.debug('推送授权消息失败 %s: %s', account.display_name, e)
