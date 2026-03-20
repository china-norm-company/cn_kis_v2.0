"""
Agent Tool Registry — 工具定义与 Handler 注册

定义 Agent 可调用的工具（OpenAI function calling 格式），
每个工具包含 JSON Schema 描述和对应的 handler 函数。

工具分类：
  - databus_*        : DataBus 数据总线（读取业务数据）
  - knowledge_*      : 知识库读写
  - mcp_*            : MCP 外部服务（网页搜索、内容提取）
  - claw_skill_*     : Claw 技能体系（脚本/服务/Agent 执行）
  - agent_invoke     : 跨 Agent 调用（编排器专用）
"""
import json
import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


# ============================================================================
# Tool Schema 定义（OpenAI function calling 格式）
# ============================================================================

TOOL_DEFINITIONS: Dict[str, dict] = {

    'databus_snapshot': {
        'type': 'function',
        'function': {
            'name': 'databus_snapshot',
            'description': '获取指定业务模块的 KPI 快照数据，用于了解当前运营状态',
            'parameters': {
                'type': 'object',
                'properties': {
                    'module': {
                        'type': 'string',
                        'description': '业务模块名称',
                        'enum': [
                            'workorder', 'scheduling', 'quality', 'equipment',
                            'projects', 'finance', 'crm', 'recruitment',
                            'ethics', 'hr', 'reception', 'sample',
                            'facility', 'evaluator', 'lab_personnel',
                        ],
                    },
                },
                'required': ['module'],
            },
        },
    },

    'databus_entity': {
        'type': 'function',
        'function': {
            'name': 'databus_entity',
            'description': '获取单个业务实体的详细信息（如工单、项目、客户、设备等）',
            'parameters': {
                'type': 'object',
                'properties': {
                    'entity_type': {
                        'type': 'string',
                        'description': '实体类型',
                        'enum': [
                            'workorder', 'protocol', 'project', 'client',
                            'staff', 'device', 'equipment', 'contract',
                            'evaluator', 'opportunity', 'subject',
                        ],
                    },
                    'entity_id': {
                        'type': 'integer',
                        'description': '实体的数据库 ID',
                    },
                },
                'required': ['entity_type', 'entity_id'],
            },
        },
    },

    'databus_search': {
        'type': 'function',
        'function': {
            'name': 'databus_search',
            'description': '跨模块搜索业务数据（工单、项目、客户等）',
            'parameters': {
                'type': 'object',
                'properties': {
                    'query': {
                        'type': 'string',
                        'description': '搜索关键词',
                    },
                    'modules': {
                        'type': 'array',
                        'items': {'type': 'string'},
                        'description': '限定搜索的模块列表（为空则搜索全部模块）',
                    },
                },
                'required': ['query'],
            },
        },
    },

    'databus_audit_trail': {
        'type': 'function',
        'function': {
            'name': 'databus_audit_trail',
            'description': '获取指定实体的审计追踪链，用于质量调查、合规核查和问题追溯',
            'parameters': {
                'type': 'object',
                'properties': {
                    'model_name': {
                        'type': 'string',
                        'description': '模型名，如 WorkOrder / Protocol / Deviation / CAPA',
                    },
                    'record_id': {
                        'type': 'integer',
                        'description': '记录主键 ID',
                    },
                },
                'required': ['model_name', 'record_id'],
            },
        },
    },

    'knowledge_search': {
        'type': 'function',
        'function': {
            'name': 'knowledge_search',
            'description': '检索知识库（法规、SOP、项目经验、CDISC 标准等），支持关键词+向量+图谱混合检索',
            'parameters': {
                'type': 'object',
                'properties': {
                    'query': {
                        'type': 'string',
                        'description': '检索关键词或自然语言问题',
                    },
                    'entry_type': {
                        'type': 'string',
                        'description': '限定条目类型',
                        'enum': [
                            'regulation', 'sop', 'proposal_template',
                            'method_reference', 'lesson_learned', 'faq',
                            'feishu_doc', 'competitor_intel', 'instrument_spec',
                            'ingredient_data', 'meeting_decision', 'market_insight',
                            'paper_abstract',
                        ],
                    },
                    'top_k': {
                        'type': 'integer',
                        'description': '返回结果数量上限（默认 10）',
                    },
                    'graph_max_hops': {
                        'type': 'integer',
                        'description': '图谱扩展层数，支持 1 或 2，默认 1',
                    },
                    'graph_relation_types': {
                        'type': 'array',
                        'items': {'type': 'string'},
                        'description': '限定图谱关系类型，如 references / derives_from',
                    },
                    'graph_min_confidence': {
                        'type': 'number',
                        'description': '限定图谱关系最小置信度，默认 0',
                    },
                },
                'required': ['query'],
            },
        },
    },

    'knowledge_create': {
        'type': 'function',
        'function': {
            'name': 'knowledge_create',
            'description': '创建知识库条目（法规、经验教训、方法参考等）',
            'parameters': {
                'type': 'object',
                'properties': {
                    'title': {
                        'type': 'string',
                        'description': '条目标题',
                    },
                    'content': {
                        'type': 'string',
                        'description': '条目正文内容',
                    },
                    'entry_type': {
                        'type': 'string',
                        'description': '条目类型',
                        'enum': [
                            'regulation', 'sop', 'proposal_template',
                            'method_reference', 'lesson_learned', 'faq',
                            'feishu_doc', 'competitor_intel', 'instrument_spec',
                            'ingredient_data', 'meeting_decision', 'market_insight',
                            'paper_abstract',
                        ],
                    },
                    'summary': {
                        'type': 'string',
                        'description': '摘要（可选）',
                    },
                    'namespace': {
                        'type': 'string',
                        'description': '命名空间（可选）',
                    },
                    'tags': {
                        'type': 'array',
                        'items': {'type': 'string'},
                        'description': '标签列表（可选）',
                    },
                    'properties': {
                        'type': 'object',
                        'description': '结构化元数据（如 source_url/source_name/published_at/priority）',
                    },
                    'source_type': {
                        'type': 'string',
                        'description': '来源类型（可选，仅允许受控值）',
                        'enum': [
                            'agent_tool',
                            'market_intelligence_agent',
                            'consumer_insight_agent',
                            'competitor_monitor',
                        ],
                    },
                },
                'required': ['title', 'content', 'entry_type'],
            },
        },
    },

    'knowledge_entity_create': {
        'type': 'function',
        'function': {
            'name': 'knowledge_entity_create',
            'description': '创建知识图谱实体和关系（本体概念节点、语义连接）',
            'parameters': {
                'type': 'object',
                'properties': {
                    'label': {
                        'type': 'string',
                        'description': '实体中文名称',
                    },
                    'label_en': {
                        'type': 'string',
                        'description': '实体英文名称（可选）',
                    },
                    'definition': {
                        'type': 'string',
                        'description': '实体定义',
                    },
                    'entity_type': {
                        'type': 'string',
                        'description': '实体类型',
                        'enum': ['concept', 'instance', 'property', 'class'],
                    },
                    'uri': {
                        'type': 'string',
                        'description': '语义 URI，如 cnkis:visit-plan',
                    },
                    'namespace': {
                        'type': 'string',
                        'description': '命名空间',
                    },
                    'relations': {
                        'type': 'array',
                        'description': '与其他实体的关系（可选）',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'relation_type': {
                                    'type': 'string',
                                    'enum': [
                                        'is_a', 'part_of', 'has_property',
                                        'related_to', 'depends_on', 'produces',
                                        'governed_by', 'precedes', 'follows',
                                    ],
                                },
                                'target_uri': {
                                    'type': 'string',
                                    'description': '目标实体 URI',
                                },
                            },
                            'required': ['relation_type', 'target_uri'],
                        },
                    },
                },
                'required': ['label', 'entity_type', 'uri'],
            },
        },
    },

    # ========================================================================
    # MCP 工具 — 外部服务访问
    # ========================================================================

    'mcp_web_search': {
        'type': 'function',
        'function': {
            'name': 'mcp_web_search',
            'description': '搜索互联网获取实时信息（法规动态、行业新闻、竞品信息、消费者评价等）',
            'parameters': {
                'type': 'object',
                'properties': {
                    'query': {
                        'type': 'string',
                        'description': '搜索关键词或自然语言问题',
                    },
                    'max_results': {
                        'type': 'integer',
                        'description': '最大返回结果数（默认 5）',
                    },
                },
                'required': ['query'],
            },
        },
    },

    'mcp_web_extract': {
        'type': 'function',
        'function': {
            'name': 'mcp_web_extract',
            'description': '提取指定网页的结构化内容（用于采集法规全文、标准文档等）',
            'parameters': {
                'type': 'object',
                'properties': {
                    'url': {
                        'type': 'string',
                        'description': '要提取内容的网页 URL',
                    },
                },
                'required': ['url'],
            },
        },
    },

    'startup_pack_draft': {
        'type': 'function',
        'function': {
            'name': 'startup_pack_draft',
            'description': '根据协议生成项目启动包草稿：协议摘要、访视矩阵、资源需求、启动就绪清单、排程草案、工单模板、招募准备包。协议需已解析（有 parsed_data.visits）。',
            'parameters': {
                'type': 'object',
                'properties': {
                    'protocol_id': {
                        'type': 'integer',
                        'description': '协议 ID',
                    },
                    'schedule_start_days_offset': {
                        'type': 'integer',
                        'description': '排程起始相对今天的偏移天数，默认 0',
                    },
                    'schedule_duration_days': {
                        'type': 'integer',
                        'description': '排程跨度天数，默认 365',
                    },
                },
                'required': ['protocol_id'],
            },
        },
    },

    # ========================================================================
    # Claw 技能工具 — 统一技能调度
    # ========================================================================

    'claw_skill_invoke': {
        'type': 'function',
        'function': {
            'name': 'claw_skill_invoke',
            'description': '调用 Claw 技能（如协议解析、CRF 校验、报价生成、市场分析等），通过技能 ID 执行',
            'parameters': {
                'type': 'object',
                'properties': {
                    'skill_id': {
                        'type': 'string',
                        'description': '技能 ID',
                        'enum': [
                            'protocol-parser', 'crf-validator', 'visit-scheduler',
                            'efficacy-report-generator', 'recruitment-screener',
                            'auto-quotation', 'instrument-data-collector',
                            'equipment-lifecycle', 'sop-lifecycle', 'daily-report',
                            'audit-trail-engine', 'market-research',
                            'customer-success-manager', 'competitive-analysis',
                            'meeting-prep', 'research-paper-kb',
                            'business-dashboard', 'multi-domain-alert',
                            'feishu-notification-hub', 'hr-self-service',
                            'finance-automation', 'workorder-automation',
                            'shift-planner', 'reception-automation',
                            'morning-email-rollup', 'knowledge-ingestion',
                            'consumer-insight-report', 'ontology-builder',
                            'project-knowledge-archive',
                            'knowledge-hybrid-search', 'secretary-orchestrator',
                            'protocol-to-startup-pack',
                        ],
                    },
                    'params': {
                        'type': 'object',
                        'description': '技能参数（根据技能不同而异）',
                    },
                },
                'required': ['skill_id'],
            },
        },
    },

    'claw_skill_list': {
        'type': 'function',
        'function': {
            'name': 'claw_skill_list',
            'description': '列出所有可用的 Claw 技能及其执行方式',
            'parameters': {
                'type': 'object',
                'properties': {},
            },
        },
    },

    # ========================================================================
    # Agent 编排工具 — 跨 Agent 调用（orchestration-agent 专用）
    # ========================================================================

    'agent_invoke': {
        'type': 'function',
        'function': {
            'name': 'agent_invoke',
            'description': '调用其他 Agent 执行子任务（如让 knowledge-agent 检索、让 finance-agent 分析），编排器专用',
            'parameters': {
                'type': 'object',
                'properties': {
                    'agent_id': {
                        'type': 'string',
                        'description': '目标 Agent ID',
                        'enum': [
                            'knowledge-agent', 'protocol-agent', 'finance-agent',
                            'talent-agent', 'execution-agent', 'equipment-agent',
                            'crm-agent', 'ethics-agent', 'reception-assistant',
                            'recruitment-bot', 'quality-guardian',
                            'knowledge-ingestion-agent',
                            'consumer-insight-agent', 'market-intelligence-agent',
                        ],
                    },
                    'message': {
                        'type': 'string',
                        'description': '发送给目标 Agent 的消息/指令',
                    },
                    'context': {
                        'type': 'object',
                        'description': '附加上下文数据（可选）',
                    },
                },
                'required': ['agent_id', 'message'],
            },
        },
    },
}


