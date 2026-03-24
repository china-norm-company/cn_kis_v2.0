"""
外部数据接入激活网关 — API

端点设计原则：
- 所有端点以 /data-intake/ 为前缀
- 工作台专属端点包含 workstation 路径参数，后端校验请求人有该工作台的 data_intake.review 权限
- 操作型端点（approve/reject/modify/bulk-approve）写入审计日志
- governance/summary 端点需要 data_intake.manage 权限

响应格式统一遵循 {code, msg, data}。
"""
import json
import logging
from typing import Optional

from ninja import Router
from django.utils import timezone as dj_tz

from apps.identity.decorators import require_any_permission, require_permission
from .models import ExternalDataIngestCandidate, ReviewStatus, RejectReason

router = Router()
logger = logging.getLogger(__name__)

_REVIEW_PERMS = ['data_intake.candidate.review', 'data_intake.candidate.manage', 'system.admin', 'system.role.manage']
_MANAGE_PERMS = ['data_intake.candidate.manage', 'system.admin', 'system.role.manage']


# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────

def _candidate_to_dict(c: ExternalDataIngestCandidate) -> dict:
    return {
        'id': c.id,
        'source_type': c.source_type,
        'source_raw_id': c.source_raw_id,
        'source_module': c.source_module,
        'source_display_title': c.source_display_title,
        'target_workstation': c.target_workstation,
        'target_model': c.target_model,
        'confidence_score': c.confidence_score,
        'review_status': c.review_status,
        'reviewed_by_name': c.reviewed_by_name,
        'reviewed_at': c.reviewed_at.isoformat() if c.reviewed_at else None,
        'review_comment': c.review_comment,
        'reject_reason': c.reject_reason,
        'ingested_record_id': c.ingested_record_id,
        'ingested_model': c.ingested_model,
        'created_at': c.created_at.isoformat() if c.created_at else None,
        'updated_at': c.updated_at.isoformat() if c.updated_at else None,
    }


def _candidate_detail(c: ExternalDataIngestCandidate) -> dict:
    d = _candidate_to_dict(c)
    d['source_snapshot'] = c.source_snapshot
    d['mapped_fields'] = c.mapped_fields
    d['modified_fields'] = c.modified_fields
    d['effective_fields'] = c.get_effective_fields()
    d['ingestion_log'] = c.ingestion_log
    d['is_high_confidence'] = c.is_high_confidence()
    return d


def _write_audit(request, action: str, candidate: ExternalDataIngestCandidate, note: str = ''):
    try:
        from apps.audit.models import AuditLog
        from apps.identity.decorators import _get_account_from_request
        account = _get_account_from_request(request)
        AuditLog.objects.create(
            operator_id=account.id if account else 0,
            action=action,
            resource_type='ext_ingest_candidate',
            resource_id=str(candidate.id),
            description=(
                f'{action}: {candidate.source_display_title}'
                f' →{candidate.target_workstation}'
                + (f' | {note}' if note else '')
            ),
        )
    except Exception as exc:
        logger.warning('audit write failed: %s', exc)


