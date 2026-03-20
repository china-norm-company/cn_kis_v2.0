"""
根据「项目全链路」现有数据，为研究台「方案准备」「我的协议」「我的访视」生成联动数据

将 project_full_link 中的项目+方案同步为：
  - protocol（t_protocol）
  - proposal（t_proposal + t_proposal_checklist）
  - visit_plan（t_visit_plan + t_visit_node + t_visit_activity）

支持两种模式：
  1. 指定 account_id：生成数据归属该账号（个人可见）
  2. 不指定 account_id：created_by_id=None，配合 DEBUG 模式所有人可见

Usage:
    # 不指定账号 — 所有人可见（与项目全链路权限一致）
    python manage.py seed_research_from_project_full_link

    # 指定账号 — 仅该账号可见
    python manage.py seed_research_from_project_full_link 161
    python manage.py seed_research_from_project_full_link --username feishu_1a88556e461c97a5

    # 无项目全链路数据时先种项目再同步
    python manage.py seed_research_from_project_full_link --seed-projects

    # 协议/方案已存在但归属其他账号时，改归属为指定账号
    python manage.py seed_research_from_project_full_link 161 --force
"""
from django.core.management.base import BaseCommand
from django.db import OperationalError

from apps.project_full_link.models import Project, ProjectProtocol
from apps.protocol.models import Protocol
from apps.proposal.models import Proposal
from apps.proposal.services import _init_checklist
from apps.visit.models import VisitPlan, VisitPlanStatus, VisitNode, VisitActivity, ActivityType


