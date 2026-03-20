"""
邮件信号 AI 辅助分类

当规则分类结果为 unknown 时，可选择性触发 Kimi moonshot-v1-32k 进行二次确认分类。

设计原则：
- 仅对 unknown 邮件调用（规则可信的邮件不浪费 API 成本）
- 异步/非阻塞：分类失败不影响邮件存储流程，保持 unknown 而非抛异常
- 可通过 MAIL_SIGNAL_AI_CLASSIFY_ENABLED 环境变量开关（默认关闭）
- 结果置信度低时仍返回 unknown，不强行分类

评测依据（2026-03-15）：
    系统规则 vs Kimi 整体一致率 73%；英文邮件 real-002 ("Audit...Agenda Inquiry")
    系统判为 unknown，Kimi/ARK 均判为 inquiry。
    AI 辅助分类可将此类覆盖率从 73% 提升至 87%+。
"""
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

AI_CLASSIFY_ENABLED = os.environ.get('MAIL_SIGNAL_AI_CLASSIFY_ENABLED', '0').strip().lower() in ('1', 'true', 'yes')

# 大模型置信度门槛：模型返回的类型只有在此白名单内才被采纳
ALLOWED_AI_TYPES = frozenset({
    'inquiry', 'project_followup', 'competitor_pressure',
    'complaint', 'relationship_signal',
})

CLASSIFY_PROMPT = """你是医美功效测试实验室邮件分类助手。请分析以下邮件并输出 JSON。

发件人：{sender}
主题：{subject}
正文：{body}

请直接输出 JSON（不加任何解释）：
{{"signal_type":"inquiry|project_followup|competitor_pressure|complaint|relationship_signal|unknown","confidence":"high|medium|low","reasoning":"理由（20字内）"}}

定义：
- inquiry：询价、服务咨询、合作意向
- project_followup：在执行项目的进度沟通、方案确认
- competitor_pressure：提及竞品、价格比较、威胁换合作方
- complaint：投诉、强烈不满、法律威胁、赔偿要求
- relationship_signal：拜访、介绍、非业务寒暄
- unknown：无法明确归类"""


