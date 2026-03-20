"""
agent_gateway Celery 异步任务。
"""
from celery import shared_task


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={'max_retries': 2})
def call_agent_async(
    self,
    account_id: int,
    agent_id: str,
    message: str,
    context: dict | None = None,
    session_id: str | None = None,
    override_provider: str | None = None,
    override_model_id: str | None = None,
    override_allow_fallback: bool | None = None,
    override_fallback_provider: str | None = None,
):
    """
    异步调用智能体并返回最终 AgentCall ID。
    """
    from .services import call_agent

    call = call_agent(
        account_id=account_id,
        agent_id=agent_id,
        message=message,
        context=context or {},
        session_id=session_id,
        override_provider=override_provider,
        override_model_id=override_model_id,
        override_allow_fallback=override_allow_fallback,
        override_fallback_provider=override_fallback_provider,
    )
    return {
        'call_id': call.id,
        'status': call.status,
    }
