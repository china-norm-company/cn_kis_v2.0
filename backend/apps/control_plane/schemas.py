from typing import List

from ninja import Schema


class ManagedObjectOut(Schema):
    id: str
    asset_code: str
    name: str
    type: str
    subtype: str
    zone: str
    location: str
    owner: str
    status: str
    risk_level: str
    last_seen_at: str
    summary: str


class UnifiedEventOut(Schema):
    id: str
    title: str
    category: str
    severity: str
    status: str
    source_object_id: str
    location: str
    detected_at: str
    owner: str
    summary: str


class TicketOut(Schema):
    id: str
    title: str
    related_event_id: str
    assignee: str
    status: str
    updated_at: str


class DashboardSummaryOut(Schema):
    object_count: int
    open_event_count: int
    processing_ticket_count: int
    high_risk_objects: List[ManagedObjectOut]
    open_events: List[UnifiedEventOut]


class TicketTransitionIn(Schema):
    """工单状态流转请求体"""
    status: str  # todo | processing | done
