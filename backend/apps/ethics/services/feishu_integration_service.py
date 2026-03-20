"""
伦理台飞书深度集成服务

基于 libs/feishu_client.py 统一客户端，实现：
- 多维表格同步（申请台账、批件总览、法规清单、合规问题、培训记录）
- 知识库集成（法规文库目录管理）
- 云文档集成（申请材料模板、监督报告）
- 群聊集成（伦理项目群自动创建与消息推送）
- 日历集成（审查会议、培训日程）
- 任务集成（整改任务、回复任务）
"""
import os
import json
import logging
from datetime import datetime, date
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)

FEISHU_BITABLE_APP_TOKEN = os.getenv('FEISHU_BITABLE_APP_TOKEN_ETHICS', '')
FEISHU_BITABLE_ETHICS_APP_TABLE_ID = os.getenv('FEISHU_BITABLE_ETHICS_APP_TABLE_ID', '')
FEISHU_BITABLE_ETHICS_APPROVAL_TABLE_ID = os.getenv('FEISHU_BITABLE_ETHICS_APPROVAL_TABLE_ID', '')
FEISHU_BITABLE_REGULATION_TABLE_ID = os.getenv('FEISHU_BITABLE_REGULATION_TABLE_ID', '')
FEISHU_BITABLE_COMPLIANCE_TABLE_ID = os.getenv('FEISHU_BITABLE_COMPLIANCE_TABLE_ID', '')
FEISHU_BITABLE_TRAINING_TABLE_ID = os.getenv('FEISHU_BITABLE_TRAINING_TABLE_ID', '')
FEISHU_ETHICS_WIKI_SPACE_ID = os.getenv('FEISHU_ETHICS_WIKI_SPACE_ID', '')
FEISHU_ETHICS_DOC_FOLDER_TOKEN = os.getenv('FEISHU_ETHICS_DOC_FOLDER_TOKEN', '')
FEISHU_CALENDAR_ETHICS_ID = os.getenv('FEISHU_CALENDAR_ETHICS_ID', '')


def _get_feishu_client():
    from libs.feishu_client import feishu_client
    return feishu_client


def _get_open_id_for_account(account_id: int) -> str:
    try:
        from apps.identity.models import Account
        account = Account.objects.filter(id=account_id).first()
        if account:
            return getattr(account, 'feishu_open_id', None) or ''
    except Exception:
        pass
    return ''


# ============================================================================
# 多维表格同步（2.8）
# ============================================================================

def sync_application_to_bitable(application_id: int) -> Optional[str]:
    """
    同步伦理申请到多维表格台账

    字段映射：申请编号、项目名称、委员会、状态、提交日期、创建时间
    """
    if not FEISHU_BITABLE_APP_TOKEN or not FEISHU_BITABLE_ETHICS_APP_TABLE_ID:
        logger.debug('伦理申请多维表格未配置，跳过同步')
        return None

    try:
        from apps.ethics.models import EthicsApplication
        app = EthicsApplication.objects.select_related('protocol', 'committee').get(id=application_id)
        client = _get_feishu_client()

        fields = {
            '申请编号': app.application_number,
            '项目': str(app.protocol),
            '委员会': str(app.committee),
            '状态': app.get_status_display(),
            '提交日期': str(app.submission_date) if app.submission_date else '',
            '创建时间': app.create_time.strftime('%Y-%m-%d %H:%M'),
        }

        record_id = getattr(app, 'bitable_record_id', None) or None
        result = client.upsert_bitable_record(
            app_token=FEISHU_BITABLE_APP_TOKEN,
            table_id=FEISHU_BITABLE_ETHICS_APP_TABLE_ID,
            fields=fields,
            record_id=record_id,
        )
        new_record_id = result.get('record', {}).get('record_id', '')
        logger.info(f'伦理申请#{application_id} 已同步到多维表格: {new_record_id}')
        return new_record_id

    except Exception as e:
        logger.error(f'伦理申请#{application_id} 多维表格同步失败: {e}')
        return None


