"""
CN KIS V2.0 URL 路由配置

三层 API 架构：
- /api/v1/          业务 API（飞书工作台 + 微信小程序调用）
- /api/v1/agents/   智能体 API（火山引擎 ARK + Kimi 双通道）
- /api/v1/sync/     飞书同步 API（AnyCross / Webhook）

路由仅注册一次，避免 Django 重复加载 urlconf（如 500 错误处理时）导致
Router "already been attached" 的 ConfigError。
"""
from ninja.security import HttpBearer
from ninja.errors import ConfigError

from _api_holder import get_api, is_registration_done, set_registration_done


def _safe_add_router(api, prefix, router, **kwargs):
    """挂载路由，若已附加/已挂载则忽略（应对 urlconf 重复加载或 Ninja 文案差异）"""
    try:
        api.add_router(prefix, router, **kwargs)
    except ConfigError as e:
        msg = str(e)
        if 'already been attached' not in msg and 'already mounted' not in msg:
            raise

# JWT 认证
class JWTAuth(HttpBearer):
    def authenticate(self, request, token):
        from apps.identity.services import verify_jwt_token
        payload = verify_jwt_token(token)
        if payload:
            request.user_id = payload.get('user_id')
            request.account_type = payload.get('account_type')
            return payload
        return None

# 主 API（单例，来自 _api_holder，避免重复加载时重复注册路由）
api = get_api()

