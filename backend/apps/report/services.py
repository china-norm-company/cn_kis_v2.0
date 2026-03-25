"""
报告生成服务

S4-4：自动收集数据 → 生成报告 → 上传飞书云文档
"""
import logging
from typing import Optional
from django.utils import timezone
from django.db.models import Count

from .models import Report, ReportTemplate, ReportStatus, ReportType

logger = logging.getLogger(__name__)


def create_report(
    report_type: str,
    title: str,
    protocol_id: int = None,
    template_id: int = None,
    generated_by_id: int = None,
) -> Report:
    return Report.objects.create(
        report_type=report_type,
        title=title,
        protocol_id=protocol_id,
        template_id=template_id,
        status=ReportStatus.DRAFT,
        generated_by_id=generated_by_id,
    )


def generate_report(report_id: int) -> Optional[Report]:
    """
    自动生成报告

    根据报告类型收集数据、生成内容、上传飞书。
    """
    report = Report.objects.filter(id=report_id).first()
    if not report:
        return None

    report.status = ReportStatus.GENERATING
    report.save(update_fields=['status', 'update_time'])

    try:
        # 按类型收集数据
        data = _collect_data(report)
        report.data_snapshot = data

        # 生成报告内容
        content = _render_report(report, data)
        report.content = content

        report.status = ReportStatus.GENERATED
        report.generated_at = timezone.now()
        report.save()

        # 上传飞书云文档
        _upload_report_to_feishu(report)

        logger.info(f'报告#{report.id} 已生成')
        return report
    except Exception as e:
        report.status = ReportStatus.FAILED
        report.save(update_fields=['status', 'update_time'])
        logger.error(f'报告#{report.id} 生成失败: {e}')
        return report


def list_reports(
    report_type: str = None, protocol_id: int = None,
    page: int = 1, page_size: int = 20,
) -> dict:
    qs = Report.objects.all()
    if report_type:
        qs = qs.filter(report_type=report_type)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


def _collect_data(report: Report) -> dict:
    """按报告类型收集数据"""
    data = {}
    pid = report.protocol_id

    if report.report_type == ReportType.VISIT_SUMMARY:
        from apps.visit.models import VisitPlan, VisitNode
        plans = VisitPlan.objects.filter(protocol_id=pid)
        data['plan_count'] = plans.count()
        data['node_count'] = VisitNode.objects.filter(plan__in=plans).count()

    elif report.report_type == ReportType.ENROLLMENT_STATUS:
        from apps.subject.models import Enrollment
        enrollments = Enrollment.objects.filter(protocol_id=pid)
        data['total'] = enrollments.count()
        data['by_status'] = dict(
            enrollments.values_list('status').annotate(c=Count('id')).values_list('status', 'c')
        )

    elif report.report_type == ReportType.SAFETY_REPORT:
        from apps.safety.models import AdverseEvent
        aes = AdverseEvent.objects.filter(enrollment__protocol_id=pid)
        data['total_ae'] = aes.count()
        data['sae_count'] = aes.filter(is_sae=True).count()
        data['by_severity'] = dict(
            aes.values_list('severity').annotate(c=Count('id')).values_list('severity', 'c')
        )

    elif report.report_type == ReportType.WORKORDER_SUMMARY:
        from apps.workorder.models import WorkOrder
        wos = WorkOrder.objects.filter(
            enrollment__protocol_id=pid, is_deleted=False,
        )
        data['total'] = wos.count()
        data['by_status'] = dict(
            wos.values_list('status').annotate(c=Count('id')).values_list('status', 'c')
        )

    elif report.report_type == ReportType.COMPLIANCE_REPORT:
        from apps.quality.models import Deviation, CAPA
        data['deviation_count'] = Deviation.objects.filter(
            project_id=pid, is_deleted=False,
        ).count()
        data['capa_count'] = CAPA.objects.filter(
            deviation__project_id=pid, is_deleted=False,
        ).count()

    elif report.report_type == ReportType.CUSTOM:
        # 自定义报告：从报告模板的 data_config 读取，或使用 data_snapshot
        if report.template_id:
            tpl = ReportTemplate.objects.filter(id=report.template_id).first()
            if tpl and tpl.template_config:
                data['template_config'] = tpl.template_config
        data['note'] = '自定义报告，请根据模板配置补充数据'

    return data


def _render_report(report: Report, data: dict) -> str:
    """渲染报告内容（Markdown 格式）"""
    lines = [f'# {report.title}', '', f'**报告类型**: {report.report_type}',
             f'**生成时间**: {timezone.now().isoformat()}', '']

    if report.protocol_id:
        lines.append(f'**协议ID**: {report.protocol_id}')
        lines.append('')

    lines.append('## 数据摘要')
    lines.append('')

    # 格式化输出
    if report.report_type == ReportType.VISIT_SUMMARY:
        lines.append('| 指标 | 数值 |')
        lines.append('|------|------|')
        lines.append(f'| 访视计划数 | {data.get("plan_count", 0)} |')
        lines.append(f'| 访视节点数 | {data.get("node_count", 0)} |')
    elif report.report_type == ReportType.ENROLLMENT_STATUS:
        lines.append(f'**总入组数**: {data.get("total", 0)}')
        lines.append('')
        by_status = data.get('by_status', {})
        if by_status:
            lines.append('| 状态 | 数量 |')
            lines.append('|------|------|')
            for st, cnt in by_status.items():
                lines.append(f'| {st} | {cnt} |')
    elif report.report_type == ReportType.SAFETY_REPORT:
        lines.append(f'**AE 总数**: {data.get("total_ae", 0)}')
        lines.append(f'**SAE 数量**: {data.get("sae_count", 0)}')
        lines.append('')
        by_severity = data.get('by_severity', {})
        if by_severity:
            lines.append('| 严重程度 | 数量 |')
            lines.append('|----------|------|')
            for sv, cnt in by_severity.items():
                lines.append(f'| {sv} | {cnt} |')
    elif report.report_type == ReportType.WORKORDER_SUMMARY:
        lines.append(f'**工单总数**: {data.get("total", 0)}')
        lines.append('')
        by_status = data.get('by_status', {})
        if by_status:
            lines.append('| 状态 | 数量 |')
            lines.append('|------|------|')
            for st, cnt in by_status.items():
                lines.append(f'| {st} | {cnt} |')
    elif report.report_type == ReportType.COMPLIANCE_REPORT:
        lines.append('| 指标 | 数值 |')
        lines.append('|------|------|')
        lines.append(f'| 偏差数 | {data.get("deviation_count", 0)} |')
        lines.append(f'| CAPA数 | {data.get("capa_count", 0)} |')
    else:
        import json as _json
        lines.append('```json')
        lines.append(_json.dumps(data, indent=2, ensure_ascii=False))
        lines.append('```')

    return '\n'.join(lines)


def _upload_report_to_feishu(report: Report):
    """上传报告到飞书云文档"""
    try:
        from libs.feishu_client import feishu_client
        import os
        folder_token = os.getenv('FEISHU_DOC_FOLDER_TOKEN', '')
        if not folder_token:
            return

        result = feishu_client.create_document(
            folder_token=folder_token,
            title=report.title,
        )
        doc_token = result.get('document', {}).get('document_id', '') if result else ''
        if doc_token:
            report.feishu_doc_token = doc_token
            report.save(update_fields=['feishu_doc_token', 'update_time'])
    except Exception as e:
        logger.error(f'报告#{report.id} 上传飞书失败: {e}')
