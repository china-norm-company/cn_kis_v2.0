"""
启动包一键生成服务 (B3)

从协议一键生成项目启动所需的全套材料骨架。
"""
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


def generate_startup_package(protocol_id: int) -> Dict[str, Any]:
    """
    一键生成项目启动包。

    生成项目：
    1. 访视计划
    2. 资源需求计划
    3. eTMF 文档目录
    4. CRF 模板骨架
    5. 伦理申请草稿
    6. 项目预算草稿
    7. 排程里程碑计划
    8. 飞书项目群

    返回: {items: [{name, status, id, message}], summary: {total, created, skipped, failed}}
    """
    from apps.protocol.models import Protocol

    try:
        protocol = Protocol.objects.get(id=protocol_id, is_deleted=False)
    except Protocol.DoesNotExist:
        return {'items': [], 'summary': {'total': 0, 'created': 0, 'skipped': 0, 'failed': 0},
                'message': '协议不存在'}

    items = []

    # 1. Visit Plan
    items.append(_generate_visit_plan(protocol))

    # 2. Resource Demand
    items.append(_generate_resource_demand(protocol))

    # 3. eTMF Document Directory
    items.append(_generate_etmf_directory(protocol))

    # 4. CRF Template Skeleton
    items.append(_generate_crf_template(protocol))

    # 5. Ethics Application Draft
    items.append(_generate_ethics_draft(protocol))

    # 6. Budget Draft
    items.append(_generate_budget_draft(protocol))

    # 7. Schedule Milestones
    items.append(_generate_milestones(protocol))

    # 8. Feishu Project Chat
    items.append(_generate_feishu_chat(protocol))

    created = sum(1 for i in items if i['status'] == 'created')
    skipped = sum(1 for i in items if i['status'] == 'skipped')
    failed = sum(1 for i in items if i['status'] == 'failed')

    return {
        'items': items,
        'summary': {
            'total': len(items),
            'created': created,
            'skipped': skipped,
            'failed': failed,
        },
    }


def _generate_visit_plan(protocol) -> Dict:
    """生成访视计划"""
    from apps.visit.models import VisitPlan
    try:
        existing = VisitPlan.objects.filter(protocol=protocol).exists()
        if existing:
            return {'name': '访视计划', 'status': 'skipped', 'id': None, 'message': '已存在，跳过'}

        from apps.visit.services.generation_service import VisitGenerationService
        result = VisitGenerationService.generate_from_protocol(protocol.id)
        plan_id = result.get('plan_id') if isinstance(result, dict) else None
        return {'name': '访视计划', 'status': 'created', 'id': plan_id,
                'message': '已生成'}
    except Exception as e:
        logger.warning(f'访视计划生成失败: {e}')
        return {'name': '访视计划', 'status': 'failed', 'id': None, 'message': str(e)}


def _generate_resource_demand(protocol) -> Dict:
    """生成资源需求计划"""
    from apps.visit.models import VisitPlan, ResourceDemand
    try:
        plan = VisitPlan.objects.filter(protocol=protocol).first()
        if not plan:
            return {'name': '资源需求计划', 'status': 'skipped', 'id': None,
                    'message': '无访视计划，跳过'}

        existing = ResourceDemand.objects.filter(visit_plan=plan).exists()
        if existing:
            return {'name': '资源需求计划', 'status': 'skipped', 'id': None,
                    'message': '已存在，跳过'}

        from apps.visit.services.resource_demand_service import ResourceDemandService
        demand = ResourceDemandService.generate_resource_demand(plan.id)
        return {'name': '资源需求计划', 'status': 'created', 'id': demand.id if demand else None,
                'message': '已生成'}
    except Exception as e:
        logger.warning(f'资源需求计划生成失败: {e}')
        return {'name': '资源需求计划', 'status': 'failed', 'id': None, 'message': str(e)}


