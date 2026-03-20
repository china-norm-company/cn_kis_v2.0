"""
智能体网关 API

双通道架构：火山引擎 ARK（复杂）+ Kimi（轻量）

端点：
- POST /agents/chat                          发送消息给智能体
- GET  /agents/list                          列出可用智能体
- GET  /agents/sessions                      列出用户的聊天会话
- GET  /agents/sessions/{session_id}/history  获取聊天历史
"""
from ninja import Router, Schema, Query
from typing import Optional, Dict, List, Any
from datetime import datetime
from pydantic import ConfigDict
from apps.identity.decorators import require_permission
from celery.result import AsyncResult

router = Router()


# ============================================================================
# Schema
# ============================================================================
class AgentChatIn(Schema):
    model_config = ConfigDict(protected_namespaces=())

    agent_id: str
    message: str
    context: Optional[Dict] = None
    session_id: Optional[str] = None
    provider: Optional[str] = None
    model_id: Optional[str] = None
    allow_fallback: Optional[bool] = None
    fallback_provider: Optional[str] = None


class AgentChatOut(Schema):
    response: str
    session_id: str
    agent_id: str
    provider: str
    call_id: int


class AgentChatAsyncOut(Schema):
    call_id: str
    task_id: str
    status: str


class AgentCallPollOut(Schema):
    call_id: str
    task_id: str
    status: str
    output_text: str
    chunks: List[str]
    duration_ms: Optional[int] = None
    agent_id: Optional[str] = None
    provider: Optional[str] = None


def _verify_account_from_request(request) -> Optional[int]:
    from apps.identity.services import verify_jwt_token

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header[7:]
    payload = verify_jwt_token(token)
    if not payload:
        return None
    return payload.get('user_id')


def _chunk_text(text: str, size: int = 120) -> List[str]:
    if not text:
        return []
    return [text[i:i + size] for i in range(0, len(text), size)]


# ============================================================================
# 端点
# ============================================================================
@router.post('/chat', summary='发送消息给智能体')
@require_permission('agent.chat.use')
def agent_chat(request, data: AgentChatIn):
    """
    发送消息给智能体（主要 AI 聊天端点）。

    根据 agent_id 对应的 AgentDefinition 自动路由到火山引擎 ARK 或 Kimi。
    支持多轮对话（通过 session_id 维持上下文）。
    """
    from .services import call_agent
    from apps.identity.services import verify_jwt_token

    # 鉴权
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return 401, {'code': 401, 'msg': '未授权'}

    token = auth_header[7:]
    payload = verify_jwt_token(token)
    if not payload:
        return 401, {'code': 401, 'msg': 'Token无效或已过期'}

    account_id = payload.get('user_id')
    # 强制注入执行上下文，供工具层 fail-closed 与数据范围过滤
    context = dict(data.context or {})
    try:
        from apps.identity.models import Account
        from apps.secretary.execution_context import SkillExecutionContext
        account = Account.objects.filter(id=account_id, is_deleted=False).first()
        if account:
            context['execution_context'] = SkillExecutionContext.from_account(account).to_dict()
    except Exception:
        pass

    try:
        call = call_agent(
            account_id=account_id,
            agent_id=data.agent_id,
            message=data.message,
            context=context,
            session_id=data.session_id,
            override_provider=(data.provider or '').strip() or None,
            override_model_id=(data.model_id or '').strip() or None,
            override_allow_fallback=data.allow_fallback,
            override_fallback_provider=(data.fallback_provider or '').strip() or None,
        )

        session_id = call.session.session_id if call.session else ''

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'response': call.output_text,
                'session_id': session_id,
                'agent_id': call.agent_id,
                'provider': call.provider,
                'call_id': call.id,
                'duration_ms': call.duration_ms,
                'status': call.status,
            },
        }
    except Exception as e:
        return 500, {'code': 500, 'msg': f'调用智能体失败: {str(e)}'}


@router.post('/chat/async', summary='异步发送消息给智能体')
@require_permission('agent.chat.use')
def agent_chat_async(request, data: AgentChatIn):
    """异步聊天：立即返回 task_id，前端轮询 /calls/{call_id} 获取状态。"""
    from .tasks import call_agent_async

    account_id = _verify_account_from_request(request)
    if not account_id:
        return 401, {'code': 401, 'msg': '未授权'}

    task = call_agent_async.delay(
        account_id=account_id,
        agent_id=data.agent_id,
        message=data.message,
        context=data.context or {},
        session_id=data.session_id,
        override_provider=(data.provider or '').strip() or None,
        override_model_id=(data.model_id or '').strip() or None,
        override_allow_fallback=data.allow_fallback,
        override_fallback_provider=(data.fallback_provider or '').strip() or None,
    )
    # call_id 与 task_id 保持一致，便于前端只维护一个轮询 ID。
    return {
        'code': 200,
        'msg': 'ACCEPTED',
        'data': {
            'call_id': task.id,
            'task_id': task.id,
            'status': 'queued',
        },
    }


