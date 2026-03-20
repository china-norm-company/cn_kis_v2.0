"""
一流专业知识注入命令

基于行业顶级 CRO 机构的专业知识标准，系统性注入五大核心知识域的权威内容：
  - 法规合规专项（NMPA法规、ICH全系、GB/T标准）
  - 功效评价方法学专项（统计、设计、路径、标准）
  - 皮肤检测仪器专项（技术原理、操作规范、参数解读）
  - 成分安全专项（功效机制、安全评估、相互作用）
  - 临床合规SOP专项（GCP、CRF、偏差、伦理）

用法：
  python manage.py ingest_expert_knowledge              # 全部注入
  python manage.py ingest_expert_knowledge --domain regulation
  python manage.py ingest_expert_knowledge --domain methodology
  python manage.py ingest_expert_knowledge --domain instrument
  python manage.py ingest_expert_knowledge --domain ingredient
  python manage.py ingest_expert_knowledge --domain compliance
  python manage.py ingest_expert_knowledge --dry-run
"""
from django.core.management.base import BaseCommand
from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput


# ══════════════════════════════════════════════════════════════════════════════
# 一、法规合规专项（REGULATION DOMAIN）
# 目标：覆盖NMPA全量法规要求、ICH指南要点、国标强制条款
# ══════════════════════════════════════════════════════════════════════════════

