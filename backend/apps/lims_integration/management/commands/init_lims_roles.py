"""
init_lims_roles — 初始化 LIMS 业务所需的角色与权限种子

此命令必须在 LIMS 人员注入之前执行，确保以下角色已在 identity.Role 中存在：
- evaluator         衡技·评估台 (仪器操作员、评估员)
- clinical_executor 维周·执行台 (临床研究协调员)
- researcher        采苓·研究台 (研究员)
- receptionist      和序·接待台 (接待员)
- technician        器衡·设备台 + 度支·物料台 + 坤元·设施台
- qa                怀瑾·质量台 (质量管理员)
- sales             进思·客户台 (销售/客户经理)
- admin             鹿鸣·治理台 (系统管理员)
- lab_personnel     共济·人员台 (实验室人事管理员)
- hr                时雨·人事台 (人事管理员)
- viewer            所有台的只读访客

用法：
  python manage.py init_lims_roles
  python manage.py init_lims_roles --check-only
"""
from django.core.management.base import BaseCommand
from django.db import transaction


# 完整角色定义：name, display_name, level, category, description
LIMS_ROLE_SEEDS = [
    # ── 一线运营角色 ──────────────────────────────────────────────────────
    {
        'name': 'evaluator',
        'display_name': '评估员',
        'level': 3,
        'category': 'operation',
        'description': '仪器操作员/医学评估员，可使用衡技·评估台执行检测工单',
        'workstations': ['evaluator'],
    },
    {
        'name': 'clinical_executor',
        'display_name': '临床执行员',
        'level': 3,
        'category': 'operation',
        'description': '临床研究协调员(CRC)，负责维周·执行台工单排程与执行',
        'workstations': ['execution'],
    },
    {
        'name': 'receptionist',
        'display_name': '接待员',
        'level': 2,
        'category': 'operation',
        'description': '受试者接待，使用和序·接待台办理接待流程',
        'workstations': ['reception'],
    },
    {
        'name': 'researcher',
        'display_name': '研究员',
        'level': 4,
        'category': 'technical',
        'description': '功效研究员，使用采苓·研究台管理方案和项目',
        'workstations': ['research'],
    },
    {
        'name': 'technician',
        'display_name': '技术员',
        'level': 3,
        'category': 'technical',
        'description': '设备/物料/设施管理员，使用器衡·设备台、度支·物料台、坤元·设施台',
        'workstations': ['equipment', 'material', 'facility'],
    },
    {
        'name': 'qa',
        'display_name': '质量管理员',
        'level': 4,
        'category': 'operation',
        'description': '质量管理，使用怀瑾·质量台管理偏差/CAPA/SOP/审计',
        'workstations': ['quality'],
    },
    {
        'name': 'sales',
        'display_name': '销售/客户经理',
        'level': 3,
        'category': 'operation',
        'description': '客户关系管理，使用进思·客户台管理客户档案与商机',
        'workstations': ['crm'],
    },
    {
        'name': 'recruiter',
        'display_name': '招募专员',
        'level': 2,
        'category': 'operation',
        'description': '受试者招募，使用招招·招募台管理招募流程',
        'workstations': ['recruitment'],
    },
    # ── 管理支持角色 ──────────────────────────────────────────────────────
    {
        'name': 'hr',
        'display_name': '人事管理员',
        'level': 4,
        'category': 'management',
        'description': '公司人力资源管理，使用时雨·人事台',
        'workstations': ['hr'],
    },
    {
        'name': 'lab_personnel',
        'display_name': '实验室人事管理员',
        'level': 4,
        'category': 'management',
        'description': '实验室人员资质与排班管理，使用共济·人员台',
        'workstations': ['lab-personnel'],
    },
    {
        'name': 'finance',
        'display_name': '财务人员',
        'level': 4,
        'category': 'management',
        'description': '财务管理，使用管仲·财务台',
        'workstations': ['finance'],
    },
    {
        'name': 'admin',
        'display_name': '系统管理员',
        'level': 7,
        'category': 'management',
        'description': '系统治理与账号权限管理，使用鹿鸣·治理台',
        'workstations': ['admin'],
    },
    # ── 基础角色 ──────────────────────────────────────────────────────────
    {
        'name': 'viewer',
        'display_name': '只读访客',
        'level': 1,
        'category': 'support',
        'description': '所有工作台只读权限',
        'workstations': ['secretary'],
    },
    {
        'name': 'project_manager',
        'display_name': '项目经理',
        'level': 5,
        'category': 'management',
        'description': '项目管理，可管理协议、工单排程、团队',
        'workstations': ['research', 'execution'],
    },
]

