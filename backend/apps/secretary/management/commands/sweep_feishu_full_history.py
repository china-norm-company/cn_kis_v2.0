"""
sweep_feishu_full_history — 飞书全量历史信息迁移

复用现有 fetch_mails / fetch_calendar_events / fetch_im_messages /
fetch_tasks / fetch_approvals / FeishuComprehensiveCollector._collect_docs
在此之上增加：分页穷举（邮件）、幂等写入、断点续传（FeishuMigrationCheckpoint）

使用方式：
    # 全量采集（所有用户，所有数据源，自动断点续传）
    python manage.py sweep_feishu_full_history

    # 仅指定数据源
    python manage.py sweep_feishu_full_history --sources mail,im

    # 仅指定用户（account_id）
    python manage.py sweep_feishu_full_history --account-id 1

    # 预演
    python manage.py sweep_feishu_full_history --dry-run

    # 重置失败的 checkpoint 并重跑
    python manage.py sweep_feishu_full_history --reset-failed

    # 仅对「邮件已完成但该用户无附件」的 checkpoint 重置，用于补采附件
    python manage.py sweep_feishu_full_history --reset-incomplete-mail

    # 将所有已完成的邮件 checkpoint 重置，全量重跑邮件以补采附件
    python manage.py sweep_feishu_full_history --reset-mail-completed

    # 仅处理已离职/非活跃账号（防止 token 过期导致信息丢失）
    python manage.py sweep_feishu_full_history --inactive-only --sources mail,im,calendar,task,approval,doc,wiki

    # 仅处理指定姓名（如俞静馨、朴彦锟、魏蓉等高价值信箱）
    python manage.py sweep_feishu_full_history --names "俞静馨,朴彦锟,魏蓉" --sources mail,im,calendar,task,approval,doc,wiki

    # 将指定姓名/非活跃账号的 checkpoint 重置，便于下次全量重采
    python manage.py sweep_feishu_full_history --reset-inactive-sources --names "俞静馨,朴彦锟,魏蓉" --dry-run
"""
import logging
import os
import time

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.utils import timezone
from libs.storage_paths import get_disk_usage

logger = logging.getLogger(__name__)

ALL_SOURCES = ['mail', 'im', 'calendar', 'task', 'approval', 'doc', 'wiki']

# 已离职/非活跃但信箱内容多的重点人员（用于 --names 默认或文档参考）
AT_RISK_DISPLAY_NAMES = ['俞静馨', '朴彦锟', '魏蓉']


