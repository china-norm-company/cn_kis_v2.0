"""
AI 辅助财务分析服务

复用 agent_gateway 中已定义的智能体：
- insight-agent: 财务洞察（趋势解读、异常识别）
- analysis-agent: 决算分析（偏差原因、改进建议）
- alert-agent: 风险预警（风险判断、应对建议）
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

FINANCE_INSIGHT_PROMPT = """你是一位资深的 CRO 行业财务分析师。根据提供的财务数据，请给出专业的分析洞察，包括：
1. 关键趋势解读
2. 异常指标识别
3. 风险提示
4. 改进建议
请用中文回答，语言简洁专业。"""

SETTLEMENT_ANALYSIS_PROMPT = """你是一位资深的 CRO 行业财务分析师。根据项目决算数据，请分析：
1. 预算偏差的主要原因
2. 与同类项目的对标分析
3. 成本控制方面的改进建议
4. 对未来类似项目的定价建议
请用中文回答，语言简洁专业，给出可操作的建议。"""

RISK_ALERT_PROMPT = """你是一位资深的 CRO 行业财务风险管理专家。根据提供的风险数据，请分析：
1. 各风险的严重程度判断
2. 优先处理顺序
3. 具体应对建议
4. 预防措施建议
请用中文回答，按优先级排序输出。"""


def generate_monthly_insight(report_data: dict, account_id: int = 0) -> str:
    """月度报表 AI 洞察"""
    data_summary = json.dumps(report_data, ensure_ascii=False, default=str)
    message = f"以下是本月财务经营数据，请生成分析洞察：\n\n{data_summary}"

    try:
        from apps.agent_gateway.services import call_agent
        call = call_agent(
            account_id=account_id,
            agent_id='finance-agent',
            message=message,
            context={'scene': 'monthly_report', 'data_type': 'financial'},
        )
        return call.output_text or ''
    except Exception as e:
        logger.warning(f'AI 月度洞察生成失败（降级为空）: {e}')
        return ''


def generate_settlement_insight(settlement_data: dict, account_id: int = 0) -> str:
    """项目决算 AI 分析建议"""
    data_summary = json.dumps(settlement_data, ensure_ascii=False, default=str)
    message = f"以下是项目决算数据，请给出分析和改进建议：\n\n{data_summary}"

    try:
        from apps.agent_gateway.services import call_agent
        call = call_agent(
            account_id=account_id,
            agent_id='finance-agent',
            message=message,
            context={'scene': 'project_settlement', 'data_type': 'financial'},
        )
        return call.output_text or ''
    except Exception as e:
        logger.warning(f'AI 决算分析生成失败（降级为空）: {e}')
        return ''


def generate_risk_briefing(risk_data: dict, account_id: int = 0) -> str:
    """风险简报 AI 生成"""
    data_summary = json.dumps(risk_data, ensure_ascii=False, default=str)
    message = f"以下是当前财务风险数据，请生成风险简报：\n\n{data_summary}"

    try:
        from apps.agent_gateway.services import call_agent
        call = call_agent(
            account_id=account_id,
            agent_id='finance-agent',
            message=message,
            context={'scene': 'risk_briefing', 'data_type': 'financial'},
        )
        return call.output_text or ''
    except Exception as e:
        logger.warning(f'AI 风险简报生成失败（降级为空）: {e}')
        return ''


def generate_insight_quick(data: dict, scene: str = 'general') -> str:
    """快速 AI 洞察（不记录会话，用于批量场景）"""
    prompts = {
        'monthly': FINANCE_INSIGHT_PROMPT,
        'settlement': SETTLEMENT_ANALYSIS_PROMPT,
        'risk': RISK_ALERT_PROMPT,
        'general': FINANCE_INSIGHT_PROMPT,
    }
    system_prompt = prompts.get(scene, FINANCE_INSIGHT_PROMPT)
    data_summary = json.dumps(data, ensure_ascii=False, default=str)
    message = f"请分析以下财务数据：\n\n{data_summary}"

    try:
        from apps.agent_gateway.services import quick_chat
        return quick_chat(
            message=message,
            system_prompt=system_prompt,
            temperature=0.3,
            max_tokens=2048,
        )
    except Exception as e:
        logger.warning(f'AI 快速洞察失败（降级为空）: {e}')
        return ''
