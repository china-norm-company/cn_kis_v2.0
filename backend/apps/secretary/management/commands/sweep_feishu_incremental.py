"""
sweep_feishu_incremental — 飞书增量采集命令

基于 FeishuMigrationCheckpoint.last_timestamp 实现增量采集：
- 仅采集 last_timestamp 之后的新数据
- 复用 fetch_all_sources_full_history（feishu_fetcher.py）中的全部采集逻辑
- 采集完成后更新 checkpoint 供下次增量使用

使用方式：
    # 采集过去 48 小时新增数据（默认）
    python manage.py sweep_feishu_incremental

    # 指定回溯时间窗口（小时）
    python manage.py sweep_feishu_incremental --lookback-hours 72

    # 指定数据源
    python manage.py sweep_feishu_incremental --sources mail,im

    # 强制全量重扫（忽略 last_timestamp，重走全量逻辑）
    python manage.py sweep_feishu_incremental --force-full
"""
import logging
import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)

ALL_SOURCES = ['mail', 'im', 'calendar', 'task', 'approval', 'doc', 'wiki']


class Command(BaseCommand):
    help = '基于 checkpoint 执行飞书增量采集（复用 feishu_fetcher 全量逻辑）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--lookback-hours', type=int, default=48,
            help='回溯时间窗口（小时，默认 48）',
        )
        parser.add_argument(
            '--sources', type=str, default='mail,im,calendar,task,approval,doc,wiki',
            help='指定数据源，逗号分隔',
        )
        parser.add_argument(
            '--force-full', action='store_true',
            help='忽略 last_timestamp，强制全量重扫',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='预演模式：仅统计待处理 checkpoint，不实际采集',
        )
        parser.add_argument(
            '--delay', type=float, default=0.5,
            help='账号间延迟秒数（默认 0.5）',
        )
        parser.add_argument(
            '--user-limit', type=int, default=0,
            help='只处理前 N 个用户（0=全部，用于测试）',
        )

    def handle(self, *args, **options):
        lookback_hours = options['lookback_hours']
        sources = [s.strip() for s in options['sources'].split(',') if s.strip()]
        force_full = options['force_full']
        dry_run = options['dry_run']
        delay = options['delay']
        user_limit = options['user_limit']

        cutoff_time = timezone.now() - timedelta(hours=lookback_hours)
        batch_id = f'incr-{timezone.now().strftime("%Y%m%d%H%M%S")}'

        self.stdout.write(f'飞书增量采集 | 回溯={lookback_hours}h | 数据源={sources}')
        self.stdout.write(f'截止时间: {cutoff_time.strftime("%Y-%m-%d %H:%M:%S")}')

        from apps.secretary.models import FeishuMigrationCheckpoint
        from apps.identity.models import Account
        from apps.secretary.feishu_fetcher import fetch_all_sources_full_history

        # 找到所有已完成全量迁移、需要增量更新的 checkpoint
        checkpoints = (
            FeishuMigrationCheckpoint.objects
            .filter(
                source_type__in=sources,
                status='completed',
            )
            .exclude(user_open_id='__TENANT__')
            .values('user_open_id', 'source_type', 'last_timestamp')
        )

        # 按用户分组
        user_sources_map: dict = {}
        for cp in checkpoints:
            uid = cp['user_open_id']
            if uid not in user_sources_map:
                user_sources_map[uid] = {}
            # 确定本次增量的起点
            if force_full or not cp['last_timestamp']:
                lookback_days = lookback_hours // 24 + 1
            else:
                # 取 last_timestamp 到现在的天数，加 1 天冗余
                delta = timezone.now() - cp['last_timestamp']
                lookback_days = max(delta.days + 1, lookback_hours // 24 + 1)
            user_sources_map[uid][cp['source_type']] = lookback_days

        self.stdout.write(f'待增量采集: {len(user_sources_map)} 个用户')

        if dry_run:
            for uid, src_map in list(user_sources_map.items())[:10]:
                self.stdout.write(f'  {uid[:20]}: {list(src_map.keys())}')
            return

        # 支持 --user-limit 单用户测试
        users_iter = list(user_sources_map.items())
        if user_limit > 0:
            users_iter = users_iter[:user_limit]
            self.stdout.write(f'[user-limit={user_limit}] 仅处理前 {user_limit} 个用户')

        total_stats = {s: 0 for s in sources}
        total_stats['errors'] = 0

        accounts = {
            a.feishu_open_id: a
            for a in Account.objects.filter(
                feishu_open_id__in=list(user_sources_map.keys()),
                is_deleted=False,
            )
        }

        for i, (open_id, src_lookback_map) in enumerate(users_iter, 1):
            account = accounts.get(open_id)
            if not account:
                continue

            active_sources = list(src_lookback_map.keys())
            max_lookback = max(src_lookback_map.values())

            self.stdout.write(
                f'[{i}/{len(user_sources_map)}] {account.display_name} '
                f'({open_id[:20]}) 回溯 {max_lookback} 天'
            )

            try:
                counts = fetch_all_sources_full_history(
                    account_id=account.id,
                    open_id=open_id,
                    sources=active_sources,
                    lookback_days=max_lookback,
                    page_delay=0.3,
                )
                for src, cnt in counts.items():
                    total_stats[src] = total_stats.get(src, 0) + cnt
                    if cnt > 0:
                        self.stdout.write(f'  {src:<12} +{cnt} 条')
            except Exception as e:
                logger.error('增量采集失败 %s: %s', account.display_name, e)
                total_stats['errors'] += 1

            if i < len(users_iter):
                time.sleep(delay)

        self.stdout.write('\n=== 增量采集完成 ===')
        for src in sources:
            cnt = total_stats.get(src, 0)
            if cnt > 0:
                self.stdout.write(f'  {src}: +{cnt} 条')
        self.stdout.write(f'  错误: {total_stats["errors"]} 个')
