"""
EDC CRF 核心服务

说明：
- 该模块承接 CRF 模板/记录/状态流转能力，避免与 services 包名冲突。
- 增强了两类关键防线：
  1) 模板-项目/节点范围校验（防张冠李戴）
  2) 锁定门禁校验（未闭合 Query/未完成 SDV/未解决错误禁止锁定）
"""
import logging
from typing import Optional, Any, Dict

from django.utils import timezone

from apps.edc.models import (
    CRFTemplate, CRFRecord, CRFRecordStatus, InstrumentInterface,
    DataQuery, CRFValidationResult, SDVRecord, SDVStatus, QueryStatus,
)

logger = logging.getLogger(__name__)


def _template_scope(template: CRFTemplate) -> Dict[str, Any]:
    """从 schema 中读取模板范围配置。"""
    schema = template.schema or {}
    scope = schema.get('_scope')
    return scope if isinstance(scope, dict) else {}


def _enforce_template_scope(template: CRFTemplate, work_order_id: int) -> None:
    """
    模板范围强校验（防错配）：
    - scope.protocol_id 必填，且必须等于工单所属 protocol
    - 若配置 visit_node_codes，则必须包含当前工单 visit_node.code
    """
    from apps.workorder.models import WorkOrder

    work_order = WorkOrder.objects.select_related(
        'enrollment', 'visit_node',
    ).filter(id=work_order_id, is_deleted=False).first()
    if not work_order:
        raise ValueError(f'工单不存在: id={work_order_id}')
    if not work_order.enrollment_id:
        raise ValueError('工单未关联入组信息，无法进行 eCRF 采集')

    protocol_id = work_order.enrollment.protocol_id
    node_code = (work_order.visit_node.code or '') if work_order.visit_node_id else ''

    scope = _template_scope(template)
    scope_protocol_id = scope.get('protocol_id')
    if scope_protocol_id is None:
        raise ValueError(
            '模板未配置项目范围(_scope.protocol_id)，禁止用于真实采集。'
        )

    try:
        scope_protocol_id = int(scope_protocol_id)
    except (TypeError, ValueError):
        raise ValueError('模板范围配置错误：_scope.protocol_id 必须为整数')

    if scope_protocol_id != protocol_id:
        raise ValueError(
            f'模板项目范围不匹配: template.protocol={scope_protocol_id}, '
            f'work_order.protocol={protocol_id}'
        )

    allowed_codes = scope.get('visit_node_codes')
    if isinstance(allowed_codes, list) and allowed_codes:
        allowed_codes = [str(c).strip() for c in allowed_codes if str(c).strip()]
        if node_code and node_code not in allowed_codes:
            raise ValueError(
                f'模板节点范围不匹配: node_code={node_code}, allowed={allowed_codes}'
            )


