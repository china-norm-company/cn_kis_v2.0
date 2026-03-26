"""
预置 Agent 知识域边界规则

根据各 Agent 的业务职责和数据安全要求，写入预定义的 AgentKnowledgeDomain 配置。

原则：
  - 最小权限：Agent 只能访问完成其工作所必需的知识类型
  - 明确禁止：财务 Agent 不得访问受试者个人数据，反之亦然
  - 未配置的 Agent：退回检索网关默认的 data_scope 过滤

使用方式：
  python manage.py seed_agent_knowledge_domains
  python manage.py seed_agent_knowledge_domains --update-existing
"""
from django.core.management.base import BaseCommand

DOMAIN_RULES = [
    {
        'agent_id': 'knowledge-hybrid-search',
        'allowed_entry_types': [],  # 知识检索 Agent 可访问所有类型
        'allowed_namespaces': ['cnkis', 'nmpa_regulation', 'cdisc_sdtm', 'cdisc_cdash', 'bridg', 'internal_sop'],
        'forbidden_scopes': [
            {'table': 't_personal_context', 'reason': '个人飞书通讯数据不通过知识检索对外暴露'},
        ],
        'max_results': 10,
        'notes': '知识检索专员可访问所有知识类型，但禁止访问飞书个人通讯数据',
    },
    {
        'agent_id': 'finance-automation',
        'allowed_entry_types': ['regulation', 'sop', 'faq', 'lesson_learned'],
        'allowed_namespaces': ['cnkis', 'internal_sop'],
        'forbidden_scopes': [
            {'table': 't_subject', 'reason': '财务 Agent 无需访问受试者个人信息'},
            {'table': 't_personal_context', 'reason': '财务 Agent 不得访问员工个人通讯'},
            {'table': 't_crf_record', 'reason': '财务 Agent 不得访问临床数据记录'},
        ],
        'max_results': 5,
        'notes': '财务自动化助手只能访问财务相关法规、SOP、FAQ，禁止受试者数据',
    },
    {
        'agent_id': 'efficacy-report-generator',
        'allowed_entry_types': ['regulation', 'method_reference', 'paper_abstract', 'instrument_spec', 'sop'],
        'allowed_namespaces': ['cnkis', 'nmpa_regulation', 'cdisc_sdtm', 'internal_sop'],
        'forbidden_scopes': [
            {'table': 't_personal_context', 'reason': '报告生成不需要个人通讯数据'},
        ],
        'max_results': 15,
        'notes': '功效报告生成员需要法规、方法、仪器、论文等专业知识支撑报告内容',
    },
    {
        'agent_id': 'recruitment-screener',
        'allowed_entry_types': ['regulation', 'sop', 'faq'],
        'allowed_namespaces': ['cnkis', 'internal_sop'],
        'forbidden_scopes': [
            {'table': 't_personal_context', 'reason': '招募筛选不需要访问现有员工个人数据'},
            {'table': 't_knowledge_entry', 'reason': '类型过滤已在 allowed_entry_types 中定义'},
        ],
        'max_results': 5,
        'notes': '招募筛选员只需访问入排标准相关的法规和 SOP，受试者识别仅使用假名码',
    },
    {
        'agent_id': 'secretary-orchestrator',
        'allowed_entry_types': [],  # 编排器需要全局视野
        'allowed_namespaces': [],
        'forbidden_scopes': [
            {'table': 't_ekb_raw_record', 'reason': '易快报原始数据不由秘书编排器直接访问'},
            {'table': 't_raw_lims_record', 'reason': 'LIMS 原始数据不由秘书编排器直接访问'},
        ],
        'max_results': 20,
        'notes': '秘书编排器需要全局知识访问权以协调多 Agent，但不直接访问原始数据层',
    },
    {
        'agent_id': 'research-paper-kb',
        'allowed_entry_types': ['paper_abstract', 'method_reference', 'regulation'],
        'allowed_namespaces': ['cnkis', 'nmpa_regulation'],
        'forbidden_scopes': [
            {'table': 't_personal_context', 'reason': '论文知识库不需要个人数据'},
            {'table': 't_subject', 'reason': '论文知识库不需要受试者数据'},
        ],
        'max_results': 10,
        'notes': '论文知识库只访问学术/方法论类知识',
    },
    {
        'agent_id': 'protocol-parser',
        'allowed_entry_types': ['regulation', 'sop', 'method_reference', 'paper_abstract', 'faq'],
        'allowed_namespaces': ['cnkis', 'nmpa_regulation', 'cdisc_sdtm', 'internal_sop'],
        'forbidden_scopes': [
            {'table': 't_personal_context', 'reason': '方案解析不需要个人通讯数据'},
        ],
        'max_results': 10,
        'notes': '方案解析专员需要法规、方法、SOP 来支撑方案理解',
    },
    {
        'agent_id': 'hr-self-service',
        'allowed_entry_types': ['sop', 'faq', 'regulation', 'lesson_learned'],
        'allowed_namespaces': ['cnkis', 'internal_sop'],
        'forbidden_scopes': [
            {'table': 't_subject', 'reason': 'HR 自助服务不需要受试者数据'},
            {'table': 't_crf_record', 'reason': 'HR 自助服务不需要临床数据'},
            {'table': 't_ekb_raw_record', 'reason': 'HR 自助服务不需要财务单据数据'},
        ],
        'max_results': 5,
        'notes': 'HR 自助服务只访问内部 SOP 和 FAQ，严格隔离临床和财务数据',
    },
]


class Command(BaseCommand):
    help = '预置 Agent 知识域边界规则到 t_agent_knowledge_domain'

    def add_arguments(self, parser):
        parser.add_argument(
            '--update-existing',
            action='store_true',
            default=False,
            help='更新已存在的域边界配置（默认跳过）',
        )

    def handle(self, *args, **options):
        update_existing = options['update_existing']

        from apps.agent_gateway.models import AgentKnowledgeDomain

        stats = {'created': 0, 'updated': 0, 'skipped': 0}

        for rule in DOMAIN_RULES:
            agent_id = rule['agent_id']
            existing = AgentKnowledgeDomain.objects.filter(agent_id=agent_id).first()

            if existing:
                if not update_existing:
                    self.stdout.write(f'  [跳过] {agent_id}（已存在，使用 --update-existing 强制更新）')
                    stats['skipped'] += 1
                    continue
                for k, v in rule.items():
                    setattr(existing, k, v)
                existing.save()
                self.stdout.write(self.style.WARNING(f'  [更新] {agent_id}'))
                stats['updated'] += 1
            else:
                AgentKnowledgeDomain.objects.create(**rule)
                self.stdout.write(self.style.SUCCESS(f'  [创建] {agent_id}'))
                stats['created'] += 1

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'完成：创建={stats["created"]} 更新={stats["updated"]} 跳过={stats["skipped"]}'
        ))
