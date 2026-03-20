"""
为 domain worker 当前缺口专题包注入首批高价值结构化知识。

目标：
1. 直接为 readiness 报告中未对齐的专题包创建真实 TopicPackage
2. 每个 gap package 至少补 1 条高价值可检索种子
3. 优先覆盖 subject_qa / compliance_assistant / internal_ops / client_service / enrollment_booking
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline


GAP_SEEDS = [
    RawKnowledgeInput(
        title='排程规则：访视改约与时间窗口优先级',
        content='排程规则应同时考虑协议时间窗口、受试者可到访时段、关键设备可用性和执行人员资质。发生改约时，优先守住协议窗口和核心资源约束，再处理便利性优化；超窗安排必须升级人工确认并记录原因。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='gap:scheduling_rules:001',
        namespace='internal_sop',
        tags=['排程规则', '改约', '时间窗口'],
        package_id='scheduling_rules',
        canonical_topic='排程规则',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='资源协调：跨工作台冲突的最小处置原则',
        content='当设备、人员、场地和受试者预约发生冲突时，应先识别关键路径，再输出“可延期/不可延期”“可替代/不可替代”判断。资源协调不以局部最优为目标，而以关键研究活动不中断、合规不破坏、受试者体验可接受为优先。',
        entry_type='lesson_learned',
        source_type='manual_ingest',
        source_key='gap:resource_coordination:001',
        namespace='cnkis',
        tags=['资源协调', '冲突处理', '跨工作台'],
        package_id='resource_coordination',
        canonical_topic='资源协调',
        facet='core_concepts',
    ),
    RawKnowledgeInput(
        title='审计追踪：变更追溯链最小证据要素',
        content='审计追踪至少要能回答谁、何时、改了什么、改前后值是什么、为什么改，以及该修改处于哪个关键业务节点。没有前后值、操作人或时间戳的记录，不能视为合格审计追踪证据。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='gap:audit_trail:001',
        namespace='cnkis',
        tags=['审计追踪', '数据完整性', '变更记录'],
        package_id='audit_trail',
        canonical_topic='审计追踪',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='方案设计：样本量、终点、方法一致性核查要点',
        content='方案设计审核时，应同时检查主要终点是否可测、样本量假设是否与终点匹配、统计方法是否与研究设计一致，以及排除标准是否会系统性削弱可招募性。缺少任何一项，都会直接影响后续执行与客户交付质量。',
        entry_type='proposal_template',
        source_type='manual_ingest',
        source_key='gap:proposal_design:001',
        namespace='cnkis',
        tags=['方案设计', '样本量', '终点'],
        package_id='proposal_design',
        canonical_topic='方案设计',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='客户交付：专业建议必须带边界和证据级别',
        content='面向客户的建议至少应包含结论、证据来源、适用边界和待确认项。不能把内部经验、弱证据或单次项目观察包装为确定性承诺；数字员工输出给客户时，必须明确哪些是法规要求、哪些是方法建议、哪些是项目经验。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='gap:customer_delivery:001',
        namespace='cnkis',
        tags=['客户交付', '证据等级', '建议边界'],
        package_id='customer_delivery',
        canonical_topic='客户交付',
        facet='reporting_templates',
    ),
    RawKnowledgeInput(
        title='知情同意：签署前不得开始任何研究相关操作',
        content='在受试者签署知情同意书前，不得开始任何研究相关操作，包括正式筛查、限制性准备、随机化、取样或方案要求的检测。数字员工在预约、签到、接待场景中，一旦发现未签署知情同意而准备进入研究流程，应立即提示转人工处理。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='gap:informed_consent:001',
        namespace='cnkis',
        tags=['知情同意', '受试者权益', '伦理'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='CAPA 规则：纠正、预防、验证三段不可缺',
        content='CAPA 不应止于“创建记录”。纠正措施解决已发生问题，预防措施降低再次发生概率，验证环节确认措施是否有效。没有验证标准或验证未完成的 CAPA，不应视为真正闭环。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='gap:capa_rules:001',
        namespace='internal_sop',
        tags=['CAPA', '根因分析', '验证'],
        package_id='capa_rules',
        canonical_topic='CAPA规则',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='SOP 治理：版本有效性优先于习惯做法',
        content='执行人员应以当前有效版本 SOP 为准，而不是以“之前一直这么做”作为依据。若现场实践与有效版本不一致，应触发版本核查、偏差记录或临时指令，而不是默认沿用旧习惯。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='gap:sop_governance:001',
        namespace='internal_sop',
        tags=['SOP', '版本治理', '偏差'],
        package_id='sop_governance',
        canonical_topic='SOP治理',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='数据完整性：关键数据修改的高风险信号',
        content='关键数据在锁库、结项或报告出具前被频繁修改，是数据完整性高风险信号。数字员工应重点核对修改时间、修改人、修改理由、前后值差异和上下游记录是否一致，必要时升级为质量调查。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='gap:data_integrity:001',
        namespace='cnkis',
        tags=['数据完整性', '关键数据', '质量调查'],
        package_id='data_integrity',
        canonical_topic='数据完整性',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='报名规则：数字员工只能做预筛，不得替代最终入组判断',
        content='报名与预约数字员工可以依据公开入排标准做预筛和信息收集，但不得替代研究者、项目经理或人工审核做最终入组决定。所有边界型、风险型或资料不全的候选人，均应输出“需人工复核”。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='gap:enrollment_rules:001',
        namespace='cnkis',
        tags=['入排标准', '预筛', '人工复核'],
        package_id='enrollment_rules',
        canonical_topic='报名规则',
        facet='claim_boundary',
    ),
    RawKnowledgeInput(
        title='留存策略：失访恢复优先解释原因，不优先强留',
        content='受试者留存的第一目标是识别失访原因并恢复合规参与，而不是一味提高留存率。出现不适、隐私顾虑、流程误解或排程冲突时，应优先解释、改约和转人工；不能用不明确承诺或压力方式强行留存。',
        entry_type='lesson_learned',
        source_type='manual_ingest',
        source_key='gap:retention_playbook:001',
        namespace='cnkis',
        tags=['留存', '失访恢复', '受试者沟通'],
        package_id='retention_playbook',
        canonical_topic='留存策略',
        facet='faq_misconceptions',
    ),
]


class Command(BaseCommand):
    help = '为 domain worker 缺口专题包注入首批结构化知识种子'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='仅预览，不写入数据库')

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        created = 0
        failed = 0

        for raw in GAP_SEEDS:
            if dry_run:
                self.stdout.write(f'[DRY-RUN] {raw.package_id} | {raw.title}')
                continue

            result = run_pipeline(raw)
            if result.success and result.entry_id:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'[OK] {raw.package_id} -> entry#{result.entry_id}'))
            else:
                failed += 1
                self.stdout.write(self.style.ERROR(f'[FAIL] {raw.package_id} -> {result.stage_errors}'))

        self.stdout.write(self.style.SUCCESS(
            f'完成：created={created}, failed={failed}, dry_run={dry_run}'
        ))
