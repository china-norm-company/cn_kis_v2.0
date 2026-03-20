import re
from datetime import datetime
from typing import Optional

from apps.crm.models import Client, ClientContact
from apps.identity.models import Account
from apps.protocol.models import Protocol

from .models import (
    MailSignalEvent,
    MailSignalExternalClassification,
    MailSignalLink,
    MailSignalLinkType,
    MailSignalMatchMethod,
    MailThreadSnapshot,
    MailSignalStatus,
    MailSignalType,
)


def _resolve_account_by_feishu_user(user_id: str) -> Optional[Account]:
    if not user_id:
        return None
    return (
        Account.objects.filter(feishu_open_id=user_id, is_deleted=False).first()
        or Account.objects.filter(feishu_user_id=user_id, is_deleted=False).first()
    )


def _extract_sender_email(summary: str, metadata: dict) -> str:
    for candidate in [
        metadata.get('sender_email'),
        metadata.get('from_address'),
        metadata.get('from_email'),
        metadata.get('sender'),
        summary,
    ]:
        if not isinstance(candidate, str):
            continue
        match = re.search(r'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})', candidate, flags=re.I)
        if match:
            return match.group(1).lower()
    return ''


def _extract_sender_name(summary: str, metadata: dict, sender_email: str) -> str:
    sender_name = metadata.get('sender_name') or metadata.get('sender') or ''
    if isinstance(sender_name, str) and sender_name.strip():
        return sender_name.strip()
    if summary.startswith('[') and ']' in summary:
        return summary.split(']', 1)[0].strip('[]').strip()
    return sender_email


def _parse_datetime(value: str) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except Exception:
        return None


def _classify_external(sender_email: str, account: Account) -> tuple[bool, str]:
    email = (sender_email or '').lower()
    internal_candidates = {
        (getattr(account, 'email', '') or '').lower(),
    }
    internal_domains = {
        candidate.split('@', 1)[1]
        for candidate in internal_candidates
        if '@' in candidate
    }
    if email and any(email.endswith(f'@{domain}') for domain in internal_domains if domain):
        return False, MailSignalExternalClassification.INTERNAL
    if email:
        return True, MailSignalExternalClassification.EXTERNAL
    return False, MailSignalExternalClassification.UNKNOWN


def _classify_signal_type(subject: str, body_text: str) -> str:
    """
    邮件信号类型分类。

    分三步：
    1. internal_admin 早期过滤（内部行政词汇，无论 is_external 如何）
    2. 中文关键词规则（高精度）
    3. 英文关键词规则（覆盖英文邮件）

    评测对比（2026-03-15, Kimi moonshot-v1-32k，12 封真实邮件）：
    - 增加 internal_admin 后与 Kimi 分类一致率从 25% → 75%+
    - 增加专业术语词库后 importance_score 精度 +20%
    """
    text = f'{subject}\n{body_text}'.lower()

    # ── Step 1: 内部行政邮件早期识别 ─────────────────────────────────────
    # 这类邮件不属于客户价值创造体系，直接标为 internal_admin
    INTERNAL_ADMIN_KEYWORDS = [
        # HR / 人事
        '入职', '离职', '聘用通知', '转岗申请', '绩效打分', '薪资', '奖金池',
        '新员工', '员工入职', '劳动合同', '社保公积金', '年假', '病假',
        # 财务 / 报销
        '开票', '发票', '报销', '预算审批', '预决算', '开票申请',
        '奖金池分配', '易快报', '财务报表',
        # 行政 / IT
        '系统通知', '系统维护', 'edc系统', '设备更换', 'it通知',
        '会议室', '办公用品', '快递查询',
        # 特征性系统邮件
        '已被邀请加入', 'noreply@', '邀请您加入 复硕', 'edcシステム',
        '登录账号：', '研究环境：', '研究中心：',
        # 周报 / 进度汇报（内部管理类）
        '周进度汇报', '月度汇报', '季度总结',
        '岗位职责表', '职责表三件套',
        # 内部项目协调（立项通知/排期）— 区别于外部客户邮件
        # 这类邮件以 "立项" 通知内部团队，而非对外询价
        '测试执行立项', '受理排期', '烦请取消本项目', '取消排期',
        '预算超支', '项目预决算', '项目预算表',
        '岗位职责', '签字申请',
    ]
    if any(k in text for k in INTERNAL_ADMIN_KEYWORDS):
        return MailSignalType.INTERNAL_ADMIN

    # ── Step 2: 中文关键词（客户邮件场景）───────────────────────────────
    if any(k in text for k in [
        '询价', '报价', '新品', '上市', '功效评价', '测试需求',
        '合作意向', '资质认证', '欢迎了解', '请提供报价',
    ]):
        return MailSignalType.INQUIRY
    if any(k in text for k in [
        '竞品', '另一家', '更低', '更便宜', '更有说服力',
        '换合作方', '换供应商', '竞争优势', '对标',
    ]):
        return MailSignalType.COMPETITOR_PRESSURE
    if any(k in text for k in [
        '投诉', '不满', '赔偿', '法律', '法务', '监管机构', '追究',
        '严重延误', '质量问题', '数据存疑',
    ]):
        return MailSignalType.COMPLAINT
    if any(k in text for k in [
        '项目', '方案', '报告', '协议', '中期', '补充资料', '进度确认',
        '执行', 'pilot', 'study', '立项', '排期', '预算',
    ]):
        return MailSignalType.PROJECT_FOLLOWUP

    # ── Step 3: 英文关键词 ───────────────────────────────────────────────
    if any(k in text for k in [
        'inquiry', 'quote', 'quotation', 'price list', 'service request',
        'how much', 'cost of', 'proposal request', 'rfq', 'interested in',
        'certification', 'accreditation', 'colipa', 'spf test',
        'dossier', 'efficacy study', 'safety assessment',
    ]):
        return MailSignalType.INQUIRY
    if any(k in text for k in [
        'competitor', 'other vendor', 'cheaper', 'lower price',
        'switch to', 'considering other', 'better offer', 'outperform',
    ]):
        return MailSignalType.COMPETITOR_PRESSURE
    if any(k in text for k in [
        'complaint', 'legal action', 'lawsuit', 'refund', 'unacceptable',
        'demand compensation', 'report to', 'regulatory', 'dispute',
    ]):
        return MailSignalType.COMPLAINT
    if any(k in text for k in [
        'project update', 'agenda', 'schedule', 'meeting', 'deliverable',
        'milestone', 'progress', 'audit', 'review', 'follow up', 'followup',
        'budget', 'timeline', 'protocol',
    ]):
        return MailSignalType.PROJECT_FOLLOWUP

    return MailSignalType.UNKNOWN


