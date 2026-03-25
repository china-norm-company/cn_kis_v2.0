"""
回填现有知识条目的专题包与 facet。

目标：
1. 让 TopicPackage 不只停留在模型层，而是对现有知识资产形成真实归档
2. 为 benchmark / 健康治理提供专题覆盖统计
3. 通过统一规则避免后续新增知识继续“只有条目，没有专题语义”
"""
from typing import Any, Dict, Iterable

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.knowledge.models import KnowledgeEntry, TopicPackage


PACKAGE_DEFINITIONS = [
    {
        'package_id': 'pkg_cosmetic_regulatory_compliance',
        'canonical_topic': '中国化妆品法规与合规边界',
        'description': '覆盖 NMPA/ICH/GCP/法规条款、宣称边界、合规风险与报告措辞。',
        'coverage_weight': 1.5,
        'required_for_release': True,
        'source_authority_level': 'tier1',
        'keywords': ['法规', 'nmpa', 'ich', 'gcp', '监管', '合规', 'part 11', '宣称', '备案'],
    },
    {
        'package_id': 'pkg_moisturizing_evaluation',
        'canonical_topic': '保湿功效评价',
        'description': '覆盖保湿宣称、皮肤屏障、TEWL、角质层含水量、设计与报告。',
        'coverage_weight': 1.4,
        'required_for_release': True,
        'source_authority_level': 'mixed',
        'keywords': ['保湿', 'hydration', 'moistur', 'tewl', '角质层含水量', '屏障', 'corneometer'],
    },
    {
        'package_id': 'pkg_whitening_evaluation',
        'canonical_topic': '美白功效评价',
        'description': '覆盖美白宣称、黑色素指标、受试者设计、仪器方法与报告边界。',
        'coverage_weight': 1.3,
        'required_for_release': True,
        'source_authority_level': 'mixed',
        'keywords': ['美白', 'whitening', 'melanin', 'mexameter', 'l*', '色斑', '传明酸', '熊果苷'],
    },
    {
        'package_id': 'pkg_sunscreen_evaluation',
        'canonical_topic': '防晒功效评价',
        'description': '覆盖 SPF/UVA/ISO 24442/24443、体内外设计、仪器与结论话术。',
        'coverage_weight': 1.3,
        'required_for_release': True,
        'source_authority_level': 'mixed',
        'keywords': ['防晒', 'spf', 'uva', 'uvb', 'sunscreen', 'iso 24442', 'iso 24443'],
    },
    {
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'description': '覆盖 CIR/SCCS/NMPA 限用、安全机制、常见误区与合规解释。',
        'coverage_weight': 1.2,
        'required_for_release': True,
        'source_authority_level': 'mixed',
        'keywords': ['成分', 'ingredient', '安全', '限量', '禁用', 'cir', 'sccs', '烟酰胺', '视黄醇'],
    },
    {
        'package_id': 'pkg_instrument_methods',
        'canonical_topic': '仪器与检测方法',
        'description': '覆盖 VISIA/Corneometer/Cutometer 等仪器、指标、方法和使用风险。',
        'coverage_weight': 1.1,
        'required_for_release': False,
        'source_authority_level': 'tier3',
        'keywords': ['仪器', 'instrument', 'visia', 'corneometer', 'tewameter', 'cutometer', 'mexameter', '方法'],
    },
    {
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'description': '覆盖样本量、随机对照、估计目标、缺失数据、分析方法与模板。',
        'coverage_weight': 1.2,
        'required_for_release': True,
        'source_authority_level': 'tier2',
        'keywords': ['样本量', '随机', '统计', 'mmrm', 'wilcoxon', 'paired t', '设计', 'protocol'],
    },
    {
        'package_id': 'pkg_cdisc_bridg_semantics',
        'canonical_topic': 'CDISC 与 BRIDG 语义标准',
        'description': '覆盖 SDTM/CDASH/BRIDG 语义、变量、实体关系与映射。',
        'coverage_weight': 1.0,
        'required_for_release': False,
        'source_authority_level': 'tier1',
        'keywords': ['cdisc', 'sdtm', 'cdash', 'bridg', 'domain', 'subject', 'observ'],
    },
    {
        'package_id': 'pkg_cro_quality_operations',
        'canonical_topic': 'CRO 质量与运营实务',
        'description': '覆盖 SOP、偏差/CAPA、访视窗口、合同、FAQ 与报告交付。',
        'coverage_weight': 1.1,
        'required_for_release': False,
        'source_authority_level': 'tier3',
        'keywords': ['sop', 'capa', '偏差', '访视', '合同', 'faq', 'qa', '项目复盘', '报告'],
    },
]

