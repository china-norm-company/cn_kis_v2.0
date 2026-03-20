"""
子衿调度器命令（P3.5/P3.25）

用法：
  python manage.py run_assistant_scheduler
  python manage.py run_assistant_scheduler --force
  python manage.py run_assistant_scheduler --dry-run
  python manage.py run_assistant_scheduler --account-ids 1001,1002 --limit 50
  python manage.py run_assistant_scheduler --route-days 14
  python manage.py run_assistant_scheduler --disable-route-governance
  python manage.py run_assistant_scheduler --auto-execute-route-governance-alert
  python manage.py run_assistant_scheduler --auto-execute-route-governance-alert --auto-execute-approval-mode graded
"""
import json
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '执行子衿调度扫描（日报动作 + 路径治理告警巡检）'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='忽略时段门禁，强制尝试生成日报动作')
        parser.add_argument('--dry-run', action='store_true', help='仅扫描，不执行写入')
        parser.add_argument('--account-ids', type=str, default='', help='限定账号ID列表，逗号分隔')
        parser.add_argument('--limit', type=int, default=200, help='最大扫描账号数，默认200')
        parser.add_argument('--disable-daily-digest', action='store_true', help='关闭日报动作调度')
        parser.add_argument('--disable-route-governance', action='store_true', help='关闭路径治理告警巡检')
        parser.add_argument('--route-days', type=int, default=30, help='路径治理统计窗口天数，默认30')
        parser.add_argument('--route-override-hit-rate-threshold', type=float, default=0.6, help='覆写命中率阈值')
        parser.add_argument('--route-override-success-rate-threshold', type=float, default=0.5, help='覆写成功率阈值（低于等于触发）')
        parser.add_argument('--route-fallback-rate-threshold', type=float, default=0.25, help='回退率阈值')
        parser.add_argument('--route-min-applied-threshold', type=int, default=5, help='最小样本数阈值')
        parser.add_argument('--route-cooldown-hours', type=int, default=12, help='路径治理告警冷却小时数')
        parser.add_argument('--auto-execute-route-governance-alert', action='store_true', help='自动确认并执行路径治理告警（默认关闭）')
        parser.add_argument('--auto-execute-max-risk', type=str, default='medium', help='自动执行允许的最高风险等级（low|medium|high）')
        parser.add_argument('--auto-execute-min-confidence', type=int, default=75, help='自动执行最低置信度')
        parser.add_argument('--auto-execute-min-priority', type=int, default=70, help='自动执行最低优先级')
        parser.add_argument('--auto-execute-approval-mode', type=str, default='graded', help='自动执行审批模式（graded|direct）')

    def handle(self, *args, **options):
        from apps.secretary.services import run_assistant_scheduler

        raw_ids = (options.get('account_ids') or '').strip()
        account_ids = []
        if raw_ids:
            for item in raw_ids.split(','):
                s = item.strip()
                if s.isdigit():
                    account_ids.append(int(s))

        result = run_assistant_scheduler(
            force=bool(options.get('force')),
            dry_run=bool(options.get('dry_run')),
            account_ids=account_ids or None,
            limit=int(options.get('limit') or 200),
            enable_daily_digest=not bool(options.get('disable_daily_digest')),
            enable_route_governance=not bool(options.get('disable_route_governance')),
            route_days=int(options.get('route_days') or 30),
            route_override_hit_rate_threshold=float(options.get('route_override_hit_rate_threshold') or 0.6),
            route_override_success_rate_threshold=float(options.get('route_override_success_rate_threshold') or 0.5),
            route_fallback_rate_threshold=float(options.get('route_fallback_rate_threshold') or 0.25),
            route_min_applied_threshold=int(options.get('route_min_applied_threshold') or 5),
            route_cooldown_hours=int(options.get('route_cooldown_hours') or 12),
            auto_execute_route_governance_alert=bool(options.get('auto_execute_route_governance_alert')),
            auto_execute_max_risk=str(options.get('auto_execute_max_risk') or 'medium'),
            auto_execute_min_confidence=int(options.get('auto_execute_min_confidence') or 75),
            auto_execute_min_priority=int(options.get('auto_execute_min_priority') or 70),
            auto_execute_approval_mode=str(options.get('auto_execute_approval_mode') or 'graded'),
        )
        summary = result.get('summary', {})
        self.stdout.write(
            self.style.SUCCESS(
                f"调度完成 scanned={summary.get('scanned', 0)} "
                f"eligible={summary.get('eligible', 0)} created={summary.get('created', 0)} "
                f"skipped={summary.get('skipped', 0)} errors={summary.get('errors', 0)}"
            )
        )
        self.stdout.write(json.dumps(result, ensure_ascii=False))
