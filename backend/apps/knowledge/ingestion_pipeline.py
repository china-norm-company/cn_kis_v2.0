"""
统一知识入库管线（Ingestion Pipeline）

将原始输入经过 10 个处理阶段，产生符合质量标准的知识条目。

阶段：
  1. 去噪（Noise Filter）
  2. 去重（Deduplication）
  3. 分块（Chunking）—— 按文档类型智能切片
  4. AI 分类（Classification）—— LLM 内容理解分类（有规则 fallback）
  5. 摘要生成（Summarization）—— LLM 专业摘要（有截取 fallback）
  6. 实体抽取（Entity Extraction）—— LLM NER（有词典 fallback）
  7. 关系抽取（Relation Extraction）—— LLM 语义关系抽取（有规则 fallback）
  8. 质量评分（Quality Scoring）
  9. 状态路由（Status Routing）
  10. 向量化触发（Vectorization Trigger）

每个阶段单独 try/except，单阶段失败不中断整体流程。

LLM 加工策略：
  - 摘要+分类+实体+关系 合并为单次 LLM 调用，减少 API 开销
  - 使用 Kimi moonshot-v1-32k（轻量快速）
  - LLM 失败时自动降级到规则/词典方案，确保稳定性
"""
import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from django.utils import timezone

logger = logging.getLogger(__name__)

# 是否启用 LLM 加工（默认关闭：规则fallback已足够，开启会极大降低吞吐量）
# 仅对高价值文档（SOP/法规/方案）按需开启：KNOWLEDGE_LLM_ENRICH=true
import os
_LLM_ENRICH_ENABLED = os.getenv('KNOWLEDGE_LLM_ENRICH', 'false').strip().lower() not in ('0', 'false', 'no', 'off')
# 内容长度阈值：低于此值不调用 LLM（节省费用）
_LLM_ENRICH_MIN_LEN = int(os.getenv('KNOWLEDGE_LLM_ENRICH_MIN_LEN', '500'))


# ── 实体抽取关键词词典 ──────────────────────────────────────────────────────

# 仪器名称 → entity_type
INSTRUMENT_KEYWORDS: Dict[str, str] = {
    'Corneometer': 'instrument', 'Tewameter': 'instrument',
    'Mexameter': 'instrument', 'Cutometer': 'instrument',
    'VISIA': 'instrument', 'VisioFace': 'instrument',
    'Sebumeter': 'instrument', 'Sebufix': 'instrument',
    'PRIMOS': 'instrument', 'Visiometer': 'instrument',
    'Chromameter': 'instrument', 'Colorimeter': 'instrument',
    'Glossymeter': 'instrument', 'Skin-pH-Meter': 'instrument',
    'Tewameter TM': 'instrument', 'CM825': 'instrument',
}

# 法规编号正则 → entity_type
REGULATION_PATTERNS: List[tuple] = [
    (re.compile(r'GB/T\s*\d+(?:\.\d+)?'), 'regulation_entity'),
    (re.compile(r'ISO\s*\d+(?::\d+)?'), 'regulation_entity'),
    (re.compile(r'QB/T\s*\d+'), 'regulation_entity'),
    (re.compile(r'YY/T\s*\d+'), 'regulation_entity'),
    (re.compile(r'ICH\s+[EQS]\d+(?:\([A-Z]\d*\))?'), 'regulation_entity'),
]

# 化妆品成分关键词 → entity_type
INGREDIENT_KEYWORDS: List[str] = [
    '烟酰胺', '透明质酸', '神经酰胺', '角鲨烷', '维C', '维生素C',
    '熊果苷', '曲酸', '光甘草定', '传明酸', '视黄醇', 'A醇', '胜肽',
    '积雪草', '泛醇', '尿囊素', '水杨酸', '果酸', 'AHA', 'BHA',
    'niacinamide', 'hyaluronic acid', 'ceramide', 'retinol', 'arbutin',
]

# 检测方法关键词 → entity_type
METHOD_KEYWORDS: List[str] = [
    '电容法', '蒸发法', '负压吸引法', '反射光谱法', '比色法', '吸收光度法',
    '硅胶复模法', '结构光三维成像', '图像分析',
    'in vivo', 'in vitro', '人体法', '体外法',
    '配对t检验', 'Wilcoxon', '随机对照', 'RCT',
]

# 功效宣称关键词 → entity_type（concept）
CLAIM_KEYWORDS: List[str] = [
    '保湿', '美白', '抗皱', '防晒', '修复', '控油', '舒缓',
    '紧致', '细致毛孔', '防脱发', '护发', '清洁',
    'moisturizing', 'whitening', 'anti-wrinkle', 'sunscreen',
]

# 关系规则：(主体 entity_type, 宾体 entity_type) → relation_type
ENTITY_RELATION_RULES: Dict[tuple, str] = {
    ('instrument', 'method'): 'tested_by',
    ('method', 'regulation_entity'): 'governed_by',
    ('ingredient', 'regulation_entity'): 'limited_by',
    ('concept', 'instrument'): 'measured_by',
    ('concept', 'method'): 'measured_by',
    ('concept', 'ingredient'): 'related_to',
}


@dataclass
class RawKnowledgeInput:
    """原始知识输入数据类"""
    content: str
    title: str = ''
    entry_type: str = ''
    source_type: str = ''
    source_id: Optional[int] = None
    source_key: str = ''
    tags: List[str] = field(default_factory=list)
    summary: str = ''
    created_by_id: Optional[int] = None
    namespace: str = ''
    properties: Dict[str, Any] = field(default_factory=dict)
    # 可选：已知的 URI（如从 CDISC/BRIDG 导入时已知 URI）
    uri: str = ''
    # 专题包字段：可由管理命令/采集器显式传入，或通过 properties.topic_package 传入
    package_id: str = ''
    canonical_topic: str = ''
    facet: str = ''
    version: str = ''
    previous_entry_id: Optional[int] = None
    owner_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    next_review_at: Optional[datetime] = None


