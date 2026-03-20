from datetime import datetime
from typing import Optional, Dict, Any

from ninja import Router, Schema

from .models import DeviceReading

router = Router()


class DeviceReadingIn(Schema):
    device_id: str
    reading_type: str
    value: float
    timestamp: datetime
    unit: Optional[str] = ''
    payload: Optional[Dict[str, Any]] = None
    source: Optional[str] = 'https_push'


@router.post('/readings', auth=None, summary='接收设备读数')
def create_device_reading(request, data: DeviceReadingIn):
    """
    设备侧通过 HTTPS 推送读数。
    可通过 X-IOT-KEY 做轻量校验。
    """
    from django.conf import settings

    required_key = str(getattr(settings, 'IOT_INGEST_KEY', '') or '').strip()
    if required_key:
        header_key = str(request.META.get('HTTP_X_IOT_KEY', '') or '').strip()
        if header_key != required_key:
            return 401, {'code': 401, 'msg': 'IOT key 无效', 'data': None}

    item = DeviceReading.objects.create(
        device_id=data.device_id.strip(),
        reading_type=data.reading_type.strip(),
        value=data.value,
        unit=(data.unit or '').strip(),
        timestamp=data.timestamp,
        payload=data.payload or {},
        source=(data.source or 'https_push').strip() or 'https_push',
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': item.id,
            'device_id': item.device_id,
            'reading_type': item.reading_type,
            'value': item.value,
            'unit': item.unit,
            'timestamp': item.timestamp.isoformat(),
        },
    }
