"""
批量灌入高价值预训练资源

覆盖缺失的 entry_type 和 namespace，提升知识库多样性：
- regulation：法规类（NMPA + ICH）
- instrument_spec：仪器规格（Corneometer/Tewameter/Mexameter/Cutometer/VISIA）
- ingredient_data：成分数据（烟酰胺等）
- sop：操作规程
- paper_abstract：论文摘要
- market_insight：市场洞察

用法: python manage.py ingest_high_value_resources
"""
from django.core.management.base import BaseCommand
from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput

HIGH_VALUE_RESOURCES = [
    # ── 法规类 (nmpa_regulation namespace) ──
    RawKnowledgeInput(
        content='化妆品功效宣称评价规范（2021年）\n\n第一条 为规范化妆品功效宣称评价活动，依据《化妆品监督管理条例》及相关规定，制定本规范。第二条 本规范适用于在中国境内销售的化妆品功效宣称评价活动。第三条 化妆品功效宣称应有充分的科学依据支撑，包括文献资料、研究数据或功效评价资料。第四条 宣称具有防晒、祛斑美白、抗皱、防脱发等功效的化妆品，需提供人体功效评价报告。第五条 功效评价机构需具备相应资质和能力，评价方法应科学合理且经过验证。第六条 违反本规范的，依据《化妆品监督管理条例》相关规定处理。',
        title='化妆品功效宣称评价规范（2021）',
        entry_type='regulation',
        source_type='regulation_tracker',
        source_key='nmpa:regulation:cosm-efficacy-claim-2021',
        namespace='nmpa_regulation',
        tags=['NMPA', '功效宣称', '法规', '化妆品', '监管'],
    ),
    RawKnowledgeInput(
        content='化妆品安全技术规范（2015年版）\n\n本规范规定了化妆品原料和产品的安全评估要求。禁用原料：明确不得用于化妆品生产的物质，包括致癌物、内分泌干扰物等。限用原料：使用有最高浓度限制，须在标签标注的原料。准用防腐剂：可用于化妆品且有最高使用浓度要求的防腐剂清单。准用防晒剂：可用于化妆品且有最高使用浓度要求的防晒剂清单（UVA和UVB滤光剂）。准用着色剂：可用于化妆品的着色剂，包括仅用于不接触皮肤产品的和可用于接触皮肤产品的。微生物检验指标：需氧菌总数≤1000 CFU/g（眼部≤100）；霉菌和酵母菌≤100 CFU/g；不得检出金黄色葡萄球菌、铜绿假单胞菌、粪大肠菌群。',
        title='化妆品安全技术规范（2015年版）',
        entry_type='regulation',
        source_type='regulation_tracker',
        source_key='nmpa:regulation:cosm-safety-std-2015',
        namespace='nmpa_regulation',
        tags=['NMPA', '安全技术规范', '法规', '禁用原料', '微生物'],
    ),
    RawKnowledgeInput(
        content='ICH E6(R2) GCP 临床研究良好实践指南\n\n申办者职责：5.1 质量保障（QA）和质量控制（QC）：申办者应建立并维护确保临床试验质量的系统。5.5 试验监查目的：核实受试者权益和安全受到保护，试验数据准确、完整和可核实，试验符合当前方案。5.18.4 原始文件保存：申办者应确保在原始文件中记录各试验观察的文件保存政策。研究者职责：4.8 知情同意：研究者应遵守适用的法规要求，向受试者或其合法授权代表提供有关试验的详细信息。4.9.5 记录和报告：研究者应确保准确完整记录试验数据，包括CRF填写要求和源文件。ICH E6(R2) 于2016年发布，是临床研究行业最重要的国际规范之一。',
        title='ICH E6(R2) 临床研究良好实践指南（GCP）',
        entry_type='regulation',
        source_type='sop_sync',
        source_key='gcp:ich-e6-r2:2016',
        namespace='cnkis',
        tags=['ICH', 'GCP', 'E6', '临床研究', '国际法规'],
    ),
    RawKnowledgeInput(
        content='GB/T 35082-2017 化妆品保湿功效评价导则\n\n本导则规定了化妆品保湿功效评价的试验方法和评价指标。主要方法：1. Corneometer法（电容法）：测量角质层含水量，仪器分辨率≥1AU，测量前皮肤适应环境30分钟。2. Tewameter法（蒸发法）：测量经皮水分散失（TEWL），测量前5分钟不使用任何产品。测量部位：前臂屈侧（标准），可选面颊。环境条件：20-22°C，相对湿度40-60%。统计方法：配对t检验或Wilcoxon符号秩检验，显著性水平p<0.05。样本量：每组不少于30例受试者。',
        title='GB/T 35082-2017 化妆品保湿功效评价导则',
        entry_type='regulation',
        source_type='regulation_tracker',
        source_key='gb-t:35082:2017',
        namespace='nmpa_regulation',
        tags=['GB/T 35082', '保湿', '功效评价', '标准', 'Corneometer'],
    ),
    # ── 仪器规格类 ──
    RawKnowledgeInput(
        content='Corneometer CM825 皮肤水分测量仪技术规格\n\n测量原理：电容法（dielectric constant measurement），通过探头检测皮肤的电容变化来反映含水量。测量参数：角质层含水量（Stratum Corneum Hydration）。测量单位：AU（Arbitrary Units）。测量范围：0-130 AU。正常皮肤参考值：40-60 AU（因仪器型号和环境条件有差异）。重复性：±1 AU（测量条件标准化时）。温度要求：20±2°C，相对湿度40-60%。稳定时间：在测量区域静置30秒后开始测量，连续测量间隔5秒。探头类型：圆形弹簧加压探头，直径8mm，面积50mm²。校准：开机前使用校准片校准，每日至少校准一次。品牌：Courage + Khazaka Electronic GmbH（德国），全球最广泛使用的皮肤水分测量仪。',
        title='Corneometer CM825 技术规格与操作要点',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:corneometer:cm825:spec',
        namespace='cnkis',
        tags=['Corneometer', '皮肤水分', '仪器规格', '电容法', 'CM825'],
    ),
    RawKnowledgeInput(
        content='Tewameter TM 300/TM Nano 经皮水分散失测量仪技术规格\n\n测量原理：无阻塞腔（Open Chamber）蒸发法，测量探头内两个传感器的温湿度差异来计算蒸发率。测量参数：经皮水分散失（TEWL，Transepidermal Water Loss）。测量单位：g/m²/h。正常皮肤参考值：5-10 g/m²/h（前臂内侧，标准环境条件下）。皮肤屏障功能评估：TEWL增高提示皮肤屏障功能受损，正常值因部位不同差异较大。测量范围：0-200 g/m²/h（TM300）。测量环境：标准化温度22±1°C，相对湿度50±10%，无风。稳定时间：5分钟适应环境后开始测量，每次测量时间90秒取平均值。应用：皮肤屏障修复功效评估，经皮药物吸收研究，干性皮肤评估。品牌：Courage + Khazaka Electronic GmbH（德国）。',
        title='Tewameter TM 300 经皮水分散失仪技术规格',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:tewameter:tm300:spec',
        namespace='cnkis',
        tags=['Tewameter', 'TEWL', '皮肤屏障', '仪器规格', '经皮水分散失'],
    ),
    RawKnowledgeInput(
        content='Mexameter MX 18 皮肤色度计技术规格\n\n测量原理：吸收反射光度法（窄光谱光度测量），使用568nm和660nm两种波长光。测量参数：黑色素（Melanin）指数和红斑（Erythema）指数。测量单位：0-999（两种参数分别独立）。黑色素测量：主要用于美白功效评估，监测黑色素减少程度。红斑测量：用于抗炎评估，监测皮肤炎症减轻程度。VISIA 对比：Mexameter 定量测量单点数值，VISIA 提供面部二维分布图；前者适合功效统计分析，后者适合视觉展示。测量注意：避免压力（影响血流），保持探头清洁，测量前30秒不触摸皮肤，避免强光直射。品牌：Courage + Khazaka Electronic GmbH（德国）。',
        title='Mexameter MX 18 皮肤色度计技术规格',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:mexameter:mx18:spec',
        namespace='cnkis',
        tags=['Mexameter', '黑色素', '红斑', '美白功效', '仪器规格'],
    ),
    RawKnowledgeInput(
        content='Cutometer MPA 580 皮肤弹性仪技术规格\n\n测量原理：负压吸引法（vacuum suction），通过负压将皮肤吸入测量头，测量皮肤的机械形变特性。测量参数：皮肤弹性和黏弹性（viscoelasticity）。测量单位：mm（形变量）。主要参数解读：Uf（最大形变量，皮肤硬度指标），Ue（即时弹性恢复），Ur（弹性恢复量，与弹性纤维相关），R2（弹性率=Ur/Uf，值越高弹性越好）。应用：抗皱功效评价、皮肤紧致度评估、弹性相关成分研究。测量条件：标准化温湿度环境（22°C，50%RH），各点测量间隔10秒。品牌：Courage + Khazaka Electronic GmbH（德国）。',
        title='Cutometer MPA 580 皮肤弹性仪技术规格',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:cutometer:mpa580:spec',
        namespace='cnkis',
        tags=['Cutometer', '皮肤弹性', '抗皱', '仪器规格', '负压'],
    ),
    RawKnowledgeInput(
        content='VISIA 皮肤图像分析系统技术规格（第7代）\n\n测量原理：多光谱成像技术（标准光、交叉偏振光、UV光），配合AI图像分析算法。测量功能八项：斑点（Spots）、皱纹（Wrinkles）、纹理（Texture）、毛孔（Pores）、UV斑（UV Spots，日光性损伤）、棕色斑（Brown Spots，深层色素）、红区（Red Areas，血管病变）、紫质（Porphyrins，粉刺预测）。结果展示：百分率（相对同龄同肤色人群），原始图像，分布图。应用：全面皮肤状态基线评估，化妆品功效前后对比分析，个性化护肤方案制定。品牌：Canfield Scientific（美国），全球最广泛使用的多维皮肤分析系统。',
        title='VISIA 皮肤图像分析系统技术规格',
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:visia:gen7:spec',
        namespace='cnkis',
        tags=['VISIA', '皮肤图像', '皮肤分析', '仪器规格', 'Canfield'],
    ),
    # ── 成分数据类 ──
    RawKnowledgeInput(
        content='烟酰胺（Niacinamide）化妆品成分安全评估与功效数据\n\nINCI名称：Niacinamide，CAS号：98-92-0，分子式：C6H6N2O。常用浓度：1-10%（功效最佳浓度2-5%）。安全性：CIR（Cosmetic Ingredient Review）评估为安全，GRAS（Generally Recognized As Safe）级别；中国《化妆品安全技术规范》无明确限量，一般用量建议不超过10%。主要功效：提亮肤色（抑制黑色素体转移到角质形成细胞，而非抑制酪氨酸酶，属于美白功效）；细腻毛孔（收缩毛孔外观）；控油（减少皮脂分泌）；修复皮肤屏障（促进神经酰胺等合成）；抗炎（抑制TNF-α，减少皮肤刺激）。评价标准：NMPA功效评价规范，可用于支持美白/提亮功效宣称。原料目录：收录于《已使用化妆品原料目录》。使用注意：高浓度（>10%）可能导致部分人群产生潮红（flush）反应，建议从低浓度开始使用；可与维C、视黄醇等活性成分配合使用。',
        title='烟酰胺（Niacinamide）安全评估与功效数据',
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:niacinamide:safety-profile',
        namespace='cnkis',
        tags=['烟酰胺', 'niacinamide', '成分', '美白', '安全评估'],
    ),
    RawKnowledgeInput(
        content='透明质酸（Hyaluronic Acid）化妆品成分安全评估\n\nINCI名称：Sodium Hyaluronate（钠盐），CAS号：9004-61-9。分子量：低分子（50-150kDa）和高分子（1000-1800kDa）形式。常用浓度：0.01-2%。安全性：高度安全，皮肤耐受性好，无明显刺激性，CIR评估为安全。主要功效：保湿（吸附水分子，可吸收自身重量1000倍的水）；锁水（在皮肤表面形成保湿膜）；修复皮肤屏障。作用机制差异：低分子透明质酸可渗透皮肤深层，有更好的深层保湿效果；高分子主要在皮肤表面形成保湿膜。评价标准：NMPA保湿功效评价规范。原料目录：收录于《已使用化妆品原料目录》。',
        title='透明质酸（Hyaluronic Acid）安全评估与功效数据',
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:hyaluronic-acid:safety-profile',
        namespace='cnkis',
        tags=['透明质酸', 'hyaluronic acid', '保湿', '成分', '安全评估'],
    ),
    # ── SOP 类 ──
    RawKnowledgeInput(
        content='受试者招募与筛选标准操作规程（SOP-RCT-001 v1.0）\n\n1. 目的\n确保受试者招募过程符合伦理要求和方案规定，保障受试者安全和权益。\n\n2. 适用范围\n化妆品功效评价研究的受试者招募和筛选工作。\n\n3. 入选标准\n3.1 年龄：18-60岁（根据研究方案调整），身体健康\n3.2 性别：根据研究目的确定（如保湿研究通常不限性别）\n3.3 皮肤状态：符合研究方案要求的皮肤状态（如干性皮肤TEWL>15g/m²/h）\n3.4 知情同意：自愿签署知情同意书，理解研究内容和风险\n\n4. 排除标准\n4.1 妊娠期或哺乳期\n4.2 相关皮肤病史（如湿疹、接触性皮炎、银屑病、白癜风）\n4.3 对测试产品成分已知过敏史\n4.4 评估区域有文身、疤痕或其他皮肤异常\n4.5 评估前4周内使用免疫抑制剂或系统性激素药物\n4.6 评估前2周内使用皮肤科外用药物（评估区域）\n4.7 评估前48小时内阳光暴晒或使用日光浴设备\n\n5. 知情同意流程\n5.1 研究者向受试者详细说明研究目的、程序、可能风险和权益（包括退出权利）\n5.2 给予受试者充分提问时间，确保理解\n5.3 受试者理解并自愿签署ICF\n5.4 副本存档',
        title='受试者招募与筛选 SOP（化妆品功效研究）',
        entry_type='sop',
        source_type='sop_sync',
        source_key='sop:recruitment:RCT-001-v1.0',
        namespace='internal_sop',
        tags=['SOP', '受试者招募', '筛选标准', '知情同意', '入排标准'],
    ),
    RawKnowledgeInput(
        content='仪器测量标准操作规程（SOP-INST-001 v2.0）\n\n1. 目的\n规范化妆品功效评价中常用仪器的操作程序，确保测量数据准确可靠。\n\n2. 测量环境要求\n温度：20-22°C（±1°C），相对湿度：40-60%（±5%），无明显气流干扰，测量前环境适应时间≥30分钟。\n\n3. 受试者准备\n测量前：清洗评估区域皮肤，不使用任何产品；休息30分钟（消除运动、出汗等影响）；测量前5分钟暴露评估区域。\n\n4. Corneometer操作规程\n4.1 开机校准：使用配套校准片校准\n4.2 探头清洁：每次测量后用酒精棉擦拭\n4.3 测量方法：探头垂直贴合皮肤，轻压（不挤压），读取稳定值\n4.4 重复次数：同一部位测量3-5次取平均值\n\n5. Tewameter操作规程\n5.1 测量位置：固定标记，每次在同一位置测量\n5.2 操作要求：探头水平放置，不施压，保持稳定90秒\n5.3 数据记录：记录稳定段（最后30秒）的平均值\n\n6. 数据记录\n使用CRF或电子数据采集系统记录所有测量值，不得涂改，如有更正需注明原因。',
        title='仪器测量 SOP（Corneometer/Tewameter）',
        entry_type='sop',
        source_type='sop_sync',
        source_key='sop:instrument-measurement:INST-001-v2.0',
        namespace='internal_sop',
        tags=['SOP', '仪器测量', 'Corneometer', 'Tewameter', '操作规程'],
    ),
    # ── 论文摘要类 ──
    RawKnowledgeInput(
        content='皮肤保湿功效评价方法研究进展（综述）\n\n摘要：本文综述了化妆品保湿功效的主要评价方法及其在功效研究中的应用。主要仪器测量方法：(1) Corneometer电容法—测量角质层含水量，是最广泛使用的保湿功效评估方法；(2) Tewameter蒸发法—测量经皮水分散失（TEWL），评估皮肤屏障功能；(3) 高频超声波—评估皮肤含水量分布和厚度。RCT设计要求：随机化、双盲、安慰剂对照；样本量每组≥30例；连续使用4-8周评估。统计方法：配对t检验（正态分布数据）或Wilcoxon符号秩检验（非正态分布），显著性水平p<0.05。同时采用仪器测量和受试者自评问卷（如SRSC保湿效果自评量表）可获得更全面的功效证据。参考标准：GB/T 35082-2017，ISO 16128。',
        title='皮肤保湿功效评价方法研究进展（综述）',
        entry_type='paper_abstract',
        source_type='paper_scout',
        source_key='paper:moisturizing-review:2023-local',
        namespace='cnkis',
        tags=['保湿', '功效评价', 'Corneometer', 'TEWL', '综述', 'RCT'],
    ),
    RawKnowledgeInput(
        content='防晒产品SPF测定方法研究：体内法与体外法的对比\n\n摘要：防晒指数（SPF）测定是防晒产品功效评价的核心方法。体内法（in vivo）：ISO 24444:2010标准，以最小红斑量（MED）为终点，受试者背部照射，样品使用量2mg/cm²，计算SPF=有样品部位的MED/无样品部位的MED。体外法（in vitro）：ISO 24443，通过分光光度计测量紫外透射率，适用于初步筛选，需与体内法相关性验证。UVA防护评价：PA级别（日本体系）或UVA-PF（欧洲体系），ISO 24442体内法。我国国标：GB/T 17149.1-2017系列标准。注意事项：体内法受试者应为健康成人（18-60岁），排除皮肤病，测试前48小时避免阳光暴晒。',
        title='防晒产品SPF测定方法：体内法与体外法对比',
        entry_type='paper_abstract',
        source_type='paper_scout',
        source_key='paper:sunscreen-spf-method:2024-local',
        namespace='cnkis',
        tags=['防晒', 'SPF', 'ISO 24444', 'UVA', '体内法', '功效评价'],
    ),
    # ── 市场洞察类 ──
    RawKnowledgeInput(
        content='2024年中国化妆品功效检测市场分析报告\n\n市场规模：2024年中国化妆品功效检测市场规模约150亿元，预计2025年增至180亿元，年复合增长率约20%。增长驱动因素：（1）NMPA监管升级，要求功效宣称提供充分科学依据，人体功效评价需求爆发；（2）消费者对功效化妆品（活性护肤品）需求快速增长；（3）品牌方加大研发投入，第三方检测需求增加。主要细分市场：保湿类（最大细分市场，约35%）、防晒类（约20%）、美白类（约15%）、抗皱紧致类（约15%）、其他（修复、控油等，约15%）。竞争格局：外资机构（SGS、Intertek、Eurofins）具备国际认证和全球网络优势；本土专业机构（上海皮肤病医院、南方医科大学、广州皮肤病防治所）具有本土资质和成本优势；CRO型机构（中科贝医、诺康源）提供一体化服务。行业趋势：AI图像分析、可穿戴传感器逐步应用；数字化和标准化成为竞争差异化方向；GLP资质检测机构需求增加。',
        title='2024年中国化妆品功效检测市场分析',
        entry_type='market_insight',
        source_type='manual_ingest',
        source_key='market:cosm-efficacy-testing-2024',
        namespace='cnkis',
        tags=['市场分析', '化妆品CRO', '功效检测', '行业报告', '2024'],
    ),
]