def _generate_etmf_directory(protocol) -> Dict:
    """生成 eTMF 文档目录"""
    from apps.document.models import DocumentCategory, Document
    try:
        # Check if protocol already has documents
        existing = Document.objects.filter(
            description__icontains=f'protocol_{protocol.id}',
        ).exists()
        if existing:
            return {'name': 'eTMF文档目录', 'status': 'skipped', 'id': None,
                    'message': '已存在，跳过'}

        # Standard TMF categories
        tmf_categories = [
            ('TMF-PROTOCOL', '协议文件'),
            ('TMF-ETHICS', '伦理文件'),
            ('TMF-ICF', '知情同意书'),
            ('TMF-CRF', 'CRF/数据采集'),
            ('TMF-REPORT', '报告文件'),
            ('TMF-COMM', '通信文件'),
            ('TMF-MONITOR', '监查文件'),
            ('TMF-ARCHIVE', '归档文件'),
        ]

        created_ids = []
        for code, name in tmf_categories:
            cat_code = f'{code}-P{protocol.id}'
            cat, _ = DocumentCategory.objects.get_or_create(
                code=cat_code,
                defaults={
                    'name': f'{name} - {protocol.title[:50]}',
                    'description': f'项目 {protocol.code or protocol.title} 的{name}目录',
                },
            )
            created_ids.append(cat.id)

        return {'name': 'eTMF文档目录', 'status': 'created',
                'id': created_ids[0] if created_ids else None,
                'message': f'已创建 {len(tmf_categories)} 个分类目录'}
    except Exception as e:
        logger.warning(f'eTMF目录生成失败: {e}')
        return {'name': 'eTMF文档目录', 'status': 'failed', 'id': None, 'message': str(e)}


def _generate_crf_template(protocol) -> Dict:
    """根据协议解析数据生成 CRF 模板骨架"""
    from apps.edc.models import CRFTemplate
    try:
        existing = CRFTemplate.objects.filter(
            name__icontains=protocol.code or protocol.title[:30],
        ).exists()
        if existing:
            return {'name': 'CRF模板', 'status': 'skipped', 'id': None,
                    'message': '已存在，跳过'}

        # Build basic schema from parsed_data
        schema = {'type': 'object', 'properties': {}, 'required': []}
        if protocol.parsed_data and isinstance(protocol.parsed_data, dict):
            endpoints = protocol.parsed_data.get('endpoints', [])
            if isinstance(endpoints, list):
                for ep in endpoints:
                    name = ep if isinstance(ep, str) else ep.get('name', '')
                    if name:
                        field_key = name.lower().replace(' ', '_')[:50]
                        schema['properties'][field_key] = {
                            'type': 'string', 'title': name,
                        }

        template = CRFTemplate.objects.create(
            name=f'CRF - {protocol.code or protocol.title[:30]}',
            version='1.0',
            schema=schema,
        )
        return {'name': 'CRF模板', 'status': 'created', 'id': template.id,
                'message': '已生成骨架'}
    except Exception as e:
        logger.warning(f'CRF模板生成失败: {e}')
        return {'name': 'CRF模板', 'status': 'failed', 'id': None, 'message': str(e)}


def _generate_ethics_draft(protocol) -> Dict:
    """生成伦理申请草稿"""
    from apps.ethics.models import EthicsApplication, EthicsCommittee
    try:
        existing = EthicsApplication.objects.filter(protocol=protocol).exists()
        if existing:
            return {'name': '伦理申请', 'status': 'skipped', 'id': None,
                    'message': '已存在，跳过'}

        committee = EthicsCommittee.objects.filter(is_active=True).first()
        if not committee:
            return {'name': '伦理申请', 'status': 'failed', 'id': None,
                    'message': '未配置伦理委员会'}

        app = EthicsApplication.objects.create(
            protocol=protocol,
            committee=committee,
            application_number=f'EA-{protocol.code or protocol.id}-001',
            status='draft',
        )
        return {'name': '伦理申请', 'status': 'created', 'id': app.id,
                'message': '已创建草稿'}
    except Exception as e:
        logger.warning(f'伦理申请生成失败: {e}')
        return {'name': '伦理申请', 'status': 'failed', 'id': None, 'message': str(e)}


