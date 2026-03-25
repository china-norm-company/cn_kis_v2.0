"""
多维预警服务 (A2)

聚合 8 种预警类型，支持通知系统联动。
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Any, Optional


logger = logging.getLogger(__name__)


ALERT_SEVERITY_ORDER = {'high': 0, 'medium': 1, 'low': 2}


def generate_all_alerts(account=None) -> List[Dict[str, Any]]:
    """
    聚合所有预警源，返回按严重度排序的预警列表。

    预警类型（15 种）：
     1. overdue_workorder          — 工单逾期
     2. overdue_capa               — CAPA 逾期
     3. calibration_expiring       — 设备校准到期
     4. enrollment_delay           — 入组延迟
     5. budget_overrun             — 预算超支
     6. compliance_risk            — 合规风险（伦理/SOP 过期）
     7. visit_window               — 访视窗口期告警
     8. payment_overdue            — 客户回款逾期
     9. crm_churn_risk             — 客户流失风险
    10. recruitment_target_behind  — 招募进度落后
    11. ethics_approval_expiring   — 伦理批件即将过期（独立于 compliance_risk）
    12. facility_env_anomaly       — 设施环境异常
    13. sample_expiry              — 样品/物料效期预警
    14. hr_gcp_expiring            — 人员 GCP 到期
    15. finance_receivable_overdue — 应收逾期
    """
    alerts = []
    today = date.today()

    alerts.extend(_check_overdue_workorders(today))
    alerts.extend(_check_overdue_capas(today))
    alerts.extend(_check_calibration_expiring(today))
    alerts.extend(_check_enrollment_delay(today))
    alerts.extend(_check_budget_overrun())
    alerts.extend(_check_compliance_risk(today))
    alerts.extend(_check_visit_window(today))
    alerts.extend(_check_payment_overdue(today))
    alerts.extend(_check_crm_churn_risk())
    alerts.extend(_check_recruitment_target_behind(today))
    alerts.extend(_check_ethics_approval_expiring(today))
    alerts.extend(_check_facility_env_anomaly())
    alerts.extend(_check_sample_expiry(today))
    alerts.extend(_check_hr_gcp_expiring(today))
    alerts.extend(_check_finance_receivable_overdue(today))

    alerts.sort(key=lambda a: ALERT_SEVERITY_ORDER.get(a.get('severity', 'low'), 9))

    return alerts


def _check_overdue_workorders(today: date) -> List[Dict]:
    alerts = []
    try:
        from apps.workorder.models import WorkOrder
        overdue_wos = WorkOrder.objects.filter(
            due_date__lt=today, is_deleted=False,
        ).exclude(
            status__in=['completed', 'approved', 'cancelled']
        ).order_by('due_date')[:10]
        for wo in overdue_wos:
            due = wo.due_date.date() if hasattr(wo.due_date, 'date') else wo.due_date
            overdue_days = (today - due).days if due else 0
            alerts.append({
                'type': 'overdue_workorder',
                'severity': 'high',
                'title': f'工单逾期: {wo.title}',
                'detail': f'截止 {due}，已逾期 {overdue_days} 天',
                'entity_id': wo.id,
                'entity_type': 'workorder',
                'link': f'/workorder/{wo.id}',
            })
    except Exception as e:
        logger.warning(f'逾期工单检查失败: {e}')
    return alerts


def _check_overdue_capas(today: date) -> List[Dict]:
    alerts = []
    try:
        from apps.quality.models import CAPA
        overdue_capas = CAPA.objects.filter(
            status='overdue',
        ).order_by('due_date')[:10]
        for c in overdue_capas:
            alerts.append({
                'type': 'overdue_capa',
                'severity': 'high',
                'title': f'CAPA逾期: {c.title}',
                'detail': f'截止 {c.due_date}',
                'entity_id': c.id,
                'entity_type': 'capa',
                'link': f'/quality/capa/{c.id}',
            })
    except Exception as e:
        logger.warning(f'逾期CAPA检查失败: {e}')
    return alerts


def _check_calibration_expiring(today: date) -> List[Dict]:
    alerts = []
    try:
        from apps.resource.models import ResourceItem
        expiring = ResourceItem.objects.filter(
            next_calibration_date__lte=today + timedelta(days=7),
            next_calibration_date__gte=today,
            is_deleted=False,
        )[:10]
        for eq in expiring:
            days_left = (eq.next_calibration_date - today).days
            alerts.append({
                'type': 'calibration_expiring',
                'severity': 'medium',
                'title': f'设备校准即将到期: {eq.name}',
                'detail': f'到期日 {eq.next_calibration_date}，剩余 {days_left} 天',
                'entity_id': eq.id,
                'entity_type': 'equipment',
                'link': f'/equipment/{eq.id}',
            })
    except Exception as e:
        logger.warning(f'设备校准检查失败: {e}')
    return alerts


def _check_enrollment_delay(today: date) -> List[Dict]:
    """入组延迟预警：实际入组率低于计划的 80%"""
    alerts = []
    try:
        from apps.protocol.models import Protocol
        from apps.subject.models import Enrollment

        protocols = Protocol.objects.filter(status='active', is_deleted=False, sample_size__gt=0)
        for p in protocols:
            enrolled = Enrollment.objects.filter(protocol=p, status='enrolled').count()
            if p.sample_size and p.sample_size > 0:
                rate = enrolled / p.sample_size
                # Calculate expected rate based on project duration
                days_elapsed = (today - p.create_time.date()).days if p.create_time else 0
                if days_elapsed > 30 and rate < 0.2:
                    alerts.append({
                        'type': 'enrollment_delay',
                        'severity': 'high',
                        'title': f'入组严重滞后: {p.title}',
                        'detail': f'已入组 {enrolled}/{p.sample_size} ({round(rate*100,1)}%)',
                        'entity_id': p.id,
                        'entity_type': 'protocol',
                        'link': f'/projects/{p.id}/dashboard',
                    })
                elif days_elapsed > 14 and rate < 0.1:
                    alerts.append({
                        'type': 'enrollment_delay',
                        'severity': 'medium',
                        'title': f'入组进度缓慢: {p.title}',
                        'detail': f'已入组 {enrolled}/{p.sample_size} ({round(rate*100,1)}%)',
                        'entity_id': p.id,
                        'entity_type': 'protocol',
                        'link': f'/projects/{p.id}/dashboard',
                    })
    except Exception as e:
        logger.warning(f'入组延迟检查失败: {e}')
    return alerts


def _check_budget_overrun() -> List[Dict]:
    """预算超支预警：实际成本 > 预算成本的 90%"""
    alerts = []
    try:
        from apps.finance.models import ProjectBudget

        budgets = ProjectBudget.objects.filter(status='executing')
        for b in budgets:
            budget_cost = float(b.total_cost) if b.total_cost else 0
            actual_cost = float(b.actual_cost) if b.actual_cost else 0

            if budget_cost > 0:
                usage_rate = actual_cost / budget_cost
                if usage_rate >= 1.0:
                    alerts.append({
                        'type': 'budget_overrun',
                        'severity': 'high',
                        'title': f'预算已超支: {b.budget_name}',
                        'detail': f'预算 {budget_cost:.0f}，实际 {actual_cost:.0f} ({round(usage_rate*100)}%)',
                        'entity_id': b.id,
                        'entity_type': 'budget',
                        'link': f'/finance/budgets/{b.id}',
                    })
                elif usage_rate >= 0.9:
                    alerts.append({
                        'type': 'budget_overrun',
                        'severity': 'medium',
                        'title': f'预算即将超支: {b.budget_name}',
                        'detail': f'已使用 {round(usage_rate*100)}%',
                        'entity_id': b.id,
                        'entity_type': 'budget',
                        'link': f'/finance/budgets/{b.id}',
                    })
    except Exception as e:
        logger.warning(f'预算超支检查失败: {e}')
    return alerts


def _check_compliance_risk(today: date) -> List[Dict]:
    """合规风险：伦理批件即将过期、SOP 审查过期"""
    alerts = []
    try:
        from apps.ethics.models import ApprovalDocument
        expiring_approvals = ApprovalDocument.objects.filter(
            expiry_date__lte=today + timedelta(days=30),
            expiry_date__gte=today,
            is_active=True,
        )
        for doc in expiring_approvals:
            days_left = (doc.expiry_date - today).days
            severity = 'high' if days_left <= 7 else 'medium'
            alerts.append({
                'type': 'compliance_risk',
                'severity': severity,
                'title': f'伦理批件即将过期: {doc.document_number}',
                'detail': f'有效期至 {doc.expiry_date}，剩余 {days_left} 天',
                'entity_id': doc.id,
                'entity_type': 'ethics_approval',
                'link': f'/ethics/approvals/{doc.application_id}',
            })
    except Exception as e:
        logger.warning(f'伦理批件检查失败: {e}')

    try:
        from apps.quality.models import SOP
        overdue_sops = SOP.objects.filter(
            status='effective',
            next_review__lt=today,
        )[:5]
        for sop in overdue_sops:
            alerts.append({
                'type': 'compliance_risk',
                'severity': 'medium',
                'title': f'SOP 审查过期: {sop.code} {sop.title}',
                'detail': f'应审查日期 {sop.next_review}',
                'entity_id': sop.id,
                'entity_type': 'sop',
                'link': f'/quality/sop/{sop.id}',
            })
    except Exception as e:
        logger.warning(f'SOP审查检查失败: {e}')

    return alerts


def _check_visit_window(today: date) -> List[Dict]:
    """访视窗口期告警"""
    alerts = []
    try:
        from apps.scheduling.models import ScheduleSlot
        # Slots past their window that haven't been completed
        overdue_slots = ScheduleSlot.objects.filter(
            scheduled_date__lt=today - timedelta(days=3),
            status__in=['planned', 'confirmed'],
        ).select_related('visit_node')[:10]
        for slot in overdue_slots:
            days_overdue = (today - slot.scheduled_date).days
            alerts.append({
                'type': 'visit_window',
                'severity': 'high' if days_overdue > 7 else 'medium',
                'title': f'访视超出窗口期: {slot.visit_node.name if slot.visit_node else "未知"}',
                'detail': f'排程日期 {slot.scheduled_date}，已超期 {days_overdue} 天',
                'entity_id': slot.id,
                'entity_type': 'schedule_slot',
                'link': f'/scheduling/slots/{slot.id}',
            })
    except Exception as e:
        logger.warning(f'访视窗口期检查失败: {e}')
    return alerts


def _check_payment_overdue(today: date) -> List[Dict]:
    """客户回款逾期预警"""
    alerts = []
    try:
        from apps.finance.models import PaymentPlan
        overdue_plans = PaymentPlan.objects.filter(
            status='overdue',
        ).order_by('planned_date')[:10]
        for pp in overdue_plans:
            remaining = float(pp.remaining_amount) if pp.remaining_amount else 0
            alerts.append({
                'type': 'payment_overdue',
                'severity': 'high' if remaining > 50000 else 'medium',
                'title': f'回款逾期: {pp.name if hasattr(pp, "name") else f"计划#{pp.id}"}',
                'detail': f'待收 ¥{remaining:,.0f}',
                'entity_id': pp.id,
                'entity_type': 'payment_plan',
                'link': f'/finance/payment-plans/{pp.id}',
            })
    except Exception as e:
        logger.warning(f'回款逾期检查失败: {e}')
    return alerts


def get_alerts_summary() -> Dict[str, Any]:
    """
    预警统计摘要，供 Claw API 和日报使用。

    返回: {total, by_severity, by_type, top_alerts}
    """
    alerts = generate_all_alerts()
    by_severity: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    for a in alerts:
        sev = a.get('severity', 'low')
        by_severity[sev] = by_severity.get(sev, 0) + 1
        atype = a.get('type', 'unknown')
        by_type[atype] = by_type.get(atype, 0) + 1

    return {
        'total': len(alerts),
        'by_severity': by_severity,
        'by_type': by_type,
        'top_alerts': alerts[:10],
    }


def get_filtered_alerts(
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    过滤预警，供 Claw API 精确查询。

    参数:
      severity: high/medium/low
      alert_type: overdue_workorder/calibration_expiring/...
      limit: 返回条数上限
    """
    alerts = generate_all_alerts()
    if severity:
        alerts = [a for a in alerts if a.get('severity') == severity]
    if alert_type:
        alerts = [a for a in alerts if a.get('type') == alert_type]
    return alerts[:limit]