class Command(BaseCommand):
    help = '批量灌入高价值预训练资源（补充缺失的 entry_type 和 namespace）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--disable-llm-enrich',
            action='store_true',
            help='关闭 LLM 富化，走稳定规则管线，适合大批量补数',
        )

    def handle(self, *args, **options):
        from apps.knowledge.models import KnowledgeEntry
        if options.get('disable_llm_enrich'):
            import apps.knowledge.ingestion_pipeline as pipeline_module

            pipeline_module._LLM_ENRICH_ENABLED = False
            self.stdout.write('已关闭 LLM 富化，使用稳定规则管线灌入。')

        total = len(HIGH_VALUE_RESOURCES)
        self.stdout.write(f'开始灌入 {total} 条高价值资源...')
        created = 0
        skipped = 0
        errors = 0

        for raw in HIGH_VALUE_RESOURCES:
            try:
                existed_before = KnowledgeEntry.objects.filter(
                    source_type=raw.source_type,
                    source_id=raw.source_id,
                    source_key=raw.source_key,
                    is_deleted=False,
                ).exists()
                result = run_pipeline(raw)
                if result and result.entry_id and not existed_before:
                    created += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'  ✓ [{result.entry_id}] {raw.title[:50]}')
                    )
                else:
                    skipped += 1
                    stage_errors = result.stage_errors if result else {}
                    self.stdout.write(
                        f'  - 跳过（已存在）: {raw.title[:50]}'
                    )
            except Exception as e:
                errors += 1
                self.stdout.write(
                    self.style.ERROR(f'  ✗ 失败: {raw.title[:50]} | {e}')
                )

        total_entries = KnowledgeEntry.objects.filter(is_deleted=False).count()
        self.stdout.write(self.style.SUCCESS(
            f'\n灌入完成: 创建 {created} 条 | 跳过 {skipped} 条（已存在）| 失败 {errors} 条'
        ))
        self.stdout.write(f'当前知识条目总数: {total_entries}')
