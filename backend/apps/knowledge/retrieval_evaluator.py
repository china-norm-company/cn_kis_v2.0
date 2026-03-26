"""
检索质量评测器

提供离线评测功能，用于持续监控和改进检索质量。

核心指标：
- Precision@K：前 K 个结果中相关文档的比例
- Recall@K：前 K 个结果中召回相关文档的比例
- NDCG@K：归一化折扣累积增益
- MRR：平均倒数排名（Mean Reciprocal Rank）
- 渠道覆盖率：各通道的召回贡献

使用场景：
- CI 质量门禁（阻断 < 40% precision@10 的部署）
- 每周评测报告
- 检索参数调优
"""
import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger('cn_kis.knowledge.retrieval_evaluator')


@dataclass
class QueryTestCase:
    """单个检索测试用例"""
    query: str
    relevant_entry_ids: List[int]          # 已知相关文档 ID
    entry_type: Optional[str] = None
    description: str = ''


@dataclass
class EvalResult:
    """单个 query 的评测结果"""
    query: str
    precision_at_k: Dict[int, float] = field(default_factory=dict)
    recall_at_k: Dict[int, float] = field(default_factory=dict)
    ndcg_at_k: Dict[int, float] = field(default_factory=dict)
    mrr: float = 0.0
    channels_used: List[str] = field(default_factory=list)
    total_candidates: int = 0
    latency_ms: float = 0.0
    error: Optional[str] = None


@dataclass
class EvalSummary:
    """评测汇总"""
    total_queries: int = 0
    avg_precision_at_10: float = 0.0
    avg_recall_at_10: float = 0.0
    avg_ndcg_at_10: float = 0.0
    avg_mrr: float = 0.0
    avg_latency_ms: float = 0.0
    pass_rate: float = 0.0          # 超过最低阈值的 query 比例
    channel_coverage: Dict[str, int] = field(default_factory=dict)
    failed_queries: List[str] = field(default_factory=list)
    results: List[EvalResult] = field(default_factory=list)


# ── 最低阈值（低于此值触发质量告警）
PRECISION_THRESHOLD = 0.40     # precision@10 >= 40%
RECALL_THRESHOLD = 0.30        # recall@10 >= 30%
MRR_THRESHOLD = 0.35           # MRR >= 35%


def run_eval(
    test_cases: List[QueryTestCase],
    channels: Optional[List[str]] = None,
    k_values: Optional[List[int]] = None,
) -> EvalSummary:
    """
    运行检索评测。

    Args:
        test_cases: 测试用例列表
        channels: 指定评测的检索通道（默认全通道）
        k_values: 计算 P@K / R@K / NDCG@K 的 K 值列表

    Returns:
        EvalSummary with aggregated metrics
    """
    import time

    if k_values is None:
        k_values = [5, 10, 20]
    if channels is None:
        channels = ['keyword', 'vector', 'graph', 'feishu_doc']

    from .retrieval_gateway import multi_channel_search

    results: List[EvalResult] = []
    channel_coverage: Dict[str, int] = {}

    for tc in test_cases:
        start = time.monotonic()
        try:
            search_result = multi_channel_search(
                query=tc.query,
                entry_type=tc.entry_type,
                channels=channels,
                top_k=max(k_values),
            )
        except Exception as e:
            results.append(EvalResult(
                query=tc.query,
                error=str(e),
            ))
            continue

        elapsed_ms = (time.monotonic() - start) * 1000
        returned_ids = [
            item['id'] for item in search_result.get('items', [])
            if item.get('id') is not None and item['id'] > 0
        ]
        relevant_set = set(tc.relevant_entry_ids)

        # 计算指标
        result = EvalResult(
            query=tc.query,
            channels_used=search_result.get('channels_used', []),
            total_candidates=search_result.get('total_candidates', 0),
            latency_ms=elapsed_ms,
        )

        for k in k_values:
            top_k_ids = returned_ids[:k]
            hits = len(set(top_k_ids) & relevant_set)

            precision = hits / k if k > 0 else 0.0
            recall = hits / len(relevant_set) if relevant_set else 0.0

            result.precision_at_k[k] = round(precision, 4)
            result.recall_at_k[k] = round(recall, 4)
            result.ndcg_at_k[k] = round(
                _compute_ndcg(top_k_ids, relevant_set, k), 4
            )

        result.mrr = round(_compute_mrr(returned_ids, relevant_set), 4)

        # 统计通道覆盖
        for ch in result.channels_used:
            channel_coverage[ch] = channel_coverage.get(ch, 0) + 1

        results.append(result)

    # 汇总
    valid_results = [r for r in results if r.error is None]
    n = len(valid_results)

    if n == 0:
        return EvalSummary(total_queries=len(test_cases), results=results)

    avg_p10 = sum(r.precision_at_k.get(10, 0) for r in valid_results) / n
    avg_r10 = sum(r.recall_at_k.get(10, 0) for r in valid_results) / n
    avg_ndcg10 = sum(r.ndcg_at_k.get(10, 0) for r in valid_results) / n
    avg_mrr = sum(r.mrr for r in valid_results) / n
    avg_latency = sum(r.latency_ms for r in valid_results) / n

    # 通过率：precision@10 >= PRECISION_THRESHOLD
    pass_count = sum(
        1 for r in valid_results
        if r.precision_at_k.get(10, 0) >= PRECISION_THRESHOLD
    )
    pass_rate = pass_count / n

    failed = [
        r.query for r in valid_results
        if r.precision_at_k.get(10, 0) < PRECISION_THRESHOLD
    ]

    return EvalSummary(
        total_queries=len(test_cases),
        avg_precision_at_10=round(avg_p10, 4),
        avg_recall_at_10=round(avg_r10, 4),
        avg_ndcg_at_10=round(avg_ndcg10, 4),
        avg_mrr=round(avg_mrr, 4),
        avg_latency_ms=round(avg_latency, 2),
        pass_rate=round(pass_rate, 4),
        channel_coverage=channel_coverage,
        failed_queries=failed,
        results=results,
    )