def sync_approval_to_bitable(document_id: int) -> Optional[str]:
    """同步批件到多维表格（批件有效期总览）"""
    if not FEISHU_BITABLE_APP_TOKEN or not FEISHU_BITABLE_ETHICS_APPROVAL_TABLE_ID:
        return None

    try:
        from apps.ethics.models import ApprovalDocument
        doc = ApprovalDocument.objects.select_related(
            'application', 'application__protocol'
        ).get(id=document_id)
        client = _get_feishu_client()

        today = date.today()
        days_remaining = (doc.expiry_date - today).days if doc.expiry_date else None
        status = '有效'
        if doc.expiry_date and doc.expiry_date < today:
            status = '已过期'
        elif days_remaining is not None and days_remaining <= 30:
            status = '即将到期'

        fields = {
            '批件号': doc.document_number,
            '项目': str(doc.application.protocol),
            '申请编号': doc.application.application_number,
            '批准日期': str(doc.approved_date),
            '到期日期': str(doc.expiry_date) if doc.expiry_date else '',
            '状态': status,
            '剩余天数': str(days_remaining) if days_remaining is not None else '',
        }

        result = client.upsert_bitable_record(
            app_token=FEISHU_BITABLE_APP_TOKEN,
            table_id=FEISHU_BITABLE_ETHICS_APPROVAL_TABLE_ID,
            fields=fields,
        )
        record_id = result.get('record', {}).get('record_id', '')
        logger.info(f'批件#{document_id} 已同步到多维表格: {record_id}')
        return record_id

    except Exception as e:
        logger.error(f'批件#{document_id} 多维表格同步失败: {e}')
        return None


def sync_regulation_to_bitable(regulation_id: int) -> Optional[str]:
    """同步法规到多维表格（法规跟踪清单）"""
    if not FEISHU_BITABLE_APP_TOKEN or not FEISHU_BITABLE_REGULATION_TABLE_ID:
        return None

    try:
        from apps.ethics.models_regulation import Regulation
        reg = Regulation.objects.get(id=regulation_id)
        client = _get_feishu_client()

        fields = {
            '法规名称': reg.title,
            '类型': reg.get_regulation_type_display(),
            '状态': reg.get_status_display(),
            '影响级别': reg.get_impact_level_display(),
            '发布日期': str(reg.publish_date) if reg.publish_date else '',
            '生效日期': str(reg.effective_date) if reg.effective_date else '',
            '受影响领域': ', '.join(reg.affected_areas) if reg.affected_areas else '',
        }

        result = client.upsert_bitable_record(
            app_token=FEISHU_BITABLE_APP_TOKEN,
            table_id=FEISHU_BITABLE_REGULATION_TABLE_ID,
            fields=fields,
        )
        record_id = result.get('record', {}).get('record_id', '')
        logger.info(f'法规#{regulation_id} 已同步到多维表格: {record_id}')
        return record_id

    except Exception as e:
        logger.error(f'法规#{regulation_id} 多维表格同步失败: {e}')
        return None


def sync_compliance_finding_to_bitable(finding_id: int) -> Optional[str]:
    """同步合规问题到多维表格"""
    if not FEISHU_BITABLE_APP_TOKEN or not FEISHU_BITABLE_COMPLIANCE_TABLE_ID:
        return None

    try:
        from apps.ethics.models_compliance import ComplianceFinding
        finding = ComplianceFinding.objects.select_related('compliance_check', 'compliance_check__protocol').get(id=finding_id)
        client = _get_feishu_client()

        fields = {
            '问题编号': finding.finding_no,
            '严重度': finding.get_severity_display(),
            '状态': finding.get_status_display(),
            '项目': str(finding.compliance_check.protocol) if finding.compliance_check.protocol else '',
            '整改截止': str(finding.corrective_deadline) if finding.corrective_deadline else '',
            '验证人': finding.verified_by or '',
            '描述': finding.description[:200] if finding.description else '',
        }

        result = client.upsert_bitable_record(
            app_token=FEISHU_BITABLE_APP_TOKEN,
            table_id=FEISHU_BITABLE_COMPLIANCE_TABLE_ID,
            fields=fields,
        )
        record_id = result.get('record', {}).get('record_id', '')
        logger.info(f'合规问题#{finding_id} 已同步到多维表格: {record_id}')
        return record_id

    except Exception as e:
        logger.error(f'合规问题#{finding_id} 多维表格同步失败: {e}')
        return None


