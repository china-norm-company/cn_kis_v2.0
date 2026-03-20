"""
为数字员工上线前必须通过的 Tier-0 专题包灌入高价值种子知识。

目标：
1. 直接创建/填充 8 个 release-critical TopicPackage
2. 每个专题包至少补齐 3 条高质量、已分类、可追溯的种子知识
3. 优先覆盖法规边界 / SOP 风险 / FAQ 误区 / 报告模板等高价值 facet
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline


TIER0_SEEDS = [
    RawKnowledgeInput(
        title='功效宣称证据要求总则（NMPA 公开规则摘要）',
        content='依据《化妆品功效宣称评价规范》，化妆品功效宣称应当有充分的科学依据支撑。防晒、祛斑美白、抗皱、防脱发、祛痘、滋养修护等重点功效通常需要人体功效评价、消费者使用测试或实验室研究等相应证据。证据应与宣称强度一致，不可用弱证据支撑强结论，也不可把一般性描述包装成临床级结论。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='tier0:efficacy_claims:regulation:001',
        namespace='nmpa_regulation',
        tags=['功效宣称', 'NMPA', '证据要求', '法规'],
        package_id='efficacy_claims',
        canonical_topic='功效宣称',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='功效宣称报告结论句撰写模板',
        content='报告结论应先写研究对象、研究周期、评价方法，再写统计结果和结论边界。例如：“在规定样本和既定使用条件下，产品连续使用 28 天后，Corneometer 指标较基线显著升高（p<0.05），提示该产品具有保湿功效。”禁止直接写“绝对有效”“完全修复”“医学治疗级”之类超范围表述。',
        entry_type='proposal_template',
        source_type='manual_ingest',
        source_key='tier0:efficacy_claims:template:001',
        namespace='cnkis',
        tags=['功效宣称', '报告模板', '结论句', '合规'],
        package_id='efficacy_claims',
        canonical_topic='功效宣称',
        facet='reporting_templates',
    ),
    RawKnowledgeInput(
        title='功效宣称常见误区 FAQ：消费者体验能否直接替代人体功效结论',
        content='消费者自评可以作为支持性证据，但通常不能单独替代关键功效的人体客观评价结论。若宣称涉及美白、抗皱、防晒等重点功效，需要与适配的客观指标、研究设计和统计证据联用。仅凭主观满意度或营销话术，不足以支撑高强度功效宣称。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='tier0:efficacy_claims:faq:001',
        namespace='cnkis',
        tags=['功效宣称', 'FAQ', '消费者体验', '误区'],
        package_id='efficacy_claims',
        canonical_topic='功效宣称',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='化妆品不良反应监测管理要点（公开法规摘要）',
        content='化妆品不良反应监测强调及时发现、及时报告、及时处置。对疑似与产品使用有关的皮肤刺激、红斑、瘙痒、水肿、灼热感等，应记录发生时间、部位、严重程度、伴随处理和转归。严重或聚集性事件应升级报告，并保留原始记录、照片、受试者访谈和产品批次信息。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='tier0:adverse_event:regulation:001',
        namespace='nmpa_regulation',
        tags=['不良反应', 'AE', '法规', '监测'],
        package_id='adverse_event',
        canonical_topic='不良反应',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='不良反应处置 SOP：发现到上报的闭环',
        content='发现疑似不良反应后，应立即停止相关测试步骤，先进行受试者安全评估，再通知研究者和项目负责人。同步记录时间点、症状、严重程度、处理措施和是否转诊。24 小时内完成初始事件记录，必要时形成偏差/CAPA，并追踪至症状缓解或结案。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='tier0:adverse_event:sop:001',
        namespace='internal_sop',
        tags=['不良反应', 'SOP', '上报', '闭环'],
        package_id='adverse_event',
        canonical_topic='不良反应',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='斑贴试验中刺激反应与过敏反应的区分提示',
        content='刺激反应通常局限、出现较快，且与剂量和接触条件相关；过敏反应可能延迟出现，并伴更明显的炎症表现。现场记录不应直接下最终医学诊断，但应准确描述表现、级别、范围和时间进展，并根据预设阈值启动研究者复核和后续随访。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='tier0:adverse_event:method:001',
        namespace='cnkis',
        tags=['斑贴试验', '刺激反应', '过敏反应', '不良反应'],
        package_id='adverse_event',
        canonical_topic='不良反应',
        facet='core_concepts',
    ),
    RawKnowledgeInput(
        title='ICH E6(R2) 知情同意与受试者权益摘要',
        content='ICH E6(R2) 要求在研究开始前向受试者提供充分信息，包括研究目的、流程、可能风险、获益、替代方案、隐私保护和退出权利。知情同意必须基于自愿，研究者应确保受试者有时间提问和考虑，且不会因为拒绝参加而失去应得照护或权益。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='tier0:subject_rights:regulation:001',
        namespace='cnkis',
        tags=['受试者权益', '知情同意', 'ICH E6', 'GCP'],
        package_id='subject_rights',
        canonical_topic='受试者权益',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='受试者隐私与撤回权 FAQ',
        content='受试者有权在任何阶段退出研究，退出后应按预设流程说明后续安全随访安排。个人身份信息、联系方式、照片和病史仅限授权人员访问，任何跨系统共享都应进行脱敏或最小必要原则处理。退出、拒答、拒绝拍照等，不应被视为违约行为。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='tier0:subject_rights:faq:001',
        namespace='cnkis',
        tags=['受试者权益', '隐私', '撤回权', 'FAQ'],
        package_id='subject_rights',
        canonical_topic='受试者权益',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='知情同意执行 SOP：解释、确认、签署、留档',
        content='知情同意执行应包含四步：解释研究内容和风险、确认理解程度、完成签署、留存副本与原件归档。若受试者存在理解障碍或语言障碍，应提供适配支持。签署日期、版本号、执行人员和见证信息必须完整，避免出现补签、倒签或版本错用。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='tier0:subject_rights:sop:001',
        namespace='internal_sop',
        tags=['知情同意', 'SOP', '留档', '受试者权益'],
        package_id='subject_rights',
        canonical_topic='受试者权益',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='报告合规最小要素清单',
        content='功效评价报告至少应包含：研究目的、产品信息、受试者特征、研究设计、样本量与脱落说明、评价方法、时间点、统计方法、主要结果、偏差/异常说明、结论边界和签章信息。缺失统计方法、样本流向或原始数据可追溯信息，会显著削弱报告的合规可信度。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='tier0:report_compliance:regulation:001',
        namespace='cnkis',
        tags=['报告合规', '最小要素', '签章', '统计'],
        package_id='report_compliance',
        canonical_topic='报告合规',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='报告结论合规模板：数字、方法、边界同时出现',
        content='高质量结论模板应同时包含数字结果、方法来源和适用边界，例如：“在 32 名完成评估的受试者中，产品连续使用 28 天后 TEWL 较基线下降 12.4%，配对 t 检验 p<0.05；在本研究条件下提示产品具有皮肤屏障改善作用。”模板中不得省略样本量、方法或边界。',
        entry_type='proposal_template',
        source_type='manual_ingest',
        source_key='tier0:report_compliance:template:001',
        namespace='cnkis',
        tags=['报告合规', '模板', '结论', '统计'],
        package_id='report_compliance',
        canonical_topic='报告合规',
        facet='reporting_templates',
    ),
    RawKnowledgeInput(
        title='报告返工高频原因 FAQ',
        content='报告返工的高频原因包括：样本量和完成集口径不一致、统计方法与方案不一致、结论超出证据强度、图表数字与正文不一致、偏差记录缺失、签章链不完整。数字员工在生成或审校报告时，应优先检查这些高频失误点。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='tier0:report_compliance:faq:001',
        namespace='cnkis',
        tags=['报告合规', '返工', 'FAQ', '审校'],
        package_id='report_compliance',
        canonical_topic='报告合规',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='中国化妆品监管框架核心摘要',
        content='中国化妆品监管框架以《化妆品监督管理条例》为总纲，配套注册备案、标签、生产质量、安全监测和功效评价等规则。对数字员工而言，法规合规不只是找一条条文，而是能把宣称边界、原料边界、数据留痕、报告责任和上市后安全监测串成完整闭环。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='tier0:regulatory_compliance:regulation:001',
        namespace='nmpa_regulation',
        tags=['法规合规', '监管框架', '化妆品', 'NMPA'],
        package_id='regulatory_compliance',
        canonical_topic='法规合规',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='法规合规中的高风险宣称边界',
        content='涉及美白祛斑、抗皱、防脱发、防晒、祛痘等重点功效的宣称通常比一般感官型描述要求更高，必须匹配更严格的研究设计与证据路径。数字员工在客户咨询、报告撰写和市场文案审核时，应优先识别高风险功效词，并主动提示证据等级和限制条件。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='tier0:regulatory_compliance:claim:001',
        namespace='cnkis',
        tags=['法规合规', '宣称边界', '高风险功效'],
        package_id='regulatory_compliance',
        canonical_topic='法规合规',
        facet='claim_boundary',
    ),
    RawKnowledgeInput(
        title='法规合规 FAQ：内部 SOP 能否替代国家法规',
        content='内部 SOP 不能替代国家法规和监管要求。SOP 的作用是把法规、标准和机构实践落地到操作层，若 SOP 与法规冲突，应以更高层级、更高权威的法规或标准为准，并及时触发 SOP 修订。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='tier0:regulatory_compliance:faq:001',
        namespace='cnkis',
        tags=['法规合规', 'SOP', 'FAQ', '权威层级'],
        package_id='regulatory_compliance',
        canonical_topic='法规合规',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='预约与改约窗口规则',
        content='预约管理应明确允许改约的时间窗口、受试者确认方式、失败重约次数和资源重排原则。访视前 24 小时未确认、受试者到场条件不满足、关键设备不可用等，都应触发重排策略，并同步通知招募、执行和现场团队，避免口头承诺与系统排程不一致。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='tier0:booking_policy:sop:001',
        namespace='internal_sop',
        tags=['预约', '改约', '排程', 'SOP'],
        package_id='booking_policy',
        canonical_topic='招募与预约',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='失访与爽约处置 FAQ',
        content='失访和爽约不应只做“记一次未到场”，而应区分原因、风险级别和是否需要二次联系。高价值或高风险受试者可按预设剧本进行二次提醒、改约建议或人工接管。数字员工应保留联系记录、时间戳和结果标签，为后续转化与依从性分析提供数据基础。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='tier0:booking_policy:faq:001',
        namespace='cnkis',
        tags=['招募', '预约', '爽约', 'FAQ'],
        package_id='booking_policy',
        canonical_topic='招募与预约',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='受试者筛选与预约衔接的关键字段',
        content='招募到预约的关键衔接字段包括：入排标准结论、评估部位限制、过敏史、近期用药、可到访时间段、联系电话确认状态、是否完成知情同意预沟通。字段缺失会直接造成改约率上升、现场冲突和访视失败。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='tier0:booking_policy:method:001',
        namespace='cnkis',
        tags=['招募', '预约', '筛选', '关键字段'],
        package_id='booking_policy',
        canonical_topic='招募与预约',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='设备故障与校准失败处置规则',
        content='当仪器校准失败、测量漂移超阈值或关键部件异常时，应立即停止使用该设备，并标识受影响时间段、受影响样本和可疑数据范围。后续处置应包括复测评估、备用设备切换、维护工单、偏差记录和必要的报告影响评估。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='tier0:equipment_failure:regulation:001',
        namespace='cnkis',
        tags=['设备故障', '校准失败', '数据影响', '规则'],
        package_id='equipment_failure',
        canonical_topic='设备故障',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='设备故障应急 SOP：停机、隔离、评估、切换',
        content='设备故障应急 SOP 建议固定四步：停机并隔离故障设备、评估受影响数据和访视任务、切换备用设备或改约、完成维护和偏差闭环。若故障影响已完成测量结果，应明确是否需要复测，以及哪些报告或结论必须加注限制说明。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='tier0:equipment_failure:sop:001',
        namespace='internal_sop',
        tags=['设备故障', '应急', 'SOP', '备用设备'],
        package_id='equipment_failure',
        canonical_topic='设备故障',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='设备故障 FAQ：仪器异常时能否继续记录数据',
        content='若设备状态不稳定、校准未通过或环境条件异常，一般不应继续采集正式数据。可先记录故障观察和排查信息，但正式研究数据应在设备恢复并确认合格后重新采集，避免把可疑数据直接混入分析集。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='tier0:equipment_failure:faq:001',
        namespace='cnkis',
        tags=['设备故障', 'FAQ', '数据采集', '校准'],
        package_id='equipment_failure',
        canonical_topic='设备故障',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='现场异常升级判定规则',
        content='现场异常包括环境超限、设备故障、受试者突发不适、关键物料缺失、流程执行错误等。应按对受试者安全、数据完整性、排程连续性和报告可信度的影响进行分级。高等级异常必须进入即时升级和人工确认链，不应仅由聊天式 AI 给出建议后自动结束。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='tier0:site_incident:regulation:001',
        namespace='cnkis',
        tags=['现场异常', '升级', '风险分级'],
        package_id='site_incident',
        canonical_topic='现场异常',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='现场异常处置 SOP：环境超限与流程偏差',
        content='当现场温湿度超出方案或仪器要求范围、关键流程步骤遗漏或样本标识异常时，应立即暂停相关操作，锁定受影响任务，记录时间、位置、责任角色和初步影响判断，并同步触发排程调整、复核和偏差/CAPA 流程。',
        entry_type='sop',
        source_type='manual_ingest',
        source_key='tier0:site_incident:sop:001',
        namespace='internal_sop',
        tags=['现场异常', '环境超限', '偏差', 'SOP'],
        package_id='site_incident',
        canonical_topic='现场异常',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='现场异常 FAQ：何时必须转人工',
        content='当出现受试者安全问题、可能影响主要终点的数据异常、跨部门资源冲突无法自动收敛、法律或伦理风险、以及需要对外正式沟通的事件时，数字员工必须升级到人工。转人工不是失败，而是合规运行的一部分。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='tier0:site_incident:faq:001',
        namespace='cnkis',
        tags=['现场异常', '转人工', 'FAQ', '合规'],
        package_id='site_incident',
        canonical_topic='现场异常',
        facet='faq_misconceptions',
    ),
]


class Command(BaseCommand):
    help = '灌入数字员工上线前必须通过的 Tier-0 专题包种子知识'

    def handle(self, *args, **options):
        created = 0
        skipped = 0
        errors = 0

        self.stdout.write(f'开始灌入 {len(TIER0_SEEDS)} 条 Tier-0 种子知识...')
        for raw in TIER0_SEEDS:
            try:
                result = run_pipeline(raw)
                if result and result.entry_id and result.status != 'duplicate_skipped':
                    created += 1
                    self.stdout.write(self.style.SUCCESS(f'  ✓ [{result.entry_id}] {raw.title[:60]}'))
                else:
                    skipped += 1
                    self.stdout.write(f'  - 跳过（已存在）: {raw.title[:60]}')
            except Exception as exc:
                errors += 1
                self.stdout.write(self.style.ERROR(f'  ✗ 失败: {raw.title[:60]} | {exc}'))

        self.stdout.write(
            self.style.SUCCESS(
                f'完成: created={created} skipped={skipped} errors={errors}'
            )
        )
