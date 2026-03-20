"""
导入消费者画像本体（继承 IBKD 8 维画像模型）

将消费者画像的概念层次编码为 KnowledgeEntity + KnowledgeRelation。
同时导入消费者旅程（ZMOT-TMOT）和双轨知识翻译模板。
Entity 通过 linked_entry 关联到 KnowledgeEntry，使图谱检索通道可正常工作。

用法: python manage.py import_consumer_ontology
"""
from django.core.management.base import BaseCommand
from apps.knowledge.models import (
    KnowledgeEntry, KnowledgeEntity, KnowledgeRelation,
    EntryType, EntityType, OntologyNamespace, RelationType,
)


CONSUMER_ONTOLOGY = {
    'root': {
        'uri': 'cnkis:consumer-profile',
        'label': '消费者画像',
        'label_en': 'ConsumerProfile',
        'definition': '化妆品消费者多维画像模型，基于 IBKD 8 维框架',
        'children': [
            {
                'uri': 'cnkis:demographics',
                'label': '人口统计',
                'label_en': 'Demographics',
                'definition': '年龄、性别、地域、收入等基本人口统计特征',
            },
            {
                'uri': 'cnkis:skin-profile',
                'label': '肤质档案',
                'label_en': 'SkinProfile',
                'definition': '皮肤类型、问题、周期等皮肤学特征',
                'children': [
                    {'uri': 'cnkis:skin-type', 'label': '肤质类型', 'label_en': 'SkinType',
                     'definition': '干性/油性/混合/中性/敏感/耐受/脂溢 7 种基础肤质'},
                    {'uri': 'cnkis:skin-concern', 'label': '皮肤问题', 'label_en': 'SkinConcern',
                     'definition': '痘痘/色斑/皱纹/毛孔/暗沉/干燥/红敏/松弛 8 类主要皮肤问题'},
                    {'uri': 'cnkis:skin-cycle', 'label': '皮肤周期', 'label_en': 'SkinCycle',
                     'definition': '季节变化/生理周期/年龄阶段/环境适应等周期性皮肤变化'},
                ],
            },
            {
                'uri': 'cnkis:efficacy-need',
                'label': '功效需求',
                'label_en': 'EfficacyNeed',
                'definition': '消费者对化妆品功效的核心需求（保湿/美白/抗皱/防晒/修复等）',
            },
            {
                'uri': 'cnkis:sensory-preference',
                'label': '感官偏好',
                'label_en': 'SensoryPreference',
                'definition': '质地/香型/吸收速度/使用感受等感官维度偏好',
            },
            {
                'uri': 'cnkis:emotional-value',
                'label': '情绪价值',
                'label_en': 'EmotionalValue',
                'definition': '自信/愉悦/仪式感/身份认同等情感层面价值',
            },
            {
                'uri': 'cnkis:consumption-behavior',
                'label': '消费行为',
                'label_en': 'ConsumptionBehavior',
                'definition': '购买频次/价格敏感度/渠道偏好/决策周期等消费行为特征',
            },
            {
                'uri': 'cnkis:information-touchpoint',
                'label': '信息触点',
                'label_en': 'InformationTouchpoint',
                'definition': '小红书/抖音/知乎/专柜BA/皮肤科医生等信息获取渠道',
            },
            {
                'uri': 'cnkis:brand-attitude',
                'label': '品牌态度',
                'label_en': 'BrandAttitude',
                'definition': '品牌忠诚度/国货偏好/成分党/功效党等品牌认知态度',
            },
        ],
    },
}

CONSUMER_JOURNEY = [
    {
        'uri': 'cnkis:zmot',
        'label': 'ZMOT 搜索种草',
        'label_en': 'ZMOT',
        'definition': 'Zero Moment of Truth — 搜索发现、种草阶段',
    },
    {
        'uri': 'cnkis:fmot',
        'label': 'FMOT 购买决策',
        'label_en': 'FMOT',
        'definition': 'First Moment of Truth — 比较评估、购买决策阶段',
    },
    {
        'uri': 'cnkis:smot',
        'label': 'SMOT 使用体验',
        'label_en': 'SMOT',
        'definition': 'Second Moment of Truth — 产品使用、体验评价阶段',
    },
    {
        'uri': 'cnkis:tmot',
        'label': 'TMOT 分享复购',
        'label_en': 'TMOT',
        'definition': 'Third Moment of Truth — 口碑分享、复购推荐阶段',
    },
]

DUAL_TRACK_TEMPLATE = [
    ('cnkis:consumer-language', '消费者语言 (L1)', 'ConsumerLanguage',
     'translates_to', 'cnkis:research-construct', '研究构念 (R1)', 'ResearchConstruct'),
    ('cnkis:research-construct', '研究构念 (R1)', 'ResearchConstruct',
     'produces', 'cnkis:measurement-indicator', '测量指标 (L2/R2)', 'MeasurementIndicator'),
    ('cnkis:measurement-indicator', '测量指标 (L2/R2)', 'MeasurementIndicator',
     'produces', 'cnkis:sop-step', 'SOP 步骤 (L3/R3)', 'SOPStep'),
]

NS = OntologyNamespace.CNKIS


