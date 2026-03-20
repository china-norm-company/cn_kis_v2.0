import json
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.knowledge.tasks import KNOWLEDGE_STABILITY_LOG_FILE


INGESTION_TASK_NAMES = {
    'harvest_feishu_document_knowledge',
    'harvest_meeting_knowledge',
    'harvest_approval_knowledge',
    'daily_chat_knowledge_harvest',
    'run_external_fetchers',
    'paper_scout_run',
    'vectorize_knowledge_entry',
}
DEFAULT_PROBE_QUERIES = [
    'SOP 样品管理',
    '化妆品功效宣称评价规范',
    'Corneometer 保湿评价',
]


def _parse_iso(value: str):
    if not value:
        return None
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def _load_events(window_start: datetime):
    if not KNOWLEDGE_STABILITY_LOG_FILE.exists():
        return []

    events = []
    for line in KNOWLEDGE_STABILITY_LOG_FILE.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        started_at = _parse_iso(payload.get('started_at', ''))
        if started_at and started_at >= window_start:
            events.append(payload)
    return events


def _build_task_summary(events):
    grouped = defaultdict(list)
    for event in events:
        grouped[event.get('task_name') or 'unknown'].append(event)

    items = []
    for task_name, rows in sorted(grouped.items()):
        status_counter = Counter(row.get('status') for row in rows)
        elapsed_values = [row.get('elapsed_ms', 0) for row in rows if row.get('elapsed_ms') is not None]
        items.append({
            'task_name': task_name,
            'total_runs': len(rows),
            'success_runs': status_counter.get('success', 0),
            'failed_runs': status_counter.get('failed', 0),
            'retrying_runs': status_counter.get('retrying', 0),
            'skipped_runs': status_counter.get('skipped', 0),
            'total_retries': sum(int(row.get('retry_count') or 0) for row in rows),
            'avg_elapsed_ms': round(mean(elapsed_values), 2) if elapsed_values else 0.0,
            'created_count': sum(int(row.get('created_count') or 0) for row in rows),
            'skipped_count': sum(int(row.get('skipped_count') or 0) for row in rows),
            'error_count': sum(int(row.get('error_count') or 0) for row in rows),
        })
    return items


def _build_error_summary(events):
    counter = Counter()
    for event in events:
        error = (event.get('error') or '').strip()
        if error:
            counter[error[:200]] += 1
    return [{'error': error, 'count': count} for error, count in counter.most_common(10)]


def _compute_ingestion_success_rate(events):
    rows = [event for event in events if event.get('task_name') in INGESTION_TASK_NAMES]
    if not rows:
        return None
    success_runs = sum(1 for event in rows if event.get('status') in {'success', 'skipped'})
    return round(success_runs / max(len(rows), 1), 4)


def _run_retrieval_probe():
    from apps.knowledge.retrieval_gateway import multi_channel_search
    from apps.knowledge.models import KnowledgeEntry

    probe_rows = []
    for query in DEFAULT_PROBE_QUERIES:
        started = time.monotonic()
        mode = 'hybrid'
        try:
            result = multi_channel_search(query=query, top_k=5, channels=['keyword', 'vector', 'graph'])
        except Exception:
            mode = 'orm-fallback'
            matched = list(
                KnowledgeEntry.objects.filter(is_deleted=False, is_published=True)
                .filter(
                    Q(title__icontains=query) |
                    Q(summary__icontains=query) |
                    Q(content__icontains=query)
                )
                .values('id')[:5]
            )
            result = {'items': matched}
        elapsed_ms = int((time.monotonic() - started) * 1000)
        probe_rows.append({
            'query': query,
            'elapsed_ms': elapsed_ms,
            'result_count': len(result.get('items', [])),
            'mode': mode,
        })

    latencies = [row['elapsed_ms'] for row in probe_rows]
    return {
        'samples': probe_rows,
        'avg_latency_ms': round(mean(latencies), 2) if latencies else 0.0,
        'max_latency_ms': max(latencies) if latencies else 0,
        'min_latency_ms': min(latencies) if latencies else 0,
    }


