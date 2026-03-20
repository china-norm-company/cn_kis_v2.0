"""
CRM AI 服务 — 调用火山方舟(ARK) / Kimi 双通道

Agent 定义：
- crm-strategist (ARK): 客户战略分析
- trend-analyst (Kimi): 行业趋势分析
- client-enabler (Kimi): 客户赋能（价值洞察生成）
"""
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


def _quick_ai_call(prompt: str, system_prompt: str, provider: str = 'kimi',
                   model_id: str = 'moonshot-v1-32k', **kwargs) -> str:
    """统一的 AI 调用封装"""
    try:
        from apps.agent_gateway.services import quick_chat
        from apps.agent_gateway.models import AgentProvider

        prov = AgentProvider.KIMI if provider == 'kimi' else AgentProvider.ARK
        result = quick_chat(
            message=prompt,
            provider=prov,
            model_id=model_id,
            system_prompt=system_prompt,
            temperature=kwargs.get('temperature', 0.5),
            max_tokens=kwargs.get('max_tokens', 2048),
        )
        return result.strip()
    except Exception as e:
        logger.warning(f'AI调用失败: {e}')
        return ''


def generate_strategic_analysis(client_id: int) -> Dict[str, Any]:
    """客户战略分析 — 调用 crm-strategist (ARK)"""
    from apps.crm.models import Client, ClientProductLine, InnovationCalendar
    from apps.protocol.models import Protocol

    try:
        client = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return {'error': '客户不存在'}

    product_lines = list(
        ClientProductLine.objects.filter(client_id=client_id, is_deleted=False)
        .values_list('brand', 'category')
    )
    innovations = list(
        InnovationCalendar.objects.filter(client_id=client_id, is_deleted=False)
        .values('product_concept', 'innovation_type', 'status')[:10]
    )
    project_count = Protocol.objects.filter(
        sponsor_id=client_id, is_deleted=False,
    ).count()

    prompt = f"""请对以下客户进行战略分析：

客户: {client.name} ({client.get_company_type_display()})
合作等级: {client.get_partnership_tier_display()}
行业: {client.industry}
产品线: {', '.join(f'{b}-{c}' for b, c in product_lines) or '未知'}
创新计划: {innovations or '无'}
累计项目: {project_count}
竞争情况: 竞争CRO={client.known_competitors}, 估算份额={client.our_share_estimate}%

请输出：
1. 客户战略定位评估
2. 合作深化机会
3. 竞争风险与应对
4. 12个月行动计划"""

    analysis = _quick_ai_call(
        prompt=prompt,
        system_prompt='你是化妆品CRO行业的客户关系战略顾问。基于数据给出专业、可操作的战略建议。',
        provider='ark',
        model_id='ep-crm-strategist',
    )

    return {
        'client_name': client.name,
        'analysis': analysis or '战略分析服务暂不可用',
        'generated_at': __import__('datetime').datetime.now().isoformat(),
    }


def generate_trend_insight(category: str, region: str = '中国') -> Dict[str, Any]:
    """行业趋势洞察 — 调用 trend-analyst (Kimi)"""
    prompt = f"""请分析化妆品行业 {region} 市场 {category} 品类的最新趋势：

请输出：
1. 市场规模与增速
2. 热门成分与宣称趋势
3. 法规动态
4. 消费者偏好变化
5. 对CRO检测业务的机会"""

    analysis = _quick_ai_call(
        prompt=prompt,
        system_prompt='你是化妆品行业趋势分析师，擅长市场研究和消费者洞察。输出结构化、数据驱动的分析。',
        provider='kimi',
        model_id='moonshot-v1-32k',
    )

    return {
        'category': category,
        'region': region,
        'analysis': analysis or '趋势分析服务暂不可用',
        'generated_at': __import__('datetime').datetime.now().isoformat(),
    }


def generate_value_insight(client_id: int) -> Dict[str, Any]:
    """为客户生成价值洞察 — 调用 client-enabler (Kimi)"""
    from apps.crm.models import Client, ClientProductLine

    try:
        client = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return {'error': '客户不存在'}

    categories = list(
        ClientProductLine.objects.filter(client_id=client_id, is_deleted=False)
        .values_list('category', flat=True).distinct()
    )

    prompt = f"""基于以下客户信息，生成一条可直接分享给客户的价值洞察：

客户: {client.name}
行业: {client.industry}
主要品类: {', '.join(categories) or client.industry}
关注宣称: {client.main_claim_types or '未知'}

要求：
- 主题：与客户业务相关的市场趋势、法规变化、技术创新
- 形式：开头一句话总结 + 200字详细分析 + 对客户的建议
- 语气：专业而亲切"""

    content = _quick_ai_call(
        prompt=prompt,
        system_prompt='你是化妆品CRO的客户赋能专家，帮助客户了解行业动态和创新机会。',
        provider='kimi',
        model_id='moonshot-v1-32k',
    )

    return {
        'client_name': client.name,
        'suggested_title': f'{client.name} — 价值洞察',
        'content': content or '洞察生成服务暂不可用',
        'generated_at': __import__('datetime').datetime.now().isoformat(),
    }


def auto_generate_client_brief(client_id: int) -> Dict[str, Any]:
    """AI辅助生成客户简报 — 综合分析后生成结构化简报"""
    from apps.crm.models import Client, ClientContact, ClientProductLine
    from apps.protocol.models import Protocol

    try:
        client = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return {'error': '客户不存在'}

    contacts = list(
        ClientContact.objects.filter(client_id=client_id, is_deleted=False)
        .values('name', 'title', 'role_type', 'relationship_level')[:10]
    )
    product_lines = list(
        ClientProductLine.objects.filter(client_id=client_id, is_deleted=False)
        .values('brand', 'category', 'price_tier')
    )
    project_count = Protocol.objects.filter(
        sponsor_id=client_id, is_deleted=False,
    ).count()

    prompt = f"""请为以下客户生成一份内部客户简报（供研究经理参考）：

客户: {client.name} ({client.get_company_type_display()})
合作等级: {client.get_partnership_tier_display()}
行业: {client.industry}
关键联系人: {contacts}
产品线: {product_lines}
累计项目: {project_count}
竞争信息: CRO={client.known_competitors}

请按以下结构输出：
1. 客户战略重点（2-3句话）
2. 市场背景
3. 竞争格局
4. 客户痛点（列表）
5. 质量期望（列表）
6. 沟通注意事项（列表）"""

    content = _quick_ai_call(
        prompt=prompt,
        system_prompt='你是化妆品CRO的商务团队负责人，为研究经理团队编写客户简报。语言简洁、重点突出。',
        provider='kimi',
        model_id='moonshot-v1-32k',
        max_tokens=3000,
    )

    return {
        'client_name': client.name,
        'brief_content': content or '简报生成服务暂不可用',
        'generated_at': __import__('datetime').datetime.now().isoformat(),
    }