class Command(BaseCommand):
    help = '导入消费者画像本体（8 维模型 + 消费者旅程 + 双轨模板）'

    def handle(self, *args, **options):
        entities_created = 0
        relations_created = 0

        # 1. 导入 8 维画像本体
        self.stdout.write('导入消费者画像本体...')
        root_data = CONSUMER_ONTOLOGY['root']
        root, c = self._get_or_create_entity(root_data)
        if c:
            entities_created += 1

        for child_data in root_data.get('children', []):
            child, c = self._get_or_create_entity(child_data)
            if c:
                entities_created += 1
            rc = self._create_relation(child, root, RelationType.IS_A)
            if rc:
                relations_created += 1

            for grandchild_data in child_data.get('children', []):
                grandchild, c = self._get_or_create_entity(grandchild_data)
                if c:
                    entities_created += 1
                rc = self._create_relation(grandchild, child, RelationType.PART_OF)
                if rc:
                    relations_created += 1

        # 2. 导入消费者旅程
        self.stdout.write('导入消费者旅程 (ZMOT→TMOT)...')
        journey_root, c = KnowledgeEntity.objects.get_or_create(
            namespace=NS, uri='cnkis:consumer-journey',
            defaults={
                'label': '消费者旅程', 'label_en': 'ConsumerJourney',
                'definition': 'ZMOT→FMOT→SMOT→TMOT 消费者决策旅程模型',
                'entity_type': EntityType.CONCEPT,
            },
        )
        if c:
            entities_created += 1

        prev_stage = None
        for stage_data in CONSUMER_JOURNEY:
            stage, c = self._get_or_create_entity(stage_data)
            if c:
                entities_created += 1
            rc = self._create_relation(stage, journey_root, RelationType.PART_OF)
            if rc:
                relations_created += 1
            if prev_stage:
                rc = self._create_relation(prev_stage, stage, RelationType.PRECEDES)
                if rc:
                    relations_created += 1
            prev_stage = stage

        # 3. 导入双轨知识翻译模板
        self.stdout.write('导入双轨知识翻译模板...')
        for src_uri, src_label, src_en, rel_type, tgt_uri, tgt_label, tgt_en in DUAL_TRACK_TEMPLATE:
            src, c = KnowledgeEntity.objects.get_or_create(
                namespace=NS, uri=src_uri,
                defaults={
                    'label': src_label, 'label_en': src_en,
                    'entity_type': EntityType.CONCEPT,
                },
            )
            if c:
                entities_created += 1
            tgt, c = KnowledgeEntity.objects.get_or_create(
                namespace=NS, uri=tgt_uri,
                defaults={
                    'label': tgt_label, 'label_en': tgt_en,
                    'entity_type': EntityType.CONCEPT,
                },
            )
            if c:
                entities_created += 1
            rc = self._create_relation(src, tgt, rel_type)
            if rc:
                relations_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'\n导入完成: 创建 {entities_created} 个实体, '
            f'{relations_created} 条关系'
        ))

    def _get_or_create_entity(self, data):
        entity, created = KnowledgeEntity.objects.get_or_create(
            namespace=NS,
            uri=data['uri'],
            defaults={
                'label': data['label'],
                'label_en': data.get('label_en', ''),
                'definition': data.get('definition', ''),
                'entity_type': EntityType.CONCEPT,
            },
        )
        if created:
            self.stdout.write(f'  + {data["label"]} ({data["uri"]})')
            # 为每个实体创建对应的 KnowledgeEntry 并建立 linked_entry 桥接
            entry, _ = KnowledgeEntry.objects.get_or_create(
                source_type='ontology_import',
                source_key=f'consumer:{data["uri"]}',
                defaults={
                    'title': data['label'],
                    'content': f'{data["label"]}: {data.get("definition", "")}',
                    'summary': data.get('definition', '')[:200],
                    'entry_type': EntryType.METHOD_REFERENCE,
                    'namespace': NS,
                    'uri': data['uri'],
                    'tags': ['消费者画像', '本体', data.get('label_en', '')],
                    'is_published': True,
                    'status': 'published',
                },
            )
            entity.linked_entry = entry
            entity.save(update_fields=['linked_entry'])
        elif entity.linked_entry_id is None:
            entry, _ = KnowledgeEntry.objects.get_or_create(
                source_type='ontology_import',
                source_key=f'consumer:{data["uri"]}',
                defaults={
                    'title': data['label'],
                    'content': f'{data["label"]}: {data.get("definition", "")}',
                    'summary': data.get('definition', '')[:200],
                    'entry_type': EntryType.METHOD_REFERENCE,
                    'namespace': NS,
                    'uri': data['uri'],
                    'tags': ['消费者画像', '本体', data.get('label_en', '')],
                    'is_published': True,
                    'status': 'published',
                },
            )
            entity.linked_entry = entry
            entity.save(update_fields=['linked_entry'])
        return entity, created

    def _create_relation(self, subject, obj, relation_type):
        _, created = KnowledgeRelation.objects.get_or_create(
            subject=subject,
            object=obj,
            predicate_uri=f'cnkis:{relation_type}',
            defaults={
                'relation_type': relation_type,
                'confidence': 1.0,
                'source': 'ontology_import',
            },
        )
        return created