def _check_crm_churn_risk() -> List[Dict]:
    """客户流失风险：近 90 天无合同/无商机的活跃客户"""
    alerts = []
    try:
        from apps.crm.models import Client
        from apps.finance.models import Contract
        today = date.today()
        threshold = today - timedelta(days=90)
        active_clients = Client.objects.filter(is_deleted=False, status='active')
        for client in active_clients[:50]:
            recent_contracts = Contract.objects.filter(
                client_id=client.id,
                create_time__gte=threshold,
            ).count()
            if recent_contracts == 0:
                alerts.append({
                    'type': 'crm_churn_risk',
                    'severity': 'medium',
                    'title': f'客户流失风险: {client.name}',
                    'detail': '近 90 天无新合同或商机',
                    'entity_id': client.id,
                    'entity_type': 'client',
                    'link': f'/crm/clients/{client.id}',
                })
            if len(alerts) >= 10:
                break
    except Exception as e:
        logger.warning('客户流失风险检查失败: %s', e)
    return alerts


def _check_recruitment_target_behind(today: date) -> List[Dict]:
    """招募进度落后：实际招募低于计划进度"""
    alerts = []
    try:
        from apps.subject.models import RecruitmentPlan
        plans = RecruitmentPlan.objects.filter(status='active')
        for plan in plans[:20]:
            target = getattr(plan, 'target_count', 0) or 0
            enrolled = getattr(plan, 'enrolled_count', 0) or 0
            if target > 0 and enrolled / target < 0.5:
                days_elapsed = (today - plan.create_time.date()).days if plan.create_time else 0
                if days_elapsed > 30:
                    alerts.append({
                        'type': 'recruitment_target_behind',
                        'severity': 'high' if enrolled / target < 0.3 else 'medium',
                        'title': f'招募进度落后: {getattr(plan, "title", f"计划#{plan.id}")}',
                        'detail': f'目标 {target}，已入组 {enrolled} ({enrolled * 100 // target}%)',
                        'entity_id': plan.id,
                        'entity_type': 'recruitment_plan',
                        'link': f'/recruitment/plans/{plan.id}',
                    })
    except Exception as e:
        logger.warning('招募进度检查失败: %s', e)
    return alerts