REQUIRED_PACKAGE_FACET_HINTS = {
    'pkg_cosmetic_regulatory_compliance': {
        'study_design': ['样本量', '随机', '统计', 'protocol', '设计'],
        'sop_risks': ['sop', '偏差', 'capa', '审计', '超窗'],
        'reporting_templates': ['报告', '模板', '结论句', '措辞'],
        'ingredient_safety': ['成分', '安全', '限量', '禁用'],
    },
    'pkg_ingredient_safety': {
        'key_metrics': ['tewl', '刺激', '斑贴', 'spf', '黑色素'],
        'instrument_methods': ['corneometer', 'visia', 'mexameter', 'tewameter', '方法'],
        'faq_misconceptions': ['faq', '误区', '常见问题'],
        'reporting_templates': ['报告', '模板', '结论句', '措辞'],
    },
    'pkg_sunscreen_evaluation': {
        'study_design': ['受试者', '设计', '随机', '样本量', '体内', '体外'],
        'reporting_templates': ['报告', '模板', '结论句', '宣传'],
        'faq_misconceptions': ['faq', '误区', '常见问题'],
    },
    'pkg_moisturizing_evaluation': {
        'reporting_templates': ['报告', '模板', '结论句'],
    },
    'pkg_study_design_statistics': {
        'study_design': ['样本量', '随机', '统计', 'mmrm', 'protocol'],
        'reporting_templates': ['报告', '模板'],
    },
    'pkg_whitening_evaluation': {
        'reporting_templates': ['报告', '模板', '结论句'],
    },
}


def _select_package(text: str) -> Dict[str, Any]:
    best = PACKAGE_DEFINITIONS[0]
    best_score = -1
    for package in PACKAGE_DEFINITIONS:
        score = sum(1 for keyword in package['keywords'] if keyword in text)
        if score > best_score:
            best = package
            best_score = score
    return best


def _select_facet(entry: KnowledgeEntry, normalized_text: str) -> str:
    title = (entry.title or '').lower()
    entry_type = (entry.entry_type or '').lower()
    if any(k in normalized_text for k in ['宣称', 'claim', '话术', '措辞']):
        return 'claim_boundary'
    if entry_type == 'regulation' or any(k in normalized_text for k in ['法规', 'nmpa', 'ich', 'gcp', '监管']):
        return 'regulation_boundary'
    if entry_type == 'ingredient_data' or any(k in normalized_text for k in ['成分', '安全', '限量', 'cir', 'sccs']):
        return 'ingredient_safety'
    if entry_type == 'faq' or any(k in normalized_text for k in ['faq', '误区', '常见问题']):
        return 'faq_misconceptions'
    if entry_type == 'sop' or any(k in normalized_text for k in ['sop', '偏差', 'capa', '风险', '超窗']):
        return 'sop_risks'
    if entry_type in ('instrument_spec', 'method_reference') or any(
        k in normalized_text for k in ['仪器', 'visia', 'corneometer', 'tewameter', 'cutometer', 'mexameter', '方法']
    ):
        return 'instrument_methods'
    if any(k in normalized_text for k in ['指标', 'tewl', 'spf', 'uva', '含水量', 'melanin', 'l*']):
        return 'key_metrics'
    if any(k in normalized_text for k in ['样本量', '随机', '统计', 'mmrm', 'protocol', '研究设计']):
        return 'study_design'
    if entry_type in ('proposal_template',) or any(k in title + normalized_text for k in ['模板', '报告', '结论句', '框架']):
        return 'reporting_templates'
    return 'core_concepts'


def _ensure_packages() -> Dict[str, TopicPackage]:
    packages: Dict[str, TopicPackage] = {}
    for definition in PACKAGE_DEFINITIONS:
        package, _ = TopicPackage.objects.get_or_create(
            package_id=definition['package_id'],
            defaults={
                'canonical_topic': definition['canonical_topic'],
                'description': definition['description'],
                'coverage_weight': definition['coverage_weight'],
                'required_for_release': definition['required_for_release'],
                'source_authority_level': definition['source_authority_level'],
                'status': 'building',
                'properties': {
                    'cluster_keywords': definition['keywords'],
                },
            },
        )
        packages[definition['package_id']] = package
    return packages


