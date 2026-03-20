"""
Secretary services package.

注意：历史代码中同时存在：
- apps/secretary/services.py
- apps/secretary/services/ (本包)

为兼容 `from apps.secretary.services import ...` 的既有调用，
这里显式桥接到同级 `services.py` 并导出其符号。
"""
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path


_impl_path = Path(__file__).resolve().parents[1] / 'services.py'
_spec = spec_from_file_location('apps.secretary._services_impl', _impl_path)
if _spec and _spec.loader:
    _module = module_from_spec(_spec)
    _spec.loader.exec_module(_module)  # type: ignore[attr-defined]
    for _name in dir(_module):
        if _name.startswith('__'):
            continue
        globals()[_name] = getattr(_module, _name)