# ============================================================================
# Handler 函数 — 每个工具的实际执行逻辑
# ============================================================================

def _handle_databus_snapshot(args: Dict[str, Any]) -> Dict[str, Any]:
    from apps.claw.data_bus import get_module_snapshot
    module = args.get('module', '')
    return get_module_snapshot(module, filters=args.get('filters'))


def _handle_databus_entity(args: Dict[str, Any]) -> Dict[str, Any]:
    from apps.claw.data_bus import get_entity_context
    return get_entity_context(args['entity_type'], args['entity_id'])


def _handle_databus_search(args: Dict[str, Any]) -> Dict[str, Any]:
    from apps.claw.data_bus import cross_module_search
    modules = args.get('modules') or None
    return cross_module_search(args['query'], modules=modules)


def _handle_databus_audit_trail(args: Dict[str, Any]) -> Dict[str, Any]:
    from apps.claw.data_bus import get_audit_trail
    return get_audit_trail(args['model_name'], args['record_id'])


def _resolve_execution_context(execution_context: Any) -> Any:
    """从 context 字典解析出 SkillExecutionContext，供知识/数据范围使用。"""
    if execution_context is None:
        return None
    if hasattr(execution_context, 'to_dict'):
        return execution_context
    if isinstance(execution_context, dict):
        from apps.secretary.execution_context import SkillExecutionContext
        inner = execution_context.get('execution_context') or execution_context
        if isinstance(inner, dict) and inner.get('account_id') is not None:
            return SkillExecutionContext.from_dict(inner)
    return None