def sync_training_to_bitable(training_id: int) -> Optional[str]:
    """同步培训记录到多维表格"""
    if not FEISHU_BITABLE_APP_TOKEN or not FEISHU_BITABLE_TRAINING_TABLE_ID:
        return None

    try:
        from apps.ethics.models_training import ComplianceTraining
        training = ComplianceTraining.objects.get(id=training_id)
        client = _get_feishu_client()

        fields = {
            '培训编号': training.training_no,
            '主题': training.title,
            '类型': training.get_training_type_display(),
            '状态': training.get_status_display(),
            '日期': str(training.training_date) if training.training_date else '',
            '参与人数': str(training.participant_count),
            '通过人数': str(training.pass_count),
            '通过率': f'{training.pass_rate:.0%}' if training.pass_rate is not None else '',
        }

        result = client.upsert_bitable_record(
            app_token=FEISHU_BITABLE_APP_TOKEN,
            table_id=FEISHU_BITABLE_TRAINING_TABLE_ID,
            fields=fields,
        )
        record_id = result.get('record', {}).get('record_id', '')
        logger.info(f'培训#{training_id} 已同步到多维表格: {record_id}')
        return record_id

    except Exception as e:
        logger.error(f'培训#{training_id} 多维表格同步失败: {e}')
        return None


def run_daily_bitable_sync():
    """每日定时同步：批件总览 + 法规清单 + 合规问题"""
    from apps.ethics.models import ApprovalDocument
    from apps.ethics.models_regulation import Regulation
    from apps.ethics.models_compliance import ComplianceFinding, FindingStatus

    synced = 0

    for doc in ApprovalDocument.objects.filter(is_active=True):
        if sync_approval_to_bitable(doc.id):
            synced += 1

    for reg in Regulation.objects.all():
        if sync_regulation_to_bitable(reg.id):
            synced += 1

    for finding in ComplianceFinding.objects.exclude(status=FindingStatus.CLOSED):
        if sync_compliance_finding_to_bitable(finding.id):
            synced += 1

    logger.info(f'[伦理多维表格] 每日同步完成，共同步 {synced} 条记录')
    return synced


# ============================================================================
# 知识库集成（3.6）
# ============================================================================

