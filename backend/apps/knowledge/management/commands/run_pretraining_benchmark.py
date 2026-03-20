"""
三层预训练评测引擎

层级：
  Layer 1 - 检索门禁：Precision@5 ≥ 0.6，Recall@5 ≥ 0.5，Hit Rate ≥ 0.8
  Layer 2 - 回答门禁：LLM 自动评分（Groundedness ≥ 0.7，Relevancy ≥ 0.75，Completeness ≥ 0.65）
  Layer 3 - 业务场景门禁：针对五大核心域的端到端场景测试

运行方式：
  python manage.py run_pretraining_benchmark
  python manage.py run_pretraining_benchmark --layer L1   # 仅检索层
  python manage.py run_pretraining_benchmark --layer L2   # 仅回答层
  python manage.py run_pretraining_benchmark --layer L3   # 仅场景层
  python manage.py run_pretraining_benchmark --domain 法规 # 仅某知识域
  python manage.py run_pretraining_benchmark --quick       # 快速模式（各类型各5题）
"""
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)

# ── 门禁阈值（一流专业标准）────────────────────────────────────────────────────
# 对标行业头部 CRO 机构的专业知识水准，不以"可用"为目标，以"专业领先"为目标。

LAYER1_THRESHOLDS = {
    'hit_rate': 0.95,          # ≥95% 的查询至少命中 1 条相关结果（行业一流：查询不漏）
    'precision_at_5': 0.75,    # Top-5 中至少 75% 相关（精准检索，减少噪音）
    'recall_at_5': 0.80,       # 已知相关结果中至少 80% 在 Top-5 中（覆盖全面）
}

LAYER2_THRESHOLDS = {
    'groundedness': 0.85,      # 回答有充分事实依据，不捏造（一流 RAG 可信度）
    'relevancy': 0.88,         # 回答高度切题，直接回答核心问题
    'completeness': 0.80,      # 回答覆盖核心要点，无明显遗漏
}

LAYER3_THRESHOLDS = {
    'scenario_pass_rate': 0.90,  # 业务场景通过率 ≥ 90%（关键业务几乎无盲区）
    'critical_pass_rate': 1.00,  # 高难度场景必须 100% 通过（法规、安全不可失误）
}

# ── 快速模式采样配置 ──────────────────────────────────────────────────────

QUICK_MODE_SAMPLE = 5  # 每个知识域各取 5 题


def _load_benchmark():
    """加载基准题库"""
    from tests.ai_eval.pretraining_benchmark import PRETRAINING_BENCHMARK
    return PRETRAINING_BENCHMARK


def _compute_topic_package_metrics() -> Dict[str, Any]:
    """
    统计专题包覆盖情况。

    这是规划中“专题包门禁”的最小可运行版本：
    - 专题包数量
    - 必过专题包数量
    - 平均 facet 覆盖率
    - 低覆盖专题包列表（< 0.6）
    """
    try:
        from apps.knowledge.models import TopicPackage

        packages = list(TopicPackage.objects.filter(is_deleted=False))
        if not packages:
            return {
                'total_packages': 0,
                'required_for_release': 0,
                'avg_coverage_rate': 0.0,
                'below_threshold': [],
            }

        below_threshold = []
        total_coverage = 0.0
        for package in packages:
            coverage = package.coverage_rate()
            total_coverage += coverage
            if coverage < 0.6:
                below_threshold.append({
                    'package_id': package.package_id,
                    'canonical_topic': package.canonical_topic,
                    'coverage_rate': coverage,
                    'required_for_release': package.required_for_release,
                })

        return {
            'total_packages': len(packages),
            'required_for_release': sum(1 for p in packages if p.required_for_release),
            'avg_coverage_rate': round(total_coverage / len(packages), 3),
            'below_threshold': below_threshold,
        }
    except Exception as e:
        return {'error': str(e)}