def _handle_knowledge_search(args: Dict[str, Any], execution_context=None, agent_id: str = '') -> Dict[str, Any]:
    from apps.knowledge.retrieval_gateway import multi_channel_search
    ctx = _resolve_execution_context(execution_context)
    return multi_channel_search(
        query=args['query'],
        entry_type=args.get('entry_type'),
        channels=['keyword', 'vector', 'graph'],
        top_k=args.get('top_k', 10),
        graph_max_hops=args.get('graph_max_hops', 1),
        graph_relation_types=args.get('graph_relation_types'),
        graph_min_confidence=args.get('graph_min_confidence', 0.0),
        execution_context=ctx,
    )


def _handle_knowledge_create(args: Dict[str, Any], execution_context=None, agent_id: str = '') -> Dict[str, Any]:
    """
    通过统一入库管线创建知识条目。
    Agent 工具创建的知识一律经过 pipeline，且强制进入 pending_review 状态（不直接发布）。
    """
    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
    import re

    source_type = args.get('source_type') or ''
    if not source_type and agent_id == 'market-intelligence-agent':
        source_type = 'market_intelligence_agent'
    elif not source_type and agent_id == 'consumer-insight-agent':
        source_type = 'consumer_insight_agent'
    elif not source_type:
        source_type = 'agent_tool'

    if source_type not in {
        'agent_tool',
        'market_intelligence_agent',
        'consumer_insight_agent',
        'competitor_monitor',
    }:
        source_type = 'agent_tool'

    tags = args.get('tags', []) or []
    if not tags and source_type == 'market_intelligence_agent':
        entry_type = args.get('entry_type', '')
        title = args.get('title', '')
        inferred_tags = {
            'regulation': ['法规动态', '市场情报'],
            'competitor_intel': ['竞品情报', '市场情报'],
            'market_insight': ['市场洞察', '市场情报'],
            'ingredient_data': ['成分趋势', '市场情报'],
        }.get(entry_type, ['市场情报', '外部采集'])
        if '成分' in title and '成分趋势' not in inferred_tags:
            inferred_tags = inferred_tags + ['成分趋势']
        if 'NMPA' in title and 'NMPA' not in inferred_tags:
            inferred_tags = inferred_tags + ['NMPA']
        tags = inferred_tags

    content = args.get('content', '') or ''
    summary = args.get('summary', '') or ''
    if not summary and source_type == 'market_intelligence_agent':
        compact = ' '.join(content.split())
        summary = compact[:160]

    properties = dict(args.get('properties', {}) or {})
    if source_type == 'market_intelligence_agent' and not properties.get('source_url'):
        match = re.search(r'https?://\S+', content)
        if match:
            properties['source_url'] = match.group(0).rstrip('.,);]')

    raw = RawKnowledgeInput(
        title=args.get('title', ''),
        content=content,
        entry_type=args.get('entry_type', ''),
        summary=summary,
        namespace=args.get('namespace', 'cnkis'),
        tags=tags,
        source_type=source_type,
        source_key=args.get('source_key', ''),
        properties=properties,
    )

    result = run_pipeline(raw)

    if not result.success or not result.entry_id:
        return {
            'error': '知识条目创建失败',
            'stage_errors': result.stage_errors,
        }

    return {
        'id': result.entry_id,
        'title': args.get('title', ''),
        'entry_type': args.get('entry_type', ''),
        'status': result.status,
        'quality_score': result.quality_score,
        'note': '已进入审核队列，由知识管理员审核后发布' if result.status == 'pending_review' else '',
    }


