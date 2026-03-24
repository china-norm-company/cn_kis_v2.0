"""
CN KIS 智能运营早晚报 Celery 任务

早报（09:00）：采集全域指标 → LLM 生成总经理批注 → 推送到开发小组群
晚报（18:00）：同上 + 工作台推广面板 + 明日行动建议

数据来源：
  - GitHub API（PR/Issue/提交，通过 HTTP 调用）
  - Django DB（用户活跃、业务数据、反馈汇总）
  - 系统指标（磁盘、Celery 状态）
  - 飞书用户反馈（UserFeedback 模型）
"""
import logging
import os
from datetime import datetime, timedelta, timezone

from celery import shared_task

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# 主任务入口
# ══════════════════════════════════════════════════════════════════════════════

@shared_task(name='apps.secretary.tasks.send_morning_briefing', bind=True, max_retries=2)
def send_morning_briefing(self):
    """每日 09:00 早报：采集指标 → LLM 分析 → 推送飞书群"""
    try:
        _run_briefing('morning')
    except Exception as exc:
        logger.error('早报任务失败: %s', exc, exc_info=True)
        raise self.retry(exc=exc, countdown=300)


@shared_task(name='apps.secretary.tasks.send_evening_briefing', bind=True, max_retries=2)
def send_evening_briefing(self):
    """每日 18:00 晚报：采集指标 → LLM 分析 → 推送飞书群"""
    try:
        _run_briefing('evening')
    except Exception as exc:
        logger.error('晚报任务失败: %s', exc, exc_info=True)
        raise self.retry(exc=exc, countdown=300)


@shared_task(name='apps.secretary.tasks.send_weekly_briefing', bind=True, max_retries=1)
def send_weekly_briefing(self):
    """每周一 08:30 周报"""
    try:
        _run_briefing('weekly')
    except Exception as exc:
        logger.error('周报任务失败: %s', exc, exc_info=True)
        raise self.retry(exc=exc, countdown=600)


@shared_task(name='apps.secretary.tasks.process_user_feedback_async')
def process_user_feedback_async(message_id: str, sender_open_id: str, sender_name: str, text: str):
    """异步处理用户反馈群消息"""
    from .feedback_service import process_feedback_message
    return process_feedback_message(message_id, sender_open_id, sender_name, text)


# ══════════════════════════════════════════════════════════════════════════════
# 数据采集层
# ══════════════════════════════════════════════════════════════════════════════

def _collect_all_metrics(brief_type: str) -> dict:
    """采集全域运营指标，汇总为结构化字典供 LLM 分析。"""
    metrics = {
        'brief_type': brief_type,
        'date': datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d'),
        'weekday': '一二三四五六日'[datetime.now(timezone(timedelta(hours=8))).weekday()],
    }

    # 各模块数据采集（每个都有独立 try/except，单个失败不影响全局）
    metrics['users']      = _collect_user_metrics()
    metrics['business']   = _collect_business_metrics()
    metrics['feedback']   = _collect_feedback_metrics()
    metrics['system']     = _collect_system_metrics()
    metrics['workstations'] = _collect_workstation_status()

    return metrics


def _collect_user_metrics() -> dict:
    """采集用户活跃度指标"""
    result = {
        'dau_total': 0, 'dau_by_workstation': {},
        'new_users_24h': 0, 'zero_login_users': 0,
        'avg_session_min': {},
    }
    try:
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()
        yesterday = now - timedelta(hours=24)
        week_ago = now - timedelta(days=7)

        Account = get_user_model()
        # 注意：日活数据来源取决于实际的 session/login log 模型
        # 这里先用 Account 模型的 last_login 字段做近似
        result['dau_total'] = Account.objects.filter(
            last_login__gte=yesterday, is_active=True
        ).count()
        result['new_users_24h'] = Account.objects.filter(
            date_joined__gte=yesterday
        ).count()
        result['zero_login_users'] = Account.objects.filter(
            last_login__isnull=True, is_active=True
        ).count()

        # 7 天无登录（推广盲区）
        result['no_login_7d'] = Account.objects.filter(
            is_active=True
        ).exclude(last_login__gte=week_ago).count()

    except Exception as e:
        logger.warning('用户指标采集失败: %s', e)
    return result


