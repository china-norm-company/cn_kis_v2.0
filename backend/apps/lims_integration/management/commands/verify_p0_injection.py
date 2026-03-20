"""
verify_p0_injection — P0 注入效果验证与回滚演练命令

用于测试环境验证以下内容：
1. P0 注入是否按预期填充了各业务表
2. 冲突检测是否正常识别已有数据
3. 三级回滚是否能完整还原

用法：
  # 全流程验证（注入 + 验证 + 可选回滚）
  python manage.py verify_p0_injection --batch 20260318_143000

  # 只验证（不回滚）
  python manage.py verify_p0_injection --batch 20260318_143000 --no-rollback

  # 演练回滚（验证后立即回滚）
  python manage.py verify_p0_injection --batch 20260318_143000 --auto-rollback

  # 生成详细验证报告
  python manage.py verify_p0_injection --batch 20260318_143000 --report
"""
import json
import logging
from pathlib import Path
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger('cn_kis.lims.verify')


class Command(BaseCommand):
    help = 'P0 注入效果验证与回滚演练'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch', type=str, required=True,
            help='要验证的批次号',
        )
        parser.add_argument(
            '--no-rollback', action='store_true', dest='no_rollback',
            help='只验证，不执行回滚',
        )
        parser.add_argument(
            '--auto-rollback', action='store_true', dest='auto_rollback',
            help='验证完成后自动回滚（演练模式）',
        )
        parser.add_argument(
            '--report', action='store_true',
            help='生成详细 HTML 验证报告',
        )
        parser.add_argument(
            '--module', type=str,
            help='只验证特定模块',
        )

    def handle(self, *args, **options):
        from apps.lims_integration.models import LimsImportBatch, LimsInjectionLog, RawLimsRecord

        batch_no = options['batch']
        batch = LimsImportBatch.objects.filter(batch_no=batch_no).first()
        if not batch:
            raise CommandError(f'批次不存在: {batch_no}')

        self.stdout.write(f'\n=== P0 注入验证：批次 {batch_no} ===')
        self.stdout.write(f'批次状态: {batch.status}')
        self.stdout.write(f'总记录数: {batch.total_records}')

        # ── 验证注入日志 ────────────────────────────────────────────────
        module_filter = options.get('module')
        inj_qs = LimsInjectionLog.objects.filter(batch=batch, rolled_back=False)
        if module_filter:
            inj_qs = inj_qs.filter(module=module_filter)

        total_injected = inj_qs.count()
        by_action = {}
        by_module = {}
        for log in inj_qs:
            by_action[log.action] = by_action.get(log.action, 0) + 1
            mod = log.module
            by_module.setdefault(mod, {'created': 0, 'updated': 0, 'failed': 0})
            by_module[mod][log.action] = by_module[mod].get(log.action, 0) + 1

        self.stdout.write(f'\n[注入日志汇总]')
        self.stdout.write(f'  总注入: {total_injected} 条')
        for action, cnt in by_action.items():
            self.stdout.write(f'  {action}: {cnt} 条')

        self.stdout.write(f'\n[按模块]')
        for mod, counts in by_module.items():
            self.stdout.write(
                f'  {mod:<30} 新建:{counts.get("created", 0):>5} 更新:{counts.get("updated", 0):>5}'
            )

        # ── 验证业务表是否实际有数据 ─────────────────────────────────────
        self.stdout.write('\n[业务表数据验证]')
        checks = self._check_business_tables(batch, inj_qs)
        for check in checks:
            icon = '✓' if check['pass'] else '✗'
            self.stdout.write(f'  {icon} {check["label"]}: {check["detail"]}')

        # ── 冲突统计 ─────────────────────────────────────────────────────
        from apps.lims_integration.models import LimsConflict
        conflicts = LimsConflict.objects.filter(batch=batch)
        total_conflicts = conflicts.count()
        pending_conflicts = conflicts.filter(resolution='pending').count()
        self.stdout.write(f'\n[冲突统计]')
        self.stdout.write(f'  总冲突: {total_conflicts} 条')
        self.stdout.write(f'  待审核: {pending_conflicts} 条')
        by_type = {}
        for c in conflicts.values('conflict_type'):
            t = c['conflict_type']
            by_type[t] = by_type.get(t, 0) + 1
        for t, cnt in by_type.items():
            self.stdout.write(f'  {t}: {cnt} 条')

        # ── 生成报告 ─────────────────────────────────────────────────────
        if options.get('report'):
            report_path = self._generate_report(batch, checks, by_module, by_type)
            self.stdout.write(self.style.SUCCESS(f'\n验证报告: {report_path}'))

        # ── 回滚演练 ─────────────────────────────────────────────────────
        if options.get('auto_rollback') and not options.get('no_rollback'):
            self.stdout.write('\n[回滚演练]')
            confirm = input('确认执行回滚演练？此操作会删除/还原所有注入数据 [yes/no]: ')
            if confirm.lower() == 'yes':
                from django.core.management import call_command
                call_command('rollback_lims_import',
                             batch=batch_no,
                             force=True,
                             dry_run=False)
                self.stdout.write(self.style.SUCCESS('回滚演练完成'))
            else:
                self.stdout.write('回滚演练已取消')
        elif not options.get('no_rollback') and not options.get('auto_rollback'):
            self.stdout.write('\n提示: 运行 --auto-rollback 执行回滚演练，--no-rollback 跳过回滚')

        self.stdout.write(self.style.SUCCESS('\n验证完成'))

    def _check_business_tables(self, batch, inj_qs):
        """检查注入日志对应的业务表记录是否实际存在"""
        checks = []
        from django.apps import apps as django_apps

        # 按 target_table 分组
        table_ids = {}
        for log in inj_qs:
            table = log.target_table
            table_ids.setdefault(table, set()).add(log.target_id)

        for table_name, ids in table_ids.items():
            # 找到对应的 model
            model = None
            for app_config in django_apps.get_app_configs():
                for m in app_config.get_models():
                    if m._meta.db_table == table_name:
                        model = m
                        break
                if model:
                    break

            if not model:
                checks.append({
                    'pass': False,
                    'label': table_name,
                    'detail': 'model 未找到',
                })
                continue

            existing_count = model.objects.filter(id__in=ids).count()
            expected = len(ids)
            pass_flag = existing_count == expected
            checks.append({
                'pass': pass_flag,
                'label': table_name,
                'detail': f'{existing_count}/{expected} 条记录存在',
            })

        return checks

    def _generate_report(self, batch, checks, by_module, conflict_by_type) -> str:
        """生成 HTML 验证报告"""
        from apps.lims_integration.lims_exporter import BACKUP_ROOT
        report_path = str(BACKUP_ROOT / batch.batch_no / 'verification_report.html')
        Path(report_path).parent.mkdir(parents=True, exist_ok=True)

        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        pass_count = sum(1 for c in checks if c['pass'])
        fail_count = sum(1 for c in checks if not c['pass'])

        checks_html = '\n'.join(
            f'<tr><td>{"✓" if c["pass"] else "✗"}</td>'
            f'<td class="{"pass" if c["pass"] else "fail"}">{c["label"]}</td>'
            f'<td>{c["detail"]}</td></tr>'
            for c in checks
        )
        modules_html = '\n'.join(
            f'<tr><td>{mod}</td><td>{counts.get("created",0)}</td>'
            f'<td>{counts.get("updated",0)}</td></tr>'
            for mod, counts in by_module.items()
        )

        html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8">
