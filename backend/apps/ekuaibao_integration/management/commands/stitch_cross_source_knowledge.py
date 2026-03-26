"""
stitch_cross_source_knowledge — 跨源知识图谱融合命令

将飞书数据（PersonalContext: 621,623条）与易快报数据（ExpenseRequest/Protocol/Client）
通过统一的 Account 身份体系交叉关联，构建跨源知识图谱。

用法：
  python manage.py stitch_cross_source_knowledge
  python manage.py stitch_cross_source_knowledge --step 1   # 只做人员→飞书上下文统计
  python manage.py stitch_cross_source_knowledge --step 2   # 只做邮件/IM中提取项目引用
  python manage.py stitch_cross_source_knowledge --step 3   # 只构建跨源 KnowledgeRelation

关联逻辑：
  1. Account.feishu_open_id → PersonalContext.user_id → 该人的邮件/IM/日历/任务
  2. Account.ekuaibao_staff_id → ExpenseRequest（报销单）→ Protocol/Client
  3. PersonalContext.raw_content 中提取项目编号（M/C/W/A开头+数字）→ 关联 Protocol
  4. PersonalContext.raw_content 中提取客户名称 → 关联 Client
  5. 以上关系写入 KnowledgeRelation（predicate_uri=cnkis:mentioned_in/involved_in）
"""
import logging
import re

from django.core.management.base import BaseCommand

logger = logging.getLogger('cn_kis.ekuaibao.stitch_cross_source')


