"""
易快报集成 API（管仲·财务台 + 鹿鸣·治理台）

提供以下端点：
  GET  /ekuaibao/status        — 连通性状态 + 批次统计
  GET  /ekuaibao/batches       — 批次列表
  GET  /ekuaibao/batches/{id}  — 批次详情（含注入统计）
  GET  /ekuaibao/conflicts     — 冲突列表（待审核）
  POST /ekuaibao/conflicts/{id}/resolve — 处理冲突
  GET  /ekuaibao/reconcile     — 双轨对账结果
  GET  /ekuaibao/injection-logs — 注入日志（支持按工作台/批次过滤）
  GET  /ekuaibao/attachments   — 附件索引
"""
import logging
from typing import List, Optional

from django.http import HttpRequest
from ninja import Router, Schema
from pydantic import Field

logger = logging.getLogger('cn_kis.ekuaibao.api')

router = Router(tags=['易快报集成'])


# ============================================================================
# Schema
# ============================================================================

class EkbBatchOut(Schema):
    id: int
    batch_no: str
    phase: str
    status: str
    total_records: int
    injected_records: int
    conflict_count: int
    skipped_count: int
    created_at: str = ''

    @staticmethod
    def resolve_created_at(obj):
        return obj.create_time.isoformat() if obj.create_time else ''


class EkbConflictOut(Schema):
    id: int
    batch_no: str
    module: str
    ekb_id: str
    conflict_type: str
    similarity_score: float
    resolution: str
    existing_table: str
    diff_fields: list


class EkbConflictResolveIn(Schema):
    resolution: str = Field(
        ..., description='use_ekb / use_existing / manual_merge / skip'
    )
    note: str = ''
    merged_data: Optional[dict] = None


class EkbInjectionLogOut(Schema):
    id: int
    batch_no: str
    module: str
    ekb_id: str
    action: str
    target_table: str
    target_id: int
    target_workstation: str
    rolled_back: bool
    created_at: str = ''

    @staticmethod
    def resolve_created_at(obj):
        return obj.create_time.isoformat() if obj.create_time else ''


class ReconcileResultOut(Schema):
    module: str
    generated_at: str
    only_in_ekb_count: int
    only_in_new_count: int
    both_match_count: int
    both_mismatch_count: int
    only_in_ekb: list
    only_in_new: list
    both_mismatch: list


# ============================================================================
# 连通性状态
# ============================================================================

@router.get('/status', summary='易快报连通性状态与导入概览')
def get_status(request: HttpRequest):
    from apps.ekuaibao_integration.models import EkbImportBatch, EkbRawRecord
    from apps.ekuaibao_integration.ekb_exporter import EkbExporter

    batches = EkbImportBatch.objects.count()
    raw_records = EkbRawRecord.objects.count()
    injected = EkbRawRecord.objects.filter(injection_status='injected').count()
    pending = EkbRawRecord.objects.filter(injection_status='pending').count()
    conflicts = EkbRawRecord.objects.filter(injection_status='conflict').count()
    latest_batch = EkbImportBatch.objects.order_by('-create_time').first()

    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'total_batches': batches,
            'total_raw_records': raw_records,
            'injected_count': injected,
            'pending_count': pending,
            'conflict_count': conflicts,
            'latest_batch': latest_batch.batch_no if latest_batch else None,
            'latest_batch_status': latest_batch.status if latest_batch else None,
            'local_backup_batches': len(EkbExporter.list_batches()),
        },
    }


# ============================================================================
# 批次管理
# ============================================================================

@router.get('/batches', summary='批次列表')
def list_batches(request: HttpRequest, page: int = 1, page_size: int = 20):
    from apps.ekuaibao_integration.models import EkbImportBatch
    qs = EkbImportBatch.objects.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size].values(
        'id', 'batch_no', 'phase', 'status', 'total_records',
        'injected_records', 'conflict_count', 'skipped_count', 'create_time',
    ))
    for item in items:
        item['created_at'] = item.pop('create_time').isoformat()
    return {'code': 0, 'msg': 'ok', 'data': {'total': total, 'items': items}}


@router.get('/batches/{batch_no}', summary='批次详情')
def get_batch_detail(request: HttpRequest, batch_no: str):
    from apps.ekuaibao_integration.models import EkbImportBatch, EkbRawRecord
    batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
    if not batch:
        return {'code': 404, 'msg': '批次不存在', 'data': None}

    raw_stats = {
        status: EkbRawRecord.objects.filter(batch=batch, injection_status=status).count()
        for status in ('pending', 'injected', 'conflict', 'skipped', 'failed')
    }
    module_stats = EkbRawRecord.objects.filter(batch=batch).values('module').distinct()

    return {
        'code': 0, 'msg': 'ok',
        'data': {
            **batch.get_summary(),
            'created_at': batch.create_time.isoformat(),
            'collected_at': batch.collected_at.isoformat() if batch.collected_at else None,
            'injected_at': batch.injected_at.isoformat() if batch.injected_at else None,
            'raw_stats': raw_stats,
            'modules': [m['module'] for m in module_stats],
        },
    }


