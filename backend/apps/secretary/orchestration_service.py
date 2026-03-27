"""
数字员工编排器 — 多 Agent 协同调度服务 (D6)

核心能力：
1. 任务分解：将复合请求拆解为多个子任务
2. Agent 路由：按领域将子任务派发到合适的智能体
3. 并行调度：支持独立子任务并发执行
4. 结果聚合：汇总多 Agent 输出，生成统一响应
5. 紧急编排：CRITICAL 事件触发跨台协调方案
"""
import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from django.utils import timezone

logger = logging.getLogger(__name__)

# 默认常量（DB 无数据时使用；sync_orchestration_config 会导入到 DB）
_DEFAULT_DOMAIN_AGENT_MAP: Dict[str, str] = {
    'general': 'general-assistant',
    'protocol': 'protocol-agent',
    'solution': 'protocol-agent',
    'analysis': 'consumer-insight-agent',
    'report': 'knowledge-agent',
    'hr': 'hr-agent',
    'knowledge': 'knowledge-agent',
    'alert': 'orchestration-agent',
    'insight': 'consumer-insight-agent',
    'finance': 'finance-agent',
    'crm': 'crm-agent',
    'quality': 'quality-guardian',
    'equipment': 'equipment-manager',
    'reception': 'reception-assistant',
    'recruitment': 'recruitment-bot',
    'execution': 'execution-agent',
    'ethics': 'ethics-agent',
    'orchestration': 'orchestration-agent',
}

_DEFAULT_DOMAIN_CLAW_MAP: Dict[str, List[str]] = {
    'notification': ['feishu-notification-hub'],
    'alert': ['multi-domain-alert'],
    'scheduling': ['visit-scheduler'],
    'workorder': ['workorder-automation'],
    'report': ['efficacy-report-generator', 'business-dashboard'],
    'recruitment': ['recruitment-screener'],
    'equipment': ['equipment-lifecycle'],
    'knowledge': ['knowledge-hybrid-search'],
    'finance': ['finance-automation', 'auto-quotation'],
    'hr': ['hr-self-service', 'shift-planner'],
    'quality': ['crf-validator', 'audit-trail-engine'],
    'reception': ['reception-automation'],
    'orchestration': ['secretary-orchestrator'],
}

# 二轮收口：业务对象类型（最小协议）
ALLOWED_BUSINESS_OBJECT_TYPES = ('opportunity', 'project', 'workorder', 'report')

# 领域 -> 岗位编码（编排主链推断用）
DOMAIN_TO_ROLE_CODE: Dict[str, str] = {
    'crm': 'customer_demand_analyst',
    'protocol': 'solution_designer',
    'solution': 'solution_designer',
    'finance': 'quote_analyst',
    'report': 'report_generator',
    'scheduling': 'scheduling_optimizer',
    'workorder': 'workorder_matcher',
    'quality': 'quality_guardian',
    'knowledge': 'knowledge_curator',
    'hr': 'hr_assistant',
    'recruitment': 'recruitment_screener',
    'equipment': 'equipment_manager',
    'reception': 'reception_assistant',
    'execution': 'execution_coordinator',
    'ethics': 'ethics_liaison',
    'general': '',
    'alert': '',
    'notification': '',
    'orchestration': '',
    'insight': 'consumer_insight_analyst',
    'analysis': 'consumer_insight_analyst',
}


def _resolve_role_code_for_agent(agent_id: str, workstation_key: str = '') -> str:
    """优先从岗位映射表按 agent_id 解析岗位编码，未命中再由上层回退到 domain 常量。"""
    if not agent_id:
        return ''
    try:
        from .models_roles import WorkerRoleDefinition

        for role in WorkerRoleDefinition.objects.filter(enabled=True).order_by('role_code'):
            if agent_id not in list(role.mapped_agent_ids or []):
                continue
            scope = list(role.workstation_scope or [])
            if scope and workstation_key and workstation_key not in scope:
                continue
            return role.role_code
    except Exception as e:
        logger.debug('_resolve_role_code_for_agent %s failed: %s', agent_id, e)
        return ''
    return ''


