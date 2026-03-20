"""
飞书文档知识化提取器

负责：
1. 拉取飞书文档 blocks
2. 转换为可入库正文
3. 差异检测，避免重复入库
4. 文档类型映射（方案文档 / SOP）
5. 复用现有 ingestion pipeline 与版本替换链
"""
import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

from apps.document.models import Document
from apps.knowledge.ingestion_pipeline import PipelineResult, RawKnowledgeInput, run_pipeline
from apps.knowledge.models import EntryType, KnowledgeEntry, OntologyNamespace
from libs.feishu_client import feishu_client

logger = logging.getLogger(__name__)

DOCUMENT_SOURCE_TYPE = 'document_publish'


def harvest_feishu_document_knowledge(
    document_id: Optional[int] = None,
    feishu_doc_token: str = '',
    trigger: str = 'manual',
    event_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    将飞书文档沉淀为知识条目。

    返回结构：
      {
        status: created/updated/skipped/error,
        reason: str,
        entry_id: Optional[int],
        document_id: Optional[int],
        feishu_doc_token: str,
      }
    """
    document = _resolve_document(document_id=document_id, feishu_doc_token=feishu_doc_token)
    if not document:
        return _result('skipped', 'document_not_found', document_id=document_id, feishu_doc_token=feishu_doc_token)

    doc_token = document.feishu_doc_token or feishu_doc_token
    if not doc_token:
        return _result('skipped', 'missing_feishu_doc_token', document_id=document.id)

    mapping = map_document_to_knowledge_profile(document)
    if not mapping:
        return _result(
            'skipped',
            'unsupported_document_type',
            document_id=document.id,
            feishu_doc_token=doc_token,
        )

    try:
        meta = feishu_client.get_document(doc_token) or {}
        blocks = feishu_client.get_all_document_blocks(doc_token)
        content = blocks_to_plain_text(blocks)
    except Exception as exc:
        logger.error('Failed to fetch feishu document content doc=%s token=%s error=%s', document.id, doc_token, exc)
        return _result(
            'error',
            f'fetch_failed:{exc}',
            document_id=document.id,
            feishu_doc_token=doc_token,
        )

    normalized_content = normalize_document_text(content)
    if not normalized_content:
        return _result(
            'skipped',
            'empty_document_content',
            document_id=document.id,
            feishu_doc_token=doc_token,
        )

    latest_entry = get_latest_document_entry(document.id)
    if latest_entry and normalize_document_text(latest_entry.content) == normalized_content:
        return _result(
            'skipped',
            'no_content_change',
            entry_id=latest_entry.id,
            document_id=document.id,
            feishu_doc_token=doc_token,
        )

    version = resolve_document_version(document, meta)
    source_key = build_document_source_key(document, version, normalized_content)
    previous_entry = latest_entry if latest_entry and latest_entry.source_key != source_key else None

    raw = RawKnowledgeInput(
        title=build_entry_title(document, mapping['entry_type']),
        content=content,
        entry_type=mapping['entry_type'],
        source_type=DOCUMENT_SOURCE_TYPE,
        source_id=document.id,
        source_key=source_key,
        tags=mapping['tags'],
        summary=document.description or '',
        namespace=mapping['namespace'],
        uri=f'feishu-doc://{doc_token}',
        version=version,
        previous_entry_id=previous_entry.id if previous_entry else None,
        properties={
            'feishu_doc_token': doc_token,
            'document_no': document.document_no,
            'document_version': document.version,
            'document_category_code': getattr(document.category, 'code', ''),
            'document_category_name': getattr(document.category, 'name', ''),
            'doc_revision': str(_extract_doc_revision(meta)),
            'trigger': trigger,
            'event_data': event_data or {},
            'source_url': extract_doc_url(meta),
        },
    )

    pipeline_result = run_pipeline(raw)
    entry = KnowledgeEntry.objects.filter(id=pipeline_result.entry_id, is_deleted=False).first() if pipeline_result.entry_id else None
    if not pipeline_result.success or not entry:
        return _result(
            'error',
            'pipeline_failed',
            document_id=document.id,
            feishu_doc_token=doc_token,
        )

    status = 'updated' if previous_entry else 'created'
    return _result(
        status,
        'ingested',
        entry_id=entry.id,
        document_id=document.id,
        feishu_doc_token=doc_token,
        pipeline_result=pipeline_result,
    )


def map_document_to_knowledge_profile(document: Document) -> Optional[Dict[str, Any]]:
    category_code = (getattr(document.category, 'code', '') or '').lower()
    category_name = (getattr(document.category, 'name', '') or '').lower()
    title = (document.title or '').lower()
    composite = ' '.join([category_code, category_name, title])

    if any(keyword in composite for keyword in ('sop', '标准操作规程', '操作规程', '规程')):
        return {
            'entry_type': EntryType.SOP,
            'namespace': OntologyNamespace.INTERNAL_SOP,
            'tags': ['飞书文档', 'SOP', getattr(document.category, 'name', '') or '内部文档'],
        }

    if any(keyword in composite for keyword in ('proposal', '方案', 'template', 'protocol')):
        return {
            'entry_type': EntryType.PROPOSAL_TEMPLATE,
            'namespace': OntologyNamespace.CNKIS,
            'tags': ['飞书文档', '方案文档', getattr(document.category, 'name', '') or '内部文档'],
        }

    return None


def build_entry_title(document: Document, entry_type: str) -> str:
    prefix_map = {
        EntryType.SOP: '[SOP]',
        EntryType.PROPOSAL_TEMPLATE: '[方案]',
    }
    prefix = prefix_map.get(entry_type, '[文档]')
    if document.document_no:
        return f'{prefix} {document.document_no} - {document.title}'
    return f'{prefix} {document.title}'


def resolve_document_version(document: Document, meta: Dict[str, Any]) -> str:
    revision = _extract_doc_revision(meta)
    if revision:
        return f'{document.version or "1.0"}+rev{revision}'
    return str(document.version or '1.0')


def build_document_source_key(document: Document, version: str, normalized_content: str) -> str:
    content_hash = hashlib.sha1(normalized_content.encode('utf-8')).hexdigest()[:12]
    return f'feishu_doc:{document.id}:{version}:{content_hash}'[:120]


def get_latest_document_entry(document_id: int) -> Optional[KnowledgeEntry]:
    return KnowledgeEntry.objects.filter(
        source_type=DOCUMENT_SOURCE_TYPE,
        source_id=document_id,
        is_deleted=False,
    ).order_by('-update_time', '-id').first()


def blocks_to_plain_text(blocks: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for block in blocks or []:
        text = _extract_text_from_block(block)
        if text:
            lines.append(text.strip())
    return '\n'.join(line for line in lines if line).strip()


def _extract_text_from_block(block: Dict[str, Any]) -> str:
    fragments = _collect_text_fragments(block)
    merged = ''.join(fragment for fragment in fragments if fragment)
    merged = re.sub(r'\s+', ' ', merged).strip()
    return merged


def _collect_text_fragments(value: Any) -> List[str]:
    fragments: List[str] = []
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            fragments.append(stripped)
        return fragments

    if isinstance(value, list):
        for item in value:
            fragments.extend(_collect_text_fragments(item))
        return fragments

    if not isinstance(value, dict):
        return fragments

    text_run = value.get('text_run')
    if isinstance(text_run, dict):
        content = text_run.get('content')
        if isinstance(content, str) and content.strip():
            fragments.append(content.strip())

    mention = value.get('mention')
    if isinstance(mention, dict):
        mention_name = mention.get('text') or mention.get('name')
        if isinstance(mention_name, str) and mention_name.strip():
            fragments.append(mention_name.strip())

    for key in ('elements', 'children'):
        nested = value.get(key)
        if nested:
            fragments.extend(_collect_text_fragments(nested))

    for key in (
        'paragraph', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
        'bullet', 'ordered', 'callout', 'quote', 'code', 'equation', 'table_cell',
        'grid', 'grid_column', 'text', 'task', 'todo',
    ):
        nested = value.get(key)
        if nested:
            fragments.extend(_collect_text_fragments(nested))

    return fragments


def normalize_document_text(text: str) -> str:
    return re.sub(r'\s+', ' ', (text or '')).strip()


def extract_doc_url(meta: Dict[str, Any]) -> str:
    document_meta = meta.get('document', meta)
    for key in ('url', 'docs_url', 'document_url'):
        value = document_meta.get(key) if isinstance(document_meta, dict) else None
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ''


def _extract_doc_revision(meta: Dict[str, Any]) -> str:
    document_meta = meta.get('document', meta)
    if not isinstance(document_meta, dict):
        return ''
    for key in ('revision_id', 'revision', 'document_revision'):
        value = document_meta.get(key)
        if value not in (None, ''):
            return str(value)
    return ''


def _resolve_document(
    document_id: Optional[int] = None,
    feishu_doc_token: str = '',
) -> Optional[Document]:
    query = Document.objects.filter(is_deleted=False)
    if document_id:
        return query.filter(id=document_id).first()
    if feishu_doc_token:
        return query.filter(feishu_doc_token=feishu_doc_token).first()
    return None


def _result(
    status: str,
    reason: str,
    entry_id: Optional[int] = None,
    document_id: Optional[int] = None,
    feishu_doc_token: str = '',
    pipeline_result: Optional[PipelineResult] = None,
) -> Dict[str, Any]:
    payload = {
        'status': status,
        'reason': reason,
        'entry_id': entry_id,
        'document_id': document_id,
        'feishu_doc_token': feishu_doc_token,
    }
    if pipeline_result is not None:
        payload['pipeline_status'] = pipeline_result.status
        payload['quality_score'] = pipeline_result.quality_score
    return payload
