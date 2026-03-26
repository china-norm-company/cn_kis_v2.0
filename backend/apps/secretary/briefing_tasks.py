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

    # ── 原有（字段名已修复）────────────────────────────────
    metrics['users']        = _collect_user_metrics()          # 修复：7天窗口+北京时间
    metrics['business']     = _collect_business_metrics()      # 修复：过滤迁移+L2动作
    metrics['feedback']     = _collect_feedback_metrics()      # ✅ 已正常
    metrics['system']       = _collect_system_metrics()        # ✅ 已正常
    metrics['workstations'] = _collect_workstation_status()    # 修复：19台+配置状态
    # ── 新增数据来源 ──────────────────────────────────────
    metrics['github']        = _collect_github_metrics()        # GitHub PR/提交/Bug
    metrics['im_signals']    = _collect_feishu_im_signals()     # 飞书IM群聊业务信号
    metrics['data_platform'] = _collect_data_platform_metrics() # 洞明·数据台健康
    metrics['adoption']      = _collect_v2_adoption_metrics()   # V2上线进度专项

    return metrics


def _collect_user_metrics() -> dict:
    """
    采集用户活跃度指标。
    统计口径：7天窗口（而非24h），北京时间昨日作为"日活"基准。
    统计对象：apps.identity.models.Account（V2系统真实账号，非Django默认User）
    """
    result = {
        'total_accounts': 0,
        'wau_7d': 0,           # 近7天活跃（主核心指标）
        'dau_yesterday': 0,    # 北京时间昨日活跃
        'new_accounts_7d': 0,
        'never_logged_in': 0,  # 有账号但从未登录（推广空白）
        'last_login_days_ago': None,  # 最近一次登录距今天数
    }
    try:
        from apps.identity.models import Account
        from django.utils import timezone
        from datetime import timedelta
        try:
            from zoneinfo import ZoneInfo
        except ImportError:
            from backports.zoneinfo import ZoneInfo

        tz_beijing = ZoneInfo('Asia/Shanghai')
        now_utc = timezone.now()
        week_ago = now_utc - timedelta(days=7)

        # 北京时间昨日 0点-23:59
        now_beijing = now_utc.astimezone(tz_beijing)
        yesterday_beijing_start = (now_beijing - timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0)
        yesterday_beijing_end = yesterday_beijing_start.replace(
            hour=23, minute=59, second=59)

        qs = Account.objects.filter(is_deleted=False)
        result['total_accounts'] = qs.count()
        result['wau_7d'] = qs.filter(last_login_time__gte=week_ago).count()
        result['dau_yesterday'] = qs.filter(
            last_login_time__gte=yesterday_beijing_start,
            last_login_time__lte=yesterday_beijing_end,
        ).count()
        result['new_accounts_7d'] = qs.filter(create_time__gte=week_ago).count()
        result['never_logged_in'] = qs.filter(last_login_time__isnull=True).count()

        # 最近一次登录距今多少天（感知系统冷热度）
        from django.db.models import Max
        latest = qs.aggregate(Max('last_login_time'))['last_login_time__max']
        if latest:
            result['last_login_days_ago'] = (now_utc - latest).days

    except Exception as e:
        logger.warning('用户指标采集失败: %s', e)
    return result