def _handle_knowledge_entity_create(args: Dict[str, Any]) -> Dict[str, Any]:
    from apps.knowledge.models import (
        KnowledgeEntity, KnowledgeRelation,
        EntityType, OntologyNamespace,
    )

    entity, created = KnowledgeEntity.objects.get_or_create(
        namespace=args.get('namespace', OntologyNamespace.CNKIS),
        uri=args['uri'],
        defaults={
            'label': args['label'],
            'label_en': args.get('label_en', ''),
            'definition': args.get('definition', ''),
            'entity_type': args.get('entity_type', EntityType.CONCEPT),
        },
    )

    relations_created = 0
    for rel in args.get('relations', []):
        target = KnowledgeEntity.objects.filter(
            uri=rel['target_uri'], is_deleted=False,
        ).first()
        if not target:
            continue
        _, rel_created = KnowledgeRelation.objects.get_or_create(
            subject=entity,
            object=target,
            predicate_uri=f"cnkis:{rel['relation_type']}",
            defaults={
                'relation_type': rel['relation_type'],
                'confidence': 0.9,
                'source': 'agent_tool',
            },
        )
        if rel_created:
            relations_created += 1

    return {
        'entity_id': entity.id,
        'uri': entity.uri,
        'label': entity.label,
        'created': created,
        'relations_created': relations_created,
    }


