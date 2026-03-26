"""
全量采集时的「明显个人/噪音」过滤

原则：能采尽采，避免知识积淀在飞书；仅过滤明显属于个人的信息，
如广告、银行对账单、个人注册/账户/验证码类。其余一律积淀到本地。

- 采用拒绝列表：仅当明确命中「个人/噪音」规则时才丢弃，存疑则保留。
- 规则按数据源配置，便于扩展与审计。
"""
import logging
import re
from typing import Dict, List

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 邮件：明显个人/广告/对账单/账户类
# ---------------------------------------------------------------------------

# 发件人域名或地址片段：常见广告/系统/银行通知（小写匹配）
MAIL_SENDER_DENY_PATTERNS = [
    r'noreply@',
    r'no-reply@',
    r'mailer-daemon@',
    r'notify@',
    r'notification@',
    r'@.*\.bank\b',           # xx@*.bank
    r'@.*statement\.',       # 对账单发件
    r'@.*billing\.',
    r'newsletter@',
    r'marketing@',
    r'promo@',
    r'ad@',
    r'ads@',
]

# 主题/正文关键词：命中任一即视为「明显个人」可过滤（短语优先，减少误伤业务邮件）
MAIL_CONTENT_DENY_PHRASES = [
    # 验证码 / 账户安全
    '验证码',
    '动态密码',
    '短信验证码',
    '邮箱验证码',
    'OTP',
    '验证码为',
    '激活账户',
    '激活您的',
    '重置密码',
    '找回密码',
    '修改密码',
    '账户安全提醒',
    '登录验证',
    '注册验证',
    '注册验证码',
    '注册成功',
    '账号激活',
    # 对账单 / 账单（明确个人财务）
    '银行对账单',
    '信用卡对账单',
    '电子对账单',
    '月度对账单',
    '账户对账单',
    '个人对账单',
    # 广告 / 营销（典型用语）
    '退订',
    '取消订阅',
    '点击领取',
    '限时优惠',
    '促销活动',
    '广告推荐',
    '推荐给您',
    '您可能感兴趣',
    '猜你喜欢',
]

def _compile_patterns(patterns: List[str]):
    return [re.compile(p, re.I) for p in patterns]


_sender_deny_re = _compile_patterns(MAIL_SENDER_DENY_PATTERNS)


def _mail_sender_denied(sender: str, metadata: Dict) -> bool:
    """发件人命中拒绝规则（系统/广告/银行通知等）。"""
    if not sender:
        sender = (metadata.get('sender') or metadata.get('sender_email') or '')
    sender = (sender or '').lower().strip()
    if not sender:
        return False
    for r in _sender_deny_re:
        if r.search(sender):
            return True
    return False


def _mail_content_denied(subject: str, body: str) -> bool:
    """主题或正文命中「明显个人」短语。"""
    text = f'{subject or ""}\n{body or ""}'.lower()
    for phrase in MAIL_CONTENT_DENY_PHRASES:
        if phrase in text:
            return True
    return False


def is_mail_personal_noise(item: Dict) -> bool:
    """
    判定单条邮件是否为明显个人/噪音，应过滤不积淀。
    仅当明确命中拒绝规则时返回 True，存疑则返回 False（保留）。
    """
    meta = item.get('metadata') or {}
    subject = (item.get('summary') or '') + ' ' + (meta.get('subject') or '')
    body = (item.get('raw_content') or '')[:2000]

    # 1) 内容明确个人/广告/对账单/验证码
    if _mail_content_denied(subject, body):
        return True

    # 2) 发件人为系统/广告/银行通知类
    sender = meta.get('sender') or meta.get('sender_email') or ''
    if _mail_sender_denied(sender, meta):
        return True

    return False


# ---------------------------------------------------------------------------
# IM：明显广告/验证码/系统通知
# ---------------------------------------------------------------------------

IM_CONTENT_DENY_PHRASES = [
    '验证码',
    '动态密码',
    'OTP',
    '激活账户',
    '重置密码',
    '注册验证',
    '退订',
    '取消订阅',
    '点击领取',
    '限时优惠',
    '广告推荐',
]


def is_im_personal_noise(item: Dict) -> bool:
    """IM 消息是否为明显个人/噪音。保守：仅内容明确命中才过滤。"""
    content = (item.get('raw_content') or '') + ' ' + (item.get('summary') or '')
    if not content.strip():
        return False
    content = content.lower()
    for phrase in IM_CONTENT_DENY_PHRASES:
        if phrase in content:
            return True
    return False


# ---------------------------------------------------------------------------
# 日历 / 任务 / 审批 / 云文档：默认不按内容过滤，全部积淀
# ---------------------------------------------------------------------------

def is_calendar_personal_noise(item: Dict) -> bool:
    """日历事件：仅过滤极明显噪音（如标题纯验证码）。"""
    summary = (item.get('summary') or '') + (item.get('raw_content') or '')
    if not summary.strip():
        return False
    if '验证码' in summary and len(summary.strip()) < 50:
        return True
    return False


def is_task_personal_noise(item: Dict) -> bool:
    """任务：默认保留。"""
    return False


def is_approval_personal_noise(item: Dict) -> bool:
    """审批：默认保留（均为工作流）。"""
    return False


def is_doc_personal_noise(item: Dict) -> bool:
    """云文档：默认保留。"""
    return False


# ---------------------------------------------------------------------------
# 统一入口：按数据源过滤，只保留「非明显个人」项
# ---------------------------------------------------------------------------

_SOURCE_FILTERS = {
    'mail': is_mail_personal_noise,
    'im': is_im_personal_noise,
    'calendar': is_calendar_personal_noise,
    'task': is_task_personal_noise,
    'approval': is_approval_personal_noise,
    'doc': is_doc_personal_noise,
}


def filter_personal_noise(source_type: str, items: List[Dict]) -> List[Dict]:
    """
    过滤掉明显属于个人/噪音的条目，仅保留应积淀的内容。
    返回保留的 items 列表；被过滤的不写入 PersonalContext。
    """
    if not items:
        return items
    fn = _SOURCE_FILTERS.get(source_type)
    if not fn:
        return items
    kept = []
    for item in items:
        try:
            if fn(item):
                continue
            kept.append(item)
        except Exception as e:
            logger.debug('filter_personal_noise item error %s: %s', source_type, e)
            kept.append(item)
    dropped = len(items) - len(kept)
    if dropped > 0:
        logger.info('全量采集过滤个人/噪音: source=%s 保留=%d 过滤=%d', source_type, len(kept), dropped)
    return kept
