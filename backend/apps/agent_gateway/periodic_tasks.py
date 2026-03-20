"""
Agent 定时任务 (D2)

每日/每周/每月定时执行 AI 分析和推送：
- 每日：项目健康摘要、异常检测、知识采集、脱落风险扫描
- 每周：客户洞察、CAPA 趋势、知识库健康检查、项目经验归档、市场情报
- 每月：标准更新、消费者洞察
"""
import logging
from datetime import date, timedelta
from typing import Dict, Any

logger = logging.getLogger(__name__)


def run_daily_health_summary():
    """
    每日项目健康摘要 — 每日 9:00 执行

    1. 聚合所有活跃项目的风险状态
    2. 检测数据异常趋势
    3. 推送健康摘要到研究经理飞书
    """
    from apps.protocol.models import Protocol
    from apps.secretary.alert_service import generate_all_alerts
    from apps.secretary.trend_service import get_workorder_trend
    from apps.notification.card_template_service import build_alert_card

    today = date.today()
    alerts = generate_all_alerts()
    high_alerts = [a for a in alerts if a['severity'] == 'high']

    wo_trend = get_workorder_trend(days=7)
    backlog = wo_trend.get('current_backlog', 0)

    summary = (
        f"📊 每日项目健康摘要 ({today.isoformat()})\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"• 高风险预警: {len(high_alerts)} 条\n"
        f"• 工单积压: {backlog} 个\n"
        f"• 本周新增工单: {wo_trend.get('total_created', 0)} 个\n"
        f"• 本周完成工单: {wo_trend.get('total_completed', 0)} 个\n"
    )

    if high_alerts:
        summary += "\n🚨 高风险预警:\n"
        for a in high_alerts[:5]:
            summary += f"  - {a['title']}: {a['detail']}\n"

    # Build suggested actions
    actions = []
    if high_alerts:
        actions.append('处理高风险预警项')
    if backlog > 10:
        actions.append('清理积压工单')
    if actions:
        summary += "\n💡 建议行动:\n"
        for act in actions:
            summary += f"  - {act}\n"

    # Push to all managers
    _push_to_managers(summary, 'daily_health_summary')

    logger.info(f'每日健康摘要已生成并推送: {len(high_alerts)} 条高风险预警')
    return {'alerts_count': len(alerts), 'high_count': len(high_alerts)}


def run_weekly_insights():
    """
    每周客户洞察与周报 — 每周一 9:00 执行

    1. 为每位研究经理生成客户洞察摘要
    2. 生成周报草稿
    """
    from apps.identity.models import Account
    from apps.crm.insight_service import generate_client_insight
    from apps.crm.models import Client

    managers = Account.objects.filter(
        is_deleted=False,
        roles__contains=['project_manager'],
    )

    results = []
    for manager in managers:
        # Get clients managed by this manager
        clients = Client.objects.filter(
            created_by_id=manager.id, is_deleted=False,
        )
        insights = []
        for client in clients[:5]:
            try:
                insight = generate_client_insight(client.id)
                insights.append(insight)
            except Exception as e:
                logger.warning(f'客户洞察失败: client={client.id}, error={e}')

        if insights:
            summary = f"📋 每周客户洞察摘要\n\n"
            for ins in insights:
                summary += f"• {ins.get('client_name', '未知')}\n"
                analysis = ins.get('analysis', '')
                if analysis:
                    summary += f"  {analysis[:200]}\n\n"

            _push_to_user(manager.id, summary, 'weekly_insight')
            results.append({'manager_id': manager.id, 'clients': len(insights)})

    logger.info(f'每周洞察已推送给 {len(results)} 位研究经理')
    return {'managers_notified': len(results)}


