from typing import Optional
"""
洞明·数据台 API

提供数据中台专用汇总端点：
- GET  /data-platform/dashboard                数据台驾驶舱汇总
- GET  /data-platform/ingest/overview          数据清洗与导入总览
- GET  /data-platform/ingest/sources           各原始来源统计
- GET  /data-platform/ingest/duplicates        重复记录概览
- POST /data-platform/ingest/deduplicate       执行去重清洗（dry-run 或真实）
- POST /data-platform/ingest/run-pipeline      触发知识入库 Pipeline
- GET  /data-platform/ingest/pipeline-jobs     入库任务进度查询
- GET  /data-platform/ingest/pending-entries   待入库知识条目列表
"""
from ninja import Router
from apps.identity.decorators import require_any_permission
from apps.identity.decorators import require_permission

router = Router()


# ────────────────────────────────────────────────────────────
# 数据域注册表
# ────────────────────────────────────────────────────────────

@router.get('/domains', summary='数据域注册表', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.read', 'knowledge.entry.view', 'knowledge.manage.write'])
def list_domains(request):
    """
    返回系统所有 10 个数据域的定义信息：
    域 ID、中文名、职责、生命周期层、包含表、来源 App、数据责任人、管辖框架。
    """
    from apps.knowledge.domain_registry import DomainRegistry
    domains = [d.to_dict() for d in DomainRegistry.all()]
    summary = DomainRegistry.summary()
    return {'code': 200, 'msg': 'OK', 'data': {'domains': domains, 'summary': summary}}


@router.get('/domains/{domain_id}', summary='数据域详情', response={200: dict, 401: dict, 403: dict, 404: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.read', 'knowledge.entry.view', 'knowledge.manage.write'])
def get_domain(request, domain_id: str):
    """返回单个数据域的完整定义及实时统计（各表行数、未接入候选数等）。"""
    from apps.knowledge.domain_registry import DomainRegistry
    from apps.knowledge.classification import DATA_CLASSIFICATION_REGISTRY
    from django.db import connection

    domain = DomainRegistry.get(domain_id)
    if not domain:
        return 404, {'code': 404, 'msg': f'数据域 {domain_id} 不存在', 'data': None}

    # 实时表行数
    table_stats = []
    with connection.cursor() as cursor:
        for tbl in domain.tables:
            try:
                cursor.execute(
                    "SELECT reltuples::bigint FROM pg_class WHERE relname = %s", [tbl]
                )
                row = cursor.fetchone()
                approx_rows = int(row[0]) if row and row[0] else 0
            except Exception:
                approx_rows = None
            cls_info = {}
            if tbl in DATA_CLASSIFICATION_REGISTRY:
                dc = DATA_CLASSIFICATION_REGISTRY[tbl]
                cls_info = {
                    'security_level': dc.security_level,
                    'criticality': dc.criticality,
                    'is_phi': dc.is_phi(),
                }
            table_stats.append({'table': tbl, 'approx_rows': approx_rows, 'classification': cls_info})

    result = domain.to_dict()
    result['table_stats'] = table_stats
    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────
# 治理总览
# ────────────────────────────────────────────────────────────

@router.get('/governance/overview', summary='跨域治理总览', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def governance_overview(request):
    """
    治理驾驶舱核心数据：
    - 各域实时记录数
    - 分类合规摘要（GCP+PI 冲突、假名化待办）
    - 外部接入候选待审核汇总
    - 知识向量化进度
    - 写保护状态
    """
    from apps.knowledge.domain_registry import DomainRegistry, DOMAIN_REGISTRY
    from apps.knowledge.classification import ClassificationRegistry

    result = {
        'domains': [],
        'compliance_summary': {},
        'intake_summary': {},
        'knowledge_vectorization': {},
        'write_protected': True,
    }

    # 各域汇总（实时行数）
    from django.db import connection
    domain_stats = []
    with connection.cursor() as cursor:
        for domain in DomainRegistry.all():
            total_rows = 0
            for tbl in domain.tables:
                try:
                    cursor.execute(
                        "SELECT reltuples::bigint FROM pg_class WHERE relname = %s", [tbl]
                    )
                    row = cursor.fetchone()
                    total_rows += int(row[0]) if row and row[0] else 0
                except Exception:
                    pass
            domain_stats.append({
                'domain_id': domain.domain_id,
                'label': domain.label,
                'lifecycle_stage': domain.lifecycle_stage,
                'color': domain.color,
                'total_rows': total_rows,
                'table_count': len(domain.tables),
            })
    result['domains'] = domain_stats

    # 分类合规摘要
    try:
        result['compliance_summary'] = ClassificationRegistry.compliance_summary()
    except Exception:
        pass

    # 外部接入候选汇总
    try:
        from apps.data_intake.models import ExternalDataIngestCandidate, ReviewStatus
        from django.db.models import Count
        result['intake_summary'] = {
            'total': ExternalDataIngestCandidate.objects.count(),
            'pending': ExternalDataIngestCandidate.objects.filter(
                review_status=ReviewStatus.PENDING
            ).count(),
            'ingested': ExternalDataIngestCandidate.objects.filter(
                review_status__in=(ReviewStatus.INGESTED, ReviewStatus.AUTO_INGESTED)
            ).count(),
        }
    except Exception:
        pass

    # 知识向量化进度
    try:
        from apps.knowledge.models import KnowledgeEntry
        total_ke = KnowledgeEntry.objects.count()
        indexed = KnowledgeEntry.objects.filter(index_status='indexed').count()
        result['knowledge_vectorization'] = {
            'total': total_ke,
            'indexed': indexed,
            'pending': KnowledgeEntry.objects.filter(index_status='pending').count(),
            'failed': KnowledgeEntry.objects.filter(index_status='failed').count(),
            'progress_pct': round(indexed / total_ke * 100, 1) if total_ke > 0 else 0,
        }
    except Exception:
        pass

    # 写保护状态
    try:
        from apps.knowledge.guards import KnowledgeAssetGuard
        result['write_protected'] = not KnowledgeAssetGuard._write_enabled()
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────
# 数据生命周期总览
# ────────────────────────────────────────────────────────────

_LIFECYCLE_STAGES = [
    {'id': 'raw',       'label': '外部原始层', 'desc': '外部系统采集的不可变原始数据'},
    {'id': 'staging',   'label': '接入暂存层', 'desc': '清洗映射后等待审核的候选队列'},
    {'id': 'formal',    'label': '正式业务层', 'desc': '经人工审核进入业务域的正式对象'},
    {'id': 'content',   'label': '内容信号层', 'desc': '飞书等平台采集的上下文与信号数据'},
    {'id': 'knowledge', 'label': '知识资产层', 'desc': '结构化知识条目、图谱与向量索引'},
    {'id': 'meta',      'label': '治理元数据层', 'desc': '账号、权限、审计等平台元数据'},
]


@router.get('/lifecycle/overview', summary='数据生命周期总览', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def lifecycle_overview(request):
    """
    返回各生命周期层（raw → staging → formal → content → knowledge → meta）的：
    - 包含域列表
    - 估算总记录数
    - 本层关键健康指标
    """
    from apps.knowledge.domain_registry import DomainRegistry
    from django.db import connection

    stages_out = []
    with connection.cursor() as cursor:
        for stage_def in _LIFECYCLE_STAGES:
            stage_id = stage_def['id']
            domains = DomainRegistry.by_lifecycle(stage_id)
            total_rows = 0
            for domain in domains:
                for tbl in domain.tables:
                    try:
                        cursor.execute(
                            "SELECT reltuples::bigint FROM pg_class WHERE relname = %s", [tbl]
                        )
                        row = cursor.fetchone()
                        total_rows += int(row[0]) if row and row[0] else 0
                    except Exception:
                        pass
            stages_out.append({
                **stage_def,
                'domain_count': len(domains),
                'domain_ids': [d.domain_id for d in domains],
                'total_rows': total_rows,
            })

    return {'code': 200, 'msg': 'OK', 'data': {'stages': stages_out}}


@router.get('/lifecycle/by-domain', summary='按域查询生命周期分布', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def lifecycle_by_domain(request):
    """
    返回每个数据域当前所处生命周期阶段及所属表的实时行数，
    用于"哪些数据滞留在某层未流转"的治理分析。
    """
    from apps.knowledge.domain_registry import DomainRegistry
    from django.db import connection

    result = []
    with connection.cursor() as cursor:
        for domain in DomainRegistry.all():
            table_rows = {}
            total = 0
            for tbl in domain.tables:
                try:
                    cursor.execute(
                        "SELECT reltuples::bigint FROM pg_class WHERE relname = %s", [tbl]
                    )
                    row = cursor.fetchone()
                    cnt = int(row[0]) if row and row[0] else 0
                except Exception:
                    cnt = 0
                table_rows[tbl] = cnt
                total += cnt

            result.append({
                'domain_id': domain.domain_id,
                'label': domain.label,
                'lifecycle_stage': domain.lifecycle_stage,
                'color': domain.color,
                'total_rows': total,
                'table_rows': table_rows,
                'owner_role': domain.owner_role,
                'regulatory': domain.regulatory,
            })

    return {'code': 200, 'msg': 'OK', 'data': {'items': result, 'total': len(result)}}


# ────────────────────────────────────────────────────────────
# 驾驶舱汇总
# ────────────────────────────────────────────────────────────

@router.get('/dashboard', summary='数据台驾驶舱汇总', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def data_platform_dashboard(request):
    """
    聚合知识库、飞书上下文、易快报记录数量，供洞明·数据台仪表盘使用。
    """
    result = {
        'knowledge_entries': 0,
        'knowledge_entities': 0,
        'personal_contexts': 0,
        'ekb_records': 0,
        'lims_raw_records': 0,
        'lims_pending_injection': 0,
        'write_protected': True,
        'pipelines_healthy': 5,
        'pipelines_total': 9,
    }

    try:
        from apps.knowledge.models import KnowledgeEntry
        result['knowledge_entries'] = KnowledgeEntry.objects.count()
    except Exception:
        pass

    try:
        from apps.knowledge.models import KnowledgeEntity
        result['knowledge_entities'] = KnowledgeEntity.objects.count()
    except Exception:
        pass

    try:
        from apps.secretary.models import PersonalContext
        result['personal_contexts'] = PersonalContext.objects.count()
    except Exception:
        pass

    try:
        from apps.ekuaibao_integration.models import EkbRawRecord
        result['ekb_records'] = EkbRawRecord.objects.count()
    except Exception:
        pass

    try:
        from apps.lims_integration.models import RawLimsRecord
        result['lims_raw_records'] = RawLimsRecord.objects.count()
        result['lims_pending_injection'] = RawLimsRecord.objects.filter(
            injection_status='pending'
        ).count()
    except Exception:
        pass

    try:
        from apps.knowledge.guards import KnowledgeAssetGuard
        result['write_protected'] = not KnowledgeAssetGuard._write_enabled()
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────
# 数据清洗与导入管理
# ────────────────────────────────────────────────────────────

@router.get('/ingest/overview', summary='数据清洗与入库总览', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['system.role.read', 'knowledge.manage.write'])
def ingest_overview(request):
    """
    返回各原始来源的数据量、已入库量、待入库量、重复数量等汇总指标。
    """
    from django.db.models import Count
    result = {
        'personal_context': {'total': 0, 'by_source': {}, 'duplicate_count': 0, 'unique_count': 0},
        'knowledge_entry': {'total': 0, 'indexed': 0, 'pending': 0, 'failed': 0, 'draft': 0},
        'ekb_raw': {'total': 0},
        'write_protected': True,
    }

    # PersonalContext 统计
    try:
        from apps.secretary.models import PersonalContext
        total_pc = PersonalContext.objects.count()
        by_source = dict(
            PersonalContext.objects.values('source_type')
            .annotate(cnt=Count('id'))
            .values_list('source_type', 'cnt')
        )
        # 去重统计：content_hash 相同的多条记录视为重复
        from django.db.models import Max
        total_hashes = PersonalContext.objects.exclude(content_hash='').values('content_hash').distinct().count()
        has_hash = PersonalContext.objects.exclude(content_hash='').count()
        duplicates = has_hash - total_hashes if has_hash > total_hashes else 0
        result['personal_context'] = {
            'total': total_pc,
            'by_source': by_source,
            'duplicate_count': duplicates,
            'unique_count': total_hashes,
        }
    except Exception:
        pass

    # KnowledgeEntry 统计
    try:
        from apps.knowledge.models import KnowledgeEntry
        total_ke = KnowledgeEntry.objects.count()
        indexed = KnowledgeEntry.objects.filter(index_status='indexed').count()
        pending = KnowledgeEntry.objects.filter(index_status='pending').count()
        failed = KnowledgeEntry.objects.filter(index_status='failed').count()
        draft = KnowledgeEntry.objects.filter(status='draft').count()
        result['knowledge_entry'] = {
            'total': total_ke,
            'indexed': indexed,
            'pending': pending,
            'failed': failed,
            'draft': draft,
        }
    except Exception:
        pass

    # EKB 原始层
    try:
        from apps.ekuaibao_integration.models import EkbRawRecord
        result['ekb_raw'] = {'total': EkbRawRecord.objects.count()}
    except Exception:
        pass

    # 写保护
    try:
        from apps.knowledge.guards import KnowledgeAssetGuard
        result['write_protected'] = not KnowledgeAssetGuard._write_enabled()
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/ingest/sources', summary='原始来源数据分布', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['system.role.read', 'knowledge.manage.write'])
def ingest_sources(request):
    """
    按 source_type 返回 PersonalContext 的分布统计，
    并返回最近 5 个采集批次（batch_id）的情况。
    """
    from django.db.models import Count, Max, Min
    data = {'by_source': [], 'batches': []}

    try:
        from apps.secretary.models import PersonalContext
        rows = (
            PersonalContext.objects
            .values('source_type')
            .annotate(
                count=Count('id'),
                latest=Max('created_at'),
                earliest=Min('created_at'),
            )
            .order_by('-count')
        )
        data['by_source'] = [
            {
                'source_type': r['source_type'],
                'count': r['count'],
                'latest': r['latest'].isoformat() if r['latest'] else None,
                'earliest': r['earliest'].isoformat() if r['earliest'] else None,
            }
            for r in rows
        ]

        # 最近 5 个批次
        batches = (
            PersonalContext.objects
            .exclude(batch_id='')
            .values('batch_id')
            .annotate(count=Count('id'), latest=Max('created_at'))
            .order_by('-latest')[:5]
        )
        data['batches'] = [
            {'batch_id': b['batch_id'], 'count': b['count'],
             'latest': b['latest'].isoformat() if b['latest'] else None}
            for b in batches
        ]
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/ingest/duplicates', summary='重复记录分析', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['system.role.read', 'knowledge.manage.write'])
def ingest_duplicates(request):
    """
    返回 content_hash 重复的 PersonalContext 组，每组最多展示 3 条样本。
    仅返回前 20 个重复组（已足够运维决策）。
    """
    from django.db.models import Count
    data = {'groups': [], 'total_duplicate_records': 0, 'total_duplicate_groups': 0}

    try:
        from apps.secretary.models import PersonalContext
        # 找出 content_hash 有重复的 hash 值
        dup_hashes = (
            PersonalContext.objects
            .exclude(content_hash='')
            .values('content_hash')
            .annotate(cnt=Count('id'))
            .filter(cnt__gt=1)
            .order_by('-cnt')[:20]
        )
        groups = []
        total_dup_records = 0
        for row in dup_hashes:
            records = list(
                PersonalContext.objects
                .filter(content_hash=row['content_hash'])
                .values('id', 'source_type', 'source_id', 'user_id', 'created_at', 'batch_id')[:3]
            )
            for r in records:
                r['created_at'] = r['created_at'].isoformat() if r['created_at'] else None
            total_dup_records += row['cnt'] - 1  # 每组保留 1 条，其余算重复
            groups.append({
                'content_hash': row['content_hash'][:16] + '...',
                'count': row['cnt'],
                'samples': records,
            })
        data['groups'] = groups
        data['total_duplicate_groups'] = len(groups)
        data['total_duplicate_records'] = total_dup_records
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/ingest/deduplicate', summary='执行去重清洗', response={200: dict, 401: dict, 403: dict})
@require_permission('knowledge.manage.write')
def ingest_deduplicate(request):
    """
    对 PersonalContext 执行 content_hash 去重：
    保留每个 content_hash 中 id 最小的记录，删除其余副本。

    请求体（可选）：
      { "dry_run": true }   仅统计，不实际删除（默认 true）

    注意：此操作受 KNOWLEDGE_WRITE_ENABLED 开关保护。
    """
    import json
    from apps.knowledge.guards import KnowledgeAssetGuard, KnowledgeWriteDisabled

    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}
    dry_run = body.get('dry_run', True)

    # 写保护检查（dry_run 时不检查，仅统计）
    if not dry_run:
        try:
            KnowledgeAssetGuard.guard_ingest_personal_context()
        except KnowledgeWriteDisabled:
            return 403, {
                'code': 403,
                'msg': '知识资产写保护已启用（KNOWLEDGE_WRITE_ENABLED=false），请先开启写入开关后再执行清洗。',
                'data': None,
            }

    from django.db.models import Count, Min
    try:
        from apps.secretary.models import PersonalContext

        # 找出有重复的 hash 及每组应保留的最小 id
        dup_groups = (
            PersonalContext.objects
            .exclude(content_hash='')
            .values('content_hash')
            .annotate(cnt=Count('id'), keep_id=Min('id'))
            .filter(cnt__gt=1)
        )

        to_delete_ids = []
        groups_affected = 0
        for g in dup_groups:
            groups_affected += 1
            # 找出该 hash 中除保留记录外的所有 id
            dup_ids = list(
                PersonalContext.objects
                .filter(content_hash=g['content_hash'])
                .exclude(id=g['keep_id'])
                .values_list('id', flat=True)
            )
            to_delete_ids.extend(dup_ids)

        deleted = 0
        if not dry_run and to_delete_ids:
            deleted, _ = PersonalContext.objects.filter(id__in=to_delete_ids).delete()

        # 写操作审计日志（GCP 数据完整性要求）
        if not dry_run:
            try:
                from apps.identity.decorators import _get_account_from_request
                from apps.audit.services import log_audit
                _acct = _get_account_from_request(request)
                if _acct:
                    log_audit(
                        account_id=_acct.id,
                        account_name=_acct.display_name or _acct.username,
                        action='UPDATE',
                        resource_type='personal_context',
                        resource_id='deduplicate',
                        description=f'知识去重操作：删除 {deleted} 条重复记录（共 {groups_affected} 个重复组）',
                        new_value={'deleted': deleted, 'groups_affected': groups_affected, 'dry_run': False},
                    )
            except Exception:
                pass

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'dry_run': dry_run,
                'groups_affected': groups_affected,
                'records_to_delete': len(to_delete_ids),
                'records_deleted': deleted,
                'message': (
                    f'预计删除 {len(to_delete_ids)} 条重复记录（{groups_affected} 个重复组）'
                    if dry_run else
                    f'已删除 {deleted} 条重复记录'
                ),
            },
        }
    except Exception as e:
        return {'code': 500, 'msg': f'去重操作失败：{e}', 'data': None}


@router.post('/ingest/run-pipeline', summary='触发知识入库 Pipeline', response={200: dict, 401: dict, 403: dict})
@require_permission('knowledge.manage.write')
def ingest_run_pipeline(request):
    """
    将 PersonalContext 中指定来源类型的数据批量提交到知识入库 Pipeline。

    请求体：
      {
        "source_types": ["mail", "im", "doc"],  // 不传则处理全部
        "limit": 50,                             // 每次批量数量（默认 20，最大 200）
        "dry_run": true                          // 仅统计待入库数量，不实际执行
      }

    注意：生产环境推荐通过 Celery 异步任务执行，此端点用于手动补录和测试。
    """
    import json
    from apps.knowledge.guards import KnowledgeAssetGuard, KnowledgeWriteDisabled

    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}

    source_types = body.get('source_types') or None
    limit = min(int(body.get('limit', 20)), 200)
    dry_run = body.get('dry_run', True)

    if not dry_run:
        try:
            KnowledgeAssetGuard.guard_create_entry()
        except KnowledgeWriteDisabled:
            return 403, {
                'code': 403,
                'msg': '知识资产写保护已启用（KNOWLEDGE_WRITE_ENABLED=false），无法写入知识条目。',
                'data': None,
            }

    try:
        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry

        # 找出尚未入库的 PersonalContext（source_key 未出现在 KnowledgeEntry 中）
        existing_keys = set(
            KnowledgeEntry.objects.filter(source_type='personal_context')
            .values_list('source_key', flat=True)
        )

        qs = PersonalContext.objects.exclude(raw_content='').exclude(content_hash='')
        if source_types:
            qs = qs.filter(source_type__in=source_types)

        # 排除已入库的（用 source_id 作为 source_key）
        pending_all = [
            pc for pc in qs.order_by('created_at')
            if str(pc.id) not in existing_keys and pc.content_hash not in existing_keys
        ]
        pending_count = len(pending_all)
        batch = pending_all[:limit]

        if dry_run or not batch:
            return {
                'code': 200,
                'msg': 'OK',
                'data': {
                    'dry_run': dry_run,
                    'pending_total': pending_count,
                    'batch_size': len(batch),
                    'source_types': source_types or 'all',
                    'message': f'待入库 {pending_count} 条，本批次将处理 {len(batch)} 条（dry_run 模式，未实际执行）',
                    'jobs': [],
                },
            }

        # 实际执行 Pipeline
        from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput
        SUCCESS_TYPES = {
            'mail': 'feishu_mail', 'im': 'im_message', 'doc': 'feishu_doc',
            'wiki': 'feishu_wiki', 'calendar': 'calendar_event', 'task': 'feishu_task',
            'approval': 'feishu_approval', 'sheet': 'feishu_sheet',
        }
        jobs = []
        for pc in batch:
            entry_type = SUCCESS_TYPES.get(pc.source_type, pc.source_type)
            raw = RawKnowledgeInput(
                content=pc.raw_content or pc.summary,
                title=pc.summary[:80] if pc.summary else f'{pc.source_type}-{pc.source_id}',
                entry_type=entry_type,
                source_type='personal_context',
                source_key=pc.content_hash or str(pc.id),
                source_id=pc.id,
                namespace='cnkis',
            )
            try:
                result = run_pipeline(raw)
                jobs.append({
                    'personal_context_id': pc.id,
                    'source_type': pc.source_type,
                    'entry_id': result.entry_id,
                    'status': 'success' if result.entry_id else 'skipped',
                    'stages_failed': result.stages_failed,
                })
            except Exception as e:
                jobs.append({
                    'personal_context_id': pc.id,
                    'source_type': pc.source_type,
                    'entry_id': None,
                    'status': 'error',
                    'error': str(e),
                })

        success = sum(1 for j in jobs if j['status'] == 'success')
        skipped = sum(1 for j in jobs if j['status'] == 'skipped')
        errors = sum(1 for j in jobs if j['status'] == 'error')

        # 写操作审计日志（GCP 数据完整性要求）
        try:
            from apps.identity.decorators import _get_account_from_request
            from apps.audit.services import log_audit
            _acct = _get_account_from_request(request)
            if _acct:
                log_audit(
                    account_id=_acct.id,
                    account_name=_acct.display_name or _acct.username,
                    action='CREATE',
                    resource_type='knowledge_entry',
                    resource_id='run_pipeline',
                    description=f'知识入库 Pipeline：成功 {success}，跳过 {skipped}，失败 {errors}（source_types={source_types or "all"}）',
                    new_value={'success': success, 'skipped': skipped, 'errors': errors,
                               'source_types': source_types, 'batch_size': len(batch)},
                )
        except Exception:
            pass

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'dry_run': False,
                'pending_total': pending_count,
                'batch_size': len(batch),
                'source_types': source_types or 'all',
                'success': success,
                'skipped': skipped,
                'errors': errors,
                'message': f'入库完成：成功 {success}，跳过 {skipped}，失败 {errors}',
                'jobs': jobs[:50],  # 最多返回前50条详情
            },
        }

    except Exception as e:
        return {'code': 500, 'msg': f'Pipeline 执行失败：{e}', 'data': None}


@router.get('/ingest/pending-entries', summary='待向量化知识条目', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['system.role.read', 'knowledge.manage.write'])
def ingest_pending_entries(request, page: int = 1, page_size: int = 20, index_status: str = ''):
    """
    返回 index_status = pending 或 failed 的知识条目列表，
    这些条目已入库但尚未完成向量化索引。
    """
    try:
        from apps.knowledge.models import KnowledgeEntry
        qs = KnowledgeEntry.objects.all()
        if index_status:
            qs = qs.filter(index_status=index_status)
        else:
            qs = qs.filter(index_status__in=['pending', 'failed'])

        total = qs.count()
        offset = (page - 1) * page_size
        items = list(qs.order_by('create_time')[offset:offset + page_size])

        data = [
            {
                'id': e.id,
                'title': e.title,
                'entry_type': e.entry_type,
                'source_type': e.source_type,
                'index_status': e.index_status,
                'status': e.status,
                'quality_score': e.quality_score,
                'created_at': e.create_time.isoformat() if hasattr(e, 'create_time') and e.create_time else None,
            }
            for e in items
        ]
        return {'code': 200, 'msg': 'OK', 'data': {'items': data, 'total': total, 'page': page, 'page_size': page_size}}
    except Exception as e:
        return {'code': 500, 'msg': f'查询失败：{e}', 'data': None}


# ────────────────────────────────────────────────────────────
# Wave 5：数据分类分级查询端点
# ────────────────────────────────────────────────────────────

@router.get('/classification/registry', summary='六维度分类注册表', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def classification_registry(request):
    """
    返回所有 27 张核心表的完整六维度分类信息，供 ClassificationPage 展示。
    每条记录包含：security_level / criticality / regulatory_categories /
    freshness_sla / retention_years / data_owner_role / pseudonymized
    """
    from apps.knowledge.classification import ClassificationRegistry, DATA_CLASSIFICATION_REGISTRY

    data = {}
    for table_name, dc in DATA_CLASSIFICATION_REGISTRY.items():
        data[table_name] = {
            'security_level': dc.security_level,
            'criticality': dc.criticality,
            'regulatory_categories': list(dc.regulatory_categories),
            'freshness_sla': dc.freshness_sla,
            'retention_years': dc.retention_years,
            'retention_display': dc.retention_display(),
            'data_owner_role': dc.data_owner_role,
            'pseudonymized': dc.pseudonymized,
            'is_phi': dc.is_phi(),
            'has_gcp_pi_conflict': dc.has_gcp_pi_conflict(),
            'requires_pseudonymization': dc.requires_pseudonymization(),
        }

    summary = {
        'total': len(data),
        'sec4_count': sum(1 for v in data.values() if v['security_level'] == 'SEC-4'),
        'sec3_count': sum(1 for v in data.values() if v['security_level'] == 'SEC-3'),
        'sec2_count': sum(1 for v in data.values() if v['security_level'] == 'SEC-2'),
        'sec1_count': sum(1 for v in data.values() if v['security_level'] == 'SEC-1'),
        'crit_a_count': sum(1 for v in data.values() if v['criticality'] == 'CRIT-A'),
        'gcp_count': sum(1 for v in data.values() if 'REG-GCP' in v['regulatory_categories']),
        'gcp_pi_conflict_count': sum(1 for v in data.values() if v['has_gcp_pi_conflict']),
    }

    return {'code': 200, 'msg': 'OK', 'data': {'tables': data, 'summary': summary}}


@router.get('/classification/compliance-check', summary='分类合规度检查', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def classification_compliance_check(request):
    """
    返回分类合规度检查结果：
    - GCP+PIPL 冲突表清单（需假名化）
    - 待完成假名化的表
    - 各分级数量统计
    - 合规问题列表
    """
    from apps.knowledge.classification import ClassificationRegistry

    summary = ClassificationRegistry.compliance_summary()
    return {'code': 200, 'msg': 'OK', 'data': summary}


@router.get('/knowledge-sources', summary='知识来源注册表列表', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def list_knowledge_sources(request, active_only: bool = True):
    """
    返回知识源注册表中所有来源的配置信息，供洞明数据台「知识来源管理」页使用。

    Query params:
      active_only=true（默认）：只返回激活的来源
      active_only=false：返回全部来源
    """
    from apps.knowledge.source_registry import KnowledgeSourceRegistry

    _SOURCE_TYPE_DISPLAY = {
        'rss': 'RSS 订阅',
        'pdf': 'PDF 文档',
        'api': '外部 API',
        'feishu_api': '飞书 API',
        'manual': '手动导入',
        'n8n': 'n8n 工作流',
    }

    def _derive_status(source) -> str:
        """根据来源配置推导状态标签。"""
        if not source.is_active:
            return 'inactive'
        if source.last_fetched_at:
            return 'active'
        if source.fetch_schedule:
            return 'pending_setup'
        return 'active'

    def _to_frontend(source) -> dict:
        """将 KnowledgeSource dataclass 转换为前端期望的字段格式。"""
        return {
            'source_id': source.source_id,
            'name': source.name,
            'description': source.description,
            'source_type': source.source_type,
            'source_type_display': _SOURCE_TYPE_DISPLAY.get(source.source_type, source.source_type),
            'entry_type': source.entry_type,
            'namespace': source.namespace,
            'url': source.url,
            'fetch_schedule': source.fetch_schedule or '手动触发',
            'owner_role': source.owner_role,
            'quality_threshold': source.quality_threshold,
            'active': source.is_active,
            'is_active': source.is_active,
            'tags': source.tags,
            'last_fetch_at': source.last_fetched_at.isoformat() if source.last_fetched_at else None,
            'last_fetched_at': source.last_fetched_at.isoformat() if source.last_fetched_at else None,
            'last_entry_count': source.last_entry_count,
            'status': _derive_status(source),
        }

    sources = KnowledgeSourceRegistry.list_active() if active_only else KnowledgeSourceRegistry.list_all()
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'sources': [_to_frontend(s) for s in sources],
            'total': len(sources),
        },
    }


# ────────────────────────────────────────────────────────────
# Wave 7：知识图谱可视化 API（Task 7-1）
# ────────────────────────────────────────────────────────────

@router.get('/knowledge-graph/nodes', summary='知识图谱节点列表', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def knowledge_graph_nodes(
    request,
    namespace: str = '',
    entity_type: str = '',
    limit: int = 200,
):
    """
    返回知识图谱节点列表，用于 ReactFlow 渲染。

    Query params:
      namespace  （可选）按命名空间过滤，如 cnkis / nmpa_regulation / cdisc_sdtm
      entity_type（可选）按实体类型过滤
      limit      最大返回节点数（默认 200，最大 500）

    节点格式（ReactFlow 兼容）：
      {id, data: {label, entity_type, namespace, definition}, position: {x, y}}
    """
    from apps.knowledge.models import KnowledgeEntity
    import math

    limit = min(limit, 500)
    qs = KnowledgeEntity.objects.filter(is_deleted=False)
    if namespace:
        qs = qs.filter(namespace=namespace)
    if entity_type:
        qs = qs.filter(entity_type=entity_type)

    total = qs.count()
    entities = list(qs.only('id', 'entity_type', 'label', 'label_en', 'namespace', 'definition')[:limit])

    # 按 namespace 分组计算层次布局（圆形分布）
    ns_groups: dict[str, list] = {}
    for e in entities:
        ns_groups.setdefault(e.namespace or 'default', []).append(e)

    nodes = []
    ns_keys = list(ns_groups.keys())
    for ns_idx, ns in enumerate(ns_keys):
        group = ns_groups[ns]
        # 每个 namespace 一圈，圈半径随成员数增大
        radius = max(150, 60 * math.ceil(math.sqrt(len(group))))
        center_x = 600 * ns_idx
        center_y = 0
        for i, e in enumerate(group):
            angle = (2 * math.pi * i) / max(len(group), 1)
            x = round(center_x + radius * math.cos(angle), 1)
            y = round(center_y + radius * math.sin(angle), 1)
            nodes.append({
                'id': str(e.id),
                'type': 'default',
                'data': {
                    'label': e.label or e.label_en or f'#{e.id}',
                    'label_en': e.label_en or '',
                    'entity_type': e.entity_type,
                    'namespace': e.namespace or 'default',
                    'definition': (e.definition or '')[:120],
                },
                'position': {'x': x, 'y': y},
            })

    # namespace 统计（供图例显示）
    ns_stats = {ns: len(group) for ns, group in ns_groups.items()}

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'nodes': nodes,
            'total': total,
            'returned': len(nodes),
            'namespace_stats': ns_stats,
        },
    }


@router.get('/knowledge-graph/edges', summary='知识图谱关系边', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def knowledge_graph_edges(
    request,
    namespace: str = '',
    relation_type: str = '',
    entity_ids: str = '',
    limit: int = 500,
):
    """
    返回知识图谱边（关系）列表，用于 ReactFlow 渲染。

    Query params:
      namespace      过滤主体/客体的命名空间
      relation_type  关系类型（如 is_measured_by / validates）
      entity_ids     逗号分隔的实体 ID，只返回这些节点的关系边
      limit          最大返回边数（默认 500，最大 1000）

    边格式（ReactFlow 兼容）：
      {id, source, target, label, data: {relation_type, confidence}}
    """
    from apps.knowledge.models import KnowledgeRelation, KnowledgeEntity
    from django.db.models import Q

    limit = min(limit, 1000)
    qs = KnowledgeRelation.objects.filter(is_deleted=False).select_related('subject', 'object')

    if entity_ids:
        ids = [int(i) for i in entity_ids.split(',') if i.strip().isdigit()]
        if ids:
            qs = qs.filter(Q(subject_id__in=ids) | Q(object_id__in=ids))

    if namespace:
        qs = qs.filter(
            Q(subject__namespace=namespace) | Q(object__namespace=namespace)
        )
    if relation_type:
        qs = qs.filter(relation_type=relation_type)

    # 关系类型标签映射
    REL_LABELS = {
        'is_measured_by': '测量方式',
        'validates': '验证',
        'requires': '依赖',
        'part_of': '属于',
        'subclass_of': '子类',
        'related_to': '相关',
        'contradicts': '矛盾',
        'supports': '支持',
        'references': '引用',
        'is_a': '是',
        'has_property': '属性',
    }

    edges = []
    for r in qs[:limit]:
        edges.append({
            'id': f'e{r.id}',
            'source': str(r.subject_id),
            'target': str(r.object_id),
            'label': REL_LABELS.get(r.relation_type, r.relation_type),
            'data': {
                'relation_type': r.relation_type,
                'confidence': r.confidence,
                'source': r.source or '',
            },
        })

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'edges': edges,
            'total': len(edges),
        },
    }


