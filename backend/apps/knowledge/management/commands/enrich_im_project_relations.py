"""
enrich_im_project_relations — IM 项目图谱深度富化

在 build_im_project_graph 基础上进一步：
1. 将 im_project_group 条目关联到对应的 project_profile 条目
2. 从 IM 内容提取里程碑信号（PI确认/机构质控/客户反馈/报告修改等）
3. 构建人员跨项目协作统计（同时参与多个项目的人员）
4. 为每个项目生成"IM协作全景"摘要，更新到 project_profile 的 tags/summary

用法：
  python manage.py enrich_im_project_relations
  python manage.py enrich_im_project_relations --dry-run
  python manage.py enrich_im_project_relations --update-profiles  # 更新 project_profile
"""
import re
import logging
from collections import defaultdict
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)

# 里程碑信号关键词 → 里程碑名称
MILESTONE_SIGNALS = [
    (re.compile(r'PI.{0,6}(确认|签字|批准|同意|审核)', re.I), '里程碑:PI审核'),
    (re.compile(r'机构质控|质控安排|机构审核|伦理', re.I), '里程碑:机构质控'),
    (re.compile(r'客户.{0,8}(反馈|确认|意见|签字)', re.I), '里程碑:客户确认'),
    (re.compile(r'报告.{0,6}(完成|提交|发送|交付)', re.I), '里程碑:报告交付'),
    (re.compile(r'(EDC|数据系统).{0,8}(上线|配置完|测试完|完成)', re.I), '里程碑:EDC上线'),
    (re.compile(r'受试者.{0,6}(入组完|招募完|筛选完)', re.I), '里程碑:入组完成'),
    (re.compile(r'(数据|采样).{0,6}(采集完|完成|汇总)', re.I), '里程碑:数据采集完成'),
    (re.compile(r'合同.{0,6}(签署|盖章|生效|确认)', re.I), '里程碑:合同签署'),
    (re.compile(r'(启动会|SIV|kick.?off)', re.I), '里程碑:项目启动'),
    (re.compile(r'(归档|关闭|结题|结束)', re.I), '里程碑:项目关闭'),
]

PROJECT_RE = re.compile(
    r'\b([MCWASRO][0-9]{5,}|SPF[0-9]{4,}|LS[0-9]{4,}|C2[0-9]{6,})\b'
)


