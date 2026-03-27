"""
数据分类分级注册表 — Wave 5 后端治理引擎

六维度分类体系：
  security_level        : SEC-1（公开）～ SEC-4（极密/PHI）
  criticality           : CRIT-A（患者安全）～ CRIT-D（参考数据）
  regulatory_categories : REG-GCP / REG-PI / REG-TAX / REG-INT
  freshness_sla         : SLA-RT / SLA-NRT / SLA-D / SLA-W / SLA-P
  retention_years       : 数字（年）或 'permanent'
  data_owner_role       : 数据责任角色代码
  pseudonymized         : 是否已完成假名化处理（GCP+PI 冲突表必须为 True 后才可上线）
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union


SecurityLevel = Literal['SEC-1', 'SEC-2', 'SEC-3', 'SEC-4']
Criticality = Literal['CRIT-A', 'CRIT-B', 'CRIT-C', 'CRIT-D']
RegulatoryCategory = Literal['REG-GCP', 'REG-PI', 'REG-TAX', 'REG-INT']
FreshnessSLA = Literal['SLA-RT', 'SLA-NRT', 'SLA-D', 'SLA-W', 'SLA-P']
DataOwnerRole = Literal['data_manager', 'tech_director', 'admin', 'compliance_officer']
RetentionYears = Union[float, Literal['permanent']]


@dataclass(frozen=True)
class DataClassification:
    security_level: SecurityLevel
    criticality: Criticality
    regulatory_categories: list[RegulatoryCategory]
    freshness_sla: FreshnessSLA
    retention_years: RetentionYears
    data_owner_role: DataOwnerRole
    pseudonymized: bool = False

    def has_gcp_pi_conflict(self) -> bool:
        """同时受 GCP（不可删除）和 PIPL（可被删除）管辖，需假名化处理。"""
        return 'REG-GCP' in self.regulatory_categories and 'REG-PI' in self.regulatory_categories

    def is_phi(self) -> bool:
        """是否含受保护健康信息。"""
        return self.security_level == 'SEC-4'

    def requires_pseudonymization(self) -> bool:
        return self.has_gcp_pi_conflict() and not self.pseudonymized

    def retention_display(self) -> str:
        if self.retention_years == 'permanent':
            return '永久'
        years = float(self.retention_years)  # type: ignore[arg-type]
        if years < 1:
            return f'{round(years * 365)} 天'
        return f'{int(years)} 年' if years == int(years) else f'{years} 年'


# ── 27 张核心表完整注册 ────────────────────────────────────────────────────────

DATA_CLASSIFICATION_REGISTRY: dict[str, DataClassification] = {

    # ── 认证与权限层 ──────────────────────────────────────────────────────────
    't_account': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-PI', 'REG-INT'],
        freshness_sla='SLA-RT', retention_years=5, data_owner_role='admin',
    ),
    't_role': DataClassification(
        security_level='SEC-2', criticality='CRIT-C',
        regulatory_categories=['REG-INT'],
        freshness_sla='SLA-D', retention_years=5, data_owner_role='admin',
    ),
    't_permission': DataClassification(
        security_level='SEC-2', criticality='CRIT-C',
        regulatory_categories=['REG-INT'],
        freshness_sla='SLA-D', retention_years=5, data_owner_role='admin',
    ),
    't_session_token': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-PI', 'REG-GCP'],
        freshness_sla='SLA-RT', retention_years=1, data_owner_role='admin',
    ),
    't_feishu_user_token': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-PI'],
        freshness_sla='SLA-RT', retention_years=0.25, data_owner_role='admin',
    ),
    't_audit_log': DataClassification(
        security_level='SEC-3', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-RT', retention_years='permanent', data_owner_role='admin',
    ),

    # ── 核心业务主干层 ────────────────────────────────────────────────────────
    't_protocol': DataClassification(
        security_level='SEC-3', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-D', retention_years=15, data_owner_role='data_manager',
    ),
    't_visit_plan': DataClassification(
        security_level='SEC-2', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-D', retention_years=15, data_owner_role='data_manager',
    ),
    't_visit_node': DataClassification(
        security_level='SEC-2', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-D', retention_years=15, data_owner_role='data_manager',
    ),
    't_subject': DataClassification(
        security_level='SEC-4', criticality='CRIT-A',
        regulatory_categories=['REG-GCP', 'REG-PI'],
        freshness_sla='SLA-RT', retention_years=15, data_owner_role='data_manager',
        pseudonymized=False,
    ),
    't_enrollment': DataClassification(
        security_level='SEC-4', criticality='CRIT-A',
        regulatory_categories=['REG-GCP', 'REG-PI'],
        freshness_sla='SLA-RT', retention_years=15, data_owner_role='data_manager',
        pseudonymized=False,
    ),
    't_work_order': DataClassification(
        security_level='SEC-3', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-RT', retention_years=15, data_owner_role='data_manager',
    ),
    't_crf_template': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-W', retention_years=15, data_owner_role='data_manager',
    ),
    't_crf_record': DataClassification(
        security_level='SEC-4', criticality='CRIT-A',
        regulatory_categories=['REG-GCP', 'REG-PI'],
        freshness_sla='SLA-RT', retention_years=15, data_owner_role='data_manager',
        pseudonymized=False,
    ),

    # ── 知识资产层 ────────────────────────────────────────────────────────────
    't_knowledge_entry': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-INT'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='data_manager',
    ),
    't_knowledge_entity': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-INT'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='data_manager',
    ),
    't_knowledge_relation': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-INT'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='data_manager',
    ),
    't_personal_context': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-PI'],
        freshness_sla='SLA-D', retention_years=3, data_owner_role='data_manager',
    ),

    # ── 集成原始层（永久不可变） ────────────────────────────────────────────────
    't_ekb_raw_record': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-TAX'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='admin',
    ),
    't_raw_lims_record': DataClassification(
        security_level='SEC-4', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-D', retention_years=15, data_owner_role='admin',
    ),

    # ── 接入暂存层 ──────────────────────────────────────────────────────────
    't_ext_ingest_candidate': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-INT'],
        freshness_sla='SLA-D', retention_years=3, data_owner_role='data_manager',
        pseudonymized=False,
    ),

    # ── 财务扩展层 ──────────────────────────────────────────────────────────
    't_quote': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-TAX'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='data_manager',
    ),
    't_contract': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-TAX'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='data_manager',
    ),
    't_invoice': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-TAX'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='data_manager',
    ),
    't_payment': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-TAX'],
        freshness_sla='SLA-D', retention_years=10, data_owner_role='data_manager',
    ),

    # ── 质量与合规层 ────────────────────────────────────────────────────────
    't_deviation': DataClassification(
        security_level='SEC-3', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-RT', retention_years=15, data_owner_role='data_manager',
    ),
    't_capa': DataClassification(
        security_level='SEC-3', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-RT', retention_years=15, data_owner_role='data_manager',
    ),
    't_sop': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-W', retention_years=5, data_owner_role='data_manager',
    ),
    't_data_query': DataClassification(
        security_level='SEC-3', criticality='CRIT-A',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-RT', retention_years=15, data_owner_role='data_manager',
    ),

    # ── 人事与标签层 ────────────────────────────────────────────────────────
    't_staff': DataClassification(
        security_level='SEC-3', criticality='CRIT-B',
        regulatory_categories=['REG-PI'],
        freshness_sla='SLA-D', retention_years=7, data_owner_role='admin',
    ),
    't_staff_qualification': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-GCP'],
        freshness_sla='SLA-D', retention_years=7, data_owner_role='admin',
    ),

    # ── 数据质量引擎层 ────────────────────────────────────────────────────
    't_data_quality_rule': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-GCP', 'REG-INT'],
        freshness_sla='SLA-D', retention_years='permanent', data_owner_role='admin',
    ),
    't_data_quality_alert': DataClassification(
        security_level='SEC-2', criticality='CRIT-B',
        regulatory_categories=['REG-GCP', 'REG-INT'],
        freshness_sla='SLA-RT', retention_years='permanent', data_owner_role='admin',
    ),
}


class ClassificationRegistry:
    """六维分类注册表查询 API。"""

    @classmethod
    def get(cls, table_name: str) -> DataClassification | None:
        return DATA_CLASSIFICATION_REGISTRY.get(table_name)

    @classmethod
    def all(cls) -> dict[str, DataClassification]:
        return dict(DATA_CLASSIFICATION_REGISTRY)

    @classmethod
    def get_by_security_level(cls, level: SecurityLevel) -> dict[str, DataClassification]:
        return {k: v for k, v in DATA_CLASSIFICATION_REGISTRY.items() if v.security_level == level}

    @classmethod
    def get_by_criticality(cls, criticality: Criticality) -> dict[str, DataClassification]:
        return {k: v for k, v in DATA_CLASSIFICATION_REGISTRY.items() if v.criticality == criticality}

    @classmethod
    def get_by_regulatory(cls, category: RegulatoryCategory) -> dict[str, DataClassification]:
        return {k: v for k, v in DATA_CLASSIFICATION_REGISTRY.items() if category in v.regulatory_categories}

    @classmethod
    def get_by_owner(cls, role: DataOwnerRole) -> dict[str, DataClassification]:
        return {k: v for k, v in DATA_CLASSIFICATION_REGISTRY.items() if v.data_owner_role == role}

    @classmethod
    def get_gcp_pi_conflicts(cls) -> list[str]:
        """返回同时受 GCP 和 PIPL 管辖的表名列表（需假名化处理）。"""
        return [
            table_name
            for table_name, dc in DATA_CLASSIFICATION_REGISTRY.items()
            if dc.has_gcp_pi_conflict()
        ]

    @classmethod
    def get_pending_pseudonymization(cls) -> list[str]:
        """返回已有冲突但尚未完成假名化的表名列表。"""
        return [
            table_name
            for table_name, dc in DATA_CLASSIFICATION_REGISTRY.items()
            if dc.requires_pseudonymization()
        ]

    @classmethod
    def get_phi_tables(cls) -> list[str]:
        """返回含受保护健康信息（PHI）的表名列表。"""
        return [k for k, v in DATA_CLASSIFICATION_REGISTRY.items() if v.is_phi()]

    @classmethod
    def compliance_summary(cls) -> dict:
        """生成合规汇总，供 /compliance-check API 端点使用。"""
        all_tables = DATA_CLASSIFICATION_REGISTRY
        total = len(all_tables)
        gcp_pi_conflicts = cls.get_gcp_pi_conflicts()
        pending_pseudo = cls.get_pending_pseudonymization()

        return {
            'total_tables': total,
            'sec4_tables': list(cls.get_by_security_level('SEC-4').keys()),
            'sec3_tables': list(cls.get_by_security_level('SEC-3').keys()),
            'sec2_tables': list(cls.get_by_security_level('SEC-2').keys()),
            'sec1_tables': list(cls.get_by_security_level('SEC-1').keys()),
            'crit_a_tables': list(cls.get_by_criticality('CRIT-A').keys()),
            'gcp_tables': list(cls.get_by_regulatory('REG-GCP').keys()),
            'pi_tables': list(cls.get_by_regulatory('REG-PI').keys()),
            'tax_tables': list(cls.get_by_regulatory('REG-TAX').keys()),
            'gcp_pi_conflict_tables': gcp_pi_conflicts,
            'pending_pseudonymization': pending_pseudo,
            'owner_assigned_count': sum(1 for v in all_tables.values() if v.data_owner_role),
            'retention_defined_count': sum(1 for v in all_tables.values() if v.retention_years is not None),
            'compliance_issues': [
                {
                    'type': 'pseudonymization_required',
                    'severity': 'high',
                    'tables': pending_pseudo,
                    'message': f'{len(pending_pseudo)} 张表存在 GCP+PIPL 冲突，需完成假名化设计',
                },
            ] if pending_pseudo else [],
        }