def _collect_business_metrics() -> dict:
    """
    采集核心业务数据量。
    重要区分：迁移数据（nas_import/referral/database）vs V2真实业务动作。
    L2业务动作 = WorkOrder + SubjectCheckin + Deviation，是判断V2是否真正被使用的核心指标。
    """
    result = {}
    from django.utils import timezone
    now = timezone.now()
    yesterday_utc = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    _safe_count = lambda model, **filters: _try_count(model, **filters)

    # 受试者 ── 区分迁移数据 vs V2原生录入
    MIGRATION_SOURCES = ('nas_import', 'referral', 'database', 'other')
    try:
        from apps.subject.models import Subject
        result['subjects_total']         = _safe_count(Subject, is_deleted=False)
        result['subjects_migrated']      = _safe_count(Subject, source_channel__in=MIGRATION_SOURCES)
        result['subjects_v2_native']     = _safe_count(
            Subject, is_deleted=False
        ) - _safe_count(Subject, source_channel__in=MIGRATION_SOURCES)
        result['subjects_pending_review'] = _safe_count(Subject, status='pending_review')
    except Exception: pass

    # V2真实访视/接待记录（SubjectCheckin）
    try:
        from apps.subject.models import SubjectCheckin
        result['checkins_total']   = _safe_count(SubjectCheckin)
        result['checkins_7d']      = _safe_count(SubjectCheckin, create_time__gte=week_ago)
        result['checkins_24h']     = _safe_count(SubjectCheckin, create_time__gte=yesterday_utc)
    except Exception:
        result['checkins_total'] = 0
        result['checkins_7d'] = 0
        result['checkins_24h'] = 0

    # 协议/方案（排除测试数据）
    try:
        from apps.protocol.models import Protocol
        result['protocols_total']     = _safe_count(Protocol)
        result['protocols_real']      = _safe_count(Protocol, status__in=['active', 'completed', 'approved'])
        result['protocols_new_7d']    = _safe_count(Protocol, create_time__gte=week_ago)
    except Exception: pass

    # 偏差/CAPA（质量台核心指标）
    try:
        from apps.quality.models import Deviation, CAPA
        result['deviations_total']   = _safe_count(Deviation)
        result['deviations_open']    = _safe_count(Deviation, status__in=['open', 'investigating'])
        result['deviations_new_7d']  = _safe_count(Deviation, create_time__gte=week_ago)
        result['deviations_new_24h'] = _safe_count(Deviation, create_time__gte=yesterday_utc)
        result['capas_overdue']      = _safe_count(CAPA, status='overdue')
        result['capas_total']        = _safe_count(CAPA)
    except Exception:
        result['deviations_total'] = 0
        result['deviations_new_24h'] = 0
        result['capas_overdue'] = 0

    # 工单（执行台核心指标）
    try:
        from apps.workorder.models import WorkOrder
        result['workorders_total']         = _safe_count(WorkOrder, is_deleted=False)
        result['workorders_new_7d']        = _safe_count(WorkOrder, create_time__gte=week_ago, is_deleted=False)
        result['workorders_new_24h']       = _safe_count(WorkOrder, create_time__gte=yesterday_utc, is_deleted=False)
        result['workorders_open']          = _safe_count(WorkOrder, status__in=['pending', 'in_progress'], is_deleted=False)
        result['workorders_completed_24h'] = _safe_count(WorkOrder, status__in=['completed', 'approved'],
                                                          update_time__gte=yesterday_utc, is_deleted=False)
    except Exception:
        result['workorders_total'] = 0
        result['workorders_new_24h'] = 0

    # ── L2业务动作总计 ── 这是V2是否真正被使用的核心指标
    result['l2_actions_total'] = (
        result.get('checkins_total', 0) +
        result.get('workorders_total', 0) +
        result.get('deviations_total', 0)
    )
    result['l2_actions_7d'] = (
        result.get('checkins_7d', 0) +
        result.get('workorders_new_7d', 0) +
        result.get('deviations_new_7d', 0)
    )
    result['l2_actions_24h'] = (
        result.get('checkins_24h', 0) +
        result.get('workorders_new_24h', 0) +
        result.get('deviations_new_24h', 0)
    )

    # 物料效期预警
    try:
        from apps.resource.models import Material
        from django.utils import timezone as tz
        week_later = tz.now().date() + timedelta(days=7)
        result['materials_expiring_7d'] = Material.objects.filter(
            expiry_date__lte=week_later, expiry_date__gte=tz.now().date()
        ).count() if hasattr(Material, 'expiry_date') else 0
    except Exception: pass

    # 设备校准逾期
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
        # 核心业务台（临床主链路）
        {'key': 'secretary',         'name': '子衿·秘书台',    'priority': 'core'},
        {'key': 'research',          'name': '采苓·研究台',    'priority': 'core'},
        {'key': 'execution',         'name': '维周·执行台',    'priority': 'core'},
        {'key': 'recruitment',       'name': '招招·招募台',    'priority': 'core'},
        {'key': 'quality',           'name': '怀瑾·质量台',    'priority': 'core'},
        {'key': 'ethics',            'name': '御史·伦理台',    'priority': 'core'},
        {'key': 'reception',         'name': '和序·接待台',    'priority': 'core'},
        # 资源支撑台
        {'key': 'lab-personnel',     'name': '共济·人员台',    'priority': 'high'},
        {'key': 'equipment',         'name': '器衡·设备台',    'priority': 'high'},
        {'key': 'material',          'name': '度支·物料台',    'priority': 'high'},
        {'key': 'finance',           'name': '管仲·财务台',    'priority': 'high'},
        {'key': 'facility',          'name': '坤元·设施台',    'priority': 'medium'},
        {'key': 'evaluator',         'name': '衡技·评估台',    'priority': 'medium'},
        {'key': 'hr',                'name': '时雨·人事台',    'priority': 'medium'},
        {'key': 'crm',               'name': '进思·客户台',    'priority': 'medium'},
        # 平台智能台
        {'key': 'digital-workforce', 'name': '中书·智能台',    'priority': 'platform'},
        {'key': 'data-platform',     'name': '洞明·数据台',    'priority': 'platform'},
        {'key': 'admin',             'name': '鹿鸣·治理台',    'priority': 'platform'},
        {'key': 'control-plane',     'name': '天工·统管台',    'priority': 'platform'},
    ]

    # 简化版：依赖 Account.last_login 的 workstation 字段（如果有）
    # 后续可接入更精细的 PageView 埋点
    for ws in ws_list:
        ws['online_days']     = _estimate_online_days()
        ws['has_data']        = _check_workstation_has_data(ws['key'])
        ws['active_users_7d'] = _check_workstation_active_users(ws['key'])
        ws['assigned_accounts'] = _count_workstation_assigned_accounts(ws['key'])
        # 推广状态（5级，新增 unconfigured）
        if ws['assigned_accounts'] == 0:
            ws['status'] = 'unconfigured'  # 灰：未分配权限，推广前置条件未满足
        elif not ws['has_data']:
            ws['status'] = 'inactive'      # 红：已分配但无数据
        elif ws['active_users_7d'] == 0:
            ws['status'] = 'data_only'     # 橙：有数据无用户（迁移数据但无人操作）
        elif ws['active_users_7d'] < 2:
            ws['status'] = 'minimal'       # 黄：仅 1 人
        else:
            ws['status'] = 'active'        # 绿：正常推广中

    return ws_list