def _handle_startup_pack_draft(
    args: Dict[str, Any],
    execution_context=None,
    agent_id: str = '',
) -> Dict[str, Any]:
    from apps.visit.services.startup_pack_service import StartupPackService
    ctx = _resolve_execution_context(execution_context)
    created_by_id = ctx.account_id if ctx else None
    return StartupPackService.generate_draft(
        protocol_id=args['protocol_id'],
        created_by_id=created_by_id,
        schedule_start_days_offset=args.get('schedule_start_days_offset', 0),
        schedule_duration_days=args.get('schedule_duration_days', 365),
    )


def _handle_mcp_web_search(args: Dict[str, Any]) -> Dict[str, Any]:
    from libs.mcp_client import web_search
    return web_search(
        query=args['query'],
        max_results=args.get('max_results', 5),
    )


def _handle_mcp_web_extract(args: Dict[str, Any]) -> Dict[str, Any]:
    from libs.mcp_client import web_extract
    return web_extract(url=args['url'])


def _handle_claw_skill_invoke(args: Dict[str, Any], execution_context=None) -> Dict[str, Any]:
    from apps.claw.skill_executor import execute_skill
    return execute_skill(
        skill_id=args['skill_id'],
        params=args.get('params', {}),
        execution_context=execution_context,
    )


