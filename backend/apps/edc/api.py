"""
EDC数据采集 API

端点：
- GET  /edc/templates               CRF模板列表
- GET  /edc/templates/{id}          CRF模板详情
- GET  /edc/records                 CRF记录列表
- POST /edc/records/create          创建CRF记录
- POST /edc/records/{id}/submit     提交CRF记录
- POST /edc/records/{id}/verify     核实CRF记录
- POST /edc/records/{id}/lock       锁定CRF记录
"""
from ninja import Router, Schema, Query
from pydantic import Field
from typing import Optional
from datetime import datetime
from .services import crf_service as services
from apps.identity.decorators import require_permission, _get_account_from_request

router = Router()


# ============================================================================
# Schema
# ============================================================================
class CRFTemplateOut(Schema):
    id: int
    name: str
    version: str
    schema_data: dict = Field(alias='schema')
    description: Optional[str] = None
    is_active: bool
    create_time: datetime


class CRFTemplateQueryParams(Schema):
    is_active: Optional[bool] = None
    name: Optional[str] = None
    page: int = 1
    page_size: int = 20


class CRFRecordOut(Schema):
    id: int
    template_id: int
    work_order_id: int
    data: dict
    status: str
    submitted_at: Optional[datetime] = None
    create_time: datetime
    update_time: datetime


class CRFRecordCreateIn(Schema):
    template_id: int
    work_order_id: int
    data: dict


class CRFRecordQueryParams(Schema):
    template_id: Optional[int] = None
    work_order_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class SubmitIn(Schema):
    submitted_by: int


class VerifyIn(Schema):
    verified_by: int


def _record_to_dict(r) -> dict:
    return {
        'id': r.id,
        'template_id': r.template_id,
        'work_order_id': r.work_order_id,
        'data': r.data,
        'status': r.status,
        'submitted_at': r.submitted_at.isoformat() if r.submitted_at else None,
        'create_time': r.create_time.isoformat(),
        'update_time': r.update_time.isoformat(),
    }


# ============================================================================
# 端点
# ============================================================================
@router.get('/templates', summary='CRF模板列表')
@require_permission('edc.crf.read')
def list_crf_templates(request, params: CRFTemplateQueryParams = Query(...)):
    """分页查询CRF模板列表"""
    result = services.list_crf_templates(
        is_active=params.is_active,
        name=params.name,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': item.id,
                    'name': item.name,
                    'version': item.version,
                    'schema': item.schema,
                    'description': item.description,
                    'is_active': item.is_active,
                    'create_time': item.create_time.isoformat(),
                }
                for item in result['items']
            ],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/templates/{template_id}', summary='CRF模板详情')
@require_permission('edc.crf.read')
def get_crf_template(request, template_id: int):
    """获取CRF模板详细信息"""
    template = services.get_crf_template(template_id)
    if not template:
        return 404, {'code': 404, 'msg': 'CRF模板不存在'}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': template.id,
            'name': template.name,
            'version': template.version,
            'schema': template.schema,
            'description': template.description,
            'is_active': template.is_active,
            'create_time': template.create_time.isoformat(),
            'update_time': template.update_time.isoformat(),
        },
    }


@router.get('/records', summary='CRF记录列表')
@require_permission('edc.crf.read')
def list_crf_records(request, params: CRFRecordQueryParams = Query(...)):
    """分页查询CRF记录列表（按当前用户可见工单范围过滤）"""
    account = _get_account_from_request(request)
    result = services.list_crf_records(
        template_id=params.template_id,
        work_order_id=params.work_order_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_record_to_dict(item) for item in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/records/create', summary='创建CRF记录')
@require_permission('edc.crf.create')
def create_crf_record(request, data: CRFRecordCreateIn):
    """创建新CRF记录"""
    try:
        record = services.create_crf_record(
            template_id=data.template_id,
            work_order_id=data.work_order_id,
            data=data.data,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'id': record.id, 'work_order_id': record.work_order_id, 'status': record.status},
    }


@router.post('/records/{record_id}/submit', summary='提交CRF记录')
@require_permission('edc.crf.create')
def submit_crf_record(request, record_id: int, data: SubmitIn):
    """提交CRF记录"""
    record = services.submit_crf_record(record_id, data.submitted_by)
    if not record:
        return 400, {'code': 400, 'msg': '无法提交：记录不存在或状态不允许'}
    return {'code': 200, 'msg': 'OK', 'data': _record_to_dict(record)}


