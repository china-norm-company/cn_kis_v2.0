"""
将协议列表中除“前 N 条保留项”以外的数据全部软删除。

默认顺序与知情管理列表一致：consent_display_order, id。
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.protocol.models import Protocol
from apps.protocol.services.protocol_service import bump_consent_overview_cache_generation


class Command(BaseCommand):
    help = '软删除协议：仅保留前 N 条（默认 7 条）或指定 ID 列表'

    def add_arguments(self, parser):
        parser.add_argument(
            '--keep-count',
            type=int,
            default=7,
            help='按 consent_display_order,id 保留前 N 条（默认 7）',
        )
        parser.add_argument(
            '--keep-ids',
            type=str,
            default='',
            help='逗号分隔的协议 ID；提供后优先使用此参数作为保留集合',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='真正执行软删除；不传则仅预览',
        )

    def handle(self, *args, **options):
        keep_count = max(0, int(options.get('keep_count') or 0))
        keep_ids_raw = (options.get('keep_ids') or '').strip()
        do_apply = bool(options.get('apply'))

        active_qs = Protocol.objects.filter(is_deleted=False).order_by('consent_display_order', 'id')
        active_ids = list(active_qs.values_list('id', flat=True))
        if not active_ids:
            self.stdout.write(self.style.WARNING('当前无未删除协议，无需处理。'))
            return

        keep_ids: list[int]
        if keep_ids_raw:
            keep_ids = []
            for part in keep_ids_raw.split(','):
                token = part.strip()
                if not token:
                    continue
                try:
                    keep_ids.append(int(token))
                except ValueError:
                    self.stdout.write(self.style.ERROR(f'非法 ID: {token}'))
                    return
            keep_ids = [x for x in keep_ids if x in set(active_ids)]
        else:
            keep_ids = active_ids[:keep_count]

        keep_set = set(keep_ids)
        delete_ids = [pid for pid in active_ids if pid not in keep_set]

        self.stdout.write(f'未删除协议总数: {len(active_ids)}')
        self.stdout.write(f'保留数量: {len(keep_ids)}')
        self.stdout.write(f'待软删除数量: {len(delete_ids)}')
        self.stdout.write(f'保留 ID: {keep_ids}')
        if delete_ids:
            preview = delete_ids[:30]
            suffix = ' ...' if len(delete_ids) > 30 else ''
            self.stdout.write(f'待软删除 ID(预览): {preview}{suffix}')

        if not do_apply:
            self.stdout.write(self.style.WARNING('预览模式：未执行删除。加 --apply 才会落库。'))
            return

        if not delete_ids:
            self.stdout.write(self.style.SUCCESS('无须软删除，数据库已符合保留条件。'))
            return

        with transaction.atomic():
            updated = Protocol.objects.filter(id__in=delete_ids, is_deleted=False).update(is_deleted=True)
            bump_consent_overview_cache_generation()

        self.stdout.write(self.style.SUCCESS(f'软删除完成，更新 {updated} 条。'))
