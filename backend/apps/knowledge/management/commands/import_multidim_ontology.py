"""
多维一体本体导入：功效宣称 × 感官体验 × 情绪价值 × 生理指标 × 诊断方法 × 消费者画像
...（略）
用法: python manage.py import_multidim_ontology
"""
from django.core.management.base import BaseCommand
from apps.knowledge.models import (
    KnowledgeEntry, KnowledgeEntity, KnowledgeRelation,
    EntryType, EntityType, OntologyNamespace, RelationType,
)

NS = OntologyNamespace.CNKIS

# ═══════════════════════════════════════════════════════════════════
# 第一维：功效宣称维（Claim Dimension）
# 客户最终要的东西——产品包装上能写什么
# ═══════════════════════════════════════════════════════════════════

CLAIM_DIMENSION = {
    'uri': 'cnkis:claim-dimension',
    'label': '功效宣称维',
    'label_en': 'ClaimDimension',
    'definition': '化妆品功效宣称的完整知识体系——从法规要求到消费者语言',
    'entity_type': EntityType.CLASS,
    'children': [
        {
            'uri': 'cnkis:claim-level',
            'label': '宣称等级体系',
            'label_en': 'ClaimLevelSystem',
            'definition': '功效宣称的法规分级与对应的验证要求',
            'children': [
                {'uri': 'cnkis:claim-level-special', 'label': '特殊化妆品宣称',
                 'definition': '防晒、美白、防脱发等需注册的特殊功效宣称，需人体功效评价试验',
                 'props': {'regulation': '《化妆品监督管理条例》第16条', 'verification': '人体功效评价试验必须'}},
                {'uri': 'cnkis:claim-level-new-efficacy', 'label': '新功效宣称',
                 'definition': '首次使用的新功效宣称词，需安评+功效评价',
                 'props': {'regulation': '《化妆品功效宣称评价规范》', 'verification': '人体功效评价或消费者使用测试'}},
                {'uri': 'cnkis:claim-level-ordinary', 'label': '普通化妆品宣称',
                 'definition': '保湿、清洁等普通功效宣称，可用多种评价方式',
                 'props': {'verification': '人体功效评价/消费者使用测试/实验室试验'}},
                {'uri': 'cnkis:claim-level-experiential', 'label': '体验型宣称',
                 'definition': '消费者可直接感知的使用体验宣称，如"清爽不黏腻"',
                 'props': {'verification': '消费者使用测试/感官评估小组'}},
            ],
        },
        {
            'uri': 'cnkis:claim-category',
            'label': '功效宣称分类',
            'label_en': 'ClaimCategory',
            'definition': 'NMPA 规范的 26 类化妆品功效宣称',
            'children': [
                {'uri': 'cnkis:claim-moisturizing', 'label': '保湿',
                 'definition': '增强皮肤角质层水合、改善干燥、维持水油平衡',
                 'props': {'level': 'ordinary', 'primary_indicator': 'TEWL+角质层含水量',
                          'consumer_language': '一整天不紧绷、持续水润、深层补水'}},
                {'uri': 'cnkis:claim-whitening', 'label': '美白祛斑',
                 'definition': '抑制黑色素生成、淡化色斑、提亮肤色',
                 'props': {'level': 'special', 'primary_indicator': 'MI+L*+ITA°',
                          'consumer_language': '提亮肤色、淡化暗沉、均匀肤色、自然透亮'}},
                {'uri': 'cnkis:claim-anti-wrinkle', 'label': '抗皱',
                 'definition': '减少皱纹深度、改善皮肤弹性、延缓皮肤老化',
                 'props': {'level': 'new_efficacy', 'primary_indicator': 'R2+R7+Rz+Ra',
                          'consumer_language': '紧致饱满、淡化细纹、弹润年轻'}},
                {'uri': 'cnkis:claim-sunscreen', 'label': '防晒',
                 'definition': '防护紫外线（UVA/UVB）对皮肤的损伤',
                 'props': {'level': 'special', 'primary_indicator': 'SPF+PA+UVA-PF',
                          'consumer_language': '全波段防护、户外无忧、不惧阳光'}},
                {'uri': 'cnkis:claim-repair', 'label': '修复',
                 'definition': '修复受损皮肤屏障、改善皮肤敏感状态',
                 'props': {'level': 'new_efficacy', 'primary_indicator': 'TEWL恢复率+红斑指数',
                          'consumer_language': '屏障修护、敏感舒缓、肌肤重建'}},
                {'uri': 'cnkis:claim-oil-control', 'label': '控油',
                 'definition': '减少皮脂分泌、改善面部油光',
                 'props': {'level': 'ordinary', 'primary_indicator': '皮脂分泌量',
                          'consumer_language': '清爽不油腻、持久哑光、T区清透'}},
                {'uri': 'cnkis:claim-soothing', 'label': '舒缓',
                 'definition': '缓解皮肤不适感、减少发红/灼热/刺痒',
                 'props': {'level': 'ordinary', 'primary_indicator': '红斑指数+TEWL+主观评分',
                          'consumer_language': '镇静退红、即刻舒适、敏感肌安心'}},
                {'uri': 'cnkis:claim-firming', 'label': '紧致',
                 'definition': '改善皮肤松弛、提升面部轮廓',
                 'props': {'level': 'new_efficacy', 'primary_indicator': 'R2+面部轮廓测量',
                          'consumer_language': 'V脸提升、轮廓清晰、紧实弹润'}},
                {'uri': 'cnkis:claim-pore-minimizing', 'label': '细致毛孔',
                 'definition': '缩小毛孔外观、改善皮肤纹理',
                 'props': {'level': 'ordinary', 'primary_indicator': '毛孔面积+粗糙度Ra',
                          'consumer_language': '毛孔隐形、细腻光滑、瓷肌效果'}},
                {'uri': 'cnkis:claim-anti-hair-loss', 'label': '防脱发',
                 'definition': '减少脱发、促进头发生长',
                 'props': {'level': 'special', 'primary_indicator': '脱发计数+头发密度',
                          'consumer_language': '强韧发根、减少掉发、浓密秀发'}},
                {'uri': 'cnkis:claim-hair-care', 'label': '护发',
                 'definition': '改善头发光泽、强度、顺滑度',
                 'props': {'level': 'ordinary', 'primary_indicator': '拉伸强度+光泽度+梳理力',
                          'consumer_language': '顺滑亮泽、不毛躁、丝般柔顺'}},
                {'uri': 'cnkis:claim-cleansing', 'label': '清洁',
                 'definition': '清除皮肤表面污垢、彩妆和多余皮脂',
                 'props': {'level': 'ordinary', 'primary_indicator': '清洁率+温和度评估',
                          'consumer_language': '深层清洁、温和不紧绷、洗后清爽'}},
            ],
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════
# 第二维：感官体验维（Sensory Dimension）
# 消费者拿到产品后的第一感受，决定复购
# ═══════════════════════════════════════════════════════════════════

SENSORY_DIMENSION = {
    'uri': 'cnkis:sensory-dimension',
    'label': '感官体验维',
    'label_en': 'SensoryDimension',
    'definition': '产品使用过程中消费者感知到的全部感官体验维度',
    'entity_type': EntityType.CLASS,
    'children': [
        {
            'uri': 'cnkis:sensory-texture',
            'label': '质地感受',
            'label_en': 'TexturePerception',
            'definition': '产品质地在皮肤上的触觉感受',
            'children': [
                {'uri': 'cnkis:texture-watery', 'label': '水润型', 'definition': '流动性好，水感强，如化妆水、精华水'},
                {'uri': 'cnkis:texture-light', 'label': '轻薄型', 'definition': '涂抹感轻盈，无负担感，如凝胶、乳液'},
                {'uri': 'cnkis:texture-silky', 'label': '丝滑型', 'definition': '触感丝滑细腻，延展性好'},
                {'uri': 'cnkis:texture-creamy', 'label': '绵密型', 'definition': '质地丰富浓稠，包裹感强，如面霜'},
                {'uri': 'cnkis:texture-bouncy', 'label': '弹润型', 'definition': '有弹性的凝冻感，Q弹触感'},
                {'uri': 'cnkis:texture-oil', 'label': '油润型', 'definition': '油脂感明显，滋养感强，如面油、膏霜'},
            ],
        },
        {
            'uri': 'cnkis:sensory-absorption',
            'label': '吸收体验',
            'label_en': 'AbsorptionExperience',
            'definition': '产品被皮肤吸收的过程体验',
            'children': [
                {'uri': 'cnkis:absorption-instant', 'label': '即刻吸收', 'definition': '涂抹后 5 秒内完全吸收，无残留'},
                {'uri': 'cnkis:absorption-massage', 'label': '按摩吸收', 'definition': '需要适度按摩促进吸收，有使用仪式感'},
                {'uri': 'cnkis:absorption-film', 'label': '成膜感', 'definition': '在皮肤表面形成保护膜，有轻微包裹感'},
                {'uri': 'cnkis:absorption-penetrating', 'label': '渗透感', 'definition': '有向皮肤内部渗透的感觉，深层滋润'},
            ],
        },
        {
            'uri': 'cnkis:sensory-afterfeel',
            'label': '使用后肤感',
            'label_en': 'AfterfeeExperience',
            'definition': '产品使用后皮肤的触觉状态',
            'children': [
                {'uri': 'cnkis:afterfeel-matte', 'label': '清爽哑光', 'definition': '无油光、干爽、适合油皮'},
                {'uri': 'cnkis:afterfeel-dewy', 'label': '润泽光感', 'definition': '有自然光泽、微润、健康光泽'},
                {'uri': 'cnkis:afterfeel-smooth', 'label': '柔滑如丝', 'definition': '触感细腻光滑，如丝绸般柔顺'},
                {'uri': 'cnkis:afterfeel-plump', 'label': '饱满弹润', 'definition': '皮肤有充盈饱满感，弹性提升'},
                {'uri': 'cnkis:afterfeel-sticky', 'label': '黏腻（负面）', 'definition': '表面残留黏腻，为负面感官体验'},
            ],
        },
        {
            'uri': 'cnkis:sensory-scent',
            'label': '气味体验',
            'label_en': 'ScentExperience',
            'definition': '产品香气特征及消费者接受度',
            'children': [
                {'uri': 'cnkis:scent-none', 'label': '无香', 'definition': '无添加香精，适合敏感肌和成分党'},
                {'uri': 'cnkis:scent-light', 'label': '淡雅', 'definition': '清淡自然，使用后不残留'},
                {'uri': 'cnkis:scent-floral', 'label': '花香调', 'definition': '玫瑰/茉莉/樱花等花卉香气'},
                {'uri': 'cnkis:scent-herbal', 'label': '草本调', 'definition': '薰衣草/茶树/艾草等草本清新感'},
                {'uri': 'cnkis:scent-citrus', 'label': '柑橘调', 'definition': '柠檬/柚子/佛手柑等清新活力感'},
            ],
        },
        {
            'uri': 'cnkis:sensory-visual',
            'label': '视觉变化感知',
            'label_en': 'VisualPerception',
            'definition': '使用后肉眼可见的皮肤视觉变化',
            'children': [
                {'uri': 'cnkis:visual-brightening', 'label': '即时提亮', 'definition': '使用后即刻肤色变亮'},
                {'uri': 'cnkis:visual-glow', 'label': '自然光泽', 'definition': '健康的由内而外的光泽感'},
                {'uri': 'cnkis:visual-even', 'label': '均匀肤色', 'definition': '色斑、暗沉区域变均匀'},
                {'uri': 'cnkis:visual-pore-blur', 'label': '毛孔模糊', 'definition': '毛孔不明显，柔焦效果'},
            ],
        },
        {
            'uri': 'cnkis:sensory-temporal',
            'label': '时间感知',
            'label_en': 'TemporalPerception',
            'definition': '功效体验的时间维度',
            'children': [
                {'uri': 'cnkis:temporal-instant', 'label': '即时感受', 'definition': '涂抹后数分钟内可感知的改善'},
                {'uri': 'cnkis:temporal-1h', 'label': '1小时持续', 'definition': '使用后 1 小时后效果仍可感知'},
                {'uri': 'cnkis:temporal-allday', 'label': '一整天效果', 'definition': '12 小时以上持续效果'},
                {'uri': 'cnkis:temporal-cumulative', 'label': '累积效果', 'definition': '连续使用 7/14/28 天后的渐进式改善'},
            ],
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════
# 第三维：情绪价值维（Emotional Dimension）
# 消费者为什么愿意付溢价
# ═══════════════════════════════════════════════════════════════════

EMOTIONAL_DIMENSION = {
    'uri': 'cnkis:emotional-dimension',
    'label': '情绪价值维',
    'label_en': 'EmotionalDimension',
    'definition': '产品使用带来的情绪和心理层面的价值体验',
    'entity_type': EntityType.CLASS,
    'children': [
        {
            'uri': 'cnkis:emo-self-efficacy',
            'label': '自我效能感',
            'label_en': 'SelfEfficacy',
            'definition': '"我的皮肤在变好，我有能力管理好自己的肌肤状态"',
            'children': [
                {'uri': 'cnkis:emo-control', 'label': '皮肤控制感', 'definition': '感觉自己能掌控皮肤状态的信心'},
                {'uri': 'cnkis:emo-progress', 'label': '改善进步感', 'definition': '看到皮肤一天天变好的成就感'},
                {'uri': 'cnkis:emo-problem-solved', 'label': '问题解决感', 'definition': '困扰多年的问题终于找到解决方案'},
            ],
        },
        {
            'uri': 'cnkis:emo-social-confidence',
            'label': '社交自信',
            'label_en': 'SocialConfidence',
            'definition': '"我可以不化妆就出门，我不怕别人近距离看我的脸"',
            'children': [
                {'uri': 'cnkis:emo-bare-face', 'label': '素颜自信', 'definition': '不依赖妆容就能自信出门'},
                {'uri': 'cnkis:emo-close-up', 'label': '近距离无惧', 'definition': '不怕近距离社交和观察'},
                {'uri': 'cnkis:emo-compliment', 'label': '被夸赞感', 'definition': '被他人注意到皮肤变化并夸赞'},
            ],
        },
        {
            'uri': 'cnkis:emo-ritual',
            'label': '仪式感与愉悦',
            'label_en': 'RitualPleasure',
            'definition': '"护肤是我给自己的礼物，是一天中最享受的时刻"',
            'children': [
                {'uri': 'cnkis:emo-me-time', 'label': '自我关爱时刻', 'definition': '护肤过程本身带来的放松和自我关爱'},
                {'uri': 'cnkis:emo-luxe', 'label': '奢宠感', 'definition': '使用高品质产品带来的心理满足'},
                {'uri': 'cnkis:emo-routine-joy', 'label': '日常小确幸', 'definition': '日常护肤步骤带来的规律感和仪式感'},
            ],
        },
        {
            'uri': 'cnkis:emo-safety',
            'label': '安全感与信任',
            'label_en': 'SafetyTrust',
            'definition': '"这个产品有科学验证，成分安全，我放心用"',
            'children': [
                {'uri': 'cnkis:emo-ingredient-trust', 'label': '成分安心', 'definition': '了解并信任产品成分，无安全焦虑'},
                {'uri': 'cnkis:emo-science-backed', 'label': '科学背书信任', 'definition': '有临床试验数据支撑的信任感'},
                {'uri': 'cnkis:emo-gentle-assurance', 'label': '温和保证', 'definition': '确信产品不会引起刺激或过敏'},
            ],
        },
        {
            'uri': 'cnkis:emo-anxiety-relief',
            'label': '焦虑缓解',
            'label_en': 'AnxietyRelief',
            'definition': '减轻与皮肤/外貌/衰老相关的心理焦虑',
            'children': [
                {'uri': 'cnkis:emo-aging-anxiety', 'label': '抗老焦虑缓解', 'definition': '减少对衰老的过度焦虑和恐惧'},
                {'uri': 'cnkis:emo-skin-anxiety', 'label': '肌肤问题焦虑缓解', 'definition': '减少对痘痘/色斑等问题的心理负担'},
                {'uri': 'cnkis:emo-appearance-worry', 'label': '外貌焦虑缓解', 'definition': '减少对自身外貌的过度担忧'},
            ],
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════
# 第四维：生理指标维（Physiological Dimension）
# 科学证据层——每个宣称背后的硬数据
# ═══════════════════════════════════════════════════════════════════

PHYSIOLOGICAL_DIMENSION = {
    'uri': 'cnkis:physiological-dimension',
    'label': '生理指标维',
    'label_en': 'PhysiologicalDimension',
    'definition': '皮肤和毛发生理状态的客观测量指标体系',
    'entity_type': EntityType.CLASS,
    'children': [
        {
            'uri': 'cnkis:physio-barrier',
            'label': '皮肤屏障系统',
            'label_en': 'SkinBarrierSystem',
            'definition': '角质层完整性和屏障功能相关指标',
            'children': [
                {'uri': 'cnkis:ind-tewl', 'label': 'TEWL（经皮水分散失）',
                 'definition': '经表皮水分蒸发速率 (g/h/m²)，反映屏障完整性。数值越低，屏障越好',
                 'props': {'unit': 'g/h/m²', 'normal_range': '5-15', 'instrument': 'Tewameter',
                          'consumer_meaning': '屏障越强 → 换季不怕、不容易过敏'}},
                {'uri': 'cnkis:ind-hydration', 'label': '角质层含水量',
                 'definition': '皮肤角质层水合程度 (AU)，反映保湿状态',
                 'props': {'unit': 'AU (arbitrary unit)', 'normal_range': '35-60', 'instrument': 'Corneometer',
                          'consumer_meaning': '含水量越高 → 皮肤越润泽饱满、不紧绷'}},
                {'uri': 'cnkis:ind-ph', 'label': '皮肤pH值',
                 'definition': '皮肤表面酸碱度，健康皮肤呈弱酸性',
                 'props': {'unit': 'pH', 'normal_range': '4.5-6.0', 'instrument': 'Skin-pH-Meter',
                          'consumer_meaning': 'pH平衡 → 微生态健康、抵抗力强'}},
            ],
        },
        {
            'uri': 'cnkis:physio-pigment',
            'label': '色素系统',
            'label_en': 'PigmentationSystem',
            'definition': '皮肤色素沉着和肤色相关指标',
            'children': [
                {'uri': 'cnkis:ind-melanin', 'label': '黑色素指数 (MI)',
                 'definition': '皮肤黑色素含量，反映色素沉着程度',
                 'props': {'instrument': 'Mexameter', 'consumer_meaning': 'MI 降低 → 肤色提亮、斑点淡化'}},
                {'uri': 'cnkis:ind-luminance', 'label': '明度 L* 值',
                 'definition': 'CIE L*a*b* 色彩空间中的明度值，L*越高越白',
                 'props': {'instrument': 'Chromameter', 'consumer_meaning': 'L*升高 → 肤色更通透明亮'}},
                {'uri': 'cnkis:ind-ita', 'label': 'ITA° 值',
                 'definition': '个体色型角度，客观评估肤色深浅',
                 'props': {'instrument': 'Chromameter', 'consumer_meaning': 'ITA°升高 → 整体肤色变白变亮'}},
            ],
        },
        {
            'uri': 'cnkis:physio-elasticity',
            'label': '弹性结构系统',
            'label_en': 'ElasticitySystem',
            'definition': '皮肤弹性和抗皱相关指标',
            'children': [
                {'uri': 'cnkis:ind-r2', 'label': '皮肤弹性 R2',
                 'definition': '总弹性（Ua/Uf），反映皮肤整体弹性恢复能力',
                 'props': {'instrument': 'Cutometer', 'normal_range': '0.7-0.9',
                          'consumer_meaning': 'R2 越高 → 皮肤越弹润紧致'}},
                {'uri': 'cnkis:ind-r7', 'label': '生物弹性 R7',
                 'definition': '即时回弹比例（Ur/Uf），反映真皮层弹性',
                 'props': {'instrument': 'Cutometer', 'consumer_meaning': 'R7 越高 → 皮肤回弹越快、越年轻'}},
                {'uri': 'cnkis:ind-rz', 'label': '皱纹深度 Rz',
                 'definition': '皮肤表面粗糙度/皱纹深度 (μm)',
                 'props': {'instrument': 'PRIMOS/Visiometer', 'consumer_meaning': 'Rz 降低 → 纹路变浅、更光滑'}},
                {'uri': 'cnkis:ind-ra', 'label': '粗糙度 Ra',
                 'definition': '皮肤表面平均粗糙度 (μm)',
                 'props': {'instrument': 'PRIMOS', 'consumer_meaning': 'Ra 降低 → 皮肤更细腻'}},
            ],
        },
        {
            'uri': 'cnkis:physio-sebum',
            'label': '皮脂系统',
            'label_en': 'SebumSystem',
            'definition': '皮脂分泌和油光相关指标',
            'children': [
                {'uri': 'cnkis:ind-sebum', 'label': '皮脂分泌量',
                 'definition': '单位面积皮脂含量 (μg/cm²)',
                 'props': {'instrument': 'Sebumeter', 'consumer_meaning': '皮脂减少 → 面部不泛油光、妆容持久'}},
                {'uri': 'cnkis:ind-pore-area', 'label': '毛孔面积',
                 'definition': '单位面积内毛孔的总面积占比',
                 'props': {'instrument': 'VISIA/VisioFace', 'consumer_meaning': '毛孔面积缩小 → 皮肤更细腻'}},
            ],
        },
        {
            'uri': 'cnkis:physio-inflammation',
            'label': '炎症反应指标',
            'label_en': 'InflammationIndicators',
            'definition': '皮肤炎症和刺激性相关指标',
            'children': [
                {'uri': 'cnkis:ind-erythema', 'label': '红斑指数 (EI)',
                 'definition': '皮肤血红蛋白含量，反映炎症和血管反应',
                 'props': {'instrument': 'Mexameter', 'consumer_meaning': 'EI降低 → 红血丝淡化、不再泛红'}},
            ],
        },
        {
            'uri': 'cnkis:physio-hair',
            'label': '毛发指标系统',
            'label_en': 'HairIndicators',
            'definition': '头发和体毛的物理化学特性指标',
            'children': [
                {'uri': 'cnkis:ind-hair-tensile', 'label': '头发拉伸强度',
                 'definition': '单根头发的抗拉伸断裂力 (g)',
                 'props': {'consumer_meaning': '强度越高 → 头发越强韧不易断'}},
                {'uri': 'cnkis:ind-hair-gloss', 'label': '头发光泽度',
                 'definition': '头发表面反射光的能力',
                 'props': {'instrument': 'Glossymeter', 'consumer_meaning': '光泽越高 → 秀发更亮泽'}},
                {'uri': 'cnkis:ind-hair-moisture', 'label': '头发含水率',
                 'definition': '头发内部水分含量百分比',
                 'props': {'consumer_meaning': '含水率适中 → 柔顺不毛躁'}},
            ],
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════
# 第五维：诊断方法维（Diagnostic Dimension）
# 如何测量——仪器、方法、标准
# ═══════════════════════════════════════════════════════════════════

DIAGNOSTIC_DIMENSION = {
    'uri': 'cnkis:diagnostic-dimension',
    'label': '诊断方法维',
    'label_en': 'DiagnosticDimension',
    'definition': '功效评价的方法学体系：仪器、方法、标准、评估',
    'entity_type': EntityType.CLASS,
    'children': [
        {
            'uri': 'cnkis:diag-instrument',
            'label': '仪器评估',
            'label_en': 'InstrumentalAssessment',
            'definition': '基于专业仪器的客观定量评估',
            'children': [
                {'uri': 'cnkis:inst-corneometer', 'label': 'Corneometer (皮肤水分)',
                 'definition': '基于电容原理测量角质层含水量 (Courage+Khazaka)',
                 'props': {'measures': ['hydration'], 'principle': '电容法', 'claims': ['保湿']}},
                {'uri': 'cnkis:inst-tewameter', 'label': 'Tewameter (经皮水分散失)',
                 'definition': '开放式腔体蒸发法测量 TEWL (Courage+Khazaka)',
                 'props': {'measures': ['tewl'], 'principle': '蒸发法', 'claims': ['保湿', '修复']}},
                {'uri': 'cnkis:inst-mexameter', 'label': 'Mexameter (黑色素/红斑)',
                 'definition': '窄带反射光谱法测量黑色素指数和红斑指数 (Courage+Khazaka)',
                 'props': {'measures': ['melanin', 'erythema'], 'principle': '反射光谱法', 'claims': ['美白', '舒缓']}},
                {'uri': 'cnkis:inst-cutometer', 'label': 'Cutometer (皮肤弹性)',
                 'definition': '负压吸引法测量皮肤弹性参数 R0-R9 (Courage+Khazaka)',
                 'props': {'measures': ['r2', 'r7'], 'principle': '负压吸引法', 'claims': ['抗皱', '紧致']}},
                {'uri': 'cnkis:inst-sebumeter', 'label': 'Sebumeter (皮脂)',
                 'definition': '吸收光度法测量皮脂分泌量 (Courage+Khazaka)',
                 'props': {'measures': ['sebum'], 'principle': '吸收光度法', 'claims': ['控油']}},
                {'uri': 'cnkis:inst-visia', 'label': 'VISIA (面部图像分析)',
                 'definition': '多光谱面部成像系统，分析斑点/皱纹/纹理/毛孔/UV损伤/红斑 (Canfield)',
                 'props': {'measures': ['spots', 'wrinkles', 'texture', 'pores', 'UV', 'red_areas'],
                          'principle': '多光谱图像分析', 'claims': ['美白', '抗皱', '细致毛孔']}},
                {'uri': 'cnkis:inst-chromameter', 'label': 'Chromameter (肤色)',
                 'definition': '三刺激值色彩测量仪，CIE L*a*b* 色彩空间 (Konica Minolta)',
                 'props': {'measures': ['L*', 'a*', 'b*', 'ITA°'], 'principle': '比色法', 'claims': ['美白']}},
                {'uri': 'cnkis:inst-primos', 'label': 'PRIMOS (皮肤三维形貌)',
                 'definition': '条纹光投影法测量皮肤表面三维形貌 (GFMesstechnik)',
                 'props': {'measures': ['Rz', 'Ra', 'wrinkle_volume'], 'principle': '结构光三维成像', 'claims': ['抗皱']}},
            ],
        },
        {
            'uri': 'cnkis:diag-expert',
            'label': '专家评估',
            'label_en': 'ExpertAssessment',
            'definition': '由训练有素的专业人员进行的视觉/触觉评估',
            'children': [
                {'uri': 'cnkis:expert-visual-grading', 'label': '专家目视评分',
                 'definition': '皮肤科医生或训练评估员对皮肤状态的标准化视觉评分（0-9分制或摄影参照法）'},
                {'uri': 'cnkis:expert-sensory-panel', 'label': '感官评估小组',
                 'definition': '经过标准化训练的 8-15 人感官评估小组，对产品质地、肤感、气味等进行描述性分析'},
                {'uri': 'cnkis:expert-derma-assessment', 'label': '皮肤科专家评估',
                 'definition': '执业皮肤科医生对皮肤状态的临床评估'},
            ],
        },
        {
            'uri': 'cnkis:diag-pro',
            'label': '受试者自评 (PRO)',
            'label_en': 'PatientReportedOutcome',
            'definition': '受试者/消费者主观感受的标准化采集',
            'children': [
                {'uri': 'cnkis:pro-vas', 'label': 'VAS 视觉模拟评分',
                 'definition': '0-100mm 线段标记法，量化主观感受强度'},
                {'uri': 'cnkis:pro-likert', 'label': 'Likert 等级量表',
                 'definition': '5/7 级等级评分（非常不同意→非常同意）'},
                {'uri': 'cnkis:pro-questionnaire', 'label': '结构化问卷',
                 'definition': '针对特定功效的消费者自评问卷（满意度、改善感、使用意愿等）'},
                {'uri': 'cnkis:pro-diary', 'label': '使用日记',
                 'definition': '受试者每日记录使用感受、皮肤状态变化的结构化日记'},
            ],
        },
        {
            'uri': 'cnkis:diag-statistical',
            'label': '统计分析方法',
            'label_en': 'StatisticalMethods',
            'definition': '功效评价数据的统计分析方法体系',
            'children': [
                {'uri': 'cnkis:stat-paired-t', 'label': '配对 t 检验', 'definition': '正态分布数据的使用前后配对比较'},
                {'uri': 'cnkis:stat-wilcoxon', 'label': 'Wilcoxon 符号秩检验', 'definition': '非正态分布数据的非参数配对检验'},
                {'uri': 'cnkis:stat-cohens-d', 'label': "Cohen's d 效应量", 'definition': '量化改善幅度的实际意义（0.2小/0.5中/0.8大）'},
                {'uri': 'cnkis:stat-improvement-rate', 'label': '改善率/有效率', 'definition': '达到预设改善阈值的受试者比例'},
            ],
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════
# 第六维：消费者画像深化（Consumer Dimension Enhancement）
# 在已有 IBKD 8 维框架基础上深化
# ═══════════════════════════════════════════════════════════════════

CONSUMER_ENHANCEMENT = {
    'uri': 'cnkis:consumer-enhancement',
    'label': '消费者画像深化',
    'label_en': 'ConsumerProfileEnhancement',
    'definition': '在 IBKD 8 维框架基础上补充需求层次、生命阶段和未来美学',
    'entity_type': EntityType.CLASS,
    'children': [
        {
            'uri': 'cnkis:need-hierarchy',
            'label': '护肤需求层次',
            'label_en': 'SkincareNeedHierarchy',
            'definition': '从基础安全到自我实现的护肤需求金字塔',
            'children': [
                {'uri': 'cnkis:need-safety', 'label': '安全需求', 'definition': '不过敏、不刺激、成分安全——基础门槛'},
                {'uri': 'cnkis:need-functional', 'label': '功能需求', 'definition': '保湿、美白、防晒——具体功效解决具体问题'},
                {'uri': 'cnkis:need-experiential', 'label': '体验需求', 'definition': '质地好、好闻、使用愉悦——超越功效的感受'},
                {'uri': 'cnkis:need-emotional', 'label': '情绪需求', 'definition': '自信、安心、仪式感——心理层面的满足'},
                {'uri': 'cnkis:need-identity', 'label': '身份认同', 'definition': '"我是注重生活品质的人"——社会身份表达'},
            ],
        },
        {
            'uri': 'cnkis:life-stage',
            'label': '生命阶段',
            'label_en': 'LifeStage',
            'definition': '不同生命阶段的皮肤特征和护肤需求',
            'children': [
                {'uri': 'cnkis:stage-teen', 'label': '青春期 (13-18)', 'definition': '油脂旺盛、痘痘、初次建立护肤意识',
                 'props': {'key_concerns': ['痘痘', '控油', '基础护肤教育']}},
                {'uri': 'cnkis:stage-young-adult', 'label': '职场新人 (18-25)', 'definition': '熬夜、压力、开始关注成分和品牌',
                 'props': {'key_concerns': ['保湿', '提亮', '防晒', '性价比']}},
                {'uri': 'cnkis:stage-prime', 'label': '成熟期 (25-35)', 'definition': '初老迹象、功效需求升级、愿意投入',
                 'props': {'key_concerns': ['抗初老', '美白', '屏障', '精华升级']}},
                {'uri': 'cnkis:stage-maternal', 'label': '孕产期', 'definition': '激素变化、成分安全极度敏感、特殊需求',
                 'props': {'key_concerns': ['安全', '温和', '孕期色斑', '妊娠纹']}},
                {'uri': 'cnkis:stage-mature', 'label': '熟龄期 (35-50)', 'definition': '抗衰老核心期、紧致需求、高端产品偏好',
                 'props': {'key_concerns': ['抗皱', '紧致', '提拉', '深层滋养']}},
                {'uri': 'cnkis:stage-silver', 'label': '银发养护 (50+)', 'definition': '皮肤薄化、屏障脆弱、追求舒适和尊严',
                 'props': {'key_concerns': ['保湿', '修复', '温和', '防晒']}},
            ],
        },
        {
            'uri': 'cnkis:future-beauty',
            'label': '未来美学观',
            'label_en': 'FutureBeautyPhilosophy',
            'definition': '新世代消费者正在重新定义的"美"的概念',
            'children': [
                {'uri': 'cnkis:beauty-personalized', 'label': '个性化美', 'definition': '"适合我的就是最好的"——基因/肤质定制'},
                {'uri': 'cnkis:beauty-sustainable', 'label': '可持续美', 'definition': '清洁成分、绿色包装、零残忍、碳中和'},
                {'uri': 'cnkis:beauty-tech', 'label': '科技美', 'definition': '生物科技、细胞级修护、智能护肤设备'},
                {'uri': 'cnkis:beauty-natural', 'label': '自然美', 'definition': '追求自然状态的健康美，而非人工修饰'},
                {'uri': 'cnkis:beauty-inclusive', 'label': '包容美', 'definition': '多元肤色、年龄、性别的美的包容'},
            ],
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════
# 六维交叉关系定义
# 这些关系是"价值创造引擎"的核心——把孤立维度连成网
# ═══════════════════════════════════════════════════════════════════

CROSS_DIMENSION_RELATIONS = [
    # 宣称 ←→ 生理指标
    ('cnkis:claim-moisturizing', 'cnkis:ind-hydration', 'measured_by', '保湿宣称的核心指标'),
    ('cnkis:claim-moisturizing', 'cnkis:ind-tewl', 'measured_by', '保湿宣称的屏障指标'),
    ('cnkis:claim-whitening', 'cnkis:ind-melanin', 'measured_by', '美白宣称的核心指标'),
    ('cnkis:claim-whitening', 'cnkis:ind-luminance', 'measured_by', '美白宣称的明度指标'),
    ('cnkis:claim-whitening', 'cnkis:ind-ita', 'measured_by', '美白宣称的肤色角指标'),
    ('cnkis:claim-anti-wrinkle', 'cnkis:ind-r2', 'measured_by', '抗皱宣称的弹性指标'),
    ('cnkis:claim-anti-wrinkle', 'cnkis:ind-rz', 'measured_by', '抗皱宣称的皱纹深度指标'),
    ('cnkis:claim-repair', 'cnkis:ind-tewl', 'measured_by', '修复宣称的屏障恢复指标'),
    ('cnkis:claim-repair', 'cnkis:ind-erythema', 'measured_by', '修复宣称的红斑指标'),
    ('cnkis:claim-oil-control', 'cnkis:ind-sebum', 'measured_by', '控油宣称的核心指标'),
    ('cnkis:claim-firming', 'cnkis:ind-r2', 'measured_by', '紧致宣称的弹性指标'),
    ('cnkis:claim-firming', 'cnkis:ind-r7', 'measured_by', '紧致宣称的回弹指标'),
    ('cnkis:claim-soothing', 'cnkis:ind-erythema', 'measured_by', '舒缓宣称的红斑指标'),
    ('cnkis:claim-pore-minimizing', 'cnkis:ind-pore-area', 'measured_by', '细致毛孔的核心指标'),
    ('cnkis:claim-anti-hair-loss', 'cnkis:ind-hair-tensile', 'measured_by', '防脱发的发质指标'),
    ('cnkis:claim-hair-care', 'cnkis:ind-hair-gloss', 'measured_by', '护发的光泽指标'),

    # 生理指标 ←→ 仪器
    ('cnkis:ind-hydration', 'cnkis:inst-corneometer', 'measured_by', 'Corneometer 测角质层含水量'),
    ('cnkis:ind-tewl', 'cnkis:inst-tewameter', 'measured_by', 'Tewameter 测 TEWL'),
    ('cnkis:ind-melanin', 'cnkis:inst-mexameter', 'measured_by', 'Mexameter 测黑色素'),
    ('cnkis:ind-erythema', 'cnkis:inst-mexameter', 'measured_by', 'Mexameter 测红斑'),
    ('cnkis:ind-luminance', 'cnkis:inst-chromameter', 'measured_by', 'Chromameter 测 L*'),
    ('cnkis:ind-r2', 'cnkis:inst-cutometer', 'measured_by', 'Cutometer 测弹性'),
    ('cnkis:ind-r7', 'cnkis:inst-cutometer', 'measured_by', 'Cutometer 测回弹'),
    ('cnkis:ind-rz', 'cnkis:inst-primos', 'measured_by', 'PRIMOS 测皱纹深度'),
    ('cnkis:ind-sebum', 'cnkis:inst-sebumeter', 'measured_by', 'Sebumeter 测皮脂'),
    ('cnkis:ind-pore-area', 'cnkis:inst-visia', 'measured_by', 'VISIA 测毛孔面积'),

    # 宣称 ←→ 感官（消费者能感受到什么）
    ('cnkis:claim-moisturizing', 'cnkis:afterfeel-dewy', 'translates_to', '保湿 → 润泽光感的肤感'),
    ('cnkis:claim-moisturizing', 'cnkis:temporal-allday', 'translates_to', '保湿 → 一整天效果'),
    ('cnkis:claim-whitening', 'cnkis:visual-brightening', 'translates_to', '美白 → 即时提亮'),
    ('cnkis:claim-whitening', 'cnkis:visual-even', 'translates_to', '美白 → 均匀肤色'),
    ('cnkis:claim-anti-wrinkle', 'cnkis:afterfeel-plump', 'translates_to', '抗皱 → 饱满弹润肤感'),
    ('cnkis:claim-oil-control', 'cnkis:afterfeel-matte', 'translates_to', '控油 → 清爽哑光'),
    ('cnkis:claim-soothing', 'cnkis:afterfeel-smooth', 'translates_to', '舒缓 → 柔滑如丝'),

    # 宣称 ←→ 情绪（为什么消费者愿意付溢价）
    ('cnkis:claim-moisturizing', 'cnkis:emo-control', 'produces', '保湿效果 → 皮肤控制感'),
    ('cnkis:claim-whitening', 'cnkis:emo-bare-face', 'produces', '美白效果 → 素颜自信'),
    ('cnkis:claim-anti-wrinkle', 'cnkis:emo-aging-anxiety', 'produces', '抗皱效果 → 缓解抗老焦虑'),
    ('cnkis:claim-repair', 'cnkis:emo-gentle-assurance', 'produces', '修复效果 → 温和保证'),
    ('cnkis:claim-soothing', 'cnkis:emo-skin-anxiety', 'produces', '舒缓效果 → 缓解肌肤焦虑'),

    # 生命阶段 ←→ 功效需求
    ('cnkis:stage-teen', 'cnkis:claim-oil-control', 'related_to', '青春期核心需求：控油'),
    ('cnkis:stage-young-adult', 'cnkis:claim-moisturizing', 'related_to', '职场新人核心需求：保湿'),
    ('cnkis:stage-prime', 'cnkis:claim-anti-wrinkle', 'related_to', '成熟期核心需求：抗初老'),
    ('cnkis:stage-maternal', 'cnkis:claim-repair', 'related_to', '孕产期核心需求：安全修复'),
    ('cnkis:stage-mature', 'cnkis:claim-firming', 'related_to', '熟龄期核心需求：紧致'),
    ('cnkis:stage-silver', 'cnkis:claim-repair', 'related_to', '银发期核心需求：修复保护'),

    # 情绪 ←→ 感官（感官体验如何产生情绪价值）
    ('cnkis:afterfeel-dewy', 'cnkis:emo-progress', 'produces', '润泽肤感 → 皮肤在变好的成就感'),
    ('cnkis:afterfeel-smooth', 'cnkis:emo-close-up', 'produces', '柔滑肤感 → 近距离社交自信'),
    ('cnkis:scent-light', 'cnkis:emo-me-time', 'produces', '淡雅香气 → 自我关爱时刻'),
    ('cnkis:absorption-instant', 'cnkis:emo-routine-joy', 'produces', '即刻吸收 → 日常小确幸'),

    # 需求层次链
    ('cnkis:need-safety', 'cnkis:need-functional', 'precedes', '安全是功效的前提'),
    ('cnkis:need-functional', 'cnkis:need-experiential', 'precedes', '功效满足后追求体验'),
    ('cnkis:need-experiential', 'cnkis:need-emotional', 'precedes', '体验满足后追求情绪价值'),
    ('cnkis:need-emotional', 'cnkis:need-identity', 'precedes', '情绪满足后追求身份认同'),
]


class Command(BaseCommand):
    help = '导入多维一体本体（功效宣称×感官体验×情绪价值×生理指标×诊断方法×消费者画像深化）'

    def handle(self, *args, **options):
        stats = {'entities': 0, 'relations': 0, 'skipped': 0}

        dimensions = [
            ('功效宣称维', CLAIM_DIMENSION),
            ('感官体验维', SENSORY_DIMENSION),
            ('情绪价值维', EMOTIONAL_DIMENSION),
            ('生理指标维', PHYSIOLOGICAL_DIMENSION),
            ('诊断方法维', DIAGNOSTIC_DIMENSION),
            ('消费者画像深化', CONSUMER_ENHANCEMENT),
        ]

        for dim_name, dim_data in dimensions:
            self.stdout.write(self.style.HTTP_INFO(f'\n=== 导入 {dim_name} ==='))
            self._import_tree(dim_data, parent=None, stats=stats)

        self.stdout.write(self.style.HTTP_INFO('\n=== 建立六维交叉关系 ==='))
        for src_uri, tgt_uri, rel_type, note in CROSS_DIMENSION_RELATIONS:
            src = KnowledgeEntity.objects.filter(namespace=NS, uri=src_uri).first()
            tgt = KnowledgeEntity.objects.filter(namespace=NS, uri=tgt_uri).first()
            if not src or not tgt:
                self.stdout.write(self.style.WARNING(f'  ! 跳过: {src_uri} → {tgt_uri} (实体不存在)'))
                stats['skipped'] += 1
                continue
            _, created = KnowledgeRelation.objects.get_or_create(
                subject=src, object=tgt,
                predicate_uri=f'cnkis:{rel_type}',
                defaults={
                    'relation_type': rel_type,
                    'confidence': 1.0,
                    'source': f'multidim_ontology|{note}',
                },
            )
            if created:
                stats['relations'] += 1
                self.stdout.write(f'  + {src.label} ──{rel_type}──→ {tgt.label}')

        self.stdout.write(self.style.SUCCESS(
            f'\n导入完成: 创建 {stats["entities"]} 实体, '
            f'{stats["relations"]} 关系, '
            f'跳过 {stats["skipped"]}'
        ))

    def _import_tree(self, node, parent, stats, depth=0):
        uri = node['uri']
        entity, created = KnowledgeEntity.objects.get_or_create(
            namespace=NS, uri=uri,
            defaults={
                'label': node['label'],
                'label_en': node.get('label_en', ''),
                'definition': node.get('definition', ''),
                'entity_type': node.get('entity_type', EntityType.CONCEPT),
                'parent': parent,
                'properties': node.get('props', {}),
            },
        )
        if created:
            stats['entities'] += 1
            indent = '  ' * (depth + 1)
            self.stdout.write(f'{indent}+ {node["label"]} ({uri})')

            # 为每个实体创建对应的 KnowledgeEntry 并建立 linked_entry 桥接
            entry, _ = KnowledgeEntry.objects.get_or_create(
                source_type='ontology_import',
                source_key=f'multidim:{uri}',
                defaults={
                    'title': node['label'],
                    'content': f'{node["label"]}: {node.get("definition", "")}',
                    'summary': node.get('definition', '')[:200],
                    'entry_type': EntryType.METHOD_REFERENCE,
                    'namespace': NS,
                    'uri': uri,
                    'tags': ['本体', '多维本体', node.get('label_en', '')],
                    'is_published': True,
                    'status': 'published',
                },
            )
            entity.linked_entry = entry
            entity.save(update_fields=['linked_entry'])

            if parent:
                _, rc = KnowledgeRelation.objects.get_or_create(
                    subject=entity, object=parent,
                    predicate_uri='cnkis:part_of',
                    defaults={
                        'relation_type': RelationType.PART_OF,
                        'confidence': 1.0,
                        'source': 'multidim_ontology',
                    },
                )
                if rc:
                    stats['relations'] += 1
        elif entity.linked_entry_id is None:
            # 补充关联已存在但未关联的实体
            entry, _ = KnowledgeEntry.objects.get_or_create(
                source_type='ontology_import',
                source_key=f'multidim:{uri}',
                defaults={
                    'title': node['label'],
                    'content': f'{node["label"]}: {node.get("definition", "")}',
                    'summary': node.get('definition', '')[:200],
                    'entry_type': EntryType.METHOD_REFERENCE,
                    'namespace': NS,
                    'uri': uri,
                    'tags': ['本体', '多维本体', node.get('label_en', '')],
                    'is_published': True,
                    'status': 'published',
                },
            )
            entity.linked_entry = entry
            entity.save(update_fields=['linked_entry'])

        for child in node.get('children', []):
            self._import_tree(child, parent=entity, stats=stats, depth=depth + 1)
