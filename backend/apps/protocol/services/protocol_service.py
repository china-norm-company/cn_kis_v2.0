"""
协议管理服务

封装协议 CRUD、文件上传、AI 解析触发等业务逻辑。

飞书集成：
- 协议创建/状态变更时同步到飞书多维表格看板（替代原飞书项目工作项）
- 通过 feishu_sync 模块的 SyncConfig 配置决定同步目标
"""
import logging
from typing import Dict, Optional
from django.utils import timezone

from apps.protocol.models import Protocol, ProtocolStatus, ProtocolParseLog

logger = logging.getLogger(__name__)


# ============================================================================
# 协议 CRUD
# ============================================================================
def _apply_data_scope(qs, account=None):
    """应用数据权限过滤（若提供 account）；DEBUG 模式下跳过，与项目全链路权限一致"""
    if account is None:
        return qs
    from django.conf import settings
    if getattr(settings, 'DEBUG', False):
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account)


def list_protocols(
    status: str = None,
    title: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    """分页查询协议列表"""
    qs = Protocol.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if title:
        qs = qs.filter(title__icontains=title)

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_protocol(protocol_id: int) -> Optional[Protocol]:
    """获取协议详情"""
    return Protocol.objects.filter(id=protocol_id, is_deleted=False).first()


def _sync_protocol_to_bitable(protocol: Protocol) -> None:
    """
    同步协议状态到飞书多维表格看板

    替代原飞书项目工作项同步。通过 feishu_sync 的 SyncConfig 查找
    t_protocol 表对应的多维表格配置，将单条协议记录同步过去。
    如未配置则静默跳过。
    """
    try:
        from apps.feishu_sync.models import SyncConfig
        config = SyncConfig.objects.filter(
            table_name='t_protocol', enabled=True
        ).first()
        if not config:
            return

        from libs.feishu_client import feishu_client

        fields = {}
        for db_field, feishu_field_id in config.field_mapping.items():
            value = getattr(protocol, db_field, None)
            if value is not None:
                fields[feishu_field_id] = str(value)

        if not fields:
            return

        feishu_client.upsert_bitable_record(
            app_token=config.bitable_app_token,
            table_id=config.bitable_table_id,
            fields=fields,
        )
        logger.info(f"协议#{protocol.id} 已同步到飞书多维表格")
    except Exception as e:
        logger.error(f"协议#{protocol.id} 多维表格同步失败: {e}")


def create_protocol(
    title: str,
    code: str = '',
    efficacy_type: str = '',
    sample_size: int = None,
) -> Protocol:
    """创建协议并同步到飞书多维表格"""
    protocol = Protocol.objects.create(
        title=title,
        code=code,
        efficacy_type=efficacy_type,
        sample_size=sample_size,
    )
    _sync_protocol_to_bitable(protocol)

    # S3-5：自动创建项目群
    _create_project_chat(protocol)
    return protocol


def update_protocol(protocol_id: int, **kwargs) -> Optional[Protocol]:
    """更新协议信息并同步飞书多维表格"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(protocol, key):
            setattr(protocol, key, value)
    protocol.save()
    # 状态变更时同步飞书多维表格
    if 'status' in kwargs:
        _sync_protocol_to_bitable(protocol)
    return protocol


def evaluate_archive_readiness(protocol_id: int) -> Dict[str, object]:
    """
    评估协议是否允许归档。

    原则：
    1. 协议归档必须走结项链路，不允许绕过 closeout 直接归档
    2. 不允许存在未完成工单
    3. 质量结项门禁需通过
    """
    checks = []

    try:
        from apps.closeout.models import CloseoutStatus, ProjectCloseout

        latest_closeout = (
            ProjectCloseout.objects.filter(protocol_id=protocol_id)
            .order_by('-initiated_at', '-id')
            .first()
        )
        has_closeout = latest_closeout is not None
        checks.append({
            'name': '已发起结项流程',
            'passed': has_closeout,
            'detail': f'closeout_id={latest_closeout.id}' if latest_closeout else '未找到结项记录',
        })
        checks.append({
            'name': '结项记录已归档',
            'passed': bool(latest_closeout and latest_closeout.status == CloseoutStatus.ARCHIVED),
            'detail': (
                f'current={latest_closeout.status}'
                if latest_closeout else
                '请先通过 /closeout/{id}/archive 完成结项归档'
            ),
        })
    except Exception as e:
        checks.append({
            'name': '结项链路可验证',
            'passed': False,
            'detail': f'结项模块检查失败: {e}',
        })

    try:
        from apps.workorder.models import WorkOrder, WorkOrderStatus

        open_workorders = WorkOrder.objects.filter(
            enrollment__protocol_id=protocol_id,
            is_deleted=False,
        ).exclude(
            status__in=[WorkOrderStatus.APPROVED, WorkOrderStatus.CANCELLED],
        ).count()
        checks.append({
            'name': '无未完成工单',
            'passed': open_workorders == 0,
            'detail': f'open_workorders={open_workorders}',
        })
    except Exception as e:
        checks.append({
            'name': '工单状态可验证',
            'passed': False,
            'detail': f'工单检查失败: {e}',
        })

    try:
        from apps.quality.services import check_closeout_gate

        quality_gate = check_closeout_gate(protocol_id)
        checks.append({
            'name': '质量结项门禁通过',
            'passed': bool(quality_gate.get('passed')),
            'detail': quality_gate,
        })
    except Exception as e:
        checks.append({
            'name': '质量结项门禁可验证',
            'passed': False,
            'detail': f'质量门禁检查失败: {e}',
        })

    return {
        'passed': all(item['passed'] for item in checks),
        'checks': checks,
    }


def delete_protocol(protocol_id: int) -> bool:
    """软删除协议"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return False
    protocol.is_deleted = True
    protocol.save(update_fields=['is_deleted', 'update_time'])
    return True


# ============================================================================
# 文件上传与解析
# ============================================================================
def upload_protocol_file(protocol_id: int, file_path: str) -> Optional[Protocol]:
    """上传协议文件并更新状态为 uploaded"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None
    protocol.file_path = file_path
    protocol.status = ProtocolStatus.UPLOADED
    protocol.save(update_fields=['file_path', 'status', 'update_time'])
    return protocol


def trigger_parse(protocol_id: int, account_id: Optional[int] = None) -> Optional[ProtocolParseLog]:
    """触发协议 AI 解析

    创建解析日志记录，实际解析由 agent_gateway 完成。
    返回 ProtocolParseLog 供后续轮询状态。

    account_id: 触发解析的用户账号 ID，用于 agent_gateway 会话；未传时使用 0（系统调用）。
    """
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None
    if not protocol.file_path:
        logger.warning(f'Protocol {protocol_id} has no file to parse')
        return None

    # 更新状态为解析中
    protocol.status = ProtocolStatus.PARSING
    protocol.save(update_fields=['status', 'update_time'])

    # 创建解析日志
    parse_log = ProtocolParseLog.objects.create(
        protocol=protocol,
        status=ProtocolStatus.PARSING,
    )

    # 调用 AI 智能体解析（ARK/Kimi 双通道）
    # call_agent 签名为 (account_id, agent_id, message, context=...)
    try:
        from apps.agent_gateway.services import call_agent
        call_agent(
            account_id=account_id if account_id is not None else 0,
            agent_id='protocol-agent',
            message='请解析该协议文件，提取访视、流程等结构化信息。',
            context={
                'protocol_id': protocol_id,
                'file_path': protocol.file_path,
                'parse_log_id': parse_log.id,
            },
        )
    except ImportError:
        logger.warning(f'agent_gateway 模块不可用，协议#{protocol_id} 需手动调用 set_parsed_data 完成解析')
    except Exception as e:
        logger.error(f'协议#{protocol_id} AI 解析触发失败: {e}')

    logger.info(f'Parse triggered for protocol {protocol_id}, log_id={parse_log.id}')
    return parse_log


def set_parsed_data(protocol_id: int, parsed_data: dict) -> Optional[Protocol]:
    """
    手动设置协议解析数据（当 AI 解析不可用时的替代路径）

    parsed_data 结构示例:
    {
        "visits": [
            {"name": "V1 筛选", "day": 0, "window": "0",
             "procedures": [{"name": "知情同意"}, {"name": "体格检查"}]}
        ]
    }
    """
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None

    if not parsed_data or not isinstance(parsed_data, dict):
        raise ValueError('parsed_data 必须是非空字典')

    protocol.parsed_data = parsed_data
    protocol.status = ProtocolStatus.PARSED
    protocol.save(update_fields=['parsed_data', 'status', 'update_time'])

    # 完成关联的解析日志
    from apps.protocol.models import ProtocolParseLog
    parse_log = ProtocolParseLog.objects.filter(
        protocol=protocol, status=ProtocolStatus.PARSING,
    ).order_by('-id').first()
    if parse_log:
        parse_log.status = ProtocolStatus.PARSED
        parse_log.save(update_fields=['status'])

    logger.info(f'协议#{protocol_id} 手动设置 parsed_data 完成')
    return protocol


def complete_parse(parse_log_id: int, parsed_result: dict = None, error_message: str = '') -> Optional[ProtocolParseLog]:
    """完成协议解析（由 agent_gateway 回调调用）"""
    parse_log = ProtocolParseLog.objects.filter(id=parse_log_id).first()
    if not parse_log:
        return None

    if error_message:
        parse_log.status = ProtocolStatus.DRAFT  # 回退状态
        parse_log.error_message = error_message
    else:
        parse_log.status = ProtocolStatus.PARSED
        parse_log.parsed_result = parsed_result
        # 同步到协议主记录
        protocol = parse_log.protocol
        protocol.parsed_data = parsed_result
        protocol.status = ProtocolStatus.PARSED
        protocol.save(update_fields=['parsed_data', 'status', 'update_time'])

    parse_log.finish_time = timezone.now()
    parse_log.save()
    return parse_log


def get_parse_logs(protocol_id: int) -> list:
    """获取协议的解析日志"""
    return list(
        ProtocolParseLog.objects.filter(protocol_id=protocol_id).order_by('-create_time')
    )


def _create_project_chat(protocol: Protocol):
    """
    S3-5：协议创建时自动创建飞书项目群

    群名格式：[CN_KIS] {协议名称}
    自动拉入 ProjectAssignment 成员。
    若未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，则跳过创建（开发/测试环境常见）。
    """
    from django.conf import settings
    if not (getattr(settings, 'FEISHU_APP_ID', '') and getattr(settings, 'FEISHU_APP_SECRET', '')):
        logger.info('协议#%s 跳过项目群创建: 未配置 FEISHU_APP_ID/FEISHU_APP_SECRET', protocol.id)
        return
    try:
        from libs.feishu_client import feishu_client
        chat_name = f'[CN_KIS] {protocol.title}'

        result = feishu_client.create_chat(
            name=chat_name,
            description=f'项目协议: {protocol.code or protocol.title}\n'
                        f'创建时间: {protocol.create_time}',
        )
        chat_id = result.get('chat_id', '')
        if not chat_id:
            logger.warning(f'协议#{protocol.id} 项目群创建返回无 chat_id')
            return

        # 保存 chat_id 到协议
        protocol.feishu_chat_id = chat_id
        protocol.save(update_fields=['feishu_chat_id', 'update_time'])

        # 拉入 ProjectAssignment 成员
        _add_assignment_members_to_chat(protocol.id, chat_id)

        # 发送公告
        import json as _json
        text_content = (
            f'📋 项目群已创建，欢迎团队成员！\n'
            f'协议: {protocol.title}\n'
            f'编码: {protocol.code or "待定"}'
        )
        feishu_client.send_message(
            receive_id=chat_id,
            msg_type='text',
            content=_json.dumps({'text': text_content}),
            receive_id_type='chat_id',
        )
        logger.info(f'协议#{protocol.id} 项目群已创建: {chat_id}')
    except Exception as e:
        logger.error(f'协议#{protocol.id} 项目群创建失败: {e}')


def _add_assignment_members_to_chat(protocol_id: int, chat_id: str):
    """拉入项目分配的成员到群"""
    try:
        from libs.feishu_client import feishu_client
        from apps.hr.models import ProjectAssignment

        assignments = ProjectAssignment.objects.filter(
            protocol_id=protocol_id, is_active=True,
        ).select_related('staff')

        open_ids = [a.staff.feishu_open_id for a in assignments if a.staff.feishu_open_id]
        if open_ids:
            feishu_client.add_chat_members(chat_id, open_ids)
            logger.info(f'项目群 {chat_id} 拉入 {len(open_ids)} 名成员')
    except Exception as e:
        logger.error(f'项目群拉人失败: {e}')