class Command(BaseCommand):
    help = 'IM 项目图谱深度富化：关联 project_profile、提取里程碑、构建协作统计'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--update-profiles', action='store_true',
                            help='将 IM 协作摘要写入 project_profile 的 tags')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        update_profiles = options['update_profiles']

        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry, KnowledgeRelation
        from apps.identity.models import Account
        from django.db.models import Count

        self.stdout.write('\n[1] 构建账户映射...')
        open_id_map = {
            a.feishu_open_id: (a.display_name or a.username)
            for a in Account.objects.filter(is_deleted=False).exclude(feishu_open_id='')
        }
        self.stdout.write(f'  已知账户: {len(open_id_map)}')

        # ── Step 1: 关联 im_project_group → project_profile ──────────────────
        self.stdout.write('\n[2] 关联 IM群摘要 → project_profile...')
        im_entries = KnowledgeEntry.objects.filter(source_type='im_project_group')
        linked = 0
        for im_entry in im_entries:
            # 从 namespace 提取项目编号
            proj_no = (im_entry.namespace or '').replace('project:', '').strip()
            if not proj_no:
                continue
            # 查找对应的 project_profile
            profile = KnowledgeEntry.objects.filter(
                source_type='project_profile',
                title__icontains=proj_no
            ).first()
            if not profile:
                continue
            # 将项目画像关键信息追加到 IM 群摘要条目
            if not dry_run:
                profile_snippet = (profile.content or '')[:300]
                separator = '\n\n[关联项目画像]\n'
                new_content = ((im_entry.content or '') + separator + profile_snippet)[:2000]
                KnowledgeEntry.objects.filter(id=im_entry.id).update(content=new_content)
            linked += 1
        self.stdout.write(f'  关联成功: {linked} 对 (im_group → project_profile)')

        # ── Step 2: 提取里程碑信号 ─────────────────────────────────────────
        self.stdout.write('\n[3] 从 IM 内容提取里程碑信号...')

        milestone_stats = defaultdict(int)
        project_milestones = defaultdict(set)  # proj_no → {milestone,...}
        person_milestones = defaultdict(lambda: defaultdict(set))  # person→proj→milestone

        # 按项目群扫描（只扫 text 类型，500条上限保证效率）
        all_groups = PersonalContext.objects.filter(
            source_type='im'
        ).exclude(metadata__chat_name=None).values(
            'metadata__chat_id', 'metadata__chat_name'
        ).annotate(cnt=Count('id')).order_by('-cnt')

        for g in all_groups:
            name = g['metadata__chat_name'] or ''
            proj_matches = PROJECT_RE.findall(name)
            if not proj_matches:
                continue
            proj_no = proj_matches[0]
            chat_id = g['metadata__chat_id']

            # 获取 text 消息
            msgs = PersonalContext.objects.filter(
                source_type='im',
                metadata__chat_id=chat_id,
                metadata__msg_type='text',
            ).values('metadata__sender_id', 'raw_content')[:300]

            for msg in msgs:
                content = msg['raw_content'] or ''
                sender_id = msg['metadata__sender_id'] or ''

                for pattern, milestone in MILESTONE_SIGNALS:
                    if pattern.search(content):
                        project_milestones[proj_no].add(milestone)
                        milestone_stats[milestone] += 1
                        if sender_id in open_id_map:
                            person_name = open_id_map[sender_id]
                            person_milestones[person_name][proj_no].add(milestone)

        self.stdout.write('  发现里程碑信号:')
        for m, cnt in sorted(milestone_stats.items(), key=lambda x: -x[1]):
            self.stdout.write(f'    {m:<25s}: {cnt} 次提及')

        covered_projects = len(project_milestones)
        self.stdout.write(f'  覆盖项目数: {covered_projects}')

        # ── Step 3: 将里程碑写入 im_project_group entries ──────────────────
        self.stdout.write('\n[4] 更新 IM 群摘要条目（补充里程碑信息）...')
        updated_entries = 0
        for im_entry in KnowledgeEntry.objects.filter(source_type='im_project_group'):
            proj_no = (im_entry.namespace or '').replace('project:', '').strip()
            milestones = project_milestones.get(proj_no, set())
            if not milestones:
                continue
            milestone_str = '、'.join(sorted(milestones))
            new_summary = (im_entry.summary or '') + f'\n里程碑信号：{milestone_str}'
            if not dry_run:
                KnowledgeEntry.objects.filter(id=im_entry.id).update(
                    summary=new_summary[:500]
                )
            updated_entries += 1
        self.stdout.write(f'  更新条目: {updated_entries}')

        # ── Step 4: 跨项目协作统计 ───────────────────────────────────────────
        self.stdout.write('\n[5] 跨项目协作统计...')
        # 统计每个人参与的项目数
        person_project_count = {}
        for rel in KnowledgeRelation.objects.filter(
            relation_type='involved_in',
            source__startswith='im_graph:',
        ).select_related('subject', 'object'):
            person_label = rel.subject.label if rel.subject else '?'
            proj_label = rel.object.label if rel.object else '?'
            if person_label not in person_project_count:
                person_project_count[person_label] = set()
            person_project_count[person_label].add(proj_label)

        # 找跨项目人员（参与3+项目）
        cross_project_persons = [
            (name, projects)
            for name, projects in person_project_count.items()
            if len(projects) >= 3
        ]
        cross_project_persons.sort(key=lambda x: -len(x[1]))

        self.stdout.write(f'  参与3+项目的人员: {len(cross_project_persons)}')
        self.stdout.write('  Top 10 跨项目参与者:')
        for name, projects in cross_project_persons[:10]:
            self.stdout.write(f'    {name:<15s}: {len(projects)} 个项目')

        # ── Step 5: 可选更新 project_profile ─────────────────────────────────
        if update_profiles and not dry_run:
            self.stdout.write('\n[6] 更新 project_profile（添加 IM 协作标签）...')
            updated_profiles = 0
            for proj_no, milestones in project_milestones.items():
                profile = KnowledgeEntry.objects.filter(
                    source_type='project_profile',
                    title__icontains=proj_no,
                ).first()
                if not profile:
                    continue
                # 将里程碑信号追加到 tags
                existing_tags = profile.tags or []
                new_tags = list(set(existing_tags) | set(milestones))
                KnowledgeEntry.objects.filter(id=profile.id).update(tags=new_tags)
                updated_profiles += 1
            self.stdout.write(f'  更新 project_profile: {updated_profiles} 条')

        # ── 最终汇总 ─────────────────────────────────────────────────────────
        from apps.knowledge.models import KnowledgeRelation
        total_rels = KnowledgeRelation.objects.count()
        self.stdout.write(f'\n{"="*65}')
        self.stdout.write('  IM 图谱富化完成')
        self.stdout.write(f'{"="*65}')
        self.stdout.write(f'  IM群→项目关联: {linked} 对')
        self.stdout.write(f'  里程碑覆盖项目: {covered_projects}')
        self.stdout.write(f'  跨项目关键人员: {len(cross_project_persons)}')
        self.stdout.write(f'  KnowledgeRelation 总计: {total_rels}')
        self.stdout.write(f'{"="*65}\n')