def _collect_business_metrics() -> dict:
    """采集核心业务数据量（判断各工作台是否有实际数据录入）"""
    result = {}
    now_utc = datetime.now(timezone.utc)
    yesterday = now_utc - timedelta(hours=24)

    _safe_count = lambda model, **filters: _try_count(model, **filters)

    # 受试者
    try:
        from apps.subject.models import Subject
        result['subjects_total']  = _safe_count(Subject)
        result['subjects_new_24h'] = _safe_count(Subject, created_at__gte=yesterday)
    except Exception: pass

    # 协议/方案
    try:
        from apps.protocol.models import Protocol
        result['protocols_total'] = _safe_count(Protocol)
        result['protocols_new_24h'] = _safe_count(Protocol, created_at__gte=yesterday)
    except Exception: pass

    # 偏差（质量台核心指标）
    try:
        from apps.quality.models import Deviation, CAPA
        result['deviations_open']    = _safe_count(Deviation, status__in=['open', 'investigating'])
        result['deviations_new_24h'] = _safe_count(Deviation, create_time__gte=yesterday)
        result['capas_overdue']      = _safe_count(CAPA, status='overdue')
    except Exception: pass

    # 工单
    try:
        from apps.workorder.models import WorkOrder
        result['workorders_new_24h']    = _safe_count(WorkOrder, create_time__gte=yesterday, is_deleted=False)
        result['workorders_open']       = _safe_count(WorkOrder, status__in=['pending', 'in_progress'], is_deleted=False)
        result['workorders_completed_24h'] = _safe_count(WorkOrder, status__in=['completed', 'approved'], update_time__gte=yesterday, is_deleted=False)
    except Exception: pass

    # 物料
    try:
        from apps.resource.models import Material
        from django.utils import timezone as tz
        week_later = tz.now().date() + timedelta(days=7)
        result['materials_expiring_7d'] = Material.objects.filter(
            expiry_date__lte=week_later, expiry_date__gte=tz.now().date()
        ).count() if hasattr(Material, 'expiry_date') else 0
    except Exception: pass

    # 设备校准
    try:
        from apps.resource.models import Instrument
        from django.utils import timezone as tz
        result['equipment_calib_overdue'] = Instrument.objects.filter(
            next_calibration_date__lt=tz.now().date()
        ).count() if hasattr(Instrument, 'next_calibration_date') else 0
    except Exception: pass

    return result


def _collect_feedback_metrics() -> dict:
    """采集用户反馈汇总"""
    try:
        from .feedback_service import get_feedback_summary_for_report
        return get_feedback_summary_for_report(hours=24)
    except Exception as e:
        logger.warning('反馈指标采集失败: %s', e)
        return {'total': 0, 'bugs': 0, 'features': 0, 'questions': 0, 'unresolved': 0, 'recent_items': []}


def _collect_system_metrics() -> dict:
    """采集系统健康指标（磁盘、Celery、Redis）"""
    result = {}
    try:
        import shutil
        total, used, free = shutil.disk_usage('/')
        result['disk_usage_pct'] = round(used / total * 100, 1)
        result['disk_free_gb']   = round(free / 1e9, 1)
    except Exception: pass

    try:
        from celery.app.control import Control
        from celery_app import app as celery_app
        ctrl = Control(celery_app)
        stats = ctrl.inspect(timeout=3).stats() or {}
        result['celery_workers'] = len(stats)
    except Exception:
        result['celery_workers'] = -1  # 未知

    try:
        import redis
        r = redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
        info = r.info()
        result['redis_memory_mb'] = round(info.get('used_memory', 0) / 1e6, 1)
        result['redis_clients']   = info.get('connected_clients', 0)
    except Exception: pass

    return result


