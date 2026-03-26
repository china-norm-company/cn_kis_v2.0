"""
LIMS 双轨去重与对比报告生成器

职责：
1. 对比 LIMS 原始数据 与 新系统已有数据
2. 生成 HTML + CSV 冲突报告
3. 提供冲突批量处理接口（用于后台管理界面）
4. 双轨并行期数据一致性监控
"""
import csv
import logging
from datetime import datetime
from io import StringIO
from pathlib import Path
from typing import Any, Dict, Optional

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('cn_kis.lims.dedup')


class LimsDedupReport:
    """
    LIMS 双轨去重对比报告

    在以下时机调用：
    1. 注入前：扫描所有 LIMS raw 数据与新系统的重叠
    2. 双轨运行期：定期比对两系统的数据一致性
    3. 按需：查看特定模块的冲突状态
    """

    def __init__(self, batch):
        """
        batch: LimsImportBatch 实例
        """
        self.batch = batch

    # ------------------------------------------------------------------
    # 冲突统计
    # ------------------------------------------------------------------

    def get_conflict_summary(self) -> Dict[str, Any]:
        """获取批次的冲突汇总"""
        from apps.lims_integration.models import LimsConflict, ConflictResolution
        conflicts = LimsConflict.objects.filter(batch=self.batch)
        total = conflicts.count()
        by_resolution = {}
        for choice in ConflictResolution.choices:
            by_resolution[choice[0]] = conflicts.filter(resolution=choice[0]).count()
        by_module = {}
        for item in conflicts.values('module').distinct():
            module = item['module']
            by_module[module] = {
                'total': conflicts.filter(module=module).count(),
                'pending': conflicts.filter(module=module,
                                            resolution=ConflictResolution.PENDING).count(),
            }
        return {
            'batch_no': self.batch.batch_no,
            'total': total,
            'by_resolution': by_resolution,
            'by_module': by_module,
            'pending_count': by_resolution.get('pending', 0),
        }

    def get_pending_conflicts(self, module: Optional[str] = None) -> list:
        """获取待审核的冲突列表"""
        from apps.lims_integration.models import LimsConflict, ConflictResolution
        qs = LimsConflict.objects.filter(
            batch=self.batch,
            resolution=ConflictResolution.PENDING,
        ).order_by('module', '-similarity_score')
        if module:
            qs = qs.filter(module=module)
        result = []
        for c in qs:
            result.append({
                'id': c.id,
                'module': c.module,
                'lims_id': c.lims_id,
                'conflict_type': c.conflict_type,
                'similarity': c.similarity_score,
                'lims_data': c.lims_data,
                'existing_data': c.existing_data,
                'diff_fields': c.diff_fields,
                'existing_table': c.existing_table,
                'existing_record_id': c.existing_record_id,
            })
        return result

    # ------------------------------------------------------------------
    # 冲突处理
    # ------------------------------------------------------------------

    @transaction.atomic
    def resolve_conflict(
        self,
        conflict_id: int,
        resolution: str,
        resolved_by_id: Optional[int] = None,
        note: str = '',
        merged_data: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """
        处理单条冲突。

        resolution 取值:
          use_lims       — 用 LIMS 数据覆盖新系统记录
          use_existing   — 保留新系统数据，跳过注入
          manual_merge   — 使用 merged_data 中的数据注入
          skip           — 跳过，不做任何操作
        """
        from apps.lims_integration.models import LimsConflict, ConflictResolution

        conflict = LimsConflict.objects.select_for_update().get(id=conflict_id)
        if conflict.resolution != ConflictResolution.PENDING:
            return {'success': False, 'message': '该冲突已处理'}

        conflict.resolution = resolution
        conflict.resolved_by_id = resolved_by_id
        conflict.resolved_at = timezone.now()
        conflict.resolution_note = note
        if merged_data:
            conflict.merged_data = merged_data
        conflict.save()

        # 执行决策
        result = {'success': True, 'resolution': resolution}
        if resolution == 'use_lims':
            result.update(self._apply_lims_data(conflict))
        elif resolution == 'manual_merge':
            result.update(self._apply_merged_data(conflict))
        elif resolution in ('use_existing', 'skip'):
            conflict.raw_record.injection_status = 'skipped'
            conflict.raw_record.save(update_fields=['injection_status'])

        # 更新批次统计
        self.batch.conflict_count = LimsConflict.objects.filter(
            batch=self.batch,
            resolution=ConflictResolution.PENDING,
        ).count()
        self.batch.save(update_fields=['conflict_count'])
        return result

    @transaction.atomic
    def bulk_resolve(
        self,
        module: str,
        resolution: str,
        resolved_by_id: Optional[int] = None,
    ) -> int:
        """批量处理某模块的所有待审核冲突"""
        from apps.lims_integration.models import LimsConflict, ConflictResolution
        conflicts = LimsConflict.objects.filter(
            batch=self.batch,
            module=module,
            resolution=ConflictResolution.PENDING,
        )
        count = 0
        for conflict in conflicts:
            self.resolve_conflict(
                conflict.id, resolution, resolved_by_id=resolved_by_id
            )
            count += 1
        logger.info('批量处理 [%s] 冲突 %d 条: %s', module, count, resolution)
        return count

    def _apply_lims_data(self, conflict) -> Dict[str, Any]:
        """用 LIMS 数据更新新系统记录"""
        from apps.lims_integration.models import LimsInjectionLog, InjectionAction
        try:
            from django.apps import apps
            # 定位目标模型
            for app_label in ['resource', 'identity', 'crm', 'protocol', 'sample', 'hr']:
                for model in apps.get_app_config(app_label).get_models():
                    if model._meta.db_table == conflict.existing_table:
                        obj = model.objects.filter(id=conflict.existing_record_id).first()
                        if obj:
                            before_data = _model_snapshot(obj)
                            # 只更新 diff_fields 中有差异的字段
                            updated = False
                            for diff in conflict.diff_fields:
                                field_name = diff.get('field', '')
                                lims_val = diff.get('lims', '')
                                if hasattr(obj, field_name) and lims_val:
                                    setattr(obj, field_name, lims_val)
                                    updated = True
                            if updated:
                                obj.save()
                                LimsInjectionLog.objects.create(
                                    batch=self.batch,
                                    raw_record=conflict.raw_record,
                                    module=conflict.module,
                                    lims_id=conflict.lims_id,
                                    target_table=conflict.existing_table,
                                    target_id=conflict.existing_record_id,
                                    action=InjectionAction.UPDATED,
                                    before_data=before_data,
                                    after_data=conflict.lims_data,
                                )
                                conflict.raw_record.injection_status = 'injected'
                                conflict.raw_record.save(update_fields=['injection_status'])
                            return {'applied': updated}
        except Exception as ex:
            logger.error('应用 LIMS 数据失败: %s', ex)
            return {'applied': False, 'error': str(ex)}
        return {'applied': False}

    def _apply_merged_data(self, conflict) -> Dict[str, Any]:
        """使用人工合并的数据注入"""
        if not conflict.merged_data:
            return {'applied': False, 'error': 'merged_data 为空'}
        return self._apply_lims_data_override(conflict, conflict.merged_data)

    def _apply_lims_data_override(self, conflict, data_to_apply: dict) -> Dict[str, Any]:
        """覆盖注入数据"""
        try:
            from django.apps import apps
            for app_label in ['resource', 'identity', 'crm', 'protocol', 'sample', 'hr']:
                for model in apps.get_app_config(app_label).get_models():
                    if model._meta.db_table == conflict.existing_table:
                        obj = model.objects.filter(id=conflict.existing_record_id).first()
                        if obj:
                            before_data = _model_snapshot(obj)
                            for field_name, val in data_to_apply.items():
                                if hasattr(obj, field_name):
                                    setattr(obj, field_name, val)
                            obj.save()
                            return {'applied': True}
        except Exception as ex:
            return {'applied': False, 'error': str(ex)}
        return {'applied': False}

    # ------------------------------------------------------------------
    # 报告生成
    # ------------------------------------------------------------------

    def generate_html_report(self, output_path: Optional[str] = None) -> str:
        """
        生成 HTML 格式的冲突对比报告。
        输出到 output_path 或 backup_dir/conflict_report.html
        """
        from apps.lims_integration.models import (
            LimsConflict, LimsInjectionLog, RawLimsRecord
        )

        summary = self.get_conflict_summary()
        conflicts = LimsConflict.objects.filter(batch=self.batch).order_by('module', 'lims_id')
        inj_logs = LimsInjectionLog.objects.filter(batch=self.batch)
        raw_records = RawLimsRecord.objects.filter(batch=self.batch)

        # 统计数据
        stats = {
            'total_raw': raw_records.count(),
            'injected': raw_records.filter(injection_status='injected').count(),
            'conflict': raw_records.filter(injection_status='conflict').count(),
            'skipped': raw_records.filter(injection_status='skipped').count(),
            'pending': raw_records.filter(injection_status='pending').count(),
            'failed': raw_records.filter(injection_status='failed').count(),
        }

        html = self._render_html_report(summary, conflicts, inj_logs, stats)

        if not output_path:
            from apps.lims_integration.lims_exporter import BACKUP_ROOT
            output_path = str(BACKUP_ROOT / self.batch.batch_no / 'conflict_report.html')

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        logger.info('冲突报告已生成: %s', output_path)
        return output_path

    def generate_csv_report(self, output_path: Optional[str] = None) -> str:
        """生成 CSV 格式冲突报告（便于 Excel 处理）"""
        from apps.lims_integration.models import LimsConflict

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow([
            '冲突ID', '模块', 'LIMS_ID', '冲突类型', '相似度',
            '处理决策', 'LIMS数据摘要', '现有数据摘要', '差异字段数'
        ])

        for c in LimsConflict.objects.filter(batch=self.batch).order_by('module'):
            lims_summary = ' | '.join(
                f'{k}={v}' for k, v in list(c.lims_data.items())[:5] if v
            )
            exist_summary = ' | '.join(
                f'{k}={v}' for k, v in list(c.existing_data.items())[:5] if v
            )
            writer.writerow([
                c.id, c.module, c.lims_id, c.conflict_type,
                f'{c.similarity_score:.2f}', c.resolution,
                lims_summary[:200], exist_summary[:200],
                len(c.diff_fields),
            ])

        csv_content = output.getvalue()
        if not output_path:
            from apps.lims_integration.lims_exporter import BACKUP_ROOT
            output_path = str(BACKUP_ROOT / self.batch.batch_no / 'conflict_report.csv')

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
            f.write(csv_content)
        return output_path

    def _render_html_report(self, summary, conflicts, inj_logs, stats) -> str:
        """渲染 HTML 报告"""
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        rows = []
        for c in conflicts:
            diff_html = ''
            for diff in (c.diff_fields or [])[:10]:
                diff_html += (
                    f'<tr><td class="field">{diff.get("field","")}</td>'
                    f'<td class="lims-val">{str(diff.get("lims",""))[:100]}</td>'
                    f'<td class="exist-val">{str(diff.get("existing",""))[:100]}</td></tr>'
                )
            status_class = {
                'pending': 'badge-warning',
                'use_lims': 'badge-primary',
                'use_existing': 'badge-secondary',
                'manual_merge': 'badge-info',
                'skip': 'badge-dark',
            }.get(c.resolution, 'badge-light')

            rows.append(f'''
<tr>
  <td>{c.id}</td>
  <td><span class="badge badge-module">{c.module}</span></td>
  <td class="lims-id">{c.lims_id}</td>
  <td>{c.get_conflict_type_display()}</td>
  <td>{c.similarity_score:.0%}</td>
  <td><span class="badge {status_class}">{c.get_resolution_display()}</span></td>
  <td>
    <details><summary>{len(c.diff_fields or [])} 个差异字段</summary>
    <table class="diff-table">
      <tr><th>字段</th><th>LIMS值</th><th>现有值</th></tr>
      {diff_html}
    </table></details>
  </td>
</tr>''')

        return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>LIMS 数据冲突报告 - {self.batch.batch_no}</title>
<style>
  body {{ font-family: "Microsoft YaHei", Arial, sans-serif; margin: 20px; color: #333; }}
  h1 {{ color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }}
  .summary-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }}
  .stat-card {{ background: #f8f9fa; border-radius: 8px; padding: 15px; text-align: center; border: 1px solid #dee2e6; }}
  .stat-card .num {{ font-size: 32px; font-weight: bold; color: #3498db; }}
  .stat-card .label {{ color: #6c757d; font-size: 14px; margin-top: 5px; }}
  .stat-card.danger .num {{ color: #e74c3c; }}
  .stat-card.success .num {{ color: #27ae60; }}
  .stat-card.warning .num {{ color: #f39c12; }}
  table {{ width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }}
  th {{ background: #3498db; color: white; padding: 10px 8px; text-align: left; }}
  td {{ padding: 8px; border-bottom: 1px solid #dee2e6; vertical-align: top; }}
  tr:hover {{ background: #f5f5f5; }}
  .badge {{ padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }}
  .badge-warning {{ background: #ffc107; color: #000; }}
  .badge-primary {{ background: #007bff; color: #fff; }}
  .badge-secondary {{ background: #6c757d; color: #fff; }}
  .badge-info {{ background: #17a2b8; color: #fff; }}
  .badge-dark {{ background: #343a40; color: #fff; }}
  .badge-module {{ background: #6c5ce7; color: #fff; }}
  .lims-id {{ font-family: monospace; font-size: 12px; color: #666; }}
  .diff-table {{ font-size: 11px; margin-top: 5px; border: 1px solid #ddd; }}
  .diff-table th {{ background: #f0f0f0; color: #333; padding: 4px; }}
  .diff-table td {{ padding: 3px 6px; }}
  .field {{ color: #666; font-style: italic; }}
  .lims-val {{ color: #2980b9; }}
  .exist-val {{ color: #27ae60; }}
  details summary {{ cursor: pointer; color: #3498db; }}
  .section {{ background: white; border-radius: 8px; padding: 20px; margin: 20px 0;
             box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
</style>
</head>
<body>
<h1>LIMS 数据冲突报告</h1>
<p>批次号: <strong>{self.batch.batch_no}</strong> | 生成时间: {now}</p>

<div class="section">
<h2>数据总览</h2>
<div class="summary-grid">
  <div class="stat-card"><div class="num">{stats["total_raw"]}</div><div class="label">原始数据总量</div></div>
  <div class="stat-card success"><div class="num">{stats["injected"]}</div><div class="label">已成功注入</div></div>
  <div class="stat-card danger"><div class="num">{stats["conflict"]}</div><div class="label">存在冲突</div></div>
  <div class="stat-card warning"><div class="num">{stats["pending"]}</div><div class="label">待处理</div></div>
  <div class="stat-card"><div class="num">{stats["skipped"]}</div><div class="label">已跳过</div></div>
  <div class="stat-card danger"><div class="num">{stats["failed"]}</div><div class="label">注入失败</div></div>
</div>
</div>

<div class="section">
<h2>冲突明细（共 {summary["total"]} 条）</h2>
<p>待审核: <strong style="color: #e74c3c;">{summary["pending_count"]} 条</strong>
需要人工处理后方可注入</p>
<table>
  <thead>
    <tr>
      <th>ID</th><th>模块</th><th>LIMS ID</th>
      <th>冲突类型</th><th>相似度</th><th>处理状态</th><th>差异</th>
    </tr>
  </thead>
  <tbody>
    {"".join(rows) if rows else "<tr><td colspan='7' style='text-align:center;color:#999'>暂无冲突记录</td></tr>"}
  </tbody>
</table>
</div>

<div class="section">
<h2>处理指南</h2>
<ul>
  <li><strong>use_lims（使用LIMS数据）</strong>：用 LIMS 的值覆盖新系统现有记录的差异字段</li>
  <li><strong>use_existing（保留现有数据）</strong>：新系统已有数据不变，LIMS 数据不注入</li>
  <li><strong>manual_merge（人工合并）</strong>：在后台审核界面手动编辑合并后的数据再注入</li>
  <li><strong>skip（跳过）</strong>：既不注入也不修改，仅标记已处理</li>
</ul>
<p>执行命令：<code>python manage.py fetch_lims_data --resolve-conflicts --batch {self.batch.batch_no}</code></p>
</div>
</body>
</html>'''


def _model_snapshot(instance) -> dict:
    """获取 model 实例的字段快照"""
    snapshot = {}
    for field in instance._meta.fields:
        val = getattr(instance, field.name, None)
        if hasattr(val, 'isoformat'):
            snapshot[field.name] = val.isoformat()
        elif val is not None:
            snapshot[field.name] = str(val)
    return snapshot