class EthicsWikiService:
    """伦理法规知识库服务"""

    @classmethod
    def create_regulation_category(cls, name: str, parent_token: str = '') -> Optional[Dict]:
        """在法规文库中创建分类目录"""
        if not FEISHU_ETHICS_WIKI_SPACE_ID:
            logger.warning('FEISHU_ETHICS_WIKI_SPACE_ID 未配置')
            return None

        try:
            client = _get_feishu_client()
            result = client.create_wiki_node(
                space_id=FEISHU_ETHICS_WIKI_SPACE_ID,
                title=name,
                parent_node_token=parent_token,
                obj_type='doc',
            )
            logger.info(f'法规分类已创建: {name}')
            return result
        except Exception as e:
            logger.error(f'创建法规分类失败: {e}')
            return None

    @classmethod
    def sync_regulation_to_wiki(cls, regulation_id: int) -> Optional[str]:
        """将法规信息同步到飞书知识库"""
        if not FEISHU_ETHICS_WIKI_SPACE_ID:
            return None

        try:
            from apps.ethics.models_regulation import Regulation
            reg = Regulation.objects.get(id=regulation_id)
            client = _get_feishu_client()

            type_category_map = {
                'law': '法律',
                'regulation': '法规',
                'guideline': '指南',
                'standard': '标准',
                'notice': '通知',
            }
            category = type_category_map.get(reg.regulation_type, '其他')

            result = client.create_wiki_node(
                space_id=FEISHU_ETHICS_WIKI_SPACE_ID,
                title=f'[{category}] {reg.title}',
                obj_type='doc',
            )
            token = result.get('node', {}).get('node_token', '')
            if token:
                logger.info(f'法规#{regulation_id} 已同步到知识库: {token}')
            return token

        except Exception as e:
            logger.error(f'法规#{regulation_id} 知识库同步失败: {e}')
            return None

    @classmethod
    def list_regulation_tree(cls, parent_token: str = '') -> list:
        """获取法规文库目录树"""
        if not FEISHU_ETHICS_WIKI_SPACE_ID:
            return []

        try:
            client = _get_feishu_client()
            result = client.get_wiki_nodes(
                space_id=FEISHU_ETHICS_WIKI_SPACE_ID,
                parent_node_token=parent_token,
            )
            return result.get('items', [])
        except Exception as e:
            logger.error(f'获取法规目录失败: {e}')
            return []

    @classmethod
    def create_training_material_node(cls, training_id: int) -> Optional[str]:
        """为培训创建知识库材料节点"""
        if not FEISHU_ETHICS_WIKI_SPACE_ID:
            return None

        try:
            from apps.ethics.models_training import ComplianceTraining
            training = ComplianceTraining.objects.get(id=training_id)
            client = _get_feishu_client()

            result = client.create_wiki_node(
                space_id=FEISHU_ETHICS_WIKI_SPACE_ID,
                title=f'[培训材料] {training.training_no} - {training.title}',
                obj_type='doc',
            )
            token = result.get('node', {}).get('node_token', '')
            if token:
                logger.info(f'培训#{training_id} 材料节点已创建: {token}')
            return token

        except Exception as e:
            logger.error(f'培训材料节点创建失败: {e}')
            return None


# ============================================================================
# 云文档集成（3.7）
# ============================================================================

def create_application_template_doc(application_id: int) -> Optional[str]:
    """
    为伦理申请创建云文档协作模板

    Returns:
        飞书文档 document_id
    """
    if not FEISHU_ETHICS_DOC_FOLDER_TOKEN:
        logger.debug('FEISHU_ETHICS_DOC_FOLDER_TOKEN 未配置')
        return None

    try:
        from apps.ethics.models import EthicsApplication
        app = EthicsApplication.objects.select_related('protocol').get(id=application_id)
        client = _get_feishu_client()

        title = f'[伦理申请] {app.application_number} - {app.protocol}'
        result = client.create_document(
            folder_token=FEISHU_ETHICS_DOC_FOLDER_TOKEN,
            title=title,
        )
        doc_id = result.get('document', {}).get('document_id', '')
        if doc_id:
            logger.info(f'伦理申请#{application_id} 协作文档已创建: {doc_id}')
        return doc_id

    except Exception as e:
        logger.error(f'伦理申请#{application_id} 文档创建失败: {e}')
        return None


def create_supervision_report_doc(supervision_id: int) -> Optional[str]:
    """为监督检查创建报告文档"""
    if not FEISHU_ETHICS_DOC_FOLDER_TOKEN:
        return None

    try:
        from apps.ethics.models_supervision import EthicsSupervision
        sup = EthicsSupervision.objects.select_related('protocol').get(id=supervision_id)
        client = _get_feishu_client()

        title = f'[监督报告] {sup.supervision_no} - {sup.protocol}'
        result = client.create_document(
            folder_token=FEISHU_ETHICS_DOC_FOLDER_TOKEN,
            title=title,
        )
        doc_id = result.get('document', {}).get('document_id', '')
        if doc_id:
            logger.info(f'监督#{supervision_id} 报告文档已创建: {doc_id}')
        return doc_id

    except Exception as e:
        logger.error(f'监督#{supervision_id} 文档创建失败: {e}')
        return None


