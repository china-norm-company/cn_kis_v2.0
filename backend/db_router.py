"""
读写分离路由

默认策略：
- 写操作始终走 default
- 读操作在配置了 replica 时走 replica（按 app 白名单）
- 未配置 replica 时自动回退 default
"""

from django.conf import settings


REPLICA_APPS = {
    'knowledge',
    'report',
    'finance',
    'quality',
}


class ReadWriteRouter:
    """数据库读写路由。"""

    def db_for_read(self, model, **hints):
        if 'replica' not in settings.DATABASES:
            return 'default'
        if model._meta.app_label in REPLICA_APPS:
            return 'replica'
        return 'default'

    def db_for_write(self, model, **hints):
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # 所有迁移仅在 default 执行，避免只读副本结构漂移
        return db == 'default'
