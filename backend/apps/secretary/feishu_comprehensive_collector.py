"""
飞书全量数据采集通用模块（Feishu Comprehensive Collector）

═══════════════════════════════════════════════════════════════════
  ★ 凡涉及飞书信息采集的需求，统一通过本模块实现 ★
═══════════════════════════════════════════════════════════════════

设计原则：
1. 遍历所有已授权用户，全量采集飞书上的散落信息
2. 覆盖 6 大数据源：邮件、IM群聊、日历、任务、审批、云文档
3. 每次采集的数据自动沉淀到知识库（KnowledgeEntry），不做重复采集
4. 采集结果同时写入 PersonalContext（兼容现有秘书台总览）
5. 支持增量采集（基于上次采集时间戳）

数据源覆盖：
- mail: 邮件收件箱（人员沟通、方案文件、审批结果）
- im: IM 群聊消息（项目讨论、问题协调、决策过程）
- calendar: 日历事件（访视安排、培训计划、会议）
- task: 飞书任务（工单、待办、跟进）
- approval: 审批实例（资源需求、偏差、合同）
- doc: 飞书云文档（SOP、方案、培训材料、知识沉淀）

使用方式：
    from apps.secretary.feishu_comprehensive_collector import FeishuComprehensiveCollector

    collector = FeishuComprehensiveCollector()

    # 采集所有用户的所有数据源
    result = collector.collect_all_users()

    # 采集指定用户
    result = collector.collect_user(account_id=1)

    # 仅采集指定数据源
    result = collector.collect_user(account_id=1, sources=['im', 'doc'])

    # 采集项目相关群聊
    result = collector.collect_project_chats(protocol_id=1)

    # 采集结果自动入知识库
    collector.deposit_to_knowledge(result)
"""
import json
import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.utils import timezone

logger = logging.getLogger(__name__)

ALL_SOURCES = ['mail', 'im', 'calendar', 'task', 'approval', 'doc']

DEFAULT_LOOKBACK_DAYS = int(os.getenv('FEISHU_COLLECT_LOOKBACK_DAYS', '60'))
DEFAULT_IM_MAX_CHATS = int(os.getenv('FEISHU_COLLECT_IM_MAX_CHATS', '30'))
DEFAULT_IM_MSG_PER_CHAT = int(os.getenv('FEISHU_COLLECT_IM_MSG_PER_CHAT', '50'))
DEFAULT_MAIL_LIMIT = int(os.getenv('FEISHU_COLLECT_MAIL_LIMIT', '100'))
DEFAULT_INTER_USER_DELAY = float(os.getenv('FEISHU_COLLECT_DELAY', '1.0'))


@dataclass
class CollectedItem:
    """单条采集数据"""
    source_type: str
    source_id: str
    user_id: str
    summary: str
    raw_content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    collected_at: str = ''

    def __post_init__(self):
        if not self.collected_at:
            self.collected_at = timezone.now().isoformat()


@dataclass
class CollectionResult:
    """采集结果汇总"""
    user_id: str = ''
    account_name: str = ''
    counts: Dict[str, int] = field(default_factory=dict)
    items: List[CollectedItem] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    deposited_to_knowledge: int = 0

    @property
    def total(self) -> int:
        return sum(self.counts.values())


@dataclass
class BatchCollectionResult:
    """批量采集结果"""
    user_results: List[CollectionResult] = field(default_factory=list)
    total_items: int = 0
    total_deposited: int = 0
    total_errors: int = 0
    skipped_users: List[str] = field(default_factory=list)

    def add(self, result: CollectionResult):
        self.user_results.append(result)
        self.total_items += result.total
        self.total_deposited += result.deposited_to_knowledge
        self.total_errors += len(result.errors)


