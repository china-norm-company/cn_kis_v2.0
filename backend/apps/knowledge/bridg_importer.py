"""
BRIDG 本体 OWL 导入器 (K5)
...
Entity 通过 linked_entry 关联到 KnowledgeEntry，使图谱检索通道可正常工作。
"""
import logging
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

from django.db import transaction
from django.utils import timezone

from .models import (
    EntryType,
    EntityType,
    KnowledgeEntry,
    KnowledgeEntity,
    KnowledgeRelation,
    OntologyNamespace,
    RelationType,
)

logger = logging.getLogger(__name__)

OWL_NS = {
    'owl': 'http://www.w3.org/2002/07/owl#',
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
}

BRIDG_CORE_CONCEPTS: List[Dict[str, Any]] = [
    {
        'uri': 'bridg:StudySubject',
        'label': '研究受试者',
        'label_en': 'StudySubject',
        'definition': '参与研究的自然人，在研究执行中被分配唯一标识。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:StudyProtocol',
        'label': '研究方案',
        'label_en': 'StudyProtocol',
        'definition': '描述研究目标、设计、方法学和统计考量的正式文档。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:DefinedActivity',
        'label': '定义活动',
        'label_en': 'DefinedActivity',
        'definition': '在方案中定义的计划活动，如访视、检测、干预等。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:ScheduledActivity',
        'label': '排程活动',
        'label_en': 'ScheduledActivity',
        'definition': '已安排到具体时间窗的活动实例。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:PerformedActivity',
        'label': '已执行活动',
        'label_en': 'PerformedActivity',
        'definition': '实际已执行的活动记录，包含执行时间、执行人和结果。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:ExperimentalUnit',
        'label': '实验单元',
        'label_en': 'ExperimentalUnit',
        'definition': '实验中可独立观察和分析的最小单位。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:StudySite',
        'label': '研究中心',
        'label_en': 'StudySite',
        'definition': '执行研究活动的物理或逻辑场所。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:BiologicEntity',
        'label': '生物实体',
        'label_en': 'BiologicEntity',
        'definition': '生物学上可识别的实体，如组织样本、细胞等。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:Product',
        'label': '产品',
        'label_en': 'Product',
        'definition': '研究中使用的药物、器械或化妆品产品。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:Observation',
        'label': '观察/测量',
        'label_en': 'Observation',
        'definition': '对受试者进行的测量或评估，产生定量或定性数据。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:ObservationResult',
        'label': '观察结果',
        'label_en': 'ObservationResult',
        'definition': '观察/测量活动的输出数据。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:AdverseEvent',
        'label': '不良事件',
        'label_en': 'AdverseEvent',
        'definition': '受试者在研究期间发生的任何不利医学事件。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:Epoch',
        'label': '研究阶段',
        'label_en': 'Epoch',
        'definition': '研究时间线中的一个逻辑阶段（如筛选期、治疗期、随访期）。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:Arm',
        'label': '研究组',
        'label_en': 'Arm',
        'definition': '受试者按照方案被分配到的治疗组。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:DocumentVersion',
        'label': '文档版本',
        'label_en': 'DocumentVersion',
        'definition': '方案或其他受控文档的特定版本。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:DefinedEligibilityCriterion',
        'label': '入选/排除标准',
        'label_en': 'DefinedEligibilityCriterion',
        'definition': '方案中定义的受试者入选或排除条件。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:InformedConsent',
        'label': '知情同意',
        'label_en': 'InformedConsent',
        'definition': '受试者理解研究内容后自愿参与的书面确认。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:Person',
        'label': '自然人',
        'label_en': 'Person',
        'definition': '参与研究的自然人，可以是受试者、研究者或评估人员。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:Organization',
        'label': '组织机构',
        'label_en': 'Organization',
        'definition': '参与研究的组织，如 CRO、申办方、研究中心。',
        'entity_type': EntityType.CLASS,
    },
    {
        'uri': 'bridg:Device',
        'label': '设备/仪器',
        'label_en': 'Device',
        'definition': '研究中使用的测量设备或医疗器械。',
        'entity_type': EntityType.CLASS,
    },
]