def _check_ethics_approval_expiring(today: date) -> List[Dict]:
    """伦理批件即将过期（30 天内，独立预警）"""
    alerts = []
    try:
        from apps.ethics.models import ApprovalDocument
        expiring = ApprovalDocument.objects.filter(
            is_active=True,
            expiry_date__lte=today + timedelta(days=30),
            expiry_date__gte=today,
        )[:10]
        for doc in expiring:
            days_left = (doc.expiry_date - today).days
            alerts.append({
                'type': 'ethics_approval_expiring',
                'severity': 'high' if days_left <= 7 else 'medium',
                'title': f'伦理批件即将过期: {doc.document_number}',
                'detail': f'有效期至 {doc.expiry_date}，剩余 {days_left} 天',
                'entity_id': doc.id,
                'entity_type': 'approval_document',
                'link': f'/ethics/approvals/{doc.application_id}',
            })
    except Exception as e:
        logger.warning('伦理批件过期检查失败: %s', e)
    return alerts


def _check_facility_env_anomaly() -> List[Dict]:
    """设施环境异常"""
    alerts = []
    try:
        from apps.resource.services_facility import get_dashboard
        dashboard = get_dashboard()
        env = dashboard.get('environment', {})
        anomalies = env.get('anomalies', [])
        for a in anomalies[:10]:
            alerts.append({
                'type': 'facility_env_anomaly',
                'severity': 'high' if a.get('level') == 'critical' else 'medium',
                'title': f'环境异常: {a.get("location", "未知")}',
                'detail': a.get('description', ''),
                'entity_id': a.get('id', 0),
                'entity_type': 'environment_log',
                'link': '/facility/environment',
            })
    except Exception as e:
        logger.warning('设施环境检查失败: %s', e)
    return alerts


