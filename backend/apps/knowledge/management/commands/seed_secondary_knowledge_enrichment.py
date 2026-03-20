"""
第二优先级公开知识补强：招募/预约/失访恢复规则 + 接待现场异常与服务话术。

覆盖行业公开来源与运营最佳实践。
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


SEEDS = [
    # ── 招募/预约/失访恢复 ─────────────────────────────────────
    RawKnowledgeInput(
        title='入排标准设计：纳入与排除标准的结构化编写原则',
        content=(
            '公开依据：ICH E6(R2) 6.2, SPIRIT 2013 条目 10。\n'
            '结构化原则：纳入标准应定义目标人群的正向特征(年龄、性别、适应症、知情同意)；'
            '排除标准应定义安全性排除(过敏史、合并用药、妊娠)和数据质量排除(无法依从、语言障碍)。\n'
            '数字员工要求：自动检查入排标准的完整性和逻辑一致性，标记遗漏项。'
        ),
        summary='入排标准结构化编写的核心原则与完整性检查要求。',
        entry_type='sop',
        source_type='secondary_knowledge_seed',
        source_key='recruitment:sop:inclusion-exclusion-design',
        namespace='cnkis',
        tags=['招募', '入排标准', 'SPIRIT'],
        package_id='enrollment_rules',
        canonical_topic='入排标准',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='候补池管理：候补排序规则与超时自动释放',
        content=(
            '运营最佳实践：候补池需按优先级排序(注册时间、匹配度、地理距离)，'
            '设定候补有效期(通常 48-72 小时)，超期未确认自动释放给下一位。\n'
            '数字员工要求：候补队列自动排序、超时释放、通知下一位候补。'
        ),
        summary='候补池优先级排序与超时自动释放的运营规则。',
        entry_type='sop',
        source_type='secondary_knowledge_seed',
        source_key='recruitment:sop:waitlist-management',
        namespace='cnkis',
        tags=['招募', '候补池', '运营'],
        package_id='enrollment_rules',
        canonical_topic='入排标准',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='爽约召回策略：分层召回与话术模板',
        content=(
            '运营最佳实践：爽约召回应分层处理——\n'
            '- 首次爽约：24小时内电话+短信，语气温和，了解原因并重新预约\n'
            '- 二次爽约：48小时内联系，评估依从性风险，考虑调整访视方式\n'
            '- 三次以上：升级到项目经理，评估是否继续保留\n'
            '话术原则：不责备、不施压、提供替代时间、确认交通/时间障碍。\n'
            '数字员工要求：自动识别爽约记录，按分层规则触发召回流程。'
        ),
        summary='爽约受试者的分层召回策略与标准话术模板。',
        entry_type='faq',
        source_type='secondary_knowledge_seed',
        source_key='recruitment:faq:no-show-recall',
        namespace='cnkis',
        tags=['招募', '爽约', '召回', '话术'],
        package_id='retention_playbook',
        canonical_topic='留存手册',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='失访恢复策略：失访定义、恢复窗口与记录要求',
        content=(
            '公开依据：ICH E6(R2) 4.3.1。\n'
            '失访(Lost to Follow-up)定义：连续 2 次以上计划访视未完成且无法联系。\n'
            '恢复窗口：通常在失访后 30 天内尝试至少 3 次不同渠道联系。\n'
            '记录要求：每次联系尝试的时间、方式、结果必须记录，供审计追溯。\n'
            '数字员工要求：自动标记失访受试者，按恢复窗口安排联系任务。'
        ),
        summary='失访的定义标准、恢复时间窗口和联系记录要求。',
        entry_type='sop',
        source_type='secondary_knowledge_seed',
        source_key='recruitment:sop:lost-to-followup-recovery',
        namespace='cnkis',
        tags=['招募', '失访', '恢复', 'ICH E6'],
        package_id='retention_playbook',
        canonical_topic='留存手册',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='渠道质量分层：按转化率和依从性评估招募渠道',
        content=(
            '运营最佳实践：招募渠道应按多维指标评级——\n'
            '- 转化率：从报名到入组的比例\n'
            '- 依从性：入组后的完成率和脱落率\n'
            '- 成本效率：单人入组成本\n'
            '- 时效性：从发布到首人入组的天数\n'
            '定期复盘低效渠道，集中资源到高转化渠道。\n'
            '数字员工要求：自动按渠道统计转化漏斗和依从性指标。'
        ),
        summary='招募渠道的多维质量评估与分层管理规则。',
        entry_type='lesson_learned',
        source_type='secondary_knowledge_seed',
        source_key='recruitment:lesson:channel-quality-grading',
        namespace='cnkis',
        tags=['招募', '渠道', '转化率', '复盘'],
        package_id='enrollment_rules',
        canonical_topic='入排标准',
        facet='key_metrics',
    ),
    RawKnowledgeInput(
        title='边界人群复核：高风险入排决策的人工审核流程',
        content=(
            '运营规则：当受试者处于入排标准边界(如年龄接近上限、BMI 边缘、合并用药不确定)时，'
            '不得由系统自动判定，必须标记为"边界人群"并提交给主要研究者(PI)或医学监查员复核。\n'
            '数字员工要求：识别边界人群标记，自动生成复核工单并通知 PI。'
        ),
        summary='入排标准边界人群的强制人工复核流程。',
        entry_type='sop',
        source_type='secondary_knowledge_seed',
        source_key='recruitment:sop:borderline-population-review',
        namespace='cnkis',
        tags=['招募', '边界人群', '人工复核'],
        package_id='enrollment_rules',
        canonical_topic='入排标准',
        facet='sop_risks',
    ),

    # ── 接待现场异常与服务话术 ──────────────────────────────────
    RawKnowledgeInput(
        title='接待路线引导：到达指引与楼层导航标准话术',
        content=(
            '服务标准：受试者到达后应有清晰的路线引导——\n'
            '- 短信/App 提前发送导航信息(地址、楼层、房间号)\n'
            '- 到达后由接待人员确认身份并引导至等候区\n'
            '- 等候区应有项目信息展示和预估等候时间告知\n'
            '数字员工要求：到达签到后自动推送下一步引导信息。'
        ),
        summary='受试者到达后的路线引导标准与话术模板。',
        entry_type='faq',
        source_type='secondary_knowledge_seed',
        source_key='reception:faq:arrival-navigation',
        namespace='cnkis',
        tags=['接待', '路线引导', '话术'],
        package_id='site_incident',
        canonical_topic='现场异常',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='受试者迟到处理：窗口期评估与重新安排规则',
        content=(
            '运营规则：受试者迟到时需评估——\n'
            '- 是否仍在访视窗口期内(通常允许 +/- 若干天)\n'
            '- 迟到是否影响禁食/用药要求\n'
            '- 是否需要通知实验团队调整排程\n'
            '处理原则：窗口期内可继续执行，超窗需按偏差处理流程记录。\n'
            '数字员工要求：自动判断窗口期状态并给出处理建议。'
        ),
        summary='受试者迟到的窗口期评估与处理决策规则。',
        entry_type='sop',
        source_type='secondary_knowledge_seed',
        source_key='reception:sop:late-arrival-handling',
        namespace='cnkis',
        tags=['接待', '迟到', '窗口期', '偏差'],
        package_id='site_incident',
        canonical_topic='现场异常',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='现场投诉受理：受试者投诉分类与响应时限',
        content=(
            '服务标准：受试者投诉应分类处理——\n'
            '- 服务类(等候过长、环境不适)：现场即时响应\n'
            '- 流程类(操作不当、信息错误)：24小时内调查回复\n'
            '- 权益类(隐私泄露、费用争议)：升级至项目负责人，48小时内书面回复\n'
            '所有投诉必须记录并纳入质量管理体系。\n'
            '数字员工要求：自动分类投诉并按响应时限发送提醒。'
        ),
        summary='受试者投诉的分类标准与分级响应时限。',
        entry_type='sop',
        source_type='secondary_knowledge_seed',
        source_key='reception:sop:complaint-handling',
        namespace='cnkis',
        tags=['接待', '投诉', '响应时限', '质量管理'],
        package_id='site_incident',
        canonical_topic='现场异常',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='隐私敏感场景：接待环节的隐私保护要求',
        content=(
            '公开依据：GDPR Article 5, ICH E6(R2) 4.8.10。\n'
            '隐私保护要求：\n'
            '- 等候区不得公开展示受试者姓名(使用编号或代码)\n'
            '- 知情同意签署应在独立空间进行\n'
            '- 通话讨论受试者信息时注意隔音\n'
            '- 电子设备上的受试者信息必须锁屏保护\n'
            '数字员工要求：在涉及受试者个人信息的场景中自动切换到隐私保护模式。'
        ),
        summary='接待环节的受试者隐私保护具体要求。',
        entry_type='regulation',
        source_type='secondary_knowledge_seed',
        source_key='reception:regulation:privacy-protection',
        namespace='cnkis',
        tags=['接待', '隐私', 'GDPR', '数据保护'],
        package_id='subject_rights',
        canonical_topic='受试者权益',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='现场不适处理：受试者身体不适的转人工与应急流程',
        content=(
            '运营规则：受试者在现场出现不适时——\n'
            '1. 立即停止当前操作，启动应急响应\n'
            '2. 通知现场医护人员/研究者评估\n'
            '3. 按不良事件报告流程记录\n'
            '4. 必要时联系急救\n'
            '禁止：数字员工不得给出医疗建议或自行判断严重程度。\n'
            '数字员工要求：检测到不适关键词立即转人工，同时触发应急通知。'
        ),
        summary='受试者现场不适的应急响应流程与转人工规则。',
        entry_type='sop',
        source_type='secondary_knowledge_seed',
        source_key='reception:sop:onsite-discomfort-escalation',
        namespace='cnkis',
        tags=['接待', '不适', '应急', '转人工'],
        package_id='adverse_event',
        canonical_topic='不良反应',
        facet='sop_risks',
    ),
]


class Command(BaseCommand):
    help = '补强第二优先级公开知识：招募/失访恢复规则 + 接待现场异常与服务话术'

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
        self.stdout.write(self.style.SUCCESS(f'第二优先级知识补强完成: created={created} skipped={skipped} errors={errors}'))

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
