"""
评估数字人知识组合质量，强调：
1. 知识类型是否均衡
2. 专题是否具备证据链闭环
3. 专题是否有足够深度
4. 是否存在明显重复风险

这个命令不看“总量是否够大”而已，而是看是否适合支撑专业数字人的稳定工作。
"""
import json
import re
from collections import Counter, defaultdict
from typing import Dict, List

from django.core.management.base import BaseCommand

from apps.knowledge.models import KnowledgeEntry, TopicPackage


KEY_TYPES = [
    'regulation',
    'method_reference',
    'sop',
    'proposal_template',
    'faq',
    'instrument_spec',
    'ingredient_data',
    'methodology',
    'paper_abstract',
]

AUTHORITY_TYPES = {
    'regulation',
    'method_reference',
    'instrument_spec',
    'ingredient_data',
    'methodology',
    'paper_abstract',
}

PACKAGE_MODES = {
    'pkg_cdisc_bridg_semantics': 'foundation_semantic',
    'pkg_cro_quality_operations': 'operational_playbook',
}


def _normalize_title(title: str) -> str:
    return re.sub(r'[\s：:（）()\-_/]+', '', (title or '').lower()).strip()


class Command(BaseCommand):
    help = '评估数字人知识组合质量（类型、深度、闭环、重复风险）'

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', help='输出 JSON')

    def handle(self, *args, **options):
        package_reports = []
        overall_type_counts = Counter()
        duplicate_clusters: Dict[str, List[str]] = defaultdict(list)

        all_entries = KnowledgeEntry.objects.filter(
            is_deleted=False,
            is_published=True,
        )

        for entry in all_entries.only('id', 'title', 'entry_type').iterator(chunk_size=500):
            overall_type_counts[entry.entry_type] += 1
            key = _normalize_title(entry.title)
            if key:
                duplicate_clusters[key].append(entry.title)

        for package in TopicPackage.objects.filter(is_deleted=False).order_by('package_id'):
            entries = list(
                all_entries.filter(topic_package=package).only(
                    'id', 'title', 'entry_type', 'source_type', 'facet'
                )
            )
            if not entries:
                continue

            type_counts = Counter(entry.entry_type for entry in entries)
            facet_counts = Counter(entry.facet for entry in entries if entry.facet)
            titles = [_normalize_title(entry.title) for entry in entries if entry.title]
            title_counts = Counter(titles)
            duplicate_titles = {k: v for k, v in title_counts.items() if v >= 3}

            authority_count = sum(type_counts.get(t, 0) for t in AUTHORITY_TYPES)
            diversity = sum(1 for t in KEY_TYPES if type_counts.get(t, 0) > 0)
            package_mode = PACKAGE_MODES.get(package.package_id, 'specialist_topic')
            evidence_chain = {
                'has_regulation': type_counts.get('regulation', 0) > 0,
                'has_method': (
                    type_counts.get('method_reference', 0) > 0 or
                    type_counts.get('methodology', 0) > 0 or
                    type_counts.get('instrument_spec', 0) > 0 or
                    type_counts.get('ingredient_data', 0) > 0
                ),
                'has_execution': type_counts.get('sop', 0) > 0,
                'has_delivery': (
                    type_counts.get('proposal_template', 0) > 0 or
                    type_counts.get('faq', 0) > 0
                ),
            }
            chain_complete = all(evidence_chain.values())

            report = {
                'package_id': package.package_id,
                'canonical_topic': package.canonical_topic,
                'package_mode': package_mode,
                'entry_count': len(entries),
                'authority_count': authority_count,
                'authority_ratio': round(authority_count / max(len(entries), 1), 3),
                'type_diversity': diversity,
                'facet_coverage_count': len(facet_counts),
                'duplicate_title_clusters': len(duplicate_titles),
                'evidence_chain': evidence_chain,
                'chain_complete': chain_complete,
                'counts': {t: type_counts.get(t, 0) for t in KEY_TYPES if type_counts.get(t, 0) > 0},
            }

            if package_mode == 'foundation_semantic':
                report['portfolio_ready'] = (
                    len(entries) >= 1000 and
                    report['authority_ratio'] >= 0.9 and
                    type_counts.get('method_reference', 0) >= 1000 and
                    evidence_chain['has_method'] and
                    report['facet_coverage_count'] >= 8
                )
            elif package_mode == 'operational_playbook':
                report['portfolio_ready'] = (
                    len(entries) >= 200 and
                    authority_count >= 20 and
                    diversity >= 5 and
                    chain_complete and
                    type_counts.get('sop', 0) >= 100 and
                    type_counts.get('faq', 0) >= 100
                )
            else:
                report['portfolio_ready'] = (
                    len(entries) >= 24 and
                    report['authority_ratio'] >= 0.25 and
                    diversity >= 4 and
                    chain_complete and
                    len(duplicate_titles) <= 3
                )
            package_reports.append(report)

        skewed_types = [
            {'entry_type': entry_type, 'count': count}
            for entry_type, count in overall_type_counts.most_common()
        ]
        global_duplicate_clusters = sum(1 for _, vals in duplicate_clusters.items() if len(vals) >= 5)

        result = {
            'summary': {
                'total_published': all_entries.count(),
                'portfolio_ready_packages': sum(1 for item in package_reports if item['portfolio_ready']),
                'total_packages': len(package_reports),
                'global_duplicate_clusters_ge5': global_duplicate_clusters,
            },
            'overall_type_distribution': skewed_types,
            'package_reports': package_reports,
            'priority_gaps': [
                item for item in package_reports
                if not item['portfolio_ready']
            ][:10],
        }

        if options['json']:
            self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
            return

        self.stdout.write('数字人知识组合质量评估')
        self.stdout.write(
            f'已发布: {result["summary"]["total_published"]} | '
            f'专题包 ready: {result["summary"]["portfolio_ready_packages"]}/'
            f'{result["summary"]["total_packages"]} | '
            f'全局重复簇(>=5): {result["summary"]["global_duplicate_clusters_ge5"]}'
        )
        self.stdout.write('\n优先缺口:')
        for item in result['priority_gaps']:
            self.stdout.write(
                f'- {item["package_id"]}: '
                f'count={item["entry_count"]}, '
                f'authority_ratio={item["authority_ratio"]}, '
                f'diversity={item["type_diversity"]}, '
                f'chain_complete={item["chain_complete"]}, '
                f'dup_clusters={item["duplicate_title_clusters"]}'
            )
