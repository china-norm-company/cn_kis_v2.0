"""
第一优先级公开知识补强：伦理/知情同意、样品-测试-设备方法、协议设计与统计学。

覆盖行业公开来源：
- 伦理：Helsinki, CIOMS, Belmont, Nuremberg, ICH E6 GCP 知情同意章节
- 实验室/样品：ISO 17025, WHO Lab QMS, GB/T 检测标准, 样品保管链
- 协议统计学：ICH E9/E10, SPIRIT, CONSORT, estimand, 样本量, 缺失数据
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


SEEDS = [
    # ── 伦理 / 知情同意 / 受试者权益 ──────────────────────────────────
    RawKnowledgeInput(
        title='知情同意核心原则：自愿、充分告知、理解确认',
        content=(
            '公开依据：Helsinki 宣言第25-32条、ICH E6(R2) 4.8节。\n'
            '核心要求：受试者在参与前必须获得充分告知，包括研究目的、程序、预期风险与获益、'
            '替代方案、保密措施、补偿与损害救济、自愿退出权利。告知过程必须留出充分理解时间，'
            '不得施加胁迫或不正当影响。知情同意书须经伦理委员会审核批准。\n'
            '数字员工要求：在任何涉及受试者参与的流程中，必须确认知情同意已签署且版本与当前获批版本一致。'
        ),
        summary='知情同意的三大核心原则及 ICH GCP 要求。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='ethics:regulation:informed-consent-principles',
        namespace='cnkis',
        tags=['伦理', '知情同意', 'Helsinki', 'ICH E6'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='知情同意修正案：何时需要重新签署',
        content=(
            '公开依据：ICH E6(R2) 4.8.2, FDA 21 CFR 50.25。\n'
            '核心规则：当协议修正案涉及受试者权益、风险/获益比或参与条件变更时，'
            '所有在研受试者必须签署更新版知情同意书。时间窗口通常要求在修正案获批后'
            '下一次访视前完成重签，紧急情况可先口头告知后补签。\n'
            '数字员工要求：检测到协议修正案获批时，自动标记需重签的受试者清单并提醒协调员。'
        ),
        summary='协议修正案触发知情同意重签的规则与时间窗口。',
        entry_type='sop',
        source_type='priority_knowledge_seed',
        source_key='ethics:sop:consent-amendment-resign',
        namespace='cnkis',
        tags=['伦理', '知情同意', '修正案', '重签'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='特殊人群知情同意：未成年人、认知障碍、紧急情况',
        content=(
            '公开依据：CIOMS 2016 指南第16-17条、Helsinki 宣言第28-30条。\n'
            '特殊要求：\n'
            '- 未成年人：需法定监护人同意 + 本人知情赞同(assent)，年龄阈值因地区而异\n'
            '- 认知障碍：需法定代理人同意，同时尽可能获得本人理解范围内的赞同\n'
            '- 紧急情况：可先入组后补签，但必须有伦理委员会预先批准的豁免程序\n'
            '- 文盲：需独立见证人全程参与并签名确认\n'
            '数字员工要求：识别特殊人群标记后，自动切换到对应的知情同意流程模板。'
        ),
        summary='特殊人群知情同意的差异化要求与豁免条件。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='ethics:regulation:special-population-consent',
        namespace='cnkis',
        tags=['伦理', '知情同意', '特殊人群', 'CIOMS'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='电子知情同意(eConsent)：合规要素与实施要求',
        content=(
            '公开依据：FDA Guidance on eConsent (2016), EMA Reflection Paper on eConsent。\n'
            '核心要素：电子知情同意必须满足——可读性(多媒体辅助理解)、完整性(同纸质版信息量)、'
            '受试者身份验证、电子签名合规(21 CFR Part 11)、版本控制与审计追踪、'
            '随时可获取纸质副本、伦理委员会审批。\n'
            '数字员工要求：eConsent 流程中必须验证签名有效性、版本一致性和受试者身份匹配。'
        ),
        summary='电子知情同意的合规框架与必要要素。',
        entry_type='faq',
        source_type='priority_knowledge_seed',
        source_key='ethics:faq:econsent-compliance',
        namespace='cnkis',
        tags=['伦理', '知情同意', 'eConsent', 'FDA'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='受试者撤回同意：后续处理与数据保留规则',
        content=(
            '公开依据：ICH E6(R2) 4.8.10, GDPR Article 17。\n'
            '规则：受试者有权随时撤回同意且无需说明理由。撤回后需明确：\n'
            '- 是否停止用药/干预\n'
            '- 已采集数据是否保留(需在原始ICF中约定)\n'
            '- 是否继续安全随访\n'
            '- 生物样本是否销毁或匿名化\n'
            '数字员工要求：收到撤回通知后，自动生成处置清单并通知相关角色。'
        ),
        summary='受试者撤回同意后的数据、样本和随访处置规则。',
        entry_type='sop',
        source_type='priority_knowledge_seed',
        source_key='ethics:sop:consent-withdrawal-handling',
        namespace='cnkis',
        tags=['伦理', '撤回同意', '数据保留', 'GDPR'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='伦理审查意见分类与整改要求',
        content=(
            '公开依据：ICH E6(R2) 3.1, CIOMS 2016。\n'
            '伦理委员会审查意见通常分为：\n'
            '- 同意(Approval)：可直接启动\n'
            '- 修改后同意(Approval with modifications)：须提交修改证据后方可启动\n'
            '- 不同意(Disapproval)：不得开展研究\n'
            '- 暂缓(Tabled/Deferred)：需补充材料后重新审查\n'
            '整改要求：每项修改意见须逐条回复，说明采纳/不采纳及理由。\n'
            '数字员工要求：自动解析审查意见，生成逐条整改跟踪清单。'
        ),
        summary='伦理委员会审查意见类型及逐条整改流程。',
        entry_type='sop',
        source_type='priority_knowledge_seed',
        source_key='ethics:sop:irb-opinion-categories',
        namespace='cnkis',
        tags=['伦理', '伦理审查', '整改', 'IRB'],
        package_id='subject_rights',
        canonical_topic='受试者权益',
        facet='sop_risks',
    ),

    # ── 样品-测试-设备方法标准库 ──────────────────────────────────────
    RawKnowledgeInput(
        title='ISO 17025：检测与校准实验室能力通用要求',
        content=(
            '公开标准：ISO/IEC 17025:2017。\n'
            '核心要求：\n'
            '- 管理要求：公正性、保密性、组织结构、文件控制、合同评审、分包管理\n'
            '- 技术要求：人员能力、设施环境、设备校准、测量溯源、样品处置、方法验证\n'
            '- 质量保证：内部质控、能力验证、管理评审、持续改进\n'
            '- 测量不确定度：所有定量结果必须评估测量不确定度\n'
            '数字员工要求：检测报告必须包含方法编号、校准状态、不确定度声明和结果判定依据。'
        ),
        summary='ISO 17025 实验室能力认可的核心管理与技术要求。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='lab:regulation:iso17025-general',
        namespace='cnkis',
        tags=['实验室', 'ISO 17025', '能力认可', '校准'],
        package_id='laboratory_qms',
        canonical_topic='实验室质量管理',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='方法验证与方法确认：区别与必要参数',
        content=(
            '公开依据：ISO 17025:2017 7.2节, ICH Q2(R2)。\n'
            '方法验证(Validation)：新方法或自建方法首次使用前的全面评估——准确度、精密度、'
            '线性、范围、检测限、定量限、专属性、耐用性。\n'
            '方法确认(Verification)：标准方法在本实验室条件下的适用性确认——通常验证精密度、'
            '准确度和检测限即可。\n'
            '数字员工要求：区分验证与确认的场景，非标方法必须完整验证，标准方法至少做确认。'
        ),
        summary='方法验证与方法确认的区别及必要参数清单。',
        entry_type='method_reference',
        source_type='priority_knowledge_seed',
        source_key='lab:method:validation-vs-verification',
        namespace='cnkis',
        tags=['方法验证', '方法确认', 'ISO 17025', 'ICH Q2'],
        package_id='method_validation',
        canonical_topic='方法验证与确认',
        facet='key_metrics',
    ),
    RawKnowledgeInput(
        title='测量不确定度评估：GUM方法与实验室实践',
        content=(
            '公开依据：JCGM 100:2008 (GUM), ISO 17025:2017 7.6节。\n'
            '核心步骤：明确被测量 → 识别不确定度来源 → 量化各分量(A类/B类) → '
            '合成标准不确定度 → 扩展不确定度(k=2, 95%置信度)。\n'
            '常见来源：重复性、再现性、标准物质、校准曲线、环境条件、操作者差异。\n'
            '数字员工要求：定量检测报告必须包含扩展不确定度，并在结果判定时考虑不确定度带来的边界效应。'
        ),
        summary='测量不确定度评估的 GUM 方法及实验室常见不确定度来源。',
        entry_type='method_reference',
        source_type='priority_knowledge_seed',
        source_key='lab:method:measurement-uncertainty-gum',
        namespace='cnkis',
        tags=['测量不确定度', 'GUM', 'ISO 17025'],
        package_id='laboratory_qms',
        canonical_topic='实验室质量管理',
        facet='key_metrics',
    ),
    RawKnowledgeInput(
        title='样品保管链(Chain of Custody)：完整性保障规则',
        content=(
            '公开依据：WHO Lab QMS, FDA 21 CFR Part 58 (GLP)。\n'
            '保管链要求：从采集到销毁，样品的每一次转移必须有记录——\n'
            '- 采集：时间、地点、采集人、容器类型、标识编号\n'
            '- 运输：温度条件、运输时间、运输人\n'
            '- 接收：接收时间、接收人、外观检查、温度确认\n'
            '- 存储：存储位置、温度监控、出入库记录\n'
            '- 检测：领用人、使用量、剩余量\n'
            '- 销毁/留样：销毁方式、见证人、销毁记录\n'
            '任何断链点都可能导致检测结果不被监管认可。\n'
            '数字员工要求：自动检查样品流转记录的完整性，标记缺失环节。'
        ),
        summary='样品保管链从采集到销毁的完整记录要求。',
        entry_type='sop',
        source_type='priority_knowledge_seed',
        source_key='sample:sop:chain-of-custody',
        namespace='cnkis',
        tags=['样品', '保管链', 'GLP', 'WHO'],
        package_id='sample_chain_of_custody',
        canonical_topic='样品保管链',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='设备校准管理：校准周期、校准前置条件与超期处置',
        content=(
            '公开依据：ISO 17025:2017 6.4-6.5节。\n'
            '校准管理要求：\n'
            '- 校准周期：基于设备稳定性、使用频率和历史数据确定，非一刀切\n'
            '- 校准前置：环境条件达标、标准物质在有效期内、校准人员资质\n'
            '- 校准后：校准证书/记录归档、偏差判定、必要时追溯上次校准后的检测结果\n'
            '- 超期处置：校准超期的设备不得用于检测，已用该设备出具的报告需风险评估\n'
            '数字员工要求：设备校准到期前自动预警，超期后阻止该设备关联的检测任务启动。'
        ),
        summary='设备校准的周期确定、前置条件和超期追溯规则。',
        entry_type='sop',
        source_type='priority_knowledge_seed',
        source_key='lab:sop:calibration-management',
        namespace='cnkis',
        tags=['设备', '校准', 'ISO 17025'],
        package_id='laboratory_qms',
        canonical_topic='实验室质量管理',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='异常检测结果处置：OOS与OOT调查流程',
        content=(
            '公开依据：FDA Guidance on OOS Results (2006), PDA TR-65。\n'
            'OOS(超标结果)调查流程：\n'
            '1. 实验室调查：检查仪器状态、试剂效期、操作步骤、计算\n'
            '2. 若发现确定性原因可归因，复测(有严格限制条件)\n'
            '3. 若实验室调查无果，启动全面调查(制造/取样/环境)\n'
            'OOT(超趋势结果)：未超标但偏离历史趋势，需趋势分析和预防措施。\n'
            '数字员工要求：检测结果超出历史范围或规格限时，自动触发OOS/OOT调查流程。'
        ),
        summary='OOS/OOT 异常结果的调查流程与复测条件。',
        entry_type='method_reference',
        source_type='priority_knowledge_seed',
        source_key='lab:method:oos-oot-investigation',
        namespace='cnkis',
        tags=['检测', 'OOS', 'OOT', 'FDA'],
        package_id='laboratory_qms',
        canonical_topic='实验室质量管理',
        facet='sop_risks',
    ),

    # ── 协议设计 + 统计学 + CDISC/ICH E9/E10 ────────────────────────
    RawKnowledgeInput(
        title='ICH E9(R1)：Estimand框架五要素',
        content=(
            '公开依据：ICH E9(R1) Addendum (2019)。\n'
            'Estimand 五要素：\n'
            '1. Population：目标人群\n'
            '2. Treatment：治疗条件(包括背景治疗)\n'
            '3. Variable：终点变量(指标+时点)\n'
            '4. Intercurrent Events：用药中止、转组、救援治疗、死亡等\n'
            '5. Population-level Summary：均值差、比例差、风险比等\n'
            '对各 intercurrent event 的处理策略：treatment policy、composite、hypothetical、principal stratum、while on treatment。\n'
            '数字员工要求：协议统计分析计划(SAP)必须明确每个 estimand 的五要素和 IE 处理策略。'
        ),
        summary='ICH E9(R1) estimand 框架的五要素定义与 IE 处理策略。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='stats:regulation:ich-e9r1-estimand',
        namespace='cnkis',
        tags=['统计学', 'ICH E9', 'estimand', 'SAP'],
        package_id='protocol_statistics',
        canonical_topic='协议统计学',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='ICH E10：对照组选择原则与伦理约束',
        content=(
            '公开依据：ICH E10 (2000)。\n'
            '对照组类型：安慰剂对照、活性对照(非劣效/等效)、无治疗对照、剂量-反应、加载。\n'
            '选择原则：\n'
            '- 有有效治疗存在时，安慰剂对照需评估伦理可接受性\n'
            '- 非劣效设计需预先确定非劣效界值(margin)及其临床依据\n'
            '- 等效设计需两侧检验和历史灵敏度证据\n'
            '数字员工要求：方案设计时必须论证对照组选择的伦理和科学合理性。'
        ),
        summary='ICH E10 对照组类型选择的原则与伦理约束。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='stats:regulation:ich-e10-control-group',
        namespace='cnkis',
        tags=['统计学', 'ICH E10', '对照组', '非劣效'],
        package_id='protocol_statistics',
        canonical_topic='协议统计学',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='样本量估算：关键参数与常见设计类型',
        content=(
            '公开方法学：ICH E9, FDA Guidance on Adaptive Designs。\n'
            '关键参数：\n'
            '- 一类错误(alpha)：通常0.05(双侧)或0.025(单侧)\n'
            '- 检验效能(power)：通常80%或90%\n'
            '- 效应量(effect size)：基于临床意义的最小有意义差异(MCID)\n'
            '- 变异度(SD/比例)：来自前期研究或文献\n'
            '- 脱落率调整：考虑失访、不依从、中止\n'
            '常见设计：优效、非劣效、等效、交叉、配对、分层随机、自适应。\n'
            '数字员工要求：方案中的样本量计算必须列出所有假设参数及其来源。'
        ),
        summary='样本量估算的关键参数、常见设计类型和假设参数要求。',
        entry_type='method_reference',
        source_type='priority_knowledge_seed',
        source_key='stats:method:sample-size-estimation',
        namespace='cnkis',
        tags=['统计学', '样本量', '检验效能', 'MCID'],
        package_id='protocol_statistics',
        canonical_topic='协议统计学',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='缺失数据处理策略：ICH E9(R1)与FDA指南',
        content=(
            '公开依据：ICH E9(R1), FDA Guidance on Missing Data (2010)。\n'
            '策略层次：\n'
            '1. 预防：设计阶段减少缺失(缩短访视窗、电子提醒、远程采集)\n'
            '2. 分析：主分析选择与 estimand 一致的方法(MMRM、MI、LOCF等)\n'
            '3. 敏感性分析：假设缺失数据为最差/最好情况，验证结论稳健性\n'
            '缺失机制假设：MCAR、MAR、MNAR 需在 SAP 中说明。\n'
            '数字员工要求：SAP 必须说明缺失数据处理方法、假设的缺失机制和敏感性分析计划。'
        ),
        summary='缺失数据处理的预防-分析-敏感性三层策略。',
        entry_type='method_reference',
        source_type='priority_knowledge_seed',
        source_key='stats:method:missing-data-strategies',
        namespace='cnkis',
        tags=['统计学', '缺失数据', 'MMRM', 'MI', 'estimand'],
        package_id='protocol_statistics',
        canonical_topic='协议统计学',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='SPIRIT声明：协议必备条目清单',
        content=(
            '公开依据：SPIRIT 2013 Statement, Chan et al. Ann Intern Med 2013。\n'
            '核心必备条目(33条)涵盖：\n'
            '- 行政信息：标题、注册号、角色分工、资金来源\n'
            '- 引言：背景、目的、获益风险\n'
            '- 方法：设计、人群、干预、终点、随机化、盲法、样本量\n'
            '- 统计：分析计划、期中分析、缺失数据\n'
            '- 伦理与传播：知情同意、数据共享、发表计划\n'
            '数字员工要求：协议审查时逐条检查 SPIRIT 清单完整性。'
        ),
        summary='SPIRIT 协议报告规范的 33 条必备条目清单。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='stats:regulation:spirit-checklist',
        namespace='cnkis',
        tags=['协议', 'SPIRIT', '报告规范', '清单'],
        package_id='protocol_statistics',
        canonical_topic='协议统计学',
        facet='reporting_templates',
    ),
    RawKnowledgeInput(
        title='CONSORT声明：随机对照试验报告清单',
        content=(
            '公开依据：CONSORT 2010 Statement, Schulz et al. BMJ 2010。\n'
            '核心要求：受试者流程图(enrollment → allocation → follow-up → analysis)、'
            '随机化方法、分配隐藏、盲法、基线特征、主要终点结果(效应量+CI+p值)、'
            '亚组分析预设与否、不良事件。\n'
            '扩展版本：针对非药物干预、cluster RCT、PRO、中药等有专门扩展。\n'
            '数字员工要求：临床研究报告必须按 CONSORT 流程图展示受试者流向。'
        ),
        summary='CONSORT 随机对照试验报告的核心条目与流程图要求。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='stats:regulation:consort-checklist',
        namespace='cnkis',
        tags=['报告', 'CONSORT', 'RCT', '流程图'],
        package_id='report_compliance',
        canonical_topic='报告合规',
        facet='reporting_templates',
    ),
    RawKnowledgeInput(
        title='不良事件分级与因果判定：ICH E2A与CTCAE',
        content=(
            '公开依据：ICH E2A (1994), NCI CTCAE v5.0。\n'
            '不良事件分级(CTCAE)：\n'
            '- Grade 1(轻度)：无症状或轻微\n'
            '- Grade 2(中度)：需要局部/非侵入性治疗\n'
            '- Grade 3(严重)：需要住院或延长住院\n'
            '- Grade 4(危及生命)\n'
            '- Grade 5(死亡)\n'
            '因果判定(ICH E2A)：Certain, Probable/Likely, Possible, Unlikely, '
            'Conditional/Unclassified, Unassessable/Unclassifiable。\n'
            'SAE报告时限：通常24小时内初报，15天内详细报告。\n'
            '数字员工要求：不良事件记录必须包含分级、因果判定和时限提醒。'
        ),
        summary='不良事件严重程度分级(CTCAE)与因果判定方法(ICH E2A)。',
        entry_type='regulation',
        source_type='priority_knowledge_seed',
        source_key='safety:regulation:ae-grading-causality',
        namespace='cnkis',
        tags=['安全', '不良事件', 'CTCAE', 'ICH E2A', '因果判定'],
        package_id='adverse_event',
        canonical_topic='不良反应',
        facet='regulation_boundary',
    ),
]


class Command(BaseCommand):
    help = '补强第一优先级公开知识：伦理/知情同意、实验室标准、协议统计学'

    def add_arguments(self, parser):
        parser.add_argument(
            '--disable-llm-enrich',
            action='store_true',
            help='关闭 LLM 富化，走稳定规则管线',
        )

    def handle(self, *args, **options):
        if options.get('disable_llm_enrich'):
            import apps.knowledge.ingestion_pipeline as pipeline_module

            pipeline_module._LLM_ENRICH_ENABLED = False
            self.stdout.write('已关闭 LLM 富化，使用稳定规则管线落库。')

        created = 0
        skipped = 0
        errors = 0

        for raw in SEEDS:
            state = self._ingest(raw)
            created += int(state == 'created')
            skipped += int(state == 'skipped')
            errors += int(state == 'error')

        self.stdout.write(
            self.style.SUCCESS(
                f'第一优先级知识补强完成: created={created} skipped={skipped} errors={errors}'
            )
        )

    def _ingest(self, raw: RawKnowledgeInput) -> str:
        existed_before = KnowledgeEntry.objects.filter(
            source_type=raw.source_type,
            source_key=raw.source_key,
            is_deleted=False,
        ).exists()
        try:
            result = run_pipeline(raw)
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f'  x {raw.title[:70]} | {exc}'))
            return 'error'

        if result and result.entry_id:
            KnowledgeEntry.objects.filter(id=result.entry_id).update(
                status='published',
                is_published=True,
            )

        if result and result.entry_id and not existed_before:
            self.stdout.write(self.style.SUCCESS(f'  + [{result.entry_id}] {raw.title[:70]}'))
            return 'created'

        self.stdout.write(f'  - skip: {raw.title[:70]}')
        return 'skipped'
