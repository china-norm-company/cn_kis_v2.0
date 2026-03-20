"""
排程表 OCR 提取：使用 EasyOCR 识别图片中的文字，再交由 LLM 结构化解析。

依赖：pip install easyocr
"""
import logging
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# 延迟加载，避免启动时加载 heavy 模型
_ocr_reader = None


def _get_reader():
    global _ocr_reader
    if _ocr_reader is None:
        try:
            import easyocr
            _ocr_reader = easyocr.Reader(['ch_sim', 'en'], gpu=False, verbose=False)
        except ImportError as e:
            logger.warning('easyocr not installed: %s', e)
            return None
    return _ocr_reader


def ocr_image_to_table_text(image_data: bytes, image_path: Optional[str] = None) -> Optional[str]:
    """
    对排程表图片执行 OCR，按行列整理为可解析的文本。

    Args:
        image_data: 图片二进制内容
        image_path: 可选，图片保存路径（用于 OCR 读取）

    Returns:
        格式化后的表格文本，如 "日期：2026/2/27\n表头：...\n行1：...\n行2：..."
        若 OCR 不可用或失败则返回 None
    """
    reader = _get_reader()
    if reader is None:
        return None

    cleanup_path = None
    if not image_path:
        if len(image_data) >= 8 and image_data[:8] == b'\x89PNG\r\n\x1a\n':
            suf = '.png'
        elif len(image_data) >= 12 and image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
            suf = '.webp'
        else:
            suf = '.jpg'
        fd, image_path = tempfile.mkstemp(suffix=suf)
        cleanup_path = image_path
        try:
            import os
            with os.fdopen(fd, 'wb') as f:
                f.write(image_data)
        except Exception as e:
            logger.warning('ocr temp write failed: %s', e)
            try:
                Path(image_path).unlink(missing_ok=True)
            except Exception:
                pass
            return None

    try:
        result = reader.readtext(image_path, detail=1)
    except Exception as e:
        logger.warning('ocr_image_to_table_text readtext failed: %s', e)
        return None
    finally:
        if cleanup_path:
            try:
                Path(cleanup_path).unlink(missing_ok=True)
            except Exception:
                pass

    if not result:
        return None

    # result: [(bbox, text, confidence), ...]
    # bbox: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    rows = []
    row_threshold = 18  # 同一行 y 中心差小于此视为同行

    def _center_y(item):
        box = item[0]
        return (box[0][1] + box[2][1]) / 2

    def _center_x(item):
        box = item[0]
        return (box[0][0] + box[2][0]) / 2

    # 按 y 排序，再按 x 排序
    sorted_items = sorted(result, key=lambda x: (_center_y(x), _center_x(x)))

    # 聚合成行：相近 y 的为同一行
    current_row = []
    current_y = None
    for item in sorted_items:
        cy = _center_y(item)
        text = (item[1] or '').strip()
        if not text:
            continue
        if current_y is None or abs(cy - current_y) <= row_threshold:
            current_row.append((_center_x(item), text))
            if current_y is None:
                current_y = cy
            else:
                current_y = (current_y * (len(current_row) - 1) + cy) / len(current_row)
        else:
            if current_row:
                row_text = ' | '.join(t for _, t in sorted(current_row, key=lambda x: x[0]))
                rows.append(row_text)
            current_row = [(_center_x(item), text)]
            current_y = cy
    if current_row:
        row_text = ' | '.join(t for _, t in sorted(current_row, key=lambda x: x[0]))
        rows.append(row_text)

    if not rows:
        return None

    # 前几行通常包含日期、表头
    lines = []
    for i, r in enumerate(rows):
        lines.append(f'行{i + 1}：{r}')
    return '\n'.join(lines)