class Command(BaseCommand):
    help = '跨源知识图谱融合（飞书 PersonalContext × 易快报数据）'

    def add_arguments(self, parser):
        parser.add_argument('--step', type=int, choices=[1, 2, 3], help='只执行指定步骤')
        parser.add_argument('--dry-run', action='store_true', dest='dry_run',
                            help='预览模式，不写入数据库')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        step = options.get('step')
        steps = [step] if step else [1, 2, 3]

        self.stdout.write(f'模式: {"DRY-RUN" if dry_run else "正式执行"}  步骤: {steps}')

        if 1 in steps:
            self.stdout.write('\n[Step 1] 统计每人的飞书上下文数量...')
            result = self._step1_person_context_stats(dry_run)
            self.stdout.write(self.style.SUCCESS(f'  完成: {result}'))

        if 2 in steps:
            self.stdout.write('\n[Step 2] 从飞书内容中提取项目/客户引用...')
            result = self._step2_extract_project_mentions(dry_run)
            self.stdout.write(self.style.SUCCESS(f'  完成: {result}'))

        if 3 in steps:
            self.stdout.write('\n[Step 3] 构建跨源 KnowledgeRelation...')
            result = self._step3_build_cross_source_relations(dry_run)
            self.stdout.write(self.style.SUCCESS(f'  完成: {result}'))

    # ─────────────────────────────────────────
    # Step 1: 人员 → 飞书上下文数量统计
    # ─────────────────────────────────────────

    def _step1_person_context_stats(self, dry_run: bool) -> dict:
        """
        统计每个有飞书 ID 的 Account 对应的 PersonalContext 数量，
        将汇总数据写入 KnowledgeEntity.properties（丰富人员画像）。
        """
        from apps.identity.models import Account
        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntity
        from django.db.models import Count

        stats = {'accounts_processed': 0, 'entities_updated': 0}

        # 获取所有已缝合的账号
        stitched_accounts = Account.objects.filter(
            is_deleted=False,
            feishu_open_id__gt='',
            ekuaibao_staff_id__gt='',
        )

        self.stdout.write(f'  已缝合账号数: {stitched_accounts.count()}')

        for account in stitched_accounts:
            # 统计该人的 PersonalContext
            ctx_stats = PersonalContext.objects.filter(
                user_id=account.feishu_open_id
            ).values('source_type').annotate(cnt=Count('id'))

            if not ctx_stats.exists():
                continue

            ctx_by_type = {row['source_type']: row['cnt'] for row in ctx_stats}
            total_ctx = sum(ctx_by_type.values())

            stats['accounts_processed'] += 1

            if not dry_run:
                # 更新 KnowledgeEntity（person 类型）的 properties
                KnowledgeEntity.objects.filter(
                    uri=f'cnkis:person:{account.ekuaibao_staff_id}',
                    is_deleted=False,
                ).update(
                    **{'properties': {
                        'system_account_id': account.id,
                        'ekuaibao_staff_id': account.ekuaibao_staff_id,
                        'feishu_open_id': account.feishu_open_id,
                        'feishu_context_total': total_ctx,
                        'feishu_context_by_type': ctx_by_type,
                        'has_feishu_data': True,
                    }}
                )
                stats['entities_updated'] += 1

        return stats

    # ─────────────────────────────────────────
    # Step 2: 从飞书内容提取项目/客户引用
    # ─────────────────────────────────────────

    def _step2_extract_project_mentions(self, dry_run: bool) -> dict:
        """
        扫描 PersonalContext.raw_content，用正则提取项目编号（M/C/W/A+数字），
        以及客户名称（17 个已知客户），建立 mention 关系缓存。
        这些关系将在 Step 3 写入 KnowledgeRelation。
        """
        from apps.secretary.models import PersonalContext
        from apps.protocol.models import Protocol
        from apps.crm.models import Client

        # 构建项目编号模式（M26041002, C25001029, W26007008 等）
        project_codes = set(
            Protocol.objects.filter(is_deleted=False).values_list('code', flat=True)
        )
        # 正则：项目编号格式
        code_pattern = re.compile(
            r'\b([MCWARO]\d{2}[A-Z0-9]{3,8})\b'
        )

        # 客户名称集合
        client_names = list(Client.objects.values_list('name', flat=True))

        stats = {
            'contexts_scanned': 0,
            'project_mentions': 0,
            'client_mentions': 0,
        }

        # 扫描最近 50,000 条 PersonalContext（性能平衡）
        # 按 created_at 降序取最近的记录
        contexts = PersonalContext.objects.filter(
            source_type__in=['mail', 'im', 'calendar', 'task']
        ).order_by('-created_at')[:50000]

        mention_data = []  # {user_id, source_type, source_id, project_code/client_name, mention_type}

        for ctx in contexts:
            content = (ctx.raw_content or '') + (ctx.summary or '')
            if not content:
                continue

            stats['contexts_scanned'] += 1

            # 提取项目编号
            found_codes = code_pattern.findall(content)
            for code in found_codes:
                if code in project_codes:
                    mention_data.append({
                        'user_id': ctx.user_id,
                        'source_id': ctx.source_id,
                        'source_type': ctx.source_type,
                        'ref_type': 'project',
                        'ref_value': code,
                    })
                    stats['project_mentions'] += 1

            # 提取客户名称
            for cname in client_names:
                if len(cname) >= 2 and cname in content:
                    mention_data.append({
                        'user_id': ctx.user_id,
                        'source_id': ctx.source_id,
                        'source_type': ctx.source_type,
                        'ref_type': 'client',
                        'ref_value': cname,
                    })
                    stats['client_mentions'] += 1

        # 保存提取结果到临时文件供 Step 3 使用
        import json
        with open('/tmp/mention_data.json', 'w', encoding='utf-8') as f:
            json.dump(mention_data[:100000], f, ensure_ascii=False)

        stats['mention_data_saved'] = len(mention_data)
        return stats

    # ─────────────────────────────────────────
    # Step 3: 构建跨源 KnowledgeRelation
    # ─────────────────────────────────────────

    def _step3_build_cross_source_relations(self, dry_run: bool) -> dict:
        """
        基于 Step 2 提取的 mention 数据，在 KnowledgeEntity 之间建立跨源关系。
        """
        import json
        from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation
        from apps.identity.models import Account

        stats = {'relations_created': 0, 'skipped': 0}

        # 读取 mention 数据
        try:
            with open('/tmp/mention_data.json') as f:
                mentions = json.load(f)
        except FileNotFoundError:
            self.stdout.write(self.style.WARNING('  mention_data.json 不存在，请先运行 --step 2'))
            return stats

        # 构建查找映射
        # build_operations_graph 创建的实体使用 namespace='operations_graph_2026Q1'
        # person 实体的 properties 包含 feishu_open_id，project 实体的 label 就是项目编号
        OPS_NS = 'operations_graph_2026Q1'

        feishu_to_ekb = {
            acc.feishu_open_id: acc.ekuaibao_staff_id
            for acc in Account.objects.filter(
                is_deleted=False, feishu_open_id__gt='', ekuaibao_staff_id__gt=''
            )
        }
        # 项目实体：label 即项目编号（如 M25076001），properties.project_no 同值
        proto_code_to_entity = {
            e.label: e
            for e in KnowledgeEntity.objects.filter(
                entity_type='project', namespace=OPS_NS, is_deleted=False
            )
            if e.label
        }
        # 客户实体：label 是客户名
        client_name_to_entity = {
            e.label: e
            for e in KnowledgeEntity.objects.filter(
                entity_type='client', namespace=OPS_NS, is_deleted=False
            )
            if e.label
        }
        # 人员实体：properties.feishu_open_id → entity
        # 注意：feishu_to_ekb 的 key 是 feishu_open_id，Step3 的聚合 key 是 ekb_id
        # 因此需要 feishu_open_id → person_entity 的映射
        feishu_id_to_person_entity = {
            e.properties.get('feishu_open_id', ''): e
            for e in KnowledgeEntity.objects.filter(
                entity_type='person', namespace=OPS_NS, is_deleted=False
            )
            if e.properties.get('feishu_open_id', '')
        }

        self.stdout.write(f'  查找映射：project={len(proto_code_to_entity)}, client={len(client_name_to_entity)}, person={len(feishu_id_to_person_entity)}')

        # 聚合：(feishu_open_id, ref_type, ref_value) → mention 次数
        # 使用 feishu_open_id 作为 key（因为 person_entity 用 feishu_open_id 索引）
        from collections import Counter
        mention_agg = Counter()
        for m in mentions:
            feishu_id = m.get('user_id', '')
            if not feishu_id:
                continue
            # 只处理已缝合账号（有对应易快报 ID）
            if feishu_id not in feishu_to_ekb:
                continue
            mention_agg[(feishu_id, m['ref_type'], m['ref_value'])] += 1

        self.stdout.write(f'  有效 mention 聚合：{len(mention_agg)} 组（{sum(mention_agg.values())} 次）')

        def _upsert_relation(subject_entity, object_entity, predicate_uri: str, properties: dict = None):
            rel, created = KnowledgeRelation.objects.get_or_create(
                subject=subject_entity,
                object=object_entity,
                predicate_uri=predicate_uri,
                is_deleted=False,
                defaults={
                    'relation_type': 'custom',
                    'source': 'feishu_cross_stitch',
                    'confidence': 0.9,
                    'metadata': properties or {},
                }
            )
            return created

        # 建立关系
        for (feishu_id, ref_type, ref_value), count in mention_agg.items():
            person_entity = feishu_id_to_person_entity.get(feishu_id)
            if not person_entity:
                stats['skipped'] += 1
                continue

            if ref_type == 'project':
                obj_entity = proto_code_to_entity.get(ref_value)
            elif ref_type == 'client':
                obj_entity = client_name_to_entity.get(ref_value)
            else:
                stats['skipped'] += 1
                continue

            if not obj_entity:
                stats['skipped'] += 1
                continue

            predicate = f'cnkis:mentioned_{ref_type}_in_feishu'
            if not dry_run:
                created = _upsert_relation(
                    person_entity, obj_entity, predicate,
                    {'mention_count': count, 'source': 'feishu_context_mining'}
                )
                if created:
                    stats['relations_created'] += 1

        return stats