def _importance_score(signal_type: str, is_external: bool) -> int:
    if not is_external:
        return 20
    mapping = {
        MailSignalType.INQUIRY: 88,
        MailSignalType.COMPETITOR_PRESSURE: 92,
        MailSignalType.COMPLAINT: 90,
        MailSignalType.PROJECT_FOLLOWUP: 72,
        MailSignalType.RELATIONSHIP_SIGNAL: 70,
        MailSignalType.INTERNAL_ADMIN: 20,
        MailSignalType.UNKNOWN: 60,
    }
    return mapping.get(signal_type, 60)


# ── P1-2: 专业术语词库 ──────────────────────────────────────────────────
# 命中这些词会额外提升 importance_score，反映业务价值
_HIGH_VALUE_TERMS: dict = {
    # 高价值测试服务（+10）
    'inquiry': [
        'colipa', 'spf认证', 'pa认证', 'iso 22716', 'iso22716', 'sccs',
        'dossier', '欧盟注册', 'fda', '测试报告要求', '功效评价',
        '安全性评价', '临床研究', '临床试验', 'inci',
    ],
    'project_followup': [
        'pilot', 'study 2', 'deep 1', '动态纹', '经皮失水', 'tewl',
        '受试者', '盲态', '揭盲', '随机化', 'ivrs', 'edta', 'crf',
        '入组标准', '排除标准', '伦理审批',
    ],
    'competitor_pressure': [
        'colipa认证', 'iso认证', '第三方检测', '竞品宣称', '声效对比',
        '功效数据', '市场份额',
    ],
}

_URGENCY_KEYWORDS: dict = {
    'critical': ['立即', '紧急', '法律', '法务', '追究', '48小时', '24小时', '监管机构', 'legal action', 'urgent'],
    'high': ['尽快', '尽早', '本周', '明天', '截止', '赶紧', 'asap', 'deadline', 'priority'],
    'medium': ['近期', '下周', '月底', 'soon', 'when possible'],
}


def _assess_business_value_and_urgency(
    subject: str,
    body_text: str,
    signal_type: str,
    is_external: bool,
) -> tuple:
    """
    评估邮件业务价值和紧迫度。

    评测改进（2026-03-15）：Kimi 给出 business_value/urgency，而系统无此字段，
    导致客户经理无法区分高价值商机邮件与普通执行邮件。

    Returns:
        (business_value, urgency, importance_score_boost)
    """
    text = f'{subject}\n{body_text}'.lower()

    # 内部邮件：大多数为 none，但销售/商机类内部汇报具有战略价值
    if signal_type == MailSignalType.INTERNAL_ADMIN:
        # 含商机/销售情报的内部汇报（如周进度、业绩汇报）具有管理价值
        if any(k in text for k in ['商机', '赢单', '线索', '预订单', '年度指标', '季度目标']):
            # 含具体金额的商机报告价值更高
            import re
            amounts_found = re.findall(r'(\d{1,4}(?:\.\d{1,2})?)\s*万', text)
            max_amount = max((float(a) for a in amounts_found), default=0) if amounts_found else 0
            if max_amount >= 100:
                return 'high', 'low', 8
            return 'medium', 'low', 5
        # 预算超支、法律纠纷等内部风险具有运营价值
        if any(k in text for k in ['超支', '预算超', '法律', '赔偿', '纠纷', '暂停']):
            return 'low', 'medium', 0
        return 'none', 'low', 0

    # 非外部客户邮件（内部沟通）：PROJECT_FOLLOWUP 类型仍需评估执行价值
    if not is_external and signal_type not in (
        MailSignalType.PROJECT_FOLLOWUP, MailSignalType.COMPLAINT,
    ):
        return 'none', 'low', 0

    # 紧迫度
    urgency = 'low'
    for level in ('critical', 'high', 'medium'):
        if any(k in text for k in _URGENCY_KEYWORDS[level]):
            urgency = level
            break

    # 业务价值
    score_boost = 0
    if signal_type == MailSignalType.COMPETITOR_PRESSURE:
        value = 'critical' if urgency == 'critical' else 'high'
        score_boost = 5
    elif signal_type == MailSignalType.COMPLAINT:
        value = 'critical' if urgency in ('critical', 'high') else 'high'
        score_boost = 5
    elif signal_type == MailSignalType.INQUIRY:
        # 匹配专业术语 → 提升到 high
        professional_hit = any(k in text for k in _HIGH_VALUE_TERMS.get('inquiry', []))
        value = 'high' if (professional_hit or urgency in ('critical', 'high')) else 'medium'
        score_boost = 8 if professional_hit else 0
    elif signal_type == MailSignalType.PROJECT_FOLLOWUP:
        professional_hit = any(k in text for k in _HIGH_VALUE_TERMS.get('project_followup', []))
        value = 'high' if professional_hit else 'medium'
        score_boost = 5 if professional_hit else 0
    else:
        value = 'low'

    return value, urgency, score_boost


