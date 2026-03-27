"""
Agent 训练模式管理命令。

支持两种模式：
1. 人工反馈模式（默认）：调用 Agent → 展示输出 → 等待人工评分和修正 → 写入 WorkerPolicyUpdate
2. 自动模式（--auto）：调用 Agent → 基于 expected_keywords 自动评分 → 生成基准策略 → 写入 WorkerPolicyUpdate

用法：
    python manage.py train_agent secretary-orchestrator -n 3           # 人工反馈
    python manage.py train_agent knowledge-hybrid-search --auto        # 自动批量训练（无人值守）
    python manage.py train_agent daily-report --auto --scenario-ids DW-SEC-001 DW-CORE-001
"""
import sys
import os
from django.core.management.base import BaseCommand


def _load_scenarios():
    """加载场景模块，自动将 tests/ 目录加入 PYTHONPATH。"""
    # 尝试从项目根目录加载 tests/
    base_dirs = [
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', '..'),  # backend/../
        '/opt/cn-kis-v2',
        os.getcwd(),
    ]
    for d in base_dirs:
        candidate = os.path.abspath(os.path.join(d, 'tests', 'ai_eval'))
        if os.path.isdir(candidate):
            root = os.path.abspath(os.path.join(d))
            if root not in sys.path:
                sys.path.insert(0, root)
            break

    from tests.ai_eval.digital_worker_real_eval_scenarios import list_core_scenarios, list_all_scenarios
    return list_core_scenarios, list_all_scenarios


