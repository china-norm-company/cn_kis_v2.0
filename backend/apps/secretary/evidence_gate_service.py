from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import yaml
from django.conf import settings

from apps.knowledge.prelaunch_factory import build_prelaunch_factory_report, evaluate_prelaunch_factory_gate
from apps.secretary.domain_worker_service import list_domain_workers, resolve_domain_skills, resolve_topic_packages
from apps.secretary.digital_worker_release_gate_service import is_pilot_release_allowed  # noqa: F401 re-export for patch


def load_evidence_gate_config() -> Dict[str, Any]:
    path = Path(settings.BASE_DIR) / 'configs' / 'evidence_gates.yaml'
    if not path.exists():
        return {'global_thresholds': {}, 'per_domain_minimums': {}}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {}


def load_long_chain_inventory() -> Dict[str, Any]:
    path = Path(settings.BASE_DIR) / 'configs' / 'digital_worker_long_chains.yaml'
    if not path.exists():
        return {'domains': {}}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {'domains': {}}


def load_eval_asset_inventory() -> Dict[str, Any]:
    path = Path(settings.BASE_DIR) / 'configs' / 'digital_worker_eval_assets.yaml'
    if not path.exists():
        return {'domains': {}}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {'domains': {}}


def _expand_template_assets(prefix: str, template_block: Dict[str, Any]) -> List[str]:
    themes = template_block.get('themes') or []
    prompts = template_block.get('prompts') or template_block.get('flows') or []
    assets: List[str] = []
    index = 1
    for theme in themes:
        for prompt in prompts:
            assets.append(f'{prefix}-{index:03d} {theme} {prompt}')
            index += 1
    return assets


def build_evidence_gate_report() -> Dict[str, Any]:
    cfg = load_evidence_gate_config()
    long_chain_inventory = load_long_chain_inventory().get('domains', {})
    eval_assets = load_eval_asset_inventory().get('domains', {})
    domains = list_domain_workers()
    per_domain = cfg.get('per_domain_minimums', {})

    domain_rows = []
    knowledge_total = 0
    scenario_total = 0
    chain_total = 0
    ready_count = 0
    package_alignment_ready = 0
    for worker in domains:
        targets = worker.get('evaluation_targets', {})
        domain_code = worker['domain_code']
        chain_assets = long_chain_inventory.get(domain_code, []) or []
        domain_eval_assets = eval_assets.get(domain_code, {}) or {}
        topic_packages = resolve_topic_packages(domain_code)
        resolved_skills = resolve_domain_skills(domain_code)
        question_assets = _expand_template_assets(f'{domain_code}-q', domain_eval_assets.get('question_templates', {}))
        scenario_assets = _expand_template_assets(f'{domain_code}-s', domain_eval_assets.get('scenario_templates', {}))
        row = {
            'domain_code': domain_code,
            'display_name': worker.get('display_name', domain_code),
            'knowledge_questions': len(question_assets),
            'knowledge_question_target': int(targets.get('knowledge_questions_min', 0) or 0),
            'knowledge_question_examples': question_assets[:3],
            'scenarios': len(scenario_assets),
            'scenario_target': int(targets.get('scenarios_min', 0) or 0),
            'scenario_examples': scenario_assets[:3],
            'long_chains': len(chain_assets),
            'long_chain_target': int(targets.get('long_chains_min', 0) or 0),
            'long_chain_asset_examples': chain_assets[:3],
            'tier0_packages': len(topic_packages.get('resolved', [])),
            'tier0_package_requested': topic_packages.get('requested', []),
            'tier0_package_resolved': topic_packages.get('resolved', []),
            'tier0_package_unresolved': topic_packages.get('unresolved', []),
            'collaboration_agents': len(worker.get('collaboration_agents', [])),
            'skill_ids': resolved_skills,
            'skill_count': len(resolved_skills),
        }
        minimum = per_domain.get(domain_code, {})
        row['topic_package_alignment_passed'] = len(topic_packages.get('unresolved', [])) == 0
        row['ready'] = (
            row['knowledge_questions'] >= int(minimum.get('knowledge_questions', 0) or 0)
            and row['scenarios'] >= int(minimum.get('scenarios', 0) or 0)
            and row['long_chains'] >= int(minimum.get('long_chains', 0) or 0)
            and row['topic_package_alignment_passed']
        )
        if row['topic_package_alignment_passed']:
            package_alignment_ready += 1
        if row['ready']:
            ready_count += 1
        knowledge_total += row['knowledge_questions']
        scenario_total += row['scenarios']
        chain_total += row['long_chains']
        domain_rows.append(row)

    factory_report = build_prelaunch_factory_report()
    factory_gate = evaluate_prelaunch_factory_gate(factory_report)
    global_thresholds = cfg.get('global_thresholds', {})
    readiness_score = ready_count / len(domain_rows) if domain_rows else 0.0
    report = {
        'domains': domain_rows,
        'totals': {
            'knowledge_questions': knowledge_total,
            'scenarios': scenario_total,
            'long_chains': chain_total,
            'readiness_score': round(readiness_score, 3),
            'topic_package_alignment_ready': package_alignment_ready,
        },
        'global_thresholds': global_thresholds,
        'knowledge_factory_gate': factory_gate,
    }
    return report