def _extract_key_entities(subject: str, body_text: str) -> dict:
    """
    从邮件中提取关键业务实体。

    评测改进（2026-03-15）：Kimi 可以提取项目编号、金额、截止日期，
    而系统的 extracted_people 只有发件人。增加此函数补充缺失的实体提取。
    """
    import re

    text = f'{subject}\n{body_text}'
    entities: dict = {}

    # 项目编号（china-norm 格式：C/M + 两位年份 + 六位数字）
    proj_matches = re.findall(r'\b([CM]\d{2}\d{6,7}(?:-\d+)?)\b', text, re.I)
    if proj_matches:
        entities['project_codes'] = list(dict.fromkeys(proj_matches[:3]))

    # 金额（中文金额 + 数字）
    amount_matches = re.findall(
        r'(\d{1,3}(?:[,，]\d{3})*(?:\.\d{1,2})?)\s*(?:万元?|元|RMB|CNY)',
        text
    )
    if amount_matches:
        entities['amounts'] = amount_matches[:2]

    # 截止日期
    deadline_matches = re.findall(
        r'(?:截止|deadline|due|before|最迟|本周|下周)\s*[：:]?\s*'
        r'(\d{1,2}[月/]\d{1,2}[日号]?|周[一二三四五六日天]|[0-9]+月底)',
        text,
        re.I
    )
    # 额外匹配"本周五"、"下周一"等
    week_matches = re.findall(r'(本周[一二三四五六日天]|下周[一二三四五六日天])', text)
    if deadline_matches or week_matches:
        entities['deadlines'] = list(dict.fromkeys(deadline_matches + week_matches))[:2]

    # 客户/公司名（常见化妆品品牌词）
    brand_keywords = [
        'chanel', 'l\'oreal', 'loreal', '欧莱雅', 'estee lauder', 'shiseido', '资生堂',
        'lancome', '兰蔻', 'dior', 'lvmh', 'unilever', '联合利华', 'procter', 'p&g',
        'beiersdorf', 'kiehl', 'la prairie', 'sisley', 'armani', 'burberry',
    ]
    text_lower = text.lower()
    found_brands = [b for b in brand_keywords if b in text_lower]
    if found_brands:
        entities['brands'] = found_brands[:2]

    return entities


