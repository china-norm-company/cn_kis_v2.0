import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class WorkorderConfig(AppConfig):
    name = 'apps.workorder'
    verbose_name = '工单管理'

    def ready(self):
        import apps.workorder.signals  # noqa: F401 — 注册信号处理器
        self._preload_ocr()

    @staticmethod
    def _preload_ocr():
        """后台预加载 EasyOCR，避免首次识别请求超时"""
        def _load():
            try:
                from apps.workorder.ocr_schedule import _get_reader
                r = _get_reader()
                if r:
                    logger.info('EasyOCR 预加载完成')
            except Exception as e:
                logger.warning('EasyOCR 预加载失败: %s', e)

        import threading
        t = threading.Thread(target=_load, daemon=True)
        t.start()