def _render_markdown(report: dict) -> str:
    lines = [
        f"# Knowledge Stability Report ({report['window']['days']}d)",
        '',
        f"- Window: {report['window']['start']} -> {report['window']['end']}",
        f"- Total task events: {report['totals']['events']}",
        f"- Ingestion success rate: {report['totals']['ingestion_success_rate']}",
        '',
        '## Task Summary',
        '',
        '| Task | Runs | Success | Failed | Retrying | Skipped | Retries | Avg elapsed (ms) | Created | Skipped count | Error count |',
        '|------|------|---------|--------|----------|---------|---------|------------------|---------|---------------|-------------|',
    ]
    for item in report['task_summary']:
        lines.append(
            f"| {item['task_name']} | {item['total_runs']} | {item['success_runs']} | "
            f"{item['failed_runs']} | {item['retrying_runs']} | {item['skipped_runs']} | "
            f"{item['total_retries']} | {item['avg_elapsed_ms']} | {item['created_count']} | "
            f"{item['skipped_count']} | {item['error_count']} |"
        )

    lines.extend(['', '## Retrieval Latency', ''])
    retrieval = report.get('retrieval_latency') or {}
    if retrieval.get('samples'):
        lines.append(
            f"- Avg/Min/Max latency: {retrieval['avg_latency_ms']} / "
            f"{retrieval['min_latency_ms']} / {retrieval['max_latency_ms']} ms"
        )
        for sample in retrieval['samples']:
            lines.append(
                f"- `{sample['query']}`: {sample['elapsed_ms']} ms, "
                f"results={sample['result_count']}, mode={sample.get('mode', 'hybrid')}"
            )
    else:
        lines.append('- Retrieval probe unavailable in this run.')

    lines.extend(['', '## Error Summary', ''])
    if report['error_summary']:
        for item in report['error_summary']:
            lines.append(f"- {item['count']}x: {item['error']}")
    else:
        lines.append('- No errors recorded in the selected window.')

    return '\n'.join(lines) + '\n'


class Command(BaseCommand):
    help = '生成知识任务稳定性报告（KR-6-2）'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=14, help='统计窗口天数，默认 14')
        parser.add_argument('--json', action='store_true', help='输出 JSON 到 stdout')
        parser.add_argument('--skip-retrieval-probe', action='store_true', help='跳过实时检索延迟探测')
        parser.add_argument('--output', type=str, default='', help='Markdown 输出路径')

    def handle(self, *args, **options):
        days = max(int(options['days']), 1)
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=days)
        events = _load_events(window_start)
        task_summary = _build_task_summary(events)

        retrieval_latency = None
        if not options['skip_retrieval_probe']:
            try:
                retrieval_latency = _run_retrieval_probe()
            except Exception as exc:
                retrieval_latency = {'samples': [], 'error': str(exc)}

        report = {
            'generated_at': now.isoformat(),
            'window': {
                'days': days,
                'start': window_start.isoformat(),
                'end': now.isoformat(),
            },
            'totals': {
                'events': len(events),
                'ingestion_success_rate': _compute_ingestion_success_rate(events),
            },
            'task_summary': task_summary,
            'error_summary': _build_error_summary(events),
            'retrieval_latency': retrieval_latency,
        }

        output_path = options['output']
        if not output_path:
            output_dir = KNOWLEDGE_STABILITY_LOG_FILE.parent
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = str(output_dir / f'knowledge_stability_report_{now.strftime("%Y%m%d_%H%M%S")}.md')

        markdown = _render_markdown(report)
        Path(output_path).write_text(markdown, encoding='utf-8')
        report['output_path'] = output_path

        if options['json']:
            self.stdout.write(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            self.stdout.write(self.style.SUCCESS(f'Knowledge stability report written to {output_path}'))
