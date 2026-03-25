"""
导入化妆品功效评价词库（继承 IBKD 功效词库 + DataCollection 体验词库）

将功效术语和体验描述词导入为 KnowledgeEntry（method_reference 类型），
同时创建对应的 KnowledgeEntity 以支持图谱检索。
Entity 通过 linked_entry 关联到 Entry，使图谱检索通道（_graph_recall）可正常工作。

用法: python manage.py import_efficacy_terms
"""
from django.core.management.base import BaseCommand
from apps.knowledge.models import (
    KnowledgeEntry, KnowledgeEntity,
    EntryType, EntityType, OntologyNamespace,
)


EFFICACY_CATEGORIES = {
    '保湿': {
        'instruments': ['Corneometer', 'Tewameter'],
        'indicators': ['角质层含水量', '经皮水分散失 (TEWL)', '皮肤阻抗'],
        'methods': ['皮肤电容法', '蒸发法 (开放式腔体)'],
        'standards': ['QB/T 4655', 'EEMCO 指南'],
        'terms': [
            '深层保湿', '锁水屏障', '透明质酸', '神经酰胺', '角鲨烷',
            '水油平衡', '24h 持续保湿', '即时补水', '屏障修护',
        ],
    },
    '美白': {
        'instruments': ['Mexameter', 'Chromameter', 'VISIA'],
        'indicators': ['黑色素指数 (MI)', 'L*值 (明度)', 'ITA°值'],
        'methods': ['窄带反射光谱法', '比色法', '图像分析'],
        'standards': ['QB/T 2660', 'NMPA 美白特证'],
        'terms': [
            '淡斑', '提亮肤色', '抑制黑色素', '均匀肤色', '烟酰胺',
            '维C衍生物', '熊果苷', '曲酸', '光甘草定', '传明酸',
        ],
    },
    '抗皱': {
        'instruments': ['Cutometer', 'Visiometer', 'PRIMOS'],
        'indicators': ['R2 (皮肤弹性)', 'R7 (生物弹性)', 'Rz (皱纹深度)', 'Ra (粗糙度)'],
        'methods': ['负压吸引法', '硅胶复模法', '结构光三维成像'],
        'standards': ['GB/T 37625', 'EEMCO 弹性指南'],
        'terms': [
            '紧致', '淡纹', '视黄醇', 'A醇', '胜肽', '玻色因',
            '胶原蛋白', '弹力纤维', 'V脸提升', '法令纹改善',
        ],
    },
    '防晒': {
        'instruments': ['SPF 测试系统', 'UVA-PF 测试仪', '光谱透射仪'],
        'indicators': ['SPF 值', 'PA 等级', 'UVA-PF', 'UVAPF/SPF 比值'],
        'methods': ['人体法 (ISO 24444)', '体外法 (ISO 24443)', '防水测试 (ISO 16217)'],
        'standards': ['GB/T 35803', 'ISO 24444:2019', 'FDA Final Rule'],
        'terms': [
            '广谱防晒', 'UVA/UVB', '物理防晒', '化学防晒',
            '防晒伤', '光老化防护', '蓝光防护', '户外防晒',
        ],
    },
    '修复': {
        'instruments': ['Tewameter', 'Corneometer', '皮肤镜'],
        'indicators': ['TEWL 恢复率', '角质层含水量', '红斑指数'],
        'methods': ['SLS 损伤模型', '胶带剥离模型', '自然损伤评估'],
        'standards': ['EEMCO 屏障指南'],
        'terms': [
            '屏障修复', '舒缓镇定', '退红', '角质层重建',
            '益生元', '神经酰胺', '积雪草', '泛醇', '尿囊素',
        ],
    },
    '控油': {
        'instruments': ['Sebumeter', 'Sebufix'],
        'indicators': ['皮脂分泌量 (μg/cm²)', '皮脂分泌速率'],
        'methods': ['吸收光度法', '接触式胶带法'],
        'standards': ['EEMCO 皮脂测量指南'],
        'terms': [
            '控油', '水杨酸', '烟酰胺控油', '毛孔收缩',
            '哑光', '持久清爽', 'T区控油',
        ],
    },
}

