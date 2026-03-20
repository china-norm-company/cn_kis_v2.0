"""
预训练语料批量灌入命令

分三个优先级批次灌入行业公开权威资料：
  P0 权威基础层：ICH全系指南、NMPA全量法规、GB/ISO标准、CDISC映射
  P1 专业方法层：功效评价方法论、成分安全数据、评价路径详解
  P2 应用增强层：FAQ、方案模板、典型场景指导

用法：
  python manage.py ingest_pretraining_corpus              # 全部
  python manage.py ingest_pretraining_corpus --tier P0   # 仅 P0
  python manage.py ingest_pretraining_corpus --tier P1
  python manage.py ingest_pretraining_corpus --tier P2
  python manage.py ingest_pretraining_corpus --dry-run   # 试运行（不写库）
"""
from django.core.management.base import BaseCommand
from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput


# ── P0：权威基础层 ──────────────────────────────────────────────────────────

P0_CORPUS = [
    # ICH 指南系列
    RawKnowledgeInput(
        title='ICH E9(R1) 临床研究统计学原则',
        content=(
            'ICH E9(R1) 临床试验统计学原则（2019修订版）\n\n'
            '核心内容：\n'
            '1. 估计目标框架（Estimand Framework）：E9(R1) 新增对"估计目标"的明确要求。'
            '估计目标定义了临床问题在统计上的精确回答，须包含：研究人群、终点变量、干预、'
            '与治疗无关的事件（伴随事件）处理方式、汇总量。\n'
            '2. 样本量计算：应基于主要终点的统计检验，明确：α（I类错误率，双侧通常0.05）、'
            'β（II类错误率，通常0.10-0.20，对应检验效能80-90%）、最小临床意义差值（MCID）、'
            '变异度估计（标准差或比例）。\n'
            '3. 化妆品研究应用：人体功效评价通常采用自身对照设计，样本量计算参考历史数据的SD。'
            '保湿研究：Corneometer差值通常SD约10-15AU，MCID约5AU，双侧t检验α=0.05，'
            'power=80%，约需33例/组，考虑10%脱落率后36例/组。\n'
            '4. 缺失数据处理：须预先制定缺失数据处理计划，MCAR/MAR/MNAR不同假设处理方法不同。\n'
            '5. 多重比较：多个主要终点时需控制整体I类错误率（Bonferroni法或Holm法）。'
        ),
        entry_type='regulation',
        source_type='ich_import',
        source_key='ich:e9-r1:statistics:2019',
        namespace='regulations',
        tags=['ICH', 'E9', '统计学', '样本量', '估计目标', 'estimand'],
        properties={'regulation_code': 'ICH E9(R1)', 'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='ICH E8(R1) 临床研究一般考量',
        content=(
            'ICH E8(R1) 临床研究一般考量（2021修订版）\n\n'
            '核心更新：以质量为核心的研究设计框架（Quality by Design, QbD）。\n\n'
            '一、研究目标与设计要素\n'
            '研究目标（Research Question）应明确：研究人群、干预/暴露、比较对象、终点结果、'
            '时间框架（PICOT框架）。\n\n'
            '二、研究类型与选择\n'
            '干预性研究：实验性（随机）或准实验性，化妆品功效评价通常采用。\n'
            '观察性研究：队列、病例对照、横断面研究。\n\n'
            '三、质量关键要素（QCE）\n'
            '包括：主要终点选择的理由、统计分析计划、受试者保护措施。\n\n'
            '四、化妆品研究特殊考量\n'
            '双盲设计要求：感官评估（如气味、质地）可能破盲，需特殊设计。\n'
            '非劣效性研究：常用于新成分与已知有效成分对比，需预先定义非劣效界值（NI Margin）。\n'
            '自身对照设计：半脸对照或左右臂对照，适合局部功效评价，减少受试者间变异。'
        ),
        entry_type='regulation',
        source_type='ich_import',
        source_key='ich:e8-r1:general-considerations:2021',
        namespace='regulations',
        tags=['ICH', 'E8', '研究设计', 'QbD', '临床研究'],
        properties={'regulation_code': 'ICH E8(R1)', 'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='ICH E10 对照组选择与临床试验设计',
        content=(
            'ICH E10 对照组的选择与临床试验设计相关考量\n\n'
            '一、对照组类型\n'
            '1. 安慰剂对照：最严格的对照，可量化绝对效应；化妆品功效评价中常用（空白基质对照）。\n'
            '2. 阳性对照（活性对照）：用于非劣效性研究，证明新产品效果不劣于已知有效产品。\n'
            '3. 剂量-反应对照：研究不同浓度的效果差异，适合成分浓度优化研究。\n'
            '4. 空白对照/基线对照：自身前后对照，化妆品研究常用（使用前 vs 使用后）。\n\n'
            '二、化妆品功效研究对照设计要点\n'
            '半脸对照（Split-face）：双侧随机分配测试产品和对照品，消除受试者间差异。\n'
            '前后自身对照：同一受试者使用前和使用后对比，样本量要求相对较小。\n'
            '建议设计：V0（基线）+ V1（使用2周）+ V2（使用4周）+ V3（使用8周）随访点。\n\n'
            '三、安慰剂对照的特殊考量\n'
            '化妆品领域：空白基质（不含活性成分的基础配方）是最常见的安慰剂对照。\n'
            '感官干扰：如产品有明显气味/质地差异，可能无法实现真正盲法。'
        ),
        entry_type='regulation',
        source_type='ich_import',
        source_key='ich:e10:control-group:2001',
        namespace='regulations',
        tags=['ICH', 'E10', '对照组', '安慰剂', '研究设计', '盲法'],
        properties={'regulation_code': 'ICH E10', 'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='ICH Q10 药品质量体系（适用于CRO质量管理）',
        content=(
            'ICH Q10 药品质量体系（2008年）\n\n'
            'CRO行业适用要点：\n\n'
            '一、质量管理体系要素\n'
            '1. 质量手册：描述质量体系框架，明确职责分工。\n'
            '2. SOP体系：覆盖所有关键流程的标准操作规程，定期审核和更新。\n'
            '3. 文件管理：文件受控管理，版本记录完整，历史版本可追溯。\n'
            '4. 偏差管理：发现偏差即时记录，评估影响，必要时启动CAPA。\n\n'
            '二、持续改进要求\n'
            '定期内部审计（至少年度一次），评估质量体系有效性。\n'
            '管理审核：高层定期审查质量KPI，包括偏差率、CAPA完成率、客户投诉率。\n\n'
            '三、化妆品CRO适用\n'
            'NMPA GMP检查关注重点：环境监测记录完整性、仪器校准记录、受试者数据完整性。\n'
            '21 CFR Part 11合规（电子记录）：数字签名、审计追踪、访问控制。'
        ),
        entry_type='regulation',
        source_type='ich_import',
        source_key='ich:q10:quality-system:2008',
        namespace='regulations',
        tags=['ICH', 'Q10', '质量体系', 'SOP', 'GMP', 'CRO管理'],
        properties={'regulation_code': 'ICH Q10', 'source_url': 'https://www.ich.org/page/quality-guidelines'},
    ),
    # NMPA 法规完整系列
    RawKnowledgeInput(
        title='化妆品监督管理条例（2021）主要条款',
        content=(
            '化妆品监督管理条例（2021年1月1日施行）\n\n'
            '第一条 立法目的：规范化妆品生产经营活动，加强化妆品监督管理，保障消费者健康。\n\n'
            '第二条 定义：化妆品是指以涂擦、喷洒或者其他类似方法，施用于皮肤、毛发、指甲、'
            '口唇等人体表面，以清洁、保护、美化、修饰为目的的日用化学工业产品。\n\n'
            '第三条 分类管理：特殊化妆品（注册制）包括：染发、烫发、祛斑美白、防晒、防脱发以及'
            '宣称新功效的化妆品；其余为普通化妆品（备案制）。\n\n'
            '第十七条 功效宣称：化妆品的功效宣称应当有充分的科学依据。\n\n'
            '第二十六条 人体功效评价试验要求：开展化妆品人体功效评价试验，应当在具备相应资质的'
            '机构进行，受试者须签署知情同意书，确保安全。\n\n'
            '第六十一条 违反功效宣称：对化妆品的成分、功效等作虚假或误导性宣称，由监管部门处理。'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='nmpa:cosm-supervision-regulation:2021',
        namespace='regulations',
        tags=['NMPA', '化妆品条例', '法规', '特殊化妆品', '功效宣称', '监管'],
        properties={'regulation_code': '国令第727号', 'source_url': 'https://www.nmpa.gov.cn'},
    ),
    RawKnowledgeInput(
        title='化妆品注册备案管理办法（2021）核心条款',
        content=(
            '化妆品注册备案管理办法（2021年5月1日施行）\n\n'
            '第一章 总则\n'
            '第二条 注册和备案的化妆品须符合法律、法规、强制性国家标准和技术规范要求。\n\n'
            '第三章 注册\n'
            '第十四条 特殊化妆品上市前须经国家药品监督管理局注册审批。注册申请资料包括：'
            '产品名称及命名依据、产品配方、产品执行标准、安全评估报告、功效评价资料。\n\n'
            '功效评价资料要求（第二十六条）：\n'
            '宣称防晒、祛斑美白、防脱发功效的，须提供人体功效评价报告；\n'
            '宣称抗皱、紧致、修护等功效的，须提供功效评价资料（人体功效评价报告或消费者使用测试报告）；\n'
            '宣称保湿等一般功效的，可采用文献资料支持。\n\n'
            '第六章 监督管理\n'
            '已注册备案的产品如发生配方变更，须重新注册或备案。'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='nmpa:cosm-registration-management:2021',
        namespace='regulations',
        tags=['NMPA', '注册备案', '特殊化妆品', '功效宣称', '安全评估'],
        properties={'regulation_code': '国家药监局令第35号', 'source_url': 'https://www.nmpa.gov.cn'},
    ),
    RawKnowledgeInput(
        title='化妆品功效宣称评价规范完整版（2021）',
        content=(
            '化妆品功效宣称评价规范（2021年5月1日施行）\n\n'
            '一、适用范围\n'
            '适用于所有在中国上市的化妆品功效宣称的评价活动。\n\n'
            '二、功效评价方式\n'
            '（一）文献资料或研究数据评价：适用于通过文献或公认科学理论支持的功效宣称。\n'
            '（二）消费者使用测试评价：适用于通过消费者感知评价的功效宣称（如"气味怡人"）。\n'
            '（三）人体功效评价试验：法规要求人体功效评价的功效宣称。\n'
            '（四）体外实验或仪器评价：适用于部分功效宣称的辅助评价。\n\n'
            '三、需要人体功效评价报告的宣称类型（附表1）\n'
            '防晒（SPF/PA值标注）、祛斑美白、抗皱、紧致、舒缓、修护皮肤屏障、防脱发、'
            '生发（仅特殊用途化妆品），以及产品注册时宣称的其他功效。\n\n'
            '四、人体功效评价机构要求\n'
            '需具备相应的专业资质和能力，包括：专业评价人员（皮肤科医生或相关专业人员）、'
            '符合标准的测量仪器和环境条件、符合伦理要求的受试者管理规程。\n\n'
            '五、评价报告要求\n'
            '人体功效评价报告须包含：研究设计说明、受试者信息（入排标准、人口统计）、'
            '测量方法和仪器、统计分析方法、结果和结论、评价机构签章。'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='nmpa:cosm-efficacy-claim-regulation:2021-full',
        namespace='regulations',
        tags=['NMPA', '功效宣称', '人体功效评价', '法规', '特殊化妆品', '评价规范'],
        properties={'regulation_code': '国家药监局公告2021年第51号', 'source_url': 'https://www.nmpa.gov.cn'},
    ),
    RawKnowledgeInput(
        title='ISO 24442:2022 防晒产品体内UVA防护测定',
        content=(
            'ISO 24442:2022 化妆品 防晒试验方法 体内防晒UVA防护测定\n\n'
            '适用范围：体内法测定防晒化妆品的紫外A线防护因子（UVAPF）。\n\n'
            '方法原理：用单色辐射仪（monochromator）在UVA波段测定最小持续色素沉着量（MPPD）。\n\n'
            '受试者要求：\n'
            '- 健康成人，年龄18-60岁\n'
            '- Fitzpatrick皮肤类型II-IV型\n'
            '- 排除光敏感史、正在使用光敏感性药物者\n\n'
            '测试方法：\n'
            '1. 在受试者背部划定测试区域，面积25cm²\n'
            '2. 样品涂抹量2mg/cm²\n'
            '3. 照射4个UVA剂量点，确定MPPD值\n'
            '4. 24小时后读取MPPD（最小出现持久性晒黑的最低剂量）\n'
            '5. UVAPF = 使用样品后MPPD / 不使用样品MPPD\n\n'
            'PA分级（日本JIS S 3371对应）：\n'
            'PA+：UVAPF ≥ 2, <4\n'
            'PA++：UVAPF ≥ 4, <8\n'
            'PA+++：UVAPF ≥ 8, <16\n'
            'PA++++：UVAPF ≥ 16\n\n'
            '统计要求：至少10名受试者，计算几何均数。'
        ),
        entry_type='method_reference',
        source_type='gb_standard_import',
        source_key='iso:24442:2022:uvapf-in-vivo',
        namespace='regulations',
        tags=['ISO 24442', 'UVA防护', 'UVAPF', 'PA值', '防晒', '体内法'],
        properties={'standard_code': 'ISO 24442:2022', 'source_url': 'https://www.iso.org/standard/78257.html'},
    ),
    RawKnowledgeInput(
        title='GB/T 37625-2019 化妆品检验规则',
        content=(
            'GB/T 37625-2019 化妆品检验规则\n\n'
            '适用范围：适用于化妆品产品的型式检验、出厂检验和监督检验。\n\n'
            '检验分类：\n'
            '1. 型式检验：新产品注册或备案、配方重大变更时进行，包含全项目检验。\n'
            '2. 出厂检验：每批次产品出厂前进行，包含感官指标、理化指标和微生物指标。\n'
            '3. 监督检验：监管部门的抽检，通常进行全项目或关键项目检验。\n\n'
            '微生物检验指标（GB/T 7917系列）：\n'
            '菌落总数（需氧菌总数）：眼部用、儿童用化妆品 ≤500 CFU/g（mL）；其他 ≤1000 CFU/g（mL）\n'
            '霉菌和酵母菌总数：≤100 CFU/g（mL）\n'
            '耐热大肠菌群：不得检出\n'
            '金黄色葡萄球菌：不得检出\n'
            '铜绿假单胞菌：不得检出\n\n'
            '理化检验：pH值、黏度等依据产品执行标准。\n\n'
            '判定规则：全部检验项目符合要求判为合格，任一项不符合判为不合格。'
        ),
        entry_type='method_reference',
        source_type='gb_standard_import',
        source_key='gb-t:37625:2019:inspection-rules',
        namespace='regulations',
        tags=['GB/T 37625', '检验规则', '微生物', '化妆品检验', '出厂检验'],
        properties={'standard_code': 'GB/T 37625-2019'},
    ),
]

# ── P1：专业方法层 ──────────────────────────────────────────────────────────

P1_CORPUS = [
    # 六大功效评价路径详解
    RawKnowledgeInput(
        title='保湿功效完整评价路径与方法选择指南',
        content=(
            '化妆品保湿功效完整评价路径\n\n'
            '法规依据：《化妆品功效宣称评价规范》（2021），GB/T 35082-2017。\n\n'
            '一、评价方法选择\n'
            '主要仪器法（推荐）：\n'
            '- Corneometer CM825：测量角质层含水量，最广泛使用，操作简便，重复性好。\n'
            '  正常范围：干性皮肤<40AU，正常皮肤40-60AU，油性皮肤>60AU。\n'
            '- Tewameter TM300/Nano：测量TEWL，评估皮肤屏障功能，适合屏障修护宣称。\n'
            '  正常范围：前臂内侧5-10 g/m²/h（标准环境下）。\n\n'
            '辅助方法：\n'
            '- 消费者自评问卷：SRSC量表或自设量表，须经效度和信度验证。\n'
            '- 专家皮肤科医生评分：0-4分量表评估皮肤干燥程度。\n\n'
            '二、研究设计要求\n'
            '- 受试者数量：每组≥30例（统计检验效能≥80%）\n'
            '- 研究周期：推荐4-8周连续使用评价\n'
            '- 访视点：V0（基线），V1（2周），V2（4周），V3（8周，可选延伸）\n'
            '- 对照设计：推荐空白基质对照或自身前后对照\n'
            '- 环境条件：20-22°C，相对湿度40-60%，适应环境30分钟后测量\n\n'
            '三、统计方法\n'
            '- 主要终点：各访视点相对基线的变化量（△值）或变化率（%）\n'
            '- 正态分布：配对t检验或独立样本t检验（组间对照）\n'
            '- 非正态分布：Wilcoxon符号秩检验\n'
            '- 显著性水平：p<0.05（双侧）\n\n'
            '四、报告宣称要求\n'
            '- 需描述测量方法、仪器型号、评价条件\n'
            '- 需提供均值±SD、统计检验结果（含p值）\n'
            '- 效应量（Cohen\'s d）建议同时报告，体现临床意义\n'
            '- 保湿宣称可使用："使用4周后角质层含水量提升X%"'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:moisturizing-complete-evaluation-path',
        namespace='cnkis',
        tags=['保湿', '功效评价路径', 'Corneometer', 'TEWL', '研究设计', '统计方法'],
    ),
    RawKnowledgeInput(
        title='美白祛斑功效完整评价路径与方法选择指南',
        content=(
            '化妆品美白/祛斑/提亮功效完整评价路径\n\n'
            '法规依据：《化妆品功效宣称评价规范》（2021），特殊化妆品（祛斑美白）须提供人体功效评价报告。\n\n'
            '一、功效宣称类型区分\n'
            '- 祛斑美白（特殊化妆品宣称）：宣称含美白活性成分，对色斑有改善作用；须注册+人体功效评价报告。\n'
            '- 提亮肤色/提亮/均匀肤色（普通化妆品宣称）：通过改善皮肤光泽度、均一性；文献/消费者测试可支持。\n\n'
            '二、评价方法选择\n'
            '仪器法（推荐）：\n'
            '- Mexameter MX18：精确测量黑色素MI指数，操作简便，重复性好，最常用于美白功效量化。\n'
            '- Chromameter CR-400：CIE L*a*b*色彩测量，L*值代表亮度，适合评估整体肤色亮度。\n'
            '- VISIA皮肤图像分析：UV斑、棕色斑等参数，适合图像展示，但量化分析不如前两者严谨。\n\n'
            '辅助方法：\n'
            '- 消费者自评：肤色明亮度、暗沉改善感知\n'
            '- 皮肤科医生盲评：色斑数量、面积、颜色深度评分\n'
            '- 标准化照片分析：一致光照条件下的前后对比\n\n'
            '三、研究设计要求\n'
            '- 受试者选择：有明显色斑或皮肤暗沉的目标人群（MI基线值较高），每组≥30例\n'
            '- 研究周期：一般8-12周，祛斑研究通常需要更长的使用周期\n'
            '- 对照：空白基质或无产品对照（半脸法）\n\n'
            '四、关键成分的作用机制区分（影响功效宣称）\n'
            '- 烟酰胺：抑制黑色素体转移至角质细胞（≠酪氨酸酶抑制），属"提亮"而非"抑制合成"。\n'
            '- 传明酸（氨甲环酸）：抑制酪氨酸酶活性，属美白活性成分。\n'
            '- 熊果苷、曲酸：酪氨酸酶竞争性抑制，属美白活性成分。\n'
            '- 维生素C（抗坏血酸及其衍生物）：抑制黑色素氧化聚合，兼具抗氧化和美白。'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:whitening-complete-evaluation-path',
        namespace='cnkis',
        tags=['美白', '祛斑', 'Mexameter', '黑色素', '功效评价路径', '特殊化妆品'],
    ),
    RawKnowledgeInput(
        title='抗皱紧致功效完整评价路径与方法选择指南',
        content=(
            '化妆品抗皱/紧致/弹性功效完整评价路径\n\n'
            '法规依据：《化妆品功效宣称评价规范》（2021），抗皱宣称须提供功效评价资料。\n\n'
            '一、评价方法选择\n'
            '仪器法（推荐）：\n'
            '- Cutometer MPA 580：测量皮肤弹性（Ue, Ur, R2参数），适合紧致/弹性宣称量化。\n'
            '  R2（弹性率）正常范围：年轻人0.7-0.9，老化皮肤0.5-0.7。\n'
            '- Visioscan VC 98/VC 20+：皮肤纹理分析，SEr（紧致度）、SEw（皱纹数量/深度）参数。\n'
            '- PRIMOS 3D：皮肤轮廓三维成像，精确测量皱纹深度、面积。\n'
            '- VISIA：皱纹分数（Wrinkle Score），适合面部整体评价和视觉展示。\n\n'
            '辅助方法：\n'
            '- 专家评分：改良Griffith皱纹评分量表（0-9分），盲法评估。\n'
            '- 消费者自评：紧绷感、弹性感知、看起来更年轻感。\n\n'
            '二、研究设计要求\n'
            '- 受试者选择：目标人群为40-65岁，眼周皱纹Griffith评分≥3的受试者。\n'
            '- 研究周期：一般8-12周，部分宣称需要12周以上。\n'
            '- 访视点：推荐V0, V4周, V8周, V12周。\n\n'
            '三、统计方法\n'
            '- Cutometer参数：R2通常满足正态分布，可用参数统计方法。\n'
            '- 专家评分：有序变量，使用Wilcoxon符号秩检验，需评分者一致性（ICC）验证。\n'
            '- Cohen\'s d > 0.5认为具有中等以上临床意义。'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:anti-wrinkle-complete-evaluation-path',
        namespace='cnkis',
        tags=['抗皱', '紧致', 'Cutometer', 'Visioscan', '皮肤弹性', '功效评价路径'],
    ),
    RawKnowledgeInput(
        title='防晒功效完整评价路径：SPF与UVA防护',
        content=(
            '化妆品防晒功效完整评价路径\n\n'
            '法规依据：《化妆品功效宣称评价规范》（2021），防晒化妆品为特殊化妆品，须提供人体功效评价报告。\n\n'
            '一、SPF（防晒指数）测定\n'
            '国际标准：ISO 24444:2010/2019，体内法（in vivo）。\n'
            '中国标准：GB/T 17149.1-2017 化妆品防晒化妆品防水性能测定方法。\n'
            '方法概要：\n'
            '- 受试者背部划定5×5cm测试区，各照射4个紫外B剂量梯度\n'
            '- 样品使用量2mg/cm²（不均匀涂抹是最常见的误差来源）\n'
            '- 16-24小时后读取MED（最小红斑剂量）\n'
            '- SPF = 有样品MED / 无样品MED\n'
            '- 最终SPF = 测试人群几何均数（GSD不超过10%可信区间）\n\n'
            '二、UVA防护测定\n'
            '国际标准：ISO 24442（体内UVAPF）或ISO 24443（体外）。\n'
            'PA分级：PA+（UVAPF≥2），PA++（≥4），PA+++（≥8），PA++++（≥16）。\n\n'
            '三、标签标注要求（中国市场）\n'
            '- SPF值按实测值四舍五入至整数，标注不超过实测值\n'
            '- SPF 6-14：低防护；15-30：中防护；>30：高防护\n'
            '- UVA防护须同时标注PA级别\n'
            '- SPF>50须标注为SPF50+（不再标具体数值）\n\n'
            '四、常见问题\n'
            '- 样品涂抹不均匀：CV>10%需重新测试\n'
            '- 受试者皮肤类型：Fitzpatrick II-III型最适合，IV型以上MED差异大\n'
            '- 防水性测试：游泳/出汗后SPF保留率测定，另有方法'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:sunscreen-spf-uvapf-complete-path',
        namespace='cnkis',
        tags=['防晒', 'SPF', 'UVA', 'PA值', 'ISO 24444', '特殊化妆品', '功效评价路径'],
    ),
    RawKnowledgeInput(
        title='皮肤屏障修护功效评价路径',
        content=(
            '化妆品皮肤屏障修护功效评价路径\n\n'
            '法规定位：《功效宣称评价规范》中"修护"类功效，须提供功效评价资料。\n\n'
            '一、皮肤屏障功能核心指标\n'
            '- TEWL（经皮水分散失）：皮肤屏障完整性的金标准指标，升高提示屏障受损。\n'
            '  测量仪器：Tewameter（开放式腔体法），VapoMeter（封闭式）\n'
            '  正常值：前臂内侧 5-10 g/m²/h\n'
            '  轻度受损：10-20 g/m²/h；中度受损：20-40 g/m²/h\n'
            '- 角质层含水量（Corneometer）：屏障受损时含水量通常降低。\n'
            '- pH值（Skin-pH-Meter）：正常皮肤pH 4.5-5.5，偏碱性提示屏障异常。\n\n'
            '二、受损模型建立（加速评价）\n'
            '- 胶带剥离模型（Tape Stripping）：反复剥离角质层，诱导短暂屏障受损。\n'
            '- 十二烷基硫酸钠（SDS）刺激模型：0.5%SDS贴片，标准化刺激后的修护评价。\n'
            '- 自然干燥皮肤受试者：招募基线TEWL>15或Corneometer<40的自然干性皮肤受试者。\n\n'
            '三、研究设计\n'
            '- 受试者：干性皮肤（Corneometer<40AU或TEWL>15g/m²/h）\n'
            '- 研究周期：2-4周（修护效果可在短期内观察到）\n'
            '- 同时测量TEWL和Corneometer可更全面评估屏障状态\n\n'
            '四、关键成分的屏障修护机制\n'
            '- 神经酰胺：构成角质层脂质屏障的关键成分（约50%），直接补充修复屏障。\n'
            '- 积雪草苷：促进胶原合成，修复皮肤损伤（抗炎+修护双重机制）。\n'
            '- 泛醇（维生素B5）：提升角质层含水量，促进皮肤愈合。\n'
            '- 角鲨烷：封闭性保湿，减少TEWL，模拟皮肤自身皮脂成分。'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:barrier-repair-evaluation-path',
        namespace='cnkis',
        tags=['皮肤屏障', 'TEWL', '修护', '神经酰胺', '功效评价路径', '干性皮肤'],
    ),
    # 关键成分安全数据补充
    RawKnowledgeInput(
        title='神经酰胺（Ceramide）安全评估与功效数据',
        content=(
            '神经酰胺（Ceramide）化妆品成分安全评估与功效\n\n'
            'INCI名称：Ceramide NP/AP/EOP/NS/AS等（多种类型）\n'
            '皮肤中神经酰胺类型：Ceramide 1-7（按CIR命名体系）\n\n'
            '安全性：CIR评估为安全（2006年最终报告），与皮肤生理成分相同，耐受性极好，无明显刺激性。\n\n'
            '主要功效：\n'
            '1. 皮肤屏障修护：构成角质层脂质片层的核心成分（约50%），与游离脂肪酸、胆固醇协同构建屏障。\n'
            '2. 保湿：维持角质层含水量，防止水分过度流失。\n'
            '3. 抗炎：部分神经酰胺具有抗炎活性，减少皮肤刺激反应。\n\n'
            '使用浓度：0.01-5%（视产品类型）\n\n'
            '评价方法：TEWL降低 + Corneometer提升，双指标共同证实屏障修护和保湿功效。\n\n'
            '原料目录：收录于《已使用化妆品原料目录》，安全无限量要求。\n'
            'NMPA功效评价分类：支持"修护皮肤屏障"宣称。'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:ceramide:safety-profile',
        namespace='cnkis',
        tags=['神经酰胺', 'ceramide', '皮肤屏障', '成分', '安全评估', '保湿'],
    ),
    RawKnowledgeInput(
        title='视黄醇（Retinol）安全评估与抗衰老功效',
        content=(
            '视黄醇（Retinol/A醇）化妆品成分安全评估与功效\n\n'
            'INCI名称：Retinol，CAS号：68-26-8，分子式：C20H30O\n\n'
            '安全性：\n'
            'EU SCCS评估：普通化妆品最高使用浓度0.3%（面部），0.05%（体身）；不建议用于儿童。\n'
            '中国：目前化妆品中使用浓度参照国际惯例，无明确法规限量。\n'
            '孕妇使用注意：系统性A类维生素（口服）有致畸性，局部用小分子视黄醇风险极低，但出于谨慎，\n'
            '孕期通常建议避免高浓度（>0.3%）视黄醇产品。\n\n'
            '主要功效：\n'
            '1. 抗皱（核心功效）：促进胶原合成，减少MMP（基质金属蛋白酶）活性，改善皮肤弹性。\n'
            '2. 细胞更新：加速角质代谢，改善皮肤纹理和色泽。\n'
            '3. 美白：抑制黑色素生成（次要机制）。\n\n'
            '常见副作用：初始使用可能出现皮肤干燥、脱屑、刺激（A醇反应），建议从低浓度开始使用，'
            '缓慢增加使用频率。与其他活性成分（AHA/BHA/直接维生素C）同时使用需谨慎。\n\n'
            '功效评价方法：Cutometer R2（弹性），Visioscan SEr/SEw（纹理），专家评分（皱纹）。\n'
            '研究周期：通常需要8-12周连续使用才能观察到显著效果。'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:retinol:safety-profile',
        namespace='cnkis',
        tags=['视黄醇', 'retinol', 'A醇', '抗皱', '成分', 'SCCS', '安全评估'],
        properties={'source_url': 'https://ec.europa.eu/health/scientific_committees/sccs'},
    ),
    RawKnowledgeInput(
        title='防晒剂安全评估：常用化学防晒剂与物理防晒剂',
        content=(
            '化妆品常用防晒剂安全评估\n\n'
            '一、物理防晒剂（无机）\n'
            '氧化锌（Zinc Oxide）：INCI Zinc Oxide，CAS 1314-13-2。\n'
            '- EU允许用量：25%（非纳米），25%（纳米，≥100nm）\n'
            '- SCCS评估纳米氧化锌（S021，2021）：粒径≥100nm时安全，可使用\n'
            '- 广谱防护UVA/UVB\n\n'
            '二氧化钛（Titanium Dioxide）：INCI Titanium Dioxide，CAS 13463-67-7。\n'
            '- EU允许用量：25%\n'
            '- SCCS评估：2021年重新评估，非纳米形式安全；纳米形式（<100nm）不得用于喷雾和口腔产品\n'
            '- 主要阻隔UVB，UVA防护有限\n\n'
            '二、化学防晒剂（有机）常用品种\n'
            '甲氧基肉桂酸乙基己酯（Octinoxate/OMC）：\n'
            '- EU限量：10%；中国：10%\n'
            '- 主要吸收UVB（282nm），广泛使用\n'
            '- 近期有研究提示环境内分泌干扰性，部分国家限制使用\n\n'
            '双苯甲酰甲烷衍生物（Avobenzone/BMDM）：\n'
            '- EU限量：5%；中国：5%\n'
            '- 主要吸收UVA（360nm），需加稳定剂（如辛立酮）\n\n'
            '三、中国法规框架\n'
            '《化妆品安全技术规范（2015版）》表7：准用防晒剂清单，明确列出27种允许使用的防晒剂及最高浓度。'
        ),
        entry_type='ingredient_data',
        source_type='sccs_import',
        source_key='ingredient:sunscreen-agents:safety-overview',
        namespace='cnkis',
        tags=['防晒剂', '氧化锌', '二氧化钛', 'SCCS', '安全评估', 'UV过滤剂'],
        properties={'source_url': 'https://ec.europa.eu/health/scientific_committees/sccs'},
    ),
]

# ── P2：应用增强层 ──────────────────────────────────────────────────────────

P2_CORPUS = [
    # FAQ 系列
    RawKnowledgeInput(
        title='FAQ：化妆品功效宣称常见合规问题',
        content=(
            '化妆品功效宣称合规问题FAQ\n\n'
            'Q1：保湿产品需要提交人体功效评价报告吗？\n'
            'A：不强制要求。《功效宣称评价规范》规定，保湿宣称可通过文献资料或消费者使用测试支持，'
            '不强制要求人体功效评价报告。但为提升宣称可信度，建议提供仪器测量数据支持。\n\n'
            'Q2：宣称"祛斑美白"和"提亮肤色"有什么区别？\n'
            'A：祛斑美白属于特殊化妆品功效，须经NMPA注册且提供人体功效评价报告；'
            '"提亮肤色"属于普通化妆品宣称，须有科学依据（文献或消费者测试），但无需注册。\n\n'
            'Q3：人体功效评价机构需要什么资质？\n'
            'A：根据《化妆品功效宣称评价规范》，从事人体功效评价的机构须具备：'
            '相应专业技术人员（皮肤科医生或相关专业人员）、受试者管理规程、符合要求的实验环境和设备。'
            '目前法规未明确要求CMA或CNAS认证，但具备相关认证可增加报告公信力。\n\n'
            'Q4：国内功效评价报告是否可用于欧盟注册（CPNP）？\n'
            'A：可作为参考，但欧盟CPNP要求安全评估报告符合EU第1223/2009号法规要求，'
            '由有资质的安全评估人员（具有毒理学背景）出具。国内报告需要评估是否满足欧盟技术要求。\n\n'
            'Q5：防脱发是特殊化妆品吗？\n'
            'A：是的，防脱发属于特殊化妆品，须经NMPA注册。宣称"脱发改善""发量增加"等需提供人体功效评价报告。\n\n'
            'Q6：消费者使用测试报告需要多少受试者？\n'
            'A：法规未明确规定最低样本量，但通常行业惯例为≥50例（网络测评）或≥30例（现场测评），'
            '需经过统计学分析。建议查阅中国香料香精化妆品工业协会的团体标准指引。'
        ),
        entry_type='faq',
        source_type='manual_ingest',
        source_key='faq:cosm-efficacy-claim-compliance',
        namespace='cnkis',
        tags=['FAQ', '功效宣称', '合规', '特殊化妆品', '备案注册', '法规'],
    ),
    RawKnowledgeInput(
        title='FAQ：受试者招募与管理常见问题',
        content=(
            '受试者招募与管理常见问题FAQ\n\n'
            'Q1：化妆品功效评价是否必须通过伦理委员会审查？\n'
            'A：《化妆品功效宣称评价规范》明确规定，开展人体功效评价须遵循伦理要求，'
            '受试者须签署知情同意书。伦理审查建议通过具有伦理审查资质的机构（如医院伦理委员会）进行，'
            '这也是客户（品牌方）通常要求的。\n\n'
            'Q2：受试者知情同意书必须包含哪些内容？\n'
            'A：根据ICH E6 GCP，ICF须包含：研究目的和程序、可能的风险和不适、'
            '预期获益、保密措施、自愿参与和退出权利、联系方式、补偿说明。\n\n'
            'Q3：受试者退出研究后，已采集数据如何处理？\n'
            'A：符合GCP原则：已采集数据通常保留（伦理知情同意中注明），'
            '按ITT（意向性治疗）原则分析可提高统计完整性。受试者可要求删除个人可识别信息。\n\n'
            'Q4：受试者补偿金额是否有法规要求？\n'
            'A：国内无明确法规规定，一般遵循合理补偿原则（不诱导），按项目时间长度和不便程度设定。\n\n'
            'Q5：未成年人可以参与化妆品功效评价吗？\n'
            'A：特殊情况下（如儿童化妆品评价），须有额外伦理保护措施，包括：'
            '父母或法定监护人知情同意、儿童同意（年龄可理解情况下）、额外安全监测。\n\n'
            'Q6：受试者在研究期间可以使用其他护肤品吗？\n'
            'A：通常设定"洗脱期"要求，研究期间只能使用研究规定的产品（测试品、对照品、'
            '最基础清洁保湿品）；禁止使用含有效成分的其他产品。具体限制在入排标准和受试者日志中明确说明。'
        ),
        entry_type='faq',
        source_type='manual_ingest',
        source_key='faq:subject-recruitment-management',
        namespace='cnkis',
        tags=['FAQ', '受试者招募', '知情同意', '伦理', 'GCP', '化妆品功效评价'],
    ),
    RawKnowledgeInput(
        title='FAQ：统计分析和报告撰写常见问题',
        content=(
            '统计分析和报告撰写常见问题FAQ\n\n'
            'Q1：人体功效评价应该用哪种统计方法？\n'
            'A：取决于数据分布和研究设计。对于连续型数据：\n'
            '- 自身前后对照（单组）：先进行正态性检验（Shapiro-Wilk，n<50），'
            '正态则配对t检验，非正态则Wilcoxon符号秩检验。\n'
            '- 两组平行对照：独立样本t检验（正态），Mann-Whitney U检验（非正态）。\n'
            '- 多时间点：考虑混合效应模型（MMRM）或重复测量ANOVA。\n\n'
            'Q2：统计显著性p<0.05是否足够说明有效？\n'
            'A：统计显著性（p值）和临床意义（效应量）都需要报告。仅有p<0.05而效应量很小（Cohen\'s d<0.2）'
            '时，即便统计显著，实际功效可能微不足道。建议同时报告：均值差值±SD、p值、95%置信区间、效应量。\n\n'
            'Q3：缺失数据如何处理？\n'
            'A：缺失数据处理应在统计分析计划（SAP）中预先规定。'
            '完全随机缺失（MCAR）：完整案例分析；随机缺失（MAR）：多重插补（MI）；'
            '非随机缺失（MNAR）：灵敏度分析。\n\n'
            'Q4：样本量计算需要哪些参数？\n'
            'A：基本参数：（1）双侧α=0.05（I类错误率）；（2）检验效能80-90%（对应β=0.1-0.2）；'
            '（3）期望差值（MCID，最小临床意义差值）；（4）SD（从预实验或文献获取）；'
            '（5）脱落率补偿（通常10-15%）。\n\n'
            'Q5：报告中如何描述功效结论？\n'
            'A：推荐表述模式：\n'
            '"使用XX产品X周后，角质层含水量相较基线增加X±Y AU（p=0.XXX，配对t检验），'
            '与使用前相比有统计学显著性差异，提示产品具有显著保湿功效。"'
        ),
        entry_type='faq',
        source_type='manual_ingest',
        source_key='faq:statistics-report-writing',
        namespace='cnkis',
        tags=['FAQ', '统计分析', '配对t检验', '样本量', '报告撰写', '效应量'],
    ),
    # 典型方案模板
    RawKnowledgeInput(
        title='保湿功效评价方案模板（标准版）',
        content=(
            '化妆品保湿功效评价研究方案模板（标准版）\n\n'
            '一、研究题目\n'
            'XX保湿产品对人体皮肤保湿功效的评价研究\n\n'
            '二、研究目的\n'
            '评价受试者连续使用XX产品X周后，皮肤角质层含水量和经皮水分散失的变化，'
            '证明产品的保湿和皮肤屏障维护功效。\n\n'
            '三、研究设计\n'
            '研究类型：随机、双盲、空白基质对照、自身配对设计（半臂对照）\n'
            '样本量：计划入组N=36例（考虑10%脱落率），完成病例≥30例\n'
            '样本量依据：基于Corneometer，SD=12AU，MCID=5AU，α=0.05，效能=80%，n=34，增加10%=38例\n\n'
            '四、受试者\n'
            '入选标准：\n'
            '- 年龄：18-60岁，性别不限\n'
            '- Corneometer基线值<45AU（属于中干性皮肤）\n'
            '- 签署知情同意书\n\n'
            '排除标准：\n'
            '- 妊娠或哺乳期\n'
            '- 对测试产品成分已知过敏史\n'
            '- 近4周使用影响皮肤屏障功能的药物\n'
            '- 皮肤病史（评估部位）\n\n'
            '五、研究产品\n'
            '测试品：XX保湿产品（含X%活性成分）\n'
            '对照品：空白基质（不含活性成分的基础配方）\n'
            '用法：每日早晚各涂抹一次，用量X mg/cm²\n\n'
            '六、访视计划\n'
            'V0（基线）：签署ICF，检查入排标准，仪器测量\n'
            'V1（2周）：仪器测量，收集不良事件，发放新一期产品\n'
            'V2（4周，主要终点）：仪器测量，消费者问卷，全面安全评估\n'
            'V3（8周，次要终点，可选）：仪器测量，最终安全评估，研究结束\n\n'
            '七、主要终点\n'
            '使用4周后角质层含水量（Corneometer）相对基线的变化量。\n\n'
            '八、次要终点\n'
            '- TEWL相对基线的变化量（各访视点）\n'
            '- 消费者自评保湿感知评分（使用后感觉皮肤更水润/不干燥的比例）\n\n'
            '九、统计分析\n'
            '主要分析：配对t检验（使用4周后 vs 基线）；若Shapiro-Wilk检验P<0.05，改用Wilcoxon。\n'
            '统计软件：SPSS 27.0或SAS 9.4或R 4.0+。\n'
            '显著性水平：p<0.05（双侧）。'
        ),
        entry_type='proposal_template',
        source_type='manual_ingest',
        source_key='template:moisturizing-evaluation-protocol-standard',
        namespace='cnkis',
        tags=['方案模板', '保湿', '研究设计', '协议模板', '功效评价', 'Corneometer'],
    ),
    RawKnowledgeInput(
        title='偏差管理与CAPA指导原则（化妆品CRO适用）',
        content=(
            '化妆品CRO偏差管理与CAPA指导原则\n\n'
            '一、偏差分级\n'
            '严重（Critical）偏差：可能影响受试者安全或研究数据完整性/可靠性。\n'
            '例如：受试者未签ICF即开始研究操作；主要终点数据丢失无法恢复；仪器长期未校准仍在使用。\n\n'
            '重要（Major）偏差：可能影响研究数据质量，但不危及受试者安全。\n'
            '例如：访视窗口明显超时（>7天）；测量环境条件不符合SOP（温度/湿度超标）。\n\n'
            '次要（Minor）偏差：对研究质量影响有限，可以接受。\n'
            '例如：访视窗口轻微超时（1-3天）；记录不完整但能从原始文件重建。\n\n'
            '二、偏差报告时限\n'
            '严重偏差：发现后24小时内上报PM/QA，48小时内提交初步报告。\n'
            '重要偏差：发现后48小时内上报，5个工作日内提交正式报告。\n\n'
            '三、CAPA流程\n'
            '1. 根本原因分析（RCA）：5Why法或鱼骨图，避免仅停留在表面现象。\n'
            '2. 纠正措施（Correction）：针对已发生的偏差立即纠正。\n'
            '3. 预防措施（Prevention）：修改SOP、增加培训，防止再次发生。\n'
            '4. 效果验证：规定验证标准和时限（如：后续3次审计无同类偏差）。\n'
            '5. CAPA关闭条件：完成措施实施+效果验证，由QA确认关闭。\n\n'
            '四、21 CFR Part 11合规（电子记录要求）\n'
            '适用于使用电子系统记录偏差的CRO：唯一身份认证（用户名+密码）、操作审计追踪、'
            '电子签名具有与手签同等效力。'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:deviation-management-capa',
        namespace='cnkis',
        tags=['偏差管理', 'CAPA', 'SOP', '根本原因分析', 'GCP', '质量管理'],
    ),
    RawKnowledgeInput(
        title='化妆品CRO行业竞争格局与服务能力分析',
        content=(
            '化妆品功效评价CRO行业竞争格局分析\n\n'
            '一、市场定位细分\n'
            '1. 大型综合检测机构：如SGS、Intertek、Eurofins，优势在于国际认证体系、'
            '全球网络和多领域检测能力；劣势是定制化服务能力弱，响应速度慢。\n'
            '2. 学术/医院附属机构：如上海皮肤病医院、南方医科大学皮肤科，优势是皮肤科医生背书、'
            '伦理委员会便利；劣势是产能有限，商业服务不是核心业务。\n'
            '3. 专业化妆品CRO：如中科贝医、诺康源、诺邦科技，优势是化妆品专业化、响应快、定制化；'
            '正在快速成长，争夺市场份额。\n\n'
            '二、差异化竞争要素\n'
            '- 专业化程度：专注功效评价的深度 vs 综合检测的广度\n'
            '- 数字化能力：AI辅助评估、数字化数据管理、实时进度可见性\n'
            '- 速度：从接单到出报告周期（行业平均8-12周，快速通道4-6周）\n'
            '- 服务深度：仅出检测报告 vs 提供方案设计+全流程执行+报告诠释+宣称策略建议\n\n'
            '三、客户核心需求（品牌方视角）\n'
            '- 合规：报告满足NMPA要求，可直接用于注册备案\n'
            '- 可信度：机构资质（CMA/CNAS）、医生签字\n'
            '- 速度：新品上市时间窗口，功效验证越快越好\n'
            '- 数据质量：数据可信，能支持营销宣传'
        ),
        entry_type='market_insight',
        source_type='manual_ingest',
        source_key='market:cosm-cro-competitive-landscape',
        namespace='cnkis',
        tags=['竞争格局', '化妆品CRO', '市场分析', '差异化', '服务能力'],
    ),

    # ── 补充：统计学方法专项 ──────────────────────────────────────────────────
    RawKnowledgeInput(
        title='功效评价统计分析方法：正态性检验与非参数检验选择',
        content=(
            '化妆品功效评价统计分析方法选择指南\n\n'
            '一、正态性检验方法\n'
            '常用方法：\n'
            '1. Shapiro-Wilk 检验（推荐，n<2000）：最常用的正态性检验，统计量W接近1表示正态。'
            '化妆品研究样本通常n=20-80，此检验功效最高。\n'
            '2. Kolmogorov-Smirnov 检验（带Lilliefors校正）：适合n>50的样本，但功效低于Shapiro-Wilk。\n'
            '3. Anderson-Darling 检验：对尾部分布更敏感，适合检测偏态分布。\n'
            '4. Q-Q图（Quantile-Quantile Plot）：直观判断，散点沿对角线分布则正态。\n\n'
            '判断标准：p<0.05 认为显著偏离正态，但大样本时即便轻微偏离也会显著，需结合Q-Q图判断。\n\n'
            '二、参数检验 vs 非参数检验\n'
            '配对t检验（参数检验）：\n'
            '- 适用条件：差值服从正态分布，或n≥30（中心极限定理）\n'
            '- 检验自身前后差值是否为0\n'
            '- 统计效能高于非参数检验\n\n'
            'Wilcoxon符号秩检验（非参数检验）：\n'
            '- 适用条件：差值不服从正态分布，且n<30\n'
            '- 基于秩次，不依赖正态假设\n'
            '- 适合有序数据或分布严重偏态的连续数据\n\n'
            '选择建议：\n'
            '- 正态性p>0.05 且 n≥10：使用配对t检验\n'
            '- 正态性p<0.05 且 n<30：使用Wilcoxon检验\n'
            '- n≥30：通常可用配对t检验（中心极限定理保证）\n\n'
            '三、功效评价常用统计方法汇总\n'
            '- Corneometer连续数据：配对t检验或Wilcoxon检验（取决于正态性）\n'
            '- TEWL（Tewameter）：同上\n'
            '- 皮肤弹性参数（Cutometer）：配对t检验（通常正态）\n'
            '- 色素测量（Mexameter/Colorimeter）：配对t检验\n'
            '- 主观评分（VAS/NRS，有序量表）：Wilcoxon检验\n'
            '- 受试者完成率/应答率：χ²检验或Fisher精确检验\n\n'
            '四、多重比较校正\n'
            '多个测量时间点时需控制整体I类错误：\n'
            '- Bonferroni法：保守但简单，α_adjusted = α/k\n'
            '- Holm-Bonferroni法：逐步降低，比Bonferroni法功效高\n'
            '- 混合线性模型（LMM）：同时分析所有时间点，推荐用于重复测量数据'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:stats-normality-nonparametric',
        namespace='methodology',
        tags=['统计分析', '正态性检验', 'Shapiro-Wilk', '配对t检验', 'Wilcoxon检验', '非参数检验', '功效评价'],
        properties={'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),

    RawKnowledgeInput(
        title='SPF体内测定标准方法（ISO 24444）：涂抹量与操作规范',
        content=(
            'ISO 24444 化妆品-防晒性能测试方法-防晒因子体内测定（SPF in vivo）\n\n'
            '一、样品涂抹量标准\n'
            '涂抹密度：2 mg/cm²（±5%），这是国际统一标准。\n'
            '依据：ISO 24444:2010/2022 第7.3条。\n'
            '计算示例：测试面积25 cm²，需涂抹 25×2=50 mg 样品。\n\n'
            '二、涂抹操作规范\n'
            '1. 精确称量：精确到±2%（即±1 mg/cm²的5%），使用0.1 mg精度的天平\n'
            '2. 涂抹工具：通常用戴手套的手指均匀涂抹，约30秒内完成\n'
            '3. 均匀性验证：涂抹后等待30分钟（标准规定）再进行照射\n\n'
            '三、涂抹不均匀的影响\n'
            '厚薄不均匀会导致：\n'
            '1. SPF值变异性增大：国际研究表明涂抹不均匀可使SPF变异系数(CV)从<10%升至>30%\n'
            '2. 高估SPF：厚涂区域防护好，薄涂区域易晒伤，但算法按最小红斑量(MED)计算，'
            '受薄涂区域主导，反而可能低估（影响方向取决于照射协议）\n'
            '3. 增加受试者数量要求：变异性增大需增加受试者以维持统计功效\n'
            '4. GCP偏离风险：涂抹量误差>10%可视为操作偏差\n\n'
            '四、质控措施\n'
            '- 涂抹后拍照记录（均匀性文件）\n'
            '- 操作者SOP培训和认证（每年校核）\n'
            '- 平行操作者间涂抹量校核试验\n\n'
            '五、中国法规要求\n'
            '《化妆品安全技术规范（2015版）》防晒化妆品评价参照ISO 24444方法，同样要求2 mg/cm²。'
            '国内注册防晒产品须提供SPF检测报告（机构需具备CMA资质）。'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:spf-invivo-iso24444',
        namespace='methodology',
        tags=['SPF', 'ISO 24444', '防晒', '涂抹量', 'in vivo', '体内测定', '防晒因子'],
        properties={'source_url': 'https://www.iso.org/standard/'},
    ),

    RawKnowledgeInput(
        title='伦理委员会批件管理：到期续期与研究暂停处理流程',
        content=(
            '伦理委员会（IRB/EC）批件管理规范\n\n'
            '一、伦理批件有效期\n'
            '- 通常为1年（12个月），从批准日期计算\n'
            '- 化妆品功效评价研究：部分伦理委员会出具一次性批件（研究完成即有效），'
            '需在批件申请时明确说明预期研究周期。\n\n'
            '二、批件到期前处理流程（持续审查，Continuing Review）\n'
            '1. 提前90天提交持续审查申请（Continuing Review Application）\n'
            '2. 提交材料：\n'
            '   - 研究进展报告（受试者入组数、不良事件、主要发现）\n'
            '   - 知情同意书更新版本（如有修改）\n'
            '   - 下一年度研究计划\n'
            '3. 伦理委员会审查周期通常1-4周\n'
            '4. 审查结果：批准续期（通常再批1年）/ 要求修改 / 暂停 / 终止\n\n'
            '三、批件到期后的研究处理\n'
            '批件过期而未续期，研究必须立即暂停：\n'
            '1. 停止受试者入组（立即生效）\n'
            '2. 已入组受试者：继续已开始的程序，但不得开始新的研究程序\n'
            '3. 如涉及受试者安全（如每天用药的研究），联系申办方和伦理委员会获取紧急指导\n'
            '4. 建立偏差记录（Protocol Deviation），说明过期原因和暂停措施\n'
            '5. 提交暂停研究报告给申办方和伦理委员会\n\n'
            '四、批件到期影响研究数据有效性的规定\n'
            '- ICH GCP E6(R2) 要求：伦理批件在整个研究期间保持有效\n'
            '- NMPA检查要点：批件过期期间收集的数据可被视为无效\n'
            '- 预防措施：建立批件到期提醒系统（通常提前90天）\n\n'
            '五、化妆品功效评价特殊考量\n'
            '功效评价研究周期通常2-12周，如申请时说明清楚研究周期，'
            '部分伦理委员会（如医院附属IRB）会出具"完成即有效"的批件，'
            '无需续期，简化管理。'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:irb-ec-batch-renewal',
        namespace='compliance',
        tags=['伦理委员会', 'IRB', '批件', '持续审查', 'GCP', '伦理审查', '续期'],
        properties={'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),

    RawKnowledgeInput(
        title='皮肤检测仪器精测参数汇总：Corneometer/Tewameter/Cutometer/Mexameter操作规范',
        content=(
            '化妆品功效评价常用皮肤检测仪器技术规格与操作要点\n\n'
            '一、Corneometer CM825（皮肤水合仪）\n'
            '原理：基于电容测量皮肤角质层的介电常数（dielectric constant），水分含量越高，电容值越大。\n'
            '量程：0-120 AU（任意单位，Arbitrary Units）\n'
            '测量深度：约10-20 μm（角质层浅层）\n'
            '频率：频率扫描，约1 MHz\n'
            '临床意义：>45 AU 为正常水合，<30 AU 为干燥皮肤\n'
            '操作要点：室温20±2℃，湿度40-60% RH，受试者适应15-30分钟；'
            '每测量点测3次取平均值，测头垂直轻压皮肤。\n\n'
            '二、Tewameter TM300/TM Nano（经皮水分散失测量仪，TEWL）\n'
            '原理：Closed chamber法（ISO 14184/Vapometer）或Open chamber法（Tewameter）。'
            'Tewameter使用开放腔室，基于Fick扩散定律测量水蒸气梯度（g/m²/h）。\n'
            '量程：0-200 g/m²/h\n'
            '临床意义：正常皮肤<10 g/m²/h；屏障受损时升高\n'
            '与Vapometer区别：Vapometer使用密封腔（闭合腔），稳定性更好但灵敏度较低；'
            'Tewameter开放腔更快测量但受气流影响，需在密闭室检测。\n\n'
            '三、Cutometer MPA580（皮肤弹性测量仪）\n'
            '原理：负压（vacuum）抽吸皮肤，光学传感器测量皮肤位移，得到弹性参数。\n'
            '负压参数：通常500 mbar（可调200-500 mbar），吸附时间2秒，松弛时间2秒。\n'
            '主要参数：\n'
            '- Uf（最终变形）= Ue + Uv，总形变量\n'
            '- Ue（即时弹性变形）= 吸引时即时位移，与弹性组织相关\n'
            '- Uv（粘弹性变形）= 超过Ue后的蠕变变形，与粘弹性相关\n'
            '- R2 = Ua/Uf，总弹性恢复率（美容研究最常用指标）\n'
            '- R7 = Ur/Uf，弹性恢复率（与R2相似但计算略有差异）\n\n'
            '四、Mexameter MX18（黑色素/血红素测量仪）\n'
            '原理：光谱反射法，使用两对LED：\n'
            '- 568 nm（绿光）/ 660 nm（红光）：用于皮肤血红蛋白（血管/红斑）测量\n'
            '  568 nm 是血红蛋白特征吸收峰，660 nm 是对照波长\n'
            '- 660 nm / 880 nm：用于黑色素测量（880 nm 对血红蛋白不敏感）\n'
            '临床意义：\n'
            '- 黑色素指数（MI）：越高皮肤越黑，范围0-999\n'
            '- 血红素指数（EI/Erythema Index）：越高皮肤越红，范围0-999\n'
            '美白功效评价：治疗前后MI变化；防晒评价：UVB照射后EI和MI变化。'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:skin-devices-comprehensive',
        namespace='instruments',
        tags=['Corneometer', 'Tewameter', 'Cutometer', 'Mexameter', 'CM825', 'MPA580', 'MX18',
              '皮肤水合', 'TEWL', '皮肤弹性', '黑色素', '血红素', '仪器规格'],
    ),
]

ALL_TIERS = {
    'P0': P0_CORPUS,
    'P1': P1_CORPUS,
    'P2': P2_CORPUS,
}


class Command(BaseCommand):
    help = '批量灌入分层权威预训练语料（P0 权威基础层 / P1 专业方法层 / P2 应用增强层）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tier',
            choices=['P0', 'P1', 'P2'],
            default=None,
            help='指定灌入的语料层级（不指定则全部灌入）',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='试运行，不写入数据库，仅打印将要灌入的内容',
        )

    def handle(self, *args, **options):
        tier = options.get('tier')
        dry_run = options.get('dry_run', False)

        if tier:
            corpus = ALL_TIERS.get(tier, [])
            self.stdout.write(f'灌入语料层级：{tier}，共 {len(corpus)} 条')
        else:
            corpus = P0_CORPUS + P1_CORPUS + P2_CORPUS
            self.stdout.write(f'灌入全部语料（P0+P1+P2），共 {len(corpus)} 条')

        if dry_run:
            self.stdout.write(self.style.WARNING('[DRY RUN] 试运行模式，不写入数据库'))
            for raw in corpus:
                self.stdout.write(f'  - [{raw.entry_type}] {raw.title}')
            return

        created = skipped = errors = 0

        for raw in corpus:
            try:
                result = run_pipeline(raw)
                if result and result.entry_id:
                    if result.status == 'duplicate_skipped':
                        skipped += 1
                        self.stdout.write(f'  = 已存在跳过: [{raw.entry_type}] {raw.title[:60]}')
                    else:
                        created += 1
                        score = result.quality_score or 0
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'  ✓ [{result.entry_id}] [{raw.entry_type}] {raw.title[:60]} (score={score})'
                            )
                        )
                else:
                    errors += 1
                    self.stdout.write(
                        self.style.ERROR(f'  ✗ 失败: {raw.title[:60]} | errors={result.stage_errors if result else "unknown"}')
                    )
            except Exception as e:
                errors += 1
                self.stdout.write(self.style.ERROR(f'  ✗ 异常: {raw.title[:60]} | {e}'))

        try:
            from apps.knowledge.models import KnowledgeEntry
            total_entries = KnowledgeEntry.objects.filter(is_deleted=False).count()
        except Exception:
            total_entries = '(无法获取)'

        self.stdout.write(self.style.SUCCESS(
            f'\n灌入完成: 新建 {created} 条 | 已存在跳过 {skipped} 条 | 失败 {errors} 条'
        ))
        self.stdout.write(f'当前知识库总条目数: {total_entries}')