# ============================================================================
# 冲突管理
# ============================================================================

@router.get('/conflicts', summary='冲突列表（待审核）')
def list_conflicts(
    request: HttpRequest,
    batch_no: Optional[str] = None,
    module: Optional[str] = None,
    resolution: str = 'pending',
    page: int = 1,
    page_size: int = 50,
):
    from apps.ekuaibao_integration.models import EkbConflict, EkbImportBatch

    qs = EkbConflict.objects.select_related('batch').order_by('-create_time')
    if batch_no:
        batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
        if batch:
            qs = qs.filter(batch=batch)
    if module:
        qs = qs.filter(module=module)
    if resolution:
        qs = qs.filter(resolution=resolution)

    total = qs.count()
    offset = (page - 1) * page_size
    items = []
    for c in qs[offset:offset + page_size]:
        items.append({
            'id': c.id,
            'batch_no': c.batch.batch_no,
            'module': c.module,
            'ekb_id': c.ekb_id,
            'conflict_type': c.conflict_type,
            'similarity_score': c.similarity_score,
            'resolution': c.resolution,
            'existing_table': c.existing_table,
            'diff_fields_count': len(c.diff_fields or []),
            'diff_fields': (c.diff_fields or [])[:5],
        })
    return {'code': 0, 'msg': 'ok', 'data': {'total': total, 'items': items}}


@router.post('/conflicts/{conflict_id}/resolve', summary='处理单条冲突')
def resolve_conflict(request: HttpRequest, conflict_id: int, payload: EkbConflictResolveIn):
    from apps.ekuaibao_integration.models import EkbConflict, EkbImportBatch
    from apps.ekuaibao_integration.ekb_dedup import EkbDedupReport

    conflict = EkbConflict.objects.select_related('batch').filter(id=conflict_id).first()
    if not conflict:
        return {'code': 404, 'msg': '冲突记录不存在', 'data': None}

    report = EkbDedupReport(conflict.batch)
    result = report.resolve_conflict(
        conflict_id=conflict_id,
        resolution=payload.resolution,
        note=payload.note,
        merged_data=payload.merged_data,
    )
    return {'code': 0 if result['success'] else 400, 'msg': result.get('message', 'ok'), 'data': result}


# ============================================================================
# 对账结果
# ============================================================================

@router.get('/reconcile', summary='双轨对账结果')
def get_reconcile(request: HttpRequest, module: str = 'flows', batch_no: Optional[str] = None):
    from apps.ekuaibao_integration.models import EkbImportBatch
    from apps.ekuaibao_integration.ekb_dedup import EkbDedupReport
    from apps.ekuaibao_integration.ekb_exporter import EkbExporter

    if batch_no:
        batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
    else:
        batch = EkbImportBatch.objects.order_by('-create_time').first()

    if not batch:
        return {'code': 404, 'msg': '无批次记录', 'data': None}

    report = EkbDedupReport(batch)
    result = report.dual_track_reconcile(module=module)
    return {'code': 0, 'msg': 'ok', 'data': result}


# ============================================================================
# 注入日志
# ============================================================================

@router.get('/injection-logs', summary='注入日志（支持按工作台/批次过滤）')
def list_injection_logs(
    request: HttpRequest,
    batch_no: Optional[str] = None,
    workstation: Optional[str] = None,
    module: Optional[str] = None,
    rolled_back: Optional[bool] = None,
    page: int = 1,
    page_size: int = 100,
):
    from apps.ekuaibao_integration.models import EkbInjectionLog, EkbImportBatch

    qs = EkbInjectionLog.objects.select_related('batch').order_by('-create_time')
    if batch_no:
        batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
        if batch:
            qs = qs.filter(batch=batch)
    if workstation:
        qs = qs.filter(target_workstation=workstation)
    if module:
        qs = qs.filter(module=module)
    if rolled_back is not None:
        qs = qs.filter(rolled_back=rolled_back)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size].values(
        'id', 'batch__batch_no', 'module', 'ekb_id', 'action',
        'target_table', 'target_id', 'target_workstation',
        'rolled_back', 'create_time',
    ))
    for item in items:
        item['batch_no'] = item.pop('batch__batch_no')
        item['created_at'] = item.pop('create_time').isoformat()
    return {'code': 0, 'msg': 'ok', 'data': {'total': total, 'items': items}}


# ============================================================================
# 附件索引
# ============================================================================

@router.get('/attachments', summary='附件索引列表')
def list_attachments(
    request: HttpRequest,
    flow_id: Optional[str] = None,
    download_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    from apps.ekuaibao_integration.models import EkbAttachmentIndex

    qs = EkbAttachmentIndex.objects.order_by('-create_time')
    if flow_id:
        qs = qs.filter(flow_id=flow_id)
    if download_status:
        qs = qs.filter(download_status=download_status)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size].values(
        'id', 'flow_id', 'attachment_id', 'file_name',
        'file_size', 'download_status', 'local_path',
    ))
    return {'code': 0, 'msg': 'ok', 'data': {'total': total, 'items': items}}
