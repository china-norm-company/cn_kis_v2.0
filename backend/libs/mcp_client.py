"""
MCP Client — Model Context Protocol 客户端

通过 HTTP/SSE 调用 MCP 服务器暴露的工具，为 Agent Tool Calling 提供
外部数据源访问能力（网页搜索、内容提取、向量存储等）。

支持的 MCP 服务器类型：
  - remote: SaaS 托管（Firecrawl、Tavily），通过 URL 直连
  - local: 本地进程（Qdrant MCP），按需启动

配置：configs/mcp_servers.yaml（backend 本目录下）
"""
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional
import urllib.error

import yaml

logger = logging.getLogger('cn_kis.mcp_client')

_config: Optional[Dict] = None
_FAIL_FAST_UNTIL: Dict[str, float] = {}
_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'configs', 'mcp_servers.yaml',
)


def _load_config() -> Dict:
    """加载 MCP 服务器配置（带缓存）"""
    global _config
    if _config is not None:
        return _config

    config_path = os.path.normpath(_CONFIG_PATH)
    if not os.path.exists(config_path):
        logger.info('MCP config not found at %s, using empty config', config_path)
        _config = {'servers': {}}
        return _config

    with open(config_path, 'r', encoding='utf-8') as f:
        _config = yaml.safe_load(f) or {'servers': {}}

    _config = _resolve_env_vars(_config)
    return _config