def _collect_workstation_status() -> list:
    """
    评估各工作台上线状态：
    - 是否有数据（核心表是否有记录）
    - 是否有活跃用户（7 天内是否有人登录）
    - 上线天数（按系统首次部署日推算）
    """
    # 硬编码工作台列表（来自 workstations.yaml）
    ws_list = [
        {'key': 'secretary',      'name': '子衿·秘书台',   'priority': 'core'},
        {'key': 'research',       'name': '采苓·研究台',   'priority': 'core'},
        {'key': 'execution',      'name': '维周·执行台',   'priority': 'core'},
        {'key': 'quality',        'name': '怀瑾·质量台',   'priority': 'core'},
        {'key': 'recruitment',    'name': '招招·招募台',   'priority': 'core'},
        {'key': 'lab-personnel',  'name': '共济·人员台',   'priority': 'high'},
        {'key': 'finance',        'name': '管仲·财务台',   'priority': 'high'},
        {'key': 'ethics',         'name': '御史·伦理台',   'priority': 'high'},
        {'key': 'equipment',      'name': '器衡·设备台',   'priority': 'medium'},
        {'key': 'material',       'name': '度支·物料台',   'priority': 'medium'},
        {'key': 'facility',       'name': '坤元·设施台',   'priority': 'medium'},
        {'key': 'evaluator',      'name': '衡技·评估台',   'priority': 'medium'},
        {'key': 'hr',             'name': '时雨·人事台',   'priority': 'medium'},
        {'key': 'crm',            'name': '进思·客户台',   'priority': 'medium'},
        {'key': 'reception',      'name': '和序·接待台',   'priority': 'medium'},
    ]

    # 简化版：依赖 Account.last_login 的 workstation 字段（如果有）
    # 后续可接入更精细的 PageView 埋点
    for ws in ws_list:
        ws['online_days']    = _estimate_online_days()
        ws['has_data']       = _check_workstation_has_data(ws['key'])
        ws['active_users_7d'] = _check_workstation_active_users(ws['key'])
        # 推广状态
        if not ws['has_data']:
            ws['status'] = 'inactive'   # 红：无数据
        elif ws['active_users_7d'] == 0:
            ws['status'] = 'data_only'  # 橙：有数据无用户
        elif ws['active_users_7d'] < 2:
            ws['status'] = 'minimal'    # 黄：仅 1 人
        else:
            ws['status'] = 'active'     # 绿：正常推广中

    return ws_list


def _estimate_online_days() -> int:
    """估算系统上线天数（基于最早的 Account 创建时间）"""
    try:
        from django.contrib.auth import get_user_model
        Account = get_user_model()
        first = Account.objects.order_by('date_joined').first()
        if first:
            return (datetime.now(timezone.utc) - first.date_joined.replace(tzinfo=timezone.utc)).days
    except Exception: pass
    return 0


def _check_workstation_has_data(ws_key: str) -> bool:
    """粗判断工作台是否有数据（按工作台映射检查对应核心表）"""
    check_map = {
        'quality':       ('apps.quality.models', 'Deviation'),
        'research':      ('apps.protocol.models', 'Protocol'),
        'recruitment':   ('apps.subject.models', 'Subject'),
        'execution':     ('apps.workorder.models', 'WorkOrder'),
        'finance':       ('apps.finance.models', 'Contract'),
        'lab-personnel': ('apps.lab_personnel.models', 'LabStaffProfile'),
        'hr':            ('apps.hr.models', 'Staff'),
        'crm':           ('apps.crm.models', 'Client'),
        'ethics':        ('apps.ethics.models', 'EthicsApplication'),
        'equipment':     ('apps.resource.models', 'Instrument'),
        'material':      ('apps.resource.models', 'Material'),
    }
    if ws_key not in check_map:
        return True  # 无法判断的默认视为有数据
    module_path, model_name = check_map[ws_key]
    return _try_count_by_path(module_path, model_name) > 0


def _check_workstation_active_users(ws_key: str) -> int:
    """检查工作台 7 天内活跃用户数（近似：登录过且 role 匹配）"""
    # 简化版：如果有 workstation 字段则用，否则返回 -1（未知）
    try:
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        Account = get_user_model()
        week_ago = timezone.now() - timedelta(days=7)
        # 尝试按 workstation 字段过滤（如果 Account 有该字段）
        if hasattr(Account, 'workstation'):
            return Account.objects.filter(
                last_login__gte=week_ago, workstation=ws_key, is_active=True
            ).count()
        # 降级：返回 -1（无法判断，晚报不展示该指标）
        return -1
    except Exception:
        return -1


def _try_count(model_class, **filters) -> int:
    try:
        return model_class.objects.filter(**filters).count()
    except Exception:
        return 0


def _try_count_by_path(module_path: str, model_name: str) -> int:
    try:
        import importlib
        module = importlib.import_module(module_path)
        model = getattr(module, model_name)
        return model.objects.count()
    except Exception:
        return 0


# ══════════════════════════════════════════════════════════════════════════════
# LLM 分析层
# ══════════════════════════════════════════════════════════════════════════════

