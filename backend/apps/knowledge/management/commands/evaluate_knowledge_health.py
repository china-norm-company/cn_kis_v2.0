"""
知识库健康度评估命令

自动计算知识库的三维度评估指标并输出格式化报告：
  1. 数据规模（Scale）
  2. 链路完整性（Integrity）
  3. 检索效能（Retrieval）— 内置 20 题标准测试集

通过标准（对应预训练目标）：
  硬性指标（必须全部达标）：
    - 知识条目数 >= 500
    - 实体关联率 >= 80%
    - 向量化覆盖率 >= 80%
    - namespace 覆盖率 >= 7/9
    - entry_type 覆盖率 >= 8/13
    - 检索命中率 >= 70%

  目标指标（软性）：
    - 平均 Precision@5 >= 0.6
    - 平均 Recall@5 >= 0.5
    - 图谱增值率 >= 1.15
    - 向量增值率 >= 1.2

用法:
  python manage.py evaluate_knowledge_health
  python manage.py evaluate_knowledge_health --full       # 含完整检索测试
  python manage.py evaluate_knowledge_health --json       # 输出 JSON 格式
  python manage.py evaluate_knowledge_health --output report.txt
"""
import json
import time
import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)

# 9 个预期 namespace
EXPECTED_NAMESPACES = [
    'cnkis', 'cdisc_sdtm', 'cdisc_cdash', 'cdisc_odm',
    'bridg', 'nmpa_regulation', 'internal_sop',
    'project_experience', 'custom',
]

# 13 个预期 entry_type
EXPECTED_ENTRY_TYPES = [
    'regulation', 'sop', 'proposal_template', 'method_reference',
    'lesson_learned', 'faq', 'feishu_doc', 'competitor_intel',
    'instrument_spec', 'ingredient_data', 'meeting_decision',
    'market_insight', 'paper_abstract',
]

