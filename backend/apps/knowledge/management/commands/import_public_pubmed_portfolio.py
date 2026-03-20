"""
把公开 PubMed 论文按专题包直接导入知识库，并尽量映射到数字人需要的专题结构。
"""
from typing import Any, Dict, List

from django.core.management.base import BaseCommand

from apps.knowledge.external_fetcher import _search_pubmed
from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


QUERY_SPECS: List[Dict[str, Any]] = [
    {
        'keyword': 'cosmetic moisturizing corneometer tewameter randomized trial',
        'package_id': 'pkg_moisturizing_evaluation',
        'canonical_topic': '保湿功效评价',
        'facet': 'key_metrics',
        'include_any': ['moistur', 'hydrat', 'corneometer', 'tewameter', 'tewl', 'barrier'],
        'title_include_any': ['moistur', 'hydrat', 'barrier', 'corneometer', 'tewameter'],
    },
    {
        'keyword': 'skin hydration barrier repair corneometer tewl cosmetic clinical trial',
        'package_id': 'pkg_moisturizing_evaluation',
        'canonical_topic': '保湿功效评价',
        'facet': 'instrument_methods',
        'include_any': ['hydrat', 'barrier', 'corneometer', 'tewl', 'tewameter', 'moistur'],
        'title_include_any': ['hydrat', 'barrier', 'moistur', 'corneometer', 'tewameter'],
    },
    {
        'keyword': 'cosmetic sunscreen SPF UVA trial ISO 24444 24443',
        'package_id': 'pkg_sunscreen_evaluation',
        'canonical_topic': '防晒功效评价',
        'facet': 'study_design',
        'include_any': ['sunscreen', 'sun protection', 'spf', 'uva', 'uvb', 'broad-spectrum'],
        'title_include_any': ['sunscreen', 'sun protection', 'spf', 'uva', 'uvb', 'broad-spectrum'],
    },
    {
        'keyword': 'broad spectrum sunscreen UVA PF in vivo in vitro cosmetic study',
        'package_id': 'pkg_sunscreen_evaluation',
        'canonical_topic': '防晒功效评价',
        'facet': 'key_metrics',
        'include_any': ['sunscreen', 'sun protection', 'spf', 'uva', 'uva-pf', 'broad-spectrum'],
        'title_include_any': ['sunscreen', 'sun protection', 'spf', 'uva', 'uva-pf', 'broad-spectrum'],
    },
    {
        'keyword': 'topical niacinamide tranexamic acid whitening randomized trial skin',
        'package_id': 'pkg_whitening_evaluation',
        'canonical_topic': '美白功效评价',
        'facet': 'claim_boundary',
        'include_any': ['melasma', 'hyperpig', 'whiten', 'depigment', 'niacinamide', 'tranexamic'],
        'title_include_any': ['melasma', 'hyperpig', 'whiten', 'depigment', 'niacinamide', 'tranexamic'],
    },
    {
        'keyword': 'melasma hyperpigmentation topical cosmetic randomized trial mexameter skin',
        'package_id': 'pkg_whitening_evaluation',
        'canonical_topic': '美白功效评价',
        'facet': 'instrument_methods',
        'include_any': ['melasma', 'hyperpig', 'mexameter', 'depigment', 'pigment'],
        'title_include_any': ['melasma', 'hyperpig', 'mexameter', 'depigment', 'pigment'],
    },
    {
        'keyword': 'cosmetic retinol salicylic acid topical safety review skin',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['safety', 'irritation', 'retinol', 'salicy', 'nanoparticle', 'zinc oxide', 'titanium dioxide'],
        'title_include_any': ['safety', 'irritation', 'retinol', 'salicy', 'nanoparticle', 'zinc oxide', 'titanium dioxide'],
    },
    {
        'keyword': 'topical retinol safety review cosmetic skin irritation',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['safety', 'irritation', 'retinol', 'retinoid'],
        'title_include_any': ['safety', 'irritation', 'retinol', 'retinoid'],
    },
    {
        'keyword': 'zinc oxide titanium dioxide nanoparticle sunscreen safety review skin',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'regulation_boundary',
        'include_any': ['safety', 'nanoparticle', 'zinc oxide', 'titanium dioxide', 'sunscreen'],
        'title_include_any': ['safety', 'nanoparticle', 'zinc oxide', 'titanium dioxide', 'sunscreen'],
    },
    {
        'keyword': 'octocrylene ultraviolet filter cosmetics safety review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['octocrylene', 'ultraviolet filter', 'cosmetics', 'safety'],
        'title_include_any': ['octocrylene', 'safety'],
        'title_include_all': ['octocrylene', 'safety'],
    },
    {
        'keyword': 'contact allergy ultraviolet filters sunscreen review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'faq_misconceptions',
        'include_any': ['sunscreen', 'ultraviolet filter', 'allergy', 'adverse reactions'],
        'title_include_any': ['sunscreens', 'ultraviolet filter', 'allergy', 'adverse reactions'],
        'title_exclude_any': ['environmental', 'freshwater', 'united states'],
    },
    {
        'keyword': 'safety assessment of personal care products cosmetics ingredients review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'regulation_boundary',
        'include_any': ['safety assessment', 'personal care products', 'cosmetics', 'ingredients'],
        'title_include_any': ['safety assessment', 'cosmetics', 'ingredients'],
        'title_exclude_any': ['glycerin', 'bht'],
    },
    {
        'keyword': 'niacinamide safety assessment cosmetics review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['niacinamide', 'safety assessment', 'cosmetics'],
        'title_include_any': ['niacinamide', 'safety assessment'],
        'title_include_all': ['niacinamide', 'safety assessment'],
    },
    {
        'keyword': 'hyaluronic acid safety assessment cosmetics review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['hyaluronic acid', 'safety assessment', 'cosmetics'],
        'title_include_any': ['hyaluronic acid', 'safety assessment'],
        'title_include_all': ['hyaluronic acid', 'safety assessment'],
        'title_exclude_any': ['filler injection', 'aesthetics', 'non-surgical facial'],
    },
    {
        'keyword': 'sunscreens review UV filters allergic potential',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'faq_misconceptions',
        'include_any': ['sunscreens', 'uv filters', 'allergic potential', 'adverse reactions'],
        'title_include_any': ['sunscreens', 'uv filters', 'allergic', 'adverse reactions'],
    },
    {
        'keyword': 'titanium dioxide zinc oxide sunscreen safety review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['titanium dioxide', 'zinc oxide', 'sunscreen', 'safety'],
        'title_include_any': ['titanium dioxide', 'zinc oxide', 'sunscreen', 'safety'],
    },
    {
        'keyword': 'topical sunscreens contact sensitivity allergens clinical review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'faq_misconceptions',
        'include_any': ['sunscreens', 'contact sensitivity', 'allergens', 'clinical'],
        'title_include_any': ['sunscreens', 'contact sensitivity', 'allergens', 'adverse reactions'],
        'title_exclude_any': ['heavy metal', 'nanoparticles'],
    },
    {
        'keyword': 'retinol safety assessment cosmetic ingredient review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['retinol', 'retinyl palmitate', 'safety'],
        'title_include_any': ['retinol', 'retinyl palmitate', 'safety'],
        'title_exclude_any': ['children', 'cottonseed', 'salicylic'],
    },
    {
        'keyword': 'titanium dioxide zinc oxide nano safety assessment review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['zinc oxide', 'titanium dioxide', 'nano', 'safety'],
        'title_include_any': ['zinc oxide', 'titanium dioxide', 'sunscreens', 'cosmetic formulations'],
        'title_exclude_any': ['food packaging', 'nanotextiles', 'oral rinses', 'pesticides'],
    },
    {
        'keyword': 'allergic contact dermatitis caused by cosmetic products review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'faq_misconceptions',
        'include_any': ['cosmetic products', 'contact dermatitis', 'allergic', 'cosmetics'],
        'title_include_any': ['cosmetic products', 'contact dermatitis', 'cosmetics'],
        'title_exclude_any': ['lip care'],
    },
    {
        'keyword': 'adverse reactions to cosmetics and methods of testing review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'regulation_boundary',
        'include_any': ['adverse reactions', 'cosmetics', 'methods of testing', 'patch testing'],
        'title_include_any': ['adverse reactions', 'cosmetics', 'methods of testing'],
    },
    {
        'keyword': 'safety review of phenoxyethanol when used as a preservative in cosmetics',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['phenoxyethanol', 'preservative', 'cosmetics', 'safety review'],
        'title_include_any': ['phenoxyethanol', 'preservative', 'cosmetics'],
    },
    {
        'keyword': 'fragrance contact allergy review patch testing',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'faq_misconceptions',
        'include_any': ['fragrance', 'contact allergy', 'patch testing'],
        'title_include_any': ['fragrance', 'contact allergy', 'patch testing'],
    },
    {
        'keyword': 'methylisothiazolinone contact allergy review cosmetics',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['methylisothiazolinone', 'contact allergy', 'cosmetics', 'review'],
        'title_include_any': ['methylisothiazolinone', 'contact allergy', 'review'],
    },
    {
        'keyword': 'parabens preservative cosmetics review safety',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'ingredient_safety',
        'include_any': ['parabens', 'preservative', 'cosmetics', 'safety'],
        'title_include_any': ['parabens'],
        'title_exclude_any': ['endocrine system'],
    },
    {
        'keyword': 'amended safety assessment parabens used in cosmetics review',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'regulation_boundary',
        'include_any': ['parabens', 'safety assessment', 'cosmetics'],
        'title_include_any': ['parabens', 'safety assessment', 'cosmetics'],
    },
    {
        'keyword': 'contact allergy to fragrances current clinical regulatory trends',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'faq_misconceptions',
        'include_any': ['fragrances', 'contact allergy', 'clinical', 'regulatory'],
        'title_include_any': ['fragrances', 'contact allergy', 'regulatory trends'],
    },
    {
        'keyword': 'patch testing methylisothiazolinone methylchloroisothiazolinone contact allergy',
        'package_id': 'pkg_ingredient_safety',
        'canonical_topic': '成分安全与限用边界',
        'facet': 'regulation_boundary',
        'include_any': ['patch testing', 'methylisothiazolinone', 'contact allergy'],
        'title_include_any': ['patch testing', 'methylisothiazolinone', 'contact allergy'],
    },
    {
        'keyword': 'split-face paired design skin study analysis cosmetic',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'study_design',
        'include_any': ['split-face', 'randomized', 'trial', 'paired', 'analysis', 'study design'],
        'title_include_any': ['split-face', 'randomized', 'trial', 'paired', 'study design'],
    },
    {
        'keyword': 'split-face randomized dermatology trial paired analysis skin',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'key_metrics',
        'include_any': ['split-face', 'randomized', 'trial', 'paired', 'analysis'],
        'title_include_any': ['split-face', 'randomized', 'trial', 'paired'],
    },
    {
        'keyword': 'dermatology clinical trial missing data sensitivity analysis review',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['missing data', 'sensitivity analysis', 'estimand', 'analysis set'],
        'title_include_any': ['missing data', 'sensitivity analysis', 'estimand', 'analysis set'],
    },
    {
        'keyword': 'missing data in clinical trials review',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['missing data', 'multiple imputation', 'randomised', 'clinical trials'],
        'title_include_any': ['missing data', 'multiple imputation', 'clinical trials', 'clinical research'],
    },
    {
        'keyword': 'estimand clinical trial review missing data',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'study_design',
        'include_any': ['estimand', 'missing data', 'intercurrent events', 'clinical trial'],
        'title_include_any': ['estimand', 'missing data'],
    },
    {
        'keyword': 'estimand framework clinical trial missing data review',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'study_design',
        'include_any': ['estimand', 'missing data', 'intercurrent events', 'drop out'],
        'title_include_any': ['estimand', 'intercurrent events', 'missing data'],
    },
    {
        'keyword': 'handling missing data dropout clinical trial estimand review',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['estimand', 'missing data', 'drop out', 'clinical trials'],
        'title_include_any': ['estimand', 'missing data', 'drop out'],
    },
    {
        'keyword': 'analytical approaches estimands missing patient reported data longitudinal studies',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['estimands', 'missing patient-reported data', 'longitudinal studies'],
        'title_include_any': ['estimands', 'missing patient-reported data', 'longitudinal studies'],
    },
    {
        'keyword': 'patient reported outcomes estimand missing data review',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'study_design',
        'include_any': ['patient-reported outcomes', 'estimand', 'missing data'],
        'title_include_any': ['patient-reported outcomes', 'estimand'],
    },
    {
        'keyword': 'estimating treatment effects intercurrent events missing data review',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'study_design',
        'include_any': ['treatment effects', 'intercurrent events', 'missing data', 'estimands'],
        'title_include_any': ['treatment effects', 'intercurrent events', 'missing data'],
    },
    {
        'keyword': 'estimands in CNS trials review intercurrent events',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'study_design',
        'include_any': ['estimands', 'cns trials', 'intercurrent events'],
        'title_include_any': ['estimands', 'intercurrent events'],
    },
    {
        'keyword': 'estimands in published protocols randomised trials urgent improvement needed',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['estimands', 'published protocols', 'randomised trials'],
        'title_include_any': ['estimands', 'published protocols', 'randomised trials'],
    },
    {
        'keyword': 'four-step strategy handling missing outcome data randomised trials pandemic',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['missing outcome data', 'randomised trials', 'strategy'],
        'title_include_any': ['missing outcome data', 'randomised trials', 'strategy'],
    },
    {
        'keyword': 'reporting of patient reported outcomes randomized trials consort pro extension',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['patient-reported outcomes', 'randomized trials', 'consort pro'],
        'title_include_any': ['patient-reported outcomes', 'consort pro extension'],
    },
    {
        'keyword': 'reporting missing participant data randomised trials proposed guide',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['missing participant data', 'randomised trials', 'proposed guide'],
        'title_include_any': ['missing participant data', 'randomised trials', 'proposed guide'],
    },
    {
        'keyword': 'consort outcomes 2022 extension trial reports',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'reporting_templates',
        'include_any': ['consort-outcomes', 'trial reports', 'extension'],
        'title_include_any': ['consort-outcomes', 'trial reports', 'extension'],
    },
    {
        'keyword': 'estimands correctly used review uk research protocols',
        'package_id': 'pkg_study_design_statistics',
        'canonical_topic': '研究设计与统计分析',
        'facet': 'study_design',
        'include_any': ['estimands', 'research protocols', 'review'],
        'title_include_any': ['estimands', 'research protocols'],
    },
    {
        'keyword': 'corneometer tewameter cutometer skin bioengineering',
        'package_id': 'pkg_instrument_methods',
        'canonical_topic': '仪器与检测方法',
        'facet': 'instrument_methods',
        'include_any': ['corneometer', 'tewameter', 'cutometer', 'mexameter', 'bioengineering'],
        'title_include_any': ['corneometer', 'tewameter', 'cutometer', 'mexameter', 'bioengineering'],
    },
    {
        'keyword': 'VISIA skin analysis photoaging clinical study',
        'package_id': 'pkg_instrument_methods',
        'canonical_topic': '仪器与检测方法',
        'facet': 'key_metrics',
        'include_any': ['visia', 'imaging', 'ultrasound', 'radiofrequency', 'laser', 'skin analysis'],
        'title_include_any': ['visia', 'imaging', 'ultrasound', 'radiofrequency', 'laser', 'skin analysis'],
    },
    {
        'keyword': 'skin bioengineering techniques cosmetic hydration study',
        'package_id': 'pkg_instrument_methods',
        'canonical_topic': '仪器与检测方法',
        'facet': 'study_design',
        'include_any': ['bioengineering', 'measurement', 'corneometer', 'tewameter', 'hydration'],
        'title_include_any': ['bioengineering', 'measurement', 'corneometer', 'tewameter', 'hydration'],
    },
]


