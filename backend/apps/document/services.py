"""
文档管理服务

文档全生命周期：创建→审核→发布→培训确认。
飞书集成：发布时上传到飞书云空间，通知相关人员阅读。
"""
import logging
from typing import Optional
from django.db import transaction
from django.utils import timezone

from .models import (
    Document, DocumentReview, DocumentPublish, DocumentTraining,
    DocumentStatus, ReviewStatus, TrainingStatus,
)

logger = logging.getLogger(__name__)


def create_document(
    document_no: str,
    title: str,
    category_id: int,
    version: str = '1.0',
    description: str = '',
    content: str = '',
    created_by_id: int = None,
) -> Document:
    return Document.objects.create(
        document_no=document_no,
        title=title,
        category_id=category_id,
        version=version,
        description=description,
        content=content,
        status=DocumentStatus.DRAFT,
        created_by_id=created_by_id,
    )


def get_document(doc_id: int) -> Optional[Document]:
    return Document.objects.filter(id=doc_id, is_deleted=False).first()


def list_documents(category_id: int = None, status: str = None,
                   keyword: str = None, page: int = 1, page_size: int = 20) -> dict:
    qs = Document.objects.filter(is_deleted=False)
    if category_id:
        qs = qs.filter(category_id=category_id)
    if status:
        qs = qs.filter(status=status)
    if keyword:
        qs = qs.filter(title__icontains=keyword)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total,
            'page': page, 'page_size': page_size}


def update_document(doc_id: int, **kwargs) -> Optional[Document]:
    """更新文档信息（仅草稿状态可编辑）"""
    doc = get_document(doc_id)
    if not doc:
        return None
    if doc.status not in (DocumentStatus.DRAFT,):
        logger.warning(f'文档#{doc_id} 当前状态 {doc.status} 不允许编辑')
        return None

    allowed_fields = ['title', 'description', 'content', 'version', 'category_id']
    update_fields = []
    for key, val in kwargs.items():
        if key in allowed_fields and val is not None:
            setattr(doc, key, val)
            update_fields.append(key)
    if update_fields:
        update_fields.append('update_time')
        doc.save(update_fields=update_fields)
    return doc


def delete_document(doc_id: int) -> bool:
    """软删除文档"""
    doc = get_document(doc_id)
    if not doc:
        return False
    doc.is_deleted = True
    doc.save(update_fields=['is_deleted', 'update_time'])
    logger.info(f'文档#{doc_id} 已删除')
    return True


def obsolete_document(doc_id: int) -> Optional[Document]:
    """将文档标记为废弃"""
    doc = get_document(doc_id)
    if not doc or doc.status != DocumentStatus.PUBLISHED:
        return None
    doc.status = DocumentStatus.OBSOLETE
    doc.save(update_fields=['status', 'update_time'])
    logger.info(f'文档#{doc_id} 已废弃')
    return doc


def archive_document(doc_id: int) -> Optional[Document]:
    """归档文档"""
    doc = get_document(doc_id)
    if not doc or doc.status not in (DocumentStatus.PUBLISHED, DocumentStatus.OBSOLETE):
        return None
    doc.status = DocumentStatus.ARCHIVED
    doc.save(update_fields=['status', 'update_time'])
    logger.info(f'文档#{doc_id} 已归档')
    return doc


@transaction.atomic
def submit_for_review(doc_id: int, submitted_by_id: int = None) -> Optional[DocumentReview]:
    """提交审核"""
    doc = get_document(doc_id)
    if not doc or doc.status not in (DocumentStatus.DRAFT,):
        return None

    doc.status = DocumentStatus.PENDING_REVIEW
    doc.save(update_fields=['status', 'update_time'])

    review = DocumentReview.objects.create(
        document=doc,
        status=ReviewStatus.PENDING,
        submitted_by_id=submitted_by_id,
    )
    return review


@transaction.atomic
def approve_review(review_id: int, reviewed_by_id: int = None, comments: str = '') -> Optional[DocumentReview]:
    """审核通过"""
    review = DocumentReview.objects.filter(id=review_id).first()
    if not review or review.status != ReviewStatus.PENDING:
        return None

    review.status = ReviewStatus.APPROVED
    review.reviewed_by_id = reviewed_by_id
    review.review_comments = comments
    review.reviewed_at = timezone.now()
    review.save()

    doc = review.document
    doc.status = DocumentStatus.APPROVED
    doc.save(update_fields=['status', 'update_time'])
    return review


