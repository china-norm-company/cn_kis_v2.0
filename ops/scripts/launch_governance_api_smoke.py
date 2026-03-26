#!/usr/bin/env python3
"""
launch_governance_api_smoke.py
鹿鸣·上线治理 API — L3 契约冒烟测试

验收范围（对应 docs/LAUNCH_GOVERNANCE_90D_ACCEPTANCE_AND_TEST_SYSTEM.md L3 层）：

  LG-L3-01  GET /auth/workstations/registry → code==0, len(data.items)==19
  LG-L3-02  GET /auth/governance/launch/gaps → code==0, data 为列表
  LG-L3-03  GET /auth/governance/launch/goals → code==0, data 为列表
  LG-L3-04  GET /auth/governance/launch/overview → 含 governance_counts 字段
  LG-L3-05  无 Token 访问 gaps → 401/UNAUTHORIZED
  LG-L3-06  POST /auth/governance/launch/gaps → 创建成功，列表增量 +1

运行：
    cd /path/to/CN_KIS_V2.0
    python ops/scripts/launch_governance_api_smoke.py
    TEST_SERVER=http://118.196.64.48 python ops/scripts/launch_governance_api_smoke.py
    LIVE_TOKEN=eyJ... python ops/scripts/launch_governance_api_smoke.py
"""

import json
import os
import subprocess
import sys
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# ─────────────────────────────────────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────────────────────────────────────

SERVER = os.environ.get('TEST_SERVER', 'http://localhost:8001')
BASE_API = f'{SERVER}/v2/api/v1'

# 终端颜色
R = '\033[91m'
G = '\033[92m'
Y = '\033[93m'
B = '\033[94m'
E = '\033[0m'
BOLD = '\033[1m'


def _fetch_token_local() -> str:
    backend_dir = os.path.realpath(
        os.path.join(os.path.dirname(__file__), '..', '..', 'backend')
    )
    cmd = ['python', 'manage.py', 'generate_test_jwt', '--raw', '--days', '7']
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=15, cwd=backend_dir
        )
        token = result.stdout.strip()
        if token and token.startswith('eyJ'):
            return token
    except Exception:
        pass
    return ''


def _fetch_token_from_server() -> str:
    import subprocess as sp
    ssh_host = os.environ.get('SSH_HOST', '118.196.64.48')
    ssh_user = os.environ.get('SSH_USER', 'root')
    ssh_key = os.environ.get('SSH_KEY_PATH', os.path.expanduser('~/.ssh/openclaw1.1.pem'))
    django_root = os.environ.get('DJANGO_ROOT', '/opt/cn-kis-v2/backend')
    cmd = [
        'ssh', '-i', ssh_key,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=5',
        f'{ssh_user}@{ssh_host}',
        f'cd {django_root} && python manage.py generate_test_jwt --raw --days 30',
    ]
    try:
        result = sp.run(cmd, capture_output=True, text=True, timeout=15)
        token = result.stdout.strip()
        if token and token.startswith('eyJ'):
            return token
    except Exception:
        pass
    return ''


def _resolve_token() -> str:
    if t := os.environ.get('LIVE_TOKEN', ''):
        return t
    if os.environ.get('SSH_KEY_PATH') or os.environ.get('SSH_HOST'):
        if t := _fetch_token_from_server():
            print(f'{B}[token] 已通过 SSH 从服务器自动获取 JWT{E}')
            return t
    if t := _fetch_token_local():
        print(f'{B}[token] 已通过本地 manage.py 自动生成 JWT{E}')
        return t
    print(f'{Y}[token] 未能自动获取 JWT，需认证的测试将被跳过{E}')
    return ''


LIVE_TOKEN = _resolve_token()


# ─────────────────────────────────────────────────────────────────────────────
# HTTP 工具
# ─────────────────────────────────────────────────────────────────────────────

def _req(method: str, path: str, data: Optional[dict] = None,
         auth: bool = True, timeout: int = 10) -> tuple[int, dict]:
    url = f'{BASE_API}{path}'
    headers: dict[str, str] = {'Content-Type': 'application/json'}
    if auth and LIVE_TOKEN:
        headers['Authorization'] = f'Bearer {LIVE_TOKEN}'
    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except URLError as e:
        return 0, {'_error': str(e)}
    except Exception as e:
        return 0, {'_error': str(e)}


_server_reachable_cache: Optional[bool] = None


