"""
月度报表自动生成命令

用法: python manage.py generate_monthly_report [--year YYYY] [--month MM] [--export]
"""
from datetime import date
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '生成月度/季度财务报表'

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, default=None, help='报表年份（默认当前年）')
        parser.add_argument('--month', type=int, default=None, help='报表月份（默认上月）')
        parser.add_argument('--quarterly', action='store_true', help='同时生成季度报表')
        parser.add_argument('--export', action='store_true', help='同时导出 Excel')

    def handle(self, *args, **options):
        today = date.today()
        year = options['year'] or today.year
        month = options['month']

        if month is None:
            if today.month == 1:
                year = today.year - 1
                month = 12
            else:
                month = today.month - 1

        self.stdout.write(f'生成 {year}年{month}月 月度经营报表...')

        from apps.finance.services.report_engine import (
            collect_monthly_operation_report,
            export_report_excel,
        )
        from apps.finance.services.analysis_service import generate_financial_report

        report_data = collect_monthly_operation_report(year, month)

        report_no = f'RPT-M-{year}{month:02d}'
        report_name = f'{year}年{month}月 月度经营报表'
        period_start = date(year, month, 1)
        from dateutil.relativedelta import relativedelta
        period_end = period_start + relativedelta(months=1) - relativedelta(days=1)

        report = generate_financial_report(
            report_no=report_no,
            report_name=report_name,
            report_type='monthly',
            period_start=period_start,
            period_end=period_end,
        )
        self.stdout.write(self.style.SUCCESS(f'月度报表已生成: {report.report_no}'))

        if options['export']:
            excel_bytes = export_report_excel(report_data)
            filename = f'report_{year}_{month:02d}.xlsx'
            with open(filename, 'wb') as f:
                f.write(excel_bytes)
            self.stdout.write(self.style.SUCCESS(f'Excel 已导出: {filename}'))

        if options['quarterly']:
            quarter = (month - 1) // 3 + 1
            if month % 3 == 0:
                self.stdout.write(f'生成 {year}年Q{quarter} 季度报表...')
                from apps.finance.services.report_engine import collect_quarterly_operation_report
                q_data = collect_quarterly_operation_report(year, quarter)
                q_no = f'RPT-Q-{year}Q{quarter}'
                q_name = f'{year}年第{quarter}季度 经营报表'
                q_start = date(year, (quarter - 1) * 3 + 1, 1)
                q_end = q_start + relativedelta(months=3) - relativedelta(days=1)
                q_report = generate_financial_report(
                    report_no=q_no, report_name=q_name,
                    report_type='quarterly',
                    period_start=q_start, period_end=q_end,
                )
                self.stdout.write(self.style.SUCCESS(f'季度报表已生成: {q_report.report_no}'))

                if options['export']:
                    q_excel = export_report_excel(q_data)
                    q_filename = f'report_{year}_Q{quarter}.xlsx'
                    with open(q_filename, 'wb') as f:
                        f.write(q_excel)
                    self.stdout.write(self.style.SUCCESS(f'季度 Excel 已导出: {q_filename}'))
            else:
                self.stdout.write(f'月份 {month} 不是季末月，跳过季度报表')

        self.stdout.write(self.style.SUCCESS('报表生成完成'))
