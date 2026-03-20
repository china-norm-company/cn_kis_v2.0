"""
补强成分安全域结构化知识，重点覆盖：
1. 原料安全评估框架
2. 限用/禁用/宣称边界
3. 成分-功效-检测方法映射
4. 直接回答 sc-003 的中欧合规判断
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


NMPA_URL = 'https://www.nmpa.gov.cn'
SCCS_URL = (
    'https://health.ec.europa.eu/latest-updates/'
    'sccs-notes-guidance-testing-cosmetic-ingredients-and-their-safety-evaluation-12th-revision-2023-05-16_cs'
)
EU_COSMETICS_URL = 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj'
CIR_URL = 'https://www.cir-safety.org'

PACKAGE_ID = 'pkg_ingredient_safety'
TOPIC = '成分安全与限用边界'
SOURCE_TYPE = 'ingredient_safety_seed'


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
    standard_code: str = '',
) -> RawKnowledgeInput:
    properties = {
        'source_url': source_url,
        'topic_package': {
            'package_id': PACKAGE_ID,
            'canonical_topic': TOPIC,
            'facet': facet,
        },
        'jurisdiction': ['CN', 'EU'],
    }
    if regulation_code:
        properties['regulation_code'] = regulation_code
    if standard_code:
        properties['standard_code'] = standard_code
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
        'ingredient-safety:core:cn-eu-decision-framework',
        '成分安全合规判断框架：先看禁用/限用，再看暴露场景、剂型、人群和宣称边界',
        (
            '成分安全与合规判断不能只问“有没有这个成分”。标准顺序应为：'
            '先核查中国《化妆品安全技术规范》与欧盟 Regulation (EC) No 1223/2009 中该成分属于禁用、限用、准用还是未列明；'
            '再结合停留型/冲洗型、面部/身体、眼周/唇周、儿童/孕妇/敏感肌、纳米形态、吸入暴露、光照暴露等使用场景判断。'
            '若法规没有给出一刀切上限，也不能直接视为“无限制”，仍需走安全评估、暴露计算、标签警示和宣称边界校验。'
        ),
        summary='成分安全合规的总判定顺序：法规状态先行，场景暴露再校正，最后再看标签和宣称。',
        entry_type='regulation',
        facet='core_concepts',
        tags=['成分安全', '合规框架', '中国法规', '欧盟法规'],
        source_url=EU_COSMETICS_URL,
        regulation_code='EC 1223/2009 / 化妆品安全技术规范',
    ),
    _seed(
        'ingredient-safety:method:sccs-safety-assessment-chain',
        'SCCS 原料安全评估链：身份规格、暴露评估、毒理终点、MoS 与不确定性说明',
        (
            'SCCS Notes of Guidance 的安全评估逻辑不是单一毒理结论，而是完整链条：'
            '化学身份和纯度、杂质与残留、物化性质、暴露部位和频次、系统暴露量、关键毒理终点、'
            'NOAEL/PoD、MoS 和不确定性。数字人若要输出“安全/不安全”判断，必须能解释该判断只适用于哪些浓度、剂型、暴露路径和人群。'
        ),
        summary='SCCS 安全评估要求结论必须和暴露情境、毒理阈值与不确定性一起出现。',
        entry_type='method_reference',
        facet='ingredient_safety',
        tags=['SCCS', 'MoS', 'NOAEL', '暴露评估'],
        source_url=SCCS_URL,
        regulation_code='SCCS Notes of Guidance 12th revision',
    ),
    _seed(
        'ingredient-safety:method:cir-review-chain',
        'CIR 安全评估链：公开使用条件、暴露强度与配方情境共同决定结论',
        (
            'CIR 对化妆品原料的安全结论强调“在当前报告使用方式和浓度下 considered safe”。'
            '因此数字人不能把 CIR 结论脱离具体使用条件复述。若配方剂型、浓度、使用频次、联用活性或暴露路径发生变化，'
            '必须重新审视是否仍落在原结论适用边界内。'
        ),
        summary='CIR 结论是条件化结论，必须绑定具体浓度、剂型和使用方式解释。',
        entry_type='method_reference',
        facet='ingredient_safety',
        tags=['CIR', '成分安全', '使用条件', '风险边界'],
        source_url=CIR_URL,
    ),
    _seed(
        'ingredient-safety:method:sed-noael-mos',
        '安全评估关键指标：SED、NOAEL、MoS 三个指标必须成组解释',
        (
            '安全评估中常见的三个关键指标分别是 SED（系统暴露剂量）、NOAEL（未观察到不良反应剂量）和 MoS（安全边际）。'
            '数字人若只引用 NOAEL 而不结合 SED，就无法判断实际使用是否越界；若只给 MoS 而没有暴露假设和毒理来源，也无法审计。'
            '输出安全判断时，应同步说明剂型、使用频率、涂抹面积和假设人群。'
        ),
        summary='SED、NOAEL、MoS 必须连起来解释，否则安全结论不可审计。',
        entry_type='method_reference',
        facet='key_metrics',
        tags=['SED', 'NOAEL', 'MoS', '安全边际'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:method:leave-on-vs-rinse-off',
        '停留型与冲洗型产品的安全阈值不能混用',
        (
            '同一成分在停留型和冲洗型产品中的风险边界常常不同。停留型面霜、精华、眼周产品会带来更高的持续暴露；'
            '冲洗型洁面、洗发产品则更依赖接触时间和残留量。数字人做安全判断时，应先识别剂型，再决定是否可直接复用既有限量结论。'
        ),
        summary='停留型与冲洗型产品的成分安全阈值不能直接平移。',
        entry_type='method_reference',
        facet='claim_boundary',
        tags=['停留型', '冲洗型', '暴露场景', '剂型'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:method:photo-toxicity-and-sensitization',
        '光毒性、光致敏和常规刺激性应分开评估',
        (
            '成分的刺激性、致敏性、光毒性和光致敏并不是同一类风险。白天使用、暴露于紫外线下的产品尤其需要额外关注光毒性和光稳定性。'
            '数字人不能仅凭“低刺激”就推断“可白天使用”，也不能把一次斑贴试验结果当成所有光照场景下的安全背书。'
        ),
        summary='刺激性、致敏性、光毒性是不同风险维度，不能互相替代。',
        entry_type='method_reference',
        facet='ingredient_safety',
        tags=['光毒性', '光致敏', '刺激性', '安全评估'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:regulation:restricted-vs-prohibited-vs-permitted',
        '禁用、限用、准用三类法规状态必须先区分',
        (
            '中国和欧盟的原料管理都不是简单二元结构。'
            '禁用表示原则上不得作为化妆品原料使用；限用表示允许在明确浓度、部位、剂型、警示语或人群约束下使用；'
            '准用通常用于防晒剂、着色剂、防腐剂、染发剂等专门清单。数字人回答“是否合规”时，必须先说明该成分落在哪一类。'
        ),
        summary='判断成分合规前，先确定它属于禁用、限用还是准用类别。',
        entry_type='regulation',
        facet='regulation_boundary',
        tags=['禁用', '限用', '准用', '法规状态'],
        source_url=EU_COSMETICS_URL,
        regulation_code='EC 1223/2009 Annex II/III/IV/V/VI',
    ),
    _seed(
        'ingredient-safety:regulation:preservative-boundary',
        '防腐剂合规判断要同时看准用清单、最大浓度和留敷/冲洗场景',
        (
            '防腐剂不应只看是否在配方表中出现。数字人应同时核查：'
            '该成分是否列入准用防腐剂清单、最大允许浓度是多少、是否仅允许用于特定剂型、'
            '是否对儿童、黏膜、喷雾吸入场景有限制。若多个防腐剂联用，还要关注总刺激负担和致敏风险。'
        ),
        summary='防腐剂合规判断必须同时结合准用清单、浓度和使用场景。',
        entry_type='regulation',
        facet='ingredient_safety',
        tags=['防腐剂', '准用清单', '最大浓度', '留敷型'],
        source_url=NMPA_URL,
        regulation_code='化妆品安全技术规范 2015',
    ),
    _seed(
        'ingredient-safety:regulation:uv-filter-boundary',
        '防晒剂合规判断必须区分准用防晒剂清单、最大浓度和纳米形态',
        (
            '有机和无机防晒剂都属于强监管类别。数字人要先确认成分是否属于准用防晒剂，再看最大允许浓度、'
            '是否限制用于喷雾、是否涉及纳米形态以及是否要求额外标签。尤其氧化锌、二氧化钛等无机滤光剂，'
            '不能把非纳米和纳米结论混为一谈。'
        ),
        summary='防晒剂合规判断必须把准用清单、最大浓度和纳米形态一起看。',
        entry_type='regulation',
        facet='ingredient_safety',
        tags=['防晒剂', '纳米', '氧化锌', '二氧化钛'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:regulation:acid-boundary',
        '果酸、水杨酸等角质调理成分需要同时评估浓度、pH 和光照暴露',
        (
            '果酸、水杨酸等角质调理活性不适合只用百分比判断安全。'
            '还要看配方 pH、游离酸比例、停留时间、是否叠加其他刺激性活性以及是否伴随日晒暴露。'
            '数字人若看到高频使用、敏感肌、角质屏障受损或与 A 醇联用场景，应自动切换到更保守判断。'
        ),
        summary='角质调理活性的安全判断要把浓度、pH、日晒和联用一起考虑。',
        entry_type='regulation',
        facet='ingredient_safety',
        tags=['果酸', '水杨酸', 'pH', '角质调理'],
        source_url=NMPA_URL,
        regulation_code='化妆品安全技术规范 2015',
    ),
    _seed(
        'ingredient-safety:regulation:new-ingredient-boundary',
        '中国新原料管理下，未充分沉淀使用历史的成分不能按成熟原料口径推断',
        (
            '新原料的安全判断不能简单复用成熟原料经验。'
            '数字人应先识别该原料是否已经进入已使用化妆品原料目录，若尚属新原料或公开使用历史不足，'
            '就应提高证据门槛，要求更完整的毒理资料、稳定性、杂质谱和上市后风险监测安排。'
        ),
        summary='新原料不能按成熟原料口径直接放行，证据门槛应更高。',
        entry_type='regulation',
        facet='regulation_boundary',
        tags=['新原料', '原料目录', '证据门槛', '风险监测'],
        source_url=NMPA_URL,
        regulation_code='化妆品监督管理条例 / 注册备案管理办法',
    ),
    _seed(
        'ingredient-safety:direct:niacinamide-retinol-cn-eu',
        '成分安全合规判断：5%烟酰胺与0.3%视黄醇在中国和欧盟如何评估',
        (
            '对于 5% 烟酰胺，当前中国和欧盟公开框架下更常见的是按一般化妆品原料结合安全评估判断，'
            '并没有像准用防晒剂那样的统一法定上限；因此重点应放在刺激风险、肤质耐受、宣称边界和复配体系。'
            '对于 0.3% 视黄醇，欧盟近年的安全意见和法规更新强调按 retinol equivalent 控制面部/手部产品上限，'
            '0.3% 已接近欧盟面部类产品的高边界，需要进一步核对是否为面部/身体、是否叠加其他维 A 衍生物，以及是否设置孕妇、儿童和敏感肌警示。'
            '中国现行公开框架下更偏向通过原料安全评估、风险人群提示和标签管理控制，并不意味着 0.3% 可无条件视为安全。'
            '因此这道题的标准回答不是简单“都合规/都不合规”，而是：烟酰胺 5% 通常需做耐受与宣称边界评估；视黄醇 0.3% 需重点看欧盟 retinol equivalent 限值、剂型和警示。'
        ),
        summary='直接回答 sc-003：烟酰胺 5% 主要看刺激与宣称边界，视黄醇 0.3% 在欧盟需重点核对 retinol equivalent 高边界与人群警示。',
        entry_type='ingredient_data',
        facet='ingredient_safety',
        tags=['烟酰胺', '视黄醇', '浓度', '中国', '欧盟', '安全'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:direct:niacinamide-boundary',
        '烟酰胺安全边界：重点不是统一法定上限，而是刺激、复配和宣称边界',
        (
            '烟酰胺常见应用浓度覆盖 2%-5% 甚至更高，但数字人不能把“市场常见”直接等同于“对所有人都安全”。'
            '应重点评估：是否与酸类、高活性去角质成分、A 醇联用；是否用于敏感肌、屏障受损或高频刷酸人群；'
            '是否夸大为医学化“祛斑治疗”。烟酰胺更适合落在均匀肤色、提亮和屏障支持类表达。'
        ),
        summary='烟酰胺没有简单的统一上限答案，更重要的是耐受管理、复配关系和宣称边界。',
        entry_type='ingredient_data',
        facet='claim_boundary',
        tags=['烟酰胺', '提亮', '屏障', '宣称边界'],
        source_url=CIR_URL,
    ),
    _seed(
        'ingredient-safety:direct:retinol-boundary',
        '视黄醇安全边界：浓度、频率、剂型和人群警示必须一起出现',
        (
            '视黄醇类成分的主要风险不是“是否有效”，而是刺激、脱屑、屏障受损和光敏相关使用边界。'
            '数字人回答视黄醇安全问题时，至少要同时交代浓度、使用频率、是否夜间使用、是否叠加酸类、是否用于孕妇/哺乳期/儿童、'
            '以及是否还含 retinyl acetate、retinyl palmitate 等其他维 A 衍生物。缺少这些前提，不能直接给出肯定安全承诺。'
        ),
        summary='视黄醇的安全判断必须同时绑定浓度、频率、剂型和特殊人群警示。',
        entry_type='ingredient_data',
        facet='ingredient_safety',
        tags=['视黄醇', 'A醇', '刺激', '特殊人群'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:direct:salicylic-acid-boundary',
        '水杨酸安全边界：浓度之外，还要看 pH、停留时间和敏感人群',
        (
            '水杨酸既常见于祛痘和角质调理，也常见于刺激风险投诉。'
            '数字人不能只看百分比，还应评估 pH、是否停留型、是否高频使用、是否用于破损皮肤、是否叠加酸类或视黄醇，以及目标人群是否为敏感肌或孕期。'
            '一旦出现高频刷酸、屏障受损或联用活性场景，应自动升级为谨慎建议。'
        ),
        summary='水杨酸的安全判断必须超越浓度，结合 pH、停留时间和目标人群。',
        entry_type='ingredient_data',
        facet='ingredient_safety',
        tags=['水杨酸', 'pH', '停留型', '敏感肌'],
        source_url=NMPA_URL,
    ),
    _seed(
        'ingredient-safety:direct:phenoxyethanol-boundary',
        '苯氧乙醇合规判断：既看单成分上限，也看配方整体刺激负担',
        (
            '苯氧乙醇属于常见防腐剂，数字人回答其合规问题时，不能只停留在“单成分上限”。'
            '还应结合是否为儿童、眼周、喷雾吸入、与其他防腐剂联用、以及是否已有高致敏香精或高活性酸类共同叠加。'
            '这类问题的专业回答应同时输出法规边界和配方体系层面的耐受风险。'
        ),
        summary='苯氧乙醇的合规判断要把法规上限和整体刺激负担一起看。',
        entry_type='ingredient_data',
        facet='ingredient_safety',
        tags=['苯氧乙醇', '防腐剂', '刺激负担', '儿童'],
        source_url=EU_COSMETICS_URL,
    ),
    _seed(
        'ingredient-safety:direct:nano-zno-tio2',
        '纳米氧化锌与二氧化钛：安全判断必须区分非纳米/纳米、喷雾/非喷雾',
        (
            '纳米氧化锌和纳米二氧化钛不能简单沿用非纳米滤光剂的安全结论。'
            '数字人必须先确认粒径形态、是否喷雾、是否存在吸入暴露、是否用于儿童、以及是否附带法规要求的标签说明。'
            '对喷雾或粉雾场景，应把吸入暴露视为一级风险维度。'
        ),
        summary='纳米防晒剂的安全判断必须把粒径和吸入暴露单独拉出来分析。',
        entry_type='ingredient_data',
        facet='ingredient_safety',
        tags=['纳米', '氧化锌', '二氧化钛', '吸入暴露'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:method:ingredient-claim-instrument-moisture',
        '保湿成分图谱：透明质酸、甘油、神经酰胺更应对应水合与屏障类终点',
        (
            '当配方核心成分是透明质酸、甘油、神经酰胺等保湿/屏障类原料时，数字人优先匹配的检测方法应是 Corneometer、Tewameter、'
            '必要时辅以皮肤干燥评分或红斑评分，而不是把保湿成分直接映射到美白或抗皱终点。'
            '这类知识用于防止“成分-功效-检测方法”错配。'
        ),
        summary='保湿成分应优先对应 Corneometer/Tewameter 等水合与屏障终点。',
        entry_type='method_reference',
        facet='instrument_methods',
        tags=['保湿', '透明质酸', 'Corneometer', 'Tewameter'],
        source_url=CIR_URL,
    ),
    _seed(
        'ingredient-safety:method:ingredient-claim-instrument-brightening',
        '美白成分图谱：烟酰胺、熊果苷、传明酸应优先匹配色度和色沉终点',
        (
            '烟酰胺、熊果苷、传明酸等亮肤成分更适合映射到 Mexameter、L*a*b* 色差、标准化图像分析等终点。'
            '数字人若看到这类成分却只给出 Corneometer 之类保湿终点，应判为研究设计错配。'
        ),
        summary='亮肤成分应优先匹配色差和色沉终点，而不是保湿终点。',
        entry_type='method_reference',
        facet='instrument_methods',
        tags=['美白', '烟酰胺', '熊果苷', 'Mexameter'],
        source_url=NMPA_URL,
    ),
    _seed(
        'ingredient-safety:method:ingredient-claim-instrument-antiwrinkle',
        '抗皱成分图谱：视黄醇、胜肽、玻色因应优先匹配弹性和纹理终点',
        (
            '视黄醇、胜肽、玻色因等抗皱成分更适合对应 Cutometer、PRIMOS、VISIA 纹理和皱纹参数。'
            '若数字人把抗皱成分只映射到即时水合终点，通常不足以支撑抗皱宣称。'
        ),
        summary='抗皱成分应优先匹配弹性、纹理和皱纹终点。',
        entry_type='method_reference',
        facet='instrument_methods',
        tags=['抗皱', '视黄醇', 'Cutometer', 'PRIMOS'],
        source_url=CIR_URL,
    ),
    _seed(
        'ingredient-safety:method:ingredient-claim-instrument-sunscreen',
        '防晒成分图谱：有机/无机滤光剂必须对应 SPF、UVA-PF 与临界波长方法',
        (
            '有机和无机防晒剂的功效支持不能只凭常规功效评价。'
            '数字人应优先匹配 ISO 24444 的 SPF in vivo、ISO 24442/24443 的 UVA 评价、临界波长和相关体外透射光谱方法。'
            '如果只拿普通人体感受或单一 UVB 结果去支撑全波段防护，就属于证据不完整。'
        ),
        summary='防晒成分必须对应 SPF/UVA-PF/临界波长等专业方法，不能拿普通终点替代。',
        entry_type='method_reference',
        facet='instrument_methods',
        tags=['防晒', 'SPF', 'UVA-PF', 'ISO 24444'],
        source_url=EU_COSMETICS_URL,
        standard_code='ISO 24444 / ISO 24442 / ISO 24443',
    ),
    _seed(
        'ingredient-safety:method:ingredient-claim-instrument-soothing',
        '舒缓修复成分图谱：泛醇、积雪草、尿囊素更适合匹配 TEWL、红斑和刺激缓解终点',
        (
            '泛醇、积雪草、尿囊素等舒缓修复成分更适合映射到 TEWL、红斑指数、刺痛评分和屏障恢复终点。'
            '若数字人用这类成分去直接支撑“祛斑”或“抗皱强宣称”，通常属于成分-宣称错配。'
        ),
        summary='舒缓修复成分更适合屏障和红斑终点，而非强功效迁移宣称。',
        entry_type='method_reference',
        facet='instrument_methods',
        tags=['舒缓', '泛醇', '积雪草', 'TEWL'],
        source_url=CIR_URL,
    ),
    _seed(
        'ingredient-safety:method:ingredient-claim-instrument-oil-control',
        '控油成分图谱：烟酰胺、水杨酸、锌盐更适合匹配皮脂和毛孔相关终点',
        (
            '控油类成分通常应优先匹配 Sebumeter、毛孔图像分析、油脂分泌相关问卷与照片分级，而不是直接套用保湿或抗皱终点。'
            '数字人做方案设计时，应把成分机制和测量终点对应起来。'
        ),
        summary='控油成分应优先匹配皮脂与毛孔终点。',
        entry_type='method_reference',
        facet='instrument_methods',
        tags=['控油', 'Sebumeter', '水杨酸', '锌盐'],
        source_url=CIR_URL,
    ),
    _seed(
        'ingredient-safety:method:concentration-efficacy-safety-triangle',
        '成分浓度、功效强度与安全风险是三角关系，不能只追求高浓度',
        (
            '成分浓度并不是越高越好。数字人给出配方建议时，应同时评估功效边际收益、刺激/致敏风险、稳定性挑战和目标人群耐受。'
            '尤其活性成分在高浓度下，常见结果是功效增幅有限但投诉和不良反应明显上升。'
        ),
        summary='高浓度不等于高价值，成分浓度要在功效和安全之间平衡。',
        entry_type='method_reference',
        facet='core_concepts',
        tags=['浓度', '功效', '安全', '平衡'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:method:multi-product-cumulative-exposure',
        '多产品叠加使用时，应评估累积暴露而不是单品静态安全',
        (
            '用户往往同时使用精华、面霜、防晒、身体乳和清洁产品。数字人若只按单个产品做安全判断，容易低估同类活性和同类防腐剂的累积暴露。'
            '遇到“早晚多产品叠加”“同类活性联用”“医美后高频护理”等场景时，应主动提高保守度。'
        ),
        summary='成分安全不应只看单品，叠加使用下需要评估累积暴露。',
        entry_type='method_reference',
        facet='ingredient_safety',
        tags=['累积暴露', '多产品', '联用', '安全评估'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:faq:acid-retinol-combination',
        '常见误区：酸类和 A 醇不是绝对禁配，但必须评估耐受、频率和顺序',
        (
            '酸类和 A 醇并非绝对不能联用，但数字人不能把它们描述成“天然安全组合”。'
            '真实判断应同时看浓度、pH、使用频率、是否同夜叠加、目标人群屏障状态以及是否配套防晒。'
            '若存在敏感肌、屏障受损或高频刷酸场景，应优先建议错开频次或转人工复核。'
        ),
        summary='酸类与 A 醇不是绝对禁配，但必须做耐受和频率管理。',
        entry_type='faq',
        facet='faq_misconceptions',
        tags=['A醇', '酸类', '联用', '误区'],
        source_url=SCCS_URL,
    ),
    _seed(
        'ingredient-safety:faq:pregnancy-children-sensitive-skin',
        '特殊人群规则：孕妇、儿童、敏感肌问题必须切换到更保守的成分安全口径',
        (
            '一旦问题涉及孕妇、儿童或敏感肌，数字人不应继续沿用普通成人的泛化安全结论。'
            '需要把活性浓度、已知刺激性、使用部位、吞咽/吸入暴露、长期使用和标签警示全部前置。'
            '若缺少任一关键前提，应默认输出“需进一步人工评估”，而不是给出宽松放行建议。'
        ),
        summary='特殊人群提问必须切换到更保守的安全判断口径。',
        entry_type='faq',
        facet='claim_boundary',
        tags=['孕妇', '儿童', '敏感肌', '特殊人群'],
        source_url=NMPA_URL,
    ),
    _seed(
        'ingredient-safety:reporting:ingredient-safety-summary-template',
        '成分安全结论模板：结论、适用前提、风险点和警示语四段必须同时出现',
        (
            '数字人输出成分安全结论时，建议固定为四段：'
            '1. 结论；2. 适用前提（浓度、剂型、使用频率、人群）；3. 关键风险点；4. 标签或使用警示。'
            '缺少前提和警示的结论容易被误读成无条件安全承诺。'
        ),
        summary='成分安全结论不应只给一句判断，至少要同时给前提、风险点和警示语。',
        entry_type='proposal_template',
        facet='reporting_templates',
        tags=['结论模板', '警示语', '风险点', '前提'],
        source_url=SCCS_URL,
    ),
]


class Command(BaseCommand):
    help = '补强成分安全域结构化知识，优先修复 sc-003 成分安全合规场景'

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
                f'成分安全结构化知识补强完成: created={created} skipped={skipped} errors={errors}'
            )
        )
