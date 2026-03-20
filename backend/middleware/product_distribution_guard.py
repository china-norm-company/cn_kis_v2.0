"""
样品发放（product）接口：使用 cn_kis default 库，无需单独配置数据库。
保留中间件以兼容原有挂载，不再做 503 守卫。
"""
from django.http import HttpResponse


class ProductDistributionGuardMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)
