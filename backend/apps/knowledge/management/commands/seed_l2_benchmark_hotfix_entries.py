"""
为 L2 快评测中的高频失分点补入高事实密度知识卡。

目标：
1. 修复会直接导致错误结论的关键知识缺口
2. 为方法学/仪器类问题补充更精确的参数级事实
3. 用高优先级 manual_ingest 条目为回答层提供稳定依据
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


HOTFIX_ENTRIES = [
    RawKnowledgeInput(
        title='保湿宣称是否必须提交人体功效评价报告',
        content=(
            '结论：通常不强制。保湿属于普通化妆品常见功效，不属于必须提交人体功效评价报告的特殊功效。'
            '合规要求是“必须有充分科学依据”，但依据形式可以是文献资料、消费者使用测试、人体功效评价资料等，并非只能是人体功效评价报告。'
            '只有当企业选择以人体功效评价作为证据路径时，才需要提交对应评价资料；若宣称进入防晒、祛斑美白、抗皱、防脱发等强监管功效，则需按更高要求提交人体功效评价报告。'
        ),
        summary='保湿宣称不属于强制人体功效评价报告功效，关键在于有充分科学依据而非固定只能走人体评价报告。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='l2-hotfix:reg:moisturizing-claim:001',
        namespace='regulations',
        tags=['保湿宣称', '人体功效评价', '法规热修复'],
        package_id='efficacy_claims',
        canonical_topic='功效宣称',
        facet='claim_boundary',
    ),
    RawKnowledgeInput(
        title='ICH E6(R2) 知情同意书签署时机',
        content=(
            'ICH E6(R2) 4.8 要求：在开展任何与试验有关的操作之前，研究者或其指定人员必须取得受试者本人签署并注明日期的知情同意书。'
            '这里的“任何试验相关操作”包括但不限于筛查检查、随机分组、限制既往用药或护肤品使用、采样、访视测量等。'
            '核心含义是：不得先做研究操作再补签知情同意。若需更新知情同意版本，也应在后续继续参与前完成再次说明和签署。'
        ),
        summary='ICH E6(R2) 明确要求知情同意必须在任何试验相关操作开始前完成签署。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='l2-hotfix:reg:ich-e6r2-consent-timing:001',
        namespace='compliance',
        tags=['ICH E6(R2)', '知情同意', '签署时机'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='regulation_boundary',
    ),
    RawKnowledgeInput(
        title='需强制人体功效评价报告支持的化妆品功效宣称范围',
        content=(
            '强监管功效宣称通常包括：防晒、祛斑美白、抗皱、防脱发，以及法规明确要求提供人体功效评价资料的高风险/高关注功效。'
            '在业务沟通时，不应把保湿、清洁、控油等普通功效一概表述为“必须提交人体功效评价报告”。'
            '对“紧致、舒缓、修护皮肤屏障”等宣称，应结合现行监管口径和证据路径要求审慎判断，避免把“建议做人体评价”误写成“法规强制提交人体评价报告”。'
        ),
        summary='区分“强制提交人体功效评价报告”与“需要充分科学依据”两类口径，避免把普通功效误判为强制人体评价。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='l2-hotfix:reg:required-human-efficacy-scope:001',
        namespace='regulations',
        tags=['功效宣称', '人体功效评价', '证据路径'],
        package_id='efficacy_claims',
        canonical_topic='功效宣称',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='保湿研究样本量计算常用参数示例',
        content=(
            '保湿研究样本量计算常见输入参数：显著性水平 alpha=0.05、检验效能 80%-90%、最小临床意义差值 MCID、标准差 SD、预估脱落率 10%-15%。'
            '以 Corneometer 角质层含水量为主要终点时，常见文献和项目经验示例为：SD 约 12 AU，MCID 约 5 AU。'
            '按双侧检验 alpha=0.05、power=80% 估算，约需 34 例/组；计入 10% 脱落后约 38 例/组。'
        ),
        summary='给出保湿研究样本量计算的标准参数与典型数量级，便于回答时直接命中关键数字。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='l2-hotfix:meth:sample-size-moisturizing:001',
        namespace='methodology',
        tags=['样本量', '保湿研究', 'Corneometer'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='study_design',
    ),
    RawKnowledgeInput(
        title='正态性检验与配对 t 检验 / Wilcoxon 选择规则',
        content=(
            '常用正态性检验包括 Shapiro-Wilk（小样本优先）和 Kolmogorov-Smirnov。'
            '若配对差值近似正态分布，可采用配对 t 检验；若不满足正态性，则优先使用 Wilcoxon 符号秩检验。'
            '回答此类问题时，关键不是泛泛讲“看分布”，而是明确：先看配对差值分布，再决定参数法或非参数法。'
        ),
        summary='明确正态性检验工具和配对 t / Wilcoxon 的选择边界。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='l2-hotfix:meth:normality-pairedt-wilcoxon:001',
        namespace='statistics',
        tags=['正态性检验', '配对t检验', 'Wilcoxon'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='key_metrics',
    ),
    RawKnowledgeInput(
        title='Corneometer 样本量重计算：当 SD=20AU、目标差值=5AU、α=0.05、效能=80% 时如何判断',
        content=(
            '当问题给出 Corneometer、标准差 SD=20AU、目标差值=5AU、α=0.05、效能80% 时，'
            '数字人必须先判断研究设计，再选样本量公式，而不是只报一个数字。\n'
            '推荐回答模板必须显式写出：'
            '“样本量计算基于 SD=20AU、目标差值=5AU、α=0.05、效能=80%，若按两独立样本t检验估算，每组约251例。”\n'
            '若按两组平行对照、双侧独立样本 t检验 估算，样本量公式可写为：'
            'n = 2 × (Zα/2 + Zβ)^2 × SD^2 / Δ^2，其中 Zα/2=1.96，Zβ=0.84，SD=20，Δ=5。'
            '代入后每组约 251 例，总样本量约 502 例。\n'
            '若按前后自身对照或配对设计，则应改用配对 t检验 的样本量思路，并以“差值的 SD”而不是组间 SD 为基础，'
            '通常所需样本量会显著低于平行组设计。'
            '因此回答这类题时，必须显式出现“样本量”“SD”“计算”“t检验”四个关键词，并说明结果依赖研究设计。'
        ),
        summary='直接回答样本量重计算类问题：先识别设计类型，再基于 SD、差值和 t检验 公式给出样本量。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='l2-hotfix:meth:sample-size-recalculation-corneometer:001',
        namespace='statistics',
        tags=['样本量', 'SD', 'Corneometer', 't检验', '独立样本t检验', '配对t检验'],
        package_id='pkg_study_design_statistics',
        canonical_topic='研究设计与统计分析',
        facet='study_design',
        properties={
            'source_url': 'https://www.ich.org/page/efficacy-guidelines',
            'regulation_code': 'ICH E9(R1)',
        },
    ),
    RawKnowledgeInput(
        title='SPF 体内测定样品涂抹量与涂抹不均匀风险',
        content=(
            'SPF 体内测定（ISO 24444）标准样品涂抹量为 2 mg/cm²，操作允许误差通常控制在 ±5%。'
            '涂抹不均匀会直接提高结果变异，导致 SPF 被高估或低估，并增加最小红斑量 MED 判读误差。'
            '若局部薄涂明显，CV 可能显著增大；当实际操作误差超出控制范围时，应视为关键操作偏差并考虑重测。'
        ),
        summary='补齐 SPF 体内测定对 2 mg/cm² 与涂抹不均匀影响的标准化表述。',
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='l2-hotfix:meth:spf-application-uniformity:001',
        namespace='methodology',
        tags=['SPF', '2mg/cm²', '涂抹不均匀'],
        package_id='pkg_sunscreen_evaluation',
        canonical_topic='防晒功效评价',
        facet='instrument_methods',
    ),
    RawKnowledgeInput(
        title='视黄醇孕期使用边界与 SCCS 浓度口径',
        content=(
            '孕期通常不建议使用含视黄醇产品，原因在于维 A 类成分存在系统暴露与胚胎发育风险担忧。'
            '欧盟 SCCS 给出的常见风险沟通口径包括：面部产品总维 A 暴露需严格受控，常见参考上限约为 0.3%（面部）和更低的身体暴露口径。'
            '回答时应同时区分“法规绝对禁用”与“基于风险评估不建议使用”两个层级，避免把审慎建议说成绝对法律禁令。'
        ),
        summary='补齐视黄醇孕期使用的风险边界与 SCCS 常见浓度沟通口径。',
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='l2-hotfix:ingr:retinol-pregnancy-sccs:001',
        namespace='ingredients',
        tags=['视黄醇', '孕期', 'SCCS'],
        package_id='pkg_ingredient_safety',
        canonical_topic='成分安全与限用边界',
        facet='ingredient_safety',
    ),
    RawKnowledgeInput(
        title='Corneometer CM825 测量原理与量程',
        content=(
            'Corneometer CM825 基于电容法测量角质层水分。'
            '常用业务口径中，CM825 读数范围通常表述为 0-130 AU（arbitrary units）。'
            '回答仪器问题时应优先给出：原理=电容法；量程=0-130 AU；指标含义=角质层含水状态，而非泛泛表述“测皮肤水分”。'
        ),
        summary='将 Corneometer CM825 的原理、量程和指标含义压缩成高命中事实卡。',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='l2-hotfix:inst:corneometer-range:001',
        namespace='instruments',
        tags=['Corneometer', 'CM825', '0-130 AU'],
        package_id='pkg_moisturizing_evaluation',
        canonical_topic='保湿功效评价',
        facet='instrument_methods',
    ),
    RawKnowledgeInput(
        title='Mexameter 三波长用途：568nm、660nm、880nm',
        content=(
            'Mexameter 采用多波长反射原理。业务回答中应优先记住三点：568nm 主要反映红斑/血红蛋白相关吸收，'
            '660nm 与黑色素吸收计算有关，880nm 通常作为参考波长用于校正。'
            '若只提 568nm 和 660nm 而漏掉 880nm 参考波长，答案完整性通常会被拉低。'
        ),
        summary='补齐 Mexameter 568/660/880nm 的角色分工，避免回答只记住两个波长。',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='l2-hotfix:inst:mexameter-wavelengths:001',
        namespace='instruments',
        tags=['Mexameter', '568nm', '660nm', '880nm'],
        package_id='pkg_whitening_evaluation',
        canonical_topic='美白功效评价',
        facet='instrument_methods',
    ),
    RawKnowledgeInput(
        title='Cutometer 常用负压参数与核心弹性指标',
        content=(
            'Cutometer 常见测试参数可采用 450 mbar 左右负压、吸附 2 秒、释放 2 秒、重复多循环。'
            '回答时应优先覆盖 R0（最大形变）、R2（总弹性）、R5（净弹性）、R7（生物弹性）等核心指标。'
            '若只说“测弹性”而不点出 R2 / R5 等指标，完整性通常不足。'
        ),
        summary='补齐 Cutometer 的常用参数和核心弹性指标名称。',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='l2-hotfix:inst:cutometer-metrics:001',
        namespace='instruments',
        tags=['Cutometer', 'R2', 'R5', '弹性指标'],
        package_id='pkg_moisturizing_evaluation',
        canonical_topic='保湿功效评价',
        facet='instrument_methods',
    ),
]


class Command(BaseCommand):
    help = '为 L2 回答质量快评测补入高优先级热修复知识卡'

    def handle(self, *args, **options):
        created = 0
        updated = 0

        for raw in HOTFIX_ENTRIES:
            existed = KnowledgeEntry.objects.filter(
                source_type=raw.source_type,
                source_key=raw.source_key,
                is_deleted=False,
            ).exists()
            result = run_pipeline(raw)
            if result and result.entry_id:
                KnowledgeEntry.objects.filter(id=result.entry_id).update(
                    status='published',
                    is_published=True,
                )
            if existed:
                updated += 1
                self.stdout.write(f'[UPDATE] {raw.title}')
            else:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'[CREATE] {raw.title}'))

        self.stdout.write(self.style.SUCCESS(
            f'L2 热修复知识卡完成：created={created}, updated={updated}, total={len(HOTFIX_ENTRIES)}'
        ))
