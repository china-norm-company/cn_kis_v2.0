"""
agent_gateway SSE 视图。
"""
import json
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.identity.decorators import require_permission
from apps.identity.services import verify_jwt_token
from .services import call_agent_stream


def _sse_pack(event: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


@csrf_exempt
@require_permission('agent.chat.use')
def chat_stream(request):
    """
    POST /api/v1/agents/chat/stream
    """
    if request.method != 'POST':
        return JsonResponse({'code': 405, 'msg': 'Method Not Allowed'}, status=405)

    try:
        body = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        body = {}

    message = (body.get('message') or '').strip()
    agent_id = (body.get('agent_id') or '').strip()
    if not message or not agent_id:
        return JsonResponse({'code': 400, 'msg': 'agent_id 和 message 必填'}, status=400)

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    token = auth_header[7:] if auth_header.startswith('Bearer ') else ''
    jwt_payload = verify_jwt_token(token)
    account_id = jwt_payload.get('user_id') if jwt_payload else getattr(request, 'user_id', None)
    context = body.get('context') or {}
    session_id = (body.get('session_id') or '').strip() or None
    provider = (body.get('provider') or '').strip() or None
    model_id = (body.get('model_id') or '').strip() or None
    allow_fallback = body.get('allow_fallback')
    fallback_provider = (body.get('fallback_provider') or '').strip() or None

    def event_stream():
        # 建立连接时先发一个 ready 事件，便于客户端确认连接成功
        yield _sse_pack('ready', {'ok': True})
        for evt in call_agent_stream(
            account_id=account_id,
            agent_id=agent_id,
            message=message,
            context=context,
            session_id=session_id,
            override_provider=provider,
            override_model_id=model_id,
            override_allow_fallback=allow_fallback,
            override_fallback_provider=fallback_provider,
        ):
            event_name = evt.get('event', 'chunk')
            yield _sse_pack(event_name, evt)

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response