def list_crf_templates(
    is_active: bool = None,
    name: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """分页查询 CRF 模板"""
    qs = CRFTemplate.objects.filter(is_deleted=False)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    if name:
        qs = qs.filter(name__icontains=name)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_crf_template(template_id: int) -> Optional[CRFTemplate]:
    """获取 CRF 模板详情"""
    return CRFTemplate.objects.filter(id=template_id, is_deleted=False).first()


def create_crf_template(
    name: str,
    schema: dict,
    version: str = '1.0',
    description: str = '',
) -> CRFTemplate:
    """创建 CRF 模板"""
    return CRFTemplate.objects.create(
        name=name,
        schema=schema,
        version=version,
        description=description,
    )


def update_crf_template(template_id: int, **kwargs) -> Optional[CRFTemplate]:
    """更新 CRF 模板"""
    template = get_crf_template(template_id)
    if not template:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(template, key):
            setattr(template, key, value)
    template.save()
    return template


def list_crf_records(
    template_id: int = None,
    work_order_id: int = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
    execution_context=None,  # Optional[SkillExecutionContext]
) -> dict:
    """
    分页查询 CRF 记录（支持 scope 过滤：通过工单关联）

    execution_context 优先于 account 进行权限过滤。
    当 execution_context 指定时，按 project_ids 过滤关联工单所属项目。
    """
    qs = CRFRecord.objects.select_related('template').all()

    if execution_context is not None:
        # 通过 execution_context 进行项目级过滤
        if not execution_context.is_admin and execution_context.data_scope != 'global':
            try:
                from apps.workorder.models import WorkOrder
                wo_qs = WorkOrder.objects.filter(is_deleted=False)
                if execution_context.project_ids:
                    wo_qs = wo_qs.filter(
                        enrollment__protocol_id__in=execution_context.project_ids
                    )
                else:
                    # 无项目分配：个人级，只能看自己处理的工单
                    wo_qs = wo_qs.filter(
                        assigned_to=execution_context.account_id
                    )
                qs = qs.filter(work_order_id__in=wo_qs.values_list('id', flat=True))
            except Exception as e:
                logger.warning('CRF context filter failed: %s', e)
    elif account:
        # 向后兼容：通过 account 过滤（项目级映射）
        try:
            from apps.identity.filters import filter_queryset_by_scope
            from apps.workorder.models import WorkOrder
            visible_wo_ids = filter_queryset_by_scope(
                WorkOrder.objects.filter(is_deleted=False),
                account,
                field_mapping={'project': 'enrollment__protocol_id'},
            ).values_list('id', flat=True)
            qs = qs.filter(work_order_id__in=visible_wo_ids)
        except Exception:
            pass

    if template_id:
        qs = qs.filter(template_id=template_id)
    if work_order_id:
        qs = qs.filter(work_order_id=work_order_id)
    if status:
        qs = qs.filter(status=status)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def crf_validator(
    work_order_id: int = None,
    template_id: int = None,
    execution_context=None,  # Optional[SkillExecutionContext]
) -> dict:
    """
    Claw 技能入口：CRF 记录校验

    校验指定工单或模板的 CRF 记录，确保只校验调用用户有权限访问的记录。
    此函数作为 SERVICE_DIRECT_MAP['crf-validator'] 的目标入口。

    Args:
        work_order_id: 指定工单 ID（可选，不指定则按 execution_context 批量校验）
        template_id:   指定模板 ID 筛选
        execution_context: 技能执行上下文（强制项目数据隔离）
    """
    if execution_context is None:
        logger.warning(
            'crf_validator called without execution_context — '
            'data isolation not enforced'
        )

    # 获取可访问的 CRF 记录
    records_result = list_crf_records(
        template_id=template_id,
        work_order_id=work_order_id,
        page=1,
        page_size=200,
        execution_context=execution_context,
    )

    items = records_result.get('items', [])
    validation_results = []
    error_count = 0
    warning_count = 0

    for record in items:
        result = _validate_crf_record(record)
        validation_results.append(result)
        if result['level'] == 'error':
            error_count += 1
        elif result['level'] == 'warning':
            warning_count += 1

    return {
        'total_checked': len(items),
        'error_count': error_count,
        'warning_count': warning_count,
        'results': validation_results,
        'account_id': execution_context.account_id if execution_context else None,
        'data_scope': execution_context.data_scope if execution_context else 'unknown',
    }


def _validate_crf_record(record: 'CRFRecord') -> dict:
    """对单条 CRF 记录执行校验规则"""
    issues = []
    level = 'ok'

    # 必填字段检查
    if not record.data:
        issues.append({'field': 'data', 'message': 'CRF 数据为空', 'severity': 'error'})
        level = 'error'

    # 状态完整性检查
    if record.status == CRFRecordStatus.SUBMITTED:
        open_queries = DataQuery.objects.filter(
            crf_record=record
        ).exclude(status=QueryStatus.CLOSED).count()
        if open_queries > 0:
            issues.append({
                'field': 'status',
                'message': f'存在 {open_queries} 条未关闭质疑',
                'severity': 'warning',
            })
            if level != 'error':
                level = 'warning'

    return {
        'record_id': record.id,
        'work_order_id': record.work_order_id,
        'status': record.status,
        'level': level,
        'issues': issues,
    }


def get_crf_record(record_id: int) -> Optional[CRFRecord]:
    """获取 CRF 记录详情"""
    return CRFRecord.objects.select_related('template').filter(id=record_id).first()


def create_crf_record(
    template_id: int,
    work_order_id: int,
    data: dict,
) -> CRFRecord:
    """创建 CRF 记录（含模板范围校验）"""
    template = get_crf_template(template_id)
    if not template:
        raise ValueError(f'CRF模板不存在: id={template_id}')

    _enforce_template_scope(template, work_order_id)

    return CRFRecord.objects.create(
        template_id=template_id,
        work_order_id=work_order_id,
        data=data,
    )


def update_crf_record_data(record_id: int, data: dict) -> Optional[CRFRecord]:
    """更新 CRF 记录数据（仅草稿状态可更新）"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status != CRFRecordStatus.DRAFT:
        logger.warning(
            f'Cannot update CRF record {record_id}: status is {record.status}'
        )
        return None
    record.data = data
    record.save(update_fields=['data', 'update_time'])
    return record


def submit_crf_record(record_id: int, submitted_by: int) -> Optional[CRFRecord]:
    """提交 CRF 记录"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status not in (CRFRecordStatus.DRAFT, CRFRecordStatus.QUERIED):
        return None
    record.status = CRFRecordStatus.SUBMITTED
    record.submitted_by = submitted_by
    record.submitted_at = timezone.now()
    record.save(update_fields=['status', 'submitted_by', 'submitted_at', 'update_time'])
    return record


def verify_crf_record(record_id: int, verified_by: int) -> Optional[CRFRecord]:
    """核实 CRF 记录"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status != CRFRecordStatus.SUBMITTED:
        return None
    record.status = CRFRecordStatus.VERIFIED
    record.verified_by = verified_by
    record.verified_at = timezone.now()
    record.save(update_fields=['status', 'verified_by', 'verified_at', 'update_time'])
    return record


def query_crf_record(record_id: int) -> Optional[CRFRecord]:
    """质疑 CRF 记录"""
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status not in (CRFRecordStatus.SUBMITTED, CRFRecordStatus.VERIFIED):
        return None
    record.status = CRFRecordStatus.QUERIED
    record.save(update_fields=['status', 'update_time'])
    return record


def lock_crf_record(record_id: int) -> Optional[CRFRecord]:
    """
    锁定 CRF 记录（不可逆）

    门禁：
    - 状态必须为 verified
    - 不允许存在未关闭 Query
    - 不允许存在未解决 error 级验证结果
    - 若已初始化 SDV，则必须全部 verified
    """
    record = get_crf_record(record_id)
    if not record:
        return None
    if record.status not in (CRFRecordStatus.VERIFIED, CRFRecordStatus.SDV_COMPLETED):
        return None

    has_open_query = DataQuery.objects.filter(
        crf_record=record
    ).exclude(status=QueryStatus.CLOSED).exists()
    if has_open_query:
        logger.warning(f'Cannot lock CRF#{record_id}: open queries exist')
        return None

    has_unresolved_error = CRFValidationResult.objects.filter(
        record=record, severity='error', is_resolved=False
    ).exists()
    if has_unresolved_error:
        logger.warning(f'Cannot lock CRF#{record_id}: unresolved validation errors exist')
        return None

    sdv_qs = SDVRecord.objects.filter(crf_record=record)
    if sdv_qs.exists() and sdv_qs.exclude(status=SDVStatus.VERIFIED).exists():
        logger.warning(f'Cannot lock CRF#{record_id}: SDV not completed')
        return None

    record.status = CRFRecordStatus.LOCKED
    record.save(update_fields=['status', 'update_time'])
    return record


def list_instrument_interfaces(is_active: bool = None) -> list:
    """查询仪器接口列表"""
    qs = InstrumentInterface.objects.filter(is_deleted=False)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    return list(qs.order_by('name'))


def get_instrument_interface(interface_id: int) -> Optional[InstrumentInterface]:
    """获取仪器接口详情"""
    return InstrumentInterface.objects.filter(id=interface_id, is_deleted=False).first()

