"""
问卷管理 API（B端）

路由前缀：/questionnaire/
覆盖：模板 CRUD、分配、统计。
"""
from ninja import Router, Schema
from typing import Optional, List
from datetime import date
from django.db.models import Avg

from apps.identity.decorators import require_permission, _get_account_from_request
from .models_questionnaire import QuestionnaireTemplate, QuestionnaireAssignment, AssignmentStatus

router = Router()


# ============================================================================
# Schema
# ============================================================================
class TemplateCreateIn(Schema):
    template_name: str
    category: str = 'other'
    description: Optional[str] = ''
    form_definition: Optional[dict] = None


class TemplateUpdateIn(Schema):
    template_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    form_definition: Optional[dict] = None
    is_active: Optional[bool] = None


class AssignIn(Schema):
    subject_ids: List[int]
    due_date: Optional[date] = None


# ============================================================================
# 模板 CRUD
# ============================================================================
def _template_dict(t) -> dict:
    return {
        'id': t.id, 'template_name': t.template_name,
        'category': t.category, 'description': t.description,
        'form_definition': t.form_definition, 'is_active': t.is_active,
        'version': t.version, 'create_time': t.create_time.isoformat(),
    }


@router.get('/templates', summary='问卷模板列表')
@require_permission('subject.recruitment.read')
def list_templates(request, category: Optional[str] = None, is_active: Optional[bool] = None):
    qs = QuestionnaireTemplate.objects.all().order_by('-create_time')
    if category:
        qs = qs.filter(category=category)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_template_dict(t) for t in qs],
    }}


@router.post('/templates', summary='创建问卷模板')
@require_permission('subject.recruitment.create')
def create_template(request, data: TemplateCreateIn):
    account = _get_account_from_request(request)
    t = QuestionnaireTemplate.objects.create(
        template_name=data.template_name,
        category=data.category,
        description=data.description or '',
        form_definition=data.form_definition,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': _template_dict(t)}


@router.put('/templates/{template_id}', summary='编辑问卷模板')
@require_permission('subject.recruitment.update')
def update_template(request, template_id: int, data: TemplateUpdateIn):
    t = QuestionnaireTemplate.objects.filter(id=template_id).first()
    if not t:
        return 404, {'code': 404, 'msg': '模板不存在'}
    for field in ['template_name', 'category', 'description', 'form_definition', 'is_active']:
        val = getattr(data, field, None)
        if val is not None:
            setattr(t, field, val)
    t.save()
    return {'code': 200, 'msg': 'OK', 'data': _template_dict(t)}


@router.delete('/templates/{template_id}', summary='删除问卷模板')
@require_permission('subject.recruitment.delete')
def delete_template(request, template_id: int):
    t = QuestionnaireTemplate.objects.filter(id=template_id).first()
    if not t:
        return 404, {'code': 404, 'msg': '模板不存在'}
    t.is_active = False
    t.save(update_fields=['is_active', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': {'id': t.id}}


# ============================================================================
# 分配
# ============================================================================
@router.post('/templates/{template_id}/assign', summary='批量分配问卷')
@require_permission('subject.recruitment.create')
def assign_template(request, template_id: int, data: AssignIn):
    account = _get_account_from_request(request)
    t = QuestionnaireTemplate.objects.filter(id=template_id).first()
    if not t:
        return 404, {'code': 404, 'msg': '模板不存在'}
    created = []
    for sid in data.subject_ids:
        a = QuestionnaireAssignment.objects.create(
            template=t, subject_id=sid,
            due_date=data.due_date,
            assigned_by_id=account.id if account else None,
        )
        created.append(a.id)
    return {'code': 200, 'msg': 'OK', 'data': {'assigned_count': len(created), 'ids': created}}


@router.get('/assignments', summary='分配列表')
@require_permission('subject.recruitment.read')
def list_assignments(request, template_id: Optional[int] = None,
                     subject_id: Optional[int] = None,
                     status: Optional[str] = None):
    qs = QuestionnaireAssignment.objects.select_related('template').all().order_by('-create_time')
    if template_id:
        qs = qs.filter(template_id=template_id)
    if subject_id:
        qs = qs.filter(subject_id=subject_id)
    if status:
        qs = qs.filter(status=status)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': a.id, 'template_id': a.template_id,
            'template_name': a.template.template_name,
            'subject_id': a.subject_id, 'status': a.status,
            'due_date': a.due_date.isoformat() if a.due_date else None,
            'completed_at': a.completed_at.isoformat() if a.completed_at else None,
            'score': str(a.score) if a.score is not None else None,
            'create_time': a.create_time.isoformat(),
        } for a in qs[:200]],
    }}


# ============================================================================
# 统计
# ============================================================================
@router.get('/statistics', summary='问卷统计')
@require_permission('subject.recruitment.read')
def get_statistics(request, template_id: Optional[int] = None):
    qs = QuestionnaireAssignment.objects.all()
    if template_id:
        qs = qs.filter(template_id=template_id)
    total = qs.count()
    completed = qs.filter(status=AssignmentStatus.COMPLETED).count()
    overdue = qs.filter(status=AssignmentStatus.OVERDUE).count()
    avg_score = qs.filter(score__isnull=False).aggregate(avg=Avg('score'))['avg']
    return {'code': 200, 'msg': 'OK', 'data': {
        'total_assignments': total,
        'completed': completed,
        'completion_rate': round(completed / total * 100, 1) if total > 0 else 0,
        'overdue': overdue,
        'average_score': str(round(avg_score, 2)) if avg_score else None,
    }}
