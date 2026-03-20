import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List


logger = logging.getLogger(__name__)


def _safe_list(values: Any) -> List[Any]:
    return values if isinstance(values, list) else []


def _safe_dict(values: Any) -> Dict[str, Any]:
    return values if isinstance(values, dict) else {}


def execute_kimi_claw_task(
    *,
    task: Dict[str, Any],
    trace_id: str,
    idempotency_key: str,
    api_key: str,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    调用 Kimi Claw Runtime HTTP API，返回标准化执行结果。
    """
    base = str(os.getenv('KIMI_CLAW_RUNTIME_BASE', '')).strip().rstrip('/')
    path = str(os.getenv('KIMI_CLAW_RUNTIME_EXECUTE_PATH', '/v1/runtime/execute')).strip()
    timeout_seconds = max(5, min(180, int(os.getenv('KIMI_CLAW_RUNTIME_TIMEOUT_SECONDS', '45') or 45)))
    if not base:
        return {'ok': False, 'message': '未配置 KIMI_CLAW_RUNTIME_BASE'}

    url = f'{base}{path}'
    payload = {
        'trace_id': trace_id,
        'idempotency_key': idempotency_key,
        'dry_run': bool(dry_run),
        'task': task,
    }
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    token = (api_key or '').strip()
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url=url, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read().decode('utf-8', errors='ignore')
            data = _safe_dict(json.loads(raw or '{}'))
    except urllib.error.HTTPError as e:
        err_body = ''
        try:
            err_body = (e.read() or b'').decode('utf-8', errors='ignore')
        except Exception:
            err_body = ''
        logger.warning('KimiClaw runtime HTTPError: %s body=%s', e, err_body[:500])
        return {'ok': False, 'message': f'KimiClaw runtime 请求失败: HTTP {e.code}'}
    except urllib.error.URLError as e:
        logger.warning('KimiClaw runtime URLError: %s', e)
        return {'ok': False, 'message': f'KimiClaw runtime 网络异常: {e}'}
    except Exception as e:
        logger.warning('KimiClaw runtime unexpected error: %s', e)
        return {'ok': False, 'message': f'KimiClaw runtime 异常: {e}'}

    status = str(data.get('status') or data.get('run_status') or 'partial').strip().lower()
    if status not in {'success', 'failed', 'partial'}:
        status = 'partial'
    normalized = {
        'ok': bool(data.get('ok', True)),
        'run_id': str(data.get('run_id') or '').strip(),
        'status': status,
        'retry_count': int(data.get('retry_count') or 0),
        'message': str(data.get('message') or 'KimiClaw runtime 已返回').strip(),
        'output_artifacts': _safe_list(data.get('output_artifacts')),
        'screenshot_refs': _safe_list(data.get('screenshot_refs')),
        'skills_used': [str(x).strip() for x in _safe_list(data.get('skills_used')) if str(x).strip()],
        'step_traces': _safe_list(data.get('step_traces')),
        'error_taxonomy': _safe_dict(data.get('error_taxonomy')),
        'failed_step': str(data.get('failed_step') or '').strip(),
    }
    return normalized
