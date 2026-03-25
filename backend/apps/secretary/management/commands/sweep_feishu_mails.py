"""
sweep_feishu_mails：遍历所有有有效 FeishuUserToken 的账号，重新触发飞书邮件采集。

用于：
  - 全量补采（初始部署后扩大覆盖率）
  - 审计目标客户邮件（如资生堂/Shiseido）
  - 修复 feishu_fetcher 后重新验证采集链路

用法：
  python manage.py sweep_feishu_mails
  python manage.py sweep_feishu_mails --limit 50        # 每账号最多拉取50封
  python manage.py sweep_feishu_mails --account-id 1    # 仅指定账号
  python manage.py sweep_feishu_mails --reprocess       # 重新处理已采集邮件的 ingest
  python manage.py sweep_feishu_mails --dry-run         # 仅统计，不实际采集
"""
import time

from django.core.management.base import BaseCommand

from apps.identity.models import Account
from apps.secretary.models import FeishuUserToken, MailSignalEvent, PersonalContext


class Command(BaseCommand):
    help = '遍历所有有效飞书 Token 的账号，批量触发邮件采集与信号处理'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=50,
                            help='每个账号最多拉取邮件数（默认 50）')
        parser.add_argument('--account-id', type=int, default=None,
                            help='仅处理指定账号 ID')
        parser.add_argument('--reprocess', action='store_true',
                            help='仅重新跑 ingest（不重新拉取飞书 API，用于修复分类逻辑后重处理）')
        parser.add_argument('--dry-run', action='store_true',
                            help='仅统计，不实际采集')
        parser.add_argument('--delay', type=float, default=1.0,
                            help='账号间延迟秒数（防止飞书 API 限流，默认 1s）')

    def handle(self, *args, **options):
        limit = options['limit']
        account_id = options['account_id']
        reprocess = options['reprocess']
        dry_run = options['dry_run']
        delay = options['delay']

        # ── 收集目标账号 ────────────────────────────────────────────────────
        if account_id:
            tokens = FeishuUserToken.objects.filter(account_id=account_id)
        else:
            tokens = FeishuUserToken.objects.all()

        account_ids = list(tokens.values_list('account_id', flat=True).distinct())
        accounts = Account.objects.filter(
            id__in=account_ids, is_deleted=False
        ).exclude(feishu_open_id='')

        self.stdout.write(f'\n{"="*60}')
        self.stdout.write('  飞书邮件全量采集（sweep_feishu_mails）')
        self.stdout.write(f'  目标账号数: {accounts.count()}')
        self.stdout.write(f'  每账号 limit: {limit}  reprocess: {reprocess}  dry_run: {dry_run}')
        self.stdout.write(f'{"="*60}\n')

        if dry_run:
            self._show_dry_run_stats(accounts)
            return

        if reprocess:
            self._reprocess_existing(accounts)
            return

        # ── 全量采集 ────────────────────────────────────────────────────────
        import os
        os.environ['FEISHU_MAIL_FETCH_LIMIT'] = str(limit)

        total_fetched = 0
        total_signals = 0
        failed = []

        for i, account in enumerate(accounts, 1):
            self.stdout.write(
                f'[{i:03d}/{accounts.count():03d}] {account.display_name} '
                f'({account.email or account.feishu_open_id[:20]})'
            )
            try:
                from apps.secretary.feishu_fetcher import sync_feishu_data_direct
                counts = sync_feishu_data_direct(account.id, account.feishu_open_id)

                mail_count = counts.get('mail', 0)
                error = counts.get('error', '')

                if error:
                    self.stdout.write(f'       ⚠ {error}')
                    failed.append(f'{account.display_name}: {error}')
                else:
                    total_fetched += mail_count
                    self.stdout.write(
                        f'       ✓ mail={mail_count} cal={counts.get("calendar",0)} '
                        f'im={counts.get("im",0)}'
                    )

                # 统计本账号新增的信号
                new_signals = MailSignalEvent.objects.filter(
                    mailbox_owner_open_id=account.feishu_open_id
                ).count()
                if new_signals:
                    total_signals += new_signals
                    self.stdout.write(f'       → MailSignalEvent: {new_signals}')

            except Exception as e:
                self.stdout.write(f'       ✗ 异常: {e}')
                failed.append(f'{account.display_name}: {e}')

            if i < accounts.count() and delay > 0:
                time.sleep(delay)

        # ── 最终统计 ────────────────────────────────────────────────────────
        self._print_final_stats(total_fetched, total_signals, failed)

    def _show_dry_run_stats(self, accounts):
        """Dry-run：仅显示统计。"""
        self.stdout.write('【Dry-run 统计】')
        for acc in accounts:
            pc_count = PersonalContext.objects.filter(
                user_id=acc.feishu_open_id, source_type='mail'
            ).count()
            ev_count = MailSignalEvent.objects.filter(
                mailbox_owner_open_id=acc.feishu_open_id
            ).count()
            self.stdout.write(
                f'  {acc.display_name:15s} ({acc.email or ""}) '
                f'PC={pc_count} signals={ev_count}'
            )
        total_pc = PersonalContext.objects.filter(source_type='mail').count()
        total_ev = MailSignalEvent.objects.count()
        self.stdout.write(f'\n  合计: PersonalContext.mail={total_pc}  MailSignalEvent={total_ev}')

    def _reprocess_existing(self, accounts):
        """重处理：对现有 PersonalContext 重新跑 mail_signal_ingest。"""
        from apps.secretary.mail_signal_ingest import upsert_mail_signal_event_from_context

        self.stdout.write('【重处理模式：重新运行 mail_signal_ingest】')
        open_ids = list(accounts.values_list('feishu_open_id', flat=True))
        contexts = PersonalContext.objects.filter(
            user_id__in=open_ids, source_type='mail'
        ).order_by('user_id', 'id')

        total = contexts.count()
        success = 0
        ignored = 0
        errors = []

        for i, pc in enumerate(contexts, 1):
            if i % 20 == 0:
                self.stdout.write(f'  进度: {i}/{total}  成功={success}  忽略={ignored}')
            try:
                # 先删除旧 event，允许重新分类
                MailSignalEvent.objects.filter(source_mail_id=pc.source_id).delete()
                ev = upsert_mail_signal_event_from_context(
                    user_id=pc.user_id,
                    source_id=pc.source_id,
                    summary=pc.summary or '',
                    raw_content=pc.raw_content or '',
                    metadata=pc.metadata or {},
                    context_id=pc.id,
                )
                if ev and ev.status != 'ignored':
                    success += 1
                    if ev.is_external:
                        self.stdout.write(
                            f'  ✓ [外部] {ev.mail_signal_type:18s} | '
                            f'{ev.sender_email:30s} | '
                            f'{ev.subject[:40]}'
                        )
                else:
                    ignored += 1
            except Exception as e:
                errors.append(f'PC {pc.id}: {e}')

        self.stdout.write(f'\n  完成: 成功={success}  忽略={ignored}  错误={len(errors)}')
        if errors:
            for e in errors[:5]:
                self.stdout.write(f'  ERROR: {e}')

    def _print_final_stats(self, total_fetched, total_signals, failed):
        """打印最终统计和资生堂搜索结果。"""
        from django.db.models import Count

        self.stdout.write(f'\n{"="*60}')
        self.stdout.write('  采集完成')
        self.stdout.write(f'  总采集邮件: {total_fetched}')
        self.stdout.write(f'  总 MailSignalEvent: {total_signals}')
        if failed:
            self.stdout.write(f'  失败账号: {len(failed)}')

        # 资生堂/Shiseido 专项检查
        SHISEIDO_KW = [
            'shiseido', '资生堂', '資生堂', 'anessa', '安热沙', 'elixir',
            '怡丽丝尔', 'cpb', '肌肤之钥', 'ipsa', '茵芙莎', 'drunk elephant',
            'nars', 'laura mercier',
        ]
        self.stdout.write('\n  【资生堂专项搜索】')
        found = 0
        for ev in MailSignalEvent.objects.all():
            text = f'{ev.subject} {ev.body_text or ""} {ev.sender_email}'.lower()
            if any(kw.lower() in text for kw in SHISEIDO_KW):
                found += 1
                self.stdout.write(
                    f'  ★ {ev.mail_signal_type:18s} | {ev.sender_email:30s} | {ev.subject[:50]}'
                )

        if found == 0:
            self.stdout.write('  （未发现资生堂相关邮件）')

        # 外部邮件信号统计
        self.stdout.write('\n  【外部邮件信号统计】')
        for row in MailSignalEvent.objects.filter(is_external=True).values(
            'mail_signal_type'
        ).annotate(c=Count('id')).order_by('-c'):
            self.stdout.write(f'  {row["mail_signal_type"]:20s}: {row["c"]}')

        self.stdout.write(f'{"="*60}\n')