@router.get('/catalog/schema', summary='数据目录实时 Schema', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def catalog_schema(request):
    """
    从 Django 的 migration 元数据（app.models）读取各核心表的实际字段信息，
    返回供 CatalogPage 使用的活数据。

    响应包含：
      - 各表的字段列表（名称、类型、是否可空、帮助文本）
      - 实际行数（若表已存在）
      - 六维分类标签（来自 ClassificationRegistry）
    """
    from django.apps import apps as django_apps
    from django.db import connection
    from apps.knowledge.classification import DATA_CLASSIFICATION_REGISTRY

    # 目录中的核心表与 Django model 对应关系
    TABLE_TO_MODEL: dict[str, str] = {
        't_protocol': 'protocol.Protocol',
        't_subject': 'subject.Subject',
        't_crf_record': 'edc.CRFRecord',
        't_visit_plan': 'visit.VisitPlan',
        't_visit_node': 'visit.VisitNode',
        't_work_order': 'workorder.WorkOrder',
        't_knowledge_entry': 'knowledge.KnowledgeEntry',
        't_knowledge_entity': 'knowledge.KnowledgeEntity',
        't_knowledge_relation': 'knowledge.KnowledgeRelation',
        't_ekb_raw_record': 'ekuaibao_integration.EkbRawRecord',
        't_personal_context': 'secretary.PersonalContext',
        't_audit_log': 'audit.AuditLog',
        't_account': 'identity.Account',
        't_feishu_user_token': 'identity.FeishuUserToken',
        't_agent_definition': 'agent_gateway.AgentDefinition',
        't_agent_knowledge_domain': 'agent_gateway.AgentKnowledgeDomain',
        # 财务域（finance app）
        't_quote': 'finance.Quote',
        't_contract': 'finance.Contract',
        't_invoice': 'finance.Invoice',
        't_payment': 'finance.Payment',
        # 人事域（hr app）
        't_staff': 'hr.Staff',
        't_staff_qualification': 'hr.HrStaffCertificate',  # 最近资质表（t_hr_staff_certificate）
    }

    def _field_info(field) -> Optional[dict]:
        try:
            return {
                'name': field.name,
                'type': field.get_internal_type(),
                'null': getattr(field, 'null', False),
                'help_text': str(field.help_text) if getattr(field, 'help_text', '') else '',
                'db_column': getattr(field, 'column', field.name),
            }
        except Exception:
            return None

    def _row_count(table_name: str) -> Optional[int]:
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT COUNT(*) FROM {table_name}')
                return cursor.fetchone()[0]
        except Exception:
            return None

    result = {}
    for table_name, model_path in TABLE_TO_MODEL.items():
        app_label, model_name = model_path.split('.')
        try:
            model = django_apps.get_model(app_label, model_name)
            fields = [fi for f in model._meta.get_fields()
                      if hasattr(f, 'get_internal_type')
                      for fi in [_field_info(f)] if fi is not None]
        except Exception:
            fields = []

        classification = {}
        if table_name in DATA_CLASSIFICATION_REGISTRY:
            dc = DATA_CLASSIFICATION_REGISTRY[table_name]
            classification = {
                'security_level': dc.security_level,
                'criticality': dc.criticality,
                'regulatory_categories': list(dc.regulatory_categories),
                'data_owner_role': dc.data_owner_role,
                'is_phi': dc.is_phi(),
                'has_gcp_pi_conflict': dc.has_gcp_pi_conflict(),
            }

        result[table_name] = {
            'fields': fields,
            'field_count': len(fields),
            'row_count': _row_count(table_name),
            'classification': classification,
        }

    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────────────────────
# 运维监控 API（Pipelines / Storage / Topology）
# ────────────────────────────────────────────────────────────────────────────

@router.get('/pipelines/schedule', summary='Celery Beat 任务调度表', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def pipelines_schedule(request):
    """
    返回 Celery Beat 完整调度表，含每个任务的名称、调度配置、类别和上次执行记录。
    从 celery_config.beat_schedule 中读取（无需连接 Celery，纯配置读取）。
    """
    from config import celery_config as cc
    import re

    beat_schedule = getattr(cc, 'beat_schedule', {})

    CAT_MAP = {
        'notification': '通知推送',
        'finance': '财务运营',
        'hr': '人事管理',
        'quality': '质量合规',
        'lab_personnel': '人员管理',
        'knowledge': '知识治理',
        'feishu': '飞书集成',
        'agent': 'AI / 智能体',
        'memory': '记忆管理',
        'recruitment': '招募管理',
        'send': '推送任务',
        'data': '数据治理',
    }

    def _categorize(task_id: str, task_name: str) -> str:
        tid = task_id.lower()
        tn = task_name.lower().split('.')[-2] if '.' in task_name else task_name
        for k, v in CAT_MAP.items():
            if k in tid or k in tn:
                return v
        return '系统运维'

    def _crontab_to_human(schedule) -> str:
        """将 crontab 对象转为可读字符串。"""
        try:
            s = str(schedule)
            if 'crontab' in s.lower():
                return s
            return repr(schedule)
        except Exception:
            return str(schedule)

    # 尝试读取最近一次审计日志来推断上次执行（部分任务会写日志）
    def _last_run_hint(task_name: str) -> Optional[str]:
        try:
            from apps.audit.models import AuditLog
            hint = AuditLog.objects.filter(
                description__icontains=task_name.split('.')[-1].replace('_', ' ')
            ).order_by('-create_time').first()
            if hint:
                return hint.create_time.isoformat()
        except Exception:
            pass
        return None

    items = []
    for task_id, config in beat_schedule.items():
        task_name = config.get('task', '')
        schedule = config.get('schedule')
        items.append({
            'id': task_id,
            'task': task_name,
            'category': _categorize(task_id, task_name),
            'schedule_human': _crontab_to_human(schedule),
            'enabled': not config.get('enabled') == False,
            'last_run_hint': _last_run_hint(task_name),
        })

    # 按类别排序
    items.sort(key=lambda x: (x['category'], x['id']))

    return {'code': 200, 'msg': 'OK', 'data': {
        'tasks': items,
        'total': len(items),
    }}


@router.get('/storage/stats', summary='存储指标（DB大小/Redis/Qdrant）', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def storage_stats(request):
    """
    返回各数据存储组件的实时指标：
    - PostgreSQL：数据库大小、各核心表行数
    - Redis：已用内存、已连接客户端数
    - Qdrant：向量集合列表和向量数
    """
    from django.db import connection as db_conn

    result = {
        'postgres': {'status': 'unknown', 'db_size': None, 'db_size_human': None, 'tables': []},
        'redis':    {'status': 'unknown', 'used_memory_human': None, 'connected_clients': None},
        'qdrant':   {'status': 'unknown', 'collections': []},
    }

    # PostgreSQL
    try:
        with db_conn.cursor() as cursor:
            # 数据库总大小
            cursor.execute("SELECT pg_size_pretty(pg_database_size(current_database())), pg_database_size(current_database())")
            row = cursor.fetchone()
            if row:
                result['postgres']['db_size_human'] = row[0]
                result['postgres']['db_size'] = row[1]

            # 核心表行数
            core_tables = [
                't_audit_log', 't_subject', 't_knowledge_entry', 't_personal_context',
                't_ekb_raw_record', 't_protocol', 't_crf_record',
                't_knowledge_entity', 't_knowledge_relation',
                't_data_quality_rule', 't_data_quality_alert',
                't_protocol_version',
            ]
            table_stats = []
            for tbl in core_tables:
                try:
                    cursor.execute(
                        "SELECT reltuples::bigint FROM pg_class WHERE relname = %s",
                        [tbl],
                    )
                    r = cursor.fetchone()
                    table_stats.append({'table': tbl, 'approx_rows': int(r[0]) if r and r[0] else 0})
                except Exception:
                    table_stats.append({'table': tbl, 'approx_rows': None})

            result['postgres']['tables'] = table_stats
            result['postgres']['status'] = 'healthy'
    except Exception as exc:
        result['postgres']['error'] = str(exc)

    # Redis
    try:
        import django.core.cache as cache_module
        from django.conf import settings
        import redis as redis_lib

        redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
        r = redis_lib.from_url(redis_url, socket_connect_timeout=3)
        info = r.info('memory', 'clients')
        result['redis']['used_memory_human'] = info.get('used_memory_human')
        result['redis']['connected_clients'] = info.get('connected_clients')
        result['redis']['status'] = 'healthy'
    except Exception as exc:
        result['redis']['status'] = 'error'
        result['redis']['error'] = str(exc)[:100]

    # Qdrant（通过 HTTP REST，与 libs/mcp_client.py 保持一致，不依赖 qdrant-client SDK）
    try:
        import urllib.request
        import json as _json
        from django.conf import settings as dj_settings

        qdrant_url = getattr(dj_settings, 'QDRANT_URL', 'http://localhost:6333')
        base = qdrant_url.rstrip('/')

        with urllib.request.urlopen(f'{base}/collections', timeout=5) as resp:
            body = _json.loads(resp.read())

        collections_raw = body.get('result', {}).get('collections', [])
        collections_out = []
        for c in collections_raw:
            cname = c.get('name', '')
            try:
                with urllib.request.urlopen(f'{base}/collections/{cname}', timeout=5) as cr:
                    cinfo = _json.loads(cr.read())
                vectors_count = (
                    cinfo.get('result', {}).get('vectors_count')
                    or cinfo.get('result', {}).get('indexed_vectors_count')
                    or 0
                )
            except Exception:
                vectors_count = None
            collections_out.append({'name': cname, 'vectors': vectors_count})

        result['qdrant']['collections'] = collections_out
        result['qdrant']['status'] = 'healthy'
    except Exception as exc:
        result['qdrant']['status'] = 'error'
        result['qdrant']['error'] = str(exc)[:100]

    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/topology/health', summary='服务拓扑健康探针', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def topology_health(request):
    """
    对系统各关键组件进行连通性探针，返回实时健康状态。
    探针超时：每个组件 3 秒。
    """
    import socket
    from django.db import connection as db_conn

    probes = {}

    # PostgreSQL
    try:
        with db_conn.cursor() as cursor:
            cursor.execute("SELECT 1")
        probes['postgres'] = {'status': 'healthy', 'latency_hint': 'ok'}
    except Exception as exc:
        probes['postgres'] = {'status': 'error', 'error': str(exc)[:100]}

    # Redis
    try:
        import redis as redis_lib
        from django.conf import settings as dj_settings
        redis_url = getattr(dj_settings, 'REDIS_URL', 'redis://localhost:6379/0')
        r = redis_lib.from_url(redis_url, socket_connect_timeout=3)
        r.ping()
        probes['redis'] = {'status': 'healthy'}
    except Exception as exc:
        probes['redis'] = {'status': 'error', 'error': str(exc)[:100]}

    # Qdrant（TCP 连通性）
    try:
        from django.conf import settings as dj_settings
        qdrant_url = getattr(dj_settings, 'QDRANT_URL', 'http://localhost:6333')
        host = qdrant_url.replace('http://', '').replace('https://', '').split(':')[0]
        port = int(qdrant_url.split(':')[-1]) if ':' in qdrant_url else 6333
        sock = socket.create_connection((host, port), timeout=3)
        sock.close()
        probes['qdrant'] = {'status': 'healthy'}
    except Exception as exc:
        probes['qdrant'] = {'status': 'error', 'error': str(exc)[:100]}

    # Celery（通过 Redis 队列探针）
    try:
        import redis as redis_lib
        from django.conf import settings as dj_settings
        redis_url = getattr(dj_settings, 'REDIS_URL', 'redis://localhost:6379/0')
        r = redis_lib.from_url(redis_url, socket_connect_timeout=3)
        # Celery 默认队列深度
        q_len = r.llen('celery')
        probes['celery_broker'] = {'status': 'healthy', 'queue_depth': q_len}
    except Exception as exc:
        probes['celery_broker'] = {'status': 'error', 'error': str(exc)[:100]}

    overall = 'healthy' if all(p.get('status') == 'healthy' for p in probes.values()) else 'degraded'
    return {'code': 200, 'msg': 'OK', 'data': {
        'overall': overall,
        'probes': probes,
    }}


@router.get('/backup/status', summary='备份文件状态检查', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def backup_status(request):
    """
    扫描备份目录，返回最近备份文件清单与时间戳。
    备份目录：/opt/cn-kis-v2/backup/db/ (PostgreSQL dump)
    也检查 WAL 归档和 Redis RDB 快照。
    """
    import os
    import glob
    from datetime import datetime, timezone

    def _scan_dir(path_pattern, label):
        files = sorted(glob.glob(path_pattern), key=os.path.getmtime, reverse=True)
        if not files:
            return {'label': label, 'found': 0, 'latest': None, 'size_mb': None, 'status': 'no_backup'}
        latest = files[0]
        stat = os.stat(latest)
        age_hours = (datetime.now(timezone.utc).timestamp() - stat.st_mtime) / 3600
        size_mb = round(stat.st_size / 1024 / 1024, 1)
        return {
            'label': label,
            'found': len(files),
            'latest': os.path.basename(latest),
            'latest_mtime': datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            'age_hours': round(age_hours, 1),
            'size_mb': size_mb,
            'status': 'ok' if age_hours < 26 else 'stale',
        }

    items = [
        _scan_dir('/var/backups/cn-kis-pg/*.dump.gz', 'PostgreSQL 备份（pg_backup.sh）'),
        _scan_dir('/var/lib/redis/dump.rdb', 'Redis RDB 快照'),
    ]

    # 尝试读取 pg_backup.sh 写入的机器可读状态文件
    backup_status_file = os.getenv(
        'PG_BACKUP_STATUS_FILE', '/var/backups/cn-kis-pg/.backup_status.json'
    )
    pg_backup_meta = None
    try:
        import json as _json
        if os.path.exists(backup_status_file):
            with open(backup_status_file, 'r', encoding='utf-8') as _f:
                pg_backup_meta = _json.load(_f)
    except Exception:
        pass

    has_ok = any(i['status'] == 'ok' for i in items)
    has_stale = any(i['status'] == 'stale' for i in items)

    overall = 'ok' if has_ok else ('stale' if has_stale else 'no_backup')

    return {'code': 200, 'msg': 'OK', 'data': {
        'overall': overall,
        'items': items,
        'pg_backup_script_status': pg_backup_meta,
        'backup_dir': '/var/backups/cn-kis-pg/',
        'note': '仅列出服务器本地备份文件；备份脚本：ops/scripts/pg_backup.sh（每日凌晨2:30 crontab执行）',
    }}


# ────────────────────────────────────────────────────────────────────────────
# 外部数据接入治理总览（委托 data_intake 模块）
# ────────────────────────────────────────────────────────────────────────────

@router.get('/intake-overview', summary='外部数据接入治理总览', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['system.role.read', 'knowledge.manage.write', 'data_intake.manage'])
def intake_overview(request):
    """
    返回跨工作台外部数据接入状态汇总，供洞明数据台 ExternalIntakePage 使用。

    数据来自 t_ext_ingest_candidate，委托 data_intake.api 的 governance_summary 逻辑。
    """
    try:
        from apps.data_intake.models import ExternalDataIngestCandidate, ReviewStatus, TargetWorkstation
        from django.db.models import Count, Avg
        from django.utils import timezone as tz
        from datetime import timedelta

        all_qs = ExternalDataIngestCandidate.objects.all()

        ws_stats = {}
        for ws_row in (
            all_qs.values('target_workstation', 'review_status')
            .annotate(cnt=Count('id'))
        ):
            ws = ws_row['target_workstation']
            status = ws_row['review_status']
            ws_stats.setdefault(ws, {})
            ws_stats[ws][status] = ws_row['cnt']

        for ws_value in TargetWorkstation.values:
            ws_stats.setdefault(ws_value, {})
            for s in ReviewStatus.values:
                ws_stats[ws_value].setdefault(s, 0)

        source_stats = dict(
            all_qs.values('source_type')
            .annotate(cnt=Count('id'))
            .values_list('source_type', 'cnt')
        )

        high_conf_pending = all_qs.filter(
            review_status=ReviewStatus.PENDING,
            confidence_score__gte=0.8,
        ).count()

        seven_days_ago = tz.now() - timedelta(days=7)
        recent_trend = list(
            all_qs.filter(
                review_status__in=(ReviewStatus.INGESTED, ReviewStatus.AUTO_INGESTED),
                updated_at__gte=seven_days_ago,
            )
            .extra(select={'day': "DATE(updated_at)"})
            .values('day')
            .annotate(cnt=Count('id'))
            .order_by('day')
        )

        total = all_qs.count()
        pending_total = all_qs.filter(review_status=ReviewStatus.PENDING).count()
        ingested_total = all_qs.filter(
            review_status__in=(ReviewStatus.INGESTED, ReviewStatus.AUTO_INGESTED)
        ).count()
        avg_conf = all_qs.aggregate(avg=Avg('confidence_score'))['avg'] or 0.0

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'total_candidates': total,
                'pending_total': pending_total,
                'ingested_total': ingested_total,
                'high_confidence_pending': high_conf_pending,
                'avg_confidence': round(avg_conf, 3),
                'by_workstation': ws_stats,
                'by_source_type': source_stats,
                'recent_ingested_trend': [
                    {'day': str(r['day']), 'count': r['cnt']}
                    for r in recent_trend
                ],
            },
        }
    except Exception as exc:
        return {'code': 500, 'msg': f'接入治理汇总失败：{exc}', 'data': None}


# ────────────────────────────────────────────────────────────────────────────
# 治理台全局候选生成（不绑定特定工作台）
# ────────────────────────────────────────────────────────────────────────────

@router.post('/candidates/populate-all', summary='治理台全局候选记录生成', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data_intake.candidate.manage', 'system.admin', 'system.role.manage', 'knowledge.manage.write'])
def candidates_populate_all(request):
    """
    从所有外部原始层（LIMS / 易快报 / 飞书）生成接入候选记录。

    此端点供洞明·数据台治理页使用，不绑定任何特定工作台，
    内部由 CandidatePopulator 根据路由规则将候选分配给各目标工作台。

    请求体（可选）：
      {
        "source_type": "lims|ekuaibao|feishu_mail|…",  // 不传则全部来源
        "limit": 500
      }
    """
    import json as _json
    try:
        body = _json.loads(request.body or '{}')
    except Exception:
        body = {}

    source_type = body.get('source_type', '')
    limit = min(int(body.get('limit', 500)), 2000)

    try:
        from apps.data_intake.services import CandidatePopulator
        populator = CandidatePopulator()
        results = {}

        if not source_type or source_type == 'lims':
            results['lims'] = populator.populate_from_lims(limit=limit)

        if not source_type or source_type == 'ekuaibao':
            results['ekuaibao'] = populator.populate_from_ekb(limit=limit)

        if not source_type or source_type in (
            'feishu_mail', 'feishu_im', 'feishu_doc', 'feishu_approval'
        ):
            feishu_types = [source_type] if source_type else None
            results['feishu'] = populator.populate_from_feishu(limit=limit, source_types=feishu_types)

        total_created = sum(r.get('created', 0) for r in results.values())

        # 写操作审计日志（GCP 数据完整性要求）
        try:
            from apps.identity.decorators import _get_account_from_request
            from apps.audit.services import log_audit
            _acct = _get_account_from_request(request)
            if _acct:
                log_audit(
                    account_id=_acct.id,
                    account_name=_acct.display_name or _acct.username,
                    action='CREATE',
                    resource_type='ext_ingest_candidate',
                    resource_id='populate_all',
                    description=f'全局候选记录生成：新建 {total_created} 条（source_type={source_type or "all"}）',
                    new_value={'total_created': total_created, 'source_type': source_type or 'all',
                               'results_by_source': {k: v.get('created', 0) for k, v in results.items()}},
                )
        except Exception:
            pass

        return {
            'code': 200,
            'msg': 'OK',
            'data': {
                'total_created': total_created,
                'results_by_source': results,
                'message': f'候选记录生成完成，共新建 {total_created} 条',
            },
        }
    except Exception as exc:
        return {'code': 500, 'msg': f'候选生成失败：{exc}', 'data': None}


# ────────────────────────────────────────────────────────────────────────────
# 冲突治理汇总（LIMS + 易快报）
# ────────────────────────────────────────────────────────────────────────────

@router.get('/conflicts/summary', summary='数据冲突治理汇总', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['system.role.read', 'knowledge.manage.write', 'data_intake.manage'])
def conflicts_summary(request):
    """
    返回跨来源的数据冲突治理汇总：
    - LIMS 冲突总数 / 待审核 / 已解决
    - 易快报冲突总数 / 待审核 / 已解决
    - 按冲突类型分布
    - 最近 10 条未解决冲突摘要
    """
    result = {
        'lims': {'total': 0, 'pending': 0, 'resolved': 0, 'by_type': {}},
        'ekuaibao': {'total': 0, 'pending': 0, 'resolved': 0, 'by_type': {}},
        'recent_pending': [],
    }

    # LIMS 冲突
    try:
        from apps.lims_integration.models import LimsConflict, ConflictResolution
        from django.db.models import Count
        lims_total = LimsConflict.objects.count()
        lims_pending = LimsConflict.objects.filter(resolution='pending').count()
        by_type = dict(
            LimsConflict.objects.values('conflict_type')
            .annotate(cnt=Count('id'))
            .values_list('conflict_type', 'cnt')
        )
        result['lims'] = {
            'total': lims_total,
            'pending': lims_pending,
            'resolved': lims_total - lims_pending,
            'by_type': by_type,
        }
        recent = list(
            LimsConflict.objects.filter(resolution='pending')
            .order_by('-create_time')[:5]
            .values('id', 'module', 'lims_id', 'conflict_type', 'similarity_score', 'create_time')
        )
        for r in recent:
            r['create_time'] = r['create_time'].isoformat() if r['create_time'] else None
            r['source'] = 'lims'
        result['recent_pending'].extend(recent)
    except Exception:
        pass

    # 易快报冲突
    try:
        from apps.ekuaibao_integration.models import EkbConflict
        from django.db.models import Count
        ekb_total = EkbConflict.objects.count()
        ekb_pending = EkbConflict.objects.filter(resolution='pending').count()
        by_type = dict(
            EkbConflict.objects.values('conflict_type')
            .annotate(cnt=Count('id'))
            .values_list('conflict_type', 'cnt')
        )
        result['ekuaibao'] = {
            'total': ekb_total,
            'pending': ekb_pending,
            'resolved': ekb_total - ekb_pending,
            'by_type': by_type,
        }
        recent = list(
            EkbConflict.objects.filter(resolution='pending')
            .order_by('-create_time')[:5]
            .values('id', 'module', 'ekb_id', 'conflict_type', 'similarity_score', 'create_time')
        )
        for r in recent:
            r['create_time'] = r['create_time'].isoformat() if r['create_time'] else None
            r['source'] = 'ekuaibao'
        result['recent_pending'].extend(recent)
    except Exception:
        pass

    # 按时间倒序排列最近的冲突
    result['recent_pending'].sort(
        key=lambda x: x.get('create_time') or '', reverse=True
    )
    result['recent_pending'] = result['recent_pending'][:10]

    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────────────────────
# 原始来源治理接口
# ────────────────────────────────────────────────────────────────────────────

@router.get('/raw-sources/overview', summary='外部原始来源治理概览', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def raw_sources_overview(request):
    """
    返回各外部原始数据来源的治理统计：
    - LIMS：按模块分布、原始记录总数、注入状态
    - 易快报：按记录类型分布、原始记录总数
    - 飞书：按 source_type 分布（个人上下文）
    - 候选记录池总体状态（来自 ExternalDataIngestCandidate）
    """
    from django.db.models import Count

    result = {
        'lims': {'total': 0, 'by_module': {}, 'injection_status': {}},
        'ekuaibao': {'total': 0, 'by_record_type': {}},
        'feishu': {'total': 0, 'by_source_type': {}},
        'candidates': {'total': 0, 'pending': 0},
    }

    # LIMS 原始记录
    try:
        from apps.lims_integration.models import RawLimsRecord
        result['lims']['total'] = RawLimsRecord.objects.count()
        by_module = dict(
            RawLimsRecord.objects.values('module')
            .annotate(cnt=Count('id'))
            .values_list('module', 'cnt')
        )
        result['lims']['by_module'] = by_module
        injection_status = dict(
            RawLimsRecord.objects.values('injection_status')
            .annotate(cnt=Count('id'))
            .values_list('injection_status', 'cnt')
        )
        result['lims']['injection_status'] = injection_status
    except Exception:
        pass

    # 易快报原始记录
    try:
        from apps.ekuaibao_integration.models import EkbRawRecord
        result['ekuaibao']['total'] = EkbRawRecord.objects.count()
        by_type = dict(
            EkbRawRecord.objects.values('record_type')
            .annotate(cnt=Count('id'))
            .values_list('record_type', 'cnt')
        )
        result['ekuaibao']['by_record_type'] = by_type
    except Exception:
        pass

    # 飞书个人上下文
    try:
        from apps.secretary.models import PersonalContext
        result['feishu']['total'] = PersonalContext.objects.count()
        by_src = dict(
            PersonalContext.objects.values('source_type')
            .annotate(cnt=Count('id'))
            .values_list('source_type', 'cnt')
        )
        result['feishu']['by_source_type'] = by_src
    except Exception:
        pass

    # 候选记录池
    try:
        from apps.data_intake.models import ExternalDataIngestCandidate, ReviewStatus
        result['candidates']['total'] = ExternalDataIngestCandidate.objects.count()
        result['candidates']['pending'] = ExternalDataIngestCandidate.objects.filter(
            review_status=ReviewStatus.PENDING
        ).count()
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────────────────────
# Trace API — 对象级追溯链
# ────────────────────────────────────────────────────────────────────────────

@router.get('/trace/candidate/{candidate_id}', summary='接入候选追溯链', response={200: dict, 401: dict, 403: dict, 404: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def trace_candidate(request, candidate_id: int):
    """
    返回一条接入候选记录的完整追溯链：
    原始记录 → 候选 → 目标工作台接入结果

    用于生命周期滞留分析和数据接入审计。
    """
    try:
        from apps.data_intake.models import ExternalDataIngestCandidate
        candidate = ExternalDataIngestCandidate.objects.get(id=candidate_id)
    except ExternalDataIngestCandidate.DoesNotExist:
        return 404, {'code': 404, 'msg': f'候选记录不存在: {candidate_id}', 'data': None}

    trace = {
        'candidate_id': candidate.id,
        'source_type': candidate.source_type,
        'source_raw_id': candidate.source_raw_id,
        'source_module': candidate.source_module,
        'source_display_title': candidate.source_display_title,
        'confidence_score': candidate.confidence_score,
        'target_workstation': candidate.target_workstation,
        'target_model': candidate.target_model,
        'review_status': candidate.review_status,
        'reviewed_by_name': candidate.reviewed_by_name,
        'reviewed_at': candidate.reviewed_at.isoformat() if candidate.reviewed_at else None,
        'ingested_record_id': candidate.ingested_record_id,
        'ingested_model': candidate.ingested_model,
        'ingestion_log': candidate.ingestion_log,
        'created_at': candidate.created_at.isoformat() if candidate.created_at else None,
    }
    return {'code': 200, 'msg': 'OK', 'data': trace}


@router.get('/trace/personal-context/{pc_id}', summary='飞书上下文追溯链', response={200: dict, 401: dict, 403: dict, 404: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def trace_personal_context(request, pc_id: int):
    """
    追溯一条飞书上下文（PersonalContext）的转化链：
    PersonalContext → KnowledgeEntry（已入库时）
    PersonalContext → ExternalDataIngestCandidate（外部接入时）
    """
    try:
        from apps.secretary.models import PersonalContext
        pc = PersonalContext.objects.get(id=pc_id)
    except PersonalContext.DoesNotExist:
        return 404, {'code': 404, 'msg': f'PersonalContext 不存在: {pc_id}', 'data': None}

    result = {
        'pc_id': pc.id,
        'source_type': pc.source_type,
        'source_id': pc.source_id,
        'content_hash': pc.content_hash,
        'created_at': pc.created_at.isoformat() if pc.created_at else None,
        'knowledge_entries': [],
        'intake_candidates': [],
    }

    # 查找对应的 KnowledgeEntry
    try:
        from apps.knowledge.models import KnowledgeEntry
        entries = KnowledgeEntry.objects.filter(
            source_type='personal_context',
            source_key__in=[str(pc.id), pc.content_hash],
        ).values('id', 'title', 'entry_type', 'index_status', 'quality_score', 'create_time')
        result['knowledge_entries'] = [
            {**e, 'create_time': e['create_time'].isoformat() if e['create_time'] else None}
            for e in entries
        ]
    except Exception:
        pass

    # 查找对应的接入候选
    try:
        from apps.data_intake.models import ExternalDataIngestCandidate
        candidates = ExternalDataIngestCandidate.objects.filter(
            source_raw_id=pc.id,
        ).values('id', 'source_type', 'target_workstation', 'review_status', 'confidence_score', 'created_at')
        result['intake_candidates'] = [
            {**c, 'created_at': c['created_at'].isoformat() if c['created_at'] else None}
            for c in candidates
        ]
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────────────────────
# 生命周期滞留分析
# ────────────────────────────────────────────────────────────────────────────

@router.get('/lifecycle/stranded', summary='生命周期滞留对象分析', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def lifecycle_stranded(request):
    """
    分析各层滞留（未流转到下游）的数据对象数量：
    - raw 层：injection_status='pending' 且超过 7 天未处理的原始记录
    - staging 层：review_status='pending' 且超过 3 天未审核的候选记录
    - content 层：PersonalContext 未转化为 KnowledgeEntry 的记录
    - knowledge 层：index_status='pending' 或 'failed' 的知识条目
    """
    from django.utils import timezone as tz
    from datetime import timedelta

    now = tz.now()
    result = {
        'raw_stranded': {'lims': 0, 'ekuaibao': 0, 'threshold_days': 7},
        'staging_stranded': {'count': 0, 'threshold_days': 3},
        'content_to_knowledge_gap': {'total_pc': 0, 'ingested_to_knowledge': 0, 'gap': 0},
        'knowledge_pending_vectorization': {'pending': 0, 'failed': 0},
    }

    # raw 层滞留（LIMS）
    try:
        from apps.lims_integration.models import RawLimsRecord
        lims_stranded = RawLimsRecord.objects.filter(
            injection_status='pending',
            create_time__lt=now - timedelta(days=7),
        ).count()
        result['raw_stranded']['lims'] = lims_stranded
    except Exception:
        pass

    # staging 层滞留
    try:
        from apps.data_intake.models import ExternalDataIngestCandidate, ReviewStatus
        staging_stranded = ExternalDataIngestCandidate.objects.filter(
            review_status=ReviewStatus.PENDING,
            created_at__lt=now - timedelta(days=3),
        ).count()
        result['staging_stranded']['count'] = staging_stranded
    except Exception:
        pass

    # content → knowledge 转化缺口
    try:
        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry
        total_pc = PersonalContext.objects.count()
        existing_keys = set(
            KnowledgeEntry.objects.filter(source_type='personal_context')
            .values_list('source_key', flat=True)
        )
        ingested = PersonalContext.objects.exclude(content_hash='').filter(
            content_hash__in=existing_keys
        ).count() + PersonalContext.objects.filter(
            id__in=[int(k) for k in existing_keys if k.isdigit()]
        ).count()
        result['content_to_knowledge_gap'] = {
            'total_pc': total_pc,
            'ingested_to_knowledge': ingested,
            'gap': max(0, total_pc - ingested),
        }
    except Exception:
        pass

    # knowledge 层待向量化
    try:
        from apps.knowledge.models import KnowledgeEntry
        result['knowledge_pending_vectorization'] = {
            'pending': KnowledgeEntry.objects.filter(index_status='pending').count(),
            'failed': KnowledgeEntry.objects.filter(index_status='failed').count(),
        }
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': result}


# ────────────────────────────────────────────────────────────────────────────
# 治理缺口清单
# ────────────────────────────────────────────────────────────────────────────

@router.get('/governance/gaps', summary='治理缺口清单', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def governance_gaps(request):
    """
    返回当前数据治理缺口清单：
    - owner_gap: 缺少数据责任人的表
    - retention_gap: 保留期未定义的表
    - pseudonymization_gap: 需假名化但尚未完成的表
    - backup_gap: 备份超时（> 26h）的存储
    - vectorization_gap: 入库后长期未向量化的知识条目
    """
    from apps.knowledge.classification import ClassificationRegistry, DATA_CLASSIFICATION_REGISTRY

    gaps = []

    # 假名化缺口（最高优先级，合规强制）
    pseudo_pending = ClassificationRegistry.get_pending_pseudonymization()
    if pseudo_pending:
        gaps.append({
            'gap_type': 'pseudonymization_required',
            'severity': 'critical',
            'count': len(pseudo_pending),
            'affected': pseudo_pending,
            'message': f'{len(pseudo_pending)} 张表存在 GCP+PIPL 双重合规冲突，必须完成假名化设计',
            'action': '为 t_subject、t_enrollment、t_crf_record 设计假名化方案，将 PII 字段迁移至独立加密表',
        })

    # 知识向量化缺口
    try:
        from apps.knowledge.models import KnowledgeEntry
        pending_vec = KnowledgeEntry.objects.filter(index_status='pending').count()
        failed_vec = KnowledgeEntry.objects.filter(index_status='failed').count()
        if failed_vec > 0:
            gaps.append({
                'gap_type': 'vectorization_failed',
                'severity': 'high',
                'count': failed_vec,
                'affected': [],
                'message': f'{failed_vec} 条知识条目向量化失败',
                'action': '检查 Qwen3-embedding GPU 算力中心连通性，重试失败条目向量化',
            })
        if pending_vec > 100:
            gaps.append({
                'gap_type': 'vectorization_backlog',
                'severity': 'medium',
                'count': pending_vec,
                'affected': [],
                'message': f'{pending_vec} 条知识条目待向量化（积压过多）',
                'action': '检查 Celery Beat 向量化任务是否正常运行',
            })
    except Exception:
        pass

    # staging 层积压缺口
    try:
        from apps.data_intake.models import ExternalDataIngestCandidate, ReviewStatus
        from django.utils import timezone as tz
        from datetime import timedelta
        old_pending = ExternalDataIngestCandidate.objects.filter(
            review_status=ReviewStatus.PENDING,
            created_at__lt=tz.now() - timedelta(days=7),
        ).count()
        if old_pending > 0:
            gaps.append({
                'gap_type': 'staging_backlog',
                'severity': 'medium',
                'count': old_pending,
                'affected': [],
                'message': f'{old_pending} 条候选记录等待审核超过 7 天',
                'action': '前往各工作台外部数据收件箱批量审核积压候选',
            })
    except Exception:
        pass

    # 数据保留期超期缺口（来自 check_retention_compliance Celery 任务）
    try:
        from apps.quality.models import DataQualityAlert, DataQualityRule
        overdue_rules = DataQualityRule.objects.filter(rule_id__startswith='retention_overdue_')
        if overdue_rules.exists():
            unresolved_alerts = DataQualityAlert.objects.filter(
                rule__rule_id__startswith='retention_overdue_',
                resolved_at__isnull=True,
            )
            total_overdue = sum(a.violating_count for a in unresolved_alerts)
            affected_tables = list(
                unresolved_alerts.values_list('rule__target_table', flat=True).distinct()
            )
            if affected_tables:
                gaps.append({
                    'gap_type': 'retention_overdue',
                    'severity': 'high',
                    'count': total_overdue,
                    'affected': affected_tables,
                    'message': f'{len(affected_tables)} 张表存在超过保留期的数据共 {total_overdue} 条',
                    'action': '按各表的 retention_years 执行数据清理或归档，联系 data_manager 审批',
                })
    except Exception:
        pass

    # 备份缺口（读取现有 backup_status）
    try:
        import os
        import glob
        from datetime import datetime, timezone as stdlib_tz
        backup_pattern = '/var/backups/cn-kis-pg/*.dump.gz'
        files = sorted(glob.glob(backup_pattern), key=os.path.getmtime, reverse=True)
        if not files:
            gaps.append({
                'gap_type': 'backup_missing',
                'severity': 'critical',
                'count': 0,
                'affected': ['PostgreSQL'],
                'message': '未找到任何 PostgreSQL 备份文件',
                'action': '检查 pg_backup.sh crontab 配置，手动执行一次备份',
            })
        elif files:
            age_hours = (datetime.now(stdlib_tz.utc).timestamp() - os.path.getmtime(files[0])) / 3600
            if age_hours > 26:
                gaps.append({
                    'gap_type': 'backup_stale',
                    'severity': 'high',
                    'count': 1,
                    'affected': ['PostgreSQL'],
                    'message': f'PostgreSQL 备份超过 {int(age_hours)} 小时未更新（期望 < 26h）',
                    'action': '检查 crontab 任务运行状态，执行 pg_backup.sh',
                })
    except Exception:
        pass

    severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    gaps.sort(key=lambda g: severity_order.get(g['severity'], 99))

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'gaps': gaps,
            'total': len(gaps),
            'critical_count': sum(1 for g in gaps if g['severity'] == 'critical'),
            'high_count': sum(1 for g in gaps if g['severity'] == 'high'),
        },
    }


@router.get('/governance/recent-ops', summary='最近治理写操作列表', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'data.governance.manage', 'knowledge.manage.write'])
def governance_recent_ops(request):
    """
    返回最近 20 条数据台治理写操作审计日志，用于 DashboardPage「最近治理操作」卡片。
    """
    try:
        from apps.audit.models import AuditLog
        GOVERNANCE_RESOURCE_TYPES = [
            'pseudonymize_plan', 'pipeline_run', 'knowledge_dedup',
            'knowledge_populate_all', 'knowledge_entry', 'data_intake_candidate',
            'data_quality_rule', 'data_quality_alert',
        ]
        qs = AuditLog.objects.filter(
            resource_type__in=GOVERNANCE_RESOURCE_TYPES,
        ).order_by('-created_at')[:20]
        ops = []
        for log in qs:
            ops.append({
                'id': log.id,
                'action': log.action,
                'resource_type': log.resource_type,
                'resource_name': log.resource_name,
                'operator': log.account_name or 'system',
                'description': log.description,
                'created_at': log.created_at.isoformat() if log.created_at else None,
            })
        return {'code': 200, 'msg': 'OK', 'data': {'ops': ops, 'total': len(ops)}}
    except Exception as e:
        return {'code': 200, 'msg': 'OK', 'data': {'ops': [], 'total': 0, 'note': str(e)}}


@router.post('/governance/pseudonymize-plan', summary='记录假名化规划意向', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.manage'])
def create_pseudonymize_plan(request):
    """
    记录某张 GCP+PIPL 冲突表的假名化规划意向。
    写入审计日志作为持久化存储，供后续追溯规划进度。

    请求体：
      {
        "table_name": "t_subject",
        "notes": "计划将 id_card/phone/address 迁移至 t_subject_pii_vault 加密子表"
      }
    """
    import json as _json
    try:
        body = _json.loads(request.body or '{}')
    except Exception:
        body = {}

    table_name = body.get('table_name', '')
    notes = body.get('notes', '')

    if not table_name:
        return {'code': 400, 'msg': '缺少 table_name 参数', 'data': None}

    from apps.knowledge.classification import DATA_CLASSIFICATION_REGISTRY, ClassificationRegistry
    if table_name not in DATA_CLASSIFICATION_REGISTRY:
        return {'code': 404, 'msg': f'表 {table_name} 不在分类注册表中', 'data': None}

    dc = DATA_CLASSIFICATION_REGISTRY[table_name]
    if not dc.has_gcp_pi_conflict():
        return {'code': 400, 'msg': f'表 {table_name} 无 GCP+PIPL 双重合规冲突，无需假名化规划', 'data': None}

    # 写入审计日志作为持久化记录
    try:
        from apps.identity.decorators import _get_account_from_request
        from apps.audit.services import log_audit
        _acct = _get_account_from_request(request)
        account_id = _acct.id if _acct else 0
        account_name = (_acct.display_name or _acct.username) if _acct else 'system'

        log_audit(
            account_id=account_id,
            account_name=account_name,
            action='UPDATE',
            resource_type='pseudonymize_plan',
            resource_id=table_name,
            resource_name=f'假名化规划：{table_name}',
            description=f'记录假名化规划意向：{table_name} — {notes or "（无备注）"}',
            new_value={
                'table_name': table_name,
                'notes': notes,
                'security_level': dc.security_level,
                'regulatory_categories': list(dc.regulatory_categories),
                'status': 'planned',
            },
        )
    except Exception as e:
        return {'code': 500, 'msg': f'审计日志写入失败：{e}', 'data': None}

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'table_name': table_name,
            'status': 'planned',
            'notes': notes,
            'message': f'已记录 {table_name} 的假名化规划意向，可在审计日志中追溯。',
        },
    }


# ────────────────────────────────────────────────────────────────────────────
# 知识转化治理
# ────────────────────────────────────────────────────────────────────────────

@router.get('/knowledge-governance/transformation', summary='知识转化治理统计', response={200: dict, 401: dict, 403: dict})
@require_any_permission(['data.governance.read', 'system.role.read', 'knowledge.entry.view', 'knowledge.read', 'knowledge.manage.write'])
def knowledge_transformation(request):
    """
    返回知识转化治理核心指标：
    - 各来源类型的内容 → 知识转化率
    - 各 entry_type 的质量分分布
    - 向量化覆盖率
    - 图谱覆盖率（有实体关联的知识条目比例）
    """
    from django.db.models import Count, Avg

    result = {
        'by_source_type': {},
        'quality_distribution': {},
        'vectorization_coverage': {},
        'graph_coverage': {},
    }

    try:
        from apps.knowledge.models import KnowledgeEntry

        # 按 source_type 统计转化情况
        source_stats = list(
            KnowledgeEntry.objects.values('source_type')
            .annotate(
                total=Count('id'),
                indexed=Count('id', filter=__import__('django.db.models', fromlist=['Q']).Q(index_status='indexed')),
                avg_quality=Avg('quality_score'),
            )
            .order_by('-total')
        )
        result['by_source_type'] = {
            s['source_type']: {
                'total': s['total'],
                'indexed': s['indexed'],
                'avg_quality': round(s['avg_quality'] or 0, 2),
                'vectorization_rate': round(s['indexed'] / s['total'] * 100, 1) if s['total'] > 0 else 0,
            }
            for s in source_stats
        }

        # 向量化覆盖率
        total_ke = KnowledgeEntry.objects.count()
        indexed_ke = KnowledgeEntry.objects.filter(index_status='indexed').count()
        result['vectorization_coverage'] = {
            'total': total_ke,
            'indexed': indexed_ke,
            'coverage_pct': round(indexed_ke / total_ke * 100, 1) if total_ke > 0 else 0,
        }

        # 质量分分布（分四段）
        from django.db.models import Q
        result['quality_distribution'] = {
            'excellent': KnowledgeEntry.objects.filter(quality_score__gte=0.8).count(),
            'good': KnowledgeEntry.objects.filter(quality_score__gte=0.6, quality_score__lt=0.8).count(),
            'fair': KnowledgeEntry.objects.filter(quality_score__gte=0.4, quality_score__lt=0.6).count(),
            'poor': KnowledgeEntry.objects.filter(quality_score__lt=0.4).count(),
        }
    except Exception:
        pass

    # 图谱覆盖率（读取图谱节点数）
    try:
        from apps.knowledge.models import KnowledgeEntity
        total_entities = KnowledgeEntity.objects.filter(is_deleted=False).count()
        result['graph_coverage'] = {'total_entities': total_entities}
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': result}