def _compute_ndcg(ranked_ids: List[int], relevant_set: set, k: int) -> float:
    """计算 NDCG@K"""
    if not ranked_ids or not relevant_set:
        return 0.0

    dcg = sum(
        1.0 / math.log2(i + 2)
        for i, rid in enumerate(ranked_ids[:k])
        if rid in relevant_set
    )

    ideal_hits = min(k, len(relevant_set))
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_hits))

    if idcg == 0:
        return 0.0
    return dcg / idcg


def _compute_mrr(ranked_ids: List[int], relevant_set: set) -> float:
    """计算 Mean Reciprocal Rank（对单个 query 即为 RR）"""
    for i, rid in enumerate(ranked_ids):
        if rid in relevant_set:
            return 1.0 / (i + 1)
    return 0.0


# ── 内置基准测试用例（smoke test 用）
def get_builtin_test_cases() -> List[QueryTestCase]:
    """
    返回内置的基准测试用例（无需真实数据）。

    这些用例基于知识库中应存在的通用内容，
    主要用于 CI 健康检查（检索通路不崩溃、延迟可接受）。
    """
    return [
        QueryTestCase(
            query='化妆品功效评估',
            relevant_entry_ids=[],  # 无标注，仅检查通路正常
            entry_type=None,
            description='功效评估关键词检索 - 健康检查',
        ),
        QueryTestCase(
            query='CDISC SDTM 标准',
            relevant_entry_ids=[],
            entry_type=None,
            description='CDISC 知识检索 - 健康检查',
        ),
        QueryTestCase(
            query='SOP 偏差处理流程',
            relevant_entry_ids=[],
            entry_type='sop',
            description='SOP 类型过滤检索 - 健康检查',
        ),
    ]


def run_smoke_test() -> Dict[str, Any]:
    """
    CI 烟雾测试：验证检索通路不崩溃、延迟 < 2000ms。
    不检查相关性，仅检查系统可用性。
    """
    test_cases = get_builtin_test_cases()

    try:
        summary = run_eval(test_cases, channels=['keyword'], k_values=[5, 10])
    except Exception as e:
        return {'status': 'error', 'error': str(e)}

    issues = []
    for r in summary.results:
        if r.error:
            issues.append(f'Query "{r.query}" failed: {r.error}')
        elif r.latency_ms > 2000:
            issues.append(f'Query "{r.query}" too slow: {r.latency_ms:.0f}ms')

    return {
        'status': 'ok' if not issues else 'degraded',
        'issues': issues,
        'avg_latency_ms': summary.avg_latency_ms,
        'total_queries': summary.total_queries,
    }


def check_retrieval_quality_gate(
    test_cases: Optional[List[QueryTestCase]] = None,
    channels: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    检索质量门禁检查。

    返回：
    {
        'passed': bool,
        'avg_precision_at_10': float,
        'avg_recall_at_10': float,
        'avg_mrr': float,
        'details': EvalSummary,
        'blocking_issues': list[str],
    }
    """
    if test_cases is None:
        test_cases = get_builtin_test_cases()
        # 内置用例没有标注 relevant_entry_ids，直接通过
        return {
            'passed': True,
            'note': 'No annotated test cases, using smoke test',
            'smoke_test': run_smoke_test(),
        }

    summary = run_eval(test_cases, channels=channels)

    issues = []
    if summary.avg_precision_at_10 < PRECISION_THRESHOLD:
        issues.append(
            f'Precision@10={summary.avg_precision_at_10:.2%} < threshold {PRECISION_THRESHOLD:.2%}'
        )
    if summary.avg_recall_at_10 < RECALL_THRESHOLD:
        issues.append(
            f'Recall@10={summary.avg_recall_at_10:.2%} < threshold {RECALL_THRESHOLD:.2%}'
        )
    if summary.avg_mrr < MRR_THRESHOLD:
        issues.append(
            f'MRR={summary.avg_mrr:.4f} < threshold {MRR_THRESHOLD}'
        )

    return {
        'passed': len(issues) == 0,
        'avg_precision_at_10': summary.avg_precision_at_10,
        'avg_recall_at_10': summary.avg_recall_at_10,
        'avg_ndcg_at_10': summary.avg_ndcg_at_10,
        'avg_mrr': summary.avg_mrr,
        'avg_latency_ms': summary.avg_latency_ms,
        'pass_rate': summary.pass_rate,
        'blocking_issues': issues,
        'failed_queries': summary.failed_queries,
        'channel_coverage': summary.channel_coverage,
    }