def _refresh_package_coverage(packages: Iterable[TopicPackage]) -> None:
    for package in packages:
        facets = {
            facet: {'count': 0, 'entry_ids': []}
            for facet in package.DEFAULT_FACETS
        }
        rows = KnowledgeEntry.objects.filter(
            topic_package_id=package.id,
            is_deleted=False,
        ).exclude(facet='').values_list('facet', 'id')
        for facet, entry_id in rows:
            bucket = facets.setdefault(facet, {'count': 0, 'entry_ids': []})
            bucket['count'] += 1
            bucket['entry_ids'].append(entry_id)
        package.facets = facets
        package.save(update_fields=['facets', 'update_time'])


def _seed_required_package_facets(packages: Dict[str, TopicPackage], dry_run: bool) -> int:
    """
    对必过专题包补齐缺失 facet。

    做法：从全局知识池里按关键词挑选最相关的现有条目，回填到缺失 facet，
    确保专题包门禁不是“有包无内容”。
    """
    updated = 0
    for package_id, facet_hints in REQUIRED_PACKAGE_FACET_HINTS.items():
        package = packages.get(package_id)
        if not package:
            continue
        existing_facets = package.facets or {}
        for facet, keywords in facet_hints.items():
            facet_count = 0
            facet_data = existing_facets.get(facet)
            if isinstance(facet_data, dict):
                facet_count = int(facet_data.get('count', 0))
            if facet_count > 0:
                continue

            query = Q()
            for keyword in keywords:
                query |= (
                    Q(title__icontains=keyword) |
                    Q(summary__icontains=keyword) |
                    Q(content__icontains=keyword) |
                    Q(tags__contains=[keyword])
                )
            candidate = KnowledgeEntry.objects.filter(
                is_deleted=False,
            ).filter(query).exclude(facet=facet).order_by('-quality_score', '-id').first()
            if not candidate:
                continue

            updated += 1
            if not dry_run:
                candidate.topic_package = package
                candidate.facet = facet
                candidate.save(update_fields=['topic_package', 'facet', 'update_time'])

    return updated


class Command(BaseCommand):
    help = '为现有 KnowledgeEntry 回填 TopicPackage 与 facet'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0, help='最多处理条目数（0=全部）')
        parser.add_argument('--only-empty', action='store_true', help='仅处理未归档专题包的条目')
        parser.add_argument('--dry-run', action='store_true', help='只统计，不写入数据库')

    def handle(self, *args, **options):
        limit = options['limit']
        only_empty = options['only_empty']
        dry_run = options['dry_run']

        packages = _ensure_packages()
        qs = KnowledgeEntry.objects.filter(is_deleted=False)
        if only_empty:
            qs = qs.filter(topic_package__isnull=True)
        qs = qs.order_by('id')
        if limit > 0:
            qs = qs[:limit]

        updated = 0
        inspected = 0
        for entry in qs.iterator(chunk_size=500):
            inspected += 1
            normalized_text = ' '.join([
                (entry.title or ''),
                (entry.summary or ''),
                (entry.content or '')[:1500],
                ' '.join(entry.tags or []),
                entry.entry_type or '',
                entry.namespace or '',
            ]).lower()
            package_def = _select_package(normalized_text)
            facet = _select_facet(entry, normalized_text)
            topic_package = packages[package_def['package_id']]

            if (
                entry.topic_package_id == topic_package.id and
                (entry.facet or '') == facet
            ):
                continue

            updated += 1
            if not dry_run:
                entry.topic_package = topic_package
                entry.facet = facet
                entry.save(update_fields=['topic_package', 'facet', 'update_time'])

        seeded = 0
        if not dry_run:
            _refresh_package_coverage(packages.values())
            seeded = _seed_required_package_facets(packages, dry_run=False)
            if seeded:
                _refresh_package_coverage(packages.values())

        self.stdout.write(
            self.style.SUCCESS(
                f'TopicPackage 回填完成: inspected={inspected} updated={updated} '
                f'seeded={seeded} dry_run={dry_run}'
            )
        )
        for package in TopicPackage.objects.filter(is_deleted=False).order_by('package_id'):
            self.stdout.write(
                f'  - {package.package_id}: coverage={package.coverage_rate():.3f} '
                f'required={package.required_for_release}'
            )