@router.get('/calls/{call_id}', summary='查询异步聊天状态')
@require_permission('agent.chat.use')
def get_agent_call(request, call_id: str):
    """查询异步聊天状态，支持 task_id 或最终 AgentCall 主键。"""
    from .models import AgentCall

    account_id = _verify_account_from_request(request)
    if not account_id:
        return 401, {'code': 401, 'msg': '未授权'}

    # 先尝试当作 AgentCall 主键
    if call_id.isdigit():
        call = AgentCall.objects.filter(id=int(call_id)).select_related('session').first()
        if not call:
            return 404, {'code': 404, 'msg': '调用记录不存在'}
        session = call.session
        if session and session.account_id != account_id:
            return 403, {'code': 403, 'msg': '无权限访问该调用记录'}
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'call_id': str(call.id),
                'task_id': '',
                'status': call.status,
                'output_text': call.output_text or '',
                'chunks': _chunk_text(call.output_text or ''),
                'duration_ms': call.duration_ms,
                'agent_id': call.agent_id,
                'provider': call.provider,
            },
        }

    # 再尝试当作 celery task_id
    task = AsyncResult(call_id)
    if not task.ready():
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'call_id': call_id,
                'task_id': call_id,
                'status': 'running',
                'output_text': '',
                'chunks': [],
                'duration_ms': None,
                'agent_id': None,
                'provider': None,
            },
        }

    if task.failed():
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'call_id': call_id,
                'task_id': call_id,
                'status': 'failed',
                'output_text': str(task.result or ''),
                'chunks': _chunk_text(str(task.result or '')),
                'duration_ms': None,
                'agent_id': None,
                'provider': None,
            },
        }

    result: Any = task.result if isinstance(task.result, dict) else {}
    agent_call_id = result.get('call_id')
    if not agent_call_id:
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'call_id': call_id,
                'task_id': call_id,
                'status': 'success',
                'output_text': '',
                'chunks': [],
                'duration_ms': None,
                'agent_id': None,
                'provider': None,
            },
        }

    call = AgentCall.objects.filter(id=agent_call_id).select_related('session').first()
    if not call:
        return 404, {'code': 404, 'msg': '调用记录不存在'}
    session = call.session
    if session and session.account_id != account_id:
        return 403, {'code': 403, 'msg': '无权限访问该调用记录'}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'call_id': str(call.id),
            'task_id': call_id,
            'status': call.status,
            'output_text': call.output_text or '',
            'chunks': _chunk_text(call.output_text or ''),
            'duration_ms': call.duration_ms,
            'agent_id': call.agent_id,
            'provider': call.provider,
        },
    }


@router.get('/list', summary='列出可用智能体')
@require_permission('agent.agent.read')
def list_agents(request):
    """列出所有已激活的智能体"""
    from .services import list_active_agents

    agents = list_active_agents()

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'agent_id': agent.agent_id,
                    'name': agent.name,
                    'description': agent.description,
                    'capabilities': agent.capabilities,
                    'provider': agent.provider,
                    'is_active': agent.is_active,
                }
                for agent in agents
            ],
        },
    }


@router.get('/providers', summary='列出可用推理通道与模型')
@require_permission('agent.agent.read')
def list_providers(request):
    """返回 ARK/Kimi 可用性与模型列表，供前端让用户选择。"""
    from .services import get_provider_catalog
    return {
        'code': 200,
        'msg': 'OK',
        'data': get_provider_catalog(),
    }