BRIDG_CORE_RELATIONS: List[Dict[str, Any]] = [
    {'subject': 'bridg:StudySubject', 'object': 'bridg:Person', 'type': RelationType.IS_A, 'predicate': 'rdfs:subClassOf'},
    {'subject': 'bridg:StudySubject', 'object': 'bridg:StudyProtocol', 'type': RelationType.GOVERNED_BY, 'predicate': 'bridg:participatesIn'},
    {'subject': 'bridg:StudySubject', 'object': 'bridg:Arm', 'type': RelationType.PART_OF, 'predicate': 'bridg:assignedTo'},
    {'subject': 'bridg:ScheduledActivity', 'object': 'bridg:DefinedActivity', 'type': RelationType.IS_A, 'predicate': 'bridg:instantiates'},
    {'subject': 'bridg:PerformedActivity', 'object': 'bridg:ScheduledActivity', 'type': RelationType.FOLLOWS, 'predicate': 'bridg:fulfills'},
    {'subject': 'bridg:Observation', 'object': 'bridg:PerformedActivity', 'type': RelationType.IS_A, 'predicate': 'rdfs:subClassOf'},
    {'subject': 'bridg:Observation', 'object': 'bridg:ObservationResult', 'type': RelationType.PRODUCES, 'predicate': 'bridg:produces'},
    {'subject': 'bridg:Observation', 'object': 'bridg:Device', 'type': RelationType.DEPENDS_ON, 'predicate': 'bridg:usesDevice'},
    {'subject': 'bridg:Observation', 'object': 'bridg:StudySubject', 'type': RelationType.RELATED_TO, 'predicate': 'bridg:performedOn'},
    {'subject': 'bridg:DefinedActivity', 'object': 'bridg:Epoch', 'type': RelationType.PART_OF, 'predicate': 'bridg:belongsToEpoch'},
    {'subject': 'bridg:StudyProtocol', 'object': 'bridg:DocumentVersion', 'type': RelationType.HAS_PROPERTY, 'predicate': 'bridg:hasVersion'},
    {'subject': 'bridg:StudyProtocol', 'object': 'bridg:DefinedEligibilityCriterion', 'type': RelationType.HAS_PROPERTY, 'predicate': 'bridg:definesCriteria'},
    {'subject': 'bridg:InformedConsent', 'object': 'bridg:StudySubject', 'type': RelationType.RELATED_TO, 'predicate': 'bridg:obtainedFrom'},
    {'subject': 'bridg:StudySite', 'object': 'bridg:Organization', 'type': RelationType.IS_A, 'predicate': 'rdfs:subClassOf'},
    {'subject': 'bridg:Product', 'object': 'bridg:PerformedActivity', 'type': RelationType.RELATED_TO, 'predicate': 'bridg:usedIn'},
    {'subject': 'bridg:AdverseEvent', 'object': 'bridg:StudySubject', 'type': RelationType.RELATED_TO, 'predicate': 'bridg:observedIn'},
    {'subject': 'bridg:BiologicEntity', 'object': 'bridg:StudySubject', 'type': RelationType.PART_OF, 'predicate': 'bridg:collectedFrom'},
]

BRIDG_CRO_EXTENSIONS: List[Dict[str, Any]] = [
    {
        'uri': 'bridg:SkinAssessment',
        'label': '皮肤评估',
        'label_en': 'SkinAssessment',
        'definition': '化妆品功效检测中对皮肤进行的定量或定性评估。',
        'entity_type': EntityType.CLASS,
        'parent_uri': 'bridg:Observation',
    },
    {
        'uri': 'bridg:InstrumentMeasurement',
        'label': '仪器测量',
        'label_en': 'InstrumentMeasurement',
        'definition': '使用专业仪器（如 VISIA、Corneometer）进行的皮肤测量。',
        'entity_type': EntityType.CLASS,
        'parent_uri': 'bridg:SkinAssessment',
    },
    {
        'uri': 'bridg:VisualGrading',
        'label': '目视评分',
        'label_en': 'VisualGrading',
        'definition': '评估人员按标准化量表对皮肤进行的目视评分。',
        'entity_type': EntityType.CLASS,
        'parent_uri': 'bridg:SkinAssessment',
    },
    {
        'uri': 'bridg:SubjectReportedOutcome',
        'label': '受试者自评结果',
        'label_en': 'SubjectReportedOutcome',
        'definition': '受试者通过问卷自行报告的感受和效果评价。',
        'entity_type': EntityType.CLASS,
        'parent_uri': 'bridg:ObservationResult',
    },
    {
        'uri': 'bridg:CosmeticProduct',
        'label': '化妆品',
        'label_en': 'CosmeticProduct',
        'definition': '用于功效检测的化妆品样品。',
        'entity_type': EntityType.CLASS,
        'parent_uri': 'bridg:Product',
    },
]


