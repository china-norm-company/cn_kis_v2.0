"""
访视管理服务包

分模块：
- generation_service：从协议自动生成访视计划
- protocol_to_activities_service：协议检测项提取与模板匹配
"""
import importlib.util as _ilu
import os as _os

# 从 services.py 文件加载核心 CRUD 函数（因与 services/ 目录同名冲突）
_svc_path = _os.path.join(_os.path.dirname(__file__), '..', 'services.py')
_svc_spec = _ilu.spec_from_file_location('apps.visit._svc', _os.path.abspath(_svc_path))
_svc_mod = _ilu.module_from_spec(_svc_spec)
_svc_spec.loader.exec_module(_svc_mod)

list_visit_plans = _svc_mod.list_visit_plans
get_visit_plan = _svc_mod.get_visit_plan
get_plan_with_nodes = _svc_mod.get_plan_with_nodes
create_visit_plan = _svc_mod.create_visit_plan
update_visit_plan = _svc_mod.update_visit_plan
delete_visit_plan = _svc_mod.delete_visit_plan
activate_visit_plan = _svc_mod.activate_visit_plan
list_visit_nodes = _svc_mod.list_visit_nodes
create_visit_node = _svc_mod.create_visit_node
batch_create_nodes = _svc_mod.batch_create_nodes
update_visit_node = _svc_mod.update_visit_node
list_activities = _svc_mod.list_activities
create_activity = _svc_mod.create_activity