def run_daily_dropout_risk_scan():
    """
    每日受试者脱落风险扫描 — 每日 8:30 执行

    遍历所有在研项目的在组受试者，
    对风险评分 >= 60 的受试者推送预警给 CRC 主管。
    """
    try:
        from apps.subject.models import Subject, SubjectStatus, Enrollment
        from apps.subject.services.dropout_prediction import predict_dropout_risk
    except ImportError:
        logger.info('dropout_prediction 服务未就绪，跳过脱落风险扫描')
        return {'skipped': True}

    high_risk_list = []
    medium_risk_list = []

    enrollments = Enrollment.objects.filter(
        status='enrolled',
        is_deleted=False,
    ).select_related('subject', 'protocol')

    for enrollment in enrollments:
        try:
            result = predict_dropout_risk(enrollment.subject.id)
            score = result.get('risk_score', 0)
            if score >= 70:
                high_risk_list.append({
                    'subject_id': enrollment.subject.id,
                    'subject_name': enrollment.subject.name,
                    'protocol': getattr(enrollment.protocol, 'title', '未知协议'),
                    'risk_score': score,
                    'recommendation': result.get('recommendation', ''),
                })
            elif score >= 50:
                medium_risk_list.append({
                    'subject_id': enrollment.subject.id,
                    'subject_name': enrollment.subject.name,
                    'protocol': getattr(enrollment.protocol, 'title', '未知协议'),
                    'risk_score': score,
                })
        except Exception as e:
            logger.debug('受试者 %s 脱落预测失败: %s', enrollment.subject.id, e)

    total_high = len(high_risk_list)
    total_medium = len(medium_risk_list)

    if total_high > 0 or total_medium > 0:
        summary = (
            f"⚠️ 受试者脱落风险日报 ({date.today().isoformat()})\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"• 高风险受试者: {total_high} 人（评分≥70）\n"
            f"• 中风险受试者: {total_medium} 人（评分50-69）\n"
        )
        if high_risk_list:
            summary += "\n🚨 高风险受试者（需立即跟进）:\n"
            for item in high_risk_list[:5]:
                summary += f"  - {item['subject_name']} | 项目:{item['protocol']} | 评分:{item['risk_score']}\n"
                if item.get('recommendation'):
                    summary += f"    建议：{item['recommendation'][:80]}\n"
        _push_to_managers(summary, 'dropout_risk_scan')

    logger.info('脱落风险扫描完成: 高风险=%d, 中风险=%d', total_high, total_medium)
    return {'high_risk': total_high, 'medium_risk': total_medium}


def run_weekly_capa_trend_analysis():
    """
    每周 CAPA 趋势与效果分析 — 每周一 9:30 执行

    1. 统计本周新增偏差数量和分类
    2. 分析 CAPA 按时完成率和效果验证率
    3. 识别重复出现的偏差类型（系统性问题信号）
    4. 用 quality-guardian Agent 生成洞察摘要
    """
    try:
        from apps.quality.models import Deviation, CAPA
    except ImportError:
        logger.info('质量模块未就绪，跳过 CAPA 趋势分析')
        return {'skipped': True}

    week_ago = date.today() - timedelta(days=7)

    new_deviations = Deviation.objects.filter(
        created_at__date__gte=week_ago,
        is_deleted=False,
    )
    dev_count = new_deviations.count()

    category_counts: Dict[str, int] = {}
    for dev in new_deviations:
        cat = dev.category or 'other'
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # CAPA 按时完成率
    overdue_capas = CAPA.objects.filter(
        due_date__lt=date.today(),
        status__in=['open', 'in_progress'],
        is_deleted=False,
    ).count()
    total_open_capas = CAPA.objects.filter(
        status__in=['open', 'in_progress'],
        is_deleted=False,
    ).count()

    # 识别重复偏差类型（出现≥3次的类别）
    repeat_categories = [cat for cat, cnt in category_counts.items() if cnt >= 3]

    summary = (
        f"📊 CAPA 周报 ({week_ago.isoformat()} ~ {date.today().isoformat()})\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"• 本周新增偏差: {dev_count} 件\n"
        f"• 逾期未完成 CAPA: {overdue_capas}/{total_open_capas} 件\n"
    )

    if category_counts:
        summary += "\n📋 偏差类型分布:\n"
        for cat, cnt in sorted(category_counts.items(), key=lambda x: -x[1]):
            summary += f"  - {cat}: {cnt} 件\n"

    if repeat_categories:
        summary += f"\n⚠️ 重复偏差类型（可能是系统性问题）: {', '.join(repeat_categories)}\n"
        summary += "  → 建议：进行根本原因分析，评估 SOP 是否需要修订\n"

    if overdue_capas > 0:
        summary += f"\n🚨 {overdue_capas} 件 CAPA 已逾期，请 QA 经理跟进\n"

    _push_to_managers(summary, 'capa_weekly_trend')
    logger.info('CAPA 趋势分析完成: 新增偏差=%d, 逾期CAPA=%d', dev_count, overdue_capas)
    return {
        'new_deviations': dev_count,
        'overdue_capas': overdue_capas,
        'repeat_categories': repeat_categories,
    }


