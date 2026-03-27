"""
Agent Tool Executor — 安全沙箱执行引擎

职责：
  1. 接收 tool_call（来自 LLM 响应），解析参数并调用 handler
  2. 执行超时保护（默认 30 秒）
  3. 输出大小限制（默认 4KB）
  4. 审计日志（每次工具调用记录）
  5. 权限检查（继承 SkillExecutionContext）
"""
import json
import inspect
import logging
import signal
import time
from typing import Any, Dict, List, Optional

from .tool_registry import get_handler

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30
MAX_OUTPUT_SIZE = 4096
TOOL_TIMEOUT_OVERRIDES = {
    'mcp_web_extract': 60,
    'mcp_web_search': 45,
}

WRITE_TOOLS = frozenset({'knowledge_create', 'knowledge_entity_create'})
WRITE_ALLOWED_AGENTS = frozenset({
    'knowledge-agent', 'knowledge-ingestion-agent',
    'consumer-insight-agent', 'market-intelligence-agent',
})

ORCHESTRATION_TOOLS = frozenset({'agent_invoke'})
ORCHESTRATION_ALLOWED_AGENTS = frozenset({'orchestration-agent'})

# 需要执行上下文且缺失时 fail-closed 的工具（跨项目/知识/写操作）
CONTEXT_REQUIRED_TOOLS = frozenset({
    'knowledge_search', 'knowledge_create', 'knowledge_entity_create',
    'databus_entity', 'databus_search', 'databus_snapshot', 'databus_audit_trail',
    'claw_skill_invoke', 'agent_invoke',
})


class ToolExecutionError(Exception):
    pass


class ToolTimeoutError(ToolExecutionError):
    pass


def _audit_tool_call(
    tool_name: str,
    agent_id: str,
    arguments: dict,
    result_summary: dict,
    execution_context: Optional[Any] = None,
) -> None:
    """持久化工具调用审计（全链路 trace）。"""
    try:
        from apps.audit.services import log_audit
        from apps.audit.models import AuditAction
        import time as _time
        account_id = 0
        account_name = 'system'
        if execution_context is not None:
            account_id = getattr(execution_context, 'account_id', 0) or 0
            account_name = getattr(execution_context, 'account_username', '') or str(account_id)
        resource_id = f'{agent_id}:{tool_name}:{_time.time():.0f}'
        log_audit(
            account_id=account_id,
            account_name=account_name or str(account_id),
            action=AuditAction.VIEW,
            resource_type='agent_tool_call',
            resource_id=resource_id,
            resource_name=tool_name,
            description=f'agent={agent_id} tool={tool_name}',
            new_value={
                'tool': tool_name,
                'agent_id': agent_id,
                'argument_keys': list(arguments.keys()),
                **result_summary,
            },
        )
    except Exception as e:
        logger.debug('Tool call audit failed: %s', e)