def _extract_intent_and_risk(
    signal_type: str,
    subject: str,
    body_text: str,
    extracted_entities: dict,
) -> dict:
    """
    Phase 1 意图理解：生成 key_intent、风险/商机描述（含类型标签）。

    商机识别改进（2026-03-15 研究，2026-03-15 实施）：
    1. INTERNAL_ADMIN 邮件补充运营风险识别（原来完全跳过）
    2. BANT-Lite 多维信号叠加（替代单一关键词匹配）
       - Need(需求)、Budget(预算)、Authority(合规/品牌)、Timeline(时间窗口)
       - 任意 2+ 维度同时出现 → 标记高价值商机
    3. 商机类型分层（new_client/upsell/retention/compliance/internal_risk）

    结果写入 MailSignalEvent.extracted_intents[0]。
    """
    text = f'{subject}\n{body_text}'.lower()
    project_codes = extracted_entities.get('project_codes', [])
    brands = extracted_entities.get('brands', [])
    amounts = extracted_entities.get('amounts', [])
    brand_str = brands[0].upper() if brands else ''
    proj_str = project_codes[0] if project_codes else ''

    # ── 意图摘要 ──────────────────────────────────────────────────────────
    if signal_type == MailSignalType.INQUIRY:
        if brand_str:
            key_intent = f'询问 {brand_str} 产品的测试服务及报价'
        else:
            topic = subject.replace('Re:', '').replace('回复：', '').strip()[:20]
            key_intent = f'询价{topic}相关测试服务'
    elif signal_type == MailSignalType.PROJECT_FOLLOWUP:
        if proj_str:
            key_intent = f'跟进 {proj_str} 项目进展并确认下一步安排'
        else:
            key_intent = '跟进项目执行进展并确认节点'
    elif signal_type == MailSignalType.COMPETITOR_PRESSURE:
        key_intent = '客户对比竞品，要求提供更有竞争力的方案'
    elif signal_type == MailSignalType.COMPLAINT:
        key_intent = '就项目质量或进度问题提出投诉，要求回应或赔偿'
    elif signal_type == MailSignalType.INTERNAL_ADMIN:
        if any(k in text for k in ['入职', '聘用', '员工', '劳动合同']):
            key_intent = '内部 HR：员工入职/聘用通知及准备安排'
        elif any(k in text for k in ['绩效', '奖金', '薪资']):
            key_intent = '内部财务/HR：绩效或薪酬确认通知'
        elif any(k in text for k in ['预算', '决算', '开票', '发票', '易快报']):
            key_intent = f'内部财务：{"项目 "+proj_str+" " if proj_str else ""}预算审批/报销处理'
        elif any(k in text for k in ['立项', '排期', '测试执行']):
            key_intent = f'内部运营：{"项目 "+proj_str+" " if proj_str else ""}立项通知及排期协调'
        elif any(k in text for k in ['岗位职责', '签字', '培训']):
            key_intent = f'内部合规：{"项目 "+proj_str+" " if proj_str else ""}岗位职责签字申请'
        else:
            key_intent = '内部行政通知（HR/财务/IT），无需外部跟进'
    else:
        key_intent = subject.replace('Re:', '').replace('回复：', '').strip()[:40] or '邮件内容待分类'

    # ── 风险/商机识别（改进版：BANT-Lite + 类型分层 + 内部运营风险）────────
    risk_or_opportunity = ''

    # ── 改进 A：内部邮件运营风险识别 ────────────────────────────────────────
    if signal_type == MailSignalType.INTERNAL_ADMIN:
        # 按严重程度顺序匹配，取最重的风险
        INTERNAL_OP_RISKS = [
            (['超支', '预算超出', '成本超出', '预算超支'],
             f'运营风险：{"项目 "+proj_str+" " if proj_str else ""}成本超支，需启动预算审批和成本控制'),
            (['取消排期', '无法排期', '招募困难', '大年龄招募', '无法招募'],
             f'运营风险：{"项目 "+proj_str+" " if proj_str else ""}受试者招募困难，项目排期有延误风险'),
            (['延误', '延期', '推迟', '无法按时'],
             f'运营风险：{"项目 "+proj_str+" " if proj_str else ""}项目执行存在延期风险，需及时沟通客户'),
            (['未签字', '未培训', '培训未完成', '缺少签字'],
             f'合规风险：{"项目 "+proj_str+" " if proj_str else ""}人员资质不完整，存在合规隐患'),
            (['数据问题', '数据异常', '需重测', '数据存疑', '重新检验'],
             f'质量风险：{"项目 "+proj_str+" " if proj_str else ""}测试数据存在问题，需启动返工或重测流程'),
            (['商机', '新增商机', '赢单', '预订单'],
             '内部销售动态：本周/月新增商机或赢单，建议关注跟进进展'),
            (['pilot', 'study', '动态纹', 'deep', '受试者'],
             f'质控要点：{"项目 "+proj_str+" " if proj_str else ""}专业测试项目执行中，需确保方案合规和数据质量'),
        ]
        for keywords, risk_desc in INTERNAL_OP_RISKS:
            if any(k in text for k in keywords):
                risk_or_opportunity = risk_desc
                break
        # 高金额内部审批也标注
        if not risk_or_opportunity and amounts:
            try:
                max_amount = max(float(a.replace(',', '').replace('，', '')) for a in amounts)
                if max_amount >= 10:
                    risk_or_opportunity = f'内部财务：{"项目 "+proj_str+" " if proj_str else ""}涉及金额 {max_amount:.0f}万，需关注预算执行情况'
            except (ValueError, AttributeError):
                pass

    else:
        # ── 改进 B：BANT-Lite 多维信号叠加（外部邮件）──────────────────────
        # Need（测试/评价需求）
        NEED_SIGNALS = [
            '询价', '报价', '测试需求', '功效评价', '临床研究', '安全性评估',
            'spf', 'pa测试', 'pa test', 'colipa', '功效测试', '有效性',
            'test', 'assessment', 'evaluation', 'certification', 'accreditation',
            '需要测试', '需要评估', '需要评价', '人体功效', '临床测试',
        ]
        # Budget（预算/报价信号）
        BUDGET_SIGNALS = [
            '预算', '报价', '费用', '价格', 'price', 'cost', 'budget', 'quote',
            '多少钱', '费用如何', '收费', '报价单',
        ]
        # Authority（合规/大品牌/高决策层信号）
        AUTHORITY_SIGNALS = [
            'audit', 'compliance', 'colipa', 'iso', 'fda', '欧盟', '合规',
            'chanel', 'lvmh', 'loreal', '认证', '资质', '总监', 'director',
            '法规', 'regulatory', '注册',
        ]
        # Timeline（时间窗口信号）
        TIMELINE_SIGNALS = [
            'q1', 'q2', 'q3', 'q4', '上市', '发布', '截止', '本周', '月底',
            'launch', 'deadline', 'asap', '尽快', '尽早', '紧急', '时间紧',
            '年底', '季度', '下个月', 'next week', 'by end',
        ]

        need_hit = any(k in text for k in NEED_SIGNALS)
        budget_hit = bool(amounts) or any(k in text for k in BUDGET_SIGNALS)
        authority_hit = bool(brands) or any(k in text for k in AUTHORITY_SIGNALS)
        timeline_hit = bool(extracted_entities.get('deadlines')) or any(k in text for k in TIMELINE_SIGNALS)

        bant_score = sum([need_hit, budget_hit, authority_hit, timeline_hit])

        # ── 改进 C：商机类型分层 ────────────────────────────────────────────
        if signal_type == MailSignalType.COMPETITOR_PRESSURE:
            # 挽留商机：竞品对比时，守住客户 + 提供差异化方案
            risk_or_opportunity = f'挽留商机（retention）：客户正在对比竞品{("，品牌 "+brand_str) if brand_str else ""}，需及时提供差异化优势和针对性报价，防止客户流失'

        elif signal_type == MailSignalType.COMPLAINT:
            risk_or_opportunity = f'客户关系风险：{"项目 "+proj_str+" " if proj_str else ""}存在投诉，需优先处理以保护客户续签和口碑'

        elif signal_type == MailSignalType.INQUIRY:
            # 根据 BANT 维度数量判断商机价值等级
            if bant_score >= 3:
                # 高价值：Need + Budget + (Authority or Timeline)
                opp_type = 'compliance' if authority_hit and any(k in text for k in ['colipa', 'iso', 'fda', '认证', '合规', '欧盟', 'audit']) else 'new_client'
                type_label = '合规认证商机（compliance）' if opp_type == 'compliance' else '新客商机（new_client）'
                risk_or_opportunity = (
                    f'{type_label}：客户{("（"+brand_str+"）") if brand_str else ""}有明确测试需求'
                    f'{"、预算信号" if budget_hit else ""}'
                    f'{"、合规认证需求" if authority_hit else ""}'
                    f'{"、明确时间窗口" if timeline_hit else ""}，综合评级高，建议优先跟进'
                )
            elif bant_score >= 2:
                risk_or_opportunity = f'新客商机（new_client）：{"品牌 "+brand_str+" " if brand_str else ""}询价意图明确，建议及时回复报价并了解测试周期'
            elif need_hit:
                risk_or_opportunity = '潜在商机：客户有测试需求，建议进一步了解预算和时间节点'

        elif signal_type == MailSignalType.PROJECT_FOLLOWUP:
            # 扩量商机：现有项目中的扩大合作信号
            upsell_signals = ['增加', '扩大', '新增', '额外', 'additional', 'add', 'extend', '增补']
            if any(k in text for k in upsell_signals):
                risk_or_opportunity = f'扩量商机（upsell）：{"项目 "+proj_str+" " if proj_str else ""}客户有扩大测试范围或新增项目的意向'
            elif any(k in text for k in ['pilot', 'study', 'deep', '动态纹', '招募', '受试者']):
                risk_or_opportunity = f'质控要点：{"项目 "+proj_str+" " if proj_str else ""}专业测试项目执行中，需确保方案合规和数据质量'

        # 金额兜底：高金额邮件都应标注
        if not risk_or_opportunity and amounts:
            try:
                max_amount = max(float(a.replace(',', '').replace('，', '')) for a in amounts)
                if max_amount >= 10:
                    risk_or_opportunity = f'商机：{"项目 "+proj_str+" " if proj_str else ""}涉及金额 {max_amount:.0f}万，建议及时跟进并确认合同节点'
            except (ValueError, AttributeError):
                pass

        # 风险兜底：高优先级风险关键词
        if not risk_or_opportunity:
            RISK_FALLBACK = [
                (['超支', '赔偿', '法律', '诉讼', '监管'], '风险：邮件包含严重风险信号，建议立即处理并通知相关负责人'),
                (['延误', '换供应商', '换合作方', '重新评估'], '风险：客户满意度或合作关系存在风险，需及时响应'),
                (['数据存疑', '审计发现', '不合格', '检测问题'], '质量风险：测试结果或数据存在争议，需调查并回应客户'),
            ]
            for keywords, risk_desc in RISK_FALLBACK:
                if any(k in text for k in keywords):
                    risk_or_opportunity = risk_desc
                    break

    return {
        'key_intent': key_intent,
        'risk_or_opportunity': risk_or_opportunity,
        # suggested_actions 由 suggest_concrete_actions 填入
        'suggested_actions': [],
    }