@dataclass
class PipelineInput:
    """兼容旧测试/旧调用方的入参别名。"""
    raw_text: str
    title: str = ''
    entry_type: str = ''
    source_type: str = ''
    source_id: Optional[int] = None
    source_key: str = ''
    tags: List[str] = field(default_factory=list)
    summary: str = ''
    created_by_id: Optional[int] = None
    namespace: str = ''
    properties: Dict[str, Any] = field(default_factory=dict)
    uri: str = ''
    package_id: str = ''
    canonical_topic: str = ''
    facet: str = ''
    version: str = ''
    previous_entry_id: Optional[int] = None
    owner_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    next_review_at: Optional[datetime] = None


@dataclass
class PipelineResult:
    """管线处理结果"""
    success: bool = False
    entry_id: Optional[int] = None
    status: str = 'draft'
    quality_score: Optional[int] = None
    stage_errors: Dict[str, str] = field(default_factory=dict)
    stage_results: Dict[str, Any] = field(default_factory=dict)
    skipped_reason: str = ''


def _coerce_raw_input(raw: Any) -> RawKnowledgeInput:
    """兼容 RawKnowledgeInput / PipelineInput 两种入口。"""
    if isinstance(raw, RawKnowledgeInput):
        return raw
    if isinstance(raw, PipelineInput):
        return RawKnowledgeInput(
            content=raw.raw_text,
            title=raw.title,
            entry_type=raw.entry_type,
            source_type=raw.source_type,
            source_id=raw.source_id,
            source_key=raw.source_key,
            tags=list(raw.tags or []),
            summary=raw.summary,
            created_by_id=raw.created_by_id,
            namespace=raw.namespace,
            properties=dict(raw.properties or {}),
            uri=raw.uri,
            package_id=raw.package_id,
            canonical_topic=raw.canonical_topic,
            facet=raw.facet,
            version=raw.version,
            previous_entry_id=raw.previous_entry_id,
            owner_id=raw.owner_id,
            reviewer_id=raw.reviewer_id,
            next_review_at=raw.next_review_at,
        )
    raise TypeError(f'Unsupported pipeline input type: {type(raw)!r}')


def run_pipeline(raw: Any) -> Any:
    """
    执行完整的知识入库管线。

    返回 PipelineResult，其中 entry_id 不为 None 表示成功入库（即使部分阶段失败）。
    """
    if isinstance(raw, list):
        return [run_pipeline(item) for item in raw]

    raw = _coerce_raw_input(raw)
    result = PipelineResult()
    ctx: Dict[str, Any] = {
        'raw': raw,
        'title': raw.title.strip(),
        'content': raw.content.strip(),
        'entry_type': raw.entry_type,
        'source_type': raw.source_type,
        'source_id': raw.source_id,
        'source_key': raw.source_key,
        'tags': list(raw.tags or []),
        'summary': raw.summary.strip(),
        'namespace': raw.namespace,
        'properties': dict(raw.properties or {}),
        'uri': raw.uri,
        'package_id': raw.package_id.strip(),
        'canonical_topic': raw.canonical_topic.strip(),
        'facet': raw.facet.strip(),
        'version': raw.version.strip(),
        'previous_entry_id': raw.previous_entry_id,
        'owner_id': raw.owner_id,
        'reviewer_id': raw.reviewer_id,
        'next_review_at': raw.next_review_at,
        'created_by_id': raw.created_by_id,
        'entity_ids': [],
        'relation_ids': [],
    }

    # 阶段 1：去噪
    try:
        ctx, should_skip = _stage_noise_filter(ctx)
        if should_skip:
            result.skipped_reason = ctx.get('skip_reason', '内容被过滤')
            result.success = True
            return result
        result.stage_results['noise_filter'] = 'ok'
    except Exception as e:
        result.stage_errors['noise_filter'] = str(e)
        logger.warning('Pipeline[noise_filter] failed: %s', e)

    # 阶段 2：去重
    try:
        ctx, is_duplicate, existing_id = _stage_deduplication(ctx)
        if is_duplicate:
            result.entry_id = existing_id
            result.status = 'duplicate_skipped'
            result.success = True
            result.stage_results['deduplication'] = f'duplicate_of_{existing_id}'
            return result
        result.stage_results['deduplication'] = 'unique'
    except Exception as e:
        result.stage_errors['deduplication'] = str(e)
        logger.warning('Pipeline[deduplication] failed: %s', e)

    # 阶段 3：分块（如果内容过长，分成多个条目；通常 1 条输入 = 1 条输出）
    try:
        chunks = _stage_chunking(ctx)
        result.stage_results['chunking'] = len(chunks)
    except Exception as e:
        result.stage_errors['chunking'] = str(e)
        logger.warning('Pipeline[chunking] failed: %s', e)
        chunks = [ctx]  # 降级：当作单块处理

    # 对每个 chunk 独立处理（通常只有 1 个）
    all_entry_ids = []
    for chunk_ctx in chunks:
        chunk_result = _process_chunk(chunk_ctx, result)
        if chunk_result:
            all_entry_ids.append(chunk_result)

    if all_entry_ids:
        result.entry_id = all_entry_ids[0]
        result.success = True
    else:
        result.success = False

    return result