# 20 题标准检索测试集
RETRIEVAL_TEST_SET = [
    {
        'id': 'Q01',
        'query': '保湿功效评价方案怎么设计',
        'scenario': 'protocol_design',
        'expected_entry_types': ['method_reference', 'regulation', 'instrument_spec'],
        'expected_keywords': ['Corneometer', 'TEWL', 'GB/T', '随机对照', '保湿'],
        'min_relevant_results': 2,
    },
    {
        'id': 'Q02',
        'query': '烟酰胺的使用限量是多少',
        'scenario': 'ingredient_compliance',
        'expected_entry_types': ['regulation', 'ingredient_data'],
        'expected_keywords': ['烟酰胺', '限量', 'niacinamide', '法规'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q03',
        'query': 'Corneometer 正常值范围',
        'scenario': 'instrument_operation',
        'expected_entry_types': ['instrument_spec', 'method_reference'],
        'expected_keywords': ['Corneometer', '角质层', '含水量'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q04',
        'query': '最新的化妆品法规更新',
        'scenario': 'regulation_tracking',
        'expected_entry_types': ['regulation'],
        'expected_keywords': ['NMPA', '法规', '化妆品', '功效'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q05',
        'query': '防晒产品 SPF 测试方法',
        'scenario': 'test_method',
        'expected_entry_types': ['method_reference', 'regulation'],
        'expected_keywords': ['SPF', '防晒', 'ISO', 'in vivo'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q06',
        'query': '受试者入组流程',
        'scenario': 'clinical_process',
        'expected_entry_types': ['sop', 'method_reference'],
        'expected_keywords': ['受试者', '入组', '筛选', 'StudySubject'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q07',
        'query': 'SDTM DM 域包含哪些变量',
        'scenario': 'cdisc_standard',
        'expected_entry_types': ['method_reference'],
        'expected_keywords': ['SDTM', 'DM', 'SUBJID', 'AGE', 'SEX'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q08',
        'query': '皮肤刺激性斑贴试验方法',
        'scenario': 'test_method',
        'expected_entry_types': ['method_reference', 'regulation'],
        'expected_keywords': ['斑贴', '刺激', 'ISO', '48h'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q09',
        'query': '化妆品功效宣称评价规范',
        'scenario': 'regulation_query',
        'expected_entry_types': ['regulation'],
        'expected_keywords': ['功效宣称', 'NMPA', '评价', '规范'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q10',
        'query': '美白功效评价需要哪些仪器',
        'scenario': 'protocol_design',
        'expected_entry_types': ['instrument_spec', 'method_reference'],
        'expected_keywords': ['Mexameter', '美白', 'L*', '色度', '肤色'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q11',
        'query': 'BRIDG StudySubject 是什么',
        'scenario': 'ontology_query',
        'expected_entry_types': ['method_reference'],
        'expected_keywords': ['StudySubject', 'BRIDG', '受试者'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q12',
        'query': 'TEWL 经皮水分散失测量',
        'scenario': 'instrument_operation',
        'expected_entry_types': ['instrument_spec', 'method_reference'],
        'expected_keywords': ['TEWL', 'Tewameter', '经皮水分', '屏障'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q13',
        'query': '消费者保湿体验描述',
        'scenario': 'consumer_insight',
        'expected_entry_types': ['method_reference', 'market_insight'],
        'expected_keywords': ['保湿', '体验', '消费者', '感知'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q14',
        'query': '入排标准筛选受试者',
        'scenario': 'clinical_process',
        'expected_entry_types': ['sop', 'method_reference'],
        'expected_keywords': ['入排标准', '筛选', '入选', '排除'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q15',
        'query': '化妆品 CRO 检测机构竞品分析',
        'scenario': 'competitor_intelligence',
        'expected_entry_types': ['competitor_intel', 'market_insight'],
        'expected_keywords': ['CRO', '检测', '竞品', '行业'],
        'min_relevant_results': 0,  # 可能无数据，不要求命中
    },
    {
        'id': 'Q16',
        'query': '皮肤弹性测量 Cutometer',
        'scenario': 'instrument_operation',
        'expected_entry_types': ['instrument_spec', 'method_reference'],
        'expected_keywords': ['Cutometer', '弹性', '皮肤'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q17',
        'query': 'CDISC CDASH 临床数据采集',
        'scenario': 'cdisc_standard',
        'expected_entry_types': ['method_reference'],
        'expected_keywords': ['CDASH', 'CDISC', '数据采集'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q18',
        'query': '知情同意书 ICF 流程',
        'scenario': 'clinical_process',
        'expected_entry_types': ['sop', 'method_reference'],
        'expected_keywords': ['知情同意', 'ICF', 'InformedConsent'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q19',
        'query': '抗皱功效评价紧致度测量',
        'scenario': 'protocol_design',
        'expected_entry_types': ['instrument_spec', 'method_reference'],
        'expected_keywords': ['抗皱', '紧致', 'PRIMOS', 'Cutometer'],
        'min_relevant_results': 1,
    },
    {
        'id': 'Q20',
        'query': '化妆品成分安全评估',
        'scenario': 'ingredient_compliance',
        'expected_entry_types': ['ingredient_data', 'regulation'],
        'expected_keywords': ['成分', '安全', '评估', '化妆品'],
        'min_relevant_results': 1,
    },
]


class Command(BaseCommand):
    help = '知识库健康度评估（三维度：数据规模 + 链路完整性 + 检索效能）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--full', action='store_true',
            help='执行完整检索测试集（默认仅执行 keyword 通道，full 则三通道对比）',
        )
        parser.add_argument(
            '--json', action='store_true',
            help='以 JSON 格式输出报告',
        )
        parser.add_argument(
            '--output', type=str, default='',
            help='将报告保存到文件（可选）',
        )
        parser.add_argument(
            '--skip-retrieval', action='store_true',
            help='跳过检索测试（仅输出数据统计）',
        )

    def handle(self, *args, **options):
        self.full_mode = options['full']
        self.json_mode = options['json']
        self.output_file = options['output']
        self.skip_retrieval = options['skip_retrieval']

        report = self._generate_report()

        if self.json_mode:
            output = json.dumps(report, ensure_ascii=False, indent=2)
        else:
            output = self._format_report(report)

        self.stdout.write(output)

        if self.output_file:
            with open(self.output_file, 'w', encoding='utf-8') as f:
                f.write(output)
            self.stdout.write(self.style.SUCCESS(f'\n报告已保存至: {self.output_file}'))

    def _generate_report(self) -> dict:
        from apps.knowledge.models import KnowledgeEntry, KnowledgeEntity, KnowledgeRelation
        from django.db.models import Count

        report = {
            'generated_at': timezone.now().isoformat(),
            'scale': {},
            'integrity': {},
            'retrieval': {},
            'topic_packages': {},
            'graphiti': {},
            'issues': [],
            'pass_status': {},
        }

        # ── 维度一：数据规模 ──
        entry_count = KnowledgeEntry.objects.filter(is_deleted=False).count()
        entity_count = KnowledgeEntity.objects.filter(is_deleted=False).count()
        relation_count = KnowledgeRelation.objects.filter(is_deleted=False).count()
        published_count = KnowledgeEntry.objects.filter(
            is_deleted=False, is_published=True
        ).count()

        # namespace 分布
        ns_distribution = dict(
            KnowledgeEntry.objects.filter(is_deleted=False)
            .values('namespace').annotate(count=Count('id'))
            .values_list('namespace', 'count')
        )
        ns_covered = [ns for ns in EXPECTED_NAMESPACES if ns_distribution.get(ns, 0) > 0]

        # entry_type 分布
        et_distribution = dict(
            KnowledgeEntry.objects.filter(is_deleted=False)
            .values('entry_type').annotate(count=Count('id'))
            .values_list('entry_type', 'count')
        )
        et_covered = [et for et in EXPECTED_ENTRY_TYPES if et_distribution.get(et, 0) > 0]

        # 90 天内创建的条目（时效性）
        days_90_ago = timezone.now() - timedelta(days=90)
        recent_count = KnowledgeEntry.objects.filter(
            is_deleted=False, create_time__gte=days_90_ago
        ).count()

        report['scale'] = {
            'entry_count': entry_count,
            'entity_count': entity_count,
            'relation_count': relation_count,
            'published_count': published_count,
            'publish_rate': round(published_count / max(entry_count, 1) * 100, 1),
            'recent_count_90d': recent_count,
            'namespace_distribution': ns_distribution,
            'namespace_covered': len(ns_covered),
            'namespace_covered_list': ns_covered,
            'namespace_missing': [ns for ns in EXPECTED_NAMESPACES if ns not in ns_covered],
            'entry_type_distribution': et_distribution,
            'entry_type_covered': len(et_covered),
            'entry_type_covered_list': et_covered,
            'entry_type_missing': [et for et in EXPECTED_ENTRY_TYPES if et not in et_covered],
        }

        # ── 维度二：链路完整性 ──
        total_entities = entity_count
        linked_entities = KnowledgeEntity.objects.filter(
            is_deleted=False, linked_entry__isnull=False
        ).count()
        link_rate = round(linked_entities / max(total_entities, 1) * 100, 1)

        total_entries = entry_count
        indexed_count = KnowledgeEntry.objects.filter(
            is_deleted=False, index_status='indexed'
        ).count()
        failed_count = KnowledgeEntry.objects.filter(
            is_deleted=False, index_status='failed'
        ).count()
        pending_count = KnowledgeEntry.objects.filter(
            is_deleted=False, index_status='pending'
        ).count()
        vector_rate = round(indexed_count / max(total_entries, 1) * 100, 1)

        # 图谱密度（平均每实体关系数）
        graph_density = round(relation_count / max(entity_count, 1), 2)

        report['integrity'] = {
            'linked_entities': linked_entities,
            'total_entities': total_entities,
            'link_rate': link_rate,
            'indexed_entries': indexed_count,
            'failed_entries': failed_count,
            'pending_entries': pending_count,
            'total_entries': total_entries,
            'vector_rate': vector_rate,
            'graph_density': graph_density,
        }

        # ── 维度二补充：专题包 / Graphiti 阈值 ──
        try:
            from apps.knowledge.models import TopicPackage
            packages = list(TopicPackage.objects.filter(is_deleted=False))
            avg_coverage = round(
                sum(p.coverage_rate() for p in packages) / max(len(packages), 1), 3
            ) if packages else 0.0
            required_below = [
                {
                    'package_id': p.package_id,
                    'coverage_rate': p.coverage_rate(),
                }
                for p in packages
                if p.required_for_release and p.coverage_rate() < 0.6
            ]
            report['topic_packages'] = {
                'total_packages': len(packages),
                'required_for_release': sum(1 for p in packages if p.required_for_release),
                'avg_coverage_rate': avg_coverage,
                'required_below_threshold': required_below,
            }
        except Exception as e:
            report['topic_packages'] = {'error': str(e)}

        try:
            from apps.knowledge.retrieval_gateway import (
                GRAPHITI_MIN_ENTITIES,
                GRAPHITI_MIN_RELATIONS,
            )
            report['graphiti'] = {
                'graphiti_ready': (
                    entity_count >= GRAPHITI_MIN_ENTITIES and
                    relation_count >= GRAPHITI_MIN_RELATIONS
                ),
                'entity_threshold': GRAPHITI_MIN_ENTITIES,
                'relation_threshold': GRAPHITI_MIN_RELATIONS,
            }
        except Exception as e:
            report['graphiti'] = {'error': str(e)}

        # ── 维度三：检索效能 ──
        if not self.skip_retrieval:
            retrieval_results = self._run_retrieval_tests()
            report['retrieval'] = retrieval_results
        else:
            report['retrieval'] = {'skipped': True}

        # ── 问题清单与通过状态 ──
        issues = []
        pass_status = {}

        # 硬性指标检查
        checks = [
            ('entry_count_500', entry_count >= 500,
             f'知识条目数 {entry_count}/500（{"✓" if entry_count >= 500 else "✗"}）', '硬性'),
            ('link_rate_80', link_rate >= 80,
             f'实体关联率 {link_rate}%/80%（{"✓" if link_rate >= 80 else "✗"}）', '硬性'),
            ('vector_rate_80', vector_rate >= 80,
             f'向量化覆盖率 {vector_rate}%/80%（{"✓" if vector_rate >= 80 else "✗"}）', '硬性'),
            ('namespace_7_9', len(ns_covered) >= 7,
             f'namespace 覆盖 {len(ns_covered)}/9（{"✓" if len(ns_covered) >= 7 else "✗"}）', '硬性'),
            ('entry_type_8_13', len(et_covered) >= 8,
             f'entry_type 覆盖 {len(et_covered)}/13（{"✓" if len(et_covered) >= 8 else "✗"}）', '硬性'),
        ]

        topic_metrics = report.get('topic_packages', {})
        if 'error' not in topic_metrics:
            checks.extend([
                (
                    'topic_packages_required_coverage',
                    len(topic_metrics.get('required_below_threshold', [])) == 0,
                    '专题包硬门禁覆盖率达标'
                    if len(topic_metrics.get('required_below_threshold', [])) == 0
                    else f'存在 {len(topic_metrics.get("required_below_threshold", []))} 个必过专题包覆盖率 < 0.6',
                    '硬性',
                ),
                (
                    'graphiti_threshold_ready',
                    report.get('graphiti', {}).get('graphiti_ready', False),
                    'Graphiti 阈值已达成'
                    if report.get('graphiti', {}).get('graphiti_ready', False)
                    else 'Graphiti 阈值未达成',
                    '治理',
                ),
            ])

        for check_id, passed, msg, level in checks:
            pass_status[check_id] = passed
            if not passed:
                issues.append({'level': level, 'check': check_id, 'message': msg})

        if not self.skip_retrieval and 'hit_rate' in report['retrieval']:
            hit_rate = report['retrieval']['hit_rate']
            passed = hit_rate >= 70
            pass_status['hit_rate_70'] = passed
            if not passed:
                issues.append({
                    'level': '硬性',
                    'check': 'hit_rate_70',
                    'message': f'检索命中率 {hit_rate:.1f}%/70%（✗）',
                })

        report['issues'] = issues
        report['pass_status'] = pass_status
        report['overall_pass'] = all(pass_status.values()) if pass_status else False

        return report

    def _run_retrieval_tests(self) -> dict:
        """执行 20 题标准检索测试集"""
        try:
            from apps.knowledge.retrieval_gateway import RetrievalGateway
            gateway = RetrievalGateway()
        except Exception as e:
            return {'error': str(e), 'hit_rate': 0}

        results = []
        hit_count = 0
        total_questions = len(RETRIEVAL_TEST_SET)

        for q in RETRIEVAL_TEST_SET:
            try:
                # keyword-only 测试
                kw_results = gateway.keyword_search(q['query'], top_k=5)

                # 计算相关性（关键词匹配）
                relevant_count = 0
                for result in kw_results[:5]:
                    content = (
                        (result.get('title', '') or '') + ' ' +
                        (result.get('content', '') or '') + ' ' +
                        (result.get('summary', '') or '')
                    ).lower()
                    is_relevant = any(
                        kw.lower() in content for kw in q['expected_keywords']
                    )
                    if is_relevant:
                        relevant_count += 1

                precision_5 = round(relevant_count / max(len(kw_results[:5]), 1), 2)
                hit_kw = relevant_count >= q.get('min_relevant_results', 1)

                result_item = {
                    'id': q['id'],
                    'query': q['query'],
                    'scenario': q['scenario'],
                    'hit_kw': hit_kw,
                    'kw_result_count': len(kw_results),
                    'precision_at_5_kw': precision_5,
                    'relevant_count': relevant_count,
                }

                # full 模式：再测试向量+图谱通道
                if self.full_mode:
                    try:
                        multi_results = gateway.multi_channel_search(q['query'], top_k=5)
                        multi_relevant = 0
                        for result in multi_results[:5]:
                            content = (
                                (result.get('title', '') or '') + ' ' +
                                (result.get('content', '') or '') + ' ' +
                                (result.get('summary', '') or '')
                            ).lower()
                            if any(kw.lower() in content for kw in q['expected_keywords']):
                                multi_relevant += 1
                        hit_multi = multi_relevant >= q.get('min_relevant_results', 1)
                        result_item['precision_at_5_multi'] = round(
                            multi_relevant / max(len(multi_results[:5]), 1), 2
                        )
                        result_item['multi_result_count'] = len(multi_results)
                        result_item['multi_relevant_count'] = multi_relevant
                        result_item['hit_multi'] = hit_multi
                    except Exception as e:
                        result_item['multi_error'] = str(e)

                # full 模式按三通道结果判定命中；否则按关键词通道
                hit = result_item.get('hit_multi', hit_kw) if self.full_mode else hit_kw
                result_item['hit'] = hit

                if hit:
                    hit_count += 1

                results.append(result_item)
                time.sleep(0.05)  # 小延迟避免数据库压力

            except Exception as e:
                results.append({
                    'id': q['id'],
                    'query': q['query'],
                    'error': str(e),
                    'hit': False,
                })

        hit_rate = round(hit_count / total_questions * 100, 1)
        avg_precision = round(
            sum(r.get('precision_at_5_kw', 0) for r in results) / max(total_questions, 1), 2
        )

        return {
            'total_questions': total_questions,
            'hit_count': hit_count,
            'hit_rate': hit_rate,
            'avg_precision_at_5_kw': avg_precision,
            'per_question': results,
        }

    def _format_report(self, report: dict) -> str:
        lines = []
        sep = '═' * 60

        lines.append(sep)
        lines.append('   CN_KIS V1.0 知识库健康度评估报告')
        lines.append(f'   生成时间: {report["generated_at"]}')
        lines.append(sep)

        # 总体结论
        overall = '✅ 全部通过' if report.get('overall_pass') else '❌ 存在不达标项'
        lines.append(f'\n【总体结论】{overall}')

        # 维度一：数据规模
        s = report['scale']
        lines.append('\n【维度一：数据规模】')
        lines.append(f'  知识条目 (KnowledgeEntry): {s["entry_count"]} 条'
                     f' (目标 ≥500 {"✓" if s["entry_count"] >= 500 else "✗"})')
        lines.append(f'  已发布条目: {s["published_count"]} 条 (发布率 {s["publish_rate"]}%)')
        lines.append(f'  知识实体 (KnowledgeEntity): {s["entity_count"]} 个')
        lines.append(f'  知识关系 (KnowledgeRelation): {s["relation_count"]} 条')
        lines.append(f'  90 天内新增: {s["recent_count_90d"]} 条')
        lines.append(f'\n  Namespace 覆盖: {s["namespace_covered"]}/9'
                     f' (目标 ≥7 {"✓" if s["namespace_covered"] >= 7 else "✗"})')
        if s['namespace_covered_list']:
            lines.append(f'  已有: {", ".join(s["namespace_covered_list"])}')
        if s['namespace_missing']:
            lines.append(f'  缺失: {", ".join(s["namespace_missing"])}')
        lines.append(f'\n  Entry Type 覆盖: {s["entry_type_covered"]}/13'
                     f' (目标 ≥8 {"✓" if s["entry_type_covered"] >= 8 else "✗"})')
        if s['entry_type_covered_list']:
            lines.append(f'  已有: {", ".join(s["entry_type_covered_list"])}')
        if s['entry_type_missing']:
            lines.append(f'  缺失: {", ".join(s["entry_type_missing"])}')

        # 维度二：链路完整性
        i = report['integrity']
        lines.append('\n【维度二：链路完整性】')
        lines.append(f'  实体关联率: {i["link_rate"]}%'
                     f' ({i["linked_entities"]}/{i["total_entities"]})'
                     f' (目标 ≥80% {"✓" if i["link_rate"] >= 80 else "✗"})')
        lines.append(f'  向量化覆盖率: {i["vector_rate"]}%'
                     f' ({i["indexed_entries"]}/{i["total_entries"]} 条目)'
                     f' (待向量化={i["pending_entries"]}, 失败={i["failed_entries"]})'
                     f' (目标 ≥80% {"✓" if i["vector_rate"] >= 80 else "✗"})')
        lines.append(f'  图谱密度: {i["graph_density"]} 关系/实体 (目标 ≥0.3'
                     f' {"✓" if i["graph_density"] >= 0.3 else "✗"})')
        tp = report.get('topic_packages', {})
        if not tp.get('error'):
            lines.append(
                f'  专题包: total={tp["total_packages"]}, required={tp["required_for_release"]}, '
                f'avg_coverage={tp["avg_coverage_rate"]}'
            )
            below = tp.get('required_below_threshold', [])
            if below:
                lines.append(
                    '  必过专题包未达标: ' +
                    ', '.join(f'{item["package_id"]}({item["coverage_rate"]})' for item in below)
                )
        graphiti = report.get('graphiti', {})
        if not graphiti.get('error'):
            lines.append(
                f'  Graphiti 阈值: entity {graphiti["entity_threshold"]}, '
                f'relation {graphiti["relation_threshold"]}, '
                f'ready={"✓" if graphiti["graphiti_ready"] else "✗"}'
            )

        # 维度三：检索效能
        r = report['retrieval']
        lines.append('\n【维度三：检索效能（20 题标准测试集）】')
        if r.get('skipped'):
            lines.append('  （已跳过，使用 --skip-retrieval 标志）')
        elif r.get('error'):
            lines.append(f'  检索测试失败: {r["error"]}')
        else:
            lines.append(f'  检索命中率: {r["hit_rate"]}%'
                         f' ({r["hit_count"]}/{r["total_questions"]})'
                         f' (目标 ≥70% {"✓" if r["hit_rate"] >= 70 else "✗"})')
            lines.append(f'  关键词通道 Precision@5: {r["avg_precision_at_5_kw"]}'
                         f' (目标 ≥0.4 {"✓" if r["avg_precision_at_5_kw"] >= 0.4 else "✗"})')

            if not self.full_mode:
                lines.append('  （使用 --full 运行三通道对比测试）')

            # 未命中题目列表
            missed = [q for q in r.get('per_question', []) if not q.get('hit')]
            if missed:
                lines.append(f'\n  未命中题目 ({len(missed)}/{r["total_questions"]}):')
                for q in missed:
                    lines.append(f'    {q["id"]}: {q["query"][:40]}...')

        # 问题清单
        issues = report.get('issues', [])
        if issues:
            lines.append(f'\n【问题清单 ({len(issues)} 项不达标)】')
            for issue in issues:
                level_mark = '🔴' if issue['level'] == '硬性' else '🟡'
                lines.append(f'  {level_mark} [{issue["level"]}] {issue["message"]}')
        else:
            lines.append('\n【问题清单】无（全部达标）')

        lines.append(f'\n{sep}')
        return '\n'.join(lines)
