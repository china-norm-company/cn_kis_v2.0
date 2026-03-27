"""
LLM 通道巡检命令

用法:
  python manage.py check_llm_providers
  python manage.py check_llm_providers --invoke
  python manage.py check_llm_providers --provider kimi --invoke
"""
import json
import os
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '检查 ARK/Kimi 配置与可调用性'

    def add_arguments(self, parser):
        parser.add_argument(
            '--provider',
            type=str,
            default='all',
            choices=['all', 'ark', 'kimi'],
            help='指定检查的 provider',
        )
        parser.add_argument(
            '--invoke',
            action='store_true',
            help='执行一次最小调用验证（会产生真实 API 调用）',
        )

    def handle(self, *args, **options):
        from apps.agent_gateway.services import (
            get_provider_catalog,
            quick_chat,
        )

        provider_filter = options.get('provider') or 'all'
        do_invoke = bool(options.get('invoke'))
        catalog = get_provider_catalog()
        providers = catalog.get('providers', [])
        if provider_filter != 'all':
            providers = [p for p in providers if p.get('provider') == provider_filter]

        summary = {
            'checked': 0,
            'enabled': 0,
            'invoke_success': 0,
            'invoke_failed': 0,
        }
        details = []

        for item in providers:
            provider = item.get('provider')
            enabled = bool(item.get('enabled'))
            default_model = item.get('default_model') or ''
            row = {
                'provider': provider,
                'enabled': enabled,
                'default_model': default_model,
                'models': item.get('models', []),
                'invoke': None,
            }
            summary['checked'] += 1
            if enabled:
                summary['enabled'] += 1

            if do_invoke and enabled and default_model:
                try:
                    # 巡检时禁用自动回退，避免主通道失败被备用通道掩盖。
                    old_fallback_env = os.getenv('AGENT_CHAT_FALLBACK_ENABLED')
                    os.environ['AGENT_CHAT_FALLBACK_ENABLED'] = 'false'
                    resp = quick_chat(
                        message='ping',
                        provider=provider,
                        model_id=default_model,
                        system_prompt='仅回复 pong',
                        temperature=0,
                        max_tokens=8,
                    ).strip()
                    if old_fallback_env is None:
                        os.environ.pop('AGENT_CHAT_FALLBACK_ENABLED', None)
                    else:
                        os.environ['AGENT_CHAT_FALLBACK_ENABLED'] = old_fallback_env
                    row['invoke'] = {
                        'ok': True,
                        'preview': resp[:80],
                    }
                    summary['invoke_success'] += 1
                except Exception as e:
                    if 'old_fallback_env' in locals():
                        if old_fallback_env is None:
                            os.environ.pop('AGENT_CHAT_FALLBACK_ENABLED', None)
                        else:
                            os.environ['AGENT_CHAT_FALLBACK_ENABLED'] = old_fallback_env
                    row['invoke'] = {
                        'ok': False,
                        'error': str(e),
                    }
                    summary['invoke_failed'] += 1

            details.append(row)

        output = {
            'provider_filter': provider_filter,
            'invoke': do_invoke,
            'summary': summary,
            'details': details,
        }

        self.stdout.write(self.style.SUCCESS(
            f"LLM巡检完成 checked={summary['checked']} enabled={summary['enabled']} "
            f"invoke_success={summary['invoke_success']} invoke_failed={summary['invoke_failed']}"
        ))
        self.stdout.write(json.dumps(output, ensure_ascii=False))