def suggest_concrete_actions(
    signal_type: str,
    subject: str,
    body_text: str,
    extracted_entities: dict,
) -> list:
    """
    Phase 1 具体化行动建议：基于分类和实体生成中文可执行建议（2-4 条）。

    评测改进（2026-03-15）：系统此前只返回通用任务键（如 research_context_sync），
    Kimi 给出具体行动（如"确认审计日期""准备 SPF 测试程序文件"）。
    本函数用模板+实体填充实现同等具体度。
    """
    text = f'{subject}\n{body_text}'.lower()
    project_codes = extracted_entities.get('project_codes', [])
    brands = extracted_entities.get('brands', [])
    amounts = extracted_entities.get('amounts', [])
    deadlines = extracted_entities.get('deadlines', [])

    proj_str = project_codes[0] if project_codes else ''
    brand_str = brands[0].upper() if brands else ''
    amount_str = amounts[0] if amounts else ''
    deadline_str = f'，截止 {deadlines[0]}' if deadlines else ''

    actions: list = []

    if signal_type == MailSignalType.INQUIRY:
        if brand_str:
            actions.append(f'回复 {brand_str} 的测试服务询价')
        else:
            actions.append('准备报价方案并回复客户询价')
        actions.append(f'提供测试周期和交付说明{deadline_str}')
        if any(k in text for k in ['colipa', 'iso', '资质', 'certification', 'accreditation']):
            actions.append('准备资质认证文件和证明材料')
        if any(k in text for k in ['欧洲', '欧盟', 'eu', 'europe', 'dossier']):
            actions.append('了解欧盟合规要求并确认测试方法')

    elif signal_type == MailSignalType.PROJECT_FOLLOWUP:
        if proj_str:
            actions.append(f'查看 {proj_str} 项目最新执行状态')
            actions.append(f'确认 {proj_str} 下一步节点和排期安排')
        else:
            actions.append('核查项目进展并更新执行计划')
        if any(k in text for k in ['超支', '预算', '成本']):
            actions.append(f'评估预算影响{(" (金额 "+amount_str+")") if amount_str else ""}并更新财务记录')
        if any(k in text for k in ['招募', '受试者', '筛选']):
            actions.append('跟进受试者招募进展，必要时调整招募策略')
        if any(k in text for k in ['签字', '培训', '职责']):
            actions.append('协调相关人员完成签字和培训要求')

    elif signal_type == MailSignalType.COMPETITOR_PRESSURE:
        actions.append('重新评估现有方案的竞争力')
        actions.append('准备针对性的差异化优势说明和报价')
        actions.append('联系客户了解竞品具体优势并针对性回应')

    elif signal_type == MailSignalType.COMPLAINT:
        actions.append('立即回复客户，确认已收到并正在处理')
        actions.append('内部核查问题根因并制定解决方案')
        if any(k in text for k in ['法律', '法务', '赔偿', 'legal']):
            actions.append('通知法务团队评估法律风险')

    elif signal_type == MailSignalType.INTERNAL_ADMIN:
        if any(k in text for k in ['入职', '聘用', '新员工']):
            actions.append('准备新员工入职资料和办公设备')
            actions.append('安排入职培训和工位安排')
            actions.append('通知相关部门做好接待准备')
        elif any(k in text for k in ['预算', '决算', '易快报', '开票']):
            actions.append(f'处理{"项目 "+proj_str+" " if proj_str else ""}预算/报销审批')
            actions.append('更新财务系统记录')
            if amount_str:
                actions.append(f'核实金额 {amount_str} 的合理性并留档')
        elif any(k in text for k in ['排期', '立项', '测试执行']):
            actions.append(f'运营中心受理 {proj_str if proj_str else "项目"} 测试执行排期')
            actions.append('确认执行订单并安排相关资源')
            if deadline_str:
                actions.append(f'确认执行时间节点{deadline_str}')
        elif any(k in text for k in ['签字', '职责']):
            actions.append('联系相关医生完成签字确认')
            actions.append('确保未签字人员完成培训')
        elif any(k in text for k in ['周进度', '月度汇报', '周期', '线索', '商机', '赢单']):
            actions.append('查看本周/月业绩达成详情')
            actions.append('评估商机和预订单的跟进优先级')
            actions.append('与团队同步本周销售进展和目标差距')
        elif any(k in text for k in ['邀请加入', '研究项目', '登录账号', '研究中心', 'edc']):
            actions.append('确认参与研究项目的角色和职责')
            actions.append('登录 EDC 系统并完成必要的设置')
            actions.append('与项目负责人确认工作安排')
        else:
            actions.append('按通知要求完成相应行政手续')
            actions.append('确认是否需要回复或进一步行动')

    else:
        actions.append('阅读邮件内容并确认是否需要回复或跟进')

    return actions[:4]