def _extract_business_context(context: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """从编排 context 提取业务对象与工作台，仅允许 ALLOWED_BUSINESS_OBJECT_TYPES。"""
    out = {
        'business_object_type': '',
        'business_object_id': '',
        'workstation_key': '',
    }
    if not context or not isinstance(context, dict):
        return out
    raw_type = (context.get('business_object_type') or context.get('business_objectType') or '').strip().lower()
    if raw_type in ALLOWED_BUSINESS_OBJECT_TYPES:
        out['business_object_type'] = raw_type
    raw_id = (context.get('business_object_id') or context.get('business_objectId') or '')
    if isinstance(raw_id, str):
        out['business_object_id'] = raw_id.strip()[:120]
    elif raw_id is not None:
        out['business_object_id'] = str(raw_id)[:120]
    raw_ws = (context.get('workstation_key') or context.get('workstationKey') or '')
    if isinstance(raw_ws, str):
        out['workstation_key'] = raw_ws.strip()[:80]
    return out


_DEFAULT_KEYWORD_DOMAIN_MAP: Dict[str, str] = {
    '协议': 'protocol', '方案': 'protocol',
    '报价': 'finance', '合同': 'finance', '发票': 'finance', '回款': 'finance',
    '排程': 'scheduling', '访视': 'scheduling',
    '工单': 'workorder', '派单': 'workorder',
    '设备': 'equipment', '校准': 'equipment', '仪器': 'equipment',
    '偏差': 'quality', '质量': 'quality', 'CAPA': 'quality', 'SOP': 'quality',
    '人事': 'hr', '排班': 'hr', '培训': 'hr',
    '客户': 'crm', '商机': 'crm',
    '招募': 'recruitment', '受试者': 'recruitment', '筛选': 'recruitment',
    '知识': 'knowledge', '检索': 'knowledge',
    '预警': 'alert', '风险': 'alert',
    '报告': 'report', '统计': 'report', '分析': 'report',
    '通知': 'notification', '飞书': 'notification',
}

# 编排配置内存缓存；None 表示未加载，下次 get_* 时从 DB 加载
_orch_config_cache: Optional[Dict[str, Any]] = None


def _load_orchestration_config() -> None:
    global _orch_config_cache
    if _orch_config_cache is not None:
        return
    try:
        from .models_orchestration_config import (
            DomainAgentMapping,
            DomainSkillMapping,
            KeywordDomainMapping,
        )
        if DomainAgentMapping.objects.exists():
            domain_agent = {
                m.domain_code: m.agent_id
                for m in DomainAgentMapping.objects.all()
            }
            domain_claw_raw = DomainSkillMapping.objects.all().order_by('domain_code', '-priority')
            domain_claw: Dict[str, List[str]] = {}
            for m in domain_claw_raw:
                domain_claw.setdefault(m.domain_code, []).append(m.skill_id)
            keyword_domain = {
                m.keyword: m.domain_code
                for m in KeywordDomainMapping.objects.all()
            }
            _orch_config_cache = {
                'domain_agent': domain_agent,
                'domain_claw': domain_claw,
                'keyword_domain': keyword_domain,
            }
            logger.info(
                'Orchestration config loaded from DB: %d domain_agent, %d domain_claw, %d keyword',
                len(domain_agent), len(domain_claw), len(keyword_domain),
            )
            return
    except Exception as e:
        logger.warning('Load orchestration config from DB failed: %s', e)
    _orch_config_cache = {
        'domain_agent': dict(_DEFAULT_DOMAIN_AGENT_MAP),
        'domain_claw': dict(_DEFAULT_DOMAIN_CLAW_MAP),
        'keyword_domain': dict(_DEFAULT_KEYWORD_DOMAIN_MAP),
    }


def get_domain_agent_map() -> Dict[str, str]:
    _load_orchestration_config()
    return _orch_config_cache['domain_agent']


def get_domain_claw_map() -> Dict[str, List[str]]:
    _load_orchestration_config()
    return _orch_config_cache['domain_claw']


def get_keyword_domain_map() -> Dict[str, str]:
    _load_orchestration_config()
    return _orch_config_cache['keyword_domain']


def reload_orchestration_config() -> None:
    """热更新：清空内存缓存，下次访问时从 DB 重新加载"""
    global _orch_config_cache
    _orch_config_cache = None
    logger.info('Orchestration config cache cleared (reload requested)')


def _quick_domain_detect(query: str) -> Optional[str]:
    """基于关键词快速检测单领域请求，命中时跳过 LLM 分解"""
    scores: Dict[str, int] = {}
    for keyword, domain in get_keyword_domain_map().items():
        if keyword in query:
            scores[domain] = scores.get(domain, 0) + 1
    if not scores:
        return None
    top = max(scores, key=scores.get)
    if scores[top] >= 2 and len(scores) <= 2:
        return top
    return None


class OrchestrationResult:
    """编排执行结果"""

    __slots__ = (
        'task_id', 'status', 'sub_tasks', 'aggregated_output',
        'duration_ms', 'errors', 'dispatched_claws', 'structured_artifacts',
    )

    def __init__(self, task_id: str):
        self.task_id = task_id
        self.status = 'pending'
        self.sub_tasks: List[Dict[str, Any]] = []
        self.aggregated_output = ''
        self.duration_ms = 0
        self.errors: List[str] = []
        self.dispatched_claws: List[str] = []
        self.structured_artifacts: Dict[str, Any] = {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            'task_id': self.task_id,
            'status': self.status,
            'sub_task_count': len(self.sub_tasks),
            'sub_tasks': self.sub_tasks,
            'aggregated_output': self.aggregated_output,
            'duration_ms': self.duration_ms,
            'errors': self.errors,
            'dispatched_claws': self.dispatched_claws,
            'structured_artifacts': self.structured_artifacts,
        }


def decompose_task(
    query: str,
    context: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    使用 LLM 将复合请求分解为子任务列表。

    返回格式: [{"domain": str, "task": str, "priority": int, "depends_on": [int]}]

    优化路径：
    1. 先用关键词快速检测，单领域请求跳过 LLM 分解
    2. 多领域请求走 LLM 分解
    3. LLM 失败时 fallback 到基于关键词的静态路由
    """
    quick = _quick_domain_detect(query)
    if quick:
        logger.info('[DECOMPOSE] Quick domain detect: %s for query=%s', quick, query[:80])
        return [{'domain': quick, 'task': query, 'priority': 1, 'depends_on': [], 'index': 0}]

    from apps.agent_gateway.services import quick_chat

    decompose_prompt = (
        '任务分解引擎。将请求拆为子任务，分配领域。'
        '领域：general/protocol/report/hr/knowledge/alert/finance/crm/quality/equipment/scheduling/workorder。'
        '输出JSON数组：[{"domain":"","task":"","priority":1,"depends_on":[]}]。仅JSON。'
    )

    ctx_str = ''
    if context:
        ctx_filtered = {k: v for k, v in context.items() if k != '_fixed_subtasks'}
        ctx_str = f"\n上下文：{json.dumps(ctx_filtered, ensure_ascii=False, default=str)[:800]}"

    try:
        raw = quick_chat(
            message=f"分解请求：\n{query}{ctx_str}",
            system_prompt=decompose_prompt,
            temperature=0.2,
            max_tokens=1024,
        )
        raw = raw.strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
            if raw.endswith('```'):
                raw = raw[:-3]
            raw = raw.strip()

        tasks = json.loads(raw)
        if not isinstance(tasks, list):
            tasks = [tasks]

        for i, t in enumerate(tasks):
            t.setdefault('domain', 'general')
            t.setdefault('task', query)
            t.setdefault('priority', 2)
            t.setdefault('depends_on', [])
            t['index'] = i

        return tasks
    except Exception as e:
        logger.warning('Task decomposition LLM failed: %s — falling back to keyword routing', e)
        return _keyword_fallback_decompose(query)


def _keyword_fallback_decompose(query: str) -> List[Dict[str, Any]]:
    """LLM 分解失败时基于关键词的静态路由 fallback"""
    scores: Dict[str, int] = {}
    for keyword, domain in get_keyword_domain_map().items():
        if keyword in query:
            scores[domain] = scores.get(domain, 0) + 1

    if not scores:
        return [{'domain': 'general', 'task': query, 'priority': 1, 'depends_on': [], 'index': 0}]

    sorted_domains = sorted(scores.items(), key=lambda x: -x[1])
    tasks = []
    for i, (domain, _score) in enumerate(sorted_domains[:3]):
        tasks.append({
            'domain': domain,
            'task': query,
            'priority': i + 1,
            'depends_on': [],
            'index': i,
        })

    logger.info('[DECOMPOSE] Keyword fallback produced %d tasks: %s',
                len(tasks), [t['domain'] for t in tasks])
    return tasks


def route_to_agent(domain: str) -> str:
    """
    将领域映射到 Agent ID。

    路由优先级：
    1. 显式 domain→agent 映射（DB 或配置）
    2. DomainWorkerBlueprint 领域样板解析
    3. capabilities 关键词匹配（智能路由）
    4. 兜底到 general-assistant
    """
    domain_agent_map = get_domain_agent_map()
    if domain in domain_agent_map:
        return domain_agent_map[domain]
    try:
        from .domain_worker_service import resolve_domain_agent

        resolved = resolve_domain_agent(domain, fallback='')
        if resolved:
            return resolved
    except Exception:
        pass

    # capabilities 驱动的智能路由：当 domain 无直接映射时，按 capabilities 匹配
    matched = _match_agent_by_capabilities(domain)
    if matched:
        return matched

    return domain_agent_map.get(domain, 'general-assistant')


def _match_agent_by_capabilities(domain: str) -> str:
    """按 Agent 的 capabilities 字段关键词匹配最佳 Agent。"""
    try:
        from apps.agent_gateway.models import AgentDefinition

        domain_lower = domain.lower()
        best_agent = ''
        best_score = 0

        for agent in AgentDefinition.objects.filter(is_active=True, paused=False):
            caps = agent.capabilities or []
            score = sum(1 for cap in caps if domain_lower in str(cap).lower() or str(cap).lower() in domain_lower)
            if score > best_score:
                best_score = score
                best_agent = agent.agent_id

        return best_agent
    except Exception:
        return ''


def _execute_sub_task(
    sub_task: Dict[str, Any],
    account_id: int,
    context: Optional[Dict[str, Any]] = None,
    previous_results: Optional[Dict[int, str]] = None,
    max_retries: int = 2,
    sub_task_timeout: int = 30,
) -> Dict[str, Any]:
    """
    执行单个子任务。

    增强能力：
    - 最多重试 max_retries 次（指数退避 1s, 2s）
    - 单子任务超时控制（sub_task_timeout 秒）
    - 降级策略：指定 Agent 失败时 fallback 到 general-assistant
    - 反馈循环注入：调用前注入用户行为学习信号
    """
    from apps.agent_gateway.services import call_agent

    domain = sub_task.get('domain', 'general')
    task_text = sub_task.get('task', '')
    index = sub_task.get('index', 0)
    agent_id = route_to_agent(domain)

    enriched_context = dict(context or {})
    enriched_context['orchestration_domain'] = domain
    enriched_context['orchestration_index'] = index

    if previous_results:
        deps = sub_task.get('depends_on', [])
        dep_outputs = {}
        for dep_idx in deps:
            if dep_idx in previous_results:
                dep_outputs[f'sub_task_{dep_idx}'] = previous_results[dep_idx][:3000]
        if dep_outputs:
            enriched_context['dependency_outputs'] = dep_outputs

    try:
        from .feedback_loop_service import generate_agent_learning_context
        learning = generate_agent_learning_context(account_id, agent_id)
        if learning:
            enriched_context['learning_signal'] = learning
    except Exception:
        pass

    last_error = ''
    retry_count = 0
    current_agent = agent_id

    for attempt in range(1 + max_retries):
        start = time.monotonic()
        try:
            call = call_agent(
                account_id=account_id,
                agent_id=current_agent,
                message=task_text,
                context=enriched_context,
            )
            elapsed = int((time.monotonic() - start) * 1000)
            if elapsed > sub_task_timeout * 1000:
                logger.warning('Sub-task %d (%s) exceeded soft timeout: %dms', index, domain, elapsed)
            return {
                'index': index,
                'domain': domain,
                'agent_id': current_agent,
                'status': 'success',
                'output': call.output_text or '',
                'duration_ms': elapsed,
                'token_usage': call.token_usage or {},
                'retry_count': retry_count,
            }
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            last_error = str(e)
            retry_count = attempt + 1
            logger.warning('Sub-task %d (%s) attempt %d failed: %s', index, domain, attempt + 1, e)

            if attempt < max_retries:
                backoff = (attempt + 1)
                time.sleep(backoff)

                if attempt == max_retries - 1 and current_agent != 'general-assistant':
                    logger.info('Sub-task %d (%s) falling back to general-assistant', index, domain)
                    current_agent = 'general-assistant'

    return {
        'index': index,
        'domain': domain,
        'agent_id': current_agent,
        'status': 'failed',
        'output': '',
        'error': last_error,
        'duration_ms': int((time.monotonic() - start) * 1000),
        'retry_count': retry_count,
    }


def _build_structured_artifacts_for_chain1(
    sub_tasks: List[Dict[str, Any]],
    results: List[Dict[str, Any]],
    original_query: str,
    aggregated_output: str,
) -> Dict[str, Any]:
    """
    当编排涉及 crm + protocol + finance 时，生成闭环一结构化产物：
    需求摘要、缺口清单、方案初稿、报价输入项。
    """
    domains = {r.get('domain', '') for r in results}
    if not ({'crm', 'protocol', 'finance'} & domains):
        return {}
    from apps.agent_gateway.services import quick_chat
    pieces = []
    for r in sorted(results, key=lambda x: x.get('index', 0)):
        domain = r.get('domain', 'unknown')
        output = r.get('output', '')[:1500]
        pieces.append(f"【{domain}】\n{output}")
    combined = '\n\n'.join(pieces)
    prompt = (
        '提取JSON：{"demand_summary":"需求摘要","gap_list":["待办"],"solution_draft":"方案要点","quote_inputs":["报价项"]}。'
        '无内容给空值。仅输出JSON。'
    )
    try:
        raw = quick_chat(
            message=f"请求：{original_query[:200]}\n\n结果：\n{combined}\n\n摘要：{aggregated_output[:800]}",
            system_prompt=prompt,
            temperature=0.2,
            max_tokens=1024,
        )
        raw = raw.strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
            if raw.endswith('```'):
                raw = raw[:-3]
            raw = raw.strip()
        out = json.loads(raw)
        if isinstance(out, dict):
            return {
                'demand_summary': out.get('demand_summary', ''),
                'gap_list': out.get('gap_list') if isinstance(out.get('gap_list'), list) else [],
                'solution_draft': out.get('solution_draft', ''),
                'quote_inputs': out.get('quote_inputs') if isinstance(out.get('quote_inputs'), list) else [],
            }
    except Exception as e:
        logger.warning('Structured artifacts extraction failed: %s', e)
    return {}


def _aggregate_results(
    sub_tasks: List[Dict[str, Any]],
    results: List[Dict[str, Any]],
    original_query: str,
) -> str:
    """使用 LLM 聚合多个子任务的结果"""
    from apps.agent_gateway.services import quick_chat

    if len(results) == 1:
        return results[0].get('output', '')

    pieces = []
    for r in sorted(results, key=lambda x: x.get('index', 0)):
        domain = r.get('domain', 'unknown')
        output = r.get('output', '（执行失败）')
        pieces.append(f"【{domain}】\n{output[:1500]}")

    aggregate_prompt = (
        "整合以下多智能体分析结果为连贯综合回复：先总结1-2句，按领域分段，指出跨域关联，最后综合建议。中文简洁。"
    )

    combined = '\n\n'.join(pieces)
    try:
        return quick_chat(
            message=f"用户原始请求：{original_query}\n\n各智能体分析结果：\n{combined}",
            system_prompt=aggregate_prompt,
            temperature=0.4,
            max_tokens=4096,
        )
    except Exception as e:
        logger.warning('Aggregation failed: %s', e)
        return '\n\n---\n\n'.join(pieces)


def orchestrate(
    account_id: int,
    query: str,
    context: Optional[Dict[str, Any]] = None,
    max_parallel: int = 4,
) -> OrchestrationResult:
    """
    编排主入口：分解 → 调度 → 聚合。

    支持依赖拓扑：无依赖的子任务并行执行，
    有依赖的等待前置完成后再执行。
    """
    task_id = f"ORCH-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
    result = OrchestrationResult(task_id)
    start = time.monotonic()
    runtime_task_id = ''

    business_ctx = _extract_business_context(context)
    fixed = (context or {}).get('_fixed_subtasks') if isinstance(context, dict) else None
    if fixed and isinstance(fixed, list):
        sub_tasks = fixed
        logger.info('[ORCH][%s] Using fixed subtasks (%d), skipping LLM decompose', task_id, len(fixed))
    else:
        sub_tasks = decompose_task(query, context)
    result.sub_tasks = sub_tasks
    primary_domain = (sub_tasks[0].get('domain', 'general') if sub_tasks else 'general')
    primary_agent = route_to_agent(primary_domain)
    inferred_role = _resolve_role_code_for_agent(primary_agent, business_ctx.get('workstation_key', '')) or DOMAIN_TO_ROLE_CODE.get(primary_domain, '')

    try:
        from .runtime_plane import build_scope_proof, create_execution_task, finalize_execution_task, transition_execution_task

        runtime_task_id = create_execution_task(
            runtime_type='orchestration',
            name='orchestrate',
            target='orchestration-agent',
            account_id=account_id,
            input_payload={'query': query},
            context_payload=context or {},
            scope_proof=build_scope_proof(),
            risk_level='medium',
            business_run_id=task_id,
            role_code=inferred_role,
            domain_code=primary_domain,
            workstation_key=business_ctx.get('workstation_key', ''),
            business_object_type=business_ctx.get('business_object_type', ''),
            business_object_id=business_ctx.get('business_object_id', ''),
        )
        transition_execution_task(runtime_task_id, 'running', note='orchestration_started')
    except Exception:
        runtime_task_id = ''

    logger.info('[ORCH][%s] START query=%s sub_count=%d', task_id, query[:100], len(sub_tasks))

    if not sub_tasks:
        result.status = 'empty'
        result.aggregated_output = '无法分解任务'
        result.duration_ms = int((time.monotonic() - start) * 1000)
        return result

    for st in sub_tasks:
        domain = st.get('domain', 'general')
        claws = get_domain_claw_map().get(domain, [])
        try:
            from .domain_worker_service import resolve_domain_skills

            claws = list(set(claws + resolve_domain_skills(domain)))
        except Exception:
            pass
        result.dispatched_claws.extend(claws)
    result.dispatched_claws = list(set(result.dispatched_claws))

    completed: Dict[int, str] = {}
    all_results: List[Dict[str, Any]] = []

    phases = _build_execution_phases(sub_tasks)
    completed_indices: List[int] = []

    for phase_index, phase in enumerate(phases):
        if len(phase) == 1:
            r = _execute_sub_task(phase[0], account_id, context, completed)
            all_results.append(r)
            completed[r['index']] = r.get('output', '')
            logger.info('[ORCH][%s] SUB[%d] domain=%s agent=%s status=%s ms=%d',
                        task_id, r['index'], r.get('domain', ''), r.get('agent_id', ''),
                        r['status'], r.get('duration_ms', 0))
            if r['status'] == 'failed':
                result.errors.append(f"sub_task_{r['index']}: {r.get('error', 'unknown')}")
            else:
                completed_indices.append(r['index'])
                _save_checkpoint(task_id, completed_indices, phase_index, {str(r['index']): r.get('output', '')})
        else:
            with ThreadPoolExecutor(max_workers=min(len(phase), max_parallel)) as pool:
                futures = {
                    pool.submit(_execute_sub_task, st, account_id, context, completed): st
                    for st in phase
                }
                for future in as_completed(futures):
                    r = future.result()
                    all_results.append(r)
                    completed[r['index']] = r.get('output', '')
                    logger.info('[ORCH][%s] SUB[%d] domain=%s agent=%s status=%s ms=%d',
                                task_id, r['index'], r.get('domain', ''), r.get('agent_id', ''),
                                r['status'], r.get('duration_ms', 0))
                    if r['status'] == 'failed':
                        result.errors.append(f"sub_task_{r['index']}: {r.get('error', 'unknown')}")
                    else:
                        completed_indices.append(r['index'])
            _save_checkpoint(task_id, completed_indices, phase_index, {str(i): completed.get(i, '') for i in completed_indices})

    result.aggregated_output = _aggregate_results(sub_tasks, all_results, query)
    result.sub_tasks = all_results
    result.status = 'success' if not result.errors else 'partial'
    result.duration_ms = int((time.monotonic() - start) * 1000)
    result.structured_artifacts = _build_structured_artifacts_for_chain1(sub_tasks, all_results, query, result.aggregated_output)

    logger.info('[ORCH][%s] END status=%s ms=%d errors=%d',
                task_id, result.status, result.duration_ms, len(result.errors))

    # 用实际执行结果的领域分布推断 domain/role（用于持久化）
    domain_counts: Dict[str, int] = {}
    for r in all_results:
        d = r.get('domain', '') or 'general'
        domain_counts[d] = domain_counts.get(d, 0) + 1
    persist_domain = max(domain_counts, key=domain_counts.get) if domain_counts else primary_domain
    dominant_agent = ''
    agent_counts: Dict[str, int] = {}
    for r in all_results:
        aid = (r.get('agent_id') or '').strip()
        if aid:
            agent_counts[aid] = agent_counts.get(aid, 0) + 1
    if agent_counts:
        dominant_agent = max(agent_counts, key=agent_counts.get)
    persist_role = _resolve_role_code_for_agent(dominant_agent, business_ctx.get('workstation_key', '')) or DOMAIN_TO_ROLE_CODE.get(persist_domain, inferred_role)

    _persist_orchestration_run(
        task_id, account_id, query, context, result, sub_tasks, all_results,
        role_code=persist_role,
        domain_code=persist_domain,
        workstation_key=business_ctx.get('workstation_key', ''),
        business_object_type=business_ctx.get('business_object_type', ''),
        business_object_id=business_ctx.get('business_object_id', ''),
    )
    if runtime_task_id:
        try:
            from .runtime_plane import finalize_execution_task

            finalize_execution_task(
                task_id=runtime_task_id,
                ok=result.status == 'success',
                output=result.to_dict(),
                error='; '.join(result.errors),
                metrics={'duration_ms': result.duration_ms, 'sub_task_count': len(all_results)},
                receipt={'orchestration_run_id': task_id},
            )
        except Exception:
            pass

    return result


def _persist_orchestration_run(
    task_id: str,
    account_id: int,
    query: str,
    context: Optional[Dict[str, Any]],
    result: OrchestrationResult,
    sub_tasks: List[Dict[str, Any]],
    all_results: List[Dict[str, Any]],
    role_code: str = '',
    domain_code: str = '',
    workstation_key: str = '',
    business_object_type: str = '',
    business_object_id: str = '',
    gate_run_id: str = '',
    resumed_from: str = '',
):
    """将编排执行记录持久化到数据库（含业务对象与岗位字段）。"""
    try:
        from .models_orchestration import OrchestrationRun, OrchestrationSubTask
        run = OrchestrationRun.objects.create(
            task_id=task_id,
            business_run_id=task_id,
            role_code=role_code,
            domain_code=domain_code,
            workstation_key=workstation_key,
            business_object_type=business_object_type,
            business_object_id=business_object_id,
            gate_run_id=gate_run_id,
            resumed_from=resumed_from,
            account_id=account_id,
            query=query,
            context_json=context or {},
            status=result.status,
            sub_task_count=len(all_results),
            aggregated_output=result.aggregated_output[:10000],
            duration_ms=result.duration_ms,
            errors_json=result.errors,
            dispatched_claws=result.dispatched_claws,
            structured_artifacts=result.structured_artifacts or {},
            completed_at=timezone.now(),
        )
        for r in all_results:
            OrchestrationSubTask.objects.create(
                run=run,
                index=r['index'],
                domain=r.get('domain', ''),
                agent_id=r.get('agent_id', ''),
                task_text=sub_tasks[r['index']].get('task', '') if r['index'] < len(sub_tasks) else '',
                status=r.get('status', ''),
                output=r.get('output', '')[:5000],
                error=r.get('error', ''),
                duration_ms=r.get('duration_ms', 0),
                token_usage=r.get('token_usage', {}),
                retry_count=r.get('retry_count', 0),
            )
        if result.structured_artifacts:
            _write_back_structured_artifacts(
                run=run,
                artifacts=result.structured_artifacts,
                context=context,
                account_id=account_id,
            )
    except Exception as e:
        logger.warning('[ORCH][%s] Failed to persist: %s', task_id, e)


def _write_back_structured_artifacts(
    run,
    artifacts: Dict[str, Any],
    context: Optional[Dict[str, Any]],
    account_id: int,
) -> None:
    """
    编排产出回写业务表：把 structured_artifacts 写入对应的业务模块。
    失败只记日志，不影响编排记录持久化。
    """
    ctx = context or {}
    protocol_id = ctx.get('protocol_id')
    project_name = ctx.get('project') or ctx.get('project_name') or ''
    client_name = ctx.get('client') or ctx.get('client_name') or ''

    if protocol_id and (artifacts.get('demand_summary') or artifacts.get('solution_draft')):
        try:
            from apps.protocol.services.protocol_service import set_parsed_data
            parsed = {}
            if artifacts.get('demand_summary'):
                parsed['demand_summary'] = artifacts['demand_summary']
            if artifacts.get('gap_list'):
                parsed['gap_list'] = artifacts['gap_list']
            if artifacts.get('solution_draft'):
                parsed['solution_draft'] = artifacts['solution_draft']
            set_parsed_data(int(protocol_id), parsed)
            logger.info('[ORCH][%s] Wrote structured_artifacts to protocol %s parsed_data', run.task_id, protocol_id)
        except Exception as exc:
            logger.warning('[ORCH][%s] Failed to write protocol parsed_data: %s', run.task_id, exc)

    quote_inputs = artifacts.get('quote_inputs')
    if quote_inputs and isinstance(quote_inputs, (list, dict)) and project_name:
        try:
            from decimal import Decimal
            from datetime import date
            from apps.finance.services import create_quote
            from apps.finance.services.quote_service import add_quote_item

            code = f'AQ-{run.task_id[-8:]}'
            quote = create_quote(
                code=code,
                project=project_name,
                client=client_name or '待确认',
                total_amount=Decimal('0'),
                created_at=date.today(),
                notes=f'由编排 {run.task_id} 自动生成',
            )
            total = Decimal('0')
            items_list = quote_inputs if isinstance(quote_inputs, list) else [quote_inputs]
            for idx, item in enumerate(items_list):
                if isinstance(item, str):
                    add_quote_item(
                        quote_id=quote.id,
                        item_name=item,
                        quantity=Decimal('1'),
                        unit_price=Decimal('0'),
                    )
                elif isinstance(item, dict):
                    qi = add_quote_item(
                        quote_id=quote.id,
                        item_name=item.get('name') or item.get('item_name') or f'项目 {idx + 1}',
                        quantity=Decimal(str(item.get('quantity', 1))),
                        unit_price=Decimal(str(item.get('unit_price', 0))),
                        specification=item.get('specification', ''),
                        unit=item.get('unit', '项'),
                    )
                    if qi:
                        total += qi.amount
            if total > 0:
                from apps.finance.models import Quote as QuoteModel
                QuoteModel.objects.filter(id=quote.id).update(total_amount=total)
            logger.info('[ORCH][%s] Created quote %s with %d items from structured_artifacts', run.task_id, code, len(items_list))
        except Exception as exc:
            logger.warning('[ORCH][%s] Failed to create quote from artifacts: %s', run.task_id, exc)


def _build_execution_phases(
    sub_tasks: List[Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """
    根据依赖关系构建拓扑执行阶段。
    每个阶段内的任务可并行执行。
    """
    task_map = {t['index']: t for t in sub_tasks}
    completed_indices: set = set()
    phases: List[List[Dict[str, Any]]] = []

    remaining = set(task_map.keys())
    max_iterations = len(sub_tasks) + 1

    for _ in range(max_iterations):
        if not remaining:
            break

        ready = []
        for idx in list(remaining):
            deps = set(task_map[idx].get('depends_on', []))
            if deps.issubset(completed_indices):
                ready.append(task_map[idx])

        if not ready:
            for idx in remaining:
                ready.append(task_map[idx])
            remaining.clear()
        else:
            for t in ready:
                remaining.discard(t['index'])

        phases.append(ready)
        completed_indices.update(t['index'] for t in ready)

    return phases


def trigger_orchestration_run(
    trigger_source: str,
    trigger_ref: str,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    自动编排触发入口（无人工介入）。

    由系统事件（如 CRM 商机阶段变更）调用，使用系统管理员账户执行编排。
    """
    from apps.identity.models import Account

    admin = Account.objects.filter(role='admin', is_active=True).first()
    account_id = admin.id if admin else 0

    ctx = dict(context or {})
    ctx['_trigger_source'] = trigger_source
    ctx['_trigger_ref'] = trigger_ref

    query = f'系统自动编排: {trigger_source} ({trigger_ref})'
    try:
        result = orchestrate(account_id=account_id, query=query, context=ctx)
        logger.info('trigger_orchestration_run OK: source=%s ref=%s status=%s', trigger_source, trigger_ref, result.status)
        return {'status': result.status, 'task_id': result.task_id}
    except Exception as exc:
        logger.warning('trigger_orchestration_run failed: source=%s ref=%s error=%s', trigger_source, trigger_ref, exc)
        return {'status': 'error', 'error': str(exc)}


def emergency_dispatch(
    account_id: int,
    event_type: str,
    source_module: str,
    severity: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    紧急事件编排：分析影响范围，生成跨台协调方案。

    对 CRITICAL 级别事件：
    1. 分析影响的工作台和项目
    2. 生成应对方案（排程调整、工单重分配、通知推送）
    3. 推送给管理层确认
    """
    from apps.agent_gateway.services import quick_chat
    from apps.secretary.alert_service import generate_all_alerts

    dispatch_prompt = (
        '分析紧急事件影响并输出JSON：'
        '{"impact_analysis":{"affected_workstations":[]},'
        '"actions":[{"type":"reschedule|reassign|notify","target":"","detail":"","priority":1}],'
        '"recommendation":"","escalation_needed":true}。仅JSON。'
    )

    alerts = []
    try:
        alerts = generate_all_alerts()[:20]
    except Exception:
        pass

    event_info = json.dumps({
        'event_type': event_type,
        'source_module': source_module,
        'severity': severity,
        'payload': payload,
        'current_alerts_count': len(alerts),
        'current_alerts_sample': alerts[:5],
    }, ensure_ascii=False, default=str)

    try:
        raw = quick_chat(
            message=f"紧急事件详情：\n{event_info}",
            system_prompt=dispatch_prompt,
            temperature=0.2,
            max_tokens=4096,
        )
        raw = raw.strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
            if raw.endswith('```'):
                raw = raw[:-3]
        plan = json.loads(raw)
    except Exception as e:
        logger.warning('Emergency dispatch LLM failed: %s', e)
        plan = {
            'impact_analysis': {'affected_workstations': [source_module]},
            'actions': [{'type': 'notify', 'target': 'admin', 'detail': f'{event_type}: {str(payload)[:200]}', 'priority': 1}],
            'recommendation': '请人工评估',
            'escalation_needed': True,
        }

    dispatched_claws: List[str] = []
    for action in plan.get('actions', []):
        action_type = action.get('type', '')
        if action_type == 'notify':
            dispatched_claws.append('feishu-notification-hub')
        elif action_type == 'reschedule':
            dispatched_claws.append('visit-scheduler')
        elif action_type == 'reassign':
            dispatched_claws.append('workorder-automation')
        elif action_type == 'alert':
            dispatched_claws.append('multi-domain-alert')

    dispatch_result = {
        'ok': True,
        'event_type': event_type,
        'severity': severity,
        'plan': plan,
        'dispatched_claws': list(set(dispatched_claws)),
        'requires_confirmation': plan.get('escalation_needed', True),
    }

    if plan.get('escalation_needed'):
        task_id = f"EMG-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        dispatch_result['task_id'] = task_id
        dispatch_result['review_url'] = f'/api/v1/orchestrate/emergency/{task_id}/review'
        try:
            from .models_orchestration import OrchestrationRun
            OrchestrationRun.objects.create(
                task_id=task_id,
                account_id=account_id,
                query=f'[EMERGENCY] {event_type}: {json.dumps(payload, ensure_ascii=False, default=str)[:500]}',
                context_json={'event_type': event_type, 'source_module': source_module, 'severity': severity},
                status='pending_review',
                aggregated_output=json.dumps(plan, ensure_ascii=False, default=str)[:10000],
                dispatched_claws=list(set(dispatched_claws)),
            )
        except Exception as e:
            logger.warning('Failed to persist emergency run: %s', e)

    return dispatch_result


def _daily_brief_fixed_subtasks(target_role: str, today_str: str) -> List[Dict[str, Any]]:
    """晨报/日报使用固定子任务列表，跳过 LLM 分解以节省 token。"""
    return [
        {'domain': 'report', 'task': f'为角色 {target_role} 汇总 {today_str} 全域运行指标与关键 KPI', 'priority': 1, 'depends_on': [], 'index': 0},
        {'domain': 'alert', 'task': f'为角色 {target_role} 梳理 {today_str} 风险与预警并排序', 'priority': 1, 'depends_on': [], 'index': 1},
    ]


def generate_daily_brief(
    account_id: int,
    target_role: str = 'all',
    focus_areas: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    生成角色化每日简报。

    聚合全域 KPI + 预警 → 固定子任务（跳过 LLM 分解）→ Agent 分析 → 聚合输出。
    """
    from apps.notification.api import claw_kpi_snapshot, claw_get_alerts

    class FakeRequest:
        pass

    kpi_response = claw_kpi_snapshot(FakeRequest())
    kpi_data = kpi_response.get('data', {}) if isinstance(kpi_response, dict) else {}

    alerts_response = claw_get_alerts(FakeRequest())
    alerts_data = alerts_response.get('data', {}) if isinstance(alerts_response, dict) else {}

    today_str = str(date.today())
    context = {
        'date': today_str,
        'target_role': target_role,
        'kpis': kpi_data.get('kpis', {}),
        'alerts_total': alerts_data.get('total', 0),
        'alerts_by_severity': alerts_data.get('by_severity', {}),
        'alerts_sample': alerts_data.get('alerts', [])[:10],
        '_fixed_subtasks': _daily_brief_fixed_subtasks(target_role, today_str),
    }

    if focus_areas:
        context['focus_areas'] = focus_areas

    result = orchestrate(
        account_id=account_id,
        query=f"请为角色 {target_role} 生成 {today_str} 的工作简报，"
              f"涵盖全域运行指标、风险排序、决策建议",
        context=context,
    )

    content = result.aggregated_output or ''
    brief = {
        'brief_id': f"BRIEF-{date.today().strftime('%Y%m%d')}-{target_role}",
        'orchestration_run_id': result.task_id,
        'target_role': target_role,
        'date': str(date.today()),
        'health_score': _compute_health_score(kpi_data.get('kpis', {}), alerts_data),
        'content': content,
        'summary': content,
        'sections': [{'title': '简报正文', 'content': content}] if content else [],
        'sub_task_count': len(result.sub_tasks),
        'duration_ms': result.duration_ms,
        'structured_artifacts': result.structured_artifacts,
        'kpi_snapshot': kpi_data.get('kpis', {}),
        'alerts_summary': {
            'total': alerts_data.get('total', 0),
            'by_severity': alerts_data.get('by_severity', {}),
        },
    }

    # 日报生成成功后写入经营分析员记忆，供 Agent 后续决策引用
    if content:
        try:
            from apps.secretary.memory_service import remember
            remember(
                worker_code='business_analyst',
                memory_type='episodic',
                content=content[:800],
                summary=f'{date.today()} 经营日报（角色:{target_role}，健康度:{brief["health_score"]}）',
                subject_type='daily_brief',
                subject_key=brief['brief_id'],
                importance_score=70,
            )
        except Exception as exc:
            logger.debug('generate_daily_brief memory write failed: %s', exc)

    return brief


def _compute_health_score(kpis: Dict, alerts_data: Dict) -> int:
    """根据 KPI 和预警计算系统健康度（0-100）"""
    score = 100

    sev = alerts_data.get('by_severity', {})
    score -= sev.get('urgent', 0) * 15
    score -= sev.get('high', 0) * 8
    score -= sev.get('normal', 0) * 2

    wo = kpis.get('workorder', {})
    if isinstance(wo, dict) and wo.get('overdue', 0) > 0:
        score -= min(wo['overdue'] * 5, 20)

    quality = kpis.get('quality', {})
    if isinstance(quality, dict):
        score -= min(quality.get('overdue_capas', 0) * 10, 20)

    return max(0, min(100, score))


# ============================================================================
# 编排断点恢复
# ============================================================================

def _save_checkpoint(run_id: str, completed_indices: List[int], phase_index: int, sub_task_outputs: Dict[str, str]) -> None:
    """保存编排执行断点，每个子任务完成后调用。"""
    try:
        from .models_orchestration import OrchestrationRun
        OrchestrationRun.objects.filter(task_id=run_id).update(
            checkpoint={
                'completed_indices': completed_indices,
                'phase_index': phase_index,
                'sub_task_outputs': sub_task_outputs,
            }
        )
    except Exception as exc:
        logger.warning('_save_checkpoint failed for %s: %s', run_id, exc)


def resume_orchestration(task_id: str, account_id: int) -> OrchestrationResult:
    """
    从断点恢复中断的编排。
    读取原始编排的 checkpoint，跳过已完成的子任务，只执行剩余任务。
    """
    from .models_orchestration import OrchestrationRun

    try:
        original = OrchestrationRun.objects.get(task_id=task_id)
    except OrchestrationRun.DoesNotExist:
        raise ValueError(f'编排记录不存在: {task_id}')

    if original.status == 'success':
        raise ValueError(f'编排 {task_id} 已成功完成，无需恢复')

    checkpoint = original.checkpoint or {}
    completed_indices = set(checkpoint.get('completed_indices', []))
    sub_task_outputs: Dict[str, str] = checkpoint.get('sub_task_outputs', {})

    # 重建已完成的结果上下文
    completed: Dict[int, str] = {int(k): v for k, v in sub_task_outputs.items()}

    # 重新分解任务（使用原始 query 和 context）
    query = original.query
    context = original.context_json or {}

    new_task_id = f"ORCH-RESUME-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
    result = OrchestrationResult(new_task_id)
    start = time.monotonic()

    sub_tasks = decompose_task(query, context)
    # 只执行未完成的子任务
    remaining_sub_tasks = [st for st in sub_tasks if st.get('index', 0) not in completed_indices]

    logger.info('[ORCH-RESUME][%s] resuming from %s, completed=%s, remaining=%d',
                new_task_id, task_id, completed_indices, len(remaining_sub_tasks))

    if not remaining_sub_tasks:
        # 所有子任务都已完成，直接用之前的输出聚合
        all_results = [{'index': int(k), 'output': v, 'status': 'success', 'domain': '', 'agent_id': ''} for k, v in sub_task_outputs.items()]
        result.aggregated_output = _aggregate_results(sub_tasks, all_results, query)
        result.status = 'success'
        result.duration_ms = 0
    else:
        all_results = [{'index': int(k), 'output': v, 'status': 'success', 'domain': '', 'agent_id': ''} for k, v in sub_task_outputs.items()]
        phases = _build_execution_phases(remaining_sub_tasks)
        new_completed_indices = list(completed_indices)

        for phase_index, phase in enumerate(phases):
            if len(phase) == 1:
                r = _execute_sub_task(phase[0], account_id, context, completed)
                all_results.append(r)
                completed[r['index']] = r.get('output', '')
                if r['status'] == 'failed':
                    result.errors.append(f"sub_task_{r['index']}: {r.get('error', 'unknown')}")
                else:
                    new_completed_indices.append(r['index'])
            else:
                with ThreadPoolExecutor(max_workers=min(len(phase), 4)) as pool:
                    futures = {pool.submit(_execute_sub_task, st, account_id, context, completed): st for st in phase}
                    for future in as_completed(futures):
                        r = future.result()
                        all_results.append(r)
                        completed[r['index']] = r.get('output', '')
                        if r['status'] == 'failed':
                            result.errors.append(f"sub_task_{r['index']}: {r.get('error', 'unknown')}")
                        else:
                            new_completed_indices.append(r['index'])

        result.aggregated_output = _aggregate_results(sub_tasks, all_results, query)
        result.status = 'success' if not result.errors else 'partial'
        result.duration_ms = int((time.monotonic() - start) * 1000)
        result.structured_artifacts = _build_structured_artifacts_for_chain1(sub_tasks, all_results, query, result.aggregated_output)

    result.sub_tasks = all_results

    # 持久化新的恢复编排，记录 resumed_from
    business_ctx = _extract_business_context(context)
    _persist_orchestration_run(
        new_task_id, account_id, query, context, result, sub_tasks, all_results,
        role_code=original.role_code,
        domain_code=original.domain_code,
        workstation_key=business_ctx.get('workstation_key', original.workstation_key),
        business_object_type=business_ctx.get('business_object_type', original.business_object_type),
        business_object_id=business_ctx.get('business_object_id', original.business_object_id),
        gate_run_id=original.gate_run_id,
        resumed_from=task_id,
    )

    return result
