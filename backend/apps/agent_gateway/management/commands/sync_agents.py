"""
同步 agents.yaml 中的智能体定义到数据库

用法: python manage.py sync_agents

支持字段：id, name, description, provider, model_id, system_prompt,
          temperature, max_tokens, capabilities, tools,
          knowledge_enabled, knowledge_top_k, phase, role_title, tier, avatar_url, is_editable_via_ui
支持 model_id 等字符串中的环境变量占位符: ${VAR:-default}
"""
import os
import re
import yaml
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.agent_gateway.models import AgentDefinition
from apps.agent_gateway.tool_registry import list_available_tools


def resolve_env(value):
    """解析字符串中的 ${VAR:-default} 为环境变量值"""
    if not value or not isinstance(value, str):
        return value or ''
    return re.sub(
        r'\$\{([^}:]+)(?::-([^}]*))?\}',
        lambda m: os.environ.get(m.group(1), (m.group(2) or '').strip()),
        value,
    )


class Command(BaseCommand):
    help = '同步 configs/agents.yaml 中的智能体定义到数据库'

    def handle(self, *args, **options):
        config_path = Path(__file__).resolve().parents[4] / 'configs' / 'agents.yaml'
        if not config_path.exists():
            config_path = Path(__file__).resolve().parents[5] / 'configs' / 'agents.yaml'

        if not config_path.exists():
            self.stderr.write(self.style.ERROR(f'找不到 agents.yaml: {config_path}'))
            return

        with open(config_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        agents = data.get('agents', [])
        available_tools = set(list_available_tools())
        created = 0
        updated = 0
        tool_warnings = []

        for agent in agents:
            agent_id = agent['id']
            agent_tools = agent.get('tools', [])

            unknown_tools = [t for t in agent_tools if t not in available_tools]
            if unknown_tools:
                tool_warnings.append((agent_id, unknown_tools))

            model_id_raw = agent.get('model_id', '')
            model_id = resolve_env(model_id_raw)

            tier = (agent.get('tier') or '').strip() or ''
            if tier and tier not in dict(AgentDefinition._meta.get_field('tier').choices):
                tier = ''

            # 协作契约注入：从 YAML 的 collaboration_contract 或默认模板
            collab = agent.get('collaboration_contract', {})
            boundaries = collab.get('boundaries', [
                '不得替代人类做最终承诺、签发或裁决',
                '不得编造法规条款或伪造数据',
                '超出专业范围时必须升级而非猜测',
            ])
            escalation_targets = collab.get('escalation_path', [
                {'condition': '超出专业范围', 'target': 'orchestration-agent', 'method': '通过 agent_invoke 转交'},
                {'condition': '涉及客户承诺/财务决策/合规裁决', 'target': '人类确认', 'method': '返回 requires_human_confirmation=true'},
            ])
            parent_agent = collab.get('reports_to', 'orchestration-agent' if agent_id != 'orchestration-agent' else '')

            # 在 system_prompt 末尾注入协作契约（仅当 prompt 中无该标记时）
            base_prompt = agent.get('system_prompt', '')
            contract_marker = '## 协作契约'
            if contract_marker not in base_prompt:
                contract_block = (
                    f'\n\n{contract_marker}\n'
                    f'- 职责边界：{"; ".join(boundaries)}\n'
                    f'- 遇到超出能力范围的问题时，升级到上级或人类确认，不要猜测\n'
                    f'- 转交时必须附带完整上下文（原始需求、已完成步骤、待处理项）\n'
                    f'- 每次调用消耗 token 有预算约束，优先使用知识库检索减少推理\n'
                )
                base_prompt = base_prompt + contract_block

            defaults = {
                'name': agent['name'],
                'description': agent.get('description', ''),
                'capabilities': agent.get('capabilities', []),
                'is_active': True,
                'provider': agent.get('provider', 'kimi'),
                'model_id': model_id,
                'system_prompt': base_prompt,
                'temperature': float(agent.get('temperature', 0.7)),
                'max_tokens': int(agent.get('max_tokens', 4096)),
                'tools': agent_tools,
                'knowledge_enabled': bool(agent.get('knowledge_enabled', False)),
                'knowledge_top_k': int(agent.get('knowledge_top_k', 3)),
                'phase': str(agent.get('phase', ''))[:32],
                'role_title': str(agent.get('role_title', ''))[:120],
                'tier': tier,
                'avatar_url': str(agent.get('avatar_url', ''))[:500],
                'is_editable_via_ui': bool(agent.get('is_editable_via_ui', True)),
                'boundaries': boundaries,
                'escalation_targets': escalation_targets,
                'parent_agent_id': parent_agent,
            }

            obj, was_created = AgentDefinition.objects.update_or_create(
                agent_id=agent_id,
                defaults=defaults,
            )
            provider_label = 'ARK' if defaults['provider'] == 'ark' else 'Kimi'
            tools_label = f' tools={len(agent_tools)}' if agent_tools else ''
            if was_created:
                created += 1
                self.stdout.write(
                    f'  + 创建: {agent_id} ({agent["name"]}) '
                    f'[{provider_label}]{tools_label}'
                )
            else:
                updated += 1
                self.stdout.write(
                    f'  ~ 更新: {agent_id} ({agent["name"]}) '
                    f'[{provider_label}]{tools_label}'
                )

        self.stdout.write(self.style.SUCCESS(
            f'\n同步完成: 创建 {created} 个, 更新 {updated} 个, 共 {len(agents)} 个智能体'
        ))

        ark_count = sum(1 for a in agents if a.get('provider') == 'ark')
        kimi_count = sum(1 for a in agents if a.get('provider', 'kimi') == 'kimi')
        tools_count = sum(1 for a in agents if a.get('tools'))
        self.stdout.write(f'  ARK: {ark_count} 个 | Kimi: {kimi_count} 个')
        self.stdout.write(f'  Tool-enabled Agents: {tools_count} 个')
        self.stdout.write(f'  Available tools: {sorted(available_tools)}')

        for aid, unknown in tool_warnings:
            self.stderr.write(self.style.WARNING(
                f'  Agent {aid} 引用了未注册的工具: {unknown}'
            ))
