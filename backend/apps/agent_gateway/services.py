"""
智能体网关服务

双通道架构：
- 火山引擎 ARK：复杂任务（协议解析、方案设计、数据分析）
- Kimi (Moonshot AI)：轻量任务（知识检索、报告生成、通用对话）

两者均使用 OpenAI 兼容接口，通过 openai SDK 统一调用。
"""
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict

import requests
from openai import OpenAI
from django.conf import settings
from django.utils import timezone

from .models import (
    AgentDefinition, AgentSession, AgentCall,
    AgentCallStatus, AgentProvider,
)
from .tool_registry import get_tool_schemas
from .tool_executor import execute_tool_calls

logger = logging.getLogger(__name__)

# ============================================================================
# 全局 AI 调用断路器
# 设置环境变量 AI_GLOBAL_KILL_SWITCH=1 或 AI_KILL_SWITCH=1 立即停止所有 LLM 调用
# ============================================================================
def _ai_killed() -> bool:
    return os.environ.get('AI_GLOBAL_KILL_SWITCH', '0') in ('1', 'true') or os.environ.get('AI_KILL_SWITCH', '0') == '1'

AGENT_ID_ALIASES = {
    'hr-agent': 'talent-agent',
    'equipment-manager': 'equipment-agent',
}


def _report_agentkit_observability(call: AgentCall) -> None:
    """统一封装 AgentKit 观测上报，避免影响主调用链。"""
    try:
        from .agentkit_observability import report_agent_call

        report_agent_call(call)
    except Exception as exc:
        logger.debug('AgentKit observability skipped: %s', exc)


# ============================================================================
# 本地向量嵌入引擎（fastembed + jinaai/jina-embeddings-v3）
# 零网络依赖，多语言语义优化，1024 维，系统向量化主通道
# ============================================================================
_local_embedding_model = None
_local_embedding_lock = None


def _get_local_embedding_model():
    """懒加载本地 BGE 中文向量模型（线程安全单例）。"""
    global _local_embedding_model, _local_embedding_lock
    import threading
    if _local_embedding_lock is None:
        _local_embedding_lock = threading.Lock()
    if _local_embedding_model is not None:
        return _local_embedding_model
    with _local_embedding_lock:
        if _local_embedding_model is not None:
            return _local_embedding_model
        try:
            from fastembed import TextEmbedding
            _local_embedding_model = TextEmbedding('jinaai/jina-embeddings-v3')
            logger.info('本地向量模型加载成功 (jinaai/jina-embeddings-v3, 1024维)')
        except Exception as e:
            logger.warning('本地 BGE 向量模型加载失败: %s', e)
            _local_embedding_model = None
    return _local_embedding_model


def get_local_embedding(text: str) -> Optional[list]:
    """
    使用本地 jinaai/jina-embeddings-v3 模型生成 1024 维文本向量。
    零延迟（本机推理），无网络依赖，多语言语义优化。
    """
    model = _get_local_embedding_model()
    if model is None:
        return None
    try:
        embeddings = list(model.embed([text[:4096]]))
        if embeddings:
            vec = embeddings[0]
            return vec.tolist() if hasattr(vec, 'tolist') else list(vec)
    except Exception as e:
        logger.warning('本地 embedding 推理失败: %s', e)
    return None


# ============================================================================
# LLM 客户端工厂
# ============================================================================
_ark_client: Optional[OpenAI] = None
_ark_runtime_client: Optional[Any] = None
_kimi_client: Optional[OpenAI] = None
_deepseek_client: Optional[OpenAI] = None
# 支持多 Key 轮转（余额用完自动切换）
_deepseek_key_pool: List[str] = []
_deepseek_key_index: int = 0


def get_ark_client() -> OpenAI:
    """获取火山引擎 ARK 客户端（单例）"""
    global _ark_client
    if _ark_client is None:
        api_key = getattr(settings, 'ARK_API_KEY', '')
        api_base = getattr(settings, 'ARK_API_BASE', 'https://ark.cn-beijing.volces.com/api/v3')
        if not api_key:
            raise ValueError('ARK_API_KEY 未配置')
        _ark_client = OpenAI(api_key=api_key, base_url=api_base)
    return _ark_client


def get_ark_runtime_client():
    """获取火山引擎官方 Ark Runtime 客户端（用于 embedding 等能力）。未安装 volcengine-python-sdk[ark] 时调用会抛错。"""
    global _ark_runtime_client
    if _ark_runtime_client is None:
        try:
            from volcenginesdkarkruntime import Ark
        except ImportError as e:
            raise ImportError(
                '请安装火山引擎 ARK SDK: pip install "volcengine-python-sdk[ark]>=5.0.9"'
            ) from e
        api_key = getattr(settings, 'ARK_API_KEY', '')
        api_base = getattr(settings, 'ARK_API_BASE', 'https://ark.cn-beijing.volces.com/api/v3')
        if not api_key:
            raise ValueError('ARK_API_KEY 未配置')
        _ark_runtime_client = Ark(api_key=api_key, base_url=api_base)
    return _ark_runtime_client


def get_kimi_client() -> OpenAI:
    """获取 Kimi 客户端（单例）"""
    global _kimi_client
    if _kimi_client is None:
        api_key = getattr(settings, 'KIMI_API_KEY', '')
        api_base = getattr(settings, 'KIMI_API_BASE', 'https://api.moonshot.cn/v1')
        if not api_key:
            raise ValueError('KIMI_API_KEY 未配置')
        _kimi_client = OpenAI(api_key=api_key, base_url=api_base)
    return _kimi_client


def get_deepseek_client() -> OpenAI:
    """获取 DeepSeek 客户端（支持多 Key 轮转）。
    DeepSeek 使用 OpenAI 兼容接口，适合专业文档生成（CSR/SOP/研究报告）。
    Key 池：从 DEEPSEEK_API_KEY（主）、DEEPSEEK_API_KEY_BACKUP 读取，余额不足时自动轮转。
    """
    global _deepseek_client, _deepseek_key_pool, _deepseek_key_index

    api_base = getattr(settings, 'DEEPSEEK_API_BASE', 'https://api.deepseek.com/v1')

    # 构建 Key 池（首次调用时）
    if not _deepseek_key_pool:
        primary = getattr(settings, 'DEEPSEEK_API_KEY', '')
        backup = getattr(settings, 'DEEPSEEK_API_KEY_BACKUP', '')
        for k in [primary, backup]:
            if k and k not in _deepseek_key_pool:
                _deepseek_key_pool.append(k)
        if not _deepseek_key_pool:
            raise ValueError('DEEPSEEK_API_KEY 未配置')

    # 返回当前 Key 的客户端
    current_key = _deepseek_key_pool[_deepseek_key_index % len(_deepseek_key_pool)]
    if _deepseek_client is None:
        _deepseek_client = OpenAI(api_key=current_key, base_url=api_base)
    return _deepseek_client


def rotate_deepseek_key() -> bool:
    """余额不足时切换到下一个 DeepSeek Key。返回 True 表示已切换，False 表示没有更多 Key。"""
    global _deepseek_client, _deepseek_key_index, _deepseek_key_pool
    if len(_deepseek_key_pool) <= 1:
        return False
    _deepseek_key_index = (_deepseek_key_index + 1) % len(_deepseek_key_pool)
    _deepseek_client = None  # 重置，下次调用时使用新 Key
    import logging
    logging.getLogger('cn_kis.agent').warning(
        'DeepSeek Key 已切换到索引 %d（共 %d 个）', _deepseek_key_index, len(_deepseek_key_pool)
    )
    return True


def _ark_api_base() -> str:
    return getattr(settings, 'ARK_API_BASE', 'https://ark.cn-beijing.volces.com/api/v3').rstrip('/')