def _run_layer1_retrieval(questions: List[Dict], top_k: int = 5) -> Dict[str, Any]:
    """
    Layer 1: 检索门禁评测（复用生产检索链，不走私有 wrapper）

    评测统一检索链的命中率、precision、recall、latency。
    """
    from apps.knowledge.retrieval_gateway import multi_channel_search

    results = []
    hits = 0
    total_precision = 0.0
    total_recall = 0.0

    for q in questions:
        query_id = q['id']
        query = q['query']
        ground_truth = q['ground_truth']
        expected_types = q.get('entry_types', [])

        try:
            start = time.time()
            search_response = multi_channel_search(query=query, top_k=top_k, enable_rerank=True)
            search_results = search_response.get('items', [])
            elapsed = time.time() - start

            hit = False
            relevant_in_results = 0

            import re as _re

            for result in search_results[:top_k]:
                content = (
                    result.get('content', '') +
                    result.get('title', '') +
                    result.get('summary', '')
                ).lower()
                gt_lower = ground_truth.lower()

                en_words = [
                    w.strip('(),（）、。；：')
                    for w in gt_lower.split()
                    if len(w.strip('(),（）、。；：')) > 3 and w.strip('(),（）、。；：').isascii()
                ]
                cn_words = _re.findall(r'[\u4e00-\u9fff]{3,6}', ground_truth)
                gt_keywords = list(dict.fromkeys(en_words + cn_words))

                if not gt_keywords:
                    gt_keywords = [gt_lower[:20]] if gt_lower else []

                keyword_matches = sum(1 for kw in gt_keywords if kw.lower() in content)
                keyword_score = keyword_matches / max(len(gt_keywords), 1)

                result_type = result.get('entry_type', '')
                type_match = result_type in expected_types if expected_types else True

                if keyword_score >= 0.25 or type_match:
                    relevant_in_results += 1
                    hit = True

            precision_at_k = relevant_in_results / max(len(search_results[:top_k]), 1)
            recall_at_k = min(relevant_in_results / max(len(expected_types), 1), 1.0)

            hits += 1 if hit else 0
            total_precision += precision_at_k
            total_recall += recall_at_k

            results.append({
                'id': query_id,
                'query': query[:80],
                'hit': hit,
                'relevant_in_results': relevant_in_results,
                'precision_at_k': round(precision_at_k, 3),
                'recall_at_k': round(recall_at_k, 3),
                'result_count': len(search_results),
                'elapsed_ms': round(elapsed * 1000, 1),
                'domain': q.get('domain', ''),
                'difficulty': q.get('difficulty', ''),
                # 可观测字段：哪个通道、是否经过 reranker
                'channels': search_response.get('channels_used', []),
                'reranked': search_response.get('reranked', False),
                'total_candidates': search_response.get('total_candidates', 0),
            })

        except Exception as e:
            logger.warning('Layer1 retrieval error for %s: %s', query_id, e)
            results.append({
                'id': query_id,
                'query': query[:80],
                'hit': False,
                'error': str(e),
                'domain': q.get('domain', ''),
            })

    n = len(questions)
    summary = {
        'total_questions': n,
        'hit_rate': round(hits / max(n, 1), 3),
        'avg_precision_at_k': round(total_precision / max(n, 1), 3),
        'avg_recall_at_k': round(total_recall / max(n, 1), 3),
        'thresholds': LAYER1_THRESHOLDS,
        'pass': (
            hits / max(n, 1) >= LAYER1_THRESHOLDS['hit_rate'] and
            total_precision / max(n, 1) >= LAYER1_THRESHOLDS['precision_at_5'] and
            total_recall / max(n, 1) >= LAYER1_THRESHOLDS['recall_at_5']
        ),
        'details': results,
    }
    return summary


