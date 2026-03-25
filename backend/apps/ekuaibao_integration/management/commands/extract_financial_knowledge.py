"""
extract_financial_knowledge — 从飞书全量数据深度抽取财务知识

从 621,623 条飞书数据（邮件/IM/审批/文档）中：
1. 抽取项目财务信息：报价、合同金额、发票、回款、礼金、成本
2. 建立项目-客户-人员-费用科目-金额的知识图谱
3. 为后续报价、成本管理、核算、预算、礼金结算、合同开票提供基础

知识图谱覆盖：
  - 项目财务实体：QuoteRecord / ContractRecord / InvoiceRecord / PaymentRecord
  - 受试者礼金：StipendRecord（含单价、人数、总金额）
  - 费用科目：CostItem（兼职费、招募费、耗材费、PI费等）
  - 供应商：Supplier（合同对手方）
  - 财务流程：报价→合同→开票→回款 完整生命周期

数据来源权重：
  - 邮件(70K): 报价单、合同、发票、回款通知、礼金表格 → 最高价值
  - IM(480K): 成本讨论、金额确认、礼金安排 → 高价值
  - 审批(21K): 采购申请含金额 → 高价值
  - 文档(5K): 报价模板、成本核算表 → 高价值
  - 任务(18K): 报销提醒、付款跟踪 → 中等价值
"""
import logging
import re
from typing import Dict, List, Optional, Set

from django.core.management.base import BaseCommand

logger = logging.getLogger('cn_kis.financial_kg')

# ============================================================================
# 正则模式
# ============================================================================

# 项目编号：M26041002, C25001029, W26007008, A26005007
PROJECT_CODE_RE = re.compile(r'\b([MCWARO][0-9]{2}[0-9A-Z]{3,8})\b')

# 金额模式（中文）
AMOUNT_RE_CN = re.compile(
    r'(?:(?:报价|合同金额|发票金额|付款|预算|成本|应收|应付|礼金|总价|含税|不含税|未税)'
    r'[：:\s]*)?'
    r'((?:¥|￥|RMB\s*)?'
    r'(\d{1,3}(?:[,，]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)'
    r'(?:\s*(?:元|万元|万))?)',
    re.IGNORECASE
)

# 发票号
INVOICE_NO_RE = re.compile(r'发票号[码]?\s*[：:]\s*([0-9A-Z\-]{6,20})', re.IGNORECASE)

# 合同号
CONTRACT_NO_RE = re.compile(
    r'(?:合同号|合同编号|PO\s*(?:号|number)?)[：:\s]*([A-Z0-9\-/]{4,25})', re.IGNORECASE
)

# 受试者礼金模式
STIPEND_RE = re.compile(
    r'(?:受试者)?礼金[：:\s]*'
    r'(?:(\d+(?:\.\d+)?)\s*(?:元|/人|/次))?'
    r'.*?(?:(\d+)\s*(?:人|名|位))?'
    r'.*?(?:共|合计|总计)?[：:\s]*'
    r'(?:¥|￥)?(\d{1,3}(?:[,，]\d{3})*(?:\.\d{1,2})?)',
    re.DOTALL | re.IGNORECASE
)

# 已知客户名称（用于关联）
KNOWN_CLIENTS = [
    '欧莱雅', '联合利华', 'LVMH', '资生堂', '薇诺娜', '花王', '拜尔斯道夫',
    '巴斯夫', '宝洁', '云南白药', '丝芙兰', '上海家化', 'Chanel', '雅诗兰黛',
    '金佰利', '高丝', '皮尔法伯', 'L\'Oreal', 'Beiersdorf', 'Shiseido',
    'Unilever', 'Henkel', 'P&G', 'Estee Lauder', '汉高', '拜尔斯道夫',
    '诗珑', 'BASF',
]