EXPERIENCE_TERMS = [
    ('清爽感', '产品涂抹后皮肤不黏腻、透气的感受'),
    ('滋润度', '产品涂抹后皮肤滋润、柔软的程度'),
    ('吸收速度', '产品涂抹后被皮肤吸收的快慢'),
    ('延展性', '产品在皮肤表面推开的容易程度'),
    ('肤感', '产品与皮肤接触后的整体触感'),
    ('香气', '产品的气味特征及接受度'),
    ('光泽度', '使用后皮肤表面的光泽变化'),
    ('即时效果', '使用后立即可感知的改善效果'),
    ('持续性', '使用效果随时间的持续情况'),
    ('温和性', '产品对皮肤的刺激程度'),
    ('妆容服帖', '使用后对后续底妆服帖度的影响'),
    ('起皮搓泥', '产品使用后是否出现起皮或搓泥现象'),
]


class Command(BaseCommand):
    help = '导入化妆品功效评价词库（功效术语 + 体验描述词）'

    def handle(self, *args, **options):
        entries_created = 0
        entities_created = 0

        self.stdout.write('导入功效评价词库...')
        for category, data in EFFICACY_CATEGORIES.items():
            content_parts = [
                f'# {category}功效评价',
                '',
                '## 测量仪器\n' + '\n'.join(f'- {i}' for i in data['instruments']),
                '## 评价指标\n' + '\n'.join(f'- {i}' for i in data['indicators']),
                '## 测试方法\n' + '\n'.join(f'- {m}' for m in data['methods']),
                '## 参考标准\n' + '\n'.join(f'- {s}' for s in data['standards']),
                '## 相关术语\n' + '\n'.join(f'- {t}' for t in data['terms']),
            ]

            entry, created = KnowledgeEntry.objects.get_or_create(
                source_type='efficacy_import',
                source_key=f'efficacy-{category}',
                defaults={
                    'title': f'功效评价参考：{category}',
                    'content': '\n'.join(content_parts),
                    'summary': f'{category}功效评价的仪器、指标、方法和标准参考',
                    'entry_type': EntryType.METHOD_REFERENCE,
                    'namespace': OntologyNamespace.CNKIS,
                    'tags': [category, '功效评价', '方法参考'],
                    'is_published': True,
                },
            )
            if created:
                entries_created += 1
                self.stdout.write(f'  + 功效词条: {category}')

            entity, ec = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.CNKIS,
                uri=f'cnkis:efficacy-{category}',
                defaults={
                    'label': f'{category}功效评价',
                    'label_en': f'{category}EfficacyEvaluation',
                    'definition': f'化妆品{category}功效的评价方法体系',
                    'entity_type': EntityType.CONCEPT,
                    'linked_entry': entry,
                },
            )
            if ec:
                entities_created += 1
            elif entity.linked_entry_id is None:
                # 补充关联已存在但未关联的实体
                entity.linked_entry = entry
                entity.save(update_fields=['linked_entry'])

        self.stdout.write('\n导入体验描述词库...')
        for term, definition in EXPERIENCE_TERMS:
            entry, created = KnowledgeEntry.objects.get_or_create(
                source_type='efficacy_import',
                source_key=f'experience-{term}',
                defaults={
                    'title': f'体验描述词：{term}',
                    'content': definition,
                    'summary': definition,
                    'entry_type': EntryType.METHOD_REFERENCE,
                    'namespace': OntologyNamespace.CNKIS,
                    'tags': ['体验描述', '感官评估', term],
                    'is_published': True,
                },
            )
            if created:
                entries_created += 1
                self.stdout.write(f'  + 体验词: {term}')

            # 为体验描述词创建对应实体并关联
            exp_entity, exp_ec = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.CNKIS,
                uri=f'cnkis:experience-{term}',
                defaults={
                    'label': term,
                    'label_en': term,
                    'definition': definition,
                    'entity_type': EntityType.CONCEPT,
                    'linked_entry': entry,
                },
            )
            if exp_ec:
                entities_created += 1
            elif exp_entity.linked_entry_id is None:
                exp_entity.linked_entry = entry
                exp_entity.save(update_fields=['linked_entry'])

        self.stdout.write(self.style.SUCCESS(
            f'\n导入完成: 创建 {entries_created} 个知识条目, '
            f'{entities_created} 个知识实体'
        ))