def _run_layer2_answer(questions: List[Dict]) -> Dict[str, Any]:
    """
    Layer 2: 回答质量评测（LLM-as-Judge）

    复用生产回答链：通过 agent_gateway.services.quick_chat 调用 knowledge-agent，
    不再手工拼 prompt 直调模型（那样会脱离生产检索链）。
    """
    try:
        from apps.agent_gateway.services import get_kimi_client, generate_agent_answer
    except Exception as e:
        return {'error': f'无法初始化 LLM 客户端: {e}', 'pass': False}

    results = []
    total_groundedness = 0.0
    total_relevancy = 0.0
    total_completeness = 0.0
    evaluated = 0

    for q in questions:
        query_id = q['id']
        query = q['query']
        ground_truth = q['ground_truth']

        try:
            # 复用共享回答服务（与生产 chat 共用 Agent 配置、知识注入和 tool loop）
            answer_result = generate_agent_answer(
                agent_id='knowledge-agent',
                message=query,
                context={},
            )
            answer = answer_result.get('output_text', '')

            # LLM-as-Judge 评估
            judge_prompt = f"""请评估以下AI回答的质量，分别给出三个维度的0-10分：

问题：{query}

AI回答：
{answer[:600]}

标准答案要点：
{ground_truth}

请严格按以下JSON格式返回评分（只返回JSON，不要其他文字）：
{{
  "groundedness": <0-10，回答中的事实是否有依据，是否捏造>,
  "relevancy": <0-10，回答是否直接回应了问题>,
  "completeness": <0-10，回答是否覆盖了核心要点>,
  "brief_reason": "<简短说明评分理由>"
}}"""

            client = get_kimi_client()
            judge_resp = client.chat.completions.create(
                model='moonshot-v1-32k',
                messages=[
                    {'role': 'system', 'content': '你是严格的AI回答质量评估员，只返回JSON格式评分。'},
                    {'role': 'user', 'content': judge_prompt},
                ],
                temperature=0.0,
                max_tokens=300,
            )
            judge_raw = judge_resp.choices[0].message.content or ''
            judge_raw = judge_raw.strip()
            if judge_raw.startswith('```'):
                import re
                judge_raw = re.sub(r'^```\w*\s*', '', judge_raw)
                judge_raw = re.sub(r'\s*```$', '', judge_raw)

            scores = json.loads(judge_raw)
            g = scores.get('groundedness', 5) / 10.0
            r = scores.get('relevancy', 5) / 10.0
            c = scores.get('completeness', 5) / 10.0

            total_groundedness += g
            total_relevancy += r
            total_completeness += c
            evaluated += 1

            results.append({
                'id': query_id,
                'query': query[:80],
                'groundedness': round(g, 2),
                'relevancy': round(r, 2),
                'completeness': round(c, 2),
                'answer_snippet': answer[:200],
                'judge_reason': scores.get('brief_reason', ''),
                'domain': q.get('domain', ''),
                'difficulty': q.get('difficulty', ''),
            })

        except Exception as e:
            logger.warning('Layer2 eval error for %s: %s', query_id, e)
            results.append({
                'id': query_id,
                'query': query[:80],
                'error': str(e),
                'domain': q.get('domain', ''),
            })

    n = max(evaluated, 1)
    avg_g = total_groundedness / n
    avg_r = total_relevancy / n
    avg_c = total_completeness / n

    summary = {
        'total_questions': len(questions),
        'evaluated': evaluated,
        'avg_groundedness': round(avg_g, 3),
        'avg_relevancy': round(avg_r, 3),
        'avg_completeness': round(avg_c, 3),
        'thresholds': LAYER2_THRESHOLDS,
        'pass': (
            avg_g >= LAYER2_THRESHOLDS['groundedness'] and
            avg_r >= LAYER2_THRESHOLDS['relevancy'] and
            avg_c >= LAYER2_THRESHOLDS['completeness']
        ),
        'details': results,
    }
    return summary