MOCK_VISIT_PLANS = {
    'PRJ-2025-001': {
        'visits': [
            {
                'visit_code': 'V0', 'visit_name': '基线访视',
                'visit_day': 0, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['知情同意签署', '皮肤状态初评', 'Corneometer 水分检测', 'TEWL 经皮水分流失测试', 'VISIA-CR 全脸拍照'],
            },
            {
                'visit_code': 'V1', 'visit_name': '第2周随访',
                'visit_day': 14, 'visit_window_min': -3, 'visit_window_max': 3,
                'procedures': ['Corneometer 水分检测', 'TEWL 经皮水分流失测试', 'VISIA-CR 全脸拍照', '不良反应观察'],
            },
            {
                'visit_code': 'V2', 'visit_name': '第4周结束访视',
                'visit_day': 28, 'visit_window_min': -3, 'visit_window_max': 3,
                'procedures': ['Corneometer 水分检测', 'TEWL 经皮水分流失测试', 'VISIA-CR 全脸拍照', '皮肤科医生终评', '受试者满意度问卷'],
            },
        ],
    },
    'PRJ-2025-002': {
        'visits': [
            {
                'visit_code': 'V0', 'visit_name': '样品接收与基线检测',
                'visit_day': 0, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['样品登记', 'SPF 体内法紫外照射', 'UVA-PFA 测定'],
            },
            {
                'visit_code': 'V1', 'visit_name': '结果判读',
                'visit_day': 1, 'visit_window_min': 0, 'visit_window_max': 1,
                'procedures': ['MED 最小红斑量判读', 'MPPD 判读', '临界波长测定', '数据记录与拍照'],
            },
        ],
    },
    'PRJ-2025-003': {
        'visits': [
            {
                'visit_code': 'V0', 'visit_name': '基线访视',
                'visit_day': 0, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['监护人知情同意签署', '皮肤初评', '斑贴试验贴敷'],
            },
            {
                'visit_code': 'V1', 'visit_name': '48h 判读',
                'visit_day': 2, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['斑贴去除', '48h 反应判读', '皮肤拍照'],
            },
            {
                'visit_code': 'V2', 'visit_name': '72h 判读',
                'visit_day': 3, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['72h 反应判读', '皮肤拍照', '安全性总评'],
            },
        ],
    },
    'PRJ-2024-012': {
        'visits': [
            {
                'visit_code': 'V0', 'visit_name': '基线访视',
                'visit_day': 0, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['知情同意签署', 'VISIA-CR 色斑拍照', 'Mexameter 黑色素/红斑测量', '皮肤科医师评估'],
            },
            {
                'visit_code': 'V1', 'visit_name': '第4周随访',
                'visit_day': 28, 'visit_window_min': -3, 'visit_window_max': 3,
                'procedures': ['VISIA-CR 色斑拍照', 'Mexameter 黑色素/红斑测量', '不良反应观察'],
            },
            {
                'visit_code': 'V2', 'visit_name': '第8周随访',
                'visit_day': 56, 'visit_window_min': -3, 'visit_window_max': 3,
                'procedures': ['VISIA-CR 色斑拍照', 'Mexameter 黑色素/红斑测量', '不良反应观察'],
            },
            {
                'visit_code': 'V3', 'visit_name': '第12周结束访视',
                'visit_day': 84, 'visit_window_min': -3, 'visit_window_max': 3,
                'procedures': ['VISIA-CR 色斑拍照', 'Mexameter 黑色素/红斑测量', '皮肤科医师终评', '受试者自评问卷'],
            },
        ],
    },
    'PRJ-2025-004': {
        'visits': [
            {
                'visit_code': 'V0', 'visit_name': '基线访视',
                'visit_day': 0, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['知情同意签署', '头皮皮脂 Sebumeter 检测', '头发蓬松度拍照基线'],
            },
            {
                'visit_code': 'V1', 'visit_name': '第2周随访',
                'visit_day': 14, 'visit_window_min': -2, 'visit_window_max': 2,
                'procedures': ['Sebumeter 控油检测', '头发蓬松度拍照', '受试者自评'],
            },
            {
                'visit_code': 'V2', 'visit_name': '第4周结束访视',
                'visit_day': 28, 'visit_window_min': -2, 'visit_window_max': 2,
                'procedures': ['Sebumeter 控油检测', '头发蓬松度拍照', '发质改善专家评估', '受试者满意度问卷'],
            },
        ],
    },
    'PRJ-2025-005': {
        'visits': [
            {
                'visit_code': 'V0', 'visit_name': '基线访视',
                'visit_day': 0, 'visit_window_min': 0, 'visit_window_max': 0,
                'procedures': ['知情同意签署', '乳酸刺痛试验基线', 'Corneometer 水分检测', 'TEWL 屏障测试', 'VISIA-CR 红斑区域拍照'],
            },
            {
                'visit_code': 'V1', 'visit_name': '第1周随访',
                'visit_day': 7, 'visit_window_min': -1, 'visit_window_max': 1,
                'procedures': ['乳酸刺痛评分', 'Corneometer 水分检测', 'TEWL 屏障测试', '不良反应观察'],
            },
            {
                'visit_code': 'V2', 'visit_name': '第2周随访',
                'visit_day': 14, 'visit_window_min': -2, 'visit_window_max': 2,
                'procedures': ['乳酸刺痛评分', 'Corneometer 水分检测', 'TEWL 屏障测试', 'VISIA-CR 红斑区域拍照'],
            },
            {
                'visit_code': 'V3', 'visit_name': '第4周结束访视',
                'visit_day': 28, 'visit_window_min': -3, 'visit_window_max': 3,
                'procedures': ['乳酸刺痛试验终评', 'Corneometer 水分检测', 'TEWL 屏障测试', 'VISIA-CR 红斑区域拍照', '皮肤科医师终评', '受试者满意度问卷'],
            },
        ],
    },
}


def _infer_activity_type(proc_name: str) -> str:
    name_lower = proc_name.lower()
    if any(kw in name_lower for kw in ['检测', '测量', '拍照', '仪器', '测定', '测试', '判读']):
        return ActivityType.EXAMINATION
    if any(kw in name_lower for kw in ['血', '尿', '实验室', '生化']):
        return ActivityType.LABORATORY
    if any(kw in name_lower for kw in ['问卷', '量表', '评分', '自评']):
        return ActivityType.QUESTIONNAIRE
    if any(kw in name_lower for kw in ['用药', '给药', '服药', '贴敷']):
        return ActivityType.MEDICATION
    return ActivityType.OTHER