def _generate_budget_draft(protocol) -> Dict:
    """生成项目预算草稿"""
    from apps.finance.models import ProjectBudget
    from datetime import date as date_cls
    try:
        existing = ProjectBudget.objects.filter(protocol_id=protocol.id).exists()
        if existing:
            return {'name': '项目预算', 'status': 'skipped', 'id': None,
                    'message': '已存在，跳过'}

        today = date_cls.today()
        budget = ProjectBudget.objects.create(
            protocol_id=protocol.id,
            budget_no=f'BUD-{protocol.code or protocol.id}-001',
            budget_name=f'预算 - {protocol.code or protocol.title[:30]}',
            budget_year=today.year,
            start_date=today,
            end_date=date_cls(today.year, 12, 31),
            status='draft',
        )
        return {'name': '项目预算', 'status': 'created', 'id': budget.id,
                'message': '已创建草稿'}
    except Exception as e:
        logger.warning(f'项目预算生成失败: {e}')
        return {'name': '项目预算', 'status': 'failed', 'id': None, 'message': str(e)}


def _generate_milestones(protocol) -> Dict:
    """生成排程里程碑计划"""
    from apps.visit.models import VisitPlan
    from apps.scheduling.models import SchedulePlan, ScheduleMilestone
    try:
        plan = VisitPlan.objects.filter(protocol=protocol).first()
        if not plan:
            return {'name': '排程里程碑', 'status': 'skipped', 'id': None,
                    'message': '无访视计划，跳过'}

        sched_plan = SchedulePlan.objects.filter(visit_plan=plan).first()
        if not sched_plan:
            return {'name': '排程里程碑', 'status': 'skipped', 'id': None,
                    'message': '无排程计划，跳过'}

        existing = ScheduleMilestone.objects.filter(schedule_plan=sched_plan).exists()
        if existing:
            return {'name': '排程里程碑', 'status': 'skipped', 'id': None,
                    'message': '已存在，跳过'}

        from datetime import date, timedelta
        today = date.today()

        default_milestones = [
            ('fsi', '首例入组', today + timedelta(days=14)),
            ('lsi', '末例入组', today + timedelta(days=90)),
            ('lso', '末例出组', today + timedelta(days=120)),
            ('dbl', '数据库锁定', today + timedelta(days=135)),
            ('report', '报告提交', today + timedelta(days=150)),
        ]

        created_ids = []
        for mtype, name, target in default_milestones:
            ms = ScheduleMilestone.objects.create(
                schedule_plan=sched_plan,
                milestone_type=mtype,
                name=name,
                target_date=target,
            )
            created_ids.append(ms.id)

        return {'name': '排程里程碑', 'status': 'created',
                'id': created_ids[0] if created_ids else None,
                'message': f'已创建 {len(default_milestones)} 个里程碑'}
    except Exception as e:
        logger.warning(f'排程里程碑生成失败: {e}')
        return {'name': '排程里程碑', 'status': 'failed', 'id': None, 'message': str(e)}