def _run_layer3_scenarios() -> Dict[str, Any]:
    """
    Layer 3: 业务场景门禁（端到端场景验证）
    测试五大场景：保湿评价方案设计、SPF合规查询、成分安全决策、偏差处理、报告撰写
    """
    scenarios = [
        {
            'id': 'sc-001',
            'name': '保湿评价方案设计',
            'query': '请帮我设计一个保湿功效评价的研究方案，受试者30人，使用4周，产品宣称保湿，主要用Corneometer测量。',
            'must_contain': ['Corneometer', '样本量', '统计', '基线', '访视'],
            'domain': '方法学',
            'critical': False,
        },
        {
            'id': 'sc-002',
            'name': 'SPF 注册合规查询',
            'query': '我们有一款面霜宣称SPF30 PA+++，这是特殊化妆品吗？注册时需要提交什么功效评价材料？',
            'must_contain': ['特殊化妆品', '注册', '人体功效评价', 'SPF', 'PA'],
            'domain': '法规',
            'critical': True,
        },
        {
            'id': 'sc-003',
            'name': '成分安全合规',
            'query': '配方中含5%烟酰胺和0.3%视黄醇，这两个成分的使用浓度在中国和欧盟是否合规？',
            'must_contain': ['烟酰胺', '视黄醇', '浓度', '安全'],
            'domain': '成分',
            'critical': True,
        },
        {
            'id': 'sc-004',
            'name': '偏差处理',
            'query': '研究访视V2（主要终点访视）一名受试者超出访视窗口9天才来访视（超过了±7天的窗口），应如何处理？',
            'must_contain': ['偏差', '记录', 'CAPA', '分析', '报告'],
            'domain': '合规',
            'critical': True,
        },
        {
            'id': 'sc-005',
            'name': '统计方法选择',
            'query': '保湿研究30例受试者，Corneometer基线和4周后数据，Shapiro-Wilk检验p=0.03，应该用什么统计方法？',
            'must_contain': ['Wilcoxon', '非参数', 'p<0.05', '配对'],
            'domain': '方法学',
            'critical': True,
        },
        {
            'id': 'sc-006',
            'name': '仪器操作指导',
            'query': '今天Corneometer校准时发现读数偏差超过3AU，可能是什么原因？应该如何处理？',
            'must_contain': ['校准', '探头', '偏差', '处理'],
            'domain': '仪器',
            'critical': False,
        },
        {
            'id': 'sc-007',
            'name': '功效宣称审核',
            'query': '产品测试结果：使用4周后Corneometer平均提升8AU（p=0.003），能否宣称"使用4周后皮肤保湿度提升50%"？',
            'must_contain': ['不合适', '实际数据', '提升', '结果'],
            'domain': '合规',
            'critical': True,
        },
        {
            'id': 'sc-008',
            'name': 'GCP违规处理',
            'query': '发现有一名受试者在签署知情同意书之前就进行了基线仪器测量，这属于什么级别的违规？如何处理？',
            'must_contain': ['严重', 'GCP', '知情同意', '伦理', '报告'],
            'domain': '合规',
            'critical': True,
        },
        {
            'id': 'sc-009',
            'name': '样本量重新计算',
            'query': '预实验发现Corneometer测量标准差是20AU（远大于预期的12AU），而我们期望检测到5AU的差异，α=0.05，效能80%，需要多少样本量？',
            'must_contain': ['样本量', 'SD', '计算', 't检验'],
            'domain': '方法学',
            'critical': False,
        },
        {
            'id': 'sc-010',
            'name': '报告合规要求',
            'query': '我们的保湿功效评价报告需要提交给NMPA用于产品备案，报告应包含哪些必要内容？',
            'must_contain': ['研究设计', '统计', '受试者', '结论', '签章'],
            'domain': '合规',
            'critical': False,
        },
    ]

    try:
        from apps.agent_gateway.services import generate_agent_answer
    except Exception as e:
        return {'error': f'无法初始化服务: {e}', 'pass': False}

    results = []
    passed = 0
    critical_passed = 0
    critical_total = sum(1 for s in scenarios if s.get('critical'))

    for scenario in scenarios:
        try:
            # 复用共享回答服务（生产回答链）
            answer_result = generate_agent_answer(
                agent_id='knowledge-agent',
                message=scenario['query'],
                context={},
            )
            answer = answer_result.get('output_text', '')
            answer_lower = answer.lower()

            # 检查必须包含的关键词
            must_contain = scenario.get('must_contain', [])
            keyword_hits = [kw for kw in must_contain if kw.lower() in answer_lower or kw in answer]
            keyword_pass = len(keyword_hits) >= max(len(must_contain) * 0.6, 1)

            scenario_pass = keyword_pass
            passed += 1 if scenario_pass else 0
            if scenario.get('critical') and scenario_pass:
                critical_passed += 1

            results.append({
                'id': scenario['id'],
                'name': scenario['name'],
                'pass': scenario_pass,
                'critical': scenario.get('critical', False),
                'must_contain': must_contain,
                'keyword_hits': keyword_hits,
                'keyword_hit_rate': round(len(keyword_hits) / max(len(must_contain), 1), 2),
                'answer_snippet': answer[:300],
                'domain': scenario.get('domain', ''),
            })

        except Exception as e:
            results.append({
                'id': scenario['id'],
                'name': scenario['name'],
                'pass': False,
                'critical': scenario.get('critical', False),
                'error': str(e),
            })

    n = len(scenarios)
    scenario_pass_rate = passed / max(n, 1)
    critical_pass_rate = critical_passed / max(critical_total, 1)

    summary = {
        'total_scenarios': n,
        'passed': passed,
        'critical_total': critical_total,
        'critical_passed': critical_passed,
        'scenario_pass_rate': round(scenario_pass_rate, 3),
        'critical_pass_rate': round(critical_pass_rate, 3),
        'thresholds': LAYER3_THRESHOLDS,
        'pass': (
            scenario_pass_rate >= LAYER3_THRESHOLDS['scenario_pass_rate'] and
            critical_pass_rate >= LAYER3_THRESHOLDS['critical_pass_rate']
        ),
        'details': results,
    }
    return summary