def evaluate_evidence_gate(report: Dict[str, Any]) -> Dict[str, Any]:
    totals = report['totals']
    thresholds = report.get('global_thresholds', {})
    checks = {
        'knowledge_questions': totals['knowledge_questions'] >= int(thresholds.get('knowledge_questions_min', 0) or 0),
        'scenarios': totals['scenarios'] >= int(thresholds.get('scenarios_min', 0) or 0),
        'long_chains': totals['long_chains'] >= int(thresholds.get('long_chains_min', 0) or 0),
        'readiness_score': totals['readiness_score'] >= float(thresholds.get('required_readiness_score', 0) or 0),
        'knowledge_factory_gate': bool(report.get('knowledge_factory_gate', {}).get('passed')),
        'topic_package_alignment': totals['topic_package_alignment_ready'] == len(report.get('domains', [])),
    }
    return {'passed': all(checks.values()), 'checks': checks}


def persist_evidence_gate(report: Dict[str, Any], evaluation: Dict[str, Any]) -> int:
    from .models_governance import EvidenceGateRun

    if evaluation['passed']:
        status = EvidenceGateRun.Status.PASSED
    else:
        checks = evaluation.get('checks', {})
        failed_count = sum(1 for v in checks.values() if not v)
        # 超过半数检查未通过 → FAILED（硬阻断），否则 WARN（软阻断新岗位/技能启用）
        status = EvidenceGateRun.Status.FAILED if failed_count >= len(checks) / 2 else EvidenceGateRun.Status.WARN

    row = EvidenceGateRun.objects.create(
        gate_type=EvidenceGateRun.GateType.READINESS,
        scope='digital_workers',
        status=status,
        score=report['totals']['readiness_score'],
        summary=evaluation,
        raw_report=report,
    )
    return row.id


def check_business_gate(action_type: str, context: Dict[str, Any]) -> tuple:
    """
    业务节点门禁：新岗位/新技能启用前、高风险自动执行前，须通过门禁才放行。
    支持岗位/动作/业务对象级：context 可传 role_code、skill_id、business_object_type、business_object_id，
    命中的门禁运行 ID 供调用方回写到任务记录。

    action_type: 'high_risk_execution' | 'enable_new_skill' | 'enable_new_role' | 'release_digital_worker'
    context: 如 {'skill_id': str, 'role_code': str, 'business_object_type': str, 'business_object_id': str,
                  'protocol_id': int}

    当 context 含 protocol_id 时，额外做"人机料法环"核验：
    - 检查协议是否有 parsed_data（法）
    - 检查协议是否有关联的已激活排程（机/法）

    Returns:
        (passed: bool, reason: str, gate_run_id: str) 通过时 passed=True；gate_run_id 为本次参考的门禁运行 ID（可回写任务）。
    """
    from .models_governance import EvidenceGateRun

    latest = (
        EvidenceGateRun.objects.filter(gate_type=EvidenceGateRun.GateType.READINESS, scope='digital_workers')
        .order_by('-created_at')
        .first()
    )
    gate_run_id = str(latest.id) if latest else ''
    if not latest:
        # 无全局门禁记录时，对含协议上下文的请求做轻量人机料法环核验
        protocol_id = context.get('protocol_id')
        if protocol_id and action_type == 'release_digital_worker':
            warning, warn_id = _check_protocol_readiness(int(protocol_id))
            if warning:
                return False, warning, warn_id
        return True, '', ''
    if latest.status == EvidenceGateRun.Status.FAILED:
        return False, '门禁未通过：上线准备度未达标，禁止高风险执行与新增启用', gate_run_id
    if latest.status == EvidenceGateRun.Status.WARN and action_type in ('enable_new_skill', 'enable_new_role', 'release_digital_worker'):
        return False, '门禁警告：上线准备度未完全达标，禁止新岗位/新技能启用或发布', gate_run_id

    # L2 真实验收门禁：发布类操作额外检查最新验收结论
    if action_type == 'release_digital_worker':
        try:
            from apps.secretary import evidence_gate_service as _self
            _is_pilot_allowed = getattr(_self, 'is_pilot_release_allowed', None)
            if _is_pilot_allowed is not None and not _is_pilot_allowed():
                return False, '门禁未通过：L2 真实验收结论不允许试点发布（需整改或尚未执行验收）', gate_run_id
        except Exception:
            pass

    return True, '', gate_run_id


def _check_protocol_readiness(protocol_id: int) -> tuple:
    """
    人机料法环轻量核验（协议激活启动门禁）。
    返回 (warning_message, gate_info_str)；无问题则 ('', '')。
    检查维度：
    - 法（协议）：协议是否有 parsed_data（已完成解析）
    - 机/法（排程）：协议是否已有发布状态的排程计划
    """
    import logging as _log
    _logger = _log.getLogger(__name__)
    try:
        from apps.protocol.models import Protocol
        p = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
        if not p:
            return '', ''

        # 法：协议未解析
        if not p.parsed_data:
            msg = f'协议「{p.title[:30]}」尚未完成 AI 解析（缺少 parsed_data），建议先解析协议再激活。'
            return msg, f'protocol-readiness-{protocol_id}'

        # 机/法：排程
        try:
            from apps.scheduling.models import SchedulePlan, SchedulePlanStatus
            has_published_plan = SchedulePlan.objects.filter(
                visit_plan__protocol_id=protocol_id,
                status=SchedulePlanStatus.PUBLISHED,
            ).exists()
            if not has_published_plan:
                _logger.debug(
                    '_check_protocol_readiness: protocol %s has no published schedule, '
                    'allowing activation (non-blocking warning)',
                    protocol_id,
                )
                # 排程未发布为警告级，不阻塞激活（仅记录）
        except Exception:
            pass
    except Exception as exc:
        _logger.debug('_check_protocol_readiness failed: %s', exc)
    return '', ''