def check_document_gaps(protocol_id: int) -> Dict[str, Any]:
    """
    检查协议相关项目资料的完整性。

    检查项：SOP 关联、培训记录、伦理审批件、eTMF 文档目录、CRF 模板。
    返回: {'complete': [...], 'missing': [...], 'version_conflicts': [...]}
    """
    from apps.protocol.models import Protocol

    result: Dict[str, Any] = {'complete': [], 'missing': [], 'version_conflicts': []}

    try:
        protocol = Protocol.objects.get(id=protocol_id, is_deleted=False)
    except Protocol.DoesNotExist:
        result['missing'].append({'item': '协议', 'detail': f'协议 #{protocol_id} 不存在'})
        return result

    # 1. SOP 关联检查
    try:
        from apps.quality.models import SOPDocument
        sops = SOPDocument.objects.filter(
            related_protocol_id=protocol_id, is_deleted=False,
        )
        if sops.exists():
            for sop in sops:
                if sop.status == 'approved':
                    result['complete'].append({'item': f'SOP: {sop.title}', 'id': sop.id})
                else:
                    result['version_conflicts'].append({
                        'item': f'SOP: {sop.title}',
                        'id': sop.id,
                        'detail': f'状态为 {sop.status}，尚未审批',
                    })
        else:
            result['missing'].append({'item': 'SOP 文档', 'detail': '未关联任何 SOP'})
    except Exception as e:
        logger.warning(f'SOP 检查异常: {e}')
        result['missing'].append({'item': 'SOP 文档', 'detail': f'检查异常: {e}'})

    # 2. 伦理审批件检查
    try:
        from apps.ethics.models import EthicsApplication
        ethics_apps = EthicsApplication.objects.filter(protocol=protocol)
        if ethics_apps.exists():
            for ea in ethics_apps:
                if ea.status == 'approved':
                    result['complete'].append({'item': f'伦理审批: {ea.application_number}', 'id': ea.id})
                else:
                    result['version_conflicts'].append({
                        'item': f'伦理审批: {ea.application_number}',
                        'id': ea.id,
                        'detail': f'状态为 {ea.status}，尚未通过',
                    })
        else:
            result['missing'].append({'item': '伦理审批件', 'detail': '未提交伦理申请'})
    except Exception as e:
        logger.warning(f'伦理审批件检查异常: {e}')
        result['missing'].append({'item': '伦理审批件', 'detail': f'检查异常: {e}'})

    # 3. 培训记录检查
    try:
        from apps.hr.models import TrainingRecord
        trainings = TrainingRecord.objects.filter(
            related_protocol_id=protocol_id,
        )
        if trainings.exists():
            completed = trainings.filter(status='completed')
            if completed.exists():
                result['complete'].append({
                    'item': '培训记录',
                    'detail': f'{completed.count()} 条已完成',
                })
            pending = trainings.exclude(status='completed')
            if pending.exists():
                result['version_conflicts'].append({
                    'item': '培训记录',
                    'detail': f'{pending.count()} 条未完成',
                })
        else:
            result['missing'].append({'item': '培训记录', 'detail': '无相关培训记录'})
    except Exception as e:
        logger.warning(f'培训记录检查异常: {e}')
        result['missing'].append({'item': '培训记录', 'detail': f'检查异常: {e}'})

    # 4. eTMF 文档目录检查
    try:
        from apps.document.models import DocumentCategory
        cat_prefix = f'TMF-PROTOCOL-P{protocol_id}'
        etmf_cats = DocumentCategory.objects.filter(code__startswith=f'TMF-')
        protocol_cats = [c for c in etmf_cats if f'P{protocol_id}' in c.code]
        if protocol_cats:
            result['complete'].append({
                'item': 'eTMF 文档目录',
                'detail': f'{len(protocol_cats)} 个分类目录',
            })
        else:
            result['missing'].append({'item': 'eTMF 文档目录', 'detail': '未创建文档目录'})
    except Exception as e:
        logger.warning(f'eTMF 检查异常: {e}')
        result['missing'].append({'item': 'eTMF 文档目录', 'detail': f'检查异常: {e}'})

    # 5. CRF 模板检查
    try:
        from apps.edc.models import CRFTemplate
        crf_key = protocol.code or protocol.title[:30]
        crfs = CRFTemplate.objects.filter(name__icontains=crf_key)
        if crfs.exists():
            result['complete'].append({
                'item': 'CRF 模板',
                'detail': f'{crfs.count()} 个模板',
            })
        else:
            result['missing'].append({'item': 'CRF 模板', 'detail': '未创建 CRF 模板'})
    except Exception as e:
        logger.warning(f'CRF 模板检查异常: {e}')
        result['missing'].append({'item': 'CRF 模板', 'detail': f'检查异常: {e}'})

    logger.info(
        f'资料完整性检查: protocol={protocol_id}, '
        f'complete={len(result["complete"])}, missing={len(result["missing"])}, '
        f'conflicts={len(result["version_conflicts"])}'
    )
    return result