<title>P0 注入验证报告 - {batch.batch_no}</title>
<style>
body {{ font-family: "Microsoft YaHei", Arial; margin: 20px; }}
h1 {{ color: #2c3e50; }}
table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
th {{ background: #3498db; color: white; padding: 8px; }}
td {{ padding: 8px; border-bottom: 1px solid #ddd; }}
.pass {{ color: #27ae60; font-weight: bold; }}
.fail {{ color: #e74c3c; font-weight: bold; }}
.stat-card {{ display: inline-block; background: #f8f9fa; border-radius: 8px;
             padding: 15px 25px; margin: 10px; text-align: center; }}
.stat-card .num {{ font-size: 28px; font-weight: bold; color: #3498db; }}
</style></head>
<body>
<h1>P0 注入验证报告</h1>
<p>批次号: <strong>{batch.batch_no}</strong> | 生成时间: {now}</p>

<h2>验证汇总</h2>
<div>
  <div class="stat-card"><div class="num">{batch.total_records}</div>原始记录</div>
  <div class="stat-card"><div class="num">{batch.injected_records}</div>已注入</div>
  <div class="stat-card"><div class="num" style="color:#e74c3c">{batch.conflict_count}</div>冲突</div>
  <div class="stat-card"><div class="num" style="color:{"#27ae60" if fail_count==0 else "#e74c3c"}">{pass_count}/{pass_count+fail_count}</div>业务表检查通过</div>
</div>

<h2>业务表数据检查</h2>
<table>
  <tr><th>状态</th><th>表名</th><th>详情</th></tr>
  {checks_html}
</table>

<h2>按模块注入明细</h2>
<table>
  <tr><th>模块</th><th>新建</th><th>更新</th></tr>
  {modules_html}
</table>

<h2>操作建议</h2>
<ul>
  <li>如有冲突待审核: <code>python manage.py fetch_lims_data --resolve-conflicts --batch {batch.batch_no}</code></li>
  <li>查看冲突报告: <code>python manage.py fetch_lims_data --diff-only --batch {batch.batch_no}</code></li>
  <li>全量回滚: <code>python manage.py rollback_lims_import --batch {batch.batch_no} --dry-run</code></li>
</ul>
</body></html>'''

        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(html)
        return report_path
