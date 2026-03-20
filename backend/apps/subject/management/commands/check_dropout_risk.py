"""
定时检查脱落风险 — 对高风险受试者发送飞书预警通知

建议每日执行一次:
  python manage.py check_dropout_risk
"""
import logging
from django.core.management.base import BaseCommand

logger = logging.getLogger('cn_kis.dropout')


class Command(BaseCommand):
    help = '检查脱落风险并发送预警'

    def add_arguments(self, parser):
        parser.add_argument('--plan-id', type=int, default=None, help='限定招募计划ID')
        parser.add_argument('--threshold', type=float, default=70.0, help='预警阈值(默认70)')

    def handle(self, *args, **options):
        from apps.subject.services.dropout_prediction import batch_predict

        plan_id = options.get('plan_id')
        threshold = options.get('threshold', 70.0)

        self.stdout.write(f'开始脱落风险检查, plan_id={plan_id}, threshold={threshold}')

        results = batch_predict(plan_id=plan_id)
        high_risk = [r for r in results if r['risk_score'] >= threshold]

        if not high_risk:
            self.stdout.write(self.style.SUCCESS('无高风险受试者'))
            return

        self.stdout.write(self.style.WARNING(f'发现 {len(high_risk)} 个高风险受试者'))

        for r in high_risk:
            self._send_alert(r)

        self.stdout.write(self.style.SUCCESS(f'已发送 {len(high_risk)} 条预警'))

    def _send_alert(self, risk_data: dict):
        try:
            from libs.notification import _build_card, _safe_send
            import os

            top_factors = sorted(risk_data['factors'], key=lambda f: f['score'], reverse=True)[:3]
            factor_text = '、'.join(f"{f['name']}({f['detail']})" for f in top_factors)

            card = _build_card(
                title='脱落风险预警',
                color='red',
                fields=[
                    {'name': '受试者ID', 'value': str(risk_data['subject_id'])},
                    {'name': '风险分数', 'value': f"{risk_data['risk_score']}/100"},
                    {'name': '风险等级', 'value': risk_data['risk_level']},
                    {'name': '主要因素', 'value': factor_text[:100]},
                    {'name': '建议', 'value': risk_data['recommendation'][:80]},
                ],
                note='CN KIS 脱落预测 - 请及时关注并采取挽留措施',
            )

            chat_id = os.getenv('NOTIFICATION_CHAT_ID', '')
            if chat_id:
                _safe_send(chat_id, 'interactive', card)
                logger.info(f'脱落预警已发送: subject_id={risk_data["subject_id"]}, score={risk_data["risk_score"]}')
        except Exception as e:
            logger.warning(f'脱落预警发送失败: {e}')
