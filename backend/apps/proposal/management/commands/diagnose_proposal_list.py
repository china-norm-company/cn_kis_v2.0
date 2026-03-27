"""
诊断 proposal/list 500 错误：在本地复现接口逻辑并打印完整异常。

用法（在 backend 目录、已激活虚拟环境）：
  python manage.py diagnose_proposal_list
  python manage.py diagnose_proposal_list --account-id 168
"""
import sys

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '复现 proposal/list 逻辑，定位 500 原因'

    def add_arguments(self, parser):
        parser.add_argument(
            '--account-id',
            type=int,
            default=None,
            help='指定账号 ID，不传则用第一个可用账号',
        )

    def handle(self, *args, **options):
        account_id = options.get('account_id')
        try:
            from apps.identity.models import Account
            from apps.proposal import services
            from apps.proposal.api import _proposal_to_dict

            account = None
            if account_id:
                account = Account.objects.filter(id=account_id, is_deleted=False).first()
                if not account:
                    self.stderr.write(self.style.ERROR(f'账号 id={account_id} 不存在'))
                    sys.exit(1)
            else:
                account = Account.objects.filter(is_deleted=False).first()
                if not account:
                    self.stderr.write(self.style.ERROR('数据库中无账号，请先创建或指定 --account-id'))
                    sys.exit(1)

            self.stdout.write(f'使用账号: id={account.id} username={account.username}')

            # 1) 权限服务（与 require_permission 一致）
            self.stdout.write('检查 get_authz_service()...')
            from apps.identity.authz import get_authz_service
            authz = get_authz_service()
            self.stdout.write(self.style.SUCCESS('  OK'))

            self.stdout.write('检查 has_permission(proposal.proposal.read)...')
            ok = authz.has_permission(account, 'proposal.proposal.read', project_id=None)
            self.stdout.write(self.style.SUCCESS(f'  OK (has_perm={ok})'))

            # 2) 列表服务
            self.stdout.write('调用 services.list_proposals(...)...')
            result = services.list_proposals(
                page=1, page_size=20, status=None, account=account,
            )
            self.stdout.write(self.style.SUCCESS(f'  OK total={result["total"]}'))

            # 3) 序列化（与 API 一致）
            for i, p in enumerate(result['items'][:3]):
                self.stdout.write(f'  _proposal_to_dict item[{i}]...')
                d = _proposal_to_dict(p)
                self.stdout.write(self.style.SUCCESS(f'    id={d.get("id")} title={d.get("title")}'))

            self.stdout.write(self.style.SUCCESS('诊断完成：未发现异常'))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'异常: {e}'))
            import traceback
            traceback.print_exc()
            sys.exit(1)
