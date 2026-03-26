"""
sync_learning_to_agent — C5 Track: 学习报告 → 智能体策略升级

功能：
  将 GapReporter 生成的 ProactiveInsight（data-insight 类）和
  import_learning 类 KnowledgeEntry 转化为 WorkerPolicyUpdate 建议，
  推动智能体策略从历史数据自动进化。

闭环流程：
  LearningReport（数据洞察） → ProactiveInsight（待处理洞察）
    → WorkerPolicyUpdate（策略更新建议，status=draft）
      → [人工确认后] status=active → train_agent 训练融入

使用方式：
    python manage.py sync_learning_to_agent [--agent general-assistant] [--dry-run]
    python manage.py sync_learning_to_agent --review-existing  # 显示待评审的策略更新
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)

# 智能体机会 → 对应工作节点的映射
AGENT_OPPORTUNITY_MAP = {
    '受试者-项目历史参与关系自动构建': {
        'worker_code': 'subject-matching-agent',
        'policy_key': 'subject_project_graph_retrieval',
    },
    '新注册受试者自动初始画像生成': {
        'worker_code': 'subject-matching-agent',
        'policy_key': 'initial_profile_generation',
    },
    '招募推荐自动化': {
        'worker_code': 'subject-matching-agent',
        'policy_key': 'recruitment_recommendation',
    },
    '顽固 UNKNOWN 邮件规律学习': {
        'worker_code': 'mail-signal-classifier',
        'policy_key': 'unknown_signal_reclassification',
    },
    '新注册受试者': {
        'worker_code': 'subject-matching-agent',
        'policy_key': 'new_subject_onboarding',
    },
    '自动分类': {
        'worker_code': 'general-assistant',
        'policy_key': 'auto_classification',
    },
}

KNOWN_WORKERS = {
    'general-assistant',
    'subject-matching-agent',
    'mail-signal-classifier',
    'knowledge-agent',
}


class Command(BaseCommand):
    help = 'C5 Track: 将学习循环洞察同步为智能体策略更新建议'

    def add_arguments(self, parser):
        parser.add_argument(
            '--agent', type=str, default='',
            help='只处理指定 worker_code（空=全部）',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='只分析，不写入 WorkerPolicyUpdate',
        )
        parser.add_argument(
            '--review-existing', action='store_true',
            help='显示现有 draft/evaluating 状态的策略更新，供人工决策',
        )
        parser.add_argument(
            '--days-back', type=int, default=30,
            help='回溯多少天内的洞察（默认 30 天）',
        )

    def handle(self, *args, **options):
        if options['review_existing']:
            self._review_existing_policies()
            return

        dry_run = options['dry_run']
        agent_filter = options['agent']
        days_back = options['days_back']
        cutoff = timezone.now() - timedelta(days=days_back)

        self.stdout.write(f'=== 学习循环 → 智能体策略同步（C5 Track）===')
        self.stdout.write(f'回溯：最近 {days_back} 天 | DRY-RUN：{"是" if dry_run else "否"}')
        self.stdout.write('')

        # ── Step 1：读取 GapReporter 生成的 ProactiveInsight ────────────
        from apps.secretary.models import ProactiveInsight

        qs = ProactiveInsight.objects.filter(
            trigger_source__startswith='GapReporter',
            status='draft',
            created_at__gte=cutoff,
        ).order_by('-created_at')

        insights = list(qs)
        self.stdout.write(f'找到 {len(insights)} 条待处理的 data-insight ProactiveInsight')

        # ── Step 2：读取 import_learning KnowledgeEntry ──────────────────
        from apps.knowledge.models import KnowledgeEntry

        learning_entries = list(
            KnowledgeEntry.objects.filter(
                source_type='import_learning',
                create_time__gte=cutoff,
            ).order_by('-create_time')[:20]
        )
        self.stdout.write(f'找到 {len(learning_entries)} 条学习报告知识条目')

        # ── Step 3：生成 WorkerPolicyUpdate 建议 ────────────────────────
        created_count = 0
        skipped_count = 0

        for insight in insights:
            detail = insight.detail if isinstance(insight.detail, dict) else {}
            scenario = detail.get('scenario', insight.title)

            # 根据场景关键词匹配 worker
            matched_worker = None
            matched_policy = None
            for keyword, mapping in AGENT_OPPORTUNITY_MAP.items():
                if keyword in (insight.title + scenario):
                    matched_worker = mapping['worker_code']
                    matched_policy = mapping['policy_key']
                    break

            if not matched_worker:
                matched_worker = 'general-assistant'
                matched_policy = 'general_knowledge_utilization'

            if agent_filter and matched_worker != agent_filter:
                skipped_count += 1
                continue

            result = self._create_policy_update(
                worker_code=matched_worker,
                policy_key=matched_policy,
                outcome=detail.get('current_pain', insight.summary or ''),
                root_cause=f'系统历史数据分析显示：{scenario}',
                better_policy=detail.get('agent_value', ''),
                evidence={
                    'insight_id': insight.id,
                    'insight_title': insight.title,
                    'data_evidence': detail.get('data_evidence', ''),
                    'implementation_hint': detail.get('implementation_hint', ''),
                    'source_import': detail.get('source_import', ''),
                },
                dry_run=dry_run,
            )
            if result:
                created_count += 1
                self.stdout.write(
                    f'  ✓ {matched_worker}/{matched_policy}: '
                    f'{insight.title[:50]}'
                )
            else:
                skipped_count += 1

        # ── Step 4：从 KnowledgeEntry 中提取通用知识利用机会 ────────────
        for entry in learning_entries[:5]:
            if not entry.content:
                continue
            # 从学习报告中提取智能体机会段落
            content = entry.content
            if '智能体机会' not in content and '智能体介入' not in content:
                continue

            if agent_filter and agent_filter != 'general-assistant':
                continue

            result = self._create_policy_update(
                worker_code='knowledge-agent',
                policy_key='historical_data_pattern_utilization',
                outcome=f'学习报告知识条目 "{entry.title}" 中包含可供智能体利用的历史规律',
                root_cause='历史导入数据的统计规律尚未被智能体实际利用',
                better_policy=(
                    f'基于 "{entry.title}" 中的规律，'
                    f'更新知识检索策略以优先返回此类历史数据洞察'
                ),
                evidence={
                    'entry_id': entry.id,
                    'entry_title': entry.title,
                    'source_type': entry.source_type,
                    'source_key': entry.source_key or '',
                },
                dry_run=dry_run,
            )
            if result:
                created_count += 1

        # ── 汇报 ─────────────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(f'=== 结果 ===')
        self.stdout.write(f'创建 WorkerPolicyUpdate：{created_count} 条')
        self.stdout.write(f'跳过（已存在/不匹配）：{skipped_count} 条')
        self.stdout.write('')

        if created_count > 0 and not dry_run:
            self.stdout.write(
                '下一步：运行 `python manage.py train_agent <worker-id>` 让智能体学习这些策略更新\n'
                '或运行 `python manage.py sync_learning_to_agent --review-existing` 查看待评审的策略'
            )

    def _create_policy_update(self, worker_code: str, policy_key: str,
                               outcome: str, root_cause: str, better_policy: str,
                               evidence: dict, dry_run: bool):
        """创建 WorkerPolicyUpdate（幂等：同一 worker+policy+root_cause 不重复创建）。"""
        from apps.secretary.models_memory import WorkerPolicyUpdate

        # 幂等检查
        existing = WorkerPolicyUpdate.objects.filter(
            worker_code=worker_code,
            policy_key=policy_key,
            status__in=['draft', 'evaluating', 'active'],
        ).filter(root_cause__contains=root_cause[:80]).first()

        if existing:
            logger.debug('WorkerPolicyUpdate 已存在，跳过: %s/%s', worker_code, policy_key)
            return None

        if dry_run:
            logger.info('[DRY-RUN] 将创建 WorkerPolicyUpdate: %s/%s', worker_code, policy_key)
            return object()

        try:
            update = WorkerPolicyUpdate.objects.create(
                worker_code=worker_code,
                domain_code='data_learning',
                policy_key=policy_key,
                outcome=outcome[:500],
                root_cause=root_cause[:500],
                better_policy=better_policy[:1000],
                evidence=evidence,
                replay_score=0.0,
                status=WorkerPolicyUpdate.Status.DRAFT,
            )
            logger.info('WorkerPolicyUpdate 创建成功: #%s %s/%s', update.id, worker_code, policy_key)
            return update
        except Exception as e:
            logger.error('创建 WorkerPolicyUpdate 失败: %s', e)
            return None

    def _review_existing_policies(self):
        """显示现有待评审的 WorkerPolicyUpdate，供人工决策。"""
        from apps.secretary.models_memory import WorkerPolicyUpdate

        pending = WorkerPolicyUpdate.objects.filter(
            status__in=['draft', 'evaluating'],
        ).order_by('worker_code', 'policy_key')

        if not pending.exists():
            self.stdout.write('没有待评审的策略更新。')
            return

        self.stdout.write(f'=== 待评审策略更新（{pending.count()} 条）===\n')

        for p in pending:
            age = (timezone.now() - p.created_at).days
            self.stdout.write(
                f'#{p.id} [{p.status}] {p.worker_code}/{p.policy_key}（{age} 天前）'
            )
            self.stdout.write(f'  当前问题：{p.outcome[:100]}')
            self.stdout.write(f'  建议策略：{p.better_policy[:100]}')
            self.stdout.write(f'  激活命令：WorkerPolicyUpdate.objects.filter(id={p.id}).update(status="active")')
            self.stdout.write('')

        self.stdout.write('提示：确认策略后运行 train_agent 将其注入智能体：')
        self.stdout.write('  python manage.py train_agent general-assistant -n 2')