@router.post('/records/{record_id}/verify', summary='核实CRF记录')
@require_permission('edc.crf.verify')
def verify_crf_record(request, record_id: int, data: VerifyIn):
    """核实CRF记录"""
    record = services.verify_crf_record(record_id, data.verified_by)
    if not record:
        return 400, {'code': 400, 'msg': '无法核实：记录不存在或状态不允许'}
    return {'code': 200, 'msg': 'OK', 'data': _record_to_dict(record)}


@router.post('/records/{record_id}/lock', summary='锁定CRF记录')
@require_permission('edc.crf.verify')
def lock_crf_record(request, record_id: int):
    """锁定CRF记录（不可逆）"""
    record = services.lock_crf_record(record_id)
    if not record:
        return 400, {'code': 400, 'msg': '无法锁定：记录不存在、未通过核实或未满足锁定门禁'}
    return {'code': 200, 'msg': 'OK', 'data': _record_to_dict(record)}


# ============================================================================
# CRF 记录更新 + 数据质疑列表
# ============================================================================
class CRFRecordUpdateIn(Schema):
    data: dict


@router.put('/records/{record_id}', summary='更新CRF记录')
@require_permission('edc.crf.create')
def update_crf_record(request, record_id: int, body: CRFRecordUpdateIn):
    """更新 CRF 记录数据（仅 draft/queried 状态可编辑）"""
    from .models import CRFRecord, CRFRecordStatus
    record = CRFRecord.objects.filter(id=record_id, is_deleted=False).first()
    if not record:
        return 404, {'code': 404, 'msg': 'CRF记录不存在'}
    if record.status not in (CRFRecordStatus.DRAFT, CRFRecordStatus.QUERIED):
        return 400, {'code': 400, 'msg': f'当前状态 {record.status} 不允许编辑'}
    record.data = body.data
    record.save(update_fields=['data', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': _record_to_dict(record)}


@router.get('/queries/list', summary='质疑列表')
@require_permission('edc.query.read')
def list_queries(request, crf_record_id: Optional[int] = None,
                 status: Optional[str] = None, page: int = 1, page_size: int = 20):
    """查询数据质疑列表"""
    from .models import DataQuery
    qs = DataQuery.objects.all()
    if crf_record_id:
        qs = qs.filter(crf_record_id=crf_record_id)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': q.id, 'crf_record_id': q.crf_record_id,
            'field_name': q.field_name, 'query_text': q.query_text,
            'answer_text': q.answer_text, 'status': q.status,
            'create_time': q.create_time.isoformat(),
        } for q in items],
        'total': total, 'page': page, 'page_size': page_size,
    }}


# ============================================================================
# S1-6：CRF 验证规则管理 + 验证执行
# ============================================================================
class ValidationRuleCreateIn(Schema):
    template_id: int
    field_name: str
    rule_type: str
    rule_config: Optional[dict] = None
    error_message: Optional[str] = ''


@router.post('/validation-rules/create', summary='创建验证规则')
@require_permission('edc.validation.create')
def create_validation_rule(request, data: ValidationRuleCreateIn):
    """为 CRF 模板创建验证规则"""
    from .models import CRFValidationRule, CRFTemplate
    tpl = CRFTemplate.objects.filter(id=data.template_id, is_deleted=False).first()
    if not tpl:
        return 404, {'code': 404, 'msg': 'CRF模板不存在'}

    rule = CRFValidationRule.objects.create(
        template=tpl,
        field_name=data.field_name,
        rule_type=data.rule_type,
        rule_config=data.rule_config or {},
        error_message=data.error_message or '',
    )
    return {
        'code': 200, 'msg': '规则创建成功',
        'data': {
            'id': rule.id, 'template_id': rule.template_id,
            'field_name': rule.field_name, 'rule_type': rule.rule_type,
            'rule_config': rule.rule_config, 'error_message': rule.error_message,
        },
    }


@router.get('/templates/{template_id}/validation-rules', summary='查询验证规则')
@require_permission('edc.validation.read')
def list_validation_rules(request, template_id: int):
    """获取 CRF 模板的所有验证规则"""
    from .models import CRFValidationRule
    rules = CRFValidationRule.objects.filter(template_id=template_id, is_active=True)
    return {
        'code': 200, 'msg': 'OK',
        'data': [
            {
                'id': r.id, 'field_name': r.field_name, 'rule_type': r.rule_type,
                'rule_config': r.rule_config, 'error_message': r.error_message,
            }
            for r in rules
        ],
    }


