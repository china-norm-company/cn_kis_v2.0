"""
仪器手册 PDF → 知识条目构建器

将厂商 PDF 手册转换为可进入统一知识管线的 RawKnowledgeInput，
并尽量关联到设备台账中的 ResourceItem。
"""
import hashlib
import io
import logging
import os
import re
from typing import Any, Dict, Optional

from django.db.models import Q

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

logger = logging.getLogger(__name__)

_INSTRUMENT_PATTERNS = [
    ('Corneometer', re.compile(r'corneometer|cm\s*-?\s*825', re.I)),
    ('Tewameter', re.compile(r'tewameter|tm\s*-?\s*300', re.I)),
    ('Mexameter', re.compile(r'mexameter|mx\s*-?\s*18', re.I)),
    ('Cutometer', re.compile(r'cutometer|mpa\s*-?\s*580', re.I)),
    ('Sebumeter', re.compile(r'sebumeter|sm\s*-?\s*815', re.I)),
    ('VISIA', re.compile(r'\bvisia\b', re.I)),
    ('PRIMOS', re.compile(r'\bprimos\b', re.I)),
    ('VisioFace', re.compile(r'visioface', re.I)),
]

_MODEL_PATTERN = re.compile(r'\b(?:CM|TM|MX|SM|MPA)\s*-?\s*\d{2,4}\b|\bVISIA\b|\bPRIMOS\b', re.I)
_MANUFACTURER_PATTERN = re.compile(r'Courage\s*\+\s*Khazaka|Canfield|GFMesstechnik', re.I)


def extract_pdf_text_from_bytes(file_bytes: bytes, file_name: str = '') -> str:
    """从 PDF bytes 提取纯文本。"""
    if not file_bytes:
        return ''
    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover - 依赖缺失时日志兜底
        logger.warning('pypdf unavailable for %s: %s', file_name, exc)
        return ''

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        chunks = []
        for page in reader.pages:
            text = page.extract_text() or ''
            text = re.sub(r'\s+\n', '\n', text)
            text = re.sub(r'\n{3,}', '\n\n', text)
            text = re.sub(r'[ \t]{2,}', ' ', text)
            if text.strip():
                chunks.append(text.strip())
        return '\n\n'.join(chunks).strip()
    except Exception as exc:
        logger.warning('extract_pdf_text_from_bytes failed for %s: %s', file_name, exc)
        return ''


def infer_instrument_identity(text: str, file_name: str = '') -> Dict[str, str]:
    """从文件名和正文推断仪器名称/型号/厂商。"""
    corpus = f'{file_name}\n{text}'
    instrument_name = ''
    for candidate, pattern in _INSTRUMENT_PATTERNS:
        if pattern.search(corpus):
            instrument_name = candidate
            break

    model_match = _MODEL_PATTERN.search(corpus)
    manufacturer_match = _MANUFACTURER_PATTERN.search(corpus)
    title = instrument_name or os.path.splitext(file_name)[0] or '仪器手册'
    if model_match and model_match.group(0).upper() not in title.upper():
        title = f'{title} {model_match.group(0).strip()}'.strip()

    return {
        'instrument_name': instrument_name,
        'model_number': model_match.group(0).replace(' ', '') if model_match else '',
        'manufacturer': manufacturer_match.group(0).strip() if manufacturer_match else '',
        'title': title.strip(),
    }


def _match_equipment(instrument_meta: Dict[str, str], equipment_id: Optional[int] = None):
    """尝试将手册匹配到设备台账中的具体设备。"""
    from apps.resource.models import ResourceItem

    qs = ResourceItem.objects.filter(is_deleted=False)
    if equipment_id:
        return qs.filter(id=equipment_id).first()

    clauses = Q()
    if instrument_meta.get('instrument_name'):
        clauses |= Q(name__icontains=instrument_meta['instrument_name'])
    if instrument_meta.get('model_number'):
        clauses |= Q(model_number__icontains=instrument_meta['model_number'])
    if instrument_meta.get('manufacturer'):
        clauses |= Q(manufacturer__icontains=instrument_meta['manufacturer'])

    if not clauses:
        return None
    return qs.filter(clauses).order_by('-update_time').first()


