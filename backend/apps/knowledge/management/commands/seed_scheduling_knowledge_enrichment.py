"""
第三优先级公开知识补强：排程与资源协调知识包。

覆盖窗口期策略、节假日排程、依从性影响、设备切换、场地负荷、里程碑偏移。
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


SEEDS = [
    RawKnowledgeInput(
        title='访视窗口期策略：窗口计算规则与超窗处理',
        content=(
            '公开依据：ICH E6(R2) 6.4.5。\n'
            '窗口期定义：每个计划访视允许的提前/延后天数，通常在协议中预设(如 Day 14 +/- 3天)。\n'
            '超窗处理：超窗视为协议偏差，需记录原因并评估对数据完整性的影响。\n'
            '数字员工要求：自动计算每位受试者的下次访视窗口，超窗前 3 天预警。'
        ),
        summary='访视窗口期的计算规则、超窗偏差处理与预警要求。',
        entry_type='sop',
        source_type='scheduling_knowledge_seed',
        source_key='scheduling:sop:visit-window-strategy',
        namespace='cnkis',
        tags=['排程', '窗口期', '偏差', 'ICH E6'],
        package_id='scheduling_rules',
        canonical_topic='排程规则',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='节假日排程策略：假期影响评估与替代方案',
        content=(
            '运营实践：节假日期间需评估——\n'
            '- 哪些访视可以提前/延后(窗口期允许)\n'
            '- 哪些检测必须按时执行(药代动力学采血等)\n'
            '- 人员排班是否充足\n'
            '- 设备维护是否跨越假期\n'
            '替代方案：远程随访、家访、社区诊所合作。\n'
            '数字员工要求：节假日前自动生成受影响访视清单和调整建议。'
        ),
        summary='节假日期间排程影响评估与替代方案。',
        entry_type='lesson_learned',
        source_type='scheduling_knowledge_seed',
        source_key='scheduling:lesson:holiday-scheduling',
        namespace='cnkis',
        tags=['排程', '节假日', '替代方案'],
        package_id='scheduling_rules',
        canonical_topic='排程规则',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='受试者依从性对排程的影响：高风险受试者识别与干预',
        content=(
            '运营实践：依从性差的受试者会造成排程频繁调整，影响整体效率。\n'
            '高风险信号：连续迟到、频繁改约、漏服药物记录、联系不上。\n'
            '干预措施：增加提醒频次、安排交通接送、缩短访视间隔、指定固定协调员。\n'
            '数字员工要求：自动标记依从性高风险受试者，触发干预措施。'
        ),
        summary='依从性差对排程影响的识别与干预措施。',
        entry_type='lesson_learned',
        source_type='scheduling_knowledge_seed',
        source_key='scheduling:lesson:compliance-impact',
        namespace='cnkis',
        tags=['排程', '依从性', '干预', '风险识别'],
        package_id='scheduling_rules',
        canonical_topic='排程规则',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='设备切换优先级：多项目共享设备的排程规则',
        content=(
            '运营实践：多项目共享设备时需考虑——\n'
            '- 优先级：紧急/时效性强的项目优先\n'
            '- 切换成本：不同项目间需要的校准/清洁/预热时间\n'
            '- 批量优化：同类检测项目连续安排减少切换\n'
            '- 预留窗口：为紧急加测保留一定比例的空闲时段\n'
            '数字员工要求：排程时自动检测设备冲突并建议优化方案。'
        ),
        summary='多项目共享设备的排程优先级与切换成本规则。',
        entry_type='sop',
        source_type='scheduling_knowledge_seed',
        source_key='scheduling:sop:equipment-switching-priority',
        namespace='cnkis',
        tags=['排程', '设备', '优先级', '切换成本'],
        package_id='resource_coordination',
        canonical_topic='资源协调',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='场地负荷规则：场地容量与并发限制',
        content=(
            '运营实践：每个实验区域有最大并发容量限制——\n'
            '- 考虑人员密度、设备数量、通风条件\n'
            '- 不同类型操作的互斥性(如某些化学品不能同时使用)\n'
            '- 受试者同时在场的最大人数(涉及隐私和安全)\n'
            '- 清洁/消毒的间隔时间\n'
            '数字员工要求：排程时检查场地并发上限，超限时提示。'
        ),
        summary='场地容量限制与并发排程约束规则。',
        entry_type='sop',
        source_type='scheduling_knowledge_seed',
        source_key='scheduling:sop:venue-capacity-rules',
        namespace='cnkis',
        tags=['排程', '场地', '容量', '并发'],
        package_id='resource_coordination',
        canonical_topic='资源协调',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='里程碑偏移应对：关键路径识别与恢复计划',
        content=(
            '项目管理实践：里程碑偏移时需——\n'
            '1. 识别关键路径：哪些任务延迟会影响整体进度\n'
            '2. 影响评估：延迟对合同交付、受试者安全、数据完整性的影响\n'
            '3. 恢复方案：增加资源、并行执行、缩短非关键任务、与客户协商\n'
            '4. 沟通：向项目经理和客户通报偏移情况和恢复计划\n'
            '数字员工要求：检测到里程碑偏移时自动生成影响评估和恢复建议。'
        ),
        summary='项目里程碑偏移的关键路径识别与恢复计划流程。',
        entry_type='lesson_learned',
        source_type='scheduling_knowledge_seed',
        source_key='scheduling:lesson:milestone-deviation-response',
        namespace='cnkis',
        tags=['排程', '里程碑', '关键路径', '恢复计划'],
        package_id='scheduling_rules',
        canonical_topic='排程规则',
        facet='sop_risks',
    ),
]


class Command(BaseCommand):
    help = '补强第三优先级公开知识：排程与资源协调知识包'

    def add_arguments(self, parser):
        parser.add_argument('--disable-llm-enrich', action='store_true')

    def handle(self, *args, **options):
        if options.get('disable_llm_enrich'):
            import apps.knowledge.ingestion_pipeline as m
            m._LLM_ENRICH_ENABLED = False

        created = skipped = errors = 0
        for raw in SEEDS:
            state = self._ingest(raw)
            created += int(state == 'created')
            skipped += int(state == 'skipped')
            errors += int(state == 'error')
        self.stdout.write(self.style.SUCCESS(f'第三优先级知识补强完成: created={created} skipped={skipped} errors={errors}'))

    def _ingest(self, raw):
        existed = KnowledgeEntry.objects.filter(source_type=raw.source_type, source_key=raw.source_key, is_deleted=False).exists()
        try:
            result = run_pipeline(raw)
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f'  x {raw.title[:70]} | {exc}'))
            return 'error'
        if result and result.entry_id:
            KnowledgeEntry.objects.filter(id=result.entry_id).update(status='published', is_published=True)
        if result and result.entry_id and not existed:
            self.stdout.write(self.style.SUCCESS(f'  + [{result.entry_id}] {raw.title[:70]}'))
            return 'created'
        self.stdout.write(f'  - skip: {raw.title[:70]}')
        return 'skipped'
