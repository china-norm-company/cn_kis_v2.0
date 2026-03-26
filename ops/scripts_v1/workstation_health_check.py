#!/usr/bin/env python3
"""转发到仓库根目录的 V2 健康检查脚本，避免维护两套逻辑。"""
import os
import subprocess
import sys

_OPS = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_OPS, '..', '..'))
_TARGET = os.path.join(_ROOT, 'scripts', 'workstation_health_check.py')
if not os.path.isfile(_TARGET):
    print(f"FAIL: 未找到 {_TARGET}", file=sys.stderr)
    sys.exit(2)
raise SystemExit(subprocess.call([sys.executable, _TARGET] + sys.argv[1:]))
