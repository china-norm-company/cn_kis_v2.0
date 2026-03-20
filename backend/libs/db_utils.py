"""
数据库查询工具

用于统一分页参数校验与切片，避免服务层重复实现分页边界逻辑。
"""

from typing import Any, Dict


def sanitize_pagination(page: int, page_size: int, max_page_size: int = 200) -> Dict[str, int]:
    """标准化分页参数。"""
    safe_page = max(1, int(page or 1))
    safe_size = max(1, int(page_size or 20))
    safe_size = min(max_page_size, safe_size)
    return {
        'page': safe_page,
        'page_size': safe_size,
        'offset': (safe_page - 1) * safe_size,
        'limit': safe_size,
    }


def paginate_queryset(queryset: Any, page: int, page_size: int, max_page_size: int = 200) -> Dict[str, Any]:
    """分页执行并返回统一结构。"""
    paging = sanitize_pagination(page, page_size, max_page_size=max_page_size)
    total = queryset.count()
    items = list(queryset[paging['offset']:paging['offset'] + paging['limit']])
    return {
        'items': items,
        'total': total,
        'page': paging['page'],
        'page_size': paging['page_size'],
    }