@transaction.atomic
def reject_review(review_id: int, reviewed_by_id: int = None, comments: str = '') -> Optional[DocumentReview]:
    """审核驳回"""
    review = DocumentReview.objects.filter(id=review_id).first()
    if not review or review.status != ReviewStatus.PENDING:
        return None

    review.status = ReviewStatus.REJECTED
    review.reviewed_by_id = reviewed_by_id
    review.review_comments = comments
    review.reviewed_at = timezone.now()
    review.save()

    doc = review.document
    doc.status = DocumentStatus.DRAFT
    doc.save(update_fields=['status', 'update_time'])
    return review


@transaction.atomic
def publish_document(
    doc_id: int,
    published_by_id: int = None,
    publish_notes: str = '',
    training_required: bool = False,
    training_deadline=None,
    training_user_ids: list = None,
) -> Optional[DocumentPublish]:
    """
    发布文档

    1. 更新文档状态为 published
    2. 上传到飞书云空间
    3. 如需培训，创建培训记录
    """
    doc = get_document(doc_id)
    if not doc or doc.status != DocumentStatus.APPROVED:
        return None

    doc.status = DocumentStatus.PUBLISHED
    doc.published_at = timezone.now()
    doc.save(update_fields=['status', 'published_at', 'update_time'])

    publish = DocumentPublish.objects.create(
        document=doc,
        published_by_id=published_by_id,
        publish_notes=publish_notes,
        training_required=training_required,
        training_deadline=training_deadline,
    )

    # 上传到飞书云空间
    _upload_to_feishu(doc)

    # 创建培训记录
    if training_required and training_user_ids:
        trainings = [
            DocumentTraining(
                publish=publish,
                user_id=uid,
                status=TrainingStatus.PENDING,
            )
            for uid in training_user_ids
        ]
        DocumentTraining.objects.bulk_create(trainings)

    return publish


def confirm_training(training_id: int) -> Optional[DocumentTraining]:
    """确认培训完成"""
    training = DocumentTraining.objects.filter(id=training_id).first()
    if not training or training.status != TrainingStatus.PENDING:
        return None

    training.status = TrainingStatus.COMPLETED
    training.confirmed_at = timezone.now()
    training.save(update_fields=['status', 'confirmed_at', 'update_time'])
    return training


def _upload_to_feishu(doc: Document):
    """上传文档到飞书云空间"""
    try:
        from libs.feishu_client import feishu_client
        import os

        folder_token = os.getenv('FEISHU_DOC_FOLDER_TOKEN', '')
        if not folder_token:
            logger.warning('FEISHU_DOC_FOLDER_TOKEN 未配置，文档上传跳过')
            return

        result = feishu_client.create_document(
            folder_token=folder_token,
            title=f'{doc.document_no} {doc.title}',
        )
        doc_token = result.get('document', {}).get('document_id', '') if result else ''
        if doc_token:
            doc.feishu_doc_token = doc_token
            doc.save(update_fields=['feishu_doc_token', 'update_time'])
            logger.info(f'文档#{doc.id} 已上传到飞书: doc_token={doc_token}')

            # 写入文档内容
            if doc.content:
                try:
                    feishu_client._request('POST', f'docx/v1/documents/{doc_token}/blocks/batch_update', json={
                        'requests': [{
                            'block_id': doc_token,
                            'update_text_elements': {
                                'elements': [{'text_run': {'content': doc.content}}],
                            },
                        }],
                    })
                except Exception as write_err:
                    logger.warning(f'文档#{doc.id} 内容写入失败: {write_err}')

            try:
                from apps.knowledge.tasks import queue_feishu_document_knowledge_harvest

                queue_feishu_document_knowledge_harvest(
                    document_id=doc.id,
                    feishu_doc_token=doc_token,
                    trigger='publish',
                    event_data={'source': 'document_publish'},
                )
                logger.info(f'文档#{doc.id} 已触发首次知识化任务')
            except Exception as queue_err:
                logger.warning(f'文档#{doc.id} 首次知识化任务入队失败: {queue_err}')
    except Exception as e:
        logger.error(f'文档#{doc.id} 飞书上传失败: {e}')