def import_bridg_seed() -> Dict[str, Any]:
    """
    导入 BRIDG 核心种子数据（无需 OWL 文件）。
    包含 20 个核心类 + 5 个 CRO 扩展 + 17 个核心关系。
    每个实体都会创建关联的 KnowledgeEntry（linked_entry 桥接）。
    """
    stats = {'entities_created': 0, 'relations_created': 0, 'skipped': 0}

    bridg_root = _ensure_root_entity(
        uri='bridg:root',
        label='BRIDG 模型',
        label_en='BRIDG Model',
        definition='Biomedical Research Integrated Domain Group (ISO 14199)',
    )

    entity_map: Dict[str, KnowledgeEntity] = {'bridg:root': bridg_root}

    with transaction.atomic():
        for concept in BRIDG_CORE_CONCEPTS:
            entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.BRIDG,
                uri=concept['uri'],
                is_deleted=False,
                defaults={
                    'entity_type': concept['entity_type'],
                    'label': concept['label'],
                    'label_en': concept['label_en'],
                    'definition': concept['definition'],
                    'parent': bridg_root,
                    'properties': {'source': 'bridg-seed'},
                },
            )
            entity_map[concept['uri']] = entity
            if created:
                stats['entities_created'] += 1
            else:
                stats['skipped'] += 1
            # 确保 linked_entry 桥接
            _ensure_bridg_linked_entry(entity)

        for ext in BRIDG_CRO_EXTENSIONS:
            parent = entity_map.get(ext.get('parent_uri', ''))
            entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.BRIDG,
                uri=ext['uri'],
                is_deleted=False,
                defaults={
                    'entity_type': ext['entity_type'],
                    'label': ext['label'],
                    'label_en': ext['label_en'],
                    'definition': ext['definition'],
                    'parent': parent or bridg_root,
                    'properties': {'source': 'bridg-cro-extension'},
                },
            )
            entity_map[ext['uri']] = entity
            if created:
                stats['entities_created'] += 1
            else:
                stats['skipped'] += 1
            # 确保 linked_entry 桥接
            _ensure_bridg_linked_entry(entity)

        for rel in BRIDG_CORE_RELATIONS:
            subj = entity_map.get(rel['subject'])
            obj = entity_map.get(rel['object'])
            if not subj or not obj:
                continue
            _, created = KnowledgeRelation.objects.get_or_create(
                subject=subj,
                predicate_uri=rel['predicate'],
                object=obj,
                is_deleted=False,
                defaults={
                    'relation_type': rel['type'],
                    'confidence': 1.0,
                    'source': 'bridg-seed',
                },
            )
            if created:
                stats['relations_created'] += 1

    return {
        'success': True,
        'root_entity_id': bridg_root.id,
        **stats,
    }