@router.post('/records/{record_id}/validate', summary='执行CRF验证')
@require_permission('edc.crf.create')
def validate_crf_record(request, record_id: int):
    """对 CRF 记录执行所有验证规则"""
    from apps.edc.services.validation_service import DataValidationService
    try:
        results = DataValidationService.validate_record(record_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}

    return {
        'code': 200,
        'msg': f'验证完成，发现 {len(results)} 个问题' if results else '验证通过',
        'data': {
            'passed': len(results) == 0,
            'errors': [
                {
                    'field_name': r.field_name,
                    'message': r.message,
                    'severity': r.severity,
                    'field_value': r.field_value,
                }
                for r in results
            ],
        },
    }


# ============================================================================
# S2-4: SDV 源数据核查
# ============================================================================
class SDVVerifyIn(Schema):
    field_name: str
    notes: Optional[str] = ''


@router.post('/records/{record_id}/sdv/init', summary='初始化SDV')
@require_permission('edc.sdv.create')
def init_sdv(request, record_id: int):
    from apps.edc.services.sdv_service import SDVService
    items = SDVService.init_sdv_for_record(record_id)
    return {'code': 200, 'msg': f'初始化 {len(items)} 个SDV项', 'data': {'count': len(items)}}


@router.post('/records/{record_id}/sdv/verify', summary='字段级SDV')
@require_permission('edc.sdv.create')
def verify_sdv(request, record_id: int, data: SDVVerifyIn):
    from apps.edc.services.sdv_service import SDVService
    account = _get_account_from_request(request)
    sdv = SDVService.verify_field(
        record_id, data.field_name,
        verified_by_id=account.id if account else None,
        notes=data.notes or '',
    )
    if not sdv:
        return 404, {'code': 404, 'msg': 'SDV记录不存在'}
    return {'code': 200, 'msg': 'SDV已完成', 'data': {'field': sdv.field_name, 'status': sdv.status}}


@router.get('/records/{record_id}/sdv/progress', summary='SDV进度')
@require_permission('edc.sdv.read')
def sdv_progress(request, record_id: int):
    from apps.edc.services.sdv_service import SDVService
    progress = SDVService.get_sdv_progress(record_id)
    return {'code': 200, 'msg': 'OK', 'data': progress}


# ============================================================================
# S2-4: 数据质疑
# ============================================================================
class QueryCreateIn(Schema):
    crf_record_id: int
    field_name: str
    query_text: str


class QueryAnswerIn(Schema):
    answer_text: str


class QueryCloseIn(Schema):
    close_reason: Optional[str] = ''


@router.post('/queries/create', summary='创建质疑')
@require_permission('edc.query.create')
def create_query(request, data: QueryCreateIn):
    from apps.edc.services.query_management_service import QueryManagementService
    account = _get_account_from_request(request)
    q = QueryManagementService.create_query(
        crf_record_id=data.crf_record_id,
        field_name=data.field_name,
        query_text=data.query_text,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '质疑已创建', 'data': {'query_id': q.id, 'status': q.status}}


@router.post('/queries/{query_id}/answer', summary='回复质疑')
@require_permission('edc.query.create')
def answer_query(request, query_id: int, data: QueryAnswerIn):
    from apps.edc.services.query_management_service import QueryManagementService
    account = _get_account_from_request(request)
    q = QueryManagementService.answer_query(
        query_id, data.answer_text,
        answered_by_id=account.id if account else None,
    )
    if not q:
        return 400, {'code': 400, 'msg': '回复失败'}
    return {'code': 200, 'msg': '已回复', 'data': {'query_id': q.id, 'status': q.status}}


@router.post('/queries/{query_id}/close', summary='关闭质疑')
@require_permission('edc.query.create')
def close_query(request, query_id: int, data: QueryCloseIn):
    from apps.edc.services.query_management_service import QueryManagementService
    account = _get_account_from_request(request)
    q = QueryManagementService.close_query(
        query_id, close_reason=data.close_reason or '',
        closed_by_id=account.id if account else None,
    )
    if not q:
        return 400, {'code': 400, 'msg': '关闭失败'}
    return {'code': 200, 'msg': '已关闭', 'data': {'query_id': q.id, 'status': q.status}}


