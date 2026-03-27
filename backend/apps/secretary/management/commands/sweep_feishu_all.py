"""
sweep_feishu_all：飞书全量数据采集 + 知识库沉淀 + 项目信号提取

═══════════════════════════════════════════════════════════════════
  扩展 sweep_feishu_mails，覆盖飞书 6 大数据源：
  mail / im / calendar / task / approval / doc

  采集的数据自动沉淀到知识库，不需要重复采集。
═══════════════════════════════════════════════════════════════════

用法：
  # 全量采集（所有用户、所有数据源、近60天、自动入知识库）
  python manage.py sweep_feishu_all

  # 仅采集指定数据源
  python manage.py sweep_feishu_all --sources mail,im,doc

  # 仅指定用户
  python manage.py sweep_feishu_all --account-id 1

  # 回溯90天
  python manage.py sweep_feishu_all --days 90

  # 不入知识库（仅采集）
  python manage.py sweep_feishu_all --no-deposit

  # 仅统计
  python manage.py sweep_feishu_all --dry-run

  # 采集项目相关群聊
  python manage.py sweep_feishu_all --project-chats

  # 采集后提取项目信号
  python manage.py sweep_feishu_all --extract-signals

  # 输出详细报告
  python manage.py sweep_feishu_all --output /tmp/feishu_collection.json
"""
import json
import time
from collections import defaultdict

from django.core.management.base import BaseCommand

from apps.identity.models import Account
from apps.secretary.models import FeishuUserToken, PersonalContext