def run_weekly_knowledge_health_check():
    """
    每周知识库健康检查 — 每周三 10:00 执行

    1. 统计知识库条目数量和分布
    2. 检测过期条目（法规更新后可能已失效）
    3. 检测低覆盖率 namespace（缺乏内容的知识域）
    4. 推送建议给知识管理员
    """
    try:
        from apps.knowledge.models import KnowledgeEntry
    except ImportError:
        logger.info('知识库模块未就绪，跳过健康检查')
        return {'skipped': True}

    three_months_ago = date.today() - timedelta(days=90)

    total_entries = KnowledgeEntry.objects.filter(is_deleted=False).count()

    # 按命名空间统计
    namespace_counts: Dict[str, int] = {}
    for entry in KnowledgeEntry.objects.filter(is_deleted=False).values('namespace'):
        ns = entry.get('namespace') or 'default'
        namespace_counts[ns] = namespace_counts.get(ns, 0) + 1

    # 检测最近 90 天未更新的条目数量（可能过期）
    stale_count = KnowledgeEntry.objects.filter(
        is_deleted=False,
        updated_at__date__lt=three_months_ago,
    ).count()

    # 低覆盖 namespace（条目数<5）
    thin_namespaces = [ns for ns, cnt in namespace_counts.items() if cnt < 5]

    summary = (
        f"📚 知识库健康报告 ({date.today().isoformat()})\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"• 总条目数: {total_entries}\n"
        f"• 超过90天未更新: {stale_count} 条\n"
    )

    if namespace_counts:
        summary += "\n📋 命名空间覆盖:\n"
        for ns, cnt in sorted(namespace_counts.items(), key=lambda x: -x[1])[:10]:
            summary += f"  - {ns}: {cnt} 条\n"

    if thin_namespaces:
        summary += f"\n⚠️ 内容稀少的知识域（<5条）: {', '.join(thin_namespaces[:5])}\n"
        summary += "  → 建议：补充相关法规、SOP 或历史项目经验\n"

    if stale_count > 0:
        summary += f"\n💡 {stale_count} 条条目超过90天未更新，建议审核有效性\n"

    _push_to_managers(summary, 'knowledge_health_check')
    logger.info('知识库健康检查完成: 总条目=%d, 过期=%d', total_entries, stale_count)
    return {
        'total_entries': total_entries,
        'stale_count': stale_count,
        'namespace_coverage': namespace_counts,
    }


def run_daily_knowledge_ingestion():
    """
    每日知识采集（Agent 驱动）— 每日 6:00 执行

    调用 knowledge-ingestion-agent 采集外部信息：
    1. NMPA 化妆品法规公告
    2. 内部 SOP 同步

    降级：Agent 不可用时回退到 external_fetcher 脚本。
    """
    agent_result = _invoke_ingestion_agent(
        '请执行每日知识采集任务：\n'
        '1. 搜索并采集最新的 NMPA 化妆品法规公告，将新发布的法规写入知识库\n'
        '2. 检查是否有需要关注的行业标准更新\n'
        '请先用 knowledge_search 检查已有内容避免重复，然后用 mcp_web_search 搜索新内容。'
    )

    if agent_result and agent_result.get('status') == 'success':
        logger.info('每日知识采集完成（Agent）: %s', agent_result.get('summary', ''))
        _run_sop_sync_fallback()
        return agent_result

    logger.info('Agent 采集不可用，降级到 external_fetcher')
    return _run_daily_external_fetch_legacy()