# ============================================================================
# S4-3: CRF 智能推荐 + 模板导入导出
# ============================================================================
@router.get('/templates/recommend/{activity_template_id}', summary='CRF模板推荐')
@require_permission('edc.template.read')
def recommend_crf(request, activity_template_id: int):
    from apps.edc.services.crf_recommend_service import CRFRecommendService
    templates = CRFRecommendService.recommend_for_activity(activity_template_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{'id': t.id, 'name': t.name} for t in templates],
    }}


@router.get('/templates/{template_id}/export', summary='导出CRF模板')
@require_permission('edc.template.read')
def export_crf(request, template_id: int):
    from apps.edc.services.crf_recommend_service import CRFRecommendService
    data = CRFRecommendService.export_template(template_id)
    if not data:
        return 404, {'code': 404, 'msg': '模板不存在'}
    return {'code': 200, 'msg': 'OK', 'data': data}


class CRFImportIn(Schema):
    name: str
    schema_data: dict = Field(alias='schema')


@router.post('/templates/import', summary='导入CRF模板')
@require_permission('edc.template.create')
def import_crf(request, data: CRFImportIn):
    from apps.edc.services.crf_recommend_service import CRFRecommendService
    template = CRFRecommendService.import_template({
        'name': data.name, 'schema': data.schema_data,
    })
    return {'code': 200, 'msg': '导入成功', 'data': {'id': template.id, 'name': template.name}}


# ============================================================================
# DataQuery 管理（数据质疑）
# ============================================================================
class QueryCreateIn(Schema):
    crf_record_id: int
    field_name: str
    query_text: str
    severity: Optional[str] = 'normal'


class QueryAnswerIn(Schema):
    answer_text: str


class QueryListParams(Schema):
    crf_record_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


@router.post('/queries/create', summary='创建数据质疑')
@require_permission('edc.record.update')
def create_query(request, data: QueryCreateIn):
    """对 CRF 记录的指定字段发起质疑"""
    from .models import DataQuery, CRFRecord
    account = _get_account_from_request(request)
    record = CRFRecord.objects.filter(id=data.crf_record_id).first()
    if not record:
        return 404, {'code': 404, 'msg': 'CRF记录不存在'}
    query = DataQuery.objects.create(
        crf_record=record,
        field_name=data.field_name,
        query_text=data.query_text,
        severity=data.severity or 'normal',
        raised_by=account.id if account else None,
        status='open',
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': query.id,
        'status': query.status,
        'field_name': query.field_name,
    }}


@router.get('/queries/list', summary='数据质疑列表')
@require_permission('edc.record.read')
def list_queries(request, params: QueryListParams = Query(...)):
    """按 crf_record_id / status 筛选质疑列表"""
    from .models import DataQuery
    qs = DataQuery.objects.all().order_by('-create_time')
    if params.crf_record_id:
        qs = qs.filter(crf_record_id=params.crf_record_id)
    if params.status:
        qs = qs.filter(status=params.status)
    total = qs.count()
    start = (params.page - 1) * params.page_size
    items = qs[start:start + params.page_size]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [
            {
                'id': q.id,
                'crf_record_id': q.crf_record_id,
                'field_name': q.field_name,
                'query_text': q.query_text,
                'severity': q.severity,
                'status': q.status,
                'answer_text': q.answer_text,
                'raised_by': q.raised_by,
                'answered_by': q.answered_by,
                'closed_by': q.closed_by,
                'create_time': q.create_time.isoformat(),
                'answer_time': q.answer_time.isoformat() if q.answer_time else None,
                'close_time': q.close_time.isoformat() if q.close_time else None,
            }
            for q in items
        ],
        'total': total,
        'page': params.page,
        'page_size': params.page_size,
    }}


