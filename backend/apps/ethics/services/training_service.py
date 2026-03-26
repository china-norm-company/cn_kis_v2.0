"""
合规培训服务

核心逻辑：
- 创建培训 → 添加参与者 → 考核评分 → 自动判定通过 → 证书编号生成
"""
import logging
from typing import Optional
from django.db import transaction
from django.utils import timezone

from apps.ethics.models_training import (
    ComplianceTraining, TrainingParticipant,
)

logger = logging.getLogger(__name__)


def _generate_training_no() -> str:
    now = timezone.now()
    prefix = f'CT-{now.strftime("%Y%m%d")}'
    count = ComplianceTraining.objects.filter(
        training_no__startswith=prefix
    ).count()
    return f'{prefix}-{count + 1:03d}'


def _generate_certificate_no(training_no: str, participant_index: int) -> str:
    return f'CERT-{training_no}-{participant_index:03d}'


def create_training(
    title: str,
    training_type: str,
    training_date=None,
    duration_hours: float = 0,
    location: str = '',
    trainer: str = '',
    content: str = '',
    passing_score: int = 60,
    protocol_id: int = None,
    created_by_id: int = None,
) -> ComplianceTraining:
    return ComplianceTraining.objects.create(
        training_no=_generate_training_no(),
        title=title,
        training_type=training_type,
        training_date=training_date,
        duration_hours=duration_hours,
        location=location,
        trainer=trainer,
        content=content,
        passing_score=passing_score,
        protocol_id=protocol_id,
        created_by_id=created_by_id,
    )


def get_training(training_id: int) -> Optional[ComplianceTraining]:
    return ComplianceTraining.objects.filter(id=training_id).first()


def list_trainings(
    training_type: str = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ComplianceTraining.objects.all()
    if training_type:
        qs = qs.filter(training_type=training_type)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


@transaction.atomic
def add_participant(
    training_id: int,
    staff_id: int,
    staff_name: str = '',
) -> Optional[TrainingParticipant]:
    training = get_training(training_id)
    if not training:
        return None

    participant, created = TrainingParticipant.objects.get_or_create(
        training=training,
        staff_id=staff_id,
        defaults={'staff_name': staff_name},
    )
    if created:
        training.update_counts()
    return participant


@transaction.atomic
def update_participant(
    participant_id: int,
    attended: bool = None,
    exam_score: int = None,
    feedback: str = None,
    satisfaction_score: int = None,
) -> Optional[TrainingParticipant]:
    try:
        participant = TrainingParticipant.objects.select_related('training').get(id=participant_id)
    except TrainingParticipant.DoesNotExist:
        return None

    update_fields = ['update_time']

    if attended is not None:
        participant.attended = attended
        update_fields.append('attended')

    if exam_score is not None:
        participant.exam_score = exam_score
        update_fields.append('exam_score')
        passed = exam_score >= participant.training.passing_score
        participant.passed = passed
        update_fields.append('passed')
        if passed and not participant.certificate_no:
            index = TrainingParticipant.objects.filter(
                training=participant.training,
                passed=True,
            ).count() + 1
            participant.certificate_no = _generate_certificate_no(
                participant.training.training_no, index
            )
            update_fields.append('certificate_no')

    if feedback is not None:
        participant.feedback = feedback
        update_fields.append('feedback')

    if satisfaction_score is not None:
        participant.satisfaction_score = satisfaction_score
        update_fields.append('satisfaction_score')

    participant.save(update_fields=update_fields)
    participant.training.update_counts()
    return participant


def list_participants(training_id: int) -> list:
    return list(TrainingParticipant.objects.filter(training_id=training_id))
