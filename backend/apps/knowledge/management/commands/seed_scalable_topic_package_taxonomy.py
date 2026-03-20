"""
批量创建高价值 TopicPackage 分类体系，用于后续物化结构化专题作战卡。

目标：
1. 以行业真实知识轴构建大规模、可持续扩展的专题包 taxonomy
2. 覆盖成分 / 仪器 / 统计 / 合规 / 运营五大高价值知识面
3. 为 materialize_topic_package_playbooks 提供高质量专题包母体
"""
from django.core.management.base import BaseCommand

from apps.knowledge.models import TopicPackage


INGREDIENTS = [
    ('niacinamide', '烟酰胺'),
    ('retinol', '视黄醇'),
    ('retinyl_palmitate', '视黄醇棕榈酸酯'),
    ('salicylic_acid', '水杨酸'),
    ('hyaluronic_acid', '透明质酸'),
    ('ceramide', '神经酰胺'),
    ('panthenol', '泛醇'),
    ('alpha_arbutin', 'α-熊果苷'),
    ('tranexamic_acid', '传明酸'),
    ('ascorbic_acid', '维生素C'),
    ('kojic_acid', '曲酸'),
    ('peptides', '多肽'),
    ('bakuchiol', '补骨脂酚'),
    ('azelaic_acid', '壬二酸'),
    ('zinc_oxide', '氧化锌'),
    ('titanium_dioxide', '二氧化钛'),
    ('octocrylene', '奥克立林'),
    ('avobenzone', '阿伏苯宗'),
    ('parabens', '对羟基苯甲酸酯'),
    ('phenoxyethanol', '苯氧乙醇'),
    ('methylisothiazolinone', '甲基异噻唑啉酮'),
    ('fragrance_allergens', '香精致敏原'),
    ('allantoin', '尿囊素'),
    ('glycerin', '甘油'),
    ('urea', '尿素'),
]

INGREDIENT_DIMENSIONS = [
    ('safety_boundary', '安全边界', 'ingredient_safety'),
    ('efficacy_mechanism', '功效机制', 'core_concepts'),
    ('formulation_compatibility', '配伍兼容', 'instrument_methods'),
    ('evaluation_methods', '评价方法', 'study_design'),
]

INSTRUMENTS = [
    ('corneometer', 'Corneometer 角质层水分仪'),
    ('tewameter', 'Tewameter 经皮失水仪'),
    ('mexameter', 'Mexameter 黑色素红斑仪'),
    ('cutometer', 'Cutometer 弹性仪'),
    ('visiometer', 'Visiometer 纹理仪'),
    ('visioscan', 'Visioscan 皮肤表面扫描'),
    ('sebumeter', 'Sebumeter 油脂仪'),
    ('chromameter', 'Chromameter 色差仪'),
    ('glossmeter', 'Glossmeter 光泽仪'),
    ('ultrasound_skin_imaging', '皮肤超声成像'),
    ('patch_test', '斑贴试验'),
    ('hript', 'HRIPT 重复刺激斑贴试验'),
    ('spf_in_vivo', 'SPF 体内测试'),
    ('uva_pf_in_vitro', 'UVA-PF 体外评估'),
    ('sensory_panel', '感官评估小组'),
    ('clinical_photography', '临床摄影'),
    ('barrier_assessment', '皮肤屏障评估'),
    ('elasticity_assessment', '弹性评估'),
    ('pigmentation_assessment', '色素评估'),
    ('scalp_hair_assessment', '头皮头发评估'),
]

INSTRUMENT_DIMENSIONS = [
    ('operating_principles', '操作原理', 'core_concepts'),
    ('data_quality_control', '数据质量控制', 'sop_risks'),
    ('result_interpretation', '结果解读', 'key_metrics'),
]

STATISTICS = [
    ('sample_size_estimation', '样本量估算'),
    ('randomization_blinding', '随机化与盲法'),
    ('split_face_design', '半脸配对设计'),
    ('repeated_measures_analysis', '重复测量分析'),
    ('missing_data_handling', '缺失数据处理'),
    ('estimand_framework', 'Estimand 框架'),
    ('multiplicity_control', '多重比较控制'),
    ('noninferiority_equivalence', '非劣与等效'),
    ('responder_analysis', '响应者分析'),
    ('pro_reporting', 'PRO 报告规范'),
    ('baseline_adjustment', '基线校正'),
    ('subgroup_analysis', '亚组分析'),
    ('outlier_handling', '异常值处理'),
    ('protocol_deviation_analysis', '方案偏离分析'),
    ('safety_signal_review', '安全信号复核'),
]

STATISTIC_DIMENSIONS = [
    ('design_rules', '设计规则', 'study_design'),
    ('analysis_methods', '分析方法', 'key_metrics'),
    ('reporting_boundaries', '报告边界', 'reporting_templates'),
]

COMPLIANCE = [
    ('informed_consent_execution', '知情同意执行'),
    ('privacy_protection', '隐私保护'),
    ('audit_trail_governance', '审计追踪治理'),
    ('capa_root_cause', 'CAPA 根因分析'),
    ('deviation_management', '偏差管理'),
    ('sop_version_control', 'SOP 版本控制'),
    ('training_compliance', '培训合规'),
    ('equipment_calibration_compliance', '设备校准合规'),
    ('ethics_submission', '伦理申报'),
    ('sae_reporting', '严重不良事件上报'),
    ('source_data_verification', '原始数据核查'),
    ('data_lock_closeout', '锁库与结项'),
    ('change_control', '变更控制'),
    ('vendor_oversight', '供应商监督'),
    ('document_archiving', '文件归档'),
]