def _estimate_online_days() -> int:
    """估算系统上线天数（基于最早的 Account 创建时间）"""
    try:
        from apps.identity.models import Account
        first = Account.objects.order_by('create_time').first()
        if first:
            return (datetime.now(timezone.utc) - first.create_time.replace(tzinfo=timezone.utc)).days
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
    """检查工作台 7 天内活跃用户数（通过 AccountWorkstationConfig 关联表查询）"""
    try:
        from apps.identity.models import AccountWorkstationConfig
        from django.utils import timezone
        week_ago = timezone.now() - timedelta(days=7)
        return AccountWorkstationConfig.objects.filter(
            workstation=ws_key,
            account__last_login_time__gte=week_ago,
            account__is_deleted=False,
        ).values('account_id').distinct().count()
    except Exception:
        return -1


def _count_workstation_assigned_accounts(ws_key: str) -> int:
    """统计工作台已分配账号数（AccountWorkstationConfig 表）"""
    try:
        from apps.identity.models import AccountWorkstationConfig
        return AccountWorkstationConfig.objects.filter(
            workstation=ws_key,
            account__is_deleted=False,
        ).values('account_id').distinct().count()
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


def _collect_github_metrics() -> dict:
    """从 GitHub REST API 采集开发进展数据（使用 GITHUB_TOKEN 环境变量）"""
    result = {'open_prs': 0, 'commits_24h': 0, 'open_bugs': 0,
              'open_issues': 0, 'error': None}
    token = os.environ.get('GITHUB_TOKEN', '')
    if not token:
        result['error'] = 'GITHUB_TOKEN 未配置'
        return result
    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
    }
    base = 'https://api.github.com/repos/china-norm-company/cn_kis_v2.0'
    since_iso = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
    try:
        import urllib.request
        import json as _json

        def _get(url):
            req = urllib.request.Request(url, headers=headers)
            return _json.loads(urllib.request.urlopen(req, timeout=10).read())

        prs = _get(f'{base}/pulls?state=open&per_page=100')
        result['open_prs'] = len(prs) if isinstance(prs, list) else 0

        commits = _get(f'{base}/commits?since={since_iso}&per_page=100')
        result['commits_24h'] = len(commits) if isinstance(commits, list) else 0

        issues = _get(f'{base}/issues?state=open&per_page=100')
        result['open_issues'] = sum(1 for i in issues if 'pull_request' not in i)
        result['open_bugs'] = sum(
            1 for i in issues
            if 'pull_request' not in i
            and any(l['name'] == 'bug' for l in i.get('labels', []))
        )
    except Exception as e:
        result['error'] = str(e)
        logger.warning('GitHub 指标采集失败: %s', e)
    return result


