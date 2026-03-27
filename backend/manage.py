#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
import warnings

# macOS 系统 Python + urllib3 v2：LibreSSL 提示（不影响功能；StatReloader 子进程会再次执行本文件，过滤仍生效）
warnings.filterwarnings('ignore', module='urllib3')

# 确保 backend 目录在 path 中（便携版 Python 等场景）
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
