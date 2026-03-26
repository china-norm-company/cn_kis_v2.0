"""
进思·客户台 API — 管理驾驶舱

定位：面向市场管理人员的客户价值经营平台
原则：聚合分析 + 战略管理操作，不重复采苓的日常操作功能

端点分组：
- 客户画像: /crm/clients/...         (P0 基础CRUD + 战略画像)
- 关键联系人: /crm/clients/{id}/contacts/...  (P0 关键人矩阵)
- 组织架构: /crm/clients/{id}/org-map  (P0 决策链)
- 产品矩阵: /crm/clients/{id}/product-lines/... (P1)
- 创新日历: /crm/clients/{id}/innovation-calendar/... (P1)
- 健康度: /crm/health-scores/...     (P1 监控)
- 预警: /crm/alerts/...              (P1 预警)
- 商机分析: /crm/opportunities/...    (原有保留，进思为只读分析视角)
- 工单聚合: /crm/tickets/...          (原有保留，服务质量追踪)
- 赋能: /crm/insights/... /crm/briefs/... /crm/value-tags/... (P2)
- 满意度: /crm/surveys/...           (P2)
- 里程碑: /crm/milestones/...        (P2)
- 趋势: /crm/trends/... /crm/bulletins/... (P3)
- AI洞察: /crm/clients/{id}/insight   (已有增强)
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import date
from decimal import Decimal

from . import services
from .models import (
    Client, Opportunity, Ticket,
    ClientProductLine, InnovationCalendar,
    ClientHealthScore, ClientAlert,
    ClientValueInsight, ClientBrief, ProjectValueTag,
    SatisfactionSurvey, ClientSuccessMilestone,
    ClaimTrend, MarketTrendBulletin,
)
from apps.identity.decorators import _get_account_from_request, require_permission
from apps.identity.filters import get_visible_object

router = Router()


# ============================================================================
# Schema — 客户
# ============================================================================
class ClientQueryParams(Schema):
    level: Optional[str] = None
    industry: Optional[str] = None
    company_type: Optional[str] = None
    partnership_tier: Optional[str] = None
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ClientCreateIn(Schema):
    name: str
    short_name: Optional[str] = ''
    level: Optional[str] = 'potential'
    industry: Optional[str] = ''
    contact_name: Optional[str] = ''
    contact_phone: Optional[str] = ''
    contact_email: Optional[str] = ''
    address: Optional[str] = ''
    notes: Optional[str] = ''
    company_type: Optional[str] = 'other'
    headquarters: Optional[str] = ''
    china_entity: Optional[str] = ''
    annual_revenue_estimate: Optional[str] = ''
    employee_count_range: Optional[str] = ''
    partnership_tier: Optional[str] = 'prospect'
    account_manager_id: Optional[int] = None
    main_categories: Optional[list] = None
    main_claim_types: Optional[list] = None
    regulatory_regions: Optional[list] = None
    payment_terms_days: Optional[int] = 30


class ClientUpdateIn(Schema):
    name: Optional[str] = None
    short_name: Optional[str] = None
    level: Optional[str] = None
    industry: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    company_type: Optional[str] = None
    headquarters: Optional[str] = None
    china_entity: Optional[str] = None
    annual_revenue_estimate: Optional[str] = None
    employee_count_range: Optional[str] = None
    partnership_start_date: Optional[date] = None
    partnership_tier: Optional[str] = None
    account_manager_id: Optional[int] = None
    backup_manager_id: Optional[int] = None
    main_categories: Optional[list] = None
    main_claim_types: Optional[list] = None
    preferred_test_methods: Optional[list] = None
    regulatory_regions: Optional[list] = None
    annual_project_budget: Optional[Decimal] = None
    known_competitors: Optional[list] = None
    our_share_estimate: Optional[int] = None
    competitive_advantages: Optional[list] = None
    competitive_risks: Optional[list] = None
    communication_preference: Optional[str] = None
    report_language: Optional[str] = None
    invoice_requirements: Optional[dict] = None
    payment_terms_days: Optional[int] = None


# Schema — 关键联系人
class ContactCreateIn(Schema):
    name: str
    title: Optional[str] = ''
    department: Optional[str] = ''
    role_type: Optional[str] = 'user'
    phone: Optional[str] = ''
    email: Optional[str] = ''
    wechat: Optional[str] = ''
    relationship_level: Optional[str] = 'new'
    contact_frequency_days: Optional[int] = 30
    preferences: Optional[dict] = None
    birthday: Optional[date] = None
    notes: Optional[str] = ''


class ContactUpdateIn(Schema):
    name: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    role_type: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    wechat: Optional[str] = None
    relationship_level: Optional[str] = None
    contact_frequency_days: Optional[int] = None
    preferences: Optional[dict] = None
    birthday: Optional[date] = None
    notes: Optional[str] = None


class OrgMapUpdateIn(Schema):
    org_structure: Optional[dict] = None
    decision_chain: Optional[list] = None
    budget_authority: Optional[list] = None


# Schema — 商机（保留原有）
class OpportunityQueryParams(Schema):
    client_id: Optional[int] = None
    stage: Optional[str] = None
    owner: Optional[str] = None
    page: int = 1
    page_size: int = 20


class OpportunityCreateIn(Schema):
    title: str
    client_id: int
    stage: Optional[str] = 'lead'
    estimated_amount: Optional[Decimal] = None
    probability: Optional[int] = 0
    owner: Optional[str] = ''
    expected_close_date: Optional[date] = None
    description: Optional[str] = ''


class OpportunityUpdateIn(Schema):
    title: Optional[str] = None
    stage: Optional[str] = None
    estimated_amount: Optional[Decimal] = None
    probability: Optional[int] = None
    expected_close_date: Optional[date] = None


# Schema — 工单（保留原有）
class TicketQueryParams(Schema):
    client_id: Optional[int] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    page: int = 1
    page_size: int = 20


class TicketCreateIn(Schema):
    code: str
    title: str
    client_id: int
    category: str
    priority: Optional[str] = 'medium'
    description: Optional[str] = ''
    assignee: Optional[str] = ''


class TicketUpdateIn(Schema):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None


# Schema — 产品线 (P1)
class ProductLineCreateIn(Schema):
    brand: str
    category: str
    sub_category: Optional[str] = ''
    price_tier: Optional[str] = 'mid'
    annual_sku_count: Optional[int] = 0
    typical_claims: Optional[list] = None
    notes: Optional[str] = ''


class ProductLineUpdateIn(Schema):
    brand: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    price_tier: Optional[str] = None
    annual_sku_count: Optional[int] = None
    typical_claims: Optional[list] = None
    notes: Optional[str] = None


# Schema — 创新日历 (P1)
class InnovationCalendarCreateIn(Schema):
    year: int
    season: str
    product_concept: str
    innovation_type: str
    product_line_id: Optional[int] = None
    launch_date: Optional[date] = None
    test_requirements: Optional[list] = None
    status: Optional[str] = 'intelligence'
    our_opportunity: Optional[str] = ''
    competitor_info: Optional[str] = ''


class InnovationCalendarUpdateIn(Schema):
    year: Optional[int] = None
    season: Optional[str] = None
    product_concept: Optional[str] = None
    innovation_type: Optional[str] = None
    product_line_id: Optional[int] = None
    launch_date: Optional[date] = None
    test_requirements: Optional[list] = None
    status: Optional[str] = None
    our_opportunity: Optional[str] = None
    competitor_info: Optional[str] = None


# Schema — 预警 (P1)
class AlertQueryParams(Schema):
    client_id: Optional[int] = None
    alert_type: Optional[str] = None
    severity: Optional[str] = None
    resolved: Optional[bool] = None
    page: int = 1
    page_size: int = 20


class AlertResolveIn(Schema):
    resolved_note: Optional[str] = ''


# Schema — 价值洞察 (P2)
class ValueInsightCreateIn(Schema):
    client_id: int
    insight_type: str
    title: str
    content: str
    source: Optional[str] = 'manual'


class ValueInsightUpdateIn(Schema):
    title: Optional[str] = None
    content: Optional[str] = None
    client_feedback: Optional[str] = None
    shared_with: Optional[list] = None
    led_to_opportunity_id: Optional[int] = None


# Schema — 客户简报 (P2)
class BriefCreateIn(Schema):
    client_id: int
    brief_type: str
    title: str
    client_strategy: Optional[str] = ''
    market_context: Optional[str] = ''
    competition_landscape: Optional[str] = ''
    client_pain_points: Optional[list] = None
    quality_expectations: Optional[list] = None
    communication_tips: Optional[list] = None
    key_contacts: Optional[list] = None
    target_roles: Optional[list] = None


class BriefUpdateIn(Schema):
    title: Optional[str] = None
    client_strategy: Optional[str] = None
    market_context: Optional[str] = None
    competition_landscape: Optional[str] = None
    client_pain_points: Optional[list] = None
    quality_expectations: Optional[list] = None
    communication_tips: Optional[list] = None
    key_contacts: Optional[list] = None
    target_roles: Optional[list] = None


# Schema — 项目价值标注 (P2)
class ValueTagCreateIn(Schema):
    protocol_id: int
    strategic_importance: Optional[str] = 'normal'
    client_sensitivity: Optional[str] = ''
    delivery_emphasis: Optional[list] = None
    upsell_potential: Optional[str] = ''
    competitor_context: Optional[str] = ''
    expected_timeline_note: Optional[str] = ''
    quality_bar: Optional[str] = ''
    report_format_preference: Optional[str] = ''


class ValueTagUpdateIn(Schema):
    strategic_importance: Optional[str] = None
    client_sensitivity: Optional[str] = None
    delivery_emphasis: Optional[list] = None
    upsell_potential: Optional[str] = None
    competitor_context: Optional[str] = None
    expected_timeline_note: Optional[str] = None
    quality_bar: Optional[str] = None
    report_format_preference: Optional[str] = None


# Schema — 满意度 (P2)
class SurveyCreateIn(Schema):
    client_id: int
    survey_type: str
    protocol_id: Optional[int] = None
    overall_satisfaction: int = 0
    quality_score: int = 0
    timeliness_score: int = 0
    communication_score: int = 0
    innovation_score: int = 0
    value_score: int = 0
    nps_score: Optional[int] = None
    strengths: Optional[str] = ''
    improvements: Optional[str] = ''
    respondent_id: Optional[int] = None


class SurveyUpdateIn(Schema):
    overall_satisfaction: Optional[int] = None
    quality_score: Optional[int] = None
    timeliness_score: Optional[int] = None
    communication_score: Optional[int] = None
    innovation_score: Optional[int] = None
    value_score: Optional[int] = None
    nps_score: Optional[int] = None
    strengths: Optional[str] = None
    improvements: Optional[str] = None
    follow_up_actions: Optional[list] = None
    followed_up: Optional[bool] = None


# Schema — 里程碑 (P2)
class MilestoneCreateIn(Schema):
    client_id: int
    milestone_type: str
    title: str
    achieved_at: date
    description: Optional[str] = ''
    value: Optional[Decimal] = None


# Schema — 宣称趋势 (P3)
class ClaimTrendQueryParams(Schema):
    claim_category: Optional[str] = None
    region: Optional[str] = None
    year: Optional[int] = None
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ClaimTrendCreateIn(Schema):
    claim_category: str
    claim_text: str
    region: Optional[str] = '中国'
    regulatory_basis: Optional[str] = ''
    test_methods: Optional[list] = None
    trending_score: Optional[float] = 0
    year: int = 2026
    market_data: Optional[dict] = None
    competitor_usage: Optional[list] = None


# Schema — 市场趋势通报 (P3)
class BulletinQueryParams(Schema):
    category: Optional[str] = None
    published: Optional[bool] = None
    page: int = 1
    page_size: int = 20


class BulletinCreateIn(Schema):
    title: str
    category: str
    summary: str
    detail: str
    impact_analysis: Optional[str] = ''
    action_items: Optional[list] = None
    source_references: Optional[list] = None
    relevance_client_ids: Optional[list] = None


class BulletinUpdateIn(Schema):
    title: Optional[str] = None
    category: Optional[str] = None
    summary: Optional[str] = None
    detail: Optional[str] = None
    impact_analysis: Optional[str] = None
    action_items: Optional[list] = None
    source_references: Optional[list] = None
    relevance_client_ids: Optional[list] = None


# ============================================================================
# 辅助函数 — 序列化
# ============================================================================
def _client_to_dict(c) -> dict:
    return {
        'id': c.id, 'name': c.name, 'short_name': c.short_name,
        'level': c.level, 'industry': c.industry,
        'contact_name': c.contact_name, 'contact_phone': c.contact_phone,
        'contact_email': c.contact_email, 'address': c.address,
        'total_projects': c.total_projects,
        'total_revenue': str(c.total_revenue),
        'notes': c.notes,
        'company_type': c.company_type,
        'headquarters': c.headquarters,
        'china_entity': c.china_entity,
        'annual_revenue_estimate': c.annual_revenue_estimate,
        'employee_count_range': c.employee_count_range,
        'partnership_start_date': c.partnership_start_date.isoformat() if c.partnership_start_date else None,
        'partnership_tier': c.partnership_tier,
        'account_manager_id': c.account_manager_id,
        'backup_manager_id': c.backup_manager_id,
        'main_categories': c.main_categories,
        'main_claim_types': c.main_claim_types,
        'preferred_test_methods': c.preferred_test_methods,
        'regulatory_regions': c.regulatory_regions,
        'annual_project_budget': str(c.annual_project_budget) if c.annual_project_budget else None,
        'known_competitors': c.known_competitors,
        'our_share_estimate': c.our_share_estimate,
        'competitive_advantages': c.competitive_advantages,
        'competitive_risks': c.competitive_risks,
        'communication_preference': c.communication_preference,
        'report_language': c.report_language,
        'invoice_requirements': c.invoice_requirements,
        'payment_terms_days': c.payment_terms_days,
        'create_time': c.create_time.isoformat(),
    }


def _contact_to_dict(c) -> dict:
    return {
        'id': c.id, 'client_id': c.client_id,
        'name': c.name, 'title': c.title, 'department': c.department,
        'role_type': c.role_type,
        'phone': c.phone, 'email': c.email, 'wechat': c.wechat,
        'relationship_level': c.relationship_level,
        'last_contact_date': c.last_contact_date.isoformat() if c.last_contact_date else None,
        'contact_frequency_days': c.contact_frequency_days,
        'preferences': c.preferences,
        'birthday': c.birthday.isoformat() if c.birthday else None,
        'notes': c.notes,
        'create_time': c.create_time.isoformat(),
    }


def _opportunity_to_dict(o) -> dict:
    return {
        'id': o.id, 'title': o.title,
        'client_id': o.client_id,
        'client_name': o.client.name if o.client else '',
        'stage': o.stage,
        'estimated_amount': str(o.estimated_amount) if o.estimated_amount else '',
        'probability': o.probability,
        'owner': o.owner,
        'expected_close_date': o.expected_close_date.isoformat() if o.expected_close_date else '',
        'description': o.description,
        'create_time': o.create_time.isoformat(),
    }


def _ticket_to_dict(t) -> dict:
    return {
        'id': t.id, 'code': t.code, 'title': t.title,
        'client_id': t.client_id,
        'client_name': t.client.name if t.client else '',
        'category': t.category, 'priority': t.priority,
        'status': t.status, 'description': t.description,
        'assignee': t.assignee,
        'resolved_at': t.resolved_at.isoformat() if t.resolved_at else None,
        'create_time': t.create_time.isoformat(),
    }


def _product_line_to_dict(p) -> dict:
    return {
        'id': p.id, 'client_id': p.client_id,
        'brand': p.brand, 'category': p.category,
        'sub_category': p.sub_category, 'price_tier': p.price_tier,
        'annual_sku_count': p.annual_sku_count,
        'typical_claims': p.typical_claims, 'notes': p.notes,
        'create_time': p.create_time.isoformat(),
    }


def _innovation_to_dict(i) -> dict:
    return {
        'id': i.id, 'client_id': i.client_id,
        'product_line_id': i.product_line_id,
        'year': i.year, 'season': i.season,
        'launch_date': i.launch_date.isoformat() if i.launch_date else None,
        'product_concept': i.product_concept,
        'innovation_type': i.innovation_type,
        'test_requirements': i.test_requirements,
        'status': i.status,
        'our_opportunity': i.our_opportunity,
        'competitor_info': i.competitor_info,
        'create_time': i.create_time.isoformat(),
    }


def _alert_to_dict(a) -> dict:
    return {
        'id': a.id, 'client_id': a.client_id,
        'client_name': a.client.name if a.client else '',
        'alert_type': a.alert_type, 'severity': a.severity,
        'description': a.description,
        'suggested_action': a.suggested_action,
        'acknowledged': a.acknowledged,
        'acknowledged_at': a.acknowledged_at.isoformat() if a.acknowledged_at else None,
        'resolved': a.resolved,
        'resolved_at': a.resolved_at.isoformat() if a.resolved_at else None,
        'resolved_note': a.resolved_note,
        'create_time': a.create_time.isoformat(),
    }


def _health_score_to_dict(h) -> dict:
    return {
        'id': h.id, 'client_id': h.client_id,
        'score_date': h.score_date.isoformat(),
        'overall_score': h.overall_score,
        'engagement_score': h.engagement_score,
        'revenue_score': h.revenue_score,
        'satisfaction_score': h.satisfaction_score,
        'growth_score': h.growth_score,
        'loyalty_score': h.loyalty_score,
        'innovation_score': h.innovation_score,
        'churn_risk': h.churn_risk,
        'risk_factors': h.risk_factors,
        'recommended_actions': h.recommended_actions,
    }


def _insight_to_dict(i) -> dict:
    return {
        'id': i.id, 'client_id': i.client_id,
        'insight_type': i.insight_type, 'title': i.title,
        'content': i.content, 'source': i.source,
        'shared_with': i.shared_with,
        'shared_at': i.shared_at.isoformat() if i.shared_at else None,
        'client_feedback': i.client_feedback,
        'led_to_opportunity_id': i.led_to_opportunity_id,
        'create_time': i.create_time.isoformat(),
    }


def _brief_to_dict(b) -> dict:
    return {
        'id': b.id, 'client_id': b.client_id,
        'brief_type': b.brief_type, 'title': b.title,
        'client_strategy': b.client_strategy,
        'market_context': b.market_context,
        'competition_landscape': b.competition_landscape,
        'client_pain_points': b.client_pain_points,
        'quality_expectations': b.quality_expectations,
        'communication_tips': b.communication_tips,
        'key_contacts': b.key_contacts,
        'target_roles': b.target_roles,
        'published': b.published,
        'published_at': b.published_at.isoformat() if b.published_at else None,
        'create_time': b.create_time.isoformat(),
    }


def _value_tag_to_dict(v) -> dict:
    return {
        'id': v.id, 'protocol_id': v.protocol_id,
        'strategic_importance': v.strategic_importance,
        'client_sensitivity': v.client_sensitivity,
        'delivery_emphasis': v.delivery_emphasis,
        'upsell_potential': v.upsell_potential,
        'competitor_context': v.competitor_context,
        'expected_timeline_note': v.expected_timeline_note,
        'quality_bar': v.quality_bar,
        'report_format_preference': v.report_format_preference,
        'create_time': v.create_time.isoformat(),
    }


def _survey_to_dict(s) -> dict:
    return {
        'id': s.id, 'client_id': s.client_id,
        'protocol_id': s.protocol_id,
        'survey_type': s.survey_type,
        'overall_satisfaction': s.overall_satisfaction,
        'quality_score': s.quality_score,
        'timeliness_score': s.timeliness_score,
        'communication_score': s.communication_score,
        'innovation_score': s.innovation_score,
        'value_score': s.value_score,
        'nps_score': s.nps_score,
        'strengths': s.strengths, 'improvements': s.improvements,
        'respondent_id': s.respondent_id,
        'follow_up_actions': s.follow_up_actions,
        'followed_up': s.followed_up,
        'create_time': s.create_time.isoformat(),
    }


def _milestone_to_dict(m) -> dict:
    return {
        'id': m.id, 'client_id': m.client_id,
        'milestone_type': m.milestone_type, 'title': m.title,
        'achieved_at': m.achieved_at.isoformat(),
        'description': m.description,
        'value': str(m.value) if m.value else None,
        'create_time': m.create_time.isoformat(),
    }


def _claim_trend_to_dict(c) -> dict:
    return {
        'id': c.id, 'claim_category': c.claim_category,
        'claim_text': c.claim_text, 'region': c.region,
        'regulatory_basis': c.regulatory_basis,
        'test_methods': c.test_methods,
        'trending_score': c.trending_score, 'year': c.year,
        'market_data': c.market_data,
        'competitor_usage': c.competitor_usage,
    }


def _bulletin_to_dict(b) -> dict:
    return {
        'id': b.id, 'title': b.title, 'category': b.category,
        'summary': b.summary, 'detail': b.detail,
        'impact_analysis': b.impact_analysis,
        'action_items': b.action_items,
        'source_references': b.source_references,
        'ai_generated': b.ai_generated,
        'relevance_client_ids': b.relevance_client_ids,
        'published': b.published,
        'published_at': b.published_at.isoformat() if b.published_at else None,
        'create_time': b.create_time.isoformat(),
    }


# ============================================================================
# 客户 API (P0)
# ============================================================================
@router.get('/clients/list', summary='客户组合总览')
@require_permission('crm.client.read')
def list_clients(request, params: ClientQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_clients(
        level=params.level, industry=params.industry,
        company_type=params.company_type, partnership_tier=params.partnership_tier,
        keyword=params.keyword, page=params.page, page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_client_to_dict(c) for c in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/clients/stats', summary='客户统计')
@require_permission('crm.client.read')
def client_stats(request):
    try:
        return {'code': 200, 'msg': 'OK', 'data': services.get_client_stats()}
    except Exception as e:
        return 500, {'code': 500, 'msg': f'客户统计加载失败: {e!s}', 'data': None}


@router.post('/clients/create', summary='创建客户')
@require_permission('crm.client.create')
def create_client(request, data: ClientCreateIn):
    kwargs = data.dict(exclude_unset=True)
    account = _get_account_from_request(request)
    if account:
        kwargs['created_by_id'] = account.id
    c = services.create_client(**kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _client_to_dict(c)}


@router.get('/clients/{client_id}', summary='客户全景详情')
@require_permission('crm.client.read')
def get_client(request, client_id: int):
    account = _get_account_from_request(request)
    c = get_visible_object(Client.objects.filter(id=client_id, is_deleted=False), account)
    if not c:
        return 404, {'code': 404, 'msg': '客户不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _client_to_dict(c)}


@router.put('/clients/{client_id}', summary='更新客户战略画像')
@require_permission('crm.client.update')
def update_client(request, client_id: int, data: ClientUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Client.objects.filter(id=client_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '客户不存在'}
    c = services.update_client(client_id, **data.dict(exclude_unset=True))
    if not c:
        return 404, {'code': 404, 'msg': '客户不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _client_to_dict(c)}


@router.delete('/clients/{client_id}', summary='删除客户')
@require_permission('crm.client.update')
def delete_client(request, client_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Client.objects.filter(id=client_id, is_deleted=False), account):
        return 404, {'code': 404, 'msg': '客户不存在'}
    ok = services.delete_client(client_id)
    if not ok:
        return 404, {'code': 404, 'msg': '客户不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 关键联系人 API (P0)
# ============================================================================
@router.get('/clients/{client_id}/contacts', summary='关键联系人列表')
@require_permission('crm.contact.read')
def list_contacts(request, client_id: int):
    from .services.contact_service import list_contacts as _list
    items = _list(client_id)
    return {'code': 200, 'msg': 'OK', 'data': [_contact_to_dict(c) for c in items]}


@router.post('/clients/{client_id}/contacts', summary='添加关键联系人')
@require_permission('crm.contact.create')
def create_contact(request, client_id: int, data: ContactCreateIn):
    from .services.contact_service import create_contact as _create
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    c = _create(client_id, **kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _contact_to_dict(c)}


@router.put('/contacts/{contact_id}', summary='更新关键联系人')
@require_permission('crm.contact.update')
def update_contact(request, contact_id: int, data: ContactUpdateIn):
    from .services.contact_service import update_contact as _update
    c = _update(contact_id, **data.dict(exclude_unset=True))
    if not c:
        return 404, {'code': 404, 'msg': '联系人不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _contact_to_dict(c)}


@router.delete('/contacts/{contact_id}', summary='删除关键联系人')
@require_permission('crm.contact.update')
def delete_contact(request, contact_id: int):
    from .services.contact_service import delete_contact as _delete
    ok = _delete(contact_id)
    if not ok:
        return 404, {'code': 404, 'msg': '联系人不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.get('/contacts/overdue', summary='超期未联系提醒')
@require_permission('crm.contact.read')
def overdue_contacts(request):
    try:
        from .services.contact_service import get_overdue_contacts
        items = get_overdue_contacts()
        return {'code': 200, 'msg': 'OK', 'data': [_contact_to_dict(c) for c in items]}
    except Exception as e:
        return 500, {'code': 500, 'msg': f'超期联系列表加载失败: {e!s}', 'data': None}


@router.post('/contacts/{contact_id}/record-contact', summary='记录联系')
@require_permission('crm.contact.update')
def record_contact(request, contact_id: int):
    from .services.contact_service import record_contact as _record
    c = _record(contact_id)
    if not c:
        return 404, {'code': 404, 'msg': '联系人不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _contact_to_dict(c)}


# ============================================================================
# 组织架构 API (P0)
# ============================================================================
@router.get('/clients/{client_id}/org-map', summary='获取组织架构')
@require_permission('crm.client.read')
def get_org_map(request, client_id: int):
    from .services.contact_service import get_org_map as _get
    data = _get(client_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.put('/clients/{client_id}/org-map', summary='更新组织架构')
@require_permission('crm.client.update')
def update_org_map(request, client_id: int, data: OrgMapUpdateIn):
    from .services.contact_service import update_org_map as _update
    result = _update(client_id, **data.dict(exclude_unset=True))
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# 产品线 API (P1)
# ============================================================================
@router.get('/clients/{client_id}/product-lines', summary='客户产品线列表')
@require_permission('crm.client.read')
def list_product_lines(request, client_id: int):
    items = ClientProductLine.objects.filter(client_id=client_id, is_deleted=False)
    return {'code': 200, 'msg': 'OK', 'data': [_product_line_to_dict(p) for p in items]}


@router.post('/clients/{client_id}/product-lines', summary='添加产品线')
@require_permission('crm.client.update')
def create_product_line(request, client_id: int, data: ProductLineCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    p = ClientProductLine.objects.create(client_id=client_id, **kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _product_line_to_dict(p)}


@router.put('/product-lines/{pl_id}', summary='更新产品线')
@require_permission('crm.client.update')
def update_product_line(request, pl_id: int, data: ProductLineUpdateIn):
    p = ClientProductLine.objects.filter(id=pl_id, is_deleted=False).first()
    if not p:
        return 404, {'code': 404, 'msg': '产品线不存在'}
    for k, v in data.dict(exclude_unset=True).items():
        if v is not None and hasattr(p, k):
            setattr(p, k, v)
    p.save()
    return {'code': 200, 'msg': 'OK', 'data': _product_line_to_dict(p)}


@router.delete('/product-lines/{pl_id}', summary='删除产品线')
@require_permission('crm.client.update')
def delete_product_line(request, pl_id: int):
    p = ClientProductLine.objects.filter(id=pl_id, is_deleted=False).first()
    if not p:
        return 404, {'code': 404, 'msg': '产品线不存在'}
    p.is_deleted = True
    p.save(update_fields=['is_deleted', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 创新日历 API (P1)
# ============================================================================
@router.get('/clients/{client_id}/innovation-calendar', summary='创新日历列表')
@require_permission('crm.client.read')
def list_innovation_calendar(request, client_id: int):
    items = InnovationCalendar.objects.filter(client_id=client_id, is_deleted=False)
    return {'code': 200, 'msg': 'OK', 'data': [_innovation_to_dict(i) for i in items]}


@router.post('/clients/{client_id}/innovation-calendar', summary='添加创新日历')
@require_permission('crm.client.update')
def create_innovation_calendar(request, client_id: int, data: InnovationCalendarCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    i = InnovationCalendar.objects.create(client_id=client_id, **kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _innovation_to_dict(i)}


@router.put('/innovation-calendar/{ic_id}', summary='更新创新日历')
@require_permission('crm.client.update')
def update_innovation_calendar(request, ic_id: int, data: InnovationCalendarUpdateIn):
    i = InnovationCalendar.objects.filter(id=ic_id, is_deleted=False).first()
    if not i:
        return 404, {'code': 404, 'msg': '创新日历不存在'}
    for k, v in data.dict(exclude_unset=True).items():
        if v is not None and hasattr(i, k):
            setattr(i, k, v)
    i.save()
    return {'code': 200, 'msg': 'OK', 'data': _innovation_to_dict(i)}


@router.delete('/innovation-calendar/{ic_id}', summary='删除创新日历')
@require_permission('crm.client.update')
def delete_innovation_calendar(request, ic_id: int):
    i = InnovationCalendar.objects.filter(id=ic_id, is_deleted=False).first()
    if not i:
        return 404, {'code': 404, 'msg': '创新日历不存在'}
    i.is_deleted = True
    i.save(update_fields=['is_deleted', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 健康度 API (P1)
# ============================================================================
@router.get('/clients/{client_id}/health-score', summary='客户最新健康度')
@require_permission('crm.client.read')
def get_health_score(request, client_id: int):
    h = ClientHealthScore.objects.filter(client_id=client_id).order_by('-score_date').first()
    if not h:
        return {'code': 200, 'msg': 'OK', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _health_score_to_dict(h)}


@router.get('/health-scores/overview', summary='全局健康度总览')
@require_permission('crm.client.read')
def health_scores_overview(request):
    try:
        from .services.health_service import get_health_overview
        return {'code': 200, 'msg': 'OK', 'data': get_health_overview()}
    except Exception as e:
        return 500, {'code': 500, 'msg': f'健康度总览加载失败: {e!s}', 'data': None}


@router.post('/health-scores/calculate/{client_id}', summary='触发健康度计算')
@require_permission('crm.client.update')
def trigger_health_calculation(request, client_id: int):
    from .services.health_service import calculate_health_score
    score = calculate_health_score(client_id)
    if not score:
        return 404, {'code': 404, 'msg': '客户不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _health_score_to_dict(score)}


# ============================================================================
# 预警 API (P1)
# ============================================================================
@router.get('/alerts/list', summary='预警列表')
@require_permission('crm.client.read')
def list_alerts(request, params: AlertQueryParams = Query(...)):
    qs = ClientAlert.objects.select_related('client').order_by('-create_time')
    if params.client_id:
        qs = qs.filter(client_id=params.client_id)
    if params.alert_type:
        qs = qs.filter(alert_type=params.alert_type)
    if params.severity:
        qs = qs.filter(severity=params.severity)
    if params.resolved is not None:
        qs = qs.filter(resolved=params.resolved)
    total = qs.count()
    offset = (params.page - 1) * params.page_size
    items = list(qs[offset:offset + params.page_size])
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_alert_to_dict(a) for a in items],
            'total': total, 'page': params.page, 'page_size': params.page_size,
        },
    }


@router.get('/alerts/stats', summary='预警统计')
@require_permission('crm.client.read')
def alert_stats(request):
    try:
        from django.db.models import Count
        qs = ClientAlert.objects.filter(resolved=False)
        by_type = qs.values('alert_type').annotate(count=Count('id'))
        by_severity = qs.values('severity').annotate(count=Count('id'))
        return {'code': 200, 'msg': 'OK', 'data': {
            'total_unresolved': qs.count(),
            'by_type': {i['alert_type']: i['count'] for i in by_type},
            'by_severity': {i['severity']: i['count'] for i in by_severity},
        }}
    except Exception as e:
        return 500, {'code': 500, 'msg': f'预警统计加载失败: {e!s}', 'data': None}


@router.put('/alerts/{alert_id}/acknowledge', summary='确认预警')
@require_permission('crm.client.update')
def acknowledge_alert(request, alert_id: int):
    from django.utils import timezone
    a = ClientAlert.objects.filter(id=alert_id).first()
    if not a:
        return 404, {'code': 404, 'msg': '预警不存在'}
    account = _get_account_from_request(request)
    a.acknowledged = True
    a.acknowledged_at = timezone.now()
    if account:
        a.acknowledged_by_id = account.id
    a.save()
    return {'code': 200, 'msg': 'OK', 'data': _alert_to_dict(a)}


@router.put('/alerts/{alert_id}/resolve', summary='解决预警')
@require_permission('crm.client.update')
def resolve_alert(request, alert_id: int, data: AlertResolveIn):
    from django.utils import timezone
    a = ClientAlert.objects.filter(id=alert_id).first()
    if not a:
        return 404, {'code': 404, 'msg': '预警不存在'}
    a.resolved = True
    a.resolved_at = timezone.now()
    a.resolved_note = data.resolved_note or ''
    a.save()
    return {'code': 200, 'msg': 'OK', 'data': _alert_to_dict(a)}


# ============================================================================
# 商机 API（保留原有，进思为管道分析视角）
# ============================================================================
@router.get('/opportunities/list', summary='商机列表')
@require_permission('crm.opportunity.read')
def list_opportunities(request, params: OpportunityQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_opportunities(
        client_id=params.client_id, stage=params.stage,
        owner=params.owner, page=params.page, page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_opportunity_to_dict(o) for o in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/opportunities/stats', summary='管道分析统计')
@require_permission('crm.opportunity.read')
def opportunity_stats(request):
    try:
        return {'code': 200, 'msg': 'OK', 'data': services.get_opportunity_stats()}
    except Exception as e:
        return 500, {'code': 500, 'msg': f'商机统计加载失败: {e!s}', 'data': None}


@router.post('/opportunities/create', summary='创建商机')
@require_permission('crm.opportunity.create')
def create_opportunity(request, data: OpportunityCreateIn):
    o = services.create_opportunity(
        title=data.title, client_id=data.client_id,
        stage=data.stage or 'lead',
        estimated_amount=data.estimated_amount,
        probability=data.probability or 0, owner=data.owner or '',
        expected_close_date=data.expected_close_date,
        description=data.description or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _opportunity_to_dict(o)}


@router.get('/opportunities/{opp_id}', summary='商机详情')
@require_permission('crm.opportunity.read')
def get_opportunity(request, opp_id: int):
    account = _get_account_from_request(request)
    o = get_visible_object(Opportunity.objects.filter(id=opp_id), account)
    if not o:
        return 404, {'code': 404, 'msg': '商机不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _opportunity_to_dict(o)}


@router.put('/opportunities/{opp_id}', summary='更新商机')
@require_permission('crm.opportunity.update')
def update_opportunity(request, opp_id: int, data: OpportunityUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Opportunity.objects.filter(id=opp_id), account):
        return 404, {'code': 404, 'msg': '商机不存在'}
    o = services.update_opportunity(opp_id, **data.dict(exclude_unset=True))
    if not o:
        return 404, {'code': 404, 'msg': '商机不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _opportunity_to_dict(o)}


@router.delete('/opportunities/{opp_id}', summary='删除商机')
@require_permission('crm.opportunity.update')
def delete_opportunity(request, opp_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Opportunity.objects.filter(id=opp_id), account):
        return 404, {'code': 404, 'msg': '商机不存在'}
    ok = services.delete_opportunity(opp_id)
    if not ok:
        return 404, {'code': 404, 'msg': '商机不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 工单 API（保留原有，进思为服务质量追踪视角）
# ============================================================================
@router.get('/tickets/list', summary='工单列表')
@require_permission('crm.ticket.read')
def list_tickets(request, params: TicketQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_tickets(
        client_id=params.client_id, status=params.status,
        priority=params.priority, page=params.page, page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_ticket_to_dict(t) for t in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/tickets/stats', summary='服务质量统计')
@require_permission('crm.ticket.read')
def ticket_stats(request):
    return {'code': 200, 'msg': 'OK', 'data': services.get_ticket_stats()}


@router.post('/tickets/create', summary='创建工单')
@require_permission('crm.ticket.create')
def create_ticket(request, data: TicketCreateIn):
    t = services.create_ticket(
        code=data.code, title=data.title, client_id=data.client_id,
        category=data.category, priority=data.priority or 'medium',
        description=data.description or '', assignee=data.assignee or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _ticket_to_dict(t)}


@router.get('/tickets/{ticket_id}', summary='工单详情')
@require_permission('crm.ticket.read')
def get_ticket(request, ticket_id: int):
    account = _get_account_from_request(request)
    t = get_visible_object(Ticket.objects.filter(id=ticket_id), account)
    if not t:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _ticket_to_dict(t)}


@router.put('/tickets/{ticket_id}', summary='更新工单')
@require_permission('crm.ticket.create')
def update_ticket(request, ticket_id: int, data: TicketUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Ticket.objects.filter(id=ticket_id), account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    t = services.update_ticket(ticket_id, **data.dict(exclude_unset=True))
    if not t:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _ticket_to_dict(t)}


@router.delete('/tickets/{ticket_id}', summary='删除工单')
@require_permission('crm.ticket.create')
def delete_ticket(request, ticket_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Ticket.objects.filter(id=ticket_id), account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    ok = services.delete_ticket(ticket_id)
    if not ok:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 价值洞察 API (P2)
# ============================================================================
@router.get('/insights/list', summary='价值洞察列表')
@require_permission('crm.client.read')
def list_insights(request, client_id: Optional[int] = None, page: int = 1, page_size: int = 20):
    qs = ClientValueInsight.objects.filter(is_deleted=False).order_by('-create_time')
    if client_id:
        qs = qs.filter(client_id=client_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_insight_to_dict(i) for i in items],
        'total': total, 'page': page, 'page_size': page_size,
    }}


@router.post('/insights/create', summary='创建价值洞察')
@require_permission('crm.client.update')
def create_insight(request, data: ValueInsightCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    i = ClientValueInsight.objects.create(**kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _insight_to_dict(i)}


@router.put('/insights/{insight_id}', summary='更新价值洞察')
@require_permission('crm.client.update')
def update_insight(request, insight_id: int, data: ValueInsightUpdateIn):
    i = ClientValueInsight.objects.filter(id=insight_id, is_deleted=False).first()
    if not i:
        return 404, {'code': 404, 'msg': '洞察不存在'}
    for k, v in data.dict(exclude_unset=True).items():
        if v is not None and hasattr(i, k):
            setattr(i, k, v)
    i.save()
    return {'code': 200, 'msg': 'OK', 'data': _insight_to_dict(i)}


@router.post('/insights/{insight_id}/share', summary='推送洞察给客户')
@require_permission('crm.client.update')
def share_insight(request, insight_id: int):
    from django.utils import timezone
    i = ClientValueInsight.objects.filter(id=insight_id, is_deleted=False).first()
    if not i:
        return 404, {'code': 404, 'msg': '洞察不存在'}
    i.shared_at = timezone.now()
    i.save(update_fields=['shared_at', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': _insight_to_dict(i)}


# ============================================================================
# 客户简报 API (P2)
# ============================================================================
@router.get('/briefs/list', summary='客户简报列表')
@require_permission('crm.client.read')
def list_briefs(request, client_id: Optional[int] = None, page: int = 1, page_size: int = 20):
    qs = ClientBrief.objects.filter(is_deleted=False).order_by('-create_time')
    if client_id:
        qs = qs.filter(client_id=client_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_brief_to_dict(b) for b in items],
        'total': total, 'page': page, 'page_size': page_size,
    }}


@router.post('/briefs/create', summary='创建客户简报')
@require_permission('crm.client.update')
def create_brief(request, data: BriefCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    b = ClientBrief.objects.create(**kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _brief_to_dict(b)}


@router.put('/briefs/{brief_id}', summary='更新客户简报')
@require_permission('crm.client.update')
def update_brief(request, brief_id: int, data: BriefUpdateIn):
    b = ClientBrief.objects.filter(id=brief_id, is_deleted=False).first()
    if not b:
        return 404, {'code': 404, 'msg': '简报不存在'}
    for k, v in data.dict(exclude_unset=True).items():
        if v is not None and hasattr(b, k):
            setattr(b, k, v)
    b.save()
    return {'code': 200, 'msg': 'OK', 'data': _brief_to_dict(b)}


@router.post('/briefs/{brief_id}/publish', summary='发布客户简报')
@require_permission('crm.client.update')
def publish_brief(request, brief_id: int):
    from django.utils import timezone
    b = ClientBrief.objects.filter(id=brief_id, is_deleted=False).first()
    if not b:
        return 404, {'code': 404, 'msg': '简报不存在'}
    b.published = True
    b.published_at = timezone.now()
    b.save(update_fields=['published', 'published_at', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': _brief_to_dict(b)}


# ============================================================================
# 项目价值标注 API (P2)
# ============================================================================
@router.get('/value-tags/{protocol_id}', summary='获取项目价值标注')
@require_permission('crm.client.read')
def get_value_tag(request, protocol_id: int):
    v = ProjectValueTag.objects.filter(protocol_id=protocol_id).first()
    if not v:
        return {'code': 200, 'msg': 'OK', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _value_tag_to_dict(v)}


@router.post('/value-tags/create', summary='创建项目价值标注')
@require_permission('crm.client.update')
def create_value_tag(request, data: ValueTagCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    v, created = ProjectValueTag.objects.update_or_create(
        protocol_id=kwargs.pop('protocol_id'),
        defaults=kwargs,
    )
    return {'code': 200, 'msg': 'OK', 'data': _value_tag_to_dict(v)}


@router.put('/value-tags/{protocol_id}', summary='更新项目价值标注')
@require_permission('crm.client.update')
def update_value_tag(request, protocol_id: int, data: ValueTagUpdateIn):
    v = ProjectValueTag.objects.filter(protocol_id=protocol_id).first()
    if not v:
        return 404, {'code': 404, 'msg': '标注不存在'}
    for k, val in data.dict(exclude_unset=True).items():
        if val is not None and hasattr(v, k):
            setattr(v, k, val)
    v.save()
    return {'code': 200, 'msg': 'OK', 'data': _value_tag_to_dict(v)}


# ============================================================================
# 满意度调查 API (P2)
# ============================================================================
@router.get('/surveys/list', summary='满意度调查列表')
@require_permission('crm.client.read')
def list_surveys(request, client_id: Optional[int] = None, page: int = 1, page_size: int = 20):
    qs = SatisfactionSurvey.objects.filter(is_deleted=False).order_by('-create_time')
    if client_id:
        qs = qs.filter(client_id=client_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_survey_to_dict(s) for s in items],
        'total': total, 'page': page, 'page_size': page_size,
    }}


@router.post('/surveys/create', summary='创建满意度调查')
@require_permission('crm.client.update')
def create_survey(request, data: SurveyCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    s = SatisfactionSurvey.objects.create(**kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _survey_to_dict(s)}


@router.put('/surveys/{survey_id}', summary='更新满意度调查')
@require_permission('crm.client.update')
def update_survey(request, survey_id: int, data: SurveyUpdateIn):
    s = SatisfactionSurvey.objects.filter(id=survey_id, is_deleted=False).first()
    if not s:
        return 404, {'code': 404, 'msg': '调查不存在'}
    for k, v in data.dict(exclude_unset=True).items():
        if v is not None and hasattr(s, k):
            setattr(s, k, v)
    s.save()
    return {'code': 200, 'msg': 'OK', 'data': _survey_to_dict(s)}


@router.get('/surveys/stats', summary='满意度统计')
@require_permission('crm.client.read')
def survey_stats(request, client_id: Optional[int] = None):
    from django.db.models import Avg
    qs = SatisfactionSurvey.objects.filter(is_deleted=False)
    if client_id:
        qs = qs.filter(client_id=client_id)
    agg = qs.aggregate(
        avg_overall=Avg('overall_satisfaction'),
        avg_quality=Avg('quality_score'),
        avg_timeliness=Avg('timeliness_score'),
        avg_communication=Avg('communication_score'),
        avg_innovation=Avg('innovation_score'),
        avg_value=Avg('value_score'),
        avg_nps=Avg('nps_score'),
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        k: round(v, 1) if v else None for k, v in agg.items()
    }}


# ============================================================================
# 合作里程碑 API (P2)
# ============================================================================
@router.get('/clients/{client_id}/milestones', summary='合作里程碑列表')
@require_permission('crm.client.read')
def list_milestones(request, client_id: int):
    items = ClientSuccessMilestone.objects.filter(client_id=client_id, is_deleted=False)
    return {'code': 200, 'msg': 'OK', 'data': [_milestone_to_dict(m) for m in items]}


@router.post('/milestones/create', summary='创建合作里程碑')
@require_permission('crm.client.update')
def create_milestone(request, data: MilestoneCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    m = ClientSuccessMilestone.objects.create(**kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _milestone_to_dict(m)}


# ============================================================================
# 宣称趋势 API (P3)
# ============================================================================
@router.get('/trends/list', summary='宣称趋势列表')
@require_permission('crm.client.read')
def list_claim_trends(request, params: ClaimTrendQueryParams = Query(...)):
    qs = ClaimTrend.objects.filter(is_deleted=False)
    if params.claim_category:
        qs = qs.filter(claim_category=params.claim_category)
    if params.region:
        qs = qs.filter(region=params.region)
    if params.year:
        qs = qs.filter(year=params.year)
    if params.keyword:
        qs = qs.filter(claim_text__icontains=params.keyword)
    total = qs.count()
    offset = (params.page - 1) * params.page_size
    items = list(qs[offset:offset + params.page_size])
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_claim_trend_to_dict(c) for c in items],
        'total': total, 'page': params.page, 'page_size': params.page_size,
    }}


@router.post('/trends/create', summary='添加宣称趋势')
@require_permission('crm.client.update')
def create_claim_trend(request, data: ClaimTrendCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    c = ClaimTrend.objects.create(**kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _claim_trend_to_dict(c)}


# ============================================================================
# 市场趋势通报 API (P3)
# ============================================================================
@router.get('/bulletins/list', summary='市场趋势通报列表')
@require_permission('crm.client.read')
def list_bulletins(request, params: BulletinQueryParams = Query(...)):
    qs = MarketTrendBulletin.objects.filter(is_deleted=False)
    if params.category:
        qs = qs.filter(category=params.category)
    if params.published is not None:
        qs = qs.filter(published=params.published)
    total = qs.count()
    offset = (params.page - 1) * params.page_size
    items = list(qs[offset:offset + params.page_size])
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_bulletin_to_dict(b) for b in items],
        'total': total, 'page': params.page, 'page_size': params.page_size,
    }}


@router.post('/bulletins/create', summary='创建市场趋势通报')
@require_permission('crm.client.update')
def create_bulletin(request, data: BulletinCreateIn):
    account = _get_account_from_request(request)
    kwargs = data.dict(exclude_unset=True)
    if account:
        kwargs['created_by_id'] = account.id
    b = MarketTrendBulletin.objects.create(**kwargs)
    return {'code': 200, 'msg': 'OK', 'data': _bulletin_to_dict(b)}


@router.put('/bulletins/{bulletin_id}', summary='更新市场趋势通报')
@require_permission('crm.client.update')
def update_bulletin(request, bulletin_id: int, data: BulletinUpdateIn):
    b = MarketTrendBulletin.objects.filter(id=bulletin_id, is_deleted=False).first()
    if not b:
        return 404, {'code': 404, 'msg': '通报不存在'}
    for k, v in data.dict(exclude_unset=True).items():
        if v is not None and hasattr(b, k):
            setattr(b, k, v)
    b.save()
    return {'code': 200, 'msg': 'OK', 'data': _bulletin_to_dict(b)}


@router.post('/bulletins/{bulletin_id}/publish', summary='发布市场趋势通报')
@require_permission('crm.client.update')
def publish_bulletin(request, bulletin_id: int):
    from django.utils import timezone
    b = MarketTrendBulletin.objects.filter(id=bulletin_id, is_deleted=False).first()
    if not b:
        return 404, {'code': 404, 'msg': '通报不存在'}
    b.published = True
    b.published_at = timezone.now()
    b.save(update_fields=['published', 'published_at', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': _bulletin_to_dict(b)}


# ============================================================================
# AI洞察 (已有增强)
# ============================================================================
@router.get('/clients/{client_id}/insight', summary='客户AI战略洞察')
@require_permission('crm.client.read')
def client_insight(request, client_id: int):
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .insight_service import generate_client_insight
    data = generate_client_insight(client_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/clients/{client_id}/cross-sell', summary='交叉销售机会')
@require_permission('crm.client.read')
def client_cross_sell(request, client_id: int):
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    from .insight_service import detect_opportunities
    data = detect_opportunities(client_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# AI辅助生成 (P2)
# ============================================================================
@router.post('/clients/{client_id}/ai/generate-brief', summary='AI生成客户简报')
@require_permission('crm.client.update')
def ai_generate_brief(request, client_id: int):
    from .services.ai_service import auto_generate_client_brief
    data = auto_generate_client_brief(client_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/clients/{client_id}/ai/generate-insight', summary='AI生成价值洞察')
@require_permission('crm.client.update')
def ai_generate_insight(request, client_id: int):
    from .services.ai_service import generate_value_insight
    data = generate_value_insight(client_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/ai/generate-trend', summary='AI生成趋势分析')
@require_permission('crm.client.update')
def ai_generate_trend(request, category: str = '护肤', region: str = '中国'):
    from .services.ai_service import generate_trend_insight
    data = generate_trend_insight(category, region)
    return {'code': 200, 'msg': 'OK', 'data': data}
