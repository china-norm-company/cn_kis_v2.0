"""
客户洞察服务 (C2)

使用 insight-agent 分析客户历史数据，生成洞察报告。
"""
import logging
from typing import Dict, Any

from django.db.models import Sum, Count
from django.db.models.functions import Coalesce

logger = logging.getLogger(__name__)


def generate_client_insight(client_id: int) -> Dict[str, Any]:
    """
    调用 insight-agent 分析客户历史，输出洞察报告。

    分析维度：合作健康度、续约风险、交叉销售建议
    """
    from apps.crm.models import Client, Opportunity
    from apps.protocol.models import Protocol
    from apps.finance.models import Contract, Payment

    try:
        client = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return {'error': '客户不存在'}

    # Gather data
    protocols = Protocol.objects.filter(
        sponsor_id=client_id, is_deleted=False,
    )
    opps = Opportunity.objects.filter(client_id=client_id, is_deleted=False)

    # Contract uses protocol_id (IntegerField), gather protocol IDs first
    protocol_ids = list(protocols.values_list('id', flat=True))

    total_contracts = Contract.objects.filter(
        protocol_id__in=protocol_ids,
    ).aggregate(total=Coalesce(Sum('amount'), 0))['total']

    # Payment links to Invoice, which links to Contract
    from apps.finance.models import Invoice
    contract_ids = list(Contract.objects.filter(
        protocol_id__in=protocol_ids,
    ).values_list('id', flat=True))
    invoice_ids = list(Invoice.objects.filter(
        contract_id__in=contract_ids,
    ).values_list('id', flat=True))
    total_payments = Payment.objects.filter(
        invoice_id__in=invoice_ids,
    ).aggregate(total=Coalesce(Sum('actual_amount'), 0))['total']

    context = {
        'client_name': client.name,
        'level': client.level,
        'total_projects': protocols.count(),
        'active_projects': protocols.filter(status='active').count(),
        'completed_projects': protocols.filter(status='completed').count(),
        'total_opportunities': opps.count(),
        'won_opportunities': opps.filter(stage='won').count(),
        'total_contract_amount': float(total_contracts),
        'total_payments': float(total_payments),
        'receivable': float(total_contracts) - float(total_payments),
    }

    # Call insight-agent
    try:
        from apps.agent_gateway.services import quick_chat
        from apps.agent_gateway.models import AgentProvider

        prompt = f"""分析以下客户数据，生成洞察报告：

客户: {context['client_name']} (级别: {context['level']})
项目: {context['total_projects']} 个 (活跃 {context['active_projects']}, 完成 {context['completed_projects']})
商机: {context['total_opportunities']} 个 (赢得 {context['won_opportunities']})
合同总额: ¥{context['total_contract_amount']:,.0f}
回款总额: ¥{context['total_payments']:,.0f}
应收余额: ¥{context['receivable']:,.0f}

请输出以下分析：
1. 合作健康度评分 (1-10)
2. 续约风险评估
3. 交叉销售建议
4. 下一步行动建议

简洁专业。"""

        analysis = quick_chat(
            message=prompt,
            provider=AgentProvider.KIMI,
            model_id='moonshot-v1-32k',
            system_prompt='你是临床研究行业的客户关系分析专家。',
            temperature=0.5,
            max_tokens=1024,
        )

        return {
            'client_name': client.name,
            'analysis': analysis.strip(),
            'metrics': context,
            'generated_at': __import__('datetime').datetime.now().isoformat(),
        }
    except Exception as e:
        logger.warning(f'客户洞察生成失败: {e}')
        return {
            'client_name': client.name,
            'analysis': '暂无法生成洞察（AI 服务不可用）',
            'metrics': context,
        }


def detect_opportunities(client_id: int) -> Dict[str, Any]:
    """识别交叉销售机会（基于产品类别和历史项目模式）"""
    from apps.protocol.models import Protocol
    from apps.crm.models import Client

    try:
        client = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return {'opportunities': []}

    # Analyze historical product categories
    categories = (
        Protocol.objects.filter(sponsor_id=client_id, is_deleted=False)
        .exclude(product_category='')
        .values('product_category')
        .annotate(count=Count('id'))
        .order_by('-count')
    )

    all_categories = set(
        Protocol.objects.filter(is_deleted=False)
        .exclude(product_category='')
        .values_list('product_category', flat=True)
        .distinct()
    )

    client_categories = set(item['product_category'] for item in categories)
    untried = all_categories - client_categories

    suggestions = [
        {'category': cat, 'reason': '客户尚未尝试此产品类别'}
        for cat in list(untried)[:5]
    ]

    return {
        'client_name': client.name,
        'current_categories': list(client_categories),
        'suggestions': suggestions,
    }
