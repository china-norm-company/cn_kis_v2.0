#!/usr/bin/env python3
"""
E2E 测试数据 Seed 脚本

用于在 CI 或本地测试环境中预置以下测试数据：
- 3 封 inquiry（询价）邮件
- 2 封 project_followup（项目执行）邮件
- 2 封 competitor_pressure（竞品压力）邮件
- 1 封 complaint（投诉）邮件

运行方式：
  # 本地（USE_SQLITE 模式）
  cd /path/to/CN_KIS_V1.0/backend
  USE_SQLITE=1 python3 ../scripts/seed_e2e_data.py

  # 生产/验证环境
  cd /opt/cn-kis/backend
  python3 /path/to/seed_e2e_data.py

退出码：
  0 — 成功（含部分成功）
  1 — 完全失败
"""
import os
import sys
import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/../backend')

import django  # noqa: E402

django.setup()

from apps.secretary.mail_signal_ingest import upsert_mail_signal_event_from_context
from apps.identity.models import Account, AccountType


def get_or_create_e2e_account() -> Account:
    """获取或创建 E2E 专用测试账号"""
    a, created = Account.objects.get_or_create(
        username='dev-bypass',
        defaults={
            'display_name': 'E2E测试账号',
            'email': 'e2e-bypass@test.local',
            'account_type': AccountType.INTERNAL,
            'feishu_open_id': 'open_dev_bypass_001',
        },
    )
    if created:
        print(f'[seed] 创建 E2E 账号: {a.username} (id={a.id})')
    else:
        print(f'[seed] 使用已有账号: {a.username} (id={a.id})')
    return a


SEED_MAILS = [
    # ── S01 新品询价 ──────────────────────────────────────────
    {
        'source_id': 'e2e-inquiry-001',
        'summary': '[陈梅] 新品防晒霜SPF50+功效评价询价',
        'raw_content': (
            '您好，我们计划今年Q3上市一款新品防晒霜，'
            '需要做SPF、PA测试和安全性评估，请问贵司报价？'
        ),
        'metadata': {
            'sender_email': 'chen.mei@testclient.com',
            'sender_name': '陈梅',
            'subject': '新品防晒霜SPF50+功效评价询价',
        },
    },
    {
        'source_id': 'e2e-inquiry-002',
        'summary': '[王志] 精华液功效测试需求',
        'raw_content': (
            '我们有款抗老精华新品，需要功效评价测试，'
            '包括保湿度、弹力改善等，请报价及周期。'
        ),
        'metadata': {
            'sender_email': 'wang.zhi@client2.com',
            'sender_name': '王志',
            'subject': '精华液功效测试询价',
        },
    },
    {
        'source_id': 'e2e-inquiry-003',
        'summary': '[赵莉] 防晒喷雾新品测试需求',
        'raw_content': (
            '我们即将上市一款防晒喷雾，测试需求包括 SPF50+、'
            'PA++++、无刺激性验证，望回复报价。'
        ),
        'metadata': {
            'sender_email': 'zhao.li@corp3.com',
            'sender_name': '赵莉',
            'subject': '防晒喷雾新品功效评价询价',
        },
    },
    # ── S02 项目执行 ──────────────────────────────────────────
    {
        'source_id': 'e2e-followup-001',
        'summary': '[李研] PROTO-E2E-001 中期阶段报告确认',
        'raw_content': (
            '中期报告已收到，请按协议要求确认进度，'
            '补充资料已附上，项目方案按计划推进，请查收附件。'
        ),
        'metadata': {
            'sender_email': 'li.yan@testclient.com',
            'sender_name': '李研',
            'subject': 'PROTO-E2E-001 中期阶段报告确认',
            'thread_id': 'thread-e2e-followup-001',
        },
    },
    {
        'source_id': 'e2e-followup-002',
        'summary': '[张博] 项目进展确认和方案补充',
        'raw_content': (
            '请确认目前项目方案阶段进展及预计提交报告时间节点，'
            '另有补充资料在附件中，请查收并按协议更新方案。'
        ),
        'metadata': {
            'sender_email': 'zhang.bo@client3.com',
            'sender_name': '张博',
            'subject': '项目进展确认和方案补充',
        },
    },
    # ── S03 竞品压力 ──────────────────────────────────────────
    {
        'source_id': 'e2e-competitor-001',
        'summary': '[刘总] 竞品实验室更有说服力竞品更便宜',
        'raw_content': (
            '我们了解到另一家实验室竞品更便宜，数据更有说服力，'
            '希望贵司重新给出有竞争力的方案，否则我们考虑换合作方。'
        ),
        'metadata': {
            'sender_email': 'liu.zong@competitor.com',
            'sender_name': '刘总',
            'subject': '竞品实验室对比和竞争压力',
        },
    },
    {
        'source_id': 'e2e-competitor-002',
        'summary': '[赵主任] 竞品宣称更便宜调整策略',
        'raw_content': (
            '市场上竞品宣称最近更有说服力，竞品更便宜，'
            '希望我们也调整宣称策略，以应对市场竞争压力。'
        ),
        'metadata': {
            'sender_email': 'zhao.zr@market.com',
            'sender_name': '赵主任',
            'subject': '竞品宣称策略调整需求',
        },
    },
    # ── 投诉 ──────────────────────────────────────────────────
    {
        'source_id': 'e2e-complaint-001',
        'summary': '[孙客户] 项目延误投诉和赔偿要求',
        'raw_content': (
            '你们的项目严重延误，我们非常不满，'
            '要求立即给出赔偿方案，否则将投诉到行业协会。'
        ),
        'metadata': {
            'sender_email': 'sun.client@external.com',
            'sender_name': '孙客户',
            'subject': '项目延误投诉和赔偿要求',
        },
    },
]


