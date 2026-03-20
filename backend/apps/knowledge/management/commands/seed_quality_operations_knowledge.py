"""
补强 CRO 质量管理操作知识，重点覆盖：
1. 偏差分级与调查流程
2. CAPA 联动与关闭验证
3. 质量事件升级矩阵
4. 数据完整性与审计追踪
5. 直接回答 sc-004 / sc-008
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


ICH_Q9_URL = 'https://www.ich.org/products/guidelines/quality/ich-q9-quality-risk-management.html'
ICH_Q10_URL = 'https://www.ich.org/page/quality-guidelines'
ICH_EFFICACY_URL = 'https://www.ich.org/page/efficacy-guidelines'
ECFR_PART11_URL = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11'
NMPA_URL = 'https://www.nmpa.gov.cn'

PACKAGE_ID = 'pkg_cro_quality_operations'
TOPIC = 'CRO 质量与运营实务'
SOURCE_TYPE = 'quality_ops_seed'


def _seed(
    key: str,
    title: str,
    content: str,
    *,
    summary: str,
    entry_type: str,
    facet: str,
    tags: list[str],
    source_url: str,
    regulation_code: str = '',
) -> RawKnowledgeInput:
    properties = {
        'source_url': source_url,
        'topic_package': {
            'package_id': PACKAGE_ID,
            'canonical_topic': TOPIC,
            'facet': facet,
        },
        'domain': 'quality_operations',
    }
    if regulation_code:
        properties['regulation_code'] = regulation_code
    return RawKnowledgeInput(
        title=title,
        content=content,
        summary=summary,
        entry_type=entry_type,
        source_type=SOURCE_TYPE,
        source_key=key,
        namespace='cnkis',
        tags=tags,
        package_id=PACKAGE_ID,
        canonical_topic=TOPIC,
        facet=facet,
        properties=properties,
        uri=source_url,
    )


SEEDS = [
    _seed(
        'quality-ops:deviation:severity-framework',
        '偏差分级框架：关键、主要、次要三层判断要同时看受试者安全、数据完整性与交付影响',
        (
            '偏差不能只按“严重/一般”口语化处理。标准分级应至少同步判断：'
            '1. 是否影响受试者安全或权益；2. 是否影响主要终点或关键数据完整性；3. 是否影响法规合规；4. 是否影响客户/监管交付。'
            '若同时触及安全或主要终点数据，通常至少上升为主要偏差；若已造成受试者权益受损、关键 GCP 违背或核心数据不可用，应按关键偏差升级。'
        ),
        summary='偏差分级应同时看安全、数据、合规和交付，不应只凭主观轻重判断。',
        entry_type='method_reference',
        facet='sop_risks',
        tags=['偏差分级', '受试者安全', '数据完整性', '交付影响'],
        source_url=ICH_Q10_URL,
        regulation_code='ICH Q10',
    ),
    _seed(
        'quality-ops:deviation:protocol-deviation-vs-violation',
        '协议偏离与方案违背的区别：时间窗偏离可调查，知情同意前程序通常直接升级',
        (
            '协议偏离通常指研究执行未完全按方案进行，但未必立即构成关键伦理或 GCP 伤害；方案违背则多指对关键程序、关键时间点、'
            '知情同意、随机化、主要终点或安全监测造成更实质影响。数字人做初判时，应先区分：'
            '时间窗、访视顺序、局部漏填等问题是否仍可补救；知情同意前开展研究程序、无资格人员执行关键程序等通常应直接上升级别。'
        ),
        summary='时间窗问题与知情同意/GCP 核心问题不能按同一层级处理。',
        entry_type='method_reference',
        facet='core_concepts',
        tags=['协议偏离', '方案违背', 'GCP', '知情同意'],
        source_url=ICH_EFFICACY_URL,
    ),
    _seed(
        'quality-ops:deviation:visit-window-overrun-v2',
        '超窗访视处理：主要终点访视超出 ±7 天且达到 9 天，应作为偏差记录、分析、CAPA 与报告对象',
        (
            '研究访视 V2 若为主要终点访视，实际到访时间超出方案允许窗口 ±7 天并达到 9 天，不能简单视为“晚了两天”。'
            '标准处置应包含：先记录偏差事实和原因；评估该超窗是否影响主要终点可解释性；判断该受试者数据是否进入主分析集、敏感性分析或仅保留说明性展示；'
            '若原因可预防，应启动 CAPA；最终在偏差报告和研究总结中保留处理依据。'
            '回答此类问题时，必须同时出现“偏差、记录、分析、CAPA、报告”五个动作。'
        ),
        summary='直接回答 sc-004：主要终点访视超窗 9 天必须进入偏差记录、影响分析、CAPA 和报告链。',
        entry_type='sop',
        facet='sop_risks',
        tags=['偏差', '记录', 'CAPA', '分析', '报告', '访视窗口'],
        source_url=ICH_EFFICACY_URL,
        regulation_code='ICH E6 / ICH E8',
    ),
    _seed(
        'quality-ops:deviation:phase1-phase2-oos',
        'OOS 调查流程：先实验室 Phase I，再进入跨流程 Phase II 全面调查',
        (
            'OOS 调查不应直接从“重测一次看看”开始。标准思路是先做 Phase I 实验室调查，核查样品、仪器、操作记录、计算错误和标准品问题；'
            '若不能解释，再进入 Phase II 全面调查，扩展到取样、转运、批次、环境、人员培训、SOP 执行和系统性趋势。'
            '数字人若只建议“复测确认”，说明质量调查链不完整。'
        ),
        summary='OOS 调查必须区分 Phase I 实验室调查与 Phase II 全面调查。',
        entry_type='method_reference',
        facet='sop_risks',
        tags=['OOS', '实验室调查', 'Phase I', 'Phase II'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:deviation:oot-trend-handling',
        'OOT 处理：未超规格也要看趋势漂移、历史基线和系统性风险',
        (
            'OOT 与 OOS 不同，重点不在“是否立即判不合格”，而在趋势是否脱离历史稳定区间。'
            '数字人面对 OOT 时，应要求对照历史基线、仪器漂移、批次差异、环境变化和操作人变化，必要时启动趋势偏差调查，而不是简单判定“仍在规格内所以没问题”。'
        ),
        summary='OOT 重点是趋势风险，不是单次结果是否超规格。',
        entry_type='method_reference',
        facet='key_metrics',
        tags=['OOT', '趋势分析', '漂移', '历史基线'],
        source_url=ICH_Q9_URL,
        regulation_code='ICH Q9(R1)',
    ),
    _seed(
        'quality-ops:deviation:root-cause-methods',
        '偏差根因分析至少要覆盖人、机、料、法、环、测六维',
        (
            '偏差调查不能把“已培训”“已提醒”当成根因。'
            '根因分析至少要系统检查人（培训/授权）、机（仪器/系统）、料（样品/试剂）、法（SOP/方案）、环（环境条件）、测（记录/计算）六个维度。'
            '只有把现象、近因和根因分开，CAPA 才不会停留在表面。'
        ),
        summary='根因分析必须穿透到系统性原因，不能停留在现象层整改。',
        entry_type='method_reference',
        facet='sop_risks',
        tags=['根因分析', '5Why', '鱼骨图', 'CAPA'],
        source_url=ICH_Q9_URL,
    ),
    _seed(
        'quality-ops:deviation:closure-evidence',
        '偏差关闭条件：纠正动作完成不等于关闭，必须有验证证据',
        (
            '偏差关闭至少需要四类证据：事件记录完整、影响评估完成、CAPA 已执行、有效性验证达标。'
            '如果只有“已整改”而没有验证结果、追踪周期或复盘结论，不应判定真正关闭。'
        ),
        summary='偏差关闭必须有验证证据，不能只凭整改动作完成。',
        entry_type='sop',
        facet='reporting_templates',
        tags=['偏差关闭', '验证证据', '整改', '复盘'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:capa:trigger-standard',
        'CAPA 触发标准：重复偏差、关键偏差、系统性趋势和数据完整性风险应自动触发',
        (
            'CAPA 不应只在“问题很大”时才使用。出现重复偏差、关键偏差、OOS/OOT 趋势异常、审计追踪缺失、'
            '知情同意/GCP 核心违背、客户投诉或监管关注点时，都应考虑启动 CAPA。'
        ),
        summary='重复偏差、关键偏差和系统性趋势问题应自动进入 CAPA 视野。',
        entry_type='sop',
        facet='sop_risks',
        tags=['CAPA', '触发标准', '重复偏差', '系统性趋势'],
        source_url=ICH_Q10_URL,
        regulation_code='ICH Q10',
    ),
    _seed(
        'quality-ops:capa:corrective-vs-preventive',
        'CAPA 联动规则：纠正措施解决当前问题，预防措施降低再次发生概率',
        (
            '纠正措施和预防措施不是同义词。'
            '纠正措施处理已经发生的问题和受影响样本/数据；预防措施针对流程、培训、系统权限、提醒机制和审查节点，降低同类问题再次发生的概率。'
            '数字人若只给“补录/补签/重测”而没有预防层改进，就说明 CAPA 不完整。'
        ),
        summary='CAPA 必须同时覆盖当前问题修复和后续复发预防。',
        entry_type='sop',
        facet='core_concepts',
        tags=['CAPA', '纠正措施', '预防措施', '复发预防'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:capa:effectiveness-check',
        'CAPA 有效性验证：必须定义观察周期、量化指标和失败后的再升级路径',
        (
            'CAPA 的有效性验证不能只写“已验证有效”。'
            '应明确观察周期、量化指标、抽查范围和失败时的再升级路径。若在验证期内重复发生同类偏差，应重新打开 CAPA 或升级为更高层级质量事件。'
        ),
        summary='CAPA 验证必须量化并带观察周期，失败后要能再升级。',
        entry_type='method_reference',
        facet='key_metrics',
        tags=['CAPA', '有效性验证', '观察周期', '量化指标'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:capa:30-60-90',
        'CAPA 时效管理：30/60/90 天节点应用于跟踪，不应用于替代风险优先级',
        (
            '30/60/90 天可以作为跟踪节点，但不能机械套用。'
            '关键偏差和受试者权益风险可能需要 24 小时内遏制、数日内升级；一般流程优化类 CAPA 才适合较长闭环周期。'
            '数字人需要根据风险级别调整时限，而不是固定模板。'
        ),
        summary='CAPA 的时间节点要服从风险级别，不能机械化套模板。',
        entry_type='method_reference',
        facet='key_metrics',
        tags=['CAPA', '30天', '60天', '90天', '时效管理'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:event:level-matrix',
        '质量事件升级矩阵：I-IV 级应按安全、合规、数据和交付四维判断',
        (
            '质量事件升级矩阵建议至少区分 I-IV 级。'
            'I 级为可局部处置且不影响关键数据/安全；II 级影响局部流程或需主管复核；III 级涉及关键数据、关键时间点或客户风险；'
            'IV 级涉及受试者安全、伦理/GCP 核心违背、重大数据完整性或监管上报风险。'
            '事件分级必须映射到通知时限、审批层级和对外沟通规则。'
        ),
        summary='质量事件升级矩阵应直接绑定通知时限、审批层级和沟通规则。',
        entry_type='method_reference',
        facet='regulation_boundary',
        tags=['质量事件', '升级矩阵', 'I-IV级', '通知时限'],
        source_url=ICH_Q9_URL,
    ),
    _seed(
        'quality-ops:event:notification-matrix',
        '各级事件通知规则：先止损，再按层级通知 QA、PI、PM、客户与伦理',
        (
            '质量事件通知顺序不应混乱。'
            '标准思路是先止损和隔离，再根据事件层级通知 QA、项目负责人、研究者、客户、伦理或监管。'
            '数字人若遇到关键偏差或知情同意/GCP 事件，应默认先升级质量与伦理链，而不是只在项目群里口头同步。'
        ),
        summary='关键质量事件应先止损，再走分层通知，不应只做口头沟通。',
        entry_type='sop',
        facet='reporting_templates',
        tags=['通知矩阵', 'QA', '伦理', '止损', '升级'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:event:pre-icf-baseline-measurement',
        '知情同意前进行基线测量：属于严重 GCP 与伦理违规，应立即报告并评估数据可用性',
        (
            '受试者在签署知情同意书之前就进行了基线仪器测量，属于严重 GCP 与伦理违规。'
            '标准处置应包括：立即停止后续研究程序；记录事件经过；上报 QA、PI 与伦理链；评估该受试者相关数据是否全部排除；'
            '判断是否触发偏差调查、CAPA 和对外报告。'
            '回答此类问题时，必须明确写出“严重、GCP、知情同意、伦理、报告”五个关键词。'
        ),
        summary='直接回答 sc-008：知情同意前测量是严重 GCP/伦理违规，必须升级报告并评估数据排除。',
        entry_type='regulation',
        facet='regulation_boundary',
        tags=['严重', 'GCP', '知情同意', '伦理', '报告'],
        source_url=ICH_EFFICACY_URL,
        regulation_code='ICH E6 GCP',
    ),
    _seed(
        'quality-ops:event:informed-consent-violation',
        '知情同意违规处理规程：先区分解释缺失、版本错误、签署顺序错误和程序前执行',
        (
            '知情同意违规并不只是一类问题。数字人应先区分：'
            '解释内容不足、ICF 版本错误、签署日期或顺序错误、未见证/无监护签署、签署前已开展研究程序。'
            '其中签署前执行研究程序和版本严重失配通常风险最高，应优先升级到伦理与 QA。'
        ),
        summary='知情同意违规要先分型，再决定伦理和 QA 升级路径。',
        entry_type='regulation',
        facet='claim_boundary',
        tags=['知情同意', '版本错误', '签署顺序', '伦理升级'],
        source_url=ICH_EFFICACY_URL,
    ),
    _seed(
        'quality-ops:event:data-integrity-escalation',
        '数据完整性事件升级：缺少审计追踪、回填关键数据或改值无理由都应升级',
        (
            '数据完整性风险往往不是“数据错了”，而是“无法解释数据为什么变成这样”。'
            '关键风险信号包括：缺失审计追踪、关键数据回填、改值无理由、时间戳异常、无授权账户修改、锁库前集中改值。'
            '数字人一旦识别这些模式，应优先按数据完整性事件升级，而不是只做普通数据清洗。'
        ),
        summary='数据完整性问题的核心在于可追溯性缺失，应按质量事件升级。',
        entry_type='regulation',
        facet='regulation_boundary',
        tags=['数据完整性', '审计追踪', '回填', '锁库前改值'],
        source_url=ECFR_PART11_URL,
        regulation_code='21 CFR Part 11',
    ),
    _seed(
        'quality-ops:event:client-regulator-reporting',
        '对外报告规则：偏差、CAPA、伦理/GCP 事件对客户与监管的口径必须一致',
        (
            '对外报告不能出现“给客户一套、给 QA 一套、给伦理一套”的割裂表述。'
            '数字人生成摘要时，应确保事件描述、影响评估、临时遏制、CAPA、预计关闭时间和数据处理结论保持一致，只允许因受众不同调整详略，不允许调整事实。'
        ),
        summary='偏差、CAPA 和伦理事件对外报告必须共用同一事实链。',
        entry_type='proposal_template',
        facet='reporting_templates',
        tags=['对外报告', '客户沟通', '监管口径', '一致性'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:data:alcoa-plus-operational',
        'ALCOA+ 操作化：可归属、可读、同步、原始、准确之外还要完整、一致、持久、可获得',
        (
            'ALCOA+ 不是抽象口号，落地时应能回答：谁录入、何时录入、是否原始记录、是否可追溯前后值、是否与上下游一致、是否可长期取回。'
            '数字人遇到记录补填、截图代替原始记录、导出后二次修改等情况，应直接提示 ALCOA+ 风险。'
        ),
        summary='ALCOA+ 需要落到具体留痕与可追溯要求，不能只写原则。',
        entry_type='regulation',
        facet='core_concepts',
        tags=['ALCOA+', '原始记录', '可追溯', '数据完整性'],
        source_url=ECFR_PART11_URL,
        regulation_code='21 CFR Part 11 / GxP Data Integrity',
    ),
    _seed(
        'quality-ops:data:audit-trail-review',
        '审计追踪审查：必须能回答谁、何时、改了什么、为什么改、批准链是谁',
        (
            '合格的审计追踪审查至少要回答五个问题：谁改的、何时改的、改前后值是什么、为什么改、是否按授权链批准。'
            '如果系统只保留最终值或只保留修改时间，不足以支撑质量调查。'
        ),
        summary='审计追踪的关键不只是有日志，而是能完整解释修改链条。',
        entry_type='method_reference',
        facet='key_metrics',
        tags=['审计追踪', '修改链', '授权链', '日志'],
        source_url=ECFR_PART11_URL,
    ),
    _seed(
        'quality-ops:data:source-data-change',
        '源数据修改规则：补录、回填和更正必须留存原值、理由和责任人',
        (
            '源数据修改不能只保留新值。'
            '数字人审核时应确保原值、修改后值、修改理由、修改人、修改时间和审批动作全部存在。'
            '缺少原值或理由的改动，不应被视为合规更正。'
        ),
        summary='源数据更正必须原值保留、理由清晰、责任可追溯。',
        entry_type='sop',
        facet='sop_risks',
        tags=['源数据', '补录', '回填', '原值保留'],
        source_url=ECFR_PART11_URL,
    ),
    _seed(
        'quality-ops:data:database-lock-unlock',
        '数据库锁定与解锁：任何锁库后修改都必须重新进入受控审批链',
        (
            '数据库锁定的意义在于冻结分析基础。'
            '数字人若发现锁库后仍有关键数据修改，应优先核查是否存在正式解锁、审批、修改范围评估和重新锁定记录。'
            '没有受控解锁链的锁库后修改，应判为高风险数据完整性问题。'
        ),
        summary='锁库后修改必须先解锁审批再修改，不允许隐性回填。',
        entry_type='regulation',
        facet='regulation_boundary',
        tags=['锁库', '解锁', '审批链', '数据完整性'],
        source_url=ECFR_PART11_URL,
    ),
    _seed(
        'quality-ops:risk:ich-q9-process',
        'ICH Q9 质量风险管理：识别、分析、控制、沟通、复核五步要形成闭环',
        (
            '质量风险管理不是只做一次风险清单。'
            '应完整覆盖风险识别、风险分析、风险控制、风险沟通和风险复核。数字人若输出风险建议，必须同步说明当前风险处于哪一步，以及下一步由谁确认。'
        ),
        summary='ICH Q9 的核心是五步闭环，而不是一次性打分。',
        entry_type='regulation',
        facet='core_concepts',
        tags=['ICH Q9', '风险管理', '风险控制', '风险复核'],
        source_url=ICH_Q9_URL,
        regulation_code='ICH Q9(R1)',
    ),
    _seed(
        'quality-ops:risk:fmea-cro',
        'FMEA 在 CRO 质量管理中的应用：严重度、发生度、可探测度要映射到实际控制点',
        (
            'FMEA 不能只停在 RPN 计算。数字人应把严重度、发生度、可探测度映射到真实控制点，例如知情同意核查、访视签到、仪器校准、'
            '统计锁库、报告签发等节点，否则风险矩阵很难落地。'
        ),
        summary='FMEA 需要绑定具体控制点，不能只停留在表格打分。',
        entry_type='method_reference',
        facet='study_design',
        tags=['FMEA', 'RPN', '控制点', '风险矩阵'],
        source_url=ICH_Q9_URL,
    ),
    _seed(
        'quality-ops:risk:management-review',
        '管理评审应聚焦偏差率、CAPA 有效性、投诉趋势和数据完整性信号',
        (
            '管理评审不应只复读“总体正常”。'
            '数字人做管理摘要时，应优先聚合偏差率、关键偏差、CAPA 关闭及时率、重复偏差、客户投诉、锁库前改值、审计追踪缺口等指标，帮助管理层识别系统性弱点。'
        ),
        summary='管理评审应围绕系统性质量信号，而不是只做概述性汇报。',
        entry_type='method_reference',
        facet='reporting_templates',
        tags=['管理评审', '偏差率', 'CAPA', '投诉趋势'],
        source_url=ICH_Q10_URL,
    ),
    _seed(
        'quality-ops:faq:deviation-does-not-mean-discard-all-data',
        '常见误区：发生偏差不等于所有数据必须废弃，关键在于影响分析和可解释性',
        (
            '偏差发生后，数字人不应一律建议“全部作废”。'
            '应先分析受影响时间点、受试者、终点、分析集和替代证据，再判断是否保留说明性数据、敏感性分析数据或完全排除。'
            '没有影响分析就直接废弃或直接保留，都是不完整的质量判断。'
        ),
        summary='偏差后的数据去留必须基于影响分析，不能一刀切。',
        entry_type='faq',
        facet='faq_misconceptions',
        tags=['偏差', '数据去留', '影响分析', '误区'],
        source_url=ICH_Q9_URL,
    ),
    _seed(
        'quality-ops:faq:capa-is-not-ticket',
        '常见误区：CAPA 不是创建一张工单，而是根因到验证的完整闭环',
        (
            '把 CAPA 理解成“开一条记录”是常见误区。'
            '真正的 CAPA 至少包括根因、纠正措施、预防措施、责任人、时限和有效性验证。少任一环节，都不应视为真正闭环。'
        ),
        summary='CAPA 的本质是闭环，不是工单本身。',
        entry_type='faq',
        facet='faq_misconceptions',
        tags=['CAPA', '闭环', '误区', '验证'],
        source_url=ICH_Q10_URL,
    ),
]


class Command(BaseCommand):
    help = '补强 CRO 质量管理操作知识，优先修复 sc-004 与 sc-008 合规场景'

    def add_arguments(self, parser):
        parser.add_argument(
            '--disable-llm-enrich',
            action='store_true',
            help='关闭 LLM 富化，使用稳定规则管线入库',
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
            existed_before = KnowledgeEntry.objects.filter(
                source_type=raw.source_type,
                source_key=raw.source_key,
                is_deleted=False,
            ).exists()
            try:
                result = run_pipeline(raw)
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f'  ✗ 失败: {raw.title} | {exc}'))
                errors += 1
                continue

            if result and result.entry_id:
                KnowledgeEntry.objects.filter(id=result.entry_id).update(
                    status='published',
                    is_published=True,
                )

            if result and result.entry_id and not existed_before:
                self.stdout.write(self.style.SUCCESS(f'  ✓ [{result.entry_id}] {raw.title}'))
                created += 1
            else:
                self.stdout.write(f'  - 跳过（已存在）: {raw.title}')
                skipped += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'质量管理操作知识补强完成: created={created} skipped={skipped} errors={errors}'
            )
        )
