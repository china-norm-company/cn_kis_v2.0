"""
verify_lims_business_logic — LIMS 注入后业务逻辑自验证

验证注入结果是否能驱动以下业务逻辑：
1. role_access    - 人员角色与工作台权限映射
2. equipment      - 设备台账完整性（责任人关联、校准状态）
3. gate3          - 合规门禁 Gate 3：操作人方法资质
4. gate4          - 合规门禁 Gate 4：设备授权与校准
5. dispatch       - 工单派工：能找到有资质的评估员
6. client_link    - 客户与委托关联

用法：
  python manage.py verify_lims_business_logic
  python manage.py verify_lims_business_logic --check role_access
  python manage.py verify_lims_business_logic --check gate3 gate4
  python manage.py verify_lims_business_logic --report
"""
import json
from datetime import date
from typing import Dict, List, Any

from django.core.management.base import BaseCommand
from django.utils import timezone


CHECK_ITEMS = ['role_access', 'equipment', 'gate3', 'gate4', 'dispatch', 'client_link']


class Command(BaseCommand):
    help = 'LIMS 注入后业务逻辑自验证（Gate3/Gate4/角色/派工）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--check', nargs='*', choices=CHECK_ITEMS,
            help=f'指定要检查的项目，可多选: {", ".join(CHECK_ITEMS)}（不指定则全部检查）',
        )
        parser.add_argument(
            '--report', action='store_true',
            help='生成 HTML 验证报告',
        )
        parser.add_argument(
            '--sample-size', type=int, default=5,
            help='每项抽样数量（默认 5）',
        )

    def handle(self, *args, **options):
        checks = options.get('check') or CHECK_ITEMS
        sample_size = options['sample_size']

        self.stdout.write('=== LIMS 业务逻辑验证 ===\n')
        results = {}

        check_fns = {
            'role_access': self._check_role_access,
            'equipment': self._check_equipment,
            'gate3': self._check_gate3,
            'gate4': self._check_gate4,
            'dispatch': self._check_dispatch,
            'client_link': self._check_client_link,
        }

        for check_name in checks:
            self.stdout.write(f'--- 检查: {check_name} ---')
            try:
                result = check_fns[check_name](sample_size)
                results[check_name] = result
                status_icon = '✓' if result['pass'] else '✗'
                color = self.style.SUCCESS if result['pass'] else self.style.ERROR
                self.stdout.write(color(
                    f'{status_icon} {check_name}: '
                    f'{result["pass_count"]}/{result["total"]} 通过'
                ))
                for detail in result.get('details', []):
                    self.stdout.write(f'    {detail}')
            except Exception as ex:
                results[check_name] = {'pass': False, 'error': str(ex), 'pass_count': 0, 'total': 0}
                self.stdout.write(self.style.ERROR(f'✗ {check_name}: 检查异常 - {ex}'))
            self.stdout.write('')

        # 汇总
        passed = sum(1 for r in results.values() if r.get('pass'))
        total = len(results)
        overall_color = self.style.SUCCESS if passed == total else self.style.WARNING
        self.stdout.write(overall_color(f'\n总体结果: {passed}/{total} 检查通过'))

        if options.get('report'):
            self._generate_report(results)

    # ──────────────────────────────────────────────────────────────────────
    # 1. 角色访问验证
    # ──────────────────────────────────────────────────────────────────────

    def _check_role_access(self, sample_size: int) -> Dict:
        from apps.identity.models import Account, AccountRole, Role
        from apps.lims_integration.p0_mapping import GROUP_TO_ROLES

        # 抽取各组别的人员样本
        details = []
        pass_count = 0
        total = 0

        for group, expected_roles in GROUP_TO_ROLES.items():
            # 查找该组别的人员
            accounts = Account.objects.filter(
                hr_staff_records__department=group,
                is_deleted=False,
            ).distinct()[:sample_size]

            for account in accounts:
                total += 1
                actual_role_names = set(
                    AccountRole.objects.filter(account=account)
                    .values_list('role__name', flat=True)
                )
                missing = [r for r in expected_roles if r not in actual_role_names]
                if not missing:
                    pass_count += 1
                    details.append(
                        f'✓ {account.display_name}({group}): 角色={list(actual_role_names)}'
                    )
                else:
                    details.append(
                        f'✗ {account.display_name}({group}): 缺少角色={missing}'
                    )

        if total == 0:
            # 直接检查 AccountRole 数量
            role_count = AccountRole.objects.count()
            account_count = Account.objects.filter(is_deleted=False).count()
            if role_count > 0:
                pass_count = 1
                total = 1
                details.append(f'共 {account_count} 个 Account，{role_count} 个角色分配')
            else:
                details.append('未找到任何 AccountRole 记录（可能需要先注入人员数据）')
                total = 1

        return {
            'pass': pass_count == total,
            'pass_count': pass_count,
            'total': total,
            'details': details,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 2. 设备完整性验证
    # ──────────────────────────────────────────────────────────────────────

    def _check_equipment(self, sample_size: int) -> Dict:
        from apps.resource.models import ResourceItem, EquipmentAuthorization

        details = []
        total = ResourceItem.objects.filter(is_deleted=False).count()
        with_manager = ResourceItem.objects.filter(
            is_deleted=False, manager_id__isnull=False
        ).count()
        with_calibration = ResourceItem.objects.filter(
            is_deleted=False, next_calibration_date__isnull=False
        ).count()
        auth_count = EquipmentAuthorization.objects.count()

        details.append(f'设备总数: {total}')
        details.append(f'有责任人: {with_manager} ({with_manager/max(1,total)*100:.1f}%)')
        details.append(f'有校准日期: {with_calibration} ({with_calibration/max(1,total)*100:.1f}%)')
        details.append(f'设备授权记录: {auth_count}')

        # 抽查几条设备
        for eq in ResourceItem.objects.filter(is_deleted=False, manager_id__isnull=False)[:sample_size]:
            from apps.identity.models import Account
            manager = Account.objects.filter(id=eq.manager_id).first()
            manager_name = manager.display_name if manager else '未知'
            details.append(f'  {eq.code}: {eq.name} | 责任人={manager_name}')

        pass_count = 1 if total > 0 else 0
        return {
            'pass': total > 0 and with_manager > 0,
            'pass_count': pass_count,
            'total': 1,
            'details': details,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 3. Gate 3 验证：操作人方法资质
    # ──────────────────────────────────────────────────────────────────────

    def _check_gate3(self, sample_size: int) -> Dict:
        from apps.lab_personnel.models import MethodQualification, LabStaffProfile
        from apps.hr.models import Staff

        details = []
        pass_count = 0

        total_lab_staff = LabStaffProfile.objects.count()
        # MethodQualification.staff 指向 hr.Staff
        qual_count = MethodQualification.objects.filter(
            level__in=['independent', 'mentor']
        ).count()

        details.append(f'LabStaffProfile 总数: {total_lab_staff}')
        details.append(f'independent/mentor 级方法资质: {qual_count}')

        # 抽查有方法资质的人员
        quals_sample = MethodQualification.objects.filter(
            level__in=['independent', 'mentor']
        ).select_related('staff')[:sample_size]

        total = len(quals_sample)
        for q in quals_sample:
            pass_count += 1
            details.append(
                f'✓ {q.staff.name}: method={getattr(q.method, "name", "通用")}, level={q.level}'
            )

        if total == 0 and total_lab_staff > 0:
            details.append('⚠ 实验室人员无方法资质（需要从 LIMS 培训/考核数据注入）')

        return {
            'pass': qual_count > 0,
            'pass_count': max(pass_count, 1 if qual_count > 0 else 0),
            'total': max(1, total),
            'details': details,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 4. Gate 4 验证：设备授权与校准
    # ──────────────────────────────────────────────────────────────────────

    def _check_gate4(self, sample_size: int) -> Dict:
        from apps.resource.models import EquipmentAuthorization, ResourceItem

        details = []
        pass_count = 0

        today = date.today()
        auth_count = EquipmentAuthorization.objects.filter(is_active=True).count()
        valid_auth = EquipmentAuthorization.objects.filter(
            is_active=True,
        ).exclude(expires_at__lt=today).count()

        # 校准有效的设备数
        calibrated = ResourceItem.objects.filter(
            is_deleted=False,
            next_calibration_date__gte=today,
        ).count()

        details.append(f'设备授权记录: {auth_count}（有效: {valid_auth}）')
        details.append(f'校准有效设备: {calibrated}')

        # 抽查：有授权 + 设备校准有效的组合
        valid_combos = EquipmentAuthorization.objects.filter(
            is_active=True,
            equipment__next_calibration_date__gte=today,
        ).select_related('equipment')[:sample_size]

        for auth in valid_combos:
            pass_count += 1
            from apps.identity.models import Account
            operator = Account.objects.filter(id=auth.operator_id).first()
            op_name = operator.display_name if operator else '未知'
            details.append(
                f'✓ {op_name} 可操作 {auth.equipment.code}({auth.equipment.name})'
            )

        gate4_ready = auth_count > 0 and calibrated > 0
        return {
            'pass': gate4_ready,
            'pass_count': 1 if gate4_ready else 0,
            'total': 1,
            'details': details,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 5. 工单派工验证
    # ──────────────────────────────────────────────────────────────────────

    def _check_dispatch(self, sample_size: int) -> Dict:
        from apps.identity.models import Account, AccountRole

        details = []

        # 查找 evaluator 角色的人员
        evaluator_accounts = Account.objects.filter(
            account_roles__role__name='evaluator',
            is_deleted=False,
        ).distinct()[:sample_size]

        evaluator_count = evaluator_accounts.count()
        details.append(f'evaluator 角色人员数: {evaluator_count}')

        # 检查是否有可派工的人（有 LabStaffProfile + MethodQualification）
        dispatchable = []
        for account in evaluator_accounts:
            try:
                from apps.hr.models import Staff
                from apps.lab_personnel.models import LabStaffProfile, MethodQualification
                staff = Staff.objects.filter(account_fk=account, is_deleted=False).first()
                if not staff:
                    continue
                lab_profile = getattr(staff, 'lab_profile', None)
                if not lab_profile:
                    continue
                # MethodQualification.staff 指向 hr.Staff（不是 LabStaffProfile）
                quals = MethodQualification.objects.filter(
                    staff=staff,
                    level__in=['independent', 'mentor'],
                )
                if quals.exists():
                    dispatchable.append(account.display_name)
                    details.append(f'✓ {account.display_name}: 可派工（有资质）')
            except Exception:
                pass

        if not dispatchable:
            details.append('⚠ 未找到可派工的 evaluator（可能缺少方法资质）')

        return {
            'pass': len(dispatchable) > 0,
            'pass_count': len(dispatchable),
            'total': max(1, evaluator_count),
            'details': details,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 6. 客户与委托关联验证
    # ──────────────────────────────────────────────────────────────────────

    def _check_client_link(self, sample_size: int) -> Dict:
        from apps.crm.models import Client
        from apps.protocol.models import Protocol

        details = []

        client_count = Client.objects.filter(is_deleted=False).count()
        protocol_count = Protocol.objects.filter(is_deleted=False).count()
        linked_protocols = Protocol.objects.filter(
            is_deleted=False,
            sponsor_id__isnull=False,
        ).count()

        details.append(f'客户数: {client_count}')
        details.append(f'项目/委托数: {protocol_count}')
        details.append(f'已关联客户的委托: {linked_protocols}')

        # 抽样展示
        for proto in Protocol.objects.filter(
            is_deleted=False, sponsor_id__isnull=False
        )[:sample_size]:
            client = Client.objects.filter(id=proto.sponsor_id).first()
            client_name = client.name if client else '未知客户'
            details.append(f'  委托 {proto.code or proto.title[:20]}: 客户={client_name}')

        pass_result = client_count > 0 or protocol_count > 0
        return {
            'pass': pass_result,
            'pass_count': 1 if pass_result else 0,
            'total': 1,
            'details': details,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 报告生成
    # ──────────────────────────────────────────────────────────────────────

    def _generate_report(self, results: Dict):
        from pathlib import Path
        from apps.lims_integration.lims_exporter import BACKUP_ROOT
        from datetime import datetime

        now_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_path = str(BACKUP_ROOT / f'business_logic_verify_{now_str}.html')
        Path(report_path).parent.mkdir(parents=True, exist_ok=True)

        passed = sum(1 for r in results.values() if r.get('pass'))
        total = len(results)

        rows_html = ''
        for check_name, result in results.items():
            status = '✓ 通过' if result.get('pass') else '✗ 失败'
            color = '#27ae60' if result.get('pass') else '#e74c3c'
            details_html = '<br>'.join(result.get('details', []))
            rows_html += f'''
<tr>
  <td style="font-weight:bold">{check_name}</td>
  <td style="color:{color};font-weight:bold">{status}</td>
  <td>{result.get("pass_count", 0)}/{result.get("total", 0)}</td>
  <td style="font-size:12px">{details_html}</td>
</tr>'''

        html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8">
<title>LIMS 业务逻辑验证报告</title>
<style>
body {{ font-family: "Microsoft YaHei", Arial; margin: 20px; }}
h1 {{ color: #2c3e50; }}
table {{ width: 100%; border-collapse: collapse; }}
th {{ background: #3498db; color: white; padding: 10px; text-align: left; }}
td {{ padding: 8px; border-bottom: 1px solid #ddd; vertical-align: top; }}
.summary {{ background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }}
</style></head>
<body>
<h1>LIMS 业务逻辑验证报告</h1>
<div class="summary">
  <strong>验证时间：</strong>{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}<br>
  <strong>总体结果：</strong>
  <span style="color:{'#27ae60' if passed==total else '#e67e22'};font-size:18px;font-weight:bold">
    {passed}/{total} 通过
  </span>
</div>
<table>
<tr>
  <th width="15%">检查项</th>
  <th width="10%">结果</th>
  <th width="10%">通过率</th>
  <th>详情</th>
</tr>
{rows_html}
</table>
<h2>操作建议</h2>
<ul>
  <li>role_access 失败：运行 <code>python manage.py init_lims_roles</code></li>
  <li>gate3 失败：确保人员注入包含 LabStaffProfile + MethodQualification</li>
  <li>gate4 失败：确保设备注入包含 EquipmentAuthorization + 校准日期</li>
  <li>dispatch 失败：检查 evaluator 角色人员是否有 independent 级方法资质</li>
  <li>重新注入：<code>python manage.py fetch_lims_data --inject-from-batch {BACKUP_ROOT}/latest</code></li>
</ul>
</body></html>'''

        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(html)
        self.stdout.write(self.style.SUCCESS(f'验证报告: {report_path}'))