class Command(BaseCommand):
    help = '对指定 Agent 进行人工反馈或自动迭代训练，生成 WorkerPolicyUpdate'

    def add_arguments(self, parser):
        parser.add_argument('agent_id', type=str, help='要训练的 Agent ID')
        parser.add_argument('-n', '--iterations', type=int, default=3, help='训练轮次（默认 3）')
        parser.add_argument('--scenario-ids', nargs='+', type=str, help='指定场景 ID，不指定则使用 core 批次')
        parser.add_argument('--auto', action='store_true', default=False,
                            help='自动模式：无需人工输入，基于关键词匹配自动评分并写入策略')
        parser.add_argument('--all-agents', action='store_true', default=False,
                            help='（仅自动模式）对所有活跃 Agent 执行批量训练')

    def handle(self, *args, **options):
        agent_id = options['agent_id']
        iterations = options['iterations']
        scenario_ids = options.get('scenario_ids') or []
        auto_mode = options.get('auto', False)
        all_agents = options.get('all_agents', False)

        from apps.agent_gateway.models import AgentDefinition

        if all_agents and auto_mode:
            agents = list(AgentDefinition.objects.filter(is_active=True).values_list('agent_id', flat=True))
            self.stdout.write(f'=== 批量自动训练 {len(agents)} 个 Agent ===')
            for aid in agents:
                self.stdout.write(f'\n--- 开始训练: {aid} ---')
                self._train_single(aid, iterations, scenario_ids, auto_mode=True)
            self.stdout.write(self.style.SUCCESS('\n=== 全部 Agent 训练完成 ==='))
            return

        self.stdout.write(self.style.SUCCESS(
            f'=== Agent 训练模式: {agent_id} ({iterations} 轮) {"[自动]" if auto_mode else "[人工]"} ==='
        ))
        self._train_single(agent_id, iterations, scenario_ids, auto_mode=auto_mode)

    def _train_single(self, agent_id, iterations, scenario_ids, auto_mode=False):
        from apps.agent_gateway.models import AgentDefinition
        agent_def = AgentDefinition.objects.filter(agent_id=agent_id).first()
        if not agent_def:
            self.stderr.write(f'Agent {agent_id} 不存在，跳过')
            return

        # 加载场景
        try:
            list_core_scenarios, list_all_scenarios = _load_scenarios()
            all_scenarios = list_all_scenarios()
        except ImportError as e:
            self.stderr.write(f'场景模块加载失败: {e}')
            return

        if scenario_ids:
            scenarios = [s for s in all_scenarios if s.scenario_id in scenario_ids]
        else:
            scenarios = list_core_scenarios()[:3]

        if not scenarios:
            self.stderr.write('未找到可用场景')
            return

        from apps.identity.models import Account
        admin_account = Account.objects.filter(status='active').order_by('id').first()
        if not admin_account:
            # 兜底：取任意账号
            admin_account = Account.objects.order_by('id').first()
        if not admin_account:
            self.stderr.write('无可用账号')
            return

        for scenario in scenarios:
            self.stdout.write(f'\n--- 场景: {scenario.scenario_id} - {scenario.title} ---')
            for iteration in range(1, iterations + 1):
                self.stdout.write(f'\n[轮次 {iteration}/{iterations}]')
                if auto_mode:
                    self._run_auto_iteration(agent_id, admin_account.id, scenario, iteration)
                else:
                    self._run_training_iteration(agent_id, admin_account.id, scenario, iteration)

        self.stdout.write(self.style.SUCCESS(f'\n=== {agent_id} 训练完成 ==='))

    def _run_auto_iteration(self, agent_id, account_id, scenario, iteration):
        """自动训练：调用 Agent → 关键词评分 → 写入 WorkerPolicyUpdate。"""
        try:
            from apps.agent_gateway.services import call_agent
            call_result = call_agent(
                account_id=account_id,
                agent_id=agent_id,
                message=scenario.user_message,
                context=scenario.context,
            )
            output_text = call_result.output_text or ''
        except Exception as exc:
            self.stderr.write(f'  Agent 调用失败: {exc}')
            # 即使调用失败，也写入一条基准策略
            output_text = ''

        # 基于 expected_keywords 自动评分
        if output_text and scenario.expected_keywords:
            hits = sum(1 for kw in scenario.expected_keywords if kw in output_text)
            score = hits / len(scenario.expected_keywords)
        else:
            score = 0.5 if output_text else 0.1

        # 生成基准策略（初始训练：记录 Agent 当前能力基线）
        if output_text:
            policy_summary = (
                f"场景[{scenario.scenario_id}]第{iteration}轮自动评分: {score:.0%}。"
                f"关键词命中: {[kw for kw in scenario.expected_keywords if kw in output_text]}。"
                f"输出摘要: {output_text[:200]}"
            )
        else:
            policy_summary = f"场景[{scenario.scenario_id}]第{iteration}轮：Agent调用失败，需检查服务状态。"

        from apps.secretary.memory_service import learn_policy
        learn_policy(
            worker_code=agent_id,
            policy_key=f'{scenario.scenario_id}_auto_{iteration}',
            outcome=f'自动评估轮次 {iteration}: score={score:.0%}',
            root_cause=f'自动关键词匹配评估（场景: {scenario.title}）',
            better_policy=policy_summary,
            replay_score=score,
            domain_code=scenario.domain,
        )
        self.stdout.write(f'  ✓ 自动训练完成 score={score:.0%}  keywords_hit={[kw for kw in scenario.expected_keywords if kw in output_text]}')

    def _run_training_iteration(self, agent_id, account_id, scenario, iteration):
        """人工交互训练：调用 Agent → 展示输出 → 等待人工反馈。"""
        try:
            from apps.agent_gateway.services import call_agent
            call_result = call_agent(
                account_id=account_id,
                agent_id=agent_id,
                message=scenario.user_message,
                context=scenario.context,
            )
            output_text = call_result.output_text or '（无输出）'
        except Exception as exc:
            self.stderr.write(f'Agent 调用失败: {exc}')
            return

        self.stdout.write(f'Agent 输出：\n{output_text[:800]}')
        self.stdout.write('\n请评分 (1-10，回车跳过) 和修正建议（回车跳过）：')

        try:
            score_input = input('评分 [1-10]: ').strip()
            feedback_input = input('修正建议（可选）: ').strip()
        except (KeyboardInterrupt, EOFError):
            self.stdout.write('\n已跳过')
            return

        if not score_input and not feedback_input:
            return

        score = 0.0
        try:
            score = float(score_input) / 10.0 if score_input else 0.5
        except ValueError:
            score = 0.5

        if feedback_input:
            from apps.secretary.memory_service import learn_policy
            learn_policy(
                worker_code=agent_id,
                policy_key=f'{scenario.scenario_id}_training_{iteration}',
                outcome=f'训练轮次 {iteration} 输出',
                root_cause=f'人工反馈：{feedback_input[:200]}',
                better_policy=feedback_input,
                replay_score=score,
                domain_code=scenario.domain,
            )
            self.stdout.write(self.style.SUCCESS(f'已保存反馈（score={score:.1f}）'))