def _generate_llm_insight(metrics: dict, brief_type: str) -> str:
    """调用 Qwen 生成总经理视角的分析摘要。失败时降级为规则文本。"""
    try:
        from apps.agent_gateway.services import quick_chat

        if brief_type == 'morning':
            prompt = _build_morning_prompt(metrics)
        elif brief_type == 'evening':
            prompt = _build_evening_prompt(metrics)
        else:
            prompt = _build_weekly_prompt(metrics)

        result = quick_chat(prompt, max_tokens=400)
        if result and len(result.strip()) > 20:
            return result.strip()
    except Exception as e:
        logger.warning('LLM 分析失败，降级为规则摘要: %s', e)

    return _fallback_insight(metrics, brief_type)


def _build_morning_prompt(m: dict) -> str:
    biz = m.get('business', {})
    users = m.get('users', {})
    feedback = m.get('feedback', {})
    system = m.get('system', {})
    ws_list = m.get('workstations', [])

    inactive_ws = [ws['name'] for ws in ws_list if ws['status'] == 'inactive']
    active_ws   = [ws['name'] for ws in ws_list if ws['status'] == 'active']

    return f"""你是 CN KIS 系统的智能运营总经理助理。请根据以下数据生成今日开工早报的"总经理批注"板块。

【系统数据（北京时间昨日）】
- 昨日活跃用户：{users.get('dau_total', '未知')} 人
- 昨日新增数据：受试者 +{biz.get('subjects_new_24h', 0)}，工单 +{biz.get('workorders_new_24h', 0)}，偏差 +{biz.get('deviations_new_24h', 0)}
- 质量台开放偏差：{biz.get('deviations_open', 0)} 条，逾期 CAPA：{biz.get('capas_overdue', 0)} 条
- 磁盘使用率：{system.get('disk_usage_pct', '未知')}%
- 用户反馈（昨日）：总计 {feedback.get('total', 0)} 条，Bug {feedback.get('bugs', 0)} 个，未处理 {feedback.get('unresolved', 0)} 个
- 活跃推广中工作台：{', '.join(active_ws) or '无'}
- 零数据工作台（推广停滞）：{', '.join(inactive_ws) or '无'}
- 未曾登录用户数：{users.get('zero_login_users', 0)} 人

【你的任务】
用2-3段话写"总经理批注"，要求：
1. 第一句给出整体状态判断（好/需关注/告警），说明理由
2. 识别今日 TOP2-3 需要推进的事项，必须点出具体工作台或人员（用"需要推进"而不是"建议"）
3. 如果质量台/伦理台等核心合规工作台长期零数据，要明确点出并提升紧迫感
4. 语气：直接、专业、有行动力，像总经理写备忘录，不要用"数据显示"等机器感词汇
5. 字数控制在 150 字以内"""


def _build_evening_prompt(m: dict) -> str:
    biz = m.get('business', {})
    users = m.get('users', {})
    feedback = m.get('feedback', {})
    ws_list = m.get('workstations', [])

    inactive_count = sum(1 for ws in ws_list if ws['status'] == 'inactive')
    active_count   = sum(1 for ws in ws_list if ws['status'] == 'active')

    return f"""你是 CN KIS 系统的智能运营总经理助理。请根据以下今日数据生成收工晚报的"总经理复盘"板块。

【今日数据】
- 今日活跃用户：{users.get('dau_total', '未知')} 人
- 今日新增：受试者 +{biz.get('subjects_new_24h', 0)}，工单 +{biz.get('workorders_new_24h', 0)}，偏差 +{biz.get('deviations_new_24h', 0)}
- 工单完成：{biz.get('workorders_completed_24h', 0)} 个，剩余开放 {biz.get('workorders_open', 0)} 个
- 用户反馈：今日 {feedback.get('total', 0)} 条，未处理 {feedback.get('unresolved', 0)} 条
- 当前活跃推广工作台：{active_count} 个，停滞工作台：{inactive_count} 个

【你的任务】
写"今日复盘"和"明日建议"，要求：
1. 1-2句话概括今日整体（进展/问题）
2. 给出明日 TOP3 优先事项，按优先级排序，每条指明负责人方向（技术/推广/运维）
3. 如有长期未解决的风险，用升级语气提醒（"再不处理将影响合规"等）
4. 字数 150 字以内，直接输出，不要标题"""


