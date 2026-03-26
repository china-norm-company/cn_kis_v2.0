from __future__ import annotations

import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

import yaml
from django.conf import settings

_LIFECYCLE_KEYWORDS = {
    'protocol': ['protocol', '方案', '协议', 'study design', 'spirit', 'ich e6', 'ich e8'],
    'recruitment': ['recruit', '招募', 'screening', '入组'],
    'reception': ['consent', '接待', '签到', 'informed consent'],
    'sample': ['sample', 'specimen', '样品', 'biosafety'],
    'testing': ['test', 'laboratory', 'assay', '检测', '分析方法'],
    'quality': ['quality', 'capa', 'deviation', 'gcp', '审计'],
    'ethics': ['ethic', '伦理', 'helsinki', 'cioms'],
    'report': ['report', 'consort', 'csr', 'e3', '统计报告'],
    'review': ['review', 'inspection', '监管', 'best practice'],
    'knowledge': ['knowledge', '标准', 'guidance', '指导原则'],
}

_ROLE_KEYWORDS = {
    'solution_designer': ['protocol', '方案', 'study design', 'spirit'],
    'recruitment_screener': ['recruit', '招募', 'screening'],
    'reception_assistant': ['consent', '接待', '签到'],
    'quality_guardian': ['quality', 'capa', 'deviation', 'gcp'],
    'compliance_reviewer': ['inspection', '监管', 'compliance', 'gcp'],
    'ethics_liaison': ['ethic', '伦理', 'helsinki', 'cioms'],
    'report_generator': ['report', 'consort', 'csr', 'e3'],
    'knowledge_curator': ['knowledge', 'guidance', '标准', 'best practice'],
}


def load_watchtower_config() -> Dict[str, Any]:
    path = Path(settings.BASE_DIR) / 'configs' / 'evergreen_watchtower.yaml'

    if not path.exists():
        return {'sources': []}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {'sources': []}


def _fetch_headline(url: str) -> Dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            content = resp.read(1200).decode('utf-8', errors='ignore')
        headline = content[:200].replace('\n', ' ').strip()
        return {'status': 'ok', 'headline': headline}
    except urllib.error.URLError as exc:
        return {'status': 'offline', 'headline': str(exc)}
    except Exception as exc:
        return {'status': 'error', 'headline': str(exc)}