@router.get('/fallback/metrics', summary='通道回退监控指标')
@require_permission('agent.agent.read')
def fallback_metrics(request, days: int = 7, agent_id: str = ''):
    """P3.8：返回回退率、失败率、按天趋势与错误类型。"""
    from .services import get_fallback_metrics
    result = get_fallback_metrics(days=days, agent_id=agent_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/sessions', summary='列出用户的聊天会话')
@require_permission('agent.session.read')
def list_sessions(request):
    """列出当前用户的所有聊天会话"""
    from .models import AgentSession
    from apps.identity.services import verify_jwt_token

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return 401, {'code': 401, 'msg': '未授权'}

    token = auth_header[7:]
    payload = verify_jwt_token(token)
    if not payload:
        return 401, {'code': 401, 'msg': 'Token无效或已过期'}

    account_id = payload.get('user_id')
    sessions = AgentSession.objects.filter(account_id=account_id).order_by('-created_at')[:50]

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'session_id': session.session_id,
                    'account_id': session.account_id,
                    'agent_id': session.agent_id,
                    'context': session.context,
                    'created_at': session.created_at.isoformat(),
                    'call_count': session.calls.count(),
                }
                for session in sessions
            ],
        },
    }


@router.get('/sessions/{session_id}/history', summary='获取聊天历史')
@require_permission('agent.session.read')
def get_session_history(request, session_id: str):
    """获取指定会话的聊天历史"""
    from .models import AgentSession, AgentCall
    from apps.identity.services import verify_jwt_token

    session = AgentSession.objects.filter(session_id=session_id).first()
    if not session:
        return 404, {'code': 404, 'msg': '会话不存在'}

    # 权限校验
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        payload = verify_jwt_token(token)
        if payload and payload.get('user_id') != session.account_id:
            return 403, {'code': 403, 'msg': '无权限访问此会话'}

    calls = AgentCall.objects.filter(session=session).order_by('created_at')[:100]

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'session_id': session.session_id,
            'agent_id': session.agent_id,
            'context': session.context,
            'created_at': session.created_at.isoformat(),
            'history': [
                {
                    'id': call.id,
                    'input_text': call.input_text,
                    'output_text': call.output_text,
                    'provider': call.provider,
                    'status': call.status,
                    'duration_ms': call.duration_ms,
                    'created_at': call.created_at.isoformat(),
                }
                for call in calls
            ],
        },
    }


# ============================================================================
# 嵌入式 AI 触发 (D1)
# ============================================================================
@router.post('/trigger-insight', summary='上下文AI触发')
@require_permission('agent.session.create')
def trigger_contextual_insight(request, agent_id: str = '', context_type: str = '', context_data: dict = {}):
    """D1: 基于业务上下文触发 Agent 分析"""
    from apps.identity.services import verify_jwt_token

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    token = auth_header[7:]
    payload = verify_jwt_token(token)
    if not payload:
        return 401, {'code': 401, 'msg': 'Token无效或已过期', 'data': None}



# ============================================================================
# 用户反馈 API
# ============================================================================
class AgentFeedbackIn(Schema):
    call_id: int
    rating: int          # 1-5
    feedback_text: Optional[str] = None


@router.post('/calls/{call_id}/feedback', summary='提交 Agent 回复评分')
@require_permission('agent.chat.use')
def submit_agent_feedback(request, call_id: int, payload: AgentFeedbackIn):
    """用户对 Agent 回复打分（1-5分），支持文字反馈，低分触发提示词审查预警。"""
    from apps.identity.services import verify_jwt_token
    from .services import record_agent_feedback

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    if not (1 <= payload.rating <= 5):
        return {'code': 400, 'msg': 'rating 必须在 1-5 之间', 'data': None}

    if payload.call_id != call_id:
        return {'code': 400, 'msg': 'call_id 不一致', 'data': None}

    ok = record_agent_feedback(
        call_id=call_id,
        rating=payload.rating,
        feedback_text=payload.feedback_text,
    )

    if not ok:
        return {'code': 404, 'msg': '调用记录不存在', 'data': None}

    return {'code': 200, 'msg': '反馈已记录', 'data': {'call_id': call_id, 'rating': payload.rating}}


@router.get('/feedback/stats', summary='获取 Agent 反馈统计')
@require_permission('agent.agent.read')
def get_feedback_stats(request, agent_id: str = '', days: int = 30):
    """获取指定 Agent 近 N 天的用户满意度统计。"""
    from .services import get_agent_feedback_stats, list_active_agents

    if agent_id:
        stats = get_agent_feedback_stats(agent_id, days)
        return {'code': 200, 'msg': 'OK', 'data': stats}

    # 不指定 agent_id 时，返回所有 Agent 的汇总
    agents = list_active_agents()
    all_stats = [get_agent_feedback_stats(a.agent_id, days) for a in agents]
    all_stats.sort(key=lambda x: (x.get('avg_rating') or 0), reverse=False)
    return {'code': 200, 'msg': 'OK', 'data': {'agents': all_stats, 'period_days': days}}