# ============================================================================
# Business 层 - 核心业务 API（仅首次加载时注册）
# ============================================================================
if not is_registration_done():
    from apps.identity.api import router as identity_router
    from apps.identity.api_menu_config import router as menu_config_router
    from apps.audit.api import router as audit_router
    from apps.subject.api import router as subject_router
    from apps.protocol.api import router as protocol_router
    from apps.visit.api import router as visit_router
    from apps.edc.api import router as edc_router
    from apps.workorder.api import router as workorder_router
    from apps.workorder.api_evaluator import router as evaluator_router
    from apps.signature.api import router as signature_router

    _safe_add_router(api, '/auth/', identity_router, tags=['认证授权'])
    _safe_add_router(api, '/menu-config/', menu_config_router, tags=['研究台菜单'])
    _safe_add_router(api, '/audit/', audit_router, tags=['审计日志'])
    _safe_add_router(api, '/subject/', subject_router, tags=['受试者管理'])
    from apps.subject.api_recruitment import router as recruitment_router
    from apps.subject.api_execution import router as execution_router
    from apps.subject.api_my import router as my_router
    from apps.subject.api_questionnaire import router as questionnaire_router
    from apps.subject.api_loyalty import router as loyalty_router
    from apps.subject.api_prescreening import router as prescreening_router
    from apps.subject.api_reception import router as reception_router
    _safe_add_router(api, '/recruitment/', recruitment_router, tags=['招募管理'])
    _safe_add_router(api, '/pre-screening/', prescreening_router, tags=['初筛管理'])
    _safe_add_router(api, '/reception/', reception_router, tags=['前台接待'])
    _safe_add_router(api, '/execution/', execution_router, tags=['执行管理'])
    _safe_add_router(api, '/my/', my_router, tags=['受试者自助'])
    _safe_add_router(api, '/questionnaire/', questionnaire_router, tags=['问卷管理'])
    _safe_add_router(api, '/loyalty/', loyalty_router, tags=['忠诚度管理'])
    _safe_add_router(api, '/protocol/', protocol_router, tags=['协议管理'])
    _safe_add_router(api, '/visit/', visit_router, tags=['访视管理'])
    _safe_add_router(api, '/edc/', edc_router, tags=['EDC数据采集'])
    _safe_add_router(api, '/workorder/', workorder_router, tags=['工单管理'])
    _safe_add_router(api, '/evaluator/', evaluator_router, tags=['技术评估'])
    _safe_add_router(api, '/signature/', signature_router, tags=['电子签名'])

    # Agent 层 - 火山云智能体网关
    from apps.agent_gateway.api import router as agent_router
    _safe_add_router(api, '/agents/', agent_router, tags=['智能体'])
    from apps.iot_data.api import router as iot_router
    _safe_add_router(api, '/iot/', iot_router, tags=['IoT数据接入'])

    # Sync 层 - 飞书数据同步
    from apps.feishu_sync.api import router as sync_router
    _safe_add_router(api, '/sync/', sync_router, tags=['飞书同步'])

    # 扩展业务层 - Phase 2/3 工作台后端
    from apps.quality.api import router as quality_router
    from apps.quality.api_audit import router as quality_audit_router
    from apps.quality.api_change import router as quality_change_router
    from apps.finance.api import router as finance_router
    from apps.hr.api import router as hr_router
    from apps.crm.api import router as crm_router
    from apps.resource.api import router as resource_router
    from apps.proposal.api import router as proposal_router

    _safe_add_router(api, '/quality/', quality_router, tags=['质量合规'])
    _safe_add_router(api, '/quality/', quality_audit_router, tags=['审计管理'])
    _safe_add_router(api, '/quality/', quality_change_router, tags=['变更控制'])
    _safe_add_router(api, '/finance/', finance_router, tags=['财务管理'])
    _safe_add_router(api, '/hr/', hr_router, tags=['人事能力'])
    _safe_add_router(api, '/crm/', crm_router, tags=['客户服务'])
    _safe_add_router(api, '/resource/', resource_router, tags=['资源管理'])
    _safe_add_router(api, '/proposal/', proposal_router, tags=['方案准备'])

    from apps.resource.api_equipment import router as equipment_router
    _safe_add_router(api, '/equipment/', equipment_router, tags=['设备管理'])

    from apps.resource.api_facility import router as facility_router
    _safe_add_router(api, '/facility/', facility_router, tags=['设施环境管理'])

    from apps.scheduling.api import router as scheduling_router
    from apps.safety.api import router as safety_router
    from apps.document.api import router as document_router
    from apps.ethics.api import router as ethics_router
    from apps.ethics.api_review import router as ethics_review_router
    from apps.ethics.api_dashboard import router as ethics_dashboard_router
    from apps.ethics.api_supervision import router as ethics_supervision_router
    from apps.ethics.api_regulation import router as ethics_regulation_router
    from apps.ethics.api_compliance import router as ethics_compliance_router
    from apps.ethics.api_correspondence import router as ethics_correspondence_router
    from apps.ethics.api_training import router as ethics_training_router

    _safe_add_router(api, '/scheduling/', scheduling_router, tags=['排程管理'])
    _safe_add_router(api, '/safety/', safety_router, tags=['安全管理'])
    _safe_add_router(api, '/document/', document_router, tags=['文档管理'])
    _safe_add_router(api, '/ethics/', ethics_router, tags=['伦理管理'])
    _safe_add_router(api, '/ethics/', ethics_review_router, tags=['伦理审查意见'])
    _safe_add_router(api, '/ethics/', ethics_dashboard_router, tags=['伦理仪表盘'])
    _safe_add_router(api, '/ethics/', ethics_supervision_router, tags=['伦理监督'])
    _safe_add_router(api, '/ethics/', ethics_regulation_router, tags=['法规跟踪'])
    _safe_add_router(api, '/ethics/', ethics_compliance_router, tags=['合规检查'])
    _safe_add_router(api, '/ethics/', ethics_correspondence_router, tags=['监管沟通'])
    _safe_add_router(api, '/ethics/', ethics_training_router, tags=['合规培训'])

    from apps.sample.api import router as sample_router
    from apps.sample.api_material import router as material_router
    from apps.sample.api_export import router as material_export_router
    from apps.sample.api_feishu_integration import router as feishu_integration_router
    from apps.sample.api_consumable_management import router as consumable_management_router
    from apps.sample.api_sample_management import router as sample_management_router
    from apps.sample.api_product_management import router as product_management_router
    from apps.report.api import router as report_router
    from apps.notification.api import router as notification_router
    from apps.workflow.api import router as workflow_router

    _safe_add_router(api, '/sample/', sample_router, tags=['样品管理'])
    _safe_add_router(api, '/material/', material_router, tags=['物料管理'])
    _safe_add_router(api, '/material/', material_export_router, tags=['物料-导出/审计/签名'])
    _safe_add_router(api, '/material/', feishu_integration_router, tags=['物料-飞书集成'])
    _safe_add_router(api, '/material/', consumable_management_router, tags=['耗材管理'])
    _safe_add_router(api, '/sample-management/', sample_management_router, tags=['样品管理-接收存储分发'])
    _safe_add_router(api, '/product-management/', product_management_router, tags=['产品管理-批次入库套件分发'])
    _safe_add_router(api, '/report/', report_router, tags=['报告管理'])
    _safe_add_router(api, '/notification/', notification_router, tags=['通知管理'])
    _safe_add_router(api, '/workflow/', workflow_router, tags=['审批流程'])

    from apps.qrcode.api import router as qrcode_router
    _safe_add_router(api, '/qrcode/', qrcode_router, tags=['二维码管理'])

    from apps.lims_integration.api import router as lims_router
    _safe_add_router(api, '/lims/', lims_router, tags=['LIMS集成'])

    from apps.ekuaibao_integration.api import router as ekb_router
    _safe_add_router(api, '/ekuaibao/', ekb_router, tags=['易快报集成'])

    from apps.ekuaibao_integration.api_views import router as ekb_views_router
    _safe_add_router(api, '/ekuaibao/', ekb_views_router, tags=['易快报业务视图'])

    from apps.lab_personnel.api import router as lab_personnel_router
    _safe_add_router(api, '/lab-personnel/', lab_personnel_router, tags=['实验室人员管理'])

    from apps.feasibility.api import router as feasibility_router
    from apps.closeout.api import router as closeout_router
    from apps.knowledge.api import router as knowledge_router
    from apps.project_full_link.api import router as project_full_link_router
    from apps.weekly_report.api import router as weekly_report_router
    from apps.weekly_report.api import internal_router as weekly_report_internal_router

    _safe_add_router(api, '/feasibility/', feasibility_router, tags=['可行性评估'])
    _safe_add_router(api, '/projects/', project_full_link_router, tags=['项目全链路'])
    _safe_add_router(api, '/weekly-report-management/', weekly_report_router)
    _safe_add_router(api, '/internal/scheduler/', weekly_report_internal_router)
    _safe_add_router(api, '/closeout/', closeout_router, tags=['结项管理'])
    _safe_add_router(api, '/knowledge/', knowledge_router, tags=['知识库'])

    from apps.secretary.api import router as secretary_router, mail_router as secretary_mail_router
    _safe_add_router(api, '/dashboard/', secretary_router, tags=['秘书工作台'])
    _safe_add_router(api, '/', secretary_mail_router, tags=['邮件信号'])
    from apps.secretary.digital_workforce_api import router as digital_workforce_router
    _safe_add_router(api, '/digital-workforce/', digital_workforce_router, tags=['中书·数字员工中心'])
    _safe_add_router(api, '/', secretary_mail_router, tags=['邮件信号'])

    from apps.claw.api import router as claw_router
    _safe_add_router(api, '/claw/', claw_router, tags=['Claw数据总线'])

    set_registration_done()

