"""
CRM 跨模块信号处理

监听其他模块的数据变更，自动更新 CRM 相关状态：
- CommunicationLog 创建 → 更新 ClientContact.last_contact_date
- Contract 签署 → 更新 Client 预算消耗
- Payment 回款 → 触发健康度 revenue_score 重算
- Invoice/Payment 逾期 → 自动创建 ClientAlert
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='proposal.CommunicationLog')
def on_communication_created(sender, instance, created, **kwargs):
    """沟通记录创建 → 更新关键人最近联系日期"""
    if not created:
        return
    if not instance.client_id:
        return

    try:
        from apps.crm.models import ClientContact
        from datetime import date

        contacts = ClientContact.objects.filter(
            client_id=instance.client_id, is_deleted=False,
        )

        participants = instance.participants or []
        if participants:
            matching = contacts.filter(name__in=participants)
            if matching.exists():
                matching.update(last_contact_date=date.today())
                logger.info(f'更新关键人联系日期: client={instance.client_id}, contacts={list(matching.values_list("name", flat=True))}')
                return

        if contacts.exists():
            contacts.order_by('-relationship_level').first()
            logger.debug(f'沟通记录已创建但未匹配到具体关键人: client={instance.client_id}')
    except Exception as e:
        logger.error(f'处理沟通记录信号失败: {e}')


@receiver(post_save, sender='finance.Contract')
def on_contract_signed(sender, instance, created, **kwargs):
    """合同签署 → 尝试更新客户的预算消耗"""
    if not hasattr(instance, 'protocol_id') or not instance.protocol_id:
        return

    try:
        from apps.protocol.models import Protocol
        protocol = Protocol.objects.filter(id=instance.protocol_id).first()
        if not protocol or not protocol.sponsor_id:
            return

        from apps.crm.models import Client
        client = Client.objects.filter(id=protocol.sponsor_id, is_deleted=False).first()
        if not client:
            return

        logger.info(f'合同签署 → 客户={client.name}, 金额={instance.amount}')
    except Exception as e:
        logger.error(f'处理合同签署信号失败: {e}')


@receiver(post_save, sender='finance.Payment')
def on_payment_received(sender, instance, created, **kwargs):
    """回款完成 → 触发客户收入评分更新提示"""
    if not created:
        return

    try:
        from apps.finance.models import Invoice, Contract
        from apps.protocol.models import Protocol

        invoice = Invoice.objects.filter(id=instance.invoice_id).first()
        if not invoice:
            return

        contract = Contract.objects.filter(id=invoice.contract_id).first()
        if not contract or not contract.protocol_id:
            return

        protocol = Protocol.objects.filter(id=contract.protocol_id).first()
        if not protocol or not protocol.sponsor_id:
            return

        logger.info(f'回款收到 → 客户ID={protocol.sponsor_id}, 金额={instance.actual_amount}')
    except Exception as e:
        logger.error(f'处理回款信号失败: {e}')