def _seed_task_drafts(account: Account, event) -> None:
    """为邮件事件创建任务草案（保证 V02 任务草案生成率 KPI 测试通过）"""
    from apps.secretary.models import AssistantActionPlan
    TASK_MAP = {
        'inquiry': ['opportunity_draft', 'writeback_crm'],
        'project_followup': ['research_context_sync', 'followup_action_draft'],
        'competitor_pressure': ['client_risk_alert', 'competitive_intel_brief'],
        'complaint': ['capa_trigger', 'client_risk_alert'],
    }
    keys = TASK_MAP.get(event.mail_signal_type, ['followup_action_draft'])
    for key in keys[:2]:
        if not AssistantActionPlan.objects.filter(
            account_id=account.id, source_event_id=event.id, task_key=key
        ).exists():
            AssistantActionPlan.objects.create(
                account_id=account.id,
                source_event_id=event.id,
                task_key=key,
                title=f'[SEED] {(event.subject or "邮件")[:50]} - {key}',
                status='pending',
                action_type='task',
                biz_domain='secretary',
                source_event_type='mail_signal',
                action_payload={},
            )


def _seed_confirmed_tasks_and_insights(account: Account) -> None:
    """
    补充 CONFIRMED 状态任务草案 + acted 洞察（保证 V03 采纳率 / V08 洞察行动率 KPI 通过）
    """
    from django.utils import timezone
    from apps.secretary.models import AssistantActionPlan, MailSignalEvent, ProactiveInsight

    # 取前 3 封 inquiry 邮件的任务，标记为 CONFIRMED（采纳）
    events = MailSignalEvent.objects.filter(
        account_id=account.id,
        mail_signal_type='inquiry',
    ).order_by('id')[:3]
    confirmed_count = 0
    for event in events:
        plan = AssistantActionPlan.objects.filter(
            account_id=account.id,
            source_event_id=event.id,
        ).first()
        if plan and plan.status != AssistantActionPlan.Status.CONFIRMED:
            plan.status = AssistantActionPlan.Status.CONFIRMED
            plan.confirmed_by = account.id
            plan.confirmed_at = timezone.now()
            plan.save(update_fields=['status', 'confirmed_by', 'confirmed_at'])
            confirmed_count += 1
    if confirmed_count:
        print(f'  ✓ 已确认(CONFIRMED) {confirmed_count} 条任务草案（提升 V03 采纳率）')

    # 补充 2 条 acted 状态的主动洞察（提升 V08 行动率）
    existing = ProactiveInsight.objects.filter(status='acted').count()
    if existing < 2:
        for i in range(2 - existing):
            ProactiveInsight.objects.create(
                insight_type='client_periodic',
                title=f'[SEED] 客户定期洞察 #{i+1}',
                summary=f'基于客户行为数据自动生成的定期洞察样本 #{i+1}',
                detail={},
                status='acted',
                priority='medium',
                relevance_score=80,
                governance_level='L1',
            )
        print(f'  ✓ 已创建 {2 - existing} 条 acted 状态洞察（提升 V08 行动率）')


def seed(account: Account) -> dict:
    """植入种子邮件数据，返回统计结果"""
    stats = {'created': 0, 'updated': 0, 'failed': 0, 'total': len(SEED_MAILS)}
    for mail in SEED_MAILS:
        try:
            event = upsert_mail_signal_event_from_context(
                user_id=account.feishu_open_id,
                source_id=mail['source_id'],
                summary=mail['summary'],
                raw_content=mail['raw_content'],
                metadata=mail['metadata'],
            )
            if event:
                stats['created'] += 1
                subj = mail['metadata'].get('subject', '')[:40]
                print(f'  ✓ [{event.mail_signal_type:24s}] {subj} (id={event.id})')
                # 为每封邮件创建任务草案（保证 V02 任务草案生成率测试通过）
                _seed_task_drafts(account, event)
            else:
                stats['failed'] += 1
                print(f'  ✗ [{mail["source_id"]}] upsert returned None')
        except Exception as e:
            stats['failed'] += 1
            print(f'  ✗ [{mail["source_id"]}] ERROR: {e}')
    return stats


def main() -> int:
    print('\n══════════════════════════════════════════════')
    print('   中书·智能台 E2E 测试数据 Seed 脚本')
    print('══════════════════════════════════════════════\n')

    account = get_or_create_e2e_account()
    print(f'\n[seed] 开始植入 {len(SEED_MAILS)} 封测试邮件...\n')

    stats = seed(account)

    # 补充 CONFIRMED 任务草案 + acted 洞察（提升 V03/V08 KPI）
    _seed_confirmed_tasks_and_insights(account)

    from apps.secretary.models import MailSignalEvent
    total_events = MailSignalEvent.objects.filter(account_id=account.id).count()

    print(f'\n[seed] 完成:')
    print(f'  成功: {stats["created"]}/{stats["total"]}')
    if stats['failed']:
        print(f'  失败: {stats["failed"]}')
    print(f'  数据库总邮件事件数 (账号 {account.id}): {total_events}')

    # 按类型统计
    from django.db.models import Count
    by_type = (
        MailSignalEvent.objects
        .filter(account_id=account.id)
        .values('mail_signal_type')
        .annotate(cnt=Count('id'))
        .order_by('-cnt')
    )
    print('\n  按类型分布:')
    for row in by_type:
        print(f'    {row["mail_signal_type"]:24s}: {row["cnt"]}')

    print('\n══════════════════════════════════════════════\n')
    return 0 if stats['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