class Command(BaseCommand):
    help = '飞书全量历史信息迁移（复用现有采集能力，断点续传）'

    def add_arguments(self, parser):
        parser.add_argument('--sources', type=str, default='',
                            help='指定数据源，逗号分隔，默认全部')
        parser.add_argument('--account-id', type=int, default=0,
                            help='仅处理指定账号')
        parser.add_argument('--names', type=str, default='',
                            help='仅处理指定显示名，逗号分隔，如 "俞静馨,朴彦锟,魏蓉"（已离职/高价值信箱）')
        parser.add_argument('--inactive-only', action='store_true',
                            help='仅处理非活跃账号（status 为 inactive/disabled），防止离职后 token 过期导致信息丢失')
        parser.add_argument('--batch-id', type=str, default='',
                            help='批次 ID（默认自动生成）')
        parser.add_argument('--dry-run', action='store_true',
                            help='预演：仅统计待处理数量，不采集')
        parser.add_argument('--reset-failed', action='store_true',
                            help='将 failed 的 checkpoint 重置为 pending')
        parser.add_argument('--reset-incomplete-mail', action='store_true',
                            help='将「邮件已完成但该用户无任何附件」的 mail checkpoint 重置为 pending，用于补采附件')
        parser.add_argument('--reset-mail-completed', action='store_true',
                            help='将所有已完成的 mail checkpoint 重置为 pending（全量重跑邮件以补采附件）')
        parser.add_argument('--reset-inactive-sources', action='store_true',
                            help='将 --names 或 --inactive-only 匹配到的账号的指定数据源 checkpoint 重置为 pending，便于全量重采（常与 --dry-run 先看影响）')
        parser.add_argument('--lookback-days', type=int, default=3650,
                            help='日历/IM 回溯天数（默认 3650，约 10 年）')
        parser.add_argument('--delay', type=float, default=1.0,
                            help='账号间延迟秒数（默认 1.0）')
        parser.add_argument('--no-deposit', action='store_true',
                            help='不触发 KnowledgeEntry 入库')
        parser.add_argument('--monitor-interval', type=int, default=0,
                            help='主流程结束后每 N 秒检查；若有 failed 则自动 reset-failed 并再跑一轮（0=不监控）')
        parser.add_argument('--skip-resource-check', action='store_true',
                            help='跳过磁盘/存储预检（仅应急使用，不推荐）')

    def handle(self, *args, **options):
        sources = [s.strip() for s in options['sources'].split(',') if s.strip()] or ALL_SOURCES
        account_id_filter = options['account_id']
        names_filter = (options.get('names') or '').strip()
        inactive_only = options.get('inactive_only') or False
        reset_inactive_sources = options.get('reset_inactive_sources') or False
        batch_id = options['batch_id'] or f'full-{timezone.now().strftime("%Y%m%d%H%M%S")}'
        dry_run = options['dry_run']
        reset_failed = options['reset_failed']
        reset_incomplete_mail = options['reset_incomplete_mail']
        reset_mail_completed = options['reset_mail_completed']
        lookback_days = options['lookback_days']
        delay = options['delay']
        no_deposit = options['no_deposit']
        monitor_interval = options.get('monitor_interval') or 0
        skip_resource_check = options.get('skip_resource_check') or False

        self.stdout.write('=' * 65)
        self.stdout.write(f'飞书全量历史迁移  批次={batch_id}')
        self.stdout.write(f'数据源: {sources}')
        self.stdout.write(f'回溯天数: {lookback_days}  用户延迟: {delay}s  Dry-run: {dry_run}')
        if names_filter:
            self.stdout.write(f'限定姓名: {names_filter}')
        if inactive_only:
            self.stdout.write('限定账号: 仅非活跃(inactive/disabled)')
        self.stdout.write('=' * 65)

        if not skip_resource_check:
            self._enforce_storage_guardrails(stage='startup')

        from apps.secretary.models import FeishuMigrationCheckpoint, FeishuMigrationBatch
        from apps.identity.models import Account
        from apps.secretary.feishu_fetcher import fetch_all_sources_full_history

        if reset_inactive_sources:
            self._reset_inactive_sources(names_filter, inactive_only, sources)
            if dry_run:
                return
            # 重置后继续执行本次 sweep（目标账号见下方 qs）

        if reset_failed:
            cnt = FeishuMigrationCheckpoint.objects.filter(
                status='failed', source_type__in=sources,
            ).update(status='pending', page_token='', error_log='')
            self.stdout.write(f'已重置 {cnt} 条 failed → pending')

        if reset_mail_completed:
            cnt = FeishuMigrationCheckpoint.objects.filter(
                source_type='mail', status='completed',
            ).update(status='pending', page_token='', error_log='')
            self.stdout.write(f'已重置 {cnt} 条 mail(completed) → pending（将重跑邮件并补采附件）')

        if reset_incomplete_mail:
            from apps.secretary.models import PersonalContext
            incomplete = 0
            for cp in FeishuMigrationCheckpoint.objects.filter(
                source_type='mail', status='completed',
            ).only('user_open_id'):
                uid = cp.user_open_id
                n_mail = PersonalContext.objects.filter(
                    user_id=uid, source_type='mail',
                ).count()
                n_att = PersonalContext.objects.filter(
                    user_id=uid, source_type='mail_attachment',
                ).count()
                if n_mail > 0 and n_att == 0:
                    FeishuMigrationCheckpoint.objects.filter(
                        user_open_id=uid, source_type='mail',
                    ).update(status='pending', page_token='', error_log='')
                    incomplete += 1
            self.stdout.write(f'已重置 {incomplete} 条「邮件已完成但无附件」的 mail checkpoint → pending')

        # 确定目标账号
        qs = Account.objects.filter(is_deleted=False).exclude(feishu_open_id='')
        if account_id_filter:
            qs = qs.filter(id=account_id_filter)
        if names_filter:
            names_list = [n.strip() for n in names_filter.split(',') if n.strip()]
            if names_list:
                qs = qs.filter(display_name__in=names_list)
        if inactive_only:
            qs = qs.filter(status__in=['inactive', 'disabled'])

        accounts = list(qs.order_by('id'))
        self.stdout.write(f'目标账号: {len(accounts)} 个')

        if dry_run:
            pending = FeishuMigrationCheckpoint.objects.filter(
                source_type__in=sources, status__in=['pending', 'failed'],
            ).count()
            self.stdout.write(f'\n[DRY-RUN] 待处理 checkpoint: {pending} 条')
            from apps.secretary.models import PersonalContext
            for src in sources:
                cnt = PersonalContext.objects.filter(source_type=src).count()
                self.stdout.write(f'  已有 PersonalContext [{src}]: {cnt} 条')
            return

        # 执行一轮采集（创建批次并遍历账号）
        batch, total_stats = self._run_one_pass(
            accounts, sources, batch_id, lookback_days, delay, no_deposit,
            skip_resource_check=skip_resource_check,
        )
        batch.status = 'completed'
        batch.completed_at = timezone.now()
        batch.summary = total_stats
        batch.save(update_fields=['status', 'completed_at', 'summary', 'updated_at'])
        self._print_report(total_stats, batch)

        # 持续监控：若有 failed 则自动 reset 并再跑一轮
        if monitor_interval > 0:
            round_num = 0
            while True:
                time.sleep(monitor_interval)
                n_failed = FeishuMigrationCheckpoint.objects.filter(
                    status='failed', source_type__in=sources,
                ).count()
                if n_failed == 0:
                    self.stdout.write(f'[监控] 无 failed checkpoint，{monitor_interval}s 后再检查')
                    continue
                round_num += 1
                self.stdout.write(f'[监控] 发现 {n_failed} 条 failed，重置并重跑第 {round_num} 轮')
                FeishuMigrationCheckpoint.objects.filter(
                    status='failed', source_type__in=sources,
                ).update(status='pending', page_token='', error_log='')
                monitor_batch_id = f'{batch_id}-m{round_num}'
                batch_m, total_stats_m = self._run_one_pass(
                    accounts, sources, monitor_batch_id, lookback_days, delay, no_deposit,
                    skip_resource_check=skip_resource_check,
                )
                batch_m.status = 'completed'
                batch_m.completed_at = timezone.now()
                batch_m.summary = total_stats_m
                batch_m.save(update_fields=['status', 'completed_at', 'summary', 'updated_at'])
                self._print_report(total_stats_m, batch_m)

    def _run_one_pass(self, accounts, sources, batch_id, lookback_days, delay, no_deposit, skip_resource_check: bool = False):
        """执行一轮全量采集（创建批次、遍历账号、更新 checkpoint），返回 (batch, total_stats)。"""
        from apps.secretary.models import FeishuMigrationCheckpoint, FeishuMigrationBatch
        from apps.identity.models import Account
        from apps.secretary.feishu_fetcher import fetch_all_sources_full_history

        batch, _ = FeishuMigrationBatch.objects.get_or_create(
            batch_id=batch_id,
            defaults={
                'batch_type': 'full_history',
                'sources': sources,
                'target_users': [str(a.id) for a in accounts],
                'status': 'running',
                'total_users': len(accounts),
                'started_at': timezone.now(),
            },
        )
        total_stats = {s: 0 for s in sources}
        total_stats['errors'] = 0

        for i, account in enumerate(accounts, 1):
            if not skip_resource_check:
                self._enforce_storage_guardrails(stage=f'account-{i}')
            open_id = account.feishu_open_id
            if not open_id:
                continue

            done_sources = set(
                FeishuMigrationCheckpoint.objects.filter(
                    user_open_id=open_id,
                    source_type__in=sources,
                    status='completed',
                ).values_list('source_type', flat=True)
            )
            pending_sources = [s for s in sources if s not in done_sources]
            if not pending_sources:
                self.stdout.write(f'[{i}/{len(accounts)}] {account.display_name} — 已全部完成，跳过')
                continue

            self.stdout.write(f'\n[{i}/{len(accounts)}] {account.display_name} ({open_id[:20]}) — {pending_sources}')

            checkpoint_map = {}
            for src in pending_sources:
                cp, _ = FeishuMigrationCheckpoint.objects.get_or_create(
                    user_open_id=open_id,
                    source_type=src,
                    defaults={
                        'user_name': account.display_name,
                        'user_email': account.email or '',
                        'status': 'running',
                        'auth_mode': 'user_token',
                        'config': {'batch_id': batch_id},
                    },
                )
                cp.status = 'running'
                cp.started_at = cp.started_at or timezone.now()
                if not cp.config:
                    cp.config = {}
                cp.config['batch_id'] = batch_id
                cp.save(update_fields=['status', 'started_at', 'config', 'updated_at'])
                checkpoint_map[src] = cp

            non_doc_sources = [s for s in pending_sources if s != 'doc']
            for single_src in non_doc_sources:
                try:
                    counts = fetch_all_sources_full_history(
                        account_id=account.id,
                        open_id=open_id,
                        sources=[single_src],
                        checkpoint_map=checkpoint_map,
                        lookback_days=lookback_days,
                    )
                    cnt = counts.get(single_src, 0)
                    total_stats[single_src] = total_stats.get(single_src, 0) + cnt
                    if cnt > 0:
                        self.stdout.write(f'  {single_src:<12} +{cnt} 条')
                    cp = checkpoint_map.get(single_src)
                    if cp:
                        cp.mark_completed()
                except Exception as e:
                    logger.error('账号 %s 源 %s 采集失败: %s', account.display_name, single_src, e)
                    total_stats['errors'] += 1
                    cp = checkpoint_map.get(single_src)
                    if cp:
                        cp.mark_failed(str(e)[:300])

            if 'doc' in pending_sources:
                doc_cp = checkpoint_map.get('doc')
                try:
                    from apps.secretary.feishu_comprehensive_collector import FeishuComprehensiveCollector
                    from apps.secretary.feishu_fetcher import get_valid_user_token
                    collector = FeishuComprehensiveCollector(
                        lookback_days=lookback_days,
                        deposit_knowledge=not no_deposit,
                    )
                    user_token = get_valid_user_token(account.id) or ''
                    result_items = list(collector._collect_docs(user_token, account, type('R', (), {'errors': []})()))
                    from apps.secretary.feishu_fetcher import _save_context_items_idempotent
                    doc_items = [
                        {'source_id': it.source_id, 'summary': it.summary,
                         'raw_content': it.raw_content, 'metadata': it.metadata}
                        for it in result_items
                    ]
                    written = _save_context_items_idempotent(open_id, 'doc', doc_items)
                    total_stats['doc'] = total_stats.get('doc', 0) + written
                    if written > 0:
                        self.stdout.write(f'  doc          +{written} 条')
                    if doc_cp:
                        doc_cp.mark_completed()
                except Exception as e:
                    logger.error('账号 %s doc 采集失败: %s', account.display_name, e)
                    if doc_cp:
                        doc_cp.mark_failed(str(e)[:300])

            batch.completed_users = (batch.completed_users or 0) + 1
            batch.total_items = sum(total_stats.get(s, 0) for s in sources)
            batch.save(update_fields=['completed_users', 'total_items', 'updated_at'])

            if i < len(accounts):
                time.sleep(delay)

        return batch, total_stats

    def _deposit_to_knowledge(self, open_id: str, sources: list):
        """将新采集的 PersonalContext 推送到 KnowledgeEntry（复用 comprehensive_collector）。"""
        try:
            from apps.secretary.feishu_comprehensive_collector import FeishuComprehensiveCollector
            from apps.secretary.models import PersonalContext
            from dataclasses import dataclass, field as dc_field
            from typing import List, Dict, Any

            # 构造 CollectionResult 供 _deposit_to_knowledge 使用
            collector = FeishuComprehensiveCollector(deposit_knowledge=True)

            @dataclass
            class _CollectedItem:
                source_type: str
                source_id: str
                user_id: str
                summary: str
                raw_content: str
                metadata: Dict[str, Any] = dc_field(default_factory=dict)
                collected_at: str = ''

            @dataclass
            class _CollectionResult:
                user_id: str = ''
                account_name: str = ''
                items: List = dc_field(default_factory=list)
                deposited_to_knowledge: int = 0

                @property
                def total(self):
                    return len(self.items)

            result = _CollectionResult(user_id=open_id)
            for src in sources:
                pcs = PersonalContext.objects.filter(
                    user_id=open_id, source_type=src,
                ).order_by('-created_at')[:200]
                for pc in pcs:
                    result.items.append(_CollectedItem(
                        source_type=src,
                        source_id=pc.source_id or '',
                        user_id=open_id,
                        summary=pc.summary or '',
                        raw_content=pc.raw_content or '',
                        metadata=pc.metadata or {},
                    ))

            deposited = collector._deposit_to_knowledge(result)
            if deposited:
                logger.info('知识入库 %s: %d 条', open_id[:20], deposited)
        except Exception as e:
            logger.debug('知识入库失败（非关键）: %s', e)

    def _enforce_storage_guardrails(self, stage: str):
        warn_pct = int(os.getenv('VOLCENGINE_DISK_WARN_PCT', '85'))
        crit_pct = int(os.getenv('VOLCENGINE_DISK_CRIT_PCT', '95'))
        media_warn_pct = int(os.getenv('VOLCENGINE_MEDIA_DISK_WARN_PCT', '90'))

        snapshots = []
        seen_paths = set()
        # 用挂载点而不是应用目录，避免应用目录因 overlay/tmpfs 而不稳定
        import os as _os
        _base = str(settings.BASE_DIR)
        _sys_probe = _base if _os.path.exists(_base) else '/'
        for label, path in [('system', _sys_probe), ('media', settings.MEDIA_ROOT)]:
            snapshot = get_disk_usage(label, path)
            if snapshot.path in seen_paths:
                continue
            seen_paths.add(snapshot.path)
            snapshots.append(snapshot)

        for snapshot in snapshots:
            line = (
                f'[资源检查:{stage}] {snapshot.label} path={snapshot.path} '
                f'used={snapshot.used_pct}% free={snapshot.free_gb}GB'
            )
            self.stdout.write(line)
            limit = media_warn_pct if snapshot.label == 'media' else warn_pct
            if snapshot.used_pct >= crit_pct:
                raise CommandError(
                    f'{snapshot.label} 磁盘使用率 {snapshot.used_pct}% >= {crit_pct}% '
                    f'(path={snapshot.path})，停止采集以避免写爆磁盘'
                )
            if snapshot.used_pct >= limit:
                self.stdout.write(
                    self.style.WARNING(
                        f'警告：{snapshot.label} 磁盘使用率 {snapshot.used_pct}% >= {limit}% '
                        f'(path={snapshot.path})'
                    )
                )

    def _reset_inactive_sources(self, names_filter: str, inactive_only: bool, sources: list):
        """将「按姓名或非活跃」匹配到的账号的指定数据源 checkpoint 重置为 pending，便于全量重采。"""
        from apps.secretary.models import FeishuMigrationCheckpoint
        from apps.identity.models import Account

        qs = Account.objects.filter(is_deleted=False).exclude(feishu_open_id='')
        if names_filter:
            names_list = [n.strip() for n in names_filter.split(',') if n.strip()]
            if names_list:
                qs = qs.filter(display_name__in=names_list)
        if inactive_only:
            qs = qs.filter(status__in=['inactive', 'disabled'])
        if not names_filter and not inactive_only:
            self.stdout.write('--reset-inactive-sources 需同时指定 --names 或 --inactive-only，已跳过')
            return

        accounts = list(qs.only('id', 'display_name', 'feishu_open_id'))
        if not accounts:
            self.stdout.write('未匹配到任何账号，已跳过')
            return

        open_ids = [a.feishu_open_id for a in accounts if a.feishu_open_id]
        updated = FeishuMigrationCheckpoint.objects.filter(
            user_open_id__in=open_ids,
            source_type__in=sources,
        ).update(status='pending', page_token='', total_fetched=0, total_deposited=0, completed_at=None, error_log='')

        self.stdout.write(f'已重置 {updated} 条 checkpoint（账号: {[a.display_name for a in accounts]}）')
        for a in accounts:
            self.stdout.write(f'  - {a.display_name} ({a.feishu_open_id[:20]}...)')

    def _print_report(self, stats: dict, batch):
        self.stdout.write('\n' + '=' * 65)
        self.stdout.write('迁移完成报告')
        self.stdout.write('=' * 65)
        for src in ALL_SOURCES:
            cnt = stats.get(src, 0)
            if cnt > 0:
                self.stdout.write(f'  {src:<15} +{cnt} 条')
        self.stdout.write(f'  错误        {stats.get("errors", 0)} 个')
        self.stdout.write(f'  用户完成    {batch.completed_users}/{batch.total_users}')