def upload_regulation_fulltext(regulation_id: int, file_content: bytes, file_name: str) -> Optional[str]:
    """上传法规全文 PDF 到飞书云空间"""
    if not FEISHU_ETHICS_DOC_FOLDER_TOKEN:
        return None

    try:
        client = _get_feishu_client()
        result = client.upload_file(
            folder_token=FEISHU_ETHICS_DOC_FOLDER_TOKEN,
            file_name=file_name,
            file_content=file_content,
        )
        file_token = result.get('file_token', '')
        if file_token:
            logger.info(f'法规#{regulation_id} 全文已上传: {file_token}')
        return file_token

    except Exception as e:
        logger.error(f'法规#{regulation_id} 全文上传失败: {e}')
        return None


# ============================================================================
# 群聊集成（3.8）
# ============================================================================

def create_ethics_project_chat(protocol_id: int) -> Optional[str]:
    """
    为项目创建伦理沟通群

    群名格式：[CN_KIS·伦理] {项目名称}
    自动拉入伦理专员和项目经理

    Returns:
        chat_id
    """
    try:
        from apps.protocol.models import Protocol
        protocol = Protocol.objects.get(id=protocol_id)
        client = _get_feishu_client()

        name = f'[CN_KIS·伦理] {protocol.title}'
        description = (
            f'项目伦理沟通群\n'
            f'项目：{protocol.title}\n'
            f'请在此群内沟通伦理审查相关事宜'
        )

        result = client.create_chat(name=name, description=description)
        chat_id = result.get('chat_id', '')
        if not chat_id:
            logger.warning(f'项目#{protocol_id} 伦理群创建响应中无 chat_id')
            return None

        logger.info(f'项目#{protocol_id} 伦理群已创建: {chat_id}')

        _add_project_members_to_chat(client, chat_id, protocol_id)

        client.send_text_to_chat(
            chat_id,
            f'📋 项目伦理沟通群已创建\n项目：{protocol.title}\n此群用于伦理审查相关沟通。',
        )

        return chat_id

    except Exception as e:
        logger.error(f'项目#{protocol_id} 伦理群创建失败: {e}')
        return None


def _add_project_members_to_chat(client, chat_id: str, protocol_id: int):
    """将项目相关人员拉入伦理群"""
    try:
        from apps.protocol.models import ProjectAssignment
        assignments = ProjectAssignment.objects.filter(protocol_id=protocol_id)
        open_ids = []
        for a in assignments:
            open_id = _get_open_id_for_account(a.account_id)
            if open_id:
                open_ids.append(open_id)
        if open_ids:
            client.add_chat_members(chat_id, open_ids)
            logger.info(f'伦理群 {chat_id} 已添加 {len(open_ids)} 个成员')
    except Exception as e:
        logger.warning(f'伦理群成员添加失败: {e}')


def send_message_to_ethics_chat(supervision_id: int, message: str) -> Optional[str]:
    """向监督关联的项目伦理群发送消息"""
    try:
        from apps.ethics.models_supervision import EthicsSupervision
        sup = EthicsSupervision.objects.get(id=supervision_id)

        chat_id = sup.feishu_chat_id
        if not chat_id:
            logger.debug(f'监督#{supervision_id} 无群聊ID')
            return None

        client = _get_feishu_client()
        result = client.send_text_to_chat(chat_id, message)
        return result.get('message_id', '')

    except Exception as e:
        logger.error(f'伦理群消息发送失败: {e}')
        return None


# ============================================================================
# 日历集成（3.9）
# ============================================================================

def create_review_meeting_event(
    application_id: int,
    meeting_time: datetime,
    duration_hours: float = 2.0,
    location: str = '',
    attendee_open_ids: List[str] = None,
) -> Optional[str]:
    """
    创建伦理审查会议日历事件

    Returns:
        飞书日历事件 event_id
    """
    if not FEISHU_CALENDAR_ETHICS_ID:
        logger.debug('FEISHU_CALENDAR_ETHICS_ID 未配置')
        return None

    try:
        from apps.ethics.models import EthicsApplication
        app = EthicsApplication.objects.select_related('protocol', 'committee').get(id=application_id)
        client = _get_feishu_client()

        start_ts = int(meeting_time.timestamp())
        end_ts = start_ts + int(duration_hours * 3600)

        summary = f'[伦理审查] {app.application_number} - {app.protocol}'
        description = (
            f'伦理审查会议\n'
            f'项目：{app.protocol}\n'
            f'委员会：{app.committee}\n'
            f'申请编号：{app.application_number}'
        )

        result = client.create_calendar_event(
            calendar_id=FEISHU_CALENDAR_ETHICS_ID,
            summary=summary,
            start_time=start_ts,
            end_time=end_ts,
            description=description,
            location=location,
            attendee_ids=attendee_open_ids or [],
        )
        event_id = result.get('event', {}).get('event_id', '')
        if event_id:
            logger.info(f'审查会议事件已创建: {event_id}')
        return event_id

    except Exception as e:
        logger.error(f'审查会议事件创建失败: {e}')
        return None