# 费用科目关键词
COST_ITEMS = {
    '受试者礼金': ['受试者礼金', '礼金', 'stipend', '受试者费'],
    '招募费': ['招募', '招募费', 'recruitment'],
    '兼职费': ['兼职', '兼职费', '兼职劳务', 'freelance'],
    'PI费': ['PI费', '研究者费', '医生费', '专家费'],
    '耗材费': ['耗材', '用品', '试剂', 'consumable'],
    '仪器费': ['仪器', '设备', 'instrument', 'equipment'],
    '差旅费': ['差旅', '出差', '机票', '酒店', 'travel'],
    '联络费': ['联络费', '联络员', '联系费'],
    '报告费': ['报告', '报告费', 'report'],
    '翻译费': ['翻译', '英文报告', 'translation'],
    '云服务费': ['云', '服务器', '云服务', '阿里云', '腾讯云'],
}


def parse_amount(text: str) -> Optional[float]:
    """从文本中提取金额（返回数值）"""
    text = re.sub(r'[,，]', '', text)  # 去千分位
    match = re.search(r'(\d+(?:\.\d{1,2})?)', text)
    if match:
        try:
            val = float(match.group(1))
            if '万' in text:
                val *= 10000
            return val
        except ValueError:
            pass
    return None


def extract_project_codes(text: str) -> Set[str]:
    """从文本中提取所有项目编号"""
    return set(PROJECT_CODE_RE.findall(text))


def extract_client(text: str) -> Optional[str]:
    """从文本中识别客户名称"""
    text_lower = text.lower()
    for client in KNOWN_CLIENTS:
        if client.lower() in text_lower:
            return client
    return None


def extract_cost_items(text: str) -> List[str]:
    """从文本中识别费用科目"""
    found = []
    for item_name, keywords in COST_ITEMS.items():
        for kw in keywords:
            if kw.lower() in text.lower():
                found.append(item_name)
                break
    return found


def extract_amounts_with_context(text: str) -> List[Dict]:
    """提取金额及其上下文（前后20字）"""
    results = []
    for m in AMOUNT_RE_CN.finditer(text):
        start = max(0, m.start() - 20)
        end = min(len(text), m.end() + 20)
        context = text[start:end]

        amount_text = m.group(2) if m.group(2) else m.group(1)
        amount = parse_amount(amount_text)
        if amount and amount >= 100:  # 过滤太小的数字
            results.append({
                'amount': amount,
                'context': context.strip(),
                'raw': m.group(0),
            })
    return results


# ============================================================================
# 财务信号抽取
# ============================================================================

def extract_financial_signals(content: str, source_type: str, metadata: dict) -> Dict:
    """
    从单条 PersonalContext 中抽取财务信号。
    返回结构：
    {
        'project_codes': [...],
        'client': '...',
        'amounts': [{amount, context, raw}, ...],
        'cost_items': [...],
        'signal_types': ['quote', 'contract', 'invoice', 'payment', 'stipend', 'budget'],
        'has_financial': bool,
    }
    """
    signal = {
        'project_codes': list(extract_project_codes(content)),
        'client': extract_client(content),
        'amounts': extract_amounts_with_context(content),
        'cost_items': extract_cost_items(content),
        'signal_types': [],
        'has_financial': False,
        'invoice_nos': INVOICE_NO_RE.findall(content),
        'contract_nos': CONTRACT_NO_RE.findall(content),
    }

    text_lower = content.lower()

    # 信号类型检测
    if any(kw in text_lower for kw in ['报价', 'quote', 'quotation', '报价单']):
        signal['signal_types'].append('quote')
    if any(kw in text_lower for kw in ['合同', 'contract', '协议', '合约']):
        signal['signal_types'].append('contract')
    if any(kw in text_lower for kw in ['发票', 'invoice', '开票', '税票']):
        signal['signal_types'].append('invoice')
    if any(kw in text_lower for kw in ['付款', 'payment', '回款', '应收', '到账', '汇款']):
        signal['signal_types'].append('payment')
    if any(kw in text_lower for kw in ['礼金', 'stipend', '受试者费', '受试者礼']):
        signal['signal_types'].append('stipend')
    if any(kw in text_lower for kw in ['预算', 'budget', '成本', '超支']):
        signal['signal_types'].append('budget')
    if any(kw in text_lower for kw in ['po', '采购订单', '采购']):
        signal['signal_types'].append('purchase_order')

    signal['has_financial'] = (
        len(signal['signal_types']) > 0 or
        len(signal['amounts']) > 0 or
        len(signal['project_codes']) > 0 or
        len(signal['invoice_nos']) > 0 or
        len(signal['contract_nos']) > 0
    )

    return signal


