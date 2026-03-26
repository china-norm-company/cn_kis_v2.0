"""
易快报双轨去重与对账报告生成器

职责：
1. 对比易快报原始数据与新系统已有数据
2. 生成 HTML + CSV 冲突对账报告
3. 提供冲突批量处理接口（用于后台管理界面）
4. 双轨并行期数据一致性监控（四类结果）
"""
import csv
import logging
from datetime import datetime
from io import StringIO
from pathlib import Path
from typing import Optional

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.dedup')


class EkbDedupReport:
    """
    易快报双轨去重对账报告

    在以下时机调用：
    1. 注入前：扫描所有 EkbRawRecord 与新系统的重叠
    2. 双轨运行期：定期比对两系统数据一致性
    3. 按需：查看特定模块冲突状态
    """

    def __init__(self, batch):
        self.batch = batch

    # ------------------------------------------------------------------
    # 冲突统计
    # ------------------------------------------------------------------

    def get_conflict_summary(self) -> dict:
        from apps.ekuaibao_integration.models import EkbConflict, EkbConflictResolution
        conflicts = EkbConflict.objects.filter(batch=self.batch)
        total = conflicts.count()
        by_resolution = {
            choice[0]: conflicts.filter(resolution=choice[0]).count()
            for choice in EkbConflictResolution.choices
        }
        by_module = {}
        for item in conflicts.values('module').distinct():
            module = item['module']
            by_module[module] = {
                'total': conflicts.filter(module=module).count(),
                'pending': conflicts.filter(
                    module=module, resolution=EkbConflictResolution.PENDING
                ).count(),
            }
        return {
            'batch_no': self.batch.batch_no,
            'total': total,
            'by_resolution': by_resolution,
            'by_module': by_module,
            'pending_count': by_resolution.get('pending', 0),
        }

    def get_pending_conflicts(self, module: Optional[str] = None) -> list:
        from apps.ekuaibao_integration.models import EkbConflict, EkbConflictResolution
        qs = EkbConflict.objects.filter(
            batch=self.batch, resolution=EkbConflictResolution.PENDING
        ).order_by('module', '-similarity_score')
        if module:
            qs = qs.filter(module=module)
        return [
            {
                'id': c.id,
                'module': c.module,
                'ekb_id': c.ekb_id,
                'conflict_type': c.conflict_type,
                'similarity': c.similarity_score,
                'ekb_data': c.ekb_data,
                'existing_data': c.existing_data,
                'diff_fields': c.diff_fields,
                'existing_table': c.existing_table,
                'existing_record_id': c.existing_record_id,
            }
            for c in qs
        ]

    # ------------------------------------------------------------------
    # 双轨四类对账
    # ------------------------------------------------------------------

    def dual_track_reconcile(self, module: str = 'flows') -> dict:
        """
        双轨对账核心方法，输出四类结果：
          - only_in_ekb:      易快报有、新系统没有
          - only_in_new:      新系统有、易快报没有（正常新录）
          - both_match:       两边一致
          - both_mismatch:    两边都有但数据有差异（需关注）
        """
        from apps.ekuaibao_integration.models import EkbRawRecord

        result = {
            'module': module,
            'generated_at': datetime.now().isoformat(),
            'only_in_ekb': [],
            'only_in_new': [],
            'both_match': [],
            'both_mismatch': [],
        }

        if module == 'flows':
            result.update(self._reconcile_flows())
        elif module == 'budgets':
            result.update(self._reconcile_budgets())
        else:
            # 通用：只统计注入状态
            ekb_records = EkbRawRecord.objects.filter(batch=self.batch, module=module)
            for rec in ekb_records:
                if rec.injection_status == 'pending':
                    result['only_in_ekb'].append({
                        'ekb_id': rec.ekb_id,
                        'module': module,
                    })
                elif rec.injection_status == 'injected':
                    result['both_match'].append({'ekb_id': rec.ekb_id})
                elif rec.injection_status == 'conflict':
                    result['both_mismatch'].append({'ekb_id': rec.ekb_id})

        result['summary'] = {
            'only_in_ekb_count': len(result['only_in_ekb']),
            'only_in_new_count': len(result['only_in_new']),
            'both_match_count': len(result['both_match']),
            'both_mismatch_count': len(result['both_mismatch']),
        }
        return result

    def _reconcile_flows(self) -> dict:
        from apps.ekuaibao_integration.models import EkbRawRecord
        from apps.finance.models_expense import ExpenseRequest

        only_in_ekb = []
        only_in_new = []
        both_match = []
        both_mismatch = []

        # 易快报侧已采集的单据
        ekb_flows = {
            rec.ekb_id: rec
            for rec in EkbRawRecord.objects.filter(batch=self.batch, module='flows')
        }

        # 新系统中已有的易快报来源记录
        new_system_ekb = {
            exp.ekuaibao_id: exp
            for exp in ExpenseRequest.objects.filter(
                import_source='ekuaibao'
            ).exclude(ekuaibao_id='')
            if hasattr(exp, 'ekuaibao_id')
        }

        for ekb_id, raw_rec in ekb_flows.items():
            if ekb_id not in new_system_ekb:
                only_in_ekb.append({
                    'ekb_id': ekb_id,
                    'flow_no': raw_rec.raw_data.get('code', ''),
                    'amount': raw_rec.raw_data.get('amount', 0),
                    'status': raw_rec.raw_data.get('state', ''),
                })
            else:
                exp = new_system_ekb[ekb_id]
                ekb_amount = float(raw_rec.raw_data.get('amount', 0) or 0)
                sys_amount = float(exp.amount)
                if abs(ekb_amount - sys_amount) < 0.01:
                    both_match.append({'ekb_id': ekb_id, 'amount': ekb_amount})
                else:
                    both_mismatch.append({
                        'ekb_id': ekb_id,
                        'ekb_amount': ekb_amount,
                        'sys_amount': sys_amount,
                    })

        # 新系统中手动录入的（非易快报来源）
        for exp in ExpenseRequest.objects.filter(import_source='manual'):
            only_in_new.append({
                'id': exp.id,
                'request_no': exp.request_no,
                'applicant': exp.applicant_name,
                'amount': float(exp.amount),
            })

        return {
            'only_in_ekb': only_in_ekb,
            'only_in_new': only_in_new,
            'both_match': both_match,
            'both_mismatch': both_mismatch,
        }

    def _reconcile_budgets(self) -> dict:
        from apps.ekuaibao_integration.models import EkbRawRecord
        from apps.finance.models import ProjectBudget

        only_in_ekb, only_in_new, both_match, both_mismatch = [], [], [], []
        ekb_budgets = {
            rec.ekb_id: rec
            for rec in EkbRawRecord.objects.filter(batch=self.batch, module='budgets')
        }
        sys_budgets = {
            b.ekuaibao_budget_id: b
            for b in ProjectBudget.objects.filter(import_source='ekuaibao')
            if hasattr(b, 'ekuaibao_budget_id') and b.ekuaibao_budget_id
        }
        for ekb_id, raw_rec in ekb_budgets.items():
            if ekb_id not in sys_budgets:
                only_in_ekb.append({'ekb_id': ekb_id, 'name': raw_rec.raw_data.get('name', '')})
            else:
                both_match.append({'ekb_id': ekb_id})
        return {
            'only_in_ekb': only_in_ekb, 'only_in_new': only_in_new,
            'both_match': both_match, 'both_mismatch': both_mismatch,
        }

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
    ) -> dict:
        from apps.ekuaibao_integration.models import EkbConflict, EkbConflictResolution

        conflict = EkbConflict.objects.select_for_update().get(id=conflict_id)
        if conflict.resolution != EkbConflictResolution.PENDING:
            return {'success': False, 'message': '该冲突已处理'}

        conflict.resolution = resolution
        conflict.resolved_by_id = resolved_by_id
        conflict.resolved_at = timezone.now()
        conflict.resolution_note = note
        if merged_data:
            conflict.merged_data = merged_data
        conflict.save()

        result = {'success': True, 'resolution': resolution}
        if resolution in ('use_existing', 'skip'):
            conflict.raw_record.injection_status = 'skipped'
            conflict.raw_record.save(update_fields=['injection_status'])

        self.batch.conflict_count = EkbConflict.objects.filter(
            batch=self.batch, resolution=EkbConflictResolution.PENDING
        ).count()
        self.batch.save(update_fields=['conflict_count'])
        return result

    @transaction.atomic
    def bulk_resolve(self, module: str, resolution: str,
                     resolved_by_id: Optional[int] = None) -> int:
        from apps.ekuaibao_integration.models import EkbConflict, EkbConflictResolution
        conflicts = EkbConflict.objects.filter(
            batch=self.batch, module=module, resolution=EkbConflictResolution.PENDING
        )
        count = 0
        for conflict in conflicts:
            self.resolve_conflict(conflict.id, resolution, resolved_by_id=resolved_by_id)
            count += 1
        return count

    # ------------------------------------------------------------------
    # 报告生成
    # ------------------------------------------------------------------

    def generate_html_report(self, output_path: Optional[str] = None) -> str:
        from apps.ekuaibao_integration.models import (
            EkbConflict, EkbRawRecord
        )
        from apps.ekuaibao_integration.ekb_exporter import BACKUP_ROOT

        summary = self.get_conflict_summary()
        conflicts = EkbConflict.objects.filter(batch=self.batch).order_by('module', 'ekb_id')
        raw_records = EkbRawRecord.objects.filter(batch=self.batch)

        stats = {
            'total_raw': raw_records.count(),
            'injected': raw_records.filter(injection_status='injected').count(),
            'conflict': raw_records.filter(injection_status='conflict').count(),
            'skipped': raw_records.filter(injection_status='skipped').count(),
            'pending': raw_records.filter(injection_status='pending').count(),
            'failed': raw_records.filter(injection_status='failed').count(),
        }

        html = self._render_html(summary, conflicts, stats)

        if not output_path:
            output_path = str(BACKUP_ROOT / self.batch.batch_no / 'conflict_report.html')

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        logger.info('冲突报告已生成: %s', output_path)
        return output_path

    def generate_csv_report(self, output_path: Optional[str] = None) -> str:
        from apps.ekuaibao_integration.models import EkbConflict
        from apps.ekuaibao_integration.ekb_exporter import BACKUP_ROOT

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow([
            '冲突ID', '模块', '易快报ID', '冲突类型', '相似度',
            '处理决策', '易快报数据摘要', '现有数据摘要', '差异字段数'
        ])
        for c in EkbConflict.objects.filter(batch=self.batch).order_by('module'):
            ekb_summary = ' | '.join(f'{k}={v}' for k, v in list(c.ekb_data.items())[:5] if v)
            exist_summary = ' | '.join(f'{k}={v}' for k, v in list(c.existing_data.items())[:5] if v)
            writer.writerow([
                c.id, c.module, c.ekb_id, c.conflict_type,
                f'{c.similarity_score:.2f}', c.resolution,
                ekb_summary[:200], exist_summary[:200],
                len(c.diff_fields),
            ])

        csv_content = output.getvalue()
        if not output_path:
            output_path = str(BACKUP_ROOT / self.batch.batch_no / 'conflict_report.csv')

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
            f.write(csv_content)
        return output_path

    def _render_html(self, summary, conflicts, stats) -> str:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        rows = []
        for c in conflicts:
            diff_html = ''.join(
                f'<tr><td class="f">{d.get("field","")}</td>'
                f'<td class="e">{str(d.get("ekb",""))[:80]}</td>'
                f'<td class="x">{str(d.get("existing",""))[:80]}</td></tr>'
                for d in (c.diff_fields or [])[:8]
            )
            status_cls = {
                'pending': 'warn', 'use_ekb': 'pri',
                'use_existing': 'sec', 'skip': 'dark',
            }.get(c.resolution, 'light')
            rows.append(f'''<tr>
  <td>{c.id}</td><td><span class="b bm">{c.module}</span></td>
  <td class="lid">{c.ekb_id}</td>
  <td>{c.conflict_type}</td><td>{c.similarity_score:.0%}</td>
  <td><span class="b {status_cls}">{c.resolution}</span></td>
  <td><details><summary>{len(c.diff_fields or [])} 字段差异</summary>
    <table class="dt"><tr><th>字段</th><th>易快报</th><th>新系统</th></tr>{diff_html}
    </table></details></td>
</tr>''')

        return f'''<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8">
<title>易快报数据对账报告 - {self.batch.batch_no}</title>
<style>
body{{font-family:"Microsoft YaHei",Arial,sans-serif;margin:20px;color:#333}}
h1{{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:20px 0}}
.card{{background:#f8f9fa;border-radius:8px;padding:15px;text-align:center;border:1px solid #dee2e6}}
.card .n{{font-size:32px;font-weight:bold;color:#3498db}}.card .l{{color:#6c757d;font-size:14px;margin-top:5px}}
.card.danger .n{{color:#e74c3c}}.card.success .n{{color:#27ae60}}.card.warn2 .n{{color:#f39c12}}
table{{width:100%;border-collapse:collapse;margin:15px 0;font-size:13px}}
th{{background:#3498db;color:white;padding:10px 8px;text-align:left}}
td{{padding:8px;border-bottom:1px solid #dee2e6;vertical-align:top}}
tr:hover{{background:#f5f5f5}}
.b{{padding:3px 8px;border-radius:12px;font-size:11px;font-weight:bold}}
.warn{{background:#ffc107;color:#000}}.pri{{background:#007bff;color:#fff}}
.sec{{background:#6c757d;color:#fff}}.dark{{background:#343a40;color:#fff}}
.bm{{background:#6c5ce7;color:#fff}}.lid{{font-family:monospace;font-size:12px;color:#666}}
.dt{{font-size:11px;margin-top:5px;border:1px solid #ddd}}
.dt th{{background:#f0f0f0;color:#333;padding:4px}}
.dt td{{padding:3px 6px}}.f{{color:#666;font-style:italic}}
.e{{color:#2980b9}}.x{{color:#27ae60}}
.sec2{{background:white;border-radius:8px;padding:20px;margin:20px 0;box-shadow:0 2px 4px rgba(0,0,0,.1)}}
</style></head><body>
<h1>易快报数据对账报告</h1>
<p>批次: <strong>{self.batch.batch_no}</strong> | 阶段: {self.batch.phase} | 生成时间: {now}</p>
<div class="sec2"><h2>数据总览</h2>
<div class="grid">
  <div class="card"><div class="n">{stats["total_raw"]}</div><div class="l">原始数据总量</div></div>
  <div class="card success"><div class="n">{stats["injected"]}</div><div class="l">已成功注入</div></div>
  <div class="card danger"><div class="n">{stats["conflict"]}</div><div class="l">存在冲突</div></div>
  <div class="card warn2"><div class="n">{stats["pending"]}</div><div class="l">待处理</div></div>
  <div class="card"><div class="n">{stats["skipped"]}</div><div class="l">已跳过</div></div>
  <div class="card danger"><div class="n">{stats["failed"]}</div><div class="l">注入失败</div></div>
</div></div>
<div class="sec2"><h2>冲突明细（共 {summary["total"]} 条）</h2>
<p>待审核: <strong style="color:#e74c3c">{summary["pending_count"]} 条</strong></p>
<table><thead><tr>
  <th>ID</th><th>模块</th><th>易快报ID</th><th>冲突类型</th><th>相似度</th><th>状态</th><th>差异</th>
</tr></thead><tbody>
{"".join(rows) if rows else "<tr><td colspan='7' style='text-align:center;color:#999'>暂无冲突记录</td></tr>"}
</tbody></table></div>
<div class="sec2"><h2>处理指南</h2><ul>
  <li><strong>use_ekb</strong>：用易快报数据覆盖新系统记录的差异字段</li>
  <li><strong>use_existing</strong>：保留新系统数据，跳过注入</li>
  <li><strong>manual_merge</strong>：手动编辑合并数据后注入</li>
  <li><strong>skip</strong>：既不注入也不修改</li>
</ul>
<p>审核命令：<code>python manage.py export_ekuaibao_full --resolve-conflicts --batch {self.batch.batch_no}</code></p>
</div></body></html>'''
