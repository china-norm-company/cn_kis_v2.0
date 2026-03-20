"""
HR 服务聚合入口。

说明：
- 历史上 `apps/hr/services.py`（单文件）与 `apps/hr/services/`（目录）并存。
- API 层使用 `from . import services` 时会优先加载目录包。
- 这里显式桥接单文件服务函数，保持兼容并避免命名冲突。
"""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


_legacy_services_path = Path(__file__).resolve().parent.parent / 'services.py'
_spec = spec_from_file_location('apps.hr._legacy_services', _legacy_services_path)
_legacy = module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_legacy)

# re-export legacy service functions used by api.py
for _name in dir(_legacy):
    if _name.startswith('_'):
        continue
    globals()[_name] = getattr(_legacy, _name)

# settlement sub-module
from .settlement_service import (  # noqa: E402,F401
    create_rule, list_rules, update_rule, get_active_rule,
    import_contributions, list_contributions,
    create_settlement, get_settlement, list_settlements,
    calculate_settlement, transition_settlement,
    update_settlement_line, list_settlement_lines,
    list_audit_logs,
    collect_contributions_from_workorders,
)