def _build_extracted_intents(
    signal_type: str,
    subject: str,
    body_text: str,
    extracted_entities: dict,
) -> list:
    """
    组合意图理解和具体化建议，写入 extracted_intents 字段。
    结构：[{key_intent, risk_or_opportunity, suggested_actions}]
    """
    intent_data = _extract_intent_and_risk(signal_type, subject, body_text, extracted_entities)
    intent_data['suggested_actions'] = suggest_concrete_actions(
        signal_type, subject, body_text, extracted_entities
    )
    return [intent_data]


def _upsert_link(
    event: MailSignalEvent,
    *,
    link_type: str,
    target_id: int,
    match_method: str,
    match_score: int,
    is_primary: bool,
    confirmed: bool = False,
    note: str = '',
) -> None:
    if is_primary:
        MailSignalLink.objects.filter(
            mail_signal_event_id=event.id,
            link_type=link_type,
            is_primary=True,
        ).exclude(target_id=target_id).update(is_primary=False)

    MailSignalLink.objects.update_or_create(
        mail_signal_event_id=event.id,
        link_type=link_type,
        target_id=target_id,
        defaults={
            'match_method': match_method,
            'match_score': match_score,
            'is_primary': is_primary,
            'confirmed': confirmed,
            'note': note,
        },
    )


def _match_protocol_candidates(event: MailSignalEvent, text: str) -> None:
    text_lower = text.lower()
    protocol_qs = Protocol.objects.filter(is_deleted=False)

    primary_client_link = MailSignalLink.objects.filter(
        mail_signal_event_id=event.id,
        link_type=MailSignalLinkType.CLIENT,
        is_primary=True,
    ).order_by('-match_score', 'id').first()
    if primary_client_link:
        protocol_qs = protocol_qs.filter(sponsor_id=primary_client_link.target_id)

    scored: list[tuple[int, int]] = []
    for protocol in protocol_qs[:50]:
        score = 0
        if protocol.code and protocol.code.lower() in text_lower:
            score += 30
        if protocol.title and protocol.title.lower() in text_lower:
            score += 45
        if primary_client_link and protocol.sponsor_id == primary_client_link.target_id:
            score += 20
        if score > 0:
            scored.append((protocol.id, score))

    scored.sort(key=lambda item: item[1], reverse=True)
    for index, (protocol_id, score) in enumerate(scored[:3]):
        _upsert_link(
            event,
            link_type=MailSignalLinkType.PROTOCOL,
            target_id=protocol_id,
            match_method=MailSignalMatchMethod.SIGNATURE if score >= 45 else MailSignalMatchMethod.THREAD,
            match_score=score,
            is_primary=(index == 0),
            note='按协议编号/标题及客户上下文匹配项目',
        )


