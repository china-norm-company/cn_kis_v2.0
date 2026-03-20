"""
第二轮针对性知识注入

基于 L1 Benchmark 评测结果，精准补充以下知识缺口：
1. 仪器专项：PRIMOS、Elastometer、Sebumeter、高频超声、温湿度控制
2. 成分专项：积雪草、传明酸、角鲨烷/鲨烯、维生素C复配、泛醇、光甘草定
3. 合规SOP专项：访视窗口管理、SAP时机、功效评价报告组成、CRO-品牌合同
4. 方法学专项：Cohen's d详细指引、缺失数据分类、半脸设计、MMRM应用

用法：
  python manage.py ingest_targeted_knowledge
  python manage.py ingest_targeted_knowledge --dry-run
"""
from django.core.management.base import BaseCommand
from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput


# ══════════════════════════════════════════════════════════════════════════════
# 补充：仪器专项（PRIMOS、温湿度控制、仪器选择、Sebumeter等）
# ══════════════════════════════════════════════════════════════════════════════

TARGETED_INSTRUMENT = [
    RawKnowledgeInput(
        title='PRIMOS皮肤轮廓测量系统：三维皱纹测量原理与参数标准',
        content=(
            'PRIMOS（Phase Shift Rapid In-vivo Measurement Of Skin）皮肤轮廓测量\n\n'
            '一、测量原理\n'
            'PRIMOS 使用结构光（Structured Light Projection）三维成像技术：\n'
            '1. 仪器发射已知相位（Phase）的光栅条纹到皮肤表面\n'
            '2. 条纹受皮肤三维轮廓影响产生相位偏移（Phase Shift）\n'
            '3. 相机捕捉变形后的条纹图案\n'
            '4. 软件通过相移法算法（Phase Shift Algorithm）还原三维轮廓信息\n'
            '测量精度：垂直分辨率可达 1-2 μm（微米级），水平分辨率约 20-50 μm\n\n'
            '二、主要测量参数\n'
            'PRIMOS 输出的皱纹轮廓参数（参考 DIN EN ISO 4287 表面粗糙度标准）：\n\n'
            '- Ra（算术平均粗糙度）：轮廓线偏离平均线的算术平均值，单位 μm\n'
            '  计算：Ra = (1/l) × ∫|z(x)| dx\n\n'
            '- Rz（最大粗糙度高度）：采样长度内最大峰高+最大谷深的平均值\n'
            '  对皱纹深度敏感，抗皱研究最常报告指标\n'
            '  有效性：Rz 降低 >10% 通常认为具有统计意义\n\n'
            '- Rmax（最大粗糙度）：单次评估长度内最高峰与最低谷之差\n'
            '  用于评估个别深皱纹变化\n\n'
            '- SEr（Skin Roughness）：皮肤粗糙度综合指数（PRIMOS专有参数）\n'
            '- SEsc（Skin Wrinkle Score）：皮肤皱纹评分\n\n'
            '三、测量部位与标准化\n'
            '最常用部位：\n'
            '- 眼角鱼尾纹（Lateral Canthus）：个体差异小，对抗皱产品最敏感\n'
            '- 鼻唇沟（Nasolabial Fold）\n'
            '- 额头横纹\n\n'
            '标准化要求：\n'
            '- 受试者面部表情放松（不皱眉）\n'
            '- 固定头部位置（使用头托）\n'
            '- 照明环境一致（关闭强侧光）\n'
            '- 每次使用同一操作者，或严格标准化操作\n\n'
            '四、与其他皱纹测量方法对比\n'
            '- PRIMOS：高精度，μm级，金标准，但设备昂贵（>€20K），操作复杂\n'
            '- Visiometer SV600：类似原理，更紧凑，适合面积较大测量\n'
            '- VISIA 3D 成像：更易操作，但精度低于 PRIMOS\n'
            '- 皮肤复制品（Skin Replica）分析：经济，适合多中心研究，但需额外步骤'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:primos-3d-skin-profiling',
        namespace='instruments',
        tags=['PRIMOS', '皮肤轮廓', '三维测量', '皱纹', 'Ra', 'Rz', '结构光', '抗皱评价', '皮肤粗糙度'],
    ),
    RawKnowledgeInput(
        title='环境温湿度对皮肤检测仪器测量的影响及控制规范',
        content=(
            '环境条件对皮肤检测仪器测量影响的全面分析\n\n'
            '一、温度影响\n'
            '皮肤血管会随温度变化而扩张/收缩，直接影响：\n'
            '1. Corneometer（水合仪）：\n'
            '   - 温度↑ → 皮肤血流↑ → 轻微出汗 → 数值偏高\n'
            '   - 规范：室温 20±2°C\n'
            '   - 超出范围影响：温度偏高1°C可使值升高约 2-3 AU\n\n'
            '2. Tewameter（TEWL仪）：\n'
            '   - 温度↑ → 皮肤表面TEWL↑（皮肤代谢加快）\n'
            '   - 规范：室温 20±2°C\n'
            '   - 最敏感：温度每升高1°C，TEWL约升高 0.5-1.5 g/m²/h\n\n'
            '3. Cutometer（弹性仪）：\n'
            '   - 温度影响皮肤黏弹性（胶原纤维刚性随温度变化）\n'
            '   - 温度↑ → 皮肤偏软 → R2可能轻微降低\n\n'
            '4. Mexameter（色度计）：\n'
            '   - 热刺激导致血管扩张 → EI（血红素指数）偏高\n'
            '   - 受试者进入室内后须适应20-30分钟后再测量\n\n'
            '二、湿度影响\n'
            '1. Corneometer（最敏感）：\n'
            '   - 湿度↑ → 皮肤表面从空气吸收水分 → 数值偏高\n'
            '   - 湿度↓ → 皮肤表面快速干燥 → 数值偏低\n'
            '   - 规范：40-60% RH，偏差>10% RH 须记录并评估数据\n\n'
            '2. Tewameter：\n'
            '   - 湿度影响测量腔内外的水蒸气梯度\n'
            '   - 规范：同 Corneometer\n\n'
            '三、实际研究中的控制措施\n'
            '1. 专用检测室：独立温控（空调）+恒湿设备\n'
            '2. 每日记录温湿度（至少早中晚三次）\n'
            '3. 超出规范范围的测量须记录偏差（Protocol Deviation）\n'
            '4. 受试者适应期：进入检测室后至少静坐 15-30 分钟\n'
            '5. 避免剧烈运动后立即测量\n\n'
            '四、数据有效性判断\n'
            '- 温度偏差±2°C内：通常数据有效，须记录\n'
            '- 温度偏差>±2°C：须标注数据，与PI讨论是否排除该测量点\n'
            '- 湿度偏差>±15% RH：可能需要重新测量\n'
            '- 建议在CRF中专设"测量环境记录"页'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:temperature-humidity-effects',
        namespace='instruments',
        tags=['温湿度', '环境控制', 'Corneometer', 'Tewameter', '测量误差', '标准化', '检测室', '温度影响'],
    ),
    RawKnowledgeInput(
        title='Sebumeter SM815：皮脂分泌测量原理与控油功效评价',
        content=(
            'Sebumeter SM815 皮脂测量仪完整指南\n\n'
            '一、测量原理\n'
            '光度法（Photometry）：\n'
            '将特殊磨砂膜（Sebufilm）贴于皮肤表面30秒，\n'
            '磨砂膜吸附皮脂后透明度增加（油脂使膜变透明），\n'
            '通过光源照射和探测器测量膜的透光度变化，\n'
            '换算为皮脂量（μg/cm²）。\n\n'
            '二、技术规格\n'
            '- 量程：0-350 μg/cm²（Sebum Units）\n'
            '- 测量接触时间：30秒（标准）；60秒（用于偏干皮肤）\n'
            '- 测量面积：约 64 mm²\n\n'
            '三、正常皮脂分泌量参考值\n'
            '- 干性皮肤：< 100 μg/cm²\n'
            '- 中性皮肤：100-200 μg/cm²\n'
            '- 混合性皮肤（T区）：200-300 μg/cm²\n'
            '- 油性皮肤：> 300 μg/cm²\n'
            '- 严重痤疮皮肤：可达 350 μg/cm²（饱和值）\n\n'
            '四、控油功效评价应用\n'
            '- 主要终点：使用前后 T 区皮脂量变化（μg/cm²，%变化）\n'
            '- 评价时间点：通常使用后 2、4 周（急性控油效果）\n'
            '- 测量部位：额头中央（T区最具代表性）\n'
            '- 测量时机：上午（避免清洗后立即测量，通常清洗后 2-4h 测量）\n\n'
            '五、操作规范\n'
            '- 环境：20±2°C，相对湿度 40-60% RH\n'
            '- 适应期：受试者进室后 15-30 分钟\n'
            '- 受试者要求：测量前未使用任何护肤品（须洗脸后 2-4h）\n'
            '- 每位点测量：2-3 次，取平均值\n\n'
            '六、数据解读\n'
            '控油有效标准：皮脂量降低 ≥ 15%（配合 p<0.05）视为有意义\n'
            '高效控油产品：降低 ≥ 25%'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:sebumeter-sm815',
        namespace='instruments',
        tags=['Sebumeter', 'SM815', '皮脂', '控油', '油性皮肤', '皮脂测量', 'T区', '功效评价'],
    ),
    RawKnowledgeInput(
        title='功效评价仪器选择指南：关键考量因素与决策框架',
        content=(
            '化妆品功效评价仪器选择决策指南\n\n'
            '一、仪器选择的核心考量因素\n\n'
            '1. 科学有效性（Scientific Validity）\n'
            '   - 测量原理是否直接反映目标功效（如保湿→水合度→Corneometer）\n'
            '   - 是否有充分发表的文献支持\n'
            '   - 重复性（Repeatability，同一操作者）≥ 90% 可接受\n'
            '   - 重现性（Reproducibility，不同实验室）≥ 85% 可接受\n\n'
            '2. 法规认可度\n'
            '   - NMPA是否指定特定仪器/方法（如SPF测定用ISO 24444）\n'
            '   - 是否有ISO/GB标准对应\n'
            '   - 是否被欧盟SCCS、FDA接受\n\n'
            '3. 灵敏度（Sensitivity to Change）\n'
            '   - 效应量检测能力：可检测的最小临床意义差异（MCID）\n'
            '   - 信噪比（SNR）：仪器内部变异 vs 产品效应\n\n'
            '4. 实际可操作性\n'
            '   - 操作复杂程度：培训时间，技术要求\n'
            '   - 测量时间：每个受试者需要多长时间\n'
            '   - 便携性：是否可以在多中心使用\n'
            '   - 成本：仪器购置成本（Corneometer约€8K；PRIMOS约€25K）\n\n'
            '5. 受试者接受度\n'
            '   - 侵入性：Cutometer（轻微负压）vs Tewameter（无侵入）\n'
            '   - 操作不适感：最小化受试者负担\n\n'
            '二、各功效类型推荐仪器矩阵\n'
            '| 功效宣称 | 主推仪器 | 辅助仪器 | 法规要求 |\n'
            '|---|---|---|---|\n'
            '| 保湿 | Corneometer | Tewameter | NMPA文献依据可 |\n'
            '| 美白 | Mexameter, Colorimeter | VISIA | NMPA须体外/体内 |\n'
            '| 抗皱紧致 | Cutometer (R2) | PRIMOS (Rz) | NMPA须人体研究 |\n'
            '| 防晒SPF | 光源照射受试者 | - | ISO 24444强制 |\n'
            '| 控油 | Sebumeter | - | NMPA文献可 |\n'
            '| 屏障修护 | Tewameter (TEWL) | Corneometer | NMPA须依据 |\n\n'
            '三、多仪器组合策略\n'
            '单仪器局限：依赖单一测量可能被异常值影响，且说服力有限。\n'
            '建议组合：保湿功效 = Corneometer（主）+ Tewameter（辅）+ 受试者自评（补充）\n\n'
            '四、仪器校准要求\n'
            '- A类（关键测量仪器）：每次使用前校准，或按制造商要求（通常每日）\n'
            '- B类（辅助仪器）：每月定期校准\n'
            '- 校准记录须纳入研究档案'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:selection-guide-decision',
        namespace='instruments',
        tags=['仪器选择', '功效评价仪器', '决策框架', '校准', '重复性', '法规认可', '仪器对比'],
    ),
    RawKnowledgeInput(
        title='高频超声（High-Frequency Ultrasound）在皮肤研究中的应用',
        content=(
            '高频超声（High-Frequency Ultrasound, HFUS）皮肤测量技术\n\n'
            '一、测量原理\n'
            '高频超声利用高频声波（20-100 MHz）对皮肤进行无创成像：\n'
            '- 声波发射到皮肤后，在不同组织界面产生反射\n'
            '- 根据反射波的时间延迟和强度重构皮肤层次结构\n'
            '常用仪器：DermaVision（旧称SkinScanner）、Episcan、SciMed等\n\n'
            '二、可测量的皮肤参数\n'
            '1. 表皮厚度（Epidermis Thickness）：约 50-200 μm\n'
            '2. 真皮厚度（Dermis Thickness）：通常 1.5-3.5 mm（随年龄降低）\n'
            '3. 皮下脂肪层厚度\n'
            '4. 真皮密度（Dermis Echogenicity）：与胶原蛋白密度正相关\n'
            '   老化皮肤真皮密度下降（胶原降解）\n'
            '5. 皮肤水含量（间接评估）：通过声速变化推算\n\n'
            '三、在化妆品功效评价的应用\n'
            '1. 抗衰老/紧致功效：监测真皮层密度变化（产品能否增加胶原？）\n'
            '2. 补水保湿功效（真皮层）：Corneometer测表浅角质层，超声测真皮层\n'
            '3. 瘢痕/色斑改善评估\n'
            '4. 透皮吸收研究：活性成分渗透深度（科研用途）\n\n'
            '四、优势与局限性\n'
            '优势：\n'
            '- 无创，无电离辐射\n'
            '- 可测量深层皮肤结构（Corneometer/Tewameter只测浅层）\n'
            '- 实时成像，可动态观察\n\n'
            '局限性：\n'
            '- 仪器昂贵（€30K以上）\n'
            '- 操作者技术要求高（须专业训练）\n'
            '- 结果解读主观性较强\n'
            '- 暂无 ISO 标准化方法，跨实验室可比性低\n\n'
            '五、化妆品功效评价中使用建议\n'
            '通常用于高端护肤品的科研证据生成（学术发表），\n'
            '而非常规 NMPA 注册用途（不被要求但可作为支持证据）。'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:high-frequency-ultrasound',
        namespace='instruments',
        tags=['高频超声', 'HFUS', '皮肤成像', '真皮厚度', '胶原蛋白', '抗衰老', '皮肤结构'],
    ),
    RawKnowledgeInput(
        title='Cutometer与Elastometer比较：大样本研究仪器选择指引',
        content=(
            'Cutometer vs Elastometer：大样本皮肤弹性研究仪器对比\n\n'
            '一、Cutometer MPA 580（负压吸引法）\n'
            '测量原理：负压吸引皮肤，光学传感器测量位移\n'
            '探头直径：2 mm 或 6 mm\n'
            '测量时间：每测量点约 20-30 秒（5-10 次循环）\n'
            '每受试者操作时间：约 3-5 分钟\n\n'
            '优势：\n'
            '- 国际广泛使用，文献数量多（发表研究超过1000篇）\n'
            '- 参数丰富（R0-R9 共10个弹性参数）\n'
            '- NMPA 接受度高（用于抗皱/紧致功效宣称）\n'
            '- 探头可更换，适合不同测量部位\n\n'
            '劣势：\n'
            '- 负压可能引起轻微不适（某些皮肤敏感的受试者）\n'
            '- 操作者须接受培训，保持探头垂直和恒压\n\n'
            '二、Elastometer 301+（扭转测量法）\n'
            '测量原理：在皮肤上施加已知扭矩，通过皮肤回弹角度测量弹性\n'
            '测量方式：粘贴圆形测量板，旋转后测量回弹\n'
            '优势：\n'
            '- 测量极快（约 5 秒/次）\n'
            '- 无吸引感，受试者依从性高\n'
            '- 适合大面积多部位快速筛查\n\n'
            '劣势：\n'
            '- 参数简单（主要是 Ue 和 Ur 两个参数）\n'
            '- 与 Cutometer 不可直接比较（不同物理机制）\n'
            '- 文献数量少于 Cutometer\n\n'
            '三、大样本研究（n>50）的选择建议\n'
            '| 因素 | Cutometer | Elastometer |\n'
            '|---|---|---|\n'
            '| 测量速度 | 慢（3-5分钟/人） | 快（<1分钟/人） |\n'
            '| 文献支持 | 丰富 | 较少 |\n'
            '| 法规认可 | NMPA接受 | 有限认可 |\n'
            '| 参数丰富性 | 高（R0-R9） | 低（2-3个） |\n'
            '| 大样本效率 | 低（时间成本高） | 高 |\n\n'
            '结论：大样本（n>50）且需法规认可的研究，推荐 Cutometer（虽慢但更权威）；\n'
            '纯探索性大样本筛查（n>100），可优先考虑 Elastometer 提高效率，\n'
            '再用 Cutometer 验证重要发现。'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:cutometer-vs-elastometer',
        namespace='instruments',
        tags=['Cutometer', 'Elastometer', '皮肤弹性', '大样本研究', '仪器选择', '弹性测量对比'],
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 补充：成分专项（积雪草、传明酸、角鲨烷、维C复配、泛醇、光甘草定）
# ══════════════════════════════════════════════════════════════════════════════

TARGETED_INGREDIENT = [
    RawKnowledgeInput(
        title='积雪草（Centella Asiatica）：活性成分、功效机制与化妆品应用',
        content=(
            '积雪草（Centella Asiatica / Gotu Kola）成分档案\n\n'
            '一、主要活性成分\n'
            '积雪草提取物（CICA）的功效来自以下三萜类化合物：\n\n'
            '1. 积雪草苷（Asiaticoside）：三萜皂苷，最主要活性成分\n'
            '   - 含量：通常占标准化提取物总活性成分的 40%\n'
            '   - 促进胶原合成，加速创面愈合\n\n'
            '2. 羟基积雪草苷（Madecassoside）\n'
            '   - 含量：约 30-40%\n'
            '   - 更强的抗炎活性，抑制NF-κB炎症通路\n'
            '   - 抗氧化作用优于积雪草苷\n\n'
            '3. 积雪草酸（Asiatic Acid）：游离三萜酸\n'
            '   - 促进成纤维细胞产生I型和III型胶原\n'
            '   - 直接刺激TGF-β信号通路\n\n'
            '4. 羟基积雪草酸（Madecassic Acid）：抗炎抗氧化\n\n'
            '二、主要功效机制\n'
            '1. 舒缓抗敏：\n'
            '   - 抑制肥大细胞脱颗粒（减少组胺释放）\n'
            '   - 抑制促炎因子（IL-1β、TNF-α、IL-6）\n'
            '   - 增强皮肤屏障（促进神经酰胺合成）\n\n'
            '2. 促进修护/愈合：\n'
            '   - 刺激成纤维细胞增殖和胶原合成\n'
            '   - 加速表皮角质形成细胞迁移（创面覆盖）\n\n'
            '3. 抗氧化：清除自由基，防止脂质过氧化\n\n'
            '三、临床证据\n'
            '- 特应性皮炎：含积雪草苷保湿剂显著降低皮肤TEWL和瘙痒评分（多项RCT）\n'
            '- 瘢痕改善：外用含积雪草的硅凝胶，瘢痕评分改善 20-30%\n'
            '- 敏感皮肤：舒缓率接近90%（消费者研究）\n\n'
            '四、配方应用\n'
            '- 使用浓度：0.1-5%（积雪草提取物），标准化含量\n'
            '- 稳定性：对光照较稳定，对强酸/碱敏感\n'
            '- 常见INCI名：Centella Asiatica Extract, Asiaticoside, Madecassoside'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:centella-asiatica-cica',
        namespace='ingredients',
        tags=['积雪草', 'CICA', 'Centella Asiatica', '积雪草苷', '羟基积雪草苷', '舒缓', '抗炎', '敏感皮肤'],
        properties={'inci': 'Centella Asiatica Extract'},
    ),
    RawKnowledgeInput(
        title='传明酸（氨甲环酸）：美白机制与熊果苷、烟酰胺的比较',
        content=(
            '传明酸（Tranexamic Acid / 氨甲环酸）成分档案\n\n'
            '一、化学基础\n'
            'INCI名称：Tranexamic Acid；CAS：1197-18-8\n'
            '分子量：157.21 g/mol；水溶性好\n\n'
            '二、美白作用机制（独特的间接抑制路径）\n'
            '传明酸的美白机制不同于熊果苷（酪氨酸酶抑制）或烟酰胺（黑素转移抑制）：\n\n'
            '1. 主要机制：抑制纤溶酶激活因子（Plasminogen Activator）\n'
            '   - 角质形成细胞分泌纤溶酶原激活因子（uPA）\n'
            '   - uPA 激活纤溶酶 → 纤溶酶刺激黑色素细胞分泌更多黑色素\n'
            '   - 传明酸竞争性抑制纤溶酶原激活 → 间接减少黑色素刺激信号\n\n'
            '2. 次要机制：抑制前列腺素E2（PGE2）合成\n'
            '   - PGE2 通过EP3受体促进黑色素合成\n'
            '   - 传明酸抑制花生四烯酸代谢通路，减少PGE2\n\n'
            '三、与其他美白成分的机制对比\n'
            '| 成分 | 靶点 | 作用机制 |\n'
            '|---|---|---|\n'
            '| 熊果苷 | 酪氨酸酶 | 直接竞争性抑制酪氨酸酶活性 |\n'
            '| 烟酰胺 | 黑素小体转移 | 抑制PAR-2介导的黑素小体转运 |\n'
            '| 传明酸 | 纤溶酶系统/PGE2 | 间接减少黑色素合成信号 |\n'
            '| 维生素C | 多靶点 | 还原多巴醌；抑制酪氨酸酶 |\n'
            '| 光甘草定 | 酪氨酸酶 | 非竞争性抑制酪氨酸酶 |\n\n'
            '四、临床数据\n'
            '- 浓度：2-5%（局部外用有效）；3%为常见有效浓度\n'
            '- 黄褐斑研究：12周后黑色素指数降低约 10-15%（对照安慰剂）\n'
            '- 与烟酰胺复配：协同增效（两者靶点不同）\n\n'
            '五、安全性\n'
            '- 原本为口服止血药，局部外用安全性远高于口服\n'
            '- 皮肤刺激性：极低，可用于敏感皮肤\n'
            '- 法规：中国尚无专项限量；EU允许在化妆品中使用（无特定限制）\n'
            '- 不良反应风险极低（对比VC等酸性成分）'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:tranexamic-acid-whitening',
        namespace='ingredients',
        tags=['传明酸', '氨甲环酸', 'Tranexamic Acid', '美白', '黄褐斑', '纤溶酶', '机制比较'],
        properties={'inci': 'Tranexamic Acid', 'cas': '1197-18-8'},
    ),
    RawKnowledgeInput(
        title='角鲨烷（Squalane）与角鲨烯（Squalene）：保湿机制、来源与稳定性比较',
        content=(
            '角鲨烷（Squalane）与角鲨烯（Squalene）完整对比档案\n\n'
            '一、化学结构差异\n'
            '角鲨烯（Squalene，2,6,10,15,19,23-hexamethyltetracosa-2,6,10,14,18,22-hexaene）：\n'
            '- 含有6个不饱和双键（C=C），高度不饱和的类三萜化合物\n'
            '- CAS: 111-02-4；分子量：410.7 g/mol\n'
            '- 天然存在于鲨鱼肝油（含量最高，80%）、橄榄油（0.1-0.7%）、皮脂（2.9-12.5%）\n\n'
            '角鲨烷（Squalane，2,6,10,15,19,23-hexamethyltetracosane）：\n'
            '- 角鲨烯的完全氢化产物（6个双键全被氢化）\n'
            '- CAS: 111-01-3；分子量：422.8 g/mol\n'
            '- 无双键，化学惰性\n\n'
            '二、关键区别\n'
            '| 特征 | 角鲨烯（Squalene） | 角鲨烷（Squalane） |\n'
            '|---|---|---|\n'
            '| 化学稳定性 | 不稳定，易氧化 | 高度稳定，抗氧化 |\n'
            '| 皮肤感觉 | 油腻感较强 | 轻盈，非油腻感 |\n'
            '| 化妆品适用性 | 较少直接使用 | 广泛使用 |\n'
            '| 氧化产物 | 可产生过氧化物（可能促痤疮） | 无 |\n'
            '| 天然功能 | 皮脂成分，抗氧化保护 | 皮肤屏障锁水 |\n'
            '| 来源 | 鲨鱼肝油、植物油 | 角鲨烯氢化；植物来源（橄榄、甘蔗） |\n\n'
            '三、角鲨烷的保湿机制\n'
            '1. 封闭效应：在皮肤表面形成薄膜，减少水分蒸发（TEWL↓）\n'
            '2. 补脂效应：与皮肤天然皮脂结构相似，修复脂质缺口\n'
            '3. 渗透辅助：促进其他脂溶性活性成分渗透\n\n'
            '四、来源与可持续性\n'
            '传统来源：鲨鱼肝油（深海鲨鱼，动物权益问题）\n'
            '植物来源（现代主流）：\n'
            '- 橄榄油角鲨烷：橄榄油经提取、氢化\n'
            '- 甘蔗角鲨烷（Sugarcane Squalane）：甘蔗发酵提取，更可持续\n'
            '- 硅藻油（Mico algae）：新兴替代来源\n\n'
            '五、配方应用\n'
            '- 使用浓度：1-5%（轻薄感）；5-15%（强效保湿）\n'
            '- 相容性好：与大多数活性成分（HA、维A醇、AHA等）兼容\n'
            '- 常与维生素E复配（抗氧化）'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:squalane-vs-squalene',
        namespace='ingredients',
        tags=['角鲨烷', '角鲨烯', 'Squalane', 'Squalene', '保湿', '皮肤屏障', '稳定性', '来源'],
        properties={'inci': 'Squalane', 'cas_squalane': '111-01-3'},
    ),
    RawKnowledgeInput(
        title='烟酰胺与维生素C复配指南：稳定性与协同增效',
        content=(
            '烟酰胺（Niacinamide）与维生素C（L-Ascorbic Acid）复配指南\n\n'
            '一、历史争议（已厘清）\n'
            '早期文献（1960年代化学研究）认为烟酰胺与维C在水溶液中反应生成\n'
            '"烟酸"（Nicotinic Acid），导致潮红反应，因此被认为不可复配。\n\n'
            '现代研究结论（2000年代以后）：\n'
            '- 反应需要极高温度（>100°C）或极端pH才会显著发生\n'
            '- 化妆品常规使用温度（室温至37°C）下，两者反应极慢（可忽略）\n'
            '- 合理配方设计下，复配是安全且有效的\n\n'
            '二、复配注意事项\n'
            '1. pH 控制（最关键因素）：\n'
            '   - 维C在酸性条件下稳定（最优 pH 2.5-4.0）\n'
            '   - 烟酰胺在接近中性时功效最佳（pH 5-7）\n'
            '   - 复配配方 pH 建议：3.5-4.5（两者均可接受的范围）\n\n'
            '2. 配方稳定性处理：\n'
            '   - 加入抗氧化剂（维生素E、阿魏酸）保护维C\n'
            '   - 避光包装（维C对光敏感）\n'
            '   - 铝管或遮光瓶\n\n'
            '三、协同功效机制\n'
            '| 功效 | 烟酰胺机制 | 维生素C机制 |\n'
            '|---|---|---|\n'
            '| 美白 | 抑制黑素小体转移（PAR-2） | 抑制酪氨酸酶；还原黑色素前体 |\n'
            '| 抗氧化 | NAD+辅酶补充 | 直接自由基清除；再生维E |\n'
            '| 抗衰老 | 增强皮肤屏障 | 促进胶原合成（脯氨酸羟化酶辅因子） |\n\n'
            '两者靶点不同，复配具有协同效果（综合美白效果优于单独使用）。\n\n'
            '四、市场成功配方案例\n'
            '- SkinCeuticals CE Ferulic：维C 15% + 维E 1% + 阿魏酸 0.5%\n'
            '  （不含烟酰胺，但说明维C高浓度配方的稳定化策略）\n'
            '- 高效美白精华：烟酰胺 5-10% + 维C衍生物（维C磷酸酯，更稳定）1-3%\n\n'
            '五、使用建议（消费者端）\n'
            '- 同一配方中低浓度复配（≤15% VC + ≤10% 烟酰胺）通常安全无问题\n'
            '- 若分步使用：建议先用酸性维C，再用pH较高的烟酰胺\n'
            '- 若出现潮红：可能是维C刺激而非"烟酸反应"，降低维C浓度即可'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:niacinamide-vitamin-c-combination',
        namespace='ingredients',
        tags=['烟酰胺', '维生素C', '复配', '稳定性', '美白协同', 'pH控制', '烟酸', '复配禁忌'],
    ),
    RawKnowledgeInput(
        title='光甘草定（Glabridin）：美白机制与熊果苷比较及安全性',
        content=(
            '光甘草定（Glabridin）美白成分档案\n\n'
            '一、化学基础\n'
            'INCI名称：Glabridin；CAS：59870-68-7\n'
            '来源：甘草根（Glycyrrhiza Glabra）提取物中的异黄酮类化合物\n'
            '脂溶性：高脂溶性，需要脂质载体/增溶剂\n\n'
            '二、美白机制（非竞争性酪氨酸酶抑制）\n'
            '光甘草定的美白机制：\n'
            '1. 主要靶点：非竞争性抑制酪氨酸酶（Tyrosinase）\n'
            '   - 与酪氨酸酶结合位点不同于底物（左旋多巴）\n'
            '   - 同时抑制酪氨酸酶的二酚酶（Diphenolase）和单酚酶活性\n'
            '2. 次要机制：抑制UVB诱导的色素沉着（抗炎，减少炎症后色素沉着）\n\n'
            '三、与熊果苷（Arbutin）的比较\n'
            '| 特征 | 光甘草定（Glabridin） | 熊果苷（Arbutin） |\n'
            '|---|---|---|\n'
            '| 来源 | 甘草提取物 | 合成；熊果叶提取 |\n'
            '| 酪氨酸酶抑制 | 非竞争性抑制（更强） | 竞争性抑制 |\n'
            '| 有效浓度 | 0.1-0.5%（脂溶性，浓度低） | 1-7%（水溶性，浓度高） |\n'
            '| 溶解性 | 脂溶性 | 水溶性 |\n'
            '| 配方难度 | 高（需增溶） | 低（水溶性，易配） |\n'
            '| 抑制效力 | 高（低浓度有效） | 中等 |\n'
            '| 法规限量 | 无特定限量（中国/EU） | β-熊果苷≤7%（EU化妆品法规） |\n\n'
            '四、临床证据\n'
            '- 有效美白浓度：0.1-0.5%\n'
            '- 典型研究：0.5% Glabridin 乳液，12周，Mexameter MI 降低约 15-20%\n\n'
            '五、配方注意事项\n'
            '- 脂溶性：须先溶于油相，或使用增溶剂（如 PEG-40 Hydrogenated Castor Oil）\n'
            '- 稳定性：对光照、氧化不敏感，相对稳定\n'
            '- pH范围：4.0-7.0，偏酸性时活性更高'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:glabridin-whitening',
        namespace='ingredients',
        tags=['光甘草定', 'Glabridin', '甘草', '美白', '酪氨酸酶', '熊果苷', '比较', '非竞争性'],
        properties={'inci': 'Glabridin', 'cas': '59870-68-7'},
    ),
    RawKnowledgeInput(
        title='泛醇（Panthenol/维生素B5）：保湿、修护机制与化妆品应用',
        content=(
            '泛醇（Panthenol / D-Panthenol / 维生素B5醇）成分档案\n\n'
            '一、化学基础\n'
            'INCI名称：Panthenol（D-Panthenol）；CAS：81-13-0\n'
            '分子量：205.25 g/mol；水溶性：极好\n'
            '代谢转化：皮肤中 Panthenol → Pantothenic Acid（泛酸，维生素B5）\n\n'
            '二、护肤功效机制\n'
            '1. 保湿机制（吸湿性保湿剂）：\n'
            '   - 具有多个羟基，从空气中吸收水分\n'
            '   - 在皮肤角质层中形成保湿膜\n'
            '   - Corneometer 提升：0.5% 浓度下，4周研究提升约 10-15 AU\n\n'
            '2. 皮肤屏障修护：\n'
            '   - 促进角质形成细胞增殖和分化\n'
            '   - 增强皮肤屏障功能（脂质合成）\n'
            '   - TEWL 降低效果（屏障强化）\n\n'
            '3. 抗炎舒缓：\n'
            '   - 抑制前列腺素E2合成（弱抗炎）\n'
            '   - 适合晒后修复，减轻红斑\n'
            '   - 局部用 5% D-Panthenol 乳液可改善特应性皮炎症状\n\n'
            '4. 促进伤口愈合：\n'
            '   - 加速细胞迁移和增殖（创面覆盖）\n'
            '   - Provitamin B5 在皮肤中转化为 CoA，参与脂肪酸合成\n\n'
            '三、在化妆品中的应用参数\n'
            '- 有效浓度：0.1-5%（化妆品）；5%（药妆级）\n'
            '- 与HA、甘油复配：协同保湿增效\n'
            '- 与视黄醇复配：减轻维A醇的刺激性（屏障保护）\n\n'
            '四、安全性\n'
            '- 广泛公认安全（GRAS）\n'
            '- 皮肤刺激性极低，过敏率<0.001%\n'
            '- 可用于婴幼儿皮肤产品（尿布疹护理）\n'
            '- SCCS 2020年评估：在化妆品常用浓度下安全'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:panthenol-vitamin-b5',
        namespace='ingredients',
        tags=['泛醇', 'Panthenol', '维生素B5', '保湿', '皮肤修护', '抗炎', '吸湿性', '安全性'],
        properties={'inci': 'Panthenol', 'cas': '81-13-0'},
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 补充：合规SOP专项（访视窗口、SAP时机、报告规范、IP归属、安慰剂效应）
# ══════════════════════════════════════════════════════════════════════════════

TARGETED_COMPLIANCE = [
    RawKnowledgeInput(
        title='临床研究访视时间窗口管理：设定标准与超窗处理规范',
        content=(
            '临床研究访视时间窗口（Visit Window）管理完整指南\n\n'
            '一、访视时间窗口定义\n'
            '访视时间窗口：研究方案中规定的受试者访视允许的时间范围。\n'
            '格式：基准天数 ± 允许偏差（天）\n'
            '例：第28天±3天 = 受试者在第25-31天内来访均合规\n\n'
            '二、窗口设定的标准化方法\n'
            '设定原则：\n'
            '1. 以科学依据为基础：窗口需足够大以适应受试者日程，但不能影响疗效评估\n'
            '2. 通常原则：\n'
            '   - 早期访视（2-4周）：±3天（占访视间隔约10-15%）\n'
            '   - 中期访视（4-8周）：±5天\n'
            '   - 长期访视（8-12周+）：±7天\n\n'
            '化妆品功效评价常见窗口设置示例：\n'
            '| 访视 | 目标天数 | 允许窗口 |\n'
            '|---|---|---|\n'
            '| 基线（V1） | 第0天 | ±0天（精确） |\n'
            '| 第2周（V2） | 第14天 | ±3天（第11-17天） |\n'
            '| 第4周（V3） | 第28天 | ±3天（第25-31天） |\n'
            '| 第8周（V4） | 第56天 | ±5天（第51-61天） |\n\n'
            '三、超窗（Out-of-Window Visit）的处理\n'
            '超窗定义：受试者实际来访日期超出方案规定窗口\n\n'
            '处理流程：\n'
            '1. 记录偏差：在CRF中记录实际访视日期和计划访视日期\n'
            '2. 偏差分类：\n'
            '   - 轻微超窗（1-3天）+ 不影响主要终点：通常为协议偏离（deviation）\n'
            '   - 超窗且时间点影响主要测量：须记录偏差，PI评估数据有效性\n'
            '3. 数据处理：\n'
            '   - 超窗数据通常仍可纳入分析（在SAP中预先声明处理规则）\n'
            '   - 严重超窗（>7天用于短期研究）须在报告中单独说明\n'
            '4. 预防：招募时发给受试者访视提醒卡/日历，提前1周电话提醒\n\n'
            '四、超窗率评估\n'
            '超窗率 > 20% 可能影响研究质量评分（GCP审查关注点）\n'
            '化妆品研究通常超窗率控制在 <10%'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:visit-window-management',
        namespace='compliance',
        tags=['访视窗口', 'Visit Window', '超窗', '协议偏离', '时间管理', 'GCP', '临床研究'],
        properties={'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='化妆品功效评价报告规范化组成：从封面到附件的完整框架',
        content=(
            '化妆品功效评价报告规范化组成（参照ICH E3，适配NMPA要求）\n\n'
            '一、报告基本信息（封面）\n'
            '- 报告编号（唯一标识符）\n'
            '- 产品名称和批号\n'
            '- 申办方（品牌商）信息\n'
            '- CRO/评价机构名称、资质（CMA/CNAS编号）\n'
            '- 首席研究者（PI）签名和日期\n'
            '- 报告版本号和日期\n'
            '- 研究起止日期\n\n'
            '二、执行摘要（≤500字）\n'
            '- 研究目的\n'
            '- 受试者数量（入组/完成/脱落）\n'
            '- 主要终点结果（数值±SD，p值，%变化）\n'
            '- 结论（1-2句）\n\n'
            '三、研究背景与目的\n'
            '- 产品描述（类别、功效宣称、目标人群）\n'
            '- 科学依据（相关文献综述）\n'
            '- 研究假设和主要终点\n\n'
            '四、研究方案摘要\n'
            '- 研究设计（随机/对照/盲法）\n'
            '- 受试者入排标准\n'
            '- 主要终点和次要终点\n'
            '- 样本量计算依据\n'
            '- 使用方法（频次、用量、部位）\n\n'
            '五、受试者分布（CONSORT流程图）\n'
            '- 筛查人数 → 入组人数 → 完成人数 → 脱落人数及原因\n\n'
            '六、基线人口学特征\n'
            '- 年龄、性别、皮肤类型、基线测量值\n\n'
            '七、功效评价结果（核心）\n'
            '- 主要终点：均值±SD，变化值，95%CI，p值，Cohen\'s d\n'
            '- 次要终点：同上\n'
            '- 统计方法说明（FAS/PP集，检验类型）\n\n'
            '八、安全性评估\n'
            '- 不良事件总结（类型、严重程度、与研究的相关性）\n'
            '- 皮肤不适/刺激性评估（如有）\n\n'
            '九、结论\n'
            '- 基于统计结果的科学陈述（不夸大）\n'
            '- 功效宣称建议（支持哪些宣称）\n\n'
            '十、附件\n'
            '- 伦理批件\n'
            '- 知情同意书样本\n'
            '- 统计分析计划（SAP）\n'
            '- 仪器校准记录\n'
            '- 原始数据摘要表\n\n'
            '报告有效性声明：研究者须签署声明，证明数据真实、完整，未经修改。'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:efficacy-evaluation-report-structure',
        namespace='compliance',
        tags=['功效评价报告', '报告结构', 'ICH E3', 'CRO报告', '报告规范', 'NMPA', '结论', '附件'],
    ),
    RawKnowledgeInput(
        title='功效评价研究中安慰剂效应的识别与控制策略',
        content=(
            '化妆品功效评价中安慰剂效应（Placebo Effect）管理\n\n'
            '一、安慰剂效应定义与影响\n'
            '安慰剂效应：受试者仅因为相信自己在使用有效产品而感知到改善。\n'
            '在化妆品研究中，安慰剂效应可高达 20-40%（主观终点），\n'
            '某些研究中甚至观察到安慰剂组客观仪器测量值也有改善（心理-生理反应）。\n\n'
            '二、各类终点受安慰剂影响的程度\n'
            '| 终点类型 | 安慰剂影响 | 原因 |\n'
            '|---|---|---|\n'
            '| 主观自评（保湿感、紧致感） | 高（20-40%） | 纯心理感知 |\n'
            '| 皮肤科医生评分（盲法） | 中（5-15%） | 评估者偏倚减少 |\n'
            '| 客观仪器测量（Corneometer） | 低（2-8%） | 客观数据，但使用体验影响血流 |\n'
            '| 生化指标（活检，HPLC） | 极低 | 真正客观 |\n\n'
            '三、控制安慰剂效应的设计策略\n\n'
            '1. 双盲设计（最有效）：\n'
            '   - 受试者不知道使用的是测试品还是安慰剂\n'
            '   - 制备匹配安慰剂（气味、颜色、稠度与测试品相似）\n'
            '   - 评估者同样不知道分组（盲法评估）\n\n'
            '2. 半脸/自身对照设计：\n'
            '   - 同一受试者两侧随机分配测试品和安慰剂\n'
            '   - 消除受试者间变异（包括安慰剂效应）\n'
            '   - 安慰剂"对照端"的改善可精确测量安慰剂效应大小\n\n'
            '3. 延长 washout 期：\n'
            '   - 确保基线测量时受试者未受先前产品影响\n\n'
            '4. 客观仪器为主要终点：\n'
            '   - 仪器测量数据不受心理预期影响（Corneometer vs 问卷）\n\n'
            '四、当研究只能用主观终点时\n'
            '- 量表设计：使用已验证的VAS/NRS量表（≥30mm差异视为临床意义）\n'
            '- 盲法访谈：由不知分组的研究员问询受试者\n'
            '- 历史对照：与大量历史数据中安慰剂组数据比较\n'
            '- 统计分析：报告安慰剂校正效应（Treatment - Placebo）'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:placebo-effect-control',
        namespace='methodology',
        tags=['安慰剂效应', 'Placebo Effect', '双盲设计', '研究设计', '偏倚控制', '主观终点', '客观评估'],
    ),
    RawKnowledgeInput(
        title='CRO与品牌方合同：知识产权归属与功效评价报告使用权限',
        content=(
            'CRO服务合同中知识产权（IP）和报告使用权约定指南\n\n'
            '一、功效评价报告的知识产权归属（常见约定）\n\n'
            '方案A（委托研究，最常见）：\n'
            '- 报告版权归申办方（品牌商）所有\n'
            '- CRO只保留内部存档权（用于质量管理和合规档案）\n'
            '- 品牌商可自由使用报告内容（营销、注册申报、学术发表）\n\n'
            '方案B（联合研究）：\n'
            '- IP联合所有，须双方书面同意才能使用\n'
            '- 通常用于CRO参与方法创新的研究\n\n'
            '方案C（CRO自主研究）：\n'
            '- IP归CRO，授权品牌商使用（许可授权）\n'
            '- 罕见，通常用于CRO开发新仪器/方法后的商业化\n\n'
            '二、功效评价报告的使用权限\n\n'
            '报告用于NMPA注册申报：\n'
            '- 标准委托研究合同下无限制（品牌商完整版权）\n'
            '- 须注意：申报时须提交原始数据（非仅摘要）\n\n'
            '报告用于营销宣传：\n'
            '- 品牌商通常享有宣传权，但须注意：\n'
            '  1. 宣传内容不得超出报告结论（不夸大）\n'
            '  2. 引用统计数据须注明完整上下文（不断章取义）\n'
            '  3. 部分国家/地区营销宣传须经监管机构审查（如EU功效宣称规则）\n\n'
            '报告用于学术发表：\n'
            '- 须经申办方书面同意（通常在合同中约定）\n'
            '- 利益冲突声明：须注明研究由品牌商资助\n\n'
            '三、数据独占权（Data Exclusivity）\n'
            '- 化妆品研究通常无法规性数据独占期（与药品不同）\n'
            '- 合同中可约定竞争性禁止：CRO在X年内不能将类似方法用于竞品\n\n'
            '四、保密条款建议\n'
            '- 配方保密：CRO不得披露测试品配方（商业机密）\n'
            '- 研究结果保密期：通常至产品上市后X个月'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:cro-brand-ip-contract',
        namespace='compliance',
        tags=['知识产权', 'IP', 'CRO', '合同', '报告使用权', '版权', '营销宣传', '注册申报'],
    ),
    RawKnowledgeInput(
        title='功效宣称结论句写作规范：科学表达与合规边界',
        content=(
            '化妆品功效宣称结论句写作指南（研究报告与营销材料）\n\n'
            '一、功效评价报告结论句（科学表达规范）\n'
            '科学结论句要素：研究设计描述 + 统计结果 + 受试者信息\n\n'
            '规范示例（保湿）：\n'
            '"本研究纳入XX例受试者（基线Corneometer值X±X AU），\n'
            '随机、双盲、安慰剂对照设计，使用测试品XX周后，\n'
            '皮肤角质层水合度（Corneometer）与安慰剂组相比\n'
            '显著提升（ΔX±X AU，p=X，Cohen\'s d=X）。"\n\n'
            '规范示例（美白）：\n'
            '"在XX名Fitzpatrick III-IV型受试者中，使用测试品12周后，\n'
            'Mexameter黑色素指数（MI）较基线降低X%（△X AU，p<0.05），\n'
            '优于安慰剂组（安慰剂组降低X%，两组差异p=X）。"\n\n'
            '二、营销宣传文案的合规边界（NMPA 2021功效宣称规范）\n\n'
            '允许的宣称表达：\n'
            '- "经X周人体测试，皮肤水分提升X%" ✓（有具体数据）\n'
            '- "含X活性成分，具有保湿功效" ✓（成分依据）\n'
            '- "适合干性皮肤，使用后肌肤更滋润" ✓（一般描述）\n\n'
            '禁止的宣称表达（或须高级别证据支持）：\n'
            '- "医学级修复" ✗（化妆品不得宣称医疗功能）\n'
            '- "100%受试者有效" ✗（除非真实数据且无统计操纵）\n'
            '- "唯一临床验证" ✗（夸大独特性）\n'
            '- "永久保湿效果" ✗（不可证实的持续效果）\n\n'
            '三、效果量化数据引用规范\n'
            '1. 数据须来自已完成的研究报告\n'
            '2. 引用须完整（不断章取义）：\n'
            '   错误："皮肤水分提升35%" \n'
            '   正确："经8周人体测试（n=30），皮肤角质层水分与基线相比提升35%（p<0.01）"\n'
            '3. 宣称效果不得超出报告结论所支持的程度\n\n'
            '四、中国法规依据\n'
            '《化妆品标签管理办法》（2021年）、\n'
            '《化妆品功效宣称评价规范》（2021年）规定：\n'
            '宣称须有科学依据；特定功效宣称须对应级别的评价证据。'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:efficacy-claim-writing',
        namespace='compliance',
        tags=['功效宣称', '结论句', '营销合规', '宣称写作', 'NMPA', '数据引用', '合规边界'],
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 补充：方法学专项（Cohen's d解读、缺失数据分类、MMRM应用）
# ══════════════════════════════════════════════════════════════════════════════

TARGETED_METHODOLOGY = [
    RawKnowledgeInput(
        title='缺失数据分类（MCAR/MAR/MNAR）与处理方法选择',
        content=(
            '临床研究缺失数据分类与处理完整指南（ICH E9(R1)框架）\n\n'
            '一、缺失数据三种类型（Little & Rubin 分类）\n\n'
            '1. MCAR（Missing Completely At Random，完全随机缺失）\n'
            '定义：数据缺失与任何已观测或未观测变量无关\n'
            '例子：受试者因交通意外无法来访（与研究和疾病状态无关）\n'
            '特点：最理想情况，简单删除缺失数据不会引入偏倚\n'
            '检验方法：Little\'s MCAR test（p>0.05支持MCAR）\n\n'
            '2. MAR（Missing At Random，随机缺失）\n'
            '定义：数据缺失与已观测到的变量有关，但与未观测到的结局无关\n'
            '例子：老年受试者更容易失访，但缺失与实际皮肤状态无关\n'
            '（年龄→失访，但缺失时刻的皮肤状态是随机的）\n'
            '特点：最常见的假设；基于MAR的统计方法通常无偏（如混合模型）\n\n'
            '3. MNAR（Missing Not At Random，非随机缺失）\n'
            '定义：数据缺失与未观测到的结局本身有关\n'
            '例子：产品刺激性强，皮肤改善越差的受试者越容易退出\n'
            '（"最坏的人"最先失访，导致结果偏高）\n'
            '特点：最严重的偏倚来源；传统方法（LOCF、混合模型）都可能有偏\n'
            '处理：需要敏感性分析（如Pattern Mixture Model）\n\n'
            '二、缺失数据处理方法\n'
            '| 方法 | 适用情况 | 局限性 |\n'
            '|---|---|---|\n'
            '| CC（仅用完整数据）| MCAR | 效能损失，可能引入MAR下的偏倚 |\n'
            '| LOCF（末次观测值结转）| 假设病情稳定 | MNAR下偏倚大 |\n'
            '| 均值填补 | 简单情况 | 低估方差，不推荐 |\n'
            '| 混合线性模型（MMRM）| MAR | 最优MAR方法，ICH推荐 |\n'
            '| 多重填补（MI）| MAR | 计算复杂，但最全面 |\n\n'
            '三、ICH E9(R1) 建议\n'
            '- 在SAP中预先说明缺失数据假设和处理策略\n'
            '- 主分析用MMRM（MAR假设）\n'
            '- 敏感性分析检验MNAR情景对结论的影响\n'
            '- 报告缺失数据量和模式（不同访视点的失访率）'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:missing-data-mcar-mar-mnar',
        namespace='methodology',
        tags=['缺失数据', 'MCAR', 'MAR', 'MNAR', '混合线性模型', 'MMRM', 'ICH E9', '统计方法'],
        properties={'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='混合效应模型（MMRM）应用：重复测量数据的最优分析策略',
        content=(
            '混合效应重复测量模型（MMRM, Mixed Model for Repeated Measures）应用指南\n\n'
            '一、MMRM 的应用场景\n'
            '适用条件：\n'
            '1. 数据为重复测量设计（每受试者在多个时间点有测量值）\n'
            '2. 满足 MAR（随机缺失）假设\n'
            '3. 需要考虑时间点之间的相关性（不能将各时间点独立分析）\n'
            '4. 有较多缺失数据（比LOCF更可靠）\n\n'
            '化妆品功效评价适用场景：\n'
            '- 保湿研究（基线、2周、4周、8周）\n'
            '- 抗皱研究（多个随访时间点）\n'
            '- 任何有重复访视的功效研究\n\n'
            '二、MMRM 模型结构\n'
            '基本模型：Y_it = β₀ + β₁×Treatment + β₂×Time + β₃×(Treatment×Time) + β₄×Baseline + ε_it\n\n'
            '固定效应（Fixed Effects）：\n'
            '- Treatment（处理组，测试品 vs 安慰剂）\n'
            '- Time（时间点，连续或分类）\n'
            '- Treatment × Time 交互（核心，评估处理效果随时间变化）\n'
            '- Baseline（基线协变量，提高精度）\n\n'
            '随机效应（Random Effects）：受试者随机截距（个体间差异）\n\n'
            '协方差结构选择：\n'
            '- Unstructured (UN)：无限制，最灵活，但参数多，适合小样本\n'
            '- Compound Symmetry (CS)：假设各时间点相关性相等，参数少\n'
            '- AR(1)（一阶自回归）：相邻时间点相关性更高，适合等间隔随访\n'
            '- 选择准则：AIC/BIC 最小化\n\n'
            '三、与其他方法的对比\n'
            '| 方法 | 处理缺失数据 | 时间相关性 | ICH推荐 |\n'
            '|---|---|---|---|\n'
            '| 配对t检验（每时间点独立）| 仅完整数据 | 不考虑 | 简单研究可用 |\n'
            '| LOCF+ANCOVA | 假设末次值稳定 | 不考虑 | 偏倚风险 |\n'
            '| MMRM | MAR假设下无偏 | 完整建模 | ICH E9(R1)推荐 |\n\n'
            '四、化妆品研究中的典型应用\n'
            '主要终点分析（MMRM）：\n'
            'model_output = mmrm(formula = Corneometer_change ~ Treatment*Visit + Baseline + (1|Subject))\n'
            '关注：Treatment×Visit 交互项，在每个访视点的处理效应估计'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:mmrm-repeated-measures',
        namespace='methodology',
        tags=['MMRM', '混合效应模型', '重复测量', '统计分析', 'MAR', '协方差结构', 'ICH E9', '纵向数据'],
    ),
    RawKnowledgeInput(
        title='半脸对照（Split-Face）设计：优势、局限与适用场景',
        content=(
            '半脸对照（Split-Face Design / Bilateral Study）设计详解\n\n'
            '一、设计原理\n'
            '同一受试者的左右两侧面部（或双侧臂部）分别随机施用两种处理：\n'
            '- 一侧：测试产品（A）\n'
            '- 另一侧：对照产品（B，通常安慰剂或已知有效品）\n'
            '随机化：通过随机化决定左/右哪侧用测试品\n\n'
            '二、主要优势\n'
            '1. 消除受试者间变异（最关键优势）：\n'
            '   - 两侧来自同一人，年龄、基线皮肤状态、全身因素相同\n'
            '   - 消除受试者间差异后，检验功效所需样本量减少约30-50%\n'
            '   例：普通平行组设计需n=50人/组（共100），半脸设计通常n=30人即可\n\n'
            '2. 更好控制混杂变量：\n'
            '   - 日晒、饮食、睡眠对两侧影响相同（自然控制）\n'
            '   - 季节性环境变化对两侧同等影响\n\n'
            '3. 更高统计效能（Statistical Power）：\n'
            '   - 配对设计的标准误更小，同样样本量下更容易检测显著差异\n\n'
            '三、局限性与注意事项\n'
            '1. 产品转移污染风险：\n'
            '   - 涂抹时产品可能从一侧转移到另一侧（尤其精华、乳液）\n'
            '   - 解决方案：使用遮挡物分隔，或选择测量部位在中线两侧\n\n'
            '2. 面部不对称性：\n'
            '   - 人体面部天然不对称（左右皮肤厚度、色素分布有差异）\n'
            '   - 解决方案：基线两侧同时测量，以变化量（△）作为终点\n\n'
            '3. 全身效应干扰：\n'
            '   - 如果产品有全身性吸收（如维A酸），两侧均可能受影响\n'
            '   - 通常化妆品局部吸收低，影响可忽略\n\n'
            '4. 适用场景限制：\n'
            '   - 适合：面部保湿、美白、抗皱（局部测量）\n'
            '   - 不适合：防晒（两侧均需大面积照射且须防止交叉照射）\n'
            '   - 不适合：有香气/颜色的产品（破盲）\n\n'
            '四、统计分析\n'
            '配对t检验或Wilcoxon符号秩检验（A侧 - B侧的变化差值）\n'
            '混合线性模型（Treatment×Side 交互）'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:split-face-design-detail',
        namespace='methodology',
        tags=['半脸对照', 'Split-Face', '研究设计', '样本量', '配对设计', '统计效能', '双臂设计'],
    ),
]


ALL_TARGETED = (
    TARGETED_INSTRUMENT +
    TARGETED_INGREDIENT +
    TARGETED_COMPLIANCE +
    TARGETED_METHODOLOGY
)


class Command(BaseCommand):
    help = '第二轮针对性知识注入：补充评测识别出的知识缺口'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='试运行，不写入数据库')

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        total_new = total_skip = total_fail = 0

        self.stdout.write(f'=== 第二轮针对性知识注入（共 {len(ALL_TARGETED)} 条）===')

        for item in ALL_TARGETED:
            if dry_run:
                self.stdout.write(f'  [DRY-RUN] {item.title[:70]}')
                continue

            try:
                result = run_pipeline(item)
                if result.skipped_reason:
                    total_skip += 1
                    self.stdout.write(f'  ⏭  跳过: {item.title[:60]}（{result.skipped_reason}）')
                elif result.success and result.entry_id:
                    from apps.knowledge.models import KnowledgeEntry
                    try:
                        entry = KnowledgeEntry.objects.get(pk=result.entry_id)
                        if entry.quality_score and entry.quality_score >= 60:
                            entry.status = 'published'
                            entry.is_published = True
                            entry.save(update_fields=['status', 'is_published'])
                    except KnowledgeEntry.DoesNotExist:
                        pass
                    total_new += 1
                    self.stdout.write(f'  ✅ 新建: {item.title[:60]} (质量:{result.quality_score})')
                else:
                    total_fail += 1
                    errs = '; '.join(f'{k}:{v}' for k, v in result.stage_errors.items())
                    self.stdout.write(self.style.ERROR(f'  ❌ 失败: {item.title[:60]} → {errs}'))
            except Exception as e:
                total_fail += 1
                self.stdout.write(self.style.ERROR(f'  ❌ 异常: {item.title[:60]} → {e}'))

        if not dry_run:
            self.stdout.write(f'\n注入完成：新建 {total_new} | 跳过 {total_skip} | 失败 {total_fail}')
        else:
            self.stdout.write(f'\n[DRY-RUN] 将注入 {len(ALL_TARGETED)} 条')