def _collect_feishu_im_signals(hours: int = 24) -> dict:
    """
    从 PersonalContext 中提取过去 N 小时的飞书 IM 群聊业务信号。
    数据来源：source_type='group_msg'，含里程碑信号和系统开发讨论。
    """
    result = {
        'dev_group_messages': 0,
        'dev_group_keywords': [],
        'project_milestones': [],
        'im_active_groups': 0,
        'total_im_24h': 0,
    }
    try:
        from django.utils import timezone
        from apps.secretary.models import PersonalContext

        since = timezone.now() - timedelta(hours=hours)
        DEV_GROUP_CHAT_ID = os.environ.get('FEISHU_DEV_GROUP_CHAT_ID', '')

        qs = PersonalContext.objects.filter(
            source_type='group_msg',
            created_at__gte=since,
        )
        result['total_im_24h'] = qs.count()
        result['im_active_groups'] = qs.values('source_id').distinct().count()

        # 开发小组群专项分析
        if DEV_GROUP_CHAT_ID:
            dev_msgs = qs.filter(source_id=DEV_GROUP_CHAT_ID)
            result['dev_group_messages'] = dev_msgs.count()
            all_text = ' '.join(
                m.raw_content or m.summary
                for m in dev_msgs[:200]
            )
            KEYWORDS = ['PR', '合并', '部署', '测试', '修复', 'bug', '功能',
                        '验收', '上线', '回滚', '迁移', '性能', '权限', '登录']
            result['dev_group_keywords'] = [
                kw for kw in KEYWORDS if kw.lower() in all_text.lower()
            ]

        # 项目里程碑信号（从 raw_content/summary 中提取）
        MILESTONE_SIGNALS = ['立项', '入组', 'DBL', '数据锁定', '出报告',
                              '伦理通过', '合同签署', '项目关闭', 'SAE']
        milestones = []
        for msg in qs.exclude(source_id=DEV_GROUP_CHAT_ID)[:500]:
            content = msg.raw_content or msg.summary or ''
            for signal in MILESTONE_SIGNALS:
                if signal in content:
                    meta = msg.metadata or {}
                    chat_name = meta.get('chat_name', '某项目群')
                    if len(milestones) < 5:
                        milestones.append(f'{chat_name}：{signal}')
                    break
        result['project_milestones'] = milestones

    except Exception as e:
        logger.warning('飞书 IM 信号采集失败: %s', e)
    return result


def _collect_data_platform_metrics() -> dict:
    """
    采集洞明·数据台的数据治理健康指标。
    数据来源：KnowledgeEntry / PersonalContext / ExternalDataIngestCandidate / RawLimsRecord
    """
    result = {
        'knowledge_total': 0,
        'knowledge_indexed': 0,
        'knowledge_pending': 0,
        'knowledge_failed': 0,
        'knowledge_new_24h': 0,
        'personal_context_total': 0,
        'personal_context_new_24h': 0,
        'ingest_pending': 0,
        'ingest_approved_24h': 0,
        'lims_pending': 0,
        'vectorization_pct': 0,
    }
    try:
        from django.utils import timezone
        yesterday = timezone.now() - timedelta(hours=24)

        from apps.knowledge.models import KnowledgeEntry
        result['knowledge_total']   = KnowledgeEntry.objects.count()
        result['knowledge_indexed'] = KnowledgeEntry.objects.filter(index_status='indexed').count()
        result['knowledge_pending'] = KnowledgeEntry.objects.filter(index_status='pending').count()
        result['knowledge_failed']  = KnowledgeEntry.objects.filter(index_status='failed').count()
        result['knowledge_new_24h'] = KnowledgeEntry.objects.filter(
            create_time__gte=yesterday, is_deleted=False
        ).count()
        if result['knowledge_total'] > 0:
            result['vectorization_pct'] = round(
                result['knowledge_indexed'] / result['knowledge_total'] * 100, 1
            )
    except Exception as e:
        logger.warning('知识库指标采集失败: %s', e)

    try:
        from django.utils import timezone
        yesterday = timezone.now() - timedelta(hours=24)
        from apps.secretary.models import PersonalContext
        result['personal_context_total']   = PersonalContext.objects.count()
        result['personal_context_new_24h'] = PersonalContext.objects.filter(
            created_at__gte=yesterday
        ).count()
    except Exception:
        pass

    try:
        from django.utils import timezone
        yesterday = timezone.now() - timedelta(hours=24)
        from apps.data_intake.models import ExternalDataIngestCandidate, ReviewStatus
        result['ingest_pending'] = ExternalDataIngestCandidate.objects.filter(
            review_status=ReviewStatus.PENDING
        ).count()
        result['ingest_approved_24h'] = ExternalDataIngestCandidate.objects.filter(
            review_status__in=[ReviewStatus.APPROVED, ReviewStatus.AUTO_INGESTED],
            updated_at__gte=yesterday
        ).count()
    except Exception:
        pass

    try:
        from apps.lims_integration.models import RawLimsRecord
        result['lims_pending'] = RawLimsRecord.objects.filter(
            injection_status='pending'
        ).count()
    except Exception:
        pass

    return result


