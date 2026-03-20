"""
合规培训 API (REG004)
"""
from ninja import Router, Query
from apps.identity.decorators import require_permission, _get_account_from_request
from .schemas import (
    TrainingCreateIn, TrainingParticipantAddIn,
    TrainingParticipantUpdateIn, TrainingQueryParams, ErrorOut,
)
from .services import training_service as service

router = Router()


def _training_to_dict(t) -> dict:
    return {
        'id': t.id,
        'training_no': t.training_no,
        'title': t.title,
        'training_type': t.training_type,
        'training_type_display': t.get_training_type_display(),
        'status': t.status,
        'status_display': t.get_status_display(),
        'training_date': str(t.training_date) if t.training_date else None,
        'duration_hours': float(t.duration_hours),
        'location': t.location,
        'trainer': t.trainer,
        'content': t.content,
        'passing_score': t.passing_score,
        'participant_count': t.participant_count,
        'pass_count': t.pass_count,
        'pass_rate': t.pass_rate,
        'protocol_id': t.protocol_id,
        'created_at': t.create_time.isoformat(),
    }


def _participant_to_dict(p) -> dict:
    return {
        'id': p.id,
        'training_id': p.training_id,
        'staff_id': p.staff_id,
        'staff_name': p.staff_name,
        'attended': p.attended,
        'exam_score': p.exam_score,
        'passed': p.passed,
        'certificate_no': p.certificate_no,
        'feedback': p.feedback,
        'satisfaction_score': p.satisfaction_score,
    }


@router.post('/trainings', summary='创建合规培训')
@require_permission('ethics.training.create')
def create_training(request, data: TrainingCreateIn):
    account = _get_account_from_request(request)
    training = service.create_training(
        title=data.title,
        training_type=data.training_type,
        training_date=data.training_date,
        duration_hours=data.duration_hours or 0,
        location=data.location or '',
        trainer=data.trainer or '',
        content=data.content or '',
        passing_score=data.passing_score or 60,
        protocol_id=data.protocol_id,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '培训创建成功', 'data': _training_to_dict(training)}


@router.get('/trainings', summary='培训列表')
@require_permission('ethics.training.read')
def list_trainings(request, params: TrainingQueryParams = Query(...)):
    result = service.list_trainings(
        training_type=params.training_type,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_training_to_dict(t) for t in result['items']],
            'total': result['total'],
        },
    }


@router.get('/trainings/{training_id}', summary='培训详情', response={200: dict, 404: ErrorOut})
@require_permission('ethics.training.read')
def get_training(request, training_id: int):
    training = service.get_training(training_id)
    if not training:
        return 404, {'code': 404, 'msg': '培训不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _training_to_dict(training)}


@router.get('/trainings/{training_id}/participants', summary='培训参与者列表')
@require_permission('ethics.training.read')
def list_participants(request, training_id: int):
    participants = service.list_participants(training_id)
    return {'code': 200, 'msg': 'OK', 'data': [_participant_to_dict(p) for p in participants]}


@router.post('/trainings/{training_id}/participants', summary='添加参与者', response={200: dict, 400: ErrorOut})
@require_permission('ethics.training.create')
def add_participant(request, training_id: int, data: TrainingParticipantAddIn):
    participant = service.add_participant(
        training_id=training_id,
        staff_id=data.staff_id,
        staff_name=data.staff_name or '',
    )
    if not participant:
        return 400, {'code': 400, 'msg': '添加失败：培训不存在'}
    return {'code': 200, 'msg': '参与者已添加', 'data': _participant_to_dict(participant)}


@router.put('/training-participants/{participant_id}', summary='更新参与者信息', response={200: dict, 400: ErrorOut})
@require_permission('ethics.training.create')
def update_participant(request, participant_id: int, data: TrainingParticipantUpdateIn):
    participant = service.update_participant(
        participant_id=participant_id,
        attended=data.attended,
        exam_score=data.exam_score,
        feedback=data.feedback,
        satisfaction_score=data.satisfaction_score,
    )
    if not participant:
        return 400, {'code': 400, 'msg': '更新失败'}
    return {'code': 200, 'msg': '更新成功', 'data': _participant_to_dict(participant)}
