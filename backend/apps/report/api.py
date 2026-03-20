"""
报告管理 API
"""
from ninja import Router, Schema, Query
from typing import Optional
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services

router = Router()


class ReportCreateIn(Schema):
    report_type: str
    title: str
    protocol_id: Optional[int] = None
    template_id: Optional[int] = None


class ReportQueryParams(Schema):
    report_type: Optional[str] = None
    protocol_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


def _report_to_dict(r) -> dict:
    return {
        'id': r.id, 'report_type': r.report_type, 'title': r.title,
        'protocol_id': r.protocol_id, 'status': r.status,
        'feishu_doc_token': r.feishu_doc_token,
        'generated_at': r.generated_at.isoformat() if r.generated_at else None,
        'create_time': r.create_time.isoformat(),
    }


@router.post('/create', summary='创建报告')
@require_permission('report.create')
def create_report(request, data: ReportCreateIn):
    account = _get_account_from_request(request)
    r = services.create_report(
        report_type=data.report_type, title=data.title,
        protocol_id=data.protocol_id, template_id=data.template_id,
        generated_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '报告已创建', 'data': _report_to_dict(r)}


@router.post('/{report_id}/generate', summary='生成报告')
@require_permission('report.create')
def generate_report(request, report_id: int):
    r = services.generate_report(report_id)
    if not r:
        return 404, {'code': 404, 'msg': '报告不存在'}
    return {'code': 200, 'msg': f'报告状态: {r.status}', 'data': _report_to_dict(r)}


@router.get('/list', summary='报告列表')
@require_permission('report.read')
def list_reports(request, params: ReportQueryParams = Query(...)):
    result = services.list_reports(
        report_type=params.report_type, protocol_id=params.protocol_id,
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {'items': [_report_to_dict(r) for r in result['items']],
                 'total': result['total']},
    }


@router.get('/{report_id}', summary='报告详情')
@require_permission('report.read')
def get_report(request, report_id: int):
    from .models import Report
    r = Report.objects.filter(id=report_id).first()
    if not r:
        return 404, {'code': 404, 'msg': '报告不存在'}
    data = _report_to_dict(r)
    data['content'] = r.content
    data['data_snapshot'] = r.data_snapshot
    return {'code': 200, 'msg': 'OK', 'data': data}
