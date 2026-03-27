"""
SMTP 邮件后端：在 Django 4.2 原生 ``EmailBackend`` 基础上增加
``EMAIL_SMTP_INSECURE_SKIP_VERIFY``（仅开发排查证书问题时使用）。

Django 4.2 的 ``django.core.mail.backends.smtp.EmailBackend`` 使用内置
``ssl_context`` 属性，不会读取 ``settings.EMAIL_SSL_CONTEXT``，故需子类化。
"""
from __future__ import annotations

import ssl

from django.conf import settings
from django.core.mail.backends.smtp import EmailBackend as DjangoSMTPBackend
from django.utils.functional import cached_property


class EmailBackend(DjangoSMTPBackend):
    @cached_property
    def ssl_context(self):
        if getattr(settings, 'EMAIL_SMTP_INSECURE_SKIP_VERIFY', False):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            return ctx
        if self.ssl_certfile or self.ssl_keyfile:
            ssl_context = ssl.SSLContext(protocol=ssl.PROTOCOL_TLS_CLIENT)
            ssl_context.load_cert_chain(self.ssl_certfile, self.ssl_keyfile)
            return ssl_context
        return ssl.create_default_context()