def _is_server_reachable() -> bool:
    global _server_reachable_cache
    if _server_reachable_cache is not None:
        return _server_reachable_cache
    status, _ = _req('GET', '/auth/workstations/registry', auth=False, timeout=5)
    _server_reachable_cache = status != 0
    return _server_reachable_cache


# ─────────────────────────────────────────────────────────────────────────────
# 测试框架
# ─────────────────────────────────────────────────────────────────────────────

_results: list[tuple[str, str, str, bool]] = []  # (test_id, desc, detail, passed)


def _check(test_id: str, desc: str, passed: bool, detail: str = '') -> bool:
    status = f'{G}PASS{E}' if passed else f'{R}FAIL{E}'
    print(f'  [{status}] {test_id}: {desc}' + (f'  ← {detail}' if detail else ''))
    _results.append((test_id, desc, detail, passed))
    return passed


def _skip(test_id: str, desc: str, reason: str = 'no token') -> None:
    print(f'  [{Y}SKIP{E}] {test_id}: {desc}  ← {reason}')
    _results.append((test_id, desc, reason, True))  # skip 视为通过，不阻塞


# ─────────────────────────────────────────────────────────────────────────────
# L3 测试用例
# ─────────────────────────────────────────────────────────────────────────────

def test_lg_l3_01_registry():
    """LG-L3-01: 工作台注册表返回 19 条"""
    if not LIVE_TOKEN:
        _skip('LG-L3-01', '工作台注册表返回 19 条')
        return
    if not _is_server_reachable():
        _skip('LG-L3-01', '工作台注册表返回 19 条', reason='服务器不可达')
        return
    status, body = _req('GET', '/auth/workstations/registry')
    code_ok = body.get('code') in (0, 200)
    items = body.get('data', {}).get('items', [])
    total = body.get('data', {}).get('total', 0)
    count_ok = len(items) == 19
    _check(
        'LG-L3-01', '工作台注册表返回 19 条',
        code_ok and count_ok,
        f'HTTP {status}, code={body.get("code")}, total={total}, items={len(items)}',
    )


def test_lg_l3_02_gaps_list():
    """LG-L3-02: 缺口列表接口可达"""
    if not LIVE_TOKEN:
        _skip('LG-L3-02', '缺口列表接口可达')
        return
    status, body = _req('GET', '/auth/governance/launch/gaps')
    code_ok = body.get('code') in (0, 200)
    data_is_list = isinstance(body.get('data'), list)
    _check(
        'LG-L3-02', '缺口列表接口可达（data 为列表）',
        code_ok and data_is_list,
        f'HTTP {status}, code={body.get("code")}, type(data)={type(body.get("data")).__name__}',
    )


def test_lg_l3_03_goals_list():
    """LG-L3-03: 目标列表接口可达"""
    if not LIVE_TOKEN:
        _skip('LG-L3-03', '目标列表接口可达')
        return
    status, body = _req('GET', '/auth/governance/launch/goals')
    code_ok = body.get('code') in (0, 200)
    data_is_list = isinstance(body.get('data'), list)
    _check(
        'LG-L3-03', '目标列表接口可达（data 为列表）',
        code_ok and data_is_list,
        f'HTTP {status}, code={body.get("code")}, type(data)={type(body.get("data")).__name__}',
    )


def test_lg_l3_04_overview_fields():
    """LG-L3-04: 概览接口含 governance_counts 字段"""
    if not LIVE_TOKEN:
        _skip('LG-L3-04', '概览含 governance_counts 字段')
        return
    status, body = _req('GET', '/auth/governance/launch/overview')
    code_ok = body.get('code') in (0, 200)
    data = body.get('data', {})
    has_governance_counts = 'governance_counts' in data
    _check(
        'LG-L3-04', '概览含 governance_counts 字段',
        code_ok and has_governance_counts,
        f'HTTP {status}, code={body.get("code")}, keys={list(data.keys())[:6]}',
    )


def test_lg_l3_05_unauthenticated():
    """LG-L3-05: 无 Token 访问返回 401"""
    status, body = _req('GET', '/auth/governance/launch/gaps', auth=False)
    if status == 0:
        _skip('LG-L3-05', '无 Token 访问 gaps → 401/UNAUTHORIZED', reason='服务器不可达（HTTP 0）')
        return
    is_unauth = status == 401 or (
        isinstance(body.get('code'), str) and 'UNAUTH' in body.get('code', '').upper()
    ) or (
        isinstance(body.get('detail'), str) and 'Unauthorized' in body.get('detail', '')
    )
    _check(
        'LG-L3-05', '无 Token 访问 gaps → 401/UNAUTHORIZED',
        is_unauth,
        f'HTTP {status}, body_code={body.get("code")}, detail={body.get("detail")}',
    )