# ─────────────────────────────────────────────────────────────────────────────
# GET /{workstation}/candidates  — 分页列表
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    '/{workstation}/candidates',
    summary='外部数据接入候选列表',
    response={200: dict, 401: dict, 403: dict},
)
@require_any_permission(_REVIEW_PERMS)
def list_candidates(
    request,
    workstation: str,
    status: str = '',
    source_type: str = '',
    confidence_min: float = 0.0,
    page: int = 1,
    page_size: int = 20,
):
    """
    返回指定工作台的接入候选记录列表，支持多维过滤。

    Query params:
      status         审核状态过滤（pending/approved/rejected/ingested）
      source_type    来源类型过滤（lims/feishu_mail/ekuaibao …）
      confidence_min 最低置信度过滤（0.0~1.0）
      page/page_size 分页
    """
    qs = ExternalDataIngestCandidate.objects.filter(target_workstation=workstation)

    if status:
        qs = qs.filter(review_status=status)
    else:
        qs = qs.filter(review_status=ReviewStatus.PENDING)

    if source_type:
        qs = qs.filter(source_type=source_type)

    if confidence_min > 0:
        qs = qs.filter(confidence_score__gte=confidence_min)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset: offset + page_size])

    # 分组统计（当前工作台）
    from django.db.models import Count
    status_counts = dict(
        ExternalDataIngestCandidate.objects.filter(target_workstation=workstation)
        .values('review_status')
        .annotate(cnt=Count('id'))
        .values_list('review_status', 'cnt')
    )

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_candidate_to_dict(c) for c in items],
            'total': total,
            'page': page,
            'page_size': page_size,
            'workstation': workstation,
            'status_counts': status_counts,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /{workstation}/candidates/{id}  — 详情（含原始快照对比）
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    '/{workstation}/candidates/{candidate_id}',
    summary='接入候选详情（含原始快照）',
    response={200: dict, 401: dict, 403: dict, 404: dict},
)
@require_any_permission(_REVIEW_PERMS)
def get_candidate(request, workstation: str, candidate_id: int):
    """
    返回单条候选记录的完整详情，包含：
    - source_snapshot：原始数据快照（只读，供左侧对比视图）
    - mapped_fields：自动映射字段（含每字段置信度）
    - modified_fields：人工修正字段
    - effective_fields：实际接入时使用的字段（修正 > 映射）
    """
    try:
        candidate = ExternalDataIngestCandidate.objects.get(
            id=candidate_id, target_workstation=workstation,
        )
    except ExternalDataIngestCandidate.DoesNotExist:
        return 404, {'code': 404, 'msg': '候选记录不存在', 'data': None}

    return {'code': 200, 'msg': 'OK', 'data': _candidate_detail(candidate)}


