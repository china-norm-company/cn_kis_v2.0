"""
身份与权限管理模型

迁移自 cn_kis_test/identity，精简为核心字段。
支持多端认证：飞书OAuth、微信OAuth
"""
from django.db import models


class AccountType(models.TextChoices):
    INTERNAL = 'internal', '内部员工'
    SUBJECT = 'subject', '受试者'
    EXTERNAL = 'external', '外部客户'
    SYSTEM = 'system', '系统账号'


class AccountStatus(models.TextChoices):
    ACTIVE = 'active', '激活'
    INACTIVE = 'inactive', '未激活'
    LOCKED = 'locked', '锁定'
    DISABLED = 'disabled', '停用'


class Account(models.Model):
    """统一账号模型（替代 User/AdminUser 双轨）"""

    class Meta:
        db_table = 't_account'
        verbose_name = '账号'

    # 基本信息
    username = models.CharField('用户名', max_length=100, unique=True)
    display_name = models.CharField('显示名称', max_length=100, default='')
    email = models.EmailField('邮箱', blank=True, default='')
    phone = models.CharField('手机号', max_length=20, blank=True, default='')
    avatar = models.URLField('头像URL', blank=True, default='')

    # 账号属性
    account_type = models.CharField('账号类型', max_length=20, choices=AccountType.choices, default=AccountType.INTERNAL)
    status = models.CharField('状态', max_length=20, choices=AccountStatus.choices, default=AccountStatus.ACTIVE)

    # 安全
    password_hash = models.CharField('密码哈希', max_length=255, blank=True, default='')
    mfa_enabled = models.BooleanField('多因素认证', default=False)
    mfa_secret = models.CharField('MFA密钥', max_length=100, blank=True, default='')

    # SSO 绑定
    feishu_user_id = models.CharField('飞书用户ID', max_length=100, blank=True, default='', db_index=True)
    feishu_open_id = models.CharField('飞书OpenID', max_length=100, blank=True, default='')
    wechat_openid = models.CharField('微信OpenID', max_length=100, blank=True, default='', db_index=True)
    wechat_unionid = models.CharField('微信UnionID', max_length=100, blank=True, default='')

    # 外部系统关联
    ekuaibao_staff_id = models.CharField(
        '易快报员工ID', max_length=200, blank=True, default='', db_index=True,
        help_text='易快报 staffs.id，格式如 nYA6xdjChA7c00:2102431421852322',
    )
    ekuaibao_username = models.CharField(
        '易快报用户名', max_length=100, blank=True, default='',
        help_text='易快报 staffs.code，如 zhuyan',
    )

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    last_login_time = models.DateTimeField('最后登录', null=True, blank=True)

    # 软删除
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.display_name}({self.username})'


class RoleCategory(models.TextChoices):
    MANAGEMENT = 'management', '管理层'
    OPERATION = 'operation', '运营执行'
    TECHNICAL = 'technical', '技术研发'
    SUPPORT = 'support', '职能支持'
    EXTERNAL = 'external', '外部用户'


class Role(models.Model):
    """
    角色模型

    name: 机器可读标识（如 project_manager），同时作为 code 使用
    display_name: 中文显示名
    level: 权限级别 L1-L10（数字越大权限越高）
    category: 角色分类
    """

    class Meta:
        db_table = 't_role'
        verbose_name = '角色'

    name = models.CharField('角色标识', max_length=50, unique=True, db_index=True)
    display_name = models.CharField('显示名称', max_length=100)
    description = models.TextField('描述', blank=True, default='')
    level = models.IntegerField('权限级别(L1-L10)', default=5, help_text='数字越大权限越高')
    category = models.CharField(
        '角色分类', max_length=20,
        choices=RoleCategory.choices, default=RoleCategory.OPERATION,
    )
    is_system = models.BooleanField('系统预置', default=False)
    is_active = models.BooleanField('是否启用', default=True)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')

    create_time = models.DateTimeField(auto_now_add=True)
    update_time = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.display_name