def build_raw_input(
    text: str,
    file_name: str,
    *,
    equipment_id: Optional[int] = None,
    created_by_id: Optional[int] = None,
    source_path: str = '',
) -> RawKnowledgeInput:
    """将提取后的 PDF 文本组装为 RawKnowledgeInput。"""
    instrument_meta = infer_instrument_identity(text, file_name=file_name)
    equipment = _match_equipment(instrument_meta, equipment_id=equipment_id)

    title = instrument_meta['title'] or os.path.splitext(file_name)[0] or '仪器手册'
    summary = f'{title} 厂商手册解析导入，已抽取仪器原理、指标、方法和适用场景。'
    tags = [
        '仪器手册',
        'PDF导入',
        'instrument_manual',
    ]
    for value in (instrument_meta.get('instrument_name'), instrument_meta.get('model_number')):
        if value and value not in tags:
            tags.append(value)

    file_hash = hashlib.sha1(text.encode('utf-8')).hexdigest()[:24]
    properties: Dict[str, Any] = {
        'source_url': f'file://{file_name}',
        'manual_file_name': file_name,
        'import_channel': 'pdf_manual',
        'extractor': 'instrument_knowledge_builder',
        'instrument_name': instrument_meta.get('instrument_name', ''),
        'manufacturer': instrument_meta.get('manufacturer', ''),
        'model_number': instrument_meta.get('model_number', ''),
        'namespace': 'cnkis',
    }
    if source_path:
        properties['source_path'] = source_path
    if equipment:
        properties.update({
            'equipment_id': equipment.id,
            'equipment_code': equipment.code,
            'equipment_name': equipment.name,
            'equipment_model_number': equipment.model_number,
        })
        if equipment.manufacturer and not properties['manufacturer']:
            properties['manufacturer'] = equipment.manufacturer

    normalized_text = text.strip()
    if equipment and equipment.name and equipment.name not in normalized_text:
        normalized_text = f'设备台账关联：{equipment.name}（{equipment.code}）\n\n{normalized_text}'
    if instrument_meta.get('manufacturer'):
        normalized_text = f'制造商：{instrument_meta["manufacturer"]}\n{normalized_text}'
    if instrument_meta.get('model_number'):
        normalized_text = f'型号：{instrument_meta["model_number"]}\n{normalized_text}'

    return RawKnowledgeInput(
        title=title,
        content=normalized_text,
        summary=summary,
        tags=tags,
        entry_type='instrument_spec',
        source_type='instrument_import',
        source_id=equipment.id if equipment else equipment_id,
        source_key=f'instrument-manual:{file_hash}',
        created_by_id=created_by_id,
        namespace='cnkis',
        properties=properties,
    )


def ingest_instrument_manual(
    *,
    file_bytes: Optional[bytes] = None,
    file_path: str = '',
    file_name: str = '',
    equipment_id: Optional[int] = None,
    created_by_id: Optional[int] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """导入仪器手册 PDF 并进入统一知识管线。"""
    if file_bytes is None and file_path:
        with open(file_path, 'rb') as fp:
            file_bytes = fp.read()
        if not file_name:
            file_name = os.path.basename(file_path)

    file_bytes = file_bytes or b''
    file_name = file_name or os.path.basename(file_path or '') or 'instrument_manual.pdf'
    text = extract_pdf_text_from_bytes(file_bytes, file_name=file_name)
    if not text.strip():
        return {
            'success': False,
            'message': 'PDF 未提取到可用文本',
            'file_name': file_name,
        }

    raw = build_raw_input(
        text,
        file_name,
        equipment_id=equipment_id,
        created_by_id=created_by_id,
        source_path=file_path,
    )
    if dry_run:
        return {
            'success': True,
            'dry_run': True,
            'file_name': file_name,
            'title': raw.title,
            'source_key': raw.source_key,
            'tags': raw.tags,
            'properties': raw.properties,
            'content_length': len(raw.content),
        }

    pipeline_result = run_pipeline(raw)
    return {
        'success': bool(pipeline_result.success),
        'file_name': file_name,
        'entry_id': pipeline_result.entry_id,
        'status': pipeline_result.status,
        'quality_score': pipeline_result.quality_score,
        'title': raw.title,
        'source_key': raw.source_key,
        'properties': raw.properties,
        'stage_errors': pipeline_result.stage_errors,
    }