REGULATION_CORPUS = [
    RawKnowledgeInput(
        title='化妆品注册备案管理办法（2021）：特殊化妆品与普通化妆品分类',
        content=(
            '《化妆品注册备案管理办法》（国家市场监督管理总局令第35号，2021年5月1日实施）\n\n'
            '一、分类定义\n'
            '特殊化妆品：用于染发、烫发、祛斑美白、防晒、防脱发，以及宣称新功效的化妆品。'
            '须经国家药品监督管理局（NMPA）注册（行政许可）后方可生产、进口和销售。\n'
            '普通化妆品：特殊化妆品以外的化妆品。须在上市销售前完成备案。\n\n'
            '二、监管要求对比\n'
            '特殊化妆品（注册制）：\n'
            '- 主管部门：国家药品监督管理局\n'
            '- 上市前要求：注册批件（行政审批，通常6-12个月）\n'
            '- 注册申请材料：产品配方、生产工艺、安全评估报告、功效评价报告（必须）、\n'
            '  标签样稿、检验报告（卫生学、毒理学）\n'
            '- 变更管理：配方变更须重新注册\n\n'
            '普通化妆品（备案制）：\n'
            '- 主管部门：省级药品监督管理部门（国产），NMPA（进口）\n'
            '- 上市前要求：完成备案（信息公示，通常1-5工作日）\n'
            '- 备案材料：产品配方、生产工艺、安全评估报告（须由注册化妆品安全评估师签署）\n'
            '- 功效评价：一般功效宣称须有支持依据；特定功效（保湿、滋养等28类）须评价报告\n\n'
            '三、功效宣称的监管依据\n'
            '《化妆品功效宣称评价规范》（2021年）规定：\n'
            '- 人体功效评价报告：用于防晒（SPF/PA值）、祛斑美白、防脱发、滋发护发、\n'
            '  去屑、防护、修护、控油、舒缓、紧致、抗皱等特定功效宣称（需提供实证依据）\n'
            '- 消费者使用测试：可用于保湿、滋养、清洁、卸妆、芳香等功效（相对宽松）\n'
            '- 仅文献或功效成分依据：适用于宣称较为基础的功效\n'
            '具体清单见《化妆品功效宣称评价项目目录（2022年版）》。'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='reg:nmpa-cosm-reg-admin-2021:classification',
        namespace='regulations',
        tags=['NMPA', '化妆品注册', '特殊化妆品', '普通化妆品', '备案', '功效宣称', '分类监管'],
        properties={'regulation_code': '国家市场监督管理总局令第35号', 'year': 2021},
    ),
    RawKnowledgeInput(
        title='化妆品功效宣称评价规范（2021）：人体功效评价报告要求',
        content=(
            '《化妆品功效宣称评价规范》（国家药品监督管理局2021年第13号公告）\n\n'
            '一、须提交人体功效评价报告的功效类别\n'
            '以下功效宣称必须提交人体功效评价报告（权威性最高）：\n'
            '1. 防晒（SPF、PA、UVA防护等级宣称）\n'
            '2. 祛斑美白（美白、淡斑、提亮肤色）\n'
            '3. 防脱发、育发\n'
            '4. 修护（针对特定损伤的修复宣称）\n'
            '5. 滋发（特定养发功效）\n'
            '6. 去屑（化学法或生物法去屑）\n'
            '7. 防护（防过敏、增强皮肤屏障）\n'
            '8. 控油（油脂分泌控制）\n'
            '9. 舒缓（针对刺激性皮肤）\n'
            '10. 紧致、抗皱（抗衰老宣称）\n'
            '11. 祛痘、抑制粉刺（针对痤疮）\n\n'
            '二、保湿宣称的特殊规定\n'
            '保湿宣称属于"一般功效"，可采用以下任一形式提供评价依据：\n'
            '(a) 人体功效评价报告（推荐，说服力最强）\n'
            '(b) 消费者使用测试报告（样本≥30人）\n'
            '(c) 功效成分、文献或理论依据（最低要求）\n'
            '注意：若宣称"临床证明"或"X周见效"等量化表述，则须人体功效评价报告。\n\n'
            '三、人体功效评价报告质量要求\n'
            '- 研究机构：具有医疗卫生机构资质，评价人员具备皮肤科或相关专业背景\n'
            '- 检测机构：CMA（计量认证）或CNAS（实验室认可）资质\n'
            '- 方案设计：须有完整的研究方案（包含主要终点、样本量计算依据、统计分析方法）\n'
            '- 知情同意：所有受试者须签署知情同意书\n'
            '- 数据真实性：禁止数据造假，报告须经负责人签字确认\n\n'
            '四、关键时间节点\n'
            '- 2022年5月1日：所有特殊化妆品注册须附功效评价报告\n'
            '- 2023年5月1日：所有新备案普通化妆品须提交功效宣称依据\n'
            '- 2025年5月1日：过渡期结束，全部在产化妆品须完成规范化整改'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='reg:nmpa-efficacy-claim-eval-2021',
        namespace='regulations',
        tags=['功效宣称', '人体功效评价', '保湿', '防晒', '美白', 'NMPA', '2021法规'],
        properties={'regulation_code': '国家药品监督管理局2021年第13号公告', 'year': 2021},
    ),
    RawKnowledgeInput(
        title='化妆品安全技术规范（2015版）：微生物限量与重金属指标',
        content=(
            '《化妆品安全技术规范》（2015年版，2023年局部修订）\n\n'
            '一、微生物限量指标（第四章）\n'
            '眼部化妆品、口唇化妆品和儿童化妆品：\n'
            '- 菌落总数（需氧菌总数）：≤500 CFU/mL（或g）\n'
            '- 霉菌和酵母菌总数：≤100 CFU/mL（或g）\n'
            '- 耐热大肠菌群：不得检出\n'
            '- 金黄色葡萄球菌：不得检出\n'
            '- 铜绿假单胞菌：不得检出\n\n'
            '其他化妆品（非眼部/口唇/儿童）：\n'
            '- 菌落总数：≤1000 CFU/mL（或g）\n'
            '- 霉菌和酵母菌总数：≤100 CFU/mL（或g）\n'
            '- 耐热大肠菌群：不得检出\n'
            '- 金黄色葡萄球菌：不得检出\n'
            '- 铜绿假单胞菌：不得检出\n\n'
            '二、重金属限量指标（第三章）\n'
            '- 铅（Pb）：≤10 mg/kg\n'
            '- 汞（Hg）：≤1 mg/kg（含汞防腐剂除外）\n'
            '- 砷（As）：≤2 mg/kg\n'
            '- 镉（Cd）：≤5 mg/kg\n\n'
            '三、防腐剂、防晒剂、着色剂限用规定\n'
            '- 防腐剂：附表1规定的准用防腐剂列表及最大使用浓度\n'
            '  例：苯甲醇（Benzyl Alcohol）≤1%；苯甲酸及其盐≤0.5%（以酸计）\n'
            '- 防晒剂：附表2规定的准用防晒剂，如氧化锌≤25%，二氧化钛≤25%\n'
            '- 着色剂：附表3规定的准用着色剂，注意含焦油色素的特殊要求\n\n'
            '四、检测方法\n'
            '- 微生物检测：按GB/T 7918系列方法\n'
            '- 重金属检测：ICP-MS或ICP-OES（原子吸收光谱）\n'
            '- 报告有效期：生产出厂检验报告（每批次）；型式检验报告（每年至少1次）'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='reg:cosm-safety-tech-spec-2015:microbio',
        namespace='regulations',
        tags=['化妆品安全技术规范', '微生物限量', '重金属', '防腐剂', '防晒剂', '安全指标', '2015版'],
        properties={'regulation_code': '化妆品安全技术规范2015版', 'year': 2015},
    ),
    RawKnowledgeInput(
        title='ICH E6(R3) GCP 指南：知情同意、受试者保护与文件管理',
        content=(
            'ICH E6(R3) Good Clinical Practice（2023年最新修订版）\n\n'
            '一、知情同意（Informed Consent）核心要求\n'
            '1. 时机：必须在任何研究操作开始前获取，包括：\n'
            '   - 筛查性检查（如血液检查、皮肤评估）\n'
            '   - 限制性行为（如停止使用其他护肤品）\n'
            '   - 随机化分组\n'
            '2. 内容：ICF须包含：研究目的、程序、预期风险与收益、保密措施、\n'
            '   退出权利（无需说明理由）、研究者联系方式、赔偿/补偿安排\n'
            '3. 签署：受试者本人签署（书面）；法定代理人（未成年/行为能力受限者）；\n'
            '   化妆品研究通常为成年健康受试者，须本人签署\n'
            '4. 语言：须以受试者能理解的语言和文化适应性语言撰写\n'
            '5. 重新同意：若方案修订或新安全信息出现，须重新获得知情同意\n\n'
            '二、受试者保护\n'
            '- 脆弱人群（孕妇、老人、未成年）须额外保护措施\n'
            '- 化妆品功效评价：通常排除孕妇、哺乳期、皮肤病患者\n'
            '- 不良事件（AE）报告：研究相关AE须记录并评估与研究的关联性\n'
            '- 严重不良事件（SAE）：须在24小时内向申办方报告\n\n'
            '三、必要文件（Essential Documents）\n'
            'E6(R3)附录中规定的关键文件：\n'
            '- 研究者手册（IB）或产品说明（化妆品研究可替代）\n'
            '- 伦理批件（IRB/EC批准函）\n'
            '- 签署的知情同意书原件（每个受试者一份）\n'
            '- 受试者招募材料\n'
            '- 随机化方案及编码信封（双盲研究）\n'
            '- 原始数据（CRF原件或认证副本）\n'
            '- 所有修订版方案及其伦理批件\n\n'
            '四、化妆品研究的GCP适用说明\n'
            'E6(R3) 主要针对药品临床试验，化妆品功效评价参照执行：\n'
            '- 监查（Monitoring）：申办方须指定监查员定期访视\n'
            '- 数据管理：EDC或纸质CRF均可，须确保数据溯源性（Audit Trail）\n'
            '- 档案保存：研究结束后至少保存5年（部分法规要求15年）'
        ),
        entry_type='regulation',
        source_type='ich_import',
        source_key='reg:ich-e6-r3-gcp-2023',
        namespace='regulations',
        tags=['ICH E6', 'GCP', '知情同意', '受试者保护', 'E6(R3)', '临床研究规范', '伦理'],
        properties={'regulation_code': 'ICH E6(R3)', 'year': 2023},
    ),
    RawKnowledgeInput(
        title='化妆品中准用防晒剂：氧化锌与二氧化钛的规范与防护特性',
        content=(
            '化妆品准用无机防晒剂：氧化锌（ZnO）和二氧化钛（TiO₂）\n\n'
            '一、法规地位\n'
            '两者均列入《化妆品安全技术规范（2015版）》防晒剂准用列表：\n'
            '- 氧化锌（Zinc Oxide）：INCI名称 Zinc Oxide；最大使用浓度 25%\n'
            '- 二氧化钛（Titanium Dioxide）：INCI名称 Titanium Dioxide；最大使用浓度 25%\n'
            'EU法规：两者均在Annex VI（准用防晒剂）列表中，同样限量25%。\n\n'
            '二、防护波段对比\n'
            '氧化锌（ZnO）：\n'
            '- 防护范围：UVA（320-400nm）和UVB（290-320nm），宽谱防护\n'
            '- UVA 防护优势：对UVA1（340-400nm）防护明显优于TiO₂，是宣称"广谱防护"的关键\n'
            '- 峰值吸收：约 360-370nm（UVA2区域）\n'
            '- 粒径影响：纳米级ZnO（<100nm）透明度高但需评估安全性；微米级ZnO白色可见\n\n'
            '二氧化钛（TiO₂）：\n'
            '- 防护范围：主要防护UVB（290-320nm）和UVA2（320-340nm）\n'
            '- UVA1 防护弱：对UVA1（>340nm）防护作用有限\n'
            '- 峰值吸收：约 300-320nm（UVB区域）\n'
            '- 折射率高（约2.6），物理遮盖效果好，常用于高SPF产品\n\n'
            '三、协同配伍\n'
            '两者复配可实现互补：TiO₂贡献高SPF，ZnO补充UVA1防护。\n'
            '复配比例参考：TiO₂:ZnO = 1:1 至 2:1（质量比）可同时保证SPF和PA值。\n\n'
            '四、纳米材料监管\n'
            '中国：《化妆品新原料注册备案资料管理规定》要求纳米材料须单独评估。\n'
            'EU：纳米形式须在成分表中标注"[nano]"，并在上市前通知欧盟委员会。\n\n'
            '五、检测方法\n'
            'SPF体内测定（ISO 24444），PA值（ISO 24442），UVA/UVB 体外测定（ISO 24443）。'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='reg:sunscreen-zno-tio2-comparison',
        namespace='regulations',
        tags=['防晒剂', '氧化锌', '二氧化钛', 'ZnO', 'TiO2', 'UVA', 'UVB', '广谱防护', '无机防晒'],
        properties={'source_url': 'https://www.nmpa.gov.cn'},
    ),
    RawKnowledgeInput(
        title='特殊化妆品新功效宣称注册路径：从临床到上市全流程',
        content=(
            '特殊化妆品（新功效）注册全流程指南\n\n'
            '一、"新功效"的定义\n'
            '根据《化妆品监督管理条例》第17条：除传统特殊化妆品类别（染发、烫发、祛斑美白、'
            '防晒、防脱发）外，若宣称以往未见的新功效（如"改善皮肤屏障"、"促进胶原蛋白生成"），'
            '须按特殊化妆品注册。\n\n'
            '二、注册申请材料清单\n'
            '1. 研究资料：\n'
            '   - 产品配方（含所有原料的安全评估资料）\n'
            '   - 生产工艺（含关键步骤说明）\n'
            '   - 产品执行标准（质量指标、检验方法）\n'
            '2. 安全评估资料：\n'
            '   - 毒理学试验报告（刺激性、致敏性、遗传毒性等，视原料而定）\n'
            '   - 安全评估报告（由注册化妆品安全评估师签署）\n'
            '3. 功效评价资料（核心，区别于普通化妆品）：\n'
            '   - 人体功效评价报告（随机对照试验或自身对照设计，至少30例）\n'
            '   - 统计分析报告（须有统计学意义，p<0.05）\n'
            '   - 功效成分依据（文献综述、体外机制研究）\n'
            '4. 标签样稿（须符合《化妆品标签管理办法》）\n'
            '5. 检验报告（卫生学、理化、微生物）\n\n'
            '三、审评时间线\n'
            '- 受理：5个工作日\n'
            '- 形式审查：30个工作日\n'
            '- 实质审查：90个工作日（可延长30天）\n'
            '- 补充资料：申请人须在60天内完成补充\n'
            '- 通常总耗时：6-18个月（视复杂程度）\n\n'
            '四、常见被退回原因\n'
            '- 功效评价样本量不足（<30例）\n'
            '- 缺乏阳性对照（无法证明效果优于基线）\n'
            '- 统计方法不当（未正确处理缺失数据、未做多重比较校正）\n'
            '- 功效成分与宣称功效的机制关联证据不足\n'
            '- 受试者入排标准与目标人群不一致'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='reg:special-cosm-new-efficacy-registration',
        namespace='regulations',
        tags=['特殊化妆品', '新功效', '注册路径', 'NMPA', '功效评价', '临床数据', '申请材料'],
        properties={'source_url': 'https://www.nmpa.gov.cn'},
    ),
    RawKnowledgeInput(
        title='ICH E3 临床研究报告结构：化妆品功效评价报告的规范化写作',
        content=(
            'ICH E3 临床研究报告（CSR）结构规范\n\n'
            '一、概述\n'
            'ICH E3 规定了临床研究报告的标准化结构，化妆品功效评价报告参照执行，'
            '以提高报告质量和可审查性。\n\n'
            '二、标准报告结构（16个章节）\n'
            '1. 封面页（研究编号、产品名称、受试者数量、研究日期、机构信息）\n'
            '2. 目录\n'
            '3. 研究摘要（≤250字，含主要发现）\n'
            '4. 背景与研究目的（科学依据、产品描述、目的和假设）\n'
            '5. 研究方案\n'
            '   - 受试者入排标准\n'
            '   - 研究设计（随机/非随机、对照、双盲/单盲/开放）\n'
            '   - 主要终点和次要终点定义\n'
            '   - 样本量计算（须提供假设、α值、β值、MCID）\n'
            '6. 受试者信息\n'
            '   - 筛查/入组/完成/脱落人数（CONSORT流程图）\n'
            '   - 基线人口学特征（年龄、性别、皮肤类型）\n'
            '7. 功效评价结果（主要终点、次要终点，含统计分析）\n'
            '8. 安全性评估（不良事件记录和分类）\n'
            '9. 统计分析方法（检验水准、分析人群、缺失值处理）\n'
            '10. 结论（基于统计结果的科学陈述，不夸大）\n'
            '附件：原始数据、检测仪器校准记录、伦理批件、知情同意书样本\n\n'
            '三、化妆品报告特殊注意事项\n'
            '- 统计显著 ≠ 临床/消费者相关意义：须同时报告效应量（Cohen\'s d 或 % 变化）\n'
            '- 主观评估：评分员须经标准化培训，报告评分者间一致性（κ系数）\n'
            '- 仪器测量：每次测量须记录校准状态，温湿度环境条件须记录\n'
            '- 数据完整性声明：报告须声明"数据未经修改，与原始记录一致"'
        ),
        entry_type='regulation',
        source_type='ich_import',
        source_key='reg:ich-e3-csr-structure',
        namespace='regulations',
        tags=['ICH E3', '临床研究报告', 'CSR', '报告结构', '功效评价报告', '规范化写作'],
        properties={'regulation_code': 'ICH E3', 'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='化妆品儿童产品特殊监管要求（2021）：安全性与标签规范',
        content=(
            '儿童化妆品专项监管规范（2021年儿童化妆品监督管理规定）\n\n'
            '一、定义\n'
            '儿童化妆品：适用于年龄在12岁以下（含12岁）儿童，具有清洁、保湿、爽身、防晒等功效。\n\n'
            '二、安全要求（较成人更严格）\n'
            '1. 配方要求：\n'
            '   - 禁用原料：婴幼儿禁用防腐剂（如苯甲醇、MIT）；限制香精香料种类\n'
            '   - 优先选择：安全性高、低过敏风险原料\n'
            '   - 尽量不添加：香料（芳香产品除外）、着色剂（彩妆除外）、防腐剂（有替代方案时）\n'
            '2. 微生物限量：须满足更严格标准（菌落总数 ≤500 CFU/mL）\n'
            '3. 毒理学测试：须提供儿童皮肤人体安全性测试数据\n\n'
            '三、标签要求\n'
            '1. 必须标注"儿童化妆品"专属标志（小金盾标志）\n'
            '2. 须标注适用年龄范围\n'
            '3. 须标注"在成人监护下使用"\n'
            '4. 特殊提示：含特定成分须注明注意事项\n\n'
            '四、功效评价要求\n'
            '- 儿童防晒产品：须提供儿童受试者的人体功效评价数据（不得用成人数据代替）\n'
            '- 温和性宣称：须提供皮肤刺激性/过敏性测试数据\n'
            '- 注意：儿童受试者招募须额外的伦理审查和家长/监护人知情同意'
        ),
        entry_type='regulation',
        source_type='nmpa_import',
        source_key='reg:childrens-cosmetics-2021',
        namespace='regulations',
        tags=['儿童化妆品', '儿童用品', '安全规范', '标签', 'NMPA', '2021监管', '小金盾'],
        properties={'regulation_code': '儿童化妆品监督管理规定2021', 'year': 2021},
    ),
    RawKnowledgeInput(
        title='欧盟化妆品法规（EC No 1223/2009）：与中国NMPA法规的主要差异',
        content=(
            '欧盟化妆品法规（Regulation (EC) No 1223/2009）与中国监管对比\n\n'
            '一、欧盟主要框架\n'
            '- 监管机构：欧盟委员会（European Commission）负责立法；各成员国负责执法\n'
            '- 市场准入：负责人（Responsible Person, RP）制度，上市前通知（CPNP备案）\n'
            '- 主要文件：产品信息文件（PIF），包含：配方、GMP证明、安全评估报告、\n'
            '  功效宣称文件、毒理学摘要\n\n'
            '二、与中国监管的主要差异\n'
            '| 方面 | 中国（NMPA） | 欧盟（EU 1223/2009） |\n'
            '|---|---|---|\n'
            '| 审批制度 | 特殊化妆品注册（行政审批）；普通化妆品备案 | 统一备案（CPNP）无审批 |\n'
            '| 功效评价 | 特定功效须人体评价报告 | 宣称须有"可证实的"依据 |\n'
            '| 禁限用原料 | 化妆品安全技术规范附表 | Annexes II-VI |\n'
            '| 安全评估 | 注册化妆品安全评估师 | Cosmetic Safety Assessor（注册师制度更松） |\n'
            '| 防晒SPF | 须体内测定（ISO 24444） | 推荐COLIPA方法，须标注等级 |\n'
            '| 纳米材料 | 单独评估，注册备案 | 上市前6个月通知，标注[nano] |\n\n'
            '三、中国出口欧盟注意事项\n'
            '- 须在欧盟成员国内设立Responsible Person（可委托欧盟合规服务商）\n'
            '- 配方须符合欧盟禁限用原料清单（差异化原料须逐一核查）\n'
            '- CPNP备案须在上市前完成\n'
            '- 欧盟不认可中国CMA/CNAS报告，须欧盟认可实验室重新检测（或互认协议下除外）\n\n'
            '四、全球最新动态\n'
            '- 英国脱欧后：须单独向英国OPSS备案（SCPN）\n'
            '- 美国：FD&C Act修订（MoCRA, 2022）要求化妆品企业向FDA注册'
        ),
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='reg:eu-vs-cn-cosmetics-regulation',
        namespace='regulations',
        tags=['欧盟法规', 'EC 1223/2009', '中欧对比', 'CPNP', 'RP', '出口合规', '全球监管'],
        properties={'source_url': 'https://eur-lex.europa.eu'},
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 二、功效评价方法学专项（METHODOLOGY DOMAIN）
# 目标：覆盖评价设计、统计方法、路径选择、报告规范的完整体系
# ══════════════════════════════════════════════════════════════════════════════

METHODOLOGY_CORPUS = [
    RawKnowledgeInput(
        title='保湿功效完整评价体系：多维度终点与标准化操作流程',
        content=(
            '化妆品保湿功效评价标准化操作体系\n\n'
            '一、评价维度（主要终点+次要终点）\n'
            '主要终点（须用于样本量计算）：\n'
            '- 皮肤水合度（Corneometer）：角质层含水量，AU值变化量\n'
            '- TEWL（Tewameter）：经皮水分散失，g/m²/h 变化量（用于屏障修护宣称）\n\n'
            '次要终点（辅助支持功效宣称）：\n'
            '- 皮肤纹理/粗糙度（PRIMOS或Visiometer）：Ra、Rz参数\n'
            '- 皮肤弹性（Cutometer）：R2弹性恢复率\n'
            '- 主观感受（VAS评分）：受试者自评"皮肤保湿感"、"紧绷感"缓解\n'
            '- 皮肤外观照片（标准化摄影）\n\n'
            '二、研究设计规范\n'
            '1. 单用产品保湿评价（最常见）：\n'
            '   - 设计：随机、双盲、安慰剂对照、半脸或双臂对照\n'
            '   - 样本量：参考历史SD（Corneometer通常SD≈10-15 AU，MCID≈5 AU），\n'
            '     α=0.05，β=0.20，约需33例/组（含10%脱落率约37例）\n'
            '   - 时间点：基线、使用后4周、8周（最常见）\n\n'
            '2. 保湿持效评价（即时+持续）：\n'
            '   - 额外时间点：使用后0.5h、1h、2h、4h、8h\n'
            '   - 用于宣称"X小时保湿持续"\n\n'
            '三、测量操作 SOP（标准化环境要求）\n'
            '- 环境控制：温度 20±2℃，相对湿度 40-60% RH，无风\n'
            '- 适应期：受试者入室后静坐 20-30 分钟后开始测量\n'
            '- 每个测量位点：测 3 次，取平均值（Corneometer）\n'
            '- 测量顺序：先非侵入性，后侵入性（或有刺激性）\n'
            '- 受试者限制：测量前 1 小时禁止涂抹任何护肤品\n\n'
            '四、数据分析\n'
            '- 分析集定义：FAS（全分析集）= 随机化后至少使用过一次的受试者\n'
            '- 统计方法：配对t检验（正态数据）或Wilcoxon符号秩检验（非正态/n<30）\n'
            '- 报告格式：基线均值±SD，治疗后均值±SD，变化值（95%CI），p值\n'
            '- 临床意义：报告 Cohen\'s d（d>0.5 为中等效应，d>0.8 为大效应）'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:moisturizing-eval-complete-system',
        namespace='methodology',
        tags=['保湿', '功效评价', 'Corneometer', 'TEWL', '研究设计', '样本量', '统计分析', '操作规范'],
        properties={'source_url': 'https://www.iso.org/standard/'},
    ),
    RawKnowledgeInput(
        title='美白祛斑功效评价完整方法：VISIA、Mexameter、Colorimeter联合应用',
        content=(
            '化妆品美白/祛斑功效评价体系（针对中国NMPA注册要求）\n\n'
            '一、仪器评价方法\n'
            '1. Mexameter MX18（黑色素指数 MI）：\n'
            '   - 测量波长：660nm/880nm 测黑色素（排除血红蛋白干扰）\n'
            '   - 评价维度：整体肤色均匀性，黑色素生成抑制\n'
            '   - 检测点选择：全脸（5个标准点）+ 局部色斑区域\n\n'
            '2. Colorimeter（如 Chromameter CM-400d）：\n'
            '   - 测量参数：CIE L*a*b* 色彩空间\n'
            '   - L* 值（明度）：越高越白；主要关注指标\n'
            '   - ITA° (Individual Typology Angle)：反映个体皮肤底色类型\n'
            '   - ΔL* > 2 通常认为具有临床意义\n\n'
            '3. VISIA 多光谱成像系统（Canfield Scientific）：\n'
            '   - 三种光源：\n'
            '     标准白光（Standard Light）：记录可见光色斑、纹理\n'
            '     跨偏振光（Cross-Polarized Light）：消除表面反光，显示深层色斑\n'
            '     UV 荧光（UV Light, 365nm）：显示日光性色素、角质层厚度\n'
            '   - 输出参数：色斑分数（Spots）、紫外斑（UV Spots）、红斑（Pores）、纹理\n\n'
            '二、临床评估方法\n'
            '- 皮肤科医生视觉评估：IGA（研究者整体评分，0-4分）\n'
            '- 标准化摄影：色温5500K，D65光源，固定拍摄角度（正面、45°侧面）\n'
            '- 受试者自评问卷：IGA自我评分，消费者满意度\n\n'
            '三、美白研究设计要点\n'
            '- 受试者条件：Fitzpatrick皮肤类型III-IV（亚洲人最常见），无活动性皮肤病\n'
            '- 试验周期：美白功效评价通常需要 8-12 周（细胞周期约28天，须覆盖2-3个周期）\n'
            '- 对照设计：必须设置安慰剂/空白基质对照（双盲）\n'
            '- 防晒措施：试验期间所有受试者统一使用SPF30+防晒产品（控制混杂因素）\n\n'
            '四、NMPA备案要求\n'
            '美白宣称须提交：多仪器检测报告（至少Mexameter或Colorimeter）+ 皮肤科医生评估 + 受试者自评'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:whitening-eval-complete',
        namespace='methodology',
        tags=['美白', '祛斑', 'VISIA', 'Mexameter', 'Colorimeter', '黑色素', 'L*值', '功效评价'],
        properties={'source_url': 'https://www.iso.org/standard/'},
    ),
    RawKnowledgeInput(
        title='抗衰老/抗皱功效评价：Cutometer、Reviscometer与PRIMOS综合应用',
        content=(
            '化妆品抗衰老/抗皱功效评价方法体系\n\n'
            '一、皮肤弹性评价（Cutometer MPA 580）\n'
            '核心参数（用于抗衰老宣称）：\n'
            '- R2 = Ua/Uf（总弹性恢复率）：最常用，值越高皮肤弹性越好，范围0-1\n'
            '  正常值（20-30岁）：约 0.65-0.75；老化皮肤通常 <0.55\n'
            '- R5 = Ur/Ue（净弹性）：排除粘弹性成分的纯弹性恢复率\n'
            '- R7 = Ur/Uf（弹性比率）：与R2含义相似但计算方式不同\n'
            '- Uf（最大形变量）：反映皮肤整体可变形能力（与紧致度负相关）\n\n'
            '二、皮肤纹理/皱纹评价（PRIMOS 或 Visiometer SV600）\n'
            '测量参数：\n'
            '- Ra（算术平均粗糙度）：轮廓的平均偏差\n'
            '- Rz（最大峰谷高度）：最高峰与最深谷的平均差值，对皱纹深度敏感\n'
            '- Rmax（最大粗糙度）：单次测量最大峰谷差，用于评估深皱纹\n'
            '适用场景：评价眼角、额头、鼻唇沟皱纹深度变化。Rz减少 >10% 有统计意义。\n\n'
            '三、皮肤黏弹性（Reviscometer RVM 600）\n'
            '原理：声波传播时间（Resonance Running Time, RRT），反映皮肤的各向异性。\n'
            '用途：评估皮肤内在张力（皮肤"支撑力"），与弹性纤维状态相关。\n\n'
            '四、标准化摄影（高分辨率3D成像）\n'
            '- VISIA 3D 系统：全脸三维成像，客观记录皱纹面积、深度\n'
            '- Antera 3D：高精度皮肤纹理分析\n\n'
            '五、抗皱研究设计\n'
            '- 样本量：通常 n=40-60（Cutometer R2 SD≈0.05，MCID≈0.03，单侧t检验）\n'
            '- 周期：12-24 周（胶原蛋白生成需要时间，短于 8 周通常无意义）\n'
            '- 测量部位：鱼尾纹（眼角）最常用，因个体差异小\n'
            '- 主要终点建议：Cutometer R2（客观仪器，说服力强）'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:antiaging-eval-complete',
        namespace='methodology',
        tags=['抗衰老', '抗皱', 'Cutometer', 'PRIMOS', 'Reviscometer', '皮肤弹性', 'R2', '皱纹评价'],
    ),
    RawKnowledgeInput(
        title='防晒功效体内测定（ISO 24444）与体外UVA防护测定（ISO 24442）完整操作规范',
        content=(
            '防晒功效评价双标准：ISO 24444（SPF体内）+ ISO 24442（UVA体内）\n\n'
            '一、ISO 24444:2022 SPF体内测定\n'
            '1. 核心要求\n'
            '   - 样品涂抹量：2 mg/cm²（精确到±0.02 g/cm²）\n'
            '   - 测试部积：每个样品至少 35 cm²，用于照射 5 个测试点\n'
            '   - 受试者数量：≥10 人（国内检测机构通常 10-20 人）\n'
            '   - 皮肤类型：Fitzpatrick I-III 型（敏感/白皙人群，MED较低）\n\n'
            '2. 测试流程\n'
            '   a. 背部标记测试区域（每人2个产品测试区 + 1个空白对照区）\n'
            '   b. 准确称量并涂抹样品（30秒内均匀涂开，指尖按摩）\n'
            '   c. 等待 15 分钟（样品充分铺展）\n'
            '   d. 日光模拟光源照射（不同剂量），等待 16-24 小时\n'
            '   e. 读取最小红斑量（MED）：SPF = MED(涂抹)/MED(空白)\n\n'
            '3. 质量控制\n'
            '   - 操作员培训：须定期用 P3 参考防晒品校核（SPF=4.47±0.15）\n'
            '   - 实验室间差异：SPF≤8 时，CV≤15%；SPF>8 时，CV≤17%\n\n'
            '二、ISO 24442:2022 UVA体内防护测定（PPD法）\n'
            '1. 原理：最小持续色素沉着量（MPPD）比值 = PA值依据\n'
            '2. 涂抹量：同 ISO 24444，2 mg/cm²\n'
            '3. PA等级（中国标准）：\n'
            '   PA+：UVA-PF ≥2 且 <4\n'
            '   PA++：UVA-PF ≥4 且 <8\n'
            '   PA+++：UVA-PF ≥8 且 <16\n'
            '   PA++++：UVA-PF ≥16\n\n'
            '三、体外UVA测定（ISO 24443：无需受试者）\n'
            '原理：分光光度法测量防晒膜的紫外透射率\n'
            '适用：辅助验证广谱防护（UVA/UVB比值）；不能替代体内PPD测定\n\n'
            '四、中国监管要求\n'
            '- 防晒化妆品须注明"SPF"值和"PA"等级（特殊化妆品注册必备）\n'
            '- 防晒测试机构须具备CMA资质'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:sunscreen-spf-uva-complete',
        namespace='methodology',
        tags=['防晒', 'SPF', 'ISO 24444', 'ISO 24442', 'UVA防护', 'PPD', 'PA值', '体内测定', '操作规范'],
        properties={'source_url': 'https://www.iso.org/standard/'},
    ),
    RawKnowledgeInput(
        title='统计分析计划（SAP）：编制时机、核心内容与修订规则',
        content=(
            '统计分析计划（Statistical Analysis Plan, SAP）编制规范\n\n'
            '一、SAP 完成时机（关键合规要求）\n'
            '原则：SAP 必须在任何揭盲（unblinding）或数据库锁定（database lock）之前完成并锁定。\n\n'
            '推荐时机（按研究阶段）：\n'
            '1. 理想时机：方案定稿（Protocol Final Version）后，受试者入组前\n'
            '2. 可接受时机：最后一例受试者最后一次访视后，数据清洁期间，揭盲前\n'
            '3. 不可接受：揭盲后或数据分析过程中"补写"SAP（视为数据挖掘，GCP违规）\n\n'
            '为什么必须提前：防止"选择性报告"（Selective Reporting），是ICH E9和FDA要求的数据完整性核心。\n\n'
            '二、SAP 核心内容\n'
            '1. 分析人群定义：\n'
            '   - 全分析集（FAS/ITT）：随机化后至少接受一次治疗\n'
            '   - 符合方案集（PP）：严格依从方案的受试者\n'
            '   - 安全集（SS）：至少接受一次治疗并有安全性评估\n\n'
            '2. 主要终点分析方法：\n'
            '   - 检验类型（单侧/双侧）和显著水平α\n'
            '   - 统计检验方法（t检验/Wilcoxon/混合线性模型）\n'
            '   - 协变量调整（如：年龄、皮肤类型、基线值）\n\n'
            '3. 缺失数据处理策略：\n'
            '   - LOCF（最后观测值结转）/ BOCF / 多重插补（MI）\n'
            '   - 选择须有统计学依据\n\n'
            '4. 多重比较校正：\n'
            '   - 多个主要终点时须预先指定多重性控制策略\n'
            '   - 常用：Bonferroni / Holm / Hochberg / Fixed Sequence\n\n'
            '5. 敏感性分析：\n'
            '   - 用PP集分析验证FAS结果一致性\n'
            '   - 不同缺失数据处理方法下的稳健性检验\n\n'
            '三、SAP 修订规则\n'
            '揭盲前修订：允许，须记录修订版本号和原因（在SAP中留痕）\n'
            '揭盲后修订：原则上不允许；若确需修订，须申办方书面批准并在报告中明确说明偏离'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:statistical-analysis-plan-sap',
        namespace='methodology',
        tags=['统计分析计划', 'SAP', '揭盲', '数据库锁定', '多重比较', '缺失数据', 'FAS', 'ITT', 'GCP'],
        properties={'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='效应量（Effect Size）与临床意义评估：Cohen\'s d在化妆品研究的应用',
        content=(
            '效应量（Effect Size）在化妆品功效评价中的解读与应用\n\n'
            '一、为什么效应量比p值更重要\n'
            '统计显著性（p<0.05）只说明效果"存在"，不说明效果"有多大"。\n'
            '大样本即使微小差异也会统计显著；小样本即使明显差异也可能不显著。\n'
            '效应量量化了"实际差异的大小"，是临床/消费者意义的更好指标。\n\n'
            '二、Cohen\'s d 计算与解读\n'
            '公式：d = (M₁ - M₂) / SD_pooled\n'
            '解读标准（Cohen, 1988）：\n'
            '- d < 0.2：微小效应（可忽略）\n'
            '- d = 0.2-0.5：小效应（消费者感知困难）\n'
            '- d = 0.5-0.8：中等效应（有实际意义，推荐门槛）\n'
            '- d > 0.8：大效应（明显可感知）\n\n'
            '三、在化妆品功效评价中的具体应用\n'
            '1. 保湿（Corneometer）：\n'
            '   典型值：d≈0.6-1.2（优质保湿产品）\n'
            '   宣称建议：d>0.5 为"改善保湿"；d>0.8 为"显著提升保湿"\n\n'
            '2. 美白（Mexameter MI 变化）：\n'
            '   典型值：d≈0.3-0.7（12周研究）\n'
            '   d<0.3 的美白产品宣称须谨慎\n\n'
            '3. 抗皱（Cutometer R2）：\n'
            '   典型值：d≈0.4-0.6（24周研究）\n'
            '   R2 绝对值变化 >0.03 且 d>0.5 才具有临床意义\n\n'
            '四、其他常用效应量指标\n'
            '- Hedges\' g：小样本校正版的 Cohen\'s d（n<20时推荐）\n'
            '- η²（Eta-squared）：ANOVA中的效应量（η²>0.14为大效应）\n'
            '- 百分比变化（%Change）：直观但受基线值影响，须与统计量同时报告\n\n'
            '五、功效评价报告的效应量报告规范\n'
            '- 须同时报告：均值差（MD）、95%CI、p值、Cohen\'s d（或等效效应量）\n'
            '- NMPA和ICH E9(R1)均要求提供"临床意义"评估，效应量是核心依据'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:effect-size-cohens-d',
        namespace='methodology',
        tags=['效应量', "Cohen's d", '临床意义', '统计显著性', '功效评价', 'p值', '保湿', '美白'],
    ),
    RawKnowledgeInput(
        title='化妆品研究受试者招募标准：入排标准设计与常见问题',
        content=(
            '化妆品功效评价受试者招募与入排标准设计指南\n\n'
            '一、标准入组标准（Inclusion Criteria）\n'
            '通用标准：\n'
            '- 年龄：18-65岁（儿童产品除外）\n'
            '- 性别：视宣称而定（通用护肤品通常女性为主，或男女均纳入）\n'
            '- Fitzpatrick皮肤分型：根据产品适用人群（美白研究：III-IV型；防晒：I-III型）\n'
            '- 知情同意：自愿参加，签署知情同意书\n'
            '- 健康皮肤：测试部位无活动性皮肤病、无明显色素异常\n\n'
            '功效特异性标准：\n'
            '- 保湿功效：皮肤偏干或正常（Corneometer < 40 AU，或主观感觉"皮肤干燥"）\n'
            '- 美白功效：有黄褐斑/色斑者（Mexameter MI > 250，或VISIA色斑评分较高）\n'
            '- 抗皱功效：中度皱纹（Glogau II-III级，或Cutometer R2 < 0.60）\n\n'
            '二、标准排除标准（Exclusion Criteria）\n'
            '通用排除：\n'
            '- 受试部位有任何皮肤病（湿疹、银屑病、痤疮重度等）\n'
            '- 妊娠、哺乳期女性\n'
            '- 对任何化妆品原料已知过敏\n'
            '- 过去 4 周使用过含激素产品\n'
            '- 过去 4 周进行过皮肤美容治疗（激光、化学换肤等）\n'
            '- 参与其他研究中（药物研究须有washout期）\n'
            '- 吸烟（影响皮肤微循环，通常排除抗氧化/抗衰研究）\n'
            '- 皮肤纹身或瘢痕在测试部位\n\n'
            '三、样本量与脱落率\n'
            '- 通常预设 10-15% 脱落率，实际入组人数 = 计算样本量 / (1 - 脱落率)\n'
            '- 脱落原因须记录，脱落受试者的最后一次数据通常纳入FAS分析（LOCF）\n\n'
            '四、常见设计错误\n'
            '- 入排标准过于宽泛：导致异质性大，统计效能低\n'
            '- 入排标准过于严格：招募困难，外部有效性差\n'
            '- 未设置washout期：前期用药影响基线数据'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:subject-inclusion-exclusion-criteria',
        namespace='methodology',
        tags=['受试者招募', '入组标准', '排除标准', '功效评价', 'Fitzpatrick', '样本量', '脱落率'],
    ),
    RawKnowledgeInput(
        title='化妆品功效评价研究设计：随机化、盲法与对照设计全解',
        content=(
            '化妆品功效评价研究设计方法论\n\n'
            '一、随机化设计（Randomization）\n'
            '1. 简单随机化：电脑生成随机数，适合样本量>100的研究\n'
            '2. 区组随机化（Block Randomization）：每N人一组，确保组间均衡\n'
            '   化妆品研究常用区块大小 4 或 6\n'
            '3. 分层随机化：按年龄、皮肤类型、基线严重程度等分层后再随机\n'
            '   推荐用于多中心研究或异质性高的样本\n'
            '4. 自身对照（半脸/左右臂）：受试者两侧分别用测试品和对照品\n'
            '   优势：消除个体间差异，大幅减少样本量需求（通常可减少50%）\n\n'
            '二、盲法设计（Blinding）\n'
            '- 双盲（Double-Blind）：受试者和研究者均不知道分组（金标准）\n'
            '  化妆品挑战：气味、质地可能破盲\n'
            '  应对：匹配基质对照（气味、颜色、稠度相似的安慰剂）\n'
            '- 单盲（Single-Blind）：受试者不知，研究者知（用于仪器客观评估时可接受）\n'
            '- 开放标签（Open-Label）：双方均知，仅用于探索性研究或无法盲法设计的情况\n\n'
            '三、对照设计\n'
            '1. 安慰剂对照（不含活性成分的基质）：\n'
            '   验证产品效果归因于活性成分，而非基质或心理效应\n'
            '2. 阳性对照（已上市有效产品）：\n'
            '   用于非劣效性或优效性设计，证明新产品不劣于/优于市售标准品\n'
            '3. 空白对照（不治疗）：\n'
            '   排除"时间效应"（季节变化、皮肤自然改善），适合长期研究\n\n'
            '四、研究类型选择指南\n'
            '| 情况 | 推荐设计 |\n'
            '|---|---|\n'
            '| 保湿/美白注册 | 随机双盲安慰剂对照，半脸设计 |\n'
            '| 防晒SPF测定 | ISO 24444，无须随机化 |\n'
            '| 新成分探索 | 开放标签，小样本（n=20-30） |\n'
            '| 对比竞品 | 随机双盲，阳性对照非劣效性 |\n'
            '| 消费者真实感受 | 无对照，大样本（n≥100），自我评估 |'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:study-design-randomization-blinding',
        namespace='methodology',
        tags=['随机化', '盲法', '对照设计', '研究设计', '功效评价', '半脸对照', '双盲'],
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 三、皮肤检测仪器专项（INSTRUMENT DOMAIN）
# 目标：每台仪器详细的原理、规格、操作、参数解读和常见错误
# ══════════════════════════════════════════════════════════════════════════════

INSTRUMENT_CORPUS = [
    RawKnowledgeInput(
        title='Corneometer CM825深度指南：原理、操作规范与常见测量误差',
        content=(
            'Courage+Khazaka Corneometer CM825 完整技术指南\n\n'
            '一、测量原理\n'
            '基于电容测量（Capacitance Measurement）：\n'
            '皮肤角质层含水量变化会改变其介电常数（dielectric constant/permittivity）。\n'
            '水的介电常数（ε≈80）远高于干燥角质细胞（ε≈3-8），因此含水量↑ → 电容↑ → Corneometer值↑。\n'
            '测头频率：约 1 MHz（射频范围）\n'
            '测量深度：角质层表层约 10-20 μm（极浅层测量）\n\n'
            '二、量程与临床参考值\n'
            '- 量程：0-120 AU（任意单位，Arbitrary Units）\n'
            '- 正常水合皮肤：40-70 AU\n'
            '- 偏干皮肤：30-40 AU\n'
            '- 干燥皮肤：< 30 AU（皮肤屏障损伤，如特应性皮炎）\n'
            '- 过度水化（如泡水后）：> 70 AU\n\n'
            '三、标准化操作 SOP\n'
            '环境要求：\n'
            '- 温度：20±2°C（不符合须记录并报告）\n'
            '- 相对湿度：40-60% RH（<40% 皮肤过干；>60% 皮肤过湿，数据不稳定）\n'
            '- 禁止空调/风扇直吹测量部位\n\n'
            '受试者准备：\n'
            '- 入室后静坐 15-30 分钟适应环境（关键步骤！）\n'
            '- 测量前 1 小时禁止涂抹任何产品\n'
            '- 测量前用温水清洗测量部位，等待 30 分钟\n\n'
            '测量操作：\n'
            '- 每个位点连续测量 3 次，取平均值\n'
            '- 测头须垂直皮肤表面，轻压（不可过重，否则影响皮肤循环）\n'
            '- 每次测量间隔约 5 秒\n\n'
            '四、常见误差与避免方法\n'
            '- 汗液污染：温度高时汗液导致值偏高，须保持测量室凉爽\n'
            '- 产品残留：前次产品未清洗干净，须有足够 washout 期\n'
            '- 测头污染：须用酒精棉定期清洁测头\n'
            '- 仪器漂移：每日须用仪器自带的标准板（reference plate）校准'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:corneometer-cm825-full-guide',
        namespace='instruments',
        tags=['Corneometer', 'CM825', '皮肤水合', '电容测量', '介电常数', '操作规范', 'C+K'],
    ),
    RawKnowledgeInput(
        title='Tewameter TM300与Vapometer：TEWL测量原理对比及操作规范',
        content=(
            'TEWL（经皮水分散失）测量仪器完整指南\n\n'
            '一、Tewameter TM300（开放腔室法，Open Chamber）\n'
            '原理：基于 Fick 扩散定律，测量开放腔室内水蒸气的浓度梯度（dC/dx）。\n'
            '  TEWL = -D × A × dC/dx\n'
            '  其中 D = 水蒸气扩散系数（1.126×10⁻⁵ m²/s），A = 测量面积\n'
            '传感器：两组温度+湿度传感器，位于腔内不同高度，测量梯度\n'
            '量程：0-200 g/m²/h\n'
            '正常皮肤 TEWL：5-10 g/m²/h\n'
            '皮肤屏障受损（如特应性皮炎）：可达 40-100 g/m²/h\n'
            '优势：快速（约 30 秒稳定读数），测量真实皮肤状态\n'
            '劣势：对气流极敏感，须在密闭检测室进行；环境湿度变化影响大\n\n'
            '二、Vapometer SWL-3000（密封腔室法，Closed/Sealed Chamber）\n'
            '原理：将密封腔压贴皮肤，测量腔内湿度随时间的增加速率（Δ湿度/Δ时间）。\n'
            '量程：0-150 g/m²/h\n'
            '优势：不受外界气流影响，稳定性好；适合临床/非受控环境\n'
            '劣势：测量时间较长（约 90 秒）；密封腔可能引起局部微气候变化\n\n'
            '三、两种方法的测量结果差异\n'
            '- 相关性高（r>0.9），但 Vapometer 值通常略低于 Tewameter\n'
            '- 发表研究须注明使用方法，不可直接比较两种方法的绝对值\n\n'
            '四、标准化操作 SOP\n'
            '环境：与 Corneometer 相同（20±2°C，40-60% RH），受试者适应 20-30 分钟\n'
            '稳定时间：等待读数稳定后再记录（Tewameter 至少等待 30 秒后取平均）\n'
            '测量次数：每位点 3 次，取平均\n'
            '注意：皮肤有伤口/破损时禁止测量（感染风险）'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:tewameter-vapometer-tewl',
        namespace='instruments',
        tags=['Tewameter', 'Vapometer', 'TEWL', '经皮水分散失', 'Fick扩散定律', '皮肤屏障', 'TM300'],
    ),
    RawKnowledgeInput(
        title='Mexameter MX18技术规格：黑色素与血红素的光谱测量原理',
        content=(
            'Mexameter MX18 完整技术规格与临床应用\n\n'
            '一、光谱测量原理\n'
            'Mexameter 使用四种特定波长的 LED 进行反射光谱测量：\n\n'
            '黑色素测量组（Melanin Channel）：\n'
            '- 660 nm（红光）：黑色素的吸收峰之一\n'
            '- 880 nm（近红外光）：参考波长（对黑色素和血红蛋白均不敏感，用于校正皮肤散射）\n'
            '计算：MI（黑色素指数）= -log(R₈₈₀/R₆₆₀)\n\n'
            '红斑/血红素测量组（Erythema Channel）：\n'
            '- 568 nm（绿光）：血红蛋白（氧合/脱氧）的特征吸收峰；对黑色素也有吸收\n'
            '- 660 nm（红光）：参考波长（血红蛋白吸收低）\n'
            '计算：EI（血红素指数/红斑指数）= -log(R₆₆₀/R₅₆₈)\n\n'
            '二、技术规格\n'
            '- 测量范围：黑色素指数 0-999 AU；血红素指数 0-999 AU\n'
            '- 测量探头直径：2 mm（与 Corneometer 相同尺寸）\n'
            '- 光源类型：LED（长寿命，稳定性高于卤素灯）\n'
            '- 测量时间：< 1 秒\n'
            '- 校准：每日须用标准白板（白色参考瓷砖）校准\n\n'
            '三、临床应用与参考值\n'
            '黑色素指数（MI）：\n'
            '- 白皙皮肤（Fitzpatrick I-II）：约 150-200\n'
            '- 中等肤色（Fitzpatrick III-IV）：约 200-350\n'
            '- 深色皮肤（Fitzpatrick V-VI）：约 350-500\n'
            '美白研究：治疗后 MI 变化 ΔMI > 10 通常认为有临床意义\n\n'
            '红斑指数（EI）：\n'
            '- 正常皮肤：50-200（个体差异大）\n'
            '- 刺激性皮肤反应：EI > 300\n'
            '- 用途：皮肤刺激性测试（HRIPT、RIPT），活性成分安全性评估\n\n'
            '四、常见测量误差\n'
            '- 太阳晒黑影响：须在研究期间控制日照暴露（统一使用 SPF30+ 防晒）\n'
            '- 皮肤充血：情绪激动、过热后 EI 偏高；须充分适应环境后测量'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:mexameter-mx18-full-guide',
        namespace='instruments',
        tags=['Mexameter', 'MX18', '黑色素', '血红素', '568nm', '660nm', '880nm', '光谱测量', '美白评价'],
    ),
    RawKnowledgeInput(
        title='Cutometer MPA 580操作规范：负压参数设置与弹性参数完整解读',
        content=(
            'Cutometer MPA 580 完整操作指南\n\n'
            '一、测量原理\n'
            '负压吸引法（Suction-Elongation Method）：\n'
            '将探头（吸孔直径 2 mm 或 6 mm 可选）贴紧皮肤，\n'
            '施加真空负压（vacuum），皮肤被吸入探头内；\n'
            '光学系统（LED + 光电探测器）测量皮肤被吸起的垂直形变量（μm）。\n\n'
            '二、负压参数设置\n'
            '标准参数（化妆品功效研究最常用）：\n'
            '- 负压大小：450-500 mbar（适合大多数皮肤类型）\n'
            '  特殊情况：<200 mbar 用于非常敏感皮肤；>500 mbar 用于足跟等厚皮肤\n'
            '- 吸引时间（on-time）：2 秒（测量黏弹性形变）\n'
            '- 松弛时间（off-time）：2 秒（测量弹性恢复）\n'
            '- 重复次数：5-10 次循环（前 3 次为预处理，后几次稳定后取平均）\n\n'
            '三、核心弹性参数完整解读\n'
            '每次循环产生形变曲线（Strain-time curve），可提取：\n\n'
            '- Uf（最大形变，final deformation）：吸引结束时的最大位移，反映皮肤总形变能力\n'
            '- Ue（即时弹性形变，immediate elastic deformation）：施压瞬间的弹性形变\n'
            '  Ue 由弹性纤维（elastin）和胶原网络决定\n'
            '- Uv（粘弹性形变，viscoelastic deformation）= Uf - Ue，蠕变形变\n'
            '- Ur（弹性恢复，retraction）：松弛期结束时的恢复量\n'
            '- Ua（总弹性恢复，final recovery）= Uf - residual deformation\n\n'
            '重要比例参数：\n'
            '- R0 = Ue/Uf：即时弹性比（纯弹性在总形变中的占比）\n'
            '- R2 = Ua/Uf：**最常用的总弹性恢复率**（0=无弹性，1=完全弹性）\n'
            '  参考值：年轻皮肤≈0.65-0.75；老化皮肤≈0.45-0.55\n'
            '- R5 = Ur/Ue：净弹性（粘弹性校正后的真实弹性）\n'
            '- R6 = Uv/Uf：粘弹性在总形变中的占比（越高皮肤越"粘"）\n'
            '- R7 = Ur/Uf：与 R2 类似，用于特定研究方案\n\n'
            '四、部位选择与操作要点\n'
            '- 常用部位：前臂内侧（标准部位）；鱼尾纹区域（抗皱研究）\n'
            '- 探头垂直皮肤，避免毛发区域\n'
            '- 须保持皮肤张力一致（不可拉伸或放松皮肤）\n'
            '- 测量前适应环境 20 分钟'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:cutometer-mpa580-full-guide',
        namespace='instruments',
        tags=['Cutometer', 'MPA580', '皮肤弹性', 'R2', '负压', 'Ue', 'Ua', 'Uf', '弹性参数', '抗衰老'],
    ),
    RawKnowledgeInput(
        title='VISIA多光谱成像系统：三种光源应用与面部皮肤参数分析',
        content=(
            'Canfield VISIA 皮肤分析系统完整指南\n\n'
            '一、系统概述\n'
            'VISIA 是 Canfield Scientific 出品的全脸多光谱成像系统，\n'
            '结合标准摄影、跨偏振光、UV荧光三种成像模式，提供皮肤状态的综合量化评估。\n\n'
            '二、三种光源模式\n'
            '1. 标准白光（Standard Light）：\n'
            '   原理：正常可见光照明，消除阴影\n'
            '   分析内容：斑点（Spots）、皮肤纹理（Texture/Wrinkles）、孔径（Pores）\n'
            '   用途：记录肉眼可见的皮肤特征基线和变化\n\n'
            '2. 跨偏振光（Cross-Polarized Light / RBX技术）：\n'
            '   原理：发射偏振光，用交叉偏振滤镜阻挡表面反射光，\n'
            '         只记录深层皮肤散射光（穿透真皮层）\n'
            '   分析内容：\n'
            '   - 棕色斑（Brown Spots）：黑色素相关色斑（深层色素、日晒斑）\n'
            '   - 红色区域（Red Areas）：毛细血管扩张、炎症后红斑、玫瑰痤疮\n'
            '   优势：可显示肉眼尚未可见的早期色素沉着（亚临床色素）\n\n'
            '3. UV荧光（UV Fluorescence Light，365 nm）：\n'
            '   原理：短波紫外光激发皮肤中的荧光物质\n'
            '   分析内容：\n'
            '   - 紫外斑（UV Spots）：累积日照损伤，角质层厚度异常（荧光强 = 角化异常）\n'
            '   - 卟啉（Porphyrins）：痤疮丙酸杆菌代谢产物，呈现橙色荧光，与痤疮相关\n'
            '   用途：评估长期日晒损伤，预警皮肤老化趋势\n\n'
            '三、量化输出参数\n'
            '- 斑点评分（Spots Score）：0-100，越高色斑越多\n'
            '- 皱纹评分（Wrinkles Score）：0-100\n'
            '- 纹理评分（Texture Score）：0-100\n'
            '- 孔径评分（Pores Score）：0-100\n'
            '- UV斑分数（UV Spots Score）：日晒损伤累积指标\n'
            '所有评分基于数据库百分位数（与同年龄/同肤色人群比较）\n\n'
            '四、研究应用注意事项\n'
            '- 标准化拍摄：每次须固定头部位置（使用头托），室内照明统一\n'
            '- 拍摄前 1 小时清洁皮肤（去除化妆品）\n'
            '- 同一操作员或标准化程序（减少操作者间差异）\n'
            '- 适合用于美白、抗老化研究的客观图像证据'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:visia-multispectral-full-guide',
        namespace='instruments',
        tags=['VISIA', 'Canfield', '多光谱成像', '跨偏振光', 'UV荧光', '色斑', '皱纹', '皮肤分析'],
    ),
    RawKnowledgeInput(
        title='皮肤颜色测量：Colorimeter（CM-400d）与CIE L*a*b*色彩空间解读',
        content=(
            '皮肤颜色客观测量方法：分光光度计与色彩参数解读\n\n'
            '一、仪器类型\n'
            '柯尼卡美能达 Spectrophotometer CM-400d（或同类型 CM-600d）\n'
            '类型：积分球式分光光度计，测量波长 400-700 nm（全可见光谱）\n'
            '光源：脉冲氙灯，10 nm 带宽\n'
            '测量口径：8 mm（化妆品研究标准）\n\n'
            '二、CIE L*a*b* 色彩空间（CIELAB）\n'
            '国际照明委员会（CIE）定义的感知均匀色彩空间：\n\n'
            'L*（明度，Lightness）：\n'
            '- 范围：0（黑色）到 100（白色）\n'
            '- 美白研究最关键指标，ΔL* > 2 通常认为消费者可感知\n'
            '- 亚洲女性典型值：L* ≈ 55-70（Fitzpatrick III-IV）\n\n'
            'a*（红-绿轴）：\n'
            '- 正值（+a*）= 红色；负值（-a*）= 绿色\n'
            '- 红斑评价，a* 降低 = 皮肤发红减少（消炎效果）\n'
            '- 亚洲皮肤 a*：通常 5-15\n\n'
            'b*（黄-蓝轴）：\n'
            '- 正值（+b*）= 黄色；负值（-b*）= 蓝色\n'
            '- 亚洲皮肤偏黄，b* ≈ 8-20；b* 降低 = 皮肤更透亮\n\n'
            '三、ITA°（Individual Typology Angle）\n'
            '公式：ITA° = arctan[(L* - 50)/b*] × 180/π\n'
            '解读：\n'
            '- ITA° > 55°：非常白皙（very light）\n'
            '- ITA° 41-55°：白皙（light）\n'
            '- ITA° 28-41°：中等（intermediate）\n'
            '- ITA° 10-28°：棕褐色（tan）\n'
            '- ITA° < 10°：深色（dark）\n'
            '用途：标准化描述受试者皮肤类型，替代 Fitzpatrick 主观分型\n\n'
            '四、美白研究报告规范\n'
            '须同时报告：ΔL*（绝对变化）、ΔL*/L*₀（相对变化%）、统计显著性和 Cohen\'s d\n'
            'Mexameter（MI/EI）和 Colorimeter（L*a*b*）两种仪器互补，建议联合使用'
        ),
        entry_type='instrument_spec',
        source_type='manual_ingest',
        source_key='instrument:colorimeter-cielab-skin-color',
        namespace='instruments',
        tags=['Colorimeter', 'CM-400d', 'CIE L*a*b*', 'L*值', 'ITA', '皮肤颜色', '美白评价', '分光光度计'],
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 四、成分安全与功效专项（INGREDIENT DOMAIN）
# 目标：主流功效成分的机制、安全性、法规限量、相互作用的权威数据
# ══════════════════════════════════════════════════════════════════════════════

INGREDIENT_CORPUS = [
    RawKnowledgeInput(
        title='烟酰胺（Niacinamide）：美白机制、功效数据与安全性全解',
        content=(
            '烟酰胺（Niacinamide，维生素B3酰胺形式）完整成分档案\n\n'
            '一、化学基础\n'
            'INCI名称：Niacinamide；CAS：98-92-0；分子量：122.12 g/mol\n'
            '水溶性：高度水溶（250 g/L at 25°C），pH 稳定性好（5.0-8.0）\n\n'
            '二、美白作用机制（多靶点）\n'
            '1. 抑制黑素小体转移（主要机制）：\n'
            '   抑制黑色素细胞（melanocyte）向角质形成细胞（keratinocyte）的黑素小体转移，\n'
            '   而非抑制酪氨酸酶活性（这是与熊果苷的核心区别）。\n'
            '   靶点：Protease-Activated Receptor-2（PAR-2）相关信号通路\n\n'
            '2. 加速角质层更新：促进角质层代谢，加速已沉积色素的脱落\n\n'
            '3. 抗氧化保护：通过补充 NAD⁺/NADH 辅酶，增强细胞抗氧化能力，\n'
            '   减少紫外线诱导的黑色素生成\n\n'
            '4. 抗炎作用：抑制 TNF-α、IL-8 等炎症因子，减少炎症后色素沉着（PIH）\n\n'
            '三、与熊果苷（Arbutin）的机制区别\n'
            '熊果苷：直接竞争性抑制酪氨酸酶（tyrosinase），阻断黑色素合成源头。\n'
            '烟酰胺：不抑制酪氨酸酶，而是阻断合成好的黑色素从黑色素细胞转移出去。\n'
            '联合应用：两者作用于不同靶点，复配使用具有协同效果。\n\n'
            '四、临床功效数据（已发表文献）\n'
            '- 浓度：2-5%（最有效范围）\n'
            '- 典型研究结果：5% 烟酰胺，12 周，与对照组比较，Mexameter MI 降低约 15-25%，\n'
            '  L* 值提高约 1.5-3.0（多项 RCT 数据）\n'
            '- 保湿协同效应：提高神经酰胺和脂肪酸合成，增强皮肤屏障，同时改善保湿\n\n'
            '五、安全性\n'
            '- 皮肤刺激性：低，是化妆品中安全性最好的美白成分之一\n'
            '- 孕期安全性：局部使用被视为安全（无系统性吸收的安全担忧）\n'
            '- 法规限量：不在化妆品限制名单中，可自由使用（无浓度上限）\n'
            '- SCCS意见：2021年评估认为5%浓度下安全无虞\n'
            '- 注意事项：高浓度（>4%）可能在酸性pH下水解产生烟酸（niacin），\n'
            '  引起短暂潮红（flush）反应，须控制配方 pH > 6.0 或限制浓度'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:niacinamide-comprehensive',
        namespace='ingredients',
        tags=['烟酰胺', 'Niacinamide', '美白', '黑素小体', '熊果苷', '机制对比', 'PAR-2', '维生素B3'],
        properties={'cas': '98-92-0', 'inci': 'Niacinamide'},
    ),
    RawKnowledgeInput(
        title='透明质酸（Hyaluronic Acid）：分子量与功效关系的科学依据',
        content=(
            '透明质酸（Hyaluronic Acid / Sodium Hyaluronate）分子量与功效深度解析\n\n'
            '一、透明质酸基础\n'
            'INCI名称（盐形式）：Sodium Hyaluronate；CAS：9004-61-9\n'
            '化学结构：由 N-乙酰葡萄糖胺和葡萄糖醛酸重复单元组成的线性多糖\n'
            '天然存在：皮肤真皮层（1-2 mg/g组织），关节滑液，眼玻璃体\n\n'
            '二、分子量分类与皮肤功效关系\n'
            '不同分子量 HA 的皮肤渗透性和功效有本质差异：\n\n'
            '高分子量 HA（HMW-HA，1,000-2,000 kDa）：\n'
            '- 皮肤渗透：几乎不渗入角质层，停留在皮肤表面\n'
            '- 主要功效：在皮肤表面形成保湿薄膜，立即改善皮肤触感和表面水合；\n'
            '  减少水分蒸发（类似封闭剂效果）\n'
            '- Corneometer 提升：即时显著（2-4h），但持续性较低\n'
            '- 典型用途：乳液、精华的立即保湿感来源\n\n'
            '中分子量 HA（MMW-HA，100-1,000 kDa）：\n'
            '- 皮肤渗透：部分渗入角质层，与SC脂质互作\n'
            '- 主要功效：平衡即时保湿与深层保湿；刺激皮肤自身 HA 合成\n\n'
            '低分子量 HA（LMW-HA，10-100 kDa）：\n'
            '- 皮肤渗透：可渗入角质层乃至真皮浅层\n'
            '- 主要功效：调节角质层水合，改善皮肤弹性，刺激成纤维细胞\n'
            '- 注意事项：过低分子量 HA 可能激活炎症通路（<50 kDa 可能有促炎作用）\n\n'
            '寡聚 HA（Oligomeric HA，<10 kDa，如四聚体 HA）：\n'
            '- 皮肤渗透：能渗入真皮层\n'
            '- 主要功效：刺激成纤维细胞产生内源性 HA；促进胶原蛋白合成\n'
            '- 争议：部分研究显示低分子 HA 有促炎效应，须谨慎使用\n\n'
            '三、配方建议（分子量组合）\n'
            '现代"多分子量 HA"配方：\n'
            '高分子（表面保湿）+ 中分子（角质层保湿）+ 低分子（深层保湿）三重复配\n'
            '总浓度通常 0.05-2%，效果优于单一分子量\n\n'
            '四、稳定性与配方注意\n'
            '- pH 稳定范围：5.0-8.0（过酸/过碱导致降解）\n'
            '- 热稳定性：加热 >60°C 可能导致降解，建议冷法加入\n'
            '- 防腐剂选择：含防腐剂配方需确认与 HA 无络合作用'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:hyaluronic-acid-mw-comprehensive',
        namespace='ingredients',
        tags=['透明质酸', 'Hyaluronic Acid', '分子量', '保湿', 'HA', 'Sodium Hyaluronate', '皮肤渗透'],
        properties={'cas': '9004-61-9', 'inci': 'Sodium Hyaluronate'},
    ),
    RawKnowledgeInput(
        title='神经酰胺（Ceramide）：皮肤屏障功能与化妆品中的应用分类',
        content=(
            '神经酰胺（Ceramides）在皮肤屏障与化妆品中的完整指南\n\n'
            '一、皮肤屏障中的作用\n'
            '神经酰胺是角质层脂质的主要成分（占总脂质约40-50%），\n'
            '与游离脂肪酸（FFAs，约10-20%）和胆固醇（约25-30%）共同构成\n'
            '"砖-泥"结构（Brick-and-Mortar Structure）中的"泥"——脂质基质。\n\n'
            '主要屏障功能：\n'
            '1. 防止水分过度散失（TEWL控制）\n'
            '2. 阻止外来物质（刺激物、过敏原、微生物）渗入皮肤\n'
            '3. 维持皮肤pH（弱酸性，pH 4.5-5.5）\n'
            '4. 参与细胞凋亡信号通路调控\n\n'
            '二、化妆品中常见的神经酰胺类型\n'
            '按INCI命名（PCPC/CTFA分类）：\n\n'
            '- Ceramide NP（神经酰胺-2）：最常见，N-花生碱-D-sphingosine\n'
            '  生理相关性高，是皮肤中含量最丰富的神经酰胺\n\n'
            '- Ceramide AP（神经酰胺-6II）：含α-hydroxyl fatty acid\n'
            '  特别在特应性皮炎（AD）患者皮肤中显著减少\n\n'
            '- Ceramide EOP（神经酰胺-1）：长链酯化脂肪酸-鞘氨醇\n'
            '  对角质层超结构形成关键，特应性皮炎中最显著缺乏的类型\n\n'
            '- Ceramide NS（神经酰胺-3）：N-stearoyl sphingosine\n\n'
            '- Ceramide EOH（神经酰胺-9）：含ω-hydroxy fatty acid\n\n'
            '三、有效性验证\n'
            '- 摩尔比（Molar Ratio）：须模拟皮肤天然比例，\n'
            '  Cer:FA:Chol = 1:1:1（摩尔比）是最有效的复配比例（Meckfessel等研究）\n'
            '- 浓度：有效浓度通常 0.01-0.5%（神经酰胺分子量大，溶解度有限）\n'
            '- 渗透增强：神经酰胺溶于油相，与亲水性保湿剂（HA、甘油）复配增效\n\n'
            '四、临床证据\n'
            '- 特应性皮炎治疗：含神经酰胺保湿剂可显著降低 TEWL，减少发作频率\n'
            '- TEWL 改善：8 周使用含神经酰胺产品，TEWL 平均降低 20-40%（文献综述）\n'
            '- 皮肤屏障修复：与不含神经酰胺的对照品比较，R2 弹性恢复率改善约 0.05-0.08'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:ceramide-skin-barrier-comprehensive',
        namespace='ingredients',
        tags=['神经酰胺', 'Ceramide', '皮肤屏障', '特应性皮炎', 'TEWL', '角质层', '脂质'],
        properties={'inci': 'Ceramide NP'},
    ),
    RawKnowledgeInput(
        title='视黄醇（Retinol）与维生素A衍生物：功效、安全性与孕期禁忌',
        content=(
            '视黄醇（Retinol）及维生素A衍生物完整成分档案\n\n'
            '一、维生素A衍生物体系\n'
            '活性形式层级（效力递增，但刺激性也递增）：\n'
            'Retinyl Esters → Retinol → Retinaldehyde → Retinoic Acid（处方药）\n\n'
            '转化途径：皮肤中 Retinol → Retinaldehyde（RBP4作用）→ Retinoic Acid（RAR激活）\n\n'
            '二、功效机制\n'
            '核心机制：激活视黄酸受体（RAR/RXR），直接调控基因表达：\n'
            '1. 促进胶原蛋白合成（COL1A1、COL1A2）→ 改善皱纹深度\n'
            '2. 抑制基质金属蛋白酶（MMP-1/MMP-3）→ 减少胶原降解\n'
            '3. 加速角质层更新（表皮turnover）→ 改善肤质、淡化色斑\n'
            '4. 促进透明质酸合成（HAS2）→ 改善保湿\n'
            '5. 抑制黑色素合成（抑制酪氨酸酶mRNA表达）→ 美白\n\n'
            '三、不同衍生物浓度与功效对比\n'
            '- Retinol（0.01-1%）：OTC可用，须配方保护（避光、抗氧化剂稳定）\n'
            '- Retinaldehyde（0.05-0.1%）：效力强于Retinol，刺激性相对低\n'
            '- 视黄醇棕榈酸酯 Retinyl Palmitate（0.1-2%）：最温和，证据最弱\n\n'
            '四、孕期安全性（核心问题）\n'
            '孕期局部使用视黄醇（Retinol）的安全性争议：\n'
            '官方立场（FDA、EFSA、SCCS）：\n'
            '- 维生素A过量（高于10,000 IU/天）确认致畸（teratogenic）\n'
            '- 局部使用的系统吸收量极低（约1-2%吸收），理论上风险低\n'
            '- 但因为缺乏孕期专项安全数据，各国监管机构建议孕期避免使用\n'
            '- SCCS 2021年意见：视黄醇在化妆品中0.3%面部/0.05%身体的最大浓度标准下安全\n'
            '  但明确建议孕妇、哺乳期妇女避免使用含视黄醇的护肤品\n\n'
            '为什么建议避免（预防原则）：\n'
            '- 与口服异维A酸（Isotretinoin，强力维生素A衍生物）的致畸风险类推\n'
            '- 医疗界普遍建议怀孕3-9个月（器官发育期）尤须避免\n\n'
            '五、欧盟法规限量（2021年修订）\n'
            '- 面部产品：Retinol ≤0.3%（含面部），Retinol Palmitate ≤3%\n'
            '- 身体护肤品：Retinol ≤0.05%\n'
            '- 中国：暂无明确浓度限量，但通常参照EU标准'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:retinol-vitamin-a-comprehensive',
        namespace='ingredients',
        tags=['视黄醇', 'Retinol', '维生素A', '孕期安全', '抗衰老', '胶原蛋白', 'RAR', '致畸', '浓度限量'],
        properties={'inci': 'Retinol', 'cas': '68-26-8'},
    ),
    RawKnowledgeInput(
        title='防晒剂深度比较：有机防晒剂（化学）vs无机防晒剂（物理）机制与应用',
        content=(
            '防晒剂分类：有机防晒剂（化学防晒）vs 无机防晒剂（物理防晒）\n\n'
            '一、有机防晒剂（Organic/Chemical UV Filters）\n'
            '作用机制：分子内含不饱和键的有机化合物，吸收紫外辐射后经光化学反应转化为热能。\n\n'
            '常用有机防晒剂：\n'
            '1. UVB防护（290-320nm）：\n'
            '   - 水杨酸辛酯（Octyl Salicylate）：温和，常用于配方\n'
            '   - 对甲氧基肉桂酸乙基己酯（Octinoxate，OMC）：高效UVB，使用量最大的防晒剂之一\n'
            '   - 甲基苯亚甲基樟脑（4-MBC）：高效，EU允许但部分争议\n\n'
            '2. UVA防护（320-400nm）：\n'
            '   - 阿伏苯宗（Avobenzone，Parsol 1789）：最广泛使用的UVA1防护剂，\n'
            '     须用稳定剂（如Octocrylene）防止光降解\n'
            '   - 比索曲唑（Bisoctrizole/Tinosorb M）：宽谱，高光稳定性\n'
            '   - 丁基甲氧基二苯甲酰基甲烷（BMBM）：同Avobenzone\n\n'
            '3. 宽谱有机防晒剂：\n'
            '   - 二苯酮-3（Benzophenone-3 / Oxybenzone）：UVA+UVB，但争议大（内分泌干扰）\n'
            '   - Tinosorb S（双乙基己氧苯酚甲氧苯基三嗪）：光稳定，欧盟批准但美国未批\n\n'
            '二、无机防晒剂（Inorganic/Physical UV Filters）\n'
            '作用机制：物理阻挡/反射+散射紫外线（和可见光）。\n'
            '主要成分：氧化锌（ZnO）、二氧化钛（TiO₂）\n'
            '优势：广谱（UVA+UVB），光稳定，对皮肤无刺激，适合敏感皮肤\n'
            '劣势：白色/泛白感，影响肤感和美观（纳米化可解决，但引入安全讨论）\n\n'
            '三、有机 vs 无机的核心差异\n'
            '| 特征 | 有机防晒 | 无机防晒 |\n'
            '|---|---|---|\n'
            '| 机制 | 吸收UV，转化热能 | 反射/散射UV |\n'
            '| 肤感 | 轻薄，无白色 | 偏厚重，可能泛白 |\n'
            '| 广谱能力 | 需多组分复配 | ZnO单独即广谱 |\n'
            '| 光稳定性 | 部分不稳定（Avobenzone） | 高度光稳定 |\n'
            '| 安全性争议 | 部分成分有内分泌干扰争议 | 无系统吸收，安全性好 |\n'
            '| 敏感皮肤 | 可能刺激 | 推荐首选 |\n\n'
            '四、配方策略\n'
            '最优配方：有机+无机复配——有机提供高SPF和轻薄肤感，无机提供广谱稳定性\n'
            '敏感/儿童肌肤：纯无机防晒（ZnO+TiO₂）'
        ),
        entry_type='ingredient_data',
        source_type='manual_ingest',
        source_key='ingredient:sunscreen-organic-vs-inorganic',
        namespace='ingredients',
        tags=['防晒剂', '有机防晒', '无机防晒', 'Avobenzone', 'Octinoxate', '氧化锌', '二氧化钛', '防晒机制'],
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 五、临床合规SOP专项（COMPLIANCE DOMAIN）
# 目标：GCP规范、CRF管理、偏差分类、伦理全流程的专业操作指引
# ══════════════════════════════════════════════════════════════════════════════

COMPLIANCE_CORPUS = [
    RawKnowledgeInput(
        title='GCP病例报告表（CRF）管理规范：填写、更改与审查要求',
        content=(
            '临床研究病例报告表（Case Report Form，CRF）管理完整规范\n\n'
            '一、CRF 填写基本规则（ICH E6(R3)要求）\n'
            '1. 原始数据原则：\n'
            '   - CRF 数据须与原始数据（source data）一致\n'
            '   - 源文件（source document）：医院病历、实验室报告、仪器打印记录\n'
            '   - 直接数据录入（EDC）：须有唯一用户账号和时间戳\n\n'
            '2. 数据录入规范：\n'
            '   - 纸质 CRF：黑色/蓝色碳素笔书写；禁止铅笔、橡皮\n'
            '   - 字迹须清晰可辨（不可潦草，须可扫描/复制）\n'
            '   - 缺失数据处理：如数据未收集，须注明原因（如"N/A"、"访视未进行"）\n'
            '   - 所有时间须精确到年月日（时间精度视方案要求，时间关键数据精确到分钟）\n\n'
            '二、数据更改（Data Correction）规范（关键！GCP核查重点）\n'
            '纸质 CRF 更改规则：\n'
            '1. 划单横线穿过错误数据（保留原始数据可读）—— 禁止涂改液、过度划黑\n'
            '2. 在旁边写上正确数据\n'
            '3. 标注更改日期和更改人缩写（首字母签名）\n'
            '4. 注明更改原因（如"数据录入错误"、"转录错误"）\n'
            '5. 签署全名（或授权后的缩写签名）\n\n'
            'EDC 系统中的更改：\n'
            '- 系统须自动生成 Audit Trail（操作日志），记录：谁、何时、改了什么、原因\n'
            '- 不可关闭或修改 Audit Trail（GCP 强制要求）\n\n'
            '三、CRF 审查流程\n'
            '1. 研究者审查（Research Site Review）：研究者确认CRF完整、准确后签字\n'
            '2. 监查（Monitoring）：申办方监查员定期审查CRF与源文件的一致性\n'
            '   - 检查项：每条CRF数据须有对应源文件支持\n'
            '3. 数据管理（Data Management）：\n'
            '   - 逻辑核查（Edit Checks）：自动检查范围、逻辑错误\n'
            '   - 医学编码（Medical Coding）：不良事件须用 MedDRA 编码\n\n'
            '四、化妆品功效评价 CRF 特殊注意\n'
            '- 仪器测量数据：须记录测量时间、仪器编号、操作员、环境条件（温湿度）\n'
            '- 主观评估：须记录评估者和评估时间，评估者需盲法\n'
            '- 不良事件（皮肤不适）：须详细描述（部位、严重程度、持续时间、与研究的关系）'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:crf-management-gcp',
        namespace='compliance',
        tags=['CRF', '病例报告表', 'GCP', '数据更改', 'Audit Trail', '源文件', 'EDC', '临床研究规范'],
        properties={'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='协议偏离与方案违背：分类定义、报告流程与预防措施',
        content=(
            '临床研究协议偏离（Protocol Deviation）与方案违背（Protocol Violation）完整指南\n\n'
            '一、定义与分类\n\n'
            '方案违背（Protocol Violation，较严重）：\n'
            '定义：对已批准研究方案的重大偏离，可能影响受试者安全、数据完整性或研究结论有效性。\n'
            '特征：通常需向伦理委员会（IRB/EC）报告\n'
            '典型例子：\n'
            '- 入组不符合入排标准的受试者（违反关键入排标准）\n'
            '- 未获知情同意即开始研究程序\n'
            '- 使用未经批准的方案版本进行研究\n'
            '- 隐瞒严重不良事件（SAE）\n\n'
            '协议偏离（Protocol Deviation，较轻微）：\n'
            '定义：对已批准研究方案的小偏离，不影响受试者安全或数据可靠性。\n'
            '特征：通常记录在案，汇总报告（不需单独向IRB报告）\n'
            '典型例子：\n'
            '- 访视窗口延误（如规定第28±3天，实际第32天来访）\n'
            '- 测量环境温度略偏差（如要求20°C，实际22°C）\n'
            '- 受试者未按要求使用标准清洁产品（偶发一次）\n\n'
            '二、判断标准（三个关键问题）\n'
            '1. 是否影响受试者安全或权益？\n'
            '2. 是否影响数据的可靠性/可解释性？\n'
            '3. 是否是蓄意的（Intentional）？\n'
            '→ 任一为"是"：视为方案违背（Protocol Violation）\n\n'
            '三、偏离报告流程\n'
            '发现偏离后 48 小时内：\n'
            '1. 记录偏离详情（时间、内容、原因、影响）\n'
            '2. 评估分类（偏离 vs 违背）\n'
            '3. 实施纠正措施（Corrective Action）\n'
            '4. 制定预防措施（Preventive Action, CAPA）\n'
            '5. 汇报路径：\n'
            '   - 偏离：记录于偏离日志，定期汇总报告给申办方\n'
            '   - 违背：须立即向申办方和伦理委员会报告（通常 5-10 个工作日内）\n\n'
            '四、化妆品功效评价中常见偏离情境\n'
            '- 仪器测量环境条件偏差：温湿度超出规定范围（最常见）\n'
            '- 受试者访视时间窗口延误：访视±允许范围外来访\n'
            '- 受试者依从性问题：未按要求频率使用产品（须在日记卡记录）\n'
            '- ICF 签署时机错误：先进行了某些筛查操作后才签署（影响数据有效性）'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:protocol-deviation-violation',
        namespace='compliance',
        tags=['协议偏离', '方案违背', 'Protocol Deviation', 'Protocol Violation', 'GCP', 'CAPA', '伦理报告'],
        properties={'source_url': 'https://www.ich.org/page/efficacy-guidelines'},
    ),
    RawKnowledgeInput(
        title='研究主要终点与次要终点设计：定义、区别与临床研究报告规范',
        content=(
            '化妆品功效评价终点设计规范（Primary & Secondary Endpoints）\n\n'
            '一、主要终点（Primary Endpoint）\n'
            '定义：研究的核心功效测量指标，用于：\n'
            '1. 样本量计算（研究的统计依据基于主要终点的假设）\n'
            '2. 研究成败的主要判断依据\n'
            '3. 功效宣称的最强直接支持证据\n\n'
            '关键原则：\n'
            '- 通常只设 1 个主要终点（避免多重比较问题）\n'
            '- 必须在方案和SAP中预先定义\n'
            '- 须客观可测量、可重复（仪器测量优于主观评估）\n\n'
            '二、次要终点（Secondary Endpoint）\n'
            '定义：补充主要终点的额外测量指标，用于：\n'
            '1. 多维度支持功效宣称\n'
            '2. 探索性分析（生成新假设）\n'
            '3. 了解作用机制和起效时间\n\n'
            '关键原则：\n'
            '- 可设多个次要终点，但须预先定义\n'
            '- 次要终点的统计意义解释须谨慎（多重比较增加假阳性）\n'
            '- 次要终点阳性但主要终点阴性 → 不能宣称研究成功\n\n'
            '三、化妆品功效评价的典型终点配置\n'
            '保湿功效研究：\n'
            '- 主要终点：Corneometer 皮肤水合度变化量（AU，使用后4/8周）\n'
            '- 次要终点：TEWL（Tewameter）、皮肤弹性（Cutometer R2）、受试者自评\n\n'
            '美白功效研究：\n'
            '- 主要终点：Mexameter 黑色素指数变化（MI，使用后8/12周）\n'
            '- 次要终点：L* 值（Colorimeter）、皮肤科医生IGA评分、受试者满意度\n\n'
            '抗皱功效研究：\n'
            '- 主要终点：Cutometer R2 弹性恢复率变化（使用后12/24周）\n'
            '- 次要终点：PRIMOS 皱纹参数（Rz）、VISIA皱纹评分、主观皱纹评分\n\n'
            '四、常见设计错误\n'
            '1. 主要终点设置主观评估（如受试者自评保湿感）：\n'
            '   风险：主观评估误差大，样本量需求显著增加，且NMPA审查力度高\n'
            '2. 多个主要终点未做多重比较校正：\n'
            '   风险：整体I类错误率膨胀，数据不可信\n'
            '3. 更改主要终点（揭盲后）：\n'
            '   风险：GCP违规，数据可能被拒绝'
        ),
        entry_type='method_reference',
        source_type='manual_ingest',
        source_key='method:primary-secondary-endpoints',
        namespace='methodology',
        tags=['主要终点', '次要终点', 'Primary Endpoint', 'Secondary Endpoint', '样本量', '研究设计', 'SAP', '功效评价'],
    ),
    RawKnowledgeInput(
        title='伦理委员会全流程管理：初始申请、持续审查、终止与档案保存',
        content=(
            '伦理委员会（IRB/EC）研究管理全流程指南\n\n'
            '一、伦理申请分类\n'
            '1. 初始审查（Initial Review）：研究开始前，提交首次伦理申请\n'
            '2. 修订审查（Amendment Review）：方案、知情同意书等文件修订后\n'
            '3. 持续审查（Continuing Review）：通常每12个月进行一次（批件有效期维持）\n'
            '4. 快速审查（Expedited Review）：风险极低的研究，简化程序\n'
            '5. 免予审查（Exempt Review）：特定类型的最低风险研究\n\n'
            '二、初始申请材料（化妆品功效评价）\n'
            '必须提交：\n'
            '- 研究方案（Protocol，含版本号和日期）\n'
            '- 知情同意书（ICF，含版本号）\n'
            '- 受试者招募材料（广告、宣传单）\n'
            '- 研究者简历（PI及关键研究人员）\n'
            '- 产品信息（配方、安全性数据，不要求公开配方但须有毒理学概要）\n'
            '- 数据安全性监察计划（DSMB/DMC相关，可简化）\n\n'
            '三、持续审查（批件续期）完整流程\n'
            '时机：批件到期前 60-90 天提交\n'
            '材料：\n'
            '- 持续审查申请表\n'
            '- 研究进展报告：入组/完成/脱落受试者人数，不良事件汇总\n'
            '- 更新版知情同意书（如有修订）\n'
            '- 主要发现摘要（若有中期数据）\n\n'
            '批件过期处理（续期申请延误）：\n'
            '1. 立即暂停新受试者入组\n'
            '2. 已入组受试者：可继续已开始的治疗但不得开始新操作\n'
            '3. 向伦理委员会提交"逾期报告"（说明逾期原因）\n'
            '4. 建立协议偏离记录（Protocol Deviation）\n'
            '5. 受伦理委员会决定是否影响研究数据有效性\n\n'
            '四、研究结束时的要求\n'
            '- 提交研究终止/完成报告（Final Report）\n'
            '- 伦理委员会批准结题\n'
            '- 档案保存：须保存 5 年（中国 GCP 要求）\n'
            '- 知情同意书原件和关键文件须在安全地点保存（受试者匿名/加密）\n\n'
            '五、化妆品功效评价的伦理特殊考量\n'
            '- 风险级别：通常属于"最低风险"（minimal risk），批件申请相对简单\n'
            '- 部分机构出具"一次性批件"（study completion类型），无须续期\n'
            '- 儿童受试者：须家长/监护人同意+儿童同意（assent）\n'
            '- 孕妇排除：标准保护性排除，ICF须明确说明'
        ),
        entry_type='sop',
        source_type='manual_ingest',
        source_key='sop:irb-ec-full-process',
        namespace='compliance',
        tags=['伦理委员会', 'IRB', 'EC', '持续审查', '批件续期', '伦理申请', '档案保存', 'GCP'],
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# 汇总所有域
# ══════════════════════════════════════════════════════════════════════════════

ALL_DOMAINS = {
    'regulation': REGULATION_CORPUS,
    'methodology': METHODOLOGY_CORPUS,
    'instrument': INSTRUMENT_CORPUS,
    'ingredient': INGREDIENT_CORPUS,
    'compliance': COMPLIANCE_CORPUS,
}


class Command(BaseCommand):
    help = '注入一流专业水准的化妆品功效评价知识库（五大核心知识域）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--domain',
            choices=['regulation', 'methodology', 'instrument', 'ingredient', 'compliance'],
            default=None,
            help='指定注入的知识域（不指定则全部注入）',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='试运行，不写入数据库，仅打印将要注入的内容',
        )

    def handle(self, *args, **options):
        domain = options.get('domain')
        dry_run = options.get('dry_run', False)

        if domain:
            domains_to_ingest = {domain: ALL_DOMAINS[domain]}
        else:
            domains_to_ingest = ALL_DOMAINS

        total_new = 0
        total_skip = 0
        total_fail = 0

        for domain_name, corpus in domains_to_ingest.items():
            self.stdout.write(f'\n=== 注入知识域：{domain_name}（{len(corpus)} 条）===')

            for item in corpus:
                if dry_run:
                    self.stdout.write(f'  [DRY-RUN] {item.title}')
                    continue

                try:
                    result = run_pipeline(item)
                    if result.skipped_reason:
                        total_skip += 1
                        self.stdout.write(f'  ⏭  跳过: {item.title[:60]}（{result.skipped_reason}）')
                    elif result.success and result.entry_id:
                        # 确保高质量内容立即发布
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
                        score = result.quality_score or 0
                        self.stdout.write(f'  ✅ 新建: {item.title[:55]} (质量分:{score})')
                    else:
                        total_fail += 1
                        errs = '; '.join(f'{k}:{v}' for k, v in result.stage_errors.items())
                        self.stdout.write(
                            self.style.ERROR(f'  ❌ 失败: {item.title[:55]} → {errs or "pipeline failed"}')
                        )
                except Exception as e:
                    total_fail += 1
                    self.stdout.write(
                        self.style.ERROR(f'  ❌ 异常: {item.title[:55]} → {e}')
                    )

        if not dry_run:
            self.stdout.write(
                f'\n注入完成：新建 {total_new} 条 | 跳过 {total_skip} 条 | 失败 {total_fail} 条'
            )
        else:
            total_items = sum(len(c) for c in domains_to_ingest.values())
            self.stdout.write(f'\n[DRY-RUN] 将注入 {total_items} 条知识条目')