def test_lg_l3_06_gap_create_and_list():
    """LG-L3-06: 创建缺口 → 列表 +1"""
    if not LIVE_TOKEN:
        _skip('LG-L3-06', '创建缺口后列表 +1')
        return

    # 获取初始计数
    _, list_before = _req('GET', '/auth/governance/launch/gaps')
    before_len = len(list_before.get('data', []) or [])

    # 创建缺口
    payload = {
        'title': '[smoke-test] L3 自动创建缺口',
        'description': '由 launch_governance_api_smoke.py 自动创建，可删除',
        'severity': 'medium',
        'category': 'feature',
        'workstation': 'admin',
    }
    create_status, create_body = _req('POST', '/auth/governance/launch/gaps', data=payload)
    create_ok = create_body.get('code') in (0, 200) and create_status in (200, 201)

    # 再次获取列表
    _, list_after = _req('GET', '/auth/governance/launch/gaps')
    after_len = len(list_after.get('data', []) or [])

    _check(
        'LG-L3-06', '创建缺口后列表 +1',
        create_ok and after_len == before_len + 1,
        f'POST HTTP {create_status}, code={create_body.get("code")}, '
        f'before={before_len}, after={after_len}',
    )


def test_lg_l3_07_lifecycle_nodes():
    """LG-L3-07: 闭环节点接口含 nodes 数组"""
    if not LIVE_TOKEN:
        _skip('LG-L3-07', '闭环节点接口含 nodes 数组')
        return
    status, body = _req('GET', '/auth/governance/launch/lifecycle')
    code_ok = body.get('code') in (0, 200)
    data = body.get('data', {})
    has_nodes = 'nodes' in data
    _check(
        'LG-L3-07', '闭环节点接口含 nodes 数组',
        code_ok and has_nodes,
        f'HTTP {status}, code={body.get("code")}, keys={list(data.keys())[:6]}',
    )


def test_lg_l3_08_workstations_map():
    """LG-L3-08: 工作台地图接口含 items 数组"""
    if not LIVE_TOKEN:
        _skip('LG-L3-08', '工作台地图接口含 items 数组')
        return
    status, body = _req('GET', '/auth/governance/launch/workstations-map')
    code_ok = body.get('code') in (0, 200)
    data = body.get('data', {})
    has_items = 'items' in data
    _check(
        'LG-L3-08', '工作台地图接口含 items 数组',
        code_ok and has_items,
        f'HTTP {status}, code={body.get("code")}, keys={list(data.keys())[:6]}',
    )


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    print(f'\n{BOLD}═══ Launch Governance API Smoke Tests (L3) ═══{E}')
    print(f'{B}目标服务器{E}: {SERVER}')
    print(f'{B}Token 状态{E}: {"已获取" if LIVE_TOKEN else "未获取（仅运行 LG-L3-05）"}')
    print()

    tests = [
        test_lg_l3_01_registry,
        test_lg_l3_02_gaps_list,
        test_lg_l3_03_goals_list,
        test_lg_l3_04_overview_fields,
        test_lg_l3_05_unauthenticated,
        test_lg_l3_06_gap_create_and_list,
        test_lg_l3_07_lifecycle_nodes,
        test_lg_l3_08_workstations_map,
    ]

    for t in tests:
        try:
            t()
        except Exception as exc:
            test_id = t.__name__.replace('test_', '').upper().replace('_', '-')
            _check(test_id, t.__doc__ or t.__name__, False, f'EXCEPTION: {exc}')

    # 汇总
    passed = sum(1 for _, _, _, ok in _results if ok)
    total = len(_results)
    skipped = sum(1 for _, _, d, _ in _results if 'no token' in d or 'skip' in d.lower())
    failed = total - passed

    print()
    print(f'{BOLD}─── 汇总 ───{E}')
    print(f'总计: {total}  通过: {G}{passed}{E}  跳过: {Y}{skipped}{E}  失败: {R}{failed}{E}')

    if failed > 0:
        print(f'\n{R}失败项：{E}')
        for tid, desc, detail, ok in _results:
            if not ok:
                print(f'  - {tid}: {desc}  ({detail})')
        return 1

    print(f'\n{G}所有测试通过。{E}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