def _build_weekly_prompt(m: dict) -> str:
    ws_list = m.get('workstations', [])
    active_count   = sum(1 for ws in ws_list if ws['status'] == 'active')
    inactive_count = sum(1 for ws in ws_list if ws['status'] == 'inactive')

    return f"""你是 CN KIS 系统的智能运营总经理助理。请根据系统推广现状生成本周战略简报。

【推广现状】
- 活跃使用工作台：{active_count} 个
- 停滞工作台：{inactive_count} 个
- 系统共 15 个业务工作台

请输出：
1. 上周一句话总结（技术/用户/业务三维各一句）
2. 本周战略重点 TOP3（每条：重点工作台 + 具体行动 + 期望结果）
3. 当前推广完成度评估（百分比 + 一句理由）
字数控制在 200 字以内。"""


def _fallback_insight(metrics: dict, brief_type: str) -> str:
    """LLM 不可用时的降级规则摘要"""
    biz = metrics.get('business', {})
    capas = biz.get('capas_overdue', 0)
    inactive_ws = [ws['name'] for ws in metrics.get('workstations', []) if ws['status'] == 'inactive']

    lines = []
    if capas > 0:
        lines.append(f'⚠️ 当前有 {capas} 个 CAPA 逾期，请质量台今天跟进。')
    if inactive_ws:
        lines.append(f'推广停滞工作台：{", ".join(inactive_ws[:3])}，需要安排培训或跟进。')

    if not lines:
        lines.append('今日系统运行正常，请各台继续推进数据录入和用户推广。')

    lines.append('注：LLM 分析暂不可用，以上为规则生成摘要。')
    return '\n'.join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# 飞书推送层
# ══════════════════════════════════════════════════════════════════════════════

def _run_briefing(brief_type: str) -> None:
    """完整流程：采集 → 分析 → 推送"""
    logger.info('开始生成 %s 简报...', brief_type)

    metrics = _collect_all_metrics(brief_type)
    insight = _generate_llm_insight(metrics, brief_type)

    if brief_type == 'morning':
        card = _build_morning_card(metrics, insight)
    elif brief_type == 'evening':
        card = _build_evening_card(metrics, insight)
    else:
        card = _build_weekly_card(metrics, insight)

    _send_to_dev_group(card)
    logger.info('%s 简报推送完成', brief_type)


