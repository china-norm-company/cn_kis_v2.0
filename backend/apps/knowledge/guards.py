"""
知识资产写保护守卫 — CN KIS V2.0 Wave 3

设计原则：
  - V2 默认对 PersonalContext、KnowledgeEntry 等核心资产保持只读
  - 只有当 KNOWLEDGE_WRITE_ENABLED=true 时，才允许写入/修改
  - 原始层（EkbRawRecord、RawLimsRecord）永久只读，不受 KNOWLEDGE_WRITE_ENABLED 影响

使用方式（在 service / task 中调用）：
    from apps.knowledge.guards import KnowledgeAssetGuard

    # 检查是否允许写入（抛出 PermissionError 或静默返回 False）
    KnowledgeAssetGuard.assert_write_allowed(asset_type='knowledge_entry')

    # 判断型（不抛异常）
    if KnowledgeAssetGuard.is_write_allowed('personal_context'):
        ...

集成规则：
  - ingestion_pipeline.run_pipeline 在写入 KnowledgeEntry 前调用
  - feishu_comprehensive_collector 在写入 PersonalContext 前调用
  - EkbRawRecord / RawLimsRecord 永久拒绝写入（独立于开关）
"""
from __future__ import annotations

import logging
import os
from typing import Literal

logger = logging.getLogger(__name__)

AssetType = Literal[
    'knowledge_entry',
    'personal_context',
    'knowledge_entity',
    'knowledge_relation',
    'ekb_raw_record',      # 永久只读
    'raw_lims_record',     # 永久只读
]

# 永久只读原始层，不受 KNOWLEDGE_WRITE_ENABLED 影响
_IMMUTABLE_ASSETS: set[str] = {'ekb_raw_record', 'raw_lims_record'}

# 受 KNOWLEDGE_WRITE_ENABLED 开关控制的资产
_WRITE_PROTECTED_ASSETS: set[str] = {
    'knowledge_entry',
    'personal_context',
    'knowledge_entity',
    'knowledge_relation',
}


class KnowledgeWriteDisabled(PermissionError):
    """当 KNOWLEDGE_WRITE_ENABLED=false 时尝试写入知识资产抛出此异常。"""

    def __init__(self, asset_type: str):
        super().__init__(
            f'知识资产写保护拦截：{asset_type} — '
            '请设置 KNOWLEDGE_WRITE_ENABLED=true 以允许写入。'
            '（默认在 V2 向生产切换前保持只读）'
        )
        self.asset_type = asset_type


class ImmutableAssetWriteError(PermissionError):
    """尝试写入永久只读原始层抛出此异常（永远不允许）。"""

    def __init__(self, asset_type: str):
        super().__init__(
            f'不可变原始层 {asset_type} 禁止任何写入操作。'
            '原始层（EkbRawRecord/RawLimsRecord）在系统生命周期内永远只读。'
        )
        self.asset_type = asset_type


class KnowledgeAssetGuard:
    """
    知识资产写保护守卫。

    所有对受保护知识资产的写操作（create / update / delete）必须先通过此守卫。
    """

    @staticmethod
    def _write_enabled() -> bool:
        """读取环境变量。若未设置，默认为 False（保守策略）。"""
        return os.getenv('KNOWLEDGE_WRITE_ENABLED', '').lower() == 'true'

    @classmethod
    def is_write_allowed(cls, asset_type: str) -> bool:
        """
        判断指定资产类型是否允许写入，不抛异常。

        Returns:
            True 表示允许写入，False 表示被保护。
        """
        asset_type = asset_type.lower()
        if asset_type in _IMMUTABLE_ASSETS:
            return False
        if asset_type in _WRITE_PROTECTED_ASSETS:
            return cls._write_enabled()
        # 未列出的资产类型默认允许（V2 新增资产）
        return True

    @classmethod
    def assert_write_allowed(cls, asset_type: str) -> None:
        """
        断言允许写入，否则抛出异常。

        在 service / task 写入知识资产之前调用此方法。

        Raises:
            ImmutableAssetWriteError: 尝试写入永久只读原始层
            KnowledgeWriteDisabled: KNOWLEDGE_WRITE_ENABLED=false 时尝试写入受保护资产
        """
        asset_type = asset_type.lower()
        if asset_type in _IMMUTABLE_ASSETS:
            logger.error('拦截不可变原始层写入：%s', asset_type)
            raise ImmutableAssetWriteError(asset_type)
        if asset_type in _WRITE_PROTECTED_ASSETS and not cls._write_enabled():
            logger.warning('知识写保护拦截：%s（KNOWLEDGE_WRITE_ENABLED 未开启）', asset_type)
            raise KnowledgeWriteDisabled(asset_type)
        # 允许写入
        logger.debug('知识资产写入已放行：%s', asset_type)

    @classmethod
    def guard_create_entry(cls) -> None:
        """便捷方法：在创建 KnowledgeEntry 前调用。"""
        cls.assert_write_allowed('knowledge_entry')

    @classmethod
    def guard_ingest_personal_context(cls) -> None:
        """便捷方法：在写入 PersonalContext 前调用。"""
        cls.assert_write_allowed('personal_context')

    @classmethod
    def status_report(cls) -> dict:
        """
        返回当前保护状态报告，用于运维检查。

        Example response:
            {
                'write_enabled': False,
                'immutable_assets': ['ekb_raw_record', 'raw_lims_record'],
                'write_protected_assets': {
                    'knowledge_entry': False,
                    'personal_context': False,
                    ...
                }
            }
        """
        enabled = cls._write_enabled()
        return {
            'write_enabled': enabled,
            'immutable_assets': sorted(_IMMUTABLE_ASSETS),
            'write_protected_assets': {
                asset: enabled for asset in sorted(_WRITE_PROTECTED_ASSETS)
            },
            'note': (
                'KNOWLEDGE_WRITE_ENABLED=true 可解锁受保护资产的写入权限。'
                '不可变原始层永久只读。'
            ),
        }