# 各角色对应的基础权限列表（module.function.action）
ROLE_PERMISSIONS = {
    'evaluator': [
        'workorder.workorder.read',
        'workorder.workorder.execute',
        'workorder.workorder.complete',
        'resource.equipment.read',
        'resource.calibration.read',
        'subject.subject.read',
        'sample.product.read',
    ],
    'clinical_executor': [
        'workorder.workorder.read',
        'workorder.workorder.assign',
        'workorder.workorder.create',
        'protocol.protocol.read',
        'subject.subject.read',
        'resource.equipment.read',
        'scheduling.schedule.read',
        'scheduling.schedule.create',
    ],
    'receptionist': [
        'subject.subject.read',
        'subject.checkin.create',
        'workorder.workorder.read',
        'sample.product.read',
        'protocol.protocol.read',
    ],
    'researcher': [
        'protocol.protocol.read',
        'protocol.protocol.create',
        'protocol.protocol.update',
        'proposal.proposal.read',
        'proposal.proposal.create',
        'resource.method.read',
        'crm.client.read',
    ],
    'technician': [
        'resource.equipment.read',
        'resource.equipment.create',
        'resource.equipment.update',
        'resource.calibration.read',
        'resource.calibration.create',
        'resource.maintenance.read',
        'resource.maintenance.create',
        'resource.authorization.read',
        'resource.authorization.create',
        'sample.material.read',
        'sample.material.create',
    ],
    'qa': [
        'quality.deviation.read',
        'quality.deviation.create',
        'quality.capa.read',
        'quality.capa.create',
        'quality.sop.read',
        'quality.sop.create',
        'quality.audit.read',
        'resource.calibration.read',
    ],
    'sales': [
        'crm.client.read',
        'crm.client.create',
        'crm.client.update',
        'crm.opportunity.read',
        'crm.opportunity.create',
        'protocol.protocol.read',
    ],
    'hr': [
        'hr.staff.read',
        'hr.staff.create',
        'hr.staff.update',
        'hr.training.read',
        'hr.training.create',
    ],
    'lab_personnel': [
        'hr.staff.read',
        'lab_personnel.profile.read',
        'lab_personnel.profile.update',
        'lab_personnel.qualification.read',
        'lab_personnel.qualification.create',
        'resource.authorization.read',
        'scheduling.schedule.read',
    ],
    'admin': [
        'identity.account.*',
        'identity.role.*',
        'identity.permission.*',
    ],
    'viewer': [
        'secretary.dashboard.read',
    ],
    'project_manager': [
        'protocol.protocol.*',
        'workorder.workorder.*',
        'scheduling.schedule.*',
        'subject.enrollment.read',
    ],
    'finance': [
        'finance.invoice.read',
        'finance.invoice.create',
        'finance.contract.read',
    ],
    'recruiter': [
        'subject.subject.read',
        'subject.subject.create',
        'recruitment.plan.read',
        'recruitment.plan.create',
    ],
}


class Command(BaseCommand):
    help = 'LIMS 业务所需角色与权限种子初始化'

    def add_arguments(self, parser):
        parser.add_argument(
            '--check-only', action='store_true',
            help='只检查，不创建',
        )
        parser.add_argument(
            '--with-permissions', action='store_true',
            help='同时创建角色对应的基础权限',
        )

    def handle(self, *args, **options):
        check_only = options['check_only']
        with_perms = options['with_permissions']

        self.stdout.write('=== LIMS 业务角色初始化 ===')
        self._init_roles(check_only)
        if with_perms:
            self._init_permissions(check_only)
        self.stdout.write(self.style.SUCCESS('\n角色种子初始化完成'))

    def _init_roles(self, check_only: bool):
        from apps.identity.models import Role
        self.stdout.write('\n[角色种子]')
        created = 0
        existing = 0
        for seed in LIMS_ROLE_SEEDS:
            name = seed['name']
            if Role.objects.filter(name=name).exists():
                self.stdout.write(f'  ✓ {name} ({seed["display_name"]}) 已存在')
                existing += 1
                continue
            if check_only:
                self.stdout.write(self.style.WARNING(f'  ✗ {name} 缺失'))
                continue
            with transaction.atomic():
                Role.objects.create(
                    name=name,
                    display_name=seed['display_name'],
                    level=seed['level'],
                    category=seed['category'],
                    description=seed['description'],
                    is_system=True,
                    is_active=True,
                )
            self.stdout.write(self.style.SUCCESS(f'  + 创建: {name} ({seed["display_name"]})'))
            created += 1
        self.stdout.write(f'  创建 {created} 个，已存在 {existing} 个')

    def _init_permissions(self, check_only: bool):
        from apps.identity.models import Role, Permission, RolePermission
        self.stdout.write('\n[权限初始化]')
        for role_name, perms in ROLE_PERMISSIONS.items():
            role = Role.objects.filter(name=role_name).first()
            if not role:
                self.stdout.write(self.style.WARNING(f'  ✗ 角色 {role_name} 不存在，跳过权限'))
                continue
            for perm_code in perms:
                parts = perm_code.split('.')
                if len(parts) < 3:
                    continue
                module, function, action = parts[0], parts[1], parts[2] if parts[2] != '*' else '*'
                perm, _ = Permission.objects.get_or_create(
                    module=module,
                    function=function,
                    action=action,
                    defaults={'scope': '*', 'description': perm_code},
                )
                if not check_only:
                    RolePermission.objects.get_or_create(role=role, permission=perm)
        self.stdout.write('  权限绑定完成')