class FeishuComprehensiveCollector:
    """
    飞书全量数据采集器

    ★ 所有飞书信息采集需求的统一入口 ★

    功能：
    1. 遍历所有已授权用户，采集 6 大数据源
    2. 采集结果写入 PersonalContext（兼容现有链路）
    3. 采集结果自动沉淀到知识库（KnowledgeEntry）
    4. 支持增量采集（幂等，不重复）
    5. 提取关键角色和项目信号
    """

    def __init__(
        self,
        lookback_days: int = DEFAULT_LOOKBACK_DAYS,
        deposit_knowledge: bool = True,
        delay_between_users: float = DEFAULT_INTER_USER_DELAY,
    ):
        self.lookback_days = lookback_days
        self.deposit_knowledge = deposit_knowledge
        self.delay = delay_between_users
        self._cutoff_ts = int((timezone.now() - timedelta(days=lookback_days)).timestamp())

    # ========================================================================
    # 公开 API
    # ========================================================================

    def collect_all_users(
        self,
        sources: Optional[List[str]] = None,
        account_ids: Optional[List[int]] = None,
    ) -> BatchCollectionResult:
        """
        遍历所有有效飞书 Token 的用户，全量采集。

        Args:
            sources: 要采集的数据源列表（默认全部）
            account_ids: 仅采集指定账号（默认全部）
        """
        sources = sources or ALL_SOURCES
        accounts = self._get_target_accounts(account_ids)
        batch = BatchCollectionResult()

        logger.info('开始全量飞书采集: %d 用户, 数据源=%s, 回溯%d天',
                    len(accounts), sources, self.lookback_days)

        for i, account in enumerate(accounts, 1):
            logger.info('[%d/%d] 采集用户: %s (%s)',
                        i, len(accounts), account.display_name,
                        account.email or account.feishu_open_id[:20])
            try:
                result = self.collect_user(
                    account_id=account.id,
                    sources=sources,
                    _account=account,
                )
                batch.add(result)
            except Exception as e:
                logger.error('用户 %s 采集失败: %s', account.display_name, e)
                batch.skipped_users.append(f'{account.display_name}: {e}')

            if i < len(accounts) and self.delay > 0:
                time.sleep(self.delay)

        logger.info('全量采集完成: %d 条数据, %d 条入库, %d 错误',
                    batch.total_items, batch.total_deposited, batch.total_errors)
        return batch

    def collect_user(
        self,
        account_id: int,
        sources: Optional[List[str]] = None,
        _account=None,
    ) -> CollectionResult:
        """
        采集单个用户的飞书数据。

        Args:
            account_id: 用户账号 ID
            sources: 要采集的数据源（默认全部）
        """
        from apps.identity.models import Account
        from apps.secretary.feishu_fetcher import get_valid_user_token

        sources = sources or ALL_SOURCES
        account = _account or Account.objects.filter(id=account_id, is_deleted=False).first()
        if not account or not account.feishu_open_id:
            return CollectionResult(errors=['账号不存在或无飞书 open_id'])

        user_token = get_valid_user_token(account_id)
        result = CollectionResult(
            user_id=account.feishu_open_id,
            account_name=account.display_name,
        )

        source_collectors = {
            'mail': self._collect_mail,
            'im': self._collect_im,
            'calendar': self._collect_calendar,
            'task': self._collect_task,
            'approval': self._collect_approval,
            'doc': self._collect_docs,
        }

        for source in sources:
            collector_fn = source_collectors.get(source)
            if not collector_fn:
                continue
            try:
                items = collector_fn(user_token, account, result)
                count = len(items)
                result.counts[source] = count
                result.items.extend(items)
                logger.info('  %s: %d 条', source, count)
            except Exception as e:
                result.errors.append(f'{source}: {e}')
                result.counts[source] = 0
                logger.warning('  %s 采集失败: %s', source, e)

        # 写入 PersonalContext（兼容现有链路）
        self._save_to_personal_context(result)

        # 沉淀到知识库
        if self.deposit_knowledge:
            result.deposited_to_knowledge = self._deposit_to_knowledge(result)

        return result

    def collect_project_chats(
        self,
        protocol_id: Optional[int] = None,
        chat_ids: Optional[List[str]] = None,
    ) -> CollectionResult:
        """
        采集项目相关的飞书群聊消息。

        可按 protocol_id 自动找到项目群，或直接指定 chat_ids。
        """
        from libs.feishu_client import feishu_client

        result = CollectionResult(user_id='system')
        target_chats = []

        if protocol_id:
            from apps.protocol.models import Protocol
            protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
            if protocol and protocol.feishu_chat_id:
                target_chats.append({
                    'chat_id': protocol.feishu_chat_id,
                    'name': f'项目群-{protocol.title}',
                    'protocol_id': protocol_id,
                })

        if chat_ids:
            for cid in chat_ids:
                target_chats.append({'chat_id': cid, 'name': cid})

        items = []
        for chat_info in target_chats:
            try:
                messages = feishu_client.get_group_messages(
                    group_id=chat_info['chat_id'],
                    start_time=self._cutoff_ts,
                    page_size=DEFAULT_IM_MSG_PER_CHAT,
                )
                for msg in messages:
                    item = self._parse_im_message(msg, chat_info['name'], chat_info['chat_id'])
                    if item:
                        items.append(item)
            except Exception as e:
                result.errors.append(f'群聊 {chat_info["name"]}: {e}')

        result.counts['im'] = len(items)
        result.items = items

        if self.deposit_knowledge:
            result.deposited_to_knowledge = self._deposit_to_knowledge(result)

        return result

    # ========================================================================
    # 数据源采集器
    # ========================================================================

    def _collect_mail(self, user_token: str, account, result: CollectionResult) -> List[CollectedItem]:
        """采集邮件 —— 复用现有 feishu_fetcher + mail_signal_ingest"""
        if not user_token:
            return []

        import inspect
        from apps.secretary.feishu_fetcher import fetch_mails
        sig = inspect.signature(fetch_mails)
        if 'limit' in sig.parameters:
            count = fetch_mails(user_token, account.feishu_open_id, limit=DEFAULT_MAIL_LIMIT)
        else:
            count = fetch_mails(user_token, account.feishu_open_id)

        from apps.secretary.models import PersonalContext
        recent_mails = PersonalContext.objects.filter(
            user_id=account.feishu_open_id,
            source_type='mail',
        ).order_by('-created_at')[:DEFAULT_MAIL_LIMIT]

        items = []
        for pc in recent_mails:
            items.append(CollectedItem(
                source_type='mail',
                source_id=pc.source_id,
                user_id=account.feishu_open_id,
                summary=pc.summary or '',
                raw_content=pc.raw_content or '',
                metadata=pc.metadata or {},
            ))
        return items

    def _collect_im(self, user_token: str, account, result: CollectionResult) -> List[CollectedItem]:
        """采集 IM 群聊消息 —— 扩展：提取所有群聊+消息内容"""
        if not user_token:
            return []

        from libs.feishu_client import feishu_client, FeishuAPIError

        items = []
        try:
            chats_data = feishu_client.list_user_chats(user_token, page_size=DEFAULT_IM_MAX_CHATS)
            chat_list = chats_data.get('items', [])
        except FeishuAPIError as e:
            result.errors.append(f'IM列表获取失败: {e}')
            return []

        for chat in chat_list[:DEFAULT_IM_MAX_CHATS]:
            chat_id = chat.get('chat_id', '')
            chat_name = chat.get('name', '') or chat.get('description', '') or '私聊'
            if not chat_id:
                continue

            try:
                msg_data = feishu_client.list_chat_messages(
                    user_token,
                    container_id=chat_id,
                    start_time=str(self._cutoff_ts),
                    page_size=DEFAULT_IM_MSG_PER_CHAT,
                )
                messages = msg_data.get('items', [])
                for msg in messages:
                    item = self._parse_im_message(msg, chat_name, chat_id)
                    if item:
                        item.user_id = account.feishu_open_id
                        items.append(item)
            except FeishuAPIError as e:
                if '230027' in str(e) or 'permission' in str(e).lower():
                    items.append(CollectedItem(
                        source_type='im',
                        source_id=chat_id,
                        user_id=account.feishu_open_id,
                        summary=f'[{chat_name}] (群聊元数据，消息权限待申请)',
                        raw_content=f'群聊名称: {chat_name}',
                        metadata={'chat_id': chat_id, 'chat_name': chat_name, 'degraded': True},
                    ))
                    break
                logger.warning('IM 消息获取失败 %s: %s', chat_id[:20], e)

        return items

    def _collect_calendar(self, user_token: str, account, result: CollectionResult) -> List[CollectedItem]:
        """采集日历事件"""
        if not user_token:
            return []

        import inspect
        from apps.secretary.feishu_fetcher import fetch_calendar_events
        sig = inspect.signature(fetch_calendar_events)
        if 'days' in sig.parameters:
            fetch_calendar_events(user_token, account.feishu_open_id, days=self.lookback_days)
        else:
            fetch_calendar_events(user_token, account.feishu_open_id)

        from apps.secretary.models import PersonalContext
        recent = PersonalContext.objects.filter(
            user_id=account.feishu_open_id,
            source_type='calendar',
        ).order_by('-created_at')[:200]

        return [
            CollectedItem(
                source_type='calendar',
                source_id=pc.source_id,
                user_id=account.feishu_open_id,
                summary=pc.summary or '',
                raw_content=pc.raw_content or '',
                metadata=pc.metadata or {},
            )
            for pc in recent
        ]

    def _collect_task(self, user_token: str, account, result: CollectionResult) -> List[CollectedItem]:
        """采集飞书任务"""
        if not user_token:
            return []

        from apps.secretary.feishu_fetcher import fetch_tasks
        fetch_tasks(user_token, account.feishu_open_id)

        from apps.secretary.models import PersonalContext
        recent = PersonalContext.objects.filter(
            user_id=account.feishu_open_id,
            source_type='task',
        ).order_by('-created_at')[:200]

        return [
            CollectedItem(
                source_type='task',
                source_id=pc.source_id,
                user_id=account.feishu_open_id,
                summary=pc.summary or '',
                raw_content=pc.raw_content or '',
                metadata=pc.metadata or {},
            )
            for pc in recent
        ]

    def _collect_approval(self, user_token: str, account, result: CollectionResult) -> List[CollectedItem]:
        """采集审批实例"""
        if not user_token:
            return []

        try:
            from apps.secretary.feishu_fetcher import fetch_approvals
            fetch_approvals(user_token, account.feishu_open_id)
        except ImportError:
            self._fetch_approvals_fallback(user_token, account.feishu_open_id)

        from apps.secretary.models import PersonalContext
        recent = PersonalContext.objects.filter(
            user_id=account.feishu_open_id,
            source_type='approval',
        ).order_by('-created_at')[:200]

        return [
            CollectedItem(
                source_type='approval',
                source_id=pc.source_id,
                user_id=account.feishu_open_id,
                summary=pc.summary or '',
                raw_content=pc.raw_content or '',
                metadata=pc.metadata or {},
            )
            for pc in recent
        ]

    def _collect_docs(self, user_token: str, account, result: CollectionResult) -> List[CollectedItem]:
        """
        采集飞书云文档

        飞书云文档中常包含：SOP、方案、培训材料、测试方法、人员资质等。
        这些信息对项目完整性至关重要。
        """
        if not user_token:
            return []

        from libs.feishu_client import feishu_client, FeishuAPIError

        items = []
        try:
            data = feishu_client._user_request(
                'GET',
                'drive/v1/files',
                user_token,
                params={
                    'page_size': 50,
                    'order_by': 'EditedTime',
                    'direction': 'DESC',
                },
            )
            files = data.get('files', [])
            for f in files:
                file_token = f.get('token', '')
                file_name = f.get('name', '')
                file_type = f.get('type', '')
                owner = f.get('owner_id', '')
                edit_time = f.get('edited_time', '')

                content_preview = ''
                if file_type in ('docx', 'doc') and file_token:
                    try:
                        doc_data = feishu_client._user_request(
                            'GET',
                            f'docx/v1/documents/{file_token}/raw_content',
                            user_token,
                        )
                        content_preview = (doc_data.get('content', '') or '')[:2000]
                    except (FeishuAPIError, Exception) as e:
                        content_preview = f'(文档内容获取失败: {e})'

                items.append(CollectedItem(
                    source_type='doc',
                    source_id=file_token,
                    user_id=account.feishu_open_id,
                    summary=f'[{file_type}] {file_name}',
                    raw_content=content_preview or file_name,
                    metadata={
                        'file_token': file_token,
                        'file_name': file_name,
                        'file_type': file_type,
                        'owner_id': owner,
                        'edited_time': edit_time,
                    },
                ))
        except FeishuAPIError as e:
            result.errors.append(f'云文档列表获取失败: {e}')
        except Exception as e:
            result.errors.append(f'云文档采集异常: {e}')

        return items

    # ========================================================================
    # 信号提取
    # ========================================================================

    def extract_project_signals(self, items: List[CollectedItem]) -> Dict[str, Any]:
        """
        从采集数据中提取项目管理信号。

        识别：
        - 关键角色（谁在参与什么项目）
        - 项目进度信号（启动、排期、入组、完成等）
        - 资源信息（仪器、场地、人员、方法）
        - 问题/风险信号
        """
        signals = {
            'key_personnel': defaultdict(lambda: {'sources': [], 'roles': set(), 'projects': set()}),
            'project_signals': [],
            'resource_mentions': defaultdict(list),
            'risk_signals': [],
            'statistics': defaultdict(int),
        }

        project_keywords = [
            '项目', '方案', 'protocol', '启动', '排程', '工单',
            '访视', '入组', '招募', '受试者', '样本', '报告',
        ]
        resource_keywords = {
            'instrument': ['Corneometer', 'Tewameter', 'VISIA', 'Mexameter', 'Cutometer',
                           'Sebumeter', 'PRIMOS', 'Chromameter', 'CM825', 'VisioFace'],
            'method': ['电容法', '蒸发法', '负压吸引法', 'in vivo', 'in vitro',
                       '保湿', '美白', '抗皱', '防晒', '控油'],
            'facility': ['实验室', '评估室', '环境室', '恒温', '恒湿', '场地'],
            'personnel': ['评估员', '技术员', 'CRC', '排程', 'PI', '研究者', 'QA'],
        }
        risk_keywords = ['逾期', '延迟', '冲突', '偏差', '投诉', '问题', '风险', '紧急', '异常']

        for item in items:
            text = f'{item.summary} {item.raw_content}'.lower()
            signals['statistics'][item.source_type] += 1

            # 提取人员信号
            sender = (item.metadata.get('sender_name', '') or
                      item.metadata.get('sender_email', '') or
                      item.metadata.get('sender_id', ''))
            if sender:
                signals['key_personnel'][sender]['sources'].append(item.source_type)
                if any(kw in text for kw in project_keywords):
                    signals['key_personnel'][sender]['roles'].add('project_participant')

            # 项目信号
            if any(kw in text for kw in project_keywords):
                signals['project_signals'].append({
                    'source': item.source_type,
                    'summary': item.summary[:200],
                    'source_id': item.source_id,
                })

            # 资源提及
            for res_type, keywords in resource_keywords.items():
                for kw in keywords:
                    if kw.lower() in text:
                        signals['resource_mentions'][res_type].append({
                            'keyword': kw,
                            'source': item.source_type,
                            'summary': item.summary[:100],
                        })

            # 风险信号
            if any(kw in text for kw in risk_keywords):
                signals['risk_signals'].append({
                    'source': item.source_type,
                    'summary': item.summary[:200],
                })

        # 序列化 set → list
        for name, info in signals['key_personnel'].items():
            info['roles'] = list(info['roles'])
            info['projects'] = list(info['projects'])
            info['mention_count'] = len(info['sources'])
            source_counts = defaultdict(int)
            for s in info['sources']:
                source_counts[s] += 1
            info['source_distribution'] = dict(source_counts)
            info['sources'] = []  # 太大则清空明细

        signals['key_personnel'] = dict(signals['key_personnel'])
        signals['resource_mentions'] = {k: v[:20] for k, v in signals['resource_mentions'].items()}
        signals['statistics'] = dict(signals['statistics'])

        return signals

    # ========================================================================
    # 数据持久化
    # ========================================================================

    def _save_to_personal_context(self, result: CollectionResult):
        """写入 PersonalContext（兼容现有秘书台总览链路）"""
        from apps.secretary.models import PersonalContext

        for item in result.items:
            if item.source_type == 'mail':
                continue  # mail 由 feishu_fetcher 已写入

            try:
                existing = PersonalContext.objects.filter(
                    user_id=item.user_id,
                    source_type=item.source_type,
                    source_id=item.source_id,
                )
                if existing.exists():
                    existing.order_by('-created_at').first()
                    existing.exclude(id=existing.first().id).delete()
                    existing.update(
                        summary=item.summary,
                        raw_content=item.raw_content,
                        metadata=item.metadata,
                    )
                else:
                    PersonalContext.objects.create(
                        user_id=item.user_id,
                        source_type=item.source_type,
                        source_id=item.source_id,
                        summary=item.summary,
                        raw_content=item.raw_content,
                        metadata=item.metadata,
                    )
            except Exception as e:
                logger.warning('PersonalContext 写入失败: %s', e)

    def _deposit_to_knowledge(self, result: CollectionResult) -> int:
        """
        将采集数据沉淀到知识库。

        每条有效采集数据创建一个 KnowledgeEntry，通过 ingestion_pipeline 处理。
        使用 source_key 实现幂等，避免重复入库。
        """
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

        deposited = 0
        for item in result.items:
            content = item.raw_content or item.summary
            if not content or len(content.strip()) < 20:
                continue

            source_key = f'feishu_{item.source_type}_{item.source_id}'

            from apps.knowledge.models import KnowledgeEntry
            if KnowledgeEntry.objects.filter(source_key=source_key).exists():
                continue

            try:
                raw = RawKnowledgeInput(
                    content=content,
                    title=item.summary[:200],
                    entry_type=self._map_source_to_entry_type(item.source_type),
                    source_type=f'feishu_{item.source_type}',
                    source_key=source_key,
                    tags=self._generate_tags(item),
                    summary=item.summary[:500],
                    namespace='feishu_collection',
                    properties={
                        'user_id': item.user_id,
                        'account_name': result.account_name,
                        'source_type': item.source_type,
                        'metadata': item.metadata,
                        'collected_at': item.collected_at,
                    },
                )
                pipeline_result = run_pipeline(raw)
                if hasattr(pipeline_result, 'entry_id') and pipeline_result.entry_id:
                    deposited += 1
            except Exception as e:
                logger.warning('知识入库失败 %s: %s', source_key[:50], e)

        return deposited

    # ========================================================================
    # 辅助方法
    # ========================================================================

    def _get_target_accounts(self, account_ids: Optional[List[int]] = None):
        """获取需要采集的账号列表"""
        from apps.identity.models import Account
        from apps.secretary.models import FeishuUserToken

        token_account_ids = list(
            FeishuUserToken.objects.values_list('account_id', flat=True).distinct()
        )

        qs = Account.objects.filter(
            id__in=token_account_ids,
            is_deleted=False,
        ).exclude(feishu_open_id='').exclude(feishu_open_id__isnull=True)

        if account_ids:
            qs = qs.filter(id__in=account_ids)

        return list(qs)

    def _parse_im_message(self, msg: dict, chat_name: str, chat_id: str) -> Optional[CollectedItem]:
        """解析单条 IM 消息为 CollectedItem"""
        msg_type = msg.get('msg_type', '')
        sender_info = msg.get('sender', {})
        sender_id = sender_info.get('id', '') if isinstance(sender_info, dict) else ''
        message_id = msg.get('message_id', '')

        body = msg.get('body', {})
        content = ''
        if isinstance(body, dict):
            content = body.get('content', '')
            if content and isinstance(content, str):
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, dict):
                        content = parsed.get('text', '') or str(parsed)
                except (json.JSONDecodeError, TypeError):
                    pass

        if not content and msg_type != 'text':
            content = f'[{msg_type}消息]'

        if not content:
            return None

        return CollectedItem(
            source_type='im',
            source_id=message_id,
            user_id='',
            summary=f'[{chat_name}] {content[:150]}',
            raw_content=content[:2000],
            metadata={
                'chat_id': chat_id,
                'chat_name': chat_name,
                'sender_id': sender_id,
                'msg_type': msg_type,
            },
        )

    def _fetch_approvals_fallback(self, user_token: str, user_id: str):
        """审批采集的兼容实现（服务器版本可能没有 fetch_approvals）"""
        from libs.feishu_client import feishu_client, FeishuAPIError
        from apps.secretary.models import PersonalContext

        try:
            data = feishu_client._user_request(
                'GET',
                'approval/v4/instances',
                user_token,
                params={'page_size': 50},
            )
            instances = data.get('items') or data.get('instance_list') or []
            for inst in instances[:50]:
                if not isinstance(inst, dict):
                    continue
                inst_code = inst.get('instance_code') or inst.get('approval_code') or ''
                status = inst.get('status') or ''
                title = inst.get('title') or inst.get('approval_name') or f'审批 {inst_code}'
                PersonalContext.objects.update_or_create(
                    user_id=user_id,
                    source_type='approval',
                    source_id=inst_code,
                    defaults={
                        'summary': f'[{status}] {title}',
                        'raw_content': json.dumps(inst, ensure_ascii=False, default=str)[:500],
                        'metadata': {'instance_code': inst_code, 'status': status, 'title': title},
                    },
                )
        except FeishuAPIError:
            pass
        except Exception as e:
            logger.warning('审批 fallback 采集失败: %s', e)

    @staticmethod
    def _map_source_to_entry_type(source_type: str) -> str:
        """数据源类型映射到知识库条目类型"""
        mapping = {
            'mail': 'feishu_doc',
            'im': 'lesson_learned',
            'calendar': 'feishu_doc',
            'task': 'feishu_doc',
            'approval': 'feishu_doc',
            'doc': 'feishu_doc',
        }
        return mapping.get(source_type, 'feishu_doc')

    @staticmethod
    def _generate_tags(item: CollectedItem) -> List[str]:
        """根据内容生成标签"""
        tags = [f'feishu_{item.source_type}']
        text = f'{item.summary} {item.raw_content}'.lower()

        tag_keywords = {
            'project': ['项目', '方案', 'protocol'],
            'instrument': ['Corneometer', 'Tewameter', 'VISIA', '仪器'],
            'method': ['检测方法', '测试方法', 'in vivo', 'in vitro'],
            'personnel': ['评估员', '技术员', 'CRC', '培训'],
            'facility': ['实验室', '场地', '环境'],
            'schedule': ['排程', '排期', '预约', '日程'],
            'quality': ['偏差', 'CAPA', '质量', '审计'],
            'recruitment': ['招募', '入组', '受试者'],
        }

        for tag, keywords in tag_keywords.items():
            if any(kw.lower() in text for kw in keywords):
                tags.append(tag)

        return tags