def _normalize_tags(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    out = []
    for value in values:
        item = str(value or '').strip()
        if item and item not in out:
            out.append(item)
    return out


def _infer_tags_from_text(text: str, mapping: Dict[str, List[str]]) -> List[str]:
    haystack = (text or '').lower()
    hits = []
    for tag, keywords in mapping.items():
        if any(keyword.lower() in haystack for keyword in keywords):
            hits.append(tag)
    return hits


def _build_structured_findings(source: Dict[str, Any], probe: Dict[str, Any]) -> Dict[str, Any]:
    headline = str(probe.get('headline') or '')[:500]
    combined = ' '.join(
        [
            str(source.get('source_name') or ''),
            str(source.get('watch_type') or ''),
            headline,
            ' '.join(_normalize_tags(source.get('knowledge_tags'))),
        ]
    )
    lifecycle_stages = _normalize_tags(source.get('lifecycle_stages')) or _infer_tags_from_text(combined, _LIFECYCLE_KEYWORDS)
    role_codes = _normalize_tags(source.get('role_codes')) or _infer_tags_from_text(combined, _ROLE_KEYWORDS)
    knowledge_tags = _normalize_tags(source.get('knowledge_tags'))
    if not knowledge_tags:
        knowledge_tags = lifecycle_stages[:]
    return {
        'headline': headline,
        'status': probe.get('status', ''),
        'lifecycle_stages': lifecycle_stages,
        'role_codes': role_codes,
        'knowledge_tags': knowledge_tags,
        'priority': str(source.get('priority') or 'medium'),
        'notes': str(source.get('notes') or '')[:300],
        'recommended_action': 'sandbox_evaluate' if probe.get('status') == 'ok' else 'retry_later',
    }


def scan_watchtower_sources() -> List[Dict[str, Any]]:
    rows = []
    for source in load_watchtower_config().get('sources', []):
        probe = _fetch_headline(source.get('source_url', '')) if source.get('source_url') else {'status': 'missing', 'headline': ''}
        findings = _build_structured_findings(source, probe)
        rows.append(
            {
                'watch_type': source.get('watch_type', 'practice'),
                'source_name': source.get('source_name', ''),
                'source_url': source.get('source_url', ''),
                'status': probe['status'],
                'headline': probe['headline'],
                'findings': findings,
                'candidates': _derive_candidates(source, probe, findings),
            }
        )
    return rows


def _derive_candidates(source: Dict[str, Any], probe: Dict[str, Any], findings: Dict[str, Any]) -> List[Dict[str, Any]]:
    url = source.get('source_url', '')
    source_name = source.get('source_name', '')
    if probe['status'] != 'ok':
        return [{
            'action': 'retry_later',
            'reason': probe['headline'][:120],
            'lifecycle_stages': findings.get('lifecycle_stages', []),
            'role_codes': findings.get('role_codes', []),
        }]
    return [
        {
            'action': 'sandbox_evaluate',
            'target': source_name,
            'source_url': url,
            'reason': '定期纳入沙箱评测和能力兼容表',
            'lifecycle_stages': findings.get('lifecycle_stages', []),
            'role_codes': findings.get('role_codes', []),
            'knowledge_tags': findings.get('knowledge_tags', []),
            'priority': findings.get('priority', 'medium'),
        }
    ]


def persist_watchtower_scan(rows: List[Dict[str, Any]]) -> List[int]:
    from .models_governance import EvergreenWatchReport

    ids = []
    for row in rows:
        report = EvergreenWatchReport.objects.create(
            watch_type=row['watch_type'],
            source_name=row['source_name'],
            source_url=row['source_url'],
            status=row['status'],
            headline=row['headline'][:255],
            findings=row.get('findings') or {'headline': row['headline']},
            candidates=row['candidates'],
        )
        ids.append(report.id)
    return ids


def build_watchtower_summary() -> Dict[str, Any]:
    rows = scan_watchtower_sources()
    lifecycle_coverage: Dict[str, int] = {}
    role_coverage: Dict[str, int] = {}
    for row in rows:
        findings = row.get('findings') or {}
        for stage in findings.get('lifecycle_stages') or []:
            lifecycle_coverage[stage] = lifecycle_coverage.get(stage, 0) + 1
        for role_code in findings.get('role_codes') or []:
            role_coverage[role_code] = role_coverage.get(role_code, 0) + 1
    return {
        'sources': rows,
        'ok_count': sum(1 for row in rows if row['status'] == 'ok'),
        'issue_count': sum(1 for row in rows if row['status'] != 'ok'),
        'coverage': {
            'lifecycle_stages': lifecycle_coverage,
            'role_codes': role_coverage,
        },
    }


# 生命周期环节 → TopicPackage facet 映射
_LIFECYCLE_TO_FACET: Dict[str, str] = {
    'protocol':     'study_design',
    'recruitment':  'sop_risks',
    'reception':    'core_concepts',
    'sample':       'sop_risks',
    'testing':      'instrument_methods',
    'quality':      'sop_risks',
    'ethics':       'regulation_boundary',
    'report':       'reporting_templates',
    'review':       'regulation_boundary',
    'knowledge':    'core_concepts',
}

# 岗位 role_code → 数字员工专题包 package_id 映射
_ROLE_TO_PACKAGE_ID: Dict[str, str] = {
    'solution_designer':     'pkg_dw_protocol_design',
    'recruitment_screener':  'pkg_dw_recruitment',
    'reception_assistant':   'pkg_dw_reception',
    'quality_guardian':      'pkg_dw_quality',
    'compliance_reviewer':   'pkg_dw_compliance',
    'ethics_liaison':        'pkg_dw_ethics',
    'report_generator':      'pkg_dw_reporting',
    'knowledge_curator':     'pkg_dw_knowledge',
    'scheduling_optimizer':  'pkg_dw_scheduling',
    'workorder_matcher':     'pkg_dw_workorder',
    'startup_gate_assistant':'pkg_dw_startup_gate',
    'project_docs_coordinator': 'pkg_dw_project_docs',
}

# 每个数字员工专题包的定义：package_id, canonical_topic, facets 模板
_DW_TOPIC_PACKAGES = [
    {
        'package_id':       'pkg_dw_protocol_design',
        'canonical_topic':  '临床研究方案设计与协议解析',
        'description':      '涵盖临床试验方案设计原则、SPIRIT 声明、ICH E6 GCP、协议审查要点与方案模板',
        'facets':           ['study_design', 'regulation_boundary', 'core_concepts', 'sop_risks', 'key_metrics'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_recruitment',
        'canonical_topic':  '受试者招募与初筛方法学',
        'description':      '涵盖入组/排除标准判断、招募渠道管理、知情同意、筛选记录最佳实践',
        'facets':           ['sop_risks', 'core_concepts', 'regulation_boundary', 'reporting_templates'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_reception',
        'canonical_topic':  '受试者接待与知情同意规范',
        'description':      '涵盖 Helsinki 宣言、CIOMS 指南、知情同意流程、现场接待标准',
        'facets':           ['regulation_boundary', 'core_concepts', 'sop_risks'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_quality',
        'canonical_topic':  '质量管理与偏差 CAPA',
        'description':      '涵盖 ICH Q10、GCP 质量体系、偏差分类与 CAPA 闭环方法学',
        'facets':           ['regulation_boundary', 'sop_risks', 'core_concepts', 'key_metrics', 'reporting_templates'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_compliance',
        'canonical_topic':  '合规审查与高风险动作治理',
        'description':      '涵盖监管检查要点、法规边界、高风险动作分级与拦截规则',
        'facets':           ['regulation_boundary', 'core_concepts', 'sop_risks'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_ethics',
        'canonical_topic':  '伦理审查与受试者权益保护',
        'description':      '涵盖伦理委员会要求、Helsinki 宣言、CIOMS 伦理指南、伦理提交材料规范',
        'facets':           ['regulation_boundary', 'core_concepts', 'sop_risks', 'reporting_templates'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_reporting',
        'canonical_topic':  '临床研究报告与数据交付',
        'description':      '涵盖 ICH E3 CSR 结构、CONSORT 报告指南、数据核查与交付清单',
        'facets':           ['reporting_templates', 'regulation_boundary', 'core_concepts', 'key_metrics'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_knowledge',
        'canonical_topic':  '数字员工知识基线与最佳实践',
        'description':      '涵盖 Agent 设计、Guardrails、编排最佳实践、技能注册与治理规范',
        'facets':           ['core_concepts', 'sop_risks', 'regulation_boundary'],
        'source_authority_level': 'tier2',
        'required_for_release': False,
    },
    {
        'package_id':       'pkg_dw_scheduling',
        'canonical_topic':  '临床排程与资源优化',
        'description':      '涵盖访视排程约束、资源冲突识别、排程草案生成方法学',
        'facets':           ['core_concepts', 'sop_risks', 'key_metrics'],
        'source_authority_level': 'tier2',
        'required_for_release': False,
    },
    {
        'package_id':       'pkg_dw_workorder',
        'canonical_topic':  '工单匹配与派单规则',
        'description':      '涵盖工单分类、执行人资质匹配、超时预警规则',
        'facets':           ['core_concepts', 'sop_risks'],
        'source_authority_level': 'tier3',
        'required_for_release': False,
    },
    {
        'package_id':       'pkg_dw_startup_gate',
        'canonical_topic':  '项目启动门禁与人机料法环核验',
        'description':      '涵盖启动前核验要素（人员资质、设备状态、物料、SOP、环境条件）',
        'facets':           ['regulation_boundary', 'sop_risks', 'core_concepts'],
        'source_authority_level': 'tier1',
        'required_for_release': True,
    },
    {
        'package_id':       'pkg_dw_project_docs',
        'canonical_topic':  '项目资料统筹与版本治理',
        'description':      '涵盖启动包组装、版本一致性检查、资料角色化分发规则',
        'facets':           ['sop_risks', 'core_concepts', 'reporting_templates'],
        'source_authority_level': 'tier2',
        'required_for_release': False,
    },
]


def ensure_dw_topic_packages() -> Dict[str, Any]:
    """确保数字员工知识基线专题包存在（幂等）。返回 {package_id: TopicPackage}。"""
    from apps.knowledge.models import TopicPackage

    package_map: Dict[str, Any] = {}
    for defn in _DW_TOPIC_PACKAGES:
        pkg_id = defn['package_id']
        facet_template = {f: {'count': 0, 'entry_ids': []} for f in defn.get('facets', [])}
        pkg, _ = TopicPackage.objects.get_or_create(
            package_id=pkg_id,
            defaults={
                'canonical_topic': defn['canonical_topic'],
                'description': defn['description'],
                'facets': facet_template,
                'source_authority_level': defn.get('source_authority_level', 'mixed'),
                'required_for_release': defn.get('required_for_release', False),
                'status': 'building',
            },
        )
        package_map[pkg_id] = pkg
    return package_map


def link_entry_to_dw_packages(entry_id: int, role_codes: List[str], lifecycle_stages: List[str]) -> List[str]:
    """
    将知识条目关联到对应数字员工专题包并更新 facet 覆盖计数。
    返回成功挂载的 package_id 列表。
    """
    from apps.knowledge.models import KnowledgeEntry

    entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if not entry:
        return []

    pkg_map = ensure_dw_topic_packages()
    linked_packages: List[str] = []

    for role_code in role_codes:
        pkg_id = _ROLE_TO_PACKAGE_ID.get(role_code)
        if not pkg_id or pkg_id not in pkg_map:
            continue
        pkg = pkg_map[pkg_id]

        # 推断最佳 facet
        best_facet = ''
        for stage in lifecycle_stages:
            candidate = _LIFECYCLE_TO_FACET.get(stage)
            if candidate:
                pkg_facets = pkg.facets or {}
                if candidate in pkg_facets:
                    best_facet = candidate
                    break
        if not best_facet:
            pkg_facets_keys = list((pkg.facets or {}).keys())
            best_facet = pkg_facets_keys[0] if pkg_facets_keys else 'core_concepts'

        # 更新 TopicPackage.facets 覆盖计数
        facets = dict(pkg.facets or {})
        if best_facet not in facets:
            facets[best_facet] = {'count': 0, 'entry_ids': []}
        bucket = dict(facets[best_facet])
        if entry_id not in bucket.get('entry_ids', []):
            bucket['entry_ids'] = list(bucket.get('entry_ids', [])) + [entry_id]
            bucket['count'] = len(bucket['entry_ids'])
            facets[best_facet] = bucket
        pkg.facets = facets
        pkg.save(update_fields=['facets', 'update_time'])

        # 更新条目的 topic_package / facet 字段（只在未挂时写，已挂则保留原来的）
        if not entry.topic_package_id:
            entry.topic_package = pkg
            entry.facet = best_facet
            entry.save(update_fields=['topic_package', 'facet', 'update_time'])

        if pkg_id not in linked_packages:
            linked_packages.append(pkg_id)

    return linked_packages


def deposit_watch_report_to_knowledge(report_id: int, created_by_id: int | None = None) -> Dict[str, Any]:
    from apps.knowledge import services as knowledge_services
    from apps.knowledge.models import EntryStatus, EntryType, KnowledgeEntry, OntologyNamespace
    from .models_governance import EvergreenWatchReport

    report = EvergreenWatchReport.objects.filter(id=report_id).first()
    if not report:
        return {'ok': False, 'message': '哨塔报告不存在'}

    findings = report.findings or {}
    candidates = report.candidates or []
    title = f'[{report.get_watch_type_display()}] {report.source_name}'
    summary = findings.get('headline') or report.headline or title
    tags = [
        f'watch:{report.watch_type}',
        *list(findings.get('knowledge_tags') or []),
        *[f'life:{item}' for item in (findings.get('lifecycle_stages') or [])],
        *[f'role:{item}' for item in (findings.get('role_codes') or [])],
    ]
    entry_type_map = {
        'industry': EntryType.REGULATION,
        'practice': EntryType.METHOD_REFERENCE,
        'model': EntryType.METHOD_REFERENCE,
        'claw': EntryType.METHOD_REFERENCE,
    }
    content_lines = [
        f'来源名称：{report.source_name}',
        f'来源链接：{report.source_url or "-"}',
        f'扫描状态：{report.status}',
        f'摘要：{summary}',
        '',
        '结构化发现：',
        f'- 生命周期环节：{", ".join(findings.get("lifecycle_stages") or []) or "-"}',
        f'- 关联岗位：{", ".join(findings.get("role_codes") or []) or "-"}',
        f'- 知识标签：{", ".join(findings.get("knowledge_tags") or []) or "-"}',
        f'- 优先级：{findings.get("priority") or "-"}',
        f'- 推荐动作：{findings.get("recommended_action") or "-"}',
        '',
        '候选动作：',
    ]
    if candidates:
        for idx, row in enumerate(candidates, start=1):
            content_lines.append(
                f'{idx}. {row.get("action", "-")} | {row.get("reason", "-")} | '
                f'环节={",".join(row.get("lifecycle_stages") or []) or "-"} | '
                f'岗位={",".join(row.get("role_codes") or []) or "-"}'
            )
    else:
        content_lines.append('1. 暂无候选动作')
    entry = knowledge_services.create_entry(
        entry_type=entry_type_map.get(report.watch_type, EntryType.METHOD_REFERENCE),
        title=title,
        content='\n'.join(content_lines),
        summary=summary,
        tags=tags,
        source_type='evergreen_watch',
        source_id=report.id,
        source_key=f'{report.watch_type}:{report.id}',
        created_by_id=created_by_id,
    )

    priority = str(findings.get('priority') or 'medium').lower()
    watch_type = report.watch_type or ''
    authority_bonus = 15 if watch_type == 'industry' else 5 if watch_type == 'practice' else 0
    priority_bonus = 20 if priority == 'high' else 10 if priority == 'medium' else 0
    role_codes = list(findings.get('role_codes') or [])
    lifecycle_stages = list(findings.get('lifecycle_stages') or [])
    lifecycle_bonus = min(len(lifecycle_stages) * 5, 20)
    role_bonus = min(len(role_codes) * 5, 15)
    quality_score = min(95, 40 + authority_bonus + priority_bonus + lifecycle_bonus + role_bonus)

    KnowledgeEntry.objects.filter(id=entry.id).update(
        status=EntryStatus.PENDING_REVIEW,
        is_published=False,
        namespace=OntologyNamespace.CUSTOM,
        uri=f'cnkis:watchtower/{report.watch_type}/{report.id}',
        quality_score=quality_score,
    )

    linked_packages: List[str] = []
    try:
        linked_packages = link_entry_to_dw_packages(
            entry_id=entry.id,
            role_codes=role_codes,
            lifecycle_stages=lifecycle_stages,
        )
    except Exception as exc:
        import logging as _logging
        _logging.getLogger(__name__).warning(
            'link_entry_to_dw_packages failed for entry=%s: %s', entry.id, exc
        )

    findings = dict(findings)
    findings['knowledge_entry_id'] = entry.id
    findings['linked_packages'] = linked_packages
    report.findings = findings
    report.save(update_fields=['findings'])
    return {
        'ok': True,
        'message': '哨塔报告已沉淀为知识条目',
        'report_id': report.id,
        'knowledge_entry_id': entry.id,
        'linked_packages': linked_packages,
    }
