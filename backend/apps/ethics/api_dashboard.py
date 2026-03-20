"""
伦理台仪表盘 API
"""
from ninja import Router
from apps.identity.decorators import require_permission
from .services import dashboard_service
from .services import notification_service

router = Router()


@router.get('/dashboard', summary='伦理台仪表盘统计')
@require_permission('ethics.app.read')
def get_dashboard(request):
    stats = dashboard_service.get_dashboard_stats()
    return {'code': 200, 'msg': 'OK', 'data': stats}


@router.get('/approvals', summary='批件列表')
@require_permission('ethics.app.read')
def list_approvals(request):
    from .models import ApprovalDocument
    docs = ApprovalDocument.objects.select_related(
        'application'
    ).filter(is_active=True).order_by('-approved_date')

    items = []
    for doc in docs:
        items.append({
            'id': doc.id,
            'document_no': doc.document_number,
            'application_id': doc.application_id,
            'application_no': doc.application.application_number,
            'approved_at': str(doc.approved_date) if doc.approved_date else None,
            'valid_until': str(doc.expiry_date) if doc.expiry_date else None,
            'file_url': doc.file_url,
            'is_active': doc.is_active,
        })
    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'total': len(items)}}


@router.get('/approvals/expiring', summary='即将到期批件')
@require_permission('ethics.app.read')
def get_expiring_approvals(request, days: int = 30):
    results = notification_service.check_expiring_approvals(days)
    return {'code': 200, 'msg': 'OK', 'data': results}
