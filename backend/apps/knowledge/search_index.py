"""知识关键词检索辅助：构建预分词搜索文本。"""
from typing import List


def _dedupe_keep_order(values: List[str]) -> List[str]:
    seen = set()
    result = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def build_search_vector_text(title: str = '', summary: str = '', content: str = '') -> str:
    """
    生成供 PostgreSQL FTS 使用的预分词文本。

    中文通过 jieba 先切词，英文术语和原始标题片段一并保留。
    """
    corpus = ' '.join(part for part in [title or '', summary or '', content or ''] if part).strip()
    if not corpus:
        return ''

    tokens: List[str] = []
    try:
        import jieba

        tokens.extend(jieba.lcut_for_search(corpus))
    except Exception:
        pass

    tokens.extend([title or '', summary or ''])
    tokens.extend(corpus.split())

    normalized = []
    for token in tokens:
        token = str(token or '').strip()
        if not token:
            continue
        if len(token) == 1 and not token.isascii():
            continue
        normalized.append(token)

    return ' '.join(_dedupe_keep_order(normalized))