# ════════════════════════════════════════════════════════════════════════════════
# Wave 5 升级：DataGovernanceGuard — 基于六维分类的细粒度操作鉴权
# ════════════════════════════════════════════════════════════════════════════════

from apps.knowledge.classification import ClassificationRegistry
class GovernanceViolation(PermissionError):
    """数据治理规则违反异常。"""

    def __init__(self, table: str, operation: str, reason: str):
        super().__init__(f'[DataGovernance] {table}.{operation} 被拒绝：{reason}')
        self.table = table
        self.operation = operation
        self.reason = reason


class DataGovernanceGuard:
    """
    升级版治理守卫，基于六维分类的细粒度操作鉴权。

    向后兼容：KnowledgeAssetGuard 的所有方法仍可调用。

    鉴权规则优先级（从高到低）：
      1. 永久不可变原始层 — 拒绝任何写操作
      2. SEC-4 + export → 禁止导出明文（PHI 数据不可原文导出）
      3. REG-GCP + delete → 禁止删除（ALCOA+ 要求）
      4. REG-PI + (update/delete) → 需要 compliance_officer 或 data_manager 角色
      5. 知识写保护开关（KnowledgeAssetGuard 逻辑）
      6. 通过
    """

    # 表名 → KnowledgeAssetGuard asset_type 的映射（向后兼容）
    _TABLE_TO_ASSET: dict[str, str] = {
        't_knowledge_entry': 'knowledge_entry',
        't_personal_context': 'personal_context',
        't_knowledge_entity': 'knowledge_entity',
        't_knowledge_relation': 'knowledge_relation',
        't_ekb_raw_record': 'ekb_raw_record',
        't_raw_lims_record': 'raw_lims_record',
    }

    @classmethod
    def assert_operation_allowed(
        cls,
        table_name: str,
        operation: Literal['create', 'read', 'update', 'delete', 'export'],
        actor_roles: list[str] | None = None,
    ) -> None:
        """
        断言指定操作在指定角色下允许对 table_name 执行。

        Args:
            table_name: 数据库表名（如 't_subject'）
            operation: 操作类型 create / read / update / delete / export
            actor_roles: 执行者角色列表（如 ['data_manager', 'admin']）

        Raises:
            ImmutableAssetWriteError: 尝试写入永久只读原始层
            GovernanceViolation: 其他治理规则违反
            KnowledgeWriteDisabled: 知识资产写保护未开启
        """
        actor_roles = actor_roles or []
        tn = table_name.lower()

        # ── 规则 1：永久不可变原始层 ─────────────────────────────────────────
        if tn in ('t_ekb_raw_record', 't_raw_lims_record'):
            if operation in ('create', 'update', 'delete', 'export'):
                raise ImmutableAssetWriteError(tn)
            return  # read 允许

        classification = ClassificationRegistry.get(tn)
        if classification is None:
            # 未注册的表不受治理控制，允许通过
            logger.debug('[DataGovernance] %s 未在 ClassificationRegistry 中注册，直接放行', tn)
            return

        # ── 规则 2：PHI 数据不可原文导出 ────────────────────────────────────
        if operation == 'export' and classification.is_phi():
            if 'compliance_officer' not in actor_roles and 'tech_director' not in actor_roles:
                raise GovernanceViolation(
                    tn, operation,
                    f'SEC-4 极密/PHI 数据不允许原文导出，需要 compliance_officer 或 tech_director 角色（当前角色：{actor_roles}）',
                )

        # ── 规则 3：GCP 数据禁止删除（ALCOA+） ──────────────────────────────
        if operation == 'delete' and 'REG-GCP' in classification.regulatory_categories:
            raise GovernanceViolation(
                tn, operation,
                'GCP 受控数据须符合 ALCOA+ 原则：不可删除。如需数据版本管理，请使用状态字段（archived）替代物理删除。',
            )

        # ── 规则 4：PIPL 数据的写操作需合规专员介入 ─────────────────────────
        if (
            operation in ('update', 'delete')
            and 'REG-PI' in classification.regulatory_categories
            and not classification.has_gcp_pi_conflict()  # GCP+PI 冲突由规则 3 更早处理
        ):
            allowed_roles = {'compliance_officer', 'data_manager', 'admin'}
            if not any(r in allowed_roles for r in actor_roles):
                raise GovernanceViolation(
                    tn, operation,
                    f'PIPL 数据的修改/删除需要 compliance_officer / data_manager / admin 角色（当前角色：{actor_roles}）',
                )

        # ── 规则 5：知识资产写保护开关 ──────────────────────────────────────
        asset_type = cls._TABLE_TO_ASSET.get(tn)
        if asset_type and operation in ('create', 'update', 'delete'):
            KnowledgeAssetGuard.assert_write_allowed(asset_type)

        logger.debug('[DataGovernance] %s.%s 已放行（actor_roles=%s）', tn, operation, actor_roles)

    @classmethod
    def can_perform(
        cls,
        table_name: str,
        operation: Literal['create', 'read', 'update', 'delete', 'export'],
        actor_roles: list[str] | None = None,
    ) -> tuple[bool, str]:
        """
        判断型（不抛异常），返回 (allowed, reason)。

        Returns:
            (True, '') 表示允许；(False, '原因说明') 表示禁止
        """
        try:
            cls.assert_operation_allowed(table_name, operation, actor_roles)
            return True, ''
        except (ImmutableAssetWriteError, GovernanceViolation, KnowledgeWriteDisabled) as exc:
            return False, str(exc)


