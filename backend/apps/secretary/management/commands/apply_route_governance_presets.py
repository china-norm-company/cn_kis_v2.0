"""
批量应用路径治理角色预设（P3.31）

用法：
  python manage.py apply_route_governance_presets
  python manage.py apply_route_governance_presets --preset-id auto --limit 200
  python manage.py apply_route_governance_presets --account-ids 1001,1002 --dry-run
"""
import json
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '批量应用路径治理角色预设（按账号角色自动识别）'

    def add_arguments(self, parser):
        parser.add_argument('--preset-id', type=str, default='auto', help='预设ID（auto|management|operation|support|technical）')
        parser.add_argument('--dry-run', action='store_true', help='仅预览，不写入')
        parser.add_argument('--account-ids', type=str, default='', help='限定账号ID列表，逗号分隔')
        parser.add_argument('--limit', type=int, default=500, help='最大扫描账号数，默认500')

    def handle(self, *args, **options):
        from apps.identity.models import AccountStatus, AccountType, Account
        from apps.secretary.services import apply_route_governance_preset, _detect_primary_role_category

        raw_ids = (options.get('account_ids') or '').strip()
        account_ids = []
        if raw_ids:
            for item in raw_ids.split(','):
                s = item.strip()
                if s.isdigit():
                    account_ids.append(int(s))

        limit = max(1, min(5000, int(options.get('limit') or 500)))
        qs = Account.objects.filter(
            is_deleted=False,
            status=AccountStatus.ACTIVE,
            account_type__in=[AccountType.INTERNAL, 'staff'],  # 兼容历史 staff 账号类型
        ).order_by('id')
        if account_ids:
            qs = qs.filter(id__in=account_ids)
        accounts = list(qs[:limit])

        preset_id = str(options.get('preset_id') or 'auto').strip().lower()
        dry_run = bool(options.get('dry_run'))
        summary = {'scanned': len(accounts), 'applied': 0, 'skipped': 0, 'errors': 0}
        details = []
        for account in accounts:
            try:
                resolved = _detect_primary_role_category(account) if preset_id == 'auto' else preset_id
                if dry_run:
                    details.append({'account_id': account.id, 'status': 'dry_run', 'preset_id': resolved})
                    continue
                result = apply_route_governance_preset(account=account, preset_id=preset_id)
                if result.get('ok'):
                    summary['applied'] += 1
                    details.append({'account_id': account.id, 'status': 'applied', 'preset_id': result.get('preset_id')})
                else:
                    summary['skipped'] += 1
                    details.append({'account_id': account.id, 'status': 'skipped', 'reason': result.get('message', '')})
            except Exception as e:
                summary['errors'] += 1
                details.append({'account_id': account.id, 'status': 'error', 'reason': str(e)})

        self.stdout.write(
            self.style.SUCCESS(
                f"完成 scanned={summary['scanned']} applied={summary['applied']} "
                f"skipped={summary['skipped']} errors={summary['errors']}"
            )
        )
        self.stdout.write(json.dumps({'preset_id': preset_id, 'dry_run': dry_run, 'summary': summary, 'details': details}, ensure_ascii=False))