def check_delivery_consistency(protocol_id: int) -> Dict[str, Any]:
    """
    交付校对：检查协议版本与引用 SOP 是否一致、结项文档是否齐全。

    返回: {'consistent': True/False, 'issues': [...], 'checklist': [...]}
    """
    from apps.protocol.models import Protocol

    issues: List[str] = []
    checklist: List[Dict[str, Any]] = []

    try:
        protocol = Protocol.objects.get(id=protocol_id, is_deleted=False)
    except Protocol.DoesNotExist:
        return {'consistent': False, 'issues': [f'协议 #{protocol_id} 不存在'], 'checklist': []}

    # 1. SOP 版本一致性
    try:
        from apps.quality.models import SOPDocument
        sops = SOPDocument.objects.filter(related_protocol_id=protocol_id, is_deleted=False)
        if sops.exists():
            for sop in sops:
                entry = {'item': f'SOP: {sop.title}', 'version': getattr(sop, 'version', '?'), 'ok': sop.status == 'approved'}
                checklist.append(entry)
                if sop.status != 'approved':
                    issues.append(f'SOP "{sop.title}" 状态为 {sop.status}，非生效版本')
        else:
            issues.append('未关联任何 SOP 文档')
            checklist.append({'item': 'SOP 关联', 'version': '-', 'ok': False})
    except Exception as e:
        issues.append(f'SOP 检查异常: {e}')

    # 2. 结项文档齐全性
    required_docs = [
        ('final_report', '结项报告'),
        ('signature_page', '签名页'),
        ('data_summary', '数据总结'),
    ]
    try:
        from apps.document.models import Document
        for doc_key, doc_name in required_docs:
            exists = Document.objects.filter(
                description__icontains=f'protocol_{protocol_id}',
            ).filter(
                description__icontains=doc_key,
            ).exists()
            checklist.append({'item': doc_name, 'version': '-', 'ok': exists})
            if not exists:
                issues.append(f'缺少结项文档: {doc_name}')
    except Exception as e:
        issues.append(f'文档检查异常: {e}')

    # 3. 伦理批件有效
    try:
        from apps.ethics.models import EthicsApplication
        ethics = EthicsApplication.objects.filter(protocol=protocol)
        if ethics.exists():
            approved = ethics.filter(status='approved').exists()
            checklist.append({'item': '伦理批件', 'version': '-', 'ok': approved})
            if not approved:
                issues.append('伦理批件尚未通过审批')
        else:
            issues.append('无伦理申请记录')
            checklist.append({'item': '伦理批件', 'version': '-', 'ok': False})
    except Exception as e:
        issues.append(f'伦理检查异常: {e}')

    consistent = len(issues) == 0
    logger.info(
        'check_delivery_consistency: protocol=%s consistent=%s issues=%d',
        protocol_id, consistent, len(issues),
    )
    return {'consistent': consistent, 'issues': issues, 'checklist': checklist}


def _generate_feishu_chat(protocol) -> Dict:
    """创建飞书项目群"""
    try:
        if protocol.feishu_chat_id:
            return {'name': '飞书项目群', 'status': 'skipped', 'id': None,
                    'message': '已存在，跳过'}

        from apps.protocol.services.protocol_service import _create_project_chat
        chat_id = _create_project_chat(protocol)
        if chat_id:
            return {'name': '飞书项目群', 'status': 'created', 'id': None,
                    'message': f'群ID: {chat_id}'}
        else:
            return {'name': '飞书项目群', 'status': 'failed', 'id': None,
                    'message': '飞书 API 不可用'}
    except Exception as e:
        logger.warning(f'飞书项目群创建失败: {e}')
        return {'name': '飞书项目群', 'status': 'failed', 'id': None, 'message': str(e)}