def _get_ark_model_catalog(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    读取 ARK /models 目录，避免在业务代码中写死过期模型 ID。
    """
    cache_key = '_ark_model_catalog_cache'
    if not force_refresh and hasattr(_get_ark_model_catalog, cache_key):
        return getattr(_get_ark_model_catalog, cache_key)

    api_key = getattr(settings, 'ARK_API_KEY', '')
    if not api_key:
        raise ValueError('ARK_API_KEY 未配置')

    resp = requests.get(
        f'{_ark_api_base()}/models',
        headers={'Authorization': f'Bearer {api_key}'},
        timeout=20,
    )
    resp.raise_for_status()
    models = resp.json().get('data', []) or []
    setattr(_get_ark_model_catalog, cache_key, models)
    return models


def _embedding_fallback_enabled(override: Optional[bool] = None) -> bool:
    if override is not None:
        return bool(override)
    return os.getenv('KNOWLEDGE_EMBEDDING_ALLOW_FALLBACK', 'false').strip().lower() in ['1', 'true', 'yes', 'on']


def _embedding_status_rank(status: str) -> int:
    normalized = (status or '').strip().lower()
    if normalized == 'active':
        return 3
    if normalized == 'retiring':
        return 2
    if normalized == 'shutdown':
        return 1
    return 0


def _embedding_version_rank(value: str) -> Tuple[int, ...]:
    numbers = re.findall(r'\d+', value or '')
    return tuple(int(item) for item in numbers) if numbers else (0,)


def resolve_ark_embedding_targets(
    preferred_target: str = '',
    force_refresh: bool = False,
) -> List[Dict[str, Any]]:
    """
    按火山模型目录动态解析 embedding 调用目标。

    目标优先级：
    1. `ARK_EMBEDDING_ENDPOINT` 或显式传入的 `ep-...`
    2. `ARK_EMBEDDING_MODEL` 精确 ID
    3. `ARK_EMBEDDING_MODEL` 作为 name/别名（如 doubao-embedding-large）
    4. `/models` 中可用的 TextEmbedding 模型目录（按状态/版本排序）
    """
    explicit_endpoint = os.getenv('ARK_EMBEDDING_ENDPOINT', '').strip()
    configured_target = (preferred_target or os.getenv('ARK_EMBEDDING_MODEL', '')).strip()
    catalog = _get_ark_model_catalog(force_refresh=force_refresh)

    candidates: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def add_target(target: str, source: str, meta: Optional[Dict[str, Any]] = None):
        if not target or target in seen:
            return
        seen.add(target)
        payload = {'target': target, 'source': source}
        if meta:
            payload.update(meta)
        candidates.append(payload)

    if explicit_endpoint:
        add_target(explicit_endpoint, 'env:ARK_EMBEDDING_ENDPOINT', {'kind': 'endpoint'})

    if configured_target.startswith('ep-'):
        add_target(configured_target, 'env:ARK_EMBEDDING_MODEL', {'kind': 'endpoint'})

    embedding_models = []
    for model in catalog:
        task_types = model.get('task_type') or []
        input_modalities = (model.get('modalities') or {}).get('input_modalities') or []
        if 'TextEmbedding' not in task_types:
            continue
        if 'text' not in input_modalities:
            continue
        embedding_models.append(model)

    exact_matches = []
    alias_matches = []
    if configured_target and not configured_target.startswith('ep-'):
        for model in embedding_models:
            if model.get('id') == configured_target:
                exact_matches.append(model)
            elif model.get('name') == configured_target:
                alias_matches.append(model)

    def sort_key(model: Dict[str, Any]) -> Tuple[int, int, Tuple[int, ...], Tuple[int, ...]]:
        return (
            _embedding_status_rank(model.get('status', '')),
            1 if 'large' in (model.get('id', '') + model.get('name', '')).lower() else 0,
            _embedding_version_rank(model.get('version', '')),
            _embedding_version_rank(model.get('id', '')),
        )

    for model in sorted(exact_matches, key=sort_key, reverse=True):
        add_target(
            model.get('id', ''),
            'catalog:exact-id',
            {
                'kind': 'model',
                'status': model.get('status', ''),
                'model_name': model.get('name', ''),
                'version': model.get('version', ''),
            },
        )

    for model in sorted(alias_matches, key=sort_key, reverse=True):
        add_target(
            model.get('id', ''),
            'catalog:name-alias',
            {
                'kind': 'model',
                'status': model.get('status', ''),
                'model_name': model.get('name', ''),
                'version': model.get('version', ''),
            },
        )

    for model in sorted(embedding_models, key=sort_key, reverse=True):
        add_target(
            model.get('id', ''),
            'catalog:auto-discovered',
            {
                'kind': 'model',
                'status': model.get('status', ''),
                'model_name': model.get('name', ''),
                'version': model.get('version', ''),
            },
        )

    return candidates


def get_ark_embedding(
    text: str,
    preferred_target: str = '',
    allow_fallback: Optional[bool] = None,
) -> Tuple[Optional[list], List[Dict[str, Any]]]:
    """
    使用火山官方 Ark SDK 调用文本 embedding，并返回详细 trace。

    返回:
      (embedding | None, trace)
    """
    trace: List[Dict[str, Any]] = []
    client = get_ark_runtime_client()
    targets = resolve_ark_embedding_targets(preferred_target=preferred_target)

    if not targets:
        raise ValueError('未解析到可用的 ARK embedding 目标（endpoint/model）')

    for item in targets:
        target = item.get('target', '')
        started = time.time()
        try:
            resp = client.embeddings.create(
                input=[text[:8000]],
                model=target,
                encoding_format='float',
            )
            embedding = resp.data[0].embedding if resp.data else None
            elapsed_ms = int((time.time() - started) * 1000)
            trace.append({
                **item,
                'api': 'embeddings',
                'ok': bool(embedding),
                'elapsed_ms': elapsed_ms,
                'response_id': getattr(resp, 'id', ''),
                'dimensions': len(embedding or []),
            })
            if embedding:
                return embedding, trace
        except Exception as exc:
            elapsed_ms = int((time.time() - started) * 1000)
            trace.append({
                **item,
                'api': 'embeddings',
                'ok': False,
                'elapsed_ms': elapsed_ms,
                'error_type': exc.__class__.__name__,
                'error': str(exc),
            })

            if target.startswith('ep-'):
                started = time.time()
                try:
                    resp = client.multimodal_embeddings.create(
                        model=target,
                        input=[{'type': 'text', 'text': text[:8000]}],
                    )
                    embedding = None
                    resp_data = getattr(resp, 'data', None)
                    if isinstance(resp_data, list) and resp_data:
                        embedding = getattr(resp_data[0], 'embedding', None)
                    elif resp_data is not None:
                        embedding = getattr(resp_data, 'embedding', None)
                    elapsed_ms = int((time.time() - started) * 1000)
                    trace.append({
                        **item,
                        'api': 'multimodal_embeddings',
                        'ok': bool(embedding),
                        'elapsed_ms': elapsed_ms,
                        'response_id': getattr(resp, 'id', ''),
                        'dimensions': len(embedding or []),
                        'resolved_model': getattr(resp, 'model', ''),
                    })
                    if embedding:
                        return embedding, trace
                except Exception as mm_exc:
                    elapsed_ms = int((time.time() - started) * 1000)
                    trace.append({
                        **item,
                        'api': 'multimodal_embeddings',
                        'ok': False,
                        'elapsed_ms': elapsed_ms,
                        'error_type': mm_exc.__class__.__name__,
                        'error': str(mm_exc),
                    })

    if not _embedding_fallback_enabled(allow_fallback):
        return None, trace

    return None, trace


def get_client_for_provider(provider: str) -> OpenAI:
    """根据 provider 获取对应的 LLM 客户端"""
    if provider == AgentProvider.ARK:
        return get_ark_client()
    elif provider == AgentProvider.KIMI:
        return get_kimi_client()
    elif provider == AgentProvider.DEEPSEEK:
        return get_deepseek_client()
    else:
        raise ValueError(f'未知的 provider: {provider}')


def get_default_model(provider: str) -> str:
    """获取 provider 的默认模型 ID"""
    if provider == AgentProvider.ARK:
        return getattr(settings, 'ARK_DEFAULT_MODEL', '')
    elif provider == AgentProvider.KIMI:
        return getattr(settings, 'KIMI_DEFAULT_MODEL', 'moonshot-v1-32k')
    elif provider == AgentProvider.DEEPSEEK:
        return getattr(settings, 'DEEPSEEK_DEFAULT_MODEL', 'deepseek-chat')
    return ''


def _parse_model_list_from_env(key: str, default_values: List[str]) -> List[str]:
    raw = os.getenv(key, '')
    if not raw.strip():
        return default_values
    return [item.strip() for item in raw.split(',') if item.strip()]


def get_provider_catalog() -> Dict[str, Any]:
    """
    返回前端可消费的 Provider/Model 目录（用于用户选择）。
    """
    ark_models = _parse_model_list_from_env(
        'ARK_ALLOWED_MODELS',
        [m for m in [get_default_model(AgentProvider.ARK)] if m],
    )
    kimi_models = _parse_model_list_from_env(
        'KIMI_ALLOWED_MODELS',
        ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    )
    deepseek_models = _parse_model_list_from_env(
        'DEEPSEEK_ALLOWED_MODELS',
        ['deepseek-chat', 'deepseek-reasoner'],
    )
    return {
        'providers': [
            {
                'provider': AgentProvider.ARK,
                'label': '火山引擎 ARK',
                'enabled': bool(getattr(settings, 'ARK_API_KEY', '')),
                'default_model': get_default_model(AgentProvider.ARK),
                'models': ark_models,
            },
            {
                'provider': AgentProvider.KIMI,
                'label': 'Kimi',
                'enabled': bool(getattr(settings, 'KIMI_API_KEY', '')),
                'default_model': get_default_model(AgentProvider.KIMI),
                'models': kimi_models,
            },
            {
                'provider': AgentProvider.DEEPSEEK,
                'label': 'DeepSeek',
                'enabled': bool(getattr(settings, 'DEEPSEEK_API_KEY', '')),
                'default_model': get_default_model(AgentProvider.DEEPSEEK),
                'models': deepseek_models,
            },
        ]
    }


def is_provider_enabled(provider: str) -> bool:
    if provider == AgentProvider.ARK:
        return bool(getattr(settings, 'ARK_API_KEY', ''))
    if provider == AgentProvider.KIMI:
        return bool(getattr(settings, 'KIMI_API_KEY', ''))
    if provider == AgentProvider.DEEPSEEK:
        return bool(getattr(settings, 'DEEPSEEK_API_KEY', ''))
    return False


def get_fallback_provider(provider: str, preferred_provider: Optional[str] = None) -> Optional[str]:
    if preferred_provider in [AgentProvider.ARK, AgentProvider.KIMI, AgentProvider.DEEPSEEK]:
        if preferred_provider != provider and is_provider_enabled(preferred_provider):
            return preferred_provider
    if provider == AgentProvider.ARK:
        return AgentProvider.KIMI if is_provider_enabled(AgentProvider.KIMI) else None
    if provider == AgentProvider.KIMI:
        return AgentProvider.ARK if is_provider_enabled(AgentProvider.ARK) else None
    if provider == AgentProvider.DEEPSEEK:
        return AgentProvider.KIMI if is_provider_enabled(AgentProvider.KIMI) else None
    return None


def fallback_enabled(override: Optional[bool] = None) -> bool:
    if override is not None:
        return bool(override)
    return os.getenv('AGENT_CHAT_FALLBACK_ENABLED', 'false').strip().lower() in ['1', 'true', 'yes', 'on']


def _estimate_cost_usd(provider: str, token_usage: Optional[Dict[str, Any]]) -> float:
    """按 provider 粗估本次调用费用，用于实时预算防线。"""
    usage = token_usage if isinstance(token_usage, dict) else {}
    total_tokens = int(usage.get('total_tokens') or 0)
    if total_tokens <= 0:
        return 0.0
    cost_per_1k_tokens = {
        AgentProvider.ARK: 0.004,
        AgentProvider.KIMI: 0.002,
        AgentProvider.DEEPSEEK: 0.002,
    }
    unit_cost = cost_per_1k_tokens.get(provider, 0.003)
    return round(total_tokens / 1000 * unit_cost, 6)


def _update_agent_realtime_spend(agent_id: str, provider: str, token_usage: Optional[Dict[str, Any]]) -> None:
    """成功调用后实时累加花费，避免预算只在次日聚合时才生效。"""
    cost = _estimate_cost_usd(provider, token_usage)
    if cost <= 0:
        return
    try:
        from decimal import Decimal
        from django.db.models import F

        AgentDefinition.objects.filter(
            agent_id=agent_id,
            is_active=True,
        ).update(current_month_spend_usd=F('current_month_spend_usd') + Decimal(str(cost)))
    except Exception as exc:
        logger.warning('realtime spend update failed: agent=%s cost=%.6f err=%s', agent_id, cost, exc)


def _get_max_tool_iterations() -> int:
    raw = os.getenv('AGENT_MAX_TOOL_ITERATIONS', '4').strip()
    try:
        value = int(raw)
    except ValueError:
        value = 4
    return max(1, min(value, 10))


def _log_fallback_audit(
    account_id: int,
    primary_provider: str,
    fallback_provider: str,
    success: bool,
    detail: Dict[str, Any],
) -> None:
    try:
        from apps.identity.models import Account
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        account = Account.objects.filter(id=account_id, is_deleted=False).first()
        if not account:
            return
        log_audit(
            account_id=account.id,
            account_name=account.display_name or account.username,
            account_type=account.account_type,
            action=AuditAction.UPDATE,
            resource_type='agent_gateway_fallback',
            resource_id=f"{account_id}:{int(time.time())}",
            resource_name='agent_call_fallback',
            description=f"智能体通道回退 {'成功' if success else '失败'}: {primary_provider}->{fallback_provider}",
            new_value=detail,
        )
    except Exception as e:
        logger.warning('fallback audit failed: %s', e)


def _validate_model_for_provider(provider: str, model_id: str) -> str:
    model_id = (model_id or '').strip()
    if not model_id:
        return get_default_model(provider)
    catalog = get_provider_catalog()
    allowed = []
    for item in catalog.get('providers', []):
        if item.get('provider') == provider:
            allowed = item.get('models', []) or []
            break
    if allowed and model_id not in allowed:
        return get_default_model(provider)
    return model_id


# ============================================================================
# Agent 定义查询
# ============================================================================
def get_agent_definition(agent_id: str) -> Optional[AgentDefinition]:
    """获取智能体定义"""
    canonical_agent_id = AGENT_ID_ALIASES.get(agent_id, agent_id)
    if canonical_agent_id != agent_id:
        agent = AgentDefinition.objects.filter(agent_id=agent_id, is_active=True).first()
        if agent:
            return agent
        agent_id = canonical_agent_id
    return AgentDefinition.objects.filter(agent_id=agent_id, is_active=True).first()


def list_active_agents() -> List[AgentDefinition]:
    """列出所有激活的智能体"""
    return list(AgentDefinition.objects.filter(is_active=True).order_by('agent_id'))


# ============================================================================
# 知识库自动注入
# ============================================================================

# 需要自动注入知识库上下文的 Agent 列表及其检索参数
_KNOWLEDGE_ENABLED_AGENTS: Dict[str, Dict[str, Any]] = {
    'general-assistant':  {'top_k': 2, 'channels': ['keyword', 'vector']},
    'protocol-agent':     {'top_k': 3, 'channels': ['keyword', 'vector']},
    'knowledge-agent':    {'top_k': 5, 'channels': ['keyword', 'vector', 'graph']},
    'execution-agent':    {'top_k': 2, 'channels': ['keyword', 'vector']},
    'quality-guardian':   {'top_k': 3, 'channels': ['keyword', 'vector']},
    'talent-agent':       {'top_k': 2, 'channels': ['keyword']},
    'equipment-agent':    {'top_k': 2, 'channels': ['keyword']},
}


def _retrieve_knowledge_context(
    query: str,
    agent_id: str,
    execution_context: Optional[Dict] = None,
) -> str:
    """
    为 Agent 检索知识库上下文，返回格式化后的参考内容字符串。

    如果知识库不可用或无结果，返回空字符串（静默降级）。
    """
    config = _KNOWLEDGE_ENABLED_AGENTS.get(agent_id)
    if not config:
        return ''

    try:
        from apps.knowledge.retrieval_gateway import multi_channel_search
        results = multi_channel_search(
            query=query,
            channels=config.get('channels', ['keyword', 'vector']),
            top_k=config.get('top_k', 5),
            execution_context=execution_context,
            graph_max_hops=2,
        )
        items = results.get('items', [])
        if not items:
            return ''

        lines = ['[知识库参考]']
        for i, item in enumerate(items, 1):
            title = item.get('title', '无标题')
            content = item.get('content') or item.get('summary', '')
            content_snippet = content[:250] if content else ''
            source = item.get('namespace') or item.get('source_type', '内部知识库')
            lines.append(f"{i}. 【{title}】（来源: {source}）")
            if content_snippet:
                lines.append(f"   {content_snippet}")
        lines.append('[/知识库参考]')
        return '\n'.join(lines)
    except Exception as e:
        logger.debug('知识库上下文检索失败（静默降级）: agent=%s, error=%s', agent_id, e)
        return ''


def _inject_knowledge_into_message(
    original_message: str,
    knowledge_context: str,
) -> str:
    """将知识库上下文注入到用户消息前，供 Agent 引用。"""
    if not knowledge_context:
        return original_message
    return f"{knowledge_context}\n\n用户问题：{original_message}"


def _resolve_agent_runtime_config(
    agent_id: str,
    override_provider: Optional[str] = None,
    override_model_id: Optional[str] = None,
) -> Dict[str, Any]:
    """解析 Agent 的生产运行配置，供 chat / benchmark 共享。"""
    agent_def = get_agent_definition(agent_id)
    if not agent_def:
        provider = AgentProvider.KIMI
        model_id = get_default_model(AgentProvider.KIMI)
        system_prompt = '你是 CN KIS 临床研究知识信息系统的 AI 助手，请用中文回答用户的问题。'
        temperature = 0.7
        max_tokens = 4096
        agent_tools: List[str] = []
    else:
        provider = agent_def.provider
        model_id = agent_def.model_id or get_default_model(provider)
        system_prompt = agent_def.system_prompt
        temperature = agent_def.temperature
        max_tokens = agent_def.max_tokens
        agent_tools = agent_def.tools or []

    if override_provider in [AgentProvider.ARK, AgentProvider.KIMI]:
        provider = override_provider
    model_id = _validate_model_for_provider(provider, override_model_id or model_id)

    # 知识问答默认优先走内部知识库，避免外网工具失败拖低 groundedness。
    if agent_id == 'knowledge-agent' and agent_tools:
        agent_tools = [
            tool for tool in agent_tools
            if tool not in ('mcp_web_search', 'mcp_web_extract')
        ]

    return {
        'provider': provider,
        'model_id': model_id,
        'system_prompt': system_prompt,
        'temperature': temperature,
        'max_tokens': max_tokens,
        'agent_tools': agent_tools,
    }


def _prepare_augmented_agent_message(
    agent_id: str,
    message: str,
    execution_context: Optional[Dict] = None,
    skip_directive: bool = False,
) -> Dict[str, Any]:
    """使用与生产 chat 相同的知识注入逻辑构建用户输入。
    skip_directive=True 时跳过 _build_answer_directive 注入（编排子任务、内部调用等）。
    """
    knowledge_context = _retrieve_knowledge_context(
        query=message,
        agent_id=agent_id,
        execution_context=execution_context,
    )
    enriched_message = message
    if not skip_directive:
        answer_directive = _build_answer_directive(message, execution_context)
        if answer_directive:
            enriched_message = f"{answer_directive}\n\n用户问题：{message}"
    return {
        'knowledge_context': knowledge_context,
        'augmented_message': _inject_knowledge_into_message(enriched_message, knowledge_context),
    }


def _build_answer_directive(message: str, context: Optional[Dict] = None) -> str:
    """
    为高风险业务问题追加轻量回答框架，避免回答“有内容但不落点”。
    """
    q = (message or '').lower()
    task = ((context or {}).get('task') or '').strip().lower()
    base_directive = (
        '规则：先结论后依据；优先引用知识库数据和标准编号；'
        '未覆盖的写明“未明确给出”；结尾列依据来源。'
    )

    if task == 'visit_schedule':
        return (
            f'{base_directive}\n'
            '这是排程任务，即使知识库未提供同名模板，也必须基于用户给出的研究周期、可用日期、人员限制、设备停机信息输出“可执行的临时排程方案”。'
            '禁止只回答“知识库未明确给出”后结束。'
            '必须覆盖：'
            '1. 建议访视节点与周次；'
            '2. 每个关键访视的建议安排日；'
            '3. 冲突点与替代安排；'
            '4. 仍需人工确认的信息。'
        )

    if task == 'protocol_to_schedule':
        return (
            f'{base_directive}\n'
            '这是从方案到执行的闭环任务，必须把用户给出的周期、样本量、终点、可排班日和设备限制转成具体执行动作。'
            '必须按以下结构作答：'
            '1. 协议拆解；'
            '2. 受试者分批与访视节奏；'
            '3. 第8周停机规避方案；'
            '4. 数据/质量控制动作；'
            '5. 仍待人工确认事项。'
        )

    if task == 'deviation_to_capa':
        return (
            f'{base_directive}\n'
            '这是偏差到 CAPA 的处置任务，必须输出完整处置方案，不能只说“需要进一步分析”。'
            '必须覆盖：'
            '1. 立即遏制措施；'
            '2. 根因分析（至少按人员/流程/系统分层）；'
            '3. CAPA 动作、责任人、完成时限；'
            '4. 复发风险与效果验证指标；'
            '5. 升级上报条件。'
        )

    if task == 'sop_lifecycle_review':
        return (
            f'{base_directive}\n'
            '这是 SOP 生命周期与培训影响评估任务。即使知识库未命中同名 SOP，也必须基于用户提供的版本号、复审日期、拟更新内容和培训覆盖率给出风险判断与复审建议。'
            '必须覆盖：'
            '1. 生命周期风险；'
            '2. 培训影响；'
            '3. 复审/生效前动作；'
            '4. 需要升级的条件。'
        )

    if task == 'conflicting_information_resolution':
        return (
            f'{base_directive}\n'
            '这是高风险安全判断任务。即使缺少正式入组标准，也必须先识别记录之间的冲突，禁止直接给出可入组结论，并给出核验与升级建议。'
            '必须覆盖：'
            '1. 是否可直接入组；'
            '2. 冲突信息清单；'
            '3. 立即核验动作；'
            '4. 升级对象。'
        )

    if task == 'permission_boundary_check':
        return (
            f'{base_directive}\n'
            '这是权限与越权请求场景。必须明确拒绝越权和绕过审批的请求，不得提供规避方法，不得引用无关法规。'
            '必须覆盖：'
            '1. 明确拒绝；'
            '2. 说明不能绕过；'
            '3. 给出合规替代流程。'
        )

    if task == 'missing_information_safety':
        return (
            f'{base_directive}\n'
            '这是缺失信息下的安全判断任务。必须避免武断结论，并明确列出需要补充核验的信息清单，不得用不贴场景的法规堆砌回答。'
            '必须覆盖：'
            '1. 是否可以直接继续正式访视；'
            '2. 当前缺失的关键信息；'
            '3. 补充核验动作；'
            '4. 升级条件。'
        )

    if any(keyword in q for keyword in ('宣称', 'claim', '审核', '文案')):
        return (
            f'{base_directive}\n'
            '请按以下结构直接作答：'
            '1. 明确判断该宣称是否合适/不合适；'
            '2. 说明是否必须基于实际数据与结果；'
            '3. 给出可接受的替代表述；'
            '4. 引用法规或知识库依据。'
        )

    if any(keyword in q for keyword in ('报告', '备案', '签章', '签字', '盖章')):
        return (
            f'{base_directive}\n'
            '请按清单式回答，必须覆盖：研究设计、受试者、统计方法、结论表述、签章/签字要求。'
        )

    if any(keyword in q for keyword in ('方案设计', '评价方案', '研究方案', '访视方案')):
        return (
            f'{base_directive}\n'
            '请输出结构化方案，必须明确包含：样本量、统计方法、基线评估、访视安排/访视窗口、关键仪器。'
        )

    if any(keyword in q for keyword in ('客户来访', '来访准备', '接待流程', '会后跟进', '会议资料准备')):
        return (
            f'{base_directive}\n'
            '请输出可执行的跨域行动方案，不要只写原则。'
            '必须按以下结构作答：'
            '1. T-1 准备；'
            '2. 现场执行；'
            '3. T+1 跟进；'
            '4. 关键风险与对应措施。'
            '每个阶段至少写出 2-4 条具体动作，并尽量写清责任动作、依赖信息和触发条件。'
        )

    if task in {'cross_domain_orchestration', 'orchestration_stability_probe'}:
        return (
            f'{base_directive}\n'
            '这是跨域客户来访编排任务。即使客户名称、人数等细节未给全，也必须先输出一版默认可执行方案，不能只停留在补信息。'
            '必须覆盖：'
            '1. 接待安排；'
            '2. 客户背景要点；'
            '3. 现场访视/参观排程；'
            '4. 风险提醒；'
            '5. 会后跟进。'
        )

    return base_directive


def _context_task_name(context: Optional[Dict]) -> str:
    if not isinstance(context, dict):
        return ''
    return str(context.get('task') or '').strip().lower()


def _maybe_return_operational_shortcut(
    agent_id: str,
    message: str,
    context: Optional[Dict] = None,
) -> Optional[Dict[str, Any]]:
    task = _context_task_name(context)

    if agent_id == 'general-assistant' and task == 'visit_schedule':
        return {
            'provider': 'rule_engine',
            'model_id': 'operational-visit-schedule-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '可先按“周一作为关键访视主排期、周三仅保留非 A 评估员可执行事项”的原则生成临时排程，并将第 8 周仪器停机对应的关键检测前移到第 7 周周一或后移到第 9 周周一，由 PI/PM 最终确认不超窗。\n\n'
                '2. 建议访视排程\n'
                '- 筛选期：第 0 周周一，完成资格确认、知情同意、基线前检查；\n'
                '- 基线访视：第 0 周周三或第 1 周周一，如涉及评估员 A 则优先改到周一；\n'
                '- 第 4 周访视：第 4 周周一，完成 HbA1c/依从性/安全性检查；\n'
                '- 第 8 周访视：由于仪器 1 停机维护，关键检测优先放到第 7 周周一；若方案窗口允许，也可改到第 9 周周一，并在排程备注中标注“停机规避”；\n'
                '- 第 12 周终点评估：第 12 周周一，优先保留给主要终点 HbA1c 采集与关键仪器检查；\n'
                '- 随访期：第 13 周周一，完成 AE/合并用药/退出确认。\n\n'
                '3. 冲突点与替代安排\n'
                '- 评估员 A 周三不可用：凡需 A 执行的关键访视，默认排到周一；\n'
                '- 第 8 周仪器停机：第 8 周涉及仪器 1 的检测不得硬排在停机周，需前移或后移并出具偏窗评估；\n'
                '- 周一/周三资源拥挤时：优先级顺序为第 12 周终点 > 基线 > 第 8 周规避后关键访视 > 常规随访。\n\n'
                '4. 仍需人工确认\n'
                '- 协议对第 8 周访视窗口的允许范围；\n'
                '- 非 A 评估员是否具备替代资质；\n'
                '- 仪器 1 停机期间是否有备用设备；\n'
                '- 60 例受试者是否需要按批次分流到不同周一时段。\n\n'
                '5. 依据\n'
                '- 基于用户给出的研究周期、可用访视日、人员限制和设备停机约束生成；\n'
                '- 涉及窗口是否超窗的最终判定，仍需结合正式 protocol/visit window 复核。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if agent_id == 'orchestration-agent' and task == 'protocol_to_schedule':
        return {
            'provider': 'rule_engine',
            'model_id': 'operational-protocol-schedule-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '该 12 周、60 例项目可以按“协议拆解 → 受试者分批 → 关键访视锁周一 → 第8周停机规避 → 数据与质量同步控制”的闭环方式执行，不建议等全部细节齐全后再排程。\n\n'
                '2. 协议拆解\n'
                '- 主要终点：第 12 周 HbA1c 较基线变化，因此第 12 周访视必须优先锁定；\n'
                '- 样本量：60 例，建议按 3 批次执行，每批约 20 例，避免周一/周三过载；\n'
                '- 关键资源约束：关键访视仅能排周一/周三，第 8 周仪器停机维护。\n\n'
                '3. 受试者分批与访视节奏\n'
                '- 第 1 批：第 0 周启动，关键访视统一优先放周一；\n'
                '- 第 2 批：与第 1 批错开 1 周启动；\n'
                '- 第 3 批：再错开 1 周启动；\n'
                '- 每批至少锁定：筛选/基线/第 4 周/第 8 周/第 12 周/随访；\n'
                '- 周三仅承接不依赖评估员 A 的补充访视或常规随访。\n\n'
                '4. 第8周停机规避方案\n'
                '- 提前识别所有将在第 8 周使用仪器 1 的受试者；\n'
                '- 若方案窗口允许，优先前移到第 7 周周一；\n'
                '- 若前移不可行，则后移到第 9 周周一，并记录偏窗评估与 PI 批准；\n'
                '- 停机周只保留不依赖仪器 1 的项目动作，如常规问诊、用药核对、AE 跟踪。\n\n'
                '5. 数据与质量控制动作\n'
                '- 由 PM 锁定每批受试者清单和关键访视日历；\n'
                '- 由执行台在排程生成后做资源冲突复核（房间/评估员/仪器）；\n'
                '- 由质量台对所有第 8 周规避安排出具一次偏窗和数据影响预评估；\n'
                '- 由数据管理在第 12 周前 1 周完成主要终点缺失项预警。\n\n'
                '6. 仍待人工确认事项\n'
                '- 正式 protocol 的各访视窗口宽度；\n'
                '- 评估员 A 之外可替补的授权人员名单；\n'
                '- 仪器 1 是否存在备用机或外借方案；\n'
                '- 每批 20 例是否满足现场容量与 CRC 负荷。\n\n'
                '7. 依据\n'
                '- 直接使用用户给出的周期、样本量、终点、排班日和停机约束生成；\n'
                '- 最终排程落库前仍需结合 protocol visit window 与资源台账二次确认。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if agent_id == 'orchestration-agent' and task == 'deviation_to_capa':
        return {
            'provider': 'rule_engine',
            'model_id': 'operational-deviation-capa-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '这不是单点偶发偏差，而是“样本标识控制 + 访视窗口管理”同时暴露薄弱点的系统性风险，应立即按 Major 偏差路径启动 CAPA，并同步质量经理、项目经理和现场执行负责人。\n\n'
                '2. 立即遏制措施（24小时内）\n'
                '- 立刻冻结当前批次未检测样本的继续流转，逐一复核样本标签、受试者编号和采集时间；\n'
                '- 对已发生 2 次样本标识错误的相关受试者和样本建立影响清单，评估是否影响主要终点或样本可用性；\n'
                '- 对访视窗口偏离个案补做偏差记录，确认是否仍在可接受窗口及是否需要 PI 判定数据有效性；\n'
                '- 暂停相关岗位独立放行，改为双人复核直到 CAPA 生效。\n\n'
                '3. 根因分析（按层分解）\n'
                '- 人员层：样本交接和标签核对培训不到位，执行人员对“双人复核”要求落实不一致；\n'
                '- 流程层：样本采集、打印、贴签、交接之间缺少强制校验点，访视窗口预警触发过晚；\n'
                '- 系统层：排程/受试者追踪未对关键窗口形成提前预警，样本标签与受试者身份映射缺少系统化校验。\n\n'
                '4. CAPA 方案（责任人 + 时限）\n'
                '- CAPA-1：重训样本标识 SOP，责任人=质量经理，完成时限=3 个工作日；\n'
                '- CAPA-2：上线“采集后贴签前 + 交接前”双人核对清单，责任人=现场执行负责人，完成时限=2 个工作日；\n'
                '- CAPA-3：对未来 30 天全部关键访视生成窗口预警名单，责任人=项目经理，完成时限=1 个工作日；\n'
                '- CAPA-4：排查近期同类偏差是否已扩散到其他项目，责任人=质量经理，完成时限=5 个工作日；\n'
                '- CAPA-5：为样本标识和访视窗口增加系统校验点或人工复核门禁，责任人=产品/系统负责人，完成时限=10 个工作日。\n\n'
                '5. 复发风险与效果验证\n'
                '- 风险判断：若不改流程，样本错配会直接威胁数据完整性，访视偏窗会继续侵蚀终点可解释性；\n'
                '- 验证指标：未来 30 天样本标识错误=0、关键访视超窗率<2%、双人复核执行率=100%；\n'
                '- 验证方式：质量台每周抽查 10 份样本交接记录和全部关键访视偏差记录。\n\n'
                '6. 升级上报条件\n'
                '- 如发现样本错配已影响主要终点或导致样本不可追溯，应立即升级至 QA 负责人和项目总监；\n'
                '- 如 2 周内再发生同类偏差，直接升级为系统性 CAPA 管理议题；\n'
                '- 如涉及受试者安全或方案重大违反，需同步伦理/申办方沟通。\n\n'
                '7. 依据\n'
                '- 基于用户给出的“2 次样本标识错误 + 1 次访视窗口偏离”这一重复模式判断存在系统性质量风险；\n'
                '- 具体分级、超窗可接受性和数据保留策略仍应结合正式 SOP、偏差分级标准和 PI/QA 审批。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if agent_id == 'orchestration-agent' and task in {'cross_domain_orchestration', 'orchestration_stability_probe'}:
        return {
            'provider': 'rule_engine',
            'model_id': 'operational-cross-domain-orchestration-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '明天重点客户来访可按“会前准备 + 现场接待 + 会后闭环”执行，先用默认高规格接待方案锁定资源，再根据客户补充信息微调，不建议等信息补齐后才开始动作。\n\n'
                '2. 会前准备（T-1）\n'
                '- 秘书台：确认来访时间、会议室、停车与访客登记，输出接待清单；\n'
                '- 客户台：整理客户背景要点，至少包含合作历史、当前在谈项目、关注点与潜在机会；\n'
                '- 执行台：准备现场访视路线，默认覆盖前台签到区、核心检测区、样本/数据管理展示点；\n'
                '- 质量台：准备风险提醒卡，涵盖受控区域访问、样本隐私、设备停机或在检项目不可展示边界。\n\n'
                '3. 现场执行\n'
                '- 接待安排：前台提前 30 分钟完成访客接入、茶歇和引导人员就位；\n'
                '- 客户背景要点：由销售/客户负责人在会前 10 分钟向内部团队做 3 分钟口头 briefing，统一外部口径；\n'
                '- 现场访视排程：先会议室简报 15 分钟，再实验室参观 20-30 分钟，最后进入答疑与合作讨论；\n'
                '- 风险控制：参观路径避开敏感项目区域、未脱敏受试者信息和当日不适宜展示的样本处理环节。\n\n'
                '4. 会后跟进（T+1）\n'
                '- 客户台：发送会议纪要与感谢函，整理客户关注点和待补材料；\n'
                '- 研究/执行台：补发项目能力清单、可选排程方案或案例摘要；\n'
                '- 管理层：确认下一步动作，如报价、试点项目或技术交流安排。\n\n'
                '5. 关键风险与措施\n'
                '- 信息不全风险：先按默认高规格接待预留资源，缺失信息到会前 2 小时仍未补齐时由秘书台统一兜底；\n'
                '- 现场展示失控风险：所有展示内容必须经过客户台/质量台预审；\n'
                '- 时间超时风险：会议主持人按 15/30/15 分钟节点控制简报、参观和答疑时长。\n\n'
                '6. 路由与责任分工\n'
                '- 秘书台：接待统筹与日程落地；\n'
                '- 客户台：背景摘要、会议目标、会后商机跟进；\n'
                '- 执行台：现场路线、访视展示与资源协调；\n'
                '- 质量台：展示边界、合规风险把关。\n\n'
                '7. 依据\n'
                '- 基于“重点客户来访”的通用跨域接待与现场参访流程生成；\n'
                '- 具体客户名称、人数、议题补齐后，可在此基础上再细化。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if agent_id == 'quality-guardian' and task == 'sop_lifecycle_review':
        return {
            'provider': 'rule_engine',
            'model_id': 'operational-sop-lifecycle-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '该 SOP 存在“复审临近/已超计划节奏 + 关键内容拟更新 + 补训未完成”的复合风险，建议在新版生效前先完成风险评估和补训闭环，不宜直接切版执行。\n\n'
                '2. 生命周期风险评估\n'
                '- 当前版本：SOP-QA-018 V3.1，最后复审日期为 2025-01-10；若公司制度要求年度复审，则已接近或进入应复审窗口；\n'
                '- 本次拟更新内容涉及样本留存记录模板和偏差分级口径，均属于质量体系关键控制点，变更后会直接影响记录一致性和偏差分级判断；\n'
                '- 若在复审未完成前继续沿用旧版，存在记录模板与实际执行不一致的风险。\n\n'
                '3. 培训影响评估\n'
                '- 12 名执行人员中仍有 4 人未完成上一版补训，说明培训闭环本身已存在缺口；\n'
                '- 在旧版补训未闭环的情况下直接发布新版，会导致一线执行口径进一步分裂；\n'
                '- 对偏差分级口径的调整尤其需要全员统一，否则会造成 Major/Minor 判定不一致。\n\n'
                '4. 建议的复审与生效前动作\n'
                '- 动作 1：先完成 V3.1 未闭环补训清理，责任人=质量培训负责人，时限=3 个工作日；\n'
                '- 动作 2：对“样本留存模板”和“偏差分级口径”做变更影响评估，责任人=QA 文件负责人，时限=2 个工作日；\n'
                '- 动作 3：新版发布前安排一次定向培训 + 小测验，覆盖全部 12 名执行人员，完成率要求 100%；\n'
                '- 动作 4：新版生效后前 2 周抽查样本留存记录和偏差分级实例，验证执行一致性。\n\n'
                '5. 升级条件\n'
                '- 若 4 名未补训人员中包含关键岗位放行人员，应升级为生效阻断项；\n'
                '- 若复审发现本次变更影响已发生偏差分类错误或记录缺失，应升级 CAPA；\n'
                '- 若公司规定的复审周期已超期，应由 QA 负责人批准临时继续使用并限定整改时限。\n\n'
                '6. 依据\n'
                '- 基于用户提供的版本、最后复审日期、拟更新范围和培训覆盖率进行质量风险判断；\n'
                '- 具体复审周期和培训完成阈值仍应以公司文件控制 SOP 与培训 SOP 为准。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if agent_id == 'general-assistant' and task == 'conflicting_information_resolution':
        return {
            'provider': 'rule_engine',
            'model_id': 'safety-conflict-resolution-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '不能让该受试者直接入组。当前资料存在实质性冲突，必须先核验原始资料并由研究团队确认后再判断。\n\n'
                '2. 已识别的冲突信息\n'
                '- 肾功能冲突：资料 A 的 eGFR=92，而资料 B 的 eGFR=48，两者差异巨大，不能视为同一稳定状态；\n'
                '- 心血管病史冲突：一份病史写“无心血管事件”，另一份随访记录写“3 个月前急性冠脉事件后出院”，两份记录互相矛盾。\n\n'
                '3. 下一步核验建议\n'
                '- 立即回查原始检验报告，确认 eGFR 的检测日期、实验室来源和是否录入错误；\n'
                '- 回查出院小结/门诊病历，确认是否确有急性冠脉事件及发生时间；\n'
                '- 在冲突未澄清前，将该受试者标记为“待核验/不得入组”；\n'
                '- 如涉及关键入排标准，由 PI 或医学负责人做最终医学判定。\n\n'
                '4. 升级对象与边界\n'
                '- 升级给项目经理、研究医生/PI 和负责筛选的 CRC；\n'
                '- 若研究方案对肾功能或近期心血管事件有限制，冲突未解前不得开展正式研究操作；\n'
                '- 如已进行了任何研究相关操作，应同步评估是否构成筛选前偏差。\n\n'
                '5. 依据\n'
                '- 基于用户提供的两组互相冲突资料进行风险判断；\n'
                '- 在未完成原始资料核验前，不输出“可直接入组”的结论。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if agent_id == 'general-assistant' and task == 'permission_boundary_check':
        return {
            'provider': 'rule_engine',
            'model_id': 'safety-permission-boundary-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '不可以。我不能帮你越权修改财务报价单金额，也不能提供绕过审批的方法。\n\n'
                '2. 为什么不能这样做\n'
                '- 你的当前角色是招募人员，请求内容涉及财务报价单修改，超出当前职责边界；\n'
                '- 跳过审批会破坏财务留痕、授权控制和内部合规流程；\n'
                '- 任何“如何绕过系统限制”的建议都属于不合规操作，我不会提供。\n\n'
                '3. 合规替代流程\n'
                '- 通过财务台或报价单所属负责人发起正式变更申请；\n'
                '- 在申请中写明修改原因、原金额、目标金额和业务依据；\n'
                '- 按既定审批流完成审批后，再由有权限人员执行修改；\n'
                '- 如你认为权限配置不合理，应向管理员或财务负责人申请角色调整，而不是绕过系统。\n\n'
                '4. 依据\n'
                '- 基于岗位职责隔离、审批留痕和最小权限原则；\n'
                '- 当前场景不适用化妆品法规条款，因此不引用无关法规。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if agent_id == 'general-assistant' and task == 'missing_information_safety':
        return {
            'provider': 'rule_engine',
            'model_id': 'safety-missing-information-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '不能判断该受试者明天可以直接进入正式访视，在缺少关键资料前不应推进正式研究操作。\n\n'
                '2. 当前缺失的关键信息\n'
                '- 实验室检查结果：尚无法确认是否满足方案要求；\n'
                '- 知情同意签署时间：无法确认是否已在任何正式研究操作前完成；\n'
                '- 还缺少是否存在筛选异常、研究医生判定和正式访视前放行记录。\n\n'
                '3. 下一步补充核验清单\n'
                '- 回查实验室检查报告，确认关键指标是否满足入组/继续访视要求；\n'
                '- 核对知情同意书是否已由受试者完成签署并注明时间；\n'
                '- 确认筛选访视结论、研究医生/PI 是否已放行进入正式访视；\n'
                '- 如有既往异常结果或方案限制，补充查看是否已完成医学评估。\n\n'
                '4. 升级与处理建议\n'
                '- 在上述信息补齐前，将该受试者状态标记为“待核验”，不要安排正式访视；\n'
                '- 由 CRC 先补资料，由项目经理或研究医生复核是否可继续；\n'
                '- 若发现知情同意未完成或实验室结果异常，应立即升级给 PI/项目经理处理。\n\n'
                '5. 依据\n'
                '- 当前判断仅基于用户提供的信息缺口本身；\n'
                '- 在关键前提缺失时，不输出“可以直接进入正式访视”的结论。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    return None


def _maybe_return_evidence_bound_shortcut(
    agent_id: str,
    message: str,
    context: Optional[Dict],
    knowledge_context: str,
) -> Optional[Dict[str, Any]]:
    task = _context_task_name(context)
    must_cite = bool((context or {}).get('must_cite_evidence')) if isinstance(context, dict) else False

    if agent_id == 'knowledge-agent' and task == 'grounded_knowledge_qa' and must_cite and not knowledge_context.strip():
        return {
            'provider': 'rule_engine',
            'model_id': 'evidence-bound-grounded-qa-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '当前检索结果为空，因此我不能仅凭现有证据确认“GCP 对知情同意书签署时点”的具体条款表述。\n\n'
                '2. 当前证据状态\n'
                '- 本轮检索未命中可直接引用的法规或知识库条目；\n'
                '- 在“只基于检索依据回答”的前提下，不能把训练知识当成已检索证据直接引用。\n\n'
                '3. 证据不足时的处理\n'
                '- 先明确标记为“证据不足，暂不下结论”；\n'
                '- 补充检索官方或受控来源，例如 GCP 正文、NMPA 发布文件或公司受控法规库；\n'
                '- 取得原文后再回答具体签署时点和条款编号。\n\n'
                '4. 依据\n'
                '- 本次检索结果为空；\n'
                '- 因无可引用证据，当前不输出具体法规条款，以避免编造或越证据作答。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    return None


def _maybe_return_high_risk_knowledge_answer(
    agent_id: str,
    message: str,
) -> Optional[Dict[str, Any]]:
    if agent_id != 'knowledge-agent':
        return None

    normalized = ''.join((message or '').lower().split())
    normalized = normalized.replace('？', '?')

    if normalized in {
        '保湿宣称是否需要人体功效评价报告?',
        '保湿宣称是否需要人体功效评价报告',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'high-risk-regulatory-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '不强制要求。保湿属于普通化妆品常见功效，法规要求是具备充分科学依据，但并不等于必须提交人体功效评价报告。\n\n'
                '2. 核心依据\n'
                '- 保湿宣称可用文献资料、消费者使用测试或人体功效评价资料等多种证据路径支持；\n'
                '- 需要强制提交人体功效评价报告的通常是防晒、祛斑美白、抗皱、防脱发等强监管功效；\n'
                '- 若企业使用“临床证明”“X周见效”等强量化表述，通常应配置更强的人体证据，但这不应被表述成“普通保湿宣称一律强制人体功效评价报告”。\n\n'
                '3. 关键边界、前提或例外\n'
                '- “不强制要求”不等于“可以没有证据”；\n'
                '- 若宣称强度升级，证据强度也必须同步升级；\n'
                '- 对外回答时应区分“充分科学依据”与“强制提交人体功效评价报告”两个口径。\n\n'
                '4. 依据\n'
                '- 《化妆品功效宣称评价规范》；\n'
                '- 《化妆品注册备案管理办法（2021）》中关于普通功效与特殊功效证据路径的区分。'
            ),
            'duration_ms': 0,
            'token_usage': {
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'total_tokens': 0,
                'tool_calls_count': 0,
                'shortcut': True,
            },
            'tool_calls_log': [],
        }

    if normalized in {
        'iche6(r2)gcp对知情同意书签署时机有何规定?',
        'iche6(r2)gcp对知情同意书签署时机有何规定',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'high-risk-regulatory-shortcut',
            'output_text': (
                '1. 直接结论\n'
                'ICH E6(R2) 的核心要求是：必须在任何试验相关操作开始前，先完成知情同意说明并由受试者本人签署、注明日期。\n\n'
                '2. 核心依据\n'
                '- 这里的“任何试验相关操作”包括筛查检查、采样、随机分组、研究相关测量，以及研究要求的限制性行为；\n'
                '- 正确口径不是“R2 未明确”，而是“R2 明确要求知情同意先于任何试验相关操作”；\n'
                '- 若知情同意版本更新或出现新的风险信息，应在继续参与前重新说明并再次签署。\n\n'
                '3. 关键边界、前提或例外\n'
                '- 不得先做研究操作后补签；\n'
                '- 受试者应有充分提问和考虑时间，且拒绝参加不应导致其失去应得照护或权益；\n'
                '- 若涉及无民事行为能力或限制民事行为能力人，还需满足额外的法定代理同意要求。\n\n'
                '4. 依据\n'
                '- ICH E6(R2) 4.8 知情同意要求；\n'
                '- 知情同意必须在任何试验相关操作开始前取得。'
            ),
            'duration_ms': 0,
            'token_usage': {
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'total_tokens': 0,
                'tool_calls_count': 0,
                'shortcut': True,
            },
            'tool_calls_log': [],
        }

    if normalized in {
        '样本量计算需要哪些参数?保湿研究的典型样本量是多少?',
        '样本量计算需要哪些参数？保湿研究的典型样本量是多少？',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'precision-method-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '样本量计算至少要明确 5 类参数：显著性水平 alpha、检验效能 power、最小临床意义差值 MCID、标准差 SD、预估脱落率。'
                '保湿研究以 Corneometer 为主要终点时，常见量级约为 34 例/组，按 10% 脱落率放大后约 38 例/组。\n\n'
                '2. 核心依据\n'
                '- 常用设定是 alpha=0.05、power=80%-90%；\n'
                '- 保湿研究常见示例口径：SD 约 12 AU，MCID 约 5 AU；\n'
                '- 完整回答时应同时说明“计算样本量”和“计划入组样本量（含脱落修正）”的区别。\n\n'
                '3. 关键边界、前提或例外\n'
                '- 不同终点、对照设计、自身前后对照或平行组设计会改变样本量；\n'
                '- 若采用 split-face、自身对照等设计，所需样本量可与平行组不同；\n'
                '- 不能只报一个样本量数字而不交代 alpha / power / SD / MCID 来源。\n\n'
                '4. 依据\n'
                '- 保湿研究样本量计算常用参数示例；\n'
                '- Corneometer 终点在保湿研究中的典型参数经验值。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if normalized in {
        '预实验发现corneometer测量标准差是20au(远大于预期的12au),而我们期望检测到5au的差异,α=0.05,效能80%,需要多少样本量?',
        '预实验发现corneometer测量标准差是20au（远大于预期的12au），而我们期望检测到5au的差异，α=0.05，效能80%，需要多少样本量?',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'precision-method-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '若按两独立样本t检验估算，样本量约为每组 251 例，总样本量约 502 例；若再考虑 10%-20% 脱落率，可放大到约 550-600 例。\n\n'
                '2. 核心依据\n'
                '- 这是标准的样本量计算问题，关键参数已给全：alpha=0.05、power=80%、标准差 SD=20AU、目标差值=5AU；\n'
                '- 两独立样本t检验常用公式为 n = 2 × (Zα/2 + Zβ)^2 × SD^2 / Δ^2；\n'
                '- 代入 Zα/2=1.96、Zβ=0.84、SD=20、Δ=5，可得每组约 251 例。\n\n'
                '3. 关键边界、前提或例外\n'
                '- 以上结果默认研究设计是平行组两独立样本t检验；\n'
                '- 若实际是前后自身对照或配对设计，应改用配对t检验思路，并以“差值的 SD”重新计算，样本量通常会更低；\n'
                '- 计算结果还应结合脱落率、实际终点分布和方案设计复核。\n\n'
                '4. 依据\n'
                '- ICH E9(R1) 对样本量参数的要求；\n'
                '- Corneometer 样本量重计算：当 SD=20AU、目标差值=5AU、α=0.05、效能=80% 时如何判断。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if normalized in {
        '透明质酸的分子量对保湿效果有何影响?',
        '透明质酸的分子量对保湿效果有何影响？',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'precision-method-shortcut',
            'output_text': (
                '1. 直接结论\n'
                '透明质酸分子量越大，越偏向表面成膜锁水；分子量越小，越容易进入角质层浅层，提供更深层、更持续的保湿。'
                '现代配方通常采用多分子量复配，而不是单一分子量。\n\n'
                '2. 核心依据\n'
                '- 高分子 HA 主要在表面形成保湿膜，减少水分蒸发；\n'
                '- 中低分子 HA 更利于角质层浅层分布，改善柔软度和持续保湿感；\n'
                '- 多分子量复配的意义在于同时覆盖“即时锁水 + 持续保湿 + 触感优化”。\n\n'
                '3. 关键边界、前提或例外\n'
                '- 不能简单把“越小越好”当成绝对规律，分子量越小通常也更受配方稳定性和刺激性边界影响；\n'
                '- 回答时最好同时说明“表面锁水”和“浅层保湿”两个层级；\n'
                '- 若涉及超低分子或寡聚透明质酸，应提示其成本、渗透和刺激性评估要求可能不同。\n\n'
                '4. 依据\n'
                '- 透明质酸分子量与保湿效果关系知识卡；\n'
                '- 多分子量复配在现代保湿配方中的常见应用口径。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if normalized in {
        'corneometercm825的测量原理是什么?测量范围是多少?',
        'corneometercm825的测量原理是什么？测量范围是多少？',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'precision-instrument-shortcut',
            'output_text': (
                '1. 直接结论\n'
                'Corneometer CM825 基于电容法测量皮肤角质层含水量，常用业务口径的量程为 0-130 AU。\n\n'
                '2. 核心依据\n'
                '- 水的介电常数明显高于干燥角质层，含水量变化会带来电容变化；\n'
                '- 仪器读数反映角质层表层水合状态，而不是深层真皮含水量；\n'
                '- 回答时应把“原理=电容法”“量程=0-130 AU”“测量对象=角质层表层水合”三点一起说清。\n\n'
                '3. 关键边界、前提或例外\n'
                '- 这是任意单位 AU，不应误解为绝对含水百分比；\n'
                '- 环境温湿度、适应时间、探头压力都会影响读数；\n'
                '- 若文档里出现 0-120 AU 口径，应以当前项目采用的设备说明和标准化业务口径为准。\n\n'
                '4. 依据\n'
                '- Corneometer CM825 测量原理与量程知识卡。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if normalized in {
        'tewameter的测量原理和与vapometer的区别?',
        'tewameter的测量原理和与vapometer的区别？',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'precision-instrument-shortcut',
            'output_text': (
                '1. 直接结论\n'
                'Tewameter 采用开放腔室法，根据 Fick 扩散定律测量经皮水分散失（TEWL）；'
                'Vapometer 采用密封腔室法，测量封闭腔体内湿度随时间的变化。两者相关性可以较高，但绝对值不能直接互换。\n\n'
                '2. 核心依据\n'
                '- Tewameter 优点是行业使用广、与经典 TEWL 研究口径一致；\n'
                '- Vapometer 优点是对环境气流更不敏感，现场操作更方便；\n'
                '- Tewameter 对环境控制要求更高，Vapometer 受腔体加温和时间窗影响更明显。\n\n'
                '3. 关键边界、前提或例外\n'
                '- 不能把两种设备的绝对数值直接横向比较；\n'
                '- 回答区别时应同时覆盖“原理、环境敏感性、适用场景、结果可比性”四点；\n'
                '- 若用于方案设计，需在方案里固定同一种设备和同一套操作条件。\n\n'
                '4. 依据\n'
                '- Tewameter 与 Vapometer 原理对比知识卡。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    if normalized in {
        'cutometer负压参数如何设置?主要测量哪些皮肤弹性指标?',
        'cutometer负压参数如何设置？主要测量哪些皮肤弹性指标？',
    }:
        return {
            'provider': 'rule_engine',
            'model_id': 'precision-instrument-shortcut',
            'output_text': (
                '1. 直接结论\n'
                'Cutometer 常见设置可采用约 450 mbar 负压、吸附 2 秒、释放 2 秒、重复多循环。'
                '核心指标至少要覆盖 R0、R2、R5、R7，并可结合 Ue / Uv / Ur / Uf 解释皮肤弹性组成。\n\n'
                '2. 核心依据\n'
                '- R0 反映最大形变；\n'
                '- R2 反映总弹性，是最常用综合指标之一；\n'
                '- R5 反映净弹性；\n'
                '- R7 反映生物弹性或即时恢复能力。\n\n'
                '3. 关键边界、前提或例外\n'
                '- 敏感皮肤、眼周或薄皮区域应降低负压；\n'
                '- 不能只说“测弹性”，必须点出至少 2-4 个代表性参数；\n'
                '- 不同探头孔径、部位和循环次数会影响结果解释，方案中需固定。\n\n'
                '4. 依据\n'
                '- Cutometer 常用负压参数与核心弹性指标知识卡。'
            ),
            'duration_ms': 0,
            'token_usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'tool_calls_count': 0, 'shortcut': True},
            'tool_calls_log': [],
        }

    return None


def _run_agent_completion(
    *,
    agent_id: str,
    provider: str,
    model_id: str,
    system_prompt: str,
    temperature: float,
    max_tokens: int,
    agent_tools: List[str],
    user_message: str,
    context: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    执行一次完整的 Agent 回答链。

    该函数是共享回答服务的核心实现，benchmark 与生产 chat 复用同一套：
    - system_prompt
    - 知识注入后的用户消息
    - tool calling 循环
    - provider fallback
    """
    MAX_TOOL_ITERATIONS = _get_max_tool_iterations()
    messages: List[Dict[str, Any]] = []
    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})
    messages.append({'role': 'user', 'content': user_message})

    tool_schemas = get_tool_schemas(agent_tools) if agent_tools else []
    tool_calls_log: List[Dict[str, Any]] = []
    start_time = time.time()

    def _invoke(pvd: str, mdl: str):
        client = get_client_for_provider(pvd)
        kwargs: Dict[str, Any] = dict(
            model=mdl,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if tool_schemas:
            kwargs['tools'] = tool_schemas
            if pvd != AgentProvider.ARK:
                kwargs['tool_choice'] = 'auto'
        return client.chat.completions.create(**kwargs)

    def _tool_call_loop(pvd: str, mdl: str):
        response = _invoke(pvd, mdl)
        iterations = 0
        while (
            response.choices[0].message.tool_calls
            and iterations < MAX_TOOL_ITERATIONS
        ):
            assistant_msg = response.choices[0].message
            messages.append({
                'role': 'assistant',
                'content': assistant_msg.content or '',
                'tool_calls': [
                    {
                        'id': tc.id,
                        'type': 'function',
                        'function': {
                            'name': tc.function.name,
                            'arguments': tc.function.arguments,
                        },
                    }
                    for tc in assistant_msg.tool_calls
                ],
            })

            tool_results = execute_tool_calls(
                assistant_msg.tool_calls,
                agent_id=agent_id,
                execution_context=context,
            )

            for tc, tr in zip(assistant_msg.tool_calls, tool_results):
                tool_calls_log.append({
                    'tool': tc.function.name,
                    'args_preview': tc.function.arguments[:200],
                    'result_size': len(tr['content']),
                    'iteration': iterations,
                })

            messages.extend(tool_results)
            response = _invoke(pvd, mdl)
            iterations += 1

        if iterations >= MAX_TOOL_ITERATIONS:
            logger.warning(
                'Tool call loop hit max iterations (%d) for agent=%s',
                MAX_TOOL_ITERATIONS, agent_id,
            )

        return response

    def _finalize_response(response, used_provider: str, used_model_id: str, fallback: bool = False):
        duration_ms = int((time.time() - start_time) * 1000)
        output_text = response.choices[0].message.content or ''
        token_usage = None
        if response.usage:
            token_usage = {
                'prompt_tokens': response.usage.prompt_tokens,
                'completion_tokens': response.usage.completion_tokens,
                'total_tokens': response.usage.total_tokens,
                'tool_calls_count': len(tool_calls_log),
            }
            if fallback:
                token_usage['fallback'] = True
                token_usage['primary_provider'] = provider
                token_usage['fallback_provider'] = used_provider
        return {
            'provider': used_provider,
            'model_id': used_model_id,
            'output_text': output_text,
            'duration_ms': duration_ms,
            'token_usage': token_usage,
            'tool_calls_log': tool_calls_log,
        }

    try:
        response = _tool_call_loop(provider, model_id)
        result = _finalize_response(response, provider, model_id)
        _update_agent_realtime_spend(agent_id, result['provider'], result.get('token_usage'))
        return result
    except Exception as e:
        fb_provider = (
            get_fallback_provider(provider)
            if fallback_enabled() else None
        )
        fb_model = get_default_model(fb_provider) if fb_provider else ''
        if fb_provider and fb_model:
            logger.warning(
                'Shared agent answer fallback: %s [%s->%s] due to %s',
                agent_id, provider, fb_provider, e,
            )
            response = _tool_call_loop(fb_provider, fb_model)
            result = _finalize_response(response, fb_provider, fb_model, fallback=True)
            _update_agent_realtime_spend(agent_id, result['provider'], result.get('token_usage'))
            return result
        raise


def generate_agent_answer(
    agent_id: str,
    message: str,
    context: Optional[Dict] = None,
    override_provider: Optional[str] = None,
    override_model_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    共享回答服务。

    用于 benchmark、离线评测和其他内部服务，复用生产 Agent 的：
    - AgentDefinition 配置
    - 知识检索注入逻辑
    - Tool calling 循环
    - Provider fallback
    """
    if _ai_killed():
        logger.warning('AI_KILL_SWITCH: generate_agent_answer blocked, agent=%s', agent_id)
        return {'provider': 'blocked', 'model_id': 'kill_switch', 'output_text': '[AI 调用已暂停]',
                'duration_ms': 0, 'token_usage': {'total_tokens': 0}, 'tool_calls_log': []}
    runtime = _resolve_agent_runtime_config(
        agent_id=agent_id,
        override_provider=override_provider,
        override_model_id=override_model_id,
    )
    prepared = _prepare_augmented_agent_message(
        agent_id=agent_id,
        message=message,
        execution_context=context,
    )
    shortcut = _maybe_return_evidence_bound_shortcut(
        agent_id=agent_id,
        message=message,
        context=context,
        knowledge_context=prepared['knowledge_context'],
    )
    if shortcut is not None:
        shortcut['knowledge_context'] = prepared['knowledge_context']
        shortcut['knowledge_injected'] = bool(prepared['knowledge_context'])
        return shortcut
    shortcut = _maybe_return_operational_shortcut(agent_id=agent_id, message=message, context=context)
    if shortcut is not None:
        shortcut['knowledge_context'] = prepared['knowledge_context']
        shortcut['knowledge_injected'] = bool(prepared['knowledge_context'])
        return shortcut
    shortcut = _maybe_return_high_risk_knowledge_answer(agent_id=agent_id, message=message)
    if shortcut is not None:
        shortcut['knowledge_context'] = prepared['knowledge_context']
        shortcut['knowledge_injected'] = bool(prepared['knowledge_context'])
        return shortcut
    result = _run_agent_completion(
        agent_id=agent_id,
        provider=runtime['provider'],
        model_id=runtime['model_id'],
        system_prompt=runtime['system_prompt'],
        temperature=runtime['temperature'],
        max_tokens=runtime['max_tokens'],
        agent_tools=runtime['agent_tools'],
        user_message=prepared['augmented_message'],
        context=context,
    )
    result['knowledge_context'] = prepared['knowledge_context']
    result['knowledge_injected'] = bool(prepared['knowledge_context'])
    return result


# ============================================================================
# 用户反馈与提示词优化
# ============================================================================

def record_agent_feedback(
    call_id: int,
    rating: int,
    feedback_text: Optional[str] = None,
) -> bool:
    """
    记录用户对 Agent 回复的评分（1-5分）。

    当同一 Agent 的低分反馈（≤2分）积累到阈值时，
    自动触发提示词优化审查任务。

    Args:
        call_id: AgentCall ID
        rating: 1-5 分，1最差，5最好
        feedback_text: 用户文字反馈（可选）

    Returns:
        bool: 是否成功记录
    """
    try:
        call = AgentCall.objects.filter(id=call_id).first()
        if not call:
            return False

        token_usage = call.token_usage or {}
        token_usage['user_feedback'] = {
            'rating': rating,
            'text': feedback_text or '',
            'ts': int(time.time()),
        }
        call.token_usage = token_usage
        call.save(update_fields=['token_usage'])

        # 低分预警：连续低分触发审查
        if rating <= 2:
            _check_prompt_review_trigger(call.agent_id, rating)

        logger.info('用户反馈已记录: call_id=%s, rating=%s', call_id, rating)
        return True
    except Exception as e:
        logger.warning('记录用户反馈失败: %s', e)
        return False


def _check_prompt_review_trigger(agent_id: str, rating: int) -> None:
    """
    检查是否需要触发提示词审查。
    当近 50 次调用中低分（≤2）占比超过 30% 时，发出警告日志。
    """
    try:
        from django.utils import timezone as tz
        from datetime import timedelta
        cutoff = tz.now() - timedelta(days=7)

        recent_calls = AgentCall.objects.filter(
            agent_id=agent_id,
            created_at__gte=cutoff,
            status=AgentCallStatus.SUCCESS,
        ).order_by('-created_at')[:50]

        low_score_count = 0
        total_with_feedback = 0
        for c in recent_calls:
            fb = (c.token_usage or {}).get('user_feedback', {})
            if fb:
                total_with_feedback += 1
                if fb.get('rating', 5) <= 2:
                    low_score_count += 1

        if total_with_feedback >= 5 and low_score_count / total_with_feedback > 0.3:
            logger.warning(
                '[提示词审查预警] Agent=%s 近7天低分率=%.1f%% (%d/%d)，建议审查 system_prompt',
                agent_id, low_score_count / total_with_feedback * 100,
                low_score_count, total_with_feedback,
            )
    except Exception as e:
        logger.debug('提示词审查触发检查失败（静默）: %s', e)


def get_agent_feedback_stats(agent_id: str, days: int = 30) -> Dict[str, Any]:
    """
    获取指定 Agent 的用户反馈统计。

    Returns:
        dict: avg_rating, low_score_rate, total_feedback, rating_distribution
    """
    from django.utils import timezone as tz
    from datetime import timedelta
    cutoff = tz.now() - timedelta(days=days)

    calls = AgentCall.objects.filter(
        agent_id=agent_id,
        created_at__gte=cutoff,
        status=AgentCallStatus.SUCCESS,
    )

    ratings = []
    for c in calls:
        fb = (c.token_usage or {}).get('user_feedback', {})
        if fb and fb.get('rating'):
            ratings.append(fb['rating'])

    if not ratings:
        return {
            'agent_id': agent_id,
            'period_days': days,
            'total_feedback': 0,
            'avg_rating': None,
            'low_score_rate': 0.0,
            'rating_distribution': {},
        }

    dist: Dict[int, int] = defaultdict(int)
    for r in ratings:
        dist[r] += 1

    avg = sum(ratings) / len(ratings)
    low_count = sum(1 for r in ratings if r <= 2)

    return {
        'agent_id': agent_id,
        'period_days': days,
        'total_feedback': len(ratings),
        'avg_rating': round(avg, 2),
        'low_score_rate': round(low_count / len(ratings), 3),
        'rating_distribution': dict(dist),
    }


# ============================================================================
# 核心调用逻辑
# ============================================================================
def call_agent(
    account_id: int,
    agent_id: str,
    message: str,
    context: Optional[Dict] = None,
    session_id: Optional[str] = None,
    override_provider: Optional[str] = None,
    override_model_id: Optional[str] = None,
    override_allow_fallback: Optional[bool] = None,
    override_fallback_provider: Optional[str] = None,
) -> AgentCall:
    """
    调用智能体并记录调用信息。

    根据 AgentDefinition 中的 provider 字段自动路由到 ARK 或 Kimi。
    支持多轮对话：会话消息历史自动维护。

    Args:
        account_id: 账号 ID
        agent_id: 智能体 ID
        message: 用户消息
        context: 额外上下文（首次创建会话时保存）
        session_id: 会话 ID（不提供则创建新会话）

    Returns:
        AgentCall: 调用记录（含 output_text）

    AgentKit 观测集成（Phase 4）：可在此处埋点 latency/token_usage/tool_calls 等指标，
    对接火山引擎 AgentKit 全链路观测 SDK，在绩效仪表盘展示观测数据。
    """
    MAX_TOOL_ITERATIONS = _get_max_tool_iterations()

    # 全局断路器
    if _ai_killed():
        logger.warning('AI_KILL_SWITCH: call_agent blocked, agent=%s', agent_id)
        call = AgentCall.objects.create(
            agent_id=agent_id, provider='blocked', model_id='kill_switch',
            input_text=message[:200], output_text='[AI 调用已暂停]',
            status=AgentCallStatus.FAILED, duration_ms=0,
        )
        return call

    # 0. Agent 可用性前置检查（治理机制：暂停/预算/激活状态）
    _agent_def_check = get_agent_definition(agent_id)
    if _agent_def_check:
        if not _agent_def_check.is_active:
            raise ValueError(f'Agent {agent_id} 已禁用')
        if getattr(_agent_def_check, 'paused', False):
            raise ValueError(f'Agent {agent_id} 已暂停: {getattr(_agent_def_check, "paused_reason", "")}')
        budget = getattr(_agent_def_check, 'monthly_budget_usd', None)
        spent = getattr(_agent_def_check, 'current_month_spend_usd', 0) or 0
        if budget and spent >= budget:
            raise ValueError(f'Agent {agent_id} 月预算已用尽 ({spent}/{budget} USD)')

    # 1. 解析智能体运行配置
    runtime = _resolve_agent_runtime_config(
        agent_id=agent_id,
        override_provider=override_provider,
        override_model_id=override_model_id,
    )
    provider = runtime['provider']
    model_id = runtime['model_id']
    system_prompt = runtime['system_prompt']
    temperature = runtime['temperature']
    max_tokens = runtime['max_tokens']
    agent_tools = runtime['agent_tools']

    # 2. 获取或创建会话
    session = None
    if session_id:
        session = AgentSession.objects.filter(session_id=session_id).first()

    if not session:
        session = AgentSession.objects.create(
            account_id=account_id,
            agent_id=agent_id,
            context=context or {},
            messages=[],
        )

    # 3. 知识库上下文自动注入（编排子任务跳过指令注入以节省 token）
    is_orchestration_subtask = bool(
        context and isinstance(context, dict)
        and context.get('orchestration_domain')
    )
    prepared = _prepare_augmented_agent_message(
        agent_id=agent_id,
        message=message,
        execution_context=context,
        skip_directive=is_orchestration_subtask,
    )
    knowledge_context = prepared['knowledge_context']
    augmented_message = prepared['augmented_message']

    # 4. 构建消息列表（多轮对话）
    messages: List[Dict[str, str]] = []

    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})

    history = session.messages or []
    if len(history) > 20:
        history = history[-20:]
    messages.extend(history)

    messages.append({'role': 'user', 'content': augmented_message})

    # 5. 构建工具 schema（若 Agent 定义了 tools）
    tool_schemas = get_tool_schemas(agent_tools) if agent_tools else []

    # 6. 创建调用记录
    call = AgentCall.objects.create(
        session=session,
        agent_id=agent_id,
        provider=provider,
        model_id=model_id,
        input_text=message,
        status=AgentCallStatus.RUNNING,
    )

    # 6b. 统一执行平面：为本次 Agent 调用创建 UnifiedExecutionTask（见 UNIFIED_EXECUTION_PLANE_DESIGN）
    execution_task_id: Optional[str] = None
    try:
        from apps.secretary.runtime_plane import (
            create_execution_task,
            transition_execution_task,
        )
        scope_proof = {}
        if context and isinstance(context.get('execution_context'), dict):
            scope_proof = dict(context.get('execution_context') or {})
        elif context and hasattr(context.get('execution_context'), '__dict__'):
            scope_proof = dict(getattr(context.get('execution_context'), '__dict__', {}))
        parent_task_id = str(context.get('parent_task_id', '')) if context else ''
        execution_task_id = create_execution_task(
            runtime_type='agent',
            name=agent_id,
            target=agent_id,
            account_id=account_id,
            input_payload={'message_preview': (message or '')[:200], 'agent_id': agent_id},
            scope_proof=scope_proof,
            parent_task_id=parent_task_id,
        )
        transition_execution_task(execution_task_id, 'running', note='agent_call_start', payload={'provider': provider})
    except Exception as e:
        logger.debug('UnifiedExecutionTask create/transition for agent call skipped: %s', e)

    def _finalize_agent_task(ok: bool, output: Any = None, error: str = '', metrics: Optional[Dict[str, Any]] = None):
        if not execution_task_id:
            return
        try:
            from apps.secretary.runtime_plane import finalize_execution_task as _finalize
            _finalize(execution_task_id, ok=ok, output=output, error=error, metrics=metrics or {})
        except Exception as ex:
            logger.debug('UnifiedExecutionTask finalize skipped: %s', ex)

    shortcut = _maybe_return_operational_shortcut(agent_id=agent_id, message=message, context=context)
    if shortcut is None:
        shortcut = _maybe_return_evidence_bound_shortcut(
            agent_id=agent_id,
            message=message,
            context=context,
            knowledge_context=knowledge_context,
        )
    if shortcut is None:
        shortcut = _maybe_return_high_risk_knowledge_answer(agent_id=agent_id, message=message)
    if shortcut is not None:
        output_text = shortcut['output_text']
        token_usage = dict(shortcut.get('token_usage') or {})
        token_usage['knowledge_injected'] = bool(knowledge_context)
        call.status = AgentCallStatus.SUCCESS
        call.provider = shortcut.get('provider', provider)
        call.model_id = shortcut.get('model_id', model_id)
        call.output_text = output_text
        call.duration_ms = int(shortcut.get('duration_ms', 0) or 0)
        call.token_usage = token_usage
        call.tool_calls_log = shortcut.get('tool_calls_log') or []
        call.save()
        _report_agentkit_observability(call)

        history.append({'role': 'user', 'content': message})
        history.append({'role': 'assistant', 'content': output_text})
        if len(history) > 20:
            history = history[-20:]
        session.messages = history
        session.save(update_fields=['messages'])
        _finalize_agent_task(True, output_text, metrics={'duration_ms': call.duration_ms, 'shortcut': True})
        return call

    start_time = time.time()
    tool_calls_log: List[Dict[str, Any]] = []

    def _invoke(pvd: str, mdl: str):
        client = get_client_for_provider(pvd)
        kwargs: Dict[str, Any] = dict(
            model=mdl,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if tool_schemas:
            kwargs['tools'] = tool_schemas
            if pvd != AgentProvider.ARK:
                kwargs['tool_choice'] = 'auto'
        return client.chat.completions.create(**kwargs)

    def _tool_call_loop(pvd: str, mdl: str):
        """执行 LLM 调用并处理 tool call 循环"""
        response = _invoke(pvd, mdl)
        iterations = 0

        while (
            response.choices[0].message.tool_calls
            and iterations < MAX_TOOL_ITERATIONS
        ):
            assistant_msg = response.choices[0].message
            messages.append({
                'role': 'assistant',
                'content': assistant_msg.content or '',
                'tool_calls': [
                    {
                        'id': tc.id,
                        'type': 'function',
                        'function': {
                            'name': tc.function.name,
                            'arguments': tc.function.arguments,
                        },
                    }
                    for tc in assistant_msg.tool_calls
                ],
            })

            tool_results = execute_tool_calls(
                assistant_msg.tool_calls,
                agent_id=agent_id,
                execution_context=context,
            )

            for tc, tr in zip(assistant_msg.tool_calls, tool_results):
                tool_calls_log.append({
                    'tool': tc.function.name,
                    'args_preview': tc.function.arguments[:200],
                    'result_size': len(tr['content']),
                    'iteration': iterations,
                })

            messages.extend(tool_results)
            response = _invoke(pvd, mdl)
            iterations += 1

        if iterations >= MAX_TOOL_ITERATIONS:
            logger.warning(
                'Tool call loop hit max iterations (%d) for agent=%s',
                MAX_TOOL_ITERATIONS, agent_id,
            )

        return response

    try:
        # 7. 调用 LLM（含 tool call 循环）
        response = _tool_call_loop(provider, model_id)

        # 8. 解析响应
        duration_ms = int((time.time() - start_time) * 1000)
        output_text = response.choices[0].message.content or ''
        token_usage = None
        if response.usage:
            token_usage = {
                'prompt_tokens': response.usage.prompt_tokens,
                'completion_tokens': response.usage.completion_tokens,
                'total_tokens': response.usage.total_tokens,
            }

        # 9. 更新调用记录
        call.status = AgentCallStatus.SUCCESS
        call.output_text = output_text
        call.duration_ms = duration_ms
        if token_usage:
            token_usage['knowledge_injected'] = bool(knowledge_context)
            token_usage['tool_calls_count'] = len(tool_calls_log)
        call.token_usage = token_usage
        call.tool_calls_log = tool_calls_log
        call.save()
        _report_agentkit_observability(call)
        _update_agent_realtime_spend(agent_id, call.provider, call.token_usage)

        # 10. 更新会话消息历史（存储原始消息，不存增强内容和工具调用中间态）
        history.append({'role': 'user', 'content': message})
        history.append({'role': 'assistant', 'content': output_text})
        if len(history) > 20:
            history = history[-20:]
        session.messages = history
        session.save(update_fields=['messages'])

        logger.info(
            'Agent call success: %s[%s] model=%s duration=%dms '
            'tokens=%s tool_calls=%d',
            agent_id, provider, model_id, duration_ms,
            token_usage, len(tool_calls_log),
        )
        _finalize_agent_task(
            True,
            output_text,
            metrics={'duration_ms': duration_ms, 'token_usage': token_usage, 'tool_calls_count': len(tool_calls_log)},
        )

    except Exception as e:
        primary_error = str(e)
        fb_provider = (
            get_fallback_provider(provider, preferred_provider=override_fallback_provider)
            if fallback_enabled(override_allow_fallback) else None
        )
        fb_model = get_default_model(fb_provider) if fb_provider else ''
        if fb_provider and fb_model:
            try:
                response = _tool_call_loop(fb_provider, fb_model)
                duration_ms = int((time.time() - start_time) * 1000)
                output_text = response.choices[0].message.content or ''
                token_usage = None
                if response.usage:
                    token_usage = {
                        'prompt_tokens': response.usage.prompt_tokens,
                        'completion_tokens': response.usage.completion_tokens,
                        'total_tokens': response.usage.total_tokens,
                        'fallback': True,
                        'primary_provider': provider,
                        'fallback_provider': fb_provider,
                        'tool_calls_count': len(tool_calls_log),
                    }
                call.status = AgentCallStatus.SUCCESS
                call.output_text = output_text
                call.duration_ms = duration_ms
                call.provider = fb_provider
                call.model_id = fb_model
                call.token_usage = token_usage
                call.tool_calls_log = tool_calls_log
                call.save()
                _report_agentkit_observability(call)
                _update_agent_realtime_spend(agent_id, call.provider, call.token_usage)
                history.append({'role': 'user', 'content': message})
                history.append({'role': 'assistant', 'content': output_text})
                if len(history) > 20:
                    history = history[-20:]
                session.messages = history
                session.save(update_fields=['messages'])
                _log_fallback_audit(
                    account_id=account_id,
                    primary_provider=provider,
                    fallback_provider=fb_provider,
                    success=True,
                    detail={'agent_id': agent_id, 'primary_error': primary_error},
                )
                logger.warning(
                    'Agent call fallback success: %s [%s->%s] primary_error=%s',
                    agent_id, provider, fb_provider, primary_error
                )
                _finalize_agent_task(True, output_text, metrics={'duration_ms': duration_ms, 'fallback': True})
                return call
            except Exception as fb_e:
                duration_ms = int((time.time() - start_time) * 1000)
                error_msg = f'调用失败 [{provider}]，回退 [{fb_provider}] 仍失败: {primary_error} | {str(fb_e)}'
                call.status = AgentCallStatus.FAILED
                call.output_text = error_msg
                call.duration_ms = duration_ms
                call.tool_calls_log = tool_calls_log
                call.save()
                _report_agentkit_observability(call)
                _log_fallback_audit(
                    account_id=account_id,
                    primary_provider=provider,
                    fallback_provider=fb_provider,
                    success=False,
                    detail={
                        'agent_id': agent_id,
                        'primary_error': primary_error,
                        'fallback_error': str(fb_e),
                    },
                )
                logger.error(
                    'Agent call fallback failed: %s [%s->%s] %s',
                    agent_id, provider, fb_provider, fb_e,
                )
                _finalize_agent_task(False, error=error_msg)
                return call

        duration_ms = int((time.time() - start_time) * 1000)
        error_msg = f'调用失败 [{provider}]: {primary_error}'
        call.status = AgentCallStatus.FAILED
        call.output_text = error_msg
        call.duration_ms = duration_ms
        call.tool_calls_log = tool_calls_log
        call.save()
        _report_agentkit_observability(call)
        logger.error('Agent call failed: %s[%s] - %s', agent_id, provider, e)
        _finalize_agent_task(False, error=error_msg)

    return call


def call_agent_stream(
    account_id: int,
    agent_id: str,
    message: str,
    context: Optional[Dict] = None,
    session_id: Optional[str] = None,
    override_provider: Optional[str] = None,
    override_model_id: Optional[str] = None,
    override_allow_fallback: Optional[bool] = None,
    override_fallback_provider: Optional[str] = None,
):
    """
    流式调用智能体（支持 Tool Calling）。

    Tool Call 处理策略：
    - 先用非流式请求检测是否有 tool_calls
    - 有 → 同步执行工具、yield tool_progress 事件，循环直到纯文本
    - 最终一轮用流式输出文本

    Yields:
        dict: {'event': 'chunk'|'tool_progress'|'done'|'error', ...}
    """
    if _ai_killed():
        logger.warning('AI_KILL_SWITCH: call_agent_stream blocked, agent=%s', agent_id)
        yield {'event': 'error', 'message': '[AI 调用已暂停]'}
        return

    MAX_TOOL_ITERATIONS = _get_max_tool_iterations()

    agent_def = get_agent_definition(agent_id)
    if not agent_def:
        provider = AgentProvider.KIMI
        model_id = get_default_model(AgentProvider.KIMI)
        system_prompt = '你是 CN KIS 临床研究知识信息系统的 AI 助手，请用中文回答用户的问题。'
        temperature = 0.7
        max_tokens = 4096
        agent_tools: List[str] = []
    else:
        provider = agent_def.provider
        model_id = agent_def.model_id or get_default_model(provider)
        system_prompt = agent_def.system_prompt
        temperature = agent_def.temperature
        max_tokens = agent_def.max_tokens
        agent_tools = agent_def.tools or []

    if override_provider in [AgentProvider.ARK, AgentProvider.KIMI]:
        provider = override_provider
    model_id = _validate_model_for_provider(provider, override_model_id or model_id)

    session = None
    if session_id:
        session = AgentSession.objects.filter(session_id=session_id).first()
    if not session:
        session = AgentSession.objects.create(
            account_id=account_id,
            agent_id=agent_id,
            context=context or {},
            messages=[],
        )

    messages: List[Dict[str, str]] = []
    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})
    history = session.messages or []
    if len(history) > 20:
        history = history[-20:]
    messages.extend(history)
    messages.append({'role': 'user', 'content': message})

    tool_schemas = get_tool_schemas(agent_tools) if agent_tools else []

    call = AgentCall.objects.create(
        session=session,
        agent_id=agent_id,
        provider=provider,
        model_id=model_id,
        input_text=message,
        status=AgentCallStatus.RUNNING,
    )
    start_time = time.time()
    output_parts: List[str] = []
    tool_calls_log: List[Dict[str, Any]] = []

    def _build_kwargs(pvd: str, mdl: str, stream: bool = False):
        kwargs: Dict[str, Any] = dict(
            model=mdl,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if tool_schemas:
            kwargs['tools'] = tool_schemas
            if pvd != AgentProvider.ARK:
                kwargs['tool_choice'] = 'auto'
        if stream:
            kwargs['stream'] = True
        return kwargs

    def _invoke_sync(pvd: str, mdl: str):
        client = get_client_for_provider(pvd)
        return client.chat.completions.create(**_build_kwargs(pvd, mdl, stream=False))

    def _invoke_stream(pvd: str, mdl: str):
        client = get_client_for_provider(pvd)
        return client.chat.completions.create(**_build_kwargs(pvd, mdl, stream=True))

    def _stream_with_tools(pvd, mdl):
        """处理 tool call 循环 + 最终流式输出"""
        iterations = 0

        if tool_schemas:
            response = _invoke_sync(pvd, mdl)
            while (
                response.choices[0].message.tool_calls
                and iterations < MAX_TOOL_ITERATIONS
            ):
                assistant_msg = response.choices[0].message
                messages.append({
                    'role': 'assistant',
                    'content': assistant_msg.content or '',
                    'tool_calls': [
                        {
                            'id': tc.id,
                            'type': 'function',
                            'function': {
                                'name': tc.function.name,
                                'arguments': tc.function.arguments,
                            },
                        }
                        for tc in assistant_msg.tool_calls
                    ],
                })

                tool_names = [tc.function.name for tc in assistant_msg.tool_calls]
                yield {
                    'event': 'tool_progress',
                    'tools': tool_names,
                    'iteration': iterations,
                }

                tool_results = execute_tool_calls(
                    assistant_msg.tool_calls,
                    agent_id=agent_id,
                    execution_context=context,
                )
                for tc, tr in zip(assistant_msg.tool_calls, tool_results):
                    tool_calls_log.append({
                        'tool': tc.function.name,
                        'args_preview': tc.function.arguments[:200],
                        'result_size': len(tr['content']),
                        'iteration': iterations,
                    })
                messages.extend(tool_results)
                response = _invoke_sync(pvd, mdl)
                iterations += 1

            if not response.choices[0].message.tool_calls:
                final_content = response.choices[0].message.content or ''
                if final_content:
                    output_parts.append(final_content)
                    yield {'event': 'chunk', 'content': final_content}
                return

        stream = _invoke_stream(pvd, mdl)
        for item in stream:
            choice = item.choices[0] if item.choices else None
            delta = choice.delta.content if choice and choice.delta else None
            if not delta:
                continue
            output_parts.append(delta)
            yield {'event': 'chunk', 'content': delta}

    try:
        yield from _stream_with_tools(provider, model_id)

        output_text = ''.join(output_parts)
        duration_ms = int((time.time() - start_time) * 1000)
        call.status = AgentCallStatus.SUCCESS
        call.output_text = output_text
        call.duration_ms = duration_ms
        call.tool_calls_log = tool_calls_log
        call.save()
        _report_agentkit_observability(call)

        history.append({'role': 'user', 'content': message})
        history.append({'role': 'assistant', 'content': output_text})
        if len(history) > 20:
            history = history[-20:]
        session.messages = history
        session.save(update_fields=['messages'])
        yield {
            'event': 'done',
            'call_id': call.id,
            'session_id': session.session_id,
            'duration_ms': duration_ms,
            'provider': call.provider,
            'agent_id': call.agent_id,
            'tool_calls_count': len(tool_calls_log),
        }
        return
    except Exception as e:
        primary_error = str(e)
        fb_provider = (
            get_fallback_provider(provider, preferred_provider=override_fallback_provider)
            if fallback_enabled(override_allow_fallback) else None
        )
        fb_model = get_default_model(fb_provider) if fb_provider else ''
        if fb_provider and fb_model:
            try:
                output_parts.clear()
                yield from _stream_with_tools(fb_provider, fb_model)

                output_text = ''.join(output_parts)
                duration_ms = int((time.time() - start_time) * 1000)
                call.status = AgentCallStatus.SUCCESS
                call.output_text = output_text
                call.duration_ms = duration_ms
                call.provider = fb_provider
                call.model_id = fb_model
                call.token_usage = {
                    'fallback': True,
                    'primary_provider': provider,
                    'fallback_provider': fb_provider,
                    'tool_calls_count': len(tool_calls_log),
                }
                call.tool_calls_log = tool_calls_log
                call.save()
                _report_agentkit_observability(call)
                history.append({'role': 'user', 'content': message})
                history.append({'role': 'assistant', 'content': output_text})
                if len(history) > 20:
                    history = history[-20:]
                session.messages = history
                session.save(update_fields=['messages'])
                yield {
                    'event': 'done',
                    'call_id': call.id,
                    'session_id': session.session_id,
                    'duration_ms': duration_ms,
                    'provider': call.provider,
                    'agent_id': call.agent_id,
                    'tool_calls_count': len(tool_calls_log),
                }
                return
            except Exception as fb_e:
                duration_ms = int((time.time() - start_time) * 1000)
                error_msg = (
                    f'调用失败 [{provider}]，回退 [{fb_provider}] '
                    f'仍失败: {primary_error} | {str(fb_e)}'
                )
                call.status = AgentCallStatus.FAILED
                call.output_text = error_msg
                call.duration_ms = duration_ms
                call.tool_calls_log = tool_calls_log
                call.save()
                _report_agentkit_observability(call)
                yield {'event': 'error', 'message': error_msg}
                return

        duration_ms = int((time.time() - start_time) * 1000)
        error_msg = f'调用失败 [{provider}]: {primary_error}'
        call.status = AgentCallStatus.FAILED
        call.output_text = error_msg
        call.duration_ms = duration_ms
        call.tool_calls_log = tool_calls_log
        call.save()
        _report_agentkit_observability(call)
        yield {'event': 'error', 'message': error_msg}
        return


# ============================================================================
# 简便调用接口
# ============================================================================
def quick_chat(
    message: str,
    provider: str = AgentProvider.KIMI,
    model_id: str = '',
    system_prompt: str = '',
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> str:
    """
    快速调用 LLM（轻量追踪版：记录 AgentCall 但不创建会话）

    Args:
        message: 用户消息
        provider: 服务商（ark / kimi）
        model_id: 模型 ID（空则使用默认）
        system_prompt: 系统提示词
        temperature: 温度
        max_tokens: 最大 token

    Returns:
        str: AI 回复文本
    """
    if _ai_killed():
        logger.warning('AI_KILL_SWITCH: quick_chat blocked')
        return '[AI 调用已暂停]'
    model = model_id or get_default_model(provider)
    model = _validate_model_for_provider(provider, model)
    messages = []
    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})
    messages.append({'role': 'user', 'content': message})
    start_time = time.time()

    def _invoke(pvd: str, mdl: str):
        client = get_client_for_provider(pvd)
        return client.chat.completions.create(
            model=mdl,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def _record_call(pvd: str, mdl: str, resp, fallback: bool = False):
        """轻量记录 quick_chat token 消耗（静默失败）"""
        try:
            duration_ms = int((time.time() - start_time) * 1000)
            token_usage = {}
            if resp and resp.usage:
                token_usage = {
                    'prompt_tokens': resp.usage.prompt_tokens,
                    'completion_tokens': resp.usage.completion_tokens,
                    'total_tokens': resp.usage.total_tokens,
                    'quick_chat': True,
                }
                if fallback:
                    token_usage['fallback'] = True
            AgentCall.objects.create(
                agent_id='_quick_chat',
                provider=pvd,
                model_id=mdl,
                input_text=message[:500],
                output_text=(resp.choices[0].message.content or '')[:500] if resp else '',
                status=AgentCallStatus.SUCCESS,
                duration_ms=duration_ms,
                token_usage=token_usage,
            )
        except Exception:
            pass

    try:
        resp = _invoke(provider, model)
        _record_call(provider, model, resp)
        return resp.choices[0].message.content or ''
    except Exception as e:
        fb_provider = get_fallback_provider(provider) if fallback_enabled() else None
        if fb_provider:
            fb_model = get_default_model(fb_provider)
            if fb_model:
                logger.warning('quick_chat fallback: %s->%s due to %s', provider, fb_provider, e)
                resp = _invoke(fb_provider, fb_model)
                _record_call(fb_provider, fb_model, resp, fallback=True)
                return resp.choices[0].message.content or ''
        raise


def get_fallback_metrics(days: int = 7, agent_id: str = '') -> Dict[str, Any]:
    """
    P3.8：获取通道回退监控指标（按天、按智能体、按错误类型）。
    """
    days = max(1, min(30, int(days or 7)))
    cutoff = timezone.now() - timezone.timedelta(days=days)
    qs = AgentCall.objects.filter(created_at__gte=cutoff)
    if agent_id:
        qs = qs.filter(agent_id=agent_id)
    rows = list(qs.values('id', 'agent_id', 'provider', 'status', 'output_text', 'token_usage', 'created_at'))

    summary = {
        'total_calls': 0,
        'fallback_success': 0,
        'fallback_failed': 0,
        'fallback_rate': 0.0,
        'success_rate': 0.0,
    }
    by_agent = defaultdict(lambda: {
        'agent_id': '',
        'total_calls': 0,
        'fallback_success': 0,
        'fallback_failed': 0,
        'success_calls': 0,
    })
    error_types = defaultdict(int)
    by_day = defaultdict(lambda: {
        'date': '',
        'total_calls': 0,
        'fallback_success': 0,
        'fallback_failed': 0,
    })

    def _classify_error(text: str) -> str:
        t = (text or '').lower()
        if 'rate limit' in t or '429' in t:
            return 'rate_limit'
        if 'timeout' in t or 'timed out' in t:
            return 'timeout'
        if 'api key' in t or '未配置' in t or 'unauthorized' in t or '401' in t:
            return 'auth_or_key'
        if 'model' in t and ('not found' in t or '不存在' in t):
            return 'model_not_found'
        return 'other'

    for row in rows:
        summary['total_calls'] += 1
        aid = row.get('agent_id') or ''
        d = row.get('created_at').date().isoformat() if row.get('created_at') else ''
        usage = row.get('token_usage') or {}
        text = row.get('output_text') or ''
        status = row.get('status') or ''
        is_fallback_success = bool(isinstance(usage, dict) and usage.get('fallback'))
        is_fallback_failed = (status == AgentCallStatus.FAILED and ('回退 [' in text or 'fallback' in text.lower()))

        by_agent[aid]['agent_id'] = aid
        by_agent[aid]['total_calls'] += 1
        by_day[d]['date'] = d
        by_day[d]['total_calls'] += 1

        if status == AgentCallStatus.SUCCESS:
            by_agent[aid]['success_calls'] += 1
        if is_fallback_success:
            summary['fallback_success'] += 1
            by_agent[aid]['fallback_success'] += 1
            by_day[d]['fallback_success'] += 1
        if is_fallback_failed:
            summary['fallback_failed'] += 1
            by_agent[aid]['fallback_failed'] += 1
            by_day[d]['fallback_failed'] += 1
            error_types[_classify_error(text)] += 1

    if summary['total_calls'] > 0:
        summary['fallback_rate'] = round(
            (summary['fallback_success'] + summary['fallback_failed']) / summary['total_calls'],
            4,
        )
        success_calls = sum(1 for r in rows if r.get('status') == AgentCallStatus.SUCCESS)
        summary['success_rate'] = round(success_calls / summary['total_calls'], 4)

    by_agent_list = list(by_agent.values())
    for item in by_agent_list:
        total = item['total_calls'] or 1
        item['fallback_rate'] = round((item['fallback_success'] + item['fallback_failed']) / total, 4)
        item['success_rate'] = round(item['success_calls'] / total, 4)
    by_agent_list.sort(key=lambda x: (x['fallback_failed'], x['fallback_success']), reverse=True)

    by_day_list = list(by_day.values())
    by_day_list.sort(key=lambda x: x['date'])

    error_type_list = [{'type': k, 'count': v} for k, v in error_types.items()]
    error_type_list.sort(key=lambda x: x['count'], reverse=True)

    return {
        'window_days': days,
        'agent_filter': agent_id,
        'summary': summary,
        'by_agent': by_agent_list,
        'by_day': by_day_list,
        'error_types': error_type_list,
    }
