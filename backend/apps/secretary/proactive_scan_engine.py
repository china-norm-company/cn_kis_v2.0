"""
Phase 6 主动扫描引擎

三条管线：
1. TrendMonitorPipeline  — 外部趋势主动预警（每日）
2. ClientPeriodicPipeline — 重点客户定期洞察（每周）
3. ProjectScoutPipeline   — 下一项目主动推荐（每月）

每条管线继承 BaseScanPipeline，实现 collect → analyse → deduplicate → persist 四步。
"""
import logging
import uuid
from abc import ABC, abstractmethod
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from .models import (
    InsightStatus,
    InsightType,
    ProactiveInsight,
    ProactiveScanConfig,
    ProactiveScanRun,
    ScanRunStatus,
)

logger = logging.getLogger(__name__)

AI_ENABLED = getattr(settings, 'MAIL_SIGNAL_AI_ENABLED', True) and not (
    __import__('os').environ.get('MAIL_SIGNAL_AI_DISABLED', '') == '1'
)

MAX_AI_CALLS_PER_SCAN = int(__import__('os').environ.get('PROACTIVE_MAX_AI_CALLS', '10'))
DEDUP_WINDOW_DAYS = 7
DEDUP_TITLE_SIMILARITY_THRESHOLD = 0.8
MAX_INSIGHTS_PER_CLIENT_PER_DAY = 3
MIN_RELEVANCE_SCORE = 0.5


# ============================================================================
# Pipeline 基类
# ============================================================================

