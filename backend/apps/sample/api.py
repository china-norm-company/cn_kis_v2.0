"""
样品管理 API

端点：
- POST /sample/products/create        创建产品
- POST /sample/instances/generate      批量生成样品
- GET  /sample/instances/list          样品列表
- POST /sample/instances/{id}/distribute 分发
- POST /sample/instances/{id}/return     回收
- POST /sample/instances/{id}/destroy    销毁
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import date
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services


router = Router()


class ProductCreateIn(Schema):
    name: str
    code: str
    batch_number: Optional[str] = ''
    specification: Optional[str] = ''
    storage_condition: Optional[str] = ''
    expiry_date: Optional[date] = None
    description: Optional[str] = ''


class GenerateIn(Schema):
    product_id: int
    count: int
    code_prefix: Optional[str] = ''
    protocol_id: Optional[int] = None


class DistributeIn(Schema):
    enrollment_id: Optional[int] = None
    work_order_id: Optional[int] = None
    remarks: Optional[str] = ''


class SampleQueryParams(Schema):
    product_id: Optional[int] = None
    status: Optional[str] = None
    protocol_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


def _product_to_dict(p) -> dict:
    return {
        'id': p.id, 'name': p.name, 'code': p.code,
        'batch_number': p.batch_number, 'specification': p.specification,
        'expiry_date': str(p.expiry_date) if p.expiry_date else None,
    }


def _sample_to_dict(s) -> dict:
    return {
        'id': s.id, 'product_id': s.product_id,
        'unique_code': s.unique_code, 'status': s.status,
        'protocol_id': s.protocol_id,
        'current_holder_id': s.current_holder_id,
    }


@router.post('/products/create', summary='创建产品')
@require_permission('sample.product.create')
def create_product(request, data: ProductCreateIn):
    p = services.create_product(
        name=data.name, code=data.code,
        batch_number=data.batch_number or '',
        specification=data.specification or '',
        storage_condition=data.storage_condition or '',
        expiry_date=data.expiry_date,
        description=data.description or '',
    )
    return {'code': 200, 'msg': '产品创建成功', 'data': _product_to_dict(p)}


@router.post('/instances/generate', summary='批量生成样品')
@require_permission('sample.instance.create')
def generate_instances(request, data: GenerateIn):
    instances = services.generate_sample_instances(
        product_id=data.product_id, count=data.count,
        code_prefix=data.code_prefix or '',
        protocol_id=data.protocol_id,
    )
    return {'code': 200, 'msg': f'生成 {len(instances)} 个样品', 'data': {
        'count': len(instances),
        'items': [_sample_to_dict(s) for s in instances[:10]],
    }}


@router.get('/instances/list', summary='样品列表')
@require_permission('sample.instance.read')
def list_samples(request, params: SampleQueryParams = Query(...)):
    result = services.list_samples(
        product_id=params.product_id, status=params.status,
        protocol_id=params.protocol_id,
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {'items': [_sample_to_dict(s) for s in result['items']],
                 'total': result['total']},
    }


@router.post('/instances/{sample_id}/distribute', summary='分发样品')
@require_permission('sample.instance.create')
def distribute(request, sample_id: int, data: DistributeIn):
    account = _get_account_from_request(request)
    s = services.distribute_sample(
        sample_id, enrollment_id=data.enrollment_id,
        work_order_id=data.work_order_id,
        operator_id=account.id if account else None,
    )
    if not s:
        return 400, {'code': 400, 'msg': '分发失败'}
    return {'code': 200, 'msg': '已分发', 'data': _sample_to_dict(s)}


@router.post('/instances/{sample_id}/return', summary='回收样品')
@require_permission('sample.instance.create')
def return_sample(request, sample_id: int):
    account = _get_account_from_request(request)
    s = services.return_sample(sample_id, operator_id=account.id if account else None)
    if not s:
        return 400, {'code': 400, 'msg': '回收失败'}
    return {'code': 200, 'msg': '已回收', 'data': _sample_to_dict(s)}


@router.post('/instances/{sample_id}/destroy', summary='销毁样品')
@require_permission('sample.instance.create')
def destroy_sample(request, sample_id: int):
    account = _get_account_from_request(request)
    s = services.destroy_sample(sample_id, operator_id=account.id if account else None)
    if not s:
        return 400, {'code': 400, 'msg': '销毁失败'}
    return {'code': 200, 'msg': '已销毁', 'data': _sample_to_dict(s)}
