"""
授权服务 (Authorization Service)

负责权限验证、角色查询、权限缓存。
继承自 cn_kis_test，精简为 CN_KIS_V1.0 所需核心功能。

权限结构进化（v2）：
- get_account_permissions 返回 Dict[str, List[Dict]]，支持同一权限码来自多个项目
- has_permission 增加可选 project_id 参数，支持项目级权限隔离
- get_account_project_ids 返回用户关联的所有项目 ID 列表
"""
import logging
from typing import Any, Dict, List, Optional, Set

from django.core.cache import cache

from .models import Account, AccountRole, Permission, Role, RolePermission

logger = logging.getLogger(__name__)

# 缓存配置
PERMISSION_CACHE_TTL = 300  # 5 分钟
CACHE_PREFIX = "authz:"


class AuthzService:
    """
    授权服务

    职责：
    - 权限验证（精确 + 通配符匹配 + 项目维度）
    - 角色查询
    - 权限缓存（Redis / 内存）
    """

    # ------------------------------------------------------------------
    # 权限查询
    # ------------------------------------------------------------------
    def get_account_roles(self, account_id: int) -> List[Role]:
        """获取账号的所有启用角色"""
        cache_key = f"{CACHE_PREFIX}roles:{account_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        account_roles = AccountRole.objects.filter(
            account_id=account_id,
        ).select_related('role')

        roles = [ar.role for ar in account_roles if ar.role.is_active]
        cache.set(cache_key, roles, PERMISSION_CACHE_TTL)
        return roles

    def get_account_role_names(self, account_id: int) -> Set[str]:
        """获取账号的角色 name 集合"""
        return {r.name for r in self.get_account_roles(account_id)}

    def get_account_permissions(self, account_id: int) -> Dict[str, List[Dict[str, Any]]]:
        """
        获取账号所有权限（多项目结构）

        Returns:
            {
                permission_code: [
                    {'scope': ..., 'description': ..., 'project_id': None},  # 全局角色来源
                    {'scope': ..., 'description': ..., 'project_id': 1},     # 项目1角色来源
                    {'scope': ..., 'description': ..., 'project_id': 2},     # 项目2角色来源
                ],
                ...
            }
            permission_code = "module.function.action"

        设计：同一权限码可来自多个角色（不同项目），用列表保存所有来源，
        避免了旧实现中后面的 project_id 覆盖前面的 bug。
        """
        cache_key = f"{CACHE_PREFIX}permissions:{account_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        permissions: Dict[str, List[Dict[str, Any]]] = {}

        account_roles = AccountRole.objects.filter(
            account_id=account_id,
        ).select_related('role')

        for ar in account_roles:
            role_perms = RolePermission.objects.filter(
                role=ar.role,
            ).select_related('permission')

            for rp in role_perms:
                perm = rp.permission
                code = str(perm)  # module.function.action
                entry = {
                    'scope': perm.scope,
                    'description': perm.description,
                    'project_id': ar.project_id,
                }
                if code not in permissions:
                    permissions[code] = []
                # 避免重复追加相同的 (permission, project_id) 组合
                if entry not in permissions[code]:
                    permissions[code].append(entry)

        cache.set(cache_key, permissions, PERMISSION_CACHE_TTL)
        return permissions

    def get_account_permission_codes(self, account_id: int) -> Set[str]:
        """获取账号所有权限代码集合"""
        return set(self.get_account_permissions(account_id).keys())

    def get_account_project_ids(self, account_id: int) -> List[int]:
        """
        获取账号关联的所有项目 ID（来自项目级 AccountRole）

        Returns:
            去重后的项目 ID 列表，不包含 None（全局角色）
        """
        cache_key = f"{CACHE_PREFIX}project_ids:{account_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        project_ids = list(
            AccountRole.objects.filter(
                account_id=account_id,
                project_id__isnull=False,
            ).values_list('project_id', flat=True).distinct()
        )
        cache.set(cache_key, project_ids, PERMISSION_CACHE_TTL)
        return project_ids

    # ------------------------------------------------------------------
    # 权限检查
    # ------------------------------------------------------------------
    def has_permission(
        self,
        account: Account,
        permission_code: str,
        project_id: Optional[int] = None,
    ) -> bool:
        """
        检查用户是否拥有指定权限

        支持通配符匹配：
        - 精确匹配: "crm.customer.create"
        - 通配符: "crm.customer.*" 匹配 "crm.customer.create"
        - 模块级: "crm.*" 匹配 "crm.customer.create"

        project_id 参数（可选，向后兼容）：
        - project_id=None: 不区分项目，任意来源有该权限即返回 True
        - project_id=N: 只有全局角色（project_id=None）或该项目的角色才算有权限

        GCP 合规意义：
        - 临床研究中，CRC 只应看到其参与项目的数据
        - 传入 project_id=N 可确保"项目A的CRC无法访问项目B的数据"
        """
        # admin/superadmin 作为系统管理角色，始终视为拥有全权限。
        # 目的：避免历史数据中角色-权限种子未同步导致"已授予管理员角色但仍 403"。
        role_names = self.get_account_role_names(account.id)
        if 'superadmin' in role_names or 'admin' in role_names:
            return True

        perms = self.get_account_permissions(account.id)

        # 构建待检查的权限码列表（精确 + 通配符 + 全局超级权限）
        codes_to_check = [permission_code]
        parts = permission_code.split('.')
        for i in range(len(parts), 0, -1):
            wildcard = '.'.join(parts[:i]) + '.*'
            codes_to_check.append(wildcard)
        codes_to_check.append('*')

        for code in codes_to_check:
            if code not in perms:
                continue
            entries = perms[code]
            if project_id is None:
                # 不指定项目：任意来源有该权限即可
                return True
            # 指定项目：全局角色（project_id=None）或匹配项目均可
            for entry in entries:
                if entry['project_id'] is None or entry['project_id'] == project_id:
                    return True

        return False

    def has_any_permission(
        self,
        account: Account,
        permission_codes: List[str],
        project_id: Optional[int] = None,
    ) -> bool:
        """任一权限（支持项目维度）"""
        return any(self.has_permission(account, c, project_id=project_id) for c in permission_codes)

    def has_all_permissions(
        self,
        account: Account,
        permission_codes: List[str],
        project_id: Optional[int] = None,
    ) -> bool:
        """全部权限（支持项目维度）"""
        return all(self.has_permission(account, c, project_id=project_id) for c in permission_codes)

    def has_role(self, account_id: int, role_name: str) -> bool:
        """检查是否拥有指定角色"""
        return role_name in self.get_account_role_names(account_id)

    def has_any_role(self, account_id: int, role_names: List[str]) -> bool:
        """检查是否拥有任一角色"""
        current = self.get_account_role_names(account_id)
        return bool(current & set(role_names))

    # ------------------------------------------------------------------
    # 缓存管理
    # ------------------------------------------------------------------
    def clear_cache(self, account_id: int) -> None:
        """清除指定账号的权限缓存"""
        cache.delete(f"{CACHE_PREFIX}roles:{account_id}")
        cache.delete(f"{CACHE_PREFIX}permissions:{account_id}")
        cache.delete(f"{CACHE_PREFIX}project_ids:{account_id}")

    # ------------------------------------------------------------------
    # 角色管理
    # ------------------------------------------------------------------
    def assign_role(
        self,
        account_id: int,
        role_name: str,
        project_id: Optional[int] = None,
    ) -> bool:
        """
        为账号分配角色（幂等）

        - project_id=None: 全局角色，account+role 唯一
        - project_id=N: 项目级角色，account+role+project_id 唯一
        """
        role = Role.objects.filter(name=role_name, is_active=True).first()
        if not role:
            logger.warning(f'角色不存在或已禁用: {role_name}')
            return False

        lookup = {'account_id': account_id, 'role': role, 'project_id': project_id}
        _, created = AccountRole.objects.get_or_create(**lookup)
        if created:
            self.clear_cache(account_id)
        return created

    def remove_role(
        self,
        account_id: int,
        role_name: str,
        project_id: Optional[int] = None,
    ) -> bool:
        """
        移除账号角色

        - project_id=None: 移除全局角色
        - project_id=N: 仅移除指定项目的角色
        - 若需移除所有项目的某角色，使用 remove_role_all_projects
        """
        qs = AccountRole.objects.filter(
            account_id=account_id,
            role__name=role_name,
            project_id=project_id,
        )
        deleted, _ = qs.delete()
        if deleted:
            self.clear_cache(account_id)
        return deleted > 0

    def remove_role_all_projects(self, account_id: int, role_name: str) -> int:
        """移除账号在所有项目中的某角色"""
        deleted, _ = AccountRole.objects.filter(
            account_id=account_id,
            role__name=role_name,
        ).delete()
        if deleted:
            self.clear_cache(account_id)
        return deleted


# 全局单例
_authz_service: Optional[AuthzService] = None


def get_authz_service() -> AuthzService:
    """获取授权服务单例"""
    global _authz_service
    if _authz_service is None:
        _authz_service = AuthzService()
    return _authz_service
