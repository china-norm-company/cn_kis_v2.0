"""
技能执行上下文 (Skill Execution Context)

Claw 技能执行时必须携带调用方的身份信息，确保服务层能够按用户权限
过滤数据，消除 AI 路径绕过 RBAC 的安全漏洞。

使用方式：
    from apps.secretary.execution_context import SkillExecutionContext

    # 从 Account 对象构建（推荐，在 API 入口或服务层构建一次，逐层传递）
    context = SkillExecutionContext.from_account(account)

    # 传给技能执行器
    result = execute_skill('crf-validator', params, execution_context=context)

GCP 合规意义：
    - 确保 AI 技能只能访问调用用户有权访问的数据
    - 审计日志中记录 account_id，实现操作可追溯
    - 数据作用域（global/project/personal）全程传递，不在服务层重新计算
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class SkillExecutionContext:
    """
    技能执行上下文

    Attributes:
        account_id:       调用用户的 Account.id
        account_username: 调用用户的 username（用于日志）
        project_ids:      用户有项目级角色的项目 ID 列表（不含全局角色带来的权限）
        permissions:      用户所有权限码列表（已展开通配符的完整列表）
        data_scope:       数据作用域 global / project / personal
        is_admin:         是否为管理员（admin/superadmin）
    """
    account_id: int
    account_username: str
    project_ids: List[int] = field(default_factory=list)
    permissions: List[str] = field(default_factory=list)
    data_scope: str = 'personal'
    is_admin: bool = False

    @classmethod
    def from_account(cls, account) -> 'SkillExecutionContext':
        """
        从 Account 对象构建执行上下文

        该方法一次性从数据库/缓存读取所有必要信息，构建不可变的上下文对象。
        推荐在 API 入口层调用，然后逐层传递，避免每个服务重复查库。

        Args:
            account: apps.identity.models.Account 实例

        Returns:
            填充完整的 SkillExecutionContext
        """
        from apps.identity.authz import get_authz_service
        from apps.identity.filters import get_data_scope

        authz = get_authz_service()

        # 管理员判定
        role_names = authz.get_account_role_names(account.id)
        is_admin = 'admin' in role_names or 'superadmin' in role_names

        # 项目 ID 列表
        project_ids = authz.get_account_project_ids(account.id)

        # 权限码列表（取所有条目的 code 去重）
        perms_dict = authz.get_account_permissions(account.id)
        permissions = list(perms_dict.keys())

        # 数据作用域
        data_scope = 'global' if is_admin else get_data_scope(account)

        return cls(
            account_id=account.id,
            account_username=getattr(account, 'username', str(account.id)),
            project_ids=project_ids,
            permissions=permissions,
            data_scope=data_scope,
            is_admin=is_admin,
        )

    def to_dict(self) -> dict:
        """序列化为字典（用于日志记录和子进程传参）"""
        return {
            'account_id': self.account_id,
            'account_username': self.account_username,
            'project_ids': self.project_ids,
            'permissions': self.permissions,
            'data_scope': self.data_scope,
            'is_admin': self.is_admin,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'SkillExecutionContext':
        """从字典反序列化（用于子进程接收参数）"""
        return cls(
            account_id=data['account_id'],
            account_username=data.get('account_username', ''),
            project_ids=data.get('project_ids', []),
            permissions=data.get('permissions', []),
            data_scope=data.get('data_scope', 'personal'),
            is_admin=data.get('is_admin', False),
        )

    def has_permission(self, code: str, project_id: Optional[int] = None) -> bool:
        """
        轻量级权限检查（不查数据库，基于已缓存的 permissions 列表）

        用于服务层内部快速判断，不替代 authz.has_permission 的完整校验。
        project_id 校验需依赖 authz 服务，此处仅做 is_admin 快速返回。
        """
        if self.is_admin:
            return True
        # 全局超级权限
        if '*' in self.permissions:
            return True
        # 精确匹配
        if code in self.permissions:
            return True
        # 通配符匹配
        parts = code.split('.')
        for i in range(len(parts), 0, -1):
            wildcard = '.'.join(parts[:i]) + '.*'
            if wildcard in self.permissions:
                return True
        return False

    def can_access_project(self, project_id: int) -> bool:
        """
        检查是否可以访问指定项目

        admin 无限制；其他用户需要在该项目有角色绑定（project_ids 中存在）
        或拥有全局角色（data_scope='global'）。
        """
        if self.is_admin or self.data_scope == 'global':
            return True
        return project_id in self.project_ids

    def __repr__(self) -> str:
        return (
            f'SkillExecutionContext('
            f'account_id={self.account_id}, '
            f'username={self.account_username!r}, '
            f'data_scope={self.data_scope!r}, '
            f'projects={self.project_ids}, '
            f'is_admin={self.is_admin})'
        )