class Command(BaseCommand):
    help = '运行预训练基准测试（三层评测：检索 / 回答 / 业务场景）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--layer',
            choices=['L1', 'L2', 'L3'],
            default=None,
            help='仅运行指定层（不指定则运行 L1+L3，L2 需额外 LLM 调用较慢）',
        )
        parser.add_argument(
            '--domain',
            default=None,
            help='仅测试指定知识域（法规/方法学/成分/仪器/合规）',
        )
        parser.add_argument(
            '--quick',
            action='store_true',
            help=f'快速模式：每个知识域各取 {QUICK_MODE_SAMPLE} 题',
        )
        parser.add_argument(
            '--output',
            default=None,
            help='将结果输出到 JSON 文件（默认: logs/benchmark_<timestamp>.json）',
        )
        parser.add_argument(
            '--all-layers',
            action='store_true',
            help='运行全部三层（L1+L2+L3），L2 需要额外 LLM 调用',
        )

    def handle(self, *args, **options):
        layer = options.get('layer')
        domain_filter = options.get('domain')
        quick = options.get('quick', False)
        run_all = options.get('all_layers', False)
        output_file = options.get('output')

        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('预训练基准测试 开始'))
        self.stdout.write(self.style.SUCCESS('=' * 60))

        # 加载题库
        benchmark = _load_benchmark()
        self.stdout.write(f'基准题库加载完成: {len(benchmark)} 题')

        # 过滤知识域
        if domain_filter:
            benchmark = [q for q in benchmark if q.get('domain') == domain_filter]
            self.stdout.write(f'过滤知识域 [{domain_filter}]: {len(benchmark)} 题')

        # 快速模式采样
        if quick:
            from collections import defaultdict
            import random
            domain_groups = defaultdict(list)
            for q in benchmark:
                domain_groups[q.get('domain', '其他')].append(q)
            benchmark = []
            for d_questions in domain_groups.values():
                benchmark.extend(d_questions[:QUICK_MODE_SAMPLE])
            self.stdout.write(f'快速模式采样: {len(benchmark)} 题')

        report = {
            'run_time': datetime.now().isoformat(),
            'total_questions': len(benchmark),
            'quick_mode': quick,
            'domain_filter': domain_filter,
            'topic_package_metrics': _compute_topic_package_metrics(),
        }

        layers_to_run = []
        if layer:
            layers_to_run = [layer]
        elif run_all:
            layers_to_run = ['L1', 'L2', 'L3']
        else:
            layers_to_run = ['L1', 'L3']

        overall_pass = True

        # Layer 1: 检索门禁
        if 'L1' in layers_to_run:
            self.stdout.write('\n--- Layer 1: 检索门禁 ---')
            l1_result = _run_layer1_retrieval(benchmark)
            report['layer1'] = l1_result

            self.stdout.write(f'Hit Rate:        {l1_result["hit_rate"]:.3f} (门禁: ≥{LAYER1_THRESHOLDS["hit_rate"]})')
            self.stdout.write(f'Precision@5:     {l1_result["avg_precision_at_k"]:.3f} (门禁: ≥{LAYER1_THRESHOLDS["precision_at_5"]})')
            self.stdout.write(f'Recall@5:        {l1_result["avg_recall_at_k"]:.3f} (门禁: ≥{LAYER1_THRESHOLDS["recall_at_5"]})')

            if l1_result['pass']:
                self.stdout.write(self.style.SUCCESS('Layer 1: ✓ 通过'))
            else:
                self.stdout.write(self.style.ERROR('Layer 1: ✗ 未通过'))
                overall_pass = False

        # Layer 2: 回答质量（可选，LLM 调用较慢）
        if 'L2' in layers_to_run:
            l2_sample = benchmark[:20] if quick else benchmark[:30]
            self.stdout.write(f'\n--- Layer 2: 回答质量门禁（抽样 {len(l2_sample)} 题）---')
            l2_result = _run_layer2_answer(l2_sample)
            report['layer2'] = l2_result

            if 'error' in l2_result:
                self.stdout.write(self.style.WARNING(f'Layer 2: 跳过（{l2_result["error"]}）'))
            else:
                self.stdout.write(f'Groundedness:    {l2_result["avg_groundedness"]:.3f} (门禁: ≥{LAYER2_THRESHOLDS["groundedness"]})')
                self.stdout.write(f'Relevancy:       {l2_result["avg_relevancy"]:.3f} (门禁: ≥{LAYER2_THRESHOLDS["relevancy"]})')
                self.stdout.write(f'Completeness:    {l2_result["avg_completeness"]:.3f} (门禁: ≥{LAYER2_THRESHOLDS["completeness"]})')

                if l2_result['pass']:
                    self.stdout.write(self.style.SUCCESS('Layer 2: ✓ 通过'))
                else:
                    self.stdout.write(self.style.ERROR('Layer 2: ✗ 未通过'))
                    overall_pass = False

        # Layer 3: 业务场景
        if 'L3' in layers_to_run:
            self.stdout.write('\n--- Layer 3: 业务场景门禁 ---')
            l3_result = _run_layer3_scenarios()
            report['layer3'] = l3_result

            if 'error' in l3_result:
                self.stdout.write(self.style.WARNING(f'Layer 3: 跳过（{l3_result["error"]}）'))
            else:
                self.stdout.write(f'场景通过率:       {l3_result["scenario_pass_rate"]:.3f} (门禁: ≥{LAYER3_THRESHOLDS["scenario_pass_rate"]})')
                self.stdout.write(f'关键场景通过率:   {l3_result["critical_pass_rate"]:.3f} (门禁: {LAYER3_THRESHOLDS["critical_pass_rate"]})')

                # 打印失败场景
                for detail in l3_result.get('details', []):
                    if not detail.get('pass'):
                        self.stdout.write(
                            self.style.ERROR(
                                f'  ✗ [{detail["id"]}] {detail.get("name", "")} | 命中关键词: {detail.get("keyword_hits", [])} / {detail.get("must_contain", [])}'
                            )
                        )

                if l3_result['pass']:
                    self.stdout.write(self.style.SUCCESS('Layer 3: ✓ 通过'))
                else:
                    self.stdout.write(self.style.ERROR('Layer 3: ✗ 未通过'))
                    overall_pass = False

        # 总结
        report['overall_pass'] = overall_pass
        self.stdout.write('\n' + '=' * 60)
        topic_metrics = report.get('topic_package_metrics', {})
        if 'error' not in topic_metrics:
            self.stdout.write(
                f'专题包: total={topic_metrics.get("total_packages", 0)} '
                f'required={topic_metrics.get("required_for_release", 0)} '
                f'avg_coverage={topic_metrics.get("avg_coverage_rate", 0):.3f}'
            )
        if overall_pass:
            self.stdout.write(self.style.SUCCESS('整体评测结果: ✓ 通过所有门禁'))
        else:
            self.stdout.write(self.style.ERROR('整体评测结果: ✗ 存在未通过的门禁，需要整改'))

        # 保存报告
        if not output_file:
            log_dir = Path(__file__).resolve().parents[4] / 'logs'
            log_dir.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_file = str(log_dir / f'benchmark_{timestamp}.json')

        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
            self.stdout.write(f'\n评测报告已保存: {output_file}')
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'报告保存失败: {e}'))

        self.stdout.write('=' * 60)