class Command(BaseCommand):
    help = '根据项目全链路数据生成方案准备、我的协议、我的访视联动数据，并授予研究台权限'

    def add_arguments(self, parser):
        parser.add_argument(
            'account_id',
            nargs='?',
            type=int,
            help='账号 ID（可选，不指定则 created_by_id=None，所有人可见）',
        )
        parser.add_argument(
            '--account-id',
            type=int,
            dest='account_id_opt',
            help='账号 ID（与位置参数二选一）',
        )
        parser.add_argument(
            '--username',
            type=str,
            help='按 username 查找账号（如 feishu_1a88556e461c97a5）',
        )
        parser.add_argument(
            '--seed-projects',
            action='store_true',
            help='若当前无项目全链路数据，则先执行 seed_project_full_link --with-protocols',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='对已存在的协议/方案，将 created_by_id 更新为指定账号，使该账号可见',
        )

    def handle(self, *args, **options):
        account_id = options.get('account_id') or options.get('account_id_opt')
        username = options.get('username')
        seed_projects = options.get('seed_projects')
        force_bind = options.get('force', False)

        aid = None
        account = None

        if account_id or username:
            from apps.identity.models import Account
            if account_id:
                account = Account.objects.filter(id=account_id, is_deleted=False).first()
            if not account and username:
                account = Account.objects.filter(username=username, is_deleted=False).first()
            if not account:
                self.stderr.write(
                    self.style.ERROR(
                        f'未找到账号（account_id={account_id}, username={username}），'
                        f'请确认 t_account 中是否存在且 is_deleted=false'
                    )
                )
                return
            aid = account.id
            self.stdout.write(f'使用账号: id={aid}, username={account.username}')

            from apps.identity.authz import get_authz_service
            authz = get_authz_service()
            created = authz.assign_role(aid, 'researcher', project_id=None)
            if created:
                self.stdout.write(self.style.SUCCESS('已为账号分配 researcher 角色'))
            else:
                self.stdout.write('账号已拥有 researcher 角色')
        else:
            self.stdout.write('未指定账号，生成的数据 created_by_id=None（与项目全链路权限一致，所有人可见）')

        # 若无项目全链路数据且指定了 --seed-projects，先插入项目+方案
        try:
            project_count = Project.objects.filter(is_delete=False).count()
        except OperationalError:
            project_count = 0
        if project_count == 0 and seed_projects:
            self.stdout.write('未检测到项目全链路数据，正在执行 seed_project_full_link --with-protocols ...')
            from django.core.management import call_command
            call_command('seed_project_full_link', '--with-protocols')
        elif project_count == 0:
            self.stderr.write(
                self.style.WARNING(
                    '当前无项目全链路数据，请先执行: '
                    'python manage.py seed_project_full_link --with-protocols '
                    '或本命令加 --seed-projects'
                )
            )
            return

        from apps.protocol.models import ProtocolStatus

        projects = list(Project.objects.filter(is_delete=False).order_by('id'))
        if not projects:
            self.stderr.write(self.style.WARNING('项目全链路中无项目数据'))
            return

        self.stdout.write(f'项目全链路共 {len(projects)} 个项目，开始同步协议/方案/访视…')

        stats = {
            'created_protocols': 0, 'created_proposals': 0, 'created_visit_plans': 0,
            'created_visit_nodes': 0, 'created_visit_activities': 0,
            'updated_protocols': 0, 'updated_proposals': 0,
        }

        for project in projects:
            first_pp = (
                ProjectProtocol.objects
                .filter(project=project, is_delete=False)
                .order_by('id')
                .first()
            )
            code = (project.project_no or '').strip() or f'PRJ-{project.id}'
            title = (first_pp.protocol_name if first_pp else None) or project.project_name or f'方案-{project.id}'

            # --- 1. 协议 (Protocol) ---
            protocol = Protocol.objects.filter(code=code, is_deleted=False).first()
            if protocol:
                if force_bind and aid is not None and protocol.created_by_id != aid:
                    protocol.created_by_id = aid
                    protocol.save(update_fields=['created_by_id'])
                    stats['updated_protocols'] += 1
                    self.stdout.write(f'  已更新协议归属: {protocol.title} (code={code}) -> 账号 {aid}')
            else:
                parsed_data = first_pp.parsed_data if first_pp else None
                if parsed_data and code in MOCK_VISIT_PLANS:
                    parsed_data = dict(parsed_data) if parsed_data else {}
                    parsed_data['visits'] = MOCK_VISIT_PLANS[code]['visits']
                elif not parsed_data and code in MOCK_VISIT_PLANS:
                    parsed_data = {'visits': MOCK_VISIT_PLANS[code]['visits']}

                protocol = Protocol.objects.create(
                    title=title,
                    code=code,
                    status=ProtocolStatus.ACTIVE,
                    parsed_data=parsed_data,
                    sample_size=project.total_samples,
                    product_category=project.business_type or '',
                    created_by_id=aid,
                )
                stats['created_protocols'] += 1
                self.stdout.write(f'  创建协议: {protocol.title} (code={protocol.code})')

            # --- 2. 方案 (Proposal) ---
            proposal = Proposal.objects.filter(protocol_id=protocol.id, is_deleted=False).first()
            if not proposal:
                proposal = Proposal.objects.create(
                    title=title,
                    protocol_id=protocol.id,
                    client_id=None,
                    status='drafting',
                    description=project.description or '',
                    product_category=project.business_type or '',
                    sample_size_estimate=project.total_samples,
                    created_by_id=aid,
                )
                _init_checklist(proposal)
                stats['created_proposals'] += 1
                self.stdout.write(f'  创建方案: {proposal.title} (id={proposal.id})')
            elif force_bind and aid is not None and proposal.created_by_id != aid:
                proposal.created_by_id = aid
                proposal.save(update_fields=['created_by_id'])
                stats['updated_proposals'] += 1
                self.stdout.write(f'  已更新方案归属: {proposal.title} -> 账号 {aid}')

            # --- 3. 访视计划 (VisitPlan + VisitNode + VisitActivity) ---
            existing_plan = VisitPlan.objects.filter(protocol=protocol, is_deleted=False).first()
            if existing_plan:
                self.stdout.write(f'  访视计划已存在: {existing_plan.name} (id={existing_plan.id})，跳过')
                continue

            visits_data = None
            if protocol.parsed_data and isinstance(protocol.parsed_data, dict):
                visits_data = protocol.parsed_data.get('visits')
            if not visits_data and code in MOCK_VISIT_PLANS:
                visits_data = MOCK_VISIT_PLANS[code]['visits']

            if not visits_data:
                self.stdout.write(f'  协议无 visits 数据，跳过访视计划生成: {protocol.title}')
                continue

            plan = VisitPlan.objects.create(
                protocol=protocol,
                name=f'{protocol.title} - 访视计划',
                description=f'由项目全链路同步生成，共 {len(visits_data)} 个访视节点',
                status=VisitPlanStatus.DRAFT,
                created_by_id=aid,
            )
            stats['created_visit_plans'] += 1
            self.stdout.write(f'  创建访视计划: {plan.name} (id={plan.id})')

            for idx, visit_item in enumerate(visits_data):
                node = VisitNode.objects.create(
                    plan=plan,
                    name=visit_item.get('visit_name', f'访视{idx + 1}'),
                    code=visit_item.get('visit_code', f'V{idx}'),
                    baseline_day=visit_item.get('visit_day', 0),
                    window_before=abs(visit_item.get('visit_window_min', 0)),
                    window_after=visit_item.get('visit_window_max', 0),
                    status=VisitPlanStatus.DRAFT,
                    order=idx,
                )
                stats['created_visit_nodes'] += 1

                procedures = visit_item.get('procedures', [])
                for proc_idx, proc_name in enumerate(procedures):
                    VisitActivity.objects.create(
                        node=node,
                        name=proc_name,
                        activity_type=_infer_activity_type(proc_name),
                        description='',
                        is_required=True,
                        order=proc_idx,
                    )
                    stats['created_visit_activities'] += 1

                self.stdout.write(
                    f'    └─ {node.code} {node.name} (Day {node.baseline_day}, '
                    f'窗口 -{node.window_before}~+{node.window_after}, '
                    f'{len(procedures)} 项活动)'
                )

        # 汇总报告
        msg_parts = [
            f'完成。',
            f'新建协议 {stats["created_protocols"]} 条，',
            f'新建方案 {stats["created_proposals"]} 条，',
            f'新建访视计划 {stats["created_visit_plans"]} 条，',
            f'新建访视节点 {stats["created_visit_nodes"]} 个，',
            f'新建访视活动 {stats["created_visit_activities"]} 个。',
        ]
        if stats['updated_protocols'] or stats['updated_proposals']:
            msg_parts.append(
                f'更新归属：协议 {stats["updated_protocols"]} 条，方案 {stats["updated_proposals"]} 条。'
            )
        if aid:
            msg_parts.append(f'账号 id={aid} 在研究台可查看方案准备、我的协议、我的访视与项目全链路。')
        else:
            msg_parts.append('数据不限定账号，DEBUG 模式下所有登录用户均可查看。')
        self.stdout.write(self.style.SUCCESS(' '.join(msg_parts)))
