"""
针对已经过门禁但证据密度仍偏薄的专题包，补充公开论文/方法学/成分安全锚点。

重点不是盲目补量，而是补齐数字人在专业判断时最依赖的证据层：
1. 研究设计与统计分析
2. 防晒与美白功效评价
3. 成分安全与限用边界
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


SEEDS = [
    RawKnowledgeInput(
        title='研究设计统计证据：ICH E9(R1) 要求先定义 estimand 再选择分析方法',
        content=(
            '公开依据：ICH E9(R1) Addendum on Estimands and Sensitivity Analysis。\n'
            '核心要点：研究团队不能先有统计方法、后补研究问题。必须先明确 treatment、population、variable、'
            'intercurrent events 与 summary measure 五要素，再决定主分析与敏感性分析路径。\n'
            '数字人要求：当方案只写“做 t 检验/Wilcoxon”但未说明中断用药、失访、救援治疗如何处理时，'
            '必须提示 estimand 定义不完整。'
        ),
        summary='研究设计与统计分析的公开权威锚点：estimand 先于统计方法。',
        entry_type='methodology',
        source_type='public_evidence_seed',
        source_key='study-design:methodology:estimand-before-analysis',
        namespace='cnkis',
        tags=['统计分析', 'ICH E9(R1)', 'estimand'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='研究设计统计证据：分脸/分侧设计不能忽略配对结构',
        content=(
            '公开方法学共识：split-face、split-body 等自对照设计的核心价值在于消除个体间差异。'
            '若分析时把左右脸当成两个独立样本，会夸大有效样本量并低估方差。\n'
            '数字人要求：当看到半脸试验、左右侧对照或同体多区域设计时，应优先建议配对 t 检验、'
            '配对 Wilcoxon、混合模型或含受试者随机效应的分析，而不是独立样本检验。'
        ),
        summary='研究设计与统计分析的公开方法学锚点：分侧设计必须按配对结构分析。',
        entry_type='method_reference',
        source_type='public_evidence_seed',
        source_key='study-design:method:paired-analysis-for-split-face',
        namespace='cnkis',
        tags=['统计分析', 'split-face', '配对设计'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='key_metrics',
    ),
    RawKnowledgeInput(
        title='研究设计统计证据：多终点功效研究必须预设主次终点与 multiplicity 控制',
        content=(
            '公开统计原则：当同一研究同时评价保湿、弹性、纹路、光泽等多个终点时，'
            '若没有主次终点顺序或 multiplicity 控制，显著性结果容易被随机波动放大。\n'
            '数字人要求：在多终点研究中，必须追问主终点、关键次要终点、层级检验顺序、'
            '是否采用 Bonferroni/Holm/门控策略；若均未定义，只能输出“探索性证据”。'
        ),
        summary='研究设计与统计分析的公开方法学锚点：多终点必须控制假阳性风险。',
        entry_type='method_reference',
        source_type='public_evidence_seed',
        source_key='study-design:method:multiplicity-control',
        namespace='cnkis',
        tags=['统计分析', '多终点', 'multiplicity'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='研究设计统计证据：缺失数据不能只做完整病例分析',
        content=(
            '公开统计原则：失访、依从性中断、设备故障和访视偏离都会造成缺失数据。'
            '若只保留完整病例，可能系统性偏向依从性更高或反应更好的人群。\n'
            '数字人要求：应区分缺失机制，并建议至少同步输出缺失率、缺失原因、主分析处理方式'
            '（如 MMRM、多重插补、保守填补）及敏感性分析结果。'
        ),
        summary='研究设计与统计分析的公开方法学锚点：缺失数据必须显式处理并做敏感性分析。',
        entry_type='methodology',
        source_type='public_evidence_seed',
        source_key='study-design:methodology:missing-data-sensitivity',
        namespace='cnkis',
        tags=['统计分析', '缺失数据', '敏感性分析'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='sop_risks',
    ),
    RawKnowledgeInput(
        title='研究设计统计证据：报告结论应同时给出效应量、置信区间与临床解释',
        content=(
            '公开最佳实践：仅报告 p 值不足以支持业务解释。功效评价研究至少应同步给出效应量、方向、'
            '95% 置信区间和临床/业务可解释性，避免“统计学显著但业务价值极弱”的误导。\n'
            '数字人要求：若报告只有显著性没有效应量和区间，应降级为“统计证据不完整”。'
        ),
        summary='研究设计与统计分析的公开方法学锚点：结论必须带效应量与置信区间。',
        entry_type='method_reference',
        source_type='public_evidence_seed',
        source_key='study-design:method:effect-size-and-ci',
        namespace='cnkis',
        tags=['统计分析', '效应量', '置信区间'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='reporting_templates',
    ),
    RawKnowledgeInput(
        title='防晒功效证据：ISO 24444 适用于 SPF in vivo，不能替代 UVA 防护评价',
        content=(
            '公开标准框架：ISO 24444 聚焦人体 SPF（主要反映 UVB 防护），'
            '而 UVA 相关宣称还需要结合 ISO 24442/24443、临界波长或 UVA-PF 证据。\n'
            '数字人要求：若产品同时宣称 SPF 与 UVA 全面防护，不能只凭单一 SPF 结果给出完整结论。'
        ),
        summary='防晒功效评价的公开方法学锚点：SPF 证据不能直接替代 UVA 防护证据。',
        entry_type='method_reference',
        source_type='public_evidence_seed',
        source_key='sunscreen:method:spf-not-uva',
        namespace='cnkis',
        tags=['防晒', 'ISO 24444', 'UVA'],
        package_id='pkg_sunscreen_evaluation',
        canonical_topic='防晒功效评价',
        facet='instrument_methods',
    ),
    RawKnowledgeInput(
        title='防晒功效证据：ISO 24443 体外 UVA 评价依赖临界波长和 UVA-PF',
        content=(
            '公开标准框架：ISO 24443 通过体外透射光谱、临界波长和 UVA-PF 评价广谱 UVA 防护。'
            '样品涂布均匀性、底板选择、预照射条件都会影响结果稳定性。\n'
            '数字人要求：若体外 UVA 研究未说明底板、涂布量或预照射条件，应提示方法学可靠性不足。'
        ),
        summary='防晒功效评价的公开方法学锚点：UVA 评价高度依赖体外方法细节。',
        entry_type='methodology',
        source_type='public_evidence_seed',
        source_key='sunscreen:methodology:iso24443-details',
        namespace='cnkis',
        tags=['防晒', 'ISO 24443', 'UVA-PF'],
        package_id='pkg_sunscreen_evaluation',
        canonical_topic='防晒功效评价',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='防晒成分安全证据：氧化锌与二氧化钛需区分纳米形态、使用场景和剂型',
        content=(
            '公开安全框架：SCCS 对 Zinc Oxide、Titanium Dioxide 的意见强调必须区分非纳米/纳米、'
            '粒径、吸入暴露和产品剂型。并非“物理防晒剂天然绝对安全”，尤其喷雾和吸入场景边界更严格。\n'
            '数字人要求：做配方安全判断时，必须同时追问形态、粒径、剂型和暴露路径。'
        ),
        summary='防晒功效评价与成分安全的公开锚点：物理防晒剂安全判断必须区分纳米和剂型。',
        entry_type='ingredient_data',
        source_type='public_evidence_seed',
        source_key='sunscreen:ingredient:nano-zno-tio2-boundary',
        namespace='cnkis',
        tags=['防晒', '氧化锌', '二氧化钛', 'SCCS'],
        package_id='pkg_sunscreen_evaluation',
        canonical_topic='防晒功效评价',
        facet='ingredient_safety',
    ),
    RawKnowledgeInput(
        title='防晒配方证据：阿伏苯宗需要关注光稳定性与配伍体系',
        content=(
            '公开配方共识：Avobenzone 作为 UVA 吸收剂具有代表性，但光稳定性高度依赖配伍体系。'
            '若缺乏稳定剂、成膜体系或完整照后稳定性证据，实验室单次 SPF/UVA 数据不足以支持长期稳定防护结论。\n'
            '数字人要求：看到 Avobenzone 配方时，要主动追问 photostability 与照后性能保持证据。'
        ),
        summary='防晒功效评价的公开证据锚点：阿伏苯宗需要结合光稳定性证据判断。',
        entry_type='paper_abstract',
        source_type='public_evidence_seed',
        source_key='sunscreen:paper:avobenzone-photostability',
        namespace='cnkis',
        tags=['防晒', 'Avobenzone', '光稳定性'],
        package_id='pkg_sunscreen_evaluation',
        canonical_topic='防晒功效评价',
        facet='ingredient_safety',
    ),
    RawKnowledgeInput(
        title='美白功效证据：烟酰胺人体研究更适合支持肤色均匀与色斑改善表述',
        content=(
            '公开论文与行业共识显示，烟酰胺常见的人体证据更集中在肤色均匀、色斑减淡和屏障改善。'
            '其证据通常来自 4-8 周持续使用、Mexameter/色差测量或皮肤科评分，而不是“快速漂白式”效果。\n'
            '数字人要求：输出宣称时优先使用“改善肤色不均/淡化色斑印象”而非过强的医学化表达。'
        ),
        summary='美白功效评价的公开论文锚点：烟酰胺更适合支持均匀肤色和色斑改善表达。',
        entry_type='paper_abstract',
        source_type='public_evidence_seed',
        source_key='whitening:paper:niacinamide-tone-evenness',
        namespace='cnkis',
        tags=['美白', '烟酰胺', '色斑'],
        package_id='pkg_whitening_evaluation',
        canonical_topic='美白功效评价',
        facet='claim_boundary',
    ),
    RawKnowledgeInput(
        title='美白功效证据：传明酸更常见于黄褐斑/色沉改善，不应泛化为所有美白场景',
        content=(
            '公开研究显示，topical tranexamic acid 的证据主要集中在黄褐斑、炎症后色沉等高色沉场景，'
            '常见评价周期为 8-12 周，并结合 MASI、Mexameter 或皮肤科评分。\n'
            '数字人要求：若产品证据来源于色沉人群，不应直接泛化为所有消费者都可期待同等“美白”效果。'
        ),
        summary='美白功效评价的公开论文锚点：传明酸证据具有特定适用人群边界。',
        entry_type='paper_abstract',
        source_type='public_evidence_seed',
        source_key='whitening:paper:tranexamic-acid-population-boundary',
        namespace='cnkis',
        tags=['美白', '传明酸', '黄褐斑'],
        package_id='pkg_whitening_evaluation',
        canonical_topic='美白功效评价',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='美白检测方法证据：Mexameter 与色差指标更适合量化色沉变化',
        content=(
            '公开方法学共识：美白/淡斑研究需要明确 melanin index、L*a*b* 或图像分析指标，'
            '并控制光照、测量位置、季节暴露和防晒依从性。仅凭主观问卷很难支撑稳定的色沉改善结论。\n'
            '数字人要求：若研究未给出客观色度终点，应将其降级为弱证据。'
        ),
        summary='美白功效评价的公开方法学锚点：需要客观色度终点而非只靠主观评价。',
        entry_type='method_reference',
        source_type='public_evidence_seed',
        source_key='whitening:method:mexameter-objective-endpoints',
        namespace='cnkis',
        tags=['美白', 'Mexameter', '色差'],
        package_id='pkg_whitening_evaluation',
        canonical_topic='美白功效评价',
        facet='instrument_methods',
    ),
    RawKnowledgeInput(
        title='美白成分安全证据：熊果苷与酸类联用时需关注刺激风险和宣称边界',
        content=(
            '公开安全与配方经验显示，α/β-arbutin、果酸、水杨酸等成分联用时，'
            '既可能增强色沉改善，也会提高刺激、屏障受损和短期反黑风险。\n'
            '数字人要求：做方案建议时，必须同时评估成分组合、肤质、日晒暴露与耐受管理，'
            '不能只根据单成分作用机制给出乐观结论。'
        ),
        summary='美白功效评价的公开安全锚点：亮肤成分联用需要兼顾刺激和反黑风险。',
        entry_type='ingredient_data',
        source_type='public_evidence_seed',
        source_key='whitening:ingredient:arbutin-acid-irritation-boundary',
        namespace='cnkis',
        tags=['美白', '熊果苷', '刺激风险'],
        package_id='pkg_whitening_evaluation',
        canonical_topic='美白功效评价',
        facet='ingredient_safety',
    ),
    RawKnowledgeInput(
        title='成分安全证据：水杨酸安全判断必须区分浓度、停留时间与使用人群',
        content=(
            '公开安全框架：Salicylic Acid 既是常见祛痘/角质调理成分，也是刺激风险较明确的活性。'
            '安全判断至少要同时考虑浓度、pH、停留/冲洗、使用频次、是否用于破损皮肤和特殊人群。\n'
            '数字人要求：面对“敏感肌/孕期/高频使用”提问时，必须进入更保守的边界判断。'
        ),
        summary='成分安全与限用边界的公开锚点：水杨酸安全判断依赖场景和暴露方式。',
        entry_type='ingredient_data',
        source_type='public_evidence_seed',
        source_key='ingredient-safety:ingredient:salicylic-acid-exposure-boundary',
        namespace='cnkis',
        tags=['成分安全', '水杨酸', '暴露边界'],
        package_id='pkg_ingredient_safety',
        canonical_topic='成分安全与限用边界',
        facet='ingredient_safety',
    ),
    RawKnowledgeInput(
        title='成分安全证据：视黄醇类成分需要区分浓度、耐受建立与敏感人群管理',
        content=(
            '公开安全共识：retinol/retinoids 常见问题不是“有没有作用”，而是刺激性、脱屑、屏障受损和依从性下降。'
            '安全建议通常强调低浓度起始、逐步建立耐受、夜间使用、防晒配套和对敏感/特殊人群的保守管理。\n'
            '数字人要求：在没有浓度和使用节奏信息时，不能直接输出泛化的安全承诺。'
        ),
        summary='成分安全与限用边界的公开锚点：视黄醇安全管理依赖浓度与耐受建立。',
        entry_type='ingredient_data',
        source_type='public_evidence_seed',
        source_key='ingredient-safety:ingredient:retinol-titration-and-tolerance',
        namespace='cnkis',
        tags=['成分安全', '视黄醇', '耐受建立'],
        package_id='pkg_ingredient_safety',
        canonical_topic='成分安全与限用边界',
        facet='ingredient_safety',
    ),
    RawKnowledgeInput(
        title='成分安全证据：SCCS 对纳米防晒剂意见强调吸入暴露是独立风险维度',
        content=(
            '公开 SCCS 意见显示，纳米氧化锌、纳米二氧化钛等成分的判断不能只看皮肤接触安全，'
            '吸入暴露、喷雾应用和粒径分布是独立的风险维度。\n'
            '数字人要求：当用户提问“喷雾防晒是否同样安全”时，必须把剂型和暴露路径作为一级判断条件。'
        ),
        summary='成分安全与限用边界的公开锚点：纳米防晒剂安全不能脱离吸入暴露场景。',
        entry_type='regulation',
        source_type='public_evidence_seed',
        source_key='ingredient-safety:regulation:nano-sunscreen-inhalation',
        namespace='cnkis',
        tags=['成分安全', 'SCCS', '纳米防晒剂'],
        package_id='pkg_ingredient_safety',
        canonical_topic='成分安全与限用边界',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='成分安全证据：公开安全评估应同时保留 NOAEL、暴露场景与不确定性来源',
        content=(
            '公开安全评估框架强调，单独给“安全/不安全”结论远远不够。'
            '专业判断至少要保留 NOAEL 或关键毒理阈值、暴露场景、计算假设和不确定性来源。\n'
            '数字人要求：在输出成分安全结论时，必须能解释为什么某一结论只适用于特定浓度、剂型或人群。'
        ),
        summary='成分安全与限用边界的公开方法学锚点：安全结论必须能解释适用前提。',
        entry_type='methodology',
        source_type='public_evidence_seed',
        source_key='ingredient-safety:methodology:noael-exposure-uncertainty',
        namespace='cnkis',
        tags=['成分安全', 'NOAEL', '不确定性'],
        package_id='pkg_ingredient_safety',
        canonical_topic='成分安全与限用边界',
        facet='key_metrics',
    ),
    RawKnowledgeInput(
        title='CRO 质量运营证据：ALCOA+ 原则要求电子记录同时满足可归属、可读、同步、原始、准确',
        content=(
            '公开 GxP/数据完整性共识：电子记录不只是“保存了就行”，必须满足 ALCOA+ 原则。'
            '在质量运营场景下，这直接影响偏差、CAPA、设备状态和研究数据是否可审计。\n'
            '数字人要求：若记录缺少操作者、时间戳、版本轨迹或原始留痕，应直接提示数据完整性风险。'
        ),
        summary='CRO 质量与运营实务的公开权威锚点：ALCOA+ 是电子记录最小底线。',
        entry_type='regulation',
        source_type='public_evidence_seed',
        source_key='cro-quality:regulation:alcoa-plus-data-integrity',
        namespace='cnkis',
        tags=['CRO质量', 'ALCOA+', '数据完整性'],
        package_id='pkg_cro_quality_operations',
        canonical_topic='CRO 质量与运营实务',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='CRO 质量运营证据：关键偏差应区分受试者安全、数据完整性与交付影响三类后果',
        content=(
            '公开质量管理实践表明，关键偏差不能只按“严重/一般”粗分。'
            '至少应同步判断其对受试者安全、主要终点数据完整性和客户/监管交付的影响路径。\n'
            '数字人要求：输出 CAPA 建议时，必须指明偏差伤害的是哪一条业务链，而不是只给抽象等级。'
        ),
        summary='CRO 质量与运营实务的公开方法学锚点：关键偏差需按后果链条拆分判断。',
        entry_type='method_reference',
        source_type='public_evidence_seed',
        source_key='cro-quality:method:deviation-consequence-chain',
        namespace='cnkis',
        tags=['CRO质量', '偏差', '后果链'],
        package_id='pkg_cro_quality_operations',
        canonical_topic='CRO 质量与运营实务',
        facet='sop_risks',
    ),
]


class Command(BaseCommand):
    help = '为关键专题包补充公开论文/方法学/成分安全证据锚点'

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
                f'公开证据锚点落库完成: created={created} skipped={skipped} errors={errors}'
            )
        )

    def _ingest(self, raw: RawKnowledgeInput) -> str:
        existed_before = KnowledgeEntry.objects.filter(
            source_type=raw.source_type,
            source_id=raw.source_id,
            source_key=raw.source_key,
            is_deleted=False,
        ).exists()
        try:
            result = run_pipeline(raw)
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f'  ✗ 失败: {raw.title[:70]} | {exc}'))
            return 'error'

        if result and result.entry_id:
            KnowledgeEntry.objects.filter(id=result.entry_id).update(
                status='published',
                is_published=True,
            )

        if result and result.entry_id and not existed_before:
            self.stdout.write(self.style.SUCCESS(f'  ✓ [{result.entry_id}] {raw.title[:70]}'))
            return 'created'

        self.stdout.write(f'  - 跳过（已存在）: {raw.title[:70]}')
        return 'skipped'