def _resolve_env_vars(obj):
    """递归替换配置中的 {ENV_VAR} 占位符"""
    if isinstance(obj, str):
        import re
        def _replacer(m):
            return os.getenv(m.group(1), '')
        return re.sub(r'\{(\w+)\}', _replacer, obj)
    if isinstance(obj, dict):
        return {k: _resolve_env_vars(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_env_vars(i) for i in obj]
    return obj


def get_server_config(server_name: str) -> Optional[Dict]:
    """获取指定 MCP 服务器的配置"""
    config = _load_config()
    return config.get('servers', {}).get(server_name)


def _has_effective_auth_header(auth_header: str) -> bool:
    """判断 Authorization 头是否真的包含了凭证，而不是空的 `Bearer `。"""
    stripped = (auth_header or '').strip()
    if not stripped or '{' in stripped:
        return False
    if stripped.lower().startswith('bearer'):
        parts = stripped.split(None, 1)
        return len(parts) == 2 and bool(parts[1].strip())
    return True


def call_mcp_tool(
    server_name: str,
    tool_name: str,
    arguments: Dict[str, Any],
    timeout: int = 30,
) -> Dict[str, Any]:
    """
    调用 MCP 服务器上的工具。

    Args:
        server_name: MCP 服务器名称（对应 mcp_servers.yaml 中的 key）
        tool_name: 工具名称
        arguments: 工具参数
        timeout: 请求超时（秒）

    Returns:
        dict: 工具调用结果
    """
    server = get_server_config(server_name)
    if not server:
        return {'error': f'MCP server not configured: {server_name}'}

    retry_after = _FAIL_FAST_UNTIL.get(server_name, 0.0)
    now = time.time()
    if retry_after > now:
        remaining = int(retry_after - now)
        return {'error': f'MCP server temporarily unavailable: {server_name} (retry in {remaining}s)'}

    server_type = server.get('type', 'remote')

    if server_type == 'remote':
        return _call_remote_mcp(server_name, server, tool_name, arguments, timeout)
    elif server_type == 'local':
        return _call_local_mcp(server_name, server, tool_name, arguments, timeout)
    else:
        return {'error': f'Unknown MCP server type: {server_type}'}


def _call_remote_mcp(
    server_name: str,
    server: Dict,
    tool_name: str,
    arguments: Dict[str, Any],
    timeout: int,
) -> Dict[str, Any]:
    """通过 HTTP POST 调用远程 MCP 服务器（JSON-RPC 2.0）"""
    import urllib.request

    native_result = _call_native_remote_service(server_name, server, tool_name, arguments, timeout)
    if native_result is not None:
        return native_result

    url = server.get('url', '')
    if not url:
        return {'error': 'MCP server URL not configured'}

    payload = {
        'jsonrpc': '2.0',
        'id': int(time.time() * 1000),
        'method': 'tools/call',
        'params': {
            'name': tool_name,
            'arguments': arguments,
        },
    }

    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    auth_header = server.get('auth_header')
    if auth_header:
        headers['Authorization'] = auth_header

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')

    try:
        server_timeout = server.get('timeout', timeout)
        with urllib.request.urlopen(req, timeout=server_timeout) as resp:
            body = resp.read().decode('utf-8')
            result = json.loads(body)

            if 'error' in result:
                return {
                    'error': result['error'].get('message', 'MCP call failed'),
                    'code': result['error'].get('code'),
                }

            rpc_result = result.get('result', {})
            content_items = rpc_result.get('content', [])
            if content_items:
                texts = [
                    c.get('text', '')
                    for c in content_items
                    if c.get('type') == 'text'
                ]
                return {'content': '\n'.join(texts)} if texts else rpc_result

            return rpc_result

    except Exception as e:
        cooldown_seconds = int(server.get('cooldown_seconds', 180) or 180)
        _FAIL_FAST_UNTIL[server_name] = time.time() + cooldown_seconds
        logger.warning('MCP remote call failed: server=%s tool=%s error=%s',
                       server_name, tool_name, e)
        return {'error': f'MCP call failed: {e}'}


def _call_native_remote_service(
    server_name: str,
    server: Dict,
    tool_name: str,
    arguments: Dict[str, Any],
    timeout: int,
) -> Optional[Dict[str, Any]]:
    """对不支持 MCP JSON-RPC 的 SaaS 提供商走原生 REST API 适配。"""
    if server_name == 'tavily':
        return _call_tavily_api(server, tool_name, arguments, timeout)
    if server_name == 'firecrawl':
        return _call_firecrawl_api(server, tool_name, arguments, timeout)
    return None


def _extract_http_error_message(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode('utf-8', errors='ignore')
        except Exception:
            body = ''
        if body:
            return f'HTTP {exc.code}: {body}'
    return str(exc)


def _call_tavily_api(
    server: Dict,
    tool_name: str,
    arguments: Dict[str, Any],
    timeout: int,
) -> Dict[str, Any]:
    if tool_name != 'search':
        return {'error': f'Unsupported Tavily tool: {tool_name}'}

    import urllib.request

    base_url = (server.get('url') or '').rstrip('/')
    if not base_url:
        return {'error': 'Tavily URL not configured'}

    auth_header = server.get('auth_header', '')
    if not _has_effective_auth_header(auth_header):
        return {'error': 'Tavily auth header/env var not configured'}

    url = f'{base_url}/search' if not base_url.endswith('/search') else base_url
    payload = {
        'query': arguments.get('query', ''),
        'max_results': arguments.get('max_results', arguments.get('maxResults', 5)),
        'search_depth': arguments.get('search_depth', 'basic'),
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': auth_header,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=server.get('timeout', timeout)) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            normalized_results = []
            for item in result.get('results', []) or []:
                normalized_results.append({
                    **item,
                    'snippet': item.get('snippet') or item.get('content') or '',
                })
            result['results'] = normalized_results
            _FAIL_FAST_UNTIL.pop('tavily', None)
            return result
    except Exception as e:
        cooldown_seconds = int(server.get('cooldown_seconds', 180) or 180)
        _FAIL_FAST_UNTIL['tavily'] = time.time() + cooldown_seconds
        logger.warning('Tavily API call failed: %s', e)
        return {'error': f'Tavily API call failed: {_extract_http_error_message(e)}'}


def _call_firecrawl_api(
    server: Dict,
    tool_name: str,
    arguments: Dict[str, Any],
    timeout: int,
) -> Dict[str, Any]:
    if tool_name != 'scrape':
        return {'error': f'Unsupported Firecrawl tool: {tool_name}'}

    import urllib.request

    base_url = (server.get('url') or '').rstrip('/')
    if not base_url:
        return {'error': 'Firecrawl URL not configured'}

    auth_header = server.get('auth_header', '')
    if not _has_effective_auth_header(auth_header):
        return {'error': 'Firecrawl auth header/env var not configured'}

    url = f'{base_url}/scrape' if not base_url.endswith('/scrape') else base_url
    payload = {
        'url': arguments.get('url', ''),
        'formats': arguments.get('formats', ['markdown']),
        'onlyMainContent': arguments.get('onlyMainContent', True),
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': auth_header,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=server.get('timeout', timeout)) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            data_payload = result.get('data') or {}
            normalized = {
                **result,
                'content': data_payload.get('markdown') or data_payload.get('content') or data_payload.get('html') or '',
                'markdown': data_payload.get('markdown') or '',
                'text': data_payload.get('markdown') or data_payload.get('content') or '',
                'metadata': data_payload.get('metadata') or {},
            }
            _FAIL_FAST_UNTIL.pop('firecrawl', None)
            return normalized
    except Exception as e:
        cooldown_seconds = int(server.get('cooldown_seconds', 180) or 180)
        _FAIL_FAST_UNTIL['firecrawl'] = time.time() + cooldown_seconds
        logger.warning('Firecrawl API call failed: %s', e)
        return {'error': f'Firecrawl API call failed: {_extract_http_error_message(e)}'}


def _call_local_mcp(
    server_name: str,
    server: Dict,
    tool_name: str,
    arguments: Dict[str, Any],
    timeout: int,
) -> Dict[str, Any]:
    """
    调用本地 MCP 服务器。
    本地服务器需预先启动并监听 HTTP 端口，或通过 stdio 通信。
    当前实现：假设本地 MCP 已启动并监听 HTTP。
    """
    local_url = server.get('url', '')
    if not local_url:
        return {'error': 'Local MCP server URL not configured'}

    fake_remote = dict(server)
    fake_remote['type'] = 'remote'
    return _call_remote_mcp(server_name, fake_remote, tool_name, arguments, timeout)


# ============================================================================
# 便捷函数 — 常用 MCP 操作
# ============================================================================

def web_search(query: str, max_results: int = 5) -> Dict[str, Any]:
    """通过 Tavily MCP 搜索网页"""
    return call_mcp_tool('tavily', 'search', {
        'query': query,
        'maxResults': max_results,
    })


def web_extract(url: str) -> Dict[str, Any]:
    """通过 Firecrawl MCP 提取网页内容"""
    return call_mcp_tool('firecrawl', 'scrape', {
        'url': url,
    })


def _qdrant_request(
    method: str,
    path: str,
    payload: Optional[Dict[str, Any]] = None,
    timeout: Optional[int] = None,
) -> Dict[str, Any]:
    """调用原生 Qdrant HTTP API。"""
    import urllib.request
    import urllib.error

    server = get_server_config('qdrant')
    if not server:
        return {'error': 'qdrant server not configured'}

    base_url = (server.get('url') or '').rstrip('/')
    if not base_url:
        return {'error': 'qdrant URL not configured'}

    request_timeout = timeout or server.get('timeout', 10)
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(
        f'{base_url}{path}',
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=request_timeout) as resp:
            body = resp.read().decode('utf-8') if resp else ''
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore') if hasattr(e, 'read') else ''
        return {'error': f'Qdrant HTTP {e.code}: {body or e.reason}'}
    except Exception as e:
        return {'error': f'Qdrant request failed: {e}'}


def _ensure_qdrant_collection(collection: str, vector_size: int) -> Dict[str, Any]:
    """确保目标 collection 已存在。"""
    server = get_server_config('qdrant') or {}
    check = _qdrant_request('GET', f'/collections/{collection}')
    if 'error' not in check:
        return check

    return _qdrant_request(
        'PUT',
        f'/collections/{collection}',
        {
            'vectors': {
                'size': int(server.get('vector_size', vector_size) or vector_size),
                'distance': server.get('distance', 'Cosine'),
            }
        },
        timeout=server.get('timeout', 10),
    )


def _get_query_embedding(text: str) -> Optional[List[float]]:
    """生成查询向量，优先本地 embedding，失败时回退到 ARK。"""
    try:
        from apps.agent_gateway.services import get_local_embedding
        embedding = get_local_embedding(text)
        if embedding:
            return embedding
    except Exception as e:
        logger.debug('Local embedding failed for Qdrant search: %s', e)

    try:
        from apps.agent_gateway.services import get_ark_embedding
        embedding, _trace = get_ark_embedding(text[:8000])
        if embedding:
            return embedding
    except Exception as e:
        logger.debug('ARK embedding failed for Qdrant search: %s', e)

    return None


def _normalize_qdrant_point_id(point_id: Any) -> Any:
    """Qdrant point id 只接受无符号整数或 UUID。"""
    if isinstance(point_id, str) and point_id.isdigit():
        return int(point_id)
    return point_id


def vector_search(
    query: str,
    collection: str = 'cn_kis_knowledge',
    top_k: int = 10,
) -> Dict[str, Any]:
    """通过原生 Qdrant HTTP API 搜索相似向量。"""
    embedding = _get_query_embedding(query)
    if not embedding:
        return {'error': 'embedding unavailable for qdrant search'}

    result = _qdrant_request(
        'POST',
        f'/collections/{collection}/points/search',
        {
            'vector': embedding,
            'limit': top_k,
            'with_payload': True,
            'with_vector': False,
        },
    )
    if 'error' in result:
        return result

    points = result.get('result', [])
    return {'content': points}


def vector_upsert(
    point_id: str,
    vector: List[float],
    payload: Dict[str, Any],
    collection: str = 'cn_kis_knowledge',
) -> Dict[str, Any]:
    """通过原生 Qdrant HTTP API 写入向量。"""
    ensure_result = _ensure_qdrant_collection(collection, len(vector))
    if 'error' in ensure_result:
        return ensure_result

    return _qdrant_request(
        'PUT',
        f'/collections/{collection}/points?wait=true',
        {
            'points': [{
                'id': _normalize_qdrant_point_id(point_id),
                'vector': vector,
                'payload': payload,
            }],
        },
    )


def graphiti_search(
    query: str,
    top_k: int = 10,
    max_hops: int = 3,
) -> Dict[str, Any]:
    """
    通过 Graphiti MCP 执行多跳图谱检索。

    约定兼容多种服务端实现：
    - 优先调用 `search`
    - 参数统一使用 query / top_k / max_hops
    - 返回中由调用方再解析 entry_id / linked_entry_id / uri
    """
    return call_mcp_tool('graphiti', 'search', {
        'query': query,
        'top_k': top_k,
        'max_hops': max_hops,
    })


def list_configured_servers() -> List[str]:
    """列出所有已配置的 MCP 服务器"""
    config = _load_config()
    return list(config.get('servers', {}).keys())


def rerank_passages(
    query: str,
    passages: List[str],
    top_n: int = 8,
    model: str = 'jina-reranker-v2-base-multilingual',
) -> Dict[str, Any]:
    """
    通过外部 Reranker MCP（Jina/Cohere）对候选段落进行二阶段精排。

    协议：
      输入: query (str), passages (List[str]), top_n (int)
      输出: { results: [{ index: int, relevance_score: float, document: str }] }
             或 { error: str }（不可用时，由调用方降级到本地精排）

    Args:
        query: 原始查询
        passages: 候选段落文本列表（顺序与候选 ID 对应）
        top_n: 精排后保留的结果数
        model: reranker 模型名称（Jina 多语言，支持中文）

    Returns:
        成功: { results: [ { index, relevance_score, document } ] }
        失败: { error: str }
    """
    server = get_server_config('reranker')
    if not server:
        return {'error': 'reranker server not configured'}

    url = server.get('url', '')
    if not url:
        return {'error': 'reranker URL not configured'}

    auth_header = server.get('auth_header', '')
    if not _has_effective_auth_header(auth_header):
        return {'error': 'RERANK_API_KEY not configured'}

    payload = {
        'model': model,
        'query': query,
        'documents': passages,
        'top_n': top_n,
        'return_documents': False,
    }

    import urllib.request
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': auth_header,
        'User-Agent': 'CN-KIS/1.0',
    }

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    timeout = server.get('timeout', 15)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8')
            result = json.loads(body)
            if 'results' in result:
                return result
            return {'error': f'Unexpected reranker response: {list(result.keys())}'}
    except Exception as e:
        logger.debug('Reranker MCP unavailable: %s', e)
        return {'error': f'reranker call failed: {e}'}


def check_mcp_health() -> Dict[str, Any]:
    """
    检查所有 MCP 服务的健康状态。

    返回：
      { server_name: { status: 'ok'|'degraded'|'offline', latency_ms: int, detail: str } }
    """
    results: Dict[str, Any] = {}
    config = _load_config()

    for server_name, server_cfg in config.get('servers', {}).items():
        health_cfg = server_cfg.get('health_check', {}) or {}
        if not health_cfg.get('enabled', False):
            results[server_name] = {'status': 'skipped', 'detail': 'health check disabled'}
            continue

        start = time.time()
        try:
            server_type = server_cfg.get('type', 'remote')
            url = server_cfg.get('url', '')
            timeout = health_cfg.get('timeout_seconds', 5)
            mode = health_cfg.get('mode', 'http')

            if mode == 'config_only':
                auth = server_cfg.get('auth_header', '')
                if not url:
                    results[server_name] = {
                        'status': 'offline',
                        'latency_ms': 0,
                        'detail': 'URL not configured',
                        'fallback': server_cfg.get('fallback', 'none'),
                    }
                    continue
                if 'auth_header' in server_cfg and not _has_effective_auth_header(auth):
                    results[server_name] = {
                        'status': 'degraded',
                        'latency_ms': 0,
                        'detail': 'auth header/env var not configured',
                        'fallback': server_cfg.get('fallback', 'none'),
                    }
                    continue
                results[server_name] = {
                    'status': 'ok',
                    'latency_ms': 0,
                    'detail': 'config present, runtime probe skipped',
                    'fallback': server_cfg.get('fallback', 'none'),
                }
                _FAIL_FAST_UNTIL.pop(server_name, None)
                continue

            if mode == 'native_api':
                auth = server_cfg.get('auth_header', '')
                if 'auth_header' in server_cfg and not _has_effective_auth_header(auth):
                    results[server_name] = {
                        'status': 'degraded',
                        'latency_ms': 0,
                        'detail': 'auth header/env var not configured',
                        'fallback': server_cfg.get('fallback', 'none'),
                    }
                    continue

                if server_name == 'tavily':
                    probe = _call_tavily_api(server_cfg, 'search', {'query': 'ping', 'max_results': 1}, timeout)
                elif server_name == 'firecrawl':
                    probe = _call_firecrawl_api(server_cfg, 'scrape', {'url': 'https://example.com'}, timeout)
                else:
                    probe = {'error': f'unsupported native health probe: {server_name}'}

                latency_ms = int((time.time() - start) * 1000)
                if probe.get('error'):
                    results[server_name] = {
                        'status': 'degraded',
                        'latency_ms': latency_ms,
                        'detail': probe['error'],
                        'fallback': server_cfg.get('fallback', 'none'),
                    }
                else:
                    results[server_name] = {
                        'status': 'ok',
                        'latency_ms': latency_ms,
                        'detail': f'native api healthy, {latency_ms}ms',
                        'fallback': server_cfg.get('fallback', 'none'),
                    }
                continue

            if not url or (server_type == 'local' and not url.startswith('http')):
                results[server_name] = {
                    'status': 'offline',
                    'latency_ms': 0,
                    'detail': 'URL not configured or invalid',
                }
                continue

            auth = server_cfg.get('auth_header', '')
            if 'auth_header' in server_cfg and not _has_effective_auth_header(auth):
                results[server_name] = {
                    'status': 'degraded',
                    'latency_ms': 0,
                    'detail': 'auth header/env var not configured',
                    'fallback': server_cfg.get('fallback', 'none'),
                }
                continue

            import urllib.request
            probe_path = server_cfg.get('health_path', '/health')
            probe_url = url.rstrip('/') + probe_path if server_type == 'local' else url
            req = urllib.request.Request(probe_url, method='GET')
            if _has_effective_auth_header(auth):
                req.add_header('Authorization', auth)

            with urllib.request.urlopen(req, timeout=timeout) as resp:
                latency_ms = int((time.time() - start) * 1000)
                _FAIL_FAST_UNTIL.pop(server_name, None)
                results[server_name] = {
                    'status': 'ok',
                    'latency_ms': latency_ms,
                    'http_status': resp.status,
                    'detail': f'healthy, {latency_ms}ms',
                }
        except Exception as e:
            latency_ms = int((time.time() - start) * 1000)
            error_text = str(e)
            status = 'offline'
            if 'HTTP Error 401' in error_text or 'HTTP Error 403' in error_text:
                status = 'degraded'
            results[server_name] = {
                'status': status,
                'latency_ms': latency_ms,
                'detail': error_text,
                'fallback': server_cfg.get('fallback', 'none'),
            }
            _FAIL_FAST_UNTIL[server_name] = time.time() + int(server_cfg.get('cooldown_seconds', 180) or 180)
            logger.warning('MCP health check failed: server=%s error=%s', server_name, e)

    return results
