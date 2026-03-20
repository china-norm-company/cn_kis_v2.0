"""
Agent 训练模式管理命令。

对指定 Agent 进行人工反馈迭代训练：
1. 用场景 prompt 调用 Agent
2. 展示输出，等待人工评分和修正建议
3. 将修正写入 WorkerPolicyUpdate(ACTIVE)
4. 下一轮注入上轮修正

用法：
    python manage.py train_agent general-assistant -n 3
    python manage.py train_agent knowledge-agent --scenario-ids DW-KNO-001 DW-KNO-002
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '对指定 Agent 进行人工反馈迭代训练'

    def add_arguments(self, parser):
        parser.add_argument('agent_id', type=str, help='要训练的 Agent ID')
        parser.add_argument('-n', '--iterations', type=int, default=3, help='训练轮次（默认 3）')
        parser.add_argument('--scenario-ids', nargs='+', type=str, help='指定场景 ID，不指定则使用 core 批次')

    def handle(self, *args, **options):
        agent_id = options['agent_id']
        iterations = options['iterations']
        scenario_ids = options.get('scenario_ids') or []

        self.stdout.write(self.style.SUCCESS(f'=== Agent 训练模式: {agent_id} ({iterations} 轮) ==='))

        from apps.agent_gateway.models import AgentDefinition
        agent_def = AgentDefinition.objects.filter(agent_id=agent_id).first()
        if not agent_def:
            self.stderr.write(f'Agent {agent_id} 不存在')
            return

        # 加载场景
        from tests.ai_eval.digital_worker_real_eval_scenarios import list_core_scenarios, list_all_scenarios
        all_scenarios = list_all_scenarios()
        if scenario_ids:
            scenarios = [s for s in all_scenarios if s.scenario_id in scenario_ids]
        else:
            scenarios = list_core_scenarios()[:3]

        if not scenarios:
            self.stderr.write('未找到可用场景')
            return

        from apps.identity.models import Account
        admin_account = Account.objects.filter(is_active=True).order_by('id').first()
        if not admin_account:
            self.stderr.write('无可用账号')
            return

        for scenario in scenarios:
            self.stdout.write(f'\n--- 场景: {scenario.scenario_id} - {scenario.title} ---')
            for iteration in range(1, iterations + 1):
                self.stdout.write(f'\n[轮次 {iteration}/{iterations}]')
                self._run_training_iteration(agent_id, admin_account.id, scenario, iteration)

        self.stdout.write(self.style.SUCCESS('\n=== 训练完成 ==='))

    def _run_training_iteration(self, agent_id, account_id, scenario, iteration):
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
                domain_code='training',
            )
            self.stdout.write(self.style.SUCCESS(f'已保存反馈（score={score:.1f}）'))
