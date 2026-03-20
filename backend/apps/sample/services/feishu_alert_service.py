"""飞书预警推送服务 — 效期/低库存/温度异常消息卡片"""
import json
import logging
from datetime import date
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger('material.feishu_alert')


class _FeishuAlertService:
    """通过飞书消息卡片推送物料预警"""

    def _build_card(self, title: str, color: str, fields: list, action_url: str = None) -> dict:
        """构建飞书消息卡片"""
        elements = []

        for field in fields:
            elements.append({
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**{field['label']}**：{field['value']}"
                }
            })

        if action_url:
            elements.append({
                "tag": "action",
                "actions": [{
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": "查看详情"},
                    "type": "primary",
                    "url": action_url,
                }]
            })

        return {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {"tag": "plain_text", "content": title},
                    "template": color,
                },
                "elements": elements,
            }
        }

    def push_expiry_alert(self, product_name: str, batch_no: str, expiry_date: str,
                          days_remaining: int, webhook_url: str = None) -> dict:
        """推送效期预警"""
        color = "red" if days_remaining <= 7 else "orange" if days_remaining <= 30 else "yellow"
        urgency = "紧急" if days_remaining <= 7 else "警告" if days_remaining <= 30 else "提醒"

        card = self._build_card(
            title=f"⚠️ 效期预警 [{urgency}]",
            color=color,
            fields=[
                {"label": "产品", "value": product_name},
                {"label": "批号", "value": batch_no},
                {"label": "有效期至", "value": expiry_date},
                {"label": "剩余天数", "value": f"{days_remaining} 天"},
                {"label": "预警时间", "value": timezone.now().strftime('%Y-%m-%d %H:%M')},
            ],
            action_url="/material/expiry-alerts",
        )

        return self._send_or_log(card, webhook_url, 'expiry_alert')

    def push_low_stock_alert(self, consumable_name: str, current_stock: int,
                              min_stock: int, unit: str, webhook_url: str = None) -> dict:
        """推送低库存预警"""
        card = self._build_card(
            title="📦 低库存预警",
            color="orange",
            fields=[
                {"label": "耗材", "value": consumable_name},
                {"label": "当前库存", "value": f"{current_stock} {unit}"},
                {"label": "最低库存", "value": f"{min_stock} {unit}"},
                {"label": "缺口数量", "value": f"{min_stock - current_stock} {unit}"},
                {"label": "预警时间", "value": timezone.now().strftime('%Y-%m-%d %H:%M')},
            ],
            action_url="/material/consumables",
        )

        return self._send_or_log(card, webhook_url, 'low_stock_alert')

    def push_temperature_alert(self, location_name: str, temperature: float,
                                upper_limit: float, lower_limit: float,
                                webhook_url: str = None) -> dict:
        """推送温度异常预警"""
        direction = "高于上限" if temperature > upper_limit else "低于下限"
        limit = upper_limit if temperature > upper_limit else lower_limit

        card = self._build_card(
            title="🌡️ 温度异常预警",
            color="red",
            fields=[
                {"label": "存储位置", "value": location_name},
                {"label": "当前温度", "value": f"{temperature}°C"},
                {"label": "异常类型", "value": f"{direction} ({limit}°C)"},
                {"label": "偏差值", "value": f"{abs(temperature - limit):.1f}°C"},
                {"label": "预警时间", "value": timezone.now().strftime('%Y-%m-%d %H:%M')},
            ],
            action_url="/material/temperature",
        )

        return self._send_or_log(card, webhook_url, 'temperature_alert')

    def _send_or_log(self, card: dict, webhook_url: str = None, alert_type: str = '') -> dict:
        """发送到飞书或记录日志"""
        if webhook_url:
            try:
                import requests
                resp = requests.post(webhook_url, json=card, timeout=10)
                return {
                    'status': 'sent',
                    'alert_type': alert_type,
                    'response_code': resp.status_code,
                    'timestamp': timezone.now().isoformat(),
                }
            except Exception as e:
                logger.error(f"Failed to send Feishu alert: {e}")
                return {'status': 'failed', 'alert_type': alert_type, 'error': str(e)}
        else:
            logger.info(f"Feishu alert ({alert_type}): {json.dumps(card, ensure_ascii=False)[:200]}")
            return {
                'status': 'logged',
                'alert_type': alert_type,
                'message': '未配置 webhook，已记录日志',
                'timestamp': timezone.now().isoformat(),
            }

    def check_and_push_all_alerts(self, webhook_url: str = None) -> dict:
        """检查所有预警条件并推送"""
        from apps.sample.models_material import Consumable
        from apps.sample.models_product import ProductBatch

        results = {'expiry': [], 'low_stock': [], 'temperature': []}

        try:
            expiring_batches = ProductBatch.objects.filter(
                status__in=['received', 'released'],
            ).exclude(expiry_date=None).select_related('product')

            for batch in expiring_batches:
                if batch.expiry_date:
                    days = (batch.expiry_date - date.today()).days
                    if days <= 30:
                        product_name = batch.product.name if batch.product_id else str(batch.product_id)
                        r = self.push_expiry_alert(
                            product_name=product_name,
                            batch_no=batch.batch_no,
                            expiry_date=str(batch.expiry_date),
                            days_remaining=days,
                            webhook_url=webhook_url,
                        )
                        results['expiry'].append(r)
        except Exception as e:
            logger.error(f"Expiry check failed: {e}")

        try:
            low_stock = Consumable.objects.filter(
                current_stock__lt=F('safety_stock'),
                is_deleted=False,
            )
            for item in low_stock:
                r = self.push_low_stock_alert(
                    consumable_name=item.name,
                    current_stock=item.current_stock,
                    min_stock=item.safety_stock,
                    unit=item.unit or '个',
                    webhook_url=webhook_url,
                )
                results['low_stock'].append(r)
        except Exception as e:
            logger.error(f"Low stock check failed: {e}")

        return {
            'checked_at': timezone.now().isoformat(),
            'expiry_alerts': len(results['expiry']),
            'low_stock_alerts': len(results['low_stock']),
            'temperature_alerts': len(results['temperature']),
            'details': results,
        }


feishu_alert_service = _FeishuAlertService()