def create_training_calendar_event(training_id: int) -> Optional[str]:
    """
    为培训创建日历事件

    Returns:
        飞书日历事件 event_id
    """
    if not FEISHU_CALENDAR_ETHICS_ID:
        return None

    try:
        from apps.ethics.models_training import ComplianceTraining
        training = ComplianceTraining.objects.get(id=training_id)

        if not training.training_date:
            logger.debug(f'培训#{training_id} 未设置日期')
            return None

        client = _get_feishu_client()

        start_dt = datetime.combine(training.training_date, datetime.min.time().replace(hour=9))
        start_ts = int(start_dt.timestamp())
        duration_seconds = int(float(training.duration_hours) * 3600) if training.duration_hours else 7200
        end_ts = start_ts + duration_seconds

        summary = f'[合规培训] {training.training_no} - {training.title}'
        description = (
            f'培训类型：{training.get_training_type_display()}\n'
            f'讲师：{training.trainer}\n'
            f'时长：{training.duration_hours} 小时\n'
        )
        if training.content:
            description += f'内容：{training.content[:200]}\n'

        attendee_ids = []
        for p in training.participants.all():
            open_id = _get_open_id_for_account(p.staff_id)
            if open_id:
                attendee_ids.append(open_id)

        result = client.create_calendar_event(
            calendar_id=FEISHU_CALENDAR_ETHICS_ID,
            summary=summary,
            start_time=start_ts,
            end_time=end_ts,
            description=description,
            location=training.location,
            attendee_ids=attendee_ids,
        )
        event_id = result.get('event', {}).get('event_id', '')
        if event_id:
            logger.info(f'培训#{training_id} 日历事件已创建: {event_id}')
        return event_id

    except Exception as e:
        logger.error(f'培训#{training_id} 日历事件创建失败: {e}')
        return None


def create_supervision_calendar_event(supervision_id: int) -> Optional[str]:
    """为监督计划创建日历事件"""
    if not FEISHU_CALENDAR_ETHICS_ID:
        return None

    try:
        from apps.ethics.models_supervision import EthicsSupervision
        sup = EthicsSupervision.objects.select_related('protocol').get(id=supervision_id)

        if not sup.planned_date:
            return None

        client = _get_feishu_client()

        start_dt = datetime.combine(sup.planned_date, datetime.min.time().replace(hour=9))
        start_ts = int(start_dt.timestamp())
        end_ts = start_ts + 14400  # 默认 4 小时

        summary = f'[伦理监督] {sup.supervision_no} - {sup.protocol}'
        description = (
            f'监督类型：{sup.get_supervision_type_display()}\n'
            f'项目：{sup.protocol}\n'
            f'范围：{sup.scope[:200] if sup.scope else "待定"}\n'
        )

        result = client.create_calendar_event(
            calendar_id=FEISHU_CALENDAR_ETHICS_ID,
            summary=summary,
            start_time=start_ts,
            end_time=end_ts,
            description=description,
        )
        event_id = result.get('event', {}).get('event_id', '')
        if event_id:
            logger.info(f'监督#{supervision_id} 日历事件已创建: {event_id}')
        return event_id

    except Exception as e:
        logger.error(f'监督#{supervision_id} 日历事件创建失败: {e}')
        return None


# ============================================================================
# 任务集成（3.10）
# ============================================================================