def _handle_claw_skill_list(args: Dict[str, Any]) -> Dict[str, Any]:
    from apps.claw.skill_executor import list_skills
    return {'skills': list_skills()}


def _handle_agent_invoke(args: Dict[str, Any], execution_context=None) -> Dict[str, Any]:
    from apps.agent_gateway.services import call_agent
    from apps.agent_gateway.models import AgentCallStatus

    if execution_context is None:
        account_id = 0
        execution_context_payload = {}
    elif isinstance(execution_context, dict):
        account_id = execution_context.get('account_id', 0) or 0
        execution_context_payload = execution_context
    else:
        account_id = getattr(execution_context, 'account_id', 0) or 0
        execution_context_payload = execution_context.to_dict() if hasattr(execution_context, 'to_dict') else {}

    call = call_agent(
        account_id=account_id,
        agent_id=args['agent_id'],
        message=args['message'],
        context={
            **(args.get('context', {}) or {}),
            'execution_context': execution_context_payload,
        },
    )
    return {
        'status': 'success' if call.status == AgentCallStatus.SUCCESS else 'failed',
        'output': call.output_text[:4000],
        'call_id': call.id,
        'tool_calls': len(call.tool_calls_log or []),
    }


# ============================================================================
# Handler 注册表
# ============================================================================

TOOL_HANDLERS: Dict[str, Callable] = {
    'databus_snapshot': _handle_databus_snapshot,
    'databus_entity': _handle_databus_entity,
    'databus_search': _handle_databus_search,
    'databus_audit_trail': _handle_databus_audit_trail,
    'knowledge_search': _handle_knowledge_search,
    'knowledge_create': _handle_knowledge_create,
    'knowledge_entity_create': _handle_knowledge_entity_create,
    'startup_pack_draft': _handle_startup_pack_draft,
    'mcp_web_search': _handle_mcp_web_search,
    'mcp_web_extract': _handle_mcp_web_extract,
    'claw_skill_invoke': _handle_claw_skill_invoke,
    'claw_skill_list': _handle_claw_skill_list,
    'agent_invoke': _handle_agent_invoke,
}


# ============================================================================
# 公共 API
# ============================================================================

def get_tool_schemas(tool_names: List[str]) -> List[dict]:
    """根据工具名称列表返回 OpenAI function calling 格式的 schema 列表"""
    schemas = []
    for name in tool_names:
        schema = TOOL_DEFINITIONS.get(name)
        if schema:
            schemas.append(schema)
        else:
            logger.warning('Unknown tool requested: %s', name)
    return schemas


def get_handler(tool_name: str) -> Optional[Callable]:
    """获取工具的 handler 函数"""
    return TOOL_HANDLERS.get(tool_name)


def list_available_tools() -> List[str]:
    """列出所有可用工具名称"""
    return list(TOOL_DEFINITIONS.keys())
