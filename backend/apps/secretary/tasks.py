"""
秘书台 Celery 异步任务

编排器定时任务：
- generate_morning_brief: 每日 7:30 生成晨报
- generate_evening_summary: 每日 17:30 生成日报

智能运营简报（Issue #4）：
- send_morning_briefing: 每日 09:00 全域早报（总经理视角）
- send_evening_briefing: 每日 18:00 全域晚报（总经理视角）
- send_weekly_briefing: 每周一 08:30 战略周报
- process_user_feedback_async: 用户反馈群消息异步处理
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)

# ── 智能运营简报任务（从 briefing_tasks 模块注册）────────────────────────────
from .briefing_tasks import (  # noqa: F401 - Celery 需要 import 来发现任务
    send_morning_briefing,
    send_evening_briefing,
    send_weekly_briefing,
    process_user_feedback_async,
)


@shared_task(bind=True, max_retries=2, default_retry_delay=120)
def generate_morning_brief(self):
    """
    每日 7:30 自动生成晨报，推送给各角色管理者。
    使用编排器聚合全域数据并通过飞书推送。
    """
    from apps.identity.models import Account

    target_roles = ['ceo', 'lab_director']
    admin = Account.objects.filter(role='admin', is_active=True).first()
    if not admin:
        logger.warning('No admin account found for morning brief')
        return

    from .orchestration_service import generate_daily_brief

    results = []
    for role in target_roles:
        try:
            brief = generate_daily_brief(
                account_id=admin.id,
                target_role=role,
            )
            results.append({'role': role, 'ok': True, 'brief_id': brief.get('brief_id')})
            _push_brief_to_role(role, brief)
        except Exception as e:
            logger.error('Morning brief for %s failed: %s', role, e)
            results.append({'role': role, 'ok': False, 'error': str(e)})

    logger.info('Morning brief completed: %s', results)
    return results


@shared_task(bind=True, max_retries=2, default_retry_delay=120)
def generate_evening_summary(self):
    """
    每日 17:30 自动生成日报汇总。
    """
    from apps.identity.models import Account

    admin = Account.objects.filter(role='admin', is_active=True).first()
    if not admin:
        logger.warning('No admin account found for evening summary')
        return

    from .orchestration_service import generate_daily_brief

    try:
        brief = generate_daily_brief(
            account_id=admin.id,
            target_role='lab_director',
            focus_areas=['日报汇总', '今日完成', '明日重点'],
        )
        _push_brief_to_role('lab_director', brief)
        logger.info('Evening summary generated: %s', brief.get('brief_id'))
        return {'ok': True, 'brief_id': brief.get('brief_id')}
    except Exception as e:
        logger.error('Evening summary failed: %s', e)
        return {'ok': False, 'error': str(e)}


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def compute_weekly_learning_digest(self):
    """
    每周一 9:00 为所有活跃用户计算反馈学习摘要并推送优化建议。
    """
    from apps.identity.models import Account

    active_accounts = Account.objects.filter(is_active=True).values_list('id', flat=True)
    from .feedback_loop_service import (
        get_user_feedback_summary,
        invalidate_profile_cache,
    )

    results = []
    for aid in active_accounts:
        try:
            invalidate_profile_cache(aid)
            summary = get_user_feedback_summary(aid, days=7)
            if summary['total_feedback'] == 0:
                continue
            results.append({'account_id': aid, 'status': summary['learning_status']})

            if summary['declining_types']:
                _push_learning_nudge(aid, summary)
        except Exception as e:
            logger.warning('Learning digest for account %s failed: %s', aid, e)

    logger.info('Weekly learning digest: %d accounts processed', len(results))
    return results


def _push_learning_nudge(account_id: int, summary: dict):
    """推送学习反馈改善提示"""
    try:
        from apps.notification.services import send_notification

        declining = ', '.join(summary.get('declining_types', [])[:3])
        improving = ', '.join(summary.get('improving_types', [])[:3])

        lines = ['AI 助手正在根据你的反馈持续优化建议质量。']
        if declining:
            lines.append(f'需关注: 「{declining}」类建议采纳率较低，已自动调整策略')
        if improving:
            lines.append(f'表现良好: 「{improving}」类建议持续改善')
        lines.append(f'整体采纳率: {summary["global_adoption_rate"]*100:.0f}%')

        send_notification(
            recipient_id=account_id,
            title='AI 学习周报',
            content='\n'.join(lines),
            channel='feishu_card',
            priority='low',
            source_type='feedback_loop.weekly',
        )
    except Exception as e:
        logger.warning('Push learning nudge to %s failed: %s', account_id, e)


def _push_brief_to_role(role: str, brief: dict):
    """通过飞书推送简报给目标角色"""
    try:
        from apps.notification.services import send_notification
        from apps.identity.models import Account

        role_map = {
            'ceo': ['admin'],
            'lab_director': ['admin', 'lab_director'],
            'project_manager': ['project_manager'],
            'qa_manager': ['qa_manager'],
        }
        target_roles = role_map.get(role, ['admin'])
        recipients = Account.objects.filter(
            role__in=target_roles, is_active=True,
        ).values_list('id', flat=True)

        content = brief.get('content', '')[:2000]
        health = brief.get('health_score', 0)
        title = f"📊 每日简报 | 健康度 {health}/100"

        for uid in recipients:
            try:
                send_notification(
                    recipient_id=uid,
                    title=title,
                    content=content,
                    channel='feishu_card',
                    priority='normal',
                    source_type='orchestrator.daily_brief',
                )
            except Exception:
                pass
    except Exception as e:
        logger.warning('Push brief to %s failed: %s', role, e)


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def snapshot_role_kpi_daily(self):
    """
    每日为所有启用岗位生成 KPI 快照，避免 /value-metrics 请求时全量现算。
    """
    from django.utils import timezone as tz
    from datetime import timedelta
    from django.db.models import Count
    from .models_roles import WorkerRoleDefinition, RoleKPISnapshot
    from .models_runtime import UnifiedExecutionTask
    from .models_memory import WorkerMemoryRecord
    from .models_governance import EvidenceGateRun

    today = tz.now().date()
    cutoff_7d = tz.now() - timedelta(days=7)
    roles = WorkerRoleDefinition.objects.filter(enabled=True)
    created = 0

    for role in roles:
        if RoleKPISnapshot.objects.filter(
            role_code=role.role_code, snapshot_date=today, period_days=7,
        ).exists():
            continue

        try:
            tasks = UnifiedExecutionTask.objects.filter(
                role_code=role.role_code,
                status__in=[UnifiedExecutionTask.Status.SUCCEEDED, UnifiedExecutionTask.Status.PARTIAL],
                completed_at__gte=cutoff_7d,
            )
            total = tasks.count()
            succeeded = tasks.filter(status=UnifiedExecutionTask.Status.SUCCEEDED).count()
            success_rate = round(succeeded / total, 3) if total else 0.0

            by_object = list(
                tasks.values('business_object_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            memory_count = WorkerMemoryRecord.objects.filter(
                worker_code=role.role_code, created_at__gte=cutoff_7d,
            ).count()

            kpis = {
                'total_executions': total,
                'success_rate': success_rate,
                'memory_records': memory_count,
                'by_business_object': by_object,
                'kpi_definitions': role.kpi_metrics if isinstance(role.kpi_metrics, list) else [],
            }

            if role.role_code in ('quality_guardian', 'compliance_reviewer'):
                gate_runs = EvidenceGateRun.objects.filter(created_at__gte=cutoff_7d)
                gt = gate_runs.count()
                gp = gate_runs.filter(status='passed').count()
                kpis['gate_pass_rate'] = round(gp / gt, 3) if gt else 0.0

            RoleKPISnapshot.objects.create(
                role_code=role.role_code,
                snapshot_date=today,
                period_days=7,
                kpis=kpis,
            )
            created += 1
        except Exception as exc:
            logger.warning('snapshot_role_kpi_daily for %s failed: %s', role.role_code, exc)

    logger.info('snapshot_role_kpi_daily: %d snapshots created', created)
    return {'created': created}


@shared_task(bind=True, max_retries=1, default_retry_delay=600)
def refresh_digital_worker_watchtower(self):
    from .evergreen_watchtower import build_watchtower_summary, persist_watchtower_scan

    summary = build_watchtower_summary()
    ids = persist_watchtower_scan(summary['sources'])
    logger.info('Evergreen watchtower refreshed: %s', ids)
    return {'report_ids': ids, 'ok_count': summary['ok_count'], 'issue_count': summary['issue_count']}


@shared_task(bind=True, max_retries=1, default_retry_delay=600)
def run_digital_worker_readiness_gate(self):
    from .evidence_gate_service import build_evidence_gate_report, evaluate_evidence_gate, persist_evidence_gate

    report = build_evidence_gate_report()
    evaluation = evaluate_evidence_gate(report)
    gate_id = persist_evidence_gate(report, evaluation)
    logger.info('Digital worker readiness gate executed: gate_id=%s passed=%s', gate_id, evaluation['passed'])
    return {'gate_id': gate_id, 'evaluation': evaluation}


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def run_project_startup_readiness_check(self):
    """每日 7:00 遍历筹备中项目，执行人机料法环核验并写入门禁记录。"""
    from apps.protocol.models import Protocol
    from apps.secretary.models_governance import EvidenceGateRun

    preparing = Protocol.objects.filter(status__in=['draft', 'preparing', 'active']).values_list('id', 'title')
    checked = 0
    for pid, title in preparing:
        try:
            from apps.quality.services import check_project_start_gate
            result = check_project_start_gate(pid)
            passed = result.get('passed', False)
            EvidenceGateRun.objects.create(
                gate_type='startup',
                scope=f'project:{pid}',
                status='passed' if passed else 'warn',
                score=1.0 if passed else 0.0,
                summary=result,
                raw_report={'project_id': pid, 'title': title[:200]},
            )
            checked += 1
        except Exception as exc:
            logger.warning('startup readiness check for project %s failed: %s', pid, exc)
    logger.info('run_project_startup_readiness_check: %d projects checked', checked)
    return {'checked': checked}


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def snapshot_quality_kpi_daily(self):
    """每日统计偏差趋势、CAPA 关闭率、门禁通过率，写入质量守护员 KPI 快照。"""
    from django.utils import timezone as tz
    from datetime import timedelta
    from .models_roles import RoleKPISnapshot
    from .models_governance import EvidenceGateRun

    today = tz.now().date()
    if RoleKPISnapshot.objects.filter(role_code='quality_guardian', snapshot_date=today, period_days=7).exists():
        return {'skipped': True}

    cutoff = tz.now() - timedelta(days=7)
    kpis = {}
    try:
        from apps.quality.models import Deviation, CAPARecord
        dev_new = Deviation.objects.filter(create_time__gte=cutoff).count()
        dev_closed = Deviation.objects.filter(status='closed', update_time__gte=cutoff).count()
        dev_overdue = Deviation.objects.filter(
            status__in=['open', 'investigating'], create_time__lt=cutoff - timedelta(days=30),
        ).count()
        kpis['deviation_new_7d'] = dev_new
        kpis['deviation_closed_7d'] = dev_closed
        kpis['deviation_overdue'] = dev_overdue

        capa_total = CAPARecord.objects.filter(create_time__gte=cutoff).count()
        capa_closed = CAPARecord.objects.filter(status='closed', create_time__gte=cutoff).count()
        kpis['capa_closure_rate'] = round(capa_closed / capa_total, 3) if capa_total else 0.0
    except Exception:
        pass

    try:
        gates = EvidenceGateRun.objects.filter(created_at__gte=cutoff)
        gt = gates.count()
        gp = gates.filter(status='passed').count()
        kpis['gate_pass_rate_7d'] = round(gp / gt, 3) if gt else 0.0
    except Exception:
        pass

    RoleKPISnapshot.objects.create(role_code='quality_guardian', snapshot_date=today, period_days=7, kpis=kpis)
    logger.info('snapshot_quality_kpi_daily: %s', kpis)
    return kpis


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def reset_agent_monthly_budgets(self):
    """每月 1 日重置所有 Agent 的当月花费。"""
    from apps.agent_gateway.models import AgentDefinition

    count = AgentDefinition.objects.filter(is_active=True).exclude(
        monthly_budget_usd__isnull=True,
    ).update(current_month_spend_usd=0)
    logger.info('reset_agent_monthly_budgets: %d agents reset', count)
    return {'reset_count': count}


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def aggregate_agent_daily_cost(self):
    """按当月累计 token 精确回填 current_month_spend_usd。"""
    from django.utils import timezone as tz
    from datetime import timedelta
    from apps.agent_gateway.models import AgentCall, AgentDefinition

    today_start = tz.now().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    month_start = today_start.replace(day=1)

    # ARK: ~0.004 USD/1k tokens; Kimi: ~0.002 USD/1k tokens（估算值）
    COST_PER_1K_TOKENS = {'ark': 0.004, 'kimi': 0.002, 'deepseek': 0.002}

    agents = AgentDefinition.objects.filter(is_active=True)
    updated = 0
    for agent in agents:
        calls = AgentCall.objects.filter(
            agent_id=agent.agent_id,
            created_at__gte=month_start,
            created_at__lt=tz.now(),
            status='success',
        )
        total_tokens = 0
        for call in calls:
            usage = call.token_usage if isinstance(call.token_usage, dict) else {}
            total_tokens += int(usage.get('total_tokens', 0))

        unit_cost = COST_PER_1K_TOKENS.get(agent.provider, 0.003)
        cost = round(total_tokens / 1000 * unit_cost, 4)
        from decimal import Decimal

        AgentDefinition.objects.filter(pk=agent.pk).update(
            current_month_spend_usd=Decimal(str(cost))
        )
        updated += 1

    # 统计 quick_chat（agent_id='_quick_chat'）的 token 消耗
    qc_calls = AgentCall.objects.filter(
        agent_id='_quick_chat',
        created_at__gte=yesterday_start,
        created_at__lt=today_start,
        status='success',
    )
    qc_tokens = 0
    qc_count = 0
    for call in qc_calls:
        usage = call.token_usage if isinstance(call.token_usage, dict) else {}
        qc_tokens += int(usage.get('total_tokens', 0))
        qc_count += 1

    logger.info(
        'aggregate_agent_daily_cost: %d agents updated, quick_chat: %d calls / %d tokens',
        updated, qc_count, qc_tokens,
    )
    return {'updated': updated, 'quick_chat_calls': qc_count, 'quick_chat_tokens': qc_tokens}


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def forget_stale_memories_daily(self):
    """每日 3:00 对所有启用岗位执行主动遗忘（过期/低重要性）。"""
    from .memory_service import forget_stale_memories
    from .models_roles import WorkerRoleDefinition

    total = 0
    for role in WorkerRoleDefinition.objects.filter(enabled=True):
        try:
            total += forget_stale_memories(role.role_code)
        except Exception as exc:
            logger.warning('forget_stale_memories for %s failed: %s', role.role_code, exc)
    logger.info('forget_stale_memories_daily: total=%d', total)
    return {'forgotten': total}


@shared_task(bind=True, max_retries=1, default_retry_delay=600)
def compress_memories_weekly(self):
    """每周一 4:00 压缩堆积的 episodic 记忆为 semantic 摘要。"""
    from .memory_service import compress_memories
    from .models_roles import WorkerRoleDefinition

    created = 0
    for role in WorkerRoleDefinition.objects.filter(enabled=True):
        try:
            new_id = compress_memories(role.role_code, threshold=10)
            if new_id:
                created += 1
        except Exception as exc:
            logger.warning('compress_memories for %s failed: %s', role.role_code, exc)
    logger.info('compress_memories_weekly: created=%d summaries', created)
    return {'created': created}


@shared_task(bind=True, max_retries=1, default_retry_delay=600)
def evolve_skills_from_experience(self):
    """每周三 5:00 从最近成功执行中挖掘高频模式，提炼为技能进化模板草稿。"""
    from django.utils import timezone as tz
    from datetime import timedelta
    from django.db.models import Count
    from .models_runtime import UnifiedExecutionTask
    from .models_skills import SkillTemplate, SkillDefinition
    import uuid

    cutoff = tz.now() - timedelta(days=7)
    # 统计最近 7 天中成功执行超过 5 次的技能
    skill_counts = (
        UnifiedExecutionTask.objects.filter(
            completed_at__gte=cutoff,
            status=UnifiedExecutionTask.Status.SUCCEEDED,
        )
        .exclude(name='')
        .values('name', 'role_code')
        .annotate(count=Count('id'))
        .filter(count__gte=5)
        .order_by('-count')[:5]
    )

    created = 0
    for item in skill_counts:
        skill_name = item['name']
        role_code = item['role_code'] or ''
        count = item['count']

        # 检查是否已有对应的 SkillDefinition 或未处理的模板
        if SkillDefinition.objects.filter(skill_id=skill_name).exists():
            continue
        if SkillTemplate.objects.filter(skill_id_hint=skill_name, status__in=['draft', 'approved']).exists():
            continue

        # 采集该技能最近几次的输入输出
        samples = list(
            UnifiedExecutionTask.objects.filter(
                name=skill_name, status=UnifiedExecutionTask.Status.SUCCEEDED, completed_at__gte=cutoff,
            ).values('input_payload', 'output_payload')[:5]
        )

        description = f'从最近 7 天 {count} 次成功执行中提炼的技能模式'
        trigger = f'当需要执行 {skill_name} 相关任务时'
        steps = [f'基于历史执行经验，{skill_name} 的标准处理流程']

        try:
            from apps.agent_gateway.services import quick_chat
            sample_text = '\n'.join([f'输入:{s["input_payload"]}→输出:{str(s["output_payload"])[:200]}' for s in samples[:3]])
            prompt = (
                '你是技能提炼助手。根据以下技能执行样例，生成简洁的技能描述（不超过 100 字）。只返回描述文字。'
            )
            description = quick_chat(
                message=f'技能名：{skill_name}\n执行样例：\n{sample_text[:1000]}',
                system_prompt=prompt,
                temperature=0.2,
                max_tokens=150,
            ).strip()
        except Exception:
            pass

        SkillTemplate.objects.create(
            template_id=f'TPL-{uuid.uuid4().hex[:12].upper()}',
            source='auto_evolved',
            skill_id_hint=skill_name,
            worker_code=role_code,
            trigger_condition=trigger,
            processing_steps=steps,
            description=description,
            confidence_score=min(1.0, count / 20.0),
            source_task_ids=[],
            status='draft',
        )
        created += 1

    logger.info('evolve_skills_from_experience: created=%d templates', created)
    return {'created': created}


# ============================================================================
# Phase 6：主动式伙伴经营
# ============================================================================

@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def run_proactive_trend_scan(self):
    """Phase 6 外部趋势主动预警（每日 06:00）"""
    from .proactive_scan_engine import TrendMonitorPipeline
    return TrendMonitorPipeline().execute()


@shared_task(bind=True, max_retries=1, default_retry_delay=600)
def run_proactive_client_periodic(self):
    """Phase 6 重点客户定期洞察（每周一 08:00）"""
    from .proactive_scan_engine import ClientPeriodicPipeline
    return ClientPeriodicPipeline().execute()


@shared_task(bind=True, max_retries=1, default_retry_delay=600)
def run_proactive_project_scout(self):
    """Phase 6 下一项目主动推荐（每月 1 日 09:00）"""
    from .proactive_scan_engine import ProjectScoutPipeline
    return ProjectScoutPipeline().execute()


@shared_task(bind=True)
def expire_stale_proactive_insights(self):
    """Phase 6 过期洞察清理（每日 23:00）"""
    from .proactive_insight_service import expire_stale_insights
    count = expire_stale_insights()
    return {'expired': count}


@shared_task(bind=True)
def run_proactive_feedback_learning(self):
    """Phase 6 反馈学习回路（每日 23:30）"""
    from .proactive_insight_service import apply_feedback_learning
    return apply_feedback_learning()


# ============================================================================
# 飞书全量迁移增量采集任务
# ============================================================================

@shared_task(
    name='apps.secretary.tasks.daily_incremental_feishu_sweep',
    bind=True, max_retries=1, default_retry_delay=3600,
)
def daily_incremental_feishu_sweep(self):
    """
    每日增量飞书采集（每日 01:00）。

    基于 FeishuMigrationCheckpoint.last_timestamp，采集近 48h 新增数据。
    双倍回溯窗口确保不遗漏。
    """
    import logging
    from django.core.management import call_command
    logger = logging.getLogger(__name__)

    try:
        logger.info('开始每日增量飞书采集...')
        call_command(
            'sweep_feishu_incremental',
            lookback_hours=48,
            sources='mail,im,calendar,task,approval,doc,wiki',
        )
        return {'status': 'ok', 'type': 'daily_incremental'}
    except Exception as e:
        logger.error('每日增量采集失败: %s', e)
        raise self.retry(exc=e)


@shared_task(
    name='apps.secretary.tasks.weekly_feishu_deep_scan',
    bind=True, max_retries=1, default_retry_delay=7200,
)
def weekly_feishu_deep_scan(self):
    """
    每周深度扫描（每周日 02:00）。

    扫描云文档/Wiki/Sheet/Slide 的变更，补采事件驱动可能遗漏的文件类内容。
    """
    import logging
    from django.core.management import call_command
    logger = logging.getLogger(__name__)

    try:
        logger.info('开始每周飞书深度扫描...')
        call_command(
            'sweep_feishu_incremental',
            lookback_hours=168,  # 7 天
            sources='doc,wiki,sheet,slide,drive_file,group_msg',
        )
        return {'status': 'ok', 'type': 'weekly_deep_scan'}
    except Exception as e:
        logger.error('每周深度扫描失败: %s', e)
        raise self.retry(exc=e)


@shared_task(
    name='apps.secretary.tasks.monthly_feishu_reconcile',
    bind=True, max_retries=0,
)
def monthly_feishu_reconcile(self):
    """
    每月全量对账（每月 1 日 03:00）。

    对比飞书侧数据量与数据库记录数，发现差异时补采。
    """
    import logging
    from django.core.management import call_command
    logger = logging.getLogger(__name__)

    try:
        logger.info('开始每月飞书全量对账...')
        call_command('reconcile_feishu_data', auto_fix=True)
        return {'status': 'ok', 'type': 'monthly_reconcile'}
    except Exception as e:
        logger.error('每月对账失败: %s', e)
        return {'status': 'error', 'error': str(e)}


@shared_task(
    name='apps.secretary.tasks.incremental_mail_harvest',
    bind=True, max_retries=2, default_retry_delay=60,
)
def incremental_mail_harvest(self, open_id: str = '', mailbox: str = '', message_id: str = ''):
    """
    事件驱动的单封邮件增量采集（由 mail.user.message.created_v1 触发）。
    """
    import logging
    from apps.feishu_sync.event_handler import _sync_collect_mail
    logger = logging.getLogger(__name__)

    try:
        _sync_collect_mail(open_id, mailbox, message_id)
        return {'status': 'ok', 'message_id': message_id}
    except Exception as e:
        logger.error('增量邮件采集失败 %s: %s', message_id, e)
        raise self.retry(exc=e)


# ============================================================================
# 飞书知识持续沉淀自动化（后台常驻机制）
# ============================================================================


@shared_task(
    name='apps.secretary.tasks.feishu_token_health_check',
    bind=True, max_retries=0,
)
def feishu_token_health_check(self):
    """
    每 6 小时检查所有账号的飞书 token 健康状况：
    1. 尝试自动刷新即将过期的 token
    2. 对完全失效（refresh 也过期）的用户推送飞书消息引导重新授权
    3. token 刷新成功后自动触发补采
    """
    import logging
    from django.utils import timezone
    from apps.identity.models import Account
    from apps.secretary.models import FeishuUserToken
    from apps.secretary.feishu_fetcher import get_valid_user_token
    from libs.feishu_client import feishu_client

    log = logging.getLogger('feishu_token_health')
    now = timezone.now()

    stats = {'total': 0, 'healthy': 0, 'refreshed': 0, 'expired_notified': 0,
             'no_token': 0, 'backfill_triggered': 0, 'errors': 0}

    accounts = Account.objects.filter(
        is_deleted=False,
        feishu_open_id__isnull=False,
    ).exclude(feishu_open_id='')

    for account in accounts:
        stats['total'] += 1
        try:
            token = get_valid_user_token(account.id)
            if token:
                stats['healthy'] += 1
                _maybe_trigger_backfill(account, log, stats)
                continue

            token_record = FeishuUserToken.objects.filter(account_id=account.id).first()
            if not token_record:
                stats['no_token'] += 1
                _send_reauth_message(account, feishu_client, log)
                stats['expired_notified'] += 1
                continue

            if (token_record.refresh_expires_at and now >= token_record.refresh_expires_at) or not token_record.refresh_token:
                # refresh_token 完全过期或不存在：必须重新登录
                _send_reauth_message(account, feishu_client, log)
                stats['expired_notified'] += 1
            else:
                # refresh_token 还有效：可能是代码或时间判断问题，尝试再刷一次
                log.warning(
                    'token_health: get_valid_user_token returned None but refresh_token exists, '
                    'account_id=%s name=%s', account.id, account.display_name
                )
                stats['errors'] += 1

        except Exception as e:
            log.debug('token 检查异常 %s: %s', account.display_name, e)
            stats['errors'] += 1

    log.info('Token 健康检查完成: %s', stats)
    return stats


def _send_reauth_message(account, client, log):
    """向用户推送飞书消息引导重新授权（静默失败，不阻断流程）"""
    from django.conf import settings
    try:
        app_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '') or getattr(settings, 'FEISHU_APP_ID', '')
        redirect_base = getattr(settings, 'FEISHU_REDIRECT_BASE', 'http://118.196.64.48')
        auth_url = (
            f'https://open.feishu.cn/open-apis/authen/v1/authorize'
            f'?app_id={app_id}&redirect_uri={redirect_base}/login&response_type=code'
        )
        content = {
            'text': (
                f'您好，子衿知识库需要更新您的飞书数据授权。\n'
                f'请点击链接完成授权（约 5 秒）：\n{auth_url}\n'
                f'授权后系统将自动采集并保护您的工作知识资产。'
            )
        }
        client.send_message(
            receive_id=account.feishu_open_id,
            msg_type='text',
            content=str(content).replace("'", '"'),
            receive_id_type='open_id',
        )
        log.info('已推送重新授权消息: %s (%s)', account.display_name, account.feishu_open_id[:20])
    except Exception as e:
        log.debug('推送授权消息失败 %s: %s', account.display_name, e)


def _maybe_trigger_backfill(account, log, stats):
    """如果该用户 token 有效但 PersonalContext 为空，自动触发一次全量补采"""
    from apps.secretary.models import PersonalContext, FeishuMigrationCheckpoint

    has_data = PersonalContext.objects.filter(user_id=account.feishu_open_id).exists()
    if has_data:
        return

    all_completed = not FeishuMigrationCheckpoint.objects.filter(
        user_open_id=account.feishu_open_id,
        source_type__in=['mail', 'im', 'calendar', 'task', 'doc', 'wiki'],
        status__in=['pending', 'running'],
    ).exists()

    if all_completed:
        FeishuMigrationCheckpoint.objects.filter(
            user_open_id=account.feishu_open_id,
            source_type__in=['mail', 'im', 'calendar', 'task', 'doc', 'wiki'],
            status='completed',
        ).update(status='pending', page_token='', error_log='')
        log.info('自动重置补采 checkpoint: %s', account.display_name)
        stats['backfill_triggered'] += 1


@shared_task(
    name='apps.secretary.tasks.feishu_auto_backfill_sweep',
    bind=True, max_retries=1, default_retry_delay=1800,
)
def feishu_auto_backfill_sweep(self):
    """
    每 6 小时扫描 pending 的 checkpoint 并自动执行采集。
    覆盖：token 刚恢复的用户、新注册用户、之前 failed 被 reset 的用户。
    """
    import logging
    from django.core.management import call_command
    log = logging.getLogger('feishu_backfill')

    try:
        log.info('开始自动补采扫描...')
        call_command(
            'sweep_feishu_full_history',
            reset_failed=True,
            delay=0.5,
            no_deposit=True,
        )
        return {'status': 'ok', 'type': 'auto_backfill'}
    except Exception as e:
        log.error('自动补采失败: %s', e)
        raise self.retry(exc=e)


@shared_task(
    name='apps.secretary.tasks.feishu_approval_full_collect',
    bind=True, max_retries=1, default_retry_delay=1800,
)
def feishu_approval_full_collect(self):
    """
    审批全量采集（使用 tenant token）：
    1. 查询所有审批定义（approval_code）
    2. 对每个 code 遍历全部实例（带 start_time/end_time 分页）
    3. 对每个实例获取详情（form + 审批流）
    4. 写入 PersonalContext（source_type=approval）
    """
    import logging
    import time as _time
    from django.utils import timezone
    from libs.feishu_client import feishu_client
    from apps.secretary.feishu_fetcher import _save_context_items_idempotent, get_valid_user_token
    from apps.identity.models import Account

    log = logging.getLogger('feishu_approval')

    acc = Account.objects.filter(is_deleted=False, feishu_open_id__isnull=False).exclude(feishu_open_id='').first()
    user_token = get_valid_user_token(acc.id) if acc else None
    if not user_token:
        log.warning('无可用 user_token，无法获取审批定义列表')
        return {'status': 'error', 'reason': 'no_user_token'}

    approval_codes = []
    pt = ''
    while True:
        params = {'page_size': 100}
        if pt:
            params['page_token'] = pt
        try:
            data = feishu_client._user_request('GET', 'approval/v4/approvals', user_token, params=params)
        except Exception as e:
            log.error('获取审批定义失败: %s', e)
            break
        for item in data.get('items', []):
            code = item.get('approval_code', '')
            if code:
                approval_codes.append({'code': code, 'name': item.get('approval_name', '')})
        if not data.get('has_more'):
            break
        pt = data.get('page_token', '')

    log.info('审批定义总数: %d', len(approval_codes))

    now_ms = int(timezone.now().timestamp() * 1000)
    ten_years_ago_ms = now_ms - 10 * 365 * 86400 * 1000
    total_instances = 0
    total_saved = 0

    for ap in approval_codes:
        code = ap['code']
        ap_name = ap['name']
        page_token = ''
        instances_for_code = []

        while True:
            params = {
                'approval_code': code,
                'start_time': str(ten_years_ago_ms),
                'end_time': str(now_ms),
                'page_size': 100,
            }
            if page_token:
                params['page_token'] = page_token
            try:
                data = feishu_client._request('GET', 'approval/v4/instances', params=params)
            except Exception as e:
                log.warning('查询审批实例失败 %s: %s', code[:20], e)
                break

            instance_codes = data.get('instance_code_list', [])
            instances_for_code.extend(instance_codes)

            if not data.get('has_more'):
                break
            page_token = data.get('page_token', '')
            _time.sleep(0.2)

        total_instances += len(instances_for_code)

        items_to_save = []
        for inst_code in instances_for_code:
            try:
                detail = feishu_client._request(
                    'GET', f'approval/v4/instances/{inst_code}',
                )
            except Exception as e:
                log.debug('获取审批实例详情失败 %s: %s', inst_code, e)
                continue

            user_id = detail.get('user_id', '') or detail.get('open_id', '')
            form_str = detail.get('form', '[]')
            timeline = detail.get('timeline', [])
            status = detail.get('status', '')

            import json
            try:
                form_parsed = json.loads(form_str) if isinstance(form_str, str) else form_str
            except Exception:
                form_parsed = form_str

            summary = f'[{ap_name}] {status}'
            raw_parts = [f'审批: {ap_name}', f'状态: {status}']
            if isinstance(form_parsed, list):
                for field in form_parsed[:20]:
                    name = field.get('name', '')
                    value = field.get('value', '')
                    if name and value:
                        raw_parts.append(f'{name}: {value}')

            items_to_save.append({
                'source_id': inst_code,
                'summary': summary[:500],
                'raw_content': '\n'.join(raw_parts)[:50000],
                'metadata': {
                    'approval_code': code,
                    'approval_name': ap_name,
                    'status': status,
                    'form': form_parsed,
                    'timeline': timeline[:10],
                    'user_id': user_id,
                },
            })
            _time.sleep(0.05)

        if items_to_save:
            saved = _save_context_items_idempotent('__TENANT__', 'approval', items_to_save)
            total_saved += saved
            if saved > 0:
                log.info('审批 %s: 保存 %d 条', ap_name, saved)

    log.info('审批采集完成: 定义=%d 实例=%d 保存=%d', len(approval_codes), total_instances, total_saved)
    return {'approval_codes': len(approval_codes), 'instances': total_instances, 'saved': total_saved}


@shared_task(
    name='apps.secretary.tasks.feishu_knowledge_ingest',
    bind=True, max_retries=1, default_retry_delay=1800,
)
def feishu_knowledge_ingest(self):
    """
    定时将 PersonalContext 批量入库为 KnowledgeEntry。
    每次处理最多 2000 条未入库记录，避免单次运行时间过长。
    """
    import logging
    from django.core.management import call_command
    log = logging.getLogger('feishu_knowledge_ingest')

    try:
        log.info('开始 PersonalContext → KnowledgeEntry 入库...')
        call_command(
            'process_pending_contexts',
            batch_size=100,
            limit=2000,
            no_llm=True,
        )
        return {'status': 'ok', 'type': 'knowledge_ingest'}
    except Exception as e:
        log.error('知识入库失败: %s', e)
        raise self.retry(exc=e)


@shared_task(
    name='apps.secretary.tasks.feishu_token_expiry_morning_alert',
    bind=True,
    max_retries=1,
)
def feishu_token_expiry_morning_alert(self):
    """
    每天早上 8:30 执行：
    1. 扫描所有 access_token 完全失效（refresh_token 也过期或不存在）的账号
    2. 向「CN_KIS_PLATFORM开发小组」群发汇总消息（含过期用户名单）
    3. 逐人发飞书私信，引导重新登录授权
    """
    import json
    import logging
    from django.utils import timezone
    from apps.identity.models import Account
    from apps.secretary.models import FeishuUserToken
    from libs.feishu_client import feishu_client
    from django.conf import settings

    log = logging.getLogger('feishu_token_expiry_alert')
    now = timezone.now()

    DEV_GROUP_CHAT_ID = getattr(settings, 'FEISHU_DEV_GROUP_CHAT_ID', '')
    app_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '') or getattr(settings, 'FEISHU_APP_ID', '')
    redirect_base = getattr(settings, 'FEISHU_REDIRECT_BASE', 'http://118.196.64.48')
    auth_url = (
        f'https://open.feishu.cn/open-apis/authen/v1/authorize'
        f'?app_id={app_id}&redirect_uri={redirect_base}/login&response_type=code'
    )

    accounts = Account.objects.filter(
        is_deleted=False,
        feishu_open_id__isnull=False,
    ).exclude(feishu_open_id='').order_by('display_name')

    expired_users = []

    for account in accounts:
        token_record = FeishuUserToken.objects.filter(account_id=account.id).first()

        if not token_record or not token_record.access_token:
            expired_users.append(account)
            continue

        access_expired = token_record.token_expires_at and now >= token_record.token_expires_at
        if not access_expired:
            continue

        refresh_expired = (
            not token_record.refresh_token
            or (token_record.refresh_expires_at and now >= token_record.refresh_expires_at)
        )
        if refresh_expired:
            expired_users.append(account)

    log.info('token 过期用户总数: %d', len(expired_users))

    # ── 1. 向开发群发汇总消息 ──────────────────────────────────────
    if DEV_GROUP_CHAT_ID and expired_users:
        names = '、'.join(a.display_name for a in expired_users)
        summary_text = (
            f'【子衿知识库·Token 过期提醒】\n'
            f'📅 {now.strftime("%Y-%m-%d")} 早报\n\n'
            f'以下 {len(expired_users)} 位用户的飞书授权已完全失效，\n'
            f'数据采集已中断，请督促本人重新登录系统完成授权：\n\n'
            f'{names}\n\n'
            f'🔗 授权链接：{auth_url}'
        )
        try:
            feishu_client.send_message(
                receive_id=DEV_GROUP_CHAT_ID,
                msg_type='text',
                content=json.dumps({'text': summary_text}),
                receive_id_type='chat_id',
            )
            log.info('开发群汇总消息发送成功，过期用户数: %d', len(expired_users))
        except Exception as e:
            log.warning('开发群消息发送失败: %s', e)
    elif not DEV_GROUP_CHAT_ID:
        log.warning('FEISHU_DEV_GROUP_CHAT_ID 未配置，跳过开发群通知')
    else:
        log.info('无过期用户，不发开发群通知')
        if DEV_GROUP_CHAT_ID:
            try:
                feishu_client.send_message(
                    receive_id=DEV_GROUP_CHAT_ID,
                    msg_type='text',
                    content=json.dumps({'text': f'【子衿知识库·Token 状态】{now.strftime("%Y-%m-%d")} 所有用户授权正常 ✅'}),
                    receive_id_type='chat_id',
                )
            except Exception:
                pass

    # ── 2. 逐人发私信引导重新授权 ────────────────────────────────
    personal_notified = 0
    personal_failed = 0
    for account in expired_users:
        try:
            personal_text = (
                f'您好 {account.display_name}，\n\n'
                f'子衿知识库检测到您的飞书授权已失效，数据自动采集已暂停。\n'
                f'请点击以下链接完成一次重新授权（约 5 秒）：\n\n'
                f'{auth_url}\n\n'
                f'授权后系统将自动恢复数据采集，感谢配合 🙏'
            )
            feishu_client.send_message(
                receive_id=account.feishu_open_id,
                msg_type='text',
                content=json.dumps({'text': personal_text}),
                receive_id_type='open_id',
            )
            personal_notified += 1
            log.info('个人通知已发送: %s (%s)', account.display_name, account.feishu_open_id[:20])
        except Exception as e:
            personal_failed += 1
            log.warning('个人通知发送失败 %s: %s', account.display_name, e)

    result = {
        'expired_count': len(expired_users),
        'personal_notified': personal_notified,
        'personal_failed': personal_failed,
    }
    log.info('token 过期晨报完成: %s', result)
    return result
