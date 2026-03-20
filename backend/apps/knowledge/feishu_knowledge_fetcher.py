"""
飞书碎片知识采集器

将飞书内部数据（IM 群聊、会议纪要、审批记录、云文档）
转化为可复用的结构化知识条目，写入知识库。

架构：
  飞书原始数据 → 双层分流
  ├── 个人上下文（PersonalContext）：原始信息，用于 AI 助手
  └── 共享知识（KnowledgeEntry）：提炼后的可复用内容

权限边界：
  - PII 字段（手机/身份证/完整姓名）必须脱敏
  - 商业敏感内容（价格/客户名）标记为内部，不入共享知识库
  - 群聊/审批中的敏感讨论不自动入库，进入 pending_review
"""
import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# PII 脱敏规则
_PII_PATTERNS = [
    # 中国手机号（11 位，1 开头）
    (re.compile(r'1[3-9]\d{9}'), '[手机号]'),
    # 身份证号（18 位，最后可为 X）
    (re.compile(r'\d{17}[\dXx]'), '[身份证]'),
    # 简单邮箱
    (re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'), '[邮箱]'),
]


def strip_pii(text: str) -> str:
    """对文本进行 PII 脱敏处理"""
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def is_likely_noise(text: str) -> bool:
    """
    判断消息是否为噪声（不值得入库）。
    简单规则：过短、纯表情、系统通知等。
    """
    text = text.strip()
    if len(text) < 15:
        return True
    # 仅包含表情符号（Unicode 表情范围）
    clean = re.sub(r'[\U0001F000-\U0001FFFF\u2600-\u27BF]', '', text).strip()
    if len(clean) < 10:
        return True
    return False


# ============================================================================
# 群聊知识沉淀
# ============================================================================

def harvest_chat_messages(
    group_ids: List[str],
    date_range_days: int = 1,
    account_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    拉取群聊消息，过滤噪声，聚类后沉淀为知识条目。

    参数：
        group_ids: 需要采集的飞书群组 ID 列表
        date_range_days: 拉取最近 N 天的消息
        account_id: 使用哪个账号的 token（需有群组访问权限）

    返回：
        {'harvested': N, 'skipped': M, 'errors': [...]}
    """
    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

    stats = {'harvested': 0, 'skipped': 0, 'errors': []}

    for group_id in group_ids:
        try:
            messages = _fetch_group_messages(group_id, date_range_days, account_id)
            if not messages:
                continue

            # 过滤噪声
            meaningful = [m for m in messages if not is_likely_noise(m.get('text', ''))]
            stats['skipped'] += len(messages) - len(meaningful)

            if not meaningful:
                continue

            # 话题聚类（简化版：按时间窗口 30 分钟为界）
            clusters = _cluster_by_time(meaningful, window_minutes=30)

            for cluster in clusters:
                combined_text = '\n'.join(
                    strip_pii(m.get('text', '')) for m in cluster if m.get('text')
                )
                if len(combined_text) < 30:
                    continue

                # 生成去重键
                source_key = 'chat:' + hashlib.sha1(
                    (group_id + combined_text[:200]).encode('utf-8')
                ).hexdigest()[:40]

                raw = RawKnowledgeInput(
                    title=f'[群聊] {_extract_topic(combined_text)[:100]}',
                    content=combined_text,
                    entry_type='lesson_learned',
                    source_type='feishu_chat',
                    source_key=source_key,
                    tags=['群聊沉淀', '飞书内部'],
                    namespace='feishu_internal',
                    properties={
                        'group_id': group_id,
                        'message_count': len(cluster),
                        'start_time': cluster[0].get('create_time', ''),
                        'end_time': cluster[-1].get('create_time', ''),
                    },
                )

                result = run_pipeline(raw)
                if result.success and result.entry_id:
                    stats['harvested'] += 1
                    logger.info('Chat knowledge harvested: entry #%s from group %s',
                                result.entry_id, group_id)
                else:
                    stats['skipped'] += 1

        except Exception as e:
            logger.error('Failed to harvest chat for group %s: %s', group_id, e)
            stats['errors'].append({'group_id': group_id, 'error': str(e)})

    return stats


def _fetch_group_messages(
    group_id: str,
    date_range_days: int,
    account_id: Optional[int],
) -> List[Dict[str, Any]]:
    """拉取飞书群组消息"""
    try:
        from libs.feishu_client import feishu_client

        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(days=date_range_days)

        messages = feishu_client.get_group_messages(
            group_id=group_id,
            start_time=int(start_time.timestamp()),
            end_time=int(end_time.timestamp()),
        )
        return messages or []
    except Exception as e:
        logger.warning('Failed to fetch messages for group %s: %s', group_id, e)
        return []


def _cluster_by_time(
    messages: List[Dict[str, Any]],
    window_minutes: int = 30,
) -> List[List[Dict[str, Any]]]:
    """
    按时间窗口聚类消息。
    两条消息时间差 > window_minutes 分钟则分割为不同话题。
    """
    if not messages:
        return []

    clusters = []
    current_cluster = [messages[0]]

    for i in range(1, len(messages)):
        prev_time = _parse_timestamp(messages[i - 1].get('create_time', '0'))
        curr_time = _parse_timestamp(messages[i].get('create_time', '0'))

        if curr_time - prev_time > window_minutes * 60:
            clusters.append(current_cluster)
            current_cluster = [messages[i]]
        else:
            current_cluster.append(messages[i])

    if current_cluster:
        clusters.append(current_cluster)

    return clusters


def _parse_timestamp(ts: str) -> int:
    try:
        return int(ts)
    except (ValueError, TypeError):
        return 0


def _extract_topic(text: str) -> str:
    """从文本中提取主题（取第一句话）"""
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if len(line) >= 10:
            return line[:80]
    return text[:80]


# ============================================================================
# 会议纪要知识提炼
# ============================================================================

def extract_meeting_knowledge(
    meeting_id: str,
    minutes_text: str = '',
    meeting_title: str = '',
    attendees: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    从会议纪要提炼知识条目。

    参数：
        meeting_id: 飞书会议 ID
        minutes_text: 会议纪要全文（可从飞书文档获取）
        meeting_title: 会议标题
        attendees: 参会人列表

    返回：
        {'harvested': N, 'entry_ids': [...], 'categories': {...}}
    """
    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

    if not minutes_text or len(minutes_text) < 50:
        logger.info('Meeting %s: minutes too short to extract knowledge', meeting_id)
        return {'harvested': 0, 'entry_ids': [], 'categories': {}}

    # AI 抽取关键内容（降级：基于关键词规则）
    extracted = _extract_meeting_sections(minutes_text)

    stats = {'harvested': 0, 'entry_ids': [], 'categories': {}}

    for section_type, items in extracted.items():
        for item in items:
            if len(item) < 20:
                continue

            source_key = 'meeting:' + hashlib.sha1(
                (meeting_id + section_type + item[:100]).encode('utf-8')
            ).hexdigest()[:40]

            raw = RawKnowledgeInput(
                title=f'[会议] {section_type}：{item[:80]}',
                content=strip_pii(item),
                entry_type='meeting_decision' if section_type == '决策' else 'lesson_learned',
                source_type='feishu_meeting',
                source_key=source_key,
                tags=['会议纪要', section_type, '飞书内部'],
                namespace='feishu_internal',
                properties={
                    'meeting_id': meeting_id,
                    'meeting_title': meeting_title,
                    'section_type': section_type,
                    'attendee_count': len(attendees or []),
                },
            )

            result = run_pipeline(raw)
            if result.success and result.entry_id:
                stats['harvested'] += 1
                stats['entry_ids'].append(result.entry_id)
                stats['categories'][section_type] = stats['categories'].get(section_type, 0) + 1

    return stats


def _extract_meeting_sections(minutes_text: str) -> Dict[str, List[str]]:
    """
    基于规则从会议纪要中提取结构化内容。
    生产方案：调用 LLM 做结构化抽取。
    """
    sections: Dict[str, List[str]] = {
        '决策': [],
        '行动项': [],
        '风险': [],
        '经验': [],
    }

    decision_keywords = ['决定', '确认', '通过', '批准', '同意', '决议']
    action_keywords = ['负责', '完成时间', '截止', '@', '跟进', '待办']
    risk_keywords = ['风险', '问题', '挑战', '注意', '警告', '需关注']

    for line in minutes_text.split('\n'):
        line = line.strip()
        if len(line) < 15:
            continue

        if any(kw in line for kw in decision_keywords):
            sections['决策'].append(line)
        elif any(kw in line for kw in action_keywords):
            sections['行动项'].append(line)
        elif any(kw in line for kw in risk_keywords):
            sections['风险'].append(line)

    return sections


# ============================================================================
# 审批知识提取
# ============================================================================

def extract_approval_knowledge(
    approval_code: str,
    instance_code: str,
    approval_type: str,
    form_content: dict,
    approved_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    从已通过的审批中提取知识。

    参数：
        approval_code: 审批流程 code
        instance_code: 审批实例 code
        approval_type: 审批类型（deviation/capa/purchase/other）
        form_content: 审批表单内容（dict）
        approved_by: 审批通过人

    返回：
        {'harvested': N, 'entry_id': id, 'entities_created': M}
    """
    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

    # 根据审批类型选择抽取模板
    extractor = {
        'deviation': _extract_deviation_knowledge,
        'capa': _extract_capa_knowledge,
        'purchase': _extract_purchase_knowledge,
    }.get(approval_type, _extract_generic_approval_knowledge)

    knowledge_item = extractor(form_content)
    if not knowledge_item:
        return {'harvested': 0, 'entry_id': None, 'entities_created': 0}

    source_key = f'approval:{instance_code}'

    raw = RawKnowledgeInput(
        title=knowledge_item['title'],
        content=strip_pii(knowledge_item['content']),
        entry_type='lesson_learned',
        source_type='feishu_approval',
        source_key=source_key,
        tags=knowledge_item.get('tags', ['审批知识', approval_type]),
        namespace='feishu_internal',
        properties={
            'approval_code': approval_code,
            'instance_code': instance_code,
            'approval_type': approval_type,
            'approved_by': approved_by or '',
        },
    )

    result = run_pipeline(raw)

    if result.success and result.entry_id:
        logger.info('Approval knowledge extracted: entry #%s from %s', result.entry_id, instance_code)
        return {'harvested': 1, 'entry_id': result.entry_id, 'entities_created': 0}

    return {'harvested': 0, 'entry_id': None, 'entities_created': 0}


def _extract_deviation_knowledge(form: dict) -> Optional[Dict[str, Any]]:
    root_cause = form.get('root_cause', form.get('根本原因', ''))
    prevention = form.get('prevention', form.get('预防措施', ''))
    impact = form.get('impact', form.get('影响范围', ''))
    deviation_type = form.get('deviation_type', form.get('偏差类型', '未分类'))

    if not root_cause and not prevention:
        return None

    content_parts = []
    if deviation_type:
        content_parts.append(f'偏差类型：{deviation_type}')
    if root_cause:
        content_parts.append(f'根本原因：{root_cause}')
    if prevention:
        content_parts.append(f'预防措施：{prevention}')
    if impact:
        content_parts.append(f'影响范围：{impact}')

    return {
        'title': f'[偏差经验] {deviation_type}：{root_cause[:50]}',
        'content': '\n'.join(content_parts),
        'tags': ['偏差', '根本原因分析', '预防措施', deviation_type],
    }


def _extract_capa_knowledge(form: dict) -> Optional[Dict[str, Any]]:
    corrective = form.get('corrective_action', form.get('纠正措施', ''))
    preventive = form.get('preventive_action', form.get('预防措施', ''))
    effectiveness = form.get('effectiveness', form.get('效果验证', ''))
    capa_title = form.get('title', form.get('标题', 'CAPA'))

    if not corrective and not preventive:
        return None

    content_parts = [f'CAPA 标题：{capa_title}']
    if corrective:
        content_parts.append(f'纠正措施：{corrective}')
    if preventive:
        content_parts.append(f'预防措施：{preventive}')
    if effectiveness:
        content_parts.append(f'效果验证：{effectiveness}')

    return {
        'title': f'[CAPA经验] {capa_title[:80]}',
        'content': '\n'.join(content_parts),
        'tags': ['CAPA', '纠正措施', '预防措施'],
    }


def _extract_purchase_knowledge(form: dict) -> Optional[Dict[str, Any]]:
    supplier = form.get('supplier', form.get('供应商', ''))
    product = form.get('product', form.get('产品名称', ''))
    reason = form.get('selection_reason', form.get('选择理由', ''))

    if not supplier:
        return None

    content_parts = []
    if supplier:
        content_parts.append(f'供应商：{supplier}')
    if product:
        content_parts.append(f'产品型号：{product}')
    if reason:
        content_parts.append(f'选择理由：{reason}')

    return {
        'title': f'[采购经验] {supplier} - {product[:50]}',
        'content': '\n'.join(content_parts),
        'tags': ['采购', '供应商', product],
    }


def _extract_generic_approval_knowledge(form: dict) -> Optional[Dict[str, Any]]:
    if not form:
        return None
    content = '\n'.join(f'{k}：{v}' for k, v in form.items() if v and isinstance(v, str))
    if len(content) < 30:
        return None
    return {
        'title': f'[审批] {list(form.values())[0][:50] if form else "审批记录"}',
        'content': content,
        'tags': ['审批记录'],
    }


# ============================================================================
# 事件处理器注册（供 feishu_sync/event_handler.py 调用）
# ============================================================================

def handle_meeting_ended_event(event_data: dict) -> dict:
    """
    处理飞书会议结束事件 meeting.meeting.ended_v1

    当会议结束后，自动触发知识提炼。
    """
    try:
        from celery import current_app

        meeting_id = event_data.get('meeting_id', event_data.get('id', ''))
        meeting_topic = event_data.get('topic', '')
        attendees = event_data.get('attendees', [])

        if not meeting_id:
            return {'code': 200, 'msg': 'no meeting_id'}

        # 异步触发，延迟 5 分钟（等飞书生成纪要）
        current_app.send_task(
            'apps.knowledge.tasks.harvest_meeting_knowledge',
            kwargs={
                'meeting_id': meeting_id,
                'meeting_title': meeting_topic,
                'attendees': [a.get('user_id', '') for a in attendees],
            },
            countdown=300,
        )

        logger.info('Queued meeting knowledge harvest for meeting %s', meeting_id)
        return {'code': 200, 'msg': 'queued'}

    except Exception as e:
        logger.error('Failed to queue meeting knowledge harvest: %s', e)
        return {'code': 200, 'msg': 'ok'}  # 返回 200 避免飞书重试


def handle_approval_passed_event(event_data: dict) -> dict:
    """
    处理飞书审批通过事件 approval.approval.updated

    当审批通过时，触发知识提取。
    """
    try:
        status = event_data.get('status', '')
        if status != 'APPROVED':
            return {'code': 200, 'msg': 'not approved, skipped'}

        from celery import current_app

        instance_code = event_data.get('instance_code', '')
        approval_code = event_data.get('approval_code', '')

        if not instance_code:
            return {'code': 200, 'msg': 'no instance_code'}

        current_app.send_task(
            'apps.knowledge.tasks.harvest_approval_knowledge',
            kwargs={
                'instance_code': instance_code,
                'approval_code': approval_code,
                'event_data': event_data,
            },
            countdown=30,
        )

        return {'code': 200, 'msg': 'queued'}
    except Exception as e:
        logger.error('Failed to queue approval knowledge harvest: %s', e)
        return {'code': 200, 'msg': 'ok'}
