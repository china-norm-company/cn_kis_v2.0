"""
SOP 知识库管理

S4-6：基于飞书 wiki/v2 实现 SOP 体系化管理
"""
import logging
import os
from typing import Optional, Dict

logger = logging.getLogger(__name__)

WIKI_SPACE_ID = os.getenv('FEISHU_SOP_WIKI_SPACE_ID', '')


class SOPWikiService:
    """SOP 知识库服务"""

    @classmethod
    def create_sop_category(cls, name: str, parent_token: str = '') -> Optional[Dict]:
        """
        在知识库中创建 SOP 分类目录
        """
        if not WIKI_SPACE_ID:
            logger.warning('FEISHU_SOP_WIKI_SPACE_ID 未配置')
            return None

        try:
            from libs.feishu_client import feishu_client
            result = feishu_client.create_wiki_node(
                space_id=WIKI_SPACE_ID,
                title=name,
                parent_node_token=parent_token,
                obj_type='doc',
            )
            return result
        except Exception as e:
            logger.error(f'创建 SOP 分类失败: {e}')
            return None

    @classmethod
    def create_sop_document(cls, title: str, parent_token: str = '') -> Optional[Dict]:
        """
        在知识库中创建 SOP 文档节点
        """
        if not WIKI_SPACE_ID:
            return None

        try:
            from libs.feishu_client import feishu_client
            result = feishu_client.create_wiki_node(
                space_id=WIKI_SPACE_ID,
                title=title,
                parent_node_token=parent_token,
                obj_type='doc',
            )
            return result
        except Exception as e:
            logger.error(f'创建 SOP 文档失败: {e}')
            return None

    @classmethod
    def list_sop_tree(cls, parent_token: str = '') -> list:
        """获取 SOP 知识库目录树"""
        if not WIKI_SPACE_ID:
            return []

        try:
            from libs.feishu_client import feishu_client
            result = feishu_client.get_wiki_nodes(
                space_id=WIKI_SPACE_ID,
                parent_node_token=parent_token,
            )
            items = result.get('data', {}).get('items', []) if result else []
            return items
        except Exception as e:
            logger.error(f'获取 SOP 目录失败: {e}')
            return []

    @classmethod
    def sync_sop_to_wiki(cls, sop_id: int) -> Optional[str]:
        """
        将系统中的 SOP 同步到飞书知识库

        Returns: wiki node token if successful
        """
        from apps.quality.models import SOP
        sop = SOP.objects.filter(id=sop_id).first()
        if not sop:
            return None

        result = cls.create_sop_document(
            title=f'[SOP-{sop.code}] {sop.title}',
        )
        if result:
            token = result.get('data', {}).get('node', {}).get('node_token', '')
            if token:
                cls._notify_and_create_training(sop, token)
            return token
        return None

    @classmethod
    def _notify_and_create_training(cls, sop, wiki_node_token: str):
        """SOP 发布后通知相关人员阅读 + 创建培训记录"""
        try:
            from apps.notification.services import send_notification
            wiki_url = f'https://open.feishu.cn/wiki/{wiki_node_token}'
            send_notification(
                title=f'SOP 发布通知: {sop.code} {sop.title}',
                content=f'SOP 已发布到知识库，请在规定时间内完成阅读确认。\n查看地址: {wiki_url}',
                notification_type='sop_training',
                entity_type='sop',
                entity_id=sop.id,
            )
            logger.info(f'SOP {sop.code} 发布通知已发送')
        except Exception as e:
            logger.warning(f'SOP 发布通知发送失败: {e}')

        try:
            from apps.hr.models import DocumentTraining
            DocumentTraining.objects.get_or_create(
                document_type='sop',
                document_id=sop.id,
                defaults={
                    'title': f'{sop.code} {sop.title}',
                    'status': 'pending',
                    'wiki_node_token': wiki_node_token,
                },
            )
            logger.info(f'SOP {sop.code} 培训记录已创建')
        except Exception as e:
            logger.warning(f'SOP 培训记录创建失败（模型可能不存在）: {e}')