def _build_morning_card(m: dict, insight: str) -> dict:
    """构建早报飞书卡片"""
    biz = m.get('business', {})
    users = m.get('users', {})
    feedback = m.get('feedback', {})
    system = m.get('system', {})
    ws_list = m.get('workstations', [])

    date = m['date']
    weekday = m['weekday']

    # 状态图标
    has_overdue = biz.get('capas_overdue', 0) > 0
    has_disk_warn = system.get('disk_usage_pct', 0) > 80
    status_icon = '🔴 需立即处理' if has_overdue else ('🟡 需要关注' if has_disk_warn else '🟢 正常')
    template = 'red' if has_overdue else ('yellow' if has_disk_warn else 'green')

    # 工作台面板（前 6 个核心台）
    ws_lines = []
    for ws in ws_list[:6]:
        icon = {'active': '🟢', 'minimal': '🟡', 'data_only': '🟠', 'inactive': '🔴'}.get(ws['status'], '⚪')
        ws_lines.append(f'{icon} {ws["name"]}')

    # 反馈摘要
    feedback_lines = []
    for item in feedback.get('recent_items', [])[:3]:
        cat = {'bug': '🐛', 'feature': '💡', 'question': '❓', 'data': '📊'}.get(item.get('category', ''), '•')
        issue_ref = f' → Issue #{item["github_issue_number"]}' if item.get('github_issue_number') else ''
        feedback_lines.append(f'{cat} {item.get("ai_summary", "")[:40]}{issue_ref}')

    elements = [
        {
            'tag': 'div',
            'text': {'tag': 'lark_md', 'content': f'**📌 总经理批注**\n{insight}'},
        },
        {'tag': 'hr'},
        {
            'tag': 'column_set',
            'flex_mode': 'none',
            'background_style': 'grey',
            'columns': [
                {
                    'tag': 'column', 'width': 'weighted', 'weight': 1,
                    'elements': [{'tag': 'div', 'text': {'tag': 'lark_md',
                        'content': f'**昨日活跃**\n{users.get("dau_total", "?")} 人'}}],
                },
                {
                    'tag': 'column', 'width': 'weighted', 'weight': 1,
                    'elements': [{'tag': 'div', 'text': {'tag': 'lark_md',
                        'content': f'**新增数据**\n工单+{biz.get("workorders_new_24h", 0)} 受试者+{biz.get("subjects_new_24h", 0)}'}}],
                },
                {
                    'tag': 'column', 'width': 'weighted', 'weight': 1,
                    'elements': [{'tag': 'div', 'text': {'tag': 'lark_md',
                        'content': f'**磁盘使用**\n{system.get("disk_usage_pct", "?")}%'}}],
                },
            ],
        },
        {'tag': 'hr'},
    ]

    # 逾期 CAPA 告警
    if biz.get('capas_overdue', 0) > 0:
        elements.append({
            'tag': 'div',
            'text': {'tag': 'lark_md',
                'content': f'**🚨 合规预警**\n逾期 CAPA {biz["capas_overdue"]} 条 · 开放偏差 {biz.get("deviations_open", 0)} 条\n请质量台今日跟进，GCP 检查期间此项为必查项'},
        })
        elements.append({'tag': 'hr'})

    # 工作台推广状态
    if ws_lines:
        elements.append({
            'tag': 'div',
            'text': {'tag': 'lark_md',
                'content': '**📊 工作台推广状态（今日）**\n' + '  '.join(ws_lines)},
        })
        elements.append({'tag': 'hr'})

    # 用户反馈
    if feedback.get('total', 0) > 0:
        elements.append({
            'tag': 'div',
            'text': {'tag': 'lark_md',
                'content': f'**📬 昨日用户反馈（{feedback["total"]} 条）**\n' + '\n'.join(feedback_lines or ['无具体反馈'])},
        })
        elements.append({'tag': 'hr'})

    # 操作按钮
    elements.append({
        'tag': 'action',
        'actions': [
            {'tag': 'button', 'text': {'content': '同步代码', 'tag': 'plain_text'},
             'url': 'https://github.com/china-norm-company/cn_kis_v2.0', 'type': 'primary'},
            {'tag': 'button', 'text': {'content': '查看 PR', 'tag': 'plain_text'},
             'url': 'https://github.com/china-norm-company/cn_kis_v2.0/pulls', 'type': 'default'},
            {'tag': 'button', 'text': {'content': '用户反馈', 'tag': 'plain_text'},
             'url': 'https://github.com/china-norm-company/cn_kis_v2.0/issues', 'type': 'default'},
        ],
    })
    elements.append({
        'tag': 'note',
        'elements': [{'tag': 'plain_text', 'content': f'子衿智能运营官 · {date}（周{weekday}）09:00  |  由 Celery Beat + Qwen 驱动'}],
    })

    return {
        'header': {
            'title': {'content': f'🌅 CN KIS 早报 · {date}（周{weekday}）  {status_icon}', 'tag': 'plain_text'},
            'template': template,
        },
        'elements': elements,
    }


