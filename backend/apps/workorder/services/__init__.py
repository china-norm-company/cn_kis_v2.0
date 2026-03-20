"""
工单管理服务包

分模块：
- generation_service：排程发布后自动生成工单
- dispatch_service：工单智能派送（基于资质+负载）
- evaluator_service：技术评估员专用服务

NOTE: 部分遗留函数位于同级 services.py 文件中（被包 shadow），
通过 importlib 重新导出以兼容旧代码。
"""
import importlib as _importlib
import os as _os
import sys as _sys

# 加载与本包同级的 services.py 文件（被包 shadow 的遗留模块）
_spec = _importlib.util.spec_from_file_location(
    'apps.workorder._services_legacy',
    _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), 'services.py'),
)
if _spec and _spec.loader:
    _legacy = _importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_legacy)
    _sys.modules['apps.workorder._services_legacy'] = _legacy

    # Re-export all public functions from the legacy services.py
    list_work_orders = _legacy.list_work_orders
    get_work_order = _legacy.get_work_order
    get_my_today_work_orders = _legacy.get_my_today_work_orders
    create_work_order = _legacy.create_work_order
    update_work_order = _legacy.update_work_order
    delete_work_order = _legacy.delete_work_order
    assign_work_order = _legacy.assign_work_order
    start_work_order = _legacy.start_work_order
    complete_work_order = _legacy.complete_work_order
    submit_for_review = _legacy.submit_for_review
    approve_work_order = _legacy.approve_work_order
    reject_work_order = _legacy.reject_work_order
    cancel_work_order = _legacy.cancel_work_order
    confirm_sop = _legacy.confirm_sop
    get_work_order_stats = _legacy.get_work_order_stats
    check_calibration_before_start = _legacy.check_calibration_before_start
    _apply_data_scope = _legacy._apply_data_scope
    _change_status = _legacy._change_status
    VALID_TRANSITIONS = _legacy.VALID_TRANSITIONS
else:
    def get_my_today_work_orders(account_id):
        return []