def _check_sample_expiry(today: date) -> List[Dict]:
    """样品/物料效期预警"""
    alerts = []
    try:
        from apps.sample.services_material import get_expiry_alerts
        expiry = get_expiry_alerts()
        for item in expiry.get('red', [])[:5]:
            alerts.append({
                'type': 'sample_expiry',
                'severity': 'high',
                'title': f'物料已过期: {item.get("name", "")}',
                'detail': f'有效期: {item.get("expiry_date", "")}',
                'entity_id': item.get('id', 0),
                'entity_type': 'product',
                'link': '/material/inventory',
            })
        for item in expiry.get('orange', [])[:5]:
            alerts.append({
                'type': 'sample_expiry',
                'severity': 'medium',
                'title': f'物料即将过期: {item.get("name", "")}',
                'detail': f'有效期: {item.get("expiry_date", "")}',
                'entity_id': item.get('id', 0),
                'entity_type': 'product',
                'link': '/material/inventory',
            })
    except Exception as e:
        logger.warning('物料效期检查失败: %s', e)
    return alerts


def _check_hr_gcp_expiring(today: date) -> List[Dict]:
    """人员 GCP 证书即将到期（30 天内）"""
    alerts = []
    try:
        from apps.hr.models import Staff
        expiring = Staff.objects.filter(
            is_deleted=False,
            gcp_expiry_date__isnull=False,
            gcp_expiry_date__lte=today + timedelta(days=30),
            gcp_expiry_date__gte=today,
        )[:10]
        for s in expiring:
            days_left = (s.gcp_expiry_date - today).days
            alerts.append({
                'type': 'hr_gcp_expiring',
                'severity': 'high' if days_left <= 7 else 'medium',
                'title': f'GCP 证书即将到期: {s.name}',
                'detail': f'到期日 {s.gcp_expiry_date}，剩余 {days_left} 天',
                'entity_id': s.id,
                'entity_type': 'staff',
                'link': f'/hr/staff/{s.id}',
            })
    except Exception as e:
        logger.warning('GCP 到期检查失败: %s', e)
    return alerts


