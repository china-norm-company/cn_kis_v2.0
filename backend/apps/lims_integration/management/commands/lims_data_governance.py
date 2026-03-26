"""
lims_data_governance — LIMS 历史数据长期治理命令

四项治理任务：
1. audit     — 为 LIMS 来源的关键业务表开启审计日志接入
2. weekly    — 生成周对账报告（LIMS 与新系统差异）
3. archive   — 月度归档（将超过 N 个月的原始记录标记为已归档）
4. check-rbac — 检查 LIMS 历史数据操作权限是否配置正确

用法：
  python manage.py lims_data_governance --action audit
  python manage.py lims_data_governance --action weekly
  python manage.py lims_data_governance --action archive --days 180
  python manage.py lims_data_governance --action check-rbac
  python manage.py lims_data_governance --action all  # 执行全部
"""
import json
import logging
from datetime import timedelta
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('cn_kis.lims.governance')


class Command(BaseCommand):
    help = 'LIMS 历史数据长期治理（审计/对账/归档/权限检查）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--action', type=str,
            choices=['audit', 'weekly', 'archive', 'check-rbac', 'all'],
            default='all',
            help='治理操作类型',
        )
        parser.add_argument(
            '--days', type=int, default=180,
            help='归档阈值（天数），超过此天数的原始记录将被标记为已归档',
        )
        parser.add_argument(
            '--output', type=str, default='',
            help='报告输出路径（可选）',
        )

    def handle(self, *args, **options):
        action = options['action']
        self.stdout.write(f'\n=== LIMS 数据治理: {action} ===')

        if action in ('audit', 'all'):
            self._check_audit_coverage()

        if action in ('weekly', 'all'):
            self._generate_weekly_reconciliation(options.get('output', ''))

        if action in ('archive', 'all'):
            self._archive_old_raw_records(options['days'])

        if action in ('check-rbac', 'all'):
            self._check_rbac_config()

        self.stdout.write(self.style.SUCCESS('\n治理检查完成'))

    # ──────────────────────────────────────────────────────────────────────
    # 1. 审计覆盖检查
    # ──────────────────────────────────────────────────────────────────────

    def _check_audit_coverage(self):
        """检查 LIMS 关键数据是否有审计日志覆盖"""
        self.stdout.write('\n[1/4] 审计日志覆盖检查')
        from apps.audit.models import AuditLog
        from apps.lims_integration.models import LimsInjectionLog

        # 检查最近 7 天的注入是否有审计日志
        since = timezone.now() - timedelta(days=7)
        inj_logs = LimsInjectionLog.objects.filter(
            create_time__gte=since, rolled_back=False
        )
        total_inj = inj_logs.count()

        audit_coverage = {}
        for log in inj_logs.values('module', 'target_table').distinct():
            table = log['target_table']
            # 检查该表是否有对应的 audit log
            has_audit = AuditLog.objects.filter(
                resource_type=table, create_time__gte=since
            ).exists()
            audit_coverage[table] = has_audit

        covered = sum(1 for v in audit_coverage.values() if v)
        total = len(audit_coverage)

        self.stdout.write(f'  最近7天注入记录: {total_inj} 条，涉及 {total} 张表')
        self.stdout.write(f'  审计覆盖: {covered}/{total} 张表')
        for table, covered_flag in audit_coverage.items():
            icon = '✓' if covered_flag else '✗ [需要接入审计]'
            self.stdout.write(f'    {icon} {table}')

        if covered < total:
            self.stdout.write(self.style.WARNING(
                '  建议：在以下表的写操作中接入 apps.audit.services.log_audit()'
            ))
            for table, ok in audit_coverage.items():
                if not ok:
                    self.stdout.write(f'    - {table}')

    # ──────────────────────────────────────────────────────────────────────
    # 2. 周对账报告
    # ──────────────────────────────────────────────────────────────────────

    def _generate_weekly_reconciliation(self, output_path: str = ''):
        """生成 LIMS vs 新系统 周对账报告"""
        self.stdout.write('\n[2/4] 生成周对账报告')
        from apps.lims_integration.models import LimsImportBatch, RawLimsRecord, LimsConflict

        report = {
            'generated_at': timezone.now().isoformat(),
            'period': '最近7天',
            'batches': [],
            'summary': {},
            'pending_conflicts': [],
        }

        # 最近的批次
        batches = LimsImportBatch.objects.order_by('-create_time')[:5]
        for batch in batches:
            raw_count = RawLimsRecord.objects.filter(batch=batch).count()
            injected = RawLimsRecord.objects.filter(batch=batch, injection_status='injected').count()
            conflicts = RawLimsRecord.objects.filter(batch=batch, injection_status='conflict').count()
            pending = RawLimsRecord.objects.filter(batch=batch, injection_status='pending').count()
            failed = RawLimsRecord.objects.filter(batch=batch, injection_status='failed').count()
            report['batches'].append({
                'batch_no': batch.batch_no,
                'status': batch.status,
                'total': raw_count,
                'injected': injected,
                'conflicts': conflicts,
                'pending': pending,
                'failed': failed,
            })

        # 未处理冲突
        pending_conflicts = LimsConflict.objects.filter(
            resolution='pending'
        ).order_by('module')[:50]
        for c in pending_conflicts:
            report['pending_conflicts'].append({
                'id': c.id,
                'module': c.module,
                'lims_id': c.lims_id,
                'conflict_type': c.conflict_type,
                'batch_no': c.batch.batch_no,
            })

        # 汇总
        total_pending = LimsConflict.objects.filter(resolution='pending').count()
        report['summary'] = {
            'total_pending_conflicts': total_pending,
            'total_batches': len(report['batches']),
        }

        # 输出
        if not output_path:
            from apps.lims_integration.lims_exporter import BACKUP_ROOT
            output_path = str(BACKUP_ROOT / f'weekly_reconciliation_{timezone.now().strftime("%Y%m%d")}.json')

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        self.stdout.write(f'  ✓ 对账报告: {output_path}')
        self.stdout.write(f'  总未处理冲突: {total_pending} 条')
        for b in report['batches']:
            self.stdout.write(
                f'  批次 {b["batch_no"]}: '
                f'注入 {b["injected"]}/{b["total"]} | '
                f'冲突 {b["conflicts"]} | '
                f'待处理 {b["pending"]} | 失败 {b["failed"]}'
            )

    # ──────────────────────────────────────────────────────────────────────
    # 3. 原始记录归档
    # ──────────────────────────────────────────────────────────────────────

    def _archive_old_raw_records(self, days: int = 180):
        """将超过 N 天的已注入原始记录标记为已归档"""
        self.stdout.write(f'\n[3/4] 原始记录归档（超过 {days} 天）')
        from apps.lims_integration.models import RawLimsRecord

        cutoff = timezone.now() - timedelta(days=days)
        to_archive = RawLimsRecord.objects.filter(
            injection_status='injected',
            create_time__lt=cutoff,
        )
        count = to_archive.count()
        if count == 0:
            self.stdout.write(f'  ✓ 无需归档（无超过 {days} 天的已注入记录）')
            return

        self.stdout.write(f'  将归档 {count} 条记录（injection_status=injected -> archived）')
        confirm = input('  确认执行归档? [yes/no]: ')
        if confirm.lower() == 'yes':
            updated = to_archive.update(injection_status='archived')
            self.stdout.write(self.style.SUCCESS(f'  ✓ 已归档 {updated} 条记录'))
        else:
            self.stdout.write('  归档已取消')

    # ──────────────────────────────────────────────────────────────────────
    # 4. RBAC 权限检查
    # ──────────────────────────────────────────────────────────────────────

    def _check_rbac_config(self):
        """检查 LIMS 历史数据操作的权限是否配置"""
        self.stdout.write('\n[4/4] RBAC 权限检查')

        # 期望存在的权限
        expected_permissions = [
            ('lims_integration', 'raw_records', 'read', '*', 'LIMS 原始数据查看'),
            ('lims_integration', 'conflicts', 'resolve', '*', 'LIMS 冲突审核'),
            ('lims_integration', 'injection', 'execute', '*', 'LIMS 数据注入执行'),
            ('lims_integration', 'rollback', 'execute', '*', 'LIMS 数据回滚执行'),
            ('lims_integration', 'audit_log', 'read', '*', 'LIMS 审计日志查看'),
        ]

        try:
            from apps.identity.models import Permission

            missing = []
            for module, function, action, scope, desc in expected_permissions:
                exists = Permission.objects.filter(
                    module=module, function=function, action=action
                ).exists()
                icon = '✓' if exists else '✗'
                self.stdout.write(f'  {icon} {module}.{function}.{action} ({desc})')
                if not exists:
                    missing.append((module, function, action, scope, desc))

            if missing:
                self.stdout.write(self.style.WARNING(
                    f'\n  缺少 {len(missing)} 个 LIMS 相关权限，建议在 鹿鸣·治理台 中创建：'
                ))
                for m, f, a, s, d in missing:
                    self.stdout.write(f'  + {m}.{f}.{a} ({d})')

                create = input('\n  是否自动创建这些权限? [yes/no]: ')
                if create.lower() == 'yes':
                    for m, f, a, s, d in missing:
                        Permission.objects.get_or_create(
                            module=m, function=f, action=a,
                            defaults={'scope': s, 'description': d},
                        )
                    self.stdout.write(self.style.SUCCESS(f'  ✓ 已创建 {len(missing)} 个权限'))

        except Exception as ex:
            self.stdout.write(self.style.ERROR(f'  权限检查失败: {ex}'))

        # 检查哪些角色有冲突审核和回滚权限
        self.stdout.write('\n  角色权限配置建议:')
        recommended = [
            ('lims_admin', 'LIMS管理员', ['raw_records.read', 'conflicts.resolve', 'injection.execute', 'rollback.execute', 'audit_log.read']),
            ('qa_reviewer', 'QA审核员', ['raw_records.read', 'conflicts.resolve', 'audit_log.read']),
            ('data_viewer', '数据查看员', ['raw_records.read']),
        ]
        for role_name, label, perms in recommended:
            self.stdout.write(f'  - {label} ({role_name}): {", ".join(perms)}')