class Command(BaseCommand):
    help = '飞书全量数据采集（6大数据源）+ 知识库沉淀 + 项目信号提取'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=60,
                            help='回溯天数（默认 60）')
        parser.add_argument('--sources', type=str, default='',
                            help='数据源（逗号分隔，默认全部：mail,im,calendar,task,approval,doc）')
        parser.add_argument('--account-id', type=int, default=None,
                            help='仅处理指定账号 ID')
        parser.add_argument('--no-deposit', action='store_true',
                            help='不沉淀到知识库')
        parser.add_argument('--dry-run', action='store_true',
                            help='仅统计，不实际采集')
        parser.add_argument('--project-chats', action='store_true',
                            help='额外采集所有项目群聊')
        parser.add_argument('--extract-signals', action='store_true',
                            help='采集后提取项目管理信号')
        parser.add_argument('--delay', type=float, default=1.0,
                            help='账号间延迟秒数（默认 1s）')
        parser.add_argument('--output', type=str, default='',
                            help='输出报告 JSON 路径')

    def handle(self, *args, **options):
        days = options['days']
        sources_str = options['sources']
        account_id = options['account_id']
        no_deposit = options['no_deposit']
        dry_run = options['dry_run']
        project_chats = options['project_chats']
        extract_signals = options['extract_signals']
        delay = options['delay']
        output_path = options['output']

        sources = [s.strip() for s in sources_str.split(',') if s.strip()] if sources_str else None

        self.stdout.write(f'\n{"="*70}')
        self.stdout.write('  飞书全量数据采集（sweep_feishu_all）')
        self.stdout.write(f'  回溯: {days} 天')
        self.stdout.write(f'  数据源: {sources or "全部(mail,im,calendar,task,approval,doc)"}')
        self.stdout.write(f'  知识库沉淀: {"否" if no_deposit else "是"}')
        self.stdout.write(f'  项目群聊: {"是" if project_chats else "否"}')
        self.stdout.write(f'  信号提取: {"是" if extract_signals else "否"}')
        self.stdout.write(f'{"="*70}\n')

        if dry_run:
            self._show_dry_run_stats(account_id)
            return

        from apps.secretary.feishu_comprehensive_collector import (
            FeishuComprehensiveCollector,
        )

        collector = FeishuComprehensiveCollector(
            lookback_days=days,
            deposit_knowledge=not no_deposit,
            delay_between_users=delay,
        )

        account_ids = [account_id] if account_id else None

        # ── 主采集 ────────────────────────────────────────────────────────
        self.stdout.write('>>> 阶段一：用户数据采集\n')
        batch_result = collector.collect_all_users(
            sources=sources,
            account_ids=account_ids,
        )

        self._print_user_results(batch_result)

        # ── 项目群聊采集 ──────────────────────────────────────────────────
        project_results = []
        if project_chats:
            self.stdout.write('\n>>> 阶段二：项目群聊采集\n')
            project_results = self._collect_project_chats(collector)

        # ── 信号提取 ──────────────────────────────────────────────────────
        signals = {}
        if extract_signals:
            self.stdout.write('\n>>> 阶段三：项目信号提取\n')
            all_items = []
            for ur in batch_result.user_results:
                all_items.extend(ur.items)
            for pr in project_results:
                all_items.extend(pr.items)

            signals = collector.extract_project_signals(all_items)
            self._print_signals(signals)

        # ── 最终统计 ──────────────────────────────────────────────────────
        self._print_final_stats(batch_result, project_results, signals)

        # ── 输出报告 ──────────────────────────────────────────────────────
        if output_path:
            report = {
                'generated_at': str(time.strftime('%Y-%m-%d %H:%M:%S')),
                'config': {'days': days, 'sources': sources or 'all'},
                'summary': {
                    'total_items': batch_result.total_items,
                    'total_deposited': batch_result.total_deposited,
                    'total_errors': batch_result.total_errors,
                    'users_processed': len(batch_result.user_results),
                    'users_skipped': len(batch_result.skipped_users),
                },
                'per_user': [
                    {
                        'account_name': ur.account_name,
                        'user_id': ur.user_id,
                        'counts': ur.counts,
                        'total': ur.total,
                        'deposited': ur.deposited_to_knowledge,
                        'errors': ur.errors,
                    }
                    for ur in batch_result.user_results
                ],
                'signals': signals if extract_signals else {},
            }
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2, default=str)
            self.stdout.write(f'\n报告已保存至: {output_path}')

    def _show_dry_run_stats(self, account_id):
        """Dry-run 模式：显示当前数据统计"""
        self.stdout.write('【Dry-run 统计】\n')

        if account_id:
            tokens = FeishuUserToken.objects.filter(account_id=account_id)
        else:
            tokens = FeishuUserToken.objects.all()

        account_ids = list(tokens.values_list('account_id', flat=True).distinct())
        accounts = Account.objects.filter(
            id__in=account_ids, is_deleted=False
        ).exclude(feishu_open_id='')

        self.stdout.write(f'  有效飞书 Token 账号数: {accounts.count()}\n')

        for acc in accounts:
            counts = {}
            for st in ['mail', 'im', 'calendar', 'task', 'approval']:
                counts[st] = PersonalContext.objects.filter(
                    user_id=acc.feishu_open_id, source_type=st
                ).count()

            total = sum(counts.values())
            self.stdout.write(
                f'  {acc.display_name:20s} | '
                + ' '.join(f'{k}={v:3d}' for k, v in counts.items())
                + f' | 合计={total}'
            )

        # 全局统计
        self.stdout.write('\n  ── 全局统计 ──')
        for st in ['mail', 'im', 'calendar', 'task', 'approval']:
            count = PersonalContext.objects.filter(source_type=st).count()
            self.stdout.write(f'  {st:12s}: {count}')

        from apps.knowledge.models import KnowledgeEntry
        kb_count = KnowledgeEntry.objects.filter(
            source_key__startswith='feishu_'
        ).count()
        self.stdout.write(f'  知识库(飞书来源): {kb_count}')

    def _print_user_results(self, batch_result):
        """打印用户采集结果"""
        for ur in batch_result.user_results:
            counts_str = ' '.join(f'{k}={v}' for k, v in ur.counts.items() if v > 0)
            self.stdout.write(
                f'  {ur.account_name:20s} | {counts_str} | '
                f'合计={ur.total} 入库={ur.deposited_to_knowledge}'
            )
            for err in ur.errors:
                self.stdout.write(f'    ⚠ {err}')

    def _collect_project_chats(self, collector):
        """采集所有项目群聊"""
        from apps.protocol.models import Protocol

        protocols = Protocol.objects.filter(
            is_deleted=False,
        ).exclude(
            feishu_chat_id=''
        ).exclude(
            feishu_chat_id__isnull=True
        )

        results = []
        for p in protocols:
            self.stdout.write(f'  项目群: {p.title[:40]} (chat={p.feishu_chat_id[:20]}...)')
            try:
                result = collector.collect_project_chats(protocol_id=p.id)
                results.append(result)
                self.stdout.write(f'    → {result.total} 条消息, {result.deposited_to_knowledge} 条入库')
            except Exception as e:
                self.stdout.write(f'    ✗ 失败: {e}')

        return results

    def _print_signals(self, signals):
        """打印信号提取结果"""
        personnel = signals.get('key_personnel', {})
        if personnel:
            sorted_personnel = sorted(
                personnel.items(),
                key=lambda x: x[1].get('mention_count', 0),
                reverse=True,
            )
            self.stdout.write('\n  关键角色（Top 20）:')
            for name, info in sorted_personnel[:20]:
                roles = ', '.join(info.get('roles', []))
                src_dist = info.get('source_distribution', {})
                src_str = ' '.join(f'{k}={v}' for k, v in src_dist.items())
                self.stdout.write(
                    f'    {name:30s} | 出现={info.get("mention_count", 0):3d} | '
                    f'角色={roles} | {src_str}'
                )

        resources = signals.get('resource_mentions', {})
        if resources:
            self.stdout.write('\n  资源提及:')
            for res_type, mentions in resources.items():
                keywords = set(m['keyword'] for m in mentions)
                self.stdout.write(f'    {res_type}: {len(mentions)} 次 ({", ".join(list(keywords)[:5])})')

        project_sigs = signals.get('project_signals', [])
        self.stdout.write(f'\n  项目信号: {len(project_sigs)} 条')

        risk_sigs = signals.get('risk_signals', [])
        self.stdout.write(f'  风险信号: {len(risk_sigs)} 条')

        stats = signals.get('statistics', {})
        if stats:
            self.stdout.write(f'\n  数据源分布: {dict(stats)}')

    def _print_final_stats(self, batch_result, project_results, signals):
        """打印最终统计"""
        self.stdout.write(f'\n{"="*70}')
        self.stdout.write('  采集完成')
        self.stdout.write(f'{"="*70}')
        self.stdout.write(f'  用户数: {len(batch_result.user_results)}')
        self.stdout.write(f'  总采集: {batch_result.total_items} 条')
        self.stdout.write(f'  入知识库: {batch_result.total_deposited} 条')
        self.stdout.write(f'  错误: {batch_result.total_errors}')

        if project_results:
            proj_total = sum(pr.total for pr in project_results)
            proj_deposited = sum(pr.deposited_to_knowledge for pr in project_results)
            self.stdout.write(f'  项目群聊: {proj_total} 条消息, {proj_deposited} 入库')

        if batch_result.skipped_users:
            self.stdout.write(f'  跳过用户: {len(batch_result.skipped_users)}')
            for s in batch_result.skipped_users[:5]:
                self.stdout.write(f'    - {s}')

        # 按数据源汇总
        source_totals = defaultdict(int)
        for ur in batch_result.user_results:
            for source, count in ur.counts.items():
                source_totals[source] += count

        self.stdout.write('\n  按数据源:')
        for source, total in sorted(source_totals.items(), key=lambda x: -x[1]):
            self.stdout.write(f'    {source:12s}: {total}')

        self.stdout.write(f'{"="*70}\n')