@router.post('/queries/{query_id}/answer', summary='回复数据质疑')
@require_permission('edc.record.update')
def answer_query(request, query_id: int, data: QueryAnswerIn):
    """技术员回复质疑"""
    from .models import DataQuery
    from django.utils import timezone
    account = _get_account_from_request(request)
    query = DataQuery.objects.filter(id=query_id).first()
    if not query:
        return 404, {'code': 404, 'msg': '质疑不存在'}
    if query.status != 'open':
        return 400, {'code': 400, 'msg': '只能回复状态为 open 的质疑'}
    query.answer_text = data.answer_text
    query.answered_by = account.id if account else None
    query.answer_time = timezone.now()
    query.status = 'answered'
    query.save()
    return {'code': 200, 'msg': 'OK', 'data': {'id': query.id, 'status': query.status}}


@router.post('/queries/{query_id}/close', summary='关闭数据质疑')
@require_permission('edc.record.update')
def close_query(request, query_id: int):
    """QA/PM 关闭质疑"""
    from .models import DataQuery
    from django.utils import timezone
    account = _get_account_from_request(request)
    query = DataQuery.objects.filter(id=query_id).first()
    if not query:
        return 404, {'code': 404, 'msg': '质疑不存在'}
    if query.status not in ('open', 'answered'):
        return 400, {'code': 400, 'msg': '只能关闭 open 或 answered 状态的质疑'}
    query.closed_by = account.id if account else None
    query.close_time = timezone.now()
    query.status = 'closed'
    query.save()
    return {'code': 200, 'msg': 'OK', 'data': {'id': query.id, 'status': query.status}}


@router.get('/queries/stats', summary='数据质疑统计')
@require_permission('edc.record.read')
def query_stats(request):
    """按状态统计 Open/Answered/Closed 数量"""
    from .models import DataQuery
    from django.db.models import Count
    stats = DataQuery.objects.values('status').annotate(count=Count('id'))
    result = {s['status']: s['count'] for s in stats}
    result['total'] = sum(result.values())
    return {'code': 200, 'msg': 'OK', 'data': result}


# ---------------------------------------------------------------------------
# P3.3 仪器数据 OCR 提取
# ---------------------------------------------------------------------------
class OcrExtractIn(Schema):
    image_base64: str
    instrument_type: Optional[str] = None


@router.post('/ocr/extract', summary='仪器 OCR 提取读数（P3.3）')
@require_permission('edc.record.create')
def ocr_extract(request, data: OcrExtractIn):
    """
    接收 base64 编码的仪器屏幕图片，通过 ARK/Kimi 视觉模型提取数字读数，
    返回字段列表及置信度。前端可根据置信度决定是否自动填入 CRF。
    """
    import base64, re
    from apps.agent_gateway.services.ark_client import ark_chat_completion

    if not data.image_base64:
        return 400, {'code': 400, 'msg': '缺少图片数据'}

    # 去除 Data URL 前缀
    b64 = data.image_base64
    if ',' in b64:
        b64 = b64.split(',', 1)[1]

    instrument_hint = ''
    if data.instrument_type:
        labels = {
            'blood_pressure': '血压计',
            'heart_rate': '心率仪',
            'weight_scale': '体重秤',
            'thermometer': '体温计',
            'spirometer': '肺功能仪',
            'dermatoscope': '皮肤镜',
        }
        instrument_hint = f'仪器类型：{labels.get(data.instrument_type, data.instrument_type)}。'

    prompt = (
        f'{instrument_hint}请从这张仪器屏幕截图中提取所有数字读数。'
        '以 JSON 数组格式返回，每项包含 field_key(英文下划线)、label(中文)、value(字符串)、unit(单位，无则省略)、confidence(0-1浮点数)。'
        '仅返回 JSON，不要其他文字。'
    )

    try:
        response = ark_chat_completion(
            messages=[{
                'role': 'user',
                'content': [
                    {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}},
                    {'type': 'text', 'text': prompt},
                ],
            }],
            model='ep-vision',
        )
        content = response.choices[0].message.content if response.choices else ''
        # 提取 JSON 数组
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            import json
            fields = json.loads(json_match.group())
            return {'code': 200, 'msg': 'OK', 'data': {
                'success': True,
                'extracted_fields': fields,
                'instrument_type': data.instrument_type,
            }}
        return {'code': 200, 'msg': 'OK', 'data': {
            'success': False,
            'extracted_fields': [],
            'raw_text': content,
            'error': '模型未返回有效 JSON',
        }}
    except Exception as e:
        return {'code': 200, 'msg': 'OK', 'data': {
            'success': False,
            'extracted_fields': [],
            'error': f'OCR 服务异常: {str(e)}',
        }}