# 样品发放（产品发放）- 读写 cn_kis default 库
from apps.product_distribution.api import router as product_distribution_router
_safe_add_router(api, '/product/', product_distribution_router, tags=['样品发放'])

# ============================================================================
# 统一管理平台控制台
# ============================================================================
from apps.control_plane.api import router as control_plane_router
_safe_add_router(api, '/control-plane/', control_plane_router, tags=['统一管理平台'])

# ============================================================================
# 前端错误日志上报（无需认证）
# ============================================================================
from ninja import Schema as _Schema
from typing import Optional as _Optional

class FrontendErrorIn(_Schema):
    workstation: str = 'unknown'
    error_type: str = 'unknown'
    message: str = ''
    stack: _Optional[str] = None

@api.post('/log/frontend-error', auth=None, tags=['系统'])
def log_frontend_error(request, data: FrontendErrorIn):
    """前端错误日志上报端点（无需认证，供 sendBeacon 使用）"""
    import logging
    logger = logging.getLogger('cn_kis.frontend')
    logger.error(f"[FRONTEND] {data.workstation} | {data.error_type} | {data.message}")
    return {'code': 0, 'msg': 'ok'}


# ============================================================================
# 健康检查（无需认证）
# ============================================================================
@api.get('/health', auth=None, tags=['系统'])
def health_check(request, check: _Optional[str] = None):
    """
    健康检查端点

    用于 Nginx / Docker / 飞书可信域名验证。
    可选 ?check=full 进行深度检查（含 Redis、工作台前端文件）。
    """
    import django
    from django.db import connection

    db_ok = False
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        db_ok = True
    except Exception:
        pass

    result = {
        'status': 'healthy',
        'version': '1.0.0',
        'django': django.get_version(),
        'database': 'ok' if db_ok else 'error',
    }

    if check == 'full':
        # Redis check
        redis_ok = False
        try:
            from django.core.cache import cache
            cache.set('_health_check', '1', 5)
            redis_ok = cache.get('_health_check') == '1'
        except Exception:
            pass
        result['redis'] = 'ok' if redis_ok else 'error'

        # Workstation frontend files check
        import os
        ws_status = {}
        ws_keys = [
            'secretary', 'finance', 'research', 'execution', 'quality',
            'hr', 'crm', 'recruitment', 'equipment', 'material',
            'facility', 'evaluator', 'lab-personnel', 'ethics',
        ]
        for key in ws_keys:
            path = f'/var/www/cn-kis/{key}/index.html'
            ws_status[key] = 'ok' if os.path.exists(path) else 'missing'
        result['workstations'] = ws_status

    return {
        'code': 0,
        'msg': 'ok',
        'data': result,
    }


# ============================================================================
# Django URL 配置
# ============================================================================
from django.urls import path
from apps.agent_gateway.views_sse import chat_stream

urlpatterns = [
    path('api/v1/', api.urls),
    path('api/v1/agents/chat/stream', chat_stream),
]
