"""
外部数据接入候选生成服务

CandidatePopulator：从各原始层批量生成 ExternalDataIngestCandidate 候选记录。
IngestService：将已批准的候选记录写入目标工作台的领域模型。

设计原则：
- 原始层只读，不做任何修改
- 候选记录幂等生成（同一 source_type+source_raw_id 不重复创建）
- 接入失败时记录 ingestion_log，不抛出异常（业务决策，不是程序错误）
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# 工具函数
# ══════════════════════════════════════════════════════════════════════════════

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _truncate(value, max_len: int = 300) -> str:
    s = str(value) if value is not None else ''
    return s[:max_len]


# ══════════════════════════════════════════════════════════════════════════════
# CandidatePopulator
# ══════════════════════════════════════════════════════════════════════════════

class CandidatePopulator:
    """
    从原始层批量生成候选记录。

    用法：
        populator = CandidatePopulator()
        result = populator.populate_from_lims(limit=200)
        result = populator.populate_from_ekb(limit=200)
        result = populator.populate_from_feishu(limit=200)
    """

    def populate_from_lims(self, limit: int = 200, module_filter: str = '') -> dict:
        """
        从 t_raw_lims_record 生成候选记录。
        仅处理 injection_status='pending' 的原始记录（尚未被注入流程处理的）。
        """
        from apps.lims_integration.models import RawLimsRecord
        from apps.lims_integration.p0_mapping import extract_mapped_fields
        from .models import ExternalDataIngestCandidate, SourceType, ReviewStatus
        from .routing import route_source, get_target_model

        qs = RawLimsRecord.objects.filter(injection_status='pending')
        if module_filter:
            qs = qs.filter(module=module_filter)

        # 排除已有候选记录的
        existing_ids = set(
            ExternalDataIngestCandidate.objects.filter(source_type=SourceType.LIMS)
            .values_list('source_raw_id', flat=True)
        )

        created = 0
        skipped = 0
        errors = 0

        for raw in qs.order_by('create_time')[:limit]:
            if raw.id in existing_ids:
                skipped += 1
                continue
            try:
                module = raw.module or ''
                raw_data = raw.raw_data or {}

                # 复用 p0_mapping 的字段提取（返回 {field: value} 字典）
                try:
                    mapped = extract_mapped_fields(module, raw_data)
                except Exception:
                    mapped = {}

                # 包装成带置信度的结构
                mapped_fields = {
                    k: {'value': v, 'confidence': 0.7, 'source_field': k}
                    for k, v in mapped.items()
                    if v not in (None, '', [], {})
                }
                confidence = _calc_confidence(mapped_fields)

                target_ws = route_source(SourceType.LIMS, module)
                target_model = get_target_model(SourceType.LIMS, module)

                title_field = (
                    raw_data.get('name') or raw_data.get('code') or
                    raw_data.get('编号') or raw_data.get('名称') or
                    f'LIMS/{module}/{raw.lims_id}'
                )

                ExternalDataIngestCandidate.objects.create(
                    source_type=SourceType.LIMS,
                    source_raw_id=raw.id,
                    source_module=module,
                    source_snapshot=raw_data,
                    source_display_title=_truncate(f'LIMS·{module}：{title_field}'),
                    target_workstation=target_ws,
                    target_model=target_model,
                    mapped_fields=mapped_fields,
                    confidence_score=confidence,
                    review_status=ReviewStatus.PENDING,
                    populated_by='CandidatePopulator.populate_from_lims',
                )
                created += 1
            except Exception as exc:
                logger.error('populate_from_lims error raw_id=%s: %s', raw.id, exc)
                errors += 1

        return {'created': created, 'skipped': skipped, 'errors': errors}

    def populate_from_ekb(self, limit: int = 200, module_filter: str = '') -> dict:
        """
        从 t_ekb_raw_record 生成候选记录。
        """
        from .models import ExternalDataIngestCandidate, SourceType, ReviewStatus
        from .routing import route_source, get_target_model

        try:
            from apps.ekuaibao_integration.models import EkbRawRecord
        except ImportError:
            return {'created': 0, 'skipped': 0, 'errors': 0, 'note': 'EkbRawRecord not available'}

        qs = EkbRawRecord.objects.all()
        if module_filter:
            qs = qs.filter(module=module_filter)

        existing_ids = set(
            ExternalDataIngestCandidate.objects.filter(source_type=SourceType.EKUAIBAO)
            .values_list('source_raw_id', flat=True)
        )

        created = 0
        skipped = 0
        errors = 0

        for raw in qs.order_by('id')[:limit]:
            if raw.id in existing_ids:
                skipped += 1
                continue
            try:
                module = getattr(raw, 'module', '') or ''
                raw_data = getattr(raw, 'raw_data', None) or {}
                if not isinstance(raw_data, dict):
                    raw_data = {'data': str(raw_data)}

                mapped_fields = _simple_map_ekb(raw_data, module)
                confidence = _calc_confidence(mapped_fields)

                target_ws = route_source(SourceType.EKUAIBAO, module)
                target_model = get_target_model(SourceType.EKUAIBAO, module)

                title = (
                    raw_data.get('title') or raw_data.get('name') or
                    raw_data.get('form_code') or f'EKB/{module}/{raw.id}'
                )

                ExternalDataIngestCandidate.objects.create(
                    source_type=SourceType.EKUAIBAO,
                    source_raw_id=raw.id,
                    source_module=module,
                    source_snapshot=raw_data,
                    source_display_title=_truncate(f'易快报·{module}：{title}'),
                    target_workstation=target_ws,
                    target_model=target_model,
                    mapped_fields=mapped_fields,
                    confidence_score=confidence,
                    review_status=ReviewStatus.PENDING,
                    populated_by='CandidatePopulator.populate_from_ekb',
                )
                created += 1
            except Exception as exc:
                logger.error('populate_from_ekb error raw_id=%s: %s', raw.id, exc)
                errors += 1

        return {'created': created, 'skipped': skipped, 'errors': errors}

    def populate_from_feishu(
        self,
        limit: int = 200,
        source_types: Optional[list] = None,
    ) -> dict:
        """
        从 t_personal_context 生成候选记录。
        只处理 source_type in (mail, im, approval, doc, wiki) 的记录。
        """
        from apps.secretary.models import PersonalContext
        from .models import ExternalDataIngestCandidate, SourceType, ReviewStatus
        from .routing import route_source

        FEISHU_SOURCE_MAP = {
            'mail':     SourceType.FEISHU_MAIL,
            'im':       SourceType.FEISHU_IM,
            'approval': SourceType.FEISHU_APPROVAL,
            'doc':      SourceType.FEISHU_DOC,
            'wiki':     SourceType.FEISHU_DOC,
            'calendar': SourceType.FEISHU_CALENDAR,
        }

        allowed = source_types or list(FEISHU_SOURCE_MAP.keys())
        qs = PersonalContext.objects.filter(source_type__in=allowed)

        # 排除已有候选的（按 source_raw_id 所有飞书类型合并检查）
        feishu_types = list(FEISHU_SOURCE_MAP.values())
        existing_ids = set(
            ExternalDataIngestCandidate.objects.filter(source_type__in=feishu_types)
            .values_list('source_raw_id', flat=True)
        )

        created = 0
        skipped = 0
        errors = 0

        for pc in qs.order_by('created_at')[:limit]:
            if pc.id in existing_ids:
                skipped += 1
                continue
            try:
                pc_source = FEISHU_SOURCE_MAP.get(pc.source_type, SourceType.FEISHU_IM)
                text_hint = (getattr(pc, 'raw_content', '') or getattr(pc, 'summary', '') or '')[:500]
                target_ws = route_source(pc_source, text_hint=text_hint)

                snapshot = {
                    'source_type': pc.source_type,
                    'source_id': pc.source_id,
                    'summary': getattr(pc, 'summary', '') or '',
                    'raw_content': (getattr(pc, 'raw_content', '') or '')[:2000],
                    'user_id': getattr(pc, 'user_id', None),
                    'batch_id': getattr(pc, 'batch_id', ''),
                    'created_at': pc.created_at.isoformat() if pc.created_at else None,
                }

                mapped_fields = {
                    'content': {
                        'value': snapshot['summary'] or snapshot['raw_content'][:200],
                        'confidence': 0.5,
                        'source_field': 'summary/raw_content',
                    },
                    'source_ref': {
                        'value': pc.source_id,
                        'confidence': 0.9,
                        'source_field': 'source_id',
                    },
                }
                confidence = 0.5

                ExternalDataIngestCandidate.objects.create(
                    source_type=pc_source,
                    source_raw_id=pc.id,
                    source_module=pc.source_type,
                    source_snapshot=snapshot,
                    source_display_title=_truncate(
                        f'飞书·{pc.source_type}：{snapshot["summary"][:80] or pc.source_id}'
                    ),
                    target_workstation=target_ws,
                    mapped_fields=mapped_fields,
                    confidence_score=confidence,
                    review_status=ReviewStatus.PENDING,
                    populated_by='CandidatePopulator.populate_from_feishu',
                )
                created += 1
            except Exception as exc:
                logger.error('populate_from_feishu error pc_id=%s: %s', pc.id, exc)
                errors += 1

        return {'created': created, 'skipped': skipped, 'errors': errors}


# ══════════════════════════════════════════════════════════════════════════════
# IngestService
# ══════════════════════════════════════════════════════════════════════════════

class IngestService:
    """
    将已批准的候选记录写入目标工作台领域模型。

    分发逻辑：根据 candidate.target_workstation + source_type 选择合适的写入器。
    各工作台的写入器在 _DOMAIN_WRITERS 注册表中注册，
    未注册的工作台默认只标记 ingested + 写入审计（安全降级）。
    """

    def ingest(self, candidate_id: int, reviewer_id: int, reviewer_name: str = '') -> dict:
        """
        执行接入操作。返回 {'success': bool, 'message': str, 'record_id': int|None}
        """
        from .models import ExternalDataIngestCandidate, ReviewStatus

        try:
            candidate = ExternalDataIngestCandidate.objects.get(id=candidate_id)
        except ExternalDataIngestCandidate.DoesNotExist:
            return {'success': False, 'message': f'候选记录不存在: {candidate_id}', 'record_id': None}

        if candidate.review_status != ReviewStatus.APPROVED:
            return {
                'success': False,
                'message': f'候选记录状态为 {candidate.review_status}，只有已批准记录才能接入',
                'record_id': None,
            }

        effective_fields = candidate.get_effective_fields()

        # 尝试通过域写入器写入正式模型
        record_id = None
        domain_write_note = '无对应域写入器，仅标记接入状态'
        writer = _DOMAIN_WRITERS.get(candidate.target_workstation)
        if writer:
            try:
                record_id = writer(candidate, effective_fields, reviewer_id)
                domain_write_note = f'已写入域模型，record_id={record_id}'
            except Exception as exc:
                logger.error(
                    'domain_writer error candidate_id=%s ws=%s: %s',
                    candidate_id, candidate.target_workstation, exc,
                )
                domain_write_note = f'域写入器执行失败（{exc}），仅标记接入状态'

        # 审计日志
        try:
            from apps.audit.models import AuditLog
            AuditLog.objects.create(
                operator_id=reviewer_id,
                action='external_data_ingested',
                resource_type='ext_ingest_candidate',
                resource_id=str(candidate_id),
                description=(
                    f'外部数据接入：{candidate.source_type} → {candidate.target_workstation}'
                    f' [{candidate.source_display_title}] | {domain_write_note}'
                ),
            )
        except Exception as exc:
            logger.warning('audit log failed for ingest candidate %s: %s', candidate_id, exc)

        candidate.review_status = ReviewStatus.INGESTED
        if record_id:
            candidate.ingested_record_id = record_id
            candidate.ingested_model = candidate.target_model or ''
        candidate.ingestion_log = {
            'ingested_at': _now().isoformat(),
            'ingested_by': reviewer_id,
            'effective_fields_count': len(effective_fields),
            'record_id': record_id,
            'note': domain_write_note,
        }
        candidate.save(update_fields=[
            'review_status', 'ingestion_log', 'ingested_record_id', 'ingested_model', 'updated_at',
        ])

        return {
            'success': True,
            'message': domain_write_note,
            'record_id': record_id,
        }


# ══════════════════════════════════════════════════════════════════════════════
# 域写入器注册表
# 每个写入器签名：(candidate, effective_fields, reviewer_id) -> int | None
# 返回写入的目标记录 ID，失败时抛出异常
# ══════════════════════════════════════════════════════════════════════════════

def _write_to_execution(candidate, effective_fields: dict, reviewer_id: int):
    """
    执行工作台：写入 LIMS 检测数据。
    当前为扩展点占位，完整实现待 Wave 执行工作台迭代时补充。
    """
    # TODO[intake-execution]: 将 effective_fields 写入 t_crf_record 或关联的检测记录表
    return None


def _write_to_finance(candidate, effective_fields: dict, reviewer_id: int):
    """
    财务工作台：写入易快报费用数据。
    当前为扩展点占位，完整实现待财务工作台迭代时补充。
    """
    # TODO[intake-finance]: 将 effective_fields 写入 t_quote 或 t_payment 等财务表
    return None


def _write_to_hr(candidate, effective_fields: dict, reviewer_id: int):
    """
    人事工作台：写入人员资质信息。
    当前为扩展点占位，完整实现待 HR 工作台迭代时补充。
    """
    # TODO[intake-hr]: 将 effective_fields 写入 t_staff 或 t_staff_qualification
    return None


def _write_to_quality(candidate, effective_fields: dict, reviewer_id: int):
    """
    质量工作台：写入 SOP、偏差等质量数据。
    当前为扩展点占位，完整实现待质量工作台迭代时补充。
    """
    # TODO[intake-quality]: 将 effective_fields 写入 t_sop 或 t_deviation
    return None


def _write_to_lab_personnel(candidate, effective_fields: dict, reviewer_id: int):
    """
    实验室人员工作台：写入实验室工作人员资质数据。
    当前为扩展点占位，完整实现待实验室人员工作台迭代时补充。
    """
    # TODO[intake-lab-personnel]: 将 effective_fields 写入实验室人员相关表
    return None


_DOMAIN_WRITERS: dict = {
    'execution':    _write_to_execution,
    'finance':      _write_to_finance,
    'hr':           _write_to_hr,
    'quality':      _write_to_quality,
    'lab_personnel': _write_to_lab_personnel,
}



# ══════════════════════════════════════════════════════════════════════════════
# 内部工具函数
# ══════════════════════════════════════════════════════════════════════════════

def _calc_confidence(mapped_fields: dict) -> float:
    """根据字段级置信度计算整体置信度（简单均值）。"""
    if not mapped_fields:
        return 0.0
    scores = [v.get('confidence', 0.5) for v in mapped_fields.values() if isinstance(v, dict)]
    return round(sum(scores) / len(scores), 3) if scores else 0.0


def _simple_map_ekb(raw_data: dict, module: str) -> dict:
    """易快报数据的简单字段映射（占位，实际应复用 ekb_mapping.py）。"""
    result = {}
    for key in ('title', 'form_code', 'amount', 'currency', 'submitter', 'submit_date', 'status'):
        val = raw_data.get(key)
        if val not in (None, '', [], {}):
            result[key] = {'value': val, 'confidence': 0.75, 'source_field': key}
    return result
