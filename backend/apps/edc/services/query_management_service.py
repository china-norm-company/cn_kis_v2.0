"""
数据质疑管理服务

来源：cn_kis_test edc/services/query_management_service.py
S2-4：质疑创建→回复→关闭
"""
import logging
from typing import Optional
from django.utils import timezone

from apps.edc.models import DataQuery, QueryStatus

logger = logging.getLogger(__name__)


class QueryManagementService:
    """数据质疑管理"""

    @classmethod
    def create_query(
        cls, crf_record_id: int, field_name: str, query_text: str,
        created_by_id: int = None,
    ) -> DataQuery:
        """创建质疑"""
        query = DataQuery.objects.create(
            crf_record_id=crf_record_id,
            field_name=field_name,
            query_text=query_text,
            status=QueryStatus.OPEN,
            created_by_id=created_by_id,
        )
        logger.info(f'质疑创建: query_id={query.id}, crf={crf_record_id}, field={field_name}')
        return query

    @classmethod
    def answer_query(
        cls, query_id: int, answer_text: str,
        answered_by_id: int = None,
    ) -> Optional[DataQuery]:
        """回复质疑"""
        query = DataQuery.objects.filter(id=query_id).first()
        if not query or query.status != QueryStatus.OPEN:
            return None

        query.answer_text = answer_text
        query.answered_by_id = answered_by_id
        query.answered_at = timezone.now()
        query.status = QueryStatus.ANSWERED
        query.save()

        logger.info(f'质疑回复: query_id={query_id}')
        return query

    @classmethod
    def close_query(
        cls, query_id: int, close_reason: str = '',
        closed_by_id: int = None,
    ) -> Optional[DataQuery]:
        """关闭质疑"""
        query = DataQuery.objects.filter(id=query_id).first()
        if not query or query.status not in (QueryStatus.OPEN, QueryStatus.ANSWERED):
            return None

        query.status = QueryStatus.CLOSED
        query.closed_by_id = closed_by_id
        query.closed_at = timezone.now()
        query.close_reason = close_reason
        query.save()

        logger.info(f'质疑关闭: query_id={query_id}')
        return query

    @classmethod
    def list_queries(
        cls, crf_record_id: int = None, status: str = None,
        page: int = 1, page_size: int = 20,
    ) -> dict:
        qs = DataQuery.objects.all()
        if crf_record_id:
            qs = qs.filter(crf_record_id=crf_record_id)
        if status:
            qs = qs.filter(status=status)
        total = qs.count()
        offset = (page - 1) * page_size
        return {'items': list(qs[offset:offset + page_size]), 'total': total}
