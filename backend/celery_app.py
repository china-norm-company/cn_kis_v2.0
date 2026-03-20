"""
CN KIS V2.0 Celery 应用配置

V2 改进：
- CELERY_PRODUCTION_TASKS_DISABLED=true 时，生产采集类任务不注册（保护测试环境）
- 异步任务按域划分（Wave 2-5 逐步启用）
"""
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')

app = Celery('cn_kis_v2')

app.config_from_object('config.celery_config')

app.autodiscover_tasks([
    'apps.workorder',
    'apps.lab_personnel',
    'apps.agent_gateway',
    'apps.finance',
    'apps.knowledge',
    'apps.secretary',
    'apps.notification',
    'apps.hr',
    'apps.quality',
    'apps.subject',
])