def run_weekly_experience_archive():
    """
    每周项目经验沉淀（Agent 驱动）— 每周五 18:00 执行

    调用 knowledge-ingestion-agent 归档项目经验。
    降级：回退到 external_fetcher.archive_project_experience。
    """
    agent_result = _invoke_ingestion_agent(
        '请执行每周项目经验归档任务：\n'
        '1. 用 databus_entity 查询已完成的协议项目\n'
        '2. 提取项目关键信息（名称、编号、样本量、测试方法、经验总结）\n'
        '3. 将经验写入知识库（entry_type=lesson_learned, namespace=project_experience）\n'
        '4. 为关键概念创建知识实体和关系\n'
        '注意先检查是否已存在相同条目。'
    )

    if agent_result and agent_result.get('status') == 'success':
        logger.info('项目经验归档完成（Agent）: %s', agent_result.get('summary', ''))
        return agent_result

    try:
        from apps.knowledge.external_fetcher import archive_project_experience
        result = archive_project_experience()
        logger.info('项目经验归档完成（降级）: 新增=%d', result.get('created', 0))
        return result
    except Exception as e:
        logger.warning('项目经验归档失败: %s', e)
        return {'error': str(e)}


def run_monthly_standards_update():
    """
    每月标准更新（Agent 驱动）— 每月 1 日 3:00 执行

    调用 knowledge-ingestion-agent 检查 CDISC 和行业标准更新。
    降级：回退到 external_fetcher.fetch_cdisc_updates。
    """
    agent_result = _invoke_ingestion_agent(
        '请执行每月标准更新检查：\n'
        '1. 搜索 CDISC Library 最新的 SDTM/CDASH 标准更新\n'
        '2. 搜索化妆品行业新发布的 GB 标准或 ISO 标准变化\n'
        '3. 将新标准信息写入知识库（entry_type=regulation）\n'
        '4. 为标准中的关键术语创建知识实体\n'
        '重点关注与化妆品功效评价相关的标准变化。'
    )

    if agent_result and agent_result.get('status') == 'success':
        logger.info('标准更新完成（Agent）: %s', agent_result.get('summary', ''))
        return agent_result

    try:
        from apps.knowledge.external_fetcher import fetch_cdisc_updates
        result = fetch_cdisc_updates()
        logger.info('CDISC 更新完成（降级）: 新增=%d', result.get('new_terms', 0))
        return result
    except Exception as e:
        logger.warning('标准更新失败: %s', e)
        return {'error': str(e)}


def run_weekly_market_intelligence():
    """
    每周市场情报采集（Agent 驱动）— 每周二 7:00 执行

    调用 market-intelligence-agent 采集行业动态：
    1. 化妆品行业法规变化
    2. 竞品动态与新产品上市
    3. 成分趋势与安全争议
    """
    agent_result = _invoke_agent(
        agent_id='market-intelligence-agent',
        message=(
            '请执行每周市场情报采集任务：\n'
            '1. 搜索本周 NMPA 化妆品相关公告和法规变化\n'
            '2. 搜索化妆品 CRO 行业新闻和竞品动态\n'
            '3. 搜索新兴功效成分和安全争议成分的最新信息\n'
            '4. 将有价值的情报结构化后写入知识库\n'
            '请先用 knowledge_search 检查已有情报避免重复。\n'
            '调用 knowledge_create 时请显式传 source_type=market_intelligence_agent，'
            '并补充 tags（至少2个）以及 properties.source_url/source_name/published_at。'
        ),
    )

    if agent_result and agent_result.get('status') == 'success':
        logger.info('市场情报采集完成: %s', agent_result.get('summary', ''))
        return agent_result

    try:
        from apps.knowledge.external_fetcher import update_competitor_intel

        fallback = update_competitor_intel()
        logger.info('market-intelligence-agent 不可用，已执行竞品情报降级采集: created=%d', fallback.get('created', 0))
        return {'fallback': True, 'reason': 'agent_unavailable', 'competitor_intel': fallback}
    except Exception as e:
        logger.info('market-intelligence-agent 不可用，且竞品情报降级采集失败: %s', e)
        return {'skipped': True, 'reason': 'agent_unavailable', 'error': str(e)}