class BaseScanPipeline(ABC):
    """所有扫描管线的基类"""

    scan_type: str = ''
    insight_type: str = ''

    def execute(self, config: Optional[ProactiveScanConfig] = None) -> Dict[str, Any]:
        batch_id = f'{self.scan_type}_{timezone.now().strftime("%Y%m%d_%H%M")}_{uuid.uuid4().hex[:8]}'
        run = self._create_run(config, batch_id)

        try:
            run.status = ScanRunStatus.RUNNING
            run.started_at = timezone.now()
            run.save(update_fields=['status', 'started_at'])

            raw_signals = self.collect(config)
            run.raw_signals_count = len(raw_signals)
            run.save(update_fields=['raw_signals_count'])

            insights_data = self.analyse(raw_signals, config)
            run.insights_generated = len(insights_data)

            deduped = self.deduplicate(insights_data)
            run.insights_deduplicated = len(deduped)

            created_ids = self.persist(deduped, batch_id)

            run.status = ScanRunStatus.COMPLETED
            run.completed_at = timezone.now()
            if run.started_at:
                run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()

            if config:
                config.last_run_at = timezone.now()
                config.last_run_result = {
                    'batch_id': batch_id,
                    'raw': len(raw_signals),
                    'generated': len(insights_data),
                    'deduped': len(deduped),
                    'persisted': len(created_ids),
                }
                config.run_count = (config.run_count or 0) + 1
                config.save(update_fields=['last_run_at', 'last_run_result', 'run_count'])

            logger.info(
                'Scan %s complete: raw=%d generated=%d deduped=%d persisted=%d',
                batch_id, len(raw_signals), len(insights_data), len(deduped), len(created_ids),
            )
            return {'batch_id': batch_id, 'status': 'completed', 'persisted': len(created_ids)}

        except Exception as e:
            run.status = ScanRunStatus.FAILED
            run.error_log = str(e)[:2000]
            run.completed_at = timezone.now()
            if run.started_at:
                run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            logger.exception('Scan %s failed: %s', batch_id, e)
            return {'batch_id': batch_id, 'status': 'failed', 'error': str(e)[:200]}

    def _create_run(self, config: Optional[ProactiveScanConfig], batch_id: str) -> ProactiveScanRun:
        if not config:
            config, _ = ProactiveScanConfig.objects.get_or_create(
                scan_type=self.scan_type,
                name=f'default_{self.scan_type}',
                defaults={'enabled': True, 'frequency': 'daily'},
            )
        return ProactiveScanRun.objects.create(config=config, batch_id=batch_id)

    @abstractmethod
    def collect(self, config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        """采集原始信号"""

    @abstractmethod
    def analyse(self, raw_signals: List[dict], config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        """AI 分析，生成洞察候选"""

    def deduplicate(self, insights_data: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        """去重 + 降噪"""
        cutoff = timezone.now() - timedelta(days=DEDUP_WINDOW_DAYS)
        recent_titles = set(
            ProactiveInsight.objects.filter(
                insight_type=self.insight_type,
                created_at__gte=cutoff,
            ).values_list('title', flat=True)
        )

        result = []
        daily_counts: Dict[Optional[int], int] = {}

        for item in insights_data:
            if item.get('relevance_score', 0) < MIN_RELEVANCE_SCORE:
                continue

            title = item.get('title', '')
            if title in recent_titles:
                continue

            cid = item.get('client_id')
            if cid is not None:
                count = daily_counts.get(cid, 0)
                if count >= MAX_INSIGHTS_PER_CLIENT_PER_DAY:
                    continue
                daily_counts[cid] = count + 1

            recent_titles.add(title)
            result.append(item)

        return result

    def persist(self, insights_data: list[Dict[str, Any]], batch_id: str) -> List[int]:
        created_ids = []
        default_expiry = timezone.now() + timedelta(days=14)

        for item in insights_data:
            obj = ProactiveInsight.objects.create(
                insight_type=self.insight_type,
                title=item.get('title', ''),
                summary=item.get('summary', ''),
                detail=item.get('detail', {}),
                client_id=item.get('client_id'),
                client_name=item.get('client_name', ''),
                related_categories=item.get('related_categories', []),
                related_claim_types=item.get('related_claim_types', []),
                trigger_source='scheduled_scan',
                scan_batch_id=batch_id,
                source_evidence_refs=item.get('source_evidence_refs', []),
                priority=item.get('priority', 'medium'),
                relevance_score=item.get('relevance_score', 0.0),
                urgency_score=item.get('urgency_score', 0.0),
                impact_score=item.get('impact_score', 0.0),
                status=InsightStatus.DRAFT,
                expires_at=item.get('expires_at', default_expiry),
                governance_level='internal_draft',
            )
            created_ids.append(obj.id)
        return created_ids


# ============================================================================
# 管线 1：外部趋势主动预警
# ============================================================================

class TrendMonitorPipeline(BaseScanPipeline):
    scan_type = 'trend_monitor'
    insight_type = InsightType.TREND_ALERT

    def collect(self, config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        from .mail_signal_external_evidence_service import fetch_external_evidence

        sources = ['regulation_search', 'social_trend', 'nmpa_filing', 'competitor_claims']
        if config and config.data_sources:
            sources = config.data_sources

        signals: list[Dict[str, Any]] = []
        for src in sources:
            try:
                items = fetch_external_evidence(src, 'latest trends')
                for item in items:
                    signals.append({
                        'source_type': src,
                        'code': item.get('code', ''),
                        'title': item.get('title', ''),
                        'summary': item.get('summary', ''),
                        'keywords': item.get('keywords', []),
                    })
            except Exception as e:
                logger.warning('Trend collect failed for %s: %s', src, e)
        return signals

    def analyse(self, raw_signals: List[dict], config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        if not raw_signals:
            return []

        clients = self._get_active_clients(config)
        if not clients:
            return self._signals_to_insights_no_client(raw_signals)

        return self._match_signals_to_clients(raw_signals, clients)

    def _get_active_clients(self, config: Optional[ProactiveScanConfig]) -> List[dict]:
        try:
            from apps.crm.models import Client
        except ImportError:
            return []

        qs = Client.objects.all()
        if config and config.target_client_ids:
            qs = qs.filter(id__in=config.target_client_ids)

        return list(qs.values(
            'id', 'name', 'main_categories', 'main_claim_types', 'regulatory_regions', 'partnership_tier',
        )[:100])

    def _match_signals_to_clients(
        self, signals: List[dict], clients: List[dict]
    ) -> list[Dict[str, Any]]:
        results: list[Dict[str, Any]] = []
        ai_calls = 0

        for signal in signals:
            signal_keywords = set(signal.get('keywords', []))
            signal_title = signal.get('title', '').lower()

            for client in clients:
                categories = client.get('main_categories') or []
                claim_types = client.get('main_claim_types') or []
                regions = client.get('regulatory_regions') or []
                client_keywords = set(
                    [str(c).lower() for c in categories]
                    + [str(c).lower() for c in claim_types]
                    + [str(r).lower() for r in regions]
                )

                overlap = signal_keywords & client_keywords
                title_hit = any(kw in signal_title for kw in client_keywords if kw)
                if not overlap and not title_hit:
                    continue

                relevance = min(1.0, len(overlap) * 0.3 + (0.3 if title_hit else 0.0))

                if AI_ENABLED and ai_calls < MAX_AI_CALLS_PER_SCAN and relevance >= 0.3:
                    ai_result = self._ai_assess(signal, client)
                    ai_calls += 1
                    if ai_result:
                        relevance = max(relevance, ai_result.get('relevance', relevance))

                if relevance < MIN_RELEVANCE_SCORE:
                    continue

                priority = 'high' if relevance >= 0.8 else ('medium' if relevance >= 0.6 else 'low')

                results.append({
                    'title': f'{signal.get("title", "")}',
                    'summary': signal.get('summary', ''),
                    'detail': {
                        'executive_summary': signal.get('summary', ''),
                        'key_findings': list(overlap) if overlap else [signal.get('title', '')],
                        'evidence_chain': [{'source': signal.get('source_type'), 'title': signal.get('title')}],
                        'recommended_actions': [f'建议关注此趋势对{client["name"]}的影响'],
                    },
                    'client_id': client['id'],
                    'client_name': client.get('name', ''),
                    'related_categories': categories,
                    'related_claim_types': claim_types,
                    'source_evidence_refs': [{
                        'source_type': signal.get('source_type'),
                        'code': signal.get('code'),
                        'title': signal.get('title'),
                    }],
                    'priority': priority,
                    'relevance_score': relevance,
                    'urgency_score': 0.5,
                    'impact_score': relevance * 0.8,
                })

        return results

    def _signals_to_insights_no_client(self, signals: List[dict]) -> list[Dict[str, Any]]:
        """无客户数据时，生成通用趋势预警"""
        return [
            {
                'title': s.get('title', ''),
                'summary': s.get('summary', ''),
                'detail': {
                    'executive_summary': s.get('summary', ''),
                    'key_findings': s.get('keywords', []),
                    'evidence_chain': [{'source': s.get('source_type'), 'title': s.get('title')}],
                    'recommended_actions': ['建议关注此行业趋势'],
                },
                'source_evidence_refs': [{'source_type': s.get('source_type'), 'code': s.get('code'), 'title': s.get('title')}],
                'priority': 'medium',
                'relevance_score': 0.6,
                'urgency_score': 0.5,
                'impact_score': 0.5,
            }
            for s in signals[:20]
        ]

    def _ai_assess(self, signal: dict, client: dict) -> Optional[dict]:
        try:
            from apps.agent_gateway.services import quick_chat
            prompt = (
                f'以下是一条行业趋势信息：\n'
                f'标题：{signal.get("title", "")}\n'
                f'摘要：{signal.get("summary", "")}\n\n'
                f'客户：{client.get("name", "")}，'
                f'主营品类：{", ".join(client.get("main_categories") or [])}，'
                f'关注宣称：{", ".join(client.get("main_claim_types") or [])}\n\n'
                f'请判断这条趋势对该客户的相关性(0-1)，并给出一句话建议。'
                f'回复格式：relevance: 0.X | suggestion: ...'
            )
            resp = quick_chat(prompt, provider='kimi', model='moonshot-v1-32k')
            if resp and 'relevance' in resp:
                parts = resp.split('|')
                rel_part = [p for p in parts if 'relevance' in p.lower()]
                if rel_part:
                    import re
                    match = re.search(r'(\d+\.?\d*)', rel_part[0])
                    if match:
                        return {'relevance': float(match.group(1))}
        except Exception as e:
            logger.warning('AI assess failed: %s', e)
        return None


# ============================================================================
# 管线 2：重点客户定期洞察
# ============================================================================

class ClientPeriodicPipeline(BaseScanPipeline):
    scan_type = 'client_periodic'
    insight_type = InsightType.CLIENT_PERIODIC

    def collect(self, config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        try:
            from apps.crm.models import Client
        except ImportError:
            return []

        qs = Client.objects.filter(
            Q(partnership_tier__in=['strategic', 'premium']) | Q(level__in=['VIP', 'key'])
        )
        if config and config.target_client_ids:
            qs = qs.filter(id__in=config.target_client_ids)

        clients = list(qs.values(
            'id', 'name', 'main_categories', 'main_claim_types',
            'partnership_tier', 'total_projects', 'total_revenue',
        )[:30])

        cutoff_30d = timezone.now() - timedelta(days=30)

        result = []
        for c in clients:
            mail_count = 0
            action_count = 0
            try:
                from .mail_signal_ingest import MailSignalEvent
                from .models import AssistantActionPlan
                mail_count = MailSignalEvent.objects.filter(
                    sender_domain__icontains=c.get('name', 'NOMATCH')[:10],
                    created_at__gte=cutoff_30d,
                ).count()
                action_count = AssistantActionPlan.objects.filter(
                    target_object_refs__contains=[{'type': 'client', 'id': c['id']}],
                    created_at__gte=cutoff_30d,
                ).count()
            except Exception:
                pass

            result.append({
                **c,
                'recent_mail_count': mail_count,
                'recent_action_count': action_count,
            })

        return result

    def analyse(self, raw_signals: List[dict], config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        results = []
        for client_ctx in raw_signals:
            summary_parts = [
                f'客户 {client_ctx["name"]}',
                f'合作等级 {client_ctx.get("partnership_tier", "-")}',
                f'累计项目 {client_ctx.get("total_projects", 0)}',
                f'近30天邮件 {client_ctx.get("recent_mail_count", 0)}',
                f'近30天任务 {client_ctx.get("recent_action_count", 0)}',
            ]
            summary = '，'.join(summary_parts)

            relevance = 0.7
            if client_ctx.get('recent_mail_count', 0) > 5:
                relevance = 0.9
            elif client_ctx.get('recent_mail_count', 0) == 0:
                relevance = 0.5

            results.append({
                'title': f'{client_ctx["name"]} — 本周客户洞察',
                'summary': summary,
                'detail': {
                    'executive_summary': summary,
                    'key_findings': [
                        f'近30天邮件交互 {client_ctx.get("recent_mail_count", 0)} 次',
                        f'近30天任务执行 {client_ctx.get("recent_action_count", 0)} 条',
                    ],
                    'recommended_actions': ['建议客户经理本周主动跟进'],
                },
                'client_id': client_ctx['id'],
                'client_name': client_ctx['name'],
                'related_categories': client_ctx.get('main_categories', []),
                'related_claim_types': client_ctx.get('main_claim_types', []),
                'priority': 'medium',
                'relevance_score': relevance,
                'urgency_score': 0.4,
                'impact_score': 0.6,
            })
        return results


# ============================================================================
# 管线 3：下一项目主动推荐
# ============================================================================

class ProjectScoutPipeline(BaseScanPipeline):
    scan_type = 'project_scout'
    insight_type = InsightType.PROJECT_RECOMMENDATION

    def collect(self, config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        try:
            from apps.crm.models import Client, InnovationCalendar
        except ImportError:
            return []

        cutoff_6m = timezone.now() - timedelta(days=180)
        clients = list(
            Client.objects.filter(total_projects__gte=1)
            .values('id', 'name', 'main_categories', 'main_claim_types', 'total_projects')[:50]
        )

        result = []
        for c in clients:
            calendars = list(InnovationCalendar.objects.filter(
                client_id=c['id'],
                status__in=['planned', 'concept'],
            ).values('product_concept', 'innovation_type', 'test_requirements', 'season', 'year')[:5])

            result.append({**c, 'innovation_calendar': calendars})
        return result

    def analyse(self, raw_signals: List[dict], config: Optional[ProactiveScanConfig]) -> list[Dict[str, Any]]:
        results = []
        for client_ctx in raw_signals:
            calendars = client_ctx.get('innovation_calendar', [])
            if not calendars:
                continue

            for cal in calendars:
                title = f'{client_ctx["name"]} — {cal.get("product_concept", "新项目")}可能机会'
                results.append({
                    'title': title,
                    'summary': f'基于创新日历，{client_ctx["name"]}在{cal.get("year", "")} {cal.get("season", "")}有{cal.get("innovation_type", "")}计划',
                    'detail': {
                        'executive_summary': title,
                        'key_findings': [
                            f'产品概念：{cal.get("product_concept", "")}',
                            f'创新类型：{cal.get("innovation_type", "")}',
                            f'测试需求：{cal.get("test_requirements", "")}',
                        ],
                        'recommended_actions': [f'建议客户经理联系{client_ctx["name"]}确认项目意向'],
                    },
                    'client_id': client_ctx['id'],
                    'client_name': client_ctx['name'],
                    'related_categories': client_ctx.get('main_categories', []),
                    'priority': 'high',
                    'relevance_score': 0.8,
                    'urgency_score': 0.6,
                    'impact_score': 0.7,
                })
        return results