# ════════════════════════════════════════════════════════════════════════════════
# Django Ninja API 装饰器
# ════════════════════════════════════════════════════════════════════════════════

import functools
from typing import Callable


def require_governance(
    table_name: str,
    operation: Literal['create', 'read', 'update', 'delete', 'export'],
    mode: Literal['enforce', 'warn'] = 'enforce',
) -> Callable:
    """
    Django Ninja API 路由装饰器：在 API 函数执行前执行治理鉴权。

    使用方式：
        @router.delete('/subjects/{subject_id}')
        @require_governance('t_subject', 'delete')
        def delete_subject(request, subject_id: int):
            ...

    Args:
        table_name: 数据库表名（如 't_subject', 't_ekb_raw_record'）
        operation:  操作类型 create / read / update / delete / export
        mode:       'enforce'（默认）拒绝并返回 403；
                    'warn' 只记录日志不阻断（用于灰度上线）

    Returns:
        装饰器函数
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(request, *args, **kwargs):
            from ninja.errors import HttpError

            # 从 request 中提取角色列表
            actor_roles: list[str] = []
            try:
                if hasattr(request, 'auth') and request.auth:
                    account = request.auth
                    if hasattr(account, 'roles'):
                        actor_roles = [r.role_code for r in account.roles.all()]
                    elif hasattr(account, 'role_codes'):
                        actor_roles = list(account.role_codes)
            except Exception:
                pass

            allowed, reason = DataGovernanceGuard.can_perform(table_name, operation, actor_roles)
            if not allowed:
                if mode == 'enforce':
                    logger.warning(
                        '[DataGovernance][BLOCKED] %s.%s actor=%s reason=%s',
                        table_name, operation, actor_roles, reason,
                    )
                    raise HttpError(403, f'[治理拦截] {reason}')
                else:
                    logger.warning(
                        '[DataGovernance][WARN] %s.%s actor=%s reason=%s',
                        table_name, operation, actor_roles, reason,
                    )

            return func(request, *args, **kwargs)

        return wrapper
    return decorator