def run_monthly_consumer_insight():
    """
    每月消费者洞察分析（Agent 驱动）— 每月 15 日 9:00 执行

    调用 consumer-insight-agent 为活跃项目生成消费者洞察：
    1. 搜索目标品类的消费者讨论和评价
    2. 用 8 维画像模型分析消费者特征
    3. 生成消费者旅程洞察
    """
    agent_result = _invoke_agent(
        agent_id='consumer-insight-agent',
        message=(
            '请执行每月消费者洞察分析：\n'
            '1. 搜索近一个月化妆品功效评价相关的消费者讨论（保湿/美白/抗皱/防晒）\n'
            '2. 用 8 维画像模型分析消费者需求变化趋势\n'
            '3. 识别消费者在 ZMOT（搜索种草）和 SMOT（使用体验）阶段的关键诉求\n'
            '4. 将洞察结果写入知识库\n'
            '请先用 knowledge_search 查询已有洞察避免重复分析。'
        ),
    )

    if agent_result and agent_result.get('status') == 'success':
        logger.info('消费者洞察分析完成: %s', agent_result.get('summary', ''))
        return agent_result

    logger.info('consumer-insight-agent 不可用，跳过消费者洞察')
    return {'skipped': True, 'reason': 'agent_unavailable'}


def _invoke_agent(agent_id: str, message: str) -> Dict[str, Any]:
    """
    通用 Agent 调用入口（用于定时任务）。
    Agent 不可用时返回 None。
    """
    try:
        from .services import call_agent, get_agent_definition
        agent_def = get_agent_definition(agent_id)
        if not agent_def:
            return None

        call = call_agent(
            account_id=0,
            agent_id=agent_id,
            message=message,
            context={'source': 'periodic_task'},
        )

        from .models import AgentCallStatus
        if call.status == AgentCallStatus.SUCCESS:
            return {
                'status': 'success',
                'summary': call.output_text[:500],
                'tool_calls': len(call.tool_calls_log or []),
                'call_id': call.id,
            }
        else:
            logger.warning('%s 调用失败: %s', agent_id, call.output_text[:200])
            return None
    except Exception as e:
        logger.warning('%s 不可用: %s', agent_id, e)
        return None


def _invoke_ingestion_agent(task_message: str) -> Dict[str, Any]:
    """调用 knowledge-ingestion-agent（向后兼容的便捷包装）"""
    return _invoke_agent('knowledge-ingestion-agent', task_message)


def _run_sop_sync_fallback():
    """SOP 同步始终通过脚本执行（数据来自内部 ORM，不需要 Agent）"""
    try:
        from apps.knowledge.external_fetcher import sync_internal_sops
        result = sync_internal_sops()
        logger.info('SOP 同步完成: synced=%d', result.get('synced', 0))
        return result
    except Exception as e:
        logger.warning('SOP 同步失败: %s', e)
        return {'error': str(e)}


def _run_daily_external_fetch_legacy():
    """旧版每日采集（降级路径）"""
    try:
        from apps.knowledge.external_fetcher import (
            fetch_nmpa_regulations,
            sync_internal_sops,
        )
        nmpa = fetch_nmpa_regulations()
        sop = sync_internal_sops()
        logger.info(
            '每日外部采集完成（降级）: NMPA=%d, SOP=%d',
            nmpa.get('created', 0),
            sop.get('synced', 0),
        )
        return {'nmpa': nmpa, 'sop': sop}
    except Exception as e:
        logger.warning('每日外部采集失败: %s', e)
        return {'error': str(e)}


def _push_to_managers(content: str, msg_type: str):
    """推送消息给所有管理角色"""
    try:
        from apps.identity.models import Account
        managers = Account.objects.filter(
            is_deleted=False,
            roles__contains=['project_manager'],
        )
        for manager in managers:
            _push_to_user(manager.id, content, msg_type)
    except Exception as e:
        logger.warning(f'批量推送失败: {e}')


def _push_to_user(account_id: int, content: str, msg_type: str):
    """推送消息给指定用户"""
    try:
        from apps.notification.services import send_notification
        send_notification(
            recipient_id=account_id,
            title=f'CN KIS {msg_type}',
            content=content,
            channel='feishu_card',
            priority='normal',
            source_type=msg_type,
        )
    except Exception as e:
        logger.warning(f'用户推送失败: account={account_id}, error={e}')
