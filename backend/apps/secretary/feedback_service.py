"""
用户反馈处理服务

核心流程：
  飞书群消息 → classify_feedback()（规则 + 可选 LLM）
            → 创建 UserFeedback 记录
            → 若是 Bug/Feature → create_github_issue()
            → 若是 Question/Data → auto_reply_to_feishu()
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── 工作台关键词映射（快速路由，无需 LLM）──────────────────────────────────────
_WORKSTATION_KEYWORDS: dict[str, list[str]] = {
    'quality':        ['质量', '偏差', 'deviation', 'capa', 'sop', '合规', '审计'],
    'finance':        ['财务', '发票', '合同', '报价', '付款', '预算'],
    'research':       ['研究', '方案', '协议', 'protocol', '可行性', '项目'],
    'recruitment':    ['招募', '受试者', '筛查', '入组', '支付', '依从'],
    'execution':      ['执行', '工单', '排程', '访视', '样本', 'edc'],
    'lab-personnel':  ['人员台', '实验员', '排班', '资质', '工时'],
    'equipment':      ['设备', '仪器', '校准', '维护', '台账'],
    'material':       ['物料', '药品', '耗材', '库存', '效期', '出入库'],
    'facility':       ['设施', '场地', '实验室', '预约', '环境监控'],
    'ethics':         ['伦理', '合规培训', '审查', '申请'],
    'hr':             ['人事', '员工', '培训', '绩效', '招聘'],
    'crm':            ['客户', '商务', '合作', '客户台'],
    'secretary':      ['门户', '秘书台', '首页', '登录', '入口'],
    'governance':     ['权限', '角色', '账号', '治理台', '鹿鸣'],
}

# ── 分类关键词 ─────────────────────────────────────────────────────────────────
_BUG_KEYWORDS = ['报错', '错误', '失败', '崩溃', '打不开', '加载失败', '无法', '异常',
                 'error', 'fail', '500', '404', 'bug', '故障', '卡', '白屏']
_FEATURE_KEYWORDS = ['建议', '希望', '能不能', '可以增加', '如果能', '功能', '需要', '想要', '添加', '支持']
_QUESTION_KEYWORDS = ['怎么', '如何', '在哪', '是什么', '能不能找到', '不知道', '帮我', '请问', '?', '？']
_DATA_KEYWORDS = ['数据', '导入', '导出', '同步', '缺少', '不对', '错误数据', '丢失']


def classify_feedback(text: str) -> dict:
    """
    快速规则分类 + 可选 LLM 精确分类。

    Returns:
        {category, workstation, severity, summary}
    """
    lower = text.lower()

    # 1. 分类
    category = 'other'
    if any(kw in lower for kw in _BUG_KEYWORDS):
        category = 'bug'
    elif any(kw in lower for kw in _FEATURE_KEYWORDS):
        category = 'feature'
    elif any(kw in lower for kw in _QUESTION_KEYWORDS):
        category = 'question'
    elif any(kw in lower for kw in _DATA_KEYWORDS):
        category = 'data'

    # 2. 工作台识别
    workstation = ''
    for ws, keywords in _WORKSTATION_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            workstation = ws
            break

    # 3. 严重程度（bug 默认 high，其他 medium）
    severity = 'high' if category == 'bug' else 'medium'
    if any(kw in lower for kw in ['崩溃', '白屏', '打不开', '完全无法']):
        severity = 'high'

    # 4. 简短摘要（截取前 50 字）
    summary = text.strip()[:80].replace('\n', ' ')

    # 5. 可选：尝试调用 LLM 获得更精确的分类和摘要
    try:
        summary = _llm_summarize(text, category, workstation) or summary
    except Exception as e:
        logger.debug('LLM 反馈分类失败（使用规则结果）: %s', e)

    return {
        'category':    category,
        'workstation': workstation,
        'severity':    severity,
        'summary':     summary,
    }


def _llm_summarize(text: str, category: str, workstation: str) -> Optional[str]:
    """用 Qwen 生成简洁的反馈摘要（Issue 标题用）。"""
    from apps.agent_gateway.services import quick_chat
    prompt = (
        f'用户反馈如下：\n{text}\n\n'
        f'已初步分类为：{category}，涉及工作台：{workstation or "未知"}。\n'
        '请用一句话（20字以内）概括这条反馈的核心问题，直接输出，不要解释。'
    )
    result = quick_chat(prompt, max_tokens=50)
    if result and len(result.strip()) < 100:
        return result.strip()
    return None


def process_feedback_message(
    message_id: str,
    sender_open_id: str,
    sender_name: str,
    text: str,
) -> dict:
    """
    处理一条来自反馈群的飞书消息：
    1. 幂等检查（同一 message_id 不重复处理）
    2. AI 分类
    3. 根据分类决定行动（创建 Issue / 自动回复）
    4. 保存记录

    Returns:
        {'action': 'issue_created'|'auto_replied'|'ignored', 'detail': ...}
    """
    from .feedback_models import UserFeedback, FeedbackStatus
    from django.utils import timezone as tz

    # 幂等检查
    if UserFeedback.objects.filter(feishu_message_id=message_id).exists():
        logger.info('反馈消息已处理（幂等）: %s', message_id)
        return {'action': 'ignored', 'detail': 'duplicate'}

    # 跳过过短消息（可能是表情/回复等）
    if len(text.strip()) < 5:
        return {'action': 'ignored', 'detail': 'too_short'}

    # AI 分类
    classification = classify_feedback(text)

    feedback = UserFeedback(
        feishu_message_id=message_id,
        sender_open_id=sender_open_id,
        sender_name=sender_name,
        raw_text=text,
        category=classification['category'],
        workstation=classification['workstation'],
        severity=classification['severity'],
        ai_summary=classification['summary'],
    )

    result = {'action': 'pending', 'detail': classification}

    # 决策：Bug / Feature → 创建 GitHub Issue
    if classification['category'] in ('bug', 'feature', 'performance'):
        issue_result = _create_github_issue(feedback)
        if issue_result:
            feedback.status = FeedbackStatus.ISSUE_CREATED
            feedback.github_issue_url = issue_result.get('url', '')
            feedback.github_issue_number = issue_result.get('number')
            result = {'action': 'issue_created', 'detail': issue_result}
            # 在反馈群回复确认
            _reply_to_feishu_group(
                message_id=message_id,
                text=f'✅ 已记录为 GitHub Issue #{feedback.github_issue_number}，开发团队将跟进处理。\n{issue_result.get("url", "")}',
            )
        else:
            feedback.status = FeedbackStatus.PENDING

    # 决策：Question → 自动回复
    elif classification['category'] == 'question':
        reply = _generate_question_reply(text, classification['workstation'])
        if reply:
            _reply_to_feishu_group(message_id=message_id, text=reply)
            feedback.status = FeedbackStatus.AUTO_REPLIED
            feedback.auto_reply_text = reply
            result = {'action': 'auto_replied', 'detail': reply[:100]}

    # 决策：Data → 通知工作台负责人 + 创建 Issue
    elif classification['category'] == 'data':
        issue_result = _create_github_issue(feedback, label='data-issue')
        if issue_result:
            feedback.status = FeedbackStatus.ISSUE_CREATED
            feedback.github_issue_url = issue_result.get('url', '')
            feedback.github_issue_number = issue_result.get('number')
            _reply_to_feishu_group(
                message_id=message_id,
                text=f'📊 已记录数据问题为 Issue #{feedback.github_issue_number}，请等待跟进。',
            )
            result = {'action': 'issue_created', 'detail': issue_result}
        else:
            feedback.status = FeedbackStatus.PENDING

    feedback.processed_at = tz.now()
    feedback.save()

    logger.info(
        '用户反馈处理完成 [%s] category=%s ws=%s action=%s',
        message_id, classification['category'], classification['workstation'], result['action'],
    )
    return result


def _create_github_issue(feedback, label: str = '') -> Optional[dict]:
    """
    调用 GitHub REST API 创建 Issue。
    需要环境变量：GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME
    """
    import urllib.request
    import json

    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GITHUB_PAT', '')
    owner = os.environ.get('GITHUB_REPO_OWNER', 'china-norm-company')
    repo  = os.environ.get('GITHUB_REPO_NAME', 'cn_kis_v2.0')

    if not token:
        logger.warning('GITHUB_TOKEN 未配置，无法创建 Issue')
        return None

    # 构造 Issue 标题和正文
    ws_tag = f'[{feedback.workstation}] ' if feedback.workstation else ''
    cat_map = {'bug': '🐛 Bug', 'feature': '💡 功能建议', 'data': '📊 数据问题', 'performance': '⚡ 性能问题'}
    cat_label = cat_map.get(feedback.category, '❓ 其他')

    title = f'{ws_tag}{feedback.ai_summary or feedback.raw_text[:60]}'
    body = (
        f'## 来源\n用户反馈群 · 由子衿智能运营官自动创建\n\n'
        f'## 用户反馈原文\n> {feedback.raw_text}\n\n'
        f'## 自动分类\n'
        f'- **分类**：{cat_label}\n'
        f'- **涉及工作台**：{feedback.workstation or "未识别"}\n'
        f'- **严重程度**：{feedback.severity}\n'
        f'- **反馈人**：{feedback.sender_name or feedback.sender_open_id}\n\n'
        f'## 待确认\n- [ ] 已复现\n- [ ] 已分配负责人\n- [ ] 已修复'
    )

    # 确定 labels
    label_map = {
        'bug':         'bug',
        'feature':     'enhancement',
        'data':        'enhancement',
        'performance': 'bug',
    }
    labels = [label_map.get(feedback.category, 'enhancement')]
    if label:
        labels.append(label)

    payload = json.dumps({'title': title, 'body': body, 'labels': labels}).encode()

    req = urllib.request.Request(
        f'https://api.github.com/repos/{owner}/{repo}/issues',
        data=payload,
        headers={
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            logger.info('GitHub Issue 创建成功: #%s %s', data['number'], data['html_url'])
            return {'number': data['number'], 'url': data['html_url'], 'title': data['title']}
    except Exception as e:
        logger.error('创建 GitHub Issue 失败: %s', e)
        return None


def _generate_question_reply(text: str, workstation: str) -> Optional[str]:
    """为使用疑问生成自动回复（优先 LLM，降级为固定指引）。"""
    fallback_map = {
        'quality':      '质量台指引：登录系统 → 质量合规 → 偏差管理。如需帮助请联系质量台负责人。',
        'finance':      '财务台指引：登录系统 → 财务管理 → 合同/报价。如需帮助请联系财务台负责人。',
        'recruitment':  '招募台指引：登录系统 → 招募管理 → 受试者列表。如需帮助请联系招募台负责人。',
        'equipment':    '设备台指引：登录系统 → 设备管理 → 仪器台账。校准到期会自动发提醒。',
        'material':     '物料台指引：登录系统 → 物料管理 → 库存管理。支持扫码出入库。',
    }

    try:
        from apps.agent_gateway.services import quick_chat
        prompt = (
            f'用户在 CN KIS 系统反馈群提问：\n{text}\n\n'
            f'涉及工作台：{workstation or "未知"}。\n'
            '请用简洁友好的语气给出一个操作指引（2-3句话，不超过100字）。'
            '如果问题超出系统范围，说明需要联系负责人。'
        )
        reply = quick_chat(prompt, max_tokens=150)
        if reply and len(reply.strip()) > 10:
            return reply.strip()
    except Exception as e:
        logger.debug('LLM 回复生成失败: %s', e)

    return fallback_map.get(workstation, '感谢反馈！请联系系统管理员或查看飞书知识库获取帮助。')


def _reply_to_feishu_group(message_id: str, text: str) -> None:
    """在反馈群中回复消息。"""
    try:
        from libs.feishu_client import FeishuClient
        import json
        client = FeishuClient()
        client.reply_message(
            message_id=message_id,
            msg_type='text',
            content=json.dumps({'text': text}),
        )
    except Exception as e:
        logger.warning('飞书群回复失败: %s', e)


def get_feedback_summary_for_report(hours: int = 24) -> dict:
    """
    获取过去 N 小时的用户反馈汇总，供早晚报使用。

    Returns:
        {
          'total': int,
          'bugs': int,
          'features': int,
          'questions': int,
          'unresolved': int,
          'recent_items': [{'category', 'summary', 'workstation', 'github_issue_number'}]
        }
    """
    from .feedback_models import UserFeedback, FeedbackCategory, FeedbackStatus
    from django.utils import timezone as tz
    from datetime import timedelta

    since = tz.now() - timedelta(hours=hours)
    qs = UserFeedback.objects.filter(created_at__gte=since)

    return {
        'total':     qs.count(),
        'bugs':      qs.filter(category=FeedbackCategory.BUG).count(),
        'features':  qs.filter(category=FeedbackCategory.FEATURE).count(),
        'questions': qs.filter(category=FeedbackCategory.QUESTION).count(),
        'unresolved': qs.exclude(status__in=[
            FeedbackStatus.ISSUE_CREATED, FeedbackStatus.AUTO_REPLIED, FeedbackStatus.RESOLVED
        ]).count(),
        'recent_items': list(qs.order_by('-created_at').values(
            'category', 'ai_summary', 'workstation', 'github_issue_number', 'status', 'severity',
        )[:5]),
    }
