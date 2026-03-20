"""
数字员工试点发布门禁服务

读取最近一轮真实能力验收报告（digital_worker_real_eval）的 summary.json，
返回发布结论（可试点 / 需整改 / 禁止上线）及运营指标，供试点发布流程与质量门禁使用。
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from django.conf import settings

logger = logging.getLogger(__name__)

REQUIRED_BATCH_MIN_COUNTS = {
    'core': 8,
    'workflow': 6,
    'safety': 6,
}


def get_report_root() -> Path:
    """验收报告根目录：backend/logs/digital_worker_real_eval"""
    override = getattr(settings, 'DIGITAL_WORKER_REAL_EVAL_REPORT_DIR', None)
    if override:
        return Path(override)
    base = getattr(settings, 'BASE_DIR', None)
    if base:
        return Path(base) / 'logs' / 'digital_worker_real_eval'
    return Path(__file__).resolve().parents[2] / 'logs' / 'digital_worker_real_eval'


def get_latest_run_id() -> Optional[str]:
    """返回最近一次验收的 run_id（按 summary 生成时间/文件时间取最新）。"""
    root = get_report_root()
    if not root.exists():
        return None

    candidates = []
    for run_dir in root.iterdir():
        if not run_dir.is_dir():
            continue
        summary_path = run_dir / 'summary.json'
        if not summary_path.exists():
            continue

        sort_key = summary_path.stat().st_mtime
        try:
            summary = json.loads(summary_path.read_text(encoding='utf-8'))
            generated_at = summary.get('generated_at')
            if generated_at:
                sort_key = datetime.fromisoformat(generated_at.replace('Z', '+00:00')).timestamp()
        except Exception:
            logger.warning('digital_worker_release_gate: failed to inspect summary metadata: %s', summary_path)
        candidates.append((sort_key, run_dir.name))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def _validate_summary_coverage(summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    校验发布门禁所依赖的真实能力验收是否覆盖完整三批场景。

    规则：
    - 必须包含 core / workflow / safety 三批
    - 每批 total 至少达到预期场景数
    """
    by_batch = summary.get('by_batch') or {}
    missing_batches = []
    insufficient_batches = []

    for batch_name, expected_total in REQUIRED_BATCH_MIN_COUNTS.items():
        batch_summary = by_batch.get(batch_name)
        if not batch_summary:
            missing_batches.append(batch_name)
            continue
        actual_total = int(batch_summary.get('total', 0))
        if actual_total < expected_total:
            insufficient_batches.append({
                'batch': batch_name,
                'expected_total': expected_total,
                'actual_total': actual_total,
            })

    passed = not missing_batches and not insufficient_batches
    reasons = []
    if missing_batches:
        reasons.append(f"缺少批次: {', '.join(missing_batches)}")
    if insufficient_batches:
        reasons.append(
            '批次覆盖不足: ' + '; '.join(
                f"{item['batch']} {item['actual_total']}/{item['expected_total']}"
                for item in insufficient_batches
            )
        )

    return {
        'passed': passed,
        'missing_batches': missing_batches,
        'insufficient_batches': insufficient_batches,
        'reason': '；'.join(reasons),
    }


def get_latest_release_verdict() -> Dict[str, Any]:
    """
    读取最近一轮真实能力验收的 summary.json，返回发布门禁结论与运营指标。

    Returns:
        {
            'verdict': '可试点' | '需整改' | '禁止上线',
            'run_id': str | None,
            'passed': bool,
            'pass_rate': float,
            'total': int,
            'passed_count': int,
            'failed_count': int,
            'by_batch': {...},
            'decision_reason': str,
            'critical_issue_records': int,
            'generated_at': str | None,
            'available': bool,  # 是否有有效报告
        }
    """
    run_id = get_latest_run_id()
    if not run_id:
        return {
            'verdict': '需整改',
            'run_id': None,
            'passed': False,
            'pass_rate': 0.0,
            'total': 0,
            'passed_count': 0,
            'failed_count': 0,
            'by_batch': {},
            'decision_reason': '尚未执行数字员工真实能力验收，请先运行 run_digital_worker_real_eval 或 CI 门禁。',
            'critical_issue_records': 0,
            'generated_at': None,
            'available': False,
        }

    path = get_report_root() / run_id / 'summary.json'
    if not path.exists():
        return {
            'verdict': '需整改',
            'run_id': run_id,
            'passed': False,
            'pass_rate': 0.0,
            'total': 0,
            'passed_count': 0,
            'failed_count': 0,
            'by_batch': {},
            'decision_reason': f'报告目录存在但 summary.json 缺失: {run_id}',
            'critical_issue_records': 0,
            'generated_at': None,
            'available': False,
        }

    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception as e:
        logger.warning('digital_worker_release_gate: failed to read summary.json: %s', e)
        return {
            'verdict': '需整改',
            'run_id': run_id,
            'passed': False,
            'pass_rate': 0.0,
            'total': 0,
            'passed_count': 0,
            'failed_count': 0,
            'by_batch': {},
            'decision_reason': f'报告解析失败: {e}',
            'critical_issue_records': 0,
            'generated_at': None,
            'available': False,
        }

    coverage = _validate_summary_coverage(data)
    if not coverage['passed']:
        return {
            'verdict': '需整改',
            'run_id': data.get('run_id') or run_id,
            'passed': False,
            'pass_rate': float(data.get('pass_rate', 0.0)),
            'total': int(data.get('total', 0)),
            'passed_count': int(data.get('passed', 0)),
            'failed_count': int(data.get('failed', 0)),
            'by_batch': data.get('by_batch') or {},
            'decision_reason': (
                '最近一轮真实能力验收覆盖不完整，不能作为试点发布依据。'
                + (f" {coverage['reason']}" if coverage['reason'] else '')
            ),
            'critical_issue_records': int(data.get('critical_issue_records', 0)),
            'generated_at': data.get('generated_at'),
            'available': True,
        }

    decision = data.get('release_decision') or '需整改'
    passed = decision == '可试点'
    return {
        'verdict': decision,
        'run_id': data.get('run_id') or run_id,
        'passed': passed,
        'pass_rate': float(data.get('pass_rate', 0.0)),
        'total': int(data.get('total', 0)),
        'passed_count': int(data.get('passed', 0)),
        'failed_count': int(data.get('failed', 0)),
        'by_batch': data.get('by_batch') or {},
        'decision_reason': data.get('decision_reason') or '',
        'critical_issue_records': int(data.get('critical_issue_records', 0)),
        'generated_at': data.get('generated_at'),
        'available': True,
    }


def is_pilot_release_allowed() -> bool:
    """当前是否允许试点发布（最近一轮结论为「可试点」）。"""
    return get_latest_release_verdict().get('passed', False)
