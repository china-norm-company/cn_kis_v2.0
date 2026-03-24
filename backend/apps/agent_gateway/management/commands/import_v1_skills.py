"""
从 V1.0 openclaw-skills 批量导入 Skills 到 t_agent_definition

读取 V1.0 openclaw-skills/ 目录下的所有 SKILL.md 文件，
解析 Purpose、Trigger、Model 等字段，批量注册为 AgentDefinition。

使用方式：
  # 从指定路径导入（默认从同目录父级查找）
  python manage.py import_v1_skills

  # 指定 skills 目录
  python manage.py import_v1_skills --skills-dir=/path/to/CN_KIS_V1.0/openclaw-skills

  # 预览（不写入）
  python manage.py import_v1_skills --dry-run

  # 更新已存在的 skills（默认跳过已有的）
  python manage.py import_v1_skills --update-existing
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from django.core.management.base import BaseCommand


# 29 个 openclaw-skills 的手工补充元数据（SKILL.md 解析不到的字段）
SKILL_METADATA: dict[str, dict] = {
    'audit-trail-engine': {
        'name': '审计链引擎',
        'role_title': '审计链引擎',
        'tier': 'engine',
        'capabilities': ['操作追踪', '变更记录', '合规审计日志生成'],
        'model_preference': 'kimi',
    },
    'auto-quotation': {
        'name': '自动报价助手',
        'role_title': '自动报价专员',
        'tier': 'agent',
        'capabilities': ['研究方案成本估算', '报价单生成', '历史报价参考'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'business-dashboard': {
        'name': '业务看板生成员',
        'role_title': '业务看板生成员',
        'tier': 'agent',
        'capabilities': ['KPI 汇总', '业务数据可视化', '经营日报生成'],
        'model_preference': 'kimi',
    },
    'competitive-analysis': {
        'name': '竞品分析专员',
        'role_title': '竞品分析专员',
        'tier': 'agent',
        'capabilities': ['竞争对手深度分析', '市场定位评估', '差异化策略建议'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'crf-validator': {
        'name': 'CRF 数据校验员',
        'role_title': 'CRF 数据校验员',
        'tier': 'agent',
        'capabilities': ['CRF 数据质量检查', '入排标准校验', '数据完整性核查'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'customer-success-manager': {
        'name': '客户成功经理',
        'role_title': '客户成功经理',
        'tier': 'digital_human',
        'capabilities': ['客户健康评分', '流失风险预测', '扩张机会识别'],
        'model_preference': 'kimi',
    },
    'daily-report': {
        'name': '日报生成员',
        'role_title': '日报生成员',
        'tier': 'agent',
        'capabilities': ['项目日报汇总', '异常事项提醒', '当日任务整理'],
        'model_preference': 'kimi',
    },
    'efficacy-report-generator': {
        'name': '功效报告生成员',
        'role_title': '功效报告生成员',
        'tier': 'agent',
        'capabilities': ['功效数据分析', '统计结果解读', '研究报告自动撰写'],
        'model_preference': 'ark',
        'knowledge_enabled': True,
        'knowledge_top_k': 5,
    },
    'equipment-lifecycle': {
        'name': '仪器生命周期管理员',
        'role_title': '仪器生命周期管理员',
        'tier': 'agent',
        'capabilities': ['校准提醒', '维护计划', '设备使用状态追踪'],
        'model_preference': 'kimi',
    },
    'feishu-notification-hub': {
        'name': '飞书通知中枢',
        'role_title': '飞书通知中枢',
        'tier': 'engine',
        'capabilities': ['多渠道飞书消息推送', '消息模板管理', '通知优先级调度'],
        'model_preference': 'kimi',
    },
    'finance-automation': {
        'name': '财务自动化助手',
        'role_title': '财务自动化助手',
        'tier': 'agent',
        'capabilities': ['费用报销审核', '发票处理', '预算对比分析'],
        'model_preference': 'kimi',
    },
    'hr-self-service': {
        'name': 'HR 自助服务助手',
        'role_title': 'HR 自助服务助手',
        'tier': 'digital_human',
        'capabilities': ['假期申请处理', '入职材料指引', '人事政策查询'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'instrument-data-collector': {
        'name': '仪器数据采集员',
        'role_title': '仪器数据采集员',
        'tier': 'agent',
        'capabilities': ['仪器数据结构化提取', '测量值校验', '数据入库'],
        'model_preference': 'kimi',
    },
    'knowledge-hybrid-search': {
        'name': '知识混合检索引擎',
        'role_title': '知识检索专员',
        'tier': 'engine',
        'capabilities': ['向量语义检索', '知识图谱遍历', '关键词检索', 'RRF融合排序'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
        'knowledge_top_k': 10,
    },
    'market-research': {
        'name': '市场研究员',
        'role_title': '市场研究员',
        'tier': 'agent',
        'capabilities': ['市场规模估算', '竞争格局分析', '机会验证'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'meeting-prep': {
        'name': '会议准备助手',
        'role_title': '会议准备助手',
        'tier': 'digital_human',
        'capabilities': ['会议议程生成', '背景资料整理', '参会者信息收集'],
        'model_preference': 'kimi',
    },
    'morning-email-rollup': {
        'name': '早间邮件汇总员',
        'role_title': '早间邮件汇总员',
        'tier': 'agent',
        'capabilities': ['邮件优先级排序', 'AI 摘要生成', '日历事件汇总'],
        'model_preference': 'kimi',
    },
    'multi-domain-alert': {
        'name': '多域预警员',
        'role_title': '多域预警员',
        'tier': 'engine',
        'capabilities': ['跨系统异常检测', '分级预警推送', '问题根因分析'],
        'model_preference': 'kimi',
    },
    'protocol-parser': {
        'name': '方案解析专员',
        'role_title': '方案解析专员',
        'tier': 'agent',
        'capabilities': ['研究方案结构化解析', '访视计划提取', '统计方法识别'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'protocol-to-startup-pack': {
        'name': '方案启动包生成员',
        'role_title': '方案启动包生成员',
        'tier': 'agent',
        'capabilities': ['从方案生成启动材料包', '受试者信息表', 'CRF 模板建议'],
        'model_preference': 'ark',
        'knowledge_enabled': True,
    },
    'reception-automation': {
        'name': '前台接待自动化员',
        'role_title': '前台接待自动化员',
        'tier': 'digital_human',
        'capabilities': ['预约管理', '签到引导', '等候区状态播报'],
        'model_preference': 'kimi',
    },
    'recruitment-screener': {
        'name': '受试者招募筛选员',
        'role_title': '受试者招募筛选员',
        'tier': 'agent',
        'capabilities': ['入排标准自动核查', '候选人评分', '初筛问卷分析'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'research-paper-kb': {
        'name': '论文知识库管理员',
        'role_title': '论文知识库管理员',
        'tier': 'engine',
        'capabilities': ['arXiv/DOI 论文摘要提取', 'BibTeX 生成', '跨会话持久化知识库'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'secretary-orchestrator': {
        'name': '秘书编排中枢',
        'role_title': '秘书编排员',
        'tier': 'orchestration',
        'capabilities': ['多 Agent 任务编排', '邮件-任务映射', '跨部门协调'],
        'model_preference': 'ark',
    },
    'shift-planner': {
        'name': '智能排班计划员',
        'role_title': '排班计划员',
        'tier': 'agent',
        'capabilities': ['研究人员排班生成', '节假日优化', '受试者窗口期排程'],
        'model_preference': 'kimi',
    },
    'sop-lifecycle': {
        'name': 'SOP 生命周期管理员',
        'role_title': 'SOP 生命周期管理员',
        'tier': 'agent',
        'capabilities': ['SOP 版本控制', '过期提醒', '变更影响分析'],
        'model_preference': 'kimi',
        'knowledge_enabled': True,
    },
    'visit-scheduler': {
        'name': '访视排程员',
        'role_title': '访视排程员',
        'tier': 'agent',
        'capabilities': ['访视时间窗口计算', '受试者排程优化', '冲突检测'],
        'model_preference': 'kimi',
    },
    'workorder-automation': {
        'name': '工单自动化处理员',
        'role_title': '工单自动化处理员',
        'tier': 'agent',
        'capabilities': ['工单分类分配', '优先级评估', '处理进度追踪'],
        'model_preference': 'kimi',
    },
}

MODEL_MAP = {
    'kimi': 'moonshot-v1-128k',
    'ark': 'ep-20250122113648-8kmg8',
    'openai': 'gpt-4o',
}

PROVIDER_MAP = {
    'kimi': 'kimi',
    'ark': 'ark',
    'openai': 'openai',
}


def _parse_skill_md(skill_dir: Path) -> dict | None:
    """解析 SKILL.md，提取 Purpose、Trigger、描述等字段。"""
    skill_md = skill_dir / 'SKILL.md'
    if not skill_md.exists():
        return None

    content = skill_md.read_text(encoding='utf-8', errors='ignore')

    # 提取标题
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    name = title_match.group(1).strip() if title_match else skill_dir.name

    # 提取 Purpose（## Purpose 后的第一段）
    purpose_match = re.search(r'##\s+Purpose\s*\n(.*?)(?=\n##|\Z)', content, re.DOTALL)
    description = purpose_match.group(1).strip() if purpose_match else ''
    # 清理 markdown 格式，取前 500 字符
    description = re.sub(r'```.*?```', '', description, flags=re.DOTALL).strip()[:500]

    # 提取 Trigger
    trigger_match = re.search(r'##\s+Trigger\s*\n(.*?)(?=\n##|\Z)', content, re.DOTALL)
    trigger = trigger_match.group(1).strip()[:500] if trigger_match else ''

    # 提取 Model to Use
    model_match = re.search(r'##\s+Model\s+to\s+Use\s*\n\*\*(\w+)\*\*', content, re.IGNORECASE)
    model_pref = model_match.group(1).lower() if model_match else 'kimi'

    return {
        'name': name,
        'description': description,
        'trigger': trigger,
        'model_preference': model_pref,
    }


class Command(BaseCommand):
    help = '从 V1.0 openclaw-skills 批量注册 Skills 到 t_agent_definition'

    def add_arguments(self, parser):
        parser.add_argument(
            '--skills-dir',
            default='',
            help='openclaw-skills 目录路径（默认自动查找 V1.0 仓库）',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='预览，不实际写入',
        )
        parser.add_argument(
            '--update-existing',
            action='store_true',
            default=False,
            help='更新已存在的 skill（默认跳过）',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        update_existing = options['update_existing']
        skills_dir_path = options['skills_dir']

        if skills_dir_path:
            skills_dir = Path(skills_dir_path)
        else:
            # 默认查找路径
            candidates = [
                Path.home() / 'Cursor' / 'CN_KIS_V1.0' / 'openclaw-skills',
                Path.home() / 'Cursor' / 'CN_KIS_V1.0_pr_lifecycle' / 'openclaw-skills',
            ]
            skills_dir = next((p for p in candidates if p.exists()), None)
            if not skills_dir:
                self.stderr.write(self.style.ERROR(
                    'openclaw-skills 目录不存在。请用 --skills-dir 参数指定路径。'
                ))
                return

        if not skills_dir.exists():
            self.stderr.write(self.style.ERROR(f'目录不存在：{skills_dir}'))
            return

        self.stdout.write(self.style.HTTP_INFO(f'扫描 Skills 目录：{skills_dir}'))

        skill_dirs = [d for d in skills_dir.iterdir() if d.is_dir() and not d.name.startswith('.')]
        self.stdout.write(f'发现 {len(skill_dirs)} 个 skill 目录')

        from apps.agent_gateway.models import AgentDefinition

        stats = {'created': 0, 'updated': 0, 'skipped': 0, 'errors': 0}

        for skill_dir in sorted(skill_dirs):
            skill_id = skill_dir.name
            parsed = _parse_skill_md(skill_dir)
            if not parsed:
                self.stdout.write(self.style.WARNING(f'  [跳过] {skill_id}：无 SKILL.md'))
                stats['skipped'] += 1
                continue

            meta = SKILL_METADATA.get(skill_id, {})
            model_pref = meta.get('model_preference', parsed.get('model_preference', 'kimi'))

            agent_data = {
                'name': meta.get('name', parsed['name']) or skill_id,
                'description': parsed['description'],
                'role_title': meta.get('role_title', ''),
                'tier': meta.get('tier', 'agent'),
                'capabilities': meta.get('capabilities', []),
                'provider': PROVIDER_MAP.get(model_pref, 'kimi'),
                'model_id': MODEL_MAP.get(model_pref, ''),
                'knowledge_enabled': meta.get('knowledge_enabled', False),
                'knowledge_top_k': meta.get('knowledge_top_k', 3),
                'is_active': True,
                'phase': 'v1_skill',
                'system_prompt': (
                    f'你是 CN KIS 系统的专业智能体：{meta.get("role_title", skill_id)}。\n\n'
                    f'能力边界：{parsed["description"][:200]}'
                ),
                'boundaries': [f'仅执行 {skill_id} 相关任务，超出范围升级给 secretary-orchestrator'],
            }

            existing = AgentDefinition.objects.filter(agent_id=skill_id).first()

            if existing:
                if not update_existing:
                    self.stdout.write(f'  [跳过] {skill_id}：已存在（使用 --update-existing 强制更新）')
                    stats['skipped'] += 1
                    continue
                if not dry_run:
                    for k, v in agent_data.items():
                        setattr(existing, k, v)
                    existing.save()
                self.stdout.write(f'  [更新] {skill_id}：{agent_data["name"]}')
                stats['updated'] += 1
            else:
                if not dry_run:
                    try:
                        AgentDefinition.objects.create(agent_id=skill_id, **agent_data)
                        stats['created'] += 1
                    except Exception as exc:
                        self.stderr.write(f'  [错误] {skill_id}：{exc}')
                        stats['errors'] += 1
                        continue
                else:
                    stats['created'] += 1
                self.stdout.write(
                    f'  [{"DRY-RUN " if dry_run else ""}创建] {skill_id}：{agent_data["name"]} '
                    f'[{agent_data["tier"]}]'
                )

        mode = '[DRY-RUN] ' if dry_run else ''
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'{mode}完成：创建={stats["created"]} 更新={stats["updated"]} '
            f'跳过={stats["skipped"]} 错误={stats["errors"]}'
        ))
