"""
预置数据质量规则

内置 12 条核心规则，覆盖 GCP 合规、PIPL 数据完整性、知识库健康三个维度。

使用方式：
  python manage.py seed_data_quality_rules
  python manage.py seed_data_quality_rules --update-existing
"""
from django.core.management.base import BaseCommand

PRESET_RULES = [
    # ── GCP 合规类（critical）────────────────────────────────────────────────
    {
        'rule_id': 'subject_enrolled_without_consent',
        'name': '受试者未签署知情同意即入组',
        'description': '受试者 enrollment_date 早于 consent_date，违反 GCP ICH E6 R2',
        'target_table': 't_subject',
        'rule_type': 'sql_check',
        'rule_expression': (
            'SELECT s.id FROM t_subject s '
            'JOIN t_enrollment e ON e.subject_id = s.id '
            'WHERE e.enrollment_date < s.consent_date'
        ),
        'severity': 'critical',
        'owner_role': 'clinical_monitor',
        'tags': ['GCP', 'ICH_E6_R2', '受试者权益'],
    },
    {
        'rule_id': 'crf_record_missing_required_fields',
        'name': 'CRF 记录缺少必填字段',
        'description': 'eCRF 记录中关键字段为空（ALCOA+ 完整性要求）',
        'target_table': 't_crf_record',
        'rule_type': 'null_check',
        'rule_expression': 'form_data',
        'severity': 'critical',
        'owner_role': 'data_manager',
        'tags': ['GCP', 'ALCOA+', 'eCRF'],
    },
    {
        'rule_id': 'ekb_raw_record_count_stable',
        'name': '易快报原始记录数量稳定性',
        'description': 'EkbRawRecord 记录数不应减少（永久不可变层）',
        'target_table': 't_ekb_raw_record',
        'rule_type': 'count_min',
        'rule_expression': '34000',  # V1 基准 34,723，留 1% 缓冲
        'severity': 'critical',
        'owner_role': 'tech_director',
        'tags': ['不可变层', '财务合规'],
    },

    # ── PIPL / 数据安全类（warning）──────────────────────────────────────────
    {
        'rule_id': 'subject_phone_format',
        'name': '受试者手机号格式错误',
        'description': '手机号应为 11 位数字（PIPL 个人信息准确性要求）',
        'target_table': 't_subject',
        'rule_type': 'format_check',
        'rule_expression': r'phone|^1[3-9]\d{9}$',
        'severity': 'warning',
        'owner_role': 'data_manager',
        'tags': ['PIPL', 'PHI', '数据准确性'],
    },
    {
        'rule_id': 'subject_without_pseudonym',
        'name': '受试者缺少假名化记录',
        'description': 'GCP+PIPL 双重合规要求：每个受试者必须有对应的假名化记录',
        'target_table': 't_subject',
        'rule_type': 'sql_check',
        'rule_expression': (
            'SELECT s.id FROM t_subject s '
            'LEFT JOIN t_subject_pseudonym sp ON sp.subject_id = s.id '
            'WHERE sp.id IS NULL'
        ),
        'severity': 'warning',
        'owner_role': 'compliance_officer',
        'tags': ['GCP', 'PIPL', '假名化'],
    },
    {
        'rule_id': 'personal_context_no_content_hash',
        'name': 'PersonalContext 缺少内容哈希',
        'description': '内容哈希用于去重检查，缺失会导致重复入库',
        'target_table': 't_personal_context',
        'rule_type': 'null_check',
        'rule_expression': 'content_hash',
        'severity': 'warning',
        'owner_role': 'data_manager',
        'tags': ['知识库', '去重'],
    },

    # ── 知识库健康类（warning/info）──────────────────────────────────────────
    {
        'rule_id': 'knowledge_entry_no_title',
        'name': '知识条目标题为空',
        'description': '知识条目缺少标题无法在检索结果中正常展示',
        'target_table': 't_knowledge_entry',
        'rule_type': 'null_check',
        'rule_expression': 'title',
        'severity': 'warning',
        'owner_role': 'data_manager',
        'tags': ['知识库', '数据完整性'],
    },
    {
        'rule_id': 'knowledge_entry_pending_vectorize_excessive',
        'name': '待向量化知识条目积压',
        'description': '待向量化（index_status=pending）条目超过 500 条，说明向量化任务积压',
        'target_table': 't_knowledge_entry',
        'rule_type': 'sql_check',
        'rule_expression': (
            "SELECT id FROM t_knowledge_entry "
            "WHERE index_status = 'pending' AND is_deleted = false"
        ),
        'severity': 'info',
        'owner_role': 'tech_director',
        'tags': ['知识库', '向量化', '性能'],
    },
    {
        'rule_id': 'knowledge_entry_low_quality_score',
        'name': '低质量分知识条目积压',
        'description': '质量分低于 30 的已发布知识条目超过 50 条',
        'target_table': 't_knowledge_entry',
        'rule_type': 'sql_check',
        'rule_expression': (
            "SELECT id FROM t_knowledge_entry "
            "WHERE quality_score < 30 AND is_published = true AND is_deleted = false"
        ),
        'severity': 'info',
        'owner_role': 'data_manager',
        'tags': ['知识库', '质量评分'],
    },

    # ── 审计日志类（info）────────────────────────────────────────────────────
    {
        'rule_id': 'audit_log_minimum_count',
        'name': '审计日志记录数量基准',
        'description': '系统上线后审计日志应持续增长，低于基准值说明审计功能可能异常',
        'target_table': 't_audit_log',
        'rule_type': 'count_min',
        'rule_expression': '1',  # 最低 1 条，主要是确认表可访问
        'severity': 'info',
        'owner_role': 'admin',
        'tags': ['GCP', '审计', '21CFR11'],
    },

    # ── 系统健康类（warning）────────────────────────────────────────────────
    {
        'rule_id': 'agent_definition_no_active_agents',
        'name': '无活跃 Agent 定义',
        'description': '系统中没有 status=active 的 Agent，中书·智能台将无法工作',
        'target_table': 't_agent_definition',
        'rule_type': 'sql_check',
        'rule_expression': (
            "SELECT id FROM t_agent_definition WHERE status = 'active'"
            " HAVING COUNT(*) = 0"  # 空结果时无违规
        ),
        'severity': 'warning',
        'owner_role': 'tech_director',
        'tags': ['Agent', '系统健康'],
    },
    {
        'rule_id': 'token_expiry_imminent',
        'name': '飞书 Token 即将大量过期',
        'description': '7 天内即将过期的 FeishuUserToken 超过 10 个，用户将无法正常使用',
        'target_table': 't_feishu_user_token',
        'rule_type': 'sql_check',
        'rule_expression': (
            "SELECT id FROM t_feishu_user_token "
            "WHERE access_expires_at < NOW() + INTERVAL '7 days' "
            "AND access_expires_at > NOW()"
        ),
        'severity': 'warning',
        'owner_role': 'tech_director',
        'tags': ['飞书OAuth', 'Token健康'],
    },
]


