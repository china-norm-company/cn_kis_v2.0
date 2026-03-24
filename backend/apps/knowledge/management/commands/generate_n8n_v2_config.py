"""
n8n Workflows V2 API 对接配置生成器

将 V1.0 的 4 个 n8n 工作流更新为调用 V2 端点，
同时生成 n8n HTTP Request 节点所需的认证头配置。

V1→V2 端点映射：
  NMPA 法规追踪   /api/knowledge/entries/ → /v2/api/v1/knowledge/entries/
  PubMed 采集     /api/knowledge/entries/ → /v2/api/v1/knowledge/entries/
  行业知识采集    /api/knowledge/entries/ → /v2/api/v1/knowledge/entries/
  Web 知识搜索    /api/knowledge/search/  → /v2/api/v1/knowledge/search/

使用方式：
  # 打印配置摘要
  python manage.py generate_n8n_v2_config

  # 输出 JSON 配置（可直接导入 n8n）
  python manage.py generate_n8n_v2_config --output-json

  # 写入文件
  python manage.py generate_n8n_v2_config --output-json --output-file=n8n_v2_config.json
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from django.core.management.base import BaseCommand

# V2 API 基础 URL（从环境变量读取，回退到生产地址）
V2_BASE_URL = os.getenv('CN_KIS_V2_BASE_URL', 'https://china-norm.com/v2/api/v1')
V2_AUTH_HEADER_NAME = 'Authorization'
V2_AUTH_HEADER_VALUE = 'Bearer {SERVICE_ACCOUNT_JWT}'  # 占位符，部署时替换

# 4 个核心 n8n Workflows 的 V2 配置
WORKFLOW_CONFIGS = [
    {
        'id': 'nmpa-regulation-tracker',
        'name': 'NMPA 法规追踪器',
        'description': '定期抓取 NMPA 最新法规、指南，写入 V2 知识库',
        'schedule': '0 8 * * 1',  # 每周一 08:00
        'nodes': [
            {
                'name': 'NMPA RSS 抓取',
                'type': 'n8n-nodes-base.httpRequest',
                'config': {
                    'method': 'GET',
                    'url': 'https://www.nmpa.gov.cn/datasearch/search-info.html',
                    'responseFormat': 'html',
                },
            },
            {
                'name': '写入 V2 知识库',
                'type': 'n8n-nodes-base.httpRequest',
                'config': {
                    'method': 'POST',
                    'url': f'{V2_BASE_URL}/knowledge/entries/',
                    'authentication': 'genericCredentialType',
                    'genericAuthType': 'httpHeaderAuth',
                    'headers': {V2_AUTH_HEADER_NAME: V2_AUTH_HEADER_VALUE},
                    'body': {
                        'title': '={{$json.title}}',
                        'content': '={{$json.content}}',
                        'entry_type': 'regulation',
                        'source_type': 'nmpa_rss',
                        'namespace': 'nmpa_regulation',
                        'tags': ['NMPA', '法规', '{{$json.year}}'],
                    },
                },
            },
        ],
        'v1_endpoint': '/api/knowledge/entries/',
        'v2_endpoint': f'{V2_BASE_URL}/knowledge/entries/',
        'v2_search_endpoint': f'{V2_BASE_URL}/knowledge/search/',
        'status': 'ready',
    },
    {
        'id': 'pubmed-paper-scout',
        'name': 'PubMed 论文侦察员',
        'description': '定期检索 PubMed 皮肤科/化妆品功效新论文，摘要写入知识库',
        'schedule': '0 7 * * *',  # 每日 07:00
        'nodes': [
            {
                'name': 'PubMed E-utilities 搜索',
                'type': 'n8n-nodes-base.httpRequest',
                'config': {
                    'method': 'GET',
                    'url': 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
                    'qs': {
                        'db': 'pubmed',
                        'term': 'skin hydration[Title] AND cosmetics[Title/Abstract]',
                        'retmax': '20',
                        'retmode': 'json',
                        'sort': 'pub date',
                        'reldate': '7',
                    },
                },
            },
            {
                'name': '写入 V2 论文摘要',
                'type': 'n8n-nodes-base.httpRequest',
                'config': {
                    'method': 'POST',
                    'url': f'{V2_BASE_URL}/knowledge/entries/',
                    'authentication': 'genericCredentialType',
                    'genericAuthType': 'httpHeaderAuth',
                    'headers': {V2_AUTH_HEADER_NAME: V2_AUTH_HEADER_VALUE},
                    'body': {
                        'title': '={{$json.title}}',
                        'content': '={{$json.abstract}}',
                        'entry_type': 'paper_abstract',
                        'source_type': 'pubmed',
                        'source_key': '=pubmed:{{$json.pmid}}',
                        'namespace': 'cnkis',
                        'tags': ['PubMed', 'paper_abstract', '={{$json.year}}'],
                    },
                },
            },
        ],
        'v1_endpoint': '/api/knowledge/entries/',
        'v2_endpoint': f'{V2_BASE_URL}/knowledge/entries/',
        'v2_search_endpoint': f'{V2_BASE_URL}/knowledge/search/',
        'status': 'ready',
    },
    {
        'id': 'cosmetic-industry-collector',
        'name': '化妆品行业知识采集器',
        'description': '从行业媒体/品牌官网采集最新产品、成分、功效信息',
        'schedule': '0 6 * * 3',  # 每周三 06:00
        'nodes': [
            {
                'name': '行业媒体 RSS',
                'type': 'n8n-nodes-base.rssFeedRead',
                'config': {
                    'url': 'https://www.cosmeticsandtoiletries.com/rss',
                },
            },
            {
                'name': '写入 V2 行业知识',
                'type': 'n8n-nodes-base.httpRequest',
                'config': {
                    'method': 'POST',
                    'url': f'{V2_BASE_URL}/knowledge/entries/',
                    'authentication': 'genericCredentialType',
                    'genericAuthType': 'httpHeaderAuth',
                    'headers': {V2_AUTH_HEADER_NAME: V2_AUTH_HEADER_VALUE},
                    'body': {
                        'title': '={{$json.title}}',
                        'content': '={{$json.contentSnippet}}',
                        'entry_type': 'competitor_intel',
                        'source_type': 'industry_rss',
                        'namespace': 'cnkis',
                        'tags': ['行业动态', '竞品情报'],
                    },
                },
            },
        ],
        'v1_endpoint': '/api/knowledge/entries/',
        'v2_endpoint': f'{V2_BASE_URL}/knowledge/entries/',
        'status': 'ready',
    },
    {
        'id': 'web-knowledge-search',
        'name': 'Web 知识搜索器',
        'description': '根据给定关键词调用 V2 混合检索，并将结果推送到飞书通知数据经理',
        'trigger': 'webhook',  # 由外部触发（如飞书消息 Bot）
        'nodes': [
            {
                'name': 'V2 混合知识检索',
                'type': 'n8n-nodes-base.httpRequest',
                'config': {
                    'method': 'GET',
                    'url': f'{V2_BASE_URL}/knowledge/search/',
                    'authentication': 'genericCredentialType',
                    'genericAuthType': 'httpHeaderAuth',
                    'headers': {V2_AUTH_HEADER_NAME: V2_AUTH_HEADER_VALUE},
                    'qs': {
                        'q': '={{$json.query}}',
                        'entry_type': '={{$json.entry_type}}',
                        'page_size': '10',
                        'channels': 'keyword,vector',
                    },
                },
            },
            {
                'name': '飞书结果通知',
                'type': 'n8n-nodes-base.httpRequest',
                'config': {
                    'method': 'POST',
                    'url': f'{V2_BASE_URL}/notification/send/',
                    'authentication': 'genericCredentialType',
                    'genericAuthType': 'httpHeaderAuth',
                    'headers': {V2_AUTH_HEADER_NAME: V2_AUTH_HEADER_VALUE},
                    'body': {
                        'recipient_id': '={{$json.requester_id}}',
                        'title': '知识搜索结果',
                        'content': '={{$json.results.map(r => "• " + r.title).join("\\n")}}',
                    },
                },
            },
        ],
        'v1_endpoint': '/api/knowledge/search/',
        'v2_endpoint': f'{V2_BASE_URL}/knowledge/search/',
        'status': 'ready',
    },
]

# n8n Credential 配置模板（需在 n8n 中手动创建）
CREDENTIAL_TEMPLATE = {
    'name': 'CN KIS V2 API',
    'type': 'httpHeaderAuth',
    'data': {
        'name': 'Authorization',
        'value': 'Bearer <在此填入服务账号 JWT>',
    },
    'note': '在 CN KIS V2 管理后台通过 python manage.py create_service_account --name=n8n 生成',
}


class Command(BaseCommand):
    help = '生成 n8n Workflows V2 API 对接配置'

    def add_arguments(self, parser):
        parser.add_argument('--output-json', action='store_true', default=False, help='输出 JSON 格式')
        parser.add_argument('--output-file', default='', help='写入文件路径（默认打印到 stdout）')

    def handle(self, *args, **options):
        output_json = options['output_json']
        output_file = options['output_file']

        if output_json:
            config = {
                'v2_base_url': V2_BASE_URL,
                'auth_header': {
                    'name': V2_AUTH_HEADER_NAME,
                    'value_template': V2_AUTH_HEADER_VALUE,
                },
                'credential': CREDENTIAL_TEMPLATE,
                'workflows': WORKFLOW_CONFIGS,
                'migration_notes': [
                    'V1 /api/knowledge/ → V2 /v2/api/v1/knowledge/',
                    'V1 /api/knowledge/search/ → V2 /v2/api/v1/knowledge/search/',
                    'V2 认证改为 Bearer JWT，不再使用 session cookie',
                    '写入知识库的条目状态为 pending_review，需数据经理审核后 publish',
                ],
            }
            output = json.dumps(config, ensure_ascii=False, indent=2)
            if output_file:
                Path(output_file).write_text(output, encoding='utf-8')
                self.stdout.write(self.style.SUCCESS(f'已写入 {output_file}'))
            else:
                self.stdout.write(output)
            return

        self.stdout.write(self.style.HTTP_INFO('=== n8n Workflows V2 API 对接配置 ==='))
        self.stdout.write(f'V2 基础 URL: {V2_BASE_URL}\n')

        for wf in WORKFLOW_CONFIGS:
            self.stdout.write(f'{"─" * 50}')
            self.stdout.write(f'工作流: {wf["name"]} ({wf["id"]})')
            self.stdout.write(f'调度: {wf.get("schedule") or wf.get("trigger", "manual")}')
            self.stdout.write(f'描述: {wf["description"]}')
            self.stdout.write(f'V1 端点: {wf.get("v1_endpoint", "—")}')
            self.stdout.write(f'V2 端点: {wf.get("v2_endpoint", wf.get("v2_search_endpoint", "—"))}')
            self.stdout.write(f'状态: {self.style.SUCCESS(wf["status"])}')
            self.stdout.write('')

        self.stdout.write(self.style.WARNING('下一步操作：'))
        self.stdout.write('  1. 在 CN KIS V2 创建服务账号 JWT：')
        self.stdout.write('       python manage.py create_service_account --name=n8n')
        self.stdout.write('  2. 在 n8n 中创建 HTTP Header Auth Credential（名称：CN KIS V2 API）')
        self.stdout.write('     填入步骤 1 生成的 JWT')
        self.stdout.write('  3. 使用 --output-json 导出配置，在 n8n 中导入各 workflow')
        self.stdout.write('  4. 在洞明数据台 Pipeline 健康页查看 workflow 运行状态')
