"""
将占位符与勾选内联替换后的知情正文 HTML 片段渲染为 PDF 页字节流，
供回执与下载与配置页版式一致（含内嵌签名图、已选勾选样式）。

失败时返回 None，由调用方回退为纯文本摘要。
"""
from __future__ import annotations

import logging
from io import BytesIO
from typing import Optional

logger = logging.getLogger(__name__)


def try_icf_html_fragment_to_pdf_bytes(html_fragment: str) -> Optional[bytes]:
    if not (html_fragment or '').strip():
        return None
    try:
        from xhtml2pdf import pisa
    except ImportError:
        logger.warning('icf receipt html pdf: xhtml2pdf not installed')
        return None

    # xhtml2pdf 需完整 HTML；样式与执行台正文预览尽量接近
    wrapped = (
        '<!DOCTYPE html><html><head><meta charset="utf-8"/>'
        '<style>'
        '@page { size: A4; margin: 12mm; }'
        'body { font-family: STSong-Light, SimSun, "Songti SC", serif; font-size: 10pt; line-height: 1.5; color: #0f172a; }'
        'table { border-collapse: collapse; }'
        'td, th { border: 1px solid #ccc; padding: 4px 6px; }'
        'img { max-width: 100%; height: auto; vertical-align: middle; }'
        '</style></head><body>'
        + html_fragment
        + '</body></html>'
    )
    try:
        buf = BytesIO()
        result = pisa.CreatePDF(wrapped, dest=buf, encoding='utf-8')
        if getattr(result, 'err', 0):
            logger.warning('icf receipt html pdf: pisa err count=%s', result.err)
            return None
        buf.seek(0)
        data = buf.getvalue()
        if not data or len(data) < 200:
            return None
        return data
    except Exception as exc:
        logger.warning('icf receipt html pdf failed: %s', exc)
        return None