class Command(BaseCommand):
    help = '从飞书全量数据深度抽取财务知识，构建项目财务知识图谱'

    def add_arguments(self, parser):
        parser.add_argument(
            '--source-type', type=str,
            choices=['mail', 'im', 'approval', 'doc', 'wiki', 'task', 'all'],
            default='all', help='处理的数据来源类型',
        )
        parser.add_argument(
            '--limit', type=int, default=0, help='限制处理条数（0=全量）',
        )
        parser.add_argument(
            '--batch-size', type=int, default=1000, help='批次大小',
        )
        parser.add_argument(
            '--dry-run', action='store_true', dest='dry_run',
            help='预览模式，只统计不写入',
        )
        parser.add_argument(
            '--phase', type=str, choices=['1', '2', '3', 'all'], default='all',
            help='Phase 1: 抽取信号统计; Phase 2: 构建知识图谱; Phase 3: 向量化画像',
        )

    def handle(self, *args, **options):
        source_type = options['source_type']
        limit = options['limit']
        dry_run = options['dry_run']
        phase = options['phase']
        batch_size = options['batch_size']

        self.stdout.write(f'模式: {"DRY-RUN" if dry_run else "正式"} | 来源: {source_type} | Phase: {phase}')

        if phase in ('1', 'all'):
            self.stdout.write('\n[Phase 1] 从飞书数据抽取财务信号...')
            stats = self._phase1_extract_signals(source_type, limit, batch_size, dry_run)
            self.stdout.write(self.style.SUCCESS(f'  完成: {stats}'))

        if phase in ('2', 'all'):
            self.stdout.write('\n[Phase 2] 构建财务知识图谱...')
            stats2 = self._phase2_build_financial_kg(dry_run)
            self.stdout.write(self.style.SUCCESS(f'  完成: {stats2}'))

        if phase in ('3', 'all'):
            self.stdout.write('\n[Phase 3] 生成财务全景画像并向量化...')
            stats3 = self._phase3_vectorize_financial_profiles(dry_run)
            self.stdout.write(self.style.SUCCESS(f'  完成: {stats3}'))

    # ──────────────────────────────────────────────────
    # Phase 1: 抽取财务信号并存储到 FinancialSignalCache
    # ──────────────────────────────────────────────────

    def _phase1_extract_signals(self, source_type: str, limit: int,
                                 batch_size: int, dry_run: bool) -> dict:
        from apps.secretary.models import PersonalContext

        stats = {
            'processed': 0, 'with_financial': 0, 'with_project': 0,
            'with_amount': 0, 'with_client': 0, 'signals_saved': 0,
            'source_stats': {},
        }

        # 确保临时缓存表存在
        if not dry_run:
            self._ensure_financial_signal_cache_table()

        types = ['mail', 'im', 'approval', 'doc', 'wiki', 'task'] if source_type == 'all' else [source_type]

        for stype in types:
            qs = PersonalContext.objects.filter(source_type=stype)
            # 只处理有实质内容的
            qs = qs.exclude(raw_content='').exclude(raw_content__isnull=True)
            total = qs.count()
            if limit > 0:
                qs = qs[:limit]
                total = min(total, limit)

            self.stdout.write(f'  {stype}: {total} 条')
            stats['source_stats'][stype] = {'total': total, 'financial': 0}

            offset = 0
            while offset < total:
                batch = list(qs[offset:offset + batch_size])
                signals_to_save = []

                for ctx in batch:
                    signal = extract_financial_signals(
                        ctx.raw_content, ctx.source_type, ctx.metadata or {}
                    )
                    stats['processed'] += 1

                    if signal['has_financial']:
                        stats['with_financial'] += 1
                        stats['source_stats'][stype]['financial'] += 1
                        if signal['project_codes']:
                            stats['with_project'] += 1
                        if signal['amounts']:
                            stats['with_amount'] += 1
                        if signal['client']:
                            stats['with_client'] += 1

                        if not dry_run:
                            signals_to_save.append({
                                'ctx_id': ctx.id,
                                'user_id': ctx.user_id,
                                'source_type': ctx.source_type,
                                'source_id': ctx.source_id,
                                'project_codes': signal['project_codes'],
                                'client': signal['client'],
                                'signal_types': signal['signal_types'],
                                'amounts': signal['amounts'][:5],  # 最多5个金额
                                'cost_items': signal['cost_items'],
                                'invoice_nos': signal['invoice_nos'],
                                'contract_nos': signal['contract_nos'],
                            })

                if not dry_run and signals_to_save:
                    self._bulk_save_signals(signals_to_save)
                    stats['signals_saved'] += len(signals_to_save)

                offset += batch_size

                if offset % 10000 == 0:
                    self.stdout.write(
                        f'    {stype}: {offset}/{total} 处理完成, '
                        f'财务信号: {stats["source_stats"][stype]["financial"]}'
                    )

        return stats

    def _ensure_financial_signal_cache_table(self):
        """确保财务信号缓存表存在（使用原生 SQL 创建，避免迁移依赖）"""
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS t_financial_signal_cache (
                    id SERIAL PRIMARY KEY,
                    ctx_id INTEGER,
                    user_id VARCHAR(200),
                    source_type VARCHAR(50),
                    source_id VARCHAR(500),
                    project_codes JSONB DEFAULT '[]',
                    client VARCHAR(200),
                    signal_types JSONB DEFAULT '[]',
                    amounts JSONB DEFAULT '[]',
                    cost_items JSONB DEFAULT '[]',
                    invoice_nos JSONB DEFAULT '[]',
                    contract_nos JSONB DEFAULT '[]',
                    create_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_fsc_source_id ON t_financial_signal_cache(source_id);
                CREATE INDEX IF NOT EXISTS idx_fsc_user_id ON t_financial_signal_cache(user_id);
                CREATE INDEX IF NOT EXISTS idx_fsc_source_type ON t_financial_signal_cache(source_type);
            """)

    def _bulk_save_signals(self, signals: List[Dict]):
        """批量保存财务信号"""
        import json
        from django.db import connection
        with connection.cursor() as cursor:
            values = []
            for s in signals:
                values.append((
                    s['ctx_id'], s['user_id'], s['source_type'], s['source_id'],
                    json.dumps(s['project_codes'], ensure_ascii=False),
                    s['client'] or '',
                    json.dumps(s['signal_types'], ensure_ascii=False),
                    json.dumps(s['amounts'], ensure_ascii=False),
                    json.dumps(s['cost_items'], ensure_ascii=False),
                    json.dumps(s['invoice_nos'], ensure_ascii=False),
                    json.dumps(s['contract_nos'], ensure_ascii=False),
                ))
            cursor.executemany("""
                INSERT INTO t_financial_signal_cache
                (ctx_id, user_id, source_type, source_id, project_codes, client,
                 signal_types, amounts, cost_items, invoice_nos, contract_nos)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)
                ON CONFLICT DO NOTHING
            """, values)

    # ──────────────────────────────────────────────────
    # Phase 2: 构建财务知识图谱
    # ──────────────────────────────────────────────────

    def _phase2_build_financial_kg(self, dry_run: bool) -> dict:
        """
        基于 t_financial_signal_cache，构建：
        1. 项目财务实体（每个项目的报价/合同/发票/礼金统计）
        2. 人员→项目→财务 关系
        3. 客户→项目→财务 关系
        4. 费用科目→项目 关系
        """
        from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation
        from apps.protocol.models import Protocol
        from apps.identity.models import Account
        from django.db import connection

        stats = {'entities_created': 0, 'relations_created': 0, 'projects_analyzed': 0}

        def upsert_entity(uri, label, entity_type, definition='', properties=None):
            e, created = KnowledgeEntity.objects.update_or_create(
                uri=uri,
                defaults={
                    'label': label, 'entity_type': entity_type,
                    'namespace': 'cnkis', 'definition': definition,
                    'properties': properties or {}, 'is_deleted': False,
                }
            )
            if created:
                stats['entities_created'] += 1
            return e

        def upsert_relation(subj, obj, predicate_uri, metadata=None):
            r, created = KnowledgeRelation.objects.get_or_create(
                subject=subj, object=obj, predicate_uri=predicate_uri,
                is_deleted=False,
                defaults={
                    'relation_type': 'custom',
                    'source': 'financial_kg_extraction',
                    'confidence': 0.85,
                    'metadata': metadata or {},
                }
            )
            if created:
                stats['relations_created'] += 1
            return r

        if dry_run:
            return {'dry_run': True}

        # ── 按项目聚合财务信号 ──
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    project_code,
                    COUNT(*) as mention_count,
                    COUNT(*) FILTER (WHERE signal_types ? 'quote') as quote_count,
                    COUNT(*) FILTER (WHERE signal_types ? 'contract') as contract_count,
                    COUNT(*) FILTER (WHERE signal_types ? 'invoice') as invoice_count,
                    COUNT(*) FILTER (WHERE signal_types ? 'payment') as payment_count,
                    COUNT(*) FILTER (WHERE signal_types ? 'stipend') as stipend_count,
                    COUNT(*) FILTER (WHERE signal_types ? 'budget') as budget_count,
                    COUNT(DISTINCT user_id) as people_count,
                    COUNT(DISTINCT client) FILTER (WHERE client != '') as client_count,
                    array_agg(DISTINCT source_type) as source_types
                FROM t_financial_signal_cache,
                LATERAL jsonb_array_elements_text(project_codes) as project_code
                WHERE project_code ~ '^[MCWARO][0-9]{2}[0-9A-Z]{3,8}$'
                GROUP BY project_code
                ORDER BY mention_count DESC
                LIMIT 500
            """)
            project_rows = cursor.fetchall()

        self.stdout.write(f'  从飞书信号中找到 {len(project_rows)} 个项目的财务数据')

        # ── 费用科目聚合 ──
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    cost_item,
                    COUNT(*) as mention_count,
                    COUNT(DISTINCT project_code) as project_count,
                    COUNT(DISTINCT user_id) as people_count
                FROM t_financial_signal_cache,
                LATERAL jsonb_array_elements_text(cost_items) as cost_item,
                LATERAL jsonb_array_elements_text(project_codes) as project_code
                WHERE cost_item != ''
                GROUP BY cost_item
                ORDER BY mention_count DESC
            """)
            cost_rows = cursor.fetchall()

        # ── 创建费用科目实体 ──
        cost_entities = {}
        for cost_item, mention_count, project_count, people_count in cost_rows:
            uri = f'cnkis:cost_item:{cost_item}'
            e = upsert_entity(
                uri=uri, label=cost_item, entity_type='concept',
                definition=f'费用科目：{cost_item}',
                properties={
                    'mention_count': mention_count,
                    'project_count': project_count,
                    'people_count': people_count,
                    'source': 'feishu_financial_extraction',
                }
            )
            cost_entities[cost_item] = e

        # ── 为每个项目创建/更新财务实体 ──
        protocol_cache = {p.code: p for p in Protocol.objects.filter(is_deleted=False)}
        client_entity_cache = {
            e.label: e for e in KnowledgeEntity.objects.filter(
                entity_type='client', namespace='cnkis', is_deleted=False
            )
        }
        project_entity_cache = {
            e.properties.get('code', ''): e for e in KnowledgeEntity.objects.filter(
                entity_type='project', namespace='cnkis', is_deleted=False
            )
        }

        for row in project_rows:
            (project_code, mention_count, quote_count, contract_count, invoice_count,
             payment_count, stipend_count, budget_count, people_count, client_count,
             source_types) = row

            stats['projects_analyzed'] += 1

            # 找到对应 Protocol
            protocol = protocol_cache.get(project_code)

            # 财务信号强度（越多信号 = 越多财务活动）
            financial_intensity = quote_count + contract_count * 2 + invoice_count + payment_count * 2

            # 构建项目财务画像描述
            signal_parts = []
            if quote_count > 0:
                signal_parts.append(f'报价 {quote_count} 次')
            if contract_count > 0:
                signal_parts.append(f'合同 {contract_count} 次')
            if invoice_count > 0:
                signal_parts.append(f'发票 {invoice_count} 次')
            if payment_count > 0:
                signal_parts.append(f'付款 {payment_count} 次')
            if stipend_count > 0:
                signal_parts.append(f'礼金 {stipend_count} 次')
            if budget_count > 0:
                signal_parts.append(f'预算 {budget_count} 次')

            definition = (
                f"项目 {project_code} 的财务活动记录（来源：飞书邮件/IM/审批/文档）\n"
                f"飞书提及次数：{mention_count}\n"
                f"财务信号：{', '.join(signal_parts) if signal_parts else '无'}\n"
                f"涉及人员：{people_count} 人\n"
                f"数据来源类型：{', '.join(source_types or [])}"
            )

            # 更新/创建项目实体
            proj_entity = project_entity_cache.get(project_code)
            if not proj_entity:
                uri = f'cnkis:project:{project_code}'
                title = protocol.title if protocol else project_code
                proj_entity = upsert_entity(
                    uri=uri, label=f'{project_code} {title}',
                    entity_type='project',
                    definition=definition,
                    properties={
                        'code': project_code,
                        'system_id': protocol.id if protocol else None,
                        'feishu_mention_count': mention_count,
                        'financial_intensity': financial_intensity,
                        'quote_count': quote_count,
                        'contract_count': contract_count,
                        'invoice_count': invoice_count,
                        'payment_count': payment_count,
                        'stipend_count': stipend_count,
                        'budget_count': budget_count,
                    }
                )
            else:
                # 更新已有实体的财务信息
                props = proj_entity.properties or {}
                props.update({
                    'feishu_mention_count': mention_count,
                    'financial_intensity': financial_intensity,
                    'quote_count': quote_count,
                    'contract_count': contract_count,
                    'invoice_count': invoice_count,
                    'payment_count': payment_count,
                    'stipend_count': stipend_count,
                    'budget_count': budget_count,
                })
                if not dry_run:
                    KnowledgeEntity.objects.filter(id=proj_entity.id).update(properties=props)

            # ── 项目→费用科目 关系 ──
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT DISTINCT jsonb_array_elements_text(cost_items) as ci
                    FROM t_financial_signal_cache,
                    LATERAL jsonb_array_elements_text(project_codes) as pc
                    WHERE pc = %s AND cost_items != '[]'
                """, [project_code])
                for (ci,) in cursor.fetchall():
                    if ci in cost_entities:
                        upsert_relation(
                            proj_entity, cost_entities[ci],
                            'cnkis:has_cost_item',
                            {'project_code': project_code, 'source': 'feishu'}
                        )

            # ── 项目→客户 关系（从飞书数据推断）──
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT client, COUNT(*) as cnt
                    FROM t_financial_signal_cache,
                    LATERAL jsonb_array_elements_text(project_codes) as pc
                    WHERE pc = %s AND client != '' AND client IS NOT NULL
                    GROUP BY client ORDER BY cnt DESC LIMIT 1
                """, [project_code])
                row2 = cursor.fetchone()
                if row2:
                    inferred_client = row2[0]
                    client_e = client_entity_cache.get(inferred_client)
                    if client_e and proj_entity:
                        upsert_relation(
                            client_e, proj_entity, 'cnkis:sponsors',
                            {'confidence': 'inferred_from_feishu', 'source': 'feishu'}
                        )

        # ── 人员→项目 财务参与关系 ──
        account_entity_cache = {
            e.properties.get('ekuaibao_staff_id', ''): e
            for e in KnowledgeEntity.objects.filter(
                entity_type='person', namespace='cnkis', is_deleted=False
            )
        }
        feishu_to_ekb = {
            acc.feishu_open_id: acc.ekuaibao_staff_id
            for acc in Account.objects.filter(
                is_deleted=False, feishu_open_id__gt='', ekuaibao_staff_id__gt=''
            )
        }

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    user_id,
                    project_code,
                    COUNT(*) as involvement_count,
                    COUNT(*) FILTER (WHERE signal_types ? 'quote') as quote_involvement,
                    COUNT(*) FILTER (WHERE signal_types ? 'invoice') as invoice_involvement
                FROM t_financial_signal_cache,
                LATERAL jsonb_array_elements_text(project_codes) as project_code
                WHERE project_code ~ '^[MCWARO][0-9]{2}[0-9A-Z]{3,8}$'
                AND user_id IS NOT NULL AND user_id != ''
                GROUP BY user_id, project_code
                HAVING COUNT(*) >= 2  -- 至少2次财务相关互动
                ORDER BY involvement_count DESC
                LIMIT 2000
            """)
            person_project_rows = cursor.fetchall()

        for (feishu_uid, project_code, involvement, quote_inv, invoice_inv) in person_project_rows:
            ekb_id = feishu_to_ekb.get(feishu_uid, '')
            person_e = account_entity_cache.get(ekb_id)
            proj_e = project_entity_cache.get(project_code)
            if not proj_e:
                # 重新查
                proj_e = KnowledgeEntity.objects.filter(
                    uri=f'cnkis:project:{project_code}', is_deleted=False
                ).first()
            if person_e and proj_e:
                upsert_relation(
                    person_e, proj_e, 'cnkis:financially_involved_in',
                    {
                        'involvement_count': involvement,
                        'quote_involvement': quote_inv,
                        'invoice_involvement': invoice_inv,
                        'source': 'feishu_financial_activity',
                    }
                )

        return stats

    # ──────────────────────────────────────────────────
    # Phase 3: 生成财务全景画像并向量化
    # ──────────────────────────────────────────────────

    def _phase3_vectorize_financial_profiles(self, dry_run: bool) -> dict:
        """
        为每个重要项目生成「财务全景画像」文本入库 KnowledgeEntry，
        供 AI 语义检索回答：
        - "C25005058 项目的预算超支情况是什么？"
        - "欧莱雅项目的礼金单价是多少？"
        - "蒋艳雯参与了哪些项目的报价？"
        """
        from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
        from apps.protocol.models import Protocol
        from apps.finance.models_expense import ExpenseRequest
        from apps.finance.models import ProjectBudget
        from django.db import connection
        from django.db.models import Sum

        stats = {'created': 0, 'skipped': 0}

        if dry_run:
            return {'dry_run': True}

        # 获取有丰富财务活动的项目（用简单可靠的两步查询）
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    pc as project_code,
                    COUNT(*) as total_mentions,
                    COUNT(*) FILTER (WHERE signal_types ? 'quote') as quote_mentions,
                    COUNT(*) FILTER (WHERE signal_types ? 'invoice') as invoice_mentions,
                    COUNT(*) FILTER (WHERE signal_types ? 'stipend') as stipend_mentions,
                    array_agg(DISTINCT client) FILTER (WHERE client IS NOT NULL AND client != '') as clients,
                    COUNT(DISTINCT user_id) as people_count
                FROM t_financial_signal_cache,
                LATERAL jsonb_array_elements_text(project_codes) as pc
                WHERE pc ~ '^[MCWARO][0-9]{2}[0-9A-Z]{3,8}$'
                GROUP BY pc
                HAVING COUNT(*) >= 5
                ORDER BY COUNT(*) DESC
                LIMIT 200
            """)
            top_projects_raw = cursor.fetchall()

        # 为每个项目单独获取金额上下文（避免复杂 SQL）
        top_projects = []
        for row in top_projects_raw:
            project_code = row[0]
            with connection.cursor() as cursor2:
                cursor2.execute("""
                    SELECT DISTINCT jsonb_array_elements(amounts)->>'context' as ctx
                    FROM t_financial_signal_cache,
                    LATERAL jsonb_array_elements_text(project_codes) as pc
                    WHERE pc = %s AND amounts != '[]'
                    LIMIT 5
                """, [project_code])
                amount_ctx_rows = cursor2.fetchall()
                amount_contexts = [r[0] for r in amount_ctx_rows if r[0]]
            top_projects.append(row + (amount_contexts,))

        self.stdout.write(f'  将生成 {len(top_projects)} 个项目的财务全景画像')

        for row in top_projects:
            (project_code, total_mentions, quote_mentions, invoice_mentions,
             stipend_mentions, clients, people_count, amount_contexts) = row

            # 查系统中的项目数据
            protocol = Protocol.objects.filter(code=project_code, is_deleted=False).first()
            if protocol:
                expenses = ExpenseRequest.objects.filter(
                    protocol_id=protocol.id, import_source='ekuaibao'
                )
                expense_total = expenses.aggregate(Sum('amount'))['amount__sum'] or 0
                budgets = ProjectBudget.objects.filter(
                    protocol_id=protocol.id, import_source='ekuaibao'
                )
                budget_total = budgets.aggregate(Sum('total_expense'))['total_expense__sum'] or 0
            else:
                expense_total = 0
                budget_total = 0

            # 构建全景文本
            client_str = '、'.join(set(c for c in (clients or []) if c)) or '未确认'
            lines = [
                f"项目编号：{project_code}",
                f"项目名称：{protocol.title if protocol else '（见飞书）'}",
                f"委托客户：{client_str}",
                "",
                "【飞书财务活动统计（来源：邮件/IM/审批/文档）】",
                f"总提及次数：{total_mentions}",
                f"报价相关：{quote_mentions} 次",
                f"发票相关：{invoice_mentions} 次",
                f"礼金相关：{stipend_mentions} 次",
                f"涉及人员：{people_count} 人",
            ]

            if amount_contexts:
                lines.append("")
                lines.append("【金额相关上下文（飞书原文节选）】")
                for ctx in (amount_contexts or [])[:5]:
                    if ctx:
                        lines.append(f"- {ctx}")

            if expense_total > 0 or budget_total > 0:
                lines.append("")
                lines.append("【易快报费用数据】")
                if budget_total > 0:
                    lines.append(f"预算总额：¥{budget_total:,.2f}")
                if expense_total > 0:
                    lines.append(f"实际费用：¥{expense_total:,.2f}")
                if budget_total > 0 and expense_total > 0:
                    rate = expense_total / budget_total * 100
                    lines.append(f"预算执行率：{rate:.1f}%")

            content = '\n'.join(lines)

            result = run_pipeline(RawKnowledgeInput(
                title=f'项目财务全景：{project_code}',
                content=content,
                entry_type='lesson_learned',
                source_type='financial_profile',
                source_key=f'financial_profile:project:{project_code}',
                tags=['财务全景', project_code, client_str, '项目成本'],
                namespace='financial_knowledge',
                properties={
                    'project_code': project_code,
                    'protocol_id': protocol.id if protocol else None,
                    'total_feishu_mentions': total_mentions,
                    'quote_mentions': quote_mentions,
                    'invoice_mentions': invoice_mentions,
                    'stipend_mentions': stipend_mentions,
                    'expense_total': float(expense_total),
                    'budget_total': float(budget_total),
                },
            ))
            if result.success:
                stats['created'] += 1
            else:
                stats['skipped'] += 1

        # 额外：生成「费用科目知识」（帮助 AI 理解各类成本）
        cost_profiles = [
            ('受试者礼金', '受试者参与测试的补偿金。通常按次计算，单次金额从几十元到数千元不等（外国受试者更高）。'),
            ('招募费', '招募受试者产生的费用，包含招募渠道费、招募人员兼职费等。'),
            ('兼职费', '兼职研究员、联络员、临床协调员的劳务费。'),
            ('PI费', '主要研究者（PI/医生/专家）的咨询或参与费用。'),
            ('耗材费', '测试用品、试剂、标签纸、印刷等实验耗材。'),
            ('仪器费', '仪器使用费或租赁费，如VISIA、皮肤测量仪等。'),
        ]

        for item_name, description in cost_profiles:
            run_pipeline(RawKnowledgeInput(
                title=f'费用科目知识：{item_name}',
                content=f"费用科目：{item_name}\n\n{description}\n\n用于项目成本核算、报价参考和预算管理。",
                entry_type='method_reference',
                source_type='cost_item_knowledge',
                source_key=f'cost_item:{item_name}',
                tags=['费用科目', item_name, '成本管理'],
                namespace='financial_knowledge',
                properties={'cost_item': item_name},
            ))
            stats['created'] += 1

        return stats