def _check_finance_receivable_overdue(today: date) -> List[Dict]:
    """应收逾期预警（不同于 payment_overdue，聚焦应收账龄）"""
    alerts = []
    try:
        from apps.finance.services.report_engine import collect_ar_aging_report
        ar = collect_ar_aging_report(today)
        overdue_clients = ar.get('clients', [])
        for client in overdue_clients[:10]:
            overdue_amount = client.get('overdue_amount', 0)
            if overdue_amount and float(overdue_amount) > 0:
                alerts.append({
                    'type': 'finance_receivable_overdue',
                    'severity': 'high' if float(overdue_amount) > 100000 else 'medium',
                    'title': f'应收逾期: {client.get("client_name", "")}',
                    'detail': f'逾期金额 ¥{float(overdue_amount):,.0f}',
                    'entity_id': client.get('client_id', 0),
                    'entity_type': 'client',
                    'link': '/finance/ar-aging',
                })
    except Exception as e:
        logger.warning('应收逾期检查失败: %s', e)
    return alerts


def push_high_severity_alerts(account) -> int:
    """推送高严重度预警到飞书（供定时任务调用）"""
    alerts = generate_all_alerts(account)
    high_alerts = [a for a in alerts if a['severity'] == 'high']

    pushed = 0
    for alert in high_alerts:
        try:
            from apps.notification.services import send_notification
            send_notification(
                recipient_id=account.id,
                title=alert['title'],
                content=f"[{alert['type']}] {alert['detail']}",
                channel='feishu_card',
                priority='high',
                source_type=alert.get('type', ''),
            )
            pushed += 1
        except Exception as e:
            logger.warning(f'预警推送失败: {e}')

    return pushed