class Permission(models.Model):
    """权限模型（5层：模块/功能/操作/作用域/字段）"""

    class Meta:
        db_table = 't_permission'
        verbose_name = '权限'
        unique_together = ['module', 'function', 'action']

    module = models.CharField('模块', max_length=50)
    function = models.CharField('功能', max_length=50)
    action = models.CharField('操作', max_length=50)
    scope = models.CharField('作用域', max_length=50, blank=True, default='*')
    description = models.CharField('描述', max_length=200, blank=True, default='')

    create_time = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.module}.{self.function}.{self.action}'


class AccountRole(models.Model):
    """
    账号-角色关联

    支持两种模式：
    - 全局角色：project_id=NULL，每个 account+role 唯一
    - 项目级角色：project_id=具体项目ID，同一用户可在多个项目中有同一角色
    """

    class Meta:
        db_table = 't_account_role'
        constraints = [
            models.UniqueConstraint(
                fields=['account', 'role'],
                condition=models.Q(project_id__isnull=True),
                name='unique_account_role_global',
            ),
            models.UniqueConstraint(
                fields=['account', 'role', 'project_id'],
                condition=models.Q(project_id__isnull=False),
                name='unique_account_role_project',
            ),
        ]

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='account_roles')
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_accounts')
    project_id = models.IntegerField('项目ID（项目级角色）', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField(auto_now_add=True)


class RolePermission(models.Model):
    """角色-权限关联"""

    class Meta:
        db_table = 't_role_permission'
        unique_together = ['role', 'permission']

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name='permission_roles')
    create_time = models.DateTimeField(auto_now_add=True)


class SessionToken(models.Model):
    """会话令牌（支持多设备）"""

    class Meta:
        db_table = 't_session_token'
        verbose_name = '会话令牌'

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='sessions')
    token_hash = models.CharField('Token哈希', max_length=255, unique=True)
    device_info = models.CharField('设备信息', max_length=200, blank=True, default='')
    ip_address = models.GenericIPAddressField('IP地址', null=True, blank=True)
    expires_at = models.DateTimeField('过期时间')
    is_revoked = models.BooleanField('已撤销', default=False)
    create_time = models.DateTimeField(auto_now_add=True)



# SmsVerifyCode 已移除 —— 验证码生命周期由火山引擎 SDK 原生管理
# （send_sms_verify_code / check_sms_verify_code），不再需要本地存储。
# 迁移 0005 将删除 t_sms_verify_code 表。


# ============================================================================
# 用户工作台配置（渐进上线支持）
# ============================================================================

class WorkstationMode(models.TextChoices):
    BLANK = 'blank', '空白'
    PILOT = 'pilot', '试点'
    FULL = 'full', '完整'


class AccountWorkstationConfig(models.Model):
    """
    用户工作台配置

    支持渐进上线场景：管理员可以针对某个用户的某个工作台设置模式，
    前端根据模式控制导航菜单的显示范围。

    模式说明：
    - blank:  完全隐藏该工作台的所有菜单，只显示占位页
    - pilot:  只显示 enabled_menus 指定的菜单（与权限计算结果取交集）
    - full:   显示全部有权限的菜单（默认行为，无此记录等价于 full）

    设计原则：
    - mode=full 时该记录无意义，写入时自动删除以减少冗余数据
    - unique_together 确保同一用户同一工作台只有一条配置记录
    """

    class Meta:
        db_table = 't_account_workstation_config'
        verbose_name = '用户工作台配置'
        unique_together = ['account', 'workstation']
        indexes = [
            models.Index(fields=['account', 'workstation'], name='idx_acct_ws_config'),
        ]

    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name='workstation_configs',
        verbose_name='账号',
    )
    workstation = models.CharField('工作台标识', max_length=50, db_index=True)
    mode = models.CharField(
        '模式',
        max_length=20,
        choices=WorkstationMode.choices,
        default=WorkstationMode.FULL,
    )
    enabled_menus = models.JSONField(
        '已启用菜单',
        default=list,
        blank=True,
        help_text='mode=pilot 时有效，存储允许显示的菜单标识列表',
    )
    note = models.TextField('备注', blank=True, default='')
    create_time = models.DateTimeField(auto_now_add=True)
    update_time = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.account.username}@{self.workstation}={self.mode}'


# 上线治理缺口/目标：独立模块文件，须在此导入以便 Django 应用注册表收录
from .models_launch_governance import LaunchGovernanceGap, LaunchGovernanceGoal  # noqa: F401