def _process_chunk(ctx: Dict[str, Any], result: PipelineResult) -> Optional[int]:
    """处理单个知识块，返回创建的 entry_id 或 None"""
    # 阶段 4：AI 分类（更新 entry_type 和 tags）
    try:
        ctx = _stage_classification(ctx)
        result.stage_results['classification'] = ctx.get('entry_type')
    except Exception as e:
        result.stage_errors['classification'] = str(e)
        logger.warning('Pipeline[classification] failed: %s', e)

    # 阶段 5：摘要生成
    try:
        ctx = _stage_summarization(ctx)
        result.stage_results['summarization'] = 'ok' if ctx.get('summary') else 'skipped'
    except Exception as e:
        result.stage_errors['summarization'] = str(e)
        logger.warning('Pipeline[summarization] failed: %s', e)

    # 阶段 6：实体抽取
    try:
        ctx = _stage_entity_extraction(ctx)
        result.stage_results['entity_extraction'] = len(ctx.get('extracted_entities', []))
    except Exception as e:
        result.stage_errors['entity_extraction'] = str(e)
        logger.warning('Pipeline[entity_extraction] failed: %s', e)

    # 阶段 7：关系抽取
    try:
        ctx = _stage_relation_extraction(ctx)
        result.stage_results['relation_extraction'] = len(ctx.get('extracted_relations', []))
    except Exception as e:
        result.stage_errors['relation_extraction'] = str(e)
        logger.warning('Pipeline[relation_extraction] failed: %s', e)

    # 阶段 8：质量评分
    try:
        ctx = _stage_quality_scoring(ctx)
        result.quality_score = ctx.get('quality_score')
        result.stage_results['quality_scoring'] = ctx.get('quality_score')
    except Exception as e:
        result.stage_errors['quality_scoring'] = str(e)
        logger.warning('Pipeline[quality_scoring] failed: %s', e)

    # 阶段 9：状态路由
    try:
        ctx = _stage_status_routing(ctx)
        result.status = ctx.get('status', 'pending_review')
        result.stage_results['status_routing'] = result.status
    except Exception as e:
        result.stage_errors['status_routing'] = str(e)
        result.status = 'pending_review'
        logger.warning('Pipeline[status_routing] failed: %s', e)

    # 写入数据库
    try:
        entry_id = _persist_entry(ctx)
        if not entry_id:
            return None
        result.stage_results['persist'] = entry_id
    except Exception as e:
        result.stage_errors['persist'] = str(e)
        logger.error('Pipeline[persist] failed: %s', e)
        return None

    # 持久化实体和关系（非阻断，失败不影响入库）
    if entry_id and (ctx.get('extracted_entities') or ctx.get('extracted_relations')):
        try:
            entity_count, relation_count = _persist_entities_and_relations(entry_id, ctx)
            result.stage_results['entities_persisted'] = entity_count
            result.stage_results['relations_persisted'] = relation_count
        except Exception as e:
            result.stage_errors['entities_persist'] = str(e)
            logger.warning('Pipeline[entities_persist] failed: %s', e)

    # 阶段 10：向量化触发（异步，失败不影响入库）
    try:
        _stage_trigger_vectorization(entry_id)
        result.stage_results['vectorization_triggered'] = True
    except Exception as e:
        result.stage_errors['vectorization'] = str(e)
        logger.warning('Pipeline[vectorization] trigger failed: %s', e)

    return entry_id


def _stage_noise_filter(ctx: Dict[str, Any]):
    """
    阶段 1：去噪
    过滤条件：纯表情/空消息/纯转发/过短内容（< 10 字）
    """
    content = ctx.get('content', '')
    title = ctx.get('title', '')

    # 过短内容
    if len(content.strip()) < 10 and len(title.strip()) < 5:
        ctx['skip_reason'] = f'内容过短（{len(content.strip())} 字）'
        return ctx, True

    # 简单噪声规则（后续可扩展为 ML 分类器）
    noise_patterns = [
        lambda t, c: len(c.strip()) == 0,
    ]
    for pattern in noise_patterns:
        if pattern(title, content):
            ctx['skip_reason'] = '内容为空'
            return ctx, True

    return ctx, False


def _stage_deduplication(ctx: Dict[str, Any]):
    """
    阶段 2：去重
    - 精确去重：source_type + source_id + source_key 三元组匹配
    - 哈希去重：基于内容哈希的 source_key 自动生成
    """
    from .models import KnowledgeEntry

    source_type = ctx.get('source_type', '')
    source_id = ctx.get('source_id')
    source_key = ctx.get('source_key', '')

    # 如果没有 source_key，根据内容生成哈希
    if not source_key and ctx.get('content'):
        content_hash = hashlib.sha1(
            (ctx.get('title', '') + '|' + ctx.get('content', '')).encode('utf-8')
        ).hexdigest()[:40]
        ctx['source_key'] = f'hash:{content_hash}'
        source_key = ctx['source_key']

    # 精确去重检查
    if source_type and source_id is not None and source_key:
        existing = KnowledgeEntry.objects.filter(
            source_type=source_type,
            source_id=source_id,
            source_key=source_key,
            is_deleted=False,
        ).first()
        if existing:
            logger.debug('Dedup: found existing entry #%s for %s/%s/%s',
                         existing.id, source_type, source_id, source_key)
            return ctx, True, existing.id

    return ctx, False, None


