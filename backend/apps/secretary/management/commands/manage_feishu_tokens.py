"""
manage_feishu_tokens — 飞书用户 Token 完整生命周期管理命令

子命令：
  inspect   查看 token 状态总览或指定用户详情
  refresh   主动刷新 token（单用户或全部可刷新用户）
  revoke    作废指定用户的 token
  cleanup   清理过期 / 多余记录
  sync      批量重新计算所有 token 的 status 字段

使用示例：
  # 查看所有 token 状态汇总
  python manage.py manage_feishu_tokens inspect

  # 查看指定用户（按姓名）
  python manage.py manage_feishu_tokens inspect --name 张三

  # 刷新所有 expiring/access_expired token
  python manage.py manage_feishu_tokens refresh

  # 刷新指定用户 token
  python manage.py manage_feishu_tokens refresh --name 张三

  # 作废指定用户 token
  python manage.py manage_feishu_tokens revoke --name 张三 --reason admin

  # 清理 revoked 且超过 90 天的记录
  python manage.py manage_feishu_tokens cleanup --days 90

  # 批量同步所有 status 字段（数据修复）
  python manage.py manage_feishu_tokens sync
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '飞书用户 Token 生命周期管理（inspect/refresh/revoke/cleanup/sync）'

    def add_arguments(self, parser):
        parser.add_argument('action', choices=['inspect', 'refresh', 'revoke', 'cleanup', 'sync'],
                            help='操作类型')
        parser.add_argument('--name', type=str, default='',
                            help='指定用户显示名（inspect/refresh/revoke 用）')
        parser.add_argument('--account-id', type=int, default=0,
                            help='指定账号 ID')
        parser.add_argument('--status', type=str, default='',
                            help='按 status 过滤（inspect 用）：active/expiring/access_expired/refresh_expired/revoked/invalid')
        parser.add_argument('--reason', type=str, default='admin',
                            help='作废原因（revoke 用，默认 admin）')
        parser.add_argument('--days', type=int, default=90,
                            help='cleanup 保留天数（默认 90）')
        parser.add_argument('--force', action='store_true',
                            help='跳过确认提示（revoke/cleanup 用）')
        parser.add_argument('--dry-run', action='store_true',
                            help='预演，不实际执行')

    def handle(self, *args, **options):
        action = options['action']
        if action == 'inspect':
            self._inspect(options)
        elif action == 'refresh':
            self._refresh(options)
        elif action == 'revoke':
            self._revoke(options)
        elif action == 'cleanup':
            self._cleanup(options)
        elif action == 'sync':
            self._sync(options)

    # ── inspect ───────────────────────────────────────────────────────────────

    def _inspect(self, options):
        from apps.secretary.models import FeishuUserToken
        from apps.identity.models import Account

        name_filter = options['name']
        account_id_filter = options['account_id']
        status_filter = options['status']

        qs = FeishuUserToken.objects.all()
        if name_filter:
            account_ids = Account.objects.filter(
                display_name__icontains=name_filter
            ).values_list('id', flat=True)
            qs = qs.filter(account_id__in=account_ids)
        if account_id_filter:
            qs = qs.filter(account_id=account_id_filter)
        if status_filter:
            qs = qs.filter(status=status_filter)

        if name_filter or account_id_filter:
            # 详情模式
            self._inspect_detail(qs)
        else:
            # 汇总模式
            self._inspect_summary(qs)

    def _inspect_summary(self, qs):
        from django.db.models import Count, Avg, Max, Min
        from apps.secretary.models import FeishuUserToken

        self.stdout.write('\n' + '=' * 80)
        self.stdout.write('飞书 Token 健康状态汇总')
        self.stdout.write('=' * 80)

        rows = qs.values('status').annotate(
            cnt=Count('id'),
            avg_refresh=Avg('refresh_count'),
            max_last_used=Max('last_used_at'),
            min_refresh_exp=Min('refresh_expires_at'),
            max_failures=Max('consecutive_refresh_failures'),
        ).order_by('-cnt')

        header = f"{'状态':<20} {'数量':>6} {'均刷新次数':>10} {'最近使用':>18} {'最早到期':>18} {'最多连失败':>10}"
        self.stdout.write(header)
        self.stdout.write('-' * 80)
        for row in rows:
            last_used = row['max_last_used'].strftime('%m-%d %H:%M') if row['max_last_used'] else '-'
            min_exp = row['min_refresh_exp'].strftime('%m-%d %H:%M') if row['min_refresh_exp'] else '-'
            avg_ref = f"{float(row['avg_refresh'] or 0):.1f}"
            status_display = dict(FeishuUserToken.STATUS_CHOICES).get(row['status'], row['status'])
            line = (
                f"{row['status']:<20} {row['cnt']:>6} {avg_ref:>10} "
                f"{last_used:>18} {min_exp:>18} {row['max_failures']:>10}"
            )
            if row['status'] == FeishuUserToken.STATUS_ACTIVE:
                self.stdout.write(self.style.SUCCESS(line))
            elif row['status'] == FeishuUserToken.STATUS_EXPIRING:
                self.stdout.write(self.style.WARNING(line))
            elif row['status'] in (FeishuUserToken.STATUS_REFRESH_EXPIRED,
                                   FeishuUserToken.STATUS_INVALID,
                                   FeishuUserToken.STATUS_REVOKED):
                self.stdout.write(self.style.ERROR(line))
            else:
                self.stdout.write(line)

        self.stdout.write('=' * 80)
        total = qs.count()
        active = qs.filter(status=FeishuUserToken.STATUS_ACTIVE).count()
        usable = qs.filter(
            status__in=[FeishuUserToken.STATUS_ACTIVE, FeishuUserToken.STATUS_EXPIRING]
        ).count()
        self.stdout.write(f'  总计: {total}  |  可用: {usable}  |  健康: {active}')

        # 即将过期的用户列表
        from django.utils import timezone
        expiring = qs.filter(
            refresh_expires_at__gt=timezone.now(),
            refresh_expires_at__lt=timezone.now() + timedelta(days=14),
        ).exclude(status=FeishuUserToken.STATUS_REVOKED)
        if expiring.exists():
            self.stdout.write(self.style.WARNING(f'\n即将到期（14天内）: {expiring.count()} 个'))
            for tr in expiring.order_by('refresh_expires_at')[:10]:
                days_left = tr.refresh_token_remaining_days
                acct = self._get_account_name(tr.account_id)
                self.stdout.write(
                    self.style.WARNING(f'  {acct:<20} refresh 剩余 {days_left:.1f} 天  到期: {tr.refresh_expires_at.strftime("%m-%d %H:%M")}')
                )

        # 需要 reauth 的用户
        needs_reauth = qs.filter(requires_reauth=True).exclude(status=FeishuUserToken.STATUS_REVOKED)
        if needs_reauth.exists():
            self.stdout.write(self.style.ERROR(f'\n需要重新登录授权: {needs_reauth.count()} 人'))
            for tr in needs_reauth[:20]:
                acct = self._get_account_name(tr.account_id)
                self.stdout.write(self.style.ERROR(f'  {acct:<20} status={tr.status} 失败次数={tr.consecutive_refresh_failures}'))

        self.stdout.write('')

    def _inspect_detail(self, qs):
        now = timezone.now()
        self.stdout.write('\n' + '=' * 80)
        for tr in qs.order_by('account_id'):
            acct = self._get_account_name(tr.account_id)
            self.stdout.write(f'\n用户: {acct} (account_id={tr.account_id})')
            self.stdout.write(f'  open_id:           {tr.open_id}')
            self.stdout.write(f'  status:            {tr.status}  (computed: {tr.compute_status()})')
            self.stdout.write(f'  requires_reauth:   {tr.requires_reauth}')
            self.stdout.write(f'  issuer_app_id:     {tr.issuer_app_id or "-"}')
            self.stdout.write('')
            self.stdout.write(f'  [Access Token]')
            self.stdout.write(f'  token_expires_at:  {self._fmt_dt(tr.token_expires_at)}')
            remaining_sec = tr.access_token_remaining_seconds
            if remaining_sec > 0:
                self.stdout.write(self.style.SUCCESS(f'  剩余:              {remaining_sec // 60} 分钟'))
            else:
                self.stdout.write(self.style.ERROR('  剩余:              已过期'))
            self.stdout.write('')
            self.stdout.write(f'  [Refresh Token]')
            self.stdout.write(f'  refresh_expires_at:{self._fmt_dt(tr.refresh_expires_at)}')
            remaining_days = tr.refresh_token_remaining_days
            if remaining_days > 7:
                self.stdout.write(self.style.SUCCESS(f'  剩余:              {remaining_days:.1f} 天'))
            elif remaining_days > 0:
                self.stdout.write(self.style.WARNING(f'  剩余:              {remaining_days:.1f} 天（即将到期）'))
            else:
                self.stdout.write(self.style.ERROR('  剩余:              已过期'))
            self.stdout.write('')
            self.stdout.write(f'  [时间线]')
            self.stdout.write(f'  首次授权:          {self._fmt_dt(tr.first_authorized_at)}')
            self.stdout.write(f'  最近刷新成功:      {self._fmt_dt(tr.last_refreshed_at)}')
            self.stdout.write(f'  最近使用:          {self._fmt_dt(tr.last_used_at)}')
            self.stdout.write(f'  最近刷新失败:      {self._fmt_dt(tr.last_refresh_failed_at)}')
            self.stdout.write(f'  首次入库:          {self._fmt_dt(tr.created_at)}')
            self.stdout.write('')
            self.stdout.write(f'  [统计]')
            self.stdout.write(f'  累计刷新次数:      {tr.refresh_count}')
            self.stdout.write(f'  连续刷新失败:      {tr.consecutive_refresh_failures}')
            if tr.last_refresh_error:
                self.stdout.write(self.style.ERROR(f'  最近错误:          {tr.last_refresh_error}'))
            if tr.last_error_code:
                self.stdout.write(self.style.ERROR(f'  最近错误码:        {tr.last_error_code}'))
            if tr.revoked_at:
                self.stdout.write(self.style.ERROR(
                    f'  作废时间:          {self._fmt_dt(tr.revoked_at)} 原因: {tr.revoked_reason}'
                ))
        self.stdout.write('=' * 80 + '\n')

    # ── refresh ───────────────────────────────────────────────────────────────

    def _refresh(self, options):
        from apps.secretary.models import FeishuUserToken
        from apps.identity.models import Account
        from apps.secretary.feishu_fetcher import get_valid_user_token

        name_filter = options['name']
        account_id_filter = options['account_id']
        dry_run = options['dry_run']

        qs = FeishuUserToken.objects.filter(
            status__in=[
                FeishuUserToken.STATUS_ACTIVE,
                FeishuUserToken.STATUS_EXPIRING,
                FeishuUserToken.STATUS_ACCESS_EXPIRED,
            ]
        )
        if name_filter:
            account_ids = Account.objects.filter(
                display_name__icontains=name_filter
            ).values_list('id', flat=True)
            qs = qs.filter(account_id__in=account_ids)
        if account_id_filter:
            qs = qs.filter(account_id=account_id_filter)

        tokens = list(qs.order_by('account_id'))
        self.stdout.write(f'待刷新 token: {len(tokens)} 个  dry_run={dry_run}')

        ok, failed = 0, 0
        for tr in tokens:
            acct = self._get_account_name(tr.account_id)
            if dry_run:
                self.stdout.write(f'  [DRY] 将刷新: {acct} (status={tr.status})')
                continue
            token = get_valid_user_token(tr.account_id)
            if token:
                ok += 1
                tr.refresh_from_db()
                self.stdout.write(self.style.SUCCESS(
                    f'  ✓ {acct:<20} 刷新成功  刷新次数={tr.refresh_count}  '
                    f'refresh剩余={tr.refresh_token_remaining_days:.1f}天'
                ))
            else:
                failed += 1
                tr.refresh_from_db()
                self.stdout.write(self.style.ERROR(
                    f'  ✗ {acct:<20} 刷新失败  status={tr.status}  '
                    f'连续失败={tr.consecutive_refresh_failures}'
                ))

        if not dry_run:
            self.stdout.write(f'\n完成: 成功={ok} 失败={failed}')

    # ── revoke ────────────────────────────────────────────────────────────────

    def _revoke(self, options):
        from apps.secretary.models import FeishuUserToken
        from apps.identity.models import Account

        name_filter = options['name']
        account_id_filter = options['account_id']
        reason = options['reason']
        force = options['force']
        dry_run = options['dry_run']

        if not name_filter and not account_id_filter:
            self.stdout.write(self.style.ERROR('revoke 必须指定 --name 或 --account-id'))
            return

        qs = FeishuUserToken.objects.all()
        if name_filter:
            account_ids = Account.objects.filter(
                display_name__icontains=name_filter
            ).values_list('id', flat=True)
            qs = qs.filter(account_id__in=account_ids)
        if account_id_filter:
            qs = qs.filter(account_id=account_id_filter)
        qs = qs.exclude(status=FeishuUserToken.STATUS_REVOKED)

        tokens = list(qs)
        if not tokens:
            self.stdout.write('未找到可作废的 token')
            return

        for tr in tokens:
            acct = self._get_account_name(tr.account_id)
            self.stdout.write(f'  将作废: {acct} (account_id={tr.account_id}, status={tr.status})')

        if dry_run:
            self.stdout.write(f'[DRY-RUN] 共 {len(tokens)} 个 token 将被作废（未执行）')
            return

        if not force:
            confirm = input(f'确认作废以上 {len(tokens)} 个 token？(yes/no): ')
            if confirm.lower() != 'yes':
                self.stdout.write('已取消')
                return

        for tr in tokens:
            tr.revoke(reason=reason)
            acct = self._get_account_name(tr.account_id)
            self.stdout.write(self.style.WARNING(f'  已作废: {acct} 原因={reason}'))

        self.stdout.write(self.style.WARNING(f'\n已作废 {len(tokens)} 个 token'))

    # ── cleanup ───────────────────────────────────────────────────────────────

    def _cleanup(self, options):
        from apps.secretary.models import FeishuUserToken
        days = options['days']
        force = options['force']
        dry_run = options['dry_run']
        cutoff = timezone.now() - timedelta(days=days)

        # 可清理：revoked 且作废时间超过 N 天
        revoked_old = FeishuUserToken.objects.filter(
            status=FeishuUserToken.STATUS_REVOKED,
            revoked_at__lt=cutoff,
        )
        # 可清理：refresh_expired 且 refresh_expires_at 超过 N 天
        expired_old = FeishuUserToken.objects.filter(
            status=FeishuUserToken.STATUS_REFRESH_EXPIRED,
            refresh_expires_at__lt=cutoff,
        )

        total_revoked = revoked_old.count()
        total_expired = expired_old.count()

        self.stdout.write(f'可清理记录（{days} 天前）:')
        self.stdout.write(f'  revoked 超过 {days} 天: {total_revoked} 条')
        self.stdout.write(f'  refresh_expired 超过 {days} 天: {total_expired} 条')
        self.stdout.write(f'  共: {total_revoked + total_expired} 条')

        if dry_run:
            self.stdout.write('[DRY-RUN] 未执行删除')
            return

        if total_revoked + total_expired == 0:
            self.stdout.write('无需清理')
            return

        if not force:
            confirm = input(f'确认删除 {total_revoked + total_expired} 条记录？(yes/no): ')
            if confirm.lower() != 'yes':
                self.stdout.write('已取消')
                return

        deleted_revoked = revoked_old.delete()[0]
        deleted_expired = expired_old.delete()[0]
        self.stdout.write(
            self.style.SUCCESS(f'清理完成: revoked={deleted_revoked} expired={deleted_expired}')
        )

    # ── sync ──────────────────────────────────────────────────────────────────

    def _sync(self, options):
        from apps.secretary.models import FeishuUserToken
        dry_run = options['dry_run']
        all_tokens = list(FeishuUserToken.objects.all())
        changed = 0
        for tr in all_tokens:
            computed = tr.compute_status()
            if computed != tr.status and tr.status not in (
                FeishuUserToken.STATUS_REVOKED, FeishuUserToken.STATUS_INVALID
            ):
                if not dry_run:
                    tr.status = computed
                    tr.save(update_fields=['status', 'updated_at'])
                changed += 1
                acct = self._get_account_name(tr.account_id)
                self.stdout.write(f'  {acct:<20} {tr.status} → {computed}')

        self.stdout.write(
            self.style.SUCCESS(f'\n同步完成: 共 {len(all_tokens)} 条，状态变更 {changed} 条')
        )

    # ── 工具方法 ──────────────────────────────────────────────────────────────

    def _get_account_name(self, account_id: int) -> str:
        try:
            from apps.identity.models import Account
            a = Account.objects.filter(id=account_id).values('display_name').first()
            return a['display_name'] if a else str(account_id)
        except Exception:
            return str(account_id)

    @staticmethod
    def _fmt_dt(dt) -> str:
        if not dt:
            return '-'
        return dt.strftime('%Y-%m-%d %H:%M:%S %Z')