# ─────────────────────────────────────────────────────────────────────────────
# POST /{workstation}/candidates/{id}/approve  — 批准
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    '/{workstation}/candidates/{candidate_id}/approve',
    summary='批准接入候选',
    response={200: dict, 401: dict, 403: dict, 404: dict, 422: dict},
)
@require_any_permission(_REVIEW_PERMS)
def approve_candidate(request, workstation: str, candidate_id: int):
    """
    批准单条候选记录，状态变更为 approved，并立即触发接入操作。

    请求体（可选）：
      { "comment": "审核备注" }
    """
    from apps.identity.decorators import _get_account_from_request
    from .services import IngestService

    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}

    try:
        candidate = ExternalDataIngestCandidate.objects.get(
            id=candidate_id, target_workstation=workstation,
        )
    except ExternalDataIngestCandidate.DoesNotExist:
        return 404, {'code': 404, 'msg': '候选记录不存在', 'data': None}

    if candidate.review_status not in (ReviewStatus.PENDING,):
        return 422, {
            'code': 422,
            'msg': f'当前状态 {candidate.review_status} 不允许批准操作',
            'data': None,
        }

    account = _get_account_from_request(request)
    now = dj_tz.now()

    candidate.review_status = ReviewStatus.APPROVED
    candidate.reviewed_by_id = account.id if account else None
    candidate.reviewed_by_name = account.display_name if account else ''
    candidate.reviewed_at = now
    candidate.review_comment = body.get('comment', '')
    candidate.save(update_fields=[
        'review_status', 'reviewed_by_id', 'reviewed_by_name',
        'reviewed_at', 'review_comment', 'updated_at',
    ])

    _write_audit(request, 'data_intake_approved', candidate, body.get('comment', ''))

    # 立即触发接入
    ingest_result = IngestService().ingest(
        candidate_id=candidate.id,
        reviewer_id=account.id if account else 0,
        reviewer_name=account.display_name if account else '',
    )

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'candidate_id': candidate.id,
            'new_status': candidate.review_status,
            'ingest_result': ingest_result,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /{workstation}/candidates/{id}/reject  — 拒绝
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    '/{workstation}/candidates/{candidate_id}/reject',
    summary='拒绝接入候选',
    response={200: dict, 401: dict, 403: dict, 404: dict, 422: dict},
)
@require_any_permission(_REVIEW_PERMS)
def reject_candidate(request, workstation: str, candidate_id: int):
    """
    拒绝单条候选记录。

    请求体：
      {
        "reason": "data_quality|duplicate|wrong_scope|mapping_error|other",
        "comment": "拒绝原因说明"
      }
    """
    from apps.identity.decorators import _get_account_from_request

    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}

    reason = body.get('reason', RejectReason.OTHER)
    comment = body.get('comment', '')

    try:
        candidate = ExternalDataIngestCandidate.objects.get(
            id=candidate_id, target_workstation=workstation,
        )
    except ExternalDataIngestCandidate.DoesNotExist:
        return 404, {'code': 404, 'msg': '候选记录不存在', 'data': None}

    if candidate.review_status not in (ReviewStatus.PENDING,):
        return 422, {
            'code': 422,
            'msg': f'当前状态 {candidate.review_status} 不允许拒绝操作',
            'data': None,
        }

    account = _get_account_from_request(request)
    now = dj_tz.now()

    candidate.review_status = ReviewStatus.REJECTED
    candidate.reviewed_by_id = account.id if account else None
    candidate.reviewed_by_name = account.display_name if account else ''
    candidate.reviewed_at = now
    candidate.reject_reason = reason
    candidate.review_comment = comment
    candidate.save(update_fields=[
        'review_status', 'reviewed_by_id', 'reviewed_by_name',
        'reviewed_at', 'reject_reason', 'review_comment', 'updated_at',
    ])

    _write_audit(request, 'data_intake_rejected', candidate, f'{reason}: {comment}')

    return {
        'code': 200,
        'msg': 'OK',
        'data': {'candidate_id': candidate.id, 'new_status': ReviewStatus.REJECTED},
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /{workstation}/candidates/{id}/modify  — 修改字段后批准
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    '/{workstation}/candidates/{candidate_id}/modify',
    summary='修改映射字段后批准',
    response={200: dict, 401: dict, 403: dict, 404: dict, 422: dict},
)
@require_any_permission(_REVIEW_PERMS)
def modify_and_approve(request, workstation: str, candidate_id: int):
    """
    审核人修正部分映射字段后批准接入。

    请求体：
      {
        "modified_fields": {
          "subject_no": {"value": "S-2024-001", "note": "手动确认"},
          "visit_date": {"value": "2024-03-15", "note": ""}
        },
        "comment": "已核实并修正受试者编号"
      }
    """
    from apps.identity.decorators import _get_account_from_request
    from .services import IngestService

    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}

    modified_fields = body.get('modified_fields', {})
    comment = body.get('comment', '')

    try:
        candidate = ExternalDataIngestCandidate.objects.get(
            id=candidate_id, target_workstation=workstation,
        )
    except ExternalDataIngestCandidate.DoesNotExist:
        return 404, {'code': 404, 'msg': '候选记录不存在', 'data': None}

    if candidate.review_status not in (ReviewStatus.PENDING,):
        return 422, {
            'code': 422,
            'msg': f'当前状态 {candidate.review_status} 不允许修改操作',
            'data': None,
        }

    account = _get_account_from_request(request)
    now = dj_tz.now()

    candidate.modified_fields = modified_fields
    candidate.review_status = ReviewStatus.APPROVED
    candidate.reviewed_by_id = account.id if account else None
    candidate.reviewed_by_name = account.display_name if account else ''
    candidate.reviewed_at = now
    candidate.review_comment = comment
    candidate.save(update_fields=[
        'modified_fields', 'review_status',
        'reviewed_by_id', 'reviewed_by_name',
        'reviewed_at', 'review_comment', 'updated_at',
    ])

    _write_audit(
        request, 'data_intake_modified_approved', candidate,
        f'修正字段: {list(modified_fields.keys())}',
    )

    ingest_result = IngestService().ingest(
        candidate_id=candidate.id,
        reviewer_id=account.id if account else 0,
        reviewer_name=account.display_name if account else '',
    )

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'candidate_id': candidate.id,
            'new_status': candidate.review_status,
            'modified_field_count': len(modified_fields),
            'ingest_result': ingest_result,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /{workstation}/candidates/bulk-approve  — 批量批准高置信度记录
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    '/{workstation}/candidates/bulk-approve',
    summary='批量批准高置信度候选',
    response={200: dict, 401: dict, 403: dict},
)
@require_any_permission(_REVIEW_PERMS)
def bulk_approve(request, workstation: str):
    """
    批量批准指定工作台中满足置信度阈值的待审核候选记录。

    请求体：
      {
        "confidence_threshold": 0.8,  // 默认 0.8
        "source_type": "",             // 可选，按来源类型过滤
        "limit": 50,                   // 单次最多批准数量（默认50，最大200）
        "dry_run": true                // 仅统计，不实际操作（默认 true）
      }
    """
    from apps.identity.decorators import _get_account_from_request
    from .services import IngestService

    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}

    threshold = float(body.get('confidence_threshold', 0.8))
    source_type_filter = body.get('source_type', '')
    limit = min(int(body.get('limit', 50)), 200)
    dry_run = body.get('dry_run', True)

    qs = ExternalDataIngestCandidate.objects.filter(
        target_workstation=workstation,
        review_status=ReviewStatus.PENDING,
        confidence_score__gte=threshold,
    )
    if source_type_filter:
        qs = qs.filter(source_type=source_type_filter)

    total_eligible = qs.count()
    batch = list(qs[:limit])

    if dry_run:
        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'dry_run': True,
                'eligible_total': total_eligible,
                'batch_size': len(batch),
                'threshold': threshold,
                'message': f'满足置信度 ≥ {threshold} 的候选共 {total_eligible} 条（dry_run 未执行）',
            },
        }

    account = _get_account_from_request(request)
    now = dj_tz.now()
    ingest_svc = IngestService()

    approved_count = 0
    ingested_count = 0
    errors = 0

    for candidate in batch:
        try:
            candidate.review_status = ReviewStatus.APPROVED
            candidate.reviewed_by_id = account.id if account else None
            candidate.reviewed_by_name = account.display_name if account else ''
            candidate.reviewed_at = now
            candidate.review_comment = f'批量自动批准（置信度 {candidate.confidence_score:.2f} ≥ {threshold}）'
            candidate.save(update_fields=[
                'review_status', 'reviewed_by_id', 'reviewed_by_name',
                'reviewed_at', 'review_comment', 'updated_at',
            ])
            approved_count += 1

            result = ingest_svc.ingest(
                candidate_id=candidate.id,
                reviewer_id=account.id if account else 0,
            )
            if result.get('success'):
                ingested_count += 1
        except Exception as exc:
            logger.error('bulk_approve error candidate_id=%s: %s', candidate.id, exc)
            errors += 1

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'dry_run': False,
            'approved': approved_count,
            'ingested': ingested_count,
            'errors': errors,
            'threshold': threshold,
            'message': f'批量批准完成：批准 {approved_count}，接入 {ingested_count}，失败 {errors}',
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /{workstation}/candidates/populate  — 手动触发候选生成
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    '/{workstation}/candidates/populate',
    summary='手动触发候选记录生成',
    response={200: dict, 401: dict, 403: dict},
)
@require_any_permission(_MANAGE_PERMS)
def populate_candidates(request, workstation: str):
    """
    手动触发从原始层生成接入候选记录（等同于 CandidatePopulator 的批量操作）。

    请求体：
      {
        "source_type": "lims|ekuaibao|feishu_mail|...",  // 不传则全部
        "module_filter": "",                               // LIMS/EKB 专用
        "limit": 200
      }
    """
    from .services import CandidatePopulator

    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}

    source_type = body.get('source_type', '')
    module_filter = body.get('module_filter', '')
    limit = min(int(body.get('limit', 200)), 1000)

    populator = CandidatePopulator()
    results = {}

    if not source_type or source_type == 'lims':
        results['lims'] = populator.populate_from_lims(limit=limit, module_filter=module_filter)

    if not source_type or source_type == 'ekuaibao':
        results['ekuaibao'] = populator.populate_from_ekb(limit=limit, module_filter=module_filter)

    if not source_type or source_type in ('feishu_mail', 'feishu_im', 'feishu_doc', 'feishu_approval'):
        feishu_types = [source_type] if source_type else None
        results['feishu'] = populator.populate_from_feishu(limit=limit, source_types=feishu_types)

    total_created = sum(r.get('created', 0) for r in results.values())

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'total_created': total_created,
            'results_by_source': results,
            'message': f'候选记录生成完成，共新建 {total_created} 条',
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /governance/summary  — 跨工作台治理汇总（洞明数据台专用）
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    '/governance/summary',
    summary='跨工作台接入治理汇总',
    response={200: dict, 401: dict, 403: dict},
)
@require_any_permission(_MANAGE_PERMS + ['knowledge.manage', 'knowledge.read'])
def governance_summary(request):
    """
    返回所有工作台的外部数据接入状态汇总，供洞明数据台治理总览页使用。

    响应包含：
    - 各工作台 pending/approved/rejected/ingested 数量
    - 各来源类型的候选记录数
    - 高置信度（≥0.8）待审核记录数
    - 最近7天接入趋势
    """
    from django.db.models import Count, Avg
    from django.utils import timezone as tz
    from datetime import timedelta

    from .models import TargetWorkstation

    all_qs = ExternalDataIngestCandidate.objects.all()

    # 工作台维度统计
    ws_stats = {}
    for ws_row in (
        all_qs.values('target_workstation', 'review_status')
        .annotate(cnt=Count('id'))
    ):
        ws = ws_row['target_workstation']
        status = ws_row['review_status']
        ws_stats.setdefault(ws, {})
        ws_stats[ws][status] = ws_row['cnt']

    # 填充所有工作台（即使没有数据也返回0）
    for ws_value in TargetWorkstation.values:
        ws_stats.setdefault(ws_value, {})
        for s in ReviewStatus.values:
            ws_stats[ws_value].setdefault(s, 0)

    # 来源类型统计
    source_stats = dict(
        all_qs.values('source_type')
        .annotate(cnt=Count('id'))
        .values_list('source_type', 'cnt')
    )

    # 高置信度待审核
    high_conf_pending = all_qs.filter(
        review_status=ReviewStatus.PENDING,
        confidence_score__gte=0.8,
    ).count()

    # 最近7天接入趋势
    seven_days_ago = tz.now() - timedelta(days=7)
    recent_ingested = list(
        all_qs.filter(
            review_status__in=(ReviewStatus.INGESTED, ReviewStatus.AUTO_INGESTED),
            updated_at__gte=seven_days_ago,
        )
        .extra(select={'day': "DATE(updated_at)"})
        .values('day')
        .annotate(cnt=Count('id'))
        .order_by('day')
    )

    # 整体汇总
    total = all_qs.count()
    pending_total = all_qs.filter(review_status=ReviewStatus.PENDING).count()
    ingested_total = all_qs.filter(
        review_status__in=(ReviewStatus.INGESTED, ReviewStatus.AUTO_INGESTED)
    ).count()
    avg_confidence = all_qs.aggregate(avg=Avg('confidence_score'))['avg'] or 0.0

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'total_candidates': total,
            'pending_total': pending_total,
            'ingested_total': ingested_total,
            'high_confidence_pending': high_conf_pending,
            'avg_confidence': round(avg_confidence, 3),
            'by_workstation': ws_stats,
            'by_source_type': source_stats,
            'recent_ingested_trend': [
                {'day': str(r['day']), 'count': r['cnt']}
                for r in recent_ingested
            ],
        },
    }