# ============================================================================
# 便捷函数（供外部直接调用）
# ============================================================================

def collect_all_feishu_data(
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    sources: Optional[List[str]] = None,
    deposit_knowledge: bool = True,
) -> BatchCollectionResult:
    """
    ★ 一站式飞书全量数据采集 ★

    遍历所有有效用户，采集所有数据源，自动入知识库。

    用法：
        from apps.secretary.feishu_comprehensive_collector import collect_all_feishu_data
        result = collect_all_feishu_data(lookback_days=60)
    """
    collector = FeishuComprehensiveCollector(
        lookback_days=lookback_days,
        deposit_knowledge=deposit_knowledge,
    )
    return collector.collect_all_users(sources=sources)


def collect_user_feishu_data(
    account_id: int,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    sources: Optional[List[str]] = None,
) -> CollectionResult:
    """
    采集指定用户的飞书数据。

    用法：
        from apps.secretary.feishu_comprehensive_collector import collect_user_feishu_data
        result = collect_user_feishu_data(account_id=1, lookback_days=60)
    """
    collector = FeishuComprehensiveCollector(lookback_days=lookback_days)
    return collector.collect_user(account_id=account_id, sources=sources)


def collect_project_feishu_data(
    protocol_id: int,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> CollectionResult:
    """
    采集项目相关的飞书群聊数据。

    用法：
        from apps.secretary.feishu_comprehensive_collector import collect_project_feishu_data
        result = collect_project_feishu_data(protocol_id=1)
    """
    collector = FeishuComprehensiveCollector(lookback_days=lookback_days)
    return collector.collect_project_chats(protocol_id=protocol_id)