def _call_kimi_enrich(content: str, title: str, entry_type_hint: str) -> Optional[Dict[str, Any]]:
    """
    调用 LLM 对知识内容做一次性多任务加工：
    - 分类（entry_type）
    - 专业摘要（3句话，面向业务场景）
    - 实体抽取（NER）
    - 关系抽取（语义关系）

    优先顺序：DeepSeek → Kimi（降级）
    返回结构化 JSON 或 None（失败时返回 None，调用方降级到规则实现）
    """
    system_prompt = """你是化妆品功效评价CRO行业的专业知识加工系统。请对输入的文档内容进行多维度结构化分析。

必须严格按照以下JSON格式返回，不要有任何额外文字：
{
  "entry_type": "<类型，从以下选择：regulation/sop/proposal_template/method_reference/lesson_learned/faq/competitor_intel/instrument_spec/ingredient_data/meeting_decision/market_insight/paper_abstract>",
  "summary": "<3句话的专业摘要，面向业务人员，说明核心价值和关键知识点>",
  "tags": ["<标签1>", "<标签2>", "<标签3>"],
  "entities": [
    {"label": "<实体名称>", "entity_type": "<instrument/method/ingredient/regulation_entity/concept/paper/competitor/measurement>", "description": "<简短说明>"}
  ],
  "relations": [
    {"subject": "<主体实体名>", "relation": "<governed_by/tested_by/limited_by/has_measurement/requires/used_in/related_to>", "object": "<客体实体名>", "evidence": "<文中依据片段>"}
  ]
}"""

    combined_text = f"标题：{title}\n\n内容：{content[:3000]}"
    user_prompt = f"""请对以下化妆品功效评价专业文档进行结构化加工：

{combined_text}

额外提示：当前文档可能是 {entry_type_hint or '未知类型'} 类型，请综合内容判断最准确的分类。"""

    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]

    # 优先尝试 DeepSeek（成本更低，中文专业能力强）
    try:
        from apps.agent_gateway.services import get_deepseek_client, rotate_deepseek_key
        import django.conf
        if getattr(django.conf.settings, 'DEEPSEEK_API_KEY', ''):
            client = get_deepseek_client()
            model = getattr(django.conf.settings, 'DEEPSEEK_DEFAULT_MODEL', 'deepseek-chat')
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=2000,
                    timeout=25,
                )
                raw = resp.choices[0].message.content or ''
                raw = raw.strip()
                if raw.startswith('```'):
                    raw = re.sub(r'^```\w*\s*', '', raw)
                    raw = re.sub(r'\s*```$', '', raw)
                result = json.loads(raw)
                logger.debug('DeepSeek enrich 成功')
                return result
            except Exception as ds_err:
                err_str = str(ds_err).lower()
                if 'insufficient balance' in err_str or '402' in err_str:
                    logger.warning('DeepSeek Key 余额不足，尝试切换...')
                    if rotate_deepseek_key():
                        pass  # 下次调用会用新 Key
                logger.debug('DeepSeek enrich 失败，降级到 Kimi: %s', ds_err)
    except Exception:
        pass  # DeepSeek 未配置，直接用 Kimi

    # 降级：Kimi
    try:
        from apps.agent_gateway.services import get_kimi_client
        client = get_kimi_client()
        resp = client.chat.completions.create(
            model='moonshot-v1-32k',
            messages=messages,
            temperature=0.1,
            max_tokens=2000,
            timeout=25,
        )
        raw = resp.choices[0].message.content or ''
        raw = raw.strip()
        if raw.startswith('```'):
            raw = re.sub(r'^```\w*\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)
        return json.loads(raw)
    except Exception as e:
        logger.debug('LLM enrich call failed (will fallback to rules): %s', e)
        return None


# ── 分块辅助 ──────────────────────────────────────────────────────────────────

def _chunk_regulation_text(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """法规/标准文档：按条款、章节分块，每块不超过 1200 字。"""
    content = ctx.get('content', '')
    title = ctx.get('title', '')

    # 按条款（第X条/X.X/Article X）切分
    clause_pattern = re.compile(
        r'(?:^|\n)(?:第\s*[一二三四五六七八九十百\d]+\s*[条章节款项]|Article\s+\d+|Section\s+\d+|\d+\.\d+[\s　])',
        re.MULTILINE
    )
    parts = clause_pattern.split(content)
    separators = clause_pattern.findall(content)

    if len(parts) <= 1 or len(content) <= 1500:
        return [ctx]

    chunks = []
    for i, part in enumerate(parts):
        if not part.strip():
            continue
        sep = separators[i - 1].strip() if i > 0 and i - 1 < len(separators) else ''
        chunk_content = (sep + ' ' + part).strip()
        if not chunk_content:
            continue
        chunk_ctx = dict(ctx)
        chunk_ctx['content'] = chunk_content
        chunk_ctx['title'] = f"{title} — {sep[:30]}" if sep else title
        chunk_ctx['source_key'] = ''  # 清空让 dedup 重新生成哈希
        chunks.append(chunk_ctx)

    return chunks if chunks else [ctx]


def _chunk_paper_text(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """论文文档：按背景/方法/结果/结论分块，每块独立检索。"""
    content = ctx.get('content', '')
    title = ctx.get('title', '')

    section_pattern = re.compile(
        r'(?:^|\n)(?:背景|目的|方法|结果|结论|讨论|Abstract|Background|Methods?|Results?|Conclusion|Discussion)[：:。\s]',
        re.MULTILINE | re.IGNORECASE,
    )
    parts = section_pattern.split(content)
    separators = section_pattern.findall(content)

    if len(parts) <= 1 or len(content) <= 1200:
        return [ctx]

    chunks = []
    for i, part in enumerate(parts):
        if not part.strip() or len(part.strip()) < 50:
            continue
        sep = separators[i - 1].strip() if i > 0 and i - 1 < len(separators) else ''
        chunk_ctx = dict(ctx)
        chunk_ctx['content'] = part.strip()
        chunk_ctx['title'] = f"{title} [{sep}]" if sep else title
        chunk_ctx['source_key'] = ''
        chunks.append(chunk_ctx)

    return chunks if len(chunks) > 1 else [ctx]


def _chunk_by_paragraphs(ctx: Dict[str, Any], max_chars: int = 1200) -> List[Dict[str, Any]]:
    """通用段落分块，按空行切分，合并过短段落，超过 max_chars 时截断。"""
    content = ctx.get('content', '')
    title = ctx.get('title', '')

    if len(content) <= max_chars:
        return [ctx]

    paragraphs = [p.strip() for p in re.split(r'\n{2,}', content) if p.strip()]
    if len(paragraphs) <= 1:
        # 无双空行，强制按长度切割
        chunks = []
        for i in range(0, len(content), max_chars):
            chunk_ctx = dict(ctx)
            chunk_ctx['content'] = content[i:i + max_chars]
            chunk_ctx['title'] = f"{title} (第{i // max_chars + 1}段)"
            chunk_ctx['source_key'] = ''
            chunks.append(chunk_ctx)
        return chunks

    chunks = []
    current = []
    current_len = 0
    for para in paragraphs:
        if current_len + len(para) > max_chars and current:
            chunk_ctx = dict(ctx)
            chunk_ctx['content'] = '\n\n'.join(current)
            chunk_ctx['title'] = title
            chunk_ctx['source_key'] = ''
            chunks.append(chunk_ctx)
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += len(para)

    if current:
        chunk_ctx = dict(ctx)
        chunk_ctx['content'] = '\n\n'.join(current)
        chunk_ctx['title'] = title
        chunk_ctx['source_key'] = ''
        chunks.append(chunk_ctx)

    return chunks if len(chunks) > 1 else [ctx]


def _stage_chunking(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    阶段 3：智能分块
    - 短内容（< 1500 字）：不分块
    - 法规/标准/SOP：按条款分块
    - 论文摘要：按背景/方法/结果/结论分块
    - 其他长文档：按段落分块（最大 1200 字/块）
    """
    content = ctx.get('content', '')
    entry_type = ctx.get('entry_type', '')
    source_type = ctx.get('source_type', '')

    # 短内容不分块
    if len(content) <= 1500:
        return [ctx]

    # 按类型选择分块策略
    if entry_type in ('regulation', 'sop', 'method_reference') or source_type in ('regulation_tracker', 'sop_sync'):
        return _chunk_regulation_text(ctx)

    if entry_type == 'paper_abstract' or source_type == 'paper_scout':
        return _chunk_paper_text(ctx)

    # 通用段落分块
    return _chunk_by_paragraphs(ctx)


def _stage_classification(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    阶段 4：AI 分类（LLM 优先，规则 fallback）
    - 若 entry_type 已明确，跳过分类
    - 调用 LLM 联合推断 entry_type + summary + entities + relations，结果缓存到 ctx
    - LLM 失败时降级到规则分类
    """
    if ctx.get('entry_type'):
        return ctx

    # 尝试 LLM 加工（同时做摘要和实体，缓存结果）
    content = ctx.get('content', '')
    title = ctx.get('title', '')
    if _LLM_ENRICH_ENABLED and len(content) >= _LLM_ENRICH_MIN_LEN and not ctx.get('_llm_result'):
        result = _call_kimi_enrich(content, title, ctx.get('source_type', ''))
        if result:
            ctx['_llm_result'] = result

    if ctx.get('_llm_result'):
        llm_entry_type = ctx['_llm_result'].get('entry_type', '')
        if llm_entry_type:
            ctx['entry_type'] = llm_entry_type
            return ctx

    # 规则降级
    source_type = ctx.get('source_type', '')
    title_lower = title.lower()
    content_lower = content.lower()

    if source_type in ('sop', 'sop_sync', 'internal_sop'):
        ctx['entry_type'] = 'sop'
    elif source_type == 'regulation_tracker':
        ctx['entry_type'] = 'regulation'
    elif source_type == 'paper_scout':
        ctx['entry_type'] = 'paper_abstract'
    elif source_type == 'competitor_monitor':
        ctx['entry_type'] = 'competitor_intel'
    elif source_type == 'instrument_knowledge_builder':
        ctx['entry_type'] = 'instrument_spec'
    elif source_type in ('feishu_meeting', 'meeting'):
        ctx['entry_type'] = 'meeting_decision'
    elif source_type in ('feishu_chat', 'chat'):
        ctx['entry_type'] = 'lesson_learned'
    elif 'sop' in title_lower or 'standard operating' in content_lower:
        ctx['entry_type'] = 'sop'
    elif '法规' in title_lower or 'regulation' in title_lower or 'nmpa' in content_lower:
        ctx['entry_type'] = 'regulation'
    elif 'ich' in content_lower or 'gcp' in content_lower or 'gb/t' in content_lower:
        ctx['entry_type'] = 'regulation'
    elif 'corneometer' in content_lower or 'tewameter' in content_lower or 'cutometer' in content_lower:
        ctx['entry_type'] = 'instrument_spec'
    elif 'pubmed' in content_lower or 'doi:' in content_lower or 'abstract' in title_lower:
        ctx['entry_type'] = 'paper_abstract'
    elif '成分' in title_lower or 'inci' in content_lower or 'ingredient' in content_lower:
        ctx['entry_type'] = 'ingredient_data'
    else:
        ctx['entry_type'] = 'lesson_learned'

    return ctx


def _stage_summarization(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    阶段 5：摘要生成（LLM 优先，截取 fallback）
    - 若 summary 已存在，跳过
    - 优先使用 LLM 联合加工结果（与分类共享一次 LLM 调用）
    - LLM 失败时截取前 300 字作为降级摘要
    """
    if ctx.get('summary'):
        return ctx

    # 优先使用 LLM 联合加工结果
    if ctx.get('_llm_result'):
        llm_summary = ctx['_llm_result'].get('summary', '')
        if llm_summary and len(llm_summary) > 20:
            ctx['summary'] = llm_summary
            # 同时补充 LLM 推断的标签
            llm_tags = ctx['_llm_result'].get('tags', [])
            if llm_tags and not ctx.get('tags'):
                ctx['tags'] = [str(t) for t in llm_tags if t]
            return ctx

    # 降级：截取前 300 字（比原来的 200 字更长）
    content = ctx.get('content', '')
    title = ctx.get('title', '')

    if _LLM_ENRICH_ENABLED and len(content) >= _LLM_ENRICH_MIN_LEN and not ctx.get('_llm_result'):
        result = _call_kimi_enrich(content, title, ctx.get('entry_type', ''))
        if result:
            ctx['_llm_result'] = result
            llm_summary = result.get('summary', '')
            if llm_summary and len(llm_summary) > 20:
                ctx['summary'] = llm_summary
                llm_tags = result.get('tags', [])
                if llm_tags and not ctx.get('tags'):
                    ctx['tags'] = [str(t) for t in llm_tags if t]
                return ctx

    if content:
        summary = content.strip()[:300]
        if len(content) > 300:
            summary += '...'
        ctx['summary'] = summary
    elif title:
        ctx['summary'] = title

    return ctx


def _stage_entity_extraction(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    阶段 6：实体抽取（LLM NER 优先，词典规则 fallback）

    优先使用 _llm_result 中的实体（由阶段 4/5 联合调用产生）。
    LLM 实体结构：{'label': str, 'entity_type': str, 'description': str}
    输出格式：[{'label': str, 'entity_type': str, 'uri_suffix': str}, ...]
    """
    entities = []
    content = (ctx.get('content', '') + ' ' + ctx.get('title', '')).strip()
    entry_type = ctx.get('entry_type', '')

    if not content:
        ctx['extracted_entities'] = entities
        return ctx

    seen_labels = set()

    def _add_entity(label: str, entity_type: str):
        label = label.strip()
        if label and label not in seen_labels:
            seen_labels.add(label)
            uri_suffix = label.lower().replace(' ', '-').replace('/', '-')
            entities.append({
                'label': label,
                'entity_type': entity_type,
                'uri_suffix': uri_suffix,
            })

    # 优先使用 LLM 抽取结果
    if ctx.get('_llm_result'):
        for ent in (ctx['_llm_result'].get('entities') or []):
            if isinstance(ent, dict) and ent.get('label') and ent.get('entity_type'):
                _add_entity(str(ent['label']), str(ent['entity_type']))

    # 词典规则作为补充（填补 LLM 可能遗漏的关键仪器/法规编号）
    for instrument_name in INSTRUMENT_KEYWORDS:
        if instrument_name.lower() in content.lower():
            _add_entity(instrument_name, 'instrument')

    if entry_type in ('regulation', 'method_reference', 'sop', 'instrument_spec', ''):
        for pattern, entity_type in REGULATION_PATTERNS:
            for match in pattern.findall(content):
                _add_entity(match, entity_type)

    if entry_type in ('ingredient_data', 'regulation', 'method_reference', ''):
        for ingredient in INGREDIENT_KEYWORDS:
            if ingredient in content:
                _add_entity(ingredient, 'ingredient')

    if entry_type in ('method_reference', 'instrument_spec', 'sop', ''):
        for method in METHOD_KEYWORDS:
            if method.lower() in content.lower():
                _add_entity(method, 'method')

    if entry_type in ('market_insight', 'method_reference', 'regulation', 'competitor_intel', ''):
        for claim in CLAIM_KEYWORDS:
            if claim in content:
                _add_entity(claim, 'concept')

    ctx['extracted_entities'] = entities
    return ctx


def _stage_relation_extraction(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    阶段 7：关系抽取（LLM 语义关系优先，类型配对规则 fallback）

    优先使用 _llm_result 中的关系（有文本证据支撑的真实语义关系）。
    LLM 关系结构：{'subject': str, 'relation': str, 'object': str, 'evidence': str}
    输出格式：[{'subject_uri_suffix': str, 'object_uri_suffix': str, 'relation_type': str}, ...]
    """
    entities = ctx.get('extracted_entities', [])
    relations = []
    seen_pairs = set()

    def _uri(label: str) -> str:
        return label.lower().replace(' ', '-').replace('/', '-')

    def _add_relation(subj_label: str, subj_type: str, obj_label: str, obj_type: str, rel_type: str):
        subj_uri = _uri(subj_label)
        obj_uri = _uri(obj_label)
        pair_key = (subj_uri, obj_uri, rel_type)
        if pair_key in seen_pairs:
            return
        seen_pairs.add(pair_key)
        relations.append({
            'subject_uri_suffix': subj_uri,
            'object_uri_suffix': obj_uri,
            'subject_label': subj_label,
            'object_label': obj_label,
            'subject_entity_type': subj_type,
            'object_entity_type': obj_type,
            'relation_type': rel_type,
        })

    # 构建实体类型索引，用于 LLM 关系主客体匹配
    entity_type_map = {ent['label']: ent['entity_type'] for ent in entities}

    # 优先使用 LLM 关系抽取结果
    if ctx.get('_llm_result'):
        for rel in (ctx['_llm_result'].get('relations') or []):
            if not isinstance(rel, dict):
                continue
            subj_label = str(rel.get('subject', '')).strip()
            obj_label = str(rel.get('object', '')).strip()
            rel_type = str(rel.get('relation', '')).strip()
            if not (subj_label and obj_label and rel_type):
                continue
            # 有效关系类型白名单
            valid_rel_types = {
                'governed_by', 'tested_by', 'limited_by', 'has_measurement',
                'requires', 'used_in', 'related_to', 'measured_by',
                'part_of', 'is_a', 'improves', 'published_by',
            }
            if rel_type not in valid_rel_types:
                rel_type = 'related_to'
            subj_type = entity_type_map.get(subj_label, 'concept')
            obj_type = entity_type_map.get(obj_label, 'concept')
            _add_relation(subj_label, subj_type, obj_label, obj_type, rel_type)

    # 规则推断作为补充
    if len(entities) >= 2:
        for i, subj in enumerate(entities):
            for j, obj in enumerate(entities):
                if i == j:
                    continue
                rel_type = ENTITY_RELATION_RULES.get(
                    (subj['entity_type'], obj['entity_type'])
                )
                if rel_type:
                    _add_relation(
                        subj['label'], subj['entity_type'],
                        obj['label'], obj['entity_type'],
                        rel_type,
                    )

    ctx['extracted_relations'] = relations
    return ctx


def _stage_quality_scoring(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """阶段 8：质量评分（五维度版）"""
    from .quality_scorer import score_entry

    properties = ctx.get('properties', {})
    has_source_url = bool(
        properties.get('source_url') or properties.get('url') or
        ctx.get('uri', '')
    )

    score_result = score_entry(
        title=ctx.get('title', ''),
        content=ctx.get('content', ''),
        summary=ctx.get('summary', ''),
        tags=ctx.get('tags', []),
        source_type=ctx.get('source_type', ''),
        entry_type=ctx.get('entry_type', ''),
        entity_count=len(ctx.get('extracted_entities', [])),
        relation_count=len(ctx.get('extracted_relations', [])),
        has_source_url=has_source_url,
        properties=properties,
    )

    ctx['quality_score'] = score_result['total']
    ctx['quality_routing'] = score_result['routing']
    ctx['quality_details'] = score_result
    return ctx


def _stage_status_routing(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    阶段 9：状态路由
    根据质量评分和来源决定知识条目的初始状态
    """
    from .quality_scorer import route_to_status

    routing = ctx.get('quality_routing', 'pending_review')
    status = route_to_status(routing)
    ctx['status'] = status

    # is_published 与 status 同步：只有 published 状态才设为 True
    ctx['is_published'] = (status == 'published')

    return ctx


def _persist_entry(ctx: Dict[str, Any]) -> Optional[int]:
    """将上下文持久化为 KnowledgeEntry"""
    from django.db import transaction
    from .models import KnowledgeEntry
    from .search_index import build_search_vector_text

    with transaction.atomic():
        topic_package = _resolve_topic_package(ctx)
        governance_fields = _resolve_governance_fields(ctx)
        entry, created = KnowledgeEntry.objects.get_or_create(
            source_type=ctx.get('source_type', ''),
            source_id=ctx.get('source_id'),
            source_key=ctx.get('source_key', '') or f'pipeline:{datetime.now().timestamp()}',
            is_deleted=False,
            defaults={
                'entry_type': ctx.get('entry_type', 'lesson_learned'),
                'title': ctx.get('title', ''),
                'content': ctx.get('content', ''),
                'summary': ctx.get('summary', ''),
                'tags': ctx.get('tags', []),
                'namespace': ctx.get('namespace', 'cnkis'),
                'uri': ctx.get('uri', ''),
                'created_by_id': ctx.get('created_by_id'),
                'status': ctx.get('status', 'pending_review'),
                'is_published': ctx.get('is_published', False),
                'quality_score': ctx.get('quality_score'),
                'search_vector_text': build_search_vector_text(
                    ctx.get('title', ''),
                    ctx.get('summary', ''),
                    ctx.get('content', ''),
                ),
                'version': ctx.get('version', ''),
                'topic_package': topic_package,
                'facet': ctx.get('facet', ''),
                'index_status': 'pending',
                **governance_fields,
            }
        )

        if not created:
            # 更新已存在的条目
            update_fields = ['title', 'content', 'summary', 'tags', 'entry_type',
                             'status', 'is_published', 'quality_score', 'topic_package',
                             'facet', 'update_time']
            entry.title = ctx.get('title', entry.title)
            entry.content = ctx.get('content', entry.content)
            entry.summary = ctx.get('summary', entry.summary)
            entry.tags = ctx.get('tags', entry.tags)
            entry.entry_type = ctx.get('entry_type', entry.entry_type)
            entry.status = ctx.get('status', entry.status)
            entry.is_published = ctx.get('is_published', entry.is_published)
            entry.quality_score = ctx.get('quality_score', entry.quality_score)
            entry.search_vector_text = build_search_vector_text(entry.title, entry.summary, entry.content)
            entry.version = ctx.get('version', entry.version)
            entry.topic_package = topic_package
            entry.facet = ctx.get('facet', entry.facet)
            entry.owner_id = governance_fields.get('owner_id')
            entry.reviewer_id = governance_fields.get('reviewer_id')
            entry.next_review_at = governance_fields.get('next_review_at')
            update_fields.append('search_vector_text')
            update_fields.append('version')
            update_fields.extend(['owner', 'reviewer', 'next_review_at'])
            entry.save(update_fields=update_fields)
            logger.info('Pipeline: updated entry #%s: %s', entry.id, entry.title[:50])
        else:
            logger.info('Pipeline: created entry #%s: %s (status=%s, score=%s)',
                        entry.id, entry.title[:50], entry.status, entry.quality_score)

        previous_entry_id = ctx.get('previous_entry_id')
        if previous_entry_id and previous_entry_id != entry.id:
            previous_entry = KnowledgeEntry.objects.filter(
                id=previous_entry_id,
                is_deleted=False,
            ).exclude(id=entry.id).first()
            if previous_entry:
                previous_entry.status = 'archived'
                previous_entry.is_published = False
                previous_entry.superseded_by = entry
                previous_entry.save(update_fields=['status', 'is_published', 'superseded_by', 'update_time'])

        _refresh_topic_package_coverage(entry)
        return entry.id


def _resolve_governance_fields(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """根据显式字段或 namespace 域策略，补齐 owner/reviewer/复核时间。"""
    owner_id = ctx.get('owner_id')
    reviewer_id = ctx.get('reviewer_id')
    next_review_at = ctx.get('next_review_at')

    if owner_id or reviewer_id or next_review_at:
        return {
            'owner_id': owner_id,
            'reviewer_id': reviewer_id,
            'next_review_at': next_review_at,
        }

    namespace = ctx.get('namespace', '')
    if not namespace:
        return {'owner_id': None, 'reviewer_id': None, 'next_review_at': None}

    try:
        from .models import KnowledgeDomainPolicy

        policy = KnowledgeDomainPolicy.objects.filter(
            namespace=namespace,
            is_active=True,
        ).first()
        if not policy:
            return {'owner_id': None, 'reviewer_id': None, 'next_review_at': None}

        due_at = timezone.now() + timedelta(days=max(policy.review_cycle_days or 0, 0))
        return {
            'owner_id': policy.owner_id,
            'reviewer_id': policy.reviewer_id,
            'next_review_at': due_at,
        }
    except Exception as exc:
        logger.debug('Resolve governance fields skipped namespace=%s error=%s', namespace, exc)
        return {'owner_id': None, 'reviewer_id': None, 'next_review_at': None}


def _resolve_topic_package(ctx: Dict[str, Any]):
    """
    从 ctx 中解析或创建 TopicPackage。

    支持两种输入方式：
    1. 显式字段：package_id / canonical_topic / facet
    2. properties.topic_package: {package_id, canonical_topic, facet, ...}
    """
    from .models import TopicPackage

    properties = ctx.get('properties') or {}
    package_meta = properties.get('topic_package') if isinstance(properties, dict) else {}
    if not isinstance(package_meta, dict):
        package_meta = {}

    package_id = (ctx.get('package_id') or package_meta.get('package_id') or '').strip()
    canonical_topic = (
        ctx.get('canonical_topic') or
        package_meta.get('canonical_topic') or
        properties.get('canonical_topic') or
        ''
    ).strip()
    facet = (ctx.get('facet') or package_meta.get('facet') or '').strip()

    if not package_id and not canonical_topic:
        return None
    if not package_id:
        package_id = 'pkg_' + re.sub(r'[^a-z0-9]+', '_', canonical_topic.lower()).strip('_')

    defaults = {
        'canonical_topic': canonical_topic or package_id,
        'description': package_meta.get('description', ''),
        'coverage_weight': float(package_meta.get('coverage_weight', 1.0) or 1.0),
        'required_for_release': bool(package_meta.get('required_for_release', False)),
        'source_authority_level': package_meta.get('source_authority_level', 'mixed') or 'mixed',
        'properties': {
            'cluster_keywords': package_meta.get('cluster_keywords', []),
            'related_packages': package_meta.get('related_packages', []),
            'n8n_workflow_id': package_meta.get('n8n_workflow_id', ''),
        },
    }
    topic_package, _ = TopicPackage.objects.get_or_create(
        package_id=package_id,
        defaults=defaults,
    )

    updates = []
    if canonical_topic and topic_package.canonical_topic != canonical_topic:
        topic_package.canonical_topic = canonical_topic
        updates.append('canonical_topic')
    if updates:
        topic_package.save(update_fields=updates)

    if facet and not ctx.get('facet'):
        ctx['facet'] = facet
    return topic_package


def _refresh_topic_package_coverage(entry) -> None:
    """根据 entry 的当前归属，刷新 TopicPackage 的 facet 覆盖统计。"""
    from .models import KnowledgeEntry, TopicPackage

    if not entry.topic_package_id:
        return

    topic_package = TopicPackage.objects.filter(
        id=entry.topic_package_id,
        is_deleted=False,
    ).first()
    if not topic_package:
        return

    facet_rows = KnowledgeEntry.objects.filter(
        topic_package_id=topic_package.id,
        is_deleted=False,
    ).exclude(facet='').values_list('facet', 'id')

    facets: Dict[str, Dict[str, Any]] = {
        facet: {'count': 0, 'entry_ids': []}
        for facet in topic_package.DEFAULT_FACETS
    }
    for facet, entry_id in facet_rows:
        bucket = facets.setdefault(facet, {'count': 0, 'entry_ids': []})
        bucket['count'] += 1
        bucket['entry_ids'].append(entry_id)

    topic_package.facets = facets
    topic_package.save(update_fields=['facets', 'update_time'])


def _persist_entities_and_relations(entry_id: int, ctx: Dict[str, Any]) -> tuple:
    """
    将阶段 6/7 抽取的实体和关系持久化到数据库。
    每个实体通过 linked_entry 关联到当前 entry，使图谱检索通道可映射到 KnowledgeEntry。

    返回: (entity_count, relation_count)
    """
    from django.db import transaction
    from .models import (
        KnowledgeEntry, KnowledgeEntity, KnowledgeRelation,
        EntityType, OntologyNamespace, RelationType,
    )

    extracted_entities = ctx.get('extracted_entities', [])
    extracted_relations = ctx.get('extracted_relations', [])

    if not extracted_entities:
        return 0, 0

    entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if not entry:
        return 0, 0

    namespace = ctx.get('namespace', OntologyNamespace.CNKIS)
    entity_count = 0
    relation_count = 0
    entity_map: Dict[str, KnowledgeEntity] = {}

    # EntityType 字符串 → 枚举值映射
    ENTITY_TYPE_MAP = {
        'instrument': EntityType.INSTRUMENT,
        'method': EntityType.METHOD,
        'ingredient': EntityType.INGREDIENT,
        'regulation_entity': EntityType.REGULATION_ENTITY,
        'concept': EntityType.CONCEPT,
        'paper': EntityType.PAPER,
        'competitor': EntityType.COMPETITOR,
    }
    # RelationType 字符串 → 枚举值映射
    RELATION_TYPE_MAP = {
        'tested_by': RelationType.TESTED_BY,
        'governed_by': RelationType.GOVERNED_BY,
        'limited_by': RelationType.LIMITED_BY,
        'measured_by': RelationType.MEASURED_BY,
        'related_to': RelationType.RELATED_TO,
        'used_in': RelationType.USED_IN,
    }

    with transaction.atomic():
        for ent_data in extracted_entities:
            uri_suffix = ent_data['uri_suffix']
            uri = f'pipeline:{namespace}:{uri_suffix}'[:500]
            entity_type = ENTITY_TYPE_MAP.get(ent_data['entity_type'], EntityType.CONCEPT)

            entity, created = KnowledgeEntity.objects.get_or_create(
                namespace=namespace,
                uri=uri,
                is_deleted=False,
                defaults={
                    'label': ent_data['label'][:500],
                    'label_en': ent_data['label'][:500],
                    'definition': f'从知识条目自动抽取的{ent_data["entity_type"]}实体',
                    'entity_type': entity_type,
                    'linked_entry': entry,
                    'properties': {
                        'source': 'pipeline_extraction',
                        'entry_id': entry_id,
                    },
                },
            )
            entity_map[uri_suffix] = entity

            if created:
                entity_count += 1
            elif entity.linked_entry_id is None:
                # 补充关联
                entity.linked_entry = entry
                entity.save(update_fields=['linked_entry'])

        for rel_data in extracted_relations:
            subj = entity_map.get(rel_data['subject_uri_suffix'])
            obj = entity_map.get(rel_data['object_uri_suffix'])
            if not subj or not obj:
                continue

            relation_type = RELATION_TYPE_MAP.get(
                rel_data['relation_type'], RelationType.RELATED_TO
            )
            predicate_uri = f'cnkis:{rel_data["relation_type"]}'

            _, created = KnowledgeRelation.objects.get_or_create(
                subject=subj,
                predicate_uri=predicate_uri,
                object=obj,
                is_deleted=False,
                defaults={
                    'relation_type': relation_type,
                    'confidence': 0.8,
                    'source': 'pipeline_extraction',
                    'metadata': {'entry_id': entry_id},
                },
            )
            if created:
                relation_count += 1

    return entity_count, relation_count


def _stage_trigger_vectorization(entry_id: int):
    """
    阶段 10：触发异步向量化任务
    Celery task：knowledge.tasks.vectorize_knowledge_entry

    测试环境通过 conftest.py 的全局 mock_celery_tasks fixture 拦截，
    生产环境需要 REDIS_URL / CELERY_BROKER_URL 环境变量正确配置。
    """
    try:
        import os

        broker_url = os.getenv('CELERY_BROKER_URL') or os.getenv('REDIS_URL', '')
        if not broker_url:
            logger.debug(
                'Vectorization task skipped for entry #%s (no broker configured)',
                entry_id
            )
            return

        # 确保 celery_app 已初始化并绑定正确的 broker
        # manage.py 命令启动时不会自动导入 celery_app，需要显式导入
        try:
            import celery_app as _ca  # noqa: F401
        except Exception:
            pass

        from celery import current_app
        # 若 current_app 的 broker_url 仍为 None（celery_app 导入顺序问题），
        # 直接用 broker_url 创建连接发送任务
        if not current_app.conf.broker_url:
            from celery import Celery
            _tmp = Celery()
            _tmp.conf.broker_url = broker_url
            _tmp.conf.result_backend = broker_url
            _tmp.send_task(
                'apps.knowledge.tasks.vectorize_knowledge_entry',
                args=[entry_id],
                countdown=10,
            )
        else:
            current_app.send_task(
                'apps.knowledge.tasks.vectorize_knowledge_entry',
                args=[entry_id],
                countdown=10,
                retry=True,
                retry_policy={
                    'max_retries': 3,
                    'interval_start': 60,
                    'interval_step': 240,
                    'interval_max': 900,
                }
            )
        logger.debug('Vectorization task queued for entry #%s', entry_id)
    except Exception as e:
        logger.warning('Failed to queue vectorization for entry #%s: %s', entry_id, e)
        # 不 raise，让 pipeline 继续——向量化由 vectorize_all_entries 批量补充