class Command(BaseCommand):
    help = '按专题包导入公开 PubMed 论文摘要'

    def add_arguments(self, parser):
        parser.add_argument('--per-keyword', type=int, default=5, help='每个关键词最多导入多少篇')
        parser.add_argument(
            '--disable-llm-enrich',
            action='store_true',
            help='关闭 LLM 富化，走稳定规则管线',
        )

    def handle(self, *args, **options):
        if options.get('disable_llm_enrich'):
            import apps.knowledge.ingestion_pipeline as pipeline_module

            pipeline_module._LLM_ENRICH_ENABLED = False
            self.stdout.write('已关闭 LLM 富化，使用稳定规则管线落库。')

        per_keyword = max(int(options['per_keyword']), 1)
        fetched = 0
        created = 0
        skipped = 0
        errors = 0

        for spec in QUERY_SPECS:
            keyword = spec['keyword']
            self.stdout.write(f'检索关键词: {keyword}')
            papers = _search_pubmed(keyword, per_keyword)
            fetched += len(papers)
            self.stdout.write(f'  命中 {len(papers)} 篇')
            for paper in papers:
                state = self._ingest_paper(spec, paper)
                created += int(state == 'created')
                skipped += int(state == 'skipped')
                errors += int(state == 'error')

        self.stdout.write(
            self.style.SUCCESS(
                f'PubMed 专题导入完成: fetched={fetched} created={created} skipped={skipped} errors={errors}'
            )
        )

    def _ingest_paper(self, spec: Dict[str, Any], paper: Dict[str, str]) -> str:
        pmid = (paper.get('pmid') or '').strip()
        if not pmid:
            return 'skipped'

        title = paper.get('title', '').strip() or f'PubMed Article PMID:{pmid}'
        source_url = paper.get('source_url', '')
        source_key = f'pubmed:{pmid}'
        if not self._is_relevant(spec, paper):
            self.stdout.write(f'  - 跳过（相关性不足）: PMID={pmid} | {title[:60]}')
            return 'skipped'
        existed_before = KnowledgeEntry.objects.filter(
            is_deleted=False,
            entry_type='paper_abstract',
            uri=source_url,
            title=title,
        ).exists()
        if existed_before:
            self.stdout.write(f'  - 跳过（已存在）: PMID={pmid} | {title[:60]}')
            return 'skipped'

        content = self._build_content(paper)
        raw = RawKnowledgeInput(
            title=title,
            content=content,
            entry_type='paper_abstract',
            source_type='pubmed_import',
            source_key=source_key,
            tags=['论文', 'PubMed', paper.get('keyword', ''), spec['canonical_topic']],
            namespace='cnkis',
            uri=source_url,
            summary=(paper.get('abstract', '') or '')[:240],
            package_id=spec['package_id'],
            canonical_topic=spec['canonical_topic'],
            facet=spec['facet'],
            properties={
                'pmid': pmid,
                'source_url': paper.get('source_url', ''),
                'keyword': paper.get('keyword', ''),
                'pub_year': paper.get('pub_year', ''),
                'journal': paper.get('journal', ''),
                'portfolio_import': True,
            },
        )

        try:
            result = run_pipeline(raw)
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f'  ✗ 失败: PMID={pmid} | {exc}'))
            return 'error'

        if result and result.entry_id:
            KnowledgeEntry.objects.filter(id=result.entry_id).update(
                status='published',
                is_published=True,
            )

        if result and result.entry_id and not existed_before:
            self.stdout.write(
                self.style.SUCCESS(
                    f'  ✓ [{result.entry_id}] PMID={pmid} -> {spec["package_id"]} | {raw.title[:60]}'
                )
            )
            return 'created'
        return 'skipped'

    def _is_relevant(self, spec: Dict[str, Any], paper: Dict[str, str]) -> bool:
        include_any = [item.lower() for item in spec.get('include_any', []) if item]
        title_include_any = [item.lower() for item in spec.get('title_include_any', []) if item]
        title_include_all = [item.lower() for item in spec.get('title_include_all', []) if item]
        title_exclude_any = [item.lower() for item in spec.get('title_exclude_any', []) if item]
        title_text = (paper.get('title', '') or '').lower()
        if not include_any:
            text_ok = True
        else:
            haystack = ' '.join([
                paper.get('title', '') or '',
                paper.get('abstract', '') or '',
                paper.get('keyword', '') or '',
            ]).lower()
            text_ok = any(term in haystack for term in include_any)
        if title_include_any:
            title_ok = any(term in title_text for term in title_include_any)
        else:
            title_ok = True
        if title_include_all:
            title_all_ok = all(term in title_text for term in title_include_all)
        else:
            title_all_ok = True
        if title_exclude_any:
            title_excluded = any(term in title_text for term in title_exclude_any)
        else:
            title_excluded = False
        return text_ok and title_ok and title_all_ok and not title_excluded

    def _build_content(self, paper: Dict[str, str]) -> str:
        title = paper.get('title', '').strip()
        abstract = (paper.get('abstract') or '').strip()
        journal = (paper.get('journal') or '').strip()
        pub_year = (paper.get('pub_year') or '').strip()
        source_url = (paper.get('source_url') or '').strip()
        parts = [
            title,
            '',
            f'PMID: {paper.get("pmid", "")}',
            f'Journal: {journal}' if journal else '',
            f'Year: {pub_year}' if pub_year else '',
            f'Source URL: {source_url}' if source_url else '',
            '',
            abstract,
        ]
        return '\n'.join(part for part in parts if part is not None)