# ══════════════════════════════════════════════════════════════════════════════
# V2 上线进度专项指标
# ══════════════════════════════════════════════════════════════════════════════

def _collect_v2_adoption_metrics() -> dict:
    """
    追踪 V2 系统真正上线的核心进度指标。
    这是区别于"数据迁移完成"和"系统可访问"的第三个维度：
    「业务是否真正在 V2 上运转」。

    上线成熟度分级：
      L0 数据迁移完成  → subjects_migrated > 0
      L1 系统可登录    → wau_7d > 0
      L2 业务在V2运转  → l2_actions_total > 0（WorkOrder+Checkin+Deviation）
      L3 流程有闭环    → 至少1个项目的全链路（方案→工单→偏差）都有数据
      L4 AI辅助决策    → 知识库被业务查询调用（待接入埋点后统计）
    """
    result = {
        'maturity_level': 0,      # 当前成熟度等级 L0-L4
        'maturity_label': '',
        # L0
        'subjects_migrated': 0,
        # L1
        'total_accounts': 0,
        'wau_7d': 0,
        'accounts_configured': 0,  # 已分配工作台权限的账号数
        'workstations_configured': 0,  # 有账号分配的工作台数
        # L2
        'l2_actions_total': 0,
        'l2_breakdown': {'checkins': 0, 'workorders': 0, 'deviations': 0},
        # L3
        'has_real_protocol': False,   # 有真实非测试方案
        'has_l3_loop': False,         # 方案+工单+偏差全有
        # 工作台分配明细（前7个核心台）
        'core_ws_config': [],
    }
    try:
        from django.utils import timezone
        from apps.identity.models import Account, AccountWorkstationConfig
        now = timezone.now()
        week_ago = now - timedelta(days=7)

        # ── L0 ──
        from apps.subject.models import Subject
        MIGRATION_SOURCES = ('nas_import', 'referral', 'database', 'other')
        result['subjects_migrated'] = Subject.objects.filter(
            source_channel__in=MIGRATION_SOURCES
        ).count()

        # ── L1 ──
        accounts = Account.objects.filter(is_deleted=False)
        result['total_accounts'] = accounts.count()
        result['wau_7d'] = accounts.filter(last_login_time__gte=week_ago).count()

        configured_account_ids = set(
            AccountWorkstationConfig.objects.values_list('account_id', flat=True)
        )
        result['accounts_configured'] = len(configured_account_ids)
        result['workstations_configured'] = AccountWorkstationConfig.objects.values(
            'workstation'
        ).distinct().count()

        # ── L2 ──
        try:
            from apps.subject.models import SubjectCheckin
            checkins = SubjectCheckin.objects.count()
        except Exception:
            checkins = 0
        try:
            from apps.workorder.models import WorkOrder
            workorders = WorkOrder.objects.filter(is_deleted=False).count()
        except Exception:
            workorders = 0
        try:
            from apps.quality.models import Deviation
            deviations = Deviation.objects.count()
        except Exception:
            deviations = 0

        result['l2_breakdown'] = {'checkins': checkins, 'workorders': workorders, 'deviations': deviations}
        result['l2_actions_total'] = checkins + workorders + deviations

        # ── L3 ──
        try:
            from apps.protocol.models import Protocol
            result['has_real_protocol'] = Protocol.objects.filter(
                status__in=['active', 'completed', 'approved']
            ).exists()
        except Exception:
            pass
        result['has_l3_loop'] = (
            result['has_real_protocol'] and workorders > 0 and deviations > 0
        )

        # ── 核心台分配明细 ──
        CORE_WS = [
            ('secretary',   '子衿·秘书台'),
            ('research',    '采苓·研究台'),
            ('execution',   '维周·执行台'),
            ('recruitment', '招招·招募台'),
            ('quality',     '怀瑾·质量台'),
            ('ethics',      '御史·伦理台'),
            ('reception',   '和序·接待台'),
        ]
        for key, name in CORE_WS:
            assigned = AccountWorkstationConfig.objects.filter(
                workstation=key, account__is_deleted=False
            ).values('account_id').distinct().count()
            active = AccountWorkstationConfig.objects.filter(
                workstation=key,
                account__last_login_time__gte=week_ago,
                account__is_deleted=False,
            ).values('account_id').distinct().count()
            result['core_ws_config'].append({
                'key': key, 'name': name,
                'assigned': assigned,
                'active_7d': active,
            })

        # ── 成熟度等级判断 ──
        if result['has_l3_loop']:
            result['maturity_level'] = 3
            result['maturity_label'] = 'L3 流程闭环'
        elif result['l2_actions_total'] > 0:
            result['maturity_level'] = 2
            result['maturity_label'] = 'L2 业务运转中'
        elif result['wau_7d'] > 0:
            result['maturity_level'] = 1
            result['maturity_label'] = 'L1 可登录'
        elif result['subjects_migrated'] > 0:
            result['maturity_level'] = 0
            result['maturity_label'] = 'L0 数据迁移'
        else:
            result['maturity_level'] = -1
            result['maturity_label'] = '未初始化'

    except Exception as e:
        logger.warning('V2上线进度指标采集失败: %s', e)

    return result


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
    biz      = m.get('business', {})
    users    = m.get('users', {})
    feedback = m.get('feedback', {})
    system   = m.get('system', {})
    gh       = m.get('github', {})
    im       = m.get('im_signals', {})
    dp       = m.get('data_platform', {})
    adoption = m.get('adoption', {})
    ws_list  = m.get('workstations', [])

    # 上线进度核心数据
    maturity      = adoption.get('maturity_label', '未知')
    l2_total      = adoption.get('l2_actions_total', 0)
    l2_bd         = adoption.get('l2_breakdown', {})
    accs_total    = adoption.get('total_accounts', 0)
    accs_cfg      = adoption.get('accounts_configured', 0)
    ws_cfg        = adoption.get('workstations_configured', 0)
    core_ws       = adoption.get('core_ws_config', [])
    wau           = users.get('wau_7d', 0)
    last_login_d  = users.get('last_login_days_ago')

    # 工作台配置明细（只列未配置的）
    uncfg_ws = [ws['name'] for ws in ws_list if ws['status'] == 'unconfigured']
    active_ws = [ws['name'] for ws in ws_list if ws['status'] == 'active']

    milestones   = im.get('project_milestones', [])
    dev_keywords = im.get('dev_group_keywords', [])

    # 核心7台的配置情况（文字化）
    core_ws_lines = '\n'.join(
        f'  {w["name"]}：已分配{w["assigned"]}人，7天活跃{w["active_7d"]}人'
        for w in core_ws
    )

    return f"""你是 CN KIS 系统上线价值实现的负责人，同时也是智能运营总经理。
你的核心使命：推动系统从"可访问"进入"业务真正在V2运转"阶段（L2），最终实现项目全生命周期数字化+智能化。

【当前上线成熟度：{maturity}】
- 系统账号共 {accs_total} 人，近7天活跃 {wau} 人，距上次登录 {last_login_d if last_login_d is not None else '未知'} 天
- 工作台权限配置：{accs_cfg}/{accs_total} 人已分配工作台，{ws_cfg}/19 个工作台有账号

【核心7台分配现状】
{core_ws_lines}

【L2业务动作总计：{l2_total} 条】（这是V2是否真正被用的判断标准）
- 受试者访视/接待：{l2_bd.get('checkins', 0)} 条
- 工单：{l2_bd.get('workorders', 0)} 条
- 偏差记录：{l2_bd.get('deviations', 0)} 条
{'⚠️ L2为零：系统尚未进入真实业务使用阶段' if l2_total == 0 else ''}

【开发进展（GitHub）】
- 开放PR：{gh.get('open_prs', 0)} 个，提交：{gh.get('commits_24h', 0)} 次（24h），Bug：{gh.get('open_bugs', 0)} 个

【飞书业务信号】
- 开发群讨论焦点：{', '.join(dev_keywords) or '无'}
- 项目里程碑：{'; '.join(milestones) or '无'}

【数据治理（洞明·数据台）】
- 知识库：{dp.get('knowledge_total', 0):,} 条，向量化 {dp.get('vectorization_pct', 0)}%
- 合规：逾期CAPA {biz.get('capas_overdue', 0)} 条，磁盘 {system.get('disk_usage_pct', '?')}%

【你的任务】
以系统上线价值实现责任人的视角，写"总经理批注"（2-3段，150字以内）：
1. 第一句：基于L2动作数和账号配置情况，判断上线处于哪个阶段，是否在正轨
2. 点出当前最关键的卡点（是账号权限未配置？还是已配置但没操作？还是有操作但量太少？）
3. 给出今日最高优先级的1个具体行动（点名工作台/责任人方向），用"今天必须"而不是"建议"
4. 如有项目里程碑信号，结合说明哪个项目的什么节点需要在V2留痕
5. 语气：务实、有紧迫感，不要说"数据显示"等机器感词汇"""


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
- 系统共 19 个工作台（15 业务台 + 4 平台台）

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
    """构建早报飞书卡片（上线进度导向版）"""
    biz      = m.get('business', {})
    users    = m.get('users', {})
    feedback = m.get('feedback', {})
    system   = m.get('system', {})
    ws_list  = m.get('workstations', [])
    gh       = m.get('github', {})
    dp       = m.get('data_platform', {})
    im       = m.get('im_signals', {})
    adoption = m.get('adoption', {})

    date    = m['date']
    weekday = m['weekday']

    # ── 上线进度核心数据 ──
    maturity   = adoption.get('maturity_label', '未知')
    l2_total   = adoption.get('l2_actions_total', 0)
    l2_bd      = adoption.get('l2_breakdown', {})
    accs_cfg   = adoption.get('accounts_configured', 0)
    accs_total = adoption.get('total_accounts', 0)
    ws_cfg     = adoption.get('workstations_configured', 0)
    wau        = users.get('wau_7d', 0)
    last_d     = users.get('last_login_days_ago')
    core_ws    = adoption.get('core_ws_config', [])

    # ── 卡片颜色：L2=0 → 告警红；L2>0 → 绿 ──
    has_overdue   = biz.get('capas_overdue', 0) > 0
    has_disk_warn = system.get('disk_usage_pct', 0) > 80
    l2_zero       = l2_total == 0
    if has_overdue:
        template, status_icon = 'red', '🔴 合规预警'
    elif l2_zero:
        template, status_icon = 'orange', '🟠 L2未启动'
    elif has_disk_warn:
        template, status_icon = 'yellow', '🟡 需关注'
    else:
        template, status_icon = 'green', '🟢 运行中'

    # ── 核心7台配置状态行 ──
    ICON_MAP = {'active': '🟢', 'minimal': '🟡', 'data_only': '🟠',
                'inactive': '🔴', 'unconfigured': '⚫'}
    ws_status_lookup = {ws['key']: ws for ws in ws_list}
    core_ws_lines = []
    for w in core_ws:
        ws_s = ws_status_lookup.get(w['key'], {})
        icon = ICON_MAP.get(ws_s.get('status', ''), '⚪')
        core_ws_lines.append(
            f'{icon} {w["name"]}  分配{w["assigned"]}人·活跃{w["active_7d"]}人'
        )

    # ── 反馈摘要 ──
    feedback_lines = []
    for item in feedback.get('recent_items', [])[:3]:
        cat = {'bug': '🐛', 'feature': '💡', 'question': '❓'}.get(item.get('category', ''), '•')
        issue_ref = f' → Issue #{item["github_issue_number"]}' if item.get('github_issue_number') else ''
        feedback_lines.append(f'{cat} {item.get("ai_summary", "")[:40]}{issue_ref}')

    elements = [
        # 总经理批注
        {'tag': 'div', 'text': {'tag': 'lark_md', 'content': f'**📌 总经理批注**\n{insight}'}},
        {'tag': 'hr'},

        # ── 核心三列：上线进度 / 账号配置 / 系统健康 ──
        {
            'tag': 'column_set',
            'flex_mode': 'none',
            'background_style': 'grey',
            'columns': [
                {
                    'tag': 'column', 'width': 'weighted', 'weight': 1,
                    'elements': [{'tag': 'div', 'text': {'tag': 'lark_md', 'content': (
                        f'**上线阶段**\n{maturity}\n'
                        f'L2动作 **{l2_total}** 条'
                    )}}],
                },
                {
                    'tag': 'column', 'width': 'weighted', 'weight': 1,
                    'elements': [{'tag': 'div', 'text': {'tag': 'lark_md', 'content': (
                        f'**账号配置**\n{accs_cfg}/{accs_total} 人已分配\n'
                        f'覆盖 {ws_cfg}/19 个工作台'
                    )}}],
                },
                {
                    'tag': 'column', 'width': 'weighted', 'weight': 1,
                    'elements': [{'tag': 'div', 'text': {'tag': 'lark_md', 'content': (
                        f'**7天活跃**\n{wau} 人登录\n'
                        f'距上次登录 {last_d if last_d is not None else "?"} 天'
                    )}}],
                },
            ],
        },
        {'tag': 'hr'},

        # ── L2 业务动作明细 ──
        {
            'tag': 'div',
            'text': {'tag': 'lark_md', 'content': (
                f'**🏥 L2 业务动作明细**（V2真实使用的判断标准）\n'
                f'访视/接待：**{l2_bd.get("checkins", 0)}** 条  ·  '
                f'工单：**{l2_bd.get("workorders", 0)}** 条  ·  '
                f'偏差：**{l2_bd.get("deviations", 0)}** 条\n'
                + ('⚠️ 全部为零 → 系统尚未进入真实业务使用，今日须创建首条记录' if l2_total == 0 else
                   '✅ 业务已在V2发生，继续扩大工作台覆盖')
            )},
        },
        {'tag': 'hr'},

        # ── 核心7台工作台上线状态 ──
        {
            'tag': 'div',
            'text': {'tag': 'lark_md', 'content': (
                '**📋 核心7台上线状态**（分配账号 · 7天活跃）\n'
                + '\n'.join(core_ws_lines)
            )},
        },
        {'tag': 'hr'},
    ]

    # ── 开发进展 ──
    elements.append({
        'tag': 'div',
        'text': {'tag': 'lark_md', 'content': (
            f'**💻 开发进展（GitHub）**\n'
            f'开放PR: {gh.get("open_prs", 0)} 个 · '
            f'提交: {gh.get("commits_24h", 0)} 次（24h） · '
            f'Bug: {gh.get("open_bugs", 0)} 个'
        )},
    })
    elements.append({'tag': 'hr'})

    # ── 飞书业务信号（有数据才展示）──
    dev_keywords = im.get('dev_group_keywords', [])
    milestones   = im.get('project_milestones', [])
    if im.get('dev_group_messages', 0) > 0 or milestones:
        im_lines = []
        if dev_keywords:
            im_lines.append(f'开发群 {im.get("dev_group_messages", 0)} 条消息，焦点：{", ".join(dev_keywords[:6])}')
        if milestones:
            im_lines.append('项目里程碑：' + '；'.join(milestones[:3]))
        elements.append({
            'tag': 'div',
            'text': {'tag': 'lark_md', 'content': '**🏥 飞书业务信号**\n' + '\n'.join(im_lines)},
        })
        elements.append({'tag': 'hr'})

    # ── 数据资产健康 ──
    vect_pct = dp.get('vectorization_pct', 0)
    dp_status = '🔴 需关注' if (vect_pct < 95 or dp.get('knowledge_failed', 0) > 100
                                or dp.get('ingest_pending', 0) > 50) else '🟢 正常'
    elements.append({
        'tag': 'div',
        'text': {'tag': 'lark_md', 'content': (
            f'**📦 数据资产健康  {dp_status}**\n'
            f'知识库 {dp.get("knowledge_total", 0):,} 条 · '
            f'向量化 {vect_pct}% · '
            f'积压 {dp.get("knowledge_pending", 0)} 条'
        )},
    })
    elements.append({'tag': 'hr'})

    # ── 合规预警（有才显示）──
    if has_overdue:
        elements.append({
            'tag': 'div',
            'text': {'tag': 'lark_md', 'content': (
                f'**🚨 合规预警**\n'
                f'逾期 CAPA {biz["capas_overdue"]} 条 · 开放偏差 {biz.get("deviations_open", 0)} 条\n'
                f'质量台今日必须跟进，GCP检查期间必查项'
            )},
        })
        elements.append({'tag': 'hr'})

    # ── 用户反馈（有才显示）──
    if feedback.get('total', 0) > 0:
        elements.append({
            'tag': 'div',
            'text': {'tag': 'lark_md', 'content': (
                f'**📬 用户反馈（{feedback["total"]} 条）**\n'
                + '\n'.join(feedback_lines or ['无具体内容'])
            )},
        })
        elements.append({'tag': 'hr'})

    # ── 操作按钮 ──
    elements.append({
        'tag': 'action',
        'actions': [
            {'tag': 'button', 'text': {'content': '同步代码', 'tag': 'plain_text'},
             'url': 'https://github.com/china-norm-company/cn_kis_v2.0', 'type': 'primary'},
            {'tag': 'button', 'text': {'content': '查看 PR', 'tag': 'plain_text'},
             'url': 'https://github.com/china-norm-company/cn_kis_v2.0/pulls', 'type': 'default'},
            {'tag': 'button', 'text': {'content': 'Issue 列表', 'tag': 'plain_text'},
             'url': 'https://github.com/china-norm-company/cn_kis_v2.0/issues', 'type': 'default'},
        ],
    })
    elements.append({
        'tag': 'note',
        'elements': [{'tag': 'plain_text',
            'content': f'子衿智能运营官 · {date}（周{weekday}）09:00  |  Celery Beat + Kimi 驱动'}],
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
                    f'推进目标：本月末达到 **65% 工作台活跃推广**（≥12/19 台有真实用户）'
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