def create_corrective_action_task(supervision_id: int) -> Optional[str]:
    """
    为监督整改项创建飞书任务

    Returns:
        飞书任务 GUID
    """
    try:
        from apps.ethics.models_supervision import EthicsSupervision
        sup = EthicsSupervision.objects.select_related('protocol').get(id=supervision_id)

        if not sup.corrective_actions:
            return None

        client = _get_feishu_client()

        summary = f'[伦理整改] {sup.supervision_no} - {sup.protocol}'
        description = (
            f'整改要求：\n{sup.corrective_actions}\n\n'
            f'监督类型：{sup.get_supervision_type_display()}\n'
            f'项目：{sup.protocol}'
        )

        due_ts = None
        if sup.corrective_deadline:
            due_ts = int(datetime.combine(sup.corrective_deadline, datetime.min.time().replace(hour=18)).timestamp())

        member_ids = []
        if sup.created_by_id:
            open_id = _get_open_id_for_account(sup.created_by_id)
            if open_id:
                member_ids.append(open_id)

        data = client.create_task(
            summary=summary,
            description=description,
            due_timestamp=due_ts,
            member_open_ids=member_ids or None,
            extra=json.dumps({
                'type': 'ethics_corrective',
                'supervision_id': supervision_id,
                'source': 'cn_kis',
            }),
        )

        task_guid = data.get('task', {}).get('guid', '')
        if task_guid:
            logger.info(f'监督#{supervision_id} 整改任务已创建: {task_guid}')
        return task_guid

    except Exception as e:
        logger.error(f'监督#{supervision_id} 整改任务创建失败: {e}')
        return None


def create_response_task(opinion_id: int) -> Optional[str]:
    """
    为审查意见回复创建飞书任务

    Returns:
        飞书任务 GUID
    """
    try:
        from apps.ethics.models_review import EthicsReviewOpinion
        opinion = EthicsReviewOpinion.objects.select_related(
            'application', 'application__protocol'
        ).get(id=opinion_id)

        if not opinion.response_required:
            return None

        client = _get_feishu_client()

        summary = f'[伦理回复] {opinion.opinion_no} - {opinion.application.protocol}'
        description = (
            f'审查意见需要回复\n'
            f'意见类型：{opinion.get_opinion_type_display()}\n'
            f'意见摘要：{opinion.summary[:200] if opinion.summary else ""}\n'
            f'申请编号：{opinion.application.application_number}'
        )

        due_ts = None
        if opinion.response_deadline:
            due_ts = int(datetime.combine(opinion.response_deadline, datetime.min.time().replace(hour=18)).timestamp())

        member_ids = []
        if opinion.application.created_by_id:
            open_id = _get_open_id_for_account(opinion.application.created_by_id)
            if open_id:
                member_ids.append(open_id)

        data = client.create_task(
            summary=summary,
            description=description,
            due_timestamp=due_ts,
            member_open_ids=member_ids or None,
            extra=json.dumps({
                'type': 'ethics_response',
                'opinion_id': opinion_id,
                'source': 'cn_kis',
            }),
        )

        task_guid = data.get('task', {}).get('guid', '')
        if task_guid:
            logger.info(f'意见#{opinion_id} 回复任务已创建: {task_guid}')
        return task_guid

    except Exception as e:
        logger.error(f'意见#{opinion_id} 回复任务创建失败: {e}')
        return None


def complete_corrective_task(supervision_id: int, task_guid: str) -> bool:
    """标记整改任务完成"""
    try:
        client = _get_feishu_client()
        client.complete_task(task_guid)
        logger.info(f'监督#{supervision_id} 整改任务已完成: {task_guid}')
        return True
    except Exception as e:
        logger.error(f'整改任务完成失败: {e}')
        return False


def complete_response_task(opinion_id: int, task_guid: str) -> bool:
    """标记回复任务完成"""
    try:
        client = _get_feishu_client()
        client.complete_task(task_guid)
        logger.info(f'意见#{opinion_id} 回复任务已完成: {task_guid}')
        return True
    except Exception as e:
        logger.error(f'回复任务完成失败: {e}')
        return False
