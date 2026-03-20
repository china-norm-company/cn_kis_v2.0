"""
Kimi Claw 委派链路巡检命令（P3.14）

用法：
  python manage.py check_kimi_claw_delegate
  python manage.py check_kimi_claw_delegate --invoke
  python manage.py check_kimi_claw_delegate --invoke --account-id 1001
"""
import json
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '检查子衿 -> Kimi Claw 委派配置与执行链路'

    def add_arguments(self, parser):
        parser.add_argument('--invoke', action='store_true', help='执行一次委派测试（默认 dry_run）')
        parser.add_argument('--real', action='store_true', help='与 --invoke 配合，执行真实下发（非 dry_run）')
        parser.add_argument('--account-id', type=int, default=0, help='指定测试账号ID，不传则取第一个可用账号')
        parser.add_argument(
            '--action-type',
            type=str,
            default='daily_digest_prepare',
            help='测试动作类型（建议使用可委派动作）',
        )

    def handle(self, *args, **options):
        import os
        from apps.identity.models import Account
        from apps.secretary.models import AssistantActionPlan, AssistantActionExecution
        from apps.secretary.services import (
            delegate_action_to_kimi_claw,
            KIMI_CLAW_DELEGABLE_ACTION_TYPES,
        )

        invoke = bool(options.get('invoke'))
        real = bool(options.get('real'))
        account_id = int(options.get('account_id') or 0)
        action_type = str(options.get('action_type') or 'daily_digest_prepare').strip()
        dry_run = not real

        env_check = {
            'KIMI_API_BASE': (
                os.getenv('KIMI_API_BASE')
                or os.getenv('MOONSHOT_API_BASE')
                or 'https://api.moonshot.cn/v1'
            ),
            'KIMI_API_KEY': bool((os.getenv('KIMI_API_KEY') or '').strip()),
            'KIMI_PLUGIN_API_KEY': bool((os.getenv('KIMI_PLUGIN_API_KEY') or '').strip()),
            'KIMI_CLAW_TASK_TEMPLATE_ID': (
                (os.getenv('KIMI_CLAW_TASK_TEMPLATE_ID') or '19c8d565-df92-8fdc-8000-0000c6875563')
            ),
            'KIMI_CLAW_PROJECT_ID': (os.getenv('KIMI_CLAW_PROJECT_ID') or ''),
            'KIMI_CLAW_ORG_ID': (os.getenv('KIMI_CLAW_ORG_ID') or ''),
        }

        summary = {
            'invoke': invoke,
            'real': real,
            'dry_run': dry_run,
            'delegable_action_types': sorted(list(KIMI_CLAW_DELEGABLE_ACTION_TYPES)),
            'env': env_check,
        }

        if action_type not in KIMI_CLAW_DELEGABLE_ACTION_TYPES:
            self.stdout.write(self.style.WARNING(f'action_type={action_type} 不在可委派列表中，建议更换'))

        if not invoke:
            self.stdout.write(self.style.SUCCESS('Kimi Claw 委派配置检查完成（未执行调用）'))
            self.stdout.write(json.dumps(summary, ensure_ascii=False))
            return

        if account_id > 0:
            account = Account.objects.filter(id=account_id, is_deleted=False).first()
        else:
            account = Account.objects.filter(is_deleted=False).order_by('id').first()
        if not account:
            self.stdout.write(self.style.ERROR('未找到可用账号，无法执行委派测试'))
            self.stdout.write(json.dumps(summary, ensure_ascii=False))
            return

        action = AssistantActionPlan.objects.create(
            account_id=account.id,
            context_snapshot_id=None,
            action_type=action_type,
            title='Kimi Claw Delegate Smoke Test',
            description='委派链路巡检临时动作',
            action_payload={
                'priority_score': 80,
                'confidence_score': 90,
                'conflict_key': f'claw:smoke:{action_type}',
            },
            risk_level=AssistantActionPlan.RiskLevel.LOW,
            status=AssistantActionPlan.Status.CONFIRMED,
            requires_confirmation=True,
            confirmed_by=account.id,
        )

        result = delegate_action_to_kimi_claw(
            account=account,
            action_id=action.id,
            dry_run=dry_run,
        )
        summary['test'] = {
            'account_id': account.id,
            'action_id': action.id,
            'action_type': action_type,
            'result': result,
        }

        # 清理巡检临时数据，避免污染动作箱
        AssistantActionExecution.objects.filter(action_plan_id=action.id).delete()
        action.delete()

        ok = bool(result.get('ok'))
        if ok:
            self.stdout.write(self.style.SUCCESS('Kimi Claw 委派巡检成功'))
        else:
            self.stdout.write(self.style.WARNING('Kimi Claw 委派巡检失败'))
        self.stdout.write(json.dumps(summary, ensure_ascii=False))