class Command(BaseCommand):
    help = '预置数据质量规则到 t_data_quality_rule'

    def add_arguments(self, parser):
        parser.add_argument('--update-existing', action='store_true', default=False,
                            help='更新已存在的规则配置（默认跳过）')

    def handle(self, *args, **options):
        update_existing = options['update_existing']
        from apps.quality.models import DataQualityRule

        stats = {'created': 0, 'updated': 0, 'skipped': 0}

        for rule_data in PRESET_RULES:
            rule_id = rule_data['rule_id']
            existing = DataQualityRule.objects.filter(rule_id=rule_id).first()

            if existing:
                if not update_existing:
                    self.stdout.write(f'  [跳过] {rule_id}')
                    stats['skipped'] += 1
                    continue
                for k, v in rule_data.items():
                    setattr(existing, k, v)
                existing.save()
                self.stdout.write(self.style.WARNING(f'  [更新] {rule_id}: {existing.name}'))
                stats['updated'] += 1
            else:
                DataQualityRule.objects.create(**rule_data)
                self.stdout.write(self.style.SUCCESS(f'  [创建] {rule_id}'))
                stats['created'] += 1

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'完成：创建={stats["created"]} 更新={stats["updated"]} 跳过={stats["skipped"]}'
        ))
        self.stdout.write('运行巡检：python manage.py run_data_quality_patrol')
