"""
绩效结算服务

核心原则：数据不完整也能运行，标注完整度但不阻断。
支持手工录入、Excel 导入、跨台自动采集三种数据来源。
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from typing import Optional

from django.db import transaction
from django.db.models import Sum, Count, Q, Avg
from django.utils import timezone

from apps.hr.models import (
    Staff,
    PerformanceRule, PerformanceRuleStatus,
    PerformanceSettlement, SettlementStatus,
    SettlementLine, LineLockStatus,
    ContributionSnapshot,
    SettlementAuditLog,
)

logger = logging.getLogger(__name__)

D2 = Decimal('0.01')

DEFAULT_WEIGHT_CONFIG = {
    'workorder': Decimal('0.40'),
    'quality': Decimal('0.20'),
    'amount': Decimal('0.30'),
    'timeliness': Decimal('0.10'),
}

DEFAULT_THRESHOLD_CONFIG = {
    'S': 90,
    'A': 75,
    'B': 60,
    'C': 0,
}

DEFAULT_CAP_FLOOR = {
    'cap_multiplier': Decimal('2.0'),
    'floor_multiplier': Decimal('0.5'),
}


# ============================================================================
# 规则管理
# ============================================================================
def create_rule(*, name: str, version: str = '', effective_from=None,
                effective_to=None, group_config=None, weight_config=None,
                threshold_config=None, cap_floor_config=None, **_kw):
    return PerformanceRule.objects.create(
        name=name,
        version=version,
        effective_from=effective_from or datetime.today().date(),
        effective_to=effective_to,
        group_config=group_config or {},
        weight_config=weight_config or {},
        threshold_config=threshold_config or {},
        cap_floor_config=cap_floor_config or {},
    )


def list_rules(*, page=1, page_size=20):
    qs = PerformanceRule.objects.all()
    total = qs.count()
    start = (page - 1) * page_size
    return {
        'items': list(qs[start:start + page_size]),
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def update_rule(rule_id: int, **fields):
    r = PerformanceRule.objects.filter(id=rule_id).first()
    if not r:
        return None
    for k, v in fields.items():
        if v is not None and hasattr(r, k):
            setattr(r, k, v)
    r.save()
    return r


def get_active_rule(period: str = ''):
    """获取当前有效规则，找不到就返回 None（调用方使用默认规则）。"""
    qs = PerformanceRule.objects.filter(status=PerformanceRuleStatus.ACTIVE)
    if period:
        from datetime import date
        try:
            y, m = period.split('-')
            ref_date = date(int(y), int(m), 1)
            qs = qs.filter(effective_from__lte=ref_date)
            qs = qs.filter(Q(effective_to__gte=ref_date) | Q(effective_to__isnull=True))
        except Exception:
            pass
    return qs.first()


# ============================================================================
# 贡献快照
# ============================================================================
def import_contributions(items: list, *, operator: str = ''):
    """批量导入贡献快照（支持手工和 Excel）。"""
    created = []
    for item in items:
        staff = None
        staff_id = item.get('staff_id')
        staff_name = item.get('staff_name', '')
        if staff_id:
            staff = Staff.objects.filter(id=staff_id, is_deleted=False).first()
        elif staff_name:
            staff = Staff.objects.filter(name=staff_name, is_deleted=False).first()

        obj = ContributionSnapshot.objects.create(
            period=item.get('period', ''),
            source_workstation=item.get('source_workstation', 'manual'),
            staff=staff,
            staff_name=staff_name or (staff.name if staff else ''),
            project_code=item.get('project_code', ''),
            group_name=item.get('group_name', ''),
            role_in_project=item.get('role_in_project', ''),
            metrics=item.get('metrics', {}),
            amount_contribution=item.get('amount_contribution'),
            data_confidence=Decimal(str(item.get('data_confidence', 0.5))),
            import_source=item.get('import_source', 'manual'),
        )
        created.append(obj)
    return created


def list_contributions(*, period: str = None, staff_id: int = None,
                       source: str = None, page=1, page_size=50):
    qs = ContributionSnapshot.objects.all()
    if period:
        qs = qs.filter(period=period)
    if staff_id:
        qs = qs.filter(staff_id=staff_id)
    if source:
        qs = qs.filter(source_workstation=source)
    total = qs.count()
    start = (page - 1) * page_size
    return {
        'items': list(qs.select_related('staff')[start:start + page_size]),
        'total': total,
        'page': page,
        'page_size': page_size,
    }


# ============================================================================
# 结算单 CRUD
# ============================================================================
def create_settlement(*, period: str, title: str = '', total_pool=0,
                      rule_id: int = None, notes: str = '',
                      created_by: str = ''):
    rule = None
    if rule_id:
        rule = PerformanceRule.objects.filter(id=rule_id).first()
    if not rule:
        rule = get_active_rule(period)

    settlement = PerformanceSettlement.objects.create(
        period=period,
        title=title or f'{period} 绩效结算',
        rule=rule,
        total_pool=Decimal(str(total_pool)),
        created_by=created_by,
    )
    _write_audit(settlement, 'create', '', SettlementStatus.DRAFT, created_by)
    return settlement


def get_settlement(settlement_id: int):
    return PerformanceSettlement.objects.filter(id=settlement_id).first()


def list_settlements(*, status: str = None, period: str = None,
                     page=1, page_size=20):
    qs = PerformanceSettlement.objects.all()
    if status:
        qs = qs.filter(status=status)
    if period:
        qs = qs.filter(period=period)
    total = qs.count()
    start = (page - 1) * page_size
    return {
        'items': list(qs.select_related('rule')[start:start + page_size]),
        'total': total,
        'page': page,
        'page_size': page_size,
    }


# ============================================================================
# 计算引擎（容错设计）
# ============================================================================
@transaction.atomic
def calculate_settlement(settlement_id: int, *, operator: str = ''):
    """
    对结算单执行计算。核心容错逻辑：
    - 无贡献数据 → 人员全部参与但基础分为 0，等待手工补录
    - 部分数据 → 已有数据按权重计算，缺失维度权重归零并重新归一化
    - 无规则 → 使用默认等比分配
    """
    settlement = PerformanceSettlement.objects.select_for_update().get(id=settlement_id)
    if settlement.status not in (SettlementStatus.DRAFT, SettlementStatus.REOPENED):
        raise ValueError(f'结算单状态 {settlement.status} 不允许重新计算')

    rule = settlement.rule
    weights = _parse_weights(rule)
    thresholds = _parse_thresholds(rule)
    cap_floor = _parse_cap_floor(rule)
    total_pool = settlement.total_pool

    snapshots = ContributionSnapshot.objects.filter(period=settlement.period)
    snapshot_ids = list(snapshots.values_list('id', flat=True))

    staff_contributions = _aggregate_contributions(snapshots)

    all_staff_ids = set(staff_contributions.keys())
    if not all_staff_ids:
        active_staff = Staff.objects.filter(is_deleted=False).values_list('id', flat=True)
        all_staff_ids = set(active_staff)

    completeness_points = 0
    total_points = 0
    lines_data = []

    for staff_id in all_staff_ids:
        contrib = staff_contributions.get(staff_id, {})
        base_score, dim_completeness = _compute_base_score(contrib, weights)
        quality_adj = _compute_quality_adjust(contrib)
        final_score = max(base_score + quality_adj, Decimal('0'))

        grade = _assign_grade(final_score, thresholds)
        completeness_points += dim_completeness
        total_points += 1

        lines_data.append({
            'staff_id': staff_id,
            'group_name': contrib.get('group_name', ''),
            'role_label': contrib.get('role_label', ''),
            'contribution_data': contrib,
            'base_score': base_score,
            'quality_adjust': quality_adj,
            'final_score': final_score,
            'grade': grade,
        })

    total_score = sum(d['final_score'] for d in lines_data) or Decimal('1')

    for d in lines_data:
        ratio = d['final_score'] / total_score if total_score else Decimal('0')
        raw_bonus = (total_pool * ratio).quantize(D2, rounding=ROUND_HALF_UP)
        avg_bonus = (total_pool / len(lines_data)).quantize(D2) if lines_data else Decimal('0')
        d['suggested_bonus'] = _apply_cap_floor(raw_bonus, avg_bonus, cap_floor)

    SettlementLine.objects.filter(settlement=settlement, lock_status=LineLockStatus.UNLOCKED).delete()

    locked_ids = set(
        SettlementLine.objects.filter(settlement=settlement, lock_status=LineLockStatus.LOCKED)
        .values_list('staff_id', flat=True)
    )

    for d in lines_data:
        if d['staff_id'] in locked_ids:
            continue
        SettlementLine.objects.create(
            settlement=settlement,
            staff_id=d['staff_id'],
            group_name=d['group_name'],
            role_label=d['role_label'],
            contribution_data=d['contribution_data'],
            base_score=d['base_score'],
            quality_adjust=d['quality_adjust'],
            final_score=d['final_score'],
            suggested_bonus=d['suggested_bonus'],
            final_bonus=d['suggested_bonus'],
            grade=d['grade'],
        )

    data_completeness = Decimal('0')
    if total_points:
        data_completeness = (Decimal(str(completeness_points)) / Decimal(str(total_points)) * 100).quantize(D2)

    total_allocated = SettlementLine.objects.filter(settlement=settlement).aggregate(
        s=Sum('final_bonus'))['s'] or Decimal('0')

    settlement.data_completeness = data_completeness
    settlement.total_allocated = total_allocated
    settlement.source_snapshot_ids = snapshot_ids
    settlement.save(update_fields=['data_completeness', 'total_allocated', 'source_snapshot_ids', 'update_time'])

    _write_audit(settlement, 'calculate', settlement.status, settlement.status, operator,
                 detail={'lines_count': len(lines_data), 'completeness': float(data_completeness)})

    return settlement


# ============================================================================
# 状态机
# ============================================================================
ALLOWED_TRANSITIONS = {
    SettlementStatus.DRAFT: [SettlementStatus.SUBMITTED],
    SettlementStatus.SUBMITTED: [SettlementStatus.REVIEWING, SettlementStatus.DRAFT],
    SettlementStatus.REVIEWING: [SettlementStatus.APPROVED, SettlementStatus.SUBMITTED],
    SettlementStatus.APPROVED: [SettlementStatus.RELEASED, SettlementStatus.REOPENED],
    SettlementStatus.RELEASED: [SettlementStatus.ARCHIVED],
    SettlementStatus.REOPENED: [SettlementStatus.SUBMITTED],
    SettlementStatus.ARCHIVED: [],
}


@transaction.atomic
def transition_settlement(settlement_id: int, target_status: str,
                          *, operator: str = '', notes: str = ''):
    settlement = PerformanceSettlement.objects.select_for_update().get(id=settlement_id)
    allowed = ALLOWED_TRANSITIONS.get(settlement.status, [])
    if target_status not in allowed:
        raise ValueError(
            f'不允许从 {settlement.status} 转换到 {target_status}，'
            f'允许的目标状态：{allowed}'
        )

    from_status = settlement.status
    settlement.status = target_status

    now = timezone.now()
    if target_status == SettlementStatus.SUBMITTED:
        settlement.submitted_by = operator
        settlement.submitted_at = now
    elif target_status == SettlementStatus.APPROVED:
        settlement.approved_by = operator
        settlement.approved_at = now

    settlement.save()
    _write_audit(settlement, f'transition:{target_status}', from_status, target_status,
                 operator, detail={'notes': notes})
    return settlement


# ============================================================================
# 明细行操作
# ============================================================================
def update_settlement_line(line_id: int, *, manual_adjust=None,
                           manual_adjust_reason: str = None,
                           final_bonus=None, lock_status: str = None,
                           operator: str = ''):
    line = SettlementLine.objects.filter(id=line_id).first()
    if not line:
        return None
    if line.settlement.status not in (SettlementStatus.DRAFT, SettlementStatus.REOPENED):
        raise ValueError('结算单非草稿/重开状态，不能修改明细')
    if manual_adjust is not None:
        line.manual_adjust = Decimal(str(manual_adjust))
        line.final_score = line.base_score + line.quality_adjust + line.manual_adjust
    if manual_adjust_reason is not None:
        line.manual_adjust_reason = manual_adjust_reason
    if final_bonus is not None:
        line.final_bonus = Decimal(str(final_bonus))
    if lock_status is not None:
        line.lock_status = lock_status
    line.save()
    return line


def list_settlement_lines(settlement_id: int, *, group_name: str = None):
    qs = SettlementLine.objects.filter(settlement_id=settlement_id).select_related('staff')
    if group_name:
        qs = qs.filter(group_name=group_name)
    return list(qs)


# ============================================================================
# 审计日志
# ============================================================================
def list_audit_logs(settlement_id: int):
    return list(SettlementAuditLog.objects.filter(settlement_id=settlement_id))


def _write_audit(settlement, action, from_status, to_status, operator='', detail=None):
    SettlementAuditLog.objects.create(
        settlement=settlement,
        action=action,
        from_status=from_status,
        to_status=to_status,
        operator=operator,
        detail=detail or {},
    )


# ============================================================================
# 内部计算函数（容错）
# ============================================================================
def collect_contributions_from_workorders(period: str, *, operator: str = ''):
    """
    M2 预置：从工单系统自动采集贡献数据。
    即便当前数据不全，也能产出部分数据供结算参考。
    """
    try:
        from apps.workorder.models import WorkOrder, WorkOrderStatus
    except ImportError:
        logger.warning('工单模块未安装，跳过自动采集')
        return []

    year, month = period.split('-')
    qs = WorkOrder.objects.filter(
        create_time__year=int(year),
        create_time__month=int(month),
        is_deleted=False,
    ).exclude(status=WorkOrderStatus.CANCELLED)

    staff_data: dict = {}
    for wo in qs.select_related('enrollment'):
        assignee_id = wo.assigned_to_account_id or wo.assigned_to
        if not assignee_id:
            continue

        staff = Staff.objects.filter(
            Q(account_id=assignee_id) | Q(feishu_open_id=str(assignee_id)),
            is_deleted=False,
        ).first()
        if not staff:
            continue

        sid = staff.id
        if sid not in staff_data:
            staff_data[sid] = {
                'staff_id': sid,
                'staff_name': staff.name,
                'workorder_count': 0,
                'completed_count': 0,
                'on_time_count': 0,
            }
        staff_data[sid]['workorder_count'] += 1
        if wo.status in (WorkOrderStatus.COMPLETED, WorkOrderStatus.APPROVED):
            staff_data[sid]['completed_count'] += 1
            if wo.due_date and wo.complete_time and wo.complete_time.date() <= wo.due_date:
                staff_data[sid]['on_time_count'] += 1

    items = []
    for sid, d in staff_data.items():
        total = d['workorder_count'] or 1
        items.append({
            'period': period,
            'staff_id': sid,
            'staff_name': d['staff_name'],
            'source_workstation': 'execution',
            'group_name': '',
            'metrics': {
                'workorder_count': d['workorder_count'],
                'workorder_completed': d['completed_count'],
                'on_time_rate': round(d['on_time_count'] / total, 2),
            },
            'data_confidence': 1.0,
            'import_source': 'auto',
        })

    if items:
        import_contributions(items, operator=operator)
    return items


def _aggregate_contributions(snapshots) -> dict:
    """将快照聚合为 {staff_id: {metrics..., group_name, role_label, ...}}"""
    result = {}
    for s in snapshots.select_related('staff'):
        sid = s.staff_id
        if not sid:
            continue
        if sid not in result:
            result[sid] = {
                'group_name': s.group_name,
                'role_label': s.role_in_project,
                'metrics': {},
                'amount_total': Decimal('0'),
                'snapshot_count': 0,
                'avg_confidence': Decimal('0'),
                '_confidences': [],
            }
        entry = result[sid]
        entry['snapshot_count'] += 1
        entry['_confidences'].append(s.data_confidence)

        for k, v in (s.metrics or {}).items():
            try:
                entry['metrics'][k] = entry['metrics'].get(k, 0) + float(v)
            except (ValueError, TypeError):
                entry['metrics'][k] = v

        if s.amount_contribution:
            entry['amount_total'] += s.amount_contribution

    for sid, entry in result.items():
        confs = entry.pop('_confidences', [])
        entry['avg_confidence'] = (
            sum(confs) / len(confs) if confs else Decimal('0.5')
        )
    return result


def _parse_weights(rule: Optional[PerformanceRule]) -> dict:
    if rule and rule.weight_config:
        return {k: Decimal(str(v)) for k, v in rule.weight_config.items()}
    return dict(DEFAULT_WEIGHT_CONFIG)


def _parse_thresholds(rule: Optional[PerformanceRule]) -> dict:
    if rule and rule.threshold_config:
        return rule.threshold_config
    return dict(DEFAULT_THRESHOLD_CONFIG)


def _parse_cap_floor(rule: Optional[PerformanceRule]) -> dict:
    if rule and rule.cap_floor_config:
        return {k: Decimal(str(v)) for k, v in rule.cap_floor_config.items()}
    return dict(DEFAULT_CAP_FLOOR)


def _compute_base_score(contrib: dict, weights: dict) -> tuple:
    """
    返回 (base_score, dimension_completeness_ratio)。
    缺失维度权重归零后重新归一化。
    """
    if not contrib or not contrib.get('metrics'):
        return Decimal('0'), 0.0

    metrics = contrib['metrics']
    available_dims = {}
    dim_mapping = {
        'workorder': ['workorder_count', 'workorder_completed'],
        'quality': ['on_time_rate', 'compliance_rate', 'quality_score'],
        'amount': ['amount_total'],
        'timeliness': ['on_time_rate', 'delivery_timeliness'],
    }

    for dim, keys in dim_mapping.items():
        for key in keys:
            if key in metrics and metrics[key]:
                available_dims[dim] = True
                break

    if 'amount_total' not in metrics and contrib.get('amount_total'):
        metrics['amount_total'] = float(contrib['amount_total'])
        available_dims['amount'] = True

    active_weights = {d: weights.get(d, Decimal('0')) for d in available_dims}
    weight_sum = sum(active_weights.values()) or Decimal('1')

    score = Decimal('0')
    for dim, w in active_weights.items():
        normalized_w = w / weight_sum
        dim_score = _dim_score(dim, metrics)
        score += normalized_w * dim_score

    completeness = len(available_dims) / max(len(dim_mapping), 1)
    return score.quantize(D2), completeness


def _dim_score(dim: str, metrics: dict) -> Decimal:
    """单维度得分，标准化到 0-100。"""
    if dim == 'workorder':
        count = float(metrics.get('workorder_count', 0) or metrics.get('workorder_completed', 0))
        return Decimal(str(min(count * 5, 100)))
    elif dim == 'quality':
        rate = float(metrics.get('on_time_rate', 0) or metrics.get('quality_score', 0))
        if rate <= 1:
            rate *= 100
        return Decimal(str(min(rate, 100)))
    elif dim == 'amount':
        amt = float(metrics.get('amount_total', 0))
        return Decimal(str(min(amt / 100, 100)))
    elif dim == 'timeliness':
        rate = float(metrics.get('delivery_timeliness', 0) or metrics.get('on_time_rate', 0))
        if rate <= 1:
            rate *= 100
        return Decimal(str(min(rate, 100)))
    return Decimal('0')


def _compute_quality_adjust(contrib: dict) -> Decimal:
    metrics = contrib.get('metrics', {})
    adjust = Decimal('0')
    deviation_count = metrics.get('deviation_count', 0)
    if deviation_count:
        adjust -= Decimal(str(min(int(deviation_count) * 2, 20)))
    capa_count = metrics.get('capa_count', 0)
    if capa_count:
        adjust -= Decimal(str(min(int(capa_count) * 3, 15)))
    excellence_count = metrics.get('excellence_count', 0)
    if excellence_count:
        adjust += Decimal(str(min(int(excellence_count) * 5, 15)))
    return adjust


def _assign_grade(score: Decimal, thresholds: dict) -> str:
    sorted_grades = sorted(thresholds.items(), key=lambda x: -x[1])
    for grade, threshold in sorted_grades:
        if score >= threshold:
            return grade
    return 'C'


def _apply_cap_floor(raw_bonus: Decimal, avg_bonus: Decimal,
                     cap_floor: dict) -> Decimal:
    if not avg_bonus or avg_bonus == 0:
        return raw_bonus
    cap = avg_bonus * cap_floor.get('cap_multiplier', Decimal('2.0'))
    floor = avg_bonus * cap_floor.get('floor_multiplier', Decimal('0.5'))
    return max(min(raw_bonus, cap), floor)
