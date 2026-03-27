"""
build_business_profiles — 业务画像生成命令

为人员、项目、客户生成融合了飞书上下文和易快报数据的全景文本描述，
写入 KnowledgeEntry 并触发向量化，使 AI 可通过语义搜索回答业务问题。

用法：
  python manage.py build_business_profiles
  python manage.py build_business_profiles --type person    # 只生成人员画像
  python manage.py build_business_profiles --type project   # 只生成项目画像
  python manage.py build_business_profiles --type client    # 只生成客户画像
  python manage.py build_business_profiles --type approval  # 只生成审批流程知识
"""
import logging

from django.core.management.base import BaseCommand

logger = logging.getLogger('cn_kis.ekuaibao.build_profiles')


class Command(BaseCommand):
    help = '生成人员/项目/客户全景业务画像并触发向量化'

    def add_arguments(self, parser):
        parser.add_argument(
            '--type', type=str,
            choices=['person', 'project', 'client', 'approval', 'all'],
            default='all', help='画像类型',
        )
        parser.add_argument('--dry-run', action='store_true', dest='dry_run')

    def handle(self, *args, **options):
        profile_type = options['type']
        dry_run = options['dry_run']

        types_to_run = {
            'person': self._build_person_profiles,
            'project': self._build_project_profiles,
            'client': self._build_client_profiles,
            'approval': self._build_approval_profiles,
        }

        if profile_type == 'all':
            run_list = list(types_to_run.items())
        else:
            run_list = [(profile_type, types_to_run[profile_type])]

        for name, func in run_list:
            self.stdout.write(f'\n[{name}] 生成业务画像...')
            try:
                result = func(dry_run)
                self.stdout.write(self.style.SUCCESS(f'  完成: {result}'))
            except Exception as ex:
                logger.error('%s 画像生成失败: %s', name, ex, exc_info=True)
                self.stdout.write(self.style.ERROR(f'  失败: {ex}'))

    # ────────────────────────────────────────────
    # 人员画像
    # ────────────────────────────────────────────

    def _build_person_profiles(self, dry_run: bool) -> dict:
        from apps.identity.models import Account
        from apps.hr.models import Staff
        from apps.finance.models_expense import ExpenseRequest
        from apps.secretary.models import PersonalContext
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
        from django.db.models import Sum, Count

        stats = {'created': 0, 'skipped': 0}

        # 只为有飞书ID的活跃账号生成画像（适配生产环境，ekuaibao_staff_id字段可能不存在）
        try:
            queryset = Account.objects.filter(
                is_deleted=False, feishu_open_id__gt='', ekuaibao_staff_id__gt=''
            )
            # 先测试字段是否存在
            queryset.count()
        except Exception:
            queryset = Account.objects.filter(
                is_deleted=False, feishu_open_id__isnull=False, status='active'
            ).exclude(feishu_open_id='')

        for account in queryset:
            staff = Staff.objects.filter(account_fk=account, is_deleted=False).first()
            dept = staff.department if staff else ''
            position = staff.position if staff else ''

            # 易快报侧数据（如果有字段）
            try:
                ekb_id = getattr(account, 'ekuaibao_staff_id', '')
                if ekb_id:
                    try:
                        expenses = ExpenseRequest.objects.filter(
                            ekuaibao_submitter_id=ekb_id, import_source='ekuaibao'
                        )
                        expenses.count()  # 触发字段检测
                    except Exception:
                        expenses = ExpenseRequest.objects.filter(
                            applicant_id=account.id
                        )
                else:
                    expenses = ExpenseRequest.objects.filter(applicant_id=account.id)
            except Exception:
                expenses = ExpenseRequest.objects.none()
            total_expense = expenses.aggregate(Sum('amount'))['amount__sum'] or 0
            expense_count = expenses.count()

            # 项目和客户
            projects = set()
            clients = set()
            templates = set()
            for exp in expenses:
                if getattr(exp, 'project_name', ''):
                    projects.add(exp.project_name)
                if getattr(exp, 'client_name', ''):
                    clients.add(exp.client_name)
                if getattr(exp, 'expense_template', ''):
                    templates.add(exp.expense_template)

            # 飞书侧数据
            ctx_stats = PersonalContext.objects.filter(
                user_id=account.feishu_open_id
            ).values('source_type').annotate(cnt=Count('id'))
            feishu_ctx = {row['source_type']: row['cnt'] for row in ctx_stats}
            total_feishu = sum(feishu_ctx.values())

            # 角色信息（从审批流推导）
            from apps.identity.models import AccountRole
            role_names = list(AccountRole.objects.filter(
                account=account
            ).values_list('role__display_name', flat=True))

            # 生成画像文本
            lines = [
                f"人员：{account.display_name}",
                f"部门：{dept}，岗位：{position}" if dept else f"岗位：{position}",
            ]
            if role_names:
                lines.append(f"业务角色：{'、'.join(set(role_names))}")
            if expense_count > 0:
                lines.append(f"提交报销：{expense_count} 张，共 ¥{total_expense:,.2f}")
            if clients:
                lines.append(f"涉及客户：{'、'.join(list(clients)[:5])}")
            if projects:
                lines.append(f"涉及项目：{'、'.join(list(projects)[:5])}")
            if templates:
                lines.append(f"报销类型：{'、'.join(templates)}")
            if total_feishu > 0:
                detail = '、'.join(
                    f"{k}:{v}" for k, v in sorted(feishu_ctx.items(), key=lambda x: -x[1])[:3]
                )
                lines.append(f"飞书上下文：共 {total_feishu} 条（{detail}）")

            content = '\n'.join(lines)

            if not dry_run:
                ekb_id = getattr(account, 'ekuaibao_staff_id', '') or ''
                result = run_pipeline(RawKnowledgeInput(
                    title=f'人员画像：{account.display_name}',
                    content=content,
                    entry_type='lesson_learned',
                    source_type='person_profile',
                    source_key=f'profile:person:{account.feishu_open_id or account.id}',
                    tags=['人员画像', account.display_name, dept],
                    namespace='business_profile',
                    properties={
                        'account_id': account.id,
                        'ekuaibao_staff_id': ekb_id,
                        'feishu_open_id': account.feishu_open_id,
                        'expense_total': float(total_expense),
                        'feishu_context_total': total_feishu,
                    },
                ))
                if result.success:
                    stats['created'] += 1
                else:
                    stats['skipped'] += 1

        return stats

    # ────────────────────────────────────────────
    # 项目画像
    # ────────────────────────────────────────────

    def _build_project_profiles(self, dry_run: bool) -> dict:
        from apps.protocol.models import Protocol
        from apps.crm.models import Client
        from apps.finance.models_expense import ExpenseRequest
        from apps.finance.models import ProjectBudget
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
        from apps.knowledge.models import KnowledgeRelation
        from django.db.models import Sum

        stats = {'created': 0, 'skipped': 0}

        for protocol in Protocol.objects.filter(is_deleted=False).exclude(code__startswith='E2E'):
            expenses = ExpenseRequest.objects.filter(
                protocol_id=protocol.id, import_source='ekuaibao'
            )
            budgets = ProjectBudget.objects.filter(
                protocol_id=protocol.id, import_source='ekuaibao'
            )
            if not expenses.exists() and not budgets.exists():
                continue

            expense_total = expenses.aggregate(Sum('amount'))['amount__sum'] or 0
            budget_total = budgets.aggregate(Sum('total_expense'))['total_expense__sum'] or 0
            execution_rate = (float(expense_total) / float(budget_total) * 100) if budget_total else 0

            # 客户
            client_name = ''
            if protocol.sponsor_id:
                c = Client.objects.filter(id=protocol.sponsor_id).first()
                if c:
                    client_name = c.name

            # 涉及人员
            people = set(expenses.values_list('applicant_name', flat=True))

            # 涉及部门
            depts = set(
                v for v in expenses.values_list('cost_department', flat=True) if v
            )

            # 飞书中的提及次数（从 KnowledgeRelation 的 cnkis:mentioned_project_in_feishu）
            feishu_mentions = KnowledgeRelation.objects.filter(
                predicate_uri='cnkis:mentioned_project_in_feishu',
                object__uri=f'cnkis:project:{protocol.code}',
                is_deleted=False,
            ).count()

            lines = [
                f"项目：{protocol.code} — {protocol.title}",
                f"客户：{client_name}" if client_name else None,
                f"预算：¥{budget_total:,.2f}" if budget_total else None,
                f"实际费用：¥{expense_total:,.2f}（执行率 {execution_rate:.1f}%）" if expense_total else None,
                f"报销单数量：{expenses.count()} 张",
                f"涉及人员：{'、'.join(list(people)[:8])}" if people else None,
                f"费用承担部门：{'、'.join(depts)}" if depts else None,
                f"飞书沟通提及次数：{feishu_mentions}" if feishu_mentions > 0 else None,
            ]
            content = '\n'.join(l for l in lines if l)

            if not dry_run:
                result = run_pipeline(RawKnowledgeInput(
                    title=f'项目全景：{protocol.code} {protocol.title}',
                    content=content,
                    entry_type='lesson_learned',
                    source_type='project_profile',
                    source_key=f'profile:project:{protocol.code}',
                    tags=['项目画像', protocol.code, client_name],
                    namespace='business_profile',
                    properties={
                        'protocol_id': protocol.id,
                        'protocol_code': protocol.code,
                        'client_name': client_name,
                        'expense_total': float(expense_total),
                        'budget_total': float(budget_total),
                        'feishu_mentions': feishu_mentions,
                    },
                ))
                if result.success:
                    stats['created'] += 1
                else:
                    stats['skipped'] += 1

        return stats

    # ────────────────────────────────────────────
    # 客户画像
    # ────────────────────────────────────────────

    def _build_client_profiles(self, dry_run: bool) -> dict:
        from apps.crm.models import Client
        from apps.protocol.models import Protocol
        from apps.finance.models_expense import ExpenseRequest
        from apps.knowledge.models import KnowledgeRelation
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
        from django.db.models import Sum

        stats = {'created': 0, 'skipped': 0}

        for client in Client.objects.exclude(name__startswith='E2E'):
            protocols = Protocol.objects.filter(sponsor_id=client.id, is_deleted=False)
            if not protocols.exists():
                continue

            proto_ids = list(protocols.values_list('id', flat=True))
            expenses = ExpenseRequest.objects.filter(
                protocol_id__in=proto_ids, import_source='ekuaibao'
            )
            total_expense = expenses.aggregate(Sum('amount'))['amount__sum'] or 0

            # 主要客户经理
            account_managers = set(
                v for v in expenses.filter(
                    expense_template__contains='功效测试'
                ).values_list('applicant_name', flat=True) if v
            )

            # 飞书沟通次数
            feishu_mentions = KnowledgeRelation.objects.filter(
                predicate_uri='cnkis:mentioned_client_in_feishu',
                object__label=client.name,
                is_deleted=False,
            ).count()

            # 项目列表
            proj_list = [f"{p.code}({p.title[:15]})" for p in protocols[:8]]

            lines = [
                f"客户：{client.name}",
                f"关联项目：{protocols.count()} 个（{', '.join(proj_list)}）",
                f"累计费用：¥{total_expense:,.2f}",
                f"报销单：{expenses.count()} 张",
                f"主要涉及人员：{'、'.join(list(account_managers)[:5])}" if account_managers else None,
                f"飞书沟通提及次数：{feishu_mentions}" if feishu_mentions > 0 else None,
            ]
            content = '\n'.join(l for l in lines if l)

            if not dry_run:
                result = run_pipeline(RawKnowledgeInput(
                    title=f'客户全景：{client.name}',
                    content=content,
                    entry_type='lesson_learned',
                    source_type='client_profile',
                    source_key=f'profile:client:{client.id}',
                    tags=['客户画像', client.name],
                    namespace='business_profile',
                    properties={
                        'client_id': client.id,
                        'client_name': client.name,
                        'protocol_count': protocols.count(),
                        'expense_total': float(total_expense),
                        'feishu_mentions': feishu_mentions,
                    },
                ))
                if result.success:
                    stats['created'] += 1
                else:
                    stats['skipped'] += 1

        return stats

    # ────────────────────────────────────────────
    # 审批流程知识
    # ────────────────────────────────────────────

    def _build_approval_profiles(self, dry_run: bool) -> dict:
        from apps.knowledge.models import KnowledgeEntity
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

        stats = {'created': 0, 'skipped': 0}

        # 获取所有审批流模板实体
        flow_entities = KnowledgeEntity.objects.filter(
            entity_type='concept',
            namespace='cnkis',
            uri__startswith='cnkis:approval_flow:',
            is_deleted=False,
        )

        for entity in flow_entities:
            props = entity.properties or {}
            nodes = props.get('nodes', [])
            usage_count = props.get('usage_count', 0)
            node_str = ' → '.join(filter(None, nodes))

            content = (
                f"审批流程：{entity.label}\n"
                f"审批节点顺序：{node_str}\n"
                f"历史使用次数：{usage_count} 次\n"
                f"适用场景：{'项目相关' if '功效测试' in entity.label or '特化' in entity.label else '日常管理'}报销"
            )

            if not dry_run:
                result = run_pipeline(RawKnowledgeInput(
                    title=f'审批流程：{entity.label}',
                    content=content,
                    entry_type='sop',
                    source_type='approval_flow_profile',
                    source_key=f'profile:approval_flow:{entity.label}',
                    tags=['审批流程', entity.label, '费用报销'],
                    namespace='business_profile',
                    properties={'nodes': nodes, 'usage_count': usage_count},
                ))
                if result.success:
                    stats['created'] += 1
                else:
                    stats['skipped'] += 1

        return stats
