#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import dotenv_values


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / 'backend'
DEPLOY_ENV_FILE = ROOT / 'deploy' / '.env.volcengine.plan-a'
BACKEND_ENV_FILE = BACKEND_DIR / '.env'
SECRETARY_LIVE_ENV_FILE = ROOT / 'apps' / 'secretary' / '.env.live'
DEFAULT_REPORT_ROOT = ROOT / 'backend' / 'logs' / 'digital_worker_real_eval'

PYTEST_FILES = {
    'core': 'tests/ai_eval/test_digital_worker_real_acceptance_core.py',
    'workflow': 'tests/ai_eval/test_digital_worker_real_acceptance_workflows.py',
    'safety': 'tests/ai_eval/test_digital_worker_real_acceptance_safety.py',
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='运行数字员工真实能力验收（复用仓库内已有环境变量文件）'
    )
    parser.add_argument(
        '--batch',
        choices=['all', 'core', 'workflow', 'safety'],
        default='all',
        help='选择执行批次，默认 all',
    )
    parser.add_argument(
        '-k',
        dest='keyword',
        default='',
        help='传给 pytest -k 的过滤条件，例如 DW-KNO-001',
    )
    parser.add_argument(
        '--collect-only',
        action='store_true',
        help='仅收集测试，不实际执行',
    )
    parser.add_argument(
        '--run-id',
        default='',
        help='覆盖 DIGITAL_WORKER_REAL_EVAL_RUN_ID',
    )
    parser.add_argument(
        '--compare-to',
        default='',
        help='指定趋势对比的上一轮 run_id；不传则自动选择最近一轮',
    )
    parser.add_argument(
        '--require-decision',
        choices=['可试点', '需整改', '禁止上线'],
        default='',
        help='要求本轮 summary.json 的发布结论至少达到指定值，可用于发布门禁',
    )
    return parser.parse_args()


def load_env_file(path: Path) -> bool:
    if not path.exists():
        return False
    values = dotenv_values(path)
    for key, value in values.items():
        if key and value is not None and key not in os.environ:
            os.environ[key] = value
    return True


def configure_environment(run_id: str, compare_to: str) -> None:
    loaded = {
        str(DEPLOY_ENV_FILE): load_env_file(DEPLOY_ENV_FILE),
        str(BACKEND_ENV_FILE): load_env_file(BACKEND_ENV_FILE),
        str(SECRETARY_LIVE_ENV_FILE): load_env_file(SECRETARY_LIVE_ENV_FILE),
    }

    os.environ.setdefault('DIGITAL_WORKER_REAL_EVAL_ENABLED', '1')
    effective_run_id = run_id or os.environ.get('DIGITAL_WORKER_REAL_EVAL_RUN_ID', '').strip()
    if not effective_run_id:
        effective_run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    os.environ['DIGITAL_WORKER_REAL_EVAL_RUN_ID'] = effective_run_id
    if compare_to:
        os.environ['DIGITAL_WORKER_REAL_EVAL_COMPARE_TO'] = compare_to

    if 'AI_JUDGE_PROVIDER' not in os.environ:
        if os.environ.get('KIMI_API_KEY'):
            os.environ['AI_JUDGE_PROVIDER'] = 'kimi'
        elif os.environ.get('ARK_API_KEY'):
            os.environ['AI_JUDGE_PROVIDER'] = 'ark'

    if 'AI_JUDGE_MODEL' not in os.environ:
        provider = os.environ.get('AI_JUDGE_PROVIDER', '').lower()
        if provider == 'ark' and os.environ.get('ARK_DEFAULT_MODEL'):
            os.environ['AI_JUDGE_MODEL'] = os.environ['ARK_DEFAULT_MODEL']
        elif provider == 'kimi' and os.environ.get('KIMI_DEFAULT_MODEL'):
            os.environ['AI_JUDGE_MODEL'] = os.environ['KIMI_DEFAULT_MODEL']

    print('Loaded env files:')
    for path, ok in loaded.items():
        print(f'  {path}: {"yes" if ok else "no"}')

    print('Runtime flags:')
    for key in [
        'DIGITAL_WORKER_REAL_EVAL_ENABLED',
        'DIGITAL_WORKER_REAL_EVAL_RUN_ID',
        'DIGITAL_WORKER_REAL_EVAL_COMPARE_TO',
        'AI_JUDGE_PROVIDER',
        'AI_JUDGE_MODEL',
        'ARK_API_KEY',
        'KIMI_API_KEY',
        'AI_LIVE_BASE_URL',
        'AI_LIVE_AUTH_TOKEN',
    ]:
        print(f'  {key}={"set" if os.environ.get(key) else "missing"}')


def build_pytest_command(args: argparse.Namespace) -> list:
    targets = (
        list(PYTEST_FILES.values())
        if args.batch == 'all'
        else [PYTEST_FILES[args.batch]]
    )
    command = [sys.executable, '-m', 'pytest', *targets, '-q']
    if args.keyword:
        command.extend(['-k', args.keyword])
    if args.collect_only:
        command.append('--collect-only')
    return command


def get_effective_run_id(args: argparse.Namespace) -> str:
    return args.run_id or os.environ.get('DIGITAL_WORKER_REAL_EVAL_RUN_ID', '').strip()


def get_report_root() -> Path:
    override = os.environ.get('DIGITAL_WORKER_REAL_EVAL_REPORT_DIR', '').strip()
    return Path(override) if override else DEFAULT_REPORT_ROOT


def load_summary(run_id: str) -> dict:
    if not run_id:
        return {}
    path = get_report_root() / run_id / 'summary.json'
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def decision_rank(decision: str) -> int:
    ranks = {
        '禁止上线': 0,
        '需整改': 1,
        '可试点': 2,
    }
    return ranks.get(decision, -1)


def main() -> int:
    args = parse_args()
    configure_environment(args.run_id, args.compare_to)
    command = build_pytest_command(args)

    print('Executing:')
    print('  ' + ' '.join(command))
    result = subprocess.run(command, cwd=str(BACKEND_DIR), env=os.environ.copy())
    if result.returncode != 0 or args.collect_only or not args.require_decision:
        return result.returncode

    run_id = get_effective_run_id(args)
    summary = load_summary(run_id)
    if not summary:
        print(f'Gate check failed: 未找到 summary.json，run_id={run_id or "unknown"}')
        return 2

    actual = summary.get('release_decision', '')
    print(f'Gate check: required={args.require_decision}, actual={actual}')
    if decision_rank(actual) < decision_rank(args.require_decision):
        print('Gate check failed: 发布结论未达到要求')
        return 3
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