def ai_classify_unknown_mail(
    subject: str,
    body_text: str,
    sender_email: str = '',
) -> str:
    """
    用 Kimi 对 unknown 邮件进行 AI 辅助分类。

    返回：signal_type 字符串（仍为 unknown 若置信度低/调用失败）
    """
    if not AI_CLASSIFY_ENABLED:
        return 'unknown'

    try:
        from django.conf import settings
        import httpx

        api_key = getattr(settings, 'KIMI_API_KEY', '')
        api_base = getattr(settings, 'KIMI_API_BASE', 'https://api.moonshot.cn/v1')
        model = getattr(settings, 'KIMI_DEFAULT_MODEL', 'moonshot-v1-32k')

        if not api_key:
            logger.debug('ai_classify: KIMI_API_KEY not set, skipping')
            return 'unknown'

        prompt = CLASSIFY_PROMPT.format(
            sender=sender_email or '未知',
            subject=subject[:200],
            body=(body_text or '')[:500],
        )

        resp = httpx.post(
            f'{api_base}/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'model': model,
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.1,
                'max_tokens': 150,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        content = resp.json()['choices'][0]['message']['content'].strip()

        match = re.search(r'\{[^{}]+\}', content, re.DOTALL)
        if not match:
            logger.debug('ai_classify: no JSON in response: %s', content[:80])
            return 'unknown'

        data = json.loads(match.group())
        signal_type = str(data.get('signal_type', 'unknown')).lower()
        confidence = str(data.get('confidence', 'low')).lower()
        reasoning = data.get('reasoning', '')

        # 低置信度不采纳
        if confidence == 'low':
            logger.info(
                'ai_classify: low confidence for "%s" → stay unknown (reasoning: %s)',
                subject[:50], reasoning,
            )
            return 'unknown'

        # 不在允许列表中的类型不采纳
        if signal_type not in ALLOWED_AI_TYPES:
            return 'unknown'

        logger.info(
            'ai_classify: "%s" → %s (conf=%s, reason=%s)',
            subject[:50], signal_type, confidence, reasoning,
        )
        return signal_type

    except Exception as e:
        logger.warning('ai_classify failed for "%s": %s', subject[:50], e)
        return 'unknown'


# ============================================================================
# AI 全面意图增强（改进5）
# ============================================================================

AI_ENHANCE_ENABLED = os.environ.get('MAIL_SIGNAL_AI_ENHANCE_ENABLED', '0').strip().lower() in ('1', 'true', 'yes')

ENHANCE_PROMPT = """你是复硕正态（China-Norm）医美功效测试实验室的业务分析师。
分析以下邮件，直接输出JSON（不加任何解释）：

发件人：{sender}
主题：{subject}
正文：{body}

输出格式（严格JSON）：
{{"signal_type":"inquiry|project_followup|competitor_pressure|complaint|internal_admin|unknown","is_external_client_email":true/false,"business_value":"critical|high|medium|low|none","urgency":"high|medium|low","key_intent":"邮件核心意图（20字内）","suggested_actions":["行动1","行动2"],"risk_or_opportunity":"风险或商机说明（无则空）","key_entities":{{"client":"","project_code":"","amount":""}}}}"""


def ai_enhance_mail_understanding(
    subject: str,
    body_text: str,
    sender_email: str = '',
    signal_type: str = 'unknown',
    importance_score: int = 60,
) -> dict:
    """
    AI 全面意图增强：对 unknown 或低置信度邮件，触发 Kimi 生成完整分析。

    改进5（2026-03-15 评测）：在系统规则无法产出高质量意图/建议时，
    用 Kimi 补充 key_intent、suggested_actions、risk_or_opportunity。

    控制开关：MAIL_SIGNAL_AI_ENHANCE_ENABLED=1
    成本控制：仅对 unknown 类型或 importance_score < 50 的邮件触发

    Returns: 增强后的字典（key_intent, suggested_actions, risk_or_opportunity,
             signal_type, business_value, urgency_level），
             失败时返回空 dict
    """
    if not AI_ENHANCE_ENABLED:
        return {}

    # 成本控制：仅处理低置信场景
    if signal_type not in ('unknown',) and importance_score >= 50:
        return {}

    try:
        from django.conf import settings
        import httpx

        api_key = getattr(settings, 'KIMI_API_KEY', '')
        api_base = getattr(settings, 'KIMI_API_BASE', 'https://api.moonshot.cn/v1')
        model = getattr(settings, 'KIMI_DEFAULT_MODEL', 'moonshot-v1-32k')

        if not api_key:
            return {}

        prompt = ENHANCE_PROMPT.format(
            sender=sender_email or '未知',
            subject=subject[:200],
            body=(body_text or '')[:500],
        )

        resp = httpx.post(
            f'{api_base}/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'model': model,
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.1,
                'max_tokens': 400,
            },
            timeout=12.0,
        )
        resp.raise_for_status()
        content = resp.json()['choices'][0]['message']['content'].strip()

        match = re.search(r'\{[^{}]*\}', content, re.DOTALL) or re.search(r'\{.*\}', content, re.DOTALL)
        if not match:
            logger.debug('ai_enhance: no JSON in response for "%s"', subject[:40])
            return {}

        data = json.loads(match.group())
        entities = data.get('key_entities', {}) or {}

        result = {
            'signal_type': str(data.get('signal_type', 'unknown')).lower(),
            'is_external_client_email': bool(data.get('is_external_client_email', False)),
            'business_value': str(data.get('business_value', 'low')).lower(),
            'urgency_level': str(data.get('urgency', 'low')).lower(),
            'key_intent': str(data.get('key_intent', ''))[:100],
            'suggested_actions': [str(a) for a in (data.get('suggested_actions') or [])[:4]],
            'risk_or_opportunity': str(data.get('risk_or_opportunity', ''))[:200],
            'key_entities': {
                'client': str(entities.get('client', '') or ''),
                'project_code': str(entities.get('project_code', '') or ''),
                'amount': str(entities.get('amount', '') or ''),
            },
        }
        logger.info('ai_enhance: "%s" → type=%s val=%s', subject[:40], result['signal_type'], result['business_value'])
        return result

    except Exception as e:
        logger.warning('ai_enhance failed for "%s": %s', subject[:50], e)
        return {}