def _build_evening_card(m: dict, insight: str) -> dict:
    """构建晚报飞书卡片"""
    biz = m.get('business', {})
    users = m.get('users', {})
    feedback = m.get('feedback', {})
    system = m.get('system', {})
    ws_list = m.get('workstations', [])
    date = m['date']
    weekday = m['weekday']

    # 完整工作台推广面板
    ws_panel_lines = []
    for ws in ws_list:
        status_map = {
            'active':    '🟢 推广中',
            'minimal':   '🟡 初步使用',
            'data_only': '🟠 有数据无用户',
            'inactive':  '🔴 未激活',
        }
        status_text = status_map.get(ws['status'], '⚪ 未知')
        ws_panel_lines.append(f'**{ws["name"]}** {status_text}')

    # 分两列
    mid = len(ws_panel_lines) // 2
    col1 = '\n'.join(ws_panel_lines[:mid])
    col2 = '\n'.join(ws_panel_lines[mid:])

    elements = [
        {'tag': 'div', 'text': {'tag': 'lark_md', 'content': f'**📌 今日复盘**\n{insight}'}},
        {'tag': 'hr'},
        {
            'tag': 'column_set',
            'flex_mode': 'none',
            'background_style': 'grey',
            'columns': [
                {'tag': 'column', 'width': 'weighted', 'weight': 1,
                 'elements': [{'tag': 'div', 'text': {'tag': 'lark_md',
                     'content': f'**今日活跃**\n{users.get("dau_total", "?")} 人'}}]},
                {'tag': 'column', 'width': 'weighted', 'weight': 1,
                 'elements': [{'tag': 'div', 'text': {'tag': 'lark_md',
                     'content': f'**工单完成率**\n{biz.get("workorders_completed_24h", 0)}/{biz.get("workorders_open", 1) + biz.get("workorders_completed_24h", 0)}'}}]},
                {'tag': 'column', 'width': 'weighted', 'weight': 1,
                 'elements': [{'tag': 'div', 'text': {'tag': 'lark_md',
                     'content': f'**用户反馈**\n{feedback.get("total", 0)} 条 / 未处理 {feedback.get("unresolved", 0)}'}}]},
            ],
        },
        {'tag': 'hr'},
        {
            'tag': 'div',
            'text': {'tag': 'lark_md', 'content': '**📊 工作台推广面板**'},
        },
        {
            'tag': 'column_set',
            'flex_mode': 'none',
            'columns': [
                {'tag': 'column', 'width': 'weighted', 'weight': 1,
                 'elements': [{'tag': 'div', 'text': {'tag': 'lark_md', 'content': col1}}]},
                {'tag': 'column', 'width': 'weighted', 'weight': 1,
                 'elements': [{'tag': 'div', 'text': {'tag': 'lark_md', 'content': col2}}]},
            ],
        },
        {'tag': 'hr'},
        {
            'tag': 'note',
            'elements': [{'tag': 'plain_text', 'content': f'子衿智能运营官 · {date}（周{weekday}）18:00  |  Celery Beat + Qwen 驱动'}],
        },
    ]

    return {
        'header': {
            'title': {'content': f'🌙 CN KIS 晚报 · {date}（周{weekday}）', 'tag': 'plain_text'},
            'template': 'indigo',
        },
        'elements': elements,
    }


def _build_weekly_card(m: dict, insight: str) -> dict:
    """构建周报飞书卡片"""
    date = m['date']
    ws_list = m.get('workstations', [])
    active_count   = sum(1 for ws in ws_list if ws['status'] == 'active')
    inactive_count = sum(1 for ws in ws_list if ws['status'] == 'inactive')
    total_pct = round(active_count / max(len(ws_list), 1) * 100)

    return {
        'header': {
            'title': {'content': f'📋 CN KIS 周报 · 周一战略简报  推广进度 {total_pct}%', 'tag': 'plain_text'},
            'template': 'purple',
        },
        'elements': [
            {'tag': 'div', 'text': {'tag': 'lark_md', 'content': f'**📌 总经理周度简报**\n{insight}'}},
            {'tag': 'hr'},
            {
                'tag': 'div',
                'text': {'tag': 'lark_md', 'content': (
                    f'**本周推广概况**\n'
                    f'活跃工作台 {active_count}/{len(ws_list)} 个 · '
                    f'停滞工作台 {inactive_count} 个\n\n'
                    f'推进目标：本月末达到 **65% 工作台活跃推广**'
                )},
            },
            {'tag': 'hr'},
            {
                'tag': 'action',
                'actions': [
                    {'tag': 'button', 'text': {'content': '查看全部 Issue', 'tag': 'plain_text'},
                     'url': 'https://github.com/china-norm-company/cn_kis_v2.0/issues', 'type': 'primary'},
                ],
            },
            {
                'tag': 'note',
                'elements': [{'tag': 'plain_text', 'content': f'子衿智能运营官 · {date} 08:30 周报  |  Celery Beat + Qwen 驱动'}],
            },
        ],
    }


def _send_to_dev_group(card: dict) -> None:
    """推送到飞书开发小组群"""
    try:
        from libs.feishu_client import FeishuClient
        client = FeishuClient()
        chat_id = os.environ.get('FEISHU_DEV_GROUP_CHAT_ID', '')
        if not chat_id:
            logger.warning('FEISHU_DEV_GROUP_CHAT_ID 未配置，无法推送简报')
            return
        # send_card_message 内部会 json.dumps(card)，这里直接传 dict，不能再 dumps
        client.send_card_message(
            receive_id=chat_id,
            receive_id_type='chat_id',
            card=card,
        )
        logger.info('简报推送成功')
    except Exception as e:
        logger.error('飞书简报推送失败: %s', e, exc_info=True)
