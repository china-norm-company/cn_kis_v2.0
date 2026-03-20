"""
伦理管理 Schema 定义
"""
from ninja import Schema
from typing import Optional, List, Any
from datetime import date


class ErrorOut(Schema):
    code: int
    msg: str
    data: Any = None


# ============================================================================
# 审查意见
# ============================================================================

class ReviewOpinionCreateIn(Schema):
    application_id: int
    opinion_type: str
    review_date: date
    summary: str
    detailed_opinion: str
    modification_requirements: Optional[str] = ''
    reviewer_names: Optional[List[str]] = []
    response_required: Optional[bool] = False
    response_deadline: Optional[date] = None


class ReviewOpinionRespondIn(Schema):
    response_text: str


class ReviewOpinionQueryParams(Schema):
    application_id: Optional[int] = None
    opinion_type: Optional[str] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 监督
# ============================================================================

class SupervisionCreateIn(Schema):
    protocol_id: int
    supervision_type: str
    planned_date: Optional[date] = None
    scope: Optional[str] = ''
    notes: Optional[str] = ''
    supervisor_names: Optional[List[str]] = []


class SupervisionStatusUpdateIn(Schema):
    status: str
    findings: Optional[str] = ''
    corrective_actions: Optional[str] = ''
    corrective_deadline: Optional[date] = None
    verification_notes: Optional[str] = ''


class SupervisionQueryParams(Schema):
    protocol_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 法规
# ============================================================================

class RegulationCreateIn(Schema):
    title: str
    regulation_type: str
    publish_date: Optional[date] = None
    effective_date: Optional[date] = None
    issuing_authority: Optional[str] = ''
    document_number: Optional[str] = ''
    summary: Optional[str] = ''
    key_requirements: Optional[str] = ''
    impact_level: Optional[str] = 'medium'
    affected_areas: Optional[List[str]] = []
    impact_analysis: Optional[str] = ''
    action_items: Optional[str] = ''
    action_deadline: Optional[date] = None


class RegulationUpdateIn(Schema):
    title: Optional[str] = None
    regulation_type: Optional[str] = None
    publish_date: Optional[date] = None
    effective_date: Optional[date] = None
    issuing_authority: Optional[str] = None
    summary: Optional[str] = None
    impact_level: Optional[str] = None
    status: Optional[str] = None
    action_items: Optional[str] = None
    action_deadline: Optional[date] = None
    action_completed: Optional[bool] = None


class RegulationQueryParams(Schema):
    regulation_type: Optional[str] = None
    status: Optional[str] = None
    impact_level: Optional[str] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 合规检查
# ============================================================================

class ComplianceCheckCreateIn(Schema):
    check_type: str
    scope: str
    check_date: Optional[date] = None
    lead_auditor: Optional[str] = ''
    team_members: Optional[List[str]] = []
    protocol_id: Optional[int] = None
    notes: Optional[str] = ''


class ComplianceFindingCreateIn(Schema):
    check_id: int
    severity: str
    description: str
    evidence: Optional[str] = ''
    corrective_action: Optional[str] = ''
    corrective_deadline: Optional[date] = None
    related_deviation_id: Optional[int] = None
    related_capa_id: Optional[int] = None


class FindingCloseIn(Schema):
    verified_by: str


class ComplianceCheckQueryParams(Schema):
    check_type: Optional[str] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 监管沟通
# ============================================================================

class CorrespondenceCreateIn(Schema):
    direction: str
    subject: str
    content: Optional[str] = ''
    counterpart: Optional[str] = ''
    contact_person: Optional[str] = ''
    correspondence_date: Optional[date] = None
    reply_deadline: Optional[date] = None
    parent_id: Optional[int] = None
    protocol_id: Optional[int] = None
    attachment_urls: Optional[List[str]] = []


class CorrespondenceQueryParams(Schema):
    direction: Optional[str] = None
    status: Optional[str] = None
    protocol_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


# ============================================================================
# 培训
# ============================================================================

class TrainingCreateIn(Schema):
    title: str
    training_type: str
    training_date: Optional[date] = None
    duration_hours: Optional[float] = 0
    location: Optional[str] = ''
    trainer: Optional[str] = ''
    content: Optional[str] = ''
    passing_score: Optional[int] = 60
    protocol_id: Optional[int] = None


class TrainingParticipantAddIn(Schema):
    staff_id: int
    staff_name: Optional[str] = ''


class TrainingParticipantUpdateIn(Schema):
    attended: Optional[bool] = None
    exam_score: Optional[int] = None
    feedback: Optional[str] = None
    satisfaction_score: Optional[int] = None


class TrainingQueryParams(Schema):
    training_type: Optional[str] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20