def _sync_candidate_links(event: MailSignalEvent) -> None:
    sender_email = (event.sender_email or '').lower()
    sender_domain = event.sender_domain or ''

    contact = ClientContact.objects.filter(
        email__iexact=sender_email,
        is_deleted=False,
    ).select_related('client').first() if sender_email else None
    if contact:
        _upsert_link(
            event,
            link_type=MailSignalLinkType.CONTACT,
            target_id=contact.id,
            match_method=MailSignalMatchMethod.EXACT_EMAIL,
            match_score=100,
            is_primary=True,
            note='按邮箱精确匹配联系人',
        )
        _upsert_link(
            event,
            link_type=MailSignalLinkType.CLIENT,
            target_id=contact.client_id,
            match_method=MailSignalMatchMethod.EXACT_EMAIL,
            match_score=95,
            is_primary=True,
            note='由联系人反推客户',
        )
    elif sender_domain:
        domain_clients = Client.objects.filter(
            is_deleted=False,
            contact_email__iendswith=f'@{sender_domain}',
        ).order_by('-update_time')[:3]
        for idx, client in enumerate(domain_clients):
            _upsert_link(
                event,
                link_type=MailSignalLinkType.CLIENT,
                target_id=client.id,
                match_method=MailSignalMatchMethod.DOMAIN,
                match_score=80 - idx * 5,
                is_primary=(idx == 0),
                note='按联系邮箱域名匹配客户',
            )

    _match_protocol_candidates(event, f'{event.subject}\n{event.body_text}')

    if event.thread_id:
        snapshot = MailThreadSnapshot.objects.filter(
            thread_id=event.thread_id,
            account_id=event.account_id,
        ).first()
        if snapshot:
            if snapshot.primary_client_id:
                _upsert_link(
                    event,
                    link_type=MailSignalLinkType.CLIENT,
                    target_id=snapshot.primary_client_id,
                    match_method=MailSignalMatchMethod.THREAD,
                    match_score=75,
                    is_primary=not MailSignalLink.objects.filter(
                        mail_signal_event_id=event.id,
                        link_type=MailSignalLinkType.CLIENT,
                        is_primary=True,
                    ).exists(),
                    note='按历史线程匹配客户',
                )
            if snapshot.primary_protocol_id:
                _upsert_link(
                    event,
                    link_type=MailSignalLinkType.PROTOCOL,
                    target_id=snapshot.primary_protocol_id,
                    match_method=MailSignalMatchMethod.THREAD,
                    match_score=78,
                    is_primary=True,
                    note='按历史线程匹配项目',
                )

    primary_client_link = MailSignalLink.objects.filter(
        mail_signal_event_id=event.id,
        link_type=MailSignalLinkType.CLIENT,
        is_primary=True,
    ).order_by('-match_score', 'id').first()

    MailThreadSnapshot.objects.update_or_create(
        thread_id=event.thread_id or f'mail:{event.source_mail_id}',
        account_id=event.account_id,
        defaults={
            'last_mail_signal_event_id': event.id,
            'primary_client_id': primary_client_link.target_id if primary_client_link else None,
            'context_summary': event.subject or event.body_preview[:120],
            'last_signal_type': event.mail_signal_type,
            'last_sentiment_score': event.sentiment_score,
        },
    )