def import_bridg_owl(owl_content: bytes) -> Dict[str, Any]:
    """
    从 OWL/RDF-XML 文件导入 BRIDG 本体。

    解析 owl:Class、rdfs:subClassOf、owl:ObjectProperty 等元素。
    """
    try:
        root = ET.fromstring(owl_content)
    except ET.ParseError as e:
        return {'success': False, 'message': f'OWL 解析失败: {e}'}

    stats = {'classes_created': 0, 'relations_created': 0, 'skipped': 0}

    bridg_root = _ensure_root_entity(
        uri='bridg:root',
        label='BRIDG 模型',
        label_en='BRIDG Model',
        definition='Biomedical Research Integrated Domain Group (ISO 14199)',
    )

    entity_map: Dict[str, KnowledgeEntity] = {'bridg:root': bridg_root}

    with transaction.atomic():
        for cls in root.findall('.//owl:Class', OWL_NS):
            about = cls.get(f'{{{OWL_NS["rdf"]}}}about', '')
            if not about:
                continue

            uri = _normalize_uri(about)
            label_el = cls.find('rdfs:label', OWL_NS)
            label = label_el.text.strip() if label_el is not None and label_el.text else uri.split(':')[-1]
            comment_el = cls.find('rdfs:comment', OWL_NS)
            definition = comment_el.text.strip() if comment_el is not None and comment_el.text else ''

            parent_el = cls.find('rdfs:subClassOf', OWL_NS)
            parent_uri = None
            if parent_el is not None:
                parent_resource = parent_el.get(f'{{{OWL_NS["rdf"]}}}resource', '')
                if parent_resource:
                    parent_uri = _normalize_uri(parent_resource)

            parent_entity = entity_map.get(parent_uri) if parent_uri else bridg_root

            entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=OntologyNamespace.BRIDG,
                uri=uri,
                is_deleted=False,
                defaults={
                    'entity_type': EntityType.CLASS,
                    'label': label,
                    'label_en': label,
                    'definition': definition,
                    'parent': parent_entity or bridg_root,
                    'properties': {
                        'owl_uri': about,
                        'source': 'bridg-owl-import',
                    },
                },
            )
            entity_map[uri] = entity

            if created:
                stats['classes_created'] += 1
                if parent_entity:
                    _, rel_created = KnowledgeRelation.objects.get_or_create(
                        subject=entity,
                        predicate_uri='rdfs:subClassOf',
                        object=parent_entity,
                        is_deleted=False,
                        defaults={
                            'relation_type': RelationType.IS_A,
                            'confidence': 1.0,
                            'source': 'bridg-owl-import',
                        },
                    )
                    if rel_created:
                        stats['relations_created'] += 1
            else:
                stats['skipped'] += 1

        for prop in root.findall('.//owl:ObjectProperty', OWL_NS):
            about = prop.get(f'{{{OWL_NS["rdf"]}}}about', '')
            if not about:
                continue

            prop_uri = _normalize_uri(about)
            domain_el = prop.find('rdfs:domain', OWL_NS)
            range_el = prop.find('rdfs:range', OWL_NS)

            if domain_el is not None and range_el is not None:
                domain_resource = domain_el.get(f'{{{OWL_NS["rdf"]}}}resource', '')
                range_resource = range_el.get(f'{{{OWL_NS["rdf"]}}}resource', '')

                domain_entity = entity_map.get(_normalize_uri(domain_resource))
                range_entity = entity_map.get(_normalize_uri(range_resource))

                if domain_entity and range_entity:
                    _, rel_created = KnowledgeRelation.objects.get_or_create(
                        subject=domain_entity,
                        predicate_uri=prop_uri,
                        object=range_entity,
                        is_deleted=False,
                        defaults={
                            'relation_type': RelationType.RELATED_TO,
                            'confidence': 1.0,
                            'source': 'bridg-owl-import',
                        },
                    )
                    if rel_created:
                        stats['relations_created'] += 1

    return {'success': True, 'root_entity_id': bridg_root.id, **stats}


# ── 工具函数 ──

def _ensure_bridg_linked_entry(entity: KnowledgeEntity) -> None:
    """为 BRIDG 实体创建或补充 linked_entry 桥接（幂等）。"""
    if entity.linked_entry_id is not None:
        return
    source_key = f'bridg:{entity.uri}'[:120]
    content = entity.label
    if entity.definition:
        content = f'{entity.label} ({entity.label_en})\n\n{entity.definition}'
    entry, _ = KnowledgeEntry.objects.get_or_create(
        source_type='bridg_import',
        source_key=source_key,
        defaults={
            'title': entity.label[:500],
            'content': content,
            'summary': (entity.definition or entity.label)[:200],
            'entry_type': EntryType.METHOD_REFERENCE,
            'namespace': OntologyNamespace.BRIDG,
            'uri': entity.uri,
            'tags': ['BRIDG', 'ISO14199', entity.label_en or entity.label],
            'is_published': True,
            'status': 'published',
        },
    )
    entity.linked_entry = entry
    entity.save(update_fields=['linked_entry'])


def _ensure_root_entity(uri: str, label: str, label_en: str, definition: str) -> KnowledgeEntity:
    entity, _ = KnowledgeEntity.objects.get_or_create(
        namespace=OntologyNamespace.BRIDG,
        uri=uri,
        is_deleted=False,
        defaults={
            'entity_type': EntityType.CLASS,
            'label': label,
            'label_en': label_en,
            'definition': definition,
            'properties': {'source': 'bridg-import', 'is_root': True},
        },
    )
    _ensure_bridg_linked_entry(entity)
    return entity


def _normalize_uri(raw_uri: str) -> str:
    if '#' in raw_uri:
        fragment = raw_uri.split('#')[-1]
        return f'bridg:{fragment}'
    if '/' in raw_uri:
        last = raw_uri.rstrip('/').split('/')[-1]
        return f'bridg:{last}'
    return raw_uri