COMPLIANCE_DIMENSIONS = [
    ('regulation_boundary', '法规边界', 'regulation_boundary'),
    ('operational_checklist', '执行清单', 'sop_risks'),
    ('escalation_rules', '升级规则', 'faq_misconceptions'),
]

OPERATIONS = [
    ('subject_screening', '受试者筛选'),
    ('booking_rescheduling', '预约与改期'),
    ('visit_window_management', '访视窗口管理'),
    ('dropout_recovery', '脱落恢复'),
    ('subject_complaint_handling', '受试者投诉处理'),
    ('workorder_handover', '工单交接'),
    ('resource_coordination', '资源协调'),
    ('project_risk_triage', '项目风险分诊'),
    ('site_incident_response', '现场异常响应'),
    ('equipment_failure_fallback', '设备故障兜底'),
    ('report_delivery_review', '报告交付复核'),
    ('client_query_response', '客户问题响应'),
    ('cross_team_escalation', '跨团队升级'),
    ('meeting_decision_capture', '会议决策沉淀'),
    ('project_closeout_archive', '项目结项归档'),
]

OPERATION_DIMENSIONS = [
    ('workflow_rules', '流程规则', 'study_design'),
    ('failure_patterns', '失效模式', 'sop_risks'),
    ('response_templates', '响应模板', 'reporting_templates'),
]


def _build_specs():
    specs = []

    for code, label in INGREDIENTS:
        for dim_code, dim_label, facet in INGREDIENT_DIMENSIONS:
            specs.append({
                'package_id': f'pkg_ing_{code}_{dim_code}',
                'canonical_topic': f'{label}{dim_label}',
                'description': f'聚焦 {label} 在化妆品人体功效评价中的{dim_label}、适用边界、风险和证据路径。',
                'facet': facet,
                'authority': 'mixed',
                'keywords': [label, dim_label, '成分', '化妆品'],
                'related': ['ingredient_safety'],
            })

    for code, label in INSTRUMENTS:
        for dim_code, dim_label, facet in INSTRUMENT_DIMENSIONS:
            specs.append({
                'package_id': f'pkg_inst_{code}_{dim_code}',
                'canonical_topic': f'{label}{dim_label}',
                'description': f'聚焦 {label} 的{dim_label}、适用场景、质量控制与结果使用边界。',
                'facet': facet,
                'authority': 'mixed',
                'keywords': [label, dim_label, '仪器', '评价方法'],
                'related': ['instruments', 'methodology'],
            })

    for code, label in STATISTICS:
        for dim_code, dim_label, facet in STATISTIC_DIMENSIONS:
            specs.append({
                'package_id': f'pkg_stat_{code}_{dim_code}',
                'canonical_topic': f'{label}{dim_label}',
                'description': f'聚焦 {label} 在化妆品功效评价和人体研究中的{dim_label}与解释边界。',
                'facet': facet,
                'authority': 'mixed',
                'keywords': [label, dim_label, '统计', '研究设计'],
                'related': ['statistics', 'methodology'],
            })

    for code, label in COMPLIANCE:
        for dim_code, dim_label, facet in COMPLIANCE_DIMENSIONS:
            specs.append({
                'package_id': f'pkg_cmp_{code}_{dim_code}',
                'canonical_topic': f'{label}{dim_label}',
                'description': f'聚焦 {label} 在 CRO 合规治理中的{dim_label}、升级点和留痕要求。',
                'facet': facet,
                'authority': 'tier1' if dim_code == 'regulation_boundary' else 'mixed',
                'keywords': [label, dim_label, '合规', 'GCP'],
                'related': ['regulations', 'ethics', 'project_operations'],
            })

    for code, label in OPERATIONS:
        for dim_code, dim_label, facet in OPERATION_DIMENSIONS:
            specs.append({
                'package_id': f'pkg_ops_{code}_{dim_code}',
                'canonical_topic': f'{label}{dim_label}',
                'description': f'聚焦 {label} 这一运营场景中的{dim_label}、常见失败模式和标准化响应。',
                'facet': facet,
                'authority': 'mixed',
                'keywords': [label, dim_label, '运营', '流程'],
                'related': ['project_operations', 'subject_management'],
            })

    return specs


class Command(BaseCommand):
    help = '批量创建可扩展 TopicPackage taxonomy'

    def handle(self, *args, **options):
        created = 0
        updated = 0
        specs = _build_specs()

        for spec in specs:
            defaults = {
                'canonical_topic': spec['canonical_topic'],
                'description': spec['description'],
                'coverage_weight': 1.0,
                'required_for_release': False,
                'source_authority_level': spec['authority'],
                'status': 'building',
                'properties': {
                    'cluster_keywords': spec['keywords'],
                    'related_packages': spec['related'],
                    'seed_facet': spec['facet'],
                    'taxonomy_source': 'seed_scalable_topic_package_taxonomy',
                },
            }
            obj, was_created = TopicPackage.objects.update_or_create(
                package_id=spec['package_id'],
                defaults=defaults,
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'[CREATE] {obj.package_id}'))
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'完成：created={created}, updated={updated}, total_specs={len(specs)}'
        ))