def upsert_mail_signal_event_from_context(
    *,
    user_id: str,
    source_id: str,
    summary: str,
    raw_content: str,
    metadata: Optional[dict] = None,
    context_id: Optional[int] = None,
) -> Optional[MailSignalEvent]:
    metadata = metadata or {}
    account = _resolve_account_by_feishu_user(user_id)
    if not account:
        return None

    sender_email = _extract_sender_email(summary, metadata)
    sender_name = _extract_sender_name(summary, metadata, sender_email)
    sender_domain = sender_email.split('@', 1)[1] if '@' in sender_email else ''
    is_external, external_classification = _classify_external(sender_email, account)

    subject = metadata.get('subject') or summary or '(无主题)'
    if isinstance(subject, str) and subject.startswith('[') and '] ' in subject:
        subject = subject.split('] ', 1)[1]
    body_text = raw_content or ''

    # P2 改进：内部邮件早期过滤
    # 内部邮件（来自同域名发件人）不是客户价值创造系统的处理对象，
    # 跳过详细分类，标为 UNKNOWN 并记录 importance_score=20，
    # 仍写入 DB 以保留上下文可追溯性，但不进行关联匹配。
    if not is_external:
        signal_type = MailSignalType.UNKNOWN
        defaults = {
            'account_id': account.id,
            'source_context_id': context_id,
            'thread_id': metadata.get('thread_id', '') or '',
            'internet_message_id': metadata.get('internet_message_id', '') or '',
            'mailbox_owner_open_id': user_id,
            'sender_email': sender_email,
            'sender_name': sender_name,
            'sender_domain': sender_domain,
            'recipient_emails': metadata.get('recipient_emails', []) or [],
            'cc_emails': metadata.get('cc_emails', []) or [],
            'subject': subject or '(无主题)',
            'body_text': body_text,
            'body_preview': body_text[:300] if body_text else '',
            'sent_at': _parse_datetime(metadata.get('date', '')),
            'received_at': _parse_datetime(metadata.get('date', '')),
            'is_external': False,
            'external_classification': external_classification,
            'mail_signal_type': signal_type,
            'importance_score': 20,  # 内部邮件固定低优先级
            'status': MailSignalStatus.IGNORED,  # 直接置为 ignored，不进入业务流
            'raw_payload': metadata,
            'extracted_people': [],
            'attachment_count': len(metadata.get('attachments', []) or []),
        }
        event, _ = MailSignalEvent.objects.update_or_create(
            source_mail_id=source_id or f'{user_id}:{subject}',
            defaults=defaults,
        )
        return event

    signal_type = _classify_signal_type(subject or '', body_text)

    # P3 改进：unknown 邮件 AI 辅助分类（可选，通过 MAIL_SIGNAL_AI_CLASSIFY_ENABLED=1 开启）
    if signal_type == MailSignalType.UNKNOWN:
        try:
            from .mail_signal_ai_classifier import ai_classify_unknown_mail
            ai_type = ai_classify_unknown_mail(subject or '', body_text, sender_email)
            if ai_type != 'unknown':
                signal_type = ai_type
        except Exception:
            pass  # AI 分类失败不影响主流程
    # P0-2 改进：internal_admin 邮件快速过滤（不进入客户价值创造业务流）
    if signal_type == MailSignalType.INTERNAL_ADMIN:
        defaults_internal = {
            'account_id': account.id,
            'source_context_id': context_id,
            'thread_id': metadata.get('thread_id', '') or '',
            'internet_message_id': metadata.get('internet_message_id', '') or '',
            'mailbox_owner_open_id': user_id,
            'sender_email': sender_email,
            'sender_name': sender_name,
            'sender_domain': sender_domain,
            'recipient_emails': metadata.get('recipient_emails', []) or [],
            'cc_emails': metadata.get('cc_emails', []) or [],
            'subject': subject or '(无主题)',
            'body_text': body_text,
            'body_preview': body_text[:300] if body_text else '',
            'sent_at': _parse_datetime(metadata.get('date', '')),
            'received_at': _parse_datetime(metadata.get('date', '')),
            'is_external': is_external,
            'external_classification': external_classification,
            'mail_signal_type': signal_type,
            'importance_score': 20,  # 内部行政邮件固定低优先级
            'status': MailSignalStatus.IGNORED,  # 直接置为 ignored
            'raw_payload': metadata,
            'extracted_people': [],
            'attachment_count': len(metadata.get('attachments', []) or []),
        }
        event, _ = MailSignalEvent.objects.update_or_create(
            source_mail_id=source_id or f'{user_id}:{subject}',
            defaults=defaults_internal,
        )
        return event

    # P0-3/P1-1/P1-2: 业务价值评估 + 实体提取（外部邮件才计算）
    business_value, urgency_level, score_boost = _assess_business_value_and_urgency(
        subject or '', body_text, signal_type, is_external,
    )
    key_entities = _extract_key_entities(subject or '', body_text)

    base_importance = _importance_score(signal_type, is_external)
    final_importance = min(100, base_importance + score_boost)

    # P1+改进2/3: 意图理解 + 具体化行动建议
    extracted_intents_data = _build_extracted_intents(
        signal_type, subject or '', body_text, key_entities,
    )

    defaults = {
        'account_id': account.id,
        'source_context_id': context_id,
        'thread_id': metadata.get('thread_id', '') or '',
        'internet_message_id': metadata.get('internet_message_id', '') or '',
        'mailbox_owner_open_id': user_id,
        'sender_email': sender_email,
        'sender_name': sender_name,
        'sender_domain': sender_domain,
        'recipient_emails': metadata.get('recipient_emails', []) or [],
        'cc_emails': metadata.get('cc_emails', []) or [],
        'subject': subject or '(无主题)',
        'body_text': body_text,
        'body_preview': body_text[:300] if body_text else '',
        'sent_at': _parse_datetime(metadata.get('date', '')),
        'received_at': _parse_datetime(metadata.get('date', '')),
        'is_external': is_external,
        'external_classification': external_classification,
        'mail_signal_type': signal_type,
        'importance_score': final_importance,
        'business_value': business_value,
        'urgency_level': urgency_level,
        'status': MailSignalStatus.PARSED,
        'raw_payload': metadata,
        'extracted_people': [{'name': sender_name, 'email': sender_email}] if sender_email or sender_name else [],
        'extracted_entities': key_entities,  # 项目编号、金额、截止日期等
        'extracted_intents': extracted_intents_data,  # 意图理解 + 具体化建议
        'attachment_count': len(metadata.get('attachments', []) or []),
    }

    event, _ = MailSignalEvent.objects.update_or_create(
        source_mail_id=source_id or f'{user_id}:{subject}',
        defaults=defaults,
    )
    _sync_candidate_links(event)
    if MailSignalLink.objects.filter(mail_signal_event_id=event.id).exists() and event.status == MailSignalStatus.PARSED:
        event.status = MailSignalStatus.LINKED
        event.save(update_fields=['status', 'updated_at'])
    return event