def execute_tool(
    tool_name: str,
    arguments_json: str,
    agent_id: str = '',
    execution_context: Optional[Any] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> str:
    """
    安全执行一个工具调用，返回结果字符串（供 LLM 消费）。

    Args:
        tool_name: 工具名称
        arguments_json: JSON 格式的参数字符串（来自 LLM function call）
        agent_id: 调用方 Agent ID（用于权限检查）
        execution_context: 用户执行上下文（SkillExecutionContext）
        timeout: 最大执行时间（秒）

    Returns:
        str: JSON 格式的结果字符串
    """
    start_time = time.time()

    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except json.JSONDecodeError as e:
        return json.dumps({'error': f'参数解析失败: {e}'}, ensure_ascii=False)

    handler = get_handler(tool_name)
    if not handler:
        return json.dumps(
            {'error': f'未知工具: {tool_name}'},
            ensure_ascii=False,
        )

    if tool_name in WRITE_TOOLS and agent_id not in WRITE_ALLOWED_AGENTS:
        return json.dumps(
            {'error': f'Agent {agent_id} 无权调用写入工具 {tool_name}'},
            ensure_ascii=False,
        )

    if tool_name in ORCHESTRATION_TOOLS and agent_id not in ORCHESTRATION_ALLOWED_AGENTS:
        return json.dumps(
            {'error': f'Agent {agent_id} 无权调用编排工具 {tool_name}，仅 orchestration-agent 可用'},
            ensure_ascii=False,
        )

    # Fail-closed: 跨项目/知识/写操作必须携带有效 execution_context
    if tool_name in CONTEXT_REQUIRED_TOOLS:
        effective = None
        if execution_context is not None:
            if isinstance(execution_context, dict):
                effective = execution_context.get('execution_context') or execution_context
            else:
                effective = execution_context
        if effective is None or (isinstance(effective, dict) and effective.get('account_id') is None):
            logger.warning('Tool execution fail-closed: tool=%s agent=%s missing execution_context', tool_name, agent_id)
            return json.dumps(
                {'error': '执行上下文缺失，该工具禁止执行', 'tool': tool_name},
                ensure_ascii=False,
            )

    effective_timeout = max(timeout, TOOL_TIMEOUT_OVERRIDES.get(tool_name, timeout))

    try:
        result = _run_with_timeout(
            handler,
            args,
            effective_timeout,
            execution_context=execution_context,
            agent_id=agent_id,
        )
    except ToolTimeoutError:
        elapsed = int((time.time() - start_time) * 1000)
        logger.warning(
            'Tool execution timeout: tool=%s, agent=%s, timeout=%ds, elapsed=%dms',
            tool_name, agent_id, effective_timeout, elapsed,
        )
        return json.dumps(
            {'error': f'工具执行超时 ({effective_timeout}s)', 'tool': tool_name},
            ensure_ascii=False,
        )
    except Exception as e:
        elapsed = int((time.time() - start_time) * 1000)
        logger.error(
            'Tool execution error: tool=%s, agent=%s, error=%s, elapsed=%dms',
            tool_name, agent_id, e, elapsed,
        )
        return json.dumps(
            {'error': f'工具执行失败: {e}', 'tool': tool_name},
            ensure_ascii=False,
        )

    elapsed_ms = int((time.time() - start_time) * 1000)

    result_json = json.dumps(result, ensure_ascii=False, default=str)
    if len(result_json) > MAX_OUTPUT_SIZE:
        result_json = result_json[:MAX_OUTPUT_SIZE - 50] + '...(结果已截断)'

    logger.info(
        'Tool executed: tool=%s, agent=%s, elapsed=%dms, output_size=%d',
        tool_name, agent_id, elapsed_ms, len(result_json),
    )

    _audit_tool_call(
        tool_name=tool_name,
        agent_id=agent_id,
        arguments=args,
        result_summary={'output_size': len(result_json), 'elapsed_ms': elapsed_ms},
        execution_context=execution_context,
    )
    return result_json


def execute_tool_calls(
    tool_calls: list,
    agent_id: str = '',
    execution_context: Optional[Any] = None,
) -> List[Dict[str, str]]:
    """
    批量执行 LLM 返回的 tool_calls，返回 OpenAI 格式的 tool result messages。

    Args:
        tool_calls: LLM 响应中的 tool_calls 列表
        agent_id: Agent ID
        execution_context: 执行上下文

    Returns:
        list[dict]: OpenAI 格式的 tool result messages
    """
    results = []
    for tc in tool_calls:
        func = tc.function
        result_content = execute_tool(
            tool_name=func.name,
            arguments_json=func.arguments,
            agent_id=agent_id,
            execution_context=execution_context,
        )
        results.append({
            'role': 'tool',
            'tool_call_id': tc.id,
            'content': result_content,
        })
    return results


def _run_with_timeout(
    handler,
    args: dict,
    timeout: int,
    execution_context: Optional[Any] = None,
    agent_id: str = '',
):
    """
    带超时保护的函数执行。
    Unix 环境下使用 signal.alarm，其他环境直接执行（降级无超时保护）。
    """
    if not hasattr(signal, 'SIGALRM'):
        return _invoke_handler(handler, args, execution_context=execution_context, agent_id=agent_id)

    def _timeout_handler(signum, frame):
        raise ToolTimeoutError(f'Execution exceeded {timeout}s')

    old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(timeout)
    try:
        result = _invoke_handler(handler, args, execution_context=execution_context, agent_id=agent_id)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
    return result


def _invoke_handler(
    handler,
    args: dict,
    execution_context: Optional[Any] = None,
    agent_id: str = '',
):
    sig = inspect.signature(handler)
    kwargs = {}
    if 'execution_context' in sig.parameters:
        kwargs['execution_context'] = execution_context
    if 'agent_id' in sig.parameters:
        kwargs['agent_id'] = agent_id
    return handler(args, **kwargs)
